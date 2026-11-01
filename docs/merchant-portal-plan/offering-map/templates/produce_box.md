# Recurring produce box plan

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

## Fresh produce specifications

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Produce type and variety | Labelled text entry | offering; Publish | Labelled specification section | Actual variety when known; no invented origin or organic certification. |
| Grade, ripeness and preparation | Labelled text entry | offering; Optional | Labelled specification section | Whole, cut or prepared as actually offered. |
| Loose weight or fixed pack basis | Number with unit and basis | offering; Publish | Customer option or variant selector; Selected price and itemized charges | State estimate versus final weighed quantity and the approved adjustment policy. |
| Declared origin and certification reference | Labelled text entry | offering; Optional | Labelled specification section | Show certification only from an authorized verified source. |
| Substitution and seasonal availability policy | Applicable versioned policy | offering; Required when substitutions are supported | Applicable terms before commitment | Customer choice and acceptance are explicit. |

## Food contents and options

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Ingredients and declared allergens | Repeated labelled text entries | offering; Publish | Offering detail page description and inclusions | Capture available ingredients, allergen and cross-contact information with source; unknown is explicit, never an allergen-free claim. |
| Supported dietary descriptors | Multiple choices | offering; Optional | Labelled specification section | Only merchant-confirmed descriptors; do not infer from ingredients alone. |
| Required choices and optional additions | Required/optional customer choices | offering; Required when choices are offered | Customer option or variant selector; Selected price and itemized charges | Define minimum/maximum choices, incompatible options, price effect and availability. |
| Storage, freshness and handling | Labelled text entry | offering; Required when relevant | Offering detail page description and inclusions; Delivery, pickup, visit or access information | Stock/batch expiry is not a timeless listing fact. Surface applicable label/storage instructions. |

## Price and charge basis

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| How the price is calculated | Single choice | offering; Publish | Browse/search card summary; Selected price and itemized charges | Fixed, per declared unit, variant, duration, person, package, starting estimate or quote-only. |
| Published price or quote status | Price entry or quote-only state | offering; Publish | Browse/search card summary; Selected price and itemized charges | Money uses integer minor units and currency; quote-only is not a zero price. Never auto-convert legacy whole-KES fields. |
| Included and additional charges | Charge rule rows | offering; Required when extra charges apply | Selected price and itemized charges; Applicable terms before commitment | Explicit unit, applicability, inclusions and source; show the selected total before commitment. |
| Price and policy version | Existing record or registry selection | offering; Publish | Authorized merchant/system view only | Accepted work retains the applicable version; prices come from their declared authority. |

## Ways to receive the offering

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Delivery, pickup, visit or remote methods | Multiple choices | offering; Publish | Delivery, pickup, visit or access information | Only supported methods for the selected listing and location. |
| Service area and pickup locations | Coverage-owner projection | offering; Required when physical delivery or customer-location service is offered | Delivery, pickup, visit or access information | Exact authoritative coverage; show eligibility for the selected customer location. |
| Preparation or fulfilment lead time | Duration and unit | offering; Required when a lead time applies | Browse/search card summary; Delivery, pickup, visit or access information | Exact amount and unit; estimate versus firm promise must be labelled. |
| Customer-facing fulfilment instructions | Labelled text entry | offering; Optional | Delivery, pickup, visit or access information | Public instructions exclude personal access credentials and internal notes. |

## Private customer request

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Requested work and preferences | Labelled text entry | transaction; Required when a quote or assessment is needed | Private customer order, booking or enquiry input | Collect only information needed to scope this request; never place it in public specifications. |
| Relevant location, dates and quantities | Purpose-specific private request fields | transaction; Required when needed for the selected service | Private customer order, booking or enquiry input | Only applicable fields; exact private addresses and access details remain restricted. |
| Customer contact for this request | Private customer/contact selector | transaction; Required when follow-up is needed | Private customer order, booking or enquiry input | Use authorized customer/contact records and purpose-limited access. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
