# Proposed Insights screen revision

Date: 1 November 2026. Status: PROPOSED_FOR_REVIEW. The user requested a new plan before approving the change. This document makes that proposal concrete. Approval of this navigation is separate from approval of future application implementation and any new reporting capability.

## The change being proposed

Use the attached references' clear business-specific insight tabs. Add Reports as a peer tab in the same row as Overview and those business tabs. Keep the existing metric definitions, financial source ownership, permissions, workflow distinctions, source states and record drill-down requirements.

The earlier concept proposed only Overview and Reports, with domain reports mainly reached through a selector. This revision gives the merchant direct access to their familiar business areas. A restaurant can see Orders and Menu; a salon can see Appointments, Services and Retail; a mobility merchant can see Rentals, Transfers and Fleet. Reports remains available for the deeper reporting workspace.

This proposal covers all 21 categories, 128 baseline subcategories and 21 separately approved additional source routes. Fifteen operational models compose the tabs. The [matrix](merchant-tab-matrix.md) lists the possible mappings. Actual enabled offerings, allowed workflows, resources, terminology and permissions determine an individual merchant's navigation.

## How to read the references

The [overview reference](reference-overview-tabs.png) shows the summary for each business type. The [detail reference](reference-detail-tabs.png) shows the selected Orders, Appointments, Rentals or Bookings area. These are different views of the same Insights screen.

Retain the black NEXG sidebar, light canvas, readable header, common filter position, compact key figures, appropriate chart/breakdown panels and a supporting table. Each view needs a clear question and an evidence link. Chart selection follows the data; do not require a bar chart and donut on every page.

Use the existing common portal navigation as the baseline. The attachment's changing main sidebars are reference context, not an automatic proposal to redesign the whole portal. Business-specific insight tabs sit inside Insights. Any later change to the main portal sidebar needs its own explicit design decision.

The reference figures are examples, not reusable reporting fixtures. Before new images, define one consistent synthetic dataset for Overview, each business tab and Reports. Counts, amounts, date bases, comparisons and status meanings must agree across those views.

## The screen structure

1. Workspace header with merchant, permitted location, notifications and Help.
2. Insights heading and a short business-specific description. An authorized Export control applies to the current view.
3. Shared reporting scope: period, timezone, comparison, actual activity and Filters. Location is selected once in the workspace header. Domain-specific filters sit with their report.
4. One peer navigation row: Overview, admitted business-specific tabs, admitted shared insight areas, Reports.
5. The selected tab's content, with its date basis, units, coverage, freshness and definition controls.
6. Table/detail links that retain context. Operational actions open Work, Offerings, Availability, Promotions or Money under fresh permission checks.

Overview stays first in the logical navigation order. Reports stays last. The order of admitted middle tabs comes from the stable registry. The full registry is a list of possible destinations, not a row of 28 tabs for every merchant.

## What each destination does

| Destination | Merchant question | Content and useful next action |
| --- | --- | --- |
| Overview | How is the business performing, and what should I inspect? | A small set of applicable measures, separate activity trends, an offering/resource breakdown and evidence-backed observations. View full report opens the matching report. |
| Business activity tabs | What happened in this operation? | Orders, Appointments, Rentals, Transfers, Visits, Bookings, Quotes, Production, Jobs, Collections, Shipments, Storage or Passes. Use that operation's real stages, units, dates and exceptions. |
| Offering tabs | Which actual offerings contributed? | Menu, Products, Services, Fleet, Experiences or Spaces. Product variants and accepted specification versions remain distinct. Table rows open the appropriate report or offering. |
| Capacity or Staff | How were actual resources used? | Usable versus reserved/used capacity, dated places, permitted provider/staff assignment or schedule evidence. No denominator inferred from booking counts or headcount. |
| Customers | What permitted customer activity repeats? | Defined merchant-scoped cohorts, repeat activity and published feedback links under privacy and identity policy. No inferred unique people or sensitive customer profiles. |
| Operations | How reliably did the actual work progress? | Promise timing, exceptions, cancellations, unknown reasons and delays from recorded events. The selected model determines the milestone and date basis. |
| Reviews | What feedback was published? | Permitted rating distributions, published reviews and reply workload. It can be a secondary tab under More. It is not a clinical or staff-quality score. |
| Promotions | What campaign activity was actually measured? | Delivery, qualified actions and attributed outcomes with a closed observation window, model and coverage. Unconnected measures remain unavailable. |
| Finance | What merchant financial activity was recorded? | Approved Money-owned postings, units/currency, posting basis and source links. Operational revenue summaries use the same approved measure. |
| Reports | Which detailed report or saved view do I need? | Searchable permitted catalogue, selected report workspace, detailed tables, personal saved views and supported export history. All calculations reuse the same registered definitions. |

