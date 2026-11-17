-- A merchant's own image or video, on a featured card or a promotion.
--
-- Until now a homepage featured card could only show the merchant's cover
-- photo, and a promotion had no picture at all. A merchant can now bring a
-- finished image (JPG, PNG or WebP, up to 3 MB) or video (MP4 or WebM, up to
-- 10 MB, with a still frame for a poster), preview it, and send it. NexG
-- reviews every upload before a guest sees it, as featured artwork always was.
--
--   Featured: the homepage card, so homepage slots only (category-top and
--   Best seller slots have no card to put it on). featured_creative gains the
--   media; featured_live_v hands it to the homepage. The card can go with the
--   request itself (rpc_merchant_request_featured, p_creative) or later
--   (rpc_merchant_featured_card_save), and the merchant can take it down
--   (rpc_merchant_featured_card_withdraw).
--
--   Promotions: a banner at the top of the merchant's store while the
--   promotion runs. merchant_promotion_creative holds it; the promotion can be
--   saved with it (rpc_merchant_promotion_save, p_media) or given one later
--   (rpc_merchant_promotion_media_save). promotion_banner_v is what the store
--   reads.
--
-- Staff review both in the console (console_creative_queue_v,
-- rpc_featured_creative_review, rpc_promotion_creative_review), and the
-- merchant gets a message either way.
--
-- The files live in one private bucket, promo-media, as
-- <merchant id>/<random uuid>.<ext>. A guest can read a file only while it is
-- the approved media of a card on the homepage this week or of a running
-- promotion; the merchant reads their own; the featured module reads all it
-- reviews. The project is on the Supabase Free plan (1 GB across every
-- bucket), so the caps are small and checked three times: in the browser, by
-- the bucket (10 MB, five types), and here, against the type and size storage
-- recorded for the object.
--
-- Also: cron_featured_activate no longer waits for an approved creative.
-- 20260101012600 made artwork an extra rather than a gate for the homepage
-- view, but the Monday cron still skipped any booked week without approved
-- artwork, so a slot sold forward (rpc_featured_place_merchant) or a card
-- still in review kept a paid week off the homepage. The view decides what
-- the card shows; the cron only turns the week on.

-- ═══════════════════════════════════════════════════════ the bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('promo-media', 'promo-media', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

/* <merchant id>/<random uuid>.<jpg|png|webp|mp4|webm>: the merchant whose
   folder the file is in, or null for any other name. */
create or replace function authz.promo_media_merchant(p_path text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp|mp4|webm)$'
    then split_part(p_path, '/', 1)::uuid
  end
$$;

grant execute on function authz.promo_media_merchant(text) to anon, authenticated, service_role;

/* Approving or sending back a merchant's image or video: full access to the
   featured module (Growth, Finance, super admins). The view-only roles can
   watch the queue but not decide it. */
create or replace function authz.can_review_featured()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_super_admin() or exists (
    select 1
    from public.role_grant rg
    join public.role r on r.id = rg.role_id
    join public.staff_user su on su.id = rg.staff_user_id
    join public.role_module_access a on a.role_key = r.key
    where su.user_id = (select auth.uid())
      and su.status = 'active'
      and rg.revoked_at is null
      and (rg.expires_at is null or rg.expires_at > now())
      and a.module_key = 'featured'
      and a.level = 'full')
$$;

grant execute on function authz.can_review_featured() to authenticated, service_role;

-- ═══════════════════════════════════════════ the featured card's media

alter table public.featured_creative
  add column if not exists media_kind text,
  add column if not exists media_path text,
  add column if not exists poster_path text,
  add column if not exists media_mime text,
  add column if not exists media_bytes bigint;

alter table public.featured_creative drop constraint if exists featured_creative_media_shape;
alter table public.featured_creative add constraint featured_creative_media_shape check (
  (media_kind is null and media_path is null and poster_path is null
   and media_mime is null and media_bytes is null)
  or (media_kind = 'image' and media_path is not null and poster_path is null
      and media_mime is not null and media_bytes > 0)
  or (media_kind = 'video' and media_path is not null and poster_path is not null
      and media_mime is not null and media_bytes > 0));

create index if not exists featured_creative_media_path
  on public.featured_creative (media_path) where media_path is not null;
create index if not exists featured_creative_poster_path
  on public.featured_creative (poster_path) where poster_path is not null;

comment on column public.featured_creative.media_path is
  'The merchant''s own image or video in the promo-media bucket. Null: the card uses the merchant''s cover photo.';
comment on column public.featured_creative.poster_path is
  'For a video, the still shown before it plays and to visitors who ask for reduced motion.';

-- ═══════════════════════════════════════════ a promotion's picture

create table if not exists public.merchant_promotion_creative (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.merchant_promotion (id) on delete cascade,
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  media_kind text not null check (media_kind in ('image', 'video')),
  media_path text not null,
  poster_path text,
  media_mime text not null,
  media_bytes bigint not null check (media_bytes > 0),
  status public.creative_status not null default 'pending_review',
  submitted_by uuid references auth.users (id) on delete set null,
  reviewed_by uuid references public.staff_user (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint promotion_creative_video_has_a_poster check (
    (media_kind = 'video') = (poster_path is not null)),
  constraint promotion_creative_rejection_has_a_reason check (
    status <> 'rejected' or coalesce(trim(rejection_reason), '') <> '')
);

comment on table public.merchant_promotion_creative is
  'A merchant''s own image or video for a promotion, shown as a banner on their store once NexG approves it. One approved and one waiting per promotion; older ones are archived.';

/* The approved one stays on the store until its replacement is approved. */
create unique index if not exists merchant_promotion_creative_one_approved
  on public.merchant_promotion_creative (promotion_id) where status = 'approved';
create unique index if not exists merchant_promotion_creative_one_waiting
  on public.merchant_promotion_creative (promotion_id) where status = 'pending_review';
create index if not exists merchant_promotion_creative_queue
  on public.merchant_promotion_creative (status, updated_at) where status = 'pending_review';
create index if not exists merchant_promotion_creative_media_path
  on public.merchant_promotion_creative (media_path);
create index if not exists merchant_promotion_creative_poster_path
  on public.merchant_promotion_creative (poster_path) where poster_path is not null;
create index if not exists merchant_promotion_creative_merchant
  on public.merchant_promotion_creative (merchant_id, promotion_id);

drop trigger if exists merchant_promotion_creative_set_updated_at on public.merchant_promotion_creative;
create trigger merchant_promotion_creative_set_updated_at
  before update on public.merchant_promotion_creative
  for each row execute function public.tg_set_updated_at();

alter table public.merchant_promotion_creative enable row level security;
revoke all on public.merchant_promotion_creative from anon, authenticated;
grant select on public.merchant_promotion_creative to authenticated;

drop policy if exists merchant_promotion_creative_read on public.merchant_promotion_creative;
create policy merchant_promotion_creative_read on public.merchant_promotion_creative
  for select to authenticated
  using (authz.is_merchant_member(merchant_id) or authz.works_merchant(merchant_id)
         or authz.reaches_module('featured'));

/* As on every merchant table since 20261102000100. */
drop policy if exists merchant_application_session_gate on public.merchant_promotion_creative;
create policy merchant_application_session_gate on public.merchant_promotion_creative as restrictive
  for all to authenticated
  using (authz.merchant_application_record_session_valid(merchant_id))
  with check (authz.merchant_application_record_session_valid(merchant_id));

/* Staff review a promotion's picture next to the promotion, paused and ended
   ones included. */
drop policy if exists merchant_promotion_featured_read on public.merchant_promotion;
create policy merchant_promotion_featured_read on public.merchant_promotion
  for select to authenticated using (authz.reaches_module('featured'));

-- ═══════════════════════════════════════════ who may read a file

/* On the homepage this week, or on a running promotion's banner, for a
   merchant who is live. While that holds, any visitor may read the file. */
create or replace function public.fn_promo_media_shown(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1
        from public.featured_creative cr
        join public.featured_slot_week sw on sw.booking_id = cr.booking_id
       where cr.status = 'approved'
         and (cr.media_path = p_path or cr.poster_path = p_path)
         and sw.status = 'live'
         and sw.week_start <= current_date
         and current_date <= sw.week_start + 6
         and public.fn_merchant_is_live(cr.merchant_id))
    or exists (
      select 1
        from public.merchant_promotion_creative pc
        join public.merchant_promotion p on p.id = pc.promotion_id
       where pc.status = 'approved'
         and (pc.media_path = p_path or pc.poster_path = p_path)
         and p.status = 'active'
         and (p.ends_at is null or p.ends_at > now())
         and public.fn_merchant_is_live(pc.merchant_id))
$$;

grant execute on function public.fn_promo_media_shown(text) to anon, authenticated, service_role;

/* Waiting for review, approved, or the start of a card not yet sent, on a
   placement or promotion that has not finished. Such a file stays. */
create or replace function public.fn_promo_media_in_use(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1
        from public.featured_creative cr
        join public.featured_booking b on b.id = cr.booking_id
       where cr.status in ('draft', 'pending_review', 'approved')
         and (cr.media_path = p_path or cr.poster_path = p_path)
         and b.status not in ('ended', 'declined', 'expired', 'cancelled'))
    or exists (
      select 1
        from public.merchant_promotion_creative pc
        join public.merchant_promotion p on p.id = pc.promotion_id
       where pc.status in ('pending_review', 'approved')
         and (pc.media_path = p_path or pc.poster_path = p_path)
         and p.status <> 'ended'
         and (p.ends_at is null or p.ends_at > now()))
$$;

revoke execute on function public.fn_promo_media_in_use(text) from public, anon;
grant execute on function public.fn_promo_media_in_use(text) to authenticated, service_role;

drop policy if exists promo_media_merchant_insert on storage.objects;
create policy promo_media_merchant_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'promo-media'
    and authz.is_merchant_member(authz.promo_media_merchant(name)));

drop policy if exists promo_media_read on storage.objects;
create policy promo_media_read on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'promo-media'
    and (authz.is_merchant_member(authz.promo_media_merchant(name))
         or authz.reaches_module('featured')
         or public.fn_promo_media_shown(name)));

