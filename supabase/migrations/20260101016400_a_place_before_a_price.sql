-- A place before a price.
--
-- Almost everything a visitor sees on nexgapp.com depends on one
-- fact: where the order is going. Which merchants are in reach,
-- what delivery costs, how long it takes, whether charge-to-room
-- is available, whether we deliver there at all. Until that fact
-- exists the site is guessing, and a guess rendered confidently
-- is how somebody gets quoted a price we cannot honour.
--
-- So the place is resolved once, early, and carried everywhere.
-- This migration is the half of that which belongs in the
-- database: where a place is stored, who may read it, what
-- coverage means for a point, and the append-only record of what
-- we asked and what the visitor answered.
--
-- ─────────────────────────────────────────────────────────────
-- One thing to be clear about, because it shaped the schema.
--
-- An anonymous visitor's saved places do **not** live here. The
-- spec gives `guest_place` a nullable `device_id`, and a device
-- id is not authentication — it is a string the client sends,
-- which anyone can send. A row holding a gate code, a floor and
-- a phone number, readable by whoever claims the right id, is a
-- directory of how to get into people's homes.
--
-- So places for a signed-in guest live here under RLS, and an
-- anonymous visitor's places stay in their own browser, which is
-- what the spec's own "encrypted local storage" step describes.
-- `device_id` is kept as provenance — which device first
-- confirmed this pin — and is never an access key. On sign-in
-- the browser hands its local places over and they become rows.

-- ───────────────────────────────────────────── who is a guest

create or replace function authz.guest_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.id from public.guest g
   where g.user_id = (select auth.uid())
     and g.anonymised_at is null
$$;

comment on function authz.guest_id is
  'The signed-in guest, or null. The only key that grants access to a saved place — a device id never does, because the client supplies it.';

grant execute on function authz.guest_id() to authenticated, anon;

-- ──────────────────────────────────────────────── saved places

create table if not exists guest_place (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guest (id) on delete cascade,

  /*
   * Which device confirmed this pin. Provenance, not permission
   * — see the note at the top. It is here so that "you saved
   * this on your phone" can be said, and so a device handing
   * its places over at sign-in does not create duplicates.
   */
  device_id text,

  label text not null,
  point extensions.geography(point, 4326) not null,
  plus_code text,
  address_line text,

  /* The parts a rider actually needs, which no geocoder returns. */
  unit_no text,
  floor text,
  gate_no text,
  landmark text,
  rider_phone text,

  /*
   * How precise the fix was when it was confirmed, in metres.
   * Kept because a 2 km desktop fix and a 6 m phone fix are not
   * the same promise, and dispatch is told which it has.
   */
  accuracy_m integer,
  geocode_confidence text
    check (geocode_confidence in ('exact', 'interpolated', 'approximate', 'unknown')),

  zone_id uuid references public.zone (id) on delete set null,
  coverage text not null default 'covered'
    check (coverage in ('covered', 'outside', 'unlaunched')),

  source text not null
    check (source in ('gps', 'search', 'qr', 'deep_link', 'ip_city', 'manual')),
  consent_state_at_capture text
    check (consent_state_at_capture in ('granted', 'prompt', 'denied', 'unavailable')),

  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /* A place with no label is a pin somebody has to recognise by
     its coordinates. */
  constraint place_has_a_label check (coalesce(trim(label), '') <> '')
);

create index if not exists guest_place_guest_idx on guest_place (guest_id, last_used_at desc nulls last);
create index if not exists guest_place_point_idx on guest_place using gist (point);

comment on table guest_place is
  'Somewhere a signed-in guest has had something delivered. An anonymous visitor keeps theirs in their own browser — a device id is not authentication.';
comment on column guest_place.rider_phone is
  'Shown to the rider masked. Stored because the number to reach at the gate is often not the account number.';

alter table guest_place enable row level security;

create policy guest_place_own on guest_place
  for select to authenticated
  using (guest_id = authz.guest_id());

