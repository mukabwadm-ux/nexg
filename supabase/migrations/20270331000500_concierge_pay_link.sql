-- Concierge orders with a pay link (owner, 26 Nov 2026): staff order a service
-- (food, groceries, a transfer…) for a guest who is staying, from admin Stays ›
-- Guest Spending & Concierge. The guest gets a link by SMS (and email when they
-- have one), pays by M-Pesa or card BEFORE the merchant starts, and owes nothing
-- if they don't pay.
--
-- What this adds:
--
-- 1. order_pay_link: one row per link sent. Only the sha256 of the token is
--    kept; the token itself is returned once to the staff member and sent to
--    the guest. 24 hours. RLS on, no policies (reached through the RPCs).
--    order_pay_link_miss: tokens that matched nothing, per caller, so one
--    caller walking the keyspace is refused after 20 misses in 15 minutes.
-- 2. rpc_console_concierge_catalogue / _quote / _order / _resend / _orders:
--    staff pick a merchant and its catalogue items for a booked or in-stay
--    stay; the order is priced by fn_web_order_quote exactly as a guest's web
--    order, delivered to the stay's unit (its pin, label and address), channel
--    'concierge', NO property_qr_id: the owner decided (26 Nov 2026) that guest
--    orders staff place are NexG's alone and not shared with the host, unlike
--    an order the guest places by scanning the unit's QR card; the order is
--    tied to its stay through order_pay_link.stay_id instead, and
--    console_stays_orders counts it in the guest's spending. created_by_staff_id, payment pending. Writers are gated by
--    authz.works_hospitality(null) or the orders module and audited.
-- 3. rpc_pay_link_view (anon): the order's summary and its payment state for a
--    valid token, or why it cannot be paid (expired, replaced, cancelled, paid).
--    rpc_pay_link_begin (any session, a temporary one included): opens or
--    reuses the order's payment for the caller, so the existing Paystack and
--    M-Pesa functions (rpc_payment_paystack_attempt, _opened, the Daraja
--    prompt) run unchanged for that order only.
-- 4. cron_expire_unpaid_mpesa_orders (from 20270328000100): a pay-link order
--    is not closed after 30 minutes; it is closed once its last link has run
--    out (24 hours), with the same "a try is still in progress" guards.
--
-- Rollback: drop the functions in sections 2–3, fn_pay_link_issue,
-- fn_concierge_context, fn_concierge_gate, fn_concierge_phone, the two tables
-- and the three audit actions; restore cron_expire_unpaid_mpesa_orders from
-- 20270328000100.

-- ═══════════════════════════════════════════════════════════════ 0. audit

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('order.concierge_created', 'orders', 'notice', true,
   'Staff ordered a service for a staying guest; the guest was sent a pay link'),
  ('order.pay_link_resent', 'orders', 'notice', false,
   'Staff sent a concierge order''s pay link again (the earlier link stops working)'),
  ('order.pay_link_payment_begun', 'orders', 'info', true,
   'A guest opened a concierge order''s pay link and started paying')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════════════════ 1. tables

