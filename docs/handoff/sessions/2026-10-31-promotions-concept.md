# Promotions concept delivery

Date: 31 October 2026. User request: develop the next Promotions screen end to end across all categories/subcategories and generate three concept images. The supplied Business screen was used as a visual reference. The user's earlier choice of screen designs/specifications for review remains the working scope.

## Delivered

- [Design package](../../merchant-portal-plan/promotions-concept/README.md), [full screen design](../../merchant-portal-plan/promotions-concept/screen-design.md), [fields/workflow JSON](../../merchant-portal-plan/promotions-concept/fields-and-workflows.json) and [all-128 JSON](../../merchant-portal-plan/promotions-concept/coverage-128.json).
- Actual catalogue coverage: 21 categories, 128 subcategories, 189 offering kinds, 390 specialty/offering bindings and 411 specialty/offering/model bindings; 15 model rules and 41 promotion fields. The 411 bindings are specialty-contextual routes rather than the existing 208 unique offering/model pairs.
- [Three selected concept images](../../merchant-portal-plan/promotions-concept/images.md), [exact prompts](../../merchant-portal-plan/promotions-concept/image-prompts.json), [provenance](../../merchant-portal-plan/promotions-concept/image-manifest.json) and [inspection](../../merchant-portal-plan/promotions-concept/image-review.md).
- Shared [Promotions specification](../../merchant-portal-plan/screens/06-promotions.md), planning index, changelog, deliverable register and current handoff updated.

## Design decisions

One configurable screen adapts to actual offerings, variants, options, units, price components and operational models. Category identity alone does not grant eligibility. Transaction dates remain separate from actual service/rental/departure/admission/occupancy dates. Known approved fees can be promoted even where the overall service is quoted; an unknown final quote cannot gain an invented discount price.

Offerings and Promotions share one authoritative benefit/rule owner. Existing work retains accepted versions; future edits do not silently rewrite agreed terms. Scope, publication/review, delivery, placement/charges and measurement are separate states. Missing metrics do not become zero. Customer terms show minimums, caps, exclusions, timing and deposit/extra treatment near the benefit.

The inspected registry contains Featured placement only. Automatic offers, codes, package/plan benefits and enquiry presentations are proposed extensions requiring applicable owner contracts. Runtime remains disabled. No existing booking lifecycle or historical effective registry was modified.

## Images

Built-in image_gen was used with local reference images. Three final selected assets are saved under docs/merchant-portal-plan/promotions-concept, each 1672 x 941:

1. 01-campaign-overview.png: actual product/variant scope, campaign list/detail, customer price and corrective eligibility action.
2. 02-service-offer-creation.png: service/duration/location, independent booking/service dates, actual-availability qualification, merchant cost and preview.
3. 03-rental-campaign-results.png: rental-day/minimum/pickup eligibility, excluded offering reason, defined results and separate non-discounted deposit.

The original rental generation rendered a KES 18,000 deposit instead of KES 10,000. It was rejected as final; one targeted image_gen edit corrected the deposit. Exact correction text and rejected/final source paths are preserved. Only three final images are selected in the project. No programmatic image editing was used. An optional Pillow import was unavailable; read-only standard-library PNG signature/chunk-CRC/dimension and SHA-256 checks supplied file-integrity verification.

## Verification executed

From the repository root:

1. `python -X utf8 docs/merchant-portal-plan/offering-map/build.py`: generated 252 files after the shared-screen update, retaining all existing counts and approved routes.
2. `python -X utf8 docs/merchant-portal-plan/offering-map/verify.py`: DESIGN_CHECKS_PASSED, 252 generated files and 4,377 local links, zero errors. Existing selected scenarios and rejection checks passed.
3. `python -X utf8 docs/merchant-portal-plan/promotions-concept/build.py`: generated all-128 coverage and field/workflow JSON/Markdown.
4. `python -X utf8 docs/merchant-portal-plan/promotions-concept/verify.py`: DESIGN_CHECKS_PASSED, zero errors. Verified source identities, model/workflow/approval preservation, generated consistency, public-field projection, five exact illustrative calculations, three rejection cases, known/unknown component eligibility, rental result arithmetic and three selected PNG checksums/chunk integrity/dimensions. Local links are counted in [verification.json](../../merchant-portal-plan/promotions-concept/verification.json).

The product example is KES 2,400 less KES 240 = KES 2,160. The service example is KES 4,000 less KES 600 = KES 3,400. Three rental days at KES 6,000 give KES 18,000 less KES 1,800 = KES 16,200, with separate KES 10,000 deposit. Six illustrative rental redemptions give KES 97,200 redeemed value and KES 10,800 funded savings.

## Scope and continuation

Review revision: the user marked the page-level status summary strip for removal. A targeted built-in image_gen edit removed that strip and closed the gap, retaining the compact in-list filters, campaign content and customer pricing. The selected overview file, exact edit prompt, image provenance, review notes and both Promotions specifications were updated. The original overview reference is archived under history for reproducibility; there are still exactly three selected final images.

This is design/reference and selected illustrative calculation evidence. It does not verify live publication, funding, redemption concurrency, allocation, source permissions, providers, metrics, accessibility or mobile behavior. No application, server, database, provider, payment, deployment or communication to another chat was changed.

The planning checkout is C:/Users/limta/Documents/ChatGPT/NEXG MERCHANT PORTA. The actual frontend inspected read-only is C:/Users/limta/Desktop/MERCHANT WORKSPACE and has separate in-progress work; do not assume the Documents checkout is the frontend or reset either workspace. Any implementation must first reconcile real campaign/rule ownership and supported runtime contracts with the existing Offerings discount behavior.

Skills applied: imagegen, ux-decision-design, unslop, nexg-contracts, nexg-phase-loop and the carried verification principles. Referenced NEXG master specification/execution-law files are absent from this checkout; no full-conformity claim is made.
