-- ============================================================
-- 0002 — Shared zikr library (crowdsourced, admin-verified).
--
-- Flow:
--   1. A client shares a custom zikr via public.share_zikr() —
--      inserted with verified = false.
--   2. The admin reviews unverified rows directly in the table
--      (Table Editor / SQL) and flips verified/verified_at, also
--      bumping updated_at. Optionally fixes texts at the same time.
--   3. Clients pull via public.pull_verified_zikrs(p_cursor) —
--      cursor-paginated on (updated_at, id), 100 rows per call.
--
-- Same security model as 0001: table lives in zikr_app (API-invisible),
-- access only through SECURITY INVOKER RPCs in public, execute granted
-- deliberately.
-- ============================================================

create table if not exists zikr_app.shared_zikrs (
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
  on zikr_app.shared_zikrs (lower(btrim(name)));

-- Pull cursor scan path.
create index if not exists shared_zikrs_updated_idx
  on zikr_app.shared_zikrs (updated_at, id) where verified;

alter table zikr_app.shared_zikrs enable row level security;

-- Definitions are public once verified; inserts are self-attributed.
create policy "verified zikrs readable" on zikr_app.shared_zikrs
  for select using (true);

create policy "users submit as themselves" on zikr_app.shared_zikrs
  for insert with check (submitted_by = auth.uid());

-- Bump updated_at whenever a row changes (so pulls re-deliver edits).
create or replace function zikr_app.shared_zikrs_touch_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists shared_zikrs_touch on zikr_app.shared_zikrs;
create trigger shared_zikrs_touch
  before update on zikr_app.shared_zikrs
  for each row execute function zikr_app.shared_zikrs_touch_updated_at();

-- ============================================================
-- Table grants
-- ============================================================

grant select, insert on zikr_app.shared_zikrs to anon, authenticated;

-- ============================================================
-- User-callable RPCs (public, SECURITY INVOKER)
-- ============================================================

-- Submit a custom zikr for review. Inserted unverified; it becomes
-- visible to other users only after the admin verifies it.
create or replace function public.share_zikr(
  p_name text,
  p_arabic_text text,
  p_translation text
) returns json
language plpgsql volatile security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row zikr_app.shared_zikrs;
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

  insert into zikr_app.shared_zikrs (name, arabic_text, translation, submitted_by)
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
create or replace function public.pull_verified_zikrs(
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null
) returns json
language plpgsql stable security invoker set search_path = public as $$
declare
  v_page_size constant integer := 100;
  v_items json;
  v_count integer;
  v_last_updated timestamptz;
  v_last_id uuid;
  v_has_more boolean;
begin
  with page as (
    select z.id, z.name, z.name_bn, z.arabic_text, z.translation, z.translation_bn, z.updated_at
    from zikr_app.shared_zikrs z
    where z.verified
      and (
        p_cursor_updated_at is null
        or (z.updated_at, z.id) > (p_cursor_updated_at, coalesce(p_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
    order by z.updated_at asc, z.id asc
    limit v_page_size + 1
  )
  select
    coalesce(json_agg(json_build_object(
      'id', p.id,
      'name', p.name,
      'nameBn', p.name_bn,
      'arabicText', p.arabic_text,
      'translation', p.translation,
      'translationBn', p.translation_bn,
      'updatedAt', p.updated_at
    ) order by p.updated_at, p.id) filter (where p.updated_at is not null), '[]'::json),
    count(*)
  into v_items, v_count
  from (
    select * from page order by updated_at, id limit v_page_size
  ) p;

  v_has_more := v_count = v_page_size and (
    select exists (
      select 1 from page
      where (updated_at, id) > (
        select (updated_at, id) from page order by updated_at desc, id desc limit 1
      )
    )
  );

  select (v_items -> v_count - 1 ->> 'updatedAt')::timestamptz,
         (v_items -> v_count - 1 ->> 'id')::uuid
  into v_last_updated, v_last_id
  where v_count > 0;

  return json_build_object(
    'items', v_items,
    -- Position of the last returned row: also sent on the final page so
    -- clients can advance their cursor past everything consumed.
    'nextCursorUpdatedAt', v_last_updated,
    'nextCursorId', v_last_id,
    'hasMore', v_has_more
  );
end;
$$;

-- ============================================================
-- EXECUTE surface
-- ============================================================

grant execute on function public.share_zikr(text, text, text) to anon, authenticated;
grant execute on function public.pull_verified_zikrs(timestamptz, uuid) to anon, authenticated;

-- Housekeeping (purging stale unverified submissions) is merged into
-- the single public.purge_expired() defined by 0002_group_plans.sql.
-- Do NOT define purge_expired here: a second create-or-replace would
-- silently replace the group-plans body depending on migration order.
