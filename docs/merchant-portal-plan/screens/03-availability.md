# Availability

Screen ID: SC_AVAILABILITY. Status: proposed design. Planned after Offerings. Inherits the shared screen contract.

## Purpose and boundaries

Answer when a merchant can accept a particular kind of work, at which location and against which resources or capacity. Opening hours, published listings, free vehicles, staff rosters and accepting new work are distinct. Availability defines future operating rules and authorized exceptions; Work handles a specific booking or job, and stock quantity remains inventory-owned.

The screen selects relevant models from configuration: hours, appointments, dated sessions, exclusive assets, group capacity, collection/return windows or response coverage. A hybrid merchant may use several views. Never render Breakfast/Lunch/Dinner, preparation minutes or a calendar for an activity that does not use them.

## Layout

Header shows business/location and the selected availability model, timezone and freshness. A compact summary names real blockers such as '2 vehicles unavailable' or 'Thursday hours missing'. Main views are Calendar/Timeline, Rules, Resources and Exceptions where applicable.

Hours can use a weekly interval editor. Appointments use a day/week resource calendar. Rentals use asset rows across dates. Events use dated session/capacity rows. Freight and quote-based work can use service windows and response ownership without implying real-time capacity. Each view has an accessible agenda/list alternative.

## Features and action contracts

| ID | Feature/data | Interaction and result |
| --- | --- | --- |
| AV01 | Capability/location/model selector | List only configured models and permitted locations. Preserve model/date/resource context across navigation. |
| AV02 | Date range, timezone, today and agenda | Use configured timezone and visible date boundaries; change view without altering operational data. |
| AV03 | Operating hours | Add/edit one or more intervals per day, closed days and overnight spans; validate ordering and overlap. |
| AV04 | Schedule templates and inheritance | Apply declared business defaults or location overrides with a before/after scope preview. Show inherited versus overridden fields. |
| AV05 | Exceptions, holidays and closures | Set date/range, scope and reason; preview existing work affected. A closure does not cancel confirmed bookings silently. |
| AV06 | Appointment slots | Exact service durations, buffers, lead time, booking horizon and compatible resources. Show derivation and unavailable reasons. |
| AV07 | Staff/service eligibility | Link authorized staff resources, qualifications where owner-verified, location and service eligibility. Team membership alone does not imply bookable availability. |
| AV08 | Staff shifts, breaks and absence | Edit rosters or show source-managed schedules; exact intervals and conflict feedback. |
| AV09 | Asset calendar | Show asset identity, reservations, holds, in-use and maintenance intervals; distinguish unknown from free. |
| AV10 | Asset availability and maintenance | Block/release an asset under owner policy, reason and revision; preview affected future work and route reassignment to Work. |
| AV11 | Sessions and group capacity | Add/edit dated session, capacity, resources and booking window; reserved, held and remaining counts use one consistent owner snapshot. |
| AV12 | Collection and return windows | Configure linked windows, turnaround and transport/processing constraints for pickup-return services. A return promise needs its own feasible window. |
| AV13 | Service area/transport eligibility | Inspect coverage for enabled methods; edit scoped coverage through Business/fulfilment owner. Remote work is not blocked by delivery-zone status. |
| AV14 | Holds and reservations | Inspect owner-confirmed hold, expiry and responsible work; create/release only supported scoped commands. Expiry is not assumed from the browser clock. |
| AV15 | Capacity adjustments | Change permitted pooled capacity with reason, effective dates and overcommit preview. Reject reductions below obligations unless a documented exception process resolves them. |
| AV16 | Accepting/busy/pause | Scope to location and capability, choose supported reason/expiry and show impact on new work. Busy can alter only the applicable owner-defined behaviour. |
| AV17 | Recurrence and subscriptions | Define series rules, end conditions and exception handling with a preview of generated occurrences. Each occurrence retains actual booking status. |
| AV18 | Conflict and overbooking resolution | Show records/resources/times in conflict; open reassignment/reschedule or escalate. Do not silently delete a reservation. |
| AV19 | Customer availability preview | Evaluate a date, offering, location, quantity and fulfilment method; show bookable/request-only/unavailable and why. |
| AV20 | Copy/import/export schedules | Explicit source/target scope, compatible model and timezone conversion preview; preserve external IDs, report partial import and export authorized data. |
| AV21 | Search/filter and resource grouping | Filter offering/resource/status/source without hiding relevant blocking context; explain filtered-empty results. |
| AV22 | Change history and pending synchronization | Actor/source, effective dates, operation state and last confirmed schedule. Conflict returns current revision. |
| AV23 | Integration ownership and refresh | Source-managed fields are read-only or route to supported remote commands. Stale/unknown capacity restricts confirmation according to contract. |
| AV24 | Save/review/revert draft rules | Validate rule dependencies, preview customer/work impact, submit and confirm through owner. Revert draft does not reverse a confirmed external reservation. |

