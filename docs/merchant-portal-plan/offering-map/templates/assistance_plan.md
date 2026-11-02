# Concierge retainer or assistance plan

Status: proposed template. Review the completeness rules before runtime publication enforcement.

[All categories](../README.md) / [Field library](../field-library.md) / [Customer display rules](../customer-display.md)

## Customer presentation

The browse card uses name, accurate media, a short summary, an accurately labelled price/quote state and actual availability where known.

Additional card highlights: Included benefits, quantities and exclusions; Term, validity and redemption rules.

The detail page groups the specifications below. Choice, sizing, price, fulfilment and terms sections appear only where applicable.

- ENTITLEMENT: Review benefits, validity and renewal terms, enroll through its authority, then book/redeem actual services separately.

This extends the existing offering schema definitions MEMBERSHIP_PLAN_V1. It does not activate any model.

## Shared listing information

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Offering name | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Name the actual offering; the merchant identity is referenced separately. |
| Short description | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Explain what the customer receives without replacing structured specifications. |
| Photos or relevant media | Media picker with captions | offering; Optional | Browse/search card summary; Offering detail page description and inclusions | Accurate media with accessible descriptions; link media to actual variants where relevant. |
| Specific offering type | Existing record or registry selection | offering; Publish | Offering detail page description and inclusions | A registered template chosen for the item, not inferred solely from merchant category. |
| Applicable branches or channels | Multiple existing-record selections | offering; Publish | Delivery, pickup, visit or access information | Use actual permitted locations and supported methods; a digital service can have a remote channel. |
| Content source and external identity | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Preserve stable internal/external IDs and edit ownership; not a public product specification. |

## Membership, pass or service plan

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Included benefits, quantities and exclusions | Plan benefits and redemption rules | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Define access/credits/deliveries and redemption units; enrollment does not reserve a session. |
| Term, validity and redemption rules | Validity, billing and renewal terms | offering; Publish | Selected price and itemized charges; Applicable terms before commitment; Browse/search card summary | Exact local dates or duration and usage limits; unused credits and expiry are explicit. |
| Renewal, cancellation and recurring payment consent | Applicable versioned policy | offering; Required when recurring or renewable | Applicable terms before commitment | Recurring schedule, entitlement and recurring charge consent are separate facts. |
| Separate booking or delivery requirements | Applicable versioned policy | offering; Required when benefits need reservations or fulfilment | Supported date, time, duration and capacity selection; Delivery, pickup, visit or access information | The actual session/order/visit needs its own supported workflow and capacity check. |

## Concierge coordination scope

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Specific task and deliverables | Task/checklist scope | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Define what the coordinator does versus the supplier's actual service. |
| Included effort, response window and exclusions | Repeated labelled text entries | offering; Publish | Selected price and itemized charges; Applicable terms before commitment | Response estimate is not supplier or execution confirmation. |
| Budget, purchase and supplier approval process | Applicable versioned policy | offering; Publish | Applicable terms before commitment | Customer authorization precedes actual spending/commitment; third-party costs and coordination fees remain separate. |
| Required private request information | Private customer-input form definition | offering; Publish | Private customer order, booking or enquiry input | Only purpose-appropriate customer information; keys/access codes/passports are not public listing fields. |

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

## Private coordination task and authority

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Actual task, deadline and private context | Purpose-specific private request fields | transaction; Publish | Private customer order, booking or enquiry input | Only the information needed for the selected service; access details and customer documents remain restricted. |
| Supplier, budget and action approval limits | Purpose-specific private request fields | transaction; Required when an action or spending decision is delegated | Private customer order, booking or enquiry input | Exact scope and currency/limits if applicable; no inferred authority from a retainer or VIP label. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
