# Statistics collection contract

Date: 31 October 2026. Status: proposed design for the adaptive merchant frontend. This document defines how statistics can be collected, explained and represented. It does not implement ingestion, authorize a connection, create a financial record or change Supabase. Every operational example added for this statistics planning package is `DEMO`.

## Purpose and scope

An onboarding answer selects applicable business capabilities and metric definitions. Actual business observations supply metric values. Selecting rentals can configure a rental return card; it cannot create a completed rental, establish vehicle capacity or supply a utilisation denominator.

The same collection contracts support Home summaries and the detailed Insights reports behind them. Home and Insights must use the same metric version, period, scope, source coverage and calculation when they claim to show the same measure. An operational snapshot such as rentals currently in use is a different measure from rentals closed during a period.

The eight source families below describe business ownership. Native actions, APIs, webhooks, polling, files and manual entry are collection channels. They are not independent evidence that the underlying fact is true.

## Source families

| Source ID | Business facts supplied | Collection points and required evidence | Limits |
| --- | --- | --- | --- |
| `SRC_WORKFLOW` | Work intake, accepted/declined requests, approved quote versions, confirmed transitions, attendance, custody, promises, linked work and exceptions | The owning workflow confirms a transition or publishes a current-state/history query. Retain work identity, version, actual occurrence time, selected fulfilment and applicable completion evidence references. | A submitted command, screen click, notification, elapsed appointment or payment request is not a confirmed business transition. Child execution does not independently duplicate root commercial work. |
| `SRC_AVAILABILITY` | Published schedules, usable resource capacity, reservations, holds, releases, blocked/maintenance periods and scoped overrides | Scheduling or capacity owner confirms resource intervals, units, schedule version and accepted allocation. Reservations retain resource/pool identity and effective interval. | Opening hours are not bookable capacity. A hold is not a confirmed reservation. Staff, room, vehicle and physical capacity constraints remain separately measurable. |
| `SRC_INVENTORY` | Stock balances, reserved/available quantities, movements, count corrections, asset lifecycle and applicable stock exceptions | Inventory owner supplies balance-at-time or movement history by item/asset, unit, location and source reference. Reconcile opening balance plus movements to closing balance where history exists. | A listing being published is not stock on hand. A missing stock feed is not zero stock. Low-stock status requires an explicitly configured policy; the statistics layer does not invent one. |
| `SRC_FINANCE` | Confirmed charges, posted sales/revenue where defined, payment receipts, refunds, fees, balances and payouts | Approved finance/payment/accounting owner supplies its named financial facts, posting/effective dates, currency, amount in minor units, original/reversal references and confirmation state. | Accepted price, completed work, invoiced amount, received cash and settled payout are different facts. Statistics do not infer a ledger or payment result from workflow state. |
| `SRC_DISCOVERY` | Eligible impressions, offering views, enquiries or booking/order starts observed on supported discovery surfaces | Instrumented first-party surface or authorized provider publishes a defined exposure/action with placement, offering and occurrence context. Use permitted pseudonymous session/cohort linkage only when supported. | No customer tracking or unique-person claim from a browser/session count. No conversion rate without compatible attributable numerator, denominator, cohort and observation window. Uninstrumented off-platform activity remains outside coverage. |
| `SRC_PROMOTIONS` | Campaign lifecycle, supported delivery/click counters, qualified actions, attributed outcomes and confirmed spend | Campaign owner and supported delivery/provider reports identify campaign/version, placement, scope, reporting period, attribution model/window and authoritative spend reference. | Attribution is not causal lift. Delivery counters are not workflow completions. Campaign spend and customer discounts retain their separate finance definitions. |
| `SRC_FEEDBACK` | Eligible review requests, submitted/published reviews, ratings, response and moderation state | Feedback owner publishes review identity, related work where permitted, rating scale and publication/moderation/reply timestamps. | Requested reviews are not published reviews. Published-rating denominators exclude unpublished records under the approved definition. No sentiment inference or sensitive customer text is necessary for ordinary Home summaries. |
| `SRC_REQUIREMENTS` | Applicable setup requirements, readiness evidence/review state, document replacement/expiry and required configuration tasks | Requirements owner supplies a versioned, scoped applicable list and the confirmed state of each requirement. Preserve required versus optional and waiting versus actionable. | Uploading is not approval. Setup percentage is computed from the applicable authoritative list, not a universal fixed checklist. Statistics cannot approve a merchant or publish it. |

A metric may require several source families. For example, utilisation needs confirmed workflow occupation plus usable availability; readiness needs requirements; financial profit requires supported cost and financial evidence and must remain unavailable when those inputs do not exist. No source family supplies facts it does not own.

