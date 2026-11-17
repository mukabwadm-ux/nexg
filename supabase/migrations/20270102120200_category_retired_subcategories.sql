-- Merchants on a retired subcategory keep a working setup (after the master list,
-- 20261226000200). The Adult Section age check is 20270102120100.
--
-- 1. retired_subcategories: each category keeps the definitions of the
--    subcategories the master list retired (as category_config held them at
--    20261225000100, identical to production then). 33 merchants with an
--    application still sit on one of them, because their category must match
--    their application. Readiness now finds their setup fields and questions
--    there, instead of reading them as incomplete; pickers never show them.
-- 2. rpc_merchant_set_subcategory: an owner may save the specialty they already
--    have even when it is retired; choosing a retired one anew is still refused.
--
-- Idempotent.

alter table public.category_config
  add column if not exists retired_subcategories jsonb not null default '[]'::jsonb;

update public.category_config
set retired_subcategories = $retired$[{"id":"restaurant","icon":"Utensils","name":"Restaurant","fields":[],"workflow":{"groups":[{"steps":["Choose cuisine and ordering methods","Set dine-in, delivery and pickup availability","Add menu items, ingredients and allergen information"],"title":"Setup"},{"steps":["Guest selects menu items and available modifiers","Guest sees item details and the delivery or pickup estimate","Guest places the order"],"title":"Guest order"},{"steps":["Merchant accepts and prepares the order","Merchant marks it ready for collection","Rider delivery and order status are coordinated by the platform"],"title":"Handoff"}],"status":"designed","policyNote":"This onboarding records the intended restaurant workflow. Reservations, item-level allergen display at checkout, and rider dispatch timing require separate platform support."},"questions":[{"key":"restaurant_service_style","step":2,"type":"single","label":"How do guests usually order at your restaurant?","options":[{"label":"Table service","value":"table_service"},{"label":"Order at the counter","value":"counter_service"},{"label":"Takeaway or delivery focused","value":"takeaway_delivery"}]},{"key":"restaurant_menu_focus","step":2,"type":"multi","label":"Which menu styles do you offer?","options":[{"label":"Local cuisine","value":"local"},{"label":"Grill and barbecue","value":"grill"},{"label":"International dishes","value":"international"},{"label":"Vegetarian options","value":"vegetarian"},{"label":"Other","value":"other"}]}],"categoryId":"restaurants_food","workflowHint":"order_dispatch_immediate","defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order","fulfillmentHint":"last_mile_food_hot","catalogueExample":{"name":"Nyama choma plate","photoHint":"Show the plated meal as guests receive it.","description":"Describe the cut, sides, portion and ingredients.","pricePlaceholder":"e.g. 850"},"suggestedItemCount":30},{"id":"fast_food","icon":"Beef","name":"Fast Food","fields":[],"workflow":{"groups":[{"steps":["Configure combo choices and paid extras in the menu","Set rapid handoff and packaging details","Mark sold-out items as unavailable"],"title":"Setup"},{"steps":["Guest chooses a meal and available options","Guest sees price and item details before checkout","Guest chooses delivery or pickup"],"title":"Guest order"},{"steps":["Merchant accepts and prepares the order","Merchant marks the packed order ready","Rider collects it for delivery where selected"],"title":"Handoff"}],"status":"designed","policyNote":"Menu modifiers and rapid dispatch coordination must be enabled in the catalogue and order platform before these steps are live."},"questions":[{"key":"fast_food_combo_offers","step":2,"type":"single","label":"Do you offer meal combos?","options":[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]},{"key":"fast_food_handoff","step":2,"type":"single","label":"How are pickup orders handed over?","options":[{"label":"Front counter","value":"counter"},{"label":"Collection shelf","value":"shelf"},{"label":"Drive-through","value":"drive_through"}]}],"categoryId":"restaurants_food","workflowHint":"order_dispatch_immediate","defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order","fulfillmentHint":"last_mile_food_hot","catalogueExample":{"name":"Chicken burger combo","photoHint":"Show the complete meal and its portion.","description":"List the sides, drink and any included extras.","pricePlaceholder":"e.g. 650"},"suggestedItemCount":30},{"id":"cafe","icon":"Coffee","name":"Café","fields":[],"workflow":{"groups":[{"steps":["Add drinks, food, sizes and available milk or temperature choices","Set which items are made to order","Add ingredient and allergen details"],"title":"Setup"},{"steps":["Guest chooses available sizes and customizations","Guest reviews item details and price","Guest selects delivery, pickup or dine-in where supported"],"title":"Guest order"},{"steps":["Merchant prepares made-to-order drinks and food","Merchant marks delivery orders ready for collection","Guest receives the order through the selected supported channel"],"title":"Handoff"}],"status":"designed","policyNote":"Dine-in ordering and item customization require separate guest ordering support before they can be offered online."},"questions":[{"key":"cafe_drink_sizes","step":2,"type":"multi","label":"Which drink sizes do you serve?","options":[{"label":"Small","value":"small"},{"label":"Regular","value":"regular"},{"label":"Large","value":"large"},{"label":"Other sizes","value":"other"}]},{"key":"cafe_milk_options","step":2,"type":"multi","label":"Which milk options can customers choose?","options":[{"label":"Dairy","value":"dairy"},{"label":"Plant-based","value":"plant_based"},{"label":"Other options","value":"other"}]}],"categoryId":"restaurants_food","workflowHint":"order_dispatch_immediate","defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order","fulfillmentHint":"last_mile_food_ambient","catalogueExample":{"name":"Cappuccino · regular","photoHint":"Show the drink in its serving cup.","description":"Add the size, milk choices and served temperature.","pricePlaceholder":"e.g. 320"},"suggestedItemCount":30},{"id":"bakery","icon":"CakeSlice","name":"Bakery","fields":[],"workflow":{"groups":[{"steps":["Mark products as ready stock or preorder","Set custom cake details, lead time and order cutoff","Add serving, storage and ingredient information"],"title":"Setup"},{"steps":["Guest sees whether an item is in stock or requires advance notice","Guest confirms custom details and collection date","Guest reviews price and availability before ordering"],"title":"Guest order"},{"steps":["Bakery confirms the preorder and agreed date","Bakery prepares and packs the item safely","Item is collected or delivered in the confirmed window"],"title":"Handoff"}],"status":"designed","policyNote":"Date-specific preorder checkout and custom-item configuration require separate order-platform support."},"questions":[{"key":"bakery_product_lines","step":2,"type":"multi","label":"What do you bake?","options":[{"label":"Bread","value":"bread"},{"label":"Pastries","value":"pastries"},{"label":"Cakes","value":"cakes"},{"label":"Custom cakes","value":"custom_cakes"}]},{"key":"bakery_custom_orders","step":2,"type":"single","label":"Do you accept custom bakery orders?","options":[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]}],"categoryId":"restaurants_food","workflowHint":"order_dispatch_immediate","defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order","fulfillmentHint":"last_mile_food_ambient","catalogueExample":{"name":"Sourdough loaf","photoHint":"Show the loaf whole and its typical serving.","description":"Include the weight, ingredients and whether it is preorder.","pricePlaceholder":"e.g. 500"},"suggestedItemCount":30},{"id":"desserts","icon":"IceCream","name":"Desserts","fields":[],"workflow":{"groups":[{"steps":["Add portions, sizes and customization details","Identify items needing chilled or careful handling","Provide ingredient and allergen information"],"title":"Setup"},{"steps":["Guest chooses dessert size and available customization","Guest sees handling notes and item details","Guest chooses a supported fulfillment method"],"title":"Guest order"},{"steps":["Merchant prepares and packs temperature-sensitive items","Merchant marks the order ready","Rider follows the configured handling instructions"],"title":"Handoff"}],"status":"designed","policyNote":"Item-level handling instructions and temperature-aware rider handoff need platform support before they are operational."},"questions":[{"key":"dessert_product_types","step":2,"type":"multi","label":"What kinds of desserts do you offer?","options":[{"label":"Cakes","value":"cakes"},{"label":"Pastries","value":"pastries"},{"label":"Chilled desserts","value":"chilled"},{"label":"Frozen desserts","value":"frozen"}]},{"key":"dessert_temperature_handling","step":2,"type":"single","label":"Which storage conditions do your desserts need?","options":[{"label":"Keep chilled","value":"chilled"},{"label":"Keep frozen","value":"frozen"},{"label":"Room temperature","value":"ambient"},{"label":"It varies by item","value":"varies"}]}],"categoryId":"restaurants_food","workflowHint":"order_dispatch_immediate","defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order","fulfillmentHint":"last_mile_food_cold","catalogueExample":{"name":"Mango cheesecake slice","photoHint":"Show the dessert portion ready to serve.","description":"Describe the portion, toppings and chilled handling.","pricePlaceholder":"e.g. 450"},"suggestedItemCount":30},{"id":"juice_bar","icon":"CupSoda","name":"Juice Bar","fields":[],"workflow":{"groups":[{"steps":["Add ingredients, sizes and available add-ons","Mark made-to-order drinks and chilled handling needs","Use dietary labels only when the claim is accurate"],"title":"Setup"},{"steps":["Guest reviews ingredients, allergens and size","Guest selects available add-ons","Guest chooses delivery or pickup where supported"],"title":"Guest order"},{"steps":["Merchant prepares the drink to order","Merchant seals the drink for safe transport","Rider collects and delivers the order"],"title":"Handoff"}],"status":"designed","policyNote":"Configurable menu add-ons and safe liquid packaging must be supported by catalogue and order tools before the workflow is live."},"questions":[{"key":"juice_bar_products","step":2,"type":"multi","label":"What drinks do you prepare?","options":[{"label":"Fresh juice","value":"fresh_juice"},{"label":"Smoothies","value":"smoothies"},{"label":"Bottled drinks","value":"bottled"},{"label":"Other drinks","value":"other"}]},{"key":"juice_bar_sizes","step":2,"type":"multi","label":"Which serving sizes do you offer?","options":[{"label":"300 ml","value":"300ml"},{"label":"500 ml","value":"500ml"},{"label":"1 litre","value":"1l"},{"label":"Other sizes","value":"other"}]}],"categoryId":"restaurants_food","workflowHint":"order_dispatch_immediate","defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order","fulfillmentHint":"last_mile_food_cold","catalogueExample":{"name":"Fresh passion juice · 500 ml","photoHint":"Show the drink in its sealed serving bottle.","description":"List ingredients, size and whether it is sweetened.","pricePlaceholder":"e.g. 280"},"suggestedItemCount":30},{"id":"cloud_kitchen","icon":"Flame","name":"Cloud Kitchen","fields":[],"workflow":{"groups":[{"steps":["Set the customer-facing brand separately from the kitchen name","Record the correct rider collection location and instructions","Add the menu, hours and available order models"],"title":"Setup"},{"steps":["Guest browses the public brand and menu","Guest selects available items and a supported fulfillment method","Guest sees the customer-facing merchant details"],"title":"Guest order"},{"steps":["Kitchen accepts and prepares the order","Kitchen marks it ready at the correct collection point","Rider receives the kitchen pickup instructions"],"title":"Handoff"}],"status":"designed","policyNote":"Multiple brands, customer-facing name separation and precise rider handoff depend on storefront and dispatch support."},"questions":[{"key":"cloud_kitchen_brand_relation","step":2,"type":"single","label":"Is the customer-facing brand different from the kitchen name?","options":[{"label":"No, use the kitchen name","value":"same"},{"label":"Yes, use a different brand","value":"different"}]},{"key":"cloud_kitchen_handoff","step":2,"type":"single","label":"Where should a delivery rider collect orders?","options":[{"label":"Dedicated handoff counter","value":"dedicated_counter"},{"label":"Side or kitchen entrance","value":"side_entrance"},{"label":"Call on arrival","value":"call_on_arrival"}]}],"categoryId":"restaurants_food","workflowHint":"order_dispatch_immediate","defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order","fulfillmentHint":"last_mile_food_hot","catalogueExample":{"name":"Signature rice bowl","photoHint":"Show the dish as packed for delivery.","description":"Describe the bowl, portion and main ingredients.","pricePlaceholder":"e.g. 720"},"suggestedItemCount":30}]$retired$::jsonb
where category = 'restaurants_food';