create table if not exists public.order_pay_link (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order (id) on delete cascade,
  stay_id uuid references public.stay (id) on delete set null,
  /* sha256 (hex) of the link's token. Never the token. */
  token_hash text not null unique,
  expires_at timestamptz not null,
  /* When a payment was first started through it. */
  used_at timestamptz,
  /* A newer link was sent; this one no longer opens. */
  revoked_at timestamptz,
  /* Where it went, masked: '+254 ••• ••• •78', 'a•••@example.com'. */
  sent_to text[] not null default '{}',
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint order_pay_link_hash_shape check (token_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists order_pay_link_order_idx on public.order_pay_link (order_id, created_at desc);
create index if not exists order_pay_link_stay_idx on public.order_pay_link (stay_id) where stay_id is not null;
create index if not exists order_pay_link_open_idx on public.order_pay_link (expires_at)
  where revoked_at is null;

comment on table public.order_pay_link is
  'Pay links for concierge orders: the guest pays from the link without signing in. Only the token''s sha256 is kept. Written and read only through rpc_console_concierge_* and rpc_pay_link_*.';

alter table public.order_pay_link enable row level security;
revoke all on public.order_pay_link from public, anon, authenticated;

create table if not exists public.order_pay_link_miss (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  client_key text not null
);
create index if not exists order_pay_link_miss_idx on public.order_pay_link_miss (client_key, at desc);
comment on table public.order_pay_link_miss is
  'Pay-link tokens that matched nothing, per caller (a session id, or a hash of the address the website saw). Twenty in fifteen minutes and the caller is refused for a while.';
alter table public.order_pay_link_miss enable row level security;
revoke all on public.order_pay_link_miss from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ 2. helpers

create or replace function public.fn_concierge_gate()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
begin
  if v_staff is null or not (authz.works_hospitality(null) or authz.reaches_module('orders')) then
    raise exception 'Ordering for a guest is for hospitality or orders staff.'
      using errcode = 'insufficient_privilege';
  end if;
  return v_staff;
end;
$$;
revoke all on function public.fn_concierge_gate() from public, anon, authenticated;

/* A Kenyan mobile number as +2547…/+2541…, or null. */
create or replace function public.fn_concierge_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^0[17][0-9]{8}$' then '+254' || substr(d, 2)
    when d ~ '^254[17][0-9]{8}$' then '+' || d
    when d ~ '^[17][0-9]{8}$' then '+254' || d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) x
$$;
revoke all on function public.fn_concierge_phone(text) from public, anon, authenticated;

/*
 * Everything an order for this stay needs: the stay, where to deliver (the
 * unit's pin, else its building's), the label and address, the unit's QR
 * card, the guest's name, phone and email. Raises when the stay cannot take
 * a concierge order.
 */
create or replace function public.fn_concierge_context(p_stay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.stay;
  u public.unit;
  pr public.property;
  v_point extensions.geography;
  v_email text;
  v_qr uuid;
begin
  select * into s from public.stay where id = p_stay_id;
  if s.id is null then
    raise exception 'That stay is not there.' using errcode = 'no_data_found';
  end if;
  if s.status not in ('booked', 'in_stay') or s.check_out <= now() then
    raise exception 'Concierge orders are for a guest who is booked or staying now.' using errcode = '22023';
  end if;
  if s.unit_id is null then
    raise exception 'This stay has no unit to deliver to.' using errcode = '22023';
  end if;
  select * into u from public.unit where id = s.unit_id;
  select * into pr from public.property where id = coalesce(s.property_id, u.property_id);
  v_point := coalesce(u.point, pr.point);
  if v_point is null then
    raise exception 'This unit has no map pin yet. Set its location first.' using errcode = '22023';
  end if;

  if s.guest_user_id is not null then
    select nullif(trim(au.email), '') into v_email from auth.users au
     where au.id = s.guest_user_id and not coalesce(au.is_anonymous, false)
       and au.email !~* '@receipts\.nexgapp\.com$';
  end if;

  select q.id into v_qr from public.property_qr q
   where q.owner_type = 'unit' and q.owner_id = u.id and q.voided_at is null
   order by q.generated_at desc limit 1;

  return jsonb_build_object(
    'stay_id', s.id,
    'unit_id', u.id,
    'guest_user_id', s.guest_user_id,
    'guest_name', coalesce(nullif(trim(s.guest_first_name), ''), 'Guest'),
    'phone', public.fn_concierge_phone(s.phone),
    'phone_masked', case when s.phone is not null then public.fn_mask_phone(s.phone) end,
    'email', v_email,
    'lat', extensions.st_y(v_point::extensions.geometry),
    'lng', extensions.st_x(v_point::extensions.geometry),
    'city_id', coalesce(u.city_id, pr.city_id),
    'label', left(coalesce(nullif(u.label_public, ''), u.name)
                  || coalesce(', ' || nullif(pr.name, ''), ''), 200),
    'address', nullif(concat_ws(', ', nullif(u.address_line, ''), nullif(u.building, ''),
                                'Unit ' || nullif(u.unit_no, ''), 'Floor ' || nullif(u.floor, ''),
                                coalesce(nullif(u.area, ''), nullif(pr.area, ''))), ''),
    /* Not the unit's QR card: that would give the host a share (owner, 26 Nov 2026: no). */
    'property_qr_id', null::uuid,
    'unit_qr_id', v_qr);
end;
$$;
revoke all on function public.fn_concierge_context(uuid) from public, anon, authenticated;

/* The fn_web_order_quote payload for a concierge basket: items, quantities and notes only. */
create or replace function public.fn_concierge_payload(p jsonb, ctx jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'Choose at least one item.' using errcode = '22023';
  end if;
  if (p ->> 'merchant_id') is null
     or (p ->> 'merchant_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Choose a merchant.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p -> 'items') l
              where coalesce(l ->> 'catalogue_item_id', '')
                    !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'An item in the basket is not one of this merchant''s.' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'catalogue_item_id', l ->> 'catalogue_item_id',
           'quantity', l -> 'quantity',
           'note', left(nullif(trim(l ->> 'note'), ''), 200))) order by n)
    into v_items
    from jsonb_array_elements(p -> 'items') with ordinality as x(l, n);
  return jsonb_build_object(
    'merchant_id', p ->> 'merchant_id',
    'payment_method', 'mpesa_stk',
    'fulfilment', 'delivery',
    'lat', ctx -> 'lat',
    'lng', ctx -> 'lng',
    'items', v_items);
end;
$$;
revoke all on function public.fn_concierge_payload(jsonb, jsonb) from public, anon, authenticated;

/*
 * Mints a link for an order, stops the order's earlier links, and queues the
 * SMS (and the email when there is an address). Returns the raw token once.
 */
create or replace function public.fn_pay_link_issue(
  p_order_id uuid, p_stay_id uuid, p_staff uuid, p_phone text, p_email text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_merchant text;
  v_token text;
  v_url text;
  v_expires timestamptz := now() + interval '24 hours';
  v_total text;
  v_sent text[] := '{}';
  v_sms text;
  v_email_body text;
begin
  select * into o from public.order where id = p_order_id;
  select coalesce(m.trading_name, m.legal_name) into v_merchant from public.merchant m where m.id = o.merchant_id;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_url := 'https://nexgapp.com/pay/link/' || v_token;
  v_total := 'KES ' || to_char(o.total_cents / 100.0, 'FM999,999,990');

  update public.order_pay_link set revoked_at = now()
   where order_id = p_order_id and revoked_at is null;

  if p_phone is not null then
    v_sent := v_sent || public.fn_mask_phone(p_phone);
  end if;
  if p_email is not null then
    v_sent := v_sent || (left(p_email, 1) || '•••@' || split_part(p_email, '@', 2));
  end if;

  insert into public.order_pay_link (order_id, stay_id, token_hash, expires_at, sent_to, created_by)
  values (p_order_id, p_stay_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires,
          v_sent, p_staff);

  v_sms := 'NexG: Hi ' || coalesce(p_name, 'there') || ', your ' || coalesce(v_merchant, 'NexG')
    || ' order ' || o.reference || ' (' || v_total || ') is ready to pay. Pay by M-Pesa or card: '
    || v_url || ' . It starts once paid. The link works for 24 hours; nothing is owed if you do not pay.';
  if p_phone is not null then
    perform public.fn_notify_enqueue(
      p_channel => 'sms', p_recipient => p_phone, p_template => 'concierge_pay_link',
      p_body => v_sms, p_payload => jsonb_build_object('order_id', p_order_id),
      p_sensitive => true, p_expires_at => v_expires);
  end if;

  if p_email is not null then
    v_email_body := 'Hi ' || coalesce(p_name, 'there') || ',' || E'\n\n'
      || 'NexG Concierge has placed an order for you with ' || coalesce(v_merchant, 'a NexG merchant')
      || ', delivered to where you are staying.' || E'\n\n'
      || 'Order: ' || o.reference || E'\n'
      || 'Total: ' || v_total || E'\n\n'
      || 'Pay by M-Pesa or card here: ' || v_url || E'\n\n'
      || 'The merchant starts once it is paid. The link works for 24 hours; if you do not pay, '
      || 'the order is cancelled and nothing is owed.' || E'\n\n' || '— NexG Concierge';
    perform public.fn_notify_enqueue(
      p_channel => 'email', p_recipient => p_email, p_template => 'concierge_pay_link',
      p_subject => 'Pay for your NexG order ' || o.reference, p_body => v_email_body,
      p_payload => jsonb_build_object('order_id', p_order_id),
      p_sensitive => true, p_expires_at => v_expires);
  end if;

  return jsonb_build_object('token', v_token, 'link', v_url, 'expires_at', v_expires, 'sent_to', v_sent);
end;
$$;
revoke all on function public.fn_pay_link_issue(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ 3. staff

/* Merchants in the stay's city that take orders now, with the items staff can order. */
create or replace function public.rpc_console_concierge_catalogue(p_stay_id uuid, p_categories text[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ctx jsonb;
begin
  if not (authz.reaches_module('hotels') or authz.reaches_module('orders') or authz.works_hospitality(null)) then
    raise exception 'Not yours to read.' using errcode = 'insufficient_privilege';
  end if;
  ctx := public.fn_concierge_context(p_stay_id);

  return jsonb_build_object(
    'stay', jsonb_build_object(
      'guest_name', ctx -> 'guest_name', 'phone_masked', ctx -> 'phone_masked',
      'has_phone', (ctx ->> 'phone') is not null, 'has_email', (ctx ->> 'email') is not null,
      'label', ctx -> 'label', 'address', ctx -> 'address'),
    'merchants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'name', coalesce(m.trading_name, m.legal_name),
               'category', coalesce(m.category_key, m.category::text),
               'open_now', public.fn_merchant_open_for_orders(m.id, now()),
               'min_order_kes', m.min_order_kes,
               'items', items.list) order by coalesce(m.trading_name, m.legal_name))
        from public.merchant m
        cross join lateral (
          select jsonb_agg(jsonb_build_object(
                   'id', i.id, 'name', i.name, 'price_kes', pp.price_kes,
                   'unit_label', case when i.sold_by in ('weight', 'volume') then i.unit_label end,
                   'estimate', i.price_is_estimate, 'age_restricted', i.age_restricted)
                   order by i.highlighted desc, i.sort, i.name) as list
            from (select * from public.catalogue_item ci
                   where ci.merchant_id = m.id and ci.available and not ci.sold_out
                     and ci.kind = 'buy' and not ci.digital and not ci.requires_buyer_id
                     and ci.price_kes is not null
                     and (public.fn_line_variant(ci.id, null) ->> 'ok')::boolean
                     and (public.fn_line_options(ci.id, null) ->> 'ok')::boolean
                   order by ci.highlighted desc, ci.sort, ci.name
                   limit 120) i
            cross join lateral public.fn_item_promo_price(i.id, i.merchant_id, i.price_kes) pp
        ) items
       where m.status = 'live' and m.accepting_orders is not false
         and m.city_id = (ctx ->> 'city_id')::uuid
         and (p_categories is null or coalesce(m.category_key, m.category::text) = any (p_categories)
              or m.category::text = any (p_categories))
         and items.list is not null), '[]'::jsonb));
end;
$$;

/* The basket priced as the order will be: items, delivery, fees and total. */
create or replace function public.rpc_console_concierge_quote(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ctx jsonb;
  q jsonb;
begin
  perform public.fn_concierge_gate();
  if coalesce(p ->> 'stay_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Choose a stay.' using errcode = '22023';
  end if;
  ctx := public.fn_concierge_context((p ->> 'stay_id')::uuid);
  q := public.fn_web_order_quote(public.fn_concierge_payload(p, ctx));
  if not (q ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'message', q ->> 'message');
  end if;
  return jsonb_build_object(
    'ok', true,
    'lines', (select jsonb_agg(jsonb_build_object('name', l ->> 'name', 'quantity', (l ->> 'quantity')::int,
                       'line_total_cents', (l ->> 'line_total_cents')::bigint)) from jsonb_array_elements(q -> 'lines') l),
    'subtotal_cents', q -> 'subtotal_cents', 'delivery_fee_cents', q -> 'delivery_fee_cents',
    'service_fee_cents', q -> 'service_fee_cents', 'small_basket_fee_cents', q -> 'small_basket_fee_cents',
    'total_cents', q -> 'total_cents', 'currency', 'KES');
end;
$$;

/*
 * Places the order for the guest and sends the pay link. p: stay_id,
 * merchant_id, items [{catalogue_item_id, quantity, note?}], phone? (a
 * correction to the stay's number), note? (for the rider / shop).
 */
create or replace function public.rpc_console_concierge_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_concierge_gate();
  ctx jsonb;
  q jsonb;
  v_phone text;
  v_guest public.guest;
  v_order uuid;
  v_ref text;
  v_line jsonb;
  v_needs text[] := '{}';
  v_link jsonb;
  v_note text;
begin
  if coalesce(p ->> 'stay_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Choose a stay.' using errcode = '22023';
  end if;
  perform 1 from public.stay where id = (p ->> 'stay_id')::uuid for update;
  ctx := public.fn_concierge_context((p ->> 'stay_id')::uuid);

  if nullif(trim(p ->> 'phone'), '') is not null then
    v_phone := public.fn_concierge_phone(p ->> 'phone');
    if v_phone is null then
      raise exception 'Enter a Kenyan mobile number like 0712 345 678.' using errcode = '22023';
    end if;
  else
    v_phone := ctx ->> 'phone';
  end if;
  if v_phone is null then
    raise exception 'This stay has no mobile number for the guest. Enter the number to send the pay link to.'
      using errcode = '22023';
  end if;

  q := public.fn_web_order_quote(public.fn_concierge_payload(p, ctx));
  if not (q ->> 'ok')::boolean then
    raise exception '%', q ->> 'message' using errcode = '22023';
  end if;
  if q ->> 'fulfilment' <> 'delivery' then
    raise exception 'Only delivered orders can be placed for a guest.' using errcode = '22023';
  end if;

  /* The guest's NexG record: their account's, else the one holding the number, else a new one. */
  if (ctx ->> 'guest_user_id') is not null then
    select * into v_guest from public.guest where user_id = (ctx ->> 'guest_user_id')::uuid;
  end if;
  if v_guest.id is null then
    select * into v_guest from public.guest where phone = v_phone;
  end if;
  if v_guest.id is null then
    insert into public.guest (user_id, phone, name)
    values (case when not exists (select 1 from public.guest where user_id = (ctx ->> 'guest_user_id')::uuid)
                 then (ctx ->> 'guest_user_id')::uuid end,
            v_phone, ctx ->> 'guest_name')
    returning * into v_guest;
  end if;
  if v_guest.blocked then
    raise exception 'That guest is blocked. Support lifts a block, not the desk.' using errcode = '22023';
  end if;

  if (q ->> 'has_age_restricted')::boolean then
    v_needs := v_needs || 'alcohol'::text;
  end if;
  v_note := nullif(concat_ws(' · ', ctx ->> 'address', left(nullif(trim(p ->> 'note'), ''), 300)), '');
  v_ref := public.fn_order_reference();

  insert into public.order (
    reference, guest_id, merchant_id, branch_id, city_id, zone_id, channel, created_by_staff_id,
    property_qr_id, dropoff_label, dropoff_point, dropoff_note, delivery_context,
    stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents,
    small_basket_fee_cents, cash_handling_cents, total_cents,
    commission_cents, commission_pct, currency, pricing_version_ids,
    carry_requirements, fulfilment)
  values (
    v_ref, v_guest.id, (q ->> 'merchant_id')::uuid, nullif(q ->> 'branch_id', '')::uuid,
    (q ->> 'city_id')::uuid, nullif(q ->> 'zone_id', '')::uuid, 'concierge', v_staff,
    nullif(ctx ->> 'property_qr_id', '')::uuid, ctx ->> 'label',
    extensions.st_setsrid(extensions.st_makepoint((ctx ->> 'lng')::float, (ctx ->> 'lat')::float), 4326)::extensions.geography,
    v_note,
    jsonb_build_object('concierge_stay_id', ctx ->> 'stay_id', 'unit_id', ctx ->> 'unit_id'),
    'placed', 'mpesa_stk', 'pending',
    (q ->> 'subtotal_cents')::bigint, (q ->> 'delivery_fee_cents')::bigint,
    (q ->> 'service_fee_cents')::bigint, (q ->> 'small_basket_fee_cents')::bigint,
    (q ->> 'cash_handling_cents')::bigint, (q ->> 'total_cents')::bigint,
    (q ->> 'commission_cents')::bigint, (q ->> 'commission_pct')::numeric,
    'KES', q -> 'pricing_version_ids', v_needs, 'delivery')
  returning id into v_order;

  for v_line in select l from jsonb_array_elements(q -> 'lines') l loop
    insert into public.order_item (
      order_id, catalogue_item_id, name, quantity, unit_price_cents, line_total_cents, note,
      unit_label, unit_step)
    values (v_order, (v_line ->> 'catalogue_item_id')::uuid, v_line ->> 'name',
            (v_line ->> 'quantity')::integer, (v_line ->> 'unit_price_cents')::bigint,
            (v_line ->> 'line_total_cents')::bigint, nullif(v_line ->> 'note', ''),
            case when v_line ->> 'sold_by' in ('weight', 'volume') then v_line ->> 'unit_label' end,
            case when v_line ->> 'sold_by' in ('weight', 'volume') then (v_line ->> 'unit_step')::numeric end);
  end loop;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (v_order, 'placed', 'Placed by NexG Concierge',
          'For the guest staying at ' || (ctx ->> 'label') || ' · pay link sent, paid before the merchant starts',
          'staff', v_staff, jsonb_build_object('channel', 'concierge', 'stay_id', ctx ->> 'stay_id'));

  v_link := public.fn_pay_link_issue(v_order, (ctx ->> 'stay_id')::uuid, v_staff, v_phone,
                                     ctx ->> 'email', ctx ->> 'guest_name');

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'orders',
    p_action => 'order.concierge_created', p_actor_id => v_staff,
    p_target_type => 'order', p_target_id => v_order, p_target_label => v_ref,
    p_city_id => (q ->> 'city_id')::uuid, p_severity => 'notice',
    p_after => jsonb_build_object('amount_cents', (q ->> 'total_cents')::bigint, 'currency', 'KES',
                                  'channel', 'concierge', 'stay_id', ctx ->> 'stay_id',
                                  'merchant_id', q ->> 'merchant_id', 'sent_to', v_link -> 'sent_to'),
    p_context => jsonb_build_object('pii', array['phone']));

  return jsonb_build_object(
    'ok', true, 'order_id', v_order, 'reference', v_ref,
    'total_cents', (q ->> 'total_cents')::bigint,
    'link', v_link ->> 'link', 'expires_at', v_link -> 'expires_at', 'sent_to', v_link -> 'sent_to',
    'message', 'Pay link sent. The merchant starts once the guest pays.');
end;
$$;

/* A new link for an unpaid concierge order (the earlier one stops working), sent again. */
create or replace function public.rpc_console_concierge_resend(p_order_id uuid, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_concierge_gate();
  o public.order;
  l public.order_pay_link;
  ctx jsonb;
  v_phone text;
  v_link jsonb;
begin
  select * into o from public.order where id = p_order_id for update;
  select * into l from public.order_pay_link where order_id = p_order_id order by created_at desc limit 1;
  if o.id is null or l.id is null then
    raise exception 'That is not a concierge order with a pay link.' using errcode = 'no_data_found';
  end if;
  if o.payment_status in ('paid', 'collected', 'partially_refunded', 'refunded') then
    raise exception 'This order is already paid.' using errcode = '22023';
  end if;
  if o.stage <> 'placed' then
    raise exception 'This order is % and cannot be paid now.', o.stage using errcode = '22023';
  end if;

  ctx := public.fn_concierge_context(l.stay_id);
  if nullif(trim(p_phone), '') is not null then
    v_phone := public.fn_concierge_phone(p_phone);
    if v_phone is null then
      raise exception 'Enter a Kenyan mobile number like 0712 345 678.' using errcode = '22023';
    end if;
  else
    v_phone := coalesce(ctx ->> 'phone', (select public.fn_concierge_phone(g.phone) from public.guest g where g.id = o.guest_id));
  end if;
  if v_phone is null and (ctx ->> 'email') is null then
    raise exception 'No number or email to send the link to. Enter the guest''s number.' using errcode = '22023';
  end if;

  v_link := public.fn_pay_link_issue(o.id, l.stay_id, v_staff, v_phone, ctx ->> 'email', ctx ->> 'guest_name');

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (o.id, 'pay_link_sent', 'Pay link sent again',
          'To ' || array_to_string(array(select jsonb_array_elements_text(v_link -> 'sent_to')), ', ')
            || ' · the earlier link no longer opens',
          'staff', v_staff, '{}'::jsonb);
  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'orders',
    p_action => 'order.pay_link_resent', p_actor_id => v_staff,
    p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
    p_city_id => o.city_id, p_severity => 'notice',
    p_after => jsonb_build_object('sent_to', v_link -> 'sent_to', 'expires_at', v_link -> 'expires_at'),
    p_context => jsonb_build_object('pii', array['phone']));

  return jsonb_build_object('ok', true, 'order_id', o.id, 'reference', o.reference,
    'link', v_link ->> 'link', 'expires_at', v_link -> 'expires_at', 'sent_to', v_link -> 'sent_to',
    'message', 'Pay link sent again. The earlier link no longer opens.');
end;
$$;

/* The stay's concierge orders and where their payment stands. */
create or replace function public.rpc_console_concierge_orders(p_stay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (authz.reaches_module('hotels') or authz.reaches_module('orders') or authz.works_hospitality(null)) then
    raise exception 'Not yours to read.' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'order_id', o.id, 'reference', o.reference, 'at', o.created_at,
             'kes', o.total_cents / 100.0, 'stage', o.stage, 'payment_status', o.payment_status,
             'merchant', coalesce(m.trading_name, m.legal_name),
             'items', (select string_agg(oi.quantity || ' × ' || oi.name, ', ' order by oi.id)
                         from public.order_item oi where oi.order_id = o.id),
             'link_expires_at', l.expires_at, 'link_sent_at', l.created_at, 'sent_to', l.sent_to,
             'link_opened', l.used_at is not null,
             'pay_state', case
               when o.payment_status in ('paid', 'collected', 'partially_refunded', 'refunded') then 'paid'
               when o.stage in ('cancelled', 'refunded') then 'cancelled'
               when l.expires_at <= now() then 'expired'
               when exists (select 1 from public.payment p where p.order_id = o.id
                              and p.state = 'authorised') then 'paying'
               else 'awaiting' end)
             order by o.created_at desc)
      from public.order o
      join lateral (select * from public.order_pay_link pl where pl.order_id = o.id
                     order by pl.created_at desc limit 1) l on true
      left join public.merchant m on m.id = o.merchant_id
     where o.id in (select pl.order_id from public.order_pay_link pl where pl.stay_id = p_stay_id)
  ), '[]'::jsonb);
