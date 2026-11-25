-- Cinema seats paid through Paystack, settled and refunded (owner, 23 Nov 2026:
-- "sawa, no real cinema so build out end to end still with what we have";
-- "we send requests and book on their system").
--
-- A hold the cinema worker has moved to paying (cinema_record_paying) is paid
-- like an order, a booking or a stay: the customer's payment route opens a
-- public.payment for the hold's total, then a Paystack try. Paystack's signed
-- charge.success marks the payment paid, and a trigger hands the hold to
-- cinema_payment_settled, which queues the confirm with the cinema. A hold the
-- cinema could not book (refund_due) is refunded in full through Paystack by
-- the cinema worker; only Paystack's processed refund marks it refunded.
--
-- In this migration:
--
--  1. payment_intent 'cinema'. A value added here cannot be named until this
--     migration commits, so it is compared as intent::text throughout.
--  2. payment.cinema_hold_id, one live payment per hold.
--  3. rpc_payment_begin_cinema: the customer (a guest session too) opens the
--     payment for their own paying hold.
--  4. rpc_cinema_payment_state: the customer's view of it, in the shape of
--     rpc_stay_payment_state.
--  0b. The global setting payouts.cinema.automatic_live_refunds (off): live
--     cinema payments are refunded automatically only once it is on.
--  5. rpc_payment_paystack_attempt admits 'cinema' (as 20270315000100, the
--     intent gate and one cinema block), only while the hold is paying and not
--     run out. No split: the whole amount comes to NexG. How the cinema is
--     paid is not decided yet.
--  6. payment_cinema_settled: a paid cinema payment settles its hold. It never
--     raises; a failure is audited as cinema.settle_failed (high).
--  6b. cinema_hold_payment_closed: a hold released or expired abandons its
--     open payment. It never raises; a failure is audited.
--  7. paystack_refund kind 'cinema'; fn_cinema_refund_open (service role) opens
--     a full refund of the payment that settled a refund_due hold (live ones
--     only with the setting on); fn_paystack_refund_answered_system records
--     Paystack's first answer (a refusal marks the refund failed);
--     fn_paystack_refund_apply marks the hold refunded and the payment
--     reversed on processed, or flags a hold the cinema booked meanwhile.
--  8. cron_cinema_worker also wakes the worker for refunds not yet started, and
--     cinema_due_work lists only those refunds (a failed one waits for a person).
--  9. Not here: posting cinema money to the ledger (nobody is defined as the
--     cinema's payee yet).
--
-- Rollback: drop triggers payment_cinema_settled and cinema_hold_payment_closed,
-- the functions created here and the setting payouts.cinema.automatic_live_refunds;
-- restore rpc_payment_paystack_attempt from 20270315000100,
-- fn_paystack_refund_apply and the paystack_refund checks from 20270222000400,
-- payment_points_at_one_thing from 20270222000100, and cinema_due_work and
-- cron_cinema_worker from 20270317000100; drop payment.cinema_hold_id. The enum value stays (Postgres
-- cannot drop one).

-- ═══════════════════════════════════════════════ 0. audit actions

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('payment.cinema_begun', 'experiences', 'info', true, 'Payment opened for seats held on a cinema''s system'),
  ('cinema.settle_failed', 'experiences', 'high', true,
   'A cinema payment was paid but its seat hold could not be moved on; Finance must look at it'),
  ('cinema.refund_opened', 'experiences', 'notice', true, 'A full refund of a cinema booking was sent to Paystack')
on conflict (action) do nothing;

insert into audit.action_registry (action, module, default_severity, needs_review, money, description) values
  ('cinema.refunded_but_booked', 'experiences', 'high', true, true,
   'Paystack refunded a cinema payment, but the cinema had booked the seats meanwhile; Finance must settle it with the customer and the cinema'),
  ('cinema.payment_close_failed', 'experiences', 'high', true, true,
   'A cinema seat hold ended, but its open payment could not be closed; check the payment')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ 0b. live refunds are off by default

/* As payouts.rider.automatic_live (20270310000100): real money goes back
   automatically only once Finance and Tech switch this on. */
insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort, constraints)
values
  ('payouts.cinema.automatic_live_refunds', 'payouts', 'global', 'bool', null,
   'Cinemas: refund live payments automatically',
   'Off: when a cinema cannot book seats that were paid for with real money, the refund waits for a person to send it, and only test payments are refunded automatically. On: real payments are refunded automatically through Paystack.',
   true, false, 'finance+tech', '{finance,web}', 'false'::jsonb, 423, '{}'::jsonb)
on conflict (key) do nothing;

-- ═══════════════════════════════════════════════ 1. the intent

alter type public.payment_intent add value if not exists 'cinema';

-- ═══════════════════════════════════════════════ 2. a payment points at its hold

alter table public.payment
  add column if not exists cinema_hold_id uuid references cinema.hold (id) on delete restrict;

-- As 20270222000100, and a cinema payment points at its hold and nothing else.
alter table public.payment drop constraint if exists payment_points_at_one_thing;
alter table public.payment add constraint payment_points_at_one_thing check (
  (intent = 'order' and order_id is not null and booking_id is null and stay_id is null
     and cinema_hold_id is null)
  or (intent = 'featured_slot' and booking_id is not null and order_id is null and stay_id is null
     and cinema_hold_id is null)
  or (intent = 'rider_float' and order_id is null and booking_id is null and stay_id is null
     and cinema_hold_id is null)
  or (intent = 'stay' and stay_id is not null and order_id is null and booking_id is null
     and cinema_hold_id is null)
  or (intent::text = 'booking' and order_id is null and booking_id is null and stay_id is null
     and cinema_hold_id is null)
  or (intent::text = 'cinema' and cinema_hold_id is not null and order_id is null and stay_id is null
     and booking_id is null));

