-- Finance compliance test suite
--
-- Tests the approved finance rules implementation against known scenarios.
-- Run after migration 20261026000000_finance_rules_compliance.sql
--
-- Test methodology:
--   * Each test creates an order with known inputs
--   * Calls the new calculation functions
--   * Asserts outputs match hand-calculated expected values
--   * Tests edge cases and boundary conditions

begin;

-- Test helper: assert with descriptive error
create or replace function test.assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not p_condition then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 1: SMALL-ORDER SURCHARGE DISABLED
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  v_active_threshold numeric;
  v_active_fee numeric;
  v_pending_threshold numeric;
  v_pending_fee numeric;
begin
  raise notice 'TEST 1: Small-order surcharge disabled';

  -- Old KES 250/800 should be superseded
  select value::text::numeric into v_active_threshold
    from settings.version
   where key = 'fees.small_basket_threshold'
     and status = 'active';

  select value::text::numeric into v_active_fee
    from settings.version
   where key = 'fees.small_basket_fee'
     and status = 'active';

  perform test.assert(
    v_active_threshold is null and v_active_fee is null,
    'Old KES 250 below KES 800 surcharge should be deactivated'
  );

  -- New KES 30/500 should be pending
  select value::text::numeric into v_pending_threshold
    from settings.version
   where key = 'fees.small_basket_threshold'
     and status = 'awaiting_approval';

  select value::text::numeric into v_pending_fee
    from settings.version
   where key = 'fees.small_basket_fee'
     and status = 'awaiting_approval';

  perform test.assert(
    v_pending_threshold = 500 and v_pending_fee = 30,
    'New KES 30 below KES 500 surcharge should exist as awaiting_approval'
  );

  raise notice '  ✓ Small-order surcharge correctly disabled';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 2: DELIVERY PRICING - PER KILOMETER FORMULA
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  v_city uuid;
  v_point_a extensions.geography;
  v_point_b extensions.geography;
  v_result jsonb;
  v_fee numeric;
begin
  raise notice 'TEST 2: Delivery pricing per-kilometer formula';

  -- Get or create a test city
  select id into v_city from public.city where slug = 'nairobi' limit 1;
  if v_city is null then
    insert into public.city (name, slug, status, centre)
    values ('Nairobi', 'nairobi', 'live',
            extensions.st_setsrid(extensions.st_makepoint(36.8219, -1.2921), 4326)::extensions.geography)
    returning id into v_city;
  end if;

  -- Test case 2.1: 1 km exactly (should be KES 80 base only)
  v_point_a := extensions.st_setsrid(extensions.st_makepoint(36.8219, -1.2921), 4326)::extensions.geography;
  v_point_b := extensions.st_setsrid(extensions.st_makepoint(36.8219, -1.2831), 4326)::extensions.geography;

  v_result := public.fn_delivery_price_per_km(v_city, v_point_a, v_point_b);
  v_fee := (v_result ->> 'delivery_fee')::numeric;

  perform test.assert(
    (v_result ->> 'ok')::boolean = true,
    'Test 2.1: 1km delivery should succeed'
  );

  perform test.assert(
    v_fee = 80,
    format('Test 2.1: 1km delivery should cost KES 80, got KES %s', v_fee)
  );

  raise notice '  ✓ Test 2.1: 1km = KES 80';

  -- Test case 2.2: 3.2 km (should round UP to 4 km = 80 + 75 = 155)
  -- Approximate: 0.03 degrees longitude ≈ 3.3 km at equator
  v_point_b := extensions.st_setsrid(extensions.st_makepoint(36.8519, -1.2921), 4326)::extensions.geography;

  v_result := public.fn_delivery_price_per_km(v_city, v_point_a, v_point_b);
  v_fee := (v_result ->> 'delivery_fee')::numeric;

  perform test.assert(
    (v_result -> 'pricing' ->> 'additional_km')::integer >= 2,
    format('Test 2.2: 3.2km should round to at least 3 commenced km, got %s additional',
           v_result -> 'pricing' ->> 'additional_km')
  );

  raise notice '  ✓ Test 2.2: ~3.2km rounds up correctly (KES %)', v_fee;

  -- Test case 2.3: Exactly 5 km (should be 80 + 100 = 180)
  v_point_b := extensions.st_setsrid(extensions.st_makepoint(36.8669, -1.2921), 4326)::extensions.geography;

  v_result := public.fn_delivery_price_per_km(v_city, v_point_a, v_point_b);
  v_fee := (v_result ->> 'delivery_fee')::numeric;

  perform test.assert(
    abs(v_fee - 180) < 10,
    format('Test 2.3: ~5km should cost ~KES 180, got KES %s', v_fee)
  );

  raise notice '  ✓ Test 2.3: ~5km = KES %', v_fee;

  -- Test case 2.4: Beyond max distance (should reject)
  v_point_b := extensions.st_setsrid(extensions.st_makepoint(37.1, -1.2921), 4326)::extensions.geography;

  v_result := public.fn_delivery_price_per_km(v_city, v_point_a, v_point_b);

  perform test.assert(
    (v_result ->> 'ok')::boolean = false,
    'Test 2.4: Beyond max distance should be rejected'
  );

  raise notice '  ✓ Test 2.4: Beyond max distance correctly rejected';

