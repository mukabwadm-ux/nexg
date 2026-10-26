# Staging Database Setup Guide

**Date:** 2026-10-26  
**Purpose:** Test finance compliance migration before production

---

## 🎯 Three Options for Staging

### Option 1: Local Supabase (RECOMMENDED - Fastest & Safest)
**Time:** 5 minutes  
**Cost:** Free  
**Best for:** Quick testing, safe experimentation

### Option 2: Supabase Cloud Staging Project
**Time:** 15 minutes  
**Cost:** ~$25/month  
**Best for:** Team collaboration, production-like environment

### Option 3: Copy Production Database
**Time:** 30 minutes  
**Cost:** Depends on size  
**Best for:** Testing with real data (anonymize sensitive data first)

---

## 🚀 Option 1: Local Supabase (RECOMMENDED)

### Step 1: Start Local Supabase
```bash
# Make sure you're in the project directory
cd /c/Users/Mukabwa/Documents/nexg/nexg

# Start Supabase locally (this creates a fresh database)
supabase start

# This will output connection details like:
# API URL: http://localhost:54321
# DB URL: postgresql://postgres:postgres@localhost:54322/postgres
# Studio URL: http://localhost:54323
```

**Wait for it to start** - Takes ~2 minutes first time

### Step 2: Verify Local Database Running
```bash
# Check status
supabase status

# Should show:
# API URL: http://localhost:54321
# DB URL: postgresql://postgres:postgres@localhost:54322/postgres
# Studio URL: http://localhost:54323
# Status: RUNNING
```

### Step 3: Apply All Migrations (Including New Finance One)
```bash
# Apply all migrations to the local database
supabase db push --local

# This runs all migrations in supabase/migrations/ folder
# Including your new finance compliance migration
```

**Expected output:**
```
Applying migration 20260101022200_pricing_rules.sql...
Applying migration 20261026000000_finance_rules_compliance.sql...
✓ All migrations applied successfully
```

### Step 4: Run Test Suite
```bash
# Set local database URL
export LOCAL_DB="postgresql://postgres:postgres@localhost:54322/postgres"

# Run base test suite
psql $LOCAL_DB -f supabase/tests/40_finance_compliance_calculations.sql

# Run extended test suite
psql $LOCAL_DB -f supabase/tests/41_finance_extended_scenarios.sql
```

**Expected output:**
```
TEST 1: Small-order surcharge disabled
  ✓ Small-order surcharge correctly disabled
TEST 2: Delivery pricing per-kilometer formula
  ✓ Test 2.1: 1km = KES 80
...
════════════════════════════════════════════════════════════
ALL TESTS PASSED ✓
════════════════════════════════════════════════════════════
```

### Step 5: Manual Testing via Supabase Studio

1. **Open Studio:** http://localhost:54323
2. **Navigate to SQL Editor**
3. **Create test order:**

```sql
-- Create test merchant
INSERT INTO public.merchant (city_id, trading_name, category, status)
SELECT 
  (SELECT id FROM public.city WHERE slug = 'nairobi' LIMIT 1),
  'Test Restaurant',
  'restaurant',
  'live'
RETURNING id;

-- Note the merchant ID, then test new pricing
SELECT public.fn_price_order(
  (SELECT id FROM public.city WHERE slug = 'nairobi'),
  'restaurant',
  150000,  -- KES 1,500 order
  1,       -- 1km distance
  now(),
  (SELECT id FROM public.merchant WHERE trading_name = 'Test Restaurant')
);

-- Check result has new per-km delivery pricing
```

### Step 6: Test Rollback (Optional but Recommended)
```bash
# Run the manual rollback script
psql $LOCAL_DB -f supabase/rollback/finance_rules_rollback.sql

# Verify rollback worked
psql $LOCAL_DB -c "SELECT * FROM public.fn_verify_rollback();"

# Should show: "BAND-BASED (rolled back)"

# Re-apply forward migration to continue testing
psql $LOCAL_DB -f supabase/migrations/20261026000000_finance_rules_compliance.sql
```

### Step 7: When Done Testing
```bash
# Stop local Supabase (preserves database)
supabase stop

# Or reset completely for fresh start
supabase db reset
```

---

## 🌐 Option 2: Supabase Cloud Staging Project

