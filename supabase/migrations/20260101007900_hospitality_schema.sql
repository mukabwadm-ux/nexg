-- Hotels & Airbnb · schema.
--
-- Hosts and hotels are NexG's primary demand channel. A property sets
-- its rules once — gate code, askari, lockbox, delivery hours, floor
-- access, "call before arriving" — and every order follows them
-- without waking the host up.
--
-- Three things this schema exists to make true, and which are enforced
-- here rather than in whichever surface remembers:
--
--   1. The unit or room is the context. A QR resolves to an address, a
--      hand-off rule and a delivery window; nothing downstream retypes
--      any of it.
--   2. A folio line reaches a hotel's bill only after a named person at
--      the desk confirms the guest is in-house. `awaiting_desk` is the
--      default and `posted` requires an action.
--   3. Guest data is minimal, masked and erasable. Phone numbers are
--      masked in every staff view, reveals are audited, and an erasure
--      request anonymises rather than deletes where finance records are
--      inside their retention period.
--
-- There is no orders domain yet, so orders are referenced by text
-- rather than by a foreign key. When one lands, `order_reference`
-- becomes an FK in one migration.

-- ═══════════════════════════════════════════════════ enums

create type public.host_kind as enum ('single_unit', 'multi_unit', 'property_manager');
create type public.host_tier as enum ('listed', 'silver', 'gold');
create type public.host_status as enum ('applied', 'verifying', 'live', 'paused', 'offboarded');
create type public.unit_status as enum ('setting_up', 'live', 'paused', 'archived');

create type public.handoff_mode as enum (
  'guest_meets_at_gate', 'leave_with_askari', 'lockbox',
  'call_guest_first', 'reception', 'caretaker'
);

create type public.qr_state as enum ('generated', 'sent', 'placed', 'scanned', 'replaced');
create type public.package_schedule as enum ('per_booking', 'every_checkin', 'manual');

create type public.hotel_status as enum ('prospect', 'onboarding', 'partner', 'paused', 'ended');
create type public.hotel_tier as enum ('listed', 'silver', 'gold');

create type public.folio_status as enum (
  'awaiting_desk', 'posted', 'rejected_checked_out', 'rejected_name_mismatch',
  'rejected_cap', 'recharged_card', 'void'
);
create type public.folio_sync as enum ('pms', 'manual');
create type public.recon_status as enum (
  'open', 'matched', 'missing_reference', 'disputed', 'reconciled'
);
create type public.invoice_status as enum ('draft', 'sent', 'due', 'overdue', 'paid', 'credited');

create type public.guest_consent_kind as enum ('service_sms', 'marketing', 'analytics');
create type public.data_request_kind as enum ('access', 'erasure', 'rectification', 'restriction');
create type public.data_request_status as enum (
  'received', 'identity_pending', 'in_progress', 'bundle_ready',
  'fulfilled', 'refused', 'withdrawn'
);

/* Two-person actions this capability adds. */
alter type public.approval_kind add value if not exists 'hotel_activation';
alter type public.approval_kind add value if not exists 'folio_void';
alter type public.approval_kind add value if not exists 'reconciliation_write_off';
alter type public.approval_kind add value if not exists 'guest_anonymise';
alter type public.approval_kind add value if not exists 'guest_block';

/* Everything this capability sends. */
alter type public.notification_kind add value if not exists 'host_ack';
alter type public.notification_kind add value if not exists 'host_resume_link';
alter type public.notification_kind add value if not exists 'host_verified';
alter type public.notification_kind add value if not exists 'unit_live';
alter type public.notification_kind add value if not exists 'qr_pack';
alter type public.notification_kind add value if not exists 'caretaker_confirm';
alter type public.notification_kind add value if not exists 'package_delivered';
alter type public.notification_kind add value if not exists 'host_invoice_ready';
alter type public.notification_kind add value if not exists 'host_invoice_due';
alter type public.notification_kind add value if not exists 'unit_paused_by_staff';
alter type public.notification_kind add value if not exists 'host_message';
alter type public.notification_kind add value if not exists 'hotel_users_invite';
alter type public.notification_kind add value if not exists 'folio_new';
alter type public.notification_kind add value if not exists 'folio_escalated';
alter type public.notification_kind add value if not exists 'statement_ready';
alter type public.notification_kind add value if not exists 'statement_due';
alter type public.notification_kind add value if not exists 'reconciliation_lines';
alter type public.notification_kind add value if not exists 'access_rule_changed';
alter type public.notification_kind add value if not exists 'charged_to_room';
alter type public.notification_kind add value if not exists 'folio_rejected_pay_now';
alter type public.notification_kind add value if not exists 'desk_ordered_for_you';
alter type public.notification_kind add value if not exists 'data_request_received';
alter type public.notification_kind add value if not exists 'data_request_identity_otp';
alter type public.notification_kind add value if not exists 'data_request_bundle_ready';
alter type public.notification_kind add value if not exists 'data_request_fulfilled';
alter type public.notification_kind add value if not exists 'data_request_held';
alter type public.notification_kind add value if not exists 'handoff_rule_changed_next_time';

