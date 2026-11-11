-- Paystack is gone.
--
-- NexG takes M-Pesa (Safaricom Daraja), pay by bank (the NexG Sandbox Bank so
-- far) and cash on delivery. There is no card provider, and NexG will not
-- connect to Paystack, so what was built for it goes:
--
--   * rpc_payment_paystack_webhook, the anonymous entry point for Paystack
--     events, and its wiring_anon_allow row.
--   * The Paystack webhook in Settings → API & Webhooks (rpc_api_overview).
--   * 'paystack' as the default provider of payment and payment_event. A
--     payment opened before any method has started reads 'unassigned', and the
--     shared worker (rpc_payment_webhook) now files each event under its
--     payment's own provider. Until now every M-Pesa event that went through
--     the worker was filed as 'paystack'.
--   * The step in rpc_payment_bank_webhook that moved the worker's events off
--     that default. The worker files them under the bank already.
--   * The 'payments' integration row, which named Paystack and its keys. It
--     now names Safaricom Daraja and the keys M-Pesa needs.
--   * Rows labelled 'paystack' only because of that default are relabelled:
--     payments that never reached a provider read 'unassigned', and their
--     events read their payment's provider. A payment Paystack really carried
--     (one with a provider reference) would keep its label; there are none.
--
-- The order_payment_method value 'card' stays: an enum value cannot be
-- dropped, and nothing offers it any more.
--
-- Rollback: re-run rpc_payment_paystack_webhook and its grant from
-- 20261112000300, rpc_api_overview from 20261202000100, rpc_payment_webhook
-- from 20260101014800 and rpc_payment_bank_webhook from 20261130000100, then
-- set both column defaults back to 'paystack'.

-- ─────────────────────────────────────────── the Paystack entry point

drop function if exists public.rpc_payment_paystack_webhook(text, text);

delete from public.wiring_anon_allow where function_name = 'rpc_payment_paystack_webhook';

-- ─────────────────────────────────────────── no provider until one starts

alter table public.payment alter column provider set default 'unassigned';
alter table public.payment_event alter column provider set default 'unassigned';

update public.payment
   set provider = 'unassigned', updated_at = now()
 where provider = 'paystack'
   and provider_ref is null
   and authorization_url is null;

update public.payment_event e
   set provider = coalesce(p.provider, 'unassigned')
  from public.payment p
 where e.payment_id = p.id
   and e.provider = 'paystack'
   and p.provider is distinct from 'paystack'
   and not exists (
     select 1 from public.payment_event x
      where x.provider = coalesce(p.provider, 'unassigned') and x.dedupe_key = e.dedupe_key);

update public.payment_event e
   set provider = 'unassigned'
 where e.payment_id is null
   and e.provider = 'paystack'
   and not exists (
     select 1 from public.payment_event x
      where x.provider = 'unassigned' and x.dedupe_key = e.dedupe_key);

-- ─────────────────────────────────────────── the shared worker

/*
 * Everything after the reference has a default, because a failed
 * charge carries no channel and a declined one carries no amount
 * — a caller forced to pass nulls for those is a caller who will
 * eventually pass the wrong one.
 *
 * Unchanged from 20260101014800 except that each event is filed under
 * its payment's provider rather than the column default.
 */