## Rules and independent states

Slot availability is derived from a declared model: operating/service intervals, eligible resource intervals, existing confirmed reservations and current valid holds, capacity constraints, lead time, buffers, exceptions and relevant fulfilment eligibility. The owner must reserve atomically; a free-looking cell is not proof that a booking can be confirmed.

Exclusive asset reservations and shared-capacity sessions need different collision rules. Customer visits may consume staff and travel buffers. A digital service may require only staff/virtual-session capacity. A request/quote activity without a reliable live capacity owner offers request intake rather than instant confirmation.

Operational states include unspecified, scheduled open/closed, accepting/paused, free/held/reserved/in-use/maintenance, capacity available/full, source unknown and conflicting, only where the model defines them. Permissions and owner confirmation apply independently. All inherited R/A states remain required.

For external capacity, show freshness and the response semantics the connection actually supports. If it can only read a calendar, NEXG must not promise a confirmed reservation through a local write. When an atomic request times out, preserve its operation reference and reconcile before resubmission.

## Journeys and side effects

1. **Rental:** choose vehicle timeline → inspect confirmed returns and maintenance → block an available interval → preview affected requests → confirm block → discovery removes affected booking options. Existing confirmed work follows explicit resolution rather than disappearing.
2. **Appointment:** define service duration and staff schedule → add a break → preview slots → customer requests overlapping time → owner rejects conflict and supplies alternatives. The schedule remains the last confirmed revision.
3. **Laundry:** configure collection window, processing lead time and return window → preview customer promise → change one leg → revalidate both legs and affected future work.
4. **Group session:** choose dated workshop → adjust capacity → validate existing holds/bookings → owner confirms. Expired holds disappear only after owner confirmation, not a client timer.

Confirmed rule changes update discovery and Home acceptance summaries. Work is notified of affected future tasks. Offerings references remain intact; Insights distinguishes schedule edits from actual utilization. A pause affects new intake, with existing obligations visibly retained.

## Responsive and UX decisions

Desktop supports a date/resource timeline with a clear legend and textual states. Mobile defaults to an agenda by day and resource; inspect/edit one interval in a full-page form. Provide labelled previous/next/date controls and keyboard alternatives to dragging. Dragging a reservation is a proposed edit requiring validation, never an invisible immediate command.

Familiar calendars aid recognition only when the activity uses dates. Common region groups exact duration, buffers and lead time. Proximity puts a conflict beside the time/resource involved. Progressive disclosure exposes advanced recurrence and inheritance while current exceptions stay visible. Show the complexity the merchant needs to make a safe commitment.

## Acceptance scenarios

- AV-T01: rental profile excludes cooking controls, supports vehicle reservation/return/maintenance and prevents an incompatible overlap.
- AV-T02: changing home-service to yes adds service-area/travel requirements and changes feasible slots only under declared rules.
- AV-T03: location override across midnight retains timezone/date meaning; copy preview does not silently shift appointments.
- AV-T04: read-only external calendar cannot accept a local confirmation; unknown capacity is not displayed as free.
- AV-T05: session capacity reduction below commitments fails with a recovery path; a duplicate retry does not release two holds.
- AV-T06: new-category service using existing appointment capability receives staff slots and exact-duration questions automatically.

Evaluate all 128 configurations against the appropriate model and inherited states. Do not require every merchant to use a calendar.
