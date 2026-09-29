-- Customize Your Experience · the catalogue a day is built from.
--
-- A guest taps moods and a budget; the allocator assembles a day out of the
-- rows in this file. Nothing here is guest-authored — these are suppliers,
-- their bookable pieces, the fixed-price days we curate, and the events the
-- city is putting on.
--
-- Money is `bigint` in WHOLE SHILLINGS, not cents. The build prompt says
-- cents, but catalogue_item.price_kes is already whole shillings and two
-- money units in one database is how a price ends up a hundred times wrong.
-- bigint rather than integer because a Coast weekend for six is not an
-- integer number of shillings away from overflow territory once it is
-- summed across a plan.

-- ─────────────────────────────────────────────────────────────── enums

create type public.mood as enum ('wild', 'taste', 'night', 'slow', 'stay', 'events');

create type public.block_kind as enum (
  'activity', 'meal', 'venue', 'transport', 'stay', 'event', 'free'
);

create type public.block_slot as enum (
  'early', 'morning', 'midday', 'afternoon', 'evening', 'night', 'late'
);

create type public.event_status as enum ('draft', 'published', 'sold_out', 'cancelled', 'ended');

create type public.event_category as enum (
  'sport', 'music', 'food_drink', 'culture', 'family', 'nightlife', 'other'
);

create type public.price_basis as enum (
  'per_person', 'per_group', 'per_vehicle', 'per_night', 'face_value'
);

create type public.experience_partner_kind as enum (
  'operator', 'driver', 'venue', 'organiser', 'host', 'merchant_link'
);

/* The document framework already knows riders and merchants. */
alter type public.document_owner_type add value if not exists 'experience_partner';

-- ──────────────────────────────────────────────────────── partners

/*
 * A supplier who is not a delivery merchant: a tour operator, a driver
 * company, a spa, a venue, an organiser, a host letting a room as a stay.
 *
 * `partner_status` is reused rather than reinvented. A partner is public
 * only at `live`, and `live` is reached through the same document gate
 * merchants and riders go through — that is ground rule 5, and the reason
 * this table carries no `is_public` column for anyone to flip by hand.
 */
create table public.experience_partner (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.experience_partner_kind not null,
  /* Set when the partner is also a delivery merchant, so one business is
     not two unrelated rows with the same phone number. */
  merchant_id uuid references public.merchant (id) on delete set null,
  contact_name text,
  contact_phone text,
  contact_email text,
  city_id uuid not null references public.city (id) on delete restrict,
  status public.partner_status not null default 'applied',

  /* {cancellation_hours, deposit_pct, capacity_note} — the partner's own
     terms, quoted back to the concierge when a hold is requested. */
  terms jsonb not null default '{}'::jsonb,
  settlement_account jsonb,

  /* Portal access is opt-in per partner: most will answer a hold on
     WhatsApp and never sign in. */
  portal_user_id uuid references auth.users (id) on delete set null,
  can_answer_holds boolean not null default false,
  preferred_channel text not null default 'whatsapp'
    check (preferred_channel in ('whatsapp', 'phone', 'email', 'portal')),
  /* Computed nightly from partner_hold. Null until there is anything to
     average — never zero, which would read as "instant". */
  response_time_median_min integer,

  went_live_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint experience_partner_name_not_blank check (length(trim(name)) > 0),
  constraint experience_partner_reachable check (
    coalesce(trim(contact_phone), '') <> '' or coalesce(trim(contact_email), '') <> ''
  ),
  constraint experience_partner_live_is_timed check (
    status <> 'live' or went_live_at is not null
  )
);

create index experience_partner_city_idx on public.experience_partner (city_id, status);
create unique index experience_partner_portal_user
  on public.experience_partner (portal_user_id) where portal_user_id is not null;

create trigger experience_partner_set_updated_at
  before update on public.experience_partner
  for each row execute function public.tg_set_updated_at();

comment on table public.experience_partner is
  'A supplier of experience components: operator, driver, venue, organiser or host. Public only at status = live, through the shared document gate.';

-- ──────────────────────────────────────────────── the building blocks

/*
 * One bookable piece of a day.
 *
 * `swap_group` is the spine of the whole feature. Components in a group are
 * alternatives for the same slot — `morning_wild` holds the national park
 * drive, the giraffe centre and Karura — and `tier` ranks them 1 (cheapest)
 * to 5. The allocator picks a tier to fit the budget; the guest's "Swap:"
 * line is the neighbouring tiers in the same group. Without the group there
 * is no swap and no budget fitting, only a list.
 */
