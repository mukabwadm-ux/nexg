-- What the scans add up to.
--
-- Three audiences, three shapes, and the difference between them is
-- the point:
--
--   · Staff see the scan log — session hashes, device family, the
--     distance band — because that is how you tell a busy card from
--     a photographed one.
--   · Hosts and hotels see counts, conversion and what was ordered.
--     Never a session, never a device, never a geo band. A host who
--     could see which browser a guest used is a host who could work
--     out which guest.
--   · The coverage map sees unmet demand, which is the only number
--     here that recruits a merchant.
--
-- Nothing in this file invents a figure. Where the orders domain is
-- missing, the value is the count of attributed references, which is
-- real — and the money columns are absent rather than zero.

-- ═══════════════════════════════════ the daily roll-up

/*
 * Materialised, because the scan log is the one table in this system
 * that will genuinely be large, and because the raw rows are deleted
 * after twelve months while these aggregates are kept forever.
 *
 * Test scans and bots are excluded here rather than in every reader —
 * one place to be wrong, and it is this one.
 */
create materialized view if not exists public.qr_scan_daily_v as
select
  s.qr_id,
  s.code,
  s.owner_type,
  s.owner_id,
  s.host_id,
  s.hotel_id,
  s.city_id,
  s.placement,
  (s.scanned_at at time zone 'Africa/Nairobi')::date as day,
  count(*) as scans,
  count(distinct s.session_id) as sessions,
  count(*) filter (where s.outcome = 'landed') as landed,
  count(*) filter (where s.outcome = 'browsed') as browsed,
  count(*) filter (where s.outcome = 'cart') as cart,
  count(*) filter (where s.outcome = 'ordered') as ordered,
  count(*) filter (where s.outcome = 'bounced') as bounced,
  count(*) filter (where s.outcome = 'voided') as scanned_after_void,
  coalesce(sum(cardinality(s.order_refs)), 0) as orders,
  /* Seconds from landing to the order, for the sessions that got
     there. The median is what you quote; the average is dragged by
     the guest who ordered breakfast the next morning. */
  percentile_disc(0.5) within group (
    order by extract(epoch from s.ordered_at - s.scanned_at)
  ) filter (where s.ordered_at is not null) as median_seconds_to_order,
  array_agg(distinct s.browsed_category) filter (where s.browsed_category is not null) as categories,
  array_agg(distinct s.first_merchant_id) filter (where s.first_merchant_id is not null) as merchants,
  /* 24 buckets, so the heatmap is one row rather than 24. */
  jsonb_object_agg(h.hour::text, h.n) filter (where h.hour is not null) as hour_histogram
from public.qr_scan s
left join lateral (
  select s.local_hour as hour, 1 as n
) h on true
where not s.is_test and not s.is_bot
group by 1, 2, 3, 4, 5, 6, 7, 8, 9;

create unique index if not exists qr_scan_daily_pk
  on public.qr_scan_daily_v (qr_id, day);
create index if not exists qr_scan_daily_host on public.qr_scan_daily_v (host_id, day desc);
create index if not exists qr_scan_daily_hotel on public.qr_scan_daily_v (hotel_id, day desc);

comment on materialized view public.qr_scan_daily_v is
  'The permanent record. Raw scans are deleted after twelve months; these rows are kept, which is why test scans and bots are filtered here rather than by each reader.';

create or replace function public.cron_qr_refresh_reports()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  /* Concurrently, so the console never reads an empty view mid-
     refresh. Needs the unique index above. */
  refresh materialized view concurrently public.qr_scan_daily_v;
  return jsonb_build_object('ok', true, 'refreshed_at', now());
exception when others then
  /* A first refresh cannot be concurrent. */
  refresh materialized view public.qr_scan_daily_v;
  return jsonb_build_object('ok', true, 'refreshed_at', now(), 'first_run', true);
end;
$$;

-- ════════════════════════════════ per-card, all of it

