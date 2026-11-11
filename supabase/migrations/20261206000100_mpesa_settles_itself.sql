-- M-Pesa that settles itself, sends refunds, and hears about Paybill payments.
--
-- Until now an M-Pesa payment settled only when Safaricom's callback arrived,
-- or while the guest kept /pay/<reference> open (the page asks M-Pesa
-- directly after 45 seconds). On production no callback ever arrived, so
-- every payment whose guest closed the page waited forever.
--
--   1. In the background. A worker on the web app (the only place holding the
--      Daraja keys) asks M-Pesa about every prompt still without an answer.
--      pg_cron calls it through pg_net every minute there is something to do;
--      staff call it at once with "Check with M-Pesa" (rpc_payment_mpesa_check_now).
--      A callback refused for a missing or wrong token is now recorded, not
--      silently dropped, and Settings → API tells callbacks from questions.
--   2. Unpaid online orders. (Second part of this file.) Merchants see them as
--      waiting for payment, cannot start them, and M-Pesa orders nobody paid
--      expire once M-Pesa has answered every prompt.
--   3. Money out by M-Pesa (B2C). mpesa_payout is one send to one phone. Finance
--      presses "Send by M-Pesa" on an approved refund; money received that
--      NexG does not keep (a second prompt paid, Paybill money for an order
--      that owes nothing) is held as a payout for one click to send back. A
--      payout is sent once: anything without a clear answer becomes
--      'uncertain' and waits for a person to read the M-Pesa statement.
--      Order refunds still become 'issued' through the same steps (and the
--      same ledger postings) as a refund recorded by hand.
--   4. Paybill payments (C2B). Money paid from the M-Pesa menu with the order
--      number as the account settles that order when the amount is what is
--      owed; anything else is kept for Finance. Prompts now carry the order
--      number as their account reference, so the customer's SMS, the pay page
--      and the Paybill account number all read the same.
--
-- Vault, set by the owner (never in a migration):
--   payments_worker_url    https://<the site>/api/payments/worker
--   daraja_callback_secret (exists already; also the worker's token)
--
-- Rollback: unschedule 'payments-worker' and 'payments-expire-unpaid'; re-run
-- rpc_payment_mpesa_callback from 20261127000100, rpc_refund_issued from
-- 20260101014800, rpc_api_overview from 20261204000100, merchant_orders_v from
-- 20260101014500 and the order functions named in part 2 from their previous
-- files; drop the functions and table created here.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('payment.mpesa_check_requested', 'orders', 'notice', true, 'Staff asked M-Pesa about a waiting payment'),
  ('payment.mpesa_callback_rejected', 'orders', 'high', true, 'An M-Pesa callback for one of our prompts came without the right token'),
  ('payment.mpesa_paid_after_close', 'orders', 'high', true, 'An M-Pesa prompt was paid after its order closed; the money is held to send back'),
  ('payment.mpesa_paybill_settled', 'orders', 'notice', true, 'A Paybill payment settled an order'),
  ('payment.mpesa_paybill_unmatched', 'orders', 'high', true, 'A Paybill payment matched no order, or not the amount owed'),
  ('payment.mpesa_paybill_nothing_owed', 'orders', 'high', true, 'A Paybill payment arrived for an order that owes nothing; held to send back'),
  ('payment.mpesa_paybill_connect', 'settings', 'high', false, 'Staff asked Safaricom to report Paybill payments to NexG'),
  ('payment.mpesa_paybill_registered', 'settings', 'notice', false, 'Safaricom answered the Paybill registration'),
  ('payment.mpesa_payout_queued', 'orders', 'high', true, 'Money queued to go out by M-Pesa'),
  ('payment.mpesa_payout_sent', 'orders', 'high', true, 'M-Pesa sent money out'),
  ('payment.mpesa_payout_failed', 'orders', 'high', true, 'M-Pesa did not send money out'),
  ('payment.mpesa_payout_uncertain', 'orders', 'high', true, 'M-Pesa gave no clear answer about money out; check the statement'),
  ('payment.mpesa_payout_resolved', 'orders', 'high', true, 'Staff recorded what became of an uncertain M-Pesa payout'),
  ('order.unpaid_expired', 'orders', 'notice', true, 'An M-Pesa order nobody paid was closed')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════ shared helpers

/* 0712…, +254712…, 712… → 254712…; null for anything that is not a Kenyan mobile
   (Safaricom's Paybill confirmations carry a masked number, which stays null). */
create or replace function public.fn_mpesa_phone(p_input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when n ~ '^254[17][0-9]{8}$' then n end
    from (select case
                   when d like '254%' then d
                   when d like '0%' then '254' || substr(d, 2)
                   else '254' || d
                 end as n
            from (select regexp_replace(coalesce(p_input, ''), '[^0-9]', '', 'g') as d) digits
           where d <> '') normalised
$$;

/* An order number as a customer types it into the M-Pesa menu: no dashes, upper case. */
create or replace function public.fn_compact_reference(p_reference text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_reference, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create index if not exists order_reference_compact_idx
  on public.order (public.fn_compact_reference(reference));

/*
 * Who may move M-Pesa money by hand: staff working orders or finance, or live
 * ops in the city. Returns the staff id. Refunds used to be recordable by any
 * signed-in user; this is the check that was missing.
 */
create or replace function public.fn_payments_require(p_city_id uuid, p_what text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare v_me uuid := authz.staff_id();
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not (authz.reaches_module('finance') or authz.reaches_module('orders')
          or authz.works_live_ops(p_city_id)) then
    raise exception 'You cannot % in that city.', p_what using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- ═══════════════════════════════════════ 1. asking M-Pesa in the background

alter table public.payment_prompt
  add column if not exists query_attempts integer not null default 0;

/*
 * When a prompt with no answer is due another question. Often while M-Pesa
 * could still be deciding, then every ten minutes for a day, then hourly for
 * a week. After a week the prompt is left for a person: Finance reads the
 * statement, and "Check with M-Pesa" still asks.
 */
create or replace function public.fn_mpesa_prompt_due(
  p_sent_at timestamptz,
  p_last_queried_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_sent_at < now() - interval '45 seconds'
     and p_sent_at > now() - interval '7 days'
     and (p_last_queried_at is null
          or p_last_queried_at < now() - case
               when p_sent_at > now() - interval '15 minutes' then interval '20 seconds'
               when p_sent_at > now() - interval '1 day' then interval '10 minutes'
               else interval '1 hour'
             end)
$$;

/*
 * The worker's list: prompts due another question, across every payment, or
 * every open prompt of one payment when staff ask. Each row handed out is
 * stamped, so two workers never ask about the same prompt at once.
 */
create or replace function public.rpc_payment_mpesa_due_prompts(
  p_callback_secret text,
  p_reference text default null,
  p_limit integer default 15
)
returns table (checkout_request_id text, amount_cents bigint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform authz.require_daraja_callback_secret(p_callback_secret);

  return query
    with due as (
      select pr.id
        from public.payment_prompt pr
        join public.payment p on p.id = pr.payment_id
       where pr.resolved_at is null
         and case
               when p_reference is null
                 then public.fn_mpesa_prompt_due(pr.sent_at, pr.last_queried_at)
               else p.reference = p_reference
                    and pr.sent_at < now() - interval '45 seconds'
                    and (pr.last_queried_at is null
                         or pr.last_queried_at < now() - interval '10 seconds')
             end
       order by pr.sent_at desc
       limit greatest(1, least(coalesce(p_limit, 15), 50))
       for update of pr skip locked
    )
    update public.payment_prompt pr
       set last_queried_at = now(),
           query_attempts = pr.query_attempts + 1
      from due, public.payment p
     where pr.id = due.id and p.id = pr.payment_id
    returning pr.checkout_request_id, p.amount_cents;
end;
$$;

/*
 * Calls the payments worker on the web app. Internal: the cron and the staff
 * actions below reach it, nothing outside the database can.
 */
create or replace function public.fn_payments_worker_poke(p_body jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request bigint;
begin
  select nullif(trim(decrypted_secret), '') into v_url
    from vault.decrypted_secrets where name = 'payments_worker_url';
  select nullif(trim(decrypted_secret), '') into v_secret
    from vault.decrypted_secrets where name = 'daraja_callback_secret';

  if v_url is null or v_secret is null then
    /* Said, not raised: a cron that raises every minute tells nobody. */
    return jsonb_build_object(
      'ok', false,
      'message', 'payments_worker_url or daraja_callback_secret is missing from Vault, so the payments worker was not called.');
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-payments-secret', v_secret),
    body := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 55000
  ) into v_request;

  return jsonb_build_object('ok', true, 'request_id', v_request);
end;
$$;

-- ═══════════════════════════════════════ refused callbacks are written down

create or replace function public.rpc_payment_mpesa_callback_rejected(
  p_checkout_request_id text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.payment_prompt;
  p public.payment;
  v_event uuid;
begin
  if p_reason is null or p_reason not in ('missing_token', 'wrong_token')
     or nullif(trim(p_checkout_request_id), '') is null
     or length(p_checkout_request_id) > 120 then
    return;
  end if;

  /* Only for a prompt NexG sent: anything else is noise and is not stored. */
  select * into pr from public.payment_prompt where checkout_request_id = p_checkout_request_id;
  if pr.id is null then
    return;
  end if;
  select * into p from public.payment where id = pr.payment_id;

  insert into public.payment_event
    (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
  values (p.id, 'mpesa', 'mpesa.stk.rejected',
          'rejected:' || p_checkout_request_id || ':' || p_reason, p.reference,
          jsonb_build_object('reason', p_reason), false, false,
          'Callback refused (' || replace(p_reason, '_', ' ')
            || '). DARAJA_CALLBACK_SECRET on the web app and daraja_callback_secret in Vault must match.')
  on conflict (provider, dedupe_key) do nothing
  returning id into v_event;

  if v_event is not null then
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.mpesa_callback_rejected', p_actor_label => '[System] · payments',
      p_target_type => 'payment', p_target_id => p.id, p_target_label => p.reference,
      p_city_id => p.city_id, p_severity => 'high',
      p_reason => 'An M-Pesa callback for one of our prompts arrived without the right token. Nothing was changed.',
      p_after => jsonb_build_object('reason', p_reason, 'prompt', p_checkout_request_id));
  end if;
end;
$$;

-- ═══════════════════════════════════════ 3. money out by M-Pesa (B2C)

create table if not exists public.mpesa_payout (
  id uuid primary key default gen_random_uuid(),
  /* Ours, sent to Safaricom as the OriginatorConversationID; its answer names it. */
  originator_id text not null unique,
  purpose text not null check (purpose in ('order_refund', 'return_excess')),
  refund_id uuid references public.refund (id) on delete restrict,
  order_id uuid references public.order (id) on delete restrict,
  payment_id uuid references public.payment (id) on delete set null,
  /* The M-Pesa receipt of the money being sent back, for a return. */
  source_ref text,
  phone text check (phone is null or phone ~ '^254[17][0-9]{8}$'),
  amount_cents bigint not null check (amount_cents > 0),
  reason text not null check (length(trim(reason)) > 0),
  state text not null default 'held'
    check (state in ('held', 'queued', 'sending', 'accepted', 'sent', 'failed', 'uncertain', 'cancelled')),
  conversation_id text,
  receipt text,
  result_code integer,
  result_desc text,
  requested_by uuid references public.staff_user (id) on delete set null,
  requested_at timestamptz,
  claimed_at timestamptz,
  answered_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_refund_is_linked check ((purpose = 'order_refund') = (refund_id is not null)),
  constraint payout_sent_has_receipt check (state <> 'sent' or receipt is not null)
);

comment on table public.mpesa_payout is
  'One send of money to one phone by M-Pesa (B2C): an approved order refund, or money received that NexG does not keep. held → queued (a person pressed send) → sending (the worker asked Safaricom) → accepted → sent | failed; uncertain waits for a person to read the statement.';

/* One live send per refund. A refund cannot go out twice by pressing twice. */
create unique index if not exists mpesa_payout_one_live_per_refund
  on public.mpesa_payout (refund_id)
  where refund_id is not null and state in ('queued', 'sending', 'accepted', 'uncertain');
create index if not exists mpesa_payout_queued on public.mpesa_payout (requested_at)
  where state = 'queued';
create index if not exists mpesa_payout_by_order on public.mpesa_payout (order_id);

alter table public.mpesa_payout enable row level security;
revoke all on public.mpesa_payout from anon, authenticated;
grant select on public.mpesa_payout to authenticated;

drop policy if exists mpesa_payout_staff_read on public.mpesa_payout;
create policy mpesa_payout_staff_read on public.mpesa_payout
  for select to authenticated
  using (authz.reaches_module('orders') or authz.reaches_module('finance'));

create or replace function public.fn_mpesa_payout_originator()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'NXR' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20))
$$;

/*
 * Holds money received that NexG does not keep, for one click to send back.
 * Internal: the M-Pesa callback and the Paybill confirmation call it.
 */
create or replace function public.fn_mpesa_hold_return(
  p_order_id uuid,
  p_payment_id uuid,
  p_amount_cents bigint,
  p_phone text,
  p_source_ref text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.mpesa_payout
    (originator_id, purpose, order_id, payment_id, source_ref, phone, amount_cents, reason, state)
  values (public.fn_mpesa_payout_originator(), 'return_excess', p_order_id, p_payment_id,
          p_source_ref, public.fn_mpesa_phone(p_phone), p_amount_cents, p_reason, 'held')
  returning id into v_id;

  if p_order_id is not null then
    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, payload)
    values (p_order_id, 'money_to_return', 'Money to send back',
            'KES ' || ceil(p_amount_cents / 100.0) || ' · ' || p_reason,
            'system', '[System] · payments',
            jsonb_build_object('payout_id', v_id, 'amount_cents', p_amount_cents,
                               'source_ref', p_source_ref));
  end if;
  return v_id;
end;
$$;

/*
 * The core of "a refund was sent", shared by Finance recording a send by hand
 * and Safaricom confirming a B2C payout. The ledger trigger on refund.status
 * posts it exactly as before.
 */
create or replace function public.fn_refund_mark_issued(
  p_refund_id uuid,
  p_provider_ref text,
  p_actor_label text default '[System] · payments'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refund;
  o public.order;
  v_total bigint;
begin
  select * into r from public.refund where id = p_refund_id for update;
  if not found then raise exception 'No such refund.'; end if;
  if r.status = 'issued' then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if r.status <> 'approved' then
    raise exception 'That refund is %, not approved.', r.status;
  end if;

  select * into o from public.order where id = r.order_id;

  update public.refund
     set status = 'issued', provider_ref = p_provider_ref, issued_at = now()
   where id = p_refund_id;

  select coalesce(sum(amount_cents), 0) into v_total
    from public.refund where order_id = r.order_id and status = 'issued';

  update public.order
     set payment_status = (case when v_total >= o.total_cents
                                then 'refunded' else 'partially_refunded' end
                          )::public.order_payment_status,
         stage = (case when v_total >= o.total_cents and o.stage <> 'cancelled'
                       then 'refunded' else o.stage::text end)::public.order_stage
   where id = r.order_id;

  insert into public.order_event
    (order_id, kind, title, detail, actor_type, actor_label, payload)
  values (r.order_id, 'refund_issued', 'Refund sent',
          'KES ' || (r.amount_cents / 100) || ' · ' || r.method
            || coalesce(' · ' || p_provider_ref, ''),
          'system', p_actor_label,
          jsonb_build_object('refund_id', p_refund_id, 'amount_cents', r.amount_cents));

  perform audit.log(
    p_actor_type => 'system'::public.actor_type, p_module => 'orders',
    p_action => 'order.refund_issued',
    p_actor_label => p_actor_label,
    p_target_type => 'order', p_target_id => r.order_id, p_target_label => o.reference,
    p_city_id => o.city_id, p_severity => 'high',
    p_after => jsonb_build_object('amount_cents', r.amount_cents, 'currency', o.currency,
                                  'provider_ref', p_provider_ref, 'refunded_total', v_total));

  return jsonb_build_object('ok', true, 'refunded_total_cents', v_total);
end;
$$;

/*
 * Finance records a refund sent by hand. Now checked: the caller works
 * orders, and a refund already on its way by M-Pesa cannot also be recorded
 * by hand.
 */
create or replace function public.rpc_refund_issued(
  p_refund_id uuid, p_provider_ref text, p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refund;
  o public.order;
begin
  select * into r from public.refund where id = p_refund_id;
  if not found then raise exception 'No such refund.'; end if;
  select * into o from public.order where id = r.order_id;
  perform public.fn_payments_require(o.city_id, 'record a refund');

  if exists (select 1 from public.mpesa_payout x
              where x.refund_id = p_refund_id
                and x.state in ('queued', 'sending', 'accepted', 'uncertain')) then
    raise exception 'This refund is going out by M-Pesa. Wait for its answer, or settle the uncertain send first.';
  end if;

  return public.fn_refund_mark_issued(p_refund_id, p_provider_ref,
    coalesce((select su.email from public.staff_user su where su.id = authz.staff_id()), '[Staff]'));
end;
$$;

/* Queues an approved order refund to go back by M-Pesa. */
create or replace function public.rpc_refund_send_mpesa(p_refund_id uuid, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refund;
  o public.order;
  v_me uuid;
  v_paid public.payment;
  v_phone text;
  v_given text := public.fn_mpesa_phone(p_phone);
  v_payout uuid;
  v_poke jsonb;
begin
  select * into r from public.refund where id = p_refund_id for update;
  if not found then raise exception 'No such refund.'; end if;
  select * into o from public.order where id = r.order_id;
  v_me := public.fn_payments_require(o.city_id, 'send a refund');

  if r.status <> 'approved' then
    raise exception 'That refund is %, not approved.', r.status;
  end if;
  if r.method = 'wallet_credit' then
    raise exception 'That refund is credit on the next order, not money by M-Pesa.';
  end if;

  select * into v_paid from public.payment
   where order_id = r.order_id and state = 'paid' and provider = 'mpesa'
   order by paid_at desc limit 1;
  if r.method = 'original' and v_paid.id is null then
    raise exception 'This order was not paid by M-Pesa, so its refund cannot go back that way.';
  end if;

  /* Back to the number that paid. Another number only when that one is unknown. */
  v_phone := public.fn_mpesa_phone(v_paid.payer_phone);
  if v_phone is not null and v_given is not null and v_given <> v_phone then
    raise exception 'Refunds go back to the number that paid (%). Send to another number by hand.',
      public.fn_mask_phone(v_phone);
  end if;
  v_phone := coalesce(v_phone, v_given);
  if v_phone is null then
    raise exception 'Enter the Safaricom number to send it to, like 0712 345 678.';
  end if;

  begin
    insert into public.mpesa_payout
      (originator_id, purpose, refund_id, order_id, payment_id, source_ref, phone,
       amount_cents, reason, state, requested_by, requested_at)
    values (public.fn_mpesa_payout_originator(), 'order_refund', r.id, r.order_id, v_paid.id,
            v_paid.provider_receipt, v_phone, r.amount_cents,
            'Refund ' || o.reference || ' · ' || r.reason_code, 'queued', v_me, now())
    returning id into v_payout;
  exception when unique_violation then
    raise exception 'This refund is already on its way by M-Pesa.';
  end;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (r.order_id, 'refund_sending', 'Refund going out by M-Pesa',
          'KES ' || ceil(r.amount_cents / 100.0) || ' to ' || public.fn_mask_phone(v_phone),
          'staff', v_me, jsonb_build_object('refund_id', r.id, 'payout_id', v_payout));

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'orders',
    p_action => 'payment.mpesa_payout_queued', p_actor_id => v_me,
    p_target_type => 'order', p_target_id => r.order_id, p_target_label => o.reference,
    p_city_id => o.city_id, p_severity => 'high',
    p_after => jsonb_build_object('refund_id', r.id, 'payout_id', v_payout,
                                  'amount_cents', r.amount_cents, 'phone', public.fn_mask_phone(v_phone)));

  v_poke := public.fn_payments_worker_poke('{}'::jsonb);
  return jsonb_build_object(
    'ok', true, 'payout_id', v_payout,
    'message', case when (v_poke ->> 'ok')::boolean
      then 'Queued. It goes out by M-Pesa within a minute, and is marked sent when Safaricom confirms.'
      else 'Queued, but ' || (v_poke ->> 'message') end);
end;
$$;

/* Sends held money back: a second prompt paid, or Paybill money nothing was owed for. */
create or replace function public.rpc_mpesa_payout_send(p_payout_id uuid, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.mpesa_payout;
  o public.order;
  v_me uuid;
  v_given text := public.fn_mpesa_phone(p_phone);
  v_poke jsonb;
begin
  select * into x from public.mpesa_payout where id = p_payout_id for update;
  if not found then raise exception 'No such payout.'; end if;
  select * into o from public.order where id = x.order_id;
  v_me := public.fn_payments_require(o.city_id, 'send money back');

  if x.purpose <> 'return_excess' then
    raise exception 'Send a refund from the refund itself.';
  end if;
  if x.state not in ('held', 'failed') then
    raise exception 'That payout is %.', x.state;
  end if;
  if x.phone is not null and v_given is not null and v_given <> x.phone then
    raise exception 'It goes back to the number that paid (%).', public.fn_mask_phone(x.phone);
  end if;
  if coalesce(x.phone, v_given) is null then
    raise exception 'M-Pesa did not say which number paid. Enter it, like 0712 345 678.';
  end if;

  update public.mpesa_payout
     set phone = coalesce(phone, v_given), state = 'queued',
         originator_id = case when state = 'failed' then public.fn_mpesa_payout_originator() else originator_id end,
         conversation_id = null, result_code = null, result_desc = null,
         claimed_at = null, answered_at = null,
         requested_by = v_me, requested_at = now(), updated_at = now()
   where id = p_payout_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'orders',
    p_action => 'payment.mpesa_payout_queued', p_actor_id => v_me,
    p_target_type => 'payout', p_target_id => p_payout_id, p_target_label => o.reference,
    p_city_id => o.city_id, p_severity => 'high',
    p_after => jsonb_build_object('amount_cents', x.amount_cents,
                                  'phone', public.fn_mask_phone(coalesce(x.phone, v_given))));

  v_poke := public.fn_payments_worker_poke('{}'::jsonb);
  return jsonb_build_object(
    'ok', true,
    'message', case when (v_poke ->> 'ok')::boolean
      then 'Queued. It goes out by M-Pesa within a minute.'
      else 'Queued, but ' || (v_poke ->> 'message') end);
end;
$$;

/*
 * The worker takes queued payouts, once each. A payout it takes and never
 * answers about becomes uncertain (see cron_payments_worker), never queued
 * again: a second request could be a second payment.
 */
create or replace function public.rpc_mpesa_payout_claim(p_callback_secret text, p_limit integer default 5)
returns table (payout_id uuid, originator_id text, phone text, amount_cents bigint, order_reference text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform authz.require_daraja_callback_secret(p_callback_secret);

  return query
    with pick as (
      select x.id from public.mpesa_payout x
       where x.state = 'queued' and x.phone is not null
       order by x.requested_at
       limit greatest(1, least(coalesce(p_limit, 5), 20))
       for update skip locked
    )
    update public.mpesa_payout x
       set state = 'sending', claimed_at = now(), updated_at = now()
      from pick
     where x.id = pick.id
    returning x.id, x.originator_id, x.phone, x.amount_cents,
              coalesce((select o.reference from public.order o where o.id = x.order_id), 'NexG');
end;
$$;

/* What Safaricom said to the request itself: accepted, refused, or nothing clear. */
create or replace function public.rpc_mpesa_payout_outcome(
  p_callback_secret text,
  p_originator_id text,
  p_outcome text,
  p_conversation_id text default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.mpesa_payout;
  o public.order;
begin
  perform authz.require_daraja_callback_secret(p_callback_secret);
  if p_outcome is null or p_outcome not in ('accepted', 'refused', 'unknown') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_outcome');
  end if;

  select * into x from public.mpesa_payout where originator_id = p_originator_id for update;
  if x.id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_payout');
  end if;
  if x.state not in ('sending', 'accepted') then
    return jsonb_build_object('ok', true, 'duplicate', true, 'state', x.state);
  end if;
  select * into o from public.order where id = x.order_id;

  if p_outcome = 'accepted' then
    update public.mpesa_payout
       set state = 'accepted', conversation_id = coalesce(p_conversation_id, conversation_id),
           result_desc = left(p_message, 500), answered_at = now(), updated_at = now()
     where id = x.id;
    return jsonb_build_object('ok', true, 'state', 'accepted');
  end if;

  if p_outcome = 'refused' then
    update public.mpesa_payout
       set state = 'failed', result_desc = left(p_message, 500), answered_at = now(),
           finished_at = now(), updated_at = now()
     where id = x.id;
    if x.order_id is not null then
      insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, payload)
      values (x.order_id, 'payout_failed', 'M-Pesa did not send it',
              coalesce(nullif(p_message, ''), 'Refused') || '. Nothing moved; send again or by hand.',
              'system', '[System] · payments', jsonb_build_object('payout_id', x.id));
    end if;
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.mpesa_payout_failed', p_actor_label => '[System] · payments',
      p_target_type => 'payout', p_target_id => x.id, p_target_label => o.reference,
      p_city_id => o.city_id, p_severity => 'high',
      p_reason => left(coalesce(p_message, 'Refused'), 500));
    return jsonb_build_object('ok', true, 'state', 'failed');
  end if;

  update public.mpesa_payout
     set state = 'uncertain', result_desc = left(p_message, 500), answered_at = now(),
         updated_at = now()
   where id = x.id;
  if x.order_id is not null then
    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, payload)
    values (x.order_id, 'payout_uncertain', 'Check the M-Pesa statement',
            'M-Pesa gave no clear answer about KES ' || ceil(x.amount_cents / 100.0)
              || '. Do not send it again until the statement says whether it went.',
            'system', '[System] · payments', jsonb_build_object('payout_id', x.id));
  end if;
  perform audit.log(
    p_actor_type => 'system'::public.actor_type, p_module => 'orders',
    p_action => 'payment.mpesa_payout_uncertain', p_actor_label => '[System] · payments',
    p_target_type => 'payout', p_target_id => x.id, p_target_label => o.reference,
    p_city_id => o.city_id, p_severity => 'high',
    p_reason => left(coalesce(p_message, 'No clear answer'), 500));
  return jsonb_build_object('ok', true, 'state', 'uncertain');
end;
$$;

/* Safaricom's final word on a payout (the B2C result callback). */
create or replace function public.rpc_mpesa_payout_result(
  p_callback_secret text,
  p_originator_id text,
  p_conversation_id text,
  p_result_code integer,
  p_result_desc text,
  p_receipt text default null,
  p_amount_kes numeric default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.mpesa_payout;
  o public.order;
  v_event uuid;
begin
  perform authz.require_daraja_callback_secret(p_callback_secret);

  select * into x from public.mpesa_payout
   where originator_id = p_originator_id
      or (p_conversation_id is not null and conversation_id = p_conversation_id)
   order by (originator_id = p_originator_id) desc
   limit 1
   for update;

  insert into public.payment_event
    (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
  values (x.payment_id, 'mpesa', 'mpesa.b2c.result',
          'b2c:' || coalesce(p_originator_id, '') || ':' || coalesce(p_conversation_id, '')
            || ':' || coalesce(p_result_code::text, ''),
          null, coalesce(p_payload, '{}'::jsonb), true, false, null)
  on conflict (provider, dedupe_key) do nothing
  returning id into v_event;
  if v_event is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if x.id is null then
    update public.payment_event set handled_note = 'no payout with that OriginatorConversationID'
     where id = v_event;
    return jsonb_build_object('ok', false, 'reason', 'unknown_payout');
  end if;
  if x.state not in ('sending', 'accepted', 'uncertain') then
    update public.payment_event set handled = true,
           handled_note = 'payout already ' || x.state where id = v_event;
    return jsonb_build_object('ok', true, 'duplicate', true, 'state', x.state);
  end if;
  select * into o from public.order where id = x.order_id;

  if p_result_code = 0 and nullif(trim(p_receipt), '') is not null
     and (p_amount_kes is null or p_amount_kes = ceil(x.amount_cents / 100.0)) then
    update public.mpesa_payout
       set state = 'sent', receipt = p_receipt, result_code = 0, result_desc = left(p_result_desc, 500),
           conversation_id = coalesce(p_conversation_id, conversation_id),
           finished_at = now(), updated_at = now()
     where id = x.id;
    if x.refund_id is not null then
      perform public.fn_refund_mark_issued(x.refund_id, p_receipt, '[System] · M-Pesa');
    elsif x.order_id is not null then
      insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, payload)
      values (x.order_id, 'money_returned', 'Money sent back',
              'KES ' || ceil(x.amount_cents / 100.0) || ' · ' || p_receipt,
              'system', '[System] · M-Pesa', jsonb_build_object('payout_id', x.id));
    end if;
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.mpesa_payout_sent', p_actor_label => '[System] · M-Pesa',
      p_target_type => 'payout', p_target_id => x.id, p_target_label => o.reference,
      p_city_id => o.city_id, p_severity => 'high',
      p_after => jsonb_build_object('amount_cents', x.amount_cents, 'receipt', p_receipt,
                                    'purpose', x.purpose));
    update public.payment_event set handled = true, handled_note = 'payout sent' where id = v_event;
    return jsonb_build_object('ok', true, 'state', 'sent');
  end if;

  if p_result_code = 0 then
    /* Success, but not the amount asked for, or no receipt: a person checks. */
    update public.mpesa_payout
       set state = 'uncertain', result_code = 0, receipt = nullif(trim(p_receipt), ''),
           result_desc = left('M-Pesa reported success with ' || coalesce('KES ' || p_amount_kes, 'no amount')
                              || ' and ' || coalesce('receipt ' || nullif(trim(p_receipt), ''), 'no receipt')
                              || ' for KES ' || ceil(x.amount_cents / 100.0) || '.', 500),
           updated_at = now()
     where id = x.id;
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.mpesa_payout_uncertain', p_actor_label => '[System] · M-Pesa',
      p_target_type => 'payout', p_target_id => x.id, p_target_label => o.reference,
      p_city_id => o.city_id, p_severity => 'high',
      p_reason => 'M-Pesa reported success that does not match the payout.');
    update public.payment_event set handled = true, handled_note = 'payout uncertain' where id = v_event;
    return jsonb_build_object('ok', true, 'state', 'uncertain');
  end if;

  update public.mpesa_payout
     set state = 'failed', result_code = p_result_code, result_desc = left(p_result_desc, 500),
         conversation_id = coalesce(p_conversation_id, conversation_id),
         finished_at = now(), updated_at = now()
   where id = x.id;
  if x.order_id is not null then
    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, payload)
    values (x.order_id, 'payout_failed', 'M-Pesa did not send it',
            coalesce(nullif(p_result_desc, ''), 'Failed') || '. Nothing moved; send again or by hand.',
            'system', '[System] · M-Pesa', jsonb_build_object('payout_id', x.id,
                                                              'result_code', p_result_code));
  end if;
  perform audit.log(
    p_actor_type => 'system'::public.actor_type, p_module => 'orders',
    p_action => 'payment.mpesa_payout_failed', p_actor_label => '[System] · M-Pesa',
    p_target_type => 'payout', p_target_id => x.id, p_target_label => o.reference,
    p_city_id => o.city_id, p_severity => 'high',
    p_reason => left(coalesce(p_result_desc, 'Failed'), 500));
  update public.payment_event set handled = true, handled_note = 'payout failed' where id = v_event;
  return jsonb_build_object('ok', true, 'state', 'failed');
end;
$$;

/*
 * A person read the M-Pesa statement for an uncertain payout and says what
 * happened: sent (with its receipt), or not sent (so it can go again).
 */
create or replace function public.rpc_mpesa_payout_resolve(
  p_payout_id uuid,
  p_sent boolean,
  p_receipt text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.mpesa_payout;
  o public.order;
  v_me uuid;
begin
  select * into x from public.mpesa_payout where id = p_payout_id for update;
  if not found then raise exception 'No such payout.'; end if;
  select * into o from public.order where id = x.order_id;
  v_me := public.fn_payments_require(o.city_id, 'settle an M-Pesa payout');

  if x.state not in ('uncertain', 'held', 'failed') then
    raise exception 'That payout is %. Only an uncertain one, or money held or failed, is settled by hand.',
      x.state;
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Say what the statement shows.';
  end if;

  if p_sent then
    if length(coalesce(trim(p_receipt), '')) < 6 then
      raise exception 'Enter the M-Pesa receipt of the money that went out.';
    end if;
    update public.mpesa_payout
       set state = 'sent', receipt = trim(p_receipt), finished_at = now(), updated_at = now(),
           result_desc = left(coalesce(result_desc || ' · ', '') || 'Settled by hand: ' || p_note, 500)
     where id = x.id;
    if x.refund_id is not null then
      perform public.fn_refund_mark_issued(x.refund_id, trim(p_receipt),
        coalesce((select su.email from public.staff_user su where su.id = v_me), '[Staff]'));
    end if;
  else
    if x.state <> 'uncertain' then
      raise exception 'Only an uncertain payout is marked not sent.';
    end if;
    update public.mpesa_payout
       set state = 'failed', finished_at = now(), updated_at = now(),
           result_desc = left(coalesce(result_desc || ' · ', '') || 'Not sent: ' || p_note, 500)
     where id = x.id;
  end if;

  if x.order_id is not null then
    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
    values (x.order_id, 'payout_resolved',
            case when p_sent then 'M-Pesa payout confirmed' else 'M-Pesa payout did not go' end,
            p_note || coalesce(' · ' || nullif(trim(p_receipt), ''), ''),
            'staff', v_me, jsonb_build_object('payout_id', x.id, 'sent', p_sent));
  end if;
  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'orders',
    p_action => 'payment.mpesa_payout_resolved', p_actor_id => v_me,
    p_target_type => 'payout', p_target_id => x.id, p_target_label => o.reference,
    p_city_id => o.city_id, p_severity => 'high', p_reason => p_note,
    p_after => jsonb_build_object('sent', p_sent, 'receipt', nullif(trim(p_receipt), '')));
  return jsonb_build_object('ok', true, 'state', case when p_sent then 'sent' else 'failed' end);
end;
$$;

-- ═══════════════════════════════════════ the worker's clock

create or replace function public.cron_payments_worker()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prompts integer;
  v_payouts integer;
  v_stale uuid[];
  v_id uuid;
begin
  /* Taken and never answered about, or accepted and never resolved: a person
     checks the statement. Never queued again on its own. */
  with stale as (
    update public.mpesa_payout
       set state = 'uncertain', updated_at = now(),
           result_desc = left(coalesce(result_desc || ' · ', '')
             || case when state = 'sending'
                     then 'The worker took this payout and never said what M-Pesa answered.'
                     else 'M-Pesa accepted this payout and never sent its result.' end, 500)
     where (state = 'sending' and claimed_at < now() - interval '10 minutes')
        or (state = 'accepted' and answered_at < now() - interval '2 hours')
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_stale from stale;

  foreach v_id in array v_stale loop
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.mpesa_payout_uncertain', p_actor_label => '[System] · payments',
      p_target_type => 'payout', p_target_id => v_id, p_severity => 'high',
      p_reason => 'No answer from M-Pesa in time. Check the statement before sending again.');
  end loop;

  select count(*) into v_prompts from public.payment_prompt pr
   where pr.resolved_at is null and public.fn_mpesa_prompt_due(pr.sent_at, pr.last_queried_at);
  select count(*) into v_payouts from public.mpesa_payout where state = 'queued';

  if v_prompts = 0 and v_payouts = 0 then
    return jsonb_build_object('ok', true, 'waiting', 0);
  end if;
  return public.fn_payments_worker_poke('{}'::jsonb)
         || jsonb_build_object('prompts', v_prompts, 'payouts', v_payouts);
end;
$$;

-- ═══════════════════════════════════════ staff: "Check with M-Pesa"

create or replace function public.rpc_payment_mpesa_check_now(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  v_me uuid;
  v_open integer;
  v_poke jsonb;
begin
  select * into p from public.payment where reference = p_reference;
  if p.id is null then raise exception 'No such payment.'; end if;
  v_me := public.fn_payments_require(p.city_id, 'check a payment with M-Pesa');

  select count(*) into v_open from public.payment_prompt
   where payment_id = p.id and resolved_at is null;
  if v_open = 0 then
    return jsonb_build_object('ok', true, 'open', 0,
      'message', 'No M-Pesa prompt is waiting on this payment.');
  end if;

  update public.payment_prompt set last_queried_at = null
   where payment_id = p.id and resolved_at is null;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'orders',
    p_action => 'payment.mpesa_check_requested', p_actor_id => v_me,
    p_target_type => 'payment', p_target_id => p.id, p_target_label => p.reference,
    p_city_id => p.city_id, p_severity => 'notice',
    p_after => jsonb_build_object('open_prompts', v_open));

  v_poke := public.fn_payments_worker_poke(jsonb_build_object('reference', p.reference));
  return jsonb_build_object(
    'ok', coalesce((v_poke ->> 'ok')::boolean, false), 'open', v_open,
    'message', case when (v_poke ->> 'ok')::boolean
      then 'Asked M-Pesa. Its answer shows here within a few seconds; a prompt under a minute old has nothing to tell yet.'
      else v_poke ->> 'message' end);
end;
$$;

-- ═══════════════════════════════════════ the M-Pesa callback, with money to return

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
  o public.order;
  v_paid boolean := p_result_code = 0;
  v_via text := case when p_payload ->> 'source' = 'stk_query' then 'query' else 'callback' end;
  /* What reported it, for the record: Safaricom's callback, NexG asking, or
     the Paybill confirmation of the same money. */
  v_event_name text := case p_payload ->> 'source'
                         when 'stk_query' then 'mpesa.stk.query'
                         when 'paybill' then 'mpesa.stk.paybill'
                         else 'mpesa.stk.callback' end;
  v_result jsonb;
  v_amount_cents bigint;
  v_event_id uuid;
  v_others_open boolean;
  v_payout uuid;
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

  if p.intent = 'order' then
    select * into o from public.order where id = p.order_id;
  end if;

  -- Paid already, by another prompt or by Paybill, and this one was paid too.
  -- The same money reported twice (same receipt) changes nothing; a second
  -- payment is held to send back rather than lost.
  if v_paid and p.state = 'paid' and pr.id is not null
     and p.provider_ref is distinct from p_checkout_request_id then
    if nullif(trim(p_receipt), '') is not null and p_receipt = p.provider_receipt then
      update public.payment_prompt
         set result_code = p_result_code, result_desc = p_result_desc, receipt = p_receipt,
             resolved_at = now(), resolved_via = v_via, outcome = 'paid'
       where id = pr.id;
      return jsonb_build_object('ok', true, 'duplicate', true, 'state', 'paid');
    end if;
    update public.payment_prompt
       set result_code = p_result_code, result_desc = p_result_desc, receipt = p_receipt,
           resolved_at = now(), resolved_via = v_via, outcome = 'duplicate'
     where id = pr.id;
    insert into public.payment_event
      (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
    values (p.id, 'mpesa', 'stk.duplicate', 'dup:' || p_checkout_request_id, p.reference,
            p_payload, true, false, 'paid twice: held to send back')
    on conflict (provider, dedupe_key) do nothing;
    v_payout := public.fn_mpesa_hold_return(
      p.order_id, p.id, v_amount_cents, coalesce(p_phone, pr.phone), p_receipt,
      'Paid twice: a second M-Pesa prompt for ' || coalesce(o.reference, p.reference)
        || ' was paid' || coalesce(' (' || nullif(trim(p_receipt), '') || ')', '') || '.');
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.mpesa_paid_twice', p_actor_label => '[System] · payments',
      p_target_type => 'payment', p_target_id => p.id, p_city_id => p.city_id,
      p_severity => 'high', p_reason => 'A second M-Pesa prompt was paid after the payment settled. Held to send back.',
      p_after => jsonb_build_object('reference', p.reference, 'prompt', p_checkout_request_id,
                                    'receipt', p_receipt, 'amount_cents', v_amount_cents,
                                    'payout_id', v_payout));
    return jsonb_build_object('ok', true, 'duplicate', true, 'double_payment', true,
                              'state', 'paid', 'payout_id', v_payout);
  end if;

  -- Paid for an order that has since closed (cancelled, expired, refunded):
  -- nothing is owed, so the money is held to send back, not settled.
  if v_paid and p.state <> 'paid' and o.id is not null and o.stage in ('cancelled', 'refunded') then
    if pr.id is not null then
      update public.payment_prompt
         set result_code = p_result_code, result_desc = p_result_desc, receipt = p_receipt,
             resolved_at = now(), resolved_via = v_via, outcome = 'duplicate'
       where id = pr.id;
    end if;
    insert into public.payment_event
      (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
    values (p.id, 'mpesa', 'stk.after_close', 'late:' || p_checkout_request_id, p.reference,
            p_payload, true, false, 'paid after the order closed: held to send back')
    on conflict (provider, dedupe_key) do nothing;
    v_payout := public.fn_mpesa_hold_return(
      o.id, p.id, v_amount_cents, coalesce(p_phone, pr.phone), p_receipt,
      'Paid after order ' || o.reference || ' was ' || o.stage::text
        || coalesce(' (' || nullif(trim(p_receipt), '') || ')', '') || '.');
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.mpesa_paid_after_close', p_actor_label => '[System] · payments',
      p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
      p_city_id => o.city_id, p_severity => 'high',
      p_after => jsonb_build_object('reference', p.reference, 'receipt', p_receipt,
                                    'amount_cents', v_amount_cents, 'payout_id', v_payout));
    return jsonb_build_object('ok', true, 'after_close', true, 'state', p.state::text,
                              'payout_id', v_payout);
  end if;

  if not v_paid then
    -- Another prompt for this payment may still be on the guest's phone.
    -- That one decides; this failure only closes its own prompt.
    select exists (
      select 1 from public.payment_prompt x
       where x.payment_id = p.id and x.id is distinct from pr.id
         and x.resolved_at is null and x.sent_at > now() - interval '3 minutes')
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
    p_event => v_event_name,
    p_reference => p.reference,
    p_dedupe_key => 'cb:' || p_checkout_request_id || ':true',
    p_signature_ok => true,
    p_payload => p_payload || jsonb_build_object('gateway_response', p_result_desc),
    p_paid => v_paid,
    /* The prompt that was paid is the payment's provider reference. Passed here
       rather than only set afterwards, so a payment can never be refused for
       having none. */
    p_provider_ref => case when v_paid then p_checkout_request_id end,
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

-- ═══════════════════════════════════════ 4. Paybill payments (C2B)

/*
 * A Paybill payment Safaricom reports to the confirmation URL.
 *   1. The same M-Pesa receipt already recorded (a prompt's money, reported
 *      twice) changes nothing.
 *   2. A prompt sent in the last three minutes for this account and amount,
 *      still without an answer: this is that prompt's money, recorded as its
 *      callback would be.
 *   3. The account is an order number (dashes optional) of an M-Pesa order
 *      owing exactly this amount: the order is paid.
 *   4. An order that owes nothing (closed, paid, or not paid by M-Pesa): the
 *      money is held to send back.
 *   5. Anything else (no such order, a different amount): kept for Finance,
 *      flagged high.
 */
create or replace function public.rpc_payment_mpesa_paybill(
  p_callback_secret text,
  p_trans_id text,
  p_amount_kes numeric,
  p_account text,
  p_msisdn text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account text := public.fn_compact_reference(p_account);
  v_phone text := public.fn_mpesa_phone(p_msisdn);
  v_event uuid;
  v_prompt public.payment_prompt;
  v_matches integer;
  o public.order;
  p public.payment;
  v_owed bigint;
  v_result jsonb;
  v_payout uuid;
begin
  perform authz.require_daraja_callback_secret(p_callback_secret);
  if nullif(trim(p_trans_id), '') is null or length(p_trans_id) > 40
     or p_amount_kes is null or p_amount_kes <= 0 or p_amount_kes > 1000000000
     or trunc(p_amount_kes) <> p_amount_kes then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- Kept first, so a repeat is recognised and nothing is lost.
  insert into public.payment_event
    (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled)
  values (null, 'mpesa', 'mpesa.paybill', 'paybill:' || p_trans_id, nullif(v_account, ''),
          coalesce(p_payload, '{}'::jsonb), true, false)
  on conflict (provider, dedupe_key) do nothing
  returning id into v_event;
  if v_event is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  -- 1. Money already recorded through a prompt.
  if exists (select 1 from public.payment_prompt where receipt = p_trans_id)
     or exists (select 1 from public.payment where provider_receipt = p_trans_id) then
    update public.payment_event set handled = true,
           handled_note = 'already recorded from the M-Pesa prompt' where id = v_event;
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  -- 2. A prompt still waiting for its answer, for this account and amount.
  if v_account <> '' then
    select count(*) into v_matches
      from public.payment_prompt pr
      join public.payment x on x.id = pr.payment_id
      left join public.order xo on xo.id = x.order_id
     where pr.resolved_at is null and pr.sent_at > now() - interval '3 minutes'
       and ceil(x.amount_cents / 100.0) = p_amount_kes
       and (public.fn_compact_reference(xo.reference) = v_account
            or (length(v_account) >= 8 and public.fn_compact_reference(x.reference) like v_account || '%'));
    if v_matches = 1 then
      select pr.* into v_prompt
        from public.payment_prompt pr
        join public.payment x on x.id = pr.payment_id
        left join public.order xo on xo.id = x.order_id
       where pr.resolved_at is null and pr.sent_at > now() - interval '3 minutes'
         and ceil(x.amount_cents / 100.0) = p_amount_kes
         and (public.fn_compact_reference(xo.reference) = v_account
              or (length(v_account) >= 8 and public.fn_compact_reference(x.reference) like v_account || '%'));
      v_result := public.rpc_payment_mpesa_callback(
        v_prompt.checkout_request_id, 0, 'Paid (reported by the Paybill confirmation)',
        p_callback_secret, coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('source', 'paybill'),
        p_amount_kes, p_trans_id, v_phone);
      update public.payment_event
         set payment_id = v_prompt.payment_id, handled = true,
             handled_note = 'the M-Pesa prompt''s own payment, reported by Paybill'
       where id = v_event;
      return v_result || jsonb_build_object('matched', 'prompt');
    end if;
  end if;

  -- 3. An order number.
  if v_account <> '' then
    select * into o from public.order
     where public.fn_compact_reference(reference) = v_account
     for update;
  end if;

  if o.id is null then
    update public.payment_event
       set handled_note = 'Paybill payment of KES ' || p_amount_kes || ' with account "'
             || left(coalesce(p_account, ''), 30)
             || '", which is no order number. Match it to an order, or send it back, by hand.'
     where id = v_event;
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.mpesa_paybill_unmatched', p_actor_label => '[System] · payments',
      p_target_type => 'payment_event', p_target_id => v_event, p_severity => 'high',
      p_reason => 'A Paybill payment named no order.',
      p_after => jsonb_build_object('trans_id', p_trans_id, 'amount_kes', p_amount_kes,
                                    'account', left(coalesce(p_account, ''), 30)));
    return jsonb_build_object('ok', true, 'matched', false);
  end if;

  update public.payment_event set reference = o.reference where id = v_event;
  v_owed := o.total_cents
    - coalesce((select sum(x.amount_cents) from public.payment x
                 where x.order_id = o.id and x.state = 'paid'), 0);

  -- 4. Nothing owed.
  if o.stage in ('cancelled', 'refunded') or o.payment_status in ('paid', 'collected')
     or o.payment_method <> 'mpesa_stk' or v_owed <= 0 then
    v_payout := public.fn_mpesa_hold_return(
      o.id, null, (p_amount_kes * 100)::bigint, v_phone, p_trans_id,
      'Paybill payment ' || p_trans_id || ' for order ' || o.reference
        || ', which owed nothing (' || o.stage::text || ', ' || o.payment_status::text || ').');
    update public.payment_event
       set handled = true, handled_note = 'nothing owed: held to send back'
     where id = v_event;
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.mpesa_paybill_nothing_owed', p_actor_label => '[System] · payments',
      p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
      p_city_id => o.city_id, p_severity => 'high',
      p_after => jsonb_build_object('trans_id', p_trans_id, 'amount_kes', p_amount_kes,
                                    'payout_id', v_payout));
    return jsonb_build_object('ok', true, 'matched', true, 'payout_id', v_payout);
  end if;

  -- 5. Not the amount owed.
  if p_amount_kes <> ceil(v_owed / 100.0) then
    update public.payment_event
       set handled_note = 'Paybill paid KES ' || p_amount_kes || ' against KES '
             || ceil(v_owed / 100.0) || ' owed on ' || o.reference
             || '. Settle the difference, or send it back, by hand.'
     where id = v_event;
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.mpesa_paybill_unmatched', p_actor_label => '[System] · payments',
      p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
      p_city_id => o.city_id, p_severity => 'high',
      p_reason => 'A Paybill payment did not match the amount owed.',
      p_after => jsonb_build_object('trans_id', p_trans_id, 'amount_kes', p_amount_kes,
                                    'owed_cents', v_owed));
    return jsonb_build_object('ok', true, 'matched', true, 'amount_mismatch', true);
  end if;

  -- 3, settled: the order's live payment, or a new one for this money.
  select * into p from public.payment
   where order_id = o.id and state in ('pending', 'authorised')
   order by created_at desc limit 1 for update;
  if p.id is null or p.amount_cents <> v_owed then
    if p.id is not null then
      update public.payment set state = 'abandoned', updated_at = now(),
             failure_reason = 'replaced by a Paybill payment'
       where id = p.id;
    end if;
    insert into public.payment (reference, intent, order_id, merchant_id, guest_id, city_id,
      amount_cents, currency, provider, created_via)
    values (public.fn_payment_reference(), 'order', o.id, o.merchant_id, o.guest_id, o.city_id,
            v_owed, o.currency, 'mpesa', 'guest_checkout')
    returning * into p;
  elsif p.provider <> 'mpesa' then
    update public.payment set provider = 'mpesa' where id = p.id;
  end if;

  v_result := public.rpc_payment_webhook(
    p_event => 'mpesa.paybill',
    p_reference => p.reference,
    p_dedupe_key => 'paybill:' || p_trans_id || ':settle',
    p_signature_ok => true,
    p_payload => coalesce(p_payload, '{}'::jsonb),
    p_paid => true,
    p_provider_ref => p_trans_id,
    p_amount_cents => p.amount_cents,
    p_channel => 'mpesa_paybill');

  update public.payment
     set provider_receipt = p_trans_id, payer_phone = coalesce(v_phone, payer_phone)
   where id = p.id and state = 'paid';
  update public.payment_event
     set payment_id = p.id, handled = (v_result ->> 'state') = 'paid',
         handled_note = 'settled ' || p.reference
   where id = v_event;
  perform audit.log(
    p_actor_type => 'system'::public.actor_type, p_module => 'orders',
    p_action => 'payment.mpesa_paybill_settled', p_actor_label => '[System] · payments',
    p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
    p_city_id => o.city_id, p_severity => 'notice',
    p_after => jsonb_build_object('trans_id', p_trans_id, 'reference', p.reference));
  return v_result || jsonb_build_object('matched', 'order');
end;
$$;

/* Whether Paybill payments reach NexG: Safaricom accepted the confirmation URL. */
create or replace function public.fn_mpesa_paybill_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (i.health -> 'paybill' ->> 'ok')::boolean
                     from public.integration i where i.key = 'payments'), false)
