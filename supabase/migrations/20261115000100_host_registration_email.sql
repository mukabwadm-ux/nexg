-- Host registration: shared phone numbers, unique emails, verified email first.
--
-- A phone number can belong to someone who is also a merchant or who runs
-- more than one host business, so it is no longer unique on host. The login
-- email is: one email, one host. And the email on the host record is the one
-- the applicant verified in the form, read from their auth user rather than
-- trusted from the request.

alter table public.host drop constraint if exists host_phone_key;
create index if not exists host_phone_idx on public.host (phone);
create unique index if not exists host_email_unique on public.host (lower(email)) where email is not null;

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
  if v_handoff is null then
    raise exception 'Choose how riders should hand over.' using errcode = '22023';
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
  insert into public.unit (host_id, name, label_public, address_line, city_id, handoff)
  values (
    v_host.id,
    coalesce(nullif(trim(coalesce(p_payload ->> 'unit_name', '')), ''), 'Unit 1'),
    nullif(trim(coalesce(p_payload ->> 'unit_name', '')), ''),
    v_address, v_city, v_handoff
  )
  returning * into v_unit;
  perform pg_catalog.set_config('nexg.host_listing_unlock', 'off', true);

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.applied',
    p_actor_id => v_uid,
    p_target_type => 'host', p_target_id => v_host.id, p_city_id => v_city,
    p_after => jsonb_build_object('kind', v_host.kind, 'units_band', v_host.units_declared_band));

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
    'ticket_reference', v_reference);
end;
$$;

revoke execute on function public.rpc_host_apply(jsonb) from public, anon;
grant execute on function public.rpc_host_apply(jsonb) to authenticated;
