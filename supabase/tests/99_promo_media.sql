-- A merchant's own image or video on a featured card or a promotion (20270101120100).
--
-- Files are checked against what storage recorded, nothing reaches a guest
-- before NexG approves it, and a guest can read a file only while it is shown.

begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- ═══════════════════════════════════════════ people, shops, slots

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','c9700000-0000-4000-8000-000000000001',
   'authenticated','authenticated','owner97@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','c9700000-0000-4000-8000-000000000002',
   'authenticated','authenticated','other97@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','c9700000-0000-4000-8000-000000000003',
   'authenticated','authenticated','growth97@nexgapp.com',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','c9700000-0000-4000-8000-000000000004',
   'authenticated','authenticated','viewer97@nexgapp.com',now(),false,now(),now());

insert into public.staff_user (id, user_id, email, display_name)
values ('c9790000-0000-4000-8000-00000000000a','c9700000-0000-4000-8000-000000000003',
        'growth97@nexgapp.com','Growth 97'),
       ('c9790000-0000-4000-8000-00000000000b','c9700000-0000-4000-8000-000000000004',
        'viewer97@nexgapp.com','Viewer 97');
insert into public.role_grant (staff_user_id, role_id, granted_by)
values ('c9790000-0000-4000-8000-00000000000a', (select id from public.role where key = 'growth'),
        'c9790000-0000-4000-8000-00000000000a'),
       ('c9790000-0000-4000-8000-00000000000b', (select id from public.role where key = 'read_only'),
        'c9790000-0000-4000-8000-00000000000a');

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values
  ('c9710000-0000-4000-8000-00000000000a','[Legal 97a] Ltd','[Shop 97a]','restaurant',
   '[Contact]','+254700009701','shop97a@example.test',
   (select id from public.city where slug = 'nairobi'),'live', true, true, now() - interval '60 days'),
  ('c9710000-0000-4000-8000-00000000000b','[Legal 97b] Ltd','[Shop 97b]','restaurant',
   '[Contact]','+254700009702','shop97b@example.test',
   (select id from public.city where slug = 'nairobi'),'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role)
values ('c9710000-0000-4000-8000-00000000000a','c9700000-0000-4000-8000-000000000001','owner'),
       ('c9710000-0000-4000-8000-00000000000b','c9700000-0000-4000-8000-000000000002','owner');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c9710000-0000-4000-8000-00000000000a','Main','[Address]', true),
       ('c9710000-0000-4000-8000-00000000000b','Main','[Address]', true);

insert into public.featured_placement (id, city_id, kind, category, position, label)
values
  ('c9760000-0000-4000-8000-000000000001', (select id from public.city where slug = 'nairobi'),
   'homepage', null, 97, '[Homepage 97]'),
  ('c9760000-0000-4000-8000-000000000002', (select id from public.city where slug = 'nairobi'),
   'homepage', null, 98, '[Homepage 98]'),
  ('c9760000-0000-4000-8000-000000000003', (select id from public.city where slug = 'nairobi'),
   'category_top', 'restaurant', 97, '[Category top 97]');

-- Eligibility has its own suite (14); here every live shop qualifies.
update public.featured_rule set value = '0'
 where key in ('eligibility.live_days', 'eligibility.health_green_days');
update public.featured_rule set value = 'false'
 where key = 'eligibility.require_settlement_verified';

-- What storage recorded for files already sent (as the upload would).
insert into storage.objects (bucket_id, name, metadata) values
  ('promo-media', 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000001.mp4',
   '{"mimetype": "video/mp4", "size": 4000000}'),
  ('promo-media', 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000002.jpg',
   '{"mimetype": "image/jpeg", "size": 180000}'),
  ('promo-media', 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000003.png',
   '{"mimetype": "image/png", "size": 4000000}'),
  ('promo-media', 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000004.webp',
   '{"mimetype": "image/webp", "size": 900000}'),
  ('promo-media', 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000005.jpg',
   '{"mimetype": "video/mp4", "size": 900000}'),
  ('promo-media', 'c9710000-0000-4000-8000-00000000000b/c9750000-0000-4000-8000-000000000006.jpg',
   '{"mimetype": "image/jpeg", "size": 100000}'),
  ('promo-media', 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000007.webp',
   '{"mimetype": "image/webp", "size": 500000}'),
  ('promo-media', 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000008.jpg',
   '{"mimetype": "image/jpeg", "size": 300000}');

create temp table t97 (k text primary key, v text);
grant all on t97 to authenticated, anon;
do $grant$
begin
  execute format('grant usage on schema %I to authenticated, anon',
                 (select nspname from pg_namespace n join pg_class c on c.relnamespace = n.oid
                   where c.relname = 't97' and n.nspname like 'pg_temp%'));
end
$grant$;

-- ═══════════════════════════════════════════ the bucket

select ok(
  exists (select 1 from storage.buckets
           where id = 'promo-media' and not public and file_size_limit = 10485760
             and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
             and cardinality(allowed_mime_types) = 5),
  'promo-media is private, 10 MB at most, and takes JPG, PNG, WebP, MP4 and WebM only.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c9700000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner, metadata)
    values ('promo-media', 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-0000000000aa.webm',
            'c9700000-0000-4000-8000-000000000001', '{"mimetype": "video/webm", "size": 1000}')$$,
  'An owner can upload into their business''s folder.');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner, metadata)
    values ('promo-media', 'c9710000-0000-4000-8000-00000000000b/c9750000-0000-4000-8000-0000000000ab.jpg',
            'c9700000-0000-4000-8000-000000000001', '{"mimetype": "image/jpeg", "size": 1000}')$$,
  '42501', null, 'Not into another business''s folder.');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner, metadata)
    values ('promo-media', 'c9710000-0000-4000-8000-00000000000a/poster.gif',
            'c9700000-0000-4000-8000-000000000001', '{"mimetype": "image/gif", "size": 1000}')$$,
  '42501', null, 'Only <random uuid>.<jpg|png|webp|mp4|webm> names are accepted.');