create table public.experience_component (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.experience_partner (id) on delete restrict,
  city_id uuid not null references public.city (id) on delete restrict,
  zone_id uuid references public.zone (id) on delete set null,

  kind public.block_kind not null,
  mood public.mood not null,
  title text not null,
  subtitle text,
  description text,
  location extensions.geography(Point, 4326),

  duration_min integer not null check (duration_min > 0 and duration_min <= 4320),
  default_slot public.block_slot not null,
  earliest_start time,
  latest_start time,

  price_kes bigint check (price_kes is null or price_kes > 0),
  price_basis public.price_basis not null default 'per_person',
  min_party integer not null default 1 check (min_party >= 1),
  max_party integer check (max_party is null or max_party >= min_party),
  party_types text[] not null default array['solo', 'couple', 'family', 'group'],

  includes text[] not null default '{}',
  /* [{label, amount, note}] — KWS gate fees and the like. Shown to the
     guest as a separate line and never added to what NexG charges. */
  pay_on_day jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  cover_path text,

  tier integer not null default 3 check (tier between 1 and 5),
  swap_group text not null,
  status text not null default 'draft' check (status in ('draft', 'live', 'paused')),
  booking_lead_hours integer not null default 0 check (booking_lead_hours >= 0),
  capacity_per_day integer check (capacity_per_day is null or capacity_per_day > 0),
  sort integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint experience_component_title_not_blank check (length(trim(title)) > 0),
  constraint experience_component_swap_group_not_blank check (length(trim(swap_group)) > 0),
  /*
   * A draft may have no price — that is what draft is for, and it renders
   * [—]. A live one may not: the allocator would put it in a day and the
   * budget bar would silently under-count. `face_value` is the exception,
   * because an event ticket's price comes from the event, not from us.
   */
  constraint experience_component_live_has_a_price check (
    status <> 'live' or price_kes is not null or price_basis = 'face_value'
  ),
  constraint experience_component_window_is_ordered check (
    earliest_start is null or latest_start is null or earliest_start <= latest_start
  )
);

/* The allocator's read path: city + mood + group, then cheapest-fitting tier. */
create index experience_component_allocator_idx
  on public.experience_component (city_id, mood, swap_group, tier)
  where status = 'live';

create index experience_component_partner_idx on public.experience_component (partner_id, status);
create index experience_component_location_idx
  on public.experience_component using gist (location);

create trigger experience_component_set_updated_at
  before update on public.experience_component
  for each row execute function public.tg_set_updated_at();

comment on table public.experience_component is
  'One bookable piece of a day. Components sharing a swap_group are alternatives for the same slot, ranked by tier 1-5; that pairing is what lets the allocator fit a budget and the guest swap up or down.';

comment on column public.experience_component.pay_on_day is
  'Costs the guest settles on the day at face value — park gate fees and the like. Listed separately from the quote and never marked up.';

/*
 * Per-date overrides. An absent row means the component's defaults apply,
 * which is why this is a sparse table rather than a column on a calendar:
 * most components are the same every day and storing that would be 365 rows
 * of nothing per component per year.
 */
create table public.component_availability (
  component_id uuid not null references public.experience_component (id) on delete cascade,
  date date not null,
  available boolean not null default true,
  capacity_override integer check (capacity_override is null or capacity_override >= 0),
  price_override_kes bigint check (price_override_kes is null or price_override_kes > 0),
  note text,
  primary key (component_id, date)
);

comment on table public.component_availability is
  'Sparse per-date overrides. No row means the component defaults apply.';

-- ─────────────────────────────────────────────────────── curated days

create table public.curated_day (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.city (id) on delete restrict,
  slug text not null,
  title text not null,
  tagline text,
  cover_path text,
  badge text,
  party_types text[] not null default array['solo', 'couple', 'family', 'group'],
  duration text not null default 'day' check (duration in ('evening', 'day', 'weekend')),
  price_per_person_kes bigint check (price_per_person_kes is null or price_per_person_kes > 0),
  status text not null default 'draft' check (status in ('draft', 'live', 'paused')),
  sort integer not null default 0,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint curated_day_live_has_a_price check (
    status <> 'live' or price_per_person_kes is not null
  )
);

create unique index curated_day_slug_per_city on public.curated_day (city_id, slug);

create trigger curated_day_set_updated_at
  before update on public.curated_day
  for each row execute function public.tg_set_updated_at();

create table public.curated_day_block (
  id uuid primary key default gen_random_uuid(),
  curated_day_id uuid not null references public.curated_day (id) on delete cascade,
  component_id uuid not null references public.experience_component (id) on delete restrict,
  slot public.block_slot not null,
  start_time time,
  sort integer not null default 0
);

create index curated_day_block_day_idx on public.curated_day_block (curated_day_id, sort);

comment on table public.curated_day is
  'A fixed-price day we have put together. Publishing requires every block component live and priced — see rpc_publish_curated_day.';