create or replace function public.rpc_payment_webhook(
  p_event text,
  p_reference text,
  p_dedupe_key text,
  p_signature_ok boolean,
  p_payload jsonb,
  p_paid boolean default false,
  p_provider_ref text default null,
  p_amount_cents bigint default null,
  p_channel text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  v_event uuid;
  v_already boolean := false;
begin
  select * into p from public.payment where reference = p_reference;

  /* Store first, decide second. Even an event we will refuse is
     worth keeping — a run of bad signatures is somebody probing.
     Each event is filed under its payment's provider. */
  insert into public.payment_event
    (payment_id, provider, event, dedupe_key, reference, payload, signature_ok)
  values (p.id, coalesce(p.provider, 'unassigned'), p_event, p_dedupe_key, p_reference,
          p_payload, p_signature_ok)
  on conflict (provider, dedupe_key) do nothing
  returning id into v_event;

  if v_event is null then
    return jsonb_build_object('ok', true, 'duplicate', true,
      'message', 'Already had that one.');
  end if;

  if not p_signature_ok then
    update public.payment_event set handled_note = 'signature did not verify'
     where id = v_event;
    return jsonb_build_object('ok', false, 'reason', 'bad_signature');
  end if;

  if p.id is null then
    update public.payment_event set handled_note = 'no payment with that reference'
     where id = v_event;
    return jsonb_build_object('ok', false, 'reason', 'unknown_reference');
  end if;

  if p.state = 'paid' then
    update public.payment_event set handled = true,
           handled_note = 'already paid; nothing to do'
     where id = v_event;
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  /*
   * The amount is checked, not trusted. A provider event claiming
   * a different figure from the one we asked for is the single
   * most expensive thing to wave through.
   */
  if p_paid and p_amount_cents is not null and p_amount_cents <> p.amount_cents then
    update public.payment set state = 'failed',
           failure_reason = 'the provider settled a different amount from the one we asked for',
           updated_at = now()
     where id = p.id;
    update public.payment_event set handled = true,
           handled_note = 'amount mismatch: asked ' || p.amount_cents
                          || ', settled ' || p_amount_cents
     where id = v_event;

    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.amount_mismatch',
      p_actor_label => '[System] · payments',
      p_target_type => 'order', p_target_id => p.order_id,
      p_city_id => p.city_id, p_severity => 'high',
      p_reason => 'Settled amount did not match the amount requested.',
      p_after => jsonb_build_object('asked_cents', p.amount_cents,
                                    'settled_cents', p_amount_cents,
                                    'reference', p_reference));

    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;

  if p_paid then
    update public.payment
       set state = 'paid', paid_at = now(), provider_ref = coalesce(p_provider_ref, provider_ref),
           channel = coalesce(p_channel, channel), updated_at = now()
     where id = p.id;

    if p.intent = 'order' then
      update public.order
         set payment_status = 'paid'
       where id = p.order_id and payment_status <> 'paid';

      insert into public.order_event
        (order_id, kind, title, detail, actor_type, actor_label, payload)
      values (p.order_id, 'paid', 'Paid',
              coalesce(p_channel, 'online') || ' · ' || p_reference,
              'system', '[System] · payments',
              jsonb_build_object('amount_cents', p.amount_cents, 'reference', p_reference));
    elsif p.intent = 'featured_slot' then
      update public.featured_booking
         set status = 'booked', confirmed_at = now()
       where id = p.booking_id and status in ('quoted', 'booked');

      insert into public.merchant_message
        (merchant_id, direction, channel, subject, body)
      values (p.merchant_id, 'out', 'in_app', 'Featured slot paid',
              'Payment received. Your slot is booked and goes live on its Monday.');
    end if;

    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.settled',
      p_actor_label => '[System] · payments',
      p_target_type => case when p.intent = 'order' then 'order' else 'merchant' end,
      p_target_id => coalesce(p.order_id, p.merchant_id),
      p_city_id => p.city_id, p_severity => 'notice',
      p_after => jsonb_build_object('amount_cents', p.amount_cents, 'currency', p.currency,
                                    'reference', p_reference, 'channel', p_channel));
  else
    update public.payment
       set state = 'failed', failure_reason = coalesce(p_payload ->> 'gateway_response', p_event),
           updated_at = now()
     where id = p.id;
  end if;

  update public.payment_event set handled = true where id = v_event;
  return jsonb_build_object('ok', true, 'state', case when p_paid then 'paid' else 'failed' end);
end;
$$;

-- ─────────────────────────────────────────── the bank's events

