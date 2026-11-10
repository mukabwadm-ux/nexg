-- Demo logins for presentations: every merchant category, hosts, riders, a customer.
--
-- Run by hand in the Supabase SQL editor. Not a migration, and safe to run
-- again: an account that exists keeps its rows and only has its password
-- reset to the one below.
--
-- BEFORE RUNNING: replace CHANGE-ME-DEMO-PASSWORD on the line marked
-- "<<< set the demo password" with the password you want every demo account
-- to use (10 characters or more). Never commit the real one.
--
-- What it creates (all in Nairobi):
--   Merchants, two per active category:
--     live.<category>@nexgapp.com   fully onboarded: live, documents verified,
--                                   agreement accepted, branch, hours, 3 items
--     new.<category>@nexgapp.com    not finished: documents pending, no
--                                   documents uploaded yet
--   Hosts:     live.host@nexgapp.com   (live, a property with 2 live units)
--              new.host@nexgapp.com    (applied, a property with 1 unit setting up)
--   Riders:    live.rider@nexgapp.com  (active, documents verified)
--              new.rider@nexgapp.com   (documents pending)
--   Customer:  customer.demo@nexgapp.com
--
-- Kept off the public site by default: demo merchants are hidden from
-- Explore and demo units have no photos, so they are never listed or
-- bookable. To show the merchants on the site for a demo, set
-- v_show_on_site to true. supabase/demo-accounts-remove.sql deletes
-- everything this creates.
--
-- New-business alert emails to staff are switched off while this runs,
-- so staff are not sent 48 "new application" emails.

begin;

alter table public.merchant disable trigger form_alert_insert;
alter table public.merchant disable trigger staff_bell_insert;
alter table public.host disable trigger form_alert_insert;
alter table public.host disable trigger staff_bell_insert;
alter table public.rider disable trigger form_alert_insert;
alter table public.rider disable trigger staff_bell_insert;

/* One auth user per email: created confirmed, or its password reset. */
create or replace function pg_temp.demo_user(p_email text, p_name text, p_password text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is not null then
    update auth.users
       set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_id;
    return v_id;
  end if;

  v_id := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token)
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    lower(p_email), extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_name, 'demo', true),
    '', '', '', '', '', '', '', '');

  insert into auth.identities (id, provider_id, user_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id::text, v_id,
          jsonb_build_object('sub', v_id::text, 'email', lower(p_email),
                             'email_verified', true, 'phone_verified', false),
          'email', null, now(), now());
  return v_id;
end;
$$;

do $$
declare
  v_password text := 'CHANGE-ME-DEMO-PASSWORD';   -- <<< set the demo password
  v_show_on_site boolean := false;                -- true: demo merchants appear in Explore

  v_city uuid;
  v_zone uuid;
  v_staff uuid;
  v_user uuid;
  v_merchant uuid;
  v_section uuid;
  v_host uuid;
  v_property uuid;
  v_rider uuid;
  v_slug text;
  c record;
