-- Paystack collections, slice 1: an order is paid by card, M-Pesa or Airtel
-- Money through Paystack (owner, 21 Nov 2026: one company Paystack account,
-- and M-Pesa through Paystack too). The plan is paystack-plan.md in the
-- coordinator's notes; this migration is its first slice, test mode first.
--
-- How it fits what exists:
--   * rpc_payment_begin_order still opens (or reuses) the one live payment
--     for an order. Nothing here changes it.
--   * Each try at Paystack is a paystack_attempt with its own reference
--     (<payment reference>-<n>), because Paystack refuses a reference it has
--     seen before and a customer may try a card, then M-Pesa, then a card.
--     The reference is written here before Paystack hears of it.
--   * "Paid" comes only from Paystack: a webhook signed with the secret key,
--     or a verify answer the server fetched with the secret key. Both land in
--     fn_paystack_apply, which calls the shared rpc_payment_webhook (dedupe,
--     amount check, order paid, ledger). The phone's word is never enough.
--   * The server proves itself with the Paystack secret key, held in Vault as
--     paystack_test_secret_key and paystack_live_secret_key (typed in by the
--     owner, never in a migration). Which key matches says test or live, and
--     the payment carries it as is_test.
--   * Test money stays out of the books: an order paid in test mode posts
--     nothing to the ledger, and test payments are refused for every shop
--     that is not marked accepts_test_payments.
--
-- Not here (later slices): bookings, stays, saved cards, refunds through
-- Paystack, transfers, and posting Paystack's fee to the ledger (the fee is
-- recorded on the payment).

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('payment.paystack_started', 'orders', 'info', true, 'Paystack payment started'),
  ('payment.paystack_unmatched', 'orders', 'high', true,
   'Paystack reported money paid that NexG no longer expects')
on conflict (action) do nothing;

-- ─────────────────────────────────────────────────────────────── columns

alter table public.payment
  add column if not exists is_test boolean not null default false,
  add column if not exists provider_fee_cents bigint
    check (provider_fee_cents is null or provider_fee_cents >= 0);

comment on column public.payment.is_test is
  'Paid or begun with a payment provider''s test keys. No money moved; kept out of the ledger and settlement.';
comment on column public.payment.provider_fee_cents is
  'The provider''s own fee on this payment, as the provider reported it.';

alter table public.merchant
  add column if not exists accepts_test_payments boolean not null default false;

comment on column public.merchant.accepts_test_payments is
  'A test or review shop: its orders may be paid with Paystack test keys. Off for every real shop.';

-- ────────────────────────────────────────────────────── one try at Paystack

create table public.paystack_attempt (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payment (id) on delete cascade,
  reference text not null unique check (reference ~ '^[A-Za-z0-9.=-]{8,100}$'),
  channel text not null check (channel in ('card', 'mpesa', 'airtel')),
  is_test boolean not null,
  phone text check (phone is null or phone ~ '^\+254[0-9]{9}$'),
  authorization_url text check (authorization_url is null or authorization_url ~ '^https://'),
  access_code text,
  opened_at timestamptz,
  outcome text check (outcome in ('paid', 'failed')),
  failure_reason text,
  checked_at timestamptz,
  check_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);

comment on table public.paystack_attempt is
  'One try at paying a payment through Paystack, under its own Paystack reference. Read and written only through the payment functions.';

create index paystack_attempt_payment_idx on public.paystack_attempt (payment_id, created_at desc);
create index paystack_attempt_open_idx on public.paystack_attempt (opened_at)
  where outcome is null and opened_at is not null;

alter table public.paystack_attempt enable row level security;
revoke all on public.paystack_attempt from public, anon, authenticated;

-- ─────────────────────────────────────── proof the web app holds the key

-- 'test' or 'live' when p_secret is that Paystack secret key, otherwise null.
create function authz.paystack_mode(p_secret text)
returns text
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  v_test text;
  v_live text;