## Ingestion modes and provenance

| Mode | Meaning | Merchant-facing treatment |
| --- | --- | --- |
| `NATIVE_CONFIRMED` | A future NEXG domain owner has confirmed the business fact. | Identify the native source and confirmed observation time. A locally simulated action cannot use this mode. |
| `EXTERNAL_CONFIRMED` | A supported external authority has confirmed the fact through a validated provider mapping. | Show provider/source, confirmed time and coverage. Authorization and source ownership must already be valid. |
| `IMPORTED` | A file or batch supplies records for a declared coverage period. | Show import time, effective coverage and import provenance. Importing alone does not verify the records or make the feed live. |
| `MERCHANT_REPORTED` | An authorized merchant explicitly records a business fact. | Label it merchant reported, with recorded-at, effective-at and revision history. Do not present it as provider-confirmed evidence. |
| `DEMO` | A deterministic fictional fixture or local simulated outcome. | Persistent sample label on values, charts, details and exports. Never merge into confirmed merchant history. |

Authority and ingestion mode are independent. A file can originate from the finance owner, but its imported status and coverage remain visible. A merchant-entered fact can support a separately labelled report where its definition permits that evidence. It cannot override external authoritative truth silently. A metric binding declares the modes it accepts and whether different modes can be combined; otherwise report them separately.

## Observation envelope and conceptual CloudEvents mapping

