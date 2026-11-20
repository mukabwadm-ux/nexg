# Native stay checkout

The NEXG Stay and Consumer Expo apps use customer routes on the shared web backend. The native screens own review, guest details, payment and confirmation. The backend uses the established Stay availability query, hold, payment and settlement records. Carried over from PR #148 in migration `20270123000100_native_stay_checkout.sql`.

All routes below live under `/api/customer/checkout/stays`. They require the caller's shared Supabase access token in `Authorization: Bearer <token>`: an account, or a temporary guest session (the hold needs the guest's first name). State is private and never cached.

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /quote` | `{propertyId, unitId, checkIn, checkOut, adults, children}` | `{quoteId, propertyId, unitId, checkIn, checkOut, adults, children, nights, expiresAt, currency, nightlyMinor, roomSubtotalMinor, taxesMinor, totalMinor, paymentMethods, termsText, cancellationText}` |
| `POST /holds` | `{quoteId, firstName}` and `Idempotency-Key` equal to `quoteId` | Checkout status |
| `POST /holds/{operationId}/payment` | `{method, phone}` | Not switched on yet: `503 PAYMENT_UNAVAILABLE` while the stay is held; the checkout status once it is pending or paid |
| `GET /holds/{operationId}` | The quote ID used as the operation ID | Checkout status |

Dates are calendar days in `YYYY-MM-DD`. An exact quote covers one unit and one party for ten minutes. It excludes samples and prices on request and makes no reservation. Amounts are KES minor units. The existing stay price has no separately added tax. The M-Pesa number is the payer's number and is separate from the guest first name.

Checkout status includes `{operationId, stayId, holdExpiresAt, currency, totalMinor, status, paymentStatus, refundDue, reference?}`. Stay status is `held`, `booked`, `expired`, `cancelled`, `in_stay`, or `departed`. Payment status is `unpaid`, `pending`, `failed`, or `paid`. Only backend booking status confirms the stay. The refund-due flag takes precedence over booking and payment copy.

Hold replay returns the operation's original stay. Rate and unit availability are checked again under the unit lock. Problem responses use `application/problem+json` and an explicit code. A pre-expiry `NOT_FOUND` from status can mean a hold request is still in flight. An expired quote with no committed hold yields `QUOTE_EXPIRED` from the serialized operation read. A changed price yields `PRICE_CHANGED`. A repeated key with a different guest name yields `OPERATION_CONFLICT`.

**Payment is not switched on yet.** Payments are being wired with Paystack, so `paymentMethods` in a quote is `[]` and the payment route answers `PAYMENT_UNAVAILABLE`. The hold waits for payment for 15 minutes, as every booking does (20270116000400), and the reservation code appears once paid. #148's M-Pesa dispatch claim is left out.

## Rollout order

1. Apply migration `20270123000100_native_stay_checkout.sql`.
2. Deploy the web routes.
3. Configure both mobile apps with the shared web origin.
4. When Paystack is wired, add the payment step behind `POST /holds/{operationId}/payment` and list the method in `paymentMethods`.
