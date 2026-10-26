-- ROLLBACK migration for finance rules compliance
--
-- Reverts migration 20261026000000_finance_rules_compliance.sql
--
-- SAFETY:
--   * Does not delete data, only deactivates new rules
--   * Restores old functions as primary
--   * Keeps new tables for audit trail
--   * Can be re-rolled forward without data loss
--
-- USE WHEN:
--   * Calculations discovered to be incorrect
--   * Integration issues with existing systems
--   * Need to revert to original pricing temporarily
--
-- DOES NOT REVERT:
--   * Completed orders (they stay as-is)
--   * Tax invoices already issued
--   * Property manager attributions already made

begin;

-- ════════════════════════════════════════════════════════════════════════
-- STEP 1: RESTORE OLD SMALL-ORDER SURCHARGE (if needed for operations)
-- ════════════════════════════════════════════════════════════════════════

-- Keep new rule pending, restore old as active (optional)
-- Comment this out if you want surcharge fully disabled

-- update settings.version
--    set status = 'active',
--        superseded_at = null,
--        activated_at = now()
--  where key = 'fees.small_basket_fee'
--    and value = '250'::jsonb
--    and status = 'superseded';

-- update settings.version
--    set status = 'active',
--        superseded_at = null,
--        activated_at = now()
--  where key = 'fees.small_basket_threshold'
--    and value = '800'::jsonb
--    and status = 'superseded';

raise notice 'Step 1: Small-order surcharge kept disabled (restore manually if needed)';

-- ════════════════════════════════════════════════════════════════════════
-- STEP 2: DEACTIVATE PER-KILOMETER DELIVERY PRICING
-- ════════════════════════════════════════════════════════════════════════

update settings.version
   set status = 'superseded',
       superseded_at = now()
 where key in ('fees.delivery.base', 'fees.delivery.per_km')
   and status = 'active';

raise notice 'Step 2: Per-kilometer delivery pricing deactivated';
raise notice '        → System will fall back to band-based pricing';

-- ════════════════════════════════════════════════════════════════════════
-- STEP 3: RESTORE OLD ORDER SPLIT AS PRIMARY
-- ════════════════════════════════════════════════════════════════════════

-- Rename new function to archive version
alter function if exists public.fn_order_split_corrected(uuid)
  rename to fn_order_split_vat_exclusive;

comment on function public.fn_order_split_vat_exclusive(uuid) is
  'VAT-exclusive rider allocation (archived). Replaced by original fn_order_split for rollback compatibility.';

-- Original fn_order_split remains as-is and becomes primary again
-- No changes needed - UI should call fn_order_split by default

raise notice 'Step 3: Rider allocation reverted to original function';
raise notice '        → fn_order_split_corrected renamed to fn_order_split_vat_exclusive';
raise notice '        → Original fn_order_split is now primary';

-- ════════════════════════════════════════════════════════════════════════
-- STEP 4: RE-ENABLE CASH ON DELIVERY (if was enabled before)
-- ════════════════════════════════════════════════════════════════════════

-- CAREFUL: Only do this if COD was enabled before and you have reconciliation
-- Leave commented by default for safety

-- update public.feature_flag
--    set enabled = true,
--        reason = 'Re-enabled during rollback - ensure reconciliation controls active',
--        enabled_at = now(),
--        updated_at = now()
--  where key = 'cash_on_delivery';

raise notice 'Step 4: Cash on delivery kept disabled (enable manually if needed)';
raise notice '        → Check feature_flag table to re-enable';

-- ════════════════════════════════════════════════════════════════════════
-- STEP 5: RESTORE OLD TAX INVOICE FUNCTION AS PRIMARY
-- ════════════════════════════════════════════════════════════════════════

-- Rename new function to archive version
alter function if exists public.fn_tax_issue_order_compliant(uuid)
  rename to fn_tax_issue_order_supplier_specific;

comment on function public.fn_tax_issue_order_supplier_specific(uuid) is
  'Supplier-specific tax invoicing (archived). Replaced by original fn_tax_issue_order for rollback compatibility.';

-- Original fn_tax_issue_order remains and becomes primary again
-- It creates 2 invoices: merchant commission + guest fees grouped

