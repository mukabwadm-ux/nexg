# Adaptive merchant portal design plan

Date: 29 October 2026. Status: proposed design, prepared for review. This package specifies behaviour; it does not implement a portal, approve business policy, connect a provider or establish live merchant readiness.

## Outcome

A merchant answers the applicable onboarding questions once. A validated, versioned business configuration then determines the discovery experience, offering fields, work types, workflow steps, availability, fulfilment and eight portal screens. Merchants share the NEXG shell and reusable components. Differences follow their operations and answers.

The current baseline is 21 categories and 128 subcategories. The registries and validation rules must support adding further categories without editing a fixed list of 128 screen implementations. Existing capabilities can be assembled through configuration. A genuinely new operation needs an explicit capability extension before it can be enabled.

## Read in this order

1. [Onboarding and configuration](onboarding-and-configuration.md).
2. [Answer effects](answer-effects.md), [typed question registry](question-registry.json) and [workflow catalogue](workflow-catalogue.md).
3. [Integrations](integrations.md), [components](components.md), [domain definitions](domain-registry.json) and [new-category authoring](category-extension.md).
4. [All 128 profiles](profiles-128.md), their [configuration records](profiles-128.json) and [acceptance fixtures](acceptance-128.json).
5. [Shared screen contract](screen-contract.md).
6. Screen specifications in order: [Work](screens/01-work.md), [Offerings](screens/02-offerings.md), [Availability](screens/03-availability.md), [Business](screens/04-business.md), [Money](screens/05-money.md), [Promotions](screens/06-promotions.md), [Insights](screens/07-insights.md), [Settings](screens/08-settings.md).
7. [Implementation and verification phases](implementation-plan.md), [decisions and consistency review](review.md) and [reference-image briefs](image-briefs.md).
8. [Eight final screen pictures](images/README.md), [generation prompts](image-prompts.json) and [selected image provenance](image-manifest.json).
9. [Current end-to-end booking and calendar plan](payload-reserve-plan/README.md), selected Payload Reserve adaptations, Kenya-only operation, explicit 128-subcategory coverage and [commercial-use terms](payload-reserve-plan/commercial-use.md). This later booking scope supersedes frontend-only and earlier technology-selection statements for the booking initiative; the older profile fixtures remain planning inputs and need the documented semantic corrections.
10. [Reconciled onboarding and workflows for the build](payload-reserve-plan/reconciliation/README.md), with [one effective manifest](payload-reserve-plan/reconciliation/manifest.json) covering preserved onboarding identities, typed input aliases, all 128 profiles, corrected workflow guards and domain bindings. This is the current source selection for booking implementation; do not replay historical conditional rules alongside it.
11. [Product and service categorization working proposal](offering-categorization-plan.md), separating merchant identity, offering categories, attributes and merchant shop sections. This proposes further classification work and does not change the effective booking configuration.
12. [Offering information and customer display working proposal](offering-information-plan.md), defining forms for specific offering types, variant-level specifications and measurements, and how each field reaches the customer experience. Dress, shirt and car rental are the first worked examples.
13. [Offering information map for all categories](offering-map/README.md), with explicit offering types for every current subcategory, typed capture requirements, variant and location scope, customer-display destinations and additional activity routes for review.
14. [Fashion & Apparel field review](offering-map/fashion-review.md), [structured Fashion JSON](offering-map/fashion-review.json), [merchant/customer screen designs](offering-map/fashion-screens.md) and [customer screen criteria](screens/customer-fashion.md). The 21 additional cross-category routes are approved for design inclusion in the [explicit profile extension](offering-map/approved-profile-additions.json); individual category fields remain under review.
15. [Product specifications across all 21 categories](offering-map/product-specifications-review.md), [product-kind contract](offering-map/product-specification-contract.md), [all screen/workflow designs](offering-map/all-screens-and-workflows.md), [structured screen/workflow JSON](offering-map/all-screens-and-workflows.json) and [customer screens](screens/customer-offerings.md). This is the clarified all-category scope. Fashion is one example; every current subcategory and actual offering type participates in the shared specification and presentation system.
16. [Promotions end-to-end concept](promotions-concept/README.md), [full screen design](promotions-concept/screen-design.md), [all-128 adaptation](promotions-concept/coverage-128.md) and [five selected images](promotions-concept/images.md). Page tabs are Campaigns and History only. Featured placement is a campaign type with conditional fields in the shared detail/editor, not a second directory. Preview in app retains current or saved historical context as appropriate.

17. [Insights end-to-end concept](insights-concept/README.md), [detailed screen design](insights-concept/screen-design.md), [all-merchant coverage](insights-concept/coverage.md), [metric definitions](insights-concept/metric-registry.json) and [twelve selected images](insights-concept/images.md). One adaptive screen uses Overview and Reports, actual configured activities, defined cohorts/units, evidence drill-down and truthful source states. Covers all 128 baseline subcategories, 21 approved additional routes and fifteen operational models. Financial activity and attribution retain explicit source-owner gates.

Machine-readable documents in this directory are proposed design fixtures. Future application schemas and persistence changes require implementation and contract validation. The current production application does not consume these files.

## Authority and dependencies

The existing repository, Home specification and onboarding audit provide the baseline. Available NEXG contract and integration skill summaries inform the proposed boundaries. Their referenced master specification and execution-law documents were not found in this checkout. This plan therefore cannot claim conformity to unavailable master documents.

Keep approved document requirements, financial rules, permission grants and publication gates authoritative. Where a product or service rule remains undecided, record a dependency and prevent the dependent command being presented as live. A complete interaction design can show the resulting pending or unavailable state without inventing the rule.

## Acceptance of this planning package

- Every current subcategory has a named configuration and acceptance scenario.
- Every taxonomy field has a registry definition or explicit alias decision.
- Every proposed operation references a workflow, component and owner contract.
- Category publication updates onboarding and portal behaviour together.
- Each screen covers features, actions, states, recovery, mobile behaviour and the merchant-specific differences.
- Coverage checks distinguish design specification from runtime verification.
- All eight specifications precede picture generation. A picture is one illustrative populated state, never proof of functional behaviour.

No application implementation, real connection, publication, fee change or payout is authorized by the illustrative records or pictures.