end;
$$;

-- ═══════════════════════════════════════════════════════════════ 4. the guest

/* The link behind a token, or null; a miss is counted against the caller. */
create or replace function public.fn_pay_link_find(p_token text, p_client text)
returns public.order_pay_link
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := coalesce((select auth.uid())::text, 'c:' || left(nullif(trim(p_client), ''), 128), 'anon');
  l public.order_pay_link;
begin
  if (select count(*) from public.order_pay_link_miss
       where client_key = v_key and at > now() - interval '15 minutes') >= 20 then
    raise exception 'Too many tries. Wait a few minutes and open the link from your message again.'
      using errcode = '22023', hint = 'too_many';
  end if;
  if p_token is not null and p_token ~ '^[A-Za-z0-9_-]{43}$' then
    select * into l from public.order_pay_link
     where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  end if;
  if l.id is null then
    insert into public.order_pay_link_miss (client_key) values (v_key);
  end if;
  return l;
end;
$$;
revoke all on function public.fn_pay_link_find(text, text) from public, anon, authenticated;

/*
 * What the pay page shows: the order (merchant, items, total) and where it
 * stands — open (with the payment's state, as rpc_order_payment_state gives
 * it), paid, cancelled, expired or replaced — or not_found. No phone, no
 * address, no ids beyond the order reference.
 */
