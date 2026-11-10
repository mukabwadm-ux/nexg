-- Customers book for themselves: opening hours, the times on offer, their own list.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0560000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner@salon.example', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0560000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'guest@salon.example', '', now(), now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, city_id, answers)
values
  ('c0560000-0000-4000-8000-000000000011', 'Day Salon Ltd', 'Day Salon', 'beauty', 'Ann', '+254700005601', 'ann@salon.example',
   (select id from public.city where slug = 'nairobi'), '{}'::jsonb),
  ('c0560000-0000-4000-8000-000000000012', 'Night Club Ltd', 'Night Club', 'beauty', 'Bo', '+254700005602', 'bo@salon.example',
   (select id from public.city where slug = 'nairobi'), '{}'::jsonb);

set local session_replication_role = replica;
update public.merchant set status = 'live', went_live_at = now()
 where id in ('c0560000-0000-4000-8000-000000000011', 'c0560000-0000-4000-8000-000000000012');
set local session_replication_role = origin;

insert into public.merchant_user (merchant_id, user_id, role) values
  ('c0560000-0000-4000-8000-000000000011', 'c0560000-0000-4000-8000-000000000001', 'owner');

-- Day Salon: 09:00-17:00 Monday to Saturday, closed Sunday (Monday is 0).
insert into public.merchant_hours (merchant_id, day_of_week, opens, closes, closed, weekday_convention)
select 'c0560000-0000-4000-8000-000000000011', d,
       case when d = 6 then null else time '09:00' end,
       case when d = 6 then null else time '17:00' end,
       d = 6, 'monday_zero'
from generate_series(0, 6) d;

-- Night Club: 18:00 to 02:00 every night.
insert into public.merchant_hours (merchant_id, day_of_week, opens, closes, weekday_convention)
select 'c0560000-0000-4000-8000-000000000012', d, time '18:00', time '02:00', 'monday_zero'
from generate_series(0, 6) d;

insert into public.bookable_resource (id, merchant_id, model, kind, name, price_cents, duration_minutes, buffer_minutes, instant_confirm, cancel_cutoff_minutes)
values ('c0560000-0000-4000-8000-000000000021', 'c0560000-0000-4000-8000-000000000011', 'exclusive', 'provider', 'Stylist', 150000, 60, 30, true, 120);
insert into public.bookable_resource (merchant_id, name, active)
values ('c0560000-0000-4000-8000-000000000011', 'Retired chair', false);

-- A Wednesday one to two weeks out, its Thursday (closed by override) and its Sunday.
select set_config('t.wed', (current_date + 7 + ((10 - extract(isodow from current_date)::int) % 7))::text, true);
insert into public.merchant_hours_override (merchant_id, date, closed, reason)
values ('c0560000-0000-4000-8000-000000000011', current_setting('t.wed')::date + 1, true, 'Training day');

-- Instants on those days in Nairobi time, kept as t.d<day offset>_<hhmm>.
select count(set_config('t.' || k, (((current_setting('t.wed')::date + o) + t) at time zone 'Africa/Nairobi')::text, true))
from (values
  ('d0_0900', 0, time '09:00'),
  ('d0_1000', 0, time '10:00'),
  ('d0_1600', 0, time '16:00'),
  ('d0_1630', 0, time '16:30'),
  ('d0_1800', 0, time '18:00'),
  ('d0_1900', 0, time '19:00'),
  ('d4_1000', 4, time '10:00'),
  ('d1_0100', 1, time '01:00'),
  ('d1_0200', 1, time '02:00'),
  ('d1_0300', 1, time '03:00')) v(k, o, t);

-- Opening hours, read directly.
select ok(public.fn_booking_open_at('c0560000-0000-4000-8000-000000000012', current_setting('t.d1_0100')::timestamptz),
  'a late opening counts after midnight');
select ok(not public.fn_booking_open_at('c0560000-0000-4000-8000-000000000012', current_setting('t.d1_0300')::timestamptz),
  'and closes when it says');
