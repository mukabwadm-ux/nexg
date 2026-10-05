-- A merchant and a rider can see their own work.
--
-- Everything up to now has been built for staff. A merchant who
-- finished onboarding had exactly one place to go — the status page
-- that told them somebody was looking at their application — and a
-- rider had the same. The moment either of them went live there was
-- nothing on the other side of the door.
--
-- This opens it. The database already carried almost all of the
-- shape: `merchant_user` links an account to a business,
-- `rider.user_id` links one to a rider, and nearly every partner
-- table already had a read policy for the person it is about. What
-- was missing was three things:
--
--   * Orders. The read policy let *staff who work a merchant* see
--     their orders and not the merchant themselves, so a merchant
--     dashboard would have shown zero orders and looked exactly
--     like a quiet day.
--   * One answer to "where does this account belong". Sign-in, the
--     middleware and each dashboard would otherwise each decide,
--     and they would drift.
--   * A way to do the two things a partner most often needs after
--     onboarding and currently cannot: replace a document, and open
--     another store.

-- ═══════════════════════════ a merchant sees their own orders

/*
 * `authz.works_merchant` is a *staff* grant — ops for that city.
 * The policy had it and not `is_merchant_member`, so the one person
 * the order is actually about could not read it.
 *
 * Riders already had their half: a rider sees an order once it is
 * theirs, and not before, which is right — an offer is not yet a
 * job and the guest's address is not theirs to read until it is.
 */
drop policy if exists order_read on public.order;

create policy order_read on public.order
  for select to authenticated
  using (
    authz.is_merchant_member(merchant_id)
    or (rider_id is not null and authz.is_rider_self(rider_id))
    or authz.works_merchant(merchant_id)
    or authz.can_manage_merchants(city_id)
    or authz.can_manage_riders(city_id)
    or authz.reaches_module('orders')
    or authz.reaches_module('live_ops')
  );

-- ════════════════════════════════ where this account belongs

/*
 * One answer, read by the sign-in redirect and by every partner
 * page. Three screens deciding this separately is how somebody ends
 * up signed in, looking at a page that tells them to apply.
 *
 * The `pct` is what decides whether a dashboard opens. The ask was
 * "after onboarding is done, or about 90%", and readiness is six
 * checks — so it moves in sixths and there is no 90: five of six
 * is 83. Eighty is therefore the line, and it lands exactly where
 * the ask meant it to, on "everything done but one thing". Below
 * that the honest answer is still the application, because a
 * half-finished partner has nothing to run yet.
 *
 * Submitted or live always opens the dashboard regardless of pct:
 * once a person is reviewing it, the applicant's job is waiting and
 * answering, and both of those live inside.
 */
create or replace function public.fn_partner_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  m public.merchant;
  r public.rider;
  v_pct integer;
begin
  if v_uid is null then
    return jsonb_build_object('kind', 'anonymous', 'home', '/sign-in');
  end if;

  if exists (select 1 from public.staff_user su
              where su.user_id = v_uid and su.status = 'active') then
    return jsonb_build_object('kind', 'staff', 'home', '/',
      'note', 'Staff work in the admin console, not here.');
  end if;

  select * into m from public.merchant mm
   where authz.is_merchant_member(mm.id)
   order by mm.updated_at desc limit 1;

  if m.id is not null then
    v_pct := coalesce((public.fn_merchant_readiness(m.id) ->> 'pct')::int, 0);
    return jsonb_build_object(
      'kind', 'merchant',
      'id', m.id,
      'name', coalesce(m.trading_name, m.legal_name),
      'status', m.status,
      'pct', v_pct,
      'submitted', m.submitted_at is not null,
      'ready', m.submitted_at is not null or v_pct >= 80,
      'home', case when m.submitted_at is not null or v_pct >= 80
                   then '/merchant' else '/merchants/apply' end);
  end if;

  select * into r from public.rider rr where rr.user_id = v_uid
   order by rr.updated_at desc limit 1;

  if r.id is not null then
    v_pct := coalesce((public.fn_rider_readiness(r.id) ->> 'pct')::int, 0);
    return jsonb_build_object(
      'kind', 'rider',
      'id', r.id,
      'name', nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
      'status', r.status,
      'pct', v_pct,
      'submitted', r.submitted_at is not null,
      'ready', r.submitted_at is not null or v_pct >= 80,
      'home', case when r.submitted_at is not null or v_pct >= 80
                   then '/rider' else '/riders/apply' end);
  end if;

  return jsonb_build_object('kind', 'guest', 'home', '/');
