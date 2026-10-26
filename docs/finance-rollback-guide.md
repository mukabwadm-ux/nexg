# Finance Compliance Rollback Guide

**Manual rollback script:** `supabase/rollback/finance_rules_rollback.sql`
**Reverts:** `20261026000000_finance_rules_compliance.sql`  
**Date:** 2026-10-26

---

## 🚨 When to Rollback

### ✅ Safe to Continue (Don't Rollback)

| Symptom | Severity | Action |
|---------|----------|--------|
| UI shows old pricing temporarily | Low | Wait for cache clear |
| One merchant reports wrong commission | Low | Fix merchant settings |
| Minor calculation rounding difference (≤1 cent) | Low | Expected, document |
| Property manager feature unused | None | Feature is optional |

### ⚠️ Consider Rollback (Investigate First)

| Symptom | Severity | Action |
|---------|----------|--------|
| Service fee tier switching incorrectly | Medium | Verify merchant commission % |
| Delivery pricing off by >KES 10 | Medium | Check distance calculation |
| Rider payments disputed by drivers | Medium | Verify VAT-exclusive math |
| Tax accountant questions invoicing | Medium | Review with accountant first |

### 🔴 Immediate Rollback Required

| Symptom | Severity | Action |
|---------|----------|--------|
| Multiple merchants reporting wrong money splits | **High** | **ROLLBACK NOW** |
| System charging unapproved KES 30 small-order fee | **Critical** | **ROLLBACK NOW** |
| Orders failing to complete due to migration | **Critical** | **ROLLBACK NOW** |
| Database errors in order creation | **Critical** | **ROLLBACK NOW** |
| Tax invoices creating KRA compliance issues | **High** | **ROLLBACK NOW** |

---

## 🎯 Decision Flowchart

```
Is there a production incident?
│
├─ YES → Is money being lost or incorrectly charged?
│         │
│         ├─ YES → ROLLBACK IMMEDIATELY
│         │        └─ Follow Emergency Rollback Procedure
│         │
│         └─ NO → Can it wait until Monday?
│                  │
│                  ├─ YES → Document issue, plan fix
│                  └─ NO → ROLLBACK during maintenance window
│
└─ NO → Are calculations within acceptable range?
          │
          ├─ YES → Monitor and document
          │        └─ No rollback needed
          │
          └─ NO → Run verification queries
                   └─ If >5% of orders affected → ROLLBACK
```

---

## 📋 Pre-Rollback Checklist

Before executing rollback, complete these steps:

### 1. Verify the Issue (5 minutes)
```sql
-- Check recent orders for anomalies
SELECT 
  reference,
  total_cents / 100.0 as total,
  commission_cents / 100.0 as commission,
  service_fee_cents / 100.0 as service_fee,
  delivery_fee_cents / 100.0 as delivery,
  payment_status,
  created_at
FROM public."order"
WHERE created_at > now() - interval '1 hour'
ORDER BY created_at DESC
LIMIT 20;

-- Check for errors
SELECT 
  count(*) as error_count,
  stage,
  payment_status
FROM public."order"
WHERE created_at > now() - interval '1 hour'
  AND payment_status = 'failed'
GROUP BY stage, payment_status;
```

**Decision:** If >10% of recent orders have issues → Proceed with rollback

### 2. Document Current State (2 minutes)
```sql
-- Capture current configuration
SELECT * FROM public.fn_verify_rollback();

-- Save to CSV for comparison
\copy (SELECT * FROM public.fn_verify_rollback()) TO '/tmp/pre_rollback_state.csv' CSV HEADER;
```

### 3. Notify Stakeholders (5 minutes)
- [ ] Finance team: "Rolling back finance changes due to [issue]"
- [ ] Operations: "Pricing will revert to old model temporarily"
- [ ] Customer support: "No customer action needed, system maintenance"
- [ ] Engineering team: Alert on-call

### 4. Capture Sample Data (5 minutes)
```sql
-- Export 10 recent orders for analysis
\copy (
  SELECT 
    reference, 
    total_cents, 
    commission_cents, 
    service_fee_cents, 
    delivery_fee_cents,
    created_at
  FROM public."order"
  WHERE created_at > now() - interval '2 hours'
  ORDER BY created_at DESC
  LIMIT 10
) TO '/tmp/pre_rollback_orders.csv' CSV HEADER;
```

---

## 🔧 Rollback Procedures

### Option A: Emergency Rollback (Production Incident)

**Time Required:** 5 minutes  
**Use When:** Money is being lost/overcharged, orders failing

```bash
# 1. Connect to production database
psql $PRODUCTION_DB_URL

# 2. Execute rollback immediately
\i supabase/rollback/finance_rules_rollback.sql

# 3. Verify rollback
SELECT * FROM public.fn_verify_rollback();

# 4. Restart application (if needed)
# Clears any cached pricing functions
kubectl rollout restart deployment/api

# 5. Test one order end-to-end
# Place test order, verify pricing correct
```

