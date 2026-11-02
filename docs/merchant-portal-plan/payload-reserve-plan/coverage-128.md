# Payload Reserve coverage for all 128 NEXG specialties

Date: 31 October 2026. All rows are planned, not implemented or tested. Kenya-only scheduling uses `Africa/Nairobi` with no timezone selector. Read [the complete machine-readable register](coverage-128.json) for setup, authority, source keys, seven baseline cases per specialty and four cases for every conditional binding.

Each named row below is an explicit operational mapping. Model selection is a starting point; actual offering answers, setup and authority control activation. Google/payment references are optional integration scope. No-calendar retail/enquiry outcomes are supported deliberately.

Coverage: 21 categories, 128 specialties, 1156 planned acceptance cases. This includes 896 baseline cases and 260 positive/negative/missing/conflicting conditional cases. These counts do not represent passing tests.

## Adults Only

### Adult Products (`adult_products`)

Model: `ORDER`. Source profile: `MP_adult_products`. Status: planned / not started / not run.

Discreet packaged goods with age-check and signature policy; product selection and delivery are orders, not appointments.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Adult Wellness (`adult_wellness`)

Model: `ORDER`. Source profile: `MP_adult_wellness`. Status: planned / not started / not run.

Clarify whether each offering is a product, a booked wellness service or a home visit; preserve discreet event summaries.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `FIELD_VISIT`: answers.home_service=yes AND a service offering explicitly enables customer-location fulfilment; a product order alone does not activate a visit.
- `APPOINTMENT`: bookingSetup.booking_enabled=true AND bookingSetup.accepts_scheduled_bookings=true for a declared service; answers.booking_required describes the advance requirement clarified by bookingSetup.requires_advance_booking, not whether optional bookings exist.

Corrections to earlier proposal:

- Product versus service model is unresolved until the actual offering is declared; home_service alone must not create work.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 8 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Cigarettes (`cigarettes`)

Model: `ORDER`. Source profile: `MP_cigarettes`. Status: planned / not started / not run.

Licensed age-restricted tobacco orders with declared brands and minimum order; do not expose product detail in unrelated calendar views.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Cigars (`cigars`)

Model: `ORDER`. Source profile: `MP_cigars`. Status: planned / not started / not run.

Licensed age-restricted cigar orders with gift packaging; packaging does not create a bookable service.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Vapes (`vapes`)

Model: `ORDER`. Source profile: `MP_vapes`. Status: planned / not started / not run.

Device-type variants, license and age-check policy; order availability comes from inventory rather than empty calendar slots.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Adult Accessories (`adult_accessories`)

Model: `ORDER`. Source profile: `MP_adult_accessories`. Status: planned / not started / not run.

Discreet accessory orders with signature policy; generic delivery milestones need no personal appointment.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Airport Transfers

### Airport Pickup (`airport_pickup`)

Model: `TRANSFER`. Source profile: `MP_airport_pickup`. Status: planned / not started / not run.

Scheduled airport arrival pickup, passenger/luggage fit, flight-change policy and joint vehicle/driver occupancy.

Merchant view: Pickup agenda and vehicle/driver resource lanes with trip and waiting intervals.

Required setup: pickup_dropoff; pickup_instant; trip_occupancy_and_buffers; eligible_vehicle_driver_or_greeter; passenger_luggage_capacity; waiting_and_change_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Airport Drop-off (`airport_dropoff`)

Model: `TRANSFER`. Source profile: `MP_airport_dropoff`. Status: planned / not started / not run.

Scheduled airport drop-off with passenger pickup address, airport arrival target and feasible vehicle/driver interval.

Merchant view: Pickup agenda and vehicle/driver resource lanes with trip and waiting intervals.

Required setup: pickup_dropoff; pickup_instant; trip_occupancy_and_buffers; eligible_vehicle_driver_or_greeter; passenger_luggage_capacity; waiting_and_change_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Meet & Greet (`meet_greet`)

Model: `TRANSFER`. Source profile: `MP_meet_greet`. Status: planned / not started / not run.

Greeter, signage and waiting interval; explicitly distinguish greeter-only assistance from an included vehicle transfer.

Merchant view: Pickup agenda and vehicle/driver resource lanes with trip and waiting intervals.

Required setup: pickup_dropoff; pickup_instant; trip_occupancy_and_buffers; eligible_vehicle_driver_or_greeter; passenger_luggage_capacity; waiting_and_change_policy.

Corrections to earlier proposal:

- Clarify greeter-only versus included transport; do not reserve an unnecessary vehicle.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Executive Transfer (`executive_transfer`)

Model: `TRANSFER`. Source profile: `MP_executive_transfer`. Status: planned / not started / not run.

Executive-class vehicle eligibility, driver, pickup, waiting and corporate billing; flight tracking only where enabled.

Merchant view: Pickup agenda and vehicle/driver resource lanes with trip and waiting intervals.

Required setup: pickup_dropoff; pickup_instant; trip_occupancy_and_buffers; eligible_vehicle_driver_or_greeter; passenger_luggage_capacity; waiting_and_change_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Alcohol & Beverages

### Wine (`wine`)

Model: `ORDER`. Source profile: `MP_wine`. Status: planned / not started / not run.

Wine origin, age/license eligibility and cold/gift handling; scheduled delivery is explicitly offered, not automatic.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Spirits (`spirits`)

Model: `ORDER`. Source profile: `MP_spirits`. Status: planned / not started / not run.

Brand variants, licensed age-eligible order and gift wrapping; no appointment is inferred from corporate or gift demand.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Beer (`beer`)

Model: `ORDER`. Source profile: `MP_beer`. Status: planned / not started / not run.

Cold delivery and returnable-bottle handling attached to an order; bottle return does not become asset rental.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Champagne (`champagne`)

Model: `ORDER`. Source profile: `MP_champagne`. Status: planned / not started / not run.

Occasion-specific cold/gift handling and dated delivery promise only when the merchant accepts that promise.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Cocktail Mixers (`cocktail_mixers`)

Model: `ORDER`. Source profile: `MP_cocktail_mixers`. Status: planned / not started / not run.

Packaged mixer orders and minimum quantity with configured eligibility and gift packaging.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Liquor Stores (`liquor_stores`)

Model: `ORDER`. Source profile: `MP_liquor_stores`. Status: planned / not started / not run.

Retail alcohol order, cold handling and corporate billing; store opening hours do not guarantee stock or delivery capacity.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Fashion & Apparel

### Men's Fashion (`mens_fashion`)

Model: `ORDER`. Source profile: `MP_mens_fashion`. Status: planned / not started / not run.

Size/brand retail with separately enabled tailoring production and style consultation appointments.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `APPOINTMENT`: answers.style_consultation=yes AND an exact-duration consultation offering is published.
- `PRODUCTION_DUE`: answers.custom_tailoring=yes AND bookingSetup.custom_order_kind=made_to_specification AND the selected order is custom production; fitting appointments require a separate explicit offering.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 8 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Women's Fashion (`womens_fashion`)

Model: `ORDER`. Source profile: `MP_womens_fashion`. Status: planned / not started / not run.

Size/brand retail, custom tailoring and style consultations as distinct activities sharing configured staff where relevant.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `APPOINTMENT`: answers.style_consultation=yes AND an exact-duration consultation offering is published.
- `PRODUCTION_DUE`: answers.custom_tailoring=yes AND bookingSetup.custom_order_kind=made_to_specification AND the selected order is custom production; fitting appointments require a separate explicit offering.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 8 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Kids Fashion (`kids_fashion`)

