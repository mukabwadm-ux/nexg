-- The Riders console · schema.
--
-- Extends the rider onboarding build. `cash_cap`, `payout_msisdn`,
-- `payout_name_lookup`, `kit_issued_at`, `source`, `employer_merchant_id`
-- and the activation columns already exist and are reused rather than
-- shadowed.
--
-- The one genuinely new mechanism here is the cash ledger. A rider
-- carrying NexG's money is the riskiest thing in this system, so
-- `cash_on_hand` is never written directly: it is the sum of an
-- append-only event table, maintained by a trigger. Corrections are new
-- rows, not edits, because a balance somebody can type over is not a
-- ledger.

-- ───────────────────────────────────────────────────────── enums

create type public.rider_presence as enum ('offline', 'online', 'on_trip', 'cooldown');
create type public.rider_control_source as enum ('rider', 'staff', 'system');

create type public.incident_kind as enum (
  'accident', 'harassment', 'theft', 'guest_complaint', 'rider_complaint',
  'police_stop', 'breakdown', 'sos', 'other'
);
create type public.incident_severity as enum ('minor', 'major', 'critical');
create type public.incident_status as enum ('open', 'investigating', 'resolved', 'closed');

create type public.fraud_signal_kind as enum (
  'gps_jump', 'delivered_far_from_pin', 'delivered_too_fast', 'shared_device',
  'plate_photo_mismatch', 'cash_marked_mpesa', 'offer_farming'
);

create type public.cash_event_kind as enum (
  'collected', 'deposit', 'netted', 'write_off', 'manual_adjustment', 'recovery_payment'
);
create type public.deposit_match_status as enum (
  'auto_matched', 'manual_matched', 'unmatched', 'rejected'
);
create type public.settlement_line_status as enum (
  'ready', 'cash_netted', 'name_mismatch', 'held', 'failed', 'paid'
);
create type public.shift_commitment_status as enum ('committed', 'showed', 'no_show', 'released');
create type public.rider_health_band as enum ('green', 'amber', 'red');

/* Two-person actions this module adds to the shared approval queue. */
alter type public.approval_kind add value if not exists 'rider_suspension';
alter type public.approval_kind add value if not exists 'rider_offboard';
alter type public.approval_kind add value if not exists 'rider_cash_write_off';
alter type public.approval_kind add value if not exists 'rider_rate_card';
alter type public.approval_kind add value if not exists 'rider_settlement_run';

/* Everything this module sends. Separate transaction from its use. */
alter type public.notification_kind add value if not exists 'rider_activated';
alter type public.notification_kind add value if not exists 'rider_returned';
alter type public.notification_kind add value if not exists 'rider_cooldown';
alter type public.notification_kind add value if not exists 'rider_cooldown_cleared';
alter type public.notification_kind add value if not exists 'rider_suspended';
alter type public.notification_kind add value if not exists 'rider_reinstated';
alter type public.notification_kind add value if not exists 'offers_paused_document';
alter type public.notification_kind add value if not exists 'offers_paused_over_cap';
alter type public.notification_kind add value if not exists 'deposit_reminder';
alter type public.notification_kind add value if not exists 'deposit_matched';
alter type public.notification_kind add value if not exists 'netting_warning';
alter type public.notification_kind add value if not exists 'netted_from_payout';
alter type public.notification_kind add value if not exists 'rider_payout_sent';
alter type public.notification_kind add value if not exists 'payout_failed_name_mismatch';
alter type public.notification_kind add value if not exists 'rate_card_changing';
alter type public.notification_kind add value if not exists 'zone_bonus_live';
alter type public.notification_kind add value if not exists 'rain_mode_on';
alter type public.notification_kind add value if not exists 'shift_reminder';
alter type public.notification_kind add value if not exists 'shift_open_broadcast';
alter type public.notification_kind add value if not exists 'rider_document_expiring';
alter type public.notification_kind add value if not exists 'agreement_updated';
alter type public.notification_kind add value if not exists 'rider_health_warning';
alter type public.notification_kind add value if not exists 'strike_issued';
alter type public.notification_kind add value if not exists 'incident_received';
alter type public.notification_kind add value if not exists 'incident_resolved';
alter type public.notification_kind add value if not exists 'sos_ack';

/* Document requirements gain an owner type for nothing new — riders are
   already covered — but the automation table below needs its own rules. */

-- ─────────────────────────────────────────────── rider columns

