-- Merchant promotions, charged at checkout; and featured placements a
-- merchant can actually see.
--
-- 1. merchant_promotion: a discount a merchant runs on one item or on their
--    whole catalogue, a percentage or a fixed amount off, from a start time
--    to an optional end. Written only through rpc_merchant_promotion_save and
--    rpc_merchant_promotion_set_status, both audited.
-- 2. fn_item_promo_price is the one place a promotional price is worked out.
--    Checkout (fn_web_order_quote, used by both the basket quote and order
--    placement) and the public pages (rpc_promoted_prices) both use it, so
--    the price a guest sees is the price they are charged. Prices stay whole
--    shillings, rounded down in the guest's favour, and never fall below
--    KES 1. When several promotions apply, the lowest price wins. The
--    merchant funds the discount: commission is worked on the discounted
--    subtotal, as for any price the merchant sets.
-- 3. Merchants could not read featured_rule or featured_placement, so the
--    eligibility check returned "passed": null and the Promotions page said
--    "availability could not be checked", with no slots listed. Both are
--    now readable by signed-in users; neither holds anything private.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('promotion.saved', 'merchants', 'info', true, 'Merchant promotion created or changed'),
  ('promotion.status_changed', 'merchants', 'info', true, 'Merchant promotion paused, resumed or ended')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ featured, visible to merchants

drop policy if exists featured_rule_read_signed_in on public.featured_rule;
create policy featured_rule_read_signed_in on public.featured_rule
  for select to authenticated using (true);

drop policy if exists featured_placement_read_enabled on public.featured_placement;
create policy featured_placement_read_enabled on public.featured_placement
  for select to authenticated using (enabled);

-- ═══════════════════════════════════════════════ promotions

