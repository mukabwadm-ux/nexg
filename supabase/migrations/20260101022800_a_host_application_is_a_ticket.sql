-- A host application is a ticket.
--
-- The "List your Airbnb" form on the public site called
-- `rpc_host_apply` and nothing else. That is a correct write --
-- the host lands as `applied`, the first unit is created in
-- `setting_up`, the acknowledgement is queued and the audit event
-- is written in one transaction -- and it is also a write that
-- nobody was working. The application sat in `public.host` and the
-- only people who could see it were the ones who already knew to
-- look in the Hotels console.
--
-- Support & tickets is the queue. It has a status, an owner, a
-- response clock, a thread and a reference a person can quote on
-- the phone. A host application had none of that, so "somebody
-- will call you" was a hope rather than a thing the business could
-- see and work.
--
-- So the application raises a ticket as well as a host record, in
-- the same transaction, and returns the reference to the person
-- who filled the form in.
--
-- It is written here rather than by calling
-- `rpc_support_ticket_create` for two reasons. That function
-- refuses more than five messages an hour from one phone number,
-- which is right for somebody asking a question and wrong for a
-- host re-submitting an application, since `rpc_host_apply` upserts
-- on the phone and treats a second application as an update. And
-- calling it would put the ticket in a second transaction, where it
-- could fail while the host record had already landed -- the
-- half-written state this repository keeps trying to avoid.

-- ═════════════════════════════════════ the same transaction, both records

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
  v_email text := nullif(lower(trim(coalesce(p_payload ->> 'email', ''))), '');
  v_name text := nullif(trim(coalesce(p_payload ->> 'contact_name', p_payload ->> 'display_name', '')), '');
  v_address text := nullif(trim(coalesce(p_payload ->> 'address', '')), '');
  v_city uuid;
  v_reference text;
  v_ticket_id uuid;
  v_body text;
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
    nullif(trim(coalesce(p_payload ->> 'display_name', '')), ''),
    v_name,
    v_phone,
    v_email,
    v_city,
    nullif(trim(coalesce(p_payload ->> 'listing_link', '')), ''),
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
  if v_address is not null then
    insert into public.unit (host_id, name, label_public, address_line, city_id, handoff)
    values (
      v_host.id,
      coalesce(nullif(trim(coalesce(p_payload ->> 'unit_name', '')), ''), 'Unit 1'),
      nullif(trim(coalesce(p_payload ->> 'unit_name', '')), ''),
      v_address,
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

  -- ═════════════════════════════════════ and the desk has it too
  --
  -- The body is a sentence for reading; `details` is the same thing
  -- as fields, so an agent arranging a table for four does not have
  -- to parse a paragraph to find how many units there are.
  v_body := coalesce(v_name, 'A host')
    || ' has asked to list '
    || coalesce(nullif(v_address, ''), 'a unit')
    || ' with NexG.';

  v_reference := 'NX-T-' || nextval('public.support_ticket_reference_seq')::text;

  insert into public.support_ticket (
    reference, channel, from_role, topic, full_name, email, phone,
    body, details, source_form, city_id
  )
  values (
    v_reference, 'web_form', 'hotel', 'hotel_partnership',
    v_name, v_email, v_phone,
    v_body,
    jsonb_strip_nulls(jsonb_build_object(
      'host_id', v_host.id,
      'kind', v_host.kind,
      'units_band', v_host.units_declared_band,
      'handoff', v_host.default_handoff,
      'listing_link', v_host.listing_link,
      'address', v_address,
      'city', (select c.name from public.city c where c.id = v_city)
    )),
    'host_landing',
    v_city
  )
  returning id into v_ticket_id;

  perform audit.log('guest'::public.actor_type, 'support', 'support.ticket_created',
    p_target_type => 'support_ticket', p_target_id => v_ticket_id,
    p_city_id => v_city,
    p_after => jsonb_build_object(
      'reference', v_reference,
      'topic', 'hotel_partnership',
      'from', 'hotel',
      'host_id', v_host.id));

  /*
   * The reference goes back with the host id, so the person filling
   * the form in has something to quote and the desk has something to
   * look up. Neither the ticket nor the host row is readable by the
   * person who applied.
   */
  return jsonb_build_object(
    'ok', true,
    'host_id', v_host.id,
    'unit_id', v_unit.id,
    'ticket_reference', v_reference);
end;
$$;

grant execute on function public.rpc_host_apply(jsonb) to anon, authenticated;

comment on function public.rpc_host_apply is
  'A host applies from the public page. Creates the host record and the first unit, and raises a support ticket in the same transaction so the desk is working on it rather than finding it.';
