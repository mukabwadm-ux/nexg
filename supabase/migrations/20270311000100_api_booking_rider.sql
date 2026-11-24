-- API bookings show their rider (owner, 23 Nov 2026).
--
-- A merchant's own system can see who is carrying its booking, as the owner
-- decided: the rider's first name, vehicle and plate once a rider has the
-- job, and where the rider is from pickup until delivery. Never a phone
-- number, a surname or anything else from the rider's record.
--
-- 1. fn_api_booking_rider(order_id): the rider object, or null when no rider
--    has the booking's delivery job (none yet, or the job was cancelled).
--      first_name, vehicle (motorbike, bicycle, car or tuktuk), plate (null
--      for a bicycle, or when none is on record), assigned_at, and location.
--    location is { latitude, longitude, at } only while the booking is
--    picked_up or arriving and its rider still holds the job, and only for a
--    position the rider's app sent after taking this job
--    (rpc_rider_location_ping, 20270115000200). Otherwise it is null: before
--    pickup, after delivery, after a cancellation, or with no position yet.
--    "at" says how old the position is; nothing here is stale-filtered.
-- 2. fn_api_order_object (the booking in every live webhook event) and
--    rpc_order_read_api (GET /v1/orders and /v1/orders/{id}) add "rider".
--    booking.rider_assigned now says who took the job (20270105030100 left
--    the rider out until the owner decided what a merchant may see).
-- 3. The sandbox shows the same shape. A test ride or courier given a test
--    rider (POST /v1/test/orders/{id}/rider, 20270105030100) answers a fixed
--    test rider, and a location while picked_up (the pickup point) or
--    arriving (the drop-off point), when the booking was made with
--    coordinates. fn_api_test_booking_rider, fn_api_test_order_object and
--    rpc_order_read_api_test.
-- 4. A live API booking has always written the audit action api.order_placed
--    (20260101023000), which was never registered, so the audit console
--    would have shown it as unknown. It is registered now, like
--    order.manual_created: orders, notice, money.
--
-- The four replaced functions are their latest bodies (20270101000100) with
-- "rider" added; CREATE OR REPLACE keeps their grants.
--
-- Rollback: re-run fn_api_order_object, fn_api_test_order_object,
-- rpc_order_read_api and rpc_order_read_api_test from 20270101000100, then
-- drop function public.fn_api_booking_rider(uuid),
-- public.fn_api_test_booking_rider(uuid); the registry row can stay.

-- ═══════════════════════════════════════════════════════════════ 1. the rider

create function public.fn_api_booking_rider(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'first_name', trim(r.first_name),
    'vehicle', r.vehicle,
    -- A bicycle carries no plate, whatever an old record says.
    'plate', case when r.vehicle <> 'bicycle' then nullif(trim(r.plate_no), '') end,
    'assigned_at', j.assigned_at,
    'location', case
      when o.stage in ('picked_up', 'arriving')
       and j.state in ('assigned', 'manual_assigned')
       and r.last_location is not null
       and r.last_location_at >= coalesce(j.assigned_at, j.started_at)
      then jsonb_build_object(
        'latitude', round(extensions.st_y(r.last_location::extensions.geometry)::numeric, 6),
        'longitude', round(extensions.st_x(r.last_location::extensions.geometry)::numeric, 6),
        'at', r.last_location_at)
    end)
  from public.order o
  join lateral (
    -- The booking's delivery job that a rider holds or completed. A job
    -- passed to another rider is the same row; a cancelled job shows nobody.
    select dj.*
    from dispatch.job dj
    where dj.order_id = o.id
      and dj.assigned_rider_id is not null
      and dj.state in ('assigned', 'manual_assigned', 'completed')
    order by dj.assigned_at desc nulls last, dj.started_at desc nulls last
    limit 1
  ) j on true
  join public.rider r on r.id = j.assigned_rider_id
  where o.id = p_order_id
$$;

comment on function public.fn_api_booking_rider(uuid) is
  'The rider of an API booking as a merchant may see them (owner, 23 Nov 2026): first name, vehicle, plate, when assigned, and the last position from pickup until delivery. Null without a rider. Never a phone number or surname.';

