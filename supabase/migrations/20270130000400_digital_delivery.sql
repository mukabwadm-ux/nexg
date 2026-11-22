-- R37 from the merchant alignment: digital delivery, for an eSIM ("telecom
-- services is justa a simple esim nothing else", owner, 21 Nov) and anything
-- else delivered as a code.
--
-- 1. catalogue_item.digital: the item is delivered as a code in the
--    customer's app (an eSIM activation code, a voucher). No address, no rider.
-- 2. order.fulfilment: 'delivery' (as before) or 'digital', when every line
--    is a digital item. fn_web_order_quote (latest 20270130000300) needs no
--    location for a digital basket, charges no delivery fee and says
--    fulfilment. rpc_order_place_web (latest 20270130000200) asks for no
--    address and no map pin for it (the label says "Digital delivery") and
--    keeps fulfilment on the order. A mixed basket is delivered as before;
--    its digital lines still get their codes.
-- 3. A digital order never gets a rider: a delivery job for it is refused
--    (trigger job_not_for_digital on dispatch.job), including when the shop
--    marks it ready.
-- 4. order_item_code holds the code for each digital line. The shop sends
--    codes for a paid order with rpc_merchant_order_send_codes; when every
--    digital line of a digital order has one, the order is delivered. The
--    customer reads them with rpc_my_order_codes (their account or guest
--    session). No one else can read a code.
-- 5. catalogue_menu_public gains digital.
--
-- Not decided here: whether an eSIM sale needs the buyer's ID. That is the
-- owner's question; nothing collects an ID yet.
--
-- Rollback: restore fn_web_order_quote (20270130000300), rpc_order_place_web
-- (20270130000200) and catalogue_menu_public (20270130000200); drop the two
-- RPCs, order_item_code, the dispatch trigger and its function, and the
-- columns.

-- ═══════════════════════════════════════════════ 1–2. items and orders

alter table public.catalogue_item add column digital boolean not null default false;
comment on column public.catalogue_item.digital is
  'Delivered as a code in the customer''s app (an eSIM, a voucher): no address and no rider.';

-- The same order.fulfilment the Order together PR (#155) adds for pickup, and
-- that handover codes (20270115000600) already read: one type with all three
-- values, whichever lands first.
do $$
begin
  if not exists (select 1 from pg_type
                  where typname = 'order_fulfilment' and typnamespace = 'public'::regnamespace) then
    create type public.order_fulfilment as enum ('delivery', 'pickup', 'digital');
  else
    alter type public.order_fulfilment add value if not exists 'digital';
  end if;
end;
$$;
alter table public.order
  add column if not exists fulfilment public.order_fulfilment not null default 'delivery';
comment on column public.order.fulfilment is
  'delivery: a rider brings it. pickup: the customer collects it. digital: every line is a code the customer gets in the app.';

-- ═══════════════════════════════════════════════ 3. never a rider

create or replace function dispatch.tg_job_not_for_digital()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.order o where o.id = new.order_id and o.fulfilment = 'digital') then
    raise exception 'A digital order has no delivery. Send its code instead.'
      using errcode = '22023', hint = 'digital_order';
  end if;
  return new;
end;
$$;
revoke execute on function dispatch.tg_job_not_for_digital() from public, anon, authenticated;

create trigger job_not_for_digital
before insert on dispatch.job
for each row execute function dispatch.tg_job_not_for_digital();

-- ═══════════════════════════════════════════════ 4. the codes

create table public.order_item_code (
  order_item_id uuid primary key references public.order_item (id) on delete cascade,
  code          text not null check (char_length(trim(code)) between 1 and 2000),
  sent_at       timestamptz not null default now(),
  sent_by       uuid references auth.users (id) on delete set null
);
comment on table public.order_item_code is
  'The code for a digital order line (an eSIM activation code, a voucher). Read only through rpc_my_order_codes and the shop''s own order screens.';
alter table public.order_item_code enable row level security;
revoke all on public.order_item_code from public, anon, authenticated;

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('order.codes_sent', 'merchants', 'info', false, 'A shop sent the codes for a digital order')
on conflict (action) do nothing;

create or replace function public.rpc_merchant_order_send_codes(p_order_id uuid, p_codes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_uid uuid := (select auth.uid());
  v_line jsonb;
  v_item uuid;
  v_missing integer;
begin
  select * into o from public.order where id = p_order_id for update;
  if not found or v_uid is null or not authz.is_merchant_member(o.merchant_id) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if o.stage in ('cancelled', 'refunded', 'disputed') then
    raise exception 'This order is %, so no code can be sent.', o.stage using errcode = '22023', hint = 'wrong_stage';
  end if;
  if o.payment_status not in ('authorised', 'paid', 'collected') then
    raise exception 'Send the code once the order is paid.' using errcode = '22023', hint = 'unpaid';
  end if;
  if jsonb_typeof(p_codes) is distinct from 'array' or jsonb_array_length(p_codes) = 0 then
    raise exception 'Give a code for each digital item.' using errcode = '22023';
  end if;

  for v_line in select * from jsonb_array_elements(p_codes) loop
    v_item := case when coalesce(v_line ->> 'order_item_id', '') ~ '^[0-9a-fA-F-]{36}$'
                   then (v_line ->> 'order_item_id')::uuid end;
    if v_item is null or not exists (
         select 1 from public.order_item oi
           join public.catalogue_item ci on ci.id = oi.catalogue_item_id
          where oi.id = v_item and oi.order_id = o.id and ci.digital) then
      raise exception 'That is not a digital item on this order.' using errcode = '22023';
    end if;
    if char_length(trim(coalesce(v_line ->> 'code', ''))) not between 1 and 2000 then
      raise exception 'Each code needs 1 to 2,000 characters.' using errcode = '22023';
    end if;
    insert into public.order_item_code (order_item_id, code, sent_by)
    values (v_item, trim(v_line ->> 'code'), v_uid)
    on conflict (order_item_id) do update
      set code = excluded.code, sent_at = now(), sent_by = excluded.sent_by;
  end loop;

  insert into public.order_event (order_id, kind, title, actor_type, actor_id)
  values (o.id, 'codes_sent', 'Codes sent to the customer''s app', 'merchant_user', v_uid);

  select count(*) into v_missing
    from public.order_item oi
    join public.catalogue_item ci on ci.id = oi.catalogue_item_id
   where oi.order_id = o.id and ci.digital
     and not exists (select 1 from public.order_item_code c where c.order_item_id = oi.id);

  /* The codes themselves are never logged, only that they were sent. */
  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type, p_module => 'merchants',
    p_action => 'order.codes_sent',
    p_target_type => 'order', p_target_id => o.id,
    p_target_label => o.reference,
    p_city_id => o.city_id,
    p_after => jsonb_build_object('lines', jsonb_array_length(p_codes), 'missing', v_missing));

  if o.fulfilment = 'digital' and v_missing = 0 and o.stage <> 'delivered' then
    /* Handed to the customer: the code is in their app. */
    update public.order
       set stage = 'delivered', delivered_at = now(), handed_to = 'guest',
           confirmed_at = coalesce(confirmed_at, now())
     where id = o.id;
    insert into public.order_event (order_id, kind, title, actor_type, actor_id)
    values (o.id, 'delivered', 'Delivered: the codes are in the customer''s app', 'merchant_user', v_uid);
  end if;

  return jsonb_build_object('ok', true, 'order_id', o.id, 'missing', v_missing,
    'stage', (select stage from public.order where id = o.id));
end;
$$;
revoke execute on function public.rpc_merchant_order_send_codes(uuid, jsonb) from public, anon;
grant execute on function public.rpc_merchant_order_send_codes(uuid, jsonb) to authenticated;

create or replace function public.rpc_my_order_codes(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('order_item_id', oi.id, 'name', oi.name,
                                               'code', c.code, 'sent_at', c.sent_at)
                            order by oi.name, oi.id), '[]'::jsonb)
    from authz.customer_order(p_order_id) o
    join public.order_item oi on oi.order_id = o.id
    join public.order_item_code c on c.order_item_id = oi.id;
