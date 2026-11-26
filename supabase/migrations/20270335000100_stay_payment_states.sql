-- Stay payments through Paystack that end, and tell the truth (Paystack went
-- live on 26 Nov 2026; a trace of the apps against it, and the owner's own try,
-- found these). The id is a placeholder until the coordinator assigns one.
--
--  1. An unfinished stay payment ends. cron_expire_stay_payments closes a
--     Paystack stay payment once the hold is over and Paystack, asked late
--     enough, says no try on it is paid. With no such answer two hours after the
--     last try it is closed and raised for a person, and the guest's screens go
--     on reading pending until Paystack answers: nothing says money did not
--     arrive. A success arriving later is still recorded and ends in booked or
--     refund due.
--  2. Fees charged on top of the price settle the payment: requested_amount as
--     asked with a higher amount pays it for what was asked and is raised. A
--     signed webhook with a higher amount and no requested_amount records
--     nothing final, so Paystack's verify answer can still decide. Every other
--     mismatch behaves as before.
--  3. A refused payment, or a card page that never opened, no longer reads
--     pending in the stay checkout.
--  4. A stay's phone prompt waiting (three minutes) is handed back, whichever
--     phone method or number is asked for. Nothing is opened for a stay already
--     paid, or while a success Paystack announced is being confirmed. Card and
--     saved card are as before, except for 5.
--  5. A card page closed unfinished: the status says lastTry 'not_completed'
--     while the hold lasts, the try is left open (also when Paystack calls it
--     failed), and paying by card again hands back the same page.
--  6. The stay status read may ask Paystack about a try ten seconds old or more,
--     at most every ten seconds (rpc_stay_payment_check_claim).
--  7. A stay paid after its nights had gone is in the guest's list, cancelled
--     with its refund due.
--
-- Not here: holding mismatched money for a person, handing a card page back when
-- another way to pay is asked for, and a guard against a second payment settling
-- on one stay.
--
-- Rollback: unschedule 'stay-payments-expire'; restore
-- fn_native_stay_checkout_view and rpc_stay_guest_stays from 20270328000100,
-- rpc_stay_checkout_status and rpc_payment_begin_stay from 20270116000400,
-- rpc_payment_paystack_verified and rpc_payment_paystack_due from
-- 20270129000200, fn_paystack_apply from 20270215000100,
-- rpc_payment_paystack_attempt from 20270320000200 and cron_paystack_sweep from
-- 20270310000100; then drop cron_expire_stay_payments,
-- rpc_stay_payment_check_claim, rpc_stay_payment_return,
-- fn_stay_payment_status, fn_stay_last_try and fn_paystack_try_unpaid, and the
-- wiring_audit_exempt row. The two new paystack_attempt columns may stay. Put
-- the web app back first or at the same time: it ignores a missing
-- rpc_stay_payment_check_claim.

-- ═══════════════════════════════════════════════ 0. audit actions

insert into audit.action_registry (action, module, default_severity, needs_review, money, description) values
  ('payment.paystack_over_paid', 'orders', 'high', true, true,
   'Paystack charged more than NexG asked (fees passed to the customer); check the setting and refund the difference'),
  ('payment.stay_expired', 'hotels', 'info', false, true,
   'An unpaid stay payment was closed after its hold ran out'),
  ('payment.stay_unconfirmed', 'hotels', 'high', true, true,
   'A stay payment ran out with no clear answer from Paystack; check Paystack for the money')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ 1. what is kept about a try

alter table public.paystack_attempt
  add column if not exists provider_status text
    check (provider_status is null or length(provider_status) <= 40),
  add column if not exists claimed_at timestamptz;

comment on column public.paystack_attempt.provider_status is
  'The transaction status in Paystack''s last verify answer about this try, or awaiting_verify: a signed success that could not be decided without one.';
comment on column public.paystack_attempt.claimed_at is
  'When a stay status read last took this try to ask Paystack about it.';

/*
 * Whether a try with no outcome is settled as not paid: a card page never
 * recorded as opened (a minute on, nothing could be paid on it), or Paystack,
 * asked five minutes or more after a phone prompt began, or twenty-five after a
 * card try, answering abandoned, failed or reversed.
 */
create or replace function public.fn_paystack_try_unpaid(p_try public.paystack_attempt)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (p_try.opened_at is null and p_try.channel = 'card' and p_try.created_at <= now() - interval '1 minute')
    or (p_try.provider_status in ('abandoned', 'failed', 'reversed')
        and p_try.checked_at >= p_try.created_at
          + case when p_try.channel in ('mpesa', 'airtel') then interval '5 minutes'
                 else interval '25 minutes' end), false)
$$;

revoke execute on function public.fn_paystack_try_unpaid(public.paystack_attempt)
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════ 2. what Paystack said

-- As 20270129000200, and the status Paystack answered is kept on the try.

