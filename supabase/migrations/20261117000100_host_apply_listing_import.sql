-- Host registration can import the applicant's Airbnb listing.
--
-- The form reads the listing's public preview (name, type, bedrooms,
-- bathrooms, guests, cover photo) and the applicant confirms it. On submit
-- the server reads it again and passes it here as p_payload.listing, so the
-- first property and unit are created already filled in. The exact address
-- is still typed: Airbnb never publishes it, and riders need it.
--
-- rpc_host_listing_photo_set then attaches the cover photo the server
-- copied into host-photos. Same rpc_host_apply as 20261116000100 otherwise.

create or replace function public.rpc_host_apply(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_user auth.users;
  v_host public.host;
  v_unit public.unit;
  v_phone text := nullif(trim(p_payload ->> 'phone'), '');
  v_email text;
  v_name text := nullif(trim(coalesce(p_payload ->> 'contact_name', p_payload ->> 'display_name', '')), '');
  v_address text := nullif(trim(coalesce(p_payload ->> 'address', '')), '');
  v_handoff public.handoff_mode := nullif(p_payload ->> 'handoff', '')::public.handoff_mode;
  v_city uuid;
  v_reference text;
  v_ticket_id uuid;
  v_body text;
  /* The listing the applicant confirmed on the form, read again server-side. */
  v_listing jsonb := case when jsonb_typeof(p_payload -> 'listing') = 'object' then p_payload -> 'listing' end;
  v_listing_name text;
  v_kind public.property_kind := 'apartment';
  v_bedrooms integer;
  v_bathrooms numeric;
  v_guests integer;
  v_property public.property;
  v_slug text;
begin
  if v_uid is null then
    raise exception 'Your session expired. Reload the page and try again.' using errcode = '42501';
  end if;

  /* The email is whatever the applicant verified, never what the request says. */
  select * into v_user from auth.users where id = v_uid;
  if v_user.id is null or coalesce(v_user.is_anonymous, false)
    or v_user.email is null or v_user.email_confirmed_at is null then
    raise exception 'Verify your email before submitting.' using errcode = '42501';
  end if;
  v_email := lower(trim(v_user.email));

  if v_name is null then
    raise exception 'We need a name to put on the QR pack.' using errcode = '22023';
  end if;
  if v_phone is null then
    raise exception 'A phone number is how we reach you about your guests.' using errcode = '22023';
  end if;
  if v_address is null then
    raise exception 'Where is the unit?' using errcode = '22023';
  end if;

  if exists (select 1 from public.host_user where user_id = v_uid) then
    raise exception 'This account already has a host workspace. Sign in to continue.'
      using errcode = '23505';
  end if;
  /* A login is one partner. The workspace picks merchant before host, so a
     merchant login that also owned a host could never open it. */
  if exists (select 1 from public.merchant_user where user_id = v_uid)
    or exists (select 1 from public.rider where user_id = v_uid) then
    raise exception 'This email is already a NexG merchant or rider login. Use a different email for your host account.'
      using errcode = '23505';
  end if;
  if exists (select 1 from public.host where lower(email) = v_email) then
    raise exception 'That email is already registered as a NexG host. Sign in instead.'
      using errcode = '23505';
  end if;

  select id into v_city from public.city
  where slug = coalesce(p_payload ->> 'city', 'nairobi');

  /* The pre-check above gives the friendly message; this catches the race
     where two applications with the same email land at once. */
  begin
    insert into public.host (
      kind, display_name, contact_name, phone, email, city_id,
      listing_link, units_declared_band, default_handoff, submitted_at, onboarding_step
    )
    values (
      coalesce((p_payload ->> 'kind')::public.host_kind, 'single_unit'),
      nullif(trim(coalesce(p_payload ->> 'display_name', '')), ''),
      v_name, v_phone, v_email, v_city,
      nullif(trim(coalesce(p_payload ->> 'listing_link', '')), ''),
      nullif(p_payload ->> 'units_band', ''),
      v_handoff, now(), 2
    )
    returning * into v_host;
  exception
    when unique_violation then
      raise exception 'That email is already registered as a NexG host. Sign in instead.'
        using errcode = '23505';
  end;

  insert into public.host_user (host_id, user_id, role, accepted_at)
  values (v_host.id, v_uid, 'owner', now());

  perform pg_catalog.set_config('nexg.host_listing_unlock', 'on', true);

  /* An imported Airbnb listing becomes the first property, and the first
     unit carries its room counts, so the host does not type them again.
     Out-of-range values are dropped rather than refused: the import is a
     convenience, never a reason the application fails. */
  if v_listing is not null then
    v_listing_name := nullif(left(trim(coalesce(v_listing ->> 'name', '')), 120), '');
    begin
      v_kind := coalesce(nullif(v_listing ->> 'kind', '')::public.property_kind, 'apartment');
    exception when invalid_text_representation then
      v_kind := 'apartment';
    end;
    begin
      v_bedrooms := nullif(v_listing ->> 'bedrooms', '')::numeric::integer;
      v_bathrooms := nullif(v_listing ->> 'bathrooms', '')::numeric;
      v_guests := nullif(v_listing ->> 'max_guests', '')::numeric::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      v_bedrooms := null; v_bathrooms := null; v_guests := null;
    end;
    if v_bedrooms not between 0 and 50 then v_bedrooms := null; end if;
    if v_bathrooms not between 0 and 50 then v_bathrooms := null; end if;
    if v_guests not between 1 and 100 then v_guests := null; end if;

    v_slug := trim(both '-' from regexp_replace(lower(coalesce(v_listing_name, v_name, 'stay')), '[^a-z0-9]+', '-', 'g'));
    v_slug := left(coalesce(nullif(v_slug, ''), 'stay'), 60) || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);

    insert into public.property (host_id, slug, name, kind, city_id)
    values (v_host.id, v_slug, coalesce(v_listing_name, 'My property'), v_kind, v_city)
    returning * into v_property;
  end if;

  insert into public.unit (host_id, name, label_public, address_line, city_id, handoff,
                           property_id, bedrooms, bathrooms, max_guests)
  values (
    v_host.id,
    coalesce(nullif(trim(coalesce(p_payload ->> 'unit_name', '')), ''), 'Unit 1'),
    coalesce(nullif(trim(coalesce(p_payload ->> 'unit_name', '')), ''), v_listing_name),
    v_address, v_city, v_handoff,
    v_property.id, v_bedrooms, v_bathrooms, v_guests
  )
  returning * into v_unit;
  perform pg_catalog.set_config('nexg.host_listing_unlock', 'off', true);

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.applied',
    p_actor_id => v_uid,
    p_target_type => 'host', p_target_id => v_host.id, p_city_id => v_city,
    p_after => jsonb_build_object('kind', v_host.kind, 'units_band', v_host.units_declared_band,
      'listing_imported', v_listing is not null));

  v_body := coalesce(v_name, 'A host') || ' has asked to list ' || v_address || ' with NexG.';
  v_reference := 'NX-T-' || nextval('public.support_ticket_reference_seq')::text;

  insert into public.support_ticket (
    reference, channel, from_role, topic, full_name, email, phone,
    body, details, source_form, city_id
  )
  values (
    v_reference, 'web_form', 'hotel', 'hotel_partnership',
    v_name, v_email, v_phone, v_body,
    jsonb_strip_nulls(jsonb_build_object(
      'host_id', v_host.id,
      'kind', v_host.kind,
      'units_band', v_host.units_declared_band,
      'handoff', v_host.default_handoff,
      'listing_link', v_host.listing_link,
      'address', v_address,
      'city', (select c.name from public.city c where c.id = v_city)
    )),
    'host_landing', v_city
  )
  returning id into v_ticket_id;

  perform audit.log('host_user'::public.actor_type, 'support', 'support.ticket_created',
    p_actor_id => v_uid,
    p_target_type => 'support_ticket', p_target_id => v_ticket_id, p_city_id => v_city,
    p_after => jsonb_build_object('reference', v_reference, 'topic', 'hotel_partnership',
      'from', 'hotel', 'host_id', v_host.id));

  return jsonb_build_object(
    'ok', true,
    'host_id', v_host.id,
    'unit_id', v_unit.id,
    'property_id', v_property.id,
    'ticket_reference', v_reference);