/* A merchant clears away files nothing uses any more: one replaced before
   review, or an upload whose save failed. */
drop policy if exists promo_media_merchant_delete on storage.objects;
create policy promo_media_merchant_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'promo-media'
    and authz.is_merchant_member(authz.promo_media_merchant(name))
    and not public.fn_promo_media_in_use(name));

-- ═══════════════════════════════════════════ checking what was sent

/*
 * One file a merchant names, against what storage recorded when it arrived:
 * in their own folder, of the kind asked for, with the matching extension,
 * within the cap. p_role is image, video or poster. Returns its type and
 * size, which the creative keeps.
 */
create or replace function public.fn_promo_media_object(
  p_merchant_id uuid,
  p_path text,
  p_role text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mime text;
  v_bytes bigint;
  v_ext text := lower(substring(coalesce(p_path, '') from '[.]([a-z0-9]+)$'));
  v_types text[] := case when p_role = 'video'
                         then array['video/mp4', 'video/webm']
                         else array['image/jpeg', 'image/png', 'image/webp'] end;
  v_cap bigint := case when p_role = 'video' then 10485760 else 3145728 end;
begin
  if p_path is null or authz.promo_media_merchant(p_path) is distinct from p_merchant_id then
    raise exception 'That file is not one of your uploads. Choose it again.'
      using errcode = '22023';
  end if;

  select o.metadata ->> 'mimetype', nullif(o.metadata ->> 'size', '')::bigint
    into v_mime, v_bytes
    from storage.objects o
   where o.bucket_id = 'promo-media' and o.name = p_path;

  if v_mime is null or v_bytes is null then
    raise exception 'The upload did not finish. Choose the file again.' using errcode = '22023';
  end if;

  if not (v_mime = any (v_types))
     or v_ext is distinct from (case v_mime
          when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
          when 'video/mp4' then 'mp4' when 'video/webm' then 'webm' end) then
    raise exception '%', case p_role
        when 'video' then 'A video has to be an MP4 or WebM file.'
        when 'poster' then 'The video''s still frame has to be a JPG, PNG or WebP image.'
        else 'An image has to be a JPG, PNG or WebP file.' end
      using errcode = '22023';
  end if;

  if v_bytes > v_cap then
    raise exception '%', case p_role
        when 'video' then 'A video can be up to 10 MB. Export it shorter or at 720p.'
        else 'An image can be up to 3 MB.' end
      using errcode = '22023';
  end if;

  return jsonb_build_object('mime', v_mime, 'bytes', v_bytes);
end;
$$;

revoke execute on function public.fn_promo_media_object(uuid, text, text) from public, anon, authenticated;

/* {kind, path, poster_path} from a merchant, checked: an image alone, or a
   video with its still. Null stays null. */
create or replace function public.fn_promo_media_checked(p_merchant_id uuid, p_media jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_path text;
  v_poster text;
  v_file jsonb;
begin
  if p_media is null or jsonb_typeof(p_media) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_media) <> 'object' then
    raise exception 'Choose an image or a video.' using errcode = '22023';
  end if;

  v_kind := nullif(p_media ->> 'kind', '');
  v_path := nullif(p_media ->> 'path', '');
  v_poster := nullif(p_media ->> 'poster_path', '');

  if v_kind is null or v_kind not in ('image', 'video') then
    raise exception 'Choose an image or a video.' using errcode = '22023';
  end if;

  v_file := public.fn_promo_media_object(p_merchant_id, v_path, v_kind);

  if v_kind = 'video' then
    if v_poster is null then
      raise exception 'A video needs its still frame. Choose the video again.'
        using errcode = '22023';
    end if;
    perform public.fn_promo_media_object(p_merchant_id, v_poster, 'poster');
  elsif v_poster is not null then
    raise exception 'Only a video has a still frame.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'kind', v_kind,
    'path', v_path,
    'poster_path', case when v_kind = 'video' then v_poster end,
    'mime', v_file ->> 'mime',
    'bytes', (v_file ->> 'bytes')::bigint);
