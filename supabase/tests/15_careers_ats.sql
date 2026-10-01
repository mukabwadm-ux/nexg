-- Careers ATS · the two promises printed on the public page.
--
--   "If it's a no, you'll hear it from a person, with a reason."
--   "Five steps, about two weeks."
--
-- Everything below is one of those sentences, or one of the boundaries
-- that keeps candidate data away from staff who have no business in it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

delete from public.role_grant;
delete from public.staff_user;

/* The local seed publishes a set of roles so the console has
   something to draw. This suite builds its own, so it starts from an
   empty board. */
delete from hr.application;
delete from hr.candidate;
delete from hr.job where not is_general;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','c1111111-1111-1111-1111-111111111111',
   'authenticated','authenticated','rec@nexgapp.com','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','c2222222-2222-2222-2222-222222222222',
   'authenticated','authenticated','panelA@nexgapp.com','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','c3333333-3333-3333-3333-333333333333',
   'authenticated','authenticated','panelB@nexgapp.com','',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','c4444444-4444-4444-4444-444444444444',
   'authenticated','authenticated','merchops@nexgapp.com','',now(),now(),now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('cccc0000-0000-0000-0000-00000000000a','c1111111-1111-1111-1111-111111111111','rec@nexgapp.com','Recruiter'),
  ('cccc0000-0000-0000-0000-00000000000b','c2222222-2222-2222-2222-222222222222','panelA@nexgapp.com','Panel A'),
  ('cccc0000-0000-0000-0000-00000000000c','c3333333-3333-3333-3333-333333333333','panelB@nexgapp.com','Panel B'),
  ('cccc0000-0000-0000-0000-00000000000d','c4444444-4444-4444-4444-444444444444','merchops@nexgapp.com','Merch Ops');

insert into public.role_grant (staff_user_id, role_id, granted_by) values
  ('cccc0000-0000-0000-0000-00000000000a',
   (select id from public.role where key='recruiter'),'cccc0000-0000-0000-0000-00000000000a'),
  ('cccc0000-0000-0000-0000-00000000000b',
   (select id from public.role where key='interviewer'),'cccc0000-0000-0000-0000-00000000000a'),
  ('cccc0000-0000-0000-0000-00000000000c',
   (select id from public.role where key='interviewer'),'cccc0000-0000-0000-0000-00000000000a'),
  ('cccc0000-0000-0000-0000-00000000000d',
   (select id from public.role where key='merchant_ops'),'cccc0000-0000-0000-0000-00000000000a');

insert into hr.job (id, slug, title, team_id, location_label, work_mode, contract,
                    status, openings, hiring_manager_id, description_md, stage_targets)
values ('cafe0000-0000-4000-8000-00000000000a','concierge-agent-night','Concierge Agent (Night Shift)',
        (select id from hr.team where name='Concierge & Operations'),
        'Nairobi · Shifts','on_site_shifts','full_time','open', 2,
        'cccc0000-0000-0000-0000-00000000000a','[Description]',
        '{"screening": 3, "intro_call": 5, "work_sample": 5, "team_conversation": 4, "offer": 7}'::jsonb);

insert into hr.job_question (id, job_id, sort, kind, prompt, must_value, flag_key)
values ('caff0000-0000-4000-8000-00000000000a','cafe0000-0000-4000-8000-00000000000a', 1,
        'must_yes_no','Can you work 22:00–06:00 shifts incl. weekends?','yes','nights');

insert into hr.job_question (id, job_id, sort, kind, prompt, threshold, flag_key)
values ('caff0000-0000-4000-8000-00000000000b','cafe0000-0000-4000-8000-00000000000a', 2,
        'points_number','Customer-facing experience (years)',
        '{"gte": 1, "points": 2}'::jsonb,'years');

-- ═══════════════════════════ "about two weeks", computed

select is(
  hr.fn_weeks_to_hire('{"screening":3,"intro_call":5,"work_sample":5,"team_conversation":4,"offer":7}'::jsonb),
  4,
  'the weeks are summed from the job''s own targets, not typed'
);

select is(
  (select weeks_to_hire from public.careers_jobs_v where slug = 'concierge-agent-night'),
  4,
  'and the public page reads the same number'
);

/* A draft or closed role is not a role anybody can apply to. */
update hr.job set status = 'draft' where slug = 'concierge-agent-night';

select is(
  (select count(*)::int from public.careers_jobs_v where slug = 'concierge-agent-night'),
  0,
  'a draft never appears on the careers page'
);

update hr.job set status = 'open' where slug = 'concierge-agent-night';

-- ═══════════════════════════════════════ applying

select is(
  ((select hr.rpc_apply(jsonb_build_object(
      'job_slug','concierge-agent-night',
      'full_name','[Applicant One]',
      'email','one@example.test',
      'phone','+254700000911',
      'answers', jsonb_build_object(
        'caff0000-0000-4000-8000-00000000000a','yes',
        'caff0000-0000-4000-8000-00000000000b','4')
    ))) ->> 'ok')::boolean,
  true,
  'somebody can apply'
);

select is(
  (select screening_score from hr.application a
   join hr.candidate c on c.id = a.candidate_id where c.email = 'one@example.test'),
  2,
  'the points question scores automatically'
);

select is(
  (select array_length(must_failed, 1) from hr.application a
   join hr.candidate c on c.id = a.candidate_id where c.email = 'one@example.test'),
  null,
  'and a satisfied must-have fails nothing'
);

/* The second applicant cannot do nights. */
select hr.rpc_apply(jsonb_build_object(
  'job_slug','concierge-agent-night',
  'full_name','[Applicant Two]',
  'email','two@example.test',
  'answers', jsonb_build_object(
    'caff0000-0000-4000-8000-00000000000a','no',
    'caff0000-0000-4000-8000-00000000000b','0')));