-- ──────────────────────────────────────────────────────────── events

/*
 * What the city is putting on. The dynamic half of the catalogue: an event
 * anchors a slot and the allocator builds the rest of the day around it.
 *
 * NexG does not sell tickets. `ticket_bands` is always the organiser's face
 * value, and we charge for the day around the ticket, never a margin on it.
 */
create table public.event (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.city (id) on delete restrict,
  name text not null,
  category public.event_category not null default 'other',

  venue_name text,
  venue_point extensions.geography(Point, 4326),
  venue_address text,

  starts_at timestamptz not null,
  ends_at timestamptz,
  doors_at timestamptz,

  organiser_name text,
  organiser_url text,
  ticket_url text,
  ticket_partner_id uuid references public.experience_partner (id) on delete set null,
  /* [{label, price_kes, currency}] — face value as the organiser sells it. */
  ticket_bands jsonb not null default '[]'::jsonb,
  nexg_can_hold_tickets boolean not null default false,

  practical_note text,
  cover_path text,
  status public.event_status not null default 'draft',
  featured boolean not null default false,

  /* Which part of the day this pins. Everything else moves around it. */
  anchor_slot public.block_slot not null default 'evening',
  /* [{kind, mood, slot, title, swap_group}] — what a day around this
     usually wants, offered as chips in the builder. */
  suggested_blocks jsonb not null default '[]'::jsonb,

  source text not null default 'manual' check (source in ('manual', 'partner', 'feed')),
  source_ref text,
  submitted_by_partner_id uuid references public.experience_partner (id) on delete set null,
  submission_note text,
  rejected_reason text,
  reviewed_by uuid references public.staff_user (id) on delete set null,
  published_by uuid references public.staff_user (id) on delete set null,
  published_at timestamptz,

  /*
   * The local calendar day the event falls on, for deduping a feed that
   * sends the same festival twice. Generated rather than indexed directly
   * because `starts_at::date` reads the session TimeZone and so cannot be
   * indexed; every city NexG serves is UTC+3, so the zone is a literal.
   */
  starts_on date generated always as
    (((starts_at at time zone 'Africa/Nairobi'))::date) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_name_not_blank check (length(trim(name)) > 0),
  constraint event_is_ordered check (ends_at is null or ends_at >= starts_at),
  constraint event_doors_before_start check (doors_at is null or doors_at <= starts_at),
  constraint event_published_is_attributed check (
    status <> 'published' or (published_at is not null and published_by is not null)
  ),
  constraint event_holding_needs_a_holder check (
    not nexg_can_hold_tickets or ticket_partner_id is not null
  )
);

/* Dedupe: the same festival pulled from a feed twice is one row. */
create unique index event_dedupe
  on public.event (city_id, lower(name), starts_on);

create index event_public_idx on public.event (city_id, starts_at)
  where status = 'published';
create index event_inbox_idx on public.event (status, created_at)
  where status = 'draft';

create trigger event_set_updated_at
  before update on public.event
  for each row execute function public.tg_set_updated_at();

comment on table public.event is
  'An event in the city. NexG never marks up a ticket: ticket_bands is the organiser''s face value and we charge for the day built around it.';

/*
 * Explicit, partner-provided sources only. Nothing scrapes a public site,
 * and nothing a feed produces is ever published without a person — see
 * rpc_run_feed, which writes drafts and only drafts.
 */
create table public.event_feed (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('ics', 'json', 'csv', 'api')),
  url text not null,
  auth jsonb,
  city_id uuid not null references public.city (id) on delete cascade,
  enabled boolean not null default false,
  last_run_at timestamptz,
  last_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger event_feed_set_updated_at
  before update on public.event_feed
  for each row execute function public.tg_set_updated_at();

comment on table public.event_feed is
  'A partner-provided event source. Feeds create drafts only; publishing is always a person.';

-- ───────────────────────────────────────────────────── public views
--
-- `anon` never reads the base tables. These three views are the whole of
-- what the outside world can see, and each one restates the visibility rule
-- rather than trusting a status column read somewhere else.

create view public.event_public
with (security_invoker = true)
as
select
  e.id, e.city_id, e.name, e.category, e.venue_name, e.venue_address,
  e.starts_at, e.ends_at, e.doors_at, e.organiser_name, e.organiser_url,
  e.ticket_url, e.ticket_bands, e.nexg_can_hold_tickets, e.practical_note,
  e.cover_path, e.featured, e.anchor_slot, e.suggested_blocks
from public.event e
join public.city c on c.id = e.city_id
where e.status = 'published'
  and e.starts_at > now()
  and c.status in ('live', 'soft_launch');

