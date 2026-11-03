# Verification and production release

Date: 31 October 2026. Status: proposed acceptance and release requirements for the end-to-end Payload Reserve adaptation. Scope: Kenya, with `Africa/Nairobi` as the platform scheduling timezone. These requirements define evidence to collect during implementation. They do not establish that bookings, payments, connections or any of the 128 subcategory configurations currently work.

## Completion and evidence

Delivery includes persistent configuration and reservations, customer and merchant journeys, applicable payment behavior, notifications, supported provider integrations and operating procedures. Installing Payload Reserve or displaying calendar events is not completion. Verification is part of delivering the system, rather than a separate trial product.

Keep design coverage, implementation coverage and runtime evidence separate. A generated row, a reviewed schema, a sample booking, a passing configuration check and a successful deployed booking prove different things. The release report must name the exact application commit, Payload Reserve and Payload versions, database adapter/version, configuration revision, environment, source modes, test results and unresolved exceptions.

Each of the [128 proposed profiles](../profiles-128.json) requires a coverage record containing:

- Stable category/subcategory/profile IDs and the applicable configured activities.
- Base workflow plus answer-dependent additions, replacements and exclusions.
- Booking model, resource and capacity unit, fulfilment method, duration/range semantics and required setup.
- Reservation authority and applicable source/connection capabilities.
- Expected customer journey, merchant view and permitted commands.
- Payload-supported behavior, implemented NEXG extensions and dependency versions.
- Named normal, boundary, failure and access scenarios with expected outcomes.
- Separate design, implementation and runtime states, each with evidence references and reviewer/date.

Reconcile the register against the canonical taxonomy: 21 categories and 128 unique subcategories, with no missing, duplicate or unknown IDs. Check every enabled category answer effect and every supported source mode. Include future-category publication using an existing capability and an unsupported new capability that is correctly refused until implemented.

The taxonomy count is a baseline, not a permanent hard limit in the engine. If the current taxonomy changes, version and update the coverage register before claiming coverage of that revision.

## Coverage across all scheduling models

Each current subcategory needs its own configuration/journey evidence. Shared model tests can be reused across those rows when the actual implementation and constraints are shared; the register must state which evidence applies. Add tests for each specialty-specific rule and relevant conditional answer, rather than multiplying identical screenshots.

| Model or workflow | Required acceptance behavior |
| --- | --- |
| Retail/order | Orders remain orders. No appointment or resource booking is introduced without an enabled capability. Configured delivery/collection windows remain separate from stock ownership. |
| Staff appointment | Eligible person and any required room/equipment are available for the full duration and buffers. Unqualified or out-of-shift resources are rejected. |
| Remote session | Correct provider slot and authorized session access. A remote offering does not inherit delivery-zone restrictions. |
| Exclusive asset rental | Exact asset interval, handover/return, maintenance, extensions and buffer handling. With-driver rental reserves the driver without creating a standalone transfer. |
| Transfer | Vehicle and eligible driver allocated together, route/pickup constraints respected, no partial allocation after failure. |
| Group/class/event | Held and confirmed places consume the same capacity. Ticket types sharing a pool cannot oversell that pool; check-in and cancellation affect the correct occurrence. |
| Table/space | Party size, compatible space/table, seating duration and turnover are respected. Seating commitments remain distinct from kitchen order capacity. |
| Multi-day tour | Departure places and owned guide/vehicle resources are checked. External accommodation or supplier promises remain pending until the relevant authority confirms. |
| Pickup and return | Collection, processing and return promises are jointly feasible. A workflow retry creates neither duplicate transport work nor an unsupported return promise. |
| Field service | Area, eligible team, arrival window and configured travel/setup buffer affect availability. Emergency labeling does not bypass actual on-duty capacity. |
| Workshop/service job | Queue intake, reserved bay/technician time and estimated completion are distinct. Walk-ins and appointments share resources where configured. |
| Made-to-order | Specification approval, production capacity, due promise and changes to accepted scope are enforced; a calendar date alone does not prove production feasibility. |
| Request/quote | Submission creates a request, not a confirmed reservation. Accepted scope enters the proper reservation workflow only with required resource and source confirmation. |
| Regulated enquiry | Administrative contact/provider handoff follows the configured workflow. No fabricated financial execution, clinical record or provider authorization is created. |
| Membership | Entitlement validity is separate from the reservation of a class, personal trainer or other resource. Repeated use cannot exceed declared entitlement rules. |
| Freight | Cargo units and capacity dimensions are explicit. Carrier acceptance, transport milestones and optional pickup slots are distinct; feed availability alone cannot confirm a shipment. |
| Storage | Space/unit quantity and occupancy period are respected. Inbound/outbound appointments and access visits do not double-count occupancy or release stored capacity incorrectly. |

