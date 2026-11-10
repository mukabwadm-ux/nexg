-- Two changes to stays.
--
-- 1. A stay request is a support ticket.
--    "Tell us what you need" wrote a stay_request for the Hotels console and
--    stopped there. It now also opens a support ticket in the same
--    transaction (topic concierge_request), so it lands in the Support queue
--    with an owner, a response clock and a reference the guest can quote.
--    The ticket's details carry the dates, party and budget as fields, and
--    the stay request keeps the ticket's id.
--
-- 2. A complete unit lists itself.
--    A unit appears on /stays and the hosts page only when it, its property
--    and its host are all listed and live. unit.listed was never set by
--    anything but seed data, and property.listed only by staff, so no real
--    host's unit could appear. fn_listing_sync now lists a unit (and its
--    property) as soon as it is ready:
--      * the host is live (documents approved by NexG)
--      * the unit is live (address and hand-off rule set) and not archived
--      * it sits in a property with a name and an area, not deleted
--      * it has a nightly rate, a guest capacity and a bedroom count
--      * it, or its property, has at least one photo
--    It only ever lists: taking something off the site stays a staff decision
--    (rpc_property_set_listed), and a property staff have unlisted stays
--    unlisted (property.unlisted_by_staff_at) until staff list it again.
--    Host photos stay in the private bucket; showing them on the public pages
--    is a separate change.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('unit.auto_listed', 'hotels', 'info', false, 'Unit listed automatically once complete'),
  ('property.auto_listed', 'hotels', 'info', false, 'Property listed automatically with its first complete unit')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════ 1. a stay request is a ticket

alter table public.stay_request
  add column if not exists ticket_id uuid references public.support_ticket (id) on delete set null;

