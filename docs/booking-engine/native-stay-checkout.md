# Native stay checkout

The NEXG Stay and Consumer Expo apps use signed-in customer routes on the shared web backend. The existing native screens own review, guest details, M-Pesa, and confirmation. The backend uses the established Stay availability query, hold, payment, and settlement records.

All routes below live under `/api/customer/checkout/stays`. They require the caller's shared Supabase access token in `Authorization: Bearer <token>`. State is private and never cached.

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /quote` | `{propertyId, unitId, checkIn, checkOut, adults, children}` | `{quoteId, propertyId, unitId, checkIn, checkOut, adults, children, nights, expiresAt, currency, nightlyMinor, roomSubtotalMinor, taxesMinor, totalMinor, paymentMethods, termsText, cancellationText}` |
| `POST /holds` | `{quoteId, firstName}` and `Idempotency-Key` equal to `quoteId` | Checkout status |
| `POST /holds/{operationId}/payment` | `{method: "mpesa_stk", phone}` | Checkout status |
| `GET /holds/{operationId}` | The quote ID used as the operation ID | Checkout status |

Dates are calendar days in `YYYY-MM-DD`. An exact quote covers one unit and one party for ten minutes. It excludes samples and prices on request and makes no reservation. Amounts are KES minor units. The existing stay price has no separately added tax. The M-Pesa number is the payer's number and is separate from the guest first name.

Checkout status includes `{operationId, stayId, holdExpiresAt, currency, totalMinor, status, paymentStatus, refundDue, reference?}`. Stay status is `held`, `booked`, `expired`, `cancelled`, `in_stay`, or `departed`. Payment status is `unpaid`, `pending`, `failed`, or `paid`. Only backend booking status confirms the stay. The refund-due flag takes precedence over booking and payment copy.

Hold replay returns the operation's original stay. Rate and unit availability are checked again under the unit lock. Problem responses use `application/problem+json` and an explicit code. A pre-expiry `NOT_FOUND` from status can mean a hold request is still in flight. An expired quote with no committed hold yields `QUOTE_EXPIRED` from the serialized operation read. A changed price yields `PRICE_CHANGED`. A repeated key with a different guest name yields `OPERATION_CONFLICT`.

Payment initiation opens the backend's existing payment at the held amount. Only the transaction that creates an active attempt gets dispatch permission. A retry or a lost provider reply leaves the original attempt pending and can be checked with GET. GET can reconcile a recorded payment prompt, and it never sends another prompt. An expired attempt whose dispatch was never claimed resolves as failed. A claimed attempt missing a provider outcome remains pending for reconciliation. Enquiries remain separate from holds, charges, and confirmed stays.

## Rollout order

Apply Supabase migrations `20261220000100_mpesa_dispatch_claim.sql` and `20261220000200_native_stay_checkout.sql` to the shared customer Supabase project. The dispatch migration replaces the unshipped draft with the duplicate `20261213000100` prefix. Deploy the web routes after both migrations, then configure both mobile apps with the shared web origin. M-Pesa readiness requires the existing Daraja configuration and callback secret to match the database configuration.

Run the native stay checkout tests with isolated fixtures before rollout. Smoke-test production with public reads and unauthenticated rejection checks. Use an isolated booking database and test payment provider for the full transaction.
