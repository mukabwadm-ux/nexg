-- A photo on the banner, and a card you can actually look at.
--
-- Two gaps left by the write layer. `rpc_property_photos_set`
-- existed and the `host-photos` bucket existed, but nothing
-- could put a file in it: the bucket had no policies, so every
-- upload was refused. And a generated QR card could be marked
-- placed, replaced or voided without ever being seen — which
-- makes "is this the right card for this room" a question
-- nobody could answer from the portal.

-- ═══════════════════════════════════════════ the photo bucket

/**
 * Whether a storage path belongs to a host the caller is in.
 *
 * Paths are `{host_id}/{property_id}/{file}`. The host id is
 * taken from the path and checked against membership — so a
 * caller can only ever write under their own prefix, and
 * guessing another host's id gets them nothing.
 *
 * Returns false rather than raising on a malformed path. A
 * policy that throws turns a bad filename into a 500 on an
 * upload form.
 */
create or replace function authz.owns_host_photo_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_host uuid;
begin
  begin
    v_host := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;

  return v_host is not null and authz.is_host_member(v_host);
end;
$$;

grant execute on function authz.owns_host_photo_path(text) to authenticated;

drop policy if exists host_photos_owner_read on storage.objects;
create policy host_photos_owner_read on storage.objects
  for select to authenticated
  using (bucket_id = 'host-photos' and authz.owns_host_photo_path(name));

drop policy if exists host_photos_owner_insert on storage.objects;
create policy host_photos_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'host-photos' and authz.owns_host_photo_path(name));

/* Replacing a cover overwrites by path, so update is needed as
   well as insert — without it the second upload of a photo
   fails and the first one is stuck there. */
drop policy if exists host_photos_owner_update on storage.objects;
create policy host_photos_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'host-photos' and authz.owns_host_photo_path(name))
  with check (bucket_id = 'host-photos' and authz.owns_host_photo_path(name));

drop policy if exists host_photos_owner_delete on storage.objects;
create policy host_photos_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'host-photos' and authz.owns_host_photo_path(name));

/* Hospitality staff can see them, because a host ringing up
   about a photo that will not appear is a support call
   somebody has to be able to answer. */
drop policy if exists host_photos_staff_read on storage.objects;
create policy host_photos_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'host-photos' and authz.works_hospitality(null));

/*
 * Ten megabytes and images only, enforced at the bucket.
 *
 * The form checks too, but a form check is a courtesy — this is
 * the one that holds when somebody posts to the storage API
 * directly. A 40 MB phone photo would otherwise sit in the
 * bucket costing money and time out every signed-URL fetch on
 * a 3G connection.
 */
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'host-photos';

/**
 * The cover photo for a host, for the banner.
 *
 * The shell is one frame across every property, so it needs a
 * single photo. The rule is the cover of the earliest property
 * that has one — stated here rather than decided in a React
 * file, because "which photo is the banner" is a question the
 * host will ask and there needs to be one answer.
 */
create or replace view host_banner_photo_v
with (security_invoker = false) as
select distinct on (p.host_id)
  p.host_id,
  p.id as property_id,
  p.name as property_name,
  coalesce(
    (select e ->> 'path' from jsonb_array_elements(p.photos) e
      where (e ->> 'cover')::boolean is true and e ? 'path' limit 1),
    (select e ->> 'path' from jsonb_array_elements(p.photos) e
      where e ? 'path' limit 1)
  ) as path
from public.property p
where p.deleted_at is null
  /*
   * An entry with a real file, not just any entry. The seeds
   * carry `{caption, placeholder: true}` rows with no path —
   * built before uploads existed — and counting those picked a
   * property whose banner then resolved to nothing.
   */
  and exists (
    select 1 from jsonb_array_elements(coalesce(p.photos, '[]'::jsonb)) e
     where e ? 'path' and nullif(e ->> 'path', '') is not null)
  and authz.is_host_member(p.host_id)
order by p.host_id, p.created_at;

-- ════════════════════════════════════════════ the card inspector

/*
 * Rebuilt rather than replaced: `create or replace view` cannot
 * add a column anywhere but the end, and this one needs the new
 * figures sitting with the rest of the card's facts. Dropping
 * first is the only way, and forgetting it has cost this
 * project an afternoon more than once.
 */
drop view if exists host_qr_list_v;
create view host_qr_list_v
with (security_invoker = false) as
select
  q.id,
  q.host_id,
  q.code,
  q.owner_id as unit_id,
  u.name as unit_name,
  u.label_public as unit_public_name,
  pr.name as property_name,
  q.placement::text as spot,
  q.label,
  q.state::text as state,
  q.generated_at,
  q.sent_at,
  q.placed_confirmed_at,
  q.voided_at,
  coalesce(sc.scans_30d, 0) as scans_30d,
  coalesce(sc.scans_all, 0) as scans_all,
  coalesce(sc.test_scans, 0) as test_scans,
  coalesce(sc.orders, 0) as orders,
  coalesce(sc.order_value_cents, 0) as order_value_cents,
  sc.last_scan_at,
  sc.first_scan_at,
  /*
   * The hour a card is typically used, in Nairobi. This is the
   * figure that tells a host a bedside card earns its place in
   * the evening and a kitchen card in the morning — the whole
   * reason spots are recorded at all.
   */
  sc.typical_hour,
  /* How many scans came from a device that had already scanned
     this card. Below ten scans it is withheld, because two out
     of three is not a repeat rate. */
  case when coalesce(sc.scans_30d, 0) >= 10 then sc.repeat_pct end as repeat_pct,
  case
    when q.voided_at is not null then 'voided'
    when q.placed_confirmed_at is not null then 'placed'
    else 'generated'
  end as status
from public.property_qr q
left join public.unit u on u.id = q.owner_id and q.owner_type = 'unit'
left join public.property pr on pr.id = u.property_id
left join lateral (
  select
    count(*) filter (where s.scanned_at > now() - interval '30 days'
                       and not s.is_bot and not s.is_test) as scans_30d,
    count(*) filter (where not s.is_bot and not s.is_test) as scans_all,
    count(*) filter (where s.is_test) as test_scans,
    count(o.id) as orders,
    coalesce(sum(o.total_cents), 0) as order_value_cents,
    max(s.scanned_at) as last_scan_at,
    min(s.scanned_at) filter (where not s.is_test) as first_scan_at,
    (select extract(hour from (s2.scanned_at at time zone 'Africa/Nairobi'))::int
       from public.qr_scan s2
      where s2.qr_id = q.id and not s2.is_bot and not s2.is_test
      group by 1 order by count(*) desc, 1 limit 1) as typical_hour,
    (select round(
        100.0 * count(*) filter (where dupe.n > 1) / nullif(count(*), 0))
       from (select s3.session_id, count(*) over (partition by s3.session_id) as n
               from public.qr_scan s3
              where s3.qr_id = q.id and not s3.is_bot and not s3.is_test
                and s3.session_id is not null) dupe) as repeat_pct
  from public.qr_scan s left join public."order" o on o.qr_scan_id = s.id
   where s.qr_id = q.id
) sc on true
where authz.is_host_member(q.host_id);

grant select on host_qr_list_v, host_banner_photo_v to authenticated;
revoke all on host_qr_list_v, host_banner_photo_v from anon;
revoke insert, update, delete, truncate on host_qr_list_v, host_banner_photo_v
from authenticated;
