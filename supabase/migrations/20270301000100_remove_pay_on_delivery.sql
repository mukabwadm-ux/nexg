-- Pay on delivery is removed from the system (owner, 23 Nov 2026).
--
-- Customers lost cash on delivery at checkout on 20 Nov 2026
-- (20270128000100), but the switches behind it stayed: shops could still be
-- marked as taking payment on delivery (and the apps showed that as a trait),
-- zones still allowed it, a rider could be eligible, and staff could still
-- place a cash order by hand. This removes what is left.
--
-- 1. Orders: no new order may be cash on delivery, whatever the channel,
--    from any session (customers, staff, the server). Rows written by the
--    database owner (imports, hand repairs, test fixtures of old cash orders)
--    are still allowed, as before. Old cash orders keep their method.
-- 2. Shops: merchant.pay_on_delivery is false everywhere, with no cap, and a
--    check keeps it so.
-- 3. Zones: zone.cod_allowed is false everywhere, defaults to false, and a
--    check keeps it so.
-- 4. Riders: rider.pay_on_delivery_eligible is false everywhere and a check
--    keeps it so. fn_cash_guard no longer turns it on or off: a rider over
--    their cash cap is still marked over_cap (and restored when back under),
--    for any cash they still hold.
-- 5. Apps: merchant_traits_public no longer has the pay_on_delivery trait.
-- 6. Order steps: the rider's "Cash collected" step is gone from the list
--    of next steps (it only ever showed on cash orders).
--
-- The columns stay, always false, so the apps, the API and the reports that
-- read them keep working.
--
-- Rollback:
--   alter table public.merchant drop constraint if exists merchant_no_pay_on_delivery;
--   alter table public.zone drop constraint if exists zone_no_cash_on_delivery;
--   alter table public.zone alter column cod_allowed set default true;
--   alter table public.rider drop constraint if exists rider_no_pay_on_delivery;
--   re-run tg_order_no_customer_cash from 20270128000100, fn_cash_guard from
--   20260101007800, merchant_traits_public from 20270227000100, and the
--   cash_collected row of order_step_rule from 20270221000100.
--   The switches' old values are not kept.

-- ── 1. Orders ──────────────────────────────────────────────────────────────

create or replace function public.tg_order_no_customer_cash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Any session (a customer, staff through a console function, or the server) runs as one of
  -- these roles, which a security definer function does not change. Rows written by the
  -- database owner (imports, hand repairs, test fixtures of old cash orders) are left alone.
  if new.payment_method = 'cash_on_delivery'
     and current_setting('role', true) in ('authenticated', 'anon', 'service_role') then
    raise exception 'Cash on delivery is not available. Pay with M-Pesa instead.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.tg_order_no_customer_cash() from public, anon, authenticated;

-- ── 2. Shops ───────────────────────────────────────────────────────────────

update public.merchant
   set pay_on_delivery = false, pay_on_delivery_cap_kes = null
 where pay_on_delivery or pay_on_delivery_cap_kes is not null;

alter table public.merchant
  add constraint merchant_no_pay_on_delivery
  check (not pay_on_delivery and pay_on_delivery_cap_kes is null);

comment on column public.merchant.pay_on_delivery is
  'Always false: pay on delivery was removed on 23 Nov 2026 (20270301000100).';

-- ── 3. Zones ───────────────────────────────────────────────────────────────

update public.zone set cod_allowed = false where cod_allowed;
alter table public.zone alter column cod_allowed set default false;
alter table public.zone add constraint zone_no_cash_on_delivery check (not cod_allowed);

comment on column public.zone.cod_allowed is
  'Always false: pay on delivery was removed on 23 Nov 2026 (20270301000100).';

-- ── 4. Riders ──────────────────────────────────────────────────────────────

update public.rider set pay_on_delivery_eligible = false where pay_on_delivery_eligible;
alter table public.rider add constraint rider_no_pay_on_delivery check (not pay_on_delivery_eligible);

comment on column public.rider.pay_on_delivery_eligible is
  'Always false: pay on delivery was removed on 23 Nov 2026 (20270301000100).';

/* 20260101007800's guard, without the pay-on-delivery switch: over the cap the rider is
   marked over_cap (prepaid work carries on), and back under the system clears what it set. */
