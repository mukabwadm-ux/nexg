# Workflow catalogue

Status: proposed design, 29 October 2026. These seventeen contracts are planning definitions, not deployed state machines. They reference question-registry.json and the128 profile mappings. A workflow family can be reused while subtype fields, fulfilment, roles and evidence differ.

For booking implementation, consume [effective-workflows.json](payload-reserve-plan/reconciliation/effective-workflows.json) through the [reconciled manifest](payload-reserve-plan/reconciliation/manifest.json). It applies the documented transition-guard corrections, variants and explicit exception bindings to this source catalogue and registers the space-reservation workflow. Do not implement the superseded guards below independently.

## Shared action contract

Every transition below requires tenant/location scope, current actor permission, capability support, authoritative owner, valid input, expected version and allowed current state. These common guards are in addition to the row-specific guard. UI configuration cannot grant a permission.

A command records operation ID, idempotency key, configuration/workflow version, actor, source references and audit result. External commands are not confirmed by a local optimistic update. Source/transport failures are isolated to the affected capability.

### UI operation states, separate from business state

- IDLE: show current confirmed business state and permitted actions.
- VALIDATING: retain entered values and identify errors at the field or affected scope.
- PENDING_CONFIRMATION: acknowledge the command without advancing the confirmed business state.
- CONFIRMED: read the authoritative result, update the task and affected summaries.
- FAILED: show known failure and a scoped recovery action.
- OUTCOME_UNKNOWN: retain last confirmed state and operation reference; reconcile with the owner before retrying.
- CONFLICT: refresh authoritative version and compare intended change; require an informed retry.
- OFFLINE/STALE: label freshness and disable actions whose command policy requires connectivity. Cached data is not a completion signal.

Retries are bounded and apply only to known retryable failures. Duplicate messages/results must not create duplicate reservations, shipments, charges or work. Reconciliation uses declared source authority, not timestamp-based last-write-wins.

Cancellation, reschedule, approval expiry and refunds are distinct contracts. A cancellation request stays pending until the authoritative owner confirms the business outcome; financial changes remain pending until Finance confirms its own outcome. Existing accepted work keeps its workflow/configuration version when onboarding answers change.

## Workflow index

| ID | Family |
|---|---|
| WF_ORDER | Stocked or prepared order |
| WF_MADE_TO_ORDER | Custom or made-to-order offering |
| WF_APPOINTMENT | Appointment at a merchant venue |
| WF_REMOTE_SESSION | Remote appointment or session |
| WF_FIELD_SERVICE | Service at the customer location |
| WF_RENTAL | Asset or vehicle rental |
| WF_TRANSFER | Passenger transfer |
| WF_EVENT_SESSION | Event admission or scheduled session |
| WF_GROUP_ACTIVITY | Capacity-limited group activity |
| WF_TOUR | Tour or multi-stop travel service |
| WF_REQUEST_QUOTE | Request, quote and coordination |
| WF_PICKUP_RETURN | Collection, processing and return |
| WF_MEMBERSHIP | Membership or recurring entitlement |
| WF_FREIGHT | Freight or shipment |
| WF_STORAGE | Storage allocation, custody and release |
| WF_REGULATED_ENQUIRY | Regulated enquiry or professional referral |
| WF_SERVICE_JOB | Diagnostic, repair or workshop job |

## WF_ORDER: Stocked or prepared order

A customer orders known items at an authorised price. Picking/preparation and physical handover are enabled only for offerings that use those stages.

Related questions: Q_OFFERING_PRICE, Q_FULFILLMENT_MODES, Q_PREPARATION_MINUTES. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: RECEIVED, ACCEPTED, ALLOCATED, PICKING, READY_FOR_HANDOVER, AWAITING_CUSTOMER_COLLECTION, COLLECTED, HANDED_TO_CARRIER, IN_TRANSIT, DELIVERED, COMPLETED, PREPARING. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| RECEIVED | ACCEPTED | merchant or authoritative order service | AcceptOrder | Current price, eligibility and acceptance confirmed; any required payment authority separately satisfied |
| ACCEPTED | ALLOCATED | inventory authority | ReserveOrderStock | Authoritative inventory confirms required stock or approved substitution branch |
| ALLOCATED | PICKING | assigned merchant staff | StartPicking | Actor assigned to this location and order |
| PICKING | READY_FOR_HANDOVER | assigned merchant staff | MarkOrderReady | Required picked items and packaging confirmed, no preparation task remains, and price changes approved |
| READY_FOR_HANDOVER | AWAITING_CUSTOMER_COLLECTION | merchant staff | OpenCollection | Customer-pickup mode and collection window confirmed |
| AWAITING_CUSTOMER_COLLECTION | COLLECTED | merchant staff | ConfirmCustomerCollection | Contracted collection identity/code/proof confirmed |
| READY_FOR_HANDOVER | HANDED_TO_CARRIER | merchant staff and carrier authority | ConfirmCarrierHandover | Assigned carrier, custody proof and required eligibility checks confirmed |
| HANDED_TO_CARRIER | IN_TRANSIT | fulfilment authority | ConfirmDispatch | Actual dispatch event confirmed by carrier owner |
| IN_TRANSIT | DELIVERED | fulfilment authority | ConfirmDelivery | Required delivery and eligibility proof confirmed |
| COLLECTED | COMPLETED | order authority | CompleteOrder | No unresolved fulfilment exception |
| DELIVERED | COMPLETED | order authority | CompleteOrder | No unresolved fulfilment exception |

### Guarded variant bindings

Variant task bindings: PICKING means physical selection/packing of stocked items and is labelled Picking. PREPARING means cooking/assembly/preparation and is labelled Preparing. A food order with both tasks uses PICKING→PREPARING. Commands and state semantics remain distinct even when queue components are shared. Existing PICKING→READY_FOR_HANDOVER is permitted only when no preparation task remains. inventory_disabled is an explicit owner-approved mode; inventory_unavailable never bypasses stock checks.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| ACCEPTED | PICKING | assigned staff | StartUnreservedPicking | Inventory is explicitly disabled or not required for this offering; pick task required. An unavailable inventory source never satisfies this guard. |
| ACCEPTED | PREPARING | assigned producer | StartUnreservedPreparation | Inventory is explicitly disabled/not required and preparation is a real configured task; approved scope and inputs ready. |
| ALLOCATED | PREPARING | assigned producer | StartOrderPreparation | Preparation task required and picking is not separately required; authoritative allocation confirmed. |
| PICKING | PREPARING | assigned producer | StartPreparationAfterPicking | Both picking and preparation are configured; picking completion and required material custody confirmed. |
| PREPARING | READY_FOR_HANDOVER | assigned producer | CompleteOrderPreparation | Required preparation, quality and packaging checks completed; approved quantity/price preserved. |
| ACCEPTED | READY_FOR_HANDOVER | assigned staff | ConfirmImmediateOrderReady | No stock reservation, picking or preparation task is required by this version; all handover prerequisites actually satisfied. |
| ALLOCATED | READY_FOR_HANDOVER | assigned staff | ConfirmAllocatedOrderReady | Stock reserved, no pick/preparation task required, and required handover checks satisfied. |


Fulfilment and subtype variants:

- Retail picking and food preparation are configured task labels, not universal synonyms. Food has preparation timing; a stocked product may skip the configured picking/preparation task when the owner contract permits.
- Customer pickup uses collection proof. NEXG/merchant delivery uses the declared carrier authority and dispatch/delivery evidence. Digital fulfilment uses WF_REMOTE_SESSION or an explicit digital-deliverable extension, never fake carrier milestones.

Exceptions and recovery:

- Stock shortfall opens SUBSTITUTION_REVIEW without substituting silently; resume at ALLOCATED only after the configured approval.
- RECEIVED may become DECLINED with reason. Cancellation after acceptance creates CANCELLATION_REVIEW; the order authority confirms cancellation and required stock release before CANCELLED. A separately requested refund can remain pending in Finance after operational cancellation.
- Delivery failure opens DELIVERY_EXCEPTION owned by fulfilment; do not mark delivered from elapsed time.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Accepted item/price/config version
- Authoritative stock result where relevant
- Collection or delivery proof
- Separate payment/refund references

## WF_MADE_TO_ORDER: Custom or made-to-order offering

A specification is approved before bespoke production. Production and fulfilment are separate responsibilities.

