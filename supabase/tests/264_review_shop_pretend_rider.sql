-- A pretend rider on the map for review shop orders (20270341000100): while a
-- review shop order is on the road, the customer's map has a moving courier
-- between the shop and the address; a real shop's order has none.

begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, is_anonymous, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'd2640000-0000-4000-8000-000000000001', 'authenticated',
        'authenticated', 'guest264@example.test', '', now(), false, now(), now());
insert into public.guest (id, phone, name, user_id)
values ('d2647000-0000-4000-8000-000000000001', '+254700026401', '[Guest 264]',
        'd2640000-0000-4000-8000-000000000001');

insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel, dropoff_label,
  dropoff_point, stage, payment_method, payment_status, subtotal_cents, delivery_fee_cents, service_fee_cents,
  total_cents, currency, picked_up_at)
select ('d2647000-0000-4000-8000-00000000001' || x.n)::uuid, 'PS264-' || x.n,
       'd2647000-0000-4000-8000-000000000001', x.merchant_id, x.branch_id, x.city_id, 'web', '[Fixture address]',
       extensions.st_setsrid(extensions.st_makepoint(36.80, -1.26), 4326)::extensions.geography,
       'picked_up', 'card', 'paid', 60000, 0, 0, 60000, 'KES', now() - interval '2 minutes'
  from (
    select row_number() over (order by m.id) as n, m.id as merchant_id, b.id as branch_id, m.city_id
      from public.merchant m
      join lateral (select id from public.merchant_branch where merchant_id = m.id order by id limit 1) b on true
     where m.city_id is not null
     order by m.id limit 2) x;
update public.merchant_branch set latitude = -1.28, longitude = 36.82
 where id in (select branch_id from public.order where reference in ('PS264-1', 'PS264-2'));
update public.merchant set accepts_test_payments = (id = (select merchant_id from public.order where reference = 'PS264-1'))
 where id in (select merchant_id from public.order where reference in ('PS264-1', 'PS264-2'));

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'd2640000-0000-4000-8000-000000000001', 'role', 'authenticated', 'is_anonymous', false)::text, true);

select is(public.rpc_my_order_map('d2647000-0000-4000-8000-000000000011', '2') ->> 'status', 'live',
  'A review shop order on the road has a rider on the map.');
select ok(
  ((public.rpc_my_order_map('d2647000-0000-4000-8000-000000000011', '2') -> 'courier' ->> 'latitude')::double precision
     between -1.28 and -1.26)
  and ((public.rpc_my_order_map('d2647000-0000-4000-8000-000000000011', '2') -> 'courier' ->> 'longitude')::double precision
     between 36.80 and 36.82),
  'The rider is between the shop and the address.');
select ok(
  (public.rpc_my_order_map('d2647000-0000-4000-8000-000000000011', '2') -> 'courier' ->> 'expiresAt')::timestamptz > now(),
  'And current.');
select is(public.rpc_my_order_map('d2647000-0000-4000-8000-000000000012', '2') -> 'courier', 'null'::jsonb,
  'A real shop''s order has no pretend rider.');
reset role;

select is(
  (select count(*)::int from public.fn_wiring_check() where severity = 'critical'),
  0, 'No critical wiring findings.');

select * from finish();
rollback;
