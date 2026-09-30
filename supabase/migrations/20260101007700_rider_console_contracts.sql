-- The Riders console · read contracts.
--
-- The database is the integration layer. Dispatch reads dispatch_rider_v
-- and nothing else; the rider app reads rider_app_me_v; the merchant
-- dashboard reads merchant_fleet_rider_v; finance reads finance_rider_v.
-- No surface reaches into another surface's columns, so "is this rider
-- offerable" is answered once, here, rather than four times in four
-- languages that will drift apart.
--
-- Every figure that depends on the orders domain — trips, acceptance,
-- on-time, earnings — resolves to null, and the console renders [—].
-- There is no order service yet. A zero would read as "did nothing"
-- instead of "not measured", and the difference matters when the number
-- decides whether somebody is suspended.

-- ═══════════════════════════════════════ the fleet payout term
--
-- A merchant who declares their own riders is paid for those riders'
-- deliveries through their own settlement, and pays the rider
-- themselves. Some prefer NexG to pay the rider directly. That is a
-- term of the merchant's contract, not a dispatch setting, so it is its
-- own column rather than another meaning read into
-- `fleet_dispatch_preference`.
--
-- The settlement line records which way it went, because "where did my
-- money go" is the question that column exists to answer.

alter table public.merchant
  add column if not exists fleet_delivery_pay_to_merchant boolean not null default true;

comment on column public.merchant.fleet_delivery_pay_to_merchant is
  'True: this merchant''s fleet riders are paid through the merchant''s settlement. False: NexG pays them directly. A contract term, not a dispatch setting.';

-- ═══════════════════════════════════════════════════ helpers

/*
 * The cap that actually applies to a rider right now: their own if
 * somebody set one, else the city's new-rider cap while they are inside
 * the new-rider window, else the city default. Null all the way down is
 * a real answer — no cap has been decided — and the callers below treat
 * it as "cannot gate on cash", not as "unlimited".
 */
