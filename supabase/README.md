# Supabase — Shared Goals backend

The shared-goals (rooms) feature uses a Supabase project as its sync backend.
See `docs/SharedGoals-Design.md` for the full design.

## Setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is sufficient).
2. In **Authentication → Providers**, enable **Anonymous sign-in** (required —
   this is how the app works without logins).
3. Apply the single migration `migrations/0001_init.sql` in the Supabase
   dashboard (**SQL Editor**), or via the CLI with `supabase db push` after
   linking your project.
4. Leave **Settings → API → Exposed schemas** at its default (`public`
   only). Do NOT add `zikr_app`: the tables live there and must have no REST
   endpoints. All app calls go to the thirteen `public.*` RPC functions,
   which the migrations grant explicitly after revoking EXECUTE from
   everything else in the schema (see `EXPOSURE-RULES.md` for the full
   surface, its rules, and the tightening backlog).
5. Optionally enable the `pg_cron` extension and uncomment the
   `cron.schedule` line at the bottom of `0001_init.sql` to auto-purge — or
   call `public.purge_expired()` from your project's keep-alive job using
   the **service role key** (it also prunes analytics events older than 90
   days and stale unverified submissions; app clients cannot call it).
6. Copy the project URL and anon key into the app's environment:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

## CAPTCHA protection (recommended for public deployments)

The anon key is public by design, so anyone can script anonymous sign-ins.
CAPTCHA makes that expensive:

1. Create a **Cloudflare Turnstile** widget (free) at
   [dash.cloudflare.com](https://dash.cloudflare.com/?to=/:account/turnstile)
   and note the **site key** and **secret key**.
2. In Supabase: **Authentication → Settings → CAPTCHA protection** — enable
   it, choose **Cloudflare Turnstile**, paste the **secret key**. This guards
   the signup endpoint, which anonymous sign-in uses.
3. Put the **site key** in the app env as `VITE_TURNSTILE_SITE_KEY` (and in
   the GitHub `VITE_TURNSTILE_SITE_KEY` variable for deploys). The app then
   attaches a fresh token to every `signInAnonymously()` call.
4. Leave `VITE_TURNSTILE_SITE_KEY` empty in dev if your local project has
   captcha disabled — the client skips the token entirely in that case.

## Local migration validation (Docker)

`docker-compose.yml` + `local-test/` boot a real Postgres 15 with the
Supabase pieces our SQL relies on (the API roles, `auth.uid()` reading the
JWT claims GUC, `auth.users`), then auto-apply every file in `migrations/`
in order — so RLS policies, functions, grants, and triggers are validated
against real engine behavior before touching the cloud project.

```bash
cd supabase
docker compose up -d --wait
docker compose logs db | grep "local-test: ready"   # wait for init to finish
docker compose exec -T db psql -U postgres -d zikr_local \
  -v ON_ERROR_STOP=1 < local-test/example.tests.sql
```

- **Reset:** `docker compose down -v` (wipes the volume; next `up` re-applies
  from scratch).
- **Impersonate a client** in your own test SQL — this is the whole trick:

  ```sql
  insert into auth.users (id) values ('<fixed-uuid>');
  set request.jwt.claims = '{"sub":"<fixed-uuid>"}';
  set role authenticated;   -- now RLS + invoker RPCs behave like production
  ```

- `local-test/example.tests.sql` is a working reference (happy paths +
  authorization negatives for every RPC); keep it or per-feature test files
  in sync with schema changes.
- Init runs only on an empty volume — after changing a migration, reset
  with `down -v` first.

## Security model

- Tables (groups, members, plans, plan_zikrs, plan_owners,
  plan_contributions, devices, analytics_events, shared_zikrs) live in
  `zikr_app` with RLS policies doing row-level authorization (ownership,
  membership, own-device rows). The schema is not exposed to the API, so the
  tables have no REST endpoints.
- The RPCs in `public` are `security invoker`: they run with the caller's
  privileges, so the migration's scoped table grants + RLS authorize every
  statement. Functions also raise app-specific errors (`group_full`,
  `window_ended`, `not_owner`, …) that the client maps to messages.
- Cross-table helpers (membership checks, member counts) live in `zikr_app`
  as small `security definer` functions — invisible to the API, and immune
  to RLS recursion in policies.
- `purge_expired()` is `security definer` and granted to `service_role`
  only.

The anon key is safe to ship: it only works through the thirteen granted
RPCs, and the backend never stores per-member contribution data (see the
design doc). The complete exposure policy — what is exposed, what never is,
and where it can be tightened — lives in `EXPOSURE-RULES.md`.

## Shared zikr library (0002_shared_zikrs.sql)

Crowdsourced zikr definitions with admin moderation:

1. Clients submit custom zikrs via `public.share_zikr(name, arabic, translation)`
   — rows land with `verified = false` and are invisible to other users.
2. **Verification is manual:** review `zikr_app.shared_zikrs` where
   `verified = false` in the Table Editor, fix texts if needed, and set
   `verified = true` + `verified_at = now()` (any UPDATE bumps `updated_at`
   automatically via trigger — that is what re-delivers the row to clients
   that already pulled it).
3. Clients pull via `public.pull_verified_zikrs(cursor_updated_at, cursor_id)`
   — cursor-paginated on `(updated_at, id)`, 100 rows per call. The client
   loops while `hasMore` and stores the cursor for incremental syncs.

Rejected submissions: just delete the row (or leave it — `purge_expired()`
removes unverified rows older than 180 days). Duplicate names are rejected
case-insensitively by a unique index.

## Troubleshooting "everything 404s"

If Groups and Library sync fail at once with

```
404 {"code":"PGRST202","details":"Searched for the function zikr_app.…"}
```

the **Exposed schemas** setting drifted: the schema name in the error
(`zikr_app.<fn>` instead of `public.<fn>`) is the giveaway. Fix:
**Settings → API → Exposed schemas → `public` ONLY** (remove everything
else; `Accept-Profile: public` cannot rescue a schema that is not
exposed). This has regressed more than once — check it first.

After restoring exposure, re-run the current `migrations/0002_shared_zikrs.sql`
if Library sync fails with `42P01 relation "page" does not exist` (an
older body of `pull_verified_zikrs` referenced its CTE outside the CTE's
statement — fixed in the current file, which is idempotent).
