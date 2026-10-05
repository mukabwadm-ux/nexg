-- A refund has three routes, and the console was offering a fourth.
--
-- `refund.method` is how the money gets back: reverse the original
-- payment, send M-Pesa, or credit the next order. The panel was
-- passing the *payment* method instead, so a cash-on-delivery order
-- tried to refund "to cash_on_delivery" and hit a check constraint
-- with nothing readable to say.
--
-- Two smaller corrections from the same pass: the status vocabulary
-- is `awaiting_approval`, not `pending`, and a refund reason is
-- required rather than optional. All three were the table telling
-- the truth and the function not listening.

/*
 * Which routes work for this order, and which does not and why.
 * Read by the panel so the choice offered is one that can succeed.
 */
create or replace function public.fn_refund_routes(p_order_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'routes', jsonb_build_array(
      jsonb_build_object(
        'key', 'original',
        'label', 'Back the way they paid',
        'available', o.payment_method in ('mpesa_stk', 'card'),
        'why', case when o.payment_method not in ('mpesa_stk', 'card')
                    then 'They did not pay through a provider, so there is nothing to reverse.' end),
      jsonb_build_object(
        'key', 'mpesa_b2c', 'label', 'Send M-Pesa to their number',
        'available', true, 'why', null),
      jsonb_build_object(
        'key', 'wallet_credit', 'label', 'Credit against their next order',
        'available', true, 'why', null)),
    'suggested', case when o.payment_method in ('mpesa_stk', 'card')
                      then 'original' else 'mpesa_b2c' end,
    'max_cents', o.total_cents
      - coalesce((select sum(r.amount_cents) from public.refund r
                   where r.order_id = o.id
                     and r.status in ('requested', 'awaiting_approval', 'approved', 'issued')), 0))
  from public.order o where o.id = p_order_id
$$;

create or replace function public.rpc_order_refund(
  p_order_id uuid, p_amount_cents bigint, p_method text,
  p_reason_code text, p_reason_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  o public.order;
  v_me uuid;
  v_threshold bigint;
  v_already bigint;
  v_refund uuid;
  v_needs_two boolean;
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;
  v_me := public.fn_order_require(o.city_id, 'refund an order');

  if coalesce(p_amount_cents, 0) <= 0 then raise exception 'How much?'; end if;
  if coalesce(trim(p_reason_code), '') = '' then
    raise exception 'Pick a reason code. Finance reconciles against it.';
  end if;

  /* Required, not optional. A code alone says "quality"; the text
     is what the person reading this in three months needs. */
  if coalesce(trim(p_reason_text), '') = '' then
    raise exception 'Say what happened. The code groups it; the sentence explains it to whoever reads this later.';
  end if;

  if p_method not in ('original', 'wallet_credit', 'mpesa_b2c') then
    raise exception 'A refund goes back the way they paid, out by M-Pesa, or as credit on their next order — not as %.',
      p_method;
  end if;
  if p_method = 'original' and o.payment_method not in ('mpesa_stk', 'card') then
    raise exception 'They paid by %, so there is nothing to reverse. Send M-Pesa, or credit their next order.',
      replace(o.payment_method::text, '_', ' ');
  end if;

  select coalesce(sum(amount_cents), 0) into v_already
    from public.refund
   where order_id = p_order_id
     and status in ('requested', 'awaiting_approval', 'approved', 'issued');

  if v_already + p_amount_cents > o.total_cents then
    raise exception 'That would refund KES % against a KES % order. Already refunded or in flight: KES %.',
      (v_already + p_amount_cents) / 100, o.total_cents / 100, v_already / 100;
  end if;

  v_threshold := settings.fn_int('finance.refund_two_person_threshold', o.city_id);
  v_needs_two := v_threshold is not null and p_amount_cents >= v_threshold;

  insert into public.refund
    (order_id, amount_cents, method, reason_code, reason_text, requested_by, status)
  values (p_order_id, p_amount_cents, p_method, p_reason_code, p_reason_text, v_me,
          case when v_needs_two then 'awaiting_approval' else 'approved' end)
  returning id into v_refund;

  if v_needs_two then
    insert into public.approval_request
      (kind, target_type, target_id, city_id, requested_by, reason, payload)
    values ('experience_refund', 'order_refund', v_refund, o.city_id, v_me,
            p_reason_code || ' · ' || p_reason_text,
            jsonb_build_object('order', o.reference, 'amount_cents', p_amount_cents,
                               'threshold_cents', v_threshold, 'method', p_method));
  end if;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (p_order_id,
          case when v_needs_two then 'refund_requested' else 'refund_approved' end,
          case when v_needs_two then 'Refund requested' else 'Refund approved' end,
          'KES ' || (p_amount_cents / 100) || ' · ' || p_reason_code || ' · ' || p_reason_text,
          'staff', v_me,
          jsonb_build_object('refund_id', v_refund, 'amount_cents', p_amount_cents,
                             'method', p_method, 'needs_second_person', v_needs_two));

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'orders',
    p_action => case when v_needs_two then 'order.refund_requested' else 'order.refund_approved' end,
    p_actor_id => v_me,
    p_target_type => 'order', p_target_id => p_order_id, p_target_label => o.reference,
    p_city_id => o.city_id, p_severity => 'high',
    p_reason => p_reason_code || ' · ' || p_reason_text,
    p_after => jsonb_build_object('amount_cents', p_amount_cents, 'currency', o.currency,
                                  'method', p_method, 'two_person', v_needs_two));

  return jsonb_build_object(
    'ok', true, 'refund_id', v_refund, 'needs_second_person', v_needs_two,
    'message', case when v_needs_two
      then 'KES ' || (p_amount_cents / 100)
           || ' is at or over the threshold, so it is in the approvals queue rather than out.'
      /*
       * Approved is not issued, and saying "refunded" here would be
       * the console telling somebody money moved when it did not.
       */
      else 'Approved and recorded. No payment provider is connected yet, so nothing has actually moved — Finance settles it by hand.' end);
end;
$fn$;

grant execute on function public.fn_refund_routes(uuid) to authenticated;
grant execute on function public.rpc_order_refund(uuid, bigint, text, text, text) to authenticated;
