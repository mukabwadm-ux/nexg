-- Test tenants: seen and used only by reviewers and staff (owner's rules,
-- coordinator's decision, 23 Nov 2026).
--
-- A shop or property marked accepts_test_payments (20270129000200,
-- 20270222000200) is a test tenant: #194's review shops, the test property,
-- and the test cinema. Before this, merchant_public and property_public listed
-- them like any other, and a test tenant still took live money: an ordinary
-- customer who found a review shop could pay real money to a shop that sends
-- no real rider.
--
-- 1. authz.sees_test_tenants(): a staff account (authz.staff_id()) or an
--    account in payment_reviewer (20270222000500, Apple's review account).
--    rpc_sees_test_tenants() is its public form for the Discovery engine,
--    which asks it with the caller's own token.
-- 2. merchant_public, property_public and property_unit_public show a test
--    tenant only to those accounts, and end with is_test. The catalogue views
--    and the cinema reads (cinema.public_showing) read merchant_public, so
--    they follow. The engine reads with the anon key, so its shared catalogue
--    never holds a test tenant.
-- 3. A new order, booking or stay at a test tenant is refused for anyone else,
--    with the same words as a shop or home that is not taking any. Trusted
--    server code (the service role) and the database itself are let through.
-- 4. At a test tenant an order is paid by card or M-Pesa only (no cash, room
--    charge, account or bank transfer), and a payment is either not started
--    or a Paystack test payment. No live money can reach a test tenant, even
--    from a staff account.
--
-- Rollback: restore the three views from 20270130009600 and 20270125000100
-- (without is_test), drop the four guard triggers and their functions, and
-- drop rpc_sees_test_tenants, authz.may_use_test_tenant and
-- authz.sees_test_tenants.

-- ═══════════════════════════════════════════════ 1. who may see one

create or replace function authz.sees_test_tenants()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.staff_id() is not null
      or exists (select 1 from public.payment_reviewer r where r.user_id = (select auth.uid()))
$$;
/* The views below call it as the reader (a function in a view runs with the
   caller's rights), so every role that reads them may execute it. It says
   only whether the caller is staff or a reviewer. */
revoke all on function authz.sees_test_tenants() from public;
grant execute on function authz.sees_test_tenants() to anon, authenticated, service_role;

/* Who may place something at one: the accounts above, trusted server code
   (the service role) and the database itself (no request at all). Used only
   by the guards in 3, never by a view: server code that reads for an ordinary
   visitor must not see test tenants. */
create or replace function authz.may_use_test_tenant()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.sees_test_tenants()
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
         in ('service_role', '')
$$;
revoke all on function authz.may_use_test_tenant() from public;

create or replace function public.rpc_sees_test_tenants()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.sees_test_tenants()
$$;
comment on function public.rpc_sees_test_tenants() is
  'True for a staff account or an account in payment_reviewer. The Discovery engine asks it with the caller''s own token before adding test tenants to that caller''s answer.';
revoke all on function public.rpc_sees_test_tenants() from public, anon;
grant execute on function public.rpc_sees_test_tenants() to authenticated;

-- ═══════════════════════════════════════════════ 2. the views

-- merchant_public: 20270130009600, plus is_test and the rule.
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
    where r.merchant_id = m.id and r.about in ('order', 'food')) as rating_avg,
  m.accepts_test_payments as is_test
from public.merchant m
join public.city c on c.id = m.city_id
left join public.merchant_branch b on b.merchant_id = m.id and b.is_primary
where m.status = 'live'
  and m.explore_visible
  and m.deleted_at is null
  and (not m.accepts_test_payments or (select authz.sees_test_tenants()));

-- property_public: 20270125000100, plus is_test and the rule.
create or replace view public.property_public
with (security_invoker = false) as
select
  p.id,
  p.slug,
  p.name,
  p.kind,
  p.area,
  p.city_id,
  c.name as city_name,
  p.summary,
  p.description,
  p.amenities,
  p.photos,
  p.neighbourhood_note,
  p.check_in_from,
  p.check_out_by,
  count(u.id)::integer as units_available,
  min(u.bedrooms) as bedrooms_min,
  max(u.bedrooms) as bedrooms_max,
  max(u.max_guests) as sleeps_max,
  /* "from KES x" is a minimum, and only over units that actually have
     a rate. All null stays null, and the card says price on request. */
  min(u.nightly_rate_kes) as from_rate_kes,
  count(*) filter (where u.nightly_rate_kes is null)::integer as units_without_rate,
  /* A demonstration listing: shown, never bookable. */
  p.is_sample,
  /* The host's exact pin (owner, 20 Nov): public. */
  extensions.st_y(p.point::extensions.geometry) as latitude,
  extensions.st_x(p.point::extensions.geometry) as longitude,
  p.house_rules,
  p.cancellation_policy,
  p.accepts_test_payments as is_test
from public.property p
join public.host h on h.id = p.host_id
left join public.city c on c.id = p.city_id
join public.unit u
  on u.property_id = p.id
 and u.status = 'live'
 and u.listed
 and u.archived_at is null
where p.listed and h.status = 'live'
  and (not p.accepts_test_payments or (select authz.sees_test_tenants()))
group by p.id, c.name;

-- property_unit_public: 20270125000100, plus is_test and the rule.
create or replace view public.property_unit_public
with (security_invoker = false) as
select
  u.id,
  u.property_id,
  u.label_public,
  u.name,
  u.unit_summary,
  u.bedrooms,
  u.bathrooms,
  u.max_guests,
  u.size_sqm,
  u.bed_setup,
  u.nightly_rate_kes,
  u.min_nights,
  u.unit_amenities,
  u.photos,
  u.floor,
  u.area,
  /* So a guest knows the concierge rule exists without being handed
     the askari's name before they have booked anything. */
  (u.handoff is not null) as handoff_arranged,
  p.is_sample,
  /* The unit's own pin and times; null means use the property's. */
  extensions.st_y(u.point::extensions.geometry) as latitude,
  extensions.st_x(u.point::extensions.geometry) as longitude,
  u.checkin_time,
  u.checkout_time,
  p.accepts_test_payments as is_test
from public.unit u
join public.property p on p.id = u.property_id
join public.host h on h.id = u.host_id
where u.status = 'live' and u.listed and u.archived_at is null
  and p.listed and h.status = 'live'
  and (not p.accepts_test_payments or (select authz.sees_test_tenants()));

-- ═══════════════════════════════════════════════ 3 and 4. the guards

create or replace function public.tg_test_tenant_order_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.merchant m where m.id = new.merchant_id and m.accepts_test_payments) then
    if not authz.may_use_test_tenant() then
      raise exception 'This merchant is not taking orders.' using errcode = '22023';
    end if;
    if new.payment_method::text not in ('card', 'mpesa_stk') then
      raise exception 'A test shop takes test card or M-Pesa payments only.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.tg_test_tenant_order_guard() from public, anon, authenticated;

