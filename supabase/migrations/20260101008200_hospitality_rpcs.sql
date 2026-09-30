-- Hotels & Airbnb · the writes.
--
-- Every one checks the caller, writes an audit event in the same
-- transaction as the change, and refuses rather than guesses.
--
-- The ones that matter most, and why they are shaped the way they are:
--
--   rpc_host_verify is the only path to a live host. The constraint on
--   the table backs it up, so a stray update cannot do it.
--
--   rpc_folio_request refuses when no cap has been agreed. An
--   unbounded charge to somebody else's hotel bill is not a default.
--
--   rpc_rider_reveal_gate_code refuses off-trip, out of window, out of
--   range and on a second call, and logs every reveal that does
--   happen.
--
--   rpc_data_request_anonymise refuses while a blocking reason exists,
--   and anonymises rather than deletes, because finance records inside
--   their retention period may not be destroyed.

-- ═══════════════════════════════════════════════ hosts

create or replace function public.rpc_host_apply(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host public.host;
  v_unit public.unit;
  v_phone text := nullif(trim(p_payload ->> 'phone'), '');
  v_city uuid;
begin
  if v_phone is null then
    raise exception 'A phone number is how we reach you about your guests.'
      using errcode = 'check_violation';
  end if;

  select id into v_city from public.city
  where slug = coalesce(p_payload ->> 'city', 'nairobi');

  insert into public.host (
    kind, display_name, contact_name, phone, email, city_id,
    listing_link, units_declared_band, default_handoff, submitted_at, onboarding_step
  )
  values (
    coalesce((p_payload ->> 'kind')::public.host_kind, 'single_unit'),
    nullif(trim(p_payload ->> 'display_name'), ''),
    nullif(trim(p_payload ->> 'contact_name'), ''),
    v_phone,
    nullif(trim(p_payload ->> 'email'), ''),
    v_city,
    nullif(trim(p_payload ->> 'listing_link'), ''),
    nullif(p_payload ->> 'units_band', ''),
    nullif(p_payload ->> 'handoff', '')::public.handoff_mode,
    now(),
    2
  )
  on conflict (phone) do update set
    contact_name = coalesce(excluded.contact_name, public.host.contact_name),
    email = coalesce(excluded.email, public.host.email),
    listing_link = coalesce(excluded.listing_link, public.host.listing_link),
    units_declared_band = coalesce(excluded.units_declared_band, public.host.units_declared_band),
    default_handoff = coalesce(excluded.default_handoff, public.host.default_handoff)
  returning * into v_host;

  /* The first unit, from the address they typed on the landing page. */
  if nullif(trim(p_payload ->> 'address'), '') is not null then
    insert into public.unit (host_id, name, label_public, address_line, city_id, handoff)
    values (
      v_host.id,
      coalesce(nullif(trim(p_payload ->> 'unit_name'), ''), 'Unit 1'),
      nullif(trim(p_payload ->> 'unit_name'), ''),
      trim(p_payload ->> 'address'),
      v_city,
      nullif(p_payload ->> 'handoff', '')::public.handoff_mode
    )
    on conflict (host_id, name) do nothing
    returning * into v_unit;
  end if;

  insert into public.notification (kind, status) values ('host_ack', 'pending');

  perform audit.log('guest'::public.actor_type, 'hotels', 'host.applied',
    p_target_type => 'host', p_target_id => v_host.id, p_city_id => v_city,
    p_after => jsonb_build_object('kind', v_host.kind, 'units_band', v_host.units_declared_band));

  return jsonb_build_object('ok', true, 'host_id', v_host.id, 'unit_id', v_unit.id);
end;
$$;

grant execute on function public.rpc_host_apply(jsonb) to anon, authenticated;

/*
 * The only way a host becomes live. Verification is listing ownership,
 * an ID document, or a call — whichever, somebody records which and
 * what the evidence was, because "we checked" is not a record.
 */
create or replace function public.rpc_host_verify(
  p_host_id uuid,
  p_method text,
  p_evidence jsonb default '{}'::jsonb
)
returns public.host
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host public.host;
begin
  if not authz.works_hospitality(null) then
    raise exception 'Not yours to verify.' using errcode = 'insufficient_privilege';
  end if;
  if p_method not in ('listing_ownership', 'id_document', 'call') then
    raise exception 'Verification is listing ownership, an ID document, or a call.'
      using errcode = 'check_violation';
  end if;

  update public.host set
    status = 'live',
    verified_at = now(),
    verified_by = authz.staff_id(),
    verification = jsonb_build_object('method', p_method, 'at', now()) || p_evidence,
    went_live_at = coalesce(went_live_at, now())
  where id = p_host_id and status in ('applied', 'verifying')
  returning * into v_host;

  if v_host.id is null then
    raise exception 'That host is not waiting to be verified.' using errcode = 'no_data_found';
  end if;

  /* Units flip on their own readiness, not on the host's. */
  update public.unit u set status = 'live'
  where u.host_id = p_host_id
    and u.status = 'setting_up'
    and u.address_line is not null
    and u.handoff is not null
    and (u.handoff not in ('leave_with_askari', 'caretaker') or u.caretaker_confirmed_at is not null);

  insert into public.notification (kind, status) values ('host_verified', 'pending');

  perform audit.log('staff'::public.actor_type, 'hotels', 'host.verified',
    p_target_type => 'host', p_target_id => p_host_id, p_city_id => v_host.city_id,
    p_after => jsonb_build_object('method', p_method), p_reason => p_evidence ->> 'notes',
    p_severity => 'high'::public.audit_severity);

  return v_host;
end;
$$;

/*
 * Create or update a unit. Readiness is recomputed here so that the
 * host view, the console and the go-live check cannot disagree.
 *
 * Secrets go in through fn_encrypt_secret and never come back out of
 * this function.
 */
create or replace function public.rpc_unit_upsert(
  p_host_id uuid,
  p_unit jsonb,
  p_unit_id uuid default null
)
returns public.unit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_zone uuid;
  v_point extensions.geography;
begin
  if not authz.is_host_member(p_host_id) and not authz.works_hospitality(null) then
    raise exception 'Not your unit.' using errcode = 'insufficient_privilege';
  end if;

  if (p_unit ->> 'lat') is not null and (p_unit ->> 'lng') is not null then
    v_point := extensions.st_setsrid(
      extensions.st_makepoint((p_unit ->> 'lng')::float8, (p_unit ->> 'lat')::float8), 4326
    )::extensions.geography;

    select z.id into v_zone from public.zone z
    where z.active and extensions.st_covers(z.polygon, v_point) limit 1;
  end if;

  if p_unit_id is null then
    insert into public.unit (host_id, name, label_public, address_line, building, unit_no,
                             area, city_id, point, zone_id, floor, handoff, handoff_note,
                             askari_name, caretaker_name, delivery_hours, parking_note,
                             lift_note, checkin_time, checkout_time)
    values (
      p_host_id,
      coalesce(nullif(trim(p_unit ->> 'name'), ''), 'Unit'),
      nullif(trim(p_unit ->> 'label_public'), ''),
      nullif(trim(p_unit ->> 'address_line'), ''),
      nullif(trim(p_unit ->> 'building'), ''),
      nullif(trim(p_unit ->> 'unit_no'), ''),
      nullif(trim(p_unit ->> 'area'), ''),
      nullif(p_unit ->> 'city_id', '')::uuid,
      v_point, v_zone,
      nullif(trim(p_unit ->> 'floor'), ''),
      nullif(p_unit ->> 'handoff', '')::public.handoff_mode,
      nullif(trim(p_unit ->> 'handoff_note'), ''),
      nullif(trim(p_unit ->> 'askari_name'), ''),
      nullif(trim(p_unit ->> 'caretaker_name'), ''),
      case when p_unit ? 'delivery_hours' then p_unit -> 'delivery_hours' end,
      nullif(trim(p_unit ->> 'parking_note'), ''),
      nullif(trim(p_unit ->> 'lift_note'), ''),
      nullif(p_unit ->> 'checkin_time', '')::time,
      nullif(p_unit ->> 'checkout_time', '')::time
    )
    returning * into v_unit;
  else
    update public.unit set
      name = coalesce(nullif(trim(p_unit ->> 'name'), ''), name),
      label_public = coalesce(nullif(trim(p_unit ->> 'label_public'), ''), label_public),
      address_line = coalesce(nullif(trim(p_unit ->> 'address_line'), ''), address_line),
      building = coalesce(nullif(trim(p_unit ->> 'building'), ''), building),
      unit_no = coalesce(nullif(trim(p_unit ->> 'unit_no'), ''), unit_no),
      area = coalesce(nullif(trim(p_unit ->> 'area'), ''), area),
      point = coalesce(v_point, point),
      zone_id = coalesce(v_zone, zone_id),
      floor = coalesce(nullif(trim(p_unit ->> 'floor'), ''), floor),
      handoff = coalesce(nullif(p_unit ->> 'handoff', '')::public.handoff_mode, handoff),
      handoff_note = coalesce(nullif(trim(p_unit ->> 'handoff_note'), ''), handoff_note),
      askari_name = coalesce(nullif(trim(p_unit ->> 'askari_name'), ''), askari_name),
      caretaker_name = coalesce(nullif(trim(p_unit ->> 'caretaker_name'), ''), caretaker_name),
      delivery_hours = case when p_unit ? 'delivery_hours'
        then p_unit -> 'delivery_hours' else delivery_hours end,
      parking_note = coalesce(nullif(trim(p_unit ->> 'parking_note'), ''), parking_note),
      lift_note = coalesce(nullif(trim(p_unit ->> 'lift_note'), ''), lift_note),
      checkin_time = coalesce(nullif(p_unit ->> 'checkin_time', '')::time, checkin_time),
      checkout_time = coalesce(nullif(p_unit ->> 'checkout_time', '')::time, checkout_time)
    where id = p_unit_id and host_id = p_host_id
    returning * into v_unit;
  end if;

  /* Secrets, separately, so they are never in the same jsonb as
     anything that might get logged. */
  if nullif(trim(coalesce(p_unit ->> 'gate_code', '')), '') is not null then
    update public.unit set gate_code_encrypted = public.fn_encrypt_secret(p_unit ->> 'gate_code')
    where id = v_unit.id;
  end if;
  if nullif(trim(coalesce(p_unit ->> 'askari_phone', '')), '') is not null then
    update public.unit set askari_phone_encrypted = public.fn_encrypt_secret(p_unit ->> 'askari_phone')
    where id = v_unit.id;
  end if;
  if nullif(trim(coalesce(p_unit ->> 'caretaker_phone', '')), '') is not null then
    update public.unit set caretaker_phone_encrypted = public.fn_encrypt_secret(p_unit ->> 'caretaker_phone')
    where id = v_unit.id;
  end if;

  update public.unit set readiness = public.fn_unit_readiness(v_unit.id)
  where id = v_unit.id returning * into v_unit;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'unit.saved',
    p_target_type => 'unit', p_target_id => v_unit.id, p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('status', v_unit.status, 'handoff', v_unit.handoff,
                                  'readiness', v_unit.readiness));

  return v_unit;
