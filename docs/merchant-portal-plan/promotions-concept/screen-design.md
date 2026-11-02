# Promotions: end-to-end screen design

Date: 31 October 2026. Status: revised two-tab design and five selected concept images. The user removed the duplicate Featured placements destination: use Campaigns and History only, with Featured placement as a campaign type. Applies to the complete 21-category, 128-subcategory baseline and its actual offering kinds. The supplied Business screenshot is the shell/style reference, not a source of instructions.

## Intended outcome

A merchant can create, inspect and manage an applicable offer or Featured placement without learning a separate promotion system for each activity. The selected actual offering determines relevant units, options, timing, eligibility, customer copy and order/book/reserve/enroll/enquire action.

Campaigns reference catalog content, actual variants, price/rule ownership, stock, resources and placement inventory. They do not create availability, change base prices silently, confirm a reservation, settle a payment or establish permission.

The inspected effective promotion registry contains Featured placement only. Percentage/fixed offers, codes and bundle/plan benefits are explicit proposed contract extensions. Existing Offerings frontend discount behavior is a useful source, not evidence of a production campaign/rule backend. The concept images use clearly labelled fictional sample states with those proposed contracts enabled for illustration.

## Navigation and layout

Keep the reference's black sidebar, NEXG gold branding, cream work area, white header, readable sans-serif type, restrained borders and gold actions. Select Promotions in the existing navigation. Keep merchant/location context, notifications, Help and avatar. Do not introduce a second shell or a marketing landing page.

Page tabs are Campaigns and History only, directly below the title area. Campaigns contains one searchable directory for every supported campaign type, a Type filter, compact status filters inside Your campaigns and a selected-campaign detail panel. Featured placement is a type in that directory. It has no separate tab, list or creation entry point. The user also removed the page-level status summary row; do not reserve space for it. History preserves ended/cancelled/rejected records, revisions, review, delivery and incurred costs.

The directory shows campaign name, actual offer/placement, selected offering/location scope, relevant timing, state and next action. Type and status filters combine with search/location/date scope. The selected record and type-specific details come from the same campaign query, not separate offer and placement lists. State and benefit have text labels; colour is supplementary. Bulk actions apply only to explicitly eligible selected records and report individual outcomes.

The selected panel shows the actual current revision, benefit/placement, scope, timing, conditions, funding/cost, customer preview and permitted actions. Keep Preview in app beside the customer-preview heading. Selecting a Featured placement campaign reveals its surface, inventory/request, fee and charge fields in this panel/editor. Results and History retain selected-campaign context. A missing source, review message or eligibility problem has a specific correction link.

Desktop uses the same list/detail density as the reference. Creation/review uses a wider grouped form and a customer-preview/cost panel. Long content remains accessible; do not shrink text or hide terms to force a static image fit. On mobile, list and details/editor become separate destinations with Back, preserved context and reachable actions. All controls need labels, keyboard/focus behavior and associated errors in implementation.

## Creation workflow

1. Use Create promotion and choose the type/objective, including Featured placement when supported. Offer only enabled, permitted contracts. Explain unsupported types and their actual setup route. One creation flow reveals the selected type's fields.
2. Select actual offerings/variants/occurrences and branches/service areas. Show Eligible, Excluded and Needs confirmation with reasons. Merchant category suggests context; it is not a substitute for the actual offering or its policy.
3. Configure the approved benefit or placement. Choose the actual eligible price component/unit. Reuse the existing rule owner. An automatic rule and its code-based presentation must not become two independent discounts.
4. Define timing and conditions. Campaign transaction dates are separate from service, pickup, departure, admission, occupancy or plan validity. Use Africa/Nairobi and preserve exact local dates versus instants. Show minimums, exclusions and stacking plainly.
5. Define audience, funding and limits. Use only approved audience/channel rules and consent. Show who pays, cost basis and supported enforced caps. No sensitive-condition inference or invented marketing consent.
6. Inspect customer preview and merchant cost. The selected actual item/variant/time/quantity drives the preview. Quote-only remains a quote; a plan remains an entitlement; a reservation remains subject to actual capacity.
7. Save draft, validate and review. Preserve input, show field-linked issues and source-owned values. Funding, tax/rounding/stacking, policy or source decisions without a contract remain unresolved rather than silently defaulted.
8. Submit the owner command. Display required review/changes requested, pending publication or pending placement/charge confirmation accurately. Submission is not activation.
9. Show owner-confirmed scheduled/active status. At activation and redemption, recheck applicable publication, policy, price, availability, limits and placement/source constraints.
10. Manage and report. Allow only supported edit/pause/resume/end/cancel transitions; inspect confirmed results and actual history. Reconcile unknown operations before retrying.

