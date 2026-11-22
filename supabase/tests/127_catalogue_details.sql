-- What the offerings editor knows about an item now reaches the apps' list:
-- the unit of the price, duration, party size, preparation time, its discount
-- (as a promotion checkout applies) and what a bundle contains.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c1240000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'owner124@example.test', now(), false, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1240000-0000-4000-8000-00000000000a', '[Legal 124] Ltd', '[Venue 124]', 'restaurant',
        '[Contact]', '+254700012400', 'venue124@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1240000-0000-4000-8000-00000000000a', 'c1240000-0000-4000-8000-000000000001', 'owner');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1240000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.zone (id, city_id, name, tier, polygon, eta_min, eta_max, active)
values ('c1240000-0000-4000-8000-0000000000e1', (select id from public.city where slug = 'nairobi'),
        '[Zone 124]', 'core',
        'SRID=4326;POLYGON((36.59 -1.41, 36.61 -1.41, 36.61 -1.39, 36.59 -1.39, 36.59 -1.41))'::extensions.geography,
        20, 40, true);

insert into public.catalogue_section (id, merchant_id, name)
values ('c1240000-0000-4000-8000-0000000000c1', 'c1240000-0000-4000-8000-00000000000a', '[All]');
insert into public.catalogue_item (id, merchant_id, section_id, name, price_kes, available, sort, prep_time_minutes) values
  ('c1240000-0000-4000-8000-0000000000d1', 'c1240000-0000-4000-8000-00000000000a',
   'c1240000-0000-4000-8000-0000000000c1', '[Buffet]', 1000, true, 1, null),
  ('c1240000-0000-4000-8000-0000000000d2', 'c1240000-0000-4000-8000-00000000000a',
   'c1240000-0000-4000-8000-0000000000c1', '[Burger]', 800, true, 2, 25),
  ('c1240000-0000-4000-8000-0000000000d3', 'c1240000-0000-4000-8000-00000000000a',
   'c1240000-0000-4000-8000-0000000000c1', '[Fries]', 300, true, 3, null),
  ('c1240000-0000-4000-8000-0000000000d4', 'c1240000-0000-4000-8000-00000000000a',
   'c1240000-0000-4000-8000-0000000000c1', '[Meal deal]', 1000, true, 4, null);

-- Saved in the editor: a per-person buffet with a duration, party size and 10% off.
insert into public.merchant_setup_offering_detail (item_id, merchant_id, version, data) values
  ('c1240000-0000-4000-8000-0000000000d1', 'c1240000-0000-4000-8000-00000000000a', 1,
   '{"id":"of-buffet","schemaId":"PRODUCT_CATALOG_V1","priceMode":"unit","unit":"person",
     "fields":{"duration_minutes":120,"party_min":2,"party_max":20,"preparation_minutes":15},
     "discount":{"enabled":true,"kind":"percentage","value":"10","startsAt":"","endsAt":""}}'),
  ('c1240000-0000-4000-8000-0000000000d2', 'c1240000-0000-4000-8000-00000000000a', 1,
   '{"id":"of-burger","schemaId":"PRODUCT_CATALOG_V1","priceMode":"fixed","unit":"item",
     "fields":{"preparation_minutes":10},
     "discount":{"enabled":true,"kind":"percentage","value":"95","startsAt":"","endsAt":""}}'),
  ('c1240000-0000-4000-8000-0000000000d3', 'c1240000-0000-4000-8000-00000000000a', 1,
   '{"id":"of-fries","schemaId":"PRODUCT_CATALOG_V1","priceMode":"fixed","unit":"item","fields":{}}'),
  ('c1240000-0000-4000-8000-0000000000d4', 'c1240000-0000-4000-8000-00000000000a', 1,
   '{"id":"of-meal","schemaId":"PRODUCT_CATALOG_V1","priceMode":"fixed","unit":"item","fields":{},
     "bundleItems":[{"offeringId":"of-burger","quantity":1},{"offeringId":"of-fries","quantity":2},
                    {"offeringId":"of-missing","quantity":1}]}');

-- ── unit, timing, party

select is((select price_per from public.catalogue_item where id = 'c1240000-0000-4000-8000-0000000000d1'),
  'person', 'A per-person price says so.');
select is((select count(*)::int from public.catalogue_setup_review
            where item_id = 'c1240000-0000-4000-8000-0000000000d1' and kind = 'unit'), 0,
  'A per-person price is no longer left for review.');
select is((select array[duration_minutes, party_min, party_max] from public.catalogue_item
            where id = 'c1240000-0000-4000-8000-0000000000d1'), array[120, 2, 20],
  'Duration and party size come from the editor.');
