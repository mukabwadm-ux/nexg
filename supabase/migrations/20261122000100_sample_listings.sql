-- Sample listings: the demonstration stays are shown, never booked.
--
-- The five properties from supabase/seeds/stays-demo-production.sql (two
-- placeholder hosts) were added so the stays design could be reviewed. Since
-- guest checkout (20261119000200) any priced unit can be held and paid for,
-- which would let a guest pay for a flat that does not exist.
--
-- property.is_sample marks them. A sample listing:
--   * still appears on /stays and the hosts page, labelled "Sample listing"
--   * is left out of rpc_stay_search, and rpc_stay_hold refuses it, so it
--     can never be held, paid for or booked
--   * gets proper names and illustrative photographs (CC0, credited in
--     apps/web/public/images/stays/CREDITS.md) instead of bracketed names and
--     placeholder tiles
-- A photo entry may now carry `src`, a path under /images/ served by the site.
-- Only sample listings use it; a real host's photos live in storage.

alter table public.property
  add column if not exists is_sample boolean not null default false;

comment on column public.property.is_sample is
  'A demonstration listing. Shown on the site, labelled as a sample, and never bookable.';

-- ═══════════════════════════════════════════════════ the five demo stays

update public.property set name = 'The Arbour', is_sample = true,
       photos = '[{"src":"/images/stays/lounge-sofa.jpg","caption":"Living area"},{"src":"/images/stays/living-room-bright.jpg","caption":"Lounge"},{"src":"/images/stays/bedroom-white.jpg","caption":"Bedroom"}]'::jsonb
 where slug = 'the-arbour-kilimani' and host_id in ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002');
update public.unit u set photos = jsonb_build_array(jsonb_build_object('src', '/images/stays/bedroom-white.jpg', 'caption', coalesce(u.photos->0->>'caption', 'Inside')))
  from public.property p where p.id = u.property_id and p.slug = 'the-arbour-kilimani' and u.name = 'Studio 7' and p.host_id in ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002');
update public.unit u set photos = jsonb_build_array(jsonb_build_object('src', '/images/stays/living-room-bright.jpg', 'caption', coalesce(u.photos->0->>'caption', 'Inside')))
  from public.property p where p.id = u.property_id and p.slug = 'the-arbour-kilimani' and u.name = 'Apartment 2A' and p.host_id in ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002');
update public.unit u set photos = jsonb_build_array(jsonb_build_object('src', '/images/stays/bedroom-curtains.jpg', 'caption', coalesce(u.photos->0->>'caption', 'Inside')))
  from public.property p where p.id = u.property_id and p.slug = 'the-arbour-kilimani' and u.name = 'Apartment 4B' and p.host_id in ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002');
update public.property set name = 'Brook House', is_sample = true,
       photos = '[{"src":"/images/stays/lounge-window.jpg","caption":"Living area"},{"src":"/images/stays/bedroom-striped.jpg","caption":"Studio"}]'::jsonb
 where slug = 'brook-house-westlands' and host_id in ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002');
update public.unit u set photos = jsonb_build_array(jsonb_build_object('src', '/images/stays/bedroom-striped.jpg', 'caption', coalesce(u.photos->0->>'caption', 'Inside')))
  from public.property p where p.id = u.property_id and p.slug = 'brook-house-westlands' and u.name = 'Studio 2' and p.host_id in ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002');
update public.unit u set photos = jsonb_build_array(jsonb_build_object('src', '/images/stays/lounge-window.jpg', 'caption', coalesce(u.photos->0->>'caption', 'Inside')))
  from public.property p where p.id = u.property_id and p.slug = 'brook-house-westlands' and u.name = 'Apartment 11' and p.host_id in ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002');
update public.property set name = 'Olive Cottage', is_sample = true,
       photos = '[{"src":"/images/stays/garden-chairs.jpg","caption":"Garden"},{"src":"/images/stays/bedroom-curtains.jpg","caption":"Bedroom"}]'::jsonb
 where slug = 'olive-cottage-karen' and host_id in ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002');
update public.unit u set photos = jsonb_build_array(jsonb_build_object('src', '/images/stays/garden-chairs.jpg', 'caption', coalesce(u.photos->0->>'caption', 'Inside')))
  from public.property p where p.id = u.property_id and p.slug = 'olive-cottage-karen' and u.name = 'The Cottage' and p.host_id in ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002');
update public.property set name = 'Lantern Lavington', is_sample = true,
       photos = '[{"src":"/images/stays/courtyard-seating.jpg","caption":"Courtyard"},{"src":"/images/stays/living-room-bright.jpg","caption":"Living room"}]'::jsonb
 where slug = 'lantern-lavington' and host_id in ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002');
update public.unit u set photos = jsonb_build_array(jsonb_build_object('src', '/images/stays/living-room-bright.jpg', 'caption', coalesce(u.photos->0->>'caption', 'Inside')))
  from public.property p where p.id = u.property_id and p.slug = 'lantern-lavington' and u.name = 'House 1' and p.host_id in ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002');
update public.unit u set photos = jsonb_build_array(jsonb_build_object('src', '/images/stays/courtyard-seating.jpg', 'caption', coalesce(u.photos->0->>'caption', 'Inside')))
  from public.property p where p.id = u.property_id and p.slug = 'lantern-lavington' and u.name = 'House 3' and p.host_id in ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002');
update public.property set name = 'The Perch', is_sample = true,
       photos = '[{"src":"/images/stays/terrace-deck.jpg","caption":"Terrace"},{"src":"/images/stays/lounge-sofa.jpg","caption":"Living area"}]'::jsonb
 where slug = 'the-perch-kileleshwa' and host_id in ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002');
