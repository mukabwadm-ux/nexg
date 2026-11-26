# NexG-managed Stay room pilot: disabled readiness candidate

## Scope and current status

This is an additive Booking Engine candidate, not a replacement for the existing
Supabase Stay checkout in PR #148. It creates no live inventory and enables no
production room. Merchant-managed supplier integrations are outside this change.
No Supabase migrations or existing checkout RPCs are changed.

`publishStayInventory` binds one property/unit to exactly one exclusive room
resource and one `ASSET_INTERVAL`/`per_night` offering. It always writes
`pilotState: disabled`. The internal quote, availability, hold and confirmation
readiness paths reject disabled inventory. There is deliberately no production
enable switch or activation command. Only `NODE_ENV=test` with the explicit
`synthetic_fixture_enabled` marker is accepted by isolated fixture tests.

## Single writer and remaining cutover requirements

The Booking Engine uses its shared command transaction and actual Reserve room
allocation. This serializes native operations and prevents concurrent native
holds for overlapping accepted windows. It does **not** lock the existing
Supabase `unit`/Stay RPC writer or an external property-management system.

Before any future live-room activation, a separately reviewed implementation and
operator-approved plan must provide all of the following for the exact unit:

1. Verified merchant/property/unit/offering/resource identity and current owner.
2. An enforced legacy writer fence for that room, including public, merchant,
   administrative, scheduled and payment-settlement write paths. A UI feature
   flag or routing preference alone is not a writer fence.
3. A bounded snapshot and reconciliation of active holds, confirmed stays,
   pending provider payments, blocks and any external inventory obligations.
   Never drop accepted commitments or silently recreate a second reservation.
4. A recorded single authoritative owner and idempotent source-to-native mapping.
   Missing or mixed native/external authority must remain fail-closed.
5. Reviewed payment event ownership, amount/currency/reference binding, durable
   reconciliation and a non-resurrecting late-payment path. Simulated settlement
   tests do not prove real M-Pesa credentials, dispatch or callback operation.
6. A rollback plan that preserves commitments and keeps only one writer enabled.
   No automatic fallback from a failed native hold to the old RPC writer.
7. Exact-room staged verification, read-only reconciliation and explicit operator
   authorization before enabling traffic. This PR supplies no such authorization.

## Contract and safety boundaries

- Dates use Africa/Nairobi check-in/check-out policy. Accepted quote, party and
  room-only nightly total are persisted, not recomputed for payment display.
- Quotes are actor-bound and expire; quote ID is the hold operation/request ID.
  Replays return the same reservation, including its current expired state.
- Holds allocate the real exclusive room resource. Availability is advisory and
  uses a coherent read-only snapshot; the hold rechecks atomically.
- Generic booking creation/lifecycle cannot bypass the dedicated Stay path.
- Private status and Activity enforce actor ownership. Activity requires verified
  paid confirmation and exposes no fabricated property name/address or payment
  evidence. Observed unresolved funds remain blocked/pending, never retryable unpaid.
- No room activation, live payment, deployment, global Discovery/Activity switch,
  mobile session change or merchant-provider change is part of this candidate.

## Isolated verification

Core suites: `stays.integration.test.ts`, `stay-view.test.ts`,
`stay-pilot.test.ts`, `stay-activity.test.ts`. The shared `stay-fixture.ts`
provisions synthetic IDs and explicitly enables only the test fixture marker.
The PostgreSQL HTTP suite must use its guarded loopback disposable database and
two independent Payload/server connections. Never point it at production.

Run focused suites and `tsc --noEmit` on the scoped branch. Native race tests show
native locking only; they are not evidence of the outstanding legacy writer fence.