The stable `products` destination may display Retail for an appointment business with actual retail products. Retail is a presentation label for that same destination, not a second copy of product reporting. The stored key and saved links remain stable when a compatible label changes.

The stable `capacity` destination may display Departures for actual dated tour departures or Sessions for actual session resources. It keeps their exact model segments. An event-space reservation uses declared space intervals. None of these labels creates lodging inventory or room-night occupancy.

For pure vehicle rental, Fleet can contain both vehicle performance and rental-asset utilization. Omit a default duplicate Capacity tab when it would show the same assets, denominator and question. A hybrid business may have a distinct useful Capacity view across resource groups, with separate model sections and units.

## Example merchant navigation

These are proposed logical sets. Admission still depends on actual activities, access and sources. At narrower widths, secondary destinations move into More.

| Example | Proposed logical peer tabs |
| --- | --- |
| Restaurant with menu orders | Overview, Orders, Menu, Customers, Operations, Reviews, Promotions, Finance, Reports. |
| Restaurant with actual table reservations | The restaurant set plus Bookings, segmented to SPACE_RESERVATION, and Spaces for its controlled table/space offering performance. Capacity is exposed only for a distinct useful question. |
| Beauty business with appointments and retail | Overview, Orders, Appointments, Products displayed as Retail, Services, Staff when supported, Customers, Operations, Reviews, Promotions, Finance, Reports. |
| Vehicle rental plus transfers | Overview, Rentals, Transfers, Services for the actual transfer offering, Fleet, Customers, Operations, Reviews, Promotions, Finance, Reports. |
| Safari and experience operator | Overview, Bookings, Experiences, Capacity displayed as Departures when applicable, Customers, Operations, Reviews, Promotions, Finance, Reports. |
| Custom production business | Overview, Quotes when actually enabled, Production, Products or Services for the actual offering, Customers, Operations, Finance, Reports, plus other independently admitted shared tabs in their stable positions. |
| Freight operator | Overview, Shipments, Services, Customers when permitted, Operations, Finance, Reports, plus independently admitted shared tabs in their stable positions. |
| Session and pass business | Overview, Bookings with SESSION_CAPACITY segment, Passes for actual entitlements, Services or Experiences, Capacity displayed as Sessions, Customers, Operations, Finance, Reports, plus independently admitted shared tabs. |
| Accommodation/NEXG Stay | Reference-only extension proposal. Bookings, Properties and Occupancy would need actual lodging inventory, stay-date, room-night and financial definitions before admission. This image does not add accommodation to the 128-profile baseline. |

Bookings groups SESSION_CAPACITY, SPACE_RESERVATION and TOUR under one stable peer. When several are enabled, use explicit Sessions, Spaces and Tours segments. Each retains its own units and workflow. Appointment bookings and rental bookings keep their direct Appointments and Rentals peers. A single generic booking count must not merge all operations.

## What changes when the merchant changes

Resolve navigation from actual configured offerings and enabled workflow models. Category identity suggests terminology during setup; it does not activate a model, metric or data permission.

For a salon selling products, union the Orders and Appointments activities. Show Products as Retail if the configured presentation supports that term. Keep one Customers, one Operations, one Promotions, one Finance and one Reports destination. Overview displays appointment counts and product quantities separately. The activity filter may select one activity or all admitted activities, while preserving typed units.

For a merchant adding another actual activity, validate its offering/model references, exact workflow guards, registered metrics, source adapter, units, privacy and grants. New tab candidacy does not prove live reporting readiness. A genuinely new operation needs an explicit capability extension.

Removing a configured activity explains the changed navigation and safely redirects a saved link. Removing permission clears inaccessible cached results and prevents direct-link, saved-view and export access. Changing period or receiving a source outage must not shuffle the tab order.

Opening a work-domain tab selects that tab's compatible actual activity scope. For example, opening Orders while Appointments was explicitly selected changes the visible Activity chip to Products and shows a short scope-change notice. Period, timezone and permitted location remain unchanged. Within Orders, the activity control offers only compatible actual product activities. A Bookings peer keeps its exact model segments. The navigation never broadens permission scope.

