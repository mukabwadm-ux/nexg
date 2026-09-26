-- Public application intake — spec sections 4.2 and 4.3.
--
-- An applicant has no account when they start, and the rider table allows a
-- null user_id "until phone verified" (section 3.2). These functions are how
-- that first row gets created: SECURITY DEFINER, validating everything they
-- accept, and writing an audit event like every other state change.
--
-- They deliberately do not grant anything else. An application can be created;
-- it cannot be read back, edited or advanced without an authenticated session
-- that the RLS policies recognise.

create or replace function public.rpc_rider_apply(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_city_id uuid,
  p_vehicle public.vehicle_type,
  p_plate_no text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_city public.city;
  v_rider public.rider;
begin
  select * into v_city from public.city where id = p_city_id;
  if v_city.id is null then
    raise exception 'That city is not one we operate in.' using errcode = 'no_data_found';
  end if;

  -- Section 8: riders may not apply from waitlist cities; those are captured
  -- as waitlist sign-ups instead, which the caller handles.
  if v_city.status = 'waitlist' then
    raise exception 'We are not recruiting riders in % yet.', v_city.name
      using errcode = 'check_violation';
  end if;

  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Enter a valid phone number.' using errcode = 'check_violation';
  end if;

  -- Re-applying with the same number resumes the existing application rather
  -- than failing on the unique constraint or creating a duplicate.
  select * into v_rider from public.rider where phone = p_phone;

  if v_rider.id is not null then
    if v_rider.status in ('active', 'suspended', 'offboarded') then
      raise exception 'That number already belongs to a rider account. Sign in instead.'
        using errcode = 'unique_violation';
    end if;

    update public.rider
    set first_name = p_first_name,
        last_name = p_last_name,
        city_id = p_city_id,
        vehicle = p_vehicle,
        plate_no = coalesce(p_plate_no, plate_no)
    where id = v_rider.id
    returning * into v_rider;
  else
    insert into public.rider (first_name, last_name, phone, city_id, vehicle, plate_no)
    values (p_first_name, p_last_name, p_phone, p_city_id, p_vehicle, p_plate_no)
    returning * into v_rider;

    perform audit.log(
      p_actor_type => 'guest'::public.actor_type,
      p_module => 'rider',
      p_action => 'rider.applied',
      p_target_type => 'rider',
      p_target_id => v_rider.id,
      p_after => jsonb_build_object('status', 'applied', 'vehicle', p_vehicle),
      p_city_id => p_city_id
    );
  end if;

  return v_rider.id;
end;
$$;

comment on function public.rpc_rider_apply is
  'Creates or resumes a rider application. Phone verification (section 4.2) gates the next step, not this one: the row exists with a null user_id until the applicant verifies.';

-- ---------------------------------------------------------------- merchants

create or replace function public.rpc_merchant_apply(
  p_legal_name text,
  p_trading_name text,
  p_category public.merchant_category,
  p_contact_name text,
  p_contact_phone text,
  p_contact_email text,
  p_city_id uuid,
  p_category_other text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_city public.city;
  v_merchant public.merchant;
begin
  select * into v_city from public.city where id = p_city_id;
  if v_city.id is null then
    raise exception 'That city is not one we operate in.' using errcode = 'no_data_found';
  end if;

  if v_city.status = 'waitlist' then
    raise exception 'We are not onboarding merchants in % yet.', v_city.name
      using errcode = 'check_violation';
  end if;

  if p_contact_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Enter a valid phone number.' using errcode = 'check_violation';
  end if;

  select * into v_merchant from public.merchant where contact_email = lower(trim(p_contact_email));

  if v_merchant.id is not null then
    if v_merchant.status in ('live', 'paused', 'delisted') then
      raise exception 'That email already belongs to a registered business. Sign in instead.'
        using errcode = 'unique_violation';
    end if;

    update public.merchant
    set legal_name = p_legal_name,
        trading_name = p_trading_name,
        category = p_category,
        category_other = p_category_other,
        contact_name = p_contact_name,
        contact_phone = p_contact_phone,
        city_id = p_city_id
    where id = v_merchant.id
    returning * into v_merchant;
  else
    insert into public.merchant (
      legal_name, trading_name, category, category_other,
      contact_name, contact_phone, contact_email, city_id
    )
    values (
      p_legal_name, p_trading_name, p_category, p_category_other,
      p_contact_name, p_contact_phone, lower(trim(p_contact_email)), p_city_id
    )
    returning * into v_merchant;

    perform audit.log(
      p_actor_type => 'guest'::public.actor_type,
      p_module => 'merchant',
      p_action => 'merchant.applied',
      p_target_type => 'merchant',
      p_target_id => v_merchant.id,
      p_after => jsonb_build_object('status', 'applied', 'category', p_category),
      p_city_id => p_city_id
    );
  end if;

  return v_merchant.id;
end;
$$;

comment on function public.rpc_merchant_apply is
  'Creates or resumes a merchant application. Email verification claims the record by inserting merchant_user; until then it has no owner.';

grant execute on function public.rpc_rider_apply(
  text, text, text, uuid, public.vehicle_type, text
) to anon, authenticated;

grant execute on function public.rpc_merchant_apply(
  text, text, public.merchant_category, text, text, text, uuid, text
) to anon, authenticated;
