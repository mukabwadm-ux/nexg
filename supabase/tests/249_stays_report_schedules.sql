-- Stays scheduled and saved reports (20270331000200): staff-only, recipients
-- are staff who reach Hotels, changes by hospitality staff or the owner, the
-- schedule's next send, and the daily send itself.

begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c2490000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'stranger249@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2490000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'ops249@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2490000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'finance249@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2490000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'viewer249@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2490000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', 'approver249@test.local', now(), false, now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c2490000-0000-4000-8000-0000000000b1', 'c2490000-0000-4000-8000-000000000002', 'ops249@test.local', 'Ops 249'),
  ('c2490000-0000-4000-8000-0000000000b2', 'c2490000-0000-4000-8000-000000000003', 'finance249@test.local', 'Finance 249'),
  ('c2490000-0000-4000-8000-0000000000b3', 'c2490000-0000-4000-8000-000000000004', 'viewer249@test.local', 'Viewer 249'),
  ('c2490000-0000-4000-8000-0000000000b4', 'c2490000-0000-4000-8000-000000000005', 'approver249@test.local', 'Approver 249');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff, r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c2490000-0000-4000-8000-0000000000b4'
  from (values ('c2490000-0000-4000-8000-0000000000b1'::uuid, 'ops_manager'),
               ('c2490000-0000-4000-8000-0000000000b2'::uuid, 'finance'),
               ('c2490000-0000-4000-8000-0000000000b3'::uuid, 'read_only')) g (staff, role_key)
  join public.role r on r.key = g.role_key;

-- ─────────────────────────────────────────── the next send and its period

select is(public.fn_stays_report_next_run('weekly', '2026-11-26 10:00+03'),
  '2026-11-30 05:00+03'::timestamptz, 'weekly goes on the next Monday at 05:00 Nairobi');
select is(public.fn_stays_report_next_run('weekly', '2026-11-30 05:00+03'),
  '2026-12-07 05:00+03'::timestamptz, 'a send at the slot moves a week on');
select is(public.fn_stays_report_next_run('monthly', '2026-11-26 10:00+03'),
  '2026-12-01 05:00+03'::timestamptz, 'monthly goes on the 1st at 05:00');
select is(public.fn_stays_report_next_run('monthly', '2026-12-01 04:59+03'),
  '2026-12-01 05:00+03'::timestamptz, 'and on the same 1st when it is not 05:00 yet');
select is((select array[period_from, period_to] from public.fn_stays_report_send_period('weekly', '2026-11-30')),
  array['2026-11-23'::date, '2026-11-29'::date], 'a weekly send covers Monday to Sunday before');
select is((select array[period_from, period_to] from public.fn_stays_report_send_period('monthly', '2026-12-01')),
  array['2026-11-01'::date, '2026-11-30'::date], 'a monthly send covers the month before');

-- ─────────────────────────────────────────── strangers are refused

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2490000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok($$ select public.rpc_console_stays_report_plans() $$, '42501', null,
  'a stranger cannot read the plans');
select throws_ok($$ select public.rpc_console_stays_report_schedule_save(
    '{"report":"bookings","frequency":"weekly","recipients":["c2490000-0000-4000-8000-0000000000b1"]}') $$,
  '42501', null, 'nor schedule a report');
select throws_ok($$ select count(*) from public.stays_report_schedule $$, '42501', null,
  'stays_report_schedule is closed to direct reads');
select throws_ok($$ select count(*) from public.stays_report_saved $$, '42501', null,
  'stays_report_saved too');
select throws_ok($$ select public.cron_stays_report_schedules() $$, '42501', null,
  'and nobody signed in runs the send');

-- ─────────────────────────────────────────── schedules

select set_config('request.jwt.claims', '{"sub":"c2490000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select throws_ok($$ select public.rpc_console_stays_report_schedule_save(
    '{"report":"bookings","frequency":"weekly","recipients":["someone@example.test"]}') $$,
  '22023', null, 'recipients are staff users, not email addresses');
select throws_ok($$ select public.rpc_console_stays_report_schedule_save(
    '{"report":"bookings","frequency":"weekly","recipients":["c2490000-0000-4000-8000-0000000000ff"]}') $$,
  '23514', null, 'and must be staff who reach Stays');
select throws_ok($$ select public.rpc_console_stays_report_schedule_save(
    '{"report":"bookings","frequency":"daily","recipients":["c2490000-0000-4000-8000-0000000000b1"]}') $$,
  '22023', null, 'weekly or monthly only');