-- ═══════════════════════════════════════════════════ hosts

create table public.host (
  id uuid primary key default gen_random_uuid(),
  kind public.host_kind not null default 'single_unit',
  display_name text,
  contact_name text,
  phone text not null unique,
  email text,
  city_id uuid references public.city (id) on delete set null,
  areas text[] not null default '{}',
  tier public.host_tier not null default 'listed',
  status public.host_status not null default 'applied',
  status_reason text,
  superhost_claimed boolean not null default false,
  listing_link text,

  /* A host goes live through rpc_host_verify and no other path. */
  verified_at timestamptz,
  verified_by uuid references public.staff_user (id) on delete set null,
  verification jsonb not null default '{}'::jsonb,

  units_declared_band text check (units_declared_band in ('1', '2_5', '6_20', '20_plus')),
  default_handoff public.handoff_mode,
  packages_enabled boolean not null default false,
  billing_method text check (billing_method in ('mpesa', 'card_on_file', 'invoice')),
  billing_details jsonb not null default '{}'::jsonb,
  referral_code text unique,

  onboarding_step integer not null default 1,
  resume_token_hash text,
  resume_token_expires_at timestamptz,
  submitted_at timestamptz,
  went_live_at timestamptz,
  paused_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint host_live_is_verified check (status <> 'live' or verified_at is not null)
);

create index host_status_idx on public.host (status, city_id);
create index host_tier_idx on public.host (tier) where status = 'live';

comment on constraint host_live_is_verified on public.host is
  'A host cannot be live without having been verified. The only path is rpc_host_verify — a status update that skips it is refused by the database, not by the screen.';

create table public.host_user (
  host_id uuid not null references public.host (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'manager')),
  /* A property manager's staff may be scoped to some units. Null means
     every unit of that host. */
  units uuid[],
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (host_id, user_id)
);

create index host_user_by_user on public.host_user (user_id);

-- ═══════════════════════════════════════════════════ units

create table public.unit (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.host (id) on delete cascade,
  name text not null,
  /* What guests and riders see. Never the host's own shorthand. */
  label_public text,
  address_line text,
  building text,
  unit_no text,
  area text,
  city_id uuid references public.city (id) on delete set null,
  point extensions.geography(Point, 4326),
  zone_id uuid references public.zone (id) on delete set null,
  floor text,
  status public.unit_status not null default 'setting_up',

  handoff public.handoff_mode,
  /* The host's own words, shown to riders verbatim. Capped because a
     rider reads this on a phone at a gate in the dark. */
  handoff_note text check (handoff_note is null or length(handoff_note) <= 240),

  /*
   * Encrypted at rest. Decrypted only by rpc_rider_reveal_gate_code —
   * assigned rider, inside the delivery window, near the door, once —
   * and by rpc_unit_secret_reveal for staff with a stated reason. It is
   * never in a view.
   */
  gate_code_encrypted bytea,
  askari_name text,
  askari_phone_encrypted bytea,
  caretaker_name text,
  caretaker_phone_encrypted bytea,
  caretaker_confirmed_at timestamptz,

  delivery_hours jsonb,
  parking_note text,
  lift_note text,
  wifi_name text,
  house_rules_link text,
  checkin_time time,
  checkout_time time,

  packages_default uuid,
  packages_schedule public.package_schedule,

  readiness jsonb not null default '{}'::jsonb,
  paused_reason text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (host_id, name),

  /*
   * The modes that need somebody on the other end need that somebody
   * confirmed. A unit that says "leave with the askari" without a
   * confirmed askari is a parcel left with a stranger.
   */
  constraint unit_live_needs_a_confirmed_contact check (
    status <> 'live'
    or handoff not in ('leave_with_askari', 'caretaker')
    or caretaker_confirmed_at is not null
  ),
  constraint unit_live_needs_an_address check (
    status <> 'live' or (address_line is not null and handoff is not null)
  )
);

