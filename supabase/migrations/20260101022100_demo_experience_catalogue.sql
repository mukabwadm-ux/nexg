-- Demo catalogue for Nairobi, so the Customize-Your-Experience builder has
-- something to build a day from while real suppliers and prices are gathered.
--
-- Everything here is placeholder content and is easy to find and remove:
--   partners   name starts with "Demo · "
--   components tags contain 'demo'
--   curated    slug starts with 'demo-'
--   events     organiser_name = 'Demo organiser'
-- Edit or archive rows from Admin → Experiences when real data arrives.
-- Prices are illustrative, not quotes.

do $seed$
declare
  v_city uuid;
  v_partner uuid;
  p record;
  c record;
begin
  select id into v_city from public.city where slug = 'nairobi';
  if v_city is null then
    return;
  end if;

  for p in
    select * from (values
      ('Demo · Savannah Trails',  'operator'::public.experience_partner_kind, '254700000001'),
      ('Demo · Table & Fork',     'venue'::public.experience_partner_kind,    '254700000002'),
      ('Demo · After Dark',       'venue'::public.experience_partner_kind,    '254700000003'),
      ('Demo · Calm Collective',  'operator'::public.experience_partner_kind, '254700000004'),
      ('Demo · Stay Nairobi',     'host'::public.experience_partner_kind,     '254700000005'),
      ('Demo · City Live Events', 'organiser'::public.experience_partner_kind,'254700000006')
    ) as t(name, kind, phone)
  loop
    if not exists (select 1 from public.experience_partner where name = p.name) then
      insert into public.experience_partner
        (name, kind, contact_name, contact_phone, city_id, status, went_live_at, can_answer_holds)
      values
        (p.name, p.kind, 'Demo contact', p.phone, v_city, 'live', now(), false);
    end if;
  end loop;

  for c in
    select * from (values
      ('Demo · Savannah Trails','wild','activity','morning_wild',1,'Karura Forest guided walk','Waterfall trail with a local guide',1500,'per_person','morning',180,'[{"label":"Forest entry (KFS)","amount":600,"note":"Paid at the gate"}]','{"Guide","Water"}'),
      ('Demo · Savannah Trails','wild','activity','morning_wild',2,'Giraffe Centre & elephant orphanage','Feed giraffes, then visit baby elephants',4500,'per_person','morning',240,'[{"label":"Entry fees","amount":2500,"note":"Paid at the gates"}]','{"Transport","Guide"}'),
      ('Demo · Savannah Trails','wild','activity','morning_wild',4,'Nairobi National Park game drive','Open-roof vehicle, lions to rhinos',18000,'per_vehicle','morning',240,'[{"label":"Park fees (KWS)","amount":4300,"note":"Set by KWS, shown separately, never marked up"}]','{"4x4 vehicle","Driver-guide","Water"}'),
      ('Demo · Savannah Trails','wild','activity','afternoon_wild',2,'Ngong Hills sunset hike','Ridge walk with city views',2500,'per_person','afternoon',210,'[]','{"Guide"}'),
      ('Demo · Savannah Trails','wild','activity','afternoon_wild',5,'Lake Naivasha boat & Crescent Island','Hippos, birds and a walk among zebra',9500,'per_person','afternoon',300,'[{"label":"Park and boat fees","amount":3500,"note":"Paid on the day"}]','{"Transport","Boat"}'),
      ('Demo · Table & Fork','taste','meal','lunch_taste',1,'Street food crawl','Mutura, mandazi, chai and more',1800,'per_person','midday',150,'[]','{"Guide","Tastings"}'),
      ('Demo · Table & Fork','taste','meal','lunch_taste',3,'Nyama choma lunch','Charcoal-grilled goat with kachumbari',3200,'per_person','midday',120,'[]','{"Lunch"}'),
      ('Demo · Table & Fork','taste','meal','lunch_taste',5,'Chef''s tasting menu','Seven courses with wine pairing',12500,'per_person','midday',150,'[]','{"Tasting menu","Wine pairing"}'),
      ('Demo · Table & Fork','taste','meal','dinner_taste',2,'Swahili dinner','Coconut curries and fresh chapati',2800,'per_person','evening',105,'[]','{"Dinner"}'),
      ('Demo · Table & Fork','taste','meal','dinner_taste',4,'Rooftop dinner','Three courses above the city',7500,'per_person','evening',120,'[]','{"Three courses"}'),
      ('Demo · After Dark','night','venue','evening_night',1,'Live band at a local bar','Afrobeat and benga, no cover',1000,'per_person','night',150,'[]','{"Entry"}'),
      ('Demo · After Dark','night','venue','evening_night',3,'Rooftop cocktails','Skyline views, signature drinks',3500,'per_person','evening',120,'[]','{"Welcome drink"}'),
      ('Demo · After Dark','night','venue','evening_night',5,'Club night, VIP table','Reserved table and a bottle for the group',45000,'per_group','night',240,'[]','{"Table","Bottle service"}'),
      ('Demo · Calm Collective','slow','activity','morning_slow',1,'Morning yoga in the park','Open-air class for all levels',1200,'per_person','morning',75,'[]','{"Mat","Class"}'),
      ('Demo · Calm Collective','slow','activity','morning_slow',3,'Massage & spa session','Ninety minutes of treatments',6500,'per_person','afternoon',120,'[]','{"Massage","Steam room"}'),
      ('Demo · Calm Collective','slow','activity','morning_slow',5,'Resort spa day','Pool, treatments and lunch',16000,'per_person','midday',360,'[]','{"Treatments","Lunch","Pool"}'),
      ('Demo · Stay Nairobi','stay','stay','nairobi_stay',1,'Guesthouse room','Clean, quiet, breakfast included',4500,'per_night','evening',720,'[]','{"Breakfast","Wi-Fi"}'),
      ('Demo · Stay Nairobi','stay','stay','nairobi_stay',3,'Boutique hotel','Courtyard rooms in Karen',12000,'per_night','evening',720,'[]','{"Breakfast","Pool"}'),
      ('Demo · Stay Nairobi','stay','stay','nairobi_stay',5,'Luxury suite','Five-star suite with butler service',35000,'per_night','evening',720,'[]','{"Breakfast","Spa access","Airport transfer"}')
    ) as t(partner, mood, kind, grp, tier, title, subtitle, price, basis, slot, mins, pay, inc)
  loop
    select id into v_partner from public.experience_partner where name = c.partner;
    if v_partner is not null and not exists (
      select 1 from public.experience_component
      where partner_id = v_partner and title = c.title
    ) then
      insert into public.experience_component (
        partner_id, city_id, kind, mood, title, subtitle, description,
        duration_min, default_slot, price_kes, price_basis,
        includes, pay_on_day, tags, tier, swap_group, status, sort
      ) values (
        v_partner, v_city, c.kind::public.block_kind, c.mood::public.mood,
        c.title, c.subtitle, 'Demo content. Replace with the real offer.',
        c.mins, c.slot::public.block_slot, c.price, c.basis::public.price_basis,
        c.inc::text[], c.pay::jsonb, array['demo'], c.tier, c.grp, 'live', c.tier
      );
    end if;
  end loop;

  if not exists (select 1 from public.curated_day where city_id = v_city and slug = 'demo-wild-and-wine') then
    insert into public.curated_day
      (city_id, slug, title, tagline, badge, duration, price_per_person_kes, status, featured, sort)
    values
      (v_city, 'demo-wild-and-wine', 'Wild morning, long lunch',
       'Giraffes in the morning, nyama choma by noon', 'Demo', 'day', 7500, 'live', true, 1);

    insert into public.curated_day_block (curated_day_id, component_id, slot, start_time, sort)
    select d.id, k.id, k.default_slot, s.t::time, s.n
    from public.curated_day d
    cross join (values
      ('Giraffe Centre & elephant orphanage', '08:30', 1),
      ('Nyama choma lunch',                   '13:00', 2),
      ('Rooftop cocktails',                   '18:30', 3)
    ) as s(title, t, n)
    join public.experience_component k on k.title = s.title and k.tags @> array['demo']
    where d.slug = 'demo-wild-and-wine' and d.city_id = v_city;
  end if;

  if not exists (select 1 from public.curated_day where city_id = v_city and slug = 'demo-slow-weekend') then
    insert into public.curated_day
      (city_id, slug, title, tagline, badge, duration, price_per_person_kes, status, featured, sort)
    values
      (v_city, 'demo-slow-weekend', 'A slow Nairobi day',
       'Yoga, a spa session and a quiet dinner', 'Demo', 'day', 9800, 'live', false, 2);

    insert into public.curated_day_block (curated_day_id, component_id, slot, start_time, sort)
    select d.id, k.id, k.default_slot, s.t::time, s.n
    from public.curated_day d
    cross join (values
      ('Morning yoga in the park', '08:00', 1),
      ('Massage & spa session',    '14:00', 2),
      ('Swahili dinner',           '19:00', 3)
    ) as s(title, t, n)
    join public.experience_component k on k.title = s.title and k.tags @> array['demo']
    where d.slug = 'demo-slow-weekend' and d.city_id = v_city;
  end if;

  -- Dates are relative to when this runs, so the list starts fresh.
  insert into public.event (
    city_id, name, category, venue_name, venue_address, starts_at, ends_at,
    organiser_name, ticket_bands, practical_note, status, published_at,
    featured, anchor_slot, suggested_blocks
  )
  select v_city, e.name, e.category::public.event_category, e.venue, e.addr,
         now() + e.starts, now() + e.starts + e.dur, 'Demo organiser',
         e.bands::jsonb, e.note, 'published', now(), e.featured,
         e.slot::public.block_slot, e.blocks::jsonb
  from (values
    ('Demo · Nairobi Jazz Night','music','Alchemist Bar','Westlands, Nairobi',
      interval '9 days 18 hours', interval '5 hours',
      '[{"label":"Regular","price_kes":1500,"currency":"KES"},{"label":"VIP","price_kes":4000,"currency":"KES"}]',
      'Doors open at 6pm. Tickets are sold by the organiser.', true, 'evening',
      '[{"kind":"meal","mood":"taste","slot":"evening","title":"Dinner before the show","swap_group":"dinner_taste"}]'),
    ('Demo · Rugby Sevens Day','sport','RFUEA Ground','Ngong Road, Nairobi',
      interval '16 days 9 hours', interval '9 hours',
      '[{"label":"Standard","price_kes":1000,"currency":"KES"},{"label":"Hospitality","price_kes":6500,"currency":"KES"}]',
      'Bring sun protection. Gates open 8am.', false, 'midday',
      '[{"kind":"meal","mood":"taste","slot":"midday","title":"Nyama choma lunch","swap_group":"lunch_taste"}]'),
    ('Demo · Street Food Festival','food_drink','Uhuru Gardens','Langata Road, Nairobi',
      interval '23 days 11 hours', interval '8 hours',
      '[{"label":"Entry","price_kes":500,"currency":"KES"}]',
      'Food is bought separately inside.', false, 'afternoon', '[]'),
    ('Demo · Family Fun Weekend','family','Karura Forest','Limuru Road, Nairobi',
      interval '30 days 10 hours', interval '6 hours',
      '[{"label":"Adult","price_kes":800,"currency":"KES"},{"label":"Child","price_kes":400,"currency":"KES"}]',
      'Children under 3 are free.', false, 'morning', '[]')
  ) as e(name, category, venue, addr, starts, dur, bands, note, featured, slot, blocks)
  where not exists (
    select 1 from public.event x
    where x.city_id = v_city and lower(x.name) = lower(e.name)
  );
end
$seed$;