Related questions: Q_CUSTOM_ORDERS, Q_OFFERING_PRICE, Q_ORDER_LEAD_TIME_MINUTES, Q_PRICE_CONFIRMATION_MODE. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, SPECIFICATION_REVIEW, QUOTED, APPROVED, IN_PRODUCTION, QUALITY_CHECK, READY_FOR_HANDOVER, HANDOVER_PENDING, FULFILLED, COMPLETED. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | SPECIFICATION_REVIEW | merchant specialist | ReviewSpecification | Customer requirements and delivery date captured |
| SPECIFICATION_REVIEW | QUOTED | merchant quoting authority | IssueCustomQuote | Required material, scope, price, expiry and completion terms supplied |
| QUOTED | APPROVED | customer | ApproveCustomQuote | Current exact quote version accepted; payment/deposit prerequisite remains separately tracked |
| SPECIFICATION_REVIEW | APPROVED | customer and merchant authority | AcceptFixedCustomOffering | Fixed price and complete approved specification; quote path explicitly not required |
| APPROVED | IN_PRODUCTION | assigned producer | StartProduction | Materials/resource capacity, production acceptance and any Finance-confirmed pre-start prerequisite satisfied |
| IN_PRODUCTION | QUALITY_CHECK | producer | SubmitProductionResult | Contracted specification and checks recorded |
| QUALITY_CHECK | READY_FOR_HANDOVER | merchant quality reviewer | ApproveProductionResult | Quality result and customer-required approval satisfied |
| READY_FOR_HANDOVER | HANDOVER_PENDING | merchant staff | RequestCustomHandover | Configured collection/delivery leg created with authoritative reference |
| HANDOVER_PENDING | FULFILLED | fulfilment or collection authority | ConfirmCustomHandover | Required custody and recipient evidence confirmed |
| FULFILLED | COMPLETED | merchant work authority | CompleteCustomWork | All contracted deliverables fulfilled |

### Guarded variant bindings

Customer quote/specification acceptance creates APPROVED even if a deposit is still pending. Starting production requires the separately confirmed Finance prerequisite; do not combine acceptance and paid into one state.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| QUALITY_CHECK | IN_PRODUCTION | authorised quality reviewer | ReturnCustomWorkForCorrection | A stated quality/specification check failed; record reason and scope without silently changing approved price or specification. |


Fulfilment and subtype variants:

- Cakes, hampers, tailoring and custom goods use their own specification editors and units.
- A production milestone may add a review or fitting only where configured. Reuse the physical handover component without creating a duplicate sales order.

Exceptions and recovery:

- Clarification keeps SPECIFICATION_REVIEW pending and identifies the missing customer detail.
- Expired quote becomes QUOTE_EXPIRED; repricing needs a new version and approval.
- Production change enters CHANGE_REVIEW; assess date/price impact before resuming.
- Cancellation after production begins requires the accepted cancellation terms and a separate financial decision.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Approved specification and quote versions
- Production evidence/checklist
- Change approvals
- Fulfilment proof

## WF_APPOINTMENT: Appointment at a merchant venue

A customer reserves staff/time and attends an appointment. A requested slot is distinct from an authoritative reservation.

Related questions: Q_BOOKING_REQUIRED, Q_APPOINTMENT_DURATION_MINUTES, Q_BOOKING_LEAD_TIME_MINUTES, Q_RESOURCE_SELECTION_MODE, Q_BOOKING_CONFIRMATION_MODE. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, HOLD_PENDING, HELD, CONFIRMED, CHECKED_IN, IN_SESSION, COMPLETED, FIELD_EXECUTION_PENDING. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | HOLD_PENDING | booking application service | RequestSlotHold | Exact offering duration, timezone, resource and notice valid |
| HOLD_PENDING | HELD | booking authority | ConfirmSlotHold | Authority confirms hold ID and expiry; no local invented reservation |
| HELD | CONFIRMED | booking authority, or authorised merchant through its command | ConfirmAppointment | confirmation_mode=merchant_accepts or declared hold-confirmation path; required acceptance, any contract-required Finance prerequisite and durable resource reservation confirmed |
| CONFIRMED | CHECKED_IN | merchant front desk | CheckInAppointment | Booked fulfilment is merchant_venue; correct booking, date and customer proof confirmed |
| CHECKED_IN | IN_SESSION | assigned qualified staff | StartAppointment | Staff available, location and any required consent/checks satisfied |
| IN_SESSION | COMPLETED | appointment authority using assigned staff or child evidence | CompleteAppointment | Venue service completion confirmed, or linked field child confirms contracted completion for customer_location; completion details recorded |

### Guarded variant bindings

Confirmation bindings: instant_authority_confirmed uses atomic ReserveAndConfirmInstantAppointment; merchant_accepts uses the hold/review path and explicit merchant ConfirmAppointment; external_system_confirms waits for provider confirmation. A pending remote command remains A04/A07 while the last confirmed business state is retained. Venue and customer-location execution bindings are mutually exclusive per booking. Appointment completion requires the linked field child to confirm completion where selected, or the actual venue service completion otherwise.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | CONFIRMED | booking authority | ReserveAndConfirmInstantAppointment | confirmation_mode=instant_authority_confirmed; authoritative atomic reservation and all declared prerequisites confirmed. No temporary hold is fabricated. |
| REQUESTED | CONFIRMED | external booking authority through verified adapter | ConfirmExternallyReservedAppointment | confirmation_mode=external_system_confirms; durable booking/resource reference and current confirmed provider outcome received. |
| CONFIRMED | FIELD_EXECUTION_PENDING | booking application service | CreateLinkedFieldExecution | Booked fulfilment is customer_location, field-service variant enabled and one child execution reference registered; reuse existing resource reservation. |
| FIELD_EXECUTION_PENDING | IN_SESSION | appointment authority using field-child evidence | ConfirmFieldAppointmentStarted | Linked WF_FIELD_SERVICE confirms IN_SERVICE at the booked site; mirror evidence without issuing a second StartService command. |
| CONFIRMED | CHECKED_IN | merchant front desk | CheckInAppointment | Venue-only binding of the primary command; booked fulfilment is merchant_venue and check-in proof confirmed. Mutually exclusive with field execution. |


Fulfilment and subtype variants:

- Resource selection can be specific, any qualified resource, merchant assignment or explicitly unconstrained.
- Walk-in path creates an authorised booking/resource assignment at CHECKED_IN after availability confirmation. Home service is a linked WF_FIELD_SERVICE execution variant; do not require venue check-in as well.

Exceptions and recovery:

- Hold conflict→SLOT_UNAVAILABLE; release any partial hold and offer refreshed alternatives.
- Hold expiry→HOLD_EXPIRED; no automatic confirmation.
- No arrival→NO_SHOW only after the configured deadline and authorised decision.
- Reschedule creates a new authoritative hold before releasing the old booking under policy.
- Cancellation remains CANCELLATION_PENDING until the booking authority confirms cancellation/release.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Hold/reservation references
- Resource and calendar version
- Attendance/start/completion record
- Separate cancellation/payment outcome

## WF_REMOTE_SESSION: Remote appointment or session

A booked digital session with access, attendance and a minimum-necessary completion record.

Related questions: Q_SESSION_FORMAT, Q_APPOINTMENT_DURATION_MINUTES, Q_BOOKING_LEAD_TIME_MINUTES, Q_TELE_PLATFORMS. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, SLOT_HELD, CONFIRMED, ACCESS_READY, PARTICIPANT_JOINED, IN_SESSION, COMPLETED, SESSION_INTERRUPTED. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | SLOT_HELD | booking authority | HoldRemoteSession | Exact slot/resource authoritative hold confirmed |
| SLOT_HELD | CONFIRMED | booking authority | ConfirmRemoteSession | Reservation and prerequisites confirmed before hold expiry |
| CONFIRMED | ACCESS_READY | session provider authority | PrepareSessionAccess | Authorised participant access generated through supported secure provider |
| ACCESS_READY | PARTICIPANT_JOINED | session authority or assigned professional | ConfirmParticipantArrival | Participant presence confirmed; link issuance alone is insufficient |
| PARTICIPANT_JOINED | IN_SESSION | assigned qualified provider | StartRemoteSession | Provider attendance, consent and applicable eligibility confirmed |
| IN_SESSION | COMPLETED | assigned provider | CompleteRemoteSession | Session delivered; permitted operational completion recorded |

### Guarded variant bindings

