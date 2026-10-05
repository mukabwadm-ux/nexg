-- Four partner logins, for working on the two dashboards.
--
-- Local only. This file runs on `supabase db reset` and never
-- against production — the repository is public, so a password in
-- it is a password everybody has.
--
-- Each account is a different state, because the states are the
-- point. A merchant who is live has a different screen from one
-- waiting on a document, and the only way to know either reads
-- right is to have both.
--
--   merchant.live@nexgapp.com   live, two stores, trading
--   merchant.docs@nexgapp.com   submitted, one document short
--   rider.active@nexgapp.com    active, on shift, earning
--   rider.docs@nexgapp.com      submitted, one document short
--
-- Password for all four: devpassword

do $$
declare
  v_city uuid;
  v_zone uuid;
  v_zone2 uuid;
  v_admin uuid;
  v_merchant_live uuid := 'a1000000-0000-4000-8000-000000000001';
  v_merchant_docs uuid := 'a1000000-0000-4000-8000-000000000002';
  v_rider_active uuid := 'a1000000-0000-4000-8000-000000000003';
  v_rider_docs uuid := 'a1000000-0000-4000-8000-000000000004';
  v_m_live uuid := 'b1000000-0000-4000-8000-000000000001';
  v_m_docs uuid := 'b1000000-0000-4000-8000-000000000002';
  v_r_active uuid := 'b1000000-0000-4000-8000-000000000003';
  v_r_docs uuid := 'b1000000-0000-4000-8000-000000000004';
  v_branch uuid;
  v_guest uuid;
  r record;
