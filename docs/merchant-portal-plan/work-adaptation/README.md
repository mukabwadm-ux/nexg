# How Work adapts to every merchant

Date: 31 October 2026. Status: design specification and concept references. No application or backend work is included. Onboarding implementation remains last; preserve the approved initial post-onboarding screen and existing Home design.

## What is shared and what changes

Every merchant uses the same Work destination, business/location context, queue, search/filter controls, task detail and action-state components. Actual selected offerings, answers, fulfilment, resources and source ownership configure its content. A category does not create a separate application or automatically activate all its candidate services.

The differences are operational, not just a changed title: work nouns, visible queue fields, milestones, stages, detail sections, evidence, responsible actor, available actions, filters and exception handling change together. A product order has items and a fulfilment promise; a rental has an asset, interval and return; a party reservation has spaces, arrival and turnover. A mixed business keeps these distinct work types in one workspace.

## Current definitions and precedence

Use the current [reconciled manifest](../../booking-engine/payload-reserve-plan/reconciliation/manifest.json), its effective profiles, workflows and question definitions. The historical 29 October profiles provide audit identities and vocabulary only. Their superseded conditional rules must not run alongside the current rules.

The later [automatic confirmation correction](../order-confirmation.md) governs confirmation. The current imported workflow snapshot still contains older generic `AcceptOrder` wording. This Work design overrides that presentation: normal native/API/webhook stock-confirmed orders proceed automatically. An ordinary booking also needs no human approval when its authoritative configured resources confirm it. Review appears only under a supported matching exception with a concrete reason, actor and required input. Source failure, unavailable stock and unknown capacity never become merchant acceptance tasks.

Do not edit another chat's booking-engine implementation or generated snapshots to produce these concepts. The Work design records its source hashes and the confirmation overlay separately. Future frontend integration must consume one consistent effective configuration with this user correction applied.

## Files and review order

1. [Shared workflow views](workflow-view-catalog.json): 18 distinct Work graphs across the 15 supported structural models.
2. [All categories and subcategories](profiles-128.md), with [full configuration records](profiles-128.json).
3. [States and acceptance](states-and-acceptance.md): read/write/source states, workflow-specific journeys, hybrids and mobile behavior.
4. [Two image briefs](image-briefs.md), [selected images](images/README.md) and image provenance.
5. [Mapping verification](verification.json): reference and coverage checks, not runtime acceptance.

## Configuration sequence

1. Read the scoped merchant's configured activities and the actual selected offering/work model. Category defaults suggest setup; they are not completed setup or activated services.
2. Resolve the current typed answer bindings, including selected fulfilment and optional capabilities. Preserve missing, false and conflicting answers as different states.
3. Choose the correct workflow graph for the selected model. One model can have different graphs: venue appointments versus remote sessions, events versus group activities, and coordination requests versus regulated provider enquiries.
4. Load that view's vocabulary, columns, detail sections, milestone rules and action references. Add relevant specialty context from the selected offering and accepted work terms, not every field from the merchant's onboarding form.
5. Resolve current work state, source-owned facts, viewer/location scope and the owner's allowed actions. A component's existence never grants an action. Read-only sources keep their confirmed data inspectable and explain the available source route.
6. Render the relevant queue and details. Show a meaningful next action only when its prerequisites are known; otherwise identify the actual waiting party, missing setup or source issue.
7. After a permitted operation, show pending until confirmed. Refresh the same record and affected queue counts, Home task summary, Availability or Money through their owners. Operational completion is separate from financial settlement.
8. Preserve the accepted workflow/configuration version for existing work when the merchant adds/removes activities. Current configuration can change future work; it must not rewrite past commitments.

## Shared screen layout

Keep all nine destinations reachable: Home, Work, Offerings, Availability, Business, Money, Promotions, Insights and Settings. The selected merchant/location, source freshness, Help and notifications remain in the common header.

Work has a stable title and a relevant work-type label. A work-type selector appears only when several activities exist. A single-location merchant sees a location name without a redundant dropdown. A permitted multi-location view identifies each record's location and requires a clear single-location scope for an action.

The view controls are Needs attention, Upcoming, In progress and History, with relevant counts and meaningful periods. Display no fabricated count when a source is missing. These views can overlap: an overdue active rental can be both In progress and Needs attention. Their counts must never be added into an apparent unique total.

Below the controls, use one scoped search, relevant filters and a queue. Desktop can show the selected record in a side detail region. No selection shows the complete queue and a calm prompt; it does not invent a record. Dense operational tables may scroll with stable row identification. Mobile opens one full-page detail with a labelled Back and restores the queue context.

The queue always makes the work reference, work type where mixed, next milestone, stage and responsible party understandable. Each view replaces less relevant columns with its domain fields. Do not force food preparation, rider assignment, a monetary amount or a booking date into every business.

The detail region groups the actual work, upcoming milestone, required evidence and next permitted action. Activity, communication, related records and permitted financial details are available without turning the entire page into a form. A row-selection control and its actions have distinct keyboard targets. Links navigate; buttons act. One primary execution action is emphasized, while other legitimate actions remain reachable.

## Adapting the operational content

