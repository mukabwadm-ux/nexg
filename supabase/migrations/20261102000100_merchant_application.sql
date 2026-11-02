-- Short registration uses the existing merchant identity. It does not publish,
-- provision bookings, verify a payout, or replace existing domain records.
create table public.merchant_application_registry (
  revision text primary key,
  taxonomy jsonb not null,
  profile_questions jsonb not null,
  question_schemas jsonb not null,
  legacy_categories jsonb not null,
  legacy_compatibility_revision text not null,
  enabled boolean not null default true
);

-- The versioned registry seed below is generated from the existing compiled
-- booking registry. Category IDs are checked against category_config as well.
-- BEGIN GENERATED REGISTRY
-- Source packages/booking-config/src/data/registry.json; regenerate with this script.
-- Legacy aliases are metadata for explicit legacy adapters. New payloads require canonical IDs.
insert into public.merchant_application_registry
  (revision,taxonomy,profile_questions,question_schemas,legacy_categories,legacy_compatibility_revision)
values ('nexg-booking-2026-10-31.1','{"adults_only":["adult_accessories","adult_products","adult_wellness","cigarettes","cigars","vapes"],"airport_transfers":["airport_dropoff","airport_pickup","executive_transfer","meet_greet"],"alcohol_beverages":["beer","champagne","cocktail_mixers","liquor_stores","spirits","wine"],"fashion_apparel":["accessories","bags","kids_fashion","mens_fashion","shoes","watches","womens_fashion"],"beauty":["cosmetics_stores","fragrances","haircare","makeup","skincare"],"vehicle_rentals":["bike_rental","car_rental","corporate_rental","long_term_rental","self_drive"],"experiences":["classes","concerts","conferences","festivals","photography","private_events","recreation","sports_activities","workshops"],"financial_services":["banking","business_services","forex","insurance","payments","remittance","sacco_services"],"flowers_gifts":["cakes","chocolates","flowers","gift_hampers","occasion_gifts","personalized_gifts"],"restaurants_food":["bakery","cafe","catering","cloud_kitchen","desserts","fast_food","juice_bar","restaurant"],"groceries_essentials":["butchery","convenience_store","fresh_produce","organic_store","seafood","supermarket"],"laundry_cleaning":["dry_cleaning","home_cleaning","ironing","laundry","office_cleaning"],"marketplace":["appliances","books","decor","furniture","general_retail","home_living","kitchenware","office_supplies","stationery"],"pharmacy":["baby_products","medical_supplies","pharmacy_retail","supplements"],"health":["clinics","coaching","labs","mental_health","telemedicine"],"tech_electronics":["audio","computers","gaming","smart_devices","smartphones","tech_accessories","telecom_services"],"travel_tours":["adventure_tours","city_tours","cultural_tours","game_drives","luxury_safaris","safaris","travel_packages"],"vehicle_services":["battery_service","car_wash","tire_service","vehicle_assistance","vehicle_inspection"],"wellness":["gym","massage","personal_training","spa"],"concierge_services":["cleaning_coordination","gift_sourcing","moving_assistance","personal_assistance","property_coordination","reservations","shopping_assistance","travel_planning","vip_assistance"],"logistics_shipping":["air_freight","road_freight","sea_freight","warehousing"]}'::jsonb,'{"adult_products":["age_gate_method","min_order","packaging_style","signature_required"],"adult_wellness":["age_gate_method","booking_required","home_service","packaging_style"],"cigarettes":["age_gate_method","brands_stocked_text","license_number","min_order"],"cigars":["age_gate_method","brands_stocked_text","gift_packaging","license_number"],"vapes":["age_gate_method","license_number","min_order","vape_device_types"],"adult_accessories":["age_gate_method","packaging_style","signature_required"],"airport_pickup":["advance_booking_hrs","available_24hr","chauffeur_uniform","corporate_billing","fleet_size","flight_tracking","vehicle_types_transfer"],"airport_dropoff":["advance_booking_hrs","available_24hr","chauffeur_uniform","corporate_billing","fleet_size","vehicle_types_transfer"],"meet_greet":["chauffeur_uniform","corporate_billing","fleet_size","meet_greet_signage","vehicle_types_transfer","waiting_time_min"],"executive_transfer":["advance_booking_hrs","available_24hr","chauffeur_uniform","corporate_billing","fleet_size","flight_tracking","vehicle_types_transfer"],"wine":["cold_delivery","gift_wrapping","liquor_license","min_order","wine_origins"],"spirits":["brands_stocked_text","gift_wrapping","liquor_license","min_order"],"beer":["brands_stocked_text","cold_delivery","liquor_license","min_order","returnable_bottles"],"champagne":["cold_delivery","gift_wrapping","liquor_license","occasions_spec"],"cocktail_mixers":["gift_packaging","liquor_license","min_order"],"liquor_stores":["cold_delivery","corporate_billing","liquor_license","min_order"],"mens_fashion":["brand_tier","custom_tailoring","has_physical_store","packaging_fashion","return_policy","size_range_adults","style_consultation"],"womens_fashion":["brand_tier","custom_tailoring","has_physical_store","packaging_fashion","return_policy","size_range_adults","style_consultation"],"kids_fashion":["brand_tier","kids_age_range","packaging_fashion","return_policy","school_uniforms"],"shoes":["brand_tier","has_physical_store","packaging_fashion","return_policy","shoe_size_system"],"bags":["authenticity_guarantee","brand_tier","packaging_fashion","return_policy","warranty_offered"],"watches":["authenticity_guarantee","brand_tier","packaging_fashion","return_policy","warranty_offered"],"accessories":["brand_tier","has_physical_store","packaging_fashion","return_policy"],"makeup":["booking_required","bridal_packages","event_makeup","home_service","products_for_sale","professional_artists"],"skincare":["custom_routine_consult","dermatologist_backed","home_service","products_for_sale","skin_types_served"],"haircare":["booking_required","hair_types_served","home_visits","products_for_sale"],"fragrances":["fragrance_families","gift_wrapping","products_for_sale"],"cosmetics_stores":["has_physical_store","min_order","multi_brand","own_brand"],"car_rental":["corporate_billing","deposit_policy_text","fleet_size","fuel_policy","insurance_included","min_rental_duration","vehicle_types_rental","with_driver"],"self_drive":["age_requirement","deposit_policy_text","fleet_size","fuel_policy","insurance_included","min_rental_duration","vehicle_types_rental"],"corporate_rental":["billing_cycle","dedicated_account_mgr","fleet_size","fuel_policy","insurance_included","vehicle_types_rental"],"long_term_rental":["deposit_policy_text","fleet_size","fuel_policy","insurance_included","min_rental_duration","vehicle_types_rental"],"bike_rental":["bike_types","deposit_policy_text","fleet_size","insurance_included","min_rental_duration","with_driver"],"concerts":["advance_booking_hrs","avg_attendees","ticket_delivery_method","vip_packages"],"festivals":["advance_booking_hrs","avg_attendees","ticket_delivery_method","vip_packages"],"conferences":["advance_booking_hrs","av_equipment","capacity_range","catering_available"],"private_events":["advance_booking_hrs","event_planning_offered","max_headcount","min_headcount","venue_sourcing"],"photography":["booking_required","equipment_provided","home_service","max_group_size","session_duration_text"],"workshops":["booking_required","equipment_provided","max_group_size","session_duration_text"],"classes":["booking_required","max_group_size","recurring_sessions","session_duration_text"],"sports_activities":["booking_required","equipment_provided","max_group_size","recurring_sessions"],"recreation":["advance_booking_hrs","booking_required","equipment_provided","max_group_size"],"banking":["digital_platform","fin_services_offered_bank","operating_hours_text","physical_locations_count","regulatory_license"],"forex":["currencies_traded","digital_platform","operating_hours_text","physical_locations_count","regulatory_license"],"insurance":["digital_platform","insurance_types","physical_locations_count","regulatory_license"],"payments":["digital_platform","payment_channels","physical_locations_count","regulatory_license"],"remittance":["digital_platform","physical_locations_count","regulatory_license","remittance_corridors"],"sacco_services":["operating_hours_text","physical_locations_count","regulatory_license","sacco_services_offered"],"business_services":["biz_services_offered","digital_platform","physical_locations_count","regulatory_license"],"flowers":["advance_order_hrs","custom_messages","fresh_or_preserved","same_day_delivery","subscription_bouquets"],"gift_hampers":["corporate_gifting","custom_curation","custom_messages","hamper_price_ranges","same_day_delivery"],"cakes":["custom_cake_design","dietary_options_cake","min_advance_order_hrs","same_day_delivery"],"chocolates":["custom_messages","gift_wrapping","min_order","same_day_delivery"],"personalized_gifts":["advance_order_hrs","corporate_gifting","custom_messages"],"occasion_gifts":["custom_messages","gift_wrapping","occasions_spec","same_day_delivery"],"restaurant":["avg_prep_time","cuisine_types","has_physical_seating","min_order","reservation_system","table_service"],"fast_food":["avg_prep_time","drive_through","family_meals","min_order"],"cafe":["brewing_methods","coworking_space","food_menu","seated_capacity","wifi_available"],"bakery":["advance_order_hrs","bakery_specialties","custom_orders","min_order"],"desserts":["custom_orders","dessert_specialties","dietary_options_cake","min_order"],"juice_bar":["cold_pressed","detox_programs","smoothie_bowls","vegan_menu"],"cloud_kitchen":["avg_prep_time","cuisine_types","number_of_brands","pickup_available"],"catering":["advance_booking_days","cuisine_types","equipment_provided","max_headcount","min_headcount","staff_included"],"supermarket":["express_delivery","loyalty_program","min_order","operations_24hr","pickup_available"],"convenience_store":["express_delivery","min_order","operations_24hr"],"fresh_produce":["farm_direct","organic_options","subscription_boxes","weekly_market"],"butchery":["advance_order_required","custom_cuts","halal_certified","vacuum_sealed"],"seafood":["live_seafood","min_order","on_site_processing"],"organic_store":["local_sourcing","zero_waste_packaging"],"laundry":["per_item_pricing","per_kg_pricing","pickup_delivery","turnaround_time","weight_limit"],"dry_cleaning":["garment_types","per_item_pricing","pickup_delivery","turnaround_time"],"ironing":["per_item_pricing","pickup_delivery","turnaround_time"],"home_cleaning":["coverage_area_text","eco_products","equipment_provided","min_hours_session","one_time_bookings","recurring_sub"],"office_cleaning":["coverage_area_text","eco_products","equipment_provided","min_hours_session","one_time_bookings","recurring_sub"],"home_living":["fragile_handling","new_or_used","product_description","return_policy"],"furniture":["fragile_handling","installation_service","new_or_used","product_description"],"appliances":["fragile_handling","installation_service","product_description","return_policy","warranty_offered"],"decor":["fragile_handling","gift_wrapping","new_or_used","product_description"],"kitchenware":["new_or_used","product_description","return_policy"],"books":["book_genres","custom_orders","new_or_used"],"stationery":["corporate_billing","min_order","product_description"],"office_supplies":["corporate_billing","min_order","product_description"],"general_retail":["min_order","new_or_used","product_description","return_policy"],"pharmacy_retail":["cold_chain_meds","operations_24hr","pharmacist_on_duty","prescription_delivery"],"medical_supplies":["corporate_billing","med_supply_types"],"baby_products":["baby_product_range","min_order","subscription_available"],"supplements":["authenticity_guarantee","supplement_categories"],"clinics":["appointment_booking","clinic_specializations","home_visits","insurance_accepted","walk_in_available"],"telemedicine":["available_24hr","clinic_specializations","tele_platforms"],"labs":["home_sample_collection","lab_test_types","results_turnaround_hrs"],"mental_health":["avg_session_duration","session_format","therapy_types"],"coaching":["avg_session_duration","coaching_areas","group_sessions","session_format"],"smartphones":["new_or_refurbished","phone_brands","repair_services","trade_in_program","warranty_months"],"tech_accessories":["min_order","product_description","warranty_offered"],"computers":["computer_brands","new_or_refurbished","repair_services","warranty_months"],"gaming":["console_types","gaming_accessories","pre_owned_games"],"audio":["product_description","return_policy","warranty_offered"],"telecom_services":["telecom_networks","telecom_services_offered"],"smart_devices":["installation_service","product_description","warranty_offered"],"safaris":["accommodation_included","max_group_size","meal_plan","min_nights","parks_covered","private_vehicle"],"game_drives":["advance_booking_hrs","max_group_size","parks_covered","private_vehicle"],"luxury_safaris":["accommodation_included","max_group_size","meal_plan","min_nights","parks_covered","private_vehicle"],"city_tours":["duration_options","guide_included","max_group_size","tour_languages","tour_modes"],"cultural_tours":["duration_options","guide_included","max_group_size","tour_languages","tour_modes"],"adventure_tours":["duration_options","equipment_provided","guide_included","max_group_size","tour_modes"],"travel_packages":["destinations_text","flight_included","package_types","tour_languages","visa_assistance"],"car_wash":["advance_booking_hrs","mobile_service","subscription_plans","wash_types"],"tire_service":["available_24hr","emergency_callout","mobile_service","tire_brands_text"],"battery_service":["available_24hr","battery_brands_text","emergency_callout","mobile_service"],"vehicle_assistance":["assistance_services","available_24hr","coverage_area_text","response_time_min"],"vehicle_inspection":["duration_min","inspection_types","mobile_inspection","report_provided"],"spa":["couples_packages","home_service","membership_available","session_durations","spa_services"],"massage":["couples_packages","home_service","massage_types","session_durations"],"gym":["available_24hr","gym_facilities","membership_types","personal_training_available"],"personal_training":["avg_session_duration","group_sessions","session_location","training_specializations"],"reservations":["advance_booking_hrs","reservation_venue_types"],"personal_assistance":["corporate_clients","dedicated_account_mgr","response_time_hrs","retainer_ksh"],"shopping_assistance":["corporate_clients","response_time_hrs"],"gift_sourcing":["advance_booking_hrs","corporate_clients","gift_wrapping"],"travel_planning":["destinations_coverage","travel_insurance_assist","visa_assistance"],"property_coordination":["advance_booking_hrs","available_24hr","coverage_area_text"],"moving_assistance":["advance_booking_hrs","coverage_area_text","equipment_provided","insurance_items"],"cleaning_coordination":["advance_booking_hrs","coverage_area_text","eco_products","recurring_sub"],"vip_assistance":["available_24hr","dedicated_account_mgr","retainer_model","vip_services_text"],"sea_freight":["insurance_included","port_to_warehouse_transport","price_per_cbm","price_per_container","price_per_kg","shipping_times","shipping_ways","warehouse_to_client_transport"],"air_freight":["custom_clearance","insurance_included","port_to_warehouse_transport","price_per_cbm","price_per_kg","shipping_times","shipping_ways","warehouse_to_client_transport"],"road_freight":["fleet_size","port_to_warehouse_transport","price_per_cbm","price_per_container","price_per_kg","shipping_times","shipping_ways","warehouse_to_client_transport"],"warehousing":["insurance_included","operating_hours_text","price_per_sqft","price_per_sqm","warehouse_capacity_sqft"]}'::jsonb,'{"accommodation_included":{"type":"boolean"},"advance_booking_days":{"type":"string","enum":["same_day","1_2_days","3_7_days","8_plus_days"]},"advance_booking_hrs":{"type":"string","enum":["same_day","2_24_hours","1_3_days","4_plus_days"]},"advance_order_hrs":{"type":"number","minimum":0,"unit":"hour","finite":true},"advance_order_required":{"type":"string","enum":["no","same_day","1_day","2_plus_days"]},"age_gate_method":{"type":"string","enum":["checkout","delivery_id","both"]},"age_requirement":{"type":"string","enum":["18","21","other"]},"appointment_booking":{"type":"boolean"},"assistance_services":{"type":"array","items":{"type":"string","enum":["breakdown","jump_start","towing","lockout","fuel_delivery"]},"uniqueItems":true,"minItems":1},"authenticity_guarantee":{"type":"boolean"},"av_equipment":{"type":"array","items":{"type":"string","enum":["sound","projector","microphones","lighting","video"]},"uniqueItems":true,"minItems":1},"available_24hr":{"type":"boolean"},"avg_attendees":{"type":"string","enum":["under_50","50_200","201_500","over_500"]},"avg_prep_time":{"type":"integer","minimum":0,"unit":"minute","finite":true},"avg_session_duration":{"type":"string","enum":["under_30","30_60","1_2_hours","over_2_hours"]},"baby_product_range":{"type":"array","items":{"type":"string","enum":["feeding","diapers","skincare","equipment","other"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"bakery_specialties":{"type":"array","items":{"type":"string","enum":["bread","pastry","cakes","biscuits","other"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"battery_brands_text":{"type":"string","minLength":1,"maxLength":1000,"trim":true},"bike_types":{"type":"array","items":{"type":"string","enum":["motorcycle","scooter","bicycle","electric"]},"uniqueItems":true,"minItems":1},"billing_cycle":{"type":"string","enum":["per_day","per_week","per_month","per_booking"]},"biz_services_offered":{"type":"array","items":{"type":"string","enum":["registration","tax","accounting","legal","consulting"]},"uniqueItems":true,"minItems":1},"book_genres":{"type":"array","items":{"type":"string","enum":["fiction","nonfiction","children","business","academic","other"]},"uniqueItems":true,"minItems":1},"booking_required":{"type":"boolean"},"brand_tier":{"type":"string","enum":["local","mainstream","premium","mixed"]},"brands_stocked_text":{"type":"string","minLength":1,"maxLength":1000,"trim":true},"brewing_methods":{"type":"array","items":{"type":"string","enum":["espresso","filter","french_press","pour_over","cold_brew","other"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"bridal_packages":{"type":"boolean"},"capacity_range":{"type":"string","enum":["under_20","20_50","51_100","101_300","over_300"]},"catering_available":{"type":"boolean"},"chauffeur_uniform":{"type":"boolean"},"clinic_specializations":{"type":"array","items":{"type":"string","enum":["general","dental","paediatrics","maternal","specialist"]},"uniqueItems":true,"minItems":1},"coaching_areas":{"type":"array","items":{"type":"string","enum":["fitness","nutrition","mental_wellbeing","career","other"]},"uniqueItems":true,"minItems":1},"cold_chain_meds":{"type":"boolean"},"cold_delivery":{"type":"boolean"},"cold_pressed":{"type":"boolean"},"computer_brands":{"type":"array","items":{"type":"string","enum":["apple","dell","hp","lenovo","other"]},"uniqueItems":true,"minItems":1},"console_types":{"type":"array","items":{"type":"string","enum":["playstation","xbox","nintendo","pc"]},"uniqueItems":true,"minItems":1},"corporate_billing":{"type":"boolean"},"corporate_clients":{"type":"boolean"},"corporate_gifting":{"type":"boolean"},"couples_packages":{"type":"boolean"},"coverage_area_text":{"type":"string","minLength":1,"maxLength":1000,"trim":true},"coworking_space":{"type":"boolean"},"cuisine_types":{"type":"array","items":{"type":"string","enum":["kenyan","swahili","indian","chinese","italian","continental","other"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"currencies_traded":{"type":"array","items":{"type":"string","enum":["kes_usd","kes_eur","kes_gbp","east_african","other"]},"uniqueItems":true,"minItems":1},"custom_cake_design":{"type":"boolean"},"custom_clearance":{"type":"boolean"},"custom_curation":{"type":"boolean"},"custom_cuts":{"type":"boolean"},"custom_messages":{"type":"boolean"},"custom_orders":{"type":"boolean"},"custom_routine_consult":{"type":"boolean"},"custom_tailoring":{"type":"boolean"},"dedicated_account_mgr":{"type":"boolean"},"deposit_policy_text":{"type":"string","minLength":1,"maxLength":1000,"trim":true},"dermatologist_backed":{"type":"boolean"},"dessert_specialties":{"type":"array","items":{"type":"string","enum":["cakes","ice_cream","pastry","chocolate","other"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"destinations_coverage":{"type":"array","items":{"type":"string","enum":["nairobi","kenya","east_africa","international"]},"uniqueItems":true,"minItems":1},"destinations_text":{"type":"string","minLength":1,"maxLength":1000,"trim":true},"detox_programs":{"type":"boolean"},"dietary_options_cake":{"type":"array","items":{"type":"string","enum":["vegetarian","vegan","gluten_free","dairy_free","nut_free_request","other"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"digital_platform":{"type":"string","enum":["website","mobile_app","web_and_app","none"]},"drive_through":{"type":"boolean"},"duration_min":{"type":"string","enum":["under_30","30_60","1_2_hours","over_2_hours"]},"duration_options":{"type":"string","enum":["under_2_hours","half_day","full_day","multi_day"]},"eco_products":{"type":"boolean"},"emergency_callout":{"type":"boolean"},"equipment_provided":{"type":"string","enum":["all","some","none"]},"event_makeup":{"type":"boolean"},"event_planning_offered":{"type":"boolean"},"express_delivery":{"type":"boolean"},"family_meals":{"type":"boolean"},"farm_direct":{"type":"boolean"},"fin_services_offered_bank":{"type":"array","items":{"type":"string","enum":["accounts","loans","savings","payments","advisory"]},"uniqueItems":true,"minItems":1},"fleet_size":{"type":"string","enum":["1_2","3_5","6_10","11_20","over_20"]},"flight_included":{"type":"boolean"},"flight_tracking":{"type":"boolean"},"food_menu":{"type":"boolean"},"fragile_handling":{"type":"string","enum":["standard","careful","specialist"]},"fragrance_families":{"type":"array","items":{"type":"string","enum":["floral","fresh","woody","amber","aromatic","other"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"fresh_or_preserved":{"type":"string","enum":["fresh","preserved","both"]},"fuel_policy":{"type":"string","enum":["full_to_full","included","customer_pays","varies"]},"gaming_accessories":{"type":"array","items":{"type":"string","enum":["controllers","headsets","keyboards","storage"]},"uniqueItems":true,"minItems":1},"garment_types":{"type":"array","items":{"type":"string","enum":["everyday","formal","delicate","bedding","curtains","other"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"gift_packaging":{"type":"boolean"},"gift_wrapping":{"type":"boolean"},"group_sessions":{"type":"boolean"},"guide_included":{"type":"boolean"},"gym_facilities":{"type":"array","items":{"type":"string","enum":["weights","cardio","classes","showers","pool"]},"uniqueItems":true,"minItems":1},"hair_types_served":{"type":"array","items":{"type":"string","enum":["straight","wavy","curly","coily","protective_styles","other"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"halal_certified":{"type":"boolean"},"hamper_price_ranges":{"type":"array","items":{"type":"object","required":["minimum_minor","currency"],"properties":{"minimum_minor":{"type":"integer","minimum":0},"maximum_minor":{"type":["integer","null"],"minimum":0},"currency":{"type":"string","pattern":"^[A-Z]{3}$"}}},"minItems":1},"has_physical_seating":{"type":"boolean"},"has_physical_store":{"type":"boolean"},"home_sample_collection":{"type":"boolean"},"home_service":{"type":"boolean"},"home_visits":{"type":"boolean"},"inspection_types":{"type":"array","items":{"type":"string","enum":["pre_purchase","roadworthy","insurance","diagnostic","routine"]},"uniqueItems":true,"minItems":1},"installation_service":{"type":"boolean"},"insurance_accepted":{"type":"boolean"},"insurance_included":{"type":"boolean"},"insurance_items":{"type":"array","items":{"type":"string","enum":["household","electronics","vehicles","business","other"]},"uniqueItems":true,"minItems":1},"insurance_types":{"type":"array","items":{"type":"string","enum":["health","motor","life","property","business","travel"]},"uniqueItems":true,"minItems":1},"kids_age_range":{"type":"string","enum":["0_2","3_5","6_12","13_17"]},"lab_test_types":{"type":"array","items":{"type":"string","enum":["blood","imaging","wellness","diagnostic"]},"uniqueItems":true,"minItems":1},"license_number":{"type":"string","minLength":1,"maxLength":1000,"trim":true},"liquor_license":{"type":"boolean"},"live_seafood":{"type":"boolean"},"local_sourcing":{"type":"boolean"},"loyalty_program":{"type":"boolean"},"massage_types":{"type":"array","items":{"type":"string","enum":["swedish","deep_tissue","sports","aromatherapy","other"]},"uniqueItems":true,"minItems":1},"max_group_size":{"type":"string","enum":["1_2","3_5","6_10","11_20","over_20"]},"max_headcount":{"type":"string","enum":["under_10","10_25","26_50","51_100","over_100"]},"meal_plan":{"type":"string","enum":["none","breakfast","half_board","full_board"]},"med_supply_types":{"type":"array","items":{"type":"string","enum":["first_aid","diagnostic","mobility","consumables","other"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"meet_greet_signage":{"type":"boolean"},"membership_available":{"type":"boolean"},"membership_types":{"type":"array","items":{"type":"string","enum":["monthly","quarterly","annual","class_pack"]},"uniqueItems":true,"minItems":1},"min_advance_order_hrs":{"type":"number","minimum":0,"unit":"hour","finite":true},"min_headcount":{"type":"string","enum":["1_5","6_10","11_20","over_20"]},"min_hours_session":{"type":"string","enum":["1","2","3_4","5_plus"]},"min_nights":{"type":"string","enum":["1","2_3","4_6","7_plus"]},"min_order":{"type":"string","enum":["none","500","1000","2000","5000"]},"min_rental_duration":{"type":"string","enum":["hourly","daily","weekly","monthly"]},"mobile_inspection":{"type":"boolean"},"mobile_service":{"type":"boolean"},"multi_brand":{"type":"boolean"},"new_or_refurbished":{"type":"string","enum":["new","refurbished","both"]},"new_or_used":{"type":"string","enum":["new","used","both"]},"number_of_brands":{"type":"integer","minimum":1,"unit":"brand","finite":true},"occasions_spec":{"type":"array","items":{"type":"string","enum":["birthday","anniversary","sympathy","corporate","wedding","other"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"on_site_processing":{"type":"boolean"},"one_time_bookings":{"type":"boolean"},"operating_hours_text":{"type":"string","minLength":1,"maxLength":1000,"trim":true},"operations_24hr":{"type":"boolean"},"organic_options":{"type":"boolean"},"own_brand":{"type":"boolean"},"package_types":{"type":"array","items":{"type":"string","enum":["day_trip","weekend","multi_day","custom"]},"uniqueItems":true,"minItems":1},"packaging_fashion":{"type":"string","enum":["standard","gift","branded","eco"]},"packaging_style":{"type":"string","enum":["discreet","branded","both"]},"parks_covered":{"type":"array","items":{"type":"string","enum":["maasai_mara","amboseli","tsavo","lake_nakuru","other_kenya"]},"uniqueItems":true,"minItems":1},"payment_channels":{"type":"array","items":{"type":"string","enum":["mpesa","bank_transfer","cards","online"]},"uniqueItems":true,"minItems":1},"per_item_pricing":{"type":"boolean"},"per_kg_pricing":{"type":"boolean"},"personal_training_available":{"type":"boolean"},"pharmacist_on_duty":{"type":"boolean"},"phone_brands":{"type":"array","items":{"type":"string","enum":["samsung","apple","tecno_infinix","xiaomi","multiple"]},"uniqueItems":true,"minItems":1},"physical_locations_count":{"type":"string","enum":["1","2_5","6_10","over_10"]},"pickup_available":{"type":"boolean"},"pickup_delivery":{"type":"boolean"},"port_to_warehouse_transport":{"type":"boolean"},"pre_owned_games":{"type":"boolean"},"prescription_delivery":{"type":"boolean"},"price_per_cbm":{"type":"object","required":["amount_minor","currency"],"properties":{"amount_minor":{"type":"integer","minimum":0},"currency":{"type":"string","pattern":"^[A-Z]{3}$"}},"additionalProperties":false},"price_per_container":{"type":"object","required":["amount_minor","currency"],"properties":{"amount_minor":{"type":"integer","minimum":0},"currency":{"type":"string","pattern":"^[A-Z]{3}$"}},"additionalProperties":false},"price_per_kg":{"type":"object","required":["amount_minor","currency"],"properties":{"amount_minor":{"type":"integer","minimum":0},"currency":{"type":"string","pattern":"^[A-Z]{3}$"}},"additionalProperties":false},"price_per_sqft":{"type":"object","required":["amount_minor","currency"],"properties":{"amount_minor":{"type":"integer","minimum":0},"currency":{"type":"string","pattern":"^[A-Z]{3}$"}},"additionalProperties":false},"price_per_sqm":{"type":"object","required":["amount_minor","currency"],"properties":{"amount_minor":{"type":"integer","minimum":0},"currency":{"type":"string","pattern":"^[A-Z]{3}$"}},"additionalProperties":false},"private_vehicle":{"type":"boolean"},"product_description":{"type":"string","minLength":1,"maxLength":4000,"trim":true},"products_for_sale":{"type":"boolean"},"professional_artists":{"type":"boolean"},"recurring_sessions":{"type":"boolean"},"recurring_sub":{"type":"boolean"},"regulatory_license":{"type":"string","minLength":1,"maxLength":1000,"trim":true},"remittance_corridors":{"type":"array","items":{"type":"string","enum":["kenya_east_africa","kenya_europe","kenya_north_america","global"]},"uniqueItems":true,"minItems":1},"repair_services":{"type":"array","items":{"type":"string","enum":["screen","battery","software","hardware","diagnostics"]},"uniqueItems":true,"minItems":1},"report_provided":{"type":"boolean"},"reservation_system":{"type":"boolean"},"reservation_venue_types":{"type":"array","items":{"type":"string","enum":["restaurants","hotels","events","transport","other"]},"uniqueItems":true,"minItems":1},"response_time_hrs":{"type":"string","enum":["under_1_hour","1_4_hours","same_day","next_business_day"]},"response_time_min":{"type":"string","enum":["under_30","30_60","1_3_hours","over_3_hours"]},"results_turnaround_hrs":{"type":"string","enum":["under_6_hours","same_day","next_day","2_plus_days"]},"retainer_ksh":{"type":"object","required":["amount_minor","currency"],"properties":{"amount_minor":{"type":"integer","minimum":0},"currency":{"type":"string","pattern":"^[A-Z]{3}$"}},"additionalProperties":false},"retainer_model":{"type":"string","enum":["one_off","monthly","both"]},"return_policy":{"type":"string","enum":["no_returns","exchange_only","7_days","14_days","varies"]},"returnable_bottles":{"type":"boolean"},"sacco_services_offered":{"type":"array","items":{"type":"string","enum":["savings","loans","payments","insurance","member_services"]},"uniqueItems":true,"minItems":1},"same_day_delivery":{"type":"boolean"},"school_uniforms":{"type":"boolean"},"seated_capacity":{"type":"integer","minimum":1,"unit":"person","finite":true},"session_duration_text":{"type":"string","enum":["under_1_hour","1_2_hours","half_day","full_day","varies"]},"session_durations":{"type":"string","enum":["under_30","30_60","1_2_hours","over_2_hours"]},"session_format":{"type":"string","enum":["in_person","online","both"]},"session_location":{"type":"string","enum":["venue","client_location","online","flexible"]},"shipping_times":{"type":"object","required":["minimum","maximum","unit","calendar"],"properties":{"minimum":{"type":"number","minimum":0},"maximum":{"type":"number","minimum":0},"unit":{"enum":["hour","day"]},"calendar":{"enum":["elapsed","business_calendar"]}}},"shipping_ways":{"type":"array","items":{"type":"string","enum":["road","air","sea","rail","multimodal"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"shoe_size_system":{"type":"string","enum":["uk","eu","us","multiple"]},"signature_required":{"type":"boolean"},"size_range_adults":{"type":"array","items":{"type":"string","enum":["xs_s","m_l","xl_xxl","extended"]},"uniqueItems":true,"minItems":1},"skin_types_served":{"type":"array","items":{"type":"string","enum":["dry","oily","combination","sensitive","normal","other"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"smoothie_bowls":{"type":"boolean"},"spa_services":{"type":"array","items":{"type":"string","enum":["facials","body_treatments","massage","nails","other"]},"uniqueItems":true,"minItems":1},"staff_included":{"type":"boolean"},"style_consultation":{"type":"boolean"},"subscription_available":{"type":"boolean"},"subscription_bouquets":{"type":"boolean"},"subscription_boxes":{"type":"boolean"},"subscription_plans":{"type":"boolean"},"supplement_categories":{"type":"array","items":{"type":"string","enum":["vitamins","minerals","sports_nutrition","herbal","other"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"table_service":{"type":"boolean"},"tele_platforms":{"type":"array","items":{"type":"string","enum":["phone","website","mobile_app","messaging"]},"uniqueItems":true,"minItems":1},"telecom_networks":{"type":"array","items":{"type":"string","enum":["safaricom","airtel","telkom","multiple"]},"uniqueItems":true,"minItems":1},"telecom_services_offered":{"type":"array","items":{"type":"string","enum":["airtime","data","devices","accessories","sim_services"]},"uniqueItems":true,"minItems":1},"therapy_types":{"type":"array","items":{"type":"string","enum":["individual","couples","family","group"]},"uniqueItems":true,"minItems":1},"ticket_delivery_method":{"type":"string","enum":["mobile","email","pickup","multiple"]},"tire_brands_text":{"type":"string","minLength":1,"maxLength":1000,"trim":true},"tour_languages":{"type":"array","items":{"type":"string","enum":["english","swahili","french","other"]},"uniqueItems":true,"minItems":1},"tour_modes":{"type":"array","items":{"type":"string","enum":["walking","vehicle","cycling","boat","flight"]},"uniqueItems":true,"minItems":1},"trade_in_program":{"type":"boolean"},"training_specializations":{"type":"array","items":{"type":"string","enum":["strength","cardio","weight_loss","rehabilitation","other"]},"uniqueItems":true,"minItems":1},"travel_insurance_assist":{"type":"boolean"},"turnaround_time":{"type":"object","required":["minimum","maximum","unit","calendar"],"properties":{"minimum":{"type":"number","minimum":0},"maximum":{"type":"number","minimum":0},"unit":{"enum":["hour","day"]},"calendar":{"enum":["elapsed","business_calendar"]}}},"vacuum_sealed":{"type":"boolean"},"vape_device_types":{"type":"array","items":{"type":"string","enum":["disposable","refillable","pod","mods"]},"uniqueItems":true,"minItems":1},"vegan_menu":{"type":"boolean"},"vehicle_types_rental":{"type":"array","items":{"type":"string","enum":["car","motorbike","van","suv","tuktuk"]},"uniqueItems":true,"minItems":1},"vehicle_types_transfer":{"type":"array","items":{"type":"string","enum":["sedan","suv","van","minibus","executive"]},"uniqueItems":true,"minItems":1},"venue_sourcing":{"type":"boolean"},"vip_packages":{"type":"boolean"},"vip_services_text":{"type":"string","minLength":1,"maxLength":1000,"trim":true},"visa_assistance":{"type":"boolean"},"waiting_time_min":{"type":"string","enum":["15","30","60","over_60"]},"walk_in_available":{"type":"boolean"},"warehouse_capacity_sqft":{"type":"number","minimum":0,"unit":"ft2","finite":true},"warehouse_to_client_transport":{"type":"boolean"},"warranty_months":{"type":"string","enum":["none","3","6","12","over_12"]},"warranty_offered":{"type":"boolean"},"wash_types":{"type":"array","items":{"type":"string","enum":["exterior","interior","full_detail","engine","motorcycle"]},"uniqueItems":true,"minItems":1},"weekly_market":{"type":"boolean"},"weight_limit":{"type":"number","minimum":0,"unit":"kg","finite":true},"wifi_available":{"type":"boolean"},"wine_origins":{"type":"array","items":{"type":"string","enum":["kenya","south_africa","europe","americas","oceania","other"]},"uniqueItems":true,"minItems":1,"otherDetailsRequiredWhenContains":"other"},"with_driver":{"type":"boolean"},"zero_waste_packaging":{"type":"boolean"},"venue_type":{"type":"string","enum":["bar","wine_spirits_shop","liquor_store"]},"sells_food":{"type":"boolean"},"id_check":{"type":"string","enum":["yes"]},"offering":{"type":"string","enum":["products","services","both"]},"returns":{"type":"string","enum":["accepted","exchange_only","none"]},"makes":{"type":"array","items":{"type":"string","enum":["bouquets","arrangements","hampers","cakes"]},"uniqueItems":true,"minItems":1},"lead_time":{"type":"string","enum":["same_day","next_day","48h"]},"custom_message":{"type":"boolean"},"occasions":{"type":"array","items":{"type":"string","enum":["birthday","anniversary","sympathy","corporate"]},"uniqueItems":true,"minItems":1},"cuisine":{"type":"string","enum":["nyama_choma","swahili","fast_food","fine_dining","cafe_bakery","indian","chinese","pizza","other"]},"serves_alcohol":{"type":"boolean"},"dietary":{"type":"array","items":{"type":"string","enum":["halal","vegetarian","vegan","gluten_free"]},"uniqueItems":true,"minItems":1},"spend_band":{"type":"string","enum":["under_500","500_1500","1500_3000","3000_plus"]},"fresh_produce":{"type":"boolean"},"alcohol_aisle":{"type":"boolean"},"substitutions":{"type":"string","enum":["allowed","ask_first","none"]},"min_basket":{"type":"string","enum":["none","1000","2000"]},"services":{"type":"array","items":{"type":"string","enum":["wash_fold","wash_iron","dry_clean","shoes","duvets_curtains","express"]},"uniqueItems":true,"minItems":1},"pricing_basis":{"type":"string","enum":["per_bag","per_item","both"]},"turnaround":{"type":"string","enum":["same_day","next_day","48h","3_plus"]},"collection":{"type":"string","enum":["rider_collects","guest_drops","either"]},"orderable":{"type":"array","items":{"type":"string","enum":["otc","prescription","first_aid_wellness","baby_personal","medical_supplies"]},"uniqueItems":true,"minItems":1},"dispenses_rx":{"type":"boolean"},"pharmacist_on_site":{"type":"string","enum":["always","some_hours","no"]},"late_night":{"type":"string","enum":["regular","midnight","24h"]},"SERVICE_LOCATION_MODE":{"type":"string","enum":["merchant_venue","customer_location","digital","mixed"]},"APPOINTMENT_DURATION_MINUTES":{"type":"integer","minimum":1,"unit":"minute","finite":true},"BOOKING_LEAD_TIME_MINUTES":{"type":"integer","minimum":0,"unit":"minute","finite":true},"ORDER_LEAD_TIME_MINUTES":{"type":"integer","minimum":0,"unit":"minute","finite":true},"SERVICE_AREA":{"type":"object","required":["coverage_type","coverage","location_id"],"properties":{"coverage_type":{"type":"string","enum":["zones","polygon","radius","route_list"]},"coverage":{"type":["array","object"]},"location_id":{"type":"string"},"radius_unit":{"type":"string","enum":["km"]}}},"RESOURCE_SELECTION_MODE":{"type":"string","enum":["specific_resource","any_qualified_resource","merchant_assigns","not_resource_constrained"]},"RESOURCE_INVENTORY":{"type":"array","items":{"type":"object","properties":{"resource_id":{"type":"string","minLength":1,"maxLength":200},"kind":{"type":"string","enum":["staff","asset","vehicle","room","space","equipment","capacity_pool"]},"location_id":{"type":"string","minLength":1,"maxLength":200},"capacity":{"type":"object","properties":{"quantity_minor":{"type":"integer","minimum":0},"scale":{"type":"integer","minimum":0,"maximum":9},"unit":{"type":"string","enum":["person","place","item","job","visit","asset","kg","g","cbm","container","sqm","sqft","pallet","unit","minute"]}},"required":["quantity_minor","scale","unit"],"additionalProperties":false},"role_refs":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":0,"maxItems":10000},"active":{"type":"boolean"},"authority_binding_id":{"type":"string","minLength":1,"maxLength":200}},"required":["resource_id","kind","location_id","capacity","active","authority_binding_id"],"additionalProperties":false},"minItems":1,"maxItems":10000},"CAPACITY_LIMIT":{"type":"object","properties":{"quantity_minor":{"type":"integer","minimum":1},"scale":{"const":0},"unit":{"const":"person"}},"required":["quantity_minor","scale","unit"],"additionalProperties":false},"MINIMUM_PARTICIPANTS":{"type":"integer","minimum":1,"unit":"person","finite":true},"SERVICE_DURATION_OPTIONS":{"type":"array","items":{"type":"integer","minimum":1,"unit":"minute","finite":true},"uniqueItems":true,"minItems":1},"MINIMUM_RENTAL_DURATION":{"type":"object","required":["value","unit"],"properties":{"value":{"type":"integer","minimum":1,"unit":"declared_unit","finite":true},"unit":{"type":"string","enum":["hour","day","week","month","night"]}}},"LOCATION_TIMEZONE":{"type":"string","const":"Africa/Nairobi","default":"Africa/Nairobi"},"WEEKLY_SCHEDULE":{"type":"object","properties":{"timezone":{"type":"string","const":"Africa/Nairobi","default":"Africa/Nairobi"},"weekly":{"type":"array","items":{"type":"object","properties":{"day":{"type":"string","enum":["mon","tue","wed","thu","fri","sat","sun"]},"intervals":{"type":"array","items":{"type":"object","properties":{"opens":{"type":"string","pattern":"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"},"closes":{"type":"string","pattern":"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"},"closes_next_day":{"type":"boolean"}},"required":["opens","closes","closes_next_day"],"additionalProperties":false},"minItems":0,"maxItems":24}},"required":["day","intervals"],"additionalProperties":false},"minItems":1,"maxItems":7},"exceptions":{"type":"array","items":{"type":"object","properties":{"date":{"type":"string","format":"date"},"end_date":{"type":"string","format":"date"},"closed":{"type":"boolean"},"intervals":{"type":"array","items":{"type":"object","properties":{"opens":{"type":"string","pattern":"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"},"closes":{"type":"string","pattern":"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"},"closes_next_day":{"type":"boolean"}},"required":["opens","closes","closes_next_day"],"additionalProperties":false},"minItems":0,"maxItems":24},"reason":{"type":"string","minLength":1,"maxLength":500}},"required":["date","closed","intervals"],"additionalProperties":false},"minItems":0,"maxItems":3660}},"required":["timezone","weekly","exceptions"],"additionalProperties":false},"PREPARATION_MINUTES":{"type":"integer","minimum":0,"unit":"minute","finite":true},"RESPONSE_TARGET_MINUTES":{"type":"integer","minimum":1,"unit":"minute","finite":true},"RESULT_TURNAROUND":{"type":"object","required":["minimum_minutes","maximum_minutes","calendar","cutoff"],"properties":{"minimum_minutes":{"type":"integer","minimum":0,"unit":"minute","finite":true},"maximum_minutes":{"type":"integer","minimum":0,"unit":"minute","finite":true},"calendar":{"type":"string","enum":["elapsed","business_calendar"]},"cutoff":{"type":["string","null"]}}},"TRANSIT_ESTIMATE":{"type":"object","required":["minimum_minutes","maximum_minutes","calendar","cutoff"],"properties":{"minimum_minutes":{"type":"integer","minimum":0,"unit":"minute","finite":true},"maximum_minutes":{"type":"integer","minimum":0,"unit":"minute","finite":true},"calendar":{"type":"string","enum":["elapsed","business_calendar"]},"cutoff":{"type":["string","null"]}}},"SERVICE_TURNAROUND":{"type":"object","required":["minimum_minutes","maximum_minutes","calendar","cutoff"],"properties":{"minimum_minutes":{"type":"integer","minimum":0,"unit":"minute","finite":true},"maximum_minutes":{"type":"integer","minimum":0,"unit":"minute","finite":true},"calendar":{"type":"string","enum":["elapsed","business_calendar"]},"cutoff":{"type":["string","null"]}}},"INCLUDED_WAIT_MINUTES":{"type":"integer","minimum":0,"unit":"minute","finite":true},"WARRANTY_TERMS":{"type":"object","required":["scope","duration","provider","exclusions"],"properties":{"scope":{"type":"string","minLength":1,"maxLength":2000,"trim":true},"duration":{"type":"string","minLength":1,"maxLength":2000,"trim":true},"provider":{"type":"string","minLength":1,"maxLength":2000,"trim":true},"exclusions":{"type":"string","minLength":1,"maxLength":2000,"trim":true}}},"EQUIPMENT_LISTS":{"type":"object","required":["provider_supplied","customer_required"],"properties":{"provider_supplied":{"type":"array","items":{"type":"string","minLength":1,"maxLength":2000,"trim":true}},"customer_required":{"type":"array","items":{"type":"string","minLength":1,"maxLength":2000,"trim":true}}}},"MINIMUM_ORDER_AMOUNT":{"type":"object","required":["amount_minor","currency"],"properties":{"amount_minor":{"type":"integer","minimum":0},"currency":{"type":"string","pattern":"^[A-Z]{3}$"}},"additionalProperties":false},"RETAINER_AMOUNT":{"type":"object","required":["amount_minor","currency"],"properties":{"amount_minor":{"type":"integer","minimum":0},"currency":{"type":"string","pattern":"^[A-Z]{3}$"}},"additionalProperties":false},"BILLING_PERIOD":{"type":"string","enum":["per_order","per_session","per_hour","per_day","per_week","per_month","per_night","per_shipment","per_container","custom_contract"]},"DEPOSIT_MODE":{"type":"string","enum":["none","refundable_security","fixed_booking","percentage_booking","full_prepayment"]},"DEPOSIT_AMOUNT":{"oneOf":[{"type":"object","required":["amount_minor","currency"],"properties":{"amount_minor":{"type":"integer","minimum":0},"currency":{"type":"string","pattern":"^[A-Z]{3}$"}},"additionalProperties":false},{"type":"object","required":["basis_points","basis"],"properties":{"basis_points":{"type":"integer","minimum":0,"maximum":10000},"basis":{"type":"string","enum":["approved_quote_total","offering_subtotal"]}}}]},"WEIGHT_LIMIT_SCOPE":{"type":"string","enum":["per_item","per_bag","per_vehicle","per_shipment"]},"OFFERING_PRICE":{"type":"object","required":["mode"],"properties":{"mode":{"type":"string","enum":["fixed","variant","measured","quote","recurring"]},"money":{"type":"object","required":["amount_minor","currency"],"properties":{"amount_minor":{"type":"integer","minimum":0},"currency":{"type":"string","pattern":"^[A-Z]{3}$"}},"additionalProperties":false},"unit":{"type":"string"},"period":{"type":"string"},"quote_required":{"type":"boolean"}}},"PRICE_CONFIRMATION_MODE":{"type":"string","enum":["fixed_before_acceptance","quote_before_start","measured_then_approve","approved_adjustment_limit"]},"BOOKING_CONFIRMATION_MODE":{"type":"string","enum":["instant_authority_confirmed","merchant_accepts","external_system_confirms"]},"FULFILLMENT_MODES":{"type":"array","items":{"type":"string","enum":["NEXG_DELIVERY","MERCHANT_DELIVERY","CUSTOMER_PICKUP","CUSTOMER_DROPOFF","MERCHANT_VENUE","CUSTOMER_LOCATION","DIGITAL","PICKUP_RETURN","PASSENGER_TRANSFER","FREIGHT"]},"uniqueItems":true,"minItems":1},"COLLECTION_MODE":{"type":"array","items":{"type":"string","enum":["NEXG_COLLECTION","MERCHANT_COLLECTION","CUSTOMER_DROPOFF","PARTNER_COLLECTION"]},"uniqueItems":true,"minItems":1},"RETURN_MODE":{"type":"array","items":{"type":"string","enum":["NEXG_RETURN","MERCHANT_RETURN","CUSTOMER_COLLECTION","PARTNER_RETURN"]},"uniqueItems":true,"minItems":1},"VERIFICATION_EVIDENCE":{"type":"array","items":{"type":"object","required":["requirement_id","evidence_reference"],"properties":{"requirement_id":{"type":"string"},"evidence_reference":{"type":"string"},"expiry_date":{"type":["string","null"],"format":"date"}}}},"LOCATION_RECORDS":{"type":"array","minItems":1,"items":{"type":"object","required":["location_id","name","location_type","timezone","capabilities"],"properties":{"location_id":{"type":"string"},"name":{"type":"string","minLength":1,"maxLength":2000,"trim":true},"location_type":{"type":"string","enum":["physical","service_base","digital_operation"]},"timezone":{"type":"string","const":"Africa/Nairobi","default":"Africa/Nairobi"},"capabilities":{"type":"array","items":{"type":"string"}},"address":{"type":["object","null"]}}}},"BUSINESS_CAPABILITIES":{"type":"array","items":{"type":"string","enum":["orders","made_to_order","appointments","remote_sessions","field_service","rentals","transfers","event_sessions","group_activities","tours","request_quote","pickup_return","memberships","freight","storage","regulated_enquiries","service_jobs"]},"uniqueItems":true,"minItems":1},"EXISTING_SYSTEMS":{"type":"array","items":{"type":"object","required":["function","system_name","scope","desired_source_mode"],"properties":{"function":{"type":"string","enum":["catalog","inventory","bookings","resources","orders","fulfillment","accounting","crm","other"]},"system_name":{"type":"string","minLength":1,"maxLength":2000,"trim":true},"version":{"type":["string","null"]},"scope":{"type":"object"},"desired_source_mode":{"type":"string","enum":["NATIVE","EXTERNAL","HYBRID_BY_DATA_CLASS","MANUAL"]}}}},"SYSTEM_CONNECTION_METHODS":{"type":"array","items":{"type":"string","enum":["API","WEBHOOK","POLL","FILE","MANUAL"]},"uniqueItems":true,"minItems":1},"DATA_AUTHORITY":{"type":"array","items":{"type":"object","properties":{"data_class":{"type":"string","enum":["offerings","pricing","stock","availability","resources","reservations","work_items","fulfillment","business_identity","verification","service_areas","finance.payment","finance.refund","finance.settlement","finance.payout"]},"authority":{"type":"string","enum":["NEXG_AUTHORITATIVE","EXTERNAL_AUTHORITATIVE","SHARED_WITH_RULES","READ_ONLY_EXTERNAL"]},"owner_reference":{"type":"string","minLength":1,"maxLength":200},"scope":{"type":"object","properties":{"business_id":{"type":"string","minLength":1,"maxLength":200},"activity_id":{"type":"string","minLength":1,"maxLength":200},"offering_id":{"type":"string","minLength":1,"maxLength":200},"location_id":{"type":"string","minLength":1,"maxLength":200},"resource_id":{"type":"string","minLength":1,"maxLength":200},"session_id":{"type":"string","minLength":1,"maxLength":200},"pool_id":{"type":"string","minLength":1,"maxLength":200}},"required":["business_id"],"additionalProperties":false},"shared_rule_reference":{"anyOf":[{"type":"string","minLength":1,"maxLength":200},{"type":"null"}]}},"required":["data_class","authority","owner_reference","scope"],"additionalProperties":false},"minItems":1,"maxItems":10000},"CAPABILITY_ACTIVATION_MODE":{"type":"string","enum":["save_draft","submit_for_review","activate_when_ready"]},"booking_enabled":{"type":"boolean"},"intake_mode":{"type":"string","enum":["instant_after_requirements","merchant_approval","request_quote","walk_in_only"]},"range_policy":{"type":"object","properties":{"minimum":{"type":"object","properties":{"value":{"type":"integer","minimum":1},"unit":{"type":"string","enum":["minute","hour","day","week","month","night"]}},"required":["value","unit"],"additionalProperties":false},"maximum":{"type":"object","properties":{"value":{"type":"integer","minimum":1},"unit":{"type":"string","enum":["minute","hour","day","week","month","night"]}},"required":["value","unit"],"additionalProperties":false},"calendar_basis":{"type":"string","enum":["elapsed","local_calendar"]},"billing_policy_ref":{"type":"object","properties":{"policy_id":{"type":"string","minLength":1,"maxLength":200},"version":{"type":"integer","minimum":1}},"required":["policy_id","version"],"additionalProperties":false}},"required":["minimum","maximum","calendar_basis","billing_policy_ref"],"additionalProperties":false},"capacity":{"type":"object","properties":{"pool_id":{"type":"string","minLength":1,"maxLength":200},"capacity":{"type":"object","properties":{"quantity_minor":{"type":"integer","minimum":0},"scale":{"type":"integer","minimum":0,"maximum":9},"unit":{"type":"string","enum":["person","place","item","job","visit","asset","kg","g","cbm","container","sqm","sqft","pallet","unit","minute"]}},"required":["quantity_minor","scale","unit"],"additionalProperties":false},"authority_binding_id":{"type":"string","minLength":1,"maxLength":200},"effective_from":{"type":"string","format":"date-time"},"effective_until":{"type":"string","format":"date-time"}},"required":["pool_id","capacity","authority_binding_id"],"additionalProperties":false},"buffers":{"type":"object","properties":{"before_minutes":{"type":"integer","minimum":0},"after_minutes":{"type":"integer","minimum":0},"turnaround_minutes":{"type":"integer","minimum":0}},"required":["before_minutes","after_minutes","turnaround_minutes"],"additionalProperties":false},"booking_window":{"type":"object","properties":{"minimum_lead_minutes":{"type":"integer","minimum":0},"maximum_horizon_days":{"type":"integer","minimum":1,"maximum":3650},"same_day_cutoff":{"anyOf":[{"type":"string","pattern":"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"},{"type":"null"}]}},"required":["minimum_lead_minutes","maximum_horizon_days","same_day_cutoff"],"additionalProperties":false},"travel_policy":{"type":"object","properties":{"service_area_question_id":{"const":"Q_SERVICE_AREA"},"mode":{"type":"string","enum":["fixed_allowance","approved_route_matrix"]},"travel_before_minutes":{"type":"integer","minimum":0},"travel_after_minutes":{"type":"integer","minimum":0},"route_matrix_ref":{"type":"string","minLength":1,"maxLength":200}},"required":["service_area_question_id","mode","travel_before_minutes","travel_after_minutes"],"additionalProperties":false},"greeter_transport_included":{"type":"boolean"},"scheduled_fulfilment_enabled":{"type":"boolean"},"fulfilment_windows":{"type":"object","properties":{"method":{"type":"string","enum":["NEXG_DELIVERY","MERCHANT_DELIVERY","CUSTOMER_PICKUP","CUSTOMER_DROPOFF"]},"rules":{"type":"array","items":{"type":"object","properties":{"rule_id":{"type":"string","minLength":1,"maxLength":200},"day":{"type":"string","enum":["mon","tue","wed","thu","fri","sat","sun"]},"interval":{"type":"object","properties":{"opens":{"type":"string","pattern":"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"},"closes":{"type":"string","pattern":"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"},"closes_next_day":{"type":"boolean"}},"required":["opens","closes","closes_next_day"],"additionalProperties":false},"capacity_policy_ref":{"type":"object","properties":{"rule_id":{"type":"string","minLength":1,"maxLength":200},"version":{"type":"integer","minimum":1}},"required":["rule_id","version"],"additionalProperties":false},"cutoff_lead_minutes":{"type":"integer","minimum":0}},"required":["rule_id","day","interval","capacity_policy_ref","cutoff_lead_minutes"],"additionalProperties":false},"minItems":1,"maxItems":1000}},"required":["method","rules"],"additionalProperties":false},"recurring_schedule_enabled":{"type":"boolean"},"recurrence_rule":{"type":"object","properties":{"frequency":{"type":"string","enum":["daily","weekly","monthly"]},"interval":{"type":"integer","minimum":1,"maximum":365},"weekdays":{"type":"array","items":{"type":"string","enum":["mon","tue","wed","thu","fri","sat","sun"]},"minItems":0,"maxItems":7},"start_date":{"type":"string","format":"date"},"end_date":{"type":"string","format":"date"},"count":{"type":"integer","minimum":1,"maximum":1000},"exception_dates":{"type":"array","items":{"type":"string","format":"date"},"minItems":0,"maxItems":1000}},"required":["frequency","interval","start_date","exception_dates"],"additionalProperties":false},"membership_plan_enabled":{"type":"boolean"},"entitlement_policy":{"type":"object","properties":{"plan_id":{"type":"string","minLength":1,"maxLength":200},"version":{"type":"integer","minimum":1},"scope_offering_ids":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":1,"maxItems":10000},"validity":{"oneOf":[{"type":"object","properties":{"mode":{"const":"absolute_dates"},"starts":{"type":"string","format":"date"},"ends":{"type":"string","format":"date"}},"required":["mode","starts","ends"],"additionalProperties":false},{"type":"object","properties":{"mode":{"const":"relative_to_activation"},"duration":{"type":"object","properties":{"value":{"type":"integer","minimum":1},"unit":{"type":"string","enum":["day","week","month"]}},"required":["value","unit"],"additionalProperties":false}},"required":["mode","duration"],"additionalProperties":false}]},"credits":{"type":"array","items":{"type":"object","properties":{"credit_id":{"type":"string","minLength":1,"maxLength":200},"quantity":{"type":"object","properties":{"quantity_minor":{"type":"integer","minimum":0},"scale":{"type":"integer","minimum":0,"maximum":9},"unit":{"type":"string","enum":["person","place","item","job","visit","asset","kg","g","cbm","container","sqm","sqft","pallet","unit","minute"]}},"required":["quantity_minor","scale","unit"],"additionalProperties":false},"offering_ids":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":1,"maxItems":10000}},"required":["credit_id","quantity","offering_ids"],"additionalProperties":false},"minItems":0,"maxItems":10000},"usage_policy_ref":{"type":"object","properties":{"policy_id":{"type":"string","minLength":1,"maxLength":200},"version":{"type":"integer","minimum":1}},"required":["policy_id","version"],"additionalProperties":false},"renewal":{"type":"string","enum":["none","manual","separately_authorized"]}},"required":["plan_id","version","scope_offering_ids","validity","credits","usage_policy_ref","renewal"],"additionalProperties":false},"offers_table_reservations":{"type":"boolean"},"space_policy":{"type":"object","properties":{"spaces":{"type":"array","items":{"type":"object","properties":{"resource_id":{"type":"string","minLength":1,"maxLength":200},"minimum_party_size":{"type":"integer","minimum":1},"maximum_party_size":{"type":"integer","minimum":1},"active":{"type":"boolean"}},"required":["resource_id","minimum_party_size","maximum_party_size","active"],"additionalProperties":false},"minItems":1,"maxItems":10000},"combinations":{"type":"array","items":{"type":"object","properties":{"combination_id":{"type":"string","minLength":1,"maxLength":200},"resource_ids":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":2,"maxItems":10000},"minimum_party_size":{"type":"integer","minimum":1},"maximum_party_size":{"type":"integer","minimum":1}},"required":["combination_id","resource_ids","minimum_party_size","maximum_party_size"],"additionalProperties":false},"minItems":0,"maxItems":10000},"turnover_minutes":{"type":"integer","minimum":0}},"required":["spaces","combinations","turnover_minutes"],"additionalProperties":false},"custom_order_kind":{"type":"string","enum":["made_to_specification","special_sourcing","standard_product"]},"production_policy":{"type":"object","properties":{"capacity_pool_id":{"type":"string","minLength":1,"maxLength":200},"capacity_unit":{"type":"string","enum":["person","place","item","job","visit","asset","kg","g","cbm","container","sqm","sqft","pallet","unit","minute"]},"preparation_lead_minutes":{"type":"integer","minimum":0},"cutoff_local_time":{"type":"string","pattern":"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"},"working_days":{"type":"array","items":{"type":"string","enum":["mon","tue","wed","thu","fri","sat","sun"]},"minItems":1,"maxItems":7},"approval_mode":{"type":"string","enum":["required","not_required_for_fixed_specification"]},"change_policy_ref":{"type":"object","properties":{"policy_id":{"type":"string","minLength":1,"maxLength":200},"version":{"type":"integer","minimum":1}},"required":["policy_id","version"],"additionalProperties":false}},"required":["capacity_pool_id","capacity_unit","preparation_lead_minutes","cutoff_local_time","working_days","approval_mode","change_policy_ref"],"additionalProperties":false},"pickup_return_policy":{"type":"object","properties":{"collection_rule_ref":{"type":"object","properties":{"rule_id":{"type":"string","minLength":1,"maxLength":200},"version":{"type":"integer","minimum":1}},"required":["rule_id","version"],"additionalProperties":false},"return_rule_ref":{"type":"object","properties":{"rule_id":{"type":"string","minLength":1,"maxLength":200},"version":{"type":"integer","minimum":1}},"required":["rule_id","version"],"additionalProperties":false},"minimum_processing_minutes":{"type":"integer","minimum":0},"maximum_processing_minutes":{"type":"integer","minimum":0},"processing_capacity_ref":{"type":"object","properties":{"rule_id":{"type":"string","minLength":1,"maxLength":200},"version":{"type":"integer","minimum":1}},"required":["rule_id","version"],"additionalProperties":false},"calendar_basis":{"type":"string","enum":["elapsed","business_calendar"]},"collection_mode":{"type":"string","enum":["NEXG_COLLECTION","MERCHANT_COLLECTION","CUSTOMER_DROPOFF","PARTNER_COLLECTION"]},"return_mode":{"type":"string","enum":["NEXG_RETURN","MERCHANT_RETURN","CUSTOMER_COLLECTION","PARTNER_RETURN"]}},"required":["collection_rule_ref","return_rule_ref","minimum_processing_minutes","maximum_processing_minutes","processing_capacity_ref","calendar_basis","collection_mode","return_mode"],"additionalProperties":false},"supplier_policy":{"type":"object","properties":{"components":{"type":"array","items":{"type":"object","properties":{"component_id":{"type":"string","minLength":1,"maxLength":200},"description":{"type":"string","minLength":1,"maxLength":2000},"owner_reference":{"type":"string","minLength":1,"maxLength":200},"authority_binding_id":{"type":"string","minLength":1,"maxLength":200},"confirmation_required":{"type":"boolean"},"confirmation_evidence_kind":{"type":"string","enum":["provider_api","authorized_manual_reference"]}},"required":["component_id","description","owner_reference","authority_binding_id","confirmation_required","confirmation_evidence_kind"],"additionalProperties":false},"minItems":1,"maxItems":10000},"commitment_rule":{"type":"string","enum":["all_required_confirmed","explicit_partial_scope_acceptance"]}},"required":["components","commitment_rule"],"additionalProperties":false},"payment_policy":{"type":"object","properties":{"policy_id":{"type":"string","minLength":1,"maxLength":200},"version":{"type":"integer","minimum":1}},"required":["policy_id","version"],"additionalProperties":false},"change_policy":{"type":"object","properties":{"policy_id":{"type":"string","minLength":1,"maxLength":200},"version":{"type":"integer","minimum":1}},"required":["policy_id","version"],"additionalProperties":false},"google_connection":{"type":"object","properties":{"mode":{"type":"string","enum":["not_connected","create_secondary_business_calendar","select_existing_business_calendar"]},"selected_business_calendar_id":{"type":"string","minLength":1,"maxLength":200},"use_busy_calendar_ids":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":0,"maxItems":50}},"required":["mode"],"additionalProperties":false}}'::jsonb,'{"restaurant":"restaurants_food","bar_liquor":"alcohol_beverages","laundry":"laundry_cleaning","supermarket":"groceries_essentials","beauty_fashion":"beauty","florist":"flowers_gifts","airport":"airport_transfers"}'::jsonb,'merchant-category-aliases-20260101021002.v1');
-- END GENERATED REGISTRY

