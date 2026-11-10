-- Best sellers on the home page: paid first, then what actually sells.
--
-- 1. Paid. The existing "popular_request" featured placement (three
--    positions per city, sold through the same request, quote and payment
--    flow as every featured slot) is the paid Best seller. A merchant now
--    names the product when they ask for it, kept on featured_booking.item_id.
--    While a slot week is live, that product leads the row with the
--    Sponsored label.
-- 2. Top selling. The rest of the row: the products with the most units in
--    paid orders over the last 30 days, at most two per merchant.
-- 3. Popular. Until there are enough sales, products the merchant marks as
--    popular (catalogue_item.highlighted) fill what is left.
--
-- Every product shown is available, has a price, and belongs to a business
-- merchant_public lists (live and visible). The row updates on its own: a
-- slot going live, an order being paid, or a merchant marking a product.
--
-- Also fixes rpc_merchant_request_featured, which wrote requested_via =
-- 'merchant_dashboard', a value featured_booking_requested_via_check does
-- not allow, so every featured request from a merchant's dashboard failed.

alter table public.featured_booking
  add column if not exists item_id uuid references public.catalogue_item (id) on delete set null;

comment on column public.featured_booking.item_id is
  'The product a paid Best seller placement (kind popular_request) promotes.';

-- ═══════════════════════════════ a merchant asks for a Best seller slot

drop function if exists public.rpc_merchant_request_featured(uuid, uuid, date, integer, text);

create or replace function public.rpc_merchant_request_featured(
  p_merchant_id uuid,
  p_placement_id uuid,
  p_week_start date,
  p_weeks integer default 1,
  p_note text default null,
  p_item_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  p public.featured_placement;
  v_price bigint;
  v_booking uuid;
  v_elig jsonb;
  v_item public.catalogue_item;
begin
  perform public.fn_merchant_mine(p_merchant_id);
  select * into m from public.merchant where id = p_merchant_id;
  select * into p from public.featured_placement where id = p_placement_id;
  if not found then raise exception 'No such placement.'; end if;

  if m.status <> 'live' then
    raise exception 'Featured slots are for live businesses. Yours is %.', m.status;
  end if;
  if p.city_id <> m.city_id then
    raise exception 'That slot is in another city.';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'Slots run Monday to Sunday, so pick a Monday.';
  end if;
  if p_week_start < current_date then
    raise exception 'That week has already started.';
  end if;
  if coalesce(p_weeks, 0) < 1 or p_weeks > 12 then
    raise exception 'Between 1 and 12 weeks.';
  end if;

  /* A Best seller slot promotes one product, named now. */
  if p.kind = 'popular_request' then
    select * into v_item from public.catalogue_item where id = p_item_id;
    if v_item.id is null or v_item.merchant_id <> p_merchant_id then
      raise exception 'Choose one of your own products for the Best sellers slot.';
    end if;
    if not v_item.available or v_item.price_kes is null then
      raise exception 'That product is unavailable or has no price, so it cannot be promoted.';
    end if;
  end if;

  if exists (select 1 from public.featured_booking b
              where b.merchant_id = p_merchant_id
                and b.status in ('requested', 'quoted', 'booked', 'live')) then
    raise exception 'You already have a featured request with us. We will come back to you on that one first.';
  end if;

  /* The price and the eligibility each have one definition
     already, shared with the staff console and the nightly cron.
     Recomputing either here is how a merchant gets quoted one
     number and billed another. */
  v_price := public.fn_featured_price(p.city_id, p.kind, m.category);
  v_elig := public.fn_featured_eligibility(p_merchant_id, p.kind, m.category);

  if not coalesce((v_elig ->> 'passed')::boolean, false) then
    raise exception '%', coalesce(
      v_elig ->> 'remedy',
      'Your account is not eligible for a featured slot yet.');
  end if;

  insert into public.featured_booking (
    merchant_id, placement_id, placement_kind, category, city_id,
    status, requested_via, requested_at, requested_by,
    wanted_start, weeks, eligibility, quoted_price, notes, item_id)
  values (
    p_merchant_id, p_placement_id, p.kind, m.category, m.city_id,
    /* 'dashboard' is what featured_booking_requested_via_check allows; the
       earlier 'merchant_dashboard' failed every request from a merchant. */
    'requested', 'dashboard', now(), (select auth.uid()),
    p_week_start, p_weeks, v_elig, v_price, p_note, v_item.id)
  returning id into v_booking;

  insert into public.merchant_message (merchant_id, direction, channel, subject, body)
  values (p_merchant_id, 'in', 'in_app', 'Featured slot requested',
          'Week of ' || to_char(p_week_start, 'DD Mon') || ' · '
          || p_weeks || ' week' || case when p_weeks = 1 then '' else 's' end
          || coalesce(' · ' || v_item.name, '')
          || coalesce(' · ' || p_note, ''));

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type, p_module => 'featured',
    p_action => 'featured.requested_by_merchant',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_target_label => coalesce(m.trading_name, m.legal_name),
    p_city_id => m.city_id, p_reason => p_note, p_severity => 'notice',
    p_after => jsonb_build_object('booking_id', v_booking, 'weeks', p_weeks,
                                  'week_start', p_week_start, 'item_id', v_item.id,
                                  'amount_cents', v_price * 100, 'currency', 'KES'));

  return jsonb_build_object('ok', true, 'booking_id', v_booking,
    'priced', v_price is not null,
    'message', case when v_price is null
      then 'Asked for. There is no published rate for that slot in your city yet, so somebody will call you with the price before anything is booked.'
      else 'Asked for at KES ' || v_price || ' a week. Nothing is charged yet — somebody will call to confirm and take payment.' end);
