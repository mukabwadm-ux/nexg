-- Communications & Automations: the admin console module built from the
-- owner's 13 screens (26 Nov 2026): Overview, Email, SMS, Push and WhatsApp
-- configuration, Message Templates, Automated Workflows, Scheduled Messages,
-- Manual & Bulk Messaging, Message Queue, Delivery Logs, Analytics & Reports
-- and Preferences & Consent. Every figure is counted from what NexG really
-- sent; the names, numbers and "Connected" badges in the mockups are not used.
--
-- It builds on what already sends:
--   fn_notify_enqueue -> notification_log (what staff may see) + notification_outbox
--   (the sealed envelope) -> notify-dispatch (Resend, Africa's Talking or Twilio,
--   Meta WhatsApp); user_notification (the bell, which push-dispatch turns into
--   browser push); native_push (the phone apps, when that migration is applied).
--
-- What this adds:
--
-- 1. The `communications` console module. Super admin and every role with full
--    Settings reach it at full; nobody else until a role is given it.
--    authz.comms_level(): 'full', 'limited', 'view' or null. Reading needs any
--    level; editing templates, workflows, schedules, the queue, consent and
--    suppression needs full or limited; a bulk send needs full.
-- 2. Tables, staff-only (RLS on, no policies; reached through the RPCs):
--      comms_setting         retry rules, email limits, cost per message
--      comms_template        staff-written templates per audience and channel
--      comms_workflow        "when this bell rings, send that template"
--      comms_schedule        one-time and recurring sends
--      comms_campaign        each bulk, manual, scheduled, test or resend run
--      comms_consent         append-only consent history (Kenya DPA 2019)
--      comms_suppression     addresses that must not be messaged, per channel
--      comms_unsubscribe     one opt-out link per marketing message
--      comms_provider_status what notify-dispatch says is configured (booleans
--                            and non-secret names only; never a key)
-- 3. notification_log accepts channel 'in_app' (a bell sent from this module).
-- 4. The outbox follows the module's settings: rpc_outbox_failed uses the retry
--    count and interval (defaults are today's: 5 attempts, 1, 4, 9, 16 minutes)
--    and can ring staff on a final failure; rpc_outbox_due holds email back past
--    the daily and per-minute limits (0 = no limit, the default).
-- 5. Marketing goes only to people whose latest marketing choice is yes, from
--    any of: comms_consent, guest_consent (checkout/account), the app's
--    notification choices (customer_notification_pref 'promotions'/'marketing').
--    No record means no. Every marketing message carries an opt-out link
--    (nexgapp.com/u/<token>) that records a "no" when used. Suppressed
--    addresses are skipped on every send from this module.
-- 6. A bulk send is two calls: rpc_comms_campaign_preview counts who would get
--    it (and who is left out, and why); rpc_comms_campaign_send must be given
--    that count back and refuses if the audience changed in between.
-- 7. cron 'comms-tick' (every minute) runs due scheduled messages; a run more
--    than 6 hours late is recorded as missed instead of sent.
-- 8. A trigger on user_notification runs enabled custom workflows for that
--    bell kind (never for bells this module raised itself). It never fails the
--    write it observes.
--
-- Rollback: select cron.unschedule('comms-tick'); drop trigger
-- user_notification_comms_workflow on public.user_notification; restore
-- rpc_outbox_due (20270128000200) and rpc_outbox_failed (20260101018300); drop
-- the functions below and the nine comms_* tables; restore the
-- notification_log channel check without 'in_app'; delete the 'marketing'
-- email_route row, the communications role_module_access / console_module rows
-- and the audit.action_registry rows with module 'communications'.

-- ═══════════════════════════════════════════════════════════════ 1. module

insert into public.console_module (key, label, section, href, sort)
values ('communications', 'Communications & Automations', 'Control', '/communications', 125)
on conflict (key) do update
set label = excluded.label, section = excluded.section, href = excluded.href, sort = excluded.sort;

insert into public.role_module_access (role_key, module_key, level, note)
select a.role_key, 'communications', 'full', 'Follows full Settings access'
  from public.role_module_access a
 where a.module_key = 'settings' and a.level = 'full'
on conflict (role_key, module_key) do nothing;

insert into public.role_module_access (role_key, module_key, level, note)
select 'super_admin', 'communications', 'full', null
 where exists (select 1 from public.role where key = 'super_admin')
on conflict (role_key, module_key) do update set level = 'full';

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('comms_template.saved', 'communications', 'info', false, 'Staff added or changed a message template'),
  ('comms_workflow.saved', 'communications', 'notice', false, 'Staff added or changed an automated workflow'),
  ('comms_workflow.toggled', 'communications', 'notice', false, 'Staff switched an automated message on or off'),
  ('comms_schedule.saved', 'communications', 'notice', false, 'Staff scheduled a message or changed a schedule'),
  ('comms_campaign.sent', 'communications', 'notice', false, 'Staff sent a bulk or manual message'),
  ('comms_message.test_sent', 'communications', 'info', false, 'Staff sent a test message'),
  ('comms_message.resent', 'communications', 'notice', false, 'Staff sent a message again from the delivery log'),
  ('comms_queue.changed', 'communications', 'notice', false, 'Staff retried or cancelled a queued message'),
  ('comms_setting.saved', 'communications', 'notice', false, 'Staff changed a communications setting'),
  ('comms_consent.recorded', 'communications', 'notice', false, 'Staff recorded a person''s consent or withdrawal'),
  ('comms_suppression.changed', 'communications', 'notice', false, 'Staff added or removed an address from a suppression list'),
  ('comms_export.downloaded', 'communications', 'info', false, 'Staff exported communications records')
on conflict (action) do nothing;

-- ═════════════════════════════════════════════ 2. who may read and act

create or replace function authz.comms_level()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when authz.is_super_admin() then 'full'
    else (
      select case
        when bool_or(a.level = 'full') then 'full'
        when bool_or(a.level = 'limited') then 'limited'
        when bool_or(a.level is not null and a.level <> 'none') then 'view'
      end
      from public.staff_user su
      join public.role_grant rg on rg.staff_user_id = su.id
      join public.role r on r.id = rg.role_id
      left join public.role_module_access a on a.role_key = r.key and a.module_key = 'communications'
      where su.id = authz.staff_id()
        and su.status = 'active'
        and rg.revoked_at is null
        and (rg.expires_at is null or rg.expires_at > now()))
  end
$$;
revoke all on function authz.comms_level() from public, anon;
grant execute on function authz.comms_level() to authenticated, service_role;

create or replace function public.fn_comms_reader_gate()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if authz.comms_level() is null then
    raise exception 'Communications are not open to your role.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.fn_comms_writer_gate(p_full boolean default false)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_level text := authz.comms_level();
begin
  if v_level is null or v_level = 'view'
     or (p_full and v_level <> 'full') then
    raise exception '%', case when p_full
        then 'Only full Communications access can send to an audience.'
        else 'Communications changes need edit access.' end
      using errcode = 'insufficient_privilege';
  end if;
  return authz.staff_id();
end;
$$;
revoke all on function public.fn_comms_reader_gate(), public.fn_comms_writer_gate(boolean) from public, anon;

-- ══════════════════════════════════════════ 3. notification_log: in-app

alter table public.notification_log drop constraint if exists notification_log_channel_check;
alter table public.notification_log add constraint notification_log_channel_check
  check (channel in ('sms', 'whatsapp', 'email', 'console', 'in_app')) not valid;
alter table public.notification_log validate constraint notification_log_channel_check;

create index if not exists notification_log_recent_idx on public.notification_log (created_at desc);
create index if not exists notification_log_campaign_idx on public.notification_log ((payload ->> 'campaign_id'))
  where payload ? 'campaign_id';

-- ═════════════════════════════════════════════════════════════ 4. tables

create table if not exists public.comms_setting (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.comms_setting (key, value) values
  ('retry', '{"max_attempts": 5, "base_minutes": 1, "on_final": "mark_failed"}'),
  ('email_limits', '{"daily": 0, "per_minute": 0}'),
  ('cost_kes', '{"email": 0, "sms": 0, "whatsapp": 0}'),
  ('site_url', '"https://nexgapp.com"')
on conflict (key) do nothing;
comment on table public.comms_setting is
  'Communications settings: retry rules (read by rpc_outbox_failed), email limits (rpc_outbox_due), what a message costs (for the estimates on the channel pages).';

create table if not exists public.comms_template (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  audience text not null default 'guests'
    check (audience in ('guests', 'hosts', 'riders', 'merchants', 'property_managers', 'staff', 'all')),
  category text not null default 'promotions'
    check (category in ('bookings_stays', 'orders_delivery', 'payments_payouts', 'account_verification',
                        'subscriptions', 'reminders', 'promotions', 'reviews', 'support', 'system')),
  purpose text not null default 'marketing' check (purpose in ('marketing', 'operational')),
  trigger_label text check (trigger_label is null or length(trigger_label) <= 120),
  channels text[] not null default '{email}'
    check (cardinality(channels) > 0 and channels <@ array['email', 'sms', 'whatsapp', 'in_app']::text[]),
  status text not null default 'draft' check (status in ('active', 'draft', 'inactive')),
  email_subject text check (email_subject is null or length(email_subject) <= 200),
  email_body text check (email_body is null or length(email_body) <= 10000),
  sms_body text check (sms_body is null or length(sms_body) <= 640),
  whatsapp_body text check (whatsapp_body is null or length(whatsapp_body) <= 4000),
  push_title text check (push_title is null or length(push_title) <= 80),
  push_body text check (push_body is null or length(push_body) <= 400),
  created_by uuid references public.staff_user (id) on delete set null,
  updated_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.comms_template is
  'Message templates staff write in Communications > Message Templates. {{first_name}}, {{name}} and {{city}} are filled per person. The app emails and uploaded email designs stay where they are (app_email.template, email_design).';

create table if not exists public.comms_workflow (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  trigger_kind text not null check (trigger_kind ~ '^[a-z0-9_.]{3,80}$' and trigger_kind !~ '^comms\.'),
  condition text not null default 'none' check (condition in ('none', 'marketing_consent')),
  template_id uuid not null references public.comms_template (id) on delete restrict,
  channels text[] not null
    check (cardinality(channels) > 0 and channels <@ array['email', 'sms', 'whatsapp', 'in_app']::text[]),
  delay_minutes integer not null default 0 check (delay_minutes between 0 and 43200),
  follow_up_template_id uuid references public.comms_template (id) on delete set null,
  follow_up_after_minutes integer check (follow_up_after_minutes between 1 and 43200),
  enabled boolean not null default false,
  fired_count integer not null default 0,
  last_fired_at timestamptz,
  created_by uuid references public.staff_user (id) on delete set null,
  updated_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comms_workflow_follow_up check ((follow_up_template_id is null) = (follow_up_after_minutes is null))
);
create index if not exists comms_workflow_kind_idx on public.comms_workflow (trigger_kind) where enabled;

create sequence if not exists public.comms_campaign_ref_seq;

create table if not exists public.comms_schedule (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  template_id uuid references public.comms_template (id) on delete restrict,
  subject text check (subject is null or length(subject) <= 200),
  body text check (body is null or length(body) <= 10000),
  audiences text[] not null
    check (cardinality(audiences) > 0
           and audiences <@ array['guests', 'hosts', 'riders', 'merchants', 'property_managers']::text[]),
  city_id uuid references public.city (id) on delete set null,
  channels text[] not null
    check (cardinality(channels) > 0 and channels <@ array['email', 'sms', 'whatsapp', 'in_app']::text[]),
  kind text not null check (kind in ('one_time', 'recurring')),
  frequency text check (frequency in ('daily', 'weekly', 'monthly')),
  weekday smallint check (weekday between 1 and 7),
  monthday smallint check (monthday between 1 and 28),
  time_of_day time,
  starts_on date,
  ends_on date,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_campaign_id uuid,
  runs integer not null default 0,
  missed integer not null default 0,
  status text not null default 'scheduled' check (status in ('scheduled', 'paused', 'completed', 'cancelled')),
  created_by uuid references public.staff_user (id) on delete set null,
  updated_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comms_schedule_has_words check (template_id is not null or body is not null),
  constraint comms_schedule_recurring check (
    kind = 'one_time' or (frequency is not null and time_of_day is not null
      and (frequency <> 'weekly' or weekday is not null)
      and (frequency <> 'monthly' or monthday is not null)))
);
create index if not exists comms_schedule_due_idx on public.comms_schedule (next_run_at) where status = 'scheduled';

create table if not exists public.comms_campaign (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('CMP-' || lpad(nextval('public.comms_campaign_ref_seq')::text, 4, '0')),
  name text not null,
  kind text not null check (kind in ('bulk', 'announcement', 'manual', 'scheduled', 'test', 'workflow', 'resend')),
  purpose text not null check (purpose in ('marketing', 'operational')),
  audiences text[] not null default '{}',
  city_id uuid references public.city (id) on delete set null,
  channels text[] not null,
  subject text,
  body text,
  template_id uuid references public.comms_template (id) on delete set null,
  schedule_id uuid references public.comms_schedule (id) on delete set null,
  workflow_id uuid references public.comms_workflow (id) on delete set null,
  status text not null default 'sending' check (status in ('sending', 'completed', 'failed', 'cancelled')),
  people integer not null default 0,
  queued integer not null default 0,
  skipped_consent integer not null default 0,
  skipped_suppressed integer not null default 0,
  skipped_no_address integer not null default 0,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists comms_campaign_recent_idx on public.comms_campaign (created_at desc);

create table if not exists public.comms_consent (
  id bigint generated always as identity primary key,
  person_key text,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  phone text,
  audience text,
  kind text not null check (kind in ('marketing', 'operational')),
  channel text not null default 'all' check (channel in ('all', 'email', 'sms', 'whatsapp', 'in_app')),
  granted boolean not null,
  source text not null check (source in ('app_onboarding', 'account_settings', 'checkout', 'marketing_campaign',
                                         'unsubscribe_link', 'web', 'support', 'staff', 'import', 'other')),
  evidence text check (evidence is null or length(evidence) <= 500),
  ip_hash text,
  staff_id uuid references public.staff_user (id) on delete set null,
  at timestamptz not null default now(),
  constraint comms_consent_someone check (person_key is not null or user_id is not null
                                          or email is not null or phone is not null)
);
create index if not exists comms_consent_key_idx on public.comms_consent (person_key, at desc) where person_key is not null;
create index if not exists comms_consent_user_idx on public.comms_consent (user_id, at desc) where user_id is not null;
create index if not exists comms_consent_email_idx on public.comms_consent (email, at desc) where email is not null;
create index if not exists comms_consent_phone_idx on public.comms_consent (phone, at desc) where phone is not null;
create index if not exists comms_consent_recent_idx on public.comms_consent (at desc);
comment on table public.comms_consent is
  'Append-only history of consent and withdrawal (Kenya Data Protection Act 2019, s.30-32). The latest row for a person, kind and channel wins.';

create table if not exists public.comms_suppression (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('all', 'email', 'sms', 'whatsapp', 'in_app')),
  address text not null check (length(address) between 3 and 200),
  reason text not null check (reason in ('opted_out', 'bounced', 'complaint', 'invalid', 'staff', 'legal')),
  note text check (note is null or length(note) <= 500),
  source text not null default 'staff',
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.staff_user (id) on delete set null,
  removed_reason text
);
create unique index if not exists comms_suppression_live_idx on public.comms_suppression (channel, address)
  where removed_at is null;

create table if not exists public.comms_unsubscribe (
  token text primary key,
  person_key text,
  user_id uuid,
  email text,
  phone text,
  campaign_id uuid references public.comms_campaign (id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table if not exists public.comms_provider_status (
  channel text primary key check (channel in ('email', 'sms', 'whatsapp', 'web_push', 'native_push')),
  provider text,
  configured boolean not null,
  detail jsonb not null default '{}'::jsonb,
  reported_at timestamptz not null default now()
);
comment on table public.comms_provider_status is
  'What notify-dispatch reports it can send with: provider names, sender IDs and true/false. Never a key or token.';

do $$
declare t text;
begin
  foreach t in array array['comms_setting', 'comms_template', 'comms_workflow', 'comms_schedule',
    'comms_campaign', 'comms_consent', 'comms_suppression', 'comms_unsubscribe', 'comms_provider_status'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;
revoke all on sequence public.comms_campaign_ref_seq from public, anon, authenticated;

/* The sender for messages from this module: on by default, switchable in
   Settings > Email routing like every other kind of email. */
insert into public.email_route (key, label, description, from_name, from_email, reply_to, enabled) values
  ('marketing', 'Announcements and marketing', 'Bulk, scheduled and workflow messages sent from Communications & Automations.',
   'NexG', 'info@nexgapp.com', 'info@nexgapp.com', true)
on conflict (key) do nothing;

-- ══════════════════════════════════════════════════════════ 5. helpers

create or replace function public.fn_comms_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select value from public.comms_setting where key = p_key $$;

/* An email lower-cased, a Kenyan phone in +254 form; anything else trimmed. */
create or replace function public.fn_comms_norm(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare v text := btrim(coalesce(p, ''));
begin
  if v = '' then return null; end if;
  if position('@' in v) > 0 then return lower(v); end if;
  v := regexp_replace(v, '[^0-9+]', '', 'g');
  if v ~ '^0[17][0-9]{8}$' then return '+254' || substr(v, 2); end if;
  if v ~ '^254[0-9]{9}$' then return '+' || v; end if;
  if v ~ '^[17][0-9]{8}$' then return '+254' || v; end if;
  return nullif(v, '');
end;
$$;

create or replace function public.fn_comms_mask(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null then null
    when p like 'account %' or p like '(%' then p
    when p like '+%' and length(p) > 6 then left(p, 4) || repeat('•', greatest(0, length(p) - 7)) || right(p, 3)
    when position('@' in p) > 1 then left(p, 1) || '•••@' || split_part(p, '@', 2)
    else '•••'
  end
$$;

/* {{first_name}}, {{name}}, {{city}} and any other {{key}} in the values. */
create or replace function public.fn_comms_render(p_text text, p_vars jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := p_text;
  k text;
begin
  if v is null then return null; end if;
  for k in select jsonb_object_keys(coalesce(p_vars, '{}'::jsonb)) loop
    v := regexp_replace(v, '\{\{\s*' || k || '\s*\}\}', coalesce(p_vars ->> k, ''), 'g');
  end loop;
  return regexp_replace(v, '\{\{\s*[a-z_]+\s*\}\}', '', 'g');
end;
$$;

create or replace function public.fn_comms_suppressed(p_channel text, p_address text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.comms_suppression s
                  where s.removed_at is null
                    and s.address = public.fn_comms_norm(p_address)
                    and s.channel in ('all', p_channel))
$$;

/*
 * Everyone in the given audiences, one row per person, with how to reach
 * them. Guests are guest rows (not anonymised, not blocked) and sign-in
 * accounts with no guest row that are not staff, hosts, riders or merchants.
 */
create or replace function public.fn_comms_people(p_audiences text[], p_city uuid default null)
returns table (audience text, person_key text, user_id uuid, guest_id uuid, name text,
               email text, phone text, city_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select 'guests', 'guest:' || g.id, g.user_id, g.id,
         coalesce(nullif(btrim(g.name), ''), nullif(u.raw_user_meta_data ->> 'full_name', ''), 'there'),
         public.fn_comms_norm(u.email), public.fn_comms_norm(coalesce(g.phone, u.phone)), null::uuid
    from public.guest g
    left join auth.users u on u.id = g.user_id
   where 'guests' = any (p_audiences) and p_city is null
     and g.anonymised_at is null and not g.blocked
  union all
  select 'guests', 'user:' || u.id, u.id, null,
         coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''), 'there'),
         public.fn_comms_norm(u.email), public.fn_comms_norm(u.phone), null
    from auth.users u
   where 'guests' = any (p_audiences) and p_city is null
     and not coalesce(u.is_anonymous, false) and u.deleted_at is null
     and not exists (select 1 from public.guest g where g.user_id = u.id)
     and not exists (select 1 from public.staff_user s where s.user_id = u.id)
     and not exists (select 1 from public.host_user h where h.user_id = u.id)
     and not exists (select 1 from public.merchant_user m where m.user_id = u.id)
     and not exists (select 1 from public.rider r where r.user_id = u.id)
  union all
  select 'hosts', 'host:' || h.id,
         (select hu.user_id from public.host_user hu where hu.host_id = h.id
           order by (hu.role = 'owner') desc, hu.created_at limit 1),
         null, coalesce(nullif(h.contact_name, ''), nullif(h.display_name, ''), 'Host'),
         public.fn_comms_norm(h.email), public.fn_comms_norm(h.phone), h.city_id
    from public.host h
   where 'hosts' = any (p_audiences) and h.status::text in ('live', 'paused')
     and (p_city is null or h.city_id = p_city)
  union all
  select 'riders', 'rider:' || r.id, r.user_id, null,
         coalesce(nullif(btrim(r.first_name || ' ' || coalesce(r.last_name, '')), ''), 'Rider'),
         public.fn_comms_norm(r.email), public.fn_comms_norm(r.phone), r.city_id
    from public.rider r
   where 'riders' = any (p_audiences) and r.status::text = 'active'
     and (p_city is null or r.city_id = p_city)
  union all
  select 'merchants', 'merchant:' || m.id,
         (select mu.user_id from public.merchant_user mu where mu.merchant_id = m.id
           order by (mu.role::text = 'owner') desc, mu.created_at limit 1),
         null, coalesce(nullif(m.contact_name, ''), m.trading_name),
         public.fn_comms_norm(m.contact_email), public.fn_comms_norm(m.contact_phone), m.city_id
    from public.merchant m
   where 'merchants' = any (p_audiences)
     and m.status::text in ('live', 'paused')
     and (p_city is null or m.city_id = p_city)
  union all
  select 'property_managers', 'pm:' || pm.id, null, null, pm.name,
         public.fn_comms_norm(pm.email), public.fn_comms_norm(pm.phone), null
    from public.property_manager pm
   where 'property_managers' = any (p_audiences) and p_city is null
     and pm.status = 'active'
$$;

/*
 * A person's latest choice for a kind of message on a channel: comms_consent
 * (any row for this person, account, email or phone), the guest's own consent
 * at checkout or in their account, and the app's notification choices.
 * Returns {granted, at, source}; granted is null when nothing was ever given.
 */
create or replace function public.fn_comms_consent(
  p_kind text, p_channel text, p_key text, p_user uuid, p_guest uuid, p_email text, p_phone text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('granted', x.granted, 'at', x.at, 'source', x.source)
      from (
        select c.granted, c.at, c.source
          from public.comms_consent c
         where c.kind = p_kind and c.channel in ('all', p_channel)
           and (c.person_key = p_key
                or (p_user is not null and c.user_id = p_user)
                or (p_email is not null and c.email = p_email)
                or (p_phone is not null and c.phone = p_phone))
        union all
        select gc.granted, gc.at, gc.source
          from public.guest_consent gc
         where p_kind = 'marketing' and p_guest is not null
           and gc.guest_id = p_guest and gc.kind = 'marketing'
        union all
        select coalesce((p.choices -> 'promotions' ->> p_channel)::boolean,
                        (p.choices -> 'promotions' ->> 'all')::boolean,
                        (p.choices -> 'marketing' ->> p_channel)::boolean,
                        (p.choices -> 'marketing' ->> 'all')::boolean),
               p.updated_at, 'account_settings'
          from public.customer_notification_pref p
         where p_kind = 'marketing' and p_user is not null and p.user_id = p_user
           and (p.choices ? 'promotions' or p.choices ? 'marketing')
      ) x
     where x.granted is not null
     order by x.at desc
     limit 1), jsonb_build_object('granted', null, 'at', null, 'source', null))
$$;

/* The next time a schedule runs after p_after, in Nairobi time; null when it has ended. */
create or replace function public.fn_comms_next_run(p public.comms_schedule, p_after timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_after at time zone 'Africa/Nairobi';
  v_day date := greatest(v_local::date, coalesce(p.starts_on, v_local::date));
  v_at timestamp;
  i integer;
begin
  if p.kind = 'one_time' then
    return case when p.runs = 0 then p.next_run_at end;
  end if;
  for i in 0..400 loop
    v_at := (v_day + i) + p.time_of_day;
    if p.ends_on is not null and (v_day + i) > p.ends_on then
      return null;
    end if;
    if v_at > v_local
       and (p.frequency = 'daily'
            or (p.frequency = 'weekly' and extract(isodow from (v_day + i)) = p.weekday)
            or (p.frequency = 'monthly' and extract(day from (v_day + i)) = p.monthday)) then
      return v_at at time zone 'Africa/Nairobi';
    end if;
  end loop;
  return null;
end;
$$;

-- ═══════════════════════════════════ 6. the outbox follows the settings

create or replace function public.rpc_outbox_failed(
  p_id uuid,
  p_error text,
  p_retryable boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule jsonb := coalesce(public.fn_comms_setting('retry'), '{}'::jsonb);
  v_max integer := greatest(1, least(coalesce((v_rule ->> 'max_attempts')::integer, 5), 10));
  v_base integer := greatest(1, least(coalesce((v_rule ->> 'base_minutes')::integer, 1), 60));
  v_attempts integer;
  v_status text;
  v_next timestamptz;
  v_channel text;
begin
  select attempts + 1, channel into v_attempts, v_channel
    from public.notification_outbox where id = p_id;

  /* Backing off base × 1, 4, 9, 16 … minutes: quadratic, as before. */
  if not p_retryable or v_attempts >= v_max then
    v_status := 'abandoned';
    v_next := now();
  else
    v_status := 'pending';
    v_next := now() + ((v_base * v_attempts * v_attempts) || ' minutes')::interval;
  end if;

  update public.notification_outbox
     set status = v_status,
         attempts = v_attempts,
         next_attempt_at = v_next,
         last_error = p_error
   where id = p_id;

  if v_status = 'abandoned' then
    update public.notification_log
       set status = 'failed', error = p_error
     where id = (select notification_log_id
                   from public.notification_outbox where id = p_id);
    if v_rule ->> 'on_final' = 'mark_failed_notify' then
      begin
        perform public.fn_notify_staff('communications', 'staff.comms.failed',
          'A message could not be sent',
          'A ' || coalesce(v_channel, '') || ' message failed after ' || v_attempts || ' attempt(s): '
            || left(coalesce(p_error, 'unknown'), 160),
          '/communications/logs?status=failed', 'warning'::public.notification_tone,
          null, null, null, 'comms-final-failure');
      exception when others then
        null;
      end;
    end if;
  end if;
end;
$$;
revoke execute on function public.rpc_outbox_failed(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.rpc_outbox_failed(uuid, text, boolean) to service_role;

create or replace function public.rpc_outbox_due(p_limit integer default 50)
returns table (
  id uuid,
  channel text,
  recipient text,
  template text,
  subject text,
  body text,
  html text,
  payload jsonb,
  attempts integer
)
language sql
security definer
set search_path = ''
as $$
  with lim as (
    select coalesce((public.fn_comms_setting('email_limits') ->> 'daily')::integer, 0) as daily,
           coalesce((public.fn_comms_setting('email_limits') ->> 'per_minute')::integer, 0) as per_minute
  ), used as (
    select
      (select count(*) from public.notification_outbox o
        where o.channel = 'email' and o.status = 'sent'
          and o.sent_at >= (date_trunc('day', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi')) as today,
      (select count(*) from public.notification_outbox o
        where o.channel = 'email' and o.status = 'sent' and o.sent_at >= now() - interval '1 minute') as minute
  ), room as (
    select case
             when lim.daily > 0 and used.today >= lim.daily then 0
             when lim.per_minute > 0 then greatest(0, least(
               lim.per_minute - used.minute,
               case when lim.daily > 0 then lim.daily - used.today else lim.per_minute end))
             when lim.daily > 0 then lim.daily - used.today
             else 1000000
           end as email_room
      from lim, used
  ), due as (
    select o.*, row_number() over (partition by (o.channel = 'email') order by o.next_attempt_at) as nth
      from public.notification_outbox o
     where o.status = 'pending'
       and o.next_attempt_at <= now()
       and (o.expires_at is null or o.expires_at > now())
  )
  select d.id, d.channel, d.recipient, d.template, d.subject, d.body, d.html, d.payload, d.attempts
    from due d, room
   where d.channel <> 'email' or d.nth <= room.email_room
   order by d.next_attempt_at
   limit greatest(1, least(p_limit, 200));
$$;
revoke execute on function public.rpc_outbox_due(integer) from public, anon, authenticated;
grant execute on function public.rpc_outbox_due(integer) to service_role;

-- ═════════════════════════════════════════════════════════ 7. sending

/*
 * One message to one person on one channel. Checks the address and the
 * suppression list, adds the opt-out link to marketing, queues it (or, for
 * in-app, rings the bell and logs it as sent). Returns 'queued',
 * 'suppressed' or 'no_address'. Consent is the caller's check.
 */
create or replace function public.fn_comms_send_one(
  p_channel text,
  p_person jsonb,
  p_subject text,
  p_body text,
  p_template text,
  p_purpose text,
  p_payload jsonb,
  p_delay_minutes integer default 0
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := nullif(p_person ->> 'user_id', '')::uuid;
  v_email text := public.fn_comms_norm(p_person ->> 'email');
  v_phone text := public.fn_comms_norm(p_person ->> 'phone');
  v_address text;
  v_vars jsonb := jsonb_build_object(
    'name', coalesce(p_person ->> 'name', 'there'),
    'first_name', split_part(coalesce(p_person ->> 'name', 'there'), ' ', 1),
    'city', coalesce(p_person ->> 'city', 'Nairobi'));
  v_subject text := public.fn_comms_render(p_subject, v_vars);
  v_body text := public.fn_comms_render(p_body, v_vars);
  v_token text;
  v_site text := coalesce(public.fn_comms_setting('site_url') #>> '{}', 'https://nexgapp.com');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object('audience', p_person ->> 'audience', 'purpose', p_purpose)
    || case when p_person ? 'city_id' and p_person ->> 'city_id' is not null
            then jsonb_build_object('city_id', p_person ->> 'city_id') else '{}'::jsonb end;
  v_out uuid;
  v_from text;
  v_route public.email_route;
begin
  v_address := case p_channel when 'email' then v_email when 'in_app' then v_email else v_phone end;
  if p_channel = 'in_app' and v_user is null then
    return 'no_address';
  end if;
  if p_channel <> 'in_app' and v_address is null then
    return 'no_address';
  end if;
  if v_address is not null and public.fn_comms_suppressed(p_channel, v_address) then
    return 'suppressed';
  end if;
  if coalesce(btrim(v_body), '') = '' then
    return 'no_address';
  end if;

  if p_purpose = 'marketing' then
    v_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
    insert into public.comms_unsubscribe (token, person_key, user_id, email, phone, campaign_id)
    values (v_token, p_person ->> 'person_key', v_user, v_email, v_phone,
            nullif(p_payload ->> 'campaign_id', '')::uuid);
    v_body := v_body || case p_channel
      when 'email' then E'\n\n—\nYou get these because you said yes to news from NexG. Stop them: '
                        || v_site || '/u/' || v_token
      when 'in_app' then ''
      else E'\nOpt out: ' || regexp_replace(v_site, '^https?://(www\.)?', '') || '/u/' || v_token
    end;
  end if;

  if p_channel = 'in_app' then
    perform public.fn_notify_user(v_user, 'comms.' || p_purpose, coalesce(v_subject, 'NexG'),
      left(v_body, 600), null, 'info'::public.notification_tone, null, null, null);
    insert into public.notification_log (channel, recipient, template, payload, status, sent_at)
    values ('in_app', 'account ' || left(v_user::text, 8), p_template, v_payload, 'sent', now());
    return 'queued';
  end if;

  if p_channel = 'email' then
    select * into v_route from public.email_route r where r.key = 'marketing';
    if found and v_route.enabled then
      v_from := v_route.from_name || ' <' || v_route.from_email || '>';
      v_payload := v_payload || jsonb_build_object('from', v_from)
        || case when v_route.reply_to is not null
                then jsonb_build_object('reply_to', v_route.reply_to) else '{}'::jsonb end;
    end if;
  end if;

  v_out := public.fn_notify_enqueue(
    p_channel => p_channel,
    p_recipient => v_address,
    p_template => p_template,
    p_body => v_body,
    p_subject => case when p_channel = 'email' then coalesce(v_subject, 'A message from NexG') else null end,
    p_payload => v_payload,
    p_sensitive => false);
  if v_out is null then
    return 'suppressed';
  end if;
  if coalesce(p_delay_minutes, 0) > 0 then
    update public.notification_outbox
       set next_attempt_at = now() + (p_delay_minutes || ' minutes')::interval
     where id = v_out;
  end if;
  return 'queued';
end;
$$;
revoke all on function public.fn_comms_send_one(text, jsonb, text, text, text, text, jsonb, integer) from public, anon, authenticated;

/* The words for a channel from a template, or the free text. */
create or replace function public.fn_comms_words(p_template public.comms_template, p_channel text,
                                                 p_subject text, p_body text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when p_template.id is null then jsonb_build_object('subject', p_subject, 'body', p_body)
    when p_channel = 'email' then jsonb_build_object('subject', p_template.email_subject,
                                                     'body', coalesce(p_template.email_body, p_body))
    when p_channel = 'sms' then jsonb_build_object('subject', null,
                                                   'body', coalesce(p_template.sms_body, p_template.whatsapp_body, p_body))
    when p_channel = 'whatsapp' then jsonb_build_object('subject', null,
                                                        'body', coalesce(p_template.whatsapp_body, p_template.sms_body, p_body))
    else jsonb_build_object('subject', coalesce(p_template.push_title, p_template.email_subject, p_subject),
                            'body', coalesce(p_template.push_body, p_template.sms_body, p_body))
  end
$$;

/*
 * The campaign engine. With p_campaign null it only counts (the preview);
 * with a campaign it sends. Marketing: a channel is used for a person only
 * when their latest marketing choice for it is yes.
 */
create or replace function public.fn_comms_run(p_spec jsonb, p_campaign uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audiences text[] := array(select jsonb_array_elements_text(coalesce(p_spec -> 'audiences', '[]'::jsonb)));
  v_channels text[] := array(select jsonb_array_elements_text(coalesce(p_spec -> 'channels', '[]'::jsonb)));
  v_city uuid := nullif(p_spec ->> 'city_id', '')::uuid;
  v_purpose text := coalesce(nullif(p_spec ->> 'purpose', ''), 'marketing');
  v_tpl public.comms_template;
  v_person record;
  v_channel text;
  v_consent jsonb;
  v_words jsonb;
  v_result text;
  v_reached boolean;
  v_any_consent boolean;
  v_people integer := 0;
  v_reachable integer := 0;
  v_queued integer := 0;
  v_no_consent integer := 0;
  v_suppressed integer := 0;
  v_no_address integer := 0;
  v_by_audience jsonb := '{}'::jsonb;
  v_by_channel jsonb := '{}'::jsonb;
  v_ref text;
begin
  if nullif(p_spec ->> 'template_id', '') is not null then
    select * into v_tpl from public.comms_template where id = (p_spec ->> 'template_id')::uuid;
  end if;
  if p_campaign is not null then
    select ref into v_ref from public.comms_campaign where id = p_campaign;
  end if;

  for v_person in
    select p.*, c.name as city_name
      from public.fn_comms_people(v_audiences, v_city) p
      left join public.city c on c.id = p.city_id
     limit 50000
  loop
    v_people := v_people + 1;
    v_reached := false;
    v_any_consent := false;
    foreach v_channel in array v_channels loop
      if v_purpose = 'marketing' then
        v_consent := public.fn_comms_consent('marketing', v_channel, v_person.person_key, v_person.user_id,
                                             v_person.guest_id, v_person.email, v_person.phone);
        if coalesce((v_consent ->> 'granted')::boolean, false) is not true then
          continue;
        end if;
      end if;
      v_any_consent := true;
      if v_channel = 'in_app' and v_person.user_id is null
         or v_channel = 'email' and v_person.email is null
         or v_channel in ('sms', 'whatsapp') and v_person.phone is null then
        continue;
      end if;
      if v_channel <> 'in_app' and public.fn_comms_suppressed(v_channel,
           case when v_channel = 'email' then v_person.email else v_person.phone end)
         or v_channel = 'in_app' and v_person.email is not null
            and public.fn_comms_suppressed('in_app', v_person.email) then
        v_suppressed := v_suppressed + 1;
        continue;
      end if;
      if p_campaign is null then
        v_result := 'queued';
      else
        v_words := public.fn_comms_words(v_tpl, v_channel, p_spec ->> 'subject', p_spec ->> 'body');
        v_result := public.fn_comms_send_one(v_channel,
          jsonb_build_object('user_id', v_person.user_id, 'email', v_person.email, 'phone', v_person.phone,
                             'name', v_person.name, 'city', v_person.city_name, 'city_id', v_person.city_id,
                             'audience', v_person.audience, 'person_key', v_person.person_key),
          v_words ->> 'subject', v_words ->> 'body',
          'comms.' || coalesce(v_ref, 'campaign'), v_purpose,
          jsonb_build_object('campaign_id', p_campaign, 'campaign_ref', v_ref));
      end if;
      if v_result = 'queued' then
        v_queued := v_queued + 1;
        v_reached := true;
        v_by_channel := jsonb_set(v_by_channel, array[v_channel],
          to_jsonb(coalesce((v_by_channel ->> v_channel)::integer, 0) + 1));
      elsif v_result = 'suppressed' then
        v_suppressed := v_suppressed + 1;
      end if;
    end loop;
    if v_reached then
      v_reachable := v_reachable + 1;
      v_by_audience := jsonb_set(v_by_audience, array[v_person.audience],
        to_jsonb(coalesce((v_by_audience ->> v_person.audience)::integer, 0) + 1));
    elsif not v_any_consent then
      v_no_consent := v_no_consent + 1;
    else
      v_no_address := v_no_address + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'people', v_people, 'reachable', v_reachable, 'messages', v_queued,
    'no_consent', v_no_consent, 'suppressed', v_suppressed, 'no_address', v_no_address,
    'by_audience', v_by_audience, 'by_channel', v_by_channel);
end;
$$;
revoke all on function public.fn_comms_run(jsonb, uuid) from public, anon, authenticated;

/* Checks a send's words and audience before anything is counted or sent. */
create or replace function public.fn_comms_check_spec(p jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p -> 'audiences') is distinct from 'array' or jsonb_array_length(p -> 'audiences') = 0 then
    raise exception 'Choose at least one audience.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(p -> 'audiences') a
              where a not in ('guests', 'hosts', 'riders', 'merchants', 'property_managers')) then
    raise exception 'That is not an audience.' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'channels') is distinct from 'array' or jsonb_array_length(p -> 'channels') = 0 then
    raise exception 'Choose at least one channel.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(p -> 'channels') c
              where c not in ('email', 'sms', 'whatsapp', 'in_app')) then
    raise exception 'That is not a channel.' using errcode = '22023';
  end if;
  if coalesce(p ->> 'purpose', 'marketing') not in ('marketing', 'operational') then
    raise exception 'That is not a purpose.' using errcode = '22023';
  end if;
  if nullif(p ->> 'template_id', '') is null and coalesce(btrim(p ->> 'body'), '') = '' then
    raise exception 'Write the message, or choose a template.' using errcode = '22023';
  end if;
  if length(coalesce(p ->> 'body', '')) > 10000 or length(coalesce(p ->> 'subject', '')) > 200 then
    raise exception 'The message is too long.' using errcode = '22023';
  end if;
end;
$$;

-- ═════════════════════════════════════════════════════════ 8. channels

/*
 * Each channel's state, from what really happened: what notify-dispatch
 * reported it can send with, else the last success and the last "not
 * configured" error. 'connected', 'not_connected' or 'unknown'.
 */
create or replace function public.fn_comms_channels()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_ch text;
  v_rep public.comms_provider_status;
  v_last_ok record;
  v_last_cfg record;
  v_status text;
  v_native jsonb := jsonb_build_object('installed', false);
  v_web record;
begin
  foreach v_ch in array array['email', 'sms', 'whatsapp'] loop
    select * into v_rep from public.comms_provider_status where channel = v_ch;
    select o.provider, o.sent_at into v_last_ok
      from public.notification_outbox o
     where o.channel = v_ch and o.status = 'sent' and o.provider is not null
     order by o.sent_at desc nulls last limit 1;
    select o.last_error, coalesce(o.next_attempt_at, o.created_at) as at into v_last_cfg
      from public.notification_outbox o
     where o.channel = v_ch and o.last_error ilike 'No % provider configured%'
     order by o.created_at desc limit 1;
    v_status := case
      when v_rep.channel is not null and v_rep.reported_at > now() - interval '7 days'
        then case when v_rep.configured then 'connected' else 'not_connected' end
      when v_last_ok.sent_at is not null
           and (v_last_cfg.at is null or v_last_ok.sent_at > v_last_cfg.at) then 'connected'
      when v_last_cfg.at is not null then 'not_connected'
      else 'unknown' end;
    v_out := v_out || jsonb_build_object(v_ch, jsonb_build_object(
      'status', v_status,
      'provider', coalesce(case when v_rep.configured then v_rep.provider end, v_last_ok.provider),
      'detail', coalesce(v_rep.detail, '{}'::jsonb),
      'reported_at', v_rep.reported_at,
      'last_sent_at', v_last_ok.sent_at,
      'last_config_error', v_last_cfg.last_error,
      'last_config_error_at', v_last_cfg.at));
  end loop;

  select count(*) filter (where pushed_at is not null and created_at > now() - interval '30 days') as pushed_30d,
         max(pushed_at) as last_pushed
    into v_web from public.user_notification;
  select * into v_rep from public.comms_provider_status where channel = 'web_push';
  v_out := v_out || jsonb_build_object('web_push', jsonb_build_object(
    'status', case
      when v_rep.channel is not null and v_rep.reported_at > now() - interval '7 days'
        then case when v_rep.configured then 'connected' else 'not_connected' end
      when v_web.pushed_30d > 0 then 'connected'
      else 'unknown' end,
    'provider', 'vapid',
    'subscriptions', (select count(*) from public.push_subscription),
    'last_sent_at', v_web.last_pushed,
    'pushed_30d', v_web.pushed_30d));

  if to_regclass('native_push.delivery') is not null then
    execute $q$
      select jsonb_build_object(
        'installed', true,
        'installations', (select count(*) from native_push.installation),
        'by_app', coalesce((select jsonb_object_agg(app, n) from (
            select app, count(*) as n from native_push.installation group by app) a), '{}'::jsonb),
        'sent_30d', (select count(*) from native_push.delivery
                      where result = 'sent' and finished_at > now() - interval '30 days'),
        'failed_30d', (select count(*) from native_push.delivery
                        where result in ('failed', 'gone') and finished_at > now() - interval '30 days'),
        'waiting', (select count(*) from native_push.delivery where result is null),
        'last_sent_at', (select max(finished_at) from native_push.delivery where result = 'sent'))
    $q$ into v_native;
  end if;
  v_out := v_out || jsonb_build_object('native_push', v_native || jsonb_build_object(
    'status', case
      when not coalesce((v_native ->> 'installed')::boolean, false) then 'not_installed'
      when coalesce((v_native ->> 'sent_30d')::integer, 0) > 0 then 'connected'
      when coalesce((v_native ->> 'waiting')::integer, 0) > 0 then 'not_connected'
      else 'unknown' end));
  v_out := v_out || jsonb_build_object('in_app', jsonb_build_object('status', 'connected', 'provider', 'nexg'));
  return v_out;
end;
$$;
revoke all on function public.fn_comms_channels() from public, anon, authenticated;

/* notify-dispatch says what it can send with. Service role only. */
create or replace function public.rpc_comms_provider_report(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ch text;
begin
  foreach v_ch in array array['email', 'sms', 'whatsapp', 'web_push', 'native_push'] loop
    if p ? v_ch and jsonb_typeof(p -> v_ch) = 'object' then
      insert into public.comms_provider_status (channel, provider, configured, detail, reported_at)
      values (v_ch, left(p -> v_ch ->> 'provider', 40), coalesce((p -> v_ch ->> 'configured')::boolean, false),
              coalesce(p -> v_ch -> 'detail', '{}'::jsonb) - 'key' - 'token' - 'secret', now())
      on conflict (channel) do update set
        provider = excluded.provider, configured = excluded.configured,
        detail = excluded.detail, reported_at = excluded.reported_at;
    end if;
  end loop;
end;
$$;
revoke all on function public.rpc_comms_provider_report(jsonb) from public, anon, authenticated;
grant execute on function public.rpc_comms_provider_report(jsonb) to service_role;

-- ═════════════════════════════════════════════════════════ 9. readers

/* KPIs for a period, all channels or one: what was sent, failed, waiting. */
create or replace function public.fn_comms_kpis(p_from timestamptz, p_to timestamptz, p_channel text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', count(*) filter (where l.status <> 'skipped'),
    'sent', count(*) filter (where l.status = 'sent'),
    'queued', count(*) filter (where l.status = 'queued'),
    'failed', count(*) filter (where l.status = 'failed'),
    'skipped', count(*) filter (where l.status = 'skipped'),
    'retried', (select count(*) from public.notification_outbox o
                 where o.created_at >= p_from and o.created_at < p_to and o.attempts > 1
                   and (p_channel is null or o.channel = p_channel)),
    'recipients', count(distinct l.recipient) filter (where l.status <> 'skipped'))
    from public.notification_log l
   where l.created_at >= p_from and l.created_at < p_to
     and l.channel <> 'console'
     and (p_channel is null or l.channel = p_channel)
$$;
revoke all on function public.fn_comms_kpis(timestamptz, timestamptz, text) from public, anon, authenticated;

/* Who a logged message was for, from what it says about itself. */
create or replace function public.fn_comms_audience_of(p_template text, p_payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(p_payload ->> 'audience', ''), case
    when p_template like 'bell\_staff.%' or p_template like 'staff\_%' or p_template like 'form\_%' then 'staff'
    when p_template like '%rider%' then 'riders'
    when p_template like '%merchant%' or p_template like 'partner\_%' then 'merchants'
    when p_template like '%host%' then 'hosts'
    when p_template like 'app\_%' or p_template like 'bell\_order.%' or p_template like 'bell\_refund.%'
      or p_template like '%guest%' or p_template like '%stay%' or p_template like 'ticket%' then 'guests'
    else 'other' end)
$$;

/* The day buckets of a period: by day, or by hour for one day. */
create or replace function public.fn_comms_trend(p_from timestamptz, p_to timestamptz, p_channel text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    select case when p_to - p_from <= interval '1 day 1 minute' then 'hour' else 'day' end as unit
  ), s as (
    select generate_series(date_trunc((select unit from b), p_from at time zone 'Africa/Nairobi'),
                           (p_to - interval '1 second') at time zone 'Africa/Nairobi',
                           ('1 ' || (select unit from b))::interval) as at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', s.at, 'sent', coalesce(x.sent, 0), 'failed', coalesce(x.failed, 0),
      'queued', coalesce(x.queued, 0), 'total', coalesce(x.total, 0),
      'email', coalesce(x.email, 0), 'sms', coalesce(x.sms, 0),
      'whatsapp', coalesce(x.whatsapp, 0), 'in_app', coalesce(x.in_app, 0))
    order by s.at), '[]'::jsonb)
    from s
    left join (
      select date_trunc((select unit from b), l.created_at at time zone 'Africa/Nairobi') as at,
             count(*) filter (where l.status = 'sent') as sent,
             count(*) filter (where l.status = 'failed') as failed,
             count(*) filter (where l.status = 'queued') as queued,
             count(*) filter (where l.status <> 'skipped') as total,
             count(*) filter (where l.channel = 'email' and l.status <> 'skipped') as email,
             count(*) filter (where l.channel = 'sms' and l.status <> 'skipped') as sms,
             count(*) filter (where l.channel = 'whatsapp' and l.status <> 'skipped') as whatsapp,
             count(*) filter (where l.channel = 'in_app' and l.status <> 'skipped') as in_app
        from public.notification_log l
       where l.created_at >= p_from and l.created_at < p_to and l.channel <> 'console'
         and (p_channel is null or l.channel = p_channel)
       group by 1) x on x.at = s.at
$$;
revoke all on function public.fn_comms_trend(timestamptz, timestamptz, text) from public, anon, authenticated;

create or replace function public.fn_comms_range(p_from date, p_to date)
returns tstzrange
language sql
immutable
set search_path = ''
as $$
  select tstzrange((coalesce(p_from, current_date - 29)::timestamp at time zone 'Africa/Nairobi'),
                   ((coalesce(p_to, current_date) + 1)::timestamp at time zone 'Africa/Nairobi'))
$$;

create or replace function public.fn_comms_log_row(l public.notification_log)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'ref', 'DL-' || upper(left(replace(l.id::text, '-', ''), 6)),
    'channel', l.channel, 'recipient', public.fn_comms_mask(l.recipient),
    'template', l.template, 'audience', public.fn_comms_audience_of(l.template, l.payload),
    'status', l.status, 'error', l.error, 'created_at', l.created_at, 'sent_at', l.sent_at,
    'campaign_ref', l.payload ->> 'campaign_ref',
    'subject', coalesce(o.subject, l.payload ->> 'kind', null),
    'attempts', coalesce(o.attempts, case when l.status = 'sent' then 1 else 0 end),
    'outbox_status', o.status, 'provider', o.provider,
    'seconds', case when l.sent_at is not null then extract(epoch from (l.sent_at - l.created_at)) end,
    'resendable', (o.id is not null and not o.sensitive and o.body is not null
                   and l.channel in ('email', 'sms', 'whatsapp')))
    from (select 1) one
    left join lateral (select * from public.notification_outbox o
                        where o.notification_log_id = l.id limit 1) o on true
$$;
revoke all on function public.fn_comms_log_row(public.notification_log) from public, anon, authenticated;

/* Overview: KPIs, channels, highlights, recent messages, counts for the cards. */
create or replace function public.rpc_comms_overview(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r tstzrange := public.fn_comms_range(p_from, p_to);
  v_len interval := upper(r) - lower(r);
begin
  perform public.fn_comms_reader_gate();
  return jsonb_build_object(
    'level', authz.comms_level(),
    'kpis', public.fn_comms_kpis(lower(r), upper(r), null),
    'prev', public.fn_comms_kpis(lower(r) - v_len, lower(r), null),
    'channels', public.fn_comms_channels(),
    'by_channel', (select coalesce(jsonb_object_agg(channel, n), '{}'::jsonb) from (
        select channel, count(*) as n from public.notification_log
         where created_at <@ r and status <> 'skipped' and channel <> 'console' group by channel) x),
    'audiences', (select coalesce(jsonb_object_agg(audience, n), '{}'::jsonb) from (
        select audience, count(*) as n from public.fn_comms_people(
          array['guests', 'hosts', 'riders', 'merchants', 'property_managers'], null) group by audience) x),
    'counts', jsonb_build_object(
      'templates', (select count(*) from public.comms_template where status = 'active'),
      'workflows', (select count(*) from public.comms_workflow where enabled)
                   + (select count(*) from public.notification_email_kind where enabled),
      'scheduled', (select count(*) from public.comms_schedule where status = 'scheduled'),
      'queue', (select count(*) from public.notification_outbox where status = 'pending'),
      'suppressed', (select count(*) from public.comms_suppression where removed_at is null),
      'consents', (select count(*) from public.comms_consent)),
    'workflows', (select coalesce(jsonb_agg(w order by w ->> 'name'), '[]'::jsonb) from (
        select jsonb_build_object('key', 'kind:' || k.kind, 'name', coalesce(k.note, k.kind),
                                  'trigger', k.kind, 'enabled', k.enabled, 'channels', '["email"]'::jsonb,
                                  'source', 'system') as w
          from public.notification_email_kind k where k.kind not like 'staff.%'
        union all
        select jsonb_build_object('key', 'wf:' || w.id, 'name', w.name, 'trigger', w.trigger_kind,
                                  'enabled', w.enabled, 'channels', to_jsonb(w.channels), 'source', 'custom')
          from public.comms_workflow w) x),
    'recent', (select coalesce(jsonb_agg(public.fn_comms_log_row(l) order by l.created_at desc), '[]'::jsonb)
                 from (select * from public.notification_log
                        where channel <> 'console' order by created_at desc limit 8) l),
    'trend', public.fn_comms_trend(lower(r), upper(r), null));
end;
$$;

/* One channel's page: email, sms, whatsapp or push (in-app + push). */
create or replace function public.rpc_comms_channel(p_channel text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r tstzrange := public.fn_comms_range(p_from, p_to);
  v_len interval := upper(r) - lower(r);
  v_ch text := case when p_channel = 'push' then 'in_app' else p_channel end;
  v_month timestamptz := date_trunc('month', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
begin
  perform public.fn_comms_reader_gate();
  if p_channel not in ('email', 'sms', 'whatsapp', 'push') then
    raise exception 'That is not a channel.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'level', authz.comms_level(),
    'kpis', public.fn_comms_kpis(lower(r), upper(r), v_ch),
    'prev', public.fn_comms_kpis(lower(r) - v_len, lower(r), v_ch),
    'channels', public.fn_comms_channels(),
    'trend', public.fn_comms_trend(greatest(lower(r), upper(r) - interval '7 days'), upper(r), v_ch),
    'month', jsonb_build_object(
      'sent', (select count(*) from public.notification_log where channel = v_ch and status = 'sent' and created_at >= v_month),
      'failed', (select count(*) from public.notification_log where channel = v_ch and status = 'failed' and created_at >= v_month),
      'total', (select count(*) from public.notification_log where channel = v_ch and status <> 'skipped' and created_at >= v_month)),
    'cost_kes', coalesce((public.fn_comms_setting('cost_kes') ->> p_channel)::numeric, 0),
    'settings', jsonb_build_object('retry', public.fn_comms_setting('retry'),
                                   'email_limits', public.fn_comms_setting('email_limits'),
                                   'cost_kes', public.fn_comms_setting('cost_kes')),
    'audiences', (select coalesce(jsonb_object_agg(a, n), '{}'::jsonb) from (
        select public.fn_comms_audience_of(template, payload) as a, count(*) as n
          from public.notification_log where channel = v_ch and created_at <@ r and status <> 'skipped'
         group by 1) x),
    'route', (select to_jsonb(e) - 'updated_by' from public.email_route e where e.key = 'marketing'),
    'routes', (select coalesce(jsonb_agg(jsonb_build_object('key', e.key, 'label', e.label, 'from_name', e.from_name,
                 'from_email', e.from_email, 'reply_to', e.reply_to, 'enabled', e.enabled) order by e.key), '[]'::jsonb)
                 from public.email_route e),
    'templates', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'audience', t.audience,
                     'trigger', t.trigger_label, 'status', t.status, 'updated_at', t.updated_at) order by t.updated_at desc), '[]'::jsonb)
                    from (select * from public.comms_template where v_ch = any (channels)
                          order by updated_at desc limit 6) t),
    'workflows', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'trigger', w.trigger_kind,
                     'enabled', w.enabled, 'fired', w.fired_count) order by w.name), '[]'::jsonb)
                    from public.comms_workflow w where v_ch = any (w.channels)),
    'system_kinds', case when p_channel = 'email' then (
        select coalesce(jsonb_agg(jsonb_build_object('kind', k.kind, 'note', k.note, 'enabled', k.enabled)
                                  order by k.kind), '[]'::jsonb) from public.notification_email_kind k) end,
    'whatsapp', case when p_channel = 'whatsapp' then jsonb_build_object(
        'conversations', (select count(*) from public.msg_conversation c where c.origin_channel = 'whatsapp'),
        'incoming_period', (select count(*) from public.msg_message m
                              join public.msg_conversation c on c.id = m.conversation_id
                             where c.origin_channel = 'whatsapp' and m.channel_out is null
                               and m.created_at <@ r),
        'replies_period', (select count(*) from public.msg_message m
                             where m.channel_out = 'whatsapp' and m.created_at <@ r)) end,
    'push', case when p_channel = 'push' then jsonb_build_object(
        'bells_period', (select count(*) from public.user_notification where created_at <@ r),
        'read_period', (select count(*) from public.user_notification where created_at <@ r and read_at is not null),
        'pushed_period', (select count(*) from public.user_notification where created_at <@ r and pushed_at is not null),
        'reached_period', (select count(distinct user_id) from public.user_notification where created_at <@ r),
        'subscriptions', (select coalesce(jsonb_object_agg(coalesce(surface, 'browser'), n), '{}'::jsonb) from (
            select surface, count(*) as n from public.push_subscription group by surface) s),
        'kinds', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'n', n) order by n desc), '[]'::jsonb) from (
            select kind, count(*) as n from public.user_notification where created_at <@ r
             group by kind order by count(*) desc limit 8) k)) end,
    'recent', (select coalesce(jsonb_agg(public.fn_comms_log_row(l) order by l.created_at desc), '[]'::jsonb)
                 from (select * from public.notification_log where channel = v_ch
                        order by created_at desc limit 6) l));
end;
$$;

/* Templates: the list with counts per category, and one template in full. */
create or replace function public.rpc_comms_templates(
  p_category text default null, p_audience text default null, p_channel text default null,
  p_status text default null, p_search text default null, p_page integer default 1, p_per integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_per integer := greatest(5, least(coalesce(p_per, 10), 100));
  v_off integer := (greatest(coalesce(p_page, 1), 1) - 1) * v_per;
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform public.fn_comms_reader_gate();
  return jsonb_build_object(
    'level', authz.comms_level(),
    'kpis', jsonb_build_object(
      'total', (select count(*) from public.comms_template),
      'active', (select count(*) from public.comms_template where status = 'active'),
      'draft', (select count(*) from public.comms_template where status = 'draft'),
      'inactive', (select count(*) from public.comms_template where status = 'inactive'),
      'categories', (select count(distinct category) from public.comms_template),
      'audiences', (select count(distinct audience) from public.comms_template),
      'app_emails', (select count(*) from app_email.template),
      'designs', (select count(*) from public.email_design)),
    'categories', (select coalesce(jsonb_object_agg(category, n), '{}'::jsonb) from (
        select category, count(*) as n from public.comms_template group by category) x),
    'total', (select count(*) from public.comms_template t
               where (p_category is null or t.category = p_category)
                 and (p_audience is null or t.audience = p_audience)
                 and (p_channel is null or p_channel = any (t.channels))
                 and (p_status is null or t.status = p_status)
                 and (v_q is null or t.name ilike '%' || v_q || '%' or coalesce(t.trigger_label, '') ilike '%' || v_q || '%')),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.updated_at desc), '[]'::jsonb) from (
        select t.* from public.comms_template t
         where (p_category is null or t.category = p_category)
           and (p_audience is null or t.audience = p_audience)
           and (p_channel is null or p_channel = any (t.channels))
           and (p_status is null or t.status = p_status)
           and (v_q is null or t.name ilike '%' || v_q || '%' or coalesce(t.trigger_label, '') ilike '%' || v_q || '%')
         order by t.updated_at desc offset v_off limit v_per) t));
