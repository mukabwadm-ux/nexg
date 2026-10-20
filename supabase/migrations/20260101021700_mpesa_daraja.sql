-- M-Pesa (Safaricom Daraja) STK Push, layered on the existing payment tables.
--
-- The order is still marked paid by public.rpc_payment_webhook, which checks
-- the amount, writes the timeline and audits it. These functions only map
-- Daraja's vocabulary (CheckoutRequestID, ResultCode, receipt number) onto it.

alter table public.payment
  add column if not exists provider_receipt text,
  add column if not exists payer_phone text;

create index if not exists payment_provider_receipt_idx
  on public.payment (provider_receipt) where provider_receipt is not null;

-- ═══════════════════════════ the STK prompt was sent to the customer's phone

create or replace function public.rpc_payment_mpesa_sent(
  p_reference text,
  p_checkout_request_id text,
  p_merchant_request_id text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;

  select * into p from public.payment where reference = p_reference;
  if not found or p.state not in ('pending', 'authorised') then
    raise exception 'No payment waiting on that reference.';
  end if;

  /* Same ownership test the payment was begun with. */
  if not (
    p.created_by = v_uid
    or authz.reaches_module('orders')
  ) then
    raise exception 'That payment is not yours.' using errcode = '42501';
  end if;

  update public.payment
     set provider = 'mpesa',
         provider_ref = p_checkout_request_id,
         channel = 'mpesa',
         payer_phone = p_phone,
         authorization_url = null,
         state = 'authorised',
         authorised_at = now(),
         updated_at = now()
   where id = p.id;

  insert into public.payment_event
    (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
  values (p.id, 'mpesa', 'stk.sent', 'sent:' || p_checkout_request_id, p_reference,
          jsonb_build_object('checkout_request_id', p_checkout_request_id,
                             'merchant_request_id', p_merchant_request_id),
          true, true, 'prompt sent to customer')
  on conflict (provider, dedupe_key) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.rpc_payment_mpesa_sent(text, text, text, text) from public, anon;
grant execute on function public.rpc_payment_mpesa_sent(text, text, text, text) to authenticated;

-- ═══════════════════════════ Safaricom tells us what the customer did

/*
 * Daraja has no signature. The route therefore checks a secret carried in
 * the callback URL and says so here via p_secret_ok; this function also
 * only ever acts on a payment we sent an STK request for, found by the
 * CheckoutRequestID we stored, and rpc_payment_webhook still checks the
 * amount. Granted to anon because Safaricom arrives with no session.
 */
create or replace function public.rpc_payment_mpesa_callback(
  p_checkout_request_id text,
  p_result_code integer,
  p_result_desc text,
  p_secret_ok boolean,
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
begin
  select * into p from public.payment
   where provider = 'mpesa' and provider_ref = p_checkout_request_id;

  if p.id is null then
    insert into public.payment_event
      (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
    values (null, 'mpesa', 'stk.callback', 'cb:' || p_checkout_request_id, null,
            p_payload, p_secret_ok, false, 'no payment with that CheckoutRequestID')
    on conflict (provider, dedupe_key) do nothing;
    return jsonb_build_object('ok', false, 'reason', 'unknown_checkout_request');
  end if;

  /* Whole shillings were asked for, so compare against the amount rounded up. */
  if p_amount_kes is not null then
    v_amount_cents := case
      when p_amount_kes = ceil(p.amount_cents / 100.0) then p.amount_cents
      else round(p_amount_kes * 100)::bigint end;
  end if;

  v_result := public.rpc_payment_webhook(
    p_event => 'mpesa.stk.callback',
    p_reference => p.reference,
    p_dedupe_key => 'cb:' || p_checkout_request_id || ':' || p_secret_ok::text,
    p_signature_ok => p_secret_ok,
    p_payload => p_payload || jsonb_build_object('gateway_response', p_result_desc),
    p_paid => v_paid,
    p_provider_ref => null,
    p_amount_cents => v_amount_cents,
    p_channel => 'mpesa');

  if v_paid and p_secret_ok and coalesce((v_result ->> 'ok')::boolean, false) then
    update public.payment
       set provider_receipt = coalesce(p_receipt, provider_receipt),
           payer_phone = coalesce(p_phone, payer_phone)
     where id = p.id;

  end if;

  return v_result;
end;
$$;

revoke execute on function public.rpc_payment_mpesa_callback(
  text, integer, text, boolean, jsonb, numeric, text, text) from public;
grant execute on function public.rpc_payment_mpesa_callback(
  text, integer, text, boolean, jsonb, numeric, text, text) to anon, authenticated;
