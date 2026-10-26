-- Finance rules compliance update
--
-- Implements the approved finance rules shared 2026-10-26, addressing:
-- 1. Small-order surcharge (disable unapproved KES 250, prepare KES 30 below KES 500)
-- 2. Delivery pricing formula (per-kilometer vs bands)
-- 3. Rider allocation (70% VAT-exclusive delivery + 100% VAT-exclusive surcharges)
-- 4. Cash on delivery (disable until reconciliation controls exist)
-- 5. Tax invoicing (supplier-specific invoices)
-- 6. Property manager earnings (20% of eligible contribution)
-- 7. Weather surcharge allocation

-- ════════════════════════════════════════════════════════════════════════
-- 1. DISABLE UNAPPROVED SMALL-ORDER SURCHARGE
-- ════════════════════════════════════════════════════════════════════════

-- Deactivate the KES 250 below KES 800 rule (not approved)
update settings.version
   set status = 'superseded',
       superseded_at = now()
 where key = 'fees.small_basket_fee'
   and status = 'active'
   and value = '250'::jsonb;

update settings.version
   set status = 'superseded',
       superseded_at = now()
 where key = 'fees.small_basket_threshold'
   and status = 'active'
   and value = '800'::jsonb;

-- Add the proposed KES 30 below KES 500, but inactive pending approval
insert into settings.version
  (key, scope_kind, value, status, effective_from, reason)
values
  ('fees.small_basket_threshold', 'global', '500'::jsonb, 'pending_approval',
   null, 'Proposed: KES 30 surcharge below KES 500. Awaiting approval.'),
  ('fees.small_basket_fee', 'global', '30'::jsonb, 'pending_approval',
   null, 'Proposed: KES 30 surcharge below KES 500. Awaiting approval.')
on conflict (id) do nothing;

comment on column settings.version.status is
  'active = in use; pending_approval = proposed but not approved; superseded = replaced; cancelled = rejected';

-- ════════════════════════════════════════════════════════════════════════
-- 2. DELIVERY PRICING: PER-KILOMETER FORMULA
-- ════════════════════════════════════════════════════════════════════════

-- Current: band-based (≤3km, 3-6km, 6-8km, >8km)
-- Approved: KES 80 base + KES 25 per commenced kilometer
-- 3.2 km rounds UP to 4 km = KES 80 + (3 × 25) = KES 155

create or replace function public.fn_delivery_price_per_km(
  p_city_id uuid,
  p_from extensions.geography,
  p_to extensions.geography
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_km numeric;
  v_max integer;
  v_base numeric;
  v_per_km numeric;
  v_commenced_km integer;
  v_fee numeric;
begin
  if p_from is null or p_to is null then
    return jsonb_build_object('ok', false,
      'message', 'Both ends of the trip need a pin before it can be priced.');
  end if;

  -- Straight-line distance, rounded to 1 decimal place
  v_km := round((extensions.st_distance(p_from, p_to) / 1000)::numeric, 1);
  v_max := coalesce(settings.fn_int('fees.delivery.max_km', p_city_id), 15);

  if v_km > v_max then
    return jsonb_build_object('ok', false, 'km', v_km, 'max_km', v_max,
      'message', 'That is ' || v_km || ' km from the store. We deliver up to '
        || v_max || ' km, so a nearer branch or merchant is the way to get this one.');
  end if;

  -- Pricing: KES 80 base + KES 25 per commenced kilometer
  v_base := coalesce(settings.fn_num('fees.delivery.base', p_city_id), 80);
  v_per_km := coalesce(settings.fn_num('fees.delivery.per_km', p_city_id), 25);

  -- Round distance UP to next whole kilometer (3.2 becomes 4)
  v_commenced_km := ceil(v_km)::integer;

  -- First km is included in base, additional kms charged separately
  -- 0-1 km: base only (KES 80)
  -- 3.2 km -> 4 commenced -> base + 3 additional = 80 + 75 = 155
  if v_commenced_km <= 1 then
    v_fee := v_base;
  else
    v_fee := v_base + ((v_commenced_km - 1) * v_per_km);
  end if;

  return jsonb_build_object(
    'ok', true,
    'km', v_km,
    'commenced_km', v_commenced_km,
    'max_km', v_max,
    'delivery_fee', v_fee,
    'delivery_fee_cents', round(v_fee * 100)::bigint,
    'pricing', jsonb_build_object(
      'base', v_base,
      'per_km', v_per_km,
      'additional_km', greatest(0, v_commenced_km - 1)
    )
  );
end;
$$;

comment on function public.fn_delivery_price_per_km is
  'Delivery pricing per approved rules: KES 80 base + KES 25 per commenced kilometer. Distance rounds UP (3.2km becomes 4km).';

revoke execute on function public.fn_delivery_price_per_km(uuid, extensions.geography, extensions.geography)
  from public, anon;
grant execute on function public.fn_delivery_price_per_km(uuid, extensions.geography, extensions.geography)
  to authenticated, service_role;

-- Add new settings for per-km pricing
insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort)
values
  ('fees.delivery.base', 'fees', 'city', 'money', 'KES',
   'Delivery base fee',
   'Base delivery fee covering the first kilometer (0-1 km).',
   true, false, 'finance+ops_manager', '{orders,web}', '80'::jsonb, 110),
  ('fees.delivery.per_km', 'fees', 'city', 'money', 'KES',
   'Delivery per kilometer',
   'Fee per commenced kilometer beyond the first. Distance rounds up: 3.2 km becomes 4 km.',
   true, false, 'finance+ops_manager', '{orders,web}', '25'::jsonb, 111)
