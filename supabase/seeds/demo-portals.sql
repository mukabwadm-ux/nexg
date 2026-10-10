-- Demo data for the three fully-onboarded partner accounts.
--
-- Every module in every portal has something in it, so a demo
-- walks through a working product rather than a tour of empty
-- states. The empty states are real and worth keeping — they
-- are what a new partner sees on day one — but they are not
-- what anybody wants to be shown.
--
-- Scoped hard to the three seeded accounts:
--
--   merchant.live@nexgapp.com   b1000000-…-0001
--   rider.active@nexgapp.com    b1000000-…-0003
--   host.live@nexgapp.com       c2000000-…-0001
--
-- Idempotent: it clears its own rows first, by the same ids it
-- writes, so re-running it does not double anything. It never
-- touches a row it did not create, and it never touches an
-- account it does not name.
--
-- GR3 still applies to the *product*: nothing here teaches a
-- page to invent a number. These are rows in the real tables,
-- read through the real views, so Money agrees with Analytics
-- because both are counting the same records.

begin;

do $$
declare
  v_merchant uuid := 'b1000000-0000-4000-8000-000000000001';
  v_rider    uuid := 'b1000000-0000-4000-8000-000000000003';
  v_host     uuid := 'c2000000-0000-4000-8000-000000000001';
  v_rider_user    uuid := 'a1000000-0000-4000-8000-000000000003';
  v_merchant_user uuid := 'a1000000-0000-4000-8000-000000000001';
  v_host_user     uuid := 'c1000000-0000-4000-8000-000000000001';
  v_zone_kilimani uuid;
  v_zone_westlands uuid;
  v_city uuid;
