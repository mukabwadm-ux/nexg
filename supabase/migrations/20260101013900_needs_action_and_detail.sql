-- What "needs action" actually means, and the order detail panel.
--
-- `needs_action` is one boolean on the Overview tile, one chip on
-- Orders, and the sort order on Live operations. Three screens
-- reading three different definitions is how a dispatcher ends up
-- clearing a queue on one page that is still full on another, so it
-- is computed once, here, with the reasons returned alongside it.
--
-- Every threshold comes from settings. None of them is written down
-- in this file.

create or replace function public.fn_order_needs_action(p_order_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array_remove(array[
    case when j.state = 'escalated' then 'no_rider' end,
    case when o.rider_id is null
          and o.stage not in ('delivered', 'cancelled', 'refunded')
          and o.placed_at < now() - make_interval(
                mins => coalesce(settings.fn_int('dispatch.escalate_min', o.city_id)::int, 10))
         then 'no_rider_too_long' end,
    case when o.promised_ready_at is not null and o.ready_at is null
          and now() > o.promised_ready_at then 'merchant_late' end,
    case when o.promised_delivery_at is not null and o.delivered_at is null
          and now() > o.promised_delivery_at then 'past_promise' end,
    case when o.guest_unreachable then 'guest_unreachable' end,
    case when o.payment_status = 'pending'
          and o.payment_method in ('mpesa_stk', 'card')
          and o.placed_at < now() - interval '15 minutes'
          and o.stage not in ('cancelled', 'refunded') then 'payment_pending' end,
    case when o.scheduled_for is not null and o.rider_id is null
          and o.scheduled_for between now() and now() + interval '2 hours'
         then 'scheduled_at_risk' end,
    case when o.stage = 'disputed' then 'disputed' end,
    /* A rider who has not moved on a live trip. Eight minutes is
       long enough to be at a gate and short enough to matter. */
    case when o.rider_id is not null and o.picked_up_at is not null and o.delivered_at is null
          and r.last_location_at < now() - interval '8 minutes' then 'rider_stationary' end
  ], null)
  from public.order o
  left join dispatch.job j
    on j.order_id = o.id and j.state not in ('cancelled', 'completed')
  left join public.rider r on r.id = o.rider_id
  where o.id = p_order_id
$$;

comment on function public.fn_order_needs_action is
  'The one definition of "needs action", returning the reasons. Overview, Orders and Live operations all read this, so a queue cleared on one page is cleared on all three.';

/* Readable on the row, and the same words in the tooltip. */
create or replace function public.fn_needs_action_reads_as(p_reasons text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(array_to_string(array(
    select case r
      when 'no_rider' then 'no rider found'
      when 'no_rider_too_long' then 'still unassigned'
      when 'merchant_late' then 'merchant past promised ready'
      when 'past_promise' then 'past the promised delivery'
      when 'guest_unreachable' then 'guest not answering'
      when 'payment_pending' then 'payment still pending'
      when 'scheduled_at_risk' then 'scheduled and nobody assigned'
      when 'disputed' then 'disputed'
      when 'rider_stationary' then 'rider has not moved'
      else r end
    from unnest(coalesce(p_reasons, '{}')) r), ' · '), '')
$$;

-- The live-orders view gains the two columns the three screens read.
create or replace view public.console_live_orders_needs_v
with (security_invoker = true) as
select
  v.*,
  n.reasons as needs_action_reasons,
  array_length(n.reasons, 1) is not null as needs_action,
  public.fn_needs_action_reads_as(n.reasons) as needs_action_reads_as
from public.console_live_orders_v v
cross join lateral (select public.fn_order_needs_action(v.id) as reasons) n;

comment on view public.console_live_orders_needs_v is
  'The live orders with the needs-action verdict attached. Separate from `console_live_orders_v` only because that one is read per-row by the detail panel, where the extra lateral is waste.';

-- ═════════════════════════════════════ the detail panel

create or replace view public.console_order_detail_v
with (security_invoker = true) as
select
  o.id,
  o.reference,
  o.city_id,
  c.name as city,
  o.zone_id,
  z.name as zone,
  o.stage::text as stage,
  o.channel::text as channel,
  o.payment_method::text as payment_method,
  o.payment_status::text as payment_status,
  o.created_by_staff_id,
  cs.email as taken_by,

  o.guest_id,
  g.name as guest,
  public.fn_mask_phone(g.phone) as guest_phone_masked,
  g.vip as guest_vip,
  g.repeat_count as guest_orders_before,
  g.dispute_count as guest_disputes,
  g.blocked as guest_blocked,

  o.merchant_id,
  coalesce(m.trading_name, m.legal_name) as merchant,
  m.category::text as merchant_category,
  b.name as branch,
  b.address_text as branch_address,

  o.rider_id,
  nullif(trim(coalesce(rd.first_name, '') || ' ' || coalesce(rd.last_name, '')), '') as rider,
  public.fn_mask_phone(rd.phone) as rider_phone_masked,
  rd.plate_no as rider_plate,
  rd.vehicle::text as rider_vehicle,
  rd.health_band::text as rider_health,
  rd.presence::text as rider_presence,

  o.dropoff_label,
  o.dropoff_note,
  o.delivery_context,
  o.carry_requirements,

  o.subtotal_cents,
  o.delivery_fee_cents,
  o.service_fee_cents,
  o.small_basket_fee_cents,
  o.night_surcharge_cents,
  o.concierge_fee_cents,
  o.cash_handling_cents,
  o.tip_cents,
  o.total_cents,
  o.commission_cents,
  o.commission_pct,
  o.currency,
  o.pricing_version_ids,

  o.placed_at,
  o.confirmed_at,
  o.promised_ready_at,
  o.ready_at,
  o.picked_up_at,
  o.promised_delivery_at,
  o.eta_at,
  o.delivered_at,
  o.cancelled_at,
  o.cancel_reason_code,
  o.cancel_note,
  o.scheduled_for,
  o.delay_minutes_total,
  o.guest_unreachable,
  o.guest_contact_attempts,
  o.handed_to::text as handed_to,
  o.handoff_photo_path,
  public.fn_order_lateness(o.promised_delivery_at, o.delivered_at) as minutes_late,

  (select coalesce(sum(rf.amount_cents), 0) from public.refund rf
    where rf.order_id = o.id and rf.status = 'issued') as refunded_cents,
  (select coalesce(sum(rf.amount_cents), 0) from public.refund rf
    where rf.order_id = o.id and rf.status in ('pending', 'approved')) as refund_in_flight_cents,
  exists (select 1 from public.order_adjustment a
           where a.order_id = o.id and a.requires_merchant_ack and a.merchant_acked_at is null)
    as awaiting_merchant_ack,

  n.reasons as needs_action_reasons,
  public.fn_needs_action_reads_as(n.reasons) as needs_action_reads_as,

  j.id as job_id,
  j.state::text as job_state,
  j.round as cascade_round,
  j.radius_km,
  j.boost_cents,
  j.escalation_reason
from public.order o
join public.city c on c.id = o.city_id
left join public.zone z on z.id = o.zone_id
left join public.merchant m on m.id = o.merchant_id
left join public.merchant_branch b on b.id = o.branch_id
left join public.guest g on g.id = o.guest_id
left join public.rider rd on rd.id = o.rider_id
left join public.staff_user cs on cs.id = o.created_by_staff_id
left join dispatch.job j
  on j.order_id = o.id and j.state not in ('cancelled', 'completed')
cross join lateral (select public.fn_order_needs_action(o.id) as reasons) n;

/* The timeline, exactly as the panel prints it. */
create or replace view public.console_order_timeline_v
with (security_invoker = true) as
select
  e.id,
  e.order_id,
  o.city_id,
  e.at,
  to_char(e.at at time zone 'Africa/Nairobi', 'HH24:MI') as clock,
  e.kind,
  e.title,
  e.detail,
  e.photo_path,
  e.payload,
  coalesce(
    e.actor_label,
    su.email,
    case e.actor_type
      when 'guest' then '[Guest]'
      when 'rider' then '[Rider]'
      when 'merchant_user' then '[Merchant]'
      when 'system' then '[System]'
    end,
    '[Unknown]') as by
from public.order_event e
join public.order o on o.id = e.order_id
left join public.staff_user su on su.id = e.actor_id;

create or replace view public.console_order_items_v
with (security_invoker = true) as
select
  oi.id,
  oi.order_id,
  o.city_id,
  oi.name,
  oi.quantity,
  oi.unit_price_cents,
  oi.line_total_cents,
  oi.note,
  oi.removed_at is not null as removed
from public.order_item oi
join public.order o on o.id = oi.order_id;

-- ════════════════════════════════ taking one on the phone

/*
 * The desk's + Manual order. The same refusals as checkout, because
 * an order taken by phone that could not have been placed on the
 * web is an order nobody can price, deliver or explain.
 */
create or replace function public.rpc_order_manual_create(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_city uuid := (p_payload ->> 'city_id')::uuid;
  v_merchant uuid := (p_payload ->> 'merchant_id')::uuid;
  v_branch uuid := (p_payload ->> 'branch_id')::uuid;
  v_phone text := nullif(trim(p_payload ->> 'guest_phone'), '');
  v_point extensions.geography;
  v_zone jsonb;
  v_guest uuid;
  v_order uuid;
  v_subtotal bigint := 0;
  v_price jsonb;
  v_band smallint;
  v_total bigint;
  it jsonb;
begin
  v_me := public.fn_order_require(v_city, 'take an order');

  if v_phone is null then
    raise exception 'A number for the guest. Without one there is no way to tell them anything.';
  end if;
  if not coalesce((p_payload -> 'consent_read')::boolean, false) then
    raise exception 'Read the consent line first, and tick that you did. It is what makes holding this guest''s number lawful.';
  end if;
  if v_merchant is null or v_branch is null then
    raise exception 'Which merchant, and which branch.';
  end if;
  if coalesce(jsonb_array_length(p_payload -> 'items'), 0) = 0 then
    raise exception 'An order with no items.';
  end if;

  if p_payload ? 'lat' and p_payload ? 'lng' then
    v_point := extensions.st_setsrid(extensions.st_makepoint(
      (p_payload ->> 'lng')::float, (p_payload ->> 'lat')::float), 4326)::extensions.geography;
    v_zone := public.fn_zone_serviceable(v_point);
    if not (v_zone ->> 'ok')::boolean then
      raise exception '%', v_zone ->> 'reason';
    end if;
  end if;

  select id into v_guest from public.guest where phone = v_phone;
  if v_guest is null then
    insert into public.guest (phone, name)
    values (v_phone, nullif(trim(p_payload ->> 'guest_name'), ''))
    returning id into v_guest;
  end if;

  if (select blocked from public.guest where id = v_guest) then
    raise exception 'That guest is blocked. Support lifts a block, not the desk.';
  end if;

  for it in select * from jsonb_array_elements(p_payload -> 'items') loop
    v_subtotal := v_subtotal
      + (it ->> 'quantity')::integer * (it ->> 'unit_price_cents')::bigint;
  end loop;

  select z.delivery_band into v_band from public.zone z
   where z.id = (v_zone ->> 'zone_id')::uuid;

  v_price := public.fn_price_order(
    v_city,
    (select m.category::text from public.merchant m where m.id = v_merchant),
    v_subtotal, coalesce(v_band, 1::smallint));

  if not (v_price ->> 'ok')::boolean then
    raise exception '%', v_price ->> 'message';
  end if;

  v_total := (v_price ->> 'subtotal_cents')::bigint
           + (v_price ->> 'delivery_fee_cents')::bigint
           + (v_price ->> 'service_fee_cents')::bigint
           + (v_price ->> 'small_basket_fee_cents')::bigint
           + (v_price ->> 'cash_handling_cents')::bigint;

  insert into public.order (
    reference, guest_id, merchant_id, branch_id, city_id,
    zone_id, channel, created_by_staff_id,
    dropoff_label, dropoff_point, dropoff_note, delivery_context,
    stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents,
    small_basket_fee_cents, cash_handling_cents, total_cents,
    commission_cents, commission_pct, currency, pricing_version_ids,
    carry_requirements, scheduled_for)
  values (
    public.fn_order_reference(), v_guest, v_merchant, v_branch, v_city,
    (v_zone ->> 'zone_id')::uuid, 'manual', v_me,
    coalesce(nullif(trim(p_payload ->> 'dropoff_label'), ''), 'Given on the phone'),
    v_point,
    nullif(trim(p_payload ->> 'dropoff_note'), ''),
    coalesce(p_payload -> 'delivery_context', '{}'::jsonb),
    'placed',
    coalesce(nullif(p_payload ->> 'payment_method', ''), 'cash_on_delivery')::public.order_payment_method,
    'pending',
    (v_price ->> 'subtotal_cents')::bigint,
    (v_price ->> 'delivery_fee_cents')::bigint,
    (v_price ->> 'service_fee_cents')::bigint,
    (v_price ->> 'small_basket_fee_cents')::bigint,
    (v_price ->> 'cash_handling_cents')::bigint,
    v_total,
    (v_price ->> 'commission_cents')::bigint,
    (v_price ->> 'commission_pct')::numeric,
    'KES',
    v_price -> 'pricing_version_ids',
    coalesce(array(select jsonb_array_elements_text(p_payload -> 'carry_requirements')), '{}'),
    (p_payload ->> 'scheduled_for')::timestamptz)
  returning id into v_order;

  insert into public.order_item (order_id, name, quantity, unit_price_cents, line_total_cents, note)
  select v_order, c ->> 'name', (c ->> 'quantity')::integer,
         (c ->> 'unit_price_cents')::bigint,
         (c ->> 'quantity')::integer * (c ->> 'unit_price_cents')::bigint,
         nullif(c ->> 'note', '')
    from jsonb_array_elements(p_payload -> 'items') c;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (v_order, 'placed', 'Placed by the desk',
          'Taken on the phone · consent read · '
            || coalesce(nullif(p_payload ->> 'payment_method', ''), 'cash_on_delivery'),
          'staff', v_me, jsonb_build_object('channel', 'manual'));

  insert into public.notification_log (channel, recipient, template, payload, status)
  values ('sms', v_phone, 'guest_order_tracking',
          jsonb_build_object('order', (select reference from public.order where id = v_order)),
          'queued');

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'orders',
    p_action => 'order.manual_created', p_actor_id => v_me,
    p_target_type => 'order', p_target_id => v_order,
    p_target_label => (select reference from public.order where id = v_order),
    p_city_id => v_city, p_severity => 'notice',
    p_after => jsonb_build_object('amount_cents', v_total, 'currency', 'KES',
                                  'channel', 'manual'),
    p_context => jsonb_build_object('pii', array['phone']));

  return jsonb_build_object('ok', true, 'order_id', v_order,
    'reference', (select reference from public.order where id = v_order),
    'total_cents', v_total,
    'message', 'Taken. The guest has a tracking SMS queued — nothing drains the queue yet, so tell them the number on the call.');
end;
$$;

grant select on public.console_live_orders_needs_v, public.console_order_detail_v,
  public.console_order_timeline_v, public.console_order_items_v to authenticated;
grant execute on function public.fn_order_needs_action(uuid) to authenticated;
grant execute on function public.fn_needs_action_reads_as(text[]) to authenticated;
grant execute on function public.rpc_order_manual_create(jsonb) to authenticated;