**Expected Output:**
```
Small-order surcharge: DISABLED
Delivery pricing: BAND-BASED (rolled back)
Function renames: RENAMED (rolled back)
Property manager tables: ARCHIVED (rolled back)
Cash on delivery: DISABLED
New order columns: PRESENT (retained)
```

### Option B: Planned Rollback (Maintenance Window)

**Time Required:** 15 minutes  
**Use When:** Issue identified but not critical, scheduled maintenance

```bash
# 1. Announce maintenance (15 min warning)
curl -X POST $SLACK_WEBHOOK \
  -d '{"text": "🔧 Maintenance starting in 15 min: Finance system rollback"}'

# 2. Monitor active orders
psql $PRODUCTION_DB_URL -c "
  SELECT count(*) as active_orders 
  FROM public.\"order\" 
  WHERE stage IN ('placed', 'preparing', 'in_transit');"

# Wait for active orders to complete (or <5 active)

# 3. Enable maintenance mode (if available)
# curl -X POST $API_URL/admin/maintenance -d '{"enabled": true}'

# 4. Execute rollback
psql $PRODUCTION_DB_URL \
  -f supabase/rollback/finance_rules_rollback.sql

# 5. Verify
psql $PRODUCTION_DB_URL -c "SELECT * FROM public.fn_verify_rollback();"

# 6. Test critical paths
./scripts/test-order-flow.sh

# 7. Disable maintenance mode
# curl -X POST $API_URL/admin/maintenance -d '{"enabled": false}'

# 8. Monitor for 30 minutes
./scripts/monitor-orders.sh
```

---

## ✅ Post-Rollback Verification

### 1. System Health Check (5 minutes)

```sql
-- Verify rollback status
SELECT * FROM public.fn_verify_rollback();

-- Check recent orders are processing
SELECT 
  count(*) as total_orders,
  count(*) FILTER (WHERE payment_status = 'paid') as paid,
  count(*) FILTER (WHERE payment_status = 'failed') as failed,
  avg(total_cents) / 100.0 as avg_total
FROM public."order"
WHERE created_at > now() - interval '30 minutes';

-- Verify no new errors
SELECT 
  count(*) as errors 
FROM public.order_event 
WHERE kind = 'error' 
  AND at > now() - interval '30 minutes';
```

**Expected Results:**
- `fn_verify_rollback()` shows all items rolled back
- Orders processing normally
- Error count = 0 or minimal

### 2. Sample Order Test (10 minutes)

Place test orders for each business type:

**Restaurant (Standard Commission):**
```
Order: KES 1,500
Expected delivery (5km): KES 205 (band 2)
Expected service: KES 37.50 (2.5%)
Expected commission: KES 420 (28% if NexG delivers)
```

**Tours (Reduced Commission):**
```
Order: KES 10,000
Expected service: KES 200 (capped, reduced tier)
Expected commission: KES 1,000 (10%)
```

### 3. Merchant Verification (15 minutes)

Contact 3 merchants:
- [ ] High-volume restaurant
- [ ] Tour/travel company
- [ ] Wellness provider

Ask: "Please place a test order and verify the charges look correct"

### 4. Monitor Dashboard (30 minutes)

Watch these metrics:
- Order completion rate (should be >95%)
- Average order values (should match historical)
- Commission amounts (should match old model)
- Customer support tickets (should not spike)

---

## 🔄 Re-Applying After Rollback

Once the issue is fixed, you can re-apply the migration:

### Before Re-Applying

1. **Identify and fix the issue**
   - Document what went wrong
   - Update migration if needed
   - Test on staging thoroughly

2. **Verify prerequisites**
   - [ ] All stakeholders informed
   - [ ] Fix tested on staging
   - [ ] Rollback plan updated
   - [ ] Monitoring in place

3. **Schedule re-deployment**
   - Choose low-traffic window
   - Have engineer on-call
   - Prepare rollback again (just in case)

### Re-Application Process

```bash
# 1. Verify current state
psql $PRODUCTION_DB_URL -c "SELECT * FROM public.fn_verify_rollback();"

# 2. Re-apply compliance migration
psql $PRODUCTION_DB_URL \
  -f supabase/migrations/20261026000000_finance_rules_compliance.sql

# The migration detects existing state and is safe to re-run

# 3. Run test suite
psql $PRODUCTION_DB_URL \
  -f supabase/tests/40_finance_compliance_calculations.sql

# 4. Monitor closely
./scripts/monitor-orders.sh --duration 60m
```

---

## 📊 What the Rollback Does

### ✅ Reverts (Changes System Behavior)

| Component | Before Rollback | After Rollback |
|-----------|----------------|----------------|
| **Small-order fee** | Disabled | Disabled (stays disabled) |
| **Delivery pricing** | Per-km formula | Band-based (≤3km, 3-6km, etc.) |
| **Rider allocation** | VAT-exclusive (70% of net) | Gross-based (80% of gross) |
| **Tax invoices** | 4 separate invoices | 2 grouped invoices |
| **Property managers** | Active | Tables archived |

### 🔒 Preserves (Keeps Data Safe)

