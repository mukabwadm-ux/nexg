-- Demonstration menus for the demo merchants.
--
-- Run after demo-data.sql. Only reaches businesses tagged with the reserved
-- nexg.invalid domain, so it can never touch a real merchant's catalogue, and
-- demo-data-remove.sql clears it along with everything else (the foreign keys
-- cascade from merchant).
--
-- Prices are plausible Nairobi prices in whole shillings. They are invented,
-- like the businesses — which is the whole reason this file is separate and
-- removable. No total is computed from them anywhere.

begin;

with menus(email, section, section_sort, blurb, item, description, price, sort, flags) as (
  values
    -- ---------------------------------------------------------- grill house
    ('demo.sokoni@nexg.invalid', 'Popular', 0, 'Most ordered by NexG guests',
     'Nyama choma platter', 'Half kilo of goat ribs, kachumbari, ugali', 1450, 0, 'highlight'),
    ('demo.sokoni@nexg.invalid', 'Popular', 0, null,
     'Grilled tilapia', 'Whole fish, lemon and chilli, sukuma wiki', 1200, 1, 'highlight'),
    ('demo.sokoni@nexg.invalid', 'Grills', 1, null,
     'Mbuzi choma, 1 kg', 'Serves two to three, sides included', 2600, 0, null),
    ('demo.sokoni@nexg.invalid', 'Grills', 1, null,
     'Chicken half', 'Charcoal grilled, house marinade', 950, 1, null),
    ('demo.sokoni@nexg.invalid', 'Grills', 1, null,
     'Pork ribs', 'Slow grilled, honey glaze', 1350, 2, 'unavailable'),
    ('demo.sokoni@nexg.invalid', 'Sides', 2, null,
     'Ugali', 'Freshly turned', 150, 0, null),
    ('demo.sokoni@nexg.invalid', 'Sides', 2, null,
     'Kachumbari', 'Tomato, red onion, coriander, chilli', 200, 1, null),
    ('demo.sokoni@nexg.invalid', 'Drinks', 3, null,
     'Tusker 500 ml', 'Served chilled. ID checked on delivery', 350, 0, 'age'),
    ('demo.sokoni@nexg.invalid', 'Drinks', 3, null,
     'Dawa', 'Honey, lime, ginger', 300, 1, null),

    -- ------------------------------------------------------------ sushi bar
    ('demo.hifadhi@nexg.invalid', 'Popular', 0, 'Most ordered by NexG guests',
     'Salmon nigiri, 6 pieces', 'Cut to order', 1600, 0, 'highlight'),
    ('demo.hifadhi@nexg.invalid', 'Popular', 0, null,
     'Spicy tuna roll', 'Eight pieces, sesame, spring onion', 1250, 1, 'highlight'),
    ('demo.hifadhi@nexg.invalid', 'Rolls', 1, null,
     'California roll', 'Crab, avocado, cucumber', 1100, 0, null),
    ('demo.hifadhi@nexg.invalid', 'Rolls', 1, null,
     'Vegetable futomaki', 'Avocado, pickled radish, cucumber', 900, 1, null),
    ('demo.hifadhi@nexg.invalid', 'Hot dishes', 2, null,
     'Chicken katsu curry', 'Panko chicken, rice, Japanese curry', 1400, 0, null),
    ('demo.hifadhi@nexg.invalid', 'Hot dishes', 2, null,
     'Tonkotsu ramen', 'Pork broth, chashu, soft egg', 1500, 1, null),
    ('demo.hifadhi@nexg.invalid', 'Drinks', 3, null,
     'Green tea', 'Pot, serves two', 250, 0, null),

    -- ------------------------------------------------------- coffee & bakery
    ('demo.asubuhi@nexg.invalid', 'Popular', 0, 'Most ordered by NexG guests',
     'Flat white', 'Double shot, Kenyan AA', 350, 0, 'highlight'),
    ('demo.asubuhi@nexg.invalid', 'Popular', 0, null,
     'Butter croissant', 'Baked each morning', 280, 1, 'highlight'),
    ('demo.asubuhi@nexg.invalid', 'Coffee', 1, null,
     'Americano', 'Single or double', 250, 0, null),
    ('demo.asubuhi@nexg.invalid', 'Coffee', 1, null,
     'Cappuccino', 'Double shot', 330, 1, null),
    ('demo.asubuhi@nexg.invalid', 'Bakery', 2, null,
     'Almond danish', 'Frangipane, flaked almonds', 320, 0, null),
    ('demo.asubuhi@nexg.invalid', 'Bakery', 2, null,
     'Banana bread slice', 'Toasted on request', 260, 1, null),
    ('demo.asubuhi@nexg.invalid', 'Breakfast', 3, null,
     'Full breakfast', 'Eggs, sausage, grilled tomato, toast', 890, 0, null),

    -- ---------------------------------------------------------------- laundry
    ('demo.safi@nexg.invalid', 'Wash and fold', 0, 'Priced per item',
     'Shirt', 'Washed, pressed, on a hanger', 180, 0, null),
    ('demo.safi@nexg.invalid', 'Wash and fold', 0, null,
     'Trousers', 'Washed and pressed', 220, 1, null),
    ('demo.safi@nexg.invalid', 'Dry cleaning', 1, null,
     'Two-piece suit', 'Next-day service', 950, 0, null),
    ('demo.safi@nexg.invalid', 'Dry cleaning', 1, null,
     'Dress', 'Depending on fabric', 650, 1, null),
    ('demo.safi@nexg.invalid', 'Express', 2, null,
     'Same-day return', 'Collected before 10:00, back by 18:00', 400, 0, null),

    -- ------------------------------------------------------------ wine shop
    ('demo.zamani@nexg.invalid', 'Popular', 0, 'Most ordered by NexG guests',
     'South African Chenin Blanc', '750 ml, chilled on request', 1800, 0, 'age,highlight'),
    ('demo.zamani@nexg.invalid', 'Wine', 1, null,
     'Malbec, Mendoza', '750 ml', 2400, 0, 'age'),
    ('demo.zamani@nexg.invalid', 'Wine', 1, null,
     'Prosecco', '750 ml, served cold', 2200, 1, 'age'),
    ('demo.zamani@nexg.invalid', 'Spirits', 2, null,
     'Kenyan gin, 700 ml', 'Local distillery', 2600, 0, 'age'),
    ('demo.zamani@nexg.invalid', 'Mixers', 3, null,
     'Tonic water, 4 pack', '200 ml bottles', 480, 0, null),

    -- --------------------------------------------------------------- florist
    ('demo.ua@nexg.invalid', 'Popular', 0, 'Most ordered by NexG guests',
     'Seasonal hand-tied bouquet', 'Whatever is best that morning, wrapped', 2500, 0, 'highlight'),
    ('demo.ua@nexg.invalid', 'Bouquets', 1, null,
     'Dozen roses', 'Red, white or pink', 3200, 0, null),
    ('demo.ua@nexg.invalid', 'Bouquets', 1, null,
     'Tropical arrangement', 'Heliconia, ginger, foliage', 3800, 1, null),
    ('demo.ua@nexg.invalid', 'Add to any order', 2, null,
     'Handwritten card', 'Your message, written by hand', 150, 0, null)
),
sections as (
  insert into public.catalogue_section (merchant_id, name, blurb, sort)
  select distinct on (m.id, d.section)
    m.id, d.section, d.blurb, d.section_sort
  from menus d
  join public.merchant m on m.contact_email = d.email
  on conflict (merchant_id, name) do nothing
  returning id, merchant_id, name
)
insert into public.catalogue_item (
  section_id, merchant_id, name, description, price_kes, sort,
  available, age_restricted, highlighted
)
select
  s.id, s.merchant_id, d.item, d.description, d.price, d.sort,
  coalesce(d.flags, '') not like '%unavailable%',
  coalesce(d.flags, '') like '%age%',
  coalesce(d.flags, '') like '%highlight%'
from menus d
join public.merchant m on m.contact_email = d.email
join sections s on s.merchant_id = m.id and s.name = d.section;

-- ------------------------------------------------------------------- hours
--
-- Same shape for every demo merchant: closed Sunday, shorter Saturday. Real
-- merchants set their own.

insert into public.merchant_hours (merchant_id, day_of_week, opens, closes, closed)
select m.id, d.dow, d.opens::time, d.closes::time, d.closed
from public.merchant m
cross join (values
  (1, '08:00', '22:00', false),
  (2, '08:00', '22:00', false),
  (3, '08:00', '22:00', false),
  (4, '08:00', '22:00', false),
  (5, '08:00', '23:00', false),
  (6, '09:00', '23:00', false),
  (0, null,    null,    true)
) as d(dow, opens, closes, closed)
where m.contact_email like 'demo.%@nexg.invalid'
on conflict (merchant_id, day_of_week) do nothing;

commit;

select
  (select count(*) from public.catalogue_section) as sections,
  (select count(*) from public.catalogue_item) as items,
  (select count(*) from public.merchant_hours) as hour_rows;
