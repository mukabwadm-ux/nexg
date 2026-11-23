-- Merchant facts for the apps (20270227000100, R8): traits and a popularity
-- band per listed shop, a staff-only branch place ID, and the customer's
-- recent categories.

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1460000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'customer146@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1460000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'other146@example.test', now(), false, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at,
                             pay_on_delivery, late_night_until, has_own_riders)
values
  ('c1460000-0000-4000-8000-00000000000a', '[Legal 146] Ltd', '[Shop 146]', 'restaurant',
   '[Contact]', '+254700014600', 'shop146@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '5 days',
   true, '02:00', true),
  ('c1460000-0000-4000-8000-00000000000b', '[Legal 146b] Ltd', '[Quiet 146]', 'supermarket',
   '[Contact]', '+254700014601', 'quiet146@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '90 days',
   false, null, false),
  ('c1460000-0000-4000-8000-00000000000c', '[Legal 146c] Ltd', '[Hidden 146]', 'restaurant',
   '[Contact]', '+254700014602', 'hidden146@example.test',
   (select id from public.city where slug = 'nairobi'), 'documents_pending', false, false, null,
   false, null, false);
insert into public.merchant_branch (id, merchant_id, name, address_text, is_primary)
values ('c1460000-0000-4000-8000-0000000000ba', 'c1460000-0000-4000-8000-00000000000a', 'Main', '[Address]', true),
       ('c1460000-0000-4000-8000-0000000000bb', 'c1460000-0000-4000-8000-00000000000b', 'Main', '[Address]', true);
insert into public.catalogue_section (id, merchant_id, name)
values ('c1460000-0000-4000-8000-0000000000e1', 'c1460000-0000-4000-8000-00000000000a', 'Menu'),
       ('c1460000-0000-4000-8000-0000000000e2', 'c1460000-0000-4000-8000-00000000000b', 'Shelf');
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available, kind, dietary_labels)
values
  ('c1460000-0000-4000-8000-0000000000d1', 'c1460000-0000-4000-8000-0000000000e1',
   'c1460000-0000-4000-8000-00000000000a', 'Githeri', 300, true, 'buy', array['vegetarian', 'vegan']),
  ('c1460000-0000-4000-8000-0000000000d2', 'c1460000-0000-4000-8000-0000000000e1',
   'c1460000-0000-4000-8000-00000000000a', 'Nyama', 800, true, 'buy', array['halal']),
  ('c1460000-0000-4000-8000-0000000000d3', 'c1460000-0000-4000-8000-0000000000e1',
   'c1460000-0000-4000-8000-00000000000a', 'Off sale', 100, false, 'buy', array['kosher']),
  ('c1460000-0000-4000-8000-0000000000d4', 'c1460000-0000-4000-8000-0000000000e2',
   'c1460000-0000-4000-8000-00000000000b', 'Unga', 200, true, 'buy', '{}');

-- ══════════════════════════════════════════════ traits

set local role anon;
select is(
  (select traits from public.merchant_traits_public where merchant_id = 'c1460000-0000-4000-8000-00000000000a'),
  array['pay_on_delivery', 'open_late', 'own_riders', 'new', 'vegetarian_options', 'vegan_options', 'halal_options'],
  'A shop''s traits come from its settings and the items it has on sale (not items off sale).');
select is(
  (select traits from public.merchant_traits_public where merchant_id = 'c1460000-0000-4000-8000-00000000000b'),
  '{}'::text[], 'A shop with none of them has no traits.');
select ok(not exists (select 1 from public.merchant_traits_public
                       where merchant_id = 'c1460000-0000-4000-8000-00000000000c'),
  'A shop that is not listed is not in the view.');
select is(
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'merchant_traits_public'),
  array['merchant_id', 'traits', 'popularity_band'],
  'The view has only the merchant, its traits and its band: no raw counts.');
select is(
  (select popularity_band from public.merchant_traits_public where merchant_id = 'c1460000-0000-4000-8000-00000000000a'),
  0::smallint, 'No paid orders: popularity band 0.');
reset role;

-- ══════════════════════════════════════════════ orders: band and recent categories

