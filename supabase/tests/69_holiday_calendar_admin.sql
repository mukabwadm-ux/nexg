-- Staff keep the public holiday calendar.
--
-- `rpc_holiday_calendar` lists the holidays that apply to a city from today
-- on, with how many merchants answered closed and open. `rpc_holiday_save`
-- adds one or corrects one in place, so merchants' answers follow a moved
-- date (an Eid confirmed a day later). `rpc_holiday_remove` takes one off,
-- answers and all. Writes need the city settings permission
-- (settings.fn_may_edit('cities'): ops_manager or super_admin); reading needs
-- any active staff account.
--
-- Two test cities in a test country keep the seeded Kenyan calendar out of
-- the counts.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ------------------------------------------------------------------ fixtures

insert into public.city (id, slug, name, country, currency, timezone, status, sort)
values
  ('67000000-0000-0000-0000-0000000000c1', 'holidaytown', 'Holidaytown', 'Testland',
   'KES', 'Africa/Nairobi', 'live', 997),
  ('67000000-0000-0000-0000-0000000000c2', 'second-town', 'Second Town', 'Testland',
   'KES', 'Africa/Nairobi', 'live', 998);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '67000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'holiday.ops@nexgapp.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '67000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'holiday.finance@nexgapp.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '67000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'holiday.owner@shop.example', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('67000000-0000-0000-0000-0000000000f1', '67000000-0000-0000-0000-000000000001',
   'holiday.ops@nexgapp.com', 'Holiday ops'),
  ('67000000-0000-0000-0000-0000000000f2', '67000000-0000-0000-0000-000000000002',
   'holiday.finance@nexgapp.com', 'Holiday finance');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by) values
  ('67000000-0000-0000-0000-0000000000f1', (select id from public.role where key = 'ops_manager'),
   null, '67000000-0000-0000-0000-0000000000f1', null),
  ('67000000-0000-0000-0000-0000000000f2', (select id from public.role where key = 'finance'),
   null, '67000000-0000-0000-0000-0000000000f1', '67000000-0000-0000-0000-0000000000f2');

insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, city_id
)
values ('67000000-0000-0000-0000-000000000004', 'Sikuu Limited', 'Sikuu', 'restaurant',
        'Atieno Odhiambo', '+254700000067', 'holiday.owner@shop.example',
        '67000000-0000-0000-0000-0000000000c1');

insert into public.merchant_user (merchant_id, user_id, role)
values ('67000000-0000-0000-0000-000000000004', '67000000-0000-0000-0000-000000000003', 'owner');

insert into public.holiday_calendar (id, city_id, country, date, label, source, estimated) values
  ('67000000-0000-0000-0000-0000000000a1', null, 'Testland', current_date + 10,
   'Founders Day', 'national', true),
  ('67000000-0000-0000-0000-0000000000a2', null, 'Testland', current_date - 3,
   'Old Day', 'national', false);

-- ------------------------------------------------------- ops adds holidays

set local role authenticated;
set local request.jwt.claims = '{"sub":"67000000-0000-0000-0000-000000000001","role":"authenticated"}';

select results_eq(
  $$select label, scope, estimated, closed_count, open_count
    from public.rpc_holiday_calendar('67000000-0000-0000-0000-0000000000c1')$$,
  $$values ('Founders Day'::text, 'country'::text, true, 0, 0)$$,
  'staff see the holidays from today on, nothing answered yet'
);

select lives_ok(
  $$select public.rpc_holiday_save(p_date => current_date + 20, p_label => '  Harvest Day ',
      p_estimated => false, p_city_id => '67000000-0000-0000-0000-0000000000c1', p_country_wide => true)$$,
  'ops adds a holiday for the whole country'
);

select lives_ok(
  $$select public.rpc_holiday_save(p_date => current_date + 30, p_label => 'Holidaytown Day',
      p_estimated => false, p_city_id => '67000000-0000-0000-0000-0000000000c1', p_country_wide => false)$$,
  'and one for this city alone'
);

select throws_ok(
  $$select public.rpc_holiday_save(p_date => current_date + 20, p_label => 'Second Harvest',
      p_estimated => false, p_city_id => '67000000-0000-0000-0000-0000000000c1', p_country_wide => true)$$,
  '23505', 'There is already a holiday on that date.',
  'two country-wide holidays cannot share a date'
);

