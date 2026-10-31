# Work

Screen ID: SC_WORK. Status: proposed design. Inherits the shared screen contract. Planned first, after the onboarding/configuration foundation.

## Purpose and boundaries

Help the merchant identify what needs attention, inspect the complete task, perform the next permitted action and confirm who owns the next step. Work holds operational records and their histories. Offerings defines what can be sold; Availability owns future capacity; Money owns financial truth. Requests, accepted quotations, confirmed bookings, issued tickets and paid transactions remain different facts.

Entry points include Home attention cards, notifications, a scoped queue link, a customer-linked request and an authorized external-system record. Return preserves location, work-type filter, sort, page and selected record. Work opens a single-location action scope even when the queue aggregates several locations.

## Layout and information hierarchy

Header: Work, selected business/location and an honest source summary. Immediately below: Needs attention, Upcoming, In progress and History views, with counts only for known coverage. A work-type selector appears when several activities are enabled. Priority exceptions precede the main queue without a wall of competing cards.

Desktop uses a readable queue with a contextual detail panel. The queue's shared columns are reference, work type, customer display identity, scope, next milestone/time, status, responsible party and next action. Amount appears only with financial permission and the correct definition. Domain-specific columns can replace low-value defaults: rental vehicle and return time, appointment service and start, shipment route and milestone. Columns are configurable within an approved view definition.

Detail contains the task summary, necessary operational fields, participants, offering lines, schedule, location/fulfilment, current stage and permitted primary action. Supporting tabs are Activity, Communication, Related records and permitted Financial details. Do not reveal clinical notes, provider credentials or unauthorized customer data.

## Feature and action inventory

| ID | Feature, inputs and display | Action, guard and result |
| --- | --- | --- |
| WK01 | Scoped work queue, work type, phase, period and counts | Read domain-owned task summaries. A partial source names missing coverage. Single-type merchants omit the redundant type selector. |
| WK02 | Search by permitted reference/customer display name/asset | Search within scope; debounce reads, preserve query and support clear. Do not expose arbitrary external personal identifiers. |
| WK03 | Filters: location, workflow, stage, owner, fulfilment and meaningful due range | Show applied filters; clear restores the named default. Filtered empty has R04 recovery. |
| WK04 | Sort and saved view | Sort by defined event time or explicit priority. Save personal/shared view only with permission; remove it without changing work. |
| WK05 | Attention and overdue exceptions | Open the precise task and failed milestone. Display the actual deadline and reason; no universal cooking countdown. |
| WK06 | Task detail and linked parent/child records | Open by stable reference, preserve origin, show subtype-specific fields and source identity. Access checks apply to deep links. |
| WK07 | Accept, decline or acknowledge incoming work | Use that workflow's command and eligibility checks. Acknowledge receipt does not automatically confirm a booking or payment. Decline collects an applicable reason. |
| WK08 | Assign/reassign staff, driver, asset or team | Show compatible available resources, permissions, time overlaps and affected location. Confirm owner result; conflict returns current allocation. |
| WK09 | Start and progress work | Render only transitions declared by the workflow/version and current state. Show resulting responsibility and refreshed queue. |
| WK10 | Prepare/send quote, accept recorded customer approval | Typed scope/line prices/expiry and terms references. Price comes from authorized rules or a permitted quote author. Approval and payment remain separate. Version changes need renewed acceptance. |
| WK11 | Schedule, hold, confirm or reschedule | Link to Availability's supported reservation commands; show who can confirm and the capacity consequence. A requested time is not a reservation. |
| WK12 | Fulfilment instructions and handoff | Render delivery/collection/visit/digital/coordination fields and owner actions. A provider acknowledgement and actual handoff are distinct milestones. |
| WK13 | Rental collection and return condition | Asset, agreed dates, condition checklist/evidence and discrepancies; command records custody and availability changes. Do not settle a deposit from a condition checkbox. |
| WK14 | Pickup-return custody and processing | Link both legs and item/weight records. Track failed collection, processing and return independently. Show the current custodian where confirmed. |
| WK15 | Appointment attendance or session check-in | Confirm/check-in/start/complete/no-show where supported. Staff/resource availability and membership eligibility remain source-owned. |
| WK16 | Shipment milestones and documentation | Show dimensions/units, origin/destination, required documents and confirmed tracking events. Mark external milestones read-only when appropriate. |
| WK17 | Cancel, stop or exceptional resolution | Show current terms and impact on capacity, fulfilment and any refund request. Request financial resolution through Money; cancellation is not a refund confirmation. |
| WK18 | Linked customer/team communication | Existing permission-scoped thread or verified channel; explicit send and delivery states. Header Help opens support with safe context. |
| WK19 | Attachments and operational evidence | Allowed document types, size/retention rules and authorized access. Upload pending/failed/replacement; no arbitrary sensitive medical/financial document capture. |
| WK20 | Activity/history and related financial record | Actor, event time, transition, source and operation reference. Financial breakdown requires its own grant; history cannot be edited as a task field. |
| WK21 | Eligible bulk actions | Select records, preview per-record eligibility and scope, execute only declared bulk-safe commands and report partial outcomes. Avoid bulk financial or custody completion by default. |
| WK22 | Manual new record/import | Present only supported work schemas; preserve provenance and price authority. A manually entered external booking needs duplicate/reference checks. |
| WK23 | Integration status, refresh and unresolved change | Explain the affected record/operation, last confirmed event and read-only source link. Retry a read; reconcile A07 before repeating a command. |
| WK24 | Export, print and share | Authorized fields, selected filters/timezone and coverage; track export generation and expiry. Sharing must use an approved scoped link, not expose a raw provider identifier. |