Cover hybrid merchants explicitly. For example, a vehicle shared by rental and transfer offerings has one allocation pool, and a salon selling products has separate stock and appointment commitments. A base workflow and its conditional child must not independently charge or reserve the same work twice.

## Configuration and lifecycle evidence

For each applicable answer-dependent capability, verify positive, negative, missing/unknown and conflicting answers. Capture model-specific operational values; do not carry a generic 60-minute appointment fixture into every retail or freight case. Required questions must follow actual applicability, and historical bookings retain their accepted configuration, price and policy revisions.

Prove every permitted transition and reject every relevant invalid transition. Keep booking/request state, resource allocation/hold state, payment/refund state, notification state and external synchronization state independent. A successful payment does not by itself prove confirmation, and a failed reminder does not turn a confirmed reservation into a failed booking.

Verify customer and merchant creation, request/approval, resource assignment, confirmation, rescheduling, cancellation, completion and no-show where applicable. Test guest contact and authenticated access rules, customer self-service tokens, expiry/replay, and the exact scope of records returned to each role.

## Transaction and simultaneous-booking checks

Run these against the exact deployed database adapter and transaction settings. A pre-save conflict query or a successful sequential test does not prove safe concurrent booking.

1. Two independent requests race for one exclusive resource and overlapping time. At most one can confirm; no orphan allocation or partially confirmed record remains.
2. Two independent requests race for the final pooled place. Held plus confirmed quantity never exceeds capacity. Test different quantities and different offerings sharing that pool.
3. A booking requires multiple resources, such as a vehicle and driver or staff member and room. Inject failure between allocation operations and prove all-or-none persistence.
4. A hold consumes capacity until trusted expiry or explicit release. Race expiry, confirmation, cancellation and payment callbacks; only one valid outcome survives, with no double release.
5. Retry an identical command before and after a timeout, including a timeout after commit. The stable operation reference returns or reconciles one outcome and creates no duplicate booking, allocation or charge.
6. Submit a stale update/version and a simultaneous reschedule. Conflicting edits are rejected or reconciled according to the command contract; failed rescheduling preserves the original commitment.
7. Roll back booking creation after relevant hooks execute. No confirmation email, Google event or irreversible external action may have been treated as committed.
8. Simulate deadlock, transaction abort and allowed retry. Retries are bounded and idempotent, and an unknown outcome is distinguishable from a definite rejection.
9. Reduce capacity, add maintenance or close a location with future commitments. The affected work is shown; no confirmed booking is silently cancelled or displaced.
10. Verify every command path, including imported and staff-created work, uses the same allocation invariants. A convenience API cannot bypass resource protection.

Where Payload Reserve relies on adapter transactions or resource locks, verify those mechanisms in the selected version and adapter. Do not extrapolate another adapter's documented result to this deployment. If required safety cannot be established, dependent confirmation commands remain unavailable until corrected.

## Serving-path security

Enforce business, location, actor and action scope at the server. A hidden control or selected tenant in the browser is insufficient. Test direct requests using valid credentials from another business and from staff without the required grant.

