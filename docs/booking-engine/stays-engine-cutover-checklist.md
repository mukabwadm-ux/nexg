# Stays: one-room Booking Engine cutover

**Not a deployment instruction for this PR.** The NexG-managed pilot is test-only. Never set a flag to take live bookings until all acceptance checks below pass. Existing Supabase paths, including [PR #148](https://github.com/mukabwadm-ux/nexg/pull/148), remain unchanged. Merchant-authoritative rooms keep using the merchant's authorized integration; neither this path nor Supabase should execute the same reservation for them.

## What must be fenced

The customer web booking action calls `rpc_stay_hold` directly, and PR #148 uses that RPC under its own quote/hold flow. The host workspace can use `rpc_stay_host_hold`, `rpc_stay_block`, `rpc_stay_upsert`, `rpc_stay_confirm`, and `rpc_stay_cancel`. See `supabase/migrations/20261118000100_stay_holds_and_blocks.sql` and the customer hold replacement in `20261122000100_sample_listings.sql`. The legacy payment path also has `rpc_payment_begin_stay` and the `payment_stay_settled` trigger in `20261119000200_stay_checkout.sql`. Audit the deployed versions, grants, background jobs, service-role paths, admin tools, and direct writes too.

One app or web flag is not a database fence. New legacy holds, blocks, bookings, and date changes must be denied for the exact physical unit at the authority boundary, including from host and service-role paths. Existing payment notifications must still be recorded against their original payment, even if the room is fenced; a late legacy payment must not create a second reservation or be refunded automatically by the new engine. Route it to reconciliation instead. Other rooms in the same property and merchant must be unaffected.

## Checks before authorizing a live pilot

1. Confirm the property, merchant and exact physical unit IDs in both systems, ownership, currency, capacity, check-in/out times, and timezone. Reject inferred mappings and unverified aliases; do not treat a whole merchant or property as a room.
2. Rehearse on an isolated database using synthetic inventory. Apply and verify the exact-room fence with two concurrent sessions: a legacy request starting before the cutover must finish and appear in the final inventory snapshot, or fail before writing. A new legacy request after the fence must fail, including host and direct service paths. With both systems stopped for this unit, snapshot active reservations, operational blocks, unexpired holds and pending payments. Reconcile or drain unresolved attempts before enabling the new writer.
3. Import remaining occupancy into Reserve without charging, recreating customer-facing reservations, or exposing private data. Reconcile expected counts, IDs, dates and overlaps. Hold both writers off if backfill or payment ownership cannot be proved. Validate adjacent stays end/start boundaries in local property time.
4. In the M-Pesa sandbox, confirm successful, declined, expired and delayed transactions, duplicate callback delivery, app restart during payment, and a timeout after the send. Prove that the same attempt cannot dispatch twice and that only authenticated provider evidence makes the booking confirmed. Unknown outcomes remain pending/reconciliation.
5. On the pilot app, check Discovery still resolves listing metadata independently. The exact room's dated availability must come from its authorized owner. The app must not switch to legacy availability or checkout when the engine is down, nor show a paid Activity row before verified confirmation. Try a different account and an unmapped second room.
6. Only after the above and operational approval, enable the Booking Engine for that one room while the legacy fence remains in force. Record the rollout versions, exact unit, named owner and reconciliation monitor. On rollback, stop new writes first and reconcile any authoritative holds, bookings and payment attempts before reopening legacy writes. Do not just flip routing backwards.

Neither the simulated PostgreSQL journey nor a green app test proves live cutover, a real room, or M-Pesa provider acceptance.


## Parallel Supabase handoff

PR #148 is not a prerequisite for this test-only engine PR. As of 17 November 2026, its draft rollout instructions name migration versions `20261220000100` and `20261220000200`, already assigned on main to Maps Route Budget and My Order Map. Do not apply either set based on this checklist. Before any Supabase rollout, the PR owner needs to compare applied migration history to the merged repository, reconcile unique ordered versions, and replay both the clean-install and upgrade paths. Production migration history was not inspected here.

Include a legacy quote issued before the fence and submitted afterward, and an already-held legacy attempt awaiting a payment callback. The stale quote must not produce a new hold; no new legacy prompt can start after the fence. Record genuine late settlement against the original attempt without assigning a second booking.
