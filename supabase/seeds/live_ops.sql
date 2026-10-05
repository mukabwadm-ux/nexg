-- Live operations fixtures.
--
-- Enough of a city to work the screen: riders at known distances,
-- one order placed and running, one whose cascade ran out, and the
-- exclusions that make the workbench worth reading.
--
-- Names, plates and references are bracketed placeholders because a
-- seed that looks like real trading data ends up quoted in a deck.
-- The money is left to the settings seed, which is where a rate
-- card belongs — and where it stays unpublished until Finance says
-- otherwise, so this seed exercises the refusals too.

do $$
declare
  v_city uuid;
  v_zone uuid;
  v_merchant uuid;
  v_branch uuid;
  v_admin uuid;
  v_guest uuid;
  v_order uuid;
  v_order2 uuid;
  v_job uuid;
  v_lat double precision := -1.2650;
  v_lng double precision := 36.8030;
  r record;
begin
  select id into v_city from public.city where name = 'Nairobi';
  if v_city is null then
    raise notice 'No Nairobi; live-ops fixtures skipped.';
    return;
  end if;

  select id into v_admin from public.staff_user where email = 'dev.admin@nexgapp.com';
  select mb.id, mb.merchant_id into v_branch, v_merchant
    from public.merchant_branch mb
    join public.merchant m on m.id = mb.merchant_id
   where m.city_id = v_city and m.status = 'live'
   order by mb.is_primary desc limit 1;

  if v_branch is null then
    raise notice 'No live merchant branch in Nairobi; live-ops fixtures skipped.';
    return;
  end if;

  /* The branch is the origin everything is measured from, so it
     needs coordinates even if the merchant seed had none. */
  update public.merchant_branch
     set latitude = coalesce(latitude, v_lat), longitude = coalesce(longitude, v_lng)
   where id = v_branch;
  select latitude, longitude into v_lat, v_lng
    from public.merchant_branch where id = v_branch;

  /* The zone the branch is actually in, so the riders and the
     orders are in the same part of the city and the zones table
     tells one story rather than two. */
  select z.id into v_zone from public.zone z
   where z.city_id = v_city
     and extensions.st_intersects(z.polygon,
           extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography)
   limit 1;
  if v_zone is null then
    select id into v_zone from public.zone where city_id = v_city order by tier limit 1;
  end if;

  -- ──────────────────────────────────────────── the riders
  --
  -- Six, each one a different line in the cascade's exclusions:
  -- near and clean, further but fine, out of radius, mid-trip,
  -- paused with a reason, and cooling off after declines.

  insert into public.rider
    (first_name, last_name, phone, city_id, vehicle, plate_no, status, presence,
     presence_changed_at, last_location, last_location_at, can_receive_offers,
     offers_paused_reason, cooldown_until, cooldown_reason, current_order_reference,
     cash_on_hand, cash_cap, alcohol_eligible, large_items_eligible, bike_max_km,
     health_band, top_decile, activated_at, activated_by)
  select
    '[Rider', v.tag || ']', v.phone, v_city, v.vehicle::public.vehicle_type,
    'KMD [' || v.tag || ']', 'active', v.presence::public.rider_presence,
    now() - interval '40 minutes',
    extensions.st_setsrid(extensions.st_makepoint(v_lng + v.dlng, v_lat), 4326)::extensions.geography,
    now() - make_interval(mins => v.seen), v.offers,
    v.paused_reason, v.cooldown, v.cooldown_reason, v.on_order,
    0, 2000000, v.alcohol, true, 20, v.band::public.rider_health_band, v.top, now() - interval '60 days', v_admin
  from (values
    ('A', '+254700000801', 'motorbike', 'online',  0.0045,  2, true,  null, null::timestamptz, null, null, true,  'green', true),
    ('B', '+254700000802', 'motorbike', 'online',  0.0180,  3, true,  null, null, null, null, true,  'amber', false),
    ('C', '+254700000803', 'motorbike', 'online',  0.0540,  5, true,  null, null, null, null, true,  'green', false),
    ('D', '+254700000804', 'motorbike', 'on_trip', 0.0090,  1, true,  null, null, null, 'NX-[—]', true, 'green', false),
    ('E', '+254700000805', 'motorbike', 'online',  0.0090, 45, false, 'bike in for repair', null, null, null, true, 'green', false),
    ('F', '+254700000806', 'bicycle',   'online',  0.0090,  4, true,  null, null, null, null, false, 'green', false)
  ) as v(tag, phone, vehicle, presence, dlng, seen, offers, paused_reason,
         cooldown, cooldown_reason, on_order, alcohol, band, top)
  on conflict (phone) do nothing;

  /* One of them is cooling off, which is the exclusion dispatchers
     most often argue with — so it is in the fixtures with its
     reason attached. */
  update public.rider
     set cooldown_until = now() + interval '18 minutes',
         cooldown_reason = 'three declines in a row'
   where plate_no = 'KMD [C]';

  -- ────────────────────────────────────────── a guest

  insert into public.guest (phone, name)
  values ('+254700000800', '[Guest]')
  on conflict (phone) do nothing;
  select id into v_guest from public.guest where phone = '+254700000800';

  -- ──────────────────────────── one order, running normally
  --
  -- Totals are the components added up, because the table checks
  -- that. They are placeholders and the console labels them so.

  insert into public.order (
    reference, guest_id, merchant_id, branch_id, city_id, zone_id, channel,
    dropoff_label, dropoff_point, dropoff_note, stage,
    payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency,
    carry_requirements, placed_at, confirmed_at, promised_ready_at,
    promised_delivery_at, eta_at)
  values (
    'NX-SEED-0001', v_guest, v_merchant, v_branch, v_city, v_zone, 'web',
    '[Hotel] · Rm [—]',
    extensions.st_setsrid(extensions.st_makepoint(v_lng - 0.004, v_lat - 0.008), 4326)::extensions.geography,
    'knock softly', 'confirmed', 'cash_on_delivery', 'pending',
    120000, 25000, 6000, 151000, 'KES',
    array['motorbike'],
    now() - interval '6 minutes', now() - interval '5 minutes',
    now() + interval '12 minutes', now() + interval '26 minutes',
    now() + interval '26 minutes')
  on conflict (reference) do nothing
  returning id into v_order;

  if v_order is not null then
    insert into public.order_item (order_id, name, quantity, unit_price_cents, line_total_cents)
    values
      (v_order, '[Item one]', 2, 45000, 90000),
      (v_order, '[Item two]', 1, 30000, 30000);

    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, at)
    values
      (v_order, 'placed', 'Placed by guest',
       'Web · pay on delivery · note: "knock softly"', 'guest', '[Guest]',
       now() - interval '6 minutes'),
      (v_order, 'merchant_confirmed', 'Merchant confirmed',
       'promised ready in 12 min', 'merchant_user', '[Merchant]',
       now() - interval '5 minutes');
  end if;

  -- ─────────────── one whose cascade ran out and needs a person

  insert into public.order (
    reference, guest_id, merchant_id, branch_id, city_id, zone_id, channel,
    dropoff_label, dropoff_point, stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency,
    carry_requirements, placed_at, confirmed_at, promised_delivery_at)
  values (
    'NX-SEED-0002', v_guest, v_merchant, v_branch, v_city, v_zone, 'qr',
    '[Apartment] · Kilimani',
    extensions.st_setsrid(extensions.st_makepoint(v_lng + 0.002, v_lat - 0.012), 4326)::extensions.geography,
    'confirmed', 'mpesa_stk', 'paid',
    80000, 25000, 4000, 109000, 'KES',
    array['motorbike'],
    now() - interval '14 minutes', now() - interval '13 minutes',
    now() - interval '2 minutes')
  on conflict (reference) do nothing
  returning id into v_order2;

  if v_order2 is not null then
    insert into public.order_item (order_id, name, quantity, unit_price_cents, line_total_cents)
    values (v_order2, '[Item three]', 1, 80000, 80000);

    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, at)
    values (v_order2, 'placed', 'Placed by guest',
            'QR · M-Pesa · paid', 'guest', '[Guest]', now() - interval '14 minutes');

    /*
     * Its cascade, written out rather than run: the seed has to
     * produce the same shape every time, and `fn_offer_round`
     * depends on where riders happen to be standing.
     */
    insert into dispatch.job (
      order_id, city_id, zone_id, pickup_point, dropoff_point,
      pickup_label, dropoff_label, distance_km, vehicle_requirements,
      state, round, radius_km, started_at, escalated_at, escalation_reason)
    select
      v_order2, v_city, v_zone,
      extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography,
      o.dropoff_point, '[Merchant]', o.dropoff_label, 1.4, array['motorbike'],
      'escalated', 3, 3, now() - interval '13 minutes',
      now() - interval '1 minute', 'radius_exhausted'
    from public.order o where o.id = v_order2
    returning id into v_job;

    for r in
      select rd.id, rd.plate_no,
             round((extensions.st_distance(rd.last_location,
               extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography
             ) / 1000.0)::numeric, 2) as km,
             row_number() over (order by rd.plate_no) as rank
        from public.rider rd
       where rd.plate_no like 'KMD [%' and rd.city_id = v_city
    loop
      insert into dispatch.offer (
        job_id, round, rank, rider_id, distance_km, eta_min,
        offered_at, expires_at, responded_at, outcome, decline_reason, skip_reason, note)
      values (
        v_job, 3, r.rank, r.id, r.km,
        greatest(1, ceil(r.km / 20.0 * 60.0 + 2))::integer,
        now() - interval '2 minutes',
        case when r.plate_no in ('KMD [A]', 'KMD [B]', 'KMD [D]')
             then now() - interval '100 seconds' end,
        now() - interval '100 seconds',
        case r.plate_no
          when 'KMD [A]' then 'declined'
          when 'KMD [B]' then 'timed_out'
          when 'KMD [D]' then 'declined'
          else 'skipped' end::dispatch.offer_outcome,
        case r.plate_no
          when 'KMD [A]' then 'too_far'
          when 'KMD [D]' then 'break' end::dispatch.decline_reason,
        case r.plate_no
          when 'KMD [C]' then 'on_cooldown'
          when 'KMD [E]' then 'offers_paused'
          when 'KMD [F]' then 'wrong_vehicle' end::dispatch.skip_reason,
        case r.plate_no
          when 'KMD [A]' then 'acceptance [—]% · 2nd offer today'
          when 'KMD [B]' then 'amber health'
          when 'KMD [C]' then 'on cooldown · three declines in a row'
          when 'KMD [D]' then 'finishing NX-[—]'
          when 'KMD [E]' then 'offers paused · bike in for repair'
          when 'KMD [F]' then 'needs motorbike · rides bicycle' end);
    end loop;
  end if;

  -- Zone pressure, computed rather than asserted.
  perform dispatch.cron_zone_health();

  raise notice 'Live operations fixtures: 6 riders, 2 orders, 1 escalated cascade.';
end
$$;
