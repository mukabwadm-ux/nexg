-- Order together: friends fill one basket from one shop, and the host places
-- it as one order. And every web order can now be collected, or scheduled.
--
-- Decided with the owner on 17 Nov 2026: each person sees their share and the
-- host pays the one order (split payments come later), pickup is added to
-- orders, and a group order can be scheduled.
--
-- 1. Pickup and a time, on every web order.
--    public.order gains fulfilment ('delivery', the default, or 'pickup').
--    A pickup order has no dropoff, so dropoff_label may be null, but only on
--    a pickup order (order_delivery_has_dropoff). fn_web_order_quote skips the
--    location, zone and band step for pickup and charges no delivery;
--    rpc_order_place_web asks a pickup order for a phone (the shop calls it)
--    and no address. Either may carry scheduled_for: at least 30 minutes and
--    at most 7 days ahead, and the shop must be open then by its hours
--    (fn_order_schedule_refusal states that rule once). Prices stay those of
--    the moment the order is placed. dispatch.rpc_job_start refuses a pickup
--    order before it writes anything: nobody is to be sent.
--
--    Not changed here: merchant_orders_v (20261206000100) still calls a
--    ready order with no rider 'waiting_for_a_rider', pickup included. The
--    merchant screens map that word to their labels, so a new
--    'ready_for_collection' needs those screens changed with it. Follow-up.
--
-- 2. Group orders. group_order is one shop's shared basket, with its host;
--    group_order_member is who is in it; group_order_item is each person's
--    own lines. RLS lets a member who has not left read all three, through
--    authz.is_group_order_member, and nothing writes to them except the RPCs
--    below. Every RPC needs a real account: a temporary (anonymous) session
--    is refused, as rpc_order_place_web refuses it (20261223000500).
--
--    The invite link carries a token made the way the caretaker link's is
--    (20260101017600): 18 random bytes, shown once, and only its sha256
--    kept. A new link replaces the old one. closes_at is when the link stops
--    letting people in (24 hours after the group starts); members already in
--    keep filling the basket until the host places or cancels it.
--
--    Placing re-prices the whole basket through fn_web_order_quote, one
--    order line per member line with "For <name>" in its note, and places it
--    through rpc_order_place_web as the host, so the group order follows
--    every rule a single web order does. Each person's share is their own
--    items plus an equal part of the fees (delivery, service, small basket
--    and cash handling), in whole cents, with any remainder on the host. The
--    shares always add up to the order total.
--
-- Rollback:
--   drop function public.rpc_group_order_create(jsonb),
--     public.rpc_group_order_update(uuid, jsonb), public.rpc_group_order_invite(uuid),
--     public.rpc_group_order_preview(text), public.rpc_group_order_join(text, text),
--     public.rpc_group_order_get(uuid), public.rpc_group_order_set_items(uuid, jsonb),
--     public.rpc_group_order_ready(uuid, boolean), public.rpc_group_order_leave(uuid),
--     public.rpc_group_order_remove(uuid, uuid), public.rpc_group_order_cancel(uuid),
--     public.rpc_group_order_quote(uuid, jsonb), public.rpc_group_order_place(uuid, jsonb),
--     public.fn_group_order_payload(uuid, jsonb);
--   drop table public.group_order_item, public.group_order_member, public.group_order;
--   drop function authz.is_group_order_member(uuid);
--   delete from audit.action_registry where action like 'group\_order.%';
--   re-run fn_web_order_quote from 20261223000400, rpc_order_place_web from
--   20261223000500 and dispatch.rpc_job_start from 20261223000600; then
--   drop function public.fn_order_schedule_refusal(uuid, timestamptz);
--   alter table public.order drop constraint order_delivery_has_dropoff;
--   (once no pickup order is left) alter table public.order alter column dropoff_label set not null;
--   alter table public.order drop column fulfilment;
--   drop type public.order_fulfilment;

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('group_order.created', 'orders', 'info', false, 'A group order was started for one shop'),
  ('group_order.updated', 'orders', 'info', false,
   'The host changed a group order''s name, picture, delivery or pickup, who pays, or its time'),
  ('group_order.invite_rotated', 'orders', 'notice', false,
   'The host made a new invite link for a group order; the old link stopped working'),
  ('group_order.joined', 'orders', 'info', false, 'Somebody joined a group order by its invite link'),
  ('group_order.left', 'orders', 'info', false, 'A member left a group order and their items went with them'),
  ('group_order.member_removed', 'orders', 'notice', false,
   'The host removed a member, and their items, from a group order'),
  ('group_order.items_set', 'orders', 'info', false, 'A member changed their own items in a group order'),
  ('group_order.ready_set', 'orders', 'info', false, 'A member said they were ready, or not yet'),
  ('group_order.cancelled', 'orders', 'notice', false, 'The host cancelled a group order'),
  ('group_order.placed', 'orders', 'info', true, 'The host placed a group order as one web order')
on conflict (action) do nothing;

-- ═══════════════════════════════════════ 1. pickup and scheduled orders

create type public.order_fulfilment as enum ('delivery', 'pickup');

alter table public.order
  add column fulfilment public.order_fulfilment not null default 'delivery';

alter table public.order alter column dropoff_label drop not null;

alter table public.order
  add constraint order_delivery_has_dropoff
  check (fulfilment = 'pickup' or dropoff_label is not null);

comment on column public.order.fulfilment is
  'Delivered to the customer, or collected by them at the shop. A pickup order has no dropoff and is never dispatched.';
comment on constraint order_delivery_has_dropoff on public.order is
  'A delivery says where it goes. Only a pickup order may leave dropoff_label empty.';

/*
 * When an order is wanted later: at least 30 minutes ahead, at most 7 days
 * ahead, and while the shop is open by its hours. Null when that time is
 * fine (or no time was asked for), otherwise the words to show.
 */
