# Adaptive Promotions screen

Date: 31 October 2026. Status: revised two-tab design and five selected illustrative images. Applies across all 21 categories, 128 subcategories and the actual offering/model bindings in the current catalogue.

Read the [screen design](screen-design.md), [captured fields and full workflow](fields-and-workflows.md), [all-128 adaptation matrix](coverage-128.md), [structured coverage](coverage-128.json) and [verification evidence](verification.json).

The only page tabs are Campaigns and History. Featured placement is a campaign type in the shared list, found through the Type filter and created through Create promotion. Its inventory, dates, fee and delivery/charge fields appear in the selected campaign. Preview in app remains available, and History uses a saved public revision. There is no separate Featured placements directory.

The [five selected concept images](images.md) show unified Campaigns, service-offer creation, rental management/results, History and Preview in app. The former standalone Featured placements image is retired in provenance. See [image review](image-review.md), [exact prompt set](image-prompts.json) and [image provenance](image-manifest.json).

The reference is the user's existing Business workspace screenshot and the revised Promotions overview with its top summary strip removed. The Promotions shell retains its black sidebar, cream content area, white header and gold actions. Images represent populated states of one configurable screen. Preview controls select app/location/date/revision context and use the relevant offering-model rules; they do not publish, place orders or reserve capacity.

All sample merchants, campaign parameters, prices, states and results are fictional review fixtures. The inspected effective registry contains Featured placement only; other promotion types are explicitly proposed contract extensions. Category/model coverage does not activate capabilities, approve campaign policies or establish live delivery.

Offerings and Promotions must share the authoritative rule/discount reference. Catalog owns content, the relevant price owner owns price, stock/capacity remains independently authoritative, and actual work retains accepted promotion/specification/policy versions. This design does not create another pricing truth or a parallel booking lifecycle.

Edit definition.py and screen-design.md. Regenerate with `python -X utf8 build.py`, then run `python -X utf8 verify.py` from this directory. The full [execution plan](plan.md) records scope and boundaries. Exact prompts, correction and selected-image provenance are saved alongside the images.
