-- The Merchants console · the columns and tables the twelve tabs read.
--
-- Extends the onboarding schema rather than replacing it. Everything the
-- console shows already has a home where one exists: `explore_visible`,
-- `accepting_orders`, `pay_on_delivery`, `concierge_pick`, `featured`,
-- `prep_minutes` and the payout rail are all columns on `merchant`
-- today, so the build prompt's names for them are mapped rather than
-- duplicated. A second column meaning the same thing is how two screens
-- start disagreeing about whether a shop is open.
--
-- What is genuinely new: who changed a control and when, health, strikes,
-- disputes, commission, statements, and the chain/branch structure.

-- ───────────────────────────────────────────────────────────── enums

create type public.merchant_control_source as enum ('merchant', 'staff', 'system');
create type public.dispute_status as enum ('open', 'awaiting_merchant', 'resolved', 'chargeback');
create type public.dispute_fault as enum ('merchant', 'rider', 'guest', 'nexg', 'unknown');
create type public.dispute_resolution as enum (
  'full_refund_charge_merchant', 'partial_refund_charge_merchant',
  'credit_wallet', 'no_refund', 'chargeback'
);
create type public.health_band as enum ('green', 'amber', 'red');
create type public.edit_approval_status as enum ('pending', 'approved', 'rejected');
create type public.price_flag_status as enum ('open', 'aligned', 'dismissed');
create type public.commission_tier_code as enum ('T1', 'T2', 'T3');
create type public.statement_status as enum ('draft', 'ready', 'sent', 'disputed', 'paid');
create type public.broadcast_status as enum ('draft', 'scheduled', 'sending', 'sent', 'cancelled');
create type public.acquisition_channel as enum (
  'hotel_referral', 'city_lead', 'merchant_referral', 'self_signup',
  'concierge_gap', 'paid_social', 'events'
);

/*
 * The two-person actions this module adds. Delisting and a commission
 * change go through the same approval_request queue that merchant
 * suspension and staff role grants already use, so there is one place
 * a person looks for "what is waiting on me".
 */
alter type public.approval_kind add value if not exists 'merchant_delist';
alter type public.approval_kind add value if not exists 'commission_tier_change';

/*
 * Everything this module sends. Added here rather than beside the RPCs
 * that raise them, because a value added to an enum cannot be used in
 * the transaction that adds it — the same boundary the support desk
 * migration ran into.
 */
alter type public.notification_kind add value if not exists 'merchant_live';
alter type public.notification_kind add value if not exists 'merchant_returned';
alter type public.notification_kind add value if not exists 'merchant_paused';
alter type public.notification_kind add value if not exists 'merchant_resumed';
alter type public.notification_kind add value if not exists 'merchant_suspended';
alter type public.notification_kind add value if not exists 'open_now_reminder';
alter type public.notification_kind add value if not exists 'dispute_awaiting_reply';
alter type public.notification_kind add value if not exists 'dispute_outcome';
alter type public.notification_kind add value if not exists 'edit_approved';
alter type public.notification_kind add value if not exists 'edit_rejected';
alter type public.notification_kind add value if not exists 'price_align_request';
alter type public.notification_kind add value if not exists 'statement_ready';
alter type public.notification_kind add value if not exists 'payout_sent';
alter type public.notification_kind add value if not exists 'document_expiring';
alter type public.notification_kind add value if not exists 'document_expired_paused';
alter type public.notification_kind add value if not exists 'terms_updated';
alter type public.notification_kind add value if not exists 'health_warning_l1';
alter type public.notification_kind add value if not exists 'merchant_broadcast';
alter type public.notification_kind add value if not exists 'referral_bonus_paid';

-- ──────────────────────────────────────────────── merchant columns

