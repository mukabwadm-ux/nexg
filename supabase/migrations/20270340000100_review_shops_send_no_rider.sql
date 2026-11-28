-- Review shops never send a real rider (owner, 27 Nov 2026).
--
-- dispatch.fn_job_start already skips an order paid with Paystack test keys
-- (20270222000500). But an order at a test tenant (accepts_test_payments: the
-- App Store and Play review shops) that is not paid online, cash on delivery
-- say, still opened the rider search, and a real rider could be offered a
-- reviewer's order. Now no order at a test tenant opens it, however it is
-- paid. Staff finish these orders by hand (rpc_order_mark), as the reviewer
-- guide says.
--
-- Rollback: re-run dispatch.fn_job_start from 20270222000500.

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

  -- Paid with Paystack test keys (a review or test order, 20270222000500): no
  -- real rider is offered it. Staff finish it by hand (rpc_order_mark).
  if exists (select 1 from public.payment p
              where p.order_id = p_order_id and p.is_test and p.state = 'paid') then
    return jsonb_build_object('ok', true, 'test', true,
      'message', 'A test order: no rider is sent. Finish it from the console.');
  end if;

  -- At a test tenant (a review shop, 20270340000100), however it is paid:
  -- no real rider is offered it either.
  if exists (select 1 from public.merchant m
              where m.id = o.merchant_id and m.accepts_test_payments) then
    return jsonb_build_object('ok', true, 'test', true,
      'message', 'A review shop order: no rider is sent. Finish it from the console.');
  end if;

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

revoke execute on function dispatch.fn_job_start(uuid) from public, anon, authenticated;
grant execute on function dispatch.fn_job_start(uuid) to service_role;
