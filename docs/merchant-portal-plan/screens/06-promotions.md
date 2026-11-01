# Promotions

Screen ID: SC_PROMOTIONS. Status: revised two-tab concept design selected by the user on 31 October 2026. Inherits the shared screen contract. The [complete design](../promotions-concept/screen-design.md), [field/workflow definitions](../promotions-concept/fields-and-workflows.md), [all-128 adaptation matrix](../promotions-concept/coverage-128.md) and [five selected concept images](../promotions-concept/images.md) refine this baseline. Campaigns and History are the only page tabs; Featured placement is a campaign type.

## Purpose and scope

Create and monitor eligible promotions with clear customer terms, merchant cost and confirmed delivery state. Existing Featured placements are the baseline capability. Discount, coupon, bundle, referral or membership offers are proposed extensions that require their own approved rule, funding, eligibility and reporting contracts before enabling.

Promotions remains a dedicated navigation destination. Insights reports performance; Offerings owns referenced listings; Money owns charges and settlement. A merchant's category, documents, published location, offering availability, campaign capability and role jointly constrain campaign actions.

## Layout

Header shows scope and Create promotion if eligible. Main tabs are Campaigns and History only, directly below the title area. Campaigns has one searchable list for every supported campaign type, a Type filter, compact status filters inside Your campaigns and a selected detail panel. Featured placement is a type within this list, with its fields in the common detail/editor. The separate page-level status summary row remains removed. A current promotion appears with actual offering/variant/location scope, distinct transaction/use dates, confirmed status, cost/funding definition and permitted next actions. Results and History retain selected-campaign context.

Creation is a short type-specific flow: objective/type → eligible scope/offerings → content or benefit → dates/inventory → terms/cost → preview/review → submit. Unsupported types are explained in a separate availability area rather than presented as working forms.

