# NEXG booking runtime

This is the private Payload Reserve 4.4.2 / Payload 3.86.0 booking host. It is separate from the existing React 18 portal. The portal accesses it through a server-only signed bridge; no Payload admin, generated REST CRUD or database credential is exposed to a browser.

## Run locally

Set the same `BOOKING_BRIDGE_SECRET` in this runtime and the web app, then run `pnpm --filter @nexg/booking-engine dev`. The default port is 3003 and the host is loopback only. Local persistence is a dedicated SQLite file under `.data`, not the merchant portal database. There is no Google account requirement.

SQLite explicitly enables `transactionOptions: {}`. The runtime serializes whole SQLite write commands to avoid the documented adapter contention/underfill behavior. The real Payload transaction and Reserve resource-lock/conflict hooks remain active. PostgreSQL commands additionally serialize on the business row. Production startup is deliberately disabled until the same concurrency suite is verified against the deployment PostgreSQL database; development SQLite is the verified target. Automatic PostgreSQL schema push requires an explicit development flag.

## Contracts

The bridge supplies a base64url JSON `x-nexg-booking-context` containing business ID, user ID, role and expiry, signed with HMAC SHA-256 in the hex `x-nexg-booking-signature` header. Sessions expire within five minutes. Branch scopes are applied server-side. Neither body tenant IDs nor client readiness flags are accepted.

All domain mutations require `Idempotency-Key`; trusted bootstrap is initial-only. Public create keys must be secure UUIDs. Operation caches bind actor, role and branch scope; customer mutation capability is verified before a cached response. Reuse with a different request body is a conflict. Booking changes require `expectedVersion`. Generated numeric persistence keys are mapped to opaque public UUID identifiers. Dates must include a UTC offset; business display and recurring schedules use Africa/Nairobi. Native prices are integer KES minor units. Quantity is an integer in the resource's explicitly declared scale and unit; it is not implicitly a guest count for storage or freight.

The core routes are `/v1/workspace`, `/v1/configuration`, `/v1/resources`, `/v1/offerings`, `/v1/availability`, `/v1/bookings`, and `/v1/bookings/:id/{confirm,accept,start,cancel,complete,reschedule,check_out,check_in,return,release,record_payment,record_refund}`. Published customer booking uses `/v1/public/:businessId/{catalog,availability,bookings}`. Customer booking responses include a private token; later retrieval/change requires its matching `x-booking-customer-token`. Only the token hash is stored.

Requests, quotes, orders and entitlement work are not stored as blocking pending reservations. Actual reservations and holds use Payload Reserve's collections, hooks and transactions. Source-authoritative requests remain pending until a real adapter confirms them. No unavailable ERP or payment adapter is represented as connected. Google is optional and begins disconnected.

Audit and outbox records are persisted in the same transaction as changes. The outbox contains committed work for a configured delivery adapter, not proof that an email, payment or Google operation has happened. Production notification and payment providers require their own authorization and operation reconciliation.

## Native behavior and guarded workflows

The reconciled registry covers all 128 onboarding subcategories. Configuration coverage does not mean every specialty execution adapter exists.

- Appointments reserve actual eligible resources or the complete required bundle.
- Customer visits require supported customer area/address and conservative configured travel buffers.
- Transfers jointly require an eligible vehicle and driver, actual pickup/dropoff details and passenger capacity; greeter-only work requires the greeter and meeting point.
- Asset intervals and storage support real ranges and explicit custody. Table/space reservations require an actual fitting space or an approved combination and turnover time. Scheduled end alone never releases an in-use physical resource; overdue custody blocks reuse until actual return/release evidence.
- Sessions and events require merchant-published dated occurrences. Shared instructor/room allocation happens once; attendee holds and reservations consume the minimum of occurrence, offering and pool capacity. Arbitrary customer-submitted class times are rejected.
- Orders, quote inquiries and service-job requests use a nonblocking request queue.
- Typed specialist setup enables native workflows for private/shared tours, firm or assessment-based collection/processing/return, production workload and due promises, membership access/credits, freight with independent cargo dimensions, and queue or scheduled service jobs with diagnosis, parts and quality stages. Review/approval and actual supplier evidence precede atomic role commitments. Each parent work item retains its accepted typed contract; actual role allocations use Payload Reserve and appear separately on the calendar.
- Service jobs explicitly distinguish a queue, an intake appointment and scheduled work. Actual diagnosis/work claims occupy only their bay/team until real release; merchant-held customer goods use a separate holding resource until actual handover. A completion promise does not extend a calendar appointment or prove work complete.
- Membership activation does not reserve a trainer or venue. An authorized, in-validity redemption debits the exact credit ledger and creates the actual scoped child booking in one transaction. Failed capacity claims roll back the debit. Explicit cancellation policy controls one-time credit restoration.
- Production uses real measured capacity claims and specification/quality stages; freight uses actual route legs, documents/clearance prerequisites and custody milestones. Neither a due date nor a weight figure becomes an invented guest appointment.
- A specialist offering without complete typed setup, or whose data is owned by another system, remains `executionMode:request_capture`. Missing provider evidence never becomes a local confirmation.

Resource/offer edits preserve accepted work and require optimistic versions. Closures represent actual unavailability and reject conflicts with existing commitments. Session occurrence create/publish/revise uses `POST /v1/offerings/:id/occurrences`; `GET /v1/workspace` and the published catalogue expose their exact dates.

Rescheduling uses the existing-booking quote at `POST /v1/bookings/:id/quote` (or its public booking counterpart with the private customer token). The generic quote remains for new work.

Each booking retains a private accepted-configuration snapshot. Later onboarding, specialty or authority changes govern new work; existing confirmation and rescheduling retain the accepted setup. The snapshot is omitted from merchant and customer booking responses. Public catalogue and availability responses also omit onboarding diagnostics, raw operational setup and private resource bundles; only explicit customer choices expose eligible resource names. Legacy rows without a snapshot can reuse current setup only when the recorded revision still matches; otherwise a reviewed migration is required.

## Pricing and reservation fees

Pricing explicitly selects per booking, measured quantity, rounded duration units, Kenya local nights or an indicative quote. Measured quantities honor their declared scale; money is always exact integer KES minor units. `POST /v1/quote` and its public counterpart return service subtotal, reservation fee, total, due-now and remaining balance. `expectedTotalMinor` prevents stale-price confirmation.

Reservation fees can be absent, fixed or an exact basis-point percentage, additional or credited toward the service total. Accepted fee, refund terms, versioned policies and pricing basis are snapshotted on the booking. A required fee creates a hold. Only an owner can record actual manual collection evidence (method, receipt/reference, amount and evidence); the record says `merchant_asserted`, never provider-verified. Confirmation requires the exact accepted collection obligation. Cancellation/expiry with collected funds creates a refund-review state; recording a manual refund likewise requires explicit evidence and never transfers money automatically.

Merchant-issued specialist quote proposals specify an exact scope version and integer subtotal; fee totals are recalculated, earlier approval is invalidated, and collected or committed work cannot be silently repriced. Progress uses `POST /v1/bookings/:id/workflow` with an optimistic version and an explicit command.

Externally owned availability, pricing or payment data requires source confirmation. Those customer offerings accept optional preferred times as nonblocking requests. A duration/night request without a complete period receives an explicitly indicative estimate with no collection obligation. Missing adapters do not imply free capacity, a binding price, collected funds or successful fulfillment.

## Verification

Run `pnpm --filter @nexg/booking-engine test` and `typecheck`. Tests use a separate disposable SQLite database and the real Payload Reserve conflict hooks. Never run destructive test resets against production data.
