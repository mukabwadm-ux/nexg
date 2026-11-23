-- Live API bookings: NexG's approval, a monthly limit, and per-km prices.
--
-- The owner's decisions (23 Nov):
--
-- 1. Only merchants NexG approves make real, charged bookings through the
--    API, billed to their account, each within a monthly limit a NexG admin
--    sets. Every other merchant books in the sandbox only. Finance (or a
--    super admin) switches it on per merchant: rpc_api_booking_access_set.
--    The booking function refuses a merchant that is not switched on
--    (42501) and a booking that would take this calendar month's live API
--    bookings, Nairobi time, over the limit (P0004).
--
-- 2. A courier booked through the API is priced by the delivery check itself
--    (rpc_delivery_check: KES 80 for the first km and KES 25 for each further
--    km begun, per city), so what a partner is quoted is what it pays, and a
--    trip the check refuses (outside the area, too long, drop-off zone paused)
--    cannot be booked. A courier trip is priced once, whatever the number of
--    parcels.
--
--    Rides keep their price per passenger from the fee settings for now. The
--    delivery card is a motorbike rate that stops at 15 km, so it cannot
--    price a car to the airport; per-km rides need a car rate card the owner
--    has not set yet. Other services keep their price per unit.
--
-- Until now every API service was unpriced in production, so no live
-- booking could be placed; approval comes in the same change as the prices,
-- so nobody can book before NexG has said yes.
--
-- The sandbox prices the same way, and refuses a courier trip the live API
-- would refuse, with the same message; rides and unpriced services keep
-- the sample price there.
--
-- rpc_order_place_api and rpc_order_place_api_test are the bodies production
-- runs (20261219000100 and 20261217000100, checked 23 Nov) with only those
-- changes.

-- ═══════════════════════════════════════════════════════════════ approval

create table if not exists public.api_booking_access (
  merchant_id uuid primary key references public.merchant (id) on delete cascade,
  enabled boolean not null default false,
  monthly_limit_cents bigint not null
    check (monthly_limit_cents > 0 and monthly_limit_cents <= 100000000000),
  note text check (note is null or length(note) <= 500),
  changed_by uuid references public.staff_user (id) on delete set null,
  changed_at timestamptz not null default now()
);

comment on table public.api_booking_access is
  'Merchants NexG has approved for live, charged bookings through the API, on account, with a monthly limit. Read and changed only through rpc_api_booking_access_read/_set.';

alter table public.api_booking_access enable row level security;
revoke all on public.api_booking_access from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ the price

create or replace function public.fn_price_api_booking(
  p_city_id uuid,
  p_service public.api_service,
  p_quantity integer,
  p_payload jsonb,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
  v_fee bigint;
begin
  if p_service.kind <> 'courier' then
    return public.fn_price_api_service(p_city_id, p_service, p_quantity, 1, p_at);
  end if;
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'message', 'How many are we moving?');
  end if;

  v_check := public.rpc_delivery_check(
    (p_payload ->> 'pickup_lat')::float, (p_payload ->> 'pickup_lng')::float,
    (p_payload ->> 'dropoff_lat')::float, (p_payload ->> 'dropoff_lng')::float);
  if not coalesce((v_check ->> 'deliverable')::boolean, false) then
    return jsonb_build_object('ok', false, 'message', v_check ->> 'message');
  end if;
  v_fee := (v_check ->> 'delivery_fee_cents')::bigint;

  -- A courier trip is priced once, whatever the number of parcels.
  return jsonb_build_object(
    'ok', true,
    'unit_price_cents', 0,
    'unit_basis', p_service.unit_basis,
    'quantity', p_quantity,
    'units', 1,
    'subtotal_cents', 0,
    'delivery_fee_cents', v_fee,
    'service_fee_cents', 0,
    'total_cents', v_fee,
    'commission_pct', 0,
    'commission_cents', 0,
    'currency', 'KES',
    'pricing_version_ids', jsonb_build_object(
      'delivery', 'fees.delivery.base+fees.delivery.per_km'));
end;
$$;

comment on function public.fn_price_api_booking(uuid, public.api_service, integer, jsonb, timestamptz) is
  'The price of an API booking: a courier by the delivery check (rpc_delivery_check), anything else by fn_price_api_service. ok false with a message when it cannot be priced or booked.';

