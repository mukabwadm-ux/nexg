-- R37, part 2: an eSIM sale takes the buyer's ID. The owner, 22 Nov 2026:
-- "we can say passport or something".
--
-- 1. catalogue_item.requires_buyer_id: the shop marks items that need the
--    buyer's ID (an eSIM). catalogue_menu_public shows it.
-- 2. A basket with such an item must carry "buyer_id":
--      {"type": "passport" | "national_id", "number": "...",
--       "country": "KE" (two letters, needed for a passport), "name": "..."}
--    fn_web_order_quote (latest 20270130000400) refuses it otherwise, and
--    says needs_buyer_id on every quote. rpc_order_place_web keeps it in
--    order_buyer_id, apart from the order.
-- 3. order_buyer_id is readable only through
--    rpc_merchant_order_buyer_id, by the shop's team, and every read is
--    audited (order.buyer_id_viewed). Nobody reads the table directly.
-- 4. It is deleted 90 days after the order is delivered or cancelled
--    (cron_purge_order_buyer_ids, daily).
--
-- Rollback: restore fn_web_order_quote and rpc_order_place_web
-- (20270130000400) and catalogue_menu_public (20270130000400); unschedule the
-- job; drop the functions, order_buyer_id and the column.

alter table public.catalogue_item add column requires_buyer_id boolean not null default false;
comment on column public.catalogue_item.requires_buyer_id is
  'The buyer must give a passport or national ID to order it (an eSIM).';

create table public.order_buyer_id (
  order_id        uuid primary key references public.order (id) on delete cascade,
  id_type         text not null check (id_type in ('passport', 'national_id')),
  id_number       text not null check (id_number ~ '^[A-Z0-9]{5,20}$'),
  issuing_country text check (issuing_country ~ '^[A-Z]{2}$'),
  full_name       text not null check (char_length(trim(full_name)) between 2 and 100),
  created_at      timestamptz not null default now(),
  check (id_type <> 'passport' or issuing_country is not null)
);
comment on table public.order_buyer_id is
  'The ID the buyer gave for an order that needs one (an eSIM). Read only through rpc_merchant_order_buyer_id; deleted 90 days after the order ends.';
alter table public.order_buyer_id enable row level security;
revoke all on public.order_buyer_id from public, anon, authenticated;

create or replace function public.fn_buyer_id_ok(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and p ->> 'type' in ('passport', 'national_id')
     and upper(regexp_replace(coalesce(p ->> 'number', ''), '[\s-]', '', 'g')) ~ '^[A-Z0-9]{5,20}$'
     and char_length(trim(coalesce(p ->> 'name', ''))) between 2 and 100
     and (p ->> 'type' <> 'passport' or upper(trim(coalesce(p ->> 'country', ''))) ~ '^[A-Z]{2}$')
$$;
revoke execute on function public.fn_buyer_id_ok(jsonb) from public, anon, authenticated;

-- Reading personal data is queued for a person, like every other *_viewed action.
insert into audit.action_registry (action, module, default_severity, needs_review, pii_fields, money, description) values
  ('order.buyer_id_viewed', 'merchants', 'info', true, array['id_number', 'full_name'], false,
   'A shop looked at the ID a buyer gave for an order')
on conflict (action) do nothing;

create or replace function public.rpc_merchant_order_buyer_id(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  b public.order_buyer_id;
begin
  select * into o from public.order where id = p_order_id;
  if not found or (select auth.uid()) is null or not authz.is_merchant_member(o.merchant_id) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  select * into b from public.order_buyer_id where order_id = o.id;
  if not found then
    return jsonb_build_object('ok', true, 'buyer_id', null);
  end if;
  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type, p_module => 'merchants',
    p_action => 'order.buyer_id_viewed',
    p_target_type => 'order', p_target_id => o.id,
    p_target_label => o.reference,
    p_city_id => o.city_id);
  return jsonb_build_object('ok', true, 'buyer_id', jsonb_build_object(
    'type', b.id_type, 'number', b.id_number, 'country', b.issuing_country, 'name', b.full_name));
end;
$$;
revoke execute on function public.rpc_merchant_order_buyer_id(uuid) from public, anon;
grant execute on function public.rpc_merchant_order_buyer_id(uuid) to authenticated;

create or replace function public.cron_purge_order_buyer_ids()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  delete from public.order_buyer_id b
   using public.order o
   where o.id = b.order_id
     and coalesce(o.delivered_at, o.cancelled_at) < now() - interval '90 days';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.cron_purge_order_buyer_ids() from public, anon, authenticated;
grant execute on function public.cron_purge_order_buyer_ids() to service_role;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; buyer IDs are not purged on a schedule.';
    return;
  end if;
  perform cron.schedule('purge-order-buyer-ids', '17 3 * * *',
    $sched$select public.cron_purge_order_buyer_ids()$sched$);
end
$cron$;

-- ═══════════════════════════════════════════════ checkout

-- fn_web_order_quote: 20270130000400, plus the buyer's ID.
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
  v_needs_id boolean := false;
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

  /* An item that needs the buyer's ID (an eSIM): a passport or national ID. */
  v_needs_id := exists (
    select 1 from jsonb_array_elements(p_payload -> 'items') l
      join public.catalogue_item i on i.id = nullif(l ->> 'catalogue_item_id', '')::uuid
     where i.requires_buyer_id);
  if v_needs_id and not public.fn_buyer_id_ok(p_payload -> 'buyer_id') then
    return jsonb_build_object('ok', false, 'needs_buyer_id', true,
      'message', 'This order needs the buyer''s passport (with its country) or national ID, and their full name.');
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
    'needs_buyer_id', v_needs_id,
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

-- rpc_order_place_web: 20270130000400, plus the buyer's ID.
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

  /* The buyer's ID, apart from the order (the quote has checked it). */
  if (q ->> 'needs_buyer_id')::boolean then
    insert into public.order_buyer_id (order_id, id_type, id_number, issuing_country, full_name)
    values (v_order, p_payload #>> '{buyer_id,type}',
            upper(regexp_replace(p_payload #>> '{buyer_id,number}', '[\s-]', '', 'g')),
            nullif(upper(trim(coalesce(p_payload #>> '{buyer_id,country}', ''))), ''),
            trim(p_payload #>> '{buyer_id,name}'));
  end if;

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

-- ═══════════════════════════════════════════════ the apps' item list

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
  i.digital,
  i.requires_buyer_id
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
