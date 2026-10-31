/** Generate proposed planning data only. This utility does not configure the app. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const audit = JSON.parse(fs.readFileSync(path.join(root, 'docs/audits/merchant-onboarding-128-taxonomy.json'), 'utf8'));
const questionRegistry = JSON.parse(fs.readFileSync(path.join(directory, 'question-registry.json'), 'utf8'));
const questions = new Map(questionRegistry.questions.map(question => [question.questionId, question]));
const status = 'PROPOSED_PLANNING_ONLY';
const screens = ['SC_WORK', 'SC_OFFERINGS', 'SC_AVAILABILITY', 'SC_BUSINESS', 'SC_MONEY', 'SC_PROMOTIONS', 'SC_INSIGHTS', 'SC_SETTINGS'];
const featureIds = ['WK01', 'OF01', 'AV01', 'BU01', 'MO01', 'PR01', 'IN01', 'SE01'];
const workflowDefinitions = {
  WF_ORDER: ['PRODUCT_CATALOG_V1', 'AVAIL_STOCK_HOURS_V1', ['orders', 'catalogue', 'stock'], ['reference', 'items', 'fulfilment_method', 'promise', 'next_action'], ['completed_orders', 'order_value', 'fulfilment_time']],
  WF_MADE_TO_ORDER: ['MADE_TO_ORDER_V1', 'AVAIL_PRODUCTION_V1', ['custom_orders', 'production_schedule', 'specification_approval'], ['reference', 'specification', 'approval', 'due_date', 'next_action'], ['completed_custom_orders', 'approval_time', 'on_time_completion']],
  WF_APPOINTMENT: ['SERVICE_APPOINTMENT_V1', 'AVAIL_RESOURCE_SLOTS_V1', ['appointments', 'resource_schedule'], ['reference', 'service', 'time', 'provider', 'service_location', 'next_action'], ['completed_appointments', 'slot_utilisation', 'no_show_rate']],
  WF_REMOTE_SESSION: ['REMOTE_SESSION_V1', 'AVAIL_RESOURCE_SLOTS_V1', ['remote_sessions', 'resource_schedule'], ['reference', 'session', 'time', 'provider', 'join_readiness', 'next_action'], ['completed_sessions', 'slot_utilisation', 'no_show_rate']],
  WF_FIELD_SERVICE: ['FIELD_SERVICE_V1', 'AVAIL_DISPATCH_ROTA_V1', ['field_service', 'dispatch', 'service_areas'], ['reference', 'service', 'service_area', 'assigned_team', 'arrival_window', 'next_action'], ['completed_visits', 'arrival_reliability', 'team_utilisation']],
  WF_RENTAL: ['RENTAL_ASSET_V1', 'AVAIL_ASSET_INTERVALS_V1', ['rentals', 'asset_schedule', 'handover_returns'], ['reference', 'asset', 'rental_period', 'handover', 'return_due', 'next_action'], ['completed_rentals', 'asset_utilisation', 'return_punctuality']],
  WF_TRANSFER: ['TRANSFER_ROUTE_V1', 'AVAIL_VEHICLE_DRIVER_V1', ['transfers', 'driver_schedule', 'route_planning'], ['reference', 'passengers', 'pickup_time', 'pickup_dropoff', 'vehicle_driver', 'next_action'], ['completed_transfers', 'pickup_punctuality', 'vehicle_utilisation']],
  WF_EVENT_SESSION: ['EVENT_TICKET_V1', 'AVAIL_EVENT_CAPACITY_V1', ['event_ticketing', 'capacity_schedule', 'check_in'], ['reference', 'event_session', 'ticket_type', 'attendees', 'capacity', 'check_in'], ['tickets_confirmed', 'attendance', 'capacity_utilisation']],
  WF_GROUP_ACTIVITY: ['GROUP_SESSION_V1', 'AVAIL_SESSION_CAPACITY_V1', ['group_bookings', 'capacity_schedule', 'attendance'], ['reference', 'activity_session', 'group_size', 'places_remaining', 'instructor', 'next_action'], ['session_bookings', 'attendance', 'capacity_utilisation']],
  WF_TOUR: ['TOUR_PACKAGE_V1', 'AVAIL_DEPARTURES_V1', ['tour_bookings', 'departure_schedule', 'itineraries'], ['reference', 'itinerary', 'departure', 'party_size', 'guide_vehicle', 'next_action'], ['confirmed_departures', 'occupied_places', 'booking_lead_time']],
  WF_REQUEST_QUOTE: ['REQUEST_QUOTE_V1', 'AVAIL_ENQUIRY_WINDOWS_V1', ['enquiries', 'quotes', 'scope_approval'], ['reference', 'request_scope', 'response_due', 'quote_version', 'approval', 'next_action'], ['qualified_requests', 'quote_acceptance', 'response_time']],
  WF_PICKUP_RETURN: ['PICKUP_RETURN_V1', 'AVAIL_BATCH_TURNAROUND_V1', ['collection_returns', 'batch_processing', 'dual_leg_dispatch'], ['reference', 'collection_window', 'intake_items', 'processing', 'return_window', 'next_action'], ['completed_cycles', 'turnaround', 'collection_return_punctuality']],
  WF_MEMBERSHIP: ['MEMBERSHIP_PLAN_V1', 'AVAIL_ACCESS_CAPACITY_V1', ['memberships', 'access_schedule'], ['reference', 'plan', 'member_reference', 'validity', 'access_status', 'next_action'], ['active_memberships', 'renewals', 'capacity_utilisation']],
  WF_FREIGHT: ['FREIGHT_SHIPMENT_V1', 'AVAIL_CARGO_CAPACITY_V1', ['freight_quotes', 'shipments', 'tracking_milestones'], ['reference', 'cargo', 'origin_destination', 'capacity', 'documentation_status', 'milestone'], ['accepted_shipments', 'milestone_punctuality', 'capacity_utilisation']],
  WF_STORAGE: ['STORAGE_SPACE_V1', 'AVAIL_SPACE_CAPACITY_V1', ['storage', 'space_capacity', 'inbound_outbound'], ['reference', 'space_allocation', 'occupancy_period', 'inbound_outbound', 'access_window', 'next_action'], ['occupied_space', 'contract_renewals', 'inbound_outbound_completion']],
  WF_REGULATED_ENQUIRY: ['REGULATED_ENQUIRY_V1', 'AVAIL_PROVIDER_CONTACT_V1', ['regulated_enquiries', 'provider_handoff'], ['reference', 'enquiry_type', 'provider', 'contact_mode', 'handoff_status', 'next_action'], ['enquiries_received', 'response_time', 'provider_handoffs']],
  WF_SERVICE_JOB: ['SERVICE_JOB_V1', 'AVAIL_QUEUE_HOURS_V1', ['service_jobs', 'job_schedule', 'inspection_handover'], ['reference', 'job_type', 'intake', 'assignment', 'completion_check', 'next_action'], ['completed_jobs', 'job_turnaround', 'rework_rate']],
};

// Every specialty has its own row. The final two columns are an operational
// distinction and a constraint that must survive shared workflow reuse.
const specificationText = `
adult_products|WF_ORDER|order|product|Discreet item selection and handover|Packaging preference and age-check result stay separate; never expose sensitive item names in notification previews.
adult_wellness|WF_ORDER|order|wellness offering|Product sales and appointment services must be separated by the booking answer; do not infer a clinical service.
cigarettes|WF_ORDER|order|tobacco product|Brand selection and licence-review status remain visible; order release waits for configured eligibility checks.
cigars|WF_ORDER|order|cigar|Gift packaging does not remove configured eligibility checks at handover.
vapes|WF_ORDER|order|vape product|Device type is an offering attribute; avoid treating all products as one interchangeable variant.
adult_accessories|WF_ORDER|order|accessory|Signature and packaging instructions appear to the authorised fulfiller without disclosure in general notifications.
airport_pickup|WF_TRANSFER|transfer|airport pickup|Flight tracking can update readiness but must not silently change an agreed pickup without a visible policy.
airport_dropoff|WF_TRANSFER|transfer|airport drop-off|Pickup address and flight departure time are distinct; derive a requested arrival buffer only after confirmation.
meet_greet|WF_TRANSFER|arrival|meet-and-greet service|Signage text and waiting allowance require explicit confirmation; a greeting need not include a vehicle ride.
executive_transfer|WF_TRANSFER|transfer|executive transfer|Priority is a service promise and dispatch policy; it cannot bypass driver availability.
wine|WF_ORDER|order|wine|Origin and storage preferences are product data; cold delivery is optional and requires a supported method.
spirits|WF_ORDER|order|spirit|Gift wrapping and brand range vary by offering; configured eligibility checks still apply.
beer|WF_ORDER|order|beer|Returnable-container accounting is a separate deposit or exchange item only when configured.
champagne|WF_ORDER|order|champagne|Occasion and chilling instructions attach to a fulfilment window without creating a booking-service workflow.
cocktail_mixers|WF_ORDER|order|mixer|Review eligibility per offering; the category hint alone must not falsely classify every nonalcoholic mixer as alcoholic.
liquor_stores|WF_ORDER|order|beverage|Corporate billing is invoice routing after approval; it grants no credit automatically.
mens_fashion|WF_ORDER|order|garment|Tailoring creates a linked specification and fitting job while stock garments keep their order workflow.
womens_fashion|WF_ORDER|order|garment|Style consultation can add appointment scheduling; product sizes and alteration specifications remain distinct.
kids_fashion|WF_ORDER|order|childrens garment|Age-range merchandising is distinct from actual garment size; school-uniform collections need their own size variants.
shoes|WF_ORDER|order|shoe|Display the chosen size system and actual sizes; do not silently convert without a confirmed conversion table.
bags|WF_ORDER|order|bag|Authenticity evidence and warranty terms attach to the item rather than a store-wide unsupported claim.
watches|WF_ORDER|order|watch|Secure handover and serial/reference capture are configurable; avoid exposing identifiers in public summaries.
accessories|WF_ORDER|order|fashion accessory|Variant and return policy are item-specific; store availability does not automatically enable customer collection.
makeup|WF_APPOINTMENT|appointment|makeup service|Artists and event commitments need resource scheduling; products appear only when products_for_sale is enabled.
skincare|WF_ORDER|order|skincare product|Routine consultation is an optional appointment capability; product information must not become a diagnosis form.
haircare|WF_APPOINTMENT|appointment|hair service|Walk-ins and required appointments are separate intake modes; home visits require travel time and a service area.
fragrances|WF_ORDER|order|fragrance|When products_for_sale is no the catalogue cannot remain purchasable; ask for the actual service model.
cosmetics_stores|WF_ORDER|order|cosmetic|Own and stocked brands form catalogue filters; customer collection requires a confirmed operating mode.
car_rental|WF_RENTAL|rental|rental vehicle|With-driver service reserves both vehicle and driver; self-drive must not show chauffeur assignment.
self_drive|WF_RENTAL|rental|self-drive vehicle|Eligibility review and agreed deposit/fuel terms precede handover; there is no driver dispatch in this profile.
corporate_rental|WF_RENTAL|rental|corporate vehicle allocation|Billing cycle and account manager do not automatically authorise a credit facility or override asset conflicts.
long_term_rental|WF_RENTAL|rental|long-term vehicle|Continuous asset intervals and renewal dates replace short pickup-time queues.
bike_rental|WF_RENTAL|rental|rental bike|Bike type changes asset attributes; a chauffeur option requires a suitable motorised vehicle and explicit service confirmation.
concerts|WF_EVENT_SESSION|ticket booking|concert ticket|Event session and ticket delivery are distinct; ticket issuance needs a connected authorised issuer or native inventory.
festivals|WF_EVENT_SESSION|festival booking|festival pass|Date/pass scope and capacity are explicit; a multi-day pass must not consume capacity as unrelated daily tickets.
conferences|WF_EVENT_SESSION|registration|conference place|AV and catering are venue/service capabilities; attendance registration and organiser quotes remain separate.
private_events|WF_REQUEST_QUOTE|event request|private event package|Venue sourcing and planning scope are agreed before confirming capacity or sending staff.
photography|WF_APPOINTMENT|photo session|photography service|Equipment inclusion must support all/some/none after the registry collision is resolved; image delivery is a separate agreed deliverable.
workshops|WF_GROUP_ACTIVITY|workshop booking|workshop session|Places and instructor/equipment limits constrain the same session; equipment is not safely reduced to an assumed yes/no.
classes|WF_GROUP_ACTIVITY|class booking|class session|Recurring sessions create a series with exception dates; they must not imply an automatic recurring debit.
sports_activities|WF_GROUP_ACTIVITY|activity booking|sports session|Capacity and equipment requirements constrain attendance; recurring plans need explicit session allocation.
recreation|WF_GROUP_ACTIVITY|activity booking|recreation session|Activity capacity and advance-booking windows are explicit; walk-in availability cannot exceed the same capacity.
banking|WF_REGULATED_ENQUIRY|banking enquiry|banking service enquiry|Route enquiries or appointments to an authorised provider; never present account opening approval or a money transfer as a NexG completion.
forex|WF_REGULATED_ENQUIRY|forex enquiry|exchange enquiry|Currency pairs support an enquiry and provider handoff; no executable rate quote or FX settlement is implied.
insurance|WF_REGULATED_ENQUIRY|insurance enquiry|insurance enquiry|Coverage and underwriting remain with the provider; do not label an enquiry as an issued policy.
payments|WF_REGULATED_ENQUIRY|payment-service enquiry|provider service enquiry|Provider handoff is not an enabled payment rail; never collect payment credentials in the merchant portal.
remittance|WF_REGULATED_ENQUIRY|remittance enquiry|remittance service enquiry|Corridors describe provider coverage; no remittance transfer, funds custody or guaranteed exchange rate is enabled by onboarding.
sacco_services|WF_REGULATED_ENQUIRY|member-service enquiry|Sacco service enquiry|Membership and lending decisions belong to the authorised institution; show enquiry progress only.
business_services|WF_REGULATED_ENQUIRY|business-service enquiry|business service enquiry|Separate requested professional assistance from confirmed provider authority and service scope; no regulated execution by implication.
flowers|WF_ORDER|flower order|flower arrangement|Subscriptions and scheduled bouquets are optional; perishability and message text affect fulfilment handling.
gift_hampers|WF_ORDER|hamper order|gift hamper|Custom curation can require an approval step; component availability determines the final agreed hamper.
cakes|WF_MADE_TO_ORDER|cake order|cake design|Design approval and production lead time precede scheduled fulfilment; ready-made cakes can use a separately enabled order workflow.
chocolates|WF_ORDER|chocolate order|chocolate gift|Gift message and temperature handling are independent of wrapping and must survive dispatch handover.
personalized_gifts|WF_MADE_TO_ORDER|personalisation job|personalised gift|Personalisation proof approval freezes the agreed text/version before production.
occasion_gifts|WF_ORDER|gift order|occasion gift|Occasion filters organise discovery while promise windows and personalised messages govern execution.
restaurant|WF_ORDER|food order|menu item|Table reservations are conditional and separate from delivery; the same kitchen capacity must constrain both.
fast_food|WF_ORDER|food order|menu item|Drive-through is a pickup method after explicit enablement; family portions require actual serving/variant definitions.
cafe|WF_ORDER|cafe order|cafe item|Seating and coworking are capabilities requiring explicit booking rules; Wi-Fi information alone does not create a desk booking system.
bakery|WF_ORDER|bakery order|bakery item|Custom orders add a production deadline and approval path without making every stocked item bespoke.
desserts|WF_ORDER|dessert order|dessert|Cold handling and custom-order scheduling are distinct; dietary claims require configured evidence and copy review.
juice_bar|WF_ORDER|drink order|drink|Drink composition and delivery handling are visible; a detox label must not create clinical advice or a treatment workflow.
cloud_kitchen|WF_ORDER|kitchen order|menu item|Each brand can share kitchen capacity but retains its catalogue identity; no customer seating is inferred.
catering|WF_REQUEST_QUOTE|catering request|catering package|Headcount, staffing and equipment determine a scoped quote and delivery/event plan; never force an immediate meal queue.
supermarket|WF_ORDER|basket order|grocery item|Substitution policy and partial availability belong on the work detail; an express promise needs available capacity.
convenience_store|WF_ORDER|basket order|convenience item|Twenty-four-hour opening does not guarantee riders or express fulfilment around the clock.
fresh_produce|WF_ORDER|produce order|produce item|Units, variable weights and substitutions are explicit; subscriptions allocate real fulfilment dates.
butchery|WF_ORDER|butchery order|cut|Custom cuts create preparation instructions and measured weight; certification is a verified claim rather than a checkbox badge alone.
seafood|WF_ORDER|seafood order|seafood item|Processing requests and live/chilled handling influence preparation and handover; actual measured quantity determines a confirmed adjustment.
organic_store|WF_ORDER|grocery order|organic grocery item|Sourcing and packaging claims appear with their configured verification status; they do not change the standard order states.
laundry|WF_PICKUP_RETURN|laundry job|laundry service|Collection and return are two linked legs around intake measurement and processing; no single delivered state can complete both.
dry_cleaning|WF_PICKUP_RETURN|cleaning job|garment service|Garment count and agreed care notes are recorded at intake; item condition and return acknowledgement remain linked.
ironing|WF_PICKUP_RETURN|ironing job|ironing service|Per-item counts and return promise govern the job; customer drop-off can remove only the collection dispatch leg.
home_cleaning|WF_FIELD_SERVICE|cleaning visit|home cleaning service|Staff, duration, travel area and equipment responsibility govern the visit; repeat visits need explicit exceptions.
office_cleaning|WF_FIELD_SERVICE|cleaning visit|office cleaning service|Site access windows, team capacity and recurring scope must be explicit before a visit is confirmed.
home_living|WF_ORDER|home item order|home item|Bulky-item dimensions and access constraints belong to delivery planning; ordinary parcel defaults are insufficient.
furniture|WF_ORDER|furniture order|furniture item|Installation is a linked service job only when enabled; delivery and installation completion remain separately visible.
appliances|WF_ORDER|appliance order|appliance|Serial/warranty data and installation scheduling are separate; a delivered appliance is not proof of completed installation.
decor|WF_ORDER|decor order|decor item|Fragile handling and wrapping instructions must remain visible in fulfilment detail.
kitchenware|WF_ORDER|kitchenware order|kitchenware item|Condition and return terms are offering attributes; do not show rental-return controls for ordinary product returns.
books|WF_ORDER|book order|book|Special sourcing creates an optional request/quote path rather than fictitious stock for unavailable books.
stationery|WF_ORDER|stationery order|stationery item|Bulk quantities and minimum order constraints are explicit; corporate billing needs separate approval.
office_supplies|WF_ORDER|supply order|office supply|Replenishment baskets use actual item availability; invoice routing does not imply a standing order or credit account.
general_retail|WF_ORDER|retail order|retail product|New/used condition and return policy are item-level details; no single inherited food-preparation stage.
pharmacy_retail|WF_ORDER|pharmacy order|pharmacy item|Prescription-related orders require authorised pharmacist review through a suitable connected service; no clinical records in general work cards.
medical_supplies|WF_ORDER|supply order|medical supply|Product type and invoice recipient are visible; prescription and professional-use constraints remain item-specific checks.
baby_products|WF_ORDER|product order|baby product|Subscriptions schedule ordinary product fulfilment; never infer a clinical service from the pharmacy category.
supplements|WF_ORDER|product order|supplement|Authenticity information is a reviewed product claim; no treatment recommendation or clinical outcome metrics.
clinics|WF_APPOINTMENT|appointment|clinic service|Administrative booking only; no symptoms, diagnosis, clinical notes, test results or medical-record storage in this portal plan.
telemedicine|WF_REMOTE_SESSION|remote appointment|remote consultation slot|Administrative session scheduling and authorised provider handoff only; consultation content stays in the provider system.
labs|WF_APPOINTMENT|lab appointment|laboratory service slot|Collection logistics are administrative; result documents and clinical interpretation stay in the authorised provider system.
mental_health|WF_APPOINTMENT|session booking|therapy session slot|Session format changes in-person/remote scheduling; no therapy notes, condition labels or clinical records appear in shared work views.
coaching|WF_APPOINTMENT|coaching session|coaching service|Group capacity and session format are configurable; outcomes do not become unsupported clinical claims.
smartphones|WF_ORDER|device order|smartphone|Repair and trade-in are distinct assessed jobs; purchased stock retains secure item handover and warranty terms.
tech_accessories|WF_ORDER|accessory order|technology accessory|Compatibility and warranty are item information; no installation workflow without a declared supported service.
computers|WF_ORDER|computer order|computer|Repair intake can be enabled independently of product sales; device identifiers require scoped access.
gaming|WF_ORDER|gaming order|gaming product|Platform compatibility and new/pre-owned condition belong on variants; pre-owned inventory must be individually identifiable where required.
audio|WF_ORDER|audio order|audio product|Warranty and returns remain offering-specific; a product purchase must not create an unrelated installation appointment.
telecom_services|WF_SERVICE_JOB|service request|telecom service|Airtime/data/SIM services need authorised provider handoff; physical devices/accessories can have a distinct order capability.
smart_devices|WF_ORDER|device order|smart device|Installation adds a linked visit with site requirements; product handover alone cannot mark installation complete.
safaris|WF_TOUR|safari booking|safari itinerary|Park access, vehicle/guide capacity and accommodation inclusions are explicit; no guaranteed supplier allocation before confirmation.
game_drives|WF_TOUR|game-drive booking|game drive|Departure seats and private-vehicle options share underlying capacity; guide and vehicle availability must both agree.
luxury_safaris|WF_TOUR|safari booking|luxury safari itinerary|Priority support does not bypass supplier confirmations, accommodation allocation or vehicle conflicts.
city_tours|WF_TOUR|tour booking|city tour|Mode, language and guide capacity determine each departure; different tour modes cannot share an unqualified asset pool.
cultural_tours|WF_TOUR|tour booking|cultural tour|Guide language and site timings constrain departures; itinerary changes need a visible customer acknowledgement policy.
adventure_tours|WF_TOUR|adventure booking|adventure itinerary|Equipment inclusion and participant capacity are explicit; suitability checks are configured per actual activity.
travel_packages|WF_REQUEST_QUOTE|travel request|travel package|Flights, visas and insurance assistance are scoped provider coordination; no confirmed ticket, visa or policy before provider evidence.
car_wash|WF_SERVICE_JOB|wash job|wash service|On-site queue and mobile visits are separate modes; subscriptions allocate visits without assuming recurring collection of funds.
tire_service|WF_SERVICE_JOB|tire job|tire service|Mobile/emergency service requires a dispatch area and team capacity; parts stock and labour are separate lines.
battery_service|WF_FIELD_SERVICE|battery job|battery service|A no-mobile answer changes this profile to an on-site job; compatibility and authorised safe completion checks remain explicit.
vehicle_assistance|WF_FIELD_SERVICE|assistance request|assistance service|Emergency dispatch uses location, response capacity and service type; promise only an achievable arrival window.
vehicle_inspection|WF_APPOINTMENT|inspection booking|inspection service|Mobile inspection adds travel and a service area; report_provided is a deliverable flag with controlled access.
spa|WF_APPOINTMENT|spa appointment|spa service|Couples bookings consume the actual room/provider capacity; home service and memberships are separately enabled.
massage|WF_APPOINTMENT|massage appointment|massage service|Provider, duration and couples capacity are explicit; mobile delivery requires travel buffers.
gym|WF_MEMBERSHIP|membership|gym plan|Walk-in access and personal training are separate capabilities sharing occupancy rules; memberships do not imply direct debits.
personal_training|WF_APPOINTMENT|training session|training service|Venue/client/online location and group size determine capacity and travel; no one-size-fits-all appointment resource.
reservations|WF_REQUEST_QUOTE|reservation request|reservation assistance|The concierge requests supplier confirmation; it must not show a table/room/ticket as confirmed from its own unchecked capacity.
personal_assistance|WF_REQUEST_QUOTE|assistance request|assistance service|Retainer scope and response commitment are explicit; an account manager is not unlimited available capacity.
shopping_assistance|WF_REQUEST_QUOTE|shopping request|shopping assistance|Item sourcing, customer approval and purchase evidence precede fulfilment; substitute items need an agreed policy.
gift_sourcing|WF_REQUEST_QUOTE|sourcing request|gift sourcing service|Budget and shortlist approval are distinct from the physical gift's later delivery workflow.
travel_planning|WF_REQUEST_QUOTE|planning request|travel planning service|Destination coverage and visa/insurance assistance do not imply provider issuance or guaranteed outcomes.
property_coordination|WF_REQUEST_QUOTE|property request|property coordination|Site coverage, access authority and supplier acceptance govern the job; do not infer authority to enter a property.
moving_assistance|WF_REQUEST_QUOTE|moving request|moving assistance|Inventory, access, crew, equipment and insurance scope require a confirmed quote before scheduling movement.
cleaning_coordination|WF_REQUEST_QUOTE|coordination request|cleaning coordination|Supplier acceptance precedes a confirmed cleaning visit; recurring schedules retain per-visit exceptions.
vip_assistance|WF_REQUEST_QUOTE|priority request|VIP assistance|A response commitment and named coordinator remain visible; priority does not waive supplier or permission checks.
sea_freight|WF_FREIGHT|shipment|sea freight service|Container/CBM/kg pricing modes and port/warehouse legs are explicit; they are not interchangeable units.
air_freight|WF_FREIGHT|shipment|air freight service|Chargeable weight and customs handling are confirmed scope; flight milestones require a connected source or manual evidence.
road_freight|WF_FREIGHT|shipment|road freight service|Cargo dimensions, truck capacity and route legs govern scheduling; a single meal-style ETA is not an adequate promise.
warehousing|WF_STORAGE|storage allocation|storage space|Area units and occupancy periods control capacity; inbound/outbound movements remain linked but distinct from the storage contract.
`;

const specifications = new Map(specificationText.trim().split('\n').map(line => {
  const [id, workflow, workNoun, offeringNoun, ...distinctions] = line.split('|');
  const distinction = distinctions.join('. ');
  return [id, { id, workflow, workNoun, offeringNoun, distinction }];
}));
assert.equal(specifications.size, 128, 'Every specialty needs an individual specification');

const unsupportedExamples = {
  liquor_license: 'LIC-EXAMPLE-001', wine_origins: ['kenya', 'south_africa'], cold_delivery: 'yes', returnable_bottles: 'yes', occasions_spec: ['birthday', 'corporate'],
  professional_artists: 'yes', bridal_packages: 'yes', event_makeup: 'yes', skin_types_served: ['dry', 'oily'], custom_routine_consult: 'no', hair_types_served: ['natural', 'braided'], fragrance_families: ['citrus', 'woody'], own_brand: 'no', multi_brand: 'yes',
  fresh_or_preserved: 'fresh', subscription_bouquets: 'no', custom_messages: 'yes', advance_order_hrs: 24, custom_curation: 'no', corporate_gifting: 'yes', hamper_price_ranges: ['KES 2500-5000'], custom_cake_design: 'yes', dietary_options_cake: ['egg_free'], min_advance_order_hrs: 48,
  cuisine_types: ['kenyan'], table_service: 'yes', avg_prep_time: 25, has_physical_seating: 'yes', reservation_system: 'no', drive_through: 'no', family_meals: 'yes', brewing_methods: ['espresso'], wifi_available: 'yes', coworking_space: 'no', seated_capacity: 20, food_menu: 'yes', bakery_specialties: ['bread', 'pastries'], dessert_specialties: ['ice_cream'], cold_pressed: 'yes', smoothie_bowls: 'yes', vegan_menu: 'yes', detox_programs: 'no', number_of_brands: 2, staff_included: 'yes',
  express_delivery: 'no', organic_options: 'yes', farm_direct: 'yes', weekly_market: 'yes', custom_cuts: 'yes', halal_certified: 'no', vacuum_sealed: 'yes', local_sourcing: 'yes', pickup_delivery: 'yes', turnaround_time: 24, per_kg_pricing: 'yes', per_item_pricing: 'yes', weight_limit: 15, garment_types: ['suit', 'dress'], one_time_bookings: 'yes', pharmacist_on_duty: 'yes', prescription_delivery: 'no', cold_chain_meds: 'no', med_supply_types: ['first_aid'], baby_product_range: ['diapers', 'wipes'], subscription_available: 'no', supplement_categories: ['vitamins'],
  shipping_ways: ['port_to_port'], price_per_container: 250000, price_per_cbm: 15000, price_per_kg: 850, port_to_warehouse_transport: 'yes', warehouse_to_client_transport: 'yes', shipping_times: '14-21 days subject to route confirmation', custom_clearance: 'yes', price_per_sqm: 1200, price_per_sqft: 112, warehouse_capacity_sqft: 10000,
};
const textExamples = { battery_brands_text: 'Amaron, Chloride Exide', brands_stocked_text: 'Example authorised brands', coverage_area_text: 'Westlands and Parklands', deposit_policy_text: 'Refundable KES 10000 security deposit after the agreed return check', destinations_text: 'Nairobi and Naivasha', license_number: 'LIC-EXAMPLE-001', operating_hours_text: 'Monday-Friday 09:00-17:00 Africa/Nairobi', product_description: 'Clearly specified item with condition and included accessories', regulatory_license: 'REG-EXAMPLE-001 pending provider verification', retainer_ksh: '15000', tire_brands_text: 'Bridgestone, Michelin', vip_services_text: 'Named coordinator and booked supplier assistance' };
const yes = value => value === 'yes' || value === true;
const questionId = field => `Q_${field.toUpperCase()}`;
const unique = list => [...new Set(list)];
const clone = value => JSON.parse(JSON.stringify(value));
const baseFor = workflow => workflowDefinitions[workflow];
const viewFor = workflow => !workflow ? 'configuration_questions' : ['WF_APPOINTMENT', 'WF_REMOTE_SESSION', 'WF_TOUR', 'WF_EVENT_SESSION', 'WF_GROUP_ACTIVITY'].includes(workflow) ? 'schedule_with_attention_queue' : ['WF_RENTAL', 'WF_STORAGE'].includes(workflow) ? 'allocations_with_conflict_queue' : 'work_queue_with_detail';
const isFinance = row => row.categoryId === 'financial_services';
const isHealth = row => row.categoryId === 'health';
const isRestricted = row => ['adults_only', 'alcohol_beverages'].includes(row.categoryId);

function fixtureAnswers(row, spec) {
  const answers = {};
  for (const q of row.databaseCategoryQuestions) answers[q.key] = q.type === 'multi' ? [q.options[0].value] : q.type === 'text' ? 'Configured business description' : q.options[0].value;
  for (const field of row.fieldCoverage) {
    if (Object.hasOwn(unsupportedExamples, field.key)) answers[field.key] = clone(unsupportedExamples[field.key]);
    else if (field.generatedQuestion?.type === 'text') answers[field.key] = textExamples[field.key] ?? 'Configured service detail';
    else if (field.generatedQuestion?.type === 'multi') answers[field.key] = [field.generatedQuestion.options[0].value];
    else if (field.generatedQuestion?.options?.map(x => x.value).join(',') === 'yes,no') answers[field.key] = 'no';
    else answers[field.key] = field.generatedQuestion.options[0].value;
  }
  if (row.fields.includes('booking_required')) answers.booking_required = ['WF_APPOINTMENT', 'WF_GROUP_ACTIVITY'].includes(spec.workflow) ? 'yes' : 'no';
  if (row.fields.includes('appointment_booking')) answers.appointment_booking = 'yes';
  if (row.fields.includes('products_for_sale')) answers.products_for_sale = spec.workflow === 'WF_ORDER' ? 'yes' : 'no';
  if (row.id === 'battery_service') answers.mobile_service = 'yes';
  return answers;
}

const baselineOperationalAnswers = {
  service_location_mode: 'merchant_venue', appointment_duration_minutes: 60, booking_lead_time_minutes: 120,
  service_area: { coverage_type: 'zones', coverage: ['Westlands', 'Parklands'], location_id: 'TEST_NAIROBI_PRIMARY' }, resource_selection_mode: 'merchant_assigns',
  timezone: 'Africa/Nairobi', currency: 'KES', intake_policy: 'merchant_confirmation',
  enabled_fulfilment_modes: ['merchant_confirmed_mode'],
};

function rule(id, rawField, operator, value, effect, explanation, source = 'answers') {
  const question = questions.get(questionId(rawField));
  assert(question, `Unregistered question ${rawField}`);
  const typedValue = question.valueSchema.type === 'boolean' && ['yes', 'no'].includes(value) ? value === 'yes' : value;
  return { id, source, field: rawField, questionId: questionId(rawField), authoringPredicate: { kind: 'RAW_SOURCE_AUTHORING_COMPILED_VIA_QUESTION_REGISTRY', rawPath: `${source}.${rawField}`, operator, value }, condition: { path: question.canonicalTarget, op: operator === 'equals' ? 'eq' : operator, ...(operator === 'nonempty' ? {} : { value: typedValue }) }, effect, explanation, unknownBehavior: 'Do not enable the conditional capability; show the relevant setup question.' };
}
function conditionalRules(row, spec) {
  const rules = [];
  const has = field => row.fields.includes(field);
  const add = (field, effect, explanation, operator = 'equals', value = 'yes') => rules.push(rule(`${row.id}:${field}:${String(value).replaceAll(' ', '_')}`, field, operator, value, effect, explanation));
  for (const field of ['home_service', 'home_visits', 'home_sample_collection', 'mobile_service', 'mobile_inspection']) {
    if (has(field)) add(field, { addWorkflowIds: ['WF_FIELD_SERVICE'], addCapabilities: ['field_service', 'service_areas', 'travel_buffers'], addFulfilmentModes: ['customer_location'], requireOperationalFields: ['service_area', 'travel_buffer_minutes'] }, `${field} enables a planned customer-location visit after area, travel and provider capacity are configured.`);
  }
  if (row.id === 'battery_service') rules.push(rule('battery_service:mobile_service:no', 'mobile_service', 'equals', 'no', { setPrimaryWorkflowId: 'WF_SERVICE_JOB', removeWorkflowIds: ['WF_FIELD_SERVICE'], removeCapabilities: ['field_service', 'dispatch', 'service_areas'], setFulfilmentModes: ['merchant_location'], setAvailabilityModelId: 'AVAIL_QUEUE_HOURS_V1' }, 'A non-mobile battery service uses an on-site job queue.'));
  if (has('products_for_sale')) {
    add('products_for_sale', { addWorkflowIds: ['WF_ORDER'], addCapabilities: ['orders', 'catalogue', 'stock'], addOfferingSchemaIds: ['PRODUCT_CATALOG_V1'], addFulfilmentModes: ['product_collection_or_delivery_after_confirmation'] }, 'Product sales create a catalogue branch alongside the service model.');
    rules.push(rule(`${row.id}:products_for_sale:no`, 'products_for_sale', 'equals', 'no', { removeWorkflowIds: ['WF_ORDER'], removeCapabilities: ['orders', 'stock'], removeOfferingSchemaIds: ['PRODUCT_CATALOG_V1'], requireModelClarificationIfNoWorkflow: true }, 'Do not leave a purchasable product catalogue when the merchant says products are not sold.'));
  }
  if (has('booking_required')) {
    if (spec.workflow === 'WF_ORDER') add('booking_required', { addWorkflowIds: ['WF_APPOINTMENT'], addCapabilities: ['appointments', 'resource_schedule'], addOfferingSchemaIds: ['SERVICE_APPOINTMENT_V1'], requireOperationalFields: ['appointment_duration_minutes', 'resource_selection_mode', 'service_location_mode'] }, 'An offering with a booking requirement adds an explicitly configured service appointment.');
    else add('booking_required', { addCapabilities: ['booking_required'], setIntakePolicy: 'advance_booking_required' }, 'Advance bookings are required for this configured service.');
    if (spec.workflow === 'WF_APPOINTMENT') rules.push(rule(`${row.id}:booking_required:no`, 'booking_required', 'equals', 'no', { setPrimaryWorkflowId: 'WF_SERVICE_JOB', addCapabilities: ['walk_in_queue'], setAvailabilityModelId: 'AVAIL_QUEUE_HOURS_V1', setIntakePolicy: 'walk_in_or_optional_booking' }, 'No mandatory booking uses an on-site queue; optional slots need a separately enabled appointment mode.'));
    else if (spec.workflow === 'WF_GROUP_ACTIVITY') rules.push(rule(`${row.id}:booking_required:no`, 'booking_required', 'equals', 'no', { addCapabilities: ['walk_in_capacity_check'], setIntakePolicy: 'walk_in_subject_to_capacity' }, 'Walk-in participants consume the same session capacity.'));
  }
  if (has('with_driver')) add('with_driver', { addCapabilities: ['chauffeur_service', 'driver_assignment', 'driver_schedule'], addFulfilmentModes: ['chauffeured_rental'], requireOperationalFields: ['driver_pool', 'driver_eligibility_policy', 'shared_vehicle_driver_reservation_interval'] }, 'A rental with a driver stays in WF_RENTAL and reserves both vehicle and qualified driver for the rental interval. A standalone passenger-transfer workflow requires a separately selected and configured activity.');
  for (const field of ['recurring_sessions', 'recurring_sub', 'subscription_plans', 'subscription_boxes', 'subscription_bouquets', 'subscription_available', 'membership_available']) {
    if (has(field)) add(field, { addWorkflowIds: ['WF_MEMBERSHIP'], addCapabilities: ['recurring_schedule', 'plan_renewals'], addOfferingSchemaIds: ['MEMBERSHIP_PLAN_V1'], requireOperationalFields: ['recurrence_rule', 'exception_dates', 'renewal_policy'] }, 'A recurring plan schedules explicitly allocated sessions, visits or deliveries; charging requires separate consent and provider capability.');
  }
  if (has('installation_service')) add('installation_service', { addWorkflowIds: ['WF_FIELD_SERVICE'], addCapabilities: ['linked_installation_jobs', 'service_areas'], addOfferingSchemaIds: ['FIELD_SERVICE_V1'], addFulfilmentModes: ['installation_visit'], requireOperationalFields: ['installation_duration_minutes', 'installer_pool', 'service_area'] }, 'Installation remains a linked visit after product delivery and requires its own completion evidence.');
  for (const field of ['custom_orders', 'custom_tailoring', 'custom_cake_design', 'custom_curation']) if (has(field)) add(field, { addWorkflowIds: ['WF_MADE_TO_ORDER'], addCapabilities: ['specification_approval', 'production_schedule'], addOfferingSchemaIds: ['MADE_TO_ORDER_V1'], requireOperationalFields: ['production_lead_time', 'approval_policy'] }, 'Custom work preserves an agreed specification and production promise.');
  for (const field of ['style_consultation', 'custom_routine_consult', 'personal_training_available', 'appointment_booking']) if (has(field)) add(field, { addWorkflowIds: ['WF_APPOINTMENT'], addCapabilities: ['appointments', 'resource_schedule'], addOfferingSchemaIds: ['SERVICE_APPOINTMENT_V1'], requireOperationalFields: ['appointment_duration_minutes', 'resource_selection_mode'] }, 'Consultation or appointment work consumes a confirmed provider slot.');
  if (has('reservation_system')) add('reservation_system', { addWorkflowIds: ['WF_APPOINTMENT'], addCapabilities: ['table_reservations', 'capacity_schedule'], requireOperationalFields: ['table_or_seating_capacity', 'reservation_duration_minutes'] }, 'A restaurant reservation uses seating capacity separately from kitchen order capacity.');
  if (has('session_format')) {
    add('session_format', { setPrimaryWorkflowId: 'WF_REMOTE_SESSION', addCapabilities: ['remote_sessions'], setFulfilmentModes: ['remote_session'], setAvailabilityModelId: 'AVAIL_RESOURCE_SLOTS_V1' }, 'Online sessions need secure provider handoff and provider slots.', 'equals', 'online');
    add('session_format', { addWorkflowIds: ['WF_REMOTE_SESSION'], addCapabilities: ['remote_sessions'], addFulfilmentModes: ['remote_session'] }, 'Both formats keep separate location choices but share provider capacity.', 'equals', 'both');
  }
  if (has('session_location')) {
    add('session_location', { addWorkflowIds: ['WF_FIELD_SERVICE'], addCapabilities: ['field_service', 'service_areas', 'travel_buffers'], addFulfilmentModes: ['customer_location'] }, 'Client-location training requires travel buffers and a confirmed service area.', 'equals', 'client_location');
    add('session_location', { setPrimaryWorkflowId: 'WF_REMOTE_SESSION', addCapabilities: ['remote_sessions'], setFulfilmentModes: ['remote_session'] }, 'Online training uses provider slots and secure remote handoff.', 'equals', 'online');
    add('session_location', { addWorkflowIds: ['WF_FIELD_SERVICE', 'WF_REMOTE_SESSION'], addCapabilities: ['field_service', 'remote_sessions', 'service_areas'], addFulfilmentModes: ['customer_location', 'remote_session'] }, 'Flexible locations share the same provider capacity and need a per-booking location.', 'equals', 'flexible');
  }
  if (has('group_sessions')) add('group_sessions', { addWorkflowIds: ['WF_GROUP_ACTIVITY'], addCapabilities: ['group_bookings', 'capacity_schedule'], addOfferingSchemaIds: ['GROUP_SESSION_V1'], requireOperationalFields: ['session_capacity'] }, 'Group sessions expose places and an explicit participant limit.');
  if (has('repair_services')) add('repair_services', { addWorkflowIds: ['WF_SERVICE_JOB'], addCapabilities: ['repair_intake', 'assessment_approval'], addOfferingSchemaIds: ['SERVICE_JOB_V1'], requireOperationalFields: ['repair_quote_policy', 'device_data_access_policy'] }, 'Repairs add assessed jobs with customer approval; a device sale alone does not become a repair.', 'nonempty', true);
  if (has('trade_in_program')) add('trade_in_program', { addWorkflowIds: ['WF_SERVICE_JOB'], addCapabilities: ['trade_in_assessment'], requireOperationalFields: ['valuation_approval_policy'] }, 'Trade-in valuation requires an explicit assessment and customer acceptance.');
  if (row.id === 'telecom_services') {
    add('telecom_services_offered', { addWorkflowIds: ['WF_ORDER'], addCapabilities: ['orders', 'stock'], addOfferingSchemaIds: ['PRODUCT_CATALOG_V1'] }, 'Devices are physical product orders while network services use an authorised provider.', 'contains', 'devices');
    add('telecom_services_offered', { addWorkflowIds: ['WF_ORDER'], addCapabilities: ['orders', 'stock'], addOfferingSchemaIds: ['PRODUCT_CATALOG_V1'] }, 'Accessories are physical stock alongside service requests.', 'contains', 'accessories');
  }
  if (has('walk_in_available')) add('walk_in_available', { addCapabilities: ['walk_in_queue'], requireOperationalFields: ['queue_capacity', 'queue_cutoff'] }, 'Walk-ins use the same provider capacity and do not bypass administrative eligibility checks.');
  if (has('emergency_callout')) add('emergency_callout', { addCapabilities: ['priority_dispatch'], requireOperationalFields: ['emergency_rota', 'response_area'] }, 'Emergency availability needs actual on-duty capacity rather than an unrestricted priority button.');
  if (has('pickup_available')) add('pickup_available', { addFulfilmentModes: ['customer_collection'], addCapabilities: ['collection_windows'] }, 'Customer collection is visible only after the merchant confirms a collection point and handover policy.');
  if (has('pickup_delivery')) rules.push(rule(`${row.id}:pickup_delivery:no`, 'pickup_delivery', 'equals', 'no', { removeCapabilities: ['dual_leg_dispatch'], setFulfilmentModes: ['customer_dropoff_and_collection'] }, 'The processing job remains but merchant-arranged rider collection and return are removed.'));
  if (has('retainer_model')) {
    add('retainer_model', { addWorkflowIds: ['WF_MEMBERSHIP'], addCapabilities: ['retainer_scope', 'plan_renewals'] }, 'A retainer defines scope and response commitments; no recurring debit is enabled.', 'equals', 'monthly');
    add('retainer_model', { addWorkflowIds: ['WF_MEMBERSHIP'], addCapabilities: ['retainer_scope', 'plan_renewals'] }, 'One-off requests and retainers remain separately selectable.', 'equals', 'both');
  }
  return rules;
}

function defaultFulfilment(row, spec) {
  if (isFinance(row)) return ['authorised_provider_handoff'];
  if (spec.workflow === 'WF_REMOTE_SESSION') return ['remote_session'];
  if (spec.workflow === 'WF_FREIGHT') return ['confirmed_freight_legs'];
  if (spec.workflow === 'WF_STORAGE') return ['storage_access_and_movements'];
  if (spec.workflow === 'WF_PICKUP_RETURN') return ['collection_processing_return'];
  if (spec.workflow === 'WF_TRANSFER') return row.id === 'meet_greet' ? ['arrival_meet_greet', 'vehicle_leg_if_explicitly_included'] : ['scheduled_passenger_transfer'];
  if (spec.workflow === 'WF_RENTAL') return ['asset_handover_and_return'];
  if (spec.workflow === 'WF_TOUR') return ['confirmed_tour_departure'];
  if (spec.workflow === 'WF_EVENT_SESSION') return ['ticket_issuance_and_event_admission'];
  if (spec.workflow === 'WF_GROUP_ACTIVITY') return ['scheduled_group_session'];
  if (spec.workflow === 'WF_FIELD_SERVICE') return ['customer_location'];
  if (spec.workflow === 'WF_APPOINTMENT') return ['merchant_location'];
  if (spec.workflow === 'WF_REQUEST_QUOTE') return ['agreed_scoped_fulfilment_after_quote'];
  if (spec.workflow === 'WF_SERVICE_JOB') return row.id === 'telecom_services' ? ['authorised_network_provider_handoff'] : ['merchant_location'];
  return ['confirmed_delivery_or_collection'];
}

function specialisedOfferingFields(row, spec) {
  const byWorkflow = {
    WF_ORDER: ['name', 'price_model', 'unit', 'variant', 'stock_policy', 'fulfilment_promise'],
    WF_MADE_TO_ORDER: ['name', 'specification_fields', 'price_model', 'approval_required', 'production_lead_time', 'due_window'],
    WF_APPOINTMENT: ['name', 'duration_minutes', 'provider_pool', 'location_modes', 'price_model', 'cancellation_policy'],
    WF_REMOTE_SESSION: ['name', 'duration_minutes', 'provider_pool', 'remote_handoff_policy', 'price_model', 'cancellation_policy'],
    WF_FIELD_SERVICE: ['name', 'duration_minutes', 'team_or_equipment_pool', 'service_area', 'travel_buffer', 'price_model'],
    WF_RENTAL: ['asset_type', 'asset_id', 'rental_period_unit', 'price_model', 'deposit_terms', 'handover_return_checklist'],
    WF_TRANSFER: ['route_or_service', 'passenger_capacity', 'vehicle_class', 'pickup_policy', 'waiting_policy', 'price_model'],
    WF_EVENT_SESSION: ['event', 'session', 'ticket_class', 'capacity_pool', 'issue_method', 'price_model'],
    WF_GROUP_ACTIVITY: ['activity', 'session_duration', 'instructor_pool', 'participant_capacity', 'equipment_inclusions', 'price_model'],
    WF_TOUR: ['itinerary', 'departure', 'party_capacity', 'guide_vehicle_pool', 'inclusions', 'price_model'],
    WF_REQUEST_QUOTE: ['scope_template', 'required_request_details', 'response_commitment', 'quote_components', 'approval_policy'],
    WF_PICKUP_RETURN: ['service', 'pricing_unit', 'intake_measurement', 'turnaround', 'collection_return_windows', 'care_limitations'],
    WF_MEMBERSHIP: ['plan', 'validity', 'access_scope', 'allocated_session_policy', 'renewal_policy', 'price_model'],
    WF_FREIGHT: ['route', 'cargo_type', 'weight_dimensions', 'chargeable_unit', 'required_documents', 'included_legs', 'quote_policy'],
    WF_STORAGE: ['space_type', 'area_volume_unit', 'capacity', 'occupancy_period', 'access_windows', 'inbound_outbound_policy'],
    WF_REGULATED_ENQUIRY: ['service_enquiry_type', 'authorised_provider', 'contact_modes', 'provider_disclosures', 'handoff_policy'],
    WF_SERVICE_JOB: ['service', 'intake_fields', 'assessment_policy', 'approval_required', 'completion_check', 'price_model'],
  };
  return { proposedOperationalFields: byWorkflow[spec.workflow], exactTaxonomyFields: clone(row.fields), requiresNewOperationalCapture: true };
}

function profileFor(row) {
  const spec = specifications.get(row.id);
  assert(spec, `Missing explicit specialty specification ${row.id}`);
  const base = baseFor(spec.workflow);
  const conditions = conditionalRules(row, spec);
  const sourceFields = row.fields.map(field => ({ field, questionId: questionId(field), readPath: `answers.${field}`, currentCapture: row.fieldCoverage.find(x => x.key === field).generatedQuestionActive ? 'generated_question_active' : row.fieldCoverage.find(x => x.key === field).databaseCategoryQuestionExactKeyMatch ? 'database_exact_key_question' : 'not_collected_under_this_exact_key_in_step_2', proposedUse: conditions.some(x => x.field === field) ? 'conditional_portal_configuration' : /license|authenticity|halal|dermatologist|insurance/.test(field) ? 'disclosure_or_verification_input' : /time|hours|duration|advance|capacity|size|fleet|headcount|nights/.test(field) ? 'operational_setup_input_requiring_typed_confirmation' : 'specialty_schema_and_discovery_attribute' }));
  const screenConfiguration = Object.fromEntries(screens.map((id, index) => [id, { featureReference: featureIds[index], profileReference: `MP_${row.id}`, status }]));
  screenConfiguration.SC_WORK = { ...screenConfiguration.SC_WORK, title: spec.workNoun.charAt(0).toUpperCase() + spec.workNoun.slice(1) + 's', defaultWorkflowId: spec.workflow, listFields: base[3], specialtyContextFields: clone(row.fields), primaryAction: spec.workflow === 'WF_REGULATED_ENQUIRY' ? 'Review enquiry and arrange provider handoff' : spec.workflow === 'WF_REQUEST_QUOTE' || spec.workflow === 'WF_FREIGHT' ? 'Review request and prepare scoped quote' : spec.workflow === 'WF_STORAGE' ? 'Review allocation and next movement' : 'Review the next permitted workflow step', defaultView: viewFor(spec.workflow), resolutionBinding: 'resolvedScreenVariants.SC_WORK replaces these base defaults after answer resolution, including vocabulary, list fields and view.', customerDetailPolicy: isHealth(row) ? 'administrative_reference_and_contact_only_no_clinical_content' : isRestricted(row) ? 'private_sensitive_summary' : 'role_scoped_customer_details' };
  screenConfiguration.SC_OFFERINGS = { ...screenConfiguration.SC_OFFERINGS, title: spec.offeringNoun.charAt(0).toUpperCase() + spec.offeringNoun.slice(1) + 's', primarySchemaId: base[0], conditionalSchemaIds: unique(conditions.flatMap(x => x.effect.addOfferingSchemaIds ?? [])), fields: specialisedOfferingFields(row, spec), publishGate: 'Required setup and truthful source authority; additional category review where configured.' };
  screenConfiguration.SC_AVAILABILITY = { ...screenConfiguration.SC_AVAILABILITY, primaryModelId: base[1], timezone: 'merchant_configured_timezone', sharedCapacityRule: 'All enabled workflows sharing the same staff, asset, stock or space reserve the same capacity pool.', specialtyInputs: row.fields.filter(x => /time|hours|duration|advance|capacity|size|fleet|headcount|nights|24hr|booking|recurring|subscription/.test(x)), operationalQuestions: ['Q_SERVICE_LOCATION_MODE', 'Q_APPOINTMENT_DURATION_MINUTES', 'Q_BOOKING_LEAD_TIME_MINUTES', 'Q_SERVICE_AREA', 'Q_RESOURCE_SELECTION_MODE'], questionRelevance: 'Ask only questions needed by the resolved enabled workflow and location modes.' };
  screenConfiguration.SC_BUSINESS = { ...screenConfiguration.SC_BUSINESS, specialtyLabel: row.name, publicFacts: clone(row.fields), privateVerificationFields: row.fields.filter(x => /license|insurance|authenticity|halal|dermatologist/.test(x)), fulfilmentPolicy: defaultFulfilment(row, spec), unresolvedFacts: row.fields.filter(field => sourceFields.find(x => x.field === field).currentCapture === 'not_collected_under_this_exact_key_in_step_2'), note: spec.distinction };
  screenConfiguration.SC_MONEY = { ...screenConfiguration.SC_MONEY, model: 'merchant_revenue_and_settlement_for_enabled_commercial_work', rateSource: 'approved_versioned_finance_configuration', lines: ['gross_customer_charge_when_known', 'agreed_adjustments', 'configured_fees', 'refunds', 'net_merchant_settlement', 'payout_status'], specialisedPolicy: isFinance(row) ? 'Show only NexG merchant service fees/revenue actually recorded. Never show customer bank balances, FX positions, remittance balances, lending decisions or executable financial rails.' : isHealth(row) ? 'Billing references only; no diagnosis or clinical details in invoice summaries.' : spec.workflow === 'WF_RENTAL' ? 'Separate refundable security deposits from earned rental revenue; configure release authority.' : spec.workflow === 'WF_REQUEST_QUOTE' || spec.workflow === 'WF_FREIGHT' ? 'Show quoted versus accepted amounts and approved changes; a quote is not earned revenue.' : 'Revenue recognition and settlement follow the approved finance configuration and actual completion evidence.' };
  screenConfiguration.SC_PROMOTIONS = { ...screenConfiguration.SC_PROMOTIONS, targets: ['enabled_offering', 'confirmed_available_session_or_stock', 'eligible_discovery_placement'], categoryReview: isRestricted(row) || isFinance(row) || isHealth(row) || row.categoryId === 'pharmacy' ? 'configured_eligibility_and_content_review_required' : 'configured_business_eligibility', limits: ['No unsupported availability or outcome claims.', 'Campaign scope is limited to offerings and fulfilment modes actually enabled.', 'Eligibility failure remains visible with a reason and remedy.'] };
  screenConfiguration.SC_INSIGHTS = { ...screenConfiguration.SC_INSIGHTS, primaryMetricIds: base[4], resolutionBinding: 'resolvedScreenVariants.SC_INSIGHTS recomputes the primary metric set after workflow replacement and keeps secondary workflow metric sets separate.', filters: ['workflow', 'offering', 'date_range', 'branch_or_resource_when_applicable', 'source'], definitionRequirement: 'Each metric has a visible definition, time range, comparison basis and last update.', excludedMetrics: isHealth(row) ? ['clinical_outcomes', 'diagnosis', 'therapy_notes', 'test_results'] : isFinance(row) ? ['customer_account_balances', 'FX_positions', 'lending_outcomes', 'remittance_funds'] : [], conditionalMetricsRule: 'Show conditional workflow metrics only after that workflow is enabled and data is available.' };
  screenConfiguration.SC_SETTINGS = { ...screenConfiguration.SC_SETTINGS, tabs: ['people_and_permissions', 'source_systems_and_authority', 'notifications', 'workflow_policies', 'audit_and_change_history'], sourceModes: ['NATIVE', 'EXTERNAL', 'HYBRID_BY_DATA_CLASS', 'MANUAL'], authorityByDataClass: ['work_items', 'offerings', 'availability', 'finance', 'business_identity'], requiredGrants: ['profile.read', 'work.read', 'work.transition', 'offerings.read', 'offerings.write', 'availability.read', 'availability.write', 'money.read'], sensitiveGrantRules: ['Money visibility and refunds require explicit separate grants.', 'External writes require provider authorisation and action mapping as well as the local role grant.', 'Changing taxonomy or capabilities produces a preview and audited configuration revision.'] };
  return { id: `MP_${row.id}`, status, categoryId: row.categoryId, subcategoryId: row.id, name: row.name, individuallyReviewedProposal: true, source: { taxonomy: 'packages/contracts/src/taxonomy.ts', line: row.taxonomySourceLine, audit: '../audits/merchant-onboarding-128-taxonomy.json' }, rawTaxonomy: { fields: clone(row.fields), workflowHint: row.workflowHint, fulfillmentHint: row.fulfillmentHint, defaultWorkflow: row.defaultWorkflow, cardKind: row.categoryCardKind, etaStyle: row.categoryEtaStyle, suggestedItemCount: row.suggestedItemCount }, rationale: spec.distinction, primaryWorkflowId: spec.workflow, conditionalWorkflowIds: unique(conditions.flatMap(x => [...(x.effect.addWorkflowIds ?? []), ...(x.effect.setPrimaryWorkflowId ? [x.effect.setPrimaryWorkflowId] : [])])), baseCapabilities: clone(base[2]), offeringSchemaId: base[0], availabilityModelId: base[1], proposedFulfilmentModes: defaultFulfilment(row, spec), vocabulary: { workSingular: spec.workNoun, offeringSingular: spec.offeringNoun, memberOrCustomer: isHealth(row) ? 'client/patient administrative reference' : isFinance(row) ? 'enquirer' : 'customer', terminologyRule: 'Status labels follow the enabled workflow; never inherit cooking or rider labels outside applicable delivery work.' }, exactOnboardingFields: sourceFields, conditionalRules: conditions, missingInputPolicy: 'Required answer absent is unresolved, not false. Keep the affected capability unconfigured and ask its relevant question. Preserve unaffected work.', crossFieldConflictPolicy: 'Resolve contradictions before publishing. Do not infer unsupported service, transport, financial authority or external permissions.', requiredOperationalSetup: ['confirmed_work_intake_policy', 'typed_price_and_unit_model', 'workflow_relevant_availability', 'confirmed_fulfilment_modes', 'source_authority_per_data_class', 'role_permissions'], screenConfiguration, categoryExceptions: [spec.distinction, ...(isFinance(row) ? ['Regulated enquiry and authorised provider handoff only; no implied financial transaction execution.'] : []), ...(isHealth(row) ? ['Administrative scheduling and fulfilment coordination only; clinical content remains in authorised provider systems.'] : []), ...(row.defaultWorkflow ? [] : ['The existing defaultWorkflow is empty; the proposed workflow here is a new planning decision, not an existing implementation.'])], baselineFixtureAnswers: fixtureAnswers(row, spec) };
}

function normalizeConditionInput(question, rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return undefined;
  if (question.valueSchema.type === 'boolean') return rawValue === true || rawValue === 'yes' ? true : rawValue === false || rawValue === 'no' ? false : undefined;
  return rawValue;
}
function matches(value, condition) {
  if (value === undefined || value === null) return false;
  if (condition.op === 'eq') return value === condition.value;
  if (condition.op === 'contains') return Array.isArray(value) && value.includes(condition.value);
  if (condition.op === 'nonempty') return Array.isArray(value) ? value.length > 0 : value !== '';
  throw new Error('Unknown proposed predicate');
}

function resolvedNoun(profile, workflowId) {
  if (!workflowId) return 'business setup';
  if (workflowId === profile.primaryWorkflowId) return profile.vocabulary.workSingular;
  const scoped = {
    'makeup:WF_SERVICE_JOB': 'makeup job', 'haircare:WF_SERVICE_JOB': 'hair service job', 'battery_service:WF_SERVICE_JOB': 'battery job',
    'mental_health:WF_REMOTE_SESSION': 'remote therapy session', 'coaching:WF_REMOTE_SESSION': 'remote coaching session', 'personal_training:WF_REMOTE_SESSION': 'remote training session',
    'coaching:WF_GROUP_ACTIVITY': 'group coaching session', 'personal_training:WF_GROUP_ACTIVITY': 'group training session',
    'adult_wellness:WF_FIELD_SERVICE': 'wellness service visit', 'adult_wellness:WF_APPOINTMENT': 'wellness appointment', 'skincare:WF_APPOINTMENT': 'skincare consultation', 'skincare:WF_FIELD_SERVICE': 'skincare service visit',
    'furniture:WF_FIELD_SERVICE': 'installation visit', 'appliances:WF_FIELD_SERVICE': 'installation visit', 'smart_devices:WF_FIELD_SERVICE': 'installation visit',
    'car_wash:WF_FIELD_SERVICE': 'mobile wash job', 'tire_service:WF_FIELD_SERVICE': 'mobile tire job', 'clinics:WF_FIELD_SERVICE': 'home visit', 'labs:WF_FIELD_SERVICE': 'sample collection visit',
  };
  const byFamily = { WF_ORDER: 'product order', WF_MADE_TO_ORDER: 'custom order', WF_APPOINTMENT: 'appointment', WF_REMOTE_SESSION: 'remote session', WF_FIELD_SERVICE: 'service visit', WF_RENTAL: 'rental', WF_TRANSFER: 'transfer', WF_EVENT_SESSION: 'event booking', WF_GROUP_ACTIVITY: 'group session', WF_TOUR: 'tour booking', WF_REQUEST_QUOTE: 'request', WF_PICKUP_RETURN: 'collection and return job', WF_MEMBERSHIP: 'plan', WF_FREIGHT: 'shipment', WF_STORAGE: 'storage allocation', WF_REGULATED_ENQUIRY: 'provider enquiry', WF_SERVICE_JOB: 'service job' };
  return scoped[`${profile.subcategoryId}:${workflowId}`] ?? byFamily[workflowId];
}

/** Simulates this planning table. Passing its assertions does not validate app behavior. */
function resolveProposal(profile, fixture) {
  const result = { profileId: profile.id, primaryWorkflowId: profile.primaryWorkflowId, enabledWorkflowIds: [profile.primaryWorkflowId], capabilities: clone(profile.baseCapabilities), offeringSchemaIds: [profile.offeringSchemaId], availabilityModelId: profile.availabilityModelId, fulfilmentModes: clone(profile.proposedFulfilmentModes), intakePolicy: fixture.operationalAnswers.intake_policy, requiredOperationalFields: [], appliedRuleIds: [], unresolvedConditionalFields: [], invalidConditionalFields: [], screenIds: clone(screens), primaryWorkNoun: profile.vocabulary.workSingular, sourceMode: fixture.sourceMode, crossScreenWritePolicy: 'per_data_class_authority_and_explicit_grant', modelClarificationRequired: false };
  for (const condition of profile.conditionalRules) {
    const question = questions.get(condition.questionId);
    const rawValue = fixture[condition.source]?.[condition.field];
    const value = normalizeConditionInput(question, rawValue);
    if (rawValue === undefined || rawValue === null || rawValue === '') { result.unresolvedConditionalFields.push(condition.field); continue; }
    const schema = question.valueSchema;
    if (value === undefined || (schema.type === 'array' && (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || (schema.items?.enum && value.some(item => !schema.items.enum.includes(item))))) || (schema.enum && !schema.enum.includes(value))) { result.invalidConditionalFields.push(condition.field); continue; }
    if (!matches(value, condition.condition)) continue;
    const e = condition.effect;
    result.appliedRuleIds.push(condition.id);
    if (e.setPrimaryWorkflowId) {
      const previousPrimary = result.primaryWorkflowId;
      const previousShape = baseFor(previousPrimary);
      const nextShape = baseFor(e.setPrimaryWorkflowId);
      result.primaryWorkflowId = e.setPrimaryWorkflowId;
      result.enabledWorkflowIds = [e.setPrimaryWorkflowId, ...result.enabledWorkflowIds.filter(x => x !== previousPrimary)];
      result.capabilities = unique([...result.capabilities.filter(x => !previousShape[2].includes(x)), ...nextShape[2]]);
      result.offeringSchemaIds = unique([nextShape[0], ...result.offeringSchemaIds.filter(x => x !== previousShape[0])]);
      result.availabilityModelId = nextShape[1];
    }
    for (const [property, addition, removal] of [['enabledWorkflowIds', 'addWorkflowIds', 'removeWorkflowIds'], ['capabilities', 'addCapabilities', 'removeCapabilities'], ['offeringSchemaIds', 'addOfferingSchemaIds', 'removeOfferingSchemaIds'], ['fulfilmentModes', 'addFulfilmentModes', 'removeFulfilmentModes']]) result[property] = unique([...result[property], ...(e[addition] ?? [])]).filter(x => !(e[removal] ?? []).includes(x));
    if (e.setAvailabilityModelId) result.availabilityModelId = e.setAvailabilityModelId;
    if (e.setFulfilmentModes) result.fulfilmentModes = clone(e.setFulfilmentModes);
    if (e.setIntakePolicy) result.intakePolicy = e.setIntakePolicy;
    result.requiredOperationalFields.push(...(e.requireOperationalFields ?? []));
    if (e.requireModelClarificationIfNoWorkflow && result.enabledWorkflowIds.length === 0) result.modelClarificationRequired = true;
  }
  result.unresolvedConditionalFields = unique(result.unresolvedConditionalFields);
  result.invalidConditionalFields = unique(result.invalidConditionalFields);
  result.requiredOperationalFields = unique(result.requiredOperationalFields);
  if (!result.enabledWorkflowIds.includes(result.primaryWorkflowId)) {
    result.primaryWorkflowId = result.enabledWorkflowIds[0] ?? null;
    if (result.primaryWorkflowId) {
      const replacement = baseFor(result.primaryWorkflowId);
      result.offeringSchemaIds = unique([replacement[0], ...result.offeringSchemaIds]);
      result.capabilities = unique([...result.capabilities, ...replacement[2]]);
      result.availabilityModelId = replacement[1];
    } else result.modelClarificationRequired = true;
  }
  result.modelClarificationRequired = result.enabledWorkflowIds.length === 0;
  result.primaryWorkNoun = resolvedNoun(profile, result.primaryWorkflowId);
  const primaryShape = result.primaryWorkflowId ? baseFor(result.primaryWorkflowId) : null;
  const secondaryIds = result.enabledWorkflowIds.filter(id => id !== result.primaryWorkflowId);
  result.resolvedScreenVariants = {
    SC_WORK: { primaryWorkflowId: result.primaryWorkflowId, primaryWorkNoun: result.primaryWorkNoun, defaultView: viewFor(result.primaryWorkflowId), listFields: primaryShape ? clone(primaryShape[3]) : [], secondaryWorkflowViews: secondaryIds.map(workflowId => ({ workflowId, workNoun: resolvedNoun(profile, workflowId), defaultView: viewFor(workflowId), listFields: clone(baseFor(workflowId)[3]) })), definitionPolicy: 'Available workflow views only; actual selected fulfilment and registered execution rules decide whether a work item or linked child exists.' },
    SC_OFFERINGS: { primarySchemaId: primaryShape?.[0] ?? null, configuredSchemaIds: clone(result.offeringSchemaIds) },
    SC_AVAILABILITY: { primaryModelId: result.primaryWorkflowId ? result.availabilityModelId : null, secondaryWorkflowModels: secondaryIds.map(workflowId => ({ workflowId, modelId: baseFor(workflowId)[1] })), capacityPolicy: 'Shared resources remain one constrained pool across primary and secondary definitions.' },
    SC_INSIGHTS: { primaryWorkflowId: result.primaryWorkflowId, primaryMetricIds: primaryShape ? clone(primaryShape[4]) : [], secondaryMetricSets: secondaryIds.map(workflowId => ({ workflowId, metricIds: clone(baseFor(workflowId)[4]) })), dataPolicy: 'Definition references only. Show a series only when authorised data exists; enabling a workflow does not create performance data.' },
  };
  const sourceCanWrite = (dataClass, action) => {
    const authority = fixture.authority[dataClass];
    if (authority === 'READ_ONLY_EXTERNAL') return false;
    if (authority === 'NEXG_AUTHORITATIVE') return true;
    return fixture.connectionState === 'connected' && fixture.providerGrants.includes(action) && fixture.providerActionMappings.includes(action);
  };
  result.workCommandAuthorityAndRoleSatisfied = fixture.permissionGrants.includes('work.transition') && sourceCanWrite('work_items', 'work.transition') && !result.modelClarificationRequired;
  result.offeringEditAuthorityAndRoleSatisfied = fixture.permissionGrants.includes('offerings.write') && sourceCanWrite('offerings', 'offerings.write');
  result.moneyViewRoleSatisfied = fixture.permissionGrants.includes('money.read');
  result.newIntakeConfigurationUnblocked = !result.modelClarificationRequired && result.unresolvedConditionalFields.length === 0 && result.invalidConditionalFields.length === 0;
  result.operationalReady = 'UNVERIFIED';
  result.remainingOperationalPrerequisites = ['published_reviewed_configuration', 'required_offering_data', 'confirmed_resources_and_capacity', 'relevant_fulfilment_setup', 'required_provider_authorisation_and_mapping', 'business_verification_and_finance_setup_where_applicable'];
  result.commandExecutionGuards = 'NOT_EVALUATED: no real task state, expected version, live resource reservation, valid command input or authoritative completion evidence was supplied.';
  result.unknownAnswerPolicy = 'Hold affected new configuration/intake until required specialty answers are resolved. Existing accepted work retains its previously accepted configuration version.';
  result.connectionMessage = fixture.connectionState === 'authorisation_required' ? 'Authorise the connected provider before external actions become available.' : fixture.connectionState === 'stale' ? 'Source data is stale; show last update and follow the configured action policy.' : null;
  result.financialRailsEnabled = false;
  result.clinicalRecordsEnabled = false;
  result.manualEvidenceRequired = fixture.sourceMode === 'MANUAL';
  return result;
}