create view public.curated_day_public
with (security_invoker = true)
as
select
  d.id, d.city_id, d.slug, d.title, d.tagline, d.cover_path, d.badge,
  d.party_types, d.duration, d.price_per_person_kes, d.featured, d.sort
from public.curated_day d
join public.city c on c.id = d.city_id
where d.status = 'live'
  and c.status in ('live', 'soft_launch');

create view public.component_public
with (security_invoker = true)
as
select
  k.id, k.city_id, k.zone_id, k.kind, k.mood, k.title, k.subtitle,
  k.description, k.duration_min, k.default_slot, k.earliest_start,
  k.latest_start, k.price_kes, k.price_basis, k.min_party, k.max_party,
  k.party_types, k.includes, k.pay_on_day, k.tags, k.cover_path,
  k.tier, k.swap_group, k.booking_lead_hours, k.sort
from public.experience_component k
join public.experience_partner p on p.id = k.partner_id
join public.city c on c.id = k.city_id
where k.status = 'live'
  and p.status = 'live'
  and (k.price_kes is not null or k.price_basis = 'face_value')
  and c.status in ('live', 'soft_launch');

comment on view public.component_public is
  'The only components the outside world sees: live, priced, from a live partner, in a city that has opened. Partner identity is deliberately absent.';

-- ───────────────────────────────────────────────────────────── RLS

alter table public.experience_partner enable row level security;
alter table public.experience_component enable row level security;
alter table public.component_availability enable row level security;
alter table public.curated_day enable row level security;
alter table public.curated_day_block enable row level security;
alter table public.event enable row level security;
alter table public.event_feed enable row level security;

/*
 * Catalogue editing is `growth`; publishing a partner is `ops_manager`;
 * concierge agents read it because they quote from it. Written against
 * authz.reaches_module('experiences') where the rule is "can this person
 * see the module at all", and against named roles where the rule is "who
 * may change this" — the two are different questions and conflating them
 * is how a read-only role ends up writing.
 */
create policy experience_partner_read_staff on public.experience_partner
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('experiences'));

create policy experience_partner_write_growth on public.experience_partner
  for all to authenticated
  using (authz.is_super_admin() or authz.has_role('growth') or authz.has_role('ops_manager'))
  with check (authz.is_super_admin() or authz.has_role('growth') or authz.has_role('ops_manager'));

/* A partner may see its own row through the portal, and nothing else. */
create policy experience_partner_read_self on public.experience_partner
  for select to authenticated
  using (portal_user_id = (select auth.uid()));

create policy experience_component_read_staff on public.experience_component
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('experiences'));

create policy experience_component_write_growth on public.experience_component
  for all to authenticated
  using (authz.is_super_admin() or authz.has_role('growth'))
  with check (authz.is_super_admin() or authz.has_role('growth'));

create policy component_availability_read_staff on public.component_availability
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('experiences'));

create policy component_availability_write_growth on public.component_availability
  for all to authenticated
  using (authz.is_super_admin() or authz.has_role('growth'))
  with check (authz.is_super_admin() or authz.has_role('growth'));

create policy curated_day_read_staff on public.curated_day
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('experiences'));

create policy curated_day_write_growth on public.curated_day
  for all to authenticated
  using (authz.is_super_admin() or authz.has_role('growth'))
  with check (authz.is_super_admin() or authz.has_role('growth'));

create policy curated_day_block_read_staff on public.curated_day_block
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('experiences'));

create policy curated_day_block_write_growth on public.curated_day_block
  for all to authenticated
  using (authz.is_super_admin() or authz.has_role('growth'))
  with check (authz.is_super_admin() or authz.has_role('growth'));

create policy event_read_staff on public.event
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('experiences'));

create policy event_write_growth on public.event
  for all to authenticated
  using (authz.is_super_admin() or authz.has_role('growth'))
  with check (authz.is_super_admin() or authz.has_role('growth'));

/*
 * A partner may submit an event for itself, as a draft, and read what it
 * submitted. It may not publish, and it may not touch anyone else's.
 */
create policy event_submit_partner on public.event
  for insert to authenticated
  with check (
    status = 'draft'
    and source = 'partner'
    and submitted_by_partner_id in (
      select id from public.experience_partner
      where portal_user_id = (select auth.uid()) and status = 'live'
    )
  );

create policy event_read_own_partner on public.event
  for select to authenticated
  using (
    submitted_by_partner_id in (
      select id from public.experience_partner where portal_user_id = (select auth.uid())
    )
  );

/* Feed credentials are in `auth`. Super admin only, deliberately. */
create policy event_feed_super_admin on public.event_feed
  for all to authenticated
  using (authz.is_super_admin()) with check (authz.is_super_admin());

grant select on public.event_public, public.curated_day_public, public.component_public
  to anon, authenticated;
