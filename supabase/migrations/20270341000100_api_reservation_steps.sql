-- Reservations through the API, part 4: the driver notice, the sandbox's
-- remaining steps, and a sample reservation event from the developer console.
--
-- 1. A driver for a NexG customer's booking. When a business sets the driver
--    of a booking a customer made in the NexG app (customer_engine_booking),
--    the customer gets a bell and an email with the driver's first name,
--    vehicle and plate: fn_api_reservation_driver_notice, called by
--    rpc_api_reservation_events_ingest (redefined here, unchanged otherwise)
--    when the booking engine reports booking.driver_assigned for a confirmed
--    or started booking. The kind booking.driver_assigned is added to
--    notification_email_kind. Bookings the business entered itself are not
--    told: those customers are the business's own. SMS waits for a provider.
-- 2. The sandbox's remaining steps (rpc_reservation_step_api_test). A test key
--    can now reschedule, start, complete and cancel a test reservation and
--    share where its driver is, under the live rules, as a live key does
--    through the booking engine. Cancelling a paid one shows refund_state
--    review_required. A driver's position changes no version and sends no
--    event, and shows only while under 30 minutes old.
-- 3. A sample reservation event from the developer console
--    (rpc_api_webhook_sample). For a TEST endpoint only, it makes a test
--    reservation and sends reservation.created, reservation.status_changed or
--    reservation.updated about it to that endpoint, exactly as a real one is
--    sent. A live endpoint keeps the ping: a live system never receives a
--    made-up booking.
-- 4. A fix the release gate found in rpc_reservation_act_api_test
--    (20270340000100): with no expected_version at all it skipped the version
--    check, because jsonb_typeof(null) <> 'number' is null. It now refuses
--    it (is distinct from); nothing else in it changes. The API always sends
--    expected_version, so only a direct service-role call could reach this.
--
-- Rollback: drop function public.rpc_api_webhook_sample(uuid, text),
-- public.rpc_reservation_step_api_test(text, uuid, text, jsonb) and
-- public.fn_api_reservation_driver_notice(uuid, text, integer, jsonb, jsonb);
-- restore rpc_api_reservation_events_ingest from 20270338000100 and
-- fn_api_test_reservation_object and rpc_reservation_act_api_test from
-- 20270340000100; alter table
-- public.api_test_reservation drop column refund_state; delete from
-- public.notification_email_kind where kind = 'booking.driver_assigned';
-- delete the wiring_audit_exempt row for rpc_reservation_step_api_test.

-- ═══════════════════════════════════════════════════════════════ the sandbox

alter table public.api_test_reservation
  add column refund_state text check (refund_state is null or refund_state = 'review_required');

/*
 * The live shape (GET /v1/reservations/{id}), for a test reservation: as in
 * 20270340000100, plus refund_state, and the driver's position only while the
 * booking is confirmed or under way and the position is under 30 minutes old.
 */
create or replace function public.fn_api_test_reservation_object(r public.api_test_reservation)
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
    'driver', case
      when r.driver is null then null
      when r.status in ('confirmed', 'in_progress')
           and (r.driver -> 'location' ->> 'at')::timestamptz >= now() - interval '30 minutes'
        then r.driver
      else (r.driver - 'location') || jsonb_build_object('location', null)
    end,
    'refund_state', r.refund_state);
$$;

/*
 * The steps a live key takes through the booking engine, on a test
 * reservation: reschedule {expected_version, starts_at}, start
 * {expected_version}, complete {expected_version, note}, cancel
 * {expected_version, reason} and location {latitude, longitude, at?}. Each
 * but location sends reservation.status_changed or reservation.updated to the
 * merchant's test endpoints, as live ones do.
 */
