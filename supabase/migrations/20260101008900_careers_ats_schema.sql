-- Careers ATS · schema.
--
-- Its own schema, because candidate data is not operational data. A
-- recruiter reads it; nobody else on the platform does, not even to
-- count rows. Putting it in `public` beside merchants and riders would
-- make that a policy rather than a boundary.
--
-- The public careers page prints two promises. This schema exists to
-- make them mechanical rather than aspirational:
--
--   "If it's a no, you'll hear it from a person, with a reason."
--   A rejection without a reason code and a written sentence is
--   refused by the RPC and by a check constraint. There is no path
--   that rejects somebody silently.
--
--   "Five steps, about two weeks."
--   The weeks are summed from the job's own stage targets, never
--   typed, so the page cannot promise a fortnight while the pipeline
--   takes six.
--
-- The console runs seven stages; the candidate sees five. `new` and
-- `screening` both read as "Application received · under review",
-- because telling somebody they are in a sub-state of triage helps
-- nobody.

create schema if not exists hr;
revoke all on schema hr from anon, authenticated;
grant usage on schema hr to authenticated, service_role;

-- ═══════════════════════════════════════════════════ enums

create type hr.job_status as enum ('draft', 'open', 'paused', 'closed', 'always_open');
create type hr.contract_type as enum ('full_time', 'part_time', 'contract_6mo', 'internship');
create type hr.work_mode as enum ('on_site', 'on_site_shifts', 'hybrid', 'remote_eat');

create type hr.stage as enum (
  'new', 'screening', 'intro_call', 'work_sample', 'team_conversation',
  'offer', 'hired', 'on_file', 'rejected', 'withdrawn'
);

create type hr.question_kind as enum (
  'must_yes_no', 'points_yes_no', 'points_number', 'points_select', 'free_text'
);

create type hr.source as enum (
  'careers_page', 'linkedin', 'brightermonday', 'fuzu', 'whatsapp_card',
  'referral', 'general_application', 'manual'
);

create type hr.offer_status as enum (
  'drafted', 'awaiting_approval', 'sent', 'accepted', 'declined', 'expired', 'withdrawn'
);
create type hr.reference_status as enum ('requested', 'received', 'positive', 'concern');
create type hr.email_status as enum ('queued', 'sent', 'delivered', 'bounced', 'opened');
create type hr.interview_kind as enum ('intro_call', 'team_conversation', 'work_sample_review');
create type hr.interview_status as enum (
  'proposed', 'confirmed', 'done', 'no_show', 'rescheduled', 'cancelled'
);
create type hr.note_kind as enum (
  'note', 'interview_feedback', 'work_sample_review', 'reference'
);
create type hr.recommendation as enum ('strong_yes', 'yes', 'no', 'strong_no');

-- ═══════════════════════════════════════════════════ teams

create table hr.team (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  blurb text,
  sort integer not null default 0
);

insert into hr.team (name, blurb, sort) values
  ('Concierge & Operations',
   'The desk itself: agents, dispatchers and the people who keep a promise made at midnight.', 10),
  ('Technology',
   'The apps guests, riders and merchants actually use, and the systems underneath them.', 20),
  ('Growth & Partnerships',
   'Hotels, hosts and merchants — the people who bring NexG the work.', 30),
  ('City Launch',
   'Opening a new city: supply, demand and the first hundred orders.', 40)
on conflict (name) do nothing;

-- ═══════════════════════════════════════════════════ jobs

create table hr.job (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  team_id uuid references hr.team (id) on delete set null,
  city_id uuid references public.city (id) on delete set null,
  location_label text,
  work_mode hr.work_mode,
  contract hr.contract_type,
  status hr.job_status not null default 'draft',
  openings integer not null default 1 check (openings >= 0),

  hiring_manager_id uuid references public.staff_user (id) on delete set null,
  recruiter_id uuid references public.staff_user (id) on delete set null,

  /* Null until somebody decides. A salary this schema invented is one
     a candidate would read on a public page. */
  salary_min bigint,
  salary_max bigint,
  salary_currency text not null default 'KES',
  salary_public boolean not null default false,

  description_md text,
  responsibilities_md text,
  requirements_md text,
  nice_to_have_md text,
  benefits_md text,
  /* Two fields on purpose: what the panel marks against, and what the
     candidate is actually sent. */
  work_sample_internal_md text,
  work_sample_candidate_md text,
  work_sample_paid boolean not null default true,
  work_sample_pay_note text default 'Paid for anything over two hours',

  /* Days per stage. The public "about N weeks" is summed from this. */
  stage_targets jsonb not null default
    '{"screening": 3, "intro_call": 5, "work_sample": 5, "team_conversation": 4, "offer": 7}'::jsonb,

  posted_at timestamptz,
  closes_at date,
  closed_at timestamptz,
  closed_reason text,
  is_general boolean not null default false,
  referral_code text unique,
  seo jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /*
   * A job cannot be published half-finished. Without a hiring manager
   * there is nobody to decide; without a description there is nothing
   * to apply to; without a salary range that is at least ordered, the
   * public page would print nonsense.
   */
  /*
   * The general application is exempt from needing a hiring manager:
   * it is an inbox rather than a role, and there is nobody whose
   * opening it is. Everything else must have somebody who decides.
   */
  constraint job_open_is_complete check (
    status not in ('open', 'always_open')
    or (coalesce(trim(description_md), '') <> ''
        and location_label is not null
        and (is_general or hiring_manager_id is not null))
  ),
  constraint job_salary_is_a_range check (
    salary_min is null or salary_max is null or salary_max >= salary_min
  ),
  constraint job_closed_has_a_reason check (
    status <> 'closed' or coalesce(trim(closed_reason), '') <> ''
  )
);

