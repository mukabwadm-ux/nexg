-- Account-owned order location read. Courier fixes are outside this contract.
create function public.rpc_my_order_map(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := auth.uid();
  v_order record;
  v_branch record;
  v_pickup_lat double precision;
  v_pickup_lng double precision;
  v_dropoff_lat double precision;
  v_dropoff_lng double precision;
  v_places jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if not authz.maps_has_real_account() then
    raise exception 'Sign in with your account to view an order map.' using errcode = '42501';
  end if;

  select o.id, o.stage, o.merchant_id, o.branch_id, o.city_id, o.dropoff_point into v_order
  from public.order o
  join public.guest g on g.id = o.guest_id
  where o.id = p_order_id and g.user_id = v_account_id and g.anonymised_at is null;

  if not found then
    raise exception 'Order map not found.' using errcode = 'P0002';
  end if;

  v_result := jsonb_build_object(
    'contractVersion', '1',
    'accountId', v_account_id,
    'record', jsonb_build_object('kind', 'order', 'id', v_order.id),
    'stage', v_order.stage,
    'courier', null
  );
  if v_order.stage not in ('placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'arriving') then
    return v_result || jsonb_build_object(
      'status', 'unavailable', 'places', v_places, 'reason', 'completed'
    );
  end if;

  select b.id, b.latitude, b.longitude into v_branch
  from public.merchant_branch b
  where b.id = v_order.branch_id and b.merchant_id = v_order.merchant_id;

  -- job_one_live_per_order guarantees a single current dispatch snapshot.
  -- Dispatch can build its snapshot from the order branch, so an explicitly
  -- mismatched branch invalidates this pickup source too.
  if v_order.branch_id is null or v_branch.id is not null then
    select extensions.st_y(j.pickup_point::extensions.geometry),
           extensions.st_x(j.pickup_point::extensions.geometry)
    into v_pickup_lat, v_pickup_lng
    from dispatch.job j
    where j.order_id = v_order.id and j.city_id = v_order.city_id
      and j.state not in ('cancelled', 'completed') and j.ended_at is null;
  end if;
  if not coalesce(v_pickup_lat between -90 and 90 and v_pickup_lng between -180 and 180, false) then
    v_pickup_lat := v_branch.latitude;
    v_pickup_lng := v_branch.longitude;
  end if;
  if v_pickup_lat between -90 and 90 and v_pickup_lng between -180 and 180 then
    v_places := v_places || jsonb_build_array(jsonb_build_object(
      'id', 'order:' || v_order.id::text || ':pickup',
      'latitude', v_pickup_lat,
      'longitude', v_pickup_lng,
      'title', 'Pickup location',
      'role', 'pickup'
    ));
  end if;

  v_dropoff_lat := extensions.st_y(v_order.dropoff_point::extensions.geometry);
  v_dropoff_lng := extensions.st_x(v_order.dropoff_point::extensions.geometry);
  if v_dropoff_lat between -90 and 90 and v_dropoff_lng between -180 and 180 then
    v_places := v_places || jsonb_build_array(jsonb_build_object(
      'id', 'order:' || v_order.id::text || ':dropoff',
      'latitude', v_dropoff_lat,
      'longitude', v_dropoff_lng,
      'title', 'Delivery location',
      'role', 'dropoff'
    ));
  end if;

  if jsonb_array_length(v_places) = 0 then
    return v_result || jsonb_build_object(
      'status', 'unavailable', 'places', v_places, 'reason', 'locations-missing'
    );
  end if;
  return v_result || jsonb_build_object('status', 'locations-only', 'places', v_places);
end;
$$;

comment on function public.rpc_my_order_map(uuid) is
  'Read fixed location pins for the current account''s active order. Courier observations and estimates are excluded.';

revoke execute on function public.rpc_my_order_map(uuid) from public, anon, service_role;
grant execute on function public.rpc_my_order_map(uuid) to authenticated;
