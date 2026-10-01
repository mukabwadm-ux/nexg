-- Featured slots · schema.
--
-- NexG's only paid placement. A merchant pays a weekly fee to sit in
-- one of a small, fixed number of positions. Everything else on the
-- platform is ranked by relevance and quality and cannot be bought.
--
-- Four rules make that claim true rather than marketing, and each is
-- enforced here rather than in whichever surface remembers:
--
--   Always labelled. `featured_live_v` hands every surface the same
--   SPONSORED badge; there is no code path that renders a paid card
--   without one.
--
--   Eligibility is automatic, the decision is human. Five checks run
--   nightly while a slot is live. A failing check auto-pauses and
--   credits pro-rata. Passing again does NOT auto-restore — a merchant
--   flickering green and amber would flicker on the homepage.
--
--   Staff cannot type a price. Quotes come from a versioned rate card,
--   and a placement with no price cannot be quoted at all.
--
--   Billing goes through settlement. A fee is a line on the merchant's
--   Friday statement, never a separate invoice to chase.
--
-- Every price in here starts null. A rate this file invented is one a
-- real merchant would be charged.

-- ═══════════════════════════════════════════════════ enums

create type public.placement_kind as enum ('homepage', 'category_top', 'popular_request');

create type public.slot_status as enum (
  'open', 'held', 'booked', 'live', 'auto_paused', 'paused', 'ended'
);

create type public.booking_status as enum (
  'requested', 'waitlisted', 'quoted', 'booked', 'live',
  'auto_paused', 'paused', 'ended', 'declined', 'expired', 'cancelled'
);

create type public.eligibility_check as enum (
  'live_30d', 'health_green_30d', 'no_open_disputes',
  'settlement_verified', 'not_holding_placement'
);

create type public.creative_status as enum ('draft', 'pending_review', 'approved', 'rejected');
create type public.featured_event_kind as enum ('view', 'tap', 'order');
create type public.fee_line_status as enum (
  'scheduled', 'settled', 'due', 'pro_rata_review', 'refunded', 'waived'
);
create type public.rate_change_status as enum (
  'draft', 'awaiting_approval', 'scheduled', 'current', 'archived'
);

alter type public.approval_kind add value if not exists 'featured_rate_card';
alter type public.approval_kind add value if not exists 'featured_refund';
alter type public.approval_kind add value if not exists 'featured_eligibility_override';

alter type public.notification_kind add value if not exists 'featured_request_received';
alter type public.notification_kind add value if not exists 'featured_waitlisted';
alter type public.notification_kind add value if not exists 'featured_eligible_soon';
alter type public.notification_kind add value if not exists 'featured_quote';
alter type public.notification_kind add value if not exists 'featured_quote_expiring_6h';
alter type public.notification_kind add value if not exists 'featured_quote_expired';
alter type public.notification_kind add value if not exists 'featured_waitlist_offer';
alter type public.notification_kind add value if not exists 'featured_booked';
alter type public.notification_kind add value if not exists 'featured_creative_approved';
alter type public.notification_kind add value if not exists 'featured_creative_rejected';
alter type public.notification_kind add value if not exists 'featured_live';
alter type public.notification_kind add value if not exists 'featured_renews_monday';
alter type public.notification_kind add value if not exists 'featured_renewal_cancelled';
alter type public.notification_kind add value if not exists 'featured_auto_paused';
alter type public.notification_kind add value if not exists 'featured_restored';
alter type public.notification_kind add value if not exists 'featured_ended';
alter type public.notification_kind add value if not exists 'featured_declined';
alter type public.notification_kind add value if not exists 'featured_monday_report';
alter type public.notification_kind add value if not exists 'featured_fee_settled';
alter type public.notification_kind add value if not exists 'featured_refund_issued';
alter type public.notification_kind add value if not exists 'featured_rate_card_changing';

-- ═══════════════════════════════════════════════ inventory

create table public.featured_placement (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.city (id) on delete cascade,
  kind public.placement_kind not null,
  category public.merchant_category,
  position integer not null check (position > 0),
  label text not null,
  description text,
  enabled boolean not null default true,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),

  /* A category belongs to category_top and to nothing else. */
  constraint placement_category_matches_kind check (
    (kind = 'category_top') = (category is not null)
  )
);

/* nulls not distinct, so two homepage slot 1s collide properly —
   with the default, every null category would be its own row. */
create unique index featured_placement_unique
  on public.featured_placement (city_id, kind, category, position) nulls not distinct;

comment on table public.featured_placement is
  'The inventory. Reducing the count never evicts a live slot — the extra position simply closes when its booking ends.';

