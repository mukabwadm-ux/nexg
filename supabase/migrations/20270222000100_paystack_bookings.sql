-- Paystack, bookings and deposits (owner, 22 Nov 2026: "Deposits now").
--
-- A customer's booking in the booking engine is paid through Paystack, in
-- full or by the business's deposit now and the balance later. The engine is
-- the record of the booking and of what is due (apps/booking-engine
-- settlePayment): the web app reads the booking from the engine, opens a
-- payment here for exactly the amount due at this step, and once Paystack says
-- it is paid, settles it in the engine. The database cannot call the engine,
-- so a paid booking payment waits here until the web app records the engine's
-- answer (rpc_payment_engine_settled); the sweep retries any it missed. If the
-- engine refuses (the hold ran out, or the amount no longer matches), the
-- payment is marked for Finance to refund.
--
-- Builds on 20270129000200 (collections) and 20270215000100 (saved cards).
-- Not here: posting booking money to the ledger (the settlement side).

alter type public.payment_intent add value if not exists 'booking';

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('payment.booking_started', 'merchants', 'info', true, 'A customer began paying for a booking'),
  ('payment.booking_settle_refused', 'merchants', 'high', true,
   'The booking engine refused a paid booking payment; refund it')
on conflict (action) do nothing;

alter table public.payment
  add column if not exists customer_engine_booking_id uuid
    references public.customer_engine_booking (id) on delete set null,
  add column if not exists booking_step text
    check (booking_step is null or booking_step in ('full', 'deposit', 'balance')),
  add column if not exists engine_settled_at timestamptz,
  add column if not exists engine_settle_error text;

comment on column public.payment.customer_engine_booking_id is
  'The app booking (customer_engine_booking) this payment is for. The booking engine holds the booking itself.';
comment on column public.payment.booking_step is
  'full: the whole amount; deposit: the deposit, which confirms the booking; balance: the rest, paid later.';
comment on column public.payment.engine_settled_at is
  'When the booking engine accepted this paid payment. Null while it waits, or when the engine refused it (engine_settle_error).';

-- A booking payment points at no order, featured slot or stay. (Compared as
-- text: an enum value added in this migration cannot be named until it commits.)
alter table public.payment drop constraint if exists payment_points_at_one_thing;
alter table public.payment add constraint payment_points_at_one_thing check (
  (intent = 'order' and order_id is not null and booking_id is null and stay_id is null)
  or (intent = 'featured_slot' and booking_id is not null and order_id is null and stay_id is null)
  or (intent = 'rider_float' and order_id is null and booking_id is null and stay_id is null)
  or (intent = 'stay' and stay_id is not null and order_id is null and booking_id is null)
  or (intent::text = 'booking' and order_id is null and booking_id is null and stay_id is null));

-- One live payment per booking at a time.
create unique index if not exists payment_one_live_per_engine_booking
  on public.payment (customer_engine_booking_id)
  where state in ('pending', 'authorised') and customer_engine_booking_id is not null;

create index if not exists payment_engine_unsettled_idx on public.payment (paid_at)
  where customer_engine_booking_id is not null and state = 'paid'
    and engine_settled_at is null and engine_settle_error is null;

-- ─────────────────────────────────────── the customer begins paying

/*
 * Called by the web app's booking payment route, as the customer, with the
 * Paystack secret key as proof: the amount and step come from the web app's
 * own read of the booking engine, never from the phone. Reuses the live
 * payment when it is for the same step and amount; replaces it otherwise.
 */
