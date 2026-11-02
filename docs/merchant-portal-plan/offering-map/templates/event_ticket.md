# Concert, festival or performance admission

Status: proposed template. Review the completeness rules before runtime publication enforcement.

[All categories](../README.md) / [Field library](../field-library.md) / [Customer display rules](../customer-display.md)

## Customer presentation

The browse card uses name, accurate media, a short summary, an accurately labelled price/quote state and actual availability where known.

Additional card highlights: Venue, access and accessibility; Actual dated performances or sessions.

The detail page groups the specifications below. Choice, sizing, price, fulfilment and terms sections appear only where applicable.

- SESSION_CAPACITY: Choose an actual dated occurrence, tier and place quantity against the same capacity pool.

This extends the existing offering schema definitions EVENT_TICKET_V1. It does not activate any model.

## Shared listing information

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Offering name | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Name the actual offering; the merchant identity is referenced separately. |
| Short description | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Explain what the customer receives without replacing structured specifications. |
| Photos or relevant media | Media picker with captions | offering; Optional | Browse/search card summary; Offering detail page description and inclusions | Accurate media with accessible descriptions; link media to actual variants where relevant. |
| Specific offering type | Existing record or registry selection | offering; Publish | Offering detail page description and inclusions | A registered template chosen for the item, not inferred solely from merchant category. |
| Applicable branches or channels | Multiple existing-record selections | offering; Publish | Delivery, pickup, visit or access information | Use actual permitted locations and supported methods; a digital service can have a remote channel. |
| Content source and external identity | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Preserve stable internal/external IDs and edit ownership; not a public product specification. |

## Event and ticket information

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Event programme and organizer | Labelled text entry | offering; Publish | Offering detail page description and inclusions | Actual performer/programme and organizer references; never imply organizer verification from seller input. |
| Venue, access and accessibility | Public venue/place projection | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Public venue projection; attendee personal details remain private. |
| Actual dated performances or sessions | Actual dated occurrence references | offering; Publish | Supported date, time, duration and capacity selection; Browse/search card summary | Start/end, admission window, Kenya time and authoritative capacity per occurrence. |
| Ticket types, inclusions and quantity rules | Ticket tiers and admission choices | offering; Publish | Customer option or variant selector; Selected price and itemized charges | Actual tiers, seating/zone rules and linked shared capacity; booking is separate from ticket issuance. |
| Entry, transfer and cancellation policy | Applicable versioned policy | offering; Publish | Applicable terms before commitment | Approved applicable terms including restrictions; no invented thresholds. |

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

## Dated event or activity content

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Activity level and actual audience scope | Labelled text entry | offering; Optional | Offering detail page description and inclusions | Merchant/provider-defined level and prerequisites; do not infer suitability from age alone. |
| Programme, curriculum or included segments | Included component rows | offering; Required when a programme or curriculum is sold | Offering detail page description and inclusions | Actual sessions/segments, quantities and admission entitlement; not an automatic reservation of each segment. |
| Included versus required customer equipment | Included component rows | offering; Required when equipment or materials are relevant | Offering detail page description and inclusions; Applicable terms before commitment | Separate included, optional charged and customer-supplied items. |
| Published access and participation conditions | Applicable versioned policy | offering; Required when applicable | Applicable terms before commitment | Only actual approved venue/provider conditions and accessibility information. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
