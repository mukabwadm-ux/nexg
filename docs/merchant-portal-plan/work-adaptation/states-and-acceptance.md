# Work states and acceptance

Date: 31 October 2026. Status: proposed interaction design. This document extends the Work specification and automatic-confirmation correction. It describes what must be tested when the frontend is built; it does not implement commands, integrations, reservations or backend behavior.

The family scenarios below cover eighteen configured Work families, including `WF_SPACE_RESERVATION_V1` for explicitly enabled table/party/space reservations. The corresponding current workflow definition owns its actual state names and transitions. The user-facing labels below must bind to those definitions, not create an independent state machine in a screen.

## Governing behavior

Native, API and webhook confirmations have the same business meaning when supplied by the declared authority. Standard stock-backed orders and available resource-backed bookings confirm automatically. A merchant does not approve every incoming order or booking. Picking, preparing, checking in, inspecting, recording custody and confirming actual completion are operational tasks, not acceptance gates.

A human review action appears only for an explicitly enabled, matching exception with a named reason, actor and required input. A received record, unavailable stock, an interrupted connection or an unknown confirmation outcome never creates a manual acceptance queue by itself. Customer quotation/substitution approval and receiving-provider acknowledgement are separate actor-specific decisions.

Work presents three distinct kinds of state:

1. The confirmed business state, such as picking, active rental or confirmed appointment.
2. The source/read state, such as current, partial, stale or unavailable.
3. A pending user operation, such as a return confirmation awaiting its owner result.

A pending operation must not overwrite the last confirmed business state. A newly unavailable feed must not turn confirmed work into an empty list or a zero count.

## Common read and configuration states

| State | Queue and detail behavior | Available recovery or next action |
| --- | --- | --- |
| Initial loading | Preserve Work title, location, view and filter controls. Show skeletons only in requested regions and announce busy state. Do not show a temporary zero. | Closing an existing detail or navigating away remains available. |
| Populated/current | Show confirmed records, domain labels, next milestone, actor/source and the applicable next action. Identify scope and freshness without a repeated warning on every row. | Open a row, filter, inspect history or perform a permitted domain action. |
| No work yet | Say that no records exist for the configured activity and current known coverage. Give an applicable add/import/customer-link action only when implemented and permitted. | A useful destination or setup task; do not invent an order to demonstrate activity. |
| No active work | Explain that no current work matches the selected current-state view. Preserve access to upcoming and history. | Change view while retaining the merchant and location. |
| Filtered empty | Keep active filters visible and show that they produced no matches. This is distinct from a business with no records. | Clear the named filters or change a period; no forced onboarding restart. |
| Unconfigured activity | Show the missing operational input or source requirement for the relevant activity. Preserve unrelated configured activities. | Open the exact Business/Availability/source setup destination with return context. |
| Capability not applicable | Omit its operational controls and subtype columns. A service-only merchant does not receive product stock or food-preparation controls. | Inspect configured activities in Business where permitted. |
| Unsupported source operation | Show the record read-only with a concise reason beside the unavailable action. Do not render an apparently working local editor. | Open the supported provider destination or request/import alternative, where available. |
| Stock/resource confirmation pending | Label system confirmation pending and retain its source/operation reference. Do not add the record to confirmed-order/confirmed-booking counts. | Read or refresh the source result; no merchant Accept fallback. |
| Confirmed out of stock | Show the unavailable result and the affected lines. Do not confirm a new impossible order or put it into review. A later shortfall on existing confirmed work is its own source-reported exception. | Supported customer alternative, explicit substitution workflow or cancellation path; each retains the correct actor and owner. |
| Resource/capacity conflict | Identify the affected resource, interval and conflicting constraint at the permitted level. Preserve the attempted change. Never silently displace another booking. | Select an available alternative, change the proposed interval or abandon the draft. |
| Source partially loaded | Retain confirmed records and mark the incomplete activity, location or interval. List and summary counts must identify their actual coverage. | Retry only the affected source/region. Do not block an unaffected work family. |
| Stale source | Retain permitted last-confirmed records with their as-of time and explain affected actions. A fresh screen render is not fresh source data. | Refresh/reconnect through the supported route; disable only actions whose guarantees require current data. |
| Source unavailable/offline | Keep permitted cached information labelled with time and coverage. An unavailable source is not zero work. | Retry the read or repair the source connection. Do not claim an offline reservation, charge or final handover occurred. |
| Unmapped provider state/unit | Preserve the safe reference and show that meaning is unresolved. Do not translate unknown provider status into completed, cancelled or available. | Open the permitted mapping/source-repair route, retaining the affected record context. |
| External authoritative/read-only record | Display external reference, source and source-confirmed state. Editable local notes, if supported, remain clearly separate from authoritative facts. | Use mapped supported actions or the real provider destination. No force-complete or local state override. |
| External change during inspection | Refresh the changed region and identify the new version/state. Preserve nonsensitive input separately for an informed retry. | Recheck available actions and review material differences before submission. |
| Access denied/removed | Stop unauthorized reads and writes and clear protected detail/cache. Show a scope-appropriate message without revealing another merchant/location record. | Return to a permitted list/scope or use a real access-request route. |
| Session expired | Preserve only permitted nonsensitive draft state. Do not keep performing actions under an expired session. | Reauthenticate, recheck scope and reload the current record version before retrying. |
| Historical/closed record | Show immutable confirmed history and its originating workflow/configuration version. Do not rewrite its stages to match newly changed onboarding answers. | Inspect evidence or open a supported related case. Reopening requires an actual declared command, not editing the history text. |

