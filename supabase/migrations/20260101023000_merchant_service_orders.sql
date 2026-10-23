-- A merchant books a service through the API, and pays for it.
--
-- The scenario this exists for: a tour company uses NexG to move their
-- visitors from the airport. They want to call our API, tell us two
-- passengers are arriving on a flight, and pay.
--
-- Four decisions worth writing down, because they are what make this
-- safe to expose.
--
-- **The caller never states a price.** They say how many passengers and
-- when; the price comes from the fee settings, read here, exactly as it
-- is for the guest checkout. A caller who can state a price can state
-- zero, and a merchant asking for a discount is a conversation, not a
-- field in a request.
--
-- **The same key makes the same order.** An idempotency key is stored
-- with the order it produced. A retry with the same key returns that
-- order rather than making a second one -- which matters because the
-- caller is a machine that will retry, and a second airport transfer is
-- a second pickup nobody asked for.
--
-- **The key is bound to the merchant.** An idempotency key is only
-- unique per merchant, so one merchant's key cannot collide with
-- another's, and a caller cannot probe another merchant's orders by
-- replaying a key.
--
-- **The money is frozen on the order.** The figures on the row are
-- stored values and `pricing_version_ids` records which settings
-- produced them, because a transfer priced in October must still
-- explain itself in December.

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• idempotency

-- What a caller can book through the API.
--
-- This is the "any business model" answer in one table: a new vertical
-- is a row here, not a new endpoint. A tour company books an airport
-- transfer; a hotel books a bus; a clinic books a courier. Each is a
-- service with a code, and the endpoint is the same endpoint.
create table public.api_service (
  id uuid primary key default gen_random_uuid(),
  /*
   * The stable code a caller sends. Lower case, underscore separated.
   * This is a contract: renaming one breaks callers, so it is written
   * down and not derived from the label.
   */
  code text not null unique,
  -- What a person reads.
  label text not null,
  /*
   * The kind of thing being booked. A 'ride' is carried by a rider, a
   * 'booking' is a room, a 'courier' is a parcel. It decides what the
   * order needs: a ride needs a dropoff point, a booking does not.
   */
  kind text not null check (kind in ('ride', 'booking', 'courier', 'experience')),
  -- The fee key this service is priced from, in the settings schema.
  price_key text not null,
  /*
   * Whether the service is quoted per unit (per passenger, per night) or
   * as a flat fee. Per-unit is why the quantity on the order_item means
   * "passengers" here and "bottles of water" somewhere else.
   */
  unit_basis text not null default 'per_unit' check (unit_basis in ('per_unit', 'flat')),
  -- What the unit is called, for the merchant's own wording.
  unit_label text not null default 'unit',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint api_service_code_is_a_token check (code ~ '^[a-z][a-z0-9_]*$')
);

comment on table public.api_service is
  'Services a merchant can book through the API. A new vertical is a row here, not a new endpoint.';

comment on column public.api_service.price_key is
  'The settings key this service is priced from, for example fees.service.airport_transfer.';

create trigger api_service_set_updated_at
  before update on public.api_service
  for each row execute function public.tg_set_updated_at();

/*
 * The idempotency record.
 *
 * The key is unique per merchant, and the response is stored with it so
 * a retry returns the same answer rather than a fresh one. Storing the
 * response is what makes a retry free: without it, the second call has
 * to work out whether the first one succeeded, and the window where it
 * cannot tell is exactly the window where a duplicate gets created.
 */
create table public.api_idempotency (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  -- The caller's key.
  idempotency_key text not null,
  -- Which endpoint took it, so a key cannot be replayed against another.
  endpoint text not null,
  -- The answer that was given the first time, replayed on every retry.
  response jsonb not null,
  -- The order it produced, if it produced one.
  order_id uuid references public.order (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint api_idempotency_key_length check (length(idempotency_key) between 16 and 128),
  constraint api_idempotency_is_unique_per_merchant unique (merchant_id, idempotency_key, endpoint)
);

create index api_idempotency_lookup_idx on public.api_idempotency (merchant_id, idempotency_key, endpoint);

comment on table public.api_idempotency is
  'Idempotency records. The key is unique per merchant, and the stored response is replayed on a retry.';

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• pricing

-- Price a service booking.
--
-- Reads the unit price from the fee settings, multiplies by the
-- quantity, and adds the same service fee and commission the guest
-- checkout applies. Returns the same shape `fn_price_order` returns, so
-- the order and the money trail read one way.
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
  v_subtotal bigint;
  v_service_pct numeric;
  v_delivery bigint;
  v_commission numeric;
  v_missing text[] := '{}';
  v_key text;
begin
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'message', 'How many are we moving?');
  end if;

  /*
   * The unit price lives in the fee settings under the service's own
   * key, so a tour company booking transfers and a hotel booking rooms
   * are priced by the same mechanism and change by the same process.
   */
  v_unit := settings.fn_int(p_service.price_key, p_city_id, null);
  if v_unit is null then
    return jsonb_build_object('ok', false,
      'message', 'That service is not priced yet. Our team has to set it up first.');
  end if;

  v_subtotal := v_unit * 100 * p_quantity;

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
    'unit_price_cents', v_unit,
    'quantity', p_quantity,
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
  'Price a service booking from the fee settings. The caller never states a price.';

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• placing the order

