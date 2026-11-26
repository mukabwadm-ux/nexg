-- Cancel and refund a paid stay in full, Paystack's refund notices as Paystack
-- documents them, and unpaid orders with a Paystack try still in progress
-- (owner, 26 Nov 2026: "Yes, build both"). Paystack test mode only; nothing
-- here switches anything on.
--
-- In this migration:
--
--  1. rpc_stay_cancel_refund_full: hospitality staff cancel a paid NexG stay and
--     owe the guest everything paid, whatever the cancellation policy says. A
--     repeat changes nothing.
--  2. rpc_stay_refunds also says how each stay was paid (provider, test or
--     live) and where its Paystack refund stands.
--  3. rpc_stay_paid_bookings: the booked and in-stay NexG stays that have been
--     paid, for the console's cancel button.
--  4. fn_paystack_refund_apply: Paystack's documented refund webhooks name the
--     transaction, not our refund reference, and often send the amount as a
--     string, so no notice matched. Matched now by our reference, else by
--     Paystack's refund id, else (webhook only) by the settled transaction and
--     the amount, when exactly one refund fits. Anything else changes nothing and
--     is audited as payment.paystack_refund_unmatched. A processed refund for a
--     stay already recorded refunded another way is audited as
--     stay.refund_possible_double (saying so when the host's split share may
--     have gone twice). One matched by its transaction while an equal try is
--     marked failed is audited as payment.paystack_refund_after_failed_try.
--  5. cron_expire_unpaid_mpesa_orders leaves an order open while a Paystack try
--     for it is still in progress; an abandoned one still closes, and an order
--     that had a Paystack try is not told nothing was charged.
--  6. payment_paystack_after_close: Paystack money arriving for a closed order is
--     written on the order and audited for a person to refund. No money moves.
--  7. The native stay checkout and the guest's stay list say when a stay was
--     refunded (and the checkout, when NexG cancelled it after booking it).
--  8. rpc_stay_paystack_refund_checked: staff record what the Paystack dashboard
--     shows for the stay's refund on their screen, processed or failed.
--     rpc_stay_refund_record refuses while Paystack may still send the refund,
--     and rpc_paystack_refund_open locks the stay, so the two cannot cross.
--  9. fn_receipt_for_stay: the guest's refund receipt is for the amount going
--     back, and names how it went back.
--
-- Rollback: drop trigger payment_paystack_after_close and
-- tg_payment_paystack_after_close, rpc_stay_cancel_refund_full,
-- rpc_stay_paid_bookings and rpc_stay_paystack_refund_checked; restore
-- rpc_stay_refunds from 20270222000300, fn_paystack_refund_apply from
-- 20270320000200, cron_expire_unpaid_mpesa_orders from 20261206000100,
-- fn_native_stay_checkout_view from 20270123000100, rpc_stay_guest_stays from
-- 20270320000300, rpc_stay_refund_record from 20261120000100,
-- rpc_paystack_refund_open from 20270222000400 and fn_receipt_for_stay from
-- 20270315000100.

-- ═══════════════════════════════════════════════ 0. audit actions

insert into audit.action_registry (action, module, default_severity, needs_review, money, description) values
  ('stay.cancel_refund_full', 'hotels', 'high', false, true,
   'NexG staff cancelled a paid stay with a full refund'),
  ('payment.paystack_refund_unmatched', 'orders', 'high', true, true,
   'A Paystack refund notice matched no single NexG refund; nothing was changed, check it in Paystack'),
  ('payment.paystack_paid_after_close', 'orders', 'high', true, true,
   'A Paystack payment arrived after its order closed; refund it'),
  ('payment.paystack_after_close_failed', 'orders', 'high', true, true,
   'A Paystack payment on an order could not be checked for a closed order; check the order and refund it if closed'),
  ('stay.paystack_refund_checked', 'hotels', 'high', false, true,
   'NexG staff recorded what the Paystack dashboard shows for a stay refund'),
  ('stay.refund_possible_double', 'hotels', 'high', true, true,
   'Paystack processed a refund for a stay already recorded refunded another way; the guest may have been paid twice'),
  ('payment.paystack_refund_after_failed_try', 'orders', 'high', true, true,
   'Paystack processed a refund that may be an earlier try marked failed; check that the money did not go twice')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ 1. cancel and refund in full

/*
 * Hospitality staff cancel a paid NexG stay and give the guest everything back.
 * The cancelling is rpc_stay_cancel's full refund (ledger, host email, conflict
 * flags, its own audit). A stay already cancelled with a refund due, or already
 * refunded, is left exactly as it is, and the answer says so: a refund the
 * policy made partial is not raised here.
 */
