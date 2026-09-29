-- Local fixtures for Customize Your Experience.
--
-- Runs only on `supabase db reset`. Never production: the hosted catalogue
-- fills up through the console as real partners are signed, and a seeded
-- price there would be a number nobody agreed to.
--
-- Partner names are bracketed the way the artboards bracket them —
-- `[partner]`, `[venue]` — because none of these suppliers exist and a
-- screenshot of this must never read as a signed contract. The prices are
-- here because the whole feature is a budget fitting itself to a day: with
-- null prices the allocator has nothing to weigh and neither the bar nor a
-- single test means anything. They are local-only for exactly that reason.

-- ───────────────────────────────────────────────────────── partners

insert into public.experience_partner
  (id, name, kind, contact_name, contact_phone, contact_email, city_id, status,
   went_live_at, terms, can_answer_holds, preferred_channel)
select
  d.id::uuid, d.name, d.kind::public.experience_partner_kind, d.contact,
  d.phone, d.email, (select id from public.city where slug = 'nairobi'),
  'live', now() - interval '30 days',
  jsonb_build_object('cancellation_hours', d.cancel, 'deposit_pct', 0,
                     'capacity_note', d.capacity),
  d.portal, d.channel
from (values
  ('00000000-0000-4000-8000-0000000e0001', '[Operator · parks & wildlife]', 'operator',
   '[Contact]', '+254700000101', 'parks@example.test', 24, 'Two vehicles daily', true, 'portal'),
  ('00000000-0000-4000-8000-0000000e0002', '[Grill · Karen]', 'venue',
   '[Contact]', '+254700000102', 'karen@example.test', 4, 'Tables to 40', false, 'whatsapp'),
  ('00000000-0000-4000-8000-0000000e0003', '[Rooftop · Westlands]', 'venue',
   '[Contact]', '+254700000103', 'rooftop@example.test', 6, 'Band Thu–Sat', false, 'whatsapp'),
  ('00000000-0000-4000-8000-0000000e0004', '[Driver company]', 'driver',
   '[Contact]', '+254700000104', 'drivers@example.test', 12, 'Six cars', true, 'portal'),
  ('00000000-0000-4000-8000-0000000e0005', '[Spa · Kilimani]', 'venue',
   '[Contact]', '+254700000105', 'spa@example.test', 24, 'Four rooms', false, 'phone'),
  ('00000000-0000-4000-8000-0000000e0006', '[Boutique hotel]', 'host',
   '[Contact]', '+254700000106', 'stay@example.test', 48, 'Eight rooms', false, 'email'),
  ('00000000-0000-4000-8000-0000000e0007', '[Events organiser]', 'organiser',
   '[Contact]', '+254700000107', 'events@example.test', 72, 'Varies', true, 'portal')
) as d(id, name, kind, contact, phone, email, cancel, capacity, portal, channel)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────── components
--
-- Titles are verbatim from the X2 builder artboard where it names one.
-- `swap_group` is `<slot>_<mood>`: everything in a group is an alternative
-- for the same part of the day, and `tier` is what the allocator moves up
-- and down to fit the budget.

insert into public.experience_component
  (partner_id, city_id, kind, mood, title, subtitle, duration_min, default_slot,
   earliest_start, latest_start, price_kes, price_basis, party_types,
   pay_on_day, tags, tier, swap_group, status, booking_lead_hours, location, sort)
select
  d.partner::uuid, (select id from public.city where slug = 'nairobi'),
  d.kind::public.block_kind, d.mood::public.mood, d.title, d.subtitle,
  d.mins, d.slot::public.block_slot, d.earliest::time, d.latest::time,
  d.price, d.basis::public.price_basis, d.parties::text[],
  d.pod::jsonb, d.tags::text[], d.tier, d.grp, 'live', d.lead,
  extensions.st_setsrid(extensions.st_makepoint(d.lng, d.lat), 4326)::extensions.geography,
  d.tier