create index if not exists payment_cinema_hold_idx on public.payment (cinema_hold_id)
  where cinema_hold_id is not null;
create unique index if not exists payment_one_live_per_cinema_hold on public.payment (cinema_hold_id)
  where cinema_hold_id is not null and state in ('pending', 'authorised');

-- ═══════════════════════════════════════════════ 3. the customer opens the payment

/*
 * Called by the web app's cinema payment route as the customer (a guest
 * session too), after the worker has extended the hold at the cinema and
 * recorded it paying. The amount is the hold's own total; the payment runs out
 * with the hold. An open payment for the hold is handed back, so a retry never
 * opens a second one.
 */
create or replace function public.rpc_payment_begin_cinema(p_hold_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_hold cinema.hold;
  v_merchant public.merchant;
  v_existing public.payment;
  v_id uuid;
  v_ref text;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;

  select * into v_hold from cinema.hold where id = p_hold_id for update;
  if not found or v_hold.guest_id is distinct from v_uid then
    raise exception 'That seat hold is not yours.' using errcode = '42501';
  end if;
  if v_hold.state <> 'paying' then
    raise exception 'These seats are not waiting for payment. Check the booking first.'
      using errcode = '22023', hint = 'hold_not_paying';
  end if;
  if v_hold.expires_at <= now() + interval '60 seconds' then
    raise exception 'There isn''t enough time left on this hold to pay. Hold the seats again?'
      using errcode = '22023', hint = 'hold_too_short';
  end if;
  -- Paid already (the settle is still to run): never take a second payment.
  if exists (select 1 from public.payment py
              where py.cinema_hold_id = v_hold.id and py.state = 'paid') then
    raise exception 'These seats are already paid for.' using errcode = '22023', hint = 'hold_paid';
  end if;

  select m.* into v_merchant
    from cinema.showing s
    join cinema.screen sc on sc.id = s.screen_id
    join public.merchant m on m.id = sc.merchant_id
   where s.id = v_hold.showing_id;
  if v_merchant.id is null then
    raise exception 'Seat hold not found.' using errcode = 'P0002';
  end if;

  select * into v_existing from public.payment
   where cinema_hold_id = v_hold.id and state in ('pending', 'authorised')
   limit 1;
  if v_existing.id is not null then
    update public.payment set expires_at = v_hold.expires_at, updated_at = now()
     where id = v_existing.id;
    return jsonb_build_object(
      'ok', true, 'payment_id', v_existing.id, 'reference', v_existing.reference,
      'amount_cents', v_existing.amount_cents, 'currency', v_existing.currency,
      'expires_at', v_hold.expires_at, 'reused', true);
  end if;

  v_ref := public.fn_payment_reference();
  insert into public.payment (
    reference, intent, cinema_hold_id, merchant_id, city_id, amount_cents, currency,
    created_by, created_via, expires_at)
  values (
    v_ref, 'cinema', v_hold.id, v_merchant.id, v_merchant.city_id, v_hold.total_minor, 'KES',
    v_uid, 'guest_checkout', v_hold.expires_at)
  returning id into v_id;

  perform audit.log('guest'::public.actor_type, 'experiences', 'payment.cinema_begun',
    p_actor_id => v_uid, p_target_type => 'payment', p_target_id => v_id,
    p_city_id => v_merchant.city_id,
    p_after => jsonb_build_object('cinema_hold', v_hold.id, 'amount_cents', v_hold.total_minor,
                                  'reference', v_ref));

  return jsonb_build_object(
    'ok', true, 'payment_id', v_id, 'reference', v_ref,
    'amount_cents', v_hold.total_minor, 'currency', 'KES',
    'expires_at', v_hold.expires_at, 'reused', false);
end;
$$;

revoke execute on function public.rpc_payment_begin_cinema(uuid) from public, anon;
grant execute on function public.rpc_payment_begin_cinema(uuid) to authenticated;

-- ═══════════════════════════════════════════════ 4. what the customer's screen shows

/*
 * The hold's latest payment, in the same shape as rpc_stay_payment_state:
 * unpaid, pending (a page or prompt in play), failed or paid. The hold itself
 * moves on through payment_cinema_settled when the payment is paid; its own
 * read (rpc_my_cinema_hold) stays the proof of the booking.
 */
create or replace function public.rpc_cinema_payment_state(p_hold_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  h cinema.hold;
  p public.payment;
  a public.paystack_attempt;
  v_uid uuid := (select auth.uid());
  v_wait integer;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  select * into h from cinema.hold where id = p_hold_id;
  if not found or h.guest_id is distinct from v_uid then
    raise exception 'That seat hold is not yours.' using errcode = '42501';
  end if;

  select * into p from public.payment
   where cinema_hold_id = h.id and state <> 'abandoned' order by created_at desc limit 1;
  if p.id is null then
    return jsonb_build_object('status', 'unpaid');
  end if;
  if p.state = 'paid' then
    return jsonb_build_object('status', 'paid', 'reference', p.reference, 'channel', p.channel,
      'is_test', p.is_test, 'paid_at', p.paid_at);
  end if;

  select * into a from public.paystack_attempt where payment_id = p.id order by created_at desc limit 1;
  if p.state in ('pending', 'authorised') and (p.expires_at is null or p.expires_at > now()) then
    if a.id is not null and a.outcome is null and a.opened_at is not null
       and a.opened_at > now() - interval '30 minutes' then
      if a.channel not in ('card', 'saved_card') then
        v_wait := greatest(0, ceil(extract(epoch from (a.opened_at + interval '3 minutes' - now())))::integer);
      end if;
      return jsonb_build_object('status', 'pending', 'reference', p.reference,
        'attempt_reference', a.reference, 'channel', a.channel, 'is_test', p.is_test,
        'opened_seconds_ago', floor(extract(epoch from (now() - a.opened_at)))::integer,
        'checked_seconds_ago', case when a.checked_at is not null
          then floor(extract(epoch from (now() - a.checked_at)))::integer end,
        'retry_after_seconds', v_wait,
        'authorization_url', case when a.channel = 'card' then a.authorization_url end);
    end if;
    if a.id is not null and a.outcome = 'failed' then
      return jsonb_build_object('status', 'failed', 'reference', p.reference);
    end if;
    return jsonb_build_object('status', 'unpaid', 'reference', p.reference);
  end if;
  if p.state = 'failed' then
    return jsonb_build_object('status', 'failed', 'reference', p.reference);
  end if;
  return jsonb_build_object('status', 'unpaid');
end;
$$;

revoke execute on function public.rpc_cinema_payment_state(uuid) from public, anon;
grant execute on function public.rpc_cinema_payment_state(uuid) to authenticated;

-- ═══════════════════════════════════════════════ 5. a Paystack try for a cinema payment

/* As 20270315000100, and a cinema payment may be tried (the intent gate,
   compared as text), only while its hold is still paying and not run out (a
   released or expired hold is refused with hold_not_paying; the hold is read,
   not locked). Nothing else changes. A cinema payment gets no split: the
   whole amount comes to NexG. Test keys are taken only when the cinema is a
   test merchant (accepts_test_payments), through the payment's merchant_id. */
create or replace function public.rpc_payment_paystack_attempt(
  p_payment_reference text,
  p_channel text,
  p_phone text,
  p_proof text,
  p_save_card boolean default false,
  p_card_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  a public.paystack_attempt;
  c public.customer_card;
  o public.order;
  v_sub public.merchant_paystack_subaccount;
  v_stay public.stay;
  v_hsub public.host_paystack_subaccount;
  v_uid uuid := (select auth.uid());
  v_mode text;
  v_test boolean;
  v_wait integer;
  v_n integer;
  v_ref text;
  v_save boolean := false;
  v_share bigint;
  v_paid_kes bigint;
  v_pct numeric;
  v_recovery bigint := 0;
  v_split jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  v_mode := authz.paystack_mode(p_proof);
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  v_test := v_mode = 'test';

  if p_channel is null or p_channel not in ('card', 'mpesa', 'airtel', 'saved_card') then
    raise exception 'Choose card, M-Pesa or Airtel Money.' using errcode = '22023';
  end if;
  if p_channel in ('card', 'saved_card') and p_phone is not null then
    raise exception 'A card payment takes no phone number.' using errcode = '22023';
  end if;
  if p_channel in ('mpesa', 'airtel') and (p_phone is null or p_phone !~ '^\+254[17][0-9]{8}$') then
    raise exception 'Enter a Kenyan mobile number like 0712 345 678.' using errcode = '22023';
  end if;
  if (p_channel = 'saved_card') <> (p_card_id is not null) then
    raise exception 'Choose a saved card to pay with it.' using errcode = '22023';
  end if;

  select * into p from public.payment where reference = p_payment_reference for update;
  if not found or p.state not in ('pending', 'authorised')
     or (p.expires_at is not null and p.expires_at <= now()) then
    raise exception 'No payment waiting on that reference.';
  end if;
  if not (p.created_by is not distinct from v_uid or authz.reaches_module('orders')) then
    raise exception 'That payment is not yours.' using errcode = '42501';
  end if;
  if p.intent::text not in ('order', 'booking', 'stay', 'cinema') then
    raise exception 'Only orders, bookings and stays are paid through Paystack so far.' using errcode = '22023';
  end if;
  /* A cinema payment is tried only while its seats are still held for it.
     The hold is read, not locked: locking it here (payment, then hold) would
     take the two locks in the opposite order to the hold-closing trigger
     (cinema_hold_payment_closed: hold, then payment). The payment row locked
     above is enough. A hold ending updates this payment in that trigger, so
     it waits for this attempt to commit, or this attempt waits for it and the
     select above then sees the payment abandoned. */
  if p.intent::text = 'cinema' then
    perform 1 from cinema.hold h
     where h.id = p.cinema_hold_id and h.state = 'paying' and h.expires_at > now();
    if not found then
      raise exception 'Your seats were released. Pick them again.'
        using errcode = '22023', hint = 'hold_not_paying';
    end if;
  end if;
  if p.provider not in ('unassigned', 'paystack') then
    raise exception 'This payment was started another way. Check its status first.' using errcode = '22023';
  end if;
  if p.provider = 'paystack' and p.is_test <> v_test then
    raise exception 'This payment was started in the other Paystack mode.' using errcode = '22023';
  end if;
  -- Test keys only for test shops, and for stays only at test properties.
  if v_test and p.intent = 'stay' and not coalesce((
       select pr.accepts_test_payments from public.stay s
         join public.property pr on pr.id = s.property_id
        where s.id = p.stay_id), false) then
    raise exception 'Test payments are taken only by test properties.' using errcode = '22023';
  end if;
  if v_test and p.intent <> 'stay' and not coalesce((select m.accepts_test_payments from public.merchant m
                                where m.id = p.merchant_id), false) then
    raise exception 'Test payments are taken only by test shops.' using errcode = '22023';
  end if;
  -- M-Pesa and Airtel Money take up to KES 150,000 a payment through Paystack.
  if p_channel in ('mpesa', 'airtel') and p.amount_cents > 15000000 then
    raise exception 'M-Pesa takes up to KES 150,000 a payment. Pay this by card.' using errcode = '22023';
  end if;

  if p_channel = 'saved_card' then
    select * into c from public.customer_card
     where id = p_card_id and user_id = v_uid and removed_at is null and is_test = v_test;
    if not found then
      raise exception 'That card is not saved here. Choose another way to pay.' using errcode = '22023';
    end if;
    if c.exp_year * 12 + c.exp_month
       < extract(year from now() at time zone 'Africa/Nairobi')::int * 12
         + extract(month from now() at time zone 'Africa/Nairobi')::int then
      raise exception 'That card has expired. Choose another way to pay.' using errcode = '22023';
    end if;

    -- A saved card charged in the last minute: charge nothing more.
    select * into a from public.paystack_attempt
     where payment_id = p.id and channel = 'saved_card' and outcome is null
       and created_at > now() - interval '1 minute'
     order by created_at desc limit 1;
    if a.id is not null then
      return jsonb_build_object(
        'ok', true, 'reused', true, 'attempt_reference', a.reference, 'channel', 'saved_card',
        'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', p.is_test,
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (a.created_at + interval '1 minute' - now())))::integer));
    end if;
  end if;

  if p_channel = 'card' and coalesce(p_save_card, false) then
    v_save := not coalesce((select u.is_anonymous from auth.users u where u.id = v_uid), true);
  end if;

  -- A prompt sent in the last minute, to any number: wait, so a double tap
  -- never sends two prompts.
  if p_channel in ('mpesa', 'airtel') then
    select * into a from public.paystack_attempt
     where payment_id = p.id and outcome is null and channel in ('mpesa', 'airtel')
       and opened_at > now() - interval '3 minutes'
     order by opened_at desc limit 1;
    if a.id is not null and (a.opened_at > now() - interval '1 minute'
                             or (a.channel = p_channel and a.phone = p_phone)) then
      v_wait := greatest(1, ceil(extract(epoch from (a.opened_at + case
                  when a.channel = p_channel and a.phone = p_phone then interval '3 minutes'
                  else interval '1 minute' end - now())))::integer);
      return jsonb_build_object(
        'ok', true, 'reused', true, 'attempt_reference', a.reference, 'channel', a.channel,
        'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', p.is_test,
        'retry_after_seconds', v_wait);
    end if;
  end if;

  if p_channel = 'card' then
    select * into a from public.paystack_attempt
     where payment_id = p.id and outcome is null and channel = 'card'
       and authorization_url is not null and opened_at > now() - interval '30 minutes'
       and save_card = v_save
     order by opened_at desc limit 1;
    if a.id is not null then
      return jsonb_build_object(
        'ok', true, 'reused', true, 'attempt_reference', a.reference, 'channel', 'card',
        'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', p.is_test,
        'authorization_url', a.authorization_url);
    end if;
  end if;

  select count(*) + 1 into v_n from public.paystack_attempt where payment_id = p.id;
  if v_n > 20 then
    raise exception 'Too many tries on this payment. Contact NexG support.' using errcode = '22023';
  end if;
  v_ref := p.reference || '-' || v_n;

  /* The split, for an order whose merchant Paystack pays directly. The share
     is the order's items less its commission, as the ledger owes it; NexG's
     part is everything else, plus any refund still to recover. */
  if p.intent = 'order' and p.order_id is not null then
    select * into o from public.order where id = p.order_id;
    v_sub := public.fn_merchant_subaccount(o.merchant_id, v_test);
    if v_sub.id is not null then
      v_share := coalesce(o.subtotal_cents, 0) - coalesce(o.commission_cents, 0);
      if v_share > 0 and v_share < p.amount_cents then
        perform 1 from public.merchant where id = o.merchant_id for update;
        v_recovery := least(public.fn_merchant_recovery_due(o.merchant_id, v_test), greatest(v_share - 100, 0));
        v_split := jsonb_build_object('split', jsonb_build_object(
          'subaccount', v_sub.subaccount_code,
          'transaction_charge', p.amount_cents - v_share + v_recovery,
          'bearer', 'account'));
      else
        v_share := null;
      end if;
    end if;
  /* The split, for a stay whose host Paystack pays directly. The share is
     what the guest pays less NexG's commission, worked out exactly as the
     settle will (tg_payment_stay_settled: the payment's whole shillings,
     through fn_stay_commission_kes), so the share equals host_share_kes.
     rpc_payment_begin_stay opens the payment for quote_total_kes * 100, so
     this is the quoted total. Nothing to recover: Paystack takes a refund
     on a split payment from the host's sub-account. */
  elsif p.intent = 'stay' and p.stay_id is not null then
    select * into v_stay from public.stay where id = p.stay_id;
    v_hsub := public.fn_host_subaccount(v_stay.host_id, v_test);
    if v_hsub.id is not null then
      v_paid_kes := p.amount_cents / 100;
      v_share := (v_paid_kes - public.fn_stay_commission_kes(v_stay.id, v_paid_kes)) * 100;
      v_pct := coalesce((public.fn_host_commission(v_stay.host_id, v_stay.created_at) ->> 'pct')::numeric, 15);
      if v_share > 0 and v_share < p.amount_cents then
        v_split := jsonb_build_object('split', jsonb_build_object(
          'subaccount', v_hsub.subaccount_code,
          'transaction_charge', p.amount_cents - v_share,
          'bearer', 'account'));
      else
        v_share := null;
        v_pct := null;
      end if;
    end if;
  end if;

  insert into public.paystack_attempt
    (payment_id, reference, channel, is_test, phone, created_by, save_card, customer_card_id,
     split_merchant_id, split_host_id, split_subaccount, split_share_cents, split_recovery_cents,
     split_commission_pct)
  values (p.id, v_ref, p_channel, v_test,
          case when p_channel in ('mpesa', 'airtel') then p_phone end, v_uid, v_save, c.id,
          case when v_share is not null then o.merchant_id end,
          case when v_share is not null then v_hsub.host_id end,
          case when v_share is not null then coalesce(v_sub.subaccount_code, v_hsub.subaccount_code) end,
          v_share, case when v_share is not null then v_recovery else 0 end,
          case when v_share is not null then v_pct end);

  update public.payment
     set provider = 'paystack', is_test = v_test, updated_at = now()
   where id = p.id;

  return jsonb_build_object(
    'ok', true, 'reused', false, 'attempt_reference', v_ref, 'channel', p_channel,
    'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', v_test,
    'save_card', v_save)
    || v_split
    || case when c.id is not null
         then jsonb_build_object('authorization_code', c.authorization_code, 'email', c.email)
         else '{}'::jsonb end;