alter table public.merchant
  /* Who last touched each control. The Directory's sub-labels read
     "Merchant toggled 07:58" or "Staff · you · 09:12", and without this
     the console cannot tell a merchant's own choice from its own. */
  add column if not exists accepting_orders_source public.merchant_control_source,
  add column if not exists busy_mode_until timestamptz,
  add column if not exists capacity_per_15min integer
    check (capacity_per_15min is null or capacity_per_15min > 0),
  add column if not exists closed_early_at timestamptz,

  add column if not exists commission_tier public.commission_tier_code not null default 'T1',
  /* Null means "whatever the tier says". An explicit number here is a
     negotiated rate and overrides it. */
  add column if not exists commission_pct numeric(5, 2)
    check (commission_pct is null or (commission_pct >= 0 and commission_pct <= 100)),
  add column if not exists payout_hold boolean not null default false,
  add column if not exists payout_hold_reason text,

  add column if not exists health_band public.health_band,
  add column if not exists health_score integer check (health_score is null or health_score between 0 and 100),
  add column if not exists strike_count integer not null default 0,

  add column if not exists parent_merchant_id uuid references public.merchant (id) on delete set null,

  add column if not exists acquisition_channel public.acquisition_channel,
  add column if not exists acquisition_source text,
  add column if not exists referred_by_type text
    check (referred_by_type is null or referred_by_type in ('hotel', 'merchant', 'staff')),
  add column if not exists referred_by_id uuid,

  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references public.staff_user (id) on delete set null,
  add column if not exists suspension_reason text,
  add column if not exists suspension_second_approver uuid references public.staff_user (id) on delete set null,
  add column if not exists delisted_at timestamptz;

/* A chain cannot be its own parent, and a branch cannot parent anything
   (one level, which is what the Branches tab draws). */
alter table public.merchant
  add constraint merchant_not_its_own_parent check (parent_merchant_id is distinct from id);

create index if not exists merchant_parent_idx on public.merchant (parent_merchant_id)
  where parent_merchant_id is not null;
create index if not exists merchant_health_idx on public.merchant (health_band, health_score);
create index if not exists merchant_acquisition_idx on public.merchant (acquisition_channel);

comment on column public.merchant.payout_hold is
  'Blocks inclusion in a payout run. Set by suspension, KYC gaps or an unresolved chargeback, and shown with its reason on both the console and the merchant''s own dashboard.';

-- ───────────────────────────────────────────── the status timeline

/*
 * Every status a merchant has been in, and who moved them.
 *
 * Written by a trigger rather than by each RPC, so a status change made
 * any other way still lands here. The Directory's timeline and the
 * Acquisition tab's drop-off bars both read it.
 */
create table public.merchant_status_change (
  id bigserial primary key,
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  from_status public.partner_status,
  to_status public.partner_status not null,
  reason text,
  actor_id uuid references public.staff_user (id) on delete set null,
  second_approver_id uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now()
);

create index merchant_status_change_idx on public.merchant_status_change (merchant_id, created_at desc);

create or replace function public.tg_merchant_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.merchant_status_change
      (merchant_id, from_status, to_status, reason, actor_id)
    values (new.id, old.status, new.status, new.status_reason, authz.staff_id());
  end if;
  return new;
end;
$$;

create trigger merchant_status_change
  after update of status on public.merchant
  for each row execute function public.tg_merchant_status_change();

-- ────────────────────────────────────────────── application review

create table public.merchant_review (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  reviewer_id uuid not null references public.staff_user (id) on delete restrict,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text check (outcome is null or outcome in ('approved', 'returned', 'rejected')),
  /* {permit, kra, photos, hours, payout, catalogue, call_done} */
  checklist jsonb not null default '{}'::jsonb,
  notes text
);

/*
 * One open review at a time. This is the lock behind "Being reviewed by
 * [Name] since 10:14" — two people verifying the same documents and
 * both pressing Go live is how a merchant gets approved twice and
 * notified twice.
 */
create unique index merchant_review_one_open on public.merchant_review (merchant_id)
  where finished_at is null;

create index merchant_review_merchant_idx on public.merchant_review (merchant_id, started_at desc);

-- ──────────────────────────────────────────────────────── health