create or replace function public.fn_order_schedule_refusal(
  p_merchant_id uuid,
  p_at timestamptz
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_at is null then
    return null;
  end if;
  if p_at < now() + interval '30 minutes' then
    return 'Schedule it at least 30 minutes from now.';
  end if;
  if p_at > now() + interval '7 days' then
    return 'You can schedule an order up to 7 days ahead.';
  end if;
  if not public.fn_merchant_open_for_orders(p_merchant_id, p_at) then
    return coalesce((select mm.trading_name from public.merchant mm where mm.id = p_merchant_id),
                    'The shop') || ' is closed at that time.';
  end if;
  return null;
end;
$$;

comment on function public.fn_order_schedule_refusal(uuid, timestamptz) is
  'Why an order cannot be scheduled for this time at this shop (under 30 minutes or over 7 days ahead, or the shop is closed then), or null when it can.';

revoke execute on function public.fn_order_schedule_refusal(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_order_schedule_refusal(uuid, timestamptz) to service_role;

-- fn_web_order_quote: 20261223000400, with fulfilment and scheduled_for.
-- Pickup skips the location, zone and band step and charges no delivery; a
-- scheduled order is checked against the shop's hours at that time. Prices
-- stay those of now. rpc_order_quote_web (20260101021500) strips only
-- commission_pct, commission_cents, pricing_version_ids, city_id and
-- branch_id, so the two new keys reach the basket page as they are.
create or replace function public.fn_web_order_quote(p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant uuid := nullif(p_payload ->> 'merchant_id', '')::uuid;
  v_method text := coalesce(nullif(p_payload ->> 'payment_method', ''), 'card');
  v_fulfilment text := coalesce(nullif(p_payload ->> 'fulfilment', ''), 'delivery');
  v_when timestamptz;
  v_refusal text;
  m public.merchant;
  v_branch uuid;
  v_from extensions.geography;
  v_point extensions.geography;
  v_zone jsonb := null;
  v_distance jsonb;
  v_band smallint := 1;
  v_located boolean := false;
  v_wanted integer;
  v_found integer;
  v_lines jsonb;
  v_subtotal bigint;
  v_price jsonb;
  v_delivery bigint;
  v_cash bigint;
  v_total bigint;
begin
  if v_merchant is null then
    return jsonb_build_object('ok', false, 'message', 'Which merchant is this basket for?');
  end if;

  select * into m from public.merchant where id = v_merchant;
  if not found or m.status <> 'live' then
    return jsonb_build_object('ok', false, 'message', 'This merchant is not taking orders.');
  end if;
  if m.accepting_orders is false then
    return jsonb_build_object('ok', false, 'message', m.trading_name || ' is not taking orders right now.');
  end if;

  if v_fulfilment not in ('delivery', 'pickup') then
    return jsonb_build_object('ok', false, 'message', 'Choose delivery or pickup.');
  end if;

  begin
    v_when := nullif(p_payload ->> 'scheduled_for', '')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'message', 'Choose a time for the order.');
  end;

  /* Open now, or open at the time it is wanted. */
  if v_when is null then
    if not public.fn_merchant_open_for_orders(m.id, now()) then
      return jsonb_build_object('ok', false, 'message', m.trading_name || ' is closed right now.');
    end if;
  else
    v_refusal := public.fn_order_schedule_refusal(m.id, v_when);
    if v_refusal is not null then
      return jsonb_build_object('ok', false, 'message', v_refusal);
    end if;
  end if;

  if v_method not in ('card', 'mpesa_stk', 'bank_transfer', 'cash_on_delivery') then
    return jsonb_build_object('ok', false, 'message', 'Choose how you would like to pay.');
  end if;

  v_wanted := coalesce(jsonb_array_length(p_payload -> 'items'), 0);
  if v_wanted = 0 then
    return jsonb_build_object('ok', false, 'message', 'Your basket is empty.');
  end if;
  if v_wanted > 60 then
    return jsonb_build_object('ok', false, 'message', 'That is a lot for one order. Split it in two.');
  end if;

  /* Age-restricted items only from a shop with a verified liquor licence,
     the rule catalogue_public applies to the menu. */
  if exists (
       select 1
         from jsonb_to_recordset(p_payload -> 'items') as q(catalogue_item_id uuid)
         join public.catalogue_item i
           on i.id = q.catalogue_item_id and i.merchant_id = v_merchant
        where coalesce(i.age_restricted, false))
     and not public.fn_merchant_liquor_licensed(v_merchant) then
    return jsonb_build_object('ok', false,
      'message', m.trading_name || ' cannot sell age-restricted items on NexG yet. Remove them to continue.');
  end if;

  /* Each line is priced from the catalogue row, at the running promotion's
     price when there is one, and a line that is not this merchant's, not on
     sale, or not priced is refused rather than quietly dropped. */
  select
    jsonb_agg(jsonb_build_object(
      'catalogue_item_id', i.id,
      'name', i.name,
      'quantity', q.quantity,
      'unit_price_cents', pp.price_kes::bigint * 100,
      'list_price_cents', i.price_kes::bigint * 100,
      'promotion_id', pp.promotion_id,
      'line_total_cents', pp.price_kes::bigint * 100 * q.quantity,
      'note', nullif(trim(q.note), ''),
      'age_restricted', i.age_restricted)),
    coalesce(sum(pp.price_kes::bigint * 100 * q.quantity), 0),
    count(*)
  into v_lines, v_subtotal, v_found
  from jsonb_to_recordset(p_payload -> 'items')
         as q(catalogue_item_id uuid, quantity integer, note text)
  join public.catalogue_item i
    on i.id = q.catalogue_item_id
   and i.merchant_id = v_merchant
   and i.available
   and i.price_kes is not null
  cross join lateral public.fn_item_promo_price(i.id, i.merchant_id, i.price_kes) pp
  where q.quantity between 1 and 50;

  if v_found is distinct from v_wanted then
    return jsonb_build_object('ok', false,
      'message', 'Something in your basket is no longer available. Review it and try again.');
  end if;

  select b.id, b.location into v_branch, v_from
    from public.merchant_branch b
   where b.merchant_id = v_merchant
   order by b.is_primary desc
   limit 1;

  /* Collected at the shop: nowhere to deliver to, so no zone and no band. */
  if v_fulfilment = 'delivery'
     and p_payload ? 'lat' and p_payload ? 'lng'
     and nullif(p_payload ->> 'lat', '') is not null
     and nullif(p_payload ->> 'lng', '') is not null then
    v_point := extensions.st_setsrid(extensions.st_makepoint(
      (p_payload ->> 'lng')::float, (p_payload ->> 'lat')::float), 4326)::extensions.geography;
    v_zone := public.fn_zone_serviceable(v_point);
    if not coalesce((v_zone ->> 'ok')::boolean, false) then
      return jsonb_build_object('ok', false, 'message', v_zone ->> 'reason');
    end if;
    v_located := true;

    if v_from is not null then
      v_distance := public.fn_delivery_band(m.city_id, v_from, v_point);
      if not (v_distance ->> 'ok')::boolean then
        return jsonb_build_object('ok', false, 'message', v_distance ->> 'message');
      end if;
      v_band := (v_distance ->> 'band')::smallint;
    else
      select coalesce(z.delivery_band, 1::smallint) into v_band
        from public.zone z where z.id = nullif(v_zone ->> 'zone_id', '')::uuid;
      v_band := coalesce(v_band, 1::smallint);
    end if;
  end if;

  v_price := public.fn_price_order(m.city_id, m.category::text, v_subtotal, v_band, now(), m.id);
  if not (v_price ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'message', v_price ->> 'message');
  end if;

  /* Nothing is delivered on a pickup order, so nothing is charged for it. */
  v_delivery := case when v_fulfilment = 'pickup' then 0
                     else (v_price ->> 'delivery_fee_cents')::bigint end;

  /* The cash-handling fee is for handling cash. */
  v_cash := case when v_method = 'cash_on_delivery'
                 then (v_price ->> 'cash_handling_cents')::bigint else 0 end;

  v_total := (v_price ->> 'subtotal_cents')::bigint
           + v_delivery
           + (v_price ->> 'service_fee_cents')::bigint
           + (v_price ->> 'small_basket_fee_cents')::bigint
           + v_cash;

  if v_method = 'cash_on_delivery' then
    if not m.pay_on_delivery then
      return jsonb_build_object('ok', false,
        'message', m.trading_name || ' does not take payment on delivery. Pay online instead.');
    end if;
    if m.pay_on_delivery_cap_kes is not null and v_total > m.pay_on_delivery_cap_kes::bigint * 100 then
      return jsonb_build_object('ok', false,
        'message', 'Payment on delivery is limited to KES ' || m.pay_on_delivery_cap_kes
          || ' for this merchant. Pay online for a larger order.');
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'merchant_id', m.id,
    'merchant_name', m.trading_name,
    'city_id', m.city_id,
    'branch_id', v_branch,
    'zone_id', case when v_zone is null then null else nullif(v_zone ->> 'zone_id', '') end,
    'located', v_located,
    'payment_method', v_method,
    'fulfilment', v_fulfilment,
    'scheduled_for', v_when,
    'lines', v_lines,
    'subtotal_cents', (v_price ->> 'subtotal_cents')::bigint,
    'list_subtotal_cents', (select coalesce(sum((l ->> 'list_price_cents')::bigint * (l ->> 'quantity')::bigint), 0)
                              from jsonb_array_elements(v_lines) l),
    'delivery_fee_cents', v_delivery,
    'service_fee_cents', (v_price ->> 'service_fee_cents')::bigint,
    'small_basket_fee_cents', (v_price ->> 'small_basket_fee_cents')::bigint,
    'cash_handling_cents', v_cash,
    'total_cents', v_total,
    'commission_pct', (v_price ->> 'commission_pct')::numeric,
    'commission_cents', (v_price ->> 'commission_cents')::bigint,
    'pricing_version_ids', v_price -> 'pricing_version_ids',
    'has_age_restricted', exists (
      select 1 from jsonb_array_elements(v_lines) l where (l ->> 'age_restricted')::boolean),
    'currency', 'KES');
end;
$$;

revoke execute on function public.fn_web_order_quote(jsonb) from public, anon, authenticated;
grant execute on function public.fn_web_order_quote(jsonb) to service_role;

-- rpc_order_place_web: 20261223000500, with fulfilment and scheduled_for. A
-- pickup order needs a phone (the shop calls it) and no address, and keeps
-- no dropoff.
create or replace function public.rpc_order_place_web(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_phone text := nullif(regexp_replace(coalesce(p_payload ->> 'guest_phone', ''), '[^0-9+]', '', 'g'), '');
  v_name text := nullif(trim(p_payload ->> 'guest_name'), '');
  v_label text := nullif(trim(p_payload ->> 'dropoff_label'), '');
  v_fulfilment text := coalesce(nullif(p_payload ->> 'fulfilment', ''), 'delivery');
  q jsonb;
  v_guest public.guest;
  v_point extensions.geography;
  v_order uuid;
  v_ref text;
  v_needs text[] := '{}';
begin
  if v_uid is null then
    raise exception 'Sign in to place your order.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to place your order.' using errcode = '42501';
  end if;
  if v_phone is null or v_phone !~ '^\+?[0-9]{9,15}$' then
    raise exception '%', case when v_fulfilment = 'pickup'
                              then 'A phone number the shop can reach you on.'
                              else 'A phone number the rider can reach you on.' end;
  end if;
  if v_fulfilment <> 'pickup' then
    if v_label is null then
      raise exception 'Where should we bring it? Set your delivery address first.';
    end if;
    if nullif(p_payload ->> 'lat', '') is null or nullif(p_payload ->> 'lng', '') is null then
      raise exception 'Set your delivery address on the map first.';
    end if;
  end if;

  q := public.fn_web_order_quote(p_payload);
  if not (q ->> 'ok')::boolean then
    raise exception '%', q ->> 'message';
  end if;

  /* Collected at the shop: there is no dropoff to keep. */
  if q ->> 'fulfilment' = 'pickup' then
    v_label := null;
    v_point := null;
  else
    v_point := extensions.st_setsrid(extensions.st_makepoint(
      (p_payload ->> 'lng')::float, (p_payload ->> 'lat')::float), 4326)::extensions.geography;
  end if;

  /* One record per account, and a number belongs to the record that already
     holds it. Signing up proves an email, not a phone, so a number on file is
     never attached here; support links it after checking who is asking. */
  select * into v_guest from public.guest where user_id = v_uid;
  if not found then
    if exists (select 1 from public.guest where phone = v_phone) then
      raise exception 'That number is already on a NexG customer record. Use another number, or contact support to link it to your account.'
        using hint = 'phone_on_file';
    end if;
    insert into public.guest (user_id, phone, name)
    values (v_uid, v_phone, v_name) returning * into v_guest;
  elsif v_guest.phone is null then
    if exists (select 1 from public.guest where phone = v_phone and id <> v_guest.id) then
      raise exception 'That number is already on a NexG customer record. Use another number, or contact support to link it to your account.'
        using hint = 'phone_on_file';
    end if;
    update public.guest set phone = v_phone, name = coalesce(name, v_name)
     where id = v_guest.id returning * into v_guest;
  else
    update public.guest set name = coalesce(name, v_name)
     where id = v_guest.id returning * into v_guest;
  end if;

  if v_guest.blocked then
    raise exception 'This account cannot place orders. Contact support.';
  end if;

  if (q ->> 'has_age_restricted')::boolean then
    v_needs := v_needs || 'alcohol'::text;
  end if;

  v_ref := public.fn_order_reference();

  insert into public.order (
    reference, guest_id, merchant_id, branch_id, city_id, zone_id, channel,
    fulfilment, scheduled_for,
    dropoff_label, dropoff_point, dropoff_note, delivery_context,
    stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents,
    small_basket_fee_cents, cash_handling_cents, total_cents,
    commission_cents, commission_pct, currency, pricing_version_ids,
    carry_requirements)
  values (
    v_ref, v_guest.id, (q ->> 'merchant_id')::uuid, nullif(q ->> 'branch_id', '')::uuid,
    (q ->> 'city_id')::uuid, nullif(q ->> 'zone_id', '')::uuid, 'web',
    (q ->> 'fulfilment')::public.order_fulfilment, nullif(q ->> 'scheduled_for', '')::timestamptz,
    v_label, v_point, nullif(trim(p_payload ->> 'dropoff_note'), ''), '{}'::jsonb,
    'placed', (q ->> 'payment_method')::public.order_payment_method, 'pending',
    (q ->> 'subtotal_cents')::bigint, (q ->> 'delivery_fee_cents')::bigint,
    (q ->> 'service_fee_cents')::bigint, (q ->> 'small_basket_fee_cents')::bigint,
    (q ->> 'cash_handling_cents')::bigint, (q ->> 'total_cents')::bigint,
    (q ->> 'commission_cents')::bigint, (q ->> 'commission_pct')::numeric,
    'KES', q -> 'pricing_version_ids', v_needs)
  returning id into v_order;

  insert into public.order_item (
    order_id, catalogue_item_id, name, quantity, unit_price_cents, line_total_cents, note)
  select v_order, (l ->> 'catalogue_item_id')::uuid, l ->> 'name',
         (l ->> 'quantity')::integer, (l ->> 'unit_price_cents')::bigint,
         (l ->> 'line_total_cents')::bigint, nullif(l ->> 'note', '')
    from jsonb_array_elements(q -> 'lines') l;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (v_order, 'placed', 'Placed on the website',
          replace(q ->> 'payment_method', '_', ' '),
          'guest', v_guest.id, jsonb_build_object('channel', 'web'));

  perform audit.log(p_actor_type=>'guest'::public.actor_type,p_actor_id=>v_guest.id,p_module=>'orders',
    p_action=>'order.web_placed',p_target_type=>'order',p_target_id=>v_order,p_city_id=>(q->>'city_id')::uuid,
    p_after=>jsonb_build_object('channel','web','payment_method',q->>'payment_method',
                                'fulfilment',q->>'fulfilment','scheduled_for',q->'scheduled_for'));

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order,
    'reference', v_ref,
    'total_cents', (q ->> 'total_cents')::bigint,
    'payment_method', q ->> 'payment_method',
    'pay_online', (q ->> 'payment_method') in ('card', 'mpesa_stk', 'bank_transfer'),
    'fulfilment', q ->> 'fulfilment',
    'scheduled_for', q -> 'scheduled_for');
end;
$$;

revoke execute on function public.rpc_order_place_web(jsonb) from public, anon;
grant execute on function public.rpc_order_place_web(jsonb) to authenticated;

-- dispatch.rpc_job_start: 20261223000600, refusing a pickup order before
-- anything is written. The rest is unchanged.
create or replace function dispatch.rpc_job_start(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_job uuid;
  v_radius numeric;
  v_pickup extensions.geography;
  v_needs text[];
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;

  /* Starting a rider search is live operations' call, in the order's city. */
  if not (coalesce(auth.role(), '') = 'service_role' or authz.works_live_ops(o.city_id)) then
    raise exception 'Only live operations in this order''s city can start dispatch.'
      using errcode = '42501';
  end if;

  /* The customer collects it at the shop: there is nobody to send. */
  if o.fulfilment = 'pickup' then
    raise exception 'This order is collected by the customer; no rider is needed.';
  end if;

  if exists (select 1 from dispatch.job j
             where j.order_id = p_order_id and j.state not in ('cancelled', 'completed')) then
    return jsonb_build_object('ok', true, 'already_running', true);
  end if;

  select extensions.st_setsrid(extensions.st_makepoint(b.longitude, b.latitude), 4326)::extensions.geography
    into v_pickup
    from public.merchant_branch b where b.id = o.branch_id;

  v_radius := coalesce(settings.fn_num('dispatch.search_radius_km', o.city_id), 3);

  /*
   * Whatever the order declared, plus alcohol if it came from a
   * bar. That one is a licence rather than a preference, so it is
   * not left to whoever placed the order to remember.
   */
  v_needs := o.carry_requirements;
  if exists (select 1 from public.merchant m
              where m.id = o.merchant_id and m.category = 'bar_liquor')
     and not ('alcohol' = any (v_needs)) then
    /* Typed: an untyped literal on the right of text[] || is read as an
       array, and 'alcohol' is not one. */
    v_needs := v_needs || 'alcohol'::text;
  end if;

  insert into dispatch.job (
    order_id, city_id, zone_id, pickup_point, dropoff_point,
    pickup_label, dropoff_label, distance_km, vehicle_requirements,
    state, round, radius_km, rule_version_ids)
  values (
    p_order_id, o.city_id, o.zone_id, v_pickup, o.dropoff_point,
    coalesce((select coalesce(m.trading_name, m.legal_name) from public.merchant m
               where m.id = o.merchant_id), 'Merchant'),
    o.dropoff_label,
    case when v_pickup is not null and o.dropoff_point is not null
         then round((extensions.st_distance(v_pickup, o.dropoff_point) / 1000.0)::numeric, 2) end,
    v_needs,
    'queued', 0, v_radius,
    /* Frozen: a job that started on a 20-second window is judged
       against a 20-second window. */
    jsonb_build_object(
      'accept_window_s', settings.fn_get('dispatch.accept_window_s', 'city', o.city_id) ->> 'version_id',
      'rounds', settings.fn_get('dispatch.rounds_before_boost', 'city', o.city_id) ->> 'version_id',
      'radius', settings.fn_get('dispatch.search_radius_km', 'city', o.city_id) ->> 'version_id'))
  returning id into v_job;

  perform dispatch.fn_offer_round(v_job);

  return jsonb_build_object('ok', true, 'job_id', v_job, 'needs', to_jsonb(v_needs));
end;
$$;

revoke execute on function dispatch.rpc_job_start(uuid) from public, anon;
grant execute on function dispatch.rpc_job_start(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════ 2. group orders

create table public.group_order (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  host_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  emoji text not null,
  fulfilment public.order_fulfilment not null default 'delivery',
  payment_mode text not null default 'host_pays',
  scheduled_for timestamptz,
  status text not null default 'open',
  /* sha256 of the invite link's token. Never the token: a leaked table must
     not let anybody into every group. */
  invite_token_hash text not null unique,
  order_id uuid references public.order (id) on delete set null,
  closes_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint group_order_name_length check (char_length(name) between 1 and 60),
  constraint group_order_emoji_known check (emoji in (
    'burger', 'drumstick', 'pizza', 'sushi', 'sandwich', 'salad', 'taco', 'noodles', 'cake', 'coffee')),
  constraint group_order_payment_mode_known check (payment_mode in ('host_pays', 'split')),
  constraint group_order_status_known check (status in ('open', 'placed', 'cancelled'))
);

comment on table public.group_order is
  'Order together: one shop''s shared basket. Friends join by the invite link, each adds their own items, and the host places it as one web order. Written only through the rpc_group_order_* functions.';
comment on column public.group_order.closes_at is
  'When the invite link stops letting people in. Members already in keep filling the basket until the host places or cancels it.';
comment on column public.group_order.payment_mode is
  'host_pays, or split: everyone is shown their share. Either way the host pays the one order until split payments exist.';

create table public.group_order_member (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_order (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  ready_at timestamptz,
  left_at timestamptz,
  /* Set when the host removes this person. Unlike leaving, it keeps them out:
     the old invite link no longer lets them back in. */
  removed_at timestamptz,
  /* What this person's part of the placed order came to, in cents: their
     items and their part of the fees. Set when the host places it. */
  share_cents bigint,

  constraint group_order_member_once unique (group_id, user_id),
  constraint group_order_member_name_length check (char_length(display_name) between 1 and 40),
  constraint group_order_member_share_not_negative check (share_cents is null or share_cents >= 0)
);

comment on table public.group_order_member is
  'Who is in a group order. Leaving, or being removed, sets left_at and takes that person''s items out; joining again by the link clears it.';

create table public.group_order_item (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_order (id) on delete cascade,
  member_id uuid not null references public.group_order_member (id) on delete cascade,
  /* Cascade: a dish the shop deletes leaves the basket rather than blocking
     the delete. */
  catalogue_item_id uuid not null references public.catalogue_item (id) on delete cascade,
  quantity integer not null,
  note text,
  created_at timestamptz not null default now(),

  constraint group_order_item_quantity check (quantity between 1 and 50),
  constraint group_order_item_note_length check (note is null or char_length(note) <= 200)
);

comment on table public.group_order_item is
  'One member''s line in a group order. Priced when the basket is shown, quoted or placed, never stored with a price.';

create index group_order_host_open_idx on public.group_order (host_user_id) where status = 'open';
create index group_order_merchant_idx on public.group_order (merchant_id);
create index group_order_order_idx on public.group_order (order_id) where order_id is not null;
create index group_order_member_user_idx on public.group_order_member (user_id);
create index group_order_item_group_idx on public.group_order_item (group_id);
create index group_order_item_member_idx on public.group_order_item (member_id);
create index group_order_item_catalogue_idx on public.group_order_item (catalogue_item_id);

create trigger group_order_set_updated_at
  before update on public.group_order
  for each row execute function public.tg_set_updated_at();

-- ─────────────────────────────────────────── who reads it

create or replace function authz.is_group_order_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_order_member gm
     where gm.group_id = p_group
       and gm.user_id = (select auth.uid())
       and gm.left_at is null)
$$;

comment on function authz.is_group_order_member(uuid) is
  'The caller is in this group order and has not left it, or been removed from it.';

revoke execute on function authz.is_group_order_member(uuid) from public, anon;
grant execute on function authz.is_group_order_member(uuid) to authenticated, service_role;

alter table public.group_order enable row level security;
alter table public.group_order_member enable row level security;
alter table public.group_order_item enable row level security;

/* Members read; nobody writes except through the functions below. */
revoke all on public.group_order, public.group_order_member, public.group_order_item
  from public, anon, authenticated;
grant select on public.group_order, public.group_order_member, public.group_order_item
  to authenticated;

create policy group_order_read on public.group_order
  for select to authenticated using (authz.is_group_order_member(id));
create policy group_order_member_read on public.group_order_member
  for select to authenticated using (authz.is_group_order_member(group_id));
create policy group_order_item_read on public.group_order_item
  for select to authenticated using (authz.is_group_order_member(group_id));

-- ─────────────────────────────────────────── the order a group places

/*
 * The web order a group stands for: the shop, how it is fulfilled and when,
 * the payment method and location the caller gives, and one line per member
 * line, its note saying who it is for. Used by the quote and by placing, so
 * both price the same basket.
 */
create or replace function public.fn_group_order_payload(p_group_id uuid, p_payload jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'merchant_id', grp.merchant_id,
    'payment_method', p_payload -> 'payment_method',
    'fulfilment', grp.fulfilment,
    'scheduled_for', grp.scheduled_for,
    'lat', p_payload -> 'lat',
    'lng', p_payload -> 'lng',
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'catalogue_item_id', gi.catalogue_item_id,
               'quantity', gi.quantity,
               'note', 'For ' || gm.display_name || coalesce(': ' || nullif(btrim(gi.note), ''), ''))
             order by gm.is_host desc, gm.joined_at, gm.id, gi.created_at, gi.id)
        from public.group_order_item gi
        join public.group_order_member gm on gm.id = gi.member_id
       where gi.group_id = grp.id and gm.left_at is null), '[]'::jsonb))
  from public.group_order grp
  where grp.id = p_group_id
