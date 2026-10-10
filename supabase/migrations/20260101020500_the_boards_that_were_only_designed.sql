-- The boards that were only designed.
--
-- Seven pages said "designed, not built": rider Cash, Shifts,
-- Health, Incidents, Refer and Support, and host Charge to
-- room. As with the merchant boards, most of the machinery was
-- already here — `cash_deposit`, `cash_event`, `shift_commitment`,
-- `rider_health_snapshot`, `rider_strike`, `incident` and
-- `folio_posting` have existed all along. What was missing was
-- the read layer between those tables and a person.
--
-- One real bug turned up on the way, and it is the reason the
-- merchant Support board has always been empty.

-- ───────────────────────────────────────── a ticket with an owner
--
-- `support_ticket` records `from_role`, an email and a phone
-- typed into a form. It has never recorded *who* sent it, so
-- there is nothing to scope "your tickets" by.
--
-- That gap produced two bugs that happened to cancel out.
-- `merchant_ticket_v` and `host_ticket_v` are `security_invoker`
-- views over a table whose read policy is
-- `is_super_admin() OR reaches_module('support')` — a merchant
-- is neither, so the view returns a confident zero and the
-- Support board shows "You have not needed us yet" to a
-- merchant with ten open tickets. And their only filter is
-- `where from_role = 'merchant'`, so had the policy ever
-- admitted a partner, every merchant would have read every
-- other merchant's tickets.
--
-- An owner column fixes the scoping; a definer view fixes the
-- read. Neither alone is enough.
alter table public.support_ticket
  add column if not exists created_by_user uuid references auth.users (id) on delete set null;

create index if not exists support_ticket_created_by_user_idx
  on public.support_ticket (created_by_user, created_at desc)
  where created_by_user is not null;

comment on column public.support_ticket.created_by_user is
  'Who opened it, when there was a session. Null for the anonymous contact form. This is what the partner-facing views scope on; the email on the form is what somebody typed, not who they are.';

-- ─────────────────────────────── what a partner sees of their own
--
-- Definer, because `support_ticket` has no read policy for a
-- partner and never should: the table holds every ticket from
-- every guest, rider, merchant and hotel. The scoping is the
-- `where` clause, so it is written first and read twice.
create or replace view public.merchant_ticket_v
with (security_invoker = false) as
  select t.id,
         t.reference,
         t.topic::text as topic,
         t.body,
         t.status::text as status,
         t.first_reply_at,
         t.resolved_at,
         t.created_at,
         t.source_form
    from public.support_ticket t
   where t.created_by_user = (select auth.uid())
     and t.from_role::text = 'merchant';

create or replace view public.host_ticket_v
with (security_invoker = false) as
  select t.id,
         t.reference,
         t.topic::text as topic,
         t.body,
         t.status::text as status,
         t.first_reply_at,
         t.resolved_at,
         t.created_at,
         t.source_form
    from public.support_ticket t
   where t.created_by_user = (select auth.uid())
     and t.from_role::text = 'hotel';

create or replace view public.rider_ticket_v
with (security_invoker = false) as
  select t.id,
         t.reference,
         t.topic::text as topic,
         t.body,
         t.status::text as status,
         t.first_reply_at,
         t.resolved_at,
         t.created_at,
         t.source_form
    from public.support_ticket t
   where t.created_by_user = (select auth.uid())
     and t.from_role::text = 'rider';

-- A definer view is readable by whoever is granted it, so the
-- grant is the whole access rule. `anon` has no tickets and
-- must never be handed somebody else's.
revoke all on public.merchant_ticket_v from anon;
revoke all on public.host_ticket_v from anon;
revoke all on public.rider_ticket_v from anon;
grant select on public.merchant_ticket_v to authenticated;
grant select on public.host_ticket_v to authenticated;
grant select on public.rider_ticket_v to authenticated;