-- ═══════════════════════════════════════════ a card with the request

select throws_like(
  $$select public.rpc_merchant_request_featured(
      'c9710000-0000-4000-8000-00000000000a', 'c9760000-0000-4000-8000-000000000001',
      (date_trunc('week', current_date) + interval '7 days')::date, 1, null, null,
      '{"media": {"kind": "image", "path": "c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000003.png"}}')$$,
  '%up to 3 MB%', 'An image over 3 MB is refused, by the size storage recorded.');

select throws_like(
  $$select public.rpc_merchant_request_featured(
      'c9710000-0000-4000-8000-00000000000a', 'c9760000-0000-4000-8000-000000000001',
      (date_trunc('week', current_date) + interval '7 days')::date, 1, null, null,
      '{"media": {"kind": "image", "path": "c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000005.jpg"}}')$$,
  '%JPG, PNG or WebP%', 'A file whose recorded type is not an image is refused as one.');

select throws_like(
  $$select public.rpc_merchant_request_featured(
      'c9710000-0000-4000-8000-00000000000a', 'c9760000-0000-4000-8000-000000000001',
      (date_trunc('week', current_date) + interval '7 days')::date, 1, null, null,
      '{"media": {"kind": "video", "path": "c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000001.mp4"}}')$$,
  '%still frame%', 'A video without its still frame is refused.');

select throws_like(
  $$select public.rpc_merchant_request_featured(
      'c9710000-0000-4000-8000-00000000000a', 'c9760000-0000-4000-8000-000000000001',
      (date_trunc('week', current_date) + interval '7 days')::date, 1, null, null,
      '{"media": {"kind": "image", "path": "c9710000-0000-4000-8000-00000000000b/c9750000-0000-4000-8000-000000000006.jpg"}}')$$,
  '%not one of your uploads%', 'Another business''s file is refused.');

select throws_like(
  $$select public.rpc_merchant_request_featured(
      'c9710000-0000-4000-8000-00000000000a', 'c9760000-0000-4000-8000-000000000003',
      (date_trunc('week', current_date) + interval '7 days')::date, 1, null, null,
      '{"media": {"kind": "image", "path": "c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000004.webp"}}')$$,
  '%Only a homepage slot%', 'Only a homepage slot takes a card.');