update public.category_config
set retired_subcategories = $retired$[{"id":"wine","icon":"GlassWater","name":"Wine","fields":["liquor_license","wine_origins","cold_delivery","gift_wrapping","min_order","age_gate_method"],"categoryId":"alcohol_beverages","workflowHint":"age_gate_required","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"age_verified_last_mile","suggestedItemCount":30},{"id":"champagne","icon":"GlassWater","name":"Champagne","fields":["liquor_license","occasions_spec","cold_delivery","gift_wrapping","age_gate_method"],"categoryId":"alcohol_beverages","workflowHint":"age_gate_required","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"age_verified_last_mile","suggestedItemCount":30},{"id":"cocktail_mixers","icon":"GlassWater","name":"Cocktail Mixers","fields":["liquor_license","gift_packaging","min_order","age_gate_method"],"categoryId":"alcohol_beverages","workflowHint":"age_gate_required","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"standard_last_mile","suggestedItemCount":30},{"id":"liquor_stores","icon":"Store","name":"Liquor Stores","fields":["liquor_license","cold_delivery","min_order","corporate_billing","age_gate_method"],"categoryId":"alcohol_beverages","workflowHint":"age_gate_required","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"age_verified_last_mile","suggestedItemCount":30}]$retired$::jsonb
where category = 'alcohol_beverages';

