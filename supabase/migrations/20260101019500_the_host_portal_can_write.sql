-- The host portal can write.
--
-- Everything built so far reads. A host could see their units
-- and not add one, see their cards and not generate one, see
-- bookings and not enter one. That is not a portal, it is a
-- report — and the first thing anybody tries to do in it fails.
--
-- Some of the write path already existed and had no button:
-- `rpc_qr_generate`, `rpc_qr_mark_placed`, `rpc_qr_replace`,
-- `rpc_qr_void`, `rpc_unit_upsert`. Those are reused as they
-- are. This file adds the ones that were genuinely missing, the
-- few columns they need, and the list views the new screens
-- read.
--
-- One rule throughout: a write refuses with a sentence that
-- says what to do, not with a code. The person reading it is a
-- host on a phone, not an engineer with the schema open.

-- ════════════════════════════════════════ schema additions

alter table public.property
  add column if not exists floors integer,
  /* Soft delete. A property with statements against it cannot
     be removed outright — the money has to stay answerable for
     seven years — so it leaves the host's views instead. */
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null;

create index if not exists property_live_idx
  on public.property (host_id) where deleted_at is null;

/*
 * A host's own packages, alongside the NexG catalogue.
 *
 * `host_id` null means a NexG package, visible to every host in
 * the city. Not null means one this host wrote, visible only to
 * them. A single table rather than two, because the Packages
 * page shows them in one grid and a union of two tables is a
 * union somebody eventually filters on only one side of.
 */
alter table public.welcome_package
  add column if not exists host_id uuid references public.host (id) on delete cascade,
  add column if not exists archived_at timestamptz,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

create index if not exists welcome_package_host_idx
  on public.welcome_package (host_id) where archived_at is null;

/*
 * A connected calendar.
 *
 * `url` is an iCal feed, which is a secret in the way a
 * password is not: anyone holding it can read the booking
 * dates. So it is never returned by a view — `calendar_connection_v`
 * exposes the provider, the status and when it last ran, and
 * the URL stays in the table.
 */
create table if not exists public.calendar_connection (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.host (id) on delete cascade,
  property_id uuid references public.property (id) on delete cascade,
  provider text not null check (provider in ('airbnb', 'booking_com', 'ical', 'pms_csv')),
  label text,
  url text,
  /* Which feed entry maps to which unit. A feed says "Apartment
     3" and we hold a uuid; without this the sync has to guess,
     and a guess puts a stranger's booking in somebody's room. */
  unit_map jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'ok', 'failing', 'paused')),
  last_synced_at timestamptz,
  last_error text,
  stays_created integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists calendar_connection_host_idx
  on public.calendar_connection (host_id);

/*
 * Per-user appearance, not per-host.
 *
 * Two managers of the same property can want different themes,
 * and a theme stored against the host would have one of them
 * overwrite the other every time they saved. Guest-facing pages
 * never read this.
 */
create table if not exists public.user_preference (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'nexg' check (theme in ('nexg', 'light', 'dark', 'contrast', 'custom')),
  accent text,
  sidebar text not null default 'light' check (sidebar in ('light', 'dark')),
  density text not null default 'comfortable' check (density in ('comfortable', 'compact')),
  font_size text not null default 'default' check (font_size in ('default', 'large')),
  hero_photo_path text,
  updated_at timestamptz not null default now()
);

/* Feature toggles and the notification matrix, on the host. */
alter table public.host
  add column if not exists features jsonb not null default '{}'::jsonb,
  add column if not exists notification_rules jsonb not null default '{}'::jsonb,
  add column if not exists quiet_hours jsonb,
  add column if not exists landing_headline text,
  add column if not exists landing_brand_colour text,
  add column if not exists landing_logo_path text,
  add column if not exists language text not null default 'en',
  add column if not exists time_zone text not null default 'Africa/Nairobi';

/* Photos live in storage; the row holds the path. Private, so
   every read goes through a signed URL and a photo cannot be
   found by guessing a filename. */
insert into storage.buckets (id, name, public)
values ('host-photos', 'host-photos', false)
on conflict (id) do nothing;

-- ════════════════════════════════════════════════ properties

/**
 * Create or update a property.
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
begin
  if not authz.is_host_member(p_host_id) and not authz.works_hospitality(null) then
    raise exception 'Not your property.' using errcode = 'insufficient_privilege';
  end if;

  if v_name is null then
    raise exception 'Give the property a name — it is what you and your team will look for.'
      using errcode = '22023';
  end if;

  if (p_property ->> 'lat') is not null and (p_property ->> 'lng') is not null then
    v_point := extensions.st_setsrid(
      extensions.st_makepoint((p_property ->> 'lng')::float8, (p_property ->> 'lat')::float8), 4326
    )::extensions.geography;
  end if;

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
      summary, description, check_in_from, check_out_by)
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
      nullif(p_property ->> 'check_out_by', '')::time)
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

/**
 * Replace a property's photo list in one call.
 *
 * Add, remove, reorder and set-cover are all the same write:
 * the client sends the list it wants. Four separate RPCs would
 * each need their own ordering rules, and a reorder that raced
 * an add would silently drop the added one.
 */
create or replace function public.rpc_property_photos_set(
  p_property_id uuid,
  p_photos jsonb
)
returns public.property
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property public.property;
  v_host uuid;
begin
  select host_id into v_host from public.property
   where id = p_property_id and deleted_at is null;

  if v_host is null then
    raise exception 'No such property.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_host) and not authz.works_hospitality(null) then
    raise exception 'Not your property.' using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 12 then
    raise exception 'Twelve photos is the most a property can carry. Remove one first.'
      using errcode = '22023';
  end if;

  update public.property set photos = coalesce(p_photos, '[]'::jsonb), updated_at = now()
   where id = p_property_id returning * into v_property;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'property.photo_changed',
    p_target_type => 'property', p_target_id => p_property_id,
    p_city_id => v_property.city_id,
    p_after => jsonb_build_object('count', jsonb_array_length(v_property.photos)));

  return v_property;
