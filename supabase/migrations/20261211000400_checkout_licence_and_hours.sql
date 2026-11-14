-- Checkout keeps the liquor-licence rule the menu already keeps, and takes no
-- order while the shop is closed.
--
-- 1. Licence. Shoppers only see age-restricted items from a shop with a
--    verified liquor licence: catalogue_public (20260101007300) hides them
--    otherwise. But fn_web_order_quote, the one pricer behind
--    rpc_order_quote_web and rpc_order_place_web, prices from the raw
--    catalogue_item table, which anyone can read, so a basket put together by
--    hand could still buy them. The rule now holds at the quote, and so at
--    placing the order, which re-quotes. fn_merchant_liquor_licensed states
--    it once; catalogue_public keeps its own copy of the same test for now,
--    and supabase/tests/68 checks that the two agree.
--
-- 2. Hours. Checkout refused a shop whose "accepting orders" switch was off,
--    but not one that was closed by its opening hours or had closed early
--    today. Decided with the owner on 12 Nov 2026 that both now refuse.
--    "Open" is the same test bookings already use (fn_booking_open_at, with
--    overrides, city exceptions and opening past midnight). A shop with no
--    hours on file is shown open on the store page, so checkout does not
--    invent a closing time for it either.
--
--    Busy mode is left as it is. The merchant console builds it as "keep
--    taking orders, quote longer", and the onboarding choice to "pause new
--    orders with one tap" is the accepting-orders switch, which checkout
--    already obeys.
--
-- Rollback: re-run fn_web_order_quote from 20261130000100, then
--   drop function public.fn_merchant_open_for_orders(uuid, timestamptz),
--     public.fn_merchant_liquor_licensed(uuid);

create or replace function public.fn_merchant_liquor_licensed(p_merchant_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.document d
      join public.document_requirement r on r.id = d.requirement_id
     where d.owner_type = 'merchant' and d.owner_id = p_merchant_id
       and r.kind = 'liquor_licence'
       and d.status = 'verified' and d.superseded_at is null)
$$;

comment on function public.fn_merchant_liquor_licensed(uuid) is
  'Whether a merchant may sell age-restricted items: a current, verified liquor licence. The same test as catalogue_public.';

revoke execute on function public.fn_merchant_liquor_licensed(uuid) from public, anon, authenticated;
grant execute on function public.fn_merchant_liquor_licensed(uuid) to service_role;

create or replace function public.fn_merchant_open_for_orders(
  p_merchant_id uuid,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  m public.merchant;
  v_today date := (p_at at time zone 'Africa/Nairobi')::date;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    return false;
  end if;

  /* Closed early: for the rest of that day in Nairobi. */
  if m.closed_early_at is not null
     and (m.closed_early_at at time zone 'Africa/Nairobi')::date = v_today then
    return false;
  end if;

  /* No hours on file at all (its own, a chain's shared week, or an override
     for today or yesterday): the store page shows it open, and so does this. */
  if not exists (select 1 from public.merchant_hours h where h.merchant_id = m.id)
     and not exists (
       select 1 from public.merchant_hours h
         join public.merchant_chain_setting c on c.parent_id = h.merchant_id and c.shared_hours
        where h.merchant_id = m.parent_merchant_id)
     and not exists (
       select 1 from public.merchant_hours_override o
        where o.merchant_id = m.id and o.date in (v_today, v_today - 1)) then
    return true;
  end if;

  return public.fn_booking_open_at(m.id, p_at, false);
end;
$$;

comment on function public.fn_merchant_open_for_orders(uuid, timestamptz) is
  'Whether a shop takes orders at a moment by its hours: not closed early that day, and open by fn_booking_open_at. A shop with no hours on file counts as open, as the store page shows it.';

revoke execute on function public.fn_merchant_open_for_orders(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_merchant_open_for_orders(uuid, timestamptz) to service_role;

-- The definition from 20261130000100, with the hours check after the
-- accepting-orders switch and the licence check before anything is priced.
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

  if p_payload ? 'lat' and p_payload ? 'lng'
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

  /* The cash-handling fee is for handling cash. */
  v_cash := case when v_method = 'cash_on_delivery'
                 then (v_price ->> 'cash_handling_cents')::bigint else 0 end;

  v_total := (v_price ->> 'subtotal_cents')::bigint
           + (v_price ->> 'delivery_fee_cents')::bigint
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
    'delivery_fee_cents', (v_price ->> 'delivery_fee_cents')::bigint,
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
