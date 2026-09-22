-- ============================================================
-- EXAMPLE: behavioral tests for the schema, run as the client roles.
--
-- Usage (from supabase/):
--   docker compose up -d --wait
--   docker compose exec -T db psql -U postgres -d zikr_local \
--     -v ON_ERROR_STOP=1 < local-test/example.tests.sql
--
-- The pattern: impersonate a device by setting the JWT claims GUC, then
-- SET ROLE authenticated — RLS policies and security invoker RPCs now
-- behave exactly as they would through PostgREST. Works for triggers too.
-- This file is tied to the current schema shape; update it as the
-- migrations evolve (or keep per-feature test files alongside it).
-- ============================================================

-- 0. Seed test identities (as postgres; auth.users is the FK target for
--    devices.user_id). Test users are fixed UUIDs so claims can reference them.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

set role authenticated;

---------------------------------------------------------------
-- 1. Device token + track_event (U1)
---------------------------------------------------------------
do $$
declare
  v_token text;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);

  v_token := public.get_or_create_device_token();
  if char_length(v_token) <> 12 then raise exception 'FAIL: token length %', v_token; end if;
  -- Second call returns the same token (issued once per device).
  if public.get_or_create_device_token() <> v_token then raise exception 'FAIL: token not stable'; end if;

  perform public.track_event('app_opened');
  raise notice 'OK device token + track_event';
end $$;

---------------------------------------------------------------
-- 2. create_group: shape, membership, first plan (U1)
---------------------------------------------------------------
do $$
declare
  r jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);

  r := public.create_group('Test Room', 'Ahmed', jsonb_build_object(
    'mode', 'per-zikr',
    'period', 'daily',
    'timeZone', 'UTC',
    'zikrs', jsonb_build_array(
      jsonb_build_object('name', 'Alhamdulillah', 'arabic', 'ٱلْحَمْدُ لِلَّٰهِ', 'target', 100)
    )
  ));

  -- Single wrap: {group, plans, members, isMember}.
  if (r -> 'group' ->> 'code') is null then raise exception 'FAIL: no group.code'; end if;
  if (r -> 'group' -> 'group') is not null then raise exception 'FAIL: double-wrapped payload'; end if;
  if (r ->> 'isMember')::boolean is not true then raise exception 'FAIL: creator not member'; end if;
  if jsonb_array_length(r -> 'members') <> 1 then raise exception 'FAIL: expected 1 member'; end if;
  if (r -> 'members' -> 0 ->> 'name') <> 'Ahmed' then raise exception 'FAIL: member name'; end if;
  if jsonb_array_length(r -> 'plans') <> 1 then raise exception 'FAIL: expected 1 plan'; end if;
  if (r -> 'plans' -> 0 -> 'zikrs' -> 0 ->> 'name') <> 'Alhamdulillah' then
    raise exception 'FAIL: plan zikr name';
  end if;

  perform set_config('app.test_code', r -> 'group' ->> 'code', false);
  perform set_config('app.test_plan', r -> 'plans' -> 0 ->> 'id', false);
  raise notice 'OK create_group (%s)', r -> 'group' ->> 'code';
end $$;

---------------------------------------------------------------
-- 3. contribute: apply, idempotent replay, validation (U1)
---------------------------------------------------------------
do $$
declare
  v_code text := current_setting('app.test_code');
  v_plan uuid := current_setting('app.test_plan')::uuid;
  v_total integer;
  -- Fresh per run: the replay check below calls contribute twice with the
  -- same id; a fixed literal would collide with earlier runs of this file.
  ev1 uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);

  v_total := (public.contribute(v_code, v_plan, 'Alhamdulillah', 10, ev1) ->> 'total')::int;
  if v_total <> 10 then raise exception 'FAIL: expected total 10, got %', v_total; end if;

  -- Replay of the same event id must not double-apply.
  v_total := (public.contribute(v_code, v_plan, 'Alhamdulillah', 10, ev1) ->> 'total')::int;
  if v_total <> 10 then raise exception 'FAIL: replay changed total to %', v_total; end if;

  -- Validation errors surface with the app's codes.
  begin
    perform public.contribute(v_code, v_plan, 'Alhamdulillah', 0, gen_random_uuid());
    raise exception 'FAIL: zero delta accepted';
  exception when others then
    if sqlerrm <> 'invalid_delta' then raise exception 'FAIL: expected invalid_delta, got "%"', sqlerrm; end if;
  end;

  begin
    perform public.contribute('NOPE', v_plan, 'Alhamdulillah', 5, gen_random_uuid());
    raise exception 'FAIL: unknown group accepted';
  exception when others then
    if sqlerrm <> 'group_not_found' then raise exception 'FAIL: expected group_not_found, got "%"', sqlerrm; end if;
  end;

  begin
    perform public.contribute(v_code, v_plan, 'SubhanAllah', 5, gen_random_uuid());
    raise exception 'FAIL: zikr outside plan accepted';
  exception when others then
    if sqlerrm <> 'zikr_not_in_plan' then raise exception 'FAIL: expected zikr_not_in_plan, got "%"', sqlerrm; end if;
  end;

  raise notice 'OK contribute (apply, replay, validation)';
