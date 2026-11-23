-- A customer cancels their own unpaid order, rates a delivered one, sets a
-- laundry collection time, and can no longer pay cash on delivery
-- (20270128000100).

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000020',
   'authenticated', 'authenticated', 'buyer110@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000021',
   'authenticated', 'authenticated', 'stranger110@example.test', now(), false, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at, pay_on_delivery)
values
  ('c1100000-0000-4000-8000-00000000000a', '[Legal 110] Ltd', '[Shop 110]', 'restaurant',
   '[Contact]', '+254700011000', 'shop110@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days', false),
  ('c1100000-0000-4000-8000-00000000000b', '[Legal 110b] Ltd', '[Laundry 110]', 'laundry',
   '[Contact]', '+254700011001', 'laundry110@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days', false);
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1100000-0000-4000-8000-00000000000a', 'Main', '[Address]', true),
       ('c1100000-0000-4000-8000-00000000000b', 'Main', '[Address]', true);
insert into public.catalogue_section (id, merchant_id, name)
values ('c1100000-0000-4000-8000-0000000000b1', 'c1100000-0000-4000-8000-00000000000a', 'Menu'),
       ('c1100000-0000-4000-8000-0000000000b2', 'c1100000-0000-4000-8000-00000000000b', 'Services');
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available)
values ('c1100000-0000-4000-8000-0000000000c1', 'c1100000-0000-4000-8000-0000000000b1',
        'c1100000-0000-4000-8000-00000000000a', 'Chapati', 300, true),
       ('c1100000-0000-4000-8000-0000000000c2', 'c1100000-0000-4000-8000-0000000000b2',
        'c1100000-0000-4000-8000-00000000000b', 'Wash and fold, per kg', 150, true);
insert into public.zone (id, city_id, name, tier, polygon, eta_min, eta_max, active)
values ('c1100000-0000-4000-8000-0000000000e1', (select id from public.city where slug = 'nairobi'),
        '[Zone 110]', 'core',
        'SRID=4326;POLYGON((36.59 -1.41, 36.61 -1.41, 36.61 -1.39, 36.59 -1.39, 36.59 -1.41))'::extensions.geography,
        20, 40, true);

create function pg_temp.order_for(p_merchant uuid, p_item uuid, p_method text) returns jsonb language sql as $$
  select jsonb_build_object('merchant_id', p_merchant, 'payment_method', p_method,
    'items', jsonb_build_array(jsonb_build_object('catalogue_item_id', p_item, 'quantity', 1)),
    'guest_phone', '+254700011099', 'guest_name', '[Buyer]',
    'dropoff_label', '[Fixture address]', 'lat', -1.4000, 'lng', 36.6000)
$$;
create temp table t110 (k text primary key, id uuid);
grant all on t110 to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1100000-0000-4000-8000-000000000020","role":"authenticated"}', true);

-- ── cash on delivery is gone from customer checkout

select throws_ok(
  format($$select public.rpc_order_place_web(%L::jsonb)$$,
    pg_temp.order_for('c1100000-0000-4000-8000-00000000000a', 'c1100000-0000-4000-8000-0000000000c1', 'cash_on_delivery')::text),
  'P0001', '[Shop 110] does not take payment on delivery. Pay online instead.',
  'A customer order cannot be cash on delivery.');

insert into t110 select 'food', (public.rpc_order_place_web(
  pg_temp.order_for('c1100000-0000-4000-8000-00000000000a', 'c1100000-0000-4000-8000-0000000000c1', 'mpesa_stk')) ->> 'order_id')::uuid;
insert into t110 select 'laundry', (public.rpc_order_place_web(
  pg_temp.order_for('c1100000-0000-4000-8000-00000000000b', 'c1100000-0000-4000-8000-0000000000c2', 'mpesa_stk')) ->> 'order_id')::uuid;
select ok((select count(*) from t110 where id is not null) = 2, 'M-Pesa orders are placed as before.');

-- ── laundry collection time

select is((public.rpc_order_set_pickup_time((select id from t110 where k = 'laundry'),
            now() + interval '1 day') ->> 'ok')::boolean,
  true, 'The laundry customer chooses when to be collected.');
select throws_ok(
  format($$select public.rpc_order_set_pickup_time(%L, now() + interval '1 day')$$, (select id from t110 where k = 'food')),
  '23514', 'Only a laundry collects at a time you choose.', 'A food order has no collection time.');
select throws_ok(
  format($$select public.rpc_order_set_pickup_time(%L, now() + interval '5 minutes')$$, (select id from t110 where k = 'laundry')),
  '22023', 'Choose a collection time from 30 minutes to 14 days from now.', 'The time must be ahead, but not far ahead.');

-- ── somebody else's order

select set_config('request.jwt.claims', '{"sub":"c1100000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select throws_ok(
  format($$select public.rpc_order_cancel_mine(%L)$$, (select id from t110 where k = 'food')),
  '42501', 'That order is not on your account.', 'Nobody else can cancel it.');
select throws_ok(
  format($$select public.rpc_order_set_pickup_time(%L, now() + interval '1 day')$$, (select id from t110 where k = 'laundry')),
  '42501', 'That order is not on your account.', 'Or change its collection time.');

-- ── cancelling before paying

select set_config('request.jwt.claims', '{"sub":"c1100000-0000-4000-8000-000000000020","role":"authenticated"}', true);
select is((public.rpc_order_cancel_mine((select id from t110 where k = 'food'), 'Ordered twice') ->> 'ok')::boolean,
  true, 'The customer cancels their own unpaid order.');

reset role;
select set_config('request.jwt.claims', '', true);
select is((select stage::text || '/' || cancel_reason_code from public.order where id = (select id from t110 where k = 'food')),
  'cancelled/customer', 'It is cancelled, marked as the customer''s doing.');
select ok(exists (select 1 from public.order_event where order_id = (select id from t110 where k = 'food') and kind = 'customer_cancelled'),
  'And its timeline says so.');

-- A paid order is reported, not cancelled.
update public.order set payment_status = 'paid' where id = (select id from t110 where k = 'laundry');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1100000-0000-4000-8000-000000000020","role":"authenticated"}', true);
select throws_ok(
  format($$select public.rpc_order_cancel_mine(%L)$$, (select id from t110 where k = 'laundry')),
  '23514', 'This order is paid. Report a problem with it instead and we will refund you.',
  'A paid order cannot be cancelled here.');

-- ── rating

select throws_ok(
  format($$select public.rpc_order_rate(%L, 5)$$, (select id from t110 where k = 'laundry')),
  '23514', 'You can rate an order once it is delivered.', 'Not before it is delivered.');
reset role;
select set_config('request.jwt.claims', '', true);
update public.order set stage = 'delivered', delivered_at = now(), handed_to = 'guest' where id = (select id from t110 where k = 'laundry');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1100000-0000-4000-8000-000000000020","role":"authenticated"}', true);
select is((public.rpc_order_rate((select id from t110 where k = 'laundry'), 4, 'Clean and on time') ->> 'ok')::boolean,
  true, 'The customer rates a delivered order.');
select throws_ok(
  format($$select public.rpc_order_rate(%L, 1)$$, (select id from t110 where k = 'laundry')),
  '23505', 'You have already rated this order. Thank you.', 'Once.');

reset role;
select set_config('request.jwt.claims', '', true);
select is((select stars::int from public.order_rating where order_id = (select id from t110 where k = 'laundry')),
  4, 'The merchant''s reviews read the rating.');

select * from finish();
rollback;
