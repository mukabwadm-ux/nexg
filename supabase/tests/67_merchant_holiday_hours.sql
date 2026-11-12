-- Merchants say whether they open on public holidays.
--
-- `rpc_merchant_holidays` lists the holidays on the merchant's calendar for
-- the next twelve months with their answer, and `rpc_merchant_holiday_set`
-- records open or closed. A closed holiday reaches `fn_merchant_effective_hours`,
-- and through it the guest pages and `fn_booking_open_at`. A date override
-- still beats it, an open answer keeps the usual hours, and an answer stays
-- with its holiday when the date is corrected (Eid moves with the moon).
--
-- The merchant lives in a test city with its own holidays, dated from today,
-- so neither the seeded Kenyan calendar nor the day the suite runs can move
-- the counts.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ------------------------------------------------------------------ fixtures

insert into public.city (id, slug, name, country, currency, timezone, status, sort)
values ('64000000-0000-0000-0000-0000000000c1', 'holidayville', 'Holidayville', 'Testland',
        'KES', 'Africa/Nairobi', 'live', 999);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '64000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'holiday.owner@shop.example', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '64000000-0000-0000-0000-000000000009',
   'authenticated', 'authenticated', 'stranger@elsewhere.example', '', now(), now(), now());

insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id
)
values (
  '64000000-0000-0000-0000-000000000002',
  'Sikukuu Limited', 'Sikukuu', 'restaurant', 'Njeri Mwangi',
  '+254700000064', 'holiday.owner@shop.example',
  '64000000-0000-0000-0000-0000000000c1'
);

insert into public.merchant_user (merchant_id, user_id, role)
values ('64000000-0000-0000-0000-000000000002', '64000000-0000-0000-0000-000000000001', 'owner');

/* Open 09:00 to 17:00 every day, untagged (Sunday = 0). */
insert into public.merchant_hours (merchant_id, day_of_week, opens, closes)
select '64000000-0000-0000-0000-000000000002', d, '09:00', '17:00'
from generate_series(0, 6) d;

insert into public.holiday_calendar (id, city_id, country, date, label, source, estimated)
values
  ('64000000-0000-0000-0000-0000000000a1', null, 'Testland', current_date - 5, 'Gone Day', 'manual', false),
  ('64000000-0000-0000-0000-0000000000a2', null, 'Testland', current_date + 10, 'Founders Day', 'manual', false),
  ('64000000-0000-0000-0000-0000000000a3', null, 'Testland', current_date + 20, 'Harvest Day', 'manual', true),
  ('64000000-0000-0000-0000-0000000000a4', '64000000-0000-0000-0000-0000000000c1', null,
   current_date + 30, 'Holidayville Day', 'manual', false),
  ('64000000-0000-0000-0000-0000000000a5', null, 'Elsewhere', current_date + 15, 'Not Ours Day', 'manual', false),
  ('64000000-0000-0000-0000-0000000000a6', null, 'Testland', current_date + 400, 'Far Day', 'manual', false);

-- ------------------------------------------------------- the owner answers

set local role authenticated;
set local request.jwt.claims = '{"sub":"64000000-0000-0000-0000-000000000001","role":"authenticated"}';

select results_eq(
  $$select label, estimated, closed from public.rpc_merchant_holidays('64000000-0000-0000-0000-000000000002')$$,
  $$values ('Founders Day'::text, false, null::boolean),
           ('Harvest Day', true, null),
           ('Holidayville Day', false, null)$$,
  'the owner sees the next twelve months of their own calendar, none answered yet'
);

select lives_ok(
  $$select public.rpc_merchant_holiday_set('64000000-0000-0000-0000-000000000002',
      '64000000-0000-0000-0000-0000000000a2', true)$$,
  'the owner closes for Founders Day'
);

select lives_ok(
  $$select public.rpc_merchant_holiday_set('64000000-0000-0000-0000-000000000002',
      '64000000-0000-0000-0000-0000000000a3', true)$$,
  'the owner closes for Harvest Day'
);

select lives_ok(
  $$select public.rpc_merchant_holiday_set('64000000-0000-0000-0000-000000000002',
      '64000000-0000-0000-0000-0000000000a4', true)$$,
  'the owner closes for the city''s own holiday'
);

