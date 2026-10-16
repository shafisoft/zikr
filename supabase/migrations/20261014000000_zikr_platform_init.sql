-- ============================================================
-- Zikr backend — consolidated platform init (shared Supabase project).
--
-- Single canonical migration for the co-living deployment (see
-- PLAYBOOK.md in the platform repo; registry: SCHEMAS.md). Fresh
-- environments run ONLY this file. The standalone single-project
-- stream (0001–0004) is retired to _archive_standalone/ — it served
-- zikr's own hosted project where `public` was the only exposed
-- schema.
--
-- Posture (standard platform layout; the tables schema moved to the
-- `<product>_private` standard by owner decision 2026-10-16, before
-- hosted cutover):
--   * API surface = schema `zikr`, FUNCTIONS ONLY, all names prefixed
--     `zikr_` (the shared role search_path chain starts with zikr, so
--     the prefix also stops these names from shadowing sibling
--     products' objects).
--   * Tables + internal helpers live in `zikr_private` — never exposed;
--     zero REST endpoints (the platform `<product>_private` standard,
--     matching prep_app/ledger/officerider/pcare).
--   * SECURITY INVOKER model retained deliberately: the RPCs run with
--     the caller's privileges, so scoped table grants + RLS in
--     `zikr_private` authorize every statement. The permissive
--     using(true) SELECT policies are load-bearing for the code-gated
--     join flow (see EXPOSURE-RULES.md §3.6). This is a recorded
--     exception to the platform's definer-function default.
--   * `zikr` MUST be listed in the Data API exposure list
--     (PGRST_DB_SCHEMAS locally; the hosted PATCH list). Client calls
--     MUST send the `Content-Profile: zikr` header (supabase-js
--     `.schema('zikr')`).
--   * History: the retired standalone stream created the tables under
--     the retired app-schema name out-of-band on the hosted project
--     (live rows dumped to the zikr repo's backup/ and reloaded into
--     `zikr_private` at cutover); the quarantined legacy schema there
--     is droppable after the cut.
--   * Auth: anonymous sign-in (project-wide setting). Every anon
--     sign-in fires the platform trigger shared.handle_new_user —
--     profiles fan-out accepted by owner decision (no is_anonymous
--     guard).
--   * Housekeeping: zikr_purge_expired() stays callable over REST by
--     service_role only (keeps the keep-alive/pg_cron pattern).
-- ============================================================

create schema if not exists zikr;
create schema if not exists zikr_private;

grant usage on schema zikr to anon, authenticated;
-- Supabase-only roles: absent in the vanilla-postgres local harness
-- (which creates anon/authenticated/service_role but NOT authenticator),
-- present on the platform compose stack and hosted project. Guarded PER
-- ROLE: one missing role must not silently skip its siblings' grants.
do $$ begin
  grant usage on schema zikr to authenticator;
exception when undefined_object then null; end $$;
do $$ begin
  grant usage on schema zikr to service_role;
exception when undefined_object then null; end $$;

-- Platform role-chain assert: every existing product prefix preserved
-- verbatim, in the current chain order (pcare onboarded after this file
-- was first written — its prefix leads; see PLAYBOOK.md hard rule 4 /
-- SCHEMAS.md). The base roles exist everywhere; authenticator/
-- service_role only on the Supabase stack, so their ALTERs are guarded
-- for the harness.
alter role anon          in database postgres set search_path = pcare, zikr, officerider, ledger, prep_app, donate, shared, extensions;
alter role authenticated in database postgres set search_path = pcare, zikr, officerider, ledger, prep_app, donate, shared, extensions;
-- Guarded PER ROLE (see the schema grants above): one missing role must
-- not silently skip its siblings' chain assert.
do $$ begin
  alter role authenticator in database postgres set search_path = pcare, zikr, officerider, ledger, prep_app, donate, shared, extensions;
exception when undefined_object then null; end $$;
do $$ begin
  alter role service_role  in database postgres set search_path = pcare, zikr, officerider, ledger, prep_app, donate, shared, extensions;
exception when undefined_object then null; end $$;

set search_path = zikr, zikr_private, shared, extensions;


create schema if not exists zikr_private;
grant usage on schema zikr_private to anon, authenticated;

-- ============================================================
-- Tables (zikr_private)
-- ============================================================

-- Groups: persistent, code-gated, never auto-purged. The owner closes
-- them; only the owner. Holds zero counting data.
create table zikr_private.groups (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  title      text not null check (char_length(title) between 1 and 80),
  owner_id   uuid not null,
  status     text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now()
);

-- Members: names only. Holds zero contribution data.
create table zikr_private.members (
  group_id   uuid not null references zikr_private.groups (id) on delete cascade,
  user_id    uuid not null,
  name       text not null check (char_length(btrim(name)) between 1 and 24),
  joined_at  timestamptz not null default now(),
  removed_at timestamptz,
  primary key (group_id, user_id)
);

-- One row per device. The token is the analytics key; the anon auth uid is
-- only the secure handle used to issue/look it up.
create table zikr_private.devices (
  token        text primary key check (char_length(token) = 12),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Raw usage events. Insert-only via RPC; nobody can read them back.
create table zikr_private.analytics_events (
  id           bigint generated always as identity primary key,
  device_token text not null,
  name         text not null check (char_length(name) between 1 and 40),
  properties   jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- Plans: the target definition + lifetime combined total. No owner
-- column — plan_owners holds the relation. A group can run several
-- plans at once; ended plans stay as group history.
create table zikr_private.plans (
  id          uuid primary key default gen_random_uuid(),
  title       text check (char_length(title) between 1 and 80),
  mode        text not null check (mode in ('combined', 'per-zikr')),
  period      text not null check (period in ('one-time', 'daily', 'weekly', 'monthly')),
  time_zone   text,
  target      integer check (target is null or target between 1 and 100000000),
  total       integer not null default 0 check (total >= 0),
  starts_at   timestamptz,
  ends_at     timestamptz,
  status      text not null default 'active' check (status in ('active', 'ended')),
  ended_at    timestamptz,
  created_at  timestamptz not null default now(),
  check (period <> 'one-time' or (starts_at is not null and ends_at is not null and ends_at > starts_at)),
  check (period = 'one-time' or time_zone is not null)
);

-- The zikrs a plan counts — its zikr list AND per-zikr counters.
create table zikr_private.plan_zikrs (
  plan_id     uuid not null references zikr_private.plans (id) on delete cascade,
  zikr_name   text not null check (char_length(zikr_name) between 1 and 80),
  zikr_arabic text,
  target      integer check (target is null or target between 1 and 100000000),
  total       integer not null default 0 check (total >= 0),
  created_at  timestamptz not null default now(),
  primary key (plan_id, zikr_name)
);

-- Ownership relation: who a plan belongs to. Group rows point at
-- groups.id; user rows are reserved for the future (no FK possible on a
-- polymorphic column — the RPCs validate, and groups are never
-- hard-deleted, so no orphans can appear).
create table zikr_private.plan_owners (
  plan_id     uuid not null references zikr_private.plans (id) on delete cascade,
  owner_kind  text not null check (owner_kind in ('user', 'group')),
  owner_id    uuid not null,
  created_at  timestamptz not null default now(),
  primary key (plan_id, owner_id)
);

-- One row per APPLIED contribution event. The event_id PK is the
-- idempotency ledger; rows carry no user id — the group only ever
-- aggregates them. Retained 90 days, then rolled into
-- plan_daily_totals by purge_expired().
create table zikr_private.plan_contributions (
  event_id    uuid primary key,
  plan_id     uuid not null references zikr_private.plans (id) on delete cascade,
  zikr_name   text not null,
  delta       integer not null check (delta between 1 and 10000),
  created_at  timestamptz not null default now()
);

create index plan_contributions_plan_time_idx on zikr_private.plan_contributions (plan_id, created_at desc);

-- Permanent day-level rollups (plan history that survives raw-row purge).
create table zikr_private.plan_daily_totals (
  plan_id     uuid not null references zikr_private.plans (id) on delete cascade,
  day         date not null,
  zikr_name   text not null,
  total       integer not null check (total >= 0),
  primary key (plan_id, day, zikr_name)
);

-- ============================================================
-- Internal helpers (zikr_private — invisible to the API)
-- Definer + stable: policies and functions must see whole tables,
-- and a policy on members cannot query members directly (recursion).
-- Defined before the policies that call them.
-- ============================================================

-- Unambiguous code alphabet: no 0/O/1/I/L.
create function zikr_private.random_group_code() returns text
language sql volatile set search_path = zikr_private as $$
  select array_to_string(
    array(
      select substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', floor(random() * 31)::int + 1, 1)
      from generate_series(1, 6)
    ),
    ''
  );
$$;

create function zikr_private.random_device_token() returns text
language sql volatile set search_path = zikr_private as $$
  select array_to_string(
    array(
      select substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', floor(random() * 31)::int + 1, 1)
      from generate_series(1, 12)
    ),
    ''
  );
$$;

create function zikr_private.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = zikr_private, extensions as $$
  select exists (
    select 1 from zikr_private.members m
    where m.group_id = p_group_id and m.user_id = p_user_id and m.removed_at is null
  );
$$;

create function zikr_private.is_group_owner(p_group_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = zikr_private, extensions as $$
  select exists (
    select 1 from zikr_private.groups g
    where g.id = p_group_id and g.owner_id = p_user_id
  );
$$;

create function zikr_private.group_member_count(p_group_id uuid)
returns integer
language sql stable security definer set search_path = zikr_private, extensions as $$
  select count(*)::int from zikr_private.members m
  where m.group_id = p_group_id and m.removed_at is null;
$$;

create function zikr_private.plan_period_start(p_period text, p_tz text)
returns timestamptz
language sql stable security definer set search_path = zikr_private, extensions as $$
  select case p_period
    when 'daily'   then (date_trunc('day',   now() at time zone p_tz) at time zone p_tz)
    when 'weekly'  then (date_trunc('week',  now() at time zone p_tz) at time zone p_tz)
    when 'monthly' then (date_trunc('month', now() at time zone p_tz) at time zone p_tz)
    else null
  end
$$;

create function zikr_private.is_plan_group_member(p_plan_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = zikr_private, extensions as $$
  select exists (
    select 1 from zikr_private.plan_owners po
    join zikr_private.groups g on g.id = po.owner_id
    where po.plan_id = p_plan_id
      and po.owner_kind = 'group'
      and zikr_private.is_group_member(g.id, p_user_id)
  )
$$;

create function zikr_private.is_plan_group_owner(p_plan_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = zikr_private, extensions as $$
  select exists (
    select 1 from zikr_private.plan_owners po
    join zikr_private.groups g on g.id = po.owner_id
    where po.plan_id = p_plan_id
      and po.owner_kind = 'group'
      and zikr_private.is_group_owner(g.id, p_user_id)
  )
$$;

-- Validate a plan payload and insert it (plan + zikrs + group owner
-- row) for a group. SECURITY DEFINER so it owns every write to the
-- plan tables — callers never need table grants on them.
create function zikr_private.insert_plan(p_group_id uuid, p_plan jsonb)
returns zikr_private.plans
language plpgsql volatile security definer set search_path = zikr_private, extensions as $$
declare
  v_plan    zikr_private.plans;
  v_mode    text := p_plan->>'mode';
  v_period  text := p_plan->>'period';
  v_tz      text := nullif(btrim(coalesce(p_plan->>'timeZone', '')), '');
  v_target  integer := (p_plan->>'target')::integer;
  v_zikrs   jsonb := p_plan->'zikrs';
  v_z       jsonb;
  v_name    text;
begin
  if v_mode not in ('combined', 'per-zikr') then
    raise exception 'invalid_mode';
  end if;
  if v_period not in ('one-time', 'daily', 'weekly', 'monthly') then
    raise exception 'invalid_period';
  end if;
  if v_mode = 'combined' and (v_target is null or v_target < 1 or v_target > 100000000) then
    raise exception 'invalid_target';
  end if;
  if v_period = 'one-time' then
    if p_plan->>'startsAt' is null or p_plan->>'endsAt' is null
       or (p_plan->>'endsAt')::timestamptz <= (p_plan->>'startsAt')::timestamptz then
      raise exception 'invalid_window';
    end if;
    if now() > (p_plan->>'endsAt')::timestamptz then
      raise exception 'window_already_ended';
    end if;
  else
    -- Validate the timezone by exercising it (raises on unknown zone).
    begin
      perform zikr_private.plan_period_start(v_period, v_tz);
    exception when others then
      raise exception 'invalid_input';
    end;
    if v_tz is null then
      raise exception 'invalid_input';
    end if;
  end if;

  if jsonb_typeof(v_zikrs) <> 'array' or jsonb_array_length(v_zikrs) < 1
     or jsonb_array_length(v_zikrs) > 5 then
    raise exception 'invalid_zikrs';
  end if;

  insert into zikr_private.plans (title, mode, period, time_zone, target, starts_at, ends_at)
  values (
    nullif(btrim(coalesce(p_plan->>'title', '')), ''),
    v_mode,
    v_period,
    case when v_period = 'one-time' then null else v_tz end,
    case when v_mode = 'combined' then v_target else null end,
    case when v_period = 'one-time' then (p_plan->>'startsAt')::timestamptz else null end,
    case when v_period = 'one-time' then (p_plan->>'endsAt')::timestamptz else null end
  )
  returning * into v_plan;

  for v_z in select * from jsonb_array_elements(v_zikrs) loop
    v_name := left(btrim(coalesce(v_z->>'name', '')), 80);
    if char_length(v_name) = 0 then
      raise exception 'invalid_zikrs';
    end if;
    if v_mode = 'per-zikr' and (
      (v_z->>'target') is null or (v_z->>'target')::integer < 1 or (v_z->>'target')::integer > 100000000
    ) then
      raise exception 'invalid_target';
    end if;
    insert into zikr_private.plan_zikrs (plan_id, zikr_name, zikr_arabic, target)
    values (
      v_plan.id,
      v_name,
      nullif(left(btrim(coalesce(v_z->>'arabic', '')), 200), ''),
      case when v_mode = 'per-zikr' then (v_z->>'target')::integer else null end
    );
  end loop;

  insert into zikr_private.plan_owners (plan_id, owner_kind, owner_id)
  values (v_plan.id, 'group', p_group_id);

  return v_plan;
end;
$$;

-- Atomic increment of a plan zikr's lifetime total. (The plan's own
-- total is bumped separately by the status-guarded update in
-- contribute() so the end_plan race is detected — never bump both here.)
create function zikr_private.bump_zikr_total(p_plan_id uuid, p_zikr_name text, p_delta integer)
returns void
language sql volatile security definer set search_path = zikr_private, extensions as $$
  update zikr_private.plan_zikrs set total = total + p_delta
  where plan_id = p_plan_id and zikr_name = p_zikr_name;
$$;

create function zikr_private.set_plan_ended(p_plan_id uuid)
returns void
language sql volatile security definer set search_path = zikr_private, extensions as $$
  update zikr_private.plans set status = 'ended', ended_at = now()
  where id = p_plan_id and status = 'active';
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table zikr_private.groups enable row level security;
alter table zikr_private.members enable row level security;
alter table zikr_private.devices enable row level security;
alter table zikr_private.analytics_events enable row level security;
alter table zikr_private.plans enable row level security;
alter table zikr_private.plan_zikrs enable row level security;
alter table zikr_private.plan_owners enable row level security;
alter table zikr_private.plan_contributions enable row level security;
alter table zikr_private.plan_daily_totals enable row level security;

-- Group definitions are readable (the app flow is code-gated, and the
-- table has no REST endpoint — only functions select from it).
create policy "groups readable" on zikr_private.groups
  for select using (true);

create policy "owner inserts group" on zikr_private.groups
  for insert with check (owner_id = auth.uid());

-- Owners close (status); any active member contributes.
create policy "owner or member updates group" on zikr_private.groups
  for update using (
    zikr_private.is_group_owner(id, auth.uid())
    or zikr_private.is_group_member(id, auth.uid())
  );

-- Members: the roster is readable by current members of that group, and
-- everyone always sees their own membership row — required so that
-- INSERT ... ON CONFLICT DO UPDATE (join/rejoin) can see the proposed row.
create policy "members readable by group members" on zikr_private.members
  for select using (
    user_id = auth.uid()
    or zikr_private.is_group_member(group_id, auth.uid())
  );

create policy "users join as themselves" on zikr_private.members
  for insert with check (user_id = auth.uid());

-- Self leaves (own row); owner removes others.
create policy "self or owner updates member" on zikr_private.members
  for update using (
    user_id = auth.uid()
    or zikr_private.is_group_owner(group_id, auth.uid())
  );

-- Devices: strictly own-row.
create policy "own device row" on zikr_private.devices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Usage events: append-only, and only with your own device token.
create policy "own device inserts events" on zikr_private.analytics_events
  for insert with check (
    exists (
      select 1 from zikr_private.devices d
      where d.token = device_token and d.user_id = auth.uid()
    )
  );

-- Plan definitions are readable like group definitions (code-gated flow,
-- no REST endpoint). All writes go through definer helpers.
create policy "plans readable" on zikr_private.plans
  for select using (true);

-- contribute() runs as the caller and bumps the denormalized total with a
-- status-guarded update — column-scoped to `total` by the grant below, and
-- row-scoped here to members of the owning group.
create policy "plans total updatable by group members" on zikr_private.plans
  for update to anon, authenticated
  using (zikr_private.is_plan_group_member(id, auth.uid()));

create policy "plan zikrs readable" on zikr_private.plan_zikrs
  for select using (true);

create policy "plan owners readable" on zikr_private.plan_owners
  for select using (true);

-- Contributions: members of the plan's group write replay-safe events
-- and read them back (get_group_state aggregates current-period totals).
create policy "contributions readable by group members" on zikr_private.plan_contributions
  for select using (zikr_private.is_plan_group_member(plan_id, auth.uid()));

create policy "contributions written by group members" on zikr_private.plan_contributions
  for insert with check (zikr_private.is_plan_group_member(plan_id, auth.uid()));

-- Rollups are written only by the service-role purge; nobody reads them
-- back through the API (no policies = deny).

-- ============================================================
-- Table grants — the minimum the invoker RPCs need
-- ============================================================

grant select, insert, update (status) on zikr_private.groups to anon, authenticated;
grant select, insert, update (name, joined_at, removed_at) on zikr_private.members to anon, authenticated;
grant select, insert, update (last_seen_at) on zikr_private.devices to anon, authenticated;
grant insert on zikr_private.analytics_events to anon, authenticated;
grant select on zikr_private.plans to anon, authenticated;
-- Heal databases where the missing update grant was hand-widened during
-- an outage: revoke the table-level grant, then scope to the one column
-- contribute() actually writes.
revoke update on zikr_private.plans from anon, authenticated;
grant update (total) on zikr_private.plans to anon, authenticated;
grant select on zikr_private.plan_zikrs to anon, authenticated;
grant select on zikr_private.plan_owners to anon, authenticated;
grant select, insert on zikr_private.plan_contributions to anon, authenticated;

-- ============================================================
-- User-callable RPCs (zikr schema, SECURITY INVOKER)
-- Authorization = grants + RLS; the explicit `raise` checks remain
-- because the app maps them to error codes (RLS only filters rows).
-- ============================================================

create or replace function zikr.zikr_get_group_state(p_code text)
returns json
language plpgsql stable security invoker set search_path = zikr, zikr_private, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_group zikr_private.groups;
begin
  select * into v_group from zikr_private.groups where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;

  return json_build_object(
    'group', json_build_object(
      'id', v_group.id,
      'code', v_group.code,
      'title', v_group.title,
      'ownerId', v_group.owner_id,
      'status', v_group.status,
      'createdAt', v_group.created_at
    ),
    'plans', coalesce((
      select json_agg(
        json_build_object(
          'id', pl.id,
          'title', pl.title,
          'mode', pl.mode,
          'period', pl.period,
          'timeZone', pl.time_zone,
          'target', pl.target,
          'total', pl.total,
          'periodTotal', case when pl.period = 'one-time' then pl.total else coalesce((
            select sum(c.delta) from zikr_private.plan_contributions c
            where c.plan_id = pl.id
              and c.created_at >= zikr_private.plan_period_start(pl.period, pl.time_zone)
          ), 0) end,
          'startsAt', pl.starts_at,
          'endsAt', pl.ends_at,
          'status', pl.status,
          'createdAt', pl.created_at,
          'endedAt', pl.ended_at,
          'zikrs', coalesce((
            select json_agg(
              json_build_object(
                'name', pz.zikr_name,
                'arabic', pz.zikr_arabic,
                'target', pz.target,
                'total', pz.total,
                'periodTotal', case when pl.period = 'one-time' then pz.total else coalesce((
                  select sum(c.delta) from zikr_private.plan_contributions c
                  where c.plan_id = pl.id
                    and c.zikr_name = pz.zikr_name
                    and c.created_at >= zikr_private.plan_period_start(pl.period, pl.time_zone)
                ), 0) end
              ) order by pz.created_at
            )
            from zikr_private.plan_zikrs pz where pz.plan_id = pl.id
          ), '[]'::json)
        ) order by pl.created_at desc
      )
      from zikr_private.plans pl
      where exists (
        select 1 from zikr_private.plan_owners po
        where po.plan_id = pl.id
          and po.owner_kind = 'group'
          and po.owner_id = v_group.id
      )
    ), '[]'::json),
    'members', (
      select coalesce(
        json_agg(
          json_build_object('name', m.name, 'joinedAt', m.joined_at, 'userId', m.user_id)
          order by m.joined_at
        ),
        '[]'::json
      )
      from zikr_private.members m
      where m.group_id = v_group.id and m.removed_at is null
    ),
    'isMember', exists (
      select 1 from zikr_private.members m
      where m.group_id = v_group.id and m.user_id = v_uid and m.removed_at is null
    )
  );
end;
$$;

-- Create a group + its first plan + creator's membership, atomically.
create or replace function zikr.zikr_create_group(p_title text, p_name text, p_plan jsonb)
returns json
language plpgsql volatile security invoker set search_path = zikr, zikr_private, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_group zikr_private.groups;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;
  if p_plan is null then
    raise exception 'invalid_input';
  end if;

  loop
    v_code := zikr_private.random_group_code();
    begin
      insert into zikr_private.groups (code, title, owner_id)
      values (v_code, left(btrim(coalesce(p_title, '')), 80), v_uid)
      returning * into v_group;
      exit;
    exception when unique_violation then
      continue; -- code collision, try another
    end;
  end loop;

  insert into zikr_private.members (group_id, user_id, name)
  values (v_group.id, v_uid, left(btrim(p_name), 24));

  perform zikr_private.insert_plan(v_group.id, p_plan);

  return zikr.zikr_get_group_state(v_group.code);
end;
$$;

-- Owner adds another plan to a group (several may run concurrently).
create or replace function zikr.zikr_create_plan(p_code text, p_plan jsonb)
returns json
language plpgsql volatile security invoker set search_path = zikr, zikr_private, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_group zikr_private.groups;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_group from zikr_private.groups where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  if v_group.status <> 'active' then
    raise exception 'group_closed';
  end if;
  if v_group.owner_id <> v_uid then
    raise exception 'not_owner';
  end if;

  perform zikr_private.insert_plan(v_group.id, p_plan);

  return zikr.zikr_get_group_state(v_group.code);
end;
$$;

-- Owner retires a plan early (otherwise one-time plans end with their
-- window and recurring plans run until ended).
create or replace function zikr.zikr_end_plan(p_code text, p_plan_id uuid)
returns void
language plpgsql volatile security invoker set search_path = zikr, zikr_private, extensions as $$
declare
  v_uid uuid := auth.uid();
begin
  if not zikr_private.is_plan_group_owner(p_plan_id, v_uid) then
    raise exception 'not_owner';
  end if;
  perform zikr_private.set_plan_ended(p_plan_id);
end;
$$;

-- Groups never expire — joining only needs the code and an open group.
create or replace function zikr.zikr_join_group(p_code text, p_name text)
returns json
language plpgsql volatile security invoker set search_path = zikr, zikr_private, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_group zikr_private.groups;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  select * into v_group from zikr_private.groups where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  if v_group.status <> 'active' then
    raise exception 'group_closed';
  end if;
  -- Helper sees the whole roster; RLS would hide other members' rows.
  if zikr_private.group_member_count(v_group.id) >= 100 then
    raise exception 'group_full';
  end if;

  -- Join or rejoin (a returning member keeps a single row).
  insert into zikr_private.members (group_id, user_id, name)
  values (v_group.id, v_uid, left(btrim(p_name), 24))
  on conflict (group_id, user_id) do update
    set name = excluded.name, removed_at = null, joined_at = now();

  return zikr.zikr_get_group_state(v_group.code);
end;
$$;

-- Atomic, idempotent contribution against one zikr of one plan.
-- The ONLY way counts change.
create or replace function zikr.zikr_contribute(
  p_code text,
  p_plan_id uuid,
  p_zikr_name text,
  p_delta integer,
  p_event_id uuid
) returns json
language plpgsql volatile security invoker set search_path = zikr, zikr_private, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_group zikr_private.groups;
  v_plan zikr_private.plans;
  v_total integer;
  v_period_total integer;
  v_period_start timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_delta is null or p_delta < 1 or p_delta > 10000 then
    raise exception 'invalid_delta';
  end if;
  if p_event_id is null then
    raise exception 'invalid_event';
  end if;
  if p_zikr_name is null or char_length(btrim(p_zikr_name)) = 0 then
    raise exception 'invalid_input';
  end if;

  select * into v_group from zikr_private.groups
  where code = upper(btrim(coalesce(p_code, ''))) and status = 'active';
  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;

  select pl.* into v_plan from zikr_private.plans pl
  where pl.id = p_plan_id
    and exists (
      select 1 from zikr_private.plan_owners po
      where po.plan_id = pl.id and po.owner_kind = 'group' and po.owner_id = v_group.id
    );
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  if v_plan.status <> 'active' then
    raise exception 'plan_ended';
  end if;
  if v_plan.period = 'one-time' then
    if now() < v_plan.starts_at then
      raise exception 'window_not_started';
    end if;
    if now() > v_plan.ends_at then
      raise exception 'window_ended';
    end if;
    v_period_start := null; -- one-time progress is the lifetime total
  else
    v_period_start := zikr_private.plan_period_start(v_plan.period, v_plan.time_zone);
  end if;

  if not exists (
    select 1 from zikr_private.plan_zikrs pz
    where pz.plan_id = v_plan.id and pz.zikr_name = btrim(p_zikr_name)
  ) then
    raise exception 'zikr_not_in_plan';
  end if;

  if not zikr_private.is_group_member(v_group.id, v_uid) then
    raise exception 'not_a_member';
  end if;

  -- Idempotency: a retried event is acknowledged without re-applying.
  insert into zikr_private.plan_contributions (event_id, plan_id, zikr_name, delta)
  values (p_event_id, v_plan.id, btrim(p_zikr_name), p_delta)
  on conflict (event_id) do nothing;
  if not found then
    select total into v_total from zikr_private.plans where id = v_plan.id;
    select coalesce(sum(c.delta), 0) into v_period_total
    from zikr_private.plan_contributions c
    where c.plan_id = v_plan.id
      and (v_period_start is null or c.created_at >= v_period_start);
    return json_build_object('total', v_total, 'periodTotal', v_period_total);
  end if;

  -- The increment is atomic; the plan status guard closes the race with end_plan.
  update zikr_private.plans set total = total + p_delta
  where id = v_plan.id and status = 'active'
  returning total into v_total;
  if not found then
    raise exception 'plan_ended';
  end if;
  perform zikr_private.bump_zikr_total(v_plan.id, btrim(p_zikr_name), p_delta);

  select coalesce(sum(c.delta), 0) into v_period_total
  from zikr_private.plan_contributions c
  where c.plan_id = v_plan.id
    and (v_period_start is null or c.created_at >= v_period_start);

  return json_build_object('total', v_total, 'periodTotal', v_period_total);
end;
$$;

create or replace function zikr.zikr_remove_member(p_code text, p_user_id uuid)
returns void
language plpgsql volatile security invoker set search_path = zikr, zikr_private, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_group zikr_private.groups;
begin
  select * into v_group from zikr_private.groups where code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'group_not_found' using errcode = 'P0002'; end if;
  if v_group.owner_id <> v_uid then raise exception 'not_owner'; end if;

  update zikr_private.members set removed_at = now()
  where group_id = v_group.id and user_id = p_user_id and removed_at is null;
end;
$$;

create or replace function zikr.zikr_leave_group(p_code text)
returns void
language plpgsql volatile security invoker set search_path = zikr, zikr_private, extensions as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  update zikr_private.members set removed_at = now()
  where user_id = v_uid and removed_at is null
    and group_id = (select id from zikr_private.groups where code = upper(btrim(coalesce(p_code, ''))));
end;
$$;

create or replace function zikr.zikr_close_group(p_code text)
returns void
language plpgsql volatile security invoker set search_path = zikr, zikr_private, extensions as $$
begin
  update zikr_private.groups set status = 'closed'
  where code = upper(btrim(coalesce(p_code, '')))
    and owner_id = auth.uid()
    and status = 'active';
  if not found then raise exception 'not_owner_or_not_found'; end if;
end;
$$;

-- Issued once per device (anon user), refreshed on every call. The client
-- stores the token in IndexedDB and treats it as its stable device key.
create or replace function zikr.zikr_get_or_create_device_token()
returns text
language plpgsql volatile security invoker set search_path = zikr, zikr_private, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select token into v_token from zikr_private.devices where user_id = v_uid;
  if found then
    update zikr_private.devices set last_seen_at = now() where user_id = v_uid;
    return v_token;
  end if;

  loop
    v_token := zikr_private.random_device_token();
    begin
      insert into zikr_private.devices (token, user_id) values (v_token, v_uid);
      return v_token;
    exception when unique_violation then
      continue;
    end;
  end loop;
end;
$$;

-- Best-effort usage event. Never raises: metrics must not break the app.
create or replace function zikr.zikr_track_event(p_name text, p_properties jsonb default '{}')
returns void
language plpgsql volatile security invoker set search_path = zikr, zikr_private, extensions as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    return;
  end if;

  select token into v_token from zikr_private.devices where user_id = auth.uid();
  if found then
    update zikr_private.devices set last_seen_at = now() where user_id = auth.uid();
  else
    v_token := zikr.zikr_get_or_create_device_token();
  end if;

  insert into zikr_private.analytics_events (device_token, name, properties)
  values (v_token, left(p_name, 40), p_properties);
end;
$$;

-- ============================================================
-- Housekeeping (in the exposed zikr schema so the service-role keep-alive job and pg_cron
-- can reach it, but NOT granted to app clients).
--
-- This is the ONLY purge_expired definition on the server. Groups are
-- NEVER deleted. Raw contribution rows roll up into daily totals after
-- 90 days; idempotency dedupe lives only in the raw rows (retries
-- happen within hours of backoff, never near the boundary). Stale
-- unverified shared-library submissions (180 days) are cleaned here
-- too — the shared-zikrs migration deliberately does not define its
-- own purge_expired.
-- ============================================================

create or replace function zikr.zikr_purge_expired()
returns void
language plpgsql security definer set search_path = zikr_private, extensions as $$
begin
  delete from zikr_private.analytics_events where created_at < now() - interval '90 days';

  insert into zikr_private.plan_daily_totals (plan_id, day, zikr_name, total)
  select plan_id, (created_at at time zone 'UTC')::date, zikr_name, sum(delta)
  from zikr_private.plan_contributions
  where created_at < now() - interval '90 days'
  group by plan_id, (created_at at time zone 'UTC')::date, zikr_name
  on conflict (plan_id, day, zikr_name)
    do update set total = zikr_private.plan_daily_totals.total + excluded.total;

  delete from zikr_private.plan_contributions where created_at < now() - interval '90 days';

  delete from zikr_private.shared_zikrs where not verified and submitted_at < now() - interval '180 days';
end;
$$;

-- ============================================================
-- EXECUTE surface — refresh the deliberate grant list
-- ============================================================

revoke execute on all functions in schema zikr from public, anon, authenticated;
alter default privileges for role postgres in schema zikr revoke execute on functions from public, anon, authenticated;

grant execute on function zikr.zikr_get_group_state(text) to anon, authenticated;
grant execute on function zikr.zikr_create_group(text, text, jsonb) to anon, authenticated;
grant execute on function zikr.zikr_create_plan(text, jsonb) to anon, authenticated;
grant execute on function zikr.zikr_end_plan(text, uuid) to anon, authenticated;
grant execute on function zikr.zikr_join_group(text, text) to anon, authenticated;
grant execute on function zikr.zikr_contribute(text, uuid, text, integer, uuid) to anon, authenticated;
grant execute on function zikr.zikr_remove_member(text, uuid) to anon, authenticated;
grant execute on function zikr.zikr_leave_group(text) to anon, authenticated;
grant execute on function zikr.zikr_close_group(text) to anon, authenticated;
grant execute on function zikr.zikr_get_or_create_device_token() to anon, authenticated;
grant execute on function zikr.zikr_track_event(text, jsonb) to anon, authenticated;

do $$ begin
  grant execute on function zikr.zikr_purge_expired() to service_role;
exception when undefined_object then null; end $$;


create table if not exists zikr_private.shared_zikrs (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(btrim(name)) between 1 and 50),
  name_bn         text,
  arabic_text     text,
  translation     text check (translation is null or char_length(btrim(translation)) <= 100),
  translation_bn  text,
  submitted_by    uuid references auth.users (id) on delete set null,
  submitted_at    timestamptz not null default now(),
  verified        boolean not null default false,
  verified_at     timestamptz,
  updated_at      timestamptz not null default now()
);

-- One live row per name (case-insensitive).
create unique index if not exists shared_zikrs_name_key
  on zikr_private.shared_zikrs (lower(btrim(name)));

-- Pull cursor scan path.
create index if not exists shared_zikrs_updated_idx
  on zikr_private.shared_zikrs (updated_at, id) where verified;

alter table zikr_private.shared_zikrs enable row level security;

-- Definitions are public once verified; inserts are self-attributed.
-- Restated with drop-if-exists: the shared_zikrs table predates this
-- migration on the production database (v1 era), policies included.
drop policy if exists "verified zikrs readable" on zikr_private.shared_zikrs;
create policy "verified zikrs readable" on zikr_private.shared_zikrs
  for select using (true);

drop policy if exists "users submit as themselves" on zikr_private.shared_zikrs;
create policy "users submit as themselves" on zikr_private.shared_zikrs
  for insert with check (submitted_by = auth.uid());

-- Bump updated_at whenever a row changes (so pulls re-deliver edits).
create or replace function zikr_private.shared_zikrs_touch_updated_at()
returns trigger
language plpgsql set search_path = zikr_private as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shared_zikrs_touch on zikr_private.shared_zikrs;
create trigger shared_zikrs_touch
  before update on zikr_private.shared_zikrs
  for each row execute function zikr_private.shared_zikrs_touch_updated_at();

-- ============================================================
-- Table grants
-- ============================================================

grant select, insert on zikr_private.shared_zikrs to anon, authenticated;

-- ============================================================
-- User-callable RPCs (zikr schema, SECURITY INVOKER)
-- ============================================================

-- Submit a custom zikr for review. Inserted unverified; it becomes
-- visible to other users only after the admin verifies it.
create or replace function zikr.zikr_share_zikr(
  p_name text,
  p_arabic_text text,
  p_translation text
) returns json
language plpgsql volatile security invoker set search_path = zikr, zikr_private, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_row zikr_private.shared_zikrs;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 or char_length(btrim(p_name)) > 50 then
    raise exception 'invalid_name';
  end if;
  if p_translation is not null and char_length(btrim(p_translation)) > 100 then
    raise exception 'invalid_translation';
  end if;

  insert into zikr_private.shared_zikrs (name, arabic_text, translation, submitted_by)
  values (btrim(p_name), nullif(btrim(p_arabic_text), ''), nullif(btrim(p_translation), ''), v_uid)
  returning * into v_row;

  return json_build_object('id', v_row.id, 'verified', v_row.verified);
exception
  when unique_violation then
    raise exception 'duplicate_name';
end;
$$;

-- Verified zikrs, newest-updated-first page after the cursor.
-- Batch size 100; ordering/cursor on (updated_at, id) so ties are
-- unambiguous and admin edits (bumped updated_at) re-deliver.
create or replace function zikr.zikr_pull_verified_zikrs(
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null
) returns json
language plpgsql stable security invoker set search_path = zikr, zikr_private, extensions as $$
declare
  v_page_size constant integer := 100;
  v_items json;
  v_count integer;
  v_has_more boolean;
  v_last_updated timestamptz;
  v_last_id uuid;
begin
  -- ONE statement, deliberately: the `page` CTE (an over-fetch of +1 that
  -- answers has_more) is only in scope for the statement it belongs to.
  -- plpgsql resolves names per statement — touching `page` in a later
  -- statement looks up a TABLE and fails at call time with
  -- 42P01 relation "page" does not exist (this shipped broken once).
  with page as (
    select z.id, z.name, z.name_bn, z.arabic_text, z.translation, z.translation_bn, z.updated_at
    from zikr_private.shared_zikrs z
    where z.verified
      and (
        p_cursor_updated_at is null
        or (z.updated_at, z.id) > (p_cursor_updated_at, coalesce(p_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
    order by z.updated_at asc, z.id asc
    limit v_page_size + 1
  ),
  kept as (
    select * from page order by updated_at asc, id asc limit v_page_size
  )
  select
    coalesce(json_agg(json_build_object(
      'id', kept.id,
      'name', kept.name,
      'nameBn', kept.name_bn,
      'arabicText', kept.arabic_text,
      'translation', kept.translation,
      'translationBn', kept.translation_bn,
      'updatedAt', kept.updated_at
    ) order by kept.updated_at, kept.id), '[]'::json),
    count(*),
    (select count(*) from page) > v_page_size
  into v_items, v_count, v_has_more
  from kept;

  -- Position of the last returned row: also sent on the final page so
  -- clients can advance their cursor past everything consumed.
  select (v_items -> v_count - 1 ->> 'updatedAt')::timestamptz,
         (v_items -> v_count - 1 ->> 'id')::uuid
  into v_last_updated, v_last_id
  where v_count > 0;

  return json_build_object(
    'items', v_items,
    'nextCursorUpdatedAt', v_last_updated,
    'nextCursorId', v_last_id,
    'hasMore', v_has_more
  );
end;
$$;

-- ============================================================
-- EXECUTE surface
-- ============================================================

grant execute on function zikr.zikr_share_zikr(text, text, text) to anon, authenticated;
grant execute on function zikr.zikr_pull_verified_zikrs(timestamptz, uuid) to anon, authenticated;

-- Housekeeping (purging stale unverified submissions) is merged into
-- the single zikr.zikr_purge_expired() defined by the group-plans section above.
-- Do NOT define purge_expired here: a second create-or-replace would
-- silently replace the group-plans body depending on migration order.

-- ============================================================

-- Hosted Supabase ships `http` (pgsql-http); the vanilla-postgres local
-- harness does not. A missing extension only ever matters when a secret
-- IS configured — verify_turnstile fails closed in that case, and the
-- local tests exercise exactly that path.
do $$
begin
  create extension if not exists http with schema extensions;
exception
  when others then
    raise warning 'extension http unavailable — Turnstile verification will fail closed';
end $$;

-- ============================================================
-- Tables (zikr_private)
-- ============================================================

-- Private deployment config. Today: the Turnstile secret. RLS on, NO
-- policies, NO grants — reachable only from the security definer helper
-- below (owner privileges) and the dashboard.
create table if not exists zikr_private.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table zikr_private.app_config enable row level security;

-- One-way messages from users to the admin. Insert via RPC only; a user
-- can read back their own rows (the rate-limit count needs it), nobody
-- can read anyone else's, and no client can ever update or delete.
create table if not exists zikr_private.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  category    text not null check (category in ('bug', 'suggestion', 'question', 'other')),
  message     text not null check (char_length(btrim(message)) between 1 and 2000),
  email       text check (email is null or (char_length(btrim(email)) between 3 and 120 and btrim(email) ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  locale      text check (locale is null or char_length(locale) <= 10),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 200),
  status      text not null default 'new' check (status in ('new', 'read', 'resolved')),
  created_at  timestamptz not null default now()
);

-- Rate-limit count path (per-user recent submissions).
create index if not exists feedback_user_created_idx
  on zikr_private.feedback (user_id, created_at);

alter table zikr_private.feedback enable row level security;

drop policy if exists "own feedback readable" on zikr_private.feedback;
create policy "own feedback readable" on zikr_private.feedback
  for select using (user_id = auth.uid());

drop policy if exists "users submit feedback as themselves" on zikr_private.feedback;
create policy "users submit feedback as themselves" on zikr_private.feedback
  for insert with check (user_id = auth.uid());

grant select, insert on zikr_private.feedback to anon, authenticated;

-- ============================================================
-- Internal helper (zikr_private — invisible to the API)
-- ============================================================

-- Verify a Turnstile token against Cloudflare siteverify. SECURITY
-- DEFINER: it must read zikr_private.app_config, which no API role can see.
--
--   secret not configured → true (captcha is off for this deployment;
--     the client ships no site key either — the pair flips together)
--   secret configured, token missing/invalid/siteverify unreachable →
--     false (fail closed: a configured secret means captcha is ON)
create or replace function zikr_private.verify_turnstile(p_token text)
returns boolean
language plpgsql volatile security definer set search_path = zikr_private, extensions as $$
declare
  v_secret  text;
  v_success boolean;
begin
  select value into v_secret from zikr_private.app_config where key = 'turnstile_secret';
  if coalesce(v_secret, '') = '' then
    return true;
  end if;
  if p_token is null or btrim(p_token) = '' then
    return false;
  end if;
  -- A configured secret without the http extension (vanilla-postgres
  -- local harness) must fail closed: config says captcha is on.
  if to_regproc('extensions.http_post') is null then
    return false;
  end if;

  begin
    perform http_set_curlopt('CURLOPT_TIMEOUT_MS', '5000');
    select ((content::jsonb ->> 'success')::boolean)
    into v_success
    from http_post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      'secret=' || urlencode(v_secret) || '&response=' || urlencode(btrim(p_token)),
      'application/x-www-form-urlencoded'
    );
  exception when others then
    -- Network or parse trouble: verification unavailable → reject.
    return false;
  end;

  return coalesce(v_success, false);
end;
$$;

-- ============================================================
-- User-callable RPC (public, SECURITY INVOKER)
-- ============================================================

-- Submit feedback. Attribution is forced server-side (user_id =
-- auth.uid()); the optional email is the only reply channel — it is the
-- user's choice to leave it.
create or replace function zikr.zikr_submit_feedback(
  p_category text,
  p_message text,
  p_email text default null,
  p_app_version text default null,
  p_locale text default null,
  p_user_agent text default null,
  p_captcha_token text default null
) returns json
language plpgsql volatile security invoker set search_path = zikr, zikr_private, extensions as $$
declare
  v_uid    uuid := auth.uid();
  v_recent integer;
  v_row    zikr_private.feedback;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_category is null or p_category not in ('bug', 'suggestion', 'question', 'other') then
    raise exception 'invalid_category';
  end if;
  if p_message is null or char_length(btrim(p_message)) not between 1 and 2000 then
    raise exception 'invalid_message';
  end if;
  if p_email is not null and btrim(p_email) <> '' and (
    char_length(btrim(p_email)) > 120
    or btrim(p_email) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ) then
    raise exception 'invalid_email';
  end if;

  -- Spam valve before anything expensive (a captcha check is an HTTPS
  -- round-trip): 5 submissions per user per 24h.
  select count(*) into v_recent
  from zikr_private.feedback
  where user_id = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'rate_limited';
  end if;

  -- Cloudflare Turnstile: verified whenever the deployment configured a
  -- secret; skipped when captcha is off (see verify_turnstile).
  if not zikr_private.verify_turnstile(p_captcha_token) then
    raise exception 'captcha_failed';
  end if;

  insert into zikr_private.feedback
    (user_id, category, message, email, app_version, locale, user_agent)
  values (
    v_uid,
    p_category,
    btrim(p_message),
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(left(btrim(coalesce(p_app_version, '')), 40), ''),
    nullif(left(btrim(coalesce(p_locale, '')), 10), ''),
    nullif(left(btrim(coalesce(p_user_agent, '')), 200), '')
  )
  returning * into v_row;

  return json_build_object('id', v_row.id);
end;
$$;

-- ============================================================
-- EXECUTE surface
-- ============================================================

revoke execute on function zikr.zikr_submit_feedback(text, text, text, text, text, text, text) from public;
grant execute on function zikr.zikr_submit_feedback(text, text, text, text, text, text, text) to anon, authenticated;