function fixtureFor(profile) {
  return { merchantFixtureId: `TEST_${profile.subcategoryId}`, categoryId: profile.categoryId, subcategoryId: profile.subcategoryId, answers: clone(profile.baselineFixtureAnswers), operationalAnswers: clone(baselineOperationalAnswers), operationalAnswerApplicability: 'Reusable example defaults apply only when required by enabled workflows. Unrelated appointment, resource or service-area defaults are ignored and never required for other models.', sourceMode: 'NATIVE', connectionState: 'not_required', permissionGrants: ['profile.read', 'work.read', 'work.transition', 'offerings.read', 'offerings.write', 'availability.read', 'availability.write', 'money.read'], providerGrants: [], providerActionMappings: [], authority: { work_items: 'NEXG_AUTHORITATIVE', offerings: 'NEXG_AUTHORITATIVE', availability: 'NEXG_AUTHORITATIVE', finance: 'NEXG_AUTHORITATIVE', business_identity: 'NEXG_AUTHORITATIVE' }, fixtureScope: 'Proposed resolver inputs. Taxonomy answers preserve source keys; newly required operational decisions are in operationalAnswers. They do not represent a submitted real merchant or prove publication/readiness.' };
}
function matchedValue(condition) { const raw = condition.authoringPredicate; return raw.operator === 'contains' ? [raw.value] : raw.operator === 'nonempty' ? ['diagnostics'] : raw.value; }
function unmatchedValue(condition) { const raw = condition.authoringPredicate; return raw.operator === 'contains' || raw.operator === 'nonempty' ? [] : raw.value === 'yes' ? 'no' : raw.value === 'no' ? 'yes' : raw.value === 'online' ? 'in_person' : raw.value === 'both' ? 'in_person' : raw.value === 'monthly' ? 'one_off' : 'venue'; }