select throws_like(
  $$select public.rpc_merchant_request_featured(
      'c9710000-0000-4000-8000-00000000000a', 'c9760000-0000-4000-8000-000000000001',
      (date_trunc('week', current_date) + interval '7 days')::date, 1, null, null,
      '{"blurb": "The best grill in town"}')$$,
  '%cannot say%', 'The line under the name is checked for banned claims.');

select is(
  (select count(*)::int from public.featured_booking where merchant_id = 'c9710000-0000-4000-8000-00000000000a'),
  0, 'A refused card leaves no request behind.');

select lives_ok(
  $$insert into t97 select 'request', public.rpc_merchant_request_featured(
      'c9710000-0000-4000-8000-00000000000a', 'c9760000-0000-4000-8000-000000000001',
      (date_trunc('week', current_date) + interval '7 days')::date, 1, null, null,
      '{"media": {"kind": "video",
                  "path": "c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000001.mp4",
                  "poster_path": "c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000002.jpg"},
        "blurb": "Charcoal grill, open till late"}')::text$$,
  'A request with a video card is accepted.');

select is(
  (select status::text || ' ' || media_kind || ' ' || media_mime || ' ' || media_bytes || ' ' || blurb
     from public.featured_creative
    where booking_id = ((select v from t97 where k = 'request')::jsonb ->> 'booking_id')::uuid),
  'pending_review video video/mp4 4000000 Charcoal grill, open till late',
  'The card waits for review, keeping the type and size storage recorded.');

-- ═══════════════════════════════════════════ who can read the files

select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'promo-media'
      and name = 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000001.mp4'),
  1, 'The owner can read their own upload.');

select set_config('request.jwt.claims',
  '{"sub":"c9700000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'promo-media'
      and name like 'c9710000-0000-4000-8000-00000000000a/%'),
  0, 'Another business cannot.');

select throws_ok(
  $$select public.rpc_merchant_featured_card_save(
      ((select v from t97 where k = 'request')::jsonb ->> 'booking_id')::uuid, null, 'Mine now')$$,
  '42501', null, 'Nor can it change the card.');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'promo-media'),
  0, 'A visitor can read nothing before it is approved and shown.');
reset role;

-- The week is sold and running (as rpc_featured_place_merchant would leave it).
update public.featured_booking set status = 'live', quoted_price = 5000,
       start_date = date_trunc('week', current_date)::date,
       end_date = date_trunc('week', current_date)::date + 6
 where merchant_id = 'c9710000-0000-4000-8000-00000000000a';
insert into public.featured_slot_week (placement_id, week_start, booking_id, status, price)
select 'c9760000-0000-4000-8000-000000000001', date_trunc('week', current_date)::date, id, 'live', 5000
  from public.featured_booking where merchant_id = 'c9710000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int from public.featured_live_v
    where merchant_id = 'c9710000-0000-4000-8000-00000000000a'
      and not has_creative and media_path is null and blurb is null),
  1, 'Until it is approved the slot shows the merchant''s own photo and name.');

-- ═══════════════════════════════════════════ review

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c9700000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.rpc_featured_creative_review(
      (select id from public.featured_creative
        where merchant_id = 'c9710000-0000-4000-8000-00000000000a' and status = 'pending_review'), true)$$,
  '42501', null, 'A view-only role can watch the queue but not approve.');

select set_config('request.jwt.claims',
  '{"sub":"c9700000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_featured_creative_review(
      (select id from public.featured_creative
        where merchant_id = 'c9710000-0000-4000-8000-00000000000a' and status = 'pending_review'), true)$$,
  'Growth approves the card.');

select throws_like(
  $$select public.rpc_featured_creative_review(
      (select id from public.featured_creative
        where merchant_id = 'c9710000-0000-4000-8000-00000000000a' and status = 'approved'), true)$$,
  '%not waiting for review%', 'A card that is not waiting cannot be decided again.');
reset role;

