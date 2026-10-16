-- Delivering outside the drawn zones, inside a city we serve.
--
-- What this has to get right:
--
--   * a point in no zone but near a live city is served, by that city
--   * a point beyond every radius is still refused
--   * a waitlist city never serves, however close
--   * a paused zone still stops orders — the pause cannot be routed
--     around by being outside a zone
--   * the fee band is the merchant-to-door distance, and a trip past
--     the maximum is refused rather than priced as the cheapest band

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create temp table p (k text primary key, g extensions.geography);
insert into p (k, g) values
  /* Syokimau: no zone, 17 km from the centre of Nairobi. */
  ('syokimau', extensions.st_setsrid(extensions.st_makepoint(36.9500, -1.3650), 4326)::extensions.geography),
  /* Kitui: 130 km from Nairobi. */
  ('kitui',    extensions.st_setsrid(extensions.st_makepoint(38.0100, -1.3670), 4326)::extensions.geography),
  /* Kampala centre: a waitlist city. */
  ('kampala',  extensions.st_setsrid(extensions.st_makepoint(32.5825,  0.3476), 4326)::extensions.geography),
  /* Nairobi CBD, and points 2, 5, 7, 12 and 25 km east of it. */
  ('cbd',      extensions.st_setsrid(extensions.st_makepoint(36.8172, -1.2864), 4326)::extensions.geography),
  ('e2',       extensions.st_setsrid(extensions.st_makepoint(36.8352, -1.2864), 4326)::extensions.geography),
  ('e5',       extensions.st_setsrid(extensions.st_makepoint(36.8622, -1.2864), 4326)::extensions.geography),
  ('e7',       extensions.st_setsrid(extensions.st_makepoint(36.8801, -1.2864), 4326)::extensions.geography),
  ('e12',      extensions.st_setsrid(extensions.st_makepoint(36.9251, -1.2864), 4326)::extensions.geography),
  ('e25',      extensions.st_setsrid(extensions.st_makepoint(37.0420, -1.2864), 4326)::extensions.geography);

-- ════════════════════════════════════════ which city serves a point

select is(
  (select slug from public.fn_serving_city((select g from p where k = 'syokimau'))),
  'nairobi',
  'A point in no zone, inside Nairobi''s radius, is served by Nairobi.');

select is(
  (select count(*)::int from public.fn_serving_city((select g from p where k = 'kitui'))),
  0,
  'Beyond every radius, no city serves it.');

select is(
  (select count(*)::int from public.fn_serving_city((select g from p where k = 'kampala'))),
  0,
  'A waitlist city does not serve, even at its own centre.');

-- ════════════════════════════════════════ what checkout asks

select is(
  (public.fn_zone_serviceable((select g from p where k = 'syokimau')) ->> 'ok')::boolean,
  true,
  'Checkout takes an order to a point in no zone inside a served city.');

select is(
  public.fn_zone_serviceable((select g from p where k = 'syokimau')) ->> 'city_id',
  (select id::text from public.city where slug = 'nairobi'),
  'And says which city, because an order cannot be written without one.');

select is(
  (public.fn_zone_serviceable((select g from p where k = 'kitui')) ->> 'ok')::boolean,
  false,
  'And refuses one beyond every city we serve.');

-- ════════════════════════════════════════ the fee band is the distance

select is(
  (public.fn_delivery_band((select id from public.city where slug = 'nairobi'),
     (select g from p where k = 'cbd'), (select g from p where k = 'e2')) ->> 'band')::int,
  1, '2 km is band 1.');

select is(
  (public.fn_delivery_band((select id from public.city where slug = 'nairobi'),
     (select g from p where k = 'cbd'), (select g from p where k = 'e5')) ->> 'band')::int,
  2, '5 km is band 2.');

select is(
  (public.fn_delivery_band((select id from public.city where slug = 'nairobi'),
     (select g from p where k = 'cbd'), (select g from p where k = 'e7')) ->> 'band')::int,
  3, '7 km is band 3.');

select is(
  (public.fn_delivery_band((select id from public.city where slug = 'nairobi'),
     (select g from p where k = 'cbd'), (select g from p where k = 'e12')) ->> 'band')::int,
  4, '12 km is band 4, not the cheapest band.');

select is(
  (public.fn_delivery_band((select id from public.city where slug = 'nairobi'),
     (select g from p where k = 'cbd'), (select g from p where k = 'e25')) ->> 'ok')::boolean,
  false,
  '25 km is past the 15 km maximum and is refused rather than priced.');

select is(
  (public.fn_price_order((select id from public.city where slug = 'nairobi'),
     'restaurant', 100000, 4::smallint) -> 'missing') ? 'fees.delivery.band_4',
  true,
  'Band 4 prices from its own fee, and an unset one stops the order rather than charging nothing.');

select * from finish();
rollback;