create table public.merchant_application (
  merchant_id uuid primary key references public.merchant(id) on delete restrict,
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null,
  review_state text not null default 'draft'
    check (review_state in ('draft','pending','changes_requested','approved','rejected')),
  submitted_revision bigint,
  submitted_at timestamptz,
  approved_revision bigint,
  review_reason text,
  reviewed_by uuid references public.staff_user(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((submitted_revision is null) = (submitted_at is null)),
  check (submitted_revision is null or submitted_revision <= revision),
  check (approved_revision is null or approved_revision <= revision)
);

create table public.merchant_application_submission (
  merchant_id uuid not null references public.merchant_application(merchant_id),
  revision bigint not null,
  payload jsonb not null,
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now(),
  primary key (merchant_id, revision)
);

create table public.merchant_application_operation (
  actor_id uuid not null references auth.users(id),
  operation_id uuid not null,
  command text not null,
  request_hash text not null,
  merchant_id uuid not null references public.merchant_application(merchant_id),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, operation_id)
);
create index merchant_application_operation_merchant_idx
  on public.merchant_application_operation (merchant_id, created_at desc);
create index merchant_application_operation_start_actor_idx
  on public.merchant_application_operation(actor_id,created_at desc) where command='start';

create table public.merchant_application_session_activity (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_activity_at timestamptz not null
);

