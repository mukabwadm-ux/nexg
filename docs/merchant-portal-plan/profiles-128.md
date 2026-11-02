# Proposed portal profiles for all 128 merchant specialties

These are design and configuration proposals. They are not implemented portal behavior or evidence of operational testing. The existing taxonomy supplies the named specialty, fields and raw hints. This plan adds explicit workflow choices, sensible terminology, answer-dependent capabilities, availability models and eight-screen configuration references.

The matrix has 128 named profiles across 21 categories. The JSON contains 89 answer rules and 1024 screen configurations. The acceptance file contains 128 named specialty cases plus 1163 answer/authority variants.

Use [profiles-128.json](profiles-128.json) for complete per-specialty configuration, [acceptance-128.json](acceptance-128.json) for input fixtures and expected configuration, and [generate-profiles.mjs](generate-profiles.mjs) to regenerate and validate these planning artifacts.

## How a profile adapts

Read the exact saved taxonomy field under `answers.<field>` and associate it with `Q_<UPPERCASE_SOURCE_KEY>`. Keep new operational decisions under `operationalAnswers`. A missing answer remains unresolved. Taxonomy and confirmed answers select workflows and required setup; source authority and explicit role grants decide whether an action can execute. External provider authorisation is a separate prerequisite.

A specialty can use several workflows. Product sales, home visits, a driver, installations, recurring visits, group sessions and remote sessions are explicit answer overlays. Driver assignment stays inside the rental workflow; a with-driver answer does not create a passenger-transfer offering. Shared staff, asset, stock or space pools prevent conflicting reservations across workflows. A field existing in the taxonomy does not mean the current form collects it or the current app implements its rule.

`enabledWorkflowIds` lists available configured definitions. It does not automatically create child tasks, dispatches, reservations or charges. An actual selected offering/fulfilment mode and a registered execution rule determine whether a linked child is needed. Parent/child identity, shared capacity and explicit billing ownership prevent duplicate work and charges. For example, enabling home visits does not create a visit for a merchant-venue appointment.

NATIVE, EXTERNAL, HYBRID_BY_DATA_CLASS and MANUAL are proposed source modes. Authority is chosen per data class using NEXG_AUTHORITATIVE, EXTERNAL_AUTHORITATIVE, SHARED_WITH_RULES or READ_ONLY_EXTERNAL. A hybrid business can manage work natively while its catalogue remains read-only from a provider. Money and work-write permissions remain separate.

Each profile references SC_WORK, SC_OFFERINGS, SC_AVAILABILITY, SC_BUSINESS, SC_MONEY, SC_PROMOTIONS, SC_INSIGHTS and SC_SETTINGS. The JSON gives each reference concrete workflow, schema, vocabulary, fields, metrics, policies and exceptions. The base feature references are WK01, OF01, AV01, BU01, MO01, PR01, IN01 and SE01.

Finance profiles support regulated enquiries and authorised provider handoff. They do not imply financial rails, funds custody, loan decisions, executed FX or policy issuance. Health profiles cover administrative appointments and fulfilment coordination; clinical notes, diagnoses, therapy content and test results remain outside this portal plan.

## Individual specialty matrix

Conditional workflow IDs below mean candidate capability after a matching confirmed answer and any required setup. They are not all enabled by default. Every row lists its actual specialty fields and a specific operational constraint.

### Adults Only

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Adult Products · MP_adult_products | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | packaging_style, age_gate_method, signature_required, min_order | Discreet item selection and handover. Packaging preference and age-check result stay separate; never expose sensitive item names in notification previews. |
| Adult Wellness · MP_adult_wellness | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | WF_FIELD_SERVICE, WF_APPOINTMENT | packaging_style, age_gate_method, booking_required, home_service | Product sales and appointment services must be separated by the booking answer; do not infer a clinical service. |
| Cigarettes · MP_cigarettes | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | license_number, age_gate_method, brands_stocked_text, min_order | Brand selection and licence-review status remain visible; order release waits for configured eligibility checks. |
| Cigars · MP_cigars | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | license_number, age_gate_method, brands_stocked_text, gift_packaging | Gift packaging does not remove configured eligibility checks at handover. |
| Vapes · MP_vapes | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | vape_device_types, age_gate_method, license_number, min_order | Device type is an offering attribute; avoid treating all products as one interchangeable variant. |
| Adult Accessories · MP_adult_accessories | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | packaging_style, age_gate_method, signature_required | Signature and packaging instructions appear to the authorised fulfiller without disclosure in general notifications. |

### Airport Transfers

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Airport Pickup · MP_airport_pickup | WF_TRANSFER; AVAIL_VEHICLE_DRIVER_V1; transfer | No additional family inferred; new activities require a reviewed configuration. | vehicle_types_transfer, fleet_size, available_24hr, advance_booking_hrs, flight_tracking, chauffeur_uniform, corporate_billing | Flight tracking can update readiness but must not silently change an agreed pickup without a visible policy. |
| Airport Drop-off · MP_airport_dropoff | WF_TRANSFER; AVAIL_VEHICLE_DRIVER_V1; transfer | No additional family inferred; new activities require a reviewed configuration. | vehicle_types_transfer, fleet_size, available_24hr, advance_booking_hrs, chauffeur_uniform, corporate_billing | Pickup address and flight departure time are distinct; derive a requested arrival buffer only after confirmation. |
| Meet & Greet · MP_meet_greet | WF_TRANSFER; AVAIL_VEHICLE_DRIVER_V1; arrival | No additional family inferred; new activities require a reviewed configuration. | vehicle_types_transfer, fleet_size, meet_greet_signage, waiting_time_min, chauffeur_uniform, corporate_billing | Signage text and waiting allowance require explicit confirmation; a greeting need not include a vehicle ride. |
| Executive Transfer · MP_executive_transfer | WF_TRANSFER; AVAIL_VEHICLE_DRIVER_V1; transfer | No additional family inferred; new activities require a reviewed configuration. | vehicle_types_transfer, fleet_size, available_24hr, advance_booking_hrs, corporate_billing, chauffeur_uniform, flight_tracking | Priority is a service promise and dispatch policy; it cannot bypass driver availability. |

