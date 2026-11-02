# Adaptive merchant statistics

Date: 31 October 2026. Status: design complete for review; no runtime collection, calculations, connectors or frontend changes implemented by this package.

This extends the earlier portal plan with an explicit Home statistics configuration for every current specialty. The earlier plan is copied into the existing **MERCHANT WORKSPACE** so future frontend work can use one local package. The original Documents checkout remains a historical copy. The original Home design is preserved at [home-screen-spec.md](../home-screen-spec.md); the specifications below extend it.

## The merchant experience

Onboarding asks what the business actually offers, how it accepts work, what resources and fulfilment it uses, and which source maintains each kind of record. Those answers select the relevant statistics automatically. A merchant never has to design a dashboard or know a metric ID to obtain a useful Home screen.

Home answers: what needs attention, what is scheduled, what is happening now, and what has recently happened? Insights answers: how has the business performed, why did a figure change, and which records explain it? Both use the same versioned definitions and scope. A Home total must agree with the corresponding Insights report and filtered Work list at the same cutoff.

The mechanism is shared; the selection and wording change. A rental merchant sees active rentals, collections and returns due, overdue returns and actual asset use. A spa sees appointments, requests awaiting confirmation, staff capacity and appointment outcomes. A spa selling products gets a separately labelled product-work and stock section. It does not add product units to appointment counts.

## Read the complete plan

1. [Collection contract](collection-contract.md): source records, ingestion, validation, aggregation, corrections, freshness and privacy.
2. [Workflow bindings](workflow-stats.json): Home cards, alerts, chart choices and exact selection predicates for all 17 workflow families.
3. [Metric catalogue](../domain-registry.json): the existing performance definitions plus new operational and optional business metrics. Each has source requirements and a collection specification.
4. [All 128 merchant mappings](profiles-128.md) and [machine-readable mappings](profiles-128.json): named Home and Insights configurations with answer-dependent variants.
5. [Frontend build and acceptance](frontend-and-acceptance.md): onboarding-to-Home flow, presentation, fixture collection and evidence required before live data.
6. [Scenario coverage](scenario-coverage.json), [independent calculation examples](calculation-cases.json) and [verification evidence](verification.json).

## Sources and what they can establish

| Source | Collection | Relevant statistics | Limitation |
| --- | --- | --- | --- |
| Confirmed work | Accepted workflow transitions, current work snapshots, accepted milestones and evidence | Requests, work requiring action, completions, response time, turnaround, lateness, quote decisions | Clicking Accept or Complete is intent. It is not a confirmed transition. |
| Availability and resources | Published schedules, staff/asset rosters, closures, maintenance, reservations, releases, actual occupation | Remaining bookable capacity, booked utilisation, actual rental use | Opening hours alone cannot establish resource capacity. Booked time and actual use remain separate. |
| Inventory | Available-to-promise balances, reservations, measured units and configured thresholds | Low-stock exceptions and product availability | Missing stock is unknown. A merchant's catalogue does not prove stock on hand. |
| Finance | Approved financial read models with their basis, currency, reversals and source records | Sales, refunds, fees, payable, payout and overdue invoices where supported | Work completion, accepted order value, paid cash and payable are different facts. No profit without attributable costs. |
| Discovery | Permitted first-party offering views and explicit actions, with declared session/identity and coverage rules | Views, enquiries/booking intents and valid conversion cohorts | A view is not demand, an enquiry is not a sale, and uninstrumented traffic is not zero. |
| Promotions | Confirmed placement/campaign delivery, permitted engagement and finance-confirmed spend | Campaign spend and attributed results where supported | Attribution requires a declared model/window. It does not establish causal lift. |
| Feedback | Moderation/publication results and permitted rating aggregates | Published review count and rating with sample size | Private feedback and pending reviews are not public ratings. No cross-service invented score. |
| Requirements | Applicable requirement lists and owner-confirmed states | Setup completed/remaining, renewal or document attention | Submission and verification are distinct. Only applicable required steps enter the setup denominator. |

Existing ERP/API systems, files, permitted manual entries and future NEXG modules feed these same source contracts. They are ingestion modes, not additional copies of the business fact. Each metric declares whether it can use confirmed events, snapshots, imported history or merchant-reported records. Onboarding chooses intended sources; actual source coverage determines which values are available.

## Automatic configuration, end to end

