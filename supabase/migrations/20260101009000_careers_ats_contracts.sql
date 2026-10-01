-- Careers ATS · read contracts and access.
--
-- Four audiences, four shapes of the same data:
--
--   anon reads careers_jobs_v and careers_job_v — open roles and
--   their public body, nothing about anybody who applied;
--   a candidate reaches their own row through a hashed token and sees
--   five stages, never seven, and never a note or a score;
--   a recruiter sees everything in the module;
--   an interviewer sees the people they are on a panel for, without a
--   CV, a phone number or a salary.
--
-- The last one is the reason this is a schema rather than a prefix.

-- ═══════════════════════════════════════════════ authz

create or replace function authz.is_recruiter()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_super_admin()
      or authz.has_role('recruiter', null)
      or authz.has_role('hr', null)
$$;

/* The manager for this particular job, and nobody else's. */
create or replace function authz.manages_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from hr.job j
    join public.staff_user su on su.id = j.hiring_manager_id
    where j.id = p_job_id and su.user_id = (select auth.uid())
  )
$$;

/* On the panel for this application, and nothing beyond it. */
create or replace function authz.interviews_application(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from hr.interview i
    join public.staff_user su on su.id = any (i.interviewers)
    where i.application_id = p_application_id
      and su.user_id = (select auth.uid())
  )
$$;

