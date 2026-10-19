create or replace view public.merchant_public
with (security_invoker = false)
as
select
  m.id,
  m.trading_name,
  m.category,
  m.category_other,
  m.cover_photo_path,
  m.featured,
  c.slug as city_slug,
  c.name as city_name,
  b.name as branch_name,
  b.address_text as branch_address,
  b.latitude as branch_latitude,
  b.longitude as branch_longitude,
  m.went_live_at as listed_at,
  m.explore_visible,
  m.concierge_pick,
  m.accepting_orders,
  m.busy_mode_until,
  m.closed_early_at,
  m.pay_on_delivery as pay_on_delivery_enabled,
  m.pay_on_delivery_cap_kes,
  m.prep_minutes,
  m.parent_merchant_id,
  (select h.opens from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as opens_today,
  (select h.closes from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as closes_today,
  (select h.closed from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as closed_today,
  case when m.health_band = 'green' then 'green' end as health_badge,
  m.subcategory,
  coalesce(
    (select active_zone.id from public.zone active_zone where active_zone.id = b.zone_id and active_zone.active),
    (select z.id from public.zone_for_point(b.longitude, b.latitude) z)
  ) as zone_id
from public.merchant m
join public.city c on c.id = m.city_id
left join public.merchant_branch b on b.merchant_id = m.id and b.is_primary
where m.status = 'live';

grant select on public.merchant_public to anon, authenticated;