create or replace function public.rpc_payment_paystack_verified(
  p_attempt_reference text,
  p_verify_body text,
  p_proof text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_body jsonb;
begin
  v_mode := authz.paystack_mode(p_proof);
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  if p_verify_body is null or octet_length(p_verify_body) > 1048576 then
    return jsonb_build_object('ok', false, 'reason', 'unreadable');
  end if;
  begin
    v_body := p_verify_body::jsonb;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'reason', 'unreadable');
  end;
  if (v_body->>'status') is distinct from 'true'
     or jsonb_typeof(v_body->'data') is distinct from 'object'
     or v_body#>>'{data,reference}' is distinct from p_attempt_reference then
    return jsonb_build_object('ok', false, 'reason', 'not_this_attempt');
  end if;

  update public.paystack_attempt
     set checked_at = now(), check_count = check_count + 1,
         provider_status = case when is_test = (v_mode = 'test')
                                then left(v_body#>>'{data,status}', 40)
                                else provider_status end
   where reference = p_attempt_reference;

  return public.fn_paystack_apply(v_mode, null, v_body->'data', v_body);
end;
$$;

revoke execute on function public.rpc_payment_paystack_verified(text, text, text) from public;
grant execute on function public.rpc_payment_paystack_verified(text, text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════ 3. applying Paystack's answer

/*
 * As 20270215000100, and:
 *   * a 'failed' answer about a stay's card page, while its hold lasts, ends
 *     nothing: the guest goes back to that same page, and no second one opens;
 *   * Paystack's amount is what the customer was charged and requested_amount
 *     what NexG asked it to charge. requested_amount as asked with a larger
 *     amount (fees passed to the customer) pays the payment, for what was asked,
 *     and is raised as payment.paystack_over_paid;
 *   * a signed webhook with a larger amount and no requested_amount cannot say
 *     which it is. It records nothing final (no event under this transaction),
 *     marks the try awaiting_verify and answers 'awaiting_verify'; the sweep and
 *     the stay status read then ask Paystack, whose answer decides.
 * Everything else, the other mismatches included, is as before.
 */

create or replace function public.fn_paystack_apply(
  p_mode text,
  p_event text,
  p_data jsonb,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.paystack_attempt;
  p public.payment;
  v_status text := p_data->>'status';
  v_id text := nullif(p_data->>'id', '');
  v_amount bigint;
  v_fee bigint;
  v_result jsonb;
  v_auth jsonb := p_data->'authorization';
  v_card uuid;
  v_requested bigint;
  v_over boolean := false;
begin
  select * into a from public.paystack_attempt
   where reference = nullif(p_data->>'reference', '') for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_reference');
  end if;
  if a.is_test <> (p_mode = 'test') then
    return jsonb_build_object('ok', false, 'reason', 'mode_mismatch');
  end if;
  select * into p from public.payment where id = a.payment_id for update;

  if v_status = 'failed' then
    if a.outcome is null and a.channel = 'card' and a.authorization_url is not null
       and exists (select 1 from public.stay s
                    where s.id = p.stay_id and s.status = 'held' and s.hold_expires_at > now()) then
      return jsonb_build_object('ok', true, 'state', 'pending', 'status', v_status);
    end if;
    if a.outcome is null then
      update public.paystack_attempt
         set outcome = 'failed', checked_at = now(),
             failure_reason = left(coalesce(nullif(p_data->>'gateway_response', ''), 'declined'), 300)
       where id = a.id;
    end if;
    return jsonb_build_object('ok', true, 'state', 'failed');
  end if;

  if v_status is distinct from 'success' then
    return jsonb_build_object('ok', true, 'state', 'pending', 'status', v_status);
  end if;

  if v_id is null or v_id !~ '^[0-9]{1,20}$' then
    return jsonb_build_object('ok', false, 'reason', 'no_transaction_id');
  end if;
  if coalesce(p_data->>'currency', '') <> p.currency then
    return jsonb_build_object('ok', false, 'reason', 'currency_mismatch');
  end if;
  if jsonb_typeof(p_data->'amount') is distinct from 'number'
     or p_data->>'amount' !~ '^[1-9][0-9]{0,17}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;
  v_amount := (p_data->>'amount')::bigint;

  if p.state = 'paid' and p.provider_ref is distinct from v_id then
    insert into public.payment_event
      (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
    values (p.id, 'paystack', 'paystack.charge.success', 'paystack:' || v_id, p.reference,
            p_payload, true, false,
            'paid again on attempt ' || a.reference || '; refund by hand')
    on conflict (provider, dedupe_key) do nothing;
    if found then
      perform audit.log(
        p_actor_type => 'system'::public.actor_type, p_module => 'orders',
        p_action => 'payment.paystack_unmatched', p_actor_label => '[System] · payments',
        p_target_type => 'payment', p_target_id => p.id, p_city_id => p.city_id,
        p_severity => 'high',
        p_reason => 'Paystack took a second payment for a payment already paid.',
        p_after => jsonb_build_object('attempt', a.reference, 'transaction', v_id,
                                      'amount_cents', v_amount));
    end if;
    return jsonb_build_object('ok', false, 'reason', 'already_paid_other_attempt');
  end if;

  if v_amount > p.amount_cents and p.state not in ('paid', 'reversed') then
    v_requested := case when p_data->>'requested_amount' ~ '^[1-9][0-9]{0,17}$'
                        then (p_data->>'requested_amount')::bigint end;
    if v_requested = p.amount_cents then
      v_over := true;
    elsif v_requested is null and p_event is not null then
      -- A try ended earlier is opened again, so that Paystack is asked about it.
      update public.paystack_attempt
         set outcome = null, failure_reason = null, provider_status = 'awaiting_verify',
             checked_at = null, claimed_at = null
       where id = a.id and outcome is distinct from 'paid';
      return jsonb_build_object('ok', false, 'reason', 'awaiting_verify');
    end if;
  end if;

  update public.paystack_attempt set outcome = 'paid', checked_at = now() where id = a.id;

  if jsonb_typeof(p_data->'fees') = 'number' and p_data->>'fees' ~ '^[0-9]{1,18}$' then
    v_fee := (p_data->>'fees')::bigint;
    update public.payment set provider_fee_cents = v_fee where id = p.id;
  end if;

  v_result := public.rpc_payment_webhook(
    p_event => 'paystack.' || coalesce(p_event, 'verify.success'),
    p_reference => p.reference,
    p_dedupe_key => 'paystack:' || v_id,
    p_signature_ok => true,
    p_payload => p_payload,
    p_paid => true,
    p_provider_ref => v_id,
    p_amount_cents => case when v_over then p.amount_cents else v_amount end,
    p_channel => coalesce(nullif(p_data->>'channel', ''),
                          case when a.channel in ('card', 'saved_card') then 'card' else 'mobile_money' end));

  if v_over and v_result->>'state' = 'paid' then
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.paystack_over_paid', p_actor_label => '[System] · payments',
      p_target_type => 'payment', p_target_id => p.id, p_city_id => p.city_id,
      p_severity => 'high',
      p_reason => 'Paystack charged the customer more than NexG asked. Check that NexG, not the customer, pays Paystack''s fee, and refund the difference.',
      p_after => jsonb_build_object('reference', p.reference, 'attempt', a.reference, 'transaction', v_id,
                                    'asked_cents', p.amount_cents, 'charged_cents', v_amount,
                                    'fees_cents', v_fee));
  end if;

  if v_result->>'state' = 'paid' and a.phone is not null then
    update public.payment set payer_phone = coalesce(payer_phone, a.phone) where id = p.id;
  end if;

  if v_result->>'state' = 'paid' and a.customer_card_id is not null then
    update public.customer_card set last_used_at = now() where id = a.customer_card_id;
  end if;

  -- Keep the card, if asked and Paystack says it can be charged again.
  if v_result->>'state' = 'paid' and a.save_card and a.created_by is not null
     and jsonb_typeof(v_auth) = 'object'
     and v_auth->>'reusable' = 'true'
     and coalesce(v_auth->>'channel', 'card') = 'card'
     and coalesce(v_auth->>'authorization_code', '') ~ '^[A-Za-z0-9_]{6,100}$'
     and coalesce(v_auth->>'signature', '') <> ''
     and coalesce(v_auth->>'last4', '') ~ '^[0-9]{4}$'
     and coalesce(v_auth->>'exp_month', '') ~ '^(0?[1-9]|1[0-2])$'
     and coalesce(v_auth->>'exp_year', '') ~ '^20[0-9]{2}$'
     and coalesce(p_data#>>'{customer,email}', '') ~ '^[^\s@]+@[^\s@]+$'
     and not coalesce((select u.is_anonymous from auth.users u where u.id = a.created_by), true) then
    update public.customer_card
       set authorization_code = v_auth->>'authorization_code',
           email = p_data#>>'{customer,email}',
           brand = public.fn_card_brand(coalesce(v_auth->>'brand', v_auth->>'card_type')),
           last4 = v_auth->>'last4',
           exp_month = (v_auth->>'exp_month')::integer,
           exp_year = (v_auth->>'exp_year')::integer,
           bank = left(nullif(trim(v_auth->>'bank'), ''), 100),
           last_used_at = now()
     where user_id = a.created_by and is_test = a.is_test
       and signature = left(v_auth->>'signature', 200) and removed_at is null
    returning id into v_card;

    if v_card is null then
      insert into public.customer_card
        (user_id, is_test, authorization_code, signature, email, brand, last4,
         exp_month, exp_year, bank, last_used_at)
      values (a.created_by, a.is_test, v_auth->>'authorization_code', left(v_auth->>'signature', 200),
              p_data#>>'{customer,email}',
              public.fn_card_brand(coalesce(v_auth->>'brand', v_auth->>'card_type')),
              v_auth->>'last4', (v_auth->>'exp_month')::integer, (v_auth->>'exp_year')::integer,
              left(nullif(trim(v_auth->>'bank'), ''), 100), now())
      returning id into v_card;

      perform audit.log(
        p_actor_type => 'system'::public.actor_type, p_module => 'orders',
        p_action => 'payment.card_saved', p_actor_label => '[System] · payments',
        p_target_type => 'payment', p_target_id => p.id, p_city_id => p.city_id,
        p_after => jsonb_build_object('card', v_card, 'test', a.is_test));
    end if;
  end if;

  return v_result;
end;
$$;

revoke execute on function public.fn_paystack_apply(text, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════ 4. one more try

/*
 * As 20270320000200, and:
 *   * nothing is tried while a success Paystack announced on this payment is
 *     waiting for its verify answer;
 *   * a stay's phone prompt is handed back for three minutes (Paystack gives a
 *     prompt 180 seconds), to any number and for M-Pesa or Airtel Money.
 *     'same_request' says whether it is the way and number asked for. A prompt
 *     Paystack said failed does not count;
 *   * a stay's open card page is handed back for as long as it has no outcome,
 *     whether or not the card is to be saved, so going back to pay by card never
 *     opens a second one.
 */

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
  if exists (select 1 from public.paystack_attempt w
              where w.payment_id = p.id and w.outcome is null
                and w.provider_status = 'awaiting_verify') then
    raise exception 'We have received your payment and are confirming it. Do not pay again.'
      using errcode = '22023';
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

  -- A stay: a prompt still waiting is handed back, whichever phone way asks.
  if p.intent::text = 'stay' and p_channel in ('mpesa', 'airtel') then
    select * into a from public.paystack_attempt x
     where x.payment_id = p.id and x.outcome is null and x.channel in ('mpesa', 'airtel')
       and coalesce(x.opened_at, x.created_at) > now() - interval '3 minutes'
     order by coalesce(x.opened_at, x.created_at) desc, x.reference desc limit 1;
    if a.id is not null then
      return jsonb_build_object(
        'ok', true, 'reused', true, 'attempt_reference', a.reference, 'channel', a.channel,
        'same_request', a.channel = p_channel and a.phone = p_phone,
        'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', p.is_test,
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (
          coalesce(a.opened_at, a.created_at) + interval '3 minutes' - now())))::integer));
    end if;
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
       and authorization_url is not null
       and (p.intent::text = 'stay'
            or (opened_at > now() - interval '30 minutes' and save_card = v_save))
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

revoke execute on function public.rpc_payment_paystack_attempt(text, text, text, text, boolean, uuid)
  from public, anon;
grant execute on function public.rpc_payment_paystack_attempt(text, text, text, text, boolean, uuid)
  to authenticated;

-- ═══════════════════════════════════════════════ 5. opening a stay payment

-- As 20270116000400, and refused for a stay a payment has already paid.

create or replace function public.rpc_payment_begin_stay(p_stay_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_stay public.stay;
  v_unit public.unit;
  v_existing public.payment;
  v_id uuid;
  v_ref text;
  v_amount bigint;
begin
  if v_uid is null then
    raise exception 'Sign in to pay for your stay.' using errcode = '42501';
  end if;
  /* A guest (temporary session) may pay too; their booking code is their confirmation. */

  select * into v_stay from public.stay where id = p_stay_id;
  if v_stay.id is null or v_stay.guest_user_id is distinct from v_uid then
    raise exception 'That stay is not yours.' using errcode = '42501';
  end if;
  if v_stay.status = 'booked' then
    raise exception 'That stay is already paid and confirmed.' using errcode = '22023';
  end if;
  if v_stay.status <> 'held' or v_stay.hold_expires_at <= now() then
    raise exception 'Your hold ran out. Choose your dates again.' using errcode = '22023';
  end if;
  if coalesce(v_stay.quote_total_kes, 0) <= 0 then
    raise exception 'This stay has no price to pay.' using errcode = '22023';
  end if;

  select * into v_unit from public.unit where id = v_stay.unit_id for update;
  select * into v_stay from public.stay where id = p_stay_id for update;

  if exists (select 1 from public.payment where stay_id = p_stay_id and state = 'paid') then
    raise exception 'This stay has already been paid for. Do not pay again.' using errcode = '22023';
  end if;

  update public.stay
     set hold_expires_at = greatest(hold_expires_at, now() + interval '10 minutes'),
         updated_at = now()
   where id = p_stay_id
  returning * into v_stay;

  v_amount := v_stay.quote_total_kes * 100;

  select * into v_existing from public.payment
   where stay_id = p_stay_id and state in ('pending', 'authorised')
   limit 1;
  if v_existing.id is not null then
    update public.payment set expires_at = v_stay.hold_expires_at, updated_at = now()
     where id = v_existing.id;
    return jsonb_build_object(
      'ok', true, 'payment_id', v_existing.id, 'reference', v_existing.reference,
      'amount_cents', v_existing.amount_cents, 'currency', v_existing.currency,
      'expires_at', v_stay.hold_expires_at, 'reused', true);
  end if;

  v_ref := public.fn_payment_reference();
  insert into public.payment (
    reference, intent, stay_id, city_id, amount_cents, currency,
    created_by, created_via, expires_at)
  values (
    v_ref, 'stay', p_stay_id, v_unit.city_id, v_amount, 'KES',
    v_uid, 'guest_checkout', v_stay.hold_expires_at)
  returning id into v_id;

  perform audit.log('guest'::public.actor_type, 'hotels', 'payment.stay_begun',
    p_actor_id => v_uid, p_target_type => 'payment', p_target_id => v_id,
    p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('stay', p_stay_id, 'amount_cents', v_amount, 'reference', v_ref));

  return jsonb_build_object(
    'ok', true, 'payment_id', v_id, 'reference', v_ref,
    'amount_cents', v_amount, 'currency', 'KES',
    'expires_at', v_stay.hold_expires_at, 'reused', false);
end;
$$;

-- ═══════════════════════════════════════════════ 6. what a guest's stay screens are told

/*
 * A stay's paymentStatus, the four values the apps know. For a Paystack payment:
 *   pending  a try may still bring money: one that reached Paystack, a phone
 *            prompt, or a card page being opened in the last minute, with no
 *            outcome; or a success waiting to be confirmed. A closed payment
 *            stays pending while any try on it is not settled as unpaid
 *            (fn_paystack_try_unpaid), as after two hours with no answer;
 *   failed   every try ended unpaid, or the payment's time ran out with
 *            nothing that could take money;
 *   unpaid   a payment opened with nothing tried yet.
 * Payments begun another way (Safaricom) read as before.
 */
create or replace function public.fn_stay_payment_status(p_stay_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.paid_kes is not null and s.paid_kes > 0 then 'paid'
    when p.state = 'paid' then 'paid'
    when p.state in ('pending', 'authorised') and p.provider in ('paystack', 'unassigned') then
      case when tries.may_pay then 'pending'
           when tries.failed then 'failed'
           when p.expires_at <= clock_timestamp() then 'failed'
           else 'unpaid' end
    when p.state = 'abandoned' and p.provider = 'paystack' and tries.unsettled then 'pending'
    when p.state = 'pending' and p.provider_ref is null and p.expires_at <= clock_timestamp() then 'failed'
    when p.state in ('pending', 'authorised') then 'pending'
    when p.id is not null then 'failed'
    else 'unpaid'
  end
  from public.stay s
  left join lateral (
    select id, state, provider, provider_ref, expires_at from public.payment
     where stay_id = s.id order by created_at desc, id desc limit 1
  ) p on true
  left join lateral (
    select bool_or(a.outcome = 'paid'
                   or (a.outcome is null
                       and (a.opened_at is not null or a.channel <> 'card'
                            or a.created_at > clock_timestamp() - interval '1 minute'
                            or a.provider_status = 'awaiting_verify'))) as may_pay,
           bool_or(a.outcome = 'failed') as failed,
           bool_or(a.outcome = 'paid'
                   or (a.outcome is null and not public.fn_paystack_try_unpaid(a))) as unsettled
      from public.paystack_attempt a
     where a.payment_id = p.id
  ) tries on true
  where s.id = p_stay_id
$$;

revoke execute on function public.fn_stay_payment_status(uuid) from public, anon, authenticated;

/*
 * 'not_completed' while a held stay's newest try is a card page Paystack, when
 * asked, called abandoned or failed: the guest can go back to that same page.
 * Paystack calls a page abandoned from the moment it opens until it is paid, so
 * this also holds while the guest is still on it. Null otherwise.
 */
create or replace function public.fn_stay_last_try(p_stay_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'not_completed'::text
    from public.stay s
    join lateral (
      select id, state from public.payment
       where stay_id = s.id order by created_at desc, id desc limit 1
    ) p on true
    join lateral (
      select channel, outcome, opened_at, provider_status from public.paystack_attempt
       where payment_id = p.id order by created_at desc, reference desc limit 1
    ) t on true
   where s.id = p_stay_id and s.status = 'held' and s.hold_expires_at > clock_timestamp()
     and p.state in ('pending', 'authorised')
     and t.channel = 'card' and t.outcome is null and t.opened_at is not null
     and t.provider_status in ('abandoned', 'failed')
$$;

revoke execute on function public.fn_stay_last_try(uuid) from public, anon, authenticated;

-- As 20270328000100, with paymentStatus from fn_stay_payment_status and an
-- optional 'lastTry'.

create or replace function public.fn_native_stay_checkout_view(p_checkout_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'operationId', c.id,
    'stayId', s.id,
    'holdExpiresAt', s.hold_expires_at,
    'currency', 'KES',
    'totalMinor', c.total_minor,
    'status', case when s.status = 'held' and s.hold_expires_at <= clock_timestamp()
                   then 'expired' else s.status::text end,
    'paymentStatus', public.fn_stay_payment_status(s.id),
    'lastTry', public.fn_stay_last_try(s.id),
    'refundDue', s.refund_due_at is not null,
    'refunded', s.refunded_at is not null,
    'cancelledAfterBooking', s.status = 'cancelled' and s.confirmed_at is not null,
    'reference', coalesce(s.payment_reference, p.reference),
    'providerPending', p.state = 'authorised' and p.provider = 'mpesa'))
  from public.native_stay_checkout c
  join public.stay s on s.id = c.stay_id and s.guest_user_id = c.guest_user_id
  left join lateral (
    select id, state, provider, provider_ref, reference, expires_at from public.payment
     where stay_id = s.id order by created_at desc, id desc limit 1
  ) p on true
  where c.id = p_checkout_id;
$$;

revoke execute on function public.fn_native_stay_checkout_view(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════ 7. the website's stay checkout

-- As 20270116000400, plus 'payment_status' and 'last_try', the two readings
-- above.

create or replace function public.rpc_stay_checkout_status(p_stay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_zone text;
  v_result jsonb;
begin
  select * into v_stay from public.stay where id = p_stay_id;
  if v_stay.id is null or v_stay.guest_user_id is distinct from auth.uid() or auth.uid() is null then
    raise exception 'That stay is not yours.' using errcode = '42501';
  end if;
  select coalesce(h.time_zone, 'Africa/Nairobi') into v_zone from public.host h where h.id = v_stay.host_id;

  select jsonb_build_object(
    'stay_id', v_stay.id,
    'status', case when v_stay.status = 'held' and v_stay.hold_expires_at <= now()
                   then 'expired' else v_stay.status end,
    'hold_expires_at', v_stay.hold_expires_at,
    'check_in', (v_stay.check_in at time zone v_zone)::date,
    'check_out', (v_stay.check_out at time zone v_zone)::date,
    'nights', (v_stay.check_out at time zone v_zone)::date - (v_stay.check_in at time zone v_zone)::date,
    'adults', v_stay.party_adults,
    'children', v_stay.party_children,
    'total_kes', v_stay.quote_total_kes,
    'paid_kes', v_stay.paid_kes,
    'refund_due', v_stay.refund_due_at is not null,
    'unit', coalesce(u.label_public, u.name),
    'property', p.name,
    'property_slug', p.slug,
    'payment_state', (select pay.state::text from public.payment pay
                       where pay.stay_id = v_stay.id order by pay.created_at desc limit 1),
    'payment_failure', (select pay.failure_reason from public.payment pay
                         where pay.stay_id = v_stay.id order by pay.created_at desc limit 1),
    'payment_reference', v_stay.payment_reference,
    'booking_code', public.rpc_my_stay_code(v_stay.id),
    'reservation_name', v_stay.guest_first_name,
    'payment_status', public.fn_stay_payment_status(v_stay.id),
    'last_try', public.fn_stay_last_try(v_stay.id))
  into v_result
  from public.unit u
  left join public.property p on p.id = u.property_id
  where u.id = v_stay.unit_id;

  return v_result;
end;
$$;

revoke execute on function public.rpc_stay_checkout_status(uuid) from public, anon;
grant execute on function public.rpc_stay_checkout_status(uuid) to authenticated;

/*
 * Paystack's page sends a guest back to /pay/{reference}, and a stay's payment
 * is not readable by its guest: this says which of the caller's own stays that
 * reference pays, so the website can take them to it. Null for anything else.
 */
create or replace function public.rpc_stay_payment_return(p_reference text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('stay_id', s.id, 'property_slug', pr.slug)
    from public.payment p
    join public.stay s on s.id = p.stay_id
    left join public.unit u on u.id = s.unit_id
    join public.property pr on pr.id = coalesce(s.property_id, u.property_id)
   where p.reference = p_reference and p.intent = 'stay'
     and (select auth.uid()) is not null and s.guest_user_id = (select auth.uid())
$$;

revoke execute on function public.rpc_stay_payment_return(text) from public, anon;
grant execute on function public.rpc_stay_payment_return(text) to authenticated;

-- ═══════════════════════════════════════════════ 8. money after the nights had gone

-- As 20270328000100, plus a stay whose payment arrived after its nights had
-- gone: cancelled, never confirmed, refund due. Such a stay shows no way in and
-- no Wi-Fi.

create or replace function public.rpc_stay_guest_stays(p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('stays', coalesce(jsonb_agg(x.stay order by x.check_in desc, x.id), '[]'::jsonb))
    from (
      select s.id, s.check_in, jsonb_build_object(
        'id', s.id,
        'status', s.status,
        'check_in', s.check_in,
        'check_out', s.check_out,
        'checked_in_at', s.checked_in_at,
        'checked_out_at', s.checked_out_at,
        'party_adults', s.party_adults,
        'party_children', s.party_children,
        'guest_first_name', s.guest_first_name,
        'paid_kes', s.paid_kes,
        'quote_total_kes', s.quote_total_kes,
        'payment_reference', s.payment_reference,
        'refundDue', s.refund_due_at is not null,
        'refunded', s.refunded_at is not null,
        'refundKes', coalesce(s.refund_amount_kes,
                              case when s.refund_due_at is not null then s.paid_kes end),
        'host_name', coalesce(nullif(trim(h.display_name), ''), 'Host'),
        'time_zone', coalesce(nullif(h.time_zone, ''), 'Africa/Nairobi'),
        'property_id', s.property_id,
        'property_name', p.name,
        'area', coalesce(nullif(trim(p.area), ''), nullif(trim(u.area), '')),
        'photo', (
          select ph.item
            from jsonb_array_elements(coalesce(p.photos, '[]'::jsonb)) with ordinality as ph(item, n)
           where authz.host_photo_is_public(ph.item ->> 'path')
           order by ph.n
           limit 1),
        'unit_id', s.unit_id,
        'unit_name', nullif(trim(u.label_public), ''),
        'check_in_time', to_char(coalesce(u.checkin_time, p.check_in_from), 'HH24:MI'),
        'check_out_time', to_char(coalesce(u.checkout_time, p.check_out_by), 'HH24:MI'),
        'house_rules', p.house_rules,
        'cancellation_policy', p.cancellation_policy,
        'handoff', case when s.status <> 'cancelled' or s.confirmed_at is not null then u.handoff end,
        'wifi_name', case when s.status <> 'cancelled' or s.confirmed_at is not null
                          then nullif(trim(u.wifi_name), '') end,
        'guide_available', authz.stay_guest_guide_unit(s.id) is not null,
        'chat_thread_id', (select c.id from public.msg_conversation c where c.stay_id = s.id),
        'can_chat', authz.stay_chat_open(s.id)
      ) as stay
        from public.stay s
        join public.host h on h.id = s.host_id
        left join public.property p on p.id = s.property_id
        left join public.unit u on u.id = s.unit_id
       where (select auth.uid()) is not null
         and s.guest_user_id = (select auth.uid())
         and (s.status in ('booked', 'in_stay', 'departed')
              or (s.status = 'cancelled'
                  and (s.confirmed_at is not null
                       or (s.source = 'nexg' and s.refund_due_at is not null))))
       order by s.check_in desc, s.id
       limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) x
$$;

revoke execute on function public.rpc_stay_guest_stays(integer) from public, anon;
grant execute on function public.rpc_stay_guest_stays(integer) to authenticated;

-- ═══════════════════════════════════════════════ 9. asking Paystack from a status read

/*
 * The tries on the caller's own stay that are worth putting to Paystack now: no
 * outcome, and sent ten seconds ago or more (a phone prompt never recorded as
 * sent: a minute; a success waiting to be confirmed: at once), neither answered
 * nor taken in the last ten seconds. At most two. Taking them stamps
 * claimed_at, so a polling screen cannot hammer Paystack even while Paystack is
 * not answering. checked_at is left for Paystack's real answers, which the
 * expiry below relies on. No age limit: a try left behind is still asked about
 * when its guest looks.
 */
create or replace function public.rpc_stay_payment_check_claim(p_stay_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_out jsonb;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.stay s where s.id = p_stay_id and s.guest_user_id = v_uid) then
    raise exception 'That stay is not yours.' using errcode = '42501';
  end if;

  with due as (
    select a.id
      from public.paystack_attempt a
      join public.payment p on p.id = a.payment_id
     where p.stay_id = p_stay_id and p.intent = 'stay'
       and (p.state in ('pending', 'authorised', 'abandoned') or a.provider_status = 'awaiting_verify')
       and a.outcome is null
       and (a.opened_at <= now() - interval '10 seconds'
            or a.provider_status = 'awaiting_verify'
            or (a.opened_at is null and a.channel <> 'card'
                and a.created_at <= now() - interval '1 minute'))
       and (a.checked_at is null or a.checked_at <= now() - interval '10 seconds')
       and (a.claimed_at is null or a.claimed_at <= now() - interval '10 seconds')
     order by a.created_at desc
     limit 2
     for update of a skip locked
  ), claimed as (
    update public.paystack_attempt x
       set claimed_at = now()
      from due
     where x.id = due.id
    returning x.reference, x.is_test
  )
  select coalesce(jsonb_agg(jsonb_build_object('attempt_reference', c.reference, 'is_test', c.is_test)
                            order by c.reference), '[]'::jsonb)
    into v_out from claimed c;
  return v_out;
end;
$$;

revoke execute on function public.rpc_stay_payment_check_claim(uuid) from public, anon;
grant execute on function public.rpc_stay_payment_check_claim(uuid) to authenticated;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_stay_payment_check_claim',
   'Only notes that a guest''s own try is about to be put to Paystack; any change to the payment goes through rpc_payment_paystack_verified.',
   'paystack_attempt.claimed_at')
on conflict (function_name) do nothing;

-- ═══════════════════════════════════════════════ 10. the sweep

-- As 20270129000200, and: a closed stay payment is still asked about for the
-- rest of its day, every half hour and after the live ones, so a late success is
-- found even if Paystack's webhook does not arrive; and a success waiting to be
-- confirmed is asked about whatever its age or its payment's state.

create or replace function public.rpc_payment_paystack_due(p_proof text)
returns table (attempt_reference text, is_test boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if authz.paystack_mode(p_proof) is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  return query
    select a.reference, a.is_test
      from public.paystack_attempt a
      join public.payment p on p.id = a.payment_id
     where a.outcome is null
       and ((a.opened_at < now() - interval '2 minutes'
             and a.created_at > now() - interval '24 hours'
             and ((p.state in ('pending', 'authorised')
                   and (a.checked_at is null or a.checked_at < now() - interval '5 minutes'))
                  or (p.intent = 'stay' and p.state = 'abandoned'
                   and (a.checked_at is null or a.checked_at < now() - interval '30 minutes'))))
            or (a.provider_status = 'awaiting_verify'
             and (a.checked_at is null or a.checked_at < now() - interval '5 minutes')))
     order by (p.state = 'abandoned'), a.opened_at
     limit 20;
end;
$$;

revoke execute on function public.rpc_payment_paystack_due(text) from public;
grant execute on function public.rpc_payment_paystack_due(text) to anon, authenticated;

-- As 20270310000100, counting the same tries as rpc_payment_paystack_due.

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
   where a.outcome is null
     and ((a.opened_at < now() - interval '2 minutes'
           and a.created_at > now() - interval '24 hours'
           and ((p.state in ('pending', 'authorised')
                 and (a.checked_at is null or a.checked_at < now() - interval '5 minutes'))
                or (p.intent = 'stay' and p.state = 'abandoned'
                 and (a.checked_at is null or a.checked_at < now() - interval '30 minutes'))))
          or (a.provider_status = 'awaiting_verify'
           and (a.checked_at is null or a.checked_at < now() - interval '5 minutes')));
  v_due := v_due + (select count(*) from public.payment p
                     where p.customer_engine_booking_id is not null and p.state = 'paid'
                       and p.engine_settled_at is null and p.engine_settle_error is null
                       and p.paid_at > now() - interval '7 days'
                       and p.paid_at < now() - interval '1 minute');
  /* A city paying riders automatically, or a rider transfer to finish. */
  v_due := v_due + (select count(*) from public.city c
                     where coalesce(nullif(settings.fn_text('payouts.rider.mode', c.id), ''), 'run') <> 'run'
                       and nullif(settings.fn_text('payouts.rider.automatic_from', c.id), '') is not null);
  v_due := v_due + (select count(*) from public.paystack_transfer t
                     where t.kind = 'rider_payout' and t.state in ('opened', 'pending'));
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

-- ═══════════════════════════════════════════════ 11. unfinished stay payments end

/*
 * Every two minutes: a stay payment through Paystack (or never started) whose
 * hold is over and whose own time has run out is closed ('abandoned') once every
 * try on it failed or is settled as unpaid (fn_paystack_try_unpaid). Otherwise
 * it waits, but not past two hours from the last try: then it is closed and
 * raised for a person (payment.stay_unconfirmed), and goes on reading pending to
 * the guest until Paystack answers.
 * A payment with a success on it that was never applied (Paystack's verify said
 * success, or a webhook is waiting for that answer) is never closed here; two
 * hours after the last try it is raised, once.
 * Closing says nothing about money: a success that arrives later still pays the
 * payment, and tg_payment_stay_settled books the stay or marks a refund due.
 */
create or replace function public.cron_expire_stay_payments()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_last timestamptz;
  v_money boolean;
  v_waiting boolean;
  v_expired integer := 0;
  v_raised integer := 0;
begin
  for r in
    select p.id, p.stay_id, p.reference, p.city_id, p.amount_cents, p.is_test
      from public.payment p
      join public.stay s on s.id = p.stay_id
     where p.intent = 'stay' and p.state in ('pending', 'authorised')
       and p.provider in ('paystack', 'unassigned')
       and (p.expires_at is null or p.expires_at <= now())
       and (s.status <> 'held' or s.hold_expires_at <= now())
       and not exists (select 1 from public.payment_prompt pr
                        where pr.payment_id = p.id and pr.resolved_at is null)
     order by p.created_at desc
     limit 200
     for update of p skip locked
  loop
    select max(a.created_at),
           coalesce(bool_or(a.outcome = 'paid'
                            or (a.outcome is null
                                and a.provider_status in ('success', 'awaiting_verify'))), false),
           coalesce(bool_or(a.outcome is null and not public.fn_paystack_try_unpaid(a)), false)
      into v_last, v_money, v_waiting
      from public.paystack_attempt a
     where a.payment_id = r.id;

    if v_money then
      if v_last <= now() - interval '2 hours'
         and not exists (select 1 from audit.audit_event e
                          where e.target_type = 'payment' and e.target_id = r.id
                            and e.action = 'payment.stay_unconfirmed') then
        perform audit.log(
          p_actor_type => 'system'::public.actor_type, p_module => 'hotels',
          p_action => 'payment.stay_unconfirmed', p_actor_label => '[System] · payments',
          p_target_type => 'payment', p_target_id => r.id, p_city_id => r.city_id,
          p_severity => 'high',
          p_reason => 'Paystack announced a success on this stay payment that was never applied. It is left open. Check it in Paystack.',
          p_after => jsonb_build_object('stay', r.stay_id, 'reference', r.reference,
                                        'amount_cents', r.amount_cents, 'test', r.is_test,
                                        'closed', false));
        v_raised := v_raised + 1;
      end if;
      continue;
    end if;

    if v_waiting and v_last > now() - interval '2 hours' then
      continue;
    end if;

    update public.payment
       set state = 'abandoned', updated_at = now(),
           failure_reason = coalesce(failure_reason,
             case when v_waiting then 'no final answer from Paystack within two hours'
                  else 'not paid before the hold ran out' end)
     where id = r.id;
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'hotels',
      p_action => case when v_waiting then 'payment.stay_unconfirmed' else 'payment.stay_expired' end,
      p_actor_label => '[System] · payments',
      p_target_type => 'payment', p_target_id => r.id, p_city_id => r.city_id,
      p_severity => case when v_waiting then 'high'::public.audit_severity
                         else 'info'::public.audit_severity end,
      p_reason => case when v_waiting
        then 'Closed with no final answer from Paystack. Check in Paystack whether money was taken.'
        else 'The hold ran out and no try could still be paid.' end,
      p_after => jsonb_build_object('stay', r.stay_id, 'reference', r.reference,
                                    'amount_cents', r.amount_cents, 'test', r.is_test,
                                    'closed', true));
    if v_waiting then
      v_raised := v_raised + 1;
    else
      v_expired := v_expired + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'expired', v_expired, 'raised', v_raised);
end;
$$;

revoke execute on function public.cron_expire_stay_payments() from public, anon, authenticated;
grant execute on function public.cron_expire_stay_payments() to service_role;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; unfinished stay payments are not expired.';
    return;
  end if;
  perform cron.schedule('stay-payments-expire', '*/2 * * * *',
    $sched$select public.cron_expire_stay_payments()$sched$);
end
$cron$;