These are explicit optional routes; each guard is required in addition to the shared action contract.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| CONFIRMED | ACCESS_READY | session authority | ConfirmExistingSessionAccess | A valid existing protected access reference belongs to this booking and participants; no duplicate meeting/access creation. |
| IN_SESSION | SESSION_INTERRUPTED | assigned provider/session authority | RecordSessionInterruption | Actual interruption confirmed with minimum necessary reason; completion not yet achieved. |
| SESSION_INTERRUPTED | IN_SESSION | assigned provider/session authority | ResumeRemoteSession | Participants reconnect and authorised provider confirms resumption under original or freshly accepted timing terms. |


Fulfilment and subtype variants:

- Phone/video/secure messaging use different provider access methods; access is shown only to authorised parties.
- Clinical and counselling variants restrict sensitive detail; operational portal does not become a clinical record by default.

Exceptions and recovery:

- Access creation failure leaves ACCESS_PENDING and a named recovery path; never expose an unverified public meeting link.
- Connectivity interruption enters SESSION_INTERRUPTED with reconnect/reschedule decision.
- Provider/customer no-show requires the relevant actor and deadline.
- Session recording is not implied; separate consent, retention and authority would be required.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Booking reference
- Access-issued timestamp without secrets
- Authorised attendance and completion
- Consent/reference where required

## WF_FIELD_SERVICE: Service at the customer location

A professional or team travels to perform work. Scheduling, arrival and completion use service evidence, not parcel delivery states.

Related questions: Q_HOME_SERVICE, Q_SERVICE_LOCATION_MODE, Q_SERVICE_AREA, Q_RESOURCE_SELECTION_MODE. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, SCOPE_REVIEW, APPROVED, ASSIGNED, EN_ROUTE, ARRIVED, IN_SERVICE, COMPLETION_REVIEW, COMPLETED, QUOTE_PENDING. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | SCOPE_REVIEW | merchant dispatcher or specialist | ReviewSiteService | Customer location, work scope and minimum necessary access details captured |
| SCOPE_REVIEW | APPROVED | customer and merchant authority | ApproveSiteService | Fixed terms or current quote approved; service-area eligibility confirmed |
| APPROVED | ASSIGNED | merchant resource authority | AssignServiceTeam | Qualified team, travel time, equipment and slot confirmed |
| ASSIGNED | EN_ROUTE | assigned team or transport authority | StartServiceTravel | Team confirms actual departure; no inferred travel from schedule |
| EN_ROUTE | ARRIVED | assigned team | ConfirmSiteArrival | Correct site/customer check-in and access conditions satisfied |
| ARRIVED | IN_SERVICE | qualified assigned staff | StartSiteService | Required safety/consent/site checks passed |
| IN_SERVICE | COMPLETION_REVIEW | assigned staff | SubmitSiteResult | Contracted work and evidence submitted |
| COMPLETION_REVIEW | COMPLETED | authorised reviewer or customer per contract | ConfirmSiteCompletion | Acceptance policy and outstanding deliverables satisfied |

### Guarded variant bindings

Fixed-price scope uses SCOPE_REVIEW→APPROVED only after actual customer acceptance. Variable pricing uses QUOTE_PENDING and a current linked quote approval. APPROVED records commercial acceptance; ASSIGNED/IN_SERVICE still require separately confirmed payment/deposit prerequisites only where the accepted contract demands them.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| SCOPE_REVIEW | QUOTE_PENDING | authorised quoting application service | RequestSiteServiceQuote | Variable/diagnostic pricing requires a linked WF_REQUEST_QUOTE or registered quote contract; no extra work committed yet. |
| QUOTE_PENDING | APPROVED | site-service authority using quote evidence | ConfirmApprovedSiteQuote | Customer approved current exact quote/scope; retain quote reference. This records acceptance, not payment. |


Fulfilment and subtype variants:

- Home cleaning, mobile inspection, installation, home care and sample collection use specialist checklists and permissions.
- For home sample collection, completion means the collection service completed with custody recorded; test result release remains a separate authorised deliverable.
- Linked appointment supplies the reservation; this workflow supplies field execution and must not reserve the same resource twice.

Exceptions and recovery:

- Out-of-area request→SCOPE_REVIEW with explicit refusal/alternative, never rider-zone waitlist by default.
- No access/customer absent→ACCESS_EXCEPTION; contact/reschedule/cancel under policy.
- Scope change→CHANGE_REVIEW with price/time approval before additional work.
- Safety or professional restriction→SERVICE_BLOCKED with authorised escalation, never force-complete.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Approved scope and appointment reference
- Assigned team/resource
- Arrival/access record
- Completion or custody evidence

## WF_RENTAL: Asset or vehicle rental

A specific eligible asset is reserved, issued, returned and inspected. Payment/deposit lifecycle remains owned by Finance.

Related questions: Q_MINIMUM_RENTAL_DURATION, Q_RESOURCE_INVENTORY, Q_DEPOSIT_MODE, Q_WITH_DRIVER. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, ASSET_HELD, CONFIRMED, CHECKOUT_REVIEW, ACTIVE, RETURN_REVIEW, INSPECTED, CLOSED, DRIVER_ASSIGNMENT_PENDING. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | ASSET_HELD | rental inventory authority | HoldRentalAsset | Exact date interval, timezone, asset and eligibility available |
| ASSET_HELD | CONFIRMED | rental authority | ConfirmRental | Contract, identity/licence where required and deposit prerequisite confirmed |
| CONFIRMED | CHECKOUT_REVIEW | merchant asset custodian | PrepareAssetIssue | Self-drive or already confirmed suitable driver assignment; asset condition, accessories, fuel and authorised recipient recorded |
| CHECKOUT_REVIEW | ACTIVE | asset custodian and renter | IssueRentalAsset | Handover evidence and issue time confirmed |
| ACTIVE | RETURN_REVIEW | asset custodian | ReceiveRentalReturn | Physical asset returned with time/location proof |
| RETURN_REVIEW | INSPECTED | authorised inspector | InspectReturnedAsset | Condition, accessories and applicable fuel/mileage comparison recorded |
| INSPECTED | CLOSED | rental authority | CloseRental | Asset disposition resolved; any contested deduction remains separately reviewable |

### Guarded variant bindings

The direct CONFIRMED→CHECKOUT_REVIEW transition requires self-drive or an already confirmed suitable driver assignment. The driver path does not create a transfer or reserve the asset twice.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| CONFIRMED | DRIVER_ASSIGNMENT_PENDING | rental application service | RequestRentalDriverAssignment | with_driver=true and no existing valid driver assignment; rental dates and already reserved asset retained. |
| DRIVER_ASSIGNMENT_PENDING | CHECKOUT_REVIEW | rental/fleet authority | ConfirmRentalDriverAssignment | Qualified available driver assignment confirmed for the rental interval; asset and contracted handover ready. |


Fulfilment and subtype variants:

- With-driver rental adds driver availability and responsibility, preserving the rental interval.
- Equipment and venue rentals use relevant asset/space checks; passenger transfer uses WF_TRANSFER.

Exceptions and recovery:

- Asset conflict or hold expiry releases the hold with authority confirmation.
- Late return→OVERDUE based on configured deadline; no automatic unapproved fee.
- Damage dispute→DAMAGE_REVIEW; evidence and independent financial approval precede any deduction.
- Lost asset→LOSS_REVIEW and restricted availability, not a fabricated returned state.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Asset reservation
- Accepted terms/version
- Condition and custody at issue/return
- Inspection and separate deposit disposition

## WF_TRANSFER: Passenger transfer

A booked point-to-point passenger journey, including airport timing where configured.

