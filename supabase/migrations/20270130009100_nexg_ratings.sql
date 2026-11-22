-- R41 (Explore R1): shops' star ratings come from NexG customers.
--
-- The owner, 22 Nov 2026: "NexG ratings only". Google's terms do not allow
-- storing Google ratings, so they are not used.
--
-- merchant_public gains, from order_rating (one rating per delivered order,
-- written by rpc_order_rate), counting only ratings about the order or the
-- food, not the rider or the app:
--   rating_count  how many such ratings the shop has
--   rating_avg    their average to one decimal, shown once there are at least
--                 3, so one rating does not decide a shop's stars
-- The map's stars and "Top Rated" read these (Top Rated: highest rating_avg,
-- with enough ratings).
--
-- Numbered 20270130009100 to land after Order together (20270130009000).
--
-- Rollback: restore merchant_public from 20270130000300 and drop the index.

create index if not exists order_rating_shop_stars
  on public.order_rating (merchant_id) where about in ('order', 'food');

-- merchant_public: 20270130000300, plus rating_count and rating_avg.
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
  ) as zone_id,
  m.category_key,
  m.min_order_kes,
  coalesce((select jsonb_agg(jsonb_build_object('key', k.key, 'label', k.label, 'value', m.answers -> k.key)
                             order by k.sort, k.label)
              from public.merchant_public_answer_key k
             where m.answers ? k.key
               and jsonb_typeof(m.answers -> k.key) <> 'null'
               and coalesce(m.answers ->> k.key, '') not in ('', 'none', '[]', '{}')), '[]'::jsonb) as public_answers,
  (select count(*)::integer from public.order_rating r
    where r.merchant_id = m.id and r.about in ('order', 'food')) as rating_count,
  (select case when count(*) >= 3 then round(avg(r.stars)::numeric, 1) end from public.order_rating r
    where r.merchant_id = m.id and r.about in ('order', 'food')) as rating_avg
from public.merchant m
join public.city c on c.id = m.city_id
left join public.merchant_branch b on b.merchant_id = m.id and b.is_primary
where m.status = 'live'
  and m.explore_visible
  and m.deleted_at is null;

grant select on public.merchant_public to anon, authenticated;
