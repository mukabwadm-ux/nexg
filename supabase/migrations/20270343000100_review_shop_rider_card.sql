-- Review shop deliveries show a rider card and an arrival time (owner, 28 Nov 2026).
--
-- The pretend rider (20270341000100) moved on the map, but the app had no
-- rider to show on its card and no arrival time. Now:
--   * when a review shop order is picked up, its eta_at (and, if unset,
--     promised_delivery_at) is set four minutes ahead, the time it arrives;
--   * while the pretend rider is on the map, rpc_my_order_map(order, '2') also
--     answers `rider`: a made-up name, 'NexG Rider', motorbike and plate, the
--     same for the whole trip, marked reviewShop. No phone number is made up,
--     so no stranger's number is ever shown. The courier object is unchanged.
-- Nothing is stored for the rider and no rider account is used. Real shops are
-- untouched: both changes only apply to merchants that accept test payments.
--
-- Rollback: re-run both functions from 20270341000100.

create or replace function public.cron_review_shop_orders()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  v_to public.order_stage;
  v_title text;
  v_moved integer := 0;
begin
  for o in
    select ord.id, ord.reference, ord.city_id, ord.stage,
           coalesce(ord.fulfilment::text, 'delivery') as fulfilment
      from public.order ord
      join public.merchant m on m.id = ord.merchant_id and m.accepts_test_payments
     where ord.stage in ('placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'arriving')
       and ord.payment_status in ('paid', 'collected')
       and coalesce(ord.fulfilment::text, 'delivery') in ('delivery', 'pickup')
       and coalesce((select max(e.at) from public.order_event e where e.order_id = ord.id),
                    ord.placed_at)
           < now() - case when ord.stage = 'picked_up' then interval '3 minutes' else interval '1 minute' end
     order by ord.placed_at
     limit 200
     for update of ord skip locked
  loop
    begin
      if o.stage in ('placed', 'confirmed') then
        update public.order
           set stage = 'preparing', confirmed_at = coalesce(confirmed_at, now())
         where id = o.id;
        v_to := 'preparing'; v_title := 'Being prepared';
      elsif o.stage = 'preparing' then
        update public.order set stage = 'ready', ready_at = now() where id = o.id;
        v_to := 'ready';
        v_title := case when o.fulfilment = 'pickup' then 'Ready to collect' else 'Ready for the rider' end;
      elsif o.stage = 'ready' and o.fulfilment = 'pickup' then
        update public.order set stage = 'delivered', delivered_at = now() where id = o.id;
        v_to := 'delivered'; v_title := 'Collected';
      elsif o.stage = 'ready' then
        -- The rider's arrival time: four minutes on the road (three picked up, one arriving).
        update public.order
           set stage = 'picked_up', picked_up_at = now(),
               eta_at = now() + interval '4 minutes',
               promised_delivery_at = coalesce(promised_delivery_at, now() + interval '4 minutes')
         where id = o.id;
        v_to := 'picked_up'; v_title := 'Picked up by your rider';
      elsif o.stage = 'picked_up' then
        update public.order set stage = 'arriving' where id = o.id;
        v_to := 'arriving'; v_title := 'Your rider is nearly there';
      else
        update public.order
           set stage = 'delivered', delivered_at = now(), handed_to = 'guest'
         where id = o.id;
        v_to := 'delivered'; v_title := 'Delivered';
      end if;

      insert into public.order_event (order_id, kind, title, actor_type, actor_label, payload)
      values (o.id, v_to::text, v_title, 'system', '[System] · review shop',
              jsonb_build_object('review_shop', true));

      perform audit.log(
        p_actor_type => 'system'::public.actor_type, p_module => 'orders',
        p_action => 'order.review_shop_step', p_actor_label => '[System] · review shop',
        p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
        p_city_id => o.city_id, p_context => jsonb_build_object('to', v_to::text));
      v_moved := v_moved + 1;
    exception when others then
      raise warning 'Review shop order % did not move on: %', o.reference, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'moved', v_moved);
end;
$$;

comment on function public.cron_review_shop_orders() is
  'Moves paid delivery and pickup orders at review shops (test tenants) on by one stage a minute (three minutes on the road), with no shop or rider (20270343000100).';

revoke execute on function public.cron_review_shop_orders() from public, anon, authenticated;
grant execute on function public.cron_review_shop_orders() to service_role;

