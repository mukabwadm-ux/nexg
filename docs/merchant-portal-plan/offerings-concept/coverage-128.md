# Offerings component bindings for all 128 specialties

Design-only coverage, 31 October 2026. The primary editor is a starting shape; the selected effective offering/method resolves final fields and optional editors. Reuse scoped setup rather than requiring it on every listing.

| Category | Specialty | Primary editor | Applicable effective offering models | Scoped specialty fields |
| --- | --- | --- | --- | --- |
| adults_only | Adult Products | PRODUCT_CATALOG_V1 | ORDER | packaging_style, age_gate_method, signature_required, min_order |
| adults_only | Adult Wellness | PRODUCT_CATALOG_V1 | APPOINTMENT, FIELD_VISIT, ORDER | packaging_style, age_gate_method, booking_required, home_service |
| adults_only | Cigarettes | PRODUCT_CATALOG_V1 | ORDER | license_number, age_gate_method, brands_stocked_text, min_order |
| adults_only | Cigars | PRODUCT_CATALOG_V1 | ORDER | license_number, age_gate_method, brands_stocked_text, gift_packaging |
| adults_only | Vapes | PRODUCT_CATALOG_V1 | ORDER | vape_device_types, age_gate_method, license_number, min_order |
| adults_only | Adult Accessories | PRODUCT_CATALOG_V1 | ORDER | packaging_style, age_gate_method, signature_required |
| airport_transfers | Airport Pickup | TRANSFER_ROUTE_V1 | TRANSFER | vehicle_types_transfer, fleet_size, available_24hr, advance_booking_hrs, flight_tracking, chauffeur_uniform, corporate_billing |
| airport_transfers | Airport Drop-off | TRANSFER_ROUTE_V1 | TRANSFER | vehicle_types_transfer, fleet_size, available_24hr, advance_booking_hrs, chauffeur_uniform, corporate_billing |
| airport_transfers | Meet & Greet | TRANSFER_ROUTE_V1 | TRANSFER | vehicle_types_transfer, fleet_size, meet_greet_signage, waiting_time_min, chauffeur_uniform, corporate_billing |
| airport_transfers | Executive Transfer | TRANSFER_ROUTE_V1 | TRANSFER | vehicle_types_transfer, fleet_size, available_24hr, advance_booking_hrs, corporate_billing, chauffeur_uniform, flight_tracking |
| alcohol_beverages | Wine | PRODUCT_CATALOG_V1 | ORDER | liquor_license, wine_origins, cold_delivery, gift_wrapping, min_order |
| alcohol_beverages | Spirits | PRODUCT_CATALOG_V1 | ORDER | liquor_license, brands_stocked_text, gift_wrapping, min_order |
| alcohol_beverages | Beer | PRODUCT_CATALOG_V1 | ORDER | liquor_license, cold_delivery, returnable_bottles, brands_stocked_text, min_order |
| alcohol_beverages | Champagne | PRODUCT_CATALOG_V1 | ORDER | liquor_license, occasions_spec, cold_delivery, gift_wrapping |
| alcohol_beverages | Cocktail Mixers | PRODUCT_CATALOG_V1 | ORDER | liquor_license, gift_packaging, min_order |
| alcohol_beverages | Liquor Stores | PRODUCT_CATALOG_V1 | ORDER | liquor_license, cold_delivery, min_order, corporate_billing |
| fashion_apparel | Men's Fashion | PRODUCT_CATALOG_V1 | APPOINTMENT, ORDER, PRODUCTION_DUE | brand_tier, size_range_adults, has_physical_store, custom_tailoring, style_consultation, return_policy, packaging_fashion |
| fashion_apparel | Women's Fashion | PRODUCT_CATALOG_V1 | APPOINTMENT, ORDER, PRODUCTION_DUE | brand_tier, size_range_adults, has_physical_store, custom_tailoring, style_consultation, return_policy, packaging_fashion |
| fashion_apparel | Kids Fashion | PRODUCT_CATALOG_V1 | ORDER | brand_tier, kids_age_range, school_uniforms, return_policy, packaging_fashion |
| fashion_apparel | Shoes | PRODUCT_CATALOG_V1 | ORDER | brand_tier, shoe_size_system, has_physical_store, return_policy, packaging_fashion |
| fashion_apparel | Bags | PRODUCT_CATALOG_V1 | ORDER | brand_tier, authenticity_guarantee, warranty_offered, return_policy, packaging_fashion |
| fashion_apparel | Watches | PRODUCT_CATALOG_V1 | ORDER | brand_tier, authenticity_guarantee, warranty_offered, return_policy, packaging_fashion |
| fashion_apparel | Accessories | PRODUCT_CATALOG_V1 | ORDER | brand_tier, has_physical_store, return_policy, packaging_fashion |
| beauty | Makeup | SERVICE_APPOINTMENT_V1 | APPOINTMENT, FIELD_VISIT, ORDER | booking_required, professional_artists, bridal_packages, event_makeup, home_service, products_for_sale |
| beauty | Skincare | PRODUCT_CATALOG_V1 | APPOINTMENT, FIELD_VISIT, ORDER | skin_types_served, dermatologist_backed, custom_routine_consult, home_service, products_for_sale |
| beauty | Haircare | SERVICE_APPOINTMENT_V1 | APPOINTMENT, FIELD_VISIT, ORDER | hair_types_served, home_visits, booking_required, products_for_sale |
| beauty | Fragrances | PRODUCT_CATALOG_V1 | ORDER | fragrance_families, gift_wrapping, products_for_sale |
| beauty | Cosmetics Stores | PRODUCT_CATALOG_V1 | ORDER | own_brand, multi_brand, has_physical_store, min_order |
| vehicle_rentals | Car Rental | RENTAL_ASSET_V1 | ASSET_INTERVAL | vehicle_types_rental, fleet_size, min_rental_duration, with_driver, insurance_included, fuel_policy, deposit_policy_text, corporate_billing |
| vehicle_rentals | Self Drive | RENTAL_ASSET_V1 | ASSET_INTERVAL | vehicle_types_rental, fleet_size, min_rental_duration, insurance_included, fuel_policy, deposit_policy_text, age_requirement |
| vehicle_rentals | Corporate Rental | RENTAL_ASSET_V1 | ASSET_INTERVAL | vehicle_types_rental, fleet_size, billing_cycle, dedicated_account_mgr, insurance_included, fuel_policy |
| vehicle_rentals | Long-Term Rental | RENTAL_ASSET_V1 | ASSET_INTERVAL | vehicle_types_rental, fleet_size, min_rental_duration, insurance_included, fuel_policy, deposit_policy_text |
| vehicle_rentals | Bike Rental | RENTAL_ASSET_V1 | ASSET_INTERVAL | bike_types, fleet_size, min_rental_duration, insurance_included, deposit_policy_text, with_driver |
| experiences | Concerts | EVENT_TICKET_V1 | SESSION_CAPACITY | avg_attendees, ticket_delivery_method, vip_packages, advance_booking_hrs |
| experiences | Festivals | EVENT_TICKET_V1 | SESSION_CAPACITY | avg_attendees, ticket_delivery_method, vip_packages, advance_booking_hrs |
| experiences | Conferences | EVENT_TICKET_V1 | SESSION_CAPACITY | capacity_range, av_equipment, catering_available, advance_booking_hrs |
| experiences | Private Events | REQUEST_QUOTE_V1 | REQUEST_QUOTE | event_planning_offered, venue_sourcing, min_headcount, max_headcount, advance_booking_hrs |
| experiences | Photography | SERVICE_APPOINTMENT_V1 | APPOINTMENT, FIELD_VISIT | booking_required, session_duration_text, max_group_size, equipment_provided, home_service |
| experiences | Workshops | GROUP_SESSION_V1 | SESSION_CAPACITY | booking_required, session_duration_text, max_group_size, equipment_provided |
| experiences | Classes | GROUP_SESSION_V1 | ENTITLEMENT, SESSION_CAPACITY | booking_required, session_duration_text, max_group_size, recurring_sessions |
| experiences | Sports Activities | GROUP_SESSION_V1 | ENTITLEMENT, SESSION_CAPACITY | booking_required, max_group_size, equipment_provided, recurring_sessions |
| experiences | Recreation | GROUP_SESSION_V1 | SESSION_CAPACITY | booking_required, max_group_size, equipment_provided, advance_booking_hrs |
| financial_services | Banking | REGULATED_ENQUIRY_V1 | APPOINTMENT, REQUEST_QUOTE | regulatory_license, fin_services_offered_bank, physical_locations_count, digital_platform, operating_hours_text |
| financial_services | Forex | REGULATED_ENQUIRY_V1 | APPOINTMENT, REQUEST_QUOTE | regulatory_license, currencies_traded, physical_locations_count, digital_platform, operating_hours_text |
| financial_services | Insurance | REGULATED_ENQUIRY_V1 | APPOINTMENT, REQUEST_QUOTE | regulatory_license, insurance_types, physical_locations_count, digital_platform |
| financial_services | Payments | REGULATED_ENQUIRY_V1 | APPOINTMENT, REQUEST_QUOTE | regulatory_license, payment_channels, digital_platform, physical_locations_count |
| financial_services | Remittance | REGULATED_ENQUIRY_V1 | APPOINTMENT, REQUEST_QUOTE | regulatory_license, remittance_corridors, digital_platform, physical_locations_count |
| financial_services | Sacco Services | REGULATED_ENQUIRY_V1 | APPOINTMENT, REQUEST_QUOTE | regulatory_license, sacco_services_offered, physical_locations_count, operating_hours_text |
| financial_services | Business Services | REGULATED_ENQUIRY_V1 | APPOINTMENT, REQUEST_QUOTE | regulatory_license, biz_services_offered, physical_locations_count, digital_platform |
| flowers_gifts | Flowers | PRODUCT_CATALOG_V1 | ENTITLEMENT, ORDER | fresh_or_preserved, subscription_bouquets, same_day_delivery, custom_messages, advance_order_hrs |
| flowers_gifts | Gift Hampers | PRODUCT_CATALOG_V1 | ORDER, PRODUCTION_DUE | custom_curation, corporate_gifting, hamper_price_ranges, same_day_delivery, custom_messages |
| flowers_gifts | Cakes | MADE_TO_ORDER_V1 | PRODUCTION_DUE | custom_cake_design, dietary_options_cake, min_advance_order_hrs, same_day_delivery |
| flowers_gifts | Chocolates | PRODUCT_CATALOG_V1 | ORDER | gift_wrapping, custom_messages, same_day_delivery, min_order |
| flowers_gifts | Personalized Gifts | MADE_TO_ORDER_V1 | PRODUCTION_DUE | custom_messages, advance_order_hrs, corporate_gifting |
| flowers_gifts | Occasion Gifts | PRODUCT_CATALOG_V1 | ORDER | occasions_spec, same_day_delivery, custom_messages, gift_wrapping |
| restaurants_food | Restaurant | PRODUCT_CATALOG_V1 | ORDER, SPACE_RESERVATION | cuisine_types, table_service, avg_prep_time, has_physical_seating, reservation_system, min_order |
| restaurants_food | Fast Food | PRODUCT_CATALOG_V1 | ORDER | avg_prep_time, drive_through, family_meals, min_order |
| restaurants_food | Café | PRODUCT_CATALOG_V1 | ORDER | brewing_methods, wifi_available, coworking_space, seated_capacity, food_menu |
| restaurants_food | Bakery | PRODUCT_CATALOG_V1 | ORDER, PRODUCTION_DUE | bakery_specialties, custom_orders, advance_order_hrs, min_order |
| restaurants_food | Desserts | PRODUCT_CATALOG_V1 | ORDER, PRODUCTION_DUE | dessert_specialties, custom_orders, dietary_options_cake, min_order |
| restaurants_food | Juice Bar | PRODUCT_CATALOG_V1 | ORDER | cold_pressed, smoothie_bowls, vegan_menu, detox_programs |
| restaurants_food | Cloud Kitchen | PRODUCT_CATALOG_V1 | ORDER | number_of_brands, cuisine_types, pickup_available, avg_prep_time |
| restaurants_food | Catering | REQUEST_QUOTE_V1 | REQUEST_QUOTE | cuisine_types, min_headcount, max_headcount, equipment_provided, staff_included, advance_booking_days |
| groceries_essentials | Supermarket | PRODUCT_CATALOG_V1 | ORDER | min_order, express_delivery, pickup_available, operations_24hr, loyalty_program |
| groceries_essentials | Convenience Store | PRODUCT_CATALOG_V1 | ORDER | min_order, operations_24hr, express_delivery |
| groceries_essentials | Fresh Produce | PRODUCT_CATALOG_V1 | ENTITLEMENT, ORDER | organic_options, farm_direct, subscription_boxes, weekly_market |
| groceries_essentials | Butchery | PRODUCT_CATALOG_V1 | ORDER | custom_cuts, halal_certified, vacuum_sealed, advance_order_required |
| groceries_essentials | Seafood | PRODUCT_CATALOG_V1 | ORDER | live_seafood, on_site_processing, min_order |
| groceries_essentials | Organic Store | PRODUCT_CATALOG_V1 | ORDER | local_sourcing, zero_waste_packaging |
| laundry_cleaning | Laundry | PICKUP_RETURN_V1 | LINKED_WINDOWS | pickup_delivery, turnaround_time, per_kg_pricing, per_item_pricing, weight_limit |
| laundry_cleaning | Dry Cleaning | PICKUP_RETURN_V1 | LINKED_WINDOWS | pickup_delivery, turnaround_time, per_item_pricing, garment_types |
| laundry_cleaning | Ironing | PICKUP_RETURN_V1 | LINKED_WINDOWS | pickup_delivery, turnaround_time, per_item_pricing |
| laundry_cleaning | Home Cleaning | FIELD_SERVICE_V1 | ENTITLEMENT, FIELD_VISIT | one_time_bookings, recurring_sub, equipment_provided, eco_products, min_hours_session, coverage_area_text |
| laundry_cleaning | Office Cleaning | FIELD_SERVICE_V1 | ENTITLEMENT, FIELD_VISIT | one_time_bookings, recurring_sub, equipment_provided, eco_products, min_hours_session, coverage_area_text |
| marketplace | Home & Living | PRODUCT_CATALOG_V1 | ORDER | product_description, new_or_used, fragile_handling, return_policy |
| marketplace | Furniture | PRODUCT_CATALOG_V1 | FIELD_VISIT, ORDER | product_description, new_or_used, fragile_handling, installation_service |
| marketplace | Appliances | PRODUCT_CATALOG_V1 | FIELD_VISIT, ORDER | product_description, warranty_offered, installation_service, fragile_handling, return_policy |
| marketplace | Decor | PRODUCT_CATALOG_V1 | ORDER | product_description, new_or_used, fragile_handling, gift_wrapping |
| marketplace | Kitchenware | PRODUCT_CATALOG_V1 | ORDER | product_description, new_or_used, return_policy |
| marketplace | Books | PRODUCT_CATALOG_V1 | ORDER, PRODUCTION_DUE, REQUEST_QUOTE | book_genres, new_or_used, custom_orders |
| marketplace | Stationery | PRODUCT_CATALOG_V1 | ORDER | product_description, min_order, corporate_billing |
| marketplace | Office Supplies | PRODUCT_CATALOG_V1 | ORDER | product_description, min_order, corporate_billing |
| marketplace | General Retail | PRODUCT_CATALOG_V1 | ORDER | product_description, new_or_used, min_order, return_policy |
| pharmacy | Pharmacy | PRODUCT_CATALOG_V1 | ORDER | pharmacist_on_duty, operations_24hr, prescription_delivery, cold_chain_meds |
| pharmacy | Medical Supplies | PRODUCT_CATALOG_V1 | ORDER | med_supply_types, corporate_billing |
| pharmacy | Baby Products | PRODUCT_CATALOG_V1 | ENTITLEMENT, ORDER | baby_product_range, subscription_available, min_order |
| pharmacy | Supplements | PRODUCT_CATALOG_V1 | ORDER | supplement_categories, authenticity_guarantee |
| health | Clinics | SERVICE_APPOINTMENT_V1 | APPOINTMENT, FIELD_VISIT | clinic_specializations, appointment_booking, walk_in_available, home_visits, insurance_accepted |
| health | Telemedicine | REMOTE_SESSION_V1 | APPOINTMENT | tele_platforms, clinic_specializations, available_24hr |
| health | Labs | SERVICE_APPOINTMENT_V1 | APPOINTMENT, FIELD_VISIT | lab_test_types, home_sample_collection, results_turnaround_hrs |
| health | Mental Health (Therapy) | SERVICE_APPOINTMENT_V1 | APPOINTMENT | therapy_types, session_format, avg_session_duration |
| health | Coaching | SERVICE_APPOINTMENT_V1 | APPOINTMENT, SESSION_CAPACITY | coaching_areas, session_format, avg_session_duration, group_sessions |
| tech_electronics | Smartphones | PRODUCT_CATALOG_V1 | ORDER, SERVICE_JOB | phone_brands, new_or_refurbished, warranty_months, repair_services, trade_in_program |
| tech_electronics | Accessories | PRODUCT_CATALOG_V1 | ORDER | product_description, warranty_offered, min_order |
| tech_electronics | Computers | PRODUCT_CATALOG_V1 | ORDER, SERVICE_JOB | computer_brands, new_or_refurbished, warranty_months, repair_services |
| tech_electronics | Gaming | PRODUCT_CATALOG_V1 | ORDER | console_types, pre_owned_games, gaming_accessories |
| tech_electronics | Audio | PRODUCT_CATALOG_V1 | ORDER | product_description, warranty_offered, return_policy |
| tech_electronics | Telecom Services | SERVICE_JOB_V1 | ORDER, SERVICE_JOB | telecom_services_offered, telecom_networks |
| tech_electronics | Smart Devices | PRODUCT_CATALOG_V1 | FIELD_VISIT, ORDER | product_description, warranty_offered, installation_service |
| travel_tours | Safaris | TOUR_PACKAGE_V1 | TOUR | parks_covered, accommodation_included, meal_plan, min_nights, max_group_size, private_vehicle |
| travel_tours | Game Drives | TOUR_PACKAGE_V1 | TOUR | parks_covered, max_group_size, private_vehicle, advance_booking_hrs |
| travel_tours | Luxury Safaris | TOUR_PACKAGE_V1 | TOUR | parks_covered, accommodation_included, meal_plan, min_nights, max_group_size, private_vehicle |
| travel_tours | City Tours | TOUR_PACKAGE_V1 | TOUR | tour_modes, max_group_size, duration_options, guide_included, tour_languages |
| travel_tours | Cultural Tours | TOUR_PACKAGE_V1 | TOUR | tour_modes, max_group_size, duration_options, guide_included, tour_languages |
| travel_tours | Adventure Tours | TOUR_PACKAGE_V1 | TOUR | tour_modes, max_group_size, duration_options, guide_included, equipment_provided |
| travel_tours | Travel Packages | REQUEST_QUOTE_V1 | REQUEST_QUOTE | destinations_text, package_types, flight_included, visa_assistance, tour_languages |
| vehicle_services | Car Wash | SERVICE_JOB_V1 | ENTITLEMENT, FIELD_VISIT, SERVICE_JOB | wash_types, mobile_service, subscription_plans, advance_booking_hrs |
| vehicle_services | Tire Service | SERVICE_JOB_V1 | FIELD_VISIT, SERVICE_JOB | tire_brands_text, mobile_service, emergency_callout, available_24hr |
| vehicle_services | Battery Service | FIELD_SERVICE_V1 | FIELD_VISIT, SERVICE_JOB | mobile_service, emergency_callout, available_24hr, battery_brands_text |
| vehicle_services | Vehicle Assistance | FIELD_SERVICE_V1 | FIELD_VISIT | assistance_services, response_time_min, coverage_area_text, available_24hr |
| vehicle_services | Vehicle Inspection | SERVICE_APPOINTMENT_V1 | APPOINTMENT, FIELD_VISIT | inspection_types, mobile_inspection, report_provided, duration_min |
| wellness | Spa | SERVICE_APPOINTMENT_V1 | APPOINTMENT, ENTITLEMENT, FIELD_VISIT | spa_services, session_durations, home_service, couples_packages, membership_available |
| wellness | Massage | SERVICE_APPOINTMENT_V1 | APPOINTMENT, FIELD_VISIT | massage_types, session_durations, home_service, couples_packages |
| wellness | Gym | MEMBERSHIP_PLAN_V1 | APPOINTMENT, ENTITLEMENT | gym_facilities, available_24hr, personal_training_available, membership_types |
| wellness | Personal Training | SERVICE_APPOINTMENT_V1 | APPOINTMENT, FIELD_VISIT, SESSION_CAPACITY | training_specializations, session_location, avg_session_duration, group_sessions |
| concierge_services | Reservations | REQUEST_QUOTE_V1 | FIELD_VISIT, REQUEST_QUOTE | reservation_venue_types, advance_booking_hrs |
| concierge_services | Personal Assistance | REQUEST_QUOTE_V1 | ENTITLEMENT, FIELD_VISIT, REQUEST_QUOTE | response_time_hrs, corporate_clients, dedicated_account_mgr, retainer_ksh |
| concierge_services | Shopping Assistance | REQUEST_QUOTE_V1 | FIELD_VISIT, REQUEST_QUOTE | response_time_hrs, corporate_clients |
| concierge_services | Gift Sourcing | REQUEST_QUOTE_V1 | FIELD_VISIT, REQUEST_QUOTE | advance_booking_hrs, corporate_clients, gift_wrapping |
| concierge_services | Travel Planning | REQUEST_QUOTE_V1 | FIELD_VISIT, REQUEST_QUOTE | destinations_coverage, visa_assistance, travel_insurance_assist |
| concierge_services | Property Coordination | REQUEST_QUOTE_V1 | FIELD_VISIT, REQUEST_QUOTE | coverage_area_text, advance_booking_hrs, available_24hr |
| concierge_services | Moving Assistance | REQUEST_QUOTE_V1 | FIELD_VISIT, REQUEST_QUOTE | coverage_area_text, insurance_items, advance_booking_hrs, equipment_provided |
| concierge_services | Cleaning Coordination | REQUEST_QUOTE_V1 | ENTITLEMENT, FIELD_VISIT, REQUEST_QUOTE | coverage_area_text, recurring_sub, eco_products, advance_booking_hrs |
| concierge_services | VIP Assistance | REQUEST_QUOTE_V1 | ENTITLEMENT, FIELD_VISIT, REQUEST_QUOTE | vip_services_text, available_24hr, dedicated_account_mgr, retainer_model |
| logistics_shipping | Sea Freight | FREIGHT_SHIPMENT_V1 | FREIGHT | shipping_ways, price_per_container, price_per_cbm, price_per_kg, port_to_warehouse_transport, warehouse_to_client_transport, shipping_times, insurance_included |
| logistics_shipping | Air Freight | FREIGHT_SHIPMENT_V1 | FREIGHT | shipping_ways, price_per_cbm, price_per_kg, port_to_warehouse_transport, warehouse_to_client_transport, shipping_times, custom_clearance, insurance_included |
| logistics_shipping | Road Freight & Trucking | FREIGHT_SHIPMENT_V1 | FREIGHT | shipping_ways, price_per_container, price_per_cbm, price_per_kg, port_to_warehouse_transport, warehouse_to_client_transport, shipping_times, fleet_size |
| logistics_shipping | Warehousing & Storage | STORAGE_SPACE_V1 | STORAGE | price_per_sqm, price_per_sqft, warehouse_capacity_sqft, insurance_included, operating_hours_text |

SPACE_RESERVATION_V1 additionally supports conditional tables/spaces/coworking. See README.md for18 editor contracts, field inheritance, source authority, states and the single general image. No row is evidence of a working application render.
