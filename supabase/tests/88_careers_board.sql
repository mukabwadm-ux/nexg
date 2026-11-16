-- NexG Careers: businesses post jobs, job seekers apply.
--
-- A business's owners and managers post its jobs; only a verified (live)
-- business publishes, and demo workspaces never reach the board. A signed-in
-- job seeker applies with a CV from their own folder. The business sees its
-- applicants and their CVs, moves them on, and the applicant is told.
-- Withdrawing takes the CV away from the business. Staff can take a job down
-- with a reason, and cannot put one up.

begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- ------------------------------------------------------------------ fixtures

insert into public.city (id, slug, name, country, currency, timezone, status, sort)
values
  ('88000000-0000-0000-0000-0000000000c1', 'jobsville', 'Jobsville', 'Jobland',
   'KES', 'Africa/Nairobi', 'live', 997),
  ('88000000-0000-0000-0000-0000000000c2', 'waitville', 'Waitville', 'Jobland',
   'KES', 'Africa/Nairobi', 'waitlist', 998);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('88000000-0000-0000-0000-0000000000a1'::uuid, 'a.owner@jobs.example'),
  ('88000000-0000-0000-0000-0000000000a2'::uuid, 'a.manager@jobs.example'),
  ('88000000-0000-0000-0000-0000000000b1'::uuid, 'b.owner@jobs.example'),
  ('88000000-0000-0000-0000-0000000000d1'::uuid, 'd.owner@jobs.example'),
  ('88000000-0000-0000-0000-0000000000e1'::uuid, 'seeker.one@jobs.example'),
  ('88000000-0000-0000-0000-0000000000e2'::uuid, 'seeker.two@jobs.example')
) as u (id, email);

/* A: live, an owner and a manager. B: not checked yet. D: a live demo. */
insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, city_id
)
values
  ('88000000-0000-0000-0000-00000000000a', 'Alpha Kitchen Limited', 'Alpha Kitchen', 'restaurant',
   'Amina A', '+254700000881', 'alpha@jobs.example', '88000000-0000-0000-0000-0000000000c1'),
  ('88000000-0000-0000-0000-00000000000b', 'Bakery Limited', 'Pending Bakery', 'restaurant',
   'Baraka B', '+254700000882', 'bakery@jobs.example', '88000000-0000-0000-0000-0000000000c1'),
  ('88000000-0000-0000-0000-00000000000d', '[Demo] Showroom Limited', '[Demo] Showroom', 'restaurant',
   'Demo Owner', '+254700000884', 'demo@jobs.example', '88000000-0000-0000-0000-0000000000c1');

update public.merchant set status = 'live', went_live_at = now()
where id in ('88000000-0000-0000-0000-00000000000a', '88000000-0000-0000-0000-00000000000d');

insert into public.merchant_user (merchant_id, user_id, role) values
  ('88000000-0000-0000-0000-00000000000a', '88000000-0000-0000-0000-0000000000a1', 'owner'),
  ('88000000-0000-0000-0000-00000000000a', '88000000-0000-0000-0000-0000000000a2', 'manager'),
  ('88000000-0000-0000-0000-00000000000b', '88000000-0000-0000-0000-0000000000b1', 'owner'),
  ('88000000-0000-0000-0000-00000000000d', '88000000-0000-0000-0000-0000000000d1', 'owner');

/* An open job of A with a known id, and a draft of B. */
insert into public.vacancy (
  id, merchant_id, title, category, job_type, city_id, area,
  salary_min, salary_max, salary_period, description, status, posted_at
)
values
  ('88000000-0000-0000-0000-0000000000f1', '88000000-0000-0000-0000-00000000000a',
   'Test waiter 88', 'food_beverage', 'part_time', '88000000-0000-0000-0000-0000000000c1',
   'Westlands', 1200, 1500, 'shift', 'Serve tables over the weekend lunch and dinner shifts.',
   'open', now()),
  ('88000000-0000-0000-0000-0000000000f2', '88000000-0000-0000-0000-00000000000b',
   'Test baker 88', 'food_beverage', 'full_time', '88000000-0000-0000-0000-0000000000c1',
   null, null, null, null, 'Bake bread before dawn, six days a week.', 'draft', null);

/* A member of staff: the seeded super admin, looked up while auth.users can
   still be read. */
select set_config('test.staff_id',
  (select id::text from auth.users where email = 'dev.admin@nexgapp.com'), true);

