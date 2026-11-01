# Product specifications across all categories and screens

Date: 31 October 2026. Scope: design data and screen/workflow specifications in the Documents planning checkout.

The user approved the 21 previously listed additional offering/model routes. They initially asked to review Fashion & Apparel, selected screen designs/specifications rather than working application edits, then clarified that all 21 categories and all affected screens/workflows were required. Fashion is an example of a product-kind system, not a scope limit. This clarified full scope was completed as a reviewable design mapping.

The resolved catalogue contains all 21 categories, 128 subcategories, 189 offering templates, 390 specialty/offering mappings and 559 canonical field definitions in 151 groups. definitions.py composes fashion.py and specifications.py. experiences.py composes the shared eight merchant screens, eleven customer surfaces and existing workflow references. approvals.json is the exact user approval record, and approved-profile-additions.json is the generated extension of the historical profile snapshot.

The screen/workflow map has 168 category/screen compositions, 1,024 specialty/screen bindings, 208 offering/model bindings and all 18 registered workflow contracts. It preserves actual source transitions/variants/states in one normalized derived snapshot. Specialty-specific workflow references, approved additions and intake modes are retained instead of replaced by generic model illustrations. Actual item/variant/options, unit/interval and accepted specification/price/policy references flow to the existing selected workflow. Private intake stays distinct from public product content.

Updated all eight shared screen specifications with the all-category integration block, added customer-offerings.md, generated 21 category-specific screen/workflow pages and updated necessary core and booking/reconciliation entry points. Added product-specifications-review.md, product-specification-contract.md, all-screens-and-workflows.md/JSON and workflow-information.md. Apparel has a detailed worked review, but equivalent product-specific field matrices exist across the full catalogue.

Final commands from the repository root:

```text
python -X utf8 docs/merchant-portal-plan/offering-map/build.py
python -X utf8 docs/merchant-portal-plan/offering-map/verify.py
```

Observed final verification:

```json
{
  "status": "DESIGN_CHECKS_PASSED",
  "categories": 21,
  "subcategories": 128,
  "offeringTemplates": 189,
  "fieldDefinitions": 559,
  "generatedFilesChecked": 252,
  "localLinksChecked": 4371,
  "categoryMerchantScreenCompositions": 168,
  "specialtyMerchantScreenBindings": 1024,
  "offeringModelBindings": 208,
  "registeredWorkflowContracts": 18,
  "designScenarios": 19,
  "validatorRejectionCases": 9,
  "errors": []
}
```

An additional read-only check of nine modified core documents checked 110 local links with zero broken links. Its first shell invocation had a quoting/parser error; the corrected here-string invocation passed. No artifact was changed by that failed read-only command.

Review corrections included specific jewellery/smartwatch templates, garment/footwear size-row scope, actual dairy product form and labelled ambient/chilled/frozen condition, individual charger/cable controls, private task-specific shopping/travel/moving/cleaning intake, avoiding overlapping broad/specific prompts, and preserving the regulated enquiry route in model illustrations. The verifier exercises missing category screens, lost capture fields, leaked private information, changed registered transitions and forged/misrepresented approval metadata.

These are design/reference/selected semantic checks, not application, source-provider, legal/clinical/financial content, usability or production verification. Applicable field requirements remain reviewable. Historical effective booking registries and the active Desktop application were not changed. The active Desktop workspace was inspected read-only; the user explicitly chose design/specification updates for this round.

Skills applied: product-manager, unslop, nexg-contracts, nexg-phase-loop, ux-decision-design, principle-prove-it-works and principle-test-behavior-not-implementation. Master specification/execution-law files remain absent from this checkout, so no claim of conformity to unavailable higher-level documents is made.
