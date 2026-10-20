-- The agreed rate card, wired into pricing.
--
-- Commission is 14% (merchant's own riders, pickup, dining) or 28% (a NexG
-- rider delivers); a merchant with a negotiated rate keeps it. The guest pays
-- a service fee of 2.5% capped at KES 150, or 4% capped at KES 200 when the
-- merchant's commission is under 14%, or a flat KES 150 above KES 4,960.
-- Baskets under KES 800 carry a KES 250 surcharge. Delivery is KES 80 for the
-- first km and KES 25 per km after, priced at the top of each band.
--
-- Settings are held in KES, as the registry labels them; orders are in cents.

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort)
values
  ('fees.commission_nexg_delivery', 'fees', 'city_category', 'pct', '%',
   'Commission · NexG rider delivers',
   'Used instead of the standard commission when a NexG rider delivers the order.',
   true, false, 'finance+ops_manager', '{orders,finance,merchants}', null, 104),
  ('fees.service_cap', 'fees', 'city', 'money', 'KES',
   'Service fee cap', 'The most a standard service fee can reach.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 125),
  ('fees.service_pct_reduced', 'fees', 'city', 'pct', '%',
   'Service fee · reduced-commission merchants',
   'Service fee when the merchant agreed less than the standard commission.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 126),
  ('fees.service_cap_reduced', 'fees', 'city', 'money', 'KES',
   'Service fee cap · reduced-commission merchants', 'The cap on the reduced-rate service fee.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 127),
  ('fees.service_flat_above', 'fees', 'city', 'money', 'KES',
   'Flat service fee above', 'Baskets above this pay the flat service fee instead of a percentage.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 128),
  ('fees.service_flat', 'fees', 'city', 'money', 'KES',
   'Flat service fee', 'The service fee on a basket above the flat-fee threshold.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 129),
  ('fees.commission_standard', 'fees', 'global', 'pct', '%',
   'Standard commission', 'The rate below which a merchant counts as reduced-commission.',
   true, false, 'finance+ops_manager', '{orders,finance}', null, 130),
  ('fees.weather_fee', 'fees', 'city', 'money', 'KES',
   'Weather fee', 'Added when the weather is bad; paid to the rider, plus VAT.',
   true, false, 'finance+ops_manager', '{orders,web}', null, 131),
  ('fees.rider_share_pct', 'fees', 'global', 'pct', '%',
   'Rider share of delivery fee', 'The part of the delivery fee the rider keeps.',
   true, false, 'finance+ops_manager', '{orders,finance}', null, 132),
  ('tax.vat_pct', 'fees', 'global', 'pct', '%',
   'VAT', 'Charged on NexG commissions and fees.',
   true, false, 'finance+ops_manager', '{orders,finance}', null, 133)
on conflict (key) do nothing;

insert into settings.version (key, scope_kind, value, status, effective_from, reason, activated_at)
select v.key, 'global'::settings.scope_kind, to_jsonb(v.val), 'active'::settings.version_status,
       now(), 'Agreed rate card.', now()
from (values
  ('fees.commission', 14::numeric),
  ('fees.commission_nexg_delivery', 28),
  ('fees.commission_standard', 14),
  ('fees.service_pct', 2.5),
  ('fees.service_cap', 150),
  ('fees.service_pct_reduced', 4),
  ('fees.service_cap_reduced', 200),
  ('fees.service_flat_above', 4960),
  ('fees.service_flat', 150),
  ('fees.small_basket_threshold', 800),
  ('fees.small_basket_fee', 250),
  ('fees.night_surcharge', 40),
  ('fees.weather_fee', 80),
  ('fees.rider_share_pct', 70),
  ('tax.vat_pct', 16),
  ('fees.delivery.band_1', 130),
  ('fees.delivery.band_2', 205),
  ('fees.delivery.band_3', 255),
  ('fees.delivery.band_4', 430)
) as v(key, val)
where not exists (
  select 1 from settings.version x
  where x.key = v.key and x.scope_kind = 'global' and x.status = 'active');

drop function if exists public.fn_price_order(uuid, text, bigint, smallint, timestamptz);

create or replace function public.fn_price_order(
  p_city_id uuid,
  p_category text,
  p_subtotal_cents bigint,
  p_band smallint default 1,
  p_at timestamptz default now(),
  p_merchant_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_delivery numeric;
  v_threshold numeric;
  v_small numeric;
  v_cash numeric;
  v_commission numeric;
  v_standard numeric;
  v_negotiated numeric;
  v_own_riders boolean := false;
  v_reduced boolean;
  v_service numeric;
  v_service_fee bigint;
  v_flat_above numeric;
  v_missing text[] := '{}';
  v_key text;
begin
  v_key := 'fees.delivery.band_' || greatest(1, least(4, coalesce(p_band, 1)));
  v_delivery := settings.fn_num(v_key, p_city_id);
  v_threshold := settings.fn_num('fees.small_basket_threshold', p_city_id);
  v_small := settings.fn_num('fees.small_basket_fee', p_city_id);
  v_cash := coalesce(settings.fn_num('fees.cash_handling', p_city_id), 0);
  v_standard := coalesce(settings.fn_num('fees.commission_standard', p_city_id), 14);
  v_flat_above := settings.fn_num('fees.service_flat_above', p_city_id);

  if p_merchant_id is not null then
    select m.commission_pct, coalesce(m.has_own_riders, false)
      into v_negotiated, v_own_riders
      from public.merchant m where m.id = p_merchant_id;
  end if;

  v_commission := coalesce(
    v_negotiated,
    case when v_own_riders
         then settings.fn_num('fees.commission', p_city_id, p_category)
         else coalesce(settings.fn_num('fees.commission_nexg_delivery', p_city_id, p_category),
                       settings.fn_num('fees.commission', p_city_id, p_category)) end);
  v_reduced := v_commission < v_standard;

  if v_delivery is null then v_missing := v_missing || v_key; end if;
  if v_commission is null then v_missing := v_missing || 'fees.commission'::text; end if;

  if array_length(v_missing, 1) > 0 then
    return jsonb_build_object(
      'ok', false,
      'missing', to_jsonb(v_missing),
      'message', 'This city has no published price for '
        || array_to_string(v_missing, ', ')
        || '. An order cannot be priced against a fee nobody agreed.');
  end if;

  if v_flat_above is not null and p_subtotal_cents > v_flat_above * 100 then
    v_service_fee := round(coalesce(settings.fn_num('fees.service_flat', p_city_id), 150) * 100);
  elsif v_reduced then
    v_service_fee := least(
      round(p_subtotal_cents * coalesce(settings.fn_num('fees.service_pct_reduced', p_city_id), 4) / 100.0),
      round(coalesce(settings.fn_num('fees.service_cap_reduced', p_city_id), 200) * 100));
  else
    v_service := coalesce(settings.fn_num('fees.service_pct', p_city_id), 2.5);
    v_service_fee := least(
      round(p_subtotal_cents * v_service / 100.0),
      round(coalesce(settings.fn_num('fees.service_cap', p_city_id), 150) * 100));
  end if;

  return jsonb_build_object(
    'ok', true,
    'subtotal_cents', p_subtotal_cents,
    'delivery_fee_cents', round(v_delivery * 100),
    'service_fee_cents', v_service_fee,
    'small_basket_fee_cents',
      case when v_threshold is not null and v_small is not null
                and p_subtotal_cents < v_threshold * 100
           then round(v_small * 100) else 0 end,
    'cash_handling_cents', round(v_cash * 100),
    'commission_pct', v_commission,
    'commission_cents', round(p_subtotal_cents * v_commission / 100.0),
    'pricing_version_ids', jsonb_build_object(
      'delivery', settings.fn_get(v_key, 'city', p_city_id, null, null, p_at) ->> 'version_id',
      'service', settings.fn_get('fees.service_pct', 'city', p_city_id, null, null, p_at) ->> 'version_id',
      'commission', settings.fn_get('fees.commission', 'city_category', p_city_id, null, p_category, p_at) ->> 'version_id'));
end;
$$;

revoke execute on function public.fn_price_order(uuid, text, bigint, smallint, timestamptz, uuid)
  from public, anon;
grant execute on function public.fn_price_order(uuid, text, bigint, smallint, timestamptz, uuid)
  to authenticated, service_role;

-- The two callers now say which merchant is being priced.
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.fn_web_order_quote(jsonb)'::regprocedure);
  v_new := replace(v_def,
    'fn_price_order(m.city_id, m.category::text, v_subtotal, v_band)',
    'fn_price_order(m.city_id, m.category::text, v_subtotal, v_band, now(), m.id)');
  if v_new = v_def then raise exception 'web quote call site not found'; end if;
  execute v_new;

  v_def := pg_get_functiondef('public.rpc_order_manual_create(jsonb)'::regprocedure);
  v_new := replace(v_def,
    'v_subtotal, coalesce(v_band, 1::smallint));',
    'v_subtotal, coalesce(v_band, 1::smallint), now(), v_merchant);');
  if v_new = v_def then raise exception 'manual create call site not found'; end if;
  execute v_new;
end $$;
