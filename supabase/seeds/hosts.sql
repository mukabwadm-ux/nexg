-- Two host logins, one in each state.
--
-- Local only. This file runs on `supabase db reset` and never
-- against production — the repository is public, so a password
-- in it is a password everybody has.
--
-- Two accounts because the host portal genuinely has two
-- screens, not one screen with things hidden. A host who is
-- setting up needs to know what is left and in what order; a
-- host who is live needs to know what is happening right now.
-- The only way to know both read correctly is to have both.
--
--   host.live@nexgapp.com      live, 3 properties, QR activity
--   host.pending@nexgapp.com   registered, 2 of 5 steps done
--
-- Password for both: devpassword

do $$
declare
  v_city uuid;
  v_zone uuid;
  v_live_user uuid := 'c1000000-0000-4000-8000-000000000001';
  v_pend_user uuid := 'c1000000-0000-4000-8000-000000000002';
  v_live_host uuid := 'c2000000-0000-4000-8000-000000000001';
  v_pend_host uuid := 'c2000000-0000-4000-8000-000000000002';
  v_prop_a uuid := 'c3000000-0000-4000-8000-000000000001';
  v_prop_b uuid := 'c3000000-0000-4000-8000-000000000002';
  v_prop_c uuid := 'c3000000-0000-4000-8000-000000000003';
  v_prop_p uuid := 'c3000000-0000-4000-8000-000000000004';
  v_unit_a1 uuid := 'c4000000-0000-4000-8000-000000000001';
  v_unit_a2 uuid := 'c4000000-0000-4000-8000-000000000002';
  v_unit_b1 uuid := 'c4000000-0000-4000-8000-000000000003';
  v_unit_c1 uuid := 'c4000000-0000-4000-8000-000000000004';
  v_unit_p1 uuid := 'c4000000-0000-4000-8000-000000000005';
  v_merchant uuid;
  /* bigint, not uuid: qr_scan.id is a generated identity. */
  v_scan bigint;
  i integer;
  v_qr uuid;
