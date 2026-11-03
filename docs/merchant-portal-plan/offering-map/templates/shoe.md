# Footwear

Status: proposed template. Review the completeness rules before runtime publication enforcement.

[All categories](../README.md) / [Field library](../field-library.md) / [Customer display rules](../customer-display.md)

## Customer presentation

The browse card uses name, accurate media, a short summary, an accurately labelled price/quote state and actual availability where known.

Additional card highlights: Upper, lining and sole materials; Shoe size system and labels.

The detail page groups the specifications below. Choice, sizing, price, fulfilment and terms sections appear only where applicable.

- ORDER: Choose the actual variant and quantity, review fulfilment and total, then place an order through its authority.

This extends the existing offering schema definitions PRODUCT_CATALOG_V1. It does not activate any model.

## Shared listing information

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Offering name | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Name the actual offering; the merchant identity is referenced separately. |
| Short description | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Explain what the customer receives without replacing structured specifications. |
| Photos or relevant media | Media picker with captions | offering; Optional | Browse/search card summary; Offering detail page description and inclusions | Accurate media with accessible descriptions; link media to actual variants where relevant. |
| Specific offering type | Existing record or registry selection | offering; Publish | Offering detail page description and inclusions | A registered template chosen for the item, not inferred solely from merchant category. |
| Applicable branches or channels | Multiple existing-record selections | offering; Publish | Delivery, pickup, visit or access information | Use actual permitted locations and supported methods; a digital service can have a remote channel. |
| Content source and external identity | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Preserve stable internal/external IDs and edit ownership; not a public product specification. |

## Product purchase and variants

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Sale unit and pack quantity | Number with unit and basis | offering; Publish | Browse/search card summary; Selected price and itemized charges | Explicit count, weight or volume unit, precision and contents per sale unit. |
| Actual purchasable combinations | Actual option combinations | offering; Required when options change the purchased item | Customer option or variant selector | Stable variant IDs; list actual combinations, never an automatic size-by-colour cross-product. |
| Item condition | Single choice | offering; Publish | Labelled specification section | New, used or refurbished as applicable; explain the actual grading when relevant. |
| Applicable return and warranty references | Applicable versioned policy | offering; Publish | Applicable terms before commitment | Reference the effective policy; inherited policies require explicit scope and overrides. |

## Price and charge basis

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| How the price is calculated | Single choice | offering; Publish | Browse/search card summary; Selected price and itemized charges | Fixed, per declared unit, variant, duration, person, package, starting estimate or quote-only. |
| Published price or quote status | Price entry or quote-only state | offering; Publish | Browse/search card summary; Selected price and itemized charges | Money uses integer minor units and currency; quote-only is not a zero price. Never auto-convert legacy whole-KES fields. |
| Included and additional charges | Charge rule rows | offering; Required when extra charges apply | Selected price and itemized charges; Applicable terms before commitment | Explicit unit, applicability, inclusions and source; show the selected total before commitment. |
| Price and policy version | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Accepted work retains the applicable version; prices come from their declared authority. |

## Product availability

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Stock control mode | Single choice | variant_location; Publish | Authorized merchant/system view only | Internal, external, hybrid or explicitly disabled. Unknown stock must remain unknown. |
| Availability by variant and location | Read from stock owner | variant_location; Required when inventory is controlled | Customer option or variant selector; Browse/search card summary | Reference authoritative stock and unit; a merchant's shop hours are not proof of stock. |

## Ways to receive the offering

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Delivery, pickup, visit or remote methods | Multiple choices | offering; Publish | Delivery, pickup, visit or access information | Only supported methods for the selected listing and location. |
| Service area and pickup locations | Coverage-owner projection | offering; Required when physical delivery or customer-location service is offered | Delivery, pickup, visit or access information | Exact authoritative coverage; show eligibility for the selected customer location. |
| Preparation or fulfilment lead time | Duration and unit | offering; Required when a lead time applies | Browse/search card summary; Delivery, pickup, visit or access information | Exact amount and unit; estimate versus firm promise must be labelled. |
| Customer-facing fulfilment instructions | Labelled text entry | offering; Optional | Delivery, pickup, visit or access information | Public instructions exclude personal access credentials and internal notes. |

## Footwear fit and construction

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Shoe size system and labels | Named size labels and system | offering; Publish | Customer option or variant selector; Size guide and measurement chart; Browse/search card summary | EU, UK, US or merchant system as actually labelled; no invented cross-system equivalence. |
| Foot or internal length by size | Length or adjustable range | variant_size; Required when measurement guidance is supplied | Size guide and measurement chart | Clearly distinguish foot length from shoe internal length and label units. |
| Width or width fitting by size | Labelled text entry | variant_size; Optional | Size guide and measurement chart | Use actual width scale or measured width with unit. |
| Upper, lining and sole materials | Material/composition entries | offering; Publish | Labelled specification section; Browse/search card summary | Keep the different materials distinguishable. |
| Heel or sole height | Length with unit | offering; Required when relevant | Labelled specification section | Explicit measurement unit. |
| Fastening and intended use | Labelled text entry | offering; Optional | Labelled specification section | Describe actual closure and use without unsupported safety/performance claims. |
| Colours and valid size combinations | Actual option combinations | offering; Required when variants exist | Customer option or variant selector | Real variant matrix with separate price and stock references. |

## Fashion listing identity and media

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Brand or maker | Labelled text entry | offering; Optional | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Labelled text entry | offering; Optional | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Multiple choices | offering; Optional | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Repeated labelled text entries | offering; Required when used, refurbished or imperfect | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Media picker with captions | offering; Optional | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |

## Size, colour and stock relationships

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Pattern or print | Multiple choices | offering; Optional | Labelled specification section; Customer option or variant selector | Named patterns map to actual variants if the purchased item changes. |
| Reusable size chart reference and version | Existing record or registry selection | offering; Required when a shared chart is used | Size guide and measurement chart | Explicit accurate chart version; a material chart change previews affected listings. |
| Variant-specific measurement overrides | Measurement rows by actual size | variant; Required when colour, batch or construction changes fit | Size guide and measurement chart | Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers. |
| Internal variant SKU or supplier reference | Labelled text entry | variant; Required when variants are tracked | Authorized merchant/system view only | Internal reference distinct from public style name; retain stable variant IDs. |

## Footwear shape and fit

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Toe shape and shoe style | Single choice | offering; Optional | Labelled specification section | Actual footwear shape/style; sizes still use the named system. |
| Fastening | Single choice | offering; Optional | Labelled specification section | Laces, buckle, zip, slip-on or actual construction. |
| Merchant fit notes | Labelled text entry | offering; Optional | Size guide and measurement chart | Specific guidance such as width/instep allowance with its source; no automatic size recommendation. |
| Care and material-specific instructions | Repeated labelled text entries | offering; Optional | Offering detail page description and inclusions | Use confirmed product instructions and accessible text. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