begin
  if v_password = 'CHANGE-ME-DEMO-PASSWORD' or length(v_password) < 10 then
    raise exception 'Set v_password to the demo password (10 characters or more) before running.';
  end if;

  select id into v_city from public.city where slug = 'nairobi';
  if v_city is null then raise exception 'No Nairobi city row.'; end if;
  select id into v_zone from public.zone where city_id = v_city and name = 'Westlands';
  if v_zone is null then
    select id into v_zone from public.zone where city_id = v_city order by name limit 1;
  end if;
  select id into v_staff from public.staff_user order by created_at limit 1;

  -- ═══════════════════════════════════════════════ merchants, per category

  for c in
    select x.*
      from (values
        ('adults_only', 'After Dark Boutique', 'Shop', 'Couples gift set', 3500, 'Massage oil', 1200, 'Silk robe', 2800),
        ('airport_transfers', 'JKIA Transfers', 'Transfers', 'JKIA to Westlands', 3500, 'JKIA to Kilimani', 3200, 'SGR terminus pickup', 4000),
        ('alcohol_beverages', 'Cellar Wine & Spirits', 'Drinks', 'Red wine, 750 ml', 1800, 'Single malt, 700 ml', 6500, 'Craft beer, 6 pack', 1500),
        ('fashion_apparel', 'Kitenge Fashion House', 'Clothing', 'Linen shirt', 2500, 'Kitenge dress', 4200, 'Leather sandals', 3000),
        ('beauty', 'Glow Beauty Studio', 'Treatments', 'Manicure', 1500, 'Blow-dry', 2000, 'Make-up session', 4500),
        ('vehicle_rentals', 'Safari Car Hire', 'Cars', 'Toyota Axio, per day', 4500, 'Land Cruiser Prado, per day', 12000, 'Driver, per day', 2500),
        ('experiences', 'Nairobi Experiences', 'Experiences', 'Nairobi National Park, half day', 9500, 'Giraffe Centre visit', 4500, 'Coffee farm tour', 6000),
        ('financial_services', 'Shilling Forex & Finance', 'Services', 'Travel insurance, 7 days', 2500, 'Forex delivery', 500, 'Advisory session', 3000),
        ('other', 'Something Else Co', 'Services', 'Custom request', 1000, 'Same-day errand', 800, 'Premium request', 2500),
        ('flowers_gifts', 'Petal Flowers & Gifts', 'Flowers', 'Rose bouquet', 2500, 'Gift hamper', 5500, 'Birthday cake', 3000),
        ('restaurants_food', 'Choma Kitchen & Grill', 'Menu', 'Nyama choma platter', 1450, 'Chicken biryani', 950, 'Fresh passion juice', 300),
        ('groceries_essentials', 'Fresh Market', 'Groceries', 'Fruit basket', 1200, 'Breakfast pack', 1500, 'Toiletries kit', 900),
        ('laundry_cleaning', 'Spin Laundry', 'Services', 'Wash and fold, per kg', 250, 'Suit dry-clean', 950, 'Duvet cleaning', 1200),
        ('marketplace', 'Duka Marketplace', 'Products', 'Phone charger', 900, 'Travel adapter', 1200, 'Power bank', 2500),
        ('pharmacy', 'Afya Pharmacy', 'Pharmacy', 'Paracetamol, 20 tablets', 150, 'Oral rehydration salts', 200, 'First aid kit', 1800),
        ('health', 'Uzima Health Clinic', 'Care', 'Doctor home visit', 3500, 'Lab test at home', 2500, 'Nurse visit', 2000),
        ('tech_electronics', 'Byte Tech Store', 'Tech', 'Wireless earbuds', 3500, 'USB-C cable', 800, 'Laptop repair check', 3000),
        ('travel_tours', 'Savanna Safari Tours', 'Tours', 'Maasai Mara, 3 days', 45000, 'Naivasha day trip', 12000, 'Amboseli, 2 days', 30000),
        ('vehicle_services', 'Shine Auto Care', 'Services', 'Car wash', 800, 'Oil service', 4500, 'Puncture repair', 500),
        ('wellness', 'Serenity Wellness Spa', 'Treatments', 'Swedish massage, 60 min', 4000, 'Yoga class', 1500, 'Facial', 3500),
        ('concierge_services', 'Errand App Services', 'Services', 'Errand run', 800, 'Queue for me', 1000, 'Personal shopper', 2000),
        ('logistics_shipping', 'Swift Courier', 'Deliveries', 'Same-day parcel', 600, 'Document delivery', 400, 'Moving van', 8000)
      ) as x(category, name, section, item1, price1, item2, price2, item3, price3)
      join public.category_config cc on cc.category::text = x.category and cc.is_active
  loop
    v_slug := replace(c.category, '_', '-');

    -- ── fully onboarded ──
    v_user := pg_temp.demo_user('live.' || v_slug || '@nexgapp.com', '[Demo] ' || c.name, v_password);
    v_merchant := md5('demo-merchant-live-' || c.category)::uuid;

    insert into public.merchant (
      id, legal_name, trading_name, category, category_other, contact_name, contact_phone, contact_email,
      city_id, status, onboarding_step, submitted_at, went_live_at, went_live_by,
      accepting_orders, explore_visible, pay_on_delivery,
      hours_pattern, prep_minutes, capacity_per_15min, price_band,
      payout_rail, payout_account, answers, health_band, health_score, onboarding_source)
    values (
      v_merchant, '[Demo] ' || c.name || ' Ltd', '[Demo] ' || c.name, c.category::public.merchant_category,
      case when c.category = 'other' then 'Custom requests and errands' end,
      'Demo Owner', '+2547000' || lpad((abs(hashtext(c.category)) % 100000)::text, 5, '0'),
      'live.' || v_slug || '@nexgapp.com',
      v_city, 'live', 7, now() - interval '40 days', now() - interval '30 days', v_staff,
      true, v_show_on_site, false,
      'same_daily', 25, 6, 2,
      'mpesa_paybill', '{"paybill":"[demo]","account":"[demo]"}'::jsonb, '{}'::jsonb,
      'green', 90, 'scratch')
    on conflict (id) do nothing;

    insert into public.merchant_user (merchant_id, user_id, role)
    values (v_merchant, v_user, 'owner') on conflict do nothing;

    if not exists (select 1 from public.merchant_branch where merchant_id = v_merchant) then
      insert into public.merchant_branch
        (merchant_id, name, address_text, latitude, longitude, zone_id, is_primary, sort, source)
      values (v_merchant, 'Westlands', 'Demo address, Westlands, Nairobi',
              -1.2650, 36.8030, v_zone, true, 1, 'manual');
    end if;

    insert into public.merchant_hours (merchant_id, day_of_week, opens, closes)
    select v_merchant, d, time '08:00', time '22:00' from generate_series(0, 6) d
    on conflict do nothing;

    v_section := md5('demo-section-' || c.category)::uuid;
    insert into public.catalogue_section (id, merchant_id, name, sort)
    values (v_section, v_merchant, c.section, 1) on conflict (id) do nothing;
    if not exists (select 1 from public.catalogue_item where section_id = v_section) then
      insert into public.catalogue_item
        (section_id, merchant_id, name, price_kes, available, highlighted, sort)
      values (v_section, v_merchant, c.item1, c.price1, true, true, 1),
             (v_section, v_merchant, c.item2, c.price2, true, false, 2),
             (v_section, v_merchant, c.item3, c.price3, true, false, 3);
    end if;

    insert into public.document
      (owner_type, owner_id, requirement_id, storage_path, mime, size_bytes,
       status, reviewed_by, reviewed_at, expires_at, version)
    select 'merchant', v_merchant, rq.id,
           'merchant/' || v_merchant || '/' || rq.kind || '/demo.pdf',
           'application/pdf', 102400, 'verified', v_staff, now() - interval '30 days',
           case when rq.has_expiry then current_date + 300 end, 1
      from public.fn_merchant_required_docs(v_merchant) rq
    on conflict do nothing;

    insert into public.merchant_agreement_acceptance
      (merchant_id, category, agreement_id, version, accepted_by, accepted_at)
    select v_merchant, c.category, a.id, a.version, v_user, now() - interval '40 days'
      from public.merchant_agreement_category mac
      join lateral (select ma.id, ma.version from public.merchant_agreement ma
                     where ma.id = mac.agreement_id
                     order by ma.published_on desc, ma.created_at desc limit 1) a on true
     where mac.category = c.category
    on conflict do nothing;

    -- ── not finished: application in, documents still to send ──
    v_user := pg_temp.demo_user('new.' || v_slug || '@nexgapp.com', '[Demo] ' || c.name || ' (new)', v_password);
    v_merchant := md5('demo-merchant-new-' || c.category)::uuid;

    insert into public.merchant (
      id, legal_name, trading_name, category, category_other, contact_name, contact_phone, contact_email,
      city_id, status, onboarding_step, submitted_at,
      hours_pattern, prep_minutes, price_band,
      payout_rail, payout_account, answers, onboarding_source)
    values (
      v_merchant, '[Demo] ' || c.name || ' (new) Ltd', '[Demo] ' || c.name || ' (new)',
      c.category::public.merchant_category,
      case when c.category = 'other' then 'Custom requests and errands' end,
      'Demo Applicant', '+2547001' || lpad((abs(hashtext(c.category)) % 100000)::text, 5, '0'),
      'new.' || v_slug || '@nexgapp.com',
      v_city, 'documents_pending', 5, now() - interval '2 days',
      'same_daily', 30, 2,
      'mpesa_paybill', '{"paybill":"[demo]","account":"[demo]"}'::jsonb, '{}'::jsonb, 'scratch')
    on conflict (id) do nothing;

    insert into public.merchant_user (merchant_id, user_id, role)
    values (v_merchant, v_user, 'owner') on conflict do nothing;

    if not exists (select 1 from public.merchant_branch where merchant_id = v_merchant) then
      insert into public.merchant_branch
        (merchant_id, name, address_text, latitude, longitude, zone_id, is_primary, sort, source)
      values (v_merchant, 'Kilimani', 'Demo address, Kilimani, Nairobi',
              -1.2890, 36.7830, v_zone, true, 1, 'manual');
    end if;

    insert into public.merchant_agreement_acceptance
      (merchant_id, category, agreement_id, version, accepted_by, accepted_at)
    select v_merchant, c.category, a.id, a.version, v_user, now() - interval '2 days'
      from public.merchant_agreement_category mac
      join lateral (select ma.id, ma.version from public.merchant_agreement ma
                     where ma.id = mac.agreement_id
                     order by ma.published_on desc, ma.created_at desc limit 1) a on true
     where mac.category = c.category
    on conflict do nothing;
  end loop;

  -- ═══════════════════════════════════════════════ hosts

  v_user := pg_temp.demo_user('live.host@nexgapp.com', '[Demo] Host', v_password);
  v_host := md5('demo-host-live')::uuid;
  insert into public.host (
    id, kind, display_name, contact_name, phone, email, city_id,
    status, submitted_at, went_live_at, verified_at,
    verification_method, verification_submitted_at,
    packages_enabled, billing_method, default_handoff)
  values (
    v_host, 'multi_unit', '[Demo] Skyline Residences', 'Demo Host', '+254700090001',
    'live.host@nexgapp.com', v_city, 'live', now() - interval '20 days', now() - interval '14 days',
    now() - interval '14 days', 'listing_code', now() - interval '18 days',
    true, 'invoice', 'lockbox')
  on conflict (id) do nothing;
  insert into public.host_user (host_id, user_id, role, accepted_at)
  values (v_host, v_user, 'owner', now() - interval '20 days')
  on conflict (host_id, user_id) do nothing;

  v_property := md5('demo-property-live')::uuid;
  insert into public.property (id, host_id, slug, name, kind, area, city_id, check_in_from, check_out_by)
  values (v_property, v_host, 'demo-skyline-residences', '[Demo] Skyline Residences',
          'apartment_block', 'Kilimani', v_city, '14:00', '11:00')
  on conflict (id) do nothing;
  insert into public.unit (
    id, host_id, property_id, name, label_public, address_line, building, unit_no,
    city_id, zone_id, status, handoff, delivery_hours, readiness,
    bedrooms, max_guests, nightly_rate_kes)
  values
    (md5('demo-unit-live-1')::uuid, v_host, v_property, 'A101', 'Studio A101',
     'Demo address, Kilimani, Nairobi', '[Demo] Skyline Residences', 'A101', v_city, v_zone, 'live',
     'lockbox', '{"from":"06:00","to":"22:00"}'::jsonb,
     '{"address":true,"handoff":true,"contact_confirmed":true,"hours":true,"qr_placed":true}'::jsonb,
     1, 2, 6500),
    (md5('demo-unit-live-2')::uuid, v_host, v_property, 'B204', 'Two-bedroom B204',
     'Demo address, Kilimani, Nairobi', '[Demo] Skyline Residences', 'B204', v_city, v_zone, 'live',
     'lockbox', '{"from":"06:00","to":"22:00"}'::jsonb,
     '{"address":true,"handoff":true,"contact_confirmed":true,"hours":true,"qr_placed":true}'::jsonb,
     2, 4, 11000)
  on conflict (id) do nothing;

  v_user := pg_temp.demo_user('new.host@nexgapp.com', '[Demo] New host', v_password);
  v_host := md5('demo-host-new')::uuid;
  insert into public.host (
    id, kind, display_name, contact_name, phone, email, city_id,
    status, default_handoff, onboarding_step)
  values (
    v_host, 'single_unit', '[Demo] Garden Cottage', 'Demo New Host', '+254700090002',
    'new.host@nexgapp.com', v_city, 'applied', 'lockbox', 3)
  on conflict (id) do nothing;
  insert into public.host_user (host_id, user_id, role, accepted_at)
  values (v_host, v_user, 'owner', now() - interval '1 day')
  on conflict (host_id, user_id) do nothing;
  v_property := md5('demo-property-new')::uuid;
  insert into public.property (id, host_id, slug, name, kind, area, city_id)
  values (v_property, v_host, 'demo-garden-cottage', '[Demo] Garden Cottage', 'cottage', 'Lavington', v_city)
  on conflict (id) do nothing;
  insert into public.unit (id, host_id, property_id, name, label_public, city_id, zone_id, status, handoff)
  values (md5('demo-unit-new-1')::uuid, v_host, v_property, 'Cottage', 'Garden cottage',
          v_city, v_zone, 'setting_up', 'lockbox')
  on conflict (id) do nothing;

  -- ═══════════════════════════════════════════════ riders

  v_user := pg_temp.demo_user('live.rider@nexgapp.com', '[Demo] Rider', v_password);
  v_rider := md5('demo-rider-live')::uuid;
  insert into public.rider (
    id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
    status, presence, presence_changed_at, activated_at, activated_by,
    submitted_at, phone_verified_at, ownership, insurance, kit_issued_at,
    can_receive_offers, can_receive_offers_source,
    cash_on_hand, cash_cap, alcohol_eligible, large_items_eligible, bike_max_km,
    areas, shifts, payout_msisdn, health_band, health_score, top_decile,
    pay_on_delivery_eligible, source)
  values (
    v_rider, v_user, 'Demo', 'Rider', '+254700090003', v_city, 'motorbike', 'KMD 001D',
    'active', 'offline', now(), now() - interval '50 days', v_staff, now() - interval '55 days',
    now() - interval '55 days', 'own', 'comprehensive', now() - interval '50 days',
    true, 'rider', 0, 20000, true, true, 15,
    array['Westlands', 'Kilimani', 'CBD'], array['evenings', 'weekends'],
    '+254700090003', 'green', 88, false, true, 'nexg_pool')
  on conflict (id) do nothing;
  insert into public.document
    (owner_type, owner_id, requirement_id, storage_path, mime, size_bytes,
     status, reviewed_by, reviewed_at, expires_at, side, version)
  select 'rider', v_rider, rq.id,
         'rider/' || v_rider || '/' || rq.kind || '/' || coalesce(sd.side, 'one') || '.jpg',
         'image/jpeg', 204800, 'verified', v_staff, now() - interval '48 days',
         case when rq.has_expiry then current_date + 240 end, sd.side, 1
    from public.fn_rider_required_docs(v_rider) rq
    cross join lateral (
      select unnest(case when rq.kind = 'national_id'
                         then array['front', 'back'] else array[null::text] end) as side) sd
  on conflict do nothing;

  v_user := pg_temp.demo_user('new.rider@nexgapp.com', '[Demo] New rider', v_password);
  v_rider := md5('demo-rider-new')::uuid;
  insert into public.rider (
    id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
    status, presence, submitted_at, phone_verified_at, ownership, insurance,
    can_receive_offers, areas, shifts, payout_msisdn, bike_max_km, source)
  values (
    v_rider, v_user, 'Demo', 'New Rider', '+254700090004', v_city, 'motorbike', 'KMD 002D',
    'documents_pending', 'offline', now() - interval '2 days', now() - interval '2 days',
    'own', 'third_party', false, array['Westlands'], array['weekends'], '+254700090004', 12,
    'nexg_pool')
  on conflict (id) do nothing;

  -- ═══════════════════════════════════════════════ customer

  v_user := pg_temp.demo_user('customer.demo@nexgapp.com', 'Demo Customer', v_password);
  update auth.users
     set raw_user_meta_data = raw_user_meta_data || '{"first_name":"Demo"}'::jsonb
   where id = v_user;
  if not exists (select 1 from public.guest where user_id = v_user) then
    insert into public.guest (user_id, phone, name)
    values (v_user, '+254700090005', 'Demo Customer');
  end if;

  raise notice 'Demo accounts ready.';
end;
$$;

alter table public.merchant enable trigger form_alert_insert;
alter table public.merchant enable trigger staff_bell_insert;
alter table public.host enable trigger form_alert_insert;
alter table public.host enable trigger staff_bell_insert;
alter table public.rider enable trigger form_alert_insert;
alter table public.rider enable trigger staff_bell_insert;

commit;

-- Check: every demo login and what it opens.
select u.email,
       coalesce(m.trading_name, h.display_name, case when r.id is not null then 'Rider' end, 'Customer') as account,
       coalesce(m.status::text, h.status::text, r.status::text, 'customer') as status
  from auth.users u
  left join public.merchant_user mu on mu.user_id = u.id
  left join public.merchant m on m.id = mu.merchant_id
  left join public.host_user hu on hu.user_id = u.id
  left join public.host h on h.id = hu.host_id
  left join public.rider r on r.user_id = u.id
 where u.email ~ '^(live|new)\.|^customer\.demo@'
   and u.email like '%@nexgapp.com'
 order by u.email;