create table public.featured_rate_card (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.city (id) on delete cascade,
  version text not null,
  status public.rate_change_status not null default 'draft',
  /* Always a Monday: a featured week runs Monday 00:00 to Friday 23:59. */
  effective_from date not null,
  /* {homepage, category_top: {default, overrides}, popular_request},
     weekly and ex-VAT. Null entries block quoting for that placement. */
  prices jsonb not null default '{}'::jsonb,
  vat_pct numeric(5, 2),
  min_weeks integer not null default 1,
  max_weeks integer not null default 8,
  hold_hours integer not null default 48,
  quote_hours integer not null default 48,
  auto_renew_default boolean not null default true,
  approved_by uuid references public.staff_user (id) on delete set null,
  second_approver_id uuid references public.staff_user (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),

  unique (city_id, version),
  constraint rate_card_starts_on_a_monday check (extract(isodow from effective_from) = 1)
);

create unique index featured_rate_card_one_current on public.featured_rate_card (city_id)
  where status = 'current';

comment on column public.featured_rate_card.vat_pct is
  'Null until a tax advisor confirms it. Nothing here guesses a VAT rate on an invoice.';

-- ═══════════════════════════════════════════════ bookings

create table public.featured_booking (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  branch_id uuid references public.merchant_branch (id) on delete set null,
  /* Null while the request is for a kind rather than a given slot. */
  placement_id uuid references public.featured_placement (id) on delete set null,
  placement_kind public.placement_kind not null,
  category public.merchant_category,
  city_id uuid references public.city (id) on delete set null,

  status public.booking_status not null default 'requested',
  requested_via text not null default 'dashboard'
    check (requested_via in ('dashboard', 'public_form', 'staff')),
  requested_at timestamptz not null default now(),
  requested_by uuid references auth.users (id) on delete set null,
  wanted_start date,
  weeks integer not null default 1 check (weeks between 1 and 52),
  auto_renew boolean not null default true,

  /* The last nightly result, with a human reason per failing check. */
  eligibility jsonb not null default '{}'::jsonb,
  waitlist_rank integer,

  hold_expires_at timestamptz,
  quote_expires_at timestamptz,
  /* Ex-VAT, frozen from the rate card at quote time — a rate change
     after a quote does not change what was quoted. */
  quoted_price bigint,
  quoted_rate_card_id uuid references public.featured_rate_card (id) on delete set null,
  discount_pct numeric(5, 2),
  discount_reason text,
  discount_approved_by uuid references public.staff_user (id) on delete set null,

  start_date date,
  end_date date,
  renews_at date,
  booked_by uuid references public.staff_user (id) on delete set null,
  confirmed_at timestamptz,

  paused_at timestamptz,
  pause_reason text,
  pause_source text check (pause_source in ('system', 'staff', 'merchant')),
  ended_at timestamptz,
  end_reason text,
  declined_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint booking_decline_has_a_reason check (
    status <> 'declined' or coalesce(trim(declined_reason), '') <> ''
  ),
  constraint booking_quote_has_a_price check (
    status not in ('quoted', 'booked', 'live') or quoted_price is not null
  )
);

/*
 * "Not already holding this placement" — one live or booked slot per
 * merchant per kind per category. Enforced here so the check cannot be
 * bypassed by two staff booking at once.
 */
create unique index featured_one_per_placement on public.featured_booking
  (merchant_id, placement_kind, category, city_id) nulls not distinct
  where status in ('booked', 'live');

create index featured_booking_open_idx on public.featured_booking (status, requested_at)
  where status in ('requested', 'waitlisted', 'quoted');
create index featured_booking_merchant_idx on public.featured_booking (merchant_id, status);

comment on constraint booking_quote_has_a_price on public.featured_booking is
  'A quoted, booked or live slot carries the price it was sold at. Staff never type one — it comes from the rate card.';

/*
 * The schedule, materialised. The Schedule tab and the public
 * placement query read this and never recompute from bookings on the
 * fly, because the homepage cannot afford to.
 */
create table public.featured_slot_week (
  placement_id uuid not null references public.featured_placement (id) on delete cascade,
  week_start date not null,
  booking_id uuid references public.featured_booking (id) on delete set null,
  status public.slot_status not null default 'open',
  price bigint,
  generated_at timestamptz not null default now(),
  primary key (placement_id, week_start),

  constraint slot_week_starts_on_a_monday check (extract(isodow from week_start) = 1),
  /* Anything but open names the booking that holds it. */
  constraint slot_week_taken_is_attributed check (
    status = 'open' or status = 'ended' or booking_id is not null
  )
);