end;
$$;

/**
 * Remove a property, when that is a thing we can honestly do.
 *
 * Refused while anything is still hanging off it, and the
 * refusal names which thing — "cannot be deleted" with no
 * reason is the message that generates a support ticket.
 *
 * The name has to be typed back. Not theatre: this cascades to
 * units and voids their cards, and the host is usually doing it
 * on a phone with four similar names on screen.
 */
create or replace function public.rpc_property_delete(
  p_property_id uuid,
  p_confirm_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property public.property;
  v_live integer;
  v_bookings integer;
  v_unpaid integer;
begin
  select * into v_property from public.property
   where id = p_property_id and deleted_at is null;

  if v_property.id is null then
    raise exception 'No such property.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_property.host_id) then
    raise exception 'Not your property.' using errcode = 'insufficient_privilege';
  end if;
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(v_property.name)) then
    raise exception 'Type the property name exactly to confirm: %', v_property.name
      using errcode = '22023';
  end if;

  select count(*) into v_live from public.unit
   where property_id = p_property_id and status = 'live' and archived_at is null;
  if v_live > 0 then
    raise exception 'This property has % live unit(s). Pause them first — a live unit has cards in rooms that guests are still scanning.', v_live
      using errcode = '23503';
  end if;

  select count(*) into v_bookings from public.stay s
   where s.property_id = p_property_id and s.check_out >= now()
     and s.status <> 'cancelled';
  if v_bookings > 0 then
    raise exception 'There are % booking(s) here today or still to come. Those guests have the address.', v_bookings
      using errcode = '23503';
  end if;

  select count(*) into v_unpaid from public.host_invoice
   where host_id = v_property.host_id and paid_at is null;
  if v_unpaid > 0 then
    raise exception 'There is an unpaid invoice on this account. Settle it before removing a property.'
      using errcode = '23503';
  end if;

  update public.property
     set deleted_at = now(), deleted_by = (select auth.uid()), updated_at = now()
   where id = p_property_id;

  update public.unit set archived_at = now(), status = 'archived'
   where property_id = p_property_id and archived_at is null;

  update public.property_qr set voided_at = now()
   where owner_type = 'unit'
     and owner_id in (select id from public.unit where property_id = p_property_id)
     and voided_at is null;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'property.deleted',
    p_target_type => 'property', p_target_id => p_property_id,
    p_city_id => v_property.city_id,
    p_before => jsonb_build_object('name', v_property.name));

  return jsonb_build_object(
    'ok', true,
    'note', 'Removed from your account. Statements and the audit trail are kept for seven years, '
            'and the cards in those units now tell a guest the card is retired.');
end;
$$;

create or replace function public.rpc_unit_photos_set(p_unit_id uuid, p_photos jsonb)
returns public.unit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_host uuid;
begin
  select host_id into v_host from public.unit where id = p_unit_id and archived_at is null;
  if v_host is null then
    raise exception 'No such unit.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_host) and not authz.works_hospitality(null) then
    raise exception 'Not your unit.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 8 then
    raise exception 'Eight photos is the most a unit can carry.' using errcode = '22023';
  end if;

  update public.unit set photos = coalesce(p_photos, '[]'::jsonb), updated_at = now()
   where id = p_unit_id returning * into v_unit;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'unit.photo_changed',
    p_target_type => 'unit', p_target_id => p_unit_id, p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('count', jsonb_array_length(v_unit.photos)));

  return v_unit;
end;
$$;

-- ═════════════════════════════════════════════════ bookings

/**
 * Enter or amend a booking.
 *
 * The overlap check flags rather than refuses. A host who knows
 * a guest is extending into a room the calendar still shows as
 * booked needs to be able to write it down; what they must not
 * get is silence. So the row saves with `conflict_flagged` and
 * the page says so in red.
 */
create or replace function public.rpc_stay_upsert(
  p_host_id uuid,
  p_stay jsonb,
  p_stay_id uuid default null
)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_unit public.unit;
  v_in timestamptz := nullif(p_stay ->> 'check_in', '')::timestamptz;
  v_out timestamptz := nullif(p_stay ->> 'check_out', '')::timestamptz;
  v_clash boolean;
begin
  if not authz.is_host_member(p_host_id) and not authz.works_hospitality(null) then
    raise exception 'Not your booking to enter.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_unit from public.unit
   where id = nullif(p_stay ->> 'unit_id', '')::uuid
     and host_id = p_host_id and archived_at is null;
  if v_unit.id is null then
    raise exception 'Pick one of your units for this booking.' using errcode = '22023';
  end if;
  if v_in is null or v_out is null then
    raise exception 'A booking needs a check-in and a check-out.' using errcode = '22023';
  end if;
  if v_out <= v_in then
    raise exception 'Check-out has to be after check-in.' using errcode = '22023';
  end if;

  /* Overlap in the same unit, ignoring this row on an edit. */
  select exists (
    select 1 from public.stay s
     where s.unit_id = v_unit.id
       and s.status <> 'cancelled'
       and (p_stay_id is null or s.id <> p_stay_id)
       and s.check_in < v_out and s.check_out > v_in
  ) into v_clash;

  if p_stay_id is null then
    insert into public.stay (
      host_id, property_id, unit_id, guest_first_name,
      party_adults, party_children, check_in, check_out,
      source, status, conflict_flagged, phone, rate_kes)
    values (
      p_host_id, v_unit.property_id, v_unit.id,
      nullif(trim(p_stay ->> 'guest_first_name'), ''),
      coalesce(nullif(p_stay ->> 'party_adults', '')::integer, 1),
      coalesce(nullif(p_stay ->> 'party_children', '')::integer, 0),
      v_in, v_out,
      coalesce(nullif(p_stay ->> 'source', ''), 'entered'),
      'booked', v_clash,
      nullif(trim(p_stay ->> 'phone'), ''),
      nullif(p_stay ->> 'rate_kes', '')::bigint)
    returning * into v_stay;
  else
    update public.stay set
      unit_id = v_unit.id,
      property_id = v_unit.property_id,
      guest_first_name = coalesce(nullif(trim(p_stay ->> 'guest_first_name'), ''), guest_first_name),
      party_adults = coalesce(nullif(p_stay ->> 'party_adults', '')::integer, party_adults),
      party_children = coalesce(nullif(p_stay ->> 'party_children', '')::integer, party_children),
      check_in = v_in,
      check_out = v_out,
      source = coalesce(nullif(p_stay ->> 'source', ''), source),
      conflict_flagged = v_clash,
      phone = coalesce(nullif(trim(p_stay ->> 'phone'), ''), phone),
      rate_kes = coalesce(nullif(p_stay ->> 'rate_kes', '')::bigint, rate_kes)
    where id = p_stay_id and host_id = p_host_id
    returning * into v_stay;

    if v_stay.id is null then
      raise exception 'That booking is not on your account.' using errcode = '42501';
    end if;
  end if;

  perform audit.log('host_user'::public.actor_type, 'hotels',
    case when p_stay_id is null then 'stay.created' else 'stay.updated' end,
    p_target_type => 'stay', p_target_id => v_stay.id, p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('unit', v_unit.name, 'source', v_stay.source,
                                  'conflict', v_stay.conflict_flagged));

  return v_stay;