/* Exactly one "send an open application" job. */
create unique index job_one_general on hr.job (is_general) where is_general;
create index job_public_idx on hr.job (status) where status in ('open', 'always_open');
create index job_team_idx on hr.job (team_id, status);

comment on constraint job_open_is_complete on hr.job is
  'A published role has somebody who decides and something to read. Publishing is a decision, not a status flip.';

create table hr.job_question (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references hr.job (id) on delete cascade,
  sort integer not null default 0,
  kind hr.question_kind not null,
  prompt text not null,
  options jsonb,
  must_value text,
  points integer,
  threshold jsonb,
  /* Sets a chip on the pipeline card — nights ✓, PMS ✓, EN/SW. */
  flag_key text,
  auto_flag_template_id uuid,
  public boolean not null default true,

  constraint question_must_has_a_value check (
    kind <> 'must_yes_no' or must_value is not null
  )
);

create index job_question_idx on hr.job_question (job_id, sort);

create table hr.job_publish (
  job_id uuid not null references hr.job (id) on delete cascade,
  channel hr.source not null,
  enabled boolean not null default false,
  external_url text,
  utm text,
  posted_at timestamptz,
  posted_by uuid references public.staff_user (id) on delete set null,
  notes text,
  primary key (job_id, channel)
);

-- ═══════════════════════════════════════════ candidates