create or replace function public.rpc_pay_link_view(p_token text, p_client text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.order_pay_link;
  o public.order;
  p public.payment;
  a public.paystack_attempt;
  v_state text;
  v_pay jsonb := jsonb_build_object('status', 'unpaid');
  v_wait integer;
begin
  l := public.fn_pay_link_find(p_token, p_client);
  if l.id is null then
    return jsonb_build_object('ok', false, 'state', 'not_found');
  end if;
  select * into o from public.order where id = l.order_id;

  v_state := case
    when o.payment_status in ('paid', 'collected', 'partially_refunded', 'refunded') then 'paid'
    when o.stage in ('cancelled', 'refunded') then 'cancelled'
    when l.revoked_at is not null then 'replaced'
    when l.expires_at <= now() then 'expired'
    else 'open' end;

  if v_state = 'open' then
    select * into p from public.payment where order_id = o.id order by created_at desc limit 1;
    if p.id is not null and p.state in ('pending', 'authorised') and (p.expires_at is null or p.expires_at > now()) then
      select * into a from public.paystack_attempt where payment_id = p.id order by created_at desc limit 1;
      if a.id is not null and a.outcome is null and a.opened_at is not null
         and a.opened_at > now() - interval '30 minutes' then
        if a.channel <> 'card' then
          v_wait := greatest(0, ceil(extract(epoch from (a.opened_at + interval '3 minutes' - now())))::integer);
        end if;
        v_pay := jsonb_build_object('status', 'pending', 'reference', p.reference,
          'attempt_reference', a.reference, 'channel', a.channel, 'is_test', p.is_test,
          'opened_seconds_ago', floor(extract(epoch from (now() - a.opened_at)))::integer,
          'checked_seconds_ago', case when a.checked_at is not null
            then floor(extract(epoch from (now() - a.checked_at)))::integer end,
          'retry_after_seconds', v_wait,
          'authorization_url', case when a.channel = 'card' then a.authorization_url end);
      elsif p.provider = 'mpesa' and p.state = 'authorised' and p.authorised_at > now() - interval '3 minutes' then
        v_pay := jsonb_build_object('status', 'pending', 'reference', p.reference, 'channel', 'mpesa',
          'retry_after_seconds', greatest(0, ceil(extract(epoch from (p.authorised_at + interval '1 minute' - now())))::integer));
      elsif a.id is not null and a.outcome = 'failed' then
        v_pay := jsonb_build_object('status', 'failed', 'reference', p.reference, 'channel', a.channel,
          'is_test', p.is_test);
      else
        v_pay := jsonb_build_object('status', 'unpaid', 'reference', p.reference);
      end if;
    elsif p.id is not null and p.state = 'failed' then
      v_pay := jsonb_build_object('status', 'failed', 'reference', p.reference);
    end if;
  elsif v_state = 'paid' then
    v_pay := jsonb_build_object('status', 'paid');
  end if;

  return jsonb_build_object(
    'ok', true,
    'state', v_state,
    'reference', o.reference,
    'merchant', (select coalesce(m.trading_name, m.legal_name) from public.merchant m where m.id = o.merchant_id),
    'guest_name', (select nullif(trim(s.guest_first_name), '') from public.stay s where s.id = l.stay_id),
    'deliver_to', o.dropoff_label,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', oi.name, 'quantity', oi.quantity,
                       'line_total_cents', oi.line_total_cents) order by oi.id), '[]'::jsonb)
                from public.order_item oi where oi.order_id = o.id),
    'subtotal_cents', o.subtotal_cents,
    'fees_cents', o.delivery_fee_cents + o.service_fee_cents + o.small_basket_fee_cents
                  + o.cash_handling_cents + o.night_surcharge_cents + o.concierge_fee_cents
                  + o.weather_fee_cents,
    'total_cents', o.total_cents,
    'currency', o.currency,
    'expires_at', l.expires_at,
    'payment', v_pay);
