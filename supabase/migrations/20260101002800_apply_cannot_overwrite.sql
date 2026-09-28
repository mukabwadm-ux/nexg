-- An open application may only be edited by whoever owns it.
--
-- Both apply RPCs resume an existing application when the phone number or
-- email already has one. That is the behaviour we want — an applicant who
-- comes back should not hit a unique-constraint error — but it was applied
-- without asking whose application it is.
--
-- The effect, found by running the registration twice from two browsers:
-- knowing a merchant's contact email, or a rider's phone number, was enough
-- to rewrite their legal name, trading name, contact person, phone and plate.
-- Ownership itself was safe (the claim only fires on an unowned row, and
-- uploads were correctly refused), so this was not a route into anyone's
-- documents. It was worse in a quieter way: changing the contact phone on a
-- pending application redirects the verification call to the impostor.
--
-- So: resuming stays, but only for the owner, or for an application nobody
-- has claimed yet.

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

  if v_city.status = 'waitlist' then
    raise exception 'We are not recruiting riders in % yet.', v_city.name
      using errcode = 'check_violation';
  end if;

  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Enter a valid phone number.' using errcode = 'check_violation';
  end if;

  select * into v_rider from public.rider where phone = p_phone;

  if v_rider.id is not null then
    if v_rider.status in ('active', 'suspended', 'offboarded') then
      raise exception 'That number already belongs to a rider account. Sign in instead.'
        using errcode = 'unique_violation';
    end if;

    /*
     * Someone else's open application. Not ours to edit, and not ours to
     * report on either — so the caller is told the number is taken and
     * nothing about it is returned.
     */
    if v_rider.user_id is not null and v_rider.user_id is distinct from v_caller then
      raise exception 'There is already an application on that number. If it is yours, use the device you started it on, or contact us.'
        using errcode = 'insufficient_privilege';
    end if;

    update public.rider
    set first_name = p_first_name,
        last_name = p_last_name,
        city_id = p_city_id,
        vehicle = p_vehicle,
        plate_no = coalesce(p_plate_no, plate_no),
        user_id = coalesce(v_rider.user_id, v_caller)
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
  'Creates or resumes a rider application. Resuming is limited to the owner, or to an application nobody has claimed: knowing a phone number must not be enough to edit someone else''s details.';

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
    if v_merchant.status in ('live', 'paused', 'suspended', 'delisted') then
      raise exception 'That email already belongs to a registered business. Sign in instead.'
        using errcode = 'unique_violation';
    end if;

    select count(*) into v_owners
    from public.merchant_user mu
    where mu.merchant_id = v_merchant.id;

    -- Owned by someone, and that someone is not this caller.
    if v_owners > 0 and not authz.is_merchant_member(v_merchant.id) then
      raise exception 'There is already a registration on that email. If it is yours, use the device you started it on, or contact us.'
        using errcode = 'insufficient_privilege';
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

    v_owners := 0;
  end if;

  if v_caller is not null and v_owners = 0 then
    insert into public.merchant_user (merchant_id, user_id, role)
    values (v_merchant.id, v_caller, 'owner')
    on conflict (merchant_id, user_id) do nothing;
  end if;

  return v_merchant.id;
end;
$$;

comment on function public.rpc_merchant_apply is
  'Creates or resumes a merchant registration. Resuming is limited to an owner, or to a business nobody has claimed: knowing a contact email must not be enough to edit someone else''s details.';

grant execute on function public.rpc_rider_apply(
  text, text, text, uuid, public.vehicle_type, text
) to anon, authenticated;

grant execute on function public.rpc_merchant_apply(
  text, text, public.merchant_category, text, text, text, uuid, text
) to anon, authenticated;