### Step 1: Create Staging Project

1. **Go to:** https://supabase.com/dashboard
2. **Click:** "New Project"
3. **Settings:**
   - Name: `nexg-staging`
   - Database Password: (generate strong password, save it!)
   - Region: Same as production
   - Plan: Pro ($25/month) or Free (limited)
4. **Wait:** ~2 minutes for provisioning

### Step 2: Link to Your Code

```bash
# In your project directory
supabase link --project-ref YOUR_STAGING_PROJECT_REF

# Get project ref from: Project Settings > General > Reference ID
```

### Step 3: Push Migrations to Staging

```bash
# Push all migrations to staging
supabase db push --linked

# Or manually apply
supabase db push --db-url "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
```

### Step 4: Seed Test Data

```bash
# Push seed data
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  -f supabase/seed.sql

# Add demo data
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  -f supabase/demo-data.sql
```

### Step 5: Run Tests on Staging

```bash
# Set staging URL
export STAGING_DB="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# Run test suites
psql $STAGING_DB -f supabase/tests/40_finance_compliance_calculations.sql
psql $STAGING_DB -f supabase/tests/41_finance_extended_scenarios.sql
```

### Step 6: Access Staging Dashboard

**URL:** https://supabase.com/dashboard/project/YOUR_PROJECT_REF

- View tables in Table Editor
- Run queries in SQL Editor
- Check API logs
- Monitor performance

---

## 💾 Option 3: Copy Production to Staging

### ⚠️ WARNING: Anonymize Sensitive Data!

Before copying production, you MUST anonymize:
- Customer phone numbers
- Customer names
- Merchant banking details
- Staff passwords
- Any PII (Personally Identifiable Information)

### Step 1: Export Production Schema (No Data)

```bash
# Export schema only
pg_dump $PRODUCTION_DB_URL \
  --schema-only \
  --no-owner \
  --no-privileges \
  > production_schema.sql
```

### Step 2: Create Staging Database

```bash
# If using managed service (e.g., Supabase, AWS RDS)
# Create via console/dashboard

# If using PostgreSQL directly
createdb nexg_staging
```

### Step 3: Import Schema to Staging

```bash
psql $STAGING_DB_URL < production_schema.sql
```

### Step 4: Copy Anonymized Data

```sql
-- Connect to staging
\c $STAGING_DB_URL

-- Copy merchants (safe, no PII)
INSERT INTO public.merchant
SELECT * FROM dblink(
  'host=prod.db port=5432 dbname=nexg user=readonly password=XXX',
  'SELECT * FROM public.merchant'
) AS t(
  id uuid, trading_name text, legal_name text, category text, 
  status text, commission_pct numeric, has_own_riders boolean,
  -- ... all columns
);

-- Copy orders with anonymized guest data
INSERT INTO public.guest (id, phone, name)
SELECT 
  id,
  '+254700' || LPAD((row_number() OVER ())::text, 6, '0'), -- Fake phones
  'Guest ' || (row_number() OVER ()) -- Fake names
FROM dblink(...) AS t(...);

-- Copy orders
INSERT INTO public."order"
SELECT * FROM dblink(...) AS t(...)
WHERE created_at > now() - interval '30 days'  -- Last 30 days only
LIMIT 1000;  -- Limit size
```

### Step 5: Apply New Migration

```bash
# Apply finance compliance migration
psql $STAGING_DB_URL \
  -f supabase/migrations/20261026000000_finance_rules_compliance.sql
```

### Step 6: Compare Old vs New Calculations

```sql
-- Compare old and new pricing for sample orders
SELECT 
  reference,
  total_cents / 100.0 as original_total,
  public.fn_order_split(id) as old_split,
  public.fn_order_split_corrected(id) as new_split
FROM public."order"
WHERE created_at > now() - interval '7 days'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🧪 Testing Checklist

Once staging database is ready, verify these:

### Automated Tests
- [ ] Base test suite passes (29 assertions)
- [ ] Extended test suite passes (47 assertions)
- [ ] No SQL errors during migration
- [ ] Rollback migration works
- [ ] Re-apply forward migration works

### Manual Tests
- [ ] Create order: KES 1,500, 3km delivery
  - Expected delivery: KES 155 (per-km formula)
  - Expected service fee: KES 37.50 (2.5%)
  
- [ ] Create order: KES 10,000, 5km delivery
  - Expected delivery: KES 180
  - Expected service fee: KES 150 (capped)
  
- [ ] Create order: Tours, KES 15,000
  - Expected service fee: KES 200 (reduced tier cap)
  - Expected commission: KES 1,500 (10%)

### Verification Queries
```sql
-- 1. Check new pricing active
SELECT key, value, status
FROM settings.version
WHERE key IN ('fees.delivery.per_km', 'fees.delivery.base')
  AND status = 'active';