end;
$$;

/* Workflows: the system's own automations and the custom ones, with the bell kinds to trigger on. */
create or replace function public.rpc_comms_workflows()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_comms_reader_gate();
  return jsonb_build_object(
    'level', authz.comms_level(),
    'custom', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.id, 'name', w.name, 'trigger_kind', w.trigger_kind, 'condition', w.condition,
        'template_id', w.template_id, 'template_name', t.name, 'channels', w.channels,
        'delay_minutes', w.delay_minutes, 'follow_up_template_id', w.follow_up_template_id,
        'follow_up_template_name', f.name, 'follow_up_after_minutes', w.follow_up_after_minutes,
        'enabled', w.enabled, 'fired_count', w.fired_count, 'last_fired_at', w.last_fired_at,
        'audience', t.audience, 'updated_at', w.updated_at) order by w.name), '[]'::jsonb)
        from public.comms_workflow w
        join public.comms_template t on t.id = w.template_id
        left join public.comms_template f on f.id = w.follow_up_template_id),
    'system', (select coalesce(jsonb_agg(jsonb_build_object(
        'kind', k.kind, 'note', k.note, 'enabled', k.enabled,
        'sent_30d', (select count(*) from public.notification_log l
                      where l.template = 'bell_' || k.kind and l.created_at > now() - interval '30 days'
                        and l.status = 'sent')) order by k.kind), '[]'::jsonb)
        from public.notification_email_kind k),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('key', e.key, 'label', e.label,
                 'description', e.description, 'enabled', e.enabled) order by e.key), '[]'::jsonb)
                 from public.email_route e where e.key like 'app\_%'),
    'kinds', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from (
        select kind as k from public.notification_email_kind
        union
        select distinct kind from public.user_notification
         where created_at > now() - interval '90 days' and kind not like 'comms.%') x),
    'templates', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'channels', t.channels,
                     'purpose', t.purpose, 'audience', t.audience) order by t.name), '[]'::jsonb)
                    from public.comms_template t where t.status = 'active'));
