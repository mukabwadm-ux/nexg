-- M-Pesa prompts: every prompt remembered, no double charge going unnoticed,
-- and no payment left waiting because a result never arrived.
--
-- Before this, a payment kept only its latest prompt (payment.provider_ref).
-- Sending the prompt again ("No prompt? Send it again", or a second press
-- after a dropped connection) overwrote it, so:
--   * paying the first prompt anyway landed as an unmatched callback, money
--     received but nothing marked paid;
--   * paying both took the money twice, with one of them unrecorded;
--   * the first prompt timing out marked the payment failed while the
--     second one was still on the guest's phone.
--
-- Now:
--   1. payment_prompt keeps every prompt sent for a payment.
--   2. A result from any of them settles the payment. A second success,
--      from a different prompt, is recorded as a double payment to refund
--      (payment_prompt.outcome = 'duplicate', audited at high severity).
--   3. A failed prompt fails the payment only when no other prompt for it
--      is still open, and a failed order payment goes on the order timeline.
--   4. rpc_payment_mpesa_prompt_wait stops a new prompt within a minute of
--      the last one, and after five open prompts.
--   5. rpc_payment_mpesa_open_prompts lists prompts with no result after
--      45 seconds, so the server can ask M-Pesa (STK Push Query) and record
--      the answer through the same callback function.

-- ═══════════════════════════════════════════════ every prompt sent

create table if not exists public.payment_prompt (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payment (id) on delete cascade,
  checkout_request_id text not null unique,
  merchant_request_id text,
  phone text,
  sent_at timestamptz not null default now(),
  last_queried_at timestamptz,
  result_code integer,
  result_desc text,
  receipt text,
  resolved_at timestamptz,
  resolved_via text check (resolved_via in ('callback', 'query')),
  outcome text check (outcome in ('paid', 'failed', 'duplicate', 'superseded')),
  constraint prompt_resolution_complete check (
    (resolved_at is null) = (outcome is null))
);

create index if not exists payment_prompt_by_payment on public.payment_prompt (payment_id, sent_at desc);
create index if not exists payment_prompt_open on public.payment_prompt (sent_at)
  where resolved_at is null;

comment on table public.payment_prompt is
  'Every M-Pesa prompt sent for a payment, and what came of it. outcome = duplicate is money received twice, to refund.';

alter table public.payment_prompt enable row level security;
revoke all on public.payment_prompt from anon, authenticated;
grant select on public.payment_prompt to authenticated;

drop policy if exists payment_prompt_staff_read on public.payment_prompt;
create policy payment_prompt_staff_read on public.payment_prompt
  for select to authenticated
  using (authz.reaches_module('orders') or authz.reaches_module('finance'));

-- Prompts already sent, so their callbacks still find a home.
insert into public.payment_prompt (payment_id, checkout_request_id, phone, sent_at,
                                   resolved_at, resolved_via, outcome)
select p.id, p.provider_ref, p.payer_phone, coalesce(p.authorised_at, p.created_at),
       case when p.state in ('paid', 'failed') then coalesce(p.paid_at, p.updated_at) end,
       case when p.state in ('paid', 'failed') then 'callback' end,
       case p.state when 'paid' then 'paid' when 'failed' then 'failed' end
  from public.payment p
 where p.provider = 'mpesa' and p.provider_ref is not null
on conflict (checkout_request_id) do nothing;

-- ═══════════════════════════════════════════════ before sending one

/*
 * Whether a new prompt may go out now for this payment. Read before the
 * server calls Safaricom, so a double tap or a reload cannot put two
 * prompts on the guest's phone at once.
 */
