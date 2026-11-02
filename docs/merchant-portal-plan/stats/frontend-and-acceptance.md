# Frontend implementation and acceptance for statistics

Date: 31 October 2026. Design only. This sequence extends existing onboarding, post-onboarding setup and Home components. Preserve their useful interactions and layout; replace fixed metric choices and fixed readiness assumptions through shared configuration.

## Existing frontend and the required change

`apps/web/components/merchant/home-setup.tsx` currently has a fixed seven-step checklist, including a test-order step. `home-performance.tsx` offers orders/sales and an optional demo booking series. `home-live.tsx` uses fixed order, booking and sales examples. The existing Analytics page is order/delivery based. These are useful starting components, not proof of adaptation.

The original eight-screen profile map remains intact. Home now has an explicit separate `SC_HOME` statistics binding in `stats/profiles-128.json`, referenced from each base profile. It is not silently treated as a ninth newly designed screen. Home's operational and metric extensions use the original Home specification plus this package.

## Build order and completion evidence

| Step | Frontend deliverable | Completion evidence |
| --- | --- | --- |
| ST01 Definition loading | Load versioned source, metric, workflow and 128 profile definitions through typed shared configuration | Every reference resolves; unsupported definitions produce an explained state rather than an arbitrary fallback to restaurant. |
| ST02 Onboarding requirements | Ask applicable questions about work, intake, fulfilment, resources, opening/schedule, stock policy and intended sources | All 128 specialties select coherent definitions; false, zero and unknown remain distinct; editing an answer previews changed modules and collection needs. |
| ST03 Setup Home | Build its requirement list from the resolved business, selected capabilities and confirmed demo requirement states | No test-order requirement for an enquiry-only business. No stock task for a service-only spa. A submitted document remains awaiting review. Progress uses one applicable required list. |
| ST04 Sample observation adapter | Supply labelled, deterministic sample observations in the same shape as future source contracts | Native/external/imported/manual/unknown sample states can be selected without any live call. Source labels remain visible; no real merchant records mutate. |
| ST05 Shared metric reader | Consume scoped source facts, deduplicate/revise them and calculate only supported registered metrics | Independent fixtures show exact contributing IDs, numerator/denominator, exclusions, period and quality state. Widgets do not each invent their own calculation. |
| ST06 Adaptive Home | Resolve current snapshots, due milestones, attention bindings, finance visibility and eligible trend measures | Selecting each specialty through onboarding changes the actual cards, units, filters and actions. The layout remains shared. Alert and chart numbers reconcile to their lists. |
| ST07 Insights reuse | Use the same metric queries/definitions for reports, filters, breakdowns and drill-down | The same query at the same cutoff produces the same Home and Insights value. Advanced calculations stay unavailable if their evidence is missing. |
| ST08 Category extension | Bind a synthetic future category to existing workflow/statistics definitions | It acquires Home and Insights automatically. An unknown metric, predicate, event mapping or new unsupported operation is rejected before activation. |
| ST09 Profile review | Walk through onboarding and portal for every specialty plus answer variants | Record each merchant's expected cards, chart choices, alert routes and unavailable states. Generated mapping checks alone do not count as runtime acceptance. |

No backend migrations, production collectors, credentials, real messages, payout operations or provider connections are part of these steps. Future source adapters replace the sample reader after their contracts and data access are implemented separately.

## Collection setup without burdening merchants

Most statistics collect automatically when merchants do normal work. Asking for an explicit completion or return confirmation is part of the workflow, not a second analytics form. Do not require users to enter a separate daily number for work already recorded.

Onboarding collects only configuration: what to track, relevant schedules/units and intended data sources. Resource and stock setup can be completed later as precise guided tasks. History starts at the confirmed coverage boundary; the portal says when tracking began.

A supported external source may provide current state only, full history, interval aggregates or specific event types. The connection preview lists which statistics this supports. An import maps IDs, units, timezone, period, source and duplicate policy with a dry-run summary. Manual business records are permitted only where that source class is supported and labelled Merchant reported. Typing a total is not a substitute for an authoritative financial, attendance or custody confirmation.

## Shared query and result shape

A proposed `StatisticsQuery` contains metric ID/version, business/location scope, workflow and predicate binding, offering/resource scope where permitted, half-open local-calendar period converted to instants, as-of cutoff, date basis, definition version, source selection and role-limited dimensions. User input never grants access or chooses an arbitrary source field.