raise notice 'Step 5: Tax invoicing reverted to original function';
raise notice '        → fn_tax_issue_order_compliant renamed to fn_tax_issue_order_supplier_specific';
raise notice '        → Original fn_tax_issue_order is now primary';

-- ════════════════════════════════════════════════════════════════════════
-- STEP 6: ARCHIVE NEW TABLES (keep data for audit)
-- ════════════════════════════════════════════════════════════════════════

-- Rename tables instead of dropping them
-- This preserves data for review and potential re-migration

alter table if exists public.property_manager
  rename to property_manager_archive_20261026;

alter table if exists public.property_attribution
  rename to property_attribution_archive_20261026;

alter table if exists public.property_manager_statement
  rename to property_manager_statement_archive_20261026;

comment on table public.property_manager_archive_20261026 is
  'Archived property manager data from finance compliance migration. Can be restored if needed.';

raise notice 'Step 6: Property manager tables archived';
raise notice '        → Renamed to *_archive_20261026';
raise notice '        → Data preserved for audit and potential restoration';

-- ════════════════════════════════════════════════════════════════════════
-- STEP 7: KEEP FEATURE FLAGS BUT MARK AS INACTIVE
-- ════════════════════════════════════════════════════════════════════════

-- Feature flag table stays (useful for future features)
-- Just mark the COD flag as rolled back

update public.feature_flag
   set reason = reason || ' [Rolled back ' || now()::date || ']',
       updated_at = now()
 where key = 'cash_on_delivery';

raise notice 'Step 7: Feature flags retained';
raise notice '        → Marked with rollback timestamp';

-- ════════════════════════════════════════════════════════════════════════
-- STEP 8: KEEP NEW COLUMNS (with defaults for safety)
-- ════════════════════════════════════════════════════════════════════════

-- New columns added to order table:
--   * collected_by
--   * weather_fee_cents
--   * delivery_supplier
--
-- These stay but are optional, so old code still works
-- Future orders can use them when ready

raise notice 'Step 8: New order columns retained';
raise notice '        → collected_by, weather_fee_cents, delivery_supplier';
raise notice '        → All have defaults, old code unaffected';

-- ════════════════════════════════════════════════════════════════════════
-- STEP 9: RESTORE CHECKOUT TO USE OLD DELIVERY PRICING
-- ════════════════════════════════════════════════════════════════════════

-- Update fn_web_order_quote to use old band-based delivery
do $$
declare
  v_def text;
  v_new text;
begin
  -- Check if function was updated to use new per-km pricing
  v_def := pg_get_functiondef('public.fn_web_order_quote(jsonb)'::regprocedure);

  if v_def like '%fn_delivery_price_per_km%' then
    -- It was updated, so restore to use fn_delivery_band
    v_new := replace(v_def,
      'fn_delivery_price_per_km',
      'fn_delivery_band');

    execute v_new;
    raise notice 'Step 9: Checkout restored to band-based delivery pricing';
  else
    raise notice 'Step 9: Checkout already uses band-based delivery (no change needed)';
  end if;
end $$;