end;
$$;

revoke execute on function public.rpc_host_apply(jsonb) from public, anon;
grant execute on function public.rpc_host_apply(jsonb) to authenticated;

/* Attaches the imported cover photo to the new unit and property. Units are
   locked until approval, so this one write is let through: only for the
   owner, only while the application is fresh, and only onto empty
   galleries, so it can never replace photos the host chose. */
create or replace function public.rpc_host_listing_photo_set(
  p_host_id uuid, p_unit_id uuid, p_path text, p_alt text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_host public.host;
  v_unit public.unit;
  v_photo jsonb;
begin
  if not exists (
    select 1 from public.host_user member
    where member.host_id = p_host_id and member.user_id = v_uid and member.role = 'owner'
  ) then
    raise exception 'Only the account owner can add this photo.' using errcode = '42501';
  end if;
  select * into v_host from public.host where id = p_host_id;
  if v_host.status <> 'applied' or v_host.submitted_at < now() - interval '1 hour' then
    raise exception 'Add photos from your workspace instead.' using errcode = '22023';
  end if;
  select * into v_unit from public.unit where id = p_unit_id and host_id = p_host_id for update;
  if v_unit.id is null then
    raise exception 'That unit is not on your account.' using errcode = '42501';
  end if;
  if p_path not like p_host_id::text || '/' || p_unit_id::text || '/%' or not exists (
    select 1 from storage.objects o where o.bucket_id = 'host-photos' and o.name = p_path
  ) then
    raise exception 'Upload the photo again.' using errcode = '22023';
  end if;

  v_photo := jsonb_build_array(jsonb_build_object(
    'path', p_path, 'alt', left(coalesce(nullif(trim(p_alt), ''), 'Cover photo'), 160), 'cover', true));

  perform pg_catalog.set_config('nexg.host_listing_unlock', 'on', true);
  update public.unit set photos = v_photo
  where id = v_unit.id and coalesce(jsonb_array_length(photos), 0) = 0;
  update public.property set photos = v_photo
  where id = v_unit.property_id and host_id = p_host_id and coalesce(jsonb_array_length(photos), 0) = 0;
  perform pg_catalog.set_config('nexg.host_listing_unlock', 'off', true);

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.listing_photo_imported',
    p_actor_id => v_uid, p_target_type => 'unit', p_target_id => v_unit.id,
    p_after => jsonb_build_object('path', p_path));
end;
$$;

revoke execute on function public.rpc_host_listing_photo_set(uuid, uuid, text, text) from public, anon;
grant execute on function public.rpc_host_listing_photo_set(uuid, uuid, text, text) to authenticated;
