# Deliverables

This matrix tracks the adaptive merchant portal planning assignment. It does not declare unrelated platform phases complete.

| Deliverable | Current state | Evidence and limits |
| --- | --- | --- |
| Existing onboarding audit | SOURCE_AUDIT_VERIFIED | docs/audits/merchant-onboarding-audit-2026-10-29.md; no live database/merchant submission proof |
| Onboarding/configuration plan | DESIGN_SPECIFIED | docs/merchant-portal-plan/onboarding-and-configuration.md |
| Typed question/effect registry | DESIGN_SPECIFIED | 300 definitions, including all 235 taxonomy fields; proposed behaviour |
| Workflow catalogue | DESIGN_SPECIFIED | 17 families, explicit guarded variants and nine concierge paths |
| All current subcategories | DESIGN_SPECIFIED | 128 profiles, 1,024 screen mappings and 128 named acceptance records plus 1,163 variants |
| Future-category authoring | DESIGN_CHECKS_PASSED | Draft manifest/schema; 300 question schemas valid, 2 synthetic fixtures and 12 invalid candidates checked; no runtime publication |
| Shared components and integration plan | DESIGN_SPECIFIED | Contract/authority/source and state-aware definitions; no provider connected |
| Eight screens | DESIGN_SPECIFIED | Work → Offerings → Availability → Business → Money → Promotions → Insights → Settings; 188 feature definitions |
| Domain reference catalogue | DESIGN_CHECKS_PASSED | 17 offering schemas, 16 availability models, 45 metrics, 61 capabilities, 19 fulfilment methods and all current aliases; all 50 future-example versioned references resolve |
| Reference pictures | GENERATED_AND_INSPECTED | Exactly eight selected final PNGs in docs/merchant-portal-plan/images; built-in imagegen, fictional preview data; not an interactive prototype |
| End-to-end Payload booking plan | DESIGN_SPECIFIED | docs/merchant-portal-plan/payload-reserve-plan/README.md; selected foundation, Kenya scheduling, extensions, commercial-use terms and release criteria |
| Reconciled onboarding/booking contracts | RECONCILIATION_CHECKS_PASSED | docs/merchant-portal-plan/payload-reserve-plan/reconciliation/manifest.json; all 128 profiles, 323 canonical questions preserving the original 300 IDs, 18 workflow contracts and 23 corrected transition guards; configuration/schema evidence only |
| Reconciled acceptance coverage | DESIGN_CHECKS_PASSED | 1,156 planned cases; 384 readiness-rejection and 16 targeted planning behavior scenarios checked; no production booking execution |
| All-category offering information map | DESIGN_CHECKS_PASSED | docs/merchant-portal-plan/offering-map/README.md; 21 categories, 128 specialties, 189 offering templates, 390 bindings, 559 canonical fields and 151 groups; product-kind design across the full catalogue |
| Offering capture and customer display consistency | DESIGN_CHECKS_PASSED | offering-map/verification.json; direct source/reference checks, 252 generated files, 4,371 local links, 19 design scenarios and nine rejection cases; all 21 additional model routes approved for design inclusion, with no runtime activation |
| All-category screen and workflow integration | DESIGN_CHECKS_PASSED | offering-map/all-screens-and-workflows.json; eight merchant screens, eleven customer surfaces, 168 category/screen compositions, 1,024 specialty/screen bindings and 208 offering/model bindings referencing all 18 existing workflow contracts; design only |
| Necessary screen and core document updates | DESIGN_SPECIFIED | All eight shared screen specifications updated; customer-offerings.md added; workflow catalogue, answer effects, onboarding, components, implementation and booking/reconciliation entry points reference the product-kind composition. Additional 110 links across nine core documents checked with zero broken links. |
| Promotions end-to-end adaptation | DESIGN_CHECKS_PASSED | promotions-concept/README.md and verification.json; 21 categories, all 128 subcategories, 189 offering kinds, 390 specialty/offering bindings, 411 specialty/offering/model bindings, 15 models and 41 captured fields. Covers creation through customer acceptance, management, results and recovery. Existing Featured registration preserved; other promotion types are proposed extensions. |
| Five Promotions concept images | GENERATED_AND_INSPECTED | promotions-concept/images.md, image-manifest.json and image-review.md; unified Campaigns, service creation, rental results, History and customer-app preview. Three revised images implement the two-tab decision; the standalone placement directory is retired. Five selected 1672 x 941 PNGs have checked provenance/integrity. Fictional design references, not runtime evidence. |
| Unified Campaigns, History and app preview | DESIGN_CHECKS_PASSED | promotions-concept/screen-design.md and source-driven surfaceContracts; only Campaigns and History page tabs, Featured placement as a type with conditional fields in the shared detail/editor, one creation flow, current/historical public preview and preserved source ownership. No live preview or purchase operation implemented. |
| Application implementation | PLANNED_NOT_STARTED | End-to-end objective accepted; this assignment resolves design before building. Actual runtime, providers, credentials, allocation correctness and production readiness remain delivery work. |

Registry validation and generated scenario consistency do not establish implemented business behaviour.

The earlier 29 October registry and scenario counts above describe the historical planning inputs. Booking implementation consumes the later reconciled manifest as one effective snapshot and must not replay the superseded rules independently.

## Settings frontend, 1 November 2026

The Settings-only implementation is in apps/web/components/merchant/settings. Live entry: /merchant/settings; explicit synthetic preview: /merchant-preview/settings. Other merchant pages remain on the existing layout and backend commands. Frontend service boundaries and the final-test sequence are documented in settings-concept/frontend-implementation.md. Backend identity, connector, developer and data-request activation are separate owner work.