-- The customer collects five orders from the restaurant and one from the grocer.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
create temp table t_placed (id uuid) on commit drop;
grant all on t_placed to authenticated;
insert into t_placed
select (public.rpc_order_place_web(jsonb_build_object(
          'merchant_id', 'c1460000-0000-4000-8000-00000000000a', 'payment_method', 'mpesa_stk',
          'fulfilment', 'pickup', 'guest_phone', '+254700146001',
          'items', '[{"catalogue_item_id": "c1460000-0000-4000-8000-0000000000d1", "quantity": 1}]'::jsonb))
        ->> 'order_id')::uuid
  from generate_series(1, 3);
reset role;
-- The guest limit of three unpaid orders: pay these before placing more.
update public.order set payment_status = 'paid' where id in (select id from t_placed);
set local role authenticated;
insert into t_placed
select (public.rpc_order_place_web(jsonb_build_object(
          'merchant_id', 'c1460000-0000-4000-8000-00000000000a', 'payment_method', 'mpesa_stk',
          'fulfilment', 'pickup', 'guest_phone', '+254700146001',
          'items', '[{"catalogue_item_id": "c1460000-0000-4000-8000-0000000000d1", "quantity": 1}]'::jsonb))
        ->> 'order_id')::uuid
  from generate_series(1, 2);
insert into t_placed
select (public.rpc_order_place_web(jsonb_build_object(
          'merchant_id', 'c1460000-0000-4000-8000-00000000000b', 'payment_method', 'mpesa_stk',
          'fulfilment', 'pickup', 'guest_phone', '+254700146001',
          'items', '[{"catalogue_item_id": "c1460000-0000-4000-8000-0000000000d4", "quantity": 1}]'::jsonb))
        ->> 'order_id')::uuid;
reset role;

select is((select count(*)::int from t_placed where id is not null), 6, 'Six orders were placed.');
select is(
  (select popularity_band from public.merchant_traits_public where merchant_id = 'c1460000-0000-4000-8000-00000000000a'),
  0::smallint, 'Unpaid orders do not count towards popularity.');
update public.order set payment_status = 'paid'
 where id in (select id from t_placed) and merchant_id = 'c1460000-0000-4000-8000-00000000000a';
select is(
  (select popularity_band from public.merchant_traits_public where merchant_id = 'c1460000-0000-4000-8000-00000000000a'),
  1::smallint, 'Five paid orders in 30 days: band 1.');
update public.order set placed_at = now() - interval '40 days'
 where id in (select id from t_placed) and merchant_id = 'c1460000-0000-4000-8000-00000000000a';
select is(
  (select popularity_band from public.merchant_traits_public where merchant_id = 'c1460000-0000-4000-8000-00000000000a'),
  0::smallint, 'Orders older than 30 days do not count.');

set local role authenticated;
select is(
  (select jsonb_agg(jsonb_build_array(c ->> 'category', (c ->> 'orders')::int))
     from jsonb_array_elements(public.rpc_my_recent_categories()) c),
  '[["supermarket", 1], ["restaurant", 5]]'::jsonb,
  'The customer''s categories, most recent first, with how many orders.');
select is(jsonb_array_length(public.rpc_my_recent_categories(1)), 1, 'The limit is respected.');
select set_config('request.jwt.claims',
  '{"sub":"c1460000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.rpc_my_recent_categories(), '[]'::jsonb,
  'Another account sees only its own (no) categories.');
reset role;

set local role anon;
select throws_ok($$select public.rpc_my_recent_categories()$$, '42501', null,
  'The anonymous key cannot ask for recent categories.');
reset role;

-- ══════════════════════════════════════════════ branch place ID

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1460000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.rpc_staff_branch_place_set('c1460000-0000-4000-8000-0000000000ba', 'ChIJp0lN2HIRLxgRTJKXslQCz_c')$$,
  '42501', 'Only staff who manage merchants in this city can set a place ID.',
  'A customer cannot set a place ID.');
reset role;
insert into public.merchant_branch_place (branch_id, google_place_id)
values ('c1460000-0000-4000-8000-0000000000ba', 'ChIJp0lN2HIRLxgRTJKXslQCz_c');
set local role authenticated;
select is((select count(*)::int from public.merchant_branch_place), 0,
  'A customer cannot read place IDs.');
reset role;

select * from finish();
rollback;
