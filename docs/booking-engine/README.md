# NEXG booking and calendar

The implementation lives in the existing merchant workspace. Customer marketplace discovery in the app and website remains untouched, as requested; the public booking page is a functional engine reference for testing. It uses an isolated Payload Reserve booking service, the reconciled onboarding configuration, and the existing merchant portal. Google Calendar is optional. Kenya entry and display use Africa/Nairobi; timed records retain exact UTC instants.

## Run and verify

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm booking:dev
pnpm booking:verify
```

The development launcher uses its own persistent SQLite booking database at `.booking-local/booking.db` and local secrets. It starts the private service on loopback port 3003 and a separate portal development process on port 3004. It checks both ports before starting and does not stop an existing server. If this checkout already has cached Manrope font files, the isolated development process reuses those actual bytes to avoid a Google Fonts network dependency.

- Local development workspace: `http://127.0.0.1:3004/booking-workspace`.
- Authenticated merchant workspace: `/merchant/calendar`.
- Published customer booking page: `/book/{businessId}`.
- Private readiness endpoint: `http://127.0.0.1:3003/health`.

The local workspace requires development mode, an explicit sandbox flag set by the launcher, and a loopback host. It is unavailable in production. The real merchant route uses the existing sign-in and merchant membership; configure the existing portal authentication environment and the same bridge secret in both services. The launcher never resets or migrates the existing merchant database.

`booking:verify` runs all four affected typechecks, configuration tests, optional Google adapter mock tests, real Payload Reserve/SQLite tests, and the portal bridge tests. It records actual command exit codes under the ignored `.booking-local/verification.json`. See [verification evidence](VERIFICATION.md) for the latest completed checks and their limits.

With the launcher running, `pnpm booking:acceptance` runs all three browser journeys sequentially. `pnpm booking:smoke` exercises the real merchant-to-customer browser journey and every calendar view. `pnpm booking:smoke:spaces` covers table capacity and a required reservation fee. `pnpm booking:smoke:workflows` covers all six specialist intake forms, scope acceptance, real commitments and membership-backed booking. These commands create clearly named local test resources/bookings. It requires Playwright's Chromium or the installed Windows Edge browser and writes screenshots/results under `.booking-local`. It rejects non-loopback targets. Cold dependency imports and the first development compilation can take several minutes on this machine.

## What merchants configure

Shared forms resolve the selected specialty, onboarding answers, fulfilment method, actual offering, resources, supported authority and versioned policies. All 128 source profiles and 323 canonical question schemas are included with provenance hashes. [Category coverage](CATEGORY_COVERAGE.md) lists every specialty and its eligible workflow models. A missing or contradictory setup is visible and cannot manufacture availability.

The calendar includes day, week, month, agenda and resource views, with filters and booking details. Resource capacity, weekly hours, buffers, temporary closures, party size and explicit resource selection determine bookable times. Tables and private spaces can be offered alongside orders and other services. Session customers choose actual merchant-published dated occurrences.

Customers use a published catalogue, get a server-calculated quote, book or request work, and manage their own booking with a private capability token. Holds, confirmed allocations, work requests and payments are separate facts. Failed native changes retain the prior allocation. Physical rental/storage/space occupancy requires explicit checkout/check-in and return/release evidence; a planned end time or generic completion cannot erase custody.

## Reservation fees

An offering can have no reservation fee, a fixed KES amount, or a percentage. A fee can count toward the service price or be added on top. Merchants configure whether collection is required before confirmation and state the refund terms. Quotes show the service subtotal, reservation fee, total, amount due now and remaining balance separately.

The implemented collection route records an owner's explicit manual payment/refund evidence and reference. It does not transfer money or claim verification from M-Pesa, a bank, or another provider. Accepted price and fee terms are retained with the booking. Provider payment collection and automatic refunds require a real payment adapter.

## Execution boundaries

The shared engine distinguishes resource reservations, operational workflows and ordinary requests. Appointments, field visits, asset intervals, transfers, published sessions, tables/spaces and storage allocate actual resources when their setup and supported policies are complete. Ordinary order and quote-request work has a nonblocking request lifecycle.

Typed native workflows also cover:

- Tours with a private itinerary or an actual published shared departure. Shared departures use one guide/resource anchor and a separate place pool.
- Collection, processing and return with separate role windows. Firm promises commit all required roles atomically; assessment work initially commits only the incoming role. Actual collection, receipt and return retain custody evidence. Customer drop-off and collection do not invent transport.
- Custom production with a versioned specification, accepted exact quote, measured workload, lead time, working days, Kenya cutoff, quality review and actual handover. A due promise is separate from an appointment.
- Memberships with exact validity, scope and typed credits or access-only rights. A covered service creates a real child reservation. Failed booking leaves credit unchanged; accepted cancellation rules control restoration.
- Freight with actual route legs, independent measured capacity dimensions, documents, applicable clearance and custody/handover milestones.
- Service jobs with an explicit queue, scheduled intake or scheduled work mode. Timed roles reserve actual bays/teams. Diagnosis, exact quote acceptance, declared parts evidence, quality review and handover follow the configured job policy. A requested completion time is separate from reserved work, and item holding uses separate actual capacity.

New or incomplete specialist setup remains visibly request-only. Private accepted configuration and scope stay with existing work. Versioned exact-price proposals require fresh scope acceptance; collected money or live capacity commitments prevent silent repricing.

External ERP, reservation, work, fulfilment or price owners require supported live adapters. Authorized manual supplier references are explicitly merchant-asserted evidence; only a trusted provider adapter can claim provider verification. Missing authority is not native confirmation. All 128 profiles being selectable is not a claim that 128 production merchant journeys have been validated.

SQLite is the verified local persistence target. PostgreSQL has a separate adapter and command-serialization boundary, but production startup remains gated until database-specific migration, concurrency and recovery verification has been performed. No production deployment was made by this build.

## Optional Google Calendar

The server-only [Google adapter package](../../packages/booking-google/README.md) includes OAuth helpers, encrypted token support, a separate secondary calendar, owned event projection and optional free/busy handling. Its tests use mock HTTP. A live account connection, token/nonce persistence, credentials, consent and the delivery worker are not configured here. NEXG remains the booking authority; a Google mirror does not reserve the same capacity again, and an unavailable source is unknown availability.

## Extending categories

Update the reconciled registry and onboarding taxonomy, bind the new category to implemented models and registered typed questions, then run `pnpm --filter @nexg/booking-config sync:plan`. The default source is the checked-in [reconciled plan](payload-reserve-plan/reconciliation/manifest.json); an explicit `NEXG_RECONCILED_PLAN_ROOT` can select another reviewed source. The generated package snapshots record hashes.

`registerBookingCategory` also validates declarative extensions and rejects duplicate identities, unregistered questions, executable rules and unimplemented models. New names alone cannot grant a workflow or permission. Reuse existing components and handlers where the meaning matches; introduce a model handler and its behavioural checks when the new category adds a genuinely different commitment.

Dependency notices are in [third-party components](../third-party/booking-components.md) and the portal's `/licenses/booking.txt`.
