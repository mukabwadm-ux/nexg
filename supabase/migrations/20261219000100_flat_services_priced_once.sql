-- A flat-priced service is charged once, and an API order's line is in cents.
--
-- fn_price_api_service multiplied the unit price by the quantity for every
-- service, so a venue booking (unit_basis 'flat', unit 'booking') for 4 cost
-- four times its price. It also reported the unit price in shillings under
-- the name unit_price_cents, and rpc_order_place_api copied that onto the
-- order line, so a line read a hundred times too cheap.
--
-- Now:
--   * fn_price_api_service charges units = 1 for a flat service, otherwise
--     the quantity, and reports unit_price_cents in cents, plus unit_basis
--     and units.
--   * rpc_order_place_api writes one order line of those units at that
--     price, so quantity x unit price = line total, and keeps the quantity
--     the caller asked for in delivery_context.
--   * rpc_order_read_api answers that quantity for an API booking, so a
--     read matches the booking receipt.
--
-- The two booking functions are 20261217000100's bodies with only those
-- edits. CREATE OR REPLACE keeps every grant as it was. When this was
-- written, production had no API orders and no service priced, so no order
-- needs correcting.
--
-- Rollback: re-run the three definitions from 20260101023000 (pricing) and
-- 20261217000100 (booking and read).

create or replace function public.fn_price_api_service(
  p_city_id uuid,
  p_service public.api_service,
  p_quantity integer,
  p_band integer default 1,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit bigint;
  v_units integer;
  v_subtotal bigint;
  v_service_pct numeric;
  v_delivery bigint;
  v_commission numeric;
  v_key text;
begin
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'message', 'How many are we moving?');
  end if;

  /*
   * The unit price lives in the fee settings under the service's own
   * key, so a tour company booking transfers and a hotel booking rooms
   * are priced by the same mechanism and change by the same process.
   * The setting is in shillings.
   */
  v_unit := settings.fn_int(p_service.price_key, p_city_id, null);
  if v_unit is null then
    return jsonb_build_object('ok', false,
      'message', 'That service is not priced yet. Our team has to set it up first.');
  end if;

  -- A per-unit service is charged for each unit (a passenger, a parcel);
  -- a flat service (a venue booking) once, whatever the quantity.
  v_units := case when p_service.unit_basis = 'flat' then 1 else p_quantity end;
  v_subtotal := v_unit * 100 * v_units;

  -- The delivery band fee, when the service is one a rider carries.
  v_delivery := 0;
  if p_service.kind = 'ride' or p_service.kind = 'courier' then
    v_key := 'fees.delivery.band_' || greatest(1, least(3, coalesce(p_band, 1)));
    v_delivery := coalesce(settings.fn_int(v_key, p_city_id), 0) * 100;
  end if;

  v_service_pct := coalesce(settings.fn_num('fees.service_pct', p_city_id), 0);
  v_commission := coalesce(settings.fn_num('fees.commission', p_city_id, null), 0);

  return jsonb_build_object(
    'ok', true,
    'unit_price_cents', v_unit * 100,
    'unit_basis', p_service.unit_basis,
    'quantity', p_quantity,
    'units', v_units,
    'subtotal_cents', v_subtotal,
    'delivery_fee_cents', v_delivery,
    'service_fee_cents', round(v_subtotal * v_service_pct / 100)::bigint,
    'total_cents', v_subtotal + v_delivery + round(v_subtotal * v_service_pct / 100)::bigint,
    'commission_pct', v_commission,
    'commission_cents', round(v_subtotal * v_commission / 100)::bigint,
    'currency', 'KES',
    'pricing_version_ids', jsonb_build_object(
      'service_unit_price', p_service.price_key,
      'service_fee_pct', 'fees.service_pct',
      'commission', 'fees.commission'
    )
  );
end;
$$;

comment on function public.fn_price_api_service is
  'Price a service booking from the fee settings: per unit, or once for a flat service. The caller never states a price.';

