-- NexG Careers: hosts and hotels post jobs, and staff run the board.
--
-- A live host's account-wide members and a partner hotel's admins post and
-- manage jobs; staff limited to some units, a hotel's desk and unverified
-- businesses cannot. The right people are rung. Staff see every job in the
-- console with applicant counts but no applicants; a take-down sticks, the
-- business is told why, and only staff lift it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ------------------------------------------------------------------ fixtures

insert into public.city (id, slug, name, country, currency, timezone, status, sort)
values ('89000000-0000-0000-0000-0000000000c1', 'hireville', 'Hireville', 'Hireland',
        'KES', 'Africa/Nairobi', 'live', 999);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('89000000-0000-0000-0000-0000000000a1'::uuid, 'host.owner@hire.example'),
  ('89000000-0000-0000-0000-0000000000a2'::uuid, 'host.unit.manager@hire.example'),
  ('89000000-0000-0000-0000-0000000000a3'::uuid, 'pending.host@hire.example'),
  ('89000000-0000-0000-0000-0000000000b1'::uuid, 'hotel.admin@hire.example'),
  ('89000000-0000-0000-0000-0000000000b2'::uuid, 'hotel.desk@hire.example'),
  ('89000000-0000-0000-0000-0000000000e1'::uuid, 'seeker@hire.example')
) as u (id, email);

/* H: a live host. P: a host NexG is still verifying. */
insert into public.host (
  id, kind, display_name, contact_name, phone, email, city_id,
  status, submitted_at, went_live_at, verified_at, verification_method, verification_submitted_at
)
values
  ('89000000-0000-0000-0000-00000000000a', 'multi_unit', 'Hireville Residences', 'Host Owner',
   '+254700000891', 'residences@hire.example', '89000000-0000-0000-0000-0000000000c1',
   'live', now() - interval '20 days', now() - interval '10 days', now() - interval '10 days',
   'listing_code', now() - interval '18 days'),
  ('89000000-0000-0000-0000-00000000000b', 'multi_unit', 'Pending Lofts', 'Pending Owner',
   '+254700000892', 'lofts@hire.example', '89000000-0000-0000-0000-0000000000c1',
   'verifying', now() - interval '2 days', null, null, null, null);

insert into public.host_user (host_id, user_id, role, accepted_at, units) values
  ('89000000-0000-0000-0000-00000000000a', '89000000-0000-0000-0000-0000000000a1', 'owner', now(), null),
  ('89000000-0000-0000-0000-00000000000a', '89000000-0000-0000-0000-0000000000a2', 'manager', now(),
   array['89000000-0000-0000-0000-0000000000d9']::uuid[]),
  ('89000000-0000-0000-0000-00000000000b', '89000000-0000-0000-0000-0000000000a3', 'owner', now(), null);

/* T: a partner hotel, with an admin and somebody on the desk. */
insert into public.hotel (id, name, city_id, rooms, status, agreement_signed_at, agreement_version, commission_pct)
values ('89000000-0000-0000-0000-00000000000c', 'Grand Hireville Hotel',
        '89000000-0000-0000-0000-0000000000c1', 120, 'partner', now() - interval '30 days', 'v1', 12);

insert into public.hotel_user (hotel_id, user_id, role, accepted_at) values
  ('89000000-0000-0000-0000-00000000000c', '89000000-0000-0000-0000-0000000000b1', 'admin', now()),
  ('89000000-0000-0000-0000-00000000000c', '89000000-0000-0000-0000-0000000000b2', 'desk', now());

select set_config('test.staff_id',
  (select id::text from auth.users where email = 'dev.admin@nexgapp.com'), true);

insert into storage.objects (bucket_id, name, owner) values
  ('careers-cv', '89000000-0000-0000-0000-0000000000e1/cv.pdf', '89000000-0000-0000-0000-0000000000e1');

-- ------------------------------------------------------------------ employers

select throws_ok(
  $$insert into public.vacancy (merchant_id, host_id, title, category, job_type, city_id, description)
    values ((select id from public.merchant limit 1), '89000000-0000-0000-0000-00000000000a',
            'Two employers', 'other', 'gig', '89000000-0000-0000-0000-0000000000c1',
            'A job cannot belong to two businesses at once.')$$,
  '23514', null,
  'A job belongs to exactly one business');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"89000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_vacancy_save_for('host', '89000000-0000-0000-0000-00000000000a',
      'Test housekeeper 89', 'cleaning', 'part_time', '89000000-0000-0000-0000-0000000000c1',
      'Turn over apartments between guests, three days a week.', p_publish => true)$$,
  'A live host''s owner publishes a job');