-- A signed event from the bank: a webhook, or a status the web app fetched
-- from the bank (the bank signs those the same way). Header format:
--   t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
-- Unchanged from 20261130000100 except that the worker now files the event
-- under the bank itself, so nothing has to move it afterwards.
create or replace function public.rpc_payment_bank_webhook(
  p_provider text,
  p_raw_body text,
  p_signature_header text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_parts text[];
  v_payload jsonb;
  v_data jsonb;
  v_event_id text;
  v_reference text;
  v_collection text;
  v_status text;
  v_amount bigint;
  v_paid boolean;
  p public.payment;
  v_result jsonb;
begin
  if p_provider is null or p_provider !~ '^bank_[a-z0-9_]{2,30}$'
     or p_raw_body is null or octet_length(p_raw_body) > 1048576
     or p_signature_header is null then
    raise exception 'Bank verification failed.' using errcode = '42501';
  end if;

  v_parts := regexp_match(p_signature_header, '^t=([0-9]{9,12}),v1=([0-9a-f]{64})$');
  if v_parts is null then
    raise exception 'Bank verification failed.' using errcode = '42501';
  end if;

  select nullif(trim(decrypted_secret), '') into v_secret
    from vault.decrypted_secrets where name = 'bank_webhook_secret';

  if v_secret is null or not authz.payment_proof_equal(
       decode(v_parts[2], 'hex'),
       extensions.hmac(convert_to(v_parts[1] || '.' || p_raw_body, 'UTF8'),
                       convert_to(v_secret, 'UTF8'), 'sha256')) then
    raise exception 'Bank verification failed.' using errcode = '42501';
  end if;
  if abs(extract(epoch from now())::bigint - v_parts[1]::bigint) > 300 then
    raise exception 'Bank event is too old.' using errcode = '42501';
  end if;

  begin
    v_payload := p_raw_body::jsonb;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'reason', 'unreadable');
  end;

  v_data := v_payload->'data';
  v_event_id := nullif(v_payload->>'id', '');
  v_reference := nullif(v_data->>'merchant_reference', '');
  v_collection := nullif(v_data->>'id', '');
  v_status := v_data->>'status';
  if v_event_id is null or v_reference is null or v_collection is null then
    return jsonb_build_object('ok', false, 'reason', 'incomplete_event');
  end if;
  if v_status is null or v_status not in ('succeeded', 'failed', 'expired', 'cancelled') then
    return jsonb_build_object('ok', true, 'ignored', true, 'status', v_status);
  end if;

  select * into p from public.payment
   where reference = v_reference and provider = p_provider for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_reference');
  end if;

  -- Banks retry, and NexG also fetches the latest event itself: one event,
  -- once. Checked under the payment's row lock, so two copies arriving
  -- together are handled one after the other.
  if exists (select 1 from public.payment_event
              where provider = p_provider and dedupe_key = 'bank:' || v_event_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if p.provider_ref is distinct from v_collection then
    -- An older collection for this payment was replaced (the guest started
    -- again). If the bank says money moved on it anyway, that money is real
    -- and must reach a person: keep the event and raise it for finance.
    if v_status = 'succeeded' then
      insert into public.payment_event
        (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
      values (p.id, p_provider, 'bank.collection.succeeded', 'bank:' || v_event_id, v_reference,
              v_payload, true, false,
              'paid against replaced collection ' || v_collection || '; refund or apply by hand')
      on conflict (provider, dedupe_key) do nothing;
      perform audit.log(
        p_actor_type => 'system'::public.actor_type, p_module => 'orders',
        p_action => 'payment.bank_unmatched', p_actor_label => '[System] · payments',
        p_target_type => 'payment', p_target_id => p.id, p_city_id => p.city_id,
        p_severity => 'high',
        p_reason => 'The bank collected money on a collection this payment no longer uses.',
        p_after => jsonb_build_object('reference', v_reference, 'collection_id', v_collection,
                                      'amount_cents', v_data->'amount'));
    end if;
    return jsonb_build_object('ok', false, 'reason', 'collection_mismatch');
  end if;

  v_paid := v_status = 'succeeded';
  if v_paid then
    if coalesce(v_data->>'currency', '') <> p.currency then
      return jsonb_build_object('ok', false, 'reason', 'currency_mismatch');
    end if;
    if jsonb_typeof(v_data->'amount') is distinct from 'number'
       or v_data->>'amount' !~ '^[1-9][0-9]{0,17}$' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
    end if;
    v_amount := (v_data->>'amount')::bigint;
  end if;

  v_result := public.rpc_payment_webhook(
    p_event => 'bank.collection.' || v_status,
    p_reference => v_reference,
    p_dedupe_key => 'bank:' || v_event_id,
    p_signature_ok => true,
    p_payload => v_payload || jsonb_build_object(
      'gateway_response', coalesce(nullif(v_data->>'failure_reason', ''), 'bank collection ' || v_status)),
    p_paid => v_paid,
    p_provider_ref => v_collection,
    p_amount_cents => v_amount,
    p_channel => 'bank');

  if v_result->>'state' = 'paid' then
    update public.payment
       set provider_receipt = coalesce(nullif(v_data->>'bank_reference', ''), provider_receipt)
     where id = p.id;
  end if;
  return v_result;
end;
$$;

-- ─────────────────────────────────────────── Settings → API & Webhooks

create or replace function public.rpc_api_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - interval '30 days';
begin
  if not (authz.is_super_admin() or authz.reaches_module('settings')) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'webhooks', jsonb_build_array(
      (select jsonb_build_object('key', 'mpesa',
         'secret_set', exists (select 1 from vault.secrets where name = 'daraja_callback_secret'),
         'last_event_at', max(e.received_at),
         'events_30d', count(*) filter (where e.received_at > v_since),
         'unhandled_30d', count(*) filter (where e.received_at > v_since and not e.handled),
         'prompts_30d', (select count(*) from public.payment_prompt pr where pr.sent_at > v_since),
         'answered_30d', (select count(*) from public.payment_prompt pr
                           where pr.sent_at > v_since and pr.resolved_at is not null))
       from public.payment_event e
      where e.event like 'mpesa.stk.%'),
      (select jsonb_build_object('key', 'bank',
         'secret_set', exists (select 1 from vault.secrets where name = 'bank_webhook_secret'),
         'last_event_at', max(e.received_at),
         'events_30d', count(*) filter (where e.received_at > v_since),
         'unhandled_30d', count(*) filter (where e.received_at > v_since and not e.handled))
       from public.payment_event e
      where e.event like 'bank.collection.%')),
    'api_keys', (select jsonb_build_object(
         'active', count(*) filter (where k.state = 'active'),
         'merchant', count(*) filter (where k.state = 'active' and k.merchant_id is not null),
         'platform', count(*) filter (where k.state = 'active' and k.merchant_id is null))
       from public.api_key k));
end;
$$;

-- ─────────────────────────────────────────── the integration registry

update public.integration
   set label = 'M-Pesa payments',
       provider = 'Safaricom Daraja',
       requires_env = array['DARAJA_CONSUMER_KEY', 'DARAJA_CONSUMER_SECRET', 'DARAJA_SHORTCODE',
                            'DARAJA_PASSKEY', 'DARAJA_CALLBACK_SECRET'],
       blocks = array['guest_checkout', 'featured_billing'],
       notes = 'M-Pesa STK push through Safaricom Daraja. Until its keys are set, checkout cannot send an M-Pesa prompt and a featured slot is quoted but not billed. Refunds go back by hand, by M-Pesa or bank transfer, and are recorded in the console.'
 where key = 'payments';