Store domain-specific filters with their domain. Incompatible service/provider/vehicle filters are not applied to another model, and they are not silently interpreted as zero results. Retain them for Back and show the new view's active-filter summary. Entering Reports from a panel inherits that panel's exact scope. Choosing a different registered report visibly selects its supported model scope and explains any unsupported filters before running; it cannot broaden business/location access. Overview and shared tabs can use All enabled activities with separately labelled model sections. Back restores the previous compatible activity selection.

Keep these cases distinct:

- Irrelevant activity: omit its tab.
- Unauthorized report: omit it from the permitted catalogue and deny direct access safely.
- Applicable activity with no records: keep the tab and show first-use or a successful zero-result state.
- Applicable activity with missing sources: keep a specific setup/unavailable state, with supported measures retained.
- Partial or stale evidence: label only affected measures and prevent invalid comparisons.

## Overview content

Use the reference's compact summary and clear business language. Start with up to four useful supported measures; a hybrid can instead use short labelled activity groups. The count is a design starting point to review, not a mandatory component quota.

Examples are fulfilled orders for products, completed appointments for services, completed rentals and transfers separately for mobility, and confirmed departures/places for a tour operator. A financial measure appears only with the necessary grant and the approved Finance definition. Average order value, revenue, attendance, utilization and repeat rate cannot appear merely because the reference picture contains them.

Add one useful trend, one meaningful breakdown and a short observation with an evidence link. A top-offering table can replace an unhelpful chart. Each table preview states shown versus total rows. A chart exposes a table alternative. Observations describe source-backed facts, not guessed causes or invented opportunity value.

## Business-specific tab content

Each tab defines the question, initial measures, trend/breakdown, evidence table, applicable filters and owning-screen links. It also declares numerator/denominator, unit, date basis, cutoff, comparison validity and source coverage through the existing metric contract.

Orders uses actual order outcomes, fulfilled item quantities and accepted promises. Appointments separates request confirmation from scheduled outcomes and provider capacity. Rentals separates reserved and actual-used intervals, handover, return and accepted due time. Quotes separates requests with an accepted quote from quote-decision acceptance on a quote-issued cohort. Production starts from accepted production commitments. Freight keeps promised milestones, recorded custody and unknown evidence. Passes separates rights issued from valid redemptions and attendance.

Offering tabs compare compatible actual offering kinds and units. Fleet does not treat greeter-only transfers as rental vehicles. Services does not blend appointment durations and freight mass into one performance quantity. Department or provider breakdowns require actual scoped evidence and grants.

A tab's recent-record table is an analytical preview scoped to the chosen period and date basis. It does not become another operational queue. View full report opens the complete authorized reporting table. A record link opens its owning screen if separately authorized.

## Reports as a peer tab

Reports is visible in the same peer navigation as Overview and the domain tabs for an actor with authorized report-catalogue access. A missing metric source does not hide Reports entirely. It affects that report's availability and definition panel.

Inside Reports, use a compact secondary navigation: Library, Saved views and Exports. These are report-management destinations within Reports. They do not become new top-level portal pages. Unsupported saved-view or generation services have truthful unavailable states.

### Library and report workspace

Library shows a searchable list grouped by actual business activity, offerings/resources, customers/feedback, operations, promotions and financial activity. A report row shows its question, actual model, unit/date basis, availability and last source update. Counts appear only when known. Restricted reports do not leak their names, record counts or export fields to an unauthorized actor.

The [draft catalogue](reports-catalogue-proposal.json) defines 26 proposed report identities covering all fifteen actual models and all 37 existing metric IDs. The source-coverage report is a state/evidence view with no invented numeric metric. A report's model scope is intersected with each metric's applicability; for example, the current attributed-orders metric remains ORDER-only even inside the shared campaign report. These are draft configuration identities, not implemented query endpoints.

Selecting a report opens its workspace inside Reports. Show the report title, scope, definition, supported chart/table view, permitted breakdowns, exact evidence set and filters. The report uses the same canonical identity and metric versions as its dashboard panels. One canonical query contract produces values, coverage and contributing records for all presentations.

Create view selects a registered report and its supported dimensions/columns. It does not create arbitrary queries, new metric formulas or unsupported cross-model joins. Reports can answer a supported cross-activity question with separate compatible sections. It cannot add product units, provider-hours and pass uses into one quantity.

### Saved views