$$;

comment on function public.fn_group_order_payload(uuid, jsonb) is
  'The fn_web_order_quote payload for a group order: one line per member line, noted "For <name>", with the caller''s payment method and location.';

revoke execute on function public.fn_group_order_payload(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_group_order_payload(uuid, jsonb) to service_role;

-- ─────────────────────────────────────────── starting and changing a group

create or replace function public.rpc_group_order_create(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_merchant text := btrim(coalesce(p_payload ->> 'merchant_id', ''));
  v_name text := btrim(coalesce(p_payload ->> 'name', ''));
  v_emoji text := coalesce(nullif(btrim(p_payload ->> 'emoji'), ''), 'burger');
  v_fulfilment text := coalesce(nullif(btrim(p_payload ->> 'fulfilment'), ''), 'delivery');
  v_mode text := coalesce(nullif(btrim(p_payload ->> 'payment_mode'), ''), 'host_pays');
  v_display text := btrim(coalesce(p_payload ->> 'display_name', ''));
  v_when timestamptz;
  v_refusal text;
  m public.merchant;
  v_token text;
  v_group uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to order together.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to order together.' using errcode = '42501';
  end if;

  if v_merchant !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Which shop is this group order for?';
  end if;
  select * into m from public.merchant where id = v_merchant::uuid;
  if not found or m.status <> 'live' or m.deleted_at is not null then
    raise exception 'This shop is not taking orders.';
  end if;
  if m.accepting_orders is false then
    raise exception '% is not taking orders right now.', m.trading_name;
  end if;

  if char_length(v_name) not between 1 and 60 then
    raise exception 'Give the group a name of up to 60 characters.';
  end if;
  if v_emoji not in ('burger', 'drumstick', 'pizza', 'sushi', 'sandwich', 'salad', 'taco', 'noodles', 'cake', 'coffee') then
    raise exception 'Choose one of the pictures for the group.';
  end if;
  if v_fulfilment not in ('delivery', 'pickup') then
    raise exception 'Choose delivery or pickup.';
  end if;
  if v_mode not in ('host_pays', 'split') then
    raise exception 'Choose who pays for the group order.';
  end if;
  if char_length(v_display) not between 1 and 40 then
    raise exception 'Add your name, up to 40 characters, so your friends know it is you.';
  end if;

  begin
    v_when := nullif(btrim(p_payload ->> 'scheduled_for'), '')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Choose a time for the order.';
  end;
  v_refusal := public.fn_order_schedule_refusal(m.id, v_when);
  if v_refusal is not null then
    raise exception '%', v_refusal;
  end if;

  /* One host's open groups are counted one at a time. */
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group_order:' || v_uid::text, 0));
  if (select count(*) from public.group_order
       where host_user_id = v_uid and status = 'open' and closes_at > now()) >= 3 then
    raise exception 'You already have three group orders open. Place or cancel one first.';
  end if;

  /* Shown once, to the host, to share. Only its hash is kept. */
  v_token := encode(extensions.gen_random_bytes(18), 'hex');

  insert into public.group_order (
    merchant_id, host_user_id, name, emoji, fulfilment, payment_mode, scheduled_for, invite_token_hash)
  values (
    m.id, v_uid, v_name, v_emoji, v_fulfilment::public.order_fulfilment, v_mode, v_when,
    encode(extensions.digest(v_token, 'sha256'), 'hex'))
  returning id into v_group;

  insert into public.group_order_member (group_id, user_id, display_name, is_host)
  values (v_group, v_uid, v_display, true);

  perform audit.log(p_actor_type => 'guest'::public.actor_type, p_module => 'orders',
    p_action => 'group_order.created', p_actor_id => v_uid,
    p_target_type => 'group_order', p_target_id => v_group, p_city_id => m.city_id,
    p_after => jsonb_build_object('merchant_id', m.id, 'fulfilment', v_fulfilment,
                                  'payment_mode', v_mode, 'scheduled_for', v_when));

  return jsonb_build_object('ok', true, 'group_id', v_group, 'invite_token', v_token);
end;
$$;

comment on function public.rpc_group_order_create(jsonb) is
  'Starts a group order for one live shop taking orders, with the caller as host. Returns the invite token once; only its hash is kept. At most three open groups per host.';

revoke execute on function public.rpc_group_order_create(jsonb) from public, anon;
grant execute on function public.rpc_group_order_create(jsonb) to authenticated;

create or replace function public.rpc_group_order_update(p_group_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  g public.group_order;
  v_name text;
  v_emoji text;
  v_fulfilment text;
  v_mode text;
  v_when timestamptz;
  v_refusal text;
begin
  if v_uid is null then
    raise exception 'Sign in to order together.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to order together.' using errcode = '42501';
  end if;

  select * into g from public.group_order where id = p_group_id for update;
  if g.id is null or not exists (
       select 1 from public.group_order_member gm
        where gm.group_id = g.id and gm.user_id = v_uid and gm.left_at is null) then
    raise exception 'You are not in this group order.';
  end if;
  if g.host_user_id <> v_uid then
    raise exception 'Only the host can change the group order.';
  end if;
  if g.status <> 'open' then
    raise exception '%', case when g.status = 'placed' then 'This group order has already been placed.'
                              else 'This group order was cancelled.' end;
  end if;

  v_name := case when p_payload ? 'name' then btrim(coalesce(p_payload ->> 'name', '')) else g.name end;
  v_emoji := coalesce(nullif(btrim(p_payload ->> 'emoji'), ''), g.emoji);
  v_fulfilment := coalesce(nullif(btrim(p_payload ->> 'fulfilment'), ''), g.fulfilment::text);
  v_mode := coalesce(nullif(btrim(p_payload ->> 'payment_mode'), ''), g.payment_mode);

  if char_length(v_name) not between 1 and 60 then
    raise exception 'Give the group a name of up to 60 characters.';
  end if;
  if v_emoji not in ('burger', 'drumstick', 'pizza', 'sushi', 'sandwich', 'salad', 'taco', 'noodles', 'cake', 'coffee') then
    raise exception 'Choose one of the pictures for the group.';
  end if;
  if v_fulfilment not in ('delivery', 'pickup') then
    raise exception 'Choose delivery or pickup.';
  end if;
  if v_mode not in ('host_pays', 'split') then
    raise exception 'Choose who pays for the group order.';
  end if;

  /* A time is checked when it is set; null takes it back to as soon as possible. */
  v_when := g.scheduled_for;
  if p_payload ? 'scheduled_for' then
    begin
      v_when := nullif(btrim(p_payload ->> 'scheduled_for'), '')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Choose a time for the order.';
    end;
    if v_when is distinct from g.scheduled_for then
      v_refusal := public.fn_order_schedule_refusal(g.merchant_id, v_when);
      if v_refusal is not null then
        raise exception '%', v_refusal;
      end if;
    end if;
  end if;

  update public.group_order
     set name = v_name, emoji = v_emoji, fulfilment = v_fulfilment::public.order_fulfilment,
         payment_mode = v_mode, scheduled_for = v_when
   where id = g.id;

  perform audit.log(p_actor_type => 'guest'::public.actor_type, p_module => 'orders',
    p_action => 'group_order.updated', p_actor_id => v_uid,
    p_target_type => 'group_order', p_target_id => g.id,
    p_city_id => (select mm.city_id from public.merchant mm where mm.id = g.merchant_id),
    p_before => jsonb_build_object('name', g.name, 'emoji', g.emoji, 'fulfilment', g.fulfilment,
                                   'payment_mode', g.payment_mode, 'scheduled_for', g.scheduled_for),
    p_after => jsonb_build_object('name', v_name, 'emoji', v_emoji, 'fulfilment', v_fulfilment,
                                  'payment_mode', v_mode, 'scheduled_for', v_when));

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.rpc_group_order_update(uuid, jsonb) is
  'The host changes an open group order''s name, picture, delivery or pickup, who pays, or its time. Only the keys sent change; scheduled_for null clears the time.';

revoke execute on function public.rpc_group_order_update(uuid, jsonb) from public, anon;
grant execute on function public.rpc_group_order_update(uuid, jsonb) to authenticated;

create or replace function public.rpc_group_order_invite(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  g public.group_order;
  v_token text;
begin
  if v_uid is null then
    raise exception 'Sign in to order together.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to order together.' using errcode = '42501';
  end if;

  select * into g from public.group_order where id = p_group_id for update;
  if g.id is null or not exists (
       select 1 from public.group_order_member gm
        where gm.group_id = g.id and gm.user_id = v_uid and gm.left_at is null) then
    raise exception 'You are not in this group order.';
  end if;
  if g.host_user_id <> v_uid then
    raise exception 'Only the host can make a new invite link.';
  end if;
  if g.status <> 'open' then
    raise exception '%', case when g.status = 'placed' then 'This group order has already been placed.'
                              else 'This group order was cancelled.' end;
  end if;

  /* A new link is also what stops the old one working. */
  v_token := encode(extensions.gen_random_bytes(18), 'hex');
  update public.group_order
     set invite_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
   where id = g.id;

  perform audit.log(p_actor_type => 'guest'::public.actor_type, p_module => 'orders',
    p_action => 'group_order.invite_rotated', p_actor_id => v_uid,
    p_target_type => 'group_order', p_target_id => g.id,
    p_city_id => (select mm.city_id from public.merchant mm where mm.id = g.merchant_id));

  return jsonb_build_object('ok', true, 'invite_token', v_token);
end;
$$;

comment on function public.rpc_group_order_invite(uuid) is
  'The host makes a new invite link for an open group order. The old link stops working.';

revoke execute on function public.rpc_group_order_invite(uuid) from public, anon;
grant execute on function public.rpc_group_order_invite(uuid) to authenticated;

-- ─────────────────────────────────────────── the invite link

create or replace function public.rpc_group_order_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  g public.group_order;
begin
  if v_uid is null then
    raise exception 'Sign in to order together.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to order together.' using errcode = '42501';
  end if;

  if p_token is null or p_token !~* '^[0-9a-f]{20,128}$' then
    return jsonb_build_object('ok', false, 'message', 'This invite link is not valid. Ask the host for a new one.');
  end if;

  select * into g from public.group_order
   where invite_token_hash = encode(extensions.digest(lower(p_token), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('ok', false, 'message', 'This invite link is not valid. Ask the host for a new one.');
  end if;
  if g.status = 'placed' then
    return jsonb_build_object('ok', false, 'message', 'This group order has already been placed.');
  end if;
  if g.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'message', 'The host cancelled this group order.');
  end if;
  if g.closes_at <= now() then
    return jsonb_build_object('ok', false, 'message', 'This group order is no longer taking new people.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'group_id', g.id,
    'name', g.name,
    'emoji', g.emoji,
    'merchant_id', g.merchant_id,
    'merchant_name', (select mm.trading_name from public.merchant mm where mm.id = g.merchant_id),
    'host_name', (select gm.display_name from public.group_order_member gm
                   where gm.group_id = g.id and gm.is_host
                   order by gm.joined_at limit 1),
    'members', (select count(*) from public.group_order_member gm
                 where gm.group_id = g.id and gm.left_at is null),
    'status', g.status,
    'fulfilment', g.fulfilment,
    'scheduled_for', g.scheduled_for,
    'closes_at', g.closes_at);
end;
$$;

comment on function public.rpc_group_order_preview(text) is
  'What an invite link opens onto: the group, the shop, the host''s name and how many are in it. An unknown, replaced or closed link answers ok false with words to show.';

revoke execute on function public.rpc_group_order_preview(text) from public, anon;
grant execute on function public.rpc_group_order_preview(text) to authenticated;

create or replace function public.rpc_group_order_join(p_token text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_display text := btrim(coalesce(p_display_name, ''));
  g public.group_order;
  me public.group_order_member;
begin
  if v_uid is null then
    raise exception 'Sign in to order together.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to order together.' using errcode = '42501';
  end if;

  if p_token is null or p_token !~* '^[0-9a-f]{20,128}$' then
    raise exception 'This invite link is not valid. Ask the host for a new one.';
  end if;
  select * into g from public.group_order
   where invite_token_hash = encode(extensions.digest(lower(p_token), 'sha256'), 'hex')
   for update;
  if not found then
    raise exception 'This invite link is not valid. Ask the host for a new one.';
  end if;
  if g.status <> 'open' then
    raise exception '%', case when g.status = 'placed' then 'This group order has already been placed.'
                              else 'The host cancelled this group order.' end;
  end if;
  select * into me from public.group_order_member where group_id = g.id and user_id = v_uid;

  /* Already in: joining again changes nothing, even after the link has
     stopped letting new people in. */
  if me.removed_at is not null then
    raise exception 'The host removed you from this group order.';
  end if;
  if me.id is not null and me.left_at is null then
    return jsonb_build_object('ok', true, 'group_id', g.id);
  end if;

  if g.closes_at <= now() then
    raise exception 'This group order is no longer taking new people.';
  end if;
  if char_length(v_display) not between 1 and 40 then
    raise exception 'Add your name, up to 40 characters, so the group knows it is you.';
  end if;
  if (select count(*) from public.group_order_member gm
       where gm.group_id = g.id and gm.left_at is null) >= 20 then
    raise exception 'This group order is full: 20 people are in it.';
  end if;

  if me.id is null then
    insert into public.group_order_member (group_id, user_id, display_name)
    values (g.id, v_uid, v_display);
  else
    /* Back after leaving: in again, from now, with nothing in the basket. */
    update public.group_order_member
       set left_at = null, ready_at = null, display_name = v_display, joined_at = now()
     where id = me.id;
  end if;

  perform audit.log(p_actor_type => 'guest'::public.actor_type, p_module => 'orders',
    p_action => 'group_order.joined', p_actor_id => v_uid,
    p_target_type => 'group_order', p_target_id => g.id,
    p_city_id => (select mm.city_id from public.merchant mm where mm.id = g.merchant_id),
    p_after => jsonb_build_object('rejoined', me.id is not null));

  return jsonb_build_object('ok', true, 'group_id', g.id);
end;
$$;

comment on function public.rpc_group_order_join(text, text) is
  'Joins the group order an invite link names, while it is open, before closes_at and under 20 people. Joining again is harmless, and brings back somebody who left.';

revoke execute on function public.rpc_group_order_join(text, text) from public, anon;
grant execute on function public.rpc_group_order_join(text, text) to authenticated;

-- ─────────────────────────────────────────── the basket

create or replace function public.rpc_group_order_get(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  g public.group_order;
  v_licensed boolean;
  v_lines jsonb;
  v_subtotal bigint;
  v_members jsonb;
  v_order jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in to order together.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to order together.' using errcode = '42501';
  end if;
  if not authz.is_group_order_member(p_group_id) then
    raise exception 'You are not in this group order.' using errcode = '42501';
  end if;

  select * into g from public.group_order where id = p_group_id;
  v_licensed := public.fn_merchant_liquor_licensed(g.merchant_id);

  /* Each line at today's price, and whether it can still be ordered: on
     sale, priced, and (if age-restricted) from a licensed shop. */
  with lines as (
    select gi.id, gi.member_id, gi.catalogue_item_id, c.name, gi.quantity, gi.note,
           gi.created_at, gm.is_host, gm.joined_at,
           pp.price_kes::bigint * 100 as unit_price_cents,
           (c.available and c.price_kes is not null and c.merchant_id = g.merchant_id
              and (not c.age_restricted or v_licensed)) as available
      from public.group_order_item gi
      join public.group_order_member gm on gm.id = gi.member_id
      join public.catalogue_item c on c.id = gi.catalogue_item_id
      left join lateral public.fn_item_promo_price(c.id, c.merchant_id, c.price_kes) pp on true
     where gi.group_id = g.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id,
           'member_id', l.member_id,
           'catalogue_item_id', l.catalogue_item_id,
           'name', l.name,
           'quantity', l.quantity,
           'note', l.note,
           'unit_price_cents', coalesce(l.unit_price_cents, 0),
           'line_total_cents', coalesce(l.unit_price_cents, 0) * l.quantity,
           'available', l.available)
           order by l.is_host desc, l.joined_at, l.member_id, l.created_at, l.id), '[]'::jsonb),
         coalesce(sum(coalesce(l.unit_price_cents, 0) * l.quantity) filter (where l.available), 0)::bigint
    into v_lines, v_subtotal
    from lines l;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', gm.id,
           'display_name', gm.display_name,
           'is_host', gm.is_host,
           'is_me', gm.user_id = v_uid,
           'ready', gm.ready_at is not null,
           'left', gm.left_at is not null,
           'subtotal_cents', coalesce((
             select sum((l ->> 'line_total_cents')::bigint)::bigint
               from jsonb_array_elements(v_lines) l
              where (l ->> 'member_id')::uuid = gm.id and (l ->> 'available')::boolean), 0))
           order by gm.is_host desc, gm.joined_at, gm.id), '[]'::jsonb)
    into v_members
    from public.group_order_member gm
   where gm.group_id = g.id;

  /* Once placed, members see where the order is and its reference, and
     nothing else about it. */
  select jsonb_build_object('id', o.id, 'reference', o.reference, 'stage', o.stage)
    into v_order
    from public.order o
   where o.id = g.order_id;

  return jsonb_build_object(
    'ok', true,
    'group', jsonb_build_object(
      'id', g.id,
      'merchant_id', g.merchant_id,
      'merchant_name', (select mm.trading_name from public.merchant mm where mm.id = g.merchant_id),
      'name', g.name,
      'emoji', g.emoji,
      'fulfilment', g.fulfilment,
      'payment_mode', g.payment_mode,
      'scheduled_for', g.scheduled_for,
      'status', g.status,
      'closes_at', g.closes_at),
    'members', v_members,
    'items', v_lines,
    'subtotal_cents', v_subtotal,
    'order', v_order);
end;
$$;

comment on function public.rpc_group_order_get(uuid) is
  'A member''s view of a group order: the group, who is in it, every line at today''s price, and once placed the order''s reference and stage. Anybody else is refused (42501).';

revoke execute on function public.rpc_group_order_get(uuid) from public, anon;
grant execute on function public.rpc_group_order_get(uuid) to authenticated;

create or replace function public.rpc_group_order_set_items(p_group_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  g public.group_order;
  me public.group_order_member;
  v_shop text;
  v_wanted integer;
  v_found integer;
  v_others integer;
begin
  if v_uid is null then
    raise exception 'Sign in to order together.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to order together.' using errcode = '42501';
  end if;

  select * into g from public.group_order where id = p_group_id for update;
  select * into me from public.group_order_member
   where group_id = p_group_id and user_id = v_uid and left_at is null;
  if g.id is null or me.id is null then
    raise exception 'You are not in this group order.';
  end if;
  if g.status <> 'open' then
    raise exception '%', case when g.status = 'placed' then 'This group order has already been placed.'
                              else 'This group order was cancelled.' end;
  end if;

  if jsonb_typeof(v_items) <> 'array' then
    raise exception 'Send your items as a list.';
  end if;
  v_wanted := jsonb_array_length(v_items);

  /* Each line names an item, 1 to 50 of it, with a note of up to 200
     characters. Checked before anything is cast. */
  if exists (
       select 1 from jsonb_array_elements(v_items) e
        where jsonb_typeof(e) <> 'object'
           or coalesce(e ->> 'catalogue_item_id', '')
                !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or not (case when coalesce(e ->> 'quantity', '') ~ '^[0-9]{1,2}$'
                        then (e ->> 'quantity')::integer between 1 and 50
                        else false end)
           or char_length(coalesce(e ->> 'note', '')) > 200) then
    raise exception 'Choose between 1 and 50 of each item, with a note of up to 200 characters.';
  end if;

  select mm.trading_name into v_shop from public.merchant mm where mm.id = g.merchant_id;

  /* This shop's items, on sale and priced. */
  select count(*) into v_found
    from jsonb_array_elements(v_items) e
    join public.catalogue_item c
      on c.id = (e ->> 'catalogue_item_id')::uuid
     and c.merchant_id = g.merchant_id
     and c.available
     and c.price_kes is not null;
  if v_found <> v_wanted then
    raise exception 'Something you chose is not available from % right now. Choose again.', v_shop;
  end if;

  /* The menu's rule: age-restricted items only from a licensed shop. */
  if exists (
       select 1 from jsonb_array_elements(v_items) e
         join public.catalogue_item c on c.id = (e ->> 'catalogue_item_id')::uuid
        where c.age_restricted)
     and not public.fn_merchant_liquor_licensed(g.merchant_id) then
    raise exception '% cannot sell age-restricted items on NexG yet. Choose something else.', v_shop;
  end if;

  select count(*) into v_others
    from public.group_order_item gi
   where gi.group_id = g.id and gi.member_id <> me.id;
  if v_others + v_wanted > 60 then
    raise exception 'A group order holds up to 60 lines, and this would make %. Take something out first.',
      v_others + v_wanted;
  end if;

  /* The caller's own lines, replaced in the order they were sent. */
  delete from public.group_order_item where member_id = me.id;
  insert into public.group_order_item (group_id, member_id, catalogue_item_id, quantity, note, created_at)
  select g.id, me.id, (x.e ->> 'catalogue_item_id')::uuid, (x.e ->> 'quantity')::integer,
         nullif(btrim(x.e ->> 'note'), ''), now() + x.n * interval '1 microsecond'
    from jsonb_array_elements(v_items) with ordinality as x(e, n);

  /* A changed basket is not ready until its owner says so again. */
  update public.group_order_member set ready_at = null where id = me.id;

  perform audit.log(p_actor_type => 'guest'::public.actor_type, p_module => 'orders',
    p_action => 'group_order.items_set', p_actor_id => v_uid,
    p_target_type => 'group_order', p_target_id => g.id,
    p_city_id => (select mm.city_id from public.merchant mm where mm.id = g.merchant_id),
    p_after => jsonb_build_object('member_id', me.id, 'lines', v_wanted));

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.rpc_group_order_set_items(uuid, jsonb) is
  'Replaces the caller''s own lines in an open group order: this shop''s items on sale, 1 to 50 each, notes up to 200 characters, at most 60 lines for the whole group. Clears the caller''s ready mark.';

revoke execute on function public.rpc_group_order_set_items(uuid, jsonb) from public, anon;
grant execute on function public.rpc_group_order_set_items(uuid, jsonb) to authenticated;

create or replace function public.rpc_group_order_ready(p_group_id uuid, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  g public.group_order;
  me public.group_order_member;
begin
  if v_uid is null then
    raise exception 'Sign in to order together.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to order together.' using errcode = '42501';
  end if;

  select * into g from public.group_order where id = p_group_id for update;
  select * into me from public.group_order_member
   where group_id = p_group_id and user_id = v_uid and left_at is null;
  if g.id is null or me.id is null then
    raise exception 'You are not in this group order.';
  end if;
  if g.status <> 'open' then
    raise exception '%', case when g.status = 'placed' then 'This group order has already been placed.'
                              else 'This group order was cancelled.' end;
  end if;

  update public.group_order_member
     set ready_at = case when coalesce(p_ready, false) then now() end
   where id = me.id;

  perform audit.log(p_actor_type => 'guest'::public.actor_type, p_module => 'orders',
    p_action => 'group_order.ready_set', p_actor_id => v_uid,
    p_target_type => 'group_order', p_target_id => g.id,
    p_city_id => (select mm.city_id from public.merchant mm where mm.id = g.merchant_id),
    p_after => jsonb_build_object('member_id', me.id, 'ready', coalesce(p_ready, false)));

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.rpc_group_order_ready(uuid, boolean) is
  'A member says their part of an open group order is ready, or not yet.';

revoke execute on function public.rpc_group_order_ready(uuid, boolean) from public, anon;
grant execute on function public.rpc_group_order_ready(uuid, boolean) to authenticated;

-- ─────────────────────────────────────────── leaving, removing, cancelling

create or replace function public.rpc_group_order_leave(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  g public.group_order;
  me public.group_order_member;
begin
  if v_uid is null then
    raise exception 'Sign in to order together.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to order together.' using errcode = '42501';
  end if;

  select * into g from public.group_order where id = p_group_id for update;
  select * into me from public.group_order_member
   where group_id = p_group_id and user_id = v_uid and left_at is null;
  if g.id is null or me.id is null then
    raise exception 'You are not in this group order.';
  end if;
  if me.is_host then
    raise exception 'The host cannot leave the group order. Cancel it instead.';
  end if;
  if g.status <> 'open' then
    raise exception '%', case when g.status = 'placed' then 'This group order has already been placed.'
                              else 'This group order was cancelled.' end;
  end if;

  delete from public.group_order_item where member_id = me.id;
  update public.group_order_member set left_at = now(), ready_at = null where id = me.id;

  perform audit.log(p_actor_type => 'guest'::public.actor_type, p_module => 'orders',
    p_action => 'group_order.left', p_actor_id => v_uid,
    p_target_type => 'group_order', p_target_id => g.id,
    p_city_id => (select mm.city_id from public.merchant mm where mm.id = g.merchant_id),
    p_after => jsonb_build_object('member_id', me.id));

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.rpc_group_order_leave(uuid) is
  'A member other than the host leaves an open group order. Their items go with them.';

revoke execute on function public.rpc_group_order_leave(uuid) from public, anon;
grant execute on function public.rpc_group_order_leave(uuid) to authenticated;

create or replace function public.rpc_group_order_remove(p_group_id uuid, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  g public.group_order;
  v_member public.group_order_member;
begin
  if v_uid is null then
    raise exception 'Sign in to order together.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to order together.' using errcode = '42501';
  end if;

  select * into g from public.group_order where id = p_group_id for update;
  if g.id is null or not exists (
       select 1 from public.group_order_member gm
        where gm.group_id = g.id and gm.user_id = v_uid and gm.left_at is null) then
    raise exception 'You are not in this group order.';
  end if;
  if g.host_user_id <> v_uid then
    raise exception 'Only the host can remove somebody from the group order.';
  end if;
  if g.status <> 'open' then
    raise exception '%', case when g.status = 'placed' then 'This group order has already been placed.'
                              else 'This group order was cancelled.' end;
  end if;

  select * into v_member from public.group_order_member
   where id = p_member_id and group_id = g.id;
  if v_member.id is null then
    raise exception 'That person is not in this group order.';
  end if;
  if v_member.is_host then
    raise exception 'The host cannot be removed. Cancel the group order instead.';
  end if;
  if v_member.left_at is not null then
    return jsonb_build_object('ok', true);
  end if;

  delete from public.group_order_item where member_id = v_member.id;
  update public.group_order_member set left_at = now(), removed_at = now(), ready_at = null where id = v_member.id;

  perform audit.log(p_actor_type => 'guest'::public.actor_type, p_module => 'orders',
    p_action => 'group_order.member_removed', p_actor_id => v_uid,
    p_target_type => 'group_order', p_target_id => g.id,
    p_city_id => (select mm.city_id from public.merchant mm where mm.id = g.merchant_id),
    p_after => jsonb_build_object('member_id', v_member.id));

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.rpc_group_order_remove(uuid, uuid) is
  'The host removes a member, and their items, from an open group order. They can come back by the link unless the host makes a new one.';

revoke execute on function public.rpc_group_order_remove(uuid, uuid) from public, anon;
grant execute on function public.rpc_group_order_remove(uuid, uuid) to authenticated;

create or replace function public.rpc_group_order_cancel(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  g public.group_order;
begin
  if v_uid is null then
    raise exception 'Sign in to order together.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to order together.' using errcode = '42501';
  end if;

  select * into g from public.group_order where id = p_group_id for update;
  if g.id is null or not exists (
       select 1 from public.group_order_member gm
        where gm.group_id = g.id and gm.user_id = v_uid and gm.left_at is null) then
    raise exception 'You are not in this group order.';
  end if;
  if g.host_user_id <> v_uid then
    raise exception 'Only the host can cancel the group order.';
  end if;
  if g.status <> 'open' then
    raise exception '%', case when g.status = 'placed' then 'This group order has already been placed.'
                              else 'This group order was cancelled.' end;
  end if;

  update public.group_order set status = 'cancelled' where id = g.id;

  perform audit.log(p_actor_type => 'guest'::public.actor_type, p_module => 'orders',
    p_action => 'group_order.cancelled', p_actor_id => v_uid,
    p_target_type => 'group_order', p_target_id => g.id,
    p_city_id => (select mm.city_id from public.merchant mm where mm.id = g.merchant_id));

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.rpc_group_order_cancel(uuid) is
  'The host cancels an open group order. Members still see it, cancelled.';

revoke execute on function public.rpc_group_order_cancel(uuid) from public, anon;
grant execute on function public.rpc_group_order_cancel(uuid) to authenticated;

-- ─────────────────────────────────────────── what it costs, and placing it

create or replace function public.rpc_group_order_quote(p_group_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  g public.group_order;
  q jsonb;
  v_fees bigint;
  v_items bigint;
  v_shares jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in to order together.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to order together.' using errcode = '42501';
  end if;

  select * into g from public.group_order where id = p_group_id;
  if g.id is null or not exists (
       select 1 from public.group_order_member gm
        where gm.group_id = g.id and gm.user_id = v_uid and gm.left_at is null) then
    raise exception 'You are not in this group order.';
  end if;
  if g.status <> 'open' then
    raise exception '%', case when g.status = 'placed' then 'This group order has already been placed.'
                              else 'This group order was cancelled.' end;
  end if;
  if not exists (
       select 1 from public.group_order_item gi
         join public.group_order_member gm on gm.id = gi.member_id
        where gi.group_id = g.id and gm.left_at is null) then
    raise exception 'Nobody has added anything yet.';
  end if;

  /* The same pricer as any web order, for the whole basket at once. */
  q := public.fn_web_order_quote(public.fn_group_order_payload(g.id, p_payload));
  if not coalesce((q ->> 'ok')::boolean, false) then
    raise exception '%', coalesce(q ->> 'message', 'This group order cannot be priced right now.');
  end if;

  v_fees := (q ->> 'delivery_fee_cents')::bigint + (q ->> 'service_fee_cents')::bigint
          + (q ->> 'small_basket_fee_cents')::bigint + (q ->> 'cash_handling_cents')::bigint;

  /* Each person with items: their items, at the prices just quoted, and an
     equal part of the fees in whole cents. What does not divide evenly is the
     host's, with items or without. */
  with per_member as (
    select gm.id as member_id, gm.display_name, gm.is_host, gm.joined_at,
           sum(pp.price_kes::bigint * 100 * gi.quantity)::bigint as items_cents
      from public.group_order_member gm
      join public.group_order_item gi on gi.member_id = gm.id
      join public.catalogue_item c on c.id = gi.catalogue_item_id
      cross join lateral public.fn_item_promo_price(c.id, c.merchant_id, c.price_kes) pp
     where gm.group_id = g.id and gm.left_at is null
     group by gm.id, gm.display_name, gm.is_host, gm.joined_at
  ),
  split as (
    select count(*)::bigint as n,
           coalesce(sum(p.items_cents), 0)::bigint as items,
           v_fees / greatest(count(*), 1)::bigint as part
      from per_member p
  ),
  shares as (
    select p.member_id, p.display_name, p.is_host, p.joined_at, p.items_cents,
           s.part + case when p.is_host then v_fees - s.part * s.n else 0 end as fees_cents
      from per_member p
      cross join split s
    union all
    select gm.id, gm.display_name, gm.is_host, gm.joined_at, 0::bigint, v_fees - s.part * s.n
      from public.group_order_member gm
      cross join split s
     where gm.group_id = g.id and gm.is_host and gm.left_at is null
       and v_fees - s.part * s.n > 0
       and not exists (select 1 from per_member p where p.member_id = gm.id)
  )
  select (select s.items from split s),
         coalesce(jsonb_agg(jsonb_build_object(
           'member_id', x.member_id,
           'display_name', x.display_name,
           'items_cents', x.items_cents,
           'fees_cents', x.fees_cents,
           'total_cents', x.items_cents + x.fees_cents)
           order by x.is_host desc, x.joined_at, x.member_id), '[]'::jsonb)
    into v_items, v_shares
    from shares x;

  /* The shares are only right if they priced the same lines the quote did. */
  if v_items is distinct from (q ->> 'subtotal_cents')::bigint then
    raise exception 'Prices changed while the group order was being priced. Try again.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'subtotal_cents', (q ->> 'subtotal_cents')::bigint,
    'delivery_fee_cents', (q ->> 'delivery_fee_cents')::bigint,
    'service_fee_cents', (q ->> 'service_fee_cents')::bigint,
    'small_basket_fee_cents', (q ->> 'small_basket_fee_cents')::bigint,
    'cash_handling_cents', (q ->> 'cash_handling_cents')::bigint,
    'total_cents', (q ->> 'total_cents')::bigint,
    'currency', q ->> 'currency',
    'fulfilment', q ->> 'fulfilment',
    'shares', v_shares);
end;
$$;

comment on function public.rpc_group_order_quote(uuid, jsonb) is
  'Prices an open group order as one web order (p_payload: payment_method, and lat and lng for delivery) and says each person''s share: their items plus an equal part of the fees, the remainder on the host. The shares add up to the total.';

revoke execute on function public.rpc_group_order_quote(uuid, jsonb) from public, anon;
grant execute on function public.rpc_group_order_quote(uuid, jsonb) to authenticated;

create or replace function public.rpc_group_order_place(p_group_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  g public.group_order;
  v_quote jsonb;
  v_placed jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in to order together.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to order together.' using errcode = '42501';
  end if;

  /* Locked, so nobody's basket changes while it is placed. */
  select * into g from public.group_order where id = p_group_id for update;
  if g.id is null or not exists (
       select 1 from public.group_order_member gm
        where gm.group_id = g.id and gm.user_id = v_uid and gm.left_at is null) then
    raise exception 'You are not in this group order.';
  end if;
  if g.host_user_id <> v_uid then
    raise exception 'Only the host can place the group order.';
  end if;
  if g.status <> 'open' then
    raise exception '%', case when g.status = 'placed' then 'This group order has already been placed.'
                              else 'This group order was cancelled.' end;
  end if;

  /* The shares, and every refusal a quote can give (an empty basket among them). */
  v_quote := public.rpc_group_order_quote(g.id, v_payload);

  /* One web order, placed as the host, with the host's phone and address. */
  v_placed := public.rpc_order_place_web(
    public.fn_group_order_payload(g.id, v_payload)
    || jsonb_build_object(
         'guest_phone', v_payload -> 'guest_phone',
         'guest_name', v_payload -> 'guest_name',
         'dropoff_label', v_payload -> 'dropoff_label',
         'dropoff_note', v_payload -> 'dropoff_note'));

  if (v_placed ->> 'total_cents')::bigint is distinct from (v_quote ->> 'total_cents')::bigint then
    raise exception 'The total changed while the order was placed. Check the group order and try again.';
  end if;

  update public.group_order
     set order_id = (v_placed ->> 'order_id')::uuid, status = 'placed'
   where id = g.id;

  update public.group_order_member gm
     set share_cents = coalesce((
           select (s ->> 'total_cents')::bigint
             from jsonb_array_elements(v_quote -> 'shares') s
            where (s ->> 'member_id')::uuid = gm.id), 0)
   where gm.group_id = g.id and gm.left_at is null;

  perform audit.log(p_actor_type => 'guest'::public.actor_type, p_module => 'orders',
    p_action => 'group_order.placed', p_actor_id => v_uid,
    p_target_type => 'group_order', p_target_id => g.id,
    p_city_id => (select mm.city_id from public.merchant mm where mm.id = g.merchant_id),
    p_after => jsonb_build_object('order_id', v_placed ->> 'order_id',
                                  'reference', v_placed ->> 'reference',
                                  'total_cents', (v_placed ->> 'total_cents')::bigint,
                                  'shares', jsonb_array_length(v_quote -> 'shares')));

  return jsonb_build_object(
    'ok', true,
    'order_id', (v_placed ->> 'order_id')::uuid,
    'reference', v_placed ->> 'reference',
    'total_cents', (v_placed ->> 'total_cents')::bigint,
    'shares', v_quote -> 'shares');
end;
$$;

comment on function public.rpc_group_order_place(uuid, jsonb) is
  'The host places an open group order as one web order (rpc_order_place_web, as the host: p_payload holds guest_phone, guest_name, dropoff_label, dropoff_note, lat, lng and payment_method). Marks the group placed and keeps each member''s share.';

revoke execute on function public.rpc_group_order_place(uuid, jsonb) from public, anon;
grant execute on function public.rpc_group_order_place(uuid, jsonb) to authenticated;