create table public.merchant_application_payout (
  merchant_id uuid primary key references public.merchant_application(merchant_id),
  version bigint not null default 1 check (version > 0),
  rail text not null check (rail in ('mpesa_till','mpesa_paybill','bank')),
  account jsonb not null,
  declared_by uuid not null references auth.users(id),
  declared_at timestamptz not null default now()
);

create table public.merchant_application_command_budget (
  actor_id uuid primary key references auth.users(id) on delete cascade,
  remaining numeric not null check(remaining>=0 and remaining<=60),
  updated_at timestamptz not null
);

-- Default Supabase table grants are intentionally removed, including PUBLIC.
revoke all on public.merchant_application_registry, public.merchant_application,
  public.merchant_application_submission, public.merchant_application_operation,
  public.merchant_application_session_activity, public.merchant_application_payout,
  public.merchant_application_command_budget
  from public, anon, authenticated;
grant select on public.merchant_application to authenticated;
alter table public.merchant_application enable row level security;
alter table public.merchant_application_registry enable row level security;
alter table public.merchant_application_submission enable row level security;
alter table public.merchant_application_operation enable row level security;
alter table public.merchant_application_session_activity enable row level security;
alter table public.merchant_application_payout enable row level security;
alter table public.merchant_application_command_budget enable row level security;

