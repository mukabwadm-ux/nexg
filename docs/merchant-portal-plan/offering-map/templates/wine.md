# Wine bottle or case

Status: proposed template. Review the completeness rules before runtime publication enforcement.

[All categories](../README.md) / [Field library](../field-library.md) / [Customer display rules](../customer-display.md)

## Customer presentation

The browse card uses name, accurate media, a short summary, an accurately labelled price/quote state and actual availability where known.

Additional card highlights: Wine, spirit or beer style; Vintage, age statement or non-vintage.

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

## Packaged beverage specifications

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Brand, producer and product name | Labelled text entry | offering; Publish | Labelled specification section | Exact labelled product; origin is a separate confirmed fact. |
| Container volume and pack count | Number with unit and basis | offering; Publish | Browse/search card summary; Labelled specification section | Explicit mL/L and units per pack, with supported combinations. |
| Ingredients and declared allergens | Repeated labelled text entries | offering; Required when relevant label information exists | Offering detail page description and inclusions | Preserve label source and unknown state; absence of data is not allergen-free. |
| Storage and serving condition | Labelled text entry | offering; Optional | Offering detail page description and inclusions; Delivery, pickup, visit or access information | Ambient/chilled choices must match supported fulfilment. |

## Alcohol label details

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Alcohol by volume | Percentage | offering; Publish | Labelled specification section | Use exact labelled ABV; distinguish non-alcoholic variants. |
| Country, region and producer origin | Labelled text entry | offering; Optional | Labelled specification section | Use confirmed label/designation information. |
| Wine, spirit or beer style | Labelled text entry | offering; Publish | Labelled specification section; Browse/search card summary | Specific type for customer comparison. |
| Vintage, age statement or non-vintage | Labelled text entry | offering; Required when this product carries such a statement | Labelled specification section; Browse/search card summary | Do not invent a vintage or age. |
| Declared tasting profile | Repeated labelled text entries | offering; Optional | Labelled specification section | Merchant/producer descriptors, separate from guaranteed specifications. |

## Restricted product presentation

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Applicable age or eligibility policy | Applicable versioned policy | offering; Publish | Applicable terms before commitment | Reference approved product-specific rules; this design does not set legal thresholds. |
| Packaging choices | Multiple choices | offering; Required when packaging choice is offered | Customer option or variant selector; Delivery, pickup, visit or access information | Accurate discreet or branded options and relevant charge. |
| Publication or eligibility evidence | Read from verification owner | offering; Required when required by policy | Authorized merchant/system view only | Seller answers do not create verified status. Checks belong to their authorized owner. |

## Wine-specific product details

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Grape varieties or blend | Repeated labelled text entries | offering; Required when supplied on the product information | Labelled specification section | Actual producer information; unknown varieties are not inferred from region. |
| Declared sweetness or style | Single choice | offering; Optional | Labelled specification section | Producer/merchant descriptor, separate from vintage, ABV and exact bottle volume. |
| Bottle closure and packaging | Labelled text entry | offering; Optional | Labelled specification section | Actual closure and case contents; gift wrapping remains an option with its own charge. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
