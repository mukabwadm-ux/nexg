# Finance Rules Compliance Update
**Date:** 2026-10-26  
**Migration:** `20261026000000_finance_rules_compliance.sql`

## Executive Summary

This migration implements the approved finance rules shared on 2026-10-26, bringing the system into compliance with agreed pricing, allocation, and tax treatment.

---

## Changes Implemented

### 1. ✅ Small-Order Surcharge Disabled
**Problem:** System was charging KES 250 below KES 800 (unapproved)  
**Approved:** KES 30 below KES 500 (pending approval)  
**Action:**
- Deactivated KES 250/800 rule
- Added KES 30/500 as `pending_approval` status
- Will not charge customers until explicitly activated

**Impact:** No small-order surcharge will be applied until finance approves and activates

---

### 2. ✅ Delivery Pricing: Per-Kilometer Formula
**Problem:** Band-based pricing (≤3km: KES 130, 3-6km: KES 205, etc.)  
**Approved:** KES 80 base + KES 25 per commenced kilometer  
**Action:**
- Created `fn_delivery_price_per_km()` function
- Distance rounds UP: 3.2 km becomes 4 km
- Example: 3.2 km = KES 80 + (3 × KES 25) = KES 155

**Settings added:**
- `fees.delivery.base` = KES 80
- `fees.delivery.per_km` = KES 25

**Required follow-up:** Update checkout to call new pricing function

---

### 3. ✅ Rider Allocation: VAT-Exclusive Basis
**Problem:** Calculating on gross amounts: `(delivery + night) × 70%`  
**Approved:** 70% of VAT-exclusive delivery + 100% of VAT-exclusive surcharges  
**Action:**
- Created `fn_order_split_corrected()` function
- Strips VAT before calculating rider share
- Night surcharge: 100% to rider (VAT-exclusive)
- Weather surcharge: 100% to rider (VAT-exclusive)

**Example calculation:**
```
Delivery fee: KES 155 (incl. 16% VAT)
VAT-exclusive: KES 133.62
Rider gets: KES 93.53 (70% of VAT-exclusive)

Night surcharge: KES 40 (incl. 16% VAT)
VAT-exclusive: KES 34.48
Rider gets: KES 34.48 (100% of VAT-exclusive)
```

**Required follow-up:** Update order breakdown screens to use new function

---

### 4. ✅ Cash on Delivery: Disabled + Collector Tracking
**Problem:** COD enabled without reconciliation controls  
**Approved:** Must remain disabled until collection/remittance/reconciliation built  
**Action:**
- Added `feature_flag` table with `cash_on_delivery` = disabled
- Added `order.collected_by` column (nexg_rider | merchant | third_party)
- Created `fn_cod_allowed()` function for gate-checking

**Required follow-up:** 
1. Build cash collection reconciliation workflow
2. Update checkout to check `fn_cod_allowed()`
3. Enable feature flag only after reconciliation ready

---

### 5. ✅ Tax Invoices: Supplier-Specific
**Problem:** One guest invoice grouping all fees at one VAT rate  
**Approved:** Separate invoices by supplier and service type  
**Action:**
- Created `fn_tax_issue_order_compliant()` function
- Issues 4 separate invoices:
  1. **Merchant commission** (NexG → Merchant)
  2. **Service fee** (NexG → Customer)
  3. **Delivery fee** (Actual supplier → Customer)
  4. **Other fees** (Small basket, surcharges, cash handling → Customer)

**Added tracking:**
- `order.delivery_supplier` (nexg | merchant | third_party)
- New `tax_invoice.purpose` values

**Required follow-up:** 
1. Confirm VAT treatment with Kenyan tax accountant
2. Integrate with KRA eTIMS
3. Update invoice display to show supplier-specific documents

---

### 6. ✅ Property Manager Earnings (20% Model)
**Problem:** No implementation  
**Approved:** 20% of eligible contribution after VAT, costs, refunds  
**Action:**
- Created property manager tables and tracking
- Created `fn_property_manager_contribution()` calculation
- Implements monthly KES 1,000 fee structure

**Calculation:**
```
Eligible contribution = 
  Commission (ex-VAT)
  + Service fee (ex-VAT)  
  + Delivery margin (ex-VAT, 30% of delivery after paying rider 70%)
  - Payment processing costs
  - Fulfillment costs
  - Refunds

Manager reward = 20% × Eligible contribution

Monthly reconciliation:
  If earnings > KES 1,000 → Pay difference to manager
  If earnings = KES 1,000 → No payment
  If earnings < KES 1,000 → Invoice manager for shortfall
```

**Tables created:**
- `property_manager` (manager profiles)
- `property_attribution` (which orders are attributed)
- `property_manager_statement` (monthly reconciliation)

**Required follow-up:**
1. Build attribution tracking (referral codes, property association)
2. Build monthly statement generation workflow
3. Build invoicing for negative balances

---