end;
$$;

revoke execute on function public.rpc_merchant_request_featured(uuid, uuid, date, integer, text, uuid)
  from public, anon;
grant execute on function public.rpc_merchant_request_featured(uuid, uuid, date, integer, text, uuid)
  to authenticated;

-- ═══════════════════════════════ what the home page reads

/*
 * The Best sellers row: paid products first, then the most sold, then the
 * ones merchants mark as popular. Reads only; open to every visitor, like
 * merchant_public. p_city_slug narrows the row to one city.
 */
create or replace function public.rpc_best_sellers(
  p_city_slug text default null,
  p_limit integer default 8
)
returns table (
  item_id uuid,
  item_name text,
  price_kes integer,
  photo_path text,
  merchant_id uuid,
  trading_name text,
  category text,
  branch_name text,
  source text,
  booking_id uuid,
  units_sold bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with shown as (
    /* Products a guest may see and order. */
    select ci.id, ci.name, ci.price_kes, ci.photo_path, ci.merchant_id,
           mp.trading_name, mp.category::text as category, mp.branch_name
      from public.catalogue_item ci
      join public.merchant_public mp on mp.id = ci.merchant_id
     where ci.available
       and ci.price_kes is not null
       and mp.accepting_orders is not false
       and (p_city_slug is null or mp.city_slug = p_city_slug)
  ),
  paid as (
    select distinct on (s.id)
           s.*, 'sponsored'::text as source, b.id as booking_id, null::bigint as units_sold,
           p.position as pos
      from public.featured_slot_week sw
      join public.featured_placement p on p.id = sw.placement_id
      join public.featured_booking b on b.id = sw.booking_id
      left join public.featured_creative cr on cr.booking_id = b.id and cr.status = 'approved'
      join shown s on s.id = coalesce(cr.pinned_item_id, b.item_id) and s.merchant_id = b.merchant_id
     where p.kind = 'popular_request'
       and p.enabled
       and sw.status = 'live'
       and sw.week_start <= current_date
       and current_date <= sw.week_start + 6
     order by s.id, p.position
  ),
  sales as (
    select oi.catalogue_item_id as id, sum(oi.quantity)::bigint as units
      from public.order_item oi
      join public.order o on o.id = oi.order_id
     where o.payment_status in ('paid', 'collected')
       and o.placed_at >= now() - interval '30 days'
       and oi.removed_at is null
       and oi.catalogue_item_id is not null
     group by oi.catalogue_item_id
  ),
  top_selling as (
    select s.*, 'top_selling'::text as source, null::uuid as booking_id, sa.units as units_sold,
           row_number() over (partition by s.merchant_id order by sa.units desc, s.name) as per_merchant,
           sa.units as score
      from shown s
      join sales sa on sa.id = s.id
     where s.id not in (select id from paid)
  ),
  popular as (
    select s.*, 'popular'::text as source, null::uuid as booking_id, null::bigint as units_sold,
           row_number() over (partition by s.merchant_id order by s.name) as per_merchant
      from shown s
      join public.catalogue_item ci on ci.id = s.id and ci.highlighted
     where s.id not in (select id from paid)
       and s.id not in (select id from top_selling where per_merchant <= 2)
  ),
  ranked as (
    select id, name, price_kes, photo_path, merchant_id, trading_name, category, branch_name,
           source, booking_id, units_sold, 1 as tier, pos::bigint as ord
      from paid
    union all
    select id, name, price_kes, photo_path, merchant_id, trading_name, category, branch_name,
           source, booking_id, units_sold, 2, row_number() over (order by score desc, name)
      from top_selling where per_merchant <= 2
    union all
    select id, name, price_kes, photo_path, merchant_id, trading_name, category, branch_name,
           source, booking_id, units_sold, 3, row_number() over (order by per_merchant, name)
      from popular
  )
  select id, name, price_kes, photo_path, merchant_id, trading_name, category, branch_name,
         source, booking_id, units_sold
    from ranked
   order by tier, ord
   limit greatest(1, least(coalesce(p_limit, 8), 24));
$$;

comment on function public.rpc_best_sellers(text, integer) is
  'The home page Best sellers row: live paid Best seller slots, then the most sold products of the last 30 days (two per merchant at most), then products merchants mark as popular.';

revoke execute on function public.rpc_best_sellers(text, integer) from public;
grant execute on function public.rpc_best_sellers(text, integer) to anon, authenticated;
