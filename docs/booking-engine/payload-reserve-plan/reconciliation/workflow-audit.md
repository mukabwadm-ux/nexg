# Workflow reconciliation audit

Date: 31 October 2026. Read-only audit of the source plans, followed by proposed corrected planning bindings. No application, database or external system was changed. The source catalogue contains 17 workflow families; the Payload plan contains 15 composable models. Their counts differ deliberately because remote appointments share an appointment allocation model, regulated enquiries share nonblocking intake semantics, and work lifecycles remain more specific than allocation models.

The machine-readable [workflow bindings](workflow-bindings.json) are the corrected implementation-planning view. They provide all 17 source family mappings, exact transition guard replacements, allocation/work-state separation, greeter-only execution and a separately declared space-reservation workflow. Original historical profile fixtures must not be compiled alongside these corrections as separate active configurations.

Static checks found all 17 source workflow IDs mapped, all 23 command/from/to guard overrides resolving to actual source rows, and no unknown source state in the 18 explicit exception bindings. The exception bindings cover the 17 source families plus the new space workflow. Fifteen model-level intake allowlists prevent the shared question enum from advertising instant confirmation for ordinary requests, production, freight, storage, workshop jobs or entitlement enrollment. These are planning-reference checks, not executed booking tests.

## Resolved gaps

| Gap | Affected source IDs/commands | Resolution |
| --- | --- | --- |
| Confirmed with-driver rental before driver capacity | `WF_RENTAL.ConfirmRental`, `RequestRentalDriverAssignment`, `ConfirmRentalDriverAssignment` | Guarantee all contracted asset/driver capacity at customer confirmation. Later assignment is operational binding to that guarantee. Failed substitution preserves the original allocation. |
| Confirmed trip before resource check | `WF_TRANSFER.ConfirmTransfer`, `AssignTransferVehicle` | Driver/vehicle capacity must be authoritative at confirmation. Later dispatch assignment is not the first availability check. An implemented guaranteed class-pool policy is required if exact identity is deferred. |
| Greeter-only service forced through passenger journey | `meet_greet`, `WF_TRANSFER` | `VAR_TRANSFER_GREETER_ONLY` records greeter approach, meeting and greeting completion. No vehicle, boarding or destination states unless transport is explicitly part of the offering. |
| Tour supplier route weaker than local route | `WF_TOUR.ConfirmTourSuppliers` | Require supplier references, all controlled guide/vehicle/place allocations and only configured payment prerequisites before a firm customer commitment. Accepted itinerary is not a reservation. |
| Return capacity checked only after processing | `WF_PICKUP_RETURN.ConfirmCollectionLeg`, `ApproveProcessingPrice`, `ConfirmFixedProcessingPrice`, `ConfirmReturnLeg` | Declare firm preaccepted versus assessment-required promises. Every firm role is feasible and reserved when accepted. Later return dispatch reuses the promise; an unassessed return stays explicitly indicative. |
| Group booking repeats exclusive instructor reservation per attendee | `WF_GROUP_ACTIVITY.HoldActivityCapacity`, `ConfirmActivityBooking`; event/session capacity model | Reserve instructor/venue once per occurrence, while attendee bookings consume its shared place pool. Preserve cross-session conflicts and real equipment quantities. |
| Restaurant table mapped to generic staff appointment | `restaurant`, earlier `WF_APPOINTMENT` conditional mapping | Declare `WF_SPACE_RESERVATION_V1` with party compatibility, table combinations, arrival, seating and turnover. Explicit reservation offering and authority are required. Existing-system discovery does not activate it. |
| Every pending request could become a blocking Payload reservation | All quote, enquiry, order and entitlement models | Store nonblocking work separately. A Payload blocking row corresponds to an actual reservation role, not merely a form submission. Temporary holds, confirmed allocations and operations are distinct. |
| Common booking component erases specific enquiry lifecycle | `WF_REGULATED_ENQUIRY` to model `REQUEST_QUOTE` | Preserve administrative review/referral states and source authority. Shared model supplies nonblocking intake only; no compulsory quote, payment or financial execution is introduced. |
| Scheduled product window becomes fabricated appointment/pickup-return job | `WF_ORDER`, optional scheduled fulfilment | Use one selected fulfilment-window role linked to the same order. A single chosen collection/delivery window is not automatically paired laundry processing. |
| Planned end interpreted as actual resource release | `WF_RENTAL`, `WF_STORAGE`, generic Payload completion | Keep physical use/custody and allocations distinct. Overstay or uncleared goods needs a visible blocking exception and recovery; planned end alone cannot make an asset free. |
| Cancellation/expiry/reschedule mostly prose, with no shared adapter mapping | All reservation-bearing workflow families | Add a shared operation/authority contract and require explicit valid source-state lists in compiled workflows. Preserve original commitments until a change succeeds. Refund outcome remains independent. |
| Timezone repeated as merchant setup despite Kenya-only decision | Source profile availability and tour timezone prose | Resolve every operative schedule to `Africa/Nairobi`. Retain UTC timed instants and Kenya date-only values internally. No timezone onboarding field or country expansion controls. |

