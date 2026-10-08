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
      v_qr, 'NXG-SEED0' || i, 'placed',
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
      'NXG-SEED0' || (1 + (i % 3)),
      'unit',
      case (i % 3) when 0 then v_unit_a1 when 1 then v_unit_a2 else v_unit_c1 end,
      v_live_host, v_city, v_zone, 'counter',
      case when i % 3 = 0 then 'ordered'::public.qr_scan_outcome
           when i % 3 = 1 then 'browsed'::public.qr_scan_outcome
           else 'landed'::public.qr_scan_outcome end,
      false, true);
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
