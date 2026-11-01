# Featured placements, History and customer-app preview

Date: 31 October 2026. User request: generate History and Featured placement, and let someone preview how it looks in the customer app. Continued the explicitly selected screen/design review scope. The revised overview with the removed top summary strip is the visual baseline.

## Delivered design and images

- [Featured placements](../../merchant-portal-plan/promotions-concept/04-featured-placements.png): selected active placement, actual surface/scope/dates, separate charge state and linked discount, pending request reason and Preview in app.
- [History](../../merchant-portal-plan/promotions-concept/05-promotion-history.png): past outcomes, saved revision/terms, actor/time/change timeline, historical Preview in app and Duplicate as draft.
- [Preview in app](../../merchant-portal-plan/promotions-concept/06-customer-app-preview.png): location/app/date/revision/mode context, customer discovery and offering-detail views, matching prices/terms and preview-only actions.
- [Updated design](../../merchant-portal-plan/promotions-concept/screen-design.md), structured surfaceContracts in the canonical source, generated JSON/Markdown, screen/index, gallery, review, prompts/provenance and status/handoff documents.

The preview rules inherit the actual 15 model adaptations across 21 categories and 128 subcategories. No template grants pricing, availability or publication permission. History uses a saved public revision; a rejected draft cannot be represented as something customers saw. Duplication creates a new draft, not resumed delivery or reused paid inventory. Preview interactions cannot place orders, book, charge, publish, redeem or allocate.

## Generation and inspection

Used built-in image_gen with local revised-shell references. Original three selected images remain; three new selected images bring the set to six. Each new PNG is 1672 x 941 and was visually inspected. Saved copies match tool sources byte for byte and passed read-only PNG chunk-CRC checks. Exact prompts and paths are in [prompt set](../../merchant-portal-plan/promotions-concept/image-prompts.json) and [manifest](../../merchant-portal-plan/promotions-concept/image-manifest.json).

The first customer-preview generation included instructions in its bottom information note. One targeted image_gen edit replaced that note with: Preview only. Actions do not place orders. Layout and availability may vary. The corrected image was inspected and selected. Rejected/final source paths and exact correction are retained. No programmatic image editing or external API/CLI fallback was used.

The illustrated placement fee is KES 1,500, independent of the linked discount. Both placement and app preview use KES 2,400 less 10% (KES 240) = KES 2,160, with KES 1,500 minimum and KES 500 cap. The archived campaign ends 30 October, before the 31 October sample context. These are fictional review fixtures, not a tariff, live inventory or measured operations.

## Verification

Commands and actual outcome are appended after generation. Machine-readable evidence is [Promotions verification](../../merchant-portal-plan/promotions-concept/verification.json) and [offering-map verification](../../merchant-portal-plan/offering-map/verification.json). PNG integrity checks and visual inspections above apply to the three newly saved images; live app rendering/interaction was not exercised.

## Scope and next work

No application, server, database, provider, placement booking, payment or communication to another chat was changed. The images demonstrate design; preview controls and entry points need implementation through the actual public rendering path and source-backed campaign/rule owners. Draft/scheduled/archived modes, model-specific app views, missing-source recovery and accessibility are specified, not demonstrated as working features.

Planning workspace: C:/Users/limta/Documents/ChatGPT/NEXG MERCHANT PORTA. Actual frontend remains C:/Users/limta/Desktop/MERCHANT WORKSPACE and was not changed. Preserve separate in-progress work.

Skills used: imagegen, ux-decision-design, unslop, nexg-contracts and nexg-phase-loop. Referenced master NEXG documents remain absent; no full-conformity claim is made.

## Executed verification evidence

`python -X utf8 docs/merchant-portal-plan/offering-map/build.py` regenerated 252 files after the shared screen update.

`python -X utf8 docs/merchant-portal-plan/offering-map/verify.py` returned:

```json
{
  "status": "DESIGN_CHECKS_PASSED",
  "generatedFilesChecked": 252,
  "localLinksChecked": 4378,
  "errors": []
}
```

`python -X utf8 docs/merchant-portal-plan/promotions-concept/build.py` regenerated design version 1.1.0-design, including six image briefs and the three surface contracts.

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
    "imageBriefs": 6
  },
  "localLinksChecked": 100,
  "errors": []
}
```

All six selected images passed dimension, SHA-256 and PNG chunk-integrity checks. Five illustrative price cases, three corrupted-input rejection cases and full source/model/workflow/approval coverage passed. Correction prompts and the archived overview reference were checked. Manual image inspection confirms the new tab selection, preview entry points, separate charge/discount facts, historical context and matching customer prices.

Acceptance for the requested design/image extension passed. Working app preview, live placements and transactional behavior remain unimplemented and were not tested.