function acceptanceFor(profile, index) {
  const baseline = fixtureFor(profile);
  const variants = [];
  for (const condition of profile.conditionalRules) {
    for (const [suffix, value] of [['enabled', matchedValue(condition)], ['not_matched', unmatchedValue(condition)], ['unknown', null]]) {
      const fixture = clone(baseline); fixture[condition.source][condition.field] = value;
      variants.push({ id: `${condition.id}:${suffix}`, name: `${condition.questionId} ${suffix}`, input: fixture, expected: resolveProposal(profile, fixture), assertions: suffix === 'unknown' ? [`${condition.field} remains unresolved and is not treated as no.`, 'Unaffected capabilities remain usable subject to source authority and grants.'] : [condition.explanation, 'The same specialty retains its own vocabulary and all eight screen references.'] });
    }
  }
  const readOnly = clone(baseline); readOnly.sourceMode = 'EXTERNAL'; readOnly.connectionState = 'connected'; readOnly.authority.work_items = 'READ_ONLY_EXTERNAL'; readOnly.authority.offerings = 'READ_ONLY_EXTERNAL';
  variants.push({ id: `${profile.subcategoryId}:external_read_only`, name: 'External work and offerings retain provider authority', input: readOnly, expected: resolveProposal(profile, readOnly), assertions: ['Work and offerings display the provider/source and last update.', 'Local transition and edit controls explain that the provider owns the write.', 'A local role grant never overrides external read-only authority.'] });
  const hybrid = clone(baseline); hybrid.sourceMode = 'HYBRID_BY_DATA_CLASS'; hybrid.connectionState = 'connected'; hybrid.authority.offerings = 'READ_ONLY_EXTERNAL';
  variants.push({ id: `${profile.subcategoryId}:hybrid`, name: 'Native work with external catalogue authority', input: hybrid, expected: resolveProposal(profile, hybrid), assertions: ['Work transitions can remain native while offering writes remain external.', 'No category switch or manual UI page replacement is needed.'] });
  const pending = clone(baseline); pending.sourceMode = 'EXTERNAL'; pending.connectionState = 'authorisation_required'; pending.authority.work_items = 'EXTERNAL_AUTHORITATIVE'; pending.authority.offerings = 'EXTERNAL_AUTHORITATIVE';
  variants.push({ id: `${profile.subcategoryId}:connection_pending`, name: 'Requested external connection has no action authority yet', input: pending, expected: resolveProposal(profile, pending), assertions: ['The screen shows the connection requirement.', 'Selecting a system during onboarding does not authorise any external write.'] });
  const externalNoScope = clone(pending); externalNoScope.connectionState = 'connected';
  variants.push({ id: `${profile.subcategoryId}:provider_scope_missing`, name: 'Connected provider has no mapped write permission', input: externalNoScope, expected: resolveProposal(profile, externalNoScope), assertions: ['A connected account does not imply any requested write scope or action mapping.', 'Both work and catalogue writes remain unavailable until provider grants and mappings are confirmed.'] });
  const externalWritable = clone(externalNoScope); externalWritable.providerGrants = ['work.transition', 'offerings.write']; externalWritable.providerActionMappings = ['work.transition', 'offerings.write'];
  variants.push({ id: `${profile.subcategoryId}:provider_write_confirmed`, name: 'Scoped authorised external commands follow mapped provider actions', input: externalWritable, expected: resolveProposal(profile, externalWritable), assertions: ['Local permissions, provider scope and mapped action are all required.', 'An enabled command still remains pending until the external owner confirms its result.'] });
  const viewer = clone(baseline); viewer.permissionGrants = ['profile.read', 'work.read', 'offerings.read', 'availability.read'];
  variants.push({ id: `${profile.subcategoryId}:limited_staff`, name: 'Read-only staff member with no money permission', input: viewer, expected: resolveProposal(profile, viewer), assertions: ['Work remains readable but transitions and catalogue edits are unavailable.', 'Money access is denied with the relevant role explanation rather than exposing amounts.'] });
  const manual = clone(baseline); manual.sourceMode = 'MANUAL';
  variants.push({ id: `${profile.subcategoryId}:manual_source`, name: 'Manual records retain a named author and evidence', input: manual, expected: resolveProposal(profile, manual), assertions: ['Manual entry is labelled with author, time and evidence requirements.', 'It does not fabricate provider acknowledgements or imply an API connection.', 'Authorised operational completion still requires the workflow evidence and current-state guards.'] });
  return { id: `AC_${String(index + 1).padStart(3, '0')}_${profile.subcategoryId}`, name: `${profile.name}: ${profile.vocabulary.workSingular} portal configuration`, status, profileId: profile.id, input: baseline, expected: resolveProposal(profile, baseline), checks: [{ target: 'SC_WORK', expected: `${profile.primaryWorkflowId} terminology and ${profile.vocabulary.workSingular} details; ${profile.rationale}` }, { target: 'SC_OFFERINGS', expected: `${profile.offeringSchemaId}; exact specialty inputs ${profile.rawTaxonomy.fields.join(', ')}.` }, { target: 'SC_AVAILABILITY', expected: `${profile.availabilityModelId} with confirmed shared resources and typed operational values.` }, { target: 'SC_BUSINESS', expected: `${profile.name} identity, configured fulfilment modes and review/disclosure facts.` }, { target: 'SC_MONEY', expected: profile.screenConfiguration.SC_MONEY.specialisedPolicy }, { target: 'SC_PROMOTIONS', expected: profile.screenConfiguration.SC_PROMOTIONS.categoryReview }, { target: 'SC_INSIGHTS', expected: profile.screenConfiguration.SC_INSIGHTS.primaryMetricIds.join(', ') }, { target: 'SC_SETTINGS', expected: 'Per-data-class source authority and explicit role grants; connected provider authorisation is separate.' }], variants, operationalVerificationStatus: 'NOT_IMPLEMENTED_NOT_RUN_AGAINST_APPLICATION' };
}