select throws_ok(
  $$select public.rpc_merchant_holiday_set('64000000-0000-0000-0000-000000000002',
      '64000000-0000-0000-0000-0000000000a1', true)$$,
  '22023', 'That holiday has passed.',
  'a holiday that has passed cannot be answered'
);

select throws_ok(
  $$select public.rpc_merchant_holiday_set('64000000-0000-0000-0000-000000000002',
      '64000000-0000-0000-0000-0000000000a5', true)$$,
  '22023', 'That holiday is not on your calendar.',
  'another country''s holiday cannot be answered'
);

select results_eq(
  $$select label, closed from public.rpc_merchant_holidays('64000000-0000-0000-0000-000000000002')$$,
  $$values ('Founders Day'::text, true), ('Harvest Day', true), ('Holidayville Day', true)$$,
  'the answers come back with the calendar'
);

-- ------------------------------------------------ what guests and bookings see

reset role;

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '64000000-0000-0000-0000-000000000002', null, current_date + 10)$$,
  $$values (null::time, null::time, true, 'holiday'::text)$$,
  'a holiday the merchant closes for is a closed day'
);

select ok(
  not public.fn_booking_open_at('64000000-0000-0000-0000-000000000002',
    ((current_date + 10) + time '12:00') at time zone 'Africa/Nairobi'),
  'and a booking at noon that day is refused'
);

insert into public.merchant_hours_override (merchant_id, date, opens, closes, closed, reason, source)
values ('64000000-0000-0000-0000-000000000002', current_date + 20, '10:00', '14:00', false,
        'Harvest lunch', 'merchant');

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '64000000-0000-0000-0000-000000000002', null, current_date + 20)$$,
  $$values ('10:00'::time, '14:00'::time, false, 'merchant override'::text)$$,
  'a date override for the day still wins over the holiday answer'
);

/* The date is corrected, as an Eid date is once the moon is sighted. */
update public.holiday_calendar set date = current_date + 31
where id = '64000000-0000-0000-0000-0000000000a4';

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '64000000-0000-0000-0000-000000000002', null, current_date + 31)$$,
  $$values (null::time, null::time, true, 'holiday'::text)$$,
  'the answer moves with its holiday to the corrected date'
);

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '64000000-0000-0000-0000-000000000002', null, current_date + 30)$$,
  $$values ('09:00'::time, '17:00'::time, false, 'weekly'::text)$$,
  'and leaves the old date to the usual hours'
);

-- --------------------------------------------------- open keeps the week

set local role authenticated;
set local request.jwt.claims = '{"sub":"64000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_holiday_set('64000000-0000-0000-0000-000000000002',
      '64000000-0000-0000-0000-0000000000a2', false)$$,
  'the owner changes their mind and opens on Founders Day'
);

reset role;

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '64000000-0000-0000-0000-000000000002', null, current_date + 10)$$,
  $$values ('09:00'::time, '17:00'::time, false, 'weekly'::text)$$,
  'open keeps the usual hours for that weekday'
);

-- ------------------------------------------------------- nobody else

set local role authenticated;
set local request.jwt.claims = '{"sub":"64000000-0000-0000-0000-000000000009","role":"authenticated"}';

select throws_ok(
  $$select public.rpc_merchant_holiday_set('64000000-0000-0000-0000-000000000002',
      '64000000-0000-0000-0000-0000000000a2', true)$$,
  '42501', 'Not your business.',
  'a stranger cannot answer for the business'
);

select throws_ok(
  $$select * from public.rpc_merchant_holidays('64000000-0000-0000-0000-000000000002')$$,
  '42501', 'Not your business.',
  'a stranger cannot read its answers through the RPC'
);

select is(
  (select count(*)::int from public.merchant_holiday_hours),
  0,
  'or straight from the table'
);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$select * from public.rpc_merchant_holidays('64000000-0000-0000-0000-000000000002')$$,
  '42501', null,
  'the anonymous key cannot call the RPC at all'
);

reset role;

-- ----------------------------------------------------------- the record

select is(
  (select count(*)::int from audit.audit_event
    where action = 'merchant.holiday_hours_set'
      and target_id = '64000000-0000-0000-0000-000000000002'),
  4,
  'every answer is in the audit log'
);

select is(
  (select count(*)::int from public.holiday_calendar
    where country = 'Kenya' and source = 'national'
      and date between date '2026-12-01' and date '2027-12-31'),
  18,
  'Kenya''s public holidays are on the calendar to the end of 2027'
);

select * from finish();
rollback;