create table hr.candidate (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  /* Case-insensitive unique: one person, one row, across every job. */
  email text not null,
  phone text,
  city text,
  linkedin_url text,
  cv_path text,
  cv_text text,
  skills text[] not null default '{}',
  years_experience numeric(4, 1),

  talent_pool_opt_in boolean not null default false,
  talent_pool_until date,
  consent_at timestamptz,
  consent_version text,
  anonymised_at timestamptz,
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index candidate_email_unique on hr.candidate (lower(email));
create index candidate_search_idx on hr.candidate using gin (skills);

comment on column hr.candidate.cv_text is
  'Extracted for search. Anonymisation clears it along with the file — a CV is the most identifying thing in this schema.';

create table hr.application (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references hr.job (id) on delete cascade,
  candidate_id uuid not null references hr.candidate (id) on delete cascade,

  stage hr.stage not null default 'new',
  stage_entered_at timestamptz not null default now(),
  source hr.source not null default 'careers_page',
  source_detail text,

  why_nexg text,
  answers jsonb not null default '{}'::jsonb,
  screening_score integer,
  screening_max integer,
  must_failed text[] not null default '{}',
  flags jsonb not null default '{}'::jsonb,

  owner_id uuid references public.staff_user (id) on delete set null,
  /* The candidate has no account. This hashed token is the only way
     they reach their own status page. */
  status_token_hash text,
  status_token_expires_at timestamptz,

  withdrawn_at timestamptz,
  rejected_at timestamptz,
  rejected_reason_code text,
  rejected_reason_text text,
  rejected_by uuid references public.staff_user (id) on delete set null,
  hired_at timestamptz,
  start_date date,
  on_file_until date,
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /* Re-applying reopens rather than duplicates. */
  unique (job_id, candidate_id),

  /*
   * The promise on the public page, enforced. A rejection carries a
   * code and a sentence somebody wrote — not a status change.
   */
  constraint rejection_has_a_reason check (
    stage <> 'rejected'
    or (rejected_reason_code is not null
        and coalesce(trim(rejected_reason_text), '') <> '')
  ),
  constraint hired_has_a_date check (stage <> 'hired' or hired_at is not null)
);

create index application_stage_idx on hr.application (job_id, stage);
create index application_candidate_idx on hr.application (candidate_id);
create index application_open_idx on hr.application (stage, stage_entered_at)
  where stage not in ('rejected', 'withdrawn', 'hired');

comment on constraint rejection_has_a_reason on hr.application is
  'The careers page says: "If it''s a no, you''ll hear it from a person, with a reason." This is that sentence as a constraint.';

create table hr.stage_event (
  id bigserial primary key,
  application_id uuid not null references hr.application (id) on delete cascade,
  from_stage hr.stage,
  to_stage hr.stage not null,
  by uuid references public.staff_user (id) on delete set null,
  at timestamptz not null default now(),
  note text,
  email_id uuid
);

create index stage_event_idx on hr.stage_event (application_id, at);

/* Every stage change leaves a trace, whoever made it. */
create or replace function hr.tg_stage_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage is distinct from old.stage then
    insert into hr.stage_event (application_id, from_stage, to_stage, by)
    values (new.id, old.stage, new.stage, authz.staff_id());
    new.stage_entered_at := now();
  end if;
  return new;
end;
$$;

create trigger application_stage_event
  before update of stage on hr.application
  for each row execute function hr.tg_stage_event();

-- ═══════════════════════════════════ notes, interviews, samples

create table hr.note (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references hr.application (id) on delete cascade,
  author_id uuid references public.staff_user (id) on delete set null,
  body text not null,
  kind hr.note_kind not null default 'note',
  score integer check (score is null or score between 1 and 5),
  recommend hr.recommendation,
  interview_id uuid,
  visible_to text not null default 'recruiters' check (visible_to in ('recruiters', 'panel')),
  created_at timestamptz not null default now(),

  constraint note_body_not_blank check (length(trim(body)) > 0)
);

create index note_idx on hr.note (application_id, created_at desc);

create table hr.interview (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references hr.application (id) on delete cascade,
  kind hr.interview_kind not null,
  /* The slots offered to the candidate, before they pick one. */
  proposed_slots jsonb not null default '[]'::jsonb,
  scheduled_at timestamptz,
  duration_min integer not null default 30,
  location text check (location in ('phone', 'google_meet', 'office')),
  meet_link text,
  interviewers uuid[] not null default '{}',
  calendar_event_id text,
  status hr.interview_status not null default 'proposed',
  candidate_confirmed_at timestamptz,
  reminder_24h_sent_at timestamptz,
  reminder_2h_sent_at timestamptz,
  created_at timestamptz not null default now(),

  constraint interview_confirmed_has_a_time check (
    status not in ('confirmed', 'done') or scheduled_at is not null
  )
);

create index interview_idx on hr.interview (application_id, created_at desc);
create index interview_upcoming_idx on hr.interview (scheduled_at)
  where status = 'confirmed';

alter table hr.note add constraint note_interview_fk
  foreign key (interview_id) references hr.interview (id) on delete set null;

create table hr.work_sample (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references hr.application (id) on delete cascade,
  brief_sent_at timestamptz,
  due_at timestamptz,
  submitted_at timestamptz,
  submission_path text,
  submission_url text,
  hours_reported numeric(4, 1),
  /* A paid work sample is a real commitment printed on the public
     page. Null means nobody has set the rate, not that it is free. */
  payment_amount bigint,
  payment_status text not null default 'n/a'
    check (payment_status in ('n/a', 'due', 'paid')),
  payment_ref text,
  score integer check (score is null or score between 0 and 20),
  reviewed_by uuid references public.staff_user (id) on delete set null,
  reviewed_at timestamptz,
  notes text,
  unique (application_id)
);

create table hr.reference_check (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references hr.application (id) on delete cascade,
  referee_name text,
  referee_contact text,
  relationship text,
  status hr.reference_status not null default 'requested',
  requested_at timestamptz not null default now(),
  received_at timestamptz,
  notes text,
  by uuid references public.staff_user (id) on delete set null
);

create table hr.offer (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references hr.application (id) on delete cascade,
  status hr.offer_status not null default 'drafted',
  salary bigint,
  currency text not null default 'KES',
  equity_note text,
  start_date date,
  contract hr.contract_type,
  conditions text[] not null default '{}',
  letter_path text,
  approved_by uuid references public.staff_user (id) on delete set null,
  second_approver_id uuid references public.staff_user (id) on delete set null,
  sent_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  decline_reason text,
  created_at timestamptz not null default now(),
  unique (application_id),

  constraint offer_sent_has_terms check (
    status not in ('sent', 'accepted')
    or (salary is not null and start_date is not null)
  ),
  /* Two people means two different people. */
  constraint offer_two_people check (
    approved_by is null or second_approver_id is null
    or approved_by <> second_approver_id
  )
);

-- ═══════════════════════════════════ templates and reasons

create table hr.email_template (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  subject text not null,
  body_md text not null,
  /* A rejection template cannot be sent on its own. */
  requires_reason boolean not null default false,
  editable_before_send boolean not null default true,
  version integer not null default 1,
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table hr.rejection_reason (
  code text primary key,
  label text not null,
  /* The sentence the candidate actually reads. Written once, so no
     two recruiters phrase the same no differently. */
  candidate_text text not null,
  sort integer not null default 0,
  active boolean not null default true
);

insert into hr.rejection_reason (code, label, candidate_text, sort) values
  ('nights', 'Can''t work the night shifts the role needs',
   'This role is built around night shifts, and from your answers those would not work for you.', 10),
  ('experience', 'Looking for more customer-facing experience',
   'We are looking for more time spent dealing with customers directly than your application shows right now.', 20),
  ('work_sample', 'Work sample didn''t meet the bar',
   'Your work sample did not quite meet the bar we set for this role.', 30),
  ('interview', 'Not the right fit after the conversation',
   'After the conversation we decided to go a different way for this role.', 40),
  ('role_filled', 'Role filled',
   'We have filled this role. It was a close call and we would like to keep your details if you are happy for us to.', 50),
  ('location', 'Location',
   'This role needs somebody based where the work is, and that does not line up with where you are.', 60),
  ('languages', 'Language requirement',
   'This role needs fluent English and Kiswahili day to day.', 70)
on conflict (code) do nothing;

insert into hr.email_template (key, subject, body_md, requires_reason) values
  ('application_received', 'We have your application · {{job_title}}',
   'Hi {{first_name}},

Thanks for applying to be a {{job_title}} at NexG. A person reads every application — you will hear back within {{reply_sla_days}} working days, either way.

You can follow where you stand here: {{status_link}}

{{recruiter_name}}', false),
  ('intro_call_invite', 'Let''s talk · {{job_title}}',
   'Hi {{first_name}},

We would like to talk. Pick whichever of these suits you: {{slots}}

It is about 30 minutes, on the phone or Meet.

{{recruiter_name}}', false),
  ('intro_call_reminder', 'Tomorrow · your call about {{job_title}}',
   'Hi {{first_name}},

Just a reminder about our call. {{slots}}

{{recruiter_name}}', false),
  ('work_sample_brief', 'Your work sample · {{job_title}}',
   'Hi {{first_name}},

Here is the work sample. It should take two to four hours, and we pay for anything over two.

{{status_link}}

{{recruiter_name}}', false),
  ('work_sample_received', 'Got your work sample',
   'Hi {{first_name}},

Received, thank you. We will come back to you shortly.

{{recruiter_name}}', false),
  ('team_conversation_invite', 'Meet the team · {{job_title}}',
   'Hi {{first_name}},

The last step is a 45-minute conversation with the team. Pick a time: {{slots}}

{{recruiter_name}}', false),
  ('offer_sent', 'An offer · {{job_title}}',
   'Hi {{first_name}},

We would like you to join us. The details are on your status page, along with the letter: {{status_link}}

{{recruiter_name}}', false),
  ('screening_rejected_must', 'About your application · {{job_title}}',
   'Hi {{first_name}},

Thank you for applying. We are not taking this one forward.

{{reason}}

If you would like us to keep your details for other roles, there is a one-tap option here: {{status_link}}

{{recruiter_name}}', true),
  ('rejected_after_interview', 'After our conversation · {{job_title}}',
   'Hi {{first_name}},

Thank you for the time you gave us. We are not taking this one forward.

{{reason}}

{{recruiter_name}}', true),
  ('rejected_after_work_sample', 'About your work sample · {{job_title}}',
   'Hi {{first_name}},

Thank you for the work you put into this.

{{reason}}

{{recruiter_name}}', true),
  ('on_file_offer', 'Keep your details on file?',
   'Hi {{first_name}},

Would you like us to keep your details for twelve months in case something closer comes up? One tap: {{status_link}}

{{recruiter_name}}', false),
  ('on_file_confirmed', 'You are on file',
   'Hi {{first_name}},

Done — we will be in touch if something suits.

{{recruiter_name}}', false),
  ('withdrawn_ack', 'Your application is withdrawn',
   'Hi {{first_name}},

Withdrawn, as you asked. The door is open if you change your mind.

{{recruiter_name}}', false),
  ('hired_welcome', 'Welcome to NexG',
   'Hi {{first_name}},

Delighted. You start on {{start_date}}. We will send the practical details before then.

{{recruiter_name}}', false),
  ('anonymisation_notice', 'We are about to remove your details',
   'Hi {{first_name}},

Fourteen days from now we will anonymise your application, as our notice said we would. If you would rather we kept your details for twelve months, one tap here: {{status_link}}

{{recruiter_name}}', false)
on conflict (key) do nothing;

create table hr.email (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references hr.application (id) on delete cascade,
  candidate_id uuid references hr.candidate (id) on delete cascade,
  template_key text,
  subject text not null,
  body_html text,
  "to" text,
  status hr.email_status not null default 'queued',
  provider_id text,
  sent_by uuid references public.staff_user (id) on delete set null,
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);

create index email_idx on hr.email (application_id, created_at desc);

alter table hr.stage_event add constraint stage_event_email_fk
  foreign key (email_id) references hr.email (id) on delete set null;

alter table hr.job_question add constraint question_template_fk
  foreign key (auto_flag_template_id) references hr.email_template (id) on delete set null;

create table hr.setting (
  key text primary key,
  value jsonb not null,
  label text not null,
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into hr.setting (key, value, label) values
  ('retention_months', '6', 'Anonymise this long after a process ends'),
  ('talent_pool_months', '12', 'Keep talent-pool records this long'),
  ('blind_feedback', 'true', 'Hide panel feedback until the reader has submitted their own'),
  ('offer_second_approver_role', '"super_admin"', 'Second approver above the salary threshold'),
  ('offer_second_approver_above', 'null', 'Salary above which a second approver is needed'),
  ('work_sample_pay_default', 'true', 'Pay for work samples over two hours'),
  ('apply_cv_max_mb', '5', 'Largest CV accepted'),
  ('careers_contact_email', 'null', 'The careers mailbox'),
  ('reply_sla_days', '2', 'Working days to a first reply'),
  ('kdpa_notice_version', '"v1"', 'Version of the data notice shown at apply'),
  ('stage_targets_default',
   '{"screening": 3, "intro_call": 5, "work_sample": 5, "team_conversation": 4, "offer": 7}',
   'Default days per stage'),
  ('default_benefits_md', 'null', 'Benefits shown on every job')
on conflict (key) do nothing;

comment on table hr.setting is
  'Thresholds HR changes without a deploy. careers_contact_email and the salary threshold are null until somebody decides — the pages print [—] rather than a guess.';

create table hr.referral (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references hr.job (id) on delete cascade,
  referrer_staff_id uuid references public.staff_user (id) on delete set null,
  code text not null unique,
  application_id uuid references hr.application (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════ the general job

insert into hr.job (slug, title, team_id, location_label, work_mode, contract, status,
                    is_general, description_md, openings)
values ('general-application', 'General application',
        (select id from hr.team where name = 'Concierge & Operations'),
        'Any · Any', 'hybrid', 'full_time', 'always_open', true,
        'Tell us what you do and where you would fit. We read every one, and we keep them for six months.',
        0)
on conflict (slug) do nothing;

-- ═══════════════════════════════════ roles and the module

insert into public.role (key, label, description) values
  ('recruiter', 'Recruiter', 'Runs hiring: jobs, candidates, offers.'),
  ('hiring_manager', 'Hiring manager', 'Decides on candidates for their own roles.'),
  ('interviewer', 'Interviewer', 'Sees the candidates they are on a panel for, and nothing else.')
on conflict (key) do nothing;

insert into public.role_module_access (role_key, module_key, level) values
  ('recruiter', 'careers', 'full'),
  ('hiring_manager', 'careers', 'limited'),
  ('interviewer', 'careers', 'limited'),
  ('hr', 'careers', 'full'),
  ('super_admin', 'careers', 'full')
on conflict (role_key, module_key) do nothing;

/*
 * Nobody else. Not merchant ops, not finance, not ops managers — the
 * module is removed from any role that picked it up from an earlier
 * blanket grant.
 */
delete from public.role_module_access
where module_key = 'careers'
  and role_key not in ('recruiter', 'hiring_manager', 'interviewer', 'hr', 'super_admin');

update public.console_module set href = '/careers' where key = 'careers';

create trigger job_set_updated_at before update on hr.job
  for each row execute function public.tg_set_updated_at();
create trigger candidate_set_updated_at before update on hr.candidate
  for each row execute function public.tg_set_updated_at();
create trigger application_set_updated_at before update on hr.application
  for each row execute function public.tg_set_updated_at();
