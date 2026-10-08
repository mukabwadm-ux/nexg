-- What the rebuilt rider dashboard reads.
--
-- Additive only, and binding. Riders are signed in against
-- these rows now, there is an app build in the field talking to
-- the same RPCs, and a half-finished application is somebody's
-- afternoon at a hub. Nothing is dropped, renamed or re-keyed;
-- the surfaces never write `rider.status`.
--
-- Four views:
--
--   rider_setup_progress_v  the seven activation steps
--   rider_week_earnings_v   this week, split the way the rider
--                           is actually paid
--   rider_pay_line_v        what each job paid, line by line
--   rider_attention_v       the tiles that need doing
--
-- One rule runs through all of them: no projected earnings,
-- anywhere. Every figure is money that has already been earned
-- or a rate card line that already exists. A rider shown "you
-- could make KES 3,000 today" and then making 900 does not
-- forgive the arithmetic.

-- ══════════════════════════════════ the seven activation steps

/*
 * The existing `readiness` has six checks and the design has
 * seven steps, and as with merchants they are not the same list.
 *
 *   about_you       -> 1 Profile & phone
 *   areas_hours     -> folded into 1; the home zone is part of
 *                      the profile the design draws, not a task
 *                      a rider would name separately
 *   your_ride       -> 2 Vehicle
 *   (new)           -> 3 App installed
 *   documents       -> 4 Documents
 *   mpesa_payout    -> 5 Payout number
 *   kit_onboarding  -> 6 Onboarding session
 *   (new)           -> 7 Training & test delivery
 *
 * Steps 3 and 7 are new, and both have a real source: 7 reads
 * `rider_training` and `rider_test_trip`, which exist. 3 has no
 * device table yet and says so rather than guessing.
 */
create or replace view rider_setup_progress_v
with (security_invoker = true) as
with per_rider as (
  select
    r.id as rider_id,
    r.first_name,
    r.last_name,
    r.status::text as status,
    r.vehicle::text as vehicle,
    r.submitted_at,
    r.activated_at,
    rd.readiness,

    /* 1 — who they are, verified, and where they ride. */
    (coalesce((rd.readiness ->> 'about_you')::boolean, false)
      and coalesce((rd.readiness ->> 'areas_hours')::boolean, false)) as step_profile,

    /* 2 — what they ride. */
    coalesce((rd.readiness ->> 'your_ride')::boolean, false) as step_vehicle,

    /*
     * 3 — the app on their phone, with notifications and
     * location allowed.
     *
     * There is no `rider_device` table yet, so this cannot be
     * observed and is reported false rather than assumed. A
     * rider who has the app sees one step they have already
     * done; a rider who does not would otherwise be told they
     * were ready to take offers they can never receive, which
     * is the worse of the two.
     */
    false as step_app,

    /* 4 — the paperwork their vehicle type requires. */
    coalesce((rd.readiness ->> 'documents')::boolean, false) as step_documents,

    /* 5 — the number the money goes to. */
    coalesce((rd.readiness ->> 'mpesa_payout')::boolean, false) as step_payout,

    /* 6 — the session where they get the bag and the kit. */
    coalesce((rd.readiness ->> 'kit_onboarding')::boolean, false) as step_session,

    /* 7 — three modules passed and a test delivery done. */
    ((select count(*) from public.rider_training t
       where t.rider_id = r.id and t.passed) >= 3
     and exists (select 1 from public.rider_test_trip tt
                  where tt.rider_id = r.id and tt.outcome = 'pass')) as step_training,

    (select count(*) from public.rider_training t
      where t.rider_id = r.id and t.passed) as modules_passed
  from public.rider r
  left join lateral (
    select public.fn_rider_readiness(r.id) as readiness
  ) rd on true
)
select
  p.*,
  (p.step_profile::int + p.step_vehicle::int + p.step_app::int
   + p.step_documents::int + p.step_payout::int
   + p.step_session::int + p.step_training::int) as done_count,
  7 as of_count,
  /* Step 7 needs 4, 5 and 6 first — which is what the design's
     "Available after 4–6" says. Pointing a rider at a step they
     cannot start is how a checklist loses them. */
  case
    when not p.step_profile then 1
    when not p.step_vehicle then 2
    when not p.step_app then 3
    when not p.step_documents then 4
    when not p.step_payout then 5
    when not p.step_session then 6
    when not p.step_training then 7
  end as next_step,
  (p.step_documents and p.step_payout and p.step_session) as can_train,
  p.status = 'active' as is_active