-- Update rpc_order_manual_create similarly
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.rpc_order_manual_create(jsonb)'::regprocedure);

  if v_def like '%fn_delivery_price_per_km%' then
    v_new := replace(v_def,
      'fn_delivery_price_per_km',
      'fn_delivery_band');

    execute v_new;
    raise notice 'Step 9: Manual order creation restored to band-based delivery pricing';
  else
    raise notice 'Step 9: Manual order already uses band-based delivery (no change needed)';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- STEP 10: CREATE ROLLBACK VERIFICATION FUNCTION
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.fn_verify_rollback()
returns table (
  check_name text,
  status text,
  detail text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Check 1: Small-order surcharge status
  return query
  select
    'Small-order surcharge'::text,
    case
      when exists (
        select 1 from settings.version
        where key = 'fees.small_basket_fee'
          and value = '250'::jsonb
          and status = 'active'
      ) then 'RESTORED'
      when exists (
        select 1 from settings.version
        where key = 'fees.small_basket_fee'
          and value = '30'::jsonb
          and status = 'pending_approval'
      ) then 'DISABLED'
      else 'UNKNOWN'
    end,
    'Check if old KES 250 or new KES 30 is active'::text;

  -- Check 2: Delivery pricing
  return query
  select
    'Delivery pricing'::text,
    case
      when exists (
        select 1 from settings.version
        where key = 'fees.delivery.per_km'
          and status = 'active'
      ) then 'PER-KM ACTIVE (not rolled back)'
      else 'BAND-BASED (rolled back)'
    end,
    'Per-km vs band-based delivery pricing'::text;

  -- Check 3: Function names
  return query
  select
    'Function renames'::text,
    case
      when exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'fn_order_split_vat_exclusive'
      ) then 'RENAMED (rolled back)'
      else 'ORIGINAL NAMES (not rolled back)'
    end,
    'Check if new functions were archived'::text;

  -- Check 4: Property manager tables
  return query
  select
    'Property manager tables'::text,
    case
      when exists (
        select 1 from pg_tables
        where schemaname = 'public'
          and tablename = 'property_manager_archive_20261026'
      ) then 'ARCHIVED (rolled back)'
      when exists (
        select 1 from pg_tables
        where schemaname = 'public'
          and tablename = 'property_manager'
      ) then 'ACTIVE (not rolled back)'
      else 'NOT CREATED'
    end,
    'Check if property manager tables archived'::text;

  -- Check 5: COD status
  return query
  select
    'Cash on delivery'::text,
    case
      when exists (
        select 1 from public.feature_flag
        where key = 'cash_on_delivery'
          and enabled = false
      ) then 'DISABLED'
      when exists (
        select 1 from public.feature_flag
        where key = 'cash_on_delivery'
          and enabled = true
      ) then 'ENABLED'
      else 'NOT CONFIGURED'
    end,
    'Cash on delivery feature flag status'::text;

  -- Check 6: New order columns exist
  return query
  select
    'New order columns'::text,
    case
      when exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'order'
          and column_name = 'weather_fee_cents'
      ) then 'PRESENT (retained)'
      else 'NOT ADDED'
    end,
    'Check if new columns added (safe to keep)'::text;

end;
$$;

comment on function public.fn_verify_rollback() is
  'Verify rollback status of finance compliance migration. Run after rollback to confirm system state.';

grant execute on function public.fn_verify_rollback() to authenticated;

raise notice 'Step 10: Rollback verification function created';
raise notice '         → Run: SELECT * FROM public.fn_verify_rollback();';

-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK COMPLETE
-- ════════════════════════════════════════════════════════════════════════

raise notice '';
raise notice '════════════════════════════════════════════════════════════';
raise notice 'ROLLBACK COMPLETE';
raise notice '════════════════════════════════════════════════════════════';
raise notice '';
raise notice 'What was reverted:';
raise notice '  ✓ Per-kilometer delivery pricing → band-based';
raise notice '  ✓ VAT-exclusive rider allocation → gross-based';
raise notice '  ✓ Supplier-specific tax invoices → grouped invoices';
raise notice '  ✓ Property manager tables → archived';
raise notice '';
raise notice 'What was preserved:';
raise notice '  • All order data (no orders deleted)';
raise notice '  • Tax invoices already issued';
raise notice '  • New database columns (harmless)';
raise notice '  • Property manager data (archived for audit)';
raise notice '  • Feature flag system';
raise notice '';
raise notice 'Verification:';
raise notice '  Run: SELECT * FROM public.fn_verify_rollback();';
raise notice '';
raise notice 'To re-apply compliance rules:';
raise notice '  Run migration 20261026000000_finance_rules_compliance.sql again';
raise notice '  (safe to re-run, will detect existing state)';
raise notice '';
raise notice 'Manual actions if needed:';
raise notice '  • Re-enable COD: UPDATE feature_flag SET enabled=true WHERE key=''cash_on_delivery'';';
raise notice '  • Restore KES 250 surcharge: See commented SQL in Step 1';
raise notice '  • Restore property managers: RENAME archived tables back';
raise notice '';
raise notice '════════════════════════════════════════════════════════════';

commit;

-- Post-rollback verification query
-- Run this separately to verify rollback was successful:
--
-- SELECT * FROM public.fn_verify_rollback();
--
-- Expected output for successful rollback:
--   Small-order surcharge: DISABLED
--   Delivery pricing: BAND-BASED (rolled back)
--   Function renames: RENAMED (rolled back)
--   Property manager tables: ARCHIVED (rolled back)
--   Cash on delivery: DISABLED
--   New order columns: PRESENT (retained)