create or replace function public.rpc_payment_mpesa_prompt_wait(p_reference text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.payment;
  v_uid uuid := (select auth.uid());
  v_last timestamptz;
  v_open integer;
  v_wait integer;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  select * into p from public.payment where reference = p_reference;
  if p.id is null or not (p.created_by is not distinct from v_uid or authz.reaches_module('orders')) then
    raise exception 'That payment is not yours.' using errcode = '42501';
  end if;
  if p.state = 'paid' then
    return jsonb_build_object('ok', false, 'paid', true, 'wait_seconds', 0,
      'message', 'This is already paid. Nothing more to pay.');
  end if;

  select max(sent_at), count(*) filter (where resolved_at is null)
    into v_last, v_open
    from public.payment_prompt
   where payment_id = p.id and sent_at > now() - interval '1 day';

  if coalesce(v_open, 0) >= 5 then
    return jsonb_build_object('ok', false, 'wait_seconds', 0,
      'message', 'Several prompts are still open for this payment. If money has left your M-Pesa, wait a few minutes before trying again, or contact us with reference ' || p.reference || '.');
  end if;

  v_wait := case when v_last is null then 0
                 else greatest(0, 60 - floor(extract(epoch from (now() - v_last)))::integer) end;
  if v_wait > 0 then
    return jsonb_build_object('ok', false, 'wait_seconds', v_wait,
      'message', 'A prompt was sent to your phone moments ago. Check your phone, or send another in '
                 || v_wait || ' seconds.');
  end if;
  return jsonb_build_object('ok', true, 'wait_seconds', 0);
end;
$$;

revoke execute on function public.rpc_payment_mpesa_prompt_wait(text) from public, anon;
grant execute on function public.rpc_payment_mpesa_prompt_wait(text) to authenticated;

-- ═══════════════════════════════════════════════ after sending one

create or replace function public.rpc_payment_mpesa_sent(
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

  insert into public.payment_prompt (payment_id, checkout_request_id, merchant_request_id, phone)
  values (p.id, p_checkout_request_id, nullif(p_merchant_request_id, ''), p_phone)
  on conflict (checkout_request_id) do nothing;

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
    p_after => jsonb_build_object('provider', 'mpesa', 'state', 'authorised',
                                  'prompt', p_checkout_request_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- ═══════════════════════════════════════════════ a result arrives

/*
 * Safaricom's result for one prompt, from its callback or from our own
 * STK Push Query (p_payload ->> 'source' = 'stk_query'). Same signature as
 * before, so the routes and grants are unchanged.
 */
create or replace function public.rpc_payment_mpesa_callback(
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
  pr public.payment_prompt;
  v_paid boolean := p_result_code = 0;
  v_via text := case when p_payload ->> 'source' = 'stk_query' then 'query' else 'callback' end;
  v_result jsonb;
  v_amount_cents bigint;
  v_event_id uuid;
  v_others_open boolean;
begin
  perform authz.require_daraja_callback_secret(p_callback_secret);
  if nullif(trim(p_checkout_request_id), '') is null or p_result_code is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_checkout_result');
  end if;

  select * into pr from public.payment_prompt
   where checkout_request_id = p_checkout_request_id for update;
  if pr.id is not null then
    select * into p from public.payment where id = pr.payment_id for update;
  else
    select * into p from public.payment
     where provider = 'mpesa' and provider_ref = p_checkout_request_id for update;
  end if;

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

  -- This prompt already has its answer: a retried callback, or the query
  -- and the callback both reporting. Nothing changes.
  if pr.id is not null and pr.resolved_at is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'state', p.state::text);
  end if;

  -- Daraja was asked for a whole-shilling amount rounded up from the order.
  -- A success without a valid amount must never settle the payment.
  if v_paid then
    if p_amount_kes is null or p_amount_kes <= 0 or p_amount_kes > 92233720368547758
       or trunc(p_amount_kes) <> p_amount_kes then
      return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
    end if;
    v_amount_cents := case when p_amount_kes = ceil(p.amount_cents / 100.0)
      then p.amount_cents else (p_amount_kes * 100)::bigint end;
  end if;

  -- Paid already, through another prompt, and this one was paid too: the
  -- guest has paid twice. Record it for a refund rather than lose it.
  if v_paid and p.state = 'paid' and pr.id is not null
     and p.provider_ref is distinct from p_checkout_request_id then
    update public.payment_prompt
       set result_code = p_result_code, result_desc = p_result_desc, receipt = p_receipt,
           resolved_at = now(), resolved_via = v_via, outcome = 'duplicate'
     where id = pr.id;
    insert into public.payment_event
      (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
    values (p.id, 'mpesa', 'stk.duplicate', 'dup:' || p_checkout_request_id, p.reference,
            p_payload, true, false, 'paid twice: refund this prompt')
    on conflict (provider, dedupe_key) do nothing;
    perform audit.log(p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.mpesa_paid_twice', p_actor_label => '[System] · payments',
      p_target_type => 'payment', p_target_id => p.id, p_city_id => p.city_id,
      p_severity => 'high', p_reason => 'A second M-Pesa prompt was paid after the payment settled. Refund it.',
      p_after => jsonb_build_object('reference', p.reference, 'prompt', p_checkout_request_id,
                                    'receipt', p_receipt, 'amount_cents', v_amount_cents));
    return jsonb_build_object('ok', true, 'duplicate', true, 'double_payment', true, 'state', 'paid');
  end if;

  if not v_paid then
    -- Another prompt for this payment may still be on the guest's phone.
    -- That one decides; this failure only closes its own prompt.
    select exists (
      select 1 from public.payment_prompt o
       where o.payment_id = p.id and o.id is distinct from pr.id
         and o.resolved_at is null and o.sent_at > now() - interval '3 minutes')
      into v_others_open;
    if pr.id is not null then
      update public.payment_prompt
         set result_code = p_result_code, result_desc = p_result_desc,
             resolved_at = now(), resolved_via = v_via,
             outcome = case when v_others_open or p.state = 'paid' then 'superseded' else 'failed' end
       where id = pr.id;
    end if;
    if v_others_open or p.state = 'paid' then
      return jsonb_build_object('ok', true, 'state', p.state::text, 'superseded', true);
    end if;
  end if;

  v_result := public.rpc_payment_webhook(
    p_event => 'mpesa.stk.' || v_via,
    p_reference => p.reference,
    p_dedupe_key => 'cb:' || p_checkout_request_id || ':true',
    p_signature_ok => true,
    p_payload => p_payload || jsonb_build_object('gateway_response', p_result_desc),
    p_paid => v_paid,
    p_amount_cents => v_amount_cents,
    p_channel => 'mpesa');

  if v_result->>'state' = 'paid' then
    update public.payment
       set provider_ref = p_checkout_request_id,
           provider_receipt = coalesce(p_receipt, provider_receipt),
           payer_phone = coalesce(p_phone, payer_phone)
     where id = p.id;
  end if;

  if pr.id is not null and v_paid then
    update public.payment_prompt
       set result_code = p_result_code, result_desc = p_result_desc, receipt = p_receipt,
           resolved_at = now(), resolved_via = v_via,
           outcome = case when v_result->>'state' = 'paid' then 'paid' else 'failed' end
     where id = pr.id;
  end if;

  if v_result->>'state' = 'failed' and p.intent = 'order' and p.order_id is not null then
    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, payload)
    values (p.order_id, 'payment_failed', 'Payment not completed',
            coalesce(nullif(p_result_desc, ''), 'M-Pesa did not complete the payment') || ' · ' || p.reference,
            'system', '[System] · payments',
            jsonb_build_object('reference', p.reference, 'result_code', p_result_code,
                               'prompt', p_checkout_request_id));
  end if;

  if v_result->>'state' in ('paid', 'failed') then
    perform audit.log(p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.mpesa_result_recorded', p_target_type => 'payment',
      p_target_id => p.id, p_city_id => p.city_id,
      p_after => jsonb_build_object('provider', 'mpesa', 'state', v_result->>'state',
                                    'via', v_via, 'result_code', p_result_code));
  end if;
  return v_result;
end;
$$;

-- ═══════════════════════════════════════════════ results that never came

/*
 * Prompts on this payment still without a result 45 seconds after they were
 * sent, for the server to ask M-Pesa about. Each one is handed out at most
 * every 20 seconds, so a page refreshing every few seconds does not flood
 * Safaricom with queries.
 */
create or replace function public.rpc_payment_mpesa_open_prompts(p_reference text)
returns table (checkout_request_id text, amount_cents bigint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  p public.payment;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  select * into p from public.payment where reference = p_reference;
  if p.id is null or not (p.created_by is not distinct from v_uid or authz.reaches_module('orders')) then
    raise exception 'That payment is not yours.' using errcode = '42501';
  end if;

  return query
    with due as (
      select pr.id from public.payment_prompt pr
       where pr.payment_id = p.id
         and pr.resolved_at is null
         and pr.sent_at < now() - interval '45 seconds'
         and pr.sent_at > now() - interval '1 day'
         and (pr.last_queried_at is null or pr.last_queried_at < now() - interval '20 seconds')
       for update skip locked
    )
    update public.payment_prompt pr
       set last_queried_at = now()
      from due
     where pr.id = due.id
    returning pr.checkout_request_id, p.amount_cents;
end;
$$;

revoke execute on function public.rpc_payment_mpesa_open_prompts(text) from public, anon;
grant execute on function public.rpc_payment_mpesa_open_prompts(text) to authenticated;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values ('rpc_payment_mpesa_open_prompts',
        'Only stamps when a prompt was last queried, to rate-limit status checks; the result it leads to is audited by rpc_payment_mpesa_callback.',
        'payment_prompt.last_queried_at')
on conflict (function_name) do nothing;