end;
$$;

create or replace function public.rpc_stay_cancel(p_stay_id uuid, p_reason text default null)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
begin
  select * into v_stay from public.stay where id = p_stay_id;
  if v_stay.id is null then
    raise exception 'No such booking.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_stay.host_id) then
    raise exception 'Not your booking.' using errcode = 'insufficient_privilege';
  end if;

  update public.stay set status = 'cancelled' where id = p_stay_id returning * into v_stay;

  /* A cancellation can clear somebody else's conflict flag, and
     leaving it set would keep a red row on the page forever. */
  update public.stay s set conflict_flagged = exists (
    select 1 from public.stay o
     where o.unit_id = s.unit_id and o.id <> s.id and o.status <> 'cancelled'
       and o.check_in < s.check_out and o.check_out > s.check_in)
   where s.unit_id = v_stay.unit_id and s.status <> 'cancelled';

  perform audit.log('host_user'::public.actor_type, 'hotels', 'stay.cancelled',
    p_target_type => 'stay', p_target_id => p_stay_id,
    p_after => jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), '')));

  return v_stay;
end;
$$;

/**
 * Connect a calendar.
 *
 * Saved as `pending`, never as `ok`. The sync worker is not
 * built yet, and a connection that reported itself healthy
 * before anything had ever read the feed would be a green tick
 * meaning nothing — the host would stop entering bookings by
 * hand and wonder where their guests went.
 */
create or replace function public.rpc_calendar_connect(p_host_id uuid, p_payload jsonb)
returns public.calendar_connection
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conn public.calendar_connection;
  v_url text := nullif(trim(p_payload ->> 'url'), '');
  v_provider text := nullif(p_payload ->> 'provider', '');
begin
  if not authz.is_host_member(p_host_id) then
    raise exception 'Not your account.' using errcode = 'insufficient_privilege';
  end if;
  if v_provider is null then
    raise exception 'Pick where the calendar comes from.' using errcode = '22023';
  end if;
  if v_provider <> 'pms_csv' and v_url is null then
    raise exception 'Paste the iCal link from Airbnb or Booking.com. It is the one ending in .ics.'
      using errcode = '22023';
  end if;
  if v_url is not null and v_url !~* '^https://' then
    raise exception 'That link has to start with https. An http feed would send your booking dates in the clear.'
      using errcode = '22023';
  end if;

  insert into public.calendar_connection (
    host_id, property_id, provider, label, url, unit_map, status, created_by)
  values (
    p_host_id,
    nullif(p_payload ->> 'property_id', '')::uuid,
    v_provider,
    nullif(trim(p_payload ->> 'label'), ''),
    v_url,
    coalesce(p_payload -> 'unit_map', '{}'::jsonb),
    'pending',
    (select auth.uid()))
  returning * into v_conn;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'calendar.connected',
    p_target_type => 'host', p_target_id => p_host_id,
    p_after => jsonb_build_object('provider', v_provider));

  /* The URL is deliberately not returned. */
  v_conn.url := null;
  return v_conn;
end;
$$;

create or replace function public.rpc_calendar_remove(p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
begin
  select host_id into v_host from public.calendar_connection where id = p_connection_id;
  if v_host is null then
    raise exception 'No such calendar.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_host) then
    raise exception 'Not your calendar.' using errcode = 'insufficient_privilege';
  end if;

  delete from public.calendar_connection where id = p_connection_id;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'calendar.removed',
    p_target_type => 'host', p_target_id => v_host);

  /* Bookings already pulled in stay. Deleting them with the
     connection would remove guests who are in the building. */
  return jsonb_build_object('ok', true,
    'note', 'Disconnected. Bookings already imported stay where they are.');
end;
$$;

-- ══════════════════════════════════════════ requests & issues

/**
 * Raise a request or an issue.
 *
 * A host raising one is the case the module was missing: until
 * now a request could only arrive from a guest or from NexG,
 * which left a host with a broken lift and nowhere to put it.
 *
 * The due time comes from the priority rules, not from the
 * caller. A client that set its own `due_at` would let one host
 * promise themselves fifteen minutes on a recommendation and
 * then read a breach that meant nothing.
 */
create or replace function public.rpc_host_request_create(p_host_id uuid, p_payload jsonb)
returns public.host_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.host_request;
  v_priority text := coalesce(nullif(p_payload ->> 'priority', ''), 'medium');
  v_minutes integer;
  v_title text := nullif(trim(p_payload ->> 'title'), '');
  v_unit uuid := nullif(p_payload ->> 'unit_id', '')::uuid;
