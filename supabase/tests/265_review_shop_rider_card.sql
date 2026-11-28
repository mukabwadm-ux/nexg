-- Review shop deliveries show a rider card and an arrival time (20270343000100):
-- the pretend rider comes with a made-up name and plate, marked as review-shop
-- data; a real shop's order has neither; picking up sets the arrival time.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, is_anonymous, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'd2650000-0000-4000-8000-000000000001', 'authenticated',
        'authenticated', 'guest265@example.test', '', now(), false, now(), now());
insert into public.guest (id, phone, name, user_id)
values ('d2657000-0000-4000-8000-000000000001', '+254700026501', '[Guest 265]',
        'd2650000-0000-4000-8000-000000000001');

insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel, dropoff_label,
  dropoff_point, stage, payment_method, payment_status, subtotal_cents, delivery_fee_cents, service_fee_cents,
  total_cents, currency, picked_up_at)
select ('d2657000-0000-4000-8000-00000000001' || x.n)::uuid, 'PS265-' || x.n,
       'd2657000-0000-4000-8000-000000000001', x.merchant_id, x.branch_id, x.city_id, 'web', '[Fixture address]',
       extensions.st_setsrid(extensions.st_makepoint(36.80, -1.26), 4326)::extensions.geography,
       'picked_up', 'card', 'paid', 60000, 0, 0, 60000, 'KES', now() - interval '2 minutes'
  from (
    select row_number() over (order by m.id) as n, m.id as merchant_id, b.id as branch_id, m.city_id
      from public.merchant m
      join lateral (select id from public.merchant_branch where merchant_id = m.id order by id limit 1) b on true
     where m.city_id is not null
     order by m.id limit 2) x;
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel, dropoff_label,
  dropoff_point, stage, payment_method, payment_status, subtotal_cents, delivery_fee_cents, service_fee_cents,
  total_cents, currency, placed_at)
select 'd2657000-0000-4000-8000-000000000019', 'PS265-9', guest_id, merchant_id, branch_id, city_id, channel,
       dropoff_label, dropoff_point, 'ready', payment_method, payment_status, subtotal_cents, delivery_fee_cents,
       service_fee_cents, total_cents, currency, now() - interval '1 hour'
  from public.order where reference = 'PS265-1';
update public.merchant_branch set latitude = -1.28, longitude = 36.82
 where id in (select branch_id from public.order where reference in ('PS265-1', 'PS265-2'));
update public.merchant set accepts_test_payments = (id = (select merchant_id from public.order where reference = 'PS265-1'))
 where id in (select merchant_id from public.order where reference in ('PS265-1', 'PS265-2'));

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', 'd2650000-0000-4000-8000-000000000001', 'role', 'authenticated', 'is_anonymous', false)::text, true);

select is(public.rpc_my_order_map('d2657000-0000-4000-8000-000000000011', '2') -> 'rider' ->> 'role', 'NexG Rider',
  'A review shop order on the road has a rider for the card.');
select ok(
  length(public.rpc_my_order_map('d2657000-0000-4000-8000-000000000011', '2') -> 'rider' ->> 'name') > 3
  and (public.rpc_my_order_map('d2657000-0000-4000-8000-000000000011', '2') -> 'rider' ->> 'plate') ~ '^KM[A-Z] [0-9]{3}[A-Z]$',
  'With a name and a number plate.');
select is(public.rpc_my_order_map('d2657000-0000-4000-8000-000000000011', '2') -> 'rider' -> 'reviewShop', 'true'::jsonb,
  'Marked as review-shop data.');
select is(
  public.rpc_my_order_map('d2657000-0000-4000-8000-000000000011', '2') -> 'rider',
  public.rpc_my_order_map('d2657000-0000-4000-8000-000000000011', '2') -> 'rider',
  'The same rider every time it is read.');
select is(public.rpc_my_order_map('d2657000-0000-4000-8000-000000000012', '2') -> 'rider', null,
  'A real shop''s order has no pretend rider.');
reset role;


select public.cron_review_shop_orders();
select ok(
  (select stage = 'picked_up' and eta_at between now() + interval '3 minutes' and now() + interval '5 minutes'
     from public.order where reference = 'PS265-9'),
  'Picking up a review shop order sets when it arrives.');

select is(
  (select count(*)::int from public.fn_wiring_check() where severity = 'critical'),
  0, 'No critical wiring findings.');

select * from finish();
rollback;