end;
$$;

comment on function public.fn_partner_home is
  'Where this account belongs. One answer, so sign-in and every partner page cannot disagree and leave somebody signed in on a page telling them to apply.';

-- ══════════════════════════════════ the merchant's own view

create or replace view public.merchant_home_v
with (security_invoker = true) as
select
  m.id as merchant_id,
  coalesce(m.trading_name, m.legal_name) as name,
  m.legal_name,
  m.category::text as category,
  m.status::text as status,
  m.status_reason,
  m.city_id,
  c.name as city,
  m.submitted_at,
  m.went_live_at,
  m.accepting_orders,
  m.accepting_orders_source::text as accepting_orders_source,
  m.busy_mode_until,
  m.explore_visible,
  m.pay_on_delivery,
  m.pay_on_delivery_cap_kes,
  m.prep_minutes,
  m.capacity_per_15min,
  m.health_band::text as health_band,
  m.health_score,
  m.featured,
  m.contact_name,
  m.contact_phone,
  m.contact_email,
  m.payout_rail,
  m.payout_account,

  (public.fn_merchant_readiness(m.id) ->> 'pct')::int as readiness_pct,
  public.fn_merchant_readiness(m.id) as readiness,

  /* The counts the header carries. Each is a thing the merchant can
     act on today, which is the only reason a number belongs there. */
  (select count(*) from public.merchant_branch b where b.merchant_id = m.id) as stores,
  (select count(*) from public.catalogue_item ci
    where ci.merchant_id = m.id and ci.available) as items_available,
  (select count(*) from public.merchant_message mm
    where mm.merchant_id = m.id and mm.direction = 'out' and mm.read_at is null)
    as unread_messages,

  /* Documents: what is still wanted, and what has gone wrong with
     what was sent. Those are different jobs and the dashboard
     separates them. */
  (select count(*) from public.fn_merchant_required_docs(m.id) rq
    where rq.essential
      and not exists (select 1 from public.document d
                       where d.owner_type = 'merchant' and d.owner_id = m.id
                         and d.requirement_id = rq.id and d.superseded_at is null))
    as documents_missing,
  (select count(*) from public.document d
    where d.owner_type = 'merchant' and d.owner_id = m.id
      and d.superseded_at is null and d.status in ('rejected', 'expired'))
    as documents_to_fix,
  (select count(*) from public.document d
    where d.owner_type = 'merchant' and d.owner_id = m.id
      and d.superseded_at is null and d.status = 'verified'
      and d.expires_at is not null and d.expires_at < current_date + 30)
    as documents_expiring,
  (select count(*) from public.document_request dr
    where dr.owner_type = 'merchant' and dr.owner_id = m.id
      and dr.fulfilled_document_id is null) as documents_asked_for,

  /* Today's trade. Null would read as nothing; zero is the truth
     on a quiet morning and the dashboard says which. */
  (select count(*) from public.order o
    where o.merchant_id = m.id and o.placed_at::date = current_date) as orders_today,
  (select count(*) from public.order o
    where o.merchant_id = m.id
      and o.stage not in ('delivered', 'cancelled', 'refunded')) as orders_open,
  (select coalesce(sum(o.total_cents - o.commission_cents), 0) from public.order o
    where o.merchant_id = m.id and o.placed_at::date = current_date
      and o.stage = 'delivered') as earned_today_cents,

  /* The one in force, and whether this merchant has signed it.
     Only a published version counts — a draft nobody has issued is
     not something to chase anybody about. */
  (select mt.version from public.merchant_terms_version mt
    where mt.status = 'current' and mt.effective_from <= current_date
    order by mt.effective_from desc limit 1) as current_terms,
  exists (select 1 from public.merchant_terms_version mtv
           where mtv.status = 'current' and mtv.effective_from <= current_date
             and not exists (select 1 from public.merchant_terms_acceptance ma
                              where ma.merchant_id = m.id and ma.terms_version_id = mtv.id))
    as terms_to_accept,

  (select b.status::text from public.featured_booking b
    where b.merchant_id = m.id and b.status in ('live', 'booked', 'requested', 'quoted')
    order by b.requested_at desc limit 1) as featured_state