| Work graph | Main queue/detail changes | Relevant execution |
| --- | --- | --- |
| Stocked/prepared order | Actual items, quantity, stock result, fulfilment and promise | Pick/prepare only when configured, mark ready, confirm custody |
| Custom production | Specification/version, agreed scope, production due | Required customer proof/quote decision, production, quality, handover |
| Venue appointment | Service, start/end, provider, location | Check-in, service execution, attendance |
| Remote session | Provider, session time, access readiness | Access, session start/end, interruption and attendance |
| Customer-location visit | Service area, arrival window, assigned team | Travel, arrival, execution, result evidence |
| Rental | Asset, interval, collection/return milestones, condition | Handover, active use, receive return, inspection |
| Transfer | Pickup/drop-off, party, vehicle/driver if applicable | Arrival, boarding, trip milestones; greet-only uses its own variant |
| Event admission | Session, confirmed admission places, actual issuer state | Issue/validate only where supported, check-in |
| Group activity | Dated session, participant places, instructor/equipment | Session readiness, attendance, execution |
| Tour | Departure, itinerary, party, guide/vehicle and supplier commitments | Actual departure readiness and tour milestones |
| Request/quote | Scope, response promise, current quote/customer decision | Clarify, quote, agreed execution; no fake stock order |
| Collection/processing/return | Two linked windows, custody, intake unit, processing | Collection/drop-off, processing, return/collection |
| Membership | Entitlement, validity, access and renewal cycle | Supported access/renewal and separately linked occurrences |
| Freight | Cargo quantities/units, route/leg, documentation, milestone | Carrier confirmation and actual custody/tracking |
| Storage | Allocation, original physical unit, period, custody/release | Intake, partial/full release and extension |
| Provider enquiry | Administrative enquiry, provider, response/handoff | Permitted response and acknowledged provider referral |
| Service/repair job | Item/asset, assessment if needed, scope, parts, release | Actual assessment, agreed service, quality and handover |
| Table/space reservation | Party, interval, compatible table/space, arrival | Arrival, seating/use, departure and turnover release |

The [128-row matrix](profiles-128.md) specifies which of these views each specialty can use and which questions/conditions affect it. Different source labels can map to the same reusable execution shape while retaining their own work vocabulary and meaningful fields.

## What specialty answers change

- A rental's with-driver option adds joint eligible vehicle/driver allocation within rental. A self-drive rental has no driver controls. Transfer work requires a separately selected transfer activity.
- Venue service, customer-location service and remote service reveal different place, travel, resource and execution sections. A linked visit preserves its parent/root identity and shared allocation; it does not duplicate the commercial work.
- Optional appointments remain available even if advance booking is not mandatory. Walk-ins consume the real same resource/session/space pool when they are allocated.
- A restaurant's reservation-system declaration is a discovery fact. Table work appears only after explicit table-booking intent and compatible space, party, interval and turnover setup.
- Product sales alongside services add a separate product-order type. Sourcing unavailable products does not imply custom manufacturing. Recurrence does not create a membership or authorize a recurring payment.
- Customer drop-off removes an unnecessary collection leg. Customer collection removes an unnecessary return dispatch leg, while processing and custody remain visible.
- Item/weight/time/space pricing changes the work's typed quantity and accepted terms. Price approval appears only when an actual configured adjustment requires it. A quote's customer decision remains distinct from merchant approval to receive ordinary work.
- Health work is administrative scheduling/coordination. Regulated financial categories show permitted provider enquiries and handoff, not clinical records, customer balances, remittance execution or lending outcomes.

## Information remains complete and calm

Context decides the layout. Keep the next milestone and action close to the record, use familiar operational words, distinguish labels with text as well as color, and group supporting facts under clear detail headings. Show actual urgency only where a confirmed deadline supports it. Preserve full required data and history through detail and explicit links.

Recognition, proximity, consistency and progressive disclosure support these decisions. They do not justify hiding required evidence, imposing an arbitrary number of cards/columns or turning every work type into an order. Work is an operational workspace; full performance charts belong in Insights.

## Source, action and state behavior

The native system and supported API/webhook sources produce the same operational facts. Provenance is per fact: inventory can be externally owned while the order's execution is native. A mirrored stock description does not prevent a supported local handover command, and a local button cannot edit an externally owned field.

Needs attention describes actual permitted actions or confirmed operational exceptions, not all incoming work. Confirmation pending, awaiting the customer, awaiting a supplier, out of stock and source unavailable each explain who or what is blocking progress. They are separate from a rare explicit merchant-review task.

The full state matrix is in [states-and-acceptance.md](states-and-acceptance.md). It covers loading, true empty, filtered empty, missing setup, partial/stale sources, pending confirmation, conflicts, unknown outcomes, access removed, evidence failure, source corrections and recovery. Confirmation, execution, capacity and payment remain separate dimensions.

## Future categories

A new category references an existing supported model and Work graph, supplies vocabulary and registered specialty fields, defines its typed answer bindings and source/fulfilment requirements, and previews the resulting queue/detail with test work. Onboarding and Work publish compatible configuration together. The number 128 is a baseline, not a hardcoded renderer limit.

Unknown workflow, field, action, unit or evidence references fail validation. A genuinely new operation needs a registered schema, workflow, action contract and view extension before activation. Existing historical work remains inspectable; unsupported new work never falls back to a restaurant queue.

## The two concept images

Both images use the same shell, typography, spacing and queue/detail structure. One is a stocked retailer's automatically confirmed order being picked. The other is an active self-drive rental approaching its return. Only the operational fields, milestones, stages and actions change.

They illustrate a coherent populated state, with Preview data visible. All other planned states remain in the specification rather than being stacked into one picture. These are visual demonstrations; application adaptation and all128 runtime journeys require implementation and testing.