| Serving path | Required checks |
| --- | --- |
| NEXG customer and merchant APIs/server actions | Derive trusted identity and membership; validate all business/resource references, operation/version and field ownership; reject forged tenant IDs. |
| Payload-generated REST/GraphQL endpoints, if exposed | Apply the same access and field constraints. Disable unnecessary mutation paths or route them through protected booking commands. |
| Payload admin and staff forms | Staff access is scoped to granted businesses and actions. Administrative UI membership does not imply unrestricted cross-merchant booking, refund or export rights. |
| Payload Local API calls | Review its access-bypass behavior explicitly. User-driven calls must enforce access and pass the trusted request context, including `overrideAccess: false` where required. Any privileged call needs a documented scope and domain invariant checks. |
| Hooks and background jobs | Preserve business/resource context and exact command ownership. A job does not gain unlimited tenant access from a missing request or user. |
| Provider callbacks and sync workers | Verify authenticity, connection and mapped business/resource IDs; deduplicate and authorize the resulting action. Callback identifiers alone must not select another tenant's record. |
| Imports, exports, search and reporting | Reject foreign references and unauthorized fields; apply business/location scope to results, files, counts and aggregated metrics. |

Test object-level and field-level access, not only route admission. Include phone/email, guest contact, private external events, prices, credentials and refund actions. Credentials must not appear in ordinary onboarding/configuration fields, browser responses or logs. Cross-tenant record relationships must fail even when both referenced IDs are individually valid.

## Payments, side effects and recovery

Support only the configured payment methods and provider operations. For each enabled method, verify amount/currency/policy snapshots, authenticated result handling, duplicate/reordered callbacks, timeout lookup and reconciliation. Include payment success after hold expiry, booking rejection after payment, cancellation while payment is pending, partial/refund failures and repeated refund requests.

Use durable post-commit processing for notifications and external synchronization. Prove that booking change plus delivery work are persisted reliably, a rollback emits no committed side effect, a crashed worker can resume, and retry cannot duplicate customer messages or external records. If a third party provides no idempotency or lookup guarantee, document the uncertainty and reconciliation path rather than claim exactly-once external delivery.

Notifications must show the authority-confirmed outcome and the correct Kenya date/time. A queued provider request cannot generate a confirmed-booking message. Preserve a record of failed delivery and appropriate recovery without exposing private information.

## Source ownership and Google checks

For NEXG-controlled resources, validate local allocation guarantees. For externally controlled resources, test supported remote hold/confirm/cancel operations and confirm that pending requests stay pending until the owner responds. For shared arrangements, enforce the named field and command ownership rules. Read-only integrations must reject writes through every route.

Test stale imports, lost connectivity, revoked permission, partial mapping, unsupported statuses, unknown capacity and conflicting external changes. Do not infer free capacity from a failed external-busy query. If the chosen plugin defaults to treating external-query errors as no busy periods, the NEXG integration must override or guard that behavior before external-constrained instant booking is enabled. Unrelated confirmed local resources can remain usable according to their declared policy.

For Google integration, prove:

- NEXG works without a Google connection.
- The merchant knowingly connects a selected account and a separate business calendar; personal-calendar busy checks are independently optional.
- The connected business calendar belongs to the intended merchant owner and maps only to the authorized NEXG business/resources.
- Event creation, update and cancellation use stable mappings and do not create duplicates or feedback loops.
- A Google edit or deletion follows the declared discrepancy/workflow rules and cannot silently refund, reassign or cancel NEXG work.
- Authorization expiry, revocation, missed or duplicate notifications, invalid sync tokens, calendar deletion, quota errors and outage recovery are handled visibly.
- Personal busy blocks reveal only permitted data. Disconnect stops future sync under the disclosed retention policy and preserves NEXG booking history.

A Google free/busy response is not a distributed reservation lock. Release evidence must describe the external conflict policy and its limits instead of promising global exclusion against arbitrary external edits.

## Kenya date and time behavior

