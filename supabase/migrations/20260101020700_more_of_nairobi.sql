-- More of Nairobi, by name.
--
-- Six zones covered the middle of the city. Everywhere else inside
-- Nairobi's radius is already served (20260101020600), but a place
-- with no zone has no name on the chip, no delivery window and no
-- pause button for ops. These 21 give the areas people actually say
-- — "Embakasi", "Rongai", "Kitengela" — a zone of their own.
--
-- Rectangles, like the first six, and drawn not to overlap them or
-- each other: a point in two zones would be named by whichever sorts
-- first. Each was checked against the town it is named for. Where a
-- town already falls inside an older zone (Ruaka in Runda, Githurai
-- in Roysambu, Lavington and Kileleshwa in Kilimani, Parklands in
-- Westlands) it keeps that zone rather than splitting it.
--
-- Tiers follow distance and density: extended for the ring around the
-- core, trial for the towns at the edge. The delivery fee does not
-- come from the zone any more (fn_delivery_band), so delivery_band is
-- left unset.

insert into public.zone (city_id, name, tier, polygon, eta_min, eta_max, cod_allowed)
select
  c.id,
  z.name,
  z.tier::public.zone_tier,
  extensions.st_makeenvelope(z.w, z.s, z.e, z.n, 4326)::extensions.geography,
  z.eta_min,
  z.eta_max,
  z.cod
from public.city c
cross join (values
  -- the ring around the core
  ('Spring Valley',             'extended', 36.765, -1.270, 36.795, -1.235, 30, 45, true),
  ('Gigiri',                    'extended', 36.810, -1.245, 36.830, -1.215, 30, 45, true),
  ('Muthaiga & Pangani',        'extended', 36.830, -1.272, 36.865, -1.235, 30, 45, true),
  ('Ridgeways & Kiambu Road',   'extended', 36.830, -1.235, 36.865, -1.195, 35, 50, true),
  ('Eastleigh',                 'extended', 36.840, -1.290, 36.870, -1.272, 30, 45, true),
  ('South B & Industrial Area', 'extended', 36.830, -1.325, 36.870, -1.300, 30, 45, true),
  ('Buruburu & Donholm',        'extended', 36.870, -1.305, 36.930, -1.272, 35, 50, true),
  ('Roysambu & Kasarani',       'extended', 36.865, -1.240, 36.920, -1.195, 35, 50, true),
  ('Embakasi',                  'extended', 36.870, -1.345, 36.930, -1.305, 35, 50, true),
  ('Kangemi & Uthiru',          'extended', 36.700, -1.270, 36.765, -1.235, 35, 50, true),
  ('Banana Hill & Ndenderu',    'extended', 36.740, -1.195, 36.800, -1.160, 40, 55, true),
  -- the edge
  ('Kariobangi & Dandora',      'trial',    36.865, -1.272, 36.930, -1.240, 40, 60, false),
  ('Utawala & Ruai',            'trial',    36.930, -1.310, 37.000, -1.250, 45, 70, false),
  ('Kahawa',                    'trial',    36.890, -1.195, 36.930, -1.160, 45, 70, false),
  ('Ruiru',                     'trial',    36.930, -1.170, 37.000, -1.120, 50, 75, false),
  ('Kikuyu',                    'trial',    36.630, -1.270, 36.700, -1.220, 50, 75, false),
  ('Ngong',                     'trial',    36.620, -1.395, 36.700, -1.345, 50, 75, false),
  ('Rongai',                    'trial',    36.720, -1.420, 36.800, -1.360, 45, 70, false),
  ('Syokimau & Mlolongo',       'trial',    36.920, -1.410, 36.980, -1.345, 45, 70, false),
  ('Athi River',                'trial',    36.960, -1.470, 37.030, -1.410, 50, 75, false),
  ('Kitengela',                 'trial',    36.910, -1.520, 36.990, -1.470, 50, 75, false)
) as z(name, tier, w, s, e, n, eta_min, eta_max, cod)
where c.slug = 'nairobi'
on conflict (city_id, name) do nothing;
