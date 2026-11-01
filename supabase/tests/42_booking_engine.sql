-- Booking engine: overbooking protection, rules and isolation.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

set local session_replication_role = replica;
delete from public.booking;
delete from public.booking_slot;
delete from public.bookable_resource;
delete from public.merchant_user;
delete from public.merchant;
set local session_replication_role = origin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'owner@rent.example', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'guest@rent.example', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'rival@rent.example', '', now(), now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, city_id, answers)
values
  ('cccccccc-0000-0000-0000-000000000001', 'Coast Cars Ltd', 'Coast Cars', 'vehicle_rentals', 'Ann', '+254700000001', 'ann@rent.example',
   (select id from public.city where slug = 'nairobi'), '{}'::jsonb),
  ('cccccccc-0000-0000-0000-000000000002', 'Rival Cars Ltd', 'Rival Cars', 'vehicle_rentals', 'Rob', '+254700000002', 'rob@rent.example',
   (select id from public.city where slug = 'nairobi'), '{}'::jsonb);

set local session_replication_role = replica;
update public.merchant set status = 'live', went_live_at = now() where id = 'cccccccc-0000-0000-0000-000000000001';
set local session_replication_role = origin;

insert into public.merchant_user (merchant_id, user_id, role) values
  ('cccccccc-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'owner'),
  ('cccccccc-0000-0000-0000-000000000002', '77777777-7777-7777-7777-777777777777', 'owner');

insert into public.bookable_resource (id, merchant_id, model, kind, name, price_cents, price_unit, buffer_minutes, min_notice_minutes, cancel_cutoff_minutes)
values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'exclusive', 'vehicle', 'Toyota Axio', 500000, 'day', 60, 120, 240);
insert into public.bookable_resource (id, merchant_id, model, kind, name, price_cents, price_unit, capacity)
values
  ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'capacity', 'session', 'Dhow cruise', 200000, 'seat', 4);
insert into public.bookable_resource (id, merchant_id, model, name, quote_required)
values
  ('dddddddd-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000001', 'exclusive', 'Wedding car', true);
insert into public.booking_slot (id, resource_id, starts_at, ends_at, cutoff_minutes)
values ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', now() + interval '3 days', now() + interval '3 days 2 hours', 60);

-- Owner of merchant 1 (merchant side).
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select is(
  (select status::text from public.rpc_booking_block(
     'dddddddd-0000-0000-0000-000000000001', now() + interval '10 days', now() + interval '11 days', 'service')),
  'blocked',
  'a merchant can block a car for maintenance'
);

select is(
  (select total_cents from public.rpc_booking_create(
     'dddddddd-0000-0000-0000-000000000001', now() + interval '20 days', now() + interval '22 days', null, 1, 'Walk-in')),
  1000000::bigint,
  'a two-day hire is priced per day'
);

select throws_ok(
  $$select public.rpc_booking_create('dddddddd-0000-0000-0000-000000000001', now() + interval '10 days 6 hours', now() + interval '10 days 8 hours')$$,
  '23P01', null,
  'a booking cannot overlap a maintenance block'
);

select throws_ok(
  $$select public.rpc_booking_create('dddddddd-0000-0000-0000-000000000001', now() + interval '22 days 30 minutes', now() + interval '23 days')$$,
  '23P01', null,
  'the turnaround buffer after a booking is held too'
);

select lives_ok(
  $$select public.rpc_booking_create('dddddddd-0000-0000-0000-000000000001', now() + interval '22 days 90 minutes', now() + interval '23 days')$$,
  'a booking after the buffer is accepted'
);

select is(
  (select count(*)::int from public.rpc_booking_busy('dddddddd-0000-0000-0000-000000000001', now(), now() + interval '60 days')),
  3,
  'busy ranges list blocks and bookings'
);

-- Guest.
select set_config('t.block_id', (select id::text from public.booking where notes = 'service'), true);
set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

select throws_ok(
  $$select public.rpc_booking_create('dddddddd-0000-0000-0000-000000000001', now() + interval '30 minutes', now() + interval '2 days')$$,
  '22023', null,
  'minimum notice is enforced for guests'
);

select is(
  (select status::text from public.rpc_booking_create(
     'dddddddd-0000-0000-0000-000000000001', now() + interval '30 days', now() + interval '31 days')),
  'pending',
  'a guest booking waits for the merchant to confirm'
);

select is(
  (select total_cents from public.rpc_booking_create(
     'dddddddd-0000-0000-0000-000000000003', now() + interval '40 days', now() + interval '40 days 3 hours')),
  null::bigint,
  'a quote-required offer has no price and stays pending'
);

select is(
  (select status::text from public.rpc_booking_create('dddddddd-0000-0000-0000-000000000002', null, null, 'eeeeeeee-0000-0000-0000-000000000001', 3)),
  'pending',
  'three seats on a four-seat session are accepted'
);

select throws_ok(
  $$select public.rpc_booking_create('dddddddd-0000-0000-0000-000000000002', null, null, 'eeeeeeee-0000-0000-0000-000000000001', 2)$$,
  '23P01', null,
  'a session cannot be oversold'
);

select is(
  (select seats_left from public.rpc_booking_slots('dddddddd-0000-0000-0000-000000000002', now(), now() + interval '10 days')),
  1,
  'one seat is left'
);

select is(
  (select count(*)::int from public.booking),
  3,
  'a guest sees only their own bookings'
);

select throws_ok(
  $$select public.rpc_booking_set_status(current_setting('t.block_id')::uuid, 'cancelled')$$,
  '42501', null,
  'a guest cannot touch a merchant block'
);

-- Rival merchant.
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';

select is(
  (select count(*)::int from public.booking),
  0,
  'another merchant sees none of these bookings'
);

-- Owner confirms then cancels.
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select is(
  (select status::text from public.rpc_booking_set_status(
     (select id from public.booking where guest_user_id = '66666666-6666-6666-6666-666666666666' and resource_id = 'dddddddd-0000-0000-0000-000000000001'),
     'confirmed')),
  'confirmed',
  'the merchant confirms a pending booking'
);

select throws_ok(
  $$select public.rpc_booking_set_status((select id from public.booking where guest_user_id = '66666666-6666-6666-6666-666666666666' and resource_id = 'dddddddd-0000-0000-0000-000000000001'), 'pending')$$,
  '22023', null,
  'a confirmed booking cannot go back to pending'
);

select * from finish();
rollback;
