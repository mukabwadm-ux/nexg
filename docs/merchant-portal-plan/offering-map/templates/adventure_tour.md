# Adventure excursion

Status: proposed template. Review the completeness rules before runtime publication enforcement.

[All categories](../README.md) / [Field library](../field-library.md) / [Customer display rules](../customer-display.md)

## Customer presentation

The browse card uses name, accurate media, a short summary, an accurately labelled price/quote state and actual availability where known.

Additional card highlights: Duration, nights and departure options; Access, language, equipment and conditions.

The detail page groups the specifications below. Choice, sizing, price, fulfilment and terms sections appear only where applicable.

Actual difficulty/equipment/provider requirements and cancellation/weather terms are sourced, not guessed.

- TOUR: Choose a published departure and party options; supplier-dependent availability remains requested until confirmed.

This extends the existing offering schema definitions TOUR_PACKAGE_V1. It does not activate any model.

## Shared listing information

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Offering name | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Name the actual offering; the merchant identity is referenced separately. |
| Short description | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Explain what the customer receives without replacing structured specifications. |
| Photos or relevant media | Media picker with captions | offering; Optional | Browse/search card summary; Offering detail page description and inclusions | Accurate media with accessible descriptions; link media to actual variants where relevant. |
| Specific offering type | Existing record or registry selection | offering; Publish | Offering detail page description and inclusions | A registered template chosen for the item, not inferred solely from merchant category. |
| Applicable branches or channels | Multiple existing-record selections | offering; Publish | Delivery, pickup, visit or access information | Use actual permitted locations and supported methods; a digital service can have a remote channel. |
| Content source and external identity | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Preserve stable internal/external IDs and edit ownership; not a public product specification. |

## Tour itinerary and supplier scope

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Itinerary, stops and activity schedule | Ordered itinerary steps | offering; Publish | Offering detail page description and inclusions | Dated/local-date milestones, journey time and actual included activities. |
| Duration, nights and departure options | Duration and unit | offering; Publish | Browse/search card summary; Supported date, time, duration and capacity selection | Separate elapsed duration, local nights and departure dates. |
| Private/shared format and party limits | Separate capacity limits | offering; Publish | Browse/search card summary; Customer option or variant selector | Price basis per person/group and actual controlled or supplier capacity. |
| Guide, meals, accommodation, transport and fees | Included/excluded scope rows | offering; Publish | Offering detail page description and inclusions; Selected price and itemized charges; Applicable terms before commitment | Explicit inclusions/exclusions; named lodging and flight inventory require authority confirmation. |
| Access, language, equipment and conditions | Repeated labelled text entries | offering; Publish | Offering detail page description and inclusions; Applicable terms before commitment; Browse/search card summary | Actual languages and merchant/provider-approved requirements; no invented travel or clinical advice. |
| Confirmation and change policy | Applicable versioned policy | offering; Publish | Applicable terms before commitment | Supplier enquiry is not instant confirmation; cancellation and substitutions use accepted terms. |

## Price and charge basis

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| How the price is calculated | Single choice | offering; Publish | Browse/search card summary; Selected price and itemized charges | Fixed, per declared unit, variant, duration, person, package, starting estimate or quote-only. |
| Published price or quote status | Price entry or quote-only state | offering; Publish | Browse/search card summary; Selected price and itemized charges | Money uses integer minor units and currency; quote-only is not a zero price. Never auto-convert legacy whole-KES fields. |
| Included and additional charges | Charge rule rows | offering; Required when extra charges apply | Selected price and itemized charges; Applicable terms before commitment | Explicit unit, applicability, inclusions and source; show the selected total before commitment. |
| Price and policy version | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Accepted work retains the applicable version; prices come from their declared authority. |

## Scheduling and confirmation

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Available dates, times or capacity | Read from availability authority | offering; Required when scheduled work is offered | Supported date, time, duration and capacity selection | Derived from the actual authority, resource eligibility and current capacity; unknown is distinct from unavailable. |
| How acceptance works | Single choice | offering; Publish | Browse/search card summary; Supported date, time, duration and capacity selection; Applicable terms before commitment | Use the effective model's allowed intake mode; a request is not a confirmed reservation. |
| Lead time, buffers and booking horizon | Booking rule references | offering; Required when scheduled work is offered | Supported date, time, duration and capacity selection; Applicable terms before commitment | Use exact configured rules with Kenya time; preserve local dates separately from instants. |

## Private customer request

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Requested work and preferences | Labelled text entry | transaction; Required when a quote or assessment is needed | Private customer order, booking or enquiry input | Collect only information needed to scope this request; never place it in public specifications. |
| Relevant location, dates and quantities | Purpose-specific private request fields | transaction; Required when needed for the selected service | Private customer order, booking or enquiry input | Only applicable fields; exact private addresses and access details remain restricted. |
| Customer contact for this request | Private customer/contact selector | transaction; Required when follow-up is needed | Private customer order, booking or enquiry input | Use authorized customer/contact records and purpose-limited access. |

## Tour choices and actual inclusions

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Walking, vehicle, boat or other actual mode | Multiple choices | offering; Publish | Labelled specification section | Actual transport/activity mode; associated capacity and provider constraints remain authoritative. |
| Available guide or service languages | Multiple choices | offering; Required when a guide or language-specific service is offered | Customer option or variant selector; Offering detail page description and inclusions | Actual supported language choices and any availability constraint. |
| Lodging category, room/meal choices and supplier scope | Included component rows | offering; Required when overnight lodging is included | Customer option or variant selector; Offering detail page description and inclusions; Applicable terms before commitment | Named actual inclusions/choices; desired accommodation is not confirmed supplier inventory. |
| Weather, substitution and supplier change terms | Applicable versioned policy | offering; Required when applicable | Applicable terms before commitment | Actual approved supplier terms; no invented travel or medical advice. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
