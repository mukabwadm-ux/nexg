-- Precise branch locations: every place a merchant adds or edits a branch now
-- takes an exact map pin, and a shop goes live only with its main location on
-- the map and its opening hours set.
--
-- Found 22 Nov 2026: live shops had no position or area, because no screen
-- asked for the pin, so the apps' map, "nearby" and browse-by-area were
-- empty. The owner: "we need a way for merchants to input exact location,
-- reuse a component we already have ... adding a branch needs precise
-- locations", and "a shop is supposed to be auto given a zone when its
-- location signs up and measured against our zones accurately".
--
-- 1. A branch's area is always the zone its pin is in (zone_for_point, best
--    tier first), and its position always its pin (trigger branch_position,
--    on every write). When an admin adds, redraws or switches off a zone,
--    the branches it covers are placed again (trigger zone_places_branches).
--    A pin outside every zone is kept, with no area: the merchant is told,
--    and the shop cannot go live until NexG serves that spot.
--    Primary branches with no pin take one from what the merchant already
--    gave, where it holds coordinates (no geocoder, no address guessing):
--    the sign-up "Google Maps pin" answer, a pin or Maps link typed into the
--    branch address, or the Maps link the shop signed up from. A later
--    "Google Maps pin" answer fills a primary branch that still has none.
-- 2. The workspace Locations screen (rpc_merchant_setup_locations and
--    rpc_merchant_setup_location_save, latest 20261111000300) saves the pin.
--    A physical place or service base needs one. Changing the address no
--    longer wipes it, because the pin is on the same screen. Both return pin
--    and inServiceArea.
-- 3. The Stores page's branch drawer (rpc_branch_upsert, latest
--    20260101020100) needs a pin for a new branch, and for any branch that
--    still has none.
-- 4. fn_merchant_go_live_missing (latest 20270126000200) adds "Put your main
--    location on the map" (a pin inside an area NexG serves) and "Your
--    opening hours" to the list rpc_merchant_go_live checks.
--
-- Rollback: restore the four functions from the migrations named above; drop
-- the triggers branch_position, zone_places_branches and
-- onboarding_pin_to_branch and their functions, and fn_pin_from_text; and
-- recreate the 8-argument rpc_merchant_setup_location_save. Pins filled in
-- here stay (they are the merchant's own).

-- ═══════════════════════════════════════════════ 1. one position, everywhere

create or replace function public.tg_branch_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.latitude is null or new.longitude is null then
    -- A pin taken away takes its position and area with it.
    if tg_op = 'UPDATE' and (old.latitude is not null or old.longitude is not null) then
      new.location := null;
      new.zone_id := null;
    end if;
    return new;
  end if;
  new.location := extensions.st_setsrid(extensions.st_makepoint(new.longitude, new.latitude), 4326)::extensions.geography;
  -- Measured, never chosen: a zone that does not cover the pin is not kept.
  new.zone_id := (select z.id from public.zone_for_point(new.longitude, new.latitude) z limit 1);
  return new;
end;
$$;
revoke execute on function public.tg_branch_position() from public, anon, authenticated;

create trigger branch_position
before insert or update of latitude, longitude, zone_id on public.merchant_branch
for each row execute function public.tg_branch_position();

-- Every pinned branch gets its position and area measured again.
update public.merchant_branch
   set latitude = latitude
 where latitude is not null and longitude is not null;

-- A zone added, redrawn or switched off places the branches it covers, and
-- the ones it used to cover, again.
create or replace function public.tg_zone_places_branches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    update public.merchant_branch b set zone_id = null
     where b.latitude is not null and b.longitude is not null
       and (b.zone_id = old.id
            or extensions.st_covers(new.polygon,
                 extensions.st_setsrid(extensions.st_makepoint(b.longitude, b.latitude), 4326)::extensions.geography));
  else
    update public.merchant_branch b set zone_id = null
     where b.latitude is not null and b.longitude is not null
       and extensions.st_covers(new.polygon,
             extensions.st_setsrid(extensions.st_makepoint(b.longitude, b.latitude), 4326)::extensions.geography);
  end if;
  return null;  -- branch_position measures each one again
end;
$$;
revoke execute on function public.tg_zone_places_branches() from public, anon, authenticated;

create trigger zone_places_branches
after insert or update of polygon, active on public.zone
for each row execute function public.tg_zone_places_branches();

-- ═══════════════════════════════════════════════ 1b. pins the merchant already gave

/* Coordinates in text: "lat, lng" (the sign-up field's format), or a Google
   Maps link that carries them (the place pin !3d…!4d…, then @lat,lng, then
   q= / query= / ll= / center= / destination=). Nothing else: an address
   alone gives no row. */
create or replace function public.fn_pin_from_text(p_text text)
returns table (latitude double precision, longitude double precision)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text[];
begin
  if p_text is null or length(p_text) > 2000 then
    return;
  end if;
  v := regexp_match(p_text, '^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$');
  if v is null and p_text ~* '(google\.[a-z.]+/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl/maps)' then
    v := coalesce(
      regexp_match(p_text, '!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)'),
      regexp_match(p_text, '@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)'),
      regexp_match(p_text, '[?&](?:q|query|ll|center|destination)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)', 'i'));
  end if;
  if v is null or abs(v[1]::float8) > 90 or abs(v[2]::float8) > 180 then
    return;
  end if;
  latitude := v[1]::float8;
  longitude := v[2]::float8;
  return next;
end;
$$;
revoke execute on function public.fn_pin_from_text(text) from public, anon, authenticated;

-- Primary branches with no pin, from the first of those that has one.
update public.merchant_branch b
   set latitude = p.latitude, longitude = p.longitude
  from public.merchant m
  cross join lateral (
    select x.latitude, x.longitude
    from (
      select 1 as rank, y.latitude, y.longitude
        from public.merchant_onboarding_answer oa
        cross join lateral public.fn_pin_from_text(oa.answers ->> 'map_pin') y
       where oa.merchant_id = m.id
      union all
      select 2, y.latitude, y.longitude
        from public.merchant_branch bb
        cross join lateral public.fn_pin_from_text(bb.address_text) y
       where bb.merchant_id = m.id and bb.is_primary and bb.deleted_at is null
      union all
      select 3, y.latitude, y.longitude from public.fn_pin_from_text(m.source_url) y
    ) x
    order by x.rank
    limit 1
  ) p
 where b.merchant_id = m.id and b.is_primary and b.deleted_at is null
   and (b.latitude is null or b.longitude is null);

-- A "Google Maps pin" answered later fills a primary branch that still has
-- no pin. A pin already set on the map is never overwritten.
create or replace function public.tg_onboarding_pin_to_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lat double precision;
  v_lng double precision;
begin
  if tg_op = 'UPDATE' and (new.answers ->> 'map_pin') is not distinct from (old.answers ->> 'map_pin') then
    return null;
  end if;
  select p.latitude, p.longitude into v_lat, v_lng
    from public.fn_pin_from_text(new.answers ->> 'map_pin') p;
  if v_lat is not null then
    update public.merchant_branch b
       set latitude = v_lat, longitude = v_lng, updated_at = now()
     where b.merchant_id = new.merchant_id and b.is_primary and b.deleted_at is null
       and (b.latitude is null or b.longitude is null);
  end if;
  return null;
end;
$$;
revoke execute on function public.tg_onboarding_pin_to_branch() from public, anon, authenticated;

create trigger onboarding_pin_to_branch
after insert or update of answers on public.merchant_onboarding_answer
for each row execute function public.tg_onboarding_pin_to_branch();

-- ═══════════════════════════════════════════════ 2. the Locations screen

create or replace function public.rpc_merchant_setup_locations(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not authz.merchant_application_owner(p_merchant_id)
     or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean, false) then
    raise exception 'Setup access is required.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', b.id, 'name', b.name, 'type', b.place_type,
    'address', coalesce(b.address_text, ''), 'contact', coalesce(b.public_contact, ''),
    'activityIds', to_jsonb(b.activity_ids), 'updatedAt', b.updated_at,
    'pin', case when b.latitude is not null and b.longitude is not null
                then to_char(b.latitude, 'FM990.000000') || ', ' || to_char(b.longitude, 'FM9990.000000')
                else '' end,
    'inServiceArea', b.zone_id is not null,
    'area', (select z.name from public.zone z where z.id = b.zone_id)
  ) order by b.is_primary desc, b.created_at)
    from public.merchant_branch b where b.merchant_id = p_merchant_id and b.deleted_at is null), '[]'::jsonb);
