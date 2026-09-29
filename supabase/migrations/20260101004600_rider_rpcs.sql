-- Saving the rider flow, one tap at a time. Same shape as the merchant RPCs.

create or replace function public.fn_rider_draft_for_write(p_rider_id uuid)
returns public.rider
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.rider;
begin
  select * into r from public.rider where id = p_rider_id;

  if r.id is null then
    raise exception 'We could not find that application.' using errcode = 'no_data_found';
  end if;

  if r.user_id is distinct from (select auth.uid()) then
    raise exception 'That application belongs to someone else.'
      using errcode = 'insufficient_privilege';
  end if;

  if r.status not in ('applied', 'documents_pending', 'under_review') then
    raise exception 'You are already set up. Open the rider app.'
      using errcode = 'check_violation';
  end if;

  return r;
end;
$$;

-- ------------------------------------------------------------------ step 1

create or replace function public.rpc_rider_start(
  p_first_name text,
  p_phone text,
  p_city_id uuid default null,
  p_fleet_token text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  r public.rider;
  f public.merchant_fleet_rider;
begin
  if v_caller is null then
    raise exception 'Start a session first.' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(p_first_name), '') = '' then
    raise exception 'Tell us your first name.' using errcode = 'check_violation';
  end if;

  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Enter a valid phone number.' using errcode = 'check_violation';
  end if;

  /* A merchant may have declared this person. The invite prefills and links
     them; it grants nothing — they still do every step below. */
  if p_fleet_token is not null then
    select * into f from public.merchant_fleet_rider
    where invite_token_hash = encode(extensions.digest(p_fleet_token, 'sha256'), 'hex')
      and (invite_expires_at is null or invite_expires_at > now());
  end if;

  select * into r from public.rider
  where phone = p_phone and submitted_at is null and user_id = v_caller
  order by updated_at desc limit 1;

  if r.id is not null then
    update public.rider
    set first_name = trim(p_first_name),
        city_id = coalesce(p_city_id, city_id)
    where id = r.id;
    return r.id;
  end if;

  /* Somebody already riding for NexG on this number is not a new applicant. */
  if exists (select 1 from public.rider where phone = p_phone and user_id is distinct from v_caller) then
    raise exception 'There is already an application on that number. Sign in instead.'
      using errcode = 'unique_violation';
  end if;

  insert into public.rider (
    user_id, first_name, phone, city_id, status, onboarding_step,
    source, employer_merchant_id
  )
  values (
    v_caller, trim(p_first_name), p_phone, p_city_id, 'applied', 2,
    case when f.id is not null then 'merchant_fleet' else 'nexg_pool' end,
    f.merchant_id
  )
  returning * into r;

  if f.id is not null then
    update public.merchant_fleet_rider
    set invite_status = 'started', rider_id = r.id
    where id = f.id;

    perform audit.log(
      p_actor_type => 'rider'::public.actor_type,
      p_module => 'rider',
      p_action => 'rider.fleet_linked',
      p_target_type => 'rider',
      p_target_id => r.id,
      p_after => jsonb_build_object('merchant_id', f.merchant_id)
    );
  end if;

  perform audit.log(
    p_actor_type => 'rider'::public.actor_type,
    p_module => 'rider',
    p_action => 'rider.applied',
    p_target_type => 'rider',
    p_target_id => r.id,
    p_after => jsonb_build_object('source', r.source)
  );

  return r.id;
end;
$$;

-- --------------------------------------------------------- phone verification