## Workflow-specific interpretation

Use the versioned workflow catalogue, not an arrow-separated string. Product orders have preparation/picking only where configured. Made-to-order work includes scoped approval and production. Appointments expose requested/confirmed/attendance states. Rentals need reservation, collection, use and return. Transfers need pickup/assignment/trip milestones. Event sessions expose capacity and issuer-confirmed ticket/check-in information. Tours include itinerary/participants and departure. Requests move through qualification, quote and agreed fulfilment. Freight includes shipment-specific milestones; storage includes receipt, occupied capacity and release. Memberships expose entitlement and renewal state. Financial categories default to regulated enquiries/provider handoff, without transaction controls that the platform does not own.

Hybrid work types share a queue shell but retain their state names, due-time meanings and detail schema. A rental with a chauffeur is not automatically an airport transfer; each selected activity is explicit.

## States, transitions and recovery

All WK reads cover R01–R12; actions cover A01–A10 as applicable. Attention counts describe confirmed coverage. Unconfigured workflows show the Business setup requirement. A task whose source is disconnected can remain readable with freshness and constrained actions. A reschedule conflict shows current resource/time and alternatives, retaining the merchant's proposed change.

An accepted task records workflow and configuration versions. A new category configuration cannot replace its state machine mid-task. Duplicate arrivals reconcile by owner/external reference. Unknown dispatch, quote, cancellation or completion outcomes show their operation reference until reconciled. A task completed operationally can still have a separately pending payment or payout.

## End-to-end journeys

1. **Rental:** open confirmed reservation → inspect asset/dates → check resource allocation → record collection evidence → confirm collection through the owner → see in-use state → record return condition → owner confirms return and recomputes availability. A discrepancy opens its appropriate case; it does not create a financial deduction.
2. **Appointment:** inspect requested service/time → validate staff/capacity → confirm through booking owner → customer reschedules → compare capacity → confirm new time → check in/complete. Permission removal stops further writes.
3. **Quote-based shipment:** inspect request and dimensional fields → ask for missing detail → draft authorized quote → send → await acceptance → confirm booking according to owner → track shipment. Unmapped provider milestone remains visible as a mapping issue.
4. **Hybrid product/service:** filter Orders or Appointments → perform the type-specific next action → return to combined queue with preserved context. A stock outage does not blank the functioning appointment feed.

## Mobile and UX rationale

Mobile queue rows retain reference, work type, next milestone, status and primary action. Open a full-page task detail with a labelled Back; keep secondary data grouped under clear headings. The current task context remains visible above any form.

Recognition motivates the explicit next action and domain terminology. Proximity keeps exceptions beside the relevant milestone. Progressive disclosure keeps complete history accessible while prioritizing the current task. Selective emphasis distinguishes an actual deadline from routine metadata. Fitts's Law informs reachable, separated primary controls. These are design decisions to validate with merchants, not evidence of usability success.

## Acceptance scenarios

- WK-T01: rental fixture, operator scoped to one branch, confirmed booking → collection command → pending → confirmed in-use; asset capacity updates in Availability and Home's task summary refreshes.
- WK-T02: same rental switches with-driver answer; only the applicable resource/assignment details appear, and existing self-drive work retains its original configuration.
- WK-T03: beauty hybrid combines product and appointment work with separate stages and filtered-empty states.
- WK-T04: external source owns booking; no local force-complete action; supported write pending followed by timeout stays unknown until reconciliation.
- WK-T05: no financial permission hides amounts and denies direct Money links while permitted task work remains usable.
- WK-T06: two operators reschedule the same asset; the stale revision loses safely and retains the attempted input for correction.

Apply the 128-profile fixtures to this screen and exercise inherited states. The future-category validation must resolve its new workflow and detail schema without a hard-coded category branch in the queue.
