# Warehouse storage and handling service

Status: proposed template. Review the completeness rules before runtime publication enforcement.

[All categories](../README.md) / [Field library](../field-library.md) / [Customer display rules](../customer-display.md)

## Customer presentation

The browse card uses name, accurate media, a short summary, an accurately labelled price/quote state and actual availability where known.

Additional card highlights: Storage type, dimensions and capacity unit; Occupancy, billing and access rules.

The detail page groups the specifications below. Choice, sizing, price, fulfilment and terms sections appear only where applicable.

- STORAGE: Declare goods, unit and period; receive compatible capacity/custody acceptance before storage is confirmed.

This extends the existing offering schema definitions STORAGE_SPACE_V1. It does not activate any model.

## Shared listing information

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Offering name | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Name the actual offering; the merchant identity is referenced separately. |
| Short description | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Explain what the customer receives without replacing structured specifications. |
| Photos or relevant media | Media picker with captions | offering; Optional | Browse/search card summary; Offering detail page description and inclusions | Accurate media with accessible descriptions; link media to actual variants where relevant. |
| Specific offering type | Existing record or registry selection | offering; Publish | Offering detail page description and inclusions | A registered template chosen for the item, not inferred solely from merchant category. |
| Applicable branches or channels | Multiple existing-record selections | offering; Publish | Delivery, pickup, visit or access information | Use actual permitted locations and supported methods; a digital service can have a remote channel. |
| Content source and external identity | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Preserve stable internal/external IDs and edit ownership; not a public product specification. |

## Storage unit, period and custody

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Storage type, dimensions and capacity unit | Storage capacity and unit fit | offering; Publish | Browse/search card summary; Labelled specification section | Pallet, bay, unit, m2/ft2 or m3 with dimensions and height where relevant; area is not volume. |
| Accepted goods and environment | Repeated labelled text entries | offering; Publish | Offering detail page description and inclusions; Applicable terms before commitment | Temperature/humidity or other controls only if actually supported; declared restrictions and compatibility. |
| Occupancy, billing and access rules | Validity, billing and renewal terms | offering; Publish | Selected price and itemized charges; Applicable terms before commitment; Browse/search card summary | Exact period, minimum term and intake/release policy; custody and allocation remain distinct. |
| Receiving, picking, dispatch and cover scope | Included/excluded scope rows | offering; Publish | Offering detail page description and inclusions; Selected price and itemized charges; Applicable terms before commitment | Included handling quantities and charges; no inferred warehouse insurance or stock transfer. |
| Actual compatible unit/capacity source | Read from availability authority | offering; Publish | Supported date, time, duration and capacity selection | Actual authoritative capacity, not total warehouse area as a promise of free space. |

## Private shipment declaration

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Goods, piece count and declared value | Purpose-specific private request fields | transaction; Publish | Private customer order, booking or enquiry input | Purpose-limited declaration with actual currency; carrier review determines acceptance. |
| Dimensions, mass and unit per piece | Per-piece shipment measurements | transaction; Publish | Private customer order, booking or enquiry input | Length/width/height and gross mass with units; totals do not replace per-piece constraints. |
| Collection, delivery and required dates | Purpose-specific private request fields | transaction; Publish | Private customer order, booking or enquiry input | Exact private addresses, sender/recipient contacts and access needs are restricted. |
| Applicable carrier/customs document references | Authorized private document upload/reference | transaction; Required when required by the accepted service | Private customer order, booking or enquiry input | Only authorized document flow; source requirements from the applicable carrier/policy. |

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

## Storage environment and access

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Actual storage conditions and controls | Named manufacturer specification rows | offering; Required when environmental control is offered | Labelled specification section; Applicable terms before commitment | Named temperature/humidity or other controlled parameters with units and actual capability; no inferred cold storage. |
| Customer access, receiving and release process | Applicable versioned policy | offering; Publish | Delivery, pickup, visit or access information; Applicable terms before commitment | Actual access windows, handling scope and custody rules; availability does not transfer stock ownership. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