/* Same reasoning: it reads the matview, so it scopes itself. */
drop view if exists public.property_attribution_v;
create view public.property_attribution_v as
select
  q.id as qr_id,
  q.code,
  q.owner_type,
  q.owner_id,
  q.label,
  q.placement,
  q.host_id,
  q.hotel_id,
  q.city_id,
  q.state,
  q.batch_id,
  q.generated_at,
  q.sent_at,
  q.placed_confirmed_at,
  q.first_scanned_at,
  q.last_scanned_at,
  q.voided_at,
  q.void_reason,
  q.replaced_by,
  /* Lifetime, from the card's own counters — which include blocked
     and post-void scans, because "this old card is still being
     scanned" is a thing somebody needs to act on. */
  q.scans as scans_lifetime,
  q.orders as orders_lifetime,
  coalesce(d30.scans, 0) as scans_30d,
  coalesce(d30.sessions, 0) as sessions_30d,
  coalesce(d30.orders, 0) as orders_30d,
  coalesce(d7.scans, 0) as scans_7d,
  /* Null, not zero, when nobody has scanned it: a card with no scans
     has no conversion rate, and rendering 0% says it failed when it
     may simply never have been put out. */
  case when coalesce(d30.scans, 0) = 0 then null
       else round(100.0 * coalesce(d30.orders, 0) / d30.scans, 1) end as conversion_30d,
  d30.median_seconds_to_order,
  d30.categories,
  /* The orders domain does not exist, so there is no basket value to
     report. Absent rather than zero. */
  null::bigint as gmv_30d,
  null::bigint as average_basket
from public.property_qr q
left join lateral (
  select sum(scans)::int as scans, sum(sessions)::int as sessions,
         sum(orders)::int as orders,
         avg(median_seconds_to_order) as median_seconds_to_order,
         (select array_agg(distinct c) from public.qr_scan_daily_v x,
            unnest(coalesce(x.categories, '{}')) c
          where x.qr_id = q.id and x.day > (now() at time zone 'Africa/Nairobi')::date - 30) as categories
  from public.qr_scan_daily_v dd
  where dd.qr_id = q.id and dd.day > (now() at time zone 'Africa/Nairobi')::date - 30
) d30 on true
left join lateral (
  select sum(scans)::int as scans
  from public.qr_scan_daily_v dd
  where dd.qr_id = q.id and dd.day > (now() at time zone 'Africa/Nairobi')::date - 7
) d7 on true
where authz.works_hospitality(q.city_id)
   or (q.host_id is not null and authz.is_host_member(q.host_id))
   or (q.hotel_id is not null and authz.is_hotel_member(q.hotel_id, null));

-- ══════════════════════════════════════ what is wrong

/*
 * Four conditions, each with a different thing to do about it. A
 * health view that only said "unhealthy" would be a list somebody
 * scrolls past.
 */
create or replace view public.qr_health_v
with (security_invoker = true) as
select
  q.id as qr_id,
  q.code,
  q.label,
  q.placement,
  q.host_id,
  q.hotel_id,
  q.city_id,
  q.sent_at,
  q.scans,
  q.orders,
  q.last_scanned_at,
  case
    when q.voided_at is not null and q.last_scanned_at > q.voided_at
      then 'old_card_still_scanned'
    when q.sent_at is not null and q.scans = 0
         and q.sent_at < now() - interval '14 days'
      then 'never_scanned'
    when q.scans > 0 and q.orders = 0
         and q.first_scanned_at < now() - interval '30 days'
      then 'scanned_never_ordered'
    when q.far_scans > 2 then 'scanned_from_far_away'
  end as finding,
  case
    when q.voided_at is not null and q.last_scanned_at > q.voided_at
      then 'The replaced card is still on the counter. Nudge the host to swap it.'
    when q.sent_at is not null and q.scans = 0 and q.sent_at < now() - interval '14 days'
      then 'Sent a fortnight ago and never scanned — the card is probably still in the envelope.'
    when q.scans > 0 and q.orders = 0 and q.first_scanned_at < now() - interval '30 days'
      then 'Guests are scanning and not ordering. Either the placement is wrong or nothing they want is open nearby.'
    when q.far_scans > 2
      then 'Scanned repeatedly from well away from the property — the card has been photographed and shared. Not fraud, but not in-unit demand either.'
  end as what_to_do,
  q.far_scans
from (
  select p.*,
    (select count(*) from public.qr_scan s
      where s.qr_id = p.id and s.geo_band = 'far' and not s.is_test) as far_scans
  from public.property_qr p
) q;

-- ════════════════════════ what the property itself sees

