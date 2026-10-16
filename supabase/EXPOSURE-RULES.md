# Supabase exposure ruleset

Canonical policy for what the Supabase project exposes to the public API,
derived from an audit of the client requirements
(`src/core/services/sharedRoom/supabaseBackend.ts`,
`src/core/services/zikrSync/supabaseBackend.ts`) against the migrations
(`supabase/migrations/0001_init.sql`, `0002_shared_zikrs.sql`,
`0002_group_plans.sql`). Every server-side change must keep this file true.

## 0. Threat model, in one line

The anon key ships in the browser bundle and is **public by design**; every
rule below assumes a hostile actor scripting the REST API with it. The
$0/month constraint means no WAF and no custom rate limiting — least surface
is the control. Nothing in the data model is secret per se (dzikr counts,
group titles, display names), but rosters, device keys, and raw analytics
must not be enumerable.

## 1. What IS exposed — the closed list

### Schemas

- **`zikr` — the product schema on the shared platform project** (listed in
  the Data API exposure list alongside the sibling products; see the
  co-living section in `README.md`). The standalone-project era ran with
  `public` as the only exposed schema; consolidation (2026-10-14) moved the
  RPCs to `zikr` (all `zikr_`-prefixed) and the client sends
  `Content-Profile: zikr` on every call. Two rules carry over unchanged:
  1. *Security*: `zikr_private` tables must have no REST endpoints.
  2. *Correctness*: PostgREST serves the FIRST exposed schema as the
     default profile — an un-profiled `/rpc/*` call searches `donate`, not
     `zikr`, and 404s with PGRST202 even though the function exists.

### RPCs — exactly fourteen, granted to `anon, authenticated`

| Function | Signature | Client caller |
|---|---|---|
| `zikr_get_group_state` | `(text)` | sharedRoom |
| `zikr_create_group` | `(text, text, jsonb)` | sharedRoom |
| `zikr_join_group` | `(text, text)` | sharedRoom |
| `zikr_create_plan` | `(text, jsonb)` | sharedRoom |
| `zikr_end_plan` | `(text, uuid)` | sharedRoom |
| `zikr_contribute` | `(text, uuid, text, integer, uuid)` | sharedRoom |
| `zikr_remove_member` | `(text, uuid)` | sharedRoom |
| `zikr_leave_group` | `(text)` | sharedRoom |
| `zikr_close_group` | `(text)` | sharedRoom |
| `zikr_get_or_create_device_token` | `()` | sharedRoom |
| `zikr_track_event` | `(text, jsonb)` | sharedRoom |
| `zikr_share_zikr` | `(text, text, text)` | zikrSync |
| `zikr_pull_verified_zikrs` | `(timestamptz, uuid)` | zikrSync |
| `zikr_submit_feedback` | `(text, text, text, text, text, text, text)` | feedback |

The mapping is 1:1 — every granted RPC has a client caller, every client
call has a grant. The client makes **zero** table requests (no `.from()`
anywhere) and uses no realtime, storage, or edge functions. Adding a
fifteenth function requires a deliberate edit to this list — and to the
typed RPC surface in `src/core/services/supabaseTypes.ts`, whose
`SupabaseRpc` map carries every function's parameter names and return
shape, so client/backend drift fails the build instead of the user.

### Auth

- **Anonymous sign-in only** (`signInAnonymously`); no email/OAuth providers
  needed by the app.
- Cloudflare Turnstile CAPTCHA is optional but recommended: setting
  `VITE_TURNSTILE_SITE_KEY` in the client env implies captcha protection is
  enabled server-side (Authentication → Settings → CAPTCHA). The pair must
  be flipped together. The SAME pair protects the feedback RPC: when a
  Turnstile secret is configured under key `turnstile_secret` in
  `zikr_private.app_config`, `zikr_submit_feedback` verifies a fresh token against
  Cloudflare siteverify via the `http` extension (fail-closed: a configured
  secret with a missing token, missing extension, or unreachable siteverify
  rejects). With no secret configured, verification is skipped — feedback
  still requires an authenticated (anon) session and is rate-limited.