## Additional contract corrections

The earlier domain registry's `AVAIL_STOCK_HOURS_V1.requiredInputs` lists a calendar and reservation policy for stocked orders. Those are not universal appointment requirements. The effective order model requires stock/price/fulfilment authority; schedule/window inputs become required only when the selected method uses them.

`AVAIL_EVENT_CAPACITY_V1` requires an issuer policy, while the source event graph already supports non-ticketed admission. Resolve its effective issuer requirement conditionally: actual ticketed issuance needs a supported issuer, booking-reference admission needs its own one-time entitlement consumption policy. Do not manufacture ticket IDs.

`AVAIL_SESSION_CAPACITY_V1` lists instructor/equipment pools without applicability. Exact occurrence setup must distinguish required, supplied-partially and not-required equipment. `equipment_provided` legacy enum meaning cannot be compressed into an assumed boolean; offering declarations specify actual required resources before admission or confirmation.

The source profile `SC_AVAILABILITY.operationalQuestions` repeats appointment duration, resource selection and service-area prompts for all 128 profiles, with a prose relevance note. Effective question materialization must select model-specific requirements rather than copying the full list into retail, enquiry, freight or storage forms. A required setup field is not a merchant answer until actually collected, validated and owned.

## Allocation and money boundaries

`commonReservationLifecycle` in the bindings is a logical contract rather than a claim about exact native Payload status names. The adapter must map the inspected hold mechanism, blocking reservation statuses and external mirrors without confusing them with business work states.

`intakeModesByModel` is an applicability constraint, not a second source-authority setting. `order_acceptance` and `plan_enrolment` describe their own non-reservation journeys; they must not be inserted into the booking-intake question as if they were appointment confirmation modes. Other model allowlists constrain the question's applicable values, and the actual connection capability can restrict the choice further.

For every firm commitment, identify the allocation owner per scope/data class. NEXG-local multi-resource and capacity mutations share a transaction. Remote carrier/ERP/supplier operations need their own supported confirmations and reconciliation; a local transaction cannot atomically lock arbitrary remote systems. A Google event is an optional mirror or busy constraint, not another booking writer.

No family requires prepayment simply because the plugin supports payment hooks. The accepted offering policy determines no-prepayment, deposit, prepayment or another supported arrangement. Finance-confirmed prerequisites gate only applicable transitions. Booking cancellation, release, refund and payout remain separate commands and states.

## Build entry and evidence

These artifacts resolve design semantics, not operating proof. Before enabling production commands, materialize the exact workflow/variant transitions, required fields and permissions; implement the missing capability/adapter contracts; then execute family, specialty, concurrency, access, time-boundary, source-failure and recovery checks. The broader coverage register supplies all 128 specialty contexts; these bindings provide consistent workflow semantics for them.