end;
$$;

/*
 * The caretaker confirms by tapping a link. Until they do, a unit that
 * says "leave with the askari" cannot go live — the table constraint
 * says so, and this is how it gets satisfied.
 */
create or replace function public.rpc_unit_caretaker_confirm(p_unit_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
begin
  update public.unit set caretaker_confirmed_at = now()
  where id = p_unit_id and caretaker_confirmed_at is null
  returning * into v_unit;

  if v_unit.id is null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  update public.unit set readiness = public.fn_unit_readiness(p_unit_id) where id = p_unit_id;

  perform audit.log('guest'::public.actor_type, 'hotels', 'unit.caretaker_confirmed',
    p_target_type => 'unit', p_target_id => p_unit_id);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.rpc_host_verify(uuid, text, jsonb) to authenticated;
grant execute on function public.rpc_unit_upsert(uuid, jsonb, uuid) to authenticated;
grant execute on function public.rpc_unit_caretaker_confirm(uuid, text) to anon, authenticated;

-- ═══════════════════════════════════════════════ QR codes

create or replace function public.rpc_qr_generate(
  p_unit_id uuid default null,
  p_room_id uuid default null
)
returns public.unit_qr
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qr public.unit_qr;
  v_code text;
begin
  if num_nonnulls(p_unit_id, p_room_id) <> 1 then
    raise exception 'A QR belongs to a unit or a room, not both and not neither.'
      using errcode = 'check_violation';
  end if;
  if p_unit_id is not null
     and not authz.can_see_unit(p_unit_id) and not authz.works_hospitality(null) then
    raise exception 'Not your unit.' using errcode = 'insufficient_privilege';
  end if;

  /*
   * Short, printable and un-guessable — 6 characters from a 31-letter
   * alphabet is about 10^9 codes, which is far more than the number of
   * units that will ever exist and enough that guessing one is not a
   * way in.
   *
   * O, I, 0 and 1 are left out on purpose: somebody will read this off
   * a card taped to a kitchen counter and type it into a phone.
   */
  v_code := 'NXG-' || (
    select string_agg(
      substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
             1 + floor(random() * 32)::integer, 1), '')
    from generate_series(1, 6)
  );

  /* Vanishingly unlikely, but a collision would point one host's card
     at another host's door, so it is checked rather than assumed. */
  while exists (select 1 from public.unit_qr where code = v_code) loop
    v_code := 'NXG-' || (
      select string_agg(
        substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
               1 + floor(random() * 32)::integer, 1), '')
      from generate_series(1, 6)
    );
  end loop;

  /* Replacing voids the old one: a card left on a counter must stop
     working when the host prints a new one. */
  update public.unit_qr set voided_at = now(), state = 'replaced'
  where voided_at is null
    and ((p_unit_id is not null and unit_id = p_unit_id)
      or (p_room_id is not null and room_id = p_room_id));

  insert into public.unit_qr (unit_id, room_id, code)
  values (p_unit_id, p_room_id, v_code)
  returning * into v_qr;

  perform audit.log('staff'::public.actor_type, 'hotels', 'qr.generated',
    p_target_type => coalesce('unit', 'room'),
    p_target_id => coalesce(p_unit_id, p_room_id));

  return v_qr;