create function public.rpc_reservation_step_api_test(
  p_api_key text,
  p_id uuid,
  p_step text,
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
  v_allowed text[];
  v_row public.api_test_reservation;
  v_before text;
  v_start timestamptz;
  v_text text;
  v_lat numeric;
  v_lng numeric;
  v_at timestamptz;
begin
  v_allowed := case p_step
    when 'reschedule' then array['expected_version', 'starts_at']
    when 'start' then array['expected_version']
    when 'complete' then array['expected_version', 'note']
    when 'cancel' then array['expected_version', 'reason']
    when 'location' then array['latitude', 'longitude', 'at']
  end;
  if v_allowed is null then
    raise exception 'The step is reschedule, start, complete, cancel or location.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(v_in) <> 'object'
     or exists (select 1 from jsonb_object_keys(v_in) k where k <> all (v_allowed)) then
    raise exception 'This step takes %.', array_to_string(v_allowed, ', ') using errcode = '22023';
  end if;

  select t.* into v_row
  from public.api_test_reservation t
  where t.merchant_id = v_merchant and t.id = p_id
  for update;
  if not found then
    raise exception 'No test reservation with that id.' using errcode = 'P0002';
  end if;
  v_before := v_row.status;

  -- Where the driver is: no version and no event, as live.
  if p_step = 'location' then
    if v_row.driver is null then
      raise exception 'Set a driver on this reservation first.' using errcode = 'P0005';
    end if;
    if v_row.status not in ('confirmed', 'in_progress') then
      raise exception 'A driver''s location is shared only while the booking is confirmed or under way.'
        using errcode = 'P0005';
    end if;
    if jsonb_typeof(v_in -> 'latitude') is distinct from 'number'
       or jsonb_typeof(v_in -> 'longitude') is distinct from 'number' then
      raise exception 'Send latitude (-90 to 90) and longitude (-180 to 180) as numbers.'
        using errcode = '22023';
    end if;
    v_lat := (v_in ->> 'latitude')::numeric;
    v_lng := (v_in ->> 'longitude')::numeric;
    if abs(v_lat) > 90 or abs(v_lng) > 180 then
      raise exception 'Send latitude (-90 to 90) and longitude (-180 to 180) as numbers.'
        using errcode = '22023';
    end if;
    begin
      v_at := coalesce((v_in ->> 'at')::timestamptz, now());
    exception when others then
      v_at := null;
    end;
    if v_at is null or v_at > now() + interval '2 minutes' or v_at < now() - interval '30 minutes' then
      raise exception 'at is when the driver was there: a time in the last 30 minutes.'
        using errcode = '22023';
    end if;
    -- A position that arrives late never replaces a newer one.
    if coalesce((v_row.driver -> 'location' ->> 'at')::timestamptz, '-infinity') <= v_at then
      update public.api_test_reservation
        set driver = v_row.driver || jsonb_build_object('location',
              jsonb_build_object('latitude', v_lat, 'longitude', v_lng, 'at', v_at))
        where id = v_row.id
        returning * into v_row;
    end if;
    return jsonb_build_object('ok', true, 'reservation', public.fn_api_test_reservation_object(v_row));
  end if;

  if jsonb_typeof(v_in -> 'expected_version') is distinct from 'number'
     or (v_in ->> 'expected_version')::numeric <> v_row.version then
    raise exception 'The reservation changed. Read it again and send its version as expected_version.'
      using errcode = 'P0005';
  end if;

  if p_step = 'reschedule' then
    if v_row.status not in ('requested', 'confirmed') then
      raise exception 'Only a booking that has not started can be moved.' using errcode = 'P0005';
    end if;
    begin
      v_start := (v_in ->> 'starts_at')::timestamptz;
    exception when others then
      v_start := null;
    end;
    if v_start is null or (v_in ->> 'starts_at') !~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' then
      raise exception 'starts_at is the new start: a time with its offset.' using errcode = '22023';
    end if;
    if v_start <= now() then
      raise exception 'Move it to a time that has not passed.' using errcode = '22023';
    end if;
    update public.api_test_reservation
      set ends_at = case when ends_at is null or starts_at is null then ends_at
                         else v_start + (ends_at - starts_at) end,
          starts_at = v_start,
          version = version + 1,
          updated_at = now()
      where id = v_row.id
      returning * into v_row;
  elsif p_step = 'start' then
    if v_row.status <> 'confirmed' then
      raise exception 'Only a confirmed booking can start.' using errcode = 'P0005';
    end if;
    update public.api_test_reservation
      set status = 'in_progress', stage = 'in_progress', version = version + 1, updated_at = now()
      where id = v_row.id
      returning * into v_row;
  elsif p_step = 'complete' then
    if v_row.status <> 'in_progress' then
      raise exception 'Start the booking before completing it.' using errcode = 'P0005';
    end if;
    v_text := btrim(coalesce(v_in ->> 'note', ''));
    if v_text = '' or char_length(v_text) > 500 then
      raise exception 'Say how it ended in note, in at most 500 characters.' using errcode = '22023';
    end if;
    update public.api_test_reservation
      set status = 'completed', stage = 'completed', driver = driver - 'location',
          version = version + 1, updated_at = now()
      where id = v_row.id
      returning * into v_row;
  else
    if v_row.status not in ('requested', 'confirmed') then
      raise exception 'Only a booking that has not started can be cancelled.' using errcode = 'P0005';
    end if;
    v_text := btrim(coalesce(v_in ->> 'reason', ''));
    if v_text = '' or char_length(v_text) > 500 then
      raise exception 'Give the customer a reason, in at most 500 characters.' using errcode = '22023';
    end if;
    update public.api_test_reservation
      set status = 'cancelled', stage = 'cancelled', driver = driver - 'location',
          -- A paid booking's refund is NexG Finance's to review, as live.
          refund_state = case when paid_cents > 0 then 'review_required' end,
          version = version + 1, updated_at = now()
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

/*
 * As in 20270340000100, except that a missing expected_version is refused
 * (marked below). Its grants stay as they are.
 */
create or replace function public.rpc_reservation_act_api_test(
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

  -- 20270341000100: is distinct from, so a missing expected_version is refused too.
  if jsonb_typeof(v_in -> 'expected_version') is distinct from 'number'
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

revoke all on function public.rpc_reservation_step_api_test(text, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.rpc_reservation_step_api_test(text, uuid, text, jsonb) to service_role;

-- ═══════════════════════════════════════════════════════════════ the driver notice

/*
 * Tells the NexG customer behind a booking that its driver is set: a bell
 * (and, through notification_email_kind, an email) with the driver's first
 * name, vehicle and plate. Only customers who booked in the NexG app have an
 * account to tell (customer_engine_booking); a booking the business entered
 * itself has none. Returns how many were told.
 */
create function public.fn_api_reservation_driver_notice(
  p_merchant uuid,
  p_id text,
  p_version integer,
  p_reservation jsonb,
  p_driver jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_driver ->> 'first_name', ''));
  v_vehicle text := btrim(coalesce(p_driver ->> 'vehicle', ''));
  v_plate text := nullif(btrim(coalesce(p_driver ->> 'plate', '')), '');
  v_offering text := nullif(btrim(coalesce(p_reservation -> 'offering' ->> 'name', '')), '');
  v_starts timestamptz;
  v_when text;
  v_user uuid;
  v_told integer := 0;
begin
  if p_driver is null or jsonb_typeof(p_driver) <> 'object'
     or v_name = '' or char_length(v_name) > 60
     or v_vehicle = '' or char_length(v_vehicle) > 80
     or char_length(coalesce(v_plate, '')) > 20
     or char_length(coalesce(v_offering, '')) > 200 then
    return 0;
  end if;
  begin
    v_starts := (p_reservation ->> 'starts_at')::timestamptz;
  exception when others then
    v_starts := null;
  end;
  v_when := to_char(v_starts at time zone 'Africa/Nairobi', 'Dy DD Mon "at" HH24:MI');

  for v_user in
    select distinct b.user_id
    from public.customer_engine_booking b
    where b.merchant_id = p_merchant and b.engine_booking_id = p_id
  loop
    perform public.fn_notify_user(
      p_user_id => v_user,
      p_kind => 'booking.driver_assigned',
      p_title => 'Your driver is ' || v_name,
      p_body => v_name || ' is your driver: ' || v_vehicle
        || coalesce(', plate ' || v_plate, '')
        || coalesce(', for ' || v_offering, '')
        || coalesce(' on ' || v_when, '')
        || '. Open the booking in the NexG app to follow them.',
      p_tag => 'reservation-driver:' || p_id || ':' || coalesce(p_version, 0));
    v_told := v_told + 1;
  end loop;
  return v_told;
end;
$$;

revoke all on function public.fn_api_reservation_driver_notice(uuid, text, integer, jsonb, jsonb)
  from public, anon, authenticated;

insert into public.notification_email_kind (kind, enabled, note)
values ('booking.driver_assigned', true,
        'Customer: the driver of their transfer or tour is set (booking engine, app bookings)')
on conflict (kind) do nothing;

-- ═══════════════════════════════════════════════════════════════ the engine's events

/*
 * As in 20270338000100, with one addition, marked below: a
 * booking.driver_assigned event about a confirmed or started booking, recent
 * enough to send webhooks for, tells the NexG customer behind it
 * (fn_api_reservation_driver_notice). Its grants and comment stay as they are.
 */
create or replace function public.rpc_api_reservation_events_ingest(p_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event jsonb;
  v_key text;
  v_reservation jsonb;
  v_merchant uuid;
  v_id text;
  v_status text;
  v_stage text;
  v_version integer;
  v_occurred timestamptz;
  v_engine_updated timestamptz;
  v_state public.api_reservation_state;
  v_seen boolean;
  v_type text;
  v_outcome text;
  v_accepted text[] := '{}';
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array'
     or jsonb_array_length(p_events) not between 1 and 100 then
    raise exception 'Send between 1 and 100 events.' using errcode = '22023';
  end if;

  for v_event in select value from jsonb_array_elements(p_events) loop
    v_key := v_event ->> 'event_key';
    -- Without a usable key the engine could never be told it arrived.
    continue when v_key is null or v_key !~ '^[A-Za-z0-9_-]{1,128}$';

    -- Heard already: the engine missed the answer. Accept it again, change nothing.
    if exists (select 1 from public.api_booking_engine_event e where e.event_key = v_key) then
      v_accepted := array_append(v_accepted, v_key);
      continue;
    end if;

    v_outcome := null;
    v_merchant := null;
    v_id := null;
    v_occurred := null;
    v_reservation := v_event -> 'reservation';

    begin
      v_occurred := (v_event ->> 'occurred_at')::timestamptz;
    exception when others then
      v_outcome := 'malformed';
    end;

    if v_outcome is null then
      begin
        v_merchant := (v_event ->> 'business_id')::uuid;
      exception when others then
        v_merchant := null;
      end;
      if v_merchant is null
         or not exists (select 1 from public.merchant m where m.id = v_merchant) then
        v_merchant := null;
        v_outcome := 'unknown_merchant';
      end if;
    end if;

    if v_outcome is null and (v_reservation is null or jsonb_typeof(v_reservation) <> 'object') then
      v_outcome := 'not_a_reservation';
    end if;

    if v_outcome is null then
      v_id := v_reservation ->> 'id';
      v_status := v_reservation ->> 'status';
      v_stage := left(coalesce(v_reservation ->> 'stage', ''), 40);
      begin
        v_version := (v_reservation ->> 'version')::integer;
        v_engine_updated := (v_reservation ->> 'updated_at')::timestamptz;
      exception when others then
        v_version := null;
      end;
      if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,128}$'
         or v_status is null
         or v_status not in ('requested', 'confirmed', 'in_progress', 'completed', 'cancelled')
         or v_stage = '' or v_version is null or v_version < 0 then
        v_outcome := 'malformed';
        if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,128}$' then
          v_id := null;
        end if;
      end if;
    end if;

    if v_outcome is null then
      -- One change of one reservation at a time, so two batches cannot both call it new.
      perform pg_advisory_xact_lock(hashtextextended('api_reservation:' || v_merchant || ':' || v_id, 0));
      select * into v_state
      from public.api_reservation_state s
      where s.merchant_id = v_merchant and s.reservation_id = v_id
      for update;
      v_seen := found;

      if v_seen and (v_state.version > v_version
                     or (v_state.version = v_version and v_state.status = v_status
                         and v_state.stage = v_stage)) then
        v_outcome := 'stale';
      else
        v_type := case
          when not v_seen then 'reservation.created'
          when v_state.status <> v_status then 'reservation.status_changed'
          else 'reservation.updated'
        end;

        insert into public.api_reservation_state
          (merchant_id, reservation_id, status, stage, version, engine_updated_at, recorded_at)
        values (v_merchant, v_id, v_status, v_stage, v_version, v_engine_updated, now())
        on conflict (merchant_id, reservation_id) do update
          set status = excluded.status,
              stage = excluded.stage,
              version = excluded.version,
              engine_updated_at = excluded.engine_updated_at,
              recorded_at = excluded.recorded_at;

        v_outcome := 'recorded';
        if v_occurred >= now() - interval '1 day' then
          if public.fn_api_webhook_enqueue(
               v_merchant, 'live', v_type, null,
               jsonb_build_object('reservation', v_reservation)
                 || case when v_type = 'reservation.status_changed'
                         then jsonb_build_object('previous_status', v_state.status)
                         else '{}'::jsonb end) is not null then
            v_outcome := 'queued';
          end if;
          -- Added in 20270341000100: a driver set for a NexG customer's booking tells them.
          if v_event ->> 'event_type' = 'booking.driver_assigned'
             and v_status in ('confirmed', 'in_progress') then
            perform public.fn_api_reservation_driver_notice(
              v_merchant, v_id, v_version, v_reservation, v_event -> 'driver');
          end if;
        end if;
      end if;
    end if;

    insert into public.api_booking_engine_event
      (event_key, merchant_id, event_type, reservation_id, occurred_at, outcome)
    values (v_key, v_merchant, left(coalesce(nullif(v_event ->> 'event_type', ''), 'unknown'), 80),
            v_id, v_occurred, v_outcome);
    v_accepted := array_append(v_accepted, v_key);
  end loop;

  delete from public.api_booking_engine_event where received_at < now() - interval '30 days';

  return jsonb_build_object('accepted', to_jsonb(v_accepted));
end;
$$;

-- ═══════════════════════════════════════════════════════════════ a sample from the console

/*
 * Sends one sample reservation event to a TEST endpoint, from the developer
 * console: it makes a test reservation (a transfer tomorrow at 06:30, under
 * Test Guest) and sends reservation.created (waiting for payment),
 * reservation.status_changed (now confirmed and paid, previous_status
 * requested) or reservation.updated (confirmed, with a driver) about it to
 * that endpoint only, exactly as a real event is sent. The reservation stays
 * in the sandbox, so the endpoint's owner can read it with a test key. A live
 * endpoint is refused: it can be pinged, never sent a made-up booking.
 */
create function public.rpc_api_webhook_sample(p_id uuid, p_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_staff uuid := authz.staff_id();
  e public.api_webhook_endpoint;
  v_row public.api_test_reservation;
  v_start timestamptz;
  v_event uuid;
begin
  perform authz.require_merchant_application_session();
  if p_type is null
     or p_type not in ('reservation.created', 'reservation.status_changed', 'reservation.updated') then
    raise exception 'A sample is reservation.created, reservation.status_changed or reservation.updated.'
      using errcode = '22023';
  end if;
  select * into e from public.api_webhook_endpoint where id = p_id for update;
  if not found or not public.fn_api_webhook_can_manage(e.merchant_id) then
    raise exception 'No such endpoint.' using errcode = 'P0002';
  end if;
  if e.environment <> 'test' then
    raise exception 'Sample reservations go to test endpoints only, so a live system never receives a made-up booking. Send a test ping instead.'
      using errcode = '22023';
  end if;
  if not e.enabled then
    raise exception 'Switch the endpoint on first.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.api_webhook_delivery d
    join public.api_webhook_event ev on ev.id = d.event_id
    where d.endpoint_id = p_id
      and ev.type in ('ping', 'reservation.created', 'reservation.status_changed', 'reservation.updated')
      and d.created_at > now() - interval '10 seconds') then
    raise exception 'A test event was just sent. Wait a few seconds.' using errcode = '22023';
  end if;

  -- Keep the sandbox small, as rpc_reservation_create_api_test does.
  delete from public.api_test_reservation t
  where t.merchant_id = e.merchant_id and t.created_at < now() - interval '30 days';
  if (select count(*) from public.api_test_reservation t where t.merchant_id = e.merchant_id) >= 500 then
    raise exception 'This merchant has 500 test reservations. Older ones are removed after 30 days.'
      using errcode = '22023';
  end if;

  v_start := (date_trunc('day', now() at time zone 'Africa/Nairobi')
              + interval '1 day 6 hours 30 minutes') at time zone 'Africa/Nairobi';
  insert into public.api_test_reservation
    (merchant_id, kind, status, stage, offering_name, offering_model, starts_at, ends_at,
     quantity, guest_name, trip, total_cents, paid_cents, payment_state, driver, version)
  values
    (e.merchant_id, 'reservation',
     case when p_type = 'reservation.created' then 'requested' else 'confirmed' end,
     case when p_type = 'reservation.created' then 'pending' else 'confirmed' end,
     'Sample airport transfer', 'TRANSFER', v_start, v_start + interval '1 hour', 1, 'Test Guest',
     jsonb_build_object('pickup_area', 'JKIA', 'pickup_address', 'Terminal 1A arrivals',
                        'dropoff_area', 'Westlands', 'dropoff_address', 'Woodvale Grove',
                        'flight_number', 'KQ 101'),
     450000,
     case when p_type = 'reservation.created' then 0 else 450000 end,
     case when p_type = 'reservation.created' then 'awaiting_payment' else 'paid' end,
     case when p_type = 'reservation.updated'
          then jsonb_build_object('first_name', 'Juma', 'vehicle', 'White Toyota Noah',
                                  'plate', 'KDA 123A', 'assigned_at', now()) end,
     case p_type when 'reservation.created' then 1 when 'reservation.status_changed' then 2 else 3 end)
  returning * into v_row;

  v_event := public.fn_api_webhook_enqueue(e.merchant_id, 'test', p_type, null,
    jsonb_build_object('reservation', public.fn_api_test_reservation_summary(v_row))
      || case when p_type = 'reservation.status_changed'
              then jsonb_build_object('previous_status', 'requested') else '{}'::jsonb end,
    p_id);

  perform audit.log(
    p_actor_type => case when v_staff is null then 'merchant_user'::public.actor_type
                         else 'staff'::public.actor_type end,
    p_actor_id => coalesce(v_staff, v_user), p_module => 'settings',
    p_action => 'api.webhook_test_sent',
    p_target_type => 'api_webhook_endpoint', p_target_id => p_id,
    p_after => jsonb_build_object('event_id', v_event, 'type', p_type,
                                  'test_reservation_id', v_row.id));

  return v_event;
end;
$$;

revoke all on function public.rpc_api_webhook_sample(uuid, text) from public, anon;
grant execute on function public.rpc_api_webhook_sample(uuid, text) to authenticated, service_role;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values
  ('rpc_reservation_step_api_test',
   'Reschedules, starts, completes, cancels or shares the driver''s position of a sandbox reservation with a test API key. Sandbox reservations are never bookings: they move no money, reserve nothing and reach no customer, so these are not audited business events.',
   'api_test_reservation and the reservation event in api_webhook_event')
on conflict (function_name) do nothing;
