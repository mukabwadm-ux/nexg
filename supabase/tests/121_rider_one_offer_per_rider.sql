-- A rider where two delivery zones overlap is listed once, in the smaller
-- zone, and gets one offer per order; declining it leaves none open.

begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1190000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', null, null, true, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1190000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'shop119@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1190000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'rider119@example.test', now(), false, now(), now());

insert into public.guest (id, user_id, phone, name)
values ('c1190000-0000-4000-8000-000000000011', 'c1190000-0000-4000-8000-000000000001',
        '+254700011901', '[Guest]');

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1190000-0000-4000-8000-00000000000a', '[Legal 119] Ltd', '[Shop 119]', 'restaurant',
        '[Contact]', '+254700011900', 'shop119@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1190000-0000-4000-8000-00000000000a', 'c1190000-0000-4000-8000-000000000002', 'owner');
insert into public.merchant_branch (id, merchant_id, name, address_text, is_primary, latitude, longitude)
values ('c1190000-0000-4000-8000-0000000000b0', 'c1190000-0000-4000-8000-00000000000a',
        'Main', '[Address 119]', true, -1.2921, 36.8219);

-- A wide zone and a small one inside it, both around the rider.
insert into public.zone (id, city_id, name, tier, polygon, eta_min, eta_max, active)
values
  ('c1190000-0000-4000-8000-0000000000e1', (select id from public.city where slug = 'nairobi'),
   '[Wide 119]', 'core',
   'SRID=4326;POLYGON((36.70 -1.40, 36.95 -1.40, 36.95 -1.20, 36.70 -1.20, 36.70 -1.40))'::extensions.geography,
   20, 40, true),
  ('c1190000-0000-4000-8000-0000000000e2', (select id from public.city where slug = 'nairobi'),
   '[Small 119]', 'core',
   'SRID=4326;POLYGON((36.818 -1.295, 36.822 -1.295, 36.822 -1.291, 36.818 -1.291, 36.818 -1.295))'::extensions.geography,
   20, 40, true);

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
                          status, presence, activated_at, last_location, last_location_at)
values ('c1190000-0000-4000-8000-000000000031', 'c1190000-0000-4000-8000-000000000003',
        '[Rider]', '[119]', '+254700011902', (select id from public.city where slug = 'nairobi'),
        'motorbike', '[PLATE119]', 'active', 'online', now(),
        extensions.st_setsrid(extensions.st_makepoint(36.8200, -1.2930), 4326)::extensions.geography,
        now());

insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, dropoff_point, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
values
  ('c1190000-0000-4000-8000-0000000000f1', 'ONE-OFFER-119', 'c1190000-0000-4000-8000-000000000011',
   'c1190000-0000-4000-8000-00000000000a', 'c1190000-0000-4000-8000-0000000000b0',
   (select id from public.city where slug = 'nairobi'), 'web', '[Guest estate]',
   extensions.st_setsrid(extensions.st_makepoint(36.80, -1.30), 4326)::extensions.geography,
   'placed', 'mpesa_stk', 'paid', 50000, 10000, 2500, 62500, 'KES');
insert into public.order_item (order_id, name, quantity, unit_price_cents, line_total_cents)
values ('c1190000-0000-4000-8000-0000000000f1', '[Dish]', 1, 50000, 50000);

create function pg_temp.as_user(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true)
$$;

select is((select count(*)::int from dispatch.fn_riders_now((select id from public.city where slug = 'nairobi'))
            where rider_id = 'c1190000-0000-4000-8000-000000000031'),
  1, 'The rider is listed once, though two zones cover them.');
select is((select zone_name from dispatch.fn_riders_now((select id from public.city where slug = 'nairobi'))
            where rider_id = 'c1190000-0000-4000-8000-000000000031'),
  '[Small 119]', 'In the smaller zone.');

set local role authenticated;
select pg_temp.as_user('c1190000-0000-4000-8000-000000000002');
select public.rpc_merchant_order_step('c1190000-0000-4000-8000-0000000000f1', 'start');
select public.rpc_merchant_order_step('c1190000-0000-4000-8000-0000000000f1', 'ready');

select pg_temp.as_user('c1190000-0000-4000-8000-000000000003');
select is((select count(*)::int from jsonb_array_elements(public.rpc_my_rider_offers() -> 'offers') o
            where o ->> 'orderId' = 'c1190000-0000-4000-8000-0000000000f1'),
  1, 'The shop''s "ready" reaches the rider with one offer.');
select set_config('t.offer', (
  select o ->> 'offerId' from jsonb_array_elements(public.rpc_my_rider_offers() -> 'offers') o
   where o ->> 'orderId' = 'c1190000-0000-4000-8000-0000000000f1'), true);
select is((public.rpc_dispatch_offer_respond(current_setting('t.offer')::uuid, false, 'too_far') ->> 'ok')::boolean,
  true, 'The rider declines it.');
select is((select count(*)::int from jsonb_array_elements(public.rpc_my_rider_offers() -> 'offers') o
            where o ->> 'orderId' = 'c1190000-0000-4000-8000-0000000000f1'),
  0, 'And no offer for that order is left open.');
reset role;

select * from finish();
rollback;