$$;

/* Staff: ask Safaricom to report Paybill payments to NexG (C2B register URL). */
create or replace function public.rpc_payment_mpesa_paybill_connect()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poke jsonb;
begin
  if not (authz.is_super_admin() or authz.reaches_module('settings')) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'settings',
    p_action => 'payment.mpesa_paybill_connect', p_target_type => 'integration',
    p_target_label => 'payments', p_severity => 'high');
  v_poke := public.fn_payments_worker_poke(jsonb_build_object('action', 'register_paybill'));
  return jsonb_build_object(
    'ok', coalesce((v_poke ->> 'ok')::boolean, false),
    'message', case when (v_poke ->> 'ok')::boolean
      then 'Asked Safaricom. Its answer shows here within a few seconds.'
      else v_poke ->> 'message' end);
end;
$$;

/* The worker records Safaricom's answer to the Paybill registration. */
create or replace function public.rpc_payment_mpesa_paybill_registered(
  p_callback_secret text,
  p_ok boolean,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform authz.require_daraja_callback_secret(p_callback_secret);
  update public.integration
     set health = health || jsonb_build_object('paybill', jsonb_build_object(
           'ok', coalesce(p_ok, false), 'message', left(coalesce(p_message, ''), 500), 'at', now())),
         last_checked_at = now(), updated_at = now()
   where key = 'payments';
  perform audit.log(
    p_actor_type => 'system'::public.actor_type, p_module => 'settings',
    p_action => 'payment.mpesa_paybill_registered', p_actor_label => '[System] · payments',
    p_target_type => 'integration', p_target_label => 'payments',
    p_severity => case when p_ok then 'notice' else 'high' end::public.audit_severity,
    p_after => jsonb_build_object('ok', p_ok, 'message', left(coalesce(p_message, ''), 500)));
end;
$$;

-- ═══════════════════════════════════════ Settings → API & Webhooks

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
         'worker_url_set', exists (select 1 from vault.secrets where name = 'payments_worker_url'),
         /* Callbacks are what Safaricom sends; questions are what NexG asked. A
            run of answers with no callbacks is a callback address that is wrong. */
         'last_event_at', max(e.received_at) filter (where e.event = 'mpesa.stk.callback'),
         'last_query_at', max(e.received_at) filter (where e.event = 'mpesa.stk.query'),
         'events_30d', count(*) filter (where e.received_at > v_since and e.event = 'mpesa.stk.callback'),
         'queries_30d', count(*) filter (where e.received_at > v_since and e.event = 'mpesa.stk.query'),
         'rejected_30d', count(*) filter (where e.received_at > v_since and e.event = 'mpesa.stk.rejected'),
         'unhandled_30d', count(*) filter (where e.received_at > v_since and not e.handled),
         'prompts_30d', (select count(*) from public.payment_prompt pr where pr.sent_at > v_since),
         'answered_30d', (select count(*) from public.payment_prompt pr
                           where pr.sent_at > v_since and pr.resolved_at is not null),
         'waiting_now', (select count(*) from public.payment_prompt pr where pr.resolved_at is null),
         'paybill', (select i.health -> 'paybill' from public.integration i where i.key = 'payments'),
         'paybill_30d', count(*) filter (where e.received_at > v_since and e.event = 'mpesa.paybill'),
         'payouts_held', (select count(*) from public.mpesa_payout x where x.state = 'held'),
         'payouts_uncertain', (select count(*) from public.mpesa_payout x where x.state = 'uncertain'))
       from public.payment_event e
      where e.provider = 'mpesa'),
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

