-- A shop can decline an order it cannot take (owner, 22 Nov 2026: "yes, as
-- recommended").
--
-- Before this, paying confirmed an order (owner, 18 Nov) and only staff could
-- cancel it, so a shop that had run out of something had to phone support.
--
-- rpc_merchant_order_decline(order, reason, note), for the shop's team:
--   * Only before the shop starts preparing it: stage 'placed' or 'confirmed'.
--     After that, staff handle it as before.
--   * A reason from a short list: out_of_stock, closing, too_busy,
--     cannot_deliver, or other (with a note). The customer sees it.
--   * The order is cancelled with cancel_reason_code 'merchant_declined', so
--     declines are counted apart from other cancellations: for the shop's
--     reliability once a health score is computed, and for staff to spot a
--     shop that declines often. No automatic penalty.
--   * Paid: a full refund is approved at once, with no staff approval, into
--     Finance's refunds to issue (refunds_to_issue_v). Finance sends it as
--     today: back the way it was paid (M-Pesa or card), else by M-Pesa.
--   * Unpaid: the open payment is abandoned. While an M-Pesa prompt is still
--     open the decline waits a minute, so money cannot land on a declined order.
--   * The customer is told by notification (the order's own, which replaces
--     the generic "cancelled" one): who declined, why, and whether a refund is
--     on its way.
--   * A rule row lets the stage guard (20270221000100) allow the move and
--     rpc_order_next_steps offer the shop a "decline" step.
--
-- Rollback:
--   delete from public.order_step_rule where actor = 'merchant' and step = 'decline';
--   drop function if exists public.rpc_merchant_order_decline(uuid, text, text);
--   delete from audit.action_registry where action = 'order.merchant_declined';

insert into audit.action_registry (action, module, default_severity, description) values
  ('order.merchant_declined', 'orders', 'notice', 'A shop declined an order before starting it')
on conflict (action) do nothing;

insert into public.order_step_rule (actor, step, from_stages, to_stage, fulfilment, call, args, needs) values
  ('merchant', 'decline', '{placed,confirmed}', 'cancelled', null,
   'rpc_merchant_order_decline', '{"p_reason": null, "p_note": null}',
   'Before starting it. Reason: out_of_stock, closing, too_busy, cannot_deliver or other (with a note). A paid order is refunded in full.')
on conflict (actor, step) do nothing;

create or replace function public.rpc_merchant_order_decline(
  p_order_id uuid,
  p_reason text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_uid uuid := (select auth.uid());
  v_label text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_paid boolean;
  v_owed bigint := 0;
  v_refund uuid;
  v_customer uuid;
  v_shop text;
begin
  if v_uid is null then
    raise exception 'Sign in to your shop first.' using errcode = '42501';
  end if;

  select * into o from public.order where id = p_order_id for update;
  if not found or not authz.is_merchant_member(o.merchant_id) then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  /* A double tap answers as if it had just happened. */
  if o.stage = 'cancelled' and o.cancel_reason_code = 'merchant_declined' then
    return jsonb_build_object('ok', true, 'order_id', o.id, 'stage', o.stage, 'already', true);
  end if;
  if o.stage not in ('placed', 'confirmed') then
    raise exception 'This order is % and can no longer be declined. Ask NexG support to cancel it.', o.stage
      using errcode = '22023', hint = 'wrong_stage';
  end if;

  v_label := case p_reason
    when 'out_of_stock'   then 'Something in the order has run out'
    when 'closing'        then 'The shop is closing'
    when 'too_busy'       then 'The shop is too busy right now'
    when 'cannot_deliver' then 'The shop cannot serve this address'
    when 'other'          then 'Other'
  end;
  if v_label is null then
    raise exception 'Choose why: out of stock, closing, too busy, cannot deliver there, or other.'
      using errcode = '22023', hint = 'bad_reason';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'Say why, so the customer knows.' using errcode = '22023', hint = 'note_needed';
  end if;
  v_note := left(v_note, 300);

  if exists (select 1 from public.payment_prompt pr
               join public.payment p on p.id = pr.payment_id
              where p.order_id = o.id and pr.resolved_at is null
                and pr.sent_at > now() - interval '2 minutes') then
    raise exception 'The customer has an M-Pesa prompt open. Wait a minute, then decline.'
      using errcode = '22023', hint = 'prompt_open';
  end if;

  v_paid := o.payment_status in ('paid', 'collected', 'partially_refunded')
         or exists (select 1 from public.payment p where p.order_id = o.id and p.state = 'paid');

  update public.payment
     set state = 'abandoned', updated_at = now(),
         failure_reason = coalesce(failure_reason, 'declined by the shop')
   where order_id = o.id and state in ('pending', 'authorised', 'failed');

  update public.order
     -- cancelled_by names a staff member; the reason code says it was the shop.
     set stage = 'cancelled', cancelled_at = now(), cancel_reason_code = 'merchant_declined',
         cancel_note = left(v_label || coalesce(': ' || v_note, '') || '.', 500)
   where id = o.id;

  update dispatch.job
     set state = 'cancelled', ended_at = now(), end_reason = 'merchant_declined'
   where order_id = o.id and state not in ('completed', 'cancelled');
  update dispatch.offer set outcome = 'withdrawn', responded_at = now()
   where outcome = 'pending'
     and job_id in (select id from dispatch.job where order_id = o.id);

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (o.id, 'merchant_declined', 'Declined by the shop',
          v_label || coalesce(': ' || v_note, '') || '.',
          'merchant_user', v_uid, jsonb_build_object('reason', p_reason));

  /* Paid: everything not already refunded goes back, approved at once. */
  if v_paid then
    select greatest(o.total_cents - coalesce(sum(r.amount_cents), 0), 0) into v_owed
      from public.refund r
     where r.order_id = o.id and r.status in ('requested', 'awaiting_approval', 'approved', 'issued');
    if v_owed > 0 then
      insert into public.refund (order_id, amount_cents, method, reason_code, reason_text, requested_by, status)
      values (o.id, v_owed,
              case when o.payment_method in ('mpesa_stk', 'card') then 'original' else 'mpesa_b2c' end,
              'merchant_declined', 'Declined by the shop: ' || v_label || coalesce(': ' || v_note, '') || '.',
              null, 'approved')
      returning id into v_refund;
      insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
      values (o.id, 'refund_approved', 'Refund approved',
              'KES ' || (v_owed / 100) || ' · the shop declined the order',
              'merchant_user', v_uid,
              jsonb_build_object('refund_id', v_refund, 'amount_cents', v_owed, 'automatic', true));
    end if;
  end if;

  /* The customer hears who declined and why. Same tag as the generic
     "cancelled" notice the stage change just sent, so this one replaces it. */
  select g.user_id into v_customer from public.guest g where g.id = o.guest_id;
  select m.trading_name into v_shop from public.merchant m where m.id = o.merchant_id;
  if v_customer is not null then
    perform public.fn_notify_user(
      v_customer, 'order.cancelled',
      coalesce(v_shop, 'The shop') || ' could not take your order',
      v_label || coalesce(': ' || v_note, '') || '. '
        || case when v_owed > 0
                then 'Your full refund of KES ' || (v_owed / 100) || ' is on its way.'
                else 'Nothing has been charged.' end,
      '/o/' || o.reference, 'warning'::public.notification_tone, 'order', o.id,
      'order:' || o.id::text);
  end if;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type, p_actor_id => v_uid,
    p_module => 'orders', p_action => 'order.merchant_declined',
    p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
    p_city_id => o.city_id, p_reason => p_reason || coalesce(' · ' || v_note, ''),
    p_after => jsonb_build_object('refund_cents', v_owed, 'refund_id', v_refund));

  return jsonb_build_object('ok', true, 'order_id', o.id, 'stage', 'cancelled',
                            'refund_cents', v_owed, 'refund_id', v_refund);
end;
$$;

revoke execute on function public.rpc_merchant_order_decline(uuid, text, text) from public, anon;
grant execute on function public.rpc_merchant_order_decline(uuid, text, text) to authenticated;