from (values
  -- ── Wild · the morning
  ('00000000-0000-4000-8000-0000000e0001', 'activity', 'wild',
   'Karura Forest · morning walk', 'Guided, 2 h · waterfall and caves',
   120, 'early', '06:00', '10:00', 1200, 'per_person',
   '{solo,couple,family,group}', '[]', '{kid_friendly,wheelchair}', 1, 'early_wild', 2,
   36.8340, -1.2360),
  ('00000000-0000-4000-8000-0000000e0001', 'activity', 'wild',
   'Giraffe Centre · morning', 'Feeding platform, 90 min',
   90, 'early', '06:30', '10:30', 2200, 'per_person',
   '{solo,couple,family,group}', '[]', '{kid_friendly}', 2, 'early_wild', 4,
   36.7450, -1.3750),
  ('00000000-0000-4000-8000-0000000e0001', 'activity', 'wild',
   'Elephant orphanage · feeding hour', 'One hour · fixed visiting window',
   60, 'morning', '10:30', '11:00', 3500, 'per_person',
   '{solo,couple,family,group}', '[]', '{kid_friendly}', 3, 'early_wild', 12,
   36.7530, -1.3520),
  ('00000000-0000-4000-8000-0000000e0001', 'activity', 'wild',
   'Nairobi National Park · sunrise drive', 'Private car, 4 h · park fees shown separately',
   240, 'early', '06:00', '07:30', 7500, 'per_person',
   '{solo,couple,family,group}',
   '[{"label":"KWS park fees · per adult","amount":4500,"note":"paid at the gate · not marked up"}]',
   '{}', 4, 'early_wild', 24, 36.8580, -1.3630),

  -- ── Taste · midday
  ('00000000-0000-4000-8000-0000000e0002', 'meal', 'taste',
   'Street food tour · downtown', 'Walking, 2 h · six stops',
   120, 'midday', '11:30', '14:30', 1800, 'per_person',
   '{solo,couple,family,group}', '[]', '{halal_available}', 1, 'midday_taste', 24,
   36.8220, -1.2840),
  ('00000000-0000-4000-8000-0000000e0002', 'meal', 'taste',
   'Nyama choma at [partner] · Karen', 'Table held · halal available',
   120, 'midday', '12:00', '15:00', 3200, 'per_person',
   '{solo,couple,family,group}', '[]', '{halal_available,kid_friendly}', 2, 'midday_taste', 4,
   36.7060, -1.3190),
  ('00000000-0000-4000-8000-0000000e0002', 'meal', 'taste',
   'Swahili coastal at [partner]', 'Table held · coastal menu',
   120, 'midday', '12:00', '15:00', 4200, 'per_person',
   '{solo,couple,family,group}', '[]', '{halal_available}', 3, 'midday_taste', 6,
   36.8000, -1.2680),
  ('00000000-0000-4000-8000-0000000e0002', 'meal', 'taste',
   'Fine dining · tasting menu', 'Seven courses · 2.5 h',
   150, 'midday', '12:30', '14:00', 9500, 'per_person',
   '{solo,couple,group}', '[]', '{}', 5, 'midday_taste', 48, 36.8100, -1.2700),

  -- ── Taste · the evening sitting
  ('00000000-0000-4000-8000-0000000e0002', 'meal', 'taste',
   'Street food on the way', 'Quick, on the route to the venue',
   45, 'evening', '17:30', '20:00', 900, 'per_person',
   '{solo,couple,family,group}', '[]', '{halal_available}', 1, 'evening_taste', 2,
   36.8120, -1.2750),
  ('00000000-0000-4000-8000-0000000e0002', 'meal', 'taste',
   'Early dinner near the venue · [partner]', 'Table held',
   90, 'evening', '17:30', '20:30', 3800, 'per_person',
   '{solo,couple,family,group}', '[]', '{halal_available}', 3, 'evening_taste', 4,
   36.8070, -1.2660),
  ('00000000-0000-4000-8000-0000000e0002', 'meal', 'taste',
   'Chef''s table · [partner]', 'Counter seating · 2 h',
   120, 'evening', '18:00', '20:00', 11000, 'per_person',
   '{solo,couple}', '[]', '{}', 5, 'evening_taste', 72, 36.8040, -1.2690),

  -- ── Night
  ('00000000-0000-4000-8000-0000000e0003', 'venue', 'night',
   'Quiet cocktail bar', 'Seats held · conversation volume',
   120, 'night', '20:00', '23:00', 2500, 'per_person',
   '{solo,couple,group}', '[]', '{}', 1, 'night_night', 4, 36.8090, -1.2670),
  ('00000000-0000-4000-8000-0000000e0003', 'venue', 'night',
   'Rooftop · live band', 'Table on the terrace · band from 21:00',
   180, 'night', '20:00', '22:30', 4500, 'per_person',
   '{solo,couple,group}', '[]', '{}', 3, 'night_night', 6, 36.8050, -1.2640),
  ('00000000-0000-4000-8000-0000000e0003', 'venue', 'night',
   'Club with a host', 'Entry, a host and a table',
   240, 'night', '21:30', '23:59', 6500, 'per_person',
   '{couple,group}', '[]', '{}', 4, 'night_night', 12, 36.8030, -1.2690),

  -- ── Slow · the afternoon
  ('00000000-0000-4000-8000-0000000e0005', 'activity', 'slow',
   'Long breakfast · [partner]', 'No rush · 2 h',
   120, 'afternoon', '09:00', '12:00', 1800, 'per_person',
   '{solo,couple,family,group}', '[]', '{kid_friendly}', 1, 'afternoon_slow', 2,
   36.7880, -1.2920),
  ('00000000-0000-4000-8000-0000000e0005', 'activity', 'slow',
   'Coffee farm tour', 'Estate walk and a cupping, 3 h',
   180, 'afternoon', '13:00', '16:00', 2800, 'per_person',
   '{solo,couple,family,group}', '[]', '{kid_friendly}', 2, 'afternoon_slow', 24,
   36.7200, -1.2200),
  ('00000000-0000-4000-8000-0000000e0005', 'activity', 'slow',
   'Pool day · [partner]', 'Loungers and a towel, until 18:00',
   240, 'afternoon', '11:00', '15:00', 3500, 'per_person',
   '{solo,couple,family,group}', '[]', '{kid_friendly,wheelchair}', 3, 'afternoon_slow', 4,
   36.7920, -1.2880),
  ('00000000-0000-4000-8000-0000000e0005', 'activity', 'slow',
   'Spa · two hours', 'Massage and steam · booked per person',
   120, 'afternoon', '10:00', '17:00', 6500, 'per_person',
   '{solo,couple}', '[]', '{wheelchair}', 4, 'afternoon_slow', 24, 36.7860, -1.2930),

  -- ── Stay
  ('00000000-0000-4000-8000-0000000e0006', 'stay', 'stay',
   'Airbnb · one night', 'Whole place · self check-in',
   600, 'late', null, null, 8000, 'per_night',
   '{solo,couple,family,group}', '[]', '{}', 2, 'late_stay', 24, 36.7830, -1.2900),
  ('00000000-0000-4000-8000-0000000e0006', 'stay', 'stay',
   'Boutique hotel · one night', 'Double room · breakfast included',
   600, 'late', null, null, 12000, 'per_night',
   '{solo,couple,family,group}', '[]', '{wheelchair}', 3, 'late_stay', 24,
   36.8010, -1.2720),

  -- ── Getting around
  ('00000000-0000-4000-8000-0000000e0004', 'transport', 'slow',
   'Driver for the day', 'Toyota Fielder or similar · with you until midnight',
   900, 'morning', '06:00', '12:00', 6500, 'per_vehicle',
   '{solo,couple,family,group}', '[]', '{}', 3, 'day_driver', 12, 36.8100, -1.2860),
  ('00000000-0000-4000-8000-0000000e0004', 'transport', 'slow',
   'Driver for the day · executive', 'Saloon car and a suited driver',
   900, 'morning', '06:00', '12:00', 12000, 'per_vehicle',
   '{solo,couple,group}', '[]', '{}', 5, 'day_driver', 24, 36.8100, -1.2860)
) as d(partner, kind, mood, title, subtitle, mins, slot, earliest, latest,
       price, basis, parties, pod, tags, tier, grp, lead, lng, lat)