end;
$$;

-- ═══════════════════════════════════════════════ 6. a paid cinema payment settles its hold

/*
 * Runs inside Paystack's webhook (rpc_payment_webhook marks the payment paid),
 * so it never raises: an error would undo the record that the customer paid.
 * cinema_payment_settled is service-role only; this function is security
 * definer, so it runs as its owner, who may call it. A repeat webhook never
 * reaches here (rpc_payment_webhook's duplicate guard, and this fires only on
 * the move to paid), and cinema_payment_settled takes the same reference twice
 * as nothing. A different paid payment for a hold already paid raises 23505
 * there: that payment is caught, audited, and must be refunded by hand.
 */
create or replace function public.tg_payment_cinema_settled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_error text;
begin
  begin
    perform public.cinema_payment_settled(new.cinema_hold_id, new.reference);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_error = message_text;
    perform audit.log('system'::public.actor_type, 'experiences', 'cinema.settle_failed',
      p_actor_label => '[System] · payments',
      p_target_type => 'payment', p_target_id => new.id, p_city_id => new.city_id,
      p_severity => 'high'::public.audit_severity,
      p_reason => case when v_state = '23505'
                       then 'This hold was already paid by another payment. Refund this payment by hand.'
                       else 'Paid, but the seat hold could not be moved on. Check the hold; refund this payment if it cannot be booked.' end,
      p_after => jsonb_build_object('cinema_hold', new.cinema_hold_id, 'reference', new.reference,
                                    'amount_cents', new.amount_cents, 'sqlstate', v_state,
                                    'error', left(v_error, 500), 'needs_refund', true));
  end;
  return new;