/* Writes go through rpc_place_confirm, which resolves the zone
   and the coverage. A direct insert could store a place with no
   zone, and a place with no zone is one checkout cannot price. */
create policy guest_place_staff on guest_place
  for select to authenticated
  using (authz.handles_guest_data());

-- ──────────────────────────────────── what we asked, and when
--
-- No coordinates in here, ever. This exists to answer product
-- questions — how many people are asked, how many allow, how
-- many skip and still order — and none of those need to know
-- where anybody was. A table that could answer them *and* locate
-- a person is a table that will eventually be asked to.

create table if not exists location_consent_event (
  id bigint generated always as identity primary key,
  session_id text not null,
  guest_id uuid references public.guest (id) on delete set null,
  surface text not null,
  action text not null check (action in (
    'shown', 'clicked_use_location', 'allowed', 'blocked',
    'dismissed', 'skipped', 'typed', 'confirmed', 'changed')),
  /* Banded, not exact: 'exact' | 'street' | 'area' | 'city'. A
     radius in metres is a weak identifier; a band is not. */
  accuracy_band text,
  step text,
  at timestamptz not null default now()
);

create index if not exists location_consent_at_idx on location_consent_event (at desc);
create index if not exists location_consent_action_idx on location_consent_event (action, at desc);

comment on table location_consent_event is
  'What the location layer asked and what the visitor answered. Deliberately holds no coordinates — it answers how often we ask and how people respond, and nothing about where they are.';

alter table location_consent_event enable row level security;

create policy location_consent_read on location_consent_event
  for select to authenticated
  using (authz.is_super_admin() or authz.handles_guest_data());

-- ────────────────────────────────────── the reverse-geocode cache
--
-- Geocoding is billed per call and the same building is looked up
-- all day. Cached by a coarse grid cell rather than by exact
-- coordinates, because two pins four metres apart are the same
-- doorway and should not be two cache misses and two charges.

create table if not exists geocode_cache (
  cell text primary key,
  address_line text,
  plus_code text,
  confidence text,
  looked_up_at timestamptz not null default now(),
  hits integer not null default 0
);

alter table geocode_cache enable row level security;
create policy geocode_cache_read on geocode_cache for select to authenticated, anon using (true);

/*
 * The grid.
 *
 * The platform spec says H3 throughout, and this is not H3 —
 * there is no h3 extension on this database and adding one to
 * key a geocode cache would be a large dependency for a small
 * job. This is a plain lat/lng rounding, named for what it is so
 * nobody later reads `cell` and assumes hexagons.
 *
 * At precision 4 a cell is roughly 11 m across at this latitude,
 * which is the right size for "same doorway". When H3 arrives
 * for the dispatch supply index, this stays as it is: the two
 * are solving different problems and sharing a grid between them
 * would couple them for no gain.
 */