alter table public.rider
  add column if not exists presence public.rider_presence not null default 'offline',
  add column if not exists presence_changed_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  /* Only ever read through rpc_rider_live_location, which checks that
     the rider is on a trip or in an SOS and logs who looked. */
  add column if not exists last_location extensions.geography(Point, 4326),
  add column if not exists last_location_at timestamptz,
  add column if not exists current_order_reference text,

  add column if not exists can_receive_offers boolean not null default true,
  add column if not exists can_receive_offers_source public.rider_control_source,
  add column if not exists offers_paused_reason text,
  add column if not exists cooldown_until timestamptz,
  add column if not exists cooldown_reason text,

  add column if not exists pay_on_delivery_eligible boolean not null default false,
  /* Maintained by tg_cash_event_balance. Never written by hand. */
  add column if not exists cash_on_hand bigint not null default 0,
  add column if not exists alcohol_eligible boolean not null default false,
  add column if not exists large_items_eligible boolean not null default false,

  add column if not exists health_band public.rider_health_band,
  add column if not exists health_score integer check (health_score is null or health_score between 0 and 100),
  add column if not exists strike_count integer not null default 0,
  add column if not exists top_decile boolean not null default false,

  add column if not exists training jsonb not null default '{}'::jsonb,
  add column if not exists kit_deposit_kes bigint check (kit_deposit_kes is null or kit_deposit_kes >= 0),
  add column if not exists kit_deposit_status text
    check (kit_deposit_status is null or kit_deposit_status in ('held', 'refunded', 'forfeited', 'waived')),
  add column if not exists background_check jsonb not null default '{}'::jsonb,
  add column if not exists device_fingerprint text,

  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references public.staff_user (id) on delete set null,
  add column if not exists suspension_reason text,
  add column if not exists suspension_second_approver uuid references public.staff_user (id) on delete set null,
  add column if not exists offboarded_at timestamptz,
  add column if not exists offboard_reason text,
  add column if not exists staff_notes text;

create index if not exists rider_presence_idx on public.rider (presence, city_id);
create index if not exists rider_health_idx on public.rider (health_band, health_score);
create index if not exists rider_cash_idx on public.rider (cash_on_hand) where cash_on_hand > 0;
create index if not exists rider_location_idx on public.rider using gist (last_location);

comment on column public.rider.cash_on_hand is
  'NexG money this rider is carrying. Derived from cash_event by trigger and never written directly — a balance somebody can type over is not a ledger.';

comment on column public.rider.last_location is
  'Only ever surfaced through rpc_rider_live_location, which refuses off-trip without a stated reason and logs every look.';

-- ──────────────────────────────────────────── status and presence

create table public.rider_status_change (
  id bigserial primary key,
  rider_id uuid not null references public.rider (id) on delete cascade,
  from_status public.rider_status,
  to_status public.rider_status not null,
  reason text,
  actor_id uuid references public.staff_user (id) on delete set null,
  second_approver_id uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now()
);

create index rider_status_change_idx on public.rider_status_change (rider_id, created_at desc);

create or replace function public.tg_rider_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.rider_status_change (rider_id, from_status, to_status, reason, actor_id)
    values (new.id, old.status, new.status, new.status_reason, authz.staff_id());
  end if;
  return new;
end;
$$;

create trigger rider_status_change
  after update of status on public.rider
  for each row execute function public.tg_rider_status_change();

/*
 * Every going-online, going-offline and trip start. Append-only, and
 * the source of online hours, the supply heatmap and idle detection.
 *
 * Not partitioned yet: at this volume a monthly partition is machinery
 * with nothing in it. The index is on (at) so adding partitions later
 * is a migration and not a rewrite.
 */
create table public.rider_presence_event (
  id bigserial primary key,
  rider_id uuid not null references public.rider (id) on delete cascade,
  presence public.rider_presence not null,
  source public.rider_control_source not null default 'rider',
  location extensions.geography(Point, 4326),
  zone_id uuid references public.zone (id) on delete set null,
  at timestamptz not null default now()
);

create index rider_presence_event_idx on public.rider_presence_event (rider_id, at desc);
create index rider_presence_event_time_idx on public.rider_presence_event (at desc);

-- ──────────────────────────────────── review, references, training

create table public.rider_review (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider (id) on delete cascade,
  reviewer_id uuid not null references public.staff_user (id) on delete restrict,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text check (outcome is null or outcome in ('approved', 'returned', 'rejected')),
  checklist jsonb not null default '{}'::jsonb,
  notes text
);