create or replace function public.rpc_rider_request_phone_code(p_rider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_code text;
  v_bytes bytea;
  v_sender text;
begin
  r := public.fn_rider_draft_for_write(p_rider_id);

  if r.phone_verified_at is not null then
    return jsonb_build_object('verified', true);
  end if;

  v_bytes := extensions.gen_random_bytes(4);
  v_code := lpad(
    ((  (get_byte(v_bytes, 0)::bigint << 24)
      | (get_byte(v_bytes, 1)::bigint << 16)
      | (get_byte(v_bytes, 2)::bigint << 8)
      |  get_byte(v_bytes, 3)::bigint) % 1000000)::text,
    6, '0');

  update public.rider
  set phone_code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex'),
      phone_code_expires_at = now() + interval '5 minutes',
      phone_code_attempts = 0
  where id = r.id;

  select value #>> '{}' into v_sender
  from public.setting where key = 'sms_provider' and scope = 'global';

  insert into public.notification_log (channel, recipient, template, payload, status)
  values ('sms', r.phone, 'rider_otp', jsonb_build_object('rider_id', r.id),
          case when v_sender is null then 'skipped' else 'queued' end);

  return jsonb_build_object(
    'verified', false,
    'delivered', v_sender is not null,
    /* Only while no sender exists, so the flow can show it and say why. */
    'code', case when v_sender is null then v_code end
  );
end;
$$;

create or replace function public.rpc_rider_verify_phone_code(p_rider_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
begin
  r := public.fn_rider_draft_for_write(p_rider_id);

  if r.phone_verified_at is not null then
    return jsonb_build_object('verified', true, 'rider_id', r.id);
  end if;

  if r.phone_code_hash is null or r.phone_code_expires_at < now() then
    raise exception 'That code has expired. Ask for a new one.' using errcode = 'no_data_found';
  end if;

  if r.phone_code_attempts >= 3 then
    raise exception 'Too many tries. Ask for a new code.' using errcode = 'check_violation';
  end if;

  if encode(extensions.digest(trim(p_code), 'sha256'), 'hex') <> r.phone_code_hash then
    update public.rider set phone_code_attempts = phone_code_attempts + 1 where id = r.id;
    raise exception 'That code is not right.' using errcode = 'check_violation';
  end if;

  /*
   * Deliberately does not set payout_msisdn. Defaulting it to the number
   * they just proved would tick "M-Pesa payout" on the readiness ring
   * before anyone had asked them where their money should go — progress
   * they did not make, for a decision they have not yet seen. The payout
   * step offers their own number as the pre-selected option instead.
   */
  update public.rider
  set phone_verified_at = now(),
      phone_code_hash = null,
      phone_code_expires_at = null
  where id = r.id;

  perform audit.log(
    p_actor_type => 'rider'::public.actor_type,
    p_module => 'rider',
    p_action => 'rider.phone_verified',
    p_target_type => 'rider',
    p_target_id => r.id
  );

  return jsonb_build_object('verified', true, 'rider_id', r.id);
end;
$$;

-- ------------------------------------------------------- steps 2 through 5

/*
 * Everything a rider may say about themselves.
 *
 * Whitelisted by name rather than applied as a generic patch: unknown keys
 * are ignored so an older browser cannot fail a save, and the columns that
 * are assertions about the rider — verification, payout name checks,
 * activation, the cash cap — are simply not on the list.
 */
create or replace function public.rpc_rider_save_step(
  p_rider_id uuid,
  p_step smallint,
  p_patch jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_advanced boolean;
begin
  r := public.fn_rider_draft_for_write(p_rider_id);
  v_advanced := p_step > r.onboarding_step;

  update public.rider set
    first_name = coalesce(nullif(trim(p_patch ->> 'first_name'), ''), first_name),
    last_name = case when p_patch ? 'last_name'
                     then nullif(trim(p_patch ->> 'last_name'), '') else last_name end,
    city_id = coalesce((p_patch ->> 'city_id')::uuid, city_id),

    -- step 2
    plate_no = case when p_patch ? 'plate_no'
                    then nullif(upper(trim(p_patch ->> 'plate_no')), '') else plate_no end,
    ownership = coalesce((p_patch ->> 'ownership')::public.vehicle_ownership, ownership),
    owner_name = case when p_patch ? 'owner_name'
                      then nullif(trim(p_patch ->> 'owner_name'), '') else owner_name end,
    owner_phone = case when p_patch ? 'owner_phone'
                       then nullif(trim(p_patch ->> 'owner_phone'), '') else owner_phone end,
    insurance = coalesce((p_patch ->> 'insurance')::public.insurance_type, insurance),
    years_riding = coalesce(p_patch ->> 'years_riding', years_riding),
    bike_max_km = case when p_patch ? 'bike_max_km'
                       then (p_patch ->> 'bike_max_km')::int else bike_max_km end,

    -- step 3
    areas = coalesce(
      (select array_agg(value #>> '{}') from jsonb_array_elements(p_patch -> 'areas')), areas),
    shifts = coalesce(
      (select array_agg(value #>> '{}') from jsonb_array_elements(p_patch -> 'shifts')), shifts),
    cash_ok = coalesce((p_patch ->> 'cash_ok')::boolean, cash_ok),
    kit_has = coalesce(
      (select array_agg(value #>> '{}') from jsonb_array_elements(p_patch -> 'kit_has')), kit_has),
    notes = case when p_patch ? 'notes'
                 then nullif(trim(p_patch ->> 'notes'), '') else notes end,

    -- step 5
    payout_msisdn = coalesce(nullif(trim(p_patch ->> 'payout_msisdn'), ''), payout_msisdn),

    onboarding_step = greatest(onboarding_step, p_step)
  where id = r.id;

  if v_advanced then
    perform audit.log(
      p_actor_type => 'rider'::public.actor_type,
      p_module => 'rider',
      p_action => 'rider.step_saved',
      p_target_type => 'rider',
      p_target_id => r.id,
      p_after => jsonb_build_object('step', p_step)
    );
  end if;

  return public.fn_rider_readiness(r.id);
end;
$$;

/*
 * The vehicle, separately, because changing it invalidates the answers that
 * hung off the old one. A rider who switches from a motorbike to a bicycle
 * should not keep an insurance type and a plate that no longer apply — and
 * more importantly, should not keep the three documents those implied.
 */
create or replace function public.rpc_rider_set_vehicle(
  p_rider_id uuid,
  p_vehicle public.vehicle_type
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
begin
  r := public.fn_rider_draft_for_write(p_rider_id);

  if r.vehicle is distinct from p_vehicle then
    update public.rider
    set vehicle = p_vehicle,
        plate_no = case when p_vehicle = 'bicycle' then null else plate_no end,
        insurance = case when p_vehicle = 'bicycle' then null else insurance end,
        bike_max_km = case when p_vehicle = 'bicycle' then bike_max_km else null end,
        onboarding_step = greatest(onboarding_step, 3)
    where id = r.id;

    perform audit.log(
      p_actor_type => 'rider'::public.actor_type,
      p_module => 'rider',
      p_action => 'rider.vehicle_set',
      p_target_type => 'rider',
      p_target_id => r.id,
      p_before => jsonb_build_object('vehicle', r.vehicle),
      p_after => jsonb_build_object('vehicle', p_vehicle)
    );
  end if;

  return public.fn_rider_readiness(r.id);
end;
$$;

-- ------------------------------------------------------------ kit slot

/*
 * Booking a slot.
 *
 * Capacity is counted here rather than trusted from the client, and the row
 * is locked while it is counted — two riders tapping the last Tuesday slot
 * at the same moment must not both get it, or one turns up to a hub with no
 * kit for them.
 */
create or replace function public.rpc_book_slot(p_rider_id uuid, p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  s public.onboarding_slot;
begin
  r := public.fn_rider_draft_for_write(p_rider_id);

  select * into s from public.onboarding_slot where id = p_slot_id for update;

  if s.id is null then
    raise exception 'That session is no longer listed.' using errcode = 'no_data_found';
  end if;

  if s.starts_at < now() then
    raise exception 'That session has already started.' using errcode = 'check_violation';
  end if;

  if s.booked >= s.capacity then
    raise exception 'That session just filled up. Pick another time.'
      using errcode = 'check_violation';
  end if;

  /* Release the one they held before, if any. */
  if r.onboarding_slot_id is not null and r.onboarding_slot_id <> p_slot_id then
    update public.onboarding_slot
    set booked = greatest(0, booked - 1)
    where id = r.onboarding_slot_id;
  end if;

  if r.onboarding_slot_id is distinct from p_slot_id then
    update public.onboarding_slot set booked = booked + 1 where id = s.id;
  end if;

  update public.rider
  set onboarding_slot_id = s.id,
      onboarding_session_at = s.starts_at
  where id = r.id;

  perform audit.log(
    p_actor_type => 'rider'::public.actor_type,
    p_module => 'rider',
    p_action => 'rider.slot_booked',
    p_target_type => 'rider',
    p_target_id => r.id,
    p_after => jsonb_build_object('hub', s.hub_name, 'starts_at', s.starts_at)
  );

  return jsonb_build_object('hub', s.hub_name, 'starts_at', s.starts_at);
end;
$$;
