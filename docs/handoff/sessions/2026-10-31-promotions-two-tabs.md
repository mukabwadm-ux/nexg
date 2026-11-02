# Promotions simplified to Campaigns and History

Date: 31 October 2026. User decision: Featured placements duplicates Campaigns; use just Campaigns and History. Continued the established design/specification review scope.

## Result

One Campaigns directory contains every supported campaign type, including Featured placement. A Type filter finds those campaigns, the selected type supplies relevant fields inside the common detail/editor, and Create promotion opens the shared type-specific flow. Placement surface, dates, inventory, review/delivery and charge facts remain explicit; a linked discount retains its separate rule owner. Removing navigation does not remove the feature or grant new capabilities.

History remains for past outcomes and saved public revisions. Preview in app remains in campaign details and History, with Back to Campaigns or Back to History and preserved selection/filter context. Public/current/draft/scheduled/archived distinctions remain specified.

## Images and provenance

- [Unified Campaigns](../../merchant-portal-plan/promotions-concept/01-campaign-overview.png): Campaigns and History only, type/status filters, Featured placement in the shared list, and Preview in app.
- [History](../../merchant-portal-plan/promotions-concept/05-promotion-history.png): two page tabs, with saved terms/timeline and historical preview preserved.
- [App preview](../../merchant-portal-plan/promotions-concept/06-customer-app-preview.png): Back to Campaigns, with app views, prices and terms preserved.

These three selected images were revised through built-in image_gen and visually inspected. The separate Featured placements image is retired from the current gallery, briefs and selected manifest. It remains as historical evidence, not current navigation. There are five selected images: these three plus the unchanged service-creation and rental-result examples. Previous images and prompt/manifest snapshots are preserved under history/before-two-tabs. [Exact edit prompts](../../merchant-portal-plan/promotions-concept/two-tabs-image-prompts.json) and [provenance](../../merchant-portal-plan/promotions-concept/image-manifest.json) retain the source chain.

## Design sources and verification

Updated definition.py and design version 1.2.0-design, the generated JSON/Markdown, both screen specifications, plan, index, gallery, review, deliverables and current handoff. The new campaigns surface contract explicitly lists only Campaigns and History. Featured placement is embedded in campaigns with separateNavigation false. All 21 categories, 128 subcategories, 189 offering kinds and 15 model rules remain in scope.

Execution results are appended after regeneration. Static evidence is in [Promotions verification](../../merchant-portal-plan/promotions-concept/verification.json) and [offering-map verification](../../merchant-portal-plan/offering-map/verification.json). Visual inspection checks two tabs, no top summary strip, the shared Type filter, retained historical preview and corrected return destination. It does not prove live interaction.

## Boundaries

No working application, backend, database, provider, campaign publication, placement purchase or payment was changed. Retained sample prices, dates, statuses and app views are fictional design data. Actual implementation still needs the source-backed shared query/editor and public preview renderers. No messages were sent to another chat or person.

Skills used: imagegen, ux-decision-design, unslop, nexg-contracts and nexg-phase-loop. Master NEXG specifications remain absent from this planning checkout; no full-conformity claim is made.

## Executed verification evidence

`python -X utf8 docs/merchant-portal-plan/offering-map/build.py` regenerated 252 files.

`python -X utf8 docs/merchant-portal-plan/offering-map/verify.py` returned:

```json
{
  "status": "DESIGN_CHECKS_PASSED",
  "generatedFilesChecked": 252,
  "localLinksChecked": 4378,
  "errors": []
}
```

`python -X utf8 docs/merchant-portal-plan/promotions-concept/build.py` generated design version 1.2.0-design with five selected image briefs.

`python -X utf8 docs/merchant-portal-plan/promotions-concept/verify.py` returned:

```json
{
  "status": "DESIGN_CHECKS_PASSED",
  "counts": {
    "categories": 21,
    "subcategories": 128,
    "offeringTypes": 189,
    "offeringBindings": 390,
    "offeringModelBindings": 411,
    "modelRules": 15,
    "fields": 41,
    "imageBriefs": 5
  },
  "localLinksChecked": 105,
  "errors": []
}
```

Two-tab metadata, full source/model/workflow/approval coverage, five selected PNG checksums/dimensions/chunk-integrity checks, five illustrative price cases and three corrupted-input rejection cases passed. Revised-file source copies and pre-edit reference hashes passed. Manual inspection confirmed Campaigns/History only, the shared type filter, retained Preview in app and Back to Campaigns.

Acceptance passed for this design/image revision. No live application interaction, customer rendering, purchase, publication, booking or payment behavior was exercised.