end;
$$;

drop function public.rpc_merchant_setup_location_save(uuid, uuid, text, text, text, text, text[], timestamptz);

create function public.rpc_merchant_setup_location_save(
  p_merchant_id uuid, p_branch_id uuid, p_name text, p_place_type text,
  p_address text, p_contact text, p_activity_ids text[], p_expected_updated_at timestamptz,
  p_latitude double precision default null, p_longitude double precision default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.merchant_branch;
  a public.merchant_application;
  v_pinned boolean := p_latitude is not null and p_longitude is not null;
begin
  select * into a from public.merchant_application where merchant_id = p_merchant_id for update;
  perform 1 from public.merchant where id = p_merchant_id for update;
  if not authz.merchant_application_owner(p_merchant_id)
     or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean, false) then
    raise exception 'Setup access is required.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 100
     or p_place_type not in ('physical','service_base','digital_operation')
     or length(coalesce(p_address,'')) > 1000 or length(coalesce(p_contact,'')) > 100
     or coalesce(array_length(p_activity_ids,1),0) > 128
     or exists (select 1 from unnest(coalesce(p_activity_ids,'{}'::text[])) id
                 where not coalesce(a.payload->'subcategories' ? id, false)) then
    raise exception 'Check the location details and selected activities.' using errcode = '22023';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
     or (v_pinned and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180)) then
    raise exception 'That map pin is not a real place. Pin it on the map again.' using errcode = '22023';
  end if;
  if p_branch_id is null then
    if p_place_type <> 'digital_operation' and not v_pinned then
      raise exception 'Pin this location on the map: riders and customers are sent to that exact spot.'
        using errcode = '22023', hint = 'pin_required';
    end if;
    insert into public.merchant_branch(merchant_id, name, address_text, place_type, public_contact, activity_ids,
                                       latitude, longitude, is_primary, source)
      values(p_merchant_id, trim(p_name), nullif(trim(coalesce(p_address,'')),''), p_place_type,
        nullif(trim(coalesce(p_contact,'')),''), coalesce(p_activity_ids,'{}'::text[]),
        p_latitude, p_longitude,
        not exists(select 1 from public.merchant_branch where merchant_id=p_merchant_id and is_primary), 'manual')
      returning * into b;
  else
    select * into b from public.merchant_branch where id=p_branch_id and merchant_id=p_merchant_id
      and deleted_at is null for update;
    if not found then raise exception 'Location not found in your workspace.' using errcode = '42501'; end if;
    if p_expected_updated_at is null or b.updated_at is distinct from p_expected_updated_at then
      raise exception 'This location changed in another session. Reload it before saving.' using errcode = '40001';
    end if;
    if p_place_type <> 'digital_operation' and not v_pinned and (b.latitude is null or b.longitude is null) then
      raise exception 'Pin this location on the map: riders and customers are sent to that exact spot.'
        using errcode = '22023', hint = 'pin_required';
    end if;
    update public.merchant_branch set name=trim(p_name), address_text=nullif(trim(coalesce(p_address,'')),''),
      latitude=case when v_pinned then p_latitude else latitude end,
      longitude=case when v_pinned then p_longitude else longitude end,
      place_type=p_place_type, public_contact=nullif(trim(coalesce(p_contact,'')),''),
      activity_ids=coalesce(p_activity_ids,'{}'::text[]), updated_at=now()
      where id=p_branch_id returning * into b;
  end if;
  perform audit.log(p_actor_type=>'merchant_user'::public.actor_type,p_module=>'merchant',
    p_action=>'merchant.setup_location_saved',p_target_type=>'merchant_branch',p_target_id=>b.id,
    p_after=>jsonb_build_object('merchant_id',p_merchant_id,'created',p_branch_id is null,'pinned',b.latitude is not null));
  return jsonb_build_object('id', b.id, 'name', b.name, 'type', b.place_type,
    'address', coalesce(b.address_text,''), 'contact', coalesce(b.public_contact,''),
    'activityIds', to_jsonb(b.activity_ids), 'updatedAt', b.updated_at,
    'pin', case when b.latitude is not null and b.longitude is not null
                then to_char(b.latitude, 'FM990.000000') || ', ' || to_char(b.longitude, 'FM9990.000000')
                else '' end,
    'inServiceArea', b.zone_id is not null,
    'area', (select z.name from public.zone z where z.id = b.zone_id));