-- `public.setting` is the platform's read-only compatibility view. Declare
-- session policy keys through its versioned owner tables, then seed an active
-- default only when an active global version does not already exist.
insert into settings.definition
  (key,"group",scope_kind,value_type,constraints,unit,label,help,sensitive,
   can_be_immediate,approval_pair,reader_modules,default_value,sort)
values
  ('merchant_session_absolute_hours','retention','global','int',
    '{"minimum":1,"maximum":24}'::jsonb,'hours','Merchant session absolute lifetime',
    'Maximum age of a merchant portal session.',false,false,'single:ops_manager',
    array['merchant']::text[],'24'::jsonb,910),
  ('merchant_session_idle_hours','retention','global','int',
    '{"minimum":1,"maximum":8}'::jsonb,'hours','Merchant session idle lifetime',
    'Maximum inactivity period for a merchant portal session.',false,false,'single:ops_manager',
    array['merchant']::text[],'8'::jsonb,911)
on conflict (key) do nothing;

insert into settings.version
  (key,scope_kind,value,status,effective_from,reason,activated_at)
select d.key,'global','24'::jsonb,'active',now(),
  'Default merchant portal session policy',now()
from settings.definition d
where d.key='merchant_session_absolute_hours'
  and not exists (select 1 from settings.version v where v.key=d.key
    and v.scope_kind='global' and v.status='active');

