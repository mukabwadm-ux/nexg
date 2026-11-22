/*
 * Merchants → Performance: sales, commission, orders, active merchants and
 * ratings for a period, against the same number of days before it, with a
 * daily line, the split by category and every merchant that sold.
 *
 *   Sales (GMV)     the item subtotal of orders placed in the period that
 *                   were not cancelled, refunded or disputed (order.stage),
 *                   as the merchant's own Performance tab counts them.
 *                   Delivery and service fees are NexG's, not sales.
 *   Commission      order.commission_cents without its VAT (16%, as the
 *                   ledger splits it with ledger.fn_vat_part): NexG's revenue.
 *   Orders          those orders.
 *   Active          merchants live at the end of the period, against those
 *                   live at its start, read from merchant_status_change (the
 *                   last change before the moment), else went_live_at.
 *   Rating          average order_rating stars in the period; null when
 *                   there are none (nothing writes ratings yet).
 *
 * Stays belong to hosts, not merchants, and are not counted here.
 *
 * Access: people who reach Merchants see the merchants they may work
 * (authz.works_merchant); finance readers and super admins see all.
 *
 * Rollback:
 *   drop function if exists public.rpc_merchant_performance(date, date, text[]);
 */

create or replace function public.rpc_merchant_performance(
  p_from date,
  p_to date,
  p_keys text[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_pfrom date;
  v_all boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_pstart timestamptz;
  v_result jsonb;
begin
  if not (authz.is_super_admin() or authz.reaches_module('merchants') or authz.finance_reads()) then
    raise exception 'Only people who reach Merchants or Finance can see this.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose a period that starts before it ends.' using errcode = '22023';
  end if;
  v_days := (p_to - p_from) + 1;
  if v_days > 400 then
    raise exception 'Choose a period of 400 days or less.' using errcode = '22023';
  end if;

  v_pfrom := p_from - v_days;
  v_all := authz.is_super_admin() or authz.finance_reads();
  v_start := p_from::timestamp at time zone 'Africa/Nairobi';
  v_end := least(now(), (p_to + 1)::timestamp at time zone 'Africa/Nairobi');
  v_pstart := v_pfrom::timestamp at time zone 'Africa/Nairobi';

  with scope as (
    select
      m.id,
      coalesce(nullif(trim(m.trading_name), ''), m.legal_name) as name,
      coalesce(nullif(m.category_key, ''), m.category::text) as ckey,
      m.category_other,
      m.cover_photo_path,
      m.city_id,
      m.went_live_at,
      m.deleted_at
    from public.merchant m
    where (v_all or authz.works_merchant(m.id))
      and (p_keys is null or coalesce(nullif(m.category_key, ''), m.category::text) = any (p_keys))
  ),
  o as (
    select
      o.merchant_id,
      (o.placed_at at time zone 'Africa/Nairobi')::date as day,
      o.subtotal_cents::bigint as gmv,
      (coalesce(o.commission_cents, 0) - ledger.fn_vat_part(coalesce(o.commission_cents, 0)::bigint))::bigint as comm
    from public.order o
    join scope s on s.id = o.merchant_id
    where o.placed_at >= v_pstart
      and o.placed_at < (p_to + 1)::timestamp at time zone 'Africa/Nairobi'
      and o.stage not in ('cancelled', 'refunded', 'disputed')
  ),
  cur as (select * from o where o.day >= p_from),
  prev as (select * from o where o.day < p_from),
  rated as (
    select r.merchant_id, r.stars, r.created_at >= v_start as is_cur
    from public.order_rating r
    join scope s on s.id = r.merchant_id
    where r.created_at >= v_pstart and r.created_at < v_end
  ),
  live_at as (
    select
      count(*) filter (where coalesce(
        (select c.to_status::text from public.merchant_status_change c
          where c.merchant_id = s.id and c.created_at < v_end order by c.created_at desc limit 1),
        case when s.went_live_at < v_end then 'live' end) = 'live'
        and (s.deleted_at is null or s.deleted_at >= v_end)) as at_end,
      count(*) filter (where coalesce(
        (select c.to_status::text from public.merchant_status_change c
          where c.merchant_id = s.id and c.created_at < v_start order by c.created_at desc limit 1),
        case when s.went_live_at < v_start then 'live' end) = 'live'
        and (s.deleted_at is null or s.deleted_at >= v_start)) as at_start
    from scope s
  ),
  per as (
    select
      s.id,
      s.name,
      s.ckey,
      case
        when s.ckey = 'other' and nullif(trim(s.category_other), '') is not null then trim(s.category_other)
        else public.fn_merchant_category_label(s.ckey)
      end as category_label,
      s.cover_photo_path,
      (select coalesce(sum(c.gmv), 0) from cur c where c.merchant_id = s.id) as gmv,
      (select coalesce(sum(c.comm), 0) from cur c where c.merchant_id = s.id) as comm,
      (select count(*) from cur c where c.merchant_id = s.id) as orders,
      (select coalesce(sum(p.gmv), 0) from prev p where p.merchant_id = s.id) as prev_gmv,
      (select round(avg(r.stars)::numeric, 1) from rated r where r.merchant_id = s.id and r.is_cur) as rating,
      (select count(*) from rated r where r.merchant_id = s.id and r.is_cur) as ratings
    from scope s
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'gmv', jsonb_build_object('now', (select coalesce(sum(gmv), 0) from cur), 'before', (select coalesce(sum(gmv), 0) from prev)),
      'commission', jsonb_build_object('now', (select coalesce(sum(comm), 0) from cur), 'before', (select coalesce(sum(comm), 0) from prev)),
      'orders', jsonb_build_object('now', (select count(*) from cur), 'before', (select count(*) from prev)),
      'active', jsonb_build_object('now', (select at_end from live_at), 'before', (select at_start from live_at)),
      'rating', jsonb_build_object(
        'now', (select round(avg(stars)::numeric, 2) from rated where is_cur),
        'before', (select round(avg(stars)::numeric, 2) from rated where not is_cur),
        'count', (select count(*) from rated where is_cur))
    ),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', d.day::text,
        'gmv', (select coalesce(sum(c.gmv), 0) from cur c where c.day = d.day),
        'commission', (select coalesce(sum(c.comm), 0) from cur c where c.day = d.day)
      ) order by d.day)
      from (select generate_series(p_from, p_to, interval '1 day')::date as day) d
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.ckey, 'label', x.label, 'gmv', x.gmv, 'commission', x.comm,
                                          'prev_gmv', x.prev_gmv) order by x.gmv desc)
      from (
        select p.ckey, min(p.category_label) as label, sum(p.gmv) as gmv, sum(p.comm) as comm,
               sum(p.prev_gmv) as prev_gmv
        from per p
        group by p.ckey
        having sum(p.gmv) > 0 or sum(p.prev_gmv) > 0
      ) x
    ), '[]'::jsonb),
    'merchants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'category_key', p.ckey, 'category_label', p.category_label,
        'photo_path', p.cover_photo_path, 'gmv', p.gmv, 'commission', p.comm, 'orders', p.orders,
        'prev_gmv', p.prev_gmv, 'rating', p.rating, 'ratings', p.ratings
      ) order by p.gmv desc, p.orders desc, p.name)
      from (
        select * from per
        where per.gmv > 0 or per.prev_gmv > 0 or per.ratings > 0
        order by per.gmv desc, per.orders desc, per.name
        limit 200
      ) p
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.rpc_merchant_performance(date, date, text[]) from public, anon;
grant execute on function public.rpc_merchant_performance(date, date, text[]) to authenticated, service_role;