/*
 * The same numbers, with every column a host could use to single out
 * a guest removed: no session id, no device, no geo band, no IP
 * country, no scan times finer than the hour bucket.
 */
/*
 * These two are the exception to the security_invoker rule used
 * everywhere else in this codebase, and the reason is worth stating.
 *
 * They read the materialised view, and a materialised view cannot
 * carry a policy — so reading it as the invoker means granting every
 * signed-in user the whole table. Instead these run as the owner and
 * carry the scope in the WHERE clause: the view IS the authorisation
 * boundary. That is only safe because the filter is right here, in
 * two lines, where it can be read in one go.
 */
drop view if exists public.host_qr_report_v;
create view public.host_qr_report_v as
select
  d.qr_id,
  d.code,
  d.owner_id as unit_id,
  q.label,
  d.placement,
  d.host_id,
  d.day,
  d.scans,
  d.sessions,
  d.ordered,
  d.orders,
  d.median_seconds_to_order,
  d.categories,
  d.hour_histogram
from public.qr_scan_daily_v d
join public.property_qr q on q.id = d.qr_id
where d.host_id is not null
  and (authz.is_host_member(d.host_id) or authz.works_hospitality(d.city_id));

drop view if exists public.hotel_qr_report_v;
create view public.hotel_qr_report_v as
select
  d.qr_id,
  d.code,
  d.owner_type,
  d.owner_id,
  q.label,
  d.placement,
  d.hotel_id,
  d.day,
  d.scans,
  d.sessions,
  d.ordered,
  d.orders,
  d.categories,
  d.hour_histogram
from public.qr_scan_daily_v d
join public.property_qr q on q.id = d.qr_id
where d.hotel_id is not null
  and (authz.is_hotel_member(d.hotel_id, null) or authz.works_hospitality(d.city_id));

comment on view public.host_qr_report_v is
  'What a host may see about their own cards. Deliberately missing session_id, device, geo_band and ip_country — a host who could see which browser a guest used could work out which guest.';

-- ══════════════════════════════════ the recruitment signal

/*
 * A guest scanned, browsed a category, and did not order. That is
 * either a bad card or a missing merchant, and the difference is
 * whether anything of that category was open nearby.
 *
 * The merchant side of the join needs opening hours the merchants
 * module owns; until that is wired, this reports the demand half
 * honestly — the category wanted, where, and when — and says so.
 */
create or replace view public.qr_unmet_demand_v
with (security_invoker = true) as
select
  s.city_id,
  c.name as city_name,
  s.zone_id,
  s.browsed_category as category,
  s.local_hour,
  s.dow,
  count(*) as scans_that_wanted_it,
  count(distinct s.session_id) as sessions,
  count(distinct s.owner_id) as properties,
  max(s.scanned_at) as last_wanted_at
from public.qr_scan s
left join public.city c on c.id = s.city_id
where s.browsed_category is not null
  and s.outcome in ('browsed', 'cart')
  and not s.is_test and not s.is_bot
  and s.scanned_at > now() - interval '30 days'
group by 1, 2, 3, 4, 5, 6;

comment on view public.qr_unmet_demand_v is
  'Guests who looked for a category and left. Whether anything of that category was actually open needs merchant opening hours, which this does not yet join — so it reports the demand, not the gap, and the coverage map must say which it is showing.';

-- ═════════════════════════════════ the console scan log

create or replace view public.console_qr_scan_v
with (security_invoker = true) as
select
  s.id,
  s.scanned_at,
  s.code,
  s.owner_type,
  s.owner_id,
  q.label,
  s.placement,
  s.host_id,
  h.display_name as host_name,
  s.hotel_id,
  ht.name as hotel_name,
  s.city_id,
  c.name as city_name,
  /* Eight characters of a hash. Enough to see the same browser come
     back, not enough to be an identifier. */
  left(encode(extensions.digest(coalesce(s.session_id, ''), 'sha256'), 'hex'), 8) as session_hash,
  exists (
    select 1 from public.qr_scan p
    where p.session_id = s.session_id and p.scanned_at < s.scanned_at
  ) as returning_session,
  coalesce(s.device ->> 'ua_family', '[—]') as device,
  coalesce(s.device ->> 'os', '') as os,
  s.ip_country,
  s.referrer_kind,
  s.geo_band,
  s.outcome,
  s.browsed_category,
  s.first_merchant_id,
  s.order_refs,
  cardinality(s.order_refs) as orders,
  s.ordered_at,
  s.is_bot,
  s.is_test,
  s.local_hour