begin
  select id into v_city from public.city where slug = 'nairobi';
  select id into v_zone from public.zone where city_id = v_city and active
   order by created_at limit 1;
  select id into v_merchant from public.merchant where status = 'live' limit 1;

  -- ═════════════════════════════════════════════ the logins

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token)
  values
    ('00000000-0000-0000-0000-000000000000', v_live_user,
     'authenticated', 'authenticated', 'host.live@nexgapp.com',
     crypt('devpassword', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"[Host Live]"}'::jsonb, '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_pend_user,
     'authenticated', 'authenticated', 'host.pending@nexgapp.com',
     crypt('devpassword', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"[Host Pending]"}'::jsonb, '', '', '', '', '', '', '', '')
  on conflict (id) do nothing;

  -- ═══════════════════════════════════ A · the live host

  insert into public.host (
    id, kind, display_name, contact_name, phone, email, city_id,
    status, submitted_at, went_live_at, verified_at,
    verification_method, verification_submitted_at,
    packages_enabled, billing_method, default_handoff)
  values (
    v_live_host, 'multi_unit', '[Seed Residences]', '[Host Live]',
    '+254700000211', 'host.live@nexgapp.com', v_city,
    'live', now() - interval '20 days', now() - interval '14 days',
    now() - interval '14 days', 'listing_code', now() - interval '18 days',
    true, 'invoice', 'leave_with_askari')
  on conflict (id) do update
    set status = 'live', went_live_at = excluded.went_live_at;

  insert into public.host_user (host_id, user_id, role, accepted_at)
  values (v_live_host, v_live_user, 'owner', now() - interval '20 days')
  on conflict (host_id, user_id) do nothing;

  insert into public.property (id, host_id, slug, name, kind, area, city_id, check_in_from, check_out_by)
  values
    (v_prop_a, v_live_host, 'seed-residences', '[Seed Residences]', 'apartment_block', 'Kilimani', v_city, '14:00', '11:00'),
    (v_prop_b, v_live_host, 'seed-riverside', '[Seed Riverside]', 'apartment_block', 'Riverside', v_city, '15:00', '10:00'),
    (v_prop_c, v_live_host, 'seed-suites', '[Seed Suites]', 'apartment_block', 'Westlands', v_city, '14:00', '11:00')
  on conflict (id) do nothing;

  /*
   * Four units: three fully ready and live, one deliberately
   * live without its card placed. That last one is what drives
   * the "a live unit has no QR card" attention row — a state
   * that is easy to reach in real life and invisible unless
   * somebody is told.
   */
  /* A live unit must have an address and a hand-off rule, and
     one received by a named person must have that person's
     confirmation. Both are check constraints — the database
     refusing to call a unit live when a rider would not know
     where to go or who to give it to. */
  insert into public.unit (
    id, host_id, property_id, name, label_public, address_line, building, unit_no,
    city_id, zone_id, status, handoff,
    caretaker_name, caretaker_confirmed_at, delivery_hours, readiness)
  values
    (v_unit_a1, v_live_host, v_prop_a, 'A1204', 'Apartment A1204', '[Address], Kilimani, Nairobi', '[Seed Residences]', 'A1204', v_city, v_zone, 'live',
     'leave_with_askari', '[Caretaker]', now() - interval '13 days', '{"from":"06:00","to":"22:00"}'::jsonb,
     '{"address":true,"handoff":true,"contact_confirmed":true,"hours":true,"qr_placed":true}'::jsonb),
    (v_unit_a2, v_live_host, v_prop_a, 'A0810', 'Apartment A0810', '[Address], Kilimani, Nairobi', '[Seed Residences]', 'A0810', v_city, v_zone, 'live',
     'reception', '[Caretaker]', now() - interval '13 days', '{"from":"06:00","to":"22:00"}'::jsonb,
     '{"address":true,"handoff":true,"contact_confirmed":true,"hours":true,"qr_placed":true}'::jsonb),
    (v_unit_b1, v_live_host, v_prop_b, 'B0903', 'Apartment B0903', '[Address], Riverside, Nairobi', '[Seed Riverside]', 'B0903', v_city, v_zone, 'live',
     'lockbox', null, null, '{"from":"08:00","to":"20:00"}'::jsonb,
     '{"address":true,"handoff":true,"contact_confirmed":true,"hours":true,"qr_placed":false}'::jsonb),
    (v_unit_c1, v_live_host, v_prop_c, 'C0701', 'Apartment C0701', '[Address], Westlands, Nairobi', '[Seed Suites]', 'C0701', v_city, v_zone, 'live',
     'reception', '[Front desk]', now() - interval '10 days', '{"from":"00:00","to":"23:59"}'::jsonb,
     '{"address":true,"handoff":true,"contact_confirmed":true,"hours":true,"qr_placed":true}'::jsonb)
  on conflict (id) do nothing;

  /*
   * A card per placed unit, then scans against those cards.
   *
   * The scan table requires a card, which is the schema saying
   * what the product says: a scan is an event that happened to
   * a physical thing somebody printed and put in a room.
   */
  for i in 1..3 loop
    v_qr := ('c5000000-0000-4000-8000-00000000000' || i)::uuid;
    insert into public.property_qr (
      id, code, state, generated_at, sent_at, placed_confirmed_at,
      owner_type, owner_id, placement, host_id, city_id, label, secret_hash)
    values (
      /* The alphabet has no 0 or 1 — they are too easily
         misread off a printed card — so `NXG-SEED01` is a code
         the renderer correctly refuses, and every seeded card
         had an unloadable preview. */
      v_qr, 'NXG-SEED' || translate(i::text, '1', 'Z') || 'A', 'placed',
      now() - interval '14 days', now() - interval '13 days', now() - interval '12 days',
      'unit',
      case i when 1 then v_unit_a1 when 2 then v_unit_a2 else v_unit_c1 end,
      'counter', v_live_host, v_city,
      case i when 1 then 'A1204' when 2 then 'A0810' else 'C0701' end,
      encode(extensions.digest('seed-card-' || i::text, 'sha256'), 'hex'))
    on conflict (id) do nothing;
  end loop;

  /*
   * Scans across the week. Outcomes are mixed on purpose: a
   * table where every row converted teaches nobody what a quiet
   * scan looks like, and a host needs to recognise both.
   */
  for i in 0..13 loop
    insert into public.qr_scan (
      qr_id, scanned_at, code, owner_type, owner_id, host_id, city_id, zone_id,
      placement, outcome, is_bot, is_test)
    values (
      ('c5000000-0000-4000-8000-00000000000' || (1 + (i % 3)))::uuid,
      now() - (i || ' hours')::interval - ((i / 3) || ' days')::interval,
      'NXG-SEED' || translate((1 + (i % 3))::text, '1', 'Z') || 'A',
      'unit',
      case (i % 3) when 0 then v_unit_a1 when 1 then v_unit_a2 else v_unit_c1 end,
      v_live_host, v_city, v_zone, 'counter',
      case when i % 3 = 0 then 'ordered'::public.qr_scan_outcome
           when i % 3 = 1 then 'browsed'::public.qr_scan_outcome
           else 'landed'::public.qr_scan_outcome end,
      false, true);
  end loop;


  /*
   * Genuine scans, and the orders that came out of them.
   *
   * The fourteen above are flagged `is_test`, which is correct —
   * they were written to exercise the QR tables. Analytics
   * excludes test and bot scans at the view, so with only those
   * the module reads "no scans in this window" for a host who
   * plainly has cards out. These are the real ones: a month of
   * them, weighted to the evening because that is when somebody
   * in a flat decides they are not cooking.
   */
  /*
   * Skipped when it has already run. The orders below carry
   * ledger transactions, so a second pass cannot simply delete
   * and re-insert — and without this guard a replay doubles the
   * scan count, which is a figure somebody would read.
   */
  if not exists (
    select 1 from public.qr_scan
     where host_id = v_live_host and not is_bot and not is_test)
  then
  for i in 0..59 loop
    insert into public.qr_scan (
      qr_id, scanned_at, code, owner_type, owner_id, host_id, city_id, zone_id,
      placement, outcome, is_bot, is_test)
    values (
      ('c5000000-0000-4000-8000-00000000000' || (1 + (i % 3)))::uuid,
      /* Spread over 30 days and weighted to the evening: a flat
         hourly distribution is the one shape real scan data
         never has, and a heat map built on it teaches the
         wrong thing.

         Built in Nairobi time and converted back, not in UTC.
         The first version truncated the UTC day and added 17
         hours, which lands at 20:00 Nairobi and pushed half the
         run past midnight — the heat map's busiest hour came
         out as 00:00, which no flat in Kilimani has. */
      (date_trunc('day', (now() at time zone 'Africa/Nairobi')
          - ((i / 2) || ' days')::interval)
        + ((17 + (i % 6)) || ' hours')::interval
        + ((i * 7 % 60) || ' minutes')::interval) at time zone 'Africa/Nairobi',
      'NXG-SEED' || translate((1 + (i % 3))::text, '1', 'Z') || 'A',
      'unit',
      case (i % 3) when 0 then v_unit_a1 when 1 then v_unit_a2 else v_unit_c1 end,
      v_live_host, v_city, v_zone, 'counter',
      case when i % 4 = 0 then 'ordered'::public.qr_scan_outcome
           when i % 4 = 1 then 'browsed'::public.qr_scan_outcome
           else 'landed'::public.qr_scan_outcome end,
      false, false)
    returning id into v_scan;

    /*
     * A different conversion rate per unit: 35%, 25%, 20%.
     *
     * The first version ordered on every fourth scan full stop.
     * Because the unit also cycles every three, each one landed
     * on exactly five of twenty and the Analytics table read
     * 25%, 25%, 25% — a column that identical is the one a host
     * would assume is broken, and the module's whole job is to
     * let them tell one unit from another.
     */
    if (case i % 3
          when 0 then (i / 3) % 3 = 0
          when 1 then (i / 3) % 4 = 0
          else (i / 3) % 5 = 0
        end) then
      insert into public."order" (
        id, reference, qr_scan_id, merchant_id, city_id, zone_id, channel,
        dropoff_label, stage, payment_method, payment_status,
        subtotal_cents, delivery_fee_cents, total_cents,
        placed_at, delivered_at, handed_to, handoff_photo_path)
      values (
        gen_random_uuid(),
        'NX-H' || lpad(i::text, 4, '0'),
        v_scan,
        v_merchant, v_city, v_zone, 'qr',
        case (i % 3) when 0 then 'A1204' when 1 then 'A0810' else 'C0701' end,
        /* Three still moving, so the On-the-way tab is not an
           empty state on a host who has sixty scans. */
        case when i < 12 then 'arriving'::public.order_stage
             else 'delivered'::public.order_stage end,
        'mpesa_stk', 'paid',
        (900 + (i * 137 % 2600)) * 100,
        20000,
        (900 + (i * 137 % 2600)) * 100 + 20000,
        (date_trunc('day', (now() at time zone 'Africa/Nairobi')
            - ((i / 2) || ' days')::interval)
          + ((17 + (i % 6)) || ' hours')::interval
          + ((i * 7 % 60) || ' minutes')::interval) at time zone 'Africa/Nairobi',
        case when i < 12 then null else
          (date_trunc('day', (now() at time zone 'Africa/Nairobi')
              - ((i / 2) || ' days')::interval)
            + ((17 + (i % 6)) || ' hours')::interval
            + ((i * 7 % 60) + 28 + (i % 17) || ' minutes')::interval)
            at time zone 'Africa/Nairobi' end,
        case when i < 12 then null
             when i % 8 = 0 then 'askari'::public.handoff_target
             else 'guest'::public.handoff_target end,
        /* Not every delivery has one. A photo-proof figure of
           100% is the one number a host would never check. */
        case when i >= 12 and i % 12 <> 0 then 'proof/seed-' || i || '.jpg' end);
    end if;
  end loop;
  end if;


  -- ═══════════════════════ stays, requests, referrals

  /*
   * Twelve stays across the month, from three sources, so the
   * calendar has something with shape rather than a single row.
   * One is deliberately flagged as a conflict: two bookings in
   * one unit is a thing that happens when a calendar sync and a
   * host both enter the same guest, and the portal's job is to
   * show it rather than silently pick one.
   */
  for i in 0..11 loop
    insert into public.stay (
      id, host_id, property_id, unit_id, guest_first_name,
      party_adults, check_in, check_out, source, status,
      conflict_flagged, phone)
    values (
      ('c6000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid,
      v_live_host, v_prop_a,
      case (i % 4) when 0 then v_unit_a1 when 1 then v_unit_a2
                   when 2 then v_unit_b1 else v_unit_c1 end,
      (array['Sarah', 'Michael', 'Amina', 'Daniel', 'Fatima', 'James'])[1 + (i % 6)],
      1 + (i % 3),
      date_trunc('day', now()) - ((14 - i) || ' days')::interval + interval '14 hours',
      date_trunc('day', now()) - ((14 - i) || ' days')::interval + interval '3 days 11 hours',
      (array['airbnb', 'booking_com', 'entered'])[1 + (i % 3)],
      case when i < 9 then 'departed' else 'in_stay' end,
      i = 7,
      '+25470000' || lpad((100 + i)::text, 4, '0'))
    on conflict (id) do nothing;

    /* A review on most of them, not all — a host with a 100%
       review rate learns nothing from the number. */
    if i % 3 <> 0 then
      insert into public.stay_review (stay_id, rating, text, themes, asked_at, answered_at)
      values (
        ('c6000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid,
        4 + (i % 2),
        (array['Fast deliveries, clear door instructions.',
               'Rider was friendly and on time.',
               'Wi-Fi dropped twice but the stay was good.'])[1 + (i % 3)],
        /* Indexing an array of arrays yields a scalar, not an
           array — so the branch is explicit. */
        case (i % 3)
          when 0 then array['deliveries']
          when 1 then array['riders']
          else array['wifi']
        end,
        now() - ((10 - i) || ' days')::interval,
        now() - ((10 - i) || ' days')::interval + interval '3 hours')
      on conflict (stay_id) do nothing;
    end if;
  end loop;

  /*
   * The priority clocks, as the design states them. Stored per
   * host because a promise an owner cannot see is one they
   * cannot be held to.
   */
  insert into public.host_priority_rule (host_id, priority, minutes, label)
  values
    (v_live_host, 'high', 15, 'Access, safety, guest locked out'),
    (v_live_host, 'medium', 120, 'Stay changes, amenities'),
    (v_live_host, 'low', 1440, 'Info, recommendations')
  on conflict (host_id, priority) do nothing;

  /*
   * Seven open requests across the priorities, one of them
   * minutes from breaching. The near-breach is the point: a
   * queue where nothing is ever late teaches nobody what late
   * looks like.
   */
  insert into public.host_request (
    id, host_id, unit_id, kind, type, priority, title, detail,
    raised_by, owner_kind, due_at, status, created_at)
  values
    ('c7000000-0000-4000-8000-000000000001', v_live_host, v_unit_a1,
     'issue', 'access', 'high', 'Gate code not working; rider waiting outside',
     'Guest says the gate code is rejected. Rider has the groceries at the gate.',
     'guest', 'host', now() + interval '4 minutes', 'waiting_on_host',
     now() - interval '11 minutes'),
    ('c7000000-0000-4000-8000-000000000002', v_live_host, v_unit_a2,
     'request', 'late_checkout', 'medium', 'Late check-out to 14:00',
     'Flight is in the evening.', 'guest', 'host',
     now() + interval '1 hour', 'waiting_on_host', now() - interval '1 hour'),
    ('c7000000-0000-4000-8000-000000000003', v_live_host, v_unit_c1,
     'request', 'amenities', 'medium', 'Extra towels and a hair dryer',
     null, 'guest', 'nexg_concierge', now() + interval '90 minutes',
     'in_progress', now() - interval '30 minutes'),
    ('c7000000-0000-4000-8000-000000000004', v_live_host, v_unit_b1,
     'request', 'transport', 'low', 'Airport transfer on the 17th',
     'Early morning pickup.', 'guest', 'nexg_concierge',
     now() + interval '2 days', 'quoted', now() - interval '3 hours'),
    ('c7000000-0000-4000-8000-000000000005', v_live_host, v_unit_a1,
     'issue', 'order', 'medium', 'Order went to the wrong unit',
     'Delivered to A0810 instead of A1204.', 'guest', 'nexg_support',
     now() - interval '2 hours', 'resolved', now() - interval '5 hours'),
    ('c7000000-0000-4000-8000-000000000006', v_live_host, v_unit_b1,
     'issue', 'rider_conduct', 'low', 'Rider left packaging in the lobby',
     null, 'host', 'nexg_rider_ops', now() + interval '2 days',
     'open', now() - interval '1 day'),
    ('c7000000-0000-4000-8000-000000000007', v_live_host, v_unit_a2,
     'request', 'recommendations', 'low', 'Wi-Fi password for the new stay',
     null, 'guest', 'auto', null, 'resolved', now() - interval '2 days')
  on conflict (id) do nothing;

  update public.host_request
     set resolved_at = created_at + interval '34 minutes',
         outcome = 'Refund issued', satisfaction = 5
   where id = 'c7000000-0000-4000-8000-000000000005';
  update public.host_request
     set resolved_at = created_at + interval '2 minutes', outcome = 'Answered automatically'
   where id = 'c7000000-0000-4000-8000-000000000007';

  /* Nine referrals, seven live — the shape the design shows. */
  for i in 1..9 loop
    insert into public.host_referral (
      id, referrer_host_id, code, referred_area, referred_units,
      created_at, live_at, reward_status)
    values (
      ('c8000000-0000-4000-8000-00000000000' || i)::uuid,
      v_live_host, 'host-SEEDA',
      (array['Kilimani', 'Westlands', 'Lavington', 'Kileleshwa'])[1 + (i % 4)],
      1 + (i % 6),
      now() - ((40 - i * 3) || ' days')::interval,
      case when i <= 7 then now() - ((30 - i * 3) || ' days')::interval end,
      case when i <= 7 then 'credited' else 'pending' end)
    on conflict (id) do nothing;
  end loop;

  -- ════════════════════════════════ B · the pending host

  insert into public.host (
    id, kind, display_name, contact_name, phone, email, city_id,
    status, default_handoff, onboarding_step)
  values (
    v_pend_host, 'single_unit', '[The Curve Residences]', '[Host Pending]',
    '+254700000221', 'host.pending@nexgapp.com', v_city,
    'applied', 'leave_with_askari', 3)
  on conflict (id) do nothing;

  insert into public.host_user (host_id, user_id, role, accepted_at)
  values (v_pend_host, v_pend_user, 'owner', now() - interval '2 days')
  on conflict (host_id, user_id) do nothing;

  insert into public.property (id, host_id, slug, name, kind, area, city_id)
  values (v_prop_p, v_pend_host, 'the-curve-residences', '[The Curve Residences]',
          'apartment_block', 'Kilimani', v_city)
  on conflict (id) do nothing;

  /*
   * Two of five: address done, hand-off chosen but the caretaker
   * has not answered the SMS. `caretaker_token_sent_at` set with
   * `caretaker_confirmed_at` null is exactly the state the
   * attention card exists for, and it is the single most common
   * way a real host stalls.
   */
  insert into public.unit (
    id, host_id, property_id, name, label_public, address_line, building, unit_no,
    city_id, zone_id, status, handoff,
    caretaker_name, caretaker_token_sent_at, caretaker_confirmed_at, readiness,
    created_at)
  values (
    v_unit_p1, v_pend_host, v_prop_p, 'A1204', 'Apartment A1204', '[Address], Kilimani, Nairobi',
    '[The Curve Residences]', 'A1204', v_city, v_zone, 'setting_up',
    'leave_with_askari', '[Caretaker]', now() - interval '2 days', null,
    '{"address":true,"handoff":true,"contact_confirmed":false,"hours":false,"qr_placed":false}'::jsonb,
    now() - interval '2 days')
  on conflict (id) do nothing;

  raise notice 'Host seeds ready: host.live@nexgapp.com (live) and host.pending@nexgapp.com (2 of 5), password devpassword';
end
$$;