update public.integration
   set notes = 'M-Pesa through Safaricom Daraja: STK push at checkout, a worker that asks M-Pesa about any prompt left without an answer (Vault: payments_worker_url), refunds and money held for return sent by B2C once its keys are set (DARAJA_B2C_SHORTCODE, DARAJA_B2C_INITIATOR, DARAJA_B2C_SECURITY_CREDENTIAL), and Paybill payments matched by order number once Safaricom has the confirmation URL (Settings → API → Connect Paybill). Until the B2C keys are set, refunds go back by hand and are recorded in the console.'
 where key = 'payments';

-- ═══════════════════════════════════════ who may call what

revoke execute on function
  public.fn_mpesa_prompt_due(timestamptz, timestamptz),
  public.rpc_payment_mpesa_due_prompts(text, text, integer),
  public.fn_payments_worker_poke(jsonb),
  public.rpc_payment_mpesa_callback_rejected(text, text),
  public.fn_mpesa_payout_originator(),
  public.fn_mpesa_hold_return(uuid, uuid, bigint, text, text, text),
  public.fn_refund_mark_issued(uuid, text, text),
  public.rpc_refund_issued(uuid, text, jsonb),
  public.rpc_refund_send_mpesa(uuid, text),
  public.rpc_mpesa_payout_send(uuid, text),
  public.rpc_mpesa_payout_claim(text, integer),
  public.rpc_mpesa_payout_outcome(text, text, text, text, text),
  public.rpc_mpesa_payout_result(text, text, text, integer, text, text, numeric, jsonb),
  public.rpc_mpesa_payout_resolve(uuid, boolean, text, text),
  public.cron_payments_worker(),
  public.rpc_payment_mpesa_check_now(text),
  public.rpc_payment_mpesa_callback(text, integer, text, text, jsonb, numeric, text, text),
  public.rpc_payment_mpesa_paybill(text, text, numeric, text, text, jsonb),
  public.fn_mpesa_paybill_ready(),
  public.rpc_payment_mpesa_paybill_connect(),
  public.rpc_payment_mpesa_paybill_registered(text, boolean, text),
  public.rpc_api_overview()