where not exists (
  select 1 from public.experience_component c where c.title = d.title
);

-- ──────────────────────────────────────────────────────── events
--
-- Dated relative to the reset so they are always in the future. The
-- artboard brackets the dates, which is what an unset date looks like;
-- these have real ones because an event without a date cannot anchor a day.

insert into public.event
  (city_id, name, category, venue_name, venue_address, starts_at, ends_at, doors_at,
   organiser_name, ticket_bands, nexg_can_hold_tickets, ticket_partner_id,
   practical_note, status, featured, anchor_slot, suggested_blocks, source,
   published_by, published_at, venue_point)
select
  (select id from public.city where slug = 'nairobi'),
  d.name, d.cat::public.event_category, d.venue, d.addr,
  /*
   * Built as local wall time and then converted, not added to a
   * timestamptz. `(date)::timestamptz + '21:00'` is 21:00 UTC, which is
   * midnight in Nairobi — the whole evening lands three hours late and
   * every anchored block moves with it.
   */
  ((current_date + d.days)::timestamp + d.start_h::interval) at time zone 'Africa/Nairobi',
  /* A club finishing at 02:00 finishes tomorrow. */
  ((current_date + d.days
      + case when d.end_h::interval < d.start_h::interval then 1 else 0 end)::timestamp
    + d.end_h::interval) at time zone 'Africa/Nairobi',
  ((current_date + d.days)::timestamp + d.doors_h::interval) at time zone 'Africa/Nairobi',
  d.organiser, d.bands::jsonb, d.hold,
  case when d.hold then '00000000-0000-4000-8000-0000000e0007'::uuid else null end,
  d.note, d.status::public.event_status, d.featured, d.anchor::public.block_slot,
  d.suggested::jsonb, 'manual',
  case when d.status = 'published'
       then (select id from public.staff_user where email = 'dev.admin@nexgapp.com') end,
  case when d.status = 'published' then now() end,
  extensions.st_setsrid(extensions.st_makepoint(d.lng, d.lat), 4326)::extensions.geography
