# Promotions fields and workflow

Status: proposed design. Exact input constraints and owner commands require their actual contracts.

| Field | Input | Required condition | Purpose / display |
| --- | --- | --- | --- |
| Promotion name | text | Always | Campaign list and internal organization |
| Promotion type | registered_type_reference | Always | Correct creation flow and customer presentation |
| Objective | enum | When supported | Internal goal; no guaranteed growth claim |
| Campaign and rule revision | reference | System-owned | Internal accepted-version reference |
| Actual offering selection | offering_reference_list | For offering campaigns | Customer card, detail and actual order/book/request CTA |
| Qualifying variants/options/tiers | reference_list | When choices affect eligibility | Actual selected options, image, price and availability |
| Branches and supported service areas | scoped_reference_list | Always | Where the offer is valid |
| Eligible channels or placement | enum_list | Always | Actual permitted discovery/storefront placement |
| Qualifying price components and unit | pricing_component_reference_list | For monetary offers | Correct item/period/person/fee benefit basis |
| Existing approved benefit/rule reference | rule_reference | For monetary offers | One authoritative benefit definition, shared with Offerings |
| Percentage or fixed benefit | enum | For supported monetary rules | Clear customer saving |
| Benefit amount or percentage | money_or_basis_points | For supported monetary rules | Saving and selected price |
| Maximum saving | money | When capped | Visible cap near the offer |
| Minimum qualifying value/quantity/duration | typed_qualification | When applicable | Visible qualification in actual units |
| Code and application method | code_rule | For code offers | Customer code field or automatic-applied label |
| Combination and priority policy | policy_reference | Before enabling a monetary rule | Whether other offers can combine |
| Excluded components and items | reference_list | When applicable | Clear exclusions before commitment |
| Campaign start/end | offset_instants | For timed campaigns | Accurate public validity in Africa/Nairobi |
| Book/order/enrol-by window | date_or_instant_window | When transaction timing qualifies | When the customer must transact |
| Service/pickup/departure/occupancy window | typed_window | When fulfilment timing qualifies | When the benefit can actually be used |
| Eligible weekdays and time bands | local_schedule | When restricted | Actual valid times with timezone |
| Excluded dates or occurrences | reference_or_date_list | When applicable | Visible excluded dates/occurrences |
| Approved customer eligibility rule | policy_reference | Always | Actual applicable conditions without sensitive inference |
| Per-customer and campaign redemption limits | limit_policy | When limited | Relevant customer usage conditions |
| Channel consent and permitted targeting | consent_policy_reference | For marketing delivery | Only authorized delivery/audience scope |
| Customer headline | text | When the channel needs creative | Offer card/title |
| Actual offering/variant media | media_reference | When the channel uses imagery | Accurate product/service image |
| Benefit description and terms summary | text | Always | Plain customer explanation and conditions |
| Full applicable terms version | policy_reference | Always | Detail/review terms before commitment |
| Order, book, reserve, enroll or enquire action | actual_model_action_reference | Always | Supported actual customer journey |
| Who funds the benefit | owner_reference | For monetary offers | Merchant cost and applicable customer disclosure |
| Enforceable spending/redemption envelope | money_and_count_limits | When capped | Internal cost controls; no false enforceability claim |
| Placement or campaign charge basis | confirmed_quote_reference | For paid placements | Merchant review before accepting a charge |
| Budget/redemption hold and release policy | owner_policy_reference | Where enforcement requires holds | Internal authoritative limit enforcement |
| Actual placement/date/location inventory | inventory_reference | For Featured placements | Actual requested placement; no guaranteed ranking |
| Placement hold and expiry | hold_reference | If supported | Merchant pending/confirmed placement state |
| Content/policy review outcome | owner_review_state | When review is required | Merchant changes requested or approved state |
| Eligibility and delivery status/reasons | owner_projection | Always | Actual active/limited/blocked availability |
| Actor, changes, versions and effective time | audit_reference | Always | Authorized change history |
| Source freshness and edit authority | source_reference | Always | Merchant conflict/recovery state |
| Measured campaign results and definitions | measurement_reference | When data exists | Actual period/coverage; unknown is not zero |

