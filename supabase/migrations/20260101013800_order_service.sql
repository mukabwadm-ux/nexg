-- The order service: adjusting, refunding, noting, contacting,
-- taking one on the phone, and marking what the apps failed to.
--
-- One rule runs through the money half of this file and is worth
-- stating once: an adjustment is repriced with the fee versions the
-- order was placed under, never today's. A guest who ordered on
-- Monday and had an item removed on Wednesday is not quietly
-- repriced by Tuesday's fee change. `public.order.pricing_version_ids`
-- is what makes that possible, and `fn_price_order(..., p_at)` is
-- how it is used.

create or replace function public.fn_order_require(p_city_id uuid, p_what text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare v_me uuid := authz.staff_id();
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not (authz.works_live_ops(p_city_id) or authz.reaches_module('orders')) then
    raise exception 'You cannot % in that city.', p_what using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- ═══════════════════════════════════ adjust the items

/*
 * Reprice after a change, using the order's own fee versions.
 *
 * `p_changes` is `[{item_id, quantity}]`; quantity 0 removes.
 * Returned, not applied, so the dialog can show the new total
 * before anybody commits to it.
 */
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
  v_at timestamptz;
  v_price jsonb;
  v_band smallint;
  v_total bigint;
begin
  select * into o from public.order where id = p_order_id;
  if not found then return jsonb_build_object('ok', false); end if;

  /* The instant the order was priced, so `fn_price_order` resolves
     the same fee versions it resolved then. */
  v_at := o.placed_at;

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

  select z.delivery_band into v_band from public.zone z where z.id = o.zone_id;

  v_price := public.fn_price_order(
    o.city_id,
    (select m.category::text from public.merchant m where m.id = o.merchant_id),
    v_subtotal,
    coalesce(v_band, 1::smallint),
    v_at);

  if not coalesce((v_price ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'missing', v_price -> 'missing',
      'message', 'Cannot reprice: ' ||
        array_to_string(array(select jsonb_array_elements_text(v_price -> 'missing')), ', ')
        || ' is not set for this city, and guessing would change what the guest is charged.');
  end if;

  /*
   * `fn_price_order` prices the components it owns. The night
   * surcharge and the concierge fee were decided when the order was
   * placed and are carried over rather than re-decided now — a
   * reprice is not a chance to change whether it was night.
   */
  v_total :=
      (v_price ->> 'subtotal_cents')::bigint
    + (v_price ->> 'delivery_fee_cents')::bigint
    + (v_price ->> 'service_fee_cents')::bigint
    + (v_price ->> 'small_basket_fee_cents')::bigint
    + (v_price ->> 'cash_handling_cents')::bigint
    + o.night_surcharge_cents
    + o.concierge_fee_cents
    + o.tip_cents;

  return v_price
    || jsonb_build_object(
         'ok', true,
         'night_surcharge_cents', o.night_surcharge_cents,
         'concierge_fee_cents', o.concierge_fee_cents,
         'tip_cents', o.tip_cents,
         'total_cents', v_total,
         'was_total_cents', o.total_cents,
         'delta_cents', v_total - o.total_cents,
         'priced_at', v_at,
         'currency', o.currency);
end;
$$;

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

  /*
   * After pickup the rider has the bag. Changing what is in it is
   * a conversation, not a database write — the only thing still
   * adjustable is a fee waiver, which does not change what was
   * packed.
   */
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

  update public.order_item oi
     set quantity = ch.q,
         line_total_cents = ch.q * oi.unit_price_cents,
         removed_at = case when ch.q = 0 then now() end
    from (select (c ->> 'item_id')::uuid as id, (c ->> 'quantity')::integer as q
            from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) c
           where c ? 'item_id') ch
   where oi.id = ch.id and oi.order_id = p_order_id;

  update public.order
     set subtotal_cents = (v_new ->> 'subtotal_cents')::bigint,
         delivery_fee_cents = (v_new ->> 'delivery_fee_cents')::bigint,
         service_fee_cents = (v_new ->> 'service_fee_cents')::bigint,
         small_basket_fee_cents = coalesce((v_new ->> 'small_basket_fee_cents')::bigint, 0),
         night_surcharge_cents = coalesce((v_new ->> 'night_surcharge_cents')::bigint, 0),
         concierge_fee_cents = coalesce((v_new ->> 'concierge_fee_cents')::bigint, 0),
         cash_handling_cents = coalesce((v_new ->> 'cash_handling_cents')::bigint, 0),
         total_cents = (v_new ->> 'total_cents')::bigint,
         commission_cents = coalesce((v_new ->> 'commission_cents')::bigint, commission_cents)
   where id = p_order_id;

  /* The merchant has to acknowledge anything that changes what
     they pack. A fee waiver does not. */
  v_needs_ack := o.picked_up_at is null
    and exists (select 1 from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) c
                 where c ? 'item_id');

  insert into public.order_adjustment
    (order_id, kind, before, after, delta_cents, reason, actor_id, requires_merchant_ack)
  values (p_order_id, 'items', v_before, v_new,
          (v_new ->> 'delta_cents')::bigint, p_reason, v_me, v_needs_ack);

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
           jsonb_build_object('order', o.reference, 'reason', p_reason,
                              'ack_required', true),
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
    'message', 'Repriced on the fees in force when the order was placed'
      || case when v_needs_ack then ', and the merchant has been asked to acknowledge.' else '.' end);