-- A merchant books a service through the API.
--
-- The merchant is identified by the API key that made the call, not by
-- anything in the payload. A caller that could name a merchant would be
-- able to book on somebody else's account.
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
  -- â”€â”€ the caller â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  select k.* into v_key
  from public.api_key k
  where k.key_hash = encode(sha256(convert_to(p_api_key, 'UTF8')), 'hex')
    and k.state = 'active'
    and (k.expires_at is null or k.expires_at > now());

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;

  if not ('merchant_write'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot book services.' using errcode = '42501';
  end if;

  if v_key.merchant_id is null then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  -- â”€â”€ the retry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  /*
   * A key that has already been used returns the answer it gave last
   * time, and does not make a second order. This is the whole point of
   * the idempotency key: a machine that retries must not create two
   * airport transfers.
   */
  select i.* into v_earlier
  from public.api_idempotency i
  where i.merchant_id = v_key.merchant_id
    and i.idempotency_key = p_idempotency_key
    and i.endpoint = 'order.place';

  if found then
    return v_earlier.response;
  end if;

  -- â”€â”€ the request â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  /*
   * A ride needs somewhere to collect from and somewhere to go. A
   * booking does not: a room has an address in the guest's own words
   * and a date, not a pin. Refusing a ride without a pin is refusing a
   * request we cannot dispatch, and it is better to say so here than to
   * create an order no rider can complete.
   */
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

  -- When. An airport transfer is for a flight, so the time matters more
  -- than usual; it is still optional, because a booking can be "as soon
  -- as possible".
  v_when := nullif(p_payload ->> 'scheduled_for', '')::timestamptz;
  if v_when is not null and v_when < now() - interval '1 hour' then
    raise exception 'That time has already passed.' using errcode = '22023';
  end if;

  -- â”€â”€ the price â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  /*
   * The price comes from the settings, never from the payload. The
   * caller said how many and when; we say what it costs.
   */
  v_price := public.fn_price_api_service(
    v_merchant.city_id, v_service, v_quantity, 1, now());

  if not (v_price ->> 'ok')::boolean then
    raise exception '%', v_price ->> 'message';
  end if;

  v_total := (v_price ->> 'total_cents')::bigint;

  -- â”€â”€ the order â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  /*
   * The line. The name is frozen onto the row, so a service that is
   * renamed later does not rewrite what was booked.
   */
  insert into public.order_item (
    order_id, name, quantity, unit_price_cents, line_total_cents, note
  ) values (
    v_order, v_service.label, v_quantity,
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
  /*
   * The audit chain. A booking that moves money and creates a real
   * order is an action somebody has to be able to be shown took, and
   * the chain is what makes that answerable after the fact.
   */
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

  -- â”€â”€ the record of the key â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  /*
   * The response is stored with the key, so a retry is a lookup rather
   * than a second booking. This is written in the same transaction as
   * the order: if the order exists, the key is recorded, and if the
   * order does not exist, neither does the key.
   */
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

comment on function public.rpc_order_place_api is
  'A merchant books a service through the API. Idempotent on the key, priced from the settings, and audited.';

revoke execute on function public.rpc_order_place_api(text, text, jsonb) from public, anon;
grant execute on function public.rpc_order_place_api(text, text, jsonb) to service_role;

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• the services

insert into public.api_service (code, label, kind, price_key, unit_basis, unit_label)
values
  ('airport_transfer', 'Airport transfer', 'ride', 'fees.service.airport_transfer', 'per_unit', 'passenger'),
  ('intercity_transfer', 'Intercity transfer', 'ride', 'fees.service.intercity_transfer', 'per_unit', 'passenger'),
  ('courier', 'Courier', 'courier', 'fees.service.courier', 'per_unit', 'parcel'),
  ('venue_booking', 'Venue booking', 'booking', 'fees.service.venue_booking', 'flat', 'booking')
on conflict (code) do nothing;

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• RLS

alter table public.api_service enable row level security;
alter table public.api_idempotency enable row level security;

-- The catalogue of services is public: a developer needs to know what
-- they can book before they have a key.
create policy api_service_read_all on public.api_service
  for select to anon, authenticated
  using (active);

-- Only staff see the idempotency records directly. The RPC is the way
-- in for a merchant.
create policy api_idempotency_staff_read on public.api_idempotency
  for select to authenticated
  using (authz.staff_id() is not null);

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• wiring

/*
 * The booking RPC is callable by service_role, not by anon, because the
 * API server authenticates with the service role to reach it. It is not
 * on the anon list: an anon key must never be able to book a transfer.
 */
insert into wiring_anon_allow (function_name, reason, guarded_by)
values
  ('fn_price_api_service', 'The API server prices a booking before it is placed', 'reads fee settings only, returns a figure')
on conflict (function_name) do nothing;
