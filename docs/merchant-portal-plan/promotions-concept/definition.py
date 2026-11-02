"""Canonical Promotions concept source. Design metadata, not runtime configuration."""

PROMOTION_TYPES = [
    dict(id="FEATURED", name="Featured placement", registryRef="PROMOTION_FEATURED_PLACEMENT_V1", stage="EXISTING_BASELINE_CONCEPT", purpose="Request actual discovery placement inventory with confirmed cost, timing and review; no ranking or result guarantee."),
    dict(id="AUTO_OFFER", name="Automatic offer", registryRef=None, stage="PROPOSED_CONTRACT", purpose="An approved percentage/fixed benefit on actual eligible priced components; use the existing rule/price owner, not a second price editor."),
    dict(id="CODE_OFFER", name="Code-based offer", registryRef=None, stage="PROPOSED_CONTRACT", purpose="An approved benefit with explicit code, redemption scope and limits, validated by its authoritative owner."),
    dict(id="PACKAGE_PLAN", name="Bundle or plan offer", registryRef=None, stage="PROPOSED_CONTRACT", purpose="A benefit on a real published bundle/plan, with contents, first-term versus renewal scope and redemption/booking terms."),
    dict(id="ENQUIRY_VISIBILITY", name="Enquiry campaign", registryRef=None, stage="PROPOSED_PRESENTATION_OF_FEATURED", purpose="Promote an actual quoted/provider/coordination service with its real request CTA; never invent a final checkout price.")
]