from public, anon, authenticated;

/* Daraja and the payments worker have no session: the Vault token guards these. */
grant execute on function
  public.rpc_payment_mpesa_due_prompts(text, text, integer),
  public.rpc_payment_mpesa_callback_rejected(text, text),
  public.rpc_mpesa_payout_claim(text, integer),
  public.rpc_mpesa_payout_outcome(text, text, text, text, text),
  public.rpc_mpesa_payout_result(text, text, text, integer, text, text, numeric, jsonb),
  public.rpc_payment_mpesa_callback(text, integer, text, text, jsonb, numeric, text, text),
  public.rpc_payment_mpesa_paybill(text, text, numeric, text, text, jsonb),
  public.rpc_payment_mpesa_paybill_registered(text, boolean, text)
to anon;

/* Staff, each checked inside. */
grant execute on function
  public.rpc_refund_issued(uuid, text, jsonb),
  public.rpc_refund_send_mpesa(uuid, text),
  public.rpc_mpesa_payout_send(uuid, text),
  public.rpc_mpesa_payout_resolve(uuid, boolean, text, text),
  public.rpc_payment_mpesa_check_now(text),
  public.rpc_payment_mpesa_paybill_connect(),
  public.rpc_api_overview()
to authenticated;

/* The pay page asks whether to show the Paybill option. Reads one flag. */
grant execute on function public.fn_mpesa_paybill_ready() to anon, authenticated;