create temp table t249 (k text primary key, id uuid);
grant all on t249 to authenticated;
insert into t249 select 'schedule', (public.rpc_console_stays_report_schedule_save(
  '{"report":"revenue","frequency":"weekly","recipients":["c2490000-0000-4000-8000-0000000000b1","c2490000-0000-4000-8000-0000000000b2"]}') ->> 'id')::uuid;
select ok((select id from t249 where k = 'schedule') is not null, 'a Finance reader schedules a report');
select is(jsonb_array_length(public.rpc_console_stays_report_plans() -> 'schedules' -> 0 -> 'recipients'), 2,
  'the plans list it with its two recipients');

select set_config('request.jwt.claims', '{"sub":"c2490000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok($$ select public.rpc_console_stays_report_schedule_set((select id from t249 where k = 'schedule'), 'pause') $$,
  '42501', null, 'another reader cannot pause it');

select set_config('request.jwt.claims', '{"sub":"c2490000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((public.rpc_console_stays_report_schedule_set((select id from t249 where k = 'schedule'), 'pause')) ->> 'active',
  'false', 'whoever added it pauses it');

select set_config('request.jwt.claims', '{"sub":"c2490000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((public.rpc_console_stays_report_schedule_set((select id from t249 where k = 'schedule'), 'resume')) ->> 'active',
  'true', 'hospitality staff resume it');

-- ─────────────────────────────────────────── saved reports

select set_config('request.jwt.claims', '{"sub":"c2490000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.rpc_console_stays_report_saved_save('{"name":"Odd","report":"bookings","period":"custom"}') $$,
  '23514', null, 'a custom period needs its dates');
insert into t249 select 'saved', (public.rpc_console_stays_report_saved_save(
  '{"name":"Month revenue 249","report":"revenue","period":"last_month"}') ->> 'id')::uuid;
select is((public.rpc_console_stays_report_plans() -> 'saved' -> 0 ->> 'name'), 'Month revenue 249',
  'its owner sees the saved report');

select set_config('request.jwt.claims', '{"sub":"c2490000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from jsonb_array_elements(public.rpc_console_stays_report_plans() -> 'saved') x
            where x ->> 'name' = 'Month revenue 249'), 0, 'nobody else sees it while it is private');

select set_config('request.jwt.claims', '{"sub":"c2490000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok($$ select public.rpc_console_stays_report_saved_save(jsonb_build_object(
    'id', (select id from t249 where k = 'saved'), 'name', 'Month revenue 249', 'report', 'revenue',
    'period', 'last_month', 'shared', true)) $$, 'the owner shares it');

select set_config('request.jwt.claims', '{"sub":"c2490000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from jsonb_array_elements(public.rpc_console_stays_report_plans() -> 'saved') x
            where x ->> 'name' = 'Month revenue 249' and not (x ->> 'can_change')::boolean), 1,
  'then others see it, read-only');
select throws_ok($$ select public.rpc_console_stays_report_saved_delete((select id from t249 where k = 'saved')) $$,
  '42501', null, 'and cannot delete it');

select set_config('request.jwt.claims', '{"sub":"c2490000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((public.rpc_console_stays_report_saved_delete((select id from t249 where k = 'saved'))) ->> 'deleted',
  'true', 'the owner deletes it');

-- ─────────────────────────────────────────── the daily send

reset role;
insert into public.stays_report_schedule (report, frequency, recipients, active, next_run_at, created_by)
values ('cases', 'monthly', array['c2490000-0000-4000-8000-0000000000b1'::uuid], false, now() - interval '1 day',
        'c2490000-0000-4000-8000-0000000000b1');
update public.stays_report_schedule set next_run_at = now() - interval '1 minute'
 where id = (select id from t249 where k = 'schedule');

select is(public.cron_stays_report_schedules(), 1, 'the send handles the one due, active schedule');
select is((select count(*)::int from public.notification_log
            where template = 'staff_stays_report' and recipient in ('ops249@test.local', 'finance249@test.local')), 2,
  'each recipient is emailed');
select ok((select payload -> 'content' -> 'action' ->> 'url' from public.notification_log
            where template = 'staff_stays_report' and recipient = 'ops249@test.local' limit 1)
          like 'https://control.nexgapp.com/stays/export?report=revenue&from=%',
  'with a link to the console export');
select is((select emailed_to from public.stays_report_run where schedule_id = (select id from t249 where k = 'schedule')), 2,
  'the run is logged with who it went to');
select ok((select next_run_at > now() and last_sent_at is not null from public.stays_report_schedule
            where id = (select id from t249 where k = 'schedule')), 'and the schedule moves on');
select is(public.cron_stays_report_schedules(), 0, 'a second run the same day sends nothing');

select * from finish();
rollback;