select is((select prep_time_minutes from public.catalogue_item where id = 'c1240000-0000-4000-8000-0000000000d1'),
  15, 'Preparation time fills an empty one.');
select is((select prep_time_minutes from public.catalogue_item where id = 'c1240000-0000-4000-8000-0000000000d2'),
  25, 'A preparation time set on the Menu page is kept.');

-- ── discount

select is((select count(*)::int from public.merchant_promotion
            where setup_item_id = 'c1240000-0000-4000-8000-0000000000d1' and kind = 'percent' and value = 10
              and catalogue_item_id = 'c1240000-0000-4000-8000-0000000000d1' and status = 'active'), 1,
  'The editor''s discount becomes a promotion on that item.');
select is((select count(*)::int from public.merchant_promotion
            where setup_item_id = 'c1240000-0000-4000-8000-0000000000d2'), 0,
  'A discount over 90% is not applied...');
select is((select count(*)::int from public.catalogue_setup_review
            where item_id = 'c1240000-0000-4000-8000-0000000000d2' and kind = 'discount'), 1,
  '...and is listed for the shop to fix.');

set local role anon;
select is((select array[promo_price_kes::text, promotion_name] from public.catalogue_menu_public
            where id = 'c1240000-0000-4000-8000-0000000000d1'), array['900', '[Buffet] offer'],
  'The apps see the offer price checkout will charge.');
select is((select row(price_per, duration_minutes, party_min, party_max)::text from public.catalogue_menu_public
            where id = 'c1240000-0000-4000-8000-0000000000d1'), '(person,120,2,20)',
  'The apps see the unit, duration and party size.');
select ok((select promo_price_kes is null from public.catalogue_menu_public
            where id = 'c1240000-0000-4000-8000-0000000000d3'),
  'An item without an offer has no offer price.');
reset role;

-- Saved again without the discount: the promotion goes.
update public.merchant_setup_offering_detail
   set data = data - 'discount', version = 2
 where item_id = 'c1240000-0000-4000-8000-0000000000d1';
select is((select count(*)::int from public.merchant_promotion
            where setup_item_id = 'c1240000-0000-4000-8000-0000000000d1'), 0,
  'Taking the discount off in the editor ends the promotion.');

-- ── bundle

set local role anon;
select is((select bundle_items from public.catalogue_menu_public where id = 'c1240000-0000-4000-8000-0000000000d4'),
  jsonb_build_array(
    jsonb_build_object('item_id', 'c1240000-0000-4000-8000-0000000000d2', 'name', '[Burger]', 'quantity', 1),
    jsonb_build_object('item_id', 'c1240000-0000-4000-8000-0000000000d3', 'name', '[Fries]', 'quantity', 2)),
  'A bundle lists what it contains, with quantities.');
reset role;
select is((select count(*)::int from public.catalogue_setup_review
            where item_id = 'c1240000-0000-4000-8000-0000000000d4' and kind = 'bundle'), 1,
  'A part that is not saved yet is listed for the shop.');

-- ── shape

select is(array(select column_name::text from information_schema.columns
                 where table_schema = 'public' and table_name = 'catalogue_menu_public'
                 order by ordinal_position limit 32), array[
  'id', 'merchant_id', 'section_id', 'name', 'description', 'price_kes', 'available',
  'age_restricted', 'highlighted', 'sort', 'photo_path', 'gallery_paths', 'kind',
  'booking_offering_id', 'sold_by', 'unit_label', 'unit_step', 'unit_min', 'unit_max',
  'price_is_estimate', 'has_options', 'has_variants', 'sold_out', 'price_per',
  'prep_time_minutes', 'duration_minutes', 'party_min', 'party_max', 'promo_price_kes',
  'promotion_name', 'promotion_ends_at', 'bundle_items'],
  'The apps'' list gains the new columns at the end.');
select columns_are('public', 'catalogue_public', array[
  'id', 'merchant_id', 'section_id', 'name', 'description', 'price_kes', 'available',
  'age_restricted', 'highlighted', 'sort', 'photo_path', 'gallery_paths', 'kind',
  'booking_offering_id', 'sold_by', 'unit_label', 'unit_step', 'unit_min', 'unit_max',
  'price_is_estimate', 'has_options', 'has_variants'],
  'catalogue_public is unchanged.');
select throws_ok($$update public.catalogue_item set price_per = 'week'
                    where id = 'c1240000-0000-4000-8000-0000000000d3'$$,
  '23514', null, 'Only the known units are allowed.');

select * from finish();
rollback;
