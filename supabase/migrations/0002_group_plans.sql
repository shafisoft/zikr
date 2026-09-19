-- ============================================================
-- Zikr backend migration 0002 — upgrade the ORIGINAL v1 database to
-- the canonical schema (see 0001_init.sql for that shape).
--
-- Fresh databases must NOT run this file: they run 0001_init.sql
-- (+ 0002_shared_zikrs.sql) and are done. This migration exists for
-- the one production database that predates the rewrite and still
-- carries the v1 layout: goal columns on rooms, functions in
-- zikr_app, no plan model, no public RPC surface.
--
-- Idempotent across BOTH real states of that database:
--   a) pristine v1, and
--   b) v1 + a previous partial application of this migration
--      (plan tables created, legacy data carried over, the interim
--      room-named public RPC surface) — every step re-runs cleanly.
--
-- What it does, in order:
--   1. Renames rooms → groups (terminology commit; the client calls
--      the group_* RPC surface). Renames members.room_id → group_id.
--   2. Creates the plan model if missing and migrates every legacy
--      goal-room into a plan (+ zikr + owner row). Legacy one-time
--      windows keep their totals; ended windows read as ended.
--   3. Replaces the internal helpers with group-named equivalents.
--   4. Rebuilds RLS policies on groups/members (dropping whatever
--      v1-era policies exist, whatever they are named) and restates
--      the canonical policy set everywhere.
--   5. Creates the canonical public RPC surface (group_* names).
--   6. Drops the interim room-named public RPCs and the v1-era
--      zikr_app functions — dead surfaces, kept out of the DB.
--   7. Restates grants and the EXECUTE surface.
--
-- The v1 backward-compat shims (create_room(7-arg), contribute(3-arg))
-- are deliberately NOT recreated: the groups feature never shipped to
-- production in v1 form, so no released client ever calls them.
-- ============================================================

-- ============================================================
-- 1. Terminology renames
-- ============================================================

alter table if exists zikr_app.rooms rename to groups;
alter table if exists zikr_app.members rename column if exists room_id to group_id;

-- ============================================================
-- 2. Plan model + legacy data migration
-- ============================================================

create table if not exists zikr_app.plans (
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

create table if not exists zikr_app.plan_zikrs (
  plan_id     uuid not null references zikr_app.plans (id) on delete cascade,
  zikr_name   text not null check (char_length(zikr_name) between 1 and 80),
  zikr_arabic text,
  target      integer check (target is null or target between 1 and 100000000),
  total       integer not null default 0 check (total >= 0),
  created_at  timestamptz not null default now(),
  primary key (plan_id, zikr_name)
);

create table if not exists zikr_app.plan_owners (
  plan_id     uuid not null references zikr_app.plans (id) on delete cascade,
  owner_kind  text not null check (owner_kind in ('user', 'group')),
  owner_id    uuid not null,
  created_at  timestamptz not null default now(),
  primary key (plan_id, owner_id)
);

create table if not exists zikr_app.plan_contributions (
  event_id    uuid primary key,
  plan_id     uuid not null references zikr_app.plans (id) on delete cascade,
  zikr_name   text not null,
  delta       integer not null check (delta between 1 and 10000),
  created_at  timestamptz not null default now()
);

create index if not exists plan_contributions_plan_time_idx on zikr_app.plan_contributions (plan_id, created_at desc);

create table if not exists zikr_app.plan_daily_totals (
  plan_id     uuid not null references zikr_app.plans (id) on delete cascade,
  day         date not null,
  zikr_name   text not null,
  total       integer not null check (total >= 0),
  primary key (plan_id, day, zikr_name)
);

-- Legacy goal-rooms → one plan (+ zikr + owner) each. The temporary
-- migrate_room column keeps the mapping exact (matching on title+
-- window could cross-match distinct rooms with equal windows).
-- Skipped when the goal columns are already gone.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'zikr_app' and table_name = 'groups' and column_name = 'zikr_name'
  ) then
    alter table zikr_app.plans add column migrate_room uuid;

    insert into zikr_app.plans (migrate_room, title, mode, period, target, total, starts_at, ends_at, status, created_at)
    select
      g.id,
      g.title,
      'combined',
      'one-time',
      g.target,
      g.total,
      g.starts_at,
      g.ends_at,
      'active',
      g.created_at
    from zikr_app.groups g;

    insert into zikr_app.plan_zikrs (plan_id, zikr_name, zikr_arabic, total, created_at)
    select p.id, g.zikr_name, g.zikr_arabic, g.total, p.created_at
    from zikr_app.groups g
    join zikr_app.plans p on p.migrate_room = g.id;

    insert into zikr_app.plan_owners (plan_id, owner_kind, owner_id)
    select p.id, 'group', p.migrate_room
    from zikr_app.plans p
    where p.migrate_room is not null;

    alter table zikr_app.plans drop column migrate_room;

    -- The goal columns leave the group: a group is its code, title,
    -- owner, members — and now its plans.
    alter table zikr_app.groups
      drop column zikr_name,
      drop column zikr_arabic,
      drop column target,
      drop column total,
      drop column starts_at,
      drop column ends_at;
  end if;
