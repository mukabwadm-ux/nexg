-- What the three drawn tabs actually edit.
--
-- Cities and zones already exist and are extended, not replaced.
-- Payment methods, payout rails, integrations, legal documents and
-- the holiday calendar are new — they have been referred to by four
-- earlier builds and modelled by none of them.
--
-- Nothing here holds a secret. Providers are named, rotation dates
-- are recorded, and the credential itself lives in Vault behind a
-- reference, because a console that can show a key is a console that
-- can leak one.

-- ══════════════════════════════════════════ cities and zones

do $$ begin
  alter type public.city_status add value if not exists 'paused';
exception when duplicate_object then null; end $$;

alter table public.city
  /* {"mon": ["07:00","02:00"], …} or a single pair for every day.
     Hours are a city-level promise: "opens at 07:00" is printed to
     a guest who arrived too early. */
  add column if not exists hours jsonb,
  add column if not exists late_night_from time,
  add column if not exists max_radius_km numeric(5,2),
  add column if not exists template_id uuid references settings.city_template (id) on delete set null,
  add column if not exists launched_at date,
  add column if not exists city_manager_id uuid references public.staff_user (id) on delete set null,
  add column if not exists status_reason text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.staff_user (id) on delete set null;

alter table public.zone
  /* 1–3, matching the guest delivery fee bands. Separate from tier
     on purpose: a Core zone at the edge of the city can still sit in
     band 2, and conflating them would mean redrawing a zone to
     change a price. */
  add column if not exists delivery_band smallint
    check (delivery_band is null or delivery_band between 1 and 3),
  /* A trial zone is a 30-day pilot that reviews itself. Without a
     date, "trial" becomes permanent, which is how a pilot quietly
     becomes a commitment nobody decided to make. */
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_reviewed_at timestamptz;

comment on column public.zone.delivery_band is
  'The guest fee band, kept separate from tier: a Core zone at the city edge can still be band 2, and merging them would mean redrawing a polygon to change a price.';

create table if not exists public.holiday_calendar (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.city (id) on delete cascade,
  country text,
  date date not null,
  label text not null,
  source text not null default 'manual' check (source in ('manual', 'national', 'imported')),
  /* Merchants are asked to confirm their hours this many days
     ahead. A holiday nobody confirmed is a row of closed shops and
     a page of failed orders. */
  prompt_merchants_days_before smallint not null default 3,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint holiday_belongs_somewhere check (num_nonnulls(city_id, country) >= 1)
);

