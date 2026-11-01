# Custom tailoring or made-to-measure garment

Status: proposed template. Review the completeness rules before runtime publication enforcement.

[All categories](../README.md) / [Field library](../field-library.md) / [Customer display rules](../customer-display.md)

## Customer presentation

The browse card uses name, accurate media, a short summary, an accurately labelled price/quote state and actual availability where known.

The detail page groups the specifications below. Choice, sizing, price, fulfilment and terms sections appear only where applicable.

Personal measurements and design uploads are private order data; the public listing describes supported choices and measurement instructions.

- PRODUCTION_DUE: Submit exact customization and desired due date; obtain scope, price/proof and production acceptance.

This extends the existing offering schema definitions MADE_TO_ORDER_V1. It does not activate any model.

## Shared listing information

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Offering name | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Name the actual offering; the merchant identity is referenced separately. |
| Short description | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Explain what the customer receives without replacing structured specifications. |
| Photos or relevant media | Media picker with captions | offering; Optional | Browse/search card summary; Offering detail page description and inclusions | Accurate media with accessible descriptions; link media to actual variants where relevant. |
| Specific offering type | Existing record or registry selection | offering; Publish | Offering detail page description and inclusions | A registered template chosen for the item, not inferred solely from merchant category. |
| Applicable branches or channels | Multiple existing-record selections | offering; Publish | Delivery, pickup, visit or access information | Use actual permitted locations and supported methods; a digital service can have a remote channel. |
| Content source and external identity | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Preserve stable internal/external IDs and edit ownership; not a public product specification. |

## Shared clothing details

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Fabric composition | Material/composition entries | offering; Publish | Labelled specification section | Known materials and proportions; unknown proportions remain unknown. |
| Fit and silhouette | Single choice | offering; Publish | Labelled specification section | Named merchant fit guidance such as fitted or relaxed; do not equate it across brands. |
| Stretch or adjustability | Single choice | offering; Publish | Labelled specification section | No stretch, stretch, adjustable or not provided; unanswered is not No. |
| Available colours and patterns | Multiple choices | offering; Required when colour or pattern choices exist | Customer option or variant selector | Link real variants and photographs; sold-out combinations remain explicit. |

## Made-to-order specification

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Customizable features and limits | Customization choices and private response form | offering; Publish | Customer option or variant selector | Supported choices, dimensions, materials and compatibility; do not accept arbitrary infeasible configurations. |
| Proof or design approval process | Applicable versioned policy | offering; Required when approval is required | Applicable terms before commitment | A submitted design remains pending until the authorized acceptance. |
| Production lead time and acceptance | Duration or assessment-required | offering; Publish | Delivery, pickup, visit or access information; Applicable terms before commitment | Unknown scope uses quote/assessment; exact deadline is accepted separately. |

## Price and charge basis

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| How the price is calculated | Single choice | offering; Publish | Browse/search card summary; Selected price and itemized charges | Fixed, per declared unit, variant, duration, person, package, starting estimate or quote-only. |
| Published price or quote status | Price entry or quote-only state | offering; Publish | Browse/search card summary; Selected price and itemized charges | Money uses integer minor units and currency; quote-only is not a zero price. Never auto-convert legacy whole-KES fields. |
| Included and additional charges | Charge rule rows | offering; Required when extra charges apply | Selected price and itemized charges; Applicable terms before commitment | Explicit unit, applicability, inclusions and source; show the selected total before commitment. |
| Price and policy version | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Accepted work retains the applicable version; prices come from their declared authority. |

## Private customer request

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Requested work and preferences | Labelled text entry | transaction; Required when a quote or assessment is needed | Private customer order, booking or enquiry input | Collect only information needed to scope this request; never place it in public specifications. |
| Relevant location, dates and quantities | Purpose-specific private request fields | transaction; Required when needed for the selected service | Private customer order, booking or enquiry input | Only applicable fields; exact private addresses and access details remain restricted. |
| Customer contact for this request | Private customer/contact selector | transaction; Required when follow-up is needed | Private customer order, booking or enquiry input | Use authorized customer/contact records and purpose-limited access. |

## Ways to receive the offering

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Delivery, pickup, visit or remote methods | Multiple choices | offering; Publish | Delivery, pickup, visit or access information | Only supported methods for the selected listing and location. |
| Service area and pickup locations | Coverage-owner projection | offering; Required when physical delivery or customer-location service is offered | Delivery, pickup, visit or access information | Exact authoritative coverage; show eligibility for the selected customer location. |
| Preparation or fulfilment lead time | Duration and unit | offering; Required when a lead time applies | Browse/search card summary; Delivery, pickup, visit or access information | Exact amount and unit; estimate versus firm promise must be labelled. |
| Customer-facing fulfilment instructions | Labelled text entry | offering; Optional | Delivery, pickup, visit or access information | Public instructions exclude personal access credentials and internal notes. |

## Fashion listing identity and media

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Brand or maker | Labelled text entry | offering; Optional | Browse/search card summary; Labelled specification section | Named brand, independent maker or explicitly unbranded; never force an invented brand. |
| Style name or collection | Labelled text entry | offering; Optional | Offering detail page description and inclusions | Customer-recognizable style; merchant SKU stays with internal identity. |
| Intended audience or fit range | Multiple choices | offering; Optional | Offering detail page description and inclusions | Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy. |
| Condition details and disclosed defects | Repeated labelled text entries | offering; Required when used, refurbished or imperfect | Offering detail page description and inclusions | Supplement the shared condition value with actual wear/defects and relevant photos. |
| Colour-specific and detail photos | Media picker with captions | offering; Optional | Offering detail page description and inclusions; Customer option or variant selector | Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs. |

## Garment construction and care

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Silhouette or cut | Single choice | offering; Optional | Labelled specification section | Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit. |
| Washing, drying and ironing guidance | Repeated labelled text entries | offering; Optional | Offering detail page description and inclusions | Exact label/merchant instructions; text equivalents accompany any care icons. |
| Construction details and functional features | Repeated labelled text entries | offering; Optional | Labelled specification section | Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded. |

## Tailoring and alteration scope

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Made-to-measure, alteration or garment task | Single choice | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Choose the actual garment and supported task; an assessment may precede price/due acceptance. |
| Who supplies fabric and materials | Single choice | offering; Publish | Offering detail page description and inclusions; Applicable terms before commitment | Merchant-supplied, customer-supplied or agreed after assessment; state inclusions and extra charges. |
| Measurement or fitting method | Multiple choices | offering; Publish | Offering detail page description and inclusions; Customer option or variant selector | In-person fitting, submitted measurements or reference garment only if actually supported. |
| Included fittings, revisions and acceptance | Applicable versioned policy | offering; Required when fittings or revisions apply | Applicable terms before commitment | Appointment scheduling is separately configured; do not invent a confirmed fitting from a production request. |

## Private tailoring information

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Customer's personal measurements | Measurement rows by actual size | transaction; Required when necessary for the selected tailoring task | Private customer order, booking or enquiry input | Private transaction data with explicit body/garment basis and units; never publish as a product size chart. |
| Customer design, garment or reference files | Authorized private document upload/reference | transaction; Required when needed to agree the work | Private customer order, booking or enquiry input | Private purpose-limited attachments and approval; no raw personal files on public product pages. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
