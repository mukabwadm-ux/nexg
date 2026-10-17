-- Staff edits to the experience catalogue go through audited RPCs. The
-- underlying tables remain readable by staff, but writes must not bypass
-- authorization or the audit chain.

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('experience.catalogue.partner_saved', 'experiences', 'notice', false, false, false,
   'An experience partner profile was created or updated'),
  ('experience.catalogue.component_saved', 'experiences', 'notice', false, false, false,
   'An experience component was created or updated'),
  ('experience.catalogue.curated_day_saved', 'experiences', 'notice', false, false, false,
   'A curated experience day was created or updated'),
  ('experience.catalogue.event_saved', 'experiences', 'notice', false, false, false,
   'An experience event was created or updated')
on conflict (action) do nothing;

create or replace function public.rpc_save_experience_catalogue(
  p_kind text,
  p_id uuid,
  p_data jsonb,
  p_blocks jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_city_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_block_count integer := 0;
  v_status text;
  v_partner_status public.partner_status;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Catalogue details must be an object.' using errcode = '22023';
  end if;

  if p_kind is null or p_kind not in ('partner', 'component', 'curated_day', 'event') then
    raise exception 'Unknown catalogue record type.' using errcode = '22023';
  end if;

  if not (
    authz.is_super_admin()
    or authz.has_role('growth')
    or (p_kind = 'partner' and authz.has_role('ops_manager'))
  ) then
    raise exception 'You do not have permission to edit this catalogue.' using errcode = '42501';
  end if;

  if p_kind = 'partner' then
    v_city_id := nullif(p_data ->> 'city_id', '')::uuid;

    if p_id is null then
      insert into public.experience_partner (
        name, kind, city_id, contact_name, contact_phone, contact_email,
        preferred_channel, can_answer_holds, terms
      )
      values (
        trim(p_data ->> 'name'),
        (p_data ->> 'kind')::public.experience_partner_kind,
        v_city_id,
        nullif(trim(p_data ->> 'contact_name'), ''),
        nullif(trim(p_data ->> 'contact_phone'), ''),
        nullif(trim(p_data ->> 'contact_email'), ''),
        coalesce(nullif(p_data ->> 'preferred_channel', ''), 'whatsapp'),
        coalesce((p_data ->> 'can_answer_holds')::boolean, false),
        coalesce(p_data -> 'terms', '{}'::jsonb)
      )
      returning id into v_id;
      v_before := null;
    else
      select jsonb_build_object(
        'name', name, 'kind', kind, 'city_id', city_id, 'status', status,
        'preferred_channel', preferred_channel, 'can_answer_holds', can_answer_holds,
        'terms', terms
      )
        into v_before
        from public.experience_partner
        where id = p_id
        for update;
      if not found then raise exception 'That partner no longer exists.'; end if;

      update public.experience_partner
      set name = trim(p_data ->> 'name'),
          kind = (p_data ->> 'kind')::public.experience_partner_kind,
          city_id = v_city_id,
          contact_name = nullif(trim(p_data ->> 'contact_name'), ''),
          contact_phone = nullif(trim(p_data ->> 'contact_phone'), ''),
          contact_email = nullif(trim(p_data ->> 'contact_email'), ''),
          preferred_channel = coalesce(nullif(p_data ->> 'preferred_channel', ''), 'whatsapp'),
          can_answer_holds = coalesce((p_data ->> 'can_answer_holds')::boolean, false),
          terms = coalesce(p_data -> 'terms', '{}'::jsonb)
      where id = p_id
      returning id into v_id;
    end if;

    select jsonb_build_object(
      'name', name, 'kind', kind, 'city_id', city_id, 'status', status,
      'preferred_channel', preferred_channel, 'can_answer_holds', can_answer_holds,
      'terms', terms
    )
      into v_after from public.experience_partner where id = v_id;

    perform audit.log(
      p_actor_type => 'staff'::public.actor_type,
      p_module => 'experiences',
      p_action => 'experience.catalogue.partner_saved',
      p_target_type => 'experience_partner',
      p_target_id => v_id,
      p_before => v_before,
      p_after => v_after,
      p_city_id => v_city_id
    );
    return v_id;
  end if;

  if p_kind = 'component' then
    v_city_id := nullif(p_data ->> 'city_id', '')::uuid;
    v_status := coalesce(nullif(p_data ->> 'status', ''), 'draft');

    if p_id is null then
      insert into public.experience_component (
        partner_id, city_id, kind, mood, title, subtitle, description, duration_min,
        default_slot, earliest_start, latest_start, price_kes, price_basis, min_party,
        max_party, party_types, includes, tags, tier, swap_group, status, booking_lead_hours,
        capacity_per_day, sort, cover_path
      )
      values (
        (p_data ->> 'partner_id')::uuid,
        v_city_id,
        (p_data ->> 'kind')::public.block_kind,
        (p_data ->> 'mood')::public.mood,
        trim(p_data ->> 'title'),
        nullif(trim(p_data ->> 'subtitle'), ''),
        nullif(trim(p_data ->> 'description'), ''),
        (p_data ->> 'duration_min')::integer,
        (p_data ->> 'default_slot')::public.block_slot,
        nullif(p_data ->> 'earliest_start', '')::time,
        nullif(p_data ->> 'latest_start', '')::time,
        nullif(p_data ->> 'price_kes', '')::bigint,
        (p_data ->> 'price_basis')::public.price_basis,
        coalesce(nullif(p_data ->> 'min_party', '')::integer, 1),
        nullif(p_data ->> 'max_party', '')::integer,
        coalesce(array(select jsonb_array_elements_text(p_data -> 'party_types')), array['solo', 'couple', 'family', 'group']),
        coalesce(array(select jsonb_array_elements_text(p_data -> 'includes')), '{}'),
        coalesce(array(select jsonb_array_elements_text(p_data -> 'tags')), '{}'),
        coalesce(nullif(p_data ->> 'tier', '')::integer, 3),
        trim(p_data ->> 'swap_group'),
        v_status,
        coalesce(nullif(p_data ->> 'booking_lead_hours', '')::integer, 0),
        nullif(p_data ->> 'capacity_per_day', '')::integer,
        coalesce(nullif(p_data ->> 'sort', '')::integer, 0),
        nullif(trim(p_data ->> 'cover_path'), '')
      )
      returning id into v_id;
      v_before := null;
    else
      select jsonb_build_object(
        'title', title, 'city_id', city_id, 'partner_id', partner_id, 'kind', kind,
        'mood', mood, 'subtitle', subtitle, 'description', description,
        'duration_min', duration_min, 'default_slot', default_slot,
        'earliest_start', earliest_start, 'latest_start', latest_start,
        'price_kes', price_kes, 'price_basis', price_basis, 'min_party', min_party,
        'max_party', max_party, 'party_types', party_types, 'includes', includes,
        'tags', tags, 'tier', tier, 'swap_group', swap_group, 'status', status,
        'booking_lead_hours', booking_lead_hours, 'capacity_per_day', capacity_per_day,
        'sort', sort, 'cover_path', cover_path
      ) into v_before
      from public.experience_component where id = p_id for update;
      if not found then raise exception 'That component no longer exists.'; end if;

      update public.experience_component
      set partner_id = (p_data ->> 'partner_id')::uuid,
          city_id = v_city_id,
          kind = (p_data ->> 'kind')::public.block_kind,
          mood = (p_data ->> 'mood')::public.mood,
          title = trim(p_data ->> 'title'),
          subtitle = nullif(trim(p_data ->> 'subtitle'), ''),
          description = nullif(trim(p_data ->> 'description'), ''),
          duration_min = (p_data ->> 'duration_min')::integer,
          default_slot = (p_data ->> 'default_slot')::public.block_slot,
          earliest_start = nullif(p_data ->> 'earliest_start', '')::time,
          latest_start = nullif(p_data ->> 'latest_start', '')::time,
          price_kes = nullif(p_data ->> 'price_kes', '')::bigint,
          price_basis = (p_data ->> 'price_basis')::public.price_basis,
          min_party = coalesce(nullif(p_data ->> 'min_party', '')::integer, 1),
          max_party = nullif(p_data ->> 'max_party', '')::integer,
          party_types = coalesce(array(select jsonb_array_elements_text(p_data -> 'party_types')), array['solo', 'couple', 'family', 'group']),
          includes = coalesce(array(select jsonb_array_elements_text(p_data -> 'includes')), '{}'),
          tags = coalesce(array(select jsonb_array_elements_text(p_data -> 'tags')), '{}'),
          tier = coalesce(nullif(p_data ->> 'tier', '')::integer, 3),
          swap_group = trim(p_data ->> 'swap_group'),
          status = v_status,
          booking_lead_hours = coalesce(nullif(p_data ->> 'booking_lead_hours', '')::integer, 0),
          capacity_per_day = nullif(p_data ->> 'capacity_per_day', '')::integer,
          sort = coalesce(nullif(p_data ->> 'sort', '')::integer, 0),
          cover_path = nullif(trim(p_data ->> 'cover_path'), '')
      where id = p_id
      returning id into v_id;
    end if;

    if not exists (
      select 1 from public.experience_partner p
      where p.id = (p_data ->> 'partner_id')::uuid and p.city_id = v_city_id
    ) then
      raise exception 'Choose a partner in the same city as this component.' using errcode = '23514';
    end if;

    if v_status = 'live' then
      select status into v_partner_status
      from public.experience_partner where id = (p_data ->> 'partner_id')::uuid;
      if v_partner_status <> 'live' then
        raise exception 'A component cannot go live until its partner is live.' using errcode = '23514';
      end if;
    end if;

    select jsonb_build_object(
      'title', title, 'city_id', city_id, 'partner_id', partner_id, 'kind', kind,
      'mood', mood, 'subtitle', subtitle, 'description', description,
      'duration_min', duration_min, 'default_slot', default_slot,
      'earliest_start', earliest_start, 'latest_start', latest_start,
      'price_kes', price_kes, 'price_basis', price_basis, 'min_party', min_party,
      'max_party', max_party, 'party_types', party_types, 'includes', includes,
      'tags', tags, 'tier', tier, 'swap_group', swap_group, 'status', status,
      'booking_lead_hours', booking_lead_hours, 'capacity_per_day', capacity_per_day,
      'sort', sort, 'cover_path', cover_path
    ) into v_after from public.experience_component where id = v_id;

    perform audit.log(
      p_actor_type => 'staff'::public.actor_type,
      p_module => 'experiences',
      p_action => 'experience.catalogue.component_saved',
      p_target_type => 'experience_component',
      p_target_id => v_id,
      p_before => v_before,
      p_after => v_after,
      p_city_id => v_city_id
    );
    return v_id;
  end if;

  if p_kind = 'curated_day' then
    v_city_id := nullif(p_data ->> 'city_id', '')::uuid;
    if jsonb_typeof(p_blocks) is distinct from 'array' then
      raise exception 'Day blocks must be a list.' using errcode = '22023';
    end if;

    if p_id is null then
      insert into public.curated_day (
        city_id, slug, title, tagline, cover_path, badge, party_types, duration,
        price_per_person_kes, sort, featured
      )
      values (
        v_city_id, trim(p_data ->> 'slug'), trim(p_data ->> 'title'),
        nullif(trim(p_data ->> 'tagline'), ''), nullif(trim(p_data ->> 'cover_path'), ''),
        nullif(trim(p_data ->> 'badge'), ''),
        coalesce(array(select jsonb_array_elements_text(p_data -> 'party_types')), array['solo', 'couple', 'family', 'group']),
        coalesce(nullif(p_data ->> 'duration', ''), 'day'),
        nullif(p_data ->> 'price_per_person_kes', '')::bigint,
        coalesce(nullif(p_data ->> 'sort', '')::integer, 0),
        coalesce((p_data ->> 'featured')::boolean, false)
      )
      returning id into v_id;
      v_before := null;
    else
      select jsonb_build_object(
        'title', d.title, 'city_id', d.city_id, 'slug', d.slug, 'status', d.status,
        'tagline', d.tagline, 'cover_path', d.cover_path, 'badge', d.badge,
        'party_types', d.party_types, 'duration', d.duration,
        'price_per_person_kes', d.price_per_person_kes, 'sort', d.sort,
        'featured', d.featured,
        'blocks', coalesce((
          select jsonb_agg(jsonb_build_object(
            'component_id', b.component_id, 'slot', b.slot,
            'start_time', b.start_time, 'sort', b.sort
          ) order by b.sort)
          from public.curated_day_block b where b.curated_day_id = d.id
        ), '[]'::jsonb)
      ) into v_before
      from public.curated_day d where d.id = p_id for update;
      if not found then raise exception 'That curated day no longer exists.'; end if;

      update public.curated_day
      set city_id = v_city_id,
          slug = trim(p_data ->> 'slug'),
          title = trim(p_data ->> 'title'),
          tagline = nullif(trim(p_data ->> 'tagline'), ''),
          cover_path = nullif(trim(p_data ->> 'cover_path'), ''),
          badge = nullif(trim(p_data ->> 'badge'), ''),
          party_types = coalesce(array(select jsonb_array_elements_text(p_data -> 'party_types')), array['solo', 'couple', 'family', 'group']),
          duration = coalesce(nullif(p_data ->> 'duration', ''), 'day'),
          price_per_person_kes = nullif(p_data ->> 'price_per_person_kes', '')::bigint,
          sort = coalesce(nullif(p_data ->> 'sort', '')::integer, 0),
          featured = coalesce((p_data ->> 'featured')::boolean, false)
      where id = p_id
      returning id into v_id;
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(p_blocks) as b(component_id uuid)
      join public.experience_component c on c.id = b.component_id
      where c.city_id <> v_city_id
    ) then
      raise exception 'Every block must use a component from the curated day city.' using errcode = '23514';
    end if;

    delete from public.curated_day_block where curated_day_id = v_id;
    insert into public.curated_day_block (curated_day_id, component_id, slot, start_time, sort)
    select v_id, b.component_id, b.slot, b.start_time, coalesce(b.sort, 0)
    from jsonb_to_recordset(p_blocks) as b(
      component_id uuid,
      slot public.block_slot,
      start_time time,
      sort integer
    );
    get diagnostics v_block_count = row_count;

    select jsonb_build_object(
      'title', d.title, 'city_id', d.city_id, 'slug', d.slug, 'status', d.status,
      'tagline', d.tagline, 'cover_path', d.cover_path, 'badge', d.badge,
      'party_types', d.party_types, 'duration', d.duration,
      'price_per_person_kes', d.price_per_person_kes, 'sort', d.sort,
      'featured', d.featured, 'block_count', v_block_count,
      'blocks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'component_id', b.component_id, 'slot', b.slot,
          'start_time', b.start_time, 'sort', b.sort
        ) order by b.sort)
        from public.curated_day_block b where b.curated_day_id = d.id
      ), '[]'::jsonb)
    ) into v_after from public.curated_day d where d.id = v_id;

    perform audit.log(
      p_actor_type => 'staff'::public.actor_type,
      p_module => 'experiences',
      p_action => 'experience.catalogue.curated_day_saved',
      p_target_type => 'curated_day',
      p_target_id => v_id,
      p_before => v_before,
      p_after => v_after,
      p_city_id => v_city_id
    );
    return v_id;
  end if;

  -- Events are always created as drafts. Publishing remains a separate,
  -- audited action through rpc_publish_event.
  v_city_id := nullif(p_data ->> 'city_id', '')::uuid;
  if coalesce((p_data ->> 'nexg_can_hold_tickets')::boolean, false)
     and nullif(p_data ->> 'ticket_partner_id', '') is null then
    raise exception 'Choose the ticket-holding partner before enabling ticket holds.' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_data -> 'ticket_bands', '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Ticket bands must be a list.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_data -> 'ticket_bands', '[]'::jsonb)) as band(value)
    where jsonb_typeof(band.value) is distinct from 'object'
      or coalesce(band.value ->> 'label', '') = ''
      or case
        when coalesce(band.value ->> 'price_kes', '') ~ '^[0-9]+([.][0-9]+)?$'
          then (band.value ->> 'price_kes')::numeric <= 0
        else true
      end
  ) then
    raise exception 'Each ticket band needs a label and a positive face-value price.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_data -> 'suggested_blocks', '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Suggested blocks must be a list.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.event (
      city_id, name, category, venue_name, venue_address, starts_at, ends_at, doors_at,
      organiser_name, organiser_url, ticket_url, ticket_partner_id, ticket_bands,
      nexg_can_hold_tickets, practical_note, cover_path, featured, anchor_slot,
      suggested_blocks, source
    )
    values (
      v_city_id, trim(p_data ->> 'name'),
      (p_data ->> 'category')::public.event_category,
      nullif(trim(p_data ->> 'venue_name'), ''),
      nullif(trim(p_data ->> 'venue_address'), ''),
      (p_data ->> 'starts_at')::timestamptz,
      nullif(p_data ->> 'ends_at', '')::timestamptz,
      nullif(p_data ->> 'doors_at', '')::timestamptz,
      nullif(trim(p_data ->> 'organiser_name'), ''),
      nullif(trim(p_data ->> 'organiser_url'), ''),
      nullif(trim(p_data ->> 'ticket_url'), ''),
      nullif(p_data ->> 'ticket_partner_id', '')::uuid,
      coalesce(p_data -> 'ticket_bands', '[]'::jsonb),
      coalesce((p_data ->> 'nexg_can_hold_tickets')::boolean, false),
      nullif(trim(p_data ->> 'practical_note'), ''),
      nullif(trim(p_data ->> 'cover_path'), ''),
      coalesce((p_data ->> 'featured')::boolean, false),
      (p_data ->> 'anchor_slot')::public.block_slot,
      coalesce(p_data -> 'suggested_blocks', '[]'::jsonb),
      'manual'
    )
    returning id into v_id;
    v_before := null;
  else
    select jsonb_build_object(
      'name', name, 'city_id', city_id, 'status', status, 'category', category,
      'venue_name', venue_name, 'venue_address', venue_address, 'starts_at', starts_at,
      'ends_at', ends_at, 'doors_at', doors_at, 'organiser_name', organiser_name,
      'organiser_url', organiser_url, 'ticket_url', ticket_url,
      'ticket_partner_id', ticket_partner_id, 'ticket_bands', ticket_bands,
      'nexg_can_hold_tickets', nexg_can_hold_tickets, 'practical_note', practical_note,
      'cover_path', cover_path, 'featured', featured, 'anchor_slot', anchor_slot,
      'suggested_blocks', suggested_blocks, 'source', source,
      'submitted_by_partner_id', submitted_by_partner_id, 'submission_note', submission_note
    ) into v_before from public.event where id = p_id for update;
    if not found then raise exception 'That event no longer exists.'; end if;

    update public.event
    set city_id = v_city_id,
        name = trim(p_data ->> 'name'),
        category = (p_data ->> 'category')::public.event_category,
        venue_name = nullif(trim(p_data ->> 'venue_name'), ''),
        venue_address = nullif(trim(p_data ->> 'venue_address'), ''),
        starts_at = (p_data ->> 'starts_at')::timestamptz,
        ends_at = nullif(p_data ->> 'ends_at', '')::timestamptz,
        doors_at = nullif(p_data ->> 'doors_at', '')::timestamptz,
        organiser_name = nullif(trim(p_data ->> 'organiser_name'), ''),
        organiser_url = nullif(trim(p_data ->> 'organiser_url'), ''),
        ticket_url = nullif(trim(p_data ->> 'ticket_url'), ''),
        ticket_partner_id = nullif(p_data ->> 'ticket_partner_id', '')::uuid,
        ticket_bands = coalesce(p_data -> 'ticket_bands', '[]'::jsonb),
        nexg_can_hold_tickets = coalesce((p_data ->> 'nexg_can_hold_tickets')::boolean, false),
        practical_note = nullif(trim(p_data ->> 'practical_note'), ''),
        cover_path = nullif(trim(p_data ->> 'cover_path'), ''),
        featured = coalesce((p_data ->> 'featured')::boolean, false),
        anchor_slot = (p_data ->> 'anchor_slot')::public.block_slot,
        suggested_blocks = coalesce(p_data -> 'suggested_blocks', '[]'::jsonb)
    where id = p_id
    returning id into v_id;
  end if;

  select jsonb_build_object(
    'name', name, 'city_id', city_id, 'status', status, 'category', category,
    'venue_name', venue_name, 'venue_address', venue_address, 'starts_at', starts_at,
    'ends_at', ends_at, 'doors_at', doors_at, 'organiser_name', organiser_name,
    'organiser_url', organiser_url, 'ticket_url', ticket_url,
    'ticket_partner_id', ticket_partner_id, 'ticket_bands', ticket_bands,
    'nexg_can_hold_tickets', nexg_can_hold_tickets, 'practical_note', practical_note,
    'cover_path', cover_path, 'featured', featured, 'anchor_slot', anchor_slot,
    'suggested_blocks', suggested_blocks, 'source', source,
    'submitted_by_partner_id', submitted_by_partner_id, 'submission_note', submission_note
  )
    into v_after from public.event where id = v_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'experiences',
    p_action => 'experience.catalogue.event_saved',
    p_target_type => 'event',
    p_target_id => v_id,
    p_before => v_before,
    p_after => v_after,
    p_city_id => v_city_id
  );
  return v_id;