end;
$$;

create or replace function public.rpc_qr_mark_placed(p_qr_id uuid)
returns public.unit_qr
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qr public.unit_qr;
begin
  update public.unit_qr set placed_confirmed_at = now(), state = 'placed'
  where id = p_qr_id and voided_at is null
  returning * into v_qr;

  if v_qr.unit_id is not null then
    update public.unit set readiness = public.fn_unit_readiness(v_qr.unit_id)
    where id = v_qr.unit_id;
  end if;

  return v_qr;
end;
$$;

/*
 * Resolving a scan. Anonymous, so it is deliberately narrow: a paused
 * or archived unit resolves to a redirect payload rather than an
 * orderable context, and an unknown or replaced code resolves to
 * nothing at all.
 */
create or replace function public.rpc_resolve_qr(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qr public.unit_qr;
  v_unit public.unit;
  v_room public.hotel_room;
  v_hotel public.hotel;
  v_ctx jsonb;
begin
  select * into v_qr from public.unit_qr
  where code = upper(trim(p_code)) and voided_at is null;

  if v_qr.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.qr_scan (qr_id, outcome) values (v_qr.id, 'landed');

  update public.unit_qr set
    scans = scans + 1,
    first_scanned_at = coalesce(first_scanned_at, now()),
    state = case when state in ('generated', 'sent') then 'scanned' else state end
  where id = v_qr.id;

  if v_qr.unit_id is not null then
    select * into v_unit from public.unit where id = v_qr.unit_id;

    if v_unit.status <> 'live' then
      /* Friendly, and honest about what to do instead. */
      return jsonb_build_object(
        'ok', false,
        'reason', case when v_unit.status = 'paused' then 'paused' else 'not_live' end,
        'message', 'This unit isn''t taking orders right now — order for delivery to another address.'
      );
    end if;

    select to_jsonb(c) into v_ctx from public.unit_context_v c where c.unit_id = v_unit.id;
    return jsonb_build_object('ok', true, 'kind', 'unit', 'context', v_ctx, 'qr_id', v_qr.id);
  end if;

  select * into v_room from public.hotel_room where id = v_qr.room_id;
  select * into v_hotel from public.hotel where id = v_room.hotel_id;

  if v_hotel.status <> 'partner' or v_room.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_live',
      'message', 'This room isn''t set up for ordering right now.');
  end if;

  select jsonb_build_object(
    'hotel_id', h.hotel_id, 'hotel_name', h.hotel_name,
    'charge_to_room', h.offer_charge_to_room,
    'cap', h.charge_cap_per_stay,
    'preferred_suppliers', h.preferred_suppliers,
    'room_no', v_room.room_no
  ) into v_ctx
  from public.checkout_hotel_context_v h where h.hotel_id = v_hotel.id;

  return jsonb_build_object('ok', true, 'kind', 'room', 'context', v_ctx, 'qr_id', v_qr.id);
end;
$$;

grant execute on function public.rpc_qr_generate(uuid, uuid) to authenticated;
grant execute on function public.rpc_qr_mark_placed(uuid) to authenticated;
grant execute on function public.rpc_resolve_qr(text) to anon, authenticated;

-- ═══════════════════════════════════ gate codes and secrets

/*
 * The most sensitive read in this system.
 *
 * Refused unless the caller is the assigned rider, the trip is live,
 * they are near the door, and they have not already looked. Every
 * reveal is logged with the order it was for. There is no bulk
 * equivalent and no view.
 *
 * The proximity check needs the rider's current fix; a caller who
 * cannot supply one is refused rather than waved through.
 */