on conflict (key) do nothing;

-- Activate per-km pricing
insert into settings.version (key, scope_kind, value, status, effective_from, reason, activated_at)
values
  ('fees.delivery.base', 'global', '80'::jsonb, 'active', now(),
   'Approved rate card: KES 80 base + KES 25 per commenced km.', now()),
  ('fees.delivery.per_km', 'global', '25'::jsonb, 'active', now(),
   'Approved rate card: KES 80 base + KES 25 per commenced km.', now())
on conflict (key, scope_kind, scope_id, scope_category, status, effective_from)
do nothing;

-- ════════════════════════════════════════════════════════════════════════
-- 3. RIDER ALLOCATION: VAT-EXCLUSIVE BASIS + SURCHARGES
-- ════════════════════════════════════════════════════════════════════════

-- Current: (delivery_fee + night_surcharge) * 70% on gross
-- Approved: 70% of VAT-exclusive delivery + 100% of VAT-exclusive surcharges

create or replace function public.fn_order_split_corrected(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public."order";
  v_vat_pct numeric;
  v_comm_pct numeric;
  v_rider_delivery_pct numeric;
  v_tip_pct numeric;
  v_proc_pct numeric;
  v_placeholder boolean;
  v_commission bigint;
  v_merchant_net bigint;

  -- VAT-exclusive amounts
  v_delivery_ex_vat bigint;
  v_night_ex_vat bigint;
  v_weather_ex_vat bigint;

  -- Rider allocation
  v_rider_delivery bigint;
  v_rider_night bigint;
  v_rider_weather bigint;
  v_rider_tip bigint;
  v_rider_total bigint;

  v_processor bigint;
  v_platform_gross bigint;
begin
  select * into o from public."order" where id = p_order_id;
  if not found then
    return null;
  end if;

  -- Get VAT rate
  v_vat_pct := coalesce(settings.fn_num('tax.vat_pct', o.city_id), 16);

  select coalesce(max(value) filter (where key = 'merchant_commission_pct'), 15),
         coalesce(max(value) filter (where key = 'rider_delivery_share_pct'), 70),
         coalesce(max(value) filter (where key = 'rider_tip_share_pct'), 100),
         coalesce(max(value) filter (where key = 'processor_fee_pct'), 1.5),
         coalesce(bool_or(placeholder), true)
    into v_comm_pct, v_rider_delivery_pct, v_tip_pct, v_proc_pct, v_placeholder
    from public.payout_plan;

  -- Commission
  v_comm_pct := coalesce(o.commission_pct, v_comm_pct);
  v_commission := coalesce(o.commission_cents, round(o.subtotal_cents * v_comm_pct / 100)::bigint);
  v_merchant_net := o.subtotal_cents - v_commission;

  -- Calculate VAT-exclusive amounts using ledger's VAT function
  v_delivery_ex_vat := o.delivery_fee_cents - ledger.fn_vat_part(o.delivery_fee_cents, v_vat_pct);
  v_night_ex_vat := o.night_surcharge_cents - ledger.fn_vat_part(o.night_surcharge_cents, v_vat_pct);
  v_weather_ex_vat := coalesce(o.weather_fee_cents, 0) - ledger.fn_vat_part(coalesce(o.weather_fee_cents, 0), v_vat_pct);

  -- Rider allocation per approved rules:
  -- 70% of VAT-exclusive delivery fee
  v_rider_delivery := round(v_delivery_ex_vat * v_rider_delivery_pct / 100)::bigint;

  -- 100% of VAT-exclusive night surcharge
  v_rider_night := v_night_ex_vat;

  -- 100% of VAT-exclusive weather surcharge
  v_rider_weather := v_weather_ex_vat;

  -- 100% of tips
  v_rider_tip := round(o.tip_cents * v_tip_pct / 100)::bigint;

  v_rider_total := v_rider_delivery + v_rider_night + v_rider_weather + v_rider_tip;

  -- Payment processor fee
  v_processor := case
    when o.payment_method::text in ('card', 'mpesa_stk')
    then round(o.total_cents * v_proc_pct / 100)::bigint
    else 0
  end;

  v_platform_gross := o.total_cents - v_merchant_net - v_rider_total;

  return jsonb_build_object(
    'guest_paid_cents', o.total_cents,
    'merchant_gross_cents', o.subtotal_cents,
    'commission_pct', v_comm_pct,
    'commission_cents', v_commission,
    'merchant_net_cents', v_merchant_net,
    'vat_pct', v_vat_pct,
    'delivery_ex_vat_cents', v_delivery_ex_vat,
    'night_surcharge_ex_vat_cents', v_night_ex_vat,
    'weather_ex_vat_cents', v_weather_ex_vat,
    'rider_delivery_pct', v_rider_delivery_pct,
    'rider_delivery_cents', v_rider_delivery,
    'rider_night_cents', v_rider_night,
    'rider_weather_cents', v_rider_weather,
    'rider_tip_cents', v_rider_tip,
    'rider_total_cents', v_rider_total,
    'platform_gross_cents', v_platform_gross,
    'processor_fee_pct', v_proc_pct,
    'processor_fee_cents', v_processor,
    'platform_net_cents', v_platform_gross - v_processor,
    'collected_by', case
      when o.payment_method::text = 'cash_on_delivery'
      then case
        when o.collected_by = 'nexg_rider' then 'rider (cash)'
        when o.collected_by = 'merchant' then 'merchant (cash)'
        else 'rider (cash)' -- legacy default
      end
      else 'NexG (online)'
    end,
    'settlement', case
      when o.payment_status::text in ('paid', 'collected') then 'ready to settle'
      when o.payment_method::text = 'cash_on_delivery' then 'cash collection pending'
      else 'awaiting payment'
    end,
    'plan_is_placeholder', v_placeholder,
    'vat_basis_note', 'Rider allocation calculated on VAT-exclusive amounts per approved rules.'
  );
end;
$$;

comment on function public.fn_order_split_corrected is
  'Order money split per approved rules: rider gets 70% of VAT-exclusive delivery + 100% of VAT-exclusive surcharges.';

revoke execute on function public.fn_order_split_corrected(uuid) from public, anon, authenticated;
grant execute on function public.fn_order_split_corrected(uuid) to service_role;

-- ════════════════════════════════════════════════════════════════════════
-- 4. CASH ON DELIVERY: TRACK COLLECTOR + DISABLE UNTIL READY
-- ════════════════════════════════════════════════════════════════════════

-- Add column to track who collected cash
alter table public."order"
  add column if not exists collected_by text
  check (collected_by in ('nexg_rider', 'merchant', 'third_party'));

comment on column public."order".collected_by is
  'Who physically collected cash on delivery: nexg_rider, merchant, or third_party. Required for proper reconciliation.';

-- Add column to track weather fee
alter table public."order"
  add column if not exists weather_fee_cents bigint not null default 0;

comment on column public."order".weather_fee_cents is
  '100% paid to rider (VAT-exclusive basis). Activated only when weather conditions approved.';

-- Update total calculation constraint
alter table public."order"
  drop constraint if exists order_total_adds_up;

alter table public."order"
  add constraint order_total_adds_up check (
    total_cents = subtotal_cents + delivery_fee_cents + service_fee_cents
      + small_basket_fee_cents + night_surcharge_cents + concierge_fee_cents
      + cash_handling_cents + tip_cents + weather_fee_cents
  );

-- Feature flag to control COD availability
create table if not exists public.feature_flag (
  key text primary key,
  enabled boolean not null default false,
  reason text,
  enabled_at timestamptz,
  disabled_at timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.feature_flag (key, enabled, reason, disabled_at)
values
  ('cash_on_delivery', false,
   'Disabled until collection, remittance and reconciliation controls are implemented per approved finance rules.',
   now())
on conflict (key) do nothing;

comment on table public.feature_flag is
  'Feature flags for capabilities requiring operational readiness, not just code deployment.';

-- Function to check if COD is allowed
create or replace function public.fn_cod_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select enabled from public.feature_flag where key = 'cash_on_delivery'),
    false
  )
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 5. TAX INVOICING: SUPPLIER-SPECIFIC INVOICES
-- ════════════════════════════════════════════════════════════════════════