from (values
  ('RnB House', 'music', '[venue]', 'Westlands, Nairobi', 12, '21:00', '02:00', '20:30',
   '[Events organiser]',
   '[{"label":"Regular","price_kes":3500,"currency":"KES"},{"label":"VIP","price_kes":8000,"currency":"KES"}]',
   true, 'Parking fills by 21:00 — the driver drops at the door', 'published', true, 'night',
   '[{"kind":"meal","mood":"taste","slot":"evening","title":"Dinner first","swap_group":"evening_taste"}]',
   36.8050, -1.2640),
  ('Nairobi Marathon', 'sport', '[venue]', 'Nyayo Stadium, Nairobi', 26, '06:00', '12:00', '05:00',
   '[Events organiser]', '[{"label":"10 km","price_kes":2000,"currency":"KES"}]',
   false, 'Road closures from 05:00 across the CBD', 'published', true, 'early',
   '[{"kind":"meal","mood":"taste","slot":"midday","title":"Late breakfast after","swap_group":"midday_taste"}]',
   36.8250, -1.3050),
  ('Restaurant Week', 'food_drink', '[venue]', 'Across Nairobi', 19, '12:00', '22:00', null,
   '[Events organiser]', '[]', false, 'Set menus at participating restaurants',
   'published', false, 'evening',
   '[{"kind":"meal","mood":"taste","slot":"evening","title":"Book a sitting","swap_group":"evening_taste"}]',
   36.8100, -1.2800),
  ('Rugby sevens · [venue]', 'sport', '[venue]', 'Ngong Road, Nairobi', 33, '10:00', '18:00', '09:00',
   '[Events organiser]', '[{"label":"Terrace","price_kes":1500,"currency":"KES"}]',
   true, 'Bring sun cover — the terrace is open', 'draft', false, 'midday', '[]',
   36.7700, -1.3000)
) as d(name, cat, venue, addr, days, start_h, end_h, doors_h, organiser, bands,
       hold, note, status, featured, anchor, suggested, lng, lat)