create index unit_host_idx on public.unit (host_id, status);
create index unit_city_idx on public.unit (city_id, status);
create index unit_point_idx on public.unit using gist (point);

comment on column public.unit.gate_code_encrypted is
  'Encrypted. Reachable only through rpc_rider_reveal_gate_code and rpc_unit_secret_reveal, both audited. It appears in no view, ever.';

/*
 * The QR. One active per unit; replacing voids the old one, so a card
 * left on a counter after a host reprints cannot be used to order to
 * an address the host has changed.
 */
create table public.unit_qr (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.unit (id) on delete cascade,
  room_id uuid,
  code text not null unique,
  token_hash text,
  state public.qr_state not null default 'generated',
  generated_at timestamptz not null default now(),
  sent_at timestamptz,
  placed_confirmed_at timestamptz,
  first_scanned_at timestamptz,
  scans integer not null default 0,
  replaced_by uuid references public.unit_qr (id) on delete set null,
  voided_at timestamptz,

  constraint qr_belongs_somewhere check (num_nonnulls(unit_id, room_id) = 1)
);

create unique index unit_qr_one_active on public.unit_qr (unit_id)
  where voided_at is null and unit_id is not null;
create unique index room_qr_one_active on public.unit_qr (room_id)
  where voided_at is null and room_id is not null;

create table public.qr_scan (
  id bigserial primary key,
  qr_id uuid not null references public.unit_qr (id) on delete cascade,
  at timestamptz not null default now(),
  /* Hashed, never the agent string: it is a fingerprint. */
  user_agent_hash text,
  outcome text not null default 'landed' check (outcome in ('landed', 'ordered', 'bounced')),
  order_reference text
);

create index qr_scan_idx on public.qr_scan (qr_id, at desc);

-- ═══════════════════════════════════════════ welcome packages

create table public.welcome_package (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.city (id) on delete cascade,
  name text not null,
  description text,
  items jsonb not null default '[]'::jsonb,
  /* Null until somebody prices it. "from KES [—]" is the honest
     rendering; a number invented here is one a host gets invoiced. */
  price bigint,
  lead_hours integer not null default 4,
  photo_path text,
  merchant_id uuid references public.merchant (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'live', 'retired')),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.welcome_package (city_id, name, description, status, sort)
select c.id, p.name, p.description, 'live', p.sort
from public.city c
cross join (values
  ('Essentials',       'Water ×4, tea, coffee, sugar, milk', 10),
  ('Breakfast basket', 'Bread, eggs, fruit, juice, butter, jam', 20),
  ('Welcome flowers',  'Seasonal bouquet, vase on request', 30),
  ('Arrival kit',      'Local SIM, adapter, area map, snacks', 40)
) as p(name, description, sort)
where not exists (
  select 1 from public.welcome_package w where w.city_id = c.id and w.name = p.name
);

create table public.package_order (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.host (id) on delete cascade,
  unit_id uuid not null references public.unit (id) on delete cascade,
  package_id uuid not null references public.welcome_package (id) on delete restrict,
  for_checkin_at timestamptz not null,
  guest_name_optional text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'placed', 'delivered', 'photo_confirmed', 'cancelled')),
  order_reference text,
  photo_path text,
  billed_invoice_id uuid,
  created_at timestamptz not null default now()
);

create index package_order_due_idx on public.package_order (for_checkin_at)
  where status = 'scheduled';

create table public.host_invoice (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.host (id) on delete cascade,
  period date not null,
  lines jsonb not null default '[]'::jsonb,
  subtotal bigint not null default 0,
  total bigint not null default 0,
  status public.invoice_status not null default 'draft',
  pdf_path text,
  due_at date,
  paid_at timestamptz,
  provider_ref text,
  created_at timestamptz not null default now(),
  unique (host_id, period)
);