create unique index if not exists holiday_unique
  on public.holiday_calendar
     (coalesce(city_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(country, ''), date);

-- ═════════════════════════════════════════ how money arrives

create table if not exists public.payment_method (
  key text primary key,
  label text not null,
  provider text,
  status text not null default 'not_set_up'
    check (status in ('connected', 'limited', 'live_hotels', 'not_set_up', 'disabled', 'error')),
  enabled boolean not null default false,
  /* The order a guest sees them in at checkout. */
  checkout_order integer not null default 100,
  /* {"cash_cap": …, "zones_allowed": [...], "min": …, "max": …} */
  limits jsonb not null default '{}'::jsonb,
  /* {"success_24h_pct": …, "callbacks_ok": …, "callbacks_failed": …,
      "last_check": …} — written by the health cron, never by hand. */
  health jsonb not null default '{}'::jsonb,
  /* A Vault name. Never the secret, not even encrypted: a console
     that can show a key is a console that can leak one. */
  config_ref text,
  note text,
  disabled_reason text,
  disabled_at timestamptz,
  disabled_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now(),

  constraint payment_disable_has_a_reason check (
    enabled or disabled_reason is null or coalesce(trim(disabled_reason), '') <> '')
);

comment on column public.payment_method.config_ref is
  'A Vault name. Never the secret and never a ciphertext — a console that can show a key is a console that can leak one.';

create table if not exists public.payout_rail (
  party text primary key check (party in ('merchants', 'riders', 'host_credits')),
  rail text not null check (rail in ('mpesa_b2b_bank', 'mpesa_b2c', 'credit_note', 'bank_eft', 'manual')),
  config_ref text,
  /* Warn Finance when the float is below a week of payouts. Null
     until Finance sets it — a guessed threshold either cries wolf or
     stays silent through a real outage. */
  float_alert_amount bigint,
  note text,
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ═════════════════════════════════ what NexG depends on

create table if not exists public.integration (
  key text primary key,
  label text not null,
  provider text,
  status text not null default 'to_do'
    check (status in ('connected', 'pending', 'to_do', 'error', 'disabled')),
  enabled boolean not null default false,
  /* Non-secret only: sender id, domain, template counts, schedule. */
  config jsonb not null default '{}'::jsonb,
  secret_refs text[] not null default '{}',
  key_rotated_at timestamptz,
  rotation_days integer not null default 90,
  health jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  /* Some integrations gate other work. eTIMS is the live example:
     invoicing a hotel without electronic invoicing is not a
     degraded experience, it is a thing NexG may not do. */
  blocks text[] not null default '{}',
  notes text,
  sort integer not null default 100,
  updated_at timestamptz not null default now()
);

comment on column public.integration.blocks is
  'What cannot happen until this is connected. eTIMS gates hotel invoicing — not a degraded experience, a thing NexG may not legally do.';

/* Due for rotation, as a column so the tile is one scan. */
create or replace function public.fn_integration_rotation_due(i public.integration)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select i.enabled
     and coalesce(array_length(i.secret_refs, 1), 0) > 0
     and (i.key_rotated_at is null
          or i.key_rotated_at < now() - make_interval(days => i.rotation_days))
$$;

-- ══════════════════════════════════════ what NexG promises

create table if not exists public.legal_document (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key in (
    'guest_terms', 'privacy', 'cookies', 'merchant_terms', 'rider_agreement',
    'host_terms', 'hotel_agreement_template', 'featured_terms', 'api_terms', 'kdpa_notice')),
  version integer not null,
  effective_from timestamptz,
  markdown text,
  pdf_path text,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'current', 'archived')),
  /* Publishing with re-acceptance flips a blocking card in that
     audience's dashboard. It is the most disruptive thing this
     module can do, so it is a deliberate column rather than a
     consequence of a flag somewhere else. */
  requires_reacceptance_by text
    check (requires_reacceptance_by is null
           or requires_reacceptance_by in ('merchants', 'riders', 'hosts', 'hotels', 'none')),
  changelog text,
  approved_by uuid references public.staff_user (id) on delete set null,
  second_approver_id uuid references public.staff_user (id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),

  unique (key, version),
  constraint legal_published_is_approved check (
    status not in ('current', 'scheduled')
    or (approved_by is not null and second_approver_id is not null
        and effective_from is not null and coalesce(trim(markdown), '') <> '')),
  constraint legal_approval_is_two_people check (
    second_approver_id is null or second_approver_id <> approved_by)
);

/* One current version per document. Two is two sets of terms. */
create unique index if not exists legal_one_current
  on public.legal_document (key) where status = 'current';

-- ══════════════════════════════ messages and consent

create table if not exists settings.notification_rule (
  event text primary key,
  audience text not null
    check (audience in ('guests', 'merchants', 'riders', 'hosts', 'hotels', 'candidates', 'staff')),
  /* In priority order with fallback: push, then WhatsApp, then SMS. */
  channels text[] not null default '{}',
  /* Riders on a trip are never quiet-houred; a guest at 23:00 is,
     unless it is about an order they are waiting for. */
  quiet_hours jsonb not null default '{}'::jsonb,
  bypass_quiet_hours boolean not null default false,
  language_fallback text not null default 'en',
  retry jsonb not null default '{}'::jsonb,
  notify_roles text[] not null default '{}',
  active boolean not null default true,
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists settings.consent_text (
  id uuid primary key default gen_random_uuid(),
  surface text not null check (surface in ('checkout', 'account', 'apply', 'host_apply', 'rider_apply')),
  kind text not null,
  lang text not null default 'en' check (lang in ('en', 'sw')),
  version integer not null default 1,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'current', 'archived')),
  approved_by uuid references public.staff_user (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (surface, kind, lang, version)
);