begin
  if not authz.is_host_member(p_host_id) then
    raise exception 'Not your account.' using errcode = 'insufficient_privilege';
  end if;
  if v_title is null then
    raise exception 'Say in one line what is needed. It is the line your team and NexG will read first.'
      using errcode = '22023';
  end if;
  if v_unit is not null and not exists (
    select 1 from public.unit where id = v_unit and host_id = p_host_id and archived_at is null)
  then
    raise exception 'That unit is not on your account.' using errcode = '22023';
  end if;

  select minutes into v_minutes from public.host_priority_rule
   where host_id = p_host_id and priority = v_priority;
  v_minutes := coalesce(v_minutes,
    case v_priority when 'high' then 15 when 'medium' then 120 else 480 end);

  insert into public.host_request (
    host_id, unit_id, stay_id, kind, type, priority, title, detail,
    raised_by, owner_kind, due_at, status)
  values (
    p_host_id, v_unit,
    nullif(p_payload ->> 'stay_id', '')::uuid,
    coalesce(nullif(p_payload ->> 'kind', ''), 'request'),
    coalesce(nullif(p_payload ->> 'type', ''), 'other'),
    v_priority, v_title,
    nullif(trim(p_payload ->> 'detail'), ''),
    'host',
    /* A host raising something is asking NexG, unless they say
       they are handling it themselves. */
    coalesce(nullif(p_payload ->> 'owner_kind', ''), 'nexg_concierge'),
    now() + (v_minutes || ' minutes')::interval,
    'open')
  returning * into v_request;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'request.opened',
    p_target_type => 'host_request', p_target_id => v_request.id,
    p_after => jsonb_build_object('priority', v_priority, 'raised_by', 'host',
                                  'type', v_request.type));

  return v_request;
end;
$$;

/** Move a request along, with a note saying what changed. */
create or replace function public.rpc_host_request_update(
  p_request_id uuid,
  p_status text default null,
  p_note text default null,
  p_priority text default null
)
returns public.host_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.host_request;
  v_before text;
begin
  select * into v_request from public.host_request where id = p_request_id;
  if v_request.id is null then
    raise exception 'No such request.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_request.host_id) then
    raise exception 'Not your request.' using errcode = 'insufficient_privilege';
  end if;
  if v_request.resolved_at is not null then
    raise exception 'That one is already resolved. Raise a new request rather than reopening this.'
      using errcode = '22023';
  end if;
  v_before := v_request.status;

  update public.host_request set
    status = coalesce(nullif(p_status, ''), status),
    priority = coalesce(nullif(p_priority, ''), priority),
    detail = case
      when nullif(trim(coalesce(p_note, '')), '') is null then detail
      else coalesce(detail || E'\n\n', '') || to_char(now(), 'DD Mon HH24:MI') || ' · ' || p_note
    end
  where id = p_request_id
  returning * into v_request;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'request.updated',
    p_target_type => 'host_request', p_target_id => p_request_id,
    p_before => jsonb_build_object('status', v_before),
    p_after => jsonb_build_object('status', v_request.status));

  return v_request;
end;
$$;

/**
 * Hand a request to NexG.
 *
 * Escalating resets the clock to the high-priority window,
 * because the point of escalating is that the current one is
 * not going to be met. It does not change the priority: what
 * the guest asked for has not become more urgent, our handling
 * of it has.
 */
create or replace function public.rpc_host_request_escalate(p_request_id uuid, p_why text)
returns public.host_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.host_request;
begin
  select * into v_request from public.host_request where id = p_request_id;
  if v_request.id is null then
    raise exception 'No such request.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_request.host_id) then
    raise exception 'Not your request.' using errcode = 'insufficient_privilege';
  end if;
  if nullif(trim(coalesce(p_why, '')), '') is null then
    raise exception 'Say what you need from NexG. An escalation with no reason sits in the queue behind ones that have one.'
      using errcode = '22023';
  end if;

  update public.host_request set
    owner_kind = 'nexg_support',
    status = 'in_progress',
    due_at = now() + interval '15 minutes',
    detail = coalesce(detail || E'\n\n', '')
             || to_char(now(), 'DD Mon HH24:MI') || ' · Escalated to NexG: ' || p_why
  where id = p_request_id
  returning * into v_request;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'request.escalated',
    p_target_type => 'host_request', p_target_id => p_request_id,
    p_after => jsonb_build_object('why', p_why));

  return v_request;
end;
$$;

create or replace function public.rpc_host_request_resolve(
  p_request_id uuid,
  p_outcome text
)
returns public.host_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.host_request;
begin
  select * into v_request from public.host_request where id = p_request_id;
  if v_request.id is null then
    raise exception 'No such request.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_request.host_id) then
    raise exception 'Not your request.' using errcode = 'insufficient_privilege';
  end if;
  if v_request.resolved_at is not null then
    raise exception 'Already resolved.' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_outcome, '')), '') is null then
    raise exception 'Say what was done. The outcome is what the guest is told and what you will read in six months.'
      using errcode = '22023';
  end if;

  update public.host_request set
    status = 'resolved', resolved_at = now(), outcome = p_outcome
  where id = p_request_id
  returning * into v_request;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'request.resolved',
    p_target_type => 'host_request', p_target_id => p_request_id,
    p_after => jsonb_build_object(
      'outcome', p_outcome,
      'minutes', round(extract(epoch from (now() - v_request.created_at)) / 60)));

  return v_request;
end;
$$;

-- ══════════════════════════════════════════════════ packages

create or replace function public.rpc_host_package_upsert(
  p_host_id uuid,
  p_package jsonb,
  p_package_id uuid default null
)
returns public.welcome_package
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pkg public.welcome_package;
  v_name text := nullif(trim(p_package ->> 'name'), '');
  v_price bigint := nullif(p_package ->> 'price', '')::bigint;
