# Booking engine handoff

Implementation: [booking README](../booking-engine/README.md). Evidence: [verification](../booking-engine/VERIFICATION.md). All category bindings: [128-subcategory coverage](../booking-engine/CATEGORY_COVERAGE.md).

The new work is in apps/booking-engine, packages/booking-config, packages/booking-google, the web booking API bridge, /merchant/calendar, /book/[businessId], /booking-workspace and the shared booking UI. Existing Home/sign-in work was preserved. The merchant shell gained a Calendar link; booking pages skip unrelated shopping location/support startup. The existing merchant database was not reset or migrated.

Customer discovery remains in the app and website marketplace. The user explicitly requested that discovery integration remain untouched. The current public booking page is a functional engine reference; connecting marketplace search, merchant pages and offering details is future work.

Run pnpm booking:dev. Local development uses ports 3003/3004 and .booking-local/booking.db. The earlier prototype .data database was preserved. Secrets, data, browser captures and transient logs are ignored by Git.

Run pnpm booking:verify for all four package typechecks, configuration/adapter/real-database/UI tests and scoped UI lint. Run pnpm booking:acceptance with the loopback development workspace running for all three browser journeys. They create clearly labelled local fixtures. Individual replays are booking:smoke, booking:smoke:spaces and booking:smoke:workflows. Cold development compilation on this machine can take several minutes.

The 128 onboarding profiles and 15 model types use one engine and shared renderer. Seven reservation models cover exact resources and capacity. Six operational models cover shared/private tours, linked collection/processing/return, production deadlines, memberships and credits, freight, and queue/scheduled service jobs. Orders and quote requests retain their separate nonblocking intake. Actual configured resources, exact units, source ownership and policies govern commitments. Missing setup cannot grant capacity.

Reservation fee choices, manual payment/refund evidence, table/space fitting and combinations, dated occurrences, closures and actual custody are included. Existing work retains private accepted configuration, scope and commercial terms. Price proposals require fresh acceptance. Closing new intake does not silently cancel or migrate existing obligations.

Open follow-through:

1. Verify dedicated PostgreSQL migrations, concurrent commands and recovery against the deployment database. Production startup remains gated until this evidence exists.
2. Connect actual ERP/reservation/payment and messaging owners using their supported contracts and credentials. Provider collection, automatic refunds and outbound notification delivery are not implemented by manual evidence or queued outbox records.
3. If Google is wanted, connect OAuth consent/callback persistence and the durable delivery worker to the optional adapter. Its HTTP/security tests use mocks. No live account is connected. Native booking is independent.
4. Validate complete merchant journeys for every subcategory and enabled variant using actual merchant setup and source systems. Registry closure and representative native tests do not establish 128 completed production journeys.
5. Plan and integrate the customer app and website discovery journey separately, as requested. Reuse this engine's authoritative configuration, availability, quotes and workflow contracts.

No deployment, live provider collection, outbound customer notification, production database change or Google account connection was performed.
