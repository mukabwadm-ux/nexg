# Legacy Stays late-payment regression: local evidence only

16 November 2026. Owner direction is VPS as the reservation authority, including the Apple build. Existing live data is untouched.

## Reproduced defect

The actual `tg_payment_stay_settled` from `20261119000200_stay_checkout.sql` permits a `held` OR `cancelled` stay to become `booked` if no conflicting row exists in `public.stay`. It does not require an unexpired hold and cannot see a separate VPS reservation ledger. A fixture representing an independently VPS-owned interval remains confirmed while the expired legacy stay also becomes booked.

This is an actual SQL trigger reproduction in memory, not a claim that a live double booking occurred. The VPS table in the fixture is deliberately a minimal independent-ledger stand-in, not the deployed engine schema.

## Candidate, not a migration

`docs/candidates/stay-settlement-expiry-fence.sql` is explicitly UNAPPLIED and outside the migration chain. It allows confirmation only for currently held, unexpired, non-refund-due legacy inventory, retaining the existing local-overlap check. Other successful payments stay recorded as paid and enter the refund/reconciliation queue; existing refund timestamp is preserved on retry.

The script reads the real legacy function and produces this narrow replacement, rather than modifying historical migrations. No deploy, migration, server, provider call, real payment/refund or live reservation write happened.

## Critical limits

- This is NOT the ownership/cutover fence. An unexpired legacy hold still confirms alongside VPS occupancy. The regression explicitly proves this remaining failure.
- Expiry is evaluated at callback handling time. A customer who actually paid before expiry but whose callback arrived later would now be queued for refund/manual reconciliation. This is a customer-impacting behavior change and is not approved for production activation.
- The callback route forwards raw payload plus amount, receipt and phone; it does not establish a trusted per-intent provider settlement timestamp for this trigger. An illustrative provider_paid_at fixture field is ignored, just as the actual trigger ignores it. Raw payload TransactionDate alone must not be treated as an approved authority policy.
- Same-state paid retries do not fire the trigger. Forced pending-to-paid replay is additional defensive stress testing, not proof that the full production callback deduplication path permits that state transition.
- Need an explicit per-inventory authority/epoch cutover fence covering hold creation, confirmation, settlement, expiry/release and retries. Do not invent or activate it silently. Existing payment records still need durable accounting and reconciliation even when legacy booking confirmation is fenced.

## Evidence and boundaries

`scripts/check-stay-late-settlement.mjs` runs actual settlement, commission, occupancy and refund-recording functions in disposable in-memory PGlite. Reduced tables and staff/audit stubs are explicit. It is not full RLS/migration-chain/PostgreSQL concurrency/provider verification. Checks cover original expired/cancelled reconfirmation, valid pre-expiry candidate confirmation, expired and cancelled rejection, payment persistence, retry handling, existing refund reconciliation, delayed-pre-expiry-payment tradeoff and the still-open active-hold ownership gap. Final assertion count is reported by the coordinating agent.

## Explicit per-unit authority candidate (follow-up)

Final offline suite: **25/25 actual-SQL assertions passed**. Added `docs/candidates/stay-settlement-authority-fence.sql`, separately from the expiry heuristic. Both remain UNAPPLIED, outside migrations. No Consumer configuration, service or persistent database changed.

The candidate proposes two explicitly named candidate tables: one unit-to-authority/epoch record and one unique payment-ID reconciliation receipt. Missing or explicit legacy authority preserves the original legacy settlement semantics, including delayed success. Explicit VPS authority is checked after the existing unit lock and prevents new legacy confirmation even for an unexpired hold. The original payment stays recorded; no second payment/charge is created. Its exact amount/reference and observed authority epoch are captured once. Replays neither duplicate the receipt/audit nor confirm, even if authority is later switched back. Already-confirmed historical states are not silently cancelled; they require review. Existing `paid_kes`/reference summaries are not overwritten; the payment ledger and per-payment receipts, not those summaries, must drive reconciliation of multiple payments.

Proven new cases: explicit and absent legacy authority, unexpired VPS fence, exact receipt binding, normal and forced paid-transition replay, exactly-once reconciliation audit, authority-rollback replay, cancelled stay, actual refund-recording RPC followed by replay, and isolation from another unit's VPS fence. The existing 14 baseline/expiry-candidate cases still pass. This does not prove deployed callback behavior, multi-payment refund workflows, permissions/full migration chain or concurrent PostgreSQL cutover.

### This settlement check is NOT a full cutover

No authority-switch command is implemented. A coordinated transition must fence new legacy inventory writes, migrate/reconcile all occupied intervals, publish the correct VPS resource mapping and change every inventory reader. Missing authority rows deliberately mean legacy: inventory accidentally omitted from cutover would remain writable by legacy, so a complete reconciled unit manifest is mandatory.

Exact legacy surfaces identified in local migration source:
- `rpc_stay_hold` (latest definition `20261122000100_sample_listings.sql`): unit lock, occupancy validation, insert.
- `rpc_stay_host_hold`, `rpc_stay_block`, `rpc_stay_upsert`, `rpc_stay_confirm` (`20261118000100_stay_holds_and_blocks.sql`): unit-locked host/manual/import-source occupancy and confirmation paths. Existing updates must check both old and new unit if moving a stay.
- `fn_stay_release_expired_holds`, `rpc_stay_hold_release` (same migration): direct stay updates; must participate in authority/reconciliation rules rather than mutate VPS-owned inventory.
- Latest `rpc_stay_cancel`, `rpc_stay_refund_record` (`20261120000100_stay_refunds.sql`): cancellation/refund/reconciliation updates. Refund RPC locks stay then updates payment; it cannot simply be assumed to share trigger lock ordering.
- `rpc_payment_begin_stay` (`20261119000200_stay_checkout.sql`): unit then stay lock; starts payment and extends hold. Must not originate legacy intents for VPS-owned units.
- `rpc_native_stay_hold` / `rpc_native_stay_payment_begin` (`20261220000200_native_stay_checkout.sql`): checkout operation lock first, then unit and stay; wrappers must be fenced as well as underlying helpers.
- Payment-settlement trigger: payment row is already locked by UPDATE, then unit, then stay, then candidate authority read/receipt insert. No VPS database lock is acquired.
- Existing host/import writers, direct privileged writes and any synchronisation worker bypassing these RPCs must be audited before declaring the inventory fenced. No external importer compatibility is proven here.

### Locking protocol requirement, not an implemented transaction

Use the unit row as the shared legacy inventory serialization point: acquire relevant unit locks in sorted UUID order, inspect/change authority under that lock, and reject legacy occupancy writes after VPS ownership. The cutover must wait for prior unit-locked writers and verify the transferred inventory before enabling VPS allocation. Do not hold that database transaction while making an unbounded remote call.

There is currently no universal lock order: settlement starts with payment; native checkout starts with checkout operation; refund starts with stay. A cutover that takes unit then waits for payment can deadlock against settlement's payment-then-unit order. Therefore a reviewed admission/quiescence and reconciliation protocol is required; do not declare atomic cross-database cutover from this one trigger test. No speculative writer rewrites or dual-writing were added.
