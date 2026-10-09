-- The host portal's modules.
--
-- The portal had a home in two states and five sections with
-- real data behind them. This is the rest: three tables that
-- did not exist, and the views the module pages read.
--
-- Three new tables, and each earns its place:
--
--   stay          a guest in a unit between two dates. Without
--                 it an order cannot be attributed to a person,
--                 only to a room, and the whole QR story stops
--                 at the door.
--   host_request  what a guest asked for and what went wrong,
--                 with a priority and a clock. Currently these
--                 live in conversations, which is fine for
--                 talking and useless for "what is overdue".
--   host_referral who a host brought in and what it earned
--                 them.
--
-- Everything else reads tables that already exist.

-- ═══════════════════════════════════════════════════ stays

create table if not exists stay (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references host (id) on delete cascade,
  property_id uuid references property (id) on delete set null,
  unit_id uuid references unit (id) on delete set null,

  /*
   * First name only, and that is a schema decision rather than
   * a UI one. A calendar sync will happily hand over a full
   * name, an email and a phone; if the column exists somebody
   * will fill it, and a host does not need a guest's surname to
   * have a bag delivered to their door.
   */
  guest_first_name text,
  party_adults integer not null default 1,
  party_children integer not null default 0,

  check_in timestamptz not null,
  check_out timestamptz not null,
  check (check_out > check_in),

  source text not null default 'entered'
    check (source in ('entered', 'airbnb', 'booking_com', 'ical', 'pms', 'walk_in')),
  /* A hash, never the provider's reference itself — those can
     carry a booking code somebody could look up. */
  external_ref_hash text,

  /*
   * Optional, used once, to send the QR link before arrival.
   * Masked everywhere it is shown. The host entered it; NexG
   * does not import one from a calendar.
   */
  phone text,
  qr_link_sent_at timestamptz,

  /* The host's own rate, for their records. NexG never bills
     on it and the portal labels it so. */
  rate_kes numeric(12, 2),

  status text not null default 'booked'
    check (status in ('booked', 'in_stay', 'departed', 'cancelled')),
  conflict_flagged boolean not null default false,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stay_by_host on stay (host_id, check_in);
create index if not exists stay_by_unit on stay (unit_id, check_in);

comment on table stay is
  'A guest in a unit between two dates. First name only by design: a calendar sync will hand over more, and a column that exists is a column somebody fills.';

alter table stay enable row level security;

drop policy if exists stay_host_read on stay;
create policy stay_host_read on stay
  for select to authenticated using (authz.is_host_member(host_id));

drop policy if exists stay_staff_read on stay;
create policy stay_staff_read on stay
  for select to authenticated using (authz.staff_id() is not null);

/*
 * What a guest said afterwards.
 *
 * Asked once through the QR landing on check-out morning, with
 * one reminder and never a third. A review request is a message
 * to somebody who is leaving; the second one is a nuisance and
 * the third costs you the review you were asking for.
 */
create table if not exists stay_review (
  stay_id uuid primary key references stay (id) on delete cascade,
  rating integer check (rating between 1 and 5),
  text text,
  themes text[],
  asked_at timestamptz,
  reminded_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

alter table stay_review enable row level security;

drop policy if exists stay_review_host_read on stay_review;
create policy stay_review_host_read on stay_review
  for select to authenticated
  using (exists (select 1 from stay s
                  where s.id = stay_review.stay_id and authz.is_host_member(s.host_id)));

-- ════════════════════════════════════════ requests & issues

create table if not exists host_request (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    default 'HR-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6)),

  host_id uuid not null references host (id) on delete cascade,
  property_id uuid references property (id) on delete set null,
  unit_id uuid references unit (id) on delete set null,
  stay_id uuid references stay (id) on delete set null,

  kind text not null check (kind in ('request', 'issue')),
  type text not null check (type in (
    'amenities', 'late_checkout', 'transport', 'access', 'cleaning',
    'recommendations', 'order', 'rider_conduct', 'other')),

  /*
   * Priority drives a clock, so it is a column rather than a
   * label. High is access and safety — somebody locked out of
   * a flat at night is not a two-hour problem.
   */
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),

  title text not null,
  detail text,
  raised_by text not null default 'guest' check (raised_by in ('guest', 'host', 'nexg')),

  /* Who it is waiting on. The design's whole left column is
     this field. */
  owner_kind text not null default 'nexg_concierge' check (owner_kind in (
    'nexg_concierge', 'host', 'nexg_support', 'nexg_rider_ops', 'auto')),
  owner_user_id uuid references auth.users (id) on delete set null,

  due_at timestamptz,
  status text not null default 'open' check (status in (
    'open', 'in_progress', 'waiting_on_host', 'waiting_on_guest',
    'quoted', 'resolved', 'closed')),

  conversation_id uuid references msg_conversation (id) on delete set null,
  linked_order_id uuid references "order" (id) on delete set null,

  resolved_at timestamptz,
  outcome text,
  satisfaction integer check (satisfaction between 1 and 5),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists host_request_by_host on host_request (host_id, status, due_at);

comment on table host_request is
  'What a guest asked for and what went wrong, with a priority and a clock. These live in conversations today, which is fine for talking and useless for answering "what is overdue".';

alter table host_request enable row level security;

drop policy if exists host_request_host_read on host_request;
create policy host_request_host_read on host_request
  for select to authenticated using (authz.is_host_member(host_id));

drop policy if exists host_request_staff_read on host_request;
create policy host_request_staff_read on host_request
  for select to authenticated using (authz.staff_id() is not null);

/*
 * The clock each priority runs to.
 *
 * A row per host so an owner can widen them within bounds, with
 * the defaults the design states. Stored rather than hard-coded
 * because "15 minutes" is a promise, and a promise somebody
 * cannot see is one they cannot hold you to.
 */
create table if not exists host_priority_rule (
  host_id uuid not null references host (id) on delete cascade,
  priority text not null check (priority in ('high', 'medium', 'low')),
  minutes integer not null check (minutes > 0),
  label text not null,
  primary key (host_id, priority)
);

alter table host_priority_rule enable row level security;

drop policy if exists host_priority_rule_read on host_priority_rule;
create policy host_priority_rule_read on host_priority_rule
  for select to authenticated using (authz.is_host_member(host_id));

-- ════════════════════════════════════════════════ referrals

create table if not exists host_referral (
  id uuid primary key default gen_random_uuid(),
  referrer_host_id uuid not null references host (id) on delete cascade,
  referred_host_id uuid references host (id) on delete set null,
  code text not null,

  /* Area and size only. A referrer has no business knowing who
     took their link until that person is live, and arguably not
     then — the table shows status, the view withholds names. */
  referred_area text,
  referred_units integer,

  created_at timestamptz not null default now(),
  live_at timestamptz,
  reward_amount_kes numeric(12, 2),
  reward_status text not null default 'pending'
    check (reward_status in ('pending', 'credited', 'paid', 'void')),
  void_reason text,
  statement_id uuid
);

create index if not exists host_referral_by_referrer on host_referral (referrer_host_id);

alter table host_referral enable row level security;

drop policy if exists host_referral_read on host_referral;
create policy host_referral_read on host_referral
  for select to authenticated using (authz.is_host_member(referrer_host_id));

-- ═══════════════════════════════════════════ what each reads

/* ── Bookings & Guests ─────────────────────────────────── */

/*
 * Definer, for the `orders` column and nothing else.
 *
 * Every other column here is readable by a host as themselves.
 * The order count is not — `order_read` has no host branch —
 * and as an invoker view it came back 0 beside a scan count of
 * 49, which reads as "they all looked and none of them bought".
 * The scope below is the whole protection, so it is on the
 * stay's own host and takes no argument from the caller.
 */
create or replace view host_stay_v
with (security_invoker = false) as
select
  s.id,
  s.host_id,
  s.unit_id,
  u.name as unit_name,
  p.name as property_name,
  s.guest_first_name,
  s.party_adults,
  s.party_children,
  s.check_in,
  s.check_out,
  s.source,
  s.status,
  s.conflict_flagged,
  s.rate_kes,
  s.qr_link_sent_at,
  /* Masked at the view, not the page. A phone that reaches a
     template un-masked is a phone in somebody's screenshot. */
  case
    when s.phone is null then null
    when length(s.phone) > 6
      then left(s.phone, 4) || repeat('•', greatest(0, length(s.phone) - 7))
           || right(s.phone, 2)
    else '•••'
  end as phone_masked,
  r.rating as stay_rating,
  r.text as stay_review,
  r.answered_at as reviewed_at,
  (select count(*) from public.qr_scan sc
    where sc.owner_id = s.unit_id
      and sc.scanned_at between s.check_in and s.check_out)::int as scans,
  (select count(*) from public.qr_scan sc
    join public."order" o on o.qr_scan_id = sc.id
   where sc.owner_id = s.unit_id
     and sc.scanned_at between s.check_in and s.check_out)::int as orders,
  (now() >= s.check_in and now() < s.check_out) as in_stay
from public.stay s
left join public.unit u on u.id = s.unit_id
left join public.property p on p.id = s.property_id
left join public.stay_review r on r.stay_id = s.id
where authz.is_host_member(s.host_id);

/* ── Requests & Issues ─────────────────────────────────── */

create or replace view host_request_v
with (security_invoker = true) as
select
  r.id,
  r.reference,
  r.host_id,
  r.unit_id,
  u.name as unit_name,
  s.guest_first_name,
  r.kind,
  r.type,
  r.priority,
  r.title,
  r.detail,
  r.raised_by,
  r.owner_kind,
  r.due_at,
  r.status,
  r.resolved_at,
  r.outcome,
  r.satisfaction,
  r.created_at,
  /*
   * Overdue, and by how long. Computed rather than stored: a
   * stored flag is only as current as the job that last set it,
   * and the whole point of a 15-minute promise is that it is
   * true right now.
   */
  r.due_at is not null and r.resolved_at is null and r.due_at < now() as overdue,
  case
    when r.resolved_at is not null then null
    when r.due_at is null then null
    else round(extract(epoch from (r.due_at - now())) / 60)
  end as minutes_left,
  case
    when r.resolved_at is not null
      then round(extract(epoch from (r.resolved_at - r.created_at)) / 60)
  end as resolved_in_minutes
from public.host_request r
left join public.unit u on u.id = r.unit_id
left join public.stay s on s.id = r.stay_id;

/* ── Deliveries ────────────────────────────────────────── */

/*
 * The one definer view in the host portal, and it is deliberate.
 *
 * A host cannot read `public.order`: the read policy there
 * covers the guest, the merchant, the rider and staff, and a
 * host is none of those. Built as an invoker view this returns
 * nothing — not an error, just an empty Deliveries page on a
 * host with sixty scans, which reads as "nobody has ordered".
 *
 * The obvious fix is to add a host branch to `order_read`. That
 * would also hand a host every other column on the row: the
 * guest id, the payment method and status, the rider, the
 * internal notes. None of that is theirs.
 *
 * So the projection is narrowed here and the scope is enforced
 * here, in the only place a host can reach it. `is_host_member`
 * is checked against the scan's host, not against anything the
 * caller passes, so there is no argument to get wrong. A host
 * who queries this view for another host's unit gets nothing.
 */
create or replace view host_delivery_v
with (security_invoker = false) as
select
  o.id as order_id,
  sc.host_id,
  sc.owner_id as unit_id,
  un.name as unit_name,
  o.reference,
  o.stage::text as stage,
  o.placed_at,
  o.delivered_at,
  o.eta_at,
  o.total_cents,
  m.trading_name as merchant_name,
  un.handoff::text as handoff,
  o.handoff_photo_path is not null as has_proof,
  o.handed_to,
  s.guest_first_name
from public."order" o
join public.qr_scan sc on sc.id = o.qr_scan_id
left join public.unit un on un.id = sc.owner_id
left join public.merchant m on m.id = o.merchant_id
left join public.stay s on s.unit_id = un.id
  and o.placed_at between s.check_in and s.check_out
where authz.is_host_member(sc.host_id);

/* ── Packages & Amenities ──────────────────────────────── */

create or replace view host_package_order_v
with (security_invoker = true) as
select
  po.id,
  po.host_id,
  po.unit_id,
  u.name as unit_name,
  wp.name as package_name,
  wp.description as package_description,
  wp.price as price_kes,
  wp.lead_hours,
  po.for_checkin_at,
  po.status::text as status,
  po.order_reference,
  po.photo_path is not null as has_photo,
  po.created_at
from public.package_order po
left join public.unit u on u.id = po.unit_id
left join public.welcome_package wp on wp.id = po.package_id;

create or replace view host_package_catalogue_v
with (security_invoker = true) as
select
  wp.id,
  wp.name,
  wp.description,
  wp.items,
  wp.price as price_kes,
  wp.lead_hours,
  wp.status::text as status,
  wp.city_id,
  wp.sort
from public.welcome_package wp
where wp.status::text = 'live';

/* ── Earnings & Invoices ───────────────────────────────── */

/* Definer for the same reason as the stay view: the order
   lateral is unreadable to a host, and an invoker view reports
   it as "no guest has ever ordered". */
create or replace view host_earnings_v
with (security_invoker = false) as
select
  h.id as host_id,
  coalesce(inv.invoices, 0) as invoices_count,
  coalesce(inv.outstanding_cents, 0) as outstanding_cents,
  coalesce(inv.paid_cents, 0) as paid_cents,
  coalesce(ref.rewards_pending, 0) as rewards_pending,
  coalesce(ref.rewards_credited_kes, 0) as rewards_credited_kes,
  coalesce(ord.order_value_cents, 0) as guest_order_value_cents,
  coalesce(ord.order_count, 0) as guest_order_count
from public.host h
left join lateral (
  select count(*) as invoices,
         sum(i.total) filter (where i.paid_at is null) as outstanding_cents,
         sum(i.total) filter (where i.paid_at is not null) as paid_cents
  from public.host_invoice i where i.host_id = h.id
) inv on true
left join lateral (
  select count(*) filter (where r.reward_status = 'pending') as rewards_pending,
         sum(r.reward_amount_kes) filter (where r.reward_status in ('credited', 'paid'))
           as rewards_credited_kes
  from public.host_referral r where r.referrer_host_id = h.id
) ref on true
left join lateral (
  select count(*) as order_count, sum(o.total_cents) as order_value_cents
  from public.qr_scan sc
  join public."order" o on o.qr_scan_id = sc.id
  where sc.host_id = h.id
) ord on true
where authz.is_host_member(h.id);

/* ── Refer a Host ──────────────────────────────────────── */

create or replace view host_referral_v
with (security_invoker = true) as
select
  r.id,
  r.referrer_host_id,
  r.code,
  /* Area and size only, until they are live — and the name is
     withheld even then. Somebody who took your link has not
     agreed to be listed to you. */
  r.referred_area,
  r.referred_units,
  r.created_at,
  r.live_at,
  r.reward_amount_kes,
  r.reward_status,
  case
    when r.live_at is not null then 'live'
    when r.referred_host_id is not null then 'setting up'
    else 'applied'
  end as stage
from public.host_referral r;

/* ── Guest Operations ──────────────────────────────────── */

create or replace view host_handoff_rule_v
with (security_invoker = true) as
select
  u.id as unit_id,
  u.host_id,
  u.name as unit_name,
  p.name as property_name,
  u.handoff::text as rule,
  u.handoff_note,
  u.caretaker_name,
  u.caretaker_confirmed_at,
  u.delivery_hours,
  u.status::text as unit_status,
  u.handoff is null as rule_missing
from public.unit u
left join public.property p on p.id = u.property_id
where u.archived_at is null;

/* ── Analytics ─────────────────────────────────────────── */

/*
 * The three analytics views are definer for the order join.
 *
 * A host can read their own `qr_scan` rows but not the orders
 * attached to them, so as invoker views these returned a scan
 * count with a flat zero beside it and a conversion rate of
 * nothing. That is not an empty page somebody would question —
 * it is a finding, and it is wrong.
 *
 * Each one is scoped on the scan's own host and nothing else.
 */
create or replace view host_analytics_daily_v
with (security_invoker = false) as
select
  sc.host_id,
  (sc.scanned_at at time zone 'Africa/Nairobi')::date as day,
  count(*)::int as scans,
  count(o.id)::int as orders,
  coalesce(sum(o.total_cents), 0)::bigint as order_value_cents
from public.qr_scan sc
left join public."order" o on o.qr_scan_id = sc.id
where not sc.is_bot and not sc.is_test
  and authz.is_host_member(sc.host_id)
group by 1, 2;

create or replace view host_analytics_hour_v
with (security_invoker = false) as
select
  sc.host_id,
  extract(hour from (sc.scanned_at at time zone 'Africa/Nairobi'))::int as hour,
  extract(isodow from (sc.scanned_at at time zone 'Africa/Nairobi'))::int as dow,
  count(*)::int as scans,
  count(o.id)::int as orders
from public.qr_scan sc
left join public."order" o on o.qr_scan_id = sc.id
where not sc.is_bot and not sc.is_test
  and authz.is_host_member(sc.host_id)
group by 1, 2, 3;

create or replace view host_analytics_unit_v
with (security_invoker = false) as
select
  sc.host_id,
  sc.owner_id as unit_id,
  u.name as unit_name,
  p.name as property_name,
  count(*)::int as scans,
  count(o.id)::int as orders,
  coalesce(sum(o.total_cents), 0)::bigint as order_value_cents,
  case when count(*) > 0
       then round(count(o.id)::numeric * 100 / count(*)) end as conversion_pct
from public.qr_scan sc
left join public."order" o on o.qr_scan_id = sc.id
left join public.unit u on u.id = sc.owner_id
left join public.property p on p.id = u.property_id
where not sc.is_bot and not sc.is_test
  and authz.is_host_member(sc.host_id)
group by 1, 2, 3, 4;

/* ── Data & Privacy ────────────────────────────────────── */

create or replace view host_data_request_v
with (security_invoker = true) as
select
  d.id,
  d.kind::text as kind,
  d.status::text as status,
  d.received_at,
  d.due_at,
  d.identity_verified_at is not null as verified,
  d.scope,
  d.fulfilled_at,
  d.due_at is not null and d.fulfilled_at is null and d.due_at < now() as overdue
from public.data_request d;

/* ── Support ───────────────────────────────────────────── */

create or replace view host_ticket_v
with (security_invoker = true) as
select
  t.id,
  t.reference,
  t.topic::text as topic,
  t.body,
  t.status::text as status,
  t.first_reply_at,
  t.resolved_at,
  t.created_at,
  t.source_form
from public.support_ticket t
where t.from_role::text = 'host';

grant select on
  stay, stay_review, host_request, host_priority_rule, host_referral,
  host_stay_v, host_request_v, host_delivery_v,
  host_package_order_v, host_package_catalogue_v,
  host_earnings_v, host_referral_v, host_handoff_rule_v,
  host_analytics_daily_v, host_analytics_hour_v, host_analytics_unit_v,
  host_data_request_v, host_ticket_v
to authenticated;

/* ── Messages ──────────────────────────────────────────── */

/*
 * A host's own threads.
 *
 * There is already a conversation model and a desk inbox, but
 * `msg_inbox_v` is built for an agent: it carries the assignee,
 * the owning team and the escalation path, none of which is a
 * host's business. Rather than teach a page to leave columns
 * out — a thing a page forgets the first time it is copied —
 * this view does not select them.
 *
 * Scoping is RLS, not a where clause. `msg_conversation` is
 * readable only through `authz.msg_can_read`, and a host
 * satisfies it only by holding a participant row against their
 * own auth user. A host who somehow queries this view for
 * another host's thread gets nothing, because the row was never
 * theirs to read.
 */
create or replace view host_conversation_v
with (security_invoker = true) as
select
  c.id,
  c.subject,
  c.topic,
  c.status,
  c.priority,
  c.created_at,
  c.last_message_at,
  c.first_responded_at,
  c.resolved_at,
  c.rating,
  l.label as about,
  l.object_type,
  /* Last thing said to the host, never an internal note. The
     internal ones are invisible to them at the policy anyway;
     excluding them here means the preview cannot read back a
     blank where a note was. */
  (select m.body from public.msg_message m
    where m.conversation_id = c.id
      and m.visibility = 'external'
      and m.kind <> 'system'
    order by m.seq desc limit 1) as last_message,
  (select m.created_at from public.msg_message m
    where m.conversation_id = c.id
      and m.visibility = 'external'
    order by m.seq desc limit 1) as last_external_at,
  /*
   * Unread against this host's own participant row. Counting
   * from a shared high-water mark would mark a thread read for
   * a host because an agent opened it.
   */
  (select count(*) from public.msg_message m
    join public.msg_participant p
      on p.conversation_id = c.id and p.user_id = (select auth.uid())
   where m.conversation_id = c.id
     and m.visibility = 'external'
     and m.seq > p.last_read_seq
     and m.kind <> 'system')::int as unread
from public.msg_conversation c
left join lateral (
  select ol.label, ol.object_type
    from public.msg_object_link ol
   where ol.conversation_id = c.id
   order by ol.is_primary desc nulls last
   limit 1
) l on true
where c.kind = 'external';

create or replace view host_message_v
with (security_invoker = true) as
select
  m.id,
  m.conversation_id,
  m.seq,
  m.body,
  m.channel_out::text as channel,
  m.created_at,
  m.redacted_at is not null as redacted,
  p.display_name as author,
  p.kind::text as author_kind,
  /* Whether the host wrote it. Derived from the participant
     rather than stored: a `direction` column is a second place
     for the same fact to be wrong, and this one cannot drift
     from who actually holds the participant row. */
  coalesce(p.user_id = (select auth.uid()), false) as mine
from public.msg_message m
left join public.msg_participant p on p.id = m.author_participant_id
where m.visibility = 'external'
  and m.kind <> 'system';

grant select on host_conversation_v, host_message_v to authenticated;

/*
 * Defence in depth on the five definer views.
 *
 * Supabase's default privileges grant anon everything on a new
 * table in `public`, which was harmless while these were
 * invoker views — RLS still answered. A definer view has no
 * RLS, so the `is_host_member` predicate inside it becomes the
 * only thing standing there. It holds (anon has no `auth.uid`,
 * so the predicate is false and the view returns nothing), but
 * a security boundary with exactly one layer is a boundary that
 * breaks the first time somebody edits the predicate.
 *
 * So anon is revoked explicitly, and the write grants that
 * default gave out go with it — nothing writes through a view.
 */
revoke all on
  host_delivery_v, host_stay_v, host_earnings_v,
  host_analytics_daily_v, host_analytics_hour_v, host_analytics_unit_v
from anon;

revoke insert, update, delete, truncate on
  host_delivery_v, host_stay_v, host_earnings_v,
  host_analytics_daily_v, host_analytics_hour_v, host_analytics_unit_v
from authenticated;