Related questions: Q_VEHICLE_TYPES_TRANSFER, Q_FLIGHT_TRACKING, Q_INCLUDED_WAIT_MINUTES, Q_SERVICE_AREA. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, CONFIRMED, VEHICLE_ASSIGNED, DRIVER_EN_ROUTE, AT_PICKUP, PASSENGER_ON_BOARD, JOURNEY_IN_PROGRESS, ARRIVED_DESTINATION, COMPLETED. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | CONFIRMED | transfer booking authority | ConfirmTransfer | Route, passengers, luggage, pickup time and price/quote accepted |
| CONFIRMED | VEHICLE_ASSIGNED | fleet dispatcher | AssignTransferVehicle | Qualified driver and suitable vehicle confirmed without resource conflict |
| VEHICLE_ASSIGNED | DRIVER_EN_ROUTE | driver or fleet authority | StartPickupApproach | Actual departure to pickup confirmed |
| DRIVER_EN_ROUTE | AT_PICKUP | driver | ConfirmPickupArrival | Correct meeting point and arrival recorded |
| AT_PICKUP | PASSENGER_ON_BOARD | driver and passenger proof | ConfirmBoarding | Correct authorised passengers and luggage accepted |
| PASSENGER_ON_BOARD | JOURNEY_IN_PROGRESS | driver/fleet authority | StartPassengerJourney | Actual passenger journey started |
| JOURNEY_IN_PROGRESS | ARRIVED_DESTINATION | driver/fleet authority | ConfirmDestinationArrival | Correct destination reached |
| ARRIVED_DESTINATION | COMPLETED | transfer authority | CompleteTransfer | Passenger alighting and contracted journey complete |

### Guarded variant bindings

Return-leg creation is a child-record command and intentionally leaves the parent confirmed state unchanged. Each journey uses WF_TRANSFER independently; parent itinerary completion requires all contracted legs or an explicit resolved cancellation.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| CONFIRMED | CONFIRMED | transfer application service | CreateLinkedReturnJourney | Accepted itinerary includes a return leg with its own time/route/price scope; create once by parent and leg key, with separate assignment and journey evidence. |


Fulfilment and subtype variants:

- Airport variants add flight reference, supported status source, terminal and meet/greet details. Flight data may adjust an estimate only under approved timing rules.
- Round trips create linked journey legs with separate execution evidence. Chauffeured hourly hire belongs to the rental/driver-hire variant, not an invented single destination.

Exceptions and recovery:

- Flight update missing/stale does not confirm arrival or reschedule automatically.
- No-show→PICKUP_EXCEPTION after configured included waiting and contact attempts.
- Vehicle breakdown→REASSIGNMENT_REVIEW; confirm passenger safety and new vehicle before proceeding.
- Route change requires revised customer-approved terms where applicable.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Confirmed itinerary
- Driver/vehicle assignment
- Pickup/boarding evidence
- Destination completion

## WF_EVENT_SESSION: Event admission or scheduled session

Session inventory, reservation and ticket/admission are separate facts.

Related questions: Q_CAPACITY_LIMIT, Q_TICKET_DELIVERY_METHOD, Q_BOOKING_CONFIRMATION_MODE. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, SEATS_HELD, BOOKING_CONFIRMED, TICKET_PENDING, TICKET_ISSUED, ADMITTED, ATTENDED, COMPLETED. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | SEATS_HELD | event inventory authority | HoldEventSeats | Selected session/seat/quantity available and authoritative hold confirmed |
| SEATS_HELD | BOOKING_CONFIRMED | event booking authority | ConfirmEventBooking | Payment/eligibility prerequisites and durable reservation confirmed |
| BOOKING_CONFIRMED | TICKET_PENDING | ticketing application service | RequestTicketIssue | Supported issuer authorised for this booking |
| TICKET_PENDING | TICKET_ISSUED | ticket issuer | ConfirmTicketIssue | Valid ticket/admission reference received from issuer |
| TICKET_ISSUED | ADMITTED | venue admission authority | ValidateAdmission | Ticket current, not already consumed and identity/age rules satisfied |
| ADMITTED | ATTENDED | venue/session staff | ConfirmEventAttendance | Attendance policy satisfied; scan does not imply session completion |
| ATTENDED | COMPLETED | event authority | CompleteEventSession | Session completion and permitted operational outcome confirmed |

### Guarded variant bindings

A non-ticketed variant cannot display TICKET_ISSUED or manufacture a ticket identifier. Its admission command consumes the valid booking admission entitlement once.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| BOOKING_CONFIRMED | ADMITTED | venue admission authority | AdmitByBookingReference | Manifest explicitly supports non-ticketed booking-reference admission; eligibility and one-time admission consumption confirmed. Ticket issuing states are inapplicable. |


Fulfilment and subtype variants:

- Non-ticketed reservation-only sessions bypass ticket issue only when the admission contract explicitly supports booking-reference admission.
- Named seats, general admission and timed sessions use distinct capacity units; never combine their counts.

Exceptions and recovery:

- Sold out→SOLD_OUT with waitlist only if supported.
- Hold expiry→HOLD_EXPIRED and authoritative release.
- Ticket issue unknown→ISSUE_OUTCOME_UNKNOWN; query issuer before retry to avoid duplicate tickets.
- Cancelled/rescheduled event requires issuer/booking reconciliation and separate refund decisions.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Session and seat/quantity inventory
- Booking and ticket issuer references
- Admission consumption result
- Completion record

## WF_GROUP_ACTIVITY: Capacity-limited group activity

A group reserves an activity with participant, instructor, equipment and minimum-participant rules.

Related questions: Q_CAPACITY_LIMIT, Q_MINIMUM_PARTICIPANTS, Q_EQUIPMENT_PROVIDED, Q_SERVICE_DURATION_OPTIONS. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, CAPACITY_HELD, CONFIRMED, GO_DECISION_PENDING, CLEARED_TO_RUN, CHECKED_IN, IN_ACTIVITY, COMPLETED. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | CAPACITY_HELD | activity booking authority | HoldActivityCapacity | Participant count, exact session and required equipment/resource capacity available |
| CAPACITY_HELD | CONFIRMED | activity booking authority | ConfirmActivityBooking | Required consent/eligibility and payment prerequisites confirmed |
| CONFIRMED | GO_DECISION_PENDING | activity coordinator | ReviewActivityDeparture | Configured minimum-participant and weather/safety decision time reached |
| GO_DECISION_PENDING | CLEARED_TO_RUN | authorised activity lead | ConfirmActivityGo | Minimum participants, instructor, equipment and safety prerequisites satisfied |
| CLEARED_TO_RUN | CHECKED_IN | activity staff | CheckInParticipants | Actual participants and required briefing/waivers recorded |
| CHECKED_IN | IN_ACTIVITY | assigned instructor | StartActivity | Qualified lead and session conditions ready |
| IN_ACTIVITY | COMPLETED | assigned instructor | CompleteActivity | Participants and equipment safely accounted for under the activity contract |

### Guarded variant bindings

The private/no-minimum variant skips the participant-threshold waiting stage only. It never skips instructor qualification, equipment, consent or safety clearance.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| CONFIRMED | CLEARED_TO_RUN | authorised activity lead | ClearPrivateActivity | Private/no-minimum rule explicitly configured; instructor, equipment, participant eligibility and safety conditions confirmed. Skips only minimum-participant decision waiting. |


Fulfilment and subtype variants:

- Private activities may have an explicitly configured no-minimum rule; public group sessions retain capacity and go/no-go checks.
- Adventure, workshop and family-session variants ask the appropriate participant/equipment facts without adding medical or safety claims from a checkbox.

Exceptions and recovery:

- Below minimum→REPLAN_REVIEW; offer approved alternatives or cancellation rather than silently moving the date.
- Weather/safety issue→RUN_BLOCKED; only the designated authority can clear it.
- Participant change requires new eligibility and capacity checks.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Capacity hold/reservation
- Participant count and eligibility references
- Go/no-go decision
- Attendance and completion

## WF_TOUR: Tour or multi-stop travel service

A dated itinerary with participants, supplier confirmations, departures and contracted inclusions.

Related questions: Q_TOUR_MODES, Q_TOUR_LANGUAGES, Q_DURATION_OPTIONS, Q_ACCOMMODATION_INCLUDED. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, ITINERARY_REVIEW, QUOTED, APPROVED, SUPPLIERS_CONFIRMED, READY_TO_DEPART, ON_TOUR, COMPLETION_REVIEW, COMPLETED. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | ITINERARY_REVIEW | tour planner | ReviewTourRequest | Dates, party, route and requested inclusions captured |
| ITINERARY_REVIEW | QUOTED | authorised tour planner | IssueTourQuote | Supplier availability/holds, prices, exclusions and expiry identified |
| QUOTED | APPROVED | customer | ApproveTourItinerary | Current itinerary/price and required deposit terms accepted |
| APPROVED | SUPPLIERS_CONFIRMED | tour/supplier authority | ConfirmTourSuppliers | Each contracted component has authoritative confirmation; unresolved items remain visible |
| SUPPLIERS_CONFIRMED | READY_TO_DEPART | tour coordinator | ClearTourDeparture | Guide, transport, participant documents and required briefing ready |
| READY_TO_DEPART | ON_TOUR | assigned guide | StartTour | Actual group departure confirmed |
| ON_TOUR | COMPLETION_REVIEW | guide | SubmitTourCompletion | Contracted stops/days/inclusions accounted for with exceptions recorded |
| COMPLETION_REVIEW | COMPLETED | tour authority | CompleteTour | Outstanding contracted components and complaints routed appropriately |

