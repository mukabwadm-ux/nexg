-- Publishing is a precondition, not an invariant.
--
-- `job_open_is_complete` required an open job to have a hiring
-- manager. `hiring_manager_id` is `on delete set null`, so offboarding
-- a recruiter or a manager made every open role they owned violate the
-- constraint — the delete failed, and the only way to remove somebody
-- was to close their jobs first.
--
-- Needing somebody who decides is a condition of *publishing*, which
-- `rpc_job_status` now checks. A role that loses its manager later is
-- not invalid; it is a job that needs reassigning, and the console
-- says so. Enforcing it as a row invariant made an HR action fail with
-- a constraint error pointing at the wrong table.

alter table hr.job drop constraint if exists job_open_is_complete;

alter table hr.job
  add constraint job_open_is_complete check (
    status not in ('open', 'always_open')
    or (coalesce(trim(description_md), '') <> '' and location_label is not null)
  );

comment on constraint job_open_is_complete on hr.job is
  'A published role has something to read and somewhere to be. Who decides is checked at publish time by rpc_job_status, not held as an invariant — a manager leaving must not make their open roles unsaveable.';

/* Publishing still needs somebody who decides. */
create or replace function hr.rpc_job_status(
  p_job_id uuid,
  p_status hr.job_status,
  p_reason text default null
)
returns hr.job
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job hr.job;
  v_in_flight integer;
begin
  if not authz.is_recruiter() and not authz.manages_job(p_job_id) then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_job from hr.job where id = p_job_id;
  if v_job.id is null then
    raise exception 'No such job.' using errcode = 'no_data_found';
  end if;

  if p_status in ('open', 'always_open') then
    /* The general application is an inbox and has no manager by
       nature. Everything else needs one before it goes up. */
    if not v_job.is_general and v_job.hiring_manager_id is null then
      raise exception 'This role has no hiring manager. Somebody has to decide on the people who apply.'
        using errcode = 'check_violation';
    end if;
    if v_job.stage_targets is null or v_job.stage_targets = '{}'::jsonb then
      raise exception 'Set the stage targets first — the public page promises "about N weeks" from them.'
        using errcode = 'check_violation';
    end if;
  end if;

  if p_status = 'closed' then
    if coalesce(trim(coalesce(p_reason, '')), '') = '' then
      raise exception 'Say why it is closing — it goes in the audit log and shapes the emails.'
        using errcode = 'check_violation';
    end if;

    select count(*) into v_in_flight from hr.application
    where job_id = p_job_id and stage not in ('rejected', 'withdrawn', 'hired', 'on_file');

    if v_in_flight > 0 then
      raise exception 'There are still % people in this pipeline. Reject them with a reason or move them on file first — closing cannot leave anybody unanswered.',
        v_in_flight using errcode = 'check_violation';
    end if;
  end if;

  update hr.job set
    status = p_status,
    posted_at = case when p_status in ('open', 'always_open') then coalesce(posted_at, now())
                     else posted_at end,
    closed_at = case when p_status = 'closed' then now() end,
    closed_reason = case when p_status = 'closed' then trim(p_reason) else closed_reason end
  where id = p_job_id
  returning * into v_job;

  perform audit.log('staff'::public.actor_type, 'careers', 'job.' || p_status::text,
    p_target_type => 'job', p_target_id => p_job_id, p_reason => p_reason,
    p_city_id => v_job.city_id, p_severity => 'notice'::public.audit_severity);

  return v_job;
end;
$$;

grant execute on function hr.rpc_job_status(uuid, hr.job_status, text) to authenticated;

/*
 * So the console can say which open roles have lost their manager.
 *
 * Dropped and recreated rather than replaced: a new column in the
 * middle is a rename as far as CREATE OR REPLACE VIEW is concerned,
 * and it refuses.
 */
drop view if exists hr.console_jobs_v;

create view hr.console_jobs_v as
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
  (j.status in ('open', 'always_open') and not j.is_general and j.hiring_manager_id is null)
    as needs_a_manager,
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

grant select on hr.console_jobs_v to authenticated;
revoke all on hr.console_jobs_v from anon;