Save view stores the registered report identity, definition version, filter choices, comparison, selected dimensions/columns and personal visibility. It stores configuration, not an independently editable total. Opening it reruns authorization and checks definition/source compatibility. A definition or activity change requires review before replaying an obsolete filter set. Shared saved views remain dependent on a real visibility/grant contract.

### Exports

Exports lists authorized generation jobs and their actual state, scope, time, expiry and permitted file action. Queued, Preparing, Ready, Failed, Expired and Outcome unknown are distinct. An unknown outcome is reconciled using its operation reference before retry. Removing access stops future reads and applies the approved artifact-revocation policy; do not claim an already downloaded file can be recalled.

Header Export applies to the current Overview, business tab or report, as explicitly previewed. Before generation, show selected report/panels, dates, date basis, timezone, dimensions, included fields, units/currency, definition versions and coverage limitations. The user confirms that concrete export scope. Report generation and artifact history reuse one reporting/export owner. Export formats must match actual supported capabilities.

Scheduled delivery remains deferred until a notification/report subscription owner exists. This navigation proposal does not introduce an active Schedule control.

## Dashboard to report to evidence

1. The merchant opens Orders with period, location and activity selected.
2. A card or chart's View full report opens Reports with its canonical report identity and that exact scope.
3. Reports displays the same value, definition, coverage and authorized contributors. It distinguishes numerator, denominator and exclusions when relevant.
4. A row can open its authorized Work, Offering, Availability, Promotions or Money source. Its owner controls operational changes.
5. Back restores the originating dashboard, selected tab, filters, chart selection and scroll position. An expired or unauthorized origin receives a safe scoped fallback.

The proposed route state contains stable tab key, optional model segment, canonical report ID, merchant/location scope, actual activity, period, timezone, date basis, comparison, supported dimensions and definition version. Display labels are never route identities. The current runtime route remains Analytics until a separately implemented migration changes it.

## Tab overflow, mobile and accessibility

At wide sizes, display admitted peers in stable order. Reserve clear access to Overview and Reports. When the available width cannot fit all labels at usable sizes, put secondary domains/shared areas into a labelled More menu. Keep the full logical order. Show the selected overflow destination in the menu button, such as More: Staff. Do not reorder tabs by current result count or source success.

On mobile use Overview, a clearly labelled business-area selector and Reports. The selector shows the selected domain name. It exposes every admitted domain, its stable order and current selection. Keep period/activity scope and affected-source notices visible. Details use full pages or appropriately labelled sheets, rather than a narrow desktop drawer.

Navigation semantics must match the implementation. Use links for routed destinations and an appropriate tablist only for actual same-page tab panels. Keyboard focus, selected state, accessible names, menu behavior, Back restoration, reflow and primary touch targets require testing. Charts retain semantic table alternatives and text labels. No accessibility compliance is claimed from the attached screenshots.

## Scope and decision record

| Proposed decision | Reason and limit |
| --- | --- |
| Reports is a peer beside Overview and business tabs. | Direct access to detailed reporting without hiding the familiar dashboard areas. |
| Actual activities compose the tabs. | Supports every current profile and mixed businesses without a separate application per category. |
| The main portal shell remains the existing baseline. | The current task revises Insights navigation. The references do not by themselves authorize broader portal navigation changes. |
| Reports shares the existing metric/report contracts. | Prevents different totals for the same question in Overview, business tabs, exports and detailed tables. |
| Details preserve context and source ownership. | A merchant can explain a result and return to the same view; analytical navigation does not mutate work. |
| Accommodation is recorded as a reference-only extension candidate. | Lodging inventory, stay dates, room-night denominators, availability and financial definitions are outside the present mapped route set. |
| Replacement images follow review of this draft. | The current deliverable establishes the proposed structure before the next visual iteration. Existing pictures remain a baseline reference. |

## Work after review of this proposal

First resolve any changes to the peer structure, Reports purpose, terminology and scope. Then update the main screen specification and its navigation fixtures, preserving the source and metric gates. Prepare one coherent synthetic dataset and a new image brief for Overview, domain detail, Reports Library, a selected report with evidence, a hybrid merchant and mobile overflow/partial data. Add more scenes only where the fifteen models introduce a genuinely different question or state.

The image pass should demonstrate this proposed navigation, including Reports in the peer row. The review must not treat a picture as proof of source ingestion, authorization, calculation or export generation. Application implementation follows the source ownership and acceptance work in the existing [validation plan](../validation-plan.md), extended by [review-scenarios.md](review-scenarios.md).
