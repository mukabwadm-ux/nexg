-- Paystack, refunds (Paystack slice 6; owner, 22 Nov 2026: "Yes, refunds next").
--
-- Money paid through Paystack goes back through Paystack, to the card or the
-- M-Pesa number it came from:
--   * an order refund, once approved (two people where the rules need it);
--   * a cancelled stay, for what its cancellation policy gives back;
--   * a booking payment the booking engine refused (the hold ran out).
-- Staff press "Refund through Paystack" in the admin console. The console
-- opens a paystack_refund here (our reference, so Paystack never refunds
-- twice), asks Paystack, and records Paystack's first answer. Only Paystack's
-- signed refund.processed message marks the refund issued, through the
-- functions that already did so for refunds sent by hand: fn_refund_mark_issued
-- for orders (which posts it to the ledger), and the stay refund record (whose
-- trigger posts it). A failed or needs-attention refund is left for Finance,
-- with a high-severity audit entry.
--
-- Builds on 20270215000400 (stay cancellation policies).

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('payment.paystack_refund_started', 'orders', 'notice', true, 'A refund was sent to Paystack'),
  ('payment.paystack_refund_failed', 'orders', 'high', true,
   'Paystack could not complete a refund; Finance must look at it')
on conflict (action) do nothing;

create table public.paystack_refund (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('order', 'stay', 'booking')),
  refund_id uuid references public.refund (id) on delete restrict,
  stay_id uuid references public.stay (id) on delete restrict,
  payment_id uuid not null references public.payment (id) on delete restrict,
  reference text not null unique check (reference ~ '^NXR-[A-Za-z0-9-]{8,60}$'),
  amount_cents bigint not null check (amount_cents > 0),
  is_test boolean not null,
  paystack_refund_id text,
  state text not null default 'opened'
    check (state in ('opened', 'pending', 'processing', 'processed', 'failed', 'needs-attention')),
  failure_reason text,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paystack_refund_points_at_one_thing check (
    (kind = 'order' and refund_id is not null and stay_id is null)
    or (kind = 'stay' and stay_id is not null and refund_id is null)
    or (kind = 'booking' and refund_id is null and stay_id is null))
);

comment on table public.paystack_refund is
  'Refunds sent back through Paystack, under NexG''s own reference. Issued only on Paystack''s signed refund.processed.';

-- One refund at Paystack per thing at a time (a failed one can be tried again).
create unique index paystack_refund_one_live on public.paystack_refund
  (kind, coalesce(refund_id, stay_id, payment_id))
  where state not in ('failed');

alter table public.paystack_refund enable row level security;
revoke all on public.paystack_refund from public, anon, authenticated;

-- ────────────────────────────────── staff open a refund through Paystack

/*
 * p_kind 'order' (p_target: the refund), 'stay' (the stay) or 'booking' (the
 * payment). Checks the staff member may refund it and that the money came in
 * through Paystack; answers what the console sends to Paystack: our reference,
 * Paystack's transaction, the amount, and test or live. Asking again while one
 * is open answers the same refund, so a double press never refunds twice.
 */
create function public.rpc_paystack_refund_open(p_kind text, p_target uuid, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_mode text := authz.paystack_mode(p_proof);
  p public.payment;
  r public.refund;
  s public.stay;
  x public.paystack_refund;
  v_amount bigint;
  v_city uuid;
  v_ref text;
begin
  if v_staff is null then
    raise exception 'Staff only.' using errcode = '42501';
  end if;
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;

  if p_kind = 'order' then
    select * into r from public.refund where id = p_target;
    if not found or r.status <> 'approved' then
      raise exception 'That refund is not approved and waiting to be sent.' using errcode = '22023';
    end if;
    if r.method <> 'original' then
      raise exception 'This refund goes by %, not back to the original payment.',
        replace(r.method, '_', ' ') using errcode = '22023';
    end if;
    select city_id into v_city from public.order where id = r.order_id;
    perform public.fn_payments_require(v_city, 'record a refund');
    select * into p from public.payment
     where order_id = r.order_id and state = 'paid' order by paid_at desc limit 1;
    v_amount := r.amount_cents;
  elsif p_kind = 'stay' then
    if not authz.works_hospitality(null) then
      raise exception 'Hospitality staff only.' using errcode = '42501';
    end if;
    select * into s from public.stay where id = p_target;
    if not found or s.refund_due_at is null or s.refunded_at is not null then
      raise exception 'That stay has no refund due.' using errcode = '22023';
    end if;
    select * into p from public.payment
     where stay_id = s.id and state = 'paid' order by paid_at desc limit 1;
    v_amount := ledger.from_kes(coalesce(s.refund_amount_kes, s.paid_kes));
  elsif p_kind = 'booking' then
    select * into p from public.payment where id = p_target and state = 'paid';
    if not found or p.customer_engine_booking_id is null or p.engine_settle_error is null then
      raise exception 'That booking payment is not waiting for a refund.' using errcode = '22023';
    end if;
    perform public.fn_payments_require(p.city_id, 'record a refund');
    v_amount := p.amount_cents;
  else
    raise exception 'Refund an order, a stay or a booking.' using errcode = '22023';
  end if;

  if p.id is null or p.provider <> 'paystack' or p.provider_ref is null then
    raise exception 'This was not paid through Paystack. Send it back by M-Pesa or bank and record it.'
      using errcode = '22023';
  end if;
  if p.is_test <> (v_mode = 'test') then
    raise exception 'This was paid in the other Paystack mode.' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 or v_amount > p.amount_cents then
    raise exception 'The refund must be more than nothing and no more than was paid.' using errcode = '22023';
  end if;

  select * into x from public.paystack_refund
   where kind = p_kind and state <> 'failed'
     and coalesce(refund_id, stay_id, payment_id) = case p_kind when 'order' then r.id
                                                               when 'stay' then s.id else p.id end;
  if x.id is not null then
    return jsonb_build_object('ok', true, 'reused', true, 'reference', x.reference, 'state', x.state,
      'transaction', p.provider_ref, 'amount_cents', x.amount_cents, 'is_test', x.is_test,
      'sent', x.paystack_refund_id is not null);
  end if;

  v_ref := 'NXR-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.paystack_refund (kind, refund_id, stay_id, payment_id, reference, amount_cents, is_test, created_by)
  values (p_kind, r.id, s.id, p.id, v_ref, v_amount, p.is_test, v_staff)
  returning * into x;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_actor_id => v_staff, p_module => 'orders',
    p_action => 'payment.paystack_refund_started', p_target_type => 'payment', p_target_id => p.id,
    p_city_id => p.city_id,
    p_after => jsonb_build_object('kind', p_kind, 'reference', v_ref, 'amount_cents', v_amount, 'test', p.is_test));

  return jsonb_build_object('ok', true, 'reused', false, 'reference', v_ref, 'state', 'opened',
    'transaction', p.provider_ref, 'amount_cents', v_amount, 'is_test', p.is_test, 'sent', false);