end $$;

---------------------------------------------------------------
-- 4. join_group + multi-member contribute (U2)
---------------------------------------------------------------
do $$
declare
  v_code text := current_setting('app.test_code');
  v_plan uuid := current_setting('app.test_plan')::uuid;
  r jsonb;
  v_total integer;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);

  r := public.join_group(v_code, 'Bilal');
  if (r ->> 'isMember')::boolean is not true then raise exception 'FAIL: joiner not member'; end if;
  if jsonb_array_length(r -> 'members') <> 2 then raise exception 'FAIL: expected 2 members'; end if;

  v_total := (public.contribute(v_code, v_plan, 'Alhamdulillah', 33, gen_random_uuid()) ->> 'total')::int;
  if v_total <> 43 then raise exception 'FAIL: expected total 43, got %', v_total; end if;

  raise notice 'OK join_group + member contribute';
end $$;

---------------------------------------------------------------
-- 5. Membership / ownership enforcement
---------------------------------------------------------------
do $$
declare
  v_code text := current_setting('app.test_code');
  r2 jsonb;
  v_code2 text;
  v_plan2 uuid;
begin
  -- U1 creates a second group; U2 (non-member) must be rejected by it.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
  r2 := public.create_group('Room 2', 'A', jsonb_build_object(
    'mode', 'per-zikr',
    'period', 'daily',
    'timeZone', 'UTC',
    'zikrs', jsonb_build_array(jsonb_build_object('name', 'SubhanAllah', 'target', 50))
  ));
  v_code2 := r2 -> 'group' ->> 'code';
  v_plan2 := (r2 -> 'plans' -> 0 ->> 'id')::uuid;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
  begin
    perform public.contribute(v_code2, v_plan2, 'SubhanAllah', 5, gen_random_uuid());
    raise exception 'FAIL: non-member could contribute';
  exception when others then
    if sqlerrm <> 'not_a_member' then raise exception 'FAIL: expected not_a_member, got "%"', sqlerrm; end if;
  end;

  -- Non-owner cannot close.
  begin
    perform public.close_group(v_code2);
    raise exception 'FAIL: non-owner closed the group';
  exception when others then
    if sqlerrm <> 'not_owner_or_not_found' then raise exception 'FAIL: expected not_owner_or_not_found, got "%"', sqlerrm; end if;
  end;

  -- Owner closes; then the group is un-contributeable.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
  perform public.close_group(v_code2);
  if (public.get_group_state(v_code2) -> 'group' ->> 'status') <> 'closed' then
    raise exception 'FAIL: group not closed';
  end if;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
  begin
    perform public.contribute(v_code2, v_plan2, 'SubhanAllah', 5, gen_random_uuid());
    raise exception 'FAIL: contributed to closed group';
  exception when others then
    if sqlerrm <> 'group_not_found' then raise exception 'FAIL: expected group_not_found after close, got "%"', sqlerrm; end if;
  end;

  raise notice 'OK membership/ownership/close enforcement';
end $$;

---------------------------------------------------------------
-- 6. leave_group, remove_member, RLS visibility
---------------------------------------------------------------
do $$
declare
  v_code text := current_setting('app.test_code');
  v_plan uuid := current_setting('app.test_plan')::uuid;
  r jsonb;
  v_n int;
begin
  -- U2 leaves the main group.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
  perform public.leave_group(v_code);
  r := public.get_group_state(v_code);
  -- Non-members no longer see the roster (RLS) — they see isMember=false.
  if (r ->> 'isMember')::boolean then raise exception 'FAIL: leaver still member'; end if;
  -- The owner still sees the shrunken roster.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
  r := public.get_group_state(v_code);
  if jsonb_array_length(r -> 'members') <> 1 then raise exception 'FAIL: leave did not shrink roster'; end if;

  -- Back as U2: no longer a member, cannot contribute.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
  begin
    perform public.contribute(v_code, v_plan, 'Alhamdulillah', 5, gen_random_uuid());
    raise exception 'FAIL: leaver contributed';
  exception when others then
    if sqlerrm <> 'not_a_member' then raise exception 'FAIL: expected not_a_member after leave, got "%"', sqlerrm; end if;
  end;

  -- U2 rejoins; owner removes them.
  perform public.join_group(v_code, 'Bilal');
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
  perform public.remove_member(v_code, '00000000-0000-0000-0000-000000000002');
  select jsonb_array_length((public.get_group_state(v_code) -> 'members')::jsonb) into v_n;
  if v_n <> 1 then raise exception 'FAIL: removed member still listed (%s)', v_n; end if;

  -- Non-owner cannot remove members.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
  begin
    perform public.remove_member(v_code, '00000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: non-owner removed a member';
  exception when others then
    if sqlerrm <> 'not_owner' then raise exception 'FAIL: expected not_owner, got "%"', sqlerrm; end if;
  end;

  raise notice 'OK leave/remove flows';
end $$;

---------------------------------------------------------------
-- 7. Privilege surface: what a client can and cannot touch
---------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);

  -- RLS member visibility: a policy self-query must not recurse, and a
  -- member sees their room's roster rows.
  if (select count(*) from zikr_app.members) < 1 then raise exception 'FAIL: member sees no roster rows'; end if;

  -- Analytics are insert-only: no select grant.
  begin
    perform count(*) from zikr_app.analytics_events;
    raise exception 'FAIL: client read analytics_events';
  exception when insufficient_privilege then
    null; -- expected
  end;

  -- Purge is service-role only.
  begin
    perform public.purge_expired();
    raise exception 'FAIL: client called purge_expired';
  exception when insufficient_privilege then
    null; -- expected
  end;

  raise notice 'OK privilege surface';