### Alcohol & Beverages

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Wine · MP_wine | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | liquor_license, wine_origins, cold_delivery, gift_wrapping, min_order | Origin and storage preferences are product data; cold delivery is optional and requires a supported method. |
| Spirits · MP_spirits | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | liquor_license, brands_stocked_text, gift_wrapping, min_order | Gift wrapping and brand range vary by offering; configured eligibility checks still apply. |
| Beer · MP_beer | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | liquor_license, cold_delivery, returnable_bottles, brands_stocked_text, min_order | Returnable-container accounting is a separate deposit or exchange item only when configured. |
| Champagne · MP_champagne | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | liquor_license, occasions_spec, cold_delivery, gift_wrapping | Occasion and chilling instructions attach to a fulfilment window without creating a booking-service workflow. |
| Cocktail Mixers · MP_cocktail_mixers | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | liquor_license, gift_packaging, min_order | Review eligibility per offering; the category hint alone must not falsely classify every nonalcoholic mixer as alcoholic. |
| Liquor Stores · MP_liquor_stores | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | liquor_license, cold_delivery, min_order, corporate_billing | Corporate billing is invoice routing after approval; it grants no credit automatically. |

### Fashion & Apparel

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Men's Fashion · MP_mens_fashion | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | WF_MADE_TO_ORDER, WF_APPOINTMENT | brand_tier, size_range_adults, has_physical_store, custom_tailoring, style_consultation, return_policy, packaging_fashion | Tailoring creates a linked specification and fitting job while stock garments keep their order workflow. |
| Women's Fashion · MP_womens_fashion | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | WF_MADE_TO_ORDER, WF_APPOINTMENT | brand_tier, size_range_adults, has_physical_store, custom_tailoring, style_consultation, return_policy, packaging_fashion | Style consultation can add appointment scheduling; product sizes and alteration specifications remain distinct. |
| Kids Fashion · MP_kids_fashion | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | brand_tier, kids_age_range, school_uniforms, return_policy, packaging_fashion | Age-range merchandising is distinct from actual garment size; school-uniform collections need their own size variants. |
| Shoes · MP_shoes | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | brand_tier, shoe_size_system, has_physical_store, return_policy, packaging_fashion | Display the chosen size system and actual sizes; do not silently convert without a confirmed conversion table. |
| Bags · MP_bags | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | brand_tier, authenticity_guarantee, warranty_offered, return_policy, packaging_fashion | Authenticity evidence and warranty terms attach to the item rather than a store-wide unsupported claim. |
| Watches · MP_watches | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | brand_tier, authenticity_guarantee, warranty_offered, return_policy, packaging_fashion | Secure handover and serial/reference capture are configurable; avoid exposing identifiers in public summaries. |
| Accessories · MP_accessories | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | brand_tier, has_physical_store, return_policy, packaging_fashion | Variant and return policy are item-specific; store availability does not automatically enable customer collection. |

### Beauty

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Makeup · MP_makeup | WF_APPOINTMENT; AVAIL_RESOURCE_SLOTS_V1; appointment | WF_FIELD_SERVICE, WF_ORDER, WF_SERVICE_JOB | booking_required, professional_artists, bridal_packages, event_makeup, home_service, products_for_sale | Artists and event commitments need resource scheduling; products appear only when products_for_sale is enabled. |
| Skincare · MP_skincare | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | WF_FIELD_SERVICE, WF_ORDER, WF_APPOINTMENT | skin_types_served, dermatologist_backed, custom_routine_consult, home_service, products_for_sale | Routine consultation is an optional appointment capability; product information must not become a diagnosis form. |
| Haircare · MP_haircare | WF_APPOINTMENT; AVAIL_RESOURCE_SLOTS_V1; appointment | WF_FIELD_SERVICE, WF_ORDER, WF_SERVICE_JOB | hair_types_served, home_visits, booking_required, products_for_sale | Walk-ins and required appointments are separate intake modes; home visits require travel time and a service area. |
| Fragrances · MP_fragrances | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | WF_ORDER | fragrance_families, gift_wrapping, products_for_sale | When products_for_sale is no the catalogue cannot remain purchasable; ask for the actual service model. |
| Cosmetics Stores · MP_cosmetics_stores | WF_ORDER; AVAIL_STOCK_HOURS_V1; order | No additional family inferred; new activities require a reviewed configuration. | own_brand, multi_brand, has_physical_store, min_order | Own and stocked brands form catalogue filters; customer collection requires a confirmed operating mode. |

### Vehicle Rentals

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Car Rental · MP_car_rental | WF_RENTAL; AVAIL_ASSET_INTERVALS_V1; rental | No additional family; answer overlays configure capabilities, resources or fulfilment inside the primary workflow. | vehicle_types_rental, fleet_size, min_rental_duration, with_driver, insurance_included, fuel_policy, deposit_policy_text, corporate_billing | With-driver service reserves both vehicle and driver; self-drive must not show chauffeur assignment. |
| Self Drive · MP_self_drive | WF_RENTAL; AVAIL_ASSET_INTERVALS_V1; rental | No additional family inferred; new activities require a reviewed configuration. | vehicle_types_rental, fleet_size, min_rental_duration, insurance_included, fuel_policy, deposit_policy_text, age_requirement | Eligibility review and agreed deposit/fuel terms precede handover; there is no driver dispatch in this profile. |
| Corporate Rental · MP_corporate_rental | WF_RENTAL; AVAIL_ASSET_INTERVALS_V1; rental | No additional family inferred; new activities require a reviewed configuration. | vehicle_types_rental, fleet_size, billing_cycle, dedicated_account_mgr, insurance_included, fuel_policy | Billing cycle and account manager do not automatically authorise a credit facility or override asset conflicts. |
| Long-Term Rental · MP_long_term_rental | WF_RENTAL; AVAIL_ASSET_INTERVALS_V1; rental | No additional family inferred; new activities require a reviewed configuration. | vehicle_types_rental, fleet_size, min_rental_duration, insurance_included, fuel_policy, deposit_policy_text | Continuous asset intervals and renewal dates replace short pickup-time queues. |
| Bike Rental · MP_bike_rental | WF_RENTAL; AVAIL_ASSET_INTERVALS_V1; rental | No additional family; answer overlays configure capabilities, resources or fulfilment inside the primary workflow. | bike_types, fleet_size, min_rental_duration, insurance_included, deposit_policy_text, with_driver | Bike type changes asset attributes; a chauffeur option requires a suitable motorised vehicle and explicit service confirmation. |