$$;
revoke execute on function public.rpc_my_order_codes(uuid) from public, anon;
grant execute on function public.rpc_my_order_codes(uuid) to authenticated;
comment on function public.rpc_my_order_codes(uuid) is
  'The codes for the caller''s own order (account or guest session): [{order_item_id, name, code, sent_at}].';

-- ═══════════════════════════════════════════════ checkout

-- fn_web_order_quote: 20270130000300, plus digital baskets.
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
  v_cash bigint;
  v_total bigint;
  v_problem text;
  v_digital boolean := false;
  v_delivery bigint;
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
  if not public.fn_merchant_open_for_orders(m.id, now()) then
    return jsonb_build_object('ok', false, 'message', m.trading_name || ' is closed right now.');
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

  /* Bookable items are booked, not put in a basket. */
  if exists (
       select 1
         from jsonb_to_recordset(p_payload -> 'items') as q(catalogue_item_id uuid)
         join public.catalogue_item i
           on i.id = q.catalogue_item_id and i.merchant_id = v_merchant
        where i.kind <> 'buy') then
    return jsonb_build_object('ok', false,
      'message', 'Something in your basket is booked rather than bought. Book it on its own page.');
  end if;

  /* Choices and amounts, line by line, with a message for the first that is wrong. */
  select coalesce(
           (select i.name || ' is sold out.'
              from jsonb_array_elements(p_payload -> 'items') with ordinality as l(line, n)
              join public.catalogue_item i
                on i.id = nullif(l.line ->> 'catalogue_item_id', '')::uuid and i.merchant_id = v_merchant
             where i.available and i.sold_out
             order by l.n limit 1),
           (select case when i.message_label is null then i.name || ' does not take a message.'
                        else 'Keep the message for ' || i.name || ' to ' || i.message_max_length || ' characters.' end
              from jsonb_array_elements(p_payload -> 'items') with ordinality as l(line, n)
              join public.catalogue_item i
                on i.id = nullif(l.line ->> 'catalogue_item_id', '')::uuid and i.merchant_id = v_merchant
             where nullif(trim(l.line ->> 'message'), '') is not null
               and (i.message_label is null
                    or char_length(trim(l.line ->> 'message')) > i.message_max_length)
             order by l.n limit 1),
           (select lv.v ->> 'message'
              from jsonb_array_elements(p_payload -> 'items') with ordinality as l(line, n)
              join public.catalogue_item i
                on i.id = nullif(l.line ->> 'catalogue_item_id', '')::uuid and i.merchant_id = v_merchant
              cross join lateral (select public.fn_line_variant(i.id, l.line ->> 'variant_id') as v) lv
             where not (lv.v ->> 'ok')::boolean
             order by l.n limit 1),
           (select 'Only ' || (lv.v ->> 'stock_count') || ' left of ' || i.name || ' (' || (lv.v ->> 'label') || ').'
              from jsonb_array_elements(p_payload -> 'items') with ordinality as l(line, n)
              join public.catalogue_item i
                on i.id = nullif(l.line ->> 'catalogue_item_id', '')::uuid and i.merchant_id = v_merchant
              cross join lateral (select public.fn_line_variant(i.id, l.line ->> 'variant_id') as v) lv
             where (lv.v ->> 'stock_count') is not null
               and (l.line ->> 'quantity') ~ '^[0-9]+$'
               and (l.line ->> 'quantity')::integer > (lv.v ->> 'stock_count')::integer
             order by l.n limit 1),
           (select ln.opts ->> 'message'
              from jsonb_array_elements(p_payload -> 'items') with ordinality as l(line, n)
              join public.catalogue_item i
                on i.id = nullif(l.line ->> 'catalogue_item_id', '')::uuid and i.merchant_id = v_merchant
              cross join lateral (select public.fn_line_options(i.id, l.line -> 'options') as opts) ln
             where not (ln.opts ->> 'ok')::boolean
             order by l.n limit 1),
           (select 'You can buy ' || i.name || ' from ' || i.unit_min || ' to '
                   || coalesce(i.unit_max::text, 'any amount') || ' ' || coalesce(i.unit_label, '') || '.'
              from jsonb_array_elements(p_payload -> 'items') with ordinality as l(line, n)
              join public.catalogue_item i
                on i.id = nullif(l.line ->> 'catalogue_item_id', '')::uuid and i.merchant_id = v_merchant
             where (l.line ->> 'quantity') ~ '^[0-9]+$'
               and ((i.unit_min is not null and (l.line ->> 'quantity')::numeric * i.unit_step < i.unit_min)
                 or (i.unit_max is not null and (l.line ->> 'quantity')::numeric * i.unit_step > i.unit_max))
             order by l.n limit 1))
    into v_problem;
  if v_problem is not null then
    return jsonb_build_object('ok', false, 'message', v_problem);
  end if;

  /* Each line is priced from the catalogue row, at the running promotion's
     price when there is one, for one step of its unit, plus the options
     chosen. A line that is not this merchant's, not on sale, or not priced
     is refused rather than quietly dropped. */
  select
    jsonb_agg(jsonb_build_object(
      'catalogue_item_id', i.id,
      'name', i.name,
      'quantity', q.quantity,
      'unit_price_cents', round(pp.price_kes::numeric * 100 * i.unit_step)::bigint
                          + (ln.opts ->> 'extra_cents')::bigint,
      'list_price_cents', round(coalesce((lv.v ->> 'price_kes')::numeric, i.price_kes::numeric) * 100 * i.unit_step)::bigint
                          + (ln.opts ->> 'extra_cents')::bigint,
      'promotion_id', pp.promotion_id,
      'line_total_cents', (round(pp.price_kes::numeric * 100 * i.unit_step)::bigint
                           + (ln.opts ->> 'extra_cents')::bigint) * q.quantity,
      'options', ln.opts -> 'chosen',
      'variant_id', lv.v ->> 'variant_id',
      'variant_label', lv.v ->> 'label',
      'sold_by', i.sold_by,
      'unit_label', i.unit_label,
      'unit_step', i.unit_step,
      'price_is_estimate', i.price_is_estimate,
      'note', nullif(trim(q.note), ''),
      'message', nullif(trim(q.message), ''),
      'age_restricted', i.age_restricted) order by q.n),
    coalesce(sum((round(pp.price_kes::numeric * 100 * i.unit_step)::bigint
                  + (ln.opts ->> 'extra_cents')::bigint) * q.quantity), 0),
    count(*)
  into v_lines, v_subtotal, v_found
  from jsonb_array_elements(p_payload -> 'items') with ordinality as l(line, n)
  cross join lateral (select nullif(l.line ->> 'catalogue_item_id', '')::uuid as catalogue_item_id,
                             case when (l.line ->> 'quantity') ~ '^[0-9]+$'
                                  then (l.line ->> 'quantity')::integer end as quantity,
                             l.line ->> 'note' as note, l.line ->> 'message' as message, l.n) q
  join public.catalogue_item i
    on i.id = q.catalogue_item_id
   and i.merchant_id = v_merchant
   and i.available
   and not i.sold_out
  cross join lateral (select public.fn_line_variant(i.id, l.line ->> 'variant_id') as v) lv
  cross join lateral public.fn_item_promo_price(
    i.id, i.merchant_id, coalesce((lv.v ->> 'price_kes')::integer, i.price_kes)) pp
  cross join lateral (select public.fn_line_options(i.id, l.line -> 'options') as opts) ln
  where q.quantity between 1 and 50
    and (lv.v ->> 'ok')::boolean
    and coalesce((lv.v ->> 'price_kes')::integer, i.price_kes) is not null;

  if v_found is distinct from v_wanted then
    return jsonb_build_object('ok', false,
      'message', 'Something in your basket is no longer available. Review it and try again.');
  end if;

  /* The shop's minimum, on the items after offers, before fees. */
  if m.min_order_kes is not null and v_subtotal < m.min_order_kes::bigint * 100 then
    return jsonb_build_object('ok', false,
      'message', m.trading_name || ' takes orders from KES ' || to_char(m.min_order_kes, 'FM999,999,999')
                 || '. Add KES ' || to_char(ceil((m.min_order_kes::bigint * 100 - v_subtotal) / 100.0), 'FM999,999,999')
                 || ' more.',
      'min_order_kes', m.min_order_kes);
  end if;

  /* Every line delivered as a code: no location, no rider, no delivery fee. */
  v_digital := not exists (
    select 1 from jsonb_array_elements(p_payload -> 'items') l
      join public.catalogue_item i on i.id = nullif(l ->> 'catalogue_item_id', '')::uuid
     where not i.digital);

  select b.id, b.location into v_branch, v_from
    from public.merchant_branch b
   where b.merchant_id = v_merchant
   order by b.is_primary desc
   limit 1;

  if not v_digital and p_payload ? 'lat' and p_payload ? 'lng'
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

  v_cash := case when v_method = 'cash_on_delivery'
                 then (v_price ->> 'cash_handling_cents')::bigint else 0 end;
  v_delivery := case when v_digital then 0 else (v_price ->> 'delivery_fee_cents')::bigint end;

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
    'lines', v_lines,
    'subtotal_cents', (v_price ->> 'subtotal_cents')::bigint,
    'list_subtotal_cents', (select coalesce(sum((l ->> 'list_price_cents')::bigint * (l ->> 'quantity')::bigint), 0)
                              from jsonb_array_elements(v_lines) l),
    'delivery_fee_cents', v_delivery,
    'fulfilment', case when v_digital then 'digital' else 'delivery' end,
    'service_fee_cents', (v_price ->> 'service_fee_cents')::bigint,
    'small_basket_fee_cents', (v_price ->> 'small_basket_fee_cents')::bigint,
    'cash_handling_cents', v_cash,
    'total_cents', v_total,
    'commission_pct', (v_price ->> 'commission_pct')::numeric,
    'commission_cents', (v_price ->> 'commission_cents')::bigint,
    'pricing_version_ids', v_price -> 'pricing_version_ids',
    'has_age_restricted', exists (
      select 1 from jsonb_array_elements(v_lines) l where (l ->> 'age_restricted')::boolean),
    'has_estimated_prices', exists (
      select 1 from jsonb_array_elements(v_lines) l where (l ->> 'price_is_estimate')::boolean),
    'currency', 'KES');
