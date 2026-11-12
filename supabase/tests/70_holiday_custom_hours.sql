-- Holidays with custom hours, and a merchant's own days.
--
-- `rpc_merchant_holiday_set` takes an opening and closing time as well as
-- open or closed; `fn_merchant_effective_hours` then answers with those
-- hours on that holiday. A merchant's own holiday is a date override, and
-- `rpc_merchant_hours_override_clear` lets the merchant take one off again.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- ------------------------------------------------------------------ fixtures

insert into public.city (id, slug, name, country, currency, timezone, status, sort)
values ('70000000-0000-0000-0000-0000000000c1', 'customville', 'Customville', 'Customland',
        'KES', 'Africa/Nairobi', 'live', 999);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'custom.owner@shop.example', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000009',
   'authenticated', 'authenticated', 'custom.stranger@elsewhere.example', '', now(), now(), now());

insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id
)
values (
  '70000000-0000-0000-0000-000000000002',
  'Saa Maalum Limited', 'Saa Maalum', 'restaurant', 'Achieng Otieno',
  '+254700000070', 'custom.owner@shop.example',
  '70000000-0000-0000-0000-0000000000c1'
);

insert into public.merchant_user (merchant_id, user_id, role)
values ('70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'owner');

/* Open 09:00 to 17:00 every day, untagged (Sunday = 0). */
insert into public.merchant_hours (merchant_id, day_of_week, opens, closes)
select '70000000-0000-0000-0000-000000000002', d, '09:00', '17:00'
from generate_series(0, 6) d;

insert into public.holiday_calendar (id, city_id, country, date, label, source, estimated)
values
  ('70000000-0000-0000-0000-0000000000a1', null, 'Customland', current_date + 10, 'Short Day', 'manual', false);

-- ----------------------------------------------------------- custom hours

set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_holiday_set('70000000-0000-0000-0000-000000000002',
      '70000000-0000-0000-0000-0000000000a1', false, '11:00', '15:00')$$,
  'the owner opens on Short Day with custom hours'
);

select results_eq(
  $$select closed, opens, closes from public.rpc_merchant_holidays('70000000-0000-0000-0000-000000000002')$$,
  $$values (false, '11:00'::time, '15:00'::time)$$,
  'the custom hours come back with the calendar'
);

select throws_ok(
  $$select public.rpc_merchant_holiday_set('70000000-0000-0000-0000-000000000002',
      '70000000-0000-0000-0000-0000000000a1', false, '11:00', null)$$,
  '22023', 'Give both an opening and a closing time.',
  'custom hours need both times'
);

select throws_ok(
  $$select public.rpc_merchant_holiday_set('70000000-0000-0000-0000-000000000002',
      '70000000-0000-0000-0000-0000000000a1', false, '11:00', '11:00')$$,
  '22023', 'Opening and closing times cannot be the same.',
  'and two different times'
);

reset role;

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '70000000-0000-0000-0000-000000000002', null, current_date + 10)$$,
  $$values ('11:00'::time, '15:00'::time, false, 'holiday'::text)$$,
  'guests see the custom hours that holiday'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_holiday_set('70000000-0000-0000-0000-000000000002',
      '70000000-0000-0000-0000-0000000000a1', true, '11:00', '15:00')$$,
  'the owner switches to closed'
);

select results_eq(
  $$select closed, opens, closes from public.rpc_merchant_holidays('70000000-0000-0000-0000-000000000002')$$,
  $$values (true, null::time, null::time)$$,
  'closed keeps no times'
);

select lives_ok(
  $$select public.rpc_merchant_holiday_set('70000000-0000-0000-0000-000000000002',
      '70000000-0000-0000-0000-0000000000a1', false)$$,
  'and back to the usual hours, with the three-argument call older code makes'
);

reset role;

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '70000000-0000-0000-0000-000000000002', null, current_date + 10)$$,
  $$values ('09:00'::time, '17:00'::time, false, 'weekly'::text)$$,
  'usual hours fall through to the week'
);

-- ------------------------------------------------------- a day of their own

set local role authenticated;
set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}';

select public.rpc_merchant_hours_override('70000000-0000-0000-0000-000000000002',
  current_date + 40, null, null, true, null, 'Staff day', 'merchant');

select throws_ok(
  $$select public.rpc_merchant_hours_override_clear('70000000-0000-0000-0000-000000000002',
      '70000000-0000-0000-0000-0000000000ff')$$,
  '22023', 'That day is not on your hours.',
  'clearing a day that is not there is refused'
);

set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000009","role":"authenticated"}';

select throws_ok(
  format($$select public.rpc_merchant_hours_override_clear('70000000-0000-0000-0000-000000000002', %L)$$,
    (select o.id from public.merchant_hours_override o
      where o.merchant_id = '70000000-0000-0000-0000-000000000002')),
  '42501', 'Not your merchant.',
  'a stranger cannot clear the owner''s day'
);

set local request.jwt.claims = '{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  format($$select public.rpc_merchant_hours_override_clear('70000000-0000-0000-0000-000000000002', %L)$$,
    (select o.id from public.merchant_hours_override o
      where o.merchant_id = '70000000-0000-0000-0000-000000000002')),
  'the owner removes their staff day'
);

reset role;

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '70000000-0000-0000-0000-000000000002', null, current_date + 40)$$,
  $$values ('09:00'::time, '17:00'::time, false, 'weekly'::text)$$,
  'and the day goes back to the usual hours'
);

select * from finish();
rollback;