Model: `ORDER`. Source profile: `MP_kids_fashion`. Status: planned / not started / not run.

Age/size retail and school uniform offering details; uniforms do not automatically imply custom production or fittings.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Shoes (`shoes`)

Model: `ORDER`. Source profile: `MP_shoes`. Status: planned / not started / not run.

Shoe-size-system variants and retail returns; no fitting appointment unless an actual bookable service is added.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Bags (`bags`)

Model: `ORDER`. Source profile: `MP_bags`. Status: planned / not started / not run.

Authenticity/warranty declarations and bag inventory; product checks are not staff-time reservations.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Watches (`watches`)

Model: `ORDER`. Source profile: `MP_watches`. Status: planned / not started / not run.

Watch inventory and declared warranty/authenticity; repair or valuation services require a separately configured activity.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Accessories (`accessories`)

Model: `ORDER`. Source profile: `MP_accessories`. Status: planned / not started / not run.

Fashion accessory inventory, physical-store collection if offered and return policies; no default appointment calendar.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Beauty

### Makeup (`makeup`)

Model: `APPOINTMENT`. Source profile: `MP_makeup`. Status: planned / not started / not run.

Artist eligibility, exact makeup duration, bridal/event package resources and home travel; product sales remain a separate order activity.

Merchant view: Day/week staff-resource calendar plus agenda and booking detail.

Required setup: scheduled_booking_enabled; exact_duration_minutes; eligible_staff_room_equipment; resource_schedule; buffers_and_lead_time; in_person_remote_or_home_method.

Conditional models:

- `FIELD_VISIT`: answers.home_service=yes AND a service offering explicitly enables customer-location fulfilment; a product order alone does not activate a visit.
- `ORDER`: answers.products_for_sale=yes AND a product offering with actual inventory/fulfilment authority is configured.

Corrections to earlier proposal:

- booking_required=no does not prove scheduled booking is unavailable; ask whether optional bookings are offered.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 8 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Skincare (`skincare`)

Model: `ORDER`. Source profile: `MP_skincare`. Status: planned / not started / not run.

Distinguish skincare products from routine consultations and home services; merchant-declared skin suitability is not clinical verification.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `FIELD_VISIT`: answers.home_service=yes AND a service offering explicitly enables customer-location fulfilment; a product order alone does not activate a visit.
- `APPOINTMENT`: answers.custom_routine_consult=yes AND an administrative consultation offering is configured.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 8 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Haircare (`haircare`)

Model: `APPOINTMENT`. Source profile: `MP_haircare`. Status: planned / not started / not run.

Stylist/chair/service-duration resources, walk-in versus booked intake and home visits; product retail can coexist.

Merchant view: Day/week staff-resource calendar plus agenda and booking detail.

Required setup: scheduled_booking_enabled; exact_duration_minutes; eligible_staff_room_equipment; resource_schedule; buffers_and_lead_time; in_person_remote_or_home_method.

Conditional models:

- `FIELD_VISIT`: answers.home_visits=yes AND the selected service enables customer-location fulfilment.
- `ORDER`: answers.products_for_sale=yes AND a product offering with actual inventory/fulfilment authority is configured.

Corrections to earlier proposal:

- booking_required=no does not prove scheduled booking is unavailable; preserve optional appointments when explicitly offered.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 8 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Fragrances (`fragrances`)

Model: `ORDER`. Source profile: `MP_fragrances`. Status: planned / not started / not run.

Fragrance-family retail with gift wrapping; products_for_sale=no requires offering clarification rather than an invented appointment.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Cosmetics Stores (`cosmetics_stores`)

Model: `ORDER`. Source profile: `MP_cosmetics_stores`. Status: planned / not started / not run.

Own/multiple brands, physical store and minimum-order retail; cosmetics inventory is separate from appointment capacity.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Vehicle Rentals

### Car Rental (`car_rental`)

Model: `ASSET_INTERVAL`. Source profile: `MP_car_rental`. Status: planned / not started / not run.

Individual rental asset, exact start/end and return condition, fuel/deposit/insurance policy and optional qualified driver allocation.

Merchant view: Asset-by-date interval timeline with handover, return and maintenance.

Required setup: individual_asset_or_declared_pool; exact_start_end_interval; handover_and_return_policy; turnaround_and_maintenance_blocks; deposit_and_price_policy; asset_eligibility.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Self Drive (`self_drive`)

Model: `ASSET_INTERVAL`. Source profile: `MP_self_drive`. Status: planned / not started / not run.

Exclusive self-drive vehicle interval with age eligibility, fuel/deposit terms, handover, return and maintenance blocks.

Merchant view: Asset-by-date interval timeline with handover, return and maintenance.

Required setup: individual_asset_or_declared_pool; exact_start_end_interval; handover_and_return_policy; turnaround_and_maintenance_blocks; deposit_and_price_policy; asset_eligibility.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Corporate Rental (`corporate_rental`)

Model: `ASSET_INTERVAL`. Source profile: `MP_corporate_rental`. Status: planned / not started / not run.

Corporate vehicle occupancy independent of billing cycle; dedicated account manager is not automatically a bookable driver.

Merchant view: Asset-by-date interval timeline with handover, return and maintenance.

Required setup: individual_asset_or_declared_pool; exact_start_end_interval; handover_and_return_policy; turnaround_and_maintenance_blocks; deposit_and_price_policy; asset_eligibility.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Long-Term Rental (`long_term_rental`)

Model: `ASSET_INTERVAL`. Source profile: `MP_long_term_rental`. Status: planned / not started / not run.

Long occupancy intervals, extension conflict checks, maintenance and agreed return; billing periods do not reset vehicle capacity.

Merchant view: Asset-by-date interval timeline with handover, return and maintenance.

Required setup: individual_asset_or_declared_pool; exact_start_end_interval; handover_and_return_policy; turnaround_and_maintenance_blocks; deposit_and_price_policy; asset_eligibility.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Bike Rental (`bike_rental`)

Model: `ASSET_INTERVAL`. Source profile: `MP_bike_rental`. Status: planned / not started / not run.

Bike-type/asset interval and return; if driver service is genuinely offered, allocate its qualified rider without creating an airport transfer.

Merchant view: Asset-by-date interval timeline with handover, return and maintenance.

Required setup: individual_asset_or_declared_pool; exact_start_end_interval; handover_and_return_policy; turnaround_and_maintenance_blocks; deposit_and_price_policy; asset_eligibility.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Experiences

### Concerts (`concerts`)

Model: `SESSION_CAPACITY`. Source profile: `MP_concerts`. Status: planned / not started / not run.

Dated ticket/session places, VIP inventory where configured and ticket delivery; attendee bands are not actual remaining seats.

Merchant view: Dated session list/calendar with held, confirmed and remaining places.

Required setup: dated_session; exact_start_end; place_quantity_unit; session_capacity; eligible_session_resources; booking_window_and_ticket_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Festivals (`festivals`)

Model: `SESSION_CAPACITY`. Source profile: `MP_festivals`. Status: planned / not started / not run.

Dated festival admission inventory and optional multi-day passes; a pass entitlement and each controlled session's capacity stay explicit.

Merchant view: Dated session list/calendar with held, confirmed and remaining places.

Required setup: dated_session; exact_start_end; place_quantity_unit; session_capacity; eligible_session_resources; booking_window_and_ticket_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Conferences (`conferences`)

