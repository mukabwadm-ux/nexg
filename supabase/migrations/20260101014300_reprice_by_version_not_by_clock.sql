-- Repricing uses the order's version ids, not the clock.
--
-- The first version of this resolved fees with
-- `settings.fn_get(key, ..., p_at => order.placed_at)`, which looks
-- right and is not. `effective_from` is a figure Finance sets, not
-- the moment they set it, so a rate card published today and dated
-- last week changes what a repriced order from yesterday costs —
-- silently, after the guest has already been quoted.
--
-- `public.order.pricing_version_ids` exists precisely so that does
-- not happen. It names the exact three rows the order was priced
-- from, and this reads those rows. A timestamp is a guess at which
-- version applied; an id is the answer.
--
-- The second fix here is smaller and was a hard failure rather than
-- a quiet one: `order_item.quantity` has a positive check, so
-- removing a line by setting the quantity to zero raised. A removed
-- line keeps its quantity and gains a `removed_at`, which is also
-- the more honest record — it says what was taken off rather than
-- pretending none was ever ordered.

create or replace function public.fn_order_reprice(p_order_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_subtotal bigint := 0;
  v_ids jsonb;
  v_delivery bigint;
  v_service numeric;
  v_commission numeric;
  v_threshold bigint;
  v_small bigint;
  v_cash bigint;
  v_missing text[] := '{}';
  v_small_fee bigint;
  v_total bigint;
begin
  select * into o from public.order where id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'message', 'No such order.'); end if;

  select coalesce(sum(
           case when ch.q is not null then ch.q else oi.quantity end
           * oi.unit_price_cents), 0)
    into v_subtotal
    from public.order_item oi
    left join lateral (
      select (c ->> 'quantity')::integer as q
        from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) c
       where (c ->> 'item_id')::uuid = oi.id
    ) ch on true
   where oi.order_id = p_order_id and oi.removed_at is null;

  v_ids := coalesce(o.pricing_version_ids, '{}'::jsonb);

  /* The exact rows this order was priced from. */
  select (v.value #>> '{}')::bigint into v_delivery
    from settings.version v where v.id = (v_ids ->> 'delivery')::uuid;
  select (v.value #>> '{}')::numeric into v_service
    from settings.version v where v.id = (v_ids ->> 'service')::uuid;
  select (v.value #>> '{}')::numeric into v_commission
    from settings.version v where v.id = (v_ids ->> 'commission')::uuid;

  if v_delivery is null then v_missing := v_missing || 'the delivery fee'::text; end if;
  if v_service is null then v_missing := v_missing || 'the service fee'::text; end if;
  if v_commission is null then v_missing := v_missing || 'the commission'::text; end if;

  /*
   * An order placed before this machinery existed has no version
   * ids. Repricing it against today's card would change what the
   * guest was quoted, so it is refused and says why rather than
   * doing that quietly.
   */
  if array_length(v_missing, 1) > 0 then
    return jsonb_build_object(
      'ok', false,
      'missing', to_jsonb(v_missing),
      'message', 'This order does not record which version of '
        || array_to_string(v_missing, ', ')
        || ' it was priced from, so it cannot be repriced without changing what the guest was quoted. Refund or waive instead.');
  end if;

  /* The two that only ever reduce a bill are read live: a small
     basket threshold or a cash fee that has since been lowered
     should not be re-imposed at the old, higher figure. */
  v_threshold := settings.fn_int('fees.small_basket_threshold', o.city_id);
  v_small := settings.fn_int('fees.small_basket_fee', o.city_id);
  v_cash := coalesce(settings.fn_int('fees.cash_handling', o.city_id), 0);

  v_small_fee := case
    when v_threshold is not null and v_small is not null and v_subtotal < v_threshold
    then v_small else 0 end;

  v_total := v_subtotal
    + v_delivery
    + round(v_subtotal * v_service / 100.0)
    + v_small_fee
    + case when o.payment_method = 'cash_on_delivery' then v_cash else 0 end
    /* Decided when the order was placed. A reprice is not a chance
       to re-decide whether it was night. */
    + o.night_surcharge_cents
    + o.concierge_fee_cents
    + o.tip_cents;

  return jsonb_build_object(
    'ok', true,
    'subtotal_cents', v_subtotal,
    'delivery_fee_cents', v_delivery,
    'service_fee_cents', round(v_subtotal * v_service / 100.0),
    'small_basket_fee_cents', v_small_fee,
    'cash_handling_cents',
      case when o.payment_method = 'cash_on_delivery' then v_cash else 0 end,
    'night_surcharge_cents', o.night_surcharge_cents,
    'concierge_fee_cents', o.concierge_fee_cents,
    'tip_cents', o.tip_cents,
    'commission_pct', v_commission,
    'commission_cents', round(v_subtotal * v_commission / 100.0),
    'total_cents', v_total,
    'was_total_cents', o.total_cents,
    'delta_cents', v_total - o.total_cents,
    'pricing_version_ids', v_ids,
    'priced_from', 'the versions this order was placed under',
    'currency', o.currency);
end;
$$;

comment on function public.fn_order_reprice is
  'Reprices against the exact settings versions the order was placed under, named by id. A timestamp would be a guess at which version applied; an id is the answer, and a backdated rate card cannot move a quote the guest already has.';

create or replace function public.rpc_order_adjust_items(
  p_order_id uuid, p_changes jsonb, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_me uuid;
  v_new jsonb;
  v_before jsonb;
  v_needs_ack boolean;
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;
  v_me := public.fn_order_require(o.city_id, 'adjust an order');

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why. The guest is told the new total and the merchant is told what changed.';
  end if;

  if o.picked_up_at is not null
     and exists (select 1 from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) c
                  where c ? 'item_id') then
    raise exception 'That order has been collected. Items cannot change once the rider has the bag — refund or waive a fee instead.';
  end if;

  v_new := public.fn_order_reprice(p_order_id, p_changes);
  if not (v_new ->> 'ok')::boolean then
    raise exception '%', v_new ->> 'message';
  end if;

  v_before := jsonb_build_object(
    'total_cents', o.total_cents, 'subtotal_cents', o.subtotal_cents,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'item_id', oi.id, 'name', oi.name, 'quantity', oi.quantity)), '[]'::jsonb)
                from public.order_item oi
               where oi.order_id = p_order_id and oi.removed_at is null));

  /*
   * A removed line keeps its quantity and gains a `removed_at`. The
   * quantity column has a positive check, and besides, "2 removed"
   * is the record somebody wants afterwards — "0 ordered" is not
   * what happened.
   */
  update public.order_item oi
     set quantity = case when ch.q = 0 then oi.quantity else ch.q end,
         line_total_cents = case when ch.q = 0 then 0 else ch.q * oi.unit_price_cents end,
         removed_at = case when ch.q = 0 then now() end
    from (select (c ->> 'item_id')::uuid as id, (c ->> 'quantity')::integer as q
            from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) c
           where c ? 'item_id') ch
   where oi.id = ch.id and oi.order_id = p_order_id;

  update public.order
     set subtotal_cents = (v_new ->> 'subtotal_cents')::bigint,
         delivery_fee_cents = (v_new ->> 'delivery_fee_cents')::bigint,
         service_fee_cents = (v_new ->> 'service_fee_cents')::bigint,
         small_basket_fee_cents = (v_new ->> 'small_basket_fee_cents')::bigint,
         night_surcharge_cents = (v_new ->> 'night_surcharge_cents')::bigint,
         concierge_fee_cents = (v_new ->> 'concierge_fee_cents')::bigint,
         cash_handling_cents = (v_new ->> 'cash_handling_cents')::bigint,
         total_cents = (v_new ->> 'total_cents')::bigint,
         commission_cents = (v_new ->> 'commission_cents')::bigint
   where id = p_order_id;

  v_needs_ack := o.picked_up_at is null
    and exists (select 1 from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) c
                 where c ? 'item_id');

  /* One row per line that moved, named for what happened to it,
     because "items changed" is not something Finance can
     reconcile against. */
  insert into public.order_adjustment
    (order_id, kind, before, after, delta_cents, reason, actor_id, requires_merchant_ack)
  select
    p_order_id,
    case when (c ->> 'quantity')::integer = 0 then 'item_removed' else 'quantity' end,
    v_before, v_new,
    case when (c ->> 'quantity')::integer = 0
         then -(oi.quantity * oi.unit_price_cents)
         else ((c ->> 'quantity')::integer - oi.quantity) * oi.unit_price_cents end,
    p_reason, v_me, v_needs_ack
  from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) c
  join public.order_item oi on oi.id = (c ->> 'item_id')::uuid
  where c ? 'item_id';

  /* A change with no item lines is a fee waiver. */
  if not exists (select 1 from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) c
                  where c ? 'item_id') then
    insert into public.order_adjustment
      (order_id, kind, before, after, delta_cents, reason, actor_id, requires_merchant_ack)
    values (p_order_id, 'fee_waived', v_before, v_new,
            (v_new ->> 'delta_cents')::bigint, p_reason, v_me, false);
  end if;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (p_order_id, 'items_adjusted', 'Items changed',
          p_reason || ' · new total KES ' || ((v_new ->> 'total_cents')::bigint / 100),
          'staff', v_me, v_new);

  insert into public.notification_log (channel, recipient, template, payload, status)
  select 'sms', g.phone, 'guest_order_adjusted',
         jsonb_build_object('order', o.reference,
           'total_cents', (v_new ->> 'total_cents')::bigint,
           'delta_cents', (v_new ->> 'delta_cents')::bigint, 'reason', p_reason),
         'queued'
    from public.guest g where g.id = o.guest_id;

  if v_needs_ack then
    insert into public.notification_log (channel, recipient, template, payload, status)
    select 'sms', coalesce(m.contact_phone, 'unknown'), 'merchant_order_adjusted',
           jsonb_build_object('order', o.reference, 'reason', p_reason, 'ack_required', true),
           case when m.contact_phone is null then 'skipped' else 'queued' end
      from public.merchant m where m.id = o.merchant_id;
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'orders',
    p_action => 'order.items_adjusted', p_actor_id => v_me,
    p_target_type => 'order', p_target_id => p_order_id,
    p_target_label => o.reference, p_city_id => o.city_id, p_reason => p_reason,
    p_severity => 'notice',
    p_before => v_before,
    p_after => v_new || jsonb_build_object('amount_cents', (v_new ->> 'delta_cents')::bigint,
                                           'currency', o.currency));

  return jsonb_build_object('ok', true, 'total_cents', (v_new ->> 'total_cents')::bigint,
    'delta_cents', (v_new ->> 'delta_cents')::bigint,
    'merchant_ack_required', v_needs_ack,
    'message', 'Repriced on the exact fee versions this order was placed under'
      || case when v_needs_ack then ', and the merchant has been asked to acknowledge.' else '.' end);
end;
$$;

grant execute on function public.fn_order_reprice(uuid, jsonb) to authenticated;
grant execute on function public.rpc_order_adjust_items(uuid, jsonb, text) to authenticated;
