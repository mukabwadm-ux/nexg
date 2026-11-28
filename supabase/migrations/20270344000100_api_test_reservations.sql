-- Test reservations: the sandbox for /v1/reservations.
--
-- Real reservations live in the booking engine (20270338000100). A test key
-- (nexg_test_...) never reaches it; until now it read an empty list. This
-- adds sandbox reservations a developer makes and moves with a test key, so
-- the whole flow can be tried before a live key touches a real booking:
--
--   * POST /v1/test/reservations makes one (rpc_reservation_create_api_test):
--     a transfer by default, for tomorrow, under the name Test Guest.
--   * GET /v1/reservations and /v1/reservations/{id} with a test key read them
--     (rpc_reservation_read_api_test), in the live shape, oldest change first.
--   * accept, decline and driver with a test key act on them
--     (rpc_reservation_act_api_test) under the live rules: accept needs the
--     version you read and no payment waiting; decline only a waiting, unpaid
--     one; a driver is a first name, a vehicle and a plate.
--   * POST /v1/test/reservations/{id}/status moves one to a later status
--     (rpc_reservation_move_api_test); confirmed counts as paid.
--   * Each change sends reservation.created, reservation.status_changed or
--     reservation.updated to the merchant's TEST endpoints, with the summary,
--     as live events do.
--
-- Nothing here touches a real booking, money or a customer. Test reservations
-- older than 30 days are removed when a new one is made, and a merchant can
-- have at most 500.
--
-- Rollback: drop the four rpc_reservation_*_api_test functions,
-- fn_api_test_reservation_key, fn_api_test_reservation_object and
-- fn_api_test_reservation_summary; drop table public.api_test_reservation;
-- delete the three wiring_audit_exempt rows.

create table public.api_test_reservation (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  kind text not null default 'reservation' check (kind in ('reservation', 'request')),
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  stage text not null default 'pending' check (char_length(stage) between 1 and 40),
  offering_name text not null check (char_length(offering_name) between 1 and 200),
  offering_model text not null default 'TRANSFER' check (offering_model ~ '^[A-Z_]{2,40}$'),
  starts_at timestamptz,
  ends_at timestamptz,
  quantity integer not null default 1 check (quantity between 1 and 1000),
  guest_name text check (guest_name is null or char_length(guest_name) between 1 and 120),
  trip jsonb check (trip is null or jsonb_typeof(trip) = 'object'),
  notes text check (notes is null or char_length(notes) <= 2000),
  total_cents bigint check (total_cents is null or total_cents between 0 and 100000000000),
  paid_cents bigint not null default 0 check (paid_cents >= 0),
  payment_state text not null default 'not_required'
    check (payment_state in ('not_required', 'awaiting_payment', 'paid')),
  driver jsonb check (driver is null or jsonb_typeof(driver) = 'object'),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index api_test_reservation_page_idx
  on public.api_test_reservation (merchant_id, updated_at, id);

comment on table public.api_test_reservation is
  'Sandbox reservations made with a test API key: never a real booking, money or customer. Kept 30 days.';

alter table public.api_test_reservation enable row level security;
revoke all on public.api_test_reservation from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ shapes

/* The live shape (GET /v1/reservations/{id}), for a test reservation. */
create function public.fn_api_test_reservation_object(r public.api_test_reservation)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id::text,
    'kind', r.kind,
    'status', r.status,
    'stage', r.stage,
    'offering', jsonb_build_object('id', null, 'name', r.offering_name, 'model', r.offering_model),
    'starts_at', r.starts_at,
    'ends_at', r.ends_at,
    'quantity', r.quantity,
    'payment_state', r.payment_state,
    'version', r.version,
    'updated_at', r.updated_at,
    'occurrence_id', null,
    'resource_ids', '[]'::jsonb,
    'ticket_type', null,
    'capacity_unit', 'place',
    'guest_name', r.guest_name,
    'trip', r.trip,
    'service_location', null,
    'notes', r.notes,
    'currency', 'KES',
    'total_cents', r.total_cents,
    'paid_cents', r.paid_cents,
    'checked_in_at', null,
    'booked_on', 'nexg',
    'created_at', r.created_at,
    'driver', r.driver);
