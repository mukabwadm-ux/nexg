# Booking verification

Date: 31 October 2026. Native runtime, shared configuration, portal and browser checks passed against the frozen source.

- Dependency installation completed successfully for all 12 workspace packages. The existing portal retains its separate Next/React versions.
- Shared configuration: 60 tests passed. These cover all 128 source profiles, 323 canonical schemas, all 15 model bindings, scoped actual facts, native specialist planning and service-job configuration.
- Optional Google adapter: 19 mock HTTP/security tests and its typecheck passed. No live account was connected.
- Runtime: 39 tests passed with natural exit 0. This includes 29 real Payload Reserve/SQLite lifecycle tests and 10 pricing/date tests. They exercise actual resource allocation, tenant/branch and private customer access, competing bookings, idempotency, failed changes and rollback, expiry, fees/refunds, table combinations and turnover, dated session/shared-tour capacity, physical custody, all six specialist models and durable reopen.
- Covered services: real tests verify atomic debit and failed-allocation rollback, own-customer tokens, pause/expiry, credit restoration, competing last-credit requests, exact zero-price rescheduling, retained accepted validity/duration, and synchronized parent redemption references.
- Role windows: persisted Reserve start/end timestamps are checked against accepted specialist role intervals. A requested job completion time does not extend a bay/team reservation. Actual unfinished work and held goods remain occupied after planned ends; separate holding capacity prevents parked items from unnecessarily holding the worker.
- Portal: 19 behaviour tests passed across the signed bridge, Kenya date/money handling, typed intake and actual role-calendar projection. The full existing web app typecheck passed; scoped lint covered 34 files with 0 errors and 0 warnings.
- The complete booking:verify command passed all 9 checks, covering four package typechecks, four test commands and portal lint. After the membership same-value selection correction, the web package passed its three checks again.
- Actual browser membership regression: repeated selection of the already-selected plan preserves readiness, name/email and the enabled submit button, then persists a booking with HTTP 201.
- Database close/reopen checks also passed on Windows Node 24.21.0 and 24.22.1. The corrected test teardown closes the primary client before reopening persisted storage and runs test-only collection after close. Earlier failing cleanup attempts are not treated as passing evidence.

## Browser acceptance

The repeatable command is pnpm booking:acceptance. It runs the loaded merchant calendar and customer booking/change/cancellation journey, the actual table plus required-fee journey, then all six typed specialist customer flows. These runs use labelled local fixtures, a real browser and real persisted outcomes. The final full replay passed all three journeys. It checked the fully loaded calendar in all five views, desktop and narrow screens, table capacity with a required reservation fee, all six specialist forms and actual commitments. The membership journey additionally created a covered child booking, opened it from the plan, rescheduled it at zero price, cancelled it, returned to the current plan and restored credit through merchant review. No browser runtime errors or document overflow were observed. Earlier partial or failing attempts are not counted as acceptance.

The complete nine-check run is preserved in .booking-local/final-all-checks.log. The verification.json file records the most recent run, including a package-only replay. Ignored local evidence is also written to .booking-local/verification.json, browser-suite-verification.json, browser-verification.json, spaces-browser-verification.json and workflow-browser-verification.json. Runtime detail is under apps/booking-engine/.data. Screenshots are also under .booking-local.

## Limits

The initial prototype database was preserved when the occurrence schema changed. The launcher owns .booking-local/booking.db and never reset the old .data/booking.db or the existing merchant database. PostgreSQL automatic production schema push is disabled and production startup is gated.

Configuration coverage is not production execution proof. Live PostgreSQL, real payment/ERP/messaging providers, live Google OAuth and all 128 production merchant journeys have not been verified. Customer app and website discovery integration remains untouched, as requested.