## Featured placement campaigns

Find Featured placement campaigns through the Type filter in Campaigns. Use the same campaign rows and selected detail/editor shell as other types. Relevant fields are the customer-app surface, selected offering/storefront/location, delivery dates, review/delivery outcome and next action. Distinguish Active, Scheduled and Awaiting confirmation in text. A requested placement is not a booked slot, and neither payment nor content approval alone proves delivery.

The selected panel shows exact surface, scope, dates, source-confirmed fee/quote and separate charge status. A linked monetary offer is an independent rule reference with its own eligibility/terms; buying visibility does not create a discount. Show material quoted cost in the shared creation/review flow before submitting a placement request, and preserve hold expiry or pending/unknown command outcomes where applicable. Available inventory, content changes requested, rejected requests, charge failure and unavailable inventory each show an owner reason and recovery action.

Preview in app opens the selected campaign's public placement/content revision with location/date context. View charges opens the actual Money case. Create promotion, type selection and the common editor provide the supported placement selection/review/request journey. No dedicated Featured placement page is needed. The earlier standalone-tab image is retired; its fictional KES 1,500 fee established no platform tariff.

## History tab

Show searchable/filterable past campaigns and placement requests by type, period and ended/cancelled/rejected outcome. Distinguish actual delivery period from a merely requested period on a rejected request. Select a record to inspect its saved published revision or rejected draft, material customer terms, final outcome, actor/time/reason timeline and source-defined results or charge links.

Preview in app opens historical mode for a published saved revision, with an Archived label and its actual validity. A rejected draft can only be previewed as a rejected draft, never as something customers saw. If no saved public representation exists, show that limitation; do not reconstruct historical prices from today's catalogue. Changing revision updates the historical snapshot being inspected without modifying history or accepted work.

Duplicate as draft creates a new identity with current scope/price/policy validation. It does not resume the original, reuse an old placement reservation or inherit paid delivery. Show the exact source-owned audit history and restrict personal details; do not infer an actor or reason when the source lacks it.

## Preview in the customer app

Entry points are campaign details for any type, creation/review and History. Open a Preview in app destination with Back to Campaigns or Back to History as appropriate, preserving selection, filters and unsaved draft/revision context. Show explicit Current, Draft, Scheduled or Archived mode and public revision, customer-app channel, location/service area and transaction/use-date context. These are preview controls and derived values, not a second set of editable campaign facts.

Provide Discovery, Offering details and Order/booking review previews through the actual public rendering path in future implementation. The concept image shows Discovery and Offering details side by side so a reviewer can inspect both. A current preview uses current source-backed public values; draft/scheduled mode is clearly prospective. Historical mode uses a saved public snapshot with an ended/archived notice. Previewing cannot publish, charge, order, book, redeem or allocate anything. Customer CTA interactions navigate only to corresponding preview states.

Use the existing 15 model rules for labels, units, chosen options/specifications and the appropriate Order, Book, Reserve, Enrol or Enquire action. Product variants and prices update together; appointment and rental views retain distinct transaction/use dates and actual qualifiers. Quote-only remains a quote, plans show entitlement/validity, and ticket/space/tour views retain occurrence/party/capacity context. Public previews exclude private intake and customer/redemption identities. Missing current sources or incomplete archived data produce an explicit unavailable/partial preview rather than fabricated media, prices, availability or ranking.