## Full campaign journey

- PR_SCOPE / Choose objective and promotion type: Only capability/policy-supported types can continue; retain draft context.
- PR_ELIGIBILITY / Choose actual offerings and locations: Show eligible, excluded and unresolved candidates with reasons and links to their owner.
- PR_RULE / Configure the approved benefit or placement: Reference actual priced components, units, limits, stacking and source authority; no base-price duplication.
- PR_TIME / Set timing and customer conditions: Separate transaction window from actual service/pickup/departure/redemption dates and show material terms.
- PR_FUNDING / Review funding, inventory and cost: Known authorized fee/benefit owner and enforceable caps; unsupported or unknown terms remain unresolved.
- PR_PREVIEW / Preview the actual customer journey: Correct media/specification/price/terms/CTA for the selected offering, variant and date context.
- PR_SUBMIT / Save, validate and submit: Versioned owner command with required review; pending remains pending and timeout remains unknown.
- PR_DELIVER / Schedule, activate and manage: Owner-confirmed states, permitted edit/pause/resume/end actions and explicit eligibility loss behavior.
- PR_REDEEM / Validate at transaction acceptance: Owner rechecks actual selected item/time/quantity, price, eligibility and limits; accepted terms are snapshotted.
- PR_RESULTS / Inspect measured results and recover: Actual confirmed redemptions, funded amounts and source-defined metrics with coverage; reconcile failures without duplicate spend.

## Model-specific forms and qualifiers