create or replace function public.rpc_my_order_map(p_order_id uuid, p_contract_version text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_map jsonb;
  v_courier jsonb;
  v_now timestamptz := statement_timestamp();
  v_review record;
  v_from jsonb;
  v_to jsonb;
  v_f double precision;
  v_rider jsonb;
  v_h bigint;
begin
  if p_contract_version is distinct from '2' then
    raise exception 'Unsupported order map version.' using errcode = '22023';
  end if;
  v_map := public.rpc_my_order_map(p_order_id) || '{"contractVersion":"2"}'::jsonb;
  if v_map->>'reason' = 'completed' then return v_map; end if;

  select jsonb_build_object(
    'latitude', s.latitude, 'longitude', s.longitude, 'observedAt', s.observed_at,
    'expiresAt', s.expires_at, 'vehicle',
    case when r.vehicle::text in ('motorbike', 'bicycle', 'car', 'tuktuk') then r.vehicle::text else 'unknown' end
  ) into v_courier
  from dispatch.maps_rider_share s
  join public.rider r on r.id = s.rider_id and r.user_id = s.rider_account_id
    and r.status = 'active' and r.offboarded_at is null
  join auth.users rider_account on rider_account.id = s.rider_account_id
    and not coalesce(rider_account.is_anonymous, false)
  join lateral dispatch.maps_rider_assignments(r.id) a
    on a.order_id = s.order_id and a.assignment_id = s.assignment_id
    and a.assigned_at = s.assigned_at and a.customer_account_id = s.customer_account_id
    and a.can_share
  where s.order_id = p_order_id and s.customer_account_id = auth.uid()
    and s.observed_at <= v_now and s.expires_at > v_now and s.lease_expires_at > v_now;

  /* A review shop order on the road: a pretend rider between the two pins.
     rpc_my_order_map(uuid) above has already checked the order is the
     caller's own. */
  if v_courier is null and v_map->>'stage' in ('picked_up', 'arriving') then
    select o.picked_up_at into v_review
      from public.order o
      join public.merchant m on m.id = o.merchant_id and m.accepts_test_payments
     where o.id = p_order_id;
    select p into v_from from jsonb_array_elements(v_map->'places') p where p->>'role' = 'pickup';
    select p into v_to from jsonb_array_elements(v_map->'places') p where p->>'role' = 'dropoff';
    if v_review is not null and v_from is not null and v_to is not null then
      v_f := least(0.97, greatest(0.03,
        extract(epoch from v_now - coalesce(v_review.picked_up_at, v_now)) / 240.0));
      v_courier := jsonb_build_object(
        'latitude', (v_from->>'latitude')::double precision
                    + v_f * ((v_to->>'latitude')::double precision - (v_from->>'latitude')::double precision),
        'longitude', (v_from->>'longitude')::double precision
                    + v_f * ((v_to->>'longitude')::double precision - (v_from->>'longitude')::double precision),
        'observedAt', v_now, 'expiresAt', v_now + interval '30 seconds', 'vehicle', 'motorbike');
      /* The pretend rider's card: a made-up name and plate, the same for the
         whole trip (worked out from the order id), marked as review-shop data. */
      v_h := ('x' || substr(md5(p_order_id::text), 1, 8))::bit(32)::bigint;
      v_rider := jsonb_build_object(
        'name', (array['Brian Otieno', 'Grace Wanjiru', 'Kevin Mwangi', 'Faith Achieng',
                       'Dennis Kiprono', 'Mercy Njeri', 'Samuel Kamau', 'Lucy Atieno'])[(1 + v_h % 8)::int],
        'role', 'NexG Rider',
        'vehicle', 'Motorbike · KM' || chr(65 + (v_h / 8 % 26)::int) || ' '
                   || (100 + v_h % 900)::text || chr(65 + (v_h / 208 % 26)::int),
        'plate', 'KM' || chr(65 + (v_h / 8 % 26)::int) || ' '
                 || (100 + v_h % 900)::text || chr(65 + (v_h / 208 % 26)::int),
        'reviewShop', true);
    end if;
  end if;

  if v_courier is null then return v_map; end if;
  return (v_map - 'reason') || jsonb_build_object('status', 'live', 'courier', v_courier)
         || case when v_rider is null then '{}'::jsonb else jsonb_build_object('rider', v_rider) end;
end;
$$;

revoke execute on function public.rpc_my_order_map(uuid, text) from public, anon, service_role;
grant execute on function public.rpc_my_order_map(uuid, text) to authenticated;
