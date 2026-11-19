-- Placing an order twice by accident: the same client_request_id returns the
-- first order; a new id places a new one; another customer's id is their own.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to anon, authenticated;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1170000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'owner117@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1170000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'outsider117@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1170000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', null, null, true, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1170000-0000-4000-8000-00000000000a', '[Legal 117] Ltd', '[Shoes 117]', 'restaurant',
        '[Contact]', '+254700011700', 'shoes117@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1170000-0000-4000-8000-00000000000a', 'c1170000-0000-4000-8000-000000000001', 'owner');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1170000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.zone (id, city_id, name, tier, polygon, eta_min, eta_max, active)
values ('c1170000-0000-4000-8000-0000000000e1', (select id from public.city where slug = 'nairobi'),
        '[Zone 117]', 'core',
        'SRID=4326;POLYGON((36.59 -1.41, 36.61 -1.41, 36.61 -1.39, 36.59 -1.39, 36.59 -1.41))'::extensions.geography,
        20, 40, true);

insert into public.catalogue_section (id, merchant_id, name)
values ('c1170000-0000-4000-8000-0000000000c1', 'c1170000-0000-4000-8000-00000000000a', '[Shoes]');
insert into public.catalogue_item (id, merchant_id, section_id, name, price_kes, available, sort) values
  ('c1170000-0000-4000-8000-0000000000d1', 'c1170000-0000-4000-8000-00000000000a',
   'c1170000-0000-4000-8000-0000000000c1', '[Trainer]', 3000, true, 1),
  ('c1170000-0000-4000-8000-0000000000d2', 'c1170000-0000-4000-8000-00000000000a',
   'c1170000-0000-4000-8000-0000000000c1', '[Laces]', 200, true, 2);


create function pg_temp.basket(p_request text) returns jsonb language sql as $f$
  select jsonb_strip_nulls(jsonb_build_object('merchant_id', 'c1170000-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk', 'lat', -1.4000, 'lng', 36.6000,
    'guest_phone', '+254700011799', 'guest_name', '[Buyer]', 'dropoff_label', '[Home]',
    'client_request_id', p_request,
    'items', jsonb_build_array(jsonb_build_object(
      'catalogue_item_id', 'c1170000-0000-4000-8000-0000000000d2', 'quantity', 1))))
$f$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1170000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);

insert into t select 'first', public.rpc_order_place_web(pg_temp.basket('aaaaaaaa-0000-4000-8000-000000000117'))::text;
insert into t select 'again', public.rpc_order_place_web(pg_temp.basket('aaaaaaaa-0000-4000-8000-000000000117'))::text;
select is((select v::jsonb ->> 'order_id' from t where k = 'again'), (select v::jsonb ->> 'order_id' from t where k = 'first'),
  'Sending the same request again returns the first order.');
select is((select (v::jsonb ->> 'repeat')::boolean from t where k = 'again'), true, 'And says it is a repeat.');
select is((select (v::jsonb ->> 'repeat')::boolean from t where k = 'first'), false, 'The first one is not.');
reset role;
select is((select count(*)::int from public.order where merchant_id = 'c1170000-0000-4000-8000-00000000000a'), 1,
  'Only one order exists.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1170000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
select isnt(public.rpc_order_place_web(pg_temp.basket('bbbbbbbb-0000-4000-8000-000000000117')) ->> 'order_id',
  (select v::jsonb ->> 'order_id' from t where k = 'first'), 'A new request id places a new order.');
select ok((public.rpc_order_place_web(pg_temp.basket(null)) ->> 'order_id') is not null,
  'Without an id, ordering works as before.');
select throws_ok($$select public.rpc_order_place_web(pg_temp.basket('not-a-uuid'))$$, '22023', null,
  'A malformed request id is refused.');
reset role;

select * from finish();
rollback;