-- ───────────────────────────────────────────────── rider: cash
--
-- Invoker views throughout this section. Unlike support, the
-- rider tables already carry `authz.is_rider_self(rider_id)` in
-- their read policies, so the policy is the scoping and a
-- definer view here would only move the rule somewhere harder
-- to find.
-- Definer, and scoped in the `where` because of it.
--
-- `cash_rule` is staff-only — its policy is
-- `reaches_module('riders')` — so an invoker view joining it
-- reads no cap for the rider it belongs to and the board says
-- "no cap set" to a rider who has one. The cap is the number
-- the whole page is measured against, so a null there is not a
-- cosmetic gap: it is the limit silently disappearing.
--
-- Definer means RLS no longer scopes this, so the scoping is
-- the predicate. Without the `r.user_id = auth.uid()` below
-- this view would hand every rider's cash position to every
-- other rider.
create or replace view public.rider_cash_v
with (security_invoker = false) as
  select r.id as rider_id,
         /* The enum is `collected, deposit, netted, write_off,
            manual_adjustment, recovery_payment`. Spelling any
            of these wrong does not error — the filter simply
            never matches, and cash on hand grows for ever
            because nothing is ever subtracted from it. */
         coalesce(sum(e.amount_kes) filter (where e.kind::text = 'collected'), 0)
           + coalesce(sum(e.amount_kes) filter (where e.kind::text = 'manual_adjustment'), 0)
           - coalesce(sum(e.amount_kes) filter (
               where e.kind::text in ('deposit', 'netted', 'write_off', 'recovery_payment')
             ), 0)
           as on_hand_kes,
         /* Not coalesced to zero. No cap configured for a city
            is "we have not set one", and a zero renders as a
            cap the rider is permanently over — an invented
            number dressed as a limit. Null, and the page says
            so. */
         cr.cap_default_kes as cap_kes,
         cr.remind_at_pct,
         cr.pause_at_pct,
         cr.netting_cutoff,
         cr.prefer_mpesa_at_door,
         coalesce(sum(e.amount_kes) filter (
           where e.kind::text = 'collected' and e.created_at >= date_trunc('day', now())
         ), 0) as collected_today_kes
    from public.rider r
    left join public.cash_event e on e.rider_id = r.id
    left join public.cash_rule cr on cr.city_id = r.city_id
   where r.user_id = (select auth.uid())
      or authz.works_rider(r.id)
   group by r.id, cr.cap_default_kes, cr.remind_at_pct, cr.pause_at_pct,
            cr.netting_cutoff, cr.prefer_mpesa_at_door;

revoke all on public.rider_cash_v from anon;
grant select on public.rider_cash_v to authenticated;

create or replace view public.rider_cash_event_v
with (security_invoker = true) as
  select e.id,
         e.rider_id,
         e.kind::text as kind,
         e.amount_kes,
         e.order_reference,
         e.note,
         e.created_at
    from public.cash_event e
   order by e.created_at desc;

create or replace view public.rider_deposit_v
with (security_invoker = true) as
  select d.id,
         d.rider_id,
         d.provider_ref,
         d.amount_kes,
         d.account_reference,
         d.paid_at,
         d.match_status::text as match_status,
         d.matched_at
    from public.cash_deposit d
   order by d.paid_at desc;

-- ─────────────────────────────────────────────── rider: shifts
create or replace view public.rider_shift_v
with (security_invoker = true) as
  select s.id,
         s.rider_id,
         s.date,
         s.time_window,
         s.status::text as status,
         s.committed_at,
         s.showed_at,
         z.name as zone_name,
         /* A commitment in the past that nobody showed for is a
            miss whatever the column says; the status is only
            updated when somebody gets round to it. */
         /* `released` is a shift given back in time and is not
            a miss. The enum is committed/showed/no_show/released. */
         (s.date < current_date and s.showed_at is null
            and s.status::text not in ('released', 'showed')) as counted_as_missed
    from public.shift_commitment s
    left join public.zone z on z.id = s.zone_id
   order by s.date desc, s.time_window;