create or replace function fn_geo_cell(
  p_lat double precision,
  p_lng double precision,
  p_precision integer default 4
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_lat is null or p_lng is null then null
    else round(p_lat::numeric, p_precision)::text || ','
         || round(p_lng::numeric, p_precision)::text
  end
$$;

comment on function fn_geo_cell is
  'A coarse grid key for caching. Plain lat/lng rounding, not H3 — named so that nobody reads "cell" and assumes hexagons.';

grant execute on function fn_geo_cell(double precision, double precision, integer)
  to authenticated, anon, service_role;

-- ═══════════════════════════════════════════ is this place covered
--
-- The question the chip, the sheet and checkout all ask. It
-- answers in one of three ways, and the difference between them
-- is the difference between three quite different sentences on
-- screen:
--
--   covered    — we deliver here, this zone, this window
--   outside    — we deliver in this city but not to this point,
--                and here is the nearest place we do, with the
--                real distance
--   unlaunched — the city itself is not live
--
-- The nearest covered zone is computed rather than approximated,
-- because "6 km away" is a sentence somebody plans around and
-- a wrong one wastes their evening.

create or replace function rpc_coverage_lookup(
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_point extensions.geography;
  v_zone record;
  v_near record;
  v_city record;
begin
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('coverage', 'unknown',
      'message', 'That does not look like a place on earth.');
  end if;

  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  /* Inside a live zone: the ordinary case, answered first. */
  select z.id, z.name, z.tier, z.eta_min, z.eta_max, z.cod_allowed,
         c.id as city_id, c.name as city_name, c.slug as city_slug, c.status as city_status,
         coalesce(h.paused, false) as paused, h.paused_reason
    into v_zone
    from public.zone z
    join public.city c on c.id = z.city_id
    left join dispatch.zone_health h on h.zone_id = z.id
   where z.active and extensions.st_covers(z.polygon, v_point)
   order by z.tier
   limit 1;

  if found then
    return jsonb_build_object(
      'coverage', 'covered',
      'zone_id', v_zone.id,
      'zone', v_zone.name,
      'tier', v_zone.tier,
      'eta_min', v_zone.eta_min,
      'eta_max', v_zone.eta_max,
      'cod_allowed', v_zone.cod_allowed,
      'city_id', v_zone.city_id,
      'city', v_zone.city_name,
      'city_slug', v_zone.city_slug,
      'paused', v_zone.paused,
      /* A paused zone is still covered. It is not a coverage
         problem and must not be worded as one — we deliver here,
         just not this minute, and the two call for different
         things from the visitor. */
      'message', case when v_zone.paused
        then 'Deliveries in ' || v_zone.name || ' are paused right now'
             || coalesce(' · ' || v_zone.paused_reason, '') || '.'
        else null end);
  end if;

  /* Not in a zone. Which city is this, and how far is the
     nearest place we actually serve? */
  select c.id, c.name, c.slug, c.status,
         extensions.st_distance(v_point, c.centre) as metres
    into v_city
    from public.city c
   where c.centre is not null
   /* Plain distance, not the <-> index operator: that one needs
      both sides to be geometry, and there are eleven cities. */
   order by extensions.st_distance(v_point, c.centre)
   limit 1;

  select z.id, z.name, c.name as city_name, c.slug as city_slug,
         extensions.st_distance(v_point, z.polygon) as metres
    into v_near
    from public.zone z
    join public.city c on c.id = z.city_id
   where z.active
   order by extensions.st_distance(v_point, z.polygon)
   limit 1;

  /*
   * A city on the list but not trading. Ordering is closed and
   * the page says so; it does not pretend the nearest Nairobi
   * zone is an option for somebody in Kampala.
   */
  if v_city.id is not null
     and v_city.status = 'waitlist'
     and v_city.metres < 100000 then
    return jsonb_build_object(
      'coverage', 'unlaunched',
      'city_id', v_city.id, 'city', v_city.name, 'city_slug', v_city.slug,
      'city_status', v_city.status,
      'message', v_city.name || ' is on our list, not live yet.');
  end if;

  if v_near.id is null then
    return jsonb_build_object('coverage', 'outside',
      'message', 'That is outside every area we deliver to.');
  end if;

  return jsonb_build_object(
    'coverage', 'outside',
    'nearest_zone_id', v_near.id,
    'nearest_zone', v_near.name,
    'nearest_city', v_near.city_name,
    'nearest_city_slug', v_near.city_slug,
    'nearest_km', round((v_near.metres / 1000)::numeric, 1),
    'message', 'We do not deliver there yet. Nearest covered area: '
      || v_near.name || ', ' || round((v_near.metres / 1000)::numeric, 1) || ' km away.');
end;
$$;

comment on function rpc_coverage_lookup is
  'Whether a point is covered, outside, or in a city that is not live — with the real distance to the nearest covered zone, because that number is one somebody plans around.';

revoke execute on function rpc_coverage_lookup(double precision, double precision) from public;
grant execute on function rpc_coverage_lookup(double precision, double precision)
  to anon, authenticated, service_role;

-- ═══════════════════════════════════════════════ confirming a pin

create or replace function rpc_place_confirm(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest uuid := authz.guest_id();
  v_lat double precision := (p_payload ->> 'lat')::double precision;
  v_lng double precision := (p_payload ->> 'lng')::double precision;
  v_cover jsonb;
  v_point extensions.geography;
  v_existing uuid;
  v_id uuid;
  v_label text := nullif(trim(p_payload ->> 'label'), '');
  v_accuracy integer := (p_payload ->> 'accuracy_m')::integer;
begin
  if v_lat is null or v_lng is null then
    raise exception 'A place needs a point.';
  end if;

  v_cover := public.rpc_coverage_lookup(v_lat, v_lng);
  v_point := extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography;

  /*
   * An anonymous visitor gets the resolved place back and keeps
   * it in their own browser. Nothing is written. This is the
   * same answer a signed-in guest gets, minus the row — so the
   * client has one code path and the sheet behaves identically
   * whether or not somebody has an account.
   */
  if v_guest is null then
    return jsonb_build_object(
      'ok', true, 'stored', false,
      'reason', 'Kept on this device only — sign in to use it from your phone too.',
      'place', p_payload || v_cover);
  end if;

  /*
   * Within thirty metres of one already saved, this is that
   * place being confirmed again, not a new one. Without this a
   * guest who orders home four times has four Homes and picks
   * the wrong one.
   */
  select id into v_existing
    from public.guest_place
   where guest_id = v_guest
     and extensions.st_dwithin(point, v_point, 30)
   order by last_used_at desc nulls last
   limit 1;

  if v_existing is not null then
    update public.guest_place set
      label = coalesce(v_label, label),
      point = v_point,
      plus_code = coalesce(nullif(trim(p_payload ->> 'plus_code'), ''), plus_code),
      address_line = coalesce(nullif(trim(p_payload ->> 'address_line'), ''), address_line),
      unit_no = coalesce(nullif(trim(p_payload ->> 'unit_no'), ''), unit_no),
      floor = coalesce(nullif(trim(p_payload ->> 'floor'), ''), floor),
      gate_no = coalesce(nullif(trim(p_payload ->> 'gate_no'), ''), gate_no),
      landmark = coalesce(nullif(trim(p_payload ->> 'landmark'), ''), landmark),
      rider_phone = coalesce(nullif(trim(p_payload ->> 'rider_phone'), ''), rider_phone),
      accuracy_m = coalesce(v_accuracy, accuracy_m),
      zone_id = nullif(v_cover ->> 'zone_id', '')::uuid,
      coverage = v_cover ->> 'coverage',
      last_used_at = now(),
      updated_at = now()
     where id = v_existing
    returning id into v_id;
  else
    insert into public.guest_place (
      guest_id, device_id, label, point, plus_code, address_line,
      unit_no, floor, gate_no, landmark, rider_phone,
      accuracy_m, geocode_confidence, zone_id, coverage, source,
      consent_state_at_capture, last_used_at)
    values (
      v_guest,
      nullif(trim(p_payload ->> 'device_id'), ''),
      coalesce(v_label, 'Delivery address'),
      v_point,
      nullif(trim(p_payload ->> 'plus_code'), ''),
      nullif(trim(p_payload ->> 'address_line'), ''),
      nullif(trim(p_payload ->> 'unit_no'), ''),
      nullif(trim(p_payload ->> 'floor'), ''),
      nullif(trim(p_payload ->> 'gate_no'), ''),
      nullif(trim(p_payload ->> 'landmark'), ''),
      nullif(trim(p_payload ->> 'rider_phone'), ''),
      v_accuracy,
      coalesce(nullif(p_payload ->> 'geocode_confidence', ''), 'unknown'),
      nullif(v_cover ->> 'zone_id', '')::uuid,
      v_cover ->> 'coverage',
      coalesce(nullif(p_payload ->> 'source', ''), 'search'),
      nullif(p_payload ->> 'consent_state', ''),
      now())
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'stored', true, 'id', v_id,
    'place', p_payload || v_cover);
end;
$$;

revoke execute on function rpc_place_confirm(jsonb) from public, anon;
grant execute on function rpc_place_confirm(jsonb) to authenticated;

-- ═══════════════════════════════════════════ reading and deleting

create or replace function rpc_place_list()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'label', p.label,
      'lat', extensions.st_y(p.point::extensions.geometry),
      'lng', extensions.st_x(p.point::extensions.geometry),
      'address_line', p.address_line,
      'plus_code', p.plus_code,
      'unit_no', p.unit_no, 'floor', p.floor, 'gate_no', p.gate_no,
      'landmark', p.landmark,
      'zone_id', p.zone_id,
      'zone', z.name,
      'eta_min', z.eta_min, 'eta_max', z.eta_max,
      'coverage', p.coverage,
      'accuracy_m', p.accuracy_m,
      'last_used_at', p.last_used_at,
      'source', p.source)
    order by p.last_used_at desc nulls last), '[]'::jsonb)
  from public.guest_place p
  left join public.zone z on z.id = p.zone_id
  where p.guest_id = authz.guest_id();