create index featured_slot_week_idx on public.featured_slot_week (week_start, status);

create table public.featured_creative (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.featured_booking (id) on delete cascade,
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  cover_photo_path text,
  /* The merchant's own name, never editable — a paid card may not
     pretend to be a different business. */
  headline text,
  blurb text check (blurb is null or length(blurb) <= 60),
  pinned_item_id uuid references public.catalogue_item (id) on delete set null,
  status public.creative_status not null default 'draft',
  reviewed_by uuid references public.staff_user (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint creative_rejection_has_a_reason check (
    status <> 'rejected' or coalesce(trim(rejection_reason), '') <> ''
  )
);

/* One live creative per booking; a pending change keeps the approved
   one on screen until it is reviewed. */
create unique index featured_creative_one_approved on public.featured_creative (booking_id)
  where status = 'approved';

create index featured_creative_pending on public.featured_creative (status, created_at)
  where status = 'pending_review';

-- ══════════════════════════════════════ events and rollups

/*
 * Append-only. Not partitioned yet: at this volume a monthly partition
 * is machinery with nothing in it, and the index is on `at` so adding
 * partitions later is a migration rather than a rewrite.
 */
create table public.featured_event (
  id bigserial primary key,
  booking_id uuid not null references public.featured_booking (id) on delete cascade,
  placement_id uuid references public.featured_placement (id) on delete set null,
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  kind public.featured_event_kind not null,
  surface text not null check (surface in ('home', 'explore', 'popular')),
  session_hash text not null,
  guest_id uuid references public.guest (id) on delete set null,
  order_reference text,
  at timestamptz not null default now(),
  /*
   * The hour this landed in, pinned to UTC and stored.
   * date_trunc on a timestamptz is only STABLE — it reads the session
   * timezone — so it cannot be indexed. Fixing the zone makes it
   * immutable, and the bucket is for de-duplication rather than for
   * reporting, so which zone it uses does not matter as long as it is
   * always the same one.
   */
  view_hour timestamp generated always as
    (date_trunc('hour', at at time zone 'UTC')) stored
);

/* One view per session per slot per hour: a guest scrolling past the
   same card four times is one impression, not four. */
create unique index featured_view_dedupe on public.featured_event
  (booking_id, session_hash, view_hour)
  where kind = 'view';

create index featured_event_rollup_idx on public.featured_event (booking_id, at);
create index featured_event_session_idx on public.featured_event (session_hash, kind, at desc);

create table public.featured_metrics_daily (
  booking_id uuid not null references public.featured_booking (id) on delete cascade,
  placement_id uuid references public.featured_placement (id) on delete set null,
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  day date not null,
  views integer not null default 0,
  taps integer not null default 0,
  orders integer not null default 0,
  order_value bigint not null default 0,
  ctr numeric(6, 4),
  conversion numeric(6, 4),
  refreshed_at timestamptz not null default now(),
  primary key (booking_id, day)
);

comment on table public.featured_metrics_daily is
  'The single source for every merchant-facing number. The console''s Performance tab and the Monday report both read this, so they cannot disagree.';

-- ═══════════════════════════════════════════════ billing

create table public.featured_fee_line (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.featured_booking (id) on delete cascade,
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  week_start date not null,
  placement_label text not null,
  fee_ex_vat bigint not null,
  vat bigint,
  fee_total bigint,
  days_live integer not null default 7 check (days_live between 0 and 7),
  pro_rata boolean not null default false,
  status public.fee_line_status not null default 'scheduled',
  statement_id uuid references public.merchant_statement (id) on delete set null,
  refund_amount bigint,
  refund_reason text,
  refund_approved_by uuid references public.staff_user (id) on delete set null,
  refund_second_approver_id uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),

  unique (booking_id, week_start),
  /* Two different people, or it is one person approving themselves. */
  constraint refund_needs_two_people check (
    refund_approved_by is null
    or refund_second_approver_id is null
    or refund_approved_by <> refund_second_approver_id
  )
);

create index featured_fee_line_idx on public.featured_fee_line (merchant_id, week_start desc);
create index featured_fee_due_idx on public.featured_fee_line (status, week_start)
  where status in ('scheduled', 'pro_rata_review');

create table public.featured_eligibility_run (
  id bigserial primary key,
  booking_id uuid not null references public.featured_booking (id) on delete cascade,
  ran_at timestamptz not null default now(),
  result jsonb not null,
  passed boolean not null,
  action text not null default 'none'
    check (action in ('none', 'auto_paused', 'waitlist_dropped', 'restored', 'flagged'))
);