-- Should return 2 rows

-- 2. Check COD disabled
SELECT enabled FROM public.feature_flag 
WHERE key = 'cash_on_delivery';
-- Should return: false

-- 3. Check functions renamed
SELECT proname 
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' 
  AND proname LIKE '%_vat_exclusive%';
-- Should be empty (not rolled back)

-- 4. Test new delivery pricing
SELECT public.fn_delivery_price_per_km(
  (SELECT id FROM city WHERE slug = 'nairobi'),
  ST_SetSRID(ST_MakePoint(36.8219, -1.2921), 4326)::geography,
  ST_SetSRID(ST_MakePoint(36.8519, -1.2921), 4326)::geography
);
-- Should return ~KES 155 for ~3km
```

---

## 📊 Compare Old vs New (Sample Data)

### Restaurant Order (KES 1,500, 5km)

**Old Pricing:**
```
Delivery: KES 205 (band 2: 3-6km)
Service: KES 37.50 (2.5%)
Commission: KES 420 (28%)
Rider: KES 164 (80% of gross KES 205)
```

**New Pricing:**
```
Delivery: KES 180 (80 + 4×25)
Service: KES 37.50 (2.5%)
Commission: KES 420 (28%)
Rider: KES 108.62 (70% of VAT-exclusive KES 155.17)
```

**Difference:** Delivery -KES 25, Rider -KES 55.38

---

## 🐛 Troubleshooting

### Issue: "supabase command not found"

**Fix:**
```bash
# Install Supabase CLI
npm install -g supabase

# Or with scoop (Windows)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### Issue: "Port already in use"

**Fix:**
```bash
# Stop existing Supabase
supabase stop

# Or change ports in config.toml
# Edit: supabase/config.toml
# Change: port = 54321 to port = 54421
```

### Issue: "Migration fails with error"

**Fix:**
```bash
# Reset database and try again
supabase db reset

# Or check migration syntax
psql $LOCAL_DB < supabase/migrations/20261026000000_finance_rules_compliance.sql

# Look for specific error message
```

### Issue: "Tests fail"

**Check:**
```sql
-- Verify base data exists
SELECT count(*) FROM public.city;
-- Should have at least Nairobi

-- If no cities, run seed
psql $LOCAL_DB -f supabase/seed.sql
```

---

## ✅ Ready for Production?

Your staging is ready for production when:

- [ ] All automated tests pass
- [ ] 5 manual test orders verified
- [ ] Calculations match expected values (±1 cent)
- [ ] Finance team reviewed sample outputs
- [ ] Tax accountant approved invoice format
- [ ] Rollback tested successfully
- [ ] Team trained on new pricing rules
- [ ] Monitoring dashboard ready
- [ ] Support team briefed

---

## 🚀 Recommended: Start with Option 1 (Local)

**Why:**
- ✅ Fastest to set up (5 minutes)
- ✅ Free, no cloud costs
- ✅ Safe - can't affect production
- ✅ Easy to reset and retry
- ✅ Full Supabase Studio access
- ✅ Perfect for development testing

**Command to start:**
```bash
cd /c/Users/Mukabwa/Documents/nexg/nexg
supabase start
supabase db push
psql postgresql://postgres:postgres@localhost:54322/postgres \
  -f supabase/tests/40_finance_compliance_calculations.sql
```

---

## 📞 Need Help?

If you encounter issues:

1. **Check Supabase status:** `supabase status`
2. **View logs:** `supabase logs`
3. **Reset if stuck:** `supabase db reset`
4. **Check migrations:** `ls -la supabase/migrations/`

Ready to start? Let's begin with Option 1 (Local Supabase)! 🚀