$$;

create or replace function rpc_place_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_guest uuid := authz.guest_id();
begin
  if v_guest is null then
    raise exception 'Sign in to manage your places.';
  end if;

  delete from public.guest_place where id = p_id and guest_id = v_guest;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That place is not yours or is already gone.');
  end if;

  /*
   * Orders keep their own snapshot of where they went, so
   * deleting a place never rewrites history — a receipt from
   * March still says where it was delivered. That is a promise
   * worth stating here, because it is the thing somebody worries
   * about before pressing delete.
   */
  return jsonb_build_object('ok', true,
    'message', 'Deleted. Past orders keep the address they were delivered to.');
end;
$$;

revoke execute on function rpc_place_list() from public, anon;
revoke execute on function rpc_place_delete(uuid) from public, anon;
grant execute on function rpc_place_list() to authenticated;
grant execute on function rpc_place_delete(uuid) to authenticated;

-- ═══════════════════════════════════════ the record of what we asked

create or replace function rpc_location_event(
  p_session text,
  p_surface text,
  p_action text,
  p_accuracy_band text default null,
  p_step text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  /* An unknown action is dropped rather than raised. This is
     analytics on a path a visitor is walking; a rename in the
     client must never surface as an error in front of them. */
  if p_action not in ('shown', 'clicked_use_location', 'allowed', 'blocked',
                      'dismissed', 'skipped', 'typed', 'confirmed', 'changed') then
    return;
  end if;

  insert into public.location_consent_event
    (session_id, guest_id, surface, action, accuracy_band, step)
  values (
    left(coalesce(nullif(trim(p_session), ''), 'anonymous'), 64),
    authz.guest_id(),
    left(coalesce(p_surface, 'unknown'), 64),
    p_action,
    nullif(p_accuracy_band, ''),
    nullif(p_step, ''));
end;
$$;

revoke execute on function rpc_location_event(text, text, text, text, text) from public;
grant execute on function rpc_location_event(text, text, text, text, text)
  to anon, authenticated;

-- ═══════════════════════════════════════════════ the resolution

/*
 * The ladder, as far as the database can walk it.
 *
 * Steps 1 and 2 (QR token, deep link) and step 4 (this device's
 * own storage) are resolved in the browser or the route handler,
 * because the database cannot see a URL or a localStorage key.
 * What it owns is step 3 — the signed-in guest's last place —
 * and turning whatever the caller ends up with into a zone, a
 * coverage answer and a chip state.
 *
 * The step used is always returned. A visitor placed by their
 * internet connection and a visitor who dropped a pin are shown
 * different sentences, and the only way the chip can be honest
 * about which it is, is to be told.
 */
create or replace function rpc_resolve_location(p_context jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_guest uuid := authz.guest_id();
  v_days integer := coalesce((p_context ->> 'recent_days')::integer, 30);
  v_place record;
  v_cover jsonb;
begin
  /* Step 3 — the signed-in guest's last place, if it is recent
     enough to still be where they are. */
  if v_guest is not null then
    select p.*, extensions.st_y(p.point::extensions.geometry) as lat,
           extensions.st_x(p.point::extensions.geometry) as lng,
           z.name as zone_name, z.eta_min, z.eta_max
      into v_place
      from public.guest_place p
      left join public.zone z on z.id = p.zone_id
     where p.guest_id = v_guest
       and (p.last_used_at is null or p.last_used_at > now() - make_interval(days => v_days))
     order by p.last_used_at desc nulls last
     limit 1;

    if found then
      return jsonb_build_object(
        'step', 'account',
        'chip_state', case when v_place.coverage = 'covered' then 'set' else 'outside' end,
        'place', jsonb_build_object(
          'id', v_place.id, 'label', v_place.label,
          'lat', v_place.lat, 'lng', v_place.lng,
          'address_line', v_place.address_line,
          'unit_no', v_place.unit_no, 'floor', v_place.floor,
          'gate_no', v_place.gate_no, 'landmark', v_place.landmark,
          'zone_id', v_place.zone_id, 'zone', v_place.zone_name,
          'eta_min', v_place.eta_min, 'eta_max', v_place.eta_max,
          'coverage', v_place.coverage,
          'accuracy_m', v_place.accuracy_m,
          'source', v_place.source));
    end if;
  end if;

  /* A point the caller already has — from a QR scan, a deep
     link, this device's storage, or the IP headers. Resolved to
     a zone here so every one of those paths gets the same
     coverage answer rather than four near-copies. */
  if (p_context ? 'lat') and (p_context ? 'lng') then
    v_cover := public.rpc_coverage_lookup(
      (p_context ->> 'lat')::double precision,
      (p_context ->> 'lng')::double precision);

    return jsonb_build_object(
      'step', coalesce(p_context ->> 'step', 'point'),
      'chip_state', case
        when (p_context ->> 'step') = 'ip_city' then 'city'
        when v_cover ->> 'coverage' = 'covered' then 'set'
        else 'outside' end,
      'place', (p_context - 'step') || v_cover);
  end if;

  /* Nothing known. Said plainly, so the client opens the sheet
     rather than inventing a city. */
  return jsonb_build_object('step', 'none', 'chip_state', 'empty', 'place', null);
end;
$$;

revoke execute on function rpc_resolve_location(jsonb) from public;
grant execute on function rpc_resolve_location(jsonb) to anon, authenticated, service_role;

comment on function rpc_resolve_location is
  'Walks as much of the resolution ladder as the database can see and always returns which step answered — because a visitor placed by their connection and one who dropped a pin need different sentences.';

-- ══════════════════════════════════════════════ and anon gets nothing
--
-- Supabase grants SELECT on every new table in `public` to
-- `anon` and `authenticated`. RLS then returns no rows to an
-- anonymous caller, which looks like the right outcome and is
-- not: an empty set is indistinguishable from "this guest has
-- saved nothing", so a policy that silently stopped matching
-- would read as a quiet month rather than as a breach.
--
-- A refusal cannot be mistaken for an answer, so these are
-- revoked outright. `guest_place` holds gate codes, floors and
-- the number to ring at the door; `location_consent_event` is
-- the record of who we asked.

revoke all on public.guest_place from anon;
revoke all on public.location_consent_event from anon;

/* The cache is lookup data with nobody's name on it — an
   address string against a grid cell. It stays readable. */
