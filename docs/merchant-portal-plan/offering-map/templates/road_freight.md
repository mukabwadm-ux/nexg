# Road freight or truck-load service

Status: proposed template. Review the completeness rules before runtime publication enforcement.

[All categories](../README.md) / [Field library](../field-library.md) / [Customer display rules](../customer-display.md)

## Customer presentation

The browse card uses name, accurate media, a short summary, an accurately labelled price/quote state and actual availability where known.

Additional card highlights: Supported origin, destination and legs; Chargeable weight, volume or container basis.

The detail page groups the specifications below. Choice, sizing, price, fulfilment and terms sections appear only where applicable.

- FREIGHT: Provide actual cargo and route, receive a valid carrier quote, accept terms, then obtain freight confirmation.

This extends the existing offering schema definitions FREIGHT_SHIPMENT_V1. It does not activate any model.

## Shared listing information

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Offering name | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Name the actual offering; the merchant identity is referenced separately. |
| Short description | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Explain what the customer receives without replacing structured specifications. |
| Photos or relevant media | Media picker with captions | offering; Optional | Browse/search card summary; Offering detail page description and inclusions | Accurate media with accessible descriptions; link media to actual variants where relevant. |
| Specific offering type | Existing record or registry selection | offering; Publish | Offering detail page description and inclusions | A registered template chosen for the item, not inferred solely from merchant category. |
| Applicable branches or channels | Multiple existing-record selections | offering; Publish | Delivery, pickup, visit or access information | Use actual permitted locations and supported methods; a digital service can have a remote channel. |
| Content source and external identity | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Preserve stable internal/external IDs and edit ownership; not a public product specification. |

## Freight route, cargo and charge basis

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Freight mode and load service | Single choice | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Sea/air/road and actual load/container/consolidation service. |
| Supported origin, destination and legs | Supported route and leg rows | offering; Publish | Browse/search card summary; Delivery, pickup, visit or access information | Port/airport/door scope and included road/warehouse legs are explicit. |
| Cargo classes, restrictions and handling | Repeated labelled text entries | offering; Publish | Offering detail page description and inclusions; Applicable terms before commitment | Merchant/carrier-approved scope; no invented customs, hazardous-goods or legal clearance. |
| Chargeable weight, volume or container basis | Freight or service charge measures | offering; Publish | Selected price and itemized charges; Browse/search card summary | kg, m3/CBM or container type, minimums and actual carrier conversion rule; never invent a volumetric divisor. |
| Transit estimate, clearance and charge inclusions | Included/excluded scope rows | offering; Publish | Selected price and itemized charges; Applicable terms before commitment | Dates/estimates, duties/taxes/handling exclusions and insurance scope must be explicit. |
| Quote validity and carrier confirmation | Applicable versioned policy | offering; Publish | Applicable terms before commitment | A request is not accepted cargo or confirmed freight capacity. |

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

## Carrier service and constraints

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Actual load, container or vehicle service type | Labelled text entry | offering; Publish | Labelled specification section | FCL/LCL, cargo or truck/load class as actually supported; service mode alone is insufficient. |
| Per-piece and service load limits | Named manufacturer specification rows | offering; Publish | Labelled specification section; Applicable terms before commitment | Named dimensions/mass/volume with units and carrier source; unknown limits require carrier review. |
| Rate validity, included legs and carrier calculation reference | Applicable versioned policy | offering; Publish | Selected price and itemized charges; Applicable terms before commitment | Approved chargeable-weight/conversion/rounding rules and quote validity; no invented divisor or tax. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