create index featured_eligibility_run_idx on public.featured_eligibility_run (booking_id, ran_at desc);

create table public.featured_report (
  booking_id uuid not null references public.featured_booking (id) on delete cascade,
  week_start date not null,
  payload jsonb not null,
  sent_at timestamptz,
  primary key (booking_id, week_start)
);

-- ═══════════════════════════════════════════════ the rules

create table public.featured_rule (
  key text primary key,
  value jsonb not null,
  label text not null,
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.featured_rule (key, value, label) values
  ('eligibility.live_days', '30', 'Live on NexG for at least N days'),
  ('eligibility.health_green_days', '30', 'Health green for N consecutive days'),
  ('eligibility.require_settlement_verified', 'true', 'Settlement account verified'),
  ('hold_hours', '48', 'A held slot is released after N hours'),
  ('quote_hours', '48', 'A quote expires after N hours'),
  ('auto_pause_on_health', 'true', 'Health below green pauses the slot at next 00:00'),
  ('auto_pause_credit', '"pro_rata"', 'Unused days are credited pro-rata'),
  ('creative.max_blurb_chars', '60', 'Blurb length'),
  ('creative.banned_terms',
   '["best","#1","number one","cheapest","guaranteed","free delivery","unbeatable"]',
   'Terms a paid card may not use'),
  ('attribution_window_minutes', '30', 'An order counts if placed within N minutes of a tap'),
  ('report.day', '"monday"', 'Weekly report day'),
  ('report.hour', '"08:00"', 'Weekly report hour'),
  ('waitlist.max_per_merchant', '2', 'Open requests a merchant may hold'),
  ('max_weeks', '8', 'Longest booking'),
  ('cancel_renewal_by', '"friday_23:59"', 'Cancel an auto-renewal by')
on conflict (key) do nothing;

comment on table public.featured_rule is
  'The rules Growth can change without a deploy. Every one of them is read at decision time, not baked into a function.';

-- ═══════════════════════════════ inventory, per live city

/*
 * Four homepage slots, one per category, three popular. A city that is
 * not live gets nothing — a slot in a city NexG does not deliver to is
 * something a merchant could be sold.
 */
insert into public.featured_placement (city_id, kind, category, position, label, description)
select c.id, 'homepage', null, p.n,
       'Homepage spot · Slot ' || p.n,
       'Featured Merchants band · every guest who opens NexG in ' || c.name
from public.city c, generate_series(1, 4) as p(n)
where c.status = 'live'
on conflict do nothing;

insert into public.featured_placement (city_id, kind, category, position, label, description)
select c.id, 'category_top', cat.v, 1,
       'Category top · ' || initcap(replace(cat.v::text, '_', ' ')),
       'First result in Explore for that category · 1 per category per city'
from public.city c
cross join (select unnest(enum_range(null::public.merchant_category)) as v) cat
where c.status = 'live'
on conflict do nothing;

insert into public.featured_placement (city_id, kind, category, position, label, description)
select c.id, 'popular_request', null, p.n,
       'Popular request · Slot ' || p.n,
       'Best-seller pinned in the Popular Requests strip'
from public.city c, generate_series(1, 3) as p(n)
where c.status = 'live'
on conflict do nothing;

/*
 * A draft rate card per live city with every price null. Quoting is
 * blocked until finance fills it in, which is the point: a price this
 * migration invented would be charged to a real merchant.
 */
insert into public.featured_rate_card (city_id, version, status, effective_from, prices)
select c.id, 'v1', 'draft',
       (date_trunc('week', now() + interval '7 days'))::date,
       jsonb_build_object(
         'homepage', null,
         'category_top', jsonb_build_object('default', null, 'overrides', '{}'::jsonb),
         'popular_request', null)
from public.city c
where c.status = 'live'
on conflict (city_id, version) do nothing;

update public.console_module set href = '/featured' where key = 'featured';

insert into public.role_module_access (role_key, module_key, level) values
  ('growth', 'featured', 'full'),
  ('finance', 'featured', 'full'),
  ('merchant_ops', 'featured', 'view'),
  ('super_admin', 'featured', 'full'),
  ('ops_manager', 'featured', 'view'),
  ('read_only', 'featured', 'view')
on conflict (role_key, module_key) do nothing;

create trigger featured_booking_set_updated_at before update on public.featured_booking
  for each row execute function public.tg_set_updated_at();
create trigger featured_creative_set_updated_at before update on public.featured_creative
  for each row execute function public.tg_set_updated_at();
