# Merchant backend foundation

Date: 2 November 2026, Africa/Nairobi. Active implementation root: `C:\Users\limta\Desktop\MERCHANT WORKSPACE`. Reference `C:\Users\limta\Desktop\Derrick NexG` was not edited. Source branch remains `codex/booking-engine-calendar`, with extensive pre-existing shared work preserved.

The user supplied the merchant backend integration prompt and requested implementation with best practices. Later direction confirmed vendor-neutral readiness for Odoo, QuickBooks and other systems, rather than choosing a single ERP. Existing short entry, Home task design, approval lock and email-OTP-last sequencing remain authoritative.

Phase 5 superseding update, 2 November 2026: the saved Home owner-source projection and managed shell described as next work below are now locally implemented and verified, with onboarding-only demo entry and rejected-decision recovery. Read the [Phase 5 handoff](2026-11-02-onboarding-real-journey.md) and [acceptance record](../../merchant-portal-plan/onboarding-integration/phase-5-acceptance.md) for the current boundary. The existing port 3000 endpoint responds with real registration deliberately feature-disabled. Configured Auth/PostgREST, storage and deployment acceptance remain open. The remainder of this handoff preserves the Phase 4 record.

## Current boundary

Local code is implemented and focused checks pass. Full connected Phase 4 acceptance remains open at the real Supabase/staging boundary. No linked authorized deployment target or remote migration history was available; no production, provider or full portal/admin/backend service was started. The existing isolated Vite preview remains at `http://127.0.0.1:5181/`. Connected `/merchants/register` uses a real non-anonymous existing Supabase session and is disabled by default through `MERCHANT_ONBOARDING_V1_ENABLED=false`.

[Rollout and acceptance record](../../merchant-portal-plan/onboarding-integration/phase-4-rollout.md) contains the field/operation ownership map, exact main file paths, numeric configuration, test commands and evidence, deployment/cutover/rollback instructions and outstanding acceptance. Read it before editing or deploying.

Implemented: strict basic capture and separate private payouts; additive application/snapshot/operation/session/access SQL; atomic merchant+owner and revision/idempotency guards; scoped staff review independent of publication; old resume-token isolation; owner/server action/storage-client access guards; SDK refresh/cross-tab/account-switch invalidation and authority polling; shared PostgreSQL API budgets; database credential issuance hardening; non-mutating booking reads; typed vendor-neutral connector policies. Payout identifiers retain zeros and references accept letters. No provider credential, payment verification, active ERP, webhook worker or production success is invented.

## Verification

- Actual new application migration: 120 isolated PostgreSQL/PGlite checks.
- Actual integration migration: 49 isolated SQL assertions; 12 API boundary tests and API typecheck.
- Shared connector foundation: 30 tests, API/contracts typechecks and scoped lint.
- Web access: recorded 115 covered tests; final actor helper file passed 5 tests including the additional pre-hydration logout case. Reuse unchanged evidence; do not rerun all tests.
- Root transport/capture bridge: 12 original checks; only 8 changed transport checks rerun for Retry-After, with 4 unchanged capture/payout checks reused. Capture 17 and Home projection 10 passed after their code changed.
- Preview browser: 4 journeys, no page errors/server writes. Explicit connected-control fixture passed with mocked callbacks, not remote persistence.
- Scoped root TypeScript and isolated form build passed. Non-failing chunk advisory remains.
- Booking reader owner: real SQLite/HTTP snapshots and reopen test passed, 5/5 reported including parent + four cases; scoped engine typecheck/format passed. Reads no longer create workspaces or persist expiration; commands retain cleanup ownership.

The first pending-header browser check found hidden progress; component corrected before rerun. Root initial TypeScript exposed an overbroad cast; corrected. Independent final review found unsupported connected payout controls and a missed initial logout event; both corrected with targeted browser/unit checks. Agent evidence records corrected test expectations. Repeats followed changed covered implementation or test code; unchanged full suites were not rerun for reassurance.

## Next work

The user clarified that Derrick NexG is the whole platform and should guide integration. Both folders point to the same `mukabwadm-ux/nexg` repository; source hash checks confirmed the relevant legacy onboarding/readiness/API-auth migrations and local Supabase config match. Local project ID is `nexg`, not a known hosted reference. Derive test/deployment setup from the existing platform; do not ask the user to identify cloud internals or create a separate backend. Do not reset the existing platform database. Inspect actual schema/Auth/grants and rehearse migration/API cutover before enabling connected entry. Migration 002 closes an unsafe public old limiter RPC, so the prior server binary is not compatible across that cutover; public v1 HTTP compatibility alone is insufficient. Follow the controlled release instructions and preserve data on rollback.

Complete real Auth/PostgREST/two-tab and independent-connection concurrency acceptance, private storage/object/content/scan controls, actual query/pool/timeouts and operational monitoring. Phase 5 still owns the complete Home projections of committed catalogue/location/hour/document data and the final authenticated workspace source/shell integration. Phase 6 owns reviewer UI, Phase 7 verified activation/readiness, and Phase 8 email OTP/business-person presentation. The new-flow activation gate stays closed until its owner work is accepted.

Odoo/QuickBooks and other systems can use the shared adapter boundary, but none is connected. Each provider still requires actual adapter, per-data-class authority, durable machine grants/mappings/checkpoints, delivery/reconciliation, safe dispatch and sandbox/production acceptance. Do not treat passing pure connector tests as an operational ERP connection.

Skills used: NEXG contracts, phase loop and integration adapter; backend development; code review; behavior-focused verification/prove-it-works; unslop. Multi-agent scopes were SQL, API security, web access, connector contracts, independent bridge review and booking read ownership. Rate-limit interruptions were reduced by fresh narrow contexts. No user-owned chats were messaged.

Phase 6 admin review is implemented locally in the existing console; see [Phase 6 acceptance](../../merchant-portal-plan/onboarding-integration/phase-6-acceptance.md). The existing platform endpoint responds with new registration still feature-disabled pending configured Auth/schema acceptance. The local saved Home and staff review contracts do not claim an activated deployed merchant service. Phase 7 activation and final email OTP remain open.