select is(
  (select (merchant_id is null and host_id is not null and status = 'open')::text
     from public.vacancy where title = 'Test housekeeper 89'),
  'true',
  'and the job is the host''s, on the board');

select set_config('request.jwt.claims',
  '{"sub":"89000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_vacancy_save_for('host', '89000000-0000-0000-0000-00000000000a',
      'Test caretaker 89', 'property', 'full_time', '89000000-0000-0000-0000-0000000000c1',
      'Look after the building and the keys.')$$,
  '42501', 'Only the people who hire for this business can post its jobs.',
  'A manager limited to some units cannot post for the whole host');

select set_config('request.jwt.claims',
  '{"sub":"89000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_vacancy_save_for('host', '89000000-0000-0000-0000-00000000000b',
      'Test concierge 89', 'hospitality', 'full_time', '89000000-0000-0000-0000-0000000000c1',
      'Welcome guests and look after their requests.', p_publish => true)$$,
  '23514',
  'Only verified businesses can publish jobs. NexG is still checking yours, so save this as a draft for now.',
  'A host NexG is still verifying cannot publish');

select set_config('request.jwt.claims',
  '{"sub":"89000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_vacancy_save_for('hotel', '89000000-0000-0000-0000-00000000000c',
      'Test night auditor 89', 'hospitality', 'full_time', '89000000-0000-0000-0000-0000000000c1',
      'Balance the day''s accounts overnight and cover the front desk.',
      p_salary_min => 45000, p_salary_max => 55000, p_salary_period => 'month', p_publish => true)$$,
  'A partner hotel''s admin publishes a job');

select set_config('request.jwt.claims',
  '{"sub":"89000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_vacancy_save_for('hotel', '89000000-0000-0000-0000-00000000000c',
      'Test bellhop 89', 'hospitality', 'part_time', '89000000-0000-0000-0000-0000000000c1',
      'Carry bags and show guests to their rooms.')$$,
  '42501', 'Only the people who hire for this business can post its jobs.',
  'but the hotel''s desk cannot');

-- ------------------------------------------------------------------ the public

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select string_agg(employer_name || ' · ' || title, ' | ' order by title)
     from public.careers_board_v where title like 'Test % 89'),
  'Hireville Residences · Test housekeeper 89 | Grand Hireville Hotel · Test night auditor 89',
  'The board shows the host''s and the hotel''s jobs under their names');

select is(
  (select string_agg(employer_kind, ',' order by employer_kind)
     from public.careers_vacancy_v where title like 'Test % 89'),
  'host,hotel',
  'and says what kind of business each is');

-- ------------------------------------------------------------- applying to a host

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"89000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_vacancy_apply((select id from public.careers_vacancy_v where title = 'Test housekeeper 89'),
      'Wanjiru Kamau', 'wanjiru@hire.example',
      p_cv_path => '89000000-0000-0000-0000-0000000000e1/cv.pdf', p_cv_name => 'Wanjiru CV.pdf')$$,
  'A job seeker applies for the host''s job');

select set_config('request.jwt.claims',
  '{"sub":"89000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is(
  (select full_name from public.vacancy_application a
    join public.vacancy v on v.id = a.vacancy_id where v.title = 'Test housekeeper 89'),
  'Wanjiru Kamau',
  'The host''s owner sees the applicant');

select is(
  authz.business_reads_cv('89000000-0000-0000-0000-0000000000e1/cv.pdf'),
  true,
  'and can open their CV');

select lives_ok(
  $$select public.rpc_vacancy_application_update(
      (select a.id from public.vacancy_application a join public.vacancy v on v.id = a.vacancy_id
        where v.title = 'Test housekeeper 89'),
      'shortlisted')$$,
  'and shortlists them');

select set_config('request.jwt.claims',
  '{"sub":"89000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.vacancy_application),
  0,
  'The unit-limited manager sees no applicants');