| Actual model | Unit/scope | Qualifiers | Customer view and CTA |
| --- | --- | --- | --- |
| ORDER / Products, food and retail | Actual item/variant, pack, weight or volume | published actual item and compatible variants; declared unit and authoritative price/stock; applicable branch/channel/fulfilment; optional approved minimum spend/quantity and limits. Purchase/redemption window; fulfilment windows only if the service actually supports them. Approved priced item/component benefit; optional supported fulfilment benefit stays with its owner. | Actual item/variant with relevant specification, original/selected price, saving and nearby terms. Action: Choose eligible item and options. |
| APPOINTMENT / Appointments | Actual service, duration, provider and location | eligible service/provider/method; booking window distinct from service dates; selected weekdays/time ranges; actual shared resource availability. Book-by dates and service dates/times are independent; display both in Africa/Nairobi. Approved service-price component; no capacity is created by a campaign. | Service scope/duration, eligible date/time/location, selected price and actual available times. Action: Choose an eligible appointment time. |
| FIELD_VISIT / Customer-location visits | Actual scoped package/workload, team time and service area | actual coverage and travel feasibility; known priced package or accepted assessment; service window and resource eligibility; private exact service address. Booking window and actual visit window/coverage are separate. Only a known approved package/fee component; unknown workload uses a request offer. | Scope, actual coverage, included supplies, price/estimate and supported request/visit action. Action: Check coverage and choose or request a visit. |
| ASSET_INTERVAL / Vehicle or asset rentals | Actual asset/class and exact rental charge period | guaranteed asset versus class; minimum/maximum duration and eligible rate component; pickup dates distinct from booking dates; handover locations and joint driver allocation where needed. Book-by dates, qualifying pickup dates and rental start/end are separate; exact local-date/instant semantics remain intact. Approved rental-rate component; deposits, cover, fuel or extras are treated according to explicit component rules, not blanket defaults. | Vehicle/class specifications, duration qualification, selected interval total, saving, deposit and terms separately. Action: Choose rental dates and options. |
| TRANSFER / Transfers and greetings | Actual route/service, party, vehicle or greeter | eligible route and party capacity; travel time and actual resource confirmation; waiting/stops/parking inclusions; greeter-only distinct from transport. Book-by window and actual trip/greeting dates are separate. Known approved trip/greeting component; no fake final price for an unquoted route. | Actual route/scope, seats/luggage or greeting terms, waiting, selected fare and extras. Action: Choose the actual trip or greeting. |
| SESSION_CAPACITY / Events, classes and sessions | Actual dated occurrence, tier and place quantity | specific occurrence and eligible tiers; real shared place capacity; quantity/admission constraints; ticket issuance separate from reservation. Purchase window and actual session/admission dates are distinct. Approved ticket/place-price component and real quantity limits. | Actual event/class, occurrence, included admission, tier/quantity, selected price and entry terms. Action: Choose an eligible occurrence and places. |
| SPACE_RESERVATION / Tables and venue spaces | Compatible space, party and occupancy | explicit enabled space activity; actual compatible party/space/time; fee/minimum-spend scope; occupancy and turnover constraints. Booking window and actual occupancy dates/times are separate. Approved known fee/benefit only; a space reservation does not create a food order or unknown event quote. | Space/party limits, actual time, fee/minimum spend and clear conditions. Action: Choose a compatible space and time. |
| TOUR / Tours and safari departures | Actual departure, party format and supplier-confirmed inclusions | published actual itinerary/departure; private/shared party and supplier capacity; named included/excluded components; supplier price/confirmation and policy. Book-by dates and departure/travel dates are separate. Approved priced departure/package component; supplier enquiry never becomes instant inventory. | Itinerary, duration, party model, inclusions, selected price and supplier/cancellation terms. Action: Choose an eligible departure or request confirmation. |
| PRODUCTION_DUE / Custom production | Accepted product specification and production commitment | actual custom product/options and proof process; scope and price agreement; feasible due date/lead time; accepted specification/policy version. Order-by window, proof/acceptance deadline and production due date are distinct. A known approved component may be promoted; an unknown final custom quote cannot be advertised as a guaranteed discount total. | Actual customizable item, allowed options, lead time, approval process and quote/known-fee benefit. Action: Specify the work and request or obtain acceptance. |
| REQUEST_QUOTE / Quoted, professional and provider enquiries | Actual enquiry/coordination scope and known fees only | published supported service scope; real provider or supplier authority; approved content and applicable promotion policy; no invented transaction/quote acceptance. Campaign/request period and requested work/travel dates are separate. Discoverability/enquiry offer, or a separately approved known fee component. Never invent the final service price. | Actual provider/service scope, known fee if any, terms and accurate enquiry CTA. Action: Request a quote or contact the authorized provider. |
| LINKED_WINDOWS / Laundry and collection/return work | Actual items/kg/workload and compatible paired promises | declared processing unit and actual rate; assessment/weight adjustment policy; feasible collection and return; care restrictions and scope acceptance. Campaign order window, collection window and feasible return promise remain distinct. Approved unit/package component, revalidated after any accepted assessment adjustment. | Accepted item/care scope, unit rate, offer, collection/return information and assessment terms. Action: Choose processing and feasible collection/return. |
| SERVICE_JOB / Workshop, diagnostics and repair | Actual diagnostic or accepted job/parts/labour scope | actual supported equipment/vehicle; diagnostic fee distinct from final repair; explicit parts/labour benefit component; quote and additional-work acceptance. Campaign intake window and actual assessed work/turnaround are separate. Known diagnostic or accepted work component only; no made-up final repair discount. | Compatibility, diagnostic/job scope, known offer, exclusions and actual intake/assessment action. Action: Request intake or accept the actual job quote. |
| ENTITLEMENT / Memberships, passes and supply plans | Actual plan benefits, quantity, validity and redemption | real plan and included benefits; new enrolment versus renewal scope; explicit recurring charge consent; actual redemption/booking/fulfilment remains separate. Enrol-by window, benefit validity and each redemption/service date are distinct. Approved first-term/enrolment or explicitly supported renewal component; no silent perpetual renewal discount. | Included credits/access/deliveries, validity, selected term price, renewal and separate booking terms. Action: Review the plan and enroll. |
| FREIGHT / Sea, air and road freight | Actual route, kg/m3/container/load and accepted cargo | actual carrier route/load constraints; per-piece dimensions/mass and approved calculation; quote validity and actual accepted charges; carrier/clearance/cover inclusions. Quote/campaign validity and actual cargo/shipping dates are separate. Discovery or approved known/accepted tariff component; no universal cart minimum or invented volumetric divisor. | Route/mode, charge basis, applicable benefit/quote, inclusions and private declaration path. Action: Declare the shipment and request a carrier quote. |
| STORAGE / Warehouse storage | Actual compatible unit/area/volume/pallet and occupancy period | typed accepted goods and compatible environment; actual capacity and custody acceptance; period/minimum term and charge basis; receiving/picking/release scope. Enrol/request window, occupancy dates and billing periods remain distinct. Discovery or an approved known storage/handling component; actual unit capacity still requires acceptance. | Unit fit, accepted goods, period, price/quote basis, handling and access terms. Action: Choose the storage scope and request capacity acceptance. |

