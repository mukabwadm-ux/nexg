-- What the rebuilt merchant dashboard reads.
--
-- Additive only, and that is a contract rather than a style
-- preference. The merchant domain is live: merchants are signed
-- in against these rows right now, Orders and Finance and
-- Featured all reference these ids, and an application saved
-- half-way through onboarding is somebody's evening of work.
-- Nothing here drops, renames or re-keys anything. Where a
-- shape is wrong for the new screens, a view aliases it.
--
-- Four views, one per thing the designs show that could not be
-- read before:
--
--   merchant_setup_progress_v  the seven steps, as drawn
--   merchant_branch_live_v     the branch cards
--   merchant_week_money_v      this week's money
--   merchant_attention_v       the four tiles that need a person

-- ═══════════════════════════════════════ the seven steps

/*
 * The existing `readiness` jsonb has six checks. The design has
 * seven steps. They are not the same list and this is where the
 * two are reconciled.
 *
 * The mapping is deliberate rather than mechanical:
 *
 *   business_basics  -> 1 Business profile
 *   location         -> folded into 1, because an address with
 *                       no pin is an incomplete profile, not a
 *                       separate task a merchant would recognise
 *   hours_prep       -> 2 Hours
 *   (new)            -> 3 Team & devices
 *   first_items      -> 4 Catalogue started
 *   documents        -> 5 Documents
 *   payout           -> 6 Payout method
 *   (new)            -> 7 Test order & go live
 *
 * Computed, never stored. A stored counter is a counter that
 * can disagree with the records it describes, and the disagreement
 * surfaces as a merchant being told to do something they have
 * already done.
 */
create or replace view merchant_setup_progress_v
with (security_invoker = true) as
with per_merchant as (
  select
    m.id as merchant_id,
    m.trading_name,
    m.status::text as status,
    m.submitted_at,
    m.went_live_at,
    coalesce(r.readiness, '{}'::jsonb) as readiness,

    /* 1 — who they are and where. */
    (coalesce((r.readiness ->> 'business_basics')::boolean, false)
      and coalesce((r.readiness ->> 'location')::boolean, false)) as step_profile,

    /* 2 — when they are open. */
    coalesce((r.readiness ->> 'hours_prep')::boolean, false) as step_hours,

    /*
     * 3 — somebody other than the owner, or a registered counter
     * device. There is no device table yet, so this reads the
     * only half that exists: a second person on the account.
     * Reporting it as done because we cannot see the other half
     * would be worse than reporting it honestly incomplete.
     */
    (select count(*) > 1 from public.merchant_user mu
      where mu.merchant_id = m.id) as step_team,

    /* 4 — something a guest can order. */
    coalesce((r.readiness ->> 'first_items')::boolean, false) as step_catalogue,

    /* 5 — the paperwork the category requires. */
    coalesce((r.readiness ->> 'documents')::boolean, false) as step_documents,

    /* 6 — somewhere to send the money. */
    coalesce((r.readiness ->> 'payout')::boolean, false) as step_payout,

    /* 7 — only a person at NexG can finish this one. */
    (m.went_live_at is not null) as step_live
  from public.merchant m
  left join lateral (
    select public.fn_merchant_readiness(m.id) as readiness
  ) r on true
)
select
  p.*,
  (p.step_profile::int + p.step_hours::int + p.step_team::int
   + p.step_catalogue::int + p.step_documents::int
   + p.step_payout::int + p.step_live::int) as done_count,
  7 as of_count,
  /*
   * Step 7 is not offered until 5 and 6 are done, which is what
   * the design's "Available after 5 & 6" says. Pointing somebody
   * at a step they cannot start is how a checklist loses trust.
   */
  case
    when not p.step_profile then 1
    when not p.step_hours then 2
    when not p.step_team then 3
    when not p.step_catalogue then 4
    when not p.step_documents then 5
    when not p.step_payout then 6
    when not p.step_live then 7
  end as next_step,
  (p.step_documents and p.step_payout) as can_go_live,
  p.status = 'live' as is_live
from per_merchant p;

comment on view merchant_setup_progress_v is
  'The seven steps as the dashboard draws them, mapped from the six existing readiness checks. Computed from the records each step is about, so it cannot tell a merchant to do something already done.';

-- ═══════════════════════════════════════════ the branch cards

create or replace view merchant_branch_live_v
with (security_invoker = true) as
select
  b.id as branch_id,
  b.merchant_id,
  b.name,
  b.address_text,
  b.is_primary,
  b.closed_at,
  b.closed_reason,
  b.latitude is not null and b.longitude is not null as pin_confirmed,
  m.status::text as merchant_status,
  m.accepting_orders,
  m.busy_mode_until,
  m.prep_minutes,
  /*
   * What a guest would see for this branch right now, as one
   * word. The dashboard shows it on the card, and a merchant
   * reading "Open" needs it to mean the same thing a guest
   * sees — so it is derived here once rather than in the page.
   */
  case
    when m.status::text <> 'live' then 'setting_up'
    when b.closed_at is not null then 'closed'
    when not m.accepting_orders then 'paused'
    when m.busy_mode_until > now() then 'busy'
    else 'open'
  end as state,
  coalesce(o.orders_today, 0) as orders_today,
  o.prep_avg_minutes,
  coalesce(ci.items, 0) as catalogue_items
from public.merchant_branch b
join public.merchant m on m.id = b.merchant_id
left join lateral (
  select
    count(*) as orders_today,
    round(avg(extract(epoch from (ord.ready_at - ord.confirmed_at)) / 60))::int
      as prep_avg_minutes
  from public."order" ord
  where ord.branch_id = b.id
    and (ord.placed_at at time zone 'Africa/Nairobi')::date
        = (now() at time zone 'Africa/Nairobi')::date
) o on true
left join lateral (
  select count(*) as items from public.catalogue_item it
   where it.merchant_id = b.merchant_id and it.available
) ci on true;

