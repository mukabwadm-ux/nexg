# Corporate or long-term vehicle rental

Status: proposed template. Review the completeness rules before runtime publication enforcement.

[All categories](../README.md) / [Field library](../field-library.md) / [Customer display rules](../customer-display.md)

## Customer presentation

The browse card uses name, accurate media, a short summary, an accurately labelled price/quote state and actual availability where known.

Additional card highlights: Exact vehicle or vehicle class; Billing period, commitment and usage limits.

The detail page groups the specifications below. Choice, sizing, price, fulfilment and terms sections appear only where applicable.

- ASSET_INTERVAL: Choose actual start/end, handover places and extras; show total and confirm required asset/driver allocation.

This extends the existing offering schema definitions RENTAL_ASSET_V1. It does not activate any model.

## Shared listing information

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Offering name | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Name the actual offering; the merchant identity is referenced separately. |
| Short description | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Explain what the customer receives without replacing structured specifications. |
| Photos or relevant media | Media picker with captions | offering; Optional | Browse/search card summary; Offering detail page description and inclusions | Accurate media with accessible descriptions; link media to actual variants where relevant. |
| Specific offering type | Existing record or registry selection | offering; Publish | Offering detail page description and inclusions | A registered template chosen for the item, not inferred solely from merchant category. |
| Applicable branches or channels | Multiple existing-record selections | offering; Publish | Delivery, pickup, visit or access information | Use actual permitted locations and supported methods; a digital service can have a remote channel. |
| Content source and external identity | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Preserve stable internal/external IDs and edit ownership; not a public product specification. |

## Vehicle rental specifications and terms

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Exact vehicle or vehicle class | Guaranteed asset or class selection | offering; Publish | Browse/search card summary; Labelled specification section | Explicit guaranteed vehicle versus class/or-similar policy; identified allocations remain resource-owned. |
| Passenger seats and luggage capacity | Separate capacity limits | offering; Publish | Browse/search card summary; Labelled specification section | Separate people from bags; count/unit and luggage assumptions are explicit. |
| Transmission and fuel/power type | Multiple choices | offering; Publish | Browse/search card summary; Labelled specification section | Actual guaranteed configuration or transparent class alternatives. |
| Distance allowance and excess-distance charge | Mileage allowance and extras | offering; Publish | Selected price and itemized charges; Applicable terms before commitment | Unlimited or exact allowance with km/mi and per-day/per-rental basis; excess charge is separately priced. |
| Fuel or charging return policy | Applicable versioned policy | offering; Publish | Applicable terms before commitment | State actual pickup/return obligation and applicable costs. |
| Deposit and release conditions | Deposit terms reference | offering; Required when a deposit applies | Selected price and itemized charges; Applicable terms before commitment | Explicit amount/currency or calculation, timing and authorized refund/release policy. |
| Included cover and exclusions | Applicable versioned policy | offering; Publish | Applicable terms before commitment | Approved terms and responsibility limits; no invented insurance or legal eligibility thresholds. |
| Driver, use and travel restrictions | Applicable versioned policy | offering; Publish | Applicable terms before commitment | Actual accepted driver/document, territory and vehicle-use terms from the policy owner; customer documents use private authorized intake. |
| Self-drive or optional driver | Required/optional customer choices | offering; Publish | Customer option or variant selector; Selected price and itemized charges | Driver selection changes price and required joint allocation; it does not convert the rental to a transfer. |
| Rental duration and pickup/return rules | Start/end and interval rules | offering; Publish | Supported date, time, duration and capacity selection; Applicable terms before commitment | Exact minimum/maximum, charge period, grace/late rules and time/date semantics. |
| Pickup and return places and charges | Handover/return choices | offering; Publish | Customer option or variant selector; Delivery, pickup, visit or access information | Supported places and time constraints; travel fees must be explicit. |

## Corporate and extended rental terms

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Billing period, commitment and usage limits | Applicable versioned policy | offering; Publish | Selected price and itemized charges; Applicable terms before commitment; Browse/search card summary | Renewal/extension needs explicit consent; contract dates are not implicit recurring bookings. |
| Maintenance, replacement and support scope | Repeated labelled text entries | offering; Publish | Offering detail page description and inclusions; Applicable terms before commitment | Only actual contractual inclusions and response commitments. |
| Business account requirements | Applicable versioned policy | offering; Required when a business account is needed | Applicable terms before commitment | Private account documents are collected through an authorized intake. |

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

## Vehicle features promised by the rental or transfer

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Vehicle make and model | Labelled text entry | offering; Required when a specific model is promised | Labelled specification section | Exact actual make/model; a class offer states which features are guaranteed versus alternatives. |
| Model year or declared vehicle age information | Integer or declared integer range | offering; Required when this information is promised | Labelled specification section | Actual source-backed year/range, not a value inferred from a photograph. |
| Body style and doors | Vehicle body style and doors | offering; Required when relevant to the offer | Labelled specification section | Actual body style and door count; not a promise of off-road or accessibility suitability. |
| Guaranteed amenities and extras | Repeated labelled text entries | offering; Optional | Labelled specification section; Customer option or variant selector | Actual air conditioning, charging, equipment or other guaranteed features; options need actual resource availability. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
