-- The Audit console: everything the event stream cannot hold.
--
-- Four of the five tabs are readings of `audit.audit_event` and
-- nothing more — Activity, Money trail and Data access are filters
-- over the same chained rows, which is the point. This file adds only
-- what genuinely is not an event:
--
--   · sign-ins, which happen whether or not a module logs them, and
--     which need a device and country memory to say "new";
--   · alerts, which are a standing question asked of the stream;
--   · break-glass sessions, which must be opened before the thing
--     they permit and closed after;
--   · legal holds and evidence packs, which are claims about events
--     rather than events themselves;
--   · access reviews and vendor access, which are periodic and
--     signed.
--
-- Everything here is append-mostly and read by very few people.

-- ════════════════════════════════════════ who may look

/*
 * Reaching the audit module is not one permission. Finance sees the
 * money trail, the DPO sees personal-data access, ops sees their own
 * modules, and everybody — without exception — can see what they
 * themselves did. That last one is deliberate: a log you cannot see
 * your own entries in is a log people distrust.
 */
insert into public.role_module_access (role_key, module_key, level, note)
values
  ('super_admin', 'audit', 'full', 'Everything, including the chain and the packs.'),
  ('dpo', 'audit', 'full', 'Data protection needs the whole picture to answer a regulator.'),
  ('ops_manager', 'audit', 'limited', 'Their own cities and modules.'),
  ('finance', 'audit', 'view_invoices', 'The money trail only.'),
  ('city_lead', 'audit', 'own_city', 'Their city.'),
  ('concierge_lead', 'audit', 'own_actions', 'What they did.'),
  ('merchant_ops', 'audit', 'own_actions', 'What they did.'),
  ('rider_ops', 'audit', 'own_actions', 'What they did.'),
  ('recruiter', 'audit', 'own_actions', 'What they did.'),
  ('hr', 'audit', 'own_actions', 'What they did.'),
  ('partnerships', 'audit', 'own_actions', 'What they did.'),
  ('growth', 'audit', 'own_actions', 'What they did.'),
  ('read_only', 'audit', 'own_actions', 'What they did.')
on conflict (role_key, module_key) do update
  set level = excluded.level, note = excluded.note;

create or replace function authz.audit_level()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case
       when bool_or(rma.level = 'full') then 'full'
       when bool_or(rma.level = 'limited') then 'limited'
       when bool_or(rma.level = 'own_city') then 'own_city'
       when bool_or(rma.level = 'view_invoices') then 'money'
       when bool_or(rma.level = 'own_actions') then 'own_actions'
       else null
     end
     from public.role_grant rg
     join public.role r on r.id = rg.role_id
     join public.role_module_access rma on rma.role_key = r.key
     where rg.staff_user_id = authz.staff_id()
       and rma.module_key = 'audit'
       and rma.level <> 'none'
       and rg.revoked_at is null
       and (rg.expires_at is null or rg.expires_at > now())),
    case when authz.staff_id() is not null then 'own_actions' else null end)
$$;

comment on function authz.audit_level is
  'How much of the log this person sees. Any member of staff falls back to own_actions — you can always read your own trail.';

/*
 * One predicate, used by every view and by the RLS policy, so there
 * is exactly one place where "may this person see this event" is
 * decided.
 */