create or replace function authz.sees_application(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_recruiter()
      or exists (select 1 from hr.application a
                 where a.id = p_application_id and authz.manages_job(a.job_id))
      or authz.interviews_application(p_application_id)
$$;

grant execute on function authz.is_recruiter() to authenticated, service_role;
grant execute on function authz.manages_job(uuid) to authenticated, service_role;
grant execute on function authz.interviews_application(uuid) to authenticated, service_role;
grant execute on function authz.sees_application(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════ helpers

/*
 * "Five steps, about two weeks."
 *
 * Summed from the job's own targets and rounded up, so the page can
 * never promise a fortnight while the pipeline is set to six weeks.
 */
create or replace function hr.fn_weeks_to_hire(p_targets jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select ceil(
    (coalesce((p_targets ->> 'screening')::numeric, 0)
     + coalesce((p_targets ->> 'intro_call')::numeric, 0)
     + coalesce((p_targets ->> 'work_sample')::numeric, 0)
     + coalesce((p_targets ->> 'team_conversation')::numeric, 0)
     + coalesce((p_targets ->> 'offer')::numeric, 0)) / 7
  )::integer
$$;

/* What a candidate is told their stage is. Seven become five. */
create or replace function hr.fn_public_stage(p_stage hr.stage)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_stage
    when 'new' then 'Application received · under review'
    when 'screening' then 'Application received · under review'
    when 'intro_call' then 'Intro call'
    when 'work_sample' then 'Work sample'
    when 'team_conversation' then 'Team conversation'
    when 'offer' then 'Offer'
    when 'hired' then 'Offer accepted'
    when 'on_file' then 'On file'
    when 'rejected' then 'Not taken forward'
    when 'withdrawn' then 'Withdrawn'
  end
$$;

/* Which of the five public steps is lit, 1-indexed. */
create or replace function hr.fn_public_step(p_stage hr.stage)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_stage
    when 'new' then 1
    when 'screening' then 1
    when 'intro_call' then 2
    when 'work_sample' then 3
    when 'team_conversation' then 4
    when 'offer' then 5
    when 'hired' then 5
    else null
  end
$$;

/*
 * Everything that means somebody has to do something today. The
 * sidebar badge, the "Needs action" chips and the daily digest all
 * read this one function, so they cannot disagree about what is late.
 */
create or replace function hr.fn_needs_action(p_application_id uuid)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  a hr.application;
  j hr.job;
  v_target integer;
  v_days integer;
begin
  select * into a from hr.application where id = p_application_id;
  if a.id is null or a.stage in ('rejected', 'withdrawn', 'hired', 'on_file') then
    return false;
  end if;

  select * into j from hr.job where id = a.job_id;
  v_days := floor(extract(epoch from (now() - a.stage_entered_at)) / 86400)::integer;

  /* New and unread for three days. */
  if a.stage = 'new' and v_days > 3 then
    return true;
  end if;

  /* A failed must-have waiting on a person. The auto-flag never
     rejects anybody; it only asks. */
  if array_length(a.must_failed, 1) > 0 and a.stage in ('new', 'screening') then
    return true;
  end if;

  /* An interview happened and nobody wrote it up. */
  if exists (
    select 1 from hr.interview i
    where i.application_id = a.id
      and i.status = 'done'
      and i.scheduled_at < now() - interval '2 days'
      and not exists (select 1 from hr.note n
                      where n.interview_id = i.id and n.kind = 'interview_feedback')
  ) then
    return true;
  end if;

  /* A work sample sitting unread. Somebody spent three hours on it. */
  if exists (
    select 1 from hr.work_sample w
    where w.application_id = a.id
      and w.submitted_at is not null
      and w.score is null
      and w.submitted_at < now() - interval '2 days'
  ) then
    return true;
  end if;

  if exists (
    select 1 from hr.offer o
    where o.application_id = a.id and o.status = 'awaiting_approval'
  ) then
    return true;
  end if;

  /* Past the target for its stage. */
  v_target := (j.stage_targets ->> a.stage::text)::integer;
  if v_target is not null and v_days > v_target then
    return true;
  end if;

  return false;
end;
$$;

-- ═══════════════════════════════════ what the public reads

create or replace view public.careers_jobs_v
with (security_invoker = false) as
select
  j.slug,
  j.title,
  t.name as team_name,
  t.blurb as team_blurb,
  j.location_label,
  j.work_mode,
  j.contract,
  j.city_id,
  c.name as city_name,
  /* The range only when somebody chose to publish it. */
  case when j.salary_public then j.salary_min end as salary_min,
  case when j.salary_public then j.salary_max end as salary_max,
  j.salary_currency,
  j.posted_at,
  j.is_general,
  j.status,
  hr.fn_weeks_to_hire(j.stage_targets) as weeks_to_hire
from hr.job j
left join hr.team t on t.id = j.team_id
left join public.city c on c.id = j.city_id
where j.status in ('open', 'always_open');

grant select on public.careers_jobs_v to anon, authenticated;

comment on view public.careers_jobs_v is
  'Open roles only. A draft, paused or closed job is absent — the public page cannot list something nobody can apply to.';

create or replace view public.careers_job_v
with (security_invoker = false) as
select
  j.slug,
  j.title,
  t.name as team_name,
  t.blurb as team_blurb,
  j.location_label,
  j.work_mode,
  j.contract,
  j.city_id,
  c.name as city_name,
  case when j.salary_public then j.salary_min end as salary_min,
  case when j.salary_public then j.salary_max end as salary_max,
  j.salary_currency,
  j.salary_public,
  j.description_md,
  j.responsibilities_md,
  j.requirements_md,
  j.nice_to_have_md,
  j.benefits_md,
  /* The candidate-facing half only. The marking brief stays inside. */
  j.work_sample_candidate_md,
  j.work_sample_paid,
  j.work_sample_pay_note,
  j.stage_targets,
  hr.fn_weeks_to_hire(j.stage_targets) as weeks_to_hire,
  j.posted_at,
  j.closes_at,
  j.is_general,
  j.openings,
  (select su.display_name from public.staff_user su where su.id = j.hiring_manager_id)
    as hiring_manager_name,
  (select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'kind', q.kind, 'prompt', q.prompt, 'options', q.options,
      'must', q.kind = 'must_yes_no') order by q.sort), '[]'::jsonb)
   from hr.job_question q where q.job_id = j.id and q.public) as questions
from hr.job j
left join hr.team t on t.id = j.team_id
left join public.city c on c.id = j.city_id
where j.status in ('open', 'always_open');

grant select on public.careers_job_v to anon, authenticated;

comment on view public.careers_job_v is
  'One job''s public body. Carries work_sample_candidate_md and never work_sample_internal_md — the brief a panel marks against is not something an applicant should read.';