create or replace function public.rpc_order_place_api(
  p_api_key text,
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_key;
  v_service public.api_service;
  v_merchant public.merchant;
  v_branch uuid;
  v_quantity integer;
  v_pickup_label text;
  v_dropoff_label text;
  v_pickup_point extensions.geography;
  v_dropoff_point extensions.geography;
  v_when timestamptz;
  v_pax jsonb;
  v_price jsonb;
  v_order uuid;
  v_ref text;
  v_total bigint;
  v_earlier public.api_idempotency;
begin
  -- the caller
  select k.* into v_key
  from public.api_key k
  where k.key_hash = encode(sha256(convert_to(p_api_key, 'UTF8')), 'hex')
    and k.state = 'active'
    and (k.expires_at is null or k.expires_at > now());

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;

  if v_key.environment <> 'live' then
    raise exception 'A test key books in the sandbox, never for real.' using errcode = '42501';
  end if;

  if not ('merchant_write'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot book services.' using errcode = '42501';
  end if;

  if v_key.merchant_id is null then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  -- the retry: a key that has already been used returns its first answer
  select i.* into v_earlier
  from public.api_idempotency i
  where i.merchant_id = v_key.merchant_id
    and i.idempotency_key = p_idempotency_key
    and i.endpoint = 'order.place';

  if found then
    return v_earlier.response;
  end if;

  -- the request
  if length(coalesce(p_idempotency_key, '')) < 16
     or length(coalesce(p_idempotency_key, '')) > 128 then
    raise exception 'An idempotency key is required.' using errcode = '22023';
  end if;

  select s.* into v_service
  from public.api_service s
  where s.code = nullif(p_payload ->> 'service', '')
    and s.active;

  if not found then
    raise exception 'That service is not one we offer.' using errcode = '22023';
  end if;

  select m.* into v_merchant
  from public.merchant m
  where m.id = v_key.merchant_id;

  if not found or v_merchant.status <> 'live' then
    raise exception 'This merchant is not live.' using errcode = '42501';
  end if;

  v_quantity := coalesce(nullif(p_payload ->> 'quantity', '')::integer, 1);
  v_pickup_label := nullif(trim(p_payload ->> 'pickup_label'), '');
  v_dropoff_label := nullif(trim(p_payload ->> 'dropoff_label'), '');
  v_pax := p_payload -> 'passengers';

  if v_quantity < 1 or v_quantity > 60 then
    raise exception 'How many are we moving?' using errcode = '22023';
  end if;

  -- A ride or a courier needs somewhere to collect from and somewhere to go.
  if v_service.kind in ('ride', 'courier') then
    if v_pickup_label is null then
      raise exception 'Where are we collecting from?' using errcode = '22023';
    end if;
    if v_dropoff_label is null then
      raise exception 'Where are we taking them?' using errcode = '22023';
    end if;
    if nullif(p_payload ->> 'pickup_lat', '') is null
       or nullif(p_payload ->> 'pickup_lng', '') is null then
      raise exception 'Give the pickup point as a latitude and longitude.' using errcode = '22023';
    end if;
    if nullif(p_payload ->> 'dropoff_lat', '') is null
       or nullif(p_payload ->> 'dropoff_lng', '') is null then
      raise exception 'Give the dropoff point as a latitude and longitude.' using errcode = '22023';
    end if;

    v_pickup_point := extensions.st_setsrid(extensions.st_makepoint(
      (p_payload ->> 'pickup_lng')::float, (p_payload ->> 'pickup_lat')::float), 4326)::extensions.geography;
    v_dropoff_point := extensions.st_setsrid(extensions.st_makepoint(
      (p_payload ->> 'dropoff_lng')::float, (p_payload ->> 'dropoff_lat')::float), 4326)::extensions.geography;
  end if;

  v_when := nullif(p_payload ->> 'scheduled_for', '')::timestamptz;
  if v_when is not null and v_when < now() - interval '1 hour' then
    raise exception 'That time has already passed.' using errcode = '22023';
  end if;

  -- the price comes from the settings, never from the payload
  v_price := public.fn_price_api_service(
    v_merchant.city_id, v_service, v_quantity, 1, now());

  if not (v_price ->> 'ok')::boolean then
    raise exception '%', v_price ->> 'message';
  end if;

  v_total := (v_price ->> 'total_cents')::bigint;

  -- the order
  select b.id into v_branch
  from public.merchant_branch b
  where b.merchant_id = v_merchant.id
  order by b.is_primary desc
  limit 1;

  v_ref := public.fn_order_reference();

  insert into public.order (
    reference, guest_id, merchant_id, branch_id, city_id, zone_id, channel,
    dropoff_label, dropoff_point, dropoff_note, delivery_context,
    stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents,
    commission_cents, commission_pct, currency, pricing_version_ids,
    scheduled_for, promised_delivery_at
  ) values (
    v_ref, null, v_merchant.id, v_branch, v_merchant.city_id, null, 'api',
    coalesce(v_dropoff_label, v_service.label), v_dropoff_point,
    nullif(trim(p_payload ->> 'note'), ''),
    jsonb_build_object(
      'service', v_service.code,
      'service_label', v_service.label,
      -- What the caller asked for. A flat service is charged once, so the
      -- order line may say 1 where the booking said more.
      'quantity', v_quantity,
      'pickup_label', v_pickup_label,
      'pickup_point', case when v_pickup_point is null then null else
        jsonb_build_object('lat', (p_payload ->> 'pickup_lat')::float,
                           'lng', (p_payload ->> 'pickup_lng')::float) end,
      'passengers', v_pax
    ),
    'placed',
    coalesce(nullif(p_payload ->> 'payment_method', ''), 'on_account')::public.order_payment_method,
    'pending',
    (v_price ->> 'subtotal_cents')::bigint,
    (v_price ->> 'delivery_fee_cents')::bigint,
    (v_price ->> 'service_fee_cents')::bigint,
    v_total,
    (v_price ->> 'commission_cents')::bigint,
    (v_price ->> 'commission_pct')::numeric,
    'KES', v_price -> 'pricing_version_ids',
    v_when, v_when
  ) returning id into v_order;

  insert into public.order_item (
    order_id, name, quantity, unit_price_cents, line_total_cents, note
  ) values (
    -- The units charged (1 for a flat service) at the unit price, in cents,
    -- so the line's quantity times its price is its total.
    v_order, v_service.label, (v_price ->> 'units')::integer,
    (v_price ->> 'unit_price_cents')::bigint,
    (v_price ->> 'subtotal_cents')::bigint,
    v_service.unit_label
  );

  insert into public.order_event (
    order_id, kind, title, detail, actor_type, actor_id, payload
  ) values (
    v_order, 'placed', 'Booked through the API',
    v_service.label || ' x' || v_quantity::text,
    'system', null,
    jsonb_build_object('channel', 'api', 'service', v_service.code)
  );

  perform audit.log(
    p_actor_type => 'system',
    p_module => 'api',
    p_action => 'api.order_placed',
    p_target_type => 'order',
    p_target_id => v_order,
    p_after => jsonb_build_object(
      'reference', v_ref,
      'service', v_service.code,
      'quantity', v_quantity,
      'total_cents', v_total,
      'merchant_id', v_merchant.id,
      'payment_method', coalesce(nullif(p_payload ->> 'payment_method', ''), 'on_account')
    )
  );

  -- the key is recorded with its answer, in the same transaction as the order
  insert into public.api_idempotency (
    merchant_id, idempotency_key, endpoint, response, order_id
  ) values (
    v_key.merchant_id, p_idempotency_key, 'order.place',
    jsonb_build_object(
      'ok', true,
      'order_id', v_order,
      'reference', v_ref,
      'service', v_service.code,
      'quantity', v_quantity,
      'total_cents', v_total,
      'currency', 'KES',
      'payment_method', coalesce(nullif(p_payload ->> 'payment_method', ''), 'on_account'),
      'scheduled_for', v_when
    ),
    v_order
  );

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order,
    'reference', v_ref,
    'service', v_service.code,
    'quantity', v_quantity,
    'total_cents', v_total,
    'currency', 'KES',
    'payment_method', coalesce(nullif(p_payload ->> 'payment_method', ''), 'on_account'),
    'scheduled_for', v_when
  );
end;
$$;

create or replace function public.rpc_order_read_api(
  p_api_key text,
  p_order_id uuid default null,
  p_limit integer default 25,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_key;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_has_cursor boolean := p_cursor_created_at is not null and p_cursor_id is not null;
  v_items jsonb;
  v_found integer;
  v_last jsonb;
begin
  -- The credential: the key decides the merchant, and only merchant_read reads.
  select k.* into v_key
  from public.api_key k
  where k.key_hash = encode(sha256(convert_to(p_api_key, 'UTF8')), 'hex')
    and k.state = 'active'
    and (k.expires_at is null or k.expires_at > now());

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;

  if v_key.environment <> 'live' then
    raise exception 'A test key reads test bookings, never real orders.' using errcode = '42501';
  end if;

  if not ('merchant_read'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot read a merchant''s orders.' using errcode = '42501';
  end if;

  if v_key.merchant_id is null
     or not exists (select 1 from public.merchant m where m.id = v_key.merchant_id) then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  /*
   * One order, or a page of them, through the same shape builder, so a
   * single order and a list item are the same object. A page fetches one
   * row more than it returns; that row only says there is a next page.
   */
  with page as (
    select
      o.id,
      o.reference,
      o.stage,
      o.payment_method,
      o.payment_status,
      o.currency,
      o.total_cents,
      o.scheduled_for,
      o.dropoff_label,
      o.created_at,
      o.delivery_context,
      -- An API booking answers the quantity it was booked with; its line
      -- may say 1 for a flat service. Other orders count their lines.
      coalesce(
        case when o.channel = 'api' then (o.delivery_context ->> 'quantity')::integer end,
        i.quantity, 1
      ) as quantity,
      row_number() over (order by o.created_at desc, o.id desc) as n
    from public.order o
    left join lateral (
      select sum(oi.quantity) as quantity
      from public.order_item oi
      where oi.order_id = o.id and oi.removed_at is null
    ) i on true
    where o.merchant_id = v_key.merchant_id
      and (
        (p_order_id is not null and o.id = p_order_id)
        or (
          p_order_id is null
          and (not v_has_cursor or (o.created_at, o.id) < (p_cursor_created_at, p_cursor_id))
        )
      )
    order by o.created_at desc, o.id desc
    limit case when p_order_id is not null then 1 else v_limit + 1 end
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_id', p.id,
          'reference', p.reference,
          'service', coalesce(p.delivery_context ->> 'service', ''),
          'quantity', p.quantity,
          'stage', p.stage,
          'payment_method', p.payment_method,
          'payment_status', p.payment_status,
          'currency', p.currency,
          'total_cents', p.total_cents,
          'scheduled_for', p.scheduled_for,
          'pickup_label', p.delivery_context ->> 'pickup_label',
          'dropoff_label', p.dropoff_label,
          'created_at', p.created_at
        ) order by p.n
      ) filter (where p.n <= v_limit),
      '[]'::jsonb
    ),
    count(*)
  into v_items, v_found
  from page p;

  if p_order_id is not null then
    if v_found = 0 then
      raise exception 'That order does not exist.' using errcode = '22023';
    end if;
    return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', null);
  end if;

  if v_found <= v_limit then
    return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', null);
  end if;

  -- The next page starts after the last order kept on this one.
  v_last := v_items -> (v_limit - 1);
  return jsonb_build_object(
    'ok', true,
    'items', v_items,
    'next_cursor', jsonb_build_object(
      'created_at', v_last -> 'created_at',
      'id', v_last -> 'order_id'
    )
  );
end;
$$;