end;
$$;

-- ═══════════════════════════════════════════ refund

create or replace function public.rpc_order_refund(
  p_order_id uuid, p_amount_cents bigint, p_method text,
  p_reason_code text, p_reason_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  select coalesce(sum(amount_cents), 0) into v_already
    from public.refund where order_id = p_order_id and status in ('pending', 'approved', 'issued');

  if v_already + p_amount_cents > o.total_cents then
    raise exception 'That would refund KES % against a KES % order. Already refunded or pending: KES %.',
      (v_already + p_amount_cents) / 100, o.total_cents / 100, v_already / 100;
  end if;

  v_threshold := settings.fn_int('finance.refund_two_person_threshold', o.city_id);
  v_needs_two := v_threshold is not null and p_amount_cents >= v_threshold;

  insert into public.refund
    (order_id, amount_cents, method, reason_code, reason_text, requested_by, status)
  values (p_order_id, p_amount_cents, p_method, p_reason_code, p_reason_text, v_me,
          case when v_needs_two then 'pending' else 'approved' end)
  returning id into v_refund;

  if v_needs_two then
    insert into public.approval_request
      (kind, target_type, target_id, city_id, requested_by, reason, payload)
    values ('experience_refund', 'order_refund', v_refund, o.city_id, v_me,
            p_reason_code || coalesce(' · ' || p_reason_text, ''),
            jsonb_build_object('order', o.reference, 'amount_cents', p_amount_cents,
                               'threshold_cents', v_threshold, 'method', p_method));
  end if;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (p_order_id,
          case when v_needs_two then 'refund_requested' else 'refund_approved' end,
          case when v_needs_two then 'Refund requested' else 'Refund approved' end,
          'KES ' || (p_amount_cents / 100) || ' · ' || p_reason_code
            || coalesce(' · ' || p_reason_text, ''),
          'staff', v_me,
          jsonb_build_object('refund_id', v_refund, 'amount_cents', p_amount_cents,
                             'needs_second_person', v_needs_two));

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'orders',
    p_action => case when v_needs_two then 'order.refund_requested' else 'order.refund_approved' end,
    p_actor_id => v_me,
    p_target_type => 'order', p_target_id => p_order_id, p_target_label => o.reference,
    p_city_id => o.city_id, p_severity => 'high',
    p_reason => p_reason_code || coalesce(' · ' || p_reason_text, ''),
    p_after => jsonb_build_object('amount_cents', p_amount_cents, 'currency', o.currency,
                                  'method', p_method, 'two_person', v_needs_two));

  return jsonb_build_object('ok', true, 'refund_id', v_refund, 'needs_second_person', v_needs_two,
    'message', case when v_needs_two
      then 'KES ' || (p_amount_cents / 100) || ' is at or over the threshold, so it is in the approvals queue.'
      /*
       * Approved is not issued. No payment rail is connected, so
       * saying "refunded" here would be the console telling a
       * dispatcher money moved when it did not.
       */
      else 'Approved and recorded. No payment provider is connected yet, so nothing has actually moved — Finance settles it by hand.' end);
end;
$$;

-- ════════════════════════════════════ notes and contact