insert into settings.version
  (key,scope_kind,value,status,effective_from,reason,activated_at)
select d.key,'global','8'::jsonb,'active',now(),
  'Default merchant portal session policy',now()
from settings.definition d
where d.key='merchant_session_idle_hours'
  and not exists (select 1 from settings.version v where v.key=d.key
    and v.scope_kind='global' and v.status='active');

create function authz.merchant_application_staff(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.merchant m
    join public.staff_user su on su.user_id = (select auth.uid()) and su.status = 'active'
    join public.role_grant rg on rg.staff_user_id = su.id
    join public.role r on r.id = rg.role_id
    where m.id = p_merchant_id and r.key in ('merchant_ops','super_admin')
      and rg.revoked_at is null and (rg.expires_at is null or rg.expires_at > now())
      -- Existing has_role(NULL) accepts city grants. Unassigned applications
      -- deliberately require a global grant instead.
      and (rg.city_id is null or (m.city_id is not null and rg.city_id = m.city_id))
  );
$$;

create function authz.merchant_application_owner(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.merchant_user mu
    where mu.merchant_id = p_merchant_id and mu.user_id = (select auth.uid()) and mu.role = 'owner');
$$;

-- A JWT alone is not proof that a session still exists. Every new-flow
-- request checks the existing Auth session row, the user and finite deadlines.
create function authz.merchant_application_session()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_sid uuid; v_session jsonb;
  v_absolute numeric; v_idle numeric; v_created timestamptz;
  v_last timestamptz; v_absolute_end timestamptz; v_idle_end timestamptz;