The future transport envelope can use CloudEvents-shaped metadata. In CloudEvents 1.0, `id`, `source`, `specversion` and `type` are required context attributes; `subject`, `time`, `dataschema` and `datacontenttype` provide optional context. Domain fields belong in `data`. This is a conceptual mapping, not a claim that the application implements CloudEvents or any protocol binding. See the [CloudEvents v1.0.2 specification](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md#context-attributes).

| Envelope field | Proposed NEXG meaning |
| --- | --- |
| `specversion` | CloudEvents envelope version `1.0`, distinct from observation/domain schema version. |
| `id` | Stable occurrence identifier unique within `source`. Retries preserve the pair; a correction is a new identified occurrence with a correction reference. |
| `source` | Stable producer/source context, distinct from a display label or delivery URL. Retain external source identity when an adapter produces the envelope. |
| `type` | Registered semantic observation type and version. A raw provider status is not automatically a registered type. |
| `subject` | Stable subject reference appropriate to the observation, with no customer name, phone or sensitive payload. |
| `time` | Actual occurrence instant when known. Do not substitute import or receipt time for an unknown business occurrence. |
| `dataschema` | Versioned observation schema reference, if used. It describes a contract, not a dynamic script to execute. |
| `datacontenttype` | Declared payload format, such as `application/json`. |
| `data` | Typed domain observation, provenance, scope and references described below. |

The following illustrates field shape only. References and timestamps are fictional.

```json
{
  "specversion": "1.0",
  "id": "demo-observation-rental-return-0001",
  "source": "urn:nexg:demo:rental-workflow",
  "type": "workflow.rental.returned.v1",
  "subject": "rental/demo-rental-0001",
  "time": "2026-10-31T09:00:00Z",
  "datacontenttype": "application/json",
  "data": {
    "observationSchemaVersion": "1.0.0-proposed",
    "sourceFamilyId": "SRC_WORKFLOW",
    "ingestionMode": "DEMO",
    "merchantId": "demo-merchant",
    "locationId": "demo-location",
    "capabilityId": "rentals",
    "entityType": "rental",
    "entityId": "demo-rental-0001",
    "rootWorkId": "demo-root-work-0001",
    "parentWorkId": null,
    "workflowId": "WF_RENTAL",
    "workflowVersion": "1.0.0-proposed",
    "configurationVersion": "demo-config-1",
    "entityVersion": "demo-rental-revision-4",
    "observedAt": "2026-10-31T09:00:02Z",
    "effectiveAt": "2026-10-31T09:00:00Z",
    "scheduledAt": "2026-10-31T09:00:00Z",
    "promiseVersionRef": "demo-accepted-return-promise-2",
    "authorityBindingRef": "demo-rental-source-binding",
    "externalReference": null,
    "supersedesObservationRef": null,
    "reversesObservationRef": null,
    "evidenceRef": "demo-return-evidence-0001",
    "values": { "returnConfirmed": true }
  }
}
```

Required domain fields depend on the registered observation. Common requirements are merchant and authorized location/capability scope; typed subject identity; business schema/version; source family and ingestion mode; authoritative owner/binding reference; observation time and known business time; entity revision or declared ordering basis; correlation/external identity; and correction/reversal references where applicable. Root/parent identities are required for linked work. Interval observations need start/end semantics, resource/pool, original quantity/unit and allocation kind. Monetary observations need currency, minor-unit amount, financial fact type and original/reversal reference.

An envelope is not proof of authority. Future ingestion validates the producer, connection, tenant mapping and permitted facts independently. Do not place credentials, raw authorization headers, full documents, clinical notes, message bodies or customer contact details in the statistics envelope.

## Metric binding requirements

Each metric definition must bind to collection evidence before it can produce a confirmed value:

- Stable metric ID/version, merchant question, label, applicable capability/workflow versions and permitted Home/Insights placements.
- Each required source family, observation type or snapshot query, schema version, authoritative owner and accepted ingestion modes.
- Grain, stable distinct key and linked-work rule, such as root commercial work, appointment, rental, shipment, participant place, custody operation or entitlement.
- The exact aggregation, numerator, denominator, exclusions, original unit/currency and approved display precision.
- Event, scheduled, posting, cohort or snapshot date basis; half-open period boundaries; reporting timezone; cutoff; and data-coverage requirements.
- Supported dimensions and drill-down filters, plus permission and privacy constraints at the same grain.
- Freshness/expected-update policy, missing-source behavior, correction/recalculation policy and completeness requirements.

Existing `WF_*:STATE` and semantic `sourceEvents` references are conceptual inputs. The future implementation must register their exact observation bindings. A state transition, a current snapshot and an imported status row are not interchangeable event histories. Exact provider event/status mappings remain future work for each supported connector and source version.

## End-to-end collection and display

| Step | Required behavior | Failure/result treatment |
| --- | --- | --- |
| 1. Select | Resolve metric applicability from confirmed configuration and current role/location scope. Select supported source bindings per required data class. | Missing capability omits the irrelevant metric. A relevant metric without collection support is `NOT_COLLECTED`; onboarding cannot invent data. |
| 2. Collect | Receive confirmed observations or query declared snapshots through supported channels. Capture provider cursor/batch, observed-at and declared coverage. | Retain a bounded failure reference and the last permitted confirmed observation. A command timeout remains unknown; do not count a guessed outcome. |
| 3. Normalize | Validate schema; map source identity, entity, state/observation meaning, timestamps, units, currency and external references through versioned definitions. | Unknown meanings are `UNMAPPED`. Preserve the raw token/reference needed for reviewed repair without copying unnecessary sensitive payloads. |
| 4. Dedupe | Deduplicate delivery by `(source, id)` and process permitted revisions using their explicit identity/version relation. Map duplicate native/external entities to the same business identity. | A different payload under the same event identity is a conflict requiring resolution. Do not keep whichever record arrived last. |
| 5. Validate | Check authority, tenant/scope, ordering, required timestamps/evidence, cross-field coherence and accepted modes. | Reject/quarantine invalid observations with an inspectable safe reason. A negative duration, contradictory resource unit or impossible revision cannot enter a metric silently. |
| 6. Project | Build a versioned current-state projection and, where available, append/correct the business history. Apply cancellation, reversal, supersession and linked-child semantics. | Missing history does not prevent a truthful current snapshot, but blocks historical measures that need the missing events. Preserve confirmed unrelated data. |
| 7. Aggregate | Apply the registered metric to its declared grain, cohort, time basis and scope. Retain numerator/denominator, coverage, exclusions and contributing-record references. | Zero requires a complete applicable search/period. Missing input is not zero. Apply the definition's explicit partial policy; do not silently shrink the denominator. |
| 8. Display | Home and Insights consume the resulting metric observation with label, value/unit, period/as-of, source, quality and permitted action. | Show relevant unavailable/partial states in place. Use a persistent `DEMO` label for fixtures. Suppressed data does not leak through a tooltip or chart/table alternative. |
| 9. Drill down | Open the exact authorized contributing records with metric version, period, timezone, cohort, filters and cutoff preserved. Explain exclusions and outstanding outcomes. | Current records may differ after a correction; label the revised report and preserve a safe route back. Removed permission stops the read and clears unauthorized details. |

A resulting metric observation contains `metricId`, `metricVersion`, configuration/source-binding references, scope/dimensions, period/date basis/timezone or `asOf`, value and original unit/currency, numerator/denominator/sample count when applicable, source modes, coverage/watermarks, quality states/reasons, calculation/revision time and authorized drill-down reference. It carries facts and explanation, not executable queries or business permissions.

## Snapshots, histories and time cohorts

Current-state cards answer "what is true at this cutoff?" Completed-work counts answer "what confirmed completion occurred in this period?" Scheduled cards answer "what is due in this scheduled interval, in its state at cutoff?" These are separate bindings, even when they concern the same work.

Use `[start, end)` period boundaries and explicit reporting timezone/calendar. Store instants independently of their local display. The chosen timezone and accepted schedule version must accompany period/report results. Historical timezone or location changes need an explicit versioned interpretation; do not move records between business days silently.

| Situation | Rule |
| --- | --- |
| Rescheduled appointment or return | Preserve the accepted schedule/promise revisions and actual occurrences. Scheduled/upcoming cards use the version effective at cutoff. Punctuality uses the approved accepted-promise rule and identifies amended commitments. A later edit cannot silently erase a missed commitment. |
| Late-arriving confirmation | Partition by the metric's business date, not ingestion date. Recompute affected periods and label report revision/last recalculated time. |
| Correction to a timestamp, amount or identity | Record a new correction with its superseded reference and reason. Recalculate affected distinct keys, periods, cohorts and resource intervals without counting both versions. |
| Actual cancellation, refund or reversal | Record the confirmed business event under its own semantics. Operational cancellation does not confirm a refund, and refund posting does not rewrite workflow completion history. |
| Reopened/reworked service | Preserve the original completion and linked new/reopened work according to its registered definition. A root-work completion count must declare whether it counts first completion or the final accepted completion. Rework uses a matured cohort and accepted follow-up policy. |
| Source snapshot with no history | Permit applicable as-of quantities/counts. Historical funnel, elapsed-time and completed-cohort measures remain unavailable or insufficient-history until required history exists. |
| In-progress intervals at cutoff | Clip intervals to the reporting period and cutoff only where the metric allows it. Label reserved versus actual occupation. Never infer an actual finish time from scheduled end. |

Counts and rates need truthful cohorts. Punctuality among confirmed arrivals/returns/completions must be accompanied by outstanding overdue or undecided work so unresolved cases do not disappear. No-show rates use due, noncancelled attendance-decided bookings and show undecided outcomes separately. Quote acceptance distinguishes finalized outcomes from open, withdrawn and superseded versions. A zero denominator produces no percentage. No fabricated minimum sample threshold is established here; show sample size and use the metric owner's configured sufficiency policy.

Resource utilisation uses interval union per identified resource and the same usable capacity pool/period. Exclude closures/maintenance only under the declared definition, preserve missing denominator coverage, and never add unlike units. Ratio rollups recompute combined compatible numerator/denominator rather than average displayed percentages. Bookings, participants, confirmed admission places, issued tickets and unique people remain different grains.

## Source switches, imports and historical backfill

Changing a provider or a data-class authority requires a preview of identity mappings, effective switch time, supported history, open operations and expected metric coverage. Keep work/source references stable; preserve the source authority effective for each fact and period. Apply an explicit reconciliation rule to overlapping histories. Do not merge copies through name matching, recent timestamp or apparent similarity.

A backfill records batch ID, extraction/import time, source/version, effective date range, declared completeness, stable original identities and the source watermark/cursor. Backfill must not manufacture occurrence times from import time. A gap in history remains visible. Compatible backfilled facts can recalculate earlier periods; record report revisions and disable incompatible prior-period comparisons.

When a source switch changes a metric meaning, unit, population, timezone or collection coverage, mark the discontinuity and compare only compatible segments. A capability becoming configured today does not prove that past activity was collected. Provider mapping and source-switch correctness need future connector-specific fixtures and acceptance before any confirmed runtime claim.

## Freshness and quality

Freshness policies are proposed configurable targets, not measured service commitments or live SLAs. Each binding records expected update trigger/cadence, target observation lag, maximum usable age, required completeness watermark and recovery route. Values remain unset until the owner and supported source define them. The frontend must not invent a live refresh promise for an unknown connector.

Operational workflow/availability cards should request an update after a confirmed relevant change and on scope change. Inventory follows its confirmed balance/movement cadence. Financial reports follow the financial posting/reconciliation cutoff. Discovery, promotions and feedback follow their declared provider reporting windows. Requirements refresh after evidence/review/configuration changes. Imports are current only to their declared coverage; manual facts are current only to their declared effective scope. These targets must never make an unconfirmed operation appear confirmed.

| Quality state | Meaning and presentation |
| --- | --- |
| `DEMO` | Fictional fixture or simulated outcome. Persistent sample provenance remains visible even if the fixture is otherwise complete or stale. |
| `COMPLETE` | All required sources and records for the declared scope, period/cutoff and definition meet coverage and validation requirements. This does not certify the merchant or unrelated business data. |
| `PARTIAL` | Some required coverage is missing but an explicitly permitted partial result is useful. Name covered/missing scope; do not represent it as a whole-business total. |
| `STALE` | Last confirmed evidence exceeds its configured maximum usable age or update expectation. Show as-of and impacted metric/actions. |
| `UNAVAILABLE` | A relevant supported read/calculation cannot currently produce a usable result. Retain permitted prior data separately with its timestamp. |
| `NOT_COLLECTED` | Relevant measurement has no configured/supported collection path or required instrumentation. Explain the needed source/setup, not "no activity." |
| `INSUFFICIENT_HISTORY` | Evidence exists but does not cover the required historical window, matured cohort or configured sufficiency rule. Show the available period/sample without a misleading trend. |
| `SUPPRESSED` | Permission/privacy rules prevent disclosing the value or breakdown. Do not expose it through totals, exports or contributing-record links. |
| `UNMAPPED` | Observations contain source identities/statuses/units/values with no approved semantic mapping. Show affected coverage and a repair route. |
| `CONFLICT` | Authoritative evidence, entity revisions or source bindings disagree and no approved resolution is available. Do not choose a result silently. |

Quality is a set of flags with scoped reasons, not one status that hides other issues. A demo dataset can be partial/stale; `DEMO` always remains visible. `COMPLETE` cannot coexist for the same metric scope with unresolved missing coverage/conflicts. Suppression takes precedence for what can be disclosed. A partial aggregate is allowed only when the metric permits it and its coverage can be explained. Unknown applicability cannot be treated as a clean exclusion.

Comparison validity is separate from freshness. Two fresh values can still have incompatible units, population, definitions or coverage. If comparability fails, show separate labelled values and omit the percentage change.

## Privacy, authority and grain

Use the smallest evidence necessary for the metric. Ordinary aggregate observations need stable scoped references, business timestamps and typed measures; they rarely need a person's name, contact information, full message, health detail or document image. Keep protected evidence in its owning system behind authorized references. Discovery linkage and repeat-customer metrics require approved purpose, consent/identifier rules and retention; no such approval is established by this design.

Apply current merchant/location/role and sensitive-data permissions before deriving or exposing reports and drill-downs. Prefer counts over unnecessary person-level exports. Do not permit combinations of dimensions or complementary totals that reconstruct a suppressed record; suppression thresholds and retention periods remain owner-defined. Finance visibility is a separate permission from work management.

The registry declares each measure's grain. Distinct root commercial work supports a carefully labelled cross-workflow total; child visits, delivery legs, resource allocations and financial postings are not added to that total. An active membership is an entitlement, not completed occurrence work. Dimensional aggregates must preserve applicable limits, such as currency, area/volume/pallet units, rated scale and participant versus booking counts. Categories select these meanings; they do not override them.

## Frontend fixtures now and confirmed sources later

For the current frontend phase, use deterministic local observations, fixed fixture time/cutoff, simulated delays and configurable quality states. All statistics fixtures and simulated transitions use `DEMO`. They exercise the same proposed field shapes, identity/grain, calculations, source labels and recovery states that future read models will provide. A preview action changes fixture state only and remains visibly a sample. This is a build requirement, not a claim that the existing frontend already implements this contract.

Future confirmed sources require approved observation schemas, actual authorization, provider/event mapping, source authority, completeness evidence, privacy rules and runtime verification. This document does not choose a database, event bus, queue, API implementation, provider credential or deployment architecture. No Supabase work is part of it.

Required frontend collection scenarios:

- Complete, true-zero, unavailable, not-collected, partial and insufficient-history results for each relevant metric family.
- Duplicate event delivery, event revision, late arrival, cancellation, reversal, reopening, rescheduling and accepted-deadline amendment.
- Same root work appearing in native/external channels; linked child execution, membership occurrences and dual collection/return legs.
- Snapshot-only import, incomplete backfill, source switch with overlap/gap and unsupported provider tokens.
- Missing denominator, incompatible currencies/units, overlapping resource intervals, scheduled versus actual use and outstanding overdue work.
- Suppressed finance/person-level data, permission change, unavailable drill-down and privacy-restricted breakdown.
- Home-to-Insights-to-record navigation preserving exact metric definition, period/cohort, scope, source coverage and cutoff.
- Each of the 128 subcategory mappings, conditional answer variants, mixed activities and a new category assembled from supported definitions.

Plan verification must confirm that every visible metric resolves its source families, accepted modes, grain, date basis, quality policy and drill-down. Runtime source collection remains unimplemented and unverified until the future confirmed-source phase is explicitly completed.
