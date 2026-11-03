"""Generate planning-only coverage from the exact audited 128 specialties.

Writes only coverage-128.json and coverage-128.md beside this script. No app,
database, provider or old profile records are changed. Curated specialty needs
and corrections below are product design decisions, not executed rules.
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLAN = HERE.parent
AUDIT = PLAN.parent / "audits" / "merchant-onboarding-128-taxonomy.json"
PROFILES = PLAN / "profiles-128.json"

WORKFLOW_MODEL = {
    "WF_ORDER": "ORDER", "WF_MADE_TO_ORDER": "PRODUCTION_DUE",
    "WF_APPOINTMENT": "APPOINTMENT", "WF_REMOTE_SESSION": "APPOINTMENT",
    "WF_FIELD_SERVICE": "FIELD_VISIT", "WF_RENTAL": "ASSET_INTERVAL",
    "WF_TRANSFER": "TRANSFER", "WF_EVENT_SESSION": "SESSION_CAPACITY",
    "WF_GROUP_ACTIVITY": "SESSION_CAPACITY", "WF_TOUR": "TOUR",
    "WF_REQUEST_QUOTE": "REQUEST_QUOTE", "WF_PICKUP_RETURN": "LINKED_WINDOWS",
    "WF_MEMBERSHIP": "ENTITLEMENT", "WF_FREIGHT": "FREIGHT",
    "WF_STORAGE": "STORAGE", "WF_REGULATED_ENQUIRY": "REQUEST_QUOTE",
    "WF_SERVICE_JOB": "SERVICE_JOB",
}

SETUP = {
    "ORDER": ["confirmed_offering_and_publication", "declared_inventory_authority", "price_and_quantity_units", "selected_fulfilment_methods", "promised_window_only_if_explicitly_enabled"],
    "APPOINTMENT": ["scheduled_booking_enabled", "exact_duration_minutes", "eligible_staff_room_equipment", "resource_schedule", "buffers_and_lead_time", "in_person_remote_or_home_method"],
    "FIELD_VISIT": ["exact_visit_duration", "eligible_team_and_equipment", "service_area", "customer_address", "travel_buffer_policy", "field_or_fixed_location_selection"],
    "ASSET_INTERVAL": ["individual_asset_or_declared_pool", "exact_start_end_interval", "handover_and_return_policy", "turnaround_and_maintenance_blocks", "deposit_and_price_policy", "asset_eligibility"],
    "TRANSFER": ["pickup_dropoff", "pickup_instant", "trip_occupancy_and_buffers", "eligible_vehicle_driver_or_greeter", "passenger_luggage_capacity", "waiting_and_change_policy"],
    "SESSION_CAPACITY": ["dated_session", "exact_start_end", "place_quantity_unit", "session_capacity", "eligible_session_resources", "booking_window_and_ticket_policy"],
    "SPACE_RESERVATION": ["table_or_space_inventory", "party_size", "compatible_space_and_combination_policy", "exact_reservation_interval", "turnover_buffer", "host_approval_policy"],
    "TOUR": ["dated_departure_or_private_itinerary", "guest_quantity", "guide_vehicle_and_equipment_requirements", "multi_day_local_dates_if_applicable", "supplier_confirmation_boundary", "private_shared_capacity_policy"],
    "PRODUCTION_DUE": ["accepted_specification", "approval_policy", "exact_lead_time_and_cutoff", "production_capacity_unit", "due_local_date_or_exact_instant", "fulfilment_window"],
    "REQUEST_QUOTE": ["request_scope", "responsible_provider_or_team", "response_target_without_capacity_guarantee", "quote_and_acceptance_policy", "authority_before_commitment"],
    "LINKED_WINDOWS": ["dropoff_or_collection_method", "collection_window", "processing_turnaround", "return_window", "processing_quantity_unit", "transport_resource_policy_when_offered"],
    "SERVICE_JOB": ["intake_method", "assessment_and_approval_policy", "workshop_staff_bay_or_equipment", "scheduled_or_queue_mode", "job_duration_or_estimate_distinction", "completion_and_collection_policy"],
    "ENTITLEMENT": ["explicit_commercial_plan", "included_scope_and_units", "validity_local_dates", "usage_and_renewal_policy", "separate_bookable_services", "entitlement_owner"],
    "FREIGHT": ["shipment_scope_and_measured_quantity", "legs_and_responsible_carriers", "cutoffs_and_milestone_windows", "declared_carrier_capacity_authority", "quote_acceptance", "loading_and_delivery_constraints"],
    "STORAGE": ["storage_unit_or_measured_pool", "area_volume_or_unit_measure", "occupancy_interval", "compatible_goods_and_access_windows", "capacity_authority", "unit_conversion_and_billing_policy"],
}

VIEW = {
    "ORDER": "Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid",
    "APPOINTMENT": "Day/week staff-resource calendar plus agenda and booking detail",
    "FIELD_VISIT": "Team visit agenda and resource calendar with service location and travel constraints",
    "ASSET_INTERVAL": "Asset-by-date interval timeline with handover, return and maintenance",
    "TRANSFER": "Pickup agenda and vehicle/driver resource lanes with trip and waiting intervals",
    "SESSION_CAPACITY": "Dated session list/calendar with held, confirmed and remaining places",
    "SPACE_RESERVATION": "Host agenda and table/space lanes with party size and turnover",
    "TOUR": "Departure-capacity calendar and multi-day itinerary/resource agenda",
    "PRODUCTION_DUE": "Specification/approval work queue and production due-date/capacity view",
    "REQUEST_QUOTE": "Request/quote work queue and response milestones; tentative dates clearly labelled",
    "LINKED_WINDOWS": "Linked collection, processing and return agenda with separate commitments",
    "SERVICE_JOB": "Intake/assessment/workshop queue with optional scheduled bay/resource agenda",
    "ENTITLEMENT": "Plan/usage/renewal view linked to separately reserved sessions",
    "FREIGHT": "Shipment-leg and cutoff/milestone agenda with carrier confirmation state",
    "STORAGE": "Storage occupancy timeline with measured capacity and access-window agenda",
}

# Every audited ID has a specific operational statement. This prevents the
# generated register from merely repeating a generic model name 128 times.
SPECIALTY_NEEDS = {
    "adult_products": "Discreet packaged goods with age-check and signature policy; product selection and delivery are orders, not appointments.",
    "adult_wellness": "Clarify whether each offering is a product, a booked wellness service or a home visit; preserve discreet event summaries.",
    "cigarettes": "Licensed age-restricted tobacco orders with declared brands and minimum order; do not expose product detail in unrelated calendar views.",
    "cigars": "Licensed age-restricted cigar orders with gift packaging; packaging does not create a bookable service.",
    "vapes": "Device-type variants, license and age-check policy; order availability comes from inventory rather than empty calendar slots.",
    "adult_accessories": "Discreet accessory orders with signature policy; generic delivery milestones need no personal appointment.",
    "airport_pickup": "Scheduled airport arrival pickup, passenger/luggage fit, flight-change policy and joint vehicle/driver occupancy.",
    "airport_dropoff": "Scheduled airport drop-off with passenger pickup address, airport arrival target and feasible vehicle/driver interval.",
    "meet_greet": "Greeter, signage and waiting interval; explicitly distinguish greeter-only assistance from an included vehicle transfer.",
    "executive_transfer": "Executive-class vehicle eligibility, driver, pickup, waiting and corporate billing; flight tracking only where enabled.",
    "wine": "Wine origin, age/license eligibility and cold/gift handling; scheduled delivery is explicitly offered, not automatic.",
    "spirits": "Brand variants, licensed age-eligible order and gift wrapping; no appointment is inferred from corporate or gift demand.",
    "beer": "Cold delivery and returnable-bottle handling attached to an order; bottle return does not become asset rental.",
    "champagne": "Occasion-specific cold/gift handling and dated delivery promise only when the merchant accepts that promise.",
    "cocktail_mixers": "Packaged mixer orders and minimum quantity with configured eligibility and gift packaging.",
    "liquor_stores": "Retail alcohol order, cold handling and corporate billing; store opening hours do not guarantee stock or delivery capacity.",
    "mens_fashion": "Size/brand retail with separately enabled tailoring production and style consultation appointments.",
    "womens_fashion": "Size/brand retail, custom tailoring and style consultations as distinct activities sharing configured staff where relevant.",
    "kids_fashion": "Age/size retail and school uniform offering details; uniforms do not automatically imply custom production or fittings.",
    "shoes": "Shoe-size-system variants and retail returns; no fitting appointment unless an actual bookable service is added.",
    "bags": "Authenticity/warranty declarations and bag inventory; product checks are not staff-time reservations.",
    "watches": "Watch inventory and declared warranty/authenticity; repair or valuation services require a separately configured activity.",
    "accessories": "Fashion accessory inventory, physical-store collection if offered and return policies; no default appointment calendar.",
    "makeup": "Artist eligibility, exact makeup duration, bridal/event package resources and home travel; product sales remain a separate order activity.",
    "skincare": "Distinguish skincare products from routine consultations and home services; merchant-declared skin suitability is not clinical verification.",
    "haircare": "Stylist/chair/service-duration resources, walk-in versus booked intake and home visits; product retail can coexist.",
    "fragrances": "Fragrance-family retail with gift wrapping; products_for_sale=no requires offering clarification rather than an invented appointment.",
    "cosmetics_stores": "Own/multiple brands, physical store and minimum-order retail; cosmetics inventory is separate from appointment capacity.",
    "car_rental": "Individual rental asset, exact start/end and return condition, fuel/deposit/insurance policy and optional qualified driver allocation.",
    "self_drive": "Exclusive self-drive vehicle interval with age eligibility, fuel/deposit terms, handover, return and maintenance blocks.",
    "corporate_rental": "Corporate vehicle occupancy independent of billing cycle; dedicated account manager is not automatically a bookable driver.",
    "long_term_rental": "Long occupancy intervals, extension conflict checks, maintenance and agreed return; billing periods do not reset vehicle capacity.",
    "bike_rental": "Bike-type/asset interval and return; if driver service is genuinely offered, allocate its qualified rider without creating an airport transfer.",
    "concerts": "Dated ticket/session places, VIP inventory where configured and ticket delivery; attendee bands are not actual remaining seats.",
    "festivals": "Dated festival admission inventory and optional multi-day passes; a pass entitlement and each controlled session's capacity stay explicit.",
    "conferences": "Conference session/admission capacity plus venue, AV and catering dependencies under their actual owners.",
    "private_events": "Requested date/headcount and venue/planning scope; bind actual venue/team capacity only after quote and supplier acceptance.",
    "photography": "Photographer/equipment interval, exact session duration and group limit; travel/home location only when selected.",
    "workshops": "Dated workshop capacity, facilitator/equipment and duration; walk-in admissions still consume the same session pool.",
    "classes": "Dated class places and recurring occurrences; recurrence does not create a paid membership or renewal contract.",
    "sports_activities": "Session participant capacity and required instructor/equipment/space; repeated sessions and membership are distinct.",
    "recreation": "Dated recreation activity capacity and equipment with booking window; walk-ins require a live capacity check.",
    "banking": "Administrative banking enquiry or explicitly offered consultation; calendar confirmation does not approve an account, loan or funds movement.",
    "forex": "Currency-service enquiry and optional staff consultation; a time reservation never locks an exchange rate or currency inventory.",
    "insurance": "Insurance enquiry/provider appointment where offered; no calendar event binds cover or underwriting approval.",
    "payments": "Payment-service enquiry or handoff; this booking module does not reserve financial balances or operate payment rails.",
    "remittance": "Corridor/provider enquiry and optional appointment; transfer acceptance and compliance remain with the authorized provider.",
    "sacco_services": "SACCO-service administrative request and optional local office consultation; financial entitlement is not calendar capacity.",
    "business_services": "Declared financial/business-service enquiry; classify an actual offered consultation explicitly before booking staff time.",
    "flowers": "Fresh/preserved bouquets, custom message and accepted delivery date; recurring bouquet orders do not imply membership billing.",
    "gift_hampers": "Hamper order and gift message; custom curation can require approved specification and production lead time.",
    "cakes": "Accepted cake design, dietary specification, exact advance cutoff and production/delivery promise; design approval precedes commitment where required.",
    "chocolates": "Gift-wrapped chocolate order, message and delivery promise if offered; no appointment resource is allocated.",
    "personalized_gifts": "Approved personalization and due date with production capacity and corporate quantity; preserve specification revisions.",
    "occasion_gifts": "Occasion/message/gift wrapping order with optional promised delivery date; occasion alone is not a reservation.",
    "restaurant": "Food orders plus separately enabled table reservations with party size, table compatibility, dining interval and turnover.",
    "fast_food": "Food preparation/collection/delivery promise with drive-through or family-meal variants; no table reservation is inferred.",
    "cafe": "Food/drink order; seated_capacity or coworking_space does not enable a seat/desk booking without an explicit offering.",
    "bakery": "Standard bakery orders and explicitly custom production with exact advance cutoff and fulfilment promise.",
    "desserts": "Dessert inventory or custom accepted specification, dietary detail and production promise; distinguish stock from made-to-order.",
    "juice_bar": "Drink/food orders; detox_programs describes an offering and does not automatically create clinical sessions or subscriptions.",
    "cloud_kitchen": "Brand/menu preparation and delivery; collection windows apply only when pickup is offered and exact capacity is configured.",
    "catering": "Requested headcount/menu/date, staffing and equipment scope; quote approval links production and event resources without duplicate charges.",
    "supermarket": "Stock-owned grocery orders; delivery/collection windows and express cutoffs only when explicitly configured.",
    "convenience_store": "Retail essentials and optional express fulfilment; 24-hour opening does not mean continuous free delivery capacity.",
    "fresh_produce": "Perishable quantity orders, market dates and optionally recurring boxes; recurring fulfilment and membership are separate.",
    "butchery": "Measured cut order and advance preparation cutoff; custom cuts require accepted quantity/specification, not a customer appointment.",
    "seafood": "Measured seafood inventory and processing/handling promise; live or onsite processing facts do not establish free processing capacity.",
    "organic_store": "Retail organic/store packaging attributes and optional configured fulfilment windows; no booking activity is inferred.",
    "laundry": "Measured laundry intake, collection or customer drop-off, processing turnaround and independently feasible return window.",
    "dry_cleaning": "Garment-type/item intake, processing turnaround and linked collection/return commitments under their actual capacity owners.",
    "ironing": "Item-based ironing intake and processing promise; transport legs only when pickup/delivery is offered.",
    "home_cleaning": "Household visit duration, eligible crew/equipment, customer address/service area and travel; recurrence separate from paid subscription.",
    "office_cleaning": "Office visit crew/hours and site constraints, equipment and travel; recurring schedules remain actual dated commitments.",
    "home_living": "New/used household retail with fragile handling and return policy; delivery promises require actual owner acceptance.",
    "furniture": "Furniture retail and optional installation visit linked to selected order/method; installer time is not implied for every product.",
    "appliances": "Appliance inventory and warranty with optional installer/equipment visit; delivery and installation have distinct feasible times.",
    "decor": "Decor retail, condition and fragile/gift handling; no venue/styling appointment is inferred from category name.",
    "kitchenware": "New/used kitchenware order and return policy, with optional configured fulfilment window.",
    "books": "Book inventory and special sourcing/custom request; clarify whether custom_orders means sourcing or genuine production.",
    "stationery": "Stationery retail, minimum quantity and corporate billing; corporate account status does not allocate time capacity.",
    "office_supplies": "Office supply quantities, minimum order and corporate billing; scheduled replenishment needs explicit configuration.",
    "general_retail": "Declared product, condition and stock authority with optional delivery/collection promise; no generic appointment fallback.",
    "pharmacy_retail": "Pharmacy order and declared pharmacist/cold-chain/prescription fulfilment gates; do not put prescription details in calendar titles.",
    "medical_supplies": "Medical supply quantities and corporate order terms; supply sales do not create patient appointments.",
    "baby_products": "Baby-product retail and optional recurring order plan; entitlement/billing is distinct from recurring delivery.",
    "supplements": "Supplement inventory and authenticity declarations; no clinical consultation is inferred.",
    "clinics": "Administrative clinic slot with eligible staff/room; explicitly distinguish appointment booking, walk-in queue and home visit.",
    "telemedicine": "Eligible remote provider/time interval and session access readiness; no clinical record or clinical outcome in booking/calendar data.",
    "labs": "Administrative lab/sample collection appointment or home collection; result turnaround is a separate administrative milestone, not a reserved session.",
    "mental_health": "Private administrative therapy slot with exact duration and selected online/in-person method; minimize sensitive calendar summaries.",
    "coaching": "Coach duration and online/in-person method, with separately configured group session capacity where offered.",
    "smartphones": "Device retail plus explicitly selected repair intake or trade-in assessment with separate quote/approval and device privacy policy.",
    "tech_accessories": "Tech accessory inventory, warranty and minimum quantity; no installation/repair booking unless separately offered.",
    "computers": "Computer inventory plus selected repair intake/assessment, exact workshop or appointment policy and device access consent.",
    "gaming": "Console/game/accessory inventory including pre-owned condition; category does not imply gaming-seat sessions.",
    "audio": "Audio product inventory, warranty and return policy; demonstration or installation requires an explicit extra service.",
    "telecom_services": "Service intake and provider job requirements; device/accessory sales can coexist without becoming service appointments.",
    "smart_devices": "Smart-device retail and optional selected installer visit with eligible staff/equipment and service area.",
    "safaris": "Dated departure or private multi-day itinerary, guest places and guide/vehicle allocations; accommodation confirmations remain with supplier owner.",
    "game_drives": "Dated drive departure/occupancy, guest capacity, guide and private/shared vehicle policy with exact booking window.",
    "luxury_safaris": "Multi-day private/shared itinerary and guest/resource capacity; luxury/accommodation claims do not prove supplier availability.",
    "city_tours": "Tour mode, language-capable guide, exact duration and dated guest places; resources depend on walking/cycling/vehicle offering.",
    "cultural_tours": "Dated guide/language/mode and guest group capacity; third-party access or venue confirmation is explicit.",
    "adventure_tours": "Dated guest capacity and eligible guide/equipment/mode; equipment_provided does not identify actual available equipment.",
    "travel_packages": "Accepted itinerary/quote and third-party flight/accommodation confirmations; included flight never implies NEXG seat inventory.",
    "car_wash": "Selected wash duration, bay/team and queue or appointment; mobile wash adds travel, and plan entitlement does not reserve a wash slot.",
    "tire_service": "Workshop bay/technician job or mobile callout, with emergency response policy and compatible tire inventory kept separate.",
    "battery_service": "Mobile team/callout or merchant-location workshop selected explicitly; battery stock and staff dispatch are separate owners.",
    "vehicle_assistance": "Assistance type, response area and dispatched crew/vehicle; estimated arrival is not a guaranteed future appointment slot.",
    "vehicle_inspection": "Exact inspection duration and eligible inspector/bay/equipment; mobile inspection adds customer location and travel.",
    "spa": "Service duration and compatible practitioner/room; couples package may require simultaneous linked resources and membership is separate.",
    "massage": "Therapist/room duration and home travel where selected; couples treatment must allocate every required practitioner together.",
    "gym": "Membership validity and usage rules; opening hours do not reserve trainer/equipment, and personal training sessions are separately booked.",
    "personal_training": "Trainer duration and chosen gym/client/online location; group places and travel dependencies only for enabled methods.",
    "reservations": "Concierge request for a venue reservation; external venue acceptance/reference is needed before confirming it to the customer.",
    "personal_assistance": "Accepted assistance scope and response commitment; account manager or retainer does not reserve unlimited staff time.",
    "shopping_assistance": "Accepted shopping scope, provider/runner and completion promise; purchased-goods inventory is not NEXG calendar capacity.",
    "gift_sourcing": "Gift specification, supplier sourcing and accepted due date; wrapping and corporate scope do not guarantee supplier stock.",
    "travel_planning": "Travel-planning enquiry, agreed itinerary work and supplier handoffs; visa/insurance assistance does not mean approval.",
    "property_coordination": "Accepted coordination scope and planned visits/provider confirmations; coverage and 24-hour response do not guarantee free staff.",
    "moving_assistance": "Accepted move volume/date/address, crew/vehicle/equipment and travel; actual allocations follow quote acceptance.",
    "cleaning_coordination": "Accepted cleaning scope and third-party or own-team confirmation; recurring requests need actual provider capacity per occurrence.",
    "vip_assistance": "Accepted VIP scope, responsible provider and retainer rules; priority/24-hour availability is not unlimited bookable capacity.",
    "sea_freight": "Shipment quantity/container/CBM/weight, carrier leg, port/cutoff and optional road transport; carrier acceptance owns vessel capacity.",
    "air_freight": "Weight/volume shipment, carrier acceptance, customs and airport/warehouse legs; do not confuse quoted transit duration with a reserved flight.",
    "road_freight": "Measured load, compatible truck/driver and accepted pickup/delivery windows; fleet-size bands are not individual truck capacity.",
    "warehousing": "Unit/area/volume occupancy across dates, compatible goods and access windows; explicit sqm/sqft conversion and owner-confirmed remaining capacity.",
}

CORRECTIONS = {
    "adult_wellness": ["Product versus service model is unresolved until the actual offering is declared; home_service alone must not create work."],
    "meet_greet": ["Clarify greeter-only versus included transport; do not reserve an unnecessary vehicle."],
    "makeup": ["booking_required=no does not prove scheduled booking is unavailable; ask whether optional bookings are offered."],
    "haircare": ["booking_required=no does not prove scheduled booking is unavailable; preserve optional appointments when explicitly offered."],
    "photography": ["booking_required=no does not justify deleting optional scheduled sessions."],
    "classes": ["Recurring sessions are recurrence, not automatic membership or plan renewal."],
    "sports_activities": ["Recurring sessions do not automatically create paid membership/renewal capability."],
    "flowers": ["Recurring bouquet orders do not automatically create membership entitlement or renewal billing."],
    "restaurant": ["reservation_system discovers an existing system only and cannot activate table booking. Require bookingSetup.offers_table_reservations plus validated authority, tables/party compatibility and turnover; use SPACE_RESERVATION rather than generic appointment behavior."],
    "cafe": ["seated_capacity and coworking_space do not enable seat/desk reservations by themselves."],
    "fresh_produce": ["Subscription boxes need repeated-order/fulfilment rules; paid membership is a separate explicit commercial plan."],
    "home_cleaning": ["Recurring visit pattern and commercial subscription/renewal are separate; each occurrence must have capacity."],
    "office_cleaning": ["Recurring visit pattern and commercial subscription/renewal are separate; each occurrence must have capacity."],
    "books": ["custom_orders can mean special sourcing; clarify before enabling PRODUCTION_DUE."],
    "baby_products": ["subscription_available does not alone establish membership entitlement, renewal price or recurring reserved delivery."],
    "clinics": ["appointment_booking=no must not retain an instant appointment claim merely because the base workflow is WF_APPOINTMENT."],
    "car_wash": ["subscription_plans requires explicit entitlement/billing scope; a plan does not reserve a bay or staff time."],
    "battery_service": ["mobile_service=no selects workshop service rather than dispatch; stock and staff availability stay separate."],
    "gym": ["Gym membership and 24-hour opening do not imply personal trainer or equipment availability."],
    "cleaning_coordination": ["recurring_sub does not automatically establish membership or control a third-party cleaner's capacity."],
}


def condition(model: str, trigger: str, extra: list[str] | None = None) -> dict:
    return {"modelId": model, "trigger": trigger,
            "requiredSetup": list(dict.fromkeys(SETUP[model] + (extra or [])))}


def conditional_models(p: dict) -> list[dict]:
    sid = p["subcategoryId"]
    category = p["categoryId"]
    fields = set(p["rawTaxonomy"]["fields"])
    result = []
    if "home_service" in fields:
        result.append(condition("FIELD_VISIT", "answers.home_service=yes AND a service offering explicitly enables customer-location fulfilment; a product order alone does not activate a visit"))
    if "home_visits" in fields:
        result.append(condition("FIELD_VISIT", "answers.home_visits=yes AND the selected service enables customer-location fulfilment"))
    if "mobile_service" in fields:
        result.append(condition("FIELD_VISIT", "answers.mobile_service=yes AND the selected job is accepted for customer-location fulfilment"))
    if "mobile_inspection" in fields:
        result.append(condition("FIELD_VISIT", "answers.mobile_inspection=yes AND the selected inspection uses a customer location"))
    if "home_sample_collection" in fields:
        result.append(condition("FIELD_VISIT", "answers.home_sample_collection=yes AND the selected administrative collection uses a customer location"))
    if "installation_service" in fields:
        result.append(condition("FIELD_VISIT", "answers.installation_service=yes AND the customer selects the separately configured installation service for an order"))
    if "style_consultation" in fields:
        result.append(condition("APPOINTMENT", "answers.style_consultation=yes AND an exact-duration consultation offering is published"))
    if "custom_routine_consult" in fields:
        result.append(condition("APPOINTMENT", "answers.custom_routine_consult=yes AND an administrative consultation offering is configured"))
    if "booking_required" in fields and WORKFLOW_MODEL[p["primaryWorkflowId"]] == "ORDER":
        result.append(condition("APPOINTMENT", "bookingSetup.booking_enabled=true AND bookingSetup.accepts_scheduled_bookings=true for a declared service; answers.booking_required describes the advance requirement clarified by bookingSetup.requires_advance_booking, not whether optional bookings exist"))
    if "products_for_sale" in fields and WORKFLOW_MODEL[p["primaryWorkflowId"]] != "ORDER":
        result.append(condition("ORDER", "answers.products_for_sale=yes AND a product offering with actual inventory/fulfilment authority is configured"))
    if "custom_tailoring" in fields:
        result.append(condition("PRODUCTION_DUE", "answers.custom_tailoring=yes AND bookingSetup.custom_order_kind=made_to_specification AND the selected order is custom production; fitting appointments require a separate explicit offering"))
    if "custom_curation" in fields:
        result.append(condition("PRODUCTION_DUE", "answers.custom_curation=yes AND bookingSetup.custom_order_kind=made_to_specification AND the accepted hamper specification needs production/curation capacity"))
    if "custom_orders" in fields:
        trigger = "answers.custom_orders=yes AND bookingSetup.custom_order_kind=made_to_specification; special_sourcing and standard_product do not activate production"
        result.append(condition("PRODUCTION_DUE", trigger))
    if sid == "restaurant":
        result.append(condition("SPACE_RESERVATION", "bookingSetup.offers_table_reservations=true AND bookingSetup.space_policy, bookingSetup.exact_duration_minutes and bookingSetup.source_reservation_authority are complete and validated; answers.reservation_system discovers an existing system only and never activates this capability"))
    if "group_sessions" in fields:
        result.append(condition("SESSION_CAPACITY", "answers.group_sessions=yes AND a dated group offering declares actual place capacity"))
    if "personal_training_available" in fields:
        result.append(condition("APPOINTMENT", "answers.personal_training_available=yes AND a trainer service with exact duration and eligibility is configured"))
    if "repair_services" in fields:
        result.append(condition("SERVICE_JOB", "answers.repair_services explicitly selects an offered repair type AND the customer selects repair intake; ordinary product orders remain orders"))
    if "trade_in_program" in fields:
        result.append(condition("SERVICE_JOB", "answers.trade_in_program=yes AND the customer selects a configured valuation/assessment service"))
    if sid == "telecom_services":
        result.append(condition("ORDER", "answers.telecom_services_offered includes devices or accessories AND the selected offering is a product"))
    if sid == "battery_service":
        result.append(condition("SERVICE_JOB", "answers.mobile_service=no AND work is accepted at the merchant location; FIELD_VISIT is not active for that selected method"))
    if sid == "personal_training":
        result.append(condition("FIELD_VISIT", "answers.session_location is client_location or flexible AND the selected session uses the customer's location"))
    if category == "financial_services":
        result.append(condition("APPOINTMENT", "bookingSetup.booking_enabled=true AND bookingSetup.optional_service_booking_enabled=true for a published staff consultation; financial enquiry itself reserves no funds or provider approval"))
    if category == "concierge_services":
        result.append(condition("FIELD_VISIT", "The accepted request explicitly includes an own-team scheduled visit AND the responsible authority confirms crew and resources; a request alone reserves nothing"))
    commercial_flags = {"membership_available", "subscription_plans", "retainer_model", "retainer_ksh"} & fields
    recurrence_flags = {"recurring_sessions", "recurring_sub", "subscription_bouquets", "subscription_boxes", "subscription_available"} & fields
    if commercial_flags or recurrence_flags:
        flag_text = ", ".join("answers." + x for x in sorted(commercial_flags | recurrence_flags))
        result.append(condition("ENTITLEMENT", f"bookingSetup.membership_plan_enabled=true AND bookingSetup.entitlement_policy is complete with accepted commercial scope/price/renewal rules; source hints ({flag_text}) are discovery only, not activation prerequisites, and neither recurrence nor a positive legacy declaration is required for a separately confirmed plan"))
    # Several methods may add the same model. Merge their readable triggers so
    # each conditional model has one entry and no source method is silently lost.
    merged = {}
    for item in result:
        model = item["modelId"]
        if model in merged:
            merged[model]["trigger"] += " OR: " + item["trigger"]
            merged[model]["requiredSetup"] = list(dict.fromkeys(merged[model]["requiredSetup"] + item["requiredSetup"]))
        else:
            merged[model] = item
    return list(merged.values())


NORMAL = {
    "ORDER": ("a published stock-owned offering and selected fulfilment method exist; no scheduled service was selected", "submit the order", "use the declared order/inventory authority and create no staff, space or asset appointment; show a fulfilment promise only if its owner has confirmed it"),
    "APPOINTMENT": ("a published service has exact duration, eligible resources and confirmed free capacity", "confirm a selected service time", "reserve required resources together for the duration and buffers, retain method and show the authority-confirmed appointment"),
    "FIELD_VISIT": ("an accepted service has exact duration, eligible crew, feasible service area and travel allowance", "confirm a customer-location visit", "reserve crew/equipment and travel occupancy under the same business authority; record the actual location and visit promise"),
    "ASSET_INTERVAL": ("a declared eligible asset is available for an exact rental range including turnaround", "confirm the rental interval", "reserve the asset for the complete interval and preserve handover/return obligations and relevant policy snapshot"),
    "TRANSFER": ("a requested trip has pickup/drop-off, exact time and compatible confirmed resources", "confirm the transfer or greeter service", "allocate every required driver/vehicle/greeter together for the accepted occupancy; show the pickup promise without fabricating flight status"),
    "SESSION_CAPACITY": ("a dated session has declared place capacity and the requested quantity is available", "confirm admission to that session", "consume the requested places in the same pool as active holds and retain the session/resource identity"),
    "SPACE_RESERVATION": ("compatible table/space inventory is free for the exact dining/event interval and party size", "confirm the space reservation", "reserve an allowed space allocation with turnover; do not treat total seats alone as proof of a suitable table"),
    "TOUR": ("a dated tour/departure has confirmed guest capacity, eligible resources and required supplier acceptance", "confirm the selected itinerary or departure", "retain guest quantities, resources and local itinerary dates; pending supplier legs remain visibly pending instead of confirmed"),
    "PRODUCTION_DUE": ("specification, quantity, approval and exact lead time/cutoff are accepted", "accept the production order and due promise", "allocate declared production capacity if controlled locally and preserve specification/version plus the confirmed fulfilment promise"),
    "REQUEST_QUOTE": ("the customer supplies request scope and a preferred date without confirmed provider capacity", "submit the enquiry or quote request", "create a request and response milestone; confirm no provider resource, financial outcome or third-party reservation merely from submission"),
    "LINKED_WINDOWS": ("intake quantity and method have feasible processing, collection and return windows", "accept the laundry/processing work", "record distinct feasible collection/intake and return commitments; transport allocations exist only for the offered selected method"),
    "SERVICE_JOB": ("the selected service has a declared queue or scheduled intake and assessment/approval policy", "accept the job intake", "create the proper job state; reserve bay/staff only under a configured scheduling command and preserve any assessment-before-price requirement"),
    "ENTITLEMENT": ("an explicit plan has accepted scope, validity dates, usage units and confirmed commercial acceptance", "activate or use the plan", "record entitlement/usage with correct authority; do not reserve staff, equipment or all future sessions merely by activating a plan"),
    "FREIGHT": ("shipment scope, quantity/unit, legs and quote have the responsible carrier's required acceptance", "confirm the agreed shipment commitment", "retain each leg's authoritative confirmation and milestone windows; no local event invents vessel, aircraft or truck capacity"),
    "STORAGE": ("measured goods requirements and compatible unit/pool capacity are confirmed for an occupancy range", "confirm the storage allocation", "reserve the stated measured quantity across the accepted occupancy interval and retain unit conversion and billing terms separately"),
}

CONFLICT = {
    "ORDER": "A calendar's empty time does not prove inventory or delivery capacity; reject or keep pending under the inventory/fulfilment owner's result and create no fake appointment.",
    "APPOINTMENT": "Only one incompatible allocation of the same staff/room/equipment interval may confirm; preserve the rejected customer's alternatives.",
    "FIELD_VISIT": "Reject overlapping crew/equipment or infeasible travel commitments; a free customer-facing time alone is insufficient.",
    "ASSET_INTERVAL": "Two overlapping commands for the same asset cannot both confirm; include turnaround and maintenance, preserving the existing rental.",
    "TRANSFER": "Allocate required driver and vehicle all-or-none; another trip sharing either resource cannot also confirm an incompatible occupancy.",
    "SESSION_CAPACITY": "Concurrent attempts for the final available places cannot overcommit the session; holds count and a losing command receives a recoverable capacity result.",
    "SPACE_RESERVATION": "Competing party requests cannot share the same incompatible table/space interval; table-combination rules and turnover remain enforced.",
    "TOUR": "Shared departure places and guide/vehicle allocations cannot be double-consumed; an unconfirmed supplier leg prevents false itinerary confirmation.",
    "PRODUCTION_DUE": "A due promise exceeding controlled production capacity or missing the exact lead-time cutoff is rejected or routed to request/approval rather than silently overpromised.",
    "REQUEST_QUOTE": "Multiple preferred-date requests may coexist, but none consumes or guarantees resource capacity before the authoritative commitment step.",
    "LINKED_WINDOWS": "Do not accept a return promise that conflicts with processing/transport capacity even if the collection window alone is free.",
    "SERVICE_JOB": "Two scheduled jobs cannot occupy the same exclusive bay/technician interval; a queue estimate is never presented as a guaranteed slot.",
    "ENTITLEMENT": "Concurrent plan use cannot overspend confirmed usage allowance; entitlement is not a bypass around separate session capacity checks.",
    "FREIGHT": "A preferred departure or local truck calendar cannot override carrier capacity rejection; each leg stays requested until its owner confirms.",
    "STORAGE": "Overlapping occupancy commands cannot exceed the compatible measured pool or claim the same exclusive storage unit; unit conversions cannot silently change the available quantity.",
}


def cases(p: dict, model: str, conditions: list[dict]) -> list[dict]:
    sid, name = p["subcategoryId"], p["name"]
    given, when, expected = NORMAL[model]
    context = SPECIALTY_NEEDS[sid]
    def case(kind, g, w, e):
        return {"id": f"PR_{sid}_{kind.upper()}", "kind": kind,
                "given": f"Hypothetical {name} fixture: {g}",
                "when": w, "expected": e}
    if conditions:
        chosen = conditions[0]
        conditional = case("conditional_or_nonbooking", f"the conditional {chosen['modelId']} service is not yet enabled and its setup is incomplete", f"the merchant supplies this declaration: {chosen['trigger']}", f"Enable only the applicable setup/view after its required fields are completed; declaration alone creates no booking or charge. {context}")
    else:
        conditional = case("conditional_or_nonbooking", "no additional bookable service is declared", "the merchant opens Availability for this specialty", f"Show {VIEW[model]}; never add another activity merely from the category name. {context}")
    block = "resource availability is unknown or stale" if model not in {"ORDER", "REQUEST_QUOTE", "ENTITLEMENT"} else "the declared inventory, request-provider or plan authority is unavailable"
    result = [
        case("normal", given, f"For {name}, {when}", expected + ". Specialty constraint: " + context),
        conditional,
        case("conflict", "the relevant resource, measured capacity, provider commitment or promised window is already constrained", f"a competing {name} command requests an incompatible commitment", CONFLICT[model]),
        case("access", f"another business or unpermitted staff member guesses a {name} record/resource ID", "they query details, export, or send a create/change/cancel command", "Server-enforced business/location/role checks deny unauthorized data and mutation; category configuration cannot grant access."),
        case("source_failure", block, f"the customer or merchant attempts to confirm {name} work", "Follow the declared per-data-class authority. Show unknown/pending or request-only as appropriate, retain stable operation identity, and never infer availability or confirmation from a missing response."),
        case("retry", f"a {name} operation times out after its authority may have accepted it", "the same operation reference is retried or a duplicate callback arrives", "Return or reconcile the original outcome; do not duplicate the booking, allocation, plan use, charge or notification. Preserve the original valid commitment on a failed change."),
        case("kenya_time", f"a {name} promise crosses a Kenya midnight or uses a local date-only promise", "it is saved, reopened in the portal and synchronized if applicable", "Display and evaluate Africa/Nairobi consistently with no timezone picker; retain UTC instants for timed commitments and preserve Kenya date-only promises separately. Opening a date view never shifts the accepted local day."),
    ]
    for binding_index, binding in enumerate(conditions):
        target = binding["modelId"]
        expected_by_state = {
            "positive": f"Resolve the {target} configuration only after this binding's required setup, permissions and declared authority are valid. No booking, allocation, charge or notification is created until the customer/merchant selects the actual applicable offering and an authorized command succeeds. Preserve the primary {model} mode and independently enabled modes. Specialty constraint: {context}",
            "negative": f"Do not activate {target} from this binding. Do not erase independently enabled {target} capabilities from another offering/binding, the primary {model} mode, other enabled modes or existing confirmed obligations. Do not treat discovered external systems as intent to offer a service.",
            "missing": f"Keep the {target} binding unresolved and ask only its missing applicable setup questions. Missing is unknown, never silently false or unlimited capacity. Preserve established modes and confirmed obligations; do not publish a bookable promise for unresolved work.",
            "conflicting": f"Show the conflicting source/operational answers for this {target} binding and require scoped clarification before activation; do not use latest-answer-wins or silently change the primary {model} model. Preserve existing valid obligations and other independent modes.",
        }
        given_by_state = {
            "positive": "the positive condition is explicitly confirmed and every requiredSetup item is completed with a valid owner",
            "negative": "this binding's condition is explicitly declined while other independently configured modes may remain enabled",
            "missing": "at least one answer or requiredSetup item needed by this binding is absent or unknown",
            "conflicting": "source declarations, operational intent or requiredSetup contain contradictory scoped answers",
        }
        for condition_state in ["positive", "negative", "missing", "conflicting"]:
            result.append({
                "id": f"PR_{sid}_B{binding_index}_{target}_{condition_state.upper()}",
                "kind": "conditional_binding",
                "bindingIndex": binding_index,
                "modelId": target,
                "conditionState": condition_state,
                "condition": binding["trigger"],
                "requiredSetup": binding["requiredSetup"],
                "given": f"Hypothetical {name} fixture for binding {binding_index} / {target}: {given_by_state[condition_state]}. Operational context: {context}",
                "when": f"Resolve the {name} configuration for this condition: {binding['trigger']}",
                "expected": expected_by_state[condition_state],
            })
    return result


def generate():
    audit = json.loads(AUDIT.read_text(encoding="utf-8-sig"))
    source_profiles = json.loads(PROFILES.read_text(encoding="utf-8-sig"))
    model_source = json.loads((HERE / "models.json").read_text(encoding="utf-8-sig"))
    registered_models = {model["id"]: model for model in model_source["models"]}
    taxonomy = audit["rows"]
    profiles = {p["subcategoryId"]: p for p in source_profiles["profiles"]}
    ids = [row["id"] for row in taxonomy]
    assert len(ids) == 128 and len(set(ids)) == 128
    assert set(ids) == set(profiles) == set(SPECIALTY_NEEDS)
    rows = []
    for source in taxonomy:
        p = profiles[source["id"]]
        model = WORKFLOW_MODEL[p["primaryWorkflowId"]]
        conditional = conditional_models(p)
        extensions = list(model_source["commonExtensionIds"]) + ["EXT_GOOGLE", "EXT_ERP", "EXT_DELIVERY"]
        for m in [model] + [v["modelId"] for v in conditional]:
            extensions.extend(registered_models[m]["extensionIds"])
        if source["categoryId"] != "financial_services":
            extensions.append("EXT_PAYMENTS")
        evidence = [
            {"kind": "SOURCE_TAXONOMY", "path": "../../audits/merchant-onboarding-128-taxonomy.json", "reference": source["id"]},
            {"kind": "PROPOSED_PROFILE", "path": "../profiles-128.json", "reference": p["id"], "note": "Design input only; semantic corrections in this register supersede blindly applying generic rules."},
        ]
        rows.append({
            "categoryId": source["categoryId"], "categoryName": source["categoryName"],
            "subcategoryId": source["id"], "name": source["name"],
            "sourceProfileId": p["id"], "sourceWorkflowId": p["primaryWorkflowId"],
            "primaryModelId": model, "conditionalModels": conditional,
            "specialtyNeeds": SPECIALTY_NEEDS[source["id"]],
            "sourceQuestionKeys": source["fields"], "requiredSetup": SETUP[model],
            "customerFlowId": model, "merchantView": VIEW[model],
            "authorityPolicy": {
                "scope": "Per business/location/resource and data class; choose before activation rather than infer from category.",
                "dataClasses": ["offerings", "capacity", "reservations", "payments"],
                "allowedModes": ["NEXG_AUTHORITATIVE", "EXTERNAL_AUTHORITATIVE", "SHARED_WITH_RULES", "READ_ONLY_EXTERNAL"],
                "whenNotApplicable": "Mark an irrelevant data class explicitly not applicable; never manufacture a reservation/payment requirement for an order or enquiry.",
                "unknownPolicy": "Affected confirmations remain unavailable/request-only until authority is established; unrelated confirmed functions stay usable.",
                "externalConfirmation": "An external-authoritative command remains pending until that owner confirms; Google event mirrors are not reservation authority.",
            },
            "extensionIds": list(dict.fromkeys(extensions)),
            "corrections": CORRECTIONS.get(source["id"], []),
            "acceptanceCases": cases(p, model, conditional),
            "designStatus": "PLANNED", "implementationStatus": "NOT_STARTED", "testStatus": "NOT_RUN",
            "evidence": evidence,
        })
    result = {
        "schemaVersion": "1.0.0-planned", "date": "2026-10-31",
        "scope": "End-to-end Kenya-only Payload Reserve adaptation coverage. Static design evidence only; no plugin installation, live backend or tests are represented by this register.",
        "timezone": "Africa/Nairobi", "timezonePicker": False,
        "status": "PLANNED_NOT_IMPLEMENTED",
        "sourceTaxonomy": "../../audits/merchant-onboarding-128-taxonomy.json", "sourceProfiles": "../profiles-128.json",
        "conditionSemantics": "Readable design conditions reference exact source keys or explicitly new operational questions. They are not scripts or a new evaluator. Compile final approved questions through the shared typed registry and predicates.",
        "crossCuttingRules": [
            "Onboarding selection configures capabilities; it creates neither work nor permission nor third-party authority.",
            "Recurring sessions/orders, commercial entitlement, and billing renewal are distinct and separately configured.",
            "Retail and enquiry workflows are complete supported outcomes without an appointment calendar.",
            "Sample/fixture assumptions in acceptance cases are hypothetical and are not merchant defaults or passing test evidence.",
            "Google and payments are optional integration capabilities. Extension references describe engineering scope, not mandatory merchant connections or charges.",
            "Primary model is a starting configuration, not unconditional activation; exact offering answers, authority and setup determine real commands.",
        ],
        "summary": {"categoryCount": len({r["categoryId"] for r in rows}), "subcategoryCount": len(rows), "acceptanceCaseCount": sum(len(r["acceptanceCases"]) for r in rows), "baselineAcceptanceCaseCount": len(rows) * 7, "conditionalBindingCaseCount": sum(len(r["conditionalModels"]) * 4 for r in rows), "conditionalBindingIndexBase": 0, "primaryModelCounts": dict(sorted(Counter(r["primaryModelId"] for r in rows).items())), "conditionalModelBindings": sum(len(r["conditionalModels"]) for r in rows), "rowsWithCorrections": sum(bool(r["corrections"]) for r in rows)},
        "rows": rows,
    }
    (HERE / "coverage-128.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["# Payload Reserve coverage for all 128 NEXG specialties", "", "Date: 31 October 2026. All rows are planned, not implemented or tested. Kenya-only scheduling uses `Africa/Nairobi` with no timezone selector. Read [the complete machine-readable register](coverage-128.json) for setup, authority, source keys, seven baseline cases per specialty and four cases for every conditional binding.", "", "Each named row below is an explicit operational mapping. Model selection is a starting point; actual offering answers, setup and authority control activation. Google/payment references are optional integration scope. No-calendar retail/enquiry outcomes are supported deliberately.", "", f"Coverage: {result['summary']['categoryCount']} categories, {len(rows)} specialties, {result['summary']['acceptanceCaseCount']} planned acceptance cases. This includes {result['summary']['baselineAcceptanceCaseCount']} baseline cases and {result['summary']['conditionalBindingCaseCount']} positive/negative/missing/conflicting conditional cases. These counts do not represent passing tests."]
    current = None
    for row in rows:
        if current != row["categoryId"]:
            current = row["categoryId"]
            lines.extend(["", f"## {row['categoryName']}", ""])
        lines.extend([f"### {row['name']} (`{row['subcategoryId']}`)", "", f"Model: `{row['primaryModelId']}`. Source profile: `{row['sourceProfileId']}`. Status: planned / not started / not run.", "", row["specialtyNeeds"], "", "Merchant view: " + row["merchantView"] + ".", "", "Required setup: " + "; ".join(row["requiredSetup"]) + "."])
        if row["conditionalModels"]:
            lines.extend(["", "Conditional models:", ""])
            for condition in row["conditionalModels"]:
                lines.append(f"- `{condition['modelId']}`: {condition['trigger']}.")
        if row["corrections"]:
            lines.extend(["", "Corrections to earlier proposal:", ""])
            lines.extend("- " + c for c in row["corrections"])
        lines.extend(["", f"Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, {len(row['conditionalModels']) * 4} cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.", ""])
    (HERE / "coverage-128.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps(result["summary"], indent=2))


if __name__ == "__main__":
    generate()