end $$;

---------------------------------------------------------------
-- 8. service_role can purge
---------------------------------------------------------------
set role service_role;
do $$
begin
  perform public.purge_expired();
  raise notice 'OK service_role purge';
end $$;

reset role;

---------------------------------------------------------------
-- 9. Shared zikr library: share → verify → pull (cursor pagination)
--    Regression: pull_verified_zikrs once referenced its `page` CTE in a
--    later statement — plpgsql then resolves it as a TABLE and every call
--    fails with 42P01 relation "page" does not exist. These tests call the
--    function so that failure class can never ship silently again.
---------------------------------------------------------------
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
set role authenticated;

do $$
begin
  perform public.share_zikr('Test Zikr Alpha', 'الحمد لله', 'Praise be to Allah');
  perform public.share_zikr('Test Zikr Beta', null, null);
  raise notice 'OK share_zikr inserts unverified';
end $$;

-- Duplicate names are rejected case-insensitively with the app error code.
do $$
begin
  perform public.share_zikr('test zikr alpha', null, null);
  raise exception 'FAIL: duplicate accepted';
exception
  when others then
    if sqlerrm <> 'duplicate_name' then
      raise exception 'FAIL: unexpected error %', sqlerrm;
    end if;
end $$;

-- Empty pull: a clean empty page, no cursor, no more.
do $$
declare r json;
begin
  r := public.pull_verified_zikrs(null, null);
  assert coalesce(json_array_length(r->'items'), 0) = 0, 'expected empty pull';
  assert not (r->>'hasMore')::boolean, 'empty pull must not have more';
  raise notice 'OK pull empty';
end $$;

-- Admin verifies exactly one zikr; the trigger bumps updated_at, which is
-- what re-delivers the row to clients that already pulled it.
reset role;
update zikr_app.shared_zikrs set verified = true, verified_at = now()
where name = 'Test Zikr Alpha';
set role authenticated;

do $$
declare r json;
begin
  r := public.pull_verified_zikrs(null, null);
  assert json_array_length(r->'items') = 1, 'expected exactly the verified row';
  assert r->'items'->0->>'name' = 'Test Zikr Alpha', 'wrong row delivered';
  assert not (r->>'hasMore')::boolean, 'single row must not have more';
  raise notice 'OK pull verified-only';
end $$;

-- Boundary: exactly 100 verified → one full page, hasMore = false (a wrong
-- hasMore here stalls the client cursor on a complete page).
reset role;
insert into zikr_app.shared_zikrs (name, verified, updated_at)
select 'bulk ' || g, true, now() + (g * interval '1 second')
from generate_series(1, 99) g;
set role authenticated;
do $$
declare r json;
begin
  r := public.pull_verified_zikrs(null, null);
  assert json_array_length(r->'items') = 100, 'expected a full page of 100';
  assert not (r->>'hasMore')::boolean, 'exactly-100 must be terminal';
  raise notice 'OK pull exactly-100 boundary';
end $$;

-- One more verified row flips hasMore; the cursor walk then terminates on
-- a short page with every row delivered exactly once.
reset role;
insert into zikr_app.shared_zikrs (name, verified) values ('bulk 100', true);
set role authenticated;
do $$
declare r json; n int; total int := 0; pages int := 0; has_more boolean := true;
        cur_ua timestamptz; cur_id uuid;
begin
  while has_more and pages < 5 loop
    r := public.pull_verified_zikrs(cur_ua, cur_id);
    n := coalesce(json_array_length(r->'items'), 0);
    total := total + n; pages := pages + 1;
    has_more := (r->>'hasMore')::boolean;
    cur_ua := (r->>'nextCursorUpdatedAt')::timestamptz;
    cur_id := (r->>'nextCursorId')::uuid;
  end loop;
  assert total = 101 and pages = 2,
    'expected 101 rows over 2 pages, got ' || total || '/' || pages;
  raise notice 'OK pull walk 101 over 2 pages';
end $$;

reset role;
select 'ALL TESTS PASSED' as result;