grant execute on function public.cron_payments_worker() to service_role;

insert into public.wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_payment_mpesa_due_prompts', 'The payments worker has no application session.',
   'authz.require_daraja_callback_secret verifies the private Vault token; it only stamps when a prompt was last asked about.'),
  ('rpc_payment_mpesa_callback_rejected', 'A refused Daraja callback has no session and no valid token.',
   'Writes only for a CheckoutRequestID NexG issued, once per prompt and reason, and changes no payment.'),
  ('rpc_mpesa_payout_claim', 'The payments worker has no application session.',
   'authz.require_daraja_callback_secret verifies the private Vault token before any write.'),
  ('rpc_mpesa_payout_outcome', 'The payments worker has no application session.',
   'authz.require_daraja_callback_secret verifies the private Vault token before any write.'),
  ('rpc_mpesa_payout_result', 'Daraja''s B2C result callback has no session.',
   'authz.require_daraja_callback_secret verifies the private Vault token before any write.'),
  ('rpc_payment_mpesa_paybill', 'Daraja''s C2B confirmation has no session.',
   'authz.require_daraja_callback_secret verifies the private Vault token before any write.'),
  ('rpc_payment_mpesa_paybill_registered', 'The payments worker has no application session.',
   'authz.require_daraja_callback_secret verifies the private Vault token before any write.')
