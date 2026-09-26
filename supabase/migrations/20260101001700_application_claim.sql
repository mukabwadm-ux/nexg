-- Let an applicant own the application they just created — spec section 4.2/4.3.
--
-- The document policies and the storage policies both ask the same question:
-- is rider.user_id (or merchant_user.user_id) the caller? Until the applicant
-- has an identity, that answer is always no, so nothing can be uploaded.
--
-- The spec puts an SMS OTP here. The provider is still a [DECIDE] in section 8,
-- so the applicant gets an anonymous Supabase session instead: enough to own
-- one application and upload against it, and nothing else. When the OTP lands,
-- it replaces how the session is obtained; the claim below does not change.
--
-- A row is claimed only when it is unowned, or already owned by this caller.
-- Re-applying on a phone number that belongs to someone else's session must
-- not hand over their application, so it is left alone and the caller sees the
-- application as unclaimed — they cannot upload to it.

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
  v_caller uuid := (select auth.uid());
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
        plate_no = coalesce(p_plate_no, plate_no),
        -- Claim only what is unowned. Someone else's open application keeps
        -- its owner, and this caller simply cannot upload against it.
        user_id = case
          when v_rider.user_id is null then v_caller
          else v_rider.user_id
        end
    where id = v_rider.id
    returning * into v_rider;
  else
    insert into public.rider (first_name, last_name, phone, city_id, vehicle, plate_no, user_id)
    values (p_first_name, p_last_name, p_phone, p_city_id, p_vehicle, p_plate_no, v_caller)
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
  'Creates or resumes a rider application, claiming it for the calling session when it has no owner. Phone verification (section 4.2) replaces how that session is obtained, not this function.';

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
  v_caller uuid := (select auth.uid());
  v_owners integer;
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

  /*
   * Claim the business for this session, but only while it has no owner at
   * all. A second applicant typing a registered email must not be added to
   * someone else's business — they are told to sign in above once the
   * merchant is live, and before that the first claimant keeps it.
   */
  if v_caller is not null then
    select count(*) into v_owners
    from public.merchant_user mu
    where mu.merchant_id = v_merchant.id;

    if v_owners = 0 then
      insert into public.merchant_user (merchant_id, user_id, role)
      values (v_merchant.id, v_caller, 'owner')
      on conflict (merchant_id, user_id) do nothing;
    end if;
  end if;

  return v_merchant.id;
end;
$$;

comment on function public.rpc_merchant_apply is
  'Creates or resumes a merchant application and makes the calling session its owner when it has none. Email verification (section 4.3) replaces how that session is obtained, not this function.';

grant execute on function public.rpc_rider_apply(
  text, text, text, uuid, public.vehicle_type, text
) to anon, authenticated;

grant execute on function public.rpc_merchant_apply(
  text, text, public.merchant_category, text, text, text, uuid, text
) to anon, authenticated;