from per_rider p;

comment on view rider_setup_progress_v is
  'The seven activation steps as the dashboard draws them. Step 3 reports false because there is no device table to read; telling a rider they are ready for offers they cannot receive is worse than one redundant tick.';

-- ═════════════════════════════════════════ what each job paid

/*
 * A job's pay, as the lines a rider can check.
 *
 * Riders do not trust a single total and are right not to: the
 * whole argument about pay is which lines were applied. So the
 * lines are the view and the total is their sum, rather than
 * the other way round.
 */
create or replace view rider_pay_line_v
with (security_invoker = true) as
select
  e.id as earning_id,
  e.rider_id,
  e.order_reference,
  e.earned_at,
  e.base_kes,
  e.distance_kes,
  e.waiting_kes,
  e.pickup_bonus_kes,
  e.peak_bonus_kes,
  e.tip_kes,
  e.penalty_kes,
  e.total_kes,
  e.cash_collected_kes,
  e.is_test,
  /* The one-line summary the job row shows, built from whichever
     lines are non-zero. Never "base + bonuses" when there was no
     bonus. */
  nullif(
    concat_ws(' · ',
      case when e.base_kes > 0 then 'base' end,
      case when e.distance_kes > 0 then 'distance' end,
      case when e.waiting_kes > 0 then 'waiting' end,
      case when e.pickup_bonus_kes > 0 then 'pickup bonus' end,
      case when e.peak_bonus_kes > 0 then 'peak' end,
      case when e.tip_kes > 0 then 'tip' end,
      case when e.penalty_kes > 0 then 'penalty' end),
    '') as lines
from public.rider_earning e;

-- ═══════════════════════════════════════ this week's earnings

/*
 * Monday to Sunday, paid the Friday after.
 *
 * Split base-and-distance from bonuses-and-tips because that is
 * the split a rider cares about — one is what the work pays and
 * the other is what the weather and the hour added. Cash
 * collected is shown against cash deposited, because the
 * difference is what they owe.
 */
create or replace view rider_week_earnings_v
with (security_invoker = true) as
select
  r.id as rider_id,
  date_trunc('week', (now() at time zone 'Africa/Nairobi'))::date as week_start,
  coalesce(w.deliveries, 0) as deliveries,
  coalesce(w.base_kes, 0) as base_kes,
  coalesce(w.distance_kes, 0) as distance_kes,
  coalesce(w.bonus_kes, 0) as bonus_kes,
  coalesce(w.tip_kes, 0) as tip_kes,
  coalesce(w.penalty_kes, 0) as penalty_kes,
  coalesce(w.cash_collected_kes, 0) as cash_collected_kes,
  coalesce(w.total_kes, 0) as total_kes
from public.rider r
left join lateral (
  select
    count(*) as deliveries,
    sum(e.base_kes) as base_kes,
    sum(e.distance_kes) as distance_kes,
    sum(e.pickup_bonus_kes + e.peak_bonus_kes) as bonus_kes,
    sum(e.tip_kes) as tip_kes,
    sum(e.penalty_kes) as penalty_kes,
    sum(e.cash_collected_kes) as cash_collected_kes,
    sum(e.total_kes) as total_kes
  from public.rider_earning e
  where e.rider_id = r.id and not e.is_test
    and e.earned_at >= date_trunc('week', (now() at time zone 'Africa/Nairobi'))
) w on true;