/* One open review at a time — the lock behind "Being reviewed by …". */
create unique index rider_review_one_open on public.rider_review (rider_id)
  where finished_at is null;

create table public.rider_reference_check (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider (id) on delete cascade,
  name text not null,
  phone text,
  relationship text,
  called_by uuid references public.staff_user (id) on delete set null,
  called_at timestamptz,
  outcome text check (outcome is null or outcome in ('reachable_ok', 'unreachable', 'negative')),
  notes text,
  created_at timestamptz not null default now()
);

create index rider_reference_idx on public.rider_reference_check (rider_id);

create table public.rider_training (
  rider_id uuid not null references public.rider (id) on delete cascade,
  module text not null check (module in ('basics', 'handoff', 'cash', 'alcohol', 'safety')),
  score integer,
  passed boolean not null default false,
  attempts integer not null default 0,
  completed_at timestamptz,
  primary key (rider_id, module)
);

create table public.rider_test_trip (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider (id) on delete cascade,
  order_reference text,
  outcome text check (outcome is null or outcome in ('passed', 'failed')),
  assessor_id uuid references public.staff_user (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────── health and strikes

create table public.rider_health_weight_config (
  key text primary key,
  label text not null,
  weight_pct integer not null check (weight_pct between 0 and 100),
  target numeric(6, 2),
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.rider_health_weight_config (key, label, weight_pct, target) values
  ('acceptance',    'Acceptance rate',            25, null),
  ('on_time',       'On-time delivery',           25, null),
  ('cancellations', 'Cancellations after accept', 15, null),
  ('rating',        'Guest rating',               15, null),
  ('handoff',       'Hand-off compliance (photo, code)', 10, null),
  ('safety',        'Safety (speed, GPS integrity)',     10, null)
on conflict (key) do nothing;

create table public.rider_health_snapshot (
  rider_id uuid not null references public.rider (id) on delete cascade,
  as_of date not null,
  score integer check (score is null or score between 0 and 100),
  band public.rider_health_band,
  acceptance_pct numeric(5, 2),
  on_time_pct numeric(5, 2),
  cancel_after_accept_pct numeric(5, 2),
  rating_avg numeric(3, 2),
  handoff_compliance_pct numeric(5, 2),
  safety_pct numeric(5, 2),
  issues_30d integer not null default 0,
  trips_30d integer not null default 0,
  weights jsonb not null default '{}'::jsonb,
  trend integer[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (rider_id, as_of)
);

create table public.rider_strike (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider (id) on delete cascade,
  level integer not null check (level between 1 and 3),
  reason text not null,
  issued_by uuid references public.staff_user (id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  cleared_at timestamptz,
  cleared_by uuid references public.staff_user (id) on delete set null,
  constraint rider_strike_reason_not_blank check (length(trim(reason)) > 0)
);

create index rider_strike_live_idx on public.rider_strike (rider_id, level)
  where cleared_at is null;

-- ───────────────────────────────────────── incidents and fraud

create table public.incident (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references public.rider (id) on delete set null,
  order_reference text,
  merchant_id uuid references public.merchant (id) on delete set null,
  guest_user_id uuid references auth.users (id) on delete set null,

  kind public.incident_kind not null,
  severity public.incident_severity not null default 'minor',
  status public.incident_status not null default 'open',

  reported_by_type text not null
    check (reported_by_type in ('rider', 'guest', 'merchant', 'staff', 'system')),
  reported_by_id uuid,

  location extensions.geography(Point, 4326),
  happened_at timestamptz not null default now(),
  description text,
  evidence jsonb not null default '[]'::jsonb,

  injury boolean not null default false,
  police_ref text,
  insurance_claim_ref text,
  insurance_claim_status text,
  compensation_kes bigint check (compensation_kes is null or compensation_kes >= 0),
  redispatched_order_reference text,

  assignee_id uuid references public.staff_user (id) on delete set null,
  /* An SOS is not closed by it stopping. Somebody acknowledges it, and
     the banner stays up across every tab until they do. */
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.staff_user (id) on delete set null,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),

  constraint incident_resolution_is_timed check (
    status not in ('resolved', 'closed') or resolved_at is not null
  ),
  constraint incident_resolution_has_an_outcome check (
    status not in ('resolved', 'closed') or coalesce(trim(resolution), '') <> ''
  )
);

create index incident_open_idx on public.incident (status, happened_at desc)
  where status in ('open', 'investigating');
create index incident_rider_idx on public.incident (rider_id, happened_at desc);
/* The SOS banner's query. Partial so it costs nothing when none is open. */
create index incident_sos_idx on public.incident (acknowledged_at)
  where kind = 'sos' and acknowledged_at is null;

create table public.incident_note (
  id bigserial primary key,
  incident_id uuid not null references public.incident (id) on delete cascade,
  author_id uuid references public.staff_user (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index incident_note_idx on public.incident_note (incident_id, created_at);

create table public.fraud_rule (
  kind public.fraud_signal_kind primary key,
  label text not null,
  enabled boolean not null default true,
  params jsonb not null default '{}'::jsonb,
  updated_by uuid references public.staff_user (id) on delete set null
);

insert into public.fraud_rule (kind, label, params) values
  ('gps_jump',               'GPS jump > 2 km in < 1 min',              '{"km": 2, "seconds": 60}'),
  ('delivered_far_from_pin', 'Delivered far from drop-off pin',         '{"metres": 300}'),
  ('delivered_too_fast',     'Delivered < 3 min after pickup',          '{"minutes": 3}'),
  ('shared_device',          'Same device on 2 rider accounts',         '{}'),
  ('plate_photo_mismatch',   'Plate on hand-off photo ≠ registered plate', '{}'),
  ('cash_marked_mpesa',      'Cash order marked delivered without M-Pesa/cash', '{}'),
  ('offer_farming',          'Accept-then-cancel patterns',             '{}')
on conflict (kind) do nothing;

create table public.fraud_signal (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider (id) on delete cascade,
  order_reference text,
  kind public.fraud_signal_kind not null,
  score numeric(5, 2),
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'confirmed', 'dismissed')),
  reviewed_by uuid references public.staff_user (id) on delete set null,
  reviewed_at timestamptz
);

create index fraud_signal_open_idx on public.fraud_signal (status, detected_at desc);
create index fraud_signal_rider_idx on public.fraud_signal (rider_id, detected_at desc);

-- ─────────────────────────────────────────────────── the cash ledger

create table public.cash_rule (
  city_id uuid primary key references public.city (id) on delete cascade,
  /* Null until somebody decides. A cap this page invented would be a
     number a rider is paused against. */
  cap_default_kes bigint,
  cap_new_rider_kes bigint,
  cap_new_rider_days integer not null default 30,
  remind_at_pct integer not null default 80 check (remind_at_pct between 1 and 100),
  pause_at_pct integer not null default 100 check (pause_at_pct between 1 and 200),
  netting_cutoff text not null default 'thu 23:59',
  prefer_mpesa_at_door boolean not null default true,
  recovery_grace_days integer not null default 7,
  two_person_threshold_kes bigint,
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.cash_rule (city_id) select id from public.city
on conflict (city_id) do nothing;

/*
 * The ledger. Append-only, and the only thing that may move a rider's
 * balance. A correction is another row: an edit would make the balance
 * and its history disagree, which is exactly the argument this table
 * exists to settle.
 */
create table public.cash_event (
  id bigserial primary key,
  rider_id uuid not null references public.rider (id) on delete cascade,
  kind public.cash_event_kind not null,
  /* Positive = the rider now holds more of our money. */
  amount_kes bigint not null,
  order_reference text,
  deposit_id uuid,
  settlement_line_id uuid,
  created_by uuid references public.staff_user (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index cash_event_rider_idx on public.cash_event (rider_id, created_at desc);

/* Immutable. Postgres enforces it so no code path has to remember. */
create or replace function public.tg_cash_event_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'A cash event cannot be % — write a correcting row instead.',
    case when tg_op = 'DELETE' then 'deleted' else 'changed' end
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger cash_event_no_update before update on public.cash_event
  for each row execute function public.tg_cash_event_immutable();
create trigger cash_event_no_delete before delete on public.cash_event
  for each row execute function public.tg_cash_event_immutable();

/* The balance follows the ledger, always. */
create or replace function public.tg_cash_event_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.rider
  set cash_on_hand = (
    select coalesce(sum(amount_kes), 0) from public.cash_event where rider_id = new.rider_id
  )
  where id = new.rider_id;
  return new;
end;
$$;

create trigger cash_event_balance after insert on public.cash_event
  for each row execute function public.tg_cash_event_balance();

create table public.cash_deposit (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid references public.rider (id) on delete set null,
  /* The M-Pesa code. Unique, so the same deposit cannot be credited
     twice by a retried webhook or a keen staff member. */
  provider_ref text not null unique,
  msisdn text,
  amount_kes bigint not null check (amount_kes > 0),
  account_reference text,
  paid_at timestamptz not null default now(),
  match_status public.deposit_match_status not null default 'unmatched',
  matched_by uuid references public.staff_user (id) on delete set null,
  matched_at timestamptz,
  created_at timestamptz not null default now()
);

create index cash_deposit_unmatched_idx on public.cash_deposit (match_status, paid_at desc)
  where match_status = 'unmatched';

comment on table public.cash_deposit is
  'Paybill deposits from riders. provider_ref is unique so a retried webhook cannot credit the same M-Pesa code twice.';

-- ──────────────────────────────────────── rate card and earnings

create table public.rider_rate_card (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.city (id) on delete cascade,
  version text not null,
  effective_from timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'current', 'archived')),
  /* All null until finance fills them. A rate card the console invented
     is a promise to a rider about what a trip pays. */
  base_per_trip_kes bigint,
  per_km_after_2km_kes bigint,
  paid_waiting_per_5min_kes bigint,
  second_pickup_bonus_kes bigint,
  peak_bonus_dinner_kes bigint,
  peak_bonus_rain_kes bigint,
  cancellation_after_pickup_kes bigint,
  guest_tips_pass_through_pct integer not null default 100,
  approved_by uuid references public.staff_user (id) on delete set null,
  second_approver_id uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (city_id, version)
);

/* One current card per city, enforced. */
create unique index rider_rate_card_one_current on public.rider_rate_card (city_id)
  where status = 'current';

create table public.rider_bonus_rule (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key in
    ('dinner_peak', 'rain_mode', 'weekend_quest', 'new_rider_guarantee', 'zone_bonus')),
  city_id uuid references public.city (id) on delete cascade,
  zone_id uuid references public.zone (id) on delete cascade,
  enabled boolean not null default false,
  params jsonb not null default '{}'::jsonb,
  /* A zone bonus raised from the Supply tab expires on its own rather
     than staying on because nobody remembered. */
  expires_at timestamptz,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now()
);

create index rider_bonus_live_idx on public.rider_bonus_rule (key, enabled, expires_at);

insert into public.rider_bonus_rule (key, enabled, params) values
  ('dinner_peak',         true,  '{"from": "18:00", "to": "21:00", "green_only": true}'),
  ('rain_mode',           false, '{"source": "weather_api_or_manual"}'),
  ('weekend_quest',       false, '{"trips": 20, "days": ["sat", "sun"]}'),
  ('new_rider_guarantee', true,  '{"first_days": 14}')
on conflict do nothing;

create table public.rider_earning (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider (id) on delete cascade,
  order_reference text,
  rate_card_id uuid references public.rider_rate_card (id) on delete set null,
  base_kes bigint not null default 0,
  distance_kes bigint not null default 0,
  waiting_kes bigint not null default 0,
  pickup_bonus_kes bigint not null default 0,
  peak_bonus_kes bigint not null default 0,
  tip_kes bigint not null default 0,
  penalty_kes bigint not null default 0,
  total_kes bigint not null default 0,
  cash_collected_kes bigint not null default 0,
  is_test boolean not null default false,
  earned_at timestamptz not null default now()
);

create index rider_earning_idx on public.rider_earning (rider_id, earned_at desc);

create table public.rider_adjustment (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider (id) on delete cascade,
  kind text not null,
  amount_kes bigint not null,
  reason text not null,
  created_by uuid references public.staff_user (id) on delete set null,
  approved_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint rider_adjustment_reason_not_blank check (length(trim(reason)) > 0)
);

-- ───────────────────────────────────────────────── settlement

create table public.rider_settlement_run (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.city (id) on delete set null,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_approval', 'approved', 'sent', 'reconciled')),
  total_gross_kes bigint not null default 0,
  total_cash_netted_kes bigint not null default 0,
  total_net_kes bigint not null default 0,
  approved_by uuid references public.staff_user (id) on delete set null,
  second_approver_id uuid references public.staff_user (id) on delete set null,
  b2c_file_path text,
  provider_batch_ref text,
  created_at timestamptz not null default now(),
  unique (city_id, period_start, period_end)
);

create table public.rider_settlement_line (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.rider_settlement_run (id) on delete cascade,
  rider_id uuid not null references public.rider (id) on delete cascade,
  trips integer not null default 0,
  earnings_kes bigint not null default 0,
  bonuses_kes bigint not null default 0,
  cash_collected_kes bigint not null default 0,
  cash_deposited_kes bigint not null default 0,
  cash_net_kes bigint not null default 0,
  tips_kes bigint not null default 0,
  net_pay_kes bigint not null default 0,
  status public.settlement_line_status not null default 'ready',
  payout_msisdn text,
  payout_name text,
  provider_ref text,
  failure_reason text,
  paid_at timestamptz,
  retry_count integer not null default 0,
  /* Fleet riders may be paid through their employer's settlement. The
     line says which, because "where did my money go" is the question
     this column exists to answer. */
  paid_to_merchant_id uuid references public.merchant (id) on delete set null,
  unique (run_id, rider_id)
);

create index rider_settlement_line_idx on public.rider_settlement_line (run_id, status);

comment on column public.rider_settlement_line.net_pay_kes is
  'Earnings less any NexG cash still held past the cutoff. Never negative: if the cash exceeds the earnings the line is held and the rider enters recovery, because a payout run cannot take money off somebody.';

-- ──────────────────────────────────────────── supply and shifts

create table public.shift_commitment (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider (id) on delete cascade,
  zone_id uuid not null references public.zone (id) on delete cascade,
  date date not null,
  time_window text not null check (time_window in ('morning', 'lunch', 'dinner', 'late')),
  status public.shift_commitment_status not null default 'committed',
  committed_at timestamptz not null default now(),
  showed_at timestamptz,
  unique (rider_id, zone_id, date, time_window)
);

create index shift_commitment_idx on public.shift_commitment (zone_id, date, time_window);

create table public.zone_demand_forecast (
  zone_id uuid not null references public.zone (id) on delete cascade,
  dow integer not null check (dow between 1 and 7),
  hour integer not null check (hour between 0 and 23),
  expected_orders numeric(6, 2),
  riders_needed integer,
  refreshed_at timestamptz not null default now(),
  primary key (zone_id, dow, hour)
);

create table public.supply_action (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zone (id) on delete cascade,
  kind text not null check (kind in
    ('raise_zone_bonus', 'nudge_idle', 'broadcast_open_shift', 'widen_dispatch_radius',
     'rain_mode_on', 'rain_mode_off')),
  params jsonb not null default '{}'::jsonb,
  applied_by uuid references public.staff_user (id) on delete set null,
  applied_at timestamptz not null default now(),
  expires_at timestamptz,
  /* Measured after the window, so the next person can see whether
     raising a bonus actually moved anybody. */
  result jsonb
);

create index supply_action_idx on public.supply_action (zone_id, applied_at desc);

create table public.dispatch_zone_setting (
  zone_id uuid primary key references public.zone (id) on delete cascade,
  radius_km numeric(4, 1),
  expires_at timestamptz,
  set_by uuid references public.staff_user (id) on delete set null,
  set_at timestamptz not null default now()
);

-- ───────────────────────────────────── agreements and documents

create table public.rider_agreement_version (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  effective_from date not null,
  pdf_path text,
  status text not null default 'draft' check (status in ('current', 'archived', 'draft')),
  requires_reacceptance boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index rider_agreement_one_current on public.rider_agreement_version (status)
  where status = 'current';

create table public.rider_agreement_acceptance (
  rider_id uuid not null references public.rider (id) on delete cascade,
  agreement_version_id uuid not null references public.rider_agreement_version (id) on delete cascade,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz not null default now(),
  ip inet,
  primary key (rider_id, agreement_version_id)
);

create table public.rider_document_automation_rule (
  key text primary key check (key in
    ('remind_30_14_7', 'pause_offers_on_expiry', 'annual_selfie_reverification',
     'good_conduct_renewal_12m')),
  label text not null,
  enabled boolean not null default true,
  params jsonb not null default '{}'::jsonb,
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.rider_document_automation_rule (key, label, enabled) values
  ('remind_30_14_7',               'Remind in app + SMS at 30 / 14 / 7 days', true),
  ('pause_offers_on_expiry',       'Pause offers the day after expiry',       true),
  ('annual_selfie_reverification', 'Annual selfie re-verification (account sharing)', true),
  ('good_conduct_renewal_12m',     'Good conduct renewal every 12 months',    true)
on conflict (key) do nothing;

-- ───────────────────────────────────────────────────── comms

/* The rider's own inbox and the console's message log are one table. */
create table public.rider_message (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider (id) on delete cascade,
  direction text not null check (direction in ('out', 'in')),
  channel text not null check (channel in
    ('whatsapp', 'sms', 'email', 'push', 'in_app', 'call', 'chat')),
  subject text,
  body text not null,
  actor_id uuid references public.staff_user (id) on delete set null,
  notification_id uuid references public.notification (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rider_message_body_not_blank check (length(trim(body)) > 0)
);

create index rider_message_idx on public.rider_message (rider_id, created_at desc);

/* Notifications and broadcasts gain a rider, alongside ticket, plan and
   merchant. One notification table, four things it can be about. */
alter table public.notification
  add column if not exists rider_id uuid references public.rider (id) on delete cascade;

create index if not exists notification_rider_idx
  on public.notification (rider_id, created_at desc);

create table public.broadcast_rider_recipient (
  broadcast_id uuid not null references public.broadcast (id) on delete cascade,
  rider_id uuid not null references public.rider (id) on delete cascade,
  notification_id uuid references public.notification (id) on delete set null,
  state text not null default 'queued'
    check (state in ('queued', 'sent', 'delivered', 'read', 'replied', 'failed', 'deferred')),
  /* Deferred rather than failed: a rider on a trip is not unreachable,
     they are busy, and the message goes out when the trip ends. */
  deferred_reason text,
  primary key (broadcast_id, rider_id)
);

-- ═══════════════════════════════════════════ row level security
--
-- Reads are a policy, writes are an RPC. Not one table below gets an
-- insert, update or delete policy: every legitimate write goes through
-- a SECURITY DEFINER function that checks who is asking. The blanket
-- grants Supabase hands `anon` on new tables are revoked outright, so a
-- policy somebody forgets to write can never read as permission.
--
-- The cash ledger deserves the emphasis. `cash_event` rows say how much
-- of NexG's money a named person is carrying; `cash_deposit` rows carry
-- M-Pesa numbers. Neither is readable without either working riders in
-- that city or being the rider it is about.

create or replace function authz.works_rider(p_rider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rider r
    where r.id = p_rider_id
      and (
        authz.is_super_admin()
        or authz.has_role('ops_manager', r.city_id)
        or authz.has_role('rider_ops', r.city_id)
      )
  )
$$;

comment on function authz.works_rider(uuid) is
  'May this staff member act on this rider. Mirrors authz.works_merchant — city-scoped, so a Mombasa lead does not read Nairobi''s cash ledger.';

/* Is this the rider themselves? */
create or replace function authz.is_rider_self(p_rider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rider r
    where r.id = p_rider_id and r.user_id = (select auth.uid())
  )
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'rider_status_change', 'rider_presence_event', 'rider_review', 'rider_reference_check',
    'rider_training', 'rider_test_trip', 'rider_health_weight_config', 'rider_health_snapshot',
    'rider_strike', 'incident', 'incident_note', 'fraud_rule', 'fraud_signal',
    'cash_rule', 'cash_event', 'cash_deposit', 'rider_rate_card', 'rider_bonus_rule',
    'rider_earning', 'rider_adjustment', 'rider_settlement_run', 'rider_settlement_line',
    'shift_commitment', 'zone_demand_forecast', 'supply_action', 'dispatch_zone_setting',
    'rider_agreement_version', 'rider_agreement_acceptance', 'rider_document_automation_rule',
    'rider_message', 'broadcast_rider_recipient'
  ]
  loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- ───────────────────────────── staff-only: how NexG runs the fleet

create policy rider_health_weight_config_read on public.rider_health_weight_config
  for select to authenticated using (authz.reaches_module('riders'));
create policy fraud_rule_read on public.fraud_rule
  for select to authenticated using (authz.reaches_module('riders'));
create policy fraud_signal_read on public.fraud_signal
  for select to authenticated using (authz.works_rider(rider_id));
create policy cash_rule_read on public.cash_rule
  for select to authenticated using (authz.reaches_module('riders'));
create policy rider_settlement_run_read on public.rider_settlement_run
  for select to authenticated using (authz.reaches_module('riders'));
create policy zone_demand_forecast_read on public.zone_demand_forecast
  for select to authenticated using (authz.reaches_module('riders'));
create policy supply_action_read on public.supply_action
  for select to authenticated using (authz.reaches_module('riders'));
create policy dispatch_zone_setting_read on public.dispatch_zone_setting
  for select to authenticated using (authz.reaches_module('riders'));
create policy rider_document_automation_rule_read on public.rider_document_automation_rule
  for select to authenticated using (authz.reaches_module('riders'));
create policy cash_deposit_read on public.cash_deposit
  for select to authenticated
  using (authz.reaches_module('riders') or authz.is_rider_self(rider_id));
create policy rider_review_read on public.rider_review
  for select to authenticated using (authz.works_rider(rider_id));
create policy rider_reference_check_read on public.rider_reference_check
  for select to authenticated using (authz.works_rider(rider_id));
create policy rider_test_trip_read on public.rider_test_trip
  for select to authenticated using (authz.works_rider(rider_id));

/*
 * A referee's phone number is somebody who agreed to speak to NexG
 * about a rider, not to the rider about themselves. Staff only, on
 * purpose.
 */
comment on table public.rider_reference_check is
  'Referees a rider named. Staff-only reads: a referee spoke to NexG in confidence, not to the rider.';

-- ────────────────────────── the rider's own record, and their city's staff

create policy rider_status_change_read on public.rider_status_change
  for select to authenticated
  using (authz.works_rider(rider_id) or authz.is_rider_self(rider_id));

create policy rider_presence_event_read on public.rider_presence_event
  for select to authenticated
  using (authz.works_rider(rider_id) or authz.is_rider_self(rider_id));

create policy rider_training_read on public.rider_training
  for select to authenticated
  using (authz.works_rider(rider_id) or authz.is_rider_self(rider_id));

create policy rider_health_snapshot_read on public.rider_health_snapshot
  for select to authenticated
  using (authz.works_rider(rider_id) or authz.is_rider_self(rider_id));

/* Being disciplined without being told is worse than the discipline. */
create policy rider_strike_read on public.rider_strike
  for select to authenticated
  using (authz.works_rider(rider_id) or authz.is_rider_self(rider_id));

create policy cash_event_read on public.cash_event
  for select to authenticated
  using (authz.works_rider(rider_id) or authz.is_rider_self(rider_id));

create policy rider_earning_read on public.rider_earning
  for select to authenticated
  using (authz.works_rider(rider_id) or authz.is_rider_self(rider_id));

create policy rider_adjustment_read on public.rider_adjustment
  for select to authenticated
  using (authz.works_rider(rider_id) or authz.is_rider_self(rider_id));

create policy rider_settlement_line_read on public.rider_settlement_line
  for select to authenticated
  using (authz.works_rider(rider_id) or authz.is_rider_self(rider_id));

create policy shift_commitment_read on public.shift_commitment
  for select to authenticated
  using (authz.works_rider(rider_id) or authz.is_rider_self(rider_id));

create policy rider_message_read on public.rider_message
  for select to authenticated
  using (authz.works_rider(rider_id) or authz.is_rider_self(rider_id));

create policy broadcast_rider_recipient_read on public.broadcast_rider_recipient
  for select to authenticated
  using (authz.works_rider(rider_id) or authz.is_rider_self(rider_id));

create policy rider_agreement_acceptance_read on public.rider_agreement_acceptance
  for select to authenticated
  using (authz.works_rider(rider_id) or authz.is_rider_self(rider_id));

/*
 * The rate card and the live bonuses are what a rider is being paid.
 * Any signed-in rider reads them, because pay you are not allowed to
 * look up is not a rate card.
 */
create policy rider_rate_card_read on public.rider_rate_card
  for select to authenticated
  using (status = 'current' or authz.reaches_module('riders'));

create policy rider_bonus_rule_read on public.rider_bonus_rule
  for select to authenticated
  using (enabled or authz.reaches_module('riders'));

/* Terms you cannot open are terms you cannot accept. */
create policy rider_agreement_version_read on public.rider_agreement_version
  for select to authenticated using (true);

-- ───────────────────────────────────────── incidents and the SOS

/*
 * An incident names a rider, a guest and sometimes a police reference.
 * Staff who work that rider read it; so does the rider it happened to,
 * and the guest who raised it.
 */
create policy incident_read on public.incident
  for select to authenticated
  using (
    authz.reaches_module('riders')
    or (rider_id is not null and authz.is_rider_self(rider_id))
    or (guest_user_id is not null and guest_user_id = (select auth.uid()))
  );

create policy incident_note_read on public.incident_note
  for select to authenticated
  using (authz.reaches_module('riders'));