create or replace view public.careers_teams_v
with (security_invoker = false) as
select
  t.id,
  t.name,
  t.blurb,
  t.sort,
  (select count(*) from hr.job j
    where j.team_id = t.id and j.status = 'open') as open_roles
from hr.team t;

grant select on public.careers_teams_v to anon, authenticated;

-- ═══════════════════════════════════════════ the console

create or replace view hr.console_jobs_v as
select
  j.id,
  j.slug,
  j.title,
  j.team_id,
  t.name as team_name,
  j.city_id,
  c.name as city_name,
  j.location_label,
  j.work_mode,
  j.contract,
  j.status,
  j.openings,
  j.salary_min,
  j.salary_max,
  j.salary_public,
  j.posted_at,
  j.closes_at,
  j.is_general,
  j.stage_targets,
  (select su.display_name from public.staff_user su where su.id = j.hiring_manager_id)
    as hiring_manager_name,
  (select count(*) from hr.application a where a.job_id = j.id) as total_applicants,
  (select count(*) from hr.application a where a.job_id = j.id and a.stage = 'new') as new_applicants,
  (select count(*) from hr.application a
    where a.job_id = j.id
      and a.stage = 'new'
      and a.stage_entered_at < now() - interval '3 days') as unreviewed_over_3d,
  (select count(*) from hr.application a
    where a.job_id = j.id
      and a.stage in ('intro_call', 'work_sample', 'team_conversation')) as in_interviews,
  (select count(*) from hr.application a where a.job_id = j.id and a.stage = 'offer') as offers,
  (select count(*) from hr.application a
    where a.job_id = j.id and a.created_at > now() - interval '7 days') as new_this_week
from hr.job j
left join hr.team t on t.id = j.team_id
left join public.city c on c.id = j.city_id;

create or replace view hr.console_applicants_v as
select
  a.id,
  a.job_id,
  j.title as job_title,
  j.slug as job_slug,
  a.candidate_id,
  /* Anonymised rows keep their shape so the funnel still adds up. */
  case when cd.anonymised_at is not null then '[Anonymised]' else cd.full_name end as full_name,
  case when cd.anonymised_at is not null then null
       else public.fn_mask_phone(cd.phone) end as phone_masked,
  case when cd.anonymised_at is not null then null
       else '•••@' || split_part(cd.email, '@', 2) end as email_masked,
  cd.city,
  cd.anonymised_at,
  cd.talent_pool_opt_in,
  (cd.cv_path is not null) as has_cv,
  a.stage,
  hr.fn_public_stage(a.stage) as public_stage,
  a.stage_entered_at,
  floor(extract(epoch from (now() - a.stage_entered_at)) / 86400)::integer as days_in_stage,
  (j.stage_targets ->> a.stage::text)::integer as stage_target_days,
  a.source,
  a.source_detail,
  a.screening_score,
  a.screening_max,
  a.must_failed,
  a.flags,
  a.why_nexg,
  a.created_at,
  a.rejected_reason_code,
  a.rejected_reason_text,
  a.on_file_until,
  a.start_date,
  (select su.display_name from public.staff_user su where su.id = a.owner_id) as owner_name,
  hr.fn_needs_action(a.id) as needs_action,
  (select count(*) from hr.note n where n.application_id = a.id) as note_count,
  (select w.score from hr.work_sample w where w.application_id = a.id) as work_sample_score,
  (select w.hours_reported from hr.work_sample w where w.application_id = a.id)
    as work_sample_hours,
  (select w.payment_status from hr.work_sample w where w.application_id = a.id)
    as work_sample_payment
from hr.application a
join hr.job j on j.id = a.job_id
join hr.candidate cd on cd.id = a.candidate_id;

comment on view hr.console_applicants_v is
  'Phone and email are masked here, not in the component — a surface cannot leak what it was never handed. Revealing either is an RPC that logs the reason.';

