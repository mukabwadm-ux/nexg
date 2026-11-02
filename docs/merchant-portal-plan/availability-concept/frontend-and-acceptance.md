# Availability frontend implementation and acceptance

Status: implementation plan only. This package has not implemented these components or passed runtime acceptance. No backend, API, database, Supabase, authentication, live provider, discovery or onboarding work is part of these stages.

## Proposed integration into the existing frontend

Create the dedicated /merchant-live-preview/availability route using MerchantLivePreviewShell. Extend its active destination type and link compatibly, coordinating with the Work/Offerings owners. Preserve their existing files and behaviour; leave legacy Hours and backend calendar routes untouched.

Suggested module boundary:
- workspace: scope, tabs, date/filter, draft and inspector coordination.
- model: typed context, intervals, source snapshots, units and discriminated view descriptors.
- source: AvailabilitySource interface and local sample implementation.
- resolver: registered schema/workflow/method → validated view descriptor.
- views: hours, resource calendar/agenda, asset timeline, occurrences, workload, linked roles, queue, occupancy and response coverage.
- forms: intervals, exceptions, pause, recurrence, capacity, copy/import and impact review.
- fixtures: coherent identities/revisions, demo clock, role/source/failure scenarios.
- adapters: read current Offerings records and coordinate explicit sample Work references through their source interfaces.

These are responsibilities, not a requirement to create one file per bullet or one component per category. Use existing shared controls where they support the actual task.

## Frontend source contract

AvailabilityContext includes businessId, profile/subcategoryId, offeringId/version, editorSchemaId, workflowId, modelId, selectedMethod, locationIds, requiredResourceIds, viewDescriptorRevision and sample scenario/role. Do not equate schema IDs, workflow IDs and primitives.

AvailabilitySnapshot includes:
- Scope, revision, observedAt, effective dates, date/resource coverage and timezone.
- Independent operating intervals, intake state, published occurrences, resource eligibility, exact constraints, typed pools and commitments.
- Source ownership per field/capacity, freshness/currentness and explicitly missing mappings.
- Allowed preview actions with reason; this is a simulated role response, not real authorization.
- Work references/root identity and resource claims, avoiding duplicate counts.
- Applied local changes, saved drafts and persisted operation references.

Proposed AvailabilitySource operations:
- load(context, boundedRange), refresh(context).
- saveDraft(context, draft, expectedRevision).
- previewImpact(context, proposal, expectedRevision).
- applyPreviewChange(context, proposal, expectedRevision, operationId).
- getPreviewOperation(operationId), history(context).
- resetOwnPreview(scope), exportPreview(scope).

Use discriminated results: applied, rejected, conflict, partial, pending and unknown. Unknown is not a successful mutation; reconcile first. Schema, unit, revision and scope mismatches produce explicit recoverable results.

The local projection demonstrates declared fixtures and UI semantics. It is **not a production availability/reservation engine**, source of stock truth or substitute for the previously built booking service.

## Local persistence and cross-screen coordination

Namespace Availability sample data by business/profile/location and schema version. Example design name: nexg.availability.preview.v1. Persist drafts and pending-operation references separately from applied snapshots. Cap stored date ranges and history size; validate all parsed data.

Offerings currently uses its own profile-keyed browser store. Read through its existing source adapter; do not write into its storage format directly. Preserve offering IDs, versions, resource links, ownership and publication.

WorkSource is currently sample-only and nonpersistent. True frontend cross-screen journeys require an agreed shared sample backing store or a narrow explicit adapter extending that source. This is a planned dependency, not an already working connection. Preserve Work's API compatibility. Use stable work/root IDs and scoped sample events; keep replay/idempotency deterministic.

If that shared preview bridge is unavailable, show the meaningful Work view and its integration limitation; do not claim that a resolved unrelated fixture changed the Availability snapshot. Completion of end-to-end acceptance requires the bridge.

A preview event contains entity IDs, revision, scenario and operation ID. A receiving adapter reloads its own source; event payloads cannot grant permission or mark capacity available directly. Another-tab edits trigger revision comparison. Do not merge one profile's draft into another.

Reset touches only the explicitly named local preview scope and coordinated fixture scenario. It never resets other agents' application files, existing real data or whole browser storage.

## Six frontend delivery stages

| Stage | Concrete deliverable | Completion evidence |
| --- | --- | --- |
| 1. Shared shell and descriptor resolution | Availability route; common header/nav; all 128 selectors; 18 schema bridge; 15 registered primitive descriptors; unsupported-state UI | Correct per-profile activity choices, no unrelated controls, no application network writes |
| 2. Populated renderers | Hours/intake; calendars and agenda; assets; sessions/tables; workload/linked/job/response/occupancy/leg variants | Coherent fixture snapshots, correct units, exact dates, no unknown-as-free |
| 3. Complete forms | Scoped drafts, intervals, inheritance, pause, exceptions, recurrence, capacity, source-read-only states, impact review | Valid/invalid/conflict/success/retry flows retain input and revision |
| 4. Cross-screen sample journeys | Offerings → Availability → same Work record → Availability; internal test/hold/fee-prerequisite scenarios | Shared IDs and one local snapshot; no duplicate allocations or fake discovery updates |
| 5. Recovery and responsive access | Storage errors, cross-tab conflicts, unknown operations, source scenarios; keyboard and mobile list flows | Fault injection and manual keyboard/reflow checks; pending operations survive refresh |
| 6. All-category acceptance | Profile/binding sweep plus specialty branches and future-category fixture | Evidence separates structural mapping from interactive validation; outstanding failures block a “complete” claim |

Onboarding remains last, after these frontend screens and their context contracts are stable. Future backend/provider work is a separate scope and must not be smuggled into these stages.

