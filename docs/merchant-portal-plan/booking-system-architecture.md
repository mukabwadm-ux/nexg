# End-to-end NEXG booking system

Date: 31 October 2026. Status: earlier architecture assessment, superseded by the user's selection of Payload Reserve and Kenya-only operation in the [current end-to-end plan](payload-reserve-plan/README.md). The common reservation, authority and reliability requirements below remain useful; the current package defines the selected foundation, all 128 mappings and implementation scope. Planning does not deploy a service or alter a database.

## Decision

Implement the NEXG booking module using Payload Reserve as the selected reservation foundation, with NEXG-owned extensions, a compatible booking runtime, merchant/customer interfaces and provider adapters as specified in the current plan. Use one shared implementation and transactional reservation owner rather than 128 separate engines. The calendar component receives permitted views and submits intended changes; it cannot confirm a reservation, grant permission or decide that a payment succeeded. Earlier option comparisons below are historical research, not the current selection.

NEXG-owned software does not mean NEXG owns every connected merchant's reservation truth. Declare the authority for offerings, capacity, reservations and payments separately. Existing ERP/booking systems can remain authoritative. A provider-controlled booking remains requested/pending until that authority confirms it. A mirrored Google event is not a second independent booking authority.

The existing [128 profiles](profiles-128.json), [onboarding configuration](onboarding-and-configuration.md), [workflow catalogue](workflow-catalogue.md), [Availability specification](screens/03-availability.md) and [integration contracts](integrations.md) remain the starting design. Preserve and refine them; they are proposed configuration, not demonstrated runtime capability.

## Why rethink the earlier recommendation

A calendar library comparison answers how to display and manipulate dates. It does not select an end-to-end reservation system. A no-fee dependency can still be expensive to adapt and operate. License permission, useful features and booking correctness are separate questions.

The target is full delivery: persistent customer and merchant journeys, authoritative availability, safe reservations, notifications, optional payments and Google integration, and reliable operation. Verification is part of delivering that system, not a separate trial product. Representative resource scenarios exercise the shared implementation, while all 128 configurations must have coverage before broad readiness is claimed.

## What must be delivered

| Area | Required behavior |
| --- | --- |
| Business and access | Private business calendars; branch, staff and resource views over the same bookings; tenant/location/role checks on every server query and action. |
| Versioned setup | Activities, offerings, fulfilment, timezone, exact duration/range, resource eligibility, capacity, lead time, horizon, buffers and policies. Missing required setup stays unresolved. |
| Availability | Business hours, staff shifts, breaks, holidays, maintenance, exceptions, recurring rules and external constraints; return available, unavailable, request-only or unknown with reasons and freshness. |
| Allocation | Exclusive assets; staff/room/equipment combinations; vehicle and driver; pooled inventory or session places; spaces; multi-day occupancy; linked pickup/return windows. |
| Booking lifecycle | Customer or merchant creation, requests and approval, holds, confirmation, assignment, changes, cancellation, completion and no-shows as supported by the enabled workflow. |
| Customer journey | Select offering/method/location, time or date range, resource preference and quantity where relevant, customer details, price/policy review, required payment, confirmation and self-service changes. |
| Merchant journey | Calendar and agenda, booking details, applicable commands, schedule/resource editors, visible conflicts and recovery, history and connection administration. |
| Money where applicable | Versioned price/currency/policy snapshots, configured deposit/prepayment or later-payment rules, payment-provider reconciliation and separate refund state. Payment success and booking success must not be conflated. |
| Communications | Confirmations, changes and reminders through configured channels; durable delivery with retries and duplicate protection. |
| Connections | Optional Google secondary calendar, opt-in busy-time constraints, existing ERP/booking adapters, explicit authority and discrepancy resolution. |
| Operations | Change history, pending operation visibility, reconciliation, monitoring, backups/restores, rate limits, secret handling and recoverable failures. |

## Shared models and category coverage

The engine exposes composable models rather than hardcoded industry names. Profile defaults plus actual onboarding and offering answers select the models and merchant vocabulary.

- Appointment: eligible people/rooms/equipment for a duration and buffers, including location and travel constraints.
- Interval asset: exclusive vehicle/equipment occupancy, handover/return, maintenance and exact date boundaries.
- Linked-resource work: reserve all needed resources together, such as a driver and vehicle.
- Capacity session: dated class/event with place quantities; valid holds and confirmations consume the same capacity.
- Space reservation: party size and compatible tables/spaces only when that capability is enabled.
- Multi-day itinerary: relevant resources, departure capacity and dated milestones; do not assume hotel inventory is controlled locally.
- Pickup/return: feasible paired windows and processing/transport constraints.
- Request/quote: acceptance and response workflow without pretending that a submitted request has reserved capacity.
- Storage, membership and workshop extensions: define storage unit/period and quantity, recurring entitlements versus actual reservations, and job/resource stages explicitly before enabling them.

