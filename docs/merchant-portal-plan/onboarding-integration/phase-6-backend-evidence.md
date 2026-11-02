# Phase 6 admin review backend evidence

2 November 2026, Africa/Nairobi. The local admin read/command boundary is verified in Desktop MERCHANT WORKSPACE. These checks did not contact Supabase, apply a remote migration, start services, use real accounts or invoke publication, payments, integrations or email OTP.

The admin reader uses bounded authenticated RPCs for a staff queue, current application and exact immutable submitted snapshot. A separate boolean lookup lets the legacy detail choose the managed flow without reading payout data. The additive migration is `20261102000300_merchant_application_admin_review.sql`. Current active global or matching city grants and the existing session boundary govern every read. Unassigned applications require a global grant.

The POST transport calls the existing `rpc_merchant_application_review`. It binds the page actor to the server-verified non-anonymous Auth account, validates a same-origin JSON command, bounds bytes and execution time, and returns private/no-store results or safe Problem Details. It forwards the submitted revision and stable operation ID without automatic retries. Database session, grant, pending-state and revision checks remain authoritative at execution.

## Checks and results

Commands ran from `C:\Users\limta\Desktop\MERCHANT WORKSPACE\apps\admin`, directly through the existing Node modules. No package-manager install or dependency resolution ran for these checks.

```powershell
$env:PHASE4_PGLITE_PATH = Join-Path $env:TEMP 'nexg-phase4-pglite/node_modules/@electric-sql/pglite/dist/index.js'
node node_modules/vitest/vitest.mjs run --config vitest.application-review.config.ts lib/merchant-application-review.test.ts lib/merchant-application-review-http.test.ts lib/merchant-application-review.integration.test.ts
```

The initial run passed all 18 reader tests and 28 transport tests. Their test durations were 60 ms and 140 ms. The SQL scenario stopped at fixture creation because three starts and submissions exhausted one owner's real command bucket. The fixture was changed to use two separate synthetic owners. No rate-limit implementation or budget was changed.

Only the changed SQL scenario was then rerun:

```powershell
$env:PHASE4_PGLITE_PATH = Join-Path $env:TEMP 'nexg-phase4-pglite/node_modules/@electric-sql/pglite/dist/index.js'
node node_modules/vitest/vitest.mjs run --config vitest.application-review.config.ts lib/merchant-application-review.integration.test.ts
```

It passed, exit 0, in 15.44 seconds total, including 10.83 seconds in its single integration scenario. The final evidence covers 47 passing tests across the three files. The unchanged reader and transport suites were not rerun. One erased TypeScript generic annotation was added to a transport test after its runtime pass; the final type check covers that annotation.

```powershell
node node_modules/typescript/bin/tsc --project tsconfig.application-review-backend.json --noEmit
```

The final scoped TypeScript check exited 0. The initial check caught the test-only Promise generic inference, which was corrected before this final check.

## What the integration scenario established

The test applies the unchanged Phase 6 migration inside the existing file-backed PGlite 0.5.14 fixture. It uses the actual Phase 4 application schema, command bodies, session checks, staff grants and operation journal, then drives the admin reader and HTTP handler through those functions.

- Global staff see cityless applications and traverse a bounded three-row queue with stable cursors. City staff see their assigned application and cannot read or decide cityless or foreign-city applications.
- Ordinary owners, revoked or expired grants, disabled staff and expired Auth session rows receive access denials. A partial cursor is rejected by the actual read RPC. Anonymous execute permission is absent.
- After an owner edit, detail preserves the original submitted name beside the new current name and becomes read-only. Both stale and unsubmitted revisions reject review. Resubmission replaces the selected snapshot with the new immutable revision.
- A change request retains its bounded reason for the merchant. Exact operation replay returns the saved receipt, changed reuse conflicts, and a second new decision on the reviewed revision is rejected.
- A synthetic lost response after an actual committed approval returns an unknown-outcome problem. Explicit retry with the same operation ID returns the original successful receipt and creates no duplicate review audit event.
- Approval unlocks current owner workspace access. Merchant status remains `applied`, accepting orders remains false and the response reports accepting work as false. Rejection blocks setup and operational access.
- The managed detail excludes a saved private bank account. A legacy merchant yields a valid false managed lookup. A database close/reopen preserves the exact approved snapshot and replay receipt.

The unit cases also cover request body bounds, invalid/overposted decisions, page actor changes, unsupported origin/media/encoding, safe database error mapping, finite authentication/write/read deadlines, cancellation, late results, response identity mismatches and malformed queue/detail data. Failures never become empty-success or confirmed decisions.

## Remaining acceptance boundary

Synthetic Auth claims and session rows do not establish live Supabase Auth, cookie refresh behavior, deployed schema, browser integration or a production approval. Apply the compatible migration and exercise those paths in the intended configured environment before rollout. The existing managed-entry gate remains unchanged. The separate middleware and UI evidence belongs to their focused checks.

Admin workspace dependencies and transpilation include the existing contracts and booking configuration packages plus Zod. The lockfile's admin importer records these declarations. Local missing package links were restored using junctions to existing workspace packages and the existing Zod module; no dependencies were downloaded.