### Guarded variant bindings

Quote acceptance, supplier booking and payment remain independent facts. SUPPLIERS_CONFIRMED requires actual external confirmations where third-party commitments exist. A wholly locally operated tour uses the explicit internal-resource departure route instead.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| ITINERARY_REVIEW | APPROVED | customer and tour authority | AcceptFixedPublishedTour | Exact published itinerary/price version and inclusions accepted; quoted-custom path is not required. Acceptance does not mark payment complete. |
| APPROVED | READY_TO_DEPART | tour authority | ClearLocallyOperatedTour | No third-party supplier commitment exists in accepted scope; required internal guide/transport/resource reservations and payment prerequisites confirmed. |


Fulfilment and subtype variants:

- Fixed-price published tours may bypass quoting only with exact validated itinerary/price and confirmed supplier rules.
- Multi-day tours preserve day/stop structure and local timezones. Flights/accommodation listed as included require supplier confirmations, not synthetic bookings.

Exceptions and recovery:

- Unavailable component→ITINERARY_CHANGE_REVIEW and customer approval.
- Supplier response timeout remains unconfirmed, never a booking.
- Disruption during travel→TRAVEL_EXCEPTION with scoped support/escalation and approved replan.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Accepted itinerary/version
- Supplier/transport confirmations
- Participant/guide assignments
- Actual departure and completion exceptions

## WF_REQUEST_QUOTE: Request, quote and coordination

A merchant scopes a request, obtains a customer-approved quote and coordinates an explicit contracted outcome. This is the complete base for the nine concierge specialties.

Related questions: Q_RESPONSE_TARGET_MINUTES, Q_OFFERING_PRICE, Q_PRICE_CONFIRMATION_MODE. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, CLARIFICATION_PENDING, SCOPED, QUOTED, APPROVED, CONFIRMATION_PENDING, COMMITTED, IN_PROGRESS, DELIVERABLE_REVIEW, COMPLETED, ALTERNATIVE_REVIEW. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | CLARIFICATION_PENDING | assigned coordinator | RequestClarification | Only necessary missing scope/customer decisions requested |
| CLARIFICATION_PENDING | SCOPED | customer and coordinator | ConfirmRequestScope | Required scope, due date, location/budget and deliverables defined |
| REQUESTED | SCOPED | coordinator | AcceptCompleteScope | Initial request already contains all required scope |
| SCOPED | QUOTED | authorised quoting actor | IssueCoordinationQuote | Price/fees, third-party costs, exclusions, expiry and completion evidence specified |
| QUOTED | APPROVED | customer | ApproveCoordinationQuote | Current exact quote version accepted; payment remains a separately owned fact |
| APPROVED | CONFIRMATION_PENDING | coordinator | RequestSupplierConfirmation | Chosen provider/venue/supplier, explicit commitment authority and any Finance-confirmed pre-commitment prerequisite present |
| CONFIRMATION_PENDING | COMMITTED | supplier authority and coordinator | ConfirmCoordinationCommitment | Required supplier confirmations and references received; no guessed reservation |
| COMMITTED | IN_PROGRESS | assigned coordinator/provider | StartCoordinatedWork | Contracted execution can begin within approved scope |
| IN_PROGRESS | DELIVERABLE_REVIEW | coordinator | SubmitCoordinationOutcome | Contracted output or supplier execution evidence available |
| DELIVERABLE_REVIEW | COMPLETED | authorised customer/reviewer per contract | AcceptCoordinationOutcome | Agreed completion evidence accepted or contract-defined acceptance period satisfied |

### Guarded variant bindings

APPROVED records the customer accepting the exact scope/quote. A configured payment prerequisite gates a later supplier commitment or work start using Finance-confirmed state, not this approval transition. Advisory-only and fixed-fee branches are explicit, and external commitments always retain supplier confirmation.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| SCOPED | APPROVED | customer and authorised coordination actor | AcceptFixedCoordinationScope | Complete scope, exact fixed service price, expense bounds, deadlines and completion terms explicitly accepted; quote drafting is not required. |
| APPROVED | IN_PROGRESS | assigned coordinator | StartAdvisoryCoordination | Accepted scope is purely advisory/output-based with no third-party booking/purchase; required financial prerequisite is confirmed separately. |
| CONFIRMATION_PENDING | ALTERNATIVE_REVIEW | coordinator using supplier evidence | RecordSupplierDecline | Actual supplier refusal/unavailability received; no substitute commitment made. |
| ALTERNATIVE_REVIEW | QUOTED | authorised quoting actor | IssueAlternativeQuote | Material scope/date/price changes described; customer approval required again before commitment. |


Fulfilment and subtype variants:

- Pure advisory or plan-delivery work may move APPROVED→IN_PROGRESS with no supplier commitment only when the accepted scope explicitly contains no external booking/purchase.
- A fixed-fee coordination offering may bypass QUOTED after the customer accepts complete scope and exact price.
- Linked field, transfer, event, rental or service jobs retain their own authorities and are shown as child work, not silently marked complete when the coordination request closes.

Exceptions and recovery:

- Quote declined→DECLINED; expired→QUOTE_EXPIRED; a revised quote requires approval again.
- Supplier declines→ALTERNATIVE_REVIEW; customer approves material scope/price/date changes.
- Supplier outcome unknown→CONFIRMATION_OUTCOME_UNKNOWN; reconcile reference before another booking/purchase.
- Reimbursement, expense and refund requests use Money authority; the coordinator cannot mint paid or refunded status.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Approved scope and quote
- Explicit customer consent for third-party commitments
- Supplier/child work references
- Contracted output/acceptance evidence

## WF_PICKUP_RETURN: Collection, processing and return

The incoming and outgoing legs are independently configured, with custody, processing and pricing approval between them.

Related questions: Q_PICKUP_DELIVERY, Q_COLLECTION_MODE, Q_RETURN_MODE, Q_SERVICE_TURNAROUND, Q_PRICE_CONFIRMATION_MODE. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, COLLECTION_CONFIRMED, COLLECTED, RECEIVED_FOR_PROCESSING, ASSESSMENT_PENDING, PRICE_APPROVED, PROCESSING, READY_FOR_RETURN, RETURN_CONFIRMED, RETURNED, COMPLETED, AWAITING_CUSTOMER_COLLECTION. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | COLLECTION_CONFIRMED | collection authority | ConfirmCollectionLeg | Collection mode, location, time and actor confirmed |
| COLLECTION_CONFIRMED | COLLECTED | collection authority | ConfirmGoodsCollected | Incoming goods/count/condition and custody proof captured |
| COLLECTED | RECEIVED_FOR_PROCESSING | merchant receiving staff | ReceiveProcessingGoods | Merchant confirms custody and discrepancy record |
| RECEIVED_FOR_PROCESSING | ASSESSMENT_PENDING | merchant assessor | AssessGoods | Required item/weight/service checks recorded |
| ASSESSMENT_PENDING | PRICE_APPROVED | customer or fixed-price authority | ApproveProcessingPrice | Exact measured quote or fixed agreed price and turnaround accepted |
| PRICE_APPROVED | PROCESSING | assigned processor | StartProcessing | Approved work scope and required handling ready |
| PROCESSING | READY_FOR_RETURN | merchant quality staff | MarkProcessingReady | Processing and item/condition checks complete |
| READY_FOR_RETURN | RETURN_CONFIRMED | return authority | ConfirmReturnLeg | Return mode/location/time and actor confirmed independently |
| RETURN_CONFIRMED | RETURNED | return or customer-collection authority | ConfirmGoodsReturned | Outgoing custody/recipient proof confirmed |
| RETURNED | COMPLETED | processing authority | CompletePickupReturn | All accepted items returned or an explicitly resolved exception remains separately recorded |

### Guarded variant bindings