### 7. ✅ Weather Surcharge Support
**Added:** `order.weather_fee_cents` column  
**Allocation:** 100% to rider (VAT-exclusive)  
**Status:** Column ready, activation requires approval of amounts and conditions

---

## Database Changes Summary

### New Tables
- `feature_flag` - Operational readiness gates
- `property_manager` - Property manager profiles
- `property_attribution` - Order attribution tracking
- `property_manager_statement` - Monthly reconciliation

### New Columns
- `order.collected_by` - Who collected cash
- `order.weather_fee_cents` - Weather surcharge amount
- `order.delivery_supplier` - Who supplied delivery

### New Functions
- `fn_delivery_price_per_km()` - Per-km delivery pricing
- `fn_order_split_corrected()` - VAT-exclusive rider allocation
- `fn_cod_allowed()` - Feature flag check
- `fn_tax_issue_order_compliant()` - Supplier-specific invoices
- `fn_property_manager_contribution()` - Property manager earnings

### New Settings
- `fees.delivery.base` = KES 80
- `fees.delivery.per_km` = KES 25
- `fees.small_basket_fee` = KES 30 (pending approval)
- `fees.small_basket_threshold` = KES 500 (pending approval)

---

## Testing Checklist

### Before Deployment
- [ ] Run migration on staging database
- [ ] Verify old small-order surcharge is deactivated
- [ ] Verify COD feature flag is disabled
- [ ] Test delivery pricing: 1km, 3.2km, 5km, 10km
- [ ] Test rider allocation with sample orders
- [ ] Verify tax invoice separation

### After Deployment
- [ ] Update checkout UI to use `fn_delivery_price_per_km()`
- [ ] Update order breakdown to use `fn_order_split_corrected()`
- [ ] Update checkout to check `fn_cod_allowed()` before offering COD
- [ ] Add COD toggle: "Cash payment unavailable - coming soon"
- [ ] Update tax invoice display to show multiple documents
- [ ] Test order flow end-to-end with new pricing

### Finance Team Review
- [ ] Confirm VAT treatment with tax accountant (delivery, surcharges)
- [ ] Approve KES 30 / KES 500 small-order surcharge values
- [ ] Set weather surcharge amounts and activation criteria
- [ ] Review property manager 20% calculation logic
- [ ] Set processing cost and fulfillment cost tracking

---

## Migration Safety

### Reversibility
- Old pricing functions remain in database
- No data deleted, only new columns/tables added
- Feature flags allow controlled rollout
- Settings can be reverted via `status = 'superseded'`

### Zero Downtime
- All changes are additive
- Old functions still work until UI updated
- No breaking changes to existing orders

### Data Integrity
- Constraints added for new enums
- Foreign keys enforce referential integrity
- Check constraints validate calculations

---

## Required Follow-Up Work

### Phase 1: Critical (Before Go-Live)
1. **Update checkout UI** to use `fn_delivery_price_per_km()`
2. **Disable COD** in frontend until reconciliation built
3. **Test new pricing** on staging with real merchant data
4. **Tax accountant review** of VAT treatment

### Phase 2: COD Enablement
1. Build cash collection workflow (rider → ops)
2. Build remittance tracking (ops → finance)
3. Build reconciliation dashboard
4. Enable `feature_flag.cash_on_delivery`

### Phase 3: Property Managers
1. Build attribution tracking system
2. Build monthly statement generation
3. Build invoicing for negative balances
4. Create property manager portal

### Phase 4: Tax Compliance
1. Integrate KRA eTIMS API
2. Update invoice display for multiple documents
3. Build compliance reporting dashboard
4. Train support team on new invoicing

---

## Rollback Plan

If issues are discovered:

```sql
-- 1. Revert small-order surcharge to previous (if needed for testing)
UPDATE settings.version 
   SET status = 'active', superseded_at = NULL
 WHERE key = 'fees.small_basket_fee' 
   AND value = '250'::jsonb;

-- 2. Keep COD disabled (already safe)

-- 3. Revert to old split function in UI
-- (Backend: both functions coexist, UI chooses which to call)

-- 4. Delay property manager features
-- (Tables exist but unused until Phase 3)
```

---

## Questions for Finance Team

1. **Small-order surcharge**: When can we activate KES 30 / KES 500?
2. **Weather surcharge**: What amounts and activation criteria?
3. **Fulfillment costs**: How do we track and attribute these?
4. **Property manager first month**: Is it calendar month or 30 days from join?
5. **Tax treatment**: Does delivery VAT treatment differ by supplier type?
6. **COD timeline**: When will reconciliation controls be ready?

---

## Approval Required

**Finance Lead:** _____________________ Date: _________

**Operations Manager:** _____________________ Date: _________

**Tax Accountant:** _____________________ Date: _________

---

## Contact

Questions about this migration:  
- Technical: Engineering team
- Business rules: Finance team  
- Tax compliance: Tax accountant