begin
  if not authz.is_host_member(p_host_id) then
    raise exception 'Not your account.' using errcode = 'insufficient_privilege';
  end if;
  if v_name is null then
    raise exception 'Give the package a name your team will recognise on a busy morning.'
      using errcode = '22023';
  end if;
  if v_price is null or v_price < 0 then
    raise exception 'Set a price in whole shillings. Zero is allowed; blank is not, because a blank price bills as nothing.'
      using errcode = '22023';
  end if;

  if p_package_id is null then
    insert into public.welcome_package (
      host_id, city_id, name, description, items, price, lead_hours, status, created_by)
    values (
      p_host_id,
      (select city_id from public.host where id = p_host_id),
      v_name,
      nullif(trim(p_package ->> 'description'), ''),
      coalesce(p_package -> 'items', '[]'::jsonb),
      v_price,
      coalesce(nullif(p_package ->> 'lead_hours', '')::integer, 12),
      'live',
      (select auth.uid()))
    returning * into v_pkg;
  else
    /*
     * Scoped to this host's own packages. Without the `host_id`
     * predicate a host could edit the price of a NexG catalogue
     * package and change it for every other host in the city.
     */
    update public.welcome_package set
      name = v_name,
      description = coalesce(nullif(trim(p_package ->> 'description'), ''), description),
      items = coalesce(p_package -> 'items', items),
      price = v_price,
      lead_hours = coalesce(nullif(p_package ->> 'lead_hours', '')::integer, lead_hours)
    where id = p_package_id and host_id = p_host_id and archived_at is null
    returning * into v_pkg;

    if v_pkg.id is null then
      raise exception 'That package is not one of yours. NexG catalogue packages cannot be edited — make your own copy instead.'
        using errcode = '42501';
    end if;
  end if;

  perform audit.log('host_user'::public.actor_type, 'hotels',
    case when p_package_id is null then 'package.created' else 'package.updated' end,
    p_target_type => 'host', p_target_id => p_host_id,
    p_after => jsonb_build_object('name', v_pkg.name, 'price', v_pkg.price));

  return v_pkg;
end;
$$;

/**
 * Retire a package rather than deleting it.
 *
 * A delivered package order points at it, and those orders are
 * on invoices. Removing the row would leave a line on somebody's
 * statement describing nothing.
 */
create or replace function public.rpc_host_package_archive(p_package_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_scheduled integer;
begin
  select host_id into v_host from public.welcome_package
   where id = p_package_id and archived_at is null;
  if v_host is null then
    raise exception 'No such package, or it is already retired.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_host) then
    raise exception 'NexG catalogue packages cannot be retired from here.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_scheduled from public.package_order
   where package_id = p_package_id and status = 'scheduled';
  if v_scheduled > 0 then
    raise exception 'This package is scheduled for % upcoming check-in(s). Cancel those first.', v_scheduled
      using errcode = '23503';
  end if;

  update public.welcome_package set archived_at = now(), status = 'paused'
   where id = p_package_id;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'package.archived',
    p_target_type => 'host', p_target_id => v_host);

  return jsonb_build_object('ok', true,
    'note', 'Retired. Past orders keep their description on your statements.');
end;
$$;

create or replace function public.rpc_package_schedule(
  p_host_id uuid,
  p_unit_id uuid,
  p_package_id uuid,
  p_for_checkin_at timestamptz
)
returns public.package_order
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.package_order;
  v_lead integer;
begin
  if not authz.is_host_member(p_host_id) then
    raise exception 'Not your account.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.unit
                  where id = p_unit_id and host_id = p_host_id and archived_at is null) then
    raise exception 'That unit is not on your account.' using errcode = '22023';
  end if;

  select lead_hours into v_lead from public.welcome_package
   where id = p_package_id and archived_at is null
     and (host_id is null or host_id = p_host_id);
  if v_lead is null then
    raise exception 'That package is not available to you.' using errcode = '22023';
  end if;

  /*
   * The lead time is the real one — how long it takes to buy,
   * assemble and get into a unit across this city on a weekday.
   * Refusing now is the whole point; the alternative is telling
   * a guest at check-in.
   */
  if p_for_checkin_at < now() + (v_lead || ' hours')::interval then
    raise exception 'This package needs % hours. Pick a check-in at least that far ahead, or ask host ops whether it can be rushed.', v_lead
      using errcode = '22023';
  end if;

  insert into public.package_order (host_id, unit_id, package_id, for_checkin_at, status)
  values (p_host_id, p_unit_id, p_package_id, p_for_checkin_at, 'scheduled')
  returning * into v_order;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'package.scheduled',
    p_target_type => 'unit', p_target_id => p_unit_id,
    p_after => jsonb_build_object('package_id', p_package_id, 'for', p_for_checkin_at));

  return v_order;
end;
$$;

-- ══════════════════════════════════════════════════ referral

/**
 * Issue this host's referral code, once.
 *
 * Idempotent: calling it twice returns the same code. A code
 * that changed on a second click would invalidate the link
 * somebody had already sent to three people.
 */