/* Bars by day, split the same way the panel splits them. */
create or replace view rider_week_bars_v
with (security_invoker = true) as
select
  e.rider_id,
  (e.earned_at at time zone 'Africa/Nairobi')::date as day,
  to_char((e.earned_at at time zone 'Africa/Nairobi'), 'Dy') as dow,
  coalesce(sum(e.base_kes + e.distance_kes), 0) as base_kes,
  coalesce(sum(e.pickup_bonus_kes + e.peak_bonus_kes + e.tip_kes), 0) as bonus_kes
from public.rider_earning e
where not e.is_test
  and e.earned_at >= date_trunc('week', (now() at time zone 'Africa/Nairobi'))
group by 1, 2, 3;

-- ═══════════════════════════════════════ what needs doing

/*
 * Ordered by what stops them earning soonest.
 *
 * Cash at the cap is first because it stops cash orders
 * outright; an expiring licence is next because it stops them
 * going online on a known date; training is below both because
 * it only gates one kind of job.
 */
create or replace view rider_attention_v
with (security_invoker = true) as
-- cash at or near the cap
select
  h.rider_id, 1 as sort, 'cash'::text as kind, 'warn'::text as tone,
  case when h.cash_on_hand >= h.cash_cap then 'Deposit cash now'
       else 'Deposit cash soon' end as title,
  case when h.cash_on_hand >= h.cash_cap
       then 'You are at your cash cap, so cash orders have stopped until a deposit is matched.'
       else 'You are close to your cash cap. At the cap you stop receiving cash orders until a '
            || 'deposit is matched.' end as body,
  'Deposit via M-Pesa paybill'::text as action,
  '/rider/cash'::text as href
from public.rider_home_v h
where h.cash_cap > 0 and h.cash_on_hand >= h.cash_cap * 0.8
union all
-- a document about to stop them
select
  h.rider_id, 2, 'documents', 'danger',
  h.documents_expiring::text || ' document' ||
    case when h.documents_expiring = 1 then '' else 's' end || ' expiring',
  'Upload the renewal to keep going online after that date. An expired document stops offers '
    || 'rather than warning you.',
  'Upload now', '/rider/documents'
from public.rider_home_v h
where h.documents_expiring > 0
union all
-- paperwork still outstanding
select
  h.rider_id, 3, 'documents_missing', 'danger',
  (h.documents_missing + h.documents_to_fix + h.documents_asked_for)::text || ' document'
    || case when (h.documents_missing + h.documents_to_fix + h.documents_asked_for) = 1
            then '' else 's' end || ' needed',
  'Photos from your phone are fine. Reviewed within one working day.',
  'Upload now', '/rider/documents'
from public.rider_home_v h
where (h.documents_missing + h.documents_to_fix + h.documents_asked_for) > 0
union all
-- nowhere to send Friday's money
select
  h.rider_id, 4, 'payout', 'warn',
  'Payout number not verified',
  'We send KES 1 to confirm the M-Pesa number is yours. Payouts go there every Friday.',
  'Verify number', '/rider/earnings'
from public.rider_home_v h
where h.payout_msisdn is null
union all
-- modules still to pass
select
  p.rider_id, 5, 'training', 'info',
  'Training: ' || (3 - p.modules_passed)::text || ' module'
    || case when (3 - p.modules_passed) = 1 then '' else 's' end || ' left',
  'Short modules on pickups and hand-offs, cash rules, and safety. Each takes a few minutes, in '
    || 'English or Kiswahili.',
  'Start module', '/rider/health'
from public.rider_setup_progress_v p
where p.modules_passed < 3
union all
-- somebody is waiting on a reply
select
  h.rider_id, 6, 'messages', 'good',
  'Message from rider ops',
  'A thread is waiting on you.',
  'Reply', '/rider/messages'
from public.rider_home_v h
where h.unread_messages > 0;

grant select on
  rider_setup_progress_v,
  rider_pay_line_v,
  rider_week_earnings_v,
  rider_week_bars_v,
  rider_attention_v
to authenticated;