create or replace view hr.console_metrics_v as
select
  j.id as job_id,
  (select count(*) from hr.application a
    where a.job_id = j.id
      and a.stage not in ('rejected', 'withdrawn', 'hired', 'on_file')) as in_pipeline,
  (select count(*) from hr.application a where a.job_id = j.id and a.stage = 'new') as new_count,
  (select count(*) from hr.application a
    where a.job_id = j.id and hr.fn_needs_action(a.id)) as needs_action,
  (select count(*) from hr.application a where a.job_id = j.id and a.stage = 'rejected')
    as rejected_count,
  (select round(avg(a.screening_score), 1) from hr.application a
    where a.job_id = j.id and a.screening_score is not null) as avg_score,
  (select round(avg(a.screening_max), 1) from hr.application a
    where a.job_id = j.id and a.screening_max is not null) as avg_max,
  /* Conversion only means something once somebody has applied. */
  (select case when count(*) filter (where true) > 0
     then round(100.0 * count(*) filter (where a.stage in ('offer', 'hired'))
                / count(*), 1) end
   from hr.application a where a.job_id = j.id) as new_to_offer_pct,
  (select percentile_cont(0.5) within group (
     order by floor(extract(epoch from (now() - a.stage_entered_at)) / 86400))
   from hr.application a
   where a.job_id = j.id
     and a.stage not in ('rejected', 'withdrawn', 'hired')) as median_days_in_stage,
  /*
   * The number the public promise is measured against. Null when
   * nobody has been rejected yet — 100% of nothing is not a claim.
   */
  (select case when count(*) > 0
     then round(100.0 * count(*) filter (
       where coalesce(trim(a.rejected_reason_text), '') <> '') / count(*), 1) end
   from hr.application a where a.job_id = j.id and a.stage = 'rejected')
    as rejected_with_feedback_pct
from hr.job j;

create or replace view hr.console_badges_v as
select
  (select count(*) from hr.job where status = 'open') as open_jobs,
  (select count(*) from hr.job where status = 'draft') as draft_jobs,
  (select count(*) from hr.application a where hr.fn_needs_action(a.id)) as needs_action,
  (select count(*) from hr.application where stage = 'new') as new_applications,
  (select count(*) from hr.application
    where stage = 'new' and stage_entered_at < now() - interval '3 days') as unreviewed,
  (select count(*) from hr.application
    where created_at > now() - interval '7 days') as applied_this_week,
  (select count(*) from hr.application where stage = 'on_file') as on_file,
  (select count(*) from hr.application where stage = 'hired') as hired,
  (select count(*) from hr.offer where status in ('sent', 'awaiting_approval')) as offers_open,
  /* Time to hire, measured rather than typed. Null until somebody has
     actually been hired. */
  (select round(avg(extract(epoch from (a.hired_at - a.created_at)) / 86400))
   from hr.application a
   where a.stage = 'hired' and a.hired_at > now() - interval '90 days') as time_to_hire_days,
  (select case when count(*) > 0
     then round(100.0 * count(*) filter (where status = 'accepted') / count(*)) end
   from hr.offer where status in ('sent', 'accepted', 'declined', 'expired'))
    as offer_acceptance_pct,
  (select count(*) from hr.offer where status in ('sent', 'accepted', 'declined', 'expired'))
    as offers_total,
  (select count(*) from hr.offer where status = 'declined') as offers_declined;

create or replace function hr.rpc_careers_counts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when authz.reaches_module('careers')
    then (select to_jsonb(b) from hr.console_badges_v b)
    else '{}'::jsonb end
$$;

grant execute on function hr.rpc_careers_counts() to authenticated;
grant execute on function hr.fn_needs_action(uuid) to authenticated, service_role;
grant execute on function hr.fn_weeks_to_hire(jsonb) to anon, authenticated, service_role;
grant execute on function hr.fn_public_stage(hr.stage) to authenticated, service_role;
grant execute on function hr.fn_public_step(hr.stage) to authenticated, service_role;

-- ═══════════════════════════════════════════════ security

do $$
declare
  t text;