create or replace function public.rpc_host_referral_link(p_host_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_name text;
begin
  if not authz.is_host_member(p_host_id) then
    raise exception 'Not your account.' using errcode = 'insufficient_privilege';
  end if;

  select referral_code, display_name into v_code, v_name
    from public.host where id = p_host_id;

  if v_code is null then
    /*
     * Built from the name so it can be read down a phone, which
     * is how most of these actually get passed on. Ambiguous
     * characters are left out: a code with an O and a 0 in it
     * gets typed wrong and the referral is lost silently.
     */
    v_code := regexp_replace(lower(coalesce(v_name, 'host')), '[^a-z]', '', 'g');
    v_code := left(nullif(v_code, ''), 8);
    v_code := coalesce(v_code, 'host') || '-'
      || left(translate(replace(gen_random_uuid()::text, '-', ''), 'o01il', 'zabcd'), 4);

    update public.host set referral_code = v_code where id = p_host_id and referral_code is null;
    select referral_code into v_code from public.host where id = p_host_id;

    perform audit.log('host_user'::public.actor_type, 'hotels', 'referral.code_issued',
      p_target_type => 'host', p_target_id => p_host_id,
      p_after => jsonb_build_object('code', v_code));
  end if;

  return jsonb_build_object(
    'code', v_code,
    'url', 'https://nexgapp.com/hosts?ref=' || v_code);
end;
$$;

-- ══════════════════════════════════════════════════ settings

create or replace function public.rpc_host_settings_update(p_host_id uuid, p_patch jsonb)
returns public.host
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host public.host;
begin
  if not authz.is_host_member(p_host_id) then
    raise exception 'Not your account.' using errcode = 'insufficient_privilege';
  end if;

  update public.host set
    display_name = coalesce(nullif(trim(p_patch ->> 'display_name'), ''), display_name),
    email = coalesce(nullif(trim(p_patch ->> 'email'), ''), email),
    language = coalesce(nullif(p_patch ->> 'language', ''), language),
    time_zone = coalesce(nullif(p_patch ->> 'time_zone', ''), time_zone),
    /* Merged, not replaced. A Features tab that posted only its
       own toggles would otherwise wipe the notification matrix
       every time somebody flipped one. */
    features = features || coalesce(p_patch -> 'features', '{}'::jsonb),
    notification_rules = notification_rules || coalesce(p_patch -> 'notification_rules', '{}'::jsonb),
    quiet_hours = case when p_patch ? 'quiet_hours' then p_patch -> 'quiet_hours' else quiet_hours end,
    landing_headline = coalesce(nullif(trim(p_patch ->> 'landing_headline'), ''), landing_headline),
    landing_brand_colour = coalesce(nullif(trim(p_patch ->> 'landing_brand_colour'), ''), landing_brand_colour),
    updated_at = now()
  where id = p_host_id
  returning * into v_host;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.settings_changed',
    p_target_type => 'host', p_target_id => p_host_id,
    p_after => jsonb_build_object('keys', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));

  return v_host;
end;
$$;

/**
 * Appearance, per user.
 *
 * The contrast check is in the database rather than the form
 * because it is the rule, not a hint: an accent below 4.5:1
 * against white text is unreadable for somebody, and a second
 * client would otherwise have to remember to re-implement it.
 */
create or replace function public.rpc_user_theme_set(p_theme jsonb)
returns public.user_preference
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pref public.user_preference;
  v_accent text := nullif(trim(p_theme ->> 'accent'), '');
  v_r numeric; v_g numeric; v_b numeric; v_lum numeric; v_ratio numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;

  if v_accent is not null then
    if v_accent !~* '^#[0-9a-f]{6}$' then
      raise exception 'An accent colour looks like #1F3A5F — six characters after the hash.'
        using errcode = '22023';
    end if;

    /* Relative luminance, then the ratio against white text. */
    v_r := ('x' || substr(v_accent, 2, 2))::bit(8)::int / 255.0;
    v_g := ('x' || substr(v_accent, 4, 2))::bit(8)::int / 255.0;
    v_b := ('x' || substr(v_accent, 6, 2))::bit(8)::int / 255.0;
    v_r := case when v_r <= 0.03928 then v_r / 12.92 else power((v_r + 0.055) / 1.055, 2.4) end;
    v_g := case when v_g <= 0.03928 then v_g / 12.92 else power((v_g + 0.055) / 1.055, 2.4) end;
    v_b := case when v_b <= 0.03928 then v_b / 12.92 else power((v_b + 0.055) / 1.055, 2.4) end;
    v_lum := 0.2126 * v_r + 0.7152 * v_g + 0.0722 * v_b;
    v_ratio := 1.05 / (v_lum + 0.05);

    if v_ratio < 4.5 then
      raise exception 'That colour is too light for white text on it (% to 1, and 4.5 is the floor). Pick a darker shade.',
        round(v_ratio, 1) using errcode = '22023';
    end if;
  end if;

  insert into public.user_preference (user_id, theme, accent, sidebar, density, font_size, updated_at)
  values (
    (select auth.uid()),
    coalesce(nullif(p_theme ->> 'theme', ''), 'nexg'),
    v_accent,
    coalesce(nullif(p_theme ->> 'sidebar', ''), 'light'),
    coalesce(nullif(p_theme ->> 'density', ''), 'comfortable'),
    coalesce(nullif(p_theme ->> 'font_size', ''), 'default'),
    now())
  on conflict (user_id) do update set
    theme = excluded.theme,
    accent = excluded.accent,
    sidebar = excluded.sidebar,
    density = excluded.density,
    font_size = excluded.font_size,
    updated_at = now()
  returning * into v_pref;

  return v_pref;
end;
$$;

-- ════════════════════════════════════════════════════ policies

alter table public.calendar_connection enable row level security;
alter table public.user_preference enable row level security;

/* The URL column is readable by the host's own people through
   the table, which is why the page reads the view instead. */
drop policy if exists calendar_connection_read on public.calendar_connection;
create policy calendar_connection_read on public.calendar_connection
  for select to authenticated using (authz.is_host_member(host_id));

drop policy if exists user_preference_self on public.user_preference;
create policy user_preference_self on public.user_preference
  for select to authenticated using (user_id = (select auth.uid()));

-- ═══════════════════════════════════════════════════════ views

create or replace view calendar_connection_v
with (security_invoker = true) as
select
  c.id,
  c.host_id,
  c.property_id,
  p.name as property_name,
  c.provider,
  c.label,
  c.status,
  c.last_synced_at,
  c.last_error,
  c.stays_created,
  c.created_at,
  /* Never the URL. It is a feed anybody holding it can read. */
  c.url is not null as has_url
from public.calendar_connection c
left join public.property p on p.id = c.property_id;

/**
 * The property list, with everything its card shows.
 *
 * Definer for the order count, the same reason as the delivery
 * view: a host cannot read `public.order`, so an invoker view
 * would put a zero on every card.
 */