end;
$$;

/*
 * Opens (or reuses) the order's payment for the caller, so the existing
 * payment functions — which pay only the payment's own creator — run for this
 * order. A payment another session started is handed over when nothing on it
 * is in progress (no prompt or Paystack try in the last three minutes).
 */
create or replace function public.rpc_pay_link_begin(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  l public.order_pay_link;
  o public.order;
  v_existing public.payment;
  v_owed bigint;
  v_ref text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  l := public.fn_pay_link_find(p_token, null);
  if l.id is null then
    raise exception 'This pay link is not valid. Open the link from your message again.'
      using errcode = '22023', hint = 'not_found';
  end if;
  select * into o from public.order where id = l.order_id for update;
  if o.payment_status in ('paid', 'collected', 'partially_refunded', 'refunded') then
    raise exception 'This order is already paid.' using errcode = '22023', hint = 'paid';
  end if;
  if o.stage in ('cancelled', 'refunded') then
    raise exception 'This order was cancelled. Nothing is owed.' using errcode = '22023', hint = 'cancelled';
  end if;
  if l.revoked_at is not null then
    raise exception 'A newer pay link was sent for this order. Use the latest message.'
      using errcode = '22023', hint = 'replaced';
  end if;
  if l.expires_at <= now() then
    raise exception 'This pay link has expired. Nothing is owed.' using errcode = '22023', hint = 'expired';
  end if;
  if o.payment_method not in ('mpesa_stk', 'card') then
    raise exception 'That order is not paid online.' using errcode = '22023';
  end if;

  update public.order_pay_link set used_at = coalesce(used_at, now()) where id = l.id;

  select * into v_existing from public.payment
   where order_id = o.id and state in ('pending', 'authorised')
     and (expires_at is null or expires_at > now())
   order by created_at desc limit 1
   for update;

  if v_existing.id is not null then
    if v_existing.created_by is distinct from v_uid then
      if exists (select 1 from public.paystack_attempt a
                  where a.payment_id = v_existing.id and a.outcome is null
                    and a.created_at > now() - interval '3 minutes')
         or exists (select 1 from public.payment_prompt pr
                     where pr.payment_id = v_existing.id and pr.resolved_at is null
                       and pr.sent_at > now() - interval '3 minutes') then
        raise exception 'A payment for this order was just started on another phone. Finish it there, or try again in 3 minutes.'
          using errcode = '22023', hint = 'in_progress';
      end if;
      update public.payment set created_by = v_uid, updated_at = now() where id = v_existing.id;
    end if;
    return jsonb_build_object(
      'ok', true, 'payment_id', v_existing.id, 'reference', v_existing.reference,
      'amount_cents', v_existing.amount_cents, 'currency', v_existing.currency,
      'order_reference', o.reference, 'reused', true);
  end if;

  v_owed := o.total_cents
    - coalesce((select sum(p.amount_cents) from public.payment p
                 where p.order_id = o.id and p.state = 'paid'), 0);
  if v_owed <= 0 then
    raise exception 'Nothing is owed on that order.' using errcode = '22023';
  end if;

  v_ref := public.fn_payment_reference();
  insert into public.payment (
    reference, intent, order_id, merchant_id, guest_id, city_id,
    amount_cents, currency, created_by, created_via, expires_at)
  values (
    v_ref, 'order', o.id, o.merchant_id, o.guest_id, o.city_id,
    v_owed, o.currency, v_uid, 'guest_checkout', now() + interval '1 hour')
  returning id into v_id;

  perform audit.log(
    p_actor_type => 'guest'::public.actor_type, p_actor_id => o.guest_id, p_module => 'orders',
    p_action => 'order.pay_link_payment_begun', p_target_type => 'order', p_target_id => o.id,
    p_target_label => o.reference, p_city_id => o.city_id,
    p_after => jsonb_build_object('payment_reference', v_ref, 'amount_cents', v_owed));

  return jsonb_build_object(
    'ok', true, 'payment_id', v_id, 'reference', v_ref,
    'amount_cents', v_owed, 'currency', o.currency,
    'order_reference', o.reference, 'reused', false);
end;
$$;

-- ═══════════════════════════════════════════════════════════════ 5. expiry

-- cron_expire_unpaid_mpesa_orders: 20270328000100, plus pay-link orders. An
-- order with a pay link is not closed at 30 minutes; it closes when its
-- latest link has run out, under the same in-progress guards.
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
    select ord.id, ord.reference, ord.city_id,
           exists (select 1 from public.order_pay_link l where l.order_id = ord.id) as by_link
      from public.order ord
     where ord.payment_status in ('pending', 'authorised', 'failed')
       and ord.stage = 'placed'
       and (
         (ord.payment_method = 'mpesa_stk'
          and ord.placed_at < now() - interval '30 minutes'
          and not exists (select 1 from public.order_pay_link l where l.order_id = ord.id))
         or
         (exists (select 1 from public.order_pay_link l where l.order_id = ord.id)
          and not exists (select 1 from public.order_pay_link l
                           where l.order_id = ord.id and l.revoked_at is null and l.expires_at > now()))
       )
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
           failure_reason = coalesce(failure_reason,
             case when o.by_link then 'pay link expired unpaid' else 'not paid within 30 minutes' end)
     where order_id = o.id and state in ('pending', 'authorised', 'failed');

    update public.order
       set stage = 'cancelled', cancelled_at = now(), cancel_reason_code = 'unpaid',
           cancel_note = case
             when o.by_link and v_paystack then 'The pay link ran out and no payment was confirmed. Nothing is owed.'
             when o.by_link then 'The pay link ran out unpaid. Nothing was charged and nothing is owed.'
             when v_paystack then 'No payment was confirmed in time.'
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
            case
              when o.by_link and v_paystack
                then 'The pay link ran out and no payment was confirmed, so the order was closed. A payment that arrives later is to be refunded.'
              when o.by_link
                then 'The guest did not pay within the pay link''s 24 hours, so the order was closed. Nothing was charged.'
              when v_paystack
                then 'No payment was confirmed in time, so the order was closed. A payment that arrives later is to be refunded.'
              else 'M-Pesa had no payment for this order 30 minutes after it was placed. Nothing was charged.' end,
            'system', '[System] · payments', jsonb_build_object('pay_link', o.by_link));

    perform audit.log(
      p_actor_type => 'system'::public.actor_type, p_module => 'orders',
      p_action => 'order.unpaid_expired', p_actor_label => '[System] · payments',
      p_target_type => 'order', p_target_id => o.id, p_target_label => o.reference,
      p_city_id => o.city_id, p_severity => 'notice',
      p_context => jsonb_build_object('pay_link', o.by_link));
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'expired', v_count);
end;
$$;
revoke execute on function public.cron_expire_unpaid_mpesa_orders() from public, anon, authenticated;
grant execute on function public.cron_expire_unpaid_mpesa_orders() to service_role;