Selecting the Featured placement type reveals actual surface/scope/dates, independent review/delivery and charge outcomes, any linked benefit and Preview in app inside the campaign. Use the same Create promotion/type-selection flow. History shows ended/cancelled/rejected records, saved revisions and actor/time/reason history. Its Preview in app uses an explicit historical public snapshot; Duplicate as draft creates a new validated draft without reusing old paid placement inventory. The preview destination preserves app/location/date/revision context and returns to Campaigns or History. It cannot create an order, booking, charge, redemption or publication. See the [campaign-type and preview design](../promotions-concept/screen-design.md#featured-placement-campaigns).

## Feature inventory

| ID | Feature/data | Action and outcome |
| --- | --- | --- |
| PR01 | Campaign directory | Show owner-confirmed type, name, scope, timing, state and relevant cost/benefit. Missing delivery data is not inactive. |
| PR02 | Search/filter/sort | Filter type, state, location, date and objective within scope. Preserve active filters and explain filtered empty. |
| PR03 | Eligibility and blockers | Explain exact missing requirement and link Business/Offerings/Settings. Category alone does not establish eligibility. |
| PR04 | Type selection | Select only enabled campaign contracts; describe what each changes and costs. A type not implemented remains unavailable with a real request path. |
| PR05 | Featured placement inventory | Show actual placement/location/date inventory and source; hold/book only through inventory owner, with explicit hold expiry. |
| PR06 | Offering and location selection | Choose compatible published offerings and permitted locations. Validate availability, regulated/age constraints and fulfilment scope. |
| PR07 | Creative and content | Merchant title/image/description where required, permitted format and preview; preserve draft and show review/changes requested. |
| PR08 | Benefit/rule configuration | For an approved discount/coupon/bundle capability, typed amount/basis/limits/qualifying set and currency. Do not enable a rule with unresolved stacking or funding policy. |
| PR09 | Audience and channel scope | Approved location/channel/eligibility rules; no invented sensitive targeting or external marketing consent. |
| PR10 | Dates and recurrence | Exact timezone/start/end, placement constraints and any recurrence permitted by the contract. Browser time is not proof of activation. |
| PR11 | Funding, cost and budget | Show who funds the benefit, authorized charges, caps and billing basis. A budget cap is enforceable only if owner support exists. |
| PR12 | Terms, exclusions and limits | Customer-visible conditions, redemption limits, minimums and cancellations per approved rule. Prevent contradictory or hidden conditions. |
| PR13 | Customer preview | Show resulting placement/offer across eligible discovery context, clear terms and sample-data label. No simulated ranking guarantee. |
| PR14 | Save draft/validate | Validate scope, references, dates, cost authority and completeness; retain errors and draft version. |
| PR15 | Submit/review/publish/schedule | Submit through campaign owner with required approvals. A requested placement is not booked until confirmed. |
| PR16 | Edit/duplicate | Version an allowed edit with effective date; material changes may need renewed review. Duplicate creates a new draft and revalidates current eligibility. |
| PR17 | Pause/resume/end/cancel | Only owner-supported transitions, with current state, financial/delivery consequences and clear confirmation. Ended delivery does not erase incurred charges. |
| PR18 | Performance summary | Confirmed impressions, clicks, qualified actions, attributed outcomes and cost only where definitions/sources exist. Show period and attribution limitations. |
| PR19 | Redemption/delivery log | Authorized campaign events and validation outcomes; protect customer identity and avoid equating a click with a sale. |
| PR20 | Charges and financial cases | Link owner-sourced campaign charges/refunds and Money case. Campaign state never directly marks a payment settled. |
| PR21 | Approval/change history | Actor/source/version/reason and effective times; immutable history and review messages. |
| PR22 | Source failure and recovery | Placement/campaign/measurement sync status separately; reconcile unknown booking or spend command before retry. |
| PR23 | Export/report link | Open Insights with campaign/date/scope; export permitted definitions and event coverage. |
| PR24 | Transaction eligibility and limits | Recheck actual variant/options, date context, price component, policy and authoritative redemption/spend limits at acceptance. Parallel users cannot consume one final permitted redemption twice. |
| PR25 | Accepted benefit and terms | Bind the actual accepted campaign/rule/specification/price/policy versions to work; later editing, pausing or ending cannot silently rewrite accepted terms. |
| PR26 | Shared Offerings rule ownership | Reuse one authoritative discount/benefit reference with Offerings. Campaign authoring does not create another editable base price or independent duplicate discount. |

## Merchant adaptation

Restaurant promotions reference menu items and actual fulfilment/time windows. Retail can reference compatible product variants and stock constraints. Rental promotions reference vehicle class or qualifying period, not a food basket. Appointment campaigns refer to eligible service/resource windows without overselling capacity. Event and tour promotions respect session inventory and issuer/source rules.

Quote-based services can promote discoverability or an approved enquiry offer; they cannot advertise an invented final price. Regulated/age-restricted specialties follow explicit promotion and eligibility rules. If none are approved, show only supported presence/status information and the policy owner route. Each profile maps its permitted promotion envelope in the 128 matrix.

The [new explicit coverage](../promotions-concept/coverage-128.json) binds all 128 specialties and 189 current offering kinds to the 15 actual operational models. Monetary rules require an actual known approved price component and source authority; a known diagnostic/handling fee may qualify even where the overall job is quoted, while an unknown final quote cannot. Booking/order/enrolment windows remain separate from actual service, rental pickup, departure, admission, return or occupancy dates.

The five selected illustrative states are unified Campaigns, service-offer creation, active rental campaign/results, History and the customer-app preview. The former standalone Featured placements image is retired. Prices and metrics are sample fixtures; [image inspection](../promotions-concept/image-review.md) records their checks and the corrected deposit. They are design references, not actual campaign publication or runtime evidence.

## Lifecycle and failure states

Proposed display states are draft, validation needed, awaiting review, changes requested, scheduled, active, paused, ended, cancelled and rejected, only when the campaign contract defines them. Keep inventory hold, payment/charge state, delivery and measurement freshness separate.

All inherited R/A states apply. A scheduled campaign can fail to activate because inventory/eligibility changed; explain the actual owner reason and preserve approved content. An unavailable measurement feed does not report zero results. Edits racing with activation return current state/version. Do not repeat a placement purchase after timeout until its result is reconciled.

## Journeys and cross-screen effects

1. **Featured rental placement:** choose eligible branch and vehicle offering → inspect actual placement inventory/dates → view confirmed cost/terms → submit → await owner confirmation → show scheduled/active state → report measured outcomes with attribution definition.
2. **Draft correction:** review requests a content change → open exact field → update version → resubmit → retain previous review history.
3. **Unavailable offering:** a promoted service loses bookable capacity → campaign owner applies its declared rule → display affected delivery state and corrective link. Do not silently change the promotion's promised terms.

Confirmed campaign events update Home's secondary promotion card and Insights; charges flow to Money. Promotion setup never distracts from urgent operational Work or makes itself a prerequisite for basic merchant use.

## Mobile and UX rationale

Mobile lists preserve campaign name, state, dates and meaningful cost; the creation wizard groups one decision at a time with a review summary. Terms and funding are visible before submission. Use familiar status language, proximity of terms to the offer and clear feedback on booking/review outcomes. Avoid artificial scarcity, countdowns or guaranteed growth claims.

## Acceptance scenarios

- PR-T01: eligible merchant can request a real Featured placement with source inventory and clear pending confirmation.
- PR-T02: unsupported coupon capability has no active creation path; missing funding/stacking rules remain explicit dependencies.
- PR-T03: rental offer uses a rental period/class; appointment offer respects actual slot inventory.
- PR-T04: metrics source failure preserves known results with freshness and does not show zero.
- PR-T05: ending a campaign preserves historical delivery/charges; placement timeout reconciles without duplicate purchase.
- PR-T06: a new category inherits only allowed promotion capabilities after eligibility validation.

Apply inherited states and all profile-specific eligibility envelopes. Proposed types remain disabled until their owner contracts exist.

<!-- BEGIN OFFERING_SPECIFICATION_REVIEW -->
## Product-specific information across all 21 categories

Status: all-category screen and workflow design. Use the [category screen/workflow compositions](../offering-map/all-screens-and-workflows.md), [complete offering field matrices](../offering-map/coverage-128.md) and [selected-workflow information contract](../offering-map/workflow-information.md). Fashion is one detailed example of the shared product-kind system.

Select actual eligible published offerings, variants, options, dates and locations. Use accurate specification highlights, correct media, price basis and applicable stock/capacity/policy eligibility. Promotion configuration cannot grant permission or invent availability.

Required scenario: A promoted variant has its own eligible price/image/availability. Required product restrictions and source failures remain visible; private customer information is excluded from public promotion content.

The 21 cross-category activity additions are [approved for design inclusion](../offering-map/approved-profile-additions.json). Field completeness rules remain reviewable and actual owner prerequisites still apply.
<!-- END OFFERING_SPECIFICATION_REVIEW -->