select ok(public.fn_booking_open_at('c0560000-0000-4000-8000-000000000012', current_setting('t.d1_0200')::timestamptz, true),
  'a booking may end at closing time');
select ok(not public.fn_booking_open_at('c0560000-0000-4000-8000-000000000012', current_setting('t.d1_0200')::timestamptz, false),
  'but not start at it');

-- Anyone can see what is bookable, and the times on offer.
set local role anon;

select is(
  (select count(*)::int from public.bookable_resource where merchant_id = 'c0560000-0000-4000-8000-000000000011' and name = 'Stylist'),
  1,
  'a signed-out visitor can read a live business''s services'
);
select is(
  (select count(*)::int from public.bookable_resource where merchant_id = 'c0560000-0000-4000-8000-000000000011' and not active),
  0,
  'but not its inactive ones'
);

select is(
  (select min(starts_at) from public.rpc_booking_open_times('c0560000-0000-4000-8000-000000000021', current_setting('t.wed')::date)),
  current_setting('t.d0_0900')::timestamptz,
  'the first time on offer is opening time'
);
select is(
  (select max(starts_at) from public.rpc_booking_open_times('c0560000-0000-4000-8000-000000000021', current_setting('t.wed')::date)),
  current_setting('t.d0_1600')::timestamptz,
  'the last time on offer finishes at closing time'
);
select is(
  (select count(*)::int from public.rpc_booking_open_times('c0560000-0000-4000-8000-000000000021', current_setting('t.wed')::date)),
  15,
  'every half hour in between is on offer'
);
select is(
  (select count(*)::int from public.rpc_booking_open_times('c0560000-0000-4000-8000-000000000021', current_setting('t.wed')::date + 4)),
  0,
  'nothing is on offer on a closed day'
);
select is(
  (select count(*)::int from public.rpc_booking_open_times('c0560000-0000-4000-8000-000000000021', current_setting('t.wed')::date + 1)),
  0,
  'nothing is on offer on a day closed by an override'
);

-- The customer books.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0560000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select status::text from public.rpc_booking_create(
     'c0560000-0000-4000-8000-000000000021', current_setting('t.d0_1000')::timestamptz, null, null, 1, 'Wanjiru', '+254700005699')),
  'confirmed',
  'a customer books an instant-confirm time and it is confirmed'
);
select is(
  (select count(*)::int from public.rpc_booking_open_times('c0560000-0000-4000-8000-000000000021', current_setting('t.wed')::date)),
  10,
  'the booked hour and its turnaround buffer leave the times on offer'
);
select throws_ok(
  format($$select public.rpc_booking_create('c0560000-0000-4000-8000-000000000021', %L)$$, current_setting('t.d0_1800')::timestamptz),
  '22023', null,
  'a customer cannot book after closing'
);
select throws_ok(
  format($$select public.rpc_booking_create('c0560000-0000-4000-8000-000000000021', %L)$$, current_setting('t.d0_1630')::timestamptz),
  '22023', null,
  'nor run past closing time'
);
select throws_ok(
  format($$select public.rpc_booking_create('c0560000-0000-4000-8000-000000000021', %L)$$, current_setting('t.d4_1000')::timestamptz),
  '22023', null,
  'nor book on a closed day'
);
select is(
  (select jsonb_array_length(public.rpc_my_bookings())),
  1,
  'the customer sees their booking'
);
select is(
  (select (public.rpc_my_bookings()->0->>'can_cancel')::boolean),
  true,
  'and can still cancel it online'
);

-- The merchant can book a customer in outside hours.
select set_config('request.jwt.claims', '{"sub":"c0560000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  format($$select public.rpc_booking_create('c0560000-0000-4000-8000-000000000021', %L, null, null, 1, 'After hours')$$, current_setting('t.d0_1900')::timestamptz),
  'a merchant may book outside opening hours'
);
select is(
  (select jsonb_array_length(public.rpc_my_bookings())),
  0,
  'a merchant''s own list does not include bookings they made for customers'
);

select * from finish();
rollback;