begin
  if p_secret is null or octet_length(p_secret) > 4096 then
    return null;
  end if;
  select nullif(trim(decrypted_secret), '') into v_test
    from vault.decrypted_secrets where name = 'paystack_test_secret_key';
  select nullif(trim(decrypted_secret), '') into v_live
    from vault.decrypted_secrets where name = 'paystack_live_secret_key';

  if v_test is not null and authz.payment_proof_equal(extensions.digest(p_secret, 'sha256'),
                                                      extensions.digest(v_test, 'sha256')) then
    return 'test';
  end if;
  if v_live is not null and authz.payment_proof_equal(extensions.digest(p_secret, 'sha256'),
                                                      extensions.digest(v_live, 'sha256')) then
    return 'live';
  end if;
  return null;
end;
$$;

-- 'test' or 'live' when p_signature is Paystack's x-paystack-signature for
-- p_raw_body under that mode's secret key (HMAC-SHA512, hex), otherwise null.
create function authz.paystack_signature_mode(p_raw_body text, p_signature text)
returns text
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  v_name text;
  v_secret text;
begin
  if p_raw_body is null or octet_length(p_raw_body) > 1048576
     or p_signature is null or p_signature !~ '^[0-9a-f]{128}$' then
    return null;
  end if;
  foreach v_name in array array['paystack_test_secret_key', 'paystack_live_secret_key'] loop
    select nullif(trim(decrypted_secret), '') into v_secret
      from vault.decrypted_secrets where name = v_name;
    if v_secret is not null and authz.payment_proof_equal(decode(p_signature, 'hex'),
         extensions.hmac(convert_to(p_raw_body, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha512')) then
      return case when v_name = 'paystack_test_secret_key' then 'test' else 'live' end;
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function authz.paystack_mode(text) from public, anon, authenticated, service_role;
revoke execute on function authz.paystack_signature_mode(text, text)
  from public, anon, authenticated, service_role;

-- ─────────────────────────────────── the customer starts a try at Paystack

/*
 * Called by the web app's payment route, as the customer, with the secret
 * key as proof. Opens a new attempt, or hands back the one still in play:
 *   * a card page opened in the last 30 minutes is reused, so a retry never
 *     opens a second checkout;
 *   * a phone prompt sent in the last 3 minutes is not sent again; the
 *     answer says how long to wait.
 * Refuses a payment begun another way, and test keys for a real shop.
 */
create function public.rpc_payment_paystack_attempt(
  p_payment_reference text,
  p_channel text,
  p_phone text,
  p_proof text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  a public.paystack_attempt;
  v_uid uuid := (select auth.uid());
  v_mode text;
  v_test boolean;
  v_wait integer;
  v_n integer;
  v_ref text;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  v_mode := authz.paystack_mode(p_proof);
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  v_test := v_mode = 'test';

  if p_channel is null or p_channel not in ('card', 'mpesa', 'airtel') then
    raise exception 'Choose card, M-Pesa or Airtel Money.' using errcode = '22023';
  end if;
  if p_channel = 'card' and p_phone is not null then
    raise exception 'A card payment takes no phone number.' using errcode = '22023';
  end if;
  if p_channel <> 'card' and (p_phone is null or p_phone !~ '^\+254[17][0-9]{8}$') then
    raise exception 'Enter a Kenyan mobile number like 0712 345 678.' using errcode = '22023';
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

  -- A prompt sent in the last minute, to any number: wait, so a double tap
  -- never sends two prompts.
  select * into a from public.paystack_attempt
   where payment_id = p.id and outcome is null and channel <> 'card'
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

  if p_channel = 'card' then
    select * into a from public.paystack_attempt
     where payment_id = p.id and outcome is null and channel = 'card'
       and authorization_url is not null and opened_at > now() - interval '30 minutes'
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

  insert into public.paystack_attempt (payment_id, reference, channel, is_test, phone, created_by)
  values (p.id, v_ref, p_channel, v_test, case when p_channel = 'card' then null else p_phone end, v_uid);

  update public.payment
     set provider = 'paystack', is_test = v_test, updated_at = now()
   where id = p.id;

  return jsonb_build_object(
    'ok', true, 'reused', false, 'attempt_reference', v_ref, 'channel', p_channel,
    'amount_cents', p.amount_cents, 'currency', p.currency, 'is_test', v_test);
end;
$$;

revoke execute on function public.rpc_payment_paystack_attempt(text, text, text, text) from public, anon;
grant execute on function public.rpc_payment_paystack_attempt(text, text, text, text) to authenticated;

-- ───────────────────────────── Paystack accepted (or refused) the attempt

/*
 * After the web app asked Paystack: the checkout page it opened (card) or
 * that the prompt went out (M-Pesa, Airtel). p_failure records Paystack
 * refusing to start, which leaves the payment open for another try.
 */
create function public.rpc_payment_paystack_opened(
  p_attempt_reference text,
  p_access_code text,
  p_authorization_url text,
  p_failure text,
  p_proof text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.paystack_attempt;
  p public.payment;
  v_uid uuid := (select auth.uid());
  v_staff_id uuid := authz.staff_id();
  v_mode text;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  v_mode := authz.paystack_mode(p_proof);
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;

  select * into a from public.paystack_attempt where reference = p_attempt_reference for update;
  if not found or a.opened_at is not null or a.outcome is not null then
    raise exception 'No Paystack attempt waiting on that reference.';
  end if;
  if a.is_test <> (v_mode = 'test') then
    raise exception 'That attempt was started in the other Paystack mode.' using errcode = '22023';
  end if;
  select * into p from public.payment where id = a.payment_id for update;
  if not (a.created_by is not distinct from v_uid or authz.reaches_module('orders')) then
    raise exception 'That payment is not yours.' using errcode = '42501';
  end if;

  if nullif(trim(p_failure), '') is not null then
    update public.paystack_attempt
       set outcome = 'failed', failure_reason = left(p_failure, 300), checked_at = now()
     where id = a.id;
    return jsonb_build_object('ok', true, 'outcome', 'failed');
  end if;

  if a.channel = 'card' and (p_authorization_url is null or p_authorization_url !~ '^https://'
                             or length(p_authorization_url) > 2048) then
    raise exception 'Paystack did not return a page to pay on.' using errcode = '22023';
  end if;

  update public.paystack_attempt
     set opened_at = now(),
         authorization_url = case when a.channel = 'card' then p_authorization_url end,
         access_code = left(nullif(trim(p_access_code), ''), 200)
   where id = a.id;

  if p.state = 'pending' then
    update public.payment
       set state = 'authorised', authorised_at = now(), updated_at = now()
     where id = p.id;
  end if;

  insert into public.payment_event
    (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
  values (p.id, 'paystack', 'paystack.opened', 'opened:' || a.reference, p.reference,
          jsonb_build_object('attempt', a.reference, 'channel', a.channel, 'test', a.is_test),
          true, true, case when a.channel = 'card' then 'checkout page opened' else 'prompt sent' end)
  on conflict (provider, dedupe_key) do nothing;

  perform audit.log(
    p_actor_type => case when v_staff_id is not null then 'staff'::public.actor_type else 'guest'::public.actor_type end,
    p_actor_id => coalesce(v_staff_id, p.guest_id, v_uid), p_module => 'orders',
    p_action => 'payment.paystack_started',
    p_target_type => 'payment', p_target_id => p.id, p_city_id => p.city_id,
    p_after => jsonb_build_object('attempt', a.reference, 'channel', a.channel, 'test', a.is_test));

  return jsonb_build_object('ok', true, 'outcome', 'opened');
end;
$$;

revoke execute on function public.rpc_payment_paystack_opened(text, text, text, text, text) from public, anon;
grant execute on function public.rpc_payment_paystack_opened(text, text, text, text, text) to authenticated;

-- ─────────────────────────────────── what Paystack says, applied once

/*
 * Shared by the webhook and the verify answer. p_data is Paystack's
 * transaction object. Only a success with the right currency and amount
 * pays; the shared worker checks the amount against what was asked.
 * Not callable by anyone: only the two verified wrappers below use it.
 */
create function public.fn_paystack_apply(
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
    -- Still waiting (ongoing, pending, abandoned): nothing to change.
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
    -- Paid twice: once on another attempt. The money is real and must reach
    -- a person, so keep the event and raise it for Finance.
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
    p_channel => coalesce(nullif(p_data->>'channel', ''), case when a.channel = 'card' then 'card' else 'mobile_money' end));

  if v_result->>'state' = 'paid' and a.phone is not null then
    update public.payment set payer_phone = coalesce(payer_phone, a.phone) where id = p.id;
  end if;
  return v_result;
end;
$$;

revoke execute on function public.fn_paystack_apply(text, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- ─────────────────────────────────────────────── Paystack's webhook

-- Paystack calls with no session. The route checks x-paystack-signature and
-- the database checks it again against the Vault secret keys; which key
-- signed says test or live.
create function public.rpc_payment_paystack_webhook(p_raw_body text, p_signature text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_payload jsonb;
  v_event text;
begin
  v_mode := authz.paystack_signature_mode(p_raw_body, p_signature);
  if v_mode is null then
    raise exception 'Payment callback verification failed.' using errcode = '42501';
  end if;

  begin
    v_payload := p_raw_body::jsonb;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'reason', 'unreadable');
  end;

  v_event := v_payload->>'event';
  if v_event is null or v_event not in ('charge.success', 'charge.failed')
     or jsonb_typeof(v_payload->'data') is distinct from 'object' then
    return jsonb_build_object('ok', true, 'ignored', true);
  end if;

  return public.fn_paystack_apply(v_mode, v_event, v_payload->'data', v_payload);
end;
$$;

revoke execute on function public.rpc_payment_paystack_webhook(text, text) from public;
grant execute on function public.rpc_payment_paystack_webhook(text, text) to anon, authenticated;

-- ─────────────────────────── the server asked Paystack what happened

/*
 * The answer to GET /transaction/verify/<attempt reference>, fetched by the
 * web app with the secret key (on "Check payment status", or by the payments
 * worker when a webhook is late). The answer is not signed, so the proof is
 * the secret key itself.
 */
create function public.rpc_payment_paystack_verified(
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
     set checked_at = now(), check_count = check_count + 1
   where reference = p_attempt_reference;

  return public.fn_paystack_apply(v_mode, null, v_body->'data', v_body);
end;
$$;

revoke execute on function public.rpc_payment_paystack_verified(text, text, text) from public;
grant execute on function public.rpc_payment_paystack_verified(text, text, text) to anon, authenticated;

-- Attempts the payments worker should ask Paystack about: opened over two
-- minutes ago, no outcome, not checked in the last five, under a day old.
create function public.rpc_payment_paystack_due(p_proof text)
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
     where a.outcome is null and a.opened_at is not null
       and a.opened_at < now() - interval '2 minutes'
       and a.created_at > now() - interval '24 hours'
       and (a.checked_at is null or a.checked_at < now() - interval '5 minutes')
       and p.state in ('pending', 'authorised')
     order by a.opened_at
     limit 20;
end;
$$;

revoke execute on function public.rpc_payment_paystack_due(text) from public;
grant execute on function public.rpc_payment_paystack_due(text) to anon, authenticated;

/*
 * Every two minutes: if any Paystack attempt is due a question, call the
 * payments worker (Vault payments_worker_url) with {"action":"paystack_sweep"}.
 * The call is signed with a Paystack secret key from Vault, HMAC-SHA256 of
 * "paystack-sweep:<unix minute>", so the key itself never travels and no new
 * secret is needed. Said, not raised, when something is missing.
 */
create function public.cron_paystack_sweep()
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

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; the Paystack sweep is not scheduled.';
    return;
  end if;
  perform cron.schedule('paystack-sweep', '*/2 * * * *',
    $sched$select public.cron_paystack_sweep()$sched$);
end
$cron$;

insert into public.wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_payment_paystack_webhook', 'Paystack calls in with no application session.',
   'The database checks the HMAC-SHA512 of the raw body against the Vault Paystack secret keys, then the attempt, mode, currency and amount before any payment changes.'),
  ('rpc_payment_paystack_verified', 'The payments worker asks Paystack about late payments with no session.',
   'Refused unless p_proof is a Paystack secret key held in Vault; the answer must name the attempt, and the amount and currency are checked before any payment changes.'),
  ('rpc_payment_paystack_due', 'The payments worker lists late Paystack attempts with no session.',
   'Refused unless p_proof is a Paystack secret key held in Vault. Returns attempt references only.')
on conflict (function_name) do update set reason = excluded.reason, guarded_by = excluded.guarded_by;

-- ───────────────────────────────── what the customer's screen shows

/*
 * The order's payment as the app and the website show it: unpaid, pending
 * (a page or prompt in play), failed (the last try failed) or paid. Checked
 * by hand, like rpc_payment_begin_order: the order's guest, the merchant's
 * people, or staff.
 */
create function public.rpc_order_payment_state(p_order_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  o public.order;
  p public.payment;
  a public.paystack_attempt;
  v_uid uuid := (select auth.uid());
  v_wait integer;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;
  if not (
    exists (select 1 from public.guest g where g.id = o.guest_id and g.user_id = v_uid)
    or authz.is_merchant_member(o.merchant_id)
    or authz.works_merchant(o.merchant_id)
    or authz.reaches_module('orders')
  ) then
    raise exception 'That order is not yours.' using errcode = '42501';
  end if;

  if o.payment_status in ('paid', 'collected') then
    select * into p from public.payment
     where order_id = o.id and state = 'paid' order by paid_at desc nulls last limit 1;
    return jsonb_build_object('status', 'paid', 'reference', p.reference,
      'channel', p.channel, 'is_test', coalesce(p.is_test, false), 'paid_at', p.paid_at);
  end if;

  select * into p from public.payment where order_id = o.id order by created_at desc limit 1;
  if p.id is null then
    return jsonb_build_object('status', 'unpaid');
  end if;

  select * into a from public.paystack_attempt where payment_id = p.id order by created_at desc limit 1;

  if p.state in ('pending', 'authorised') and (p.expires_at is null or p.expires_at > now()) then
    if a.id is not null and a.outcome is null and a.opened_at is not null
       and a.opened_at > now() - interval '30 minutes' then
      if a.channel <> 'card' then
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
      return jsonb_build_object('status', 'failed', 'reference', p.reference,
        'channel', a.channel, 'is_test', p.is_test);
    end if;
    return jsonb_build_object('status', 'unpaid', 'reference', p.reference);
  end if;

  if p.state = 'failed' then
    return jsonb_build_object('status', 'failed', 'reference', p.reference);
  end if;
  return jsonb_build_object('status', 'unpaid');
end;
$$;

revoke execute on function public.rpc_order_payment_state(uuid) from public, anon;
grant execute on function public.rpc_order_payment_state(uuid) to authenticated;

-- ───────────────────────────────────────────────────────── the ledger

-- Money paid through Paystack is held at Paystack until it settles to the
-- bank (2 working days in Kenya), whatever the channel: the processor's
-- receivable, not the M-Pesa paybill.
create or replace function ledger.fn_payment_cash_account(p public.payment)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p.provider = 'paystack' then 'cash.card_processor_receivable'
              when p.channel = 'bank' or p.provider like 'bank\_%' then 'cash.bank'
              else 'cash.mpesa_paybill' end
$$;

-- As 20260101015500, plus: an order paid with test keys posts nothing (no
-- money moved), and an order paid through Paystack posts to the processor's
-- receivable whatever method it was placed with.
create or replace function public.tg_order_posts_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payment;
begin
  if new.payment_status in ('paid', 'collected')
     and (old is null or old.payment_status is distinct from new.payment_status) then
    select * into v_pay from public.payment
     where order_id = new.id and state = 'paid' order by paid_at desc nulls last limit 1;
    if v_pay.is_test then
      return new;
    end if;

    perform ledger.fn_post_sale(
      new.id,
      case when new.payment_method = 'cash_on_delivery'
             then ledger.fn_account('cash.rider_on_hand', 'rider', new.rider_id)
           when v_pay.provider = 'paystack'
             then ledger.fn_payment_cash_account(v_pay) end);
  end if;

  return new;
end;
$$;