end;
$$;

/* Scheduled messages: the list, the calendar month and the next seven days. */
create or replace function public.rpc_comms_schedules(p_month date default null, p_page integer default 1,
                                                       p_per integer default 5, p_search text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_per integer := greatest(5, least(coalesce(p_per, 5), 50));
  v_off integer := (greatest(coalesce(p_page, 1), 1) - 1) * v_per;
  v_month date := date_trunc('month', coalesce(p_month, (now() at time zone 'Africa/Nairobi')::date))::date;
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_s public.comms_schedule;
  v_runs jsonb := '[]'::jsonb;
  v_at timestamptz;
  v_until timestamptz := greatest((v_month + interval '1 month')::timestamp at time zone 'Africa/Nairobi',
                                  now() + interval '8 days');
  i integer;
begin
  perform public.fn_comms_reader_gate();
  /* Every run in the month shown and the next week, worked out from the rule. */
  for v_s in select * from public.comms_schedule where status = 'scheduled' and next_run_at is not null loop
    v_at := v_s.next_run_at;
    i := 0;
    while v_at is not null and v_at < v_until and i < 62 loop
      v_runs := v_runs || jsonb_build_object('id', v_s.id, 'name', v_s.name, 'at', v_at,
                                             'channels', v_s.channels, 'audiences', v_s.audiences);
      exit when v_s.kind = 'one_time';
      v_at := public.fn_comms_next_run(v_s, v_at);
      i := i + 1;
    end loop;
  end loop;
  return jsonb_build_object(
    'level', authz.comms_level(),
    'month', v_month,
    'kpis', jsonb_build_object(
      'total', (select count(*) from public.comms_schedule where status <> 'cancelled'),
      'sent', (select coalesce(sum(runs), 0) from public.comms_schedule),
      'pending', (select count(*) from public.comms_schedule where status = 'scheduled'),
      'recurring', (select count(*) from public.comms_schedule where kind = 'recurring' and status in ('scheduled', 'paused')),
      'audiences', (select count(distinct a) from public.comms_schedule, unnest(audiences) a where status = 'scheduled'),
      'missed', (select coalesce(sum(missed), 0) from public.comms_schedule)),
    'total', (select count(*) from public.comms_schedule s
               where s.status <> 'cancelled' and (v_q is null or s.name ilike '%' || v_q || '%')),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'template_id', s.template_id, 'template_name', t.name,
        'subject', s.subject, 'body', s.body, 'audiences', s.audiences, 'city_id', s.city_id,
        'channels', s.channels, 'kind', s.kind, 'frequency', s.frequency, 'weekday', s.weekday,
        'monthday', s.monthday, 'time_of_day', s.time_of_day, 'starts_on', s.starts_on, 'ends_on', s.ends_on,
        'next_run_at', s.next_run_at, 'last_run_at', s.last_run_at, 'runs', s.runs, 'missed', s.missed,
        'status', s.status) order by s.next_run_at nulls last, s.created_at desc), '[]'::jsonb)
        from (select * from public.comms_schedule s
               where s.status <> 'cancelled' and (v_q is null or s.name ilike '%' || v_q || '%')
               order by s.next_run_at nulls last, s.created_at desc offset v_off limit v_per) s
        left join public.comms_template t on t.id = s.template_id),
    'runs', v_runs,
    'templates', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'channels', t.channels,
                     'purpose', t.purpose) order by t.name), '[]'::jsonb)
                    from public.comms_template t where t.status = 'active'));
