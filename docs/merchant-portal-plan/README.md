# Adaptive merchant portal design plan

Date: 29 October 2026. Status: proposed design, prepared for review. This package specifies behaviour; it does not implement a portal, approve business policy, connect a provider or establish live merchant readiness.

## Outcome

A merchant answers the applicable onboarding questions once. A validated, versioned business configuration then determines the discovery experience, offering fields, work types, workflow steps, availability, fulfilment and eight portal screens. Merchants share the NEXG shell and reusable components. Differences follow their operations and answers.

The current baseline is 21 categories and 128 subcategories. The registries and validation rules must support adding further categories without editing a fixed list of 128 screen implementations. Existing capabilities can be assembled through configuration. A genuinely new operation needs an explicit capability extension before it can be enabled.

## Read in this order

For the current short-form onboarding, setup Home and admin-approval integration, start with the [1 November integration plan and build order](onboarding-integration/README.md). It carries the user's latest decisions: optional entry details, setup from Home, and the operational portal locked pending approval. The [evidence register](onboarding-integration/evidence.md) distinguishes the existing implementation from design proposals.

1. [Onboarding and configuration](onboarding-and-configuration.md).
2. [Answer effects](answer-effects.md), [typed question registry](question-registry.json) and [workflow catalogue](workflow-catalogue.md).
3. [Integrations](integrations.md), [components](components.md), [domain definitions](domain-registry.json) and [new-category authoring](category-extension.md).
4. [All 128 profiles](profiles-128.md), their [configuration records](profiles-128.json) and [acceptance fixtures](acceptance-128.json).
5. [Shared screen contract](screen-contract.md).
6. Screen specifications in order: [Work](screens/01-work.md), [Offerings](screens/02-offerings.md), [Availability](screens/03-availability.md), [Business](screens/04-business.md), [Money](screens/05-money.md), [Promotions](screens/06-promotions.md), [Insights](screens/07-insights.md), [Settings](screens/08-settings.md).
7. [Implementation and verification phases](implementation-plan.md), [decisions and consistency review](review.md) and [reference-image briefs](image-briefs.md).
8. [Eight final screen pictures](images/README.md), [generation prompts](image-prompts.json) and [selected image provenance](image-manifest.json).
9. [Current end-to-end booking and calendar plan](payload-reserve-plan/README.md), selected Payload Reserve adaptations, Kenya-only operation, explicit 128-subcategory coverage and [commercial-use terms](payload-reserve-plan/commercial-use.md). This later booking scope supersedes frontend-only and earlier technology-selection statements for the booking initiative; the older profile fixtures remain planning inputs and need the documented semantic corrections.

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

## Statistics amendment, 31 October 2026

The [statistics plan](stats/README.md) closes the explicit Home statistics mapping gap. It adds Home bindings for all128 specialties, collection evidence for each metric,17 workflow bindings, source/quality/permission rules and frontend acceptance. Home and Insights use the same definitions. This local workspace copy is the current design package; the earlier Documents checkout is historical. The next implementation scope is frontend only. Existing reference pictures predate this amendment and do not prove its adaptation.

## Automatic confirmation correction

[Automatic order confirmation](order-confirmation.md) is the governing user correction. Native/API/webhook source-confirmed stock or resource availability normally confirms work automatically. Merchant acceptance is not a default intake policy or Home statistic. Human review requires an explicitly enabled, matching exception with a named reason. Unknown stock/connection outcomes remain pending or unavailable; they do not become manual approval tasks.

## Current Offerings concept

[Offerings component audit and selected general image](offerings-concept/README.md),31October2026: all128 subcategories,18 editor contracts, scoped inheritance and source-aware states checked before one new picture. This is the current Offerings reference; the29October Offerings picture remains historical. No Offerings implementation is claimed.
