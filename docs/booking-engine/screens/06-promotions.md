# Promotions

Screen ID: SC_PROMOTIONS. Status: proposed design. Planned after Money. Inherits the shared screen contract.

## Purpose and scope

Create and monitor eligible promotions with clear customer terms, merchant cost and confirmed delivery state. Existing Featured placements are the baseline capability. Discount, coupon, bundle, referral or membership offers are proposed extensions that require their own approved rule, funding, eligibility and reporting contracts before enabling.

Promotions remains a dedicated navigation destination. Insights reports performance; Offerings owns referenced listings; Money owns charges and settlement. A merchant's category, documents, published location, offering availability, campaign capability and role jointly constrain campaign actions.

## Layout

Header shows scope and Create promotion if eligible. Views: Overview, Active/scheduled, Drafts and History. A current promotion appears with type, placement/offer, scope, dates, confirmed status, budget/cost definition and primary next action. Campaign list and a readable timeline carry the work; use only meaningful status summaries.

Creation is a short type-specific flow: objective/type → eligible scope/offerings → content or benefit → dates/inventory → terms/cost → preview/review → submit. Unsupported types are explained in a separate availability area rather than presented as working forms.

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

## Merchant adaptation

Restaurant promotions reference menu items and actual fulfilment/time windows. Retail can reference compatible product variants and stock constraints. Rental promotions reference vehicle class or qualifying period, not a food basket. Appointment campaigns refer to eligible service/resource windows without overselling capacity. Event and tour promotions respect session inventory and issuer/source rules.

Quote-based services can promote discoverability or an approved enquiry offer; they cannot advertise an invented final price. Regulated/age-restricted specialties follow explicit promotion and eligibility rules. If none are approved, show only supported presence/status information and the policy owner route. Each profile maps its permitted promotion envelope in the 128 matrix.

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
