-- Upsert all 21 categories
insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'adults_only', 'Adults Only', 'ShieldAlert', 'products', 'minutes', 1,
  '#7c3aed', '#f5f3ff', 'Age-restricted products and adult wellness', '[{"id":"adult_products","name":"Adult Products","icon":"PackageOpen","categoryId":"adults_only","fulfillmentHint":"discreet_packaging","workflowHint":"age_verification_mandatory","fields":["packaging_style","age_gate_method","signature_required","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"adult_wellness","name":"Adult Wellness","icon":"HeartPulse","categoryId":"adults_only","fulfillmentHint":"discreet_packaging","workflowHint":"age_verification_mandatory","fields":["packaging_style","age_gate_method","booking_required","home_service"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"cigarettes","name":"Cigarettes","icon":"Flame","categoryId":"adults_only","fulfillmentHint":"standard_last_mile","workflowHint":"age_verification_mandatory","fields":["license_number","age_gate_method","brands_stocked_text","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"cigars","name":"Cigars","icon":"Flame","categoryId":"adults_only","fulfillmentHint":"standard_last_mile","workflowHint":"age_verification_mandatory","fields":["license_number","age_gate_method","brands_stocked_text","gift_packaging"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"vapes","name":"Vapes","icon":"Wind","categoryId":"adults_only","fulfillmentHint":"standard_last_mile","workflowHint":"age_verification_mandatory","fields":["vape_device_types","age_gate_method","license_number","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"adult_accessories","name":"Adult Accessories","icon":"Star","categoryId":"adults_only","fulfillmentHint":"discreet_packaging","workflowHint":"age_verification_mandatory","fields":["packaging_style","age_gate_method","signature_required"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'airport_transfers', 'Airport Transfers', 'Plane', 'services', 'turnaround', 2,
  '#0284c7', '#f0f9ff', 'Professional airport pickup, drop-off and executive transfers', '[{"id":"airport_pickup","name":"Airport Pickup","icon":"ArrowDown","categoryId":"airport_transfers","fulfillmentHint":"scheduled_transfer","workflowHint":"booking_dispatch","fields":["vehicle_types_transfer","fleet_size","available_24hr","advance_booking_hrs","flight_tracking","chauffeur_uniform","corporate_billing"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"airport_dropoff","name":"Airport Drop-off","icon":"ArrowUp","categoryId":"airport_transfers","fulfillmentHint":"scheduled_transfer","workflowHint":"booking_dispatch","fields":["vehicle_types_transfer","fleet_size","available_24hr","advance_booking_hrs","chauffeur_uniform","corporate_billing"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"meet_greet","name":"Meet & Greet","icon":"Handshake","categoryId":"airport_transfers","fulfillmentHint":"scheduled_transfer","workflowHint":"booking_dispatch","fields":["vehicle_types_transfer","fleet_size","meet_greet_signage","waiting_time_min","chauffeur_uniform","corporate_billing"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"executive_transfer","name":"Executive Transfer","icon":"Car","categoryId":"airport_transfers","fulfillmentHint":"executive_transfer","workflowHint":"booking_dispatch_priority","fields":["vehicle_types_transfer","fleet_size","available_24hr","advance_booking_hrs","corporate_billing","chauffeur_uniform","flight_tracking"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'alcohol_beverages', 'Alcohol & Beverages', 'GlassWater', 'menu', 'minutes', 3,
  '#7e22ce', '#faf5ff', 'Licensed spirits, wines, beers and cocktail mixers', '[{"id":"wine","name":"Wine","icon":"GlassWater","categoryId":"alcohol_beverages","fulfillmentHint":"age_verified_last_mile","workflowHint":"age_gate_required","fields":["liquor_license","wine_origins","cold_delivery","gift_wrapping","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"spirits","name":"Spirits","icon":"GlassWater","categoryId":"alcohol_beverages","fulfillmentHint":"age_verified_last_mile","workflowHint":"age_gate_required","fields":["liquor_license","brands_stocked_text","gift_wrapping","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"beer","name":"Beer","icon":"Beer","categoryId":"alcohol_beverages","fulfillmentHint":"age_verified_last_mile","workflowHint":"age_gate_required","fields":["liquor_license","cold_delivery","returnable_bottles","brands_stocked_text","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"champagne","name":"Champagne","icon":"GlassWater","categoryId":"alcohol_beverages","fulfillmentHint":"age_verified_last_mile","workflowHint":"age_gate_required","fields":["liquor_license","occasions_spec","cold_delivery","gift_wrapping"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"cocktail_mixers","name":"Cocktail Mixers","icon":"GlassWater","categoryId":"alcohol_beverages","fulfillmentHint":"standard_last_mile","workflowHint":"age_gate_required","fields":["liquor_license","gift_packaging","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"liquor_stores","name":"Liquor Stores","icon":"Store","categoryId":"alcohol_beverages","fulfillmentHint":"age_verified_last_mile","workflowHint":"age_gate_required","fields":["liquor_license","cold_delivery","min_order","corporate_billing"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'fashion_apparel', 'Fashion & Apparel', 'Shirt', 'products', 'minutes', 4,
  '#db2777', '#fdf2f8', 'Clothing, shoes, bags, watches and fashion accessories', '[{"id":"mens_fashion","name":"Men''s Fashion","icon":"User","categoryId":"fashion_apparel","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["brand_tier","size_range_adults","has_physical_store","custom_tailoring","style_consultation","return_policy","packaging_fashion"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"womens_fashion","name":"Women''s Fashion","icon":"User","categoryId":"fashion_apparel","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["brand_tier","size_range_adults","has_physical_store","custom_tailoring","style_consultation","return_policy","packaging_fashion"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"kids_fashion","name":"Kids Fashion","icon":"Baby","categoryId":"fashion_apparel","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["brand_tier","kids_age_range","school_uniforms","return_policy","packaging_fashion"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"shoes","name":"Shoes","icon":"Footprints","categoryId":"fashion_apparel","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["brand_tier","shoe_size_system","has_physical_store","return_policy","packaging_fashion"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"bags","name":"Bags","icon":"ShoppingBag","categoryId":"fashion_apparel","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["brand_tier","authenticity_guarantee","warranty_offered","return_policy","packaging_fashion"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"watches","name":"Watches","icon":"Watch","categoryId":"fashion_apparel","fulfillmentHint":"secure_last_mile","workflowHint":"order_dispatch_standard","fields":["brand_tier","authenticity_guarantee","warranty_offered","return_policy","packaging_fashion"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"accessories","name":"Accessories","icon":"Sparkles","categoryId":"fashion_apparel","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["brand_tier","has_physical_store","return_policy","packaging_fashion"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'beauty', 'Beauty', 'Sparkles', 'products', 'minutes', 5,
  '#be185d', '#fdf2f8', 'Makeup, skincare, haircare, fragrances and cosmetics', '[{"id":"makeup","name":"Makeup","icon":"Sparkles","categoryId":"beauty","fulfillmentHint":"standard_last_mile","workflowHint":"booking_or_dispatch","fields":["booking_required","professional_artists","bridal_packages","event_makeup","home_service","products_for_sale"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"skincare","name":"Skincare","icon":"Droplet","categoryId":"beauty","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["skin_types_served","dermatologist_backed","custom_routine_consult","home_service","products_for_sale"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"haircare","name":"Haircare","icon":"Scissors","categoryId":"beauty","fulfillmentHint":"standard_last_mile","workflowHint":"booking_or_dispatch","fields":["hair_types_served","home_visits","booking_required","products_for_sale"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"fragrances","name":"Fragrances","icon":"Wind","categoryId":"beauty","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["fragrance_families","gift_wrapping","products_for_sale"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"cosmetics_stores","name":"Cosmetics Stores","icon":"Store","categoryId":"beauty","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["own_brand","multi_brand","has_physical_store","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'vehicle_rentals', 'Vehicle Rentals', 'Car', 'services', 'turnaround', 6,
  '#0369a1', '#f0f9ff', 'Short and long-term vehicle hire including cars and bikes', '[{"id":"car_rental","name":"Car Rental","icon":"Car","categoryId":"vehicle_rentals","fulfillmentHint":"vehicle_dispatch","workflowHint":"booking_dispatch","fields":["vehicle_types_rental","fleet_size","min_rental_duration","with_driver","insurance_included","fuel_policy","deposit_policy_text","corporate_billing"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"self_drive","name":"Self Drive","icon":"Shield","categoryId":"vehicle_rentals","fulfillmentHint":"vehicle_dispatch","workflowHint":"booking_dispatch","fields":["vehicle_types_rental","fleet_size","min_rental_duration","insurance_included","fuel_policy","deposit_policy_text","age_requirement"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"corporate_rental","name":"Corporate Rental","icon":"Building","categoryId":"vehicle_rentals","fulfillmentHint":"vehicle_dispatch","workflowHint":"booking_dispatch_priority","fields":["vehicle_types_rental","fleet_size","billing_cycle","dedicated_account_mgr","insurance_included","fuel_policy"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"long_term_rental","name":"Long-Term Rental","icon":"Calendar","categoryId":"vehicle_rentals","fulfillmentHint":"vehicle_dispatch","workflowHint":"booking_dispatch","fields":["vehicle_types_rental","fleet_size","min_rental_duration","insurance_included","fuel_policy","deposit_policy_text"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"bike_rental","name":"Bike Rental","icon":"Bike","categoryId":"vehicle_rentals","fulfillmentHint":"vehicle_dispatch","workflowHint":"booking_dispatch","fields":["bike_types","fleet_size","min_rental_duration","insurance_included","deposit_policy_text","with_driver"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'experiences', 'Experiences', 'Ticket', 'services', 'turnaround', 7,
  '#ea580c', '#fff7ed', 'Events, workshops, photography, sports and recreational activities', '[{"id":"concerts","name":"Concerts","icon":"Music","categoryId":"experiences","fulfillmentHint":"ticket_delivery","workflowHint":"event_dispatch","fields":["avg_attendees","ticket_delivery_method","vip_packages","advance_booking_hrs"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"festivals","name":"Festivals","icon":"Sparkles","categoryId":"experiences","fulfillmentHint":"ticket_delivery","workflowHint":"event_dispatch","fields":["avg_attendees","ticket_delivery_method","vip_packages","advance_booking_hrs"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"conferences","name":"Conferences","icon":"Mic","categoryId":"experiences","fulfillmentHint":"ticket_delivery","workflowHint":"booking_dispatch","fields":["capacity_range","av_equipment","catering_available","advance_booking_hrs"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"private_events","name":"Private Events","icon":"GlassWater","categoryId":"experiences","fulfillmentHint":"service_dispatch","workflowHint":"booking_dispatch","fields":["event_planning_offered","venue_sourcing","min_headcount","max_headcount","advance_booking_hrs"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"photography","name":"Photography","icon":"Camera","categoryId":"experiences","fulfillmentHint":"service_dispatch","workflowHint":"booking_dispatch","fields":["booking_required","session_duration_text","max_group_size","equipment_provided","home_service"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"workshops","name":"Workshops","icon":"Presentation","categoryId":"experiences","fulfillmentHint":"service_dispatch","workflowHint":"booking_dispatch","fields":["booking_required","session_duration_text","max_group_size","equipment_provided"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"classes","name":"Classes","icon":"BookOpen","categoryId":"experiences","fulfillmentHint":"service_dispatch","workflowHint":"booking_dispatch","fields":["booking_required","session_duration_text","max_group_size","recurring_sessions"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"sports_activities","name":"Sports Activities","icon":"Activity","categoryId":"experiences","fulfillmentHint":"service_dispatch","workflowHint":"booking_dispatch","fields":["booking_required","max_group_size","equipment_provided","recurring_sessions"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"recreation","name":"Recreation","icon":"Trees","categoryId":"experiences","fulfillmentHint":"service_dispatch","workflowHint":"booking_dispatch","fields":["booking_required","max_group_size","equipment_provided","advance_booking_hrs"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'financial_services', 'Financial Services', 'Briefcase', 'services', 'turnaround', 8,
  '#059669', '#f0fdf4', 'Banking, forex, insurance, payments and Sacco services', '[{"id":"banking","name":"Banking","icon":"DollarSign","categoryId":"financial_services","fulfillmentHint":"digital_or_in_branch","workflowHint":"appointment_or_digital","fields":["regulatory_license","fin_services_offered_bank","physical_locations_count","digital_platform","operating_hours_text"],"suggestedItemCount":12,"defaultWorkflow":"Service selection → eligibility/compliance → customer details → quote/fee disclosure → digital or branch appointment → confirmation"},{"id":"forex","name":"Forex","icon":"Coins","categoryId":"financial_services","fulfillmentHint":"in_branch","workflowHint":"appointment_or_digital","fields":["regulatory_license","currencies_traded","physical_locations_count","digital_platform","operating_hours_text"],"suggestedItemCount":12,"defaultWorkflow":"Service selection → eligibility/compliance → customer details → quote/fee disclosure → digital or branch appointment → confirmation"},{"id":"insurance","name":"Insurance","icon":"ShieldCheck","categoryId":"financial_services","fulfillmentHint":"digital_or_in_branch","workflowHint":"appointment_or_digital","fields":["regulatory_license","insurance_types","physical_locations_count","digital_platform"],"suggestedItemCount":12,"defaultWorkflow":"Service selection → eligibility/compliance → customer details → quote/fee disclosure → digital or branch appointment → confirmation"},{"id":"payments","name":"Payments","icon":"CreditCard","categoryId":"financial_services","fulfillmentHint":"digital","workflowHint":"digital_dispatch","fields":["regulatory_license","payment_channels","digital_platform","physical_locations_count"],"suggestedItemCount":12,"defaultWorkflow":"Service selection → eligibility/compliance → customer details → quote/fee disclosure → digital or branch appointment → confirmation"},{"id":"remittance","name":"Remittance","icon":"Send","categoryId":"financial_services","fulfillmentHint":"digital_or_in_branch","workflowHint":"digital_dispatch","fields":["regulatory_license","remittance_corridors","digital_platform","physical_locations_count"],"suggestedItemCount":12,"defaultWorkflow":"Service selection → eligibility/compliance → customer details → quote/fee disclosure → digital or branch appointment → confirmation"},{"id":"sacco_services","name":"Sacco Services","icon":"Users","categoryId":"financial_services","fulfillmentHint":"in_branch","workflowHint":"appointment","fields":["regulatory_license","sacco_services_offered","physical_locations_count","operating_hours_text"],"suggestedItemCount":12,"defaultWorkflow":"Service selection → eligibility/compliance → customer details → quote/fee disclosure → digital or branch appointment → confirmation"},{"id":"business_services","name":"Business Services","icon":"Briefcase","categoryId":"financial_services","fulfillmentHint":"digital_or_in_branch","workflowHint":"appointment_or_digital","fields":["regulatory_license","biz_services_offered","physical_locations_count","digital_platform"],"suggestedItemCount":12,"defaultWorkflow":"Service selection → eligibility/compliance → customer details → quote/fee disclosure → digital or branch appointment → confirmation"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'flowers_gifts', 'Flowers & Gifts', 'Gift', 'products', 'minutes', 9,
  '#e11d48', '#fff1f2', 'Flowers, gift hampers, cakes, chocolates and occasion gifts', '[{"id":"flowers","name":"Flowers","icon":"Flower","categoryId":"flowers_gifts","fulfillmentHint":"same_day_last_mile","workflowHint":"order_dispatch_express","fields":["fresh_or_preserved","subscription_bouquets","same_day_delivery","custom_messages","advance_order_hrs"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"gift_hampers","name":"Gift Hampers","icon":"Gift","categoryId":"flowers_gifts","fulfillmentHint":"same_day_last_mile","workflowHint":"order_dispatch_express","fields":["custom_curation","corporate_gifting","hamper_price_ranges","same_day_delivery","custom_messages"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"cakes","name":"Cakes","icon":"Cake","categoryId":"flowers_gifts","fulfillmentHint":"scheduled_last_mile","workflowHint":"order_dispatch_scheduled","fields":["custom_cake_design","dietary_options_cake","min_advance_order_hrs","same_day_delivery"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"chocolates","name":"Chocolates","icon":"Cookie","categoryId":"flowers_gifts","fulfillmentHint":"same_day_last_mile","workflowHint":"order_dispatch_express","fields":["gift_wrapping","custom_messages","same_day_delivery","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"personalized_gifts","name":"Personalized Gifts","icon":"Sparkles","categoryId":"flowers_gifts","fulfillmentHint":"scheduled_last_mile","workflowHint":"order_dispatch_scheduled","fields":["custom_messages","advance_order_hrs","corporate_gifting"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"occasion_gifts","name":"Occasion Gifts","icon":"Heart","categoryId":"flowers_gifts","fulfillmentHint":"same_day_last_mile","workflowHint":"order_dispatch_express","fields":["occasions_spec","same_day_delivery","custom_messages","gift_wrapping"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'restaurants_food', 'Restaurants & Food', 'Utensils', 'menu', 'minutes', 10,
  '#d97706', '#fffbeb', 'Restaurants, fast food, cafés, cloud kitchens and catering', '[{"id":"restaurant","name":"Restaurant","icon":"Utensils","categoryId":"restaurants_food","fulfillmentHint":"last_mile_food_hot","workflowHint":"order_dispatch_immediate","fields":["cuisine_types","table_service","avg_prep_time","has_physical_seating","reservation_system","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order"},{"id":"fast_food","name":"Fast Food","icon":"Beef","categoryId":"restaurants_food","fulfillmentHint":"last_mile_food_hot","workflowHint":"order_dispatch_immediate","fields":["avg_prep_time","drive_through","family_meals","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order"},{"id":"cafe","name":"Café","icon":"Coffee","categoryId":"restaurants_food","fulfillmentHint":"last_mile_food_ambient","workflowHint":"order_dispatch_immediate","fields":["brewing_methods","wifi_available","coworking_space","seated_capacity","food_menu"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order"},{"id":"bakery","name":"Bakery","icon":"CakeSlice","categoryId":"restaurants_food","fulfillmentHint":"last_mile_food_ambient","workflowHint":"order_dispatch_immediate","fields":["bakery_specialties","custom_orders","advance_order_hrs","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order"},{"id":"desserts","name":"Desserts","icon":"IceCream","categoryId":"restaurants_food","fulfillmentHint":"last_mile_food_cold","workflowHint":"order_dispatch_immediate","fields":["dessert_specialties","custom_orders","dietary_options_cake","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order"},{"id":"juice_bar","name":"Juice Bar","icon":"CupSoda","categoryId":"restaurants_food","fulfillmentHint":"last_mile_food_cold","workflowHint":"order_dispatch_immediate","fields":["cold_pressed","smoothie_bowls","vegan_menu","detox_programs"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order"},{"id":"cloud_kitchen","name":"Cloud Kitchen","icon":"Flame","categoryId":"restaurants_food","fulfillmentHint":"last_mile_food_hot","workflowHint":"order_dispatch_immediate","fields":["number_of_brands","cuisine_types","pickup_available","avg_prep_time"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order"},{"id":"catering","name":"Catering","icon":"CookingPot","categoryId":"restaurants_food","fulfillmentHint":"scheduled_bulk_delivery","workflowHint":"order_dispatch_scheduled","fields":["cuisine_types","min_headcount","max_headcount","equipment_provided","staff_included","advance_booking_days"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → required options → optional add-ons → cart → delivery/pickup or dine-in option → payment → live order"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'groceries_essentials', 'Groceries & Essentials', 'ShoppingCart', 'products', 'minutes', 11,
  '#16a34a', '#f0fdf4', 'Supermarkets, fresh produce, butcheries and organic stores', '[{"id":"supermarket","name":"Supermarket","icon":"Store","categoryId":"groceries_essentials","fulfillmentHint":"last_mile_grocery","workflowHint":"order_dispatch_standard","fields":["min_order","express_delivery","pickup_available","operations_24hr","loyalty_program"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"convenience_store","name":"Convenience Store","icon":"ShoppingBag","categoryId":"groceries_essentials","fulfillmentHint":"last_mile_grocery_express","workflowHint":"order_dispatch_immediate","fields":["min_order","operations_24hr","express_delivery"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"fresh_produce","name":"Fresh Produce","icon":"Leaf","categoryId":"groceries_essentials","fulfillmentHint":"last_mile_grocery_cold","workflowHint":"order_dispatch_standard","fields":["organic_options","farm_direct","subscription_boxes","weekly_market"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"butchery","name":"Butchery","icon":"Beef","categoryId":"groceries_essentials","fulfillmentHint":"last_mile_grocery_cold","workflowHint":"order_dispatch_standard","fields":["custom_cuts","halal_certified","vacuum_sealed","advance_order_required"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"seafood","name":"Seafood","icon":"Fish","categoryId":"groceries_essentials","fulfillmentHint":"last_mile_grocery_cold","workflowHint":"order_dispatch_standard","fields":["live_seafood","on_site_processing","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"organic_store","name":"Organic Store","icon":"Leaf","categoryId":"groceries_essentials","fulfillmentHint":"last_mile_grocery","workflowHint":"order_dispatch_standard","fields":["local_sourcing","zero_waste_packaging"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'laundry_cleaning', 'Laundry & Cleaning', 'Sparkles', 'services', 'turnaround', 12,
  '#0891b2', '#ecfeff', 'Laundry, dry cleaning, ironing and home or office cleaning', '[{"id":"laundry","name":"Laundry","icon":"Shirt","categoryId":"laundry_cleaning","fulfillmentHint":"pickup_dropoff","workflowHint":"scheduled_dispatch","fields":["pickup_delivery","turnaround_time","per_kg_pricing","per_item_pricing","weight_limit"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"dry_cleaning","name":"Dry Cleaning","icon":"Wind","categoryId":"laundry_cleaning","fulfillmentHint":"pickup_dropoff","workflowHint":"scheduled_dispatch","fields":["pickup_delivery","turnaround_time","per_item_pricing","garment_types"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"ironing","name":"Ironing","icon":"Shirt","categoryId":"laundry_cleaning","fulfillmentHint":"pickup_dropoff","workflowHint":"scheduled_dispatch","fields":["pickup_delivery","turnaround_time","per_item_pricing"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"home_cleaning","name":"Home Cleaning","icon":"Sparkles","categoryId":"laundry_cleaning","fulfillmentHint":"service_dispatch","workflowHint":"booking_dispatch","fields":["one_time_bookings","recurring_sub","equipment_provided","eco_products","min_hours_session","coverage_area_text"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"},{"id":"office_cleaning","name":"Office Cleaning","icon":"Building","categoryId":"laundry_cleaning","fulfillmentHint":"service_dispatch","workflowHint":"booking_dispatch","fields":["one_time_bookings","recurring_sub","equipment_provided","eco_products","min_hours_session","coverage_area_text"],"suggestedItemCount":20,"defaultWorkflow":"Select service → address → scope/details → schedule → quote or fixed price → confirmation → assigned provider → completion"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'marketplace', 'Marketplace', 'Store', 'products', 'minutes', 13,
  '#4f46e5', '#eef2ff', 'Home, furniture, appliances, books and general retail', '[{"id":"home_living","name":"Home & Living","icon":"Home","categoryId":"marketplace","fulfillmentHint":"bulky_last_mile","workflowHint":"order_dispatch_scheduled","fields":["product_description","new_or_used","fragile_handling","return_policy"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"furniture","name":"Furniture","icon":"Armchair","categoryId":"marketplace","fulfillmentHint":"bulky_last_mile","workflowHint":"order_dispatch_scheduled","fields":["product_description","new_or_used","fragile_handling","installation_service"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"appliances","name":"Appliances","icon":"Tv","categoryId":"marketplace","fulfillmentHint":"bulky_last_mile","workflowHint":"order_dispatch_scheduled","fields":["product_description","warranty_offered","installation_service","fragile_handling","return_policy"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"decor","name":"Decor","icon":"Palette","categoryId":"marketplace","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["product_description","new_or_used","fragile_handling","gift_wrapping"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"kitchenware","name":"Kitchenware","icon":"ChefHat","categoryId":"marketplace","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["product_description","new_or_used","return_policy"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"books","name":"Books","icon":"BookOpen","categoryId":"marketplace","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["book_genres","new_or_used","custom_orders"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"stationery","name":"Stationery","icon":"PenTool","categoryId":"marketplace","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["product_description","min_order","corporate_billing"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"office_supplies","name":"Office Supplies","icon":"Paperclip","categoryId":"marketplace","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["product_description","min_order","corporate_billing"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"general_retail","name":"General Retail","icon":"Store","categoryId":"marketplace","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["product_description","new_or_used","min_order","return_policy"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'pharmacy', 'Pharmacy', 'Pills', 'products', 'minutes', 14,
  '#0d9488', '#f0fdfa', 'Pharmacy, medical supplies, baby products and supplements', '[{"id":"pharmacy_retail","name":"Pharmacy","icon":"Pills","categoryId":"pharmacy","fulfillmentHint":"last_mile_pharmacy","workflowHint":"order_dispatch_standard","fields":["pharmacist_on_duty","operations_24hr","prescription_delivery","cold_chain_meds"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"medical_supplies","name":"Medical Supplies","icon":"Briefcase","categoryId":"pharmacy","fulfillmentHint":"last_mile_pharmacy","workflowHint":"order_dispatch_standard","fields":["med_supply_types","corporate_billing"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"baby_products","name":"Baby Products","icon":"Baby","categoryId":"pharmacy","fulfillmentHint":"last_mile_grocery","workflowHint":"order_dispatch_standard","fields":["baby_product_range","subscription_available","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"supplements","name":"Supplements","icon":"Shield","categoryId":"pharmacy","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["supplement_categories","authenticity_guarantee"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'health', 'Health', 'Heart', 'services', 'turnaround', 15,
  '#059669', '#f0fdf4', 'Clinics, telemedicine, labs, mental health and coaching', '[{"id":"clinics","name":"Clinics","icon":"Activity","categoryId":"health","fulfillmentHint":"in_clinic_or_home_visit","workflowHint":"booking_dispatch","fields":["clinic_specializations","appointment_booking","walk_in_available","home_visits","insurance_accepted"],"suggestedItemCount":20,"defaultWorkflow":"Select service → provider/location → date/time → intake/preferences → availability → payment/deposit → appointment confirmation"},{"id":"telemedicine","name":"Telemedicine","icon":"Video","categoryId":"health","fulfillmentHint":"digital","workflowHint":"booking_digital","fields":["tele_platforms","clinic_specializations","available_24hr"],"suggestedItemCount":20,"defaultWorkflow":"Select service → provider/location → date/time → intake/preferences → availability → payment/deposit → appointment confirmation"},{"id":"labs","name":"Labs","icon":"Droplet","categoryId":"health","fulfillmentHint":"in_lab_or_home_sample","workflowHint":"booking_dispatch","fields":["lab_test_types","home_sample_collection","results_turnaround_hrs"],"suggestedItemCount":20,"defaultWorkflow":"Select service → provider/location → date/time → intake/preferences → availability → payment/deposit → appointment confirmation"},{"id":"mental_health","name":"Mental Health (Therapy)","icon":"User","categoryId":"health","fulfillmentHint":"service_dispatch_or_digital","workflowHint":"booking_dispatch","fields":["therapy_types","session_format","avg_session_duration"],"suggestedItemCount":20,"defaultWorkflow":"Select service → provider/location → date/time → intake/preferences → availability → payment/deposit → appointment confirmation"},{"id":"coaching","name":"Coaching","icon":"MessageCircle","categoryId":"health","fulfillmentHint":"service_dispatch_or_digital","workflowHint":"booking_dispatch","fields":["coaching_areas","session_format","avg_session_duration","group_sessions"],"suggestedItemCount":20,"defaultWorkflow":"Select service → provider/location → date/time → intake/preferences → availability → payment/deposit → appointment confirmation"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'tech_electronics', 'Tech & Electronics', 'Laptop', 'products', 'minutes', 16,
  '#2563eb', '#eff6ff', 'Smartphones, computers, gaming, audio and telecom', '[{"id":"smartphones","name":"Smartphones","icon":"Smartphone","categoryId":"tech_electronics","fulfillmentHint":"secure_last_mile","workflowHint":"order_dispatch_standard","fields":["phone_brands","new_or_refurbished","warranty_months","repair_services","trade_in_program"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"tech_accessories","name":"Accessories","icon":"Usb","categoryId":"tech_electronics","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["product_description","warranty_offered","min_order"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"computers","name":"Computers","icon":"Laptop","categoryId":"tech_electronics","fulfillmentHint":"secure_last_mile","workflowHint":"order_dispatch_standard","fields":["computer_brands","new_or_refurbished","warranty_months","repair_services"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"gaming","name":"Gaming","icon":"Gamepad2","categoryId":"tech_electronics","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["console_types","pre_owned_games","gaming_accessories"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"audio","name":"Audio","icon":"Volume2","categoryId":"tech_electronics","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["product_description","warranty_offered","return_policy"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"telecom_services","name":"Telecom Services","icon":"Wifi","categoryId":"tech_electronics","fulfillmentHint":"standard_last_mile","workflowHint":"order_dispatch_standard","fields":["telecom_services_offered","telecom_networks"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"},{"id":"smart_devices","name":"Smart Devices","icon":"Cpu","categoryId":"tech_electronics","fulfillmentHint":"secure_last_mile","workflowHint":"order_dispatch_standard","fields":["product_description","warranty_offered","installation_service"],"suggestedItemCount":30,"defaultWorkflow":"Browse → item → variant/quantity → delivery or pickup → eligibility checks where required → cart → payment → dispatch → delivery"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'travel_tours', 'Travel & Tours', 'Compass', 'products', 'minutes', 17,
  '#b45309', '#fffbeb', 'Safaris, game drives, city tours, cultural and adventure packages', '[{"id":"safaris","name":"Safaris","icon":"Compass","categoryId":"travel_tours","fulfillmentHint":"safari_dispatch","workflowHint":"booking_dispatch","fields":["parks_covered","accommodation_included","meal_plan","min_nights","max_group_size","private_vehicle"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"game_drives","name":"Game Drives","icon":"Eye","categoryId":"travel_tours","fulfillmentHint":"safari_dispatch","workflowHint":"booking_dispatch","fields":["parks_covered","max_group_size","private_vehicle","advance_booking_hrs"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"luxury_safaris","name":"Luxury Safaris","icon":"Gem","categoryId":"travel_tours","fulfillmentHint":"luxury_safari_dispatch","workflowHint":"booking_dispatch_priority","fields":["parks_covered","accommodation_included","meal_plan","min_nights","max_group_size","private_vehicle"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"city_tours","name":"City Tours","icon":"Map","categoryId":"travel_tours","fulfillmentHint":"tour_dispatch","workflowHint":"booking_dispatch","fields":["tour_modes","max_group_size","duration_options","guide_included","tour_languages"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"cultural_tours","name":"Cultural Tours","icon":"Users","categoryId":"travel_tours","fulfillmentHint":"tour_dispatch","workflowHint":"booking_dispatch","fields":["tour_modes","max_group_size","duration_options","guide_included","tour_languages"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"adventure_tours","name":"Adventure Tours","icon":"Mountain","categoryId":"travel_tours","fulfillmentHint":"tour_dispatch","workflowHint":"booking_dispatch","fields":["tour_modes","max_group_size","duration_options","guide_included","equipment_provided"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"},{"id":"travel_packages","name":"Travel Packages","icon":"Luggage","categoryId":"travel_tours","fulfillmentHint":"booking_coordination","workflowHint":"booking_dispatch","fields":["destinations_text","package_types","flight_included","visa_assistance","tour_languages"],"suggestedItemCount":15,"defaultWorkflow":"Select offering → date/time → party/vehicle/group details → availability → price → payment/deposit → confirmation → live status"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'vehicle_services', 'Vehicle Services', 'Wrench', 'services', 'turnaround', 18,
  '#475569', '#f8fafc', 'Car wash, tire service, battery, vehicle assistance and inspection', '[{"id":"car_wash","name":"Car Wash","icon":"Droplet","categoryId":"vehicle_services","fulfillmentHint":"in_location_or_mobile","workflowHint":"booking_or_immediate","fields":["wash_types","mobile_service","subscription_plans","advance_booking_hrs"],"suggestedItemCount":20,"defaultWorkflow":"Browse → select offering → details → schedule/request → confirmation → fulfilment status"},{"id":"tire_service","name":"Tire Service","icon":"Circle","categoryId":"vehicle_services","fulfillmentHint":"mobile_or_in_location","workflowHint":"booking_or_immediate","fields":["tire_brands_text","mobile_service","emergency_callout","available_24hr"],"suggestedItemCount":20,"defaultWorkflow":"Browse → select offering → details → schedule/request → confirmation → fulfilment status"},{"id":"battery_service","name":"Battery Service","icon":"Zap","categoryId":"vehicle_services","fulfillmentHint":"mobile_service","workflowHint":"booking_or_immediate","fields":["mobile_service","emergency_callout","available_24hr","battery_brands_text"],"suggestedItemCount":20,"defaultWorkflow":"Browse → select offering → details → schedule/request → confirmation → fulfilment status"},{"id":"vehicle_assistance","name":"Vehicle Assistance","icon":"ShieldAlert","categoryId":"vehicle_services","fulfillmentHint":"emergency_dispatch","workflowHint":"immediate_dispatch","fields":["assistance_services","response_time_min","coverage_area_text","available_24hr"],"suggestedItemCount":20,"defaultWorkflow":"Browse → select offering → details → schedule/request → confirmation → fulfilment status"},{"id":"vehicle_inspection","name":"Vehicle Inspection","icon":"ClipboardCheck","categoryId":"vehicle_services","fulfillmentHint":"mobile_or_in_location","workflowHint":"booking_dispatch","fields":["inspection_types","mobile_inspection","report_provided","duration_min"],"suggestedItemCount":20,"defaultWorkflow":"Browse → select offering → details → schedule/request → confirmation → fulfilment status"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'wellness', 'Wellness', 'Activity', 'services', 'turnaround', 19,
  '#7c3aed', '#f5f3ff', 'Spa, massage, gym, personal training and wellness coaching', '[{"id":"spa","name":"Spa","icon":"Flower","categoryId":"wellness","fulfillmentHint":"in_location_or_home","workflowHint":"booking_dispatch","fields":["spa_services","session_durations","home_service","couples_packages","membership_available"],"suggestedItemCount":20,"defaultWorkflow":"Select service → provider/location → date/time → intake/preferences → availability → payment/deposit → appointment confirmation"},{"id":"massage","name":"Massage","icon":"Sparkles","categoryId":"wellness","fulfillmentHint":"in_location_or_home","workflowHint":"booking_dispatch","fields":["massage_types","session_durations","home_service","couples_packages"],"suggestedItemCount":20,"defaultWorkflow":"Select service → provider/location → date/time → intake/preferences → availability → payment/deposit → appointment confirmation"},{"id":"gym","name":"Gym","icon":"Dumbbell","categoryId":"wellness","fulfillmentHint":"in_location","workflowHint":"membership_or_walk_in","fields":["gym_facilities","available_24hr","personal_training_available","membership_types"],"suggestedItemCount":20,"defaultWorkflow":"Select service → provider/location → date/time → intake/preferences → availability → payment/deposit → appointment confirmation"},{"id":"personal_training","name":"Personal Training","icon":"User","categoryId":"wellness","fulfillmentHint":"service_dispatch_or_in_location","workflowHint":"booking_dispatch","fields":["training_specializations","session_location","avg_session_duration","group_sessions"],"suggestedItemCount":20,"defaultWorkflow":"Select service → provider/location → date/time → intake/preferences → availability → payment/deposit → appointment confirmation"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'concierge_services', 'App Services', 'BellRing', 'services', 'turnaround', 20,
  '#b45309', '#fffbeb', 'Reservations, personal assistance, gift sourcing and VIP support', '[{"id":"reservations","name":"Reservations","icon":"CalendarCheck","categoryId":"concierge_services","fulfillmentHint":"service_coordination","workflowHint":"request_dispatch","fields":["reservation_venue_types","advance_booking_hrs"],"suggestedItemCount":30,"defaultWorkflow":""},{"id":"personal_assistance","name":"Personal Assistance","icon":"UserCheck","categoryId":"concierge_services","fulfillmentHint":"service_dispatch","workflowHint":"request_dispatch","fields":["response_time_hrs","corporate_clients","dedicated_account_mgr","retainer_ksh"],"suggestedItemCount":30,"defaultWorkflow":""},{"id":"shopping_assistance","name":"Shopping Assistance","icon":"ShoppingCart","categoryId":"concierge_services","fulfillmentHint":"service_dispatch","workflowHint":"request_dispatch","fields":["response_time_hrs","corporate_clients"],"suggestedItemCount":30,"defaultWorkflow":""},{"id":"gift_sourcing","name":"Gift Sourcing","icon":"Gift","categoryId":"concierge_services","fulfillmentHint":"service_coordination","workflowHint":"request_dispatch","fields":["advance_booking_hrs","corporate_clients","gift_wrapping"],"suggestedItemCount":30,"defaultWorkflow":""},{"id":"travel_planning","name":"Travel Planning","icon":"Globe","categoryId":"concierge_services","fulfillmentHint":"service_coordination","workflowHint":"request_dispatch","fields":["destinations_coverage","visa_assistance","travel_insurance_assist"],"suggestedItemCount":30,"defaultWorkflow":""},{"id":"property_coordination","name":"Property Coordination","icon":"Home","categoryId":"concierge_services","fulfillmentHint":"service_coordination","workflowHint":"request_dispatch","fields":["coverage_area_text","advance_booking_hrs","available_24hr"],"suggestedItemCount":30,"defaultWorkflow":""},{"id":"moving_assistance","name":"Moving Assistance","icon":"Truck","categoryId":"concierge_services","fulfillmentHint":"logistics_coordination","workflowHint":"booking_dispatch","fields":["coverage_area_text","insurance_items","advance_booking_hrs","equipment_provided"],"suggestedItemCount":30,"defaultWorkflow":""},{"id":"cleaning_coordination","name":"Cleaning Coordination","icon":"Brush","categoryId":"concierge_services","fulfillmentHint":"service_coordination","workflowHint":"booking_dispatch","fields":["coverage_area_text","recurring_sub","eco_products","advance_booking_hrs"],"suggestedItemCount":30,"defaultWorkflow":""},{"id":"vip_assistance","name":"VIP Assistance","icon":"Crown","categoryId":"concierge_services","fulfillmentHint":"priority_service_dispatch","workflowHint":"request_dispatch_priority","fields":["vip_services_text","available_24hr","dedicated_account_mgr","retainer_model"],"suggestedItemCount":30,"defaultWorkflow":""}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;

insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort,
  color, bg, description, subcategories, featured_eligible, requires_ops_mapping
) values (
  'logistics_shipping', 'Logistics & Shipping', 'Ship', 'services', 'turnaround', 21,
  '#0d9488', '#f0fdfa', 'On-demand courier, cargo freight, container shipping and warehousing', '[{"id":"sea_freight","name":"Sea Freight","icon":"Ship","categoryId":"logistics_shipping","fulfillmentHint":"sea_cargo","workflowHint":"freight_dispatch","fields":["shipping_ways","price_per_container","price_per_cbm","price_per_kg","port_to_warehouse_transport","warehouse_to_client_transport","shipping_times","insurance_included"],"suggestedItemCount":10,"defaultWorkflow":"Shipment quote → cargo details → origin/destination → dimensions/weight → documentation → pickup → tracking → delivery"},{"id":"air_freight","name":"Air Freight","icon":"Plane","categoryId":"logistics_shipping","fulfillmentHint":"air_cargo","workflowHint":"freight_dispatch","fields":["shipping_ways","price_per_cbm","price_per_kg","port_to_warehouse_transport","warehouse_to_client_transport","shipping_times","custom_clearance","insurance_included"],"suggestedItemCount":10,"defaultWorkflow":"Shipment quote → cargo details → origin/destination → dimensions/weight → documentation → pickup → tracking → delivery"},{"id":"road_freight","name":"Road Freight & Trucking","icon":"Truck","categoryId":"logistics_shipping","fulfillmentHint":"road_cargo","workflowHint":"freight_dispatch","fields":["shipping_ways","price_per_container","price_per_cbm","price_per_kg","port_to_warehouse_transport","warehouse_to_client_transport","shipping_times","fleet_size"],"suggestedItemCount":10,"defaultWorkflow":"Shipment quote → cargo details → origin/destination → dimensions/weight → documentation → pickup → tracking → delivery"},{"id":"warehousing","name":"Warehousing & Storage","icon":"Warehouse","categoryId":"logistics_shipping","fulfillmentHint":"storage_fulfillment","workflowHint":"storage_dispatch","fields":["price_per_sqm","price_per_sqft","warehouse_capacity_sqft","insurance_included","operating_hours_text"],"suggestedItemCount":10,"defaultWorkflow":"Shipment quote → cargo details → origin/destination → dimensions/weight → documentation → pickup → tracking → delivery"}]'::jsonb, true, false
)
on conflict (category) do update set
  label = excluded.label,
  icon = excluded.icon,
  card_kind = excluded.card_kind,
  eta_style = excluded.eta_style,
  sort = excluded.sort,
  color = excluded.color,
  bg = excluded.bg,
  description = excluded.description,
  subcategories = excluded.subcategories;


-- Refresh merchant_public view to expose subcategory
create or replace view public.merchant_public
with (security_invoker = false)
as
select
  m.id,
  m.trading_name,
  m.category,
  m.category_other,
  m.cover_photo_path,
  m.featured,
  c.slug as city_slug,
  c.name as city_name,
  b.name as branch_name,
  b.address_text as branch_address,
  b.latitude as branch_latitude,
  b.longitude as branch_longitude,
  m.went_live_at as listed_at,
  m.explore_visible,
  m.concierge_pick,
  m.accepting_orders,
  m.busy_mode_until,
  m.closed_early_at,
  m.pay_on_delivery as pay_on_delivery_enabled,
  m.pay_on_delivery_cap_kes,
  m.prep_minutes,
  m.parent_merchant_id,
  (select h.opens from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as opens_today,
  (select h.closes from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as closes_today,
  (select h.closed from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as closed_today,
  case when m.health_band = 'green' then 'green' end as health_badge,
  m.subcategory
from public.merchant m
join public.city c on c.id = m.city_id
left join public.merchant_branch b on b.merchant_id = m.id and b.is_primary
where m.status = 'live' and m.explore_visible;

grant select on public.merchant_public to anon, authenticated;