end;
$$;

revoke execute on function public.tg_payment_cinema_settled() from public, anon, authenticated;

drop trigger if exists payment_cinema_settled on public.payment;
create trigger payment_cinema_settled
  after update of state on public.payment
  for each row
  when (new.intent::text = 'cinema' and new.state = 'paid' and old.state is distinct from 'paid')
  execute function public.tg_payment_cinema_settled();

-- ═══════════════════════════════════════════════ 6b. a hold that ends closes its open payment

/*
 * A hold released by the customer or run out (cinema_record_hold_ended, or a
 * showing the cinema cancelled) can no longer be paid: its pending or
 * authorised payment is abandoned, so no new Paystack try starts on it and the
 * next hold may open its own. A payment already paid is left alone (the settle
 * decides). It never raises: an error would undo the hold's own end, so a
 * failure is audited as cinema.payment_close_failed (high).
 *
 * The trigger is named cinema_hold_payment_closed, so it sorts after
 * cinema_hold_guard_connected (20270317000100), the only other trigger on
 * cinema.hold, which runs before the row is written anyway.
 */
create or replace function public.tg_cinema_hold_payment_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_error text;
begin
  begin
    update public.payment
       set state = 'abandoned', updated_at = now(),
           failure_reason = case when new.state = 'expired'
                                 then 'The seat hold ran out before it was paid.'
                                 else 'The seat hold was released before it was paid.' end
     where cinema_hold_id = new.id and state in ('pending', 'authorised');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_error = message_text;
    perform audit.log('system'::public.actor_type, 'experiences', 'cinema.payment_close_failed',
      p_actor_label => '[System] · payments',
      p_target_type => 'cinema_hold', p_target_id => new.id,
      p_severity => 'high'::public.audit_severity,
      p_reason => 'The seat hold ended, but its open payment could not be closed. Check the payment.',
      p_after => jsonb_build_object('state', new.state, 'sqlstate', v_state, 'error', left(v_error, 500)));
  end;
  return null;