create or replace function public.rpc_rider_reveal_gate_code(
  p_unit_id uuid,
  p_order_reference text,
  p_lat float8 default null,
  p_lng float8 default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_rider public.rider;
  v_metres float8;
  v_code text;
begin
  select * into v_rider from public.rider where user_id = (select auth.uid());
  if v_rider.id is null then
    raise exception 'Only the rider on the delivery can see this.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_rider.status <> 'active' or v_rider.presence <> 'on_trip' then
    raise exception 'You are not on a trip.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_unit from public.unit where id = p_unit_id and status = 'live';
  if v_unit.id is null then
    raise exception 'No such unit.' using errcode = 'no_data_found';
  end if;
  if v_unit.gate_code_encrypted is null then
    return jsonb_build_object('ok', false, 'reason', 'There is no gate code for this unit.');
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'We need your location to show the gate code.'
      using errcode = 'check_violation';
  end if;

  v_metres := extensions.st_distance(
    v_unit.point,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
  );

  if v_metres > 500 then
    return jsonb_build_object('ok', false,
      'reason', 'You are too far from the door for this to show. Get closer and try again.');
  end if;

  /* Once per order. A second look is a different person holding the
     phone, or a screenshot, and either way somebody should ask. */
  if exists (
    select 1 from audit.audit_event e
    where e.action = 'pii.gate_code_revealed'
      and e.target_id = p_unit_id
      and e.reason = p_order_reference
  ) then
    return jsonb_build_object('ok', false,
      'reason', 'Already shown once for this delivery. Call the desk if you need it again.');
  end if;

  v_code := public.fn_decrypt_secret(v_unit.gate_code_encrypted);

  perform audit.log('rider'::public.actor_type, 'hotels', 'pii.gate_code_revealed',
    p_target_type => 'unit', p_target_id => p_unit_id,
    p_city_id => v_unit.city_id, p_reason => p_order_reference,
    p_after => jsonb_build_object('metres_away', round(v_metres)),
    p_severity => 'high'::public.audit_severity);

  /* Shown for 60 seconds by the app and never cached. */
  return jsonb_build_object('ok', true, 'code', v_code, 'seconds', 60);
end;
$$;

create or replace function public.rpc_unit_secret_reveal(
  p_unit_id uuid,
  p_which text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_value text;
begin
  if not (authz.is_super_admin() or authz.handles_guest_data()) then
    raise exception 'Not yours to see.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why you need it. The reason is kept with your name.'
      using errcode = 'check_violation';
  end if;

  select * into v_unit from public.unit where id = p_unit_id;

  v_value := case p_which
    when 'gate_code' then public.fn_decrypt_secret(v_unit.gate_code_encrypted)
    when 'askari_phone' then public.fn_decrypt_secret(v_unit.askari_phone_encrypted)
    when 'caretaker_phone' then public.fn_decrypt_secret(v_unit.caretaker_phone_encrypted)
    else null end;

  perform audit.log('staff'::public.actor_type, 'hotels', 'pii.revealed',
    p_target_type => 'unit', p_target_id => p_unit_id, p_city_id => v_unit.city_id,
    p_reason => trim(p_reason), p_after => jsonb_build_object('field', p_which),
    p_severity => 'high'::public.audit_severity);

  return jsonb_build_object('ok', v_value is not null, 'value', v_value);
end;
$$;

grant execute on function public.rpc_rider_reveal_gate_code(uuid, text, float8, float8) to authenticated;
grant execute on function public.rpc_unit_secret_reveal(uuid, text, text) to authenticated;

-- ═══════════════════════════════════════════ hotels

create or replace function public.rpc_hotel_prospect_upsert(
  p_hotel jsonb,
  p_hotel_id uuid default null
)
returns public.hotel
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hotel public.hotel;
begin
  if not authz.works_hospitality(null) then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  if p_hotel_id is null then
    insert into public.hotel (name, brand, city_id, area, rooms, star_rating, gm_name,
                              owner_staff_id, prospect_stage, next_action_at)
    values (
      trim(p_hotel ->> 'name'),
      nullif(trim(p_hotel ->> 'brand'), ''),
      nullif(p_hotel ->> 'city_id', '')::uuid,
      nullif(trim(p_hotel ->> 'area'), ''),
      nullif(p_hotel ->> 'rooms', '')::integer,
      nullif(p_hotel ->> 'star_rating', '')::numeric,
      nullif(trim(p_hotel ->> 'gm_name'), ''),
      authz.staff_id(),
      coalesce(nullif(p_hotel ->> 'stage', ''), 'identified'),
      nullif(p_hotel ->> 'next_action_at', '')::timestamptz
    )
    returning * into v_hotel;
  else
    update public.hotel set
      name = coalesce(nullif(trim(p_hotel ->> 'name'), ''), name),
      rooms = coalesce(nullif(p_hotel ->> 'rooms', '')::integer, rooms),
      gm_name = coalesce(nullif(trim(p_hotel ->> 'gm_name'), ''), gm_name),
      prospect_stage = coalesce(nullif(p_hotel ->> 'stage', ''), prospect_stage),
      next_action_at = coalesce(nullif(p_hotel ->> 'next_action_at', '')::timestamptz, next_action_at),
      lost_reason = coalesce(nullif(trim(p_hotel ->> 'lost_reason'), ''), lost_reason)
    where id = p_hotel_id
    returning * into v_hotel;

    insert into public.hotel_prospect_activity (hotel_id, kind, by, notes, next_action_at)
    values (p_hotel_id, coalesce(nullif(p_hotel ->> 'activity', ''), 'note'),
            authz.staff_id(), nullif(trim(p_hotel ->> 'notes'), ''), v_hotel.next_action_at);
  end if;

  perform audit.log('staff'::public.actor_type, 'hotels', 'hotel.prospect_stage_changed',
    p_target_type => 'hotel', p_target_id => v_hotel.id, p_city_id => v_hotel.city_id,
    p_after => jsonb_build_object('stage', v_hotel.prospect_stage));

  return v_hotel;
end;
$$;

/*
 * Activation. Two people, and four things that must exist first: a
 * signed agreement, a desk contact, a finance contact and an access
 * rule. Without the access rule a rider arrives at a hotel with no
 * idea which entrance to use.
 */
create or replace function public.rpc_hotel_activate_request(
  p_hotel_id uuid,
  p_tier public.hotel_tier,
  p_commission_pct numeric,
  p_reason text
)
returns public.approval_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hotel public.hotel;
  v_request public.approval_request;
  v_missing text[] := '{}';
begin
  if not authz.works_hospitality(null) then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_hotel from public.hotel where id = p_hotel_id;
  if v_hotel.id is null then
    raise exception 'No such hotel.' using errcode = 'no_data_found';
  end if;

  if v_hotel.agreement_signed_at is null then
    v_missing := v_missing || 'a signed agreement'::text;
  end if;
  if not exists (select 1 from public.hotel_contact where hotel_id = p_hotel_id and is_desk) then
    v_missing := v_missing || 'a front-desk contact'::text;
  end if;
  if not exists (select 1 from public.hotel_contact where hotel_id = p_hotel_id and is_finance) then
    v_missing := v_missing || 'a finance contact'::text;
  end if;
  if not exists (
    select 1 from public.hotel_access_rule where hotel_id = p_hotel_id and superseded_at is null
  ) then
    v_missing := v_missing || 'an access rule for riders'::text;
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Still missing %.', array_to_string(v_missing, ', ')
      using errcode = 'check_violation';
  end if;

  insert into public.approval_request
    (kind, target_type, target_id, city_id, requested_by, reason, payload)
  values ('hotel_activation', 'hotel', p_hotel_id, v_hotel.city_id, authz.staff_id(),
          coalesce(nullif(trim(p_reason), ''), 'Activate as partner'),
          jsonb_build_object('tier', p_tier, 'commission_pct', p_commission_pct))
  returning * into v_request;

  perform audit.log('staff'::public.actor_type, 'hotels', 'hotel.activation_requested',
    p_target_type => 'hotel', p_target_id => p_hotel_id, p_city_id => v_hotel.city_id,
    p_severity => 'high'::public.audit_severity);

  return v_request;
end;
$$;

create or replace function public.rpc_hotel_activate_approve(p_request_id uuid)
returns public.hotel
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.approval_request;
  v_hotel public.hotel;
  v_me uuid := authz.staff_id();
begin
  select * into v_request from public.approval_request
  where id = p_request_id and status = 'pending' and kind = 'hotel_activation';

  if v_request.id is null then
    raise exception 'No such request, or it is already decided.' using errcode = 'no_data_found';
  end if;
  if not authz.works_hospitality(null) and not authz.has_role('finance', null) then
    raise exception 'Not yours to approve.' using errcode = 'insufficient_privilege';
  end if;
  if v_request.requested_by = v_me then
    raise exception 'You asked for this. Somebody else has to approve it.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.hotel set
    status = 'partner',
    tier = (v_request.payload ->> 'tier')::public.hotel_tier,
    commission_pct = nullif(v_request.payload ->> 'commission_pct', '')::numeric,
    prospect_stage = 'won'
  where id = v_request.target_id
  returning * into v_hotel;

  insert into public.hotel_program_setting (hotel_id) values (v_hotel.id)
  on conflict (hotel_id) do nothing;

  update public.approval_request
  set status = 'approved', decided_by = v_me, decided_at = now()
  where id = p_request_id;

  insert into public.notification (kind, status) values ('hotel_users_invite', 'pending');

  perform audit.log('staff'::public.actor_type, 'hotels', 'hotel.activated',
    p_target_type => 'hotel', p_target_id => v_hotel.id, p_city_id => v_hotel.city_id,
    p_approved_by => v_me, p_reason => v_request.reason,
    p_after => v_request.payload, p_severity => 'high'::public.audit_severity);

  return v_hotel;
end;
$$;

create or replace function public.rpc_hotel_setting_update(p_hotel_id uuid, p_patch jsonb)
returns public.hotel_program_setting
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_setting public.hotel_program_setting;
begin
  if not authz.is_hotel_member(p_hotel_id, 'admin') and not authz.works_hospitality(null) then
    raise exception 'Not yours to change.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.hotel_program_setting (hotel_id) values (p_hotel_id)
  on conflict (hotel_id) do nothing;

  update public.hotel_program_setting set
    charge_to_room = coalesce((p_patch ->> 'charge_to_room')::boolean, charge_to_room),
    charge_cap_per_stay = case when p_patch ? 'charge_cap_per_stay'
      then nullif(p_patch ->> 'charge_cap_per_stay', '')::bigint else charge_cap_per_stay end,
    folio_sync = coalesce((p_patch ->> 'folio_sync')::public.folio_sync, folio_sync),
    in_room_qr = coalesce((p_patch ->> 'in_room_qr')::boolean, in_room_qr),
    front_desk_ordering = coalesce((p_patch ->> 'front_desk_ordering')::boolean, front_desk_ordering),
    guest_pays_delivery = coalesce((p_patch ->> 'guest_pays_delivery')::boolean, guest_pays_delivery),
    desk_sla_minutes = coalesce((p_patch ->> 'desk_sla_minutes')::integer, desk_sla_minutes),
    escalate_after_minutes = coalesce((p_patch ->> 'escalate_after_minutes')::integer,
                                      escalate_after_minutes),
    updated_by = authz.staff_id(),
    updated_at = now()
  where hotel_id = p_hotel_id
  returning * into v_setting;

  perform audit.log('staff'::public.actor_type, 'hotels', 'hotel.setting_changed',
    p_target_type => 'hotel', p_target_id => p_hotel_id, p_after => p_patch,
    p_severity => 'notice'::public.audit_severity);

  return v_setting;
end;
$$;

/*
 * A new version rather than an edit. Riders already out keep the
 * version they left with, which is only possible if the old one is
 * still here.
 */
create or replace function public.rpc_hotel_access_rule_publish(
  p_hotel_id uuid,
  p_text text,
  p_delivery_from time default null,
  p_delivery_to time default null,
  p_after_hours text default 'reception'
)
returns public.hotel_access_rule
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.hotel_access_rule;
  v_next integer;
begin
  if not authz.is_hotel_member(p_hotel_id, 'admin') and not authz.works_hospitality(null) then
    raise exception 'Not yours to change.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_text), '') = '' then
    raise exception 'A rider needs to be told something. Write the rule.'
      using errcode = 'check_violation';
  end if;

  select coalesce(max(version), 0) + 1 into v_next
  from public.hotel_access_rule where hotel_id = p_hotel_id;

  update public.hotel_access_rule set superseded_at = now()
  where hotel_id = p_hotel_id and superseded_at is null;

  insert into public.hotel_access_rule
    (hotel_id, version, text, delivery_from, delivery_to, after_hours_handoff, updated_by)
  values (p_hotel_id, v_next, trim(p_text), p_delivery_from, p_delivery_to,
          p_after_hours, authz.staff_id())
  returning * into v_rule;

  insert into public.notification (kind, status) values ('access_rule_changed', 'pending');

  perform audit.log('staff'::public.actor_type, 'hotels', 'hotel.access_rule_changed',
    p_target_type => 'hotel', p_target_id => p_hotel_id,
    p_after => jsonb_build_object('version', v_next),
    p_severity => 'notice'::public.audit_severity);

  return v_rule;
end;
$$;

grant execute on function public.rpc_hotel_prospect_upsert(jsonb, uuid) to authenticated;
grant execute on function public.rpc_hotel_activate_request(uuid, public.hotel_tier, numeric, text) to authenticated;
grant execute on function public.rpc_hotel_activate_approve(uuid) to authenticated;
grant execute on function public.rpc_hotel_setting_update(uuid, jsonb) to authenticated;
grant execute on function public.rpc_hotel_access_rule_publish(uuid, text, time, time, text) to authenticated;

-- ═══════════════════════════════════════ charge to room

/*
 * The guest asked to put this on their room. That is a request, not a
 * posting: the desk decides.
 *
 * Refused when no cap has been agreed. "No cap" is not "any amount" —
 * it means nobody has said how much a guest may charge, and guessing
 * puts a number on a stranger's hotel bill.
 */
create or replace function public.rpc_folio_request(
  p_order_reference text,
  p_hotel_id uuid,
  p_room_no text,
  p_surname text,
  p_amount bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_setting public.hotel_program_setting;
  v_hotel public.hotel;
  v_stay text;
  v_used bigint;
  v_posting public.folio_posting;
begin
  select * into v_hotel from public.hotel where id = p_hotel_id;
  select * into v_setting from public.hotel_program_setting where hotel_id = p_hotel_id;

  if v_hotel.status <> 'partner' or not coalesce(v_setting.charge_to_room, false) then
    return jsonb_build_object('ok', false,
      'reason', 'This hotel isn''t taking charges to the room right now.');
  end if;

  if v_setting.charge_cap_per_stay is null then
    return jsonb_build_object('ok', false,
      'reason', 'No spending limit has been agreed with this hotel, so we can''t charge to the room. Pay by M-Pesa or card instead.');
  end if;

  v_stay := lower(trim(p_room_no)) || '|' || lower(trim(p_surname));

  select used into v_used from public.folio_cap_usage
  where hotel_id = p_hotel_id and stay_key = v_stay;
  v_used := coalesce(v_used, 0);

  if v_used + p_amount > v_setting.charge_cap_per_stay then
    return jsonb_build_object('ok', false, 'reason',
      'That would go over the room''s limit for this stay. Pay by M-Pesa or card instead.',
      'cap', v_setting.charge_cap_per_stay, 'used', v_used);
  end if;

  insert into public.folio_posting
    (order_reference, hotel_id, room_no, guest_surname, amount, sync, cap_check,
     commission_amount)
  values (p_order_reference, p_hotel_id, trim(p_room_no), trim(p_surname), p_amount,
          v_setting.folio_sync,
          jsonb_build_object('cap', v_setting.charge_cap_per_stay,
                             'used_before', v_used, 'allowed', true),
          case when v_hotel.commission_pct is not null
            then round(p_amount * v_hotel.commission_pct / 100.0) end)
  returning * into v_posting;

  insert into public.notification (kind, status) values ('folio_new', 'pending');

  perform audit.log('guest'::public.actor_type, 'hotels', 'folio.requested',
    p_target_type => 'folio_posting', p_target_id => v_posting.id, p_city_id => v_hotel.city_id,
    p_after => jsonb_build_object('amount', p_amount, 'room', p_room_no));

  return jsonb_build_object('ok', true, 'posting_id', v_posting.id,
    'sla_minutes', v_setting.desk_sla_minutes);
end;
$$;

/*
 * The desk's decision. This is the only thing that can post a line.
 */
create or replace function public.rpc_folio_desk_action(
  p_posting_id uuid,
  p_action text,
  p_folio_ref text default null,
  p_note text default null
)
returns public.folio_posting
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_posting public.folio_posting;
  v_stay text;
begin
  select * into v_posting from public.folio_posting where id = p_posting_id;
  if v_posting.id is null then
    raise exception 'No such posting.' using errcode = 'no_data_found';
  end if;
  if not authz.is_hotel_member(v_posting.hotel_id) and not authz.works_hospitality(null) then
    raise exception 'Not your hotel.' using errcode = 'insufficient_privilege';
  end if;
  if v_posting.status <> 'awaiting_desk' then
    raise exception 'That one is already %.', v_posting.status using errcode = 'check_violation';
  end if;

  if p_action = 'confirm' then
    update public.folio_posting set
      status = 'posted',
      desk_user_id = (select auth.uid()),
      desk_action_at = now(),
      folio_ref = nullif(trim(coalesce(p_folio_ref, '')), ''),
      desk_note = nullif(trim(coalesce(p_note, '')), '')
    where id = p_posting_id
    returning * into v_posting;

    v_stay := lower(v_posting.room_no) || '|' || lower(v_posting.guest_surname);

    insert into public.folio_cap_usage (hotel_id, stay_key, room_no, used, last_order_at)
    values (v_posting.hotel_id, v_stay, v_posting.room_no, v_posting.amount, now())
    on conflict (hotel_id, stay_key) do update
      set used = public.folio_cap_usage.used + excluded.used, last_order_at = now();

    insert into public.notification (kind, status) values ('charged_to_room', 'pending');

  elsif p_action in ('reject_checked_out', 'reject_name_mismatch', 'reject_cap') then
    update public.folio_posting set
      status = case p_action
        when 'reject_checked_out' then 'rejected_checked_out'
        when 'reject_name_mismatch' then 'rejected_name_mismatch'
        else 'rejected_cap' end::public.folio_status,
      desk_user_id = (select auth.uid()),
      desk_action_at = now(),
      desk_note = nullif(trim(coalesce(p_note, '')), '')
    where id = p_posting_id
    returning * into v_posting;

    /* The guest is told, and given a way to pay. A rejection is not a
       cancelled order until they decline to. */
    insert into public.notification (kind, status) values ('folio_rejected_pay_now', 'pending');

  else
    raise exception 'Confirm, or reject with a reason.' using errcode = 'check_violation';
  end if;

  perform audit.log('merchant_user'::public.actor_type, 'hotels',
    case when p_action = 'confirm' then 'folio.posted' else 'folio.rejected' end,
    p_target_type => 'folio_posting', p_target_id => p_posting_id,
    p_reason => p_note,
    p_after => jsonb_build_object('action', p_action, 'folio_ref', p_folio_ref,
                                  'amount', v_posting.amount),
    p_severity => 'notice'::public.audit_severity);

  return v_posting;
end;
$$;

/*
 * The sweep. Anything past the hotel's escalation window is marked and
 * the desk is called. Run on a schedule.
 */
create or replace function public.fn_folio_escalation_sweep()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  with late as (
    update public.folio_posting f
    set escalated_at = now()
    from public.hotel_program_setting s
    where s.hotel_id = f.hotel_id
      and f.status = 'awaiting_desk'
      and f.escalated_at is null
      and f.created_at < now() - make_interval(mins => coalesce(s.escalate_after_minutes, 60))
    returning f.id
  )
  select count(*) into v_n from late;

  if v_n > 0 then
    insert into public.notification (kind, status) values ('folio_escalated', 'pending');
  end if;

  return v_n;
end;
$$;

/* Voiding a posted line moves money. Two people. */
create or replace function public.rpc_folio_void(p_posting_id uuid, p_reason text)
returns public.folio_posting
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_posting public.folio_posting;
begin
  if not authz.works_hospitality(null) then
    raise exception 'Not yours to void.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why.' using errcode = 'check_violation';
  end if;

  select * into v_posting from public.folio_posting where id = p_posting_id;

  if v_posting.status = 'posted' then
    raise exception 'That line is already on the guest''s bill. Voiding it needs a second person — raise an approval request.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.folio_posting set status = 'void', voided_reason = trim(p_reason)
  where id = p_posting_id returning * into v_posting;

  perform audit.log('staff'::public.actor_type, 'hotels', 'folio.voided',
    p_target_type => 'folio_posting', p_target_id => p_posting_id,
    p_reason => trim(p_reason), p_severity => 'high'::public.audit_severity);

  return v_posting;
end;
$$;

grant execute on function public.rpc_folio_request(text, uuid, text, text, bigint) to authenticated, service_role;
grant execute on function public.rpc_folio_desk_action(uuid, text, text, text) to authenticated;
grant execute on function public.fn_folio_escalation_sweep() to service_role;
grant execute on function public.rpc_folio_void(uuid, text) to authenticated;

-- ═══════════════════════════════════ statements and reconciliation

create or replace function public.rpc_hotel_statement_build(p_hotel_id uuid, p_period date)
returns public.hotel_statement
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statement public.hotel_statement;
  v_hotel public.hotel;
begin
  if not authz.works_hospitality(null) and not authz.has_role('finance', null) then
    raise exception 'Not yours to build.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_hotel from public.hotel where id = p_hotel_id;

  insert into public.hotel_statement (hotel_id, period, due_at)
  values (p_hotel_id, date_trunc('month', p_period)::date,
          (date_trunc('month', p_period) + interval '1 month')::date
            + coalesce(v_hotel.invoice_terms_days, 14))
  on conflict (hotel_id, period) do update set status = 'draft'
  returning * into v_statement;

  update public.hotel_statement s set
    postings_count = x.n,
    gross = x.gross,
    commission = x.commission,
    /* NexG invoices the hotel gross less commission. The model is
       finance's to confirm; nothing here assumes a rate that is not
       on the hotel record. */
    net_invoiced = x.gross - x.commission
  from (
    select count(*)::integer as n,
           coalesce(sum(amount), 0) as gross,
           coalesce(sum(commission_amount), 0) as commission
    from public.folio_posting f
    where f.hotel_id = p_hotel_id
      and f.status = 'posted'
      and f.desk_action_at >= date_trunc('month', p_period)
      and f.desk_action_at < date_trunc('month', p_period) + interval '1 month'
  ) x
  where s.id = v_statement.id
  returning s.* into v_statement;

  perform audit.log('staff'::public.actor_type, 'hotels', 'statement.ready',
    p_target_type => 'hotel', p_target_id => p_hotel_id, p_city_id => v_hotel.city_id,
    p_after => jsonb_build_object('gross', v_statement.gross,
                                  'commission', v_statement.commission,
                                  'net', v_statement.net_invoiced),
    p_severity => 'high'::public.audit_severity);

  return v_statement;
end;
$$;

/*
 * Match the hotel's folio export against our ledger. By reference
 * first, then by room + amount + date within a day, because night
 * staff post lines by hand and leave the reference off.
 */
create or replace function public.rpc_reconciliation_import(
  p_statement_id uuid,
  p_lines jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statement public.hotel_statement;
  v_line jsonb;
  v_match public.folio_posting;
  v_n integer := 0;
begin
  if not authz.works_hospitality(null) and not authz.has_role('finance', null) then
    raise exception 'Not yours to import.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_statement from public.hotel_statement where id = p_statement_id;
  delete from public.folio_reconciliation where statement_id = p_statement_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_match := null;

    if nullif(v_line ->> 'ref', '') is not null then
      select * into v_match from public.folio_posting
      where hotel_id = v_statement.hotel_id and folio_ref = v_line ->> 'ref';
    end if;

    if v_match.id is null then
      select * into v_match from public.folio_posting f
      where f.hotel_id = v_statement.hotel_id
        and f.room_no = v_line ->> 'room'
        and f.amount = (v_line ->> 'amount')::bigint
        and f.desk_action_at between (v_line ->> 'date')::date - 1
                                 and (v_line ->> 'date')::date + 1
      limit 1;
    end if;

    insert into public.folio_reconciliation
      (statement_id, hotel_line_ref, hotel_amount, nexg_order_reference, nexg_amount, status)
    values (
      p_statement_id,
      v_line ->> 'ref',
      (v_line ->> 'amount')::bigint,
      v_match.order_reference,
      v_match.amount,
      case when v_match.id is null then 'missing_reference' else 'matched' end
    );

    v_n := v_n + 1;
  end loop;

  if exists (
    select 1 from public.folio_reconciliation
    where statement_id = p_statement_id and status = 'missing_reference'
  ) then
    insert into public.notification (kind, status) values ('reconciliation_lines', 'pending');
  end if;

  perform audit.log('staff'::public.actor_type, 'hotels', 'statement.reconciled',
    p_target_type => 'hotel_statement', p_target_id => p_statement_id,
    p_after => jsonb_build_object('lines', v_n));

  return v_n;
end;
$$;

grant execute on function public.rpc_hotel_statement_build(uuid, date) to authenticated;
grant execute on function public.rpc_reconciliation_import(uuid, jsonb) to authenticated;

-- ═══════════════════════════════════ guests, consent, KDPA

create or replace function public.rpc_guest_reveal_phone(p_guest_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest public.guest;
begin
  if not authz.handles_guest_data() then
    raise exception 'Not yours to see.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why you need the number. The reason is kept with your name.'
      using errcode = 'check_violation';
  end if;

  select * into v_guest from public.guest where id = p_guest_id;

  perform audit.log('staff'::public.actor_type, 'hotels', 'pii.revealed',
    p_target_type => 'guest', p_target_id => p_guest_id, p_reason => trim(p_reason),
    p_severity => 'high'::public.audit_severity);

  return jsonb_build_object('ok', true, 'phone', v_guest.phone);
end;
$$;

create or replace function public.rpc_guest_consent_set(
  p_guest_id uuid,
  p_kind public.guest_consent_kind,
  p_granted boolean,
  p_source text default 'checkout'
)
returns public.guest_consent
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.guest_consent;
begin
  insert into public.guest_consent (guest_id, kind, granted, source)
  values (p_guest_id, p_kind, p_granted, p_source)
  returning * into v_row;

  perform audit.log(
    case when p_source = 'staff' then 'staff' else 'guest' end::public.actor_type,
    'hotels', 'guest.consent_changed',
    p_target_type => 'guest', p_target_id => p_guest_id,
    p_after => jsonb_build_object('kind', p_kind, 'granted', p_granted, 'source', p_source));

  return v_row;
end;
$$;

create or replace function public.rpc_data_request_create(
  p_kind public.data_request_kind,
  p_phone text default null,
  p_email text default null,
  p_scope text[] default null,
  p_channel text default 'help_form'
)
returns public.data_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.data_request;
  v_guest uuid;
begin
  if coalesce(trim(coalesce(p_phone, '')), '') = ''
     and coalesce(trim(coalesce(p_email, '')), '') = '' then
    raise exception 'We need a phone number or an email to reach you about this.'
      using errcode = 'check_violation';
  end if;

  select id into v_guest from public.guest
  where phone = trim(p_phone) or (p_email is not null and p_email <> '');

  insert into public.data_request (guest_id, requester_phone, requester_email, kind, channel, scope)
  values (v_guest, nullif(trim(coalesce(p_phone, '')), ''),
          nullif(trim(coalesce(p_email, '')), ''), p_kind, p_channel,
          coalesce(p_scope, array['orders', 'messages', 'payments', 'profile', 'consents']))
  returning * into v_request;

  insert into public.notification (kind, status) values ('data_request_received', 'pending');
  insert into public.notification (kind, status) values ('data_request_identity_otp', 'pending');

  perform audit.log('guest'::public.actor_type, 'hotels', 'data_request.received',
    p_target_type => 'data_request', p_target_id => v_request.id,
    p_after => jsonb_build_object('kind', p_kind, 'due_at', v_request.due_at),
    p_severity => 'high'::public.audit_severity);

  return v_request;
end;
$$;

/*
 * What blocks an erasure. Computed rather than typed, so it cannot go
 * stale between somebody reading it and somebody acting on it.
 */
create or replace function public.fn_data_request_blockers(p_request_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'identity', case when dr.identity_verified_at is null
      then 'Identity has not been verified yet.' end,
    /* This guest's own open disputes, not anybody's. An unscoped
       check here would block every erasure in the country the moment
       one dispute was open. */
    'open_dispute', case when exists (
        select 1
        from public.dispute d
        join public.guest g on g.id = dr.guest_id
        where d.guest_user_id is not null
          and d.guest_user_id = g.user_id
          and d.status in ('open', 'awaiting_merchant')
      ) then 'An open dispute must close first.' end,
    'finance_retention', case when dr.kind = 'erasure' then
      'Finance records are retained 7 years on a lawful basis — those are anonymised, not deleted.'
      end
  ))
  from public.data_request dr where dr.id = p_request_id
$$;

create or replace function public.rpc_data_request_verify_identity(
  p_request_id uuid,
  p_method text default 'otp'
)
returns public.data_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.data_request;
begin
  if not authz.handles_guest_data() then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  update public.data_request set
    identity_verified_at = now(),
    identity_method = p_method,
    status = 'in_progress',
    handled_by = coalesce(handled_by, authz.staff_id())
  where id = p_request_id
  returning * into v_request;

  perform audit.log('staff'::public.actor_type, 'hotels', 'data_request.identity_verified',
    p_target_type => 'data_request', p_target_id => p_request_id,
    p_after => jsonb_build_object('method', p_method),
    p_severity => 'high'::public.audit_severity);

  return v_request;
end;
$$;

/*
 * The bundle. Only the scoped tables, payments masked, and nothing
 * about anybody other than the requester.
 */
create or replace function public.rpc_data_request_preview_bundle(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.data_request;
  v_guest public.guest;
  v_bundle jsonb := '{}'::jsonb;
begin
  if not authz.handles_guest_data() then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_request from public.data_request where id = p_request_id;

  if v_request.identity_verified_at is null then
    raise exception 'Verify who is asking before building a bundle of their data.'
      using errcode = 'check_violation';
  end if;

  select * into v_guest from public.guest where id = v_request.guest_id;

  if 'profile' = any (v_request.scope) then
    v_bundle := v_bundle || jsonb_build_object('profile', jsonb_build_object(
      'name', v_guest.name, 'phone', v_guest.phone, 'created_at', v_guest.created_at,
      'preferences', v_guest.preferences, 'staff_notes', v_guest.staff_notes));
  end if;

  if 'consents' = any (v_request.scope) then
    v_bundle := v_bundle || jsonb_build_object('consents',
      (select coalesce(jsonb_agg(jsonb_build_object(
        'kind', kind, 'granted', granted, 'at', at, 'source', source) order by at), '[]'::jsonb)
       from public.guest_consent where guest_id = v_guest.id));
  end if;

  if 'payments' = any (v_request.scope) then
    /* Masked. A data bundle is not a place to put a card number. */
    v_bundle := v_bundle || jsonb_build_object('payments', v_guest.payment_summary);
  end if;

  if 'orders' = any (v_request.scope) then
    v_bundle := v_bundle || jsonb_build_object('orders',
      (select coalesce(jsonb_agg(jsonb_build_object(
        'order_reference', order_reference, 'hotel', hotel_id, 'room', room_no,
        'amount', amount, 'status', status, 'at', created_at)), '[]'::jsonb)
       from public.folio_posting where guest_id = v_guest.id));
  end if;

  v_bundle := v_bundle || jsonb_build_object('note',
    'Finance records are retained for 7 years on a lawful basis and are anonymised rather than deleted.');

  update public.data_request set status = 'bundle_ready' where id = p_request_id;

  perform audit.log('staff'::public.actor_type, 'hotels', 'data_request.bundle_previewed',
    p_target_type => 'data_request', p_target_id => p_request_id,
    p_severity => 'high'::public.audit_severity);

  return v_bundle;
end;
$$;

/*
 * Anonymise, never delete. Order totals and ledger lines stay so the
 * books still balance; everything that names a person becomes a token.
 */
create or replace function public.fn_anonymise_guest(p_guest_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.guest set
    name = 'Guest ' || left(replace(p_guest_id::text, '-', ''), 8),
    phone = null,
    preferences = '{}'::jsonb,
    payment_summary = '{}'::jsonb,
    staff_notes = null,
    last_stay = null,
    user_id = null,
    anonymised_at = now()
  where id = p_guest_id;

  update public.folio_posting set guest_surname = '[erased]'
  where guest_id = p_guest_id;

  perform audit.log('staff'::public.actor_type, 'hotels', 'guest.anonymised',
    p_target_type => 'guest', p_target_id => p_guest_id,
    p_severity => 'high'::public.audit_severity);
end;
$$;

create or replace function public.rpc_data_request_anonymise(p_request_id uuid)
returns public.data_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.data_request;
  v_blockers jsonb;
begin
  if not authz.handles_guest_data() then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_request from public.data_request where id = p_request_id;
  if v_request.guest_id is null then
    raise exception 'This request is not linked to a guest record.' using errcode = 'no_data_found';
  end if;

  v_blockers := public.fn_data_request_blockers(p_request_id);

  /* finance_retention is a note, not a blocker — it is the reason we
     anonymise instead of deleting. Anything else stops this. */
  v_blockers := v_blockers - 'finance_retention';

  if v_blockers <> '{}'::jsonb then
    raise exception 'Cannot anonymise yet: %',
      (select string_agg(value #>> '{}', ' ') from jsonb_each(v_blockers))
      using errcode = 'check_violation';
  end if;

  perform public.fn_anonymise_guest(v_request.guest_id);

  update public.data_request set
    status = 'fulfilled', fulfilled_at = now(),
    handled_by = coalesce(handled_by, authz.staff_id())
  where id = p_request_id
  returning * into v_request;

  insert into public.notification (kind, status) values ('data_request_fulfilled', 'pending');

  return v_request;
end;
$$;

create or replace function public.rpc_data_request_hold(p_request_id uuid, p_reason text)
returns public.data_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.data_request;
begin
  if not authz.handles_guest_data() then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A hold needs a reason the requester can be told.'
      using errcode = 'check_violation';
  end if;

  update public.data_request set
    blocking_reasons = blocking_reasons || jsonb_build_object('manual', trim(p_reason)),
    communication_log = communication_log ||
      jsonb_build_array(jsonb_build_object('at', now(), 'note', trim(p_reason)))
  where id = p_request_id
  returning * into v_request;

  insert into public.notification (kind, status) values ('data_request_held', 'pending');

  perform audit.log('staff'::public.actor_type, 'hotels', 'data_request.held',
    p_target_type => 'data_request', p_target_id => p_request_id, p_reason => trim(p_reason),
    p_severity => 'high'::public.audit_severity);

  return v_request;
end;
$$;

/* Nightly. Applies the retention rules, anonymising rather than
   deleting wherever a lawful basis says to keep the record. */
create or replace function public.cron_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.retention_rule;
  v_n integer := 0;
  v_count integer;
begin
  select * into v_rule from public.retention_rule where key = 'guest_checkout_no_account';

  if v_rule.retain_for is not null then
    with stale as (
      select id from public.guest
      where user_id is null
        and anonymised_at is null
        and coalesce(last_order_at, created_at) < now() - v_rule.retain_for
    )
    select count(*) into v_count from stale;

    perform public.fn_anonymise_guest(g.id)
    from public.guest g
    where g.user_id is null
      and g.anonymised_at is null
      and coalesce(g.last_order_at, g.created_at) < now() - v_rule.retain_for;

    v_n := v_n + coalesce(v_count, 0);
  end if;

  return v_n;
end;
$$;

grant execute on function public.rpc_guest_reveal_phone(uuid, text) to authenticated;
grant execute on function public.rpc_guest_consent_set(uuid, public.guest_consent_kind, boolean, text) to anon, authenticated;
grant execute on function public.rpc_data_request_create(public.data_request_kind, text, text, text[], text) to anon, authenticated;
grant execute on function public.fn_data_request_blockers(uuid) to authenticated;
grant execute on function public.rpc_data_request_verify_identity(uuid, text) to authenticated;
grant execute on function public.rpc_data_request_preview_bundle(uuid) to authenticated;
grant execute on function public.rpc_data_request_anonymise(uuid) to authenticated;
grant execute on function public.rpc_data_request_hold(uuid, text) to authenticated;
grant execute on function public.cron_retention() to service_role;