create or replace function public.rpc_stay_cancel_refund_full(p_stay_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_stay public.stay;
  v_pay public.payment;
  v_changed boolean := false;
  v_refund bigint;
  v_state text;
  v_message text;
begin
  if authz.staff_id() is null or not coalesce(authz.works_hospitality(null), false) then
    raise exception 'Hospitality staff only.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Say why this stay is being cancelled.' using errcode = '22023';
  end if;

  -- Locked, so two presses cannot both cancel it.
  select * into v_stay from public.stay where id = p_stay_id for update;
  if v_stay.id is null then
    raise exception 'No such booking.' using errcode = '22023';
  end if;
  if v_stay.source is distinct from 'nexg' or coalesce(v_stay.paid_kes, 0) <= 0 then
    raise exception 'Only a stay booked and paid through NexG can be cancelled and refunded here.'
      using errcode = '22023';
  end if;

  if v_stay.refunded_at is null
     and not (v_stay.status = 'cancelled' and v_stay.refund_due_at is not null) then
    if v_stay.status = 'cancelled' then
      raise exception 'This stay is already cancelled and no refund is due on it. Nothing was changed.'
        using errcode = '22023';
    end if;
    if v_stay.status not in ('booked', 'in_stay') then
      raise exception 'Only a booked stay can be cancelled and refunded here.' using errcode = '22023';
    end if;
    perform public.rpc_stay_cancel(p_stay_id, v_reason, true);
    v_changed := true;
    select * into v_stay from public.stay where id = p_stay_id;
  end if;

  -- The payment that settled the stay says how the money came in.
  select * into v_pay from public.payment
   where reference = v_stay.payment_reference and intent = 'stay' and stay_id = v_stay.id;
  select r.state into v_state from public.paystack_refund r
   where r.kind = 'stay' and r.stay_id = v_stay.id
   order by (r.state = 'failed'), r.created_at desc, r.id desc
   limit 1;
  v_refund := coalesce(v_stay.refund_amount_kes, v_stay.paid_kes);

  if v_changed then
    v_message := 'Cancelled. KES ' || to_char(v_refund, 'FM999,999,999,990') || ' is due back to the guest.';
    perform audit.log('staff'::public.actor_type, 'hotels', 'stay.cancel_refund_full',
      p_target_type => 'stay', p_target_id => v_stay.id, p_city_id => v_pay.city_id,
      p_reason => v_reason,
      p_after => jsonb_build_object('paid_kes', v_stay.paid_kes, 'refund_kes', v_refund,
                                    'provider', v_pay.provider, 'test', coalesce(v_pay.is_test, false),
                                    'reference', v_stay.payment_reference));
  elsif v_refund < v_stay.paid_kes then
    v_message := 'This stay was already cancelled with a refund of KES '
      || to_char(v_refund, 'FM999,999,999,990') || ' of the KES '
      || to_char(v_stay.paid_kes, 'FM999,999,999,990')
      || ' paid. That refund stays as it is. Nothing was changed.';
  elsif v_stay.refunded_at is not null then
    v_message := 'This stay''s refund is already recorded. Nothing was changed.';
  else
    v_message := 'This stay is already cancelled and its full refund is due. Nothing was changed.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'status', v_stay.status,
    'paid_kes', v_stay.paid_kes,
    'refund_kes', v_refund,
    'refund_due_at', v_stay.refund_due_at,
    'refunded_at', v_stay.refunded_at,
    'provider', v_pay.provider,
    'is_test', coalesce(v_pay.is_test, false),
    'paystack_refund_state', v_state,
    'message', v_message);
end;
$$;