A proposed `StatisticsResult` contains the same query identity; value or null; physical unit/currency; numerator/denominator/sample count where applicable; source IDs and provenance mode; covered interval and watermark; freshness and completeness separately; quality/reason; computed-at and as-of; report revision; excluded/unknown counts; and an authorized drill-down reference. A headline count may be complete even when a utilization denominator is missing. Missing finance access excludes financial data before calculating or caching.

The view model consumes results; it does not execute ad-hoc expressions or look into arbitrary provider payloads. `workflow-stats.json` predicates are readable selection specifications requiring typed implementation and tests before runtime. They do not introduce a second executable condition language beside the existing bounded answer-rule grammar.

## Conditional and hybrid behavior

- Resolve all applicable answer rules first. A primary workflow replacement loads that family's Home and Insights definitions and vocabulary. Remove obsolete appointment cards when work changes to service jobs.
- Keep secondary workflows in separately labelled groups. Add a single unique customer-work total only through `METRIC_WORK_COMPLETED_V1` and the confirmed root completion contract. Never add all family totals.
- With-driver rental adds joint resource requirements, not transfer volume. A separately selected transfer activity gets its own group.
- One rental can have collection and return milestones. Count each in its labelled milestone card; deduplicate a combined attention badge by root work and eligible actor action.
- A product sale and a home-visit execution linked to a parent are inspectable independently without becoming duplicate whole-business revenue or work.
- Share capacity by actual resource pool. Never add booked and actual utilisation or average percentages. Combine compatible numerators and denominators only when their physical unit, model and disjoint scope permit it.
- Current configuration determines today's navigation; historical work retains its original workflow and metric definition. Offer a labelled historical report when an activity is later disabled, subject to permission.

## New categories

The category-authoring manifest must reference supported workflow bindings and metric definitions plus typed extra requirements. A preview supplies sample answers, selected source capabilities and the resulting Home/Insights configuration. All references and required collection facts validate together with the onboarding form.

Existing workflows inherit their supported Home statistics. A new operation, physical unit, ratio denominator or metric needs an explicit definition, source facts, collection mapping, drill-down and acceptance examples. A category name or questionnaire field alone cannot create that evidence. Novel metrics remain unavailable until their implementation exists.

## Acceptance records

`scenario-coverage.json` checks all existing baseline/answer-variant design scenarios against statistics bindings. Its output is a design expectation, not evidence of a working app. `calculation-cases.json` contains separately authored numeric examples to detect meaning and arithmetic errors.

Runtime acceptance must independently exercise:

1. All 128 onboarding-to-Home journeys, with the exact cards/chart choices and irrelevant controls absent.
2. A future category composed from existing capabilities and an invalid metric reference rejected.
3. Appointment-to-job replacement, product-plus-appointment hybrid, rental driver option and separate transfers.
4. Duplicate events, native/external mirror identity, corrected/reversed completion, reopen episodes and versioned final completion.
5. A rental still overdue alongside otherwise punctual completed returns; an unanswered request alongside response-time metrics.
6. Rescheduled appointments, changed due times, cancellation, unfinished attendance and withdrawn/superseded quotes.
7. Resource overlap, maintenance, closure, travel buffers, a zero denominator and resource-scoped units.
8. Booking count versus participant places; member entitlement versus person; shipment versus milestone; root work versus children.
9. Multiple currencies, cost data absent, incomplete financial basis, pending refunds and a source timeout.
10. Current-state-only imports, partial historic data, stale feeds, lost permissions, unmapped states and conflicting authority.
11. Accessible chart table alternatives, mobile layout, keyboard controls and scope/period preserved through drill-down.
12. A closure with complete coverage showing zero activity versus an unobserved day showing a gap.

Record observed results and remaining limitations separately. No static fixture count or screenshot replaces these journeys.

## Automatic confirmation correction

[Automatic order confirmation](../order-confirmation.md) is the governing user correction. Native/API/webhook source-confirmed stock or resource availability normally confirms work automatically. Merchant acceptance is not a default intake policy or Home statistic. Human review requires an explicitly enabled, matching exception with a named reason. Unknown stock/connection outcomes remain pending or unavailable; they do not become manual approval tasks.
