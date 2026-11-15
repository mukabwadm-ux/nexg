# Native Explore checkout

## Retail payment

1. **Objective** — Let an authenticated customer pay for an existing order from Expo and see the recorded outcome in the app.
2. **Scope** — Native M-Pesa start and status for an existing shared-services order.
3. **Dependencies** — Supabase Auth, order and payment RPCs, Daraja setup, callback proof and payment worker.
4. **Architecture** — Shared services own order and payment state. Expo uses the scoped customer API. Daraja callbacks and the settlement worker own provider evidence.
5. **Existing contracts** — Reuse `rpc_payment_begin_order`, payment authorization, prompt records and settlement.
6. **New contract** — `POST` and `GET /api/customer/checkout/orders/{id}/payment`. Requests require `Authorization: Bearer <customer access token>`. POST takes `{ "method": "mpesa_stk", "phone": "0712345678" }`. Both return `status` of `unpaid`, `pending`, `failed` or `paid`. A payment reference and retry delay may be present. Errors use Problem Details.
7. **Entities** — Existing order, guest, payment and M-Pesa prompt. Add a dispatch claim time to an existing payment.
8. **Database** — Add and serialize the prompt dispatch claim. Preserve existing settlement transitions.
9. **APIs** — Add the native customer route. The shared website route continues to call the same dispatch helper.
10. **Commands** — The payment owner calculates the amount and starts the payment. The native request supplies a phone number and existing order ID.
11. **Events** — Use existing outbound prompt audit and settlement events.
12. **States** — Unpaid before an attempt, pending during dispatch or unresolved provider state, failed after an authoritative failure, paid after retained settlement.
13. **Capability** — M-Pesa on the native retail checkout.
14. **Authorization** — Verify the bearer token, require the order's guest to be the authenticated subject, and keep RLS on reads and writes. The provider secret is server-side.
15. **Offline** — No offline starts. Resume by reading the order's status.
16. **Synchronization** — A database dispatch claim serializes overlapping requests. Late callbacks use the existing durable provider prompt records.
17. **Hardware** — The customer's M-Pesa phone confirms the PIN with Safaricom.
18. **Integration** — Expo can read the result without a website session. A production rollout needs the migration, shared-services release and Expo release in that order.
19. **Application** — The existing native checkout collects the phone number and displays the payment state.
20. **Security** — Owner isolation before any command, private provider credentials, only a customer-safe reference and outcome in the response.
21. **Observability** — Existing payment and provider audit records remain the source for operations.
22. **Testing** — Exercise authorization, state mapping, concurrent dispatch, ambiguous starts and callback settlement without issuing a live prompt.
23. **CI** — Run web type and unit checks, SQL checks and existing payment regressions.
24. **Migration** — Apply the additive shared-services migration before code calls the claim RPC.
25. **Rollback** — Revert the route and shared helper while retaining payment and provider history.
26. **Documentation** — Record contract, verification and remaining service dependencies here.
27. **Deliverable** — Authenticated API, serialized dispatch and verification.
28. **Acceptance** — A customer can start only their own eligible order, concurrent requests share a dispatch, and status reflects backend evidence.
29. **Failure modes** — Invalid or expired token, ineligible order, absent provider setup, cooldown, ambiguous dispatch and provider refusal each preserve the order.
30. **Risk** — Only known explicit customer actions can start a prompt. Report unresolved state until existing reconciliation resolves it.
31. **ADR** — None. The route uses the existing owner, provider and durable payment records.
32. **Exit** — Shared services and Expo can use the contract and verification records state what ran.
33. **Decision** — Reuse Expo checkout. Retail payment uses the existing provider rather than the NexG website payment page.
34. **Subphases** — Validate the existing owner contract, implement and test the route, then verify integration and deployment.

## Plan review

`POST /api/customer/checkout/plans/quote` checks the signed-in customer’s stop IDs against the Booking engine public catalog. Customers choose the published offering in their app. The route checks the exact date, time and quantity before returning a binding source quote. Missing times, unconfirmed slots and unpriced stops stay unavailable. A total is supplied only when each requested stop has a valid KES quote.

The Booking engine records payment evidence on individual bookings. A plan does not yet have a backend operation for creating a group of holds and allocating a customer payment across the corresponding merchants. The quote route performs reads only.

The native retail route requires the shared Supabase dispatch-claim migration followed by publication of the shared customer API on its Vercel deployment. Run the checkout and dispatch tests before publishing. Existing customer app screens use the API and continue to defer final payment state to the provider-backed record.