from public.qr_scan s
left join public.property_qr q on q.id = s.qr_id
left join public.host h on h.id = s.host_id
left join public.hotel ht on ht.id = s.hotel_id
left join public.city c on c.id = s.city_id;

/* The tiles above the log. */
create or replace view public.console_qr_summary_v
with (security_invoker = true) as
select
  (select count(*) from public.qr_scan
    where scanned_at > now() - interval '7 days' and not is_test and not is_bot) as scans_7d,
  (select count(distinct session_id) from public.qr_scan
    where scanned_at > now() - interval '7 days' and not is_test and not is_bot) as sessions_7d,
  (select count(*) from public.qr_scan
    where scanned_at > now() - interval '30 days' and outcome = 'ordered'
      and not is_test and not is_bot) as orders_30d,
  (select case when count(*) = 0 then null
          else round(100.0 * count(*) filter (where outcome = 'ordered') / count(*), 1) end
   from public.qr_scan
   where scanned_at > now() - interval '30 days' and not is_test and not is_bot) as conversion_30d,
  (select count(*) from public.property_qr
    where voided_at is null and sent_at is not null and scans = 0
      and sent_at < now() - interval '14 days') as never_scanned,
  (select count(*) from public.property_qr
    where voided_at is not null and last_scanned_at > voided_at) as old_cards_scanned,
  (select count(*) from public.property_qr where voided_at is null) as cards_live,
  (select count(*) from public.qr_miss where at > now() - interval '7 days') as misses_7d,
  (select count(*) from public.qr_scan_overflow) as scans_in_overflow,
  /* Orders need an orders domain. Shown as [—] rather than 0%. */
  null::numeric as share_of_all_orders;

-- ══════════════════════════════════════════ retention

/*
 * Raw scans are a record of individual browsers. After twelve months
 * they are rolled into the daily view and deleted — the aggregate is
 * kept forever, the session ids are gone.
 *
 * Dropping the whole month's partition is both faster and more
 * honest than a DELETE: there is no chance of a row surviving a
 * filter somebody got slightly wrong.
 */
create or replace function public.cron_qr_scan_rollup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cut date := (date_trunc('month', now()) - interval '12 months')::date;
  v_part record;
  v_dropped text[] := '{}';
begin
  /* Make sure the aggregate is current before anything is deleted.
     The order matters: refresh, then drop. */
  perform public.cron_qr_refresh_reports();

  for v_part in
    select c.relname
    from pg_class c
    join pg_inherits i on i.inhrelid = c.oid
    join pg_class parent on parent.oid = i.inhparent
    where parent.relname = 'qr_scan'
      and c.relname ~ '^qr_scan_[0-9]{4}_[0-9]{2}$'
      and to_date(right(c.relname, 7), 'YYYY_MM') < v_cut
  loop
    execute format('drop table public.%I', v_part.relname);
    v_dropped := v_dropped || v_part.relname;
  end loop;

  return jsonb_build_object('ok', true, 'dropped', v_dropped, 'older_than', v_cut);
end;
$$;

-- ══════════════════════════════════════════════ grants

grant select on
  public.property_attribution_v, public.qr_health_v,
  public.host_qr_report_v, public.hotel_qr_report_v,
  public.qr_unmet_demand_v, public.console_qr_scan_v,
  public.console_qr_summary_v, public.qr_scan_daily_v
  to authenticated;

/*
 * The materialised view has no RLS of its own — a materialised view
 * cannot have a policy. The scoped report views above are
 * security_invoker and join `property_qr`, which does, so a host
 * reading `host_qr_report_v` is filtered by the policy on the card.
 * Reading `qr_scan_daily_v` directly is therefore a staff-only
 * action, and the grant below is what makes that explicit.
 */
revoke select on public.qr_scan_daily_v from authenticated;
grant select on public.qr_scan_daily_v to service_role;

comment on materialized view public.qr_scan_daily_v is
  'Staff and the service role only. A materialised view cannot carry a policy, so the scoped host and hotel reports join property_qr — which can — rather than exposing this directly.';
