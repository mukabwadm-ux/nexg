# Phase 4 SQL verification and rehearsal

2 November 2026. Migration `20261102000100_merchant_application.sql` is additive source work. No linked Supabase database or deployed Auth/PostgREST service was changed. Existing migration files remain unchanged.

## Local evidence

The isolated PGlite test executes the actual new migration, the generated registry seed, the existing protected-column trigger function from migration `20260101004000`, and the legacy resume RPC bodies from migration `20260101003900`. It runs requests under the PostgreSQL `authenticated` and `anon` roles. The fixture represents Auth, audit, existing owner tables and the legacy RPC crypto dependencies needed by these checks. It does not recreate the full historical Supabase database.

`scripts/test-merchant-application-sql.mjs` passes 120 checks. Coverage includes atomic merchant/member creation and rollback, strict capture and retained-answer schemas, ownership and workspace-role revocation, protected fields, scoped replay and conflicting operation IDs, revision conflicts, immutable submissions, scoped/current review, changes requested, approval withdrawal after editing, unchanged-save approval preservation, pending direct and related-order RLS, approved operational reads, publication/accepting-work denial, private payout declarations and receipts, session expiry and activity, timeout-after-start recovery, actor command quotas with retry hints and clock-rewind protection, and the boundary between legacy resume links and signed-in application ownership.

PGlite is installed under an isolated temporary tooling directory. It is not a workspace dependency or application runtime. To repeat in PowerShell:

```powershell
$p4SqlTool = Join-Path $env:TEMP 'nexg-phase4-pglite'
npm install --prefix $p4SqlTool --no-audit --no-fund --package-lock=false @electric-sql/pglite
$env:PHASE4_PGLITE_PATH = Join-Path $p4SqlTool 'node_modules/@electric-sql/pglite/dist/index.js'
node scripts/test-merchant-application-sql.mjs
node scripts/generate-merchant-application-registry.mjs --check
```

The registry check compares the committed SQL projection with the existing registry at `packages/booking-config/src/data/registry.json`. Revision `nexg-booking-2026-10-31.1` contains 21 categories, 128 specialty profiles and 323 question schemas. Run the generator without `--check` only while this new migration remains unapplied. Subsequent deployed registry changes require a new migration. Legacy category aliases come from migration `20260101021002` and carry compatibility revision `merchant-category-aliases-20260101021002.v1`. New capture payloads require canonical category and question keys; the legacy aliases never silently reinterpret a new payload.

## SQL contracts

Application commands are start, save, submit and revision-bound review as specified in the implementation plan. `rpc_merchant_application_operation_read(p_operation_id uuid)` recovers a stored receipt when a start response was lost before the client learned its merchant ID. It checks the current session, journal actor and current authorization. Unknown, foreign and revoked operations return null. Reads never record activity.

`rpc_merchant_workspace_access(p_merchant_id uuid)` returns `state`, `setup`, `operations`, `review_state`, `revision` and `needs_resubmission`, with session deadline metadata for new applications. Pending applications permit owner setup and deny operational reads. Current submitted approval permits operational reads. A new draft revision removes that access until resubmission and a new review. Approval never sets merchant publication or accepting-work state. New-flow transitions to `live` or `accepting_orders=true` remain blocked until the Phase 7 owner implements readiness and activation. Merchants without application rows retain their existing access policies.

`rpc_merchant_session_activity(p_merchant_id uuid)` is the separate authenticated activity mutation. Sessions must still exist in `auth.sessions` and belong to the JWT subject/session ID. Database policy caps absolute lifetime at 24 hours and idle lifetime at 8 hours; an Auth `not_after` deadline may shorten the lifetime. Expired sessions cannot revive themselves with activity. Missing or invalid policy values deny access.

Owned binding clears any legacy resume-token hash and expiry before inserting the application row in the same merchant-locked transaction. Opted-in rows reject subsequent legacy token issuance. An invoker membership insert guard locks the merchant row and requires a current existing owner or scoped staff session when an application exists. This prevents an old definer claim that selected a token before binding from inserting a new owner afterward. The test emulates that final claim insertion after token selection; a separate-connection race still belongs in staging rehearsal. Merchants without application rows retain their legacy resume RPC behavior.

Private payout commands are `rpc_merchant_application_payout_read(p_merchant_id uuid)` and `rpc_merchant_application_payout_save(p_merchant_id uuid,p_expected_version bigint,p_operation_id uuid,p_payout jsonb)`. The read returns `{merchant_id,version,payout,verification:'declared'}`; no declaration has version zero and null payout. The save returns `{merchant_id,version,verification:'declared',operation_id}`. Payout is one strict branch: Till with `tillNumber`, PayBill with `paybillNumber` and `accountReference`, or bank with `bankName`, `accountName` and `accountNumber`. Numbers remain strings, including leading zeroes. A mobile phone is not a destination rail. Reviewers cannot read private declarations through this application boundary. The migration does not copy declarations into broad legacy merchant reads, claim finance verification or write `settlement_account`. Finance verification and provider acceptance remain with their existing domain owners.

All mutations share an authenticated actor bucket across merchant IDs. Capacity is 60 tokens with 30 tokens refilled per minute. Costs are start 20, save 1, submit 5, review 5, payout save 5 and activity 1. Successful starts also have a rolling 24-hour maximum of three per actor. Actor row locks serialize distinct operation IDs. Exact replay returns before spending; a failed transaction commits neither state nor quota spending. Exhaustion raises SQLSTATE `P4290`, which the application route maps to HTTP 429. Its `hint` is a plain positive integer string of retry seconds, calculated from token refill or the oldest successful start reaching 24 hours. The helper and budget table have no direct browser grants.

## Deployment rehearsal still required

Keep connected entry disabled until the staging owner has rehearsed the new migrations against the actual previous schema and grants. Apply migration 001 before integration security migration 002. Validate existing extension/schema names, Auth sessions and JWT claims, current membership/role grants, default privileges, all existing restrictive/permissive policy combinations and invoker views. Exercise SSR refresh and cross-tab sign-out through actual Auth and PostgREST. Run concurrent requests over separate database connections for duplicate starts, actor quota serialization, competing saves and review versus draft changes. The PGlite fixture does not prove those deployed integrations or cross-process concurrency.

Rehearsal must also test the existing private document upload/storage contract and operational provider paths with the selected environment. No new booking work, payout verification, ERP provider connection or go-live acceptance follows from the local SQL evidence.

If rehearsal fails, keep the connected feature disabled and correct the additive source migration before it is first applied. After application, repair with a new migration. Rollback means disabling new entry and retaining application rows, immutable submissions, operation receipts and private declarations for recovery. Do not delete data, weaken the invoker protected trigger or restore the old direct membership/create bypasses.