create or replace function public.rpc_order_add_note(
  p_order_id uuid, p_body text, p_visible_to text default 'staff'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_me uuid;
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;
  v_me := public.fn_order_require(o.city_id, 'note an order');

  if coalesce(trim(p_body), '') = '' then raise exception 'Nothing to add.'; end if;
  if p_visible_to not in ('staff', 'merchant', 'rider') then
    raise exception 'A note is visible to staff, the merchant or the rider.';
  end if;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (p_order_id, 'note', 'Note', p_body, 'staff', v_me,
          jsonb_build_object('visible_to', p_visible_to));

  if p_visible_to <> 'staff' then
    insert into public.notification_log (channel, recipient, template, payload, status)
    select 'sms', coalesce(t.phone, 'unknown'), 'order_note',
           jsonb_build_object('order', o.reference, 'body', p_body,
                              'to', p_visible_to),
           case when t.phone is null then 'skipped' else 'queued' end
      from (select case p_visible_to
                     when 'merchant' then (select m.contact_phone from public.merchant m
                                            where m.id = o.merchant_id)
                     else (select r.phone from public.rider r where r.id = o.rider_id)
                   end as phone) t;
  end if;

  return jsonb_build_object('ok', true, 'message', 'Noted.');
end;
$$;

/*
 * Reaching the guest or the rider without the console ever holding
 * their number. The panel shows `+254 7•• ••• •42`; revealing the
 * rest is a separate, audited action, because a screen that always
 * showed it would be a phone book anybody with console access could
 * copy.
 */
create or replace function public.fn_mask_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_phone is null or length(p_phone) < 6 then '[no number]'
    else left(p_phone, 5) || ' ' || repeat('•', greatest(0, length(p_phone) - 7))
         || ' ' || right(p_phone, 2)
  end
$$;

create or replace function public.rpc_order_contact(
  p_order_id uuid, p_party text, p_channel text, p_reveal boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_me uuid;
  v_phone text;
  v_who text;
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;
  v_me := public.fn_order_require(o.city_id, 'contact somebody about an order');

  if p_party not in ('guest', 'rider', 'merchant') then
    raise exception 'Contact the guest, the rider or the merchant.';
  end if;

  select case p_party
    when 'guest' then (select g.phone from public.guest g where g.id = o.guest_id)
    when 'rider' then (select r.phone from public.rider r where r.id = o.rider_id)
    else (select m.contact_phone from public.merchant m where m.id = o.merchant_id)
  end into v_phone;

  v_who := case p_party
    when 'guest' then (select g.name from public.guest g where g.id = o.guest_id)
    when 'rider' then (select trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,''))
                         from public.rider r where r.id = o.rider_id)
    else (select coalesce(m.trading_name, m.legal_name) from public.merchant m where m.id = o.merchant_id)
  end;

  if v_phone is null then
    return jsonb_build_object('ok', false,
      'message', 'We have no number for the ' || p_party || ' on this order.');
  end if;

  if p_party = 'guest' then
    update public.order set guest_contact_attempts = guest_contact_attempts + 1
     where id = p_order_id;
  end if;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (p_order_id, 'contact_attempt', 'Contacted the ' || p_party,
          p_channel || ' · ' || public.fn_mask_phone(v_phone), 'staff', v_me,
          jsonb_build_object('party', p_party, 'channel', p_channel, 'revealed', p_reveal));

  if p_reveal then
    perform audit.log(
      p_actor_type => 'staff'::public.actor_type, p_module => 'orders',
      p_action => 'order.phone_revealed', p_actor_id => v_me,
      p_target_type => 'order', p_target_id => p_order_id, p_target_label => o.reference,
      p_city_id => o.city_id, p_severity => 'high',
      p_reason => 'Contacting the ' || p_party,
      p_context => jsonb_build_object('party', p_party, 'pii', array['phone']));
  end if;

  return jsonb_build_object('ok', true, 'who', v_who,
    'phone', case when p_reveal then v_phone else public.fn_mask_phone(v_phone) end,
    'revealed', p_reveal,
    'message', case when p_reveal
      then 'Shown in full. That is on the audit log against your name.'
      else 'Recorded. No call bridge is connected yet, so dial it yourself or reveal the number.' end);
end;
$$;

-- ═══════════════════════════════════════ mark by hand