const profiles = audit.rows.map(profileFor);
const acceptanceCases = profiles.map(acceptanceFor);
const derived = {
  generatedAtClientDate: '2026-10-29', status, schemaVersion: 1,
  warning: 'Proposed portal configuration and planning fixtures. This file is not a deployed app registry, an implemented adapter or evidence of operational validation.',
  resolverConvention: { existingAnswers: 'answers.<exact_taxonomy_source_key>', questionIds: 'Q_<UPPERCASE_SOURCE_KEY>', operationalAnswers: 'operationalAnswers.<canonical_key>', conditionFormat: 'The authoringPredicate preserves raw input spelling; condition is the shared bounded path/op/value AST compiled through question-registry canonicalTarget and typed normalization. No separate runtime condition language is proposed.', enabledWorkflowIdsMeaning: 'Available configured workflow definitions only. Enabling a definition does not instantiate a child task, dispatch, reservation, invoice or charge. An actual selected offering/fulfilment mode and a registered execution rule must request any linked child; parent/child identity, shared capacity and billing ownership prevent duplicate work or charges.', rentalDriverPolicy: 'with_driver enables driver assignment and joint vehicle/driver reservation inside WF_RENTAL. It never enables WF_TRANSFER by itself. Standalone transfer work requires a separately selected and configured transfer activity.', unknown: 'Missing answers remain unresolved; never silently convert them to false or invent a provider capability.', hierarchy: ['taxonomy selects a proposed specialty profile', 'confirmed answers add or restrict capabilities', 'operating mode and resources confirm applicability', 'source authority and role grants determine permitted actions', 'configuration revision is previewed and audited'], schemaMappingNote: 'All schema and availability IDs here are proposal references. The shared workflow document defines state behavior; these local schema references describe the required offering/availability shape.' },
  sourceModes: ['NATIVE', 'EXTERNAL', 'HYBRID_BY_DATA_CLASS', 'MANUAL'], authorityModes: ['NEXG_AUTHORITATIVE', 'EXTERNAL_AUTHORITATIVE', 'SHARED_WITH_RULES', 'READ_ONLY_EXTERNAL'],
  screenIds: screens,
  workflowShapeReferences: Object.fromEntries(Object.entries(workflowDefinitions).map(([id, value]) => [id, { offeringSchemaId: value[0], availabilityModelId: value[1], capabilities: value[2], workSummaryFields: value[3], metrics: value[4] }])),
  summary: { profiles: profiles.length, categories: new Set(profiles.map(p => p.categoryId)).size, primaryWorkflowIds: unique(profiles.map(p => p.primaryWorkflowId)), conditionalRules: profiles.reduce((n, p) => n + p.conditionalRules.length, 0), acceptanceCases: acceptanceCases.length, answerAndAuthorityVariantCases: acceptanceCases.reduce((n, p) => n + p.variants.length, 0), eightScreenConfigurations: profiles.length * screens.length },
  profiles,
};