Incoming and outgoing variant selections are independent. A customer drop-off/customer collection pair must not create either carrier trip. Exact fixed-price processing may bypass assessment only if no weighing/diagnosis/condition-dependent repricing is required.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | RECEIVED_FOR_PROCESSING | merchant receiving custodian | ReceiveCustomerDropoff | Configured incoming mode is CUSTOMER_DROPOFF; item identity/count/condition and intake custody proof recorded. No collection carrier milestones created. |
| RECEIVED_FOR_PROCESSING | PRICE_APPROVED | processing authority using accepted price evidence | ConfirmFixedProcessingPrice | Exact fixed price/scope already accepted and no measured reassessment required; record reference without inventing customer approval. |
| READY_FOR_RETURN | AWAITING_CUSTOMER_COLLECTION | merchant custodian | OpenProcessedGoodsCollection | Outgoing mode is CUSTOMER_COLLECTION; collection window and customer notification request confirmed. |
| AWAITING_CUSTOMER_COLLECTION | RETURNED | merchant custodian | ConfirmProcessedGoodsCollection | Correct authorised recipient, outgoing item/count and collection proof confirmed. No return-carrier journey fabricated. |


Fulfilment and subtype variants:

- Customer drop-off enters RECEIVED_FOR_PROCESSING with intake proof, bypassing collection travel.
- Customer collection leaves READY_FOR_RETURN through a confirmed collection window and collection proof, bypassing return travel.
- Laundry/dry cleaning/ironing use specific item/weight/condition editors. Home/office cleaning uses WF_FIELD_SERVICE rather than fictitious clothing collection.

Exceptions and recovery:

- Count/condition mismatch→CUSTODY_REVIEW and customer acknowledgement.
- Customer rejects measured quote→RETURN_UNPROCESSED_PENDING with explicit return responsibility and permitted fees.
- Loss/damage→ITEM_EXCEPTION with evidence and separate financial resolution.
- Failed return keeps goods/custody status visible and reschedules only with authority.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Incoming and outgoing leg references
- Item/weight/condition intake
- Approved processing price/scope
- Processing and return proof

## WF_MEMBERSHIP: Membership or recurring entitlement

An entitlement lifecycle that links to bookings or service occurrences. A membership is not evidence that an individual service was delivered.

Related questions: Q_MEMBERSHIP_AVAILABLE, Q_MEMBERSHIP_TYPES, Q_BILLING_PERIOD. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, ELIGIBILITY_REVIEW, ACTIVATION_PENDING, ACTIVE, PAUSE_PENDING, PAUSED, EXPIRED, EXHAUSTED, CANCELLATION_PENDING, CANCELLED. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | ELIGIBILITY_REVIEW | membership authority | ReviewMembershipApplication | Requested plan and applicable eligibility/terms known |
| ELIGIBILITY_REVIEW | ACTIVATION_PENDING | customer and membership authority | ApproveMembershipTerms | Current terms, price, period and payment mandate/prerequisite accepted |
| ACTIVATION_PENDING | ACTIVE | membership authority | ActivateMembership | Authoritative entitlement and any payment prerequisite confirmed |
| ACTIVE | PAUSE_PENDING | customer or authorised merchant | RequestMembershipPause | Accepted pause policy and effective date permit request |
| PAUSE_PENDING | PAUSED | membership authority | ConfirmMembershipPause | Entitlement/billing effect confirmed by relevant authorities |
| PAUSED | ACTIVE | membership authority | ResumeMembership | Eligibility, capacity and billing requirements reconfirmed |
| ACTIVE | EXPIRED | membership authority | ExpireMembership | Authoritative entitlement period ended without confirmed renewal |
| ACTIVE | EXHAUSTED | entitlement authority | ConsumeFinalEntitlement | Authoritative usage ledger confirms remaining entitlement zero |
| ACTIVE | CANCELLATION_PENDING | customer/merchant per contract | RequestMembershipCancellation | Cancellation request and effective date valid |
| CANCELLATION_PENDING | CANCELLED | membership authority | ConfirmMembershipCancellation | Entitlement and applicable billing changes confirmed |

### Guarded variant bindings

Recurrence is not delivery. An occurrence command creates a linked child order/appointment/service job under its own applicable workflow, then records authoritative entitlement usage under the accepted policy.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| ACTIVE | ACTIVE | membership occurrence scheduler authority | CreateApprovedMembershipOccurrence | Accepted recurrence, remaining entitlement, exact occurrence slot/scope and connected owner permit creation; idempotency uses membership+occurrence ID. Child Work record has its own confirmation/execution lifecycle. |


Fulfilment and subtype variants:

- Session packs track exact uses; monthly access tracks period and access rules. Neither is a generic product stock count.
- Recurring cleaning/subscription goods create linked scheduled service/order occurrences only when frequency, consent and fulfilment setup are complete.

Exceptions and recovery:

- Payment unconfirmed leaves ACTIVATION_PENDING; no local active guess.
- Billing failure may restrict future entitlement only according to accepted policy.
- Usage dispute→ENTITLEMENT_REVIEW and reconciles authoritative usage rather than restoring arbitrary credits.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Accepted plan/terms
- Authoritative entitlement and period
- Usage references
- Pause/cancel and separate billing confirmation

## WF_FREIGHT: Freight or shipment

A route-, cargo- and unit-aware shipment with documented carrier/custody milestones and quote approval.

Related questions: Q_SHIPPING_WAYS, Q_PRICE_PER_KG, Q_PRICE_PER_CBM, Q_PRICE_PER_CONTAINER, Q_TRANSIT_ESTIMATE. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, CARGO_REVIEW, QUOTED, APPROVED, BOOKED, DOCUMENTATION_READY, COLLECTED, IN_TRANSIT, CLEARANCE_REVIEW, CLEARED, AT_DESTINATION, DELIVERED, CLOSED, COLLECTED_BY_CONSIGNEE. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | CARGO_REVIEW | freight specialist | ReviewFreightRequest | Origin/destination, cargo type, pieces, mass/volume and handling declarations captured |
| CARGO_REVIEW | QUOTED | authorised freight quoting actor | IssueFreightQuote | Chargeable units, mode, route, duties/fees scope, estimate and exclusions specified |
| QUOTED | APPROVED | customer | ApproveFreightQuote | Current quote and cargo/handling terms accepted |
| APPROVED | BOOKED | carrier booking authority | ConfirmFreightBooking | Carrier reference and required capacity confirmed |
| BOOKED | DOCUMENTATION_READY | authorised documentation reviewer | ClearFreightDocuments | Required cargo/customs documents reviewed for applicable route |
| DOCUMENTATION_READY | COLLECTED | origin carrier authority | ConfirmFreightCollection | Actual cargo and custody/condition proof confirmed |
| COLLECTED | IN_TRANSIT | carrier authority | ConfirmFreightDeparture | Actual mode/leg departure confirmed |
| IN_TRANSIT | CLEARANCE_REVIEW | customs/broker authority | RecordClearanceArrival | Route requires clearance and authoritative arrival/reference received |
| CLEARANCE_REVIEW | CLEARED | customs/broker authority | ConfirmFreightClearance | Actual clearance result received; no inferred regulatory approval |
| CLEARED | AT_DESTINATION | destination carrier authority | ConfirmDestinationArrival | Destination cargo receipt confirmed |
| IN_TRANSIT | AT_DESTINATION | carrier authority | ConfirmDomesticDestinationArrival | Route does not require a clearance stage |
| AT_DESTINATION | DELIVERED | destination fulfilment authority | ConfirmFreightDelivery | Consignee/cargo proof and contracted final leg complete |
| DELIVERED | CLOSED | freight work authority | CloseFreight | Outstanding cargo/document exceptions resolved or independently tracked |

### Guarded variant bindings

Core BOOKED→DOCUMENTATION_READY requires a route-defined document gate; the no-document branch is explicit. Core IN_TRANSIT→AT_DESTINATION is restricted to routes without customs clearance. Consignee collection is distinct from final carrier delivery.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| BOOKED | COLLECTED | origin carrier authority | CollectNoDocumentGateFreight | Route contract explicitly has no pre-collection documentation gate; cargo identity, booking and custody confirmed. Missing required documentation never satisfies this guard. |
| AT_DESTINATION | COLLECTED_BY_CONSIGNEE | destination warehouse/carrier authority | ConfirmConsigneeCollection | Accepted final mode is consignee collection at terminal/warehouse; authorised recipient and cargo/custody evidence confirmed. |
| COLLECTED_BY_CONSIGNEE | CLOSED | freight work authority | CloseCollectedFreight | Contracted final handover complete and outstanding cargo/document exceptions resolved or tracked separately. |


