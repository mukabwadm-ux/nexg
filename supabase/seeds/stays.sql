-- Local development fixtures · stays.
--
-- Runs only on `supabase db reset`, never in production — the
-- production push applies migrations and nothing else.
--
-- Unlike the rest of the seed data, the nightly rates here are
-- plausible rather than bracketed, because the listing design cannot
-- be judged without seeing what a price looks like in the card. They
-- are invented. Nothing reads them but this machine, and the live site
-- shows "Price on request" because no property there has a rate.
--
-- Property and host names stay bracketed so a screenshot can never be
-- mistaken for a real partner.

set app.secret_key = 'local-dev-key-not-real';

-- Two hosts to own them.
insert into public.host (id, kind, display_name, contact_name, phone, city_id, areas,
                         tier, status, verified_at, went_live_at, units_declared_band)
values
  ('11000000-0000-4000-8000-000000000001','property_manager','[Riverine Collection]','[Contact]',
   '+254700000201',(select id from public.city where slug='nairobi'),
   array['Kilimani','Westlands','Karen'],'gold','live', now(), now(),'6_20'),
  ('11000000-0000-4000-8000-000000000002','multi_unit','[Lantern Stays]','[Contact]',
   '+254700000202',(select id from public.city where slug='nairobi'),
   array['Lavington','Kileleshwa'],'silver','live', now(), now(),'2_5')
on conflict (id) do nothing;

-- ── properties ───────────────────────────────────────────────────

insert into public.property (id, host_id, slug, name, kind, area, city_id, summary,
                             description, amenities, photos, neighbourhood_note,
                             listed, listed_at, check_in_from, check_out_by)
values
  ('12000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',
   'the-arbour-kilimani','[The Arbour]','apartment_block','Kilimani',
   (select id from public.city where slug='nairobi'),
   'Eight serviced flats off Dennis Pritt, five minutes from Yaya Centre.',
   'A quiet block set back from the road, with a lift, generator backup and a guarded gate. Each flat is let separately and serviced between stays. Breakfast, laundry and airport transfers are arranged through NexG — your hand-off rule is set before you arrive, so a delivery at midnight does not become a phone call.',
   array['Wi-Fi · fibre','Backup generator','Guarded gate','Lift','Parking','Workspace','Washing machine'],
   '[{"placeholder":true,"caption":"Courtyard"},{"placeholder":true,"caption":"Living area"},{"placeholder":true,"caption":"Kitchen"}]'::jsonb,
   'Walking distance to Yaya Centre, Kilimani restaurants and the Dennis Pritt matatu stage.',
   true, now(),'14:00','10:00'),

  ('12000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001',
   'brook-house-westlands','[Brook House]','apartment_block','Westlands',
   (select id from public.city where slug='nairobi'),
   'Studios and one-beds a short walk from Sarit and the Westlands offices.',
   'Built for people working in Westlands for a few weeks at a time. Fast fibre in every unit, a desk that is actually a desk, and a reception that signs for deliveries during office hours. After 22:00 the askari takes hand-offs, which is set per unit so riders never ring your bell at night.',
   array['Wi-Fi · fibre','Desk and chair','Reception 07:00–22:00','Gym','Parking','Backup generator'],
   '[{"placeholder":true,"caption":"Exterior"},{"placeholder":true,"caption":"Studio"},{"placeholder":true,"caption":"Desk"}]'::jsonb,
   'Five minutes to Sarit Centre, ten to the Westlands office blocks.',
   true, now(),'14:00','11:00'),

  ('12000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000001',
   'olive-cottage-karen','[Olive Cottage]','cottage','Karen',
   (select id from public.city where slug='nairobi'),
   'A two-bedroom garden cottage on a quiet Karen lane.',
   'Separate from the main house with its own entrance and garden. Dogs on the property, friendly but large, so the gate is opened by the caretaker rather than left on a code. Good for families and for anyone who wants Nairobi to be quiet for a week.',
   array['Garden','Fireplace','Wi-Fi','Parking inside','Caretaker on site','Pet friendly'],
   '[{"placeholder":true,"caption":"Garden"},{"placeholder":true,"caption":"Sitting room"}]'::jsonb,
   'Twenty minutes to Karen Blixen Museum, five to the Hub Karen.',
   true, now(),'15:00','10:00'),

  ('12000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000002',
   'lantern-lavington','[Lantern Lavington]','townhouse','Lavington',
   (select id from public.city where slug='nairobi'),
   'Three townhouses in a small gated court, each sleeping six.',
   'Whole-house lets rather than rooms, which suits families and crews travelling together. Each house has a kitchen worth cooking in, and the court has one shared gate with an askari around the clock.',
   array['Wi-Fi · fibre','Full kitchen','Washing machine','Askari 24 h','Parking ×2','Garden'],
   '[{"placeholder":true,"caption":"Courtyard"},{"placeholder":true,"caption":"Kitchen"},{"placeholder":true,"caption":"Bedroom"}]'::jsonb,
   'Quiet residential Lavington, ten minutes to Valley Arcade.',
   true, now(),'14:00','10:00'),

  ('12000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000002',
   'the-perch-kileleshwa','[The Perch]','penthouse','Kileleshwa',
   (select id from public.city where slug='nairobi'),
   'One penthouse, top floor, with the city on three sides.',
   'A single unit rather than a block. Floor-to-ceiling glass, a roof terrace and a lift that opens into the flat. Let as a whole; there is nothing else to choose from, which is rather the point.',
   array['Roof terrace','Wi-Fi · fibre','Lift to door','Backup generator','Parking ×2','Workspace'],
   '[{"placeholder":true,"caption":"Terrace"},{"placeholder":true,"caption":"Living"}]'::jsonb,
   'Kileleshwa, fifteen minutes from the CBD outside rush hour.',
   true, now(),'15:00','11:00'),

  /* Deliberately not listed, so the console has something to show a
     reason against and the public view can be proved to exclude it. */
  ('12000000-0000-4000-8000-000000000006','11000000-0000-4000-8000-000000000002',
   'harvest-court-kileleshwa','[Harvest Court]','apartment_block','Kileleshwa',
   (select id from public.city where slug='nairobi'),
   'Four flats, still being set up.',
   'Not yet listed — photographs and hand-off rules outstanding.',
   array['Wi-Fi'], '[]'::jsonb, null, false, null,'14:00','10:00')