-- ═════════════════════════════════════════ this week's money

/*
 * Monday to Sunday, settling the Friday after.
 *
 * Read from the order money the statement is built from rather
 * than recomputed, so the figure on the dashboard and the figure
 * on the statement cannot disagree. The portal does no
 * arithmetic on money; this view does it once, next to the
 * definition.
 */
create or replace view merchant_week_money_v
with (security_invoker = true) as
select
  m.id as merchant_id,
  date_trunc('week', (now() at time zone 'Africa/Nairobi'))::date as week_start,
  (date_trunc('week', (now() at time zone 'Africa/Nairobi')) + interval '6 days')::date
    as week_end,
  coalesce(w.delivered, 0) as delivered,
  coalesce(w.gross_cents, 0) as gross_cents,
  coalesce(w.commission_cents, 0) as commission_cents,
  coalesce(w.refund_cents, 0) as refund_cents,
  coalesce(w.gross_cents, 0) - coalesce(w.commission_cents, 0)
    - coalesce(w.refund_cents, 0) as net_cents
from public.merchant m
left join lateral (
  select
    count(*) filter (where o.stage::text = 'delivered') as delivered,
    sum(o.total_cents) filter (where o.stage::text = 'delivered') as gross_cents,
    sum(o.commission_cents) filter (where o.stage::text = 'delivered') as commission_cents,
    coalesce((
      select sum(rf.amount_cents) from public.refund rf
       join public."order" o2 on o2.id = rf.order_id
      where o2.merchant_id = m.id and rf.status::text = 'issued'
        and rf.issued_at >= date_trunc('week', (now() at time zone 'Africa/Nairobi'))
    ), 0) as refund_cents
  from public."order" o
  where o.merchant_id = m.id
    and o.placed_at >= date_trunc('week', (now() at time zone 'Africa/Nairobi'))
) w on true;

/* Bars by day, for the small chart beside it. */
create or replace view merchant_week_bars_v
with (security_invoker = true) as
select
  o.merchant_id,
  (o.placed_at at time zone 'Africa/Nairobi')::date as day,
  to_char((o.placed_at at time zone 'Africa/Nairobi'), 'Dy') as dow,
  count(*) filter (where o.stage::text = 'delivered') as delivered,
  coalesce(sum(o.total_cents) filter (where o.stage::text = 'delivered'), 0) as gross_cents
from public."order" o
where o.placed_at >= date_trunc('week', (now() at time zone 'Africa/Nairobi'))
group by 1, 2, 3;

-- ═════════════════════════════════════ what needs a person

/*
 * The tiles across the bottom of the dashboard.
 *
 * Ordered by how soon each one costs something. A dispute with
 * a reply deadline is above a document expiring in twelve days
 * because one closes against you tonight and the other is a
 * reminder.
 *
 * Capped at four on the home by the page, not here — the view
 * returns everything so the "all" link has somewhere to go.
 */
create or replace view merchant_attention_v
with (security_invoker = true) as
-- documents that are missing, rejected or asked for
select
  m.id as merchant_id, 1 as sort, 'documents'::text as kind,
  'danger'::text as tone,
  (h.documents_missing + h.documents_to_fix + h.documents_asked_for)::text
    || ' document' ||
    case when (h.documents_missing + h.documents_to_fix + h.documents_asked_for) = 1
         then '' else 's' end || ' needed' as title,
  'Photos from your phone are fine; we review within one working day.'::text as body,
  'Upload now'::text as action,
  '/merchant/documents'::text as href
from public.merchant m
join public.merchant_home_v h on h.merchant_id = m.id
where (h.documents_missing + h.documents_to_fix + h.documents_asked_for) > 0
union all
-- nowhere to send the money
select
  m.id, 2, 'payout', 'warn',
  'Payout method not set',
  'Weekly settlements pay out on Fridays. Add an M-Pesa till, paybill or bank account.',
  'Set up payouts', '/merchant/money'
from public.merchant m
join public.merchant_home_v h on h.merchant_id = m.id
where h.payout_rail is null
union all
-- a document that will expire before anyone thinks about it
select
  m.id, 3, 'document_expiring', 'warn',
  h.documents_expiring::text || ' document' ||
    case when h.documents_expiring = 1 then '' else 's' end || ' expiring',
  'Re-upload to stay visible in Explore. An expired document hides you rather than warning you.',
  'Upload now', '/merchant/documents'
from public.merchant m
join public.merchant_home_v h on h.merchant_id = m.id
where h.documents_expiring > 0
union all
-- items a guest cannot picture
select
  m.id, 4, 'no_photos', 'info',
  (select count(*)::text from public.catalogue_item it
    where it.merchant_id = m.id and it.photo_path is null)
    || ' items without photos',
  'Optional before go-live, but items with photos get ordered far more often.',
  'Add photos', '/merchant/menu'
from public.merchant m
where exists (select 1 from public.catalogue_item it
               where it.merchant_id = m.id and it.photo_path is null)
union all
-- somebody is waiting on a reply
select
  m.id, 5, 'messages', 'good',
  'Message from merchant ops',
  'A thread is waiting on you.',
  'Reply', '/merchant/messages'
from public.merchant m
join public.merchant_home_v h on h.merchant_id = m.id
where h.unread_messages > 0;

grant select on
  merchant_setup_progress_v,
  merchant_branch_live_v,
  merchant_week_money_v,
  merchant_week_bars_v,
  merchant_attention_v
to authenticated;
