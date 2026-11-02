# Phase 4 booking read verification

Date: 2 November 2026. Target: `C:\Users\limta\Desktop\MERCHANT WORKSPACE`. Local verification uses the installed Payload 3.86.0, Payload Reserve 4.4.2 and Node 24.21.0.

## Changed files and behavior

- `apps/booking-engine/src/engine.ts`: workspace, questions and merchant availability read an existing business. Missing storage returns HTTP 409 with `urn:nexg:booking:initialization_required`. They never create a placeholder workspace. Public catalogue/availability retain the unpublished HTTP 404 boundary. Existing PUT configuration and POST bootstrap still initialize through their existing owners.
- `apps/booking-engine/tests/booking.integration.test.ts`: one independently selectable test with four focused cases uses the existing real Payload/SQLite fixture and signed loopback HTTP server.
- This verification document.

The `server.ts` GET handlers were checked: health, profiles, questions, workspace, merchant/public availability, public catalogue and private customer booking. Workspace and availability no longer call hold expiration. The other GET dependencies perform reads only. No server route, web proxy, SQL, identity or dependency change was needed.

An elapsed hold is read as `status=expired`, with `holdExpired=true`, `persistedStatus=held` and its actual stored version. GET does not update the reservation, increment its version, write audit/outbox records or remove session rows. The existing explicit expiration method and booking commands retain transactional cleanup and audit ownership. No background task or timer was added.

Availability still calls Payload Reserve's installed `checkAvailability`. A request-local Payload reader excludes expired hold IDs and obsolete unpublished session anchors from that call's reservation query. Reserve continues to calculate resource/item occupancy, neighbor buffers and capacity. Session attendee counts use the same expiry cutoff. Published occurrence anchors and active holds remain blocking.

## Verification

Run from `apps/booking-engine`:

```powershell
pnpm exec tsc --noEmit
node --expose-gc --import tsx --test --test-name-pattern='booking GET reads preserve persisted business state' tests/booking.integration.test.ts
```

Typecheck passed. The focused test passed all four cases, reported by Node as five tests including the parent. The cases verify missing-workspace reads create nothing; explicit initialization succeeds; configured repeated GETs preserve stored data; expired holds release merchant/public availability without stored transitions; customer/workspace reads expose derived expiry; database reopen preserves the unchanged rows; a later booking command persists expiration and its audit once; Reserve retains confirmed neighbor buffers; and session capacity retains an active hold while excluding an expired one.

Snapshots compare all eleven existing business/booking collections, including schedules, customers, operation records, audit and outbox. The checks use actual persisted documents, not mocked engine calls. Payload printed its existing missing-email-adapter warning; the test invokes no email operation. The unchanged historical integration suite was not repeated.

## Limits

Availability remains an advisory read. Existing transactional commands decide final capacity and persist any expiration cleanup. Until a successful command or explicit expiration call, an elapsed hold can remain stored as `held`; GET reports its effective expiry without claiming a stored transition. This increment adds no periodic expiration worker.

The read adapter was verified against installed Reserve 4.4.2 and the existing SQLite owner. PostgreSQL/deployment concurrency, provider delivery and production acceptance were not exercised. Existing PostgreSQL production-write restrictions remain in place. No root launcher, external service or production database was used.