create function public.rpc_payment_begin_engine_booking(
  p_booking uuid,
  p_amount_cents bigint,
  p_step text,
  p_expires_at timestamptz,
  p_proof text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.customer_engine_booking;
  p public.payment;
  v_uid uuid := (select auth.uid());
  v_city uuid;
  v_ref text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  if authz.paystack_mode(p_proof) is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  if p_step is null or p_step not in ('full', 'deposit', 'balance') then
    raise exception 'Unknown payment step.' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 100000000000 then
    raise exception 'Nothing to pay on this booking.' using errcode = '22023';
  end if;

  select * into b from public.customer_engine_booking where id = p_booking for update;
  if not found or b.user_id is distinct from v_uid then
    raise exception 'That booking is not yours.' using errcode = '42501';
  end if;

  if exists (select 1 from public.payment where customer_engine_booking_id = b.id and state = 'paid'
               and booking_step in (p_step, 'full')) then
    raise exception 'That part of the booking is already paid.' using errcode = '22023';
  end if;

  select * into p from public.payment
   where customer_engine_booking_id = b.id and state in ('pending', 'authorised')
   for update;
  if p.id is not null then
    if p.booking_step = p_step and p.amount_cents = p_amount_cents
       and (p.expires_at is null or p.expires_at > now()) then
      return jsonb_build_object('ok', true, 'payment_id', p.id, 'reference', p.reference,
        'amount_cents', p.amount_cents, 'currency', p.currency, 'reused', true);
    end if;
    update public.payment set state = 'abandoned', updated_at = now(),
           failure_reason = 'replaced by a new payment for this booking'
     where id = p.id;
  end if;

  select city_id into v_city from public.merchant where id = b.merchant_id;
  v_ref := public.fn_payment_reference();
  insert into public.payment (
    reference, intent, merchant_id, city_id, amount_cents, currency, created_by, created_via,
    expires_at, customer_engine_booking_id, booking_step)
  values (
    v_ref, 'booking', b.merchant_id, v_city, p_amount_cents, 'KES', v_uid, 'guest_checkout',
    least(coalesce(p_expires_at, now() + interval '1 hour'), now() + interval '1 hour'),
    b.id, p_step)
  returning id into v_id;

  perform audit.log(
    p_actor_type => 'guest'::public.actor_type, p_actor_id => v_uid, p_module => 'merchants',
    p_action => 'payment.booking_started', p_target_type => 'payment', p_target_id => v_id,
    p_city_id => v_city,
    p_after => jsonb_build_object('step', p_step, 'amount_cents', p_amount_cents));

  return jsonb_build_object('ok', true, 'payment_id', v_id, 'reference', v_ref,
    'amount_cents', p_amount_cents, 'currency', 'KES', 'reused', false);
end;
$$;

revoke execute on function public.rpc_payment_begin_engine_booking(uuid, bigint, text, timestamptz, text)
  from public, anon;
grant execute on function public.rpc_payment_begin_engine_booking(uuid, bigint, text, timestamptz, text)
  to authenticated;

-- ───────────────── a try at Paystack, now for bookings too (else as before)

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
  v_uid uuid := (select auth.uid());
  v_mode text;
  v_test boolean;
  v_wait integer;
  v_n integer;
  v_ref text;
  v_save boolean := false;
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
  if p.intent not in ('order', 'booking') then
    raise exception 'Only orders and bookings are paid through Paystack so far.' using errcode = '22023';
  end if;
  if p.provider not in ('unassigned', 'paystack') then
    raise exception 'This payment was started another way. Check its status first.' using errcode = '22023';
  end if;
  if p.provider = 'paystack' and p.is_test <> v_test then
    raise exception 'This payment was started in the other Paystack mode.' using errcode = '22023';
  end if;
  if v_test and not coalesce((select m.accepts_test_payments from public.merchant m
                                where m.id = p.merchant_id), false) then
    raise exception 'Test payments are taken only by test shops.' using errcode = '22023';
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

  insert into public.paystack_attempt
    (payment_id, reference, channel, is_test, phone, created_by, save_card, customer_card_id)
  values (p.id, v_ref, p_channel, v_test,
          case when p_channel in ('mpesa', 'airtel') then p_phone end, v_uid, v_save, c.id);

  update public.payment
     set provider = 'paystack', is_test = v_test, updated_at = now()
   where id = p.id;

  return jsonb_build_object(
    'ok', true, 'reused', false, 'attempt_reference', v_ref, 'channel', p_channel,
    'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', v_test,
    'save_card', v_save)
    || case when c.id is not null
         then jsonb_build_object('authorization_code', c.authorization_code, 'email', c.email)
         else '{}'::jsonb end;
end;
$$;

-- ──────────────────────────────── what the customer's screen shows

/*
 * The booking's latest payment, in the same shape as rpc_order_payment_state:
 * unpaid, pending (a page or prompt in play), failed, or paid. Paid means
 * Paystack's word; the booking itself is confirmed by the engine.
 */
create function public.rpc_engine_booking_payment_state(p_booking uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  b public.customer_engine_booking;
  p public.payment;
  a public.paystack_attempt;
  v_uid uuid := (select auth.uid());
  v_wait integer;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  select * into b from public.customer_engine_booking where id = p_booking;
  if not found or b.user_id is distinct from v_uid then
    raise exception 'That booking is not yours.' using errcode = '42501';
  end if;

  select * into p from public.payment
   where customer_engine_booking_id = b.id and state <> 'abandoned'
   order by created_at desc limit 1;
  if p.id is null then
    return jsonb_build_object('status', 'unpaid');
  end if;
  if p.state = 'paid' then
    return jsonb_build_object('status', 'paid', 'reference', p.reference, 'step', p.booking_step,
      'channel', p.channel, 'is_test', p.is_test, 'paid_at', p.paid_at,
      'settled', p.engine_settled_at is not null, 'refund_due', p.engine_settle_error is not null);
  end if;

  select * into a from public.paystack_attempt where payment_id = p.id order by created_at desc limit 1;
  if p.state in ('pending', 'authorised') and (p.expires_at is null or p.expires_at > now()) then
    if a.id is not null and a.outcome is null and a.opened_at is not null
       and a.opened_at > now() - interval '30 minutes' then
      if a.channel not in ('card', 'saved_card') then
        v_wait := greatest(0, ceil(extract(epoch from (a.opened_at + interval '3 minutes' - now())))::integer);
      end if;
      return jsonb_build_object('status', 'pending', 'reference', p.reference, 'step', p.booking_step,
        'attempt_reference', a.reference, 'channel', a.channel, 'is_test', p.is_test,
        'opened_seconds_ago', floor(extract(epoch from (now() - a.opened_at)))::integer,
        'checked_seconds_ago', case when a.checked_at is not null
          then floor(extract(epoch from (now() - a.checked_at)))::integer end,
        'retry_after_seconds', v_wait,
        'authorization_url', case when a.channel = 'card' then a.authorization_url end);
    end if;
    if a.id is not null and a.outcome = 'failed' then
      return jsonb_build_object('status', 'failed', 'reference', p.reference, 'step', p.booking_step);
    end if;
    return jsonb_build_object('status', 'unpaid', 'reference', p.reference, 'step', p.booking_step);
  end if;
  if p.state = 'failed' then
    return jsonb_build_object('status', 'failed', 'reference', p.reference, 'step', p.booking_step);
  end if;
  return jsonb_build_object('status', 'unpaid');
end;
$$;

revoke execute on function public.rpc_engine_booking_payment_state(uuid) from public, anon;
grant execute on function public.rpc_engine_booking_payment_state(uuid) to authenticated;

-- ──────────────────────────── settling paid bookings in the engine

-- Paid booking payments the engine has not accepted yet, for the web app to
-- settle (after a webhook, a status check, or the sweep).
create function public.rpc_payment_engine_due(p_proof text)
returns table (reference text, merchant_id uuid, engine_booking_id text, amount_cents bigint, is_test boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if authz.paystack_mode(p_proof) is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  return query
    select p.reference, b.merchant_id, b.engine_booking_id, p.amount_cents, p.is_test
      from public.payment p
      join public.customer_engine_booking b on b.id = p.customer_engine_booking_id
     where p.state = 'paid' and p.engine_settled_at is null and p.engine_settle_error is null
       and p.paid_at > now() - interval '7 days'
     order by p.paid_at
     limit 20;
end;
$$;

revoke execute on function public.rpc_payment_engine_due(text) from public;
grant execute on function public.rpc_payment_engine_due(text) to anon, authenticated;

/*
 * The engine's answer for one paid booking payment. A refusal (the hold ran
 * out, or the amount no longer matched) is kept for Finance to refund; any
 * other failure (the engine could not be reached) leaves it for the next try.
 */
create function public.rpc_payment_engine_settled(
  p_reference text,
  p_ok boolean,
  p_refusal text,
  p_proof text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
begin
  if authz.paystack_mode(p_proof) is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  select * into p from public.payment
   where reference = p_reference and customer_engine_booking_id is not null and state = 'paid'
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_reference');
  end if;
  if p.engine_settled_at is not null or p.engine_settle_error is not null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if p_ok then
    update public.payment set engine_settled_at = now(), updated_at = now() where id = p.id;
    return jsonb_build_object('ok', true, 'settled', true);
  end if;
  if nullif(trim(p_refusal), '') is null then
    return jsonb_build_object('ok', true, 'retry', true);
  end if;

  update public.payment set engine_settle_error = left(p_refusal, 200), updated_at = now() where id = p.id;
  perform audit.log(
    p_actor_type => 'system'::public.actor_type, p_module => 'merchants',
    p_action => 'payment.booking_settle_refused', p_actor_label => '[System] · payments',
    p_target_type => 'payment', p_target_id => p.id, p_city_id => p.city_id, p_severity => 'high',
    p_reason => 'The booking engine refused a paid booking payment. Refund it.',
    p_after => jsonb_build_object('reference', p.reference, 'refusal', left(p_refusal, 200),
                                  'amount_cents', p.amount_cents));
  return jsonb_build_object('ok', true, 'refund_due', true);
end;
$$;

revoke execute on function public.rpc_payment_engine_settled(text, boolean, text, text) from public;
grant execute on function public.rpc_payment_engine_settled(text, boolean, text, text) to anon, authenticated;

insert into public.wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_payment_engine_due', 'The payments worker lists paid bookings to settle with no session.',
   'Refused unless p_proof is a Paystack secret key held in Vault. Returns references and engine ids only.'),
  ('rpc_payment_engine_settled', 'The payments worker records the engine''s answer with no session.',
   'Refused unless p_proof is a Paystack secret key held in Vault; only a paid booking payment not yet settled changes.')
on conflict (function_name) do update set reason = excluded.reason, guarded_by = excluded.guarded_by;

-- ───────────────────────────── the sweep also settles paid bookings

create or replace function public.cron_paystack_sweep()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due integer;
  v_url text;
  v_key text;
  v_minute text := floor(extract(epoch from now()) / 60)::bigint::text;
  v_request bigint;
begin
  select count(*) into v_due
    from public.paystack_attempt a join public.payment p on p.id = a.payment_id
   where a.outcome is null and a.opened_at is not null
     and a.opened_at < now() - interval '2 minutes'
     and a.created_at > now() - interval '24 hours'
     and (a.checked_at is null or a.checked_at < now() - interval '5 minutes')
     and p.state in ('pending', 'authorised');
  v_due := v_due + (select count(*) from public.payment p
                     where p.customer_engine_booking_id is not null and p.state = 'paid'
                       and p.engine_settled_at is null and p.engine_settle_error is null
                       and p.paid_at > now() - interval '7 days'
                       and p.paid_at < now() - interval '1 minute');
  if v_due = 0 then
    return jsonb_build_object('ok', true, 'waiting', 0);
  end if;

  select nullif(trim(decrypted_secret), '') into v_url
    from vault.decrypted_secrets where name = 'payments_worker_url';
  select coalesce(
           (select nullif(trim(decrypted_secret), '') from vault.decrypted_secrets
             where name = 'paystack_test_secret_key'),
           (select nullif(trim(decrypted_secret), '') from vault.decrypted_secrets
             where name = 'paystack_live_secret_key'))
    into v_key;
  if v_url is null or v_key is null then
    return jsonb_build_object('ok', false, 'waiting', v_due,
      'message', 'payments_worker_url or a Paystack secret key is missing from Vault, so late Paystack payments were not checked.');
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-paystack-worker', encode(extensions.hmac(convert_to('paystack-sweep:' || v_minute, 'UTF8'),
                                                  convert_to(v_key, 'UTF8'), 'sha256'), 'hex')),
    body := jsonb_build_object('action', 'paystack_sweep'),
    timeout_milliseconds := 55000
  ) into v_request;

  return jsonb_build_object('ok', true, 'waiting', v_due, 'request_id', v_request);
end;
$$;

revoke execute on function public.cron_paystack_sweep() from public, anon, authenticated;
grant execute on function public.cron_paystack_sweep() to service_role;
