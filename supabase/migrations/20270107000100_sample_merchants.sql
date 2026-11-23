-- Sample shops: the demonstration merchants are shown, never ordered from.
--
-- The owner wants the Consumer app to run against the hosted stack before it
-- goes to Apple, with a full-looking catalogue. The catalogue comes from the
-- Discovery demo seed (750 invented Nairobi merchants), loaded by hand with
-- supabase/sample-shops.sql. Those shops do not exist. If any of them took an
-- order, a customer or an App Review tester could pay for something nobody
-- will ever deliver. Decided with the owner on 18 Nov 2026: load them as
-- sample shops, the way sample stays already work (property.is_sample,
-- 20261122000100), and let one or two real test shops take the orders.
--
-- merchant.is_sample marks them. A sample shop:
--   * still appears in merchant_public and catalogue_public, so the website,
--     the Consumer app and the Discovery engine can show it, and
--     merchant_public now says is_sample so each can label it "Sample shop"
--     and hide the basket
--   * can never take orders or be a concierge pick: a table check, so no
--     caller (merchant console, go-live, staff tools) can switch it on. The
--     quote already refuses a shop that is not accepting orders.
--   * cannot have an order row written against it by any channel (web, QR,
--     desk, concierge, API): a trigger on public.order refuses it, in case a
--     path ever skips the accepting-orders test
--
-- No function body is replaced, so this does not touch fn_web_order_quote or
-- rpc_order_place_web, which PR #155 (Order together) is changing.
--
-- Rollback:
--   drop trigger if exists order_refuses_sample_merchant on public.order;
--   drop function if exists public.tg_order_refuses_sample_merchant();
--   alter table public.merchant drop constraint if exists merchant_sample_takes_no_orders;
--   re-run merchant_public from 20261101000000_admin_category_management.sql
--     (drop view public.merchant_public first: a column cannot be removed by
--     create or replace; then re-grant select to anon, authenticated, and
--     re-create the views that read it: see pg_depend);
--   alter table public.merchant drop column if exists is_sample;

alter table public.merchant
  add column if not exists is_sample boolean not null default false;

comment on column public.merchant.is_sample is
  'A demonstration shop. Shown, labelled as a sample, and never takes orders. Loaded by supabase/sample-shops.sql.';

alter table public.merchant
  add constraint merchant_sample_takes_no_orders
  check (not is_sample or (accepting_orders = false and concierge_pick = false));

create or replace function public.tg_order_refuses_sample_merchant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.merchant m where m.id = new.merchant_id and m.is_sample) then
    raise exception 'This is a sample shop. It does not take orders.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_order_refuses_sample_merchant() from public, anon, authenticated;

drop trigger if exists order_refuses_sample_merchant on public.order;
create trigger order_refuses_sample_merchant
  before insert or update of merchant_id on public.order
  for each row execute function public.tg_order_refuses_sample_merchant();

-- merchant_public as in 20261101000000, with is_sample appended (create or
-- replace view can only add columns at the end).
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
  m.is_sample
from public.merchant m
join public.city c on c.id = m.city_id
left join public.merchant_branch b on b.merchant_id = m.id and b.is_primary
where m.status = 'live'
  and m.explore_visible
  and m.deleted_at is null;

grant select on public.merchant_public to anon, authenticated;