begin
  foreach t in array array[
    'team', 'job', 'job_question', 'job_publish', 'candidate', 'application',
    'stage_event', 'note', 'interview', 'work_sample', 'reference_check', 'offer',
    'email_template', 'rejection_reason', 'email', 'setting', 'referral'
  ]
  loop
    execute format('revoke all on hr.%I from anon, authenticated', t);
    execute format('grant select on hr.%I to authenticated', t);
    execute format('alter table hr.%I enable row level security', t);
  end loop;
end;
$$;

/* Jobs and their furniture: anybody who reaches the module. */
create policy team_read on hr.team
  for select to authenticated using (authz.reaches_module('careers'));
create policy job_read on hr.job
  for select to authenticated using (authz.reaches_module('careers'));
create policy job_question_read on hr.job_question
  for select to authenticated using (authz.reaches_module('careers'));
create policy job_publish_read on hr.job_publish
  for select to authenticated using (authz.is_recruiter());
create policy template_read on hr.email_template
  for select to authenticated using (authz.is_recruiter());
create policy reason_read on hr.rejection_reason
  for select to authenticated using (authz.reaches_module('careers'));
create policy setting_read on hr.setting
  for select to authenticated using (authz.is_recruiter());
create policy referral_read on hr.referral
  for select to authenticated using (authz.is_recruiter());

/*
 * Candidates. A recruiter sees everyone; a hiring manager sees their
 * own job; an interviewer sees only the people they are sitting on a
 * panel for.
 */
create policy application_read on hr.application
  for select to authenticated using (authz.sees_application(id));

create policy candidate_read on hr.candidate
  for select to authenticated
  using (exists (select 1 from hr.application a
                 where a.candidate_id = hr.candidate.id and authz.sees_application(a.id)));

create policy stage_event_read on hr.stage_event
  for select to authenticated using (authz.sees_application(application_id));

create policy interview_read on hr.interview
  for select to authenticated using (authz.sees_application(application_id));

create policy work_sample_read on hr.work_sample
  for select to authenticated using (authz.sees_application(application_id));

create policy reference_read on hr.reference_check
  for select to authenticated using (authz.is_recruiter());

/* Salary is not an interviewer's business. */
create policy offer_read on hr.offer
  for select to authenticated
  using (authz.is_recruiter()
         or exists (select 1 from hr.application a
                    where a.id = hr.offer.application_id and authz.manages_job(a.job_id)));

/* Candidate correspondence likewise. */
create policy email_read on hr.email
  for select to authenticated
  using (authz.is_recruiter()
         or exists (select 1 from hr.application a
                    where a.id = hr.email.application_id and authz.manages_job(a.job_id)));

/*
 * Has the caller already written up this candidate?
 *
 * SECURITY DEFINER on purpose: the blind-feedback policy below needs
 * to read hr.note, and a policy on hr.note that queries hr.note
 * recurses forever. Running the lookup as the owner steps outside
 * RLS for that one question, which is safe because the only thing it
 * returns is a boolean about the caller's own row.
 */
create or replace function hr.fn_has_submitted_feedback(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from hr.note n
    where n.application_id = p_application_id
      and n.kind = 'interview_feedback'
      and n.author_id = authz.staff_id()
  )
$$;

grant execute on function hr.fn_has_submitted_feedback(uuid) to authenticated, service_role;

/*
 * Blind feedback. Somebody on a panel reads another panellist's
 * write-up only after submitting their own — otherwise the second
 * opinion is an echo of the first.
 */
create policy note_read on hr.note
  for select to authenticated
  using (
    authz.is_recruiter()
    or exists (select 1 from hr.application a
               where a.id = hr.note.application_id and authz.manages_job(a.job_id))
    or (
      authz.interviews_application(application_id)
      and (
        kind <> 'interview_feedback'
        or author_id = authz.staff_id()
        or not coalesce((select (value #>> '{}')::boolean from hr.setting
                         where key = 'blind_feedback'), true)
        or hr.fn_has_submitted_feedback(application_id)
      )
    )
  );

comment on policy note_read on hr.note is
  'Blind until you have written your own. A panel where the second person reads the first is a panel of one.';