Model: `SESSION_CAPACITY`. Source profile: `MP_conferences`. Status: planned / not started / not run.

Conference session/admission capacity plus venue, AV and catering dependencies under their actual owners.

Merchant view: Dated session list/calendar with held, confirmed and remaining places.

Required setup: dated_session; exact_start_end; place_quantity_unit; session_capacity; eligible_session_resources; booking_window_and_ticket_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Private Events (`private_events`)

Model: `REQUEST_QUOTE`. Source profile: `MP_private_events`. Status: planned / not started / not run.

Requested date/headcount and venue/planning scope; bind actual venue/team capacity only after quote and supplier acceptance.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Photography (`photography`)

Model: `APPOINTMENT`. Source profile: `MP_photography`. Status: planned / not started / not run.

Photographer/equipment interval, exact session duration and group limit; travel/home location only when selected.

Merchant view: Day/week staff-resource calendar plus agenda and booking detail.

Required setup: scheduled_booking_enabled; exact_duration_minutes; eligible_staff_room_equipment; resource_schedule; buffers_and_lead_time; in_person_remote_or_home_method.

Conditional models:

- `FIELD_VISIT`: answers.home_service=yes AND a service offering explicitly enables customer-location fulfilment; a product order alone does not activate a visit.

Corrections to earlier proposal:

- booking_required=no does not justify deleting optional scheduled sessions.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Workshops (`workshops`)

Model: `SESSION_CAPACITY`. Source profile: `MP_workshops`. Status: planned / not started / not run.

Dated workshop capacity, facilitator/equipment and duration; walk-in admissions still consume the same session pool.

Merchant view: Dated session list/calendar with held, confirmed and remaining places.

Required setup: dated_session; exact_start_end; place_quantity_unit; session_capacity; eligible_session_resources; booking_window_and_ticket_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Classes (`classes`)

Model: `SESSION_CAPACITY`. Source profile: `MP_classes`. Status: planned / not started / not run.

Dated class places and recurring occurrences; recurrence does not create a paid membership or renewal contract.

Merchant view: Dated session list/calendar with held, confirmed and remaining places.

Required setup: dated_session; exact_start_end; place_quantity_unit; session_capacity; eligible_session_resources; booking_window_and_ticket_policy.

Conditional models:

- `ENTITLEMENT`: bookingSetup.membership_plan_enabled=true AND bookingSetup.entitlement_policy is complete with accepted commercial scope/price/renewal rules; source hints (answers.recurring_sessions) are discovery only, not activation prerequisites, and neither recurrence nor a positive legacy declaration is required for a separately confirmed plan.

Corrections to earlier proposal:

- Recurring sessions are recurrence, not automatic membership or plan renewal.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Sports Activities (`sports_activities`)

Model: `SESSION_CAPACITY`. Source profile: `MP_sports_activities`. Status: planned / not started / not run.

Session participant capacity and required instructor/equipment/space; repeated sessions and membership are distinct.

Merchant view: Dated session list/calendar with held, confirmed and remaining places.

Required setup: dated_session; exact_start_end; place_quantity_unit; session_capacity; eligible_session_resources; booking_window_and_ticket_policy.

Conditional models:

- `ENTITLEMENT`: bookingSetup.membership_plan_enabled=true AND bookingSetup.entitlement_policy is complete with accepted commercial scope/price/renewal rules; source hints (answers.recurring_sessions) are discovery only, not activation prerequisites, and neither recurrence nor a positive legacy declaration is required for a separately confirmed plan.

Corrections to earlier proposal:

- Recurring sessions do not automatically create paid membership/renewal capability.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Recreation (`recreation`)

Model: `SESSION_CAPACITY`. Source profile: `MP_recreation`. Status: planned / not started / not run.

Dated recreation activity capacity and equipment with booking window; walk-ins require a live capacity check.

Merchant view: Dated session list/calendar with held, confirmed and remaining places.

Required setup: dated_session; exact_start_end; place_quantity_unit; session_capacity; eligible_session_resources; booking_window_and_ticket_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Financial Services

### Banking (`banking`)

Model: `REQUEST_QUOTE`. Source profile: `MP_banking`. Status: planned / not started / not run.

Administrative banking enquiry or explicitly offered consultation; calendar confirmation does not approve an account, loan or funds movement.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `APPOINTMENT`: bookingSetup.booking_enabled=true AND bookingSetup.optional_service_booking_enabled=true for a published staff consultation; financial enquiry itself reserves no funds or provider approval.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Forex (`forex`)

Model: `REQUEST_QUOTE`. Source profile: `MP_forex`. Status: planned / not started / not run.

Currency-service enquiry and optional staff consultation; a time reservation never locks an exchange rate or currency inventory.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `APPOINTMENT`: bookingSetup.booking_enabled=true AND bookingSetup.optional_service_booking_enabled=true for a published staff consultation; financial enquiry itself reserves no funds or provider approval.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Insurance (`insurance`)

Model: `REQUEST_QUOTE`. Source profile: `MP_insurance`. Status: planned / not started / not run.

Insurance enquiry/provider appointment where offered; no calendar event binds cover or underwriting approval.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `APPOINTMENT`: bookingSetup.booking_enabled=true AND bookingSetup.optional_service_booking_enabled=true for a published staff consultation; financial enquiry itself reserves no funds or provider approval.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Payments (`payments`)

Model: `REQUEST_QUOTE`. Source profile: `MP_payments`. Status: planned / not started / not run.

Payment-service enquiry or handoff; this booking module does not reserve financial balances or operate payment rails.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `APPOINTMENT`: bookingSetup.booking_enabled=true AND bookingSetup.optional_service_booking_enabled=true for a published staff consultation; financial enquiry itself reserves no funds or provider approval.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Remittance (`remittance`)

Model: `REQUEST_QUOTE`. Source profile: `MP_remittance`. Status: planned / not started / not run.

Corridor/provider enquiry and optional appointment; transfer acceptance and compliance remain with the authorized provider.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `APPOINTMENT`: bookingSetup.booking_enabled=true AND bookingSetup.optional_service_booking_enabled=true for a published staff consultation; financial enquiry itself reserves no funds or provider approval.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Sacco Services (`sacco_services`)

Model: `REQUEST_QUOTE`. Source profile: `MP_sacco_services`. Status: planned / not started / not run.

SACCO-service administrative request and optional local office consultation; financial entitlement is not calendar capacity.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `APPOINTMENT`: bookingSetup.booking_enabled=true AND bookingSetup.optional_service_booking_enabled=true for a published staff consultation; financial enquiry itself reserves no funds or provider approval.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Business Services (`business_services`)

Model: `REQUEST_QUOTE`. Source profile: `MP_business_services`. Status: planned / not started / not run.

Declared financial/business-service enquiry; classify an actual offered consultation explicitly before booking staff time.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `APPOINTMENT`: bookingSetup.booking_enabled=true AND bookingSetup.optional_service_booking_enabled=true for a published staff consultation; financial enquiry itself reserves no funds or provider approval.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Flowers & Gifts

### Flowers (`flowers`)

Model: `ORDER`. Source profile: `MP_flowers`. Status: planned / not started / not run.

Fresh/preserved bouquets, custom message and accepted delivery date; recurring bouquet orders do not imply membership billing.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `ENTITLEMENT`: bookingSetup.membership_plan_enabled=true AND bookingSetup.entitlement_policy is complete with accepted commercial scope/price/renewal rules; source hints (answers.subscription_bouquets) are discovery only, not activation prerequisites, and neither recurrence nor a positive legacy declaration is required for a separately confirmed plan.