end;
$$;

-- The standalone idempotency ledger is superseded by
-- plan_contributions.event_id.
drop table if exists zikr_app.applied_event_ids;

-- ============================================================
-- 3. Internal helpers (zikr_app — invisible to the API)
-- Bodies are byte-identical to 0001_init.sql (checked by
-- `npm run check:migrations`).
-- ============================================================

-- Unambiguous code alphabet: no 0/O/1/I/L.
create or replace function zikr_app.random_group_code() returns text
language sql volatile as $$
  select array_to_string(
    array(
      select substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', floor(random() * 31)::int + 1, 1)
      from generate_series(1, 6)
    ),
    ''
  );
$$;

create or replace function zikr_app.random_device_token() returns text
language sql volatile as $$
  select array_to_string(
    array(
      select substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', floor(random() * 31)::int + 1, 1)
      from generate_series(1, 12)
    ),
    ''
  );
$$;

create or replace function zikr_app.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from zikr_app.members m
    where m.group_id = p_group_id and m.user_id = p_user_id and m.removed_at is null
  );
$$;

create or replace function zikr_app.is_group_owner(p_group_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from zikr_app.groups g
    where g.id = p_group_id and g.owner_id = p_user_id
  );
$$;

create or replace function zikr_app.group_member_count(p_group_id uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from zikr_app.members m
  where m.group_id = p_group_id and m.removed_at is null;
$$;

create or replace function zikr_app.plan_period_start(p_period text, p_tz text)
returns timestamptz
language sql stable security definer set search_path = public as $$
  select case p_period
    when 'daily'   then (date_trunc('day',   now() at time zone p_tz) at time zone p_tz)
    when 'weekly'  then (date_trunc('week',  now() at time zone p_tz) at time zone p_tz)
    when 'monthly' then (date_trunc('month', now() at time zone p_tz) at time zone p_tz)
    else null
  end
$$;

create or replace function zikr_app.is_plan_group_member(p_plan_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from zikr_app.plan_owners po
    join zikr_app.groups g on g.id = po.owner_id
    where po.plan_id = p_plan_id
      and po.owner_kind = 'group'
      and zikr_app.is_group_member(g.id, p_user_id)
  )
$$;

create or replace function zikr_app.is_plan_group_owner(p_plan_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from zikr_app.plan_owners po
    join zikr_app.groups g on g.id = po.owner_id
    where po.plan_id = p_plan_id
      and po.owner_kind = 'group'
      and zikr_app.is_group_owner(g.id, p_user_id)
  )
$$;

-- Validate a plan payload and insert it (plan + zikrs + group owner
-- row) for a group. SECURITY DEFINER so it owns every write to the
-- plan tables — callers never need table grants on them.
create or replace function zikr_app.insert_plan(p_group_id uuid, p_plan jsonb)
returns zikr_app.plans
language plpgsql volatile security definer set search_path = public as $$
declare
  v_plan    zikr_app.plans;
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
      perform zikr_app.plan_period_start(v_period, v_tz);
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

  insert into zikr_app.plans (title, mode, period, time_zone, target, starts_at, ends_at)
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
    insert into zikr_app.plan_zikrs (plan_id, zikr_name, zikr_arabic, target)
    values (
      v_plan.id,
      v_name,
      nullif(left(btrim(coalesce(v_z->>'arabic', '')), 200), ''),
      case when v_mode = 'per-zikr' then (v_z->>'target')::integer else null end
    );
  end loop;

  insert into zikr_app.plan_owners (plan_id, owner_kind, owner_id)
  values (v_plan.id, 'group', p_group_id);

  return v_plan;
end;
$$;

-- Atomic increment of a plan zikr's lifetime total. (The plan's own
-- total is bumped separately by the status-guarded update in
-- contribute() so the end_plan race is detected — never bump both here.)
create or replace function zikr_app.bump_zikr_total(p_plan_id uuid, p_zikr_name text, p_delta integer)
returns void
language sql volatile security definer set search_path = public as $$
  update zikr_app.plan_zikrs set total = total + p_delta
  where plan_id = p_plan_id and zikr_name = p_zikr_name;