## Common operation states

| State | Exact interaction behavior | Count and cross-screen effect |
| --- | --- | --- |
| Editing | Show the record, location, action and relevant consequences. Validate typed units, times and required evidence inline. | No confirmed counts, capacity or financial figures change. |
| Invalid input | Keep entered values; associate messages with fields and focus the relevant issue. A cross-field conflict explains both affected values. | No confirmed mutation. |
| Submitting | Acknowledge the action once, prevent duplicate submission and show a local pending state. Keep the last confirmed business stage readable. | Do not optimistically increment completions or free a resource. |
| Awaiting owner/source | Show what was requested, operation reference, source and known pending status. A provider receipt is not final business confirmation. | Keep pending separately from confirmed activity. |
| Confirmed | Read the owner-confirmed result and display the actual resulting state and next step. Close/retain the form according to the task, with focus restored. | Refresh affected Work rows, counts, Home summaries, Availability and permitted related records under the same scope. |
| Known rejected/failed | Explain a safe actionable reason, retaining recoverable input. Differentiate business rejection from transport failure. | Keep confirmed state unchanged unless the owner reports a separate actual transition. |
| Outcome unknown | Display the operation reference and the last confirmed state. Do not label unknown as failed or completed. | Reconcile/read back before any retry; never create duplicate reservations, custody records, orders or charges. |
| Concurrent revision | Compare the latest confirmed relevant fields with the attempted change. A stale action cannot overwrite a newer external/operator decision. | Revalidate a revised action against the current version; no silent last-write-wins. |
| Permission/state changed | Stop the proposed action and refresh its current eligibility. Keep only input the viewer may still access. | Explain the currently available path; remove unauthorized counts and financial detail. |
| Cancel/close | Close the draft and restore queue/filter/selection context. Warn only when actual unsaved input would be lost. | No business mutation. Cancelling a form is not cancelling work. |

## Counts and time semantics

Work counts support operating the queue. They are not a second performance dashboard. Do not fill the screen with sales, ratings or unrelated charts.

- Label current-state counts with an as-of cutoff and selected source/location scope. Label due counts with their scheduled period and reporting timezone. Label history counts by their registered outcome period.
- A rental may have handover and return milestones on the same day. Those are two explicitly labelled milestone counts, while a combined attention total deduplicates actual actionable work according to its registered grain.
- Counts must reconcile to the list they open at the same scope/cutoff, with partial coverage identified. A current source snapshot cannot produce a fabricated historical series.
- Unknown coverage never produces a clean zero. Filtered results never imply a whole-business total. Permission filtering happens before aggregation or drill-down.
- Deadline amendments preserve accepted versions. Current upcoming work uses the applicable current promise; historical punctuality retains its defined accepted-promise interpretation. A later change cannot silently erase missed work.
- Orders confirmed, operational work completed, invoiced amounts, payment received and payout are different facts. Monetary detail appears only with its actual definition and permission.

## Eighteen family acceptance scenarios

These are scenario specifications. Each needs independent frontend fixtures and later source/command verification; the existence of a row is not runtime acceptance.