Fulfilment and subtype variants:

- Road/air/sea/rail share cargo concepts but use route-specific legs, ports and documents. Do not require customs on every domestic shipment.
- Warehouse onward transport creates separately confirmed legs. Per-container rates require container type; per-kg and per-m3 retain their units.

Exceptions and recovery:

- Document discrepancy→DOCUMENT_EXCEPTION; do not dispatch if owner policy blocks it.
- Customs hold→CLEARANCE_HOLD with authoritative reason and next actor.
- Carrier stale data→TRACKING_STALE without fabricated progress.
- Shortage/damage→CARGO_EXCEPTION and claim workflow; delivery status does not settle a claim.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Cargo/measurement records and quote
- Carrier booking/leg references
- Document/clearance evidence where applicable
- Custody and delivery proof

## WF_STORAGE: Storage allocation, custody and release

Space is reserved for a declared period and goods enter custody until an authorised release.

Related questions: Q_PRICE_PER_SQM, Q_PRICE_PER_SQFT, Q_WAREHOUSE_CAPACITY_SQFT, Q_BILLING_PERIOD. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, SPACE_REVIEW, QUOTED, APPROVED, SPACE_RESERVED, INTAKE_REVIEW, STORED, RETRIEVAL_REQUESTED, READY_FOR_RELEASE, RELEASED, CLOSED. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | SPACE_REVIEW | storage manager | ReviewStorageRequest | Goods, handling, required area/volume and storage dates captured |
| SPACE_REVIEW | QUOTED | authorised storage quoting actor | IssueStorageQuote | Exact unit, billing period, access/insurance scope and capacity proposed |
| QUOTED | APPROVED | customer | ApproveStorageTerms | Current quote, custody and access terms accepted |
| APPROVED | SPACE_RESERVED | storage inventory authority | ReserveStorageSpace | Authoritative exact capacity/location and dates reserved |
| SPACE_RESERVED | INTAKE_REVIEW | warehouse custodian | ReceiveStorageGoods | Goods identity, quantity, condition and custody receipt recorded |
| INTAKE_REVIEW | STORED | storage authority | ConfirmStorageIntake | Agreed goods accepted into a known storage allocation |
| STORED | RETRIEVAL_REQUESTED | authorised customer | RequestGoodsRelease | Customer authority and scope of requested goods verified |
| RETRIEVAL_REQUESTED | READY_FOR_RELEASE | warehouse authority | AuthoriseStorageRelease | Required access, payment/hold policy and goods availability confirmed |
| READY_FOR_RELEASE | RELEASED | warehouse custodian | ConfirmStorageRelease | Authorised recipient/carrier and outgoing custody proof confirmed |
| RELEASED | CLOSED | storage authority | CloseStorageAllocation | All goods released and capacity release confirmed; financial adjustments remain separate |

### Guarded variant bindings

A partial-release child uses retrieval request, release authorisation and custody evidence from the storage contract. The parent stays STORED and exposes child history; no capacity is released until the child confirms the actual outgoing quantity. Final release follows the primary graph.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| STORED | STORED | storage release application service | CreatePartialRetrieval | Only a subset of stored goods requested; create an idempotent child release with scoped recipient/hold checks. Parent allocation remains STORED. |
| STORED | STORED | storage authority using child-release evidence | ConfirmPartialGoodsRelease | Child release confirms custody transfer; reconcile remaining goods and occupied capacity atomically. Close allocation only after confirmed final release. |


Fulfilment and subtype variants:

- Partial retrieval keeps the allocation STORED with a child release record and reconciled remaining capacity.
- Customer collection and carrier pickup need different recipient/custody proof. No passenger journey, food prep or service appointment is implied.

Exceptions and recovery:

- Measured intake exceeds quote→ALLOCATION_CHANGE_REVIEW before extra charges/capacity.
- Disallowed goods→INTAKE_BLOCKED and explicit custody resolution.
- Inventory discrepancy→CUSTODY_EXCEPTION with access restriction and review.
- Overstay uses accepted billing policy and authoritative invoice calculation, not an invented fee.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Accepted storage terms/unit/period
- Capacity reservation
- Intake/condition inventory
- Release authorisation and custody proof

## WF_REGULATED_ENQUIRY: Regulated enquiry or professional referral

An enquiry, appointment request or referral in a regulated context. This workflow does not itself execute financial transactions, prescribe, dispense or certify professional decisions.

Related questions: Q_REGULATORY_LICENSE, Q_LICENSE_NUMBER, Q_VERIFICATION_EVIDENCE. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: SUBMITTED, TRIAGED, PROFESSIONAL_REVIEW, CLARIFICATION_PENDING, RESPONSE_READY, RESPONSE_DELIVERED, CLOSED, REVIEW_BLOCKED, REFERRED, DECLINED. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| SUBMITTED | TRIAGED | authorised intake staff | TriageRegulatedEnquiry | Minimum necessary purpose/contact/consent captured in permitted scope |
| TRIAGED | PROFESSIONAL_REVIEW | verified professional or authorised provider | AssignProfessionalReview | Current provider authority and appropriate service scope verified |
| PROFESSIONAL_REVIEW | CLARIFICATION_PENDING | authorised reviewer | RequestPermittedClarification | Only permitted minimum-necessary additional detail requested |
| CLARIFICATION_PENDING | PROFESSIONAL_REVIEW | customer and reviewer | SubmitClarification | Requested information securely provided |
| PROFESSIONAL_REVIEW | RESPONSE_READY | authorised provider | PrepareRegulatedResponse | Permitted response/referral/next-step decision completed by its authority |
| RESPONSE_READY | RESPONSE_DELIVERED | authorised provider system | ReleaseRegulatedResponse | Recipient authority, consent and secure channel satisfied |
| RESPONSE_DELIVERED | CLOSED | provider work authority | CloseRegulatedEnquiry | Contracted enquiry outcome recorded without implying an underlying transaction completed |

### Guarded variant bindings

REFERRED, DECLINED and REVIEW_BLOCKED are scoped enquiry outcomes. They never assert that money moved, insurance cover became valid, a prescription was dispensed or a professional result was delivered.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| TRIAGED | REVIEW_BLOCKED | verification/professional routing authority | BlockUnverifiedProfessionalReview | Required professional authority/evidence absent, expired or outside scope; expose allowed clarification/support only. |
| REVIEW_BLOCKED | PROFESSIONAL_REVIEW | verification and enquiry authorities | ResumeVerifiedProfessionalReview | Required evidence now authoritatively valid and assigned provider scope appropriate. |
| PROFESSIONAL_REVIEW | REFERRED | authorised professional | ReferRegulatedEnquiry | Enquiry outside current service scope and permitted referral route/customer consent recorded; no underlying transaction or diagnosis fabricated. |
| PROFESSIONAL_REVIEW | DECLINED | authorised professional | DeclineRegulatedEnquiry | Permitted service refusal reason recorded with appropriate privacy and next-step information. |


Fulfilment and subtype variants:

- Banking/forex/insurance/remittance/payment enquiries keep actual regulated transactions inside their separately authorised provider contracts.
- Clinical/lab/professional variants may create a linked appointment; result release requires its own authorised source and privacy controls.
- Business/legal/accounting advisory services need the correct professional scope and may link WF_REQUEST_QUOTE for permitted quoted work.

Exceptions and recovery:

- Missing/expired provider evidence→REVIEW_BLOCKED; no override through onboarding.
- Outside scope→REFERRED or DECLINED with permitted reason and legitimate route.
- Sensitive information in a wrong channel→ACCESS_REVIEW; minimise exposure and use approved handling.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Verified provider reference
- Scoped consent/purpose
- Professional response/referral authority
- Delivery and closure record with sensitive content restricted

## WF_SERVICE_JOB: Diagnostic, repair or workshop job

A service request may require diagnosis and approval before repair or processing.

Related questions: Q_REPAIR_SERVICES, Q_INSPECTION_TYPES, Q_OFFERING_PRICE, Q_PRICE_CONFIRMATION_MODE. Primary screens: SC_WORK, SC_OFFERINGS and SC_AVAILABILITY. Money effects reference SC_MONEY only through authorised financial contracts; evidence and connection setup belong to SC_BUSINESS/SC_SETTINGS.