### Experiences

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Concerts · MP_concerts | WF_EVENT_SESSION; AVAIL_EVENT_CAPACITY_V1; ticket booking | No additional family inferred; new activities require a reviewed configuration. | avg_attendees, ticket_delivery_method, vip_packages, advance_booking_hrs | Event session and ticket delivery are distinct; ticket issuance needs a connected authorised issuer or native inventory. |
| Festivals · MP_festivals | WF_EVENT_SESSION; AVAIL_EVENT_CAPACITY_V1; festival booking | No additional family inferred; new activities require a reviewed configuration. | avg_attendees, ticket_delivery_method, vip_packages, advance_booking_hrs | Date/pass scope and capacity are explicit; a multi-day pass must not consume capacity as unrelated daily tickets. |
| Conferences · MP_conferences | WF_EVENT_SESSION; AVAIL_EVENT_CAPACITY_V1; registration | No additional family inferred; new activities require a reviewed configuration. | capacity_range, av_equipment, catering_available, advance_booking_hrs | AV and catering are venue/service capabilities; attendance registration and organiser quotes remain separate. |
| Private Events · MP_private_events | WF_REQUEST_QUOTE; AVAIL_ENQUIRY_WINDOWS_V1; event request | No additional family inferred; new activities require a reviewed configuration. | event_planning_offered, venue_sourcing, min_headcount, max_headcount, advance_booking_hrs | Venue sourcing and planning scope are agreed before confirming capacity or sending staff. |
| Photography · MP_photography | WF_APPOINTMENT; AVAIL_RESOURCE_SLOTS_V1; photo session | WF_FIELD_SERVICE, WF_SERVICE_JOB | booking_required, session_duration_text, max_group_size, equipment_provided, home_service | Equipment inclusion must support all/some/none after the registry collision is resolved; image delivery is a separate agreed deliverable. |
| Workshops · MP_workshops | WF_GROUP_ACTIVITY; AVAIL_SESSION_CAPACITY_V1; workshop booking | No additional family; answer overlays configure capabilities, resources or fulfilment inside the primary workflow. | booking_required, session_duration_text, max_group_size, equipment_provided | Places and instructor/equipment limits constrain the same session; equipment is not safely reduced to an assumed yes/no. |
| Classes · MP_classes | WF_GROUP_ACTIVITY; AVAIL_SESSION_CAPACITY_V1; class booking | WF_MEMBERSHIP | booking_required, session_duration_text, max_group_size, recurring_sessions | Recurring sessions create a series with exception dates; they must not imply an automatic recurring debit. |
| Sports Activities · MP_sports_activities | WF_GROUP_ACTIVITY; AVAIL_SESSION_CAPACITY_V1; activity booking | WF_MEMBERSHIP | booking_required, max_group_size, equipment_provided, recurring_sessions | Capacity and equipment requirements constrain attendance; recurring plans need explicit session allocation. |
| Recreation · MP_recreation | WF_GROUP_ACTIVITY; AVAIL_SESSION_CAPACITY_V1; activity booking | No additional family; answer overlays configure capabilities, resources or fulfilment inside the primary workflow. | booking_required, max_group_size, equipment_provided, advance_booking_hrs | Activity capacity and advance-booking windows are explicit; walk-in availability cannot exceed the same capacity. |

### Financial Services

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Banking · MP_banking | WF_REGULATED_ENQUIRY; AVAIL_PROVIDER_CONTACT_V1; banking enquiry | No additional family inferred; new activities require a reviewed configuration. | regulatory_license, fin_services_offered_bank, physical_locations_count, digital_platform, operating_hours_text | Route enquiries or appointments to an authorised provider; never present account opening approval or a money transfer as a NexG completion. |
| Forex · MP_forex | WF_REGULATED_ENQUIRY; AVAIL_PROVIDER_CONTACT_V1; forex enquiry | No additional family inferred; new activities require a reviewed configuration. | regulatory_license, currencies_traded, physical_locations_count, digital_platform, operating_hours_text | Currency pairs support an enquiry and provider handoff; no executable rate quote or FX settlement is implied. |
| Insurance · MP_insurance | WF_REGULATED_ENQUIRY; AVAIL_PROVIDER_CONTACT_V1; insurance enquiry | No additional family inferred; new activities require a reviewed configuration. | regulatory_license, insurance_types, physical_locations_count, digital_platform | Coverage and underwriting remain with the provider; do not label an enquiry as an issued policy. |
| Payments · MP_payments | WF_REGULATED_ENQUIRY; AVAIL_PROVIDER_CONTACT_V1; payment-service enquiry | No additional family inferred; new activities require a reviewed configuration. | regulatory_license, payment_channels, digital_platform, physical_locations_count | Provider handoff is not an enabled payment rail; never collect payment credentials in the merchant portal. |
| Remittance · MP_remittance | WF_REGULATED_ENQUIRY; AVAIL_PROVIDER_CONTACT_V1; remittance enquiry | No additional family inferred; new activities require a reviewed configuration. | regulatory_license, remittance_corridors, digital_platform, physical_locations_count | Corridors describe provider coverage; no remittance transfer, funds custody or guaranteed exchange rate is enabled by onboarding. |
| Sacco Services · MP_sacco_services | WF_REGULATED_ENQUIRY; AVAIL_PROVIDER_CONTACT_V1; member-service enquiry | No additional family inferred; new activities require a reviewed configuration. | regulatory_license, sacco_services_offered, physical_locations_count, operating_hours_text | Membership and lending decisions belong to the authorised institution; show enquiry progress only. |
| Business Services · MP_business_services | WF_REGULATED_ENQUIRY; AVAIL_PROVIDER_CONTACT_V1; business-service enquiry | No additional family inferred; new activities require a reviewed configuration. | regulatory_license, biz_services_offered, physical_locations_count, digital_platform | Separate requested professional assistance from confirmed provider authority and service scope; no regulated execution by implication. |

