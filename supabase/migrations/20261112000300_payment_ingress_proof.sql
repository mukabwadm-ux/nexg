-- Provider requests reach PostgREST as anon. Verify their proof inside the
-- database before allowing them to reach the payment settlement worker.
insert into audit.action_registry (action, module, default_severity, money, description) values
  ('payment.mpesa_prompt_sent', 'orders', 'info', true, 'M-Pesa payment prompt sent'),
  ('payment.mpesa_result_recorded', 'orders', 'notice', true, 'M-Pesa payment result recorded'),
  ('payment.mpesa_unmatched_callback', 'orders', 'notice', true, 'M-Pesa callback has no matching payment')
on conflict (action) do nothing;

create function authz.payment_proof_equal(p_actual bytea, p_expected bytea)
returns boolean
language plpgsql
immutable strict
set search_path = ''
as $$
declare
  v_diff integer := 0;
begin
  if octet_length(p_actual) <> octet_length(p_expected) then return false; end if;
  for v_index in 0 .. octet_length(p_actual) - 1 loop
    v_diff := v_diff | (get_byte(p_actual, v_index) # get_byte(p_expected, v_index));
  end loop;
  return v_diff = 0;
end;
$$;

create function authz.require_daraja_callback_secret(p_callback_secret text)
returns void
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  v_expected text;
begin
  select nullif(trim(decrypted_secret), '') into v_expected
    from vault.decrypted_secrets where name = 'daraja_callback_secret';

  if v_expected is null or p_callback_secret is null or octet_length(p_callback_secret) > 4096
     or not authz.payment_proof_equal(extensions.digest(p_callback_secret, 'sha256'),
                                      extensions.digest(v_expected, 'sha256')) then
    raise exception 'Payment callback verification failed.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function authz.payment_proof_equal(bytea, bytea),
  authz.require_daraja_callback_secret(text) from public, anon, authenticated, service_role;

-- The authenticated start route checks this before sending a provider prompt.
create function public.rpc_payment_mpesa_ready(p_callback_secret text)
returns boolean
language plpgsql
stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return false; end if;
  perform authz.require_daraja_callback_secret(p_callback_secret);
  return true;
exception when insufficient_privilege then
  return false;
end;
$$;

-- The existing common worker receives trusted state from the verified wrappers.
-- In particular, a caller cannot assert p_signature_ok itself via PostgREST.
revoke execute on function public.rpc_payment_webhook(text, text, text, boolean, jsonb, boolean, text, bigint, text)
  from public, anon, authenticated, service_role;

create function public.rpc_payment_paystack_webhook(p_raw_body text, p_signature text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_payload jsonb;
  v_event text;
  v_reference text;
  v_amount bigint;
  v_paid boolean;
begin
  if p_raw_body is null or octet_length(p_raw_body) > 1048576
     or p_signature is null or p_signature !~ '^[0-9a-f]{128}$' then
    raise exception 'Payment callback verification failed.' using errcode = '42501';
  end if;

  select nullif(trim(decrypted_secret), '') into v_secret
    from vault.decrypted_secrets where name = 'paystack_secret_key';

  if v_secret is null or not authz.payment_proof_equal(decode(p_signature, 'hex'),
       extensions.hmac(convert_to(p_raw_body, 'UTF8'), convert_to(v_secret, 'UTF8'), 'sha512')) then
    raise exception 'Payment callback verification failed.' using errcode = '42501';
  end if;

  begin
    v_payload := p_raw_body::jsonb;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'reason', 'unreadable');
  end;

  v_event := v_payload->>'event';
  v_reference := nullif(v_payload#>>'{data,reference}', '');
  if v_reference is null then return jsonb_build_object('ok', false, 'reason', 'no_reference'); end if;
  if v_event is null or v_event not in ('charge.success', 'charge.failed') then
    return jsonb_build_object('ok', true, 'ignored', true);
  end if;

  v_paid := v_event = 'charge.success';
  if v_paid then
    if v_payload#>>'{data,status}' is distinct from 'success' then
      return jsonb_build_object('ok', false, 'reason', 'unexpected_payment_status');
    end if;
    if jsonb_typeof(v_payload#>'{data,amount}') is distinct from 'number'
       or v_payload#>>'{data,amount}' !~ '^[1-9][0-9]{0,17}$' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
    end if;
    v_amount := (v_payload#>>'{data,amount}')::bigint;
  end if;

  perform 1 from public.payment where reference = v_reference and provider = 'paystack' for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_reference'); end if;

  return public.rpc_payment_webhook(
    p_event => v_event,
    p_reference => v_reference,
    p_dedupe_key => encode(extensions.digest(convert_to(p_raw_body, 'UTF8'), 'sha256'), 'hex'),
    p_signature_ok => true,
    p_payload => v_payload,
    p_paid => v_paid,
    p_provider_ref => nullif(v_payload#>>'{data,id}', ''),
    p_amount_cents => v_amount,
    p_channel => v_payload#>>'{data,channel}');
end;
$$;

drop function public.rpc_payment_mpesa_sent(text, text, text, text);

create function public.rpc_payment_mpesa_sent(
  p_reference text,
  p_checkout_request_id text,
  p_merchant_request_id text,
  p_phone text,
  p_callback_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  v_uid uuid := (select auth.uid());
  v_staff_id uuid := authz.staff_id();
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  perform authz.require_daraja_callback_secret(p_callback_secret);

  select * into p from public.payment where reference = p_reference for update;
  if not found or p.state not in ('pending', 'authorised') then
    raise exception 'No payment waiting on that reference.';
  end if;

  if not (p.created_by is not distinct from v_uid or authz.reaches_module('orders')) then
    raise exception 'That payment is not yours.' using errcode = '42501';
  end if;
  if nullif(trim(p_checkout_request_id), '') is null then
    raise exception 'No provider checkout request was sent.' using errcode = '22023';
  end if;

  update public.payment
     set provider = 'mpesa', provider_ref = p_checkout_request_id, channel = 'mpesa',
         payer_phone = p_phone, authorization_url = null, state = 'authorised',
         authorised_at = now(), updated_at = now()
   where id = p.id;

  insert into public.payment_event
    (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
  values (p.id, 'mpesa', 'stk.sent', 'sent:' || p_checkout_request_id, p_reference,
          jsonb_build_object('checkout_request_id', p_checkout_request_id,
                             'merchant_request_id', p_merchant_request_id),
          true, true, 'prompt sent to customer')
  on conflict (provider, dedupe_key) do nothing;

  perform audit.log(
    p_actor_type => case when v_staff_id is not null then 'staff'::public.actor_type else 'guest'::public.actor_type end,
    p_actor_id => coalesce(v_staff_id, p.guest_id, v_uid), p_module => 'orders', p_action => 'payment.mpesa_prompt_sent',
    p_target_type => 'payment', p_target_id => p.id, p_city_id => p.city_id,
    p_after => jsonb_build_object('provider', 'mpesa', 'state', 'authorised'));

  return jsonb_build_object('ok', true);
end;
$$;

drop function public.rpc_payment_mpesa_callback(text, integer, text, boolean, jsonb, numeric, text, text);

create function public.rpc_payment_mpesa_callback(
  p_checkout_request_id text,
  p_result_code integer,
  p_result_desc text,
  p_callback_secret text,
  p_payload jsonb,
  p_amount_kes numeric default null,
  p_receipt text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  v_paid boolean := p_result_code = 0;
  v_result jsonb;
  v_amount_cents bigint;
  v_event_id uuid;
begin
  perform authz.require_daraja_callback_secret(p_callback_secret);
  if nullif(trim(p_checkout_request_id), '') is null or p_result_code is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_checkout_result');
  end if;

  select * into p from public.payment
   where provider = 'mpesa' and provider_ref = p_checkout_request_id for update;

  if p.id is null then
    insert into public.payment_event
      (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
    values (null, 'mpesa', 'stk.callback', 'cb:' || p_checkout_request_id, null,
            p_payload, true, false, 'no payment with that CheckoutRequestID')
    on conflict (provider, dedupe_key) do nothing returning id into v_event_id;
    if v_event_id is not null then
      perform audit.log(p_actor_type => 'system'::public.actor_type, p_module => 'orders',
        p_action => 'payment.mpesa_unmatched_callback', p_target_type => 'payment_event',
        p_target_id => v_event_id, p_after => jsonb_build_object('provider', 'mpesa'));
    end if;
    return jsonb_build_object('ok', false, 'reason', 'unknown_checkout_request');
  end if;

  -- Daraja was asked for a whole-shilling amount rounded up from the order.
  -- A success callback without a valid amount must never settle the payment.
  if v_paid then
    if p_amount_kes is null or p_amount_kes <= 0 or p_amount_kes > 92233720368547758
       or trunc(p_amount_kes) <> p_amount_kes then
      return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
    end if;
    v_amount_cents := case when p_amount_kes = ceil(p.amount_cents / 100.0)
      then p.amount_cents else (p_amount_kes * 100)::bigint end;
  end if;

  v_result := public.rpc_payment_webhook(
    p_event => 'mpesa.stk.callback',
    p_reference => p.reference,
    p_dedupe_key => 'cb:' || p_checkout_request_id || ':true',
    p_signature_ok => true,
    p_payload => p_payload || jsonb_build_object('gateway_response', p_result_desc),
    p_paid => v_paid,
    p_amount_cents => v_amount_cents,
    p_channel => 'mpesa');

  if v_result->>'state' = 'paid' then
    update public.payment
       set provider_receipt = coalesce(p_receipt, provider_receipt),
           payer_phone = coalesce(p_phone, payer_phone)
     where id = p.id;
  end if;
  if v_result->>'state' in ('paid', 'failed') then
    perform audit.log(p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.mpesa_result_recorded', p_target_type => 'payment',
      p_target_id => p.id, p_city_id => p.city_id,
      p_after => jsonb_build_object('provider', 'mpesa', 'state', v_result->>'state'));
  end if;
  return v_result;
end;
$$;

revoke execute on function public.rpc_payment_mpesa_ready(text),
  public.rpc_payment_mpesa_sent(text, text, text, text, text),
  public.rpc_payment_mpesa_callback(text, integer, text, text, jsonb, numeric, text, text),
  public.rpc_payment_paystack_webhook(text, text) from public, anon, authenticated, service_role;
grant execute on function public.rpc_payment_mpesa_ready(text),
  public.rpc_payment_mpesa_sent(text, text, text, text, text) to authenticated;
grant execute on function public.rpc_payment_mpesa_callback(text, integer, text, text, jsonb, numeric, text, text),
  public.rpc_payment_paystack_webhook(text, text) to anon;

delete from public.wiring_anon_allow where function_name = 'rpc_payment_webhook';
insert into public.wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_payment_mpesa_callback', 'Daraja has no application session.',
   'authz.require_daraja_callback_secret verifies the private Vault token before any write.'),
  ('rpc_payment_paystack_webhook', 'Paystack has no application session.',
   'The database validates the raw-body HMAC with its Vault key and parses only the signed fields.')
on conflict (function_name) do update set reason = excluded.reason, guarded_by = excluded.guarded_by;