| Data Type | Status After Rollback |
|-----------|----------------------|
| **Completed orders** | ✅ Unchanged, keep their original calculations |
| **Tax invoices issued** | ✅ Kept as-is (cannot be changed) |
| **Property attributions** | ✅ Archived but not deleted |
| **Feature flags** | ✅ Retained, marked as rolled back |
| **New database columns** | ✅ Present but unused |

### 🗄️ Archives (For Audit Trail)

Renamed tables (data preserved):
- `property_manager` → `property_manager_archive_20261026`
- `property_attribution` → `property_attribution_archive_20261026`
- `property_manager_statement` → `property_manager_statement_archive_20261026`

Renamed functions (still callable):
- `fn_order_split_corrected` → `fn_order_split_vat_exclusive`
- `fn_tax_issue_order_compliant` → `fn_tax_issue_order_supplier_specific`

---

## 🐛 Common Issues After Rollback

### Issue 1: Cached Function Calls

**Symptom:** Application still uses new functions  
**Cause:** Connection pooler cached old function definitions  
**Fix:**
```bash
# Restart application
kubectl rollout restart deployment/api

# Or force pool refresh
psql $PRODUCTION_DB_URL -c "SELECT pg_reload_conf();"
```

### Issue 2: UI Shows Mixed Pricing

**Symptom:** Some orders use old pricing, some use new  
**Cause:** Race condition during rollback  
**Fix:**
```sql
-- Orders created during rollback may have mixed state
-- These are rare, manually review:
SELECT reference, created_at, total_cents
FROM public."order"
WHERE created_at BETWEEN 
  '2026-10-26 18:15:00' AND '2026-10-26 18:20:00';
```

### Issue 3: Property Manager Data "Missing"

**Symptom:** Property manager portal shows no data  
**Cause:** Tables were archived, not deleted  
**Fix:**
```sql
-- Restore if needed
ALTER TABLE property_manager_archive_20261026 
  RENAME TO property_manager;

-- Or query archived data
SELECT * FROM property_manager_archive_20261026;
```

---

## 📞 Emergency Contacts

| Role | Contact | When to Call |
|------|---------|--------------|
| **Engineering Lead** | [Slack: @eng-lead] | Rollback issues, database errors |
| **Finance Lead** | [Slack: @finance] | Money calculation questions |
| **Operations Manager** | [Slack: @ops] | Merchant complaints, operations impact |
| **Tax Accountant** | [Email: tax@company] | Tax invoice questions |
| **On-Call Engineer** | [PagerDuty] | After-hours emergencies |

---

## 📝 Post-Mortem Template

After any rollback, complete this:

```markdown
# Finance Compliance Rollback Post-Mortem

**Date:** 2026-10-26
**Duration:** [X hours]
**Impact:** [X orders affected]

## What Happened
[Brief description of the issue]

## Timeline
- **18:16** - Migration applied
- **18:20** - Issue detected: [description]
- **18:25** - Decision to rollback
- **18:30** - Rollback executed
- **18:35** - System verified healthy

## Root Cause
[What caused the issue]

## What Worked Well
- [Things that helped]

## What Didn't Work
- [Things that made it harder]

## Action Items
- [ ] Fix identified in migration code
- [ ] Add test case for this scenario
- [ ] Update monitoring to detect this earlier
- [ ] Improve rollback documentation
- [ ] Schedule re-deployment

## Lessons Learned
[What we'll do differently next time]
```

---

## ✅ Rollback Completion Checklist

After rollback, verify these items:

### Immediate (Within 5 minutes)
- [ ] Rollback SQL executed successfully
- [ ] `fn_verify_rollback()` returns expected results
- [ ] No database errors in logs
- [ ] Application restarted (if needed)

### Short-term (Within 30 minutes)
- [ ] Sample orders placed and verified
- [ ] Merchant dashboard checked
- [ ] Rider payments correct
- [ ] Tax invoices generating properly
- [ ] No spike in support tickets

### Follow-up (Within 24 hours)
- [ ] Post-mortem completed
- [ ] Issue root cause identified
- [ ] Fix planned and scheduled
- [ ] Stakeholders updated
- [ ] Documentation updated

---

## 🎓 Prevention for Next Time

To avoid needing rollback:

### Before Migration
1. ✅ Run test suite on staging (both base + extended)
2. ✅ Manual spot-checks with real merchant data
3. ✅ Finance team sign-off on calculations
4. ✅ Tax accountant review of invoicing
5. ✅ Feature flag ready for quick disable

### During Migration
1. ✅ Apply during low-traffic window
2. ✅ Monitor in real-time (first 30 min critical)
3. ✅ Have rollback script ready
4. ✅ On-call engineer available

### After Migration
1. ✅ Place test orders immediately
2. ✅ Monitor for first 24 hours
3. ✅ Review first merchant settlement
4. ✅ Document any issues found

---

**Remember:** Rollback is a safety feature, not a failure. Better to rollback quickly and fix properly than to leave incorrect calculations running.

**Questions?** Contact engineering team on Slack: #eng-finance-migration