end;
$$;

revoke execute on function public.fn_web_order_quote(jsonb) from public, anon, authenticated;
grant execute on function public.fn_web_order_quote(jsonb) to service_role;

-- rpc_order_place_web: 20270130000200, plus digital orders.
create or replace function public.rpc_order_place_web(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_temporary boolean := authz.is_anonymous_session();
  v_phone text := nullif(regexp_replace(coalesce(p_payload ->> 'guest_phone', ''), '[^0-9+]', '', 'g'), '');
  v_name text := nullif(trim(p_payload ->> 'guest_name'), '');
  v_label text := nullif(trim(p_payload ->> 'dropoff_label'), '');
  q jsonb;
  v_guest public.guest;
  v_point extensions.geography;
  v_order uuid;
  v_ref text;
  v_needs text[] := '{}';
  v_line jsonb;
  v_item uuid;
  v_request text := nullif(trim(p_payload ->> 'client_request_id'), '');
  v_prior public.order;
begin
  if v_uid is null then
    raise exception 'Sign in or continue as a guest to place your order.' using errcode = '42501';
  end if;
  if v_phone is null or v_phone !~ '^\+?[0-9]{9,15}$' then
    raise exception 'A phone number the rider can reach you on.';
  end if;
  q := public.fn_web_order_quote(p_payload);
  if not (q ->> 'ok')::boolean then
    raise exception '%', q ->> 'message';
  end if;

  if q ->> 'fulfilment' = 'digital' then
    /* Delivered as codes in the app: no address and no map pin. */
    v_label := 'Digital delivery';
    v_point := null;
  else
    if v_label is null then
      raise exception 'Where should we bring it? Set your delivery address first.';
    end if;
    if nullif(p_payload ->> 'lat', '') is null or nullif(p_payload ->> 'lng', '') is null then
      raise exception 'Set your delivery address on the map first.';
    end if;
    v_point := extensions.st_setsrid(extensions.st_makepoint(
      (p_payload ->> 'lng')::float, (p_payload ->> 'lat')::float), 4326)::extensions.geography;
  end if;

  /* One record per session, and a number belongs to the record that already
     holds it (20261223000200). Neither an account nor a temporary session
     proves a phone, so a number on file is never attached here. */
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

  /* The same request sent again (a retry on a weak connection) gets the
     order it already made, not a second one. */
  if v_request is not null then
    if v_request !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'The order request id must be a UUID.' using errcode = '22023';
    end if;
    select * into v_prior from public.order
     where guest_id = v_guest.id and client_request_id = v_request::uuid;
    if found then
      return jsonb_build_object(
        'ok', true, 'order_id', v_prior.id, 'reference', v_prior.reference,
        'total_cents', v_prior.total_cents, 'payment_method', v_prior.payment_method,
        'pay_online', v_prior.payment_method::text in ('card', 'mpesa_stk', 'bank_transfer'),
        'guest', v_temporary, 'repeat', true);
    end if;
  end if;

  if v_temporary and (
       select count(*) from public.order o
        where o.guest_id = v_guest.id
          and o.payment_status in ('pending', 'authorised', 'failed')
          and o.stage in ('placed', 'confirmed')) >= 3 then
    raise exception 'Pay for or cancel your earlier orders first.'
      using hint = 'guest_unpaid_limit';
  end if;

  if (q ->> 'has_age_restricted')::boolean then
    v_needs := v_needs || 'alcohol'::text;
  end if;

  v_ref := public.fn_order_reference();

  insert into public.order (
    reference, guest_id, merchant_id, branch_id, city_id, zone_id, channel,
    dropoff_label, dropoff_point, dropoff_note, delivery_context,
    stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents,
    small_basket_fee_cents, cash_handling_cents, total_cents,
    commission_cents, commission_pct, currency, pricing_version_ids,
    carry_requirements, client_request_id, fulfilment)
  values (
    v_ref, v_guest.id, (q ->> 'merchant_id')::uuid, nullif(q ->> 'branch_id', '')::uuid,
    (q ->> 'city_id')::uuid, nullif(q ->> 'zone_id', '')::uuid, 'web',
    v_label, v_point, nullif(trim(p_payload ->> 'dropoff_note'), ''), '{}'::jsonb,
    'placed', (q ->> 'payment_method')::public.order_payment_method, 'pending',
    (q ->> 'subtotal_cents')::bigint, (q ->> 'delivery_fee_cents')::bigint,
    (q ->> 'service_fee_cents')::bigint, (q ->> 'small_basket_fee_cents')::bigint,
    (q ->> 'cash_handling_cents')::bigint, (q ->> 'total_cents')::bigint,
    (q ->> 'commission_cents')::bigint, (q ->> 'commission_pct')::numeric,
    'KES', q -> 'pricing_version_ids', v_needs, v_request::uuid,
    coalesce(q ->> 'fulfilment', 'delivery')::public.order_fulfilment)
  returning id into v_order;

  /* Each line, with its unit and the choices made on it (20270116000100). */
  for v_line in select l from jsonb_array_elements(q -> 'lines') l loop
    insert into public.order_item (
      order_id, catalogue_item_id, name, quantity, unit_price_cents, line_total_cents, note,
      unit_label, unit_step, variant_id, variant_label, message)
    values (v_order, (v_line ->> 'catalogue_item_id')::uuid, v_line ->> 'name',
            (v_line ->> 'quantity')::integer, (v_line ->> 'unit_price_cents')::bigint,
            (v_line ->> 'line_total_cents')::bigint, nullif(v_line ->> 'note', ''),
            case when v_line ->> 'sold_by' in ('weight', 'volume') then v_line ->> 'unit_label' end,
            case when v_line ->> 'sold_by' in ('weight', 'volume') then (v_line ->> 'unit_step')::numeric end,
            nullif(v_line ->> 'variant_id', '')::uuid, nullif(v_line ->> 'variant_label', ''),
            nullif(v_line ->> 'message', ''))
    returning id into v_item;

    /* A counted version is set aside for this order; the last one can't be sold twice. */
    if nullif(v_line ->> 'variant_id', '') is not null then
      update public.catalogue_variant
         set stock_count = stock_count - (v_line ->> 'quantity')::integer, updated_at = now()
       where id = (v_line ->> 'variant_id')::uuid and stock_count is not null;
      if exists (select 1 from public.catalogue_variant
                  where id = (v_line ->> 'variant_id')::uuid and stock_count < 0) then
        raise exception 'Not enough % (%) left. Lower the amount.', v_line ->> 'name', v_line ->> 'variant_label'
          using hint = 'variant_sold_out';
      end if;
    end if;

    insert into public.order_item_modifier (order_item_id, group_id, option_id, group_name, option_name, extra_cents)
    select v_item, (c ->> 'group_id')::uuid, (c ->> 'option_id')::uuid,
           c ->> 'group_name', c ->> 'option_name', (c ->> 'extra_cents')::bigint
      from jsonb_array_elements(coalesce(v_line -> 'options', '[]'::jsonb)) c;
  end loop;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (v_order, 'placed', 'Placed on the website',
          replace(q ->> 'payment_method', '_', ' '),
          'guest', v_guest.id,
          jsonb_build_object('channel', 'web', 'temporary_session', v_temporary));

  perform audit.log(p_actor_type=>'guest'::public.actor_type,p_actor_id=>v_guest.id,p_module=>'orders',
    p_action=>'order.web_placed',p_target_type=>'order',p_target_id=>v_order,p_city_id=>(q->>'city_id')::uuid,
    p_after=>jsonb_build_object('channel','web','payment_method',q->>'payment_method',
                                'temporary_session',v_temporary));

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order,
    'reference', v_ref,
    'total_cents', (q ->> 'total_cents')::bigint,
    'payment_method', q ->> 'payment_method',
    'pay_online', (q ->> 'payment_method') in ('card', 'mpesa_stk', 'bank_transfer'),
    'guest', v_temporary,
    'repeat', false);