end;
$$;

/* Bulk messaging: KPIs, the history and its results, the audience sizes. */
create or replace function public.rpc_comms_campaigns(p_from date, p_to date, p_search text default null,
                                                       p_page integer default 1, p_per integer default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r tstzrange := public.fn_comms_range(p_from, p_to);
  v_per integer := greatest(5, least(coalesce(p_per, 5), 50));
  v_off integer := (greatest(coalesce(p_page, 1), 1) - 1) * v_per;
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform public.fn_comms_reader_gate();
  return jsonb_build_object(
    'level', authz.comms_level(),
    'kpis', (select jsonb_build_object(
        'messages', count(*) filter (where l.status <> 'skipped'),
        'sent', count(*) filter (where l.status = 'sent'),
        'failed', count(*) filter (where l.status = 'failed'),
        'queued', count(*) filter (where l.status = 'queued'))
        from public.notification_log l
       where l.created_at <@ r and l.payload ? 'campaign_id'
         and l.payload ->> 'purpose' is not null),
    'campaigns', (select count(*) from public.comms_campaign
                   where created_at <@ r and kind in ('bulk', 'announcement', 'manual', 'scheduled')),
    'in_progress', (select count(distinct c.id) from public.comms_campaign c
                     where exists (select 1 from public.notification_log l
                                    where l.payload ->> 'campaign_id' = c.id::text and l.status = 'queued')),
    'audiences', (select coalesce(jsonb_object_agg(audience, n), '{}'::jsonb) from (
        select audience, count(*) as n from public.fn_comms_people(
          array['guests', 'hosts', 'riders', 'merchants', 'property_managers'], null) group by audience) x),
    'total', (select count(*) from public.comms_campaign c
               where c.kind in ('bulk', 'announcement', 'manual', 'scheduled')
                 and (v_q is null or c.name ilike '%' || v_q || '%' or c.ref ilike '%' || v_q || '%')),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'ref', c.ref, 'name', c.name, 'kind', c.kind, 'purpose', c.purpose,
        'audiences', c.audiences, 'channels', c.channels, 'people', c.people, 'queued', c.queued,
        'skipped_consent', c.skipped_consent, 'skipped_suppressed', c.skipped_suppressed,
        'skipped_no_address', c.skipped_no_address, 'status', c.status, 'created_at', c.created_at,
        'sent', (select count(*) from public.notification_log l
                  where l.payload ->> 'campaign_id' = c.id::text and l.status = 'sent'),
        'failed', (select count(*) from public.notification_log l
                    where l.payload ->> 'campaign_id' = c.id::text and l.status = 'failed'),
        'waiting', (select count(*) from public.notification_log l
                     where l.payload ->> 'campaign_id' = c.id::text and l.status = 'queued'))
        order by c.created_at desc), '[]'::jsonb)
        from (select * from public.comms_campaign c
               where c.kind in ('bulk', 'announcement', 'manual', 'scheduled')
                 and (v_q is null or c.name ilike '%' || v_q || '%' or c.ref ilike '%' || v_q || '%')
               order by c.created_at desc offset v_off limit v_per) c),
    'templates', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'channels', t.channels,
                     'purpose', t.purpose, 'email_subject', t.email_subject, 'email_body', t.email_body,
                     'sms_body', t.sms_body) order by t.name), '[]'::jsonb)
                    from public.comms_template t where t.status = 'active'),
    'channels', public.fn_comms_channels());