MODEL_RULES = {
    "ORDER": dict(label="Products, food and retail", unit="Actual item/variant, pack, weight or volume", qualifiers=["published actual item and compatible variants", "declared unit and authoritative price/stock", "applicable branch/channel/fulfilment", "optional approved minimum spend/quantity and limits"], dateMeaning="Purchase/redemption window; fulfilment windows only if the service actually supports them.", benefit="Approved priced item/component benefit; optional supported fulfilment benefit stays with its owner.", customer="Actual item/variant with relevant specification, original/selected price, saving and nearby terms.", cta="Choose eligible item and options", types=["FEATURED","AUTO_OFFER","CODE_OFFER","PACKAGE_PLAN"]),
    "APPOINTMENT": dict(label="Appointments", unit="Actual service, duration, provider and location", qualifiers=["eligible service/provider/method", "booking window distinct from service dates", "selected weekdays/time ranges", "actual shared resource availability"], dateMeaning="Book-by dates and service dates/times are independent; display both in Africa/Nairobi.", benefit="Approved service-price component; no capacity is created by a campaign.", customer="Service scope/duration, eligible date/time/location, selected price and actual available times.", cta="Choose an eligible appointment time", types=["FEATURED","AUTO_OFFER","CODE_OFFER","PACKAGE_PLAN"]),
    "FIELD_VISIT": dict(label="Customer-location visits", unit="Actual scoped package/workload, team time and service area", qualifiers=["actual coverage and travel feasibility", "known priced package or accepted assessment", "service window and resource eligibility", "private exact service address"], dateMeaning="Booking window and actual visit window/coverage are separate.", benefit="Only a known approved package/fee component; unknown workload uses a request offer.", customer="Scope, actual coverage, included supplies, price/estimate and supported request/visit action.", cta="Check coverage and choose or request a visit", types=["FEATURED","AUTO_OFFER","CODE_OFFER","ENQUIRY_VISIBILITY"]),
    "ASSET_INTERVAL": dict(label="Vehicle or asset rentals", unit="Actual asset/class and exact rental charge period", qualifiers=["guaranteed asset versus class", "minimum/maximum duration and eligible rate component", "pickup dates distinct from booking dates", "handover locations and joint driver allocation where needed"], dateMeaning="Book-by dates, qualifying pickup dates and rental start/end are separate; exact local-date/instant semantics remain intact.", benefit="Approved rental-rate component; deposits, cover, fuel or extras are treated according to explicit component rules, not blanket defaults.", customer="Vehicle/class specifications, duration qualification, selected interval total, saving, deposit and terms separately.", cta="Choose rental dates and options", types=["FEATURED","AUTO_OFFER","CODE_OFFER"]),
    "TRANSFER": dict(label="Transfers and greetings", unit="Actual route/service, party, vehicle or greeter", qualifiers=["eligible route and party capacity", "travel time and actual resource confirmation", "waiting/stops/parking inclusions", "greeter-only distinct from transport"], dateMeaning="Book-by window and actual trip/greeting dates are separate.", benefit="Known approved trip/greeting component; no fake final price for an unquoted route.", customer="Actual route/scope, seats/luggage or greeting terms, waiting, selected fare and extras.", cta="Choose the actual trip or greeting", types=["FEATURED","AUTO_OFFER","CODE_OFFER","ENQUIRY_VISIBILITY"]),
    "SESSION_CAPACITY": dict(label="Events, classes and sessions", unit="Actual dated occurrence, tier and place quantity", qualifiers=["specific occurrence and eligible tiers", "real shared place capacity", "quantity/admission constraints", "ticket issuance separate from reservation"], dateMeaning="Purchase window and actual session/admission dates are distinct.", benefit="Approved ticket/place-price component and real quantity limits.", customer="Actual event/class, occurrence, included admission, tier/quantity, selected price and entry terms.", cta="Choose an eligible occurrence and places", types=["FEATURED","AUTO_OFFER","CODE_OFFER","PACKAGE_PLAN"]),
    "SPACE_RESERVATION": dict(label="Tables and venue spaces", unit="Compatible space, party and occupancy", qualifiers=["explicit enabled space activity", "actual compatible party/space/time", "fee/minimum-spend scope", "occupancy and turnover constraints"], dateMeaning="Booking window and actual occupancy dates/times are separate.", benefit="Approved known fee/benefit only; a space reservation does not create a food order or unknown event quote.", customer="Space/party limits, actual time, fee/minimum spend and clear conditions.", cta="Choose a compatible space and time", types=["FEATURED","AUTO_OFFER","CODE_OFFER","ENQUIRY_VISIBILITY"]),
    "TOUR": dict(label="Tours and safari departures", unit="Actual departure, party format and supplier-confirmed inclusions", qualifiers=["published actual itinerary/departure", "private/shared party and supplier capacity", "named included/excluded components", "supplier price/confirmation and policy"], dateMeaning="Book-by dates and departure/travel dates are separate.", benefit="Approved priced departure/package component; supplier enquiry never becomes instant inventory.", customer="Itinerary, duration, party model, inclusions, selected price and supplier/cancellation terms.", cta="Choose an eligible departure or request confirmation", types=["FEATURED","AUTO_OFFER","CODE_OFFER","ENQUIRY_VISIBILITY"]),
    "PRODUCTION_DUE": dict(label="Custom production", unit="Accepted product specification and production commitment", qualifiers=["actual custom product/options and proof process", "scope and price agreement", "feasible due date/lead time", "accepted specification/policy version"], dateMeaning="Order-by window, proof/acceptance deadline and production due date are distinct.", benefit="A known approved component may be promoted; an unknown final custom quote cannot be advertised as a guaranteed discount total.", customer="Actual customizable item, allowed options, lead time, approval process and quote/known-fee benefit.", cta="Specify the work and request or obtain acceptance", types=["FEATURED","ENQUIRY_VISIBILITY"]),
    "REQUEST_QUOTE": dict(label="Quoted, professional and provider enquiries", unit="Actual enquiry/coordination scope and known fees only", qualifiers=["published supported service scope", "real provider or supplier authority", "approved content and applicable promotion policy", "no invented transaction/quote acceptance"], dateMeaning="Campaign/request period and requested work/travel dates are separate.", benefit="Discoverability/enquiry offer, or a separately approved known fee component. Never invent the final service price.", customer="Actual provider/service scope, known fee if any, terms and accurate enquiry CTA.", cta="Request a quote or contact the authorized provider", types=["FEATURED","ENQUIRY_VISIBILITY"]),
    "LINKED_WINDOWS": dict(label="Laundry and collection/return work", unit="Actual items/kg/workload and compatible paired promises", qualifiers=["declared processing unit and actual rate", "assessment/weight adjustment policy", "feasible collection and return", "care restrictions and scope acceptance"], dateMeaning="Campaign order window, collection window and feasible return promise remain distinct.", benefit="Approved unit/package component, revalidated after any accepted assessment adjustment.", customer="Accepted item/care scope, unit rate, offer, collection/return information and assessment terms.", cta="Choose processing and feasible collection/return", types=["FEATURED","AUTO_OFFER","CODE_OFFER"]),
    "SERVICE_JOB": dict(label="Workshop, diagnostics and repair", unit="Actual diagnostic or accepted job/parts/labour scope", qualifiers=["actual supported equipment/vehicle", "diagnostic fee distinct from final repair", "explicit parts/labour benefit component", "quote and additional-work acceptance"], dateMeaning="Campaign intake window and actual assessed work/turnaround are separate.", benefit="Known diagnostic or accepted work component only; no made-up final repair discount.", customer="Compatibility, diagnostic/job scope, known offer, exclusions and actual intake/assessment action.", cta="Request intake or accept the actual job quote", types=["FEATURED","ENQUIRY_VISIBILITY"]),
    "ENTITLEMENT": dict(label="Memberships, passes and supply plans", unit="Actual plan benefits, quantity, validity and redemption", qualifiers=["real plan and included benefits", "new enrolment versus renewal scope", "explicit recurring charge consent", "actual redemption/booking/fulfilment remains separate"], dateMeaning="Enrol-by window, benefit validity and each redemption/service date are distinct.", benefit="Approved first-term/enrolment or explicitly supported renewal component; no silent perpetual renewal discount.", customer="Included credits/access/deliveries, validity, selected term price, renewal and separate booking terms.", cta="Review the plan and enroll", types=["FEATURED","PACKAGE_PLAN","AUTO_OFFER","CODE_OFFER"]),
    "FREIGHT": dict(label="Sea, air and road freight", unit="Actual route, kg/m3/container/load and accepted cargo", qualifiers=["actual carrier route/load constraints", "per-piece dimensions/mass and approved calculation", "quote validity and actual accepted charges", "carrier/clearance/cover inclusions"], dateMeaning="Quote/campaign validity and actual cargo/shipping dates are separate.", benefit="Discovery or approved known/accepted tariff component; no universal cart minimum or invented volumetric divisor.", customer="Route/mode, charge basis, applicable benefit/quote, inclusions and private declaration path.", cta="Declare the shipment and request a carrier quote", types=["FEATURED","ENQUIRY_VISIBILITY"]),
    "STORAGE": dict(label="Warehouse storage", unit="Actual compatible unit/area/volume/pallet and occupancy period", qualifiers=["typed accepted goods and compatible environment", "actual capacity and custody acceptance", "period/minimum term and charge basis", "receiving/picking/release scope"], dateMeaning="Enrol/request window, occupancy dates and billing periods remain distinct.", benefit="Discovery or an approved known storage/handling component; actual unit capacity still requires acceptance.", customer="Unit fit, accepted goods, period, price/quote basis, handling and access terms.", cta="Choose the storage scope and request capacity acceptance", types=["FEATURED","ENQUIRY_VISIBILITY"])
}