Corrections to earlier proposal:

- Recurring bouquet orders do not automatically create membership entitlement or renewal billing.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Gift Hampers (`gift_hampers`)

Model: `ORDER`. Source profile: `MP_gift_hampers`. Status: planned / not started / not run.

Hamper order and gift message; custom curation can require approved specification and production lead time.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `PRODUCTION_DUE`: answers.custom_curation=yes AND bookingSetup.custom_order_kind=made_to_specification AND the accepted hamper specification needs production/curation capacity.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Cakes (`cakes`)

Model: `PRODUCTION_DUE`. Source profile: `MP_cakes`. Status: planned / not started / not run.

Accepted cake design, dietary specification, exact advance cutoff and production/delivery promise; design approval precedes commitment where required.

Merchant view: Specification/approval work queue and production due-date/capacity view.

Required setup: accepted_specification; approval_policy; exact_lead_time_and_cutoff; production_capacity_unit; due_local_date_or_exact_instant; fulfilment_window.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Chocolates (`chocolates`)

Model: `ORDER`. Source profile: `MP_chocolates`. Status: planned / not started / not run.

Gift-wrapped chocolate order, message and delivery promise if offered; no appointment resource is allocated.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Personalized Gifts (`personalized_gifts`)

Model: `PRODUCTION_DUE`. Source profile: `MP_personalized_gifts`. Status: planned / not started / not run.

Approved personalization and due date with production capacity and corporate quantity; preserve specification revisions.

Merchant view: Specification/approval work queue and production due-date/capacity view.

Required setup: accepted_specification; approval_policy; exact_lead_time_and_cutoff; production_capacity_unit; due_local_date_or_exact_instant; fulfilment_window.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Occasion Gifts (`occasion_gifts`)

Model: `ORDER`. Source profile: `MP_occasion_gifts`. Status: planned / not started / not run.

Occasion/message/gift wrapping order with optional promised delivery date; occasion alone is not a reservation.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Restaurants & Food

### Restaurant (`restaurant`)

Model: `ORDER`. Source profile: `MP_restaurant`. Status: planned / not started / not run.

Food orders plus separately enabled table reservations with party size, table compatibility, dining interval and turnover.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `SPACE_RESERVATION`: bookingSetup.offers_table_reservations=true AND bookingSetup.space_policy, bookingSetup.exact_duration_minutes and bookingSetup.source_reservation_authority are complete and validated; answers.reservation_system discovers an existing system only and never activates this capability.

Corrections to earlier proposal:

- reservation_system discovers an existing system only and cannot activate table booking. Require bookingSetup.offers_table_reservations plus validated authority, tables/party compatibility and turnover; use SPACE_RESERVATION rather than generic appointment behavior.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Fast Food (`fast_food`)

Model: `ORDER`. Source profile: `MP_fast_food`. Status: planned / not started / not run.

Food preparation/collection/delivery promise with drive-through or family-meal variants; no table reservation is inferred.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Café (`cafe`)

Model: `ORDER`. Source profile: `MP_cafe`. Status: planned / not started / not run.

Food/drink order; seated_capacity or coworking_space does not enable a seat/desk booking without an explicit offering.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Corrections to earlier proposal:

- seated_capacity and coworking_space do not enable seat/desk reservations by themselves.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Bakery (`bakery`)

Model: `ORDER`. Source profile: `MP_bakery`. Status: planned / not started / not run.

Standard bakery orders and explicitly custom production with exact advance cutoff and fulfilment promise.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `PRODUCTION_DUE`: answers.custom_orders=yes AND bookingSetup.custom_order_kind=made_to_specification; special_sourcing and standard_product do not activate production.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Desserts (`desserts`)

Model: `ORDER`. Source profile: `MP_desserts`. Status: planned / not started / not run.

Dessert inventory or custom accepted specification, dietary detail and production promise; distinguish stock from made-to-order.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `PRODUCTION_DUE`: answers.custom_orders=yes AND bookingSetup.custom_order_kind=made_to_specification; special_sourcing and standard_product do not activate production.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Juice Bar (`juice_bar`)

Model: `ORDER`. Source profile: `MP_juice_bar`. Status: planned / not started / not run.

Drink/food orders; detox_programs describes an offering and does not automatically create clinical sessions or subscriptions.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Cloud Kitchen (`cloud_kitchen`)

Model: `ORDER`. Source profile: `MP_cloud_kitchen`. Status: planned / not started / not run.

Brand/menu preparation and delivery; collection windows apply only when pickup is offered and exact capacity is configured.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Catering (`catering`)

Model: `REQUEST_QUOTE`. Source profile: `MP_catering`. Status: planned / not started / not run.

Requested headcount/menu/date, staffing and equipment scope; quote approval links production and event resources without duplicate charges.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Groceries & Essentials

### Supermarket (`supermarket`)

Model: `ORDER`. Source profile: `MP_supermarket`. Status: planned / not started / not run.

Stock-owned grocery orders; delivery/collection windows and express cutoffs only when explicitly configured.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Convenience Store (`convenience_store`)

Model: `ORDER`. Source profile: `MP_convenience_store`. Status: planned / not started / not run.

Retail essentials and optional express fulfilment; 24-hour opening does not mean continuous free delivery capacity.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Fresh Produce (`fresh_produce`)

Model: `ORDER`. Source profile: `MP_fresh_produce`. Status: planned / not started / not run.

Perishable quantity orders, market dates and optionally recurring boxes; recurring fulfilment and membership are separate.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `ENTITLEMENT`: bookingSetup.membership_plan_enabled=true AND bookingSetup.entitlement_policy is complete with accepted commercial scope/price/renewal rules; source hints (answers.subscription_boxes) are discovery only, not activation prerequisites, and neither recurrence nor a positive legacy declaration is required for a separately confirmed plan.

Corrections to earlier proposal:

- Subscription boxes need repeated-order/fulfilment rules; paid membership is a separate explicit commercial plan.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Butchery (`butchery`)

Model: `ORDER`. Source profile: `MP_butchery`. Status: planned / not started / not run.

Measured cut order and advance preparation cutoff; custom cuts require accepted quantity/specification, not a customer appointment.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Seafood (`seafood`)

Model: `ORDER`. Source profile: `MP_seafood`. Status: planned / not started / not run.

Measured seafood inventory and processing/handling promise; live or onsite processing facts do not establish free processing capacity.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Organic Store (`organic_store`)

Model: `ORDER`. Source profile: `MP_organic_store`. Status: planned / not started / not run.

Retail organic/store packaging attributes and optional configured fulfilment windows; no booking activity is inferred.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Laundry & Cleaning

### Laundry (`laundry`)

Model: `LINKED_WINDOWS`. Source profile: `MP_laundry`. Status: planned / not started / not run.

Measured laundry intake, collection or customer drop-off, processing turnaround and independently feasible return window.

Merchant view: Linked collection, processing and return agenda with separate commitments.

Required setup: dropoff_or_collection_method; collection_window; processing_turnaround; return_window; processing_quantity_unit; transport_resource_policy_when_offered.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Dry Cleaning (`dry_cleaning`)

Model: `LINKED_WINDOWS`. Source profile: `MP_dry_cleaning`. Status: planned / not started / not run.

Garment-type/item intake, processing turnaround and linked collection/return commitments under their actual capacity owners.

Merchant view: Linked collection, processing and return agenda with separate commitments.

