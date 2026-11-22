-- The portal: the offerings editor's "Booking it opens" reaches the item, and
-- the Work page learns which orders are digital and still need a code.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to anon, authenticated;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1300000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'owner130@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1300000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'outsider130@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1300000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', null, null, true, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1300000-0000-4000-8000-00000000000a', '[Legal 130] Ltd', '[Gym 130]', 'restaurant',
        '[Contact]', '+254700013000', 'gym130@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1300000-0000-4000-8000-00000000000a', 'c1300000-0000-4000-8000-000000000001', 'owner');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1300000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.catalogue_section (id, merchant_id, name)
values ('c1300000-0000-4000-8000-0000000000c1', 'c1300000-0000-4000-8000-00000000000a', '[All]');
insert into public.catalogue_item (id, merchant_id, section_id, name, price_kes, available, sort, digital, requires_buyer_id) values
  ('c1300000-0000-4000-8000-0000000000d1', 'c1300000-0000-4000-8000-00000000000a',
   'c1300000-0000-4000-8000-0000000000c1', '[Gold plan]', 5000, true, 1, false, false),
  ('c1300000-0000-4000-8000-0000000000d2', 'c1300000-0000-4000-8000-00000000000a',
   'c1300000-0000-4000-8000-0000000000c1', '[Court hire]', 2000, true, 2, false, false),
  ('c1300000-0000-4000-8000-0000000000d3', 'c1300000-0000-4000-8000-00000000000a',
   'c1300000-0000-4000-8000-0000000000c1', '[eSIM 3 GB]', 700, true, 3, true, true);

-- ── the editor's booking link

insert into public.merchant_setup_offering_detail (item_id, merchant_id, version, data) values
  ('c1300000-0000-4000-8000-0000000000d1', 'c1300000-0000-4000-8000-00000000000a', 1,
   '{"id":"c1300000-0000-4000-8000-0000000000d1","schemaId":"MEMBERSHIP_PLAN_V1","priceMode":"fixed",
     "fields":{},"bookingOfferingId":"plan-gold"}'),
  ('c1300000-0000-4000-8000-0000000000d2', 'c1300000-0000-4000-8000-00000000000a', 1,
   '{"id":"c1300000-0000-4000-8000-0000000000d2","schemaId":"SPACE_RESERVATION_V1","priceMode":"fixed",
     "fields":{},"bookingOfferingId":"not a valid id"}');

select is((select kind::text || ' ' || booking_offering_id from public.catalogue_item
            where id = 'c1300000-0000-4000-8000-0000000000d1'), 'pass plan-gold',
  'A plan linked in the editor is booked through that booking.');
select is((select count(*)::int from public.catalogue_setup_review
            where item_id = 'c1300000-0000-4000-8000-0000000000d1' and kind = 'booking_kind'), 0,
  'A linked item is not left for review.');
select is((select kind::text from public.catalogue_item where id = 'c1300000-0000-4000-8000-0000000000d2'),
  'buy', 'Without a usable link the item is left as it is...');
select is((select count(*)::int from public.catalogue_setup_review
            where item_id = 'c1300000-0000-4000-8000-0000000000d2' and kind = 'booking_kind'), 1,
  '...and the shop is asked to link it.');

set local role anon;
select is((select booking_offering_id from public.catalogue_menu_public
            where id = 'c1300000-0000-4000-8000-0000000000d1'), 'plan-gold',
  'The apps see the booking the item opens.');
reset role;

-- ── digital orders on the Work page

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1300000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
insert into t select 'order', public.rpc_order_place_web(jsonb_build_object(
  'merchant_id', 'c1300000-0000-4000-8000-00000000000a', 'payment_method', 'mpesa_stk',
  'guest_phone', '+254700013099', 'guest_name', '[Buyer]',
  'buyer_id', jsonb_build_object('type', 'national_id', 'number', '12345678', 'name', 'Amani Otieno'),
  'items', jsonb_build_array(jsonb_build_object(
    'catalogue_item_id', 'c1300000-0000-4000-8000-0000000000d3', 'quantity', 1)))) ->> 'order_id';
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1300000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.rpc_merchant_digital_orders(array[(select v::uuid from t where k = 'order')]), '[]'::jsonb,
  'Someone outside the shop learns nothing.');
select set_config('request.jwt.claims',
  '{"sub":"c1300000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((public.rpc_merchant_digital_orders(array[(select v::uuid from t where k = 'order')]) -> 0
            ->> 'codes_missing')::int, 1, 'The shop sees one code still to send...');
select ok((public.rpc_merchant_digital_orders(array[(select v::uuid from t where k = 'order')]) -> 0
            ->> 'has_buyer_id')::boolean, '...and that the buyer gave an ID.');
select ok(not (public.rpc_merchant_digital_orders(array[(select v::uuid from t where k = 'order')])::text
               like '%12345678%'), 'It never returns the ID itself.');
reset role;

select * from finish();
rollback;
