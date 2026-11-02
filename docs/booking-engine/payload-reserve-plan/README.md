# NEXG booking and calendar delivery plan

Date: 31 October 2026. Status: complete baseline planning package, implementation not started. User decisions: end-to-end booking/calendar delivery, Kenya-only operations, Payload Reserve as the selected foundation, shared configurable portals across all 21 categories and 128 subcategories, optional Google connection, and support for future categories.

This package supersedes the technology recommendation in [booking-system-architecture.md](../booking-system-architecture.md) and is the current booking/calendar plan. Preserve the existing eight-screen specifications and category inventory, but apply the semantic corrections in this package before turning their proposed defaults into runtime configuration. No software installation, live connector, migration or production verification is claimed by these documents.

The [onboarding/workflow reconciliation](reconciliation/README.md) is now the build entry point. Its [manifest](reconciliation/manifest.json) selects one effective question, profile, workflow and domain snapshot. Use those generated contracts for implementation; older source registries and prose-only triggers are historical inputs, not a second resolver. See the [reconciliation findings and checks](reconciliation/report.md).

## Deliverables and reading order

1. This end-to-end product, architecture and implementation plan.
2. [Upstream fit and adaptations](upstream-fit.md), tied to inspected Payload Reserve 4.4.2.
3. [Shared model definitions](models.json), [extension register](extensions.json) and [proposed question additions](question-additions.json).
4. [Every subcategory's booking plan](coverage-128.md) and [structured coverage records](coverage-128.json). Each row names its own needs, conditional behavior, setup and acceptance scenarios.
5. [Verification and release](verification-and-release.md). [Planning verification](verification.json) checks the artifact references and coverage; it does not certify working software.
6. [Commercial use inside paid portals](commercial-use.md), covering MIT permissions, notices and the distinction from paid services.

## Product decision and boundaries

Adopt Payload Reserve as the reusable reservation foundation and adapt it through supported configuration, collection overrides, hooks, component replacement and NEXG-owned extensions. Maintain a small, pinned fork only when a required correction cannot be implemented safely through those extension points. Keep upstream conflict and status protections enabled. Record each patch, reason, upstream version and regression evidence.

The private NEXG business calendar is the merchant workspace. A staff member, branch, room or vehicle has a permission-filtered view of shared commitments, not a copied calendar with a separate booking truth. One account can belong to multiple businesses without merging their data. Actual role and business grants determine what each person can see and do.

NEXG keeps its own portal and customer booking interface. Payload's admin is an implementation tool for authorized operators, not an automatic replacement for the merchant portal. Reuse its calendar primitives only across a compatible frontend boundary; use custom NEXG components where needed for design, mobile or operational fit. Its day resource lanes do not establish a complete multi-day rental timeline. A second calendar library is not a starting dependency.

Payload Reserve requires a Payload host. Plan one booking runtime inside the NEXG platform, behind NEXG's booking API/adapter, with a compatible Payload stack and its own migration ownership. The existing portal consumes contracts rather than importing an incompatible admin application. The inspected upstream uses newer Payload/Next/React versions than the previously inspected portal. Confirm actual workspace dependencies at implementation and do not silently upgrade the entire portal. Preserve existing identity and domain ownership; do not create a second unrelated merchant login system or move the whole ERP into Payload.

The intended boundary is: NEXG customer/merchant interfaces, NEXG-authorized booking commands and queries, the Payload reservation runtime plus NEXG extension collections in its transaction boundary, then independently authorized ERP/Google/payment/messaging adapters. The runtime owns local allocations when declared NEXG-authoritative. External-owned capacity is confirmed through that external authority. Read projections may combine data without granting new write rights.

## Kenya time and money

Set scheduling and display to `Africa/Nairobi`, labelled EAT when useful. Do not ask merchants to choose a timezone and do not add multi-country scheduling controls. All business and location configuration uses this platform value, including Payload's timezone fallback and tenant values. Google timestamps and imported timestamps are normalized for display in EAT.

Store timed commitments as UTC instants and retain the fixed business-zone rule for interpreting entered times. Keep date-only promises as dates. A rental from one local day to another, a 00:30 pickup, a late closing shift and a return after midnight still need exact boundaries. Specify half-open intervals and buffers; avoid approximating every day as a plugin full-day event ending at 23:59:59. Local recurrence follows the fixed Kenya zone. There is no merchant timezone setting or daylight-saving feature in scope.

Native commercial prices use KES with integer minor units, a declared pricing unit and a versioned quote. External systems may supply original amounts and units; do not silently convert or relabel a foreign source amount as KES. Specific payment rails are separately configured integrations. M-Pesa, card, bank or pay-later behavior must have a real supported adapter or declared manual reconciliation workflow before it is advertised.

## How onboarding configures the final portal

1. Reuse business identity, category and specialty answers, keeping the selected operating activities explicit.
2. Identify the actual offerings: product, service, rental, session, request, storage or another registered model. An offering chooses its model within the merchant's enabled activities.
3. Ask only applicable scheduling questions. Exact service duration, actual bookable resources, dated session capacity, occupancy unit or processing windows must replace broad marketing bands before reservations are allowed.
4. Establish intake: instant booking, merchant approval, enquiry/quote, walk-in only or a supported combination. Asking whether advance booking is mandatory is different from asking whether bookings are accepted.
5. Configure fulfilment and physical/remote/customer-location methods. Home service changes resources, coverage and travel requirements; it does not create a second task or charge by itself.
6. Configure recurring schedules, recurring orders and memberships/retainers separately. A recurring calendar series is not authority to charge a recurring payment.
7. Declare ownership and connect supported existing systems per relevant data class. Google is optional. A declaration that an existing reservation system is used does not enable NEXG bookings, grant access or authorize writing to that system.
8. Show a readable review of the resulting portal: work terminology and stages, offering fields, appropriate calendar view, resource and capacity rules, financial policy and relevant insights. Missing setup remains visible with a remedy. Publish an immutable configuration revision only after required setup and actual connector capability checks succeed.

Category answers select a suitable baseline, while actual operating answers and offerings determine the result. A salon can sell products alongside appointments. A rental firm can separately offer airport transfers. Retail can run orders without booking anything. One plugin runtime and one extension set serve these combinations; there are not 128 plugin installations or hand-built portals.

## Shared scheduling models

The 15 models are defined in [models.json](models.json). Every existing specialty gets an explicit coverage record.

| Model | Main behavior | Calendar/portal experience |
| --- | --- | --- |
| ORDER | Product purchase; no reservation by default | Order queue; opening hours and explicitly enabled fulfilment windows |
| APPOINTMENT | Duration plus eligible people/rooms/equipment | Staff/resource day/week and agenda, remote method where enabled |
| FIELD_VISIT | Team, customer location and travel-aware interval | Visit agenda and dispatch/resource lanes |
| ASSET_INTERVAL | Specific asset across exact start/end instants | Multi-day asset timeline, handover and return detail |
| TRANSFER | Pickup/route/time and jointly allocated resources | Trip agenda and vehicle/driver lanes; greeter-only variant |
| SESSION_CAPACITY | Dated occurrence and place quantities | Session calendar, remaining capacity and attendee/check-in view |
| SPACE_RESERVATION | Compatible table/space, party size and duration | Reservation calendar and resource/party detail |
| TOUR | Departure places or private interval, itinerary and suppliers | Departure calendar, multi-day itinerary and allocations |
| PRODUCTION_DUE | Approved specification, production capacity and due promise | Due/production schedule; linked delivery or fitting only if selected |
| REQUEST_QUOTE | Request, scope, quote and acceptance | Request queue and tentative milestones; no invented commitment |
| LINKED_WINDOWS | Feasible collection, processing and return | Paired-window agenda and turnaround detail |
| SERVICE_JOB | Walk-in/intake/workshop workflow with optional timed work | Job queue plus bay/technician calendar when enabled |
| ENTITLEMENT | Membership/retainer scope and validity | Access/plan view and separately booked sessions |
| FREIGHT | Cargo scope, quote, controlled transport and milestones | Shipment/leg schedule with declared units and source confirmation |
| STORAGE | Typed occupancy quantity and dates | Unit/pool occupancy timeline and distinct access visits |

## Reservation and lifecycle contracts

Use a common reservation status machine in Payload for occupancy, with separate NEXG work states per enabled model. Per-category workflow stages and cancellation policies are not 128 global Payload status-machine configurations. A quote, maintenance block, membership and ticket cannot be reduced to one generic appointment status.

Keep booking/request, allocations/holds, work fulfilment, payment/refund and synchronization states independent. Suggested public concepts are requested, awaiting approval, awaiting payment where required, confirmed, in progress, completed, cancelled, declined, expired and no-show when meaningful. The exact mapping must state which states consume which resource quantities. An unaccepted enquiry consumes no reservation capacity; a temporary hold does. Cancellation of a booking, release of capacity and a payment refund are related commands with separate confirmed outcomes.

NEXG's command layer checks tenant/branch membership, actor grant, offering/configuration revision, resource eligibility, exact time and quantity, intake rules, policy, source freshness and reservation authority on every path. Direct staff, admin, Local API and background work must not bypass these guards. Unconfigured schedules do not imply unlimited availability. Expose only the public data and commands needed through NEXG routes; close unrestricted generated collection CRUD.

For local reservations, one transaction takes or changes all allocations needed by a command. Rechecking slots in a browser or in an unprotected pre-save query is insufficient. Valid holds count against capacity and expire by trusted processing. A failed reschedule preserves the original reservation; a partial vehicle-plus-driver allocation is rolled back. Capacity changes preview existing obligations. A closure never silently cancels confirmed work.

Commands carry idempotency keys and expected revisions. Retried requests, timeouts, payment callbacks and duplicate webhooks converge on one outcome. Long-running external operations have an operation reference and visible pending state. Do not advertise distributed atomicity across unrelated ERP, payment and Google services; coordinate confirmations, compensations and reconciliation explicitly.

Write durable notification, payment and synchronization tasks inside the booking transaction and dispatch them after commit. External calls in pre-commit hooks cannot be treated as safely committed side effects. Audit meaningful changes, source and actor, and preserve accepted configuration/price/policy versions for existing work.

## End-to-end journeys

The customer journey is discovery of an actually offered activity, offering and method selection, appropriate availability or request intake, resource preference/quantity where relevant, necessary contact information, scope/price/policy review, any configured payment, authority-confirmed outcome, and later changes or cancellation. Administrative health and financial bookings stay administrative; specialist records or regulated provider decisions stay with their owning services.

The merchant journey is setup and review, a model-appropriate work/calendar view, actionable request/booking details, resource assignment, approval or decline, reschedule or cancellation with impact, fulfilment evidence and completion, payment/reconciliation detail if applicable, and relevant insights. Each action explains rejected, pending, stale or failed outcomes and a recovery route. The customer and merchant share the same booking identity and confirmed state.

Walk-ins and advance bookings share the actual resources where both are offered. Recurring reservations retain per-occurrence status and exceptions. A membership can authorize booking but cannot silently occupy every class or debit a payment. Production due dates and freight/storage units have their own capacity rules rather than being disguised as guest counts.

## Integration behavior

Per business/location/data class use the existing authority modes: NEXG-authoritative, external-authoritative, shared-with-explicit-rules or read-only external. External requests stay pending until confirmed. Unsupported systems get a documented request/manual pathway rather than a universal connection claim. Each adapter declares actual capabilities, identifiers, time/quantity units, ordering and retry behavior, authorization and reconciliation.

Google connection creates or deliberately selects a separate merchant-owned business calendar. Personal calendars remain separate; optional busy-time blocks disclose no personal details. NEXG has its own calendar even when Google is disconnected. Map booking and event identities and suppress loops. Incoming Google edits or deletion do not directly cancel work or refund money. Configure discrepancy handling and authorized actions.

NEXG must correct the documented external-busy failure behavior: an unavailable or stale authoritative source returns unknown/request-only or another explicit supported conservative policy, never an empty/free result by default. Imported pooled quantities need quantity-aware allocation rather than treating every external entry as an entire resource block. Use renewable notifications, incremental sync and periodic reconciliation; Google changes cannot be a transactional lock on third-party resources.

Payment and messaging adapters are optional by merchant policy but part of full delivery where selected. Confirmation wording depends on actual hold/approval/payment requirements. Late payment after hold expiration triggers a defined reallocation-or-refund/review process; it must not displace someone else's confirmed reservation. Reminders, receipts and sync retries are observable and deduplicated. No external charge, message or provider write occurs just because a category is enabled.

## Eight portal screens

| Screen | Booking-related configuration |
| --- | --- |
| Work | Applicable booking/job/request terminology, lifecycle, detail, assignees, permitted actions and operational exceptions |
| Offerings | Actual bookable model, price/policy version, duration/range, quantity, resource eligibility and method |
| Availability | Appropriate calendar, resource/asset/session/occupancy views, hours, shifts, holds, maintenance and closures |
| Business | Branches, resources, service coverage and public/private business facts |
| Money | Configured deposits/collections/refunds and reconciliation; no duplicated settlement from sync |
| Promotions | Only eligible actual offerings and capacity; claims reflect confirmed availability and rules |
| Insights | Model-relevant usage, capacity, punctuality, cancellations and work outcomes with definitions and data coverage |
| Settings | People/grants, connector ownership and health, notification rules, approved policy changes and history |

Home summarizes the same authoritative commitments. It does not calculate a second conflicting booking status or revenue total. Preserve the original calm, informative UX with clear labels, accessible agenda and form alternatives to drag operations.

## Implementation work packages

1. Confirm the actual working checkout and running development ownership. Inventory existing identity, contracts, booking, payments and sources. Pin Payload/Payload Reserve and dependencies, document license notices and patch ownership. This is an implementation prerequisite, not another product trial.
2. Define configuration and command contracts, source authority, exact schedule/quantity semantics and the coverage register. Implement the required onboarding additions and preview/publish revisions for all existing specialty profiles and future categories.
3. Build the compatible booking runtime, tenancy/access bridge, transaction-safe allocations, guarded queries/commands, idempotency and durable tasks. Preserve the existing portal/ERP domains and do not allow two reservation writers.
4. Implement the shared UI and lifecycle, then the specialization extensions listed in [extensions.json](extensions.json). Bind category/offerings through registered models; use the per-specialty scenarios to validate fit rather than creating category-specific applications.
5. Implement supported merchant-system adapters, Google authorization and synchronization, configured payments and messaging, exception processing and reconciliation. Real account authorization and credentials are deployment dependencies, not questionnaire data.
6. Execute all required verification, production configuration, monitoring, backups/restore and source cutover. Record evidence by shared model and every specialty. Release is complete only when agreed real journeys and active integrations meet the acceptance criteria. Pictures and fixture coverage are not completion evidence.

Stages are dependencies within one full objective. Scope includes all current categories; irrelevant models remain absent for merchants who do not offer them. New operations are added through versioned capabilities, so future categories do not require rewriting the entire plan or portal. Business policies and integrations will still need versioned changes as the product evolves.

## Evidence and limitations

Upstream facts are documented with pinned sources in [upstream-fit.md](upstream-fit.md). Those are vendor/source findings, not NEXG runtime certification. The model, extension, question and coverage records are proposed implementation inputs. Inherited profile mistakes are corrected by this overlay rather than silently rewriting older planning fixtures. The implementation must consume one resolved approved configuration and record its version. No current category is declared live by a planning completeness check.
