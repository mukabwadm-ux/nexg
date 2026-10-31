# Onboarding and booking reconciliation

Date: 31 October 2026. Scope: reconcile the current merchant onboarding inventory and proposed workflow/configuration definitions with the selected Payload Reserve booking architecture for every existing subcategory. This is pre-implementation design and validation work. No application, database or external account is changed by this package.

## One effective configuration

Use this package's generated effective question registry, effective profiles and effective workflows together. The older 29 October registries and the first Payload coverage register supply identity, source fields and audit history; they are not independent runtime rule sets to combine with the reconciled rules. Do not run an old answer resolver alongside this one or apply an old conditional rule after a corrected decision. Generated outputs name their sources and versions.

Merchant onboarding answers are inputs, not reservations, permissions or proof that a provider is connected. A scoped resolved configuration determines the relevant portal, offering fields, workflow, fulfilment and availability views. An actual selected offering and authorized command create work only after required setup and the reservation authority are ready.

The platform country is Kenya and the timezone is `Africa/Nairobi`. The old timezone question becomes a hidden platform constant. Timed records still retain correct instants; local date-only promises remain dates.

## Reading order

1. [Question audit](question-audit.md), [question bridge](question-bridge.json) and [effective question registry](effective-question-registry.json).
2. [Profile audit](profile-audit.md) and [all-128 profile decisions](profile-decisions.json).
3. [Workflow audit](workflow-audit.md) and [workflow bindings and corrections](workflow-bindings.json).
4. [Effective workflow contracts](effective-workflows.json), [effective domain definitions](effective-domain-registry.json) and [effective profiles](effective-profiles-128.json).
5. [Reconciliation report](report.md), [scenario evidence](verification.json) and [build manifest](manifest.json).

## Rules for consuming answers

One canonical question definition owns each meaning at its declared scope. Source spellings such as `answers.*`, `operationalAnswers.*` and `bookingSetup.*` map to those definitions through the bridge. An alias is not another independently editable truth. Conflicting explicit values require clarification; missing, false, zero and an empty value remain distinct. Do not overwrite an explicit answer with a default, another activity's answer or a newer timestamp.

Answers are scoped to business, activity/specialty, offering, location, resource or dated session as the definition requires. A shared source key is not permission to merge incompatible scopes. Existing single-specialty answers can populate that specialty's setup; adding multiple activities requires explicit scopes and review. Historical accepted work retains its configuration and policy revision.

Predicates use the existing bounded `all`/`any` and path/operator/value model. Question references compile through the effective registry to a canonical path. No category-supplied scripts or arbitrary property access are accepted. The reconciliation evaluator validates planned configuration behavior; it is not the production booking engine and does not implement allocation, authorization or payments.

## Corrections carried into the build

- Scheduled booking acceptance is distinct from advance booking being mandatory. A no answer to the latter does not erase optional appointments.
- A clinic that disables appointments does not retain an instant appointment promise by default. Workshop-only and mobile work use the actual selected mode.
- A restaurant's existing reservation-system declaration remains discovery only. Table reservations require explicit intent, compatible spaces, party rules and real authority.
- Recurring schedules and orders are separate from memberships, entitlements and renewal/payment consent.
- Special sourcing is separate from custom manufacture. Exact duration, quantity, unit and resource setup replaces marketing bands before reservations are allowed.
- Greeter-only work has its own execution variant. With-driver rental stays a rental, with joint eligible resource allocation.
- Rental, transfer and tour confirmation is guarded by the required confirmed allocations and applicable payment/acceptance policy. No partial-resource confirmation is implied.
- Collection, processing and return promises are checked together before a linked promise is confirmed. Later dispatch confirmation does not invent the first feasible return promise.
- Quote, order, entitlement and provider-enquiry work does not become a generic blocking appointment. Booking, allocation, payment and synchronization states remain independent.
- Native as well as external data classes require appropriate ownership; source discovery is not a prerequisite for declaring native authority.

## Implementation handoff

Build onboarding rendering and the configuration resolver from the effective question/profile contracts, including the categories whose specialty questions are not currently generated by the frontend. Preserve typed source answers and provenance. Implement the Payload adapter and NEXG extensions against the effective workflow/domain contracts and the parent plan's source, allocation, access, payment and post-commit requirements.

Use the reconciled manifest as the entry point for adding a category. Bind existing questions/models/workflows and verify the same invariants. A novel operation needs a registered capability, schema, commands and acceptance evidence before activation. The existing count of 128 is an audited baseline, not a fixed array of separate applications.

Static checks and design scenarios show what has been reconciled. They do not prove an installed engine, secure tenant isolation, transaction correctness, Google synchronization or live payment behavior. Those remain implementation and release evidence specified in the parent plan.
