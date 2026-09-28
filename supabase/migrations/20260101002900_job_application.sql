-- Careers applications — the `Careers` artboard.
--
-- The page has an Apply button on every role and a "send an open application"
-- for people who do not see their job. Both have to land somewhere or the page
-- is a brochure with a dead button.
--
-- This is deliberately small. It captures what the artboard's form asks for
-- and nothing else: no CV file, because storing someone's CV means a retention
-- policy and a lawful basis under the Data Protection Act, and a link to a CV
-- the applicant already hosts answers the same question without NexG becoming
-- the custodian of it.

create table public.job_application (
  id uuid primary key default gen_random_uuid(),
  /*
   * The role as advertised, copied rather than referenced: listings live in
   * the repository and change, and an application must still say what it was
   * for after the listing is gone.
   */
  role_title text not null,
  team text,
  full_name text not null,
  email text not null,
  phone text,
  /* CV, LinkedIn, portfolio — whatever they host themselves. */
  link text,
  /* The artboard asks for three lines, not a cover letter. */
  note text,
  city_id uuid references public.city (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint job_application_name_not_blank check (length(trim(full_name)) > 0),
  constraint job_application_email_shape check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint job_application_note_length check (note is null or length(note) <= 2000),
  constraint job_application_link_is_http check (link is null or link ~* '^https?://')
);

create index job_application_recent_idx on public.job_application (created_at desc);

comment on table public.job_application is
  'Someone applying for a job. Not a partner application — riders and merchants have their own pipelines with documents and status gates; this is a CV link and three lines.';

alter table public.job_application enable row level security;

/*
 * Anyone may apply, including a visitor with no session. Nobody may read
 * applications back except staff: an insert-only policy for the public is the
 * whole point, since these rows contain other people's contact details.
 */
create policy job_application_insert_public on public.job_application
  for insert to anon, authenticated
  with check (true);

create policy job_application_read_staff on public.job_application
  for select to authenticated
  using (authz.is_super_admin() or authz.staff_id() is not null);

create or replace function public.rpc_job_apply(
  p_role_title text,
  p_full_name text,
  p_email text,
  p_team text default null,
  p_phone text default null,
  p_link text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_recent integer;
begin
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Enter your name.' using errcode = 'check_violation';
  end if;

  if p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.' using errcode = 'check_violation';
  end if;

  /*
   * A soft limit on the same address. The form is open to anyone with no
   * session at all, so without this one script fills the table overnight.
   * Ten is generous for a real person applying to several roles.
   */
  select count(*) into v_recent
  from public.job_application
  where email = lower(trim(p_email))
    and created_at > now() - interval '24 hours';

  if v_recent >= 10 then
    raise exception 'That is a lot of applications in one day. Email us instead and a person will read it.'
      using errcode = 'check_violation';
  end if;

  insert into public.job_application (role_title, team, full_name, email, phone, link, note)
  values (
    trim(p_role_title),
    nullif(trim(coalesce(p_team, '')), ''),
    trim(p_full_name),
    lower(trim(p_email)),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_link, '')), ''),
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_id;

  perform audit.log(
    p_actor_type => 'guest'::public.actor_type,
    p_module => 'careers',
    p_action => 'careers.applied',
    p_target_type => 'job_application',
    p_target_id => v_id,
    p_after => jsonb_build_object('role_title', trim(p_role_title))
  );

  return v_id;
end;
$$;

comment on function public.rpc_job_apply is
  'Records a job application. Open to anyone, rate-limited by email address because the form needs no session.';

grant execute on function public.rpc_job_apply(text, text, text, text, text, text, text)
  to anon, authenticated;
