# Finance Compliance Test Cases - Quick Reference

## Test Scenarios & Expected Results

### 📋 Test 1: Small-Order Surcharge
**Status:** ✅ Disabled

| Scenario | Old Rule | New Rule | Expected |
|----------|----------|----------|----------|
| KES 250 / 800 | Active | Superseded | Not applied |
| KES 30 / 500 | N/A | Pending approval | Not applied until activated |

---

### 🚗 Test 2: Delivery Pricing (Per-Kilometer)

| Distance | Formula | Expected Cost |
|----------|---------|---------------|
| 0-1 km | Base only | KES 80 |
| 3.2 km | 80 + (4-1)×25 | KES 155 |
| 5.0 km | 80 + (5-1)×25 | KES 180 |
| 10.0 km | 80 + (10-1)×25 | KES 305 |
| >15 km | N/A | Rejected |

**Key Rule:** Distance rounds UP (3.2 becomes 4)

---

### 💰 Test 3: Rider Allocation (VAT-Exclusive)

#### Example Order:
- Delivery: KES 155 (incl. 16% VAT)
- Night surcharge: KES 40 (incl. 16% VAT)

#### Calculations:

| Item | Gross | VAT-Exclusive | Rider % | Rider Gets |
|------|-------|---------------|---------|------------|
| Delivery | 155.00 | 133.62 | 70% | 93.53 |
| Night | 40.00 | 34.48 | 100% | 34.48 |
| Weather | 80.00 | 68.97 | 100% | 68.97 |
| **Total** | **275.00** | **237.07** | - | **197.00** |

**Formula:**
```
VAT-exclusive = Gross / 1.16

Rider delivery = VAT-exclusive × 70%
Rider surcharges = VAT-exclusive × 100%
```

---

### 🚫 Test 4: Cash on Delivery
**Expected:** `fn_cod_allowed()` returns `false`

---

### 🧾 Test 5: Tax Invoices (Supplier-Specific)

#### Single Order Should Generate:

| Invoice # | Purpose | From | To | Contains |
|-----------|---------|------|-----|----------|
| 1 | Merchant commission | NexG | Merchant | KES 280 commission |
| 2 | Service fee | NexG | Customer | KES 50 service fee |
| 3 | Delivery fee | NexG* | Customer | KES 155 delivery |
| 4 | Other fees | NexG | Customer | Small basket, surcharges, cash handling |

*Only when NexG supplied delivery

**Old Behavior:** 2 invoices (commission + all guest fees grouped)  
**New Behavior:** 4 separate supplier-specific invoices

---

### 🏨 Test 6: Property Manager Earnings (20%)

#### Example Order:
- Subtotal: KES 2,000
- Commission (14%): KES 280
- Service fee (2.5%): KES 50
- Delivery: KES 155
- Total: KES 2,205

#### Calculation at 16% VAT, 1.5% Processing:

| Component | Amount | Calculation |
|-----------|--------|-------------|
| Commission ex-VAT | 241.38 | 280 / 1.16 |
| Service ex-VAT | 43.10 | 50 / 1.16 |
| Delivery margin ex-VAT | 40.09 | (155/1.16) × 30% |
| **Revenue subtotal** | **324.57** | |
| Processing cost | (33.08) | 2205 × 1.5% |
| Fulfillment cost | (0.00) | Not tracked yet |
| Refunds | (0.00) | None |
| **Eligible contribution** | **291.49** | |
| **Manager reward (20%)** | **58.30** | 291.49 × 20% |

#### Monthly Statement Example:

| Month | Orders | Earnings | Fee | Net |
|-------|--------|----------|-----|-----|
| First month | 50 | 2,500 | 0 (free) | +2,500 (payout) |
| Second month | 20 | 850 | 1,000 | -150 (invoice) |
| Third month | 40 | 1,200 | 1,000 | +200 (payout) |

---

### 📊 Test 7: Service Fee Caps & Tiers

#### Standard Commission Merchants (≥14%):

| Subtotal | Rate | Calculated | Cap | Actual Fee |
|----------|------|------------|-----|------------|
| KES 1,000 | 2.5% | 25 | 150 | **25** |
| KES 6,000 | 2.5% | 150 | 150 | **150** |
| KES 10,000 | 2.5% | 250 | 150 | **150** ✂️ |

#### Reduced Commission Merchants (<14%):