where not exists (select 1 from public.event e where e.name = d.name);

-- ────────────────────────────────────────────────── curated days

insert into public.curated_day
  (id, city_id, slug, title, tagline, badge, party_types, duration,
   price_per_person_kes, status, featured, sort)
select
  d.id::uuid, (select id from public.city where slug = 'nairobi'),
  d.slug, d.title, d.tagline, d.badge, d.parties::text[], d.duration,
  d.price, 'live', d.featured, d.sort
from (values
  ('00000000-0000-4000-8000-0000000c0001', 'nairobi-in-a-day', 'Nairobi in a day',
   'Park at sunrise, choma at noon, a rooftop after dark.', 'MOST BOOKED',
   '{couple,group}', 'day', 18500, true, 1),
  ('00000000-0000-4000-8000-0000000c0002', 'slow-sunday', 'Slow Sunday',
   'A long breakfast, a spa, and nowhere to be.', 'COUPLES',
   '{solo,couple}', 'day', 11500, true, 2),
  ('00000000-0000-4000-8000-0000000c0003', 'family-safari-lite', 'Family safari lite',
   'Giraffes and elephants before lunch, pool after.', null,
   '{family}', 'day', 9500, false, 3)
) as d(id, slug, title, tagline, badge, parties, duration, price, featured, sort)
on conflict (id) do nothing;

insert into public.curated_day_block (curated_day_id, component_id, slot, start_time, sort)
select d.day::uuid, c.id, c.default_slot, public.fn_slot_time(c.default_slot), d.sort
from (values
  ('00000000-0000-4000-8000-0000000c0001', 'Nairobi National Park · sunrise drive', 1),
  ('00000000-0000-4000-8000-0000000c0001', 'Nyama choma at [partner] · Karen', 2),
  ('00000000-0000-4000-8000-0000000c0001', 'Rooftop · live band', 3),
  ('00000000-0000-4000-8000-0000000c0002', 'Long breakfast · [partner]', 1),
  ('00000000-0000-4000-8000-0000000c0002', 'Spa · two hours', 2),
  ('00000000-0000-4000-8000-0000000c0003', 'Giraffe Centre · morning', 1),
  ('00000000-0000-4000-8000-0000000c0003', 'Elephant orphanage · feeding hour', 2),
  ('00000000-0000-4000-8000-0000000c0003', 'Pool day · [partner]', 3)
) as d(day, title, sort)
join public.experience_component c on c.title = d.title
where not exists (
  select 1 from public.curated_day_block b
  where b.curated_day_id = d.day::uuid and b.component_id = c.id
);

-- ────────────────────────────────────────────── somebody on shift

/*
 * Only accounts whose roles actually reach the module. dev.ops holds
 * merchant_ops and rider_ops, which the matrix gives no Experiences
 * access — putting them on shift meant the allocator handed days to
 * somebody who could not open them. fn_pick_concierge now refuses that
 * too, but a seed that creates the state is a seed that will find it
 * again on the next reset.
 */
insert into public.concierge_shift (staff_user_id, city_id, online, capacity)
select su.id, (select id from public.city where slug = 'nairobi'), true, 6
from public.staff_user su
where su.email = 'dev.admin@nexgapp.com'
on conflict (staff_user_id, city_id) do nothing;