end;
$$;

/* The queue: what is waiting, sending, retrying and failed, with the health per channel. */
create or replace function public.rpc_comms_queue(p_channel text default null, p_status text default null,
                                                   p_audience text default null, p_search text default null,
                                                   p_page integer default 1, p_per integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_per integer := greatest(5, least(coalesce(p_per, 10), 100));
  v_off integer := (greatest(coalesce(p_page, 1), 1) - 1) * v_per;
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_day timestamptz := now() - interval '24 hours';
begin
  perform public.fn_comms_reader_gate();
  return jsonb_build_object(
    'level', authz.comms_level(),
    'kpis', (select jsonb_build_object(
        'total', count(*),
        'sent', count(*) filter (where status = 'sent'),
        'waiting', count(*) filter (where status = 'pending' and attempts = 0),
        'retrying', count(*) filter (where status = 'pending' and attempts > 0),
        'failed', count(*) filter (where status = 'abandoned'),
        'due_now', count(*) filter (where status = 'pending' and next_attempt_at <= now()))
        from public.notification_outbox where created_at >= v_day),
    'by_channel', (select coalesce(jsonb_object_agg(channel, n), '{}'::jsonb) from (
        select channel, count(*) as n from public.notification_outbox where created_at >= v_day group by channel) x),
    'rate_per_min', (select round(count(*) / 60.0, 1) from public.notification_outbox
                      where status = 'sent' and sent_at > now() - interval '1 hour'),
    'oldest_waiting', (select min(next_attempt_at) from public.notification_outbox
                        where status = 'pending' and next_attempt_at <= now()),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('at', h.at,
                'sent', coalesce(x.sent, 0), 'waiting', coalesce(x.waiting, 0),
                'retrying', coalesce(x.retrying, 0), 'failed', coalesce(x.failed, 0)) order by h.at), '[]'::jsonb)
                from generate_series(date_trunc('hour', now() - interval '23 hours'), date_trunc('hour', now()),
                                     interval '1 hour') h(at)
                left join (select date_trunc('hour', created_at) as at,
                                  count(*) filter (where status = 'sent') as sent,
                                  count(*) filter (where status = 'pending' and attempts = 0) as waiting,
                                  count(*) filter (where status = 'pending' and attempts > 0) as retrying,
                                  count(*) filter (where status = 'abandoned') as failed
                             from public.notification_outbox where created_at >= date_trunc('hour', now() - interval '23 hours')
                            group by 1) x on x.at = h.at),
    'channels', public.fn_comms_channels(),
    'settings', public.fn_comms_setting('retry'),
    'total', (select count(*) from public.notification_outbox o
               where o.created_at >= now() - interval '7 days'
                 and (p_channel is null or o.channel = p_channel)
                 and (p_status is null or (case when o.status = 'pending' and o.attempts > 0 then 'retrying'
                                                when o.status = 'pending' then 'waiting'
                                                when o.status = 'abandoned' then 'failed' else o.status end) = p_status)
                 and (p_audience is null or public.fn_comms_audience_of(o.template, o.payload) = p_audience)
                 and (v_q is null or o.template ilike '%' || v_q || '%' or o.recipient = public.fn_comms_norm(v_q)
                      or coalesce(o.subject, '') ilike '%' || v_q || '%')),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'ref', 'MSG-' || upper(left(replace(o.id::text, '-', ''), 6)),
        'channel', o.channel, 'recipient', public.fn_comms_mask(o.recipient),
        'audience', public.fn_comms_audience_of(o.template, o.payload),
        'template', o.template, 'subject', case when o.sensitive then null else o.subject end,
        'status', case when o.status = 'pending' and o.attempts > 0 then 'retrying'
                       when o.status = 'pending' then 'waiting'
                       when o.status = 'abandoned' then 'failed' else o.status end,
        'attempts', o.attempts, 'created_at', o.created_at, 'next_attempt_at', o.next_attempt_at,
        'sent_at', o.sent_at, 'last_error', o.last_error, 'expires_at', o.expires_at,
        'campaign_ref', o.payload ->> 'campaign_ref') order by o.created_at desc), '[]'::jsonb)
        from (select * from public.notification_outbox o
               where o.created_at >= now() - interval '7 days'
                 and (p_channel is null or o.channel = p_channel)
                 and (p_status is null or (case when o.status = 'pending' and o.attempts > 0 then 'retrying'
                                                when o.status = 'pending' then 'waiting'
                                                when o.status = 'abandoned' then 'failed' else o.status end) = p_status)
                 and (p_audience is null or public.fn_comms_audience_of(o.template, o.payload) = p_audience)
                 and (v_q is null or o.template ilike '%' || v_q || '%' or o.recipient = public.fn_comms_norm(v_q)
                      or coalesce(o.subject, '') ilike '%' || v_q || '%')
               order by o.created_at desc offset v_off limit v_per) o));
end;
$$;

/* Delivery logs: every message recorded, filtered, with one opened in full. */
create or replace function public.rpc_comms_logs(p_from date, p_to date, p_channel text default null,
                                                  p_status text default null, p_audience text default null,
                                                  p_search text default null, p_page integer default 1,
                                                  p_per integer default 10, p_selected uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r tstzrange := public.fn_comms_range(p_from, p_to);
  v_per integer := greatest(5, least(coalesce(p_per, 10), 500));
  v_off integer := (greatest(coalesce(p_page, 1), 1) - 1) * v_per;
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_sel jsonb;
begin
  perform public.fn_comms_reader_gate();
  if p_selected is not null then
    select public.fn_comms_log_row(l) || jsonb_build_object(
             'payload', l.payload - 'from' - 'reply_to' - 'attachments',
             'provider_id', l.provider_id,
             'body', case when o.id is null then null
                          when o.sensitive and o.sent_at is not null then '(destroyed after sending: it held a one-time code)'
                          when o.sensitive then '(hidden: it holds a one-time code)'
                          else o.body end,
             'outbox', case when o.id is null then null else jsonb_build_object(
                 'status', o.status, 'attempts', o.attempts, 'next_attempt_at', o.next_attempt_at,
                 'last_error', o.last_error, 'provider', o.provider, 'provider_ref', o.provider_ref,
                 'expires_at', o.expires_at, 'sent_at', o.sent_at) end)
      into v_sel
      from public.notification_log l
      left join lateral (select * from public.notification_outbox o where o.notification_log_id = l.id limit 1) o on true
     where l.id = p_selected;
  end if;
  return jsonb_build_object(
    'level', authz.comms_level(),
    'kpis', public.fn_comms_kpis(lower(r), upper(r), p_channel),
    'avg_seconds', (select round(avg(extract(epoch from (sent_at - created_at)))::numeric, 1)
                      from public.notification_log
                     where created_at <@ r and status = 'sent' and sent_at is not null and channel <> 'in_app'
                       and (p_channel is null or channel = p_channel)),
    'by_channel', (select coalesce(jsonb_object_agg(channel, n), '{}'::jsonb) from (
        select channel, count(*) as n from public.notification_log
         where created_at <@ r and status <> 'skipped' and channel <> 'console' group by channel) x),
    'trend', public.fn_comms_trend(greatest(lower(r), upper(r) - interval '7 days'), upper(r), p_channel),
    'total', (select count(*) from public.notification_log l
               where l.created_at <@ r and l.channel <> 'console'
                 and (p_channel is null or l.channel = p_channel)
                 and (p_status is null or l.status = p_status)
                 and (p_audience is null or public.fn_comms_audience_of(l.template, l.payload) = p_audience)
                 and (v_q is null or l.template ilike '%' || v_q || '%' or l.recipient = public.fn_comms_norm(v_q)
                      or l.id::text like lower(v_q) || '%'
                      or ('DL-' || upper(left(replace(l.id::text, '-', ''), 6))) = upper(v_q)
                      or coalesce(l.payload ->> 'campaign_ref', '') ilike v_q)),
    'rows', (select coalesce(jsonb_agg(public.fn_comms_log_row(l) order by l.created_at desc), '[]'::jsonb)
        from (select * from public.notification_log l
               where l.created_at <@ r and l.channel <> 'console'
                 and (p_channel is null or l.channel = p_channel)
                 and (p_status is null or l.status = p_status)
                 and (p_audience is null or public.fn_comms_audience_of(l.template, l.payload) = p_audience)
                 and (v_q is null or l.template ilike '%' || v_q || '%' or l.recipient = public.fn_comms_norm(v_q)
                      or l.id::text like lower(v_q) || '%'
                      or ('DL-' || upper(left(replace(l.id::text, '-', ''), 6))) = upper(v_q)
                      or coalesce(l.payload ->> 'campaign_ref', '') ilike v_q)
               order by l.created_at desc offset v_off limit v_per) l),
    'selected', v_sel);
end;
$$;

/* Analytics: volume and outcome by day, channel, audience, campaign, type and place. */
create or replace function public.rpc_comms_analytics(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r tstzrange := public.fn_comms_range(p_from, p_to);
  v_len interval := upper(r) - lower(r);
begin
  perform public.fn_comms_reader_gate();
  return jsonb_build_object(
    'kpis', public.fn_comms_kpis(lower(r), upper(r), null),
    'prev', public.fn_comms_kpis(lower(r) - v_len, lower(r), null),
    'trend', public.fn_comms_trend(lower(r), upper(r), null),
    'channels', (select coalesce(jsonb_agg(jsonb_build_object('channel', channel, 'total', total, 'sent', sent,
                    'failed', failed) order by total desc), '[]'::jsonb) from (
        select channel, count(*) filter (where status <> 'skipped') as total,
               count(*) filter (where status = 'sent') as sent, count(*) filter (where status = 'failed') as failed
          from public.notification_log where created_at <@ r and channel <> 'console' group by channel) x),
    'audiences', (select coalesce(jsonb_agg(jsonb_build_object('audience', a, 'recipients', recipients,
                    'total', total, 'sent', sent, 'failed', failed) order by total desc), '[]'::jsonb) from (
        select public.fn_comms_audience_of(template, payload) as a, count(distinct recipient) as recipients,
               count(*) filter (where status <> 'skipped') as total,
               count(*) filter (where status = 'sent') as sent, count(*) filter (where status = 'failed') as failed
          from public.notification_log where created_at <@ r and channel <> 'console' group by 1) x),
    'campaigns', (select coalesce(jsonb_agg(jsonb_build_object('ref', ref, 'name', name, 'audiences', audiences,
                    'total', total, 'sent', sent, 'failed', failed) order by total desc), '[]'::jsonb) from (
        select c.ref, c.name, c.audiences,
               count(l.*) filter (where l.status <> 'skipped') as total,
               count(l.*) filter (where l.status = 'sent') as sent,
               count(l.*) filter (where l.status = 'failed') as failed
          from public.comms_campaign c
          join public.notification_log l on l.payload ->> 'campaign_id' = c.id::text
         where c.created_at <@ r
         group by c.id order by count(l.*) desc limit 5) x),
    'types', (select coalesce(jsonb_object_agg(t, n), '{}'::jsonb) from (
        select case
                 when payload ->> 'purpose' = 'marketing' then 'promotional'
                 when payload ->> 'purpose' = 'operational' then 'operational'
                 when template like 'bell\_staff.%' or template like 'staff\_%' or template like 'form\_%' then 'system'
                 else 'transactional' end as t, count(*) as n
          from public.notification_log where created_at <@ r and status <> 'skipped' and channel <> 'console'
         group by 1) x),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('city', c.name, 'n', x.n) order by x.n desc), '[]'::jsonb)
                 from (select (payload ->> 'city_id')::uuid as city_id, count(*) as n
                         from public.notification_log
                        where created_at <@ r and status <> 'skipped'
                          and payload ->> 'city_id' ~ '^[0-9a-f-]{36}$'
                        group by 1 order by 2 desc limit 5) x
                 join public.city c on c.id = x.city_id),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('at', a.at, 'kind', a.after ->> 'kind',
                   'rows', a.after ->> 'rows') order by a.at desc), '[]'::jsonb)
                  from (select * from audit.audit_event e where e.module = 'communications'
                           and e.action = 'comms_export.downloaded'
                         order by e.at desc limit 5) a));
end;
$$;