update public.unit u set photos = jsonb_build_array(jsonb_build_object('src', '/images/stays/terrace-deck.jpg', 'caption', coalesce(u.photos->0->>'caption', 'Inside')))
  from public.property p where p.id = u.property_id and p.slug = 'the-perch-kileleshwa' and u.name = 'Penthouse' and p.host_id in ('11000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002');

-- ═══════════════════════════════════════════════════ what a guest sees

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
  p.is_sample
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
  p.is_sample
from public.unit u
join public.property p on p.id = u.property_id
join public.host h on h.id = u.host_id
where u.status = 'live' and u.listed and u.archived_at is null
  and p.listed and h.status = 'live';


-- ═══════════════════════════════════════════════════ never bookable

create or replace function public.rpc_stay_search(
  p_check_in date,
  p_check_out date,
  p_guests integer default 1,
  p_property_id uuid default null
)
returns table (unit_id uuid, property_id uuid, nights integer, nightly_rate_kes bigint, total_kes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_stay_dates_check(p_check_in, p_check_out);

  return query
    select u.id, u.property_id, (p_check_out - p_check_in)::integer,
           u.nightly_rate_kes::bigint,
           (u.nightly_rate_kes * (p_check_out - p_check_in))::bigint
      from public.property_unit_public u
     where not u.is_sample
       and (p_property_id is null or u.property_id = p_property_id)
       and coalesce(u.max_guests, 1) >= greatest(coalesce(p_guests, 1), 1)
       and coalesce(u.min_nights, 1) <= p_check_out - p_check_in
       and not exists (
         select 1 from public.stay s
          where s.unit_id = u.id
            and public.fn_stay_occupies(s.status, s.hold_expires_at)
            and tstzrange(s.check_in, s.check_out, '[)')
                && public.fn_stay_window(u.id, p_check_in, p_check_out))
     order by u.nightly_rate_kes nulls last, u.id;
end;
$$;


create or replace function public.rpc_stay_hold(
  p_unit_id uuid,
  p_check_in date,
  p_check_out date,
  p_guest jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_unit public.unit;
  v_nights integer := p_check_out - p_check_in;
  v_adults integer := coalesce(nullif(p_guest ->> 'adults', '')::integer, 1);
  v_children integer := coalesce(nullif(p_guest ->> 'children', '')::integer, 0);
  v_window tstzrange;
  v_stay public.stay;
begin
  if v_user is null then
    raise exception 'Sign in to hold these dates.' using errcode = '42501';
  end if;
  perform public.fn_stay_dates_check(p_check_in, p_check_out);
  if not exists (select 1 from public.property_unit_public where id = p_unit_id) then
    raise exception 'This home is not taking bookings.' using errcode = '22023';
  end if;
  if exists (select 1 from public.property_unit_public where id = p_unit_id and is_sample) then
    raise exception 'This is a sample listing that shows how stays look on NexG. It cannot be booked.'
      using errcode = '22023';
  end if;

  select * into v_unit from public.unit where id = p_unit_id for update;

  if v_unit.nightly_rate_kes is null then
    raise exception 'This home is priced on request. Send an enquiry instead.' using errcode = '22023';
  end if;
  if v_nights < coalesce(v_unit.min_nights, 1) then
    raise exception 'This home takes stays of at least % nights.', v_unit.min_nights
      using errcode = '22023';
  end if;
  if v_adults < 1 or v_children < 0 then
    raise exception 'A stay needs at least one adult.' using errcode = '22023';
  end if;
  if v_unit.max_guests is not null and v_adults + v_children > v_unit.max_guests then
    raise exception 'This home sleeps up to % guests.', v_unit.max_guests using errcode = '22023';
  end if;
  if (select count(*) from public.stay
       where guest_user_id = v_user and status = 'held' and hold_expires_at > now()) >= 2 then
    raise exception 'You already have two stays on hold. Finish or release one first.'
      using errcode = '22023';
  end if;

  perform public.fn_stay_release_expired_holds(p_unit_id);

  v_window := public.fn_stay_window(p_unit_id, p_check_in, p_check_out);
  if exists (
    select 1 from public.stay s
     where s.unit_id = p_unit_id
       and public.fn_stay_occupies(s.status, s.hold_expires_at)
       and tstzrange(s.check_in, s.check_out, '[)') && v_window
  ) then
    raise exception 'Those dates are no longer available.' using errcode = '23P01';
  end if;

  insert into public.stay (
    host_id, property_id, unit_id, guest_user_id, guest_first_name,
    party_adults, party_children, check_in, check_out, source, status,
    hold_expires_at, rate_kes, quote_total_kes)
  values (
    v_unit.host_id, v_unit.property_id, v_unit.id, v_user,
    left(nullif(trim(p_guest ->> 'first_name'), ''), 80),
    v_adults, v_children, lower(v_window), upper(v_window), 'nexg', 'held',
    now() + interval '15 minutes', v_unit.nightly_rate_kes,
    v_unit.nightly_rate_kes * v_nights)
  returning * into v_stay;

  perform audit.log('guest'::public.actor_type, 'hotels', 'stay.held',
    p_actor_id => v_user, p_target_type => 'stay', p_target_id => v_stay.id,
    p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('unit', v_unit.id, 'nights', v_nights,
                                  'total_kes', v_stay.quote_total_kes));

  return jsonb_build_object(
    'stay_id', v_stay.id, 'expires_at', v_stay.hold_expires_at,
    'check_in', v_stay.check_in, 'check_out', v_stay.check_out,
    'nights', v_nights, 'nightly_rate_kes', v_unit.nightly_rate_kes,
    'total_kes', v_stay.quote_total_kes);
end;
$$;