Declared primary/variant states: REQUESTED, INTAKE_REVIEW, DIAGNOSIS, QUOTED, APPROVED, PARTS_PENDING, IN_SERVICE, QUALITY_REVIEW, READY_FOR_RELEASE, RELEASED, COMPLETED, FIELD_EXECUTION_PENDING. Exception states below are proposed named states requiring their own owner command and recovery decision.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| REQUESTED | INTAKE_REVIEW | merchant receiving staff | AcceptServiceIntake | Customer issue, item/asset identity, condition and custody/access recorded |
| INTAKE_REVIEW | DIAGNOSIS | qualified assigned technician | StartDiagnosis | Diagnostic scope and any diagnostic fee approved |
| DIAGNOSIS | QUOTED | authorised technician/quoting actor | IssueServiceQuote | Findings, parts, scope, price, expected completion and warranty terms stated |
| QUOTED | APPROVED | customer | ApproveServiceJob | Current quote/version and retained/replaced parts terms accepted |
| APPROVED | PARTS_PENDING | merchant parts authority | RequestServiceParts | Required parts identified; no available-stock assumption |
| PARTS_PENDING | IN_SERVICE | assigned technician | StartRepair | merchant_venue execution, required parts/resources and approved scope available, with any contract-required Finance prerequisite confirmed |
| APPROVED | IN_SERVICE | assigned technician | StartNoPartsService | merchant_venue execution; no parts needed or parts already authoritatively available, with any contract-required Finance prerequisite confirmed |
| IN_SERVICE | QUALITY_REVIEW | technician | SubmitServiceResult | Approved work performed and relevant test/report evidence attached |
| QUALITY_REVIEW | READY_FOR_RELEASE | authorised reviewer | ApproveServiceRelease | Checks and required customer review passed |
| READY_FOR_RELEASE | RELEASED | merchant custodian or field authority | ConfirmServiceHandover | Item returned or site-service completion accepted under configured mode |
| RELEASED | COMPLETED | service work authority | CompleteServiceJob | Contracted deliverables and unresolved exceptions accounted for |

### Guarded variant bindings

A fixed-scope service skips diagnosis/quote only under its explicit accepted-price binding. A mobile execution child owns travel and on-site execution; parent service-job progression mirrors its confirmed evidence, retains diagnostic/parts/quality ownership and never performs the same service twice. Core start commands require venue readiness or confirmed appropriate field readiness.

| From | To | Actor | Command/trigger | Additional guard |
|---|---|---|---|---|
| INTAKE_REVIEW | APPROVED | customer and authorised service actor | AcceptFixedScopeServiceJob | No diagnostic quotation is needed; exact fixed scope/price, asset/site and acceptance terms confirmed. Approval is not payment. |
| APPROVED | FIELD_EXECUTION_PENDING | service-job application service | CreateLinkedMobileServiceExecution | customer_location variant selected; one linked WF_FIELD_SERVICE execution reuses job scope and resource reservation. Parts prerequisites confirmed where needed. |
| PARTS_PENDING | FIELD_EXECUTION_PENDING | service-job application service | CreateLinkedMobileServiceExecutionAfterParts | customer_location execution; required parts now authoritatively available, accepted scope and any Finance prerequisite confirmed. Create or resume the one linked field child, never a duplicate. |
| FIELD_EXECUTION_PENDING | IN_SERVICE | service-job authority using field-child evidence | ConfirmMobileJobStarted | Linked field child confirms authorised on-site IN_SERVICE; parent mirrors the reference without starting another service execution. |
| QUALITY_REVIEW | IN_SERVICE | authorised quality reviewer | ReturnServiceForCorrection | A specific quality test failed; record approved correction scope. Price/time changes require renewed customer consent. |


Fulfilment and subtype variants:

- Mobile vehicle services/inspection can link WF_FIELD_SERVICE for travel and site arrival.
- No-diagnosis fixed-scope wash/maintenance may bypass DIAGNOSIS/QUOTED after an explicitly accepted fixed price and scope.
- Device repair includes asset/serial/custody and privacy checks; ordinary parcel delivery cannot prove a repair succeeded.

Exceptions and recovery:

- Diagnosis reveals changed scope→REQUOTE_PENDING and fresh approval.
- Parts unavailable→PARTS_EXCEPTION; communicate revised estimate without inventing a completion deadline.
- Customer declines quote→RETURN_UNREPAIRED_PENDING with approved diagnostic charges and return path.
- Quality failure returns to IN_SERVICE with reason, not silently completed.
- An uncertain external command stays OUTCOME_UNKNOWN at the operation layer; retain the last confirmed workflow state, reconcile the external reference, and replay only after the owner confirms it is safe.
- Permission loss stops the command and refreshes scope. Unsaved user input is retained only under the agreed privacy/draft policy.

Completion evidence:

- Intake/asset/custody
- Approved diagnosis/quote
- Parts/resource confirmations
- Quality checks and handover

## Complete concierge subtype resolution

The current source has nine empty workflow descriptions. Each now has an explicit coordination path based on WF_REQUEST_QUOTE. A subtype can skip supplier confirmation only when its accepted scope is purely advisory and contains no external commitment. Supplier outcomes and child execution must be confirmed before related promises are marked complete.

| Subcategory | Scope/clarification | Confirmation and execution | Required completion evidence |
|---|---|---|---|
| reservations | Venue type, date/time, party, eligibility, budget and special requests. | Customer approves terms; authorised venue/provider confirms booking reference. Link WF_APPOINTMENT/WF_EVENT_SESSION or relevant booking only when actually supported. | Valid supplier reservation, agreed terms and customer delivery; a sent enquiry is insufficient. |
| personal_assistance | Requested tasks, authority to act, deadline, expense limits and retainer scope. | Quote/retainer accepted; obtain explicit consent for each commitment. Link relevant execution work; pure assistance may proceed without supplier booking. | Agreed task checklist/output, expense references and customer acceptance. |
| shopping_assistance | Shopping list, variants, budget, substitution rules and delivery/collection preference. | Customer approves service/expense scope; purchases require supported payment authority. Link WF_ORDER for goods and its confirmed fulfilment leg. | Purchase/item references, substitutions approval, fulfilment proof and service outcome. |
| gift_sourcing | Recipient preferences, occasion, budget, message, packaging and deadline. | Supplier availability/price confirmed after approved scope; link WF_MADE_TO_ORDER or WF_ORDER as appropriate. | Approved gift/price/message, supplier outcome and recipient/customer delivery proof. |
| travel_planning | Travellers, dates, destination, budget, desired planning-only or booking service. | Planning-only delivers itinerary after approval; booking service requires explicit consent and supplier confirmations. Link WF_TOUR/WF_TRANSFER where relevant. Visa/insurance assistance does not establish approval/coverage. | Accepted itinerary or each contracted booking reference, exclusions and customer handoff. |
| property_coordination | Property authority, site/contact access, requested task, deadline and service area. | Owner/agent consent and provider confirmation; link WF_FIELD_SERVICE for site work, preserving access restrictions. | Provider task result, site handover/inspection evidence and authorised customer acceptance. |
| moving_assistance | Origin/destination, date, item inventory, weight/volume, floors/access, packing/equipment and insurance declaration. | Carrier/team and exact scope/quote confirmed; link WF_FREIGHT or WF_FIELD_SERVICE as applicable. | Item/custody at origin/destination, damage exceptions, actual carrier/service completion. |
| cleaning_coordination | Site, cleaning scope, schedule/recurrence, equipment split and access. | Provider and resource slot confirmed; link WF_FIELD_SERVICE, with recurring entitlement/occurrences only if explicitly configured. | Actual cleaning occurrence completion and customer review under the accepted policy. |
| vip_assistance | Confidential scope, priorities, contact authority, retainer/expense bounds and availability. | Verified assigned coordinator plus explicit commitment consent; link relevant specialist work with restricted access. A24h declaration does not guarantee staff presence. | Restricted task/output evidence, authorised expense/supplier references and acceptance. |

## State and scenario validation

For each profile, validate the selected workflow plus conditional variants against its question IDs and enabled components. Test a valid completion, a refusal/validation error, cancellation or expiry where applicable, duplicate delivery, outcome unknown, authority conflict, role/location denial and a configuration change with existing accepted work. Each subtype must be mapped in the128-profile matrix even when it shares a family. These scenarios are design fixtures until executed against a working implementation.