on conflict (function_name) do update
  set reason = excluded.reason, guarded_by = excluded.guarded_by;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_payment_mpesa_due_prompts',
   'Only stamps when a prompt was last asked about; the answer it leads to is audited by rpc_payment_mpesa_callback.',
   'payment_prompt.last_queried_at'),
  ('rpc_mpesa_payout_claim',
   'Only marks a queued payout as taken; what Safaricom answers is audited by rpc_mpesa_payout_outcome and rpc_mpesa_payout_result.',
   'mpesa_payout.claimed_at')
on conflict (function_name) do nothing;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; the payments worker is not scheduled.';
    return;
  end if;
  /* Every minute. It calls the web app only when a prompt is due a question
     or a payout is queued, so a quiet minute costs one count. */
  perform cron.schedule('payments-worker', '* * * * *',
    $sched$select public.cron_payments_worker()$sched$);
end
$cron$;

-- ═══════════════════════════════════════ 2. unpaid online orders
--
-- Merchants have no button that starts an order; they start cooking because
-- a screen says so. Every merchant list read merchant_orders_v, which called
-- an unpaid M-Pesa order 'to_cook' ("START IT", "Start preparation", "Need
-- accepting"), and merchant_home_v counted it as open. An order paid online
-- is now 'awaiting_payment' until it is paid, and does not count as open.
-- The two views are their previous definitions with only that changed.

create or replace view public.merchant_orders_v
with (security_invoker = true) as
select
  o.id,
  o.merchant_id,
  o.reference,
  o.stage::text as stage,
  o.channel::text as channel,
  o.payment_method::text as payment_method,
  o.payment_status::text as payment_status,
  o.dropoff_label,
  b.name as store,
  o.branch_id,
  g.name as guest,
  o.placed_at,
  o.confirmed_at,
  o.promised_ready_at,
  o.ready_at,
  o.picked_up_at,
  o.delivered_at,
  o.subtotal_cents,
  o.total_cents,
  o.commission_cents,
  /* What the merchant actually keeps. The guest's total is not
     their number and showing it as one is how a statement comes as
     a surprise at the end of the week. */
  o.total_cents - coalesce(o.commission_cents, 0)
    - o.delivery_fee_cents - o.service_fee_cents as merchant_keeps_cents,
  o.currency,
  nullif(trim(coalesce(rd.first_name, '') || ' ' || coalesce(rd.last_name, '')), '') as rider,
  rd.presence::text as rider_presence,
  case
    when o.stage in ('cancelled', 'refunded') then 'closed'
    when o.stage = 'delivered' then 'done'
    /* Paid online and not paid yet: nothing to cook until it is. */
    when o.payment_method in ('mpesa_stk', 'card', 'bank_transfer')
         and o.payment_status in ('pending', 'authorised', 'failed')
         and o.stage in ('placed', 'confirmed') then 'awaiting_payment'
    when o.promised_ready_at is not null and o.ready_at is null
         and now() > o.promised_ready_at then 'you_are_late'
    when o.stage in ('placed', 'confirmed') then 'to_cook'
    when o.stage = 'preparing' then 'cooking'
    when o.stage = 'ready' and o.rider_id is null then 'waiting_for_a_rider'
    when o.stage = 'ready' then 'rider_coming'
    else 'on_the_way'
  end as what_now,
  (select count(*) from public.order_item oi
    where oi.order_id = o.id and oi.removed_at is null) as item_count,
  exists (select 1 from public.order_adjustment a
           where a.order_id = o.id and a.requires_merchant_ack
             and a.merchant_acked_at is null) as needs_your_ack
from public.order o
left join public.merchant_branch b on b.id = o.branch_id
left join public.guest g on g.id = o.guest_id
left join public.rider rd on rd.id = o.rider_id;

create or replace view public.merchant_home_v
with (security_invoker = true) as
select
  m.id as merchant_id,
  coalesce(m.trading_name, m.legal_name) as name,
  m.legal_name,
  m.category::text as category,
  m.status::text as status,
  m.status_reason,
  m.city_id,
  c.name as city,
  m.submitted_at,
  m.went_live_at,
  m.accepting_orders,
  m.accepting_orders_source::text as accepting_orders_source,
  m.busy_mode_until,
  m.explore_visible,
  m.pay_on_delivery,
  m.pay_on_delivery_cap_kes,
  m.prep_minutes,
  m.capacity_per_15min,
  m.health_band::text as health_band,
  m.health_score,
  m.featured,
  m.contact_name,
  m.contact_phone,
  m.contact_email,
  m.payout_rail,
  m.payout_account,

  (public.fn_merchant_readiness(m.id) ->> 'pct')::int as readiness_pct,
  public.fn_merchant_readiness(m.id) as readiness,

  /* The counts the header carries. Each is a thing the merchant can
     act on today, which is the only reason a number belongs there. */
  (select count(*) from public.merchant_branch b where b.merchant_id = m.id) as stores,
  (select count(*) from public.catalogue_item ci
    where ci.merchant_id = m.id and ci.available) as items_available,
  (select count(*) from public.merchant_message mm
    where mm.merchant_id = m.id and mm.direction = 'out' and mm.read_at is null)
    as unread_messages,

  /* Documents: what is still wanted, and what has gone wrong with
     what was sent. Those are different jobs and the dashboard
     separates them. */
  (select count(*) from public.fn_merchant_required_docs(m.id) rq
    where rq.essential
      and not exists (select 1 from public.document d
                       where d.owner_type = 'merchant' and d.owner_id = m.id
                         and d.requirement_id = rq.id and d.superseded_at is null))
    as documents_missing,
  (select count(*) from public.document d
    where d.owner_type = 'merchant' and d.owner_id = m.id
      and d.superseded_at is null and d.status in ('rejected', 'expired'))
    as documents_to_fix,
  (select count(*) from public.document d
    where d.owner_type = 'merchant' and d.owner_id = m.id
      and d.superseded_at is null and d.status = 'verified'
      and d.expires_at is not null and d.expires_at < current_date + 30)
    as documents_expiring,
  (select count(*) from public.document_request dr
    where dr.owner_type = 'merchant' and dr.owner_id = m.id
      and dr.fulfilled_document_id is null) as documents_asked_for,

  /* Today's trade. Null would read as nothing; zero is the truth
     on a quiet morning and the dashboard says which. An order still
     waiting for its online payment is not trade yet. */
  (select count(*) from public.order o
    where o.merchant_id = m.id and o.placed_at::date = current_date
      and not (o.payment_method in ('mpesa_stk', 'card', 'bank_transfer')
               and o.payment_status in ('pending', 'authorised', 'failed')
               and o.stage in ('placed', 'confirmed'))) as orders_today,
  (select count(*) from public.order o
    where o.merchant_id = m.id
      and o.stage not in ('delivered', 'cancelled', 'refunded')
      and not (o.payment_method in ('mpesa_stk', 'card', 'bank_transfer')
               and o.payment_status in ('pending', 'authorised', 'failed')
               and o.stage in ('placed', 'confirmed'))) as orders_open,
  (select coalesce(sum(o.total_cents - o.commission_cents), 0) from public.order o
    where o.merchant_id = m.id and o.placed_at::date = current_date
      and o.stage = 'delivered') as earned_today_cents,

  /* The one in force, and whether this merchant has signed it.
     Only a published version counts — a draft nobody has issued is
     not something to chase anybody about. */
  (select mt.version from public.merchant_terms_version mt
    where mt.status = 'current' and mt.effective_from <= current_date
    order by mt.effective_from desc limit 1) as current_terms,
  exists (select 1 from public.merchant_terms_version mtv
           where mtv.status = 'current' and mtv.effective_from <= current_date
             and not exists (select 1 from public.merchant_terms_acceptance ma
                              where ma.merchant_id = m.id and ma.terms_version_id = mtv.id))
    as terms_to_accept,

  (select b.status::text from public.featured_booking b
    where b.merchant_id = m.id and b.status in ('live', 'booked', 'requested', 'quoted')
    order by b.requested_at desc limit 1) as featured_state
from public.merchant m
join public.city c on c.id = m.city_id;

/*
 * An M-Pesa order nobody paid closes itself: thirty minutes after it was
 * placed, once M-Pesa has answered every prompt sent for it and no prompt
 * has gone out in that time. An order with a prompt M-Pesa has not answered
 * is left alone, because that prompt could still be money; the worker keeps
 * asking, and staff can ask too. Nothing was charged, and the guest is told
 * so by the cancellation notice.
 */
create or replace function public.cron_expire_unpaid_mpesa_orders()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  v_count integer := 0;
begin
  for o in
    select ord.id, ord.reference, ord.city_id
      from public.order ord
     where ord.payment_method = 'mpesa_stk'
       and ord.payment_status in ('pending', 'authorised', 'failed')
       and ord.stage = 'placed'
       and ord.placed_at < now() - interval '30 minutes'
       and not exists (select 1 from public.payment p
                        where p.order_id = ord.id and p.state = 'paid')
       and not exists (select 1 from public.payment_prompt pr
                         join public.payment p on p.id = pr.payment_id
                        where p.order_id = ord.id
                          and (pr.resolved_at is null or pr.sent_at > now() - interval '30 minutes'))
     order by ord.placed_at
     limit 200
     for update of ord skip locked
  loop
    update public.payment
       set state = 'abandoned', updated_at = now(),
           failure_reason = coalesce(failure_reason, 'not paid within 30 minutes')
     where order_id = o.id and state in ('pending', 'authorised', 'failed');

    update public.order
       set stage = 'cancelled', cancelled_at = now(), cancel_reason_code = 'unpaid',
           cancel_note = 'Not paid by M-Pesa within 30 minutes. Nothing was charged.'
     where id = o.id;

    update dispatch.job
       set state = 'cancelled', ended_at = now(), end_reason = 'unpaid'
     where order_id = o.id and state not in ('completed', 'cancelled');
    update dispatch.offer set outcome = 'withdrawn', responded_at = now()
     where outcome = 'pending'
       and job_id in (select id from dispatch.job where order_id = o.id);

    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, payload)
    values (o.id, 'unpaid_expired', 'Closed: not paid',
            'M-Pesa had no payment for this order 30 minutes after it was placed. Nothing was charged.',
            'system', '[System] · payments', '{}'::jsonb);

    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'order.unpaid_expired', p_actor_label => '[System] · payments',
      p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
      p_city_id => o.city_id, p_severity => 'notice');
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'expired', v_count);
end;
$$;

revoke execute on function public.cron_expire_unpaid_mpesa_orders() from public, anon, authenticated;
grant execute on function public.cron_expire_unpaid_mpesa_orders() to service_role;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; unpaid orders do not expire on a schedule.';
    return;
  end if;
  perform cron.schedule('payments-expire-unpaid', '*/5 * * * *',
    $sched$select public.cron_expire_unpaid_mpesa_orders()$sched$);
end
$cron$;