### Flowers & Gifts

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Flowers · MP_flowers | WF_ORDER; AVAIL_STOCK_HOURS_V1; flower order | WF_MEMBERSHIP | fresh_or_preserved, subscription_bouquets, same_day_delivery, custom_messages, advance_order_hrs | Subscriptions and scheduled bouquets are optional; perishability and message text affect fulfilment handling. |
| Gift Hampers · MP_gift_hampers | WF_ORDER; AVAIL_STOCK_HOURS_V1; hamper order | WF_MADE_TO_ORDER | custom_curation, corporate_gifting, hamper_price_ranges, same_day_delivery, custom_messages | Custom curation can require an approval step; component availability determines the final agreed hamper. |
| Cakes · MP_cakes | WF_MADE_TO_ORDER; AVAIL_PRODUCTION_V1; cake order | WF_MADE_TO_ORDER | custom_cake_design, dietary_options_cake, min_advance_order_hrs, same_day_delivery | Design approval and production lead time precede scheduled fulfilment; ready-made cakes can use a separately enabled order workflow. |
| Chocolates · MP_chocolates | WF_ORDER; AVAIL_STOCK_HOURS_V1; chocolate order | No additional family inferred; new activities require a reviewed configuration. | gift_wrapping, custom_messages, same_day_delivery, min_order | Gift message and temperature handling are independent of wrapping and must survive dispatch handover. |
| Personalized Gifts · MP_personalized_gifts | WF_MADE_TO_ORDER; AVAIL_PRODUCTION_V1; personalisation job | No additional family inferred; new activities require a reviewed configuration. | custom_messages, advance_order_hrs, corporate_gifting | Personalisation proof approval freezes the agreed text/version before production. |
| Occasion Gifts · MP_occasion_gifts | WF_ORDER; AVAIL_STOCK_HOURS_V1; gift order | No additional family inferred; new activities require a reviewed configuration. | occasions_spec, same_day_delivery, custom_messages, gift_wrapping | Occasion filters organise discovery while promise windows and personalised messages govern execution. |

### Restaurants & Food

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Restaurant · MP_restaurant | WF_ORDER; AVAIL_STOCK_HOURS_V1; food order | WF_APPOINTMENT | cuisine_types, table_service, avg_prep_time, has_physical_seating, reservation_system, min_order | Table reservations are conditional and separate from delivery; the same kitchen capacity must constrain both. |
| Fast Food · MP_fast_food | WF_ORDER; AVAIL_STOCK_HOURS_V1; food order | No additional family inferred; new activities require a reviewed configuration. | avg_prep_time, drive_through, family_meals, min_order | Drive-through is a pickup method after explicit enablement; family portions require actual serving/variant definitions. |
| Café · MP_cafe | WF_ORDER; AVAIL_STOCK_HOURS_V1; cafe order | No additional family inferred; new activities require a reviewed configuration. | brewing_methods, wifi_available, coworking_space, seated_capacity, food_menu | Seating and coworking are capabilities requiring explicit booking rules; Wi-Fi information alone does not create a desk booking system. |
| Bakery · MP_bakery | WF_ORDER; AVAIL_STOCK_HOURS_V1; bakery order | WF_MADE_TO_ORDER | bakery_specialties, custom_orders, advance_order_hrs, min_order | Custom orders add a production deadline and approval path without making every stocked item bespoke. |
| Desserts · MP_desserts | WF_ORDER; AVAIL_STOCK_HOURS_V1; dessert order | WF_MADE_TO_ORDER | dessert_specialties, custom_orders, dietary_options_cake, min_order | Cold handling and custom-order scheduling are distinct; dietary claims require configured evidence and copy review. |
| Juice Bar · MP_juice_bar | WF_ORDER; AVAIL_STOCK_HOURS_V1; drink order | No additional family inferred; new activities require a reviewed configuration. | cold_pressed, smoothie_bowls, vegan_menu, detox_programs | Drink composition and delivery handling are visible; a detox label must not create clinical advice or a treatment workflow. |
| Cloud Kitchen · MP_cloud_kitchen | WF_ORDER; AVAIL_STOCK_HOURS_V1; kitchen order | No additional family; answer overlays configure capabilities, resources or fulfilment inside the primary workflow. | number_of_brands, cuisine_types, pickup_available, avg_prep_time | Each brand can share kitchen capacity but retains its catalogue identity; no customer seating is inferred. |
| Catering · MP_catering | WF_REQUEST_QUOTE; AVAIL_ENQUIRY_WINDOWS_V1; catering request | No additional family inferred; new activities require a reviewed configuration. | cuisine_types, min_headcount, max_headcount, equipment_provided, staff_included, advance_booking_days | Headcount, staffing and equipment determine a scoped quote and delivery/event plan; never force an immediate meal queue. |

