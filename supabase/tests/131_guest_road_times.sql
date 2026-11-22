-- A guest (temporary session) gets road times for one complete Explore plan;
-- more opens once they sign in or have paid for an order.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to anon, authenticated;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1310000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'account131@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1310000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', null, null, true, now(), now());

-- ── a guest

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1310000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
select is(public.rpc_maps_route_budget('plan-1') ->> 'allowed', 'true', 'A guest routes their first plan.');
select is(public.rpc_maps_route_budget('plan-1') ->> 'allowed', 'true', 'And keeps routing within it.');
select is(public.rpc_maps_route_budget('plan-2') ->> 'reason', 'sign_in_required',
  'A second plan asks the guest to sign in.');
reset role;

-- ── after paying for an order

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1310000-0000-4000-8000-00000000000a', '[Legal 131] Ltd', '[Cafe 131]', 'restaurant',
        '[Contact]', '+254700013100', 'cafe131@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1310000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.zone (id, city_id, name, tier, polygon, eta_min, eta_max, active)
values ('c1310000-0000-4000-8000-0000000000e1', (select id from public.city where slug = 'nairobi'),
        '[Zone 131]', 'core',
        'SRID=4326;POLYGON((36.59 -1.41, 36.61 -1.41, 36.61 -1.39, 36.59 -1.39, 36.59 -1.41))'::extensions.geography,
        20, 40, true);
insert into public.catalogue_section (id, merchant_id, name)
values ('c1310000-0000-4000-8000-0000000000c1', 'c1310000-0000-4000-8000-00000000000a', '[Coffee]');
insert into public.catalogue_item (id, merchant_id, section_id, name, price_kes, available, sort) values
  ('c1310000-0000-4000-8000-0000000000d1', 'c1310000-0000-4000-8000-00000000000a',
   'c1310000-0000-4000-8000-0000000000c1', '[Latte]', 400, true, 1);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1310000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
insert into t select 'order', public.rpc_order_place_web(jsonb_build_object(
  'merchant_id', 'c1310000-0000-4000-8000-00000000000a', 'payment_method', 'mpesa_stk',
  'lat', -1.4000, 'lng', 36.6000, 'guest_phone', '+254700013199', 'guest_name', '[Guest]',
  'dropoff_label', '[Home]',
  'items', jsonb_build_array(jsonb_build_object(
    'catalogue_item_id', 'c1310000-0000-4000-8000-0000000000d1', 'quantity', 1)))) ->> 'order_id';
select is(public.rpc_maps_route_budget('plan-2') ->> 'reason', 'sign_in_required',
  'An unpaid order does not open more plans.');
reset role;

update public.order set payment_status = 'paid' where id = (select v::uuid from t where k = 'order');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1310000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
select is(public.rpc_maps_route_budget('plan-2') ->> 'allowed', 'true', 'A paid order opens more plans.');
reset role;

-- ── an account, and nobody

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1310000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.rpc_maps_route_budget('plan-a') ->> 'allowed', 'true', 'An account routes...');
select is(public.rpc_maps_route_budget('plan-b') ->> 'allowed', 'true', '...any number of plans, within the usual limits.');
select set_config('request.jwt.claims',
  '{"sub":"c1310000-0000-4000-8000-0000000000ff","role":"authenticated"}', true);
select throws_ok($$select public.rpc_maps_route_budget('plan-1')$$, '42501', null,
  'A token for a user that does not exist is refused.');
reset role;

select * from finish();
rollback;
