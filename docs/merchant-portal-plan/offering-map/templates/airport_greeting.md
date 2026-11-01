# Airport meet-and-greet only

Status: proposed template. Review the completeness rules before runtime publication enforcement.

[All categories](../README.md) / [Field library](../field-library.md) / [Customer display rules](../customer-display.md)

## Customer presentation

The browse card uses name, accurate media, a short summary, an accurately labelled price/quote state and actual availability where known.

Additional card highlights: Greeting area, escort scope and assistance; Included waiting and extra-time policy.

The detail page groups the specifications below. Choice, sizing, price, fulfilment and terms sections appear only where applicable.

Use the reconciled greeter-only variant; do not require a fictitious vehicle or imply a bundled transfer.

- TRANSFER: Enter the actual route, time and party details; confirm only after the selected trip or greeter resources are secured.

This extends the existing offering schema definitions TRANSFER_ROUTE_V1. It does not activate any model.

## Shared listing information

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Offering name | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Name the actual offering; the merchant identity is referenced separately. |
| Short description | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Explain what the customer receives without replacing structured specifications. |
| Photos or relevant media | Media picker with captions | offering; Optional | Browse/search card summary; Offering detail page description and inclusions | Accurate media with accessible descriptions; link media to actual variants where relevant. |
| Specific offering type | Existing record or registry selection | offering; Publish | Offering detail page description and inclusions | A registered template chosen for the item, not inferred solely from merchant category. |
| Applicable branches or channels | Multiple existing-record selections | offering; Publish | Delivery, pickup, visit or access information | Use actual permitted locations and supported methods; a digital service can have a remote channel. |
| Content source and external identity | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Preserve stable internal/external IDs and edit ownership; not a public product specification. |

## Airport greeting scope

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Greeting area, escort scope and assistance | Repeated labelled text entries | offering; Publish | Offering detail page description and inclusions; Browse/search card summary | Greeter-only service is separate from a vehicle transfer. |
| Included waiting and extra-time policy | Time allowance and extra-time charges | offering; Publish | Selected price and itemized charges; Applicable terms before commitment; Browse/search card summary | Exact time allowance and charge basis. |
| Meeting-sign options | Customization choices and private response form | offering; Required when offered | Customer option or variant selector | Customer name/sign content is private to the booking and restricted execution view. |

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

## Private trip and rental selection

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Chosen pickup and destination | Private address or route entry | transaction; Required when a trip or handover requires it | Private customer order, booking or enquiry input | Private exact address/access details; confirm actual coverage. |
| Travel or rental start/end | Customer date or time selection | transaction; Publish | Private customer order, booking or enquiry input | Kenya display; explicit instants versus local dates, valid start/end and relevant buffers. |
| Passengers, luggage and extras | Customer party and capacity inputs | transaction; Required when relevant | Private customer order, booking or enquiry input | Validate actual capacity and compatible child/accessibility requests. |
| Flight and passenger details | Purpose-specific private request fields | transaction; Required when relevant to airport service | Private customer order, booking or enquiry input | Necessary trip information only; provider confirmation and flight-feed connection are separate. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
