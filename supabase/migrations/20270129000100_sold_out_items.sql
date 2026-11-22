-- R31, part 1: an item can be sold out and still be shown, marked as such.
--
-- On the Menu page, OFF takes an item off the menu, and customers stop seeing
-- it. The offerings editor uses the same switch for drafts: an unpublished
-- item is off. So available = false cannot mean "sold out", because showing
-- those rows would show hidden items and drafts. This adds a separate state.
--
-- 1. catalogue_item.sold_out: listed, but none left right now. The shop sets
--    it on the Menu page and clears it when the item is back.
-- 2. catalogue_menu_public: what catalogue_public shows, plus the sold-out
--    items, with a sold_out column, for apps that grey them out.
-- 3. catalogue_public: the same columns as before, now read from
--    catalogue_menu_public without the sold-out items. The website's
--    Discovery pages, the Discovery engine and the public API read it without
--    a sold-out column, so they see exactly what they saw before.
-- 4. fn_web_order_quote (latest body 20270116000800): a sold-out item is
--    refused by name ("<item> is sold out."), as a sold-out version already
--    is. rpc_order_place_web prices through it, so placing refuses it too.
--
-- Rollback:
--   create or replace view public.catalogue_public ... (its 20270116000800 body);
--   drop view public.catalogue_menu_public;
--   create or replace function public.fn_web_order_quote ... (its 20270116000800 body);
--   alter table public.catalogue_item drop column sold_out;

alter table public.catalogue_item
  add column sold_out boolean not null default false;

comment on column public.catalogue_item.sold_out is
  'Listed, but none left right now: customers see the item marked sold out and cannot order it. Not the same as available = false, which takes it off the menu.';

-- ═══════════════════════════════════════════════ 2. the apps' item list

create view public.catalogue_menu_public
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
  i.sold_out
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

comment on view public.catalogue_menu_public is
  'Listed items for the apps, sold-out ones included (sold_out = true). catalogue_public is the same list without them.';

revoke all on public.catalogue_menu_public from public;
grant select on public.catalogue_menu_public to anon, authenticated;

-- ═══════════════════════════════════════════════ 3. unchanged for its readers

create or replace view public.catalogue_public
with (security_invoker = false)
as
select id, merchant_id, section_id, name, description, price_kes, available,
       age_restricted, highlighted, sort, photo_path, gallery_paths, kind,
       booking_offering_id, sold_by, unit_label, unit_step, unit_min, unit_max,
       price_is_estimate, has_options, has_variants
from public.catalogue_menu_public
where not sold_out;

grant select on public.catalogue_public to anon, authenticated;

-- ═══════════════════════════════════════════════ 4. checkout refuses it

-- fn_web_order_quote: 20270116000800, plus sold-out items.
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
      'age_restricted', i.age_restricted) order by q.n),
    coalesce(sum((round(pp.price_kes::numeric * 100 * i.unit_step)::bigint
                  + (ln.opts ->> 'extra_cents')::bigint) * q.quantity), 0),
    count(*)
  into v_lines, v_subtotal, v_found
  from jsonb_array_elements(p_payload -> 'items') with ordinality as l(line, n)
  cross join lateral (select nullif(l.line ->> 'catalogue_item_id', '')::uuid as catalogue_item_id,
                             case when (l.line ->> 'quantity') ~ '^[0-9]+$'
                                  then (l.line ->> 'quantity')::integer end as quantity,
                             l.line ->> 'note' as note, l.n) q
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
    'has_estimated_prices', exists (
      select 1 from jsonb_array_elements(v_lines) l where (l ->> 'price_is_estimate')::boolean),
    'currency', 'KES');
end;
$$;

revoke execute on function public.fn_web_order_quote(jsonb) from public, anon, authenticated;
grant execute on function public.fn_web_order_quote(jsonb) to service_role;