create or replace function public.fn_cash_guard(p_rider_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
  v_rule public.cash_rule;
  v_cap bigint;
begin
  select * into v_rider from public.rider where id = p_rider_id;
  select * into v_rule from public.cash_rule where city_id = v_rider.city_id;
  v_cap := public.fn_rider_cash_cap(p_rider_id);

  if v_cap is null or v_cap = 0 then
    return;
  end if;

  if v_rider.cash_on_hand >= v_cap * coalesce(v_rule.pause_at_pct, 100) / 100.0 then
    if v_rider.offers_paused_reason is distinct from 'over_cap' then
      update public.rider set
        can_receive_offers_source = 'system',
        offers_paused_reason = 'over_cap'
      where id = p_rider_id;

      insert into public.notification (kind, rider_id, status)
      values ('offers_paused_over_cap', p_rider_id, 'pending');

      perform audit.log('system'::public.actor_type, 'riders', 'cash.over_cap',
        p_target_type => 'rider', p_target_id => p_rider_id,
        p_city_id => v_rider.city_id,
        p_after => jsonb_build_object('cash_on_hand', v_rider.cash_on_hand, 'cap', v_cap),
        p_severity => 'notice'::public.audit_severity);
    end if;

  elsif v_rider.cash_on_hand >= v_cap * coalesce(v_rule.remind_at_pct, 80) / 100.0 then
    insert into public.notification (kind, rider_id, status)
    values ('deposit_reminder', p_rider_id, 'pending');

  else
    /* Back under. Clear only what the system itself set. */
    if v_rider.offers_paused_reason = 'over_cap'
       and v_rider.can_receive_offers_source = 'system' then
      update public.rider set
        offers_paused_reason = null,
        can_receive_offers_source = 'system'
      where id = p_rider_id;

      perform audit.log('system'::public.actor_type, 'riders', 'cash.under_cap_restored',
        p_target_type => 'rider', p_target_id => p_rider_id,
        p_city_id => v_rider.city_id,
        p_after => jsonb_build_object('cash_on_hand', v_rider.cash_on_hand, 'cap', v_cap));
    end if;
  end if;
end;
$$;

-- ── 5. Traits for the apps ─────────────────────────────────────────────────

create or replace view public.merchant_traits_public
with (security_invoker = false) as
select
  m.id as merchant_id,
  array_remove(array[
    case when m.late_night_until is not null then 'open_late' end,
    case when m.has_own_riders then 'own_riders' end,
    case when m.went_live_at > now() - interval '30 days' then 'new' end,
    case when r.n >= 10 and r.avg_stars >= 4.5 then 'top_rated' end,
    case when d.labels @> array['vegetarian'] then 'vegetarian_options' end,
    case when d.labels @> array['vegan'] then 'vegan_options' end,
    case when d.labels @> array['halal'] then 'halal_options' end,
    case when public.fn_merchant_sells_alcohol(m.id) then 'alcohol' end
  ], null)::text[] as traits,
  (case
     when o.n >= 60 then 3
     when o.n >= 20 then 2
     when o.n >= 5 then 1
     else 0
   end)::smallint as popularity_band
from public.merchant m
left join lateral (
  select count(*) as n, avg(rt.stars) as avg_stars
    from public.order_rating rt
   where rt.merchant_id = m.id
) r on true
left join lateral (
  select coalesce(array_agg(distinct l), '{}') as labels
    from public.catalogue_item i
    left join lateral unnest(i.dietary_labels) l on true
   where i.merchant_id = m.id and i.available and i.kind = 'buy'
) d on true
left join lateral (
  select count(*) as n
    from public.order od
   where od.merchant_id = m.id
     and od.placed_at > now() - interval '30 days'
     and od.payment_status in ('paid', 'collected')
) o on true
where m.status = 'live' and m.explore_visible and m.deleted_at is null;

revoke all on public.merchant_traits_public from public, anon, authenticated;
grant select on public.merchant_traits_public to anon, authenticated;

-- ── 6. Order steps ─────────────────────────────────────────────────────────

delete from public.order_step_rule where actor = 'rider' and step = 'cash_collected';