/* console_stays_orders (20270329000100), plus the concierge orders staff place
   for a guest: those carry no QR card, so they are tied to the stay through
   their pay link. */
create or replace function public.console_stays_orders(p_from timestamptz, p_to timestamptz)
returns table (stay_id uuid, order_id uuid, reference text, created_at timestamptz,
               total_kes numeric, category text, merchant_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select x.stay_id, o.id, o.reference, o.created_at, o.total_cents / 100.0,
         coalesce(m.category_key, m.category::text, 'other'),
         coalesce(m.trading_name, m.legal_name)
  from (
    select s.id as stay_id, o.id as order_id
    from public."order" o
    join public.property_qr q on q.id = o.property_qr_id and q.owner_type = 'unit'
    join public.stay s on s.unit_id = q.owner_id
      and o.created_at >= s.check_in and o.created_at < s.check_out
      and s.status in ('booked', 'in_stay', 'departed')
    where o.created_at >= p_from and o.created_at < p_to
    union
    select distinct l.stay_id, l.order_id
    from public.order_pay_link l
    join public."order" o on o.id = l.order_id
    where l.stay_id is not null and o.created_at >= p_from and o.created_at < p_to
  ) x
  join public."order" o on o.id = x.order_id
  left join public.merchant m on m.id = o.merchant_id
  where o.payment_status in ('paid', 'collected', 'partially_refunded')
$$;
revoke all on function public.console_stays_orders(timestamptz, timestamptz) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ 6. grants

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.rpc_console_concierge_catalogue(uuid, text[])',
    'public.rpc_console_concierge_quote(jsonb)',
    'public.rpc_console_concierge_order(jsonb)',
    'public.rpc_console_concierge_resend(uuid, text)',
    'public.rpc_console_concierge_orders(uuid)',
    'public.rpc_pay_link_begin(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

revoke all on function public.rpc_pay_link_view(text, text) from public;
grant execute on function public.rpc_pay_link_view(text, text) to anon, authenticated;