| Subtotal | Rate | Calculated | Cap | Actual Fee |
|----------|------|------------|-----|------------|
| KES 1,000 | 4% | 40 | 200 | **40** |
| KES 5,000 | 4% | 200 | 200 | **200** |
| KES 10,000 | 4% | 400 | 200 | **200** ✂️ |

#### Large Orders (Above KES 4,960):

| Subtotal | Applied | Actual Fee |
|----------|---------|------------|
| KES 5,000 | Flat fee | **150** |
| KES 10,000 | Flat fee | **150** |
| KES 100,000 | Flat fee | **150** |

**Rule Priority:** Flat fee > Capped percentage

---

### 🔍 Test 8: Edge Cases

| Scenario | Input | Expected Behavior |
|----------|-------|-------------------|
| Zero distance | 0 km | Charge base fee (KES 80) |
| NULL location | No coordinates | Reject order |
| Zero subtotal | KES 0 | No service fee |
| Beyond max distance | >15 km | Reject order |
| Same-location pickup | 0 km | Charge base fee |

---

## 🎯 Manual Verification Steps

### Before Migration:
1. Record 5 recent order calculations (delivery, rider split, tax)
2. Note current small-order surcharge behavior
3. Export sample COD orders

### After Migration:
1. **Delivery Pricing**
   - Create test order at 1km → Should be KES 80
   - Create test order at 3.2km → Should be ~KES 155
   - Verify old band logic NOT applied

2. **Rider Allocation**
   - Check rider payout on KES 155 delivery → Should be ~KES 93.53
   - Verify night surcharge 100% to rider
   - Confirm VAT noted in breakdown

3. **COD Status**
   - Try to place COD order → Should fail/be disabled
   - Verify `fn_cod_allowed()` returns false

4. **Tax Invoices**
   - Complete 1 paid order → Should generate 3-4 invoices
   - Verify each invoice has correct supplier
   - Check VAT split per invoice

5. **Property Manager**
   - Attribute order to test property
   - Verify 20% calculation matches hand-calc
   - Check monthly statement logic

---

## 📞 Who to Call If Tests Fail

| Test Failed | Contact | Action |
|-------------|---------|--------|
| Pricing calculations off | Finance team | Review rate card values |
| VAT calculations wrong | Tax accountant | Verify VAT treatment |
| Database errors | Engineering | Check migration syntax |
| Feature flags not working | DevOps | Verify deployment |
| Business logic disputed | Product + Finance | Re-review approved rules |

---

## 🚀 Running the Tests

### Option 1: Full Test Suite
```bash
psql -h localhost -U postgres -d nexg_test \
  -f supabase/tests/40_finance_compliance_calculations.sql
```

### Option 2: Individual Test
```sql
-- Connect to test database
\c nexg_test

-- Run just delivery pricing tests
BEGIN;
-- Copy test 2 code here
ROLLBACK;
```

### Option 3: Staging Verification
```bash
# Apply migration to staging
supabase db push --db-url $STAGING_DB

# Run tests
psql $STAGING_DB -f supabase/tests/40_finance_compliance_calculations.sql

# Verify with real orders
psql $STAGING_DB -c "
SELECT 
  reference,
  fn_delivery_price_per_km(city_id, branch_location, dropoff_point) as new_pricing
FROM recent_orders 
LIMIT 5;
"
```

---

## ✅ Success Criteria

All tests pass when:
- [ ] No assertions fail
- [ ] All calculations within ±1 cent of expected
- [ ] Edge cases handled gracefully
- [ ] No SQL errors or warnings
- [ ] Feature flags respected
- [ ] Old rules superseded, not deleted

---

## 📝 Test Log Template

```
Date: 2026-10-26
Environment: __________ (local/staging/production)
Database: __________
Tested by: __________

Test Results:
[ ] Test 1: Small-order surcharge disabled
[ ] Test 2: Delivery per-km pricing
[ ] Test 3: Rider VAT-exclusive allocation  
[ ] Test 4: COD disabled
[ ] Test 5: Tax invoices separated
[ ] Test 6: Property manager 20%
[ ] Test 7: Service fee caps
[ ] Test 8: Edge cases

Issues Found:
___________________________________________
___________________________________________

Sign-off:
Engineering: ____________ Date: ________
Finance: ____________ Date: ________
```