/* The first job seeker's uploaded CV, and a file in the second one's folder. */
insert into storage.objects (bucket_id, name, owner) values
  ('careers-cv', '88000000-0000-0000-0000-0000000000e1/cv.pdf', '88000000-0000-0000-0000-0000000000e1'),
  ('careers-cv', '88000000-0000-0000-0000-0000000000e2/cv.pdf', '88000000-0000-0000-0000-0000000000e2');

-- ------------------------------------------------- somebody off the team

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_vacancy_save('88000000-0000-0000-0000-00000000000a', 'Test line cook 88',
      'food_beverage', 'full_time', '88000000-0000-0000-0000-0000000000c1',
      'Cook on the line for lunch and dinner service.')$$,
  '42501', 'Only the people who hire for this business can post its jobs.',
  'Somebody who is not on the business''s team cannot post its jobs');

-- ------------------------------------------------- the owner of a live business

select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_vacancy_save('88000000-0000-0000-0000-00000000000a', 'Test line cook 88',
      'food_beverage', 'full_time', '88000000-0000-0000-0000-0000000000c2',
      'Cook on the line for lunch and dinner service.')$$,
  '23514', 'Pick a city NexG works in.',
  'A job goes in a city NexG works in');

select throws_ok(
  $$select public.rpc_vacancy_save('88000000-0000-0000-0000-00000000000a', 'Test line cook 88',
      'food_beverage', 'full_time', '88000000-0000-0000-0000-0000000000c1',
      'Cook on the line for lunch and dinner service.',
      p_salary_min => 50000, p_salary_max => 40000, p_salary_period => 'month')$$,
  '23514', 'The lowest pay is more than the highest.',
  'A pay range runs from low to high');

select throws_ok(
  $$select public.rpc_vacancy_save('88000000-0000-0000-0000-00000000000a', 'Test line cook 88',
      'food_beverage', 'full_time', '88000000-0000-0000-0000-0000000000c1',
      'Cook on the line for lunch and dinner service.', p_salary_min => 50000)$$,
  '23514', 'Say whether the pay is per hour, day, shift, week or month.',
  'Pay says what period it is for');

select lives_ok(
  $$select public.rpc_vacancy_save('88000000-0000-0000-0000-00000000000a', 'Test line cook 88',
      'food_beverage', 'full_time', '88000000-0000-0000-0000-0000000000c1',
      'Cook on the line for lunch and dinner service.', p_area => 'Kilimani')$$,
  'The owner saves a job');

select is(
  (select status from public.vacancy where title = 'Test line cook 88'),
  'draft',
  'A new job is a draft until it is published');

select lives_ok(
  $$select public.rpc_vacancy_save('88000000-0000-0000-0000-00000000000a', 'Test line cook 88',
      'food_beverage', 'full_time', '88000000-0000-0000-0000-0000000000c1',
      'Cook on the line for lunch and dinner service.',
      p_vacancy_id => (select id from public.vacancy where title = 'Test line cook 88'),
      p_area => 'Kilimani', p_salary_min => 40000, p_salary_max => 55000,
      p_salary_period => 'month', p_publish => true)$$,
  'The owner publishes it');

select ok(
  (select status = 'open' and posted_at is not null from public.vacancy where title = 'Test line cook 88'),
  'Publishing opens it and dates it');

-- ------------------------------------- a business NexG has not checked yet

select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_vacancy_save('88000000-0000-0000-0000-00000000000b', 'Test pastry chef 88',
      'food_beverage', 'full_time', '88000000-0000-0000-0000-0000000000c1',
      'Laminate dough and run the pastry section.', p_publish => true)$$,
  '23514',
  'Only verified businesses can publish jobs. NexG is still checking yours, so save this as a draft for now.',
  'A business NexG has not checked cannot publish');

select lives_ok(
  $$select public.rpc_vacancy_save('88000000-0000-0000-0000-00000000000b', 'Test pastry chef 88',
      'food_beverage', 'full_time', '88000000-0000-0000-0000-0000000000c1',
      'Laminate dough and run the pastry section.')$$,
  'but it can keep a draft');

-- ------------------------------------------------------------ a demo workspace

select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_vacancy_save('88000000-0000-0000-0000-00000000000d', 'Test demo job 88',
      'hospitality', 'gig', '88000000-0000-0000-0000-0000000000c1',
      'A job posted during a demonstration of the hiring board.', p_publish => true)$$,
  'A live demo workspace can publish while showing the feature');