end;
$$;

comment on function public.rpc_order_place_web(jsonb) is
  'Places a delivery order for the signed-in account or a temporary (guest) session, with each line''s unit, choices and version. A repeated client_request_id returns the first order. Bookings and stay holds still need an account.';

revoke execute on function public.rpc_order_place_web(jsonb) from public, anon;
grant execute on function public.rpc_order_place_web(jsonb) to authenticated;

-- ═══════════════════════════════════════════════ 5. the apps' item list

create or replace view public.catalogue_menu_public
with (security_invoker = false)
as
select
  i.id,
  i.merchant_id,
  i.section_id,
  i.name,
  i.description,
  i.price_kes,
  i.available,
  i.age_restricted,
  i.highlighted,
  i.sort,
  i.photo_path,
  coalesce((select array_agg(p.storage_path order by p.is_cover desc, p.sort, p.created_at)
              from public.catalogue_photo p
             where p.item_id = i.id and p.status = 'published'), '{}'::text[]) as gallery_paths,
  i.kind::text as kind,
  i.booking_offering_id,
  i.sold_by,
  i.unit_label,
  i.unit_step,
  i.unit_min,
  i.unit_max,
  i.price_is_estimate,
  exists (select 1 from public.catalogue_item_modifier cim
            join public.modifier_group g on g.id = cim.group_id and g.archived_at is null
           where cim.item_id = i.id) as has_options,
  exists (select 1 from public.catalogue_variant v
           where v.item_id = i.id and v.archived_at is null) as has_variants,
  i.sold_out,
  i.price_per,
  i.prep_time_minutes,
  i.duration_minutes,
  i.party_min,
  i.party_max,
  (select pp.price_kes from public.fn_item_promo_price(i.id, i.merchant_id, i.price_kes) pp
    where pp.promotion_id is not null) as promo_price_kes,
  (select pp.promotion_name from public.fn_item_promo_price(i.id, i.merchant_id, i.price_kes) pp
    where pp.promotion_id is not null) as promotion_name,
  (select pp.ends_at from public.fn_item_promo_price(i.id, i.merchant_id, i.price_kes) pp
    where pp.promotion_id is not null) as promotion_ends_at,
  coalesce((select jsonb_agg(jsonb_build_object('item_id', b.component_item_id, 'name', c.name,
                                                'quantity', b.quantity) order by b.sort)
              from public.catalogue_bundle_item b
              join public.catalogue_item c on c.id = b.component_item_id
             where b.item_id = i.id), '[]'::jsonb) as bundle_items,
  i.message_label,
  i.message_max_length,
  i.digital
from public.catalogue_item i
join public.merchant_public mp on mp.id = i.merchant_id
where coalesce(i.available, true)
  and (
    not coalesce(i.age_restricted, false)
    or exists (
      select 1
      from public.document d
      join public.document_requirement r on r.id = d.requirement_id
      where d.owner_type = 'merchant' and d.owner_id = i.merchant_id
        and r.kind = 'liquor_licence'
        and d.status = 'verified' and d.superseded_at is null
    )
  );