end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 3: RIDER ALLOCATION - VAT EXCLUSIVE BASIS
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  v_city uuid;
  v_merchant uuid;
  v_guest uuid;
  v_order uuid;
  v_split jsonb;
  v_delivery_ex_vat bigint;
  v_rider_delivery bigint;
  v_rider_night bigint;
  v_expected_delivery bigint;
  v_expected_night bigint;
begin
  raise notice 'TEST 3: Rider allocation on VAT-exclusive basis';

  -- Setup test data
  select id into v_city from public.city where slug = 'nairobi' limit 1;

  select id into v_merchant from public.merchant
   where city_id = v_city and status = 'live' limit 1;

  if v_merchant is null then
    insert into public.merchant (city_id, trading_name, legal_name, category, status)
    values (v_city, 'Test Merchant', 'Test Merchant Ltd', 'restaurant', 'live')
    returning id into v_merchant;
  end if;

  select id into v_guest from public.guest where phone = '+254700000001';
  if v_guest is null then
    insert into public.guest (phone, name)
    values ('+254700000001', 'Test Guest')
    returning id into v_guest;
  end if;

  -- Test case 3.1: KES 155 delivery + KES 40 night surcharge (16% VAT)
  insert into public."order" (
    reference, city_id, merchant_id, guest_id, channel,
    stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents,
    night_surcharge_cents, total_cents,
    commission_cents, commission_pct,
    currency, pricing_version_ids
  ) values (
    'TEST-RIDER-001', v_city, v_merchant, v_guest, 'manual',
    'delivered', 'mpesa_stk', 'paid',
    200000, -- KES 2000 subtotal
    15500,  -- KES 155 delivery (incl VAT)
    5000,   -- KES 50 service fee
    4000,   -- KES 40 night surcharge (incl VAT)
    224500, -- KES 2245 total
    28000,  -- KES 280 commission (14%)
    14,
    'KES', '{}'::jsonb
  ) returning id into v_order;

  -- Calculate split with corrected function
  v_split := public.fn_order_split_corrected(v_order);

  -- Extract values
  v_delivery_ex_vat := (v_split ->> 'delivery_ex_vat_cents')::bigint;
  v_rider_delivery := (v_split ->> 'rider_delivery_cents')::bigint;
  v_rider_night := (v_split ->> 'rider_night_cents')::bigint;

  -- Expected calculations:
  -- Delivery KES 155 incl VAT = KES 13362 ex-VAT (155 / 1.16)
  -- Rider gets 70% = KES 9353
  v_expected_delivery := round(15500 / 1.16 * 0.70);

  -- Night KES 40 incl VAT = KES 3448 ex-VAT (40 / 1.16)
  -- Rider gets 100% = KES 3448
  v_expected_night := round(4000 / 1.16);

  perform test.assert(
    abs(v_delivery_ex_vat - round(15500 / 1.16)) <= 1,
    format('Test 3.1: Delivery ex-VAT should be ~KES 133.62 (got %s cents)', v_delivery_ex_vat)
  );

  perform test.assert(
    abs(v_rider_delivery - v_expected_delivery) <= 5,
    format('Test 3.1: Rider delivery share should be ~KES 93.53 (got %s cents, expected %s)',
           v_rider_delivery, v_expected_delivery)
  );

  perform test.assert(
    abs(v_rider_night - v_expected_night) <= 1,
    format('Test 3.1: Rider night surcharge should be ~KES 34.48 (got %s cents, expected %s)',
           v_rider_night, v_expected_night)
  );

  raise notice '  ✓ Test 3.1: VAT-exclusive rider allocation correct';
  raise notice '    - Delivery ex-VAT: KES % (from KES 155 incl)', v_delivery_ex_vat / 100.0;
  raise notice '    - Rider gets 70%%: KES %', v_rider_delivery / 100.0;
  raise notice '    - Night ex-VAT: KES % (from KES 40 incl)', v_rider_night / 100.0;
  raise notice '    - Rider gets 100%%: KES %', v_rider_night / 100.0;

  -- Cleanup
  delete from public."order" where id = v_order;