### Groceries & Essentials

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Supermarket · MP_supermarket | WF_ORDER; AVAIL_STOCK_HOURS_V1; basket order | No additional family; answer overlays configure capabilities, resources or fulfilment inside the primary workflow. | min_order, express_delivery, pickup_available, operations_24hr, loyalty_program | Substitution policy and partial availability belong on the work detail; an express promise needs available capacity. |
| Convenience Store · MP_convenience_store | WF_ORDER; AVAIL_STOCK_HOURS_V1; basket order | No additional family inferred; new activities require a reviewed configuration. | min_order, operations_24hr, express_delivery | Twenty-four-hour opening does not guarantee riders or express fulfilment around the clock. |
| Fresh Produce · MP_fresh_produce | WF_ORDER; AVAIL_STOCK_HOURS_V1; produce order | WF_MEMBERSHIP | organic_options, farm_direct, subscription_boxes, weekly_market | Units, variable weights and substitutions are explicit; subscriptions allocate real fulfilment dates. |
| Butchery · MP_butchery | WF_ORDER; AVAIL_STOCK_HOURS_V1; butchery order | No additional family inferred; new activities require a reviewed configuration. | custom_cuts, halal_certified, vacuum_sealed, advance_order_required | Custom cuts create preparation instructions and measured weight; certification is a verified claim rather than a checkbox badge alone. |
| Seafood · MP_seafood | WF_ORDER; AVAIL_STOCK_HOURS_V1; seafood order | No additional family inferred; new activities require a reviewed configuration. | live_seafood, on_site_processing, min_order | Processing requests and live/chilled handling influence preparation and handover; actual measured quantity determines a confirmed adjustment. |
| Organic Store · MP_organic_store | WF_ORDER; AVAIL_STOCK_HOURS_V1; grocery order | No additional family inferred; new activities require a reviewed configuration. | local_sourcing, zero_waste_packaging | Sourcing and packaging claims appear with their configured verification status; they do not change the standard order states. |

### Laundry & Cleaning

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Laundry · MP_laundry | WF_PICKUP_RETURN; AVAIL_BATCH_TURNAROUND_V1; laundry job | No additional family; answer overlays configure capabilities, resources or fulfilment inside the primary workflow. | pickup_delivery, turnaround_time, per_kg_pricing, per_item_pricing, weight_limit | Collection and return are two linked legs around intake measurement and processing; no single delivered state can complete both. |
| Dry Cleaning · MP_dry_cleaning | WF_PICKUP_RETURN; AVAIL_BATCH_TURNAROUND_V1; cleaning job | No additional family; answer overlays configure capabilities, resources or fulfilment inside the primary workflow. | pickup_delivery, turnaround_time, per_item_pricing, garment_types | Garment count and agreed care notes are recorded at intake; item condition and return acknowledgement remain linked. |
| Ironing · MP_ironing | WF_PICKUP_RETURN; AVAIL_BATCH_TURNAROUND_V1; ironing job | No additional family; answer overlays configure capabilities, resources or fulfilment inside the primary workflow. | pickup_delivery, turnaround_time, per_item_pricing | Per-item counts and return promise govern the job; customer drop-off can remove only the collection dispatch leg. |
| Home Cleaning · MP_home_cleaning | WF_FIELD_SERVICE; AVAIL_DISPATCH_ROTA_V1; cleaning visit | WF_MEMBERSHIP | one_time_bookings, recurring_sub, equipment_provided, eco_products, min_hours_session, coverage_area_text | Staff, duration, travel area and equipment responsibility govern the visit; repeat visits need explicit exceptions. |
| Office Cleaning · MP_office_cleaning | WF_FIELD_SERVICE; AVAIL_DISPATCH_ROTA_V1; cleaning visit | WF_MEMBERSHIP | one_time_bookings, recurring_sub, equipment_provided, eco_products, min_hours_session, coverage_area_text | Site access windows, team capacity and recurring scope must be explicit before a visit is confirmed. |

### Marketplace

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Home & Living · MP_home_living | WF_ORDER; AVAIL_STOCK_HOURS_V1; home item order | No additional family inferred; new activities require a reviewed configuration. | product_description, new_or_used, fragile_handling, return_policy | Bulky-item dimensions and access constraints belong to delivery planning; ordinary parcel defaults are insufficient. |
| Furniture · MP_furniture | WF_ORDER; AVAIL_STOCK_HOURS_V1; furniture order | WF_FIELD_SERVICE | product_description, new_or_used, fragile_handling, installation_service | Installation is a linked service job only when enabled; delivery and installation completion remain separately visible. |
| Appliances · MP_appliances | WF_ORDER; AVAIL_STOCK_HOURS_V1; appliance order | WF_FIELD_SERVICE | product_description, warranty_offered, installation_service, fragile_handling, return_policy | Serial/warranty data and installation scheduling are separate; a delivered appliance is not proof of completed installation. |
| Decor · MP_decor | WF_ORDER; AVAIL_STOCK_HOURS_V1; decor order | No additional family inferred; new activities require a reviewed configuration. | product_description, new_or_used, fragile_handling, gift_wrapping | Fragile handling and wrapping instructions must remain visible in fulfilment detail. |
| Kitchenware · MP_kitchenware | WF_ORDER; AVAIL_STOCK_HOURS_V1; kitchenware order | No additional family inferred; new activities require a reviewed configuration. | product_description, new_or_used, return_policy | Condition and return terms are offering attributes; do not show rental-return controls for ordinary product returns. |
| Books · MP_books | WF_ORDER; AVAIL_STOCK_HOURS_V1; book order | WF_MADE_TO_ORDER | book_genres, new_or_used, custom_orders | Special sourcing creates an optional request/quote path rather than fictitious stock for unavailable books. |
| Stationery · MP_stationery | WF_ORDER; AVAIL_STOCK_HOURS_V1; stationery order | No additional family inferred; new activities require a reviewed configuration. | product_description, min_order, corporate_billing | Bulk quantities and minimum order constraints are explicit; corporate billing needs separate approval. |
| Office Supplies · MP_office_supplies | WF_ORDER; AVAIL_STOCK_HOURS_V1; supply order | No additional family inferred; new activities require a reviewed configuration. | product_description, min_order, corporate_billing | Replenishment baskets use actual item availability; invoice routing does not imply a standing order or credit account. |
| General Retail · MP_general_retail | WF_ORDER; AVAIL_STOCK_HOURS_V1; retail order | No additional family inferred; new activities require a reviewed configuration. | product_description, new_or_used, min_order, return_policy | New/used condition and return policy are item-level details; no single inherited food-preparation stage. |