select is(
  (select media_kind || ' ' || media_path || ' ' || poster_path || ' ' || blurb from public.featured_live_v
    where merchant_id = 'c9710000-0000-4000-8000-00000000000a'),
  'video c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000001.mp4 '
    || 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000002.jpg '
    || 'Charcoal grill, open till late',
  'The homepage reads the approved video, its still and the line.');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'promo-media'),
  2, 'While the card is on the homepage a visitor can read its video and still, and nothing else.');
reset role;

select is(
  (select body from public.merchant_message
    where merchant_id = 'c9710000-0000-4000-8000-00000000000a' and direction = 'out'
      and subject = 'Featured card approved'),
  'Your homepage card is approved. It shows whenever your slot is live.',
  'The merchant is told.');

-- ═══════════════════════════════════════════ a change, then taking it down

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c9700000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_merchant_featured_card_save(
      (select id from public.featured_booking where merchant_id = 'c9710000-0000-4000-8000-00000000000a'),
      '{"kind": "image", "path": "c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000007.webp"}',
      'Charcoal grill, now with breakfast')$$,
  'The owner sends a new card while the old one is up.');

select is(
  (select media_path from public.featured_live_v where merchant_id = 'c9710000-0000-4000-8000-00000000000a'),
  'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000001.mp4',
  'The approved card stays on the homepage until the new one is approved.');

/* As the Storage API deletes: past storage's guard on direct deletes, still
   under the bucket's delete policy for the caller. */
select set_config('storage.allow_delete_query', 'true', true);
with gone as (
  delete from storage.objects
   where bucket_id = 'promo-media'
     and name = 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000001.mp4'
  returning 1)
insert into t97 select 'deleted_in_use', count(*)::text from gone;
select is((select v from t97 where k = 'deleted_in_use'), '0', 'A file in use cannot be deleted.');

select lives_ok(
  $$insert into t97 select 'withdrawn', public.rpc_merchant_featured_card_withdraw(
      (select id from public.featured_booking where merchant_id = 'c9710000-0000-4000-8000-00000000000a'))::text$$,
  'The owner takes the card down.');

select is(
  (select array_agg(f order by f)::text from jsonb_array_elements_text(
     (select v from t97 where k = 'withdrawn')::jsonb -> 'freed') f),
  '{c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000001.mp4,'
    || 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000002.jpg,'
    || 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000007.webp}',
  'Taking it down frees the video, its still and the waiting image for deleting.');

with gone as (
  delete from storage.objects
   where bucket_id = 'promo-media'
     and name = 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000007.webp'
  returning 1)
insert into t97 select 'deleted_freed', count(*)::text from gone;
select is((select v from t97 where k = 'deleted_freed'), '1', 'A freed file can be deleted by its owner.');
reset role;

select is(
  (select count(*)::int from public.featured_live_v
    where merchant_id = 'c9710000-0000-4000-8000-00000000000a' and not has_creative),
  1, 'The slot stays live with the merchant''s own photo and name.');

-- ═══════════════════════════════════════════ a promotion's picture

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c9700000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into t97 select 'promotion', public.rpc_merchant_promotion_save(
      'c9710000-0000-4000-8000-00000000000a', null, 'Weekend special', 'percent', 15, null, null, null,
      '{"kind": "image", "path": "c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000004.webp"}')::text$$,
  'A promotion is saved with its picture.');
reset role;

select is(
  (select count(*)::int from public.promotion_banner_v where merchant_id = 'c9710000-0000-4000-8000-00000000000a'),
  0, 'The store shows no banner before the picture is approved.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c9700000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$select public.rpc_promotion_creative_review(
      (select id from public.merchant_promotion_creative
        where merchant_id = 'c9710000-0000-4000-8000-00000000000a' and status = 'pending_review'), true)$$,
  'Growth approves the picture.');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select name || ' ' || media_kind || ' ' || media_path from public.promotion_banner_v
    where merchant_id = 'c9710000-0000-4000-8000-00000000000a'),
  'Weekend special image c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000004.webp',
  'Any visitor sees the banner while the promotion runs.');
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'promo-media'
      and name = 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000004.webp'),
  1, 'And can read its picture.');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c9700000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.rpc_merchant_promotion_set_status(
  ((select v from t97 where k = 'promotion')::jsonb ->> 'promotion_id')::uuid, 'paused');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'promo-media'
      and name = 'c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000004.webp'),
  0, 'A paused promotion''s picture is private again.');
