# Insights implementation and validation

Date: 1 November 2026. Status: proposed implementation and acceptance work. This document records a static source audit, not an executed runtime test or a release approval.

## What exists today

| Area | Source evidence | Consequence for this concept |
| --- | --- | --- |
| Current Analytics | The [current route](../../../apps/web/app/merchant/analytics/page.tsx#L28), lines 28–89, queries orders and branches for a rolling 30 days, filters the current delivered stage, and groups placement hours in Nairobi time. The [navigation](../../../apps/web/components/merchant/shell.tsx#L91), line 91, calls it Analytics. | A limited delivered-order report exists. Adaptive filters, historical cohorts, model-specific reporting, definition views and source-quality contracts remain proposed. |
| Operational evidence | The [order schema](../../../supabase/migrations/20260101013100_orders.sql#L46), lines 46–138, stores branch/channel, commitments, outcome timestamps, currency and price-version references. Lines 168–187 define the order timeline. | These are candidate inputs for explicitly defined order volume and timing measures. Check historical event completeness and actual transition semantics before calculating them. Current stage alone cannot preserve a completion cohort after a refund or dispute. |
| Offering evidence | The [historical order lines](../../../supabase/migrations/20260101013100_orders.sql#L149), lines 149–161, store names, quantities and prices. | This does not establish the full planned accepted offering/type/variant/specification contract. Restrict current breakdowns to fields actually present. |
| Feedback | The [rating schema](../../../supabase/migrations/20260101020200_the_tables_that_were_missing.sql#L28), lines 28–78, has one rating per order, stars, branch, stored themes, review subject and reply/moderation state. | Separate rating counts, distributions, published feedback and replies. Stored keyword themes are not validated sentiment or evidence that the merchant caused an issue. |
| Finance | The [Money page](../../../apps/web/app/merchant/money/page.tsx#L31), lines 31–39 and 94–115, reads Finance statements, adjustments, penalties, tax, net and paid/provider confirmation. | Reporting must use an approved Finance projection, its posting basis and authorization. Sales, customer collection, merchant entitlement, statement balance and received payout remain separate. |
| Promotions | The [Featured schema](../../../supabase/migrations/20260101008500_featured_slots_schema.sql#L276), lines 276–320, defines view/tap/order events, deduplication and daily metrics; line 402 has a configurable attribution window. The [rollup](../../../supabase/migrations/20260101008700_featured_slots_rpcs.sql#L848), lines 848–869, inserts zero for order value. A static search found no Featured event-ingestion caller in the current web app or migration RPCs. | Schema presence does not prove measurement delivery. Keep dependent outcomes unavailable until ingestion, attribution, value, refund treatment and coverage are verified. The concept's synthetic 7-day window is a proposed example, not the existing Featured rule. |
| Team scope | The [team migration](../../../supabase/migrations/20260101020100_branches_and_team_can_be_managed.sql#L37), lines 37–58, adds branch and capability fields. The [order policy](../../../supabase/migrations/20260101014500_partners_can_see_their_own_work.sql#L39), lines 39–49, permits merchant membership and relevant staff grants. | Current Analytics queries the business's branches and orders; this audit found no analytics enforcement of team branch/capability fields. Proposed location/finance personas require server-side grants and tests before activation. |
| Booking and advanced models | The [reconciled booking package](../payload-reserve-plan/reconciliation/README.md) is explicitly pre-implementation. The [API service endpoint](../../../supabase/migrations/20260101023000_merchant_service_orders.sql#L1), lines 1–39, lets a merchant buy a NEXG service. | That endpoint does not establish a general merchant-operated appointment, rental, entitlement, freight or storage reporting engine. Define the selected model's actual authority and event adapter first. |
| Exports and subscriptions | The [Analytics page](../../../apps/web/app/merchant/analytics/page.tsx#L233), lines 233–244, describes export generation as future work. | The concept's export states and saved reports are proposed. Do not present a generated download, scheduled delivery or completed subscription as live. |

The static audit read source files only. It did not query a deployed database, inspect actual reporting feeds, execute access tests or verify event delivery.

## Finance and source ownership gates

The existing Analytics calculation must not become the new financial definition. It sums `total_cents` as Gross sales and subtracts commission for Net before refunds in [the route](../../../apps/web/app/merchant/analytics/page.tsx#L53), lines 53–56 and 206–213. The [order total](../../../supabase/migrations/20260101013100_orders.sql#L81), lines 81–94 and 128–131, includes fees and tip. The later [Finance split](../../../supabase/migrations/20261026000000_finance_rules_compliance.sql#L205), lines 205–208 and 239–244, distinguishes guest total, merchant subtotal and merchant subtotal less commission. The older [merchant order projection](../../../supabase/migrations/20260101014500_partners_can_see_their_own_work.sql#L340), lines 340–347, uses another keeps formula.

Finance must select the authoritative versioned projection and recognition/posting basis. The new report should read confirmed credits, refund debits and fee debits from that projection. It must not infer refunds from a status label or use a gross-minus-commission estimate as payout or profit. Review source units carefully: order money uses minor units while statement fields include whole-KES amounts. Missing commission is not zero. Approved historical facts retain their effective version; present-day settings must not reprice prior work.

Other owners remain distinct. Work supplies accepted workflow events. Availability supplies typed usable capacity and exclusions. Offerings supplies historical item/variant/specification identities. Promotions supplies qualified campaign events and attribution. Identity/access supplies permitted business, location and fields. Settings exposes source repair according to its actual authority. Insights aggregates their evidence and links to the owning screen; it does not command operational transitions.

## Implementation phases

1. **Approve definitions and policy.** Confirm report IDs/versions, units, event/date basis, cohorts, exclusions, allowed dimensions, finance projection, source ownership and role capabilities. Resolve the unknowns below. Preserve the reconciled profiles and approved offering routes once, without replaying historical resolvers.
2. **Build reporting inputs.** Add normalized source adapters, immutable accepted references, event identities/deduplication, source watermarks, mapping quality and missing-interval coverage. Instrument only approved discovery/attribution events. Establish a backfill plan and mark dates before coverage began.
3. **Build scoped query contracts.** Enforce business/location/field access at the server for summaries, charts, definitions, evidence lists and exports. Register supported models/metrics through configuration. Return typed values plus coverage, version and safe drill-down context. Unsupported sources return an explicit state.
4. **Build the shared experience.** Implement Overview/Reports, filter and address state, chart/table alternatives, metric definitions, exact evidence lists, Back restoration and owner-screen links. Implement model-specific reports incrementally behind their evidence gates. Existing current reports can remain available while a new feed is pending.
5. **Add generated artifacts.** Implement authorized export generation, operation reconciliation, expiring downloads and saved-view revalidation. Scheduled delivery needs its own approved recipient, consent and delivery capability; it is not implied by export support.
6. **Validate and release.** Complete the source, authorization, invariant and UX tasks below with fixtures and runtime evidence. Record what is enabled for each model/source. Do not announce all-model reporting because the static mapping or images are complete.

## Cross-model acceptance

Run these against every applicable metric and all 128 baseline mappings plus the 21 approved additional routes. A metric/source gate may produce an unavailable state; that is valid coverage only when its reason and permitted recovery are correct.

| Test area | Required observable outcome |
| --- | --- |
| Identity and event delivery | Retried, duplicated, late and out-of-order events do not double-count. Stable event/work IDs and accepted versions preserve history after listing edits, cancellation, refund or reschedule. Correction/rebuild policy is recorded. |
| Counting and joins | One work item with several lines, stages, resources or payment events does not multiply work counts. Join totals reconcile to the exact evidence set. Distinct work, requests, quantities, places and people remain separate. |
| Period and time | Kenya display uses `Africa/Nairobi`; timed boundaries use correct instants and half-open intervals. Date-only promises remain dates. Cover midnight, month end, leap day, interval clipping and comparison lengths. Request, use, due, completion and posting dates stay distinct. |
| Cohorts and comparisons | A cohort uses the same identities and an explicit observation cutoff. Pending cases stay pending. Prior zero produces counts without infinite growth. Changed metric version, coverage, unit or currency blocks an invalid comparison. Rate changes use percentage points where appropriate. |
| Source quality | Missing, empty, zero, stale, partial and unavailable produce different states. Unmapped events remain visible in coverage. Partial reports identify included intervals/sources; pagination or source query limits cannot masquerade as full totals. |
| Authorization | Test two businesses, multiple locations and each actual capability bundle. Direct URLs, altered IDs, evidence lists, aggregates, cached results, exports and downloaded artifacts respect scope. Revocation/session expiry clears unauthorized data. Finance drill-down and operational access are checked separately. |
| Privacy | No public/private intake crossover. Test sensitive health, financial-service and restricted-category fixtures, small groups, unknown identifiers and export suppression. Report aggregation cannot reveal a hidden person's record through filter differences. |
| Financial evidence | Posted figures and signs reconcile to approved Money entries for the same currency/basis/version. Pending/reversed/refunded items follow their owner definition. Customer totals, deposits, estimates, recurring authorization, merchant credits and received payout remain distinct. |
| Navigation and operations | Metric drill-down retains business/location, activity, date basis/period, definition and exclusions. Back restores context. Editing work occurs in its owning screen. Refresh and export reconcile an unknown generation outcome before retry. |

## Model-specific runtime tasks

| Model | Acceptance task and invariant |
| --- | --- |
| `ORDER` | Reconcile received/accepted/completed orders separately from line quantities and returns. Test variant changes and kg/pack/item units. A product sale creates no fictitious appointment usage. |
| `APPOINTMENT` | Test request cohort versus scheduled-date workload, completed/cancelled/no-show/open records, walk-ins and remote delivery. Reserved and actual-used minutes have separate evidence and compatible usable provider time. |
| `FIELD_VISIT` | Compare actual arrival with the accepted arrival window, preserving travel/access exceptions. Request creation is not arrival. Missing arrival evidence cannot count as on time. |
| `ASSET_INTERVAL` | Clip confirmed rental intervals into the report period, exclude actual maintenance/turnaround and separate reserved from handover-to-return usage. With-driver rental retains both resource requirements without duplicating rentals. |
| `TRANSFER` | Preserve pickup/meeting commitments, flight-change revisions and actual milestones. Greeter-only work needs no invented vehicle. Count passenger quantities separately from trips or greeting jobs. |
| `SESSION_CAPACITY` | Count each dated occurrence, places and attendance with tier/shared-capacity limits. Cancelled or duplicated occurrences cannot inflate available places; attendance is not ticket sales. |
| `SPACE_RESERVATION` | Test exclusive versus shared spaces, compatible party counts, timed intervals, setup buffers and closures. A confirmed reservation is not evidence that the space was actually used. |
| `TOUR` | Separate departure places from private intervals, supplier confirmation, traveller quantity and attendance. One linked set of allocations counts as one accepted tour booking, not several bookings. |
| `PRODUCTION_DUE` | Measure actual accepted production against the effective due commitment/specification revision. Quote acceptance alone is not a completed or accepted production unit. Open, late and changed commitments remain inspectable. |
| `REQUEST_QUOTE` | Use a declared request cohort, first response, quote revisions, accepted/declined/expired/pending outcomes and cutoff. Requests do not consume capacity; an accepted quote and a later job retain distinct IDs and conversion linkage. |
| `LINKED_WINDOWS` | Reconcile collection, processing and return commitments to the linked work identity. Count it once; assess each window using its own actual evidence. A completed collection does not prove completed service or return. |
| `SERVICE_JOB` | Separate inspection/diagnostics, approval, accepted repair scope, execution and completion. Estimated prices and unapproved repairs cannot become confirmed revenue or completed work. |
| `ENTITLEMENT` | Separate issued/enrolled plans, active entitlement, renewal consent, credits, redemptions and actual session attendance. Enrolment does not reserve a place or prove recurring payment. |
| `FREIGHT` | Preserve shipment, leg, accepted milestone and actual handoff evidence. Distinguish shipment count, kg, tonnes, volume and containers. Generic status text does not prove goods movement. |
| `STORAGE` | Integrate actual compatible occupied quantities over time against usable capacity with matching precision/units. Scheduled exit does not prove vacancy. Area-days, volume-days and pallet-days remain separate. |

## State and interaction coverage

Exercise every inherited [read state R01–R12 and action state A01–A10](../screen-contract.md#universal-read-states) where applicable. For Insights, action states apply to filters/saved reports/export generation; they do not imply authority to change business operations. Record justified N/A cases.

Include first use, filtered empty, not applicable, unsupported source, source configuration pending, missing denominator, incomplete history, open cohort, incompatible comparison, privacy-suppressed data, partial/stale coverage, offline read, session expiry, access removed, unmapped events, generation queued/preparing/ready/expired/failed and unknown outcome. A chart may show known data while a sibling metric is unavailable.

On desktop and a 390 px mobile viewport, validate readable units and scope, filter-sheet apply/cancel, keyboard navigation, visible focus, screen-reader names/statuses, non-hover chart details, table alternatives, reflow, adequate targets and usable contrast. Test a merchant explaining a metric, opening its exact records, recovering partial data and returning without losing context. Visual inspection alone does not establish accessibility conformance.

The twelve [concept scenes](README.md) cover distinct visual questions. Review their labels, arithmetic, date bases, selection state, missing-source messages and privacy boundaries against the written contracts. A picture cannot establish query accuracy, interaction behavior, source freshness, live connection or successful export.

## Decisions still required

| Decision | Owner and dependent behavior |
| --- | --- |
| Minimum sample and suppression policy | Identity/privacy and reporting owners must define group, differencing, retention and role rules. The current [Analytics constant](../../../apps/web/app/merchant/analytics/page.tsx#L89), line 89, is not an approved universal threshold. Suppress the dependent breakdown/trend claim until policy exists. |
| Peer comparison | Reporting/privacy owners must approve comparable cohorts, anonymization and statistical meaning. No peer ranking is enabled by this concept. |
| Freshness and completeness | Each source owner must define watermark, expected latency, missing-interval policy and repair authority. Do not invent one global freshness threshold. |
| Conversion and attribution | Work/Promotions/reporting owners must approve eligible events, identity/deduplication, cohort cutoff/window, attribution revision and cancellation/refund treatment. The synthetic scene's window is illustrative. |
| Financial projection and historical corrections | Finance must reconcile the competing current formulas and approve posting basis, field units, correction/reversal semantics and retention. The concept creates no accounting policy. |
| Scope and export policy | Identity/access and reporting owners must approve actual grants, sensitive columns, artifact expiry, revocation and scheduled-recipient behavior. Design personas grant nothing. |
| Repeat activity and feedback | Privacy/feedback owners must approve identifiers, consent/purpose, publication rules and minimum samples. Bookings are not unique people; feedback is not a clinical outcome. |

## Evidence required before a completion claim

- **Design complete:** screen/metric/coverage contracts, recovery paths and reviewed image scenes exist, with unresolved policy dependencies explicit.
- **Static coverage verified:** automated artifact checks record unique 128 baseline identities, 21 exact additions, 15 model bindings, resolvable references and required definition fields. These checks do not execute queries or permissions.
- **Runtime ready for a declared scope:** source adapters and approved definitions have executed calculation, event, authorization, privacy, recovery and interaction evidence for the enabled model/source combinations. Record the tested scope and remaining disabled reports explicitly.

No runtime readiness or conformance claim follows from this plan or the generated concept images.