-- ------------------------------------------------------------------ the public

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*)::integer from public.careers_board_v
    where title in ('Test line cook 88', 'Test waiter 88')),
  2,
  'The board shows the verified business''s open jobs');

select is(
  (select count(*)::integer from public.careers_board_v
    where title in ('Test baker 88', 'Test pastry chef 88', 'Test demo job 88')),
  0,
  'and not drafts, nor a demo workspace''s jobs');

select is(
  (select employer_name || ' · ' || area || ' · ' || salary_min || '–' || salary_max || ' per '
          || salary_period || ' · ' || job_type
     from public.careers_board_v where title = 'Test line cook 88'),
  'Alpha Kitchen · Kilimani · 40000–55000 per month · full_time',
  'A job shows its business, where it is, its pay and its type');

select throws_ok(
  $$select count(*) from public.vacancy$$,
  '42501', null,
  'The public cannot read the jobs table itself');

select ok(
  not has_function_privilege('anon', 'public.rpc_vacancy_apply(uuid, text, text, text, text, text, text)', 'execute'),
  'nor apply without an account');

-- ------------------------------------------------------------- applying

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-0000-0000-0000000000e1","role":"authenticated","is_anonymous":true}', true);

select throws_ok(
  $$select public.rpc_vacancy_apply('88000000-0000-0000-0000-0000000000f1', 'Amani Otieno',
      'amani@jobs.example')$$,
  '42501', 'Sign in to apply.',
  'An anonymous session cannot apply');

select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_vacancy_apply('88000000-0000-0000-0000-0000000000f1', 'Amani Otieno',
      'amani@jobs.example', p_cv_path => '88000000-0000-0000-0000-0000000000e2/cv.pdf',
      p_cv_name => 'cv.pdf')$$,
  '23514', 'Your CV did not upload. Add it again.',
  'A job seeker cannot attach a file from somebody else''s folder');

select lives_ok(
  $$select public.rpc_vacancy_apply('88000000-0000-0000-0000-0000000000f1', 'Amani Otieno',
      'Amani@Jobs.example', p_phone => '+254700000999',
      p_note => 'Two years waiting tables in Westlands.',
      p_cv_path => '88000000-0000-0000-0000-0000000000e1/cv.pdf', p_cv_name => 'Amani CV.pdf')$$,
  'A signed-in job seeker applies with their CV');

select throws_ok(
  $$select public.rpc_vacancy_apply('88000000-0000-0000-0000-0000000000f1', 'Amani Otieno',
      'amani@jobs.example')$$,
  '23514', 'You have already applied for this job.',
  'and cannot apply twice');

select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.vacancy_application),
  0,
  'Another job seeker sees nobody else''s applications');

select is(
  authz.business_reads_cv('88000000-0000-0000-0000-0000000000e1/cv.pdf'),
  false,
  'nor their CV');

-- ------------------------------------------------------ the business hires

select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

select is(
  (select full_name || ' · ' || email from public.vacancy_application
    where vacancy_id = '88000000-0000-0000-0000-0000000000f1'),
  'Amani Otieno · amani@jobs.example',
  'The business''s manager sees the applicant');

select is(
  authz.business_reads_cv('88000000-0000-0000-0000-0000000000e1/cv.pdf'),
  true,
  'and can open their CV');

select throws_ok(
  $$select public.rpc_vacancy_application_update(
      (select id from public.vacancy_application where vacancy_id = '88000000-0000-0000-0000-0000000000f1'),
      'interview')$$,
  '23514', 'Pick a date and time for the interview.',
  'An interview needs a time');

select lives_ok(
  $$select public.rpc_vacancy_application_update(
      (select id from public.vacancy_application where vacancy_id = '88000000-0000-0000-0000-0000000000f1'),
      'interview', 'Bring your ID.', now() + interval '2 days')$$,
  'The manager invites the applicant to interview');

-- ----------------------------------------------- the applicant, afterwards

select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

select is(
  (select status || ' · ' || employer_name || ' · ' || employer_note
     from public.my_job_applications_v where vacancy_id = '88000000-0000-0000-0000-0000000000f1'),
  'interview · Alpha Kitchen · Bring your ID.',
  'The applicant sees they are invited to interview, with the business''s message');

select lives_ok(
  $$insert into public.vacancy_saved (user_id, vacancy_id)
    values ('88000000-0000-0000-0000-0000000000e1', '88000000-0000-0000-0000-0000000000f1')$$,
  'A job seeker saves a job');