Required setup: dropoff_or_collection_method; collection_window; processing_turnaround; return_window; processing_quantity_unit; transport_resource_policy_when_offered.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Ironing (`ironing`)

Model: `LINKED_WINDOWS`. Source profile: `MP_ironing`. Status: planned / not started / not run.

Item-based ironing intake and processing promise; transport legs only when pickup/delivery is offered.

Merchant view: Linked collection, processing and return agenda with separate commitments.

Required setup: dropoff_or_collection_method; collection_window; processing_turnaround; return_window; processing_quantity_unit; transport_resource_policy_when_offered.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Home Cleaning (`home_cleaning`)

Model: `FIELD_VISIT`. Source profile: `MP_home_cleaning`. Status: planned / not started / not run.

Household visit duration, eligible crew/equipment, customer address/service area and travel; recurrence separate from paid subscription.

Merchant view: Team visit agenda and resource calendar with service location and travel constraints.

Required setup: exact_visit_duration; eligible_team_and_equipment; service_area; customer_address; travel_buffer_policy; field_or_fixed_location_selection.

Conditional models:

- `ENTITLEMENT`: bookingSetup.membership_plan_enabled=true AND bookingSetup.entitlement_policy is complete with accepted commercial scope/price/renewal rules; source hints (answers.recurring_sub) are discovery only, not activation prerequisites, and neither recurrence nor a positive legacy declaration is required for a separately confirmed plan.

Corrections to earlier proposal:

- Recurring visit pattern and commercial subscription/renewal are separate; each occurrence must have capacity.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Office Cleaning (`office_cleaning`)

Model: `FIELD_VISIT`. Source profile: `MP_office_cleaning`. Status: planned / not started / not run.

Office visit crew/hours and site constraints, equipment and travel; recurring schedules remain actual dated commitments.

Merchant view: Team visit agenda and resource calendar with service location and travel constraints.

Required setup: exact_visit_duration; eligible_team_and_equipment; service_area; customer_address; travel_buffer_policy; field_or_fixed_location_selection.

Conditional models:

- `ENTITLEMENT`: bookingSetup.membership_plan_enabled=true AND bookingSetup.entitlement_policy is complete with accepted commercial scope/price/renewal rules; source hints (answers.recurring_sub) are discovery only, not activation prerequisites, and neither recurrence nor a positive legacy declaration is required for a separately confirmed plan.

Corrections to earlier proposal:

- Recurring visit pattern and commercial subscription/renewal are separate; each occurrence must have capacity.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Marketplace

### Home & Living (`home_living`)

Model: `ORDER`. Source profile: `MP_home_living`. Status: planned / not started / not run.

New/used household retail with fragile handling and return policy; delivery promises require actual owner acceptance.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Furniture (`furniture`)

Model: `ORDER`. Source profile: `MP_furniture`. Status: planned / not started / not run.

Furniture retail and optional installation visit linked to selected order/method; installer time is not implied for every product.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `FIELD_VISIT`: answers.installation_service=yes AND the customer selects the separately configured installation service for an order.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Appliances (`appliances`)

Model: `ORDER`. Source profile: `MP_appliances`. Status: planned / not started / not run.

Appliance inventory and warranty with optional installer/equipment visit; delivery and installation have distinct feasible times.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `FIELD_VISIT`: answers.installation_service=yes AND the customer selects the separately configured installation service for an order.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Decor (`decor`)

Model: `ORDER`. Source profile: `MP_decor`. Status: planned / not started / not run.

Decor retail, condition and fragile/gift handling; no venue/styling appointment is inferred from category name.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Kitchenware (`kitchenware`)

Model: `ORDER`. Source profile: `MP_kitchenware`. Status: planned / not started / not run.

New/used kitchenware order and return policy, with optional configured fulfilment window.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Books (`books`)

Model: `ORDER`. Source profile: `MP_books`. Status: planned / not started / not run.

Book inventory and special sourcing/custom request; clarify whether custom_orders means sourcing or genuine production.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `PRODUCTION_DUE`: answers.custom_orders=yes AND bookingSetup.custom_order_kind=made_to_specification; special_sourcing and standard_product do not activate production.

Corrections to earlier proposal:

- custom_orders can mean special sourcing; clarify before enabling PRODUCTION_DUE.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Stationery (`stationery`)

Model: `ORDER`. Source profile: `MP_stationery`. Status: planned / not started / not run.

Stationery retail, minimum quantity and corporate billing; corporate account status does not allocate time capacity.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Office Supplies (`office_supplies`)

Model: `ORDER`. Source profile: `MP_office_supplies`. Status: planned / not started / not run.

Office supply quantities, minimum order and corporate billing; scheduled replenishment needs explicit configuration.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### General Retail (`general_retail`)

Model: `ORDER`. Source profile: `MP_general_retail`. Status: planned / not started / not run.

Declared product, condition and stock authority with optional delivery/collection promise; no generic appointment fallback.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Pharmacy

### Pharmacy (`pharmacy_retail`)

Model: `ORDER`. Source profile: `MP_pharmacy_retail`. Status: planned / not started / not run.

Pharmacy order and declared pharmacist/cold-chain/prescription fulfilment gates; do not put prescription details in calendar titles.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Medical Supplies (`medical_supplies`)

Model: `ORDER`. Source profile: `MP_medical_supplies`. Status: planned / not started / not run.

Medical supply quantities and corporate order terms; supply sales do not create patient appointments.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Baby Products (`baby_products`)

Model: `ORDER`. Source profile: `MP_baby_products`. Status: planned / not started / not run.

Baby-product retail and optional recurring order plan; entitlement/billing is distinct from recurring delivery.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `ENTITLEMENT`: bookingSetup.membership_plan_enabled=true AND bookingSetup.entitlement_policy is complete with accepted commercial scope/price/renewal rules; source hints (answers.subscription_available) are discovery only, not activation prerequisites, and neither recurrence nor a positive legacy declaration is required for a separately confirmed plan.

Corrections to earlier proposal:

- subscription_available does not alone establish membership entitlement, renewal price or recurring reserved delivery.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Supplements (`supplements`)

Model: `ORDER`. Source profile: `MP_supplements`. Status: planned / not started / not run.

Supplement inventory and authenticity declarations; no clinical consultation is inferred.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Health

### Clinics (`clinics`)

Model: `APPOINTMENT`. Source profile: `MP_clinics`. Status: planned / not started / not run.

Administrative clinic slot with eligible staff/room; explicitly distinguish appointment booking, walk-in queue and home visit.

Merchant view: Day/week staff-resource calendar plus agenda and booking detail.

Required setup: scheduled_booking_enabled; exact_duration_minutes; eligible_staff_room_equipment; resource_schedule; buffers_and_lead_time; in_person_remote_or_home_method.

Conditional models:

- `FIELD_VISIT`: answers.home_visits=yes AND the selected service enables customer-location fulfilment.

Corrections to earlier proposal:

- appointment_booking=no must not retain an instant appointment claim merely because the base workflow is WF_APPOINTMENT.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Telemedicine (`telemedicine`)

Model: `APPOINTMENT`. Source profile: `MP_telemedicine`. Status: planned / not started / not run.

Eligible remote provider/time interval and session access readiness; no clinical record or clinical outcome in booking/calendar data.

Merchant view: Day/week staff-resource calendar plus agenda and booking detail.

Required setup: scheduled_booking_enabled; exact_duration_minutes; eligible_staff_room_equipment; resource_schedule; buffers_and_lead_time; in_person_remote_or_home_method.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Labs (`labs`)

