-- Delivery orders move through their stages, and a guest sees the map.
--
-- Before this, nothing moved a live delivery order past 'placed' except staff.
-- The merchant Work page (apps/web/app/merchant/work) lists orders and was
-- designed with their steps, but its buttons had no database step to save to,
-- so it answered "No action is available" for anything but a booking.
--
-- Accepting is automatic: the apps only show what a shop has and is open to
-- sell, and paying confirms the order (owner, 18 Nov 2026). So the merchant's
-- first step is to start preparing a paid order.
--
-- 1. rpc_merchant_order_step(order, step) for the shop's team:
--      'start'  placed | confirmed  -> preparing  (confirmed_at set if empty)
--      'ready'  preparing           -> ready      (ready_at), and the rider
--                                                  search starts by itself
--    An order paid online is not started until it is paid, as the Work page
--    already shows ("Waiting for payment", merchant_orders_v.what_now).
-- 2. The rider search: dispatch.fn_job_start holds what dispatch.rpc_job_start
--    did, so marking an order ready can start it. rpc_job_start keeps its own
--    check (live operations or the service role) and calls it. Riders accept
--    with the existing rpc_dispatch_offer_respond (20261223000600).
-- 3. rpc_rider_order_step(order, step, handed_to) for the assigned rider:
--      'picked_up'  ready                -> picked_up (picked_up_at)
--      'arriving'   picked_up            -> arriving
--      'delivered'  picked_up | arriving -> delivered (delivered_at, handed_to);
--                                           the dispatch job completes, as
--                                           rpc_order_mark does for staff.
-- 4. A guest (temporary session) reads the map of their own order:
--    rpc_my_order_map no longer needs a full account, only the session that
--    owns the order. The rider's live position (20270108000200, from PR #150)
--    is shared with a guest customer as with an account.
--
-- Each step writes order.stage, its timestamp and an order_event row with the
-- actor, which is what the customer's app reads, and the existing triggers
-- ring the customer's bell and send the merchant's webhooks.
--
-- Rollback: re-run dispatch.rpc_job_start from 20261223000600,
-- rpc_my_order_map(uuid) from 20261220000200 and
-- dispatch.maps_rider_assignments from 20270108000200; then
--   drop function public.rpc_merchant_order_step(uuid, text),
--     public.rpc_rider_order_step(uuid, text, text), dispatch.fn_job_start(uuid);

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('order.merchant_started', 'orders', 'info', false, 'A shop started preparing an order'),
  ('order.merchant_ready', 'orders', 'info', false, 'A shop marked an order ready'),
  ('order.rider_picked_up', 'orders', 'info', false, 'A rider picked an order up'),
  ('order.rider_arriving', 'orders', 'info', false, 'A rider is arriving with an order'),
  ('order.rider_delivered', 'orders', 'notice', false, 'A rider delivered an order')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ 2. the rider search