create table public.host_billing_event (
  id bigserial primary key,
  host_id uuid not null references public.host (id) on delete cascade,
  kind text not null,
  amount_kes bigint not null,
  package_order_id uuid references public.package_order (id) on delete set null,
  invoice_id uuid references public.host_invoice (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index host_billing_idx on public.host_billing_event (host_id, created_at desc);

create table public.host_message (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.host (id) on delete cascade,
  direction text not null check (direction in ('out', 'in')),
  channel text not null check (channel in
    ('whatsapp', 'sms', 'email', 'push', 'in_app', 'call', 'chat')),
  subject text,
  body text not null,
  actor_id uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now()
);

create index host_message_idx on public.host_message (host_id, created_at desc);

-- ═══════════════════════════════════════════════════ hotels

create table public.hotel (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  city_id uuid references public.city (id) on delete set null,
  area text,
  point extensions.geography(Point, 4326),
  rooms integer,
  star_rating numeric(2, 1),
  status public.hotel_status not null default 'prospect',
  tier public.hotel_tier,
  gm_name text,

  agreement_version text,
  agreement_signed_at timestamptz,
  agreement_pdf_path text,
  /* Null until finance sets it. Nothing here invents a commission. */
  commission_pct numeric(5, 2),
  invoice_terms_days integer not null default 14,

  pms_vendor text,
  pms_integration text not null default 'none'
    check (pms_integration in ('none', 'csv', 'api')),
  pms_property_code text,

  paused_reason text,
  owner_staff_id uuid references public.staff_user (id) on delete set null,
  prospect_stage text default 'identified' check (prospect_stage in
    ('identified', 'contacted', 'site_visit_booked', 'proposal', 'agreement', 'won', 'lost')),
  next_action_at timestamptz,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /*
   * A partner hotel has a signed agreement. Without one there is no
   * commercial basis to post anything to a guest's bill.
   */
  constraint hotel_partner_has_an_agreement check (
    status <> 'partner' or agreement_signed_at is not null
  )
);

create index hotel_status_idx on public.hotel (status, city_id);
create index hotel_prospect_idx on public.hotel (prospect_stage, next_action_at)
  where status = 'prospect';

create table public.hotel_user (
  hotel_id uuid not null references public.hotel (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'desk', 'finance')),
  desk_station text,
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (hotel_id, user_id)
);

create index hotel_user_by_user on public.hotel_user (user_id);

create table public.hotel_contact (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotel (id) on delete cascade,
  name text not null,
  role text,
  phone_encrypted bytea,
  phone_last2 text,
  email text,
  ext text,
  is_escalation boolean not null default false,
  is_desk boolean not null default false,
  is_finance boolean not null default false,
  created_at timestamptz not null default now()
);

create index hotel_contact_idx on public.hotel_contact (hotel_id);

create table public.hotel_program_setting (
  hotel_id uuid primary key references public.hotel (id) on delete cascade,
  charge_to_room boolean not null default false,
  /* Null means no cap has been agreed, and rpc_folio_request treats
     that as "cannot check", not as "unlimited". */
  charge_cap_per_stay bigint,
  folio_sync public.folio_sync not null default 'manual',
  folio_sync_time time,
  in_room_qr boolean not null default false,
  room_cards_printed integer not null default 0,
  front_desk_ordering boolean not null default false,
  preferred_suppliers uuid[] not null default '{}',
  guest_pays_delivery boolean not null default true,
  service_charge_pct numeric(5, 2),
  desk_sla_minutes integer not null default 40,
  escalate_after_minutes integer not null default 60,
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);

/*
 * Versioned, because a rider who left with version 3 must arrive with
 * version 3. Changing the rule mid-trip is how somebody gets turned
 * away at a service gate they were told to use.
 */
create table public.hotel_access_rule (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotel (id) on delete cascade,
  version integer not null default 1,
  text text not null,
  delivery_from time,
  delivery_to time,
  after_hours_handoff text check (after_hours_handoff in ('reception', 'none')),
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (hotel_id, version)
);

create unique index hotel_access_rule_current on public.hotel_access_rule (hotel_id)
  where superseded_at is null;

create table public.hotel_room (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotel (id) on delete cascade,
  room_no text not null,
  room_type text,
  floor text,
  status text not null default 'active' check (status in ('active', 'out_of_service')),
  unique (hotel_id, room_no)
);

alter table public.unit_qr
  add constraint unit_qr_room_fk foreign key (room_id)
  references public.hotel_room (id) on delete cascade;

-- ═══════════════════════════════════════════ charge to room

create table public.folio_posting (
  id uuid primary key default gen_random_uuid(),
  /* Text rather than a foreign key: there is no orders domain yet.
     Unique, so one order cannot be posted to a folio twice. */
  order_reference text not null unique,
  hotel_id uuid not null references public.hotel (id) on delete restrict,
  room_no text not null,
  guest_surname text not null,
  guest_id uuid,
  amount bigint not null check (amount > 0),
  commission_amount bigint,

  /* awaiting_desk is the default, on purpose. A line reaches a guest's
     bill because a named person said the guest is in-house. */
  status public.folio_status not null default 'awaiting_desk',
  desk_user_id uuid references auth.users (id) on delete set null,
  desk_action_at timestamptz,
  desk_note text,
  folio_ref text,
  sync public.folio_sync not null default 'manual',
  pms_posted_at timestamptz,
  cap_check jsonb not null default '{}'::jsonb,
  escalated_at timestamptz,
  recharged_payment_ref text,
  voided_reason text,
  created_at timestamptz not null default now(),

  constraint folio_posted_is_attributed check (
    status <> 'posted' or desk_action_at is not null or pms_posted_at is not null
  )
);

create index folio_awaiting_idx on public.folio_posting (hotel_id, created_at)
  where status = 'awaiting_desk';
create index folio_hotel_idx on public.folio_posting (hotel_id, created_at desc);

comment on constraint folio_posted_is_attributed on public.folio_posting is
  'Posted means somebody at the desk confirmed it, or a PMS did. A line cannot become posted on its own.';

create table public.folio_cap_usage (
  hotel_id uuid not null references public.hotel (id) on delete cascade,
  stay_key text not null,
  room_no text not null,
  used bigint not null default 0,
  last_order_at timestamptz,
  primary key (hotel_id, stay_key)
);

create table public.hotel_statement (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotel (id) on delete cascade,
  period date not null,
  postings_count integer not null default 0,
  gross bigint not null default 0,
  commission bigint not null default 0,
  net_invoiced bigint not null default 0,
  status public.invoice_status not null default 'draft',
  pdf_path text,
  due_at date,
  paid_at timestamptz,
  provider_ref text,
  created_at timestamptz not null default now(),
  unique (hotel_id, period)
);

comment on column public.hotel_statement.net_invoiced is
  'What NexG invoices the hotel: gross less commission. The commercial model is finance''s to confirm; nothing here assumes a rate.';

create table public.folio_reconciliation (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.hotel_statement (id) on delete cascade,
  hotel_line_ref text,
  hotel_amount bigint,
  nexg_order_reference text,
  nexg_amount bigint,
  status public.recon_status not null default 'open',
  resolved_by uuid references public.staff_user (id) on delete set null,
  resolved_at timestamptz,
  note text
);

create index folio_recon_idx on public.folio_reconciliation (statement_id, status);

create table public.hotel_prospect_activity (
  id bigserial primary key,
  hotel_id uuid not null references public.hotel (id) on delete cascade,
  kind text not null check (kind in
    ('call', 'email', 'site_visit', 'proposal_sent', 'agreement_sent', 'note')),
  at timestamptz not null default now(),
  by uuid references public.staff_user (id) on delete set null,
  notes text,
  next_action_at timestamptz
);

create index hotel_activity_idx on public.hotel_prospect_activity (hotel_id, at desc);

-- ═══════════════════════════════════════ guests, consent, KDPA

/*
 * The guest. Deliberately thin: a phone number, a name if they gave
 * one, and what we need to serve them. Everything here is disclosable
 * to the guest under a KDPA access request, including staff_notes —
 * which is why the column comment says to keep it factual.
 */
create table public.guest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  phone text unique,
  name text,
  country_code text,
  vip boolean not null default false,
  blocked boolean not null default false,
  block_reason text,

  preferences jsonb not null default '{}'::jsonb,
  payment_summary jsonb not null default '{}'::jsonb,
  refusal_count integer not null default 0,
  dispute_count integer not null default 0,
  repeat_count integer not null default 0,
  last_stay jsonb,
  staff_notes text,

  anonymised_at timestamptz,
  last_order_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index guest_phone_idx on public.guest (phone);
create index guest_blocked_idx on public.guest (blocked) where blocked;

comment on column public.guest.staff_notes is
  'Disclosed to the guest under a KDPA access request. Keep it factual — write what you would be willing to read back to them.';

create table public.guest_consent (
  id bigserial primary key,
  guest_id uuid not null references public.guest (id) on delete cascade,
  kind public.guest_consent_kind not null,
  granted boolean not null,
  at timestamptz not null default now(),
  source text not null check (source in ('checkout', 'account', 'staff', 'import')),
  ip_hash text
);

create index guest_consent_idx on public.guest_consent (guest_id, kind, at desc);

comment on table public.guest_consent is
  'Append-only history. Service SMS is necessary to deliver an order; marketing and analytics are opt-in and default off.';

create table public.guest_block (
  id bigserial primary key,
  guest_id uuid not null references public.guest (id) on delete cascade,
  reason text not null,
  by uuid references public.staff_user (id) on delete set null,
  at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.staff_user (id) on delete set null
);

create table public.data_request (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references public.guest (id) on delete set null,
  requester_phone text,
  requester_email text,
  kind public.data_request_kind not null,
  status public.data_request_status not null default 'received',
  received_at timestamptz not null default now(),
  /* The statutory window. Confirm the period with counsel under the
     Kenya Data Protection Act before this is relied on. */
  due_at timestamptz not null default now() + interval '30 days',
  channel text,
  identity_verified_at timestamptz,
  identity_method text check (identity_method in ('otp', 'document')),
  scope text[] not null default '{orders,messages,payments,profile,consents}',
  bundle_path text,
  bundle_expires_at timestamptz,
  blocking_reasons jsonb not null default '{}'::jsonb,
  handled_by uuid references public.staff_user (id) on delete set null,
  fulfilled_at timestamptz,
  refusal_reason text,
  communication_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),

  constraint data_request_refusal_has_a_reason check (
    status <> 'refused' or coalesce(trim(refusal_reason), '') <> ''
  )
);

