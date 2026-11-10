# Catalog and eligibility engine

Status updated 19 October 2026: src/index.ts implements the bounded workflow-policy foundation. [Usage and trust boundaries](../../docs/FOUNDATION_RUNTIME.md) and [verification](../../docs/FOUNDATION_VERIFICATION.md) describe the tested subset. Live source adapters, complete workflow feasibility and owner operations remain pending.

Establish which source entities can satisfy the current request and why. Keep taxonomy, fact quality, access policy, availability knownness and workflow capability distinct.

## Contract

- Input: Original entity references and versioned facts from the provider adapter; verified offering workflow/capabilities and applicable qualifiers; separate discovery scope/context; explicit customer constraints.
- Output: Allowed retrieval scope, validated candidate references, typed unknowns and exclusion/unsupported reasons. No invented facts.

## Versions

| Version | Planned work |
| --- | --- |
| V1 | Validate mappings and parent ownership; retain unmapped/partial states; separate browse eligibility from transaction capability. |
| V2 | Consume supported stock/slot/interval/route adapters and freshness versions; evaluate richer workflow/resource feasibility. |
| V3 | Preserve the same hard boundary while models improve; monitor drift and false inclusion/exclusion per subcategory. |

## Acceptance

Unknown never satisfies an affirmative constraint; mixed-catalog items require classification; deleted/ineligible refs cannot pass; source failure is explicit.

Use [workflow policies](../../docs/WORKFLOW_POLICY_SPEC.md) and the [rule audit](../../docs/WORKFLOW_RULE_AUDIT.md). The [complete taxonomy coverage map](../../docs/WORKFLOW_COVERAGE.md) records conditional possibilities, not an operational allowlist. Keep alternatives, stages and composite commitments distinct, with unsupported extensions disabled at the affected claim/action.

[Ads management](../../../discovery-studio/docs/ADS_MANAGEMENT.md) reuses these source-backed checks for merchant/offering ads. Campaign budget or placement priority cannot bypass eligibility; budget authorization and billing remain owned by ad delivery/finance.

Read the shared [architecture](../../docs/ARCHITECTURE.md), [ranking design](../../docs/RANKING_DESIGN.md), [contract](../../docs/INTEGRATION_CONTRACT.md) and [benchmark plan](../../docs/BENCHMARKS.md). Canonical taxonomy and platform source ownership apply to this module.