end;
$$;

revoke execute on function public.rpc_paystack_refund_open(text, uuid, text) from public, anon;
grant execute on function public.rpc_paystack_refund_open(text, uuid, text) to authenticated;

-- ─────────────────────────────── what Paystack says about a refund, once

/*
 * Shared by the console's record of Paystack's first answer and Paystack's
 * webhook. p_data is Paystack's refund object. Only 'processed' issues it.
 */
create function public.fn_paystack_refund_apply(p_mode text, p_data jsonb, p_source text)
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
begin
  select * into x from public.paystack_refund
   where (v_ref is not null and reference = v_ref)
      or (v_id is not null and paystack_refund_id = v_id)
   order by created_at desc limit 1
   for update;
  if not found then
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

/*
 * The console records Paystack's answer to the refund request (or to a later
 * "check with Paystack"). The answer is not signed, so the proof is the key.
 */
create function public.rpc_paystack_refund_answered(p_reference text, p_answer text, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := authz.paystack_mode(p_proof);
  v_body jsonb;
  v_data jsonb;
begin
  if authz.staff_id() is null then
    raise exception 'Staff only.' using errcode = '42501';
  end if;
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  begin
    v_body := p_answer::jsonb;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'unreadable');
  end;
  v_data := v_body->'data';
  if (v_body->>'status') is distinct from 'true' or jsonb_typeof(v_data) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'reason', 'refused', 'message', left(v_body->>'message', 300));
  end if;
  -- Paystack's refund object names our reference; make sure it is this one.
  v_data := v_data || jsonb_build_object('refund_reference', p_reference);
  return public.fn_paystack_refund_apply(v_mode, v_data, 'console');
end;
$$;

revoke execute on function public.rpc_paystack_refund_answered(text, text, text) from public, anon;
grant execute on function public.rpc_paystack_refund_answered(text, text, text) to authenticated;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_paystack_refund_answered',
   'Records Paystack''s answer about a refund; issuing and failures are audited in fn_paystack_refund_apply.',
   'paystack_refund; audit payment.paystack_refund_failed, order.refund_issued, stay.refunded')
on conflict (function_name) do nothing;

-- ─────────────── Paystack's webhook, now also for refunds (else as before)

create or replace function public.rpc_payment_paystack_webhook(p_raw_body text, p_signature text)
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
  if jsonb_typeof(v_payload->'data') is distinct from 'object' then
    return jsonb_build_object('ok', true, 'ignored', true);
  end if;
  if v_event in ('charge.success', 'charge.failed') then
    return public.fn_paystack_apply(v_mode, v_event, v_payload->'data', v_payload);
  end if;
  if v_event in ('refund.pending', 'refund.processing', 'refund.processed', 'refund.failed',
                 'refund.needs-attention') then
    return public.fn_paystack_refund_apply(v_mode,
      v_payload->'data' || jsonb_build_object('status', coalesce(v_payload#>>'{data,status}',
                                                                  split_part(v_event, '.', 2))),
      'webhook');
  end if;
  return jsonb_build_object('ok', true, 'ignored', true);
end;
$$;

-- ──────────────── a refund of test money posts nothing, as its sale did not

-- As 20260101015500, plus: an order paid with Paystack test keys posted no
-- sale (20270129000200), so its refunds post nothing either.
create or replace function public.tg_refund_posts_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.payment p
              where p.order_id = new.order_id and p.is_test
                and p.state in ('paid', 'reversed')) then
    return new;
  end if;
  if new.status = 'approved' and (old is null or old.status is distinct from 'approved') then
    perform ledger.fn_post_refund_approved(new.id);
  elsif new.status = 'issued' and (old is null or old.status is distinct from 'issued') then
    perform ledger.fn_post_refund_issued(new.id);
  end if;
  return new;
end;
$$;