CATEGORY_CONTEXT = {
    "adults_only": "Applicable restricted-product/service promotion policy, permitted content, packaging and actual eligibility checks; no policy inferred from seller answers.",
    "airport_transfers": "Actual airport/route, seats/luggage, travel window and greeter-versus-vehicle scope.",
    "alcohol_beverages": "Actual beverage/pack/ABV and applicable promotion/eligibility policy; non-alcoholic mixers are classified by their actual contents.",
    "fashion_apparel": "Actual garment/accessory and valid size/colour variants, chart version, correct image and branch stock; tailoring is not ready-stock retail.",
    "beauty": "Retail formulation/shade/pack benefits remain separate from service duration, artist/resource, venue/home method and preparation.",
    "vehicle_rentals": "Actual vehicle/class, rate period, duration, pickup/booking windows, handover, deposit/cover/extras and required driver allocation.",
    "experiences": "Actual event/session/space, occurrence/tier/place capacity, admission inclusions and supplier scope; a pass is not a dated reservation.",
    "financial_services": "Approved provider information/promotion scope and private provider handoff. No invented final fee, rate, approval or regulated transaction authority.",
    "flowers_gifts": "Actual arrangement/component quantities, substitutions, personalization and lead time; custom gifts/cakes retain proof and due-date acceptance.",
    "restaurants_food": "Actual dish/portion and required modifiers, service/fulfilment window and inclusions; table booking and catering remain distinct.",
    "groceries_essentials": "Actual SKU/pack/weighed quantity, storage condition, substitutions and stock; store identity is not product certification.",
    "laundry_cleaning": "Actual garment/kg/task/area scope, assessment and feasible paired windows or team visits; recurring plans do not confirm visits.",
    "marketplace": "Actual model/dimensions/material/compatibility and variants; installation, sourcing and custom production retain their respective flows.",
    "pharmacy": "Approved label/provider promotion and eligibility scope; no generated treatment/efficacy claims, dosage advice or seller-created verified status.",
    "health": "Approved actual service/provider content and promotion scope; no targeting based on inferred conditions and no public clinical/private intake content.",
    "tech_electronics": "Exact device/configuration/condition/compatibility, correct media and stock; repair/setup quotes remain separate from device sales.",
    "travel_tours": "Actual itinerary/departure/party and supplier inclusions; enquiry does not guarantee flight, lodging or tour inventory.",
    "vehicle_services": "Actual vehicle fitment and task, product versus fitting/diagnostic job, workshop/mobile method and known pricing components.",
    "wellness": "Actual session modality/duration/resources or plan benefits; take-home products, visits and class places retain their own models.",
    "concierge_services": "Actual coordination/execution/retainer scope and approved fees; private budget/preferences and supplier confirmation stay separate.",
    "logistics_shipping": "Actual mode/route and kg/m3/container or storage-unit/period basis, carrier quote validity, accepted cargo and custody/capacity requirements."
}