$$;

create or replace function zikr_app.set_plan_ended(p_plan_id uuid)
returns void
language sql volatile security definer set search_path = public as $$
  update zikr_app.plans set status = 'ended', ended_at = now()
  where id = p_plan_id and status = 'active';
$$;

-- ============================================================
-- 4. RLS — rebuild policies on the renamed tables and restate the
-- canonical set everywhere. v1-era policy names are unknown (the v1
-- SQL predates this repo), so groups/members are cleared dynamically;
-- the rest use known names with drop-if-exists.
-- ============================================================

do $$
declare
  r record;
begin
  for r in
    select polname from pg_policy where polrelid = 'zikr_app.groups'::regclass
  loop
    execute format('drop policy %I on zikr_app.groups', r.polname);
  end loop;
  for r in
    select polname from pg_policy where polrelid = 'zikr_app.members'::regclass
  loop
    execute format('drop policy %I on zikr_app.members', r.polname);
  end loop;
end;
$$;

alter table zikr_app.groups enable row level security;
alter table zikr_app.members enable row level security;
alter table zikr_app.devices enable row level security;
alter table zikr_app.analytics_events enable row level security;
alter table zikr_app.plans enable row level security;
alter table zikr_app.plan_zikrs enable row level security;
alter table zikr_app.plan_owners enable row level security;
alter table zikr_app.plan_contributions enable row level security;
alter table zikr_app.plan_daily_totals enable row level security;

-- Group definitions are readable (the app flow is code-gated, and the
-- table has no REST endpoint — only functions select from it).
drop policy if exists "groups readable" on zikr_app.groups;
create policy "groups readable" on zikr_app.groups
  for select using (true);

drop policy if exists "owner inserts group" on zikr_app.groups;
create policy "owner inserts group" on zikr_app.groups
  for insert with check (owner_id = auth.uid());

-- Owners close (status); any active member contributes.
drop policy if exists "owner or member updates group" on zikr_app.groups;
create policy "owner or member updates group" on zikr_app.groups
  for update using (
    zikr_app.is_group_owner(id, auth.uid())
    or zikr_app.is_group_member(id, auth.uid())
  );

-- Members: the roster is readable by current members of that group, and
-- everyone always sees their own membership row — required so that
-- INSERT ... ON CONFLICT DO UPDATE (join/rejoin) can see the proposed row.
drop policy if exists "members readable by group members" on zikr_app.members;
create policy "members readable by group members" on zikr_app.members
  for select using (
    user_id = auth.uid()
    or zikr_app.is_group_member(group_id, auth.uid())
  );

