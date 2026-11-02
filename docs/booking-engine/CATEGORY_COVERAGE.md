# Merchant category coverage

The shared onboarding registry contains 128 subcategories in 21 categories. Each row below uses the checked-in reconciled profile, rather than a newly invented merchant taxonomy. The default model and eligible variants select shared forms, vocabulary, availability rules, resource roles and progress actions. Actual onboarding answers and offering configuration determine which variants are enabled.

This is configuration coverage. Successful registry checks do not prove that a merchant has supplied valid inventory, policies or source-system access. Runtime evidence and deployment limits are recorded in [verification](VERIFICATION.md). The original specialty requirements remain in the [reconciled merchant profiles](payload-reserve-plan/reconciliation/effective-profiles-128.json).

| Category | Merchant specialty | Default work | Eligible models |
| --- | --- | --- | --- |
| Adults Only | Adult Products (`adult_products`) | Order | Order |
| Adults Only | Adult Wellness (`adult_wellness`) | Order | Appointment, Field visit, Order |
| Adults Only | Cigarettes (`cigarettes`) | Order | Order |
| Adults Only | Cigars (`cigars`) | Order | Order |
| Adults Only | Vapes (`vapes`) | Order | Order |
| Adults Only | Adult Accessories (`adult_accessories`) | Order | Order |
| Airport Transfers | Airport Pickup (`airport_pickup`) | Transfer | Transfer |
| Airport Transfers | Airport Drop-off (`airport_dropoff`) | Transfer | Transfer |
| Airport Transfers | Meet & Greet (`meet_greet`) | Transfer | Transfer |
| Airport Transfers | Executive Transfer (`executive_transfer`) | Transfer | Transfer |
| Alcohol & Beverages | Wine (`wine`) | Order | Order |
| Alcohol & Beverages | Spirits (`spirits`) | Order | Order |
| Alcohol & Beverages | Beer (`beer`) | Order | Order |
| Alcohol & Beverages | Champagne (`champagne`) | Order | Order |
| Alcohol & Beverages | Cocktail Mixers (`cocktail_mixers`) | Order | Order |
| Alcohol & Beverages | Liquor Stores (`liquor_stores`) | Order | Order |
| Fashion & Apparel | Men's Fashion (`mens_fashion`) | Order | Appointment, Order, Production due promise |
| Fashion & Apparel | Women's Fashion (`womens_fashion`) | Order | Appointment, Order, Production due promise |
| Fashion & Apparel | Kids Fashion (`kids_fashion`) | Order | Order |
| Fashion & Apparel | Shoes (`shoes`) | Order | Order |
| Fashion & Apparel | Bags (`bags`) | Order | Order |
| Fashion & Apparel | Watches (`watches`) | Order | Order |
| Fashion & Apparel | Accessories (`accessories`) | Order | Order |
| Beauty | Makeup (`makeup`) | Appointment | Appointment, Field visit, Order |
| Beauty | Skincare (`skincare`) | Order | Appointment, Field visit, Order |
| Beauty | Haircare (`haircare`) | Appointment | Appointment, Field visit, Order |
| Beauty | Fragrances (`fragrances`) | Order | Order |
| Beauty | Cosmetics Stores (`cosmetics_stores`) | Order | Order |
| Vehicle Rentals | Car Rental (`car_rental`) | Asset interval | Asset interval |
| Vehicle Rentals | Self Drive (`self_drive`) | Asset interval | Asset interval |
| Vehicle Rentals | Corporate Rental (`corporate_rental`) | Asset interval | Asset interval |
| Vehicle Rentals | Long-Term Rental (`long_term_rental`) | Asset interval | Asset interval |
| Vehicle Rentals | Bike Rental (`bike_rental`) | Asset interval | Asset interval |
| Experiences | Concerts (`concerts`) | Dated session | Dated session |
| Experiences | Festivals (`festivals`) | Dated session | Dated session |
| Experiences | Conferences (`conferences`) | Dated session | Dated session |
| Experiences | Private Events (`private_events`) | Quote request | Quote request |
| Experiences | Photography (`photography`) | Appointment | Appointment, Field visit |
| Experiences | Workshops (`workshops`) | Dated session | Dated session |
| Experiences | Classes (`classes`) | Dated session | Membership or retainer, Dated session |
| Experiences | Sports Activities (`sports_activities`) | Dated session | Membership or retainer, Dated session |
| Experiences | Recreation (`recreation`) | Dated session | Dated session |
| Financial Services | Banking (`banking`) | Quote request | Appointment, Quote request |
| Financial Services | Forex (`forex`) | Quote request | Appointment, Quote request |
| Financial Services | Insurance (`insurance`) | Quote request | Appointment, Quote request |
| Financial Services | Payments (`payments`) | Quote request | Appointment, Quote request |
| Financial Services | Remittance (`remittance`) | Quote request | Appointment, Quote request |
| Financial Services | Sacco Services (`sacco_services`) | Quote request | Appointment, Quote request |
| Financial Services | Business Services (`business_services`) | Quote request | Appointment, Quote request |
| Flowers & Gifts | Flowers (`flowers`) | Order | Membership or retainer, Order |
| Flowers & Gifts | Gift Hampers (`gift_hampers`) | Order | Order, Production due promise |
| Flowers & Gifts | Cakes (`cakes`) | Production due promise | Production due promise |
| Flowers & Gifts | Chocolates (`chocolates`) | Order | Order |
| Flowers & Gifts | Personalized Gifts (`personalized_gifts`) | Production due promise | Production due promise |
| Flowers & Gifts | Occasion Gifts (`occasion_gifts`) | Order | Order |
| Restaurants & Food | Restaurant (`restaurant`) | Order | Order, Table or space |
| Restaurants & Food | Fast Food (`fast_food`) | Order | Order |
| Restaurants & Food | CafÃƒÂ© (`cafe`) | Order | Order |
| Restaurants & Food | Bakery (`bakery`) | Order | Order, Production due promise |
| Restaurants & Food | Desserts (`desserts`) | Order | Order, Production due promise |
| Restaurants & Food | Juice Bar (`juice_bar`) | Order | Order |
| Restaurants & Food | Cloud Kitchen (`cloud_kitchen`) | Order | Order |
| Restaurants & Food | Catering (`catering`) | Quote request | Quote request |
| Groceries & Essentials | Supermarket (`supermarket`) | Order | Order |
| Groceries & Essentials | Convenience Store (`convenience_store`) | Order | Order |
| Groceries & Essentials | Fresh Produce (`fresh_produce`) | Order | Membership or retainer, Order |
| Groceries & Essentials | Butchery (`butchery`) | Order | Order |
| Groceries & Essentials | Seafood (`seafood`) | Order | Order |
| Groceries & Essentials | Organic Store (`organic_store`) | Order | Order |
| Laundry & Cleaning | Laundry (`laundry`) | Collection and return | Collection and return |
| Laundry & Cleaning | Dry Cleaning (`dry_cleaning`) | Collection and return | Collection and return |
| Laundry & Cleaning | Ironing (`ironing`) | Collection and return | Collection and return |
| Laundry & Cleaning | Home Cleaning (`home_cleaning`) | Field visit | Membership or retainer, Field visit |
| Laundry & Cleaning | Office Cleaning (`office_cleaning`) | Field visit | Membership or retainer, Field visit |
| Marketplace | Home & Living (`home_living`) | Order | Order |
| Marketplace | Furniture (`furniture`) | Order | Field visit, Order |
| Marketplace | Appliances (`appliances`) | Order | Field visit, Order |
| Marketplace | Decor (`decor`) | Order | Order |
| Marketplace | Kitchenware (`kitchenware`) | Order | Order |
| Marketplace | Books (`books`) | Order | Order, Production due promise, Quote request |
| Marketplace | Stationery (`stationery`) | Order | Order |
| Marketplace | Office Supplies (`office_supplies`) | Order | Order |
| Marketplace | General Retail (`general_retail`) | Order | Order |
| Pharmacy | Pharmacy (`pharmacy_retail`) | Order | Order |
| Pharmacy | Medical Supplies (`medical_supplies`) | Order | Order |
| Pharmacy | Baby Products (`baby_products`) | Order | Membership or retainer, Order |
| Pharmacy | Supplements (`supplements`) | Order | Order |
| Health | Clinics (`clinics`) | Appointment | Appointment, Field visit |
| Health | Telemedicine (`telemedicine`) | Appointment | Appointment |
| Health | Labs (`labs`) | Appointment | Appointment, Field visit |
| Health | Mental Health (Therapy) (`mental_health`) | Appointment | Appointment |
| Health | Coaching (`coaching`) | Appointment | Appointment, Dated session |
| Tech & Electronics | Smartphones (`smartphones`) | Order | Order, Service job |
| Tech & Electronics | Accessories (`tech_accessories`) | Order | Order |
| Tech & Electronics | Computers (`computers`) | Order | Order, Service job |
| Tech & Electronics | Gaming (`gaming`) | Order | Order |
| Tech & Electronics | Audio (`audio`) | Order | Order |
| Tech & Electronics | Telecom Services (`telecom_services`) | Service job | Order, Service job |
| Tech & Electronics | Smart Devices (`smart_devices`) | Order | Field visit, Order |
| Travel & Tours | Safaris (`safaris`) | Tour | Tour |
| Travel & Tours | Game Drives (`game_drives`) | Tour | Tour |
| Travel & Tours | Luxury Safaris (`luxury_safaris`) | Tour | Tour |
| Travel & Tours | City Tours (`city_tours`) | Tour | Tour |
| Travel & Tours | Cultural Tours (`cultural_tours`) | Tour | Tour |
| Travel & Tours | Adventure Tours (`adventure_tours`) | Tour | Tour |
| Travel & Tours | Travel Packages (`travel_packages`) | Quote request | Quote request |
| Vehicle Services | Car Wash (`car_wash`) | Service job | Membership or retainer, Field visit, Service job |
| Vehicle Services | Tire Service (`tire_service`) | Service job | Field visit, Service job |
| Vehicle Services | Battery Service (`battery_service`) | Field visit | Field visit, Service job |
| Vehicle Services | Vehicle Assistance (`vehicle_assistance`) | Field visit | Field visit |
| Vehicle Services | Vehicle Inspection (`vehicle_inspection`) | Appointment | Appointment, Field visit |
| Wellness | Spa (`spa`) | Appointment | Appointment, Membership or retainer, Field visit |
| Wellness | Massage (`massage`) | Appointment | Appointment, Field visit |
| Wellness | Gym (`gym`) | Membership or retainer | Appointment, Membership or retainer |
| Wellness | Personal Training (`personal_training`) | Appointment | Appointment, Field visit, Dated session |
| App Services | Reservations (`reservations`) | Quote request | Field visit, Quote request |
| App Services | Personal Assistance (`personal_assistance`) | Quote request | Membership or retainer, Field visit, Quote request |
| App Services | Shopping Assistance (`shopping_assistance`) | Quote request | Field visit, Quote request |
| App Services | Gift Sourcing (`gift_sourcing`) | Quote request | Field visit, Quote request |
| App Services | Travel Planning (`travel_planning`) | Quote request | Field visit, Quote request |
| App Services | Property Coordination (`property_coordination`) | Quote request | Field visit, Quote request |
| App Services | Moving Assistance (`moving_assistance`) | Quote request | Field visit, Quote request |
| App Services | Cleaning Coordination (`cleaning_coordination`) | Quote request | Membership or retainer, Field visit, Quote request |
| App Services | VIP Assistance (`vip_assistance`) | Quote request | Membership or retainer, Field visit, Quote request |
| Logistics & Shipping | Sea Freight (`sea_freight`) | Freight | Freight |
| Logistics & Shipping | Air Freight (`air_freight`) | Freight | Freight |
| Logistics & Shipping | Road Freight & Trucking (`road_freight`) | Freight | Freight |
| Logistics & Shipping | Warehousing & Storage (`warehousing`) | Storage occupancy | Storage occupancy |

New categories bind to registered questions and implemented models through `registerBookingCategory` or the reviewed registry sync. A new category does not require a separate portal or booking backend. New kinds of commitments require a typed handler and behavioural verification before they can promise capacity.
