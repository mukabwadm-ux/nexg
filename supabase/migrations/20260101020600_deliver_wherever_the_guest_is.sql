-- Deliver wherever the guest is, inside a city we serve.
--
-- Until now a delivery address had to fall inside one of the drawn
-- zones — six rectangles in Nairobi, none at all in Mombasa or
-- Kisumu — and everywhere else was "outside coverage". The zones
-- stay, and still decide ETA, tier and the emergency pause where they
-- exist. But a point that is in no zone is now served when it is
-- within its city's radius (`city.max_radius_km`, 30 km unless staff
-- set otherwise) of a live or soft-launch city.
--
-- That moved the delivery fee off the zone. A zone's band was the
-- only input to the fee, and an address in no zone fell back to band
-- 1 — the ≤3 km price for a trip of any length. The band is now the
-- straight-line distance from the merchant's branch to the door,
-- with a fourth band beyond 8 km and a maximum past which the order
-- is refused. Both new fees are seeded NULL, like every other money
-- figure here: nobody has agreed them yet.
--
-- Merchants follow the same rule: a store anywhere inside its city's
-- radius can be added and onboarded, not only one inside a zone.

-- ═══════════════════════════════════════════════ how far a city reaches

update public.city
   set max_radius_km = 30
 where max_radius_km is null
   and status in ('live', 'soft_launch');

-- ═══════════════════════════════════════════════ fees by distance

update settings.definition
   set help = 'Up to 3 km from the merchant to the door.'
 where key = 'fees.delivery.band_1';
update settings.definition
   set help = '3–6 km from the merchant to the door.'
 where key = 'fees.delivery.band_2';