update public.category_config
set retired_subcategories = $retired$[{"id":"pharmacy_retail","icon":"Pills","name":"Pharmacy","fields":["pharmacist_on_duty","operations_24hr","prescription_delivery","cold_chain_meds"],"categoryId":"pharmacy","workflowHint":"order_dispatch_standard","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"last_mile_pharmacy","suggestedItemCount":30},{"id":"baby_products","icon":"Baby","name":"Baby Products","fields":["baby_product_range","subscription_available","min_order"],"categoryId":"pharmacy","workflowHint":"order_dispatch_standard","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"last_mile_grocery","suggestedItemCount":30}]$retired$::jsonb
where category = 'pharmacy';

update public.category_config
set retired_subcategories = $retired$[{"id":"laundry","icon":"Shirt","name":"Laundry","fields":["pickup_delivery","turnaround_time","per_kg_pricing","per_item_pricing","weight_limit"],"categoryId":"laundry_cleaning","workflowHint":"scheduled_dispatch","defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion","fulfillmentHint":"pickup_dropoff","suggestedItemCount":20},{"id":"dry_cleaning","icon":"Wind","name":"Dry Cleaning","fields":["pickup_delivery","turnaround_time","per_item_pricing","garment_types"],"categoryId":"laundry_cleaning","workflowHint":"scheduled_dispatch","defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion","fulfillmentHint":"pickup_dropoff","suggestedItemCount":20},{"id":"home_cleaning","icon":"Sparkles","name":"Home Cleaning","fields":["one_time_bookings","recurring_sub","equipment_provided","eco_products","min_hours_session","coverage_area_text"],"categoryId":"laundry_cleaning","workflowHint":"booking_dispatch","defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion","fulfillmentHint":"service_dispatch","suggestedItemCount":20},{"id":"office_cleaning","icon":"Building","name":"Office Cleaning","fields":["one_time_bookings","recurring_sub","equipment_provided","eco_products","min_hours_session","coverage_area_text"],"categoryId":"laundry_cleaning","workflowHint":"booking_dispatch","defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion","fulfillmentHint":"service_dispatch","suggestedItemCount":20},{"id":"wash_and_fold","icon":"Shirt","name":"Wash and Fold","fields":["pickup_delivery","turnaround_time","per_kg_pricing","per_item_pricing","weight_limit"],"categoryId":"laundry_cleaning","workflowHint":"scheduled_dispatch","defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion","fulfillmentHint":"pickup_dropoff","suggestedItemCount":20},{"id":"stain_removal","icon":"Sparkles","name":"Stain Removal","fields":["pickup_delivery","turnaround_time","per_item_pricing","garment_types"],"categoryId":"laundry_cleaning","workflowHint":"scheduled_dispatch","defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion","fulfillmentHint":"pickup_dropoff","suggestedItemCount":20},{"id":"clothing_alterations","icon":"Scissors","name":"Clothing Alterations and Repairs","fields":["pickup_delivery","turnaround_time","per_item_pricing","garment_types"],"categoryId":"laundry_cleaning","workflowHint":"scheduled_dispatch","defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion","fulfillmentHint":"pickup_dropoff","suggestedItemCount":20},{"id":"curtain_cleaning","icon":"Sparkles","name":"Curtain Cleaning","fields":["pickup_delivery","turnaround_time","per_item_pricing","garment_types"],"categoryId":"laundry_cleaning","workflowHint":"scheduled_dispatch","defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion","fulfillmentHint":"pickup_dropoff","suggestedItemCount":20},{"id":"wedding_gown_cleaning","icon":"Heart","name":"Wedding Gown Cleaning","fields":["pickup_delivery","turnaround_time","per_item_pricing","garment_types"],"categoryId":"laundry_cleaning","workflowHint":"scheduled_dispatch","defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion","fulfillmentHint":"pickup_dropoff","suggestedItemCount":20},{"id":"corporate_uniform_laundry","icon":"Briefcase","name":"Corporate and Uniform Laundry","fields":["pickup_delivery","turnaround_time","per_kg_pricing","per_item_pricing","weight_limit"],"categoryId":"laundry_cleaning","workflowHint":"scheduled_dispatch","defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion","fulfillmentHint":"pickup_dropoff","suggestedItemCount":20},{"id":"fumigation","icon":"ShieldAlert","name":"Fumigation","fields":["one_time_bookings","recurring_sub","equipment_provided","eco_products","min_hours_session","coverage_area_text"],"categoryId":"laundry_cleaning","workflowHint":"booking_dispatch","defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion","fulfillmentHint":"service_dispatch","suggestedItemCount":20},{"id":"garment_care","icon":"Shirt","name":"Garment Care and Finishing","fields":["pickup_delivery","turnaround_time","per_item_pricing"],"categoryId":"laundry_cleaning","workflowHint":"scheduled_dispatch","defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion","fulfillmentHint":"pickup_dropoff","suggestedItemCount":20},{"id":"laundry_order_tracking","icon":"Map","name":"Laundry Order Tracking","fields":["pickup_delivery","turnaround_time","per_kg_pricing","per_item_pricing","weight_limit"],"categoryId":"laundry_cleaning","workflowHint":"scheduled_dispatch","defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion","fulfillmentHint":"pickup_dropoff","suggestedItemCount":20}]$retired$::jsonb
where category = 'laundry_cleaning';