| Case/family | Starting condition and interaction | Expected adaptation and result |
| --- | --- | --- |
| WA-F01 `WF_ORDER` | Native or connected source confirms stock and the order automatically. Operator opens a picking order, inspects lines and selects Mark ready after required picking/packaging is complete. | Items/quantity, selected fulfilment and promise fields appear. No default Accept/Decline gate. Pending readiness does not advance the confirmed stage; owner confirmation moves it to ready-for-handover and refreshes the queue. |
| WA-F02 `WF_MADE_TO_ORDER` | Fixed agreed specification proceeds automatically; an explicitly enabled unpriced specification exception requires a scoped quote/customer decision. | Show specification/version, production promise and current required operational action. Human review is tied to the specific unresolved scope, not every bespoke-category record. Production completion requires its actual evidence. |
| WA-F03 `WF_APPOINTMENT` | Source-confirmed staff/slot availability creates a confirmed appointment. Operator records arrival, starts and completes the service. | Show service, start/end, provider/resource and actual venue. No default appointment acceptance card. Attendance is not inferred from scheduled end; missing attendance remains undecided. |
| WA-F04 `WF_REMOTE_SESSION` | Available provider/session resources confirm automatically; the customer later needs a changed time. | Show session time, provider and safe access-readiness state. Supported reschedule retains input on capacity conflict. Session completion/attendance requires actual source confirmation; no clinical content is exposed. |
| WA-F05 `WF_FIELD_SERVICE` | A confirmed visit has an arrival window and assigned team. Operator records arrival and supported completion evidence. | Show service area/location instructions, team, arrival window and execution facts. A missing actual arrival can create an overdue exception; a transport outage does not create a manual acceptance gate. |
| WA-F06 `WF_RENTAL` | A self-drive booking is confirmed from asset availability and is now active. Operator opens it and records return condition/evidence. | Show vehicle/asset, rental interval, handover/return locations and accepted due time. Record return is the primary action. Pending return does not free the asset; confirmed return updates availability. No chauffeur or transfer fields appear in self-drive mode. |
| WA-F07 `WF_TRANSFER` | A source-confirmed transfer has a pickup window and vehicle/driver allocation. | Show passengers, pickup/drop-off and allocation. Operate actual arrival/trip milestones. A missed pickup stays visible; assigning a driver does not itself complete the trip or settle payment. |
| WA-F08 `WF_EVENT_SESSION` | Admission places are confirmed for a session; issuing tickets is a separate supported issuer operation. | Show session, admission quantity, ticket/issuer state and check-in. Confirmed places are not falsely labelled issued tickets. Check-in counts places/attendance under the declared grain. |
| WA-F09 `WF_GROUP_ACTIVITY` | A group reservation is confirmed against participant and instructor/equipment capacity. | Show session, party size, places and required instructor/resources. A booking of five people remains one booking and five participant places. Final attendance is distinct from booked capacity. |
| WA-F10 `WF_TOUR` | A confirmed departure and its participant bookings have source-confirmed supplier/resource commitments. | Show departure, itinerary, party size and guide/vehicle readiness. An enquiry is not a supplier reservation. Missing prerequisites open their actual operational task without erasing confirmed unrelated bookings. |
| WA-F11 `WF_REQUEST_QUOTE` | An enquiry is recorded automatically. Scoped work requires a quote and a customer decision before the agreed execution stage. | Show scope, current quote version, response promise and the responsible party. Sending the quote is not customer acceptance or payment. Superseded/open versions do not become accepted commitments. |
| WA-F12 `WF_PICKUP_RETURN` | Collection is confirmed, intake is measured and processing is underway; return is a separate upcoming leg. | Show both windows, current custody, measured item/weight units and processing state. Collection confirmation does not complete the cycle. Customer drop-off omits only the collection transport leg when configured. |
| WA-F13 `WF_MEMBERSHIP` | An entitlement is active and its accepted renewal deadline approaches. | Show plan, validity, access and the actual renewal cycle. Membership is an entitlement, not one completed appointment or a paid recurring debit. A renewal request stays separate from confirmed renewal and financial outcome. |
| WA-F14 `WF_FREIGHT` | Carrier booking is confirmed and an agreed shipment milestone is due. A provider sends an unmapped milestone token. | Show cargo units, origin/destination, leg, documents and known milestones. Keep the unmapped observation explicit; do not coerce it to delivered. Quote approval alone cannot create a carrier-booked shipment. |
| WA-F15 `WF_STORAGE` | A confirmed intake occupies an allocation and the customer requests a partial release. | Show space/allocation in original unit, custody, access period and release quantity. Preserve the remaining allocation, separate actual custody confirmation from scheduling, and do not add area, volume and pallet counts. |
| WA-F16 `WF_REGULATED_ENQUIRY` | An enquiry is recorded automatically and routed to an authorized provider. | Show administrative enquiry, contact mode, response and acknowledged handoff. A sent referral is not acknowledged until the receiving provider confirms. No account balances, lending decision, issued policy or remittance execution is inferred. |
| WA-F17 `WF_SERVICE_JOB` | A service/repair job has an assessed item and an agreed scope. An additional repair exceeds that scope. | Show item/asset, assessment, required customer scope decision, parts and promised release. Only the scope change uses its explicit approval path. Completion/release evidence is separate from customer payment and any later rework case. |
| WA-F18 `WF_SPACE_RESERVATION_V1` | A table/party/space reservation confirms automatically from the configured occupancy/capacity model; the customer changes party size. | Show venue/space, interval, party size and applicable seating/occupancy facts. Recheck capacity for the changed party; preserve the current confirmed reservation on conflict. A table booking is not a product order, issued event ticket or advance meal preparation task. Actual arrival/occupancy/release follows the declared source operations. |