create or replace function public.rpc_order_mark(
  p_order_id uuid, p_event text, p_reason text, p_detail jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_me uuid;
  v_attempts integer;
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;
  v_me := public.fn_order_require(o.city_id, 'mark an order');

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why you are marking this by hand. The apps normally do it, so somebody will ask.';
  end if;

  if p_event = 'delivered_confirmed' then
    if o.delivered_at is not null then
      raise exception 'That order is already delivered.';
    end if;
    if coalesce(p_detail ->> 'handed_to', '') = '' then
      raise exception 'Who took it? A hand-off with no name is not a confirmation.';
    end if;

    update public.order
       set stage = 'delivered', delivered_at = now(),
           handed_to = (p_detail ->> 'handed_to')::public.handoff_target,
           payment_status = case when payment_method = 'cash_on_delivery'
                                 then 'collected'::public.order_payment_status
                                 else payment_status end
     where id = p_order_id;

    update dispatch.job set state = 'completed', ended_at = now(), end_reason = 'delivered'
     where order_id = p_order_id and state not in ('cancelled', 'completed');

    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
    values (p_order_id, 'delivered', 'Delivered · confirmed by staff',
            p_reason || ' · handed to ' || (p_detail ->> 'handed_to'),
            'staff', v_me, p_detail);

  elsif p_event = 'guest_unreachable' then
    update public.order
       set guest_unreachable = true,
           guest_contact_attempts = guest_contact_attempts + 1
     where id = p_order_id
    returning guest_contact_attempts into v_attempts;

    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
    values (p_order_id, 'guest_unreachable', 'Guest not reachable',
            p_reason || ' · attempt ' || v_attempts, 'staff', v_me, p_detail);

    perform audit.log(
      p_actor_type => 'staff'::public.actor_type, p_module => 'orders',
      p_action => 'order.guest_unreachable', p_actor_id => v_me,
      p_target_type => 'order', p_target_id => p_order_id, p_target_label => o.reference,
      p_city_id => o.city_id, p_reason => p_reason,
      p_after => jsonb_build_object('attempts', v_attempts));

    return jsonb_build_object('ok', true, 'attempts', v_attempts,
      'message', case when v_attempts >= 3
        then 'Third attempt. The return-or-hold policy applies now — decide and record which.'
        else 'Attempt ' || v_attempts || ' recorded. Three in ten minutes triggers the return policy.' end);

  elsif p_event = 'guest_reached' then
    update public.order set guest_unreachable = false where id = p_order_id;
    insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id)
    values (p_order_id, 'guest_reached', 'Guest reached', p_reason, 'staff', v_me);

  else
    raise exception 'Unknown mark: %.', p_event;
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'orders',
    p_action => 'order.marked_' || p_event, p_actor_id => v_me,
    p_target_type => 'order', p_target_id => p_order_id, p_target_label => o.reference,
    p_city_id => o.city_id, p_reason => p_reason, p_severity => 'notice',
    p_after => p_detail);

  return jsonb_build_object('ok', true, 'message', 'Recorded against your name.');
end;
$$;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('order.items_adjusted', 'orders', 'notice', false, false, true, 'Items or fees on an order changed'),
  ('order.refund_requested', 'orders', 'high', true, true, true, 'A refund above the threshold was requested'),
  ('order.refund_approved', 'orders', 'high', false, false, true, 'A refund was approved'),
  ('order.phone_revealed', 'orders', 'high', true, false, false, 'A full phone number was shown to staff'),
  ('order.guest_unreachable', 'orders', 'info', false, false, false, 'A guest could not be reached'),
  ('order.marked_delivered_confirmed', 'orders', 'notice', true, false, false, 'Delivery was confirmed by staff rather than the rider app'),
  ('order.marked_guest_unreachable', 'orders', 'info', false, false, false, 'An order was marked guest-unreachable'),
  ('order.marked_guest_reached', 'orders', 'info', false, false, false, 'A guest was reached after all'),
  ('order.manual_created', 'orders', 'notice', false, false, true, 'An order was taken on the phone by staff')
on conflict (action) do nothing;

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, sort)
values
  ('finance.refund_two_person_threshold', 'fees', 'city', 'money', 'KES',
   'Refund that needs a second person',
   'At or above this, a refund waits in the approvals queue instead of being issued on the spot. Unset means no refund is held back.',
   true, false, 'finance+ops_manager', array['orders','live_ops','finance'], 173)
on conflict (key) do nothing;

grant execute on function public.fn_order_require(uuid, text) to authenticated;
grant execute on function public.fn_order_reprice(uuid, jsonb) to authenticated;
grant execute on function public.rpc_order_adjust_items(uuid, jsonb, text) to authenticated;
grant execute on function public.rpc_order_refund(uuid, bigint, text, text, text) to authenticated;
grant execute on function public.rpc_order_add_note(uuid, text, text) to authenticated;
grant execute on function public.fn_mask_phone(text) to authenticated;
grant execute on function public.rpc_order_contact(uuid, text, text, boolean) to authenticated;
grant execute on function public.rpc_order_mark(uuid, text, text, jsonb) to authenticated;