create or replace function dispatch.fn_job_start(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_job uuid;
  v_radius numeric;
  v_pickup extensions.geography;
  v_needs text[];
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;

  if exists (select 1 from dispatch.job j
             where j.order_id = p_order_id and j.state not in ('cancelled', 'completed')) then
    return jsonb_build_object('ok', true, 'already_running', true);
  end if;

  select extensions.st_setsrid(extensions.st_makepoint(b.longitude, b.latitude), 4326)::extensions.geography
    into v_pickup
    from public.merchant_branch b where b.id = o.branch_id;

  v_radius := coalesce(settings.fn_num('dispatch.search_radius_km', o.city_id), 3);

  v_needs := o.carry_requirements;
  if exists (select 1 from public.merchant m
              where m.id = o.merchant_id and m.category = 'bar_liquor')
     and not ('alcohol' = any (v_needs)) then
    v_needs := v_needs || 'alcohol'::text;
  end if;

  insert into dispatch.job (
    order_id, city_id, zone_id, pickup_point, dropoff_point,
    pickup_label, dropoff_label, distance_km, vehicle_requirements,
    state, round, radius_km, rule_version_ids)
  values (
    p_order_id, o.city_id, o.zone_id, v_pickup, o.dropoff_point,
    coalesce((select coalesce(m.trading_name, m.legal_name) from public.merchant m
               where m.id = o.merchant_id), 'Merchant'),
    o.dropoff_label,
    case when v_pickup is not null and o.dropoff_point is not null
         then round((extensions.st_distance(v_pickup, o.dropoff_point) / 1000.0)::numeric, 2) end,
    v_needs,
    'queued', 0, v_radius,
    jsonb_build_object(
      'accept_window_s', settings.fn_get('dispatch.accept_window_s', 'city', o.city_id) ->> 'version_id',
      'rounds', settings.fn_get('dispatch.rounds_before_boost', 'city', o.city_id) ->> 'version_id',
      'radius', settings.fn_get('dispatch.search_radius_km', 'city', o.city_id) ->> 'version_id'))
  returning id into v_job;

  perform dispatch.fn_offer_round(v_job);

  return jsonb_build_object('ok', true, 'job_id', v_job, 'needs', to_jsonb(v_needs));
end;
$$;

comment on function dispatch.fn_job_start(uuid) is
  'Opens the rider search for an order. Internal: callers check who may start it (rpc_job_start, rpc_merchant_order_step).';

revoke execute on function dispatch.fn_job_start(uuid) from public, anon, authenticated;
grant execute on function dispatch.fn_job_start(uuid) to service_role;

create or replace function dispatch.rpc_job_start(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_city uuid;
begin
  select city_id into v_city from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;

  /* Starting a rider search by hand is live operations' call, in the order's city. */
  if not (coalesce(auth.role(), '') = 'service_role' or authz.works_live_ops(v_city)) then
    raise exception 'Only live operations in this order''s city can start dispatch.'
      using errcode = '42501';
  end if;

  return dispatch.fn_job_start(p_order_id);
end;
$$;

-- ═══════════════════════════════════════════════ 1. the shop's steps

create or replace function public.rpc_merchant_order_step(p_order_id uuid, p_step text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_uid uuid := (select auth.uid());
  v_dispatch jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in to your shop first.' using errcode = '42501';
  end if;

  select * into o from public.order where id = p_order_id for update;
  if not found or not authz.is_merchant_member(o.merchant_id) then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  if p_step not in ('start', 'ready') then
    raise exception 'Unknown step: %.', p_step using errcode = '22023';
  end if;

  /* Already there: answer as if it had just happened, so a double tap is harmless. */
  if (p_step = 'start' and o.stage = 'preparing') or (p_step = 'ready' and o.stage = 'ready') then
    return jsonb_build_object('ok', true, 'order_id', o.id, 'stage', o.stage, 'already', true);
  end if;

  if o.payment_method in ('mpesa_stk', 'card', 'bank_transfer')
     and o.payment_status not in ('paid', 'collected') then
    raise exception 'Wait for the customer''s payment before starting this order.'
      using errcode = '22023', hint = 'awaiting_payment';
  end if;

  if p_step = 'start' then
    if o.stage not in ('placed', 'confirmed') then
      raise exception 'This order is % and cannot be started.', o.stage
        using errcode = '22023', hint = 'wrong_stage';
    end if;

    if o.confirmed_at is null then
      insert into public.order_event (order_id, kind, title, actor_type, actor_id)
      values (o.id, 'confirmed', 'Confirmed by the shop', 'merchant_user', v_uid);
    end if;
    update public.order
       set stage = 'preparing', confirmed_at = coalesce(confirmed_at, now())
     where id = o.id;
    insert into public.order_event (order_id, kind, title, actor_type, actor_id)
    values (o.id, 'preparing', 'Being prepared', 'merchant_user', v_uid);

    perform audit.log(p_actor_type => 'merchant_user'::public.actor_type, p_actor_id => v_uid,
      p_module => 'orders', p_action => 'order.merchant_started',
      p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
      p_city_id => o.city_id);

    return jsonb_build_object('ok', true, 'order_id', o.id, 'stage', 'preparing');
  end if;

  -- 'ready'
  if o.stage <> 'preparing' then
    raise exception 'Start this order before marking it ready.'
      using errcode = '22023', hint = 'wrong_stage';
  end if;

  update public.order set stage = 'ready', ready_at = now() where id = o.id;
  insert into public.order_event (order_id, kind, title, actor_type, actor_id)
  values (o.id, 'ready', 'Ready for the rider', 'merchant_user', v_uid);

  /* The rider search starts by itself. If it cannot (no pickup pin, say), the
     order is still ready and live operations see it waiting for a rider. */
  begin
    v_dispatch := dispatch.fn_job_start(o.id);
  exception when others then
    v_dispatch := jsonb_build_object('ok', false, 'message', sqlerrm);
    insert into public.order_event (order_id, kind, title, detail, actor_type)
    values (o.id, 'dispatch_not_started', 'Rider search did not start', sqlerrm, 'system');
  end;

  perform audit.log(p_actor_type => 'merchant_user'::public.actor_type, p_actor_id => v_uid,
    p_module => 'orders', p_action => 'order.merchant_ready',
    p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
    p_city_id => o.city_id, p_after => jsonb_build_object('dispatch', v_dispatch));

  return jsonb_build_object('ok', true, 'order_id', o.id, 'stage', 'ready',
                            'rider_search', coalesce((v_dispatch ->> 'ok')::boolean, false));
end;
$$;

comment on function public.rpc_merchant_order_step(uuid, text) is
  'The shop moves a delivery order on: start (placed/confirmed -> preparing, paid orders only) or ready (preparing -> ready, starts the rider search).';

revoke execute on function public.rpc_merchant_order_step(uuid, text) from public, anon;
grant execute on function public.rpc_merchant_order_step(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════ 3. the rider's steps

create or replace function public.rpc_rider_order_step(
  p_order_id uuid, p_step text, p_handed_to text default 'guest'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider uuid := dispatch.maps_rider_actor();
  v_uid uuid := (select auth.uid());
  o public.order;
  v_to public.order_stage;
  v_handed public.handoff_target;
begin
  select * into o from public.order where id = p_order_id for update;
  if not found or o.rider_id is distinct from v_rider
     or not exists (select 1 from dispatch.job j
                     where j.order_id = o.id and j.assigned_rider_id = v_rider
                       and j.state in ('assigned', 'manual_assigned') and j.ended_at is null) then
    raise exception 'This order is not assigned to you.' using errcode = 'P0002';
  end if;

  v_to := case p_step
    when 'picked_up' then 'picked_up'::public.order_stage
    when 'arriving' then 'arriving'::public.order_stage
    when 'delivered' then 'delivered'::public.order_stage
  end;
  if v_to is null then
    raise exception 'Unknown step: %.', p_step using errcode = '22023';
  end if;
  if o.stage = v_to then
    return jsonb_build_object('ok', true, 'order_id', o.id, 'stage', o.stage, 'already', true);
  end if;

  if (v_to = 'picked_up' and o.stage <> 'ready')
     or (v_to = 'arriving' and o.stage <> 'picked_up')
     or (v_to = 'delivered' and o.stage not in ('picked_up', 'arriving')) then
    raise exception 'This order is % and cannot be marked %.', o.stage, p_step
      using errcode = '22023', hint = 'wrong_stage';
  end if;

  if v_to = 'picked_up' then
    update public.order set stage = 'picked_up', picked_up_at = now() where id = o.id;
    insert into public.order_event (order_id, kind, title, actor_type, actor_id)
    values (o.id, 'picked_up', 'Picked up by your rider', 'rider', v_rider);
  elsif v_to = 'arriving' then
    update public.order set stage = 'arriving' where id = o.id;
    insert into public.order_event (order_id, kind, title, actor_type, actor_id)
    values (o.id, 'arriving', 'Your rider is nearly there', 'rider', v_rider);
  else
    begin
      v_handed := coalesce(nullif(p_handed_to, ''), 'guest')::public.handoff_target;
    exception when invalid_text_representation then
      raise exception 'Who took it? One of guest, askari, reception, lockbox, caretaker.'
        using errcode = '22023';
    end;
    update public.order
       set stage = 'delivered', delivered_at = now(), handed_to = v_handed
     where id = o.id;
    update dispatch.job set state = 'completed', ended_at = now(), end_reason = 'delivered'
     where order_id = o.id and state not in ('cancelled', 'completed');
    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id)
    values (o.id, 'delivered', 'Delivered', 'Handed to ' || v_handed::text, 'rider', v_rider);
  end if;

  perform audit.log(p_actor_type => 'rider'::public.actor_type, p_actor_id => v_rider,
    p_module => 'orders', p_action => 'order.rider_' || p_step,
    p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
    p_city_id => o.city_id,
    p_after => case when v_to = 'delivered'
                    then jsonb_build_object('handed_to', v_handed::text) end);

  return jsonb_build_object('ok', true, 'order_id', o.id, 'stage', v_to);
end;
$$;

comment on function public.rpc_rider_order_step(uuid, text, text) is
  'The assigned rider moves a delivery order on: picked_up, arriving, delivered (with who took it).';

revoke execute on function public.rpc_rider_order_step(uuid, text, text) from public, anon;
grant execute on function public.rpc_rider_order_step(uuid, text, text) to authenticated;

-- ═══════════════════════════════════════════════ 4. a guest sees the map

-- rpc_my_order_map: 20261220000200, for whichever session owns the order.
create or replace function public.rpc_my_order_map(p_order_id uuid)
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
  if v_account_id is null then
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
  'Read fixed location pins for an active order owned by this session (an account or a guest). Courier position: rpc_my_order_map(uuid, ''2'').';

revoke execute on function public.rpc_my_order_map(uuid) from public, anon, service_role;
grant execute on function public.rpc_my_order_map(uuid) to authenticated;

-- maps_rider_assignments: 20270108000200, with a guest customer counted too,
-- so a rider can share their position with a guest's order.
create or replace function dispatch.maps_rider_assignments(p_rider_id uuid)
returns table (
  order_id uuid, assignment_id uuid, assigned_at timestamptz, stage public.order_stage,
  customer_account_id uuid, can_share boolean
)
language sql stable security definer set search_path = '' as $$
  select o.id, j.id, j.assigned_at, o.stage, customer.id,
    o.stage in ('picked_up', 'arriving') and customer.id is not null
      and not exists (
        select 1 from public.order other_order
        where other_order.rider_id = p_rider_id and other_order.id <> o.id
          and dispatch.maps_order_is_active(other_order.stage)
      )
      and not exists (
        select 1 from dispatch.job other_job
        join public.order other_order on other_order.id = other_job.order_id
        where other_job.assigned_rider_id = p_rider_id and other_job.id <> j.id
          and other_job.state in ('assigned', 'manual_assigned') and other_job.ended_at is null
          and dispatch.maps_order_is_active(other_order.stage)
      )
  from public.order o
  join dispatch.job j on j.order_id = o.id and j.city_id = o.city_id
  left join public.guest g on g.id = o.guest_id and g.anonymised_at is null
  left join auth.users customer on customer.id = g.user_id
  where o.rider_id = p_rider_id and dispatch.maps_order_is_active(o.stage)
    and j.assigned_rider_id = p_rider_id and j.state in ('assigned', 'manual_assigned')
    and j.ended_at is null and isfinite(j.assigned_at);
$$;

revoke execute on function dispatch.maps_rider_assignments(uuid) from public, anon, authenticated, service_role;