Model: `APPOINTMENT`. Source profile: `MP_labs`. Status: planned / not started / not run.

Administrative lab/sample collection appointment or home collection; result turnaround is a separate administrative milestone, not a reserved session.

Merchant view: Day/week staff-resource calendar plus agenda and booking detail.

Required setup: scheduled_booking_enabled; exact_duration_minutes; eligible_staff_room_equipment; resource_schedule; buffers_and_lead_time; in_person_remote_or_home_method.

Conditional models:

- `FIELD_VISIT`: answers.home_sample_collection=yes AND the selected administrative collection uses a customer location.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Mental Health (Therapy) (`mental_health`)

Model: `APPOINTMENT`. Source profile: `MP_mental_health`. Status: planned / not started / not run.

Private administrative therapy slot with exact duration and selected online/in-person method; minimize sensitive calendar summaries.

Merchant view: Day/week staff-resource calendar plus agenda and booking detail.

Required setup: scheduled_booking_enabled; exact_duration_minutes; eligible_staff_room_equipment; resource_schedule; buffers_and_lead_time; in_person_remote_or_home_method.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Coaching (`coaching`)

Model: `APPOINTMENT`. Source profile: `MP_coaching`. Status: planned / not started / not run.

Coach duration and online/in-person method, with separately configured group session capacity where offered.

Merchant view: Day/week staff-resource calendar plus agenda and booking detail.

Required setup: scheduled_booking_enabled; exact_duration_minutes; eligible_staff_room_equipment; resource_schedule; buffers_and_lead_time; in_person_remote_or_home_method.

Conditional models:

- `SESSION_CAPACITY`: answers.group_sessions=yes AND a dated group offering declares actual place capacity.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Tech & Electronics

### Smartphones (`smartphones`)

Model: `ORDER`. Source profile: `MP_smartphones`. Status: planned / not started / not run.

Device retail plus explicitly selected repair intake or trade-in assessment with separate quote/approval and device privacy policy.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `SERVICE_JOB`: answers.repair_services explicitly selects an offered repair type AND the customer selects repair intake; ordinary product orders remain orders OR: answers.trade_in_program=yes AND the customer selects a configured valuation/assessment service.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Accessories (`tech_accessories`)

Model: `ORDER`. Source profile: `MP_tech_accessories`. Status: planned / not started / not run.

Tech accessory inventory, warranty and minimum quantity; no installation/repair booking unless separately offered.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Computers (`computers`)

Model: `ORDER`. Source profile: `MP_computers`. Status: planned / not started / not run.

Computer inventory plus selected repair intake/assessment, exact workshop or appointment policy and device access consent.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `SERVICE_JOB`: answers.repair_services explicitly selects an offered repair type AND the customer selects repair intake; ordinary product orders remain orders.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Gaming (`gaming`)

Model: `ORDER`. Source profile: `MP_gaming`. Status: planned / not started / not run.

Console/game/accessory inventory including pre-owned condition; category does not imply gaming-seat sessions.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Audio (`audio`)

Model: `ORDER`. Source profile: `MP_audio`. Status: planned / not started / not run.

Audio product inventory, warranty and return policy; demonstration or installation requires an explicit extra service.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Telecom Services (`telecom_services`)

Model: `SERVICE_JOB`. Source profile: `MP_telecom_services`. Status: planned / not started / not run.

Service intake and provider job requirements; device/accessory sales can coexist without becoming service appointments.

Merchant view: Intake/assessment/workshop queue with optional scheduled bay/resource agenda.

Required setup: intake_method; assessment_and_approval_policy; workshop_staff_bay_or_equipment; scheduled_or_queue_mode; job_duration_or_estimate_distinction; completion_and_collection_policy.

Conditional models:

- `ORDER`: answers.telecom_services_offered includes devices or accessories AND the selected offering is a product.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Smart Devices (`smart_devices`)

Model: `ORDER`. Source profile: `MP_smart_devices`. Status: planned / not started / not run.

Smart-device retail and optional selected installer visit with eligible staff/equipment and service area.

Merchant view: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid.

Required setup: confirmed_offering_and_publication; declared_inventory_authority; price_and_quantity_units; selected_fulfilment_methods; promised_window_only_if_explicitly_enabled.

Conditional models:

- `FIELD_VISIT`: answers.installation_service=yes AND the customer selects the separately configured installation service for an order.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Travel & Tours

### Safaris (`safaris`)

Model: `TOUR`. Source profile: `MP_safaris`. Status: planned / not started / not run.

Dated departure or private multi-day itinerary, guest places and guide/vehicle allocations; accommodation confirmations remain with supplier owner.

Merchant view: Departure-capacity calendar and multi-day itinerary/resource agenda.

Required setup: dated_departure_or_private_itinerary; guest_quantity; guide_vehicle_and_equipment_requirements; multi_day_local_dates_if_applicable; supplier_confirmation_boundary; private_shared_capacity_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Game Drives (`game_drives`)

Model: `TOUR`. Source profile: `MP_game_drives`. Status: planned / not started / not run.

Dated drive departure/occupancy, guest capacity, guide and private/shared vehicle policy with exact booking window.

Merchant view: Departure-capacity calendar and multi-day itinerary/resource agenda.

Required setup: dated_departure_or_private_itinerary; guest_quantity; guide_vehicle_and_equipment_requirements; multi_day_local_dates_if_applicable; supplier_confirmation_boundary; private_shared_capacity_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Luxury Safaris (`luxury_safaris`)

Model: `TOUR`. Source profile: `MP_luxury_safaris`. Status: planned / not started / not run.

Multi-day private/shared itinerary and guest/resource capacity; luxury/accommodation claims do not prove supplier availability.

Merchant view: Departure-capacity calendar and multi-day itinerary/resource agenda.

Required setup: dated_departure_or_private_itinerary; guest_quantity; guide_vehicle_and_equipment_requirements; multi_day_local_dates_if_applicable; supplier_confirmation_boundary; private_shared_capacity_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### City Tours (`city_tours`)

Model: `TOUR`. Source profile: `MP_city_tours`. Status: planned / not started / not run.

Tour mode, language-capable guide, exact duration and dated guest places; resources depend on walking/cycling/vehicle offering.

Merchant view: Departure-capacity calendar and multi-day itinerary/resource agenda.

Required setup: dated_departure_or_private_itinerary; guest_quantity; guide_vehicle_and_equipment_requirements; multi_day_local_dates_if_applicable; supplier_confirmation_boundary; private_shared_capacity_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Cultural Tours (`cultural_tours`)

Model: `TOUR`. Source profile: `MP_cultural_tours`. Status: planned / not started / not run.

Dated guide/language/mode and guest group capacity; third-party access or venue confirmation is explicit.

Merchant view: Departure-capacity calendar and multi-day itinerary/resource agenda.

Required setup: dated_departure_or_private_itinerary; guest_quantity; guide_vehicle_and_equipment_requirements; multi_day_local_dates_if_applicable; supplier_confirmation_boundary; private_shared_capacity_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Adventure Tours (`adventure_tours`)

Model: `TOUR`. Source profile: `MP_adventure_tours`. Status: planned / not started / not run.

Dated guest capacity and eligible guide/equipment/mode; equipment_provided does not identify actual available equipment.

Merchant view: Departure-capacity calendar and multi-day itinerary/resource agenda.

Required setup: dated_departure_or_private_itinerary; guest_quantity; guide_vehicle_and_equipment_requirements; multi_day_local_dates_if_applicable; supplier_confirmation_boundary; private_shared_capacity_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Travel Packages (`travel_packages`)