revoke all on function public.fn_api_booking_rider(uuid) from public, anon, authenticated;
grant execute on function public.fn_api_booking_rider(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════ 2. live bookings

create or replace function public.fn_api_order_object(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_id', o.id,
    'reference', o.reference,
    'service', coalesce(o.delivery_context ->> 'service', ''),
    'quantity', coalesce(
      case when o.channel = 'api' then (o.delivery_context ->> 'quantity')::integer end,
      i.quantity, 1),
    'status', public.fn_api_booking_status(o.stage::text),
    'stage', o.stage,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'currency', o.currency,
    'total_cents', o.total_cents,
    'scheduled_for', o.scheduled_for,
    'pickup_label', o.delivery_context ->> 'pickup_label',
    'dropoff_label', o.dropoff_label,
    'created_at', o.created_at,
    'rider', public.fn_api_booking_rider(o.id)
  )
  from public.order o
  left join lateral (
    select sum(oi.quantity) as quantity
    from public.order_item oi
    where oi.order_id = o.id and oi.removed_at is null
  ) i on true
  where o.id = p_order_id
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
          'status', public.fn_api_booking_status(p.stage::text),
          'payment_method', p.payment_method,
          'payment_status', p.payment_status,
          'currency', p.currency,
          'total_cents', p.total_cents,
          'scheduled_for', p.scheduled_for,
          'pickup_label', p.delivery_context ->> 'pickup_label',
          'dropoff_label', p.dropoff_label,
          'created_at', p.created_at,
          'rider', public.fn_api_booking_rider(p.id)
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

-- ═══════════════════════════════════════════════════════════════ 3. the sandbox

/*
 * A sandbox booking's test rider: always the same made-up rider, so a
 * developer sees the shape a live booking answers. The position is the
 * pickup point while picked_up and the drop-off point while arriving, when
 * the booking was made with coordinates.
 */
create function public.fn_api_test_booking_rider(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'first_name', 'Test',
    'vehicle', 'motorbike',
    'plate', 'KTEST 001',
    'assigned_at', t.rider_assigned_at,
    'location', case
      when t.stage = 'picked_up'
       and jsonb_typeof(t.payload -> 'pickup_lat') = 'number'
       and jsonb_typeof(t.payload -> 'pickup_lng') = 'number'
      then jsonb_build_object(
        'latitude', (t.payload ->> 'pickup_lat')::numeric,
        'longitude', (t.payload ->> 'pickup_lng')::numeric,
        'at', now())
      when t.stage = 'arriving'
       and jsonb_typeof(t.payload -> 'dropoff_lat') = 'number'
       and jsonb_typeof(t.payload -> 'dropoff_lng') = 'number'
      then jsonb_build_object(
        'latitude', (t.payload ->> 'dropoff_lat')::numeric,
        'longitude', (t.payload ->> 'dropoff_lng')::numeric,
        'at', now())
    end)
  from public.api_test_order t
  where t.id = p_id
    and t.rider_assigned_at is not null
    and t.stage <> 'cancelled'
$$;

comment on function public.fn_api_test_booking_rider(uuid) is
  'The made-up test rider of a sandbox booking, in the shape fn_api_booking_rider answers for a live one. Null until a test rider is assigned, and after a cancellation.';

revoke all on function public.fn_api_test_booking_rider(uuid) from public, anon, authenticated;
grant execute on function public.fn_api_test_booking_rider(uuid) to service_role;

create or replace function public.fn_api_test_order_object(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_id', t.id,
    'reference', t.reference,
    'service', t.service,
    'quantity', t.quantity,
    'status', public.fn_api_booking_status(t.stage),
    'stage', t.stage,
    'payment_method', t.payment_method,
    'payment_status', t.payment_status,
    'currency', t.currency,
    'total_cents', t.total_cents,
    'scheduled_for', t.scheduled_for,
    'pickup_label', t.pickup_label,
    'dropoff_label', t.dropoff_label,
    'created_at', t.created_at,
    'rider', public.fn_api_test_booking_rider(t.id)
  )
  from public.api_test_order t
  where t.id = p_id
$$;

create or replace function public.rpc_order_read_api_test(
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
  select k.* into v_key
  from public.api_key k
  where k.key_hash = encode(sha256(convert_to(p_api_key, 'UTF8')), 'hex')
    and k.state = 'active'
    and (k.expires_at is null or k.expires_at > now());

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;

  if v_key.environment <> 'test' then
    raise exception 'A live key reads real orders, not test bookings.' using errcode = '42501';
  end if;

  if not ('merchant_read'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot read a merchant''s orders.' using errcode = '42501';
  end if;

  if v_key.merchant_id is null then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  with page as (
    select
      t.*,
      row_number() over (order by t.created_at desc, t.id desc) as n
    from public.api_test_order t
    where t.merchant_id = v_key.merchant_id
      and (
        (p_order_id is not null and t.id = p_order_id)
        or (
          p_order_id is null
          and (not v_has_cursor or (t.created_at, t.id) < (p_cursor_created_at, p_cursor_id))
        )
      )
    order by t.created_at desc, t.id desc
    limit case when p_order_id is not null then 1 else v_limit + 1 end
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_id', p.id,
          'reference', p.reference,
          'service', p.service,
          'quantity', p.quantity,
          'stage', p.stage,
          'status', public.fn_api_booking_status(p.stage),
          'payment_method', p.payment_method,
          'payment_status', p.payment_status,
          'currency', p.currency,
          'total_cents', p.total_cents,
          'scheduled_for', p.scheduled_for,
          'pickup_label', p.pickup_label,
          'dropoff_label', p.dropoff_label,
          'created_at', p.created_at,
          'rider', public.fn_api_test_booking_rider(p.id)
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

-- ═══════════════════════════════════════════════════════════════ 4. the audit action

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('api.order_placed', 'orders', 'notice', false, false, true,
   'A merchant''s own system booked a NexG service through the API: a live booking, charged to its account')
on conflict (action) do nothing;
