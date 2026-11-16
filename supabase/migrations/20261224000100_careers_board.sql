-- NexG Careers: businesses on NexG advertise their own jobs.
--
-- Until now /careers listed NexG's own roles, from the hiring system in the
-- hr schema. It becomes a job board for the whole platform. A business with
-- a NexG account posts a vacancy from its dashboard. Job seekers find it by
-- keyword, place, type and category, save it, and apply with a CV. The
-- business shortlists, invites to interview, hires or turns people down, and
-- the applicant hears about each step.
--
-- NexG's own roles stay in hr, with their own pages and pipeline. The board
-- lists them beside the businesses' vacancies (careers_board_v), so a job
-- seeker searches one list.
--
-- Who may do what:
--   - A business's owners and managers post its jobs and read its
--     applicants, signed in with a real account (authz.merchant_hires).
--   - Only a verified business publishes: one NexG has checked and put live.
--     Others can keep drafts, which they publish once they are live. Demo
--     workspaces never reach the board (the rule cron_holiday_reminders uses).
--   - Applying takes a signed-in account, not an anonymous session. The
--     applicant reads their own applications, the business reads the ones
--     sent to its jobs, and nobody else does.
--   - A CV is a private file in the careers-cv bucket, under the applicant's
--     own folder. The business can open it while the application stands and
--     for 180 days after the job closes. Withdrawing ends that at once.
--   - Staff can take a job down, with a reason. They cannot put one up.
--
-- Safe to run more than once.

-- ─────────────────────────────────────────────── who hires for a business