create table if not exists public.merchant_promotion (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  /* percent: value is 1-90 (% off). amount: value is whole KES off. */
  kind text not null check (kind in ('percent', 'amount')),
  value integer not null check (value > 0),
  /* null: everything in the merchant's catalogue. */
  catalogue_item_id uuid references public.catalogue_item (id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_percent_in_range check (kind <> 'percent' or value between 1 and 90),
  constraint promotion_ends_after_start check (ends_at is null or ends_at > starts_at)
);

create index if not exists merchant_promotion_by_merchant
  on public.merchant_promotion (merchant_id, status, starts_at);

comment on table public.merchant_promotion is
  'Discounts a merchant runs on one item or their whole catalogue. Applied at checkout by fn_web_order_quote.';

alter table public.merchant_promotion enable row level security;
revoke all on public.merchant_promotion from anon, authenticated;
grant select on public.merchant_promotion to anon, authenticated;

drop policy if exists merchant_promotion_member_read on public.merchant_promotion;
create policy merchant_promotion_member_read on public.merchant_promotion
  for select to authenticated
  using (authz.is_merchant_member(merchant_id) or authz.works_merchant(merchant_id));

drop policy if exists merchant_promotion_public_read on public.merchant_promotion;
create policy merchant_promotion_public_read on public.merchant_promotion
  for select to anon, authenticated
  using (status = 'active' and public.fn_merchant_is_live(merchant_id));

/*
 * The price of one item now: its own price, or the lowest price any running
 * promotion gives it. Whole shillings, rounded down, never below KES 1.
 */
create or replace function public.fn_item_promo_price(
  p_item_id uuid,
  p_merchant_id uuid,
  p_price_kes integer,
  p_at timestamptz default now()
)
returns table (price_kes integer, promotion_id uuid, promotion_name text, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select best.price_kes, best.promotion_id, best.promotion_name, best.ends_at
    from (
      select greatest(1, case p.kind
               when 'percent' then floor(p_price_kes * (100 - p.value) / 100.0)::integer
               else p_price_kes - p.value end) as price_kes,
             p.id as promotion_id, p.name as promotion_name, p.ends_at
        from public.merchant_promotion p
       where p.merchant_id = p_merchant_id
         and p.status = 'active'
         and (p.catalogue_item_id is null or p.catalogue_item_id = p_item_id)
         and p.starts_at <= p_at
         and (p.ends_at is null or p.ends_at > p_at)
      union all
      select p_price_kes, null::uuid, null::text, null::timestamptz
    ) best
   where p_price_kes is not null
   order by best.price_kes asc, best.promotion_id nulls last
   limit 1;
$$;

revoke execute on function public.fn_item_promo_price(uuid, uuid, integer, timestamptz) from public;
grant execute on function public.fn_item_promo_price(uuid, uuid, integer, timestamptz) to anon, authenticated;

/* What the store and product pages show: the items of a live merchant that a
   running promotion makes cheaper, with the price a guest will be charged. */
create or replace function public.rpc_promoted_prices(p_merchant_id uuid)
returns table (
  catalogue_item_id uuid,
  price_kes integer,
  promo_price_kes integer,
  promotion_id uuid,
  promotion_name text,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.price_kes, pp.price_kes, pp.promotion_id, pp.promotion_name, pp.ends_at
    from public.catalogue_item i
    cross join lateral public.fn_item_promo_price(i.id, i.merchant_id, i.price_kes) pp
   where i.merchant_id = p_merchant_id
     and public.fn_merchant_is_live(p_merchant_id)
     and i.available
     and i.price_kes is not null
     and pp.promotion_id is not null
     and pp.price_kes < i.price_kes;
$$;

revoke execute on function public.rpc_promoted_prices(uuid) from public;
grant execute on function public.rpc_promoted_prices(uuid) to anon, authenticated;

-- ═══════════════════════════════════════════════ merchants run them

create or replace function public.rpc_merchant_promotion_save(
  p_merchant_id uuid,
  p_promotion_id uuid,
  p_name text,
  p_kind text,
  p_value integer,
  p_item_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.merchant_promotion;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_start timestamptz := coalesce(p_starts_at, now());
  v_item public.catalogue_item;
begin
  perform public.fn_merchant_mine(p_merchant_id);

  if v_name is null or length(v_name) > 80 then
    raise exception 'Give the promotion a name of up to 80 characters.' using errcode = '22023';
  end if;
  if p_kind not in ('percent', 'amount') then
    raise exception 'Choose a percentage or an amount off.' using errcode = '22023';
  end if;
  if p_value is null or p_value < 1 or (p_kind = 'percent' and p_value > 90) then
    raise exception 'A percentage off must be between 1 and 90.' using errcode = '22023';
  end if;
  if p_ends_at is not null and p_ends_at <= v_start then
    raise exception 'The end has to be after the start.' using errcode = '22023';
  end if;
  if p_item_id is not null then
    select * into v_item from public.catalogue_item where id = p_item_id;
    if v_item.id is null or v_item.merchant_id <> p_merchant_id then
      raise exception 'Choose one of your own items.' using errcode = '22023';
    end if;
    if p_kind = 'amount' and v_item.price_kes is not null and p_value >= v_item.price_kes then
      raise exception 'The amount off has to be less than the item''s price (KES %).', v_item.price_kes
        using errcode = '22023';
    end if;
  end if;

  if p_promotion_id is null then
    insert into public.merchant_promotion
      (merchant_id, name, kind, value, catalogue_item_id, starts_at, ends_at, created_by)
    values (p_merchant_id, v_name, p_kind, p_value, p_item_id, v_start, p_ends_at, (select auth.uid()))
    returning * into v_row;
  else
    update public.merchant_promotion
       set name = v_name, kind = p_kind, value = p_value, catalogue_item_id = p_item_id,
           starts_at = v_start, ends_at = p_ends_at, updated_at = now()
     where id = p_promotion_id and merchant_id = p_merchant_id and status <> 'ended'
    returning * into v_row;
    if v_row.id is null then
      raise exception 'That promotion has ended or is not yours.' using errcode = '22023';
    end if;
  end if;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type, p_module => 'merchants',
    p_action => 'promotion.saved', p_target_type => 'merchant_promotion', p_target_id => v_row.id,
    p_after => jsonb_build_object('merchant_id', p_merchant_id, 'name', v_row.name,
                                  'kind', v_row.kind, 'value', v_row.value,
                                  'item', v_row.catalogue_item_id,
                                  'starts_at', v_row.starts_at, 'ends_at', v_row.ends_at));

  return jsonb_build_object('ok', true, 'promotion_id', v_row.id,
    'message', case when p_promotion_id is null then 'Promotion created.' else 'Promotion saved.' end);
end;
$$;

create or replace function public.rpc_merchant_promotion_set_status(p_promotion_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.merchant_promotion;
begin
  select * into v_row from public.merchant_promotion where id = p_promotion_id;
  if v_row.id is null then
    raise exception 'No such promotion.' using errcode = '22023';
  end if;
  perform public.fn_merchant_mine(v_row.merchant_id);
  if p_status not in ('active', 'paused', 'ended') then
    raise exception 'Pause, resume or end the promotion.' using errcode = '22023';
  end if;
  if v_row.status = 'ended' then
    raise exception 'That promotion has already ended.' using errcode = '22023';
  end if;

  update public.merchant_promotion
     set status = p_status, updated_at = now(),
         ends_at = case when p_status = 'ended' then least(coalesce(ends_at, now()), now()) else ends_at end
   where id = p_promotion_id
  returning * into v_row;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type, p_module => 'merchants',
    p_action => 'promotion.status_changed', p_target_type => 'merchant_promotion',
    p_target_id => v_row.id,
    p_after => jsonb_build_object('merchant_id', v_row.merchant_id, 'status', v_row.status));

  return jsonb_build_object('ok', true, 'status', v_row.status,
    'message', case p_status when 'active' then 'Promotion running.'
                             when 'paused' then 'Promotion paused.' else 'Promotion ended.' end);
end;
$$;

revoke execute on function public.rpc_merchant_promotion_save(uuid, uuid, text, text, integer, uuid, timestamptz, timestamptz),
  public.rpc_merchant_promotion_set_status(uuid, text) from public, anon;
grant execute on function public.rpc_merchant_promotion_save(uuid, uuid, text, text, integer, uuid, timestamptz, timestamptz),
  public.rpc_merchant_promotion_set_status(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════ checkout charges them

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

  if v_method not in ('card', 'mpesa_stk', 'cash_on_delivery') then
    return jsonb_build_object('ok', false, 'message', 'Choose how you would like to pay.');
  end if;

  v_wanted := coalesce(jsonb_array_length(p_payload -> 'items'), 0);
  if v_wanted = 0 then
    return jsonb_build_object('ok', false, 'message', 'Your basket is empty.');
  end if;
  if v_wanted > 60 then
    return jsonb_build_object('ok', false, 'message', 'That is a lot for one order. Split it in two.');
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