-- ─────────────────────────────────────────────── rider: health
create or replace view public.rider_health_v
with (security_invoker = true) as
  select h.rider_id,
         h.as_of,
         h.score,
         h.band::text as band,
         h.acceptance_pct,
         h.on_time_pct,
         h.cancel_after_accept_pct,
         h.rating_avg,
         h.handoff_compliance_pct,
         h.safety_pct,
         h.issues_30d,
         h.trips_30d,
         h.weights,
         h.trend
    from public.rider_health_snapshot h
   where h.as_of = (
     select max(h2.as_of) from public.rider_health_snapshot h2 where h2.rider_id = h.rider_id
   );

create or replace view public.rider_strike_v
with (security_invoker = true) as
  select s.id,
         s.rider_id,
         s.level,
         s.reason,
         s.issued_at,
         s.expires_at,
         s.cleared_at,
         (s.cleared_at is null and (s.expires_at is null or s.expires_at > now())) as active
    from public.rider_strike s
   order by s.issued_at desc;

-- ──────────────────────────────────────────── rider: incidents
--
-- Deliberately narrow. `incident` carries the guest's user id,
-- a police reference, an insurance claim and an assignee; none
-- of that is the rider's to read, and a view that selected
-- `*` today would hand it over the first time a column was
-- added.
create or replace view public.rider_incident_v
with (security_invoker = true) as
  select i.id,
         i.rider_id,
         i.order_reference,
         i.kind::text as kind,
         i.severity::text as severity,
         i.status::text as status,
         i.happened_at,
         i.description,
         i.injury,
         i.compensation_kes,
         i.acknowledged_at,
         i.resolved_at,
         i.resolution
    from public.incident i
   where i.rider_id is not null
   order by i.happened_at desc;

-- ─────────────────────────────────────────────── rider: refer
--
-- `referral` is merchant-shaped: `merchant_id` is NOT NULL, so
-- it cannot hold "a rider brought a rider". Hosts already have
-- their own `host_referral` for exactly this reason, and this
-- is the rider twin of it rather than a third pattern.
create table if not exists public.rider_referral (
  id uuid primary key default gen_random_uuid(),
  referrer_rider_id uuid not null references public.rider (id) on delete cascade,
  referred_rider_id uuid references public.rider (id) on delete set null,
  code text not null,
  referred_name text,
  referred_phone text,
  status text not null default 'invited'
    check (status in ('invited', 'applied', 'in_review', 'active', 'void')),
  reward_amount_kes bigint,
  reward_status text not null default 'pending'
    check (reward_status in ('pending', 'earned', 'paid', 'void')),
  void_reason text,
  first_trip_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists rider_referral_referrer_idx
  on public.rider_referral (referrer_rider_id, created_at desc);

alter table public.rider_referral enable row level security;

drop policy if exists rider_referral_read on public.rider_referral;
create policy rider_referral_read on public.rider_referral
  for select
  using (authz.works_rider(referrer_rider_id) or authz.is_rider_self(referrer_rider_id));

comment on table public.rider_referral is
  'A rider who brought another rider. Separate from `referral`, which is merchant-shaped and has a NOT NULL merchant_id.';

create or replace view public.rider_referral_v
with (security_invoker = true) as
  select rr.id,
         rr.referrer_rider_id,
         rr.code,
         rr.referred_name,
         rr.status,
         rr.reward_amount_kes,
         rr.reward_status,
         rr.first_trip_at,
         rr.created_at
    from public.rider_referral rr
   order by rr.created_at desc;

-- ────────────────────────────────── host: charge to room
--
-- `folio_posting` is keyed on `hotel_id` and its policy is
-- `is_hotel_member`. A host is not automatically a hotel, so
-- this is empty for most of them — which is correct and is
-- what the Settings page already says ("Hotels only"). The
-- view exists so the board can show the real state rather than
-- a stub, including the state "you do not have this".
create or replace view public.host_folio_v
with (security_invoker = true) as
  select f.id,
         f.hotel_id,
         f.order_reference,
         f.room_no,
         f.guest_surname,
         f.amount,
         f.commission_amount,
         f.status::text as status,
         f.sync::text as sync,
         f.folio_ref,
         f.desk_note,
         f.pms_posted_at,
         f.escalated_at,
         f.created_at
    from public.folio_posting f
   order by f.created_at desc;