end;
$$;

revoke execute on function public.tg_cinema_hold_payment_closed() from public, anon, authenticated;

drop trigger if exists cinema_hold_payment_closed on cinema.hold;
create trigger cinema_hold_payment_closed
  after update of state on cinema.hold
  for each row
  when (new.state in ('released', 'expired') and old.state is distinct from new.state)
  execute function public.tg_cinema_hold_payment_closed();

-- ═══════════════════════════════════════════════ 7. refunds

-- As 20270222000400, and a cinema refund points at its payment only.
-- The kind check was written inline in 20270222000400, so Postgres named it;
-- drop it by what it checks, whatever its name.
do $kind$
declare
  v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.paystack_refund'::regclass and c.contype = 'c'
       and c.conname <> 'paystack_refund_points_at_one_thing'
       and pg_get_constraintdef(c.oid) ~ '\(kind = ANY'
  loop
    execute format('alter table public.paystack_refund drop constraint %I', v_name);
  end loop;
end $kind$;
alter table public.paystack_refund add constraint paystack_refund_kind_check
  check (kind in ('order', 'stay', 'booking', 'cinema'));
alter table public.paystack_refund drop constraint if exists paystack_refund_points_at_one_thing;
alter table public.paystack_refund add constraint paystack_refund_points_at_one_thing check (
  (kind = 'order' and refund_id is not null and stay_id is null)
  or (kind = 'stay' and stay_id is not null and refund_id is null)
  or (kind = 'booking' and refund_id is null and stay_id is null)
  or (kind = 'cinema' and refund_id is null and stay_id is null));