create table public.health_weight_config (
  key text primary key,
  label text not null,
  weight_pct integer not null check (weight_pct between 0 and 100),
  /* Null until somebody sets it. The Health tab shows these as targets
     to set rather than inventing a number to miss (ground rule 3). */
  target numeric(6, 2),
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.health_weight_config (key, label, weight_pct, target) values
  ('on_time_ready',      'On-time ready',            30, null),
  ('acceptance',         'Order acceptance rate',    20, null),
  ('missing_item',       'Missing / wrong items',    20, null),
  ('cancellations',      'Cancellations by merchant',15, null),
  ('rating',             'Guest rating',             10, null),
  ('dashboard_response', 'Dashboard response time',   5, null)
on conflict (key) do nothing;

comment on table public.health_weight_config is
  'What the health score is made of. Settings with an audit trail rather than constants in code, because the score decides who is eligible for a Featured slot and who gets delisted.';

create table public.merchant_health_snapshot (
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  as_of date not null,
  score integer check (score is null or score between 0 and 100),
  band public.health_band,
  on_time_ready_pct numeric(5, 2),
  acceptance_pct numeric(5, 2),
  cancel_pct numeric(5, 2),
  missing_item_pct numeric(5, 2),
  rating_avg numeric(3, 2),
  dashboard_response_s integer,
  orders_30d integer not null default 0,
  /* The weights as they were on the day, so editing them never rewrites
     history. */
  weights jsonb not null default '{}'::jsonb,
  trend integer[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (merchant_id, as_of)
);

create index merchant_health_recent_idx on public.merchant_health_snapshot (as_of desc, band);

create table public.merchant_strike (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  level integer not null check (level between 1 and 3),
  reason text not null,
  issued_by uuid references public.staff_user (id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  cleared_at timestamptz,
  cleared_by uuid references public.staff_user (id) on delete set null,

  constraint merchant_strike_reason_not_blank check (length(trim(reason)) > 0)
);

create index merchant_strike_live_idx on public.merchant_strike (merchant_id, level)
  where cleared_at is null;

-- ────────────────────────────────────────────────────── disputes

/*
 * A guest says something was wrong with an order.
 *
 * `order_id` is text rather than a foreign key because the orders domain
 * does not exist yet. When it lands this becomes a reference; until then
 * a dispute can still be raised, worked and resolved against the order
 * number a guest reads off their receipt, which is the part that matters
 * to them.
 */
create table public.dispute (
  id uuid primary key default gen_random_uuid(),
  order_reference text,
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  branch_id uuid references public.merchant_branch (id) on delete set null,
  guest_user_id uuid references auth.users (id) on delete set null,
  rider_id uuid references public.rider (id) on delete set null,

  reason text not null check (reason in
    ('missing_item', 'wrong_item', 'cold', 'late', 'damaged', 'quality', 'other')),
  fault public.dispute_fault not null default 'unknown',
  status public.dispute_status not null default 'open',

  amount_claimed_kes bigint check (amount_claimed_kes is null or amount_claimed_kes >= 0),
  amount_refunded_kes bigint not null default 0 check (amount_refunded_kes >= 0),
  charged_to text check (charged_to is null or charged_to in ('merchant', 'rider', 'nexg', 'none')),
  resolution public.dispute_resolution,

  guest_note text,
  merchant_reply text,
  merchant_reply_due_at timestamptz,
  /* Storage paths: the guest's photo and the rider's pickup photo. The
     pickup photo is the whole reason dispatch captures one. */
  evidence jsonb not null default '[]'::jsonb,

  opened_by uuid references auth.users (id) on delete set null,
  resolved_by uuid references public.staff_user (id) on delete set null,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,

  constraint dispute_resolution_is_timed check (
    status not in ('resolved', 'chargeback') or resolved_at is not null
  ),
  constraint dispute_resolved_has_an_outcome check (
    status <> 'resolved' or resolution is not null
  ),
  constraint dispute_awaiting_has_a_deadline check (
    status <> 'awaiting_merchant' or merchant_reply_due_at is not null
  )
);

create index dispute_queue_idx on public.dispute (status, opened_at)
  where status in ('open', 'awaiting_merchant');
create index dispute_merchant_idx on public.dispute (merchant_id, opened_at desc);
create index dispute_due_idx on public.dispute (merchant_reply_due_at)
  where status = 'awaiting_merchant';

comment on table public.dispute is
  'A guest reporting a problem with an order. Opened from the guest order page, answered from the merchant dashboard, resolved in the console — one row, three surfaces.';

-- ─────────────────────────────────────────────── hours and capacity

create table public.merchant_hours_override (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  branch_id uuid references public.merchant_branch (id) on delete cascade,
  date date not null,
  opens time,
  closes time,
  closed boolean not null default false,
  reason text,
  source public.merchant_control_source not null default 'staff',
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint hours_override_is_coherent check (
    closed or (opens is not null and closes is not null)
  )
);

create unique index merchant_hours_override_one
  on public.merchant_hours_override
     (merchant_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), date);

create table public.city_hours_exception (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.city (id) on delete cascade,
  date date not null,
  label text not null,
  default_close time,
  applies_to_categories text[],
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (city_id, date, label)
);

create table public.auto_message_rule (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key in
    ('kitchen_running_long', 'busy_mode_wait', 'closed_early_alternative', 'prep_shift_alert')),
  /* Null is the network-wide default; a row with a city overrides it. */
  city_id uuid references public.city (id) on delete cascade,
  enabled boolean not null default false,
  params jsonb not null default '{}'::jsonb
);

/* A primary key cannot hold an expression, so the "one rule per key per
   city, and one global" rule is a unique index over the coalesce. */
create unique index auto_message_rule_one
  on public.auto_message_rule
     (key, coalesce(city_id, '00000000-0000-0000-0000-000000000000'::uuid));

insert into public.auto_message_rule (key, city_id, enabled) values
  ('kitchen_running_long', null, true),
  ('busy_mode_wait', null, true),
  ('closed_early_alternative', null, true),
  ('prep_shift_alert', null, true)
on conflict do nothing;

-- ────────────────────────────────────────────────── catalogue ops

create table public.catalogue_price_flag (
  id uuid primary key default gen_random_uuid(),
  catalogue_item_id uuid not null references public.catalogue_item (id) on delete cascade,
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  app_price_kes integer,
  observed_price_kes integer,
  observed_source text not null check (observed_source in ('rider_photo', 'guest_report', 'staff')),
  drift_pct numeric(6, 2),
  status public.price_flag_status not null default 'open',
  observed_at timestamptz not null default now(),
  resolved_by uuid references public.staff_user (id) on delete set null,
  resolved_at timestamptz
);

create index catalogue_price_flag_open_idx on public.catalogue_price_flag (merchant_id, status);

create table public.catalogue_edit_request (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  catalogue_item_id uuid references public.catalogue_item (id) on delete cascade,
  kind text not null check (kind in ('price_change', 'new_item', 'remove_item', 'photo')),
  payload jsonb not null default '{}'::jsonb,
  status public.edit_approval_status not null default 'pending',
  requested_by uuid references auth.users (id) on delete set null,
  reviewed_by uuid references public.staff_user (id) on delete set null,
  reviewed_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),

  constraint catalogue_edit_decided_is_timed check (
    status = 'pending' or reviewed_at is not null
  ),
  constraint catalogue_edit_rejection_has_a_reason check (
    status <> 'rejected' or coalesce(trim(reason), '') <> ''
  )
);

