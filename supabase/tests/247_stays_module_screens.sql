-- The Stays module screens (20270329000100): readers are staff-only, the new
-- tables are closed to direct reads, host review sends the host an email,
-- and the writers keep their rules.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c2460000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'stranger246@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2460000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'ops246@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2460000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'approver246@test.local', now(), false, now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c2460000-0000-4000-8000-0000000000b1', 'c2460000-0000-4000-8000-000000000002', 'ops246@test.local', 'Ops 246'),
  ('c2460000-0000-4000-8000-0000000000b2', 'c2460000-0000-4000-8000-000000000003', 'approver246@test.local', 'Approver 246');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c2460000-0000-4000-8000-0000000000b1', r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c2460000-0000-4000-8000-0000000000b2'
  from public.role r where r.key = 'ops_manager';

insert into public.host (id, phone, kind, status, contact_name, display_name, email, city_id, submitted_at)
values
  ('c2460000-0000-4000-8000-0000000000a1', '+254700024601', 'single_unit', 'verifying', 'Applicant 246',
   '[Host 246]', 'host246@example.test', (select id from public.city where slug = 'nairobi'), now()),
  ('c2460000-0000-4000-8000-0000000000a2', '+254700024602', 'single_unit', 'applied', 'Second 246',
   '[Host 246b]', 'host246b@example.test', (select id from public.city where slug = 'nairobi'), now());

insert into public.unit (id, host_id, name, status, nightly_rate_kes, city_id)
values ('c2460000-0000-4000-8000-0000000000c1', 'c2460000-0000-4000-8000-0000000000a1', '[Unit 246]', 'setting_up', 8000,
        (select id from public.city where slug = 'nairobi'));

-- ─────────────────────────────────────────── strangers are refused

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2460000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok($$ select public.rpc_console_stays_overview(current_date - 7, current_date) $$,
  '42501', null, 'a stranger cannot read the overview');
select throws_ok($$ select public.rpc_console_stays_hosts() $$, '42501', null, 'nor the hosts');
select throws_ok($$ select public.rpc_console_host_reject('c2460000-0000-4000-8000-0000000000a1', 'no', false) $$,
  '42501', null, 'nor reject a host');
select throws_ok($$ select count(*) from public.stays_case $$, '42501', null, 'stays_case is closed to direct reads');
select throws_ok($$ select count(*) from public.stays_lead $$, '42501', null, 'stays_lead too');
select throws_ok($$ select public.rpc_console_integrations_health() $$, '42501', null,
  'and the integrations health');

-- ─────────────────────────────────────────── staff read every screen

select set_config('request.jwt.claims', '{"sub":"c2460000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select ok(public.rpc_console_stays_overview(current_date - 30, current_date) ? 'kpis', 'overview reads');
select ok(public.rpc_console_stays_list(current_date - 30, current_date, null, 'reservations') ? 'rows', 'reservations read');
select ok(public.rpc_console_stays_list(current_date - 30, current_date, null, 'checkins', 'today') ? 'counts', 'check-ins read');
select ok(public.rpc_console_stays_units(current_date - 30, current_date) ? 'kpis', 'units read');
select ok(public.rpc_console_stays_calendar(current_date) ? 'days', 'calendar reads');
select ok(public.rpc_console_stays_properties(current_date - 30, current_date) ? 'areas', 'buildings read');
select ok(public.rpc_console_stays_finance(current_date - 30, current_date) ? 'rules', 'finance reads');
select ok(public.rpc_console_stays_performance(current_date - 30, current_date) ? 'trend', 'performance reads');
select is((public.rpc_console_stays_settings() -> 'settings' -> 0 ->> 'key'), 'stays.pm_share_pct',
  'configuration lists the stays settings');
select throws_ok($$ select public.rpc_console_stays_list(current_date - 900, current_date) $$,
  '22023', null, 'a period over a year is refused');

-- ─────────────────────────────────────────── host review

select throws_ok($$ select public.rpc_console_host_reject('c2460000-0000-4000-8000-0000000000a1', '  ', false) $$,
  '23514', null, 'sending a host back needs a reason');
select is((public.rpc_console_host_reject('c2460000-0000-4000-8000-0000000000a1', 'Upload a clearer ID photo.', false)) ->> 'status',
  'applied', 'a host sent back stays applied');

reset role;
select is((select status_reason from public.host where id = 'c2460000-0000-4000-8000-0000000000a1'),
  'Upload a clearer ID photo.', 'with the reason they read');
select ok(exists (select 1 from public.notification_log
                   where template = 'host_sent_back' and recipient = 'host246@example.test'),
  'and an email is queued to them');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2460000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((public.rpc_console_host_reject('c2460000-0000-4000-8000-0000000000a2', 'Not a real listing.', true)) ->> 'status',
  'offboarded', 'declining offboards the host');

-- ─────────────────────────────────────────── writers keep their rules

select is((public.rpc_console_unit_rate_set('c2460000-0000-4000-8000-0000000000c1', 9500)) ->> 'nightly_rate_kes',
  '9500', 'staff set a nightly rate');
select ok((public.rpc_console_stay_block('c2460000-0000-4000-8000-0000000000c1', current_date + 40, current_date + 43, 'Repairs')) ? 'stay_id',
  'staff block dates');
select throws_ok($$ select public.rpc_console_stay_block('c2460000-0000-4000-8000-0000000000c1', current_date + 41, current_date + 42) $$,
  '23P01', null, 'and cannot block over a block');

select * from finish();
rollback;