/* Preferences & consent: totals, sources, compliance checks, records, opt-outs, trend, audiences. */
create or replace function public.rpc_comms_consent(p_from date, p_to date, p_search text default null,
                                                     p_kind text default null, p_page integer default 1,
                                                     p_per integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r tstzrange := public.fn_comms_range(p_from, p_to);
  v_per integer := greatest(5, least(coalesce(p_per, 10), 500));
  v_off integer := (greatest(coalesce(p_page, 1), 1) - 1) * v_per;
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_people jsonb;
begin
  perform public.fn_comms_reader_gate();
  /* Each person's latest marketing choice, any channel. */
  with p as (
    select x.audience, public.fn_comms_consent('marketing', 'all', x.person_key, x.user_id, x.guest_id,
                                               x.email, x.phone) as c,
           (select pr.choices from public.customer_notification_pref pr where pr.user_id = x.user_id) as choices
      from public.fn_comms_people(array['guests', 'hosts', 'riders', 'merchants', 'property_managers'], null) x
  )
  select jsonb_build_object(
      'total', count(*),
      'marketing_yes', count(*) filter (where (c ->> 'granted')::boolean),
      'marketing_no', count(*) filter (where (c ->> 'granted')::boolean is false),
      'marketing_never', count(*) filter (where c ->> 'granted' is null),
      'operational_off', count(*) filter (where choices is not null and exists (
          select 1 from jsonb_each(choices) e where e.key not in ('promotions', 'marketing')
             and jsonb_typeof(e.value) = 'object' and (e.value ->> 'all') = 'false')),
      'by_audience', (select coalesce(jsonb_object_agg(audience, jsonb_build_object('total', t, 'yes', y)), '{}'::jsonb)
                        from (select audience, count(*) as t,
                                     count(*) filter (where (c ->> 'granted')::boolean) as y
                                from p group by audience) a),
      'sources', (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) from (
          select coalesce(c ->> 'source', 'none') as s, count(*) as n from p
           where (c ->> 'granted')::boolean group by 1) b))
    into v_people
    from p;

  return jsonb_build_object(
    'level', authz.comms_level(),
    'people', v_people,
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('category', k, 'on', on_n, 'off', off_n)
                     order by k), '[]'::jsonb) from (
        select e.key as k,
               count(*) filter (where coalesce((e.value ->> 'all')::boolean, true)) as on_n,
               count(*) filter (where (e.value ->> 'all')::boolean is false) as off_n
          from public.customer_notification_pref pr, jsonb_each(pr.choices) e
         where jsonb_typeof(e.value) = 'object' group by e.key) x),
    'pref_users', (select count(*) from public.customer_notification_pref),
    'suppression', (select coalesce(jsonb_object_agg(channel, n), '{}'::jsonb) from (
        select channel, count(*) as n from public.comms_suppression where removed_at is null group by channel) x),
    'opted_out', (select count(*) from (
        select distinct on (coalesce(person_key, user_id::text, email, phone)) granted
          from public.comms_consent where kind = 'marketing' and channel = 'all'
         order by coalesce(person_key, user_id::text, email, phone), at desc) x where not granted),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day::date, 'granted', coalesce(x.g, 0),
                 'withdrawn', coalesce(x.w, 0)) order by d.day), '[]'::jsonb)
                from generate_series((lower(r) at time zone 'Africa/Nairobi')::date,
                                     ((upper(r) - interval '1 second') at time zone 'Africa/Nairobi')::date,
                                     interval '1 day') d(day)
                left join (select (at at time zone 'Africa/Nairobi')::date as day,
                                  count(*) filter (where granted) as g, count(*) filter (where not granted) as w
                             from (select at, granted from public.comms_consent where kind = 'marketing' and at <@ r
                                   union all
                                   select at, granted from public.guest_consent where kind = 'marketing' and at <@ r) c
                            group by 1) x on x.day = d.day),
    'total', (select count(*) from public.comms_consent c
               where (p_kind is null or c.kind = p_kind)
                 and (v_q is null or c.email = public.fn_comms_norm(v_q) or c.phone = public.fn_comms_norm(v_q)
                      or c.person_key ilike '%' || v_q || '%' or c.user_id::text = v_q)),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'at', c.at, 'who', coalesce(public.fn_comms_mask(c.email), public.fn_comms_mask(c.phone),
                                                c.person_key, 'account ' || left(c.user_id::text, 8)),
        'audience', c.audience, 'kind', c.kind, 'channel', c.channel, 'granted', c.granted,
        'source', c.source, 'evidence', c.evidence,
        'action', case when c.granted then 'granted' else 'withdrawn' end,
        'staff', (select s.display_name from public.staff_user s where s.id = c.staff_id)) order by c.at desc), '[]'::jsonb)
        from (select * from public.comms_consent c
               where (p_kind is null or c.kind = p_kind)
                 and (v_q is null or c.email = public.fn_comms_norm(v_q) or c.phone = public.fn_comms_norm(v_q)
                      or c.person_key ilike '%' || v_q || '%' or c.user_id::text = v_q)
               order by c.at desc offset v_off limit v_per) c),
    'guest_records', (select count(*) from public.guest_consent where kind = 'marketing'),
    'unsubscribed_links', (select count(*) from public.comms_unsubscribe where used_at is not null));
end;
$$;

/* The suppression lists, live entries first. */
create or replace function public.rpc_comms_suppressions(p_channel text default null, p_search text default null,
                                                          p_page integer default 1, p_per integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_per integer := greatest(5, least(coalesce(p_per, 20), 500));
  v_off integer := (greatest(coalesce(p_page, 1), 1) - 1) * v_per;
  v_q text := public.fn_comms_norm(p_search);
begin
  perform public.fn_comms_reader_gate();
  return jsonb_build_object(
    'level', authz.comms_level(),
    'total', (select count(*) from public.comms_suppression s
               where s.removed_at is null and (p_channel is null or s.channel = p_channel)
                 and (v_q is null or s.address = v_q)),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'channel', s.channel, 'address', public.fn_comms_mask(s.address), 'reason', s.reason,
        'note', s.note, 'source', s.source, 'created_at', s.created_at,
        'by', (select st.display_name from public.staff_user st where st.id = s.created_by)) order by s.created_at desc), '[]'::jsonb)
        from (select * from public.comms_suppression s
               where s.removed_at is null and (p_channel is null or s.channel = p_channel)
                 and (v_q is null or s.address = v_q)
               order by s.created_at desc offset v_off limit v_per) s));
end;
$$;

-- ═════════════════════════════════════════════════════════ 10. writers

create or replace function public.rpc_comms_template_save(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_channels text[] := array(select jsonb_array_elements_text(coalesce(p -> 'channels', '["email"]'::jsonb)));
  v_t public.comms_template;
begin
  if 'email' = any (v_channels) and coalesce(btrim(p ->> 'email_body'), '') = '' then
    raise exception 'Write the email, or untick Email.' using errcode = '22023';
  end if;
  if 'sms' = any (v_channels) and coalesce(btrim(p ->> 'sms_body'), '') = '' then
    raise exception 'Write the SMS, or untick SMS.' using errcode = '22023';
  end if;
  if 'whatsapp' = any (v_channels) and coalesce(btrim(p ->> 'whatsapp_body'), btrim(p ->> 'sms_body'), '') = '' then
    raise exception 'Write the WhatsApp message, or untick WhatsApp.' using errcode = '22023';
  end if;
  if 'in_app' = any (v_channels) and coalesce(btrim(p ->> 'push_body'), '') = '' then
    raise exception 'Write the push message, or untick Push.' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.comms_template (name, audience, category, purpose, trigger_label, channels, status,
      email_subject, email_body, sms_body, whatsapp_body, push_title, push_body, created_by, updated_by)
    values (btrim(p ->> 'name'), coalesce(nullif(p ->> 'audience', ''), 'guests'),
            coalesce(nullif(p ->> 'category', ''), 'promotions'), coalesce(nullif(p ->> 'purpose', ''), 'marketing'),
            nullif(btrim(coalesce(p ->> 'trigger_label', '')), ''), v_channels,
            coalesce(nullif(p ->> 'status', ''), 'draft'),
            nullif(btrim(coalesce(p ->> 'email_subject', '')), ''), nullif(btrim(coalesce(p ->> 'email_body', '')), ''),
            nullif(btrim(coalesce(p ->> 'sms_body', '')), ''), nullif(btrim(coalesce(p ->> 'whatsapp_body', '')), ''),
            nullif(btrim(coalesce(p ->> 'push_title', '')), ''), nullif(btrim(coalesce(p ->> 'push_body', '')), ''),
            v_staff, v_staff)
    returning * into v_t;
  else
    update public.comms_template set
      name = btrim(p ->> 'name'),
      audience = coalesce(nullif(p ->> 'audience', ''), audience),
      category = coalesce(nullif(p ->> 'category', ''), category),
      purpose = coalesce(nullif(p ->> 'purpose', ''), purpose),
      trigger_label = nullif(btrim(coalesce(p ->> 'trigger_label', '')), ''),
      channels = v_channels,
      status = coalesce(nullif(p ->> 'status', ''), status),
      email_subject = nullif(btrim(coalesce(p ->> 'email_subject', '')), ''),
      email_body = nullif(btrim(coalesce(p ->> 'email_body', '')), ''),
      sms_body = nullif(btrim(coalesce(p ->> 'sms_body', '')), ''),
      whatsapp_body = nullif(btrim(coalesce(p ->> 'whatsapp_body', '')), ''),
      push_title = nullif(btrim(coalesce(p ->> 'push_title', '')), ''),
      push_body = nullif(btrim(coalesce(p ->> 'push_body', '')), ''),
      updated_by = v_staff, updated_at = now()
    where id = v_id returning * into v_t;
    if v_t.id is null then
      raise exception 'That template is not there.' using errcode = 'no_data_found';
    end if;
  end if;
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_template.saved',
    p_target_type => 'comms_template', p_target_id => v_t.id, p_target_label => v_t.name,
    p_after => jsonb_build_object('status', v_t.status, 'channels', v_t.channels, 'purpose', v_t.purpose));
  return jsonb_build_object('id', v_t.id);
exception when check_violation then
  raise exception 'Something in the template is not allowed (name 2-120 characters, SMS up to 640).' using errcode = '22023';
end;
$$;

create or replace function public.rpc_comms_workflow_save(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_channels text[] := array(select jsonb_array_elements_text(coalesce(p -> 'channels', '[]'::jsonb)));
  v_tpl public.comms_template;
  v_w public.comms_workflow;
begin
  select * into v_tpl from public.comms_template where id = nullif(p ->> 'template_id', '')::uuid;
  if v_tpl.id is null then
    raise exception 'Choose the template the workflow sends.' using errcode = '22023';
  end if;
  if v_tpl.purpose = 'marketing' and coalesce(p ->> 'condition', 'none') <> 'marketing_consent' then
    raise exception 'A marketing template can only be sent to people who said yes to marketing. Keep the consent condition on.'
      using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.comms_workflow (name, trigger_kind, condition, template_id, channels, delay_minutes,
      follow_up_template_id, follow_up_after_minutes, enabled, created_by, updated_by)
    values (btrim(p ->> 'name'), btrim(p ->> 'trigger_kind'), coalesce(nullif(p ->> 'condition', ''), 'none'),
            v_tpl.id, v_channels, coalesce(nullif(p ->> 'delay_minutes', '')::integer, 0),
            nullif(p ->> 'follow_up_template_id', '')::uuid, nullif(p ->> 'follow_up_after_minutes', '')::integer,
            coalesce((p ->> 'enabled')::boolean, false), v_staff, v_staff)
    returning * into v_w;
  else
    update public.comms_workflow set
      name = btrim(p ->> 'name'), trigger_kind = btrim(p ->> 'trigger_kind'),
      condition = coalesce(nullif(p ->> 'condition', ''), 'none'), template_id = v_tpl.id,
      channels = v_channels, delay_minutes = coalesce(nullif(p ->> 'delay_minutes', '')::integer, 0),
      follow_up_template_id = nullif(p ->> 'follow_up_template_id', '')::uuid,
      follow_up_after_minutes = nullif(p ->> 'follow_up_after_minutes', '')::integer,
      enabled = coalesce((p ->> 'enabled')::boolean, enabled),
      updated_by = v_staff, updated_at = now()
    where id = v_id returning * into v_w;
    if v_w.id is null then
      raise exception 'That workflow is not there.' using errcode = 'no_data_found';
    end if;
  end if;
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_workflow.saved',
    p_target_type => 'comms_workflow', p_target_id => v_w.id, p_target_label => v_w.name,
    p_after => jsonb_build_object('trigger', v_w.trigger_kind, 'enabled', v_w.enabled, 'channels', v_w.channels));
  return jsonb_build_object('id', v_w.id);
exception when check_violation then
  raise exception 'Something in the workflow is not allowed: a name, a bell kind (letters, dots), channels and minutes up to 30 days.'
    using errcode = '22023';
end;
$$;

/* On/off for a custom workflow (wf:<id>), a bell email (kind:<kind>) or an app email group (group:<key>). */
create or replace function public.rpc_comms_workflow_toggle(p_key text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate();
  v_kind text := split_part(p_key, ':', 1);
  v_ref text := substr(p_key, length(v_kind) + 2);
begin
  if p_enabled is null then
    raise exception 'On or off?' using errcode = '22023';
  end if;
  if v_kind = 'wf' then
    update public.comms_workflow set enabled = p_enabled, updated_by = v_staff, updated_at = now()
     where id = v_ref::uuid;
  elsif v_kind = 'kind' then
    update public.notification_email_kind set enabled = p_enabled where kind = v_ref;
  elsif v_kind = 'group' and v_ref like 'app\_%' then
    update public.email_route set enabled = p_enabled, updated_by = (select auth.uid()), updated_at = now()
     where key = v_ref;
  else
    raise exception 'That is not a workflow.' using errcode = '22023';
  end if;
  if not found then
    raise exception 'That workflow is not there.' using errcode = 'no_data_found';
  end if;
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_workflow.toggled',
    p_target_type => 'comms_workflow', p_target_label => p_key,
    p_after => jsonb_build_object('enabled', p_enabled));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.rpc_comms_schedule_save(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate(true);
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_s public.comms_schedule;
  v_now timestamptz := now();
begin
  perform public.fn_comms_check_spec(p || jsonb_build_object('purpose', 'marketing'));
  if v_id is not null then
    select * into v_s from public.comms_schedule where id = v_id for update;
    if v_s.id is null then
      raise exception 'That schedule is not there.' using errcode = 'no_data_found';
    end if;
  end if;
  v_s.name := btrim(p ->> 'name');
  v_s.template_id := nullif(p ->> 'template_id', '')::uuid;
  v_s.subject := nullif(btrim(coalesce(p ->> 'subject', '')), '');
  v_s.body := nullif(btrim(coalesce(p ->> 'body', '')), '');
  v_s.audiences := array(select jsonb_array_elements_text(p -> 'audiences'));
  v_s.channels := array(select jsonb_array_elements_text(p -> 'channels'));
  v_s.city_id := nullif(p ->> 'city_id', '')::uuid;
  v_s.kind := coalesce(nullif(p ->> 'kind', ''), 'one_time');
  v_s.frequency := nullif(p ->> 'frequency', '');
  v_s.weekday := nullif(p ->> 'weekday', '')::smallint;
  v_s.monthday := nullif(p ->> 'monthday', '')::smallint;
  v_s.time_of_day := nullif(p ->> 'time_of_day', '')::time;
  v_s.starts_on := nullif(p ->> 'starts_on', '')::date;
  v_s.ends_on := nullif(p ->> 'ends_on', '')::date;
  v_s.runs := coalesce(v_s.runs, 0);
  if v_s.kind = 'one_time' then
    v_s.next_run_at := nullif(p ->> 'run_at', '')::timestamptz;
    if v_s.next_run_at is null or v_s.next_run_at < v_now - interval '1 minute' then
      raise exception 'Choose a time in the future.' using errcode = '22023';
    end if;
    v_s.runs := 0;
  else
    v_s.next_run_at := public.fn_comms_next_run(v_s, v_now);
    if v_s.next_run_at is null then
      raise exception 'That schedule never runs: check the days and the end date.' using errcode = '22023';
    end if;
  end if;
  v_s.status := 'scheduled';
  if v_id is null then
    insert into public.comms_schedule (name, template_id, subject, body, audiences, city_id, channels, kind,
      frequency, weekday, monthday, time_of_day, starts_on, ends_on, next_run_at, status, created_by, updated_by)
    values (v_s.name, v_s.template_id, v_s.subject, v_s.body, v_s.audiences, v_s.city_id, v_s.channels, v_s.kind,
      v_s.frequency, v_s.weekday, v_s.monthday, v_s.time_of_day, v_s.starts_on, v_s.ends_on, v_s.next_run_at,
      'scheduled', v_staff, v_staff)
    returning * into v_s;
  else
    update public.comms_schedule set
      name = v_s.name, template_id = v_s.template_id, subject = v_s.subject, body = v_s.body,
      audiences = v_s.audiences, city_id = v_s.city_id, channels = v_s.channels, kind = v_s.kind,
      frequency = v_s.frequency, weekday = v_s.weekday, monthday = v_s.monthday, time_of_day = v_s.time_of_day,
      starts_on = v_s.starts_on, ends_on = v_s.ends_on, next_run_at = v_s.next_run_at, runs = v_s.runs,
      status = 'scheduled', updated_by = v_staff, updated_at = now()
    where id = v_id returning * into v_s;
  end if;
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_schedule.saved',
    p_target_type => 'comms_schedule', p_target_id => v_s.id, p_target_label => v_s.name,
    p_after => jsonb_build_object('kind', v_s.kind, 'next_run_at', v_s.next_run_at,
                                  'audiences', v_s.audiences, 'channels', v_s.channels));
  return jsonb_build_object('id', v_s.id, 'next_run_at', v_s.next_run_at);