## All-category test matrix

The generated matrix has 128 rows and 193 candidate primitive bindings. Every row contains default editor/model suggestions, candidate workflow references, existing conditional rule IDs, specialty needs, vocabulary and inherited state/acceptance requirements. A candidate is not runtime activation.

Future frontend verification must cover:
- Every one of 128 complete default sample contexts.
- Every candidate binding in an explicit eligible sample offering/method, plus its disabled/unresolved case. Merely looping through IDs is insufficient.
- All 18 editor variants, especially remote vs on-site, event tickets vs group sessions and regulated vs ordinary enquiry.
- Actual conditional effect branches from the reconciled configuration: true, false, missing and contradictory input. Reference existing rule IDs rather than reinterpreting raw onboarding text.
- Permitted roles/location scopes and read-only ownership for every view family.
- Unknown new-category descriptor, valid new descriptor reusing a primitive, and invalid unit/model/workflow combinations.

## Behavioural acceptance cases

| ID | Given / action | Required observable outcome |
| --- | --- | --- |
| FE-01 | Order-only profile selected | Hours/intake view; no staff appointment/table UI unless separately enabled |
| FE-02 | Closed doors, scheduled intake explicitly enabled | Closed-now status remains; permitted future internal test can pass |
| FE-03 | Collection pause applied locally | Delivery unaffected; existing reservations and holds retained under saved policy |
| FE-04 | Split/overnight intervals edited/copied | Exact day meaning retained; cross-day overlaps rejected |
| FE-05 | Hold spans Amina + room | One work record, two claims; no double booking count |
| FE-06 | Room hidden by filter but occupied | Joint slot remains blocked and names required dependency |
| FE-07 | Demo clock reaches hold expiry | “Expiry being checked” until sample owner result; no timer-only release |
| FE-08 | Capacity12, reserved7, held2 | Remaining3; request4 fails; reducing total8 fails with IDs/units |
| FE-09 | Restaurant Orders vs Table reservations | Separate views/capacity; party fit and turnover only in table activity |
| FE-10 | Rental overdue actual custody | No automatic free period after planned return; future conflict visible |
| FE-11 | Maintenance overlaps confirmed work | Apply blocked; existing work retained; same-record Work handoff and revalidation |
| FE-12 | Source unknown/stale/partial or external read-only | Never green/free from missing events; no unsupported edits or generic approval fallback |
| FE-13 | Standard current source result vs named exception | Automatic confirmation simulation vs specific exception reason/actor; no Accept-all default |
| FE-14 | Remote/private/group/membership variants | Actual provider/place/credit distinctions and correct resource claims |
| FE-15 | Laundry drop-off vs collection, firm vs assessment | No invented driver; later roles only committed when declared and feasible |
| FE-16 | Workshop/car-wash queue vs intake/work allocation | Queue and estimate distinct; actual bay/team/custody windows correctly labelled |
| FE-17 | Cakes production due and cutoff | Workload units/working days respected; no fake appointment |
| FE-18 | Tour shared/private, meet-and-greet, field visit | Actual supplier/travel/transport requirements only |
| FE-19 | Freight/storage capacity edited | Unlike units never summed; explicit conversion/precision; actual release respected |
| FE-20 | Role/profile/location changes during edits | Scoped draft retained safely; no cross-profile leakage or hidden shared constraint |
| FE-21 | Two tabs edit same revision | Second apply conflicts; input survives and fresh diff is offered |
| FE-22 | Storage denied/full/corrupt | Honest local-save result, input preserved, scoped reset/export recovery |
| FE-23 | Apply result unknown then refresh/retry | Stable persisted operation ID; no duplicate change/release |
| FE-24 | Bulk import has success/failure/unknown targets | Exact per-target status; no replay of successes |
| FE-25 | Offerings publication/resource/version changes | Same identity reloaded; incompatible draft flagged, not silently applied |
| FE-26 | Reservation fee required or paid | Prerequisite displayed; policy edit/collection links correct; fee does not prove capacity |
| FE-27 | All-locations view then edit | Explicit target selection and impact preview; no accidental blanket mutation |
| FE-28 | Empty/unconfigured/filtered/unspecified/unknown fixtures | Different readable states with relevant recovery |
| FE-29 | New category reuses a primitive | Registered descriptor renders with vocabulary/units; unknown handler stays inactive |
| FE-30 | Browser action audit | No backend/Supabase/Google/discovery/auth mutation from these frontend flows |

## Accessibility and responsive verification

At 1920/1440 desktop widths, show schedule and one inspector; avoid nested scrolling where possible. At tablet widths condense secondary controls without hiding scope or source state. At 390px mobile, use agenda/list and full-screen forms; retain dates, exact units, dependencies and affected-work summaries.

Verify keyboard-only selection/edit/review/apply and alternatives to drag; meaningful focus order; drawer focus/return; visible focus; semantic tables/forms; labelled date controls; non-colour state cues; sufficient text/control contrast; screen-reader status messages; 200% zoom/reflow and long labels; reduced-motion preference. Use specific contrast measurements and accessibility checks after implementation. Static generated images do not establish WCAG compliance.

Use focused component/interaction tests for the resolver, unit and interval boundaries, revision/retry/storage recovery and joint-resource state. Use browser journeys for the real merchant decisions above; do not write tests that only mirror component internals. Run existing relevant Work/Offerings checks when shared source/shell code changes. This design-only package needs document/coverage/image verification, not a production test run.

## Completion language

“Plan complete” means the features, states, per-category mapping, local source boundary and acceptance criteria are documented. “Concept images complete” means exactly three coherent generated screens were saved and inspected. Neither statement means the Availability frontend is built or its controls are active.