FIELD_GROUPS = {
    "identity": [
        ("name", "Promotion name", "text", "Always", "Campaign list and internal organization"),
        ("type", "Promotion type", "registered_type_reference", "Always", "Correct creation flow and customer presentation"),
        ("objective", "Objective", "enum", "When supported", "Internal goal; no guaranteed growth claim"),
        ("revision", "Campaign and rule revision", "reference", "System-owned", "Internal accepted-version reference")],
    "scope": [
        ("offerings", "Actual offering selection", "offering_reference_list", "For offering campaigns", "Customer card, detail and actual order/book/request CTA"),
        ("variants", "Qualifying variants/options/tiers", "reference_list", "When choices affect eligibility", "Actual selected options, image, price and availability"),
        ("locations", "Branches and supported service areas", "scoped_reference_list", "Always", "Where the offer is valid"),
        ("channels", "Eligible channels or placement", "enum_list", "Always", "Actual permitted discovery/storefront placement"),
        ("price_components", "Qualifying price components and unit", "pricing_component_reference_list", "For monetary offers", "Correct item/period/person/fee benefit basis")],
    "benefit": [
        ("rule", "Existing approved benefit/rule reference", "rule_reference", "For monetary offers", "One authoritative benefit definition, shared with Offerings"),
        ("kind", "Percentage or fixed benefit", "enum", "For supported monetary rules", "Clear customer saving"),
        ("value", "Benefit amount or percentage", "money_or_basis_points", "For supported monetary rules", "Saving and selected price"),
        ("maximum", "Maximum saving", "money", "When capped", "Visible cap near the offer"),
        ("minimum", "Minimum qualifying value/quantity/duration", "typed_qualification", "When applicable", "Visible qualification in actual units"),
        ("code", "Code and application method", "code_rule", "For code offers", "Customer code field or automatic-applied label"),
        ("stacking", "Combination and priority policy", "policy_reference", "Before enabling a monetary rule", "Whether other offers can combine"),
        ("exclusions", "Excluded components and items", "reference_list", "When applicable", "Clear exclusions before commitment")],
    "timing": [
        ("publish", "Campaign start/end", "offset_instants", "For timed campaigns", "Accurate public validity in Africa/Nairobi"),
        ("booking", "Book/order/enrol-by window", "date_or_instant_window", "When transaction timing qualifies", "When the customer must transact"),
        ("service", "Service/pickup/departure/occupancy window", "typed_window", "When fulfilment timing qualifies", "When the benefit can actually be used"),
        ("weekdays", "Eligible weekdays and time bands", "local_schedule", "When restricted", "Actual valid times with timezone"),
        ("blackouts", "Excluded dates or occurrences", "reference_or_date_list", "When applicable", "Visible excluded dates/occurrences")],
    "audience": [
        ("eligibility", "Approved customer eligibility rule", "policy_reference", "Always", "Actual applicable conditions without sensitive inference"),
        ("usage", "Per-customer and campaign redemption limits", "limit_policy", "When limited", "Relevant customer usage conditions"),
        ("consent", "Channel consent and permitted targeting", "consent_policy_reference", "For marketing delivery", "Only authorized delivery/audience scope")],
    "creative": [
        ("headline", "Customer headline", "text", "When the channel needs creative", "Offer card/title"),
        ("media", "Actual offering/variant media", "media_reference", "When the channel uses imagery", "Accurate product/service image"),
        ("copy", "Benefit description and terms summary", "text", "Always", "Plain customer explanation and conditions"),
        ("terms", "Full applicable terms version", "policy_reference", "Always", "Detail/review terms before commitment"),
        ("cta", "Order, book, reserve, enroll or enquire action", "actual_model_action_reference", "Always", "Supported actual customer journey")],
    "funding": [
        ("funder", "Who funds the benefit", "owner_reference", "For monetary offers", "Merchant cost and applicable customer disclosure"),
        ("budget", "Enforceable spending/redemption envelope", "money_and_count_limits", "When capped", "Internal cost controls; no false enforceability claim"),
        ("charge", "Placement or campaign charge basis", "confirmed_quote_reference", "For paid placements", "Merchant review before accepting a charge"),
        ("reservation", "Budget/redemption hold and release policy", "owner_policy_reference", "Where enforcement requires holds", "Internal authoritative limit enforcement")],
    "placement": [
        ("inventory", "Actual placement/date/location inventory", "inventory_reference", "For Featured placements", "Actual requested placement; no guaranteed ranking"),
        ("hold", "Placement hold and expiry", "hold_reference", "If supported", "Merchant pending/confirmed placement state")],
    "operations": [
        ("review", "Content/policy review outcome", "owner_review_state", "When review is required", "Merchant changes requested or approved state"),
        ("delivery", "Eligibility and delivery status/reasons", "owner_projection", "Always", "Actual active/limited/blocked availability"),
        ("history", "Actor, changes, versions and effective time", "audit_reference", "Always", "Authorized change history"),
        ("source", "Source freshness and edit authority", "source_reference", "Always", "Merchant conflict/recovery state"),
        ("results", "Measured campaign results and definitions", "measurement_reference", "When data exists", "Actual period/coverage; unknown is not zero")]
}

