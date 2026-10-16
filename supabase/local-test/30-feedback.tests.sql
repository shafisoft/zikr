-- ============================================================
-- Feedback behavioral tests (0004_feedback.sql), run as the client roles.
--
-- Usage (from supabase/):
--   docker compose up -d --wait
--   docker compose exec -T db psql -U postgres -d zikr_local \
--     -v ON_ERROR_STOP=1 < local-test/30-feedback.tests.sql
--
-- Same pattern as example.tests.sql: impersonate a device via the JWT
-- claims GUC, then SET ROLE authenticated. Self-contained (seeds its own
-- users, clears its own rows) so it can run standalone or repeatedly.
-- ============================================================

-- Fresh slate: the rate limit counts rows within the last 24h, so stale
-- rows from a previous run of this file would poison it.
reset role;
delete from zikr_private.feedback;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

set role authenticated;

---------------------------------------------------------------
-- 1. Attribution: anonymous callers are rejected
---------------------------------------------------------------
do $$
begin
  -- JSON null = no session (an empty string would break the ::jsonb cast
  -- in the harness auth.uid() before our check is even reached).
  perform set_config('request.jwt.claims', 'null', false);
  begin
    perform public.submit_feedback('bug', 'no session here');
    raise exception 'FAIL: anonymous feedback accepted';
  exception when others then
    if sqlerrm <> 'not_authenticated' then raise exception 'FAIL: expected not_authenticated, got "%"', sqlerrm; end if;
  end;
  raise notice 'OK anonymous rejected';
end $$;

---------------------------------------------------------------
-- 2. Valid submit: forced attribution, returned id, trimming
---------------------------------------------------------------
do $$
declare
  r json;
  v_user uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);

  r := public.submit_feedback(
    'bug',
    '  The counter loses my round when I switch tabs.  ',
    'me@example.com',
    '1.9.1',
    'en',
    'Mozilla/5.0 (test runner)',
    null
  );

  select user_id into v_user from zikr_private.feedback where id = (r ->> 'id')::uuid;
  if v_user is distinct from '00000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'FAIL: row not attributed to the caller';
  end if;
  if (select message from zikr_private.feedback where id = (r ->> 'id')::uuid)
       <> 'The counter loses my round when I switch tabs.' then
    raise exception 'FAIL: message not trimmed';
  end if;
  if (select status from zikr_private.feedback where id = (r ->> 'id')::uuid) <> 'new' then
    raise exception 'FAIL: status must default to new';
  end if;
  raise notice 'OK valid submit (attributed, trimmed)';
end $$;

---------------------------------------------------------------
-- 3. Validation codes
---------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);

  begin
    perform public.submit_feedback('rant', 'valid message');
    raise exception 'FAIL: unknown category accepted';
  exception when others then
    if sqlerrm <> 'invalid_category' then raise exception 'FAIL: expected invalid_category, got "%"', sqlerrm; end if;
  end;

  begin
    perform public.submit_feedback('bug', '   ');
    raise exception 'FAIL: whitespace-only message accepted';
  exception when others then
    if sqlerrm <> 'invalid_message' then raise exception 'FAIL: expected invalid_message, got "%"', sqlerrm; end if;
  end;

  begin
    perform public.submit_feedback('bug', repeat('x', 2001));
    raise exception 'FAIL: overlong message accepted';
  exception when others then
    if sqlerrm <> 'invalid_message' then raise exception 'FAIL: expected invalid_message, got "%"', sqlerrm; end if;
  end;

  begin
    perform public.submit_feedback('bug', 'valid message', 'not-an-email');
    raise exception 'FAIL: malformed email accepted';
  exception when others then
    if sqlerrm <> 'invalid_email' then raise exception 'FAIL: expected invalid_email, got "%"', sqlerrm; end if;
  end;

  -- A long user agent is truncated, not rejected.
  perform public.submit_feedback('suggestion', 'valid message', null, null, null, repeat('UA ', 100), null);
  if (select char_length(user_agent) from zikr_private.feedback where category = 'suggestion') > 200 then
    raise exception 'FAIL: user_agent not truncated';
  end if;

  raise notice 'OK validation codes';