select throws_ok(
  $$select public.rpc_holiday_save(p_date => current_date + 40, p_label => '   ',
      p_estimated => false, p_city_id => '67000000-0000-0000-0000-0000000000c1', p_country_wide => true)$$,
  '22023', 'Give the holiday a name.',
  'a holiday needs a name'
);

select throws_ok(
  $$select public.rpc_holiday_save(p_date => current_date - 1, p_label => 'Yesterday',
      p_estimated => false, p_city_id => '67000000-0000-0000-0000-0000000000c1', p_country_wide => true)$$,
  '22023', 'Pick a date from today on.',
  'and a date from today on'
);

-- ------------------------------------ a merchant answers, then Eid moves

set local request.jwt.claims = '{"sub":"67000000-0000-0000-0000-000000000003","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_holiday_set('67000000-0000-0000-0000-000000000004',
      '67000000-0000-0000-0000-0000000000a1', true)$$,
  'a merchant closes for Founders Day'
);

set local request.jwt.claims = '{"sub":"67000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_holiday_save(p_holiday_id => '67000000-0000-0000-0000-0000000000a1',
      p_date => current_date + 11, p_label => 'Founders Day', p_estimated => false)$$,
  'ops confirms Founders Day a day later than estimated'
);

select results_eq(
  $$select label, scope, estimated, closed_count, open_count
    from public.rpc_holiday_calendar('67000000-0000-0000-0000-0000000000c1')$$,
  $$values ('Founders Day'::text, 'country'::text, false, 1, 0),
           ('Harvest Day', 'country', false, 0, 0),
           ('Holidaytown Day', 'city', false, 0, 0)$$,
  'the calendar shows the confirmed date, the answer and both new holidays'
);

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '67000000-0000-0000-0000-000000000004', null, current_date + 11)$$,
  $$values (null::time, null::time, true, 'holiday'::text)$$,
  'the merchant is closed on the corrected date'
);

select results_eq(
  $$select label from public.rpc_holiday_calendar('67000000-0000-0000-0000-0000000000c2')$$,
  $$values ('Founders Day'::text), ('Harvest Day')$$,
  'another city in the country gets the country''s holidays and not Holidaytown''s own'
);

select is(
  (select public.rpc_holiday_remove('67000000-0000-0000-0000-0000000000a1') ->> 'note'),
  'Removed, with the one merchant answer it had.',
  'removing a holiday says how many merchant answers went with it'
);

-- ------------------------------------------------------- who else may

set local request.jwt.claims = '{"sub":"67000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$select public.rpc_holiday_save(p_date => current_date + 50, p_label => 'Finance Day',
      p_estimated => false, p_city_id => '67000000-0000-0000-0000-0000000000c1', p_country_wide => true)$$,
  '42501', 'Only staff who edit city settings can change the holiday calendar.',
  'finance cannot add a holiday'
);

select throws_ok(
  $$select public.rpc_holiday_remove(
      (select id from public.holiday_calendar where label = 'Harvest Day' and country = 'Testland'))$$,
  '42501', 'Only staff who edit city settings can change the holiday calendar.',
  'or remove one'
);

select is(
  (select count(*)::integer from public.rpc_holiday_calendar('67000000-0000-0000-0000-0000000000c1')),
  2,
  'but any staff member can read the calendar'
);

set local request.jwt.claims = '{"sub":"67000000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok(
  $$select * from public.rpc_holiday_calendar('67000000-0000-0000-0000-0000000000c1')$$,
  '42501', 'Staff only.',
  'a merchant cannot read the staff calendar'
);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$select * from public.rpc_holiday_calendar('67000000-0000-0000-0000-0000000000c1')$$,
  '42501', null,
  'the anonymous key cannot call it at all'
);

reset role;

-- ----------------------------------------------------------- the record

select is(
  (select count(*)::integer from public.merchant_holiday_hours
    where holiday_id = '67000000-0000-0000-0000-0000000000a1'),
  0,
  'the removed holiday took its merchant answers with it'
);

select results_eq(
  $$select action::text, count(*)::integer from audit.audit_event
    where action::text like 'holiday.%' group by action order by action$$,
  $$values ('holiday.added'::text, 2), ('holiday.changed', 1), ('holiday.removed', 1)$$,
  'every change is in the audit log'
);

select * from finish();
rollback;