end;
$$;

revoke execute on function public.fn_promo_media_checked(uuid, jsonb) from public, anon, authenticated;

/* The line under a featured card's name: trimmed, within the rule's length,
   and free of the claims a sponsored card may not make. Null stays null. */
create or replace function public.fn_featured_blurb(p_blurb text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_blurb text := nullif(trim(coalesce(p_blurb, '')), '');
  v_max integer;
  v_banned text;
begin
  if v_blurb is null then
    return null;
  end if;

  select (value #>> '{}')::integer into v_max
    from public.featured_rule where key = 'creative.max_blurb_chars';
  if length(v_blurb) > least(coalesce(v_max, 60), 60) then
    raise exception 'The line under your name can be up to % characters.',
      least(coalesce(v_max, 60), 60)
      using errcode = '22023';
  end if;

  select string_agg(t, ', ') into v_banned
    from (select jsonb_array_elements_text(value) as t
            from public.featured_rule where key = 'creative.banned_terms') x
   where lower(v_blurb) like '%' || lower(t) || '%';
  if v_banned is not null then
    raise exception 'A sponsored card cannot say: %. Describe what you offer instead.', v_banned
      using errcode = '22023';
  end if;

  return v_blurb;
end;
$$;

revoke execute on function public.fn_featured_blurb(text) from public, anon, authenticated;

-- ═══════════════════════════════════════════ putting a card together

/*
 * The merchant's card for a booking, sent for review. A card still waiting is
 * replaced in place; an approved card stays on the homepage until its
 * replacement is approved. Returns the card's id and the files the replaced
 * card held that nothing uses any more, so the browser can delete them.
 * Callers have already checked the booking is the caller's.
 */
create or replace function public.fn_featured_card_put(
  p_booking public.featured_booking,
  p_media jsonb,
  p_blurb text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media jsonb;
  v_blurb text;
  v_open public.featured_creative;
  v_row public.featured_creative;
  v_version integer;
  v_old text[] := array[]::text[];
  m public.merchant;
begin
  if p_booking.placement_kind <> 'homepage' then
    raise exception 'Only a homepage slot shows a card. This slot uses your listing as it is.'
      using errcode = '22023';
  end if;

  v_media := public.fn_promo_media_checked(p_booking.merchant_id, p_media);
  v_blurb := public.fn_featured_blurb(p_blurb);

  select * into m from public.merchant where id = p_booking.merchant_id;

  select * into v_open
    from public.featured_creative
   where booking_id = p_booking.id and status in ('draft', 'pending_review')
   order by version desc, created_at desc
   limit 1
   for update;

  select coalesce(max(version), 0) + 1 into v_version
    from public.featured_creative where booking_id = p_booking.id;

  if v_open.id is not null then
    v_old := array_remove(array[v_open.media_path, v_open.poster_path], null);

    update public.featured_creative set
      media_kind = v_media ->> 'kind',
      media_path = v_media ->> 'path',
      poster_path = v_media ->> 'poster_path',
      media_mime = v_media ->> 'mime',
      media_bytes = (v_media ->> 'bytes')::bigint,
      blurb = v_blurb,
      status = 'pending_review',
      rejection_reason = null,
      reviewed_by = null,
      reviewed_at = null,
      version = v_version
    where id = v_open.id
    returning * into v_row;

    /* One card waits at a time. */
    update public.featured_creative set status = 'archived'
     where booking_id = p_booking.id
       and status in ('draft', 'pending_review')
       and id <> v_row.id;
  else
    insert into public.featured_creative (
      booking_id, merchant_id, cover_photo_path, headline, blurb,
      media_kind, media_path, poster_path, media_mime, media_bytes, status, version)
    values (
      p_booking.id, p_booking.merchant_id, m.cover_photo_path,
      coalesce(m.trading_name, m.legal_name), v_blurb,
      v_media ->> 'kind', v_media ->> 'path', v_media ->> 'poster_path',
      v_media ->> 'mime', (v_media ->> 'bytes')::bigint, 'pending_review', v_version)
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'creative_id', v_row.id,
    'freed', to_jsonb(array(
      select o from unnest(v_old) o
       where o is distinct from v_row.media_path
         and o is distinct from v_row.poster_path
         and not public.fn_promo_media_in_use(o))));
end;
$$;

revoke execute on function public.fn_featured_card_put(public.featured_booking, jsonb, text)
  from public, anon, authenticated;

/* A promotion's picture, sent for review. One waiting picture per promotion:
   a new one replaces it. The approved one stays until this is approved. */
create or replace function public.fn_promotion_media_put(
  p_promotion public.merchant_promotion,
  p_media jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media jsonb;
  v_open public.merchant_promotion_creative;
  v_row public.merchant_promotion_creative;
  v_old text[] := array[]::text[];
begin
  v_media := public.fn_promo_media_checked(p_promotion.merchant_id, p_media);
  if v_media is null then
    raise exception 'Choose an image or a video.' using errcode = '22023';
  end if;

  select * into v_open
    from public.merchant_promotion_creative
   where promotion_id = p_promotion.id and status = 'pending_review'
   for update;

  if v_open.id is not null then
    v_old := array_remove(array[v_open.media_path, v_open.poster_path], null);

    update public.merchant_promotion_creative set
      media_kind = v_media ->> 'kind',
      media_path = v_media ->> 'path',
      poster_path = v_media ->> 'poster_path',
      media_mime = v_media ->> 'mime',
      media_bytes = (v_media ->> 'bytes')::bigint,
      submitted_by = (select auth.uid())
    where id = v_open.id
    returning * into v_row;
  else
    insert into public.merchant_promotion_creative (
      promotion_id, merchant_id, media_kind, media_path, poster_path,
      media_mime, media_bytes, submitted_by)
    values (
      p_promotion.id, p_promotion.merchant_id, v_media ->> 'kind', v_media ->> 'path',
      v_media ->> 'poster_path', v_media ->> 'mime', (v_media ->> 'bytes')::bigint,
      (select auth.uid()))
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'creative_id', v_row.id,
    'freed', to_jsonb(array(
      select o from unnest(v_old) o
       where o is distinct from v_row.media_path
         and o is distinct from v_row.poster_path
         and not public.fn_promo_media_in_use(o))));
end;
$$;

revoke execute on function public.fn_promotion_media_put(public.merchant_promotion, jsonb)
  from public, anon, authenticated;

-- ═══════════════════════════════════════════ the merchant's commands

/* Send a homepage card (media, line, or both) for an open placement. */
create or replace function public.rpc_merchant_featured_card_save(
  p_booking_id uuid,
  p_media jsonb default null,
  p_blurb text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.featured_booking;
  v_put jsonb;
  v_showing boolean;
begin
  select * into b from public.featured_booking where id = p_booking_id;
  if b.id is null then
    raise exception 'No such featured placement.' using errcode = 'no_data_found';
  end if;
  perform public.fn_merchant_mine(b.merchant_id);
  if b.status in ('ended', 'declined', 'expired', 'cancelled') then
    raise exception 'That placement has finished, so its card cannot change.'
      using errcode = '22023';
  end if;
  if nullif(p_media, 'null'::jsonb) is null and nullif(trim(coalesce(p_blurb, '')), '') is null then
    raise exception 'Add a picture, a video or a line first.' using errcode = '22023';
  end if;

  v_put := public.fn_featured_card_put(b, nullif(p_media, 'null'::jsonb), p_blurb);
  v_showing := exists (select 1 from public.featured_creative
                        where booking_id = b.id and status = 'approved');

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'featured',
    p_action => 'featured.creative_submitted',
    p_target_type => 'featured_creative',
    p_target_id => (v_put ->> 'creative_id')::uuid,
    p_city_id => b.city_id,
    p_after => jsonb_build_object(
      'booking_id', b.id,
      'media_kind', nullif(p_media ->> 'kind', ''),
      'has_line', nullif(trim(coalesce(p_blurb, '')), '') is not null));

  return v_put || jsonb_build_object(
    'ok', true,
    'status', 'pending_review',
    'message', case when v_showing
      then 'Sent for review. Your current card stays up until NexG approves the new one.'
      else 'Sent for review. Until NexG approves it, your slot shows your business photo and name.'
    end);
end;
$$;

/* Take the card down: the slot shows the merchant's own photo and name. */
create or replace function public.rpc_merchant_featured_card_withdraw(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.featured_booking;
  v_paths text[];
  v_count integer;
begin
  select * into b from public.featured_booking where id = p_booking_id;
  if b.id is null then
    raise exception 'No such featured placement.' using errcode = 'no_data_found';
  end if;
  perform public.fn_merchant_mine(b.merchant_id);

  with taken as (
    update public.featured_creative set status = 'archived'
     where booking_id = b.id and status in ('draft', 'pending_review', 'approved')
    returning media_path, poster_path
  )
  select array_remove(array_agg(media_path) || array_agg(poster_path), null), count(*)
    into v_paths, v_count
    from taken;

  if coalesce(v_count, 0) = 0 then
    return jsonb_build_object('ok', true, 'unchanged', true, 'freed', '[]'::jsonb,
      'message', 'There was no card to take down.');
  end if;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'featured',
    p_action => 'featured.creative_withdrawn',
    p_target_type => 'featured_booking',
    p_target_id => b.id,
    p_city_id => b.city_id);

  return jsonb_build_object(
    'ok', true,
    'freed', to_jsonb(array(select distinct o from unnest(v_paths) o
                             where not public.fn_promo_media_in_use(o))),
    'message', 'Taken down. Your slot shows your business photo and name.');
end;
$$;

/* Give a promotion a picture, or a new one, without changing the promotion. */
create or replace function public.rpc_merchant_promotion_media_save(
  p_promotion_id uuid,
  p_media jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.merchant_promotion;
  v_put jsonb;
  v_showing boolean;
begin
  select * into p from public.merchant_promotion where id = p_promotion_id;
  if p.id is null then
    raise exception 'No such promotion.' using errcode = '22023';
  end if;
  perform public.fn_merchant_mine(p.merchant_id);
  if p.status = 'ended' or (p.ends_at is not null and p.ends_at <= now()) then
    raise exception 'That promotion has ended.' using errcode = '22023';
  end if;

  v_put := public.fn_promotion_media_put(p, p_media);
  v_showing := exists (select 1 from public.merchant_promotion_creative
                        where promotion_id = p.id and status = 'approved');

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchants',
    p_action => 'promotion.creative_submitted',
    p_target_type => 'merchant_promotion',
    p_target_id => p.id,
    p_after => jsonb_build_object('merchant_id', p.merchant_id,
                                  'creative_id', v_put ->> 'creative_id',
                                  'media_kind', p_media ->> 'kind'));

  return v_put || jsonb_build_object(
    'ok', true,
    'status', 'pending_review',
    'message', case when v_showing
      then 'Sent for review. The current picture stays on your store until NexG approves the new one.'
      else 'Sent for review. It shows on your store once NexG approves it.'
    end);
end;
$$;

/* Take a promotion's picture down, approved or waiting. */
create or replace function public.rpc_merchant_promotion_media_withdraw(p_promotion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.merchant_promotion;
  v_paths text[];
  v_count integer;
begin
  select * into p from public.merchant_promotion where id = p_promotion_id;
  if p.id is null then
    raise exception 'No such promotion.' using errcode = '22023';
  end if;
  perform public.fn_merchant_mine(p.merchant_id);

  with taken as (
    update public.merchant_promotion_creative set status = 'archived'
     where promotion_id = p.id and status in ('pending_review', 'approved')
    returning media_path, poster_path
  )
  select array_remove(array_agg(media_path) || array_agg(poster_path), null), count(*)
    into v_paths, v_count
    from taken;

  if coalesce(v_count, 0) = 0 then
    return jsonb_build_object('ok', true, 'unchanged', true, 'freed', '[]'::jsonb,
      'message', 'This promotion has no picture to take down.');
  end if;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchants',
    p_action => 'promotion.creative_withdrawn',
    p_target_type => 'merchant_promotion',
    p_target_id => p.id,
    p_after => jsonb_build_object('merchant_id', p.merchant_id));

  return jsonb_build_object(
    'ok', true,
    'freed', to_jsonb(array(select distinct o from unnest(v_paths) o
                             where not public.fn_promo_media_in_use(o))),
    'message', 'Taken down. Your store no longer shows it.');
end;
$$;

revoke execute on function public.rpc_merchant_featured_card_save(uuid, jsonb, text),
  public.rpc_merchant_featured_card_withdraw(uuid),
  public.rpc_merchant_promotion_media_save(uuid, jsonb),
  public.rpc_merchant_promotion_media_withdraw(uuid)
  from public, anon;
grant execute on function public.rpc_merchant_featured_card_save(uuid, jsonb, text),
  public.rpc_merchant_featured_card_withdraw(uuid),
  public.rpc_merchant_promotion_media_save(uuid, jsonb),
  public.rpc_merchant_promotion_media_withdraw(uuid)
  to authenticated;

-- ═══════════════════════ asking for a slot, with the card in the same step

/*
 * As 20261126000100, plus p_creative ({media, blurb}) for a homepage slot:
 * the card is checked and saved in the same transaction as the request, so
 * a card that is refused leaves no half-made request behind. Callers that
 * leave p_creative out are unchanged.
 */
drop function if exists public.rpc_merchant_request_featured(uuid, uuid, date, integer, text, uuid);

create or replace function public.rpc_merchant_request_featured(
  p_merchant_id uuid,
  p_placement_id uuid,
  p_week_start date,
  p_weeks integer default 1,
  p_note text default null,
  p_item_id uuid default null,
  p_creative jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  p public.featured_placement;
  v_price bigint;
  v_booking uuid;
  v_elig jsonb;
  v_item public.catalogue_item;
  v_row public.featured_booking;
  v_card jsonb;
begin
  perform public.fn_merchant_mine(p_merchant_id);
  select * into m from public.merchant where id = p_merchant_id;
  select * into p from public.featured_placement where id = p_placement_id;
  if not found then raise exception 'No such placement.'; end if;

  if m.status <> 'live' then
    raise exception 'Featured slots are for live businesses. Yours is %.', m.status;
  end if;
  if p.city_id <> m.city_id then
    raise exception 'That slot is in another city.';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'Slots run Monday to Sunday, so pick a Monday.';
  end if;
  if p_week_start < current_date then
    raise exception 'That week has already started.';
  end if;
  if coalesce(p_weeks, 0) < 1 or p_weeks > 12 then
    raise exception 'Between 1 and 12 weeks.';
  end if;

  /* A Best seller slot promotes one product, named now. */
  if p.kind = 'popular_request' then
    select * into v_item from public.catalogue_item where id = p_item_id;
    if v_item.id is null or v_item.merchant_id <> p_merchant_id then
      raise exception 'Choose one of your own products for the Best sellers slot.';
    end if;
    if not v_item.available or v_item.price_kes is null then
      raise exception 'That product is unavailable or has no price, so it cannot be promoted.';
    end if;
  end if;

  if exists (select 1 from public.featured_booking b
              where b.merchant_id = p_merchant_id
                and b.status in ('requested', 'quoted', 'booked', 'live')) then
    raise exception 'You already have a featured request with us. We will come back to you on that one first.';
  end if;

  /* The price and the eligibility each have one definition
     already, shared with the staff console and the nightly cron.
     Recomputing either here is how a merchant gets quoted one
     number and billed another. */
  v_price := public.fn_featured_price(p.city_id, p.kind, m.category);
  v_elig := public.fn_featured_eligibility(p_merchant_id, p.kind, m.category);

  if not coalesce((v_elig ->> 'passed')::boolean, false) then
    raise exception '%', coalesce(
      v_elig ->> 'remedy',
      'Your account is not eligible for a featured slot yet.');
  end if;

  insert into public.featured_booking (
    merchant_id, placement_id, placement_kind, category, city_id,
    status, requested_via, requested_at, requested_by,
    wanted_start, weeks, eligibility, quoted_price, notes, item_id)
  values (
    p_merchant_id, p_placement_id, p.kind, m.category, m.city_id,
    /* 'dashboard' is what featured_booking_requested_via_check allows; the
       earlier 'merchant_dashboard' failed every request from a merchant. */
    'requested', 'dashboard', now(), (select auth.uid()),
    p_week_start, p_weeks, v_elig, v_price, p_note, v_item.id)
  returning id into v_booking;

  insert into public.merchant_message (merchant_id, direction, channel, subject, body)
  values (p_merchant_id, 'in', 'in_app', 'Featured slot requested',
          'Week of ' || to_char(p_week_start, 'DD Mon') || ' · '
          || p_weeks || ' week' || case when p_weeks = 1 then '' else 's' end
          || coalesce(' · ' || v_item.name, '')
          || coalesce(' · ' || p_note, ''));

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type, p_module => 'featured',
    p_action => 'featured.requested_by_merchant',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_target_label => coalesce(m.trading_name, m.legal_name),
    p_city_id => m.city_id, p_reason => p_note, p_severity => 'notice',
    p_after => jsonb_build_object('booking_id', v_booking, 'weeks', p_weeks,
                                  'week_start', p_week_start, 'item_id', v_item.id,
                                  'amount_cents', v_price * 100, 'currency', 'KES'));

  /* The card, when one came with the request. */
  if p_creative is not null and jsonb_typeof(p_creative) = 'object'
     and (nullif(p_creative -> 'media', 'null'::jsonb) is not null
          or nullif(trim(coalesce(p_creative ->> 'blurb', '')), '') is not null) then
    select * into v_row from public.featured_booking where id = v_booking;
    v_card := public.fn_featured_card_put(
      v_row, nullif(p_creative -> 'media', 'null'::jsonb), p_creative ->> 'blurb');

    perform audit.log(
      p_actor_type => 'merchant_user'::public.actor_type,
      p_module => 'featured',
      p_action => 'featured.creative_submitted',
      p_target_type => 'featured_creative',
      p_target_id => (v_card ->> 'creative_id')::uuid,
      p_city_id => m.city_id,
      p_after => jsonb_build_object(
        'booking_id', v_booking,
        'media_kind', p_creative -> 'media' ->> 'kind',
        'has_line', nullif(trim(coalesce(p_creative ->> 'blurb', '')), '') is not null));
  end if;

  return jsonb_build_object('ok', true, 'booking_id', v_booking,
    'priced', v_price is not null,
    'card', v_card is not null,
    'message', case when v_price is null
      then 'Asked for. There is no published rate for that slot in your city yet, so somebody will call you with the price before anything is booked.'
      else 'Asked for at KES ' || v_price || ' a week. Nothing is charged yet — somebody will call to confirm and take payment.' end
      || case when v_card is not null
           then ' Your card goes to NexG for review too.' else '' end);
end;
$$;

revoke execute on function public.rpc_merchant_request_featured(uuid, uuid, date, integer, text, uuid, jsonb)
  from public, anon;
grant execute on function public.rpc_merchant_request_featured(uuid, uuid, date, integer, text, uuid, jsonb)
  to authenticated;

-- ═══════════════════════ saving a promotion, with its picture in the same step

/*
 * As 20261128000100, plus p_media ({kind, path, poster_path}): the picture is
 * checked and sent for review in the same transaction as the promotion.
 * Null leaves any picture the promotion has as it is.
 */
drop function if exists public.rpc_merchant_promotion_save(
  uuid, uuid, text, text, integer, uuid, timestamptz, timestamptz);

create or replace function public.rpc_merchant_promotion_save(
  p_merchant_id uuid,
  p_promotion_id uuid,
  p_name text,
  p_kind text,
  p_value integer,
  p_item_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_media jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.merchant_promotion;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_start timestamptz := coalesce(p_starts_at, now());
  v_item public.catalogue_item;
  v_put jsonb;
begin
  perform public.fn_merchant_mine(p_merchant_id);

  if v_name is null or length(v_name) > 80 then
    raise exception 'Give the promotion a name of up to 80 characters.' using errcode = '22023';
  end if;
  if p_kind not in ('percent', 'amount') then
    raise exception 'Choose a percentage or an amount off.' using errcode = '22023';
  end if;
  if p_value is null or p_value < 1 or (p_kind = 'percent' and p_value > 90) then
    raise exception 'A percentage off must be between 1 and 90.' using errcode = '22023';
  end if;
  if p_ends_at is not null and p_ends_at <= v_start then
    raise exception 'The end has to be after the start.' using errcode = '22023';
  end if;
  if p_item_id is not null then
    select * into v_item from public.catalogue_item where id = p_item_id;
    if v_item.id is null or v_item.merchant_id <> p_merchant_id then
      raise exception 'Choose one of your own items.' using errcode = '22023';
    end if;
    if p_kind = 'amount' and v_item.price_kes is not null and p_value >= v_item.price_kes then
      raise exception 'The amount off has to be less than the item''s price (KES %).', v_item.price_kes
        using errcode = '22023';
    end if;
  end if;

  if p_promotion_id is null then
    insert into public.merchant_promotion
      (merchant_id, name, kind, value, catalogue_item_id, starts_at, ends_at, created_by)
    values (p_merchant_id, v_name, p_kind, p_value, p_item_id, v_start, p_ends_at, (select auth.uid()))
    returning * into v_row;
  else
    update public.merchant_promotion
       set name = v_name, kind = p_kind, value = p_value, catalogue_item_id = p_item_id,
           starts_at = v_start, ends_at = p_ends_at, updated_at = now()
     where id = p_promotion_id and merchant_id = p_merchant_id and status <> 'ended'
    returning * into v_row;
    if v_row.id is null then
      raise exception 'That promotion has ended or is not yours.' using errcode = '22023';
    end if;
  end if;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type, p_module => 'merchants',
    p_action => 'promotion.saved', p_target_type => 'merchant_promotion', p_target_id => v_row.id,
    p_after => jsonb_build_object('merchant_id', p_merchant_id, 'name', v_row.name,
                                  'kind', v_row.kind, 'value', v_row.value,
                                  'item', v_row.catalogue_item_id,
                                  'starts_at', v_row.starts_at, 'ends_at', v_row.ends_at));

  if p_media is not null and jsonb_typeof(p_media) <> 'null' then
    v_put := public.fn_promotion_media_put(v_row, p_media);

    perform audit.log(
      p_actor_type => 'merchant_user'::public.actor_type,
      p_module => 'merchants',
      p_action => 'promotion.creative_submitted',
      p_target_type => 'merchant_promotion',
      p_target_id => v_row.id,
      p_after => jsonb_build_object('merchant_id', p_merchant_id,
                                    'creative_id', v_put ->> 'creative_id',
                                    'media_kind', p_media ->> 'kind'));
  end if;

  return jsonb_build_object('ok', true, 'promotion_id', v_row.id,
    'media', case when v_put is not null then 'pending_review' end,
    'freed', coalesce(v_put -> 'freed', '[]'::jsonb),
    'message', case when p_promotion_id is null then 'Promotion created.' else 'Promotion saved.' end
      || case when v_put is not null
           then ' Its picture shows on your store once NexG approves it.' else '' end);
end;
$$;

revoke execute on function public.rpc_merchant_promotion_save(
  uuid, uuid, text, text, integer, uuid, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.rpc_merchant_promotion_save(
  uuid, uuid, text, text, integer, uuid, timestamptz, timestamptz, jsonb) to authenticated;

-- ═══════════════════════════════════════════ staff review

/*
 * As 20260101008700, but only full access to the featured module may decide
 * (authz.can_review_featured: the view-only roles used to pass), only a card
 * waiting for review can be decided (an approved or archived card cannot be
 * approved again by mistake), and the merchant is told in their messages
 * either way, with the reason.
 */
create or replace function public.rpc_featured_creative_review(
  p_creative_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns public.featured_creative
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creative public.featured_creative;
  v_booking public.featured_booking;
begin
  if not authz.can_review_featured() then
    raise exception 'Reviewing cards and pictures needs full access to Featured slots.'
      using errcode = 'insufficient_privilege';
  end if;
  if not p_approve and coalesce(trim(coalesce(p_reason, '')), '') = '' then
    raise exception 'The merchant has to be told what to change. Write a reason.'
      using errcode = 'check_violation';
  end if;

  select * into v_creative from public.featured_creative where id = p_creative_id for update;
  if v_creative.id is null then
    raise exception 'No such card.' using errcode = 'no_data_found';
  end if;
  if v_creative.status <> 'pending_review' then
    raise exception 'That card is not waiting for review. It is %.', replace(v_creative.status::text, '_', ' ')
      using errcode = 'check_violation';
  end if;

  select * into v_booking from public.featured_booking where id = v_creative.booking_id;

  if p_approve then
    /* Only one approved creative per booking; the old one steps down. */
    update public.featured_creative set status = 'archived'
    where booking_id = v_creative.booking_id
      and status = 'approved' and id <> p_creative_id;
  end if;

  update public.featured_creative set
    status = (case when p_approve then 'approved' else 'rejected' end)::public.creative_status,
    reviewed_by = authz.staff_id(),
    reviewed_at = now(),
    rejection_reason = case when p_approve then null else trim(p_reason) end
  where id = p_creative_id
  returning * into v_creative;

  insert into public.notification (kind, status)
  values (case when p_approve then 'featured_creative_approved'
               else 'featured_creative_rejected' end::public.notification_kind, 'pending');

  insert into public.merchant_message (merchant_id, direction, channel, subject, body)
  values (v_creative.merchant_id, 'out', 'in_app',
          case when p_approve then 'Featured card approved' else 'Featured card needs a change' end,
          case when p_approve
            then 'Your homepage card is approved. It shows whenever your slot is live.'
            else 'Your homepage card was not approved: ' || trim(p_reason)
                 || ' Change it in Promotions and send it again.' end);

  perform audit.log('staff'::public.actor_type, 'featured',
    case when p_approve then 'featured.creative_approved' else 'featured.creative_rejected' end,
    p_target_type => 'featured_creative', p_target_id => p_creative_id,
    p_city_id => v_booking.city_id,
    p_reason => p_reason,
    p_after => jsonb_build_object('booking_id', v_creative.booking_id,
                                  'media_kind', v_creative.media_kind));

  return v_creative;
end;
$$;

grant execute on function public.rpc_featured_creative_review(uuid, boolean, text) to authenticated;
revoke execute on function public.rpc_featured_creative_review(uuid, boolean, text) from anon;

create or replace function public.rpc_promotion_creative_review(
  p_creative_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creative public.merchant_promotion_creative;
  v_promotion public.merchant_promotion;
  m public.merchant;
begin
  if not authz.can_review_featured() then
    raise exception 'Reviewing cards and pictures needs full access to Featured slots.'
      using errcode = 'insufficient_privilege';
  end if;
  if not p_approve and coalesce(trim(coalesce(p_reason, '')), '') = '' then
    raise exception 'The merchant has to be told what to change. Write a reason.'
      using errcode = 'check_violation';
  end if;

  select * into v_creative from public.merchant_promotion_creative
   where id = p_creative_id for update;
  if v_creative.id is null then
    raise exception 'No such picture.' using errcode = 'no_data_found';
  end if;
  if v_creative.status <> 'pending_review' then
    raise exception 'That picture is not waiting for review. It is %.', replace(v_creative.status::text, '_', ' ')
      using errcode = 'check_violation';
  end if;

  select * into v_promotion from public.merchant_promotion where id = v_creative.promotion_id;
  select * into m from public.merchant where id = v_creative.merchant_id;

  if p_approve then
    update public.merchant_promotion_creative set status = 'archived'
     where promotion_id = v_creative.promotion_id and status = 'approved' and id <> p_creative_id;
  end if;

  update public.merchant_promotion_creative set
    status = (case when p_approve then 'approved' else 'rejected' end)::public.creative_status,
    reviewed_by = authz.staff_id(),
    reviewed_at = now(),
    rejection_reason = case when p_approve then null else trim(p_reason) end
  where id = p_creative_id
  returning * into v_creative;

  insert into public.merchant_message (merchant_id, direction, channel, subject, body)
  values (v_creative.merchant_id, 'out', 'in_app',
          case when p_approve then 'Promotion picture approved' else 'Promotion picture needs a change' end,
          case when p_approve
            then 'The picture for "' || v_promotion.name || '" is approved. It shows on your store while the promotion runs.'
            else 'The picture for "' || v_promotion.name || '" was not approved: ' || trim(p_reason)
                 || ' Change it in Promotions and send it again.' end);

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'featured',
    p_action => case when p_approve then 'promotion.creative_approved'
                     else 'promotion.creative_rejected' end,
    p_target_type => 'merchant_promotion',
    p_target_id => v_creative.promotion_id,
    p_target_label => coalesce(m.trading_name, m.legal_name) || ' · ' || v_promotion.name,
    p_city_id => m.city_id,
    p_reason => p_reason,
    p_after => jsonb_build_object('creative_id', v_creative.id,
                                  'media_kind', v_creative.media_kind));

  return jsonb_build_object('ok', true, 'status', v_creative.status,
    'message', case when p_approve then 'Approved. It shows on the store while the promotion runs.'
                    else 'Sent back to the merchant with your reason.' end);
end;
$$;

revoke execute on function public.rpc_promotion_creative_review(uuid, boolean, text) from public, anon;
grant execute on function public.rpc_promotion_creative_review(uuid, boolean, text) to authenticated;

-- ═══════════════════════════════════════════ confirming a quote

/*
 * As 20260101008700, except the prefilled draft card is only made when the
 * booking has no card yet: a merchant who sent their card with the request
 * keeps it, rather than gaining a second, empty one beside it.
 */
create or replace function public.rpc_featured_confirm(p_booking_id uuid)
returns public.featured_booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.featured_booking;
  v_merchant public.merchant;
begin
  select * into v_booking from public.featured_booking where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'No such booking.' using errcode = 'no_data_found';
  end if;
  if not authz.is_merchant_member(v_booking.merchant_id)
     and not authz.reaches_module('featured')
     and not authz.works_merchant(v_booking.merchant_id) then
    raise exception 'Not your booking.' using errcode = 'insufficient_privilege';
  end if;
  if v_booking.status <> 'quoted' then
    raise exception 'That quote is %, not open.', v_booking.status
      using errcode = 'check_violation';
  end if;
  if v_booking.quote_expires_at < now() then
    raise exception 'That quote expired on %. Ask us for a new one.',
      to_char(v_booking.quote_expires_at at time zone 'Africa/Nairobi', 'DD Mon HH24:MI')
      using errcode = 'check_violation';
  end if;

  select * into v_merchant from public.merchant where id = v_booking.merchant_id;

  update public.featured_booking set
    status = 'booked',
    confirmed_at = now(),
    renews_at = case when auto_renew then end_date + 3 end
  where id = p_booking_id
  returning * into v_booking;

  update public.featured_slot_week set status = 'booked'
  where booking_id = p_booking_id and status = 'held';

  /* A draft creative, prefilled, so the merchant has something to
     edit rather than a blank form. */
  insert into public.featured_creative (booking_id, merchant_id, cover_photo_path, headline)
  select p_booking_id, v_booking.merchant_id, v_merchant.cover_photo_path, v_merchant.trading_name
   where not exists (select 1 from public.featured_creative
                      where booking_id = p_booking_id and status <> 'archived');

  insert into public.notification (kind, status) values ('featured_booked', 'pending');

  perform audit.log('merchant_user'::public.actor_type, 'featured', 'featured.booked',
    p_target_type => 'featured_booking', p_target_id => p_booking_id,
    p_city_id => v_booking.city_id,
    p_after => jsonb_build_object('price', v_booking.quoted_price,
                                  'start', v_booking.start_date),
    p_severity => 'notice'::public.audit_severity);

  return v_booking;
end;
$$;

-- ═══════════════════════════════ Monday: the week goes live, card or not

/*
 * As 20260101008700, without the approved-creative requirement. A booked
 * week goes live; featured_live_v shows the approved card when there is one
 * and the merchant's own photo and name when there is not.
 */
create or replace function public.cron_featured_activate()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week date := date_trunc('week', now())::date;
  v_booking record;
  v_n integer := 0;
begin
  for v_booking in
    select b.* from public.featured_booking b
    join public.featured_slot_week sw
      on sw.booking_id = b.id and sw.week_start = v_week
    where b.status in ('booked', 'live')
  loop
    update public.featured_booking set status = 'live' where id = v_booking.id;
    update public.featured_slot_week set status = 'live'
    where booking_id = v_booking.id and week_start = v_week;

    perform public.fn_featured_fee_for_week(v_booking.id, v_week, 7);

    insert into public.notification (kind, status) values ('featured_live', 'pending');

    perform audit.log('system'::public.actor_type, 'featured', 'featured.live',
      p_target_type => 'featured_booking', p_target_id => v_booking.id,
      p_city_id => v_booking.city_id);

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

-- ═══════════════════════════════════════════ what guests read

/* As 20260101012600 (security_invoker off since 20260101021200), plus the
   approved card's media, appended so existing readers are unchanged. */
create or replace view public.featured_live_v
with (security_invoker = false) as
select
  p.city_id,
  mp.city_slug,
  p.kind,
  p.category,
  p."position",
  b.id as booking_id,
  b.merchant_id,
  mp.trading_name,
  mp.category as merchant_category,
  mp.branch_name,
  coalesce(cr.cover_photo_path, mp.cover_photo_path) as cover_photo_path,
  cr.blurb,
  ci.name as pinned_item_name,
  ci.price_kes as pinned_item_price,
  ci.id as pinned_item_id,
  mp.accepting_orders,
  mp.opens_today,
  mp.closes_today,
  mp.closed_today,
  mp.prep_minutes,
  mp.branch_latitude,
  mp.branch_longitude,
  'SPONSORED'::text as badge,
  sw.week_start + 4 as valid_to,
  cr.id is not null as has_creative,
  cr.media_kind,
  cr.media_path,
  cr.poster_path
from public.featured_slot_week sw
join public.featured_placement p on p.id = sw.placement_id
join public.featured_booking b on b.id = sw.booking_id
join public.merchant_public mp on mp.id = b.merchant_id
left join public.featured_creative cr
  on cr.booking_id = b.id and cr.status = 'approved'
left join public.catalogue_item ci on ci.id = cr.pinned_item_id
where sw.status = 'live'
  and sw.week_start <= current_date
  and current_date <= sw.week_start + 6
  and p.enabled;

grant select on public.featured_live_v to anon, authenticated;

/* The banner on a merchant's store: a running promotion with an approved
   picture, for a merchant guests can see. The newest promotion first. */
create or replace view public.promotion_banner_v
with (security_invoker = false) as
select
  p.merchant_id,
  p.id as promotion_id,
  p.name,
  p.kind,
  p.value,
  p.catalogue_item_id,
  ci.name as item_name,
  p.starts_at,
  p.ends_at,
  pc.id as creative_id,
  pc.media_kind,
  pc.media_path,
  pc.poster_path
from public.merchant_promotion p
join public.merchant_promotion_creative pc
  on pc.promotion_id = p.id and pc.status = 'approved'
join public.merchant_public mp on mp.id = p.merchant_id
left join public.catalogue_item ci on ci.id = p.catalogue_item_id
where p.status = 'active'
  and p.starts_at <= now()
  and (p.ends_at is null or p.ends_at > now());

grant select on public.promotion_banner_v to anon, authenticated;

comment on view public.promotion_banner_v is
  'What a store shows above its catalogue: running promotions with an approved picture or video. Paths are in the private promo-media bucket; a visitor may sign them while the promotion runs.';

/* The console's review queue: homepage cards and promotion pictures, newest
   first, for whoever reaches the featured module. */
create or replace view public.console_creative_queue_v
with (security_invoker = true) as
select
  'featured'::text as source,
  cr.id,
  cr.merchant_id,
  coalesce(m.trading_name, m.legal_name) as trading_name,
  m.city_id,
  cr.status::text as status,
  cr.media_kind,
  cr.media_path,
  cr.poster_path,
  cr.media_mime,
  cr.media_bytes,
  cr.blurb,
  cr.cover_photo_path,
  b.id as booking_id,
  b.placement_kind::text as placement_kind,
  b.status::text as booking_status,
  b.wanted_start,
  null::uuid as promotion_id,
  null::text as promotion_name,
  null::text as promotion_kind,
  null::integer as promotion_value,
  null::text as promotion_item,
  null::timestamptz as promotion_ends_at,
  cr.updated_at as submitted_at,
  cr.reviewed_at,
  cr.rejection_reason
from public.featured_creative cr
join public.featured_booking b on b.id = cr.booking_id
left join public.merchant m on m.id = cr.merchant_id
where cr.status in ('pending_review', 'approved', 'rejected')
union all
select
  'promotion'::text,
  pc.id,
  pc.merchant_id,
  coalesce(m.trading_name, m.legal_name),
  m.city_id,
  pc.status::text,
  pc.media_kind,
  pc.media_path,
  pc.poster_path,
  pc.media_mime,
  pc.media_bytes,
  null::text,
  null::text,
  null::uuid,
  null::text,
  null::text,
  null::date,
  p.id,
  p.name,
  p.kind,
  p.value,
  ci.name,
  p.ends_at,
  pc.updated_at,
  pc.reviewed_at,
  pc.rejection_reason
from public.merchant_promotion_creative pc
join public.merchant_promotion p on p.id = pc.promotion_id
left join public.merchant m on m.id = pc.merchant_id
left join public.catalogue_item ci on ci.id = p.catalogue_item_id
where pc.status in ('pending_review', 'approved', 'rejected');

grant select on public.console_creative_queue_v to authenticated;

-- ═══════════════════════════════════════════ the audit registry

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('featured.creative_submitted', 'featured', 'info', false, false, false,
   'Merchant sent a featured card for review'),
  ('featured.creative_withdrawn', 'featured', 'info', false, false, false,
   'Merchant took their featured card down; the slot shows their own photo and name'),
  ('promotion.creative_submitted', 'merchants', 'info', false, false, false,
   'Merchant sent a picture or video for a promotion, for review'),
  ('promotion.creative_withdrawn', 'merchants', 'info', false, false, false,
   'Merchant took a promotion''s picture or video down'),
  ('promotion.creative_approved', 'featured', 'info', false, false, false,
   'Staff approved a promotion''s picture or video for the merchant''s store'),
  ('promotion.creative_rejected', 'featured', 'notice', false, false, false,
   'Staff sent a promotion''s picture or video back, with the reason')
on conflict (action) do nothing;