drop policy if exists "users join as themselves" on zikr_app.members;
create policy "users join as themselves" on zikr_app.members
  for insert with check (user_id = auth.uid());

-- Self leaves (own row); owner removes others.
drop policy if exists "self or owner updates member" on zikr_app.members;
create policy "self or owner updates member" on zikr_app.members
  for update using (
    user_id = auth.uid()
    or zikr_app.is_group_owner(group_id, auth.uid())
  );

-- Devices: strictly own-row.
drop policy if exists "own device row" on zikr_app.devices;
create policy "own device row" on zikr_app.devices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Usage events: append-only, and only with your own device token.
drop policy if exists "own device inserts events" on zikr_app.analytics_events;
create policy "own device inserts events" on zikr_app.analytics_events
  for insert with check (
    exists (
      select 1 from zikr_app.devices d
      where d.token = device_token and d.user_id = auth.uid()
    )
  );

-- Plan definitions are readable like group definitions (code-gated flow,
-- no REST endpoint). All writes go through definer helpers.
drop policy if exists "plans readable" on zikr_app.plans;
create policy "plans readable" on zikr_app.plans
  for select using (true);

drop policy if exists "plan zikrs readable" on zikr_app.plan_zikrs;
create policy "plan zikrs readable" on zikr_app.plan_zikrs
  for select using (true);

drop policy if exists "plan owners readable" on zikr_app.plan_owners;
create policy "plan owners readable" on zikr_app.plan_owners
  for select using (true);

-- Contributions: members of the plan's group write replay-safe events
-- and read them back (get_group_state aggregates current-period totals).
drop policy if exists "contributions readable by group members" on zikr_app.plan_contributions;
create policy "contributions readable by group members" on zikr_app.plan_contributions
  for select using (zikr_app.is_plan_group_member(plan_id, auth.uid()));

drop policy if exists "contributions written by group members" on zikr_app.plan_contributions;
create policy "contributions written by group members" on zikr_app.plan_contributions
  for insert with check (zikr_app.is_plan_group_member(plan_id, auth.uid()));

-- Rollups are written only by the service-role purge; nobody reads them
-- back through the API (no policies = deny).

-- ============================================================
-- 5. User-callable RPCs (public, SECURITY INVOKER)
-- Bodies are byte-identical to 0001_init.sql (checked by
-- `npm run check:migrations`).
-- ============================================================

create or replace function public.get_group_state(p_code text)
returns json
language plpgsql stable security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group zikr_app.groups;
begin
  select * into v_group from zikr_app.groups where code = upper(btrim(coalesce(p_code, '')));
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
            select sum(c.delta) from zikr_app.plan_contributions c
            where c.plan_id = pl.id
              and c.created_at >= zikr_app.plan_period_start(pl.period, pl.time_zone)
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
                  select sum(c.delta) from zikr_app.plan_contributions c
                  where c.plan_id = pl.id
                    and c.zikr_name = pz.zikr_name
                    and c.created_at >= zikr_app.plan_period_start(pl.period, pl.time_zone)
                ), 0) end
              ) order by pz.created_at
            )
            from zikr_app.plan_zikrs pz where pz.plan_id = pl.id
          ), '[]'::json)
        ) order by pl.created_at desc
      )
      from zikr_app.plans pl
      where exists (
        select 1 from zikr_app.plan_owners po
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
      from zikr_app.members m
      where m.group_id = v_group.id and m.removed_at is null
    ),
    'isMember', exists (
      select 1 from zikr_app.members m
      where m.group_id = v_group.id and m.user_id = v_uid and m.removed_at is null
    )
  );
end;
$$;

-- Create a group + its first plan + creator's membership, atomically.
create or replace function public.create_group(p_title text, p_name text, p_plan jsonb)
returns json
language plpgsql volatile security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_group zikr_app.groups;
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
    v_code := zikr_app.random_group_code();
    begin
      insert into zikr_app.groups (code, title, owner_id)
      values (v_code, left(btrim(coalesce(p_title, '')), 80), v_uid)
      returning * into v_group;
      exit;
    exception when unique_violation then
      continue; -- code collision, try another
    end;
  end loop;

  insert into zikr_app.members (group_id, user_id, name)
  values (v_group.id, v_uid, left(btrim(p_name), 24));

  perform zikr_app.insert_plan(v_group.id, p_plan);

  return public.get_group_state(v_group.code);