-- paystack_refund_one_live, (kind, coalesce(refund_id, stay_id, payment_id)),
-- already keeps one live cinema refund per payment.

/*
 * The cinema worker (service role) opens the full refund of a hold the cinema
 * could not book (refund_due), then sends it to Paystack. The payment refunded
 * is the one that settled the hold (its payment_reference). Asking again
 * answers the refund already opened (a failed one too, which then waits for a
 * person), so a retry never refunds twice. A live payment is refused
 * (live_refunds_off) unless payouts.cinema.automatic_live_refunds is on. The
 * hold becomes refunded only on Paystack's processed answer
 * (fn_paystack_refund_apply), never here.
 */
create or replace function public.fn_cinema_refund_open(p_hold_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h cinema.hold;
  p public.payment;
  x public.paystack_refund;
  v_ref text;
begin
  select * into h from cinema.hold where id = p_hold_id for update;
  if not found then
    raise exception 'Seat hold not found.' using errcode = 'P0002';
  end if;
  if h.state <> 'refund_due' then
    raise exception 'Only a hold with a refund due is refunded.' using errcode = '22023';
  end if;

  -- The payment that settled the hold; the hold's latest paid one only when
  -- no payment has settled it.
  if h.payment_reference is not null then
    select * into p from public.payment
     where reference = h.payment_reference and cinema_hold_id = h.id and state = 'paid';
  else
    select * into p from public.payment
     where cinema_hold_id = h.id and state = 'paid'
     order by paid_at desc limit 1;
  end if;
  if p.id is null or p.provider <> 'paystack' or p.provider_ref is null then
    raise exception 'This hold was not paid through Paystack. Send it back by M-Pesa or bank and record it.'
      using errcode = '22023';
  end if;
  -- Real money goes back automatically only once Finance and Tech switch it on.
  if not p.is_test and not coalesce(settings.fn_bool('payouts.cinema.automatic_live_refunds'), false) then
    raise exception 'Live cinema refunds are off; a person must refund this one.'
      using errcode = '22023', hint = 'live_refunds_off';
  end if;

  /* The refund already opened for this payment, whatever its state. One that
     failed (Paystack refused it, or it failed there) is handed back as it is
     and never sent again by the worker: a person looks at it. */
  select * into x from public.paystack_refund
   where kind = 'cinema' and payment_id = p.id
   order by created_at desc limit 1;
  if x.id is not null then
    return jsonb_build_object('ok', true, 'reused', true, 'reference', x.reference, 'state', x.state,
      'paystack_transaction', p.provider_ref, 'amount_cents', x.amount_cents,
      'mode', case when x.is_test then 'test' else 'live' end,
      'sent', x.paystack_refund_id is not null);
  end if;

  v_ref := 'NXR-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.paystack_refund (kind, payment_id, reference, amount_cents, is_test)
  values ('cinema', p.id, v_ref, p.amount_cents, p.is_test)
  returning * into x;

  perform audit.log('system'::public.actor_type, 'experiences', 'cinema.refund_opened',
    p_actor_label => '[System] · cinema worker',
    p_target_type => 'cinema_hold', p_target_id => h.id, p_city_id => p.city_id,
    p_reason => left(coalesce(nullif(btrim(p_reason), ''), h.refund_reason), 300),
    p_after => jsonb_build_object('payment', p.reference, 'refund', v_ref, 'amount_cents', p.amount_cents,
                                  'test', p.is_test, 'reason', h.refund_reason));

  return jsonb_build_object('ok', true, 'reused', false, 'reference', v_ref, 'state', 'opened',
    'paystack_transaction', p.provider_ref, 'amount_cents', p.amount_cents,
    'mode', case when p.is_test then 'test' else 'live' end, 'sent', false);
end;
$$;

revoke execute on function public.fn_cinema_refund_open(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_cinema_refund_open(uuid, text) to service_role;

/*
 * The cinema worker records Paystack's answer to its refund request, as the
 * console does through rpc_paystack_refund_answered (which stays staff only).
 * The answer is not signed; the caller is the trusted server, and the mode is
 * the refund's own. Cinema refunds only.
 */
create or replace function public.fn_paystack_refund_answered_system(p_reference text, p_answer jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.paystack_refund;
  v_data jsonb;
begin
  select * into x from public.paystack_refund where reference = p_reference and kind = 'cinema' for update;
  if x.id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_refund');
  end if;
  v_data := p_answer -> 'data';
  if (p_answer ->> 'status') is distinct from 'true' or jsonb_typeof(v_data) is distinct from 'object' then
    /* Paystack refused the request: the refund is failed, so the worker never
       sends it again, and a person sees it (as fn_paystack_refund_apply does
       for failed and needs-attention). Only a refund not yet answered. */
    if x.state = 'opened' then
      update public.paystack_refund
         set state = 'failed',
             failure_reason = left(coalesce(nullif(btrim(p_answer ->> 'message'), ''), 'refused'), 300),
             updated_at = now()
       where id = x.id;
      perform audit.log(
        p_actor_type => 'system'::public.actor_type, p_module => 'orders',
        p_action => 'payment.paystack_refund_failed', p_actor_label => '[System] · Paystack',
        p_target_type => 'payment', p_target_id => x.payment_id, p_severity => 'high',
        p_reason => 'Paystack refused this refund.',
        p_after => jsonb_build_object('reference', x.reference, 'status', 'refused',
                                      'message', left(p_answer ->> 'message', 300), 'source', 'worker'));
    end if;
    return jsonb_build_object('ok', false, 'reason', 'refused', 'message', left(p_answer ->> 'message', 300));
  end if;
  -- Paystack's refund object names our reference; make sure it is this one.
  v_data := v_data || jsonb_build_object('refund_reference', p_reference);
  return public.fn_paystack_refund_apply(case when x.is_test then 'test' else 'live' end, v_data, 'worker');
end;
$$;

revoke execute on function public.fn_paystack_refund_answered_system(text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_paystack_refund_answered_system(text, jsonb) to service_role;

/*
 * As 20270222000400, and a processed cinema refund marks the payment reversed
 * and the hold refunded (cinema_record_refunded, idempotent on refunded). A
 * hold the cinema booked meanwhile is not touched: the refund is kept and
 * audited as cinema.refunded_but_booked for a person.
 */
create or replace function public.fn_paystack_refund_apply(p_mode text, p_data jsonb, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.paystack_refund;
  v_status text := lower(coalesce(p_data->>'status', ''));
  v_id text := nullif(p_data->>'id', '');
  v_ref text := coalesce(nullif(p_data->>'refund_reference', ''), nullif(p_data->>'reference', ''));
  v_hold uuid;
  v_hold_state text;
begin
  -- Our own reference decides; Paystack's refund id only when the message
  -- carries no reference of ours, so one refund's answer never lands on another.
  if v_ref is not null then
    select * into x from public.paystack_refund where reference = v_ref for update;
  elsif v_id is not null then
    select * into x from public.paystack_refund where paystack_refund_id = v_id
     order by created_at desc limit 1 for update;
  end if;
  if x.id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_refund');
  end if;
  if x.is_test <> (p_mode = 'test') then
    return jsonb_build_object('ok', false, 'reason', 'mode_mismatch');
  end if;
  if x.state in ('processed') then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if v_status not in ('pending', 'processing', 'processed', 'failed', 'needs-attention') then
    return jsonb_build_object('ok', true, 'ignored', true, 'status', v_status);
  end if;
  if v_status = 'processed' and jsonb_typeof(p_data->'amount') = 'number'
     and (p_data->>'amount')::numeric <> x.amount_cents then
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;

  update public.paystack_refund
     set state = v_status, paystack_refund_id = coalesce(paystack_refund_id, v_id),
         failure_reason = case when v_status in ('failed', 'needs-attention')
                               then left(coalesce(nullif(p_data->>'merchant_note', ''),
                                                  nullif(p_data->>'customer_note', ''), v_status), 300) end,
         updated_at = now()
   where id = x.id;

  if v_status = 'processed' then
    if x.kind = 'order' then
      perform public.fn_refund_mark_issued(x.refund_id, 'paystack:' || coalesce(v_id, x.reference),
                                           '[System] · Paystack');
    elsif x.kind = 'stay' then
      update public.stay
         set refunded_at = now(), refund_reference = left(x.reference, 64),
             refund_note = 'Refunded through Paystack', updated_at = now()
       where id = x.stay_id and refunded_at is null;
      update public.payment set state = 'reversed', updated_at = now()
       where id = x.payment_id and state = 'paid';
      perform audit.log('system'::public.actor_type, 'hotels', 'stay.refunded',
        p_target_type => 'stay', p_target_id => x.stay_id,
        p_after => jsonb_build_object('reference', x.reference, 'amount_cents', x.amount_cents,
                                      'through', 'paystack'));
    elsif x.kind = 'cinema' then
      select py.cinema_hold_id into v_hold from public.payment py where py.id = x.payment_id;
      update public.payment set state = 'reversed', updated_at = now()
       where id = x.payment_id and state = 'paid';
      if v_hold is not null then
        select h.state into v_hold_state from cinema.hold h where h.id = v_hold for update;
        if v_hold_state in ('refund_due', 'refunded') then
          perform public.cinema_record_refunded(v_hold, x.reference);
        else
          /* The cinema booked the seats after the refund was asked for (a late
             confirm): the money is back with the customer and the seats are
             booked. Never raise here (Paystack's answer must be kept); a
             person settles it. */
          perform audit.log('system'::public.actor_type, 'experiences', 'cinema.refunded_but_booked',
            p_actor_label => '[System] · Paystack',
            p_target_type => 'cinema_hold', p_target_id => v_hold,
            p_severity => 'high'::public.audit_severity,
            p_reason => 'Paystack refunded this payment, but the cinema has booked the seats. Settle it with the customer and the cinema.',
            p_after => jsonb_build_object('cinema_hold', v_hold, 'hold_state', v_hold_state,
                                          'refund', x.reference, 'amount_cents', x.amount_cents,
                                          'source', p_source));
        end if;
      end if;
    else
      update public.payment set state = 'reversed', updated_at = now()
       where id = x.payment_id and state = 'paid';
    end if;
  elsif v_status in ('failed', 'needs-attention') then
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.paystack_refund_failed', p_actor_label => '[System] · Paystack',
      p_target_type => 'payment', p_target_id => x.payment_id, p_severity => 'high',
      p_reason => 'Paystack could not complete this refund.',
      p_after => jsonb_build_object('reference', x.reference, 'status', v_status, 'source', p_source));
  end if;

  return jsonb_build_object('ok', true, 'state', v_status);
end;
$$;

revoke execute on function public.fn_paystack_refund_apply(text, jsonb, text)
  from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════ 8. the worker wakes for refunds too

/* As 20270317000100, and its 'refunds' list holds only the refunds the
   worker can start: those cron_cinema_worker counts (v_refunds below), the
   same predicate. A hold whose refund failed, or a live one while
   payouts.cinema.automatic_live_refunds is off, waits for a person and no
   longer fills the list. Everything else is unchanged.

   What the cinema worker should do now. Also does the work that needs no
   call to a cinema: closes the showings of a connection that stopped syncing
   (6 hours), and marks any paid hold not booked within 15 minutes for refund. */
create or replace function public.cinema_due_work(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_stale record;
  v_hold_id uuid;
  v_closed integer;
  v_live_on boolean := coalesce(settings.fn_bool('payouts.cinema.automatic_live_refunds'), false);
begin
  for v_stale in
    select c.id, c.merchant_id from public.connector_connection c
      join public.connector_adapter a on a.id = c.adapter_id and a.vertical = 'cinemas'
      left join cinema.sync_state st on st.connection_id = c.id
     where c.state in ('operational', 'degraded')
       and coalesce(st.last_sync_at, c.created_at) < now() - interval '6 hours'
       and st.stale_closed_at is null
  loop
    with closed as (
      update cinema.showing s set status = 'closed'
       where s.connection_id = v_stale.id and s.status = 'on_sale' and s.starts_at > now()
      returning s.id
    ) select count(*) into v_closed from closed;
    insert into cinema.sync_state (connection_id, stale_closed_at) values (v_stale.id, now())
    on conflict (connection_id) do update set stale_closed_at = now();
    perform audit.log('system'::public.actor_type, 'experiences', 'cinema.showings_closed_stale',
      p_target_type => 'merchant', p_target_id => v_stale.merchant_id, p_severity => 'high'::public.audit_severity,
      p_reason => 'The cinema''s system has not synced for 6 hours.',
      p_after => jsonb_build_object('closed', v_closed));
  end loop;

  for v_hold_id in select id from cinema.hold
                    where state = 'confirming' and settled_at <= now() - interval '15 minutes' loop
    perform public.cinema_record_confirm_failed(v_hold_id, 'Not confirmed within 15 minutes of payment.', true);
  end loop;

  return jsonb_build_object(
    'syncs', coalesce((
      select jsonb_agg(jsonb_build_object('connectionId', x.id, 'adapterId', x.adapter_id, 'merchantId', x.merchant_id))
        from (select c.id, c.adapter_id, c.merchant_id from public.connector_connection c
                join public.connector_adapter a on a.id = c.adapter_id and a.vertical = 'cinemas'
                left join cinema.sync_state st on st.connection_id = c.id
               where c.state in ('operational', 'degraded')
                 and coalesce(st.last_sync_at, '-infinity'::timestamptz) < now() - interval '5 minutes'
               order by st.last_sync_at nulls first limit v_limit) x), '[]'::jsonb),
    'confirms', coalesce((
      select jsonb_agg(x.id) from (select id from cinema.hold
        where state = 'confirming' and next_attempt_at <= now() order by next_attempt_at limit v_limit) x), '[]'::jsonb),
    'expiries', coalesce((
      select jsonb_agg(x.id) from (select id from cinema.hold
        where state in ('held', 'paying') and settled_at is null and connection_id is not null
          and expires_at <= now() order by expires_at limit v_limit) x), '[]'::jsonb),
    'cancels', coalesce((
      select jsonb_agg(x.id) from (select id from cinema.hold
        where state = 'confirmed' and cancel_requested_at is not null and cancel_next_at <= now()
        order by cancel_next_at limit v_limit) x), '[]'::jsonb),
    'refunds', coalesce((
      select jsonb_agg(x.id) from (select h.id from cinema.hold h
        where h.state = 'refund_due'
          and exists (select 1 from public.payment py
                       where py.cinema_hold_id = h.id and py.state = 'paid'
                         and (py.is_test or v_live_on))
          and not exists (
            select 1 from public.paystack_refund r
              join public.payment py on py.id = r.payment_id
             where py.cinema_hold_id = h.id and r.kind = 'cinema'
               and not (r.state = 'opened' and r.paystack_refund_id is null
                        and r.created_at < now() - interval '5 minutes'))
        order by h.updated_at limit v_limit) x), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.cinema_due_work(integer) from public, anon, authenticated;
grant execute on function public.cinema_due_work(integer) to service_role;

/* As 20270317000100, and a paid hold with a refund due that has no Paystack
   refund yet (none, or one opened over five minutes ago and never sent) also
   wakes the worker. A failed refund does not: it waits for a person. Nor does
   a live payment while payouts.cinema.automatic_live_refunds is off. */
create or replace function public.cron_cinema_worker()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due jsonb := public.cinema_due_work(50);
  v_refunds integer;
  v_live_on boolean := coalesce(settings.fn_bool('payouts.cinema.automatic_live_refunds'), false);
begin
  select count(*)::integer into v_refunds
    from cinema.hold h
   where h.state = 'refund_due'
     and exists (select 1 from public.payment py
                  where py.cinema_hold_id = h.id and py.state = 'paid'
                    and (py.is_test or v_live_on))
     and not exists (
       select 1 from public.paystack_refund r
         join public.payment py on py.id = r.payment_id
        where py.cinema_hold_id = h.id and r.kind = 'cinema'
          and not (r.state = 'opened' and r.paystack_refund_id is null
                   and r.created_at < now() - interval '5 minutes'));
  if jsonb_array_length(v_due -> 'syncs') = 0 and jsonb_array_length(v_due -> 'confirms') = 0
     and jsonb_array_length(v_due -> 'expiries') = 0 and jsonb_array_length(v_due -> 'cancels') = 0
     and v_refunds = 0 then
    return jsonb_build_object('ok', true, 'waiting', 0);
  end if;
  return public.fn_cinema_worker_poke() || jsonb_build_object(
    'syncs', jsonb_array_length(v_due -> 'syncs'), 'confirms', jsonb_array_length(v_due -> 'confirms'),
    'expiries', jsonb_array_length(v_due -> 'expiries'), 'cancels', jsonb_array_length(v_due -> 'cancels'),
    'refunds', jsonb_array_length(v_due -> 'refunds'), 'refunds_to_start', v_refunds);
end;
$$;