Model: `REQUEST_QUOTE`. Source profile: `MP_travel_packages`. Status: planned / not started / not run.

Accepted itinerary/quote and third-party flight/accommodation confirmations; included flight never implies NEXG seat inventory.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Vehicle Services

### Car Wash (`car_wash`)

Model: `SERVICE_JOB`. Source profile: `MP_car_wash`. Status: planned / not started / not run.

Selected wash duration, bay/team and queue or appointment; mobile wash adds travel, and plan entitlement does not reserve a wash slot.

Merchant view: Intake/assessment/workshop queue with optional scheduled bay/resource agenda.

Required setup: intake_method; assessment_and_approval_policy; workshop_staff_bay_or_equipment; scheduled_or_queue_mode; job_duration_or_estimate_distinction; completion_and_collection_policy.

Conditional models:

- `FIELD_VISIT`: answers.mobile_service=yes AND the selected job is accepted for customer-location fulfilment.
- `ENTITLEMENT`: bookingSetup.membership_plan_enabled=true AND bookingSetup.entitlement_policy is complete with accepted commercial scope/price/renewal rules; source hints (answers.subscription_plans) are discovery only, not activation prerequisites, and neither recurrence nor a positive legacy declaration is required for a separately confirmed plan.

Corrections to earlier proposal:

- subscription_plans requires explicit entitlement/billing scope; a plan does not reserve a bay or staff time.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 8 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Tire Service (`tire_service`)

Model: `SERVICE_JOB`. Source profile: `MP_tire_service`. Status: planned / not started / not run.

Workshop bay/technician job or mobile callout, with emergency response policy and compatible tire inventory kept separate.

Merchant view: Intake/assessment/workshop queue with optional scheduled bay/resource agenda.

Required setup: intake_method; assessment_and_approval_policy; workshop_staff_bay_or_equipment; scheduled_or_queue_mode; job_duration_or_estimate_distinction; completion_and_collection_policy.

Conditional models:

- `FIELD_VISIT`: answers.mobile_service=yes AND the selected job is accepted for customer-location fulfilment.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Battery Service (`battery_service`)

Model: `FIELD_VISIT`. Source profile: `MP_battery_service`. Status: planned / not started / not run.

Mobile team/callout or merchant-location workshop selected explicitly; battery stock and staff dispatch are separate owners.

Merchant view: Team visit agenda and resource calendar with service location and travel constraints.

Required setup: exact_visit_duration; eligible_team_and_equipment; service_area; customer_address; travel_buffer_policy; field_or_fixed_location_selection.

Conditional models:

- `FIELD_VISIT`: answers.mobile_service=yes AND the selected job is accepted for customer-location fulfilment.
- `SERVICE_JOB`: answers.mobile_service=no AND work is accepted at the merchant location; FIELD_VISIT is not active for that selected method.

Corrections to earlier proposal:

- mobile_service=no selects workshop service rather than dispatch; stock and staff availability stay separate.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 8 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Vehicle Assistance (`vehicle_assistance`)

Model: `FIELD_VISIT`. Source profile: `MP_vehicle_assistance`. Status: planned / not started / not run.

Assistance type, response area and dispatched crew/vehicle; estimated arrival is not a guaranteed future appointment slot.

Merchant view: Team visit agenda and resource calendar with service location and travel constraints.

Required setup: exact_visit_duration; eligible_team_and_equipment; service_area; customer_address; travel_buffer_policy; field_or_fixed_location_selection.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Vehicle Inspection (`vehicle_inspection`)

Model: `APPOINTMENT`. Source profile: `MP_vehicle_inspection`. Status: planned / not started / not run.

Exact inspection duration and eligible inspector/bay/equipment; mobile inspection adds customer location and travel.

Merchant view: Day/week staff-resource calendar plus agenda and booking detail.

Required setup: scheduled_booking_enabled; exact_duration_minutes; eligible_staff_room_equipment; resource_schedule; buffers_and_lead_time; in_person_remote_or_home_method.

Conditional models:

- `FIELD_VISIT`: answers.mobile_inspection=yes AND the selected inspection uses a customer location.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Wellness

### Spa (`spa`)

Model: `APPOINTMENT`. Source profile: `MP_spa`. Status: planned / not started / not run.

Service duration and compatible practitioner/room; couples package may require simultaneous linked resources and membership is separate.

Merchant view: Day/week staff-resource calendar plus agenda and booking detail.

Required setup: scheduled_booking_enabled; exact_duration_minutes; eligible_staff_room_equipment; resource_schedule; buffers_and_lead_time; in_person_remote_or_home_method.

Conditional models:

- `FIELD_VISIT`: answers.home_service=yes AND a service offering explicitly enables customer-location fulfilment; a product order alone does not activate a visit.
- `ENTITLEMENT`: bookingSetup.membership_plan_enabled=true AND bookingSetup.entitlement_policy is complete with accepted commercial scope/price/renewal rules; source hints (answers.membership_available) are discovery only, not activation prerequisites, and neither recurrence nor a positive legacy declaration is required for a separately confirmed plan.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 8 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Massage (`massage`)

Model: `APPOINTMENT`. Source profile: `MP_massage`. Status: planned / not started / not run.

Therapist/room duration and home travel where selected; couples treatment must allocate every required practitioner together.

Merchant view: Day/week staff-resource calendar plus agenda and booking detail.

Required setup: scheduled_booking_enabled; exact_duration_minutes; eligible_staff_room_equipment; resource_schedule; buffers_and_lead_time; in_person_remote_or_home_method.

Conditional models:

- `FIELD_VISIT`: answers.home_service=yes AND a service offering explicitly enables customer-location fulfilment; a product order alone does not activate a visit.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Gym (`gym`)

Model: `ENTITLEMENT`. Source profile: `MP_gym`. Status: planned / not started / not run.

Membership validity and usage rules; opening hours do not reserve trainer/equipment, and personal training sessions are separately booked.

Merchant view: Plan/usage/renewal view linked to separately reserved sessions.

Required setup: explicit_commercial_plan; included_scope_and_units; validity_local_dates; usage_and_renewal_policy; separate_bookable_services; entitlement_owner.

Conditional models:

- `APPOINTMENT`: answers.personal_training_available=yes AND a trainer service with exact duration and eligibility is configured.

Corrections to earlier proposal:

- Gym membership and 24-hour opening do not imply personal trainer or equipment availability.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Personal Training (`personal_training`)

Model: `APPOINTMENT`. Source profile: `MP_personal_training`. Status: planned / not started / not run.

Trainer duration and chosen gym/client/online location; group places and travel dependencies only for enabled methods.

Merchant view: Day/week staff-resource calendar plus agenda and booking detail.

Required setup: scheduled_booking_enabled; exact_duration_minutes; eligible_staff_room_equipment; resource_schedule; buffers_and_lead_time; in_person_remote_or_home_method.

Conditional models:

- `SESSION_CAPACITY`: answers.group_sessions=yes AND a dated group offering declares actual place capacity.
- `FIELD_VISIT`: answers.session_location is client_location or flexible AND the selected session uses the customer's location.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 8 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## App Services

### Reservations (`reservations`)

Model: `REQUEST_QUOTE`. Source profile: `MP_reservations`. Status: planned / not started / not run.