end;
$$;

-- Owner adds another plan to a group (several may run concurrently).
create or replace function public.create_plan(p_code text, p_plan jsonb)
returns json
language plpgsql volatile security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group zikr_app.groups;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_group from zikr_app.groups where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  if v_group.status <> 'active' then
    raise exception 'group_closed';
  end if;
  if v_group.owner_id <> v_uid then
    raise exception 'not_owner';
  end if;

  perform zikr_app.insert_plan(v_group.id, p_plan);

  return public.get_group_state(v_group.code);
end;
$$;

-- Owner retires a plan early (otherwise one-time plans end with their
-- window and recurring plans run until ended).
create or replace function public.end_plan(p_code text, p_plan_id uuid)
returns void
language plpgsql volatile security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not zikr_app.is_plan_group_owner(p_plan_id, v_uid) then
    raise exception 'not_owner';
  end if;
  perform zikr_app.set_plan_ended(p_plan_id);
end;
$$;

-- Groups never expire — joining only needs the code and an open group.
create or replace function public.join_group(p_code text, p_name text)
returns json
language plpgsql volatile security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group zikr_app.groups;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  select * into v_group from zikr_app.groups where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;
  if v_group.status <> 'active' then
    raise exception 'group_closed';
  end if;
  -- Helper sees the whole roster; RLS would hide other members' rows.
  if zikr_app.group_member_count(v_group.id) >= 100 then
    raise exception 'group_full';
  end if;

  -- Join or rejoin (a returning member keeps a single row).
  insert into zikr_app.members (group_id, user_id, name)
  values (v_group.id, v_uid, left(btrim(p_name), 24))
  on conflict (group_id, user_id) do update
    set name = excluded.name, removed_at = null, joined_at = now();

  return public.get_group_state(v_group.code);
end;
$$;

