-- ============================================================
-- 0004 — User feedback (captcha-protected, admin-read).
--
-- Flow:
--   1. A signed-in user submits feedback via public.submit_feedback().
--      When the deployment has Turnstile captcha enabled (a secret under
--      key 'turnstile_secret' in zikr_app.app_config), the client's token
--      is verified server-side against Cloudflare's siteverify endpoint
--      through the `http` extension. The client's VITE_TURNSTILE_SITE_KEY
--      and this secret are ONE pair — flip them together (see
--      EXPOSURE-RULES.md); with neither set, feedback works uncaptcha'd.
--   2. The admin reads and resolves rows in the dashboard (Table Editor /
--      SQL). There is no read RPC on purpose: feedback is one-way, and
--      RLS lets a user see only their own rows.
--   3. Rate limit: max 5 submissions per user per 24h, checked in SQL
--      BEFORE the captcha call, so a spammer never reaches siteverify.
--   4. Feedback rows are NEVER auto-purged — they are the deliverable.
--      (Do not add them to purge_expired: this file's functions are not
--      mirrored into 0001/0002, which keep their own shared bodies.)
--
-- Same security model as 0001/0003: tables live in zikr_app
-- (API-invisible), access only through SECURITY INVOKER RPCs in public.
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
-- Tables (zikr_app)
-- ============================================================

-- Private deployment config. Today: the Turnstile secret. RLS on, NO
-- policies, NO grants — reachable only from the security definer helper
-- below (owner privileges) and the dashboard.
create table if not exists zikr_app.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table zikr_app.app_config enable row level security;

-- One-way messages from users to the admin. Insert via RPC only; a user
-- can read back their own rows (the rate-limit count needs it), nobody
-- can read anyone else's, and no client can ever update or delete.
create table if not exists zikr_app.feedback (
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
  on zikr_app.feedback (user_id, created_at);

alter table zikr_app.feedback enable row level security;

drop policy if exists "own feedback readable" on zikr_app.feedback;
create policy "own feedback readable" on zikr_app.feedback
  for select using (user_id = auth.uid());

drop policy if exists "users submit feedback as themselves" on zikr_app.feedback;
create policy "users submit feedback as themselves" on zikr_app.feedback
  for insert with check (user_id = auth.uid());

grant select, insert on zikr_app.feedback to anon, authenticated;

-- ============================================================
-- Internal helper (zikr_app — invisible to the API)
-- ============================================================

-- Verify a Turnstile token against Cloudflare siteverify. SECURITY
-- DEFINER: it must read zikr_app.app_config, which no API role can see.
--
--   secret not configured → true (captcha is off for this deployment;
--     the client ships no site key either — the pair flips together)
--   secret configured, token missing/invalid/siteverify unreachable →
--     false (fail closed: a configured secret means captcha is ON)
create or replace function zikr_app.verify_turnstile(p_token text)
returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_secret  text;
  v_success boolean;
begin
  select value into v_secret from zikr_app.app_config where key = 'turnstile_secret';
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
create or replace function public.submit_feedback(
  p_category text,
  p_message text,
  p_email text default null,
  p_app_version text default null,
  p_locale text default null,
  p_user_agent text default null,
  p_captcha_token text default null
) returns json
language plpgsql volatile security invoker set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_recent integer;
  v_row    zikr_app.feedback;
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
  from zikr_app.feedback
  where user_id = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'rate_limited';
  end if;

  -- Cloudflare Turnstile: verified whenever the deployment configured a
  -- secret; skipped when captcha is off (see verify_turnstile).
  if not zikr_app.verify_turnstile(p_captcha_token) then
    raise exception 'captcha_failed';
  end if;

  insert into zikr_app.feedback
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

revoke execute on function public.submit_feedback(text, text, text, text, text, text, text) from public;
grant execute on function public.submit_feedback(text, text, text, text, text, text, text) to anon, authenticated;