reset role;

-- A replacement goes back for review, and a refusal needs a reason.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c9700000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.rpc_merchant_promotion_media_save(
  ((select v from t97 where k = 'promotion')::jsonb ->> 'promotion_id')::uuid,
  '{"kind": "image", "path": "c9710000-0000-4000-8000-00000000000a/c9750000-0000-4000-8000-000000000008.jpg"}');

select set_config('request.jwt.claims',
  '{"sub":"c9700000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_like(
  $$select public.rpc_promotion_creative_review(
      (select id from public.merchant_promotion_creative
        where merchant_id = 'c9710000-0000-4000-8000-00000000000a' and status = 'pending_review'), false)$$,
  '%Write a reason%', 'Sending a picture back needs a reason.');
select lives_ok(
  $$select public.rpc_promotion_creative_review(
      (select id from public.merchant_promotion_creative
        where merchant_id = 'c9710000-0000-4000-8000-00000000000a' and status = 'pending_review'),
      false, 'The price in the picture does not match the promotion.')$$,
  'Growth sends it back with a reason.');
reset role;

select is(
  (select body from public.merchant_message
    where merchant_id = 'c9710000-0000-4000-8000-00000000000a' and direction = 'out'
      and subject = 'Promotion picture needs a change'),
  'The picture for "Weekend special" was not approved: The price in the picture does not match the promotion. Change it in Promotions and send it again.',
  'The merchant is told why, in their own words.');

-- ═══════════════════════════════════════════ Monday, without artwork

insert into public.featured_booking (id, merchant_id, placement_id, placement_kind, city_id,
  status, requested_via, weeks, start_date, end_date, confirmed_at, quoted_price)
values ('c9770000-0000-4000-8000-000000000001','c9710000-0000-4000-8000-00000000000b',
        'c9760000-0000-4000-8000-000000000002','homepage',
        (select id from public.city where slug = 'nairobi'),'booked','staff', 1,
        date_trunc('week', current_date)::date, date_trunc('week', current_date)::date + 6, now(), 5000);
insert into public.featured_slot_week (placement_id, week_start, booking_id, status, price)
values ('c9760000-0000-4000-8000-000000000002', date_trunc('week', current_date)::date,
        'c9770000-0000-4000-8000-000000000001', 'booked', 5000);

select public.cron_featured_activate();

select is(
  (select count(*)::int from public.featured_live_v
    where booking_id = 'c9770000-0000-4000-8000-000000000001' and not has_creative),
  1, 'A booked week goes live on Monday without waiting for artwork.');

-- ═══════════════════════════════════════════ grants and the audit trail

select ok(
  not has_function_privilege('anon', 'public.rpc_merchant_featured_card_save(uuid, jsonb, text)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_merchant_promotion_save(uuid, uuid, text, text, integer, uuid, timestamptz, timestamptz, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_promotion_creative_review(uuid, boolean, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_promo_media_object(uuid, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_featured_card_put(public.featured_booking, jsonb, text)', 'execute')
  and has_function_privilege('authenticated', 'public.rpc_merchant_featured_card_save(uuid, jsonb, text)', 'execute'),
  'Visitors cannot call the merchant or review commands, and nobody calls the internal checks directly.');

select is_empty(
  $$select distinct e.action from audit.audit_event e
     where e.action in ('featured.creative_submitted', 'featured.creative_withdrawn',
                        'featured.creative_approved', 'promotion.creative_submitted',
                        'promotion.creative_approved', 'promotion.creative_rejected')
       and not exists (select 1 from audit.action_registry r where r.action = e.action)$$,
  'Every action logged here is registered.');

select is(
  (select count(distinct action)::int from audit.audit_event
    where action in ('featured.creative_submitted', 'featured.creative_withdrawn',
                     'featured.creative_approved', 'promotion.creative_submitted',
                     'promotion.creative_approved', 'promotion.creative_rejected')
      and at >= now()),
  6, 'Submitting, approving, sending back and taking down are all in the audit trail.');

select * from finish();
rollback;
