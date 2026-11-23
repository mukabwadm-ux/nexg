-- Paystack, saved cards (owner, 22 Nov 2026: "Saved cards next").
--
-- A customer with an account may tick "Save this card" when paying by card.
-- When Paystack's paid answer says the card can be charged again
-- (authorization.reusable), the card is kept here:
--   * brand, last four, expiry and bank: shown to the customer;
--   * Paystack's authorization_code and signature: kept on the server only,
--     never returned to a phone. The app never sees a card number.
-- Paying with a saved card charges that authorization from the server, so no
-- Paystack page opens (the bank may still ask for a code; then Paystack's page
-- opens for that step). Guests (anonymous sessions) cannot save cards.
-- A card saved with test keys is a test card and is only offered in test mode.
--
-- Builds on 20270129000200_paystack_collections.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('payment.card_saved', 'orders', 'info', false, 'A customer saved a card through Paystack'),
  ('payment.card_removed', 'orders', 'info', false, 'A customer removed a saved card')
on conflict (action) do nothing;

-- ─────────────────────────────────────────────────────────── saved cards

create table public.customer_card (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'paystack' check (provider = 'paystack'),
  is_test boolean not null,
  authorization_code text not null check (authorization_code ~ '^[A-Za-z0-9_]{6,100}$'),
  signature text not null check (length(signature) between 6 and 200),
  email text not null check (length(email) between 3 and 200),
  brand text not null check (brand in ('visa', 'mastercard', 'amex', 'verve', 'other')),
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  exp_month integer not null check (exp_month between 1 and 12),
  exp_year integer not null check (exp_year between 2000 and 2100),
  bank text check (bank is null or length(bank) <= 100),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  removed_at timestamptz
);

comment on table public.customer_card is
  'Cards a customer chose to save, as Paystack authorizations. authorization_code stays on the server; customers read brand, last four and expiry through rpc_my_cards.';

-- The same card saved again refreshes the row instead of adding a second.
create unique index customer_card_once on public.customer_card (user_id, is_test, signature)
  where removed_at is null;

alter table public.customer_card enable row level security;
revoke all on public.customer_card from public, anon, authenticated;

alter table public.paystack_attempt
  add column save_card boolean not null default false,
  add column customer_card_id uuid references public.customer_card (id) on delete set null;

alter table public.paystack_attempt drop constraint paystack_attempt_channel_check;
alter table public.paystack_attempt
  add constraint paystack_attempt_channel_check
  check (channel in ('card', 'mpesa', 'airtel', 'saved_card'));

create function public.fn_card_brand(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(coalesce(p_value, '')) like '%visa%' then 'visa'
    when lower(coalesce(p_value, '')) like '%master%' then 'mastercard'
    when lower(coalesce(p_value, '')) like '%amex%' or lower(coalesce(p_value, '')) like '%american%' then 'amex'
    when lower(coalesce(p_value, '')) like '%verve%' then 'verve'
    else 'other' end
$$;

-- ──────────────────────── a try at Paystack, now with saved cards too

drop function public.rpc_payment_paystack_attempt(text, text, text, text);

/*
 * As in 20270129000200, plus:
 *   * p_save_card: on a card try, keep the card if Paystack says it can be
 *     charged again. Ignored for a guest, who has no account to keep it in.
 *   * channel 'saved_card' with p_card_id: charge one of the customer's own
 *     saved cards, in the same mode it was saved in. The answer carries the
 *     authorization code and email for the server (which proved itself with
 *     the secret key) to charge; nothing is charged here. A second tap within
 *     a minute charges nothing.
 */
create function public.rpc_payment_paystack_attempt(
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
  if p.intent <> 'order' then
    raise exception 'Only orders are paid through Paystack so far.' using errcode = '22023';
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

revoke execute on function public.rpc_payment_paystack_attempt(text, text, text, text, boolean, uuid)
  from public, anon;
grant execute on function public.rpc_payment_paystack_attempt(text, text, text, text, boolean, uuid)
  to authenticated;

-- ───────────────────── Paystack's answer, now also keeping a saved card

/*
 * As in 20270129000200, plus: once a card try is paid, keep the card when the
 * customer asked and Paystack says it is reusable; and note when a saved card
 * was last used.
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
    p_amount_cents => v_amount,
    p_channel => coalesce(nullif(p_data->>'channel', ''),
                          case when a.channel in ('card', 'saved_card') then 'card' else 'mobile_money' end));

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

-- ─────────────────────────────────────────── the customer's own cards

-- Brand, last four, expiry and bank only; never the authorization.
create function public.rpc_my_cards()
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'brand', c.brand, 'last4', c.last4, 'exp_month', c.exp_month,
             'exp_year', c.exp_year, 'bank', c.bank, 'is_test', c.is_test,
             'created_at', c.created_at, 'last_used_at', c.last_used_at)
           order by coalesce(c.last_used_at, c.created_at) desc)
      from public.customer_card c
     where c.user_id = v_uid and c.removed_at is null), '[]'::jsonb);
end;
$$;

revoke execute on function public.rpc_my_cards() from public, anon;
grant execute on function public.rpc_my_cards() to authenticated;

/*
 * Removes one of the customer's own cards. The web app passes the secret key
 * as proof and gets the authorization back once, to ask Paystack to switch
 * it off too; the row keeps no usable authorization afterwards.
 */
create function public.rpc_my_card_remove(p_card_id uuid, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.customer_card;
  v_uid uuid := (select auth.uid());
  v_mode text := authz.paystack_mode(p_proof);
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;

  select * into c from public.customer_card
   where id = p_card_id and user_id = v_uid and removed_at is null for update;
  if not found then
    raise exception 'That card is no longer saved.' using errcode = '22023';
  end if;

  update public.customer_card
     set removed_at = now(), authorization_code = 'removed_' || replace(c.id::text, '-', '')
   where id = c.id;

  perform audit.log(
    p_actor_type => 'guest'::public.actor_type, p_actor_id => v_uid, p_module => 'orders',
    p_action => 'payment.card_removed', p_target_type => 'customer_card', p_target_id => c.id,
    p_after => jsonb_build_object('last4', c.last4, 'test', c.is_test));

  -- Only a key of the card's own mode may switch it off at Paystack.
  return jsonb_build_object('ok', true, 'is_test', c.is_test)
    || case when c.is_test = (v_mode = 'test')
         then jsonb_build_object('authorization_code', c.authorization_code)
         else '{}'::jsonb end;
end;
$$;

revoke execute on function public.rpc_my_card_remove(uuid, text) from public, anon;
grant execute on function public.rpc_my_card_remove(uuid, text) to authenticated;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_payment_paystack_attempt',
   'Opens a try at Paystack before Paystack has heard of it; the try is audited as payment.paystack_started when Paystack accepts it.',
   'paystack_attempt; audit payment.paystack_started from rpc_payment_paystack_opened')
on conflict (function_name) do nothing;