FLOW = [
    dict(id="PR_SCOPE", title="Choose objective and promotion type", outcome="Only capability/policy-supported types can continue; retain draft context."),
    dict(id="PR_ELIGIBILITY", title="Choose actual offerings and locations", outcome="Show eligible, excluded and unresolved candidates with reasons and links to their owner."),
    dict(id="PR_RULE", title="Configure the approved benefit or placement", outcome="Reference actual priced components, units, limits, stacking and source authority; no base-price duplication."),
    dict(id="PR_TIME", title="Set timing and customer conditions", outcome="Separate transaction window from actual service/pickup/departure/redemption dates and show material terms."),
    dict(id="PR_FUNDING", title="Review funding, inventory and cost", outcome="Known authorized fee/benefit owner and enforceable caps; unsupported or unknown terms remain unresolved."),
    dict(id="PR_PREVIEW", title="Preview the actual customer journey", outcome="Correct media/specification/price/terms/CTA for the selected offering, variant and date context."),
    dict(id="PR_SUBMIT", title="Save, validate and submit", outcome="Versioned owner command with required review; pending remains pending and timeout remains unknown."),
    dict(id="PR_DELIVER", title="Schedule, activate and manage", outcome="Owner-confirmed states, permitted edit/pause/resume/end actions and explicit eligibility loss behavior."),
    dict(id="PR_REDEEM", title="Validate at transaction acceptance", outcome="Owner rechecks actual selected item/time/quantity, price, eligibility and limits; accepted terms are snapshotted."),
    dict(id="PR_RESULTS", title="Inspect measured results and recover", outcome="Actual confirmed redemptions, funded amounts and source-defined metrics with coverage; reconcile failures without duplicate spend.")
]