end;
$$;
revoke all on function public.rpc_merchant_setup_location_save(uuid,uuid,text,text,text,text,text[],timestamptz,double precision,double precision) from public, anon;
grant execute on function public.rpc_merchant_setup_location_save(uuid,uuid,text,text,text,text,text[],timestamptz,double precision,double precision) to authenticated;

-- ═══════════════════════════════════════════════ 3. the branch drawer

-- rpc_branch_upsert: 20260101020100, plus a pin for every branch.
create or replace function public.rpc_branch_upsert(
  p_merchant_id uuid,
  p_branch jsonb,
  p_branch_id uuid default null
)
returns public.merchant_branch
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.merchant_branch;
  v_name text := nullif(trim(p_branch ->> 'name'), '');
  v_lat float8 := nullif(p_branch ->> 'latitude', '')::float8;
  v_lng float8 := nullif(p_branch ->> 'longitude', '')::float8;
  v_city uuid;
  v_zone uuid;
  v_point extensions.geography;
begin
  if not authz.is_merchant_member(p_merchant_id) and not authz.can_manage_merchants(null) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Give the branch a name — it is what guests and your team see.'
      using errcode = '22023';
  end if;

  if (v_lat is null) <> (v_lng is null)
     or (v_lat is not null and (v_lat not between -90 and 90 or v_lng not between -180 and 180)) then
    raise exception 'That map pin is not a real place. Pin it on the map again.' using errcode = '22023';
  end if;
  /* A branch is a place riders and customers go to: it needs its exact pin,
     new or not, unless it already has one. */
  if v_lat is null and (p_branch_id is null or exists (
       select 1 from public.merchant_branch
        where id = p_branch_id and merchant_id = p_merchant_id and (latitude is null or longitude is null))) then
    raise exception 'Pin this branch on the map: riders and customers are sent to that exact spot.'
      using errcode = '22023', hint = 'pin_required';
  end if;

  if v_lat is not null and v_lng is not null then
    v_point := extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography;
    select z.id into v_zone from public.zone z
     where z.active and extensions.st_covers(z.polygon, v_point) limit 1;
  end if;

  select city_id into v_city from public.merchant where id = p_merchant_id;

  if p_branch_id is null then
    if exists (select 1 from public.merchant_branch
                where merchant_id = p_merchant_id and name = v_name and deleted_at is null) then
      raise exception 'You already have a branch called %. Two with one name is how an order reaches the wrong kitchen.', v_name
        using errcode = '23505';
    end if;

    insert into public.merchant_branch (
      merchant_id, name, address_text, latitude, longitude, location, zone_id,
      pickup_instructions, rider_phone, is_primary, source)
    values (
      p_merchant_id, v_name,
      nullif(trim(p_branch ->> 'address_text'), ''),
      v_lat, v_lng, v_point, v_zone,
      nullif(trim(p_branch ->> 'pickup_instructions'), ''),
      nullif(trim(p_branch ->> 'rider_phone'), ''),
      /* The first branch is the primary one; later ones are not,
         and a merchant without a primary branch has no address
         on Explore. */
      not exists (select 1 from public.merchant_branch
                   where merchant_id = p_merchant_id and deleted_at is null),
      'manual')
    returning * into v_branch;
  else
    update public.merchant_branch set
      name = v_name,
      address_text = coalesce(nullif(trim(p_branch ->> 'address_text'), ''), address_text),
      latitude = coalesce(v_lat, latitude),
      longitude = coalesce(v_lng, longitude),
      location = coalesce(v_point, location),
      zone_id = coalesce(v_zone, zone_id),
      pickup_instructions = coalesce(
        nullif(trim(p_branch ->> 'pickup_instructions'), ''), pickup_instructions),
      rider_phone = coalesce(nullif(trim(p_branch ->> 'rider_phone'), ''), rider_phone),
      updated_at = now()
    where id = p_branch_id and merchant_id = p_merchant_id and deleted_at is null
    returning * into v_branch;

    if v_branch.id is null then
      raise exception 'That branch is not on your account, or it has been removed.'
        using errcode = '42501';
    end if;
  end if;

  perform audit.log('merchant_user'::public.actor_type, 'merchants',
    case when p_branch_id is null then 'branch.created' else 'branch.updated' end,
    p_target_type => 'merchant_branch', p_target_id => v_branch.id,
    p_target_label => v_branch.name, p_city_id => v_city,
    p_after => jsonb_build_object('name', v_branch.name, 'zone', v_branch.zone_id));

  /*
   * A new branch needs a human look before it appears on
   * Explore, so the console is told now rather than finding it
   * on a sweep. An edit to an existing one does not — the
   * address and photos are reviewed separately.
   */
  if p_branch_id is null then
    perform public.fn_approval_raise(
      p_kind => 'merchant_delist',
      p_module => 'merchants',
      p_target_type => 'merchant_branch',
      p_target_id => v_branch.id,
      p_title => 'New branch to review: ' || v_branch.name,
      p_body => (select trading_name from public.merchant where id = p_merchant_id)
                || ' added a branch at ' || coalesce(v_branch.address_text, 'an address not yet given') || '.',
      p_href => '/merchants/' || p_merchant_id::text,
      p_city_id => v_city,
      p_payload => jsonb_build_object('branch_id', v_branch.id, 'name', v_branch.name));
  end if;

  return v_branch;