-- Add delivery supplier tracking
alter table public."order"
  add column if not exists delivery_supplier text
  check (delivery_supplier in ('nexg', 'merchant', 'third_party'));

comment on column public."order".delivery_supplier is
  'Who supplied the delivery service: nexg (NexG rider), merchant (merchant''s own riders), or third_party. Determines tax invoice issuer.';

-- Update tax invoice function to create supplier-specific invoices
create or replace function public.fn_tax_issue_order_compliant(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public."order";
  v_pct numeric;
  v_issued integer := 0;
  v_id uuid;
  v_m record;
  v_g record;
  v_vat bigint;
  v_delivery_supplier text;
begin
  select * into o from public."order" where id = p_order_id;
  if not found then return 0; end if;

  v_pct := coalesce(settings.fn_num('tax.vat_pct', o.city_id), 16);
  v_delivery_supplier := coalesce(o.delivery_supplier,
    case when o.payment_method = 'cash_on_delivery' then 'nexg' else 'nexg' end);

  -- 1. Merchant commission invoice (NexG invoices merchant)
  if coalesce(o.commission_cents, 0) > 0
     and not exists (select 1 from public.tax_invoice
                      where order_id = o.id and purpose = 'merchant_commission' and kind = 'tax_invoice') then
    select m.trading_name, m.legal_name, m.kra_pin into v_m
      from public.merchant m where m.id = o.merchant_id;
    v_vat := ledger.fn_vat_part(o.commission_cents, v_pct);

    insert into public.tax_invoice (number, purpose, order_id, city_id, party_type, party_id,
      party_name, party_pin, issued_at, net_cents, vat_cents, gross_cents, vat_pct)
    values (public.fn_tax_next_number(), 'merchant_commission', o.id, o.city_id, 'merchant',
      o.merchant_id, coalesce(v_m.legal_name, v_m.trading_name), v_m.kra_pin, now(),
      o.commission_cents - v_vat, v_vat, o.commission_cents, v_pct)
    returning id into v_id;

    insert into public.tax_invoice_line (invoice_id, position, description, net_cents, vat_cents, gross_cents)
    values (v_id, 1, 'Platform commission · order ' || o.reference,
      o.commission_cents - v_vat, v_vat, o.commission_cents);
    v_issued := v_issued + 1;
  end if;

  -- 2. Customer service fee invoice (NexG invoices customer)
  if o.service_fee_cents > 0
     and not exists (select 1 from public.tax_invoice
                      where order_id = o.id and purpose = 'guest_service_fee' and kind = 'tax_invoice') then
    select g.name into v_g from public.guest g where g.id = o.guest_id;
    v_vat := ledger.fn_vat_part(o.service_fee_cents, v_pct);

    insert into public.tax_invoice (number, purpose, order_id, city_id, party_type, party_id,
      party_name, issued_at, net_cents, vat_cents, gross_cents, vat_pct)
    values (public.fn_tax_next_number(), 'guest_service_fee', o.id, o.city_id, 'guest',
      o.guest_id, v_g.name, now(), o.service_fee_cents - v_vat, v_vat, o.service_fee_cents, v_pct)
    returning id into v_id;

    insert into public.tax_invoice_line (invoice_id, position, description, net_cents, vat_cents, gross_cents)
    values (v_id, 1, 'Service fee · order ' || o.reference,
      o.service_fee_cents - v_vat, v_vat, o.service_fee_cents);
    v_issued := v_issued + 1;
  end if;

  -- 3. Delivery fee invoice (issued by actual delivery supplier)
  -- Only NexG issues when NexG delivered; merchant's own riders = merchant invoices
  if o.delivery_fee_cents > 0 and v_delivery_supplier = 'nexg'
     and not exists (select 1 from public.tax_invoice
                      where order_id = o.id and purpose = 'guest_delivery_fee' and kind = 'tax_invoice') then
    select g.name into v_g from public.guest g where g.id = o.guest_id;
    v_vat := ledger.fn_vat_part(o.delivery_fee_cents, v_pct);

    insert into public.tax_invoice (number, purpose, order_id, city_id, party_type, party_id,
      party_name, issued_at, net_cents, vat_cents, gross_cents, vat_pct)
    values (public.fn_tax_next_number(), 'guest_delivery_fee', o.id, o.city_id, 'guest',
      o.guest_id, v_g.name, now(), o.delivery_fee_cents - v_vat, v_vat, o.delivery_fee_cents, v_pct)
    returning id into v_id;

    insert into public.tax_invoice_line (invoice_id, position, description, net_cents, vat_cents, gross_cents)
    values (v_id, 1, 'Delivery fee · order ' || o.reference,
      o.delivery_fee_cents - v_vat, v_vat, o.delivery_fee_cents);
    v_issued := v_issued + 1;
  end if;

  -- 4. Other NexG charges (small basket, surcharges, cash handling)
  if (o.small_basket_fee_cents + o.night_surcharge_cents + coalesce(o.weather_fee_cents, 0) + o.cash_handling_cents) > 0
     and not exists (select 1 from public.tax_invoice
                      where order_id = o.id and purpose = 'guest_other_fees' and kind = 'tax_invoice') then
    select g.name into v_g from public.guest g where g.id = o.guest_id;

    declare
      v_total_fees bigint := o.small_basket_fee_cents + o.night_surcharge_cents
                           + coalesce(o.weather_fee_cents, 0) + o.cash_handling_cents;
    begin
      v_vat := ledger.fn_vat_part(v_total_fees, v_pct);

      insert into public.tax_invoice (number, purpose, order_id, city_id, party_type, party_id,
        party_name, issued_at, net_cents, vat_cents, gross_cents, vat_pct)
      values (public.fn_tax_next_number(), 'guest_other_fees', o.id, o.city_id, 'guest',
        o.guest_id, v_g.name, now(), v_total_fees - v_vat, v_vat, v_total_fees, v_pct)
      returning id into v_id;

      insert into public.tax_invoice_line (invoice_id, position, description, net_cents, vat_cents, gross_cents)
      select v_id, row_number() over (), f.d, f.g - ledger.fn_vat_part(f.g, v_pct),
             ledger.fn_vat_part(f.g, v_pct), f.g
      from (values
        ('Small basket fee', o.small_basket_fee_cents),
        ('Night surcharge', o.night_surcharge_cents),
        ('Weather surcharge', coalesce(o.weather_fee_cents, 0)),
        ('Cash handling', o.cash_handling_cents)) as f(d, g)
      where f.g > 0;

      v_issued := v_issued + 1;
    end;
  end if;

  return v_issued;
end;
$$;

comment on function public.fn_tax_issue_order_compliant is
  'Tax invoice generation per approved rules: supplier-specific invoices for commission, service fee, delivery (when NexG supplied), and other fees.';

-- Update purpose enum to include new values
alter table public.tax_invoice
  drop constraint if exists tax_invoice_purpose_check;

alter table public.tax_invoice
  add constraint tax_invoice_purpose_check
  check (purpose in ('merchant_commission', 'guest_fees', 'guest_service_fee',
                     'guest_delivery_fee', 'guest_other_fees'));

-- ════════════════════════════════════════════════════════════════════════
-- 6. PROPERTY MANAGER EARNINGS (20% OF ELIGIBLE CONTRIBUTION)
-- ════════════════════════════════════════════════════════════════════════

-- Property manager tracking
create table if not exists public.property_manager (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  email text not null,
  phone text,
  kra_pin text,
  referral_code text unique,
  monthly_fee_kes numeric not null default 1000,
  first_month_free boolean not null default true,
  joined_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'suspended', 'inactive')),
  created_at timestamptz not null default now()
);