STATE_DIMENSIONS = {
    "publication": ["draft", "pending_publish", "scheduled", "active", "paused", "ended", "cancelled"],
    "review": ["not_required", "not_submitted", "pending", "approved", "changes_requested", "rejected"],
    "delivery": ["eligible", "limited", "blocked", "unknown"],
    "measurement": ["current", "partial", "unavailable"],
    "placement_or_charge": ["not_applicable", "requested", "held", "confirmed", "unknown", "failed"]
}

IMAGE_BRIEFS = [
    dict(id="PROMO_01", file="01-campaign-overview.png", title="Unified campaigns", model="ORDER", state="All campaign types in one list; active product campaign selected", requirements=["reference shell with Promotions selected", "only Campaigns and History page tabs", "single list for offers and Featured placement campaigns", "type and status filters", "actual product/variant scope", "clear benefit, funding and terms", "customer card and Preview in app", "an actionable eligibility issue", "no page-level status totals", "sample-data label"]),
    dict(id="PROMO_02", file="02-service-offer-creation.png", title="Create a service offer", model="APPOINTMENT", state="Draft before review", requirements=["same reference shell", "service/duration/location and actual rate", "booking window distinct from service window", "weekday/time restrictions and source capacity", "customer price/terms preview", "merchant-funded cost and redemption limit", "Save draft and Review promotion", "sample-data label"]),
    dict(id="PROMO_03", file="03-rental-campaign-results.png", title="Rental campaign management", model="ASSET_INTERVAL", state="Active rental campaign and actual result definitions", requirements=["same reference shell", "vehicle/class, rental-day basis and minimum duration", "booking dates distinct from pickup dates", "accurate selected interval price breakdown", "deposit separate from discount", "eligible/excluded scope and reasons", "confirmed redemption/cost results", "pause/edit and history", "sample-data label"]),
    dict(id="PROMO_05", file="05-promotion-history.png", title="Promotion history", model="ORDER", state="Ended campaign and saved public revision", requirements=["only Campaigns and History page tabs", "same revised shell without page-level status summary", "History tab selected", "search and ended/cancelled/rejected filters", "archived campaign terms and revision", "actor/time/change timeline", "Preview in app opens historical mode", "Duplicate as draft revalidates current scope", "sample-data label"]),
    dict(id="PROMO_06", file="06-customer-app-preview.png", title="Preview in the customer app", model="ORDER", state="Merchant preview showing discovery and offering detail", requirements=["same revised merchant shell", "Preview in app destination with Back to Campaigns for a current campaign", "current/draft/scheduled/archived context is explicit", "location/channel/date and revision context", "discovery sponsored card and offering detail", "actual public specification/price/terms/CTA", "no real order, publication or allocation", "sample-data label"])
]