function validate() {
  assert.equal(profiles.length, 128);
  assert.equal(acceptanceCases.length, 128);
  assert.equal(new Set(profiles.map(p => p.subcategoryId)).size, 128);
  assert.equal(new Set(acceptanceCases.map(c => c.id)).size, 128);
  for (const p of profiles) {
    assert(workflowDefinitions[p.primaryWorkflowId]);
    assert.deepEqual(p.rawTaxonomy.fields, audit.rows.find(r => r.id === p.subcategoryId).fields);
    assert.equal(Object.keys(p.screenConfiguration).length, 8);
    assert.deepEqual(Object.keys(p.screenConfiguration), screens);
    for (const r of p.conditionalRules) {
      assert(p.rawTaxonomy.fields.includes(r.field), `${p.id} rule uses undeclared source field ${r.field}`);
      assert.equal(r.condition.path, questions.get(r.questionId).canonicalTarget);
      for (const id of [...(r.effect.addWorkflowIds ?? []), ...(r.effect.setPrimaryWorkflowId ? [r.effect.setPrimaryWorkflowId] : [])]) assert(workflowDefinitions[id]);
    }
  }
  for (const c of acceptanceCases) {
    assert.equal(c.expected.screenIds.length, 8);
    assert.equal(c.checks.length, 8);
    assert.equal(c.expected.financialRailsEnabled, false);
    assert.equal(c.expected.clinicalRecordsEnabled, false);
    for (const v of c.variants) {
      assert.equal(v.expected.financialRailsEnabled, false);
      assert.equal(v.expected.clinicalRecordsEnabled, false);
      if (v.id.endsWith(':external_read_only') || v.id.endsWith(':connection_pending') || v.id.endsWith(':limited_staff') || v.id.endsWith(':provider_scope_missing')) { assert.equal(v.expected.workCommandAuthorityAndRoleSatisfied, false); assert.equal(v.expected.offeringEditAuthorityAndRoleSatisfied, false); }
      if (v.id.endsWith(':provider_write_confirmed')) { assert.equal(v.expected.workCommandAuthorityAndRoleSatisfied, true); assert.equal(v.expected.offeringEditAuthorityAndRoleSatisfied, true); }
      if (v.id.endsWith(':hybrid')) { assert.equal(v.expected.workCommandAuthorityAndRoleSatisfied, true); assert.equal(v.expected.offeringEditAuthorityAndRoleSatisfied, false); }
      if (v.id.endsWith(':limited_staff')) assert.equal(v.expected.moneyViewRoleSatisfied, false);
      if (v.id.endsWith(':manual_source')) assert.equal(v.expected.manualEvidenceRequired, true);
      assert.equal(v.expected.operationalReady, 'UNVERIFIED');
      if (v.id.endsWith(':unknown')) { assert(v.expected.unresolvedConditionalFields.length > 0); assert.equal(v.expected.newIntakeConfigurationUnblocked, false); }
      if (v.expected.primaryWorkflowId) {
        assert(v.expected.enabledWorkflowIds.includes(v.expected.primaryWorkflowId));
        assert(v.expected.offeringSchemaIds.includes(baseFor(v.expected.primaryWorkflowId)[0]));
        assert.deepEqual(v.expected.resolvedScreenVariants.SC_INSIGHTS.primaryMetricIds, baseFor(v.expected.primaryWorkflowId)[4]);
        assert.deepEqual(v.expected.resolvedScreenVariants.SC_WORK.listFields, baseFor(v.expected.primaryWorkflowId)[3]);
        assert.equal(v.expected.resolvedScreenVariants.SC_WORK.defaultView, viewFor(v.expected.primaryWorkflowId));
      } else assert(v.expected.modelClarificationRequired);
    }
  }
  for (const [id, field, value, expectedWorkflow] of [['makeup', 'products_for_sale', 'yes', 'WF_ORDER'], ['car_rental', 'with_driver', 'yes', 'WF_RENTAL'], ['massage', 'home_service', 'yes', 'WF_FIELD_SERVICE'], ['makeup', 'booking_required', 'no', 'WF_SERVICE_JOB'], ['car_wash', 'mobile_service', 'yes', 'WF_FIELD_SERVICE'], ['classes', 'recurring_sessions', 'yes', 'WF_MEMBERSHIP'], ['furniture', 'installation_service', 'yes', 'WF_FIELD_SERVICE']]) {
    const p = profiles.find(x => x.subcategoryId === id); const f = fixtureFor(p); f.answers[field] = value; assert(resolveProposal(p, f).enabledWorkflowIds.includes(expectedWorkflow), `${id}/${field} must enable ${expectedWorkflow}`);
  }
  for (const id of ['car_rental', 'bike_rental']) {
    const p = profiles.find(x => x.subcategoryId === id); const f = fixtureFor(p); f.answers.with_driver = 'yes'; const result = resolveProposal(p, f);
    assert.equal(result.primaryWorkflowId, 'WF_RENTAL');
    assert(!result.enabledWorkflowIds.includes('WF_TRANSFER'));
    assert(result.capabilities.includes('driver_assignment'));
    assert(result.capabilities.includes('driver_schedule'));
    assert(result.requiredOperationalFields.includes('driver_pool'));
    assert(result.requiredOperationalFields.includes('shared_vehicle_driver_reservation_interval'));
  }
  for (const [id, changes, workflowId, noun] of [
    ['makeup', { booking_required: 'no' }, 'WF_SERVICE_JOB', 'makeup job'],
    ['haircare', { booking_required: 'no' }, 'WF_SERVICE_JOB', 'hair service job'],
    ['battery_service', { mobile_service: 'no' }, 'WF_SERVICE_JOB', 'battery job'],
    ['mental_health', { session_format: 'online' }, 'WF_REMOTE_SESSION', 'remote therapy session'],
    ['coaching', { session_format: 'online' }, 'WF_REMOTE_SESSION', 'remote coaching session'],
    ['skincare', { products_for_sale: 'no', home_service: 'yes', custom_routine_consult: 'no' }, 'WF_FIELD_SERVICE', 'skincare service visit'],
    ['skincare', { products_for_sale: 'no', custom_routine_consult: 'yes' }, 'WF_APPOINTMENT', 'skincare consultation'],
    ['fragrances', { products_for_sale: 'no' }, null, 'business setup'],
  ]) {
    const p = profiles.find(x => x.subcategoryId === id); const f = fixtureFor(p); Object.assign(f.answers, changes); const result = resolveProposal(p, f);
    assert.equal(result.primaryWorkflowId, workflowId); assert.equal(result.primaryWorkNoun, noun);
    assert.equal(result.resolvedScreenVariants.SC_WORK.primaryWorkNoun, noun);
    assert.deepEqual(result.resolvedScreenVariants.SC_INSIGHTS.primaryMetricIds, workflowId ? baseFor(workflowId)[4] : []);
  }
  {
    const p = profiles.find(x => x.subcategoryId === 'coaching'); const f = fixtureFor(p); f.answers.group_sessions = 'yes'; const result = resolveProposal(p, f);
    assert.equal(result.primaryWorkflowId, 'WF_APPOINTMENT');
    assert(result.resolvedScreenVariants.SC_WORK.secondaryWorkflowViews.some(v => v.workflowId === 'WF_GROUP_ACTIVITY' && v.workNoun === 'group coaching session'));
    assert(result.resolvedScreenVariants.SC_INSIGHTS.secondaryMetricSets.some(v => v.workflowId === 'WF_GROUP_ACTIVITY'));
  }
  for (const id of ['banking', 'forex', 'insurance', 'payments', 'remittance', 'sacco_services', 'business_services']) assert.equal(profiles.find(p => p.subcategoryId === id).primaryWorkflowId, 'WF_REGULATED_ENQUIRY');
  return true;
}

