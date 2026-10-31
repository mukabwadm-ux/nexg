# Insights

Screen ID: SC_INSIGHTS. Status: proposed design. Planned after Promotions. Inherits the shared screen contract.

## Purpose and boundaries

Help merchants understand activity and performance using metrics relevant to their enabled workflows. Show what happened, over which period and scope, and the records behind it. Work handles a task now; Money explains authoritative financial figures. Insights must preserve their definitions and link back to evidence.

The same reporting components support different metric sets. Rentals can examine reservation conversion and asset utilization; appointment businesses can examine requested/confirmed/completed appointments and usable staff capacity; retail can examine orders/units and permitted stock exceptions; freight can examine shipment milestones; quote-based services can examine response and accepted quotes. Only configure a metric when its source events and definition support it.

## Layout

Header fixes period, timezone, location, capability and source coverage. Overview shows a small meaningful selection of metrics with definitions and comparison context. Report groups are Work, Offerings, Availability/resources, Customer feedback, Promotions and authorized Financial performance. Groups appear according to configuration and grants.

Each report has a titled chart or table, scope/period/units, last update, definition and drill-down. A text/data-table alternative is always available for charts. Put a data-quality notice beside affected metrics rather than covering the whole screen with repeated warnings.

## Feature inventory

| ID | Feature/data | Interaction and meaning |
| --- | --- | --- |
| IN01 | Configured overview | Render relevant registered metric cards with scope, period, unit and coverage. Missing source is unavailable, not zero. |
| IN02 | Period and comparison | Presets/custom dates with timezone; comparison must use comparable definitions and coverage. Label calendar versus business-day boundaries. |
| IN03 | Location/capability/source filters | Filter permitted dimensions; preserve context through drill-down and Back. Show mixed/partial scope honestly. |
| IN04 | Metric definition | Open numerator/denominator, event timestamps, exclusions, currency, cohort, update frequency and source contract. |
| IN05 | Work volume and funnel | Show only meaningful domain stages: requested, confirmed, started/completed, cancelled and other declared transitions; no universal 'delivered' completion. |
| IN06 | Response and service timing | Defined start/end events, median/distribution or agreed aggregation, incomplete cases and exceptions. Do not infer processing time from unrelated timestamps. |
| IN07 | Offering performance | Compare compatible offering types/units, published periods and actual work outcomes. Product units and service appointments are not one quantity. |
| IN08 | Asset/staff/capacity utilization | Explicit usable-capacity denominator, reserved versus actual-used numerator, maintenance/closure exclusions and timezone. No occupancy claim when capacity data is incomplete. |
| IN09 | Availability and lost opportunity | Show confirmed full/unavailable/request-rejected events where instrumented. Absence of a booking does not prove lost demand. |
| IN10 | Cancellation/no-show/exception reasons | Owner-defined reason categories, count/denominator and permission-scoped record drill-down. Preserve unknown/unclassified separately. |
| IN11 | Repeat activity/customer feedback | Use approved identifiers, consent and privacy rules. Separate repeat bookings from unique people and requested reviews from published reviews. |
| IN12 | Promotion performance | Campaign delivery, qualified actions and attributed outcomes with window/model and limitations. A post-view purchase is not automatically causal lift. |
| IN13 | Financial report | Finance-defined sales/refunds/fees/net measures with currency, posting basis and relevant Money link. No substituted payout estimate. |
| IN14 | Chart interaction | Accessible legend, data-point detail, series selection and table view; no action depends solely on hovering or colour. |
| IN15 | Breakdown and drill-down | Open the exact authorized Work/Offering/Availability/Money list with metric filters retained and denominator explained. |
| IN16 | Saved report | Save permitted period/dimensions/metrics and personal/shared visibility; loading rechecks current grants/definition versions. |
| IN17 | Scheduled delivery | Only where a real reporting/notification capability exists; explicit recipients, scope, frequency, consent and delivery state. Otherwise remain an unavailable proposed capability. |
| IN18 | Export | Authorized data/format, source coverage, definition version, timezone, units/currency and generation/expiry state. |
| IN19 | Data freshness and mapping quality | Last successful source update, missing intervals, unmapped events and their effect on each metric. Link Settings repair with safe context. |
| IN20 | Annotation/context | Display source-confirmed closures, campaign dates or relevant operational changes. Merchant notes are labelled notes, not verified causes. |
| IN21 | Refresh/recalculate | Read the reporting owner; explicit long-running generation state and operation reference. Do not double-submit generation after unknown outcome. |
| IN22 | Report access/history | Definition revisions and approved report access/audit where required. Old and new metric versions are not silently compared. |

