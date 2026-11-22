-- Complete listings: a host enters everything the NEXG Stays guest app shows,
-- and decides when a unit goes live.
--
--   1. A publish switch. unit.host_published, set with rpc_unit_set_published.
--      A unit lists only when it is ready AND the host has published it.
--      Unpublishing takes it off the site. Staff unlisting a property
--      (unlisted_by_staff_at, rpc_property_set_listed) still wins. This
--      replaces 20261123000100's automatic listing. Units already listed keep
--      their listing: they start published.
--   2. What a guest reads, now host-writable through the existing RPCs (new
--      jsonb keys, same signatures):
--        rpc_property_upsert:      amenities, neighbourhood_note, house_rules,
--                                  cancellation_policy
--        rpc_unit_upsert_guarded:  unit_amenities, bed_setup, size_sqm,
--                                  unit_summary, min_nights
--      A key that is sent is written (an empty string clears it); a key that
--      is left out keeps what is there. lat/lng were already accepted and are
--      now range-checked.
--   3. rpc_host_listing_checklist: what each unit still needs before it can
--      go live, in the words the workspace shows.
--   4. property_public and property_unit_public gain columns at the end:
--      latitude, longitude, house_rules, cancellation_policy; and latitude,
--      longitude, checkin_time, checkout_time. The unit's pin and times are
--      its own and may be null: readers fall back to the property's.
--   5. host-photos: anyone may read a photo that is in the gallery of a
--      property or unit guests can see (authz.host_photo_is_public). Every
--      other photo stays private.
--
-- Re-created from their latest definitions with only these changes:
--   rpc_property_upsert       20260101019500
--   rpc_unit_upsert_guarded   20261114000100
--   fn_unit_listing_ready     20261123000100 (now reads fn_unit_listing_missing)
--   fn_listing_sync           20261123000100
--   unit_listing_sync trigger 20261123000100 (also fires on host_published)
--   property_public           20261122000100
--   property_unit_public      20261122000100
-- No booking, payment or fee changes.

-- ═══════════════════════════════════════════════ columns

alter table public.property
  add column if not exists house_rules text,
  add column if not exists cancellation_policy text;

alter table public.property
  drop constraint if exists property_house_rules_length,
  add constraint property_house_rules_length check (house_rules is null or char_length(house_rules) <= 2000),
  drop constraint if exists property_cancellation_policy_length,
  add constraint property_cancellation_policy_length
    check (cancellation_policy is null or char_length(cancellation_policy) <= 2000);

comment on column public.property.house_rules is
  'The host''s own house rules, shown to guests before they book. At most 2000 characters.';
comment on column public.property.cancellation_policy is
  'The host''s own cancellation policy, in their words, shown to guests before they book. At most 2000 characters.';

alter table public.unit
  add column if not exists host_published boolean not null default false;

/* Not valid: older rows are left alone, every new write is held to it. */
alter table public.unit
  drop constraint if exists unit_min_nights_positive,
  add constraint unit_min_nights_positive check (min_nights >= 1) not valid;

comment on column public.unit.host_published is
  'The host''s publish switch. A unit is listed only when it is ready and this is true; turning it off takes the unit off the site. Staff unlisting the property still wins.';

/*
 * A listed unit is always a published one. Turning the switch off takes
 * the unit off the site in the same write; anything else that lists a
 * unit directly (staff tools, seeds, older code) publishes it with it, so
 * a row can never be listed and unpublished at once.
 */
create or replace function public.tg_unit_publish_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.listed and not new.host_published then
    if tg_op = 'UPDATE' and old.host_published then
      new.listed := false;
    else
      new.host_published := true;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_unit_publish_guard() from public, anon, authenticated;

drop trigger if exists unit_publish_guard on public.unit;
create trigger unit_publish_guard
  before insert or update of listed, host_published on public.unit
  for each row execute function public.tg_unit_publish_guard();

/* Units already on the site stay there: they count as published. */
update public.unit set host_published = true where listed and not host_published;

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('unit.published', 'hotels', 'info', false, 'Host turned a unit''s listing on'),
  ('unit.unpublished', 'hotels', 'info', false, 'Host took a unit off the site'),
  ('unit.unlisted', 'hotels', 'info', false, 'Unit taken off the site after its host unpublished it')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ readiness