### Housekeeping

- `zikr_purge_expired()` → `service_role` ONLY (pg_cron or an external keep-alive
  job). Never to `anon`/`authenticated`.

## 2. What is NOT exposed — never

- **`zikr_private` tables** (groups, members, devices, analytics_events, plans,
  plan_zikrs, plan_owners, plan_contributions, shared_zikrs, feedback,
  app_config): no REST endpoints, ever. Dashboard/SQL/service-role only.
- **`zikr_private` helper functions** (`random_*`, `is_*`, `group_member_count`,
  `plan_period_start`, `insert_plan`, `bump_zikr_total`, `set_plan_ended`,
  `verify_turnstile`, the `shared_zikrs_touch` trigger fn): internal,
  schema is API-invisible. `app_config` (Turnstile secret + future
  deployment config) is likewise dashboard/definer-only: RLS on, no
  policies, no grants.
- **`plan_daily_totals`**: no RLS policies at all = denied to every API
  role; written only inside the service-role/definer purge.
- **Unverified `shared_zikrs` rows**: visible to nobody but the submitter
  (enforced by policy once T3 below lands; today only inside the RPC).
- **`public` tables**: the `public` schema contains functions only — never
  create a table there; it would be REST-served instantly.
- **Anything service_role**: `zikr_purge_expired()` and future admin surfaces are
  never granted to app roles.

## 3. How MUCH is exposed — least-privilege mechanics

1. **Deny by default.** `revoke execute on all functions in schema zikr`
   plus the `alter default privileges` revoke (see T1, done 2026-10-14)
   precede the per-function grant list. Keep the pattern: a function is
   callable only if it appears in the grant block above.
2. **Three scoped layers per app-facing RPC.** `security invoker` +
   `set search_path = zikr, zikr_private, extensions`; RLS does row authorization; table grants are
   column-scoped. The `raise exception 'snake_code'` checks inside the
   bodies exist for the client's error protocol (RLS only filters rows, it
   cannot produce app error codes).
3. **Internal helpers are `security definer`**, pinned `search_path`,
   living in `zikr_private` — invisible to the API and immune to RLS recursion.
4. **Append-only data flows.** Contributions are insert-only with an
   idempotency PK (`event_id`); no table carries a general UPDATE or DELETE
   grant — only the scoped columns (`groups.status`,
   `members.name/joined_at/removed_at`, `devices.last_seen_at`,
   `plans.total`); deletes happen only inside the definer purge.
5. **Table-grant inventory** (the complete list, mirrors the migration):

   | Table | Grants to anon+authenticated |
   |---|---|
   | `groups` | select, insert, update(status) |
   | `members` | select, insert, update(name, joined_at, removed_at) |
   | `devices` | select, insert, update(last_seen_at) |
   | `analytics_events` | insert |
   | `plans` | select, update(total) |
   | `plan_zikrs` | select |
   | `plan_owners` | select |
   | `plan_contributions` | select, insert |
   | `plan_daily_totals` | none |
   | `shared_zikrs` | select, insert |
   | `feedback` | select, insert |
   | `app_config` | none |

6. **Deliberately permissive SELECT policies are load-bearing.**
   `groups readable` / `plans readable` / `plan zikrs readable` /
   `plan owners readable` use `using (true)` because the invoker RPCs must
   resolve a group by code *before* membership exists (join flow). Do not
   "tighten" them to membership checks — that breaks join. Tightening that
   layer requires converting the read RPCs to `security definer` with strict
   code-gating, a trade-off consciously rejected for now (definer reads
   would bypass RLS and move all authorization into function bodies).

## 4. Invariants — checklist for ANY server-side change

