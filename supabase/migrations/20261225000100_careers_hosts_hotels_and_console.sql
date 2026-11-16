-- NexG Careers: hosts and hotels hire too, and staff run the board.
--
-- 20261224000100 let a business on NexG post jobs, but only a merchant. The
-- owner's brief names hotels and property hosts as well, so a job now
-- belongs to exactly one of a merchant, a host or a hotel:
--   - a host's account-wide members (owners and managers, not staff limited
--     to some units) hire for it, from the host workspace;
--   - a hotel's admins (not its desk or finance people) hire for it. Hotel
--     people reach NexG through the host workspace too.
-- A host publishes once it is live, and a hotel once it is a partner, the
-- way a merchant must be live. "[Demo] …" hosts and hotels stay off the
-- board like demo merchants.
--
-- Staff get the board in the console (console_vacancy_v and the Job board
-- module). Taking a job down now sticks: the business is told why and cannot
-- put it straight back up. Staff lift a take-down when it is resolved, and
-- the business can then open the job again.
--
-- Safe to run more than once.

-- ─────────────────────────────────────────────── a job's employer

alter table public.vacancy alter column merchant_id drop not null;
alter table public.vacancy add column if not exists host_id uuid references public.host (id) on delete cascade;
alter table public.vacancy add column if not exists hotel_id uuid references public.hotel (id) on delete cascade;

alter table public.vacancy drop constraint if exists vacancy_one_employer;
alter table public.vacancy add constraint vacancy_one_employer
  check (num_nonnulls(merchant_id, host_id, hotel_id) = 1);

create index if not exists vacancy_host_idx
  on public.vacancy (host_id, created_at desc) where host_id is not null;
create index if not exists vacancy_hotel_idx
  on public.vacancy (hotel_id, created_at desc) where hotel_id is not null;

/* A take-down by staff, with who and why. Only ever on a closed job. */
alter table public.vacancy add column if not exists taken_down_at timestamptz;
alter table public.vacancy add column if not exists taken_down_by uuid references auth.users (id) on delete set null;
alter table public.vacancy add column if not exists taken_down_reason text;

alter table public.vacancy drop constraint if exists vacancy_taken_down_is_closed;
alter table public.vacancy add constraint vacancy_taken_down_is_closed check (
  taken_down_at is null
  or (status = 'closed' and coalesce(trim(taken_down_reason), '') <> '')
);

comment on table public.vacancy is
  'A job a business on NexG (a merchant, a host or a hotel) advertises on /careers. Written only through the rpc_vacancy_* functions; the public reads careers_vacancy_v and careers_board_v, staff console_vacancy_v.';

-- ─────────────────────────────────────────────── who hires, who moderates