/*
 * What a unit still needs before guests can see it, in the words the
 * workspace checklist shows. Empty means ready. Same rules as
 * 20261123000100's fn_unit_listing_ready, item by item.
 */
create or replace function public.fn_unit_listing_missing(p_unit_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_host public.host;
  v_property public.property;
  v_missing text[] := '{}';
begin
  select * into v_unit from public.unit where id = p_unit_id;
  if v_unit.id is null then
    return array['The unit could not be found'];
  end if;
  if v_unit.archived_at is not null then
    return array['The unit is archived'];
  end if;

  select * into v_host from public.host where id = v_unit.host_id;
  if v_host.status is distinct from 'live' then
    v_missing := v_missing || 'NexG approval of your host account'::text;
  end if;

  if v_unit.status = 'archived' then
    v_missing := v_missing || 'The unit is archived'::text;
  elsif v_unit.status <> 'live' then
    if v_unit.address_line is null then
      v_missing := v_missing || 'A street address'::text;
    end if;
    if v_unit.handoff is null then
      v_missing := v_missing || 'A delivery handoff rule'::text;
    elsif v_unit.handoff in ('leave_with_askari', 'caretaker') and v_unit.caretaker_confirmed_at is null then
      v_missing := v_missing || 'The caretaker''s confirmation'::text;
    end if;
    if v_unit.status = 'paused' then
      v_missing := v_missing || 'The unit is paused'::text;
    end if;
    /* Setting up with everything above in place goes live on approval; any
       other state that is not live still is not ready. */
    if cardinality(v_missing) = 0 then
      v_missing := v_missing || 'One more save of the unit'::text;
    end if;
  end if;

  if v_unit.property_id is not null then
    select * into v_property from public.property
     where id = v_unit.property_id and deleted_at is null;
  end if;
  if v_property.id is null then
    v_missing := v_missing || 'A property'::text;
  elsif nullif(trim(v_property.name), '') is null then
    v_missing := v_missing || 'A property name'::text;
  end if;

  if nullif(trim(coalesce(v_property.area, v_unit.area)), '') is null then
    v_missing := v_missing || 'An area'::text;
  end if;
  if v_unit.nightly_rate_kes is null then
    v_missing := v_missing || 'A nightly rate'::text;
  end if;
  if coalesce(v_unit.max_guests, 0) <= 0 then
    v_missing := v_missing || 'Guest capacity'::text;
  end if;
  if v_unit.bedrooms is null then
    v_missing := v_missing || 'Bedrooms'::text;
  end if;
  if coalesce(jsonb_array_length(v_unit.photos), 0) = 0
     and coalesce(jsonb_array_length(v_property.photos), 0) = 0 then
    v_missing := v_missing || 'At least one photo'::text;
  end if;

  return v_missing;
end;
$$;

create or replace function public.fn_unit_listing_ready(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select cardinality(public.fn_unit_listing_missing(p_unit_id)) = 0;
$$;

revoke execute on function public.fn_unit_listing_missing(uuid), public.fn_unit_listing_ready(uuid)
from public, anon, authenticated;

-- ═══════════════════════════════════════════════ listing follows the switch

/*
 * A ready, published unit lists itself and its property. An unpublished
 * unit is taken off the site. Losing readiness later does not unlist
 * anything (as before): the host or staff decide that. A property staff
 * unlisted stays unlisted until staff list it again.
 */
create or replace function public.fn_listing_sync(p_unit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_ready boolean;
  v_property public.property;
begin
  select * into v_unit from public.unit where id = p_unit_id;
  if v_unit.id is null then return; end if;

  if not v_unit.host_published then
    if v_unit.listed then
      update public.unit set listed = false where id = v_unit.id;
      perform audit.log('system'::public.actor_type, 'hotels', 'unit.unlisted',
        p_target_type => 'unit', p_target_id => v_unit.id, p_city_id => v_unit.city_id,
        p_after => jsonb_build_object('property', v_unit.property_id, 'reason', 'unpublished'));
    end if;
    return;
  end if;

  v_ready := public.fn_unit_listing_ready(p_unit_id);
  if not v_ready then return; end if;

  if not v_unit.listed then
    update public.unit set listed = true where id = v_unit.id;
    perform audit.log('system'::public.actor_type, 'hotels', 'unit.auto_listed',
      p_target_type => 'unit', p_target_id => v_unit.id, p_city_id => v_unit.city_id,
      p_after => jsonb_build_object('property', v_unit.property_id));
  end if;

  select * into v_property from public.property where id = v_unit.property_id;
  if v_property.id is not null and not v_property.listed and v_property.unlisted_by_staff_at is null then
    update public.property set listed = true, listed_at = now(), listed_by = null
     where id = v_property.id;
    perform audit.log('system'::public.actor_type, 'hotels', 'property.auto_listed',
      p_target_type => 'property', p_target_id => v_property.id, p_city_id => v_property.city_id);
  end if;
end;
$$;

drop trigger if exists unit_listing_sync on public.unit;
create trigger unit_listing_sync
  after insert or update of status, archived_at, property_id, nightly_rate_kes, max_guests, bedrooms, photos, host_published
  on public.unit
  for each row execute function public.tg_unit_listing_sync();

revoke execute on function public.fn_listing_sync(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════ the switch

/*
 * Turn a unit's listing on or off. Refuses to publish a unit that is not
 * ready, and says what is missing. Unpublishing always works.
 *
 * Returns { unit_id, published, listed, held_by_staff, missing }.
 * held_by_staff: the property was taken down by NexG, so a published unit
 * still does not show until NexG lists it again.
 */
create or replace function public.rpc_unit_set_published(p_unit uuid, p_published boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_missing text[];
  v_held boolean;
begin
  if p_published is null then
    raise exception 'Choose whether the unit is published.' using errcode = '22023';
  end if;

  select * into v_unit from public.unit where id = p_unit for update;
  if v_unit.id is null
     or not authz.is_host_member(v_unit.host_id)
     or not authz.can_see_unit(v_unit.id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;

  if p_published then
    v_missing := public.fn_unit_listing_missing(v_unit.id);
    if cardinality(v_missing) > 0 then
      raise exception 'Before this unit can go live it needs: %.', array_to_string(v_missing, ', ')
        using errcode = '22023', detail = array_to_json(v_missing)::text;
    end if;
  end if;

  if v_unit.host_published is distinct from p_published then
    /* The listing trigger lists or unlists the unit in this same update. */
    update public.unit set host_published = p_published where id = v_unit.id;

    perform audit.log('host_user'::public.actor_type, 'hotels',
      case when p_published then 'unit.published' else 'unit.unpublished' end,
      p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => v_unit.id,
      p_city_id => v_unit.city_id,
      p_after => jsonb_build_object('published', p_published));
  end if;

  select * into v_unit from public.unit where id = v_unit.id;
  select coalesce(p.unlisted_by_staff_at is not null, false) into v_held
    from public.property p where p.id = v_unit.property_id;

  return jsonb_build_object(
    'unit_id', v_unit.id,
    'published', v_unit.host_published,
    'listed', v_unit.listed,
    'held_by_staff', coalesce(v_held, false),
    'missing', to_jsonb(public.fn_unit_listing_missing(v_unit.id)));
end;
$$;

revoke execute on function public.rpc_unit_set_published(uuid, boolean) from public, anon;
grant execute on function public.rpc_unit_set_published(uuid, boolean) to authenticated;

/*
 * The checklist for every unit the caller can see on this host: what is
 * missing, whether the host has published it, whether guests can see it,
 * and whether NexG has taken the property down. Read-only.
 */
create or replace function public.rpc_host_listing_checklist(p_host_id uuid)
returns table (
  unit_id uuid,
  published boolean,
  listed boolean,
  held_by_staff boolean,
  missing text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id,
         u.host_published,
         u.listed,
         coalesce(p.unlisted_by_staff_at is not null, false),
         public.fn_unit_listing_missing(u.id)
    from public.unit u
    left join public.property p on p.id = u.property_id
   where u.host_id = p_host_id
     and u.archived_at is null
     and authz.can_see_unit(u.id);
$$;

revoke execute on function public.rpc_host_listing_checklist(uuid) from public, anon;
grant execute on function public.rpc_host_listing_checklist(uuid) to authenticated;

-- ═══════════════════════════════════════════════ host-writable fields

/*
 * The amenity list a host sends: labels, trimmed, spaces collapsed, empty
 * ones dropped, duplicates (ignoring case) dropped, order kept. At most 40,
 * each at most 80 characters.
 */
create or replace function public.fn_host_amenity_labels(p_value jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out text[] := '{}';
  v_seen text[] := '{}';
  v_item jsonb;
  v_label text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return '{}';
  end if;
  if jsonb_typeof(p_value) <> 'array' then
    raise exception 'Send amenities as a list.' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(v_item) <> 'string' then
      raise exception 'Each amenity is a short label.' using errcode = '22023';
    end if;
    v_label := regexp_replace(trim(v_item #>> '{}'), '\s+', ' ', 'g');
    continue when v_label = '';
    if char_length(v_label) > 80 then
      raise exception 'Keep each amenity under 80 characters: %', left(v_label, 40) || '…'
        using errcode = '22023';
    end if;
    continue when lower(v_label) = any (v_seen);
    v_seen := v_seen || lower(v_label);
    v_out := v_out || v_label;
  end loop;
  if cardinality(v_out) > 40 then
    raise exception 'Forty amenities is the most a listing can carry.' using errcode = '22023';
  end if;
  return v_out;
end;
$$;

/* A sent text key: trimmed, empty is null, and no longer than p_max. */
create or replace function public.fn_host_listing_text(p_value jsonb, p_label text, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then return null; end if;
  if jsonb_typeof(p_value) <> 'string' then
    raise exception '% should be text.', p_label using errcode = '22023';
  end if;
  v_text := nullif(trim(p_value #>> '{}'), '');
  if char_length(v_text) > p_max then
    raise exception 'Keep the % under % characters.', lower(p_label), p_max using errcode = '22023';
  end if;
  return v_text;
end;
$$;

/* lat/lng, both or neither, in range. */
create or replace function public.fn_host_listing_point(p_value jsonb)
returns extensions.geography
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_lat float8;
  v_lng float8;
begin
  if nullif(p_value ->> 'lat', '') is null and nullif(p_value ->> 'lng', '') is null then
    return null;
  end if;
  if nullif(p_value ->> 'lat', '') is null or nullif(p_value ->> 'lng', '') is null then
    raise exception 'Send both the latitude and the longitude of the pin.' using errcode = '22023';
  end if;
  begin
    v_lat := (p_value ->> 'lat')::float8;
    v_lng := (p_value ->> 'lng')::float8;
  exception when others then
    raise exception 'The map pin is not a valid position.' using errcode = '22023';
  end;
  if v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception 'The map pin is not a valid position.' using errcode = '22023';
  end if;
  return extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography;
end;
$$;

revoke execute on function public.fn_host_amenity_labels(jsonb),
  public.fn_host_listing_text(jsonb, text, integer),
  public.fn_host_listing_point(jsonb)
from public, anon, authenticated;

/*
 * Create or update a property. 20260101019500, plus: amenities,
 * neighbourhood_note, house_rules and cancellation_policy, and a
 * range-checked pin.
 *
 * Address and pin are optional at creation on purpose. A host
 * adding four buildings in one sitting should not be made to
 * find four map pins first; the readiness checks will ask for
 * what is missing before anything goes live.
 */
create or replace function public.rpc_property_upsert(
  p_host_id uuid,
  p_property jsonb,
  p_property_id uuid default null
)
returns public.property
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property public.property;
  v_point extensions.geography;
  v_slug text;
  v_name text := nullif(trim(p_property ->> 'name'), '');
  v_amenities text[];
  v_neighbourhood text;
  v_rules text;
  v_cancellation text;
begin
  if not authz.is_host_member(p_host_id) and not authz.works_hospitality(null) then
    raise exception 'Not your property.' using errcode = 'insufficient_privilege';
  end if;

  if v_name is null then
    raise exception 'Give the property a name — it is what you and your team will look for.'
      using errcode = '22023';
  end if;

  v_point := public.fn_host_listing_point(p_property);
  v_amenities := public.fn_host_amenity_labels(p_property -> 'amenities');
  v_neighbourhood := public.fn_host_listing_text(p_property -> 'neighbourhood_note', 'Neighbourhood note', 2000);
  v_rules := public.fn_host_listing_text(p_property -> 'house_rules', 'House rules', 2000);
  v_cancellation := public.fn_host_listing_text(p_property -> 'cancellation_policy', 'Cancellation policy', 2000);

  if p_property_id is null then
    /*
     * The slug has to be unique across every property on the
     * platform, and two hosts naming a building "Riverside" is
     * not a collision either of them should hear about. So the
     * first eight of a uuid go on the end rather than a counter
     * that would need a loop and a lock.
     */
    v_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug) || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);

    /*
     * A duplicate name is caught and re-said.
     *
     * Without this the host sees `duplicate key value violates
     * unique constraint "property_host_id_name_key"`, which is
     * accurate, useless, and alarming — it reads like the site
     * broke rather than like they have two blocks called
     * Riverside.
     */
    if exists (select 1 from public.property
                where host_id = p_host_id and name = v_name and deleted_at is null) then
      raise exception 'You already have a property called %. Give this one a name you will tell them apart by.', v_name
        using errcode = '23505';
    end if;

    insert into public.property (
      host_id, slug, name, kind, area, city_id, point, floors,
      summary, description, check_in_from, check_out_by,
      amenities, neighbourhood_note, house_rules, cancellation_policy)
    values (
      p_host_id, v_slug, v_name,
      coalesce(nullif(p_property ->> 'kind', '')::public.property_kind, 'apartment'),
      nullif(trim(p_property ->> 'area'), ''),
      coalesce(nullif(p_property ->> 'city_id', '')::uuid,
               (select city_id from public.host where id = p_host_id)),
      v_point,
      nullif(p_property ->> 'floors', '')::integer,
      nullif(trim(p_property ->> 'summary'), ''),
      nullif(trim(p_property ->> 'description'), ''),
      nullif(p_property ->> 'check_in_from', '')::time,
      nullif(p_property ->> 'check_out_by', '')::time,
      v_amenities, v_neighbourhood, v_rules, v_cancellation)
    returning * into v_property;
  else
    update public.property set
      name = v_name,
      kind = coalesce(nullif(p_property ->> 'kind', '')::public.property_kind, kind),
      area = coalesce(nullif(trim(p_property ->> 'area'), ''), area),
      point = coalesce(v_point, point),
      floors = coalesce(nullif(p_property ->> 'floors', '')::integer, floors),
      summary = coalesce(nullif(trim(p_property ->> 'summary'), ''), summary),
      description = coalesce(nullif(trim(p_property ->> 'description'), ''), description),
      check_in_from = coalesce(nullif(p_property ->> 'check_in_from', '')::time, check_in_from),
      check_out_by = coalesce(nullif(p_property ->> 'check_out_by', '')::time, check_out_by),
      /* Sent keys are written, so a host can clear them; missing keys are kept. */
      amenities = case when p_property ? 'amenities' then v_amenities else amenities end,
      neighbourhood_note = case when p_property ? 'neighbourhood_note' then v_neighbourhood else neighbourhood_note end,
      house_rules = case when p_property ? 'house_rules' then v_rules else house_rules end,
      cancellation_policy = case when p_property ? 'cancellation_policy' then v_cancellation else cancellation_policy end,
      updated_at = now()
    where id = p_property_id and host_id = p_host_id and deleted_at is null
    returning * into v_property;

    if v_property.id is null then
      raise exception 'That property is not on your account, or it has been removed.'
        using errcode = '42501';
    end if;
  end if;

  perform audit.log('host_user'::public.actor_type, 'hotels',
    case when p_property_id is null then 'property.created' else 'property.updated' end,
    p_target_type => 'property', p_target_id => v_property.id,
    p_city_id => v_property.city_id,
    p_after => jsonb_build_object('name', v_property.name, 'kind', v_property.kind));

  return v_property;
end;
$$;

/*
 * 20261114000100, plus: unit_amenities, bed_setup, size_sqm, unit_summary
 * and min_nights, and a range-checked pin (rpc_unit_upsert writes it).
 */
create or replace function public.rpc_unit_upsert_guarded(
  p_host_id uuid,
  p_unit jsonb,
  p_unit_id uuid default null
)
returns public.unit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_name text := nullif(trim(p_unit ->> 'name'), '');
  v_property_id uuid := nullif(p_unit ->> 'property_id', '')::uuid;
  v_amenities text[];
  v_bed_setup text;
  v_summary text;
  v_size integer;
  v_min_nights integer;
begin
  if not authz.is_host_member(p_host_id) and not authz.works_hospitality(null) then
    raise exception 'Not your unit.' using errcode = '42501';
  end if;

  if v_property_id is not null and not exists (
    select 1 from public.property
    where id = v_property_id and host_id = p_host_id and deleted_at is null
    for share
  ) then
    raise exception 'Choose a property on your account.' using errcode = '22023';
  end if;

  if p_unit_id is null and v_name is not null and exists (
    select 1 from public.unit
    where host_id = p_host_id and name = v_name and archived_at is null
  ) then
    raise exception 'You already have a unit called %.', v_name using errcode = '23505';
  end if;

  /* Checked before anything is written, so a bad field saves nothing. */
  perform public.fn_host_listing_point(p_unit);
  v_amenities := public.fn_host_amenity_labels(p_unit -> 'unit_amenities');
  v_bed_setup := public.fn_host_listing_text(p_unit -> 'bed_setup', 'Bed setup', 200);
  v_summary := public.fn_host_listing_text(p_unit -> 'unit_summary', 'Unit summary', 2000);
  begin
    v_size := nullif(p_unit ->> 'size_sqm', '')::integer;
    v_min_nights := nullif(p_unit ->> 'min_nights', '')::integer;
  exception when others then
    raise exception 'Enter size and minimum nights as whole numbers.' using errcode = '22023';
  end;
  if v_size is not null and (v_size < 1 or v_size > 100000) then
    raise exception 'Enter the size in square metres, between 1 and 100,000.' using errcode = '22023';
  end if;
  if v_min_nights is not null and (v_min_nights < 1 or v_min_nights > 365) then
    raise exception 'Minimum nights is between 1 and 365.' using errcode = '22023';
  end if;

  v_unit := public.rpc_unit_upsert(p_host_id, p_unit, p_unit_id);
  if v_unit.id is null then
    raise exception 'That unit is not on your account.' using errcode = '42501';
  end if;

  if p_unit ?| array['property_id', 'bedrooms', 'bathrooms', 'max_guests', 'nightly_rate_kes'] then
    update public.unit set
      property_id = coalesce(v_property_id, property_id),
      bedrooms = coalesce(nullif(p_unit ->> 'bedrooms', '')::integer, bedrooms),
      bathrooms = coalesce(nullif(p_unit ->> 'bathrooms', '')::numeric, bathrooms),
      max_guests = coalesce(nullif(p_unit ->> 'max_guests', '')::integer, max_guests),
      nightly_rate_kes = coalesce(nullif(p_unit ->> 'nightly_rate_kes', '')::bigint, nightly_rate_kes)
    where id = v_unit.id and host_id = p_host_id
    returning * into v_unit;
  end if;

  /* What a guest reads. Sent keys are written (empty clears), missing keys kept;
     minimum nights is never cleared, only changed. */
  if p_unit ?| array['unit_amenities', 'bed_setup', 'size_sqm', 'unit_summary', 'min_nights'] then
    update public.unit set
      unit_amenities = case when p_unit ? 'unit_amenities' then v_amenities else unit_amenities end,
      bed_setup = case when p_unit ? 'bed_setup' then v_bed_setup else bed_setup end,
      size_sqm = case when p_unit ? 'size_sqm' then v_size else size_sqm end,
      unit_summary = case when p_unit ? 'unit_summary' then v_summary else unit_summary end,
      min_nights = coalesce(v_min_nights, min_nights)
    where id = v_unit.id and host_id = p_host_id
    returning * into v_unit;
  end if;

  /* rpc_host_verify only promotes the units that exist at approval. A unit
     added or completed afterwards goes live here, on the same rule. */
  if v_unit.status = 'setting_up'
    and exists (select 1 from public.host where id = p_host_id and status = 'live')
    and v_unit.address_line is not null
    and v_unit.handoff is not null
    and (v_unit.handoff not in ('leave_with_askari', 'caretaker') or v_unit.caretaker_confirmed_at is not null) then
    update public.unit set status = 'live' where id = v_unit.id returning * into v_unit;
  end if;

  /* rpc_unit_upsert logs the save itself; this records what the wrapper adds
     (portfolio fields and going live), which the wiring check requires. */
  perform audit.log('host_user'::public.actor_type, 'hotels', 'unit.portfolio_saved',
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => v_unit.id,
    p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('status', v_unit.status, 'property_id', v_unit.property_id));

  return v_unit;
end;
$$;

-- ═══════════════════════════════════════════════ what a guest sees

create or replace view public.property_public
with (security_invoker = false) as
select
  p.id,
  p.slug,
  p.name,
  p.kind,
  p.area,
  p.city_id,
  c.name as city_name,
  p.summary,
  p.description,
  p.amenities,
  p.photos,
  p.neighbourhood_note,
  p.check_in_from,
  p.check_out_by,
  count(u.id)::integer as units_available,
  min(u.bedrooms) as bedrooms_min,
  max(u.bedrooms) as bedrooms_max,
  max(u.max_guests) as sleeps_max,
  /* "from KES x" is a minimum, and only over units that actually have
     a rate. All null stays null, and the card says price on request. */
  min(u.nightly_rate_kes) as from_rate_kes,
  count(*) filter (where u.nightly_rate_kes is null)::integer as units_without_rate,
  /* A demonstration listing: shown, never bookable. */
  p.is_sample,
  /* The host's exact pin (owner, 20 Nov): public. */
  extensions.st_y(p.point::extensions.geometry) as latitude,
  extensions.st_x(p.point::extensions.geometry) as longitude,
  p.house_rules,
  p.cancellation_policy
from public.property p
join public.host h on h.id = p.host_id
left join public.city c on c.id = p.city_id
join public.unit u
  on u.property_id = p.id
 and u.status = 'live'
 and u.listed
 and u.archived_at is null
where p.listed and h.status = 'live'
group by p.id, c.name;


create or replace view public.property_unit_public
with (security_invoker = false) as
select
  u.id,
  u.property_id,
  u.label_public,
  u.name,
  u.unit_summary,
  u.bedrooms,
  u.bathrooms,
  u.max_guests,
  u.size_sqm,
  u.bed_setup,
  u.nightly_rate_kes,
  u.min_nights,
  u.unit_amenities,
  u.photos,
  u.floor,
  u.area,
  /* So a guest knows the concierge rule exists without being handed
     the askari's name before they have booked anything. */
  (u.handoff is not null) as handoff_arranged,
  p.is_sample,
  /* The unit's own pin and times; null means use the property's. */
  extensions.st_y(u.point::extensions.geometry) as latitude,
  extensions.st_x(u.point::extensions.geometry) as longitude,
  u.checkin_time,
  u.checkout_time
from public.unit u
join public.property p on p.id = u.property_id
join public.host h on h.id = u.host_id
where u.status = 'live' and u.listed and u.archived_at is null
  and p.listed and h.status = 'live';

-- ═══════════════════════════════════════════════ photos guests can see

/*
 * True when the path is in the gallery of a property or unit a guest can
 * see: the same conditions as property_public and property_unit_public.
 * Paths start with the host id, which narrows the search. Returns false on
 * a malformed path rather than raising: a policy that throws turns a bad
 * filename into a 500.
 */
create or replace function authz.host_photo_is_public(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_item jsonb := jsonb_build_array(jsonb_build_object('path', p_name));
begin
  begin
    v_host := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  if v_host is null then return false; end if;
  if not exists (select 1 from public.host where id = v_host and status = 'live') then
    return false;
  end if;

  return exists (
    select 1
      from public.property p
     where p.host_id = v_host
       and p.listed
       and p.deleted_at is null
       and p.photos @> v_item
       and exists (select 1 from public.unit u
                    where u.property_id = p.id and u.status = 'live'
                      and u.listed and u.archived_at is null)
  ) or exists (
    select 1
      from public.unit u
      join public.property p on p.id = u.property_id
     where u.host_id = v_host
       and u.status = 'live'
       and u.listed
       and u.archived_at is null
       and p.listed
       and u.photos @> v_item
  );
end;
$$;

comment on function authz.host_photo_is_public(text) is
  'True when the host-photos path is in the gallery of a property or unit guests can see (property_public / property_unit_public). Every other host photo stays private.';

revoke execute on function authz.host_photo_is_public(text) from public;
grant execute on function authz.host_photo_is_public(text) to anon, authenticated;

drop policy if exists host_photos_public_read on storage.objects;
create policy host_photos_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'host-photos' and authz.host_photo_is_public(name));
