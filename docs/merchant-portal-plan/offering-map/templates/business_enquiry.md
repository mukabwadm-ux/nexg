# Business professional service enquiry

Status: proposed template. Review the completeness rules before runtime publication enforcement.

[All categories](../README.md) / [Field library](../field-library.md) / [Customer display rules](../customer-display.md)

## Customer presentation

The browse card uses name, accurate media, a short summary, an accurately labelled price/quote state and actual availability where known.

Additional card highlights: Supported service or product types.

The detail page groups the specifications below. Choice, sizing, price, fulfilment and terms sections appear only where applicable.

Use only the actual professional/provider service scope. No transaction or regulated authority is inferred.

- REQUEST_QUOTE: Submit a private request or provider handoff; clearly show pending response rather than a confirmed reservation.

- APPOINTMENT: Choose service, method and eligible time; show the configured booking/request/walk-in outcome accurately.

This extends the existing offering schema definitions REQUEST_QUOTE_V1, SERVICE_APPOINTMENT_V1, REGULATED_ENQUIRY_V1. It does not activate any model.

## Shared listing information

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Offering name | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Name the actual offering; the merchant identity is referenced separately. |
| Short description | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Explain what the customer receives without replacing structured specifications. |
| Photos or relevant media | Media picker with captions | offering; Optional | Browse/search card summary; Offering detail page description and inclusions | Accurate media with accessible descriptions; link media to actual variants where relevant. |
| Specific offering type | Existing record or registry selection | offering; Publish | Offering detail page description and inclusions | A registered template chosen for the item, not inferred solely from merchant category. |
| Applicable branches or channels | Multiple existing-record selections | offering; Publish | Delivery, pickup, visit or access information | Use actual permitted locations and supported methods; a digital service can have a remote channel. |
| Content source and external identity | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Preserve stable internal/external IDs and edit ownership; not a public product specification. |

## Provider service information and handoff

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Provider and service identity | Public provider identity | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Only an authorized public provider profile and verification projection. |
| Service purpose and supported channels | Repeated labelled text entries | offering; Publish | Offering detail page description and inclusions | Information/enquiry/appointment/handoff scope is explicit; no transaction authority is granted by a listing. |
| Provider-approved fees, rates and eligibility reference | Applicable versioned policy | offering; Publish | Selected price and itemized charges; Applicable terms before commitment | Source, effective time, expiry and indicative versus executable status; no invented rate, advice or guarantee. |
| Application, quote or provider handoff process | Applicable versioned policy | offering; Publish | Applicable terms before commitment; Delivery, pickup, visit or access information | Sensitive identity/payment information stays in the authorized provider flow. |

## Specific financial service coverage

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Supported service or product types | Multiple choices | offering; Publish | Labelled specification section; Browse/search card summary | Account/enquiry, currency pair, cover type, payment channel, remittance corridor, membership or business service as applicable. |
| Locations, currencies or corridor limits | Repeated labelled text entries | offering; Required when relevant | Labelled specification section | Only provider-confirmed scope; availability and live pricing must be checked at the provider. |

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

## Provider product information

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Exact provider service or product name | Labelled text entry | offering; Publish | Offering detail page description and inclusions | Separate the actual provider offering from Banking, Insurance or another merchant identity. |
| Authoritative terms and effective time | Applicable versioned policy | offering; Publish | Applicable terms before commitment | Approved source/version, validity and indicative versus executable status. No invented rate or return promise. |
| Private application information route | Private customer-input form definition | offering; Required when necessary for the provider handoff | Private customer order, booking or enquiry input | Collect only applicable information through the authorized provider process; never publish identity/financial documents. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