on conflict (id) do nothing;

-- ── units ────────────────────────────────────────────────────────

insert into public.unit (host_id, property_id, name, label_public, address_line, area, city_id,
                         handoff, handoff_note, askari_name, caretaker_name,
                         caretaker_confirmed_at, delivery_hours, status, listed,
                         bedrooms, bathrooms, max_guests, size_sqm, bed_setup,
                         nightly_rate_kes, min_nights, unit_summary, unit_amenities, photos)
values
  -- [The Arbour]
  ('11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
   'Apartment 4B','Apartment 4B','[Address], Kilimani','Kilimani',
   (select id from public.city where slug='nairobi'),
   'leave_with_askari','call guest before arriving · after 22:00 leave with askari','[Name]','[Name]',
   now(),'{"from":"06:00","to":"22:00"}'::jsonb,'live', true,
   2, 2.0, 4, 94,'1 king, 1 twin pair', 9500, 2,
   'Top-floor two-bed with a balcony over the courtyard.',
   array['Balcony','Fibre Wi-Fi','Washing machine','Workspace'],
   '[{"placeholder":true,"caption":"Living"},{"placeholder":true,"caption":"Bedroom"}]'::jsonb),

  ('11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
   'Apartment 2A','Apartment 2A','[Address], Kilimani','Kilimani',
   (select id from public.city where slug='nairobi'),
   'leave_with_askari','call guest before arriving','[Name]','[Name]',
   now(),'{"from":"06:00","to":"22:00"}'::jsonb,'live', true,
   1, 1.0, 2, 58,'1 queen', 6800, 2,
   'One-bed on the second floor, quietest side of the block.',
   array['Fibre Wi-Fi','Workspace','Washing machine'],
   '[{"placeholder":true,"caption":"Living"}]'::jsonb),

  ('11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
   'Studio 7','Studio 7','[Address], Kilimani','Kilimani',
   (select id from public.city where slug='nairobi'),
   'lockbox','Lockbox by the lift · code sent on the day', null, null,
   null,'{"from":"06:00","to":"23:00"}'::jsonb,'live', true,
   0, 1.0, 2, 36,'1 double', 4900, 1,
   'Compact studio, good for one person working in town.',
   array['Fibre Wi-Fi','Workspace'],
   '[{"placeholder":true,"caption":"Studio"}]'::jsonb),

  -- [Brook House]
  ('11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002',
   'Studio 2','Studio 2','[Address], Westlands','Westlands',
   (select id from public.city where slug='nairobi'),
   'reception','Reception signs 07:00–22:00 · after that the askari', null,'[Name]',
   now(),'{"from":"07:00","to":"22:00"}'::jsonb,'live', true,
   0, 1.0, 2, 40,'1 queen', 5400, 3,
   'Studio with a proper desk and a window that opens.',
   array['Fibre Wi-Fi','Desk and chair','Gym access'],
   '[{"placeholder":true,"caption":"Studio"}]'::jsonb),

  ('11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002',
   'Apartment 11','Apartment 11','[Address], Westlands','Westlands',
   (select id from public.city where slug='nairobi'),
   'reception','Reception signs 07:00–22:00', null,'[Name]',
   now(),'{"from":"07:00","to":"22:00"}'::jsonb,'live', true,
   1, 1.0, 3, 62,'1 king, 1 sofa bed', 7600, 3,
   'One-bed facing away from the road, with a separate sitting room.',
   array['Fibre Wi-Fi','Desk and chair','Washing machine','Gym access'],
   '[{"placeholder":true,"caption":"Living"},{"placeholder":true,"caption":"Bedroom"}]'::jsonb),

  -- [Olive Cottage]
  ('11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000003',
   'The Cottage','Olive Cottage','[Address], Karen','Karen',
   (select id from public.city where slug='nairobi'),
   'caretaker','Caretaker opens the gate · dogs on site · daylight deliveries','[Name]','[Name]',
   now(),'{"from":"07:00","to":"18:00"}'::jsonb,'live', true,
   2, 1.0, 4, 110,'1 king, 2 singles', 11200, 3,
   'The whole cottage, with the garden and the fireplace.',
   array['Garden','Fireplace','Wi-Fi','Parking inside'],
   '[{"placeholder":true,"caption":"Garden"},{"placeholder":true,"caption":"Sitting room"}]'::jsonb),

  -- [Lantern Lavington]
  ('11000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000004',
   'House 1','House 1','[Address], Lavington','Lavington',
   (select id from public.city where slug='nairobi'),
   'leave_with_askari','Askari at the court gate, any hour','[Name]','[Name]',
   now(), null,'live', true,
   3, 2.5, 6, 180,'1 king, 1 queen, 2 singles', 16500, 2,
   'Three-bed townhouse with a kitchen worth cooking in.',
   array['Full kitchen','Fibre Wi-Fi','Washing machine','Parking ×2','Garden'],
   '[{"placeholder":true,"caption":"Kitchen"},{"placeholder":true,"caption":"Sitting room"}]'::jsonb),

  ('11000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000004',
   'House 3','House 3','[Address], Lavington','Lavington',
   (select id from public.city where slug='nairobi'),
   'leave_with_askari','Askari at the court gate, any hour','[Name]','[Name]',
   now(), null,'live', true,
   3, 2.5, 6, 176,'1 king, 1 queen, 2 singles', 16500, 2,
   'The same layout as House 1, facing the garden.',
   array['Full kitchen','Fibre Wi-Fi','Washing machine','Parking ×2','Garden'],
   '[{"placeholder":true,"caption":"Garden"}]'::jsonb),

  -- [The Perch]
  ('11000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000005',
   'Penthouse','The Perch','[Address], Kileleshwa','Kileleshwa',
   (select id from public.city where slug='nairobi'),
   'call_guest_first','Call the guest · lift opens into the flat', null, null,
   null,'{"from":"06:00","to":"23:00"}'::jsonb,'live', true,
   3, 3.0, 6, 240,'1 king, 2 queens', 28000, 2,
   'The whole top floor, with the roof terrace.',
   array['Roof terrace','Fibre Wi-Fi','Lift to door','Parking ×2','Workspace'],
   '[{"placeholder":true,"caption":"Terrace"},{"placeholder":true,"caption":"Living"}]'::jsonb);