### Pharmacy

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Pharmacy · MP_pharmacy_retail | WF_ORDER; AVAIL_STOCK_HOURS_V1; pharmacy order | No additional family inferred; new activities require a reviewed configuration. | pharmacist_on_duty, operations_24hr, prescription_delivery, cold_chain_meds | Prescription-related orders require authorised pharmacist review through a suitable connected service; no clinical records in general work cards. |
| Medical Supplies · MP_medical_supplies | WF_ORDER; AVAIL_STOCK_HOURS_V1; supply order | No additional family inferred; new activities require a reviewed configuration. | med_supply_types, corporate_billing | Product type and invoice recipient are visible; prescription and professional-use constraints remain item-specific checks. |
| Baby Products · MP_baby_products | WF_ORDER; AVAIL_STOCK_HOURS_V1; product order | WF_MEMBERSHIP | baby_product_range, subscription_available, min_order | Subscriptions schedule ordinary product fulfilment; never infer a clinical service from the pharmacy category. |
| Supplements · MP_supplements | WF_ORDER; AVAIL_STOCK_HOURS_V1; product order | No additional family inferred; new activities require a reviewed configuration. | supplement_categories, authenticity_guarantee | Authenticity information is a reviewed product claim; no treatment recommendation or clinical outcome metrics. |

### Health

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Clinics · MP_clinics | WF_APPOINTMENT; AVAIL_RESOURCE_SLOTS_V1; appointment | WF_FIELD_SERVICE, WF_APPOINTMENT | clinic_specializations, appointment_booking, walk_in_available, home_visits, insurance_accepted | Administrative booking only; no symptoms, diagnosis, clinical notes, test results or medical-record storage in this portal plan. |
| Telemedicine · MP_telemedicine | WF_REMOTE_SESSION; AVAIL_RESOURCE_SLOTS_V1; remote appointment | No additional family inferred; new activities require a reviewed configuration. | tele_platforms, clinic_specializations, available_24hr | Administrative session scheduling and authorised provider handoff only; consultation content stays in the provider system. |
| Labs · MP_labs | WF_APPOINTMENT; AVAIL_RESOURCE_SLOTS_V1; lab appointment | WF_FIELD_SERVICE | lab_test_types, home_sample_collection, results_turnaround_hrs | Collection logistics are administrative; result documents and clinical interpretation stay in the authorised provider system. |
| Mental Health (Therapy) · MP_mental_health | WF_APPOINTMENT; AVAIL_RESOURCE_SLOTS_V1; session booking | WF_REMOTE_SESSION | therapy_types, session_format, avg_session_duration | Session format changes in-person/remote scheduling; no therapy notes, condition labels or clinical records appear in shared work views. |
| Coaching · MP_coaching | WF_APPOINTMENT; AVAIL_RESOURCE_SLOTS_V1; coaching session | WF_REMOTE_SESSION, WF_GROUP_ACTIVITY | coaching_areas, session_format, avg_session_duration, group_sessions | Group capacity and session format are configurable; outcomes do not become unsupported clinical claims. |

### Tech & Electronics

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Smartphones · MP_smartphones | WF_ORDER; AVAIL_STOCK_HOURS_V1; device order | WF_SERVICE_JOB | phone_brands, new_or_refurbished, warranty_months, repair_services, trade_in_program | Repair and trade-in are distinct assessed jobs; purchased stock retains secure item handover and warranty terms. |
| Accessories · MP_tech_accessories | WF_ORDER; AVAIL_STOCK_HOURS_V1; accessory order | No additional family inferred; new activities require a reviewed configuration. | product_description, warranty_offered, min_order | Compatibility and warranty are item information; no installation workflow without a declared supported service. |
| Computers · MP_computers | WF_ORDER; AVAIL_STOCK_HOURS_V1; computer order | WF_SERVICE_JOB | computer_brands, new_or_refurbished, warranty_months, repair_services | Repair intake can be enabled independently of product sales; device identifiers require scoped access. |
| Gaming · MP_gaming | WF_ORDER; AVAIL_STOCK_HOURS_V1; gaming order | No additional family inferred; new activities require a reviewed configuration. | console_types, pre_owned_games, gaming_accessories | Platform compatibility and new/pre-owned condition belong on variants; pre-owned inventory must be individually identifiable where required. |
| Audio · MP_audio | WF_ORDER; AVAIL_STOCK_HOURS_V1; audio order | No additional family inferred; new activities require a reviewed configuration. | product_description, warranty_offered, return_policy | Warranty and returns remain offering-specific; a product purchase must not create an unrelated installation appointment. |
| Telecom Services · MP_telecom_services | WF_SERVICE_JOB; AVAIL_QUEUE_HOURS_V1; service request | WF_ORDER | telecom_services_offered, telecom_networks | Airtime/data/SIM services need authorised provider handoff; physical devices/accessories can have a distinct order capability. |
| Smart Devices · MP_smart_devices | WF_ORDER; AVAIL_STOCK_HOURS_V1; device order | WF_FIELD_SERVICE | product_description, warranty_offered, installation_service | Installation adds a linked visit with site requirements; product handover alone cannot mark installation complete. |