update settings.definition
   set help = '6–8 km from the merchant to the door.'
 where key = 'fees.delivery.band_3';

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort)
values
  ('fees.delivery.band_4', 'fees', 'city', 'money', 'KES',
   'Delivery · Band 4 · long',
   'Over 8 km from the merchant to the door, up to the maximum distance.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 112),
  ('fees.delivery.max_km', 'fees', 'city', 'int', 'km',
   'Maximum delivery distance',
   'Straight line, merchant to door. Further than this and the order is refused rather than sent with a rider who cannot reasonably make it.',
   false, false, 'single:ops_manager', '{orders,web}', '15'::jsonb, 112)
on conflict (key) do nothing;

-- ═══════════════════════════════════════════════ which city serves a point

/*
 * The nearest live or soft-launch city whose radius reaches this
 * point, or no row. Waitlist cities never serve: a city we have not
 * opened has no riders to send.
 */
create or replace function public.fn_serving_city(p_point extensions.geography)
returns table (
  id uuid,
  name text,
  slug text,
  status public.city_status,
  km numeric,
  radius_km numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.slug, c.status,
         round((extensions.st_distance(p_point, c.centre) / 1000)::numeric, 1) as km,
         coalesce(c.max_radius_km, 30)::numeric as radius_km
    from public.city c
   where c.centre is not null
     and c.status in ('live', 'soft_launch')
     and extensions.st_distance(p_point, c.centre) <= coalesce(c.max_radius_km, 30) * 1000
   order by extensions.st_distance(p_point, c.centre)
   limit 1
$$;

comment on function public.fn_serving_city is
  'The live or soft-launch city whose radius reaches this point, nearest first. No row means nobody can deliver there.';

revoke execute on function public.fn_serving_city(extensions.geography) from public, anon;
grant execute on function public.fn_serving_city(extensions.geography)
  to authenticated, service_role;

-- ═══════════════════════════════════════════════ which band a trip is

/*
 * Straight-line distance from the merchant to the door, and the band
 * that prices it. Straight line under-reads a road trip, which is why
 * the bands stop at 8 km and the maximum is a setting: ops widen or
 * narrow it once real trips show how far off it is.
 */
create or replace function public.fn_delivery_band(
  p_city_id uuid,
  p_from extensions.geography,
  p_to extensions.geography
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_km numeric;
  v_max integer;
begin
  if p_from is null or p_to is null then
    return jsonb_build_object('ok', false,
      'message', 'Both ends of the trip need a pin before it can be priced.');
  end if;

  v_km := round((extensions.st_distance(p_from, p_to) / 1000)::numeric, 1);
  v_max := coalesce(settings.fn_int('fees.delivery.max_km', p_city_id), 15);

  if v_km > v_max then
    return jsonb_build_object('ok', false, 'km', v_km, 'max_km', v_max,
      'message', 'That is ' || v_km || ' km from the store. We deliver up to '
        || v_max || ' km, so a nearer branch or merchant is the way to get this one.');
  end if;

  return jsonb_build_object('ok', true, 'km', v_km, 'max_km', v_max,
    'band', case when v_km <= 3 then 1 when v_km <= 6 then 2 when v_km <= 8 then 3 else 4 end);
end;
$$;

comment on function public.fn_delivery_band is
  'Merchant-to-door distance and the fee band it falls in, or a refusal past fees.delivery.max_km.';

revoke execute on function public.fn_delivery_band(uuid, extensions.geography, extensions.geography)
  from public, anon;
grant execute on function public.fn_delivery_band(uuid, extensions.geography, extensions.geography)
  to authenticated, service_role;

-- ════════════════════════════════════ pricing accepts band 4

create or replace function public.fn_price_order(
  p_city_id uuid,
  p_category text,
  p_subtotal_cents bigint,
  p_band smallint default 1,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  v_delivery bigint;
  v_service numeric;
  v_threshold bigint;
  v_small bigint;
  v_cash bigint;
  v_commission numeric;
  v_missing text[] := '{}';
  v_key text;
begin
  v_key := 'fees.delivery.band_' || greatest(1, least(4, coalesce(p_band, 1)));
  v_delivery := settings.fn_int(v_key, p_city_id);
  v_service := settings.fn_num('fees.service_pct', p_city_id);
  v_threshold := settings.fn_int('fees.small_basket_threshold', p_city_id);
  v_small := settings.fn_int('fees.small_basket_fee', p_city_id);
  v_cash := coalesce(settings.fn_int('fees.cash_handling', p_city_id), 0);
  v_commission := settings.fn_num('fees.commission', p_city_id, p_category);

  /* The casts matter: `text[] || 'literal'` resolves to array-||-array
     and fails on a bare string, which is a runtime error nothing
     catches until somebody tries to price an order. */
  if v_delivery is null then v_missing := v_missing || v_key; end if;
  if v_service is null then v_missing := v_missing || 'fees.service_pct'::text; end if;
  if v_commission is null then v_missing := v_missing || 'fees.commission'::text; end if;

  if array_length(v_missing, 1) > 0 then
    return jsonb_build_object(
      'ok', false,
      'missing', to_jsonb(v_missing),
      'message', 'This city has no published price for '
        || array_to_string(v_missing, ', ')
        || '. An order cannot be priced against a fee nobody agreed.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'subtotal_cents', p_subtotal_cents,
    'delivery_fee_cents', v_delivery,
    'service_fee_cents', round(p_subtotal_cents * v_service / 100.0),
    'small_basket_fee_cents',
      case when v_threshold is not null and v_small is not null
                and p_subtotal_cents < v_threshold
           then v_small else 0 end,
    'cash_handling_cents', v_cash,
    'commission_pct', v_commission,
    'commission_cents', round(p_subtotal_cents * v_commission / 100.0),
    /* The version of every figure above, so the order can explain
       itself after the rate card moves. */
    'pricing_version_ids', jsonb_build_object(
      'delivery', settings.fn_get(v_key, 'city', p_city_id, null, null, p_at) ->> 'version_id',
      'service', settings.fn_get('fees.service_pct', 'city', p_city_id, null, null, p_at) ->> 'version_id',
      'commission', settings.fn_get('fees.commission', 'city_category', p_city_id, null, p_category, p_at) ->> 'version_id'));
end;
$$;

-- ════════════════════════════ a desk order is priced by distance

create or replace function public.rpc_order_manual_create(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_city uuid := (p_payload ->> 'city_id')::uuid;
  v_merchant uuid := (p_payload ->> 'merchant_id')::uuid;
  v_branch uuid := (p_payload ->> 'branch_id')::uuid;
  v_phone text := nullif(trim(p_payload ->> 'guest_phone'), '');
  v_point extensions.geography;
  v_zone jsonb;
  v_guest uuid;
  v_order uuid;
  v_subtotal bigint := 0;
  v_price jsonb;
  v_band smallint;
  v_from extensions.geography;
  v_distance jsonb;
  v_total bigint;
  it jsonb;
begin
  v_me := public.fn_order_require(v_city, 'take an order');

  if v_phone is null then
    raise exception 'A number for the guest. Without one there is no way to tell them anything.';
  end if;
  if not coalesce((p_payload -> 'consent_read')::boolean, false) then
    raise exception 'Read the consent line first, and tick that you did. It is what makes holding this guest''s number lawful.';
  end if;
  if v_merchant is null or v_branch is null then
    raise exception 'Which merchant, and which branch.';
  end if;
  if coalesce(jsonb_array_length(p_payload -> 'items'), 0) = 0 then
    raise exception 'An order with no items.';
  end if;

  if p_payload ? 'lat' and p_payload ? 'lng' then
    v_point := extensions.st_setsrid(extensions.st_makepoint(
      (p_payload ->> 'lng')::float, (p_payload ->> 'lat')::float), 4326)::extensions.geography;
    v_zone := public.fn_zone_serviceable(v_point);
    if not (v_zone ->> 'ok')::boolean then
      raise exception '%', v_zone ->> 'reason';
    end if;
  end if;

  select id into v_guest from public.guest where phone = v_phone;
  if v_guest is null then
    insert into public.guest (phone, name)
    values (v_phone, nullif(trim(p_payload ->> 'guest_name'), ''))
    returning id into v_guest;
  end if;

  if (select blocked from public.guest where id = v_guest) then
    raise exception 'That guest is blocked. Support lifts a block, not the desk.';
  end if;

  for it in select * from jsonb_array_elements(p_payload -> 'items') loop
    v_subtotal := v_subtotal
      + (it ->> 'quantity')::integer * (it ->> 'unit_price_cents')::bigint;
  end loop;

  /* The band is the distance a rider actually covers, merchant to
     door, not the zone the door happens to sit in. Without a pin the
     desk order keeps the old behaviour: the zone's band, else band 1. */
  if v_point is not null then
    select b.location into v_from from public.merchant_branch b where b.id = v_branch;
  end if;

  if v_point is not null and v_from is not null then
    v_distance := public.fn_delivery_band(v_city, v_from, v_point);
    if not (v_distance ->> 'ok')::boolean then
      raise exception '%', v_distance ->> 'message';
    end if;
    v_band := (v_distance ->> 'band')::smallint;
  else
    select z.delivery_band into v_band from public.zone z
     where z.id = (v_zone ->> 'zone_id')::uuid;
  end if;

  v_price := public.fn_price_order(
    v_city,
    (select m.category::text from public.merchant m where m.id = v_merchant),
    v_subtotal, coalesce(v_band, 1::smallint));

  if not (v_price ->> 'ok')::boolean then
    raise exception '%', v_price ->> 'message';
  end if;

  v_total := (v_price ->> 'subtotal_cents')::bigint
           + (v_price ->> 'delivery_fee_cents')::bigint
           + (v_price ->> 'service_fee_cents')::bigint
           + (v_price ->> 'small_basket_fee_cents')::bigint
           + (v_price ->> 'cash_handling_cents')::bigint;

  insert into public.order (
    reference, guest_id, merchant_id, branch_id, city_id,
    zone_id, channel, created_by_staff_id,
    dropoff_label, dropoff_point, dropoff_note, delivery_context,
    stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents,
    small_basket_fee_cents, cash_handling_cents, total_cents,
    commission_cents, commission_pct, currency, pricing_version_ids,
    carry_requirements, scheduled_for)
  values (
    public.fn_order_reference(), v_guest, v_merchant, v_branch, v_city,
    (v_zone ->> 'zone_id')::uuid, 'manual', v_me,
    coalesce(nullif(trim(p_payload ->> 'dropoff_label'), ''), 'Given on the phone'),
    v_point,
    nullif(trim(p_payload ->> 'dropoff_note'), ''),
    coalesce(p_payload -> 'delivery_context', '{}'::jsonb),
    'placed',
    coalesce(nullif(p_payload ->> 'payment_method', ''), 'cash_on_delivery')::public.order_payment_method,
    'pending',
    (v_price ->> 'subtotal_cents')::bigint,
    (v_price ->> 'delivery_fee_cents')::bigint,
    (v_price ->> 'service_fee_cents')::bigint,
    (v_price ->> 'small_basket_fee_cents')::bigint,
    (v_price ->> 'cash_handling_cents')::bigint,
    v_total,
    (v_price ->> 'commission_cents')::bigint,
    (v_price ->> 'commission_pct')::numeric,
    'KES',
    v_price -> 'pricing_version_ids',
    coalesce(array(select jsonb_array_elements_text(p_payload -> 'carry_requirements')), '{}'),
    (p_payload ->> 'scheduled_for')::timestamptz)
  returning id into v_order;

  insert into public.order_item (order_id, name, quantity, unit_price_cents, line_total_cents, note)
  select v_order, c ->> 'name', (c ->> 'quantity')::integer,
         (c ->> 'unit_price_cents')::bigint,
         (c ->> 'quantity')::integer * (c ->> 'unit_price_cents')::bigint,
         nullif(c ->> 'note', '')
    from jsonb_array_elements(p_payload -> 'items') c;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (v_order, 'placed', 'Placed by the desk',
          'Taken on the phone · consent read · '
            || coalesce(nullif(p_payload ->> 'payment_method', ''), 'cash_on_delivery'),
          'staff', v_me, jsonb_build_object('channel', 'manual'));

  insert into public.notification_log (channel, recipient, template, payload, status)
  values ('sms', v_phone, 'guest_order_tracking',
          jsonb_build_object('order', (select reference from public.order where id = v_order)),
          'queued');

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'orders',
    p_action => 'order.manual_created', p_actor_id => v_me,
    p_target_type => 'order', p_target_id => v_order,
    p_target_label => (select reference from public.order where id = v_order),
    p_city_id => v_city, p_severity => 'notice',
    p_after => jsonb_build_object('amount_cents', v_total, 'currency', 'KES',
                                  'channel', 'manual'),
    p_context => jsonb_build_object('pii', array['phone']));

  return jsonb_build_object('ok', true, 'order_id', v_order,
    'reference', (select reference from public.order where id = v_order),
    'total_cents', v_total,
    'message', 'Taken. The guest has a tracking SMS queued — nothing drains the queue yet, so tell them the number on the call.');
end;
$$;

-- ═══════════════════════════════════ any point in a city we serve

create or replace function rpc_coverage_lookup(
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_point extensions.geography;
  v_zone record;
  v_near record;
  v_city record;
  v_serve record;
begin
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('coverage', 'unknown',
      'message', 'That does not look like a place on earth.');
  end if;

  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  /* Inside a live zone: the ordinary case, answered first. */
  select z.id, z.name, z.tier, z.eta_min, z.eta_max, z.cod_allowed,
         c.id as city_id, c.name as city_name, c.slug as city_slug, c.status as city_status,
         coalesce(h.paused, false) as paused, h.paused_reason
    into v_zone
    from public.zone z
    join public.city c on c.id = z.city_id
    left join dispatch.zone_health h on h.zone_id = z.id
   where z.active and extensions.st_covers(z.polygon, v_point)
   order by z.tier
   limit 1;

  if found then
    return jsonb_build_object(
      'coverage', 'covered',
      'zone_id', v_zone.id,
      'zone', v_zone.name,
      'tier', v_zone.tier,
      'eta_min', v_zone.eta_min,
      'eta_max', v_zone.eta_max,
      'cod_allowed', v_zone.cod_allowed,
      'city_id', v_zone.city_id,
      'city', v_zone.city_name,
      'city_slug', v_zone.city_slug,
      'paused', v_zone.paused,
      /* A paused zone is still covered. It is not a coverage
         problem and must not be worded as one — we deliver here,
         just not this minute, and the two call for different
         things from the visitor. */
      'message', case when v_zone.paused
        then 'Deliveries in ' || v_zone.name || ' are paused right now'
             || coalesce(' · ' || v_zone.paused_reason, '') || '.'
        else null end);
  end if;

  /* Not in a drawn zone, but inside the radius of a city we trade
     in: we deliver here too. No zone means no zone ETA or tier, so
     those are left out rather than borrowed from a zone the guest
     is not in. */
  select * into v_serve from public.fn_serving_city(v_point);

  if v_serve.id is not null then
    return jsonb_build_object(
      'coverage', 'covered',
      'served_by', 'city',
      'zone_id', null,
      'zone', null,
      'city_id', v_serve.id,
      'city', v_serve.name,
      'city_slug', v_serve.slug,
      'km_from_centre', v_serve.km,
      'cod_allowed', true,
      'paused', false,
      'message', null);
  end if;

  /* Beyond every city we serve. Which city is this, and how far is
     the nearest place we actually serve? */
  select c.id, c.name, c.slug, c.status,
         extensions.st_distance(v_point, c.centre) as metres
    into v_city
    from public.city c
   where c.centre is not null
   /* Plain distance, not the <-> index operator: that one needs
      both sides to be geometry, and there are eleven cities. */
   order by extensions.st_distance(v_point, c.centre)
   limit 1;

  select z.id, z.name, c.name as city_name, c.slug as city_slug,
         extensions.st_distance(v_point, z.polygon) as metres
    into v_near
    from public.zone z
    join public.city c on c.id = z.city_id
   where z.active
   order by extensions.st_distance(v_point, z.polygon)
   limit 1;

  /*
   * A city on the list but not trading. Ordering is closed and
   * the page says so; it does not pretend the nearest Nairobi
   * zone is an option for somebody in Kampala.
   */
  if v_city.id is not null
     and v_city.status = 'waitlist'
     and v_city.metres < 100000 then
    return jsonb_build_object(
      'coverage', 'unlaunched',
      'city_id', v_city.id, 'city', v_city.name, 'city_slug', v_city.slug,
      'city_status', v_city.status,
      'message', v_city.name || ' is on our list, not live yet.');
  end if;

  /* The nearest city we do serve, measured to the edge of its
     radius, because that is how much further somebody would have
     to be. */
  select c.id, c.name, c.slug,
         greatest(0, extensions.st_distance(v_point, c.centre) / 1000
                     - coalesce(c.max_radius_km, 30)) as km
    into v_near
    from public.city c
   where c.centre is not null and c.status in ('live', 'soft_launch')
   order by extensions.st_distance(v_point, c.centre) / 1000 - coalesce(c.max_radius_km, 30)
   limit 1;

  if v_near.id is null then
    return jsonb_build_object('coverage', 'outside',
      'message', 'That is outside every area we deliver to.');
  end if;

  return jsonb_build_object(
    'coverage', 'outside',
    'nearest_city', v_near.name,
    'nearest_city_slug', v_near.slug,
    'nearest_km', round(v_near.km::numeric, 1),
    'message', 'We do not deliver there yet. The nearest city we serve is '
      || v_near.name || ', ' || round(v_near.km::numeric, 1) || ' km beyond our delivery area.');
end;
$$;

-- ══════════════════════════════════════ checkout asks the same

create or replace function public.fn_zone_serviceable(p_point extensions.geography)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zone jsonb;
  v_city record;
begin
  /* A drawn zone still decides first: an inactive one is staff saying
     "not here", and a paused one is the emergency stop. Both refuse. */
  select jsonb_build_object(
           'ok', z.active and not coalesce(h.paused, false),
           'zone_id', z.id,
           'zone', z.name,
           'city_id', z.city_id,
           'reason', case
             when not z.active then 'We are not delivering in this area yet.'
             when coalesce(h.paused, false) then
               'Deliveries here are paused right now'
               || coalesce(' · ' || h.paused_reason, '') || '.'
             end)
    into v_zone
    from public.zone z
    left join dispatch.zone_health h on h.zone_id = z.id
   where extensions.st_intersects(z.polygon, p_point)
   order by z.active desc, z.tier
   limit 1;

  if v_zone is not null then
    return v_zone;
  end if;

  /* No zone: served if it is inside the radius of a city we trade in. */
  select * into v_city from public.fn_serving_city(p_point);
  if v_city.id is not null then
    return jsonb_build_object('ok', true, 'zone_id', null, 'zone', null,
      'city_id', v_city.id, 'served_by', 'city', 'reason', null);
  end if;

  return jsonb_build_object('ok', false, 'zone_id', null,
    'reason', 'That address is further than we deliver from any city we serve.');
end;
$$;


-- ═══════════════════════════════ a store anywhere in its city

create or replace function public.rpc_merchant_add_store(
  p_merchant_id uuid,
  p_name text,
  p_address text,
  p_lat double precision,
  p_lng double precision,
  p_make_primary boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  m public.merchant;
  z record;
  v_serve_city uuid;
  v_branch uuid;
  v_count integer;
begin
  perform public.fn_merchant_mine(p_merchant_id);
  v_me := (select auth.uid());
  select * into m from public.merchant where id = p_merchant_id;

  if m.status in ('suspended', 'delisted') then
    raise exception 'Your account is %. Talk to us before opening another store.', m.status;
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'What do guests call this one?';
  end if;
  if coalesce(trim(p_address), '') = '' then
    raise exception 'Where is it? A rider has to find the door.';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'Drop a pin on the map. An address without one is a street, not a door.';
  end if;

  if exists (select 1 from public.merchant_branch b
              where b.merchant_id = p_merchant_id and b.closed_at is null
                and lower(trim(b.name)) = lower(trim(p_name))) then
    raise exception 'You already have a store called %.', trim(p_name);
  end if;

  select * into z from public.zone_for_point(p_lng, p_lat);
  if z.id is null then
    /* No drawn zone: fine, if it is inside a city we trade in. */
    select s.id into v_serve_city from public.fn_serving_city(
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography) s;
    if v_serve_city is null then
      raise exception 'That address is outside every area NexG delivers to. Tell us where you are opening and we will look at the map — we would rather add the area than take orders we cannot deliver.';
    end if;
  end if;

  /* A store in another city is a different business as far as fees,
     zones and settlement are concerned. */
  if coalesce(z.city_id, v_serve_city) <> m.city_id then
    raise exception 'That is in a different city from the rest of your business. Opening there means a separate registration, so that the fees and the payouts are right.';
  end if;

  insert into public.merchant_branch
    (merchant_id, name, address_text, latitude, longitude, zone_id,
     is_primary, inherits_hours, source, sort)
  values (
    p_merchant_id, trim(p_name), trim(p_address), p_lat, p_lng, z.id,
    coalesce(p_make_primary, false) or not exists (
      select 1 from public.merchant_branch b
       where b.merchant_id = p_merchant_id and b.closed_at is null),
    true, 'manual',
    coalesce((select max(sort) + 1 from public.merchant_branch b
               where b.merchant_id = p_merchant_id), 1))
  returning id into v_branch;

  if coalesce(p_make_primary, false) then
    update public.merchant_branch set is_primary = (id = v_branch)
     where merchant_id = p_merchant_id;
  end if;

  select count(*) into v_count from public.merchant_branch
   where merchant_id = p_merchant_id and closed_at is null;

  insert into public.merchant_message
    (merchant_id, direction, channel, subject, body)
  values (p_merchant_id, 'out', 'in_app', 'New store added',
          trim(p_name) || ' is on file and waiting for a check before it takes orders.');

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type, p_module => 'merchants',
    p_action => 'merchant.store_added',
    p_actor_label => '[Merchant] ' || coalesce(m.trading_name, m.legal_name),
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_target_label => coalesce(m.trading_name, m.legal_name),
    p_city_id => m.city_id, p_severity => 'notice',
    p_after => jsonb_build_object('branch_id', v_branch, 'name', trim(p_name),
                                  'zone', z.name, 'stores_now', v_count));

  return jsonb_build_object('ok', true, 'branch_id', v_branch, 'zone', z.name,
    'stores', v_count,
    'message', trim(p_name) || ' added in ' || z.name
      || '. We check a new store before it starts taking orders — usually the same day.');
end;
$$;

-- ══════════════════════════ onboarding takes the city from the radius

create or replace function public.rpc_merchant_set_branches(
  p_merchant_id uuid,
  p_branches jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  b jsonb;
  v_zone record;
  v_serve_city uuid;
  v_serve_name text;
  v_primary_city uuid;
  v_seen_primary boolean := false;
  v_out jsonb := '[]'::jsonb;
  v_idx integer := 0;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);

  if jsonb_typeof(p_branches) <> 'array' or jsonb_array_length(p_branches) = 0 then
    raise exception 'We need at least one place to collect from.'
      using errcode = 'check_violation';
  end if;

  delete from public.merchant_branch where merchant_id = m.id;

  for b in select value from jsonb_array_elements(p_branches)
  loop
    v_zone := null;
    v_serve_city := null;
    v_serve_name := null;

    if (b ->> 'lat') is not null and (b ->> 'lng') is not null then
      select * into v_zone
      from public.zone_for_point((b ->> 'lng')::double precision, (b ->> 'lat')::double precision);
      if v_zone.id is null then
        select s.id, s.name into v_serve_city, v_serve_name from public.fn_serving_city(
          extensions.st_setsrid(extensions.st_makepoint(
            (b ->> 'lng')::double precision, (b ->> 'lat')::double precision), 4326)::extensions.geography) s;
      end if;
    end if;

    insert into public.merchant_branch (
      merchant_id, name, address_text, latitude, longitude,
      zone_id, is_primary, inherits_hours, source, sort
    )
    values (
      m.id,
      nullif(trim(b ->> 'name'), ''),
      nullif(trim(b ->> 'address_text'), ''),
      (b ->> 'lat')::double precision,
      (b ->> 'lng')::double precision,
      v_zone.id,
      not v_seen_primary,
      coalesce((b ->> 'inherits_hours')::boolean, v_seen_primary),
      coalesce(b ->> 'source', 'manual'),
      v_idx
    );

    if not v_seen_primary then
      v_primary_city := coalesce(v_zone.city_id, v_serve_city);
      v_seen_primary := true;
    end if;

    v_out := v_out || jsonb_build_object(
      'address_text', b ->> 'address_text',
      'zone', v_zone.name,
      'tier', v_zone.tier,
      'eta_min', v_zone.eta_min,
      'eta_max', v_zone.eta_max,
      'cod_allowed', v_zone.cod_allowed,
      'served', v_zone.id is not null or v_serve_city is not null,
      'city', v_serve_name
    );

    v_idx := v_idx + 1;
  end loop;

  update public.merchant
  set city_id = coalesce(v_primary_city, city_id),
      onboarding_step = greatest(onboarding_step, 4)
  where id = m.id;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.branch_set',
    p_target_type => 'merchant',
    p_target_id => m.id,
    p_after => jsonb_build_object('branches', jsonb_array_length(p_branches), 'zones', v_out)
  );

  return jsonb_build_object(
    'branches', v_out,
    'readiness', public.fn_merchant_readiness(m.id)
  );
end;
$$;

-- ═════════════════════════════════════ ready anywhere we serve

create or replace function public.fn_merchant_readiness(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_questions jsonb;
  v_basics boolean := false;
  v_location boolean := false;
  v_hours boolean := false;
  v_documents boolean := false;
  v_payout boolean := false;
  v_items boolean := false;
  v_done integer;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    return null;
  end if;

  /*
   * Security definer, so it has to police itself. The readiness of a business
   * says whether they have uploaded their ID and set up a payout account —
   * their business and the merchant team's, nobody else's.
   *
   * A null uid means there is no browser session behind this call. Execute is
   * granted only to authenticated and service_role, so that is the service
   * role or a migration, both of which are already inside the fence.
   */
  if (select auth.uid()) is not null
     and not (authz.is_merchant_member(m.id) or authz.can_manage_merchants(m.city_id))
  then
    raise exception 'Not yours to look at.' using errcode = 'insufficient_privilege';
  end if;

  -- Business basics: a category, and an answer to each of its questions.
  if m.category is not null then
    select cc.questions into v_questions
    from public.category_config cc where cc.category = m.category;

    select coalesce(bool_and(
      m.answers ? (q.value ->> 'key')
      and m.answers -> (q.value ->> 'key') not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
    ), true)
    into v_basics
    from jsonb_array_elements(coalesce(v_questions, '[]'::jsonb)) as q(value);
  end if;

  -- Location: a primary branch whose pin landed inside a zone, or inside
  -- the radius of a city we trade in.
  select exists (
    select 1 from public.merchant_branch b
    where b.merchant_id = m.id and b.is_primary
      and (b.zone_id is not null
           or (b.location is not null
               and exists (select 1 from public.fn_serving_city(b.location))))
  ) into v_location;

  v_hours := m.hours_pattern is not null and m.prep_minutes is not null;

  -- Documents: every essential requirement has something on file. Whether it
  -- is any good is the reviewer's call, not this function's.
  select coalesce(bool_and(
    exists (
      select 1 from public.document d
      where d.owner_type = 'merchant' and d.owner_id = m.id
        and d.requirement_id = r.id
        and d.status in ('uploaded', 'verified')
    )
  ), false)
  into v_documents
  from public.fn_merchant_required_docs(m.id) r
  where r.essential;

  v_payout := m.payout_rail is not null
    and m.payout_account is not null
    and m.payout_account <> '{}'::jsonb;

  select count(*) >= 5 into v_items
  from public.catalogue_item ci
  where ci.merchant_id = m.id and length(trim(ci.name)) > 0;

  v_done := (v_basics)::int + (v_location)::int + (v_hours)::int
          + (v_documents)::int + (v_payout)::int + (v_items)::int;

  return jsonb_build_object(
    'business_basics', v_basics,
    'location', v_location,
    'hours_prep', v_hours,
    'documents', v_documents,
    'payout', v_payout,
    'first_items', v_items,
    /* Floored, so the ring never claims a check that is not ticked: five of
       six reads 83, not 84. */
    'pct', floor(v_done * 100.0 / 6)::int
  );
end;
$$;