## Unified campaigns, type-specific fields, history and customer-app preview

### campaigns

One campaign directory for offers and Featured placement campaigns.

- tabs: Campaigns; History
- filters: campaign type; status; location; date
- typeSource: proposedPromotionTypes
- featuredTypeId: FEATURED
- creation: Create promotion opens one flow; select a supported type before its relevant fields. There is no separate Featured placements tab or directory.
- details: The selected type supplies its benefit or placement fields within the same detail/editor shell. Preview in app remains available in the selected campaign.

### featuredPlacements

Type-specific fields for a Featured placement campaign inside Campaigns; placement alone does not create a discount.

- container: campaigns
- separateNavigation: False
- displayFields: placement name and surface; actual offering/storefront and location scope; delivery dates; review/delivery state; confirmed fee/quote and separate charge state; optional linked benefit/rule reference
- actions: Submit the selected campaign's placement request through the common creation flow; Preview in app; View charges; Inspect review or pending-confirmation reason
- confirmation: A request, review approval, inventory hold, charge and confirmed placement are separate facts; only the actual owner can confirm each.
- previewMode: Use the selected public revision and channel/location/date context, including any independently eligible linked offer.

### history

Inspect ended/cancelled/rejected campaigns, their actual changes and saved public presentation.

- displayFields: campaign/type; actual period or requested period; terminal publication/review outcome; saved revision and terms; actor/time/change/reason; source-defined financial/results links
- actions: Preview in app; Choose saved revision; Duplicate as draft; View results or charges where supported
- previewMode: Archived presentation uses the saved public revision and historical date context. It is not current eligibility or a live offer.
- reuse: Duplication creates a new draft with new identity and current validation; it never restarts the archived campaign or copies a paid placement booking.

### customerAppPreview

Let a merchant inspect how the selected promotion/placement appears in the customer app before or after publication.

- entryPoints: campaign selected detail, including Featured placement type; creation/review; History selected revision
- modes: current; draft; scheduled; archived
- contextFields: actual offering/variant/options; app channel; location/service area; transaction and use dates where relevant; selected public revision and mode
- surfaces: discovery; offering_detail; transaction_review
- modelRuleSource: modelRules
- publicProjectionOnly: True
- allowsCommitment: False
- rule: Use actual public renderer, selected price/benefit/terms and model CTA. Navigation inside preview switches preview surfaces; it cannot order, book, pay, reserve, redeem or publish.
- archive: Archived mode uses the saved public representation and clearly states that the offer has ended; never substitute today's price or availability for historical values.
- failure: Unknown current source or incomplete saved representation produces an explicit unavailable/partial preview, not fabricated content or stale data presented as current.
- exit: Back returns to the originating tab, selection, filters and draft/revision context.
