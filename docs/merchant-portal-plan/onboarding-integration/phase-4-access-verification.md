# Phase 4 access verification

Date: 2 November 2026. Target: `C:\Users\limta\Desktop\MERCHANT WORKSPACE`. Local source verification only. No services, full suite, deployment or production changes were run.

## Implemented boundary

`loadMerchantWorkspaceAccess(client, merchantId)` calls `rpc_merchant_workspace_access(p_merchant_id)`. It accepts the database states `legacy`, `blocked`, `pending`, `approved`, `changes_requested` and `rejected`. Transport failures, errors, malformed flags, unknown states, stale approval and missing/expired new-flow deadlines fail closed. An approved operational result requires its current revision, approved review state and `needs_resubmission=false`. Legacy access is explicit database output, never a fallback after an error.

`requireMerchant()` defaults to operations. `requireMerchant({access:'setup'})` permits new-flow owner draft editing only when current merchant status is `applied`, `documents_pending` or `under_review`. `requireMerchant({access:'shell'})` permits setup or operations for the shared layout, Home and support. `requireMerchantSetup()` is the strict setup helper. Identity uses server `getUser`, rejects anonymous users, checks current owner/manager membership and binds any supplied merchant ID to the database-selected workspace.

`AuthorizedMerchant.userId` is the verified Supabase actor from that same server `getUser`. The layout binds this value to `MerchantAuthBoundary.actorId`. Shared `subscribeProtectedActor(client,actorId,onInvalid)` immediately stops requests and invalidates the old actor's view if any SDK event carries a different `session.user.id`, including `SIGNED_IN` without a preceding `SIGNED_OUT`. The merchant boundary hides the old children and performs a full sign-in navigation. Same-actor token refresh and repeated sign-in retain the authorized view. Listener cleanup discards late callbacks. This event handler grants no authority and creates no identity.

`merchantContext({setup:true})` loads a small setup shell rather than `merchant_home_v` when operations are unavailable. `merchantContext({draft:true})` uses the strict setup guard. Stores, hours, documents and menu use the existing owner editors with this setup access. Settings remains operations-only. The support page and ticket creation remain available to a permitted pending owner. All 29 exported merchant server actions guard their own entry. Object-only commands bind branch, invitation, featured booking, review or dispute IDs to the current workspace before the existing owner RPC. Direct catalogue writes and section selection retain the same merchant scope and report an unknown/foreign item rather than a false success.

Booking identity and Insights check workspace operations before loading operational source data. The booking route checks identity/access before bootstrap or forwarding. It no longer explicitly bootstraps on GET. Explicit bootstrap remains a same-origin POST.

Booking activation is a separate consumer guard. `merchantBookingWorkAllowed(identity,method,path)` uses private request-local WeakMap metadata established by `merchantBookingIdentity()`. For new applications, non-read booking work requires current `merchant.status='live'`; approved read access alone cannot create or transition bookings. Configuration, resources, offerings and explicit bootstrap remain available for draft setup. Explicit legacy work behavior is preserved. Unknown internal metadata cannot grant work mutation access. No additional identity claims are signed into the engine context.

The public booking proxy first calls `publicMerchantBookingAccess(request,businessId)`. It uses a fresh anon-key SDK client with no owner cookie/session and looks up the UUID in the existing `merchant_public` projection. That projection's database predicate requires merchant status `live`; anonymous users cannot read the private `merchant` table. Missing/unpublished merchants return 404, unavailable publication checks return 503, and neither forwards to the engine or issues a customer session. The sole non-UUID exception is the existing `local-booking-business` fixture with development mode, `NEXG_BOOKING_SANDBOX=1`, a loopback URL and no mismatching Host. Production and arbitrary non-UUID IDs have no bypass.

Installed packages were inspected locally: `@supabase/ssr` 0.5.2 and `@supabase/supabase-js` 2.47.10. Merchant middleware uses the SDK `getAll`/`setAll` contract and `getUser`; each refresh cookie reaches the downstream request and browser response, including multiple batches. Merchant responses are private/no-store. Existing QR scan payload, QR session/context cookies and printable-card behavior are preserved.

The same middleware SDK refresh and private/no-store headers cover `/sign-in`, `/auth/*` including the callback, merchant/rider sign-in aliases and password recovery/reset pages. Anonymous visitors continue through to those auth entries; middleware does not impose a merchant membership redirect there. Cookie deletion/refresh headers remain private and vary by Cookie.

The browser singleton receives SDK `SIGNED_OUT` events, including SDK cross-tab events. Logout uses SDK global sign-out and full navigation. Protected requests abort, clear registered command caches and reject buffered results from an earlier request generation. A failed sign-out permits a new explicit retry without reviving those results. Merchant document uploads require an existing non-anonymous authenticated user and database setup access; they do not create an anonymous replacement identity. They check the request generation before recording an uploaded document and before returning success.

The merchant auth boundary uses the database deadline. At that deadline it re-reads access so activity in another tab can extend the shared idle deadline. This re-read never records activity. A separate SDK access watcher rechecks on mount, focus and every 30 seconds while visible. It compares state/setup/operations with the server-authorized tree. Changed or malformed/unavailable authority hides and unmounts protected children, stops protected requests and refreshes the server tree. The watcher aborts its SDK read and discards late results on cleanup. A newly authorized server tree may resume new browser work; old request generations remain invalid. Trusted pointer/keyboard input invokes the separate `rpc_merchant_session_activity(p_merchant_id)`, throttled to once per five minutes. Focus, visibility and polling reads do not advance activity. Session identity remains Supabase Auth's `session_id`; the migration owns the 24-hour absolute and 8-hour idle policy. The boundary stops further browser work when the session ends. Explicit legacy access retains its database compatibility behavior.