create or replace function authz.merchant_hires(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not authz.is_anonymous_session()
     and exists (
       select 1
       from public.merchant_user mu
       join public.merchant m on m.id = mu.merchant_id
       where mu.merchant_id = p_merchant_id
         and mu.user_id = (select auth.uid())
         and mu.role in ('owner', 'manager')
         and m.deleted_at is null
     )
$$;

comment on function authz.merchant_hires(uuid) is
  'True when the caller is an owner or manager of the business, signed in with a real account. Posting its jobs and reading its applicants takes this.';

revoke execute on function authz.merchant_hires(uuid) from public;
grant execute on function authz.merchant_hires(uuid) to authenticated, service_role;

-- ──────────────────────────────────────────────────────────── the jobs

create table if not exists public.vacancy (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  title text not null,
  category text not null,
  job_type text not null,
  city_id uuid not null references public.city (id),
  /* Where in the city: a neighbourhood or a branch. */
  area text,
  openings integer not null default 1,
  /* Whole units of the city's currency, per salary_period. Either end may
     be left out ("from", "up to"), or both, when the pay is not said. */
  salary_min integer,
  salary_max integer,
  salary_period text,
  description text not null,
  requirements text,
  status text not null default 'draft',
  closes_on date,
  /* First published. Reopening keeps it, so the board's "new" stays true. */
  posted_at timestamptz,
  closed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vacancy_title_length check (length(trim(title)) between 3 and 120),
  constraint vacancy_category_known check (category in (
    'hospitality', 'food_beverage', 'property', 'tourism_travel', 'logistics',
    'maintenance', 'cleaning', 'office_admin', 'retail', 'beauty_wellness', 'other')),
  constraint vacancy_job_type_known check (job_type in (
    'full_time', 'part_time', 'temporary', 'gig', 'internship')),
  constraint vacancy_area_length check (area is null or length(area) <= 80),
  constraint vacancy_openings_range check (openings between 1 and 500),
  constraint vacancy_salary_positive check (
    (salary_min is null or salary_min > 0) and (salary_max is null or salary_max > 0)),
  constraint vacancy_salary_is_a_range check (
    salary_min is null or salary_max is null or salary_max >= salary_min),
  constraint vacancy_salary_has_a_period check (
    (salary_min is null and salary_max is null) = (salary_period is null)),
  constraint vacancy_salary_period_known check (
    salary_period is null or salary_period in ('hour', 'day', 'shift', 'week', 'month')),
  constraint vacancy_description_length check (length(trim(description)) between 20 and 6000),
  constraint vacancy_requirements_length check (requirements is null or length(requirements) <= 4000),
  constraint vacancy_status_known check (status in ('draft', 'open', 'closed')),
  constraint vacancy_open_has_a_date check (status <> 'open' or posted_at is not null)
);

comment on table public.vacancy is
  'A job a business on NexG advertises on /careers. Written only through rpc_vacancy_save and rpc_vacancy_set_status; the public reads careers_vacancy_v and careers_board_v.';

create index if not exists vacancy_merchant_idx on public.vacancy (merchant_id, created_at desc);
create index if not exists vacancy_open_idx on public.vacancy (posted_at desc) where status = 'open';

-- ─────────────────────────────────────────────────────── the applications

create table if not exists public.vacancy_application (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid not null references public.vacancy (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  /* A few lines on why this job. Not a cover letter. */
  note text,
  /* The CV in careers-cv, and the file's name as the applicant chose it. */
  cv_path text,
  cv_name text,
  status text not null default 'submitted',
  /* What the business said with its last step, shown to the applicant. */
  employer_note text,
  interview_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint vacancy_application_once unique (vacancy_id, user_id),
  constraint vacancy_application_name check (length(trim(full_name)) between 2 and 120),
  constraint vacancy_application_email check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint vacancy_application_phone check (phone is null or length(phone) <= 32),
  constraint vacancy_application_note check (note is null or length(note) <= 2000),
  constraint vacancy_application_cv check ((cv_path is null) = (cv_name is null)),
  constraint vacancy_application_cv_name check (cv_name is null or length(cv_name) <= 200),
  constraint vacancy_application_status check (status in (
    'submitted', 'shortlisted', 'interview', 'hired', 'rejected', 'withdrawn')),
  constraint vacancy_application_employer_note check (
    employer_note is null or length(employer_note) <= 1000),
  constraint vacancy_application_interview_has_a_time check (
    status <> 'interview' or interview_at is not null)
);

comment on table public.vacancy_application is
  'Somebody applying for a business''s job. Read by the applicant and by the business''s owners and managers; written only through the rpc_vacancy_* functions.';

create index if not exists vacancy_application_user_idx
  on public.vacancy_application (user_id, created_at desc);
create index if not exists vacancy_application_cv_idx
  on public.vacancy_application (cv_path) where cv_path is not null;

-- ──────────────────────────────────────────────────────────── saved jobs

create table if not exists public.vacancy_saved (
  user_id uuid not null references auth.users (id) on delete cascade,
  vacancy_id uuid not null references public.vacancy (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, vacancy_id)
);

comment on table public.vacancy_saved is
  'Jobs a signed-in job seeker bookmarked. Their own rows only.';

-- ────────────────────────────────────────────────────── row-level security

alter table public.vacancy enable row level security;
alter table public.vacancy_application enable row level security;
alter table public.vacancy_saved enable row level security;

revoke all on public.vacancy, public.vacancy_application, public.vacancy_saved
  from anon, authenticated;
grant select on public.vacancy, public.vacancy_application to authenticated;
grant select, insert, delete on public.vacancy_saved to authenticated;

drop policy if exists vacancy_read_business on public.vacancy;
create policy vacancy_read_business on public.vacancy
  for select to authenticated
  using (authz.merchant_hires(merchant_id) or authz.works_merchant(merchant_id));

drop policy if exists vacancy_application_read_own on public.vacancy_application;
create policy vacancy_application_read_own on public.vacancy_application
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists vacancy_application_read_business on public.vacancy_application;
create policy vacancy_application_read_business on public.vacancy_application
  for select to authenticated
  using (exists (select 1 from public.vacancy v
                 where v.id = vacancy_application.vacancy_id
                   and authz.merchant_hires(v.merchant_id)));

-- ──────────────────────────────────────────────────── what the public sees

/* One open job of a verified business, with everything its page shows. */
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
  m.trading_name as employer_name,
  m.cover_photo_path as employer_photo,
  m.went_live_at as employer_verified_at
from public.vacancy v
join public.merchant m on m.id = v.merchant_id
join public.city c on c.id = v.city_id
where v.status = 'open'
  and (v.closes_on is null or v.closes_on >= (now() at time zone c.timezone)::date)
  and m.status = 'live'
  and m.deleted_at is null
  /* Not a demo workspace: neither one supabase/demo-accounts.sql made (its
     fixed ids) nor any other "[Demo] …". */
  and m.trading_name not like '[Demo]%'
  and not exists (select 1 from public.category_config cc
                  cross join (values ('live'), ('new')) as k (kind)
                  where m.id = md5('demo-merchant-' || k.kind || '-' || cc.category::text)::uuid);

comment on view public.careers_vacancy_v is
  'Open jobs of live, real businesses: the job page on /careers/jobs/[id], and what rpc_vacancy_apply accepts.';

/* The board: the businesses' jobs and NexG's own, as one list. */
create or replace view public.careers_board_v
with (security_invoker = false) as
select
  'vacancy'::text as kind,
  v.id,
  null::text as slug,
  v.title,
  v.employer_name,
  v.employer_photo,
  v.category,
  v.job_type,
  v.city_id,
  v.city_name,
  v.city_slug,
  v.area,
  v.salary_min::bigint as salary_min,
  v.salary_max::bigint as salary_max,
  v.salary_period,
  v.currency,
  v.openings,
  v.posted_at,
  v.closes_on
from public.careers_vacancy_v v
union all
select
  'nexg'::text,
  j.id,
  j.slug,
  j.title,
  'NexG'::text,
  null::text,
  /* NexG's roles have no board category, so they show under All jobs. */
  null::text,
  case j.contract
    when 'full_time' then 'full_time'
    when 'part_time' then 'part_time'
    when 'contract_6mo' then 'temporary'
    when 'internship' then 'internship'
  end,
  j.city_id,
  c.name,
  c.slug,
  j.location_label,
  /* The range only when somebody chose to publish it, as on careers_jobs_v. */
  case when j.salary_public then j.salary_min end,
  case when j.salary_public then j.salary_max end,
  null::text,
  j.salary_currency,
  j.openings,
  j.posted_at,
  j.closes_at
from hr.job j
left join public.city c on c.id = j.city_id
where j.status in ('open', 'always_open')
  and not j.is_general;

comment on view public.careers_board_v is
  'Every job on /careers: open jobs of live businesses (kind vacancy, page /careers/jobs/[id]) and NexG''s own open roles (kind nexg, page /careers/[slug]).';

grant select on public.careers_vacancy_v, public.careers_board_v to anon, authenticated;

-- ───────────────────────────────────────── what a job seeker sees of their own

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
  m.trading_name as employer_name,
  c.name as city_name,
  c.timezone,
  exists (select 1 from public.careers_vacancy_v o where o.id = v.id) as still_open
from public.vacancy_application a
join public.vacancy v on v.id = a.vacancy_id
join public.merchant m on m.id = v.merchant_id
join public.city c on c.id = v.city_id
where a.user_id = (select auth.uid());

comment on view public.my_job_applications_v is
  'The signed-in job seeker''s own applications, with the job and the business. Nobody else''s.';

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
  m.trading_name as employer_name,
  c.name as city_name,
  exists (select 1 from public.careers_vacancy_v o where o.id = v.id) as still_open
from public.vacancy_saved s
join public.vacancy v on v.id = s.vacancy_id
join public.merchant m on m.id = v.merchant_id
join public.city c on c.id = v.city_id
where s.user_id = (select auth.uid());

comment on view public.my_saved_jobs_v is
  'The signed-in job seeker''s saved jobs, including ones that have since closed (still_open false).';

grant select on public.my_job_applications_v, public.my_saved_jobs_v to authenticated;

/* A job can only be saved while it is on the board, so a draft's id cannot
   be saved by guessing it and its title read back through my_saved_jobs_v. */
drop policy if exists vacancy_saved_own on public.vacancy_saved;
create policy vacancy_saved_own on public.vacancy_saved
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and not authz.is_anonymous_session()
              and exists (select 1 from public.careers_vacancy_v o
                          where o.id = vacancy_saved.vacancy_id));

-- ──────────────────────────────────────────────────────────────── the CVs

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'careers-cv', 'careers-cv', false, 5242880,
  array['application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

/* Can the caller's business open this CV? While the application stands, and
   for 180 days after the job closed. */
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
      and authz.merchant_hires(v.merchant_id)
  )
$$;

revoke execute on function authz.business_reads_cv(text) from public;
grant execute on function authz.business_reads_cv(text) to authenticated, service_role;

drop policy if exists careers_cv_owner_insert on storage.objects;
create policy careers_cv_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'careers-cv'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and not authz.is_anonymous_session());

