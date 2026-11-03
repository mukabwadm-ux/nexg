# Vehicle inspection appointment or visit

Status: proposed template. Review the completeness rules before runtime publication enforcement.

[All categories](../README.md) / [Field library](../field-library.md) / [Customer display rules](../customer-display.md)

## Customer presentation

The browse card uses name, accurate media, a short summary, an accurately labelled price/quote state and actual availability where known.

Additional card highlights: Supported incident or inspection scope; Deliverables and report scope.

The detail page groups the specifications below. Choice, sizing, price, fulfilment and terms sections appear only where applicable.

- APPOINTMENT: Choose service, method and eligible time; show the configured booking/request/walk-in outcome accurately.

- FIELD_VISIT: Provide private service location and scope, then choose or request a feasible visit; confirmation needs team/travel capacity.

This extends the existing offering schema definitions SERVICE_APPOINTMENT_V1, FIELD_SERVICE_V1. It does not activate any model.

## Shared listing information

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Offering name | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Name the actual offering; the merchant identity is referenced separately. |
| Short description | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Explain what the customer receives without replacing structured specifications. |
| Photos or relevant media | Media picker with captions | offering; Optional | Browse/search card summary; Offering detail page description and inclusions | Accurate media with accessible descriptions; link media to actual variants where relevant. |
| Specific offering type | Existing record or registry selection | offering; Publish | Offering detail page description and inclusions | A registered template chosen for the item, not inferred solely from merchant category. |
| Applicable branches or channels | Multiple existing-record selections | offering; Publish | Delivery, pickup, visit or access information | Use actual permitted locations and supported methods; a digital service can have a remote channel. |
| Content source and external identity | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Preserve stable internal/external IDs and edit ownership; not a public product specification. |

## Service scope and delivery

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| What the service includes and excludes | Repeated labelled text entries | offering; Publish | Offering detail page description and inclusions; Applicable terms before commitment | Define the actual task or deliverables and any assessment boundary. |
| Service location or format | Multiple choices | offering; Publish | Customer option or variant selector; Delivery, pickup, visit or access information | Merchant venue, customer location or remote where explicitly configured. |
| Service duration and unit | Duration or assessment-required | offering; Publish | Browse/search card summary; Supported date, time, duration and capacity selection | Exact duration when bookable; assessment-required is explicit and cannot promise a slot. |
| Eligible provider or resource description | Eligible resource projection | offering; Required when resources or staff are needed | Offering detail page description and inclusions; Supported date, time, duration and capacity selection | Public provider details are an allowed projection; internal staffing records remain private. |
| Customer preparation and prerequisites | Repeated labelled text entries | offering; Optional | Offering detail page description and inclusions; Applicable terms before commitment | Merchant-approved administrative instructions; no generated clinical or professional advice. |
| Cancellation, reschedule and no-show terms | Applicable versioned policy | offering; Publish | Applicable terms before commitment | Use applicable authority and version; no universal thresholds are invented here. |

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

## Vehicle service and compatibility

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Supported vehicle types and fitment | Multiple existing-record selections | offering; Publish | Labelled specification section | Actual fitment and variant details; customer vehicle identifiers belong in private intake. |
| Service tasks and exclusions | Task/checklist scope | offering; Publish | Offering detail page description and inclusions | Actual service package, parts/consumables and assessment scope. |
| Workshop, mobile or roadside method | Multiple choices | offering; Publish | Customer option or variant selector; Delivery, pickup, visit or access information | Method selects the applicable job/visit/appointment model; coverage is separately authoritative. |
| Duration or diagnostic estimate | Duration or assessment-required | offering; Publish | Browse/search card summary; Supported date, time, duration and capacity selection | Do not block the whole uncertain repair as a fixed appointment. |

## Roadside and inspection service scope

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Supported incident or inspection scope | Repeated labelled text entries | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Towing, jump-start, recovery or inspection are separate selectable tasks. |
| Vehicle, distance and operating limits | Named measurements with units | offering; Publish | Selected price and itemized charges; Applicable terms before commitment | Applicable vehicle constraints, included distance and extra charges with units. |
| Response estimate and acceptance method | Duration or assessment-required | offering; Publish | Delivery, pickup, visit or access information | Estimate versus actual dispatch confirmation is explicit; 24-hour claim is not current resource availability. |
| Deliverables and report scope | Repeated labelled text entries | offering; Required when inspection/reporting is offered | Offering detail page description and inclusions; Applicable terms before commitment; Browse/search card summary | State what is checked and delivered without inventing certification or statutory approval. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