end;
$$;

-- ═══════════════════════════════════════════════ 4. going live

-- fn_merchant_go_live_missing: 20270126000200, plus the main location's pin and opening hours.
create or replace function public.fn_merchant_go_live_missing(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  a public.merchant_application;
  v_items jsonb := '[]'::jsonb;
  v_category text;
  v_details int;
  v_agreement public.merchant_agreement;
  v_to_upload int;
  v_to_check int;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    return null;
  end if;
  select * into a from public.merchant_application where merchant_id = p_merchant_id;

  if a.merchant_id is not null then
    if not (a.review_state = 'approved' and a.approved_revision = a.revision
            and a.submitted_revision = a.revision) then
      v_items := v_items || jsonb_build_object('key', 'application', 'who', 'nexg',
        'label', 'NexG approves your application');
    end if;

    v_category := public.fn_merchant_onboarding_category(p_merchant_id);
    v_details := jsonb_array_length(public.fn_merchant_onboarding_missing_for(
      v_category,
      coalesce((select oa.answers from public.merchant_onboarding_answer oa
                where oa.merchant_id = p_merchant_id), '{}'::jsonb)));
    if v_details > 0 then
      v_items := v_items || jsonb_build_object('key', 'onboarding_details', 'who', 'merchant',
        'label', 'Onboarding details', 'count', v_details);
    end if;

    if not exists (
      select 1 from public.merchant_agreement_party p
      where p.merchant_id = p_merchant_id
        and nullif(trim(coalesce(p.registration_number, '')), '') is not null
    ) then
      v_items := v_items || jsonb_build_object('key', 'agreement_details', 'who', 'merchant',
        'label', 'Your details for the agreement');
    end if;

    v_agreement := public.fn_merchant_agreement_for_category(public.fn_merchant_agreement_category(p_merchant_id));
    if v_agreement.id is not null and not exists (
      select 1 from public.merchant_agreement_acceptance x
      where x.merchant_id = p_merchant_id and x.agreement_id = v_agreement.id
        and x.version = v_agreement.version
    ) then
      v_items := v_items || jsonb_build_object('key', 'agreement', 'who', 'merchant',
        'label', 'Read and accept the merchant agreement');
    end if;
  end if;

  if not exists (select 1 from public.merchant_branch b
                 where b.merchant_id = p_merchant_id and b.is_primary) then
    v_items := v_items || jsonb_build_object('key', 'branch', 'who', 'merchant',
      'label', 'Your business location');
  elsif not exists (select 1 from public.merchant_branch b
                     where b.merchant_id = p_merchant_id and b.is_primary and b.deleted_at is null
                       and b.latitude is not null and b.longitude is not null and b.zone_id is not null) then
    /* Without its pin a shop is on no map and in no area (22 Nov 2026). */
    v_items := v_items || jsonb_build_object('key', 'branch_pin', 'who', 'merchant',
      'label', 'Put your main location on the map, inside an area NexG serves');
  end if;

  /* Hours: the rows the shop page, "Open now" and checkout read. Onboarding
     and the Hours screen both write them. */
  if not exists (select 1 from public.merchant_hours h where h.merchant_id = p_merchant_id) then
    v_items := v_items || jsonb_build_object('key', 'hours', 'who', 'merchant',
      'label', 'Your opening hours');
  end if;

  /* An essential required document is the merchant's to do while it has no current
     upload or the last one was rejected or expired; NexG's while it waits to
     be checked. */
  select
    count(*) filter (where d.status is null or d.status in ('rejected', 'expired')),
    count(*) filter (where d.status = 'uploaded')
  into v_to_upload, v_to_check
  from public.fn_merchant_required_docs(p_merchant_id) q
  left join lateral (
    select doc.status::text as status
    from public.document doc
    where doc.owner_type = 'merchant' and doc.owner_id = p_merchant_id
      and doc.requirement_id = q.id and doc.superseded_at is null
    order by doc.created_at desc
    limit 1
  ) d on true
  where q.essential;

  if v_to_upload > 0 then
    v_items := v_items || jsonb_build_object('key', 'documents', 'who', 'merchant',
      'label', 'Documents to upload', 'count', v_to_upload);
  end if;
  if v_to_check > 0 then
    v_items := v_items || jsonb_build_object('key', 'documents_review', 'who', 'nexg',
      'label', 'NexG checks your documents', 'count', v_to_check);
  end if;

  return v_items;
end;
$$;

revoke all on function public.fn_merchant_go_live_missing(uuid) from public, anon, authenticated;
grant execute on function public.fn_merchant_go_live_missing(uuid) to service_role;
