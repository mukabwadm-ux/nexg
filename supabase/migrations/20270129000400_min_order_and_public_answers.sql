-- R34 and R36 from the merchant alignment: a shop's minimum order, and the
-- sign-up answers customers should see, on the shop page.
--
-- R34, minimum order
-- 1. merchant.min_order_kes: null for no minimum. It starts from the shop's
--    sign-up answer (MINIMUM_ORDER_AMOUNT, min_order or min_basket), now and
--    whenever the answers change while no minimum is set. The shop changes
--    it with rpc_merchant_set_min_order.
-- 2. fn_web_order_quote (latest 20270129000300) refuses a basket whose items
--    come to less, after offers: "<shop> takes orders from KES X. Add KES Y
--    more." rpc_order_place_web prices through it.
--
-- R36, sign-up answers customers see
-- 3. merchant_public_answer_key: the answers a shop page may show, with
--    customer wording. Seeded from the booking registry
--    (nexg-booking-2026-10-31.1): every question that goes to the catalogue
--    (catalog.attributes, catalog.policy_declarations, catalog.claims), plus
--    flight_tracking, home_visits and waiting_time_min. Business claims
--    (licences, certifications) are left out: they are checked before they
--    are shown. Staff can add or remove keys.
--
-- merchant_public gains min_order_kes and public_answers (jsonb,
-- [{key, label, value}], only listed keys a shop has answered).
--
-- Rollback: restore merchant_public (20261101000000) and fn_web_order_quote
-- (20270129000300); drop rpc_merchant_set_min_order, the trigger,
-- fn_min_order_from_answers, merchant_public_answer_key and
-- merchant.min_order_kes; delete the audit action.

-- ═══════════════════════════════════════════════ R34. minimum order

alter table public.merchant add column min_order_kes integer;
alter table public.merchant add constraint merchant_min_order_in_range
  check (min_order_kes is null or min_order_kes between 1 and 1000000);
comment on column public.merchant.min_order_kes is
  'The smallest basket, in whole shillings after offers, the shop takes. Null: no minimum.';

