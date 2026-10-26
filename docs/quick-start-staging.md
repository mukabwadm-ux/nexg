# Quick Start: Local Staging Database Setup

**Current Time:** 2026-10-26 18:27 UTC  
**Status:** Docker Desktop not running  
**Next Steps:** Start Docker, then start Supabase

---

## 🎯 Quick Setup (10 minutes)

### Step 1: Start Docker Desktop

**Windows:**
1. Press `Windows key`
2. Type "Docker Desktop"
3. Click to open
4. Wait for "Docker Desktop is running" (bottom-left shows green icon)
5. Takes ~1-2 minutes to start

**Or via Command Line:**
```bash
# Start Docker Desktop
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# Wait 60 seconds for it to start
sleep 60
```

---

### Step 2: Verify Docker is Running

```bash
# Check Docker status
docker ps

# Should show running containers or empty list (both OK)
# If error "daemon not running", wait longer and retry
```

---

### Step 3: Start Local Supabase

```bash
# Start Supabase (creates local database)
supabase start

# This will:
# - Pull Docker images (first time: ~5 minutes)
# - Start PostgreSQL database
# - Start Supabase services
# - Output connection details
```

**Expected Output:**
```
Started supabase local development setup.

         API URL: http://localhost:54321
          DB URL: postgresql://postgres:postgres@localhost:54322/postgres
      Studio URL: http://localhost:54323
    Inbucket URL: http://localhost:54324
      JWT secret: super-secret-jwt-token-with-at-least-32-characters
        anon key: eyJhbGc...
service_role key: eyJhbGc...
```

**Save this DB URL:** `postgresql://postgres:postgres@localhost:54322/postgres`

---

### Step 4: Apply All Migrations (Including Finance)

```bash
# Push all migrations to the local database
supabase db push --local

# This applies ALL migrations in order:
# - All existing migrations
# - Your new finance compliance migration (20261026000000)
```

**Expected Output:**
```
Applying migration 20260101001000...
...
Applying migration 20261026000000_finance_rules_compliance.sql...
✓ Finished supabase db push
```

---

### Step 5: Run Test Suite

```bash
# Set local database URL as environment variable
export LOCAL_DB="postgresql://postgres:postgres@localhost:54322/postgres"

# Run base test suite (29 assertions)
psql $LOCAL_DB -f supabase/tests/40_finance_compliance_calculations.sql
```

**Expected Output:**
```
NOTICE:  TEST 1: Small-order surcharge disabled
NOTICE:    ✓ Small-order surcharge correctly disabled
NOTICE:  TEST 2: Delivery pricing per-kilometer formula
NOTICE:    ✓ Test 2.1: 1km = KES 80
NOTICE:    ✓ Test 2.2: ~3.2km rounds up correctly
...
NOTICE:  ═══════════════════════════════════════════════════════════
NOTICE:  ALL TESTS PASSED ✓
NOTICE:  ═══════════════════════════════════════════════════════════
```

If tests pass, run extended tests:

```bash
# Run extended test suite (47 assertions, 3 businesses)
psql $LOCAL_DB -f supabase/tests/41_finance_extended_scenarios.sql
```

---

### Step 6: Manual Testing via Supabase Studio

**Open Studio in Browser:**
```
http://localhost:54323
```

**Test New Delivery Pricing:**
1. Click "SQL Editor" in sidebar
2. Click "New query"
3. Paste this SQL:

```sql
-- Test per-kilometer delivery pricing
SELECT public.fn_delivery_price_per_km(
  (SELECT id FROM public.city WHERE slug = 'nairobi' LIMIT 1),
  ST_SetSRID(ST_MakePoint(36.8219, -1.2921), 4326)::geography,  -- Starting point
  ST_SetSRID(ST_MakePoint(36.8519, -1.2921), 4326)::geography   -- ~3km away
) as delivery_pricing;
```

4. Click "Run" (or press Ctrl+Enter)
5. **Expected Result:**
```json
{
  "ok": true,
  "km": 3.3,
  "commenced_km": 4,
  "delivery_fee": 155,
  "delivery_fee_cents": 15500,
  "pricing": {
    "base": 80,
    "per_km": 25,
    "additional_km": 3
  }
}
```

**This proves the new per-km formula is working!** ✅

---

### Step 7: Test Rollback (Optional)

Test that you can safely rollback if needed:

