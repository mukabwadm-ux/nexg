-- Featured slots · eligibility, and the read contracts.
--
-- `fn_featured_eligibility` is the heart of this module. It answers
-- one question — may this merchant hold this placement — and returns
-- not just yes or no but the reason and the remedy for every failing
-- check, because that same text is what the merchant is shown. One
-- function, so the console, the dashboard and the nightly cron cannot
-- disagree about why somebody is blocked.

-- ═══════════════════════════════════════════════ eligibility

/*
 * Consecutive green days, counted backwards from the most recent
 * snapshot. An amber day resets it — "30 of the last 30" is a
 * different and much weaker claim than "30 in a row", and the weaker
 * one would put a merchant who is amber every Friday on the homepage.
 */
create or replace function public.fn_health_green_streak(p_merchant_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  with ordered as (
    select band, as_of,
           row_number() over (order by as_of desc) as n
    from public.merchant_health_snapshot
    where merchant_id = p_merchant_id
  ),
  broken as (
    select min(n) as first_bad from ordered where band is distinct from 'green'
  )
  select coalesce(
    (select first_bad - 1 from broken where first_bad is not null),
    (select count(*)::integer from ordered)
  )
$$;

create or replace function public.fn_featured_eligibility(
  p_merchant_id uuid,
  p_placement_kind public.placement_kind,
  p_category public.merchant_category default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_merchant public.merchant;
  v_live_days integer;
  v_need_live integer;
  v_need_green integer;
  v_need_settlement boolean;
  v_green integer;
  v_disputes integer;
  v_settlement boolean;
  v_holding boolean;
  v_checks jsonb;
begin
  select * into v_merchant from public.merchant where id = p_merchant_id;
  if v_merchant.id is null then
    return jsonb_build_object('passed', false, 'checks', '{}'::jsonb);
  end if;

  select (value #>> '{}')::integer into v_need_live
  from public.featured_rule where key = 'eligibility.live_days';
  select (value #>> '{}')::integer into v_need_green
  from public.featured_rule where key = 'eligibility.health_green_days';
  select (value #>> '{}')::boolean into v_need_settlement
  from public.featured_rule where key = 'eligibility.require_settlement_verified';

  v_live_days := case when v_merchant.went_live_at is null then 0
    else floor(extract(epoch from (now() - v_merchant.went_live_at)) / 86400)::integer end;

  v_green := public.fn_health_green_streak(p_merchant_id);

  select count(*)::integer into v_disputes from public.dispute d
  where d.merchant_id = p_merchant_id and d.status in ('open', 'awaiting_merchant');

  v_settlement := coalesce((v_merchant.payout_name_lookup ->> 'matched')::boolean, false);

  v_holding := exists (
    select 1 from public.featured_booking b
    where b.merchant_id = p_merchant_id
      and b.placement_kind = p_placement_kind
      and b.category is not distinct from p_category
      and b.status in ('booked', 'live')
  );

  /*
   * The reason text is the product here. "Not eligible" tells a
   * merchant nothing; "Live 12 d — eligible in 18 d" tells them when
   * to come back.
   */
  v_checks := jsonb_build_object(
    'live_30d', jsonb_build_object(
      'passed', v_merchant.status = 'live' and v_live_days >= v_need_live,
      'value', v_live_days,
      'reason', case
        when v_merchant.status <> 'live' then 'Not live on NexG yet'
        when v_live_days >= v_need_live then 'Live on NexG ' || v_live_days || ' days'
        else 'Live ' || v_live_days || ' d — eligible in ' || (v_need_live - v_live_days) || ' d'
      end),

    'health_green_30d', jsonb_build_object(
      'passed', v_green >= v_need_green,
      'value', v_green,
      'reason', case
        when v_merchant.health_band is null then 'No health score yet'
        when v_green >= v_need_green then 'Health green for ' || v_green || ' consecutive days'
        else 'Health ' || coalesce(v_merchant.health_band::text, 'unscored') || ' — needs '
             || v_need_green || ' consecutive green days, has ' || v_green
      end),

    'no_open_disputes', jsonb_build_object(
      'passed', v_disputes = 0,
      'value', v_disputes,
      'reason', case when v_disputes = 0 then 'No open disputes'
        else v_disputes || ' open dispute' || case when v_disputes = 1 then '' else 's' end
             || ' — resolve first' end),

    'settlement_verified', jsonb_build_object(
      'passed', (not v_need_settlement) or v_settlement,
      'value', v_settlement,
      'reason', case when v_settlement then 'Settlement account verified'
        else 'Settlement account not verified — we cannot bill the weekly fee' end),

    'not_holding_placement', jsonb_build_object(
      'passed', not v_holding,
      'value', v_holding,
      'reason', case when v_holding then 'Already holds this placement'
        else 'Not already holding this placement' end)
  );

  return jsonb_build_object(
    'passed', (
      (v_checks -> 'live_30d' ->> 'passed')::boolean
      and (v_checks -> 'health_green_30d' ->> 'passed')::boolean
      and (v_checks -> 'no_open_disputes' ->> 'passed')::boolean
      and (v_checks -> 'settlement_verified' ->> 'passed')::boolean
      and (v_checks -> 'not_holding_placement' ->> 'passed')::boolean
    ),
    'checks', v_checks,
    'checked_at', now()
  );
end;
$$;

comment on function public.fn_featured_eligibility(uuid, public.placement_kind, public.merchant_category) is
  'One function, five checks, a reason and a remedy for each. The console, the merchant dashboard and the nightly cron all call this, so they cannot disagree about why somebody is blocked.';

/* The rate-card price for a placement, or null if nobody has set one. */
create or replace function public.fn_featured_price(
  p_city_id uuid,
  p_kind public.placement_kind,
  p_category public.merchant_category default null,
  p_at date default current_date
)
returns bigint
language sql
stable
set search_path = ''
as $$
  select (case p_kind
    when 'homepage' then nullif(rc.prices -> 'homepage', 'null'::jsonb)
    when 'popular_request' then nullif(rc.prices -> 'popular_request', 'null'::jsonb)
    else coalesce(
      nullif(rc.prices -> 'category_top' -> 'overrides' -> p_category::text, 'null'::jsonb),
      nullif(rc.prices -> 'category_top' -> 'default', 'null'::jsonb))
  end #>> '{}')::bigint
  from public.featured_rate_card rc
  where rc.city_id = p_city_id
    and rc.status in ('current', 'scheduled')
    and rc.effective_from <= p_at
  order by rc.effective_from desc
  limit 1
$$;

comment on function public.fn_featured_price(uuid, public.placement_kind, public.merchant_category, date) is
  'Null means no price has been agreed for this placement, and the quote RPC refuses. Staff never type a price.';

-- ═══════════════════════════════════ what the guest site reads

/*
 * The only thing the guest site reads.
 *
 * A featured card appears only when all of these hold: the slot week
 * is live, the creative is approved, and the merchant is still in
 * merchant_public. The last one matters most — a merchant suspended on
 * Wednesday stops being featured on Wednesday, not on Monday.
 *
 * A closed merchant still shows, with its closed state. A guest can
 * see that the place we put at the top is shut; hiding that would be
 * the dishonest version.
 */
create or replace view public.featured_live_v
with (security_invoker = false) as
select
  p.city_id,
  mp.city_slug,
  p.kind,
  p.category,
  p.position,
  b.id as booking_id,
  b.merchant_id,
  mp.trading_name,
  mp.category as merchant_category,
  mp.branch_name,
  coalesce(cr.cover_photo_path, mp.cover_photo_path) as cover_photo_path,
  cr.blurb,
  ci.name as pinned_item_name,
  ci.price_kes as pinned_item_price,
  ci.id as pinned_item_id,
  mp.accepting_orders,
  mp.opens_today,
  mp.closes_today,
  mp.closed_today,
  mp.prep_minutes,
  mp.branch_latitude,
  mp.branch_longitude,
  'SPONSORED'::text as badge,
  (sw.week_start + 4) as valid_to
from public.featured_slot_week sw
join public.featured_placement p on p.id = sw.placement_id
join public.featured_booking b on b.id = sw.booking_id
join public.merchant_public mp on mp.id = b.merchant_id
left join public.featured_creative cr
  on cr.booking_id = b.id and cr.status = 'approved'
left join public.catalogue_item ci on ci.id = cr.pinned_item_id
where sw.status = 'live'
  and sw.week_start <= current_date
  and current_date <= sw.week_start + 6
  and p.enabled
  and cr.id is not null;

grant select on public.featured_live_v to anon, authenticated;

comment on view public.featured_live_v is
  'Every surface reads this and every row carries badge = SPONSORED, so there is no code path that renders a paid card without the label. A merchant missing from merchant_public is simply absent — the band renders nothing rather than an empty box.';

-- ═══════════════════════════════════════════════ the console

create or replace view public.console_featured_inventory_v
with (security_invoker = true) as
select
  p.id as placement_id,
  p.city_id,
  c.name as city_name,
  p.kind,
  p.category,
  p.position,
  p.label,
  p.description,
  p.enabled,
  sw.week_start,
  sw.status as slot_status,
  sw.price,
  b.id as booking_id,
  b.merchant_id,
  m.trading_name,
  m.category as merchant_category,
  b.status as booking_status,
  b.end_date,
  b.auto_renew,
  b.pause_reason,
  b.hold_expires_at,
  public.fn_featured_price(p.city_id, p.kind, p.category) as rate_card_price
from public.featured_placement p
left join public.city c on c.id = p.city_id
left join public.featured_slot_week sw on sw.placement_id = p.id
left join public.featured_booking b on b.id = sw.booking_id
left join public.merchant m on m.id = b.merchant_id;

create or replace view public.console_featured_requests_v
with (security_invoker = true) as
select
  b.id,
  b.merchant_id,
  m.trading_name,
  m.category as merchant_category,
  m.status as merchant_status,
  m.health_band,
  public.fn_health_green_streak(b.merchant_id) as health_green_days,
  m.went_live_at,
  b.placement_kind,
  b.category,
  b.city_id,
  c.name as city_name,
  b.status,
  b.requested_via,
  b.requested_at,
  b.wanted_start,
  b.weeks,
  b.auto_renew,
  b.eligibility,
  (b.eligibility ->> 'passed')::boolean as eligible,
  b.waitlist_rank,
  b.quote_expires_at,
  b.hold_expires_at,
  b.quoted_price,
  b.start_date,
  b.end_date,
  b.renews_at,
  b.declined_reason,
  floor(extract(epoch from (now() - b.requested_at)) / 86400)::integer as waiting_days,
  case
    when b.quote_expires_at is not null and b.status = 'quoted'
      then greatest(0, floor(extract(epoch from (b.quote_expires_at - now())) / 3600))::integer
  end as quote_hours_left,
  public.fn_featured_price(b.city_id, b.placement_kind, b.category) as rate_card_price,
  /* The stage pill, worked out once. */
  case
    when b.status = 'declined' then 'DECLINED'
    when b.status = 'quoted' then 'QUOTED'
    when b.status in ('booked', 'live') then 'BOOKED'
    when b.status = 'waitlisted' then 'WAITLIST'
    when (b.eligibility ->> 'passed')::boolean then 'ELIGIBLE'
    when not coalesce((b.eligibility -> 'checks' -> 'health_green_30d' ->> 'passed')::boolean, true)
      or not coalesce((b.eligibility -> 'checks' -> 'no_open_disputes' ->> 'passed')::boolean, true)
      then 'BLOCKED'
    else 'NOT_YET'
  end as stage,
  /* For NOT YET, how long until they qualify. */
  greatest(
    0,
    coalesce((select (value #>> '{}')::integer from public.featured_rule
              where key = 'eligibility.live_days'), 30)
      - coalesce((b.eligibility -> 'checks' -> 'live_30d' ->> 'value')::integer, 0)
  ) as days_until_live_30d
from public.featured_booking b
join public.merchant m on m.id = b.merchant_id
left join public.city c on c.id = b.city_id;

create or replace view public.console_featured_schedule_v
with (security_invoker = true) as
select
  sw.placement_id,
  p.city_id,
  p.kind,
  p.category,
  p.position,
  p.label,
  sw.week_start,
  sw.status,
  sw.price,
  sw.booking_id,
  m.trading_name
from public.featured_slot_week sw
join public.featured_placement p on p.id = sw.placement_id
left join public.featured_booking b on b.id = sw.booking_id
left join public.merchant m on m.id = b.merchant_id;

create or replace view public.console_featured_performance_v
with (security_invoker = true) as
select
  b.id as booking_id,
  b.merchant_id,
  m.trading_name,
  b.city_id,
  p.label as placement_label,
  p.kind,
  p.category,
  fl.week_start,
  coalesce(sum(md.views), 0)::integer as views,
  coalesce(sum(md.taps), 0)::integer as taps,
  coalesce(sum(md.orders), 0)::integer as orders,
  coalesce(sum(md.order_value), 0) as order_value,
  /* Computed from the totals, not averaged from the daily rates —
     averaging a ratio over days with no views gives nonsense. */
  case when coalesce(sum(md.views), 0) > 0
    then round(sum(md.taps)::numeric / sum(md.views), 4) end as ctr,
  case when coalesce(sum(md.taps), 0) > 0
    then round(sum(md.orders)::numeric / sum(md.taps), 4) end as conversion,
  fl.fee_ex_vat,
  fl.vat,
  fl.fee_total,
  fl.status as fee_status,
  fl.days_live,
  fl.pro_rata,
  fl.id as fee_line_id
from public.featured_booking b
join public.merchant m on m.id = b.merchant_id
left join public.featured_placement p on p.id = b.placement_id
left join public.featured_fee_line fl on fl.booking_id = b.id
left join public.featured_metrics_daily md
  on md.booking_id = b.id
 and fl.week_start is not null
 and md.day >= fl.week_start and md.day < fl.week_start + 7
group by b.id, m.trading_name, p.label, p.kind, p.category, fl.week_start,
         fl.fee_ex_vat, fl.vat, fl.fee_total, fl.status, fl.days_live, fl.pro_rata, fl.id;

create or replace view public.console_featured_badges_v
with (security_invoker = true) as
select
  (select count(*) from public.featured_booking
    where status in ('requested', 'waitlisted')) as open_requests,
  (select count(*) from public.featured_booking
    where status in ('requested', 'waitlisted')
      and (eligibility ->> 'passed')::boolean) as eligible_now,
  (select count(*) from public.featured_booking
    where status in ('requested', 'waitlisted')
      and not coalesce(
        (eligibility -> 'checks' -> 'health_green_30d' ->> 'passed')::boolean, true))
    as blocked_by_health,
  (select count(*) from public.featured_booking where status = 'quoted') as quoted,
  (select count(*) from public.featured_booking
    where status = 'quoted' and quote_expires_at < now() + interval '12 hours')
    as quotes_expiring,
  (select count(*) from public.featured_booking where status = 'auto_paused') as auto_paused,
  (select count(*) from public.featured_booking where status = 'live') as live,
  (select count(*) from public.featured_creative where status = 'pending_review')
    as creatives_pending,
  (select count(*) from public.featured_fee_line where status = 'pro_rata_review')
    as pro_rata_reviews,
  (select count(*) from public.featured_slot_week
    where status = 'open' and week_start = date_trunc('week', now())::date) as open_this_week,
  (select count(*) from public.featured_slot_week
    where week_start = date_trunc('week', now())::date) as slots_this_week,
  /* A city with placements enabled but no price cannot be sold at
     all, which is worth a badge rather than a surprise at quote time. */
  (select count(*) from public.city c
    where c.status = 'live'
      and public.fn_featured_price(c.id, 'homepage') is null) as cities_without_prices;

create or replace function public.rpc_featured_counts()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select to_jsonb(b) from public.console_featured_badges_v b
$$;

-- ═══════════════════════════════ what the merchant reads

create or replace view public.merchant_featured_v
with (security_invoker = true) as
select
  b.id as booking_id,
  b.merchant_id,
  b.placement_kind,
  b.category,
  b.city_id,
  b.status,
  b.eligibility,
  b.waitlist_rank,
  b.weeks,
  b.auto_renew,
  b.wanted_start,
  b.start_date,
  b.end_date,
  b.renews_at,
  b.quoted_price,
  b.quote_expires_at,
  b.declined_reason,
  b.pause_reason,
  p.label as placement_label,
  cr.status as creative_status,
  cr.blurb,
  cr.rejection_reason,
  (select coalesce(sum(views), 0)::integer from public.featured_metrics_daily md
    where md.booking_id = b.id
      and md.day >= date_trunc('week', now())::date) as views_this_week,
  (select coalesce(sum(taps), 0)::integer from public.featured_metrics_daily md
    where md.booking_id = b.id
      and md.day >= date_trunc('week', now())::date) as taps_this_week,
  (select coalesce(sum(orders), 0)::integer from public.featured_metrics_daily md
    where md.booking_id = b.id
      and md.day >= date_trunc('week', now())::date) as orders_this_week
from public.featured_booking b
left join public.featured_placement p on p.id = b.placement_id
left join public.featured_creative cr
  on cr.booking_id = b.id and cr.status in ('approved', 'pending_review', 'rejected', 'draft');

grant execute on function public.fn_featured_eligibility(uuid, public.placement_kind, public.merchant_category) to authenticated, service_role;
grant execute on function public.fn_health_green_streak(uuid) to authenticated, service_role;
grant execute on function public.fn_featured_price(uuid, public.placement_kind, public.merchant_category, date) to authenticated, service_role;
grant execute on function public.rpc_featured_counts() to authenticated;