1. Resolve selected activities, location, work intake, fulfilment, resources, source authority and current viewer scope using the existing onboarding plan.
2. Apply answer rules before choosing statistics. Replacing appointments with walk-in jobs replaces the appointment cards and charts. With-driver rental adds resource needs while remaining rental work.
3. Select the primary workflow's Home bindings and each separately enabled secondary workflow's bindings. Resolve labels using the specialty vocabulary. Shared resources use one resource pool.
4. Check the definition's required facts, history, units, permissions and source support. Enabled is different from measurable. Show setup guidance for missing prerequisites and no fabricated value.
5. Choose Home attention counts, relevant scheduled/current counts and an available performance chart. Register all eligible measures as chart choices; do not force a utilisation chart when only completion history exists.
6. Keep financial figures in a separately permissioned money summary. Add optional discovery, campaigns and feedback summaries only when enabled, collected and useful. Detailed analysis belongs in Insights.
7. Bind every card, chart and alert to its exact filtered destination, carrying workflow, location, date basis, period, cutoff and metric version. A user can inspect contributing and excluded records where permitted.
8. Reconfigure on an onboarding change through a preview. Preserve historical workflow/definition versions and explain changes in comparability. New capabilities do not fabricate historical activity.

The 128-row matrix is an explicit review surface. Workflow bindings are the reusable source of behavior, so adding a compatible future category does not require a new dashboard implementation.

## Home and Insights presentation

Home has a stable structure: business/readiness state, attention, relevant upcoming/current work, and a compact performance section. Group information by the merchant's question. A number has a label, scope, date basis, unit and source state; detailed formulas and contributing records open on demand. Important overdue work stays visible alongside a favorable punctuality percentage.

Card count follows the work, not a fixed design rule. A self-drive rental may need both collection and return counts. A simple enquiry business may need only received, awaiting response and provider handoff counts. Secondary activities can be expanded in their own sections. Necessary information remains reachable without filling the initial Home view with every metric.

Current snapshots say **As of [time]**. Scheduled counts say **Due today**, **Appointments today** or the actual selected horizon. Outcome totals say **Completed today/this week**. They cannot share an ambiguous generic Today label. Date selection changes scheduled/outcome periods; it does not pretend that an as-of current snapshot was a historical snapshot.

Use one meaningful trend by default with labelled measure choices and a table alternative. Completion counts use columns by local day; resource use uses a clearly defined ratio series; session-based metrics can use session rows rather than a misleading daily chart. Missing days remain gaps until source coverage proves zero. Hover can add detail but cannot contain the only definition or value.

## Data truth and edge cases

- Unknown, no records, zero, no applicable capability, not collected, insufficient history, partial coverage, stale and access removed are different states.
- A current snapshot can support current work counts. It cannot reconstruct last month's funnel, duration or no-show rate without history.
- Every ratio carries the actual numerator, denominator, exclusions and sample count. A zero denominator is unavailable, never 0% or 100%.
- Preserve booking, participant, entitlement, asset, root customer work and child execution grains. Do not add incompatible counts or physical units.
- Replayed events and external/native mirrors count once. Linked return/visit/installation children do not double count unique root customer work.
- Rates among completed cases remain labelled as such and are paired with outstanding overdue or undecided cases. Open quotes and pending attendance cannot improve the rate.
- Monetary figures remain separated by currency and accounting basis. Cost, tax, fee and refund rules remain their owners' definitions; missing definitions make the dependent figure unavailable.
- Discovery conversion and campaign attribution require compatible cohorts, identity rules and an approved observation window. They remain unavailable until those inputs exist.
- Administrative health and financial-service enquiries retain their existing exclusions. No clinical outcomes, customer bank balances, lending decisions or provider remittance volume appear through category inference.

## Scope of the next build

The next implementation phase is frontend only: local onboarding answers, a shared configuration resolver, clearly labelled sample observations, calculated sample statistics, state/recovery examples and profile switching. No live source, backend, Supabase or ERP integration is implemented here. Collection contracts describe how later confirmed data can replace fixtures without redesigning the portal.

Planning checks validate references, 128 mappings, conditional scenario coverage and independent arithmetic examples. They do not establish that the application, data collection or all 128 runtime journeys work.

## Automatic confirmation correction

[Automatic order confirmation](../order-confirmation.md) is the governing user correction. Native/API/webhook source-confirmed stock or resource availability normally confirms work automatically. Merchant acceptance is not a default intake policy or Home statistic. Human review requires an explicitly enabled, matching exception with a named reason. Unknown stock/connection outcomes remain pending or unavailable; they do not become manual approval tasks.