The sample app view labels the paid card Sponsored and shows the independently linked discount with its actual minimum/cap and price. It is a layout preview rather than a promise of feed position or current availability. App-preview interaction, public rendering reuse and accessibility remain implementation requirements, not behavior established by the generated images.

## Captured fields

The structured field definitions are in definition.py and generated fields-and-workflows.json. The groups are identity; actual scope; benefit/rule; timing; audience/usage; creative/customer terms; funding/caps; placement; operations/results.

Capture the promotion name/type, actual offering/variant/location/channel references, price-component/unit reference, approved benefit rule, percentage or fixed amount with currency, cap/minimum/qualification, optional code, stacking/priority and exclusions. Capture transaction and actual-use windows separately, eligible days/time bands and blackouts.

Capture approved audience/usage rules, channel consent where relevant, actual headline/media/terms/CTA, funder, supported budget/redemption envelope and actual placement cost/inventory. Review, revision, source, delivery and measurement states are owner projections, not editable seller assertions.

## Offering/model adaptation

Product campaigns select actual compatible variants, stock and units. Food campaigns preserve portions/modifiers, inclusions and fulfilment windows. Service campaigns select the actual duration/provider/method and eligible times without reserving capacity in advance. Visits respect coverage and travel/workload. Rentals use the real class/asset, charge period, duration, pickup window and component exclusions. Transfers use route/party/waiting/greeting scope.

Event/class campaigns qualify actual dated occurrences and ticket/place tiers against shared capacity. Space campaigns qualify compatible party/space/occupancy and approved fees/minimum-spend scope. Tours retain supplier inclusions, price and confirmation. Plans distinguish enrolment benefits, validity, recurring consent and separate redemptions.

Custom production, repairs, freight/storage and quote/provider/concierge work do not gain invented final prices. They can promote actual discoverability/enquiry or an explicitly approved known/accepted component. Laundry preserves assessed quantity and feasible paired collection/return. All 15 model rules and all 128 explicit mappings are in coverage-128.json and coverage-128.md.

Restricted/provider-sensitive content needs its applicable promotion/policy authority, not guessed legal thresholds or seller-created approval. If no promotion rule is approved, show truthful eligibility/setup status and supported information/presence only. This is coverage of an unavailable state, not permission to enable a promotion.

## Customer presentation and acceptance

Discovery card: actual image/name, intelligible benefit and material qualification. A capped benefit says up to or shows the cap where needed. Starting prices, per-day/per-person units and quote-only offers are labelled. No false crossed-out comparison price or fabricated scarcity.

Offering page: correct selected variant/specifications, eligible benefit, actual timing, exclusions, cap/minimum and full terms. Size/colour/configuration changes re-evaluate eligibility and update actual price/image. Available times, rental periods and session places remain source-owned.

Order/booking/request review: show the actual qualifying base/component, benefit, extras/fees/deposit treatment and payable amount or quote state. The code/action validates with the price/promotion owner. Confirmation binds the accepted campaign/rule/specification/policy revision and the actual selected transaction details. Existing accepted work retains agreed terms after campaign edits or ending.

## Publication, review, delivery and money states

Keep separate dimensions for publication/scheduling, review, delivery eligibility, placement/charge outcome and measurement freshness. Draft, pending, scheduled, active, paused, ended and cancelled are not interchangeable. Active delivery can be limited or blocked while the approved campaign record remains active; explain which scope is affected.

Changes requested links to the actual field/reason. Rejected does not erase the draft/history. Scheduled activation is driven by the owner, not a browser timer. Expired quotes, changed eligibility, sold-out variants or lost capacity follow the declared delivery rule and show a useful next step. Missing measurements/results remain unknown, not zero.

Material active edits create a draft revision and show the effective date/impact; a current live promise is not silently rewritten. Pause/resume/end/cancel explain future delivery, existing accepted redemptions, placement commitments and actual financial consequences before the owner action. Duplicate creates a new draft and revalidates current references.

