-- An order says what it needs carrying.
--
-- `dispatch.job.vehicle_requirements` existed and nothing ever
-- filled it, so every exclusion that depends on it — wrong vehicle,
-- not cleared for alcohol, not cleared for large items — could
-- never fire. A cascade test offered a bottle-shop run to a
-- bicycle. The requirement has to start on the order, because the
-- order is where somebody knows what is in the bag.

alter table public.order
  add column if not exists carry_requirements text[] not null default '{}';

comment on column public.order.carry_requirements is
  'What the rider must be able to carry: a vehicle type, ''alcohol'', ''large_items''. Checked against the rider''s own clearances, which is why a dispatcher cannot override those two by hand.';

create or replace function dispatch.rpc_job_start(p_order_id uuid)
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

  /*
   * Whatever the order declared, plus alcohol if it came from a
   * bar. That one is a licence rather than a preference, so it is
   * not left to whoever placed the order to remember.
   */
  v_needs := o.carry_requirements;
  if exists (select 1 from public.merchant m
              where m.id = o.merchant_id and m.category = 'bar_liquor')
     and not ('alcohol' = any (v_needs)) then
    v_needs := v_needs || 'alcohol';
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
    /* Frozen: a job that started on a 20-second window is judged
       against a 20-second window. */
    jsonb_build_object(
      'accept_window_s', settings.fn_get('dispatch.accept_window_s', 'city', o.city_id) ->> 'version_id',
      'rounds', settings.fn_get('dispatch.rounds_before_boost', 'city', o.city_id) ->> 'version_id',
      'radius', settings.fn_get('dispatch.search_radius_km', 'city', o.city_id) ->> 'version_id'))
  returning id into v_job;

  perform dispatch.fn_offer_round(v_job);

  return jsonb_build_object('ok', true, 'job_id', v_job, 'needs', to_jsonb(v_needs));
end;
$$;

grant execute on function dispatch.rpc_job_start(uuid) to authenticated, service_role;