select throws_ok(
  $$insert into public.vacancy_saved (user_id, vacancy_id)
    values ('88000000-0000-0000-0000-0000000000e1', '88000000-0000-0000-0000-0000000000f2')$$,
  '42501', null,
  'but not a draft');

select is(
  (select title || ' · ' || still_open::text from public.my_saved_jobs_v),
  'Test waiter 88 · true',
  'Their saved jobs are listed');

select lives_ok(
  $$select public.rpc_vacancy_application_withdraw(
      (select id from public.vacancy_application where vacancy_id = '88000000-0000-0000-0000-0000000000f1'))$$,
  'The applicant withdraws');

select is(
  (select status || coalesce(' ' || cv_path, ' and no CV') from public.vacancy_application
    where vacancy_id = '88000000-0000-0000-0000-0000000000f1'),
  'withdrawn and no CV',
  'Withdrawing takes the CV with it');

select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is(
  authz.business_reads_cv('88000000-0000-0000-0000-0000000000e1/cv.pdf'),
  false,
  'so the business can no longer open it');

select throws_ok(
  $$select public.rpc_vacancy_application_update(
      (select id from public.vacancy_application where vacancy_id = '88000000-0000-0000-0000-0000000000f1'),
      'shortlisted')$$,
  '23514', 'The applicant withdrew this application.',
  'nor move a withdrawn application on');

select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_vacancy_apply('88000000-0000-0000-0000-0000000000f1', 'Amani Otieno',
      'amani@jobs.example')$$,
  'Having withdrawn, the applicant can apply again');

select is(
  (select status from public.my_job_applications_v where vacancy_id = '88000000-0000-0000-0000-0000000000f1'),
  'submitted',
  'and the application starts afresh');

-- ------------------------------------------------------------------ staff

select set_config('request.jwt.claims', json_build_object(
  'sub', current_setting('test.staff_id'), 'role', 'authenticated')::text, true);

select throws_ok(
  $$select public.rpc_vacancy_set_status('88000000-0000-0000-0000-0000000000f1', 'closed')$$,
  '23514', 'Say why the job is coming down.',
  'Staff taking a job down say why');

select lives_ok(
  $$select public.rpc_vacancy_set_status('88000000-0000-0000-0000-0000000000f1', 'closed',
      'Asks applicants to pay a fee')$$,
  'Staff take a job down');

select throws_ok(
  $$select public.rpc_vacancy_set_status('88000000-0000-0000-0000-0000000000f1', 'open')$$,
  '42501', 'Staff can take a job down. Only the business can put it up.',
  'but cannot put one up');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*)::integer from public.careers_board_v where id = '88000000-0000-0000-0000-0000000000f1'),
  0,
  'A job taken down leaves the board');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"88000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

/* Since 20261225000100 a take-down sticks until staff lift it (test 89). */
select throws_ok(
  $$select public.rpc_vacancy_set_status('88000000-0000-0000-0000-0000000000f1', 'open')$$,
  '23514', 'NexG took this job down. Contact NexG to have it put back up.',
  'and the business cannot put it straight back up');

reset role;

-- --------------------------------------------------- bells, emails and audit

select is(
  (select count(*)::integer from public.user_notification
    where kind = 'merchant.vacancy_application'
      and object_id = '88000000-0000-0000-0000-0000000000f1'
      and user_id in ('88000000-0000-0000-0000-0000000000a1', '88000000-0000-0000-0000-0000000000a2')),
  2,
  'Everybody who hires for the business is rung, one bell each for the job');

select ok(
  (select body like 'Alpha Kitchen invited you to an interview on % at %. They wrote “Bring your ID.”'
     from public.user_notification
    where kind = 'careers.application_update' and user_id = '88000000-0000-0000-0000-0000000000e1'),
  'The applicant is told when the interview is, with the business''s message');

select is(
  (select count(*)::integer from public.notification_email_kind
    where kind in ('merchant.vacancy_application', 'careers.application_update')),
  2,
  'Both bells are emailed too');

select is(
  (select count(distinct action)::integer from audit.audit_event
    where action in ('merchant.vacancy_saved', 'careers.vacancy_taken_down',
                     'merchant.job_application_updated', 'careers.vacancy_applied',
                     'careers.vacancy_application_withdrawn')),
  5,
  'Every step is in the audit log');

select is(
  (select count(*)::integer from public.fn_wiring_check() where finding ~ '(vacanc|careers)'),
  0,
  'and the wiring check finds nothing to fix');

select * from finish();
rollback;