Retail orders and administrative enquiries retain their proper workflows. Onboarding should not force irrelevant appointments. Multi-activity businesses share resource pools across their activities. A chauffeur rental stays a rental unless a separate transfer activity is configured.

Maintain a coverage record per current subcategory with selected capabilities, required questions, resource model, view, authority modes and valid lifecycle. For each record include normal and exception behavior and business-specific constraints. Adding a new category binds supported capabilities and their questions in one versioned publication; a novel capability requires implementation and acceptance evidence. The existing 128 proposed records are not sufficient evidence until mapped to real supported behavior.

## Core records and ownership

The design needs identities and contracts for business, location, membership/role, offering/version, person or physical resource, resource pool, schedule/rule/exception, booking, allocation/hold, customer/guest, price/policy snapshot, external mapping, operation, delivery task and change history. These are conceptual records, not an approved migration.

A booking references its owning authority, business/location, offering and configuration version, customer/guest, fulfilment, time or local date range, quantities, resource allocations, relevant price/policy snapshot and operation reference. Calendar entries are derived views of bookings and blocks, not a separate editable copy of booking truth.

Keep independent states for booking/request, resource allocation, payment/refund and synchronization. A confirmed booking may have pending notification; a completed payment may coexist with an expired hold and require recovery; neither case may be hidden behind one generic status.

Persist timed commitments as instants with the relevant IANA timezone for interpretation and recurring rules. Preserve local dates for all-day and date-only promises; do not silently convert them to arbitrary midnight instants. Define end-exclusive intervals, buffers, overnight spans, recurrence exceptions and daylight-saving behavior in the contract.

## Reservation correctness

1. Availability queries are advisory snapshots. A command rechecks current eligibility, capacity, permissions, policy and authority before reservation.
2. All NEXG-controlled allocations needed by a booking succeed or fail together in a transaction. Exclusive resource overlap is enforced in durable storage; pooled capacity uses a locking/transaction strategy that prevents two writers consuming the final place. An overlap constraint alone does not enforce capacity sums.
3. Temporary holds consume capacity, have a trusted expiration and are released safely. A browser timer cannot decide authoritative expiry. Late payment results and retried expiry work must reconcile rather than double-confirm or double-release.
4. Every mutation uses a stable idempotency reference and appropriate version checks. A timeout is an unknown outcome until looked up; blindly retrying must not create duplicate bookings or charges.
5. Reschedule reserves the new allocation and releases the old one safely. On failure, retain the original commitment. A closure or schedule edit previews affected work and never silently cancels it.
6. Persist booking changes and durable delivery/sync work together. Send notifications and provider requests through reliable processing with duplicate handling and reconciliation. External side effects are not assumed to be part of a local database transaction.
7. Where an external system controls a resource, use its confirmed hold/booking operation if supported. If it only offers a feed or free/busy lookup, show request-only or the declared constrained policy; do not promise global prevention of conflicts.

