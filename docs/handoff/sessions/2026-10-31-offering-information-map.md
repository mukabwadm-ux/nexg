# Offering information mapping session

Date: 31 October 2026. Scope: planning and reference-data authoring in the Documents checkout.

The user requested a plan separating merchant identity from actual offerings, then clarified item-specific data capture through customer display, including dress waist and other measurements by size. They authorized mapping every current category/subcategory. The final steering asks to see the 21 flagged workflow additions for review.

Delivered docs/merchant-portal-plan/offering-map with one human-authored definitions.py source, deterministic builder/verifier, machine-readable catalogue, 21 category pages, 184 template field matrices, all-128 coverage, shared field library, customer display rules and review decisions. All 128 identities are preserved. There are 384 specialty/offering bindings, 399 canonical fields, 99 field groups and 21 additional model routes for review. These are proposed requirements, not accepted runtime capabilities.

Commands executed from the repository root:

```text
python -X utf8 docs/merchant-portal-plan/offering-map/build.py
python -X utf8 docs/merchant-portal-plan/offering-map/verify.py
```

Observed final verifier output:

```json
{
  "status": "DESIGN_CHECKS_PASSED",
  "counts": {
    "categories": 21,
    "subcategories": 128,
    "offeringTemplates": 184,
    "fieldGroups": 99,
    "fieldDefinitions": 399,
    "specialtyOfferingMappings": 384,
    "additionalModelRoutes": 21
  },
  "generatedFilesChecked": 210,
  "localLinksChecked": 1745,
  "errors": []
}
```

The saved evidence also records 12 selected design scenarios and four rejected corrupted mappings. Direct source checks cover the live TypeScript taxonomy, onboarding audit and effective profile/question/domain/model references. Manual inspection included the dress field matrix and all 21 activity-extension rows. Authoring corrections included mixed-garment applicability, explicit band/cup fields, separate cable/charger controls, public card projection routing, conditional bundled-plan fields and preserving stock cake versus custom-production meaning.

No application source, database, provider, booking engine or effective registry was changed. Actual form/storage/public-API/customer/transaction behavior, merchant validation and applicable provider policy review remain outside this design evidence. Missing master specification documents are documented; the package does not claim conformity to unavailable higher-level files. Existing unrelated untracked files were left in place.

Skills applied: product-manager, unslop, nexg-contracts, nexg-phase-loop, principle-prove-it-works and principle-test-behavior-not-implementation.