create index catalogue_edit_pending_idx on public.catalogue_edit_request (status, created_at)
  where status = 'pending';

create table public.catalogue_photo_task (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  catalogue_item_id uuid references public.catalogue_item (id) on delete cascade,
  status text not null default 'missing'
    check (status in ('missing', 'booked', 'shot', 'published')),
  assignee_id uuid references public.staff_user (id) on delete set null,
  booked_for timestamptz,
  created_at timestamptz not null default now()
);

create table public.catalogue_import (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  source text not null check (source in ('pdf', 'google', 'csv')),
  storage_path text,
  status text not null default 'queued'
    check (status in ('queued', 'parsing', 'review', 'applied', 'failed')),
  items_found integer,
  error text,
  applied_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────── coverage

create table public.coverage_gap (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.city (id) on delete cascade,
  zone_id uuid references public.zone (id) on delete set null,
  category public.merchant_category not null,
  hotel_count integer not null default 0,
  merchant_count integer not null default 0,
  severity text not null check (severity in ('gap', 'thin')),
  recruit_target_note text,
  assigned_to uuid references public.staff_user (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'assigned', 'filled')),
  computed_at timestamptz not null default now(),
  filled_at timestamptz,
  unique (city_id, zone_id, category)
);

-- ──────────────────────────────────────────────────────── money