begin
  select id into v_city from public.city where name = 'Nairobi';
  if v_city is null then
    raise notice 'No Nairobi; partner logins skipped.';
    return;
  end if;

  /* Branches and menu items have no natural key, so `on conflict
     do nothing` cannot dedupe them — a second run would quietly
     give the demo merchant four stores. One check at the top is
     simpler than a unique index invented for a fixture. */
  if exists (select 1 from public.merchant where id = v_m_live) then
    raise notice 'Partner logins already seeded.';
    return;
  end if;
  select id into v_admin from public.staff_user where email = 'dev.admin@nexgapp.com';
  select id into v_zone from public.zone where city_id = v_city and name = 'Westlands';
  select id into v_zone2 from public.zone where city_id = v_city and name = 'Kilimani';
  if v_zone is null then
    select id into v_zone from public.zone where city_id = v_city order by tier limit 1;
  end if;

  -- ───────────────────────────────────────── the logins
  --
  -- The empty-string token columns are not decoration: they are
  -- nullable in the schema but GoTrue scans them into non-nullable
  -- Go strings, so a NULL here fails sign-in with "Database error
  -- querying schema", which reads like a wrong password and is not.

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token)
  select
    '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated',
    v.email, extensions.crypt('devpassword', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v.name),
    '', '', '', '', '', '', '', ''
  from (values
    (v_merchant_live, 'merchant.live@nexgapp.com',  '[Merchant Live]'),
    (v_merchant_docs, 'merchant.docs@nexgapp.com',  '[Merchant Pending]'),
    (v_rider_active,  'rider.active@nexgapp.com',   '[Rider Active]'),
    (v_rider_docs,    'rider.docs@nexgapp.com',     '[Rider Pending]')
  ) as v(id, email, name)
  on conflict (id) do nothing;

  -- ════════════════════════════ a merchant who is trading

  insert into public.merchant (
    id, legal_name, trading_name, category, contact_name, contact_phone, contact_email,
    city_id, status, onboarding_step, submitted_at, went_live_at, went_live_by,
    accepting_orders, explore_visible, pay_on_delivery, pay_on_delivery_cap_kes,
    hours_pattern, prep_minutes, capacity_per_15min, price_band,
    payout_rail, payout_account, answers, health_band, health_score,
    onboarding_source)
  values (
    v_m_live, '[Westlands Kitchen Ltd]', '[Westlands Kitchen]', 'restaurant',
    '[Owner One]', '+254700000901', 'merchant.live@nexgapp.com',
    v_city, 'live', 7, now() - interval '40 days', now() - interval '30 days', v_admin,
    true, true, true, 300000,
    'same_daily', 25, 6, 2,
    'mpesa_paybill', '{"paybill":"[—]","account":"[—]"}'::jsonb,
    '{"cuisine":"fast_food","serves_alcohol":"no","dietary":["vegetarian"],"spend_band":"500_1500"}'::jsonb,
    'green', 92, 'scratch')
  on conflict (id) do nothing;

  insert into public.merchant_user (merchant_id, user_id, role)
  values (v_m_live, v_merchant_live, 'owner')
  on conflict do nothing;

  insert into public.merchant_branch
    (merchant_id, name, address_text, latitude, longitude, zone_id, is_primary, sort, source)
  values
    (v_m_live, '[Westlands]', '[Street], Westlands, Nairobi',
     -1.2650, 36.8030, v_zone, true, 1, 'manual'),
    (v_m_live, '[Kilimani]', '[Road], Kilimani, Nairobi',
     -1.2890, 36.7830, coalesce(v_zone2, v_zone), false, 2, 'manual')
  on conflict do nothing;

  select id into v_branch from public.merchant_branch
   where merchant_id = v_m_live and is_primary;

  insert into public.merchant_hours (merchant_id, day_of_week, opens, closes)
  select v_m_live, d, time '08:00', time '22:00'
  from generate_series(0, 6) d
  on conflict do nothing;

  /* An item belongs to a section, and the trigger checks they
     belong to the same business. */
  insert into public.catalogue_section (id, merchant_id, name, sort)
  values ('c1000000-0000-4000-8000-000000000001', v_m_live, '[Menu]', 1)
  on conflict (id) do nothing;

  insert into public.catalogue_item
    (section_id, merchant_id, name, description, price_kes, available, sort)
  values
    ('c1000000-0000-4000-8000-000000000001', v_m_live, '[Item one]',   '[A description]', 450, true,  1),
    ('c1000000-0000-4000-8000-000000000001', v_m_live, '[Item two]',   '[A description]', 620, true,  2),
    ('c1000000-0000-4000-8000-000000000001', v_m_live, '[Item three]', '[A description]', 300, true,  3),
    ('c1000000-0000-4000-8000-000000000001', v_m_live, '[Item four]',  '[A description]', 780, true,  4),
    ('c1000000-0000-4000-8000-000000000001', v_m_live, '[Item five]',  '[A description]', 250, false, 5),
    ('c1000000-0000-4000-8000-000000000001', v_m_live, '[Item six]',   '[A description]', 540, true,  6)
  on conflict do nothing;

  /* Every essential document on file and verified, so this one
     reads 100% and the dashboard opens on trading rather than on a
     chase. */
  insert into public.document
    (owner_type, owner_id, requirement_id, storage_path, mime, size_bytes,
     status, reviewed_by, reviewed_at, expires_at, version)
  select 'merchant', v_m_live, rq.id,
         'merchant/' || v_m_live || '/' || rq.kind || '/seed.pdf',
         'application/pdf', 102400, 'verified', v_admin, now() - interval '28 days',
         case when rq.has_expiry then current_date + 300 end, 1
  from public.fn_merchant_required_docs(v_m_live) rq
  on conflict do nothing;

  insert into public.merchant_message (merchant_id, direction, channel, subject, body, created_at)
  values
    (v_m_live, 'out', 'in_app', 'You are live',
     'Your first store is taking orders. Keep an eye on prep times — guests are quoted what you set.',
     now() - interval '30 days'),
    (v_m_live, 'out', 'in_app', 'Featured slots are open',
     'Your health band has been green for a month, which makes you eligible. Have a look under Featured.',
     now() - interval '2 days')
  on conflict do nothing;

  -- ════════════════════ a merchant one document short

  insert into public.merchant (
    id, legal_name, trading_name, category, contact_name, contact_phone, contact_email,
    city_id, status, onboarding_step, submitted_at,
    hours_pattern, prep_minutes, price_band,
    payout_rail, payout_account, answers, onboarding_source)
  values (
    v_m_docs, '[Kilimani Laundry Ltd]', '[Kilimani Laundry]', 'laundry',
    '[Owner Two]', '+254700000902', 'merchant.docs@nexgapp.com',
    v_city, 'documents_pending', 6, now() - interval '3 days',
    'same_daily', 45, 2,
    'mpesa_paybill', '{"paybill":"[—]","account":"[—]"}'::jsonb,
    '{"services":["wash_fold","wash_iron"],"pricing_basis":"per_bag","turnaround":"next_day","collection":"rider_collects"}'::jsonb,
    'scratch')
  on conflict (id) do nothing;

  insert into public.merchant_user (merchant_id, user_id, role)
  values (v_m_docs, v_merchant_docs, 'owner')
  on conflict do nothing;

  insert into public.merchant_branch
    (merchant_id, name, address_text, latitude, longitude, zone_id, is_primary, sort, source)
  values (v_m_docs, '[Kilimani]', '[Road], Kilimani, Nairobi',
          -1.2890, 36.7830, coalesce(v_zone2, v_zone), true, 1, 'manual')
  on conflict do nothing;

  insert into public.catalogue_section (id, merchant_id, name, sort)
  values ('c1000000-0000-4000-8000-000000000002', v_m_docs, '[Services]', 1)
  on conflict (id) do nothing;

  insert into public.catalogue_item
    (section_id, merchant_id, name, price_kes, available, sort)
  values
    ('c1000000-0000-4000-8000-000000000002', v_m_docs, '[Service one]',   400, true, 1),
    ('c1000000-0000-4000-8000-000000000002', v_m_docs, '[Service two]',   650, true, 2),
    ('c1000000-0000-4000-8000-000000000002', v_m_docs, '[Service three]', 200, true, 3),
    ('c1000000-0000-4000-8000-000000000002', v_m_docs, '[Service four]',  900, true, 4),
    ('c1000000-0000-4000-8000-000000000002', v_m_docs, '[Service five]',  350, true, 5)
  on conflict do nothing;

  /*
   * All but one, and one of those rejected — which is the state
   * worth looking at. A merchant who uploaded something and had it
   * turned down needs to know *why*, and that sentence is the only
   * thing standing between them and trading.
   */
  insert into public.document
    (owner_type, owner_id, requirement_id, storage_path, mime, size_bytes,
     status, reviewed_by, reviewed_at, rejection_reason, expires_at, version)
  select 'merchant', v_m_docs, rq.id,
         'merchant/' || v_m_docs || '/' || rq.kind || '/seed.pdf',
         'application/pdf', 102400,
         (case when rq.kind = 'kra_pin' then 'rejected' else 'verified' end)::public.document_status,
         v_admin, now() - interval '1 day',
         case when rq.kind = 'kra_pin'
              then 'The photo cuts off the bottom of the certificate. Send one with all four corners in frame.' end,
         case when rq.has_expiry then current_date + 200 end, 1
  from public.fn_merchant_required_docs(v_m_docs) rq
  where rq.kind <> 'business_permit'
  on conflict do nothing;

  insert into public.document_request
    (owner_type, owner_id, requirement_id, note, requested_by, created_at)
  select 'merchant', v_m_docs, rq.id,
         'We still need this one before you can go live.', v_admin, now() - interval '1 day'
  from public.fn_merchant_required_docs(v_m_docs) rq
  where rq.kind = 'business_permit'
  on conflict do nothing;

  insert into public.merchant_message (merchant_id, direction, channel, subject, body, created_at)
  values (v_m_docs, 'out', 'in_app', 'One document to go',
          'Everything else checks out. Send the last one and we will have you live the same day.',
          now() - interval '1 day')
  on conflict do nothing;

  -- ═══════════════════════════════ a rider who is working

  insert into public.rider (
    id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
    status, presence, presence_changed_at, activated_at, activated_by,
    submitted_at, phone_verified_at, ownership, insurance, kit_issued_at,
    last_location, last_location_at, last_seen_at,
    can_receive_offers, can_receive_offers_source,
    cash_on_hand, cash_cap, alcohol_eligible, large_items_eligible, bike_max_km,
    areas, shifts, payout_msisdn, health_band, health_score, top_decile,
    pay_on_delivery_eligible, source)
  values (
    v_r_active, v_rider_active, '[Rider]', '[Active]', '+254700000903',
    v_city, 'motorbike', 'KMD [L1]', 'active', 'online', now() - interval '2 hours',
    now() - interval '50 days', v_admin, now() - interval '55 days',
    now() - interval '55 days', 'own', 'comprehensive', now() - interval '50 days',
    extensions.st_setsrid(extensions.st_makepoint(36.8075, -1.2650), 4326)::extensions.geography,
    now() - interval '3 minutes', now() - interval '3 minutes',
    true, 'rider',
    1400, 20000, true, true, 15,
    array['Westlands', 'Kilimani', 'CBD'],
    array['evenings', 'late_night', 'weekends'],
    '+254700000903', 'green', 88, true, true, 'nexg_pool')
  on conflict (id) do nothing;

  insert into public.document
    (owner_type, owner_id, requirement_id, storage_path, mime, size_bytes,
     status, reviewed_by, reviewed_at, expires_at, side, version)
  select 'rider', v_r_active, rq.id,
         'rider/' || v_r_active || '/' || rq.kind || '/' || coalesce(sd.side, 'one') || '.jpg',
         'image/jpeg', 204800, 'verified', v_admin, now() - interval '48 days',
         /* The licence expires inside the month, because that
            banner is the main thing this page has to get right. */
         case when rq.kind = 'driving_licence' then current_date + 18
              when rq.has_expiry then current_date + 240 end,
         sd.side, 1
  from public.fn_rider_required_docs(v_r_active) rq
  /* A national ID is two documents wearing one name, and the
     readiness check counts the sides. */
  cross join lateral (
    select unnest(case when rq.kind = 'national_id'
                       then array['front', 'back'] else array[null::text] end) as side
  ) sd
  on conflict do nothing;

  insert into public.rider_earning
    (rider_id, order_reference, base_kes, distance_kes, waiting_kes,
     pickup_bonus_kes, peak_bonus_kes, tip_kes, penalty_kes, total_kes,
     cash_collected_kes, is_test, earned_at)
  select v_r_active, 'NX-SEED-E' || g, 150, 40 + g * 5, 0, 0,
         case when g % 3 = 0 then 50 else 0 end, 0, 0,
         150 + 40 + g * 5 + case when g % 3 = 0 then 50 else 0 end,
         case when g % 2 = 0 then 700 else 0 end, false,
         now() - make_interval(hours => g * 2)
  from generate_series(1, 9) g
  on conflict do nothing;

  insert into public.rider_message (rider_id, direction, channel, subject, body, created_at)
  values
    (v_r_active, 'out', 'in_app', 'Your licence expires soon',
     'It is on file and verified, but it runs out in under a month. Send the new one when you have it and nothing will be interrupted.',
     now() - interval '1 day')
  on conflict do nothing;

  -- ═══════════════════════ a rider one document short

  insert into public.rider (
    id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
    status, presence, submitted_at, phone_verified_at, ownership, insurance,
    can_receive_offers, areas, shifts, payout_msisdn, bike_max_km, source)
  values (
    v_r_docs, v_rider_docs, '[Rider]', '[Pending]', '+254700000904',
    v_city, 'motorbike', 'KMD [L2]', 'documents_pending', 'offline',
    now() - interval '2 days', now() - interval '2 days', 'own', 'third_party',
    false, array['Westlands'], array['weekends'], '+254700000904', 12,
    'nexg_pool')
  on conflict (id) do nothing;

  insert into public.document
    (owner_type, owner_id, requirement_id, storage_path, mime, size_bytes,
     status, reviewed_by, reviewed_at, rejection_reason, expires_at, version)
  select 'rider', v_r_docs, rq.id,
         'rider/' || v_r_docs || '/' || rq.kind || '/seed.jpg',
         'image/jpeg', 204800,
         (case when rq.kind = 'logbook_or_plate' then 'rejected' else 'uploaded' end)::public.document_status,
         case when rq.kind = 'logbook_or_plate' then v_admin end,
         case when rq.kind = 'logbook_or_plate' then now() - interval '1 day' end,
         case when rq.kind = 'logbook_or_plate'
              then 'The picture is too dark to read the number. Try again in daylight, flat on a table.' end,
         case when rq.has_expiry then current_date + 150 end, 1
  from public.fn_rider_required_docs(v_r_docs) rq
  where rq.kind <> 'national_id'
  on conflict do nothing;

  insert into public.document_request
    (owner_type, owner_id, requirement_id, note, requested_by, created_at)
  select 'rider', v_r_docs, rq.id,
         'We need this before you can start taking deliveries.', v_admin, now() - interval '1 day'
  from public.fn_rider_required_docs(v_r_docs) rq
  where rq.kind = 'national_id'
  on conflict do nothing;

  -- ═══════════════════════════ orders for the live merchant

  select id into v_guest from public.guest where phone = '+254700000800';
  if v_guest is null then
    insert into public.guest (phone, name) values ('+254700000800', '[Guest]')
    returning id into v_guest;
  end if;

  insert into public.order (
    reference, guest_id, merchant_id, branch_id, city_id, zone_id, channel,
    dropoff_label, dropoff_point, stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents,
    commission_cents, commission_pct, currency, carry_requirements,
    placed_at, confirmed_at, promised_ready_at, ready_at,
    picked_up_at, delivered_at, rider_id, handed_to, promised_delivery_at)
  select
    'NX-SEED-M' || v.n, v_guest, v_m_live, v_branch, v_city, v_zone, 'web',
    v.drop,
    extensions.st_setsrid(extensions.st_makepoint(36.80, -1.273), 4326)::extensions.geography,
    v.stage::public.order_stage, v.pay::public.order_payment_method,
    v.paystat::public.order_payment_status,
    v.sub, 25000, round(v.sub * 0.05), v.sub + 25000 + round(v.sub * 0.05),
    round(v.sub * 0.18), 18, 'KES', array['motorbike'],
    now() - make_interval(mins => v.age),
    now() - make_interval(mins => v.age - 1),
    now() - make_interval(mins => v.age - 25),
    case when v.ready then now() - make_interval(mins => v.age - 24) end,
    case when v.picked then now() - make_interval(mins => v.age - 30) end,
    case when v.delivered then now() - make_interval(mins => v.age - 45) end,
    case when v.picked then v_r_active end,
    case when v.delivered then 'guest'::public.handoff_target end,
    now() - make_interval(mins => v.age - 45)
  from (values
    (1, '[Hotel] · Rm [—]',      'delivered', 'mpesa_stk',       'paid',      120000, 220, true,  true,  true),
    (2, '[Apartment] · Kilimani','delivered', 'cash_on_delivery','collected',  86000, 180, true,  true,  true),
    (3, '[Guest house] · Karen', 'picked_up', 'card',            'paid',      140000,  38, true,  true,  false),
    (4, '[Hotel] · Rm [—]',      'preparing', 'mpesa_stk',       'paid',       64000,   9, false, false, false),
    (5, '[Apartment] · Westlands','placed',   'cash_on_delivery','pending',    95000,   3, false, false, false)
  ) as v(n, drop, stage, pay, paystat, sub, age, ready, picked, delivered)
  on conflict (reference) do nothing;

  insert into public.order_item (order_id, name, quantity, unit_price_cents, line_total_cents)
  select o.id, '[Item one]', 2, 45000, 90000
    from public.order o where o.reference like 'NX-SEED-M%'
  on conflict do nothing;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, at)
  select o.id, 'placed', 'Placed by guest', 'Web', 'guest', '[Guest]', o.placed_at
    from public.order o where o.reference like 'NX-SEED-M%'
  on conflict do nothing;

  /* A paid statement must carry the provider reference that proves
     it — the constraint is there so "paid" can never be a claim
     without evidence behind it. */
  insert into public.merchant_statement
    (merchant_id, period_start, period_end, gross_kes, commission_kes,
     adjustments_kes, penalties_kes, tax_withheld_kes, net_kes, status,
     paid_at, provider_ref)
  values
    (v_m_live, (current_date - 14)::date, (current_date - 8)::date,
     48200, 8676, 0, 0, 0, 39524, 'paid',
     now() - interval '7 days', 'SEED-[—]')
  on conflict do nothing;

  insert into public.merchant_statement
    (merchant_id, period_start, period_end, gross_kes, commission_kes,
     adjustments_kes, penalties_kes, tax_withheld_kes, net_kes, status)
  values
    (v_m_live, (current_date - 7)::date, (current_date - 1)::date,
     51900, 9342, 0, 0, 0, 42558, 'sent')
  on conflict do nothing;

  raise notice 'Partner logins seeded. merchant.live / merchant.docs / rider.active / rider.docs @nexgapp.com, password devpassword.';
end
$$;