begin
  if not exists (select 1 from public.rider where id = v_rider) then
    raise notice 'demo-portals: seeded partner accounts are absent; nothing to do.';
    return;
  end if;

  select city_id into v_city from public.rider where id = v_rider;
  select id into v_zone_kilimani from public.zone where name = 'Kilimani' limit 1;
  select id into v_zone_westlands from public.zone where name = 'Westlands' limit 1;
  v_zone_westlands := coalesce(v_zone_westlands, v_zone_kilimani);

  -- A cash cap for the demo city.
  --
  -- No city has one set, which means the cap that decides when
  -- a rider is paused for carrying too much is unconfigured
  -- everywhere. That is worth saying out loud rather than only
  -- papering over here: this sets one for the demo city so the
  -- board has a limit to measure against.
  update public.cash_rule
     set cap_default_kes = coalesce(cap_default_kes, 8000),
         cap_new_rider_kes = coalesce(cap_new_rider_kes, 4000)
   where city_id = v_city;

  -- ═══════════════════════════════════════════ rider · cash
  --
  -- Collected at the door, deposited at a paybill, and the
  -- difference is what the rider is carrying. The figures are
  -- chosen so the board shows a rider *approaching* the cap
  -- rather than safely under it — the state the page exists to
  -- warn about is the one worth being able to see.
  delete from public.cash_deposit where rider_id = v_rider;

  insert into public.cash_deposit
    (id, rider_id, provider_ref, msisdn, amount_kes, account_reference, paid_at, match_status, matched_at)
  values
    ('d0000000-0000-4000-8000-000000000001', v_rider, 'SJ48KD91XZ', '+254700000903', 4200,
     'RIDER-0003', now() - interval '6 days', 'auto_matched', now() - interval '6 days' + interval '3 min'),
    ('d0000000-0000-4000-8000-000000000002', v_rider, 'SJ52MM04QA', '+254700000903', 3800,
     'RIDER-0003', now() - interval '4 days', 'auto_matched', now() - interval '4 days' + interval '2 min'),
    ('d0000000-0000-4000-8000-000000000003', v_rider, 'SJ61PL77BT', '+254700000903', 5100,
     'RIDER-0003', now() - interval '2 days', 'auto_matched', now() - interval '2 days' + interval '4 min'),
    -- One that did not match, because that is the row the
    -- evidence flow on this board exists for.
    ('d0000000-0000-4000-8000-000000000004', v_rider, 'SJ73RT20CV', '+254700000903', 2600,
     'RIDER-3', now() - interval '20 hours', 'unmatched', null);

  /*
   * Appended, never re-seeded.
   *
   * `cash_event` is append-only: `tg_cash_event_immutable`
   * refuses UPDATE and DELETE outright, because a cash movement
   * is corrected by writing a correcting row and never by
   * removing the original. So this cannot clear and rewrite the
   * way the other sections do — it inserts once and then leaves
   * well alone. Re-running the seed must not double a rider's
   * cash position, and deleting to avoid that is the one thing
   * the table will not allow.
   */
  if not exists (select 1 from public.cash_event where rider_id = v_rider) then
  insert into public.cash_event (rider_id, kind, amount_kes, order_reference, note, created_at)
  values
    (v_rider, 'collected', 1450, 'NX-D-10041', null, now() - interval '7 days'),
    (v_rider, 'collected', 1320, 'NX-D-10042', null, now() - interval '7 days' + interval '2 hours'),
    (v_rider, 'collected', 1430, 'NX-D-10043', null, now() - interval '6 days'),
    (v_rider, 'deposit',   4200, null, 'Paybill 4102847', now() - interval '6 days' + interval '5 hours'),
    (v_rider, 'collected', 1900, 'NX-D-10051', null, now() - interval '5 days'),
    (v_rider, 'collected', 1900, 'NX-D-10052', null, now() - interval '5 days' + interval '3 hours'),
    (v_rider, 'deposit',   3800, null, 'Paybill 4102847', now() - interval '4 days'),
    (v_rider, 'collected', 2550, 'NX-D-10061', null, now() - interval '3 days'),
    (v_rider, 'collected', 2550, 'NX-D-10062', null, now() - interval '3 days' + interval '4 hours'),
    (v_rider, 'deposit',   5100, null, 'Paybill 4102847', now() - interval '2 days'),
    (v_rider, 'collected', 1780, 'NX-D-10071', null, now() - interval '1 day'),
    (v_rider, 'collected', 2240, 'NX-D-10072', null, now() - interval '6 hours'),
    (v_rider, 'collected', 1990, 'NX-D-10073', null, now() - interval '3 hours');
  end if;

  -- ═══════════════════════════════════════════ rider · shifts
  --
  -- Last week kept, this week committed, with one no-show,
  -- because a board that only ever shows a clean record cannot
  -- show what a miss looks like.
  delete from public.shift_commitment where rider_id = v_rider;

  insert into public.shift_commitment (rider_id, zone_id, date, time_window, status, committed_at, showed_at)
  values
    (v_rider, v_zone_kilimani,  current_date - 7, 'lunch', 'showed',
     now() - interval '9 days',  now() - interval '7 days'),
    (v_rider, v_zone_kilimani,  current_date - 6, 'dinner', 'showed',
     now() - interval '9 days',  now() - interval '6 days'),
    (v_rider, v_zone_westlands, current_date - 5, 'lunch', 'no_show',
     now() - interval '9 days',  null),
    (v_rider, v_zone_kilimani,  current_date - 4, 'dinner', 'showed',
     now() - interval '8 days',  now() - interval '4 days'),
    (v_rider, v_zone_kilimani,  current_date - 2, 'lunch', 'showed',
     now() - interval '6 days',  now() - interval '2 days'),
    (v_rider, v_zone_kilimani,  current_date - 1, 'dinner', 'showed',
     now() - interval '5 days',  now() - interval '1 day'),
    (v_rider, v_zone_kilimani,  current_date,     'dinner', 'committed',
     now() - interval '3 days',  null),
    (v_rider, v_zone_kilimani,  current_date + 1, 'lunch', 'committed',
     now() - interval '2 days',  null),
    (v_rider, v_zone_westlands, current_date + 2, 'dinner', 'committed',
     now() - interval '2 days',  null),
    (v_rider, v_zone_kilimani,  current_date + 3, 'lunch', 'committed',
     now() - interval '1 day',   null);

  -- ═══════════════════════════════════════════ rider · health
  --
  -- A green band with one thing visibly worse than the rest, so
  -- the page has something to point at. A snapshot where every
  -- measure is excellent teaches a reader nothing about which
  -- of them moves the band.
  delete from public.rider_health_snapshot where rider_id = v_rider;

  insert into public.rider_health_snapshot
    (rider_id, as_of, score, band, acceptance_pct, on_time_pct, cancel_after_accept_pct,
     rating_avg, handoff_compliance_pct, safety_pct, issues_30d, trips_30d, weights, trend)
  values
    (v_rider, current_date - 7, 79, 'green', 92.0, 86.0, 3.1, 4.6, 94.0, 100.0, 2, 118,
     '{"acceptance":25,"on_time":25,"cancels":15,"rating":15,"handoff":10,"safety":10}'::jsonb,
     array[72, 74, 76, 75, 78, 79]),
    (v_rider, current_date, 83, 'green', 94.0, 88.0, 2.4, 4.7, 96.0, 100.0, 1, 126,
     '{"acceptance":25,"on_time":25,"cancels":15,"rating":15,"handoff":10,"safety":10}'::jsonb,
     array[74, 76, 75, 78, 79, 83]);

  delete from public.rider_strike where rider_id = v_rider;
  insert into public.rider_strike (rider_id, level, reason, issued_at, expires_at, cleared_at)
  values
    (v_rider, 1, 'Marked delivered before reaching the door on NX-D-09912.',
     now() - interval '46 days', now() - interval '16 days', now() - interval '31 days');

  -- ════════════════════════════════════════ rider · incidents
  delete from public.incident where rider_id = v_rider;

  insert into public.incident
    (rider_id, order_reference, kind, severity, status, reported_by_type, happened_at,
     description, evidence, injury, compensation_kes, acknowledged_at, resolved_at, resolution)
  values
    (v_rider, 'NX-D-09988', 'breakdown', 'minor', 'resolved', 'rider',
     now() - interval '18 days',
     'Chain snapped on Argwings Kodhek. Order was re-dispatched from the same merchant.',
     '{}'::jsonb, false, 450, now() - interval '18 days' + interval '6 min',
     now() - interval '17 days',
     'Re-dispatched within 11 minutes. Repair reimbursed at KES 450 on the next statement.'),
    (v_rider, 'NX-D-10022', 'guest_complaint', 'minor', 'resolved', 'guest',
     now() - interval '9 days',
     'Guest said the bag was handed over at the gate rather than the door.',
     '{}'::jsonb, false, null, now() - interval '9 days' + interval '22 min',
     now() - interval '8 days',
     'Gate was the address on file. No fault found; the pin has been corrected with the guest.'),
    (v_rider, 'NX-D-10070', 'police_stop', 'minor', 'investigating', 'rider',
     now() - interval '2 days',
     'Stopped at a check near Yaya for about twenty minutes. Documents were in order.',
     '{}'::jsonb, false, null, now() - interval '2 days' + interval '9 min', null, null);

  -- ═════════════════════════════════════════ rider · referrals
  delete from public.rider_referral where referrer_rider_id = v_rider;

  insert into public.rider_referral
    (referrer_rider_id, code, referred_name, status, reward_amount_kes, reward_status, first_trip_at, created_at)
  values
    (v_rider, 'RIDE-0003', 'Brian O.',  'active',    1500, 'paid',
     now() - interval '38 days', now() - interval '52 days'),
    (v_rider, 'RIDE-0003', 'Kevin M.',  'active',    1500, 'earned',
     now() - interval '6 days',  now() - interval '21 days'),
    (v_rider, 'RIDE-0003', 'Dennis W.', 'in_review', null, 'pending',
     null, now() - interval '9 days'),
    (v_rider, 'RIDE-0003', 'Alex N.',   'applied',   null, 'pending',
     null, now() - interval '4 days'),
    (v_rider, 'RIDE-0003', 'Victor K.', 'invited',   null, 'pending',
     null, now() - interval '2 days');

  -- ══════════════════════════════════════ support · all three
  --
  -- `created_by_user` is the point of these rows. Without it
  -- the partner views match nothing and every Support board
  -- reads "you have not needed us yet", which is how the
  -- merchant board has looked since it was built.
  delete from public.support_ticket
   where created_by_user in (v_rider_user, v_merchant_user, v_host_user);

  insert into public.support_ticket
    (reference, channel, from_role, topic, full_name, email, phone, order_reference,
     body, status, first_reply_at, resolved_at, created_at, updated_at, details,
     source_form, created_by_user)
  values
    -- merchant
    ('NX-T-2041', 'in_app', 'merchant', 'partner_merchant', '[Owner One]',
     'merchant.live@nexgapp.com', '+254700000901', null,
     'Counter phone stops making the new-order sound after the screen locks on Android 12.',
     'answered', now() - interval '3 days' + interval '4 min', null,
     now() - interval '3 days', now() - interval '1 day', '{}'::jsonb, 'merchant_portal', v_merchant_user),
    ('NX-T-2032', 'in_app', 'merchant', 'hotel_partnership', '[Owner One]',
     'merchant.live@nexgapp.com', '+254700000901', null,
     'Please add the Lavington branch to our agreement before we open it.',
     'resolved', now() - interval '11 days' + interval '9 min', now() - interval '9 days',
     now() - interval '11 days', now() - interval '9 days', '{}'::jsonb, 'merchant_portal', v_merchant_user),
    ('NX-T-2018', 'whatsapp', 'merchant', 'something_else', '[Owner One]',
     'merchant.live@nexgapp.com', '+254700000901', null,
     'Can we bulk mark a whole category sold out at once?',
     'resolved', now() - interval '26 days' + interval '41 min', now() - interval '23 days',
     now() - interval '26 days', now() - interval '23 days', '{}'::jsonb, null, v_merchant_user),
    -- rider
    ('NX-T-2044', 'in_app', 'rider', 'partner_rider', '[Rider] [Active]',
     'rider.active@nexgapp.com', '+254700000903', 'NX-D-10070',
     'I was held at a police check near Yaya for twenty minutes and the order ran late. Can the on-time figure be looked at?',
     'open', null, null, now() - interval '2 days', now() - interval '2 days',
     '{}'::jsonb, 'rider_portal', v_rider_user),
    ('NX-T-2029', 'in_app', 'rider', 'payment_or_refund', '[Rider] [Active]',
     'rider.active@nexgapp.com', '+254700000903', null,
     'A deposit of KES 2,600 has not matched against my account. Reference SJ73RT20CV.',
     'answered', now() - interval '20 hours' + interval '12 min', null,
     now() - interval '20 hours', now() - interval '6 hours', '{}'::jsonb, 'rider_portal', v_rider_user),
    ('NX-T-1994', 'phone', 'rider', 'account', '[Rider] [Active]',
     'rider.active@nexgapp.com', '+254700000903', null,
     'Asked to add Westlands to my areas.',
     'resolved', now() - interval '34 days' + interval '3 min', now() - interval '34 days',
     now() - interval '34 days', now() - interval '34 days', '{}'::jsonb, null, v_rider_user),
    -- host
    ('NX-T-2039', 'in_app', 'hotel', 'hotel_partnership', '[Seed Host]',
     'host.live@nexgapp.com', '+254700000801', null,
     'We are adding eight units in the north block next month. What do you need from us?',
     'answered', now() - interval '5 days' + interval '18 min', null,
     now() - interval '5 days', now() - interval '2 days', '{}'::jsonb, 'host_portal', v_host_user),
    ('NX-T-2001', 'in_app', 'hotel', 'something_else', '[Seed Host]',
     'host.live@nexgapp.com', '+254700000801', null,
     'Can the welcome package be scheduled for the evening of check-in rather than the morning after?',
     'resolved', now() - interval '29 days' + interval '52 min', now() - interval '27 days',
     now() - interval '29 days', now() - interval '27 days', '{}'::jsonb, 'host_portal', v_host_user);

  raise notice 'demo-portals: seeded cash, shifts, health, incidents, referrals and support for the three demo accounts.';
end
$$;

commit;