create or replace function public.fn_min_order_from_answers(p_answers jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when v between 1 and 1000000 then v::integer end
    from (select coalesce(
            case when jsonb_typeof(p_answers -> 'MINIMUM_ORDER_AMOUNT') = 'object'
                      and coalesce(p_answers #>> '{MINIMUM_ORDER_AMOUNT,currency}', 'KES') = 'KES'
                      and coalesce(p_answers #>> '{MINIMUM_ORDER_AMOUNT,amount_minor}', '') ~ '^[0-9]{1,12}$'
                 then nullif((p_answers #>> '{MINIMUM_ORDER_AMOUNT,amount_minor}')::bigint / 100, 0) end,
            case when coalesce(p_answers ->> 'min_order', '') ~ '^[0-9]{1,9}$'
                 then nullif((p_answers ->> 'min_order')::bigint, 0) end,
            case when coalesce(p_answers ->> 'min_basket', '') ~ '^[0-9]{1,9}$'
                 then nullif((p_answers ->> 'min_basket')::bigint, 0) end) as v) x
$$;
revoke execute on function public.fn_min_order_from_answers(jsonb) from public, anon, authenticated;

create or replace function public.tg_merchant_min_order_from_answers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.min_order_kes is null then
    new.min_order_kes := public.fn_min_order_from_answers(new.answers);
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_merchant_min_order_from_answers() from public, anon, authenticated;

create trigger merchant_min_order_from_answers
before insert or update of answers on public.merchant
for each row execute function public.tg_merchant_min_order_from_answers();

update public.merchant
   set min_order_kes = public.fn_min_order_from_answers(answers)
 where min_order_kes is null
   and public.fn_min_order_from_answers(answers) is not null;

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('merchant.min_order_changed', 'merchants', 'info', true, 'A shop changed its minimum order')
on conflict (action) do nothing;

create or replace function public.rpc_merchant_set_min_order(p_merchant_id uuid, p_min_order_kes integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare m public.merchant;
begin
  perform public.fn_merchant_mine(p_merchant_id);
  select * into m from public.merchant where id = p_merchant_id;
  if p_min_order_kes is not null and (p_min_order_kes < 1 or p_min_order_kes > 1000000) then
    raise exception 'A minimum order between KES 1 and KES 1,000,000, or none.';
  end if;

  update public.merchant set min_order_kes = p_min_order_kes where id = p_merchant_id;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type, p_module => 'merchants',
    p_action => 'merchant.min_order_changed',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_target_label => coalesce(m.trading_name, m.legal_name),
    p_city_id => m.city_id,
    p_before => jsonb_build_object('min_order_kes', m.min_order_kes),
    p_after => jsonb_build_object('min_order_kes', p_min_order_kes));

  return jsonb_build_object('ok', true,
    'message', case when p_min_order_kes is null then 'No minimum order.'
                    else 'Baskets now need at least KES ' || to_char(p_min_order_kes, 'FM999,999,999') || '.' end);
end;
$$;
revoke execute on function public.rpc_merchant_set_min_order(uuid, integer) from public, anon;
grant execute on function public.rpc_merchant_set_min_order(uuid, integer) to authenticated;

-- ═══════════════════════════════════════════════ R36. answers customers see

create table public.merchant_public_answer_key (
  key   text primary key check (key ~ '^[A-Za-z0-9_]{1,60}$'),
  label text not null check (char_length(trim(label)) between 1 and 80),
  sort  smallint not null default 0
);
comment on table public.merchant_public_answer_key is
  'Sign-up answers a shop page may show, with the wording customers see. Anything not listed stays private.';
alter table public.merchant_public_answer_key enable row level security;
revoke all on public.merchant_public_answer_key from public, anon, authenticated;
grant select on public.merchant_public_answer_key to anon, authenticated;
create policy merchant_public_answer_key_read on public.merchant_public_answer_key
  for select to anon, authenticated using (true);

insert into public.merchant_public_answer_key (key, label) values
  ('accommodation_included', 'Accommodation Included'),
  ('assistance_services', 'Assistance Services'),
  ('av_equipment', 'Av Equipment'),
  ('baby_product_range', 'Baby product range'),
  ('bakery_specialties', 'Bakery specialties'),
  ('battery_brands_text', 'Battery Brands'),
  ('bike_types', 'Bike Types'),
  ('biz_services_offered', 'Biz Services Offered'),
  ('book_genres', 'Book Genres'),
  ('brand_tier', 'Brand Tier'),
  ('brands_stocked_text', 'Which brands do you stock'),
  ('brewing_methods', 'Brewing methods'),
  ('bridal_packages', 'Bridal packages'),
  ('clinic_specializations', 'Clinic Specializations'),
  ('coaching_areas', 'Coaching Areas'),
  ('cold_pressed', 'Cold pressed'),
  ('computer_brands', 'Computer Brands'),
  ('console_types', 'Console Types'),
  ('corporate_clients', 'Corporate Clients'),
  ('corporate_gifting', 'Corporate gifting'),
  ('couples_packages', 'Couples Packages'),
  ('cuisine_types', 'Cuisine types'),
  ('currencies_traded', 'Currencies Traded'),
  ('custom_messages', 'Custom messages'),
  ('dessert_specialties', 'Dessert specialties'),
  ('destinations_coverage', 'Destinations Coverage'),
  ('destinations_text', 'Destinations'),
  ('dietary_options_cake', 'Dietary options cake'),
  ('eco_products', 'Eco Products'),
  ('emergency_callout', 'Emergency Callout'),
  ('event_makeup', 'Event makeup'),
  ('farm_direct', 'Farm direct'),
  ('fin_services_offered_bank', 'Fin Services Offered Bank'),
  ('flight_included', 'Flight Included'),
  ('flight_tracking', 'Flight Tracking'),
  ('fragrance_families', 'Fragrance families'),
  ('fresh_or_preserved', 'Fresh or preserved'),
  ('gaming_accessories', 'Gaming Accessories'),
  ('garment_types', 'Garment types'),
  ('gift_packaging', 'Gift Packaging'),
  ('gift_wrapping', 'Gift Wrapping'),
  ('guide_included', 'Guide Included'),
  ('gym_facilities', 'Gym Facilities'),
  ('hair_types_served', 'Hair types served'),
  ('home_visits', 'Home Visits'),
  ('inspection_types', 'Inspection Types'),
  ('insurance_accepted', 'Insurance Accepted'),
  ('insurance_included', 'Insurance Included'),
  ('insurance_items', 'Insurance Items'),
  ('insurance_types', 'Insurance Types'),
  ('kids_age_range', 'Kids Age Range'),
  ('lab_test_types', 'Lab Test Types'),
  ('live_seafood', 'Live Seafood'),
  ('local_sourcing', 'Local sourcing'),
  ('massage_types', 'Massage Types'),
  ('meal_plan', 'Meal Plan'),
  ('med_supply_types', 'Med supply types'),
  ('membership_types', 'Membership Types'),
  ('multi_brand', 'Multi brand'),
  ('new_or_refurbished', 'New Or Refurbished'),
  ('new_or_used', 'New Or Used'),
  ('number_of_brands', 'Number of brands'),
  ('occasions_spec', 'Occasions spec'),
  ('organic_options', 'Organic options'),
  ('own_brand', 'Own brand'),
  ('package_types', 'Package Types'),
  ('parks_covered', 'Parks Covered'),
  ('phone_brands', 'Phone Brands'),
  ('physical_locations_count', 'Physical Locations Count'),
  ('pre_owned_games', 'Pre Owned Games'),
  ('product_description', 'What should customers know about your products'),
  ('remittance_corridors', 'Remittance Corridors'),
  ('repair_services', 'Repair Services'),
  ('reservation_venue_types', 'Reservation Venue Types'),
  ('return_policy', 'Return Policy'),
  ('sacco_services_offered', 'Sacco Services Offered'),
  ('shoe_size_system', 'Shoe Size System'),
  ('size_range_adults', 'Size Range Adults'),
  ('skin_types_served', 'Skin types served'),
  ('smoothie_bowls', 'Smoothie bowls'),
  ('spa_services', 'Spa Services'),
  ('staff_included', 'Staff included'),
  ('supplement_categories', 'Supplement categories'),
  ('tele_platforms', 'Tele Platforms'),
  ('telecom_networks', 'Telecom Networks'),
  ('telecom_services_offered', 'Telecom Services Offered'),
  ('therapy_types', 'Therapy Types'),
  ('tire_brands_text', 'Tire Brands'),
  ('tour_languages', 'Tour Languages'),
  ('tour_modes', 'Tour Modes'),
  ('training_specializations', 'Training Specializations'),
  ('travel_insurance_assist', 'Travel Insurance Assist'),
  ('vape_device_types', 'Vape Device Types'),
  ('vegan_menu', 'Vegan menu'),
  ('vehicle_types_rental', 'Which vehicles can customers rent'),
  ('vehicle_types_transfer', 'Which vehicles do you use for transfers'),
  ('vip_packages', 'Vip Packages'),
  ('vip_services_text', 'Vip Services'),
  ('waiting_time_min', 'Waiting Time'),
  ('warranty_months', 'Warranty Months'),
  ('warranty_offered', 'Warranty Offered'),
  ('wash_types', 'Wash Types'),
  ('weekly_market', 'Weekly market'),
  ('wifi_available', 'Wifi available'),
  ('wine_origins', 'Wine origins'),
  ('venue_type', 'What kind of place is it'),
  ('returns', 'Returns'),
  ('makes', 'What do you make'),
  ('custom_message', 'Handwritten card with the order'),
  ('occasions', 'Occasions you cover'),
  ('cuisine', 'What kind of restaurant'),
  ('dietary', 'Dietary options you cover'),
  ('spend_band', 'Typical order for one person'),
  ('fresh_produce', 'Do you sell fresh produce'),
  ('services', 'What do you do'),
  ('orderable', 'What can guests order')
on conflict (key) do nothing;

-- ═══════════════════════════════════════════════ checkout

-- fn_web_order_quote: 20270129000300, plus the shop's minimum order.
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

-- ═══════════════════════════════════════════════ the shop page

-- merchant_public: 20261101000000, plus min_order_kes and public_answers.
create or replace view public.merchant_public
with (security_invoker = false)
as
select
  m.id,
  m.trading_name,
  m.category,
  m.category_other,
  m.cover_photo_path,
  m.featured,
  c.slug as city_slug,
  c.name as city_name,
  b.name as branch_name,
  b.address_text as branch_address,
  b.latitude as branch_latitude,
  b.longitude as branch_longitude,
  m.went_live_at as listed_at,
  m.explore_visible,
  m.concierge_pick,
  m.accepting_orders,
  m.busy_mode_until,
  m.closed_early_at,
  m.pay_on_delivery as pay_on_delivery_enabled,
  m.pay_on_delivery_cap_kes,
  m.prep_minutes,
  m.parent_merchant_id,
  (select h.opens from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as opens_today,
  (select h.closes from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as closes_today,
  (select h.closed from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as closed_today,
  case when m.health_band = 'green' then 'green' end as health_badge,
  m.subcategory,
  coalesce(
    (select active_zone.id from public.zone active_zone where active_zone.id = b.zone_id and active_zone.active),
    (select z.id from public.zone_for_point(b.longitude, b.latitude) z)
  ) as zone_id,
  m.category_key,
  m.min_order_kes,
  coalesce((select jsonb_agg(jsonb_build_object('key', k.key, 'label', k.label, 'value', m.answers -> k.key)
                             order by k.sort, k.label)
              from public.merchant_public_answer_key k
             where m.answers ? k.key
               and jsonb_typeof(m.answers -> k.key) <> 'null'
               and coalesce(m.answers ->> k.key, '') not in ('', 'none', '[]', '{}')), '[]'::jsonb) as public_answers
from public.merchant m
join public.city c on c.id = m.city_id
left join public.merchant_branch b on b.merchant_id = m.id and b.is_primary
where m.status = 'live'
  and m.explore_visible
  and m.deleted_at is null;

grant select on public.merchant_public to anon, authenticated;