exception when check_violation then
  raise exception 'Something in the schedule is not allowed: check the name, the days and the time.' using errcode = '22023';
end;
$$;

create or replace function public.rpc_comms_schedule_set_status(p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate();
  v_s public.comms_schedule;
begin
  if p_status not in ('scheduled', 'paused', 'cancelled') then
    raise exception 'That is not a schedule state.' using errcode = '22023';
  end if;
  select * into v_s from public.comms_schedule where id = p_id for update;
  if v_s.id is null then
    raise exception 'That schedule is not there.' using errcode = 'no_data_found';
  end if;
  if p_status = 'scheduled' then
    perform public.fn_comms_writer_gate(true);
    v_s.next_run_at := case when v_s.kind = 'one_time'
                              then case when v_s.next_run_at > now() then v_s.next_run_at end
                            else public.fn_comms_next_run(v_s, now()) end;
    if v_s.next_run_at is null then
      raise exception 'That schedule has nothing left to run. Edit its time first.' using errcode = '22023';
    end if;
  end if;
  update public.comms_schedule set status = p_status, next_run_at = v_s.next_run_at,
         updated_by = v_staff, updated_at = now()
   where id = p_id;
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_schedule.saved',
    p_target_type => 'comms_schedule', p_target_id => p_id, p_target_label => v_s.name,
    p_after => jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true);
end;
$$;

/* Who a bulk send would reach, and who it leaves out and why. Sends nothing. */
create or replace function public.rpc_comms_campaign_preview(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_comms_writer_gate(true);
  perform public.fn_comms_check_spec(p || jsonb_build_object('purpose', 'marketing'));
  return public.fn_comms_run(p || jsonb_build_object('purpose', 'marketing'), null);
end;
$$;

/*
 * Send to an audience. p.confirm_reachable must equal the preview's
 * 'reachable': if the audience changed in between, nothing is sent and the
 * new count comes back to be confirmed again. Bulk and announcements are
 * marketing: only people who said yes get them.
 */
create or replace function public.rpc_comms_campaign_send(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate(true);
  v_spec jsonb := p || jsonb_build_object('purpose', 'marketing');
  v_check jsonb;
  v_id uuid;
  v_ref text;
  v_out jsonb;
begin
  perform public.fn_comms_check_spec(v_spec);
  if coalesce(btrim(p ->> 'name'), '') = '' then
    raise exception 'Give the message a name for the history.' using errcode = '22023';
  end if;
  v_check := public.fn_comms_run(v_spec, null);
  if nullif(p ->> 'confirm_reachable', '')::integer is distinct from (v_check ->> 'reachable')::integer then
    return jsonb_build_object('ok', false, 'changed', true, 'preview', v_check);
  end if;
  if (v_check ->> 'reachable')::integer = 0 then
    raise exception 'Nobody in that audience can get this: nobody has said yes to marketing on those channels.'
      using errcode = '22023';
  end if;
  insert into public.comms_campaign (name, kind, purpose, audiences, city_id, channels, subject, body,
                                     template_id, created_by)
  values (left(btrim(p ->> 'name'), 160), case when p ->> 'kind' = 'announcement' then 'announcement' else 'bulk' end,
          'marketing', array(select jsonb_array_elements_text(p -> 'audiences')), nullif(p ->> 'city_id', '')::uuid,
          array(select jsonb_array_elements_text(p -> 'channels')),
          nullif(btrim(coalesce(p ->> 'subject', '')), ''), nullif(btrim(coalesce(p ->> 'body', '')), ''),
          nullif(p ->> 'template_id', '')::uuid, v_staff)
  returning id, ref into v_id, v_ref;
  v_out := public.fn_comms_run(v_spec, v_id);
  update public.comms_campaign set status = 'completed', completed_at = now(),
         people = (v_out ->> 'people')::integer, queued = (v_out ->> 'messages')::integer,
         skipped_consent = (v_out ->> 'no_consent')::integer, skipped_suppressed = (v_out ->> 'suppressed')::integer,
         skipped_no_address = (v_out ->> 'no_address')::integer
   where id = v_id;
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_campaign.sent',
    p_target_type => 'comms_campaign', p_target_id => v_id, p_target_label => v_ref,
    p_after => v_out || jsonb_build_object('audiences', p -> 'audiences', 'channels', p -> 'channels'));
  return jsonb_build_object('ok', true, 'id', v_id, 'ref', v_ref, 'result', v_out);
end;
$$;

/* One message to one address staff type in (a person who asked, a correction). Operational, not marketing. */
create or replace function public.rpc_comms_manual_send(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate();
  v_to text := public.fn_comms_norm(p ->> 'recipient');
  v_channels text[] := array(select jsonb_array_elements_text(coalesce(p -> 'channels', '[]'::jsonb)));
  v_ch text;
  v_id uuid;
  v_ref text;
  v_res text;
  v_sent integer := 0;
  v_skipped jsonb := '{}'::jsonb;
  v_consent jsonb;
begin
  if v_to is null then
    raise exception 'Type the email address or phone number.' using errcode = '22023';
  end if;
  if coalesce(btrim(p ->> 'body'), '') = '' then
    raise exception 'Write the message.' using errcode = '22023';
  end if;
  if cardinality(v_channels) = 0 or not v_channels <@ array['email', 'sms', 'whatsapp'] then
    raise exception 'Choose email, SMS or WhatsApp.' using errcode = '22023';
  end if;
  insert into public.comms_campaign (name, kind, purpose, channels, subject, body, created_by, people)
  values (left(coalesce(nullif(btrim(p ->> 'name'), ''), 'Manual message'), 160), 'manual', 'operational',
          v_channels, nullif(btrim(coalesce(p ->> 'subject', '')), ''), btrim(p ->> 'body'), v_staff, 1)
  returning id, ref into v_id, v_ref;
  foreach v_ch in array v_channels loop
    if (v_ch = 'email') <> (position('@' in v_to) > 0) then
      v_skipped := v_skipped || jsonb_build_object(v_ch, 'not that kind of address');
      continue;
    end if;
    v_consent := public.fn_comms_consent('operational', v_ch, null, null, null,
                                         case when v_ch = 'email' then v_to end, case when v_ch <> 'email' then v_to end);
    if (v_consent ->> 'granted')::boolean is false then
      v_skipped := v_skipped || jsonb_build_object(v_ch, 'they asked not to be contacted this way');
      continue;
    end if;
    v_res := public.fn_comms_send_one(v_ch,
      jsonb_build_object('email', case when v_ch = 'email' then v_to end, 'phone', case when v_ch <> 'email' then v_to end,
                         'name', coalesce(nullif(btrim(p ->> 'to_name'), ''), 'there'), 'audience', nullif(p ->> 'audience', '')),
      p ->> 'subject', p ->> 'body', 'comms.' || v_ref, 'operational',
      jsonb_build_object('campaign_id', v_id, 'campaign_ref', v_ref));
    if v_res = 'queued' then
      v_sent := v_sent + 1;
    else
      v_skipped := v_skipped || jsonb_build_object(v_ch, case v_res when 'suppressed' then 'on a suppression list' else v_res end);
    end if;
  end loop;
  update public.comms_campaign set status = 'completed', completed_at = now(), queued = v_sent,
         skipped_suppressed = (select count(*) from jsonb_object_keys(v_skipped))
   where id = v_id;
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_campaign.sent',
    p_target_type => 'comms_campaign', p_target_id => v_id, p_target_label => v_ref,
    p_after => jsonb_build_object('kind', 'manual', 'to', public.fn_comms_mask(v_to), 'sent', v_sent, 'skipped', v_skipped));
  return jsonb_build_object('ok', v_sent > 0, 'ref', v_ref, 'sent', v_sent, 'skipped', v_skipped);
end;
$$;

/* A test to an address staff type in, from a template or free text. Marked as a test in the log. */
create or replace function public.rpc_comms_test_send(p_channel text, p_recipient text, p_template_id uuid default null,
                                                       p_subject text default null, p_body text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate();
  v_to text := public.fn_comms_norm(p_recipient);
  v_tpl public.comms_template;
  v_words jsonb;
  v_out uuid;
  v_user uuid;
begin
  if p_channel not in ('email', 'sms', 'whatsapp', 'in_app') then
    raise exception 'That is not a channel.' using errcode = '22023';
  end if;
  if p_template_id is not null then
    select * into v_tpl from public.comms_template where id = p_template_id;
  end if;
  v_words := public.fn_comms_words(v_tpl, p_channel,
               coalesce(nullif(btrim(p_subject), ''), 'NexG test message'),
               coalesce(nullif(btrim(p_body), ''),
                        'This is a test from NexG Communications & Automations. If you got it, this channel works.'));
  if p_channel = 'in_app' then
    /* A bell to the staff member's own account. */
    select s.user_id into v_user from public.staff_user s where s.id = v_staff;
    perform public.fn_notify_user(v_user, 'comms.test', '[Test] ' || coalesce(v_words ->> 'subject', 'NexG'),
      public.fn_comms_render(v_words ->> 'body', jsonb_build_object('first_name', 'there', 'name', 'there', 'city', 'Nairobi')),
      null, 'info'::public.notification_tone, null, null, null);
    insert into public.notification_log (channel, recipient, template, payload, status, sent_at)
    values ('in_app', 'account ' || left(v_user::text, 8), 'comms.test', jsonb_build_object('test', true, 'audience', 'staff'),
            'sent', now());
  else
    if v_to is null or (p_channel = 'email') <> (position('@' in v_to) > 0) then
      raise exception 'Type a valid % to send the test to.', case when p_channel = 'email' then 'email address' else 'phone number' end
        using errcode = '22023';
    end if;
    v_out := public.fn_notify_enqueue(
      p_channel => p_channel, p_recipient => v_to, p_template => 'comms.test',
      p_body => public.fn_comms_render(v_words ->> 'body', jsonb_build_object('first_name', 'there', 'name', 'there', 'city', 'Nairobi')),
      p_subject => case when p_channel = 'email' then '[Test] ' || coalesce(v_words ->> 'subject', 'NexG') end,
      p_payload => jsonb_build_object('test', true, 'audience', 'staff', 'purpose', 'operational'),
      p_sensitive => false);
  end if;
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_message.test_sent',
    p_target_type => 'notification_outbox', p_target_id => v_out,
    p_after => jsonb_build_object('channel', p_channel, 'to', coalesce(public.fn_comms_mask(v_to), 'own account'),
                                  'template_id', p_template_id));
  return jsonb_build_object('ok', true, 'queued', v_out is not null or p_channel = 'in_app', 'outbox_id', v_out);
end;
$$;

/* Send a logged message again, as it was, to the same address. Never a sensitive one. */
create or replace function public.rpc_comms_resend(p_log_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate();
  v_o public.notification_outbox;
  v_new uuid;
begin
  select o.* into v_o from public.notification_outbox o where o.notification_log_id = p_log_id limit 1;
  if v_o.id is null then
    raise exception 'That message has nothing left to send again.' using errcode = 'no_data_found';
  end if;
  if v_o.sensitive or v_o.body is null then
    raise exception 'That message held a one-time code; ask the person to request a new one.' using errcode = '22023';
  end if;
  if public.fn_comms_suppressed(v_o.channel, v_o.recipient) then
    raise exception 'That address is on a suppression list.' using errcode = '22023';
  end if;
  v_new := public.fn_notify_enqueue(
    p_channel => v_o.channel, p_recipient => v_o.recipient, p_template => v_o.template,
    p_body => v_o.body, p_subject => v_o.subject,
    p_payload => v_o.payload || jsonb_build_object('resend_of', p_log_id), p_sensitive => false);
  if v_new is null then
    raise exception 'It was not queued: that kind of email is switched off in Settings > Email routing.' using errcode = '22023';
  end if;
  update public.notification_outbox set html = v_o.html where id = v_new;
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_message.resent',
    p_target_type => 'notification_log', p_target_id => p_log_id,
    p_after => jsonb_build_object('outbox_id', v_new, 'channel', v_o.channel));
  return jsonb_build_object('ok', true, 'outbox_id', v_new);
end;
$$;

/* Retry a queued message now, or cancel it. */
create or replace function public.rpc_comms_queue_action(p_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate();
  v_o public.notification_outbox;
begin
  select * into v_o from public.notification_outbox where id = p_id for update;
  if v_o.id is null then
    raise exception 'That message is not in the queue.' using errcode = 'no_data_found';
  end if;
  if p_action = 'retry' then
    if v_o.status = 'sent' then
      raise exception 'That message was already sent. Use Resend in the delivery log.' using errcode = '22023';
    end if;
    if v_o.sensitive and v_o.expires_at is not null and v_o.expires_at < now() then
      raise exception 'That code has expired; sending it now would not help.' using errcode = '22023';
    end if;
    update public.notification_outbox set status = 'pending', next_attempt_at = now(),
           attempts = case when status = 'abandoned' then 0 else attempts end
     where id = p_id;
    update public.notification_log set status = 'queued', error = null where id = v_o.notification_log_id;
  elsif p_action = 'cancel' then
    if v_o.status <> 'pending' then
      raise exception 'Only a message still waiting can be cancelled.' using errcode = '22023';
    end if;
    update public.notification_outbox set status = 'abandoned', last_error = 'Cancelled by staff',
           body = case when sensitive then null else body end
     where id = p_id;
    update public.notification_log set status = 'failed', error = 'Cancelled by staff' where id = v_o.notification_log_id;
  else
    raise exception 'Retry or cancel?' using errcode = '22023';
  end if;
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_queue.changed',
    p_target_type => 'notification_outbox', p_target_id => p_id,
    p_after => jsonb_build_object('action', p_action, 'channel', v_o.channel));
  return jsonb_build_object('ok', true);
end;
$$;

/* Retry rules, email limits, costs. Values are checked; nothing else is stored. */
create or replace function public.rpc_comms_setting_save(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate();
  v_value jsonb;
begin
  if p_key = 'retry' then
    v_value := jsonb_build_object(
      'max_attempts', greatest(1, least(coalesce((p_value ->> 'max_attempts')::integer, 5), 10)),
      'base_minutes', greatest(1, least(coalesce((p_value ->> 'base_minutes')::integer, 1), 60)),
      'on_final', case when p_value ->> 'on_final' = 'mark_failed_notify' then 'mark_failed_notify' else 'mark_failed' end);
  elsif p_key = 'email_limits' then
    v_value := jsonb_build_object(
      'daily', greatest(0, least(coalesce((p_value ->> 'daily')::integer, 0), 10000000)),
      'per_minute', greatest(0, least(coalesce((p_value ->> 'per_minute')::integer, 0), 100000)));
  elsif p_key = 'cost_kes' then
    v_value := jsonb_build_object(
      'email', greatest(0, least(coalesce((p_value ->> 'email')::numeric, 0), 1000)),
      'sms', greatest(0, least(coalesce((p_value ->> 'sms')::numeric, 0), 1000)),
      'whatsapp', greatest(0, least(coalesce((p_value ->> 'whatsapp')::numeric, 0), 1000)));
  else
    raise exception 'That is not a communications setting.' using errcode = '22023';
  end if;
  insert into public.comms_setting (key, value, updated_by, updated_at)
  values (p_key, v_value, v_staff, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_setting.saved',
    p_target_type => 'comms_setting', p_target_label => p_key, p_after => v_value);
  return jsonb_build_object('ok', true, 'value', v_value);
exception when invalid_text_representation then
  raise exception 'Use whole numbers.' using errcode = '22023';
end;
$$;

/* The sender name and addresses for messages from this module (the 'marketing' email route). */
create or replace function public.rpc_comms_sender_save(p_from_name text, p_from_email text, p_reply_to text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate();
begin
  update public.email_route set
    from_name = coalesce(nullif(btrim(p_from_name), ''), from_name),
    from_email = lower(btrim(p_from_email)),
    reply_to = nullif(lower(btrim(coalesce(p_reply_to, ''))), ''),
    updated_by = (select auth.uid()), updated_at = now()
   where key = 'marketing';
  if not found then
    raise exception 'The marketing sender is missing.' using errcode = 'no_data_found';
  end if;
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_setting.saved',
    p_target_type => 'email_route', p_target_label => 'marketing',
    p_after => jsonb_build_object('from_name', p_from_name, 'from_email', p_from_email, 'reply_to', p_reply_to));
  return jsonb_build_object('ok', true);
exception when check_violation then
  raise exception 'One of those addresses is not a valid email, or the name has < > in it.' using errcode = '22023';
end;
$$;

/* Record what a person told NexG (on the phone, on a signed form). Needs a source and what shows it. */
create or replace function public.rpc_comms_consent_record(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate();
  v_addr text := public.fn_comms_norm(p ->> 'address');
  v_id bigint;
begin
  if v_addr is null then
    raise exception 'Type their email address or phone number.' using errcode = '22023';
  end if;
  if coalesce(btrim(p ->> 'evidence'), '') = '' then
    raise exception 'Say how they told you (a call on a date, a signed form, an email) so the record stands up.'
      using errcode = '22023';
  end if;
  insert into public.comms_consent (email, phone, audience, kind, channel, granted, source, evidence, staff_id)
  values (case when position('@' in v_addr) > 0 then v_addr end,
          case when position('@' in v_addr) = 0 then v_addr end,
          nullif(p ->> 'audience', ''), coalesce(nullif(p ->> 'kind', ''), 'marketing'),
          coalesce(nullif(p ->> 'channel', ''), 'all'), (p ->> 'granted')::boolean,
          coalesce(nullif(p ->> 'source', ''), 'staff'), left(btrim(p ->> 'evidence'), 500), v_staff)
  returning id into v_id;
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_consent.recorded',
    p_target_type => 'comms_consent', p_target_label => public.fn_comms_mask(v_addr),
    p_after => jsonb_build_object('kind', p ->> 'kind', 'channel', p ->> 'channel', 'granted', p ->> 'granted',
                                  'source', p ->> 'source'));
  return jsonb_build_object('id', v_id);
exception when check_violation or not_null_violation then
  raise exception 'Choose yes or no, a kind, a channel and a source.' using errcode = '22023';
end;
$$;

create or replace function public.rpc_comms_suppression_add(p_channel text, p_address text, p_reason text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate();
  v_addr text := public.fn_comms_norm(p_address);
  v_id uuid;
begin
  if v_addr is null then
    raise exception 'Type the email address or phone number.' using errcode = '22023';
  end if;
  insert into public.comms_suppression (channel, address, reason, note, created_by)
  values (p_channel, v_addr, p_reason, nullif(btrim(coalesce(p_note, '')), ''), v_staff)
  on conflict (channel, address) where removed_at is null do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_suppression.changed',
    p_target_type => 'comms_suppression', p_target_id => v_id, p_target_label => public.fn_comms_mask(v_addr),
    p_after => jsonb_build_object('channel', p_channel, 'reason', p_reason, 'added', true));
  return jsonb_build_object('ok', true, 'id', v_id);
exception when check_violation then
  raise exception 'Choose a channel and a reason.' using errcode = '22023';
end;
$$;

create or replace function public.rpc_comms_suppression_remove(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_comms_writer_gate();
  v_s public.comms_suppression;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why it comes off the list.' using errcode = '22023';
  end if;
  update public.comms_suppression set removed_at = now(), removed_by = v_staff, removed_reason = left(btrim(p_reason), 300)
   where id = p_id and removed_at is null
  returning * into v_s;
  if v_s.id is null then
    raise exception 'That entry is not on the list.' using errcode = 'no_data_found';
  end if;
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_suppression.changed',
    p_target_type => 'comms_suppression', p_target_id => p_id, p_target_label => public.fn_comms_mask(v_s.address),
    p_after => jsonb_build_object('channel', v_s.channel, 'removed', true), p_reason => p_reason);
  return jsonb_build_object('ok', true);
end;
$$;

/* A CSV download is recorded: what, how many rows. */
create or replace function public.rpc_comms_export_log(p_kind text, p_rows integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_comms_reader_gate();
  perform audit.log('staff'::public.actor_type, 'communications', 'comms_export.downloaded',
    p_target_type => 'comms_export', p_target_label => left(p_kind, 40),
    p_after => jsonb_build_object('kind', left(p_kind, 40), 'rows', p_rows));
end;
$$;

-- ═════════════════════════════════════════════ 11. workflows that fire

create or replace function public.tg_comms_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  w record;
  v_person jsonb;
  v_email text;
  v_phone text;
  v_name text;
  v_ch text;
  v_words jsonb;
  v_tpl public.comms_template;
  v_follow public.comms_template;
  v_consent jsonb;
begin
  if new.kind like 'comms.%' or new.user_id is null then
    return null;
  end if;
  if not exists (select 1 from public.comms_workflow cw where cw.enabled and cw.trigger_kind = new.kind) then
    return null;
  end if;
  select public.fn_comms_norm(u.email), public.fn_comms_norm(coalesce(u.phone,
           (select g.phone from public.guest g where g.user_id = u.id limit 1),
           (select r.phone from public.rider r where r.user_id = u.id limit 1))),
         coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''),
                  (select g.name from public.guest g where g.user_id = u.id limit 1), 'there')
    into v_email, v_phone, v_name
    from auth.users u where u.id = new.user_id;
  v_person := jsonb_build_object('user_id', new.user_id, 'email', v_email, 'phone', v_phone, 'name', v_name,
                                 'person_key', 'user:' || new.user_id);
  for w in select * from public.comms_workflow cw where cw.enabled and cw.trigger_kind = new.kind loop
    select * into v_tpl from public.comms_template where id = w.template_id;
    continue when v_tpl.id is null or v_tpl.status <> 'active';
    if w.follow_up_template_id is not null then
      select * into v_follow from public.comms_template where id = w.follow_up_template_id;
    else
      v_follow := null;
    end if;
    foreach v_ch in array w.channels loop
      if w.condition = 'marketing_consent' or v_tpl.purpose = 'marketing' then
        v_consent := public.fn_comms_consent('marketing', v_ch, 'user:' || new.user_id, new.user_id, null, v_email, v_phone);
        continue when coalesce((v_consent ->> 'granted')::boolean, false) is not true;
      else
        v_consent := public.fn_comms_consent('operational', v_ch, 'user:' || new.user_id, new.user_id, null, v_email, v_phone);
        continue when (v_consent ->> 'granted')::boolean is false;
      end if;
      v_words := public.fn_comms_words(v_tpl, v_ch, new.title, coalesce(new.body, new.title));
      perform public.fn_comms_send_one(v_ch, v_person || jsonb_build_object('audience', v_tpl.audience),
        v_words ->> 'subject', v_words ->> 'body', 'comms.wf', v_tpl.purpose,
        jsonb_build_object('workflow_id', w.id, 'kind', new.kind), w.delay_minutes);
      if v_follow.id is not null and v_follow.status = 'active' then
        v_words := public.fn_comms_words(v_follow, v_ch, new.title, coalesce(new.body, new.title));
        perform public.fn_comms_send_one(v_ch, v_person || jsonb_build_object('audience', v_follow.audience),
          v_words ->> 'subject', v_words ->> 'body', 'comms.wf', v_tpl.purpose,
          jsonb_build_object('workflow_id', w.id, 'kind', new.kind, 'follow_up', true),
          w.delay_minutes + w.follow_up_after_minutes);
      end if;
    end loop;
    update public.comms_workflow set fired_count = fired_count + 1, last_fired_at = now() where id = w.id;
  end loop;
  return null;
exception when others then
  /* Never fail the write that rang the bell. */
  return null;
end;
$$;

drop trigger if exists user_notification_comms_workflow on public.user_notification;
create trigger user_notification_comms_workflow
  after insert on public.user_notification
  for each row execute function public.tg_comms_workflow();

-- ═════════════════════════════════════════════ 12. the schedule clock

create or replace function public.cron_comms_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.comms_schedule;
  v_tpl public.comms_template;
  v_id uuid;
  v_ref text;
  v_out jsonb;
  v_ran integer := 0;
  v_missed integer := 0;
  v_next timestamptz;
begin
  for v_s in
    select * from public.comms_schedule
     where status = 'scheduled' and next_run_at <= now()
     order by next_run_at
     for update skip locked
     limit 20
  loop
    v_next := case when v_s.kind = 'recurring' then public.fn_comms_next_run(v_s, now()) end;
    if v_s.next_run_at < now() - interval '6 hours' then
      update public.comms_schedule set missed = missed + 1, next_run_at = v_next,
             status = case when v_next is null then 'completed' else status end, updated_at = now()
       where id = v_s.id;
      v_missed := v_missed + 1;
      continue;
    end if;
    select * into v_tpl from public.comms_template where id = v_s.template_id;
    insert into public.comms_campaign (name, kind, purpose, audiences, city_id, channels, subject, body,
                                       template_id, schedule_id, created_by)
    values (v_s.name, 'scheduled', 'marketing', v_s.audiences, v_s.city_id, v_s.channels,
            coalesce(v_s.subject, v_tpl.email_subject), v_s.body, v_s.template_id, v_s.id, v_s.updated_by)
    returning id, ref into v_id, v_ref;
    v_out := public.fn_comms_run(jsonb_build_object(
      'audiences', to_jsonb(v_s.audiences), 'channels', to_jsonb(v_s.channels), 'city_id', v_s.city_id,
      'template_id', v_s.template_id, 'subject', v_s.subject, 'body', v_s.body, 'purpose', 'marketing'), v_id);
    update public.comms_campaign set status = 'completed', completed_at = now(),
           people = (v_out ->> 'people')::integer, queued = (v_out ->> 'messages')::integer,
           skipped_consent = (v_out ->> 'no_consent')::integer, skipped_suppressed = (v_out ->> 'suppressed')::integer,
           skipped_no_address = (v_out ->> 'no_address')::integer
     where id = v_id;
    update public.comms_schedule set runs = runs + 1, last_run_at = now(), last_campaign_id = v_id,
           next_run_at = v_next, status = case when v_next is null then 'completed' else status end,
           updated_at = now()
     where id = v_s.id;
    v_ran := v_ran + 1;
  end loop;
  return jsonb_build_object('ran', v_ran, 'missed', v_missed);
end;
$$;
revoke all on function public.cron_comms_tick() from public, anon, authenticated;
grant execute on function public.cron_comms_tick() to service_role;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; scheduled messages are not run.';
    return;
  end if;
  perform cron.schedule('comms-tick', '* * * * *', $sched$select public.cron_comms_tick()$sched$);
end
$cron$;

-- ═════════════════════════════════════════════ 13. the opt-out link

/* What the opt-out page shows: whether the link is real and already used. No address. */
create or replace function public.rpc_comms_unsubscribe_lookup(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select jsonb_build_object('ok', true, 'used', u.used_at is not null)
                     from public.comms_unsubscribe u
                    where u.token = p_token and p_token ~ '^[0-9a-f]{20}$'),
                  jsonb_build_object('ok', false))