### Travel & Tours

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Safaris · MP_safaris | WF_TOUR; AVAIL_DEPARTURES_V1; safari booking | No additional family inferred; new activities require a reviewed configuration. | parks_covered, accommodation_included, meal_plan, min_nights, max_group_size, private_vehicle | Park access, vehicle/guide capacity and accommodation inclusions are explicit; no guaranteed supplier allocation before confirmation. |
| Game Drives · MP_game_drives | WF_TOUR; AVAIL_DEPARTURES_V1; game-drive booking | No additional family inferred; new activities require a reviewed configuration. | parks_covered, max_group_size, private_vehicle, advance_booking_hrs | Departure seats and private-vehicle options share underlying capacity; guide and vehicle availability must both agree. |
| Luxury Safaris · MP_luxury_safaris | WF_TOUR; AVAIL_DEPARTURES_V1; safari booking | No additional family inferred; new activities require a reviewed configuration. | parks_covered, accommodation_included, meal_plan, min_nights, max_group_size, private_vehicle | Priority support does not bypass supplier confirmations, accommodation allocation or vehicle conflicts. |
| City Tours · MP_city_tours | WF_TOUR; AVAIL_DEPARTURES_V1; tour booking | No additional family inferred; new activities require a reviewed configuration. | tour_modes, max_group_size, duration_options, guide_included, tour_languages | Mode, language and guide capacity determine each departure; different tour modes cannot share an unqualified asset pool. |
| Cultural Tours · MP_cultural_tours | WF_TOUR; AVAIL_DEPARTURES_V1; tour booking | No additional family inferred; new activities require a reviewed configuration. | tour_modes, max_group_size, duration_options, guide_included, tour_languages | Guide language and site timings constrain departures; itinerary changes need a visible customer acknowledgement policy. |
| Adventure Tours · MP_adventure_tours | WF_TOUR; AVAIL_DEPARTURES_V1; adventure booking | No additional family inferred; new activities require a reviewed configuration. | tour_modes, max_group_size, duration_options, guide_included, equipment_provided | Equipment inclusion and participant capacity are explicit; suitability checks are configured per actual activity. |
| Travel Packages · MP_travel_packages | WF_REQUEST_QUOTE; AVAIL_ENQUIRY_WINDOWS_V1; travel request | No additional family inferred; new activities require a reviewed configuration. | destinations_text, package_types, flight_included, visa_assistance, tour_languages | Flights, visas and insurance assistance are scoped provider coordination; no confirmed ticket, visa or policy before provider evidence. |

### Vehicle Services

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Car Wash · MP_car_wash | WF_SERVICE_JOB; AVAIL_QUEUE_HOURS_V1; wash job | WF_FIELD_SERVICE, WF_MEMBERSHIP | wash_types, mobile_service, subscription_plans, advance_booking_hrs | On-site queue and mobile visits are separate modes; subscriptions allocate visits without assuming recurring collection of funds. |
| Tire Service · MP_tire_service | WF_SERVICE_JOB; AVAIL_QUEUE_HOURS_V1; tire job | WF_FIELD_SERVICE | tire_brands_text, mobile_service, emergency_callout, available_24hr | Mobile/emergency service requires a dispatch area and team capacity; parts stock and labour are separate lines. |
| Battery Service · MP_battery_service | WF_FIELD_SERVICE; AVAIL_DISPATCH_ROTA_V1; battery job | WF_FIELD_SERVICE, WF_SERVICE_JOB | mobile_service, emergency_callout, available_24hr, battery_brands_text | A no-mobile answer changes this profile to an on-site job; compatibility and authorised safe completion checks remain explicit. |
| Vehicle Assistance · MP_vehicle_assistance | WF_FIELD_SERVICE; AVAIL_DISPATCH_ROTA_V1; assistance request | No additional family inferred; new activities require a reviewed configuration. | assistance_services, response_time_min, coverage_area_text, available_24hr | Emergency dispatch uses location, response capacity and service type; promise only an achievable arrival window. |
| Vehicle Inspection · MP_vehicle_inspection | WF_APPOINTMENT; AVAIL_RESOURCE_SLOTS_V1; inspection booking | WF_FIELD_SERVICE | inspection_types, mobile_inspection, report_provided, duration_min | Mobile inspection adds travel and a service area; report_provided is a deliverable flag with controlled access. |

### Wellness

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Spa · MP_spa | WF_APPOINTMENT; AVAIL_RESOURCE_SLOTS_V1; spa appointment | WF_FIELD_SERVICE, WF_MEMBERSHIP | spa_services, session_durations, home_service, couples_packages, membership_available | Couples bookings consume the actual room/provider capacity; home service and memberships are separately enabled. |
| Massage · MP_massage | WF_APPOINTMENT; AVAIL_RESOURCE_SLOTS_V1; massage appointment | WF_FIELD_SERVICE | massage_types, session_durations, home_service, couples_packages | Provider, duration and couples capacity are explicit; mobile delivery requires travel buffers. |
| Gym · MP_gym | WF_MEMBERSHIP; AVAIL_ACCESS_CAPACITY_V1; membership | WF_APPOINTMENT | gym_facilities, available_24hr, personal_training_available, membership_types | Walk-in access and personal training are separate capabilities sharing occupancy rules; memberships do not imply direct debits. |
| Personal Training · MP_personal_training | WF_APPOINTMENT; AVAIL_RESOURCE_SLOTS_V1; training session | WF_FIELD_SERVICE, WF_REMOTE_SESSION, WF_GROUP_ACTIVITY | training_specializations, session_location, avg_session_duration, group_sessions | Venue/client/online location and group size determine capacity and travel; no one-size-fits-all appointment resource. |