SURFACE_CONTRACTS = {
    "campaigns": dict(
        purpose="One campaign directory for offers and Featured placement campaigns.",
        tabs=["Campaigns", "History"],
        filters=["campaign type", "status", "location", "date"],
        typeSource="proposedPromotionTypes",
        featuredTypeId="FEATURED",
        creation="Create promotion opens one flow; select a supported type before its relevant fields. There is no separate Featured placements tab or directory.",
        details="The selected type supplies its benefit or placement fields within the same detail/editor shell. Preview in app remains available in the selected campaign.",
        runtimeEnabled=False),
    "featuredPlacements": dict(
        purpose="Type-specific fields for a Featured placement campaign inside Campaigns; placement alone does not create a discount.",
        container="campaigns",
        separateNavigation=False,
        displayFields=["placement name and surface", "actual offering/storefront and location scope", "delivery dates", "review/delivery state", "confirmed fee/quote and separate charge state", "optional linked benefit/rule reference"],
        actions=["Submit the selected campaign's placement request through the common creation flow", "Preview in app", "View charges", "Inspect review or pending-confirmation reason"],
        confirmation="A request, review approval, inventory hold, charge and confirmed placement are separate facts; only the actual owner can confirm each.",
        previewMode="Use the selected public revision and channel/location/date context, including any independently eligible linked offer.",
        runtimeEnabled=False),
    "history": dict(
        purpose="Inspect ended/cancelled/rejected campaigns, their actual changes and saved public presentation.",
        displayFields=["campaign/type", "actual period or requested period", "terminal publication/review outcome", "saved revision and terms", "actor/time/change/reason", "source-defined financial/results links"],
        actions=["Preview in app", "Choose saved revision", "Duplicate as draft", "View results or charges where supported"],
        previewMode="Archived presentation uses the saved public revision and historical date context. It is not current eligibility or a live offer.",
        reuse="Duplication creates a new draft with new identity and current validation; it never restarts the archived campaign or copies a paid placement booking.",
        runtimeEnabled=False),
    "customerAppPreview": dict(
        purpose="Let a merchant inspect how the selected promotion/placement appears in the customer app before or after publication.",
        entryPoints=["campaign selected detail, including Featured placement type", "creation/review", "History selected revision"],
        modes=["current", "draft", "scheduled", "archived"],
        contextFields=["actual offering/variant/options", "app channel", "location/service area", "transaction and use dates where relevant", "selected public revision and mode"],
        surfaces=["discovery", "offering_detail", "transaction_review"],
        modelRuleSource="modelRules",
        publicProjectionOnly=True,
        allowsCommitment=False,
        rule="Use actual public renderer, selected price/benefit/terms and model CTA. Navigation inside preview switches preview surfaces; it cannot order, book, pay, reserve, redeem or publish.",
        archive="Archived mode uses the saved public representation and clearly states that the offer has ended; never substitute today's price or availability for historical values.",
        failure="Unknown current source or incomplete saved representation produces an explicit unavailable/partial preview, not fabricated content or stale data presented as current.",
        exit="Back returns to the originating tab, selection, filters and draft/revision context.",
        runtimeEnabled=False)
}

SAMPLE_CHECKS = [
    dict(id="retail", basisMinor=240000, percentageBps=1000, capMinor=50000, minimumMinor=150000, expectedSavingMinor=24000, expectedPayableMinor=216000),
    dict(id="service", basisMinor=400000, percentageBps=1500, capMinor=60000, minimumMinor=0, expectedSavingMinor=60000, expectedPayableMinor=340000),
    dict(id="rental", basisMinor=1800000, percentageBps=1000, capMinor=300000, minimumMinor=0, expectedSavingMinor=180000, expectedPayableMinor=1620000),
    dict(id="cap", basisMinor=6000000, percentageBps=1000, capMinor=300000, minimumMinor=0, expectedSavingMinor=300000, expectedPayableMinor=5700000),
    dict(id="below_minimum", basisMinor=100000, percentageBps=1000, capMinor=50000, minimumMinor=150000, expectedSavingMinor=0, expectedPayableMinor=100000)
]

# Monetary eligibility follows an actual approved priced component, not the merchant category.
for model_id, rule in MODEL_RULES.items():
    rule["monetaryScopeCondition"] = "An actual known approved price component, benefit contract, funding/stacking policy and current authority are required. Never discount an unknown final quote."
    if model_id in ("PRODUCTION_DUE", "REQUEST_QUOTE", "SERVICE_JOB", "FREIGHT", "STORAGE"):
        rule["types"] = list(dict.fromkeys(rule["types"] + ["AUTO_OFFER", "CODE_OFFER"]))
        rule["defaultForUnknownPrice"] = ["FEATURED", "ENQUIRY_VISIBILITY"]