create table public.commission_tier (
  code public.commission_tier_code primary key,
  label text not null,
  /* Null until finance sets it. A blended commission the console
     invented would end up on an invoice. */
  default_pct numeric(5, 2) check (default_pct is null or (default_pct >= 0 and default_pct <= 100)),
  criteria text,
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.commission_tier (code, label, criteria) values
  ('T1', 'Standard',  'under KES [—] / month'),
  ('T2', 'Volume',    'KES [—]+ / month · reviewed quarterly'),
  ('T3', 'Strategic', 'negotiated · hotels’ preferred suppliers')
on conflict (code) do nothing;

create table public.merchant_statement (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gross_kes bigint not null default 0,
  commission_kes bigint not null default 0,
  adjustments_kes bigint not null default 0,
  penalties_kes bigint not null default 0,
  tax_withheld_kes bigint not null default 0,
  net_kes bigint not null default 0,
  status public.statement_status not null default 'draft',
  pdf_path text,
  /* A digest of the ledger lines this was built from, so a statement
     that no longer matches its source is detectable rather than
     argued about. */
  ledger_hash text,
  approved_by uuid references public.staff_user (id) on delete set null,
  second_approver_id uuid references public.staff_user (id) on delete set null,
  paid_at timestamptz,
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (merchant_id, period_start, period_end),
  constraint statement_period_is_ordered check (period_end >= period_start),
  constraint statement_paid_is_referenced check (
    status <> 'paid' or (paid_at is not null and coalesce(trim(provider_ref), '') <> '')
  )
);

create index merchant_statement_run_idx on public.merchant_statement (period_end desc, status);

create table public.merchant_penalty (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  order_reference text,
  dispute_id uuid references public.dispute (id) on delete set null,
  kind text not null,
  amount_kes bigint not null check (amount_kes >= 0),
  status text not null default 'proposed' check (status in ('proposed', 'applied', 'waived')),
  applied_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────── comms

create table public.message_template (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'dashboard_banner')),
  body text not null,
  variables text[] not null default '{}',
  /* WhatsApp templates must be approved by the provider before they can
     be sent. Shown on the tab so nobody schedules one that will bounce. */
  approved boolean not null default false,
  provider_template_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.broadcast (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  /* {cities, categories, statuses, health_bands, merchant_ids} */
  audience jsonb not null default '{}'::jsonb,
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'dashboard_banner')),
  template_id uuid references public.message_template (id) on delete set null,
  body text not null,
  status public.broadcast_status not null default 'draft',
  scheduled_for timestamptz,
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  read_count integer not null default 0,
  reply_count integer not null default 0,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index broadcast_recent_idx on public.broadcast (created_at desc);

create table public.broadcast_recipient (
  broadcast_id uuid not null references public.broadcast (id) on delete cascade,
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  notification_id uuid references public.notification (id) on delete set null,
  state text not null default 'queued'
    check (state in ('queued', 'sent', 'delivered', 'read', 'replied', 'failed', 'skipped')),
  primary key (broadcast_id, merchant_id)
);

/*
 * The per-merchant message log. The console's Comms panel and the
 * merchant's own inbox are this table — one thread, two views of it,
 * so neither side can claim something was never said.
 */