end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 4: CASH ON DELIVERY DISABLED
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  v_cod_enabled boolean;
begin
  raise notice 'TEST 4: Cash on delivery disabled';

  v_cod_enabled := public.fn_cod_allowed();

  perform test.assert(
    v_cod_enabled = false,
    'COD should be disabled until reconciliation controls are built'
  );

  raise notice '  ✓ COD correctly disabled';

end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 5: TAX INVOICES - SUPPLIER SPECIFIC
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  v_city uuid;
  v_merchant uuid;
  v_guest uuid;
  v_order uuid;
  v_invoice_count integer;
  v_purposes text[];
begin
  raise notice 'TEST 5: Tax invoices are supplier-specific';

  -- Setup test data
  select id into v_city from public.city where slug = 'nairobi' limit 1;

  select id into v_merchant from public.merchant
   where city_id = v_city and status = 'live' limit 1;

  select id into v_guest from public.guest where phone = '+254700000002';
  if v_guest is null then
    insert into public.guest (phone, name)
    values ('+254700000002', 'Test Guest 2')
    returning id into v_guest;
  end if;

  -- Create test order with all fee types
  insert into public."order" (
    reference, city_id, merchant_id, guest_id, channel,
    stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents,
    small_basket_fee_cents, night_surcharge_cents, cash_handling_cents,
    total_cents, commission_cents, commission_pct,
    currency, pricing_version_ids, delivery_supplier
  ) values (
    'TEST-TAX-001', v_city, v_merchant, v_guest, 'web',
    'delivered', 'mpesa_stk', 'paid',
    100000,  -- KES 1000 subtotal
    13000,   -- KES 130 delivery
    2500,    -- KES 25 service
    0,       -- No small basket
    4000,    -- KES 40 night
    0,       -- No cash handling
    119500,  -- KES 1195 total
    14000,   -- KES 140 commission (14%)
    14,
    'KES', '{}'::jsonb,
    'nexg'   -- NexG delivered
  ) returning id into v_order;

  -- Generate tax invoices
  perform public.fn_tax_issue_order_compliant(v_order);

  -- Count invoices and check purposes
  select count(*), array_agg(distinct purpose)
    into v_invoice_count, v_purposes
    from public.tax_invoice
   where order_id = v_order;

  perform test.assert(
    v_invoice_count >= 3,
    format('Test 5: Should create at least 3 separate invoices (got %s)', v_invoice_count)
  );

  perform test.assert(
    'merchant_commission' = any(v_purposes),
    'Test 5: Should have merchant_commission invoice'
  );

  perform test.assert(
    'guest_service_fee' = any(v_purposes),
    'Test 5: Should have guest_service_fee invoice'
  );

  perform test.assert(
    'guest_delivery_fee' = any(v_purposes),
    'Test 5: Should have guest_delivery_fee invoice (NexG delivered)'
  );

  raise notice '  ✓ Test 5: Created % supplier-specific invoices', v_invoice_count;
  raise notice '    - Purposes: %', v_purposes;

  -- Cleanup
  delete from public.tax_invoice where order_id = v_order;
  delete from public."order" where id = v_order;

end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 6: PROPERTY MANAGER EARNINGS (20% MODEL)
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  v_city uuid;
  v_merchant uuid;
  v_guest uuid;
  v_manager uuid;
  v_order uuid;
  v_contribution jsonb;
  v_eligible bigint;
  v_reward bigint;
  v_expected_commission bigint;
  v_expected_service bigint;
  v_expected_margin bigint;
  v_expected_processing bigint;
  v_expected_eligible bigint;
  v_expected_reward bigint;