create or replace function audit.fn_visible(
  p_actor_id uuid, p_module text, p_city_id uuid, p_money boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case authz.audit_level()
    when 'full' then true
    when 'limited' then authz.reaches_module(p_module)
    when 'own_city' then p_city_id is null or authz.has_role('city_lead', p_city_id)
    when 'money' then coalesce(p_money, false) or p_actor_id = authz.staff_id()
    when 'own_actions' then p_actor_id = authz.staff_id()
    else false
  end
$$;

-- ═══════════════════════════════════════ sign-ins

/*
 * Every attempt, successful or not. Written by the app at the moment
 * of authentication, which is before any module has a session to log
 * against — which is why this is a table and not an event. A
 * corresponding `auth.sign_in` event is written alongside it so the
 * Activity tab stays complete.
 */
create table if not exists audit.sign_in (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  staff_user_id uuid references public.staff_user (id) on delete set null,
  /* Kept even when the staff row is deleted, and even when the email
     matched nobody — a string of failures against an address that
     does not exist is exactly what you want to see. */
  email_attempted text,
  outcome text not null
    check (outcome in ('success', 'bad_password', 'unknown_email',
                       'mfa_failed', 'locked', 'blocked_ip', 'expired_invite')),
  auth_method text check (auth_method in ('password', 'magic_link', 'oauth', 'recovery')),
  mfa_used boolean not null default false,
  ip inet,
  ip_country text,
  device_label text,
  device_fingerprint text,
  user_agent text,
  session_id text,
  /* Set when this sign-in was the first from this device or country,
     which is what the console surfaces rather than the raw stream. */
  first_from_device boolean not null default false,
  first_from_country boolean not null default false,
  ended_at timestamptz,
  ended_reason text check (ended_reason in ('signed_out', 'expired', 'revoked', 'password_changed'))
);

create index if not exists sign_in_at_idx on audit.sign_in (at desc);
create index if not exists sign_in_staff_idx on audit.sign_in (staff_user_id, at desc);
create index if not exists sign_in_failed_idx on audit.sign_in (email_attempted, at desc)
  where outcome <> 'success';
create index if not exists sign_in_live_idx on audit.sign_in (staff_user_id)
  where outcome = 'success' and ended_at is null;

/* So "new device" and "new country" are claims we can actually make. */
create table if not exists audit.known_device (
  staff_user_id uuid not null references public.staff_user (id) on delete cascade,
  device_fingerprint text not null,
  device_label text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  countries text[] not null default '{}',
  trusted boolean not null default false,
  primary key (staff_user_id, device_fingerprint)
);

-- ══════════════════════════════════════════ alerts

/*
 * A rule is a standing question asked of the event stream. It is
 * stored rather than coded so the set of things we watch for is
 * itself auditable — changing a rule writes an event.
 */
create table if not exists audit.alert_rule (
  key text primary key,
  title text not null,
  description text,
  /* Which events arm it. */
  match_actions text[] not null default '{}',
  match_modules text[] not null default '{}',
  min_severity public.audit_severity not null default 'notice',
  /* Fires when count(matching events) > threshold within window. A
     null threshold means every single matching event fires. */
  threshold integer check (threshold is null or threshold > 0),
  time_window interval not null default interval '1 hour',
  /* Grouped by actor, by target, or not at all. */
  group_by text not null default 'actor' check (group_by in ('actor', 'target', 'none')),
  severity public.audit_severity not null default 'notice',
  active boolean not null default true,
  /* What a person is expected to do about it. An alert with no next
     step is noise, and noise is how real alerts get ignored. */
  next_step text,
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists audit.alert (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null references audit.alert_rule (key) on delete cascade,
  raised_at timestamptz not null default now(),
  severity public.audit_severity not null,
  /* Whichever of these the rule groups by. */
  actor_id uuid references public.staff_user (id) on delete set null,
  actor_label text,
  target_type text,
  target_id uuid,
  city_id uuid references public.city (id) on delete set null,
  event_count integer not null default 1,
  first_event_id bigint,
  last_event_id bigint,
  summary text not null,
  state text not null default 'open'
    check (state in ('open', 'acknowledged', 'resolved', 'false_positive')),
  acknowledged_by uuid references public.staff_user (id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by uuid references public.staff_user (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  constraint alert_resolution_has_a_note check (
    state not in ('resolved', 'false_positive')
    or coalesce(trim(resolution_note), '') <> '')
);

create index if not exists alert_open_idx on audit.alert (raised_at desc) where state = 'open';
create index if not exists alert_rule_idx on audit.alert (rule_key, raised_at desc);
/* One open alert per rule per subject — a repeat raises the count on
   the existing one rather than burying the queue. */
create unique index if not exists alert_one_open_per_subject
  on audit.alert (rule_key, coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid),
                  coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where state = 'open';

insert into audit.alert_rule
  (key, title, description, match_actions, min_severity, threshold, time_window, group_by, severity, next_step)
values
  ('repeated_sign_in_failure', 'Repeated sign-in failures',
   'More than five failures against one address in ten minutes.',
   '{auth.sign_in_blocked,auth.mfa_failed}', 'notice', 5, interval '10 minutes', 'actor', 'high',
   'Call the person on a number you already have. Do not use one from the attempt.'),
  ('sign_in_new_country', 'Sign-in from a new country',
   'First time this account has signed in from this country.',
   '{auth.new_country}', 'high', null, interval '1 hour', 'actor', 'high',
   'Confirm with the person directly, then revoke their sessions if they did not.'),
  ('bulk_pii_reveal', 'Many personal details revealed',
   'More than twenty reveals by one person in an hour.',
   '{pii.revealed,pii.phone_revealed,pii.location_viewed,pii.document_viewed,pii.cv_viewed,pii.gate_code_revealed}',
   'high', 20, interval '1 hour', 'actor', 'high',
   'Ask what they were doing. There is usually a job behind it; when there is not, this is the only way you find out.'),
  ('export_outside_hours', 'Export outside working hours',
   'Data left the system between 22:00 and 06:00.',
   '{export.created}', 'high', null, interval '1 hour', 'actor', 'high',
   'Check the reason on the export and that it went where it says.'),
  ('manual_cash_adjustment', 'Cash adjusted by hand',
   'Somebody moved a rider cash balance without a deposit behind it.',
   '{cash.manual_adjustment}', 'high', null, interval '1 hour', 'actor', 'high',
   'Match it to a deposit or a written-off incident. If neither exists, escalate.'),
  ('chain_broken', 'The audit chain did not verify',
   'A nightly or manual verification failed.',
   '{audit.chain_failed}', 'high', null, interval '1 hour', 'none', 'high',
   'Stop. Take a snapshot of the database before anything else, then call the DPO.'),
  ('break_glass_open', 'Break-glass access opened',
   'Somebody granted themselves emergency access.',
   '{auth.break_glass_started}', 'high', null, interval '1 hour', 'actor', 'high',
   'Read the reason now, not at review time. Close it when the emergency ends.'),
  ('unregistered_action', 'An unregistered action was logged',
   'A module logged something the registry does not know about.',
   '{audit.unknown_action}', 'high', 3, interval '24 hours', 'none', 'notice',
   'Add the action to audit.action_registry with its severity and PII fields, or fix the caller.')
on conflict (key) do nothing;

-- ═════════════════════════════════════ break-glass

/*
 * Emergency access, with the emergency written down first.
 *
 * The constraint is the whole design: you cannot open one without
 * saying why, and it closes itself. Nothing here grants permission by
 * itself — `authz` reads it — so a forgotten session is a loud row in
 * a short table rather than a quiet standing privilege.
 */
create table if not exists audit.break_glass (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.staff_user (id) on delete restrict,
  opened_at timestamptz not null default now(),
  reason text not null check (length(trim(reason)) >= 20),
  scope text not null check (scope in ('module', 'city', 'everything')),
  module_key text,
  city_id uuid references public.city (id) on delete set null,
  /* Hard stop. Nothing renews it; a longer emergency opens a new one
     with a fresh reason. */
  expires_at timestamptz not null,
  closed_at timestamptz,
  closed_by uuid references public.staff_user (id) on delete set null,
  /* Filled in afterwards by somebody other than the person who opened
     it. An unreviewed expired session is the Evidence tab's problem. */
  reviewed_by uuid references public.staff_user (id) on delete set null,
  reviewed_at timestamptz,
  review_outcome text check (review_outcome in ('justified', 'unjustified', 'inconclusive')),
  review_note text,
  constraint break_glass_is_bounded check (expires_at > opened_at
    and expires_at <= opened_at + interval '8 hours'),
  constraint break_glass_scope_is_named check (
    (scope = 'module' and module_key is not null)
    or (scope = 'city' and city_id is not null)
    or scope = 'everything'),
  constraint break_glass_review_is_not_self check (
    reviewed_by is null or reviewed_by <> staff_user_id),
  constraint break_glass_review_is_complete check (
    reviewed_at is null
    or (review_outcome is not null and coalesce(trim(review_note), '') <> ''))
);

create index if not exists break_glass_open_idx on audit.break_glass (expires_at)
  where closed_at is null;
create index if not exists break_glass_unreviewed_idx on audit.break_glass (opened_at desc)
  where reviewed_at is null;

-- ═══════════════════════════ holds, packs, reviews

/*
 * A legal hold suspends deletion. It is the one thing that overrides
 * a retention rule, so it has to be at least as hard to set as the
 * rule it overrides — and far harder to release.
 */
create table if not exists audit.legal_hold (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  title text not null,
  reason text not null,
  /* What it covers. A hold on everything is legitimate and rare. */
  subject_type text not null
    check (subject_type in ('guest', 'rider', 'merchant', 'candidate', 'host', 'order', 'city', 'everything')),
  subject_id uuid,
  city_id uuid references public.city (id) on delete set null,
  from_at timestamptz,
  to_at timestamptz,
  placed_by uuid references public.staff_user (id) on delete set null,
  placed_at timestamptz not null default now(),
  /* Counsel's instruction, named. "Legal said so" is not a record. */
  instructed_by text not null,
  released_by uuid references public.staff_user (id) on delete set null,
  released_at timestamptz,
  release_reason text,
  constraint legal_hold_subject_is_identified check (
    subject_type in ('everything', 'city') or subject_id is not null),
  constraint legal_hold_release_has_a_reason check (
    released_at is null or coalesce(trim(release_reason), '') <> '')
);

create index if not exists legal_hold_active_idx on audit.legal_hold (subject_type, subject_id)
  where released_at is null;

create or replace function audit.fn_under_hold(p_subject_type text, p_subject_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from audit.legal_hold h
    where h.released_at is null
      and (h.subject_type = 'everything'
           or (h.subject_type = p_subject_type
               and (h.subject_id is null or h.subject_id = p_subject_id))))
$$;

comment on function audit.fn_under_hold is
  'The one thing that outranks a retention rule. Every anonymise and purge path checks it before it deletes anything.';

/*
 * An evidence pack is a frozen, hashed answer to a question somebody
 * outside asked. It records the question, the filter that answered
 * it, the result at the moment it was taken, and who it went to.
 */
create table if not exists audit.evidence_pack (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  title text not null,
  /* Why it exists. There is no such thing as a pack built out of
     curiosity. */
  purpose text not null
    check (purpose in ('regulator', 'court', 'insurer', 'internal_investigation',
                       'data_subject_request', 'audit')),
  requested_by text not null,
  reason text not null,
  legal_hold_id uuid references audit.legal_hold (id) on delete set null,
  /* The exact filter, kept so the pack can be rebuilt and compared. */
  filter jsonb not null,
  from_at timestamptz,
  to_at timestamptz,
  event_count integer,
  first_event_id bigint,
  last_event_id bigint,
  /* sha256 over the canonical rendering of every event in the pack,
     in id order. Two people running the same filter get the same
     digest, or the log moved underneath them. */
  content_hash bytea,
  /* The chain state at the moment of freezing, so a reader can check
     the pack against the log it came from. */
  chain_ok boolean,
  chain_checked_at timestamptz,
  state text not null default 'draft'
    check (state in ('draft', 'frozen', 'shared', 'withdrawn')),
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  frozen_at timestamptz,
  shared_at timestamptz,
  shared_with text,
  shared_how text check (shared_how in ('secure_link', 'encrypted_file', 'in_person', 'post')),
  withdrawn_at timestamptz,
  withdrawn_reason text,
  constraint pack_frozen_has_a_hash check (
    state = 'draft' or (content_hash is not null and frozen_at is not null)),
  constraint pack_shared_has_a_recipient check (
    state <> 'shared' or (coalesce(trim(shared_with), '') <> '' and shared_how is not null)),
  constraint pack_withdrawn_has_a_reason check (
    state <> 'withdrawn' or coalesce(trim(withdrawn_reason), '') <> '')
);

create index if not exists evidence_pack_state_idx on audit.evidence_pack (state, created_at desc);

/*
 * The events in the pack, frozen by id with the hash they had at
 * freeze time. If a row's hash later differs, the pack says so.
 */
create table if not exists audit.evidence_pack_event (
  pack_id uuid not null references audit.evidence_pack (id) on delete cascade,
  event_id bigint not null references audit.audit_event (id) on delete restrict,
  hash_at_freeze bytea not null,
  primary key (pack_id, event_id)
);

/* Quarterly: does everyone still need what they hold? */
create table if not exists audit.access_review (
  id uuid primary key default gen_random_uuid(),
  period text not null unique,
  opened_at timestamptz not null default now(),
  due_at timestamptz,
  state text not null default 'open' check (state in ('open', 'signed', 'abandoned')),
  signed_by uuid references public.staff_user (id) on delete set null,
  signed_at timestamptz,
  signed_note text,
  constraint access_review_signed_is_complete check (
    state <> 'signed' or (signed_by is not null and signed_at is not null))
);

create table if not exists audit.access_review_item (
  review_id uuid not null references audit.access_review (id) on delete cascade,
  staff_user_id uuid not null references public.staff_user (id) on delete cascade,
  role_key text not null,
  city_id uuid references public.city (id) on delete set null,
  /* Measured, not asked: when did this role last do anything? */
  last_used_at timestamptz,
  decision text check (decision in ('keep', 'revoke', 'reduce')),
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  note text,
  primary key (review_id, staff_user_id, role_key, city_id)
);

/* Anybody outside the company who can reach data, and until when. */
create table if not exists audit.vendor_access (
  id uuid primary key default gen_random_uuid(),
  vendor text not null,
  purpose text not null,
  /* What they actually touch. */
  data_categories text[] not null default '{}',
  /* Where it goes. The KDPA cares about this more than anything. */
  country text,
  transfer_basis text,
  contract_reference text,
  dpa_signed boolean not null default false,
  granted_at timestamptz not null default now(),
  review_due timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  owner_staff_id uuid references public.staff_user (id) on delete set null,
  constraint vendor_revoked_has_a_reason check (
    revoked_at is null or coalesce(trim(revoked_reason), '') <> '')
);

/* Every export, by anybody, whatever the surface. */
create table if not exists audit.export_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  staff_user_id uuid references public.staff_user (id) on delete set null,
  actor_label text,
  module text not null,
  what text not null,
  filter jsonb,
  row_count integer,
  format text check (format in ('csv', 'pdf', 'json', 'xlsx')),
  /* Required. An export without a stated reason does not happen. */
  reason text not null check (length(trim(reason)) >= 10),
  contains_pii boolean not null default false,
  destination text,
  event_id bigint references audit.audit_event (id) on delete set null
);

create index if not exists export_log_at_idx on audit.export_log (at desc);
create index if not exists export_log_pii_idx on audit.export_log (at desc) where contains_pii;

/* A filter somebody uses often enough to name. */
create table if not exists audit.saved_view (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tab text not null check (tab in ('activity', 'sign_ins', 'money', 'data_access', 'evidence')),
  filter jsonb not null,
  owner_id uuid references public.staff_user (id) on delete cascade,
  shared boolean not null default false,
  created_at timestamptz not null default now()
);

-- ══════════════════════════ retention, extended

/*
 * `public.retention_rule` already exists — the hospitality build put
 * it there and the nightly job already reads it. The Audit console
 * owns it now rather than keeping a second copy, which is the whole
 * rule about the database being the integration layer.
 */
alter table public.retention_rule
  add column if not exists module text,
  add column if not exists description text,
  /* Measured on every run, so the tab can say what actually happened
     rather than what the rule intends. */
  add column if not exists last_run_at timestamptz,
  add column if not exists last_run_rows integer,
  add column if not exists last_run_held integer,
  /* A retention period is a legal decision; two people agree it. */
  add column if not exists approved_by uuid references public.staff_user (id) on delete set null,
  add column if not exists second_approver_id uuid references public.staff_user (id) on delete set null,
  add column if not exists approved_at timestamptz;

do $$ begin
  alter table public.retention_rule
    add constraint retention_approval_is_two_people
    check (second_approver_id is null or second_approver_id <> approved_by);
exception when duplicate_object then null; end $$;

/* The DPO reads these, not only the hotels team. */
drop policy if exists retention_rule_read on public.retention_rule;
create policy retention_rule_read on public.retention_rule
  for select to authenticated
  using (authz.reaches_module('hotels') or authz.audit_level() is not null);

/* Nightly chain verification already has a table; it needs to be
   readable by the console and to know who asked. */
alter table audit.chain_check
  add column if not exists run_by uuid references public.staff_user (id) on delete set null,
  add column if not exists trigger text not null default 'cron'
    check (trigger in ('cron', 'manual', 'pack'));

-- ═══════════════════════════════════════════ RLS

alter table audit.audit_event enable row level security;
alter table audit.event_meta enable row level security;
alter table audit.action_registry enable row level security;
alter table audit.sign_in enable row level security;
alter table audit.known_device enable row level security;
alter table audit.alert_rule enable row level security;
alter table audit.alert enable row level security;
alter table audit.break_glass enable row level security;
alter table audit.legal_hold enable row level security;
alter table audit.evidence_pack enable row level security;
alter table audit.evidence_pack_event enable row level security;
alter table audit.access_review enable row level security;
alter table audit.access_review_item enable row level security;
alter table audit.vendor_access enable row level security;
alter table audit.export_log enable row level security;
alter table audit.saved_view enable row level security;
alter table audit.chain_check enable row level security;

/*
 * `authenticated` gets USAGE on the schema and SELECT on the tables —
 * and nothing else. There is no insert, update or delete policy on a
 * single table in this file. Every write goes through a SECURITY
 * DEFINER RPC, which is the only way an append-only log stays one.
 */
grant usage on schema audit to authenticated;
revoke all on all tables in schema audit from anon, authenticated;
grant select on
  audit.audit_event, audit.event_meta, audit.action_registry,
  audit.sign_in, audit.known_device, audit.alert_rule, audit.alert,
  audit.break_glass, audit.legal_hold, audit.evidence_pack,
  audit.evidence_pack_event, audit.access_review, audit.access_review_item,
  audit.vendor_access, audit.export_log, audit.saved_view, audit.chain_check
  to authenticated;

create policy audit_event_read on audit.audit_event
  for select to authenticated
  using (audit.fn_visible(actor_id, module, city_id,
           (select r.money from audit.action_registry r where r.action = audit_event.action)));

create policy event_meta_read on audit.event_meta
  for select to authenticated
  using (exists (select 1 from audit.audit_event e where e.id = event_meta.event_id));

create policy action_registry_read on audit.action_registry
  for select to authenticated using (authz.staff_id() is not null);

create policy sign_in_read on audit.sign_in
  for select to authenticated
  using (authz.audit_level() = 'full' or staff_user_id = authz.staff_id());

create policy known_device_read on audit.known_device
  for select to authenticated
  using (authz.audit_level() = 'full' or staff_user_id = authz.staff_id());

create policy alert_rule_read on audit.alert_rule
  for select to authenticated using (authz.audit_level() is not null);

create policy alert_read on audit.alert
  for select to authenticated
  using (authz.audit_level() in ('full', 'limited') or actor_id = authz.staff_id());

create policy break_glass_read on audit.break_glass
  for select to authenticated
  using (authz.audit_level() = 'full' or staff_user_id = authz.staff_id());

create policy legal_hold_read on audit.legal_hold
  for select to authenticated using (authz.audit_level() is not null);

create policy evidence_pack_read on audit.evidence_pack
  for select to authenticated using (authz.audit_level() = 'full');

create policy evidence_pack_event_read on audit.evidence_pack_event
  for select to authenticated using (authz.audit_level() = 'full');

create policy access_review_read on audit.access_review
  for select to authenticated using (authz.audit_level() is not null);

create policy access_review_item_read on audit.access_review_item
  for select to authenticated
  using (authz.audit_level() = 'full' or staff_user_id = authz.staff_id());

create policy vendor_access_read on audit.vendor_access
  for select to authenticated using (authz.audit_level() is not null);

create policy export_log_read on audit.export_log
  for select to authenticated
  using (authz.audit_level() in ('full', 'money') or staff_user_id = authz.staff_id());

create policy saved_view_read on audit.saved_view
  for select to authenticated
  using (owner_id = authz.staff_id() or (shared and authz.audit_level() is not null));

create policy chain_check_read on audit.chain_check
  for select to authenticated using (authz.audit_level() is not null);

/*
 * The append-only triggers stay as they are. They already refuse
 * UPDATE and DELETE on audit_event for everybody including the
 * owner, and the new columns change nothing about that.
 */
comment on schema audit is
  'The log. Readable through RLS by level, writable only through SECURITY DEFINER functions, and append-only at the trigger level even for the table owner.';