## Commands and results

Run from `apps/web`:

```powershell
pnpm exec vitest run --config vitest.phase4.config.ts lib/merchant-access.test.ts lib/partner.phase4.test.ts lib/supabase/protected-request.test.ts lib/supabase/logout.test.ts middleware.phase4.test.ts app/merchant/actions.phase4.test.ts lib/booking/identity.phase4.test.ts app/api/merchant/booking/booking.phase4.test.ts lib/uploads.phase4.test.ts lib/merchant-insights.test.ts
```

Initial result: 10 files, 92 tests; 90 passed. Two newly written route assertions expected a `code` field. The existing booking problem response correctly uses RFC 7807 `type: urn:nexg:booking:*`. Corrected those assertions. Added a branch-ID tenant test while completing the object guards.

```powershell
pnpm exec vitest run --config vitest.phase4.config.ts app/merchant/actions.phase4.test.ts app/api/merchant/booking/booking.phase4.test.ts
```

Final affected-file result: 2 files passed, 35 tests passed, exit 0. The other 8 unchanged files had passed 58 tests in the initial run. Final covered set: 10 files and 93 passing tests across the focused runs. No unchanged historical test suite was repeated. Vitest printed its existing Vite CJS deprecation notice.

After the open-workspace revocation review:

```powershell
pnpm exec vitest run --config vitest.phase4.config.ts lib/merchant-workspace-watch.test.ts
```

Result: 1 file passed, 3 tests passed, exit 0. The tests cover visible-only polling, actual authority change, malformed access, abort and late-result discard without activity commands. Combined covered set: 11 files and 96 passing tests. Earlier unchanged files were not repeated.

After closing the booking consumer activation gap:

```powershell
pnpm exec vitest run --config vitest.phase4.config.ts lib/booking/identity.phase4.test.ts lib/booking/public-access.phase4.test.ts app/api/merchant/booking/booking.phase4.test.ts app/api/public/booking/public-booking.phase4.test.ts
```

Result: 4 files passed, 14 tests passed, exit 0. Source inspection then confirmed the public owner is `merchant_public`, since anon SELECT on `merchant` is explicitly revoked. The helper was corrected to that projection and only its 3 tests were repeated; all passed. Tests cover approved read access without work activation, retained draft operations, legacy compatibility, private metadata exclusion from signed claims, public publication failures, and development-only sandbox bounds. Combined current covered set: 13 files and 105 passing tests. No unchanged historical suite was repeated.

After binding browser cache invalidation to the verified actor and covering auth-entry cache headers:

```powershell
pnpm exec vitest run --config vitest.phase4.config.ts lib/supabase/protected-actor.test.ts middleware.phase4.test.ts lib/partner.phase4.test.ts
```

Result: 3 files passed, 19 tests passed, exit 0. This includes four actor-event behavior tests, six public auth-entry cache cases and the existing affected middleware/partner checks. Final scoped TypeScript check and owned tracked-file whitespace check again exited 0 with no diagnostics. Combined current covered set: 14 files and 115 passing tests. No other earlier tests were repeated.

```powershell
pnpm exec tsc -p tsconfig.phase4-access.json --noEmit --incremental false
```

Result: exit 0, no diagnostics. Earlier checks found unused destructured guard IDs and an oversized inferred Supabase return type; both were corrected. The helper now has an explicit return type. The scope includes the access/auth changes, action and API boundaries, real owner editor pages and their imported dependencies.

`git diff --check` on the owned tracked files passed with exit 0. New source/test files were inspected directly.

## Acceptance limits and owner follow-ups

- Tests execute the actual access/parser/action/route/watcher code with mocked Supabase/engine sources and the installed Next request/response implementation. They prove fail-closed responses, tenant filtering, request cancellation, visible-only polling and SDK event handling at these boundaries. They do not prove a real Auth refresh, two live browser tabs, actual trusted DOM input, remote revocation or database RLS acceptance. The React auth boundary activity/deadline wiring is source-reviewed and typechecked. Isolated SQL acceptance is tracked separately in `phase-4-sql-verification.md`. The SQL owner added and exercised the role-sensitive predicate: manager-to-cashier changes now return blocked/false access. The watcher consumes that decision rather than inventing role authority.
- Approval grants the database's current approved snapshot operational read scope. It does not publish a new application or permit activation/start-work commands. Phase 7 owns activation/readiness acceptance. Direct existing database RPCs remain database-owned and require their own migration authorization, beyond these Next server-action guards.
- The access audit found booking GET provisioning/expiry writes. A later scoped owner correction removed them and verified real SQLite snapshots/reload, explicit initialization and effective expired-hold capacity. See [booking read evidence](phase-4-booking-read-verification.md). This access audit itself did not change the engine; its earlier finding is closed by that separate evidence.
- The existing private `partner-documents` upload/`rpc_document_submit` owner remains authoritative. An SDK upload success is not proof that the server command validated storage-object completion, MIME/size or provider acceptance. That server/storage hardening and scan/verification acceptance remain explicit follow-ups. No selected File or upload response is relabeled as verified evidence.
- Existing stores/hours/documents/menu editors persist through their real owners. Home must project their committed rows and document states when claiming task completion. Unconnected Home task controls must not imply persistence. No booking, finance verification, credential or team owner was copied into application capture JSON.

No secrets, production services, live credentials or providers were used for these checks.