-- Atomic, idempotent contribution against one zikr of one plan.
-- The ONLY way counts change.
create or replace function public.contribute(
  p_code text,
  p_plan_id uuid,
  p_zikr_name text,
  p_delta integer,
  p_event_id uuid
) returns json
language plpgsql volatile security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group zikr_app.groups;
  v_plan zikr_app.plans;
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

  select * into v_group from zikr_app.groups
  where code = upper(btrim(coalesce(p_code, ''))) and status = 'active';
  if not found then
    raise exception 'group_not_found' using errcode = 'P0002';
  end if;

  select pl.* into v_plan from zikr_app.plans pl
  where pl.id = p_plan_id
    and exists (
      select 1 from zikr_app.plan_owners po
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
    v_period_start := zikr_app.plan_period_start(v_plan.period, v_plan.time_zone);
  end if;

  if not exists (
    select 1 from zikr_app.plan_zikrs pz
    where pz.plan_id = v_plan.id and pz.zikr_name = btrim(p_zikr_name)
  ) then
    raise exception 'zikr_not_in_plan';
  end if;

  if not zikr_app.is_group_member(v_group.id, v_uid) then
    raise exception 'not_a_member';
  end if;

  -- Idempotency: a retried event is acknowledged without re-applying.
  insert into zikr_app.plan_contributions (event_id, plan_id, zikr_name, delta)
  values (p_event_id, v_plan.id, btrim(p_zikr_name), p_delta)
  on conflict (event_id) do nothing;
  if not found then
    select total into v_total from zikr_app.plans where id = v_plan.id;
    select coalesce(sum(c.delta), 0) into v_period_total
    from zikr_app.plan_contributions c
    where c.plan_id = v_plan.id
      and (v_period_start is null or c.created_at >= v_period_start);
    return json_build_object('total', v_total, 'periodTotal', v_period_total);
  end if;

  -- The increment is atomic; the plan status guard closes the race with end_plan.
  update zikr_app.plans set total = total + p_delta
  where id = v_plan.id and status = 'active'
  returning total into v_total;
  if not found then
    raise exception 'plan_ended';
  end if;
  perform zikr_app.bump_zikr_total(v_plan.id, btrim(p_zikr_name), p_delta);

  select coalesce(sum(c.delta), 0) into v_period_total
  from zikr_app.plan_contributions c
  where c.plan_id = v_plan.id
    and (v_period_start is null or c.created_at >= v_period_start);

  return json_build_object('total', v_total, 'periodTotal', v_period_total);
end;
$$;

create or replace function public.remove_member(p_code text, p_user_id uuid)
returns void
language plpgsql volatile security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group zikr_app.groups;
begin
  select * into v_group from zikr_app.groups where code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'group_not_found' using errcode = 'P0002'; end if;
  if v_group.owner_id <> v_uid then raise exception 'not_owner'; end if;

  update zikr_app.members set removed_at = now()
  where group_id = v_group.id and user_id = p_user_id and removed_at is null;
end;
$$;

create or replace function public.leave_group(p_code text)
returns void
language plpgsql volatile security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  update zikr_app.members set removed_at = now()
  where user_id = v_uid and removed_at is null
    and group_id = (select id from zikr_app.groups where code = upper(btrim(coalesce(p_code, ''))));
end;
$$;

create or replace function public.close_group(p_code text)
returns void
language plpgsql volatile security invoker set search_path = public as $$
begin
  update zikr_app.groups set status = 'closed'
  where code = upper(btrim(coalesce(p_code, '')))
    and owner_id = auth.uid()
    and status = 'active';
  if not found then raise exception 'not_owner_or_not_found'; end if;
end;
$$;

-- Issued once per device (anon user), refreshed on every call. The client
-- stores the token in IndexedDB and treats it as its stable device key.
create or replace function public.get_or_create_device_token()
returns text
language plpgsql volatile security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select token into v_token from zikr_app.devices where user_id = v_uid;
  if found then
    update zikr_app.devices set last_seen_at = now() where user_id = v_uid;
    return v_token;
  end if;

  loop
    v_token := zikr_app.random_device_token();
    begin
      insert into zikr_app.devices (token, user_id) values (v_token, v_uid);
      return v_token;
    exception when unique_violation then
      continue;
    end;
  end loop;
end;
$$;

-- Best-effort usage event. Never raises: metrics must not break the app.
create or replace function public.track_event(p_name text, p_properties jsonb default '{}')
returns void
language plpgsql volatile security invoker set search_path = public as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    return;
  end if;

  select token into v_token from zikr_app.devices where user_id = auth.uid();
  if found then
    update zikr_app.devices set last_seen_at = now() where user_id = auth.uid();
  else
    v_token := public.get_or_create_device_token();
  end if;

  insert into zikr_app.analytics_events (device_token, name, properties)
  values (v_token, left(p_name, 40), p_properties);
end;
$$;

-- Housekeeping — the ONLY purge_expired on the server (the shared-zikrs
-- migration deliberately does not define one). See 0001 for the
-- retention rules.
create or replace function public.purge_expired()
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from zikr_app.analytics_events where created_at < now() - interval '90 days';

  insert into zikr_app.plan_daily_totals (plan_id, day, zikr_name, total)
  select plan_id, (created_at at time zone 'UTC')::date, zikr_name, sum(delta)
  from zikr_app.plan_contributions
  where created_at < now() - interval '90 days'
  group by plan_id, (created_at at time zone 'UTC')::date, zikr_name
  on conflict (plan_id, day, zikr_name)
    do update set total = zikr_app.plan_daily_totals.total + excluded.total;

  delete from zikr_app.plan_contributions where created_at < now() - interval '90 days';

  delete from zikr_app.shared_zikrs where not verified and submitted_at < now() - interval '180 days';
end;
$$;

-- ============================================================
-- 6. Dead-surface cleanup
-- ============================================================

-- The interim room-named RPC surface (a previous partial application of
-- this migration) and the v1 backward-compat shims — no released client
-- calls them. Exact signatures: the interim surface is fully known.
drop function if exists public.get_room_state(text);
drop function if exists public.join_room(text, text);
drop function if exists public.leave_room(text);
drop function if exists public.close_room(text);
drop function if exists public.remove_member(text, uuid);
drop function if exists public.contribute(text, uuid, text, integer, uuid);
drop function if exists public.contribute(text, integer, uuid);
drop function if exists public.create_room(text, text, text, integer, timestamptz, timestamptz, text);

-- v1-era zikr_app functions (rooms/goals flow + old helpers). Dropped by
-- name regardless of signature — the v1 SQL predates this repo. Helpers
-- still in use (insert_plan, bump_zikr_total, set_plan_ended,
-- plan_period_start, random_device_token) are NOT in this list, nor is
-- the shared-zikrs trigger function.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'zikr_app'
      and p.proname in (
        'get_room_state', 'create_room', 'join_room', 'leave_room', 'close_room',
        'remove_member', 'contribute', 'track_event', 'get_or_create_device_token',
        'purge_expired', 'is_room_member', 'is_room_owner', 'room_member_count',
        'random_room_code', 'is_plan_room_member', 'is_plan_room_owner'
      )
  loop
    begin
      execute format('drop function %s', r.fn);
    exception when dependent_objects_still_exist then
      -- A v1 leftover we don't know about still references it; leave it
      -- rather than cascade into something unseen.
      raise notice 'keeping % — still depended on', r.fn;
    end;
  end loop;
end;
$$;

-- ============================================================
-- 7. Table grants — the minimum the invoker RPCs need
-- ============================================================

grant usage on schema zikr_app to anon, authenticated;

grant select, insert, update (status) on zikr_app.groups to anon, authenticated;
grant select, insert, update (name, joined_at, removed_at) on zikr_app.members to anon, authenticated;
grant select, insert, update (last_seen_at) on zikr_app.devices to anon, authenticated;
grant insert on zikr_app.analytics_events to anon, authenticated;
grant select on zikr_app.plans to anon, authenticated;
grant select on zikr_app.plan_zikrs to anon, authenticated;
grant select on zikr_app.plan_owners to anon, authenticated;
grant select, insert on zikr_app.plan_contributions to anon, authenticated;

-- ============================================================
-- 8. EXECUTE surface — refresh the deliberate grant list
-- ============================================================

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.get_group_state(text) to anon, authenticated;
grant execute on function public.create_group(text, text, jsonb) to anon, authenticated;
grant execute on function public.create_plan(text, jsonb) to anon, authenticated;
grant execute on function public.end_plan(text, uuid) to anon, authenticated;
grant execute on function public.join_group(text, text) to anon, authenticated;
grant execute on function public.contribute(text, uuid, text, integer, uuid) to anon, authenticated;
grant execute on function public.remove_member(text, uuid) to anon, authenticated;
grant execute on function public.leave_group(text) to anon, authenticated;
grant execute on function public.close_group(text) to anon, authenticated;
grant execute on function public.get_or_create_device_token() to anon, authenticated;
grant execute on function public.track_event(text, jsonb) to anon, authenticated;

grant execute on function public.purge_expired() to service_role;

-- The revoke above wipes EVERY public function, including the
-- shared-zikr RPCs when this migration runs after 0002_shared_zikrs.
-- Re-grant them (no-op when that migration hasn't run yet — its own
-- grant block covers the other order).
do $$
begin
  grant execute on function public.share_zikr(text, text, text) to anon, authenticated;
  grant execute on function public.pull_verified_zikrs(timestamptz, uuid) to anon, authenticated;
exception
  when undefined_object or undefined_function then null; -- shared-zikrs not applied yet
end $$;
