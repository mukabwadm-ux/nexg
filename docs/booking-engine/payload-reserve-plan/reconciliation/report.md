# Reconciliation report

Date: 31 October 2026. Result: onboarding and booking design conflicts reconciled across the 21-category, 128-subcategory baseline. See [verification.json](verification.json) for the actual planning checks and counts. This is not evidence that a production booking system has been built or tested.

## Source confirmation

The current Desktop MERCHANT WORKSPACE taxonomy was read and compared with the saved onboarding inventory across names, parent categories, specialty fields, fulfilment hints, workflow hints, default workflows and suggested item counts. All 128 entries match, with zero differences. Exact paths and hashes are recorded in [profile-decisions.json](profile-decisions.json) and the [manifest](manifest.json). No application source was edited.

The previously planned onboarding is retained as the foundation. All 300 question identities and every specialty's exact source keys are preserved. The 31 booking inputs map to 323 effective canonical definitions: eight inputs reuse existing meanings and 23 add defined operational facts. Input aliases have explicit scope and conflict handling. Marketing bands remain declarations until the exact operational value is captured.

## Resolved gaps

| Gap | Resolution in the effective contracts |
| --- | --- |
| Two competing sets of answers and conditional rules | One effective question/profile/workflow/domain manifest; historical source rules are not replayed after corrected rules. |
| Duplicate setup questions and mismatched namespaces | Explicit alias bridge and typed canonical targets; same-scope disagreements require clarification. |
| Form questions depended on already-active booking models | Candidate models and applicable data classes determine questions before readiness. Actual activation is separate. |
| Wrong existing-system and resource-selector paths | Predicates refer to the canonical discovery/resource-selector definitions, with declared derived selectors. |
| Kenya timezone presented as a merchant question | Africa/Nairobi is a hidden platform constant, retained in schedule schemas. |
| Generic category default could override the chosen offering | All 128 profiles have selected-offering eligibility guards, scoped conditional bindings and explicit replacement/suppression rules. |
| Mandatory versus optional booking conflated | Separate booking acceptance and advance-booking requirement; contradictory answers do not publish. |
| Clinic no-booking and workshop battery modes | Explicit appointment suppression and mobile-to-workshop replacement without fictitious slots or dispatch. |
| Existing reservation system accidentally enabled table bookings | Discovery remains discovery. Explicit table intent, actual compatible space/party policy and authority enable a registered space-reservation workflow. |
| Recurrence became membership or renewal | Recurring occurrences/orders, commercial entitlements and payment consent are distinct. |
| Sourcing became manufacture | Custom-order kind selects sourcing/request or real production commitment. |
| Home/installation/concierge modes could duplicate work | Bindings distinguish selected models and linked execution; a selected authorized command creates one child using shared allocation/payment identity. |
| Broad capacity and money ownership groups | Person, asset, workload, weight, volume and area have typed quantities; authority uses the original 15 canonical leaf data classes. Payments do not imply refund/settlement/payout authority; capacity grouping needs explicit scope clarification. |
| Conflicting minimum-order declarations | Legacy min_order and min_basket keep distinct source-declaration paths; the exact operational amount has one existing canonical definition. |
| Work confirmed before all required resources | Twenty-three transition-guard corrections cover rental, transfer, tour, pickup/return, session, storage, request and related commitment boundaries. |
| Greeter-only service inherited passenger-trip steps | A separate greeter variant excludes vehicles, boarding and destination milestones unless transport is actually included. |
| Firm return promise versus later dispatch conflated | Firm paired promises require feasible incoming, processing and outgoing commitments; assessment-dependent promises remain explicitly indicative until accepted. |
| Prose-only exceptions and generic intake | Explicit exception bindings and model-specific intake allowlists; physical custody and authoritative release remain distinct from a date passing. |
| Source production constraints omitted valid holds | Effective production capacity counts both valid holds and confirmed commitments. |

## Effective output

- [323 typed question definitions and aliases](effective-question-registry.json).
- [128 effective profiles](effective-profiles-128.json), including all eight portal-screen bindings and source-field preservation.
- [18 workflow contracts](effective-workflows.json): the original 17 families with corrected guards and exceptions, plus the proposed space-reservation contract. Allocation/payment/sync state remains separate from work state.
- [Effective domain definitions](effective-domain-registry.json), including table/space offering, capacity and capability bindings.
- [All-128 coverage register](../coverage-128.md), regenerated from the reconciled decisions rather than independently authored prose rules. It retains 1,156 planned acceptance scenarios.

The decision register contains 65 typed conditional model bindings and 174 modifiers/correction rules. Sixty-seven profiles required adjustments to the earlier proposals; 61 retain their baseline model with explicit eligibility and shared safeguards. Each remains a configurable shared portal rather than a separate application.

## What remains before production readiness

There is no unresolved category-level decision that is being silently replaced by an invented default. Merchant-specific durations, actual resources, party rules, prices, policies and source authority are explicitly captured or left setup-required. Those are onboarding/operational inputs, not questions that NEXG should guess for every business.

Implementation must materialize the selected Payload runtime and NEXG extensions, compatible dependencies, identity/access bridge, transactions, durable tasks, actual supported provider adapters and user interfaces. Production accounts, credentials, provider approval, deployment/monitoring, recovery and real end-to-end verification remain delivery dependencies. None is established by these planning checks.

The older plan references higher-level master/contract documents that were not available in the inspected project paths. This reconciliation does not claim approval against unavailable normative documents. It resolves the onboarding/booking design within the supplied source inventory and selected architecture; implementation still follows the project's actual governing contracts when available.

Use [manifest.json](manifest.json) as the entry point for building. Historical `question-registry.json`, `profiles-128.json`, `workflow-catalogue.md` and their old fixture resolver remain source/audit inputs. Their superseded behavior must not be treated as another active configuration source.