- [ ] The shared exposure list still contains `zikr` and the client still
      sends `Content-Profile: zikr` (check FIRST when anything 404s with
      PGRST202: an un-profiled call searches `donate`, the default profile).
- [ ] EXECUTE surface is still exactly the 14 + `service_role` purge —
      verify via `information_schema.routine_privileges`, not by memory.
- [ ] Every new function is **born private**: Postgres grants EXECUTE to
      PUBLIC at CREATE time by default, so the migration-time revoke is a
      snapshot. T1 (default privileges) must be in place, or each new
      function needs its own explicit revoke.
- [ ] Function bodies byte-identical across `0001_init.sql` and
      `0002_group_plans.sql` — `npm run check:migrations` (part of
      `npm run lint`) enforces it; edit one, mirror the other.
- [ ] A new app-facing RPC ships with: the explicit grant, a
      `mapServerError` mapping in the client backend, a negative
      authorization test in `supabase/local-test/`, and an update to the
      table in section 1 of this file.
- [ ] A new table ships with: `zikr_private` schema, RLS enabled on arrival,
      column-scoped grants (or none), and a row in section 3.5.
- [ ] Client still performs zero table access — any `.from()` call is a
      ruleset violation.

## 5. Tightening backlog (prioritized)

- **T1 — DONE 2026-10-14.** The consolidated init carries
  `alter default privileges for role postgres in schema zikr revoke
  execute on functions from public, anon, authenticated;`. Remaining gap:
  `supabase_admin`-created functions (dashboard SQL) on the hosted project
  are not covered by postgres default privileges — revoke manually if any
  the revoke blocks in the migrations are snapshots, not policy.
- **T2 — Drop the dead member arm of the group UPDATE policy.**
  `"owner or member updates group"` lets any active member change
  `groups.status`; the only statement that updates groups is `zikr_close_group`,
  which already filters `owner_id = auth.uid()` in its WHERE. Tighten the
  policy to owner-only. Zero functional impact.
- **T3 — Scope the `shared_zikrs` SELECT policy** to
  `using (verified or submitted_by = auth.uid())`. Today `using (true)`
  would expose unverified submissions if the schema were ever (mis)exposed;
  the verified filter currently lives only inside `zikr_pull_verified_zikrs`.
- **T4 — Cap the analytics payload.** `zikr_track_event` truncates `p_name` but
  inserts `properties` unbounded. Add a table constraint:
  `check (jsonb_typeof(properties) = 'object' and pg_column_size(properties) <= 4096)`.
- **T5 — Per-submitter cap on `zikr_share_zikr`** (optional): an RLS
  `with check` subquery limiting pending (unverified) rows per uid, or
  accept the risk — captcha + the 180-day purge bound the spam.
- **T6 — Live-database drift audit.** `check:migrations` guards file parity
  only. Add a small read-only audit script (catalog queries + an HTTP probe
  with the anon key asserting zikr_private tables are not served) to catch
  dashboard drift: stray grants, extra exposed schemas, functions with
  PUBLIC execute.
- **T7 — API hygiene:** `zikr_end_plan` ignores `p_code` (ownership is checked
  against the plan only). Validate or drop the parameter in the next
  protocol revision.

## 6. Accepted risks — explicit, do not "fix" silently

- **Honor-system counts.** Any member may `zikr_contribute` delta ≤ 10000 with
  no ceiling on call volume. This is the product premise (manual entry for
  a physical tasbeeh); group trust is the integrity model.
- **Code-gated reads.** `zikr_get_group_state` reveals plans, titles, and totals
  to anyone holding the 6-char code (31⁶ ≈ 887M combinations) — required by
  the join preview. Member names + user_ids are visible to members
  (user_ids are what `zikr_remove_member` targets); RLS hides the roster from
  non-members.
- **Unlimited anonymous identities.** Anyone can mint anon users and create
  groups/events/subscriptions at will. Turnstile raises the cost; Supabase
  auth rate limits are the backstop; no further mitigation is planned under
  the $0 constraint.