revoke execute on function public.rpc_stay_cancel_refund_full(uuid, text) from public, anon;
grant execute on function public.rpc_stay_cancel_refund_full(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════ 2. the refund queue says how it was paid

-- As 20270222000300, plus provider and is_test (of the payment that settled the
-- stay), and paystack_state and paystack_reference (the stay's latest Paystack
-- refund, one that has not failed first).
drop function public.rpc_stay_refunds(text);

create function public.rpc_stay_refunds(p_show text default 'due')
returns table (
  stay_id uuid,
  reason text,
  property text,
  unit text,
  host text,
  check_in date,
  check_out date,
  paid_kes bigint,
  payment_reference text,
  mpesa_receipt text,
  payer_phone text,
  guest_email text,
  guest_name text,
  refund_due_at timestamptz,
  refunded_at timestamptz,
  refund_reference text,
  refund_note text,
  refunded_by text,
  refund_kes bigint,
  cancellation_fee_kes bigint,
  provider text,
  is_test boolean,
  paystack_state text,
  paystack_reference text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_full boolean := authz.handles_guest_data();
begin
  if not authz.works_hospitality(null) then
    raise exception 'Hospitality staff only.' using errcode = 'insufficient_privilege';
  end if;
  if p_show not in ('due', 'refunded', 'all') then
    raise exception 'Show due, refunded or all.' using errcode = '22023';
  end if;

  return query
    select
      s.id,
      case when s.status = 'cancelled' and s.confirmed_at is null then 'late_payment'
           else 'cancelled' end,
      p.name,
      coalesce(u.label_public, u.name),
      h.display_name,
      (s.check_in at time zone coalesce(h.time_zone, 'Africa/Nairobi'))::date,
      (s.check_out at time zone coalesce(h.time_zone, 'Africa/Nairobi'))::date,
      s.paid_kes,
      s.payment_reference,
      pay.provider_receipt,
      case when pay.payer_phone is null then null
           when v_full then pay.payer_phone
           else left(pay.payer_phone, 5) || '•••' || right(pay.payer_phone, 2) end,
      case when gu.email is null then null
           when v_full then gu.email::text
           else left(gu.email::text, 2) || '•••@' || split_part(gu.email::text, '@', 2) end,
      s.guest_first_name,
      s.refund_due_at,
      s.refunded_at,
      s.refund_reference,
      s.refund_note,
      su.display_name,
      coalesce(s.refund_amount_kes, s.paid_kes),
      s.cancellation_fee_kes,
      coalesce(sp.provider, pay.provider),
      coalesce(sp.is_test, pay.is_test, false),
      pr.state,
      pr.reference
    from public.stay s
    join public.host h on h.id = s.host_id
    left join public.unit u on u.id = s.unit_id
    left join public.property p on p.id = s.property_id
    left join auth.users gu on gu.id = s.guest_user_id
    left join public.staff_user su on su.id = s.refunded_by
    left join public.payment sp
      on sp.reference = s.payment_reference and sp.intent = 'stay' and sp.stay_id = s.id
    left join lateral (
      select x.provider_receipt, x.payer_phone, x.provider, x.is_test from public.payment x
       where x.stay_id = s.id and x.state in ('paid', 'reversed')
       order by x.paid_at desc nulls last limit 1
    ) pay on true
    left join lateral (
      select r.state, r.reference from public.paystack_refund r
       where r.kind = 'stay' and r.stay_id = s.id
       order by (r.state = 'failed'), r.created_at desc, r.id desc limit 1
    ) pr on true
    where s.refund_due_at is not null
      and (p_show = 'all'
           or (p_show = 'due' and s.refunded_at is null)
           or (p_show = 'refunded' and s.refunded_at is not null))
    order by s.refunded_at is not null, s.refund_due_at desc;
end;
$$;

revoke execute on function public.rpc_stay_refunds(text) from public, anon;
grant execute on function public.rpc_stay_refunds(text) to authenticated;

-- ═══════════════════════════════════════════════ 3. the paid bookings staff can cancel

/* Booked and in-stay NexG stays that have been paid, newest check-in first. The
   guest is named by first name only; no phone or email. */
create or replace function public.rpc_stay_paid_bookings()
returns table (
  stay_id uuid,
  property text,
  unit text,
  host text,
  guest_first_name text,
  check_in date,
  check_out date,
  status text,
  paid_kes bigint,
  provider text,
  is_test boolean,
  paid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not authz.works_hospitality(null) then
    raise exception 'Hospitality staff only.' using errcode = 'insufficient_privilege';
  end if;

  return query
    select
      s.id,
      p.name,
      coalesce(u.label_public, u.name),
      h.display_name,
      s.guest_first_name,
      (s.check_in at time zone coalesce(h.time_zone, 'Africa/Nairobi'))::date,
      (s.check_out at time zone coalesce(h.time_zone, 'Africa/Nairobi'))::date,
      s.status::text,
      s.paid_kes,
      sp.provider,
      coalesce(sp.is_test, false),
      coalesce(sp.paid_at, s.confirmed_at)
    from public.stay s
    join public.host h on h.id = s.host_id
    left join public.unit u on u.id = s.unit_id
    left join public.property p on p.id = s.property_id
    left join public.payment sp
      on sp.reference = s.payment_reference and sp.intent = 'stay' and sp.stay_id = s.id
    where s.source = 'nexg' and s.status in ('booked', 'in_stay') and s.paid_kes > 0
    order by s.check_in desc, s.id
    limit 200;
end;
$$;

revoke execute on function public.rpc_stay_paid_bookings() from public, anon;
grant execute on function public.rpc_stay_paid_bookings() to authenticated;

-- ═══════════════════════════════════════════════ 4. Paystack's refund notices

/*
 * As 20270320000200, with these changes to which refund a message is about and
 * what it may change. What the processed branches do is unchanged, apart from
 * the double-payment audits.
 *
 * Which refund:
 *   A. our own reference (NXR-...) in refund_reference or reference: that one
 *      only, and nothing else if we do not know it;
 *   B. else Paystack's refund id, when a refund of ours has it;
 *   C. else, for a signed webhook only, the transaction: Paystack's documented
 *      notices carry transaction_reference (our attempt reference), the amount
 *      (often a string) and the currency. The attempt must be the one that
 *      settled its payment, in the same mode and currency; then exactly one
 *      refund of that amount on that payment. For processed, refunds that have
 *      not failed are counted, processed ones too, so a redelivery cannot land
 *      on another refund of the same amount; for any other status all are
 *      counted, so a late message about a failed try cannot hit its retry.
 * No single refund: nothing changes, nothing is raised, and a webhook is
 * audited as payment.paystack_refund_unmatched. Except pending and processing
 * that fit twice only because an earlier failed try has the same transaction
 * and amount: Paystack sends them for every retry, so they are ignored quietly.
 *
 * What it may change: a processed amount, number or string, must be the
 * refund's; pending and processing never overwrite needs-attention or failed;
 * and a failed refund is not brought back while another try for the same thing
 * is open (paystack_refund_one_live).
 *
 * A processed refund for a stay already recorded refunded another way (under
 * another reference, or matching no single NexG refund) is audited as
 * stay.refund_possible_double: the guest may have been paid twice, and where
 * the payment was split, the host's share may have been taken twice.
 *
 * A processed notice found only by its transaction cannot say which try it is
 * about. With another try of the same amount marked failed, it may be that one
 * processed after all, with the one matched still to come: it is audited once
 * per refund as payment.paystack_refund_after_failed_try, also when the matched
 * refund was processed already.
 */
create or replace function public.fn_paystack_refund_apply(p_mode text, p_data jsonb, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.paystack_refund;
  v_pay public.payment;
  v_status text := lower(coalesce(p_data->>'status', ''));
  v_id text := nullif(p_data->>'id', '');
  v_ours text := case when (p_data->>'refund_reference') ~ '^NXR-' then p_data->>'refund_reference'
                      when (p_data->>'reference') ~ '^NXR-' then p_data->>'reference' end;
  v_txn text := coalesce(nullif(p_data->>'transaction_reference', ''),
                         nullif(p_data#>>'{transaction,reference}', ''));
  v_stated numeric := case
    when jsonb_typeof(p_data->'amount') = 'number' then (p_data->>'amount')::numeric
    when (p_data->>'amount') ~ '^[0-9]{1,18}([.][0-9]{1,6})?$' then (p_data->>'amount')::numeric
  end;
  v_amount bigint := case when (p_data->>'amount') ~ '^[1-9][0-9]{0,17}$'
                          then (p_data->>'amount')::bigint end;
  v_matches uuid[];
  v_by_transaction boolean := false;
  v_why text := 'unknown_refund';
  v_hold uuid;
  v_hold_state text;
  v_stay_id uuid;
  v_recorded text;
  v_city uuid;
  v_settled uuid;
  v_split uuid;
  c_double constant text := 'Paystack processed a refund for a stay already recorded refunded. The guest may have been paid twice; check it in Paystack.';
  c_split constant text := ' The payment was split to the host, so their share may have been taken twice; Finance may owe the host a credit.';
begin
  if v_ours is not null then
    select * into x from public.paystack_refund where reference = v_ours for update;
  else
    if v_id is not null then
      select * into x from public.paystack_refund where paystack_refund_id = v_id
       order by created_at desc limit 1 for update;
    end if;
    if x.id is null and p_source = 'webhook' and v_txn is not null and v_amount is not null
       and nullif(p_data->>'currency', '') is not null then
      /* The attempt that settled the payment: its signed success is on file
         under the payment's own transaction id. A second charge on another
         attempt (refunded by hand) is not it. */
      select pay.* into v_pay
        from public.paystack_attempt a
        join public.payment pay on pay.id = a.payment_id
       where a.reference = v_txn and a.outcome = 'paid'
         and pay.provider = 'paystack' and pay.state in ('paid', 'reversed')
         and pay.is_test = (p_mode = 'test') and pay.currency = p_data->>'currency'
         and exists (select 1 from public.payment_event e
                      where e.provider = 'paystack'
                        and e.dedupe_key = 'paystack:' || pay.provider_ref
                        and e.payload#>>'{data,reference}' = v_txn);
      if v_pay.id is not null then
        select array_agg(r.id) into v_matches
          from public.paystack_refund r
         where r.payment_id = v_pay.id and r.amount_cents = v_amount
           and (v_status <> 'processed' or r.state <> 'failed');
        if cardinality(v_matches) = 1 then
          select * into x from public.paystack_refund where id = v_matches[1] for update;
          v_by_transaction := true;
        elsif cardinality(v_matches) > 1 then
          if v_status in ('pending', 'processing')
             and (select count(*) from public.paystack_refund r
                   where r.id = any (v_matches) and r.state <> 'failed') = 1 then
            return jsonb_build_object('ok', true, 'ignored', true, 'status', v_status);
          end if;
          v_why := 'ambiguous_refund';
        end if;
      end if;
    end if;
  end if;

  -- Another Paystack refund id than the one on record: another refund.
  if v_by_transaction and v_id is not null and x.paystack_refund_id is not null
     and x.paystack_refund_id <> v_id then
    x := null;
  end if;

  -- A failed try has been replaced by another one: a person settles which went.
  if x.id is not null and x.state = 'failed' and v_status in ('processed', 'needs-attention')
     and x.is_test = (p_mode = 'test')
     and exists (select 1 from public.paystack_refund o
                  where o.id <> x.id and o.state <> 'failed' and o.kind = x.kind
                    and coalesce(o.refund_id, o.stay_id, o.payment_id)
                        = coalesce(x.refund_id, x.stay_id, x.payment_id))
     and not v_by_transaction then
    v_why := 'ambiguous_refund';
    v_stay_id := x.stay_id;
    x := null;
  end if;

  if x.id is null then
    -- A processed refund that is not the one a refunded stay was recorded with.
    if p_source = 'webhook' and v_status = 'processed' then
      select s.refund_reference, pay.city_id, s.id, pay.id
        into v_recorded, v_city, v_stay_id, v_settled
        from public.stay s
        left join public.payment pay
          on pay.reference = s.payment_reference and pay.intent = 'stay' and pay.stay_id = s.id
       where s.id = coalesce(v_stay_id, v_pay.stay_id) and s.refunded_at is not null;
    end if;
    if v_recorded is not null then
      -- Cleared by tg_stay_split_settled when Paystack did not split after all.
      select a.split_host_id into v_split from public.paystack_attempt a
       where a.payment_id = v_settled and a.outcome = 'paid' and a.split_host_id is not null
       limit 1;
      perform audit.log(
        p_actor_type => 'system'::public.actor_type, p_module => 'hotels',
        p_action => 'stay.refund_possible_double', p_actor_label => '[System] · Paystack',
        p_target_type => 'stay', p_target_id => v_stay_id, p_city_id => v_city,
        p_severity => 'high',
        p_reason => c_double || case when v_split is not null then c_split else '' end,
        p_after => jsonb_build_object(
          'recorded_reference', v_recorded, 'transaction', left(v_txn, 200),
          'amount', left(p_data->>'amount', 40), 'mode', p_mode, 'why', v_why,
          'refund_reference', left(p_data->>'refund_reference', 200), 'refund_id', left(v_id, 40),
          'split_host_id', v_split));
    elsif p_source = 'webhook' then
      perform audit.log(
        p_actor_type => 'system'::public.actor_type, p_module => 'orders',
        p_action => 'payment.paystack_refund_unmatched', p_actor_label => '[System] · Paystack',
        p_target_type => 'payment', p_target_id => v_pay.id, p_city_id => v_pay.city_id,
        p_severity => 'high',
        p_reason => 'A Paystack refund notice matched no single NexG refund. Nothing was changed; check it in Paystack.',
        p_after => jsonb_build_object(
          'transaction', left(v_txn, 200), 'amount', left(p_data->>'amount', 40),
          'status', left(v_status, 40), 'mode', p_mode, 'why', v_why,
          'refund_reference', left(p_data->>'refund_reference', 200), 'refund_id', left(v_id, 40)));
    end if;
    return jsonb_build_object('ok', false, 'reason', v_why);
  end if;
  if x.is_test <> (p_mode = 'test') then
    return jsonb_build_object('ok', false, 'reason', 'mode_mismatch');
  end if;
  -- It may be the failed try that processed: a person checks, once per refund.
  if v_by_transaction and v_status = 'processed'
     and exists (select 1 from public.paystack_refund o
                  where o.id <> x.id and o.payment_id = x.payment_id
                    and o.amount_cents = x.amount_cents and o.state = 'failed')
     and not exists (select 1 from audit.audit_event e
                      where e.target_type = 'payment' and e.target_id = x.payment_id
                        and e.action = 'payment.paystack_refund_after_failed_try'
                        and e.after ->> 'reference' = x.reference) then
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.paystack_refund_after_failed_try', p_actor_label => '[System] · Paystack',
      p_target_type => 'payment', p_target_id => x.payment_id, p_city_id => v_pay.city_id,
      p_severity => 'high',
      p_reason => 'Paystack processed a refund that names only the transaction, and another try of the same amount is marked failed. Check in Paystack that the money did not go back twice.',
      p_after => jsonb_build_object('reference', x.reference, 'transaction', left(v_txn, 200),
        'amount_cents', x.amount_cents, 'mode', p_mode, 'stay_id', x.stay_id,
        'refund_reference', left(p_data->>'refund_reference', 200)));
  end if;
  if x.state in ('processed') then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  -- Found only by its transaction: a failed one is left as it is.
  if v_by_transaction and x.state = 'failed' then
    return jsonb_build_object('ok', true, 'ignored', true, 'status', v_status);
  end if;
  if v_status not in ('pending', 'processing', 'processed', 'failed', 'needs-attention') then
    return jsonb_build_object('ok', true, 'ignored', true, 'status', v_status);
  end if;
  if v_status = 'processed' and v_stated is not null and v_stated <> x.amount_cents then
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;
  if v_status in ('pending', 'processing') and x.state in ('needs-attention', 'failed') then
    return jsonb_build_object('ok', true, 'ignored', true, 'status', v_status);
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
      if not found then
        -- Already recorded: under another reference, the money may have gone twice.
        select s.refund_reference into v_recorded from public.stay s where s.id = x.stay_id;
        if upper(v_recorded) <> upper(x.reference) then
          select pay.city_id into v_city from public.payment pay where pay.id = x.payment_id;
          select a.split_host_id into v_split from public.paystack_attempt a
           where a.payment_id = x.payment_id and a.outcome = 'paid' and a.split_host_id is not null
           limit 1;
          perform audit.log(
            p_actor_type => 'system'::public.actor_type, p_module => 'hotels',
            p_action => 'stay.refund_possible_double', p_actor_label => '[System] · Paystack',
            p_target_type => 'stay', p_target_id => x.stay_id, p_city_id => v_city,
            p_severity => 'high',
            p_reason => c_double || case when v_split is not null then c_split else '' end,
            p_after => jsonb_build_object(
              'recorded_reference', v_recorded, 'refund_reference', x.reference,
              'amount_cents', x.amount_cents, 'mode', p_mode, 'source', p_source,
              'split_host_id', v_split));
        end if;
      end if;
      update public.payment set state = 'reversed', updated_at = now()
       where id = x.payment_id and state = 'paid';
      perform audit.log('system'::public.actor_type, 'hotels', 'stay.refunded',
        p_target_type => 'stay', p_target_id => x.stay_id,
        p_after => jsonb_build_object('reference', x.reference, 'amount_cents', x.amount_cents,
                                      'through', 'paystack'));
    elsif x.kind = 'cinema' then
      select py.cinema_hold_id into v_hold from public.payment py where py.id = x.payment_id;
      update public.payment set state = 'reversed', updated_at = now()
       where id = x.payment_id and state = 'paid';
      if v_hold is not null then
        select h.state into v_hold_state from cinema.hold h where h.id = v_hold for update;
        if v_hold_state in ('refund_due', 'refunded') then
          perform public.cinema_record_refunded(v_hold, x.reference);
        else
          /* The cinema booked the seats after the refund was asked for (a late
             confirm): the money is back with the customer and the seats are
             booked. Never raise here (Paystack's answer must be kept); a
             person settles it. */
          perform audit.log('system'::public.actor_type, 'experiences', 'cinema.refunded_but_booked',
            p_actor_label => '[System] · Paystack',
            p_target_type => 'cinema_hold', p_target_id => v_hold,
            p_severity => 'high'::public.audit_severity,
            p_reason => 'Paystack refunded this payment, but the cinema has booked the seats. Settle it with the customer and the cinema.',
            p_after => jsonb_build_object('cinema_hold', v_hold, 'hold_state', v_hold_state,
                                          'refund', x.reference, 'amount_cents', x.amount_cents,
                                          'source', p_source));
        end if;
      end if;
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

-- ═══════════════════════════════════════════════ 5. unpaid orders, and Paystack tries

/*
 * As 20261206000100, and an order is left open while a Paystack try for any of
 * its payments is still in progress (no outcome yet). Like a prompt M-Pesa has
 * not answered, it could still be money:
 *   * a try started in the last thirty minutes holds the order;
 *   * an older one that reached Paystack (opened) holds it until Paystack has
 *     been asked about it near the end of that window (checked_at, 25 minutes
 *     or more after the try started), and never past two hours, so a sweep that
 *     is not running cannot keep orders open for ever;
 *   * a try that failed never holds it, nor does an older one that never opened.
 * The asking is cron_paystack_sweep (every two minutes) with
 * rpc_payment_paystack_due, which lists an opened try with no outcome from two
 * minutes after it opened and again five minutes after each check, while its
 * payment is pending or authorised.
 *
 * An order that had a Paystack try is not told that M-Pesa had no payment or
 * that nothing was charged: its money can still arrive (section 6 flags it).
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
  v_paystack boolean;
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
       and not exists (select 1 from public.paystack_attempt a
                         join public.payment p on p.id = a.payment_id
                        where p.order_id = ord.id
                          and a.outcome is null
                          and (a.created_at > now() - interval '30 minutes'
                               or (a.opened_at is not null
                                   and a.created_at > now() - interval '2 hours'
                                   and (a.checked_at is null
                                        or a.checked_at < a.created_at + interval '25 minutes'))))
     order by ord.placed_at
     limit 200
     for update of ord skip locked
  loop
    v_paystack := exists (select 1 from public.paystack_attempt a
                            join public.payment p on p.id = a.payment_id
                           where p.order_id = o.id);

    update public.payment
       set state = 'abandoned', updated_at = now(),
           failure_reason = coalesce(failure_reason, 'not paid within 30 minutes')
     where order_id = o.id and state in ('pending', 'authorised', 'failed');

    update public.order
       set stage = 'cancelled', cancelled_at = now(), cancel_reason_code = 'unpaid',
           cancel_note = case when v_paystack then 'No payment was confirmed in time.'
                              else 'Not paid by M-Pesa within 30 minutes. Nothing was charged.' end
     where id = o.id;

    update dispatch.job
       set state = 'cancelled', ended_at = now(), end_reason = 'unpaid'
     where order_id = o.id and state not in ('completed', 'cancelled');
    update dispatch.offer set outcome = 'withdrawn', responded_at = now()
     where outcome = 'pending'
       and job_id in (select id from dispatch.job where order_id = o.id);

    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, payload)
    values (o.id, 'unpaid_expired', 'Closed: not paid',
            case when v_paystack
              then 'No payment was confirmed in time, so the order was closed. A payment that arrives later is to be refunded.'
              else 'M-Pesa had no payment for this order 30 minutes after it was placed. Nothing was charged.' end,
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

-- ═══════════════════════════════════════════════ 6. money arriving after an order closed

/*
 * Paystack can be paid after the order it was for has closed (a card page left
 * open, a late prompt). The payment settles as before; this writes it on the
 * order and asks a person to refund it. No money moves and the ledger postings
 * are unchanged. Never raises: it runs inside the payment webhook. The order is
 * locked, so a cancel committing at the same moment is seen.
 */
create or replace function public.tg_payment_paystack_after_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.order;
begin
  begin
    select * into v_order from public.order where id = new.order_id for update;
    if v_order.id is null or v_order.stage::text not in ('cancelled', 'refunded') then
      return new;
    end if;

    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, payload)
    values (v_order.id, 'money_to_return', 'Money to send back',
            'KES ' || to_char(new.amount_cents / 100.0, 'FM999,999,999,990.00')
              || ' · The payment arrived after this order closed. It is to be refunded.',
            'system', '[System] · payments',
            jsonb_build_object('payment_id', new.id, 'amount_cents', new.amount_cents,
                               'reference', new.reference));

    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.paystack_paid_after_close', p_actor_label => '[System] · payments',
      p_target_type => 'order', p_target_id => v_order.id, p_target_label => v_order.reference,
      p_city_id => v_order.city_id, p_severity => 'high',
      p_reason => 'A Paystack payment arrived after the order closed. Refund it.',
      p_after => jsonb_build_object('payment_id', new.id, 'reference', new.reference,
                                    'amount_cents', new.amount_cents, 'currency', new.currency,
                                    'stage', v_order.stage, 'test', new.is_test));
  exception when others then
    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'payment.paystack_after_close_failed', p_actor_label => '[System] · payments',
      p_target_type => 'payment', p_target_id => new.id, p_city_id => new.city_id,
      p_severity => 'high',
      p_reason => 'A Paystack payment on an order could not be checked for a closed order.',
      p_after => jsonb_build_object('order_id', new.order_id, 'reference', new.reference,
                                    'error', sqlerrm, 'sqlstate', sqlstate));
  end;
  return new;
end;
$$;

revoke execute on function public.tg_payment_paystack_after_close() from public, anon, authenticated;

-- None of the other triggers on a payment changes an order's stage, so the
-- order they fire in does not matter.
drop trigger if exists payment_paystack_after_close on public.payment;
create trigger payment_paystack_after_close
  after update of state on public.payment
  for each row
  when (new.intent = 'order' and new.provider = 'paystack' and new.state = 'paid'
        and old.state is distinct from 'paid')
  execute function public.tg_payment_paystack_after_close();

-- ═══════════════════════════════════════════════ 7. what the guest is told

-- As 20270123000100, plus 'refunded' and 'cancelledAfterBooking' (NexG
-- cancelled a booked stay, as opposed to a hold that lapsed or a late payment).
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
    'paymentStatus', case
      when s.paid_kes is not null and s.paid_kes > 0 then 'paid'
      when p.state = 'pending' and p.provider_ref is null and p.expires_at <= clock_timestamp() then 'failed'
      when p.state in ('pending', 'authorised') then 'pending'
      when p.state = 'paid' then 'paid'
      when p.id is not null then 'failed'
      else 'unpaid'
    end,
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

/* As 20270320000300, plus refundDue, refunded and refundKes (what goes back to
   the guest; null while nothing was decided). */
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
        'handoff', u.handoff,
        'wifi_name', nullif(trim(u.wifi_name), ''),
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
              or (s.status = 'cancelled' and s.confirmed_at is not null))
       order by s.check_in desc, s.id
       limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) x
$$;

revoke execute on function public.rpc_stay_guest_stays(integer) from public, anon;
grant execute on function public.rpc_stay_guest_stays(integer) to authenticated;

-- ═══════════════════════════════════════════════ 8. what the Paystack dashboard shows

/*
 * "I checked the Paystack dashboard": hospitality staff say what it shows for
 * the refund of a stay paid through Paystack, when no notice moved the row.
 *   processed  the stay's open Paystack refund is marked processed and the stay
 *              recorded refunded under that NXR- reference. A refund made
 *              straight in the dashboard gets a row first. The row is marked
 *              before the stay: tg_stay_split_settled looks for it when
 *              refunded_at is set, and credits a split host back.
 *   failed     the open refund is marked failed, so it can be sent again;
 *              nothing is marked refunded.
 * p_shown_reference is the paystack_reference the person's screen showed (null
 * when it showed none). If the stay's refund is another one by now, nothing
 * changes. A repeat changes nothing. No money moves here.
 */
create or replace function public.rpc_stay_paystack_refund_checked(
  p_stay_id uuid,
  p_outcome text,
  p_reference text,
  p_note text,
  p_shown_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_seen text := nullif(btrim(coalesce(p_reference, '')), '');
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
  v_stay public.stay;
  v_pay public.payment;
  x public.paystack_refund;
  v_was text;
  v_amount bigint;
  v_now text;
begin
  if v_staff is null or not coalesce(authz.works_hospitality(null), false) then
    raise exception 'Hospitality staff only.' using errcode = '42501';
  end if;
  if coalesce(p_outcome, '') not in ('processed', 'failed') then
    raise exception 'Say whether Paystack shows the refund as processed or failed.' using errcode = '22023';
  end if;
  if p_outcome = 'processed' and v_seen is null then
    raise exception 'Enter the refund reference shown in the Paystack dashboard.' using errcode = '22023';
  end if;
  if length(v_seen) > 64 then
    raise exception 'The Paystack reference is at most 64 characters.' using errcode = '22023';
  end if;

  -- The refund before the stay, the order Paystack's notice locks them in.
  select * into x from public.paystack_refund
   where kind = 'stay' and stay_id = p_stay_id and state <> 'failed' for update;
  select * into v_stay from public.stay where id = p_stay_id for update;
  if x.id is null then
    -- One opened while the stay was being locked.
    select * into x from public.paystack_refund
     where kind = 'stay' and stay_id = p_stay_id and state <> 'failed' for update;
  end if;

  if v_stay.id is null or v_stay.refund_due_at is null then
    raise exception 'That stay has no refund due.' using errcode = '22023';
  end if;
  select * into v_pay from public.payment
   where reference = v_stay.payment_reference and intent = 'stay' and stay_id = v_stay.id;
  if v_pay.id is null or v_pay.provider is distinct from 'paystack' then
    raise exception 'This stay was not paid through Paystack. Record the refund by its M-Pesa or bank reference.'
      using errcode = '22023';
  end if;
  if v_stay.refunded_at is not null then
    return jsonb_build_object('ok', true, 'changed', false, 'refunded', true,
      'refund_reference', v_stay.refund_reference,
      'message', 'This stay''s refund is already recorded. Nothing was changed.');
  end if;
  /* The refund the queue shows now, chosen as rpc_stay_refunds chooses it. A
     form left open across a resend must not settle the new try unchecked. */
  select r.reference into v_now from public.paystack_refund r
   where r.kind = 'stay' and r.stay_id = v_stay.id
   order by (r.state = 'failed'), r.created_at desc, r.id desc
   limit 1;
  if v_now is distinct from nullif(btrim(coalesce(p_shown_reference, '')), '') then
    return jsonb_build_object('ok', true, 'changed', false, 'refunded', false,
      'message', 'This stay''s Paystack refund has changed since the page was loaded. Nothing was changed. Check the one shown now.');
  end if;
  v_was := x.state;

  if p_outcome = 'failed' then
    if x.id is null then
      return jsonb_build_object('ok', true, 'changed', false, 'refunded', false,
        'message', 'No Paystack refund is open for this stay. Nothing was changed.');
    end if;
    if x.state = 'processed' then
      raise exception 'NexG already has this refund as processed by Paystack, so it cannot be marked failed.'
        using errcode = '22023';
    end if;
    update public.paystack_refund
       set state = 'failed', updated_at = now(),
           failure_reason = left(coalesce(v_note, 'Failed in the Paystack dashboard'), 300)
     where id = x.id;
  else
    if x.id is null then
      -- Refunded straight in the dashboard: NexG's row for it, so the same postings run.
      v_amount := ledger.from_kes(coalesce(v_stay.refund_amount_kes, v_stay.paid_kes));
      if v_pay.state <> 'paid' or v_amount <= 0 or v_amount > v_pay.amount_cents then
        raise exception 'This stay''s payment cannot take that refund. Ask Finance to check it.'
          using errcode = '22023';
      end if;
      insert into public.paystack_refund
        (kind, stay_id, payment_id, reference, amount_cents, is_test, created_by)
      values ('stay', v_stay.id, v_pay.id, 'NXR-' || replace(gen_random_uuid()::text, '-', ''),
              v_amount, v_pay.is_test, v_staff)
      returning * into x;
    end if;
    update public.paystack_refund
       set state = 'processed', failure_reason = null, updated_at = now()
     where id = x.id;
    update public.stay
       set refunded_at = now(), refund_reference = left(x.reference, 64),
           refund_note = coalesce(v_note, 'Checked in the Paystack dashboard'),
           refunded_by = v_staff, updated_at = now()
     where id = v_stay.id;
    update public.payment set state = 'reversed', updated_at = now()
     where id = x.payment_id and state = 'paid';
    perform audit.log('staff'::public.actor_type, 'hotels', 'stay.refunded',
      p_actor_id => v_staff, p_target_type => 'stay', p_target_id => v_stay.id,
      p_city_id => v_pay.city_id,
      p_after => jsonb_build_object('reference', x.reference, 'amount_cents', x.amount_cents,
                                    'through', 'paystack'));
  end if;

  perform audit.log('staff'::public.actor_type, 'hotels', 'stay.paystack_refund_checked',
    p_actor_id => v_staff, p_target_type => 'stay', p_target_id => v_stay.id,
    p_city_id => v_pay.city_id, p_severity => 'high',
    p_reason => v_note,
    p_after => jsonb_build_object('outcome', p_outcome, 'dashboard_reference', v_seen,
      'note', v_note, 'refund_reference', x.reference, 'amount_cents', x.amount_cents,
      'state_before', v_was, 'test', x.is_test));

  return jsonb_build_object('ok', true, 'changed', true, 'refunded', p_outcome = 'processed',
    'refund_reference', x.reference,
    'message', case when p_outcome = 'processed' then 'Recorded as refunded through Paystack.'
      else 'Marked failed. Nothing is recorded as refunded; the refund can be sent again.' end);
end;
$$;

revoke execute on function public.rpc_stay_paystack_refund_checked(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.rpc_stay_paystack_refund_checked(uuid, text, text, text, text)
  to authenticated;

/* As 20270222000400, except the stay is locked before its refund is read, as
   rpc_stay_refund_record and the dashboard check lock it, so a refund cannot be
   opened while another is being recorded; and a processed one counts as sent. */
create or replace function public.rpc_paystack_refund_open(p_kind text, p_target uuid, p_proof text)
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
    select * into s from public.stay where id = p_target for update;
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
      'sent', x.paystack_refund_id is not null or x.state = 'processed');
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

/* As 20261120000100, and refused while a Paystack refund for the stay is open
   (neither failed nor processed): Paystack may still send that money, so
   recording one sent another way would pay the guest twice. */
create or replace function public.rpc_stay_refund_record(
  p_stay_id uuid,
  p_reference text,
  p_note text default null
)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_ref text := nullif(trim(coalesce(p_reference, '')), '');
  v_staff uuid := authz.staff_id();
begin
  if not authz.works_hospitality(null) or v_staff is null then
    raise exception 'Hospitality staff only.' using errcode = 'insufficient_privilege';
  end if;
  if v_ref is null or length(v_ref) > 64 then
    raise exception 'Enter the M-Pesa reference of the refund.' using errcode = '22023';
  end if;

  select * into v_stay from public.stay where id = p_stay_id for update;
  if v_stay.id is null or v_stay.refund_due_at is null then
    raise exception 'That stay has no refund due.' using errcode = '22023';
  end if;
  if v_stay.refunded_at is not null then
    raise exception 'That refund is already recorded (%).', v_stay.refund_reference
      using errcode = '22023';
  end if;
  if exists (select 1 from public.paystack_refund r
              where r.kind = 'stay' and r.stay_id = p_stay_id
                and r.state not in ('failed', 'processed')) then
    raise exception 'A Paystack refund is open for this stay. Check the Paystack dashboard and record what it shows there, so the guest is not paid twice.'
      using errcode = '22023';
  end if;

  update public.stay
     set refunded_at = now(), refund_reference = upper(v_ref),
         refund_note = left(nullif(trim(coalesce(p_note, '')), ''), 500),
         refunded_by = v_staff, updated_at = now()
   where id = p_stay_id
  returning * into v_stay;

  update public.payment set state = 'reversed', updated_at = now()
   where stay_id = p_stay_id and state = 'paid';

  perform audit.log('staff'::public.actor_type, 'hotels', 'stay.refunded',
    p_actor_id => v_staff, p_target_type => 'stay', p_target_id => p_stay_id,
    p_after => jsonb_build_object('reference', v_stay.refund_reference,
                                  'paid_kes', v_stay.paid_kes,
                                  'note', v_stay.refund_note));
  return v_stay;
end;
$$;

revoke execute on function public.rpc_stay_refund_record(uuid, text, text) from public, anon;
grant execute on function public.rpc_stay_refund_record(uuid, text, text) to authenticated;

-- ═══════════════════════════════════════════════ 9. the guest's refund receipt

/* As 20270315000100, except the guest's refund receipt: the amount going back
   (a policy refund can be less than was paid), and how it went back. Card or
   Paystack only when Paystack processed the refund the stay is recorded under;
   a Paystack payment returned by hand went by M-Pesa or bank, never to the
   card. Both Paystack paths mark that refund processed before the stay. */
create or replace function public.fn_receipt_for_stay(p_stay_id uuid, p_email boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.stay;
  v_place text;
  v_pay public.payment;
  v_back bigint;
begin
  select * into s from public.stay where id = p_stay_id;
  if s.id is null then return; end if;
  select coalesce(pr.name, '') || coalesce(' · ' || coalesce(u.label_public, u.name), '') into v_place
    from public.unit u left join public.property pr on pr.id = u.property_id where u.id = s.unit_id;

  if s.status in ('booked', 'in_stay', 'departed') and s.source = 'nexg' and s.host_share_kes is not null then
    perform public.fn_receipt_issue('host', s.host_id, 'stay', s.id, 'earnings',
      'Booking earnings · ' || coalesce(nullif(v_place, ''), 'NexG stay')
        || ' · ' || to_char(s.check_in at time zone 'Africa/Nairobi', 'DD Mon')
        || ' to ' || to_char(s.check_out at time zone 'Africa/Nairobi', 'DD Mon YYYY'),
      jsonb_build_array(
        jsonb_build_object('label', 'Guest paid', 'amount_cents', s.paid_kes * 100),
        jsonb_build_object('label', 'NexG commission (' || coalesce(trim_scale(s.commission_pct), 15)::text || '%)',
                           'amount_cents', -s.commission_kes * 100)),
      s.host_share_kes * 100, 'NexG booking', s.payment_reference, coalesce(s.confirmed_at, now()), p_email);
  end if;

  if s.refunded_at is not null and s.guest_user_id is not null then
    select * into v_pay from public.payment
     where reference = s.payment_reference and intent = 'stay' and stay_id = s.id;
    v_back := coalesce(s.refund_amount_kes, s.paid_kes, 0) * 100;
    perform public.fn_receipt_issue('guest', s.guest_user_id, 'stay_refund', s.id, 'refund',
      'Refund · ' || coalesce(nullif(v_place, ''), 'NexG stay'),
      jsonb_build_array(jsonb_build_object('label', 'Refund of stay payment', 'amount_cents', v_back)),
      v_back,
      case when exists (select 1 from public.paystack_refund r
                         where r.kind = 'stay' and r.stay_id = s.id
                           and r.reference = s.refund_reference and r.state = 'processed')
             then case when v_pay.channel = 'card' then 'Card' else 'Paystack' end
           when v_pay.provider = 'paystack' then 'M-Pesa or bank'
           when v_pay.provider = 'mpesa' or v_pay.channel = 'mpesa' then 'M-Pesa'
           when v_pay.channel = 'bank' or v_pay.provider like 'bank\_%' then 'Bank'
           else 'M-Pesa or bank' end,
      s.refund_reference, s.refunded_at, p_email);
  end if;
end;
$$;

revoke execute on function public.fn_receipt_for_stay(uuid, boolean) from public, anon, authenticated;