from public.merchant m
join public.city c on c.id = m.city_id;

comment on view public.merchant_home_v is
  'What a merchant sees about their own business. Every count here is something they can act on today — a number they cannot act on is decoration.';

-- ═════════════════════════════════════ the rider's own view

create or replace view public.rider_home_v
with (security_invoker = true) as
select
  r.id as rider_id,
  nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '') as name,
  r.first_name,
  r.phone,
  r.status::text as status,
  r.status_reason,
  r.city_id,
  c.name as city,
  r.vehicle::text as vehicle,
  r.plate_no,
  r.presence::text as presence,
  r.presence_changed_at,
  r.can_receive_offers,
  r.offers_paused_reason,
  r.cooldown_until,
  r.cooldown_reason,
  r.submitted_at,
  r.activated_at,
  r.areas,
  r.shifts,
  r.bike_max_km,
  r.payout_msisdn,
  r.health_band::text as health_band,
  r.health_score,
  r.top_decile,
  r.strike_count,
  r.cash_on_hand,
  coalesce(r.cash_cap, settings.fn_int('dispatch.rider_cash_cap', r.city_id)) as cash_cap,
  r.alcohol_eligible,
  r.large_items_eligible,

  (public.fn_rider_readiness(r.id) ->> 'pct')::int as readiness_pct,
  public.fn_rider_readiness(r.id) as readiness,

  (select count(*) from public.rider_message rm
    where rm.rider_id = r.id and rm.direction = 'out' and rm.read_at is null)
    as unread_messages,

  (select count(*) from public.fn_rider_required_docs(r.id) rq
    where rq.essential
      and not exists (select 1 from public.document d
                       where d.owner_type = 'rider' and d.owner_id = r.id
                         and d.requirement_id = rq.id and d.superseded_at is null))
    as documents_missing,
  (select count(*) from public.document d
    where d.owner_type = 'rider' and d.owner_id = r.id
      and d.superseded_at is null and d.status in ('rejected', 'expired'))
    as documents_to_fix,
  (select count(*) from public.document d
    where d.owner_type = 'rider' and d.owner_id = r.id
      and d.superseded_at is null and d.status = 'verified'
      and d.expires_at is not null and d.expires_at < current_date + 30)
    as documents_expiring,
  (select count(*) from public.document_request dr
    where dr.owner_type = 'rider' and dr.owner_id = r.id
      and dr.fulfilled_document_id is null) as documents_asked_for,

  (select count(*) from public.order o
    where o.rider_id = r.id and o.delivered_at::date = current_date) as trips_today,
  (select count(*) from public.order o
    where o.rider_id = r.id
      and o.stage not in ('delivered', 'cancelled', 'refunded')) as trip_open,
  (select coalesce(sum(e.total_kes), 0) from public.rider_earning e
    where e.rider_id = r.id and not e.is_test
      and e.earned_at::date = current_date) as earned_today_kes,
  (select coalesce(sum(e.total_kes), 0) from public.rider_earning e
    where e.rider_id = r.id and not e.is_test
      and e.earned_at >= date_trunc('week', now())) as earned_week_kes,

  exists (select 1 from public.rider_agreement_version av
           where av.status = 'current' and av.effective_from <= current_date
             and not exists (select 1 from public.rider_agreement_acceptance aa
                              where aa.rider_id = r.id and aa.agreement_version_id = av.id))
    as agreement_to_accept
