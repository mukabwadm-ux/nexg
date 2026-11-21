# Native Stay M-Pesa seam: fixture only

This implementation is not a Daraja integration or an enabled payment method. It registers no route, callback, worker or provider client and changes no legacy Supabase writer. It requires all of: `NODE_ENV=test`, `enabled:true`, `environment:'fixture'`, `fixtureMarker:'synthetic-stay-mpesa-v1'`, and an injected fixture adapter. The real native Stay readiness helper additionally requires the synthetic inventory gate.

## Durable sequence

1. `prepareStayPaymentAttempt` accepts only the original authenticated customer, copies the accepted full KES amount, and atomically stores one attempt with an audit/outbox event.
2. `createStayMpesaPilot().dispatch` verifies the checkout authorization and claims that attempt transactionally before invoking the injected simulator. Only the invocation whose fresh claim token was committed may send. Replayed commands cannot authorize a second send.
3. An authenticated/correlated accepted response is stored with the original attempt, provider account, CheckoutRequestID and MerchantRequestID in one transaction. Acceptance means a prompt, not payment.
4. `reconcile` verifies evidence before finding the unique stored account/ID pair. The settlement receiver requires the exact observed amount/currency, original attempt and a still-valid native hold before confirming.

Only exact whole-shilling accepted amounts are dispatchable. No rounding or amount substitution is permitted. A successful STK status without actual amount evidence cannot be promoted to a verified payment.

## Unknown outcomes

- A timeout, unverifiable response, crash after claim, or failure to persist an accepted response does not release the claim or authorize another prompt. This is at-most-one send attempt, not exactly-once money movement.
- A lost CheckoutRequestID cannot be recovered by matching a phone number or amount. An unmatched verified callback is recorded for reconciliation, not attached to a guessed booking.
- A late accepted response is still durably bound, but payment after hold expiry is reconciliation, not inventory resurrection.
- Verified funds that cannot safely confirm persist `stayPaymentReconciliation.state=required`. No refund is promised or executed. No retry-confirm occurs until a separately authorized reconciliation process exists.
- Provider bodies, phone numbers, claim tokens and account/reference identifiers are not returned by the dispatch result.

## What is missing for an actual sandbox test

Local configuration inspection found only the repository example configuration, with empty consumer key/secret, passkey and callback secret. No populated local root/web environment configuration or inherited Daraja variables were found in the inspected checkout. This does not establish the state of any remote deployment.

The existing web Daraja helper supports sandbox configuration, but its Supabase initiation, callback, prompt replay and rounded amount contracts are not the native engine contract and are not wired here. Do not reuse them unchanged or bypass the fixture gates.

Before a separately approved real sandbox exercise:

1. Provision sandbox-only credentials/account/passkey in approved secret storage, with a known sandbox test phone. Never commit them or print their values.
2. Implement a separate sandbox-only authenticated provider adapter and isolated callback inbox. Keep live endpoints and live credentials unavailable to that test process.
3. Preserve original-attempt correlation and durable response IDs, including recovery/reconciliation for callback-before-response and lost-response cases.
4. Establish independent trusted provider/account evidence for the actual amount/currency and settlement. A callback payload, `ResultCode=0`, or requested quote amount alone is not that proof.
5. Run isolated database and callback fixtures first, then an explicitly approved sandbox transaction. Do not turn on production checkout while legacy reservation writers can target the same inventory.

No provider was invoked and no credential value was displayed during this work.