Use `Africa/Nairobi` and East Africa Time throughout merchant and customer scheduling. The interface does not ask merchants to configure a timezone or expose a multi-timezone/DST settings workflow. Internal timestamp and provider-offset handling must still be correct.

Verify local-day boundaries around midnight, bookings spanning midnight, overnight working hours, date-only closures, month/year changes, multi-day rentals, end-exclusive intervals, buffers spanning a day boundary and recurring weekly occurrences. Date-only promises retain their intended calendar date. UTC or other offsets received from Google/providers convert correctly to Kenya time; no provider timestamp is assumed already local.

Use trusted server time for holds, cutoffs and deadlines. Test client clocks ahead/behind and a browser configured to another zone: the NEXG booking promise remains the declared Kenya date/time. Payment, notification and sync workers must agree on that meaning.

## Interface and operational verification

Verify mobile agenda, resource/calendar views, keyboard navigation, screen-reader labels, accessible forms, focus restoration and non-drag alternatives. Exercise empty/setup-incomplete, filtered-empty, loading, denied, conflict, stale, pending, failed and recovery states. Do not show sample data as a live customer confirmation.

Set and record production targets for expected merchants, active resources, booking attempts, burst concurrency, acceptable response times, worker lag, recovery and retention. Measure the implemented system against those targets with realistic resource and capacity contention. A taxonomy count of 128 does not itself establish traffic or storage capacity.

Monitor reservation conflicts, hold expiry backlog, unknown command outcomes, payment discrepancies, external freshness, delivery failures, cross-tenant access denials and worker health. Define alerts, responsible operators and runbooks. Ordinary business rejection, such as no remaining places, must be distinguishable from system failure.

Test backup and restore of configuration, bookings, allocations, operation references, external mappings and history. A restored system must reconcile with payment/calendar providers before replaying side effects or accepting affected writes. Restore must not repeat old reminders or recreate already delivered Google events. Protect secrets and restore access controls as part of recovery.

## Release entry criteria

Before production activation, record:

1. The pinned Payload Reserve/Payload/application versions, adapter compatibility, license notices and dependency review.
2. The implemented capability and 128-profile coverage register, including explicit non-booking/request-only modes and unresolved implementation limitations.
3. Successful booking, transaction, access, payment, time/date, interface and integration checks for enabled behavior, with no unresolved defect that violates a booking or isolation invariant.
4. Real Google/provider authorization, reviewed permissions, configured callbacks, domain/redirect settings and any required external account approvals for integrations being activated.
5. Migration/cutover, reconciliation, monitoring, backup/restore and recovery procedures, with named operational ownership.
6. A release configuration that exposes only implemented, authorized and verified capabilities. Unsupported external operations must not be advertised as instant confirmed bookings.

Release the full agreed product through a controlled rollout with operating evidence. Controlled exposure protects real commitments and is not a substitute for completing the agreed scope. Broad readiness requires the corresponding configured categories, integrations and journeys to meet the stated criteria.

## Existing-system cutover and rollback

Each source change needs an explicit business/resource/data-class cutover. Inventory the authoritative records, reconcile identities and future commitments, snapshot the agreed boundary, drain or resolve in-flight operations and establish which system accepts new writes before activation. Verify balances/capacity and booking counts appropriate to that model, rather than only a successful connection check.

Do not leave both the old and new systems accepting independent reservations for the same capacity. A source switch must preserve stable booking/allocation references and accepted policy versions. Historical work retains its correct owner and provenance.

Rollback is a reconciled source transition. It must account for commitments accepted after cutover, payments, cancellations, external event changes and queued side effects. Simply restoring an old backup or toggling a provider flag can lose or duplicate real commitments and is not an acceptable rollback. Pause affected new intake if needed, reconcile the transition, establish one active writer and then reopen the relevant capability.

The release record must distinguish planned controls, automated evidence, environment integration evidence and production operating evidence. It may claim completion only for the exact implemented and verified scope.
