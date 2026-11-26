-- Read-only evidence for ONE published Food item, its primary branch, and a destination.
-- Prerequisite: merged #146 / 20261223000400. Does not change checkout, orders or stock.
-- Scope is route + operating-hours eligibility, NOT a quote, reservation or stock promise.
create function public.rpc_discovery_food_delivery_v1(
  p_merchant_id uuid,
  p_item_id uuid,
  p_branch_id uuid,
  p_request_id uuid,
  p_lat double precision default null,
  p_lng double precision default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  m public.merchant;
  b public.merchant_branch;
  destination extensions.geography;
  zone_result jsonb;
  distance_result jsonb;
  hours_known boolean;
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  result jsonb := jsonb_build_object(
    'contractVersion', 'food-delivery-evidence/1',
    'scope', 'published_item_primary_branch_route_hours',
    'observedAt', now(), 'complete', true,
    'merchantId', p_merchant_id, 'itemId', p_item_id, 'branchId', p_branch_id, 'requestId', p_request_id,
    'stock', 'not_checked', 'quote', 'not_checked', 'pickup', 'unsupported');
begin
  if p_merchant_id is null or p_item_id is null or p_branch_id is null or p_request_id is null then
    raise exception using errcode = '22023', message = 'Merchant, item and primary branch are required.';
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and not (p_lat between -90 and 90 and p_lng between -180 and 180)) then
    raise exception using errcode = '22023', message = 'Supply a valid destination pin or omit both coordinates.';
  end if;

  -- Public audience rules apply before private metadata is consulted. Never leak why
  -- a hidden item/merchant was hidden. Same-item ownership cannot be crossed.
  if not exists (select 1 from public.merchant_public p where p.id = p_merchant_id)
     or not exists (select 1 from public.catalogue_public p
                    where p.id = p_item_id and p.merchant_id = p_merchant_id) then
    return result || jsonb_build_object('state', 'unknown', 'reason', 'not_public');
  end if;
  select * into m from public.merchant where id = p_merchant_id;
  select * into b from public.merchant_branch
    where id = p_branch_id and merchant_id = p_merchant_id and is_primary;
  if not found then
    return result || jsonb_build_object('state', 'unknown', 'reason', 'branch_not_verified');
  end if;
  if m.category_key is distinct from 'restaurants_food'
     or jsonb_typeof(m.answers -> 'fulfillment_methods') is distinct from 'array' then
    return result || jsonb_build_object('state', 'unknown', 'reason', 'delivery_mode_not_verified');
  end if;
  if not ((m.answers -> 'fulfillment_methods') ? 'delivery') then
    return result || jsonb_build_object('state', 'ineligible', 'reason', 'delivery_not_offered');
  end if;
  -- Free-text exclusions cannot safely be matched to an exact item by guessing.
  if nullif(btrim(m.answers ->> 'unsafe_delivery_items'), '') is not null then
    return result || jsonb_build_object('state', 'unknown', 'reason', 'item_delivery_restrictions_unresolved');
  end if;
  if not exists (select 1 from public.catalogue_item i where i.id = p_item_id and i.merchant_id = m.id and i.available is true and i.price_kes is not null) then
    return result || jsonb_build_object('state', 'unknown', 'reason', 'item_not_orderable');
  end if;
  if m.accepting_orders is false then
    return result || jsonb_build_object('state', 'ineligible', 'reason', 'orders_paused');
  end if;
  if m.accepting_orders is null then
    return result || jsonb_build_object('state', 'unknown', 'reason', 'orders_not_verified');
  end if;
  if p_lat is null then
    return result || jsonb_build_object('state', 'unknown', 'reason', 'destination_required');
  end if;
  if b.location is null then
    return result || jsonb_build_object('state', 'unknown', 'reason', 'branch_location_required');
  end if;
  destination := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  zone_result := public.fn_zone_serviceable(destination);
  if not coalesce((zone_result ->> 'ok')::boolean, false) then
    return result || jsonb_build_object('state', 'ineligible', 'reason', 'destination_not_serviceable');
  end if;
  if nullif(zone_result ->> 'city_id', '')::uuid is distinct from m.city_id then
    return result || jsonb_build_object('state', 'ineligible', 'reason', 'different_service_city');
  end if;
  distance_result := public.fn_delivery_band(m.city_id, b.location, destination);
  if not coalesce((distance_result ->> 'ok')::boolean, false) then
    return result || jsonb_build_object('state', 'ineligible', 'reason', 'outside_delivery_distance');
  end if;

  -- Checkout intentionally treats a merchant with no schedule as open. Discovery
  -- must not turn that absence into a verified Open/Delivers claim.
  select exists (
    select 1 from public.fn_merchant_effective_hours(m.id, b.id, v_today) h
      where h.closed or (h.opens is not null and h.closes is not null)
    union all
    select 1 from public.fn_merchant_effective_hours(m.id, b.id, v_today - 1) h
      where h.closed is false and h.closes < h.opens
        and (now() at time zone 'Africa/Nairobi')::time < h.closes
  ) into hours_known;
  if not hours_known then
    return result || jsonb_build_object('state', 'unknown', 'reason', 'hours_not_verified');
  end if;
  -- The shared checkout helper evaluates merchant-level hours, not a specific branch.
  -- Do not override a branch-specific exception with the merchant's default.
  if exists (select 1 from public.merchant_hours_override o where o.merchant_id = m.id and o.branch_id = b.id and o.date in (v_today, v_today - 1)) then
    return result || jsonb_build_object('state', 'unknown', 'reason', 'branch_hours_not_verified');
  end if;
  if not public.fn_merchant_open_for_orders(m.id, now()) then
    return result || jsonb_build_object('state', 'ineligible', 'reason', 'closed');
  end if;
  return result || jsonb_build_object('state', 'eligible', 'reason', 'route_and_hours_verified');