end;
$$;

-- The general console view grants access to the module, while catalogue
-- mutations are narrower and are checked again inside the RPC above.
revoke all on function public.rpc_save_experience_catalogue(text, uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.rpc_save_experience_catalogue(text, uuid, jsonb, jsonb)
  to authenticated, service_role;

-- A curated day without any blocks is not a day. Also make sure a live
-- component belongs to a live partner; otherwise publication appears to
-- succeed but the public component view silently hides it.
create or replace function public.rpc_publish_curated_day(p_day_id uuid)
returns public.curated_day
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day public.curated_day;
  v_bad integer;
  v_blocks integer;
begin
  if not (authz.is_super_admin() or authz.has_role('growth')) then
    raise exception 'Only growth publishes a curated day.' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_blocks
  from public.curated_day_block b
  where b.curated_day_id = p_day_id;
  if v_blocks = 0 then
    raise exception 'Add at least one block before publishing this day.' using errcode = 'check_violation';
  end if;

  select count(*) into v_bad
  from public.curated_day_block b
  join public.experience_component k on k.id = b.component_id
  join public.experience_partner p on p.id = k.partner_id
  where b.curated_day_id = p_day_id
    and (k.status <> 'live' or p.status <> 'live'
      or (k.price_kes is null and k.price_basis <> 'face_value'));

  if v_bad > 0 then
    raise exception '% block(s) are not live, from a live partner, and priced.', v_bad
      using errcode = 'check_violation';
  end if;

  update public.curated_day set status = 'live'
  where id = p_day_id
  returning * into v_day;

  if v_day.id is null then raise exception 'That curated day no longer exists.'; end if;
  if v_day.price_per_person_kes is null then
    raise exception 'A published day needs a price per person.' using errcode = 'check_violation';
  end if;

  perform audit.log('staff'::public.actor_type, 'experiences', 'curated_day.published',
    p_target_type => 'curated_day', p_target_id => p_day_id, p_city_id => v_day.city_id);

  return v_day;
end;
$$;

grant execute on function public.rpc_publish_curated_day(uuid) to authenticated, service_role;