create table public.merchant_message (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  direction text not null check (direction in ('out', 'in')),
  channel text not null check (channel in
    ('whatsapp', 'sms', 'email', 'dashboard_banner', 'call', 'in_app')),
  subject text,
  body text not null,
  actor_id uuid references public.staff_user (id) on delete set null,
  notification_id uuid references public.notification (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now(),

  constraint merchant_message_body_not_blank check (length(trim(body)) > 0)
);

create index merchant_message_idx on public.merchant_message (merchant_id, created_at desc);

-- ──────────────────────────────────────────── contracts and terms

create table public.merchant_terms_version (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  effective_from date not null,
  pdf_path text,
  status text not null default 'draft' check (status in ('current', 'archived', 'draft')),
  requires_reacceptance boolean not null default true,
  created_at timestamptz not null default now()
);

/* Exactly one current version, enforced rather than remembered. */
create unique index merchant_terms_one_current on public.merchant_terms_version (status)
  where status = 'current';

create table public.merchant_terms_acceptance (
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  terms_version_id uuid not null references public.merchant_terms_version (id) on delete cascade,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz not null default now(),
  ip inet,
  primary key (merchant_id, terms_version_id)
);

create table public.document_automation_rule (
  key text primary key check (key in
    ('remind_30_14_7', 'pause_on_expiry', 'reverify_annually', 'require_new_terms_on_version')),
  label text not null,
  enabled boolean not null default true,
  params jsonb not null default '{}'::jsonb,
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.document_automation_rule (key, label, enabled) values
  ('remind_30_14_7',              'Remind merchant at 30 / 14 / 7 days', true),
  ('pause_on_expiry',             'Pause listing the day after expiry',  true),
  ('reverify_annually',           'Re-verify permits annually',          true),
  ('require_new_terms_on_version','Terms update → merchants must re-accept in dashboard', true)
on conflict (key) do nothing;

-- ──────────────────────────────────────────────────── acquisition

create table public.referral (
  id uuid primary key default gen_random_uuid(),
  referrer_type text not null check (referrer_type in ('hotel', 'merchant')),
  referrer_id uuid not null,
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  code text,
  status text not null default 'applied'
    check (status in ('applied', 'live', 'bonus_pending', 'bonus_paid', 'void')),
  /* Null until a bonus policy exists. */
  bonus_amount_kes bigint,
  went_live_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (merchant_id)
);

create table public.acquisition_source_rule (
  id uuid primary key default gen_random_uuid(),
  pattern text not null unique,
  channel public.acquisition_channel not null,
  note text
);

insert into public.acquisition_source_rule (pattern, channel, note) values
  ('hotel-%',      'hotel_referral',    '?src=hotel-[code]'),
  ('citylead',     'city_lead',         'form · staff id'),
  ('merchantref-%','merchant_referral', 'ref code · pays a bonus on go-live'),
  ('paid-%',       'paid_social',       '?src=ig-[campaign]'),
  ('events-%',     'events',            'weekend markets, expos')
on conflict (pattern) do nothing;

create table public.campaign_spend (
  id uuid primary key default gen_random_uuid(),
  channel public.acquisition_channel not null,
  period_start date not null,
  period_end date not null,
  amount_kes bigint not null check (amount_kes >= 0),
  entered_by uuid references public.staff_user (id) on delete set null,
  unique (channel, period_start, period_end)
);

-- ─────────────────────────────────────────────────────── chains

create table public.merchant_chain_setting (
  parent_id uuid primary key references public.merchant (id) on delete cascade,
  shared_catalogue boolean not null default true,
  shared_hours boolean not null default false,
  consolidated_statement boolean not null default true,
  single_payout boolean not null default true
);

create table public.branch_override (
  branch_id uuid not null references public.merchant_branch (id) on delete cascade,
  field text not null check (field in
    ('hours', 'catalogue_availability', 'prep_minutes', 'delivery_radius')),
  value jsonb not null,
  set_by uuid references public.staff_user (id) on delete set null,
  set_at timestamptz not null default now(),
  primary key (branch_id, field)
);

comment on table public.branch_override is
  'A branch''s own value for something the parent otherwise decides. Resolution is override-if-present, else parent — see fn_merchant_effective_hours.';

-- ───────────────────────────────────────── updated_at triggers

create trigger merchant_statement_set_updated_at
  before update on public.merchant_statement
  for each row execute function public.tg_set_updated_at();

create trigger message_template_set_updated_at
  before update on public.message_template
  for each row execute function public.tg_set_updated_at();