-- Property manager attributions (which orders came through their property)
create table if not exists public.property_attribution (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public."order"(id),
  property_manager_id uuid not null references public.property_manager(id),
  property_name text,
  attributed_at timestamptz not null default now(),
  unique(order_id)
);

comment on table public.property_attribution is
  'Tracks which orders are attributable to property manager referrals for earnings calculation.';

-- Property manager earnings calculation
create or replace function public.fn_property_manager_contribution(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public."order";
  v_attr record;
  v_vat_pct numeric;
  v_proc_pct numeric;

  -- VAT-exclusive amounts
  v_commission_ex_vat bigint;
  v_service_ex_vat bigint;
  v_delivery_margin_ex_vat bigint;

  -- Costs to deduct
  v_processing_cost bigint;
  v_fulfillment_cost bigint;
  v_refunds bigint;

  v_eligible_contribution bigint;
  v_manager_reward bigint;
begin
  -- Check if order is attributed to a property manager
  select * into v_attr
    from public.property_attribution pa
    join public.property_manager pm on pm.id = pa.property_manager_id
   where pa.order_id = p_order_id
     and pm.status = 'active';

  if not found then
    return jsonb_build_object('attributed', false);
  end if;

  select * into o from public."order" where id = p_order_id;
  if not found then return null; end if;

  v_vat_pct := coalesce(settings.fn_num('tax.vat_pct', o.city_id), 16);
  v_proc_pct := coalesce(
    (select value from public.payout_plan where key = 'processor_fee_pct'),
    1.5);

  -- Calculate VAT-exclusive NexG revenue
  v_commission_ex_vat := o.commission_cents - ledger.fn_vat_part(o.commission_cents, v_vat_pct);
  v_service_ex_vat := o.service_fee_cents - ledger.fn_vat_part(o.service_fee_cents, v_vat_pct);

  -- Delivery margin: what NexG keeps after paying rider (30% of VAT-exclusive delivery)
  v_delivery_margin_ex_vat := (o.delivery_fee_cents - ledger.fn_vat_part(o.delivery_fee_cents, v_vat_pct)) * 30 / 100;

  -- Deductible costs
  v_processing_cost := case
    when o.payment_method::text in ('card', 'mpesa_stk')
    then round(o.total_cents * v_proc_pct / 100)::bigint
    else 0
  end;

  v_fulfillment_cost := 0; -- TODO: track actual fulfillment costs when available

  v_refunds := coalesce(
    (select sum(amount_cents) from public.refund
     where order_id = o.id and status in ('issued', 'completed')),
    0);

  -- Eligible contribution = revenue - VAT - costs
  v_eligible_contribution := v_commission_ex_vat + v_service_ex_vat + v_delivery_margin_ex_vat
                           - v_processing_cost - v_fulfillment_cost - v_refunds;

  -- Property manager gets 20% of eligible contribution
  v_manager_reward := round(v_eligible_contribution * 0.20)::bigint;

  return jsonb_build_object(
    'attributed', true,
    'property_manager_id', v_attr.property_manager_id,
    'property_manager_name', v_attr.name,
    'property_name', v_attr.property_name,
    'commission_ex_vat_cents', v_commission_ex_vat,
    'service_ex_vat_cents', v_service_ex_vat,
    'delivery_margin_ex_vat_cents', v_delivery_margin_ex_vat,
    'processing_cost_cents', v_processing_cost,
    'fulfillment_cost_cents', v_fulfillment_cost,
    'refunds_cents', v_refunds,
    'eligible_contribution_cents', v_eligible_contribution,
    'manager_reward_pct', 20,
    'manager_reward_cents', v_manager_reward,
    'calculation_note', '20% of (NexG contribution - VAT - processing - fulfillment - refunds)'
  );
end;
$$;

comment on function public.fn_property_manager_contribution is
  'Calculate property manager 20% earnings per approved rules: 20% of eligible NexG contribution after VAT, processing costs, fulfillment costs and refunds.';

revoke execute on function public.fn_property_manager_contribution(uuid) from public, anon, authenticated;
grant execute on function public.fn_property_manager_contribution(uuid) to service_role;

-- Property manager monthly statement
create table if not exists public.property_manager_statement (
  id uuid primary key default gen_random_uuid(),
  property_manager_id uuid not null references public.property_manager(id),
  month date not null, -- first day of month
  orders_count integer not null default 0,
  eligible_contribution_cents bigint not null default 0,
  earnings_cents bigint not null default 0,
  monthly_fee_cents bigint not null default 0,
  net_amount_cents bigint not null, -- can be negative (invoice)
  status text not null default 'draft'
    check (status in ('draft', 'generated', 'sent', 'paid', 'invoiced')),
  generated_at timestamptz,
  sent_at timestamptz,
  paid_at timestamptz,
  unique(property_manager_id, month)
);

comment on table public.property_manager_statement is
  'Monthly property manager reconciliation: earnings vs KES 1,000 fee. Positive = payout, negative = invoice.';

-- ════════════════════════════════════════════════════════════════════════
-- GRANTS AND SECURITY
-- ════════════════════════════════════════════════════════════════════════

alter table public.feature_flag enable row level security;
alter table public.property_manager enable row level security;
alter table public.property_attribution enable row level security;
alter table public.property_manager_statement enable row level security;

-- Only admins and finance can see feature flags
create policy feature_flag_read on public.feature_flag
  for select using (authz.is_super_admin() or authz.reaches_module('finance'));

-- Property manager can see their own data
create policy property_manager_own_data on public.property_manager
  for select using (authz.is_super_admin() or id = (select auth.uid()));

create policy property_attribution_read on public.property_attribution
  for select using (
    authz.is_super_admin()
    or authz.reaches_module('finance')
    or property_manager_id = (select auth.uid())
  );

create policy property_statement_read on public.property_manager_statement
  for select using (
    authz.is_super_admin()
    or authz.reaches_module('finance')
    or property_manager_id = (select auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════════
-- MIGRATION NOTES
-- ════════════════════════════════════════════════════════════════════════

comment on schema public is
  'Finance compliance migration 2026-10-26:
   - Small-order surcharge: Disabled KES 250/800, added pending KES 30/500
   - Delivery pricing: Added per-km formula (KES 80 + KES 25/km, distance rounds up)
   - Rider allocation: VAT-exclusive basis, 70% delivery + 100% surcharges
   - COD: Disabled by feature flag, added collector tracking
   - Tax invoices: Supplier-specific (commission, service, delivery, other fees)
   - Property managers: 20% of eligible contribution, KES 1,000/month fee structure

   REQUIRED FOLLOW-UP:
   1. Update checkout UI to use fn_delivery_price_per_km()
   2. Update order breakdown screens to use fn_order_split_corrected()
   3. Implement COD reconciliation workflow before enabling feature flag
   4. Integrate with KRA eTIMS for tax invoices
   5. Build property manager statement generation
   6. Confirm VAT treatment with Kenyan tax accountant';