## Limits, concurrency and ownership

Redemption/count/spend limits need authoritative atomic enforcement. Holds/reservations, expiry, release, payment/booking failure and cancellation behavior must be defined by their owner. Parallel customers cannot both consume the final permitted redemption. Retries must not duplicate use or charges. Existing accepted terms remain honored according to their actual cancellation/refund policy.

Benefit calculation references the approved price basis, tax/rounding and stacking policy. This concept sets no universal platform rounding, reference-price, refund or legal-advertising policy. Illustrative price examples use exact integer minor-unit calculations. Placement inventory and charge confirmation are independently sourced; a timeout is reconciled before another purchase request.

The existing Offerings discount UI and future Promotions use the same authoritative benefit/rule reference. Base price stays with its price owner; Offerings can link to Manage campaign rather than create a conflicting independently edited discount. Settings declares source/edit authority. No provider-owned price or stock is edited by a campaign form.

## Results

Show source-confirmed redemptions, actual funded discount amounts, actual eligible transaction value and placement/delivery measurements only when supported. Name period, unit, definition, source coverage and refund/cancellation treatment. Impressions/clicks, conversion attribution and incremental uplift are different measures. Do not invent revenue attribution, claim uplift from a redemption total or substitute zero for a missing feed.

Open Insights with campaign/time/location scope. Open Money for actual placement charges, funded amounts or supported cases. Restrict customer-level logs and exports to actual purpose/permission. Ending or archiving delivery does not erase incurred charges, accepted benefits or history.

## Cross-screen integration

Home shows confirmed campaign summaries and relevant issues. Offerings exposes actual selected items/variants and shared benefit references. Availability remains the capacity owner. Business supplies scoped locations, activity setup and applicable verification/policy references. Work retains accepted offer terms. Money owns actual charges/payment/refund facts. Insights owns measured definitions. Settings owns grants, sources and channel/connection consent.

## Five selected concept images

1. Unified Campaigns: two page tabs, one list of campaign types with Type/status filters, actual variant scope, selected active campaign, customer card, Preview in app, cost/terms and an actionable eligibility issue.
2. Service-offer creation: actual service/duration/location, independent booking/use windows, eligible weekdays/times, selected customer price and merchant cost, before submission.
3. Rental management/results: real rental unit/duration/pickup qualifiers, precise interval-price example, separate deposit, eligible/excluded scope, measured redemption/cost definitions and management actions.
4. History: two page tabs, past outcomes, archived public revision/terms, actor/time/change timeline, historical preview and duplication into a new draft.
5. Customer-app preview: Back to Campaigns, merchant preview context and visible discovery/detail app states, material price/terms and a preview-only boundary.

The former standalone Featured placements image is retained only as a retired historical concept in provenance, not a selected screen or current navigation requirement.

All images retain the attached shell and show Sample preview. Dates, merchants, offers, prices and results are illustrative. The images are references for review, while the complete coverage/flow/source documents specify behavior outside those populated states.

## Implementation and acceptance

Future implementation needs a shared campaign/rule projection, actual scoped owner commands, selected-offering eligibility, deterministic source-backed price evaluation, revision/audit/history, review and placement/charge adapters, limit/redemption coordination, scheduling and metrics sources. Persist supported drafts and recover operation outcomes without duplicate effects. Use existing UI primitives and shell; no per-category backend or parallel order/booking lifecycle.

Acceptance must exercise all 128 configuration bindings and selected actual model journeys: product option/stock changes; service booking versus use dates; rental interval/cap/deposit; event final place; quote-only CTA; membership renewal/redemption; laundry reassessment/return; freight/storage units; policy/source unavailability; stale revision; code/stacking/limits; concurrent final redemption; timeout reconciliation; ending without rewriting accepted work; absent results; mobile/keyboard/focus/error behavior. Static coverage and images do not establish those runtime outcomes.