end $$;

---------------------------------------------------------------
-- 4. Rate limit: 5 per user per 24h, BEFORE the captcha call
---------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
  select count(*) into v_count from zikr_private.feedback where user_id = auth.uid();
  while v_count < 5 loop
    perform public.submit_feedback('other', 'filler message ' || v_count);
    select count(*) into v_count from zikr_private.feedback where user_id = auth.uid();
  end loop;

  begin
    perform public.submit_feedback('bug', 'number six should fail');
    raise exception 'FAIL: sixth submission in 24h accepted';
  exception when others then
    if sqlerrm <> 'rate_limited' then raise exception 'FAIL: expected rate_limited, got "%"', sqlerrm; end if;
  end;
  raise notice 'OK rate limit (5/24h)';
end $$;

---------------------------------------------------------------
-- 5. RLS: a user sees only their own rows; no UPDATE/DELETE grants
---------------------------------------------------------------
do $$
begin
  -- U2 must not see U1's five rows.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
  if (select count(*) from zikr_private.feedback) <> 0 then
    raise exception 'FAIL: U2 can read another user''s feedback';
  end if;

  -- No update/delete grants: append-only for clients.
  begin
    update zikr_private.feedback set status = 'resolved';
    raise exception 'FAIL: client updated feedback';
  exception when insufficient_privilege then
    null; -- expected
  end;
  begin
    delete from zikr_private.feedback;
    raise exception 'FAIL: client deleted feedback';
  exception when insufficient_privilege then
    null; -- expected
  end;
  raise notice 'OK RLS own-rows + append-only';
end $$;

---------------------------------------------------------------
-- 6. Captcha: fail closed once a secret is configured
---------------------------------------------------------------
do $$
begin
  -- No secret configured → verification is skipped (captcha off).
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
  perform public.submit_feedback('question', 'no captcha configured yet');

  -- Admin configures the Turnstile secret (as postgres, below).
  reset role;
  insert into zikr_private.app_config (key, value) values ('turnstile_secret', '1x0000000000000000000000000000000AA')
  on conflict (key) do update set value = excluded.value;
  set role authenticated;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
  begin
    perform public.submit_feedback('question', 'secret set but no token sent');
    raise exception 'FAIL: feedback accepted without a captcha token';
  exception when others then
    if sqlerrm <> 'captcha_failed' then raise exception 'FAIL: expected captcha_failed, got "%"', sqlerrm; end if;
  end;

  -- The secret row is invisible to clients (no grant, RLS, no policies).
  begin
    perform count(*) from zikr_private.app_config;
    raise exception 'FAIL: client read app_config';
  exception when insufficient_privilege then
    null; -- expected
  end;
  raise notice 'OK captcha fail-closed + secret invisible';
end $$;

-- Back to no-secret: submissions flow again (and U2 stays under the cap).
reset role;
delete from zikr_private.app_config where key = 'turnstile_secret';
set role authenticated;
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
  perform public.submit_feedback('question', 'secret removed, uncaptcha''d flow restored');
  raise notice 'OK captcha-off flow';
end $$;

---------------------------------------------------------------
-- 7. An admin (postgres) reads and resolves — the dashboard flow
---------------------------------------------------------------
reset role;
update zikr_private.feedback set status = 'resolved'
where user_id = '00000000-0000-0000-0000-000000000001'::uuid and category = 'bug';
do $$
declare v_resolved integer;
begin
  select count(*) into v_resolved from zikr_private.feedback
  where user_id = '00000000-0000-0000-0000-000000000001'::uuid and status = 'resolved';
  if v_resolved < 1 then raise exception 'FAIL: admin could not resolve feedback'; end if;
  raise notice 'OK admin read/resolve flow';
end $$;

reset role;
select 'ALL FEEDBACK TESTS PASSED' as result;
