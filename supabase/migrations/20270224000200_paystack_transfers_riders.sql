-- Paystack transfers, riders first (payouts slice R2a; owner, 23 Nov 2026:
-- "Yes, build R2"). NexG sends a rider's money out of its Paystack balance to
-- the rider's M-Pesa number ("manual" transfers: immediately, when Finance
-- presses pay). The first use is riders' early cash-out requests, which until
-- now Finance paid by hand and recorded with an M-Pesa reference.
--
--   paystack_recipient  Paystack's code for a payee's M-Pesa number, per mode,
--                       created once and reused.
--   paystack_transfer   one transfer under NexG's own reference (NXT-...), so a
--                       second press or a retry never pays twice.
--
-- The money, live mode only (test transfers move no money and post nothing):
--   sent      Dr payable.rider (the rider)   Cr clearing.b2c_in_flight
--             so the payout run cannot pay the same money again;
--   success   Dr clearing.b2c_in_flight      Cr cash.card_processor_receivable
--             (Paystack's balance, where Paystack collections sit);
--   failed or reversed: the sent posting is reversed, the money is the
--             rider's again, and the request goes back to Finance to retry.
-- Paid is decided only by Paystack's signed transfer.success, or a transfer
-- answer this server fetched with the key.
--
-- Test transfers only to riders marked accepts_test_payouts, as test payments
-- only at test shops (20270129000200): a real rider is never "paid" with test
-- money.
--
-- Changes to an existing function: rpc_payment_paystack_webhook (latest in
-- 20270222000400) also handles transfer.success, transfer.failed and
-- transfer.reversed; everything else in it is unchanged.

-- ═════════════════════════════════════════════════════════ 1. tables

alter table public.rider add column if not exists accepts_test_payouts boolean not null default false;
comment on column public.rider.accepts_test_payouts is
  'A test rider: payouts to them may go through Paystack''s test keys, which move no money.';

create table public.paystack_recipient (
  id uuid primary key default gen_random_uuid(),
  party_type ledger.party_kind not null,
  party_id uuid not null,
  is_test boolean not null,
  destination text not null,
  recipient_code text not null check (recipient_code ~ '^RCP_[A-Za-z0-9]{4,60}$'),
  created_at timestamptz not null default now(),
  unique (party_type, party_id, is_test, destination)
);
comment on table public.paystack_recipient is
  'Paystack''s recipient code for a payee''s M-Pesa number, per mode. Created once, reused for every transfer.';
alter table public.paystack_recipient enable row level security;
revoke all on public.paystack_recipient from public, anon, authenticated;

create table public.paystack_transfer (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^NXT-[a-z0-9]{8,60}$'),
  kind text not null check (kind in ('rider_early')),
  party_type ledger.party_kind not null,
  party_id uuid not null,
  source_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  is_test boolean not null,
  destination text not null,
  account_name text,
  recipient_code text,
  transfer_code text,
  state text not null default 'opened'
    check (state in ('opened', 'pending', 'otp', 'success', 'failed', 'reversed')),
  failure_reason text,
  sent_txn uuid,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
comment on table public.paystack_transfer is
  'Money sent out of NexG''s Paystack balance, under NexG''s own reference. Paid only on Paystack''s signed transfer.success.';

-- One transfer at a time for the same thing (a failed or reversed one can be tried again).
create unique index paystack_transfer_one_live on public.paystack_transfer (kind, source_id)
  where state not in ('failed', 'reversed');
create index paystack_transfer_by_party on public.paystack_transfer (party_type, party_id, created_at desc);

alter table public.paystack_transfer enable row level security;
revoke all on public.paystack_transfer from public, anon, authenticated;

/* What Finance sees of the transfers: no recipient codes. */
create view public.paystack_transfer_v
with (security_invoker = false) as
  select t.id, t.reference, t.kind, t.party_type, t.party_id, t.source_id, t.amount_cents,
         t.is_test, t.destination, t.state, t.failure_reason, t.transfer_code,
         t.created_at, t.updated_at, t.completed_at
    from public.paystack_transfer t
   where authz.finance_reads();
revoke all on public.paystack_transfer_v from public, anon;
grant select on public.paystack_transfer_v to authenticated;

-- ═════════════════════════════════════════════ 2. Finance opens a transfer

/*
 * p_kind 'rider_early' (p_source: an approved early payout request). Checks
 * Finance may pay it; answers what the console sends to Paystack: our
 * reference, the amount, the M-Pesa number and name, and Paystack's recipient
 * code when this number already has one in this mode. Asking again while one
 * is open answers the same transfer, so a double press never pays twice.
 */
create function public.rpc_paystack_transfer_open(p_kind text, p_source uuid, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_mode text := authz.paystack_mode(p_proof);
  q public.rider_payout_request;
  r public.rider;
  x public.paystack_transfer;
  v_name text;
  v_recipient text;
  v_ref text;
  v_txn uuid;
begin
  if v_staff is null or not authz.has_full_finance() then
    raise exception 'Only finance can send payouts.' using errcode = '42501';
  end if;
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  if p_kind is distinct from 'rider_early' then
    raise exception 'Pay a rider''s early payout request.' using errcode = '22023';
  end if;

  select * into x from public.paystack_transfer
   where kind = p_kind and source_id = p_source and state not in ('failed', 'reversed');
  if x.id is not null then
    return jsonb_build_object('ok', true, 'reused', true, 'sent', x.state <> 'opened',
      'reference', x.reference, 'state', x.state, 'amount_cents', x.amount_cents,
      'destination', x.destination, 'name', x.account_name, 'test', x.is_test,
      'recipient_code', x.recipient_code);
  end if;

  select * into q from public.rider_payout_request where id = p_source for update;
  if not found or q.status <> 'approved' then
    raise exception 'That request is not approved and waiting to be paid.' using errcode = '22023';
  end if;
  select * into r from public.rider where id = q.rider_id;
  if v_mode = 'test' and not r.accepts_test_payouts then
    raise exception 'Paystack is in test mode, which pays nobody: only a test rider can be paid with it. Pay this rider by M-Pesa and record it, or switch Paystack to live.'
      using errcode = '22023', hint = 'test_mode_real_rider';
  end if;
  if public.fn_kenyan_msisdn(q.payout_msisdn) is null then
    raise exception 'The payout number on the request is not a Kenyan M-Pesa number.' using errcode = '22023';
  end if;

  v_name := coalesce(nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
                     'NexG rider');
  select recipient_code into v_recipient from public.paystack_recipient
   where party_type = 'rider' and party_id = r.id and is_test = (v_mode = 'test')
     and destination = public.fn_kenyan_msisdn(q.payout_msisdn);

  v_ref := 'NXT-' || replace(gen_random_uuid()::text, '-', '');

  /* Live money leaves the rider's balance as it is sent, so no run pays it again. */
  if v_mode = 'live' then
    v_txn := ledger.post(
      p_kind => 'payout_sent',
      p_idempotency_key => 'payout_sent:' || v_ref,
      p_entries => jsonb_build_array(
        jsonb_build_object('account', 'payable.rider', 'party_type', 'rider', 'party_id', r.id,
          'debit', ledger.from_kes(q.amount_kes), 'memo', v_ref),
        jsonb_build_object('account', 'clearing.b2c_in_flight', 'credit', ledger.from_kes(q.amount_kes),
          'memo', v_ref)),
      p_city_id => r.city_id,
      p_actor_kind => 'staff',
      p_actor_id => v_staff,
      p_reason_text => 'Early payout through Paystack');
  end if;

  insert into public.paystack_transfer (reference, kind, party_type, party_id, source_id, amount_cents,
    is_test, destination, account_name, recipient_code, sent_txn, created_by)
  values (v_ref, p_kind, 'rider', r.id, q.id, ledger.from_kes(q.amount_kes), v_mode = 'test',
    public.fn_kenyan_msisdn(q.payout_msisdn), v_name, v_recipient, v_txn, v_staff)
  returning * into x;

  perform audit.log('staff'::public.actor_type, 'finance', 'payout.paystack_transfer_opened',
    p_target_type => 'rider', p_target_id => r.id, p_city_id => r.city_id,
    p_after => jsonb_build_object('reference', v_ref, 'amount_kes', q.amount_kes,
      'request_id', q.id, 'test', v_mode = 'test'));

  return jsonb_build_object('ok', true, 'reused', false, 'sent', false, 'reference', v_ref,
    'state', 'opened', 'amount_cents', x.amount_cents, 'destination', x.destination,
    'name', v_name, 'test', x.is_test, 'recipient_code', v_recipient);
end;
$$;
revoke execute on function public.rpc_paystack_transfer_open(text, uuid, text) from public, anon;
grant execute on function public.rpc_paystack_transfer_open(text, uuid, text) to authenticated;

-- ═══════════════════════════════════════ 3. what Paystack says, applied once

create function public.fn_paystack_transfer_apply(p_mode text, p_data jsonb, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.paystack_transfer;
  q public.rider_payout_request;
  v_status text := lower(coalesce(p_data->>'status', ''));
  v_ref text := nullif(p_data->>'reference', '');
  v_code text := nullif(p_data->>'transfer_code', '');
  v_adj uuid;
begin
  if v_ref is not null then
    select * into x from public.paystack_transfer where reference = v_ref for update;
  elsif v_code is not null then
    select * into x from public.paystack_transfer where transfer_code = v_code for update;
  end if;
  if x.id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_transfer');
  end if;
  if x.is_test <> (p_mode = 'test') then
    return jsonb_build_object('ok', false, 'reason', 'mode_mismatch');
  end if;
  if x.state in ('success', 'failed', 'reversed') and v_status = x.state then
    return jsonb_build_object('ok', true, 'duplicate', true, 'state', x.state);
  end if;
  if x.state in ('failed', 'reversed') then
    /* Finished and given back; a late message changes nothing. */
    return jsonb_build_object('ok', true, 'ignored', true, 'state', x.state);
  end if;
  if v_status = 'success' and jsonb_typeof(p_data->'amount') = 'number'
     and (p_data->>'amount')::numeric <> x.amount_cents then
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;

  if v_status in ('pending', 'received', 'processing', 'queued') then
    update public.paystack_transfer
       set state = 'pending', transfer_code = coalesce(transfer_code, v_code), updated_at = now()
     where id = x.id and state in ('opened', 'otp');
    return jsonb_build_object('ok', true, 'state', 'pending');
  elsif v_status = 'otp' then
    update public.paystack_transfer
       set state = 'otp', transfer_code = coalesce(transfer_code, v_code), updated_at = now()
     where id = x.id;
    return jsonb_build_object('ok', true, 'state', 'otp');
  elsif v_status = 'success' then
    if x.state = 'success' then
      return jsonb_build_object('ok', true, 'duplicate', true, 'state', 'success');
    end if;
    update public.paystack_transfer
       set state = 'success', transfer_code = coalesce(transfer_code, v_code),
           completed_at = now(), updated_at = now()
     where id = x.id;

    if not x.is_test then
      perform ledger.post(
        p_kind => 'payout_paid',
        p_idempotency_key => 'payout_paid:' || x.reference,
        p_entries => jsonb_build_array(
          jsonb_build_object('account', 'clearing.b2c_in_flight', 'debit', x.amount_cents, 'memo', x.reference),
          jsonb_build_object('account', 'cash.card_processor_receivable', 'credit', x.amount_cents,
            'memo', x.reference)),
        p_actor_label => '[System] · Paystack',
        p_reason_text => 'Paystack transfer succeeded');
    end if;

    if x.kind = 'rider_early' then
      select * into q from public.rider_payout_request where id = x.source_id for update;
      if q.status = 'approved' then
        /* As a payment Finance records by hand (20270115000500): the weekly run
           of the old rider tables takes it off through the adjustment. */
        insert into public.rider_adjustment (rider_id, kind, amount_kes, reason, created_by, approved_by)
        values (q.rider_id, 'early_payout', -q.amount_kes,
                'Early payout ' || coalesce(v_code, x.reference) || ' (Paystack)',
                x.created_by, q.decided_by)
        returning id into v_adj;
        update public.rider_payout_request
           set status = 'paid', paid_at = now(), provider_ref = left(coalesce(v_code, x.reference), 64),
               adjustment_id = v_adj
         where id = q.id;
      end if;
    end if;

    perform audit.log('system'::public.actor_type, 'finance', 'payout.paystack_transfer_paid',
      p_actor_label => '[System] · Paystack', p_target_type => 'rider', p_target_id => x.party_id,
      p_after => jsonb_build_object('reference', x.reference, 'amount_cents', x.amount_cents,
        'test', x.is_test, 'source', p_source));
    return jsonb_build_object('ok', true, 'state', 'success');
  elsif v_status in ('failed', 'reversed', 'abandoned', 'rejected') then
    update public.paystack_transfer
       set state = case when v_status = 'reversed' then 'reversed' else 'failed' end,
           transfer_code = coalesce(transfer_code, v_code),
           failure_reason = left(coalesce(nullif(p_data->>'reason', ''), nullif(p_data->>'gateway_response', ''),
                                          nullif(p_data->>'message', ''), v_status), 300),
           completed_at = now(), updated_at = now()
     where id = x.id;

    /* The money is the rider's again: undo what was taken off when it was sent,
       and after a reversal also what was settled from the Paystack balance. */
    if not x.is_test then
      if x.state = 'success' then
        perform ledger.post(
          p_kind => 'payout_reversed',
          p_idempotency_key => 'payout_reversed:' || x.reference,
          p_entries => jsonb_build_array(
            jsonb_build_object('account', 'cash.card_processor_receivable', 'debit', x.amount_cents,
              'memo', x.reference),
            jsonb_build_object('account', 'payable.rider', 'party_type', 'rider', 'party_id', x.party_id,
              'credit', x.amount_cents, 'memo', x.reference)),
          p_actor_label => '[System] · Paystack',
          p_reason_text => 'Paystack transfer reversed');
      elsif x.sent_txn is not null then
        perform ledger.post(
          p_kind => 'payout_returned',
          p_idempotency_key => 'payout_returned:' || x.reference,
          p_entries => jsonb_build_array(
            jsonb_build_object('account', 'clearing.b2c_in_flight', 'debit', x.amount_cents, 'memo', x.reference),
            jsonb_build_object('account', 'payable.rider', 'party_type', 'rider', 'party_id', x.party_id,
              'credit', x.amount_cents, 'memo', x.reference)),
          p_actor_label => '[System] · Paystack',
          p_reason_text => 'Paystack transfer failed');
      end if;
    end if;

    if x.kind = 'rider_early' then
      select * into q from public.rider_payout_request where id = x.source_id for update;
      if q.status = 'paid' and v_status = 'reversed' then
        /* The rider was told it was paid; it came back. Back to Finance. */
        delete from public.rider_adjustment where id = q.adjustment_id;
        update public.rider_payout_request
           set status = 'approved', paid_at = null, provider_ref = null, adjustment_id = null
         where id = q.id;
      end if;
    end if;

    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'finance',
      p_action => 'payout.paystack_transfer_failed', p_actor_label => '[System] · Paystack',
      p_target_type => 'rider', p_target_id => x.party_id, p_severity => 'high',
      p_reason => 'Paystack could not complete this payout.',
      p_after => jsonb_build_object('reference', x.reference, 'status', v_status, 'source', p_source));
    return jsonb_build_object('ok', true, 'state', case when v_status = 'reversed' then 'reversed' else 'failed' end);
  end if;

  return jsonb_build_object('ok', true, 'ignored', true, 'status', v_status);
end;
$$;
revoke execute on function public.fn_paystack_transfer_apply(text, jsonb, text)
  from public, anon, authenticated, service_role;

/*
 * The console records Paystack's answers: p_step 'recipient' (the recipient it
 * created for the number) or 'transfer' (the transfer, or a later check). The
 * answers are not signed, so the proof is the key.
 */
create function public.rpc_paystack_transfer_answered(
  p_reference text, p_step text, p_answer text, p_proof text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := authz.paystack_mode(p_proof);
  v_body jsonb;
  v_data jsonb;
  x public.paystack_transfer;
  v_code text;
begin
  if authz.staff_id() is null or not authz.has_full_finance() then
    raise exception 'Only finance can send payouts.' using errcode = '42501';
  end if;
  if v_mode is null then
    raise exception 'Paystack verification failed.' using errcode = '42501';
  end if;
  select * into x from public.paystack_transfer where reference = p_reference;
  if not found then
    raise exception 'No such payout.' using errcode = '22023';
  end if;
  if x.is_test <> (v_mode = 'test') then
    raise exception 'That payout was opened in the other Paystack mode.' using errcode = '22023';
  end if;
  begin
    v_body := p_answer::jsonb;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'unreadable');
  end;
  v_data := v_body->'data';

  if p_step = 'recipient' then
    v_code := v_data->>'recipient_code';
    if (v_body->>'status') is distinct from 'true' or v_code !~ '^RCP_[A-Za-z0-9]{4,60}$' then
      return public.fn_paystack_transfer_apply(v_mode,
        jsonb_build_object('reference', x.reference, 'status', 'failed',
          'reason', coalesce(nullif(v_body->>'message', ''), 'Paystack did not accept the M-Pesa number.')),
        'console');
    end if;
    insert into public.paystack_recipient (party_type, party_id, is_test, destination, recipient_code)
    values (x.party_type, x.party_id, x.is_test, x.destination, v_code)
    on conflict (party_type, party_id, is_test, destination)
      do update set recipient_code = excluded.recipient_code;
    update public.paystack_transfer set recipient_code = v_code, updated_at = now() where id = x.id;
    return jsonb_build_object('ok', true, 'recipient_code', v_code);
  elsif p_step = 'transfer' then
    if (v_body->>'status') is distinct from 'true' or jsonb_typeof(v_data) is distinct from 'object' then
      /* Sent again after an answer that never arrived: the first one may have
         gone through. Not a failure; Paystack's signed word settles it. */
      if coalesce(v_body->>'message', '') ~* 'duplicate|already' then
        update public.paystack_transfer set state = 'pending', updated_at = now()
         where id = x.id and state = 'opened';
        return jsonb_build_object('ok', true, 'state', 'pending', 'duplicate_reference', true);
      end if;
      return public.fn_paystack_transfer_apply(v_mode,
        jsonb_build_object('reference', x.reference, 'status', 'failed',
          'reason', coalesce(nullif(v_body->>'message', ''), 'Paystack refused the transfer.')),
        'console');
    end if;
    -- Paystack's transfer names our reference; make sure it is this one.
    return public.fn_paystack_transfer_apply(v_mode, v_data || jsonb_build_object('reference', x.reference),
      'console');
  end if;
  raise exception 'Step is recipient or transfer.' using errcode = '22023';
end;
$$;
revoke execute on function public.rpc_paystack_transfer_answered(text, text, text, text) from public, anon;
grant execute on function public.rpc_paystack_transfer_answered(text, text, text, text) to authenticated;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_paystack_transfer_answered',
   'Records Paystack''s answers about a payout; paid and failed are audited in fn_paystack_transfer_apply.',
   'paystack_transfer; audit payout.paystack_transfer_paid, payout.paystack_transfer_failed')
on conflict (function_name) do nothing;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('payout.paystack_transfer_opened', 'finance', 'notice', false, false, true, '{}',
   'Finance sent a payout through Paystack'),
  ('payout.paystack_transfer_paid', 'finance', 'notice', false, false, true, '{}',
   'Paystack confirmed a payout reached the payee'),
  ('payout.paystack_transfer_failed', 'finance', 'high', true, false, true, '{}',
   'A payout through Paystack failed or was reversed; the money is the payee''s again')
on conflict (action) do nothing;

-- ═══════════════════ 4. Paystack's webhook, now also for transfers (else as before)

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
  if v_event in ('transfer.success', 'transfer.failed', 'transfer.reversed') then
    return public.fn_paystack_transfer_apply(v_mode,
      v_payload->'data' || jsonb_build_object('status', split_part(v_event, '.', 2)),
      'webhook');
  end if;
  return jsonb_build_object('ok', true, 'ignored', true);
end;
$$;