## Metric registry and adaptation

Each registered metric includes stable ID/version, label, question it answers, applicable capabilities, owner, required events, aggregation, numerator/denominator where relevant, date basis, timezone, dimensions, units/currency, permitted roles, exclusions, freshness threshold policy reference, privacy constraints and drill-down contract.

New-category manifests reference compatible metrics, not executable ad-hoc queries. A new metric requiring unavailable events remains unavailable until instrumentation exists. A hybrid merchant can compare each work type within its valid definition; a combined total must have an explicitly meaningful unit such as completed work records, with its limitations explained.

Health reports use administrative service/appointment data and appropriate privacy rules rather than clinical diagnoses or records. Financial service categories get permitted enquiry/appointment performance and real NEXG financial records. Unknown data class authority cannot be solved by an analytics join.

## States and comparison rules

All inherited R/A states apply. Additional report states include insufficient history, missing denominator, incompatible comparison, privacy-suppressed breakdown and generation pending. Show the reason and a useful permitted alternative. A small sample is not shown as a persuasive trend simply because a chart can be drawn.

Partial current data cannot be silently compared with a complete prior period. Keep separately labelled values if useful and disable an invalid percentage change. Financial totals retain currency separation. Failed sources do not blank unrelated reports or create misleading whole-business totals.

Saved filters containing a removed capability show that change before running. Permission removal clears unauthorized cached reports and exports. A source correction produces a documented report revision rather than untraceable historic changes.

## Journeys and side effects

1. **Rental utilization:** choose month and branch → inspect reserved versus actual-used asset days and usable denominator → view maintenance exclusions → drill into applicable vehicles and bookings. The chart does not alter Availability.
2. **Appointment performance:** compare requested and confirmed slots → inspect cancellation/no-show definitions → open affected Work list → return with period/service preserved.
3. **Promotion question:** select campaign → read attribution window and delivery coverage → open campaign/transaction records with separate permissions. Do not claim a campaign caused revenue from correlation alone.
4. **New category report:** published manifest references a supported metric → report appears when source events exist → missing history shows a truthful initial state. An unsupported metric reference fails publication validation.

Insights is primarily read-only. Exports, saved views and supported subscriptions change report configuration only. Operational changes happen in their owning screen through explicit commands.

## Mobile and UX rationale

Mobile prioritizes the merchant's report question, period and a readable summary. Charts can scroll only when the data shape needs it; tables offer row details without tiny type. Labels and units stay visible. Persistent filter summaries prevent memory burden across drill-downs.

Recognition and clear definitions reduce metric ambiguity. Proximity associates coverage limitations with the relevant number. Progressive disclosure keeps detailed calculations available without presenting every dimension at once. Familiar chart/table forms help only when comparison remains valid.

## Acceptance scenarios

- IN-T01: rental profile gets asset-based metrics with denominator definition, while product-unit metrics appear only for enabled product capability.
- IN-T02: a partial external feed blocks invalid percentage comparison and retains confirmed unrelated reports.
- IN-T03: no finance grant removes financial report data and export access, including direct links.
- IN-T04: appointment drill-down preserves period, timezone, service and location and opens the matching Work records.
- IN-T05: unknown quantities/currency are not combined into zero or one total; source correction is traceable.
- IN-T06: new-category metric references validate source events/permissions and show insufficient-history rather than fabricated charts.

The 128-profile suite covers metric applicability. Runtime calculations and privacy thresholds require owner-defined contracts and future validation.