revoke all on function public.fn_price_api_booking(uuid, public.api_service, integer, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fn_price_api_booking(uuid, public.api_service, integer, jsonb, timestamptz)
  to service_role;

-- ═══════════════════════════════════════════════════════════════ booking

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
  v_access public.api_booking_access;
  v_used bigint;
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

  /* Live bookings are charged to the merchant's account, so only a merchant
     NexG has approved books them, within its monthly limit (owner, 23 Nov).
     The row is locked, so two bookings at once cannot both pass the limit. */
  select a.* into v_access from public.api_booking_access a
   where a.merchant_id = v_merchant.id
     for update;
  if not found or not v_access.enabled then
    raise exception 'Live bookings through the API are not switched on for this merchant yet. Ask NexG to approve the account; meanwhile a test key books in the sandbox.'
      using errcode = '42501';
  end if;

  -- the price comes from the settings and the trip, never from the payload's figures
  v_price := public.fn_price_api_booking(v_merchant.city_id, v_service, v_quantity, p_payload, now());

  if not (v_price ->> 'ok')::boolean then
    raise exception '%', v_price ->> 'message' using errcode = '22023';
  end if;

  v_total := (v_price ->> 'total_cents')::bigint;

  -- this calendar month's live API bookings, Nairobi time, cancelled ones aside
  select coalesce(sum(o.total_cents), 0) into v_used
    from public.order o
   where o.merchant_id = v_merchant.id and o.channel = 'api' and o.stage <> 'cancelled'
     and o.created_at >= (date_trunc('month', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi');

  if v_used + v_total > v_access.monthly_limit_cents then
    raise exception 'This booking (KES %) would take this month''s API bookings to KES %, over the monthly limit of KES %. Ask NexG to raise the limit.',
      to_char(v_total / 100.0, 'FM999,999,990'), to_char((v_used + v_total) / 100.0, 'FM999,999,990'),
      to_char(v_access.monthly_limit_cents / 100.0, 'FM999,999,990')
      using errcode = 'P0004';
  end if;

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


create or replace function public.rpc_order_place_api_test(
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
  v_quantity integer;
  v_pickup_label text;
  v_dropoff_label text;
  v_when timestamptz;
  v_price jsonb;
  v_total bigint;
  v_source text;
  v_id uuid;
  v_ref text;
  v_answer jsonb;
  v_earlier public.api_idempotency;
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
    raise exception 'A live key books for real, not in the sandbox.' using errcode = '42501';
  end if;

  if not ('merchant_write'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot book services.' using errcode = '42501';
  end if;

  if v_key.merchant_id is null then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  select i.* into v_earlier
  from public.api_idempotency i
  where i.merchant_id = v_key.merchant_id
    and i.idempotency_key = p_idempotency_key
    and i.endpoint = 'order.place.test';

  if found then
    return v_earlier.response;
  end if;

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

  if not found then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  v_quantity := coalesce(nullif(p_payload ->> 'quantity', '')::integer, 1);
  v_pickup_label := nullif(trim(p_payload ->> 'pickup_label'), '');
  v_dropoff_label := nullif(trim(p_payload ->> 'dropoff_label'), '');

  if v_quantity < 1 or v_quantity > 60 then
    raise exception 'How many are we moving?' using errcode = '22023';
  end if;

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
  end if;

  v_when := nullif(p_payload ->> 'scheduled_for', '')::timestamptz;
  if v_when is not null and v_when < now() - interval '1 hour' then
    raise exception 'That time has already passed.' using errcode = '22023';
  end if;

  -- NexG's price where it has one; otherwise the sample price. A courier is
  -- priced by the delivery check, and a trip the live API would refuse is
  -- refused here too, with the same message.
  v_price := public.fn_price_api_booking(v_merchant.city_id, v_service, v_quantity, p_payload, now());
  if v_service.kind = 'courier' and not coalesce((v_price ->> 'ok')::boolean, false) then
    raise exception '%', v_price ->> 'message' using errcode = '22023';
  end if;
  if coalesce((v_price ->> 'ok')::boolean, false) then
    v_total := (v_price ->> 'total_cents')::bigint;
    v_source := 'settings';
  else
    v_total := 100000 * case when v_service.unit_basis = 'flat' then 1 else v_quantity end;
    v_source := 'sample';
  end if;

  v_ref := 'TEST-' || to_char(now() at time zone 'Africa/Nairobi', 'YYMMDD') || '-'
    || upper(left(replace(gen_random_uuid()::text, '-', ''), 6));

  insert into public.api_test_order (
    merchant_id, api_key_id, reference, service, quantity, total_cents, price_source,
    scheduled_for, pickup_label, dropoff_label, payload
  ) values (
    v_merchant.id, v_key.id, v_ref, v_service.code, v_quantity, v_total, v_source,
    v_when, v_pickup_label, coalesce(v_dropoff_label, v_service.label), p_payload
  ) returning id into v_id;

  v_answer := jsonb_build_object(
    'ok', true,
    'order_id', v_id,
    'reference', v_ref,
    'service', v_service.code,
    'quantity', v_quantity,
    'total_cents', v_total,
    'currency', 'KES',
    'payment_method', 'on_account',
    'scheduled_for', v_when
  );

  insert into public.api_idempotency (merchant_id, idempotency_key, endpoint, response, order_id)
  values (v_key.merchant_id, p_idempotency_key, 'order.place.test', v_answer, null);

  return v_answer;
end;
$$;


-- ═══════════════════════════════════════════════════════════════ the admin switch

/* What the merchant page's API bookings card shows: the switch, the limit,
   the note, and this calendar month's live API bookings (Nairobi time). */
create or replace function public.rpc_api_booking_access_read(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.api_booking_access;
  v_used bigint;
  v_count integer;
begin
  if authz.staff_id() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not (authz.has_role('finance') or authz.has_role('finance_lead') or authz.is_super_admin()) then
    raise exception 'API booking approval is Finance''s.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.merchant m where m.id = p_merchant_id) then
    raise exception 'That merchant does not exist.' using errcode = 'P0002';
  end if;

  select * into a from public.api_booking_access where merchant_id = p_merchant_id;

  select coalesce(sum(o.total_cents), 0), count(*) into v_used, v_count
    from public.order o
   where o.merchant_id = p_merchant_id and o.channel = 'api' and o.stage <> 'cancelled'
     and o.created_at >= (date_trunc('month', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi');

  return jsonb_build_object(
    'ok', true,
    'enabled', coalesce(a.enabled, false),
    'monthly_limit_kes', case when a.merchant_id is null then null else a.monthly_limit_cents / 100 end,
    'note', a.note,
    'changed_at', a.changed_at,
    'changed_by', (select coalesce(s.display_name, s.email) from public.staff_user s where s.id = a.changed_by),
    'month_used_kes', v_used / 100,
    'month_bookings', v_count);
end;
$$;

comment on function public.rpc_api_booking_access_read(uuid) is
  'The merchant page''s API bookings card: whether live API bookings are switched on, the monthly limit, the note and this month''s use. Finance or a super admin.';

/* Switches live API bookings on or off for a merchant, with its monthly
   limit in whole shillings. Switching off keeps the limit for next time. */
create or replace function public.rpc_api_booking_access_set(
  p_merchant_id uuid,
  p_enabled boolean,
  p_monthly_limit_kes integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  m public.merchant;
  v_before public.api_booking_access;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not (authz.has_role('finance') or authz.has_role('finance_lead') or authz.is_super_admin()) then
    raise exception 'API booking approval is Finance''s.' using errcode = '42501';
  end if;
  select * into m from public.merchant where id = p_merchant_id;
  if not found then
    raise exception 'That merchant does not exist.' using errcode = 'P0002';
  end if;
  if p_enabled is null then
    raise exception 'Say whether live API bookings are on or off.' using errcode = '22023';
  end if;
  if p_monthly_limit_kes is null or p_monthly_limit_kes < 1 or p_monthly_limit_kes > 1000000000 then
    raise exception 'The monthly limit is whole shillings, from 1 to 1,000,000,000.' using errcode = '22023';
  end if;
  if p_enabled and m.status <> 'live' then
    raise exception 'Only a live merchant can book through the API.' using errcode = '22023';
  end if;

  select * into v_before from public.api_booking_access where merchant_id = p_merchant_id for update;

  insert into public.api_booking_access as a
    (merchant_id, enabled, monthly_limit_cents, note, changed_by, changed_at)
  values (p_merchant_id, p_enabled, p_monthly_limit_kes::bigint * 100, v_note, v_me, now())
  on conflict (merchant_id) do update
     set enabled = excluded.enabled,
         monthly_limit_cents = excluded.monthly_limit_cents,
         note = excluded.note,
         changed_by = excluded.changed_by,
         changed_at = excluded.changed_at;

  perform audit.log('staff'::public.actor_type, 'finance', 'merchant.api_bookings_set',
    p_actor_id => v_me,
    p_target_type => 'merchant', p_target_id => m.id,
    p_target_label => coalesce(m.trading_name, m.legal_name),
    p_city_id => m.city_id,
    p_reason => v_note,
    p_before => case when v_before.merchant_id is null then null else jsonb_build_object(
      'enabled', v_before.enabled, 'monthly_limit_kes', v_before.monthly_limit_cents / 100) end,
    p_after => jsonb_build_object('enabled', p_enabled, 'monthly_limit_kes', p_monthly_limit_kes));

  return public.rpc_api_booking_access_read(p_merchant_id);
end;
$$;

comment on function public.rpc_api_booking_access_set(uuid, boolean, integer, text) is
  'Finance (or a super admin) switches live API bookings on or off for a merchant, with a monthly limit in shillings. Audited as merchant.api_bookings_set.';

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('merchant.api_bookings_set', 'finance', 'notice', false, false, true,
   'Live API bookings were switched on or off for a merchant, or its monthly limit changed')
on conflict (action) do nothing;

revoke all on function public.rpc_api_booking_access_read(uuid) from public, anon;
revoke all on function public.rpc_api_booking_access_set(uuid, boolean, integer, text) from public, anon;
grant execute on function public.rpc_api_booking_access_read(uuid) to authenticated, service_role;
grant execute on function public.rpc_api_booking_access_set(uuid, boolean, integer, text) to authenticated, service_role;
