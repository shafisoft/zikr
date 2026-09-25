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

- **`public` — the ONLY exposed schema** (Settings → API → Exposed schemas).
  Two independent reasons, never trade one for the other:
  1. *Security*: `zikr_app` tables must have no REST endpoints.
  2. *Correctness*: with more than one schema exposed, PostgREST serves the
     FIRST as the default profile and every un-profiled `/rpc/*` call 404s
     with PGRST202 even though the functions exist. This regressed on
     production more than once — see "Troubleshooting" in `README.md`.

### RPCs — exactly thirteen, granted to `anon, authenticated`

| Function | Signature | Client caller |
|---|---|---|
| `get_group_state` | `(text)` | sharedRoom |
| `create_group` | `(text, text, jsonb)` | sharedRoom |
| `join_group` | `(text, text)` | sharedRoom |
| `create_plan` | `(text, jsonb)` | sharedRoom |
| `end_plan` | `(text, uuid)` | sharedRoom |
| `contribute` | `(text, uuid, text, integer, uuid)` | sharedRoom |
| `remove_member` | `(text, uuid)` | sharedRoom |
| `leave_group` | `(text)` | sharedRoom |
| `close_group` | `(text)` | sharedRoom |
| `get_or_create_device_token` | `()` | sharedRoom |
| `track_event` | `(text, jsonb)` | sharedRoom |
| `share_zikr` | `(text, text, text)` | zikrSync |
| `pull_verified_zikrs` | `(timestamptz, uuid)` | zikrSync |

The mapping is 1:1 — every granted RPC has a client caller, every client
call has a grant. The client makes **zero** table requests (no `.from()`
anywhere) and uses no realtime, storage, or edge functions. Adding a
fourteenth function requires a deliberate edit to this list — and to the
typed RPC surface in `src/core/services/supabaseTypes.ts`, whose
`SupabaseRpc` map carries every function's parameter names and return
shape, so client/backend drift fails the build instead of the user.

### Auth

- **Anonymous sign-in only** (`signInAnonymously`); no email/OAuth providers
  needed by the app.
- Cloudflare Turnstile CAPTCHA is optional but recommended: setting
  `VITE_TURNSTILE_SITE_KEY` in the client env implies captcha protection is
  enabled server-side (Authentication → Settings → CAPTCHA). The pair must
  be flipped together.

### Housekeeping

- `purge_expired()` → `service_role` ONLY (pg_cron or an external keep-alive
  job). Never to `anon`/`authenticated`.

## 2. What is NOT exposed — never

- **`zikr_app` tables** (groups, members, devices, analytics_events, plans,
  plan_zikrs, plan_owners, plan_contributions, shared_zikrs): no REST
  endpoints, ever. Dashboard/SQL/service-role only.
- **`zikr_app` helper functions** (`random_*`, `is_*`, `group_member_count`,
  `plan_period_start`, `insert_plan`, `bump_zikr_total`, `set_plan_ended`,
  the `shared_zikrs_touch` trigger fn): internal, schema is API-invisible.
- **`plan_daily_totals`**: no RLS policies at all = denied to every API
  role; written only inside the service-role/definer purge.
- **Unverified `shared_zikrs` rows**: visible to nobody but the submitter
  (enforced by policy once T3 below lands; today only inside the RPC).
- **`public` tables**: the `public` schema contains functions only — never
  create a table there; it would be REST-served instantly.
- **Anything service_role**: `purge_expired()` and future admin surfaces are
  never granted to app roles.

## 3. How MUCH is exposed — least-privilege mechanics

1. **Deny by default.** `revoke execute on all functions in schema public`
   precedes the per-function grant list. Keep the pattern: a function is
   callable only if it appears in the grant block above.
2. **Three scoped layers per app-facing RPC.** `security invoker` +
   `set search_path = public`; RLS does row authorization; table grants are
   column-scoped. The `raise exception 'snake_code'` checks inside the
   bodies exist for the client's error protocol (RLS only filters rows, it
   cannot produce app error codes).