create or replace view host_property_list_v
with (security_invoker = false) as
select
  p.id,
  p.host_id,
  p.name,
  p.slug,
  p.kind::text as kind,
  p.area,
  p.listed,
  p.floors,
  p.check_in_from,
  p.check_out_by,
  p.photos,
  p.created_at,
  coalesce(u.units, 0) as units,
  coalesce(u.live, 0) as units_live,
  coalesce(u.setup, 0) as units_setup,
  coalesce(s.in_house, 0) as in_house,
  coalesce(q.placed, 0) as qr_placed,
  coalesce(q.cards, 0) as qr_cards,
  coalesce(o.orders_30d, 0) as orders_30d,
  r.rating
from public.property p
left join lateral (
  select count(*) as units,
         count(*) filter (where status = 'live') as live,
         count(*) filter (where status = 'setting_up') as setup
  from public.unit where property_id = p.id and archived_at is null
) u on true
left join lateral (
  select count(*) as in_house from public.stay
   where property_id = p.id and status <> 'cancelled'
     and now() >= check_in and now() < check_out
) s on true
left join lateral (
  select count(*) as cards,
         count(*) filter (where state = 'placed') as placed
  from public.property_qr
   where owner_type = 'unit' and voided_at is null
     and owner_id in (select id from public.unit where property_id = p.id)
) q on true
left join lateral (
  select count(*) as orders_30d
  from public.qr_scan sc join public."order" ord on ord.qr_scan_id = sc.id
   where sc.owner_id in (select id from public.unit where property_id = p.id)
     and ord.placed_at > now() - interval '30 days'
) o on true
left join lateral (
  select round(avg(sr.rating), 1) as rating
  from public.stay st join public.stay_review sr on sr.stay_id = st.id
   where st.property_id = p.id
) r on true
where p.deleted_at is null
  and authz.is_host_member(p.host_id);

/**
 * The unit list, as the three views of it need it.
 *
 * Card, list and tile are the same rows laid out differently,
 * so they read one view. Three queries would be three places
 * for "occupied" to come to mean something slightly different.
 */
create or replace view host_unit_list_v
with (security_invoker = false) as
select
  u.id,
  u.host_id,
  u.property_id,
  pr.name as property_name,
  u.name,
  u.label_public,
  u.status::text as status,
  u.floor,
  u.bedrooms,
  u.bathrooms,
  u.max_guests,
  u.unit_amenities,
  u.photos,
  u.handoff::text as handoff,
  u.delivery_hours,
  u.caretaker_name,
  u.caretaker_confirmed_at,
  u.readiness,
  u.nightly_rate_kes,
  now_stay.guest_first_name as guest_now,
  now_stay.check_out as guest_out,
  now_stay.party_adults as guest_adults,
  now_stay.party_children as guest_children,
  now_stay.source as guest_source,
  next_stay.check_in as next_check_in,
  next_stay.guest_first_name as next_guest,
  coalesce(q.cards, 0) as qr_cards,
  coalesce(q.placed, 0) as qr_placed,
  coalesce(o.orders_30d, 0) as orders_30d,
  (now_stay.id is not null) as occupied,
  /* Departing is a separate state from occupied because the two
     need different things from a host today: one needs nothing,
     the other needs cleaning booked. */
  (now_stay.id is not null and now_stay.check_out::date = (now() at time zone 'Africa/Nairobi')::date)
    as departing_today
from public.unit u
left join public.property pr on pr.id = u.property_id
left join lateral (
  select s.* from public.stay s
   where s.unit_id = u.id and s.status <> 'cancelled'
     and now() >= s.check_in and now() < s.check_out
   order by s.check_in desc limit 1
) now_stay on true
left join lateral (
  select s.* from public.stay s
   where s.unit_id = u.id and s.status <> 'cancelled' and s.check_in > now()
   order by s.check_in limit 1
) next_stay on true
left join lateral (
  select count(*) as cards, count(*) filter (where state = 'placed') as placed
  from public.property_qr
   where owner_type = 'unit' and owner_id = u.id and voided_at is null
) q on true
left join lateral (
  select count(*) as orders_30d
  from public.qr_scan sc join public."order" ord on ord.qr_scan_id = sc.id
   where sc.owner_id = u.id and ord.placed_at > now() - interval '30 days'
) o on true
where u.archived_at is null
  and authz.is_host_member(u.host_id);

/** Every card, with what it has actually done. */
create or replace view host_qr_list_v
with (security_invoker = false) as
select
  q.id,
  q.host_id,
  q.code,
  q.owner_id as unit_id,
  u.name as unit_name,
  pr.name as property_name,
  q.placement::text as spot,
  q.label,
  q.state::text as state,
  q.generated_at,
  q.placed_confirmed_at,
  q.voided_at,
  coalesce(sc.scans_30d, 0) as scans_30d,
  coalesce(sc.orders, 0) as orders,
  sc.last_scan_at,
  case
    when q.voided_at is not null then 'voided'
    when q.placed_confirmed_at is not null then 'placed'
    else 'generated'
  end as status
from public.property_qr q
left join public.unit u on u.id = q.owner_id and q.owner_type = 'unit'
left join public.property pr on pr.id = u.property_id
left join lateral (
  select count(*) filter (where s.scanned_at > now() - interval '30 days'
                            and not s.is_bot and not s.is_test) as scans_30d,
         count(o.id) as orders,
         max(s.scanned_at) as last_scan_at
  from public.qr_scan s left join public."order" o on o.qr_scan_id = s.id
   where s.qr_id = q.id
) sc on true
where authz.is_host_member(q.host_id);