### App Services

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Reservations · MP_reservations | WF_REQUEST_QUOTE; AVAIL_ENQUIRY_WINDOWS_V1; reservation request | No additional family inferred; new activities require a reviewed configuration. | reservation_venue_types, advance_booking_hrs | The concierge requests supplier confirmation; it must not show a table/room/ticket as confirmed from its own unchecked capacity. |
| Personal Assistance · MP_personal_assistance | WF_REQUEST_QUOTE; AVAIL_ENQUIRY_WINDOWS_V1; assistance request | No additional family inferred; new activities require a reviewed configuration. | response_time_hrs, corporate_clients, dedicated_account_mgr, retainer_ksh | Retainer scope and response commitment are explicit; an account manager is not unlimited available capacity. |
| Shopping Assistance · MP_shopping_assistance | WF_REQUEST_QUOTE; AVAIL_ENQUIRY_WINDOWS_V1; shopping request | No additional family inferred; new activities require a reviewed configuration. | response_time_hrs, corporate_clients | Item sourcing, customer approval and purchase evidence precede fulfilment; substitute items need an agreed policy. |
| Gift Sourcing · MP_gift_sourcing | WF_REQUEST_QUOTE; AVAIL_ENQUIRY_WINDOWS_V1; sourcing request | No additional family inferred; new activities require a reviewed configuration. | advance_booking_hrs, corporate_clients, gift_wrapping | Budget and shortlist approval are distinct from the physical gift's later delivery workflow. |
| Travel Planning · MP_travel_planning | WF_REQUEST_QUOTE; AVAIL_ENQUIRY_WINDOWS_V1; planning request | No additional family inferred; new activities require a reviewed configuration. | destinations_coverage, visa_assistance, travel_insurance_assist | Destination coverage and visa/insurance assistance do not imply provider issuance or guaranteed outcomes. |
| Property Coordination · MP_property_coordination | WF_REQUEST_QUOTE; AVAIL_ENQUIRY_WINDOWS_V1; property request | No additional family inferred; new activities require a reviewed configuration. | coverage_area_text, advance_booking_hrs, available_24hr | Site coverage, access authority and supplier acceptance govern the job; do not infer authority to enter a property. |
| Moving Assistance · MP_moving_assistance | WF_REQUEST_QUOTE; AVAIL_ENQUIRY_WINDOWS_V1; moving request | No additional family inferred; new activities require a reviewed configuration. | coverage_area_text, insurance_items, advance_booking_hrs, equipment_provided | Inventory, access, crew, equipment and insurance scope require a confirmed quote before scheduling movement. |
| Cleaning Coordination · MP_cleaning_coordination | WF_REQUEST_QUOTE; AVAIL_ENQUIRY_WINDOWS_V1; coordination request | WF_MEMBERSHIP | coverage_area_text, recurring_sub, eco_products, advance_booking_hrs | Supplier acceptance precedes a confirmed cleaning visit; recurring schedules retain per-visit exceptions. |
| VIP Assistance · MP_vip_assistance | WF_REQUEST_QUOTE; AVAIL_ENQUIRY_WINDOWS_V1; priority request | WF_MEMBERSHIP | vip_services_text, available_24hr, dedicated_account_mgr, retainer_model | A response commitment and named coordinator remain visible; priority does not waive supplier or permission checks. |

### Logistics & Shipping

| Specialty and profile | Primary workflow and model | Conditional workflows | Exact specialty fields | Operational distinction |
|---|---|---|---|---|
| Sea Freight · MP_sea_freight | WF_FREIGHT; AVAIL_CARGO_CAPACITY_V1; shipment | No additional family inferred; new activities require a reviewed configuration. | shipping_ways, price_per_container, price_per_cbm, price_per_kg, port_to_warehouse_transport, warehouse_to_client_transport, shipping_times, insurance_included | Container/CBM/kg pricing modes and port/warehouse legs are explicit; they are not interchangeable units. |
| Air Freight · MP_air_freight | WF_FREIGHT; AVAIL_CARGO_CAPACITY_V1; shipment | No additional family inferred; new activities require a reviewed configuration. | shipping_ways, price_per_cbm, price_per_kg, port_to_warehouse_transport, warehouse_to_client_transport, shipping_times, custom_clearance, insurance_included | Chargeable weight and customs handling are confirmed scope; flight milestones require a connected source or manual evidence. |
| Road Freight & Trucking · MP_road_freight | WF_FREIGHT; AVAIL_CARGO_CAPACITY_V1; shipment | No additional family inferred; new activities require a reviewed configuration. | shipping_ways, price_per_container, price_per_cbm, price_per_kg, port_to_warehouse_transport, warehouse_to_client_transport, shipping_times, fleet_size | Cargo dimensions, truck capacity and route legs govern scheduling; a single meal-style ETA is not an adequate promise. |
| Warehousing & Storage · MP_warehousing | WF_STORAGE; AVAIL_SPACE_CAPACITY_V1; storage allocation | No additional family inferred; new activities require a reviewed configuration. | price_per_sqm, price_per_sqft, warehouse_capacity_sqft, insurance_included, operating_hours_text | Area units and occupancy periods control capacity; inbound/outbound movements remain linked but distinct from the storage contract. |

## Representative answer variations

| Same specialty | Input change | Expected design behavior |
|---|---|---|
| Makeup | products_for_sale yes/no | Add or remove product-order catalogue alongside the service model. |
| Car rental | with_driver yes/no | Reserve a driver as well as a vehicle only for the chauffeured mode. |
| Massage | home_service yes/no | Add customer-location visits, travel buffers and service areas only when enabled. |
| Makeup | booking_required yes/no | Required appointments versus an on-site walk-in job queue. |
| Car wash | mobile_service yes/no | Add a dispatched visit; retain on-site jobs as a separate mode. |
| Classes | recurring_sessions yes/no | Add a planned series/membership with exception dates; no automatic debit. |
| Furniture | installation_service yes/no | Add a linked installation visit; keep delivery completion separate. |
| Any specialty | EXTERNAL read-only versus HYBRID_BY_DATA_CLASS | Enforce authority per data class across all eight screens. |
| Any specialty | Limited staff role | Keep permitted work information readable and deny work writes, catalogue writes and money access. |

## Validation and remaining work

The generator checks 128 unique specialty IDs, one acceptance case per specialty, exact source-field preservation, valid workflow references, eight configured screens per profile, answer-rule provenance, selected cross-answer behaviors, and external/role write restrictions in its planning simulation. The expected configurations are generated by the same planning resolver, so these checks demonstrate internal consistency only. They do not prove product correctness or operational implementation.

Before implementation, review ambiguous raw taxonomy hints with the merchant operating model, complete typed operational inputs, resolve source field collection gaps, define shared workflow guards and events, specify integration mappings and authority, and carry the design through the screen plans. After implementation, run the acceptance cases against real resolved app configuration and end-to-end behavior. Images follow completion of all eight screen plans and the consistency review.