end;
$$;
revoke all on function public.rpc_discovery_food_delivery_v1(uuid, uuid, uuid, uuid, double precision, double precision) from public;
grant execute on function public.rpc_discovery_food_delivery_v1(uuid, uuid, uuid, uuid, double precision, double precision) to anon, authenticated, service_role;
comment on function public.rpc_discovery_food_delivery_v1 is
  'Read-only exact public Food item/primary branch delivery-route and hours evidence. No quote, stock, pickup or purchase promise; coordinates are not stored or returned.';

-- Authoritative exact-item branch binding. This does not claim stock, pickup or
-- delivery eligibility, and intentionally refuses checkout's non-primary fallback.
create function public.rpc_discovery_food_branch_v1(
  p_merchant_id uuid, p_item_id uuid, p_request_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  branch_ids uuid[];
  result jsonb := jsonb_build_object(
    'contractVersion','food-primary-branch/1','observedAt',now(),
    'merchantId',p_merchant_id,'itemId',p_item_id,'requestId',p_request_id,
    'branchId',null,'state','unknown');
begin
  if p_merchant_id is null or p_item_id is null or p_request_id is null then
    raise exception using errcode='22023', message='Merchant, item and request are required.';
  end if;
  if not exists(select 1 from public.merchant_public where id=p_merchant_id)
     or not exists(select 1 from public.catalogue_public where id=p_item_id and merchant_id=p_merchant_id) then
    return result || jsonb_build_object('reason','not_public');
  end if;
  if not exists(select 1 from public.merchant where id=p_merchant_id and category_key='restaurants_food') then
    return result || jsonb_build_object('reason','unsupported_category');
  end if;
  select array_agg(id order by id) into branch_ids from public.merchant_branch
    where merchant_id=p_merchant_id and is_primary;
  if coalesce(cardinality(branch_ids),0)<>1 then
    return result || jsonb_build_object('reason','branch_not_verified');
  end if;
  return result || jsonb_build_object('state','bound','reason','primary_branch_verified','branchId',branch_ids[1]);
end;
$$;
revoke all on function public.rpc_discovery_food_branch_v1(uuid,uuid,uuid) from public;
grant execute on function public.rpc_discovery_food_branch_v1(uuid,uuid,uuid) to anon,authenticated,service_role;
comment on function public.rpc_discovery_food_branch_v1 is
  'Exact public Food item primary-branch binding only. Recheck binding on use; not pickup, delivery, quote or stock eligibility.';