$$;

/* What an event carries: no name, trip or notes, as live events. */
create function public.fn_api_test_reservation_summary(r public.api_test_reservation)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id::text,
    'kind', r.kind,
    'status', r.status,
    'stage', r.stage,
    'offering', jsonb_build_object('id', null, 'name', r.offering_name, 'model', r.offering_model),
    'starts_at', r.starts_at,
    'ends_at', r.ends_at,
    'quantity', r.quantity,
    'payment_state', r.payment_state,
    'version', r.version,
    'updated_at', r.updated_at);
$$;

/*
 * The merchant of a test key with the scope asked for, or an error: never a
 * live key, never a key without a merchant.
 */
create function public.fn_api_test_reservation_key(p_api_key text, p_scope text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key public.api_key;
begin
  select k.* into v_key
  from public.api_key k
  where k.key_hash = encode(sha256(convert_to(coalesce(p_api_key, ''), 'UTF8')), 'hex')
    and k.state = 'active'
    and (k.expires_at is null or k.expires_at > now());

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;
  if v_key.environment <> 'test' then
    raise exception 'Only a test key reaches test reservations. A live key reads real ones.'
      using errcode = '42501';
  end if;
  if not (p_scope::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot do that: it needs %.', p_scope using errcode = '42501';
  end if;
  if v_key.merchant_id is null then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;
  return v_key.merchant_id;
end;
$$;

revoke all on function public.fn_api_test_reservation_key(text, text) from public, anon, authenticated;
revoke all on function public.fn_api_test_reservation_object(public.api_test_reservation)
  from public, anon, authenticated;
revoke all on function public.fn_api_test_reservation_summary(public.api_test_reservation)
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ making one

create function public.rpc_reservation_create_api_test(p_api_key text, p_reservation jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid := public.fn_api_test_reservation_key(p_api_key, 'merchant_write');
  v_in jsonb := coalesce(p_reservation, '{}'::jsonb);
  v_start timestamptz;
  v_end timestamptz;
  v_total bigint;
  v_kind text;
  v_row public.api_test_reservation;
begin
  if jsonb_typeof(v_in) <> 'object' then
    raise exception 'Send the test reservation as a JSON object.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(v_in) k
             where k not in ('kind', 'offering_name', 'offering_model', 'starts_at', 'ends_at',
                             'quantity', 'guest_name', 'trip', 'notes', 'total_cents')) then
    raise exception 'A test reservation takes kind, offering_name, offering_model, starts_at, ends_at, quantity, guest_name, trip, notes and total_cents.'
      using errcode = '22023';
  end if;

  begin
    v_start := coalesce((v_in ->> 'starts_at')::timestamptz, date_trunc('hour', now()) + interval '1 day');
    v_end := coalesce((v_in ->> 'ends_at')::timestamptz, v_start + interval '1 hour');
    v_total := coalesce((v_in ->> 'total_cents')::bigint, 0);
  exception when others then
    raise exception 'starts_at and ends_at are times with an offset; total_cents is a whole number.'
      using errcode = '22023';
  end;
  v_kind := coalesce(v_in ->> 'kind', 'reservation');
  if v_kind not in ('reservation', 'request') then
    raise exception 'kind is reservation or request.' using errcode = '22023';
  end if;
  if v_end <= v_start then
    raise exception 'ends_at must follow starts_at.' using errcode = '22023';
  end if;

  -- Keep the sandbox small: 30 days, at most 500 a merchant.
  delete from public.api_test_reservation t
  where t.merchant_id = v_merchant and t.created_at < now() - interval '30 days';
  if (select count(*) from public.api_test_reservation t where t.merchant_id = v_merchant) >= 500 then
    raise exception 'This merchant has 500 test reservations. Older ones are removed after 30 days.'
      using errcode = 'P0005';
  end if;

  begin
    insert into public.api_test_reservation
      (merchant_id, kind, stage, offering_name, offering_model, starts_at, ends_at, quantity,
       guest_name, trip, notes, total_cents, payment_state)
    values (
      v_merchant,
      v_kind,
      case when v_kind = 'request' then 'pending' when v_total > 0 then 'held' else 'pending' end,
      coalesce(nullif(btrim(v_in ->> 'offering_name'), ''), 'Test transfer'),
      upper(coalesce(nullif(v_in ->> 'offering_model', ''), 'TRANSFER')),
      v_start,
      v_end,
      coalesce((v_in ->> 'quantity')::integer, 1),
      coalesce(nullif(btrim(v_in ->> 'guest_name'), ''), 'Test Guest'),
      case when jsonb_typeof(v_in -> 'trip') = 'object' then v_in -> 'trip' end,
      nullif(v_in ->> 'notes', ''),
      v_total,
      case when v_total > 0 then 'awaiting_payment' else 'not_required' end)
    returning * into v_row;
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'A value is out of range: quantity 1 to 1000, names up to 120 or 200 characters, notes up to 2000.'
      using errcode = '22023';
  end;

  perform public.fn_api_webhook_enqueue(v_merchant, 'test', 'reservation.created', null,
    jsonb_build_object('reservation', public.fn_api_test_reservation_summary(v_row)));

  return jsonb_build_object('ok', true, 'reservation', public.fn_api_test_reservation_object(v_row));
end;
$$;

-- ═══════════════════════════════════════════════════════════════ reading them

create function public.rpc_reservation_read_api_test(
  p_api_key text,
  p_id uuid default null,
  p_limit integer default 25,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null,
  p_updated_after timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant uuid := public.fn_api_test_reservation_key(p_api_key, 'merchant_read');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_items jsonb;
  v_found integer;
  v_last record;
begin
  if p_id is not null then
    select coalesce(jsonb_agg(public.fn_api_test_reservation_object(t)), '[]'::jsonb)
      into v_items
    from public.api_test_reservation t
    where t.merchant_id = v_merchant and t.id = p_id;
    if jsonb_array_length(v_items) = 0 then
      raise exception 'No test reservation with that id.' using errcode = 'P0002';
    end if;
    return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', null);
  end if;

  -- Oldest change first; one row more than the page says whether there is a next one.
  select coalesce(jsonb_agg(public.fn_api_test_reservation_object(x.r) order by x.n)
                  filter (where x.n <= v_limit), '[]'::jsonb),
         count(*)
    into v_items, v_found
  from (
    select t as r, row_number() over (order by t.updated_at, t.id) as n
    from public.api_test_reservation t
    where t.merchant_id = v_merchant
      and (p_updated_after is null or t.updated_at > p_updated_after)
      and (p_cursor_updated_at is null or p_cursor_id is null
           or (t.updated_at, t.id) > (p_cursor_updated_at, p_cursor_id))
    order by t.updated_at, t.id
    limit v_limit + 1
  ) x;

  if v_found > v_limit then
    select t.updated_at, t.id into v_last
    from public.api_test_reservation t
    where t.merchant_id = v_merchant
      and t.id = ((v_items -> (v_limit - 1)) ->> 'id')::uuid;
    return jsonb_build_object('ok', true, 'items', v_items,
      'next_cursor', jsonb_build_object('updated_at', v_last.updated_at, 'id', v_last.id));
  end if;
  return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', null);
end;
$$;

-- ═══════════════════════════════════════════════════════════════ accept, decline, driver

create function public.rpc_reservation_act_api_test(
  p_api_key text,
  p_id uuid,
  p_action text,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid := public.fn_api_test_reservation_key(p_api_key, 'merchant_write');
  v_in jsonb := coalesce(p_input, '{}'::jsonb);
  v_row public.api_test_reservation;
  v_before text;
  v_driver jsonb;
  v_name text;
  v_vehicle text;
  v_plate text;
begin
  if p_action not in ('accept', 'decline', 'driver') then
    raise exception 'The action is accept, decline or driver.' using errcode = '22023';
  end if;

  select t.* into v_row
  from public.api_test_reservation t
  where t.merchant_id = v_merchant and t.id = p_id
  for update;
  if not found then
    raise exception 'No test reservation with that id.' using errcode = 'P0002';
  end if;

  if jsonb_typeof(v_in -> 'expected_version') <> 'number'
     or (v_in ->> 'expected_version')::numeric <> v_row.version then
    raise exception 'The reservation changed. Read it again and send its version as expected_version.'
      using errcode = 'P0005';
  end if;
  v_before := v_row.status;

  if p_action = 'accept' then
    if v_row.status <> 'requested' then
      raise exception 'Only a reservation that is still waiting can be accepted.' using errcode = 'P0005';
    end if;
    if v_row.payment_state = 'awaiting_payment' then
      raise exception 'The customer has not paid yet: a paid booking confirms itself. Move it to confirmed to try that.'
        using errcode = 'P0005';
    end if;
    update public.api_test_reservation
      set status = 'confirmed', stage = case when kind = 'request' then 'accepted' else 'confirmed' end,
          version = version + 1, updated_at = now()
      where id = v_row.id
      returning * into v_row;
  elsif p_action = 'decline' then
    if v_row.status <> 'requested' or v_row.paid_cents > 0 then
      raise exception 'Only a booking that is still waiting and unpaid can be declined. NexG support cancels a confirmed or paid booking.'
        using errcode = 'P0005';
    end if;
    update public.api_test_reservation
      set status = 'cancelled', stage = 'cancelled', version = version + 1, updated_at = now()
      where id = v_row.id
      returning * into v_row;
  else
    if v_row.status in ('completed', 'cancelled') then
      raise exception 'A cancelled or finished booking cannot be given a driver.' using errcode = 'P0005';
    end if;
    if exists (select 1 from jsonb_object_keys(v_in) k where k not in ('expected_version', 'driver'))
       or not (v_in ? 'driver') then
      raise exception 'Send expected_version and driver.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_in -> 'driver') = 'null' then
      v_driver := null;
    else
      if jsonb_typeof(v_in -> 'driver') <> 'object'
         or exists (select 1 from jsonb_object_keys(v_in -> 'driver') k
                    where k not in ('first_name', 'vehicle', 'plate')) then
        raise exception 'A driver has only first_name, vehicle and plate. Never a phone number.'
          using errcode = '22023';
      end if;
      v_name := btrim(coalesce(v_in -> 'driver' ->> 'first_name', ''));
      v_vehicle := btrim(coalesce(v_in -> 'driver' ->> 'vehicle', ''));
      v_plate := nullif(btrim(coalesce(v_in -> 'driver' ->> 'plate', '')), '');
      if v_name = '' or char_length(v_name) > 60 or v_name ~ '\d' then
        raise exception 'The driver''s first name is required: at most 60 characters, no digits.'
          using errcode = '22023';
      end if;
      if v_vehicle = '' or char_length(v_vehicle) > 80 then
        raise exception 'Describe the vehicle in at most 80 characters.' using errcode = '22023';
      end if;
      if v_plate is not null and v_plate !~ '^[A-Za-z0-9][A-Za-z0-9 -]{0,18}[A-Za-z0-9]$' then
        raise exception 'A plate is 2 to 20 letters, digits, spaces or dashes.' using errcode = '22023';
      end if;
      v_driver := jsonb_build_object(
        'first_name', v_name,
        'vehicle', v_vehicle,
        'plate', upper(regexp_replace(v_plate, '\s+', ' ', 'g')),
        'assigned_at', now());
    end if;
    update public.api_test_reservation
      set driver = v_driver, version = version + 1, updated_at = now()
      where id = v_row.id
      returning * into v_row;
  end if;

  perform public.fn_api_webhook_enqueue(v_merchant, 'test',
    case when v_row.status <> v_before then 'reservation.status_changed' else 'reservation.updated' end,
    null,
    jsonb_build_object('reservation', public.fn_api_test_reservation_summary(v_row))
      || case when v_row.status <> v_before then jsonb_build_object('previous_status', v_before)
              else '{}'::jsonb end);

  return jsonb_build_object('ok', true, 'reservation', public.fn_api_test_reservation_object(v_row));
end;
$$;

-- ═══════════════════════════════════════════════════════════════ moving one

create function public.rpc_reservation_move_api_test(p_api_key text, p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid := public.fn_api_test_reservation_key(p_api_key, 'merchant_write');
  v_row public.api_test_reservation;
  v_before text;
  v_order constant text[] := array['requested', 'confirmed', 'in_progress', 'completed'];
begin
  if p_status not in ('confirmed', 'in_progress', 'completed', 'cancelled') then
    raise exception 'Move a test reservation to confirmed, in_progress, completed or cancelled.'
      using errcode = '22023';
  end if;

  select t.* into v_row
  from public.api_test_reservation t
  where t.merchant_id = v_merchant and t.id = p_id
  for update;
  if not found then
    raise exception 'No test reservation with that id.' using errcode = 'P0002';
  end if;
  v_before := v_row.status;

  if v_row.status in ('completed', 'cancelled')
     or (p_status <> 'cancelled'
         and array_position(v_order, p_status) <= array_position(v_order, v_row.status)) then
    raise exception 'A test reservation moves forward only: requested, confirmed, in_progress, completed, or cancelled before it is completed.'
      using errcode = 'P0005';
  end if;

  update public.api_test_reservation
    set status = p_status,
        stage = case p_status when 'confirmed' then 'confirmed' when 'in_progress' then 'in_progress'
                              when 'completed' then 'completed' else 'cancelled' end,
        -- Confirming stands for the customer's payment arriving.
        payment_state = case when p_status = 'confirmed' and payment_state = 'awaiting_payment'
                             then 'paid' else payment_state end,
        paid_cents = case when p_status = 'confirmed' and payment_state = 'awaiting_payment'
                          then coalesce(total_cents, 0) else paid_cents end,
        version = version + 1,
        updated_at = now()
    where id = v_row.id
    returning * into v_row;

  perform public.fn_api_webhook_enqueue(v_merchant, 'test', 'reservation.status_changed', null,
    jsonb_build_object('reservation', public.fn_api_test_reservation_summary(v_row),
                       'previous_status', v_before));

  return jsonb_build_object('ok', true, 'reservation', public.fn_api_test_reservation_object(v_row),
                            'previous_status', v_before);
end;
$$;

revoke all on function public.rpc_reservation_create_api_test(text, jsonb) from public, anon, authenticated;
revoke all on function public.rpc_reservation_read_api_test(text, uuid, integer, timestamptz, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.rpc_reservation_act_api_test(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.rpc_reservation_move_api_test(text, uuid, text) from public, anon, authenticated;
grant execute on function public.rpc_reservation_create_api_test(text, jsonb) to service_role;
grant execute on function public.rpc_reservation_read_api_test(text, uuid, integer, timestamptz, uuid, timestamptz)
  to service_role;
grant execute on function public.rpc_reservation_act_api_test(text, uuid, text, jsonb) to service_role;
grant execute on function public.rpc_reservation_move_api_test(text, uuid, text) to service_role;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values
  ('rpc_reservation_create_api_test',
   'Makes a sandbox reservation with a test API key. Sandbox reservations are never bookings: they move no money, reserve nothing and reach no customer, so they are not audited business events.',
   'api_test_reservation and the reservation.created event in api_webhook_event'),
  ('rpc_reservation_act_api_test',
   'Accepts, declines or sets the driver of a sandbox reservation with a test API key. Sandbox reservations are never bookings, so these are not audited business events.',
   'api_test_reservation and the reservation event in api_webhook_event'),
  ('rpc_reservation_move_api_test',
   'Moves a sandbox reservation with a test API key. Sandbox reservations are never bookings, so this is not an audited business event.',
   'api_test_reservation and the reservation.status_changed event in api_webhook_event')
on conflict (function_name) do nothing;