## Hybrid and configuration-change acceptance

1. A spa enabling products gets service and product work groups with their own fields and next actions. Product quantities never become appointment counts.
2. A restaurant enabling table reservations gets a separate space-reservation work type alongside food orders. A table booking does not automatically create a meal order or preparation countdown.
3. A rental enabling a driver adds qualified driver/resource requirements inside rental work. Standalone transfer work appears only when separately configured.
4. A venue appointment fulfilled at a customer location creates a linked field-execution child only for that actual selected fulfilment. Parent and child remain linked; no duplicate root work, charge or capacity allocation.
5. A cancelled or disabled activity remains accessible in permitted historical context with its originating definition. New onboarding answers do not rewrite existing work.
6. A source outage in stock work does not blank a functioning appointment or rental feed. Each family's coverage and available actions remain explicit.
7. A generic All work view shows meaningful type labels and next milestones. It does not force unrelated domains into the same status sequence, duration or deadline.
8. A future category composed from registered definitions inherits the same Work states, actions and recovery. A new unsupported operation/detail schema remains unconfigured until it has a defined implementation.

## Mobile and accessibility acceptance

The phone queue preserves reference, work type, essential asset/service/item context, next milestone/time, status and next permitted action. Secondary fields remain available in clearly labelled details. Do not shrink an eight-column desktop table into unreadable text.

Opening a row uses a full-page task detail when a desktop side panel would be cramped. Back returns to the same scope, filters, sort and position. The record identity and action consequence remain visible while editing. Reflow/zoom must preserve essential content and avoid floating controls covering work.

Buttons perform actions and links navigate. Native keyboard order follows the reading order; controls have visible labels/focus. Open/close, loading, validation and confirmed/failed results have meaningful announcements without announcing every background refresh. Colour is accompanied by text and icons where helpful. Hover is supplementary, never the only access to a deadline, definition or action.

## Two concept pictures

Each image is one coherent populated Work screen, with the same NEXG shell and selected-record detail pattern. It is not a montage of variants or a picture with every modal simultaneously open. Necessary secondary features remain visible through named tabs/actions; their alternative states belong to the plan above.

### Stocked retailer

Show automatically confirmed product work. The selected order is currently Picking, with source-confirmed stock/allocation, item lines, quantities, fulfilment method, promised time, operator and a clear Mark ready action. Show its confirmed history and current source ownership. No generic Accept/Decline controls or Orders to review headline.

The order source, inventory source and execution owner can differ. State that relationship accurately rather than showing an editable stock balance owned by an external source. Confirmed, in-progress and completed counts must match their declared scope/date basis. Stock-check pending/out-of-stock results are distinct from confirmed orders.

### Self-drive rental

Show confirmed reservations, asset identities, rental periods, collection/return points and next milestones. The selected rental is Active. Record return is the primary action with the relevant condition/evidence requirements visible. No driver, airport-transfer or food-preparation controls appear unless separately configured.

Any overdue return in the queue must have a due time before the fictional cutoff and no confirmed return. A return scheduled later today cannot be labelled overdue. Pending return cannot show the same asset as already free. Inspection and any deposit/refund remain distinct facts.

### Picture consistency checklist

- Same navigation order, visual language, header context and operational hierarchy in both pictures.
- Clear fictional merchant/location, date, cutoff and timezone; persistent Preview data label.
- Queue selection, status, detail timeline and primary action agree.
- Counts, list contents, filters and pagination agree; no misleading whole-business totals.
- Due times, rental periods and overdue indicators are chronologically coherent.
- Monetary amounts show currency and their actual meaning only where the assumed viewer may see them.
- Source-linked/read-only fields and editable execution controls follow the chosen authority model.
- Customer display is minimal; no full contact details, clinical notes, credentials or sensitive evidence images.
- No setup developer controls, category registry IDs or implementation text in the merchant interface.
- Images illustrate adaptation and information hierarchy. They do not prove accessibility, live integrations or runtime correctness across all128 specialties.