update public.category_config
set retired_subcategories = $retired$[{"id":"airport_dropoff","icon":"ArrowUp","name":"Airport Drop-off","fields":["vehicle_types_transfer","fleet_size","available_24hr","advance_booking_hrs","chauffeur_uniform","corporate_billing"],"categoryId":"airport_transfers","workflowHint":"booking_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"scheduled_transfer","suggestedItemCount":15}]$retired$::jsonb
where category = 'airport_transfers';

update public.category_config
set retired_subcategories = $retired$[{"id":"game_drives","icon":"Eye","name":"Game Drives","fields":["parks_covered","max_group_size","private_vehicle","advance_booking_hrs"],"categoryId":"travel_tours","workflowHint":"booking_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"safari_dispatch","suggestedItemCount":15},{"id":"luxury_safaris","icon":"Gem","name":"Luxury Safaris","fields":["parks_covered","accommodation_included","meal_plan","min_nights","max_group_size","private_vehicle"],"categoryId":"travel_tours","workflowHint":"booking_dispatch_priority","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"luxury_safari_dispatch","suggestedItemCount":15},{"id":"city_tours","icon":"Map","name":"City Tours","fields":["tour_modes","max_group_size","duration_options","guide_included","tour_languages"],"categoryId":"travel_tours","workflowHint":"booking_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"tour_dispatch","suggestedItemCount":15},{"id":"cultural_tours","icon":"Users","name":"Cultural Tours","fields":["tour_modes","max_group_size","duration_options","guide_included","tour_languages"],"categoryId":"travel_tours","workflowHint":"booking_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"tour_dispatch","suggestedItemCount":15},{"id":"adventure_tours","icon":"Mountain","name":"Adventure Tours","fields":["tour_modes","max_group_size","duration_options","guide_included","equipment_provided"],"categoryId":"travel_tours","workflowHint":"booking_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"tour_dispatch","suggestedItemCount":15},{"id":"travel_packages","icon":"Luggage","name":"Travel Packages","fields":["destinations_text","package_types","flight_included","visa_assistance","tour_languages"],"categoryId":"travel_tours","workflowHint":"booking_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"booking_coordination","suggestedItemCount":15}]$retired$::jsonb
where category = 'travel_tours';

update public.category_config
set retired_subcategories = $retired$[{"id":"concerts","icon":"Music","name":"Concerts","fields":["avg_attendees","ticket_delivery_method","vip_packages","advance_booking_hrs"],"categoryId":"experiences","workflowHint":"event_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"ticket_delivery","suggestedItemCount":15},{"id":"festivals","icon":"Sparkles","name":"Festivals","fields":["avg_attendees","ticket_delivery_method","vip_packages","advance_booking_hrs"],"categoryId":"experiences","workflowHint":"event_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"ticket_delivery","suggestedItemCount":15},{"id":"conferences","icon":"Mic","name":"Conferences","fields":["capacity_range","av_equipment","catering_available","advance_booking_hrs"],"categoryId":"experiences","workflowHint":"booking_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"ticket_delivery","suggestedItemCount":15},{"id":"private_events","icon":"GlassWater","name":"Private Events","fields":["event_planning_offered","venue_sourcing","min_headcount","max_headcount","advance_booking_hrs"],"categoryId":"experiences","workflowHint":"booking_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"service_dispatch","suggestedItemCount":15},{"id":"photography","icon":"Camera","name":"Photography","fields":["booking_required","session_duration_text","max_group_size","equipment_provided","home_service"],"categoryId":"experiences","workflowHint":"booking_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"service_dispatch","suggestedItemCount":15},{"id":"workshops","icon":"Presentation","name":"Workshops","fields":["booking_required","session_duration_text","max_group_size","equipment_provided"],"categoryId":"experiences","workflowHint":"booking_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"service_dispatch","suggestedItemCount":15},{"id":"classes","icon":"BookOpen","name":"Classes","fields":["booking_required","session_duration_text","max_group_size","recurring_sessions"],"categoryId":"experiences","workflowHint":"booking_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"service_dispatch","suggestedItemCount":15},{"id":"sports_activities","icon":"Activity","name":"Sports Activities","fields":["booking_required","max_group_size","equipment_provided","recurring_sessions"],"categoryId":"experiences","workflowHint":"booking_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"service_dispatch","suggestedItemCount":15},{"id":"recreation","icon":"Trees","name":"Recreation","fields":["booking_required","max_group_size","equipment_provided","advance_booking_hrs"],"categoryId":"experiences","workflowHint":"booking_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"service_dispatch","suggestedItemCount":15}]$retired$::jsonb
where category = 'experiences';

update public.category_config
set retired_subcategories = $retired$[{"id":"adult_products","icon":"PackageOpen","name":"Adult Products","fields":["packaging_style","age_gate_method","signature_required","min_order"],"categoryId":"adults_only","workflowHint":"age_verification_mandatory","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"discreet_packaging","catalogueExample":{"name":"Discreet personal wellness item","photoHint":"Show the product with neutral, discreet packaging.","description":"Include the product type, material, and size.","pricePlaceholder":"e.g. 2,500"},"suggestedItemCount":30},{"id":"cigarettes","icon":"Flame","name":"Cigarettes","fields":["license_number","age_gate_method","brands_stocked_text","min_order"],"categoryId":"adults_only","workflowHint":"age_verification_mandatory","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"standard_last_mile","catalogueExample":{"name":"Cigarettes · 20-pack","photoHint":"Show the pack and its label clearly.","description":"Include the exact pack size and required label details.","pricePlaceholder":"e.g. 350"},"suggestedItemCount":30},{"id":"cigars","icon":"Flame","name":"Cigars","fields":["license_number","age_gate_method","brands_stocked_text","gift_packaging"],"categoryId":"adults_only","workflowHint":"age_verification_mandatory","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"standard_last_mile","catalogueExample":{"name":"Single cigar","photoHint":"Show the cigar and its packaging.","description":"Include the cigar type and individual or pack quantity.","pricePlaceholder":"e.g. 900"},"suggestedItemCount":30},{"id":"vapes","icon":"Wind","name":"Vapes","fields":["vape_device_types","age_gate_method","license_number","min_order"],"categoryId":"adults_only","workflowHint":"age_verification_mandatory","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"standard_last_mile","catalogueExample":{"name":"Reusable vape device","photoHint":"Show the device and packaging without promotional claims.","description":"Include the device type and product-specific details.","pricePlaceholder":"e.g. 2,800"},"suggestedItemCount":30},{"id":"adult_accessories","icon":"Star","name":"Adult Accessories","fields":["packaging_style","age_gate_method","signature_required"],"categoryId":"adults_only","workflowHint":"age_verification_mandatory","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"discreet_packaging","catalogueExample":{"name":"Adult accessory","photoHint":"Show the item clearly with discreet presentation.","description":"Name the actual item and include size or material details.","pricePlaceholder":"e.g. 1,200"},"suggestedItemCount":30}]$retired$::jsonb
where category = 'adults_only';

update public.category_config
set retired_subcategories = $retired$[{"id":"skincare","icon":"Droplet","name":"Skincare","fields":["skin_types_served","dermatologist_backed","custom_routine_consult","home_service","products_for_sale"],"categoryId":"beauty","workflowHint":"order_dispatch_standard","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"standard_last_mile","suggestedItemCount":30}]$retired$::jsonb
where category = 'beauty';

update public.category_config
set retired_subcategories = $retired$[{"id":"spa","icon":"Flower","name":"Spa","fields":["spa_services","session_durations","home_service","couples_packages","membership_available"],"categoryId":"wellness","workflowHint":"booking_dispatch","defaultWorkflow":"Select service → provider/location → date/time → intake/preferences → availability → payment/deposit → appointment confirmation","fulfillmentHint":"in_location_or_home","suggestedItemCount":20},{"id":"massage","icon":"Sparkles","name":"Massage","fields":["massage_types","session_durations","home_service","couples_packages"],"categoryId":"wellness","workflowHint":"booking_dispatch","defaultWorkflow":"Select service → provider/location → date/time → intake/preferences → availability → payment/deposit → appointment confirmation","fulfillmentHint":"in_location_or_home","suggestedItemCount":20}]$retired$::jsonb
where category = 'wellness';

update public.category_config
set retired_subcategories = $retired$[{"id":"travel_planning","icon":"Globe","name":"Travel Planning","fields":["destinations_coverage","visa_assistance","travel_insurance_assist"],"categoryId":"concierge_services","workflowHint":"request_dispatch","defaultWorkflow":"","fulfillmentHint":"service_coordination","suggestedItemCount":30},{"id":"property_coordination","icon":"Home","name":"Property Coordination","fields":["coverage_area_text","advance_booking_hrs","available_24hr"],"categoryId":"concierge_services","workflowHint":"request_dispatch","defaultWorkflow":"","fulfillmentHint":"service_coordination","suggestedItemCount":30},{"id":"moving_assistance","icon":"Truck","name":"Moving Assistance","fields":["coverage_area_text","insurance_items","advance_booking_hrs","equipment_provided"],"categoryId":"concierge_services","workflowHint":"booking_dispatch","defaultWorkflow":"","fulfillmentHint":"logistics_coordination","suggestedItemCount":30},{"id":"cleaning_coordination","icon":"Brush","name":"Cleaning Coordination","fields":["coverage_area_text","recurring_sub","eco_products","advance_booking_hrs"],"categoryId":"concierge_services","workflowHint":"booking_dispatch","defaultWorkflow":"","fulfillmentHint":"service_coordination","suggestedItemCount":30}]$retired$::jsonb
where category = 'concierge_services';

update public.category_config
set retired_subcategories = $retired$[{"id":"bike_rental","icon":"Bike","name":"Bike Rental","fields":["bike_types","fleet_size","min_rental_duration","insurance_included","deposit_policy_text","with_driver"],"categoryId":"vehicle_rentals","workflowHint":"booking_dispatch","defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status","fulfillmentHint":"vehicle_dispatch","suggestedItemCount":15}]$retired$::jsonb
where category = 'vehicle_rentals';

update public.category_config
set retired_subcategories = $retired$[{"id":"mens_fashion","icon":"User","name":"Men's Fashion","fields":["brand_tier","size_range_adults","has_physical_store","custom_tailoring","style_consultation","return_policy","packaging_fashion"],"categoryId":"fashion_apparel","workflowHint":"order_dispatch_standard","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"standard_last_mile","suggestedItemCount":30},{"id":"womens_fashion","icon":"User","name":"Women's Fashion","fields":["brand_tier","size_range_adults","has_physical_store","custom_tailoring","style_consultation","return_policy","packaging_fashion"],"categoryId":"fashion_apparel","workflowHint":"order_dispatch_standard","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"standard_last_mile","suggestedItemCount":30},{"id":"accessories","icon":"Sparkles","name":"Accessories","fields":["brand_tier","has_physical_store","return_policy","packaging_fashion"],"categoryId":"fashion_apparel","workflowHint":"order_dispatch_standard","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"standard_last_mile","suggestedItemCount":30}]$retired$::jsonb
where category = 'fashion_apparel';

update public.category_config
set retired_subcategories = $retired$[{"id":"supermarket","icon":"Store","name":"Supermarket","fields":["min_order","express_delivery","pickup_available","operations_24hr","loyalty_program"],"categoryId":"groceries_essentials","workflowHint":"order_dispatch_standard","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"last_mile_grocery","suggestedItemCount":30},{"id":"convenience_store","icon":"ShoppingBag","name":"Convenience Store","fields":["min_order","operations_24hr","express_delivery"],"categoryId":"groceries_essentials","workflowHint":"order_dispatch_immediate","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"last_mile_grocery_express","suggestedItemCount":30},{"id":"butchery","icon":"Beef","name":"Butchery","fields":["custom_cuts","halal_certified","vacuum_sealed","advance_order_required"],"categoryId":"groceries_essentials","workflowHint":"order_dispatch_standard","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"last_mile_grocery_cold","suggestedItemCount":30},{"id":"seafood","icon":"Fish","name":"Seafood","fields":["live_seafood","on_site_processing","min_order"],"categoryId":"groceries_essentials","workflowHint":"order_dispatch_standard","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"last_mile_grocery_cold","suggestedItemCount":30}]$retired$::jsonb
where category = 'groceries_essentials';

update public.category_config
set retired_subcategories = $retired$[{"id":"furniture","icon":"Armchair","name":"Furniture","fields":["product_description","new_or_used","fragile_handling","installation_service"],"categoryId":"marketplace","workflowHint":"order_dispatch_scheduled","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"bulky_last_mile","suggestedItemCount":30},{"id":"appliances","icon":"Tv","name":"Appliances","fields":["product_description","warranty_offered","installation_service","fragile_handling","return_policy"],"categoryId":"marketplace","workflowHint":"order_dispatch_scheduled","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"bulky_last_mile","suggestedItemCount":30},{"id":"decor","icon":"Palette","name":"Decor","fields":["product_description","new_or_used","fragile_handling","gift_wrapping"],"categoryId":"marketplace","workflowHint":"order_dispatch_standard","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"standard_last_mile","suggestedItemCount":30},{"id":"stationery","icon":"PenTool","name":"Stationery","fields":["product_description","min_order","corporate_billing"],"categoryId":"marketplace","workflowHint":"order_dispatch_standard","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"standard_last_mile","suggestedItemCount":30},{"id":"office_supplies","icon":"Paperclip","name":"Office Supplies","fields":["product_description","min_order","corporate_billing"],"categoryId":"marketplace","workflowHint":"order_dispatch_standard","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"standard_last_mile","suggestedItemCount":30},{"id":"general_retail","icon":"Store","name":"General Retail","fields":["product_description","new_or_used","min_order","return_policy"],"categoryId":"marketplace","workflowHint":"order_dispatch_standard","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"standard_last_mile","suggestedItemCount":30}]$retired$::jsonb
where category = 'marketplace';

update public.category_config
set retired_subcategories = $retired$[{"id":"telecom_services","icon":"Wifi","name":"Telecom Services","fields":["telecom_services_offered","telecom_networks"],"categoryId":"tech_electronics","workflowHint":"order_dispatch_standard","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"standard_last_mile","suggestedItemCount":30}]$retired$::jsonb
where category = 'tech_electronics';

update public.category_config
set retired_subcategories = $retired$[{"id":"cakes","icon":"Cake","name":"Cakes","fields":["custom_cake_design","dietary_options_cake","min_advance_order_hrs","same_day_delivery"],"categoryId":"flowers_gifts","workflowHint":"order_dispatch_scheduled","defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery","fulfillmentHint":"scheduled_last_mile","suggestedItemCount":30}]$retired$::jsonb
where category = 'flowers_gifts';

update public.category_config
set retired_subcategories = $retired$[{"id":"sea_freight","icon":"Ship","name":"Sea Freight","fields":["shipping_ways","price_per_container","price_per_cbm","price_per_kg","port_to_warehouse_transport","warehouse_to_client_transport","shipping_times","insurance_included"],"categoryId":"logistics_shipping","workflowHint":"freight_dispatch","defaultWorkflow":"Shipment quote → cargo details → origin/destination → dimensions/weight → documentation → pickup → tracking → delivery","fulfillmentHint":"sea_cargo","suggestedItemCount":10},{"id":"air_freight","icon":"Plane","name":"Air Freight","fields":["shipping_ways","price_per_cbm","price_per_kg","port_to_warehouse_transport","warehouse_to_client_transport","shipping_times","custom_clearance","insurance_included"],"categoryId":"logistics_shipping","workflowHint":"freight_dispatch","defaultWorkflow":"Shipment quote → cargo details → origin/destination → dimensions/weight → documentation → pickup → tracking → delivery","fulfillmentHint":"air_cargo","suggestedItemCount":10},{"id":"road_freight","icon":"Truck","name":"Road Freight & Trucking","fields":["shipping_ways","price_per_container","price_per_cbm","price_per_kg","port_to_warehouse_transport","warehouse_to_client_transport","shipping_times","fleet_size"],"categoryId":"logistics_shipping","workflowHint":"freight_dispatch","defaultWorkflow":"Shipment quote → cargo details → origin/destination → dimensions/weight → documentation → pickup → tracking → delivery","fulfillmentHint":"road_cargo","suggestedItemCount":10},{"id":"warehousing","icon":"Warehouse","name":"Warehousing & Storage","fields":["price_per_sqm","price_per_sqft","warehouse_capacity_sqft","insurance_included","operating_hours_text"],"categoryId":"logistics_shipping","workflowHint":"storage_dispatch","defaultWorkflow":"Shipment quote → cargo details → origin/destination → dimensions/weight → documentation → pickup → tracking → delivery","fulfillmentHint":"storage_fulfillment","suggestedItemCount":10}]$retired$::jsonb
where category = 'logistics_shipping';

CREATE OR REPLACE FUNCTION public.fn_merchant_readiness(p_merchant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m public.merchant;
  v_category_key text;
  v_questions jsonb;
  v_subcategory_basics boolean := false;
  v_prep_time_required boolean := false;
  v_basics boolean := false;
  v_location boolean := false;
  v_hours boolean := false;
  v_documents boolean := false;
  v_payout boolean := false;
  v_items boolean := false;
  v_done integer;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    return null;
  end if;

  if (select auth.uid()) is not null
     and not (authz.is_merchant_member(m.id) or authz.can_manage_merchants(m.city_id))
  then
    raise exception 'Not yours to look at.' using errcode = 'insufficient_privilege';
  end if;

  v_category_key := coalesce(m.category_key, m.category::text);
  if v_category_key is not null then
    select cc.questions, cc.prep_time_required
      into v_questions, v_prep_time_required
    from public.category_config cc
    where cc.category = v_category_key;

    select coalesce(bool_and(
      not coalesce((q.value ->> 'required')::boolean, true)
      or not public.fn_category_condition_matches(q.value -> 'when', m.answers)
      or (
        m.answers ? (q.value ->> 'key')
        and m.answers -> (q.value ->> 'key') not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
      )
    ), true)
    into v_basics
    from jsonb_array_elements(coalesce(v_questions, '[]'::jsonb)) as q(value);

    if jsonb_typeof(m.answers -> 'business_types') = 'array' then
      select coalesce(
        jsonb_array_length(m.answers -> 'business_types') > 0
        and count(subcategory.value) = jsonb_array_length(m.answers -> 'business_types')
        and bool_and(
          subcategory.value is not null
          and not exists (
            select 1
            from jsonb_array_elements_text(coalesce(subcategory.value -> 'fields', '[]'::jsonb)) field(key)
            where not (
              m.answers ? field.key
              and m.answers -> field.key not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
            )
          )
          and not exists (
            select 1
            from jsonb_array_elements(coalesce(subcategory.value -> 'questions', '[]'::jsonb)) question(value)
            where coalesce((question.value ->> 'required')::boolean, true)
              and public.fn_category_condition_matches(question.value -> 'when', m.answers)
              and not (
                m.answers ? (question.value ->> 'key')
                and m.answers -> (question.value ->> 'key') not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
              )
          )
        ),
        false
      )
      into v_subcategory_basics
      from jsonb_array_elements_text(m.answers -> 'business_types') as selected(id)
      left join lateral (
        select specialty.value
        from public.category_config category
        cross join lateral jsonb_array_elements(category.subcategories || category.retired_subcategories) specialty(value)
        where category.category = v_category_key
          and specialty.value ->> 'id' = selected.id
      ) as subcategory on true;
      v_basics := v_basics and v_subcategory_basics;
    elsif m.subcategory is not null then
      select coalesce(bool_and(
        not exists (
          select 1
          from jsonb_array_elements_text(coalesce(s.value -> 'fields', '[]'::jsonb)) field(key)
          where not (
            m.answers ? field.key
            and m.answers -> field.key not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
          )
        )
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(s.value -> 'questions', '[]'::jsonb)) question(value)
          where coalesce((question.value ->> 'required')::boolean, true)
            and public.fn_category_condition_matches(question.value -> 'when', m.answers)
            and not (
              m.answers ? (question.value ->> 'key')
              and m.answers -> (question.value ->> 'key') not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
            )
        )
      ), false)
      into v_subcategory_basics
      from public.category_config category
      cross join lateral jsonb_array_elements(category.subcategories || category.retired_subcategories) s(value)
      where category.category = v_category_key
        and s.value ->> 'id' = m.subcategory;

      v_basics := v_basics and v_subcategory_basics;
    else
      select not exists (
        select 1
        from public.category_config category
        cross join lateral jsonb_array_elements(category.subcategories) specialty(value)
        where category.category = v_category_key
      ) into v_subcategory_basics;
      v_basics := v_basics and v_subcategory_basics;
    end if;

    if v_prep_time_required then
      select coalesce(
        public.fn_category_condition_matches(
          (select q.value -> 'prepTimeWhen'
           from jsonb_array_elements(coalesce(v_questions, '[]'::jsonb)) q(value)
           where q.value ? 'prepTimeWhen'
           limit 1),
          m.answers
        ),
        true
      )
      into v_prep_time_required;
    end if;
  end if;

  select exists (
    select 1 from public.merchant_branch b
    where b.merchant_id = m.id
      and b.is_primary
      and (
        b.zone_id is not null
        or (
          b.location is not null
          and exists (select 1 from public.fn_serving_city(b.location))
        )
      )
  ) into v_location;

  v_hours := m.hours_pattern is not null
    and (not coalesce(v_prep_time_required, false) or m.prep_minutes is not null);

  select coalesce(bool_and(
    exists (
      select 1 from public.document d
      where d.owner_type = 'merchant' and d.owner_id = m.id
        and d.requirement_id = r.id
        and d.status in ('uploaded', 'verified')
    )
  ), false)
  into v_documents
  from public.fn_merchant_required_docs(m.id) r
  where r.essential;

  v_payout := m.payout_rail is not null
    and m.payout_account is not null
    and m.payout_account <> '{}'::jsonb;

  select count(*) >= 5 into v_items
  from public.catalogue_item ci
  where ci.merchant_id = m.id and length(trim(ci.name)) > 0;

  v_done := (v_basics)::int + (v_location)::int + (v_hours)::int
          + (v_documents)::int + (v_payout)::int + (v_items)::int;

  return jsonb_build_object(
    'business_basics', v_basics,
    'location', v_location,
    'hours_prep', v_hours,
    'documents', v_documents,
    'payout', v_payout,
    'first_items', v_items,
    'pct', floor(v_done * 100.0 / 6)::int
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_merchant_set_subcategory(p_merchant_id uuid, p_subcategory text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m public.merchant;
  v_category text;
begin
  m := public.fn_merchant_draft_for_write(p_merchant_id);
  v_category := coalesce(m.category_key, m.category::text);

  if nullif(p_subcategory, '') is not null
    and nullif(p_subcategory, '') is distinct from m.subcategory
    and not exists (
    select 1
    from public.category_config category
    cross join lateral jsonb_array_elements(category.subcategories) as subcategory(value)
    where category.category = v_category
      and subcategory.value ->> 'id' = p_subcategory
  ) then
    raise exception 'Choose a specialty shown for this business category.'
      using errcode = 'check_violation';
  end if;

  update public.merchant
  set subcategory = nullif(p_subcategory, ''),
      onboarding_step = greatest(onboarding_step, 2)
  where id = m.id;

  if m.subcategory is distinct from nullif(p_subcategory, '') then
    perform audit.log(
      p_actor_type => 'merchant_user'::public.actor_type,
      p_module => 'merchant',
      p_action => 'merchant.subcategory_set',
      p_target_type => 'merchant',
      p_target_id => m.id,
      p_before => jsonb_build_object('subcategory', m.subcategory),
      p_after => jsonb_build_object('subcategory', nullif(p_subcategory, ''))
    );
  end if;

  return public.fn_merchant_readiness(m.id);
end;
$function$;

do $$
begin
  if (select sum(jsonb_array_length(retired_subcategories)) from public.category_config) <> 74 then
    raise exception 'Expected 74 retired subcategory definitions.';
  end if;
end $$;