select set_config('request.jwt.claims',
  '{"sub":"89000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);

select is(
  authz.business_reads_cv('89000000-0000-0000-0000-0000000000e1/cv.pdf'),
  false,
  'and the hotel''s desk cannot open the CV');

select set_config('request.jwt.claims',
  '{"sub":"89000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

select is(
  (select employer_name || ' · ' || status from public.my_job_applications_v),
  'Hireville Residences · shortlisted',
  'The applicant sees the host by name, and where they stand');

select is(
  (select count(*)::integer from public.console_vacancy_v),
  0,
  'A job seeker sees nothing of the console''s board');

-- ------------------------------------------------------------------ staff

select set_config('request.jwt.claims', json_build_object(
  'sub', current_setting('test.staff_id'), 'role', 'authenticated')::text, true);

select is(
  (select employer_kind || ' · ' || employer_name || ' · ' || applicants || ' applicant'
     from public.console_vacancy_v where title = 'Test housekeeper 89'),
  'host · Hireville Residences · 1 applicant',
  'Staff see every job with its business and how many applied');

select lives_ok(
  $$select public.rpc_vacancy_set_status(
      (select id from public.console_vacancy_v where title = 'Test night auditor 89'),
      'closed', 'Asks applicants for a training fee')$$,
  'Staff take the hotel''s job down');

select is(
  (select status || ' · ' || taken_down_reason || ' · ' || on_board::text
     from public.console_vacancy_v where title = 'Test night auditor 89'),
  'closed · Asks applicants for a training fee · false',
  'and the console shows why, and that it is off the board');

select throws_ok(
  $$select public.rpc_vacancy_lift_takedown(
      (select id from public.console_vacancy_v where title = 'Test night auditor 89'), ' ')$$,
  '23514', 'Say why the take-down is lifted.',
  'Lifting a take-down needs a reason too');

select set_config('request.jwt.claims',
  '{"sub":"89000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_vacancy_set_status(
      (select id from public.vacancy where title = 'Test night auditor 89'), 'open')$$,
  '23514', 'NexG took this job down. Contact NexG to have it put back up.',
  'The hotel cannot put a taken-down job back up');

select throws_ok(
  $$select public.rpc_vacancy_save_for('hotel', '89000000-0000-0000-0000-00000000000c',
      'Test night auditor 89', 'hospitality', 'full_time', '89000000-0000-0000-0000-0000000000c1',
      'Balance the day''s accounts overnight and cover the front desk.',
      p_vacancy_id => (select id from public.vacancy where title = 'Test night auditor 89'),
      p_publish => true)$$,
  '23514', 'NexG took this job down. Contact NexG to have it put back up.',
  'not by republishing it either');

select throws_ok(
  $$select public.rpc_vacancy_lift_takedown(
      (select id from public.vacancy where title = 'Test night auditor 89'), 'Fixed it')$$,
  '42501', 'Only staff who look after this city''s jobs can lift a take-down.',
  'and cannot lift the take-down itself');

select set_config('request.jwt.claims', json_build_object(
  'sub', current_setting('test.staff_id'), 'role', 'authenticated')::text, true);

select lives_ok(
  $$select public.rpc_vacancy_lift_takedown(
      (select id from public.console_vacancy_v where title = 'Test night auditor 89'),
      'The hotel removed the fee')$$,
  'Staff lift the take-down');

select set_config('request.jwt.claims',
  '{"sub":"89000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

select is(
  (select status from public.rpc_vacancy_set_status(
     (select id from public.vacancy where title = 'Test night auditor 89'), 'open')),
  'open',
  'and the hotel can open the job again');

reset role;

-- --------------------------------------------------- bells, modules and audit

select is(
  (select string_agg(u.email || ' ' || n.href, ', ' order by u.email)
     from public.user_notification n
     join auth.users u on u.id = n.user_id
    where n.kind = 'merchant.vacancy_application'
      and n.object_id = (select id from public.vacancy where title = 'Test housekeeper 89')),
  'host.owner@hire.example /host?open=hiring/' ||
    (select id from public.vacancy where title = 'Test housekeeper 89')::text,
  'Only the host''s account-wide members are rung, and sent to Hiring in the host workspace');

select is(
  (select count(*)::integer from public.user_notification n
    where n.kind = 'careers.vacancy_taken_down'
      and n.user_id = '89000000-0000-0000-0000-0000000000b1'),
  1,
  'The hotel''s admin heard about the take-down and its lifting, in one bell');

select is(
  (select string_agg(role_key, ',' order by role_key) from public.role_module_access
    where module_key = 'job_board'),
  'city_lead,merchant_ops,ops_manager,partnerships,super_admin',
  'The console''s Job board is for operations, merchant operations and hospitality staff');

select is(
  (select count(distinct action)::integer from audit.audit_event
    where action in ('careers.vacancy_saved', 'careers.job_application_updated',
                     'careers.vacancy_taken_down', 'careers.vacancy_takedown_lifted',
                     'careers.vacancy_status_changed')),
  5,
  'Every step is in the audit log');

select is(
  (select count(*)::integer from public.fn_wiring_check() where finding ~ '(vacanc|careers)'),
  0,
  'and the wiring check finds nothing to fix');

select * from finish();
rollback;
