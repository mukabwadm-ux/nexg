# Spa or wellness membership

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

## Wellness session and facility scope

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Session modality, focus and intensity description | Labelled text entry | offering; Publish | Browse/search card summary; Offering detail page description and inclusions | Actual provider description; no invented efficacy or health suitability claims. |
| Facilities, products and equipment included | Repeated labelled text entries | offering; Publish | Offering detail page description and inclusions | Distinguish facility access, individual service and paid extras. |
| Supported provider and format preferences | Required/optional customer choices | offering; Required when offered | Customer option or variant selector | Preferences require actual resource availability; personal suitability data uses private intake. |

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

## Treatment and training configuration

| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |
| --- | --- | --- | --- | --- |
| Actual treatment, training or access type | Labelled text entry | offering; Publish | Offering detail page description and inclusions | Specific treatment/discipline/service rather than a generic wellness description. |
| Duration, provider and package choices | Required/optional customer choices | offering; Required when options are offered | Customer option or variant selector; Selected price and itemized charges; Supported date, time, duration and capacity selection | Each choice uses its actual price, duration and eligible resources; preferences are not guarantees. |
| Included facilities and applicable preparation reference | Applicable versioned policy | offering; Required when applicable | Offering detail page description and inclusions; Applicable terms before commitment | Actual approved provider information; no inferred health outcome or personal suitability. |

## Source and visibility

Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.