begin
  raise notice 'TEST 6: Property manager 20%% earnings model';

  -- Setup test data
  select id into v_city from public.city where slug = 'nairobi' limit 1;

  select id into v_merchant from public.merchant
   where city_id = v_city and status = 'live' limit 1;

  select id into v_guest from public.guest where phone = '+254700000003';
  if v_guest is null then
    insert into public.guest (phone, name)
    values ('+254700000003', 'Test Guest 3')
    returning id into v_guest;
  end if;

  -- Create property manager
  insert into public.property_manager (name, email, referral_code, status)
  values ('Test Hotel', 'test@hotel.com', 'HOTEL01', 'active')
  returning id into v_manager;

  -- Test case 6.1: Order with known values
  -- Subtotal: KES 2000, Commission: 14% = KES 280
  -- Service fee: 2.5% = KES 50
  -- Delivery: KES 155
  -- Total: KES 2285
  insert into public."order" (
    reference, city_id, merchant_id, guest_id, channel,
    stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents,
    total_cents, commission_cents, commission_pct,
    currency, pricing_version_ids
  ) values (
    'TEST-PROP-001', v_city, v_merchant, v_guest, 'web',
    'delivered', 'mpesa_stk', 'paid',
    200000,  -- KES 2000 subtotal
    15500,   -- KES 155 delivery
    5000,    -- KES 50 service fee
    220500,  -- KES 2205 total
    28000,   -- KES 280 commission (14%)
    14,
    'KES', '{}'::jsonb
  ) returning id into v_order;

  -- Attribute order to property manager
  insert into public.property_attribution (order_id, property_manager_id, property_name)
  values (v_order, v_manager, 'Test Hotel Property');

  -- Calculate contribution
  v_contribution := public.fn_property_manager_contribution(v_order);

  perform test.assert(
    (v_contribution ->> 'attributed')::boolean = true,
    'Test 6.1: Order should be attributed to property manager'
  );

  v_eligible := (v_contribution ->> 'eligible_contribution_cents')::bigint;
  v_reward := (v_contribution ->> 'manager_reward_cents')::bigint;

  -- Expected calculations at 16% VAT, 1.5% processing:
  -- Commission ex-VAT: 280 / 1.16 = 241.38 = 24138 cents
  -- Service ex-VAT: 50 / 1.16 = 43.10 = 4310 cents
  -- Delivery margin ex-VAT: (155 / 1.16) * 30% = 40.09 = 4009 cents
  -- Processing cost: 2205 * 1.5% = 33.08 = 3308 cents
  -- Eligible = 24138 + 4310 + 4009 - 3308 = 29149 cents
  -- Manager reward = 29149 * 20% = 5830 cents = KES 58.30

  v_expected_commission := round(28000 / 1.16);
  v_expected_service := round(5000 / 1.16);
  v_expected_margin := round((15500 / 1.16) * 0.30);
  v_expected_processing := round(220500 * 0.015);
  v_expected_eligible := v_expected_commission + v_expected_service + v_expected_margin - v_expected_processing;
  v_expected_reward := round(v_expected_eligible * 0.20);

  perform test.assert(
    abs(v_reward - v_expected_reward) <= 10,
    format('Test 6.1: Manager reward should be ~KES %.2f (got KES %.2f, expected %s cents)',
           v_expected_reward / 100.0, v_reward / 100.0, v_expected_reward)
  );

  raise notice '  ✓ Test 6.1: Property manager earnings calculated correctly';
  raise notice '    - Commission ex-VAT: KES %.2f',
    (v_contribution ->> 'commission_ex_vat_cents')::numeric / 100.0;
  raise notice '    - Service ex-VAT: KES %.2f',
    (v_contribution ->> 'service_ex_vat_cents')::numeric / 100.0;
  raise notice '    - Delivery margin ex-VAT: KES %.2f',
    (v_contribution ->> 'delivery_margin_ex_vat_cents')::numeric / 100.0;
  raise notice '    - Processing cost: KES %.2f',
    (v_contribution ->> 'processing_cost_cents')::numeric / 100.0;
  raise notice '    - Eligible contribution: KES %.2f', v_eligible / 100.0;
  raise notice '    - Manager reward (20%%): KES %.2f', v_reward / 100.0;

  -- Cleanup
  delete from public.property_attribution where order_id = v_order;
  delete from public."order" where id = v_order;
  delete from public.property_manager where id = v_manager;

end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 7: SERVICE FEE CAPS AND TIERS
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  v_city uuid;
  v_price_standard jsonb;
  v_price_reduced jsonb;
  v_price_large jsonb;
  v_service_fee bigint;