from public.rider r
join public.city c on c.id = r.city_id;

comment on view public.rider_home_v is
  'What a rider sees about themselves. Cash on hand against their cap is here because it is the number that decides whether they are offered a cash job, and a rider who does not know it cannot act on it.';

-- ═══════════════════════════════════ what each one is carrying

create or replace view public.merchant_orders_v
with (security_invoker = true) as
select
  o.id,
  o.merchant_id,
  o.reference,
  o.stage::text as stage,
  o.channel::text as channel,
  o.payment_method::text as payment_method,
  o.payment_status::text as payment_status,
  o.dropoff_label,
  b.name as store,
  o.branch_id,
  g.name as guest,
  o.placed_at,
  o.confirmed_at,
  o.promised_ready_at,
  o.ready_at,
  o.picked_up_at,
  o.delivered_at,
  o.subtotal_cents,
  o.total_cents,
  o.commission_cents,
  /* What the merchant actually keeps. The guest's total is not
     their number and showing it as one is how a statement comes as
     a surprise at the end of the week. */
  o.total_cents - coalesce(o.commission_cents, 0)
    - o.delivery_fee_cents - o.service_fee_cents as merchant_keeps_cents,
  o.currency,
  nullif(trim(coalesce(rd.first_name, '') || ' ' || coalesce(rd.last_name, '')), '') as rider,
  rd.presence::text as rider_presence,
  case
    when o.stage in ('cancelled', 'refunded') then 'closed'
    when o.stage = 'delivered' then 'done'
    when o.promised_ready_at is not null and o.ready_at is null
         and now() > o.promised_ready_at then 'you_are_late'
    when o.stage in ('placed', 'confirmed') then 'to_cook'
    when o.stage = 'preparing' then 'cooking'
    when o.stage = 'ready' and o.rider_id is null then 'waiting_for_a_rider'
    when o.stage = 'ready' then 'rider_coming'
    else 'on_the_way'
  end as what_now,
  (select count(*) from public.order_item oi
    where oi.order_id = o.id and oi.removed_at is null) as item_count,
  exists (select 1 from public.order_adjustment a
           where a.order_id = o.id and a.requires_merchant_ack
             and a.merchant_acked_at is null) as needs_your_ack
from public.order o
left join public.merchant_branch b on b.id = o.branch_id
left join public.guest g on g.id = o.guest_id
left join public.rider rd on rd.id = o.rider_id;

create or replace view public.rider_jobs_v
with (security_invoker = true) as
select
  o.id,
  o.rider_id,
  o.reference,
  o.stage::text as stage,
  o.payment_method::text as payment_method,
  o.payment_status::text as payment_status,
  coalesce(m.trading_name, m.legal_name) as merchant,
  b.name as store,
  b.address_text as pickup,
  o.dropoff_label as dropoff,
  o.dropoff_note,
  o.placed_at,
  o.picked_up_at,
  o.delivered_at,
  o.promised_delivery_at,
  o.handed_to::text as handed_to,
  /* What the rider collects, and what they keep. On a cash order
     those are different numbers and confusing them is how a float
     goes wrong. */
  case when o.payment_method = 'cash_on_delivery' then o.total_cents end as collect_cents,
  (select coalesce(sum(e.total_kes), 0) * 100 from public.rider_earning e
    where e.rider_id = o.rider_id and e.order_reference = o.reference) as earned_cents,
  o.currency,
  case
    when o.stage in ('cancelled', 'refunded') then 'closed'
    when o.delivered_at is not null then 'done'
    when o.picked_up_at is not null then 'to_the_guest'
    else 'to_the_merchant'
  end as what_now
from public.order o
left join public.merchant m on m.id = o.merchant_id
left join public.merchant_branch b on b.id = o.branch_id;

grant select on public.merchant_home_v, public.rider_home_v,
  public.merchant_orders_v, public.rider_jobs_v to authenticated;
grant execute on function public.fn_partner_home() to authenticated, anon;
