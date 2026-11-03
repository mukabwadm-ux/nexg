# Beauty tool or accessory

Status: proposed template. Review the completeness rules before runtime publication enforcement.

[All categories](../README.md) / [Field library](../field-library.md) / [Customer display rules](../customer-display.md)

## Customer presentation

The browse card uses name, accurate media, a short summary, an accurately labelled price/quote state and actual availability where known.

Additional card highlights: Included components and accessories.

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

## Durable goods identity and dimensions

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Brand, manufacturer and model | Labelled text entry | offering; Publish | Labelled specification section | Exact model and relevant manufacturer identifiers; internal serial numbers are separate. |
| Product dimensions and weight | Dimensions and orientation | offering; Required when needed for fit, delivery or installation | Labelled specification section | Explicit length/mass units and orientation; packaged dimensions remain distinguishable. |
| Materials, finish and colour | Material/composition entries | offering; Required when relevant | Labelled specification section | Actual materials and finish rather than a photograph-derived guess. |
| Included components and accessories | Included component rows | offering; Publish | Offering detail page description and inclusions; Browse/search card summary | Separate pictured props and optional accessories from included contents. |
| Warranty and support details | Applicable versioned policy | offering; Required when a warranty or support is offered | Applicable terms before commitment | Provider, duration, scope and exclusions from the actual terms; a warranty does not establish authenticity. |

## Personal care product details

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Product type and intended label use | Labelled text entry | offering; Publish | Labelled specification section | Identify the actual product; suitability claims must come from confirmed label information. |
| Ingredients, materials and pack contents | Repeated labelled text entries | offering; Publish | Labelled specification section | Use manufacturer/label information; do not invent efficacy or safety claims. |
| Net contents and pack count | Number with unit and basis | offering; Publish | Browse/search card summary; Labelled specification section | Explicit mass, volume or count units; distinguish net contents from shipping weight. |
| Label instructions, cautions and storage | Repeated labelled text entries | offering; Required when supplied or required for this product | Offering detail page description and inclusions; Applicable terms before commitment | Reproduce approved product information, not generated treatment or usage advice. |
| Formula, shade, scent or compatibility options | Actual option combinations | offering; Required when variants exist | Customer option or variant selector | Actual variant identity and contents; prices and availability use their own owners. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