update public.unit set readiness = public.fn_unit_readiness(id) where property_id is not null;

-- ── a few requests, so the console tab has something to work ─────

insert into public.stay_request (reference, requester_name, requester_phone, requester_email,
                                 city_id, areas, check_in, check_out, guests, bedrooms_needed,
                                 budget_per_night_kes, purpose, must_haves, notes, status,
                                 source, created_at)
values
  ('ST-K4M2PQ','[Requester]','+254700000311', null,
   (select id from public.city where slug='nairobi'), array['Westlands','Kilimani'],
   current_date + 9, current_date + 23, 1, 1, 8000,'business',
   array['Fast Wi-Fi','Workspace','Backup generator'],
   'Two weeks of client work in Westlands. Needs to be able to take calls at 7am.',
   'new','stays_hero', now() - interval '3 hours'),

  ('ST-B7X9JD','[Requester]', null,'[requester]@example.com',
   (select id from public.city where slug='nairobi'), array['Karen','Lavington'],
   current_date + 30, current_date + 37, 5, 3, 18000,'family',
   array['Garden','Full kitchen','Parking'],
   'Family of five, two young children. A garden matters more than a view.',
   'reviewing','stays_hero', now() - interval '2 days'),

  ('ST-W3Q8NR','[Requester]','+254700000313', null,
   (select id from public.city where slug='nairobi'), array['Kilimani'],
   current_date + 2, current_date + 5, 2, 1, 7000,'leisure',
   array['Fast Wi-Fi'],
   'Short weekend, arriving late on the Friday.',
   'matched','stays_hero', now() - interval '6 hours');

insert into public.stay_request_match (request_id, unit_id, rank, why, quoted_nightly_kes)
select r.id, u.id, 1,
       'Quietest side of the block and the only one free that weekend.',
       u.nightly_rate_kes
from public.stay_request r, public.unit u
where r.reference = 'ST-W3Q8NR' and u.name = 'Apartment 2A';