begin
  if v_uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    or not exists (select 1 from auth.users u where u.id=v_uid and not coalesce(u.is_anonymous,false)) then
    return jsonb_build_object('valid',false,'reason','session_invalid');
  end if;
  begin v_sid := (auth.jwt()->>'session_id')::uuid;
  exception when invalid_text_representation then return jsonb_build_object('valid',false,'reason','session_invalid'); end;
  select to_jsonb(s) into v_session from auth.sessions s where s.id=v_sid and s.user_id=v_uid;
  if v_session is null then return jsonb_build_object('valid',false,'reason','session_invalid'); end if;
  select (value #>> '{}')::numeric into v_absolute from public.setting
    where key='merchant_session_absolute_hours' and scope='global' and effective_from<=now();
  select (value #>> '{}')::numeric into v_idle from public.setting
    where key='merchant_session_idle_hours' and scope='global' and effective_from<=now();
  if v_absolute is null or v_idle is null or v_absolute<=0 or v_idle<=0
    or v_absolute>24 or v_idle>8 then
    return jsonb_build_object('valid',false,'reason','session_policy_invalid');
  end if;
  v_created := (v_session->>'created_at')::timestamptz;
  select last_activity_at into v_last from public.merchant_application_session_activity
    where session_id=v_sid and user_id=v_uid;
  v_last := coalesce(v_last,v_created);
  v_absolute_end := v_created + make_interval(secs => (v_absolute*3600)::double precision);
  if nullif(v_session->>'not_after','') is not null then
    v_absolute_end := least(v_absolute_end,(v_session->>'not_after')::timestamptz);
  end if;
  v_idle_end := v_last + make_interval(secs => (v_idle*3600)::double precision);
  return jsonb_build_object('valid',now()<least(v_absolute_end,v_idle_end),
    'reason',case when now()>=least(v_absolute_end,v_idle_end) then 'session_expired' end,
    'absolute_expires_at',v_absolute_end,'idle_expires_at',v_idle_end,
    'expires_at',least(v_absolute_end,v_idle_end));
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('valid',false,'reason','session_policy_invalid');
end;
$$;

-- Private declared payout values remain outside the application JSON and audit.
create function public.rpc_merchant_application_payout_read(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p public.merchant_application_payout;
begin
  perform authz.require_merchant_application_session();
  if not authz.merchant_application_owner(p_merchant_id) then
    raise exception 'Only the owner may read this payout declaration.' using errcode='42501'; end if;
  if not exists(select 1 from public.merchant_application where merchant_id=p_merchant_id) then
    raise exception 'Application not found.' using errcode='P0002'; end if;
  select * into p from public.merchant_application_payout where merchant_id=p_merchant_id;
  return jsonb_build_object('merchant_id',p_merchant_id,'version',coalesce(p.version,0),
    'payout',case when p.merchant_id is null then null else p.account||jsonb_build_object('rail',p.rail) end,
    'verification','declared');
end;
$$;

create function public.rpc_merchant_application_payout_save(
  p_merchant_id uuid,p_expected_version bigint,p_operation_id uuid,p_payout jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rail text; v_keys text[]; v_key text; v_payout jsonb:=p_payout;
  v_version bigint; v_request jsonb; v_replay jsonb; v_result jsonb;
begin
  perform authz.require_merchant_application_session();
  if not authz.merchant_application_owner(p_merchant_id)
    or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean,false) then
    raise exception 'Application setup access is required.' using errcode='42501'; end if;
  if jsonb_typeof(p_payout) is distinct from 'object' or octet_length(p_payout::text)>4096 then
    raise exception 'Invalid payout declaration.' using errcode='22023'; end if;
  v_rail:=p_payout->>'rail';
  v_keys:=case v_rail when 'mpesa_till' then array['rail','tillNumber']
    when 'mpesa_paybill' then array['rail','paybillNumber','accountReference']
    when 'bank' then array['rail','bankName','accountName','accountNumber'] end;
  if v_keys is null or not (p_payout ?& v_keys)
    or exists(select 1 from jsonb_object_keys(p_payout) k where k<>all(v_keys)) then
    raise exception 'Invalid payout fields.' using errcode='22023'; end if;
  foreach v_key in array v_keys loop
    if jsonb_typeof(p_payout->v_key) is distinct from 'string'
      or length(trim(p_payout->>v_key)) not between 1 and
        (case v_key when 'accountName' then 200 when 'rail' then 20
          when 'tillNumber' then 20 when 'paybillNumber' then 20 else 100 end) then
      raise exception 'Complete every payout field.' using errcode='22023'; end if;
    v_payout:=jsonb_set(v_payout,array[v_key],to_jsonb(trim(p_payout->>v_key)));
  end loop;
  if (v_rail='mpesa_till' and v_payout->>'tillNumber' !~ '^[0-9]{1,20}$')
    or (v_rail='mpesa_paybill' and v_payout->>'paybillNumber' !~ '^[0-9]{1,20}$') then
    raise exception 'Invalid payout account number.' using errcode='22023'; end if;
  v_request:=jsonb_build_object('merchant_id',p_merchant_id,'expected_version',p_expected_version,'payout',v_payout);
  v_replay:=public.fn_merchant_application_operation_begin(p_operation_id,'payout_save',v_request);
  if v_replay is not null then return v_replay; end if;
  perform authz.spend_merchant_application_command('payout_save');
  -- The application row also serializes the first declaration, before a payout row exists.
  perform 1 from public.merchant_application where merchant_id=p_merchant_id for update;
  if not found then raise exception 'Application not found.' using errcode='P0002'; end if;
  select version into v_version from public.merchant_application_payout where merchant_id=p_merchant_id;
  v_version:=coalesce(v_version,0);
  if p_expected_version is distinct from v_version then
    raise exception 'Payout declaration version changed.' using errcode='40001'; end if;
  insert into public.merchant_application_payout(merchant_id,version,rail,account,declared_by)
    values(p_merchant_id,v_version+1,v_rail,v_payout-'rail',(select auth.uid()))
    on conflict(merchant_id) do update set version=excluded.version,rail=excluded.rail,
      account=excluded.account,declared_by=excluded.declared_by,declared_at=now();
  -- Do not copy private declarations into merchant-wide reads. Existing finance
  -- verification remains the sole authority for settlement_account.
  perform audit.log(p_actor_type=>'merchant_user'::public.actor_type,p_module=>'merchant',
    p_action=>'merchant.payout_declared',p_target_type=>'merchant',p_target_id=>p_merchant_id,
    p_after=>jsonb_build_object('version',v_version+1,'rail',v_rail));
  -- Journal a safe receipt. Never persist the account a second time in the operation journal.
  v_result:=jsonb_build_object('merchant_id',p_merchant_id,'version',v_version+1,
    'verification','declared','operation_id',p_operation_id);
  return public.fn_merchant_application_operation_finish(p_operation_id,'payout_save',v_request,p_merchant_id,v_result);
end;
$$;

-- A credential checker may call this without a browser JWT. It supplies only
-- business state; it never establishes a machine principal or grants a scope.
create function authz.merchant_workspace_operations_allowed(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.merchant m
    where m.id=p_merchant_id and m.status::text not in ('paused','delisted','suspended')
      and (not exists(select 1 from public.merchant_application a where a.merchant_id=m.id)
        or exists(select 1 from public.merchant_application a where a.merchant_id=m.id
          and a.review_state='approved' and a.approved_revision=a.revision and a.submitted_revision=a.revision)));
$$;

create function public.fn_merchant_application_operation_begin(p_operation_id uuid,p_command text,p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.merchant_application_operation; v_hash text;
begin
  if p_operation_id is null then raise exception 'An operation ID is required.' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended((select auth.uid())::text||p_operation_id::text,0));
  v_hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  select * into o from public.merchant_application_operation
    where actor_id=(select auth.uid()) and operation_id=p_operation_id;
  if o.operation_id is null then return null; end if;
  if not (authz.merchant_application_owner(o.merchant_id) or authz.merchant_application_staff(o.merchant_id)) then
    raise exception 'Operation access was revoked.' using errcode='42501'; end if;
  if o.command<>p_command or o.request_hash<>v_hash then
    raise exception 'Operation ID was already used for a different request.' using errcode='23505'; end if;
  return o.result;
end;
$$;

create function public.fn_merchant_application_operation_finish(p_operation_id uuid,p_command text,p_request jsonb,p_merchant_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into public.merchant_application_operation(actor_id,operation_id,command,request_hash,merchant_id,result)
  values((select auth.uid()),p_operation_id,p_command,
    encode(sha256(convert_to(p_request::text,'UTF8')),'hex'),p_merchant_id,p_result);
  return p_result;
end;
$$;

-- One actor budget spans every merchant and command. Changing merchant or
-- operation IDs never allocates another bucket. Replays return before spending.
create function authz.spend_merchant_application_command(p_command text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=(select auth.uid()); v_cost numeric; v_now timestamptz:=clock_timestamp();
  b public.merchant_application_command_budget; v_available numeric; v_oldest_start timestamptz;
begin
  if v_actor is null then raise exception 'A signed-in actor is required.' using errcode='42501'; end if;
  v_cost:=case p_command when 'start' then 20 when 'save' then 1 when 'submit' then 5
    when 'review' then 5 when 'payout_save' then 5 when 'activity' then 1 end;
  if v_cost is null then raise exception 'Unknown application command.' using errcode='22023'; end if;
  insert into public.merchant_application_command_budget(actor_id,remaining,updated_at)
    values(v_actor,60,v_now) on conflict(actor_id) do nothing;
  select * into b from public.merchant_application_command_budget where actor_id=v_actor for update;
  v_now:=clock_timestamp();
  -- Thirty tokens per minute, with sixty available for a short editing burst.
  v_available:=least(60,b.remaining+greatest(0,extract(epoch from v_now-b.updated_at))*0.5);
  if v_available<v_cost then
    raise exception 'Application command rate limit reached.' using errcode='P4290',
      hint=greatest(1,ceil((v_cost-v_available)/0.5))::integer::text;
  end if;
  -- Locking the same actor bucket serializes distinct start operation IDs.
  if p_command='start' and (select count(*) from public.merchant_application_operation
      where actor_id=v_actor and command='start' and created_at>now()-interval '24 hours')>=3 then
    select min(created_at) into v_oldest_start from public.merchant_application_operation
      where actor_id=v_actor and command='start' and created_at>now()-interval '24 hours';
    raise exception 'Daily application start limit reached.' using errcode='P4290',
      hint=greatest(1,ceil(extract(epoch from (v_oldest_start+interval '24 hours'-v_now))))::integer::text;
  end if;
  update public.merchant_application_command_budget set remaining=v_available-v_cost,updated_at=greatest(b.updated_at,v_now)
    where actor_id=v_actor;
end;
$$;

create function public.fn_merchant_application_mirror(p_merchant_id uuid,p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare b jsonb:=p_payload->'business';
begin
  update public.merchant set trading_name=b->>'name',
    contact_name=trim((b->>'firstName')||' '||(b->>'lastName')),
    contact_phone=b->>'phone',contact_email=nullif(b->>'email',''),
    category=nullif(p_payload->>'categoryId','')::public.merchant_category,
    subcategory=p_payload#>>'{subcategories,0}'
  where id=p_merchant_id;
end;
$$;

create function public.rpc_merchant_application_start(p_operation_id uuid,p_payload jsonb,p_merchant_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payload jsonb; v_request jsonb; v_replay jsonb; v_id uuid; m public.merchant; b jsonb;
begin
  perform authz.require_merchant_application_session();
  v_payload:=public.fn_merchant_application_validate(p_payload);
  if v_payload#>>'{business,phone}'='' then
    raise exception 'A contact phone is required to start a registration.' using errcode='22023'; end if;
  if p_merchant_id is not null and not authz.merchant_application_owner(p_merchant_id) then
    raise exception 'Not your business.' using errcode='42501'; end if;
  v_request:=jsonb_build_object('merchant_id',p_merchant_id,'payload',v_payload);
  v_replay:=public.fn_merchant_application_operation_begin(p_operation_id,'start',v_request);
  if v_replay is not null then return v_replay; end if;
  perform authz.spend_merchant_application_command('start');
  b:=v_payload->'business';
  if p_merchant_id is not null then
    select * into m from public.merchant where id=p_merchant_id for update;
    if m.id is null or m.status::text not in ('applied','documents_pending','under_review') or m.submitted_at is not null then
      raise exception 'Only an existing owned registration draft can use this entry.' using errcode='22023'; end if;
    if exists(select 1 from public.merchant_application where merchant_id=m.id) then
      raise exception 'Read and resume the existing application.' using errcode='23505'; end if;
    -- Opting in revokes transferable legacy draft links in the same locked
    -- transaction, before the application row establishes the new boundary.
    update public.merchant set resume_token_hash=null,resume_token_expires_at=null where id=m.id;
    v_id:=m.id;
  else
    insert into public.merchant(trading_name,contact_name,contact_phone,contact_email,status,onboarding_step)
    values(b->>'name',trim((b->>'firstName')||' '||(b->>'lastName')),b->>'phone',nullif(b->>'email',''),'applied',2)
    returning id into v_id;
    insert into public.merchant_user(merchant_id,user_id,role) values(v_id,(select auth.uid()),'owner');
  end if;
  insert into public.merchant_application(merchant_id,payload) values(v_id,v_payload);
  perform public.fn_merchant_application_mirror(v_id,v_payload);
  perform audit.log(p_actor_type=>'merchant_user'::public.actor_type,p_module=>'merchant',
    p_action=>'merchant.application_started',p_target_type=>'merchant',p_target_id=>v_id,
    p_after=>jsonb_build_object('revision',1,'registry_revision',v_payload->>'registryRevision'));
  return public.fn_merchant_application_operation_finish(p_operation_id,'start',v_request,v_id,
    public.fn_merchant_application_result(v_id,p_operation_id));
end;
$$;

create function public.rpc_merchant_application_save(p_merchant_id uuid,p_expected_revision bigint,p_operation_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.merchant_application; v_payload jsonb; v_request jsonb; v_replay jsonb;
begin
  perform authz.require_merchant_application_session();
  if not authz.merchant_application_owner(p_merchant_id)
    or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean,false) then
    raise exception 'Application setup access is required.' using errcode='42501'; end if;
  v_payload:=public.fn_merchant_application_validate(p_payload);
  v_request:=jsonb_build_object('merchant_id',p_merchant_id,'expected_revision',p_expected_revision,'payload',v_payload);
  v_replay:=public.fn_merchant_application_operation_begin(p_operation_id,'save',v_request);
  if v_replay is not null then return v_replay; end if;
  perform authz.spend_merchant_application_command('save');
  select * into a from public.merchant_application where merchant_id=p_merchant_id for update;
  if a.merchant_id is null then raise exception 'Application not found.' using errcode='P0002'; end if;
  if p_expected_revision is distinct from a.revision then raise exception 'Application revision changed.' using errcode='40001'; end if;
  if a.payload is distinct from v_payload then
    update public.merchant_application set payload=v_payload,revision=revision+1,updated_at=now(),
      review_state=case when submitted_revision is null then 'draft' else 'pending' end
    where merchant_id=p_merchant_id;
    perform public.fn_merchant_application_mirror(p_merchant_id,v_payload);
    perform audit.log(p_actor_type=>'merchant_user'::public.actor_type,p_module=>'merchant',
      p_action=>'merchant.application_saved',p_target_type=>'merchant',p_target_id=>p_merchant_id,
      p_after=>jsonb_build_object('revision',a.revision+1));
  end if;
  return public.fn_merchant_application_operation_finish(p_operation_id,'save',v_request,p_merchant_id,
    public.fn_merchant_application_result(p_merchant_id,p_operation_id));
end;
$$;

create function public.rpc_merchant_application_submit(p_merchant_id uuid,p_expected_revision bigint,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.merchant_application; v_request jsonb; v_replay jsonb;
begin
  perform authz.require_merchant_application_session();
  if not authz.merchant_application_owner(p_merchant_id)
    or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean,false) then
    raise exception 'Application setup access is required.' using errcode='42501'; end if;
  v_request:=jsonb_build_object('merchant_id',p_merchant_id,'expected_revision',p_expected_revision);
  v_replay:=public.fn_merchant_application_operation_begin(p_operation_id,'submit',v_request);
  if v_replay is not null then return v_replay; end if;
  perform authz.spend_merchant_application_command('submit');
  select * into a from public.merchant_application where merchant_id=p_merchant_id for update;
  if a.merchant_id is null then raise exception 'Application not found.' using errcode='P0002'; end if;
  if p_expected_revision is distinct from a.revision then raise exception 'Application revision changed.' using errcode='40001'; end if;
  perform public.fn_merchant_application_validate(a.payload,true);
  if a.submitted_revision is distinct from a.revision then
    insert into public.merchant_application_submission(merchant_id,revision,payload,submitted_by)
      values(p_merchant_id,a.revision,a.payload,(select auth.uid()));
    update public.merchant_application set submitted_revision=revision,submitted_at=now(),review_state='pending',
      review_reason=null,updated_at=now() where merchant_id=p_merchant_id;
    perform audit.log(p_actor_type=>'merchant_user'::public.actor_type,p_module=>'merchant',
      p_action=>'merchant.application_submitted',p_target_type=>'merchant',p_target_id=>p_merchant_id,
      p_after=>jsonb_build_object('revision',a.revision));
  end if;
  return public.fn_merchant_application_operation_finish(p_operation_id,'submit',v_request,p_merchant_id,
    public.fn_merchant_application_result(p_merchant_id,p_operation_id));
end;
$$;

create function public.rpc_merchant_application_read(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_merchant_application_session();
  if not (authz.merchant_application_owner(p_merchant_id) or authz.merchant_application_staff(p_merchant_id)) then
    raise exception 'Not your application.' using errcode='42501'; end if;
  if not exists(select 1 from public.merchant_application where merchant_id=p_merchant_id) then
    raise exception 'Application not found.' using errcode='P0002'; end if;
  return public.fn_merchant_application_result(p_merchant_id);
end;
$$;

create function public.rpc_merchant_application_review(p_merchant_id uuid,p_expected_revision bigint,p_operation_id uuid,p_decision text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.merchant_application; v_request jsonb; v_replay jsonb;
begin
  perform authz.require_merchant_application_session();
  if not authz.merchant_application_staff(p_merchant_id) then raise exception 'Merchant review permission is required.' using errcode='42501'; end if;
  if p_decision not in ('approved','changes_requested','rejected') or p_decision is null
    or length(coalesce(p_reason,''))>2000 or (p_decision<>'approved' and trim(coalesce(p_reason,''))='') then
    raise exception 'Choose a review decision and explain required changes or rejection.' using errcode='22023'; end if;
  v_request:=jsonb_build_object('merchant_id',p_merchant_id,'expected_revision',p_expected_revision,'decision',p_decision,'reason',nullif(trim(p_reason),''));
  v_replay:=public.fn_merchant_application_operation_begin(p_operation_id,'review',v_request);
  if v_replay is not null then return v_replay; end if;
  perform authz.spend_merchant_application_command('review');
  select * into a from public.merchant_application where merchant_id=p_merchant_id for update;
  if a.merchant_id is null then raise exception 'Application not found.' using errcode='P0002'; end if;
  if p_expected_revision is distinct from a.revision or a.submitted_revision is distinct from a.revision then
    raise exception 'Review the current submitted revision.' using errcode='40001'; end if;
  if a.review_state<>'pending' then raise exception 'This revision has already been reviewed.' using errcode='22023'; end if;
  update public.merchant_application set review_state=p_decision,review_reason=nullif(trim(p_reason),''),
    approved_revision=case when p_decision='approved' then revision else null end,
    reviewed_by=authz.staff_id(),reviewed_at=now(),updated_at=now() where merchant_id=p_merchant_id;
  perform audit.log(p_actor_type=>'staff'::public.actor_type,p_actor_id=>authz.staff_id(),p_module=>'merchant',
    p_action=>'merchant.application_reviewed',p_target_type=>'merchant',p_target_id=>p_merchant_id,
    p_after=>jsonb_build_object('revision',a.revision,'decision',p_decision),p_reason=>nullif(trim(p_reason),''));
  return public.fn_merchant_application_operation_finish(p_operation_id,'review',v_request,p_merchant_id,
    public.fn_merchant_application_result(p_merchant_id,p_operation_id));
end;
$$;

-- Recover a timeout-after-commit start before the merchant ID reached the UI.
-- Unknown IDs, foreign actors and revoked access all return the same null.
create function public.rpc_merchant_application_operation_read(p_operation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o public.merchant_application_operation; v_access jsonb;
begin
  perform authz.require_merchant_application_session();
  if p_operation_id is null then raise exception 'An operation ID is required.' using errcode='22023'; end if;
  select * into o from public.merchant_application_operation
    where actor_id=(select auth.uid()) and operation_id=p_operation_id;
  if o.operation_id is null then return null; end if;
  if not (authz.merchant_application_owner(o.merchant_id) or authz.merchant_application_staff(o.merchant_id)) then return null; end if;
  v_access:=authz.merchant_application_access(o.merchant_id);
  if not (coalesce((v_access->>'setup')::boolean,false) or coalesce((v_access->>'operations')::boolean,false)
    or authz.merchant_application_staff(o.merchant_id)) then return null; end if;
  return o.result;
end;
$$;

create function authz.require_merchant_application_session()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((authz.merchant_application_session()->>'valid')::boolean,false) then
    raise exception 'A current signed-in session is required.' using errcode='42501';
  end if;
end;
$$;

create function authz.merchant_application_access(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.merchant_application; m public.merchant; s jsonb; v_stale boolean;
begin
  select * into m from public.merchant where id=p_merchant_id;
  if m.id is null or not (exists(select 1 from public.merchant_user mu
      where mu.merchant_id=m.id and mu.user_id=(select auth.uid()) and mu.role in ('owner','manager'))
    or authz.merchant_application_staff(m.id)) then
    return jsonb_build_object('state','blocked','setup',false,'operations',false,'reason','membership_invalid');
  end if;
  select * into a from public.merchant_application where merchant_id=m.id;
  if a.merchant_id is null then
    return jsonb_build_object('state','legacy','setup',true,'operations',true,
      'review_state',null,'revision',null,'needs_resubmission',false);
  end if;
  s := authz.merchant_application_session();
  if not coalesce((s->>'valid')::boolean,false) then
    return (s-'valid') || jsonb_build_object('state','blocked','setup',false,'operations',false,
      'review_state',a.review_state,'revision',a.revision,'needs_resubmission',a.submitted_revision is distinct from a.revision);
  end if;
  v_stale := a.submitted_revision is not null and a.submitted_revision<>a.revision;
  return (s-'valid'-'reason') || jsonb_build_object(
    'state',case when m.status in ('paused','delisted') then 'blocked'
      when a.review_state='approved' and (a.approved_revision<>a.revision or v_stale) then 'pending'
      when a.review_state='draft' then 'pending' else a.review_state end,
    'setup',m.status not in ('paused','delisted') and a.review_state<>'rejected'
      and authz.merchant_application_owner(m.id),
    'operations',m.status::text not in ('paused','delisted','suspended') and a.review_state='approved'
      and a.approved_revision=a.revision and a.submitted_revision=a.revision,
    'review_state',a.review_state,'revision',a.revision,'needs_resubmission',v_stale);
end;
$$;

create function public.fn_merchant_application_result(p_merchant_id uuid,p_operation_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('merchant_id',a.merchant_id,'revision',a.revision,'payload',a.payload,
    'review',jsonb_build_object('state',a.review_state,'submitted_revision',a.submitted_revision,
      'submitted_at',a.submitted_at,'reason',a.review_reason,
      'needs_resubmission',a.submitted_revision is not null and a.submitted_revision<>a.revision),
    'access',authz.merchant_application_access(a.merchant_id),
    'publication',jsonb_build_object('status',m.status,'accepting_work',false))
      || case when p_operation_id is null then '{}'::jsonb else jsonb_build_object('operation_id',p_operation_id) end
  from public.merchant_application a join public.merchant m on m.id=a.merchant_id
  where a.merchant_id=p_merchant_id;
$$;

create function public.rpc_merchant_workspace_access(p_merchant_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select authz.merchant_application_access(p_merchant_id);
$$;

create function public.rpc_merchant_session_activity(p_merchant_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s jsonb;
begin
  perform authz.require_merchant_application_session();
  if not (authz.is_merchant_member(p_merchant_id) or authz.merchant_application_staff(p_merchant_id)) then
    raise exception 'Not your business.' using errcode='42501';
  end if;
  perform authz.spend_merchant_application_command('activity');
  insert into public.merchant_application_session_activity(session_id,user_id,last_activity_at)
    values ((auth.jwt()->>'session_id')::uuid,(select auth.uid()),now())
    on conflict(session_id) do update set last_activity_at=excluded.last_activity_at;
  s:=authz.merchant_application_session();
  return s-'valid'-'reason';
end;
$$;

-- Validate the structural subset used by the compiled registry. Semantic
-- authority, scheduling and provider checks remain with their domain owners.
create function public.fn_merchant_application_value_valid(v jsonb, s jsonb, depth integer default 0)
returns boolean language plpgsql immutable set search_path = '' as $$
declare t text; x jsonb; k text; expected jsonb; matches integer;
begin
  if depth>12 or octet_length(v::text)>65536 then return false; end if;
  if s ? 'const' and v is distinct from s->'const' then return false; end if;
  if s ? 'enum' and not (s->'enum' @> jsonb_build_array(v)) then return false; end if;
  foreach t in array array['oneOf','anyOf'] loop
    if s ? t then
      select count(*) into matches from jsonb_array_elements(s->t) q(value)
        where public.fn_merchant_application_value_valid(v,q.value,depth+1);
      if matches=0 or (t='oneOf' and matches<>1) then return false; end if;
    end if;
  end loop;
  t:=s->>'type';
  if jsonb_typeof(s->'type')='array' then
    if not ((s->'type') ? jsonb_typeof(v))
      and not (jsonb_typeof(v)='number' and (s->'type') ? 'integer') then return false; end if;
    t:=case when jsonb_typeof(v)='number' and not ((s->'type') ? 'number') then 'integer' else jsonb_typeof(v) end;
  end if;
  if t is not null and not (jsonb_typeof(v)=t or (t in ('integer','number') and jsonb_typeof(v)='number')) then return false; end if;
  if jsonb_typeof(v)='number' then
    if t='integer' and (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) then return false; end if;
    if s ? 'minimum' and (v#>>'{}')::numeric<(s->>'minimum')::numeric then return false; end if;
    if s ? 'maximum' and (v#>>'{}')::numeric>(s->>'maximum')::numeric then return false; end if;
  elsif jsonb_typeof(v)='string' then
    if length(v#>>'{}')>4096 or length(v#>>'{}')<coalesce((s->>'minLength')::integer,0)
      or length(v#>>'{}')>coalesce((s->>'maxLength')::integer,4096) then return false; end if;
    if s ? 'pattern' and not ((v#>>'{}')~(s->>'pattern')) then return false; end if;
  elsif jsonb_typeof(v)='array' then
    if jsonb_array_length(v)>coalesce((s->>'maxItems')::integer,128)
      or jsonb_array_length(v)<coalesce((s->>'minItems')::integer,0) then return false; end if;
    if coalesce((s->>'uniqueItems')::boolean,false) and
      (select count(*)<>count(distinct value) from jsonb_array_elements(v)) then return false; end if;
    for x in select value from jsonb_array_elements(v) loop
      if not public.fn_merchant_application_value_valid(x,coalesce(s->'items','{}'),depth+1) then return false; end if;
    end loop;
  elsif jsonb_typeof(v)='object' then
    if (select count(*) from jsonb_object_keys(v))>128 then return false; end if;
    if exists(select 1 from jsonb_array_elements_text(coalesce(s->'required','[]')) r(value) where not v ? r.value) then return false; end if;
    for k,x in select * from jsonb_each(v) loop
      if k in ('__proto__','constructor','prototype') or length(k)>100 then return false; end if;
      expected:=s->'properties'->k;
      if expected is null and (s->'additionalProperties'='false'::jsonb or s ? 'properties') then return false; end if;
      if not public.fn_merchant_application_value_valid(x,coalesce(expected,'{}'),depth+1) then return false; end if;
    end loop;
  end if;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range or invalid_regular_expression then return false;
end;
$$;

create function public.fn_merchant_application_validate(p_payload jsonb,p_submit boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.merchant_application_registry; b jsonb; c text; p jsonb; k text; x jsonb; q text; v_seen text[]:='{}';
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>65536
    or not (p_payload ?& array['registryRevision','business','categoryId','subcategories','answersBySubcategory','policies'])
    or exists(select 1 from jsonb_object_keys(p_payload) fields(key) where fields.key<>all(array['registryRevision','business','categoryId','subcategories','answersBySubcategory','policies'])) then
    raise exception 'Invalid application fields.' using errcode='22023';
  end if;
  select * into r from public.merchant_application_registry where revision=p_payload->>'registryRevision' and enabled;
  if r.revision is null then raise exception 'Unsupported registry revision.' using errcode='22023'; end if;
  b:=p_payload->'business';
  if jsonb_typeof(b) is distinct from 'object'
    or not (b ?& array['name','firstName','lastName','email','phone','branchCount','registered','sameBusinessPhone','businessPhone','marketing'])
    or exists(select 1 from jsonb_object_keys(b) fields(key) where fields.key<>all(array['name','firstName','lastName','email','phone','branchCount','registered','sameBusinessPhone','businessPhone','marketing'])) then
    raise exception 'Invalid business fields.' using errcode='22023';
  end if;
  foreach k in array array['name','firstName','lastName','email','phone','businessPhone'] loop
    if jsonb_typeof(b->k) is distinct from 'string'
      or length(trim(b->>k))>(case k when 'name' then 200 when 'firstName' then 100 when 'lastName' then 100 else 320 end) then
      raise exception 'Invalid business text.' using errcode='22023'; end if;
    b:=jsonb_set(b,array[k],to_jsonb(trim(b->>k)));
  end loop;
  if jsonb_typeof(b->'registered') not in ('boolean','null')
    or jsonb_typeof(b->'sameBusinessPhone') is distinct from 'boolean'
    or jsonb_typeof(b->'marketing') is distinct from 'boolean' then
    raise exception 'Invalid business choices.' using errcode='22023';
  end if;
  if b->'branchCount'<>'null'::jsonb and
    (jsonb_typeof(b->'branchCount')<>'number' or (b->>'branchCount')::numeric<>trunc((b->>'branchCount')::numeric)
      or (b->>'branchCount')::numeric<1 or (b->>'branchCount')::numeric>10000) then
    raise exception 'Invalid branch count.' using errcode='22023'; end if;
  if b->>'phone'='' or b->>'phone' !~ '^\+254[17][0-9]{8}$' then
    raise exception 'Enter a normalized Kenyan mobile number.' using errcode='22023'; end if;
  if b->>'businessPhone'<>'' and b->>'businessPhone' !~ '^\+254[17][0-9]{8}$' then
    raise exception 'Enter a normalized Kenyan business mobile number.' using errcode='22023'; end if;
  if b->>'email'<>'' and b->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid business email.' using errcode='22023'; end if;
  c:=nullif(p_payload->>'categoryId','');
  if jsonb_typeof(p_payload->'categoryId') not in ('string','null')
    or (jsonb_typeof(p_payload->'categoryId')='string' and c is null)
    or (c is not null and (not r.taxonomy ? c or not exists(select 1 from public.category_config where category::text=c))) then
    raise exception 'Choose a canonical business category.' using errcode='22023'; end if;
  if jsonb_typeof(p_payload->'subcategories') is distinct from 'array' or jsonb_array_length(p_payload->'subcategories')>128 then
    raise exception 'Invalid specialty selection.' using errcode='22023'; end if;
  for x in select value from jsonb_array_elements(p_payload->'subcategories') loop
    k:=x#>>'{}';
    if jsonb_typeof(x)<>'string' or k=any(v_seen) or c is null or not (r.taxonomy->c @> jsonb_build_array(k)) then
      raise exception 'Specialty does not belong to the selected category.' using errcode='22023'; end if;
    v_seen:=array_append(v_seen,k);
  end loop;
  if jsonb_typeof(p_payload->'answersBySubcategory') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_payload->'answersBySubcategory'))>128 then
    raise exception 'Invalid retained answers.' using errcode='22023'; end if;
  for k,p in select * from jsonb_each(p_payload->'answersBySubcategory') loop
    if not r.profile_questions ? k or jsonb_typeof(p)<>'object' or (select count(*) from jsonb_object_keys(p))>128 then
      raise exception 'Unknown retained specialty.' using errcode='22023'; end if;
    for q,x in select * from jsonb_each(p) loop
      if not (r.profile_questions->k @> jsonb_build_array(q)) or not r.question_schemas ? q
        or not public.fn_merchant_application_value_valid(x,r.question_schemas->q) then
        raise exception 'Invalid supplied specialty answer.' using errcode='22023'; end if;
    end loop;
  end loop;
  if jsonb_typeof(p_payload->'policies') is distinct from 'object' or p_payload->'policies'<>jsonb_build_object('terms',p_payload#>'{policies,terms}')
    or jsonb_typeof(p_payload#>'{policies,terms}') is distinct from 'boolean' then
    raise exception 'Invalid policy acknowledgement.' using errcode='22023'; end if;
  if p_submit and (b->>'name'='' or b->>'firstName'='' or b->>'lastName'='' or b->>'email'='' or b->>'phone'=''
    or b->'branchCount'='null'::jsonb or b->'registered'='null'::jsonb
    or (not (b->>'sameBusinessPhone')::boolean and coalesce(b->>'businessPhone','')='')
    or c is null or cardinality(v_seen)=0 or not (p_payload#>>'{policies,terms}')::boolean) then
    raise exception 'Complete the short registration before submitting.' using errcode='22023'; end if;
  b:=jsonb_set(b,'{email}',to_jsonb(lower(b->>'email')));
  return jsonb_set(p_payload,'{business}',b);
end;
$$;

-- Existing self-enrolment policies let an authenticated caller join any tenant
-- and directly create a merchant. Existing start/invite RPCs retain their owner.
drop policy if exists merchant_insert_authenticated on public.merchant;
drop policy if exists merchant_user_insert_self on public.merchant_user;
revoke insert on public.merchant from anon, authenticated;
revoke insert,update,delete on public.merchant_user from anon, authenticated;

-- This trigger must remain SECURITY INVOKER: current_user is the caller, not
-- the function owner. Existing authorized definer RPCs still own legacy writes.
alter function public.tg_merchant_protected_columns() security invoker;

create function public.tg_merchant_application_submission_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Submitted application snapshots are immutable.' using errcode='42501';
end;
$$;
create trigger merchant_application_submission_immutable
  before update or delete on public.merchant_application_submission
  for each row execute function public.tg_merchant_application_submission_immutable();

-- This helper permits only the mirrored capture fields. Even an old definer
-- RPC cannot activate a new-flow merchant or overwrite its captured identity.
create function authz.merchant_application_has_capture(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.merchant_application where merchant_id=p_merchant_id);
$$;
create function authz.merchant_application_row_write_allowed(p_new jsonb)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from public.merchant_application a where a.merchant_id=(p_new->>'id')::uuid)
    or exists(select 1 from public.merchant_application a
      where a.merchant_id=(p_new->>'id')::uuid and p_new->>'status'<>'live'
        and not coalesce((p_new->>'accepting_orders')::boolean,false)
        and p_new->>'trading_name'=a.payload#>>'{business,name}'
        and p_new->>'contact_name'=trim((a.payload#>>'{business,firstName}')||' '||(a.payload#>>'{business,lastName}'))
        and p_new->>'contact_phone'=a.payload#>>'{business,phone}'
        and nullif(p_new->>'contact_email','') is not distinct from nullif(a.payload#>>'{business,email}','')
        and p_new->>'category' is not distinct from nullif(a.payload->>'categoryId','')
        and p_new->>'subcategory' is not distinct from a.payload#>>'{subcategories,0}');
$$;
create function public.tg_merchant_application_write_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not authz.merchant_application_row_write_allowed(to_jsonb(new)) then
    raise exception 'Use application commands; operational activation is not available.' using errcode='42501';
  end if;
  if (new.payout_account is distinct from old.payout_account or new.payout_rail is distinct from old.payout_rail)
    and authz.merchant_application_has_capture(new.id) then
    raise exception 'Use the private payout declaration command.' using errcode='42501';
  end if;
  if (new.resume_token_hash is not null or new.resume_token_expires_at is not null)
    and authz.merchant_application_has_capture(new.id) then
    raise exception 'Resume this application through the existing signed-in account.' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger merchant_application_write_guard before update on public.merchant
  for each row execute function public.tg_merchant_application_write_guard();

-- A legacy claim may have selected a token before owned binding invalidated
-- it. Serialize membership insertion with that binding and re-read its state
-- after the row lock. The volatile helper uses a fresh SPI snapshot after any
-- wait; an old definer RPC cannot turn its stale token into a new owner.
create function authz.merchant_application_membership_write_allowed(p_merchant_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.merchant where id=p_merchant_id for update;
  if not exists(select 1 from public.merchant_application where merchant_id=p_merchant_id) then return true; end if;
  return coalesce((authz.merchant_application_session()->>'valid')::boolean,false)
    and (authz.merchant_application_owner(p_merchant_id) or authz.merchant_application_staff(p_merchant_id));
end;
$$;
create function public.tg_merchant_application_membership_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not authz.merchant_application_membership_write_allowed(new.merchant_id) then
    raise exception 'A current owner or authorized staff session must add application members.' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger merchant_application_membership_guard before insert on public.merchant_user
  for each row execute function public.tg_merchant_application_membership_guard();

create policy merchant_application_read_owned on public.merchant_application
  for select to authenticated using (
    coalesce((authz.merchant_application_access(merchant_id)->>'setup')::boolean,false)
    or (authz.merchant_application_staff(merchant_id)
      and coalesce((authz.merchant_application_session()->>'valid')::boolean,false)));

create function authz.merchant_application_record_session_valid(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from public.merchant_application where merchant_id=p_merchant_id)
    or coalesce((authz.merchant_application_session()->>'valid')::boolean,false);
$$;
create function authz.merchant_application_operational_read_allowed(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  -- Preserve the old policies for legacy records. Current approval permits
  -- operational reads; Phase 7 still owns publication and starting work.
  select not exists(select 1 from public.merchant_application where merchant_id=p_merchant_id)
    or exists(select 1 from public.merchant_application a join public.merchant m on m.id=a.merchant_id
      where a.merchant_id=p_merchant_id and a.review_state='approved' and a.approved_revision=a.revision
        and a.submitted_revision=a.revision and m.status::text not in ('paused','delisted','suspended'));
$$;
create policy merchant_application_session_gate on public.merchant as restrictive
  for all to authenticated using (authz.merchant_application_record_session_valid(id))
  with check (authz.merchant_application_record_session_valid(id));

create function authz.merchant_application_order_operations_allowed(p_order_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_order_id is null or exists(select 1 from public."order" o
    where o.id=p_order_id and authz.merchant_application_operational_read_allowed(o.merchant_id));
$$;

-- Restrictive policies compose with existing guest/rider/staff ownership rules.
-- They close direct REST reads as well as the related child-record paths.
do $$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c
    join information_schema.tables b on b.table_schema=c.table_schema and b.table_name=c.table_name
    where c.table_schema='public' and c.column_name='merchant_id' and b.table_type='BASE TABLE' loop
    execute format('create policy merchant_application_session_gate on public.%I as restrictive for all to authenticated using (authz.merchant_application_record_session_valid(merchant_id)) with check (authz.merchant_application_record_session_valid(merchant_id))',t);
  end loop;
  foreach t in array array['order','merchant_statement','merchant_message','dispute',
    'merchant_review','merchant_status_change','merchant_penalty','merchant_strike',
    'merchant_health_snapshot','payment','refund','order_rating','referral'] loop
    if exists(select 1 from information_schema.columns where table_schema='public'
      and table_name=t and column_name='merchant_id') then
      execute format('create policy merchant_application_operational_gate on public.%I as restrictive for all to authenticated using (authz.merchant_application_operational_read_allowed(merchant_id)) with check (authz.merchant_application_operational_read_allowed(merchant_id))',t);
    end if;
  end loop;
  for t in select distinct c.relname from pg_constraint fk
    join pg_class c on c.oid=fk.conrelid join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum=any(fk.conkey)
    where fk.contype='f' and fk.confrelid='public.order'::regclass
      and n.nspname='public' and a.attname='order_id' and c.relkind in ('r','p') loop
    execute format('create policy merchant_application_order_gate on public.%I as restrictive for all to authenticated using (authz.merchant_application_order_operations_allowed(order_id)) with check (authz.merchant_application_order_operations_allowed(order_id))',t);
  end loop;
end;
$$;

-- Default EXECUTE is PUBLIC. Grant only the reviewed entry points, never the
-- internal mutation/journal helpers or private payout tables.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and (p.proname like 'fn_merchant_application_%'
      or p.proname like 'rpc_merchant_application_%' or p.proname like 'tg_merchant_application_%'
      or p.proname in ('rpc_merchant_workspace_access','rpc_merchant_session_activity')))
      or (n.nspname='authz' and (p.proname like 'merchant_application_%'
        or p.proname in ('require_merchant_application_session','merchant_workspace_operations_allowed','spend_merchant_application_command'))) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('alter function %s set statement_timeout = %L',f.signature,'5s');
    execute format('alter function %s set lock_timeout = %L',f.signature,'2s');
  end loop;
end;
$$;
grant execute on function
  public.rpc_merchant_application_start(uuid,jsonb,uuid),
  public.rpc_merchant_application_save(uuid,bigint,uuid,jsonb),
  public.rpc_merchant_application_submit(uuid,bigint,uuid),
  public.rpc_merchant_application_read(uuid),
  public.rpc_merchant_application_operation_read(uuid),
  public.rpc_merchant_application_review(uuid,bigint,uuid,text,text),
  public.rpc_merchant_application_payout_read(uuid),
  public.rpc_merchant_application_payout_save(uuid,bigint,uuid,jsonb),
  public.rpc_merchant_workspace_access(uuid),public.rpc_merchant_session_activity(uuid),
  authz.merchant_application_access(uuid),authz.merchant_application_staff(uuid),
  authz.merchant_application_session(),authz.merchant_application_row_write_allowed(jsonb),
  authz.merchant_application_has_capture(uuid),
  authz.merchant_application_membership_write_allowed(uuid),
  authz.merchant_application_record_session_valid(uuid),authz.merchant_application_operational_read_allowed(uuid),
  authz.merchant_workspace_operations_allowed(uuid),authz.merchant_application_order_operations_allowed(uuid)
to authenticated;