/* A host's account-wide members, signed in for real. */
create or replace function authz.host_hires(p_host_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not authz.is_anonymous_session() and authz.is_host_member(p_host_id)
$$;

/* A hotel's admins, signed in for real. */
create or replace function authz.hotel_hires(p_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not authz.is_anonymous_session() and authz.is_hotel_member(p_hotel_id, 'admin')
$$;

/* Whoever hires for a job's employer, whichever kind it is. */
create or replace function authz.employer_hires(p_merchant_id uuid, p_host_id uuid, p_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_merchant_id is not null then authz.merchant_hires(p_merchant_id)
    when p_host_id is not null then authz.host_hires(p_host_id)
    when p_hotel_id is not null then authz.hotel_hires(p_hotel_id)
    else false
  end
$$;

/* Staff who look after the board in a job's city: operations everywhere,
   merchant operations for merchants' jobs, and for hosts' and hotels' jobs
   the staff who already work hospitality there (authz.works_hospitality:
   partnerships and city leads). */
create or replace function authz.staff_moderates_jobs(p_merchant_id uuid, p_city_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_super_admin()
      or authz.has_role('ops_manager', p_city_id)
      or (p_merchant_id is not null and authz.has_role('merchant_ops', p_city_id))
      or (p_merchant_id is null and authz.works_hospitality(p_city_id))
$$;

revoke execute on function authz.host_hires(uuid) from public;
revoke execute on function authz.hotel_hires(uuid) from public;
revoke execute on function authz.employer_hires(uuid, uuid, uuid) from public;
revoke execute on function authz.staff_moderates_jobs(uuid, uuid) from public;
grant execute on function authz.host_hires(uuid) to authenticated, service_role;
grant execute on function authz.hotel_hires(uuid) to authenticated, service_role;
grant execute on function authz.employer_hires(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function authz.staff_moderates_jobs(uuid, uuid) to authenticated, service_role;

/* The people rung about a job's applicants: everybody on a merchant's
   team, a host's account-wide members, a hotel's admins. */
create or replace function public.fn_vacancy_hiring_team(p_vacancy_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select mu.user_id
  from public.vacancy v
  join public.merchant_user mu on mu.merchant_id = v.merchant_id
  where v.id = p_vacancy_id
  union
  select hu.user_id
  from public.vacancy v
  join public.host_user hu on hu.host_id = v.host_id and hu.units is null
  where v.id = p_vacancy_id
  union
  select hu.user_id
  from public.vacancy v
  join public.hotel_user hu on hu.hotel_id = v.hotel_id and hu.role = 'admin'
  where v.id = p_vacancy_id
$$;

revoke execute on function public.fn_vacancy_hiring_team(uuid) from public, anon, authenticated;
grant execute on function public.fn_vacancy_hiring_team(uuid) to service_role;

-- ──────────────────────────────────────────────────── row-level security

drop policy if exists vacancy_read_business on public.vacancy;
create policy vacancy_read_business on public.vacancy
  for select to authenticated
  using (authz.employer_hires(merchant_id, host_id, hotel_id)
         or authz.staff_moderates_jobs(merchant_id, city_id));

drop policy if exists vacancy_application_read_business on public.vacancy_application;
create policy vacancy_application_read_business on public.vacancy_application
  for select to authenticated
  using (exists (select 1 from public.vacancy v
                 where v.id = vacancy_application.vacancy_id
                   and authz.employer_hires(v.merchant_id, v.host_id, v.hotel_id)));

create or replace function authz.business_reads_cv(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vacancy_application a
    join public.vacancy v on v.id = a.vacancy_id
    where a.cv_path = p_path
      and a.status <> 'withdrawn'
      and (v.closed_at is null or v.closed_at > now() - interval '180 days')
      and authz.employer_hires(v.merchant_id, v.host_id, v.hotel_id)
  )
$$;

-- ──────────────────────────────────────────────────── what the public sees

create or replace view public.careers_vacancy_v
with (security_invoker = false) as
select
  v.id,
  v.title,
  v.category,
  v.job_type,
  v.city_id,
  c.name as city_name,
  c.slug as city_slug,
  c.currency,
  c.timezone,
  v.area,
  v.openings,
  v.salary_min,
  v.salary_max,
  v.salary_period,
  v.description,
  v.requirements,
  v.posted_at,
  v.closes_on,
  v.merchant_id,
  coalesce(m.trading_name, ho.display_name, ht.name, 'A host on NexG') as employer_name,
  m.cover_photo_path as employer_photo,
  coalesce(m.went_live_at, ho.went_live_at, ho.verified_at, ht.agreement_signed_at) as employer_verified_at,
  case when v.merchant_id is not null then 'merchant'
       when v.host_id is not null then 'host'
       else 'hotel' end as employer_kind,
  v.host_id,
  v.hotel_id
from public.vacancy v
join public.city c on c.id = v.city_id
left join public.merchant m on m.id = v.merchant_id
left join public.host ho on ho.id = v.host_id
left join public.hotel ht on ht.id = v.hotel_id
where v.status = 'open'
  and (v.closes_on is null or v.closes_on >= (now() at time zone c.timezone)::date)
  and (
    /* A live merchant that is not a demo workspace (the rule
       cron_holiday_reminders uses). */
    (v.merchant_id is not null
      and m.status = 'live'
      and m.deleted_at is null
      and m.trading_name not like '[Demo]%'
      and not exists (select 1 from public.category_config cc
                      cross join (values ('live'), ('new')) as k (kind)
                      where m.id = md5('demo-merchant-' || k.kind || '-' || cc.category::text)::uuid))
    /* A live host. */
    or (v.host_id is not null
      and ho.status = 'live'
      and coalesce(ho.display_name, '') not like '[Demo]%')
    /* A partner hotel. */
    or (v.hotel_id is not null
      and ht.status = 'partner'
      and ht.name not like '[Demo]%')
  );

comment on view public.careers_vacancy_v is
  'Open jobs of live merchants, live hosts and partner hotels (demos aside): the job page on /careers/jobs/[id], and what rpc_vacancy_apply accepts.';

create or replace view public.my_job_applications_v
with (security_invoker = false) as
select
  a.id,
  a.vacancy_id,
  a.status,
  a.employer_note,
  a.interview_at,
  a.status_changed_at,
  a.created_at,
  a.cv_name,
  v.title,
  v.job_type,
  v.area,
  coalesce(m.trading_name, ho.display_name, ht.name, 'A host on NexG') as employer_name,
  c.name as city_name,
  c.timezone,
  exists (select 1 from public.careers_vacancy_v o where o.id = v.id) as still_open
from public.vacancy_application a
join public.vacancy v on v.id = a.vacancy_id
join public.city c on c.id = v.city_id
left join public.merchant m on m.id = v.merchant_id
left join public.host ho on ho.id = v.host_id
left join public.hotel ht on ht.id = v.hotel_id
where a.user_id = (select auth.uid());

create or replace view public.my_saved_jobs_v
with (security_invoker = false) as
select
  s.vacancy_id,
  s.created_at as saved_at,
  v.title,
  v.job_type,
  v.area,
  v.salary_min,
  v.salary_max,
  v.salary_period,
  c.currency,
  coalesce(m.trading_name, ho.display_name, ht.name, 'A host on NexG') as employer_name,
  c.name as city_name,
  exists (select 1 from public.careers_vacancy_v o where o.id = v.id) as still_open
from public.vacancy_saved s
join public.vacancy v on v.id = s.vacancy_id
join public.city c on c.id = v.city_id
left join public.merchant m on m.id = v.merchant_id
left join public.host ho on ho.id = v.host_id
left join public.hotel ht on ht.id = v.hotel_id
where s.user_id = (select auth.uid());

-- ───────────────────────────────────────────────── what staff see

/* Every job in the cities the member of staff looks after, with its
   employer and how many people applied. Never the applicants themselves:
   their details are for the business they applied to. */
create or replace view public.console_vacancy_v
with (security_invoker = false) as
select
  v.id,
  v.title,
  v.category,
  v.job_type,
  v.status,
  v.city_id,
  c.name as city_name,
  c.currency,
  v.area,
  v.openings,
  v.salary_min,
  v.salary_max,
  v.salary_period,
  v.description,
  v.requirements,
  v.posted_at,
  v.closes_on,
  v.closed_at,
  v.created_at,
  v.updated_at,
  v.taken_down_at,
  v.taken_down_reason,
  case when v.merchant_id is not null then 'merchant'
       when v.host_id is not null then 'host'
       else 'hotel' end as employer_kind,
  coalesce(v.merchant_id, v.host_id, v.hotel_id) as employer_id,
  coalesce(m.trading_name, ho.display_name, ht.name, 'Unnamed host') as employer_name,
  coalesce(m.status::text, ho.status::text, ht.status::text) as employer_status,
  exists (select 1 from public.careers_vacancy_v o where o.id = v.id) as on_board,
  (select count(*) from public.vacancy_application a
    where a.vacancy_id = v.id and a.status <> 'withdrawn')::integer as applicants,
  (select count(*) from public.vacancy_application a
    where a.vacancy_id = v.id and a.status = 'submitted')::integer as applicants_new,
  (select count(*) from public.vacancy_application a
    where a.vacancy_id = v.id and a.status = 'hired')::integer as hired
from public.vacancy v
join public.city c on c.id = v.city_id
left join public.merchant m on m.id = v.merchant_id
left join public.host ho on ho.id = v.host_id
left join public.hotel ht on ht.id = v.hotel_id
where authz.staff_moderates_jobs(v.merchant_id, v.city_id);

comment on view public.console_vacancy_v is
  'The console''s Job board: every job in the caller''s cities with its employer and applicant counts, for staff who moderate jobs. Applicants'' details are not here.';

revoke all on public.console_vacancy_v from anon;
grant select on public.console_vacancy_v to authenticated;

insert into public.console_module (key, label, section, href, sort, icon)
values ('job_board', 'Job board', 'Partners', '/jobs', 57, 'Briefcase')
on conflict (key) do update
set label = excluded.label,
    section = excluded.section,
    href = excluded.href,
    sort = excluded.sort,
    icon = excluded.icon;

insert into public.role_module_access (role_key, module_key, level, note)
values
  ('super_admin', 'job_board', 'full', null),
  ('ops_manager', 'job_board', 'full', 'Take jobs down in their cities'),
  ('merchant_ops', 'job_board', 'full', 'Merchants'' jobs in their cities'),
  ('partnerships', 'job_board', 'full', 'Hosts'' and hotels'' jobs in their cities'),
  ('city_lead', 'job_board', 'full', 'Hosts'' and hotels'' jobs in their city')
on conflict (role_key, module_key) do update
set level = excluded.level,
    note = excluded.note;

-- ─────────────────────────────────── bells, emails and the audit registry

insert into public.notification_email_kind (kind, note) values
  ('careers.vacancy_taken_down', 'Business: NexG took one of its jobs down, or lifted that')
on conflict (kind) do nothing;

insert into audit.action_registry (action, module, default_severity, description) values
  ('careers.vacancy_saved', 'careers', 'info', 'A host or hotel created or edited a job post'),
  ('careers.vacancy_status_changed', 'careers', 'info', 'A host or hotel opened or closed one of its jobs'),
  ('careers.job_application_updated', 'careers', 'info', 'A host or hotel moved an applicant to another step'),
  ('careers.vacancy_taken_down', 'careers', 'notice', 'Staff took a job down from the board, with a reason'),
  ('careers.vacancy_takedown_lifted', 'careers', 'notice', 'Staff lifted a take-down, so the business can open the job again')
on conflict (action) do nothing;

-- ─────────────────────────────────────────────── an employer posts a job

create or replace function public.rpc_vacancy_save_for(
  p_employer text,
  p_employer_id uuid,
  p_title text,
  p_category text,
  p_job_type text,
  p_city_id uuid,
  p_description text,
  p_vacancy_id uuid default null,
  p_area text default null,
  p_openings integer default 1,
  p_salary_min integer default null,
  p_salary_max integer default null,
  p_salary_period text default null,
  p_requirements text default null,
  p_closes_on date default null,
  p_publish boolean default false
)
returns public.vacancy
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid := case when p_employer = 'merchant' then p_employer_id end;
  v_host_id uuid := case when p_employer = 'host' then p_employer_id end;
  v_hotel_id uuid := case when p_employer = 'hotel' then p_employer_id end;
  v_verified boolean;
  v_city public.city;
  v_old public.vacancy;
  v_row public.vacancy;
  v_status text;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_requirements text := nullif(trim(coalesce(p_requirements, '')), '');
  v_area text := nullif(trim(coalesce(p_area, '')), '');
  v_period text := nullif(trim(coalesce(p_salary_period, '')), '');
begin
  if p_employer is null or p_employer not in ('merchant', 'host', 'hotel') or p_employer_id is null then
    raise exception 'Say which business the job is for.' using errcode = '22023';
  end if;
  if not authz.employer_hires(v_merchant_id, v_host_id, v_hotel_id) then
    raise exception 'Only the people who hire for this business can post its jobs.'
      using errcode = '42501';
  end if;

  v_verified := case p_employer
    when 'merchant' then exists (select 1 from public.merchant m
                                 where m.id = p_employer_id and m.status = 'live')
    when 'host' then exists (select 1 from public.host h
                             where h.id = p_employer_id and h.status = 'live')
    else exists (select 1 from public.hotel h
                 where h.id = p_employer_id and h.status = 'partner')
  end;

  if p_vacancy_id is not null then
    select * into v_old from public.vacancy v
    where v.id = p_vacancy_id
      and v.merchant_id is not distinct from v_merchant_id
      and v.host_id is not distinct from v_host_id
      and v.hotel_id is not distinct from v_hotel_id
    for update;
    if v_old.id is null then
      raise exception 'That job is not one of yours.' using errcode = '42501';
    end if;
  end if;

  if v_title is null or length(v_title) < 3 then
    raise exception 'Give the job a title.' using errcode = 'check_violation';
  end if;
  if length(v_title) > 120 then
    raise exception 'Keep the title under 120 characters.' using errcode = 'check_violation';
  end if;
  if p_category is null or p_category not in (
       'hospitality', 'food_beverage', 'property', 'tourism_travel', 'logistics',
       'maintenance', 'cleaning', 'office_admin', 'retail', 'beauty_wellness', 'other') then
    raise exception 'Pick a category for the job.' using errcode = 'check_violation';
  end if;
  if p_job_type is null or p_job_type not in (
       'full_time', 'part_time', 'temporary', 'gig', 'internship') then
    raise exception 'Pick the type of job.' using errcode = 'check_violation';
  end if;

  select * into v_city from public.city
  where id = p_city_id and status in ('live', 'soft_launch');
  if v_city.id is null then
    raise exception 'Pick a city NexG works in.' using errcode = 'check_violation';
  end if;

  if v_area is not null and length(v_area) > 80 then
    raise exception 'Keep the area under 80 characters.' using errcode = 'check_violation';
  end if;
  if coalesce(p_openings, 1) not between 1 and 500 then
    raise exception 'Say how many people you are hiring, from 1 to 500.' using errcode = 'check_violation';
  end if;
  if v_description is null or length(v_description) < 20 then
    raise exception 'Describe the job in a few sentences.' using errcode = 'check_violation';
  end if;
  if length(v_description) > 6000 then
    raise exception 'Keep the description under 6,000 characters.' using errcode = 'check_violation';
  end if;
  if v_requirements is not null and length(v_requirements) > 4000 then
    raise exception 'Keep the requirements under 4,000 characters.' using errcode = 'check_violation';
  end if;

  if p_salary_min is null and p_salary_max is null then
    v_period := null;
  else
    if coalesce(p_salary_min, 1) <= 0 or coalesce(p_salary_max, 1) <= 0 then
      raise exception 'Pay must be more than zero.' using errcode = 'check_violation';
    end if;
    if p_salary_min is not null and p_salary_max is not null and p_salary_max < p_salary_min then
      raise exception 'The lowest pay is more than the highest.' using errcode = 'check_violation';
    end if;
    if v_period is null or v_period not in ('hour', 'day', 'shift', 'week', 'month') then
      raise exception 'Say whether the pay is per hour, day, shift, week or month.'
        using errcode = 'check_violation';
    end if;
  end if;

  v_status := case when p_publish then 'open' else coalesce(v_old.status, 'draft') end;

  if v_status = 'open' then
    if v_old.taken_down_at is not null then
      raise exception 'NexG took this job down. Contact NexG to have it put back up.'
        using errcode = 'check_violation';
    end if;
    if not v_verified then
      raise exception 'Only verified businesses can publish jobs. NexG is still checking yours, so save this as a draft for now.'
        using errcode = 'check_violation';
    end if;
    if p_closes_on is not null and p_closes_on < (now() at time zone v_city.timezone)::date then
      raise exception 'The closing date has passed.' using errcode = 'check_violation';
    end if;
  end if;

  if v_old.id is null then
    insert into public.vacancy (
      merchant_id, host_id, hotel_id, title, category, job_type, city_id, area, openings,
      salary_min, salary_max, salary_period, description, requirements,
      status, closes_on, posted_at, created_by
    )
    values (
      v_merchant_id, v_host_id, v_hotel_id, v_title, p_category, p_job_type, p_city_id, v_area,
      coalesce(p_openings, 1), p_salary_min, p_salary_max, v_period, v_description, v_requirements,
      v_status, p_closes_on, case when v_status = 'open' then now() end, (select auth.uid())
    )
    returning * into v_row;
  else
    update public.vacancy set
      title = v_title,
      category = p_category,
      job_type = p_job_type,
      city_id = p_city_id,
      area = v_area,
      openings = coalesce(p_openings, 1),
      salary_min = p_salary_min,
      salary_max = p_salary_max,
      salary_period = v_period,
      description = v_description,
      requirements = v_requirements,
      status = v_status,
      closes_on = p_closes_on,
      posted_at = case when v_status = 'open' then coalesce(posted_at, now()) else posted_at end,
      closed_at = case when v_status = 'open' then null else closed_at end,
      updated_at = now()
    where id = v_old.id
    returning * into v_row;
  end if;

  perform audit.log(
    case when p_employer = 'merchant' then 'merchant_user' else 'host_user' end::public.actor_type,
    case when p_employer = 'merchant' then 'merchants' else 'careers' end,
    case when p_employer = 'merchant' then 'merchant.vacancy_saved' else 'careers.vacancy_saved' end,
    p_target_type => 'vacancy', p_target_id => v_row.id,
    p_before => case when v_old.id is null then null
                     else jsonb_build_object('title', v_old.title, 'status', v_old.status) end,
    p_after => jsonb_build_object('employer', p_employer, 'employer_id', p_employer_id,
                                  'title', v_row.title, 'status', v_row.status,
                                  'job_type', v_row.job_type, 'category', v_row.category),
    p_city_id => v_row.city_id);

  return v_row;
end;
$$;

comment on function public.rpc_vacancy_save_for is
  'Creates or edits a job for a merchant, host or hotel (p_employer). p_publish puts it on the board, which needs the employer verified (a live merchant or host, a partner hotel) and no take-down in force; otherwise a new job is a draft and an existing one keeps its status.';

/* The merchant form's call, unchanged: a merchant's job. */
create or replace function public.rpc_vacancy_save(
  p_merchant_id uuid,
  p_title text,
  p_category text,
  p_job_type text,
  p_city_id uuid,
  p_description text,
  p_vacancy_id uuid default null,
  p_area text default null,
  p_openings integer default 1,
  p_salary_min integer default null,
  p_salary_max integer default null,
  p_salary_period text default null,
  p_requirements text default null,
  p_closes_on date default null,
  p_publish boolean default false
)
returns public.vacancy
language sql
security definer
set search_path = ''
as $$
  select public.rpc_vacancy_save_for(
    'merchant', p_merchant_id, p_title, p_category, p_job_type, p_city_id, p_description,
    p_vacancy_id, p_area, p_openings, p_salary_min, p_salary_max, p_salary_period,
    p_requirements, p_closes_on, p_publish)
$$;

-- ─────────────────────────────────────────── open, close or take a job down

create or replace function public.rpc_vacancy_set_status(
  p_vacancy_id uuid,
  p_status text,
  p_reason text default null
)
returns public.vacancy
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.vacancy;
  v_row public.vacancy;
  v_member boolean;
  v_staff boolean;
  v_verified boolean;
  v_timezone text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_kind text;
  u record;
begin
  select * into v_old from public.vacancy where id = p_vacancy_id for update;
  if v_old.id is null then
    raise exception 'That job is not one of yours.' using errcode = '42501';
  end if;

  v_kind := case when v_old.merchant_id is not null then 'merchant'
                 when v_old.host_id is not null then 'host' else 'hotel' end;
  v_member := authz.employer_hires(v_old.merchant_id, v_old.host_id, v_old.hotel_id);
  v_staff := not v_member and authz.staff_moderates_jobs(v_old.merchant_id, v_old.city_id);
  if not v_member and not v_staff then
    raise exception 'That job is not one of yours.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('open', 'closed') then
    raise exception 'A job is either open or closed.' using errcode = '22023';
  end if;
  if v_staff and p_status <> 'closed' then
    raise exception 'Staff can take a job down. Only the business can put it up.'
      using errcode = '42501';
  end if;
  if v_staff and v_reason is null then
    raise exception 'Say why the job is coming down.' using errcode = 'check_violation';
  end if;

  /* The business closing what is already closed, or opening what is open:
     nothing to do. A take-down of a job its business had closed still
     records the take-down. */
  if p_status = v_old.status and not (v_staff and v_old.taken_down_at is null) then
    return v_old;
  end if;

  if p_status = 'open' then
    if v_old.taken_down_at is not null then
      raise exception 'NexG took this job down. Contact NexG to have it put back up.'
        using errcode = 'check_violation';
    end if;
    v_verified := case v_kind
      when 'merchant' then exists (select 1 from public.merchant m
                                   where m.id = v_old.merchant_id and m.status = 'live')
      when 'host' then exists (select 1 from public.host h
                               where h.id = v_old.host_id and h.status = 'live')
      else exists (select 1 from public.hotel h where h.id = v_old.hotel_id and h.status = 'partner')
    end;
    if not v_verified then
      raise exception 'Only verified businesses can publish jobs. NexG is still checking yours, so keep this as a draft for now.'
        using errcode = 'check_violation';
    end if;
    select c.timezone into v_timezone from public.city c where c.id = v_old.city_id;
    if v_old.closes_on is not null and v_old.closes_on < (now() at time zone v_timezone)::date then
      raise exception 'The closing date has passed. Change it, then open the job again.'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.vacancy set
    status = p_status,
    posted_at = case when p_status = 'open' then coalesce(posted_at, now()) else posted_at end,
    closed_at = case when p_status = 'closed' then coalesce(closed_at, now()) else null end,
    taken_down_at = case when v_staff then now() else taken_down_at end,
    taken_down_by = case when v_staff then (select auth.uid()) else taken_down_by end,
    taken_down_reason = case when v_staff then v_reason else taken_down_reason end,
    updated_at = now()
  where id = v_old.id
  returning * into v_row;

  if v_staff then
    /* The business hears it from NexG, with the reason. */
    for u in select public.fn_vacancy_hiring_team(v_row.id) as user_id loop
      perform public.fn_notify_user(
        p_user_id => u.user_id, p_kind => 'careers.vacancy_taken_down',
        p_title => format('NexG took down %s', v_row.title),
        p_body => format('It is off the board. NexG’s reason is “%s”. Contact NexG support if you think this is wrong.', v_reason),
        p_href => case when v_kind = 'merchant' then '/merchant/hiring/' || v_row.id::text
                       else '/host?open=hiring/' || v_row.id::text end,
        p_tone => 'warning'::public.notification_tone,
        p_object_type => 'vacancy', p_object_id => v_row.id,
        p_tag => 'vacancy-takedown:' || v_row.id::text);
    end loop;

    perform audit.log(
      'staff'::public.actor_type, 'careers', 'careers.vacancy_taken_down',
      p_target_type => 'vacancy', p_target_id => v_row.id,
      p_before => jsonb_build_object('status', v_old.status),
      p_after => jsonb_build_object('status', v_row.status, 'title', v_row.title,
                                    'employer', v_kind),
      p_reason => v_reason,
      p_city_id => v_row.city_id);
  else
    perform audit.log(
      case when v_kind = 'merchant' then 'merchant_user' else 'host_user' end::public.actor_type,
      case when v_kind = 'merchant' then 'merchants' else 'careers' end,
      case when v_kind = 'merchant' then 'merchant.vacancy_status_changed'
           else 'careers.vacancy_status_changed' end,
      p_target_type => 'vacancy', p_target_id => v_row.id,
      p_before => jsonb_build_object('status', v_old.status),
      p_after => jsonb_build_object('status', v_row.status, 'title', v_row.title,
                                    'employer', v_kind),
      p_reason => v_reason,
      p_city_id => v_row.city_id);
  end if;

  return v_row;
end;
$$;

comment on function public.rpc_vacancy_set_status is
  'Opens or closes a job. The business does both (opening needs it verified and no take-down in force). Staff can only close one, with a reason: that is a take-down, which the business is told about and cannot undo itself.';

create or replace function public.rpc_vacancy_lift_takedown(p_vacancy_id uuid, p_reason text)
returns public.vacancy
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.vacancy;
  v_row public.vacancy;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  u record;
begin
  select * into v_old from public.vacancy where id = p_vacancy_id for update;
  if v_old.id is null or not authz.staff_moderates_jobs(v_old.merchant_id, v_old.city_id) then
    raise exception 'Only staff who look after this city''s jobs can lift a take-down.'
      using errcode = '42501';
  end if;
  if v_old.taken_down_at is null then
    raise exception 'This job was not taken down.' using errcode = 'check_violation';
  end if;
  if v_reason is null then
    raise exception 'Say why the take-down is lifted.' using errcode = 'check_violation';
  end if;

  update public.vacancy set
    taken_down_at = null,
    taken_down_by = null,
    taken_down_reason = null,
    updated_at = now()
  where id = v_old.id
  returning * into v_row;

  for u in select public.fn_vacancy_hiring_team(v_row.id) as user_id loop
    perform public.fn_notify_user(
      p_user_id => u.user_id, p_kind => 'careers.vacancy_taken_down',
      p_title => format('You can open %s again', v_row.title),
      p_body => 'NexG lifted its take-down. The job stays closed until you open it again.',
      p_href => case when v_row.merchant_id is not null then '/merchant/hiring/' || v_row.id::text
                     else '/host?open=hiring/' || v_row.id::text end,
      p_tone => 'good'::public.notification_tone,
      p_object_type => 'vacancy', p_object_id => v_row.id,
      p_tag => 'vacancy-takedown:' || v_row.id::text);
  end loop;

  perform audit.log(
    'staff'::public.actor_type, 'careers', 'careers.vacancy_takedown_lifted',
    p_target_type => 'vacancy', p_target_id => v_row.id,
    p_before => jsonb_build_object('taken_down_reason', v_old.taken_down_reason),
    p_after => jsonb_build_object('title', v_row.title),
    p_reason => v_reason,
    p_city_id => v_row.city_id);

  return v_row;
end;
$$;

comment on function public.rpc_vacancy_lift_takedown is
  'Staff lift a take-down, with a reason. The job stays closed; its business can open it again.';

-- ─────────────────────────────────────────────────────────── apply for a job

create or replace function public.rpc_vacancy_apply(
  p_vacancy_id uuid,
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_note text default null,
  p_cv_path text default null,
  p_cv_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_job public.careers_vacancy_v;
  v_existing public.vacancy_application;
  v_id uuid;
  v_recent integer;
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_cv_path text := nullif(trim(coalesce(p_cv_path, '')), '');
  v_cv_name text := nullif(trim(coalesce(p_cv_name, '')), '');
  u record;
begin
  if v_uid is null or authz.is_anonymous_session() then
    raise exception 'Sign in to apply.' using errcode = '42501';
  end if;

  select * into v_job from public.careers_vacancy_v where id = p_vacancy_id;
  if v_job.id is null then
    raise exception 'This job is no longer open.' using errcode = 'check_violation';
  end if;
  if (v_job.merchant_id is not null and authz.is_merchant_member(v_job.merchant_id))
     or (v_job.host_id is not null and exists (select 1 from public.host_user hu
                                               where hu.host_id = v_job.host_id and hu.user_id = v_uid))
     or (v_job.hotel_id is not null and exists (select 1 from public.hotel_user hu
                                                where hu.hotel_id = v_job.hotel_id and hu.user_id = v_uid)) then
    raise exception 'You are on this business''s team, so you cannot apply for its jobs.'
      using errcode = 'check_violation';
  end if;

  if v_name is null or length(v_name) < 2 then
    raise exception 'Enter your name.' using errcode = 'check_violation';
  end if;
  if length(v_name) > 120 then
    raise exception 'Keep your name under 120 characters.' using errcode = 'check_violation';
  end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.' using errcode = 'check_violation';
  end if;
  if v_phone is not null and length(v_phone) > 32 then
    raise exception 'That phone number is too long.' using errcode = 'check_violation';
  end if;
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'Keep your note under 2,000 characters.' using errcode = 'check_violation';
  end if;

  /* The CV must be a file this person uploaded, in their own folder. */
  if v_cv_path is not null then
    if split_part(v_cv_path, '/', 1) <> v_uid::text
       or not exists (select 1 from storage.objects o
                      where o.bucket_id = 'careers-cv' and o.name = v_cv_path) then
      raise exception 'Your CV did not upload. Add it again.' using errcode = 'check_violation';
    end if;
    v_cv_name := left(coalesce(v_cv_name, 'CV'), 200);
  else
    v_cv_name := null;
  end if;

  select * into v_existing from public.vacancy_application
  where vacancy_id = p_vacancy_id and user_id = v_uid
  for update;
  if v_existing.id is not null and v_existing.status <> 'withdrawn' then
    raise exception 'You have already applied for this job.' using errcode = 'check_violation';
  end if;

  select count(*) into v_recent
  from public.vacancy_application
  where user_id = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= 20 then
    raise exception 'That is a lot of applications in one day. Try again tomorrow.'
      using errcode = 'check_violation';
  end if;

  if v_existing.id is null then
    insert into public.vacancy_application (
      vacancy_id, user_id, full_name, email, phone, note, cv_path, cv_name
    )
    values (p_vacancy_id, v_uid, v_name, v_email, v_phone, v_note, v_cv_path, v_cv_name)
    returning id into v_id;
  else
    update public.vacancy_application set
      full_name = v_name,
      email = v_email,
      phone = v_phone,
      note = v_note,
      cv_path = v_cv_path,
      cv_name = v_cv_name,
      status = 'submitted',
      employer_note = null,
      interview_at = null,
      status_changed_at = now()
    where id = v_existing.id
    returning id into v_id;
  end if;

  /* One bell per job for each person who hires, brought back up with each
     new applicant. */
  for u in select public.fn_vacancy_hiring_team(p_vacancy_id) as user_id loop
    perform public.fn_notify_user(
      p_user_id => u.user_id, p_kind => 'merchant.vacancy_application',
      p_title => format('New application for %s', v_job.title),
      p_body => format('%s applied. Open the job to see everybody who has applied.', v_name),
      p_href => case when v_job.merchant_id is not null then '/merchant/hiring/' || p_vacancy_id::text
                     else '/host?open=hiring/' || p_vacancy_id::text end,
      p_tone => 'info'::public.notification_tone,
      p_object_type => 'vacancy', p_object_id => p_vacancy_id,
      p_tag => 'vacancy:' || p_vacancy_id::text);
  end loop;

  perform audit.log(
    'guest'::public.actor_type, 'careers', 'careers.vacancy_applied',
    p_target_type => 'vacancy_application', p_target_id => v_id,
    p_after => jsonb_build_object('vacancy_id', p_vacancy_id, 'title', v_job.title,
                                  'with_cv', v_cv_path is not null),
    p_city_id => v_job.city_id);

  return v_id;
end;
$$;

-- ──────────────────────────────────────────── the business moves an applicant

create or replace function public.rpc_vacancy_application_update(
  p_application_id uuid,
  p_status text,
  p_message text default null,
  p_interview_at timestamptz default null
)
returns public.vacancy_application
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.vacancy_application;
  v_job public.vacancy;
  v_row public.vacancy_application;
  v_employer text;
  v_timezone text;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_title text;
  v_body text;
begin
  select * into v_app from public.vacancy_application where id = p_application_id for update;
  if v_app.id is not null then
    select * into v_job from public.vacancy where id = v_app.vacancy_id;
  end if;
  if v_app.id is null or not authz.employer_hires(v_job.merchant_id, v_job.host_id, v_job.hotel_id) then
    raise exception 'That application is not for one of your jobs.' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('submitted', 'shortlisted', 'interview', 'hired', 'rejected') then
    raise exception 'Pick the next step for this applicant.' using errcode = '22023';
  end if;
  if v_app.status = 'withdrawn' then
    raise exception 'The applicant withdrew this application.' using errcode = 'check_violation';
  end if;
  if p_status = 'interview' then
    if p_interview_at is null then
      raise exception 'Pick a date and time for the interview.' using errcode = 'check_violation';
    end if;
    if p_interview_at < now() then
      raise exception 'Pick a time for the interview that has not passed.' using errcode = 'check_violation';
    end if;
  end if;
  if v_message is not null and length(v_message) > 1000 then
    raise exception 'Keep the message under 1,000 characters.' using errcode = 'check_violation';
  end if;

  update public.vacancy_application set
    status = p_status,
    employer_note = v_message,
    interview_at = case when p_status = 'interview' then p_interview_at else interview_at end,
    status_changed_at = now()
  where id = v_app.id
  returning * into v_row;

  select coalesce(m.trading_name, ho.display_name, ht.name, 'The business') into v_employer
  from public.vacancy v
  left join public.merchant m on m.id = v.merchant_id
  left join public.host ho on ho.id = v.host_id
  left join public.hotel ht on ht.id = v.hotel_id
  where v.id = v_job.id;
  select c.timezone into v_timezone from public.city c where c.id = v_job.city_id;

  /* Moving somebody back to "new" is the business's own housekeeping, and
     the applicant is not told. Every other step, they are. */
  if p_status <> 'submitted' then
    v_title := case p_status
      when 'shortlisted' then format('You are on the shortlist for %s', v_job.title)
      when 'interview' then format('Interview for %s', v_job.title)
      when 'hired' then format('%s wants to hire you', v_employer)
      else format('An update on %s', v_job.title)
    end;
    v_body := case p_status
      when 'shortlisted' then format('%s shortlisted your application for %s.', v_employer, v_job.title)
      when 'interview' then format('%s invited you to an interview on %s.', v_employer,
        to_char(p_interview_at at time zone v_timezone, 'FMDay FMDD FMMonth "at" HH24:MI'))
      when 'hired' then format('%s chose you for %s.', v_employer, v_job.title)
      else format('%s is not taking your application for %s further. Thank you for applying.',
        v_employer, v_job.title)
    end || case when v_message is null then '' else format(' They wrote “%s”', v_message) end;

    perform public.fn_notify_user(
      p_user_id => v_app.user_id, p_kind => 'careers.application_update',
      p_title => v_title, p_body => v_body, p_href => '/account?tab=applications',
      p_tone => case when p_status = 'hired' then 'good' else 'info' end::public.notification_tone,
      p_object_type => 'vacancy_application', p_object_id => v_app.id,
      p_tag => 'application:' || v_app.id::text);
  end if;

  perform audit.log(
    case when v_job.merchant_id is not null then 'merchant_user' else 'host_user' end::public.actor_type,
    case when v_job.merchant_id is not null then 'merchants' else 'careers' end,
    case when v_job.merchant_id is not null then 'merchant.job_application_updated'
         else 'careers.job_application_updated' end,
    p_target_type => 'vacancy_application', p_target_id => v_app.id,
    p_before => jsonb_build_object('status', v_app.status),
    p_after => jsonb_build_object('status', v_row.status, 'vacancy_id', v_job.id,
                                  'interview_at', v_row.interview_at),
    p_city_id => v_job.city_id);

  return v_row;
end;
$$;

-- ─────────────────────────────────────────────── the applicant withdraws

create or replace function public.rpc_vacancy_application_withdraw(p_application_id uuid)
returns public.vacancy_application
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.vacancy_application;
  v_row public.vacancy_application;
  v_job public.vacancy;
  u record;
begin
  select * into v_app from public.vacancy_application
  where id = p_application_id and user_id = (select auth.uid())
  for update;
  if v_app.id is null then
    raise exception 'That application is not yours.' using errcode = '42501';
  end if;
  if v_app.status = 'withdrawn' then
    return v_app;
  end if;

  /* The CV goes with it: the business cannot open it from now on. */
  update public.vacancy_application set
    status = 'withdrawn',
    cv_path = null,
    cv_name = null,
    status_changed_at = now()
  where id = v_app.id
  returning * into v_row;

  select * into v_job from public.vacancy where id = v_app.vacancy_id;

  for u in select public.fn_vacancy_hiring_team(v_job.id) as user_id loop
    perform public.fn_notify_user(
      p_user_id => u.user_id, p_kind => 'merchant.vacancy_application',
      p_title => format('%s withdrew', v_app.full_name),
      p_body => format('%s withdrew their application for %s.', v_app.full_name, v_job.title),
      p_href => case when v_job.merchant_id is not null then '/merchant/hiring/' || v_job.id::text
                     else '/host?open=hiring/' || v_job.id::text end,
      p_tone => 'info'::public.notification_tone,
      p_object_type => 'vacancy', p_object_id => v_job.id,
      p_tag => 'vacancy:' || v_job.id::text);
  end loop;

  perform audit.log(
    'guest'::public.actor_type, 'careers', 'careers.vacancy_application_withdrawn',
    p_target_type => 'vacancy_application', p_target_id => v_app.id,
    p_before => jsonb_build_object('status', v_app.status),
    p_after => jsonb_build_object('status', 'withdrawn', 'vacancy_id', v_job.id),
    p_city_id => v_job.city_id);

  return v_row;
end;
$$;

-- ──────────────────────────────────────────────────────────────── grants

revoke execute on function public.rpc_vacancy_save_for(
  text, uuid, text, text, text, uuid, text, uuid, text, integer, integer, integer, text, text, date, boolean
) from public, anon;
revoke execute on function public.rpc_vacancy_lift_takedown(uuid, text) from public, anon;

grant execute on function public.rpc_vacancy_save_for(
  text, uuid, text, text, text, uuid, text, uuid, text, integer, integer, integer, text, text, date, boolean
) to authenticated;
grant execute on function public.rpc_vacancy_lift_takedown(uuid, text) to authenticated;