```bash
# Run the manual rollback script
psql $LOCAL_DB -f supabase/rollback/finance_rules_rollback.sql

# Verify rollback worked
psql $LOCAL_DB -c "SELECT * FROM public.fn_verify_rollback();"
```

**Expected Output:**
```
check_name              | status                      | detail
------------------------+-----------------------------+----------------------------------
Small-order surcharge   | DISABLED                    | Check if old KES 250 or new...
Delivery pricing        | BAND-BASED (rolled back)    | Per-km vs band-based delivery...
Function renames        | RENAMED (rolled back)       | Check if new functions were...
Property manager tables | ARCHIVED (rolled back)      | Check if property manager...
Cash on delivery        | DISABLED                    | Cash on delivery feature flag...
```

**Re-apply forward migration:**
```bash
psql $LOCAL_DB -f supabase/migrations/20261026000000_finance_rules_compliance.sql
```

---

## 🎯 Success Checklist

Your local staging is ready when:

- [ ] Docker Desktop running
- [ ] `supabase start` completed successfully
- [ ] `supabase db push` applied all migrations
- [ ] Base test suite passed (29/29 assertions)
- [ ] Extended test suite passed (47/47 assertions)
- [ ] Manual test in Studio shows new per-km pricing
- [ ] Rollback tested successfully

---

## 📊 What You Now Have

**Local Staging Database:**
- URL: `postgresql://postgres:postgres@localhost:54322/postgres`
- Studio: http://localhost:54323
- API: http://localhost:54321

**With:**
- ✅ All production migrations applied
- ✅ New finance compliance rules active
- ✅ Test data available
- ✅ Safe to experiment (can reset anytime)

---

## 🧪 Quick Verification Commands

```bash
# Check if new pricing is active
psql $LOCAL_DB -c "
  SELECT key, value, status 
  FROM settings.version 
  WHERE key IN ('fees.delivery.per_km', 'fees.delivery.base')
    AND status = 'active';"

# Should return:
#       key              | value | status
# ----------------------+-------+--------
#  fees.delivery.base   | 80    | active
#  fees.delivery.per_km | 25    | active
```

```bash
# Check COD is disabled
psql $LOCAL_DB -c "
  SELECT key, enabled, reason 
  FROM public.feature_flag 
  WHERE key = 'cash_on_delivery';"

# Should return:
#       key            | enabled | reason
# --------------------+---------+----------------------------------------
#  cash_on_delivery   | f       | Disabled until collection...
```

---

## 🐛 Troubleshooting

### Issue: Docker Desktop won't start

**Fix:**
1. Check Windows Services (Win+R, type `services.msc`)
2. Find "Docker Desktop Service"
3. Right-click → Start
4. Wait 1-2 minutes

### Issue: Port 54322 already in use

**Fix:**
```bash
# Stop Supabase
supabase stop

# Or kill PostgreSQL on that port
netstat -ano | findstr :54322
taskkill /PID [PID_NUMBER] /F

# Restart Supabase
supabase start
```

### Issue: psql command not found

**Fix:**
```bash
# PostgreSQL is in Docker, access via Supabase
supabase db inspect

# Or install PostgreSQL client:
# Download from https://www.postgresql.org/download/windows/
# Or use Studio web interface instead
```

---

## ⏱️ Time Estimate

- Docker Desktop start: 2 minutes
- Supabase start (first time): 5 minutes
- Migrations apply: 1 minute
- Tests run: 2 minutes
- **Total: ~10 minutes**

---

## 🎉 When Tests Pass

**Your staging database is ready!** ✅

You can now:
1. **Show your team** - They can test at http://localhost:54323
2. **Experiment safely** - Reset anytime with `supabase db reset`
3. **Plan production deployment** - Knowing migration works

**Next Steps:**
- Schedule production deployment (low-traffic window)
- Prepare monitoring dashboard
- Brief support team
- Apply to production

---

## 🚀 Ready to Start?

**Run these commands now:**

```bash
# 1. Start Docker Desktop (if not running)
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# 2. Wait for Docker to be ready (check icon in system tray)

# 3. Start Supabase
supabase start

# 4. Apply migrations
supabase db push

# 5. Run tests
psql postgresql://postgres:postgres@localhost:54322/postgres \
  -f supabase/tests/40_finance_compliance_calculations.sql
```

**Then open:** http://localhost:54323 to see your staging database! 🎯
