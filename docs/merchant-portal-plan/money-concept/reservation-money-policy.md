# Reservation fees, advances, cancellation charges and guarantees

Design amendment,31 October2026. The Money plan supports money attached to actual reservations across applicable offerings, including services, tables/spaces, events, tours and rentals. A vehicle category is not the eligibility rule. These are composable components, not mutually exclusive portal modes. One reservation can have an advance, a separate booking fee, a conditional cancellation charge and an independent guarantee. Each component has its own trigger and refundability.

| Actual policy | Money treatment |
| --- | --- |
| No reservation money | Ordinary transaction view; no booking-fee, cancellation-charge or guarantee controls appear. |
| Separate booking/reservation fee | A declared charge may remain payable whether the customer attends or cancels, when the exact accepted policy says so. It is not charged twice or automatically classified as earned revenue. |
| Advance toward the final bill | Credit the accepted bill once. Cancellation can produce an eligible refund, posted charge allocation or separately accepted customer credit under that policy. |
| Cancellation/no-show charge only | A matched, confirmed event and accepted conditions may produce an assessment, then an owner-issued amount due. Collection is a separate authorized and confirmed money operation. |
| Refundable reservation guarantee | Use protected-funds/security components when the actual policy and owner support collected guarantees or payment authorizations. This is possible beyond vehicle rentals. Ordinary fees and advances remain distinct. |

A missing refund policy and an explicitly accepted non-refundable term are different states. Missing terms never create a penalty, permission to retain funds or automatic refund. Keep existing confirmed receipts/refunds visible and mark only the policy-dependent decision as unresolved.

Policies must state the applicable cancellation actor, reason, timing, confirmed no-show evidence, fee amount/basis, inclusion in price, refund/credit treatment and supported exceptions. Do not infer a no-show from the clock or apply customer cancellation penalties to a merchant cancellation by default. Existing bookings retain their accepted policy version.

Example under an explicitly defined sample policy: a customer paid KES500 in advance. The financial owner issues/posts a valid KES300 cancellation charge and confirms an allocation of KES300 from that same advance against it. The service was not yet invoiced in this example; an existing issued service invoice would need the issuer’s appropriate correction/credit before resolving the balance. The remaining KES200 is eligible for return or separately accepted credit. Do not charge another KES300. Refund eligibility, a submitted refund and a confirmed refund remain separate states. Customer credit is never substituted automatically. An unknown refund or credit also blocks an alternative refund/credit against the same KES200 until reconciliation.

The Booking payments section and its stats are conditional. A confirmed booking-fee collection uses the proposed collections measure filtered to its owner-confirmed money kind. Cancellation debt uses the compatible issuer's classified invoice/receivable; an unbilled assessment is excluded. Cancellation collections need confirmed payment. Do not repurpose the existing finance_fees measure for merchant booking fees.

The machine-readable contract, states and RM01–RM10 design cases are in reservation-money-policy.json. This amendment changes planning only. It does not add onboarding fields, activate a charge, connect a provider, change existing bookings or require more concept images.