create or replace function public.fn_rider_cash_cap(p_rider_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(
    r.cash_cap,
    case
      when r.activated_at is not null
       and r.activated_at > now() - make_interval(days => coalesce(c.cap_new_rider_days, 30))
      then c.cap_new_rider_kes
    end,
    c.cap_default_kes
  )
  from public.rider r
  left join public.cash_rule c on c.city_id = r.city_id
  where r.id = p_rider_id
$$;

comment on function public.fn_rider_cash_cap(uuid) is
  'Rider override, else the city new-rider cap inside the window, else the city default. Null means nobody has set a cap — callers must not read that as unlimited.';

/*
 * Documents. `required` counts what the rider must hold for their
 * vehicle; `verified` what they actually have. Expiring uses 30 days
 * because that is what the Documents tab is labelled.
 */
create or replace function public.fn_rider_document_state(p_rider_id uuid)
returns table (
  required integer,
  verified integer,
  awaiting integer,
  expiring integer,
  expired integer,
  soonest_expiry date
)
language sql
stable
set search_path = ''
as $$
  with req as (
    select dr.id, dr.kind
    from public.document_requirement dr
    where dr.owner_type = 'rider' and dr.required
  ),
  doc as (
    select d.requirement_id, d.status, d.expires_at
    from public.document d
    where d.owner_type = 'rider' and d.owner_id = p_rider_id and d.superseded_at is null
  )
  select
    (select count(*) from req)::integer,
    (select count(*) from doc where status = 'verified')::integer,
    (select count(*) from doc where status = 'uploaded')::integer,
    (select count(*) from doc
      where status = 'verified' and expires_at is not null
        and expires_at between current_date and current_date + 30)::integer,
    (select count(*) from doc
      where expires_at is not null and expires_at < current_date)::integer,
    (select min(expires_at) from doc where status = 'verified' and expires_at >= current_date)
$$;

/*
 * Online riders in a zone, and how that compares with what the forecast
 * says the zone needs. `riders_needed` is null until somebody loads a
 * forecast, so the gap is null too — the Supply tab shows [—] rather
 * than claiming a zone is covered.
 */
create or replace function public.fn_zone_supply_gap(p_zone_id uuid, p_at timestamptz default now())
returns table (
  zone_id uuid,
  zone_name text,
  online_now integer,
  on_trip integer,
  riders_needed integer,
  gap integer
)
language sql
stable
set search_path = ''
as $$
  select
    z.id,
    z.name,
    count(*) filter (where r.presence in ('online', 'on_trip'))::integer,
    count(*) filter (where r.presence = 'on_trip')::integer,
    f.riders_needed,
    case when f.riders_needed is null then null
         else f.riders_needed - count(*) filter (where r.presence = 'online')::integer
    end
  from public.zone z
  left join public.rider r
    on r.status = 'active'
   and r.last_location is not null
   and extensions.st_covers(z.polygon, r.last_location)
  left join public.zone_demand_forecast f
    on f.zone_id = z.id
   and f.dow = extract(isodow from (p_at at time zone 'Africa/Nairobi'))::integer
   and f.hour = extract(hour from (p_at at time zone 'Africa/Nairobi'))::integer
  where z.id = p_zone_id and z.active
  group by z.id, z.name, f.riders_needed
$$;

-- ═══════════════════════════════════════ dispatch_rider_v
--
-- The only thing the Dispatch service reads. Offerability is decided
-- here so that a change to the rule — a new cooldown kind, a new
-- document block — reaches dispatch by deploying a migration rather
-- than by deploying a service.

create or replace view public.dispatch_rider_v
with (security_invoker = false) as
select
  r.id as rider_id,
  r.city_id,
  r.presence,
  r.last_location,
  r.last_location_at,
  r.vehicle,
  case r.vehicle
    when 'bicycle' then 'small'
    when 'motorbike' then 'standard'
    else 'large'
  end as capacity_class,
  r.areas as zones,
  (
    r.can_receive_offers
    and r.status = 'active'
    and r.presence = 'online'
    and (r.cooldown_until is null or r.cooldown_until < now())
  ) as offerable,
  /*
   * Cash is refused when no cap has been set, not allowed. An unset cap
   * means nobody has decided how much of NexG's money this rider may
   * carry, and the safe reading of that is none.
   */
  (
    r.pay_on_delivery_eligible
    and public.fn_rider_cash_cap(r.id) is not null
    and r.cash_on_hand < public.fn_rider_cash_cap(r.id)
  ) as cash_ok,
  r.alcohol_eligible,
  r.large_items_eligible,
  r.source,
  r.employer_merchant_id,
  r.health_band,
  r.top_decile
from public.rider r
where r.status in ('active', 'suspended');

revoke all on public.dispatch_rider_v from anon, authenticated;
grant select on public.dispatch_rider_v to service_role;

comment on view public.dispatch_rider_v is
  'The Dispatch service''s only read. Offerability and cash eligibility are decided here, not in the service, so the rule has one home. An unset cash cap means cash_ok is false — nobody has decided, so the answer is no.';

-- ═══════════════════════════════════════ console_rider_directory_v
--
-- The Directory table (B1) and the chips above it.

create or replace view public.console_rider_directory_v
with (security_invoker = true) as
select
  r.id,
  r.first_name,
  r.last_name,
  r.phone,
  r.status,
  r.presence,
  r.vehicle,
  r.plate_no,
  r.city_id,
  c.name as city_name,
  r.source,
  r.employer_merchant_id,
  m.trading_name as employer_name,
  r.health_band,
  r.health_score,
  r.top_decile,
  r.cash_on_hand,
  public.fn_rider_cash_cap(r.id) as cash_cap_effective,
  r.cooldown_until,
  r.can_receive_offers,
  r.offers_paused_reason,
  r.pay_on_delivery_eligible,
  r.created_at,
  r.activated_at,
  r.face_photo_path,
  /* From the nightly snapshot, so the table and the scorecard agree. */
  s.acceptance_pct,
  s.on_time_pct,
  s.rating_avg,
  s.trips_30d,
  s.issues_30d,
  d.expiring as documents_expiring,
  d.expired as documents_expired,
  (select count(*) from public.incident i
    where i.rider_id = r.id and i.status in ('open', 'investigating')) as open_incidents,
  (select count(*) from public.rider_strike st
    where st.rider_id = r.id and st.cleared_at is null) as active_strikes,
  (select max(ce.created_at) from public.cash_event ce
    where ce.rider_id = r.id and ce.kind = 'deposit') as last_deposit_at,
  (select min(ce.created_at) from public.cash_event ce
    where ce.rider_id = r.id and ce.kind = 'collected'
      and ce.created_at > coalesce(
        (select max(x.created_at) from public.cash_event x
          where x.rider_id = r.id and x.kind = 'deposit'), '-infinity'::timestamptz))
    as oldest_undeposited_at
from public.rider r
left join public.city c on c.id = r.city_id
left join public.merchant m on m.id = r.employer_merchant_id
left join lateral (
  select * from public.rider_health_snapshot hs
  where hs.rider_id = r.id order by hs.as_of desc limit 1
) s on true
left join lateral public.fn_rider_document_state(r.id) d on true;

comment on view public.console_rider_directory_v is
  'The Directory table (B1). security_invoker, so a city-scoped rider_ops sees their own city and nobody else''s.';

-- ═══════════════════════════════════════ console_rider_badges_v
--
-- The shell subtitle, the sidebar badge and the tab counts. One query
-- rather than eight, because the shell renders on every route.

create or replace view public.console_rider_badges_v
with (security_invoker = true) as
select
  count(*) filter (where status = 'active') as active,
  count(*) filter (where status in ('applied', 'documents_pending', 'under_review')) as onboarding,
  count(*) filter (where cooldown_until is not null and cooldown_until > now()) as on_cooldown,
  count(*) filter (where status = 'suspended') as suspended,
  count(*) filter (where status = 'active' and presence = 'online') as online_now,
  count(*) filter (where status = 'active' and presence = 'on_trip') as on_trip,
  count(*) filter (where source = 'merchant_fleet') as fleet,
  (select count(*) from public.incident
    where kind = 'sos' and acknowledged_at is null) as sos_open,
  (select count(*) from public.incident
    where status in ('open', 'investigating')) as incidents_open,
  (select count(*) from public.cash_deposit
    where match_status = 'unmatched') as unmatched_deposits,
  (select count(*) from public.rider_settlement_line
    where status = 'failed') as failed_payouts,
  (select count(*) from public.fraud_signal where status = 'open') as fraud_open,
  (select coalesce(sum(cash_on_hand), 0) from public.rider where cash_on_hand > 0) as cash_all,
  (select count(*) from public.rider where cash_on_hand > 0) as riders_holding_cash
from public.rider;

-- ═══════════════════════════════════════ finance_rider_v

create or replace view public.finance_rider_v
with (security_invoker = true) as
select
  r.id as rider_id,
  r.first_name,
  r.last_name,
  r.city_id,
  /* Masked in the view, not in the component. A surface cannot leak
     what it was never handed. */
  case
    when r.payout_msisdn is null then null
    else '+254 7•• ••• •' || right(r.payout_msisdn, 2)
  end as payout_msisdn_masked,
  r.payout_name_lookup,
  r.cash_on_hand,
  public.fn_rider_cash_cap(r.id) as cash_cap_effective,
  r.kit_deposit_kes,
  r.kit_deposit_status,
  r.status,
  r.employer_merchant_id,
  (select count(*) from public.rider_settlement_line l
    where l.rider_id = r.id and l.status in ('held', 'name_mismatch', 'failed')) as held_lines
from public.rider r;

comment on view public.finance_rider_v is
  'Finance''s read. The payout number is masked in the view itself — revealing it is an RPC that logs who looked.';

-- ═══════════════════════════════════════ merchant_fleet_rider_v
--
-- What a merchant sees of a rider they declared: enough to know who is
-- working, and nothing about their money, health or documents.

create or replace view public.merchant_fleet_rider_v
with (security_invoker = true) as
select
  r.id as rider_id,
  r.employer_merchant_id as merchant_id,
  r.first_name,
  r.vehicle,
  r.plate_no,
  r.status,
  r.presence,
  r.activated_at,
  /* Trips this week, once there is an order service to count them. */
  null::integer as trips_this_week
from public.rider r
where r.employer_merchant_id is not null;

comment on view public.merchant_fleet_rider_v is
  'The merchant dashboard''s read of its fleet. Deliberately narrow: no cash, no health band, no documents, no phone.';

-- ═══════════════════════════════════════ rider_app_me_v
--
-- Everything the rider app shows about itself, in one row, so the app
-- makes one request on a 3G connection rather than nine.

create or replace view public.rider_app_me_v
with (security_invoker = true) as
select
  r.id as rider_id,
  r.user_id,
  r.first_name,
  r.status,
  r.presence,
  r.vehicle,
  r.plate_no,
  r.city_id,
  c.name as city_name,

  r.can_receive_offers,
  r.offers_paused_reason,
  r.can_receive_offers_source,
  r.cooldown_until,
  r.cooldown_reason,

  r.pay_on_delivery_eligible,
  r.cash_on_hand,
  public.fn_rider_cash_cap(r.id) as cash_cap_effective,
  (select min(ce.created_at) from public.cash_event ce
    where ce.rider_id = r.id and ce.kind = 'collected'
      and ce.created_at > coalesce(
        (select max(x.created_at) from public.cash_event x
          where x.rider_id = r.id and x.kind = 'deposit'), '-infinity'::timestamptz))
    as oldest_undeposited_at,

  r.health_band,
  r.health_score,
  r.top_decile,

  (select coalesce(jsonb_agg(jsonb_build_object(
      'level', st.level, 'reason', st.reason, 'expires_at', st.expires_at))
      , '[]'::jsonb)
    from public.rider_strike st
    where st.rider_id = r.id and st.cleared_at is null) as active_strikes,

  (select count(*) from public.incident i
    where i.rider_id = r.id and i.status in ('open', 'investigating')) as open_incidents,

  d.expiring as documents_expiring,
  d.expired as documents_expired,

  /* The agreement they have not accepted yet, if there is one. Going
     online is blocked on this, so the app needs it in the same row. */
  (select v.id from public.rider_agreement_version v
    where v.status = 'current'
      and not exists (
        select 1 from public.rider_agreement_acceptance a
        where a.rider_id = r.id and a.agreement_version_id = v.id))
    as agreement_to_accept,

  (select coalesce(jsonb_agg(jsonb_build_object(
      'date', sc.date, 'window', sc.time_window, 'zone_id', sc.zone_id, 'status', sc.status)
      order by sc.date), '[]'::jsonb)
    from public.shift_commitment sc
    where sc.rider_id = r.id and sc.date >= current_date and sc.status = 'committed')
    as shifts,

  (select row_to_json(rc) from public.rider_rate_card rc
    where rc.city_id = r.city_id and rc.status = 'current') as rate_card,

  (select coalesce(jsonb_agg(jsonb_build_object('key', b.key, 'params', b.params))
      , '[]'::jsonb)
    from public.rider_bonus_rule b
    where b.enabled
      and (b.city_id is null or b.city_id = r.city_id)
      and (b.expires_at is null or b.expires_at > now())) as live_bonuses,

  /* Earnings and the settlement estimate come from the orders domain,
     which does not exist. Null, so the app shows [—]. */
  null::bigint as earnings_today_kes,
  null::bigint as earnings_week_kes,
  (select l.net_pay_kes from public.rider_settlement_line l
    join public.rider_settlement_run run on run.id = l.run_id
    where l.rider_id = r.id and run.status in ('draft', 'awaiting_approval')
    order by run.period_end desc limit 1) as next_settlement_kes

from public.rider r
left join public.city c on c.id = r.city_id
left join lateral public.fn_rider_document_state(r.id) d on true
where r.user_id = (select auth.uid());

comment on view public.rider_app_me_v is
  'One row, one request. The rider app runs on a mid-range Android over 3G; nine round trips to render a home screen is not a design, it is a tax.';

-- ═══════════════════════════════════════════════ tab counts

create or replace function public.rpc_rider_console_counts()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select to_jsonb(b) from public.console_rider_badges_v b
$$;

grant execute on function public.rpc_rider_console_counts() to authenticated;