create unique index if not exists consent_one_current
  on settings.consent_text (surface, kind, lang) where status = 'current';

-- ════════════════════════════════════════════════════ RLS

alter table public.holiday_calendar enable row level security;
alter table public.payment_method enable row level security;
alter table public.payout_rail enable row level security;
alter table public.integration enable row level security;
alter table public.legal_document enable row level security;
alter table settings.notification_rule enable row level security;
alter table settings.consent_text enable row level security;

revoke all on
  public.holiday_calendar, public.payment_method, public.payout_rail,
  public.integration, public.legal_document,
  settings.notification_rule, settings.consent_text
  from anon, authenticated;

grant select on
  public.holiday_calendar, public.payment_method, public.payout_rail,
  public.legal_document, settings.notification_rule, settings.consent_text
  to authenticated;

/* `integration` is granted through a view that drops secret_refs,
   never directly — see below. */

create policy holiday_read on public.holiday_calendar
  for select to authenticated using (authz.staff_id() is not null);
create policy payment_method_read on public.payment_method
  for select to authenticated using (authz.staff_id() is not null);
create policy payout_rail_read on public.payout_rail
  for select to authenticated
  using (authz.reaches_module('finance') or authz.is_super_admin());
create policy legal_read on public.legal_document
  for select to authenticated using (authz.staff_id() is not null);
create policy notification_rule_read on settings.notification_rule
  for select to authenticated using (authz.staff_id() is not null);
create policy consent_text_read on settings.consent_text
  for select to authenticated using (authz.staff_id() is not null);
create policy integration_read on public.integration
  for select to authenticated using (authz.staff_id() is not null);

/*
 * The console never selects `integration` directly. It reads this,
 * which has no `secret_refs` column at all — not masked, not
 * redacted, absent. A column that is merely hidden by a policy is a
 * column one careless `select *` away from a log file.
 */
create or replace view public.integration_v
with (security_invoker = true) as
select
  i.key,
  i.label,
  i.provider,
  i.status,
  i.enabled,
  i.config,
  /* How many secrets it holds, which is all anybody needs to know. */
  coalesce(array_length(i.secret_refs, 1), 0) as secrets,
  i.key_rotated_at,
  i.rotation_days,
  public.fn_integration_rotation_due(i) as rotation_due,
  case
    when i.key_rotated_at is null then null
    else (i.key_rotated_at + make_interval(days => i.rotation_days))::date
  end as rotation_due_on,
  i.health,
  i.last_checked_at,
  i.blocks,
  i.notes,
  i.sort
from public.integration i;

grant select on public.integration_v to authenticated;

comment on view public.integration_v is
  'What the console reads. `secret_refs` is absent rather than masked: a column hidden only by a policy is one careless select * away from a log file.';

-- ══════════════════════════════ what the public may see

/*
 * The guest site and the partner dashboards read these. They carry
 * what a person is entitled to know — the terms they agreed to, the
 * cities that are open — and nothing about what is scheduled, who
 * approved it, or what anything used to be.
 */
create or replace view public.legal_public_v
with (security_invoker = true) as
select key, version, effective_from, markdown, pdf_path, requires_reacceptance_by
from public.legal_document
where status = 'current' and effective_from <= now();

create or replace view public.city_public_v
with (security_invoker = true) as
select
  c.id, c.slug, c.name, c.country, c.currency, c.timezone,
  c.status, c.hours, c.sort,
  (select count(*) from public.zone z
    where z.city_id = c.id and z.active) as zones
from public.city c
where c.status in ('live', 'soft_launch');

grant select on public.legal_public_v, public.city_public_v to anon, authenticated;