Concierge request for a venue reservation; external venue acceptance/reference is needed before confirming it to the customer.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `FIELD_VISIT`: The accepted request explicitly includes an own-team scheduled visit AND the responsible authority confirms crew and resources; a request alone reserves nothing.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Personal Assistance (`personal_assistance`)

Model: `REQUEST_QUOTE`. Source profile: `MP_personal_assistance`. Status: planned / not started / not run.

Accepted assistance scope and response commitment; account manager or retainer does not reserve unlimited staff time.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `FIELD_VISIT`: The accepted request explicitly includes an own-team scheduled visit AND the responsible authority confirms crew and resources; a request alone reserves nothing.
- `ENTITLEMENT`: bookingSetup.membership_plan_enabled=true AND bookingSetup.entitlement_policy is complete with accepted commercial scope/price/renewal rules; source hints (answers.retainer_ksh) are discovery only, not activation prerequisites, and neither recurrence nor a positive legacy declaration is required for a separately confirmed plan.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 8 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Shopping Assistance (`shopping_assistance`)

Model: `REQUEST_QUOTE`. Source profile: `MP_shopping_assistance`. Status: planned / not started / not run.

Accepted shopping scope, provider/runner and completion promise; purchased-goods inventory is not NEXG calendar capacity.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `FIELD_VISIT`: The accepted request explicitly includes an own-team scheduled visit AND the responsible authority confirms crew and resources; a request alone reserves nothing.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Gift Sourcing (`gift_sourcing`)

Model: `REQUEST_QUOTE`. Source profile: `MP_gift_sourcing`. Status: planned / not started / not run.

Gift specification, supplier sourcing and accepted due date; wrapping and corporate scope do not guarantee supplier stock.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `FIELD_VISIT`: The accepted request explicitly includes an own-team scheduled visit AND the responsible authority confirms crew and resources; a request alone reserves nothing.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Travel Planning (`travel_planning`)

Model: `REQUEST_QUOTE`. Source profile: `MP_travel_planning`. Status: planned / not started / not run.

Travel-planning enquiry, agreed itinerary work and supplier handoffs; visa/insurance assistance does not mean approval.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `FIELD_VISIT`: The accepted request explicitly includes an own-team scheduled visit AND the responsible authority confirms crew and resources; a request alone reserves nothing.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Property Coordination (`property_coordination`)

Model: `REQUEST_QUOTE`. Source profile: `MP_property_coordination`. Status: planned / not started / not run.

Accepted coordination scope and planned visits/provider confirmations; coverage and 24-hour response do not guarantee free staff.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `FIELD_VISIT`: The accepted request explicitly includes an own-team scheduled visit AND the responsible authority confirms crew and resources; a request alone reserves nothing.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Moving Assistance (`moving_assistance`)

Model: `REQUEST_QUOTE`. Source profile: `MP_moving_assistance`. Status: planned / not started / not run.

Accepted move volume/date/address, crew/vehicle/equipment and travel; actual allocations follow quote acceptance.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `FIELD_VISIT`: The accepted request explicitly includes an own-team scheduled visit AND the responsible authority confirms crew and resources; a request alone reserves nothing.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 4 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Cleaning Coordination (`cleaning_coordination`)

Model: `REQUEST_QUOTE`. Source profile: `MP_cleaning_coordination`. Status: planned / not started / not run.

Accepted cleaning scope and third-party or own-team confirmation; recurring requests need actual provider capacity per occurrence.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `FIELD_VISIT`: The accepted request explicitly includes an own-team scheduled visit AND the responsible authority confirms crew and resources; a request alone reserves nothing.
- `ENTITLEMENT`: bookingSetup.membership_plan_enabled=true AND bookingSetup.entitlement_policy is complete with accepted commercial scope/price/renewal rules; source hints (answers.recurring_sub) are discovery only, not activation prerequisites, and neither recurrence nor a positive legacy declaration is required for a separately confirmed plan.

Corrections to earlier proposal:

- recurring_sub does not automatically establish membership or control a third-party cleaner's capacity.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 8 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### VIP Assistance (`vip_assistance`)

Model: `REQUEST_QUOTE`. Source profile: `MP_vip_assistance`. Status: planned / not started / not run.

Accepted VIP scope, responsible provider and retainer rules; priority/24-hour availability is not unlimited bookable capacity.

Merchant view: Request/quote work queue and response milestones; tentative dates clearly labelled.

Required setup: request_scope; responsible_provider_or_team; response_target_without_capacity_guarantee; quote_and_acceptance_policy; authority_before_commitment.

Conditional models:

- `FIELD_VISIT`: The accepted request explicitly includes an own-team scheduled visit AND the responsible authority confirms crew and resources; a request alone reserves nothing.
- `ENTITLEMENT`: bookingSetup.membership_plan_enabled=true AND bookingSetup.entitlement_policy is complete with accepted commercial scope/price/renewal rules; source hints (answers.retainer_model) are discovery only, not activation prerequisites, and neither recurrence nor a positive legacy declaration is required for a separately confirmed plan.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 8 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.


## Logistics & Shipping

### Sea Freight (`sea_freight`)

Model: `FREIGHT`. Source profile: `MP_sea_freight`. Status: planned / not started / not run.

Shipment quantity/container/CBM/weight, carrier leg, port/cutoff and optional road transport; carrier acceptance owns vessel capacity.

Merchant view: Shipment-leg and cutoff/milestone agenda with carrier confirmation state.

Required setup: shipment_scope_and_measured_quantity; legs_and_responsible_carriers; cutoffs_and_milestone_windows; declared_carrier_capacity_authority; quote_acceptance; loading_and_delivery_constraints.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Air Freight (`air_freight`)

Model: `FREIGHT`. Source profile: `MP_air_freight`. Status: planned / not started / not run.

Weight/volume shipment, carrier acceptance, customs and airport/warehouse legs; do not confuse quoted transit duration with a reserved flight.

Merchant view: Shipment-leg and cutoff/milestone agenda with carrier confirmation state.

Required setup: shipment_scope_and_measured_quantity; legs_and_responsible_carriers; cutoffs_and_milestone_windows; declared_carrier_capacity_authority; quote_acceptance; loading_and_delivery_constraints.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Road Freight & Trucking (`road_freight`)

Model: `FREIGHT`. Source profile: `MP_road_freight`. Status: planned / not started / not run.

Measured load, compatible truck/driver and accepted pickup/delivery windows; fleet-size bands are not individual truck capacity.

Merchant view: Shipment-leg and cutoff/milestone agenda with carrier confirmation state.

Required setup: shipment_scope_and_measured_quantity; legs_and_responsible_carriers; cutoffs_and_milestone_windows; declared_carrier_capacity_authority; quote_acceptance; loading_and_delivery_constraints.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.

### Warehousing & Storage (`warehousing`)

Model: `STORAGE`. Source profile: `MP_warehousing`. Status: planned / not started / not run.

Unit/area/volume occupancy across dates, compatible goods and access windows; explicit sqm/sqft conversion and owner-confirmed remaining capacity.

Merchant view: Storage occupancy timeline with measured capacity and access-window agenda.

Required setup: storage_unit_or_measured_pool; area_volume_or_unit_measure; occupancy_interval; compatible_goods_and_access_windows; capacity_authority; unit_conversion_and_billing_policy.

Acceptance: seven baseline cases for normal; conditional/non-booking; conflict; access; source failure; retry; Kenya time. In addition, 0 cases cover positive, negative, missing and conflicting answers for every conditional binding. Exact hypothetical scenarios, zero-based binding indexes, conditions, required setup and expected results are in the linked JSON.
