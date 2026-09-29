-- Demonstration merchants and riders.
--
-- NOT the local seed. `seed.sql` runs on every `db reset` and creates the
-- dev staff account; this file is run by hand, against whichever database
-- needs something on screen — typically the hosted one, which `db push`
-- leaves empty.
--
-- Every business below is invented. The names are plausible so the site does
-- not look unfinished to a tester, which is exactly why they must not survive
-- into real use: someone will otherwise believe they can order from them.
-- Each row is tagged, and `supabase/demo-data-remove.sql` deletes precisely
-- what this inserts and nothing else.
--
-- No figure here is a business number. Prices, delivery times, commissions
-- and ratings are not set, and render as [—] wherever the design shows them
-- (ground rule 3).

begin;

-- ---------------------------------------------------------------- merchants

with city_ids as (
  select
    (select id from public.city where slug = 'nairobi') as nairobi
),
demo(legal_name, trading_name, category, category_other, contact_name,
     contact_phone, contact_email, branch_name, address_text,
     featured, concierge_pick, cover) as (
  values
    ('Sokoni Grill House Limited', 'Sokoni Grill House', 'restaurant', null,
     'Amina Wekesa', '+254700000101', 'demo.sokoni@nexg.invalid',
     'Westlands', 'Woodvale Grove, Westlands, Nairobi',
     true, true, '/images/merchants/grill-restaurant.jpg'),

    ('Hifadhi Sushi Limited', 'Hifadhi Sushi & Asian', 'restaurant', null,
     'Kelvin Otieno', '+254700000102', 'demo.hifadhi@nexg.invalid',
     'Parklands', 'Ojijo Road, Parklands, Nairobi',
     true, false, '/images/merchants/sushi-asian.jpg'),

    ('Asubuhi Coffee Works Limited', 'Asubuhi Coffee & Bakery', 'restaurant', null,
     'Grace Njeri', '+254700000103', 'demo.asubuhi@nexg.invalid',
     'Westlands', 'Rhapta Road, Westlands, Nairobi',
     true, true, '/images/merchants/coffee-bakery.jpg'),

    ('Safi Laundry Services Limited', 'Safi Laundry & Dry Cleaning', 'laundry', null,
     'Peter Kamau', '+254700000104', 'demo.safi@nexg.invalid',
     'Kilimani', 'Argwings Kodhek Road, Kilimani, Nairobi',
     false, false, '/images/merchants/laundry.jpg'),

    ('Afya Point Pharmacy Limited', 'Afya Point Pharmacy', 'pharmacy', null,
     'Dr Ruth Achieng', '+254700000105', 'demo.afya@nexg.invalid',
     'Westlands', 'Waiyaki Way, Westlands, Nairobi',
     false, true, '/images/merchants/pharmacy.jpg'),

    ('Zamani Wines Limited', 'Zamani Wine & Spirits', 'bar_liquor', null,
     'Brian Mwaura', '+254700000106', 'demo.zamani@nexg.invalid',
     'Parklands', 'Limuru Road, Parklands, Nairobi',
     true, false, '/images/merchants/wine-spirits.jpg'),

    ('Ua Flowers Limited', 'Ua Flowers & Gifts', 'florist', null,
     'Mercy Chebet', '+254700000107', 'demo.ua@nexg.invalid',
     'Kilimani', 'Lenana Road, Kilimani, Nairobi',
     false, true, '/images/merchants/florist.jpg'),

    ('Mitindo House Limited', 'Mitindo Fashion Boutique', 'beauty_fashion', null,
     'Faith Wanjiru', '+254700000108', 'demo.mitindo@nexg.invalid',
     'Karen', 'Karen Road, Karen, Nairobi',
     false, false, '/images/merchants/fashion-boutique.jpg'),

    ('Nyumbani Grocers Limited', 'Nyumbani Grocers', 'supermarket', null,
     'Samuel Kiprono', '+254700000109', 'demo.nyumbani@nexg.invalid',
     'Kilimani', 'Ngong Road, Kilimani, Nairobi',
     false, false, '/images/merchants/grocers.jpg')
),
inserted as (
  insert into public.merchant (
    legal_name, trading_name, category, category_other,
    contact_name, contact_phone, contact_email, city_id,
    status, went_live_at, cover_photo_path,
    featured, concierge_pick, explore_visible, accepting_orders,
    pay_on_delivery
  )
  select
    d.legal_name, d.trading_name, d.category::public.merchant_category, d.category_other,
    d.contact_name, d.contact_phone, d.contact_email, c.nairobi,
    'live', now() - (random() * interval '120 days'),
    /*
     * Only where the file exists. next/image on a missing path renders a
     * broken image, which looks worse than the category mark the card falls
     * back to — and no usable public-domain pharmacy photograph turned up,
     * so that one deliberately has none.
     */
    case when d.cover is not null
      and d.cover <> '/images/merchants/pharmacy.jpg'
      then d.cover
    end,
    d.featured, d.concierge_pick, true, true,
    true
  from demo d, city_ids c
  on conflict (contact_email) do nothing
  returning id, trading_name
)
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
select i.id, d.branch_name, d.address_text, true
from inserted i
join demo d on d.trading_name = i.trading_name
on conflict do nothing;

-- ------------------------------------------------------------------ riders
--
-- Riders are not publicly visible. These exist so the console pipeline has
-- something in every column rather than one lonely card.

insert into public.rider (
  first_name, last_name, phone, city_id, vehicle, plate_no, status, activated_at
)
select v.first_name, v.last_name, v.phone,
       (select id from public.city where slug = 'nairobi'),
       v.vehicle::public.vehicle_type, v.plate_no, v.status::public.rider_status,
       -- The schema requires an activation timestamp on an active rider and
       -- forbids one otherwise; `activated_by` stays null because no staff
       -- member actually activated these.
       case when v.status = 'active' then now() - interval '30 days' end
from (values
  ('Joseph',  'Mutua',   '+254700000201', 'motorbike', 'KMDA 210J', 'applied'),
  ('Alice',   'Wambui',  '+254700000202', 'motorbike', 'KMEB 774A', 'documents_pending'),
  ('Dennis',  'Ochieng', '+254700000203', 'bicycle',   null,        'documents_pending'),
  ('Halima',  'Yusuf',   '+254700000204', 'motorbike', 'KMFC 118H', 'under_review'),
  ('Victor',  'Kimani',  '+254700000205', 'car',       'KDD 902V',  'under_review'),
  ('Mary',    'Atieno',  '+254700000206', 'motorbike', 'KMGD 455M', 'active'),
  ('Stephen', 'Barasa',  '+254700000207', 'tuktuk',    'KTWA 067S', 'active')
) as v(first_name, last_name, phone, vehicle, plate_no, status)
on conflict (phone) do nothing;

commit;

select
  (select count(*) from public.merchant where contact_email like 'demo.%@nexg.invalid') as demo_merchants,
  (select count(*) from public.rider where phone like '+2547000002%') as demo_riders;