validate();
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'profiles-128.json'), JSON.stringify(derived, null, 2) + '\n');
fs.writeFileSync(path.join(directory, 'acceptance-128.json'), JSON.stringify({ generatedAtClientDate: '2026-10-29', status, warning: 'Planning acceptance fixtures and expected proposed configuration. No test here proves that the application implements the design.', coverage: derived.summary, acceptanceCases }, null, 2) + '\n');

const md = [
  '# Proposed portal profiles for all 128 merchant specialties', '',
  'These are design and configuration proposals. They are not implemented portal behavior or evidence of operational testing. The existing taxonomy supplies the named specialty, fields and raw hints. This plan adds explicit workflow choices, sensible terminology, answer-dependent capabilities, availability models and eight-screen configuration references.', '',
  `The matrix has ${profiles.length} named profiles across ${derived.summary.categories} categories. The JSON contains ${derived.summary.conditionalRules} answer rules and ${derived.summary.eightScreenConfigurations} screen configurations. The acceptance file contains 128 named specialty cases plus ${derived.summary.answerAndAuthorityVariantCases} answer/authority variants.`, '',
  'Use [profiles-128.json](profiles-128.json) for complete per-specialty configuration, [acceptance-128.json](acceptance-128.json) for input fixtures and expected configuration, and [generate-profiles.mjs](generate-profiles.mjs) to regenerate and validate these planning artifacts.', '',
  '## How a profile adapts', '',
  'Read the exact saved taxonomy field under `answers.<field>` and associate it with `Q_<UPPERCASE_SOURCE_KEY>`. Keep new operational decisions under `operationalAnswers`. A missing answer remains unresolved. Taxonomy and confirmed answers select workflows and required setup; source authority and explicit role grants decide whether an action can execute. External provider authorisation is a separate prerequisite.', '',
  'A specialty can use several workflows. Product sales, home visits, a driver, installations, recurring visits, group sessions and remote sessions are explicit answer overlays. Driver assignment stays inside the rental workflow; a with-driver answer does not create a passenger-transfer offering. Shared staff, asset, stock or space pools prevent conflicting reservations across workflows. A field existing in the taxonomy does not mean the current form collects it or the current app implements its rule.', '',
  '`enabledWorkflowIds` lists available configured definitions. It does not automatically create child tasks, dispatches, reservations or charges. An actual selected offering/fulfilment mode and a registered execution rule determine whether a linked child is needed. Parent/child identity, shared capacity and explicit billing ownership prevent duplicate work and charges. For example, enabling home visits does not create a visit for a merchant-venue appointment.', '',
  'NATIVE, EXTERNAL, HYBRID_BY_DATA_CLASS and MANUAL are proposed source modes. Authority is chosen per data class using NEXG_AUTHORITATIVE, EXTERNAL_AUTHORITATIVE, SHARED_WITH_RULES or READ_ONLY_EXTERNAL. A hybrid business can manage work natively while its catalogue remains read-only from a provider. Money and work-write permissions remain separate.', '',
  'Each profile references SC_WORK, SC_OFFERINGS, SC_AVAILABILITY, SC_BUSINESS, SC_MONEY, SC_PROMOTIONS, SC_INSIGHTS and SC_SETTINGS. The JSON gives each reference concrete workflow, schema, vocabulary, fields, metrics, policies and exceptions. The base feature references are WK01, OF01, AV01, BU01, MO01, PR01, IN01 and SE01.', '',
  'Finance profiles support regulated enquiries and authorised provider handoff. They do not imply financial rails, funds custody, loan decisions, executed FX or policy issuance. Health profiles cover administrative appointments and fulfilment coordination; clinical notes, diagnoses, therapy content and test results remain outside this portal plan.', '',
  '## Individual specialty matrix', '',
  'Conditional workflow IDs below mean candidate capability after a matching confirmed answer and any required setup. They are not all enabled by default. Every row lists its actual specialty fields and a specific operational constraint.', '',
];
for (const categoryId of unique(profiles.map(p => p.categoryId))) {
  md.push(`### ${audit.rows.find(r => r.categoryId === categoryId).categoryName}`, '', '| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |', '|---|---|---|---|---|');
  for (const p of profiles.filter(p => p.categoryId === categoryId)) md.push(`| ${p.name} · ${p.id} | ${p.primaryWorkflowId}; ${p.availabilityModelId}; ${p.vocabulary.workSingular} | ${p.conditionalWorkflowIds.join(', ') || (p.conditionalRules.length ? 'No additional family; answer overlays configure capabilities, resources or fulfilment inside the primary workflow.' : 'No additional family inferred; new activities require a reviewed configuration.')} | ${p.rawTaxonomy.fields.join(', ')} | ${p.rationale} |`);
  md.push('');
}
md.push('## Representative answer variations', '', '| Same specialty | Input change | Expected design behavior |', '|---|---|---|', '| Makeup | products_for_sale yes/no | Add or remove product-order catalogue alongside the service model. |', '| Car rental | with_driver yes/no | Reserve a driver as well as a vehicle only for the chauffeured mode. |', '| Massage | home_service yes/no | Add customer-location visits, travel buffers and service areas only when enabled. |', '| Makeup | booking_required yes/no | Required appointments versus an on-site walk-in job queue. |', '| Car wash | mobile_service yes/no | Add a dispatched visit; retain on-site jobs as a separate mode. |', '| Classes | recurring_sessions yes/no | Add a planned series/membership with exception dates; no automatic debit. |', '| Furniture | installation_service yes/no | Add a linked installation visit; keep delivery completion separate. |', '| Any specialty | EXTERNAL read-only versus HYBRID_BY_DATA_CLASS | Enforce authority per data class across all eight screens. |', '| Any specialty | Limited staff role | Keep permitted work information readable and deny work writes, catalogue writes and money access. |', '', '## Validation and remaining work', '', 'The generator checks 128 unique specialty IDs, one acceptance case per specialty, exact source-field preservation, valid workflow references, eight configured screens per profile, answer-rule provenance, selected cross-answer behaviors, and external/role write restrictions in its planning simulation. The expected configurations are generated by the same planning resolver, so these checks demonstrate internal consistency only. They do not prove product correctness or operational implementation.', '', 'Before implementation, review ambiguous raw taxonomy hints with the merchant operating model, complete typed operational inputs, resolve source field collection gaps, define shared workflow guards and events, specify integration mappings and authority, and carry the design through the screen plans. After implementation, run the acceptance cases against real resolved app configuration and end-to-end behavior. Images follow completion of all eight screen plans and the consistency review.', '');
fs.writeFileSync(path.join(directory, 'profiles-128.md'), md.join('\n'));
console.log(JSON.stringify({ status, ...derived.summary, validation: 'planning_artifacts_internal_consistency_passed', outputs: ['profiles-128.json', 'profiles-128.md', 'acceptance-128.json'] }, null, 2));