create index data_request_open_idx on public.data_request (status, due_at)
  where status not in ('fulfilled', 'refused', 'withdrawn');

create table public.retention_rule (
  key text primary key,
  subject text not null,
  retain_for interval,
  basis text not null,
  anonymise boolean not null default true,
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.retention_rule (key, subject, retain_for, basis, anonymise) values
  ('guest_checkout_no_account', 'Guest checkout data (no account)', interval '90 days',
   'No account to maintain; kept only to service the order and handle disputes.', true),
  ('guest_account', 'Accounts', interval '24 months',
   'Until a deletion request, or 24 months inactive.', true),
  ('finance_records', 'Finance records', interval '7 years',
   'Statutory retention. Anonymised rather than deleted while inside the period.', false),
  ('messages', 'Messages', interval '12 months',
   'Dispute evidence and service history.', true),
  ('location', 'Location', interval '90 days',
   'Delivery accuracy and incident investigation.', true),
  ('qr_scans', 'QR scans', interval '12 months',
   'Conversion measurement; no personal data held.', true)
on conflict (key) do nothing;

comment on table public.retention_rule is
  'Every period here is provisional until confirmed with counsel under the Kenya Data Protection Act. They are stored rather than hard-coded so that confirming them is a row update, not a deploy.';

-- ═══════════════════════════════════ the module, and a new role

update public.console_module set href = '/hotels' where key = 'hotels';

insert into public.role (key, label, description) values
  ('partnerships', 'Partnerships', 'Signs up hotels and verifies Airbnb hosts.')
on conflict (key) do nothing;

insert into public.role_module_access (role_key, module_key, level) values
  ('partnerships', 'hotels', 'full'),
  ('partnerships', 'merchants', 'view'),
  ('partnerships', 'overview', 'view'),
  ('dpo', 'hotels', 'full'),
  ('dpo', 'overview', 'view')
on conflict (role_key, module_key) do nothing;

/* The DPO handles access and erasure requests. Nobody else should. */
insert into public.role_module_access (role_key, module_key, level) values
  ('finance', 'hotels', 'view')
on conflict (role_key, module_key) do nothing;

-- ═══════════════════════════════════════ updated_at triggers

create trigger host_set_updated_at before update on public.host
  for each row execute function public.tg_set_updated_at();
create trigger unit_set_updated_at before update on public.unit
  for each row execute function public.tg_set_updated_at();
create trigger hotel_set_updated_at before update on public.hotel
  for each row execute function public.tg_set_updated_at();
create trigger guest_set_updated_at before update on public.guest
  for each row execute function public.tg_set_updated_at();