If the existing PostgreSQL persistence is retained, [range exclusion constraints](https://www.postgresql.org/docs/current/rangetypes.html#RANGETYPES-CONSTRAINT) are a suitable building block for exclusive resource/time overlap. [Transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html) and retry handling require deliberate design. This recommendation does not prescribe a new hosting provider, introduce a CMS or authorize database changes in this planning step.

## Google and existing merchant systems

Connect Google through a separate adapter and merchant consent. Prefer a distinct merchant-owned secondary calendar for NEXG event mirrors. Personal calendars are separate, with opt-in busy-time checks and minimum necessary data access. Specify field ownership, last confirmed freshness, connection permissions, disconnect/retention policy, incoming edit behavior, timezones and external IDs.

Use change notifications plus incremental synchronization and reconciliation; Google documents that [push notifications can be missed](https://developers.google.com/workspace/calendar/api/guides/push). Handle expired authorization, missing events, invalid sync tokens, rate limits, duplicate or reordered delivery and outages. A Google deletion or drag must not directly trigger a cancellation/refund without the booking owner's authorized workflow.

For each existing ERP/booking adapter, enumerate supported queries and commands before activation. Unsupported systems can be recorded and served through an appropriate manual/request workflow; do not claim universal API compatibility. Never use the newest timestamp as a substitute for declared ownership.

## Build and reuse assessment

| Candidate/approach | Role and evidence | Recommendation |
| --- | --- | --- |
| NEXG booking module in current platform | Can implement required resource models and integrate existing authority contracts without adopting a separate application's tenancy or data model; engineering and maintenance remain NEXG responsibilities. | Recommended architecture. Reuse established libraries for supporting concerns and implement the domain rules explicitly. |
| [Payload Reserve](https://github.com/elghaied/payload-reserve) | MIT; advertises resource allocations, capacity, configurable statuses, tenancy and transactional locking for supported adapters. Requires Payload CMS; external-busy resolver is documented as failing open on errors and Google sync is not included. | Strongest reviewed reusable engine candidate, but substantial integration and policy gaps remain. Do not introduce Payload merely for its feature list or treat its documented safeguards as independently proven in NEXG. |
| [Cal.diy](https://github.com/calcom/cal.diy) | MIT; maintainers recommend personal, non-production use and have removed team/organization/workflow features. | Reference material; not the recommended production foundation for this multi-merchant system. |
| [React Big Calendar](https://github.com/bigcalendar/react-big-calendar) | MIT React interface with resource support; does not establish suitability for NEXG's multi-day asset timeline, accessibility or booking correctness. | Leading UI candidate, not the booking engine decision. Require real delivery acceptance checks on its exact selected version. |
| [FullCalendar](https://fullcalendar.io/license) | Standard UI is MIT; advanced resource/timeline views have separate Premium terms. | Alternative interface if its capabilities and total ownership cost justify the terms. A strict no-purchase constraint excludes the commercially licensed Premium route. |

Evaluate tools against requirements before adoption: hard gates are commercial/redistribution rights, supported stack, business isolation, safe allocation, exact time behavior, required resource models, accessible interaction, integration ownership and maintainability. Record evidence as confirmed, partial or unverified. Do not assign invented scores or claim that a license or demo proves production fitness. Compare adaptation, maintenance and operation cost as well as license cost. An MIT component still requires preservation of notices and dependency checks.

No tool reviewed is established as satisfying the entire NEXG target. The recommendation is an engineering judgment from the requirements and verified product limitations, not a claim that custom development is always superior to buying.

## Delivery sequence and completion

1. Audit the actual working code and existing booking/auth/payment contracts, confirm the implementation checkout and avoid duplicate writers from concurrent chats. Convert the proposed capability mappings into a requirement/coverage register, with booking authority and exact rules. Establish realistic load, latency, recovery and retention targets from the expected business use; do not invent a capacity promise.
2. Implement persistent business-scoped configuration, records, command contracts, permission enforcement, availability calculation and transactional allocations. Build the calendar and customer/merchant flows against those contracts. Keep calendar rendering replaceable.
3. Implement the full applicable lifecycle: holds/approval/confirmation, optional configured payments, changes, cancellations, assignment and completion. Add durable notifications and change history. Address partial failure and reconciliation as part of these features.
4. Integrate Google and each explicitly supported merchant system with real authorization, mapping, synchronization and error handling. Add privacy and connection controls to the portal. Production credentials and account approvals are external deployment dependencies, not questionnaire values.
5. Complete integration, end-to-end, access, concurrency, time-boundary, accessibility, recovery and performance verification. Cover every enabled subcategory configuration and reusable scheduling model; exercise exception and hybrid cases in addition to normal paths.
6. Prepare deployment, monitoring, backups/restore, migration/cutover and rollback. Run a controlled production release with real operating procedures. Scope is complete only when the agreed real journeys work, required integrations are active and observable, and readiness evidence is recorded.

These are implementation dependencies within one end-to-end objective. A frontend demonstration, a picture, or an installed library is not completion.

### Essential acceptance evidence

- Two simultaneous attempts for the final place yield at most one confirmation; two overlapping reservations for one asset cannot both confirm.
- Vehicle and driver allocation is all-or-none. A resource shared between activities cannot be reserved independently twice.
- Cross-business and unauthorized staff access fails at the server, including exports and integration data.
- A failed reschedule preserves the original booking. Expired holds and late payment callbacks converge to the correct outcome without duplicate allocation or charge.
- Duplicate commands and reordered callbacks do not duplicate bookings, refunds or notifications; uncertain outcomes are reconcilable.
- Overnight, local date-only, multi-day, recurrence and timezone cases preserve the contracted meaning.
- Personal Google details stay outside the portal unless explicitly permitted; outages and revoked access are visible and do not fabricate availability.
- Each of the 128 profile records resolves to implemented supported behavior or an explicit non-booking/request-only mode with its proper wording. A new configured category reuses that behavior without a separate portal implementation.
- Keyboard and screen-reader users can inspect and manage permitted bookings without dragging. Mobile agenda, loading, empty, denied and recovery states are usable.
- Restore and sync recovery preserve booking/allocation identity and history. The actual deployment is monitored and operational ownership is documented.