select is(
  (select must_failed[1] from hr.application a
   join hr.candidate c on c.id = a.candidate_id where c.email = 'two@example.test'),
  'caff0000-0000-4000-8000-00000000000a',
  'a failed must-have is recorded'
);

/*
 * And it only flags. The auto-score never rejects anybody — the card
 * goes red and a person reads it.
 */
select is(
  (select stage::text from hr.application a
   join hr.candidate c on c.id = a.candidate_id where c.email = 'two@example.test'),
  'new',
  'but the auto-flag does not reject anybody — a human decides'
);

select is(
  (select needs_action from hr.console_applicants_v v
   join hr.candidate c on c.id = v.candidate_id where c.email = 'two@example.test'),
  true,
  'it does put the card in front of somebody today'
);

/* Re-applying reopens rather than duplicating. */
select hr.rpc_apply(jsonb_build_object(
  'job_slug','concierge-agent-night','email','one@example.test',
  'answers', jsonb_build_object('caff0000-0000-4000-8000-00000000000a','yes')));

select is(
  (select count(*)::int from hr.application a
   join hr.candidate c on c.id = a.candidate_id where c.email = 'one@example.test'),
  1,
  're-applying reopens the same application rather than making a second'
);

-- ══════════════════════ "a reason, from a person"

set local role authenticated;
set local request.jwt.claims = '{"sub":"c1111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_like(
  $$ select hr.rpc_stage_move(
       (select a.id from hr.application a join hr.candidate c on c.id = a.candidate_id
        where c.email = 'two@example.test'), 'rejected') $$,
  '%needs a reason the candidate can read%',
  'a rejection without a reason is refused'
);

select throws_like(
  $$ select hr.rpc_stage_move(
       (select a.id from hr.application a join hr.candidate c on c.id = a.candidate_id
        where c.email = 'two@example.test'),
       'rejected', null, 'nights', 'You said you cannot work nights.') $$,
  '%goes out on a template%',
  'and a rejection without a template is refused too'
);

select lives_ok(
  $$ select hr.rpc_stage_move(
       (select a.id from hr.application a join hr.candidate c on c.id = a.candidate_id
        where c.email = 'two@example.test'),
       'rejected', null, 'nights',
       'This role is all night shifts and you said those would not work.',
       'screening_rejected_must') $$,
  'with both, the rejection goes through'
);

reset role;

select is(
  (select rejected_with_feedback_pct from hr.console_metrics_v
   where job_id = 'cafe0000-0000-4000-8000-00000000000a'),
  100.0,
  'and "rejected with feedback" stays at 100% — the number the promise is measured by'
);

/* The constraint, not just the RPC. Nothing can slip past it. */
select throws_ok(
  $$ update hr.application set stage = 'rejected'
     where id = (select a.id from hr.application a join hr.candidate c on c.id = a.candidate_id
                 where c.email = 'one@example.test') $$,
  23514,
  null,
  'even a plain update cannot reject somebody silently'
);

-- ═══════════════════════════ seven stages, five steps

select is(
  hr.fn_public_stage('new'),
  'Application received · under review',
  'a candidate is never told they are in a sub-state of triage'
);

select is(
  hr.fn_public_stage('screening'),
  hr.fn_public_stage('new'),
  'new and screening read identically'
);

select is(
  hr.fn_public_step('team_conversation'),
  4,
  'and the tracker lights the right one of the five'
);

-- ═══════════════════════════════ who sees a candidate

set local role authenticated;
set local request.jwt.claims = '{"sub":"c4444444-4444-4444-4444-444444444444","role":"authenticated"}';

select is(
  (select count(*)::int from hr.application),
  0,
  'merchant ops sees no candidates at all — not even a count'
);

/* An interviewer sees only their own panel. */
set local request.jwt.claims = '{"sub":"c2222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from hr.application),
  0,
  'and an interviewer with no panel sees nothing either'
);

reset role;

insert into hr.interview (application_id, kind, interviewers, status, scheduled_at)
select a.id, 'team_conversation',
       array['cccc0000-0000-0000-0000-00000000000b'::uuid,
             'cccc0000-0000-0000-0000-00000000000c'::uuid],
       'done', now() - interval '1 day'
from hr.application a join hr.candidate c on c.id = a.candidate_id
where c.email = 'one@example.test';

set local role authenticated;
set local request.jwt.claims = '{"sub":"c2222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from hr.application),
  1,
  'once on a panel, they see that one candidate'
);

select throws_like(
  $$ select hr.rpc_cv_path(
       (select id from hr.candidate where email = 'one@example.test')) $$,
  '%Only recruiters download a CV%',
  'but never the CV'
);

-- ═══════════════════════════════ blind feedback

reset role;

insert into hr.note (application_id, author_id, body, kind, visible_to)
select a.id, 'cccc0000-0000-0000-0000-00000000000c',
       'Panel B thinks yes.', 'interview_feedback', 'panel'
from hr.application a join hr.candidate c on c.id = a.candidate_id
where c.email = 'one@example.test';

set local role authenticated;
set local request.jwt.claims = '{"sub":"c2222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from hr.note where kind = 'interview_feedback'),
  0,
  'a panellist cannot read another''s write-up before submitting their own'
);

select lives_ok(
  $$ select hr.rpc_note_add(
       (select a.id from hr.application a join hr.candidate c on c.id = a.candidate_id
        where c.email = 'one@example.test'),
       'Panel A thinks yes too.', 'interview_feedback') $$,
  'they submit theirs'
);

select is(
  (select count(*)::int from hr.note where kind = 'interview_feedback'),
  2,
  'and only then can they see both'
);

select * from finish();
rollback;