create trigger order_test_tenant_guard
before insert on public."order"
for each row execute function public.tg_test_tenant_order_guard();

create or replace function public.tg_test_tenant_booking_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.merchant m where m.id = new.merchant_id and m.accepts_test_payments)
     and not authz.may_use_test_tenant() then
    raise exception 'This business is not taking bookings yet' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.tg_test_tenant_booking_guard() from public, anon, authenticated;

create trigger booking_test_tenant_guard
before insert on public.booking
for each row execute function public.tg_test_tenant_booking_guard();

create or replace function public.tg_test_tenant_stay_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.property p
              where p.accepts_test_payments
                and p.id = coalesce(new.property_id,
                                    (select u.property_id from public.unit u where u.id = new.unit_id)))
     and not authz.may_use_test_tenant() then
    raise exception 'This home is not taking bookings.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.tg_test_tenant_stay_guard() from public, anon, authenticated;

create trigger stay_test_tenant_guard
before insert on public.stay
for each row execute function public.tg_test_tenant_stay_guard();

/* A payment at a test tenant is either not started (unassigned) or a Paystack
   test payment. Checked when it is created and whenever its provider or mode
   changes. */
create or replace function public.tg_test_tenant_payment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.provider = 'unassigned' or (new.provider = 'paystack' and new.is_test)) then
    return new;
  end if;
  if exists (select 1 from public.merchant m where m.id = new.merchant_id and m.accepts_test_payments)
     or exists (select 1 from public.stay s
                  join public.property p
                    on p.id = coalesce(s.property_id,
                                       (select u.property_id from public.unit u where u.id = s.unit_id))
                 where s.id = new.stay_id and p.accepts_test_payments) then
    raise exception 'Test shops and homes take Paystack test payments only.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.tg_test_tenant_payment_guard() from public, anon, authenticated;

create trigger payment_test_tenant_guard
before insert or update of provider, is_test, merchant_id, stay_id on public.payment
for each row execute function public.tg_test_tenant_payment_guard();