3. **Internal helpers are `security definer`**, pinned `search_path`,
   living in `zikr_app` — invisible to the API and immune to RLS recursion.
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

6. **Deliberately permissive SELECT policies are load-bearing.**
   `groups readable` / `plans readable` / `plan zikrs readable` /
   `plan owners readable` use `using (true)` because the invoker RPCs must
   resolve a group by code *before* membership exists (join flow). Do not
   "tighten" them to membership checks — that breaks join. Tightening that
   layer requires converting the read RPCs to `security definer` with strict
   code-gating, a trade-off consciously rejected for now (definer reads
   would bypass RLS and move all authorization into function bodies).

## 4. Invariants — checklist for ANY server-side change

- [ ] Exposed schemas still `public` ONLY (check FIRST when anything 404s
      with PGRST202; it has drifted more than once).
- [ ] EXECUTE surface is still exactly the 13 + `service_role` purge —
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
- [ ] A new table ships with: `zikr_app` schema, RLS enabled on arrival,
      column-scoped grants (or none), and a row in section 3.5.
- [ ] Client still performs zero table access — any `.from()` call is a
      ruleset violation.

## 5. Tightening backlog (prioritized)

- **T1 — Make "new functions private on arrival" real.** Add
  `alter default privileges for role <migration-role> in schema public
  revoke execute on functions from public, anon, authenticated;`
  (and for `supabase_admin`, which owns dashboard-created SQL). Without it,
  any function created later is callable by anon until manually revoked —
  the revoke blocks in the migrations are snapshots, not policy.
- **T2 — Drop the dead member arm of the group UPDATE policy.**
  `"owner or member updates group"` lets any active member change
  `groups.status`; the only statement that updates groups is `close_group`,
  which already filters `owner_id = auth.uid()` in its WHERE. Tighten the
  policy to owner-only. Zero functional impact.
- **T3 — Scope the `shared_zikrs` SELECT policy** to
  `using (verified or submitted_by = auth.uid())`. Today `using (true)`
  would expose unverified submissions if the schema were ever (mis)exposed;
  the verified filter currently lives only inside `pull_verified_zikrs`.
- **T4 — Cap the analytics payload.** `track_event` truncates `p_name` but
  inserts `properties` unbounded. Add a table constraint:
  `check (jsonb_typeof(properties) = 'object' and pg_column_size(properties) <= 4096)`.
- **T5 — Per-submitter cap on `share_zikr`** (optional): an RLS
  `with check` subquery limiting pending (unverified) rows per uid, or
  accept the risk — captcha + the 180-day purge bound the spam.
- **T6 — Live-database drift audit.** `check:migrations` guards file parity
  only. Add a small read-only audit script (catalog queries + an HTTP probe
  with the anon key asserting zikr_app tables are not served) to catch
  dashboard drift: stray grants, extra exposed schemas, functions with
  PUBLIC execute.
- **T7 — API hygiene:** `end_plan` ignores `p_code` (ownership is checked
  against the plan only). Validate or drop the parameter in the next
  protocol revision.

## 6. Accepted risks — explicit, do not "fix" silently

- **Honor-system counts.** Any member may `contribute` delta ≤ 10000 with
  no ceiling on call volume. This is the product premise (manual entry for
  a physical tasbeeh); group trust is the integrity model.
- **Code-gated reads.** `get_group_state` reveals plans, titles, and totals
  to anyone holding the 6-char code (31⁶ ≈ 887M combinations) — required by
  the join preview. Member names + user_ids are visible to members
  (user_ids are what `remove_member` targets); RLS hides the roster from
  non-members.
- **Unlimited anonymous identities.** Anyone can mint anon users and create
  groups/events/subscriptions at will. Turnstile raises the cost; Supabase
  auth rate limits are the backstop; no further mitigation is planned under
  the $0 constraint.