create or replace function public.rpc_stay_request_create(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.stay_request;
  v_ref text;
  v_phone text := nullif(trim(p_payload ->> 'phone'), '');
  v_email text := nullif(trim(p_payload ->> 'email'), '');
  v_ticket_id uuid;
  v_ticket_ref text;
  v_body text;
  v_city text;
begin
  if v_phone is null and v_email is null then
    raise exception 'We need a phone number or an email, or we cannot come back to you.'
      using errcode = 'check_violation';
  end if;

  v_ref := 'ST-' || (
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                             1 + floor(random() * 32)::integer, 1), '')
    from generate_series(1, 6)
  );
  while exists (select 1 from public.stay_request where reference = v_ref) loop
    v_ref := 'ST-' || (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                               1 + floor(random() * 32)::integer, 1), '')
      from generate_series(1, 6)
    );
  end loop;

  insert into public.stay_request (
    reference, requester_name, requester_phone, requester_email,
    city_id, areas, check_in, check_out, guests, bedrooms_needed,
    budget_per_night_kes, purpose, must_haves, notes, source, consent_marketing
  )
  values (
    v_ref,
    nullif(trim(p_payload ->> 'name'), ''),
    v_phone,
    v_email,
    (select id from public.city where slug = coalesce(p_payload ->> 'city', 'nairobi')),
    coalesce(
      (select array_agg(value #>> '{}') from jsonb_array_elements(p_payload -> 'areas')),
      '{}'),
    nullif(p_payload ->> 'check_in', '')::date,
    nullif(p_payload ->> 'check_out', '')::date,
    nullif(p_payload ->> 'guests', '')::integer,
    nullif(p_payload ->> 'bedrooms', '')::integer,
    nullif(p_payload ->> 'budget', '')::bigint,
    nullif(p_payload ->> 'purpose', ''),
    coalesce(
      (select array_agg(value #>> '{}') from jsonb_array_elements(p_payload -> 'must_haves')),
      '{}'),
    nullif(trim(p_payload ->> 'notes'), ''),
    coalesce(nullif(p_payload ->> 'source', ''), 'stays_hero'),
    coalesce((p_payload ->> 'consent_marketing')::boolean, false)
  )
  returning * into v_request;

  insert into public.notification (kind, status) values ('stay_request_received', 'pending');

  perform audit.log('guest'::public.actor_type, 'hotels', 'stay_request.received',
    p_target_type => 'stay_request', p_target_id => v_request.id,
    p_city_id => v_request.city_id,
    p_after => jsonb_build_object('reference', v_ref, 'guests', v_request.guests,
                                  'purpose', v_request.purpose));

  -- ═════════════════════════════════════ and Support has it too
  select c.name into v_city from public.city c where c.id = v_request.city_id;
  v_body := coalesce(v_request.requester_name, 'A guest') || ' is looking for a stay'
    || case when cardinality(v_request.areas) > 0
            then ' in ' || array_to_string(v_request.areas, ', ') else '' end
    || coalesce(' (' || v_city || ')', '')
    || case when v_request.check_in is not null
            then ', ' || to_char(v_request.check_in, 'DD Mon')
                 || coalesce(' to ' || to_char(v_request.check_out, 'DD Mon YYYY'), '')
            else ', dates open' end
    || coalesce(', ' || v_request.guests || ' guest' || case when v_request.guests = 1 then '' else 's' end, '')
    || coalesce(', ' || v_request.bedrooms_needed || ' bedroom'
                || case when v_request.bedrooms_needed = 1 then '' else 's' end, '')
    || coalesce(', up to KES ' || to_char(v_request.budget_per_night_kes, 'FM999,999,999') || ' a night', '')
    || '. Stay request ' || v_ref || '.'
    || coalesce(E'\n\n' || v_request.notes, '');

  v_ticket_ref := 'NX-T-' || nextval('public.support_ticket_reference_seq')::text;

  insert into public.support_ticket (
    reference, channel, from_role, topic, full_name, email, phone,
    body, details, source_form, city_id
  )
  values (
    v_ticket_ref, 'web_form', 'guest', 'concierge_request',
    v_request.requester_name, v_request.requester_email, v_request.requester_phone,
    v_body,
    jsonb_strip_nulls(jsonb_build_object(
      'stay_request_id', v_request.id,
      'stay_request', v_ref,
      'check_in', v_request.check_in,
      'check_out', v_request.check_out,
      'guests', v_request.guests,
      'bedrooms', v_request.bedrooms_needed,
      'budget_per_night_kes', v_request.budget_per_night_kes,
      'areas', case when cardinality(v_request.areas) > 0 then to_jsonb(v_request.areas) end,
      'purpose', v_request.purpose,
      'must_haves', case when cardinality(v_request.must_haves) > 0 then to_jsonb(v_request.must_haves) end,
      'city', v_city,
      'source', v_request.source
    )),
    'stays_request',
    v_request.city_id
  )
  returning id into v_ticket_id;

  update public.stay_request set ticket_id = v_ticket_id where id = v_request.id;

  perform audit.log('guest'::public.actor_type, 'support', 'support.ticket_created',
    p_target_type => 'support_ticket', p_target_id => v_ticket_id,
    p_city_id => v_request.city_id,
    p_after => jsonb_build_object('reference', v_ticket_ref, 'topic', 'concierge_request',
                                  'from', 'guest', 'stay_request', v_ref));

  return jsonb_build_object('ok', true, 'reference', v_ref, 'ticket_reference', v_ticket_ref);
end;
$$;

grant execute on function public.rpc_stay_request_create(jsonb) to anon, authenticated;

-- ═══════════════════════════════════════════ 2. a complete unit lists itself

alter table public.property
  add column if not exists unlisted_by_staff_at timestamptz;

comment on column public.property.unlisted_by_staff_at is
  'Set when staff unlist a property. While set, it is not listed automatically again.';

/* Whether a unit has everything a guest needs to see it. */
create or replace function public.fn_unit_listing_ready(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.unit u
      join public.host h on h.id = u.host_id
      join public.property p on p.id = u.property_id
     where u.id = p_unit_id
       and h.status = 'live'
       and u.status = 'live'
       and u.archived_at is null
       and p.deleted_at is null
       and nullif(trim(p.name), '') is not null
       and nullif(trim(coalesce(p.area, u.area)), '') is not null
       and u.nightly_rate_kes is not null
       and coalesce(u.max_guests, 0) > 0
       and u.bedrooms is not null
       and (coalesce(jsonb_array_length(u.photos), 0) > 0
            or coalesce(jsonb_array_length(p.photos), 0) > 0)
  );
$$;

/* List a ready unit and its property. It never unlists: that is a staff decision. */
create or replace function public.fn_listing_sync(p_unit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_ready boolean := public.fn_unit_listing_ready(p_unit_id);
  v_property public.property;
begin
  select * into v_unit from public.unit where id = p_unit_id;
  if v_unit.id is null then return; end if;

  if v_ready and not v_unit.listed then
    update public.unit set listed = true where id = v_unit.id;
    perform audit.log('system'::public.actor_type, 'hotels', 'unit.auto_listed',
      p_target_type => 'unit', p_target_id => v_unit.id, p_city_id => v_unit.city_id,
      p_after => jsonb_build_object('property', v_unit.property_id));
  end if;

  if v_ready then
    select * into v_property from public.property where id = v_unit.property_id;
    if v_property.id is not null and not v_property.listed and v_property.unlisted_by_staff_at is null then
      update public.property set listed = true, listed_at = now(), listed_by = null
       where id = v_property.id;
      perform audit.log('system'::public.actor_type, 'hotels', 'property.auto_listed',
        p_target_type => 'property', p_target_id => v_property.id, p_city_id => v_property.city_id);
    end if;
  end if;
end;
$$;

create or replace function public.tg_unit_listing_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_listing_sync(new.id);
  return null;
end;
$$;

create or replace function public.tg_property_listing_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select id from public.unit where property_id = new.id loop
    perform public.fn_listing_sync(v_id);
  end loop;
  return null;
end;
$$;

create or replace function public.tg_host_listing_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select id from public.unit where host_id = new.id loop
    perform public.fn_listing_sync(v_id);
  end loop;
  return null;
end;
$$;

drop trigger if exists unit_listing_sync on public.unit;
create trigger unit_listing_sync
  after insert or update of status, archived_at, property_id, nightly_rate_kes, max_guests, bedrooms, photos
  on public.unit
  for each row execute function public.tg_unit_listing_sync();

drop trigger if exists property_listing_sync on public.property;
create trigger property_listing_sync
  after update of name, area, photos, deleted_at, unlisted_by_staff_at
  on public.property
  for each row execute function public.tg_property_listing_sync();

drop trigger if exists host_listing_sync on public.host;
create trigger host_listing_sync
  after update of status on public.host
  for each row when (old.status is distinct from new.status)
  execute function public.tg_host_listing_sync();

revoke execute on function public.fn_unit_listing_ready(uuid), public.fn_listing_sync(uuid),
  public.tg_unit_listing_sync(), public.tg_property_listing_sync(), public.tg_host_listing_sync()
from public, anon, authenticated;

/* Staff listing a property is still a decision with a name on it; unlisting now
   also stops the automatic listing from putting it back. */
create or replace function public.rpc_property_set_listed(
  p_property_id uuid,
  p_listed boolean
)
returns public.property
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property public.property;
begin
  if not authz.works_hospitality(null) then
    raise exception 'Not yours to list.' using errcode = 'insufficient_privilege';
  end if;

  update public.property set
    listed = p_listed,
    listed_at = case when p_listed then now() end,
    listed_by = case when p_listed then authz.staff_id() end,
    unlisted_by_staff_at = case when p_listed then null else now() end
  where id = p_property_id
  returning * into v_property;

  perform audit.log('staff'::public.actor_type, 'hotels',
    case when p_listed then 'property.listed' else 'property.unlisted' end,
    p_target_type => 'property', p_target_id => p_property_id,
    p_city_id => v_property.city_id, p_severity => 'notice'::public.audit_severity);

  return v_property;
end;
$$;

grant execute on function public.rpc_property_set_listed(uuid, boolean) to authenticated;

/* Units that are already complete list themselves now. */
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.unit where archived_at is null loop
    perform public.fn_listing_sync(v_id);
  end loop;
end $$;