/** What the Settings page reads, including this user's theme. */
create or replace view host_settings_v
with (security_invoker = true) as
select
  h.id as host_id,
  h.display_name,
  h.contact_name,
  h.email,
  h.language,
  h.time_zone,
  h.city_id,
  c.name as city_name,
  h.features,
  h.notification_rules,
  h.quiet_hours,
  h.landing_headline,
  h.landing_brand_colour,
  h.landing_logo_path,
  h.billing_method,
  h.referral_code,
  h.packages_enabled,
  h.default_handoff::text as default_handoff,
  h.status::text as status,
  h.tier::text as tier
from public.host h
left join public.city c on c.id = h.city_id;

create or replace view user_theme_v
with (security_invoker = true) as
select p.user_id, p.theme, p.accent, p.sidebar, p.density, p.font_size, p.updated_at
from public.user_preference p;

-- ══════════════════════════════════════════════════════ grants

grant select on
  calendar_connection_v, host_property_list_v, host_unit_list_v,
  host_qr_list_v, host_settings_v, user_theme_v
to authenticated;

grant select on public.calendar_connection, public.user_preference to authenticated;

/* The definer three, same reasoning as the earlier set: with no
   RLS behind them the predicate is the only boundary, so the
   default grant to anon comes off. */
revoke all on host_property_list_v, host_unit_list_v, host_qr_list_v from anon;
revoke insert, update, delete, truncate on
  host_property_list_v, host_unit_list_v, host_qr_list_v,
  calendar_connection_v, host_settings_v, user_theme_v
from authenticated;

/*
 * Revoked from PUBLIC first, then granted.
 *
 * Postgres grants EXECUTE on a new function to PUBLIC, which
 * includes anon. Every one of these is SECURITY DEFINER and
 * writes, so the grant alone would leave eighteen definer
 * functions callable by a signed-out stranger. Their membership
 * checks would refuse them — `is_host_member` needs an
 * `auth.uid` — but a write path whose only defence is one
 * predicate is one edit away from being open, and the wiring
 * check is right to refuse to ship it.
 */
revoke execute on function
  public.rpc_property_upsert(uuid, jsonb, uuid),
  public.rpc_property_photos_set(uuid, jsonb),
  public.rpc_property_delete(uuid, text),
  public.rpc_unit_photos_set(uuid, jsonb),
  public.rpc_stay_upsert(uuid, jsonb, uuid),
  public.rpc_stay_cancel(uuid, text),
  public.rpc_calendar_connect(uuid, jsonb),
  public.rpc_calendar_remove(uuid),
  public.rpc_host_request_create(uuid, jsonb),
  public.rpc_host_request_update(uuid, text, text, text),
  public.rpc_host_request_escalate(uuid, text),
  public.rpc_host_request_resolve(uuid, text),
  public.rpc_host_package_upsert(uuid, jsonb, uuid),
  public.rpc_host_package_archive(uuid),
  public.rpc_package_schedule(uuid, uuid, uuid, timestamptz),
  public.rpc_host_referral_link(uuid),
  public.rpc_host_settings_update(uuid, jsonb),
  public.rpc_user_theme_set(jsonb)
from public, anon;

grant execute on function
  public.rpc_property_upsert(uuid, jsonb, uuid),
  public.rpc_property_photos_set(uuid, jsonb),
  public.rpc_property_delete(uuid, text),
  public.rpc_unit_photos_set(uuid, jsonb),
  public.rpc_stay_upsert(uuid, jsonb, uuid),
  public.rpc_stay_cancel(uuid, text),
  public.rpc_calendar_connect(uuid, jsonb),
  public.rpc_calendar_remove(uuid),
  public.rpc_host_request_create(uuid, jsonb),
  public.rpc_host_request_update(uuid, text, text, text),
  public.rpc_host_request_escalate(uuid, text),
  public.rpc_host_request_resolve(uuid, text),
  public.rpc_host_package_upsert(uuid, jsonb, uuid),
  public.rpc_host_package_archive(uuid),
  public.rpc_package_schedule(uuid, uuid, uuid, timestamptz),
  public.rpc_host_referral_link(uuid),
  public.rpc_host_settings_update(uuid, jsonb),
  public.rpc_user_theme_set(jsonb)
to authenticated;

/*
 * One exemption, recorded rather than assumed.
 *
 * `rpc_user_theme_set` writes a row, so the wiring check flags
 * it like any other state change — correctly, because the check
 * cannot know what the row means. A theme is a personal display
 * preference on the person's own login: there is no second
 * party to be accountable to, and an audit line every time
 * somebody tries a darker sidebar is volume that makes the real
 * entries harder to find. The row itself carries who and when.
 */
insert into wiring_audit_exempt (function_name, reason, recorded_in)
values (
  'rpc_user_theme_set',
  'A personal display preference on the caller''s own login, with no second party to answer to',
  'user_preference.user_id and updated_at')
on conflict (function_name) do nothing;

/*
 * The same for a unit.
 *
 * `rpc_unit_upsert` predates this file and is left alone other
 * than wrapping the one message a host actually hits. A raw
 * `duplicate key value violates unique constraint
 * "unit_host_id_name_key"` reads as a broken site rather than
 * as two flats both called B0903.
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
  v_name text := nullif(trim(p_unit ->> 'name'), '');
begin
  if p_unit_id is null and v_name is not null and exists (
    select 1 from public.unit
     where host_id = p_host_id and name = v_name and archived_at is null)
  then
    raise exception 'You already have a unit called %. Two with one name is how a delivery reaches the wrong door.', v_name
      using errcode = '23505';
  end if;

  return public.rpc_unit_upsert(p_host_id, p_unit, p_unit_id);
end;
$$;

revoke execute on function public.rpc_unit_upsert_guarded(uuid, jsonb, uuid) from public, anon;
grant execute on function public.rpc_unit_upsert_guarded(uuid, jsonb, uuid) to authenticated;

insert into wiring_audit_exempt (function_name, reason, recorded_in)
values (
  'rpc_unit_upsert_guarded',
  'A name check in front of rpc_unit_upsert, which writes the row and logs it',
  'audit entry unit.saved, written by rpc_unit_upsert')
on conflict (function_name) do nothing;