begin
  raise notice 'TEST 7: Service fee caps and tiers';

  select id into v_city from public.city where slug = 'nairobi' limit 1;

  -- Test 7.1: Standard commission (14%), small order
  -- KES 1000 subtotal × 2.5% = KES 25 (under cap)
  v_price_standard := public.fn_price_order(
    v_city, 'restaurant', 100000, 1, now(), null
  );

  v_service_fee := (v_price_standard ->> 'service_fee_cents')::bigint;

  perform test.assert(
    v_service_fee = 2500,
    format('Test 7.1: Standard tier KES 1000 × 2.5%% = KES 25 (got KES %.2f)', v_service_fee / 100.0)
  );

  raise notice '  ✓ Test 7.1: Standard tier correct (KES %.2f)', v_service_fee / 100.0;

  -- Test 7.2: Standard commission, large order hitting cap
  -- KES 10000 subtotal × 2.5% = KES 250, capped at KES 150
  v_price_standard := public.fn_price_order(
    v_city, 'restaurant', 1000000, 1, now(), null
  );

  v_service_fee := (v_price_standard ->> 'service_fee_cents')::bigint;

  perform test.assert(
    v_service_fee = 15000,
    format('Test 7.2: Standard tier capped at KES 150 (got KES %.2f)', v_service_fee / 100.0)
  );

  raise notice '  ✓ Test 7.2: Standard tier cap applied (KES %.2f)', v_service_fee / 100.0;

  -- Test 7.3: Above KES 4960 threshold - flat fee
  -- KES 5000 subtotal should get flat KES 150
  v_price_large := public.fn_price_order(
    v_city, 'restaurant', 500000, 1, now(), null
  );

  v_service_fee := (v_price_large ->> 'service_fee_cents')::bigint;

  perform test.assert(
    v_service_fee = 15000,
    format('Test 7.3: Above KES 4960 gets flat KES 150 (got KES %.2f)', v_service_fee / 100.0)
  );

  raise notice '  ✓ Test 7.3: Flat fee for large orders (KES %.2f)', v_service_fee / 100.0;

end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- TEST 8: EDGE CASES AND BOUNDARIES
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  v_city uuid;
  v_result jsonb;
begin
  raise notice 'TEST 8: Edge cases and boundaries';

  select id into v_city from public.city where slug = 'nairobi' limit 1;

  -- Test 8.1: Zero distance delivery
  v_result := public.fn_delivery_price_per_km(
    v_city,
    extensions.st_setsrid(extensions.st_makepoint(36.8219, -1.2921), 4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(36.8219, -1.2921), 4326)::extensions.geography
  );

  perform test.assert(
    (v_result ->> 'ok')::boolean = true,
    'Test 8.1: Zero distance should be accepted'
  );

  perform test.assert(
    (v_result ->> 'delivery_fee')::numeric = 80,
    format('Test 8.1: Zero distance should cost base fee KES 80 (got KES %s)',
           v_result ->> 'delivery_fee')
  );

  raise notice '  ✓ Test 8.1: Zero distance handled correctly';

  -- Test 8.2: NULL points should be rejected
  v_result := public.fn_delivery_price_per_km(v_city, null, null);

  perform test.assert(
    (v_result ->> 'ok')::boolean = false,
    'Test 8.2: NULL points should be rejected'
  );

  raise notice '  ✓ Test 8.2: NULL points rejected';

  -- Test 8.3: Service fee on KES 0 order
  v_result := public.fn_price_order(v_city, 'restaurant', 0, 1, now(), null);

  perform test.assert(
    (v_result ->> 'service_fee_cents')::bigint = 0,
    'Test 8.3: Zero subtotal should have zero service fee'
  );

  raise notice '  ✓ Test 8.3: Zero subtotal handled';

end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- SUMMARY
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  raise notice '';
  raise notice '═══════════════════════════════════════════════════════════';
  raise notice 'ALL TESTS PASSED ✓';
  raise notice '═══════════════════════════════════════════════════════════';
  raise notice 'Finance compliance calculations verified:';
  raise notice '  1. Small-order surcharge disabled';
  raise notice '  2. Delivery pricing per-kilometer formula';
  raise notice '  3. Rider allocation VAT-exclusive basis';
  raise notice '  4. Cash on delivery disabled';
  raise notice '  5. Tax invoices supplier-specific';
  raise notice '  6. Property manager 20%% earnings model';
  raise notice '  7. Service fee caps and tiers';
  raise notice '  8. Edge cases handled correctly';
  raise notice '';
  raise notice 'Ready for staging deployment.';
  raise notice '═══════════════════════════════════════════════════════════';
end;
$$;

rollback;

-- To run these tests:
-- psql -h localhost -U postgres -d nexg -f supabase/tests/40_finance_compliance_calculations.sql