$$;

/* Stops marketing to this person on every channel. Recorded as their own withdrawal. */
create or replace function public.rpc_comms_unsubscribe(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_u public.comms_unsubscribe;
begin
  if p_token !~ '^[0-9a-f]{20}$' then
    return jsonb_build_object('ok', false);
  end if;
  select * into v_u from public.comms_unsubscribe where token = p_token for update;
  if v_u.token is null then
    return jsonb_build_object('ok', false);
  end if;
  if v_u.used_at is null then
    insert into public.comms_consent (person_key, user_id, email, phone, kind, channel, granted, source, evidence)
    values (v_u.person_key, v_u.user_id, v_u.email, v_u.phone, 'marketing', 'all', false, 'unsubscribe_link',
            'Opt-out link in a message' || coalesce(' (' || (select c.ref from public.comms_campaign c
                                                             where c.id = v_u.campaign_id) || ')', ''));
    update public.comms_unsubscribe set used_at = now() where token = p_token;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ═════════════════════════════════════════════════════════ 14. grants

do $$
declare f text;
begin
  foreach f in array array[
    'public.rpc_comms_overview(date, date)',
    'public.rpc_comms_channel(text, date, date)',
    'public.rpc_comms_templates(text, text, text, text, text, integer, integer)',
    'public.rpc_comms_workflows()',
    'public.rpc_comms_schedules(date, integer, integer, text)',
    'public.rpc_comms_campaigns(date, date, text, integer, integer)',
    'public.rpc_comms_queue(text, text, text, text, integer, integer)',
    'public.rpc_comms_logs(date, date, text, text, text, text, integer, integer, uuid)',
    'public.rpc_comms_analytics(date, date)',
    'public.rpc_comms_consent(date, date, text, text, integer, integer)',
    'public.rpc_comms_suppressions(text, text, integer, integer)',
    'public.rpc_comms_template_save(jsonb)',
    'public.rpc_comms_workflow_save(jsonb)',
    'public.rpc_comms_workflow_toggle(text, boolean)',
    'public.rpc_comms_schedule_save(jsonb)',
    'public.rpc_comms_schedule_set_status(uuid, text)',
    'public.rpc_comms_campaign_preview(jsonb)',
    'public.rpc_comms_campaign_send(jsonb)',
    'public.rpc_comms_manual_send(jsonb)',
    'public.rpc_comms_test_send(text, text, uuid, text, text)',
    'public.rpc_comms_resend(uuid)',
    'public.rpc_comms_queue_action(uuid, text)',
    'public.rpc_comms_setting_save(text, jsonb)',
    'public.rpc_comms_sender_save(text, text, text)',
    'public.rpc_comms_consent_record(jsonb)',
    'public.rpc_comms_suppression_add(text, text, text, text)',
    'public.rpc_comms_suppression_remove(uuid, text)',
    'public.rpc_comms_export_log(text, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

revoke all on function public.fn_comms_setting(text), public.fn_comms_suppressed(text, text),
  public.fn_comms_people(text[], uuid),
  public.fn_comms_consent(text, text, text, uuid, uuid, text, text),
  public.fn_comms_words(public.comms_template, text, text, text),
  public.fn_comms_check_spec(jsonb), public.fn_comms_audience_of(text, jsonb),
  public.fn_comms_range(date, date), public.fn_comms_next_run(public.comms_schedule, timestamptz),
  public.tg_comms_workflow()
  from public, anon, authenticated;
grant execute on function public.fn_comms_reader_gate(), public.fn_comms_writer_gate(boolean) to authenticated;

revoke all on function public.rpc_comms_unsubscribe_lookup(text), public.rpc_comms_unsubscribe(text) from public;
grant execute on function public.rpc_comms_unsubscribe_lookup(text), public.rpc_comms_unsubscribe(text)
  to anon, authenticated;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_comms_provider_report', 'The sender reporting which providers it has keys for', 'comms_provider_status'),
  ('rpc_comms_unsubscribe', 'A person withdrawing their own marketing consent from a link', 'comms_consent'),
  ('rpc_comms_unsubscribe_lookup', 'Reading whether an opt-out link is real', 'comms_unsubscribe'),
  ('cron_comms_tick', 'The clock running scheduled messages staff set up (their save is audited)', 'comms_campaign')
on conflict (function_name) do nothing;