drop policy if exists careers_cv_owner_read on storage.objects;
create policy careers_cv_owner_read on storage.objects
  for select to authenticated
  using (bucket_id = 'careers-cv'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists careers_cv_owner_delete on storage.objects;
create policy careers_cv_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'careers-cv'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists careers_cv_business_read on storage.objects;
create policy careers_cv_business_read on storage.objects
  for select to authenticated
  using (bucket_id = 'careers-cv' and authz.business_reads_cv(name));

-- ──────────────────────────────────── the bells are emails too, and audited

insert into public.notification_email_kind (kind, note) values
  ('merchant.vacancy_application', 'Business: somebody applied for one of its jobs, or withdrew'),
  ('careers.application_update', 'Job seeker: a business moved their application on')
on conflict (kind) do nothing;

insert into audit.action_registry (action, module, default_severity, description) values
  ('merchant.vacancy_saved', 'merchants', 'info', 'Business created or edited a job post'),
  ('merchant.vacancy_status_changed', 'merchants', 'info', 'A job post was opened or closed, by its business or taken down by staff'),
  ('merchant.job_application_updated', 'merchants', 'info', 'Business moved an applicant to another step, such as shortlisted or interview'),
  ('careers.vacancy_applied', 'careers', 'info', 'Somebody applied for a business''s job'),
  ('careers.vacancy_application_withdrawn', 'careers', 'info', 'An applicant withdrew their application for a business''s job')
on conflict (action) do nothing;

-- ─────────────────────────────────────────────── a business posts a job

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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
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
  if not authz.merchant_hires(p_merchant_id) then
    raise exception 'Only the owners and managers of this business can post its jobs.'
      using errcode = '42501';
  end if;

  select * into v_merchant from public.merchant where id = p_merchant_id;

  if p_vacancy_id is not null then
    select * into v_old from public.vacancy
    where id = p_vacancy_id and merchant_id = p_merchant_id
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
    if v_merchant.status <> 'live' then
      raise exception 'Only verified businesses can publish jobs. NexG is still checking yours, so save this as a draft for now.'
        using errcode = 'check_violation';
    end if;
    if p_closes_on is not null and p_closes_on < (now() at time zone v_city.timezone)::date then
      raise exception 'The closing date has passed.' using errcode = 'check_violation';
    end if;
  end if;

  if v_old.id is null then
    insert into public.vacancy (
      merchant_id, title, category, job_type, city_id, area, openings,
      salary_min, salary_max, salary_period, description, requirements,
      status, closes_on, posted_at, created_by
    )
    values (
      p_merchant_id, v_title, p_category, p_job_type, p_city_id, v_area, coalesce(p_openings, 1),
      p_salary_min, p_salary_max, v_period, v_description, v_requirements,
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
    'merchant_user'::public.actor_type, 'merchants', 'merchant.vacancy_saved',
    p_target_type => 'vacancy', p_target_id => v_row.id,
    p_before => case when v_old.id is null then null
                     else jsonb_build_object('title', v_old.title, 'status', v_old.status) end,
    p_after => jsonb_build_object('merchant_id', p_merchant_id, 'title', v_row.title,
                                  'status', v_row.status, 'job_type', v_row.job_type,
                                  'category', v_row.category),
    p_city_id => v_row.city_id);

  return v_row;
end;
$$;

comment on function public.rpc_vacancy_save is
  'Creates or edits a business''s job post. p_publish puts it on the board, which only a live (verified) business can do; otherwise a new post is a draft and an existing one keeps its status.';

-- ──────────────────────────────────────────────── open or close a job

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
  v_merchant_status public.partner_status;
  v_timezone text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v_old from public.vacancy where id = p_vacancy_id for update;
  if v_old.id is null then
    raise exception 'That job is not one of yours.' using errcode = '42501';
  end if;

  v_member := authz.merchant_hires(v_old.merchant_id);
  v_staff := not v_member and authz.works_merchant(v_old.merchant_id);
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

  if p_status = v_old.status then
    return v_old;
  end if;

  if p_status = 'open' then
    select m.status into v_merchant_status from public.merchant m where m.id = v_old.merchant_id;
    if v_merchant_status is distinct from 'live'::public.partner_status then
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
    closed_at = case when p_status = 'closed' then now() else null end,
    updated_at = now()
  where id = v_old.id
  returning * into v_row;

  perform audit.log(
    case when v_member then 'merchant_user' else 'staff' end::public.actor_type,
    'merchants', 'merchant.vacancy_status_changed',
    p_target_type => 'vacancy', p_target_id => v_row.id,
    p_before => jsonb_build_object('status', v_old.status),
    p_after => jsonb_build_object('status', v_row.status, 'title', v_row.title,
                                  'merchant_id', v_row.merchant_id),
    p_reason => v_reason,
    p_city_id => v_row.city_id);

  return v_row;
end;
$$;

comment on function public.rpc_vacancy_set_status is
  'Opens or closes a job post. The business does both (opening needs it live); staff can only close one, with a reason.';

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
  if authz.is_merchant_member(v_job.merchant_id) then
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

  /* The form is a few taps for a signed-in person, so a script could send a
     great many. Twenty in a day is far beyond a real search. */
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
    /* Applying again after withdrawing starts the application afresh. */
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
  for u in
    select mu.user_id from public.merchant_user mu where mu.merchant_id = v_job.merchant_id
  loop
    perform public.fn_notify_user(
      p_user_id => u.user_id, p_kind => 'merchant.vacancy_application',
      p_title => format('New application for %s', v_job.title),
      p_body => format('%s applied. Open the job to see everybody who has applied.', v_name),
      p_href => '/merchant/hiring/' || p_vacancy_id::text,
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

comment on function public.rpc_vacancy_apply is
  'A signed-in job seeker applies for an open job of a live business, with an optional CV they uploaded to careers-cv. Rings the business''s team.';

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
  if v_app.id is null or not authz.merchant_hires(v_job.merchant_id) then
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

  select m.trading_name into v_employer from public.merchant m where m.id = v_job.merchant_id;
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
    'merchant_user'::public.actor_type, 'merchants', 'merchant.job_application_updated',
    p_target_type => 'vacancy_application', p_target_id => v_app.id,
    p_before => jsonb_build_object('status', v_app.status),
    p_after => jsonb_build_object('status', v_row.status, 'vacancy_id', v_job.id,
                                  'interview_at', v_row.interview_at),
    p_city_id => v_job.city_id);

  return v_row;
end;
$$;

comment on function public.rpc_vacancy_application_update is
  'The business moves an applicant on (shortlisted, interview with a time, hired, rejected, or back to new) with an optional message. The applicant is told of every step but back-to-new.';

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

  for u in
    select mu.user_id from public.merchant_user mu where mu.merchant_id = v_job.merchant_id
  loop
    perform public.fn_notify_user(
      p_user_id => u.user_id, p_kind => 'merchant.vacancy_application',
      p_title => format('%s withdrew', v_app.full_name),
      p_body => format('%s withdrew their application for %s.', v_app.full_name, v_job.title),
      p_href => '/merchant/hiring/' || v_job.id::text,
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

comment on function public.rpc_vacancy_application_withdraw is
  'The applicant withdraws. Their CV is detached at once, so the business cannot open it; the app then deletes the file.';

-- ──────────────────────────────────────────────────────────────── grants

revoke execute on function public.rpc_vacancy_save(
  uuid, text, text, text, uuid, text, uuid, text, integer, integer, integer, text, text, date, boolean
) from public, anon;
revoke execute on function public.rpc_vacancy_set_status(uuid, text, text) from public, anon;
revoke execute on function public.rpc_vacancy_apply(uuid, text, text, text, text, text, text)
  from public, anon;
revoke execute on function public.rpc_vacancy_application_update(uuid, text, text, timestamptz)
  from public, anon;
revoke execute on function public.rpc_vacancy_application_withdraw(uuid) from public, anon;

grant execute on function public.rpc_vacancy_save(
  uuid, text, text, text, uuid, text, uuid, text, integer, integer, integer, text, text, date, boolean
) to authenticated;
grant execute on function public.rpc_vacancy_set_status(uuid, text, text) to authenticated;
grant execute on function public.rpc_vacancy_apply(uuid, text, text, text, text, text, text)
  to authenticated;
grant execute on function public.rpc_vacancy_application_update(uuid, text, text, timestamptz)
  to authenticated;
grant execute on function public.rpc_vacancy_application_withdraw(uuid) to authenticated;
