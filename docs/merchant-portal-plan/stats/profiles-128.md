# Statistics for every merchant specialty

Date: 31 October 2026. Design mappings, not working dashboards. Each row references the same shared workflow definitions. Source and answer conditions decide what becomes measurable.

| Category | Specialty | Workflow | Home headlines | Chart measures | Answer rules |
| --- | --- | --- | --- | --- | --- |
| adults_only | Adult Products | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| adults_only | Adult Wellness | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 2 |
| adults_only | Cigarettes | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| adults_only | Cigars | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| adults_only | Vapes | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| adults_only | Adult Accessories | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| airport_transfers | Airport Pickup | WF_TRANSFER | Pickups scheduled; Transfers needing assignment; Transfers completed | completed_transfers, pickup_punctuality, vehicle_utilisation | 0 |
| airport_transfers | Airport Drop-off | WF_TRANSFER | Pickups scheduled; Transfers needing assignment; Transfers completed | completed_transfers, pickup_punctuality, vehicle_utilisation | 0 |
| airport_transfers | Meet & Greet | WF_TRANSFER | Pickups scheduled; Transfers needing assignment; Transfers completed | completed_transfers, pickup_punctuality, vehicle_utilisation | 0 |
| airport_transfers | Executive Transfer | WF_TRANSFER | Pickups scheduled; Transfers needing assignment; Transfers completed | completed_transfers, pickup_punctuality, vehicle_utilisation | 0 |
| alcohol_beverages | Wine | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| alcohol_beverages | Spirits | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| alcohol_beverages | Beer | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| alcohol_beverages | Champagne | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| alcohol_beverages | Cocktail Mixers | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| alcohol_beverages | Liquor Stores | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| fashion_apparel | Men's Fashion | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 2 |
| fashion_apparel | Women's Fashion | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 2 |
| fashion_apparel | Kids Fashion | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| fashion_apparel | Shoes | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| fashion_apparel | Bags | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| fashion_apparel | Watches | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| fashion_apparel | Accessories | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| beauty | Makeup | WF_APPOINTMENT | Appointments scheduled; Remaining appointment capacity; Appointments completed | completed_appointments, slot_utilisation, no_show_rate | 5 |
| beauty | Skincare | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 4 |
| beauty | Haircare | WF_APPOINTMENT | Appointments scheduled; Remaining appointment capacity; Appointments completed | completed_appointments, slot_utilisation, no_show_rate | 5 |
| beauty | Fragrances | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 2 |
| beauty | Cosmetics Stores | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| vehicle_rentals | Car Rental | WF_RENTAL | Active rentals; Handovers scheduled; Returns scheduled | completed_rentals, asset_utilisation, return_punctuality | 1 |
| vehicle_rentals | Self Drive | WF_RENTAL | Active rentals; Handovers scheduled; Returns scheduled | completed_rentals, asset_utilisation, return_punctuality | 0 |
| vehicle_rentals | Corporate Rental | WF_RENTAL | Active rentals; Handovers scheduled; Returns scheduled | completed_rentals, asset_utilisation, return_punctuality | 0 |
| vehicle_rentals | Long-Term Rental | WF_RENTAL | Active rentals; Handovers scheduled; Returns scheduled | completed_rentals, asset_utilisation, return_punctuality | 0 |
| vehicle_rentals | Bike Rental | WF_RENTAL | Active rentals; Handovers scheduled; Returns scheduled | completed_rentals, asset_utilisation, return_punctuality | 1 |
| experiences | Concerts | WF_EVENT_SESSION | Confirmed admission places; Remaining admission places; Finalized attendance | tickets_confirmed, attendance, capacity_utilisation | 0 |
| experiences | Festivals | WF_EVENT_SESSION | Confirmed admission places; Remaining admission places; Finalized attendance | tickets_confirmed, attendance, capacity_utilisation | 0 |
| experiences | Conferences | WF_EVENT_SESSION | Confirmed admission places; Remaining admission places; Finalized attendance | tickets_confirmed, attendance, capacity_utilisation | 0 |
| experiences | Private Events | WF_REQUEST_QUOTE | Requests received; Requests needing response; Committed work in progress | qualified_requests, quote_acceptance, response_time | 0 |
| experiences | Photography | WF_APPOINTMENT | Appointments scheduled; Remaining appointment capacity; Appointments completed | completed_appointments, slot_utilisation, no_show_rate | 3 |
| experiences | Workshops | WF_GROUP_ACTIVITY | Confirmed activity bookings; Remaining participant places; Finalized attendance | session_bookings, attendance, capacity_utilisation | 2 |
| experiences | Classes | WF_GROUP_ACTIVITY | Confirmed activity bookings; Remaining participant places; Finalized attendance | session_bookings, attendance, capacity_utilisation | 3 |
| experiences | Sports Activities | WF_GROUP_ACTIVITY | Confirmed activity bookings; Remaining participant places; Finalized attendance | session_bookings, attendance, capacity_utilisation | 3 |
| experiences | Recreation | WF_GROUP_ACTIVITY | Confirmed activity bookings; Remaining participant places; Finalized attendance | session_bookings, attendance, capacity_utilisation | 2 |
| financial_services | Banking | WF_REGULATED_ENQUIRY | Enquiries received; Enquiries needing response; Provider handoffs confirmed | enquiries_received, response_time, provider_handoffs | 0 |
| financial_services | Forex | WF_REGULATED_ENQUIRY | Enquiries received; Enquiries needing response; Provider handoffs confirmed | enquiries_received, response_time, provider_handoffs | 0 |
| financial_services | Insurance | WF_REGULATED_ENQUIRY | Enquiries received; Enquiries needing response; Provider handoffs confirmed | enquiries_received, response_time, provider_handoffs | 0 |
| financial_services | Payments | WF_REGULATED_ENQUIRY | Enquiries received; Enquiries needing response; Provider handoffs confirmed | enquiries_received, response_time, provider_handoffs | 0 |
| financial_services | Remittance | WF_REGULATED_ENQUIRY | Enquiries received; Enquiries needing response; Provider handoffs confirmed | enquiries_received, response_time, provider_handoffs | 0 |
| financial_services | Sacco Services | WF_REGULATED_ENQUIRY | Enquiries received; Enquiries needing response; Provider handoffs confirmed | enquiries_received, response_time, provider_handoffs | 0 |
| financial_services | Business Services | WF_REGULATED_ENQUIRY | Enquiries received; Enquiries needing response; Provider handoffs confirmed | enquiries_received, response_time, provider_handoffs | 0 |
| flowers_gifts | Flowers | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 1 |
| flowers_gifts | Gift Hampers | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 1 |
| flowers_gifts | Cakes | WF_MADE_TO_ORDER | Custom orders to review; Custom completions due; Custom orders in production | completed_custom_orders, on_time_completion, approval_time | 1 |
| flowers_gifts | Chocolates | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| flowers_gifts | Personalized Gifts | WF_MADE_TO_ORDER | Custom orders to review; Custom completions due; Custom orders in production | completed_custom_orders, on_time_completion, approval_time | 0 |
| flowers_gifts | Occasion Gifts | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| restaurants_food | Restaurant | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 1 |
| restaurants_food | Fast Food | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| restaurants_food | Café | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| restaurants_food | Bakery | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 1 |
| restaurants_food | Desserts | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 1 |
| restaurants_food | Juice Bar | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| restaurants_food | Cloud Kitchen | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 1 |
| restaurants_food | Catering | WF_REQUEST_QUOTE | Requests received; Requests needing response; Committed work in progress | qualified_requests, quote_acceptance, response_time | 0 |
| groceries_essentials | Supermarket | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 1 |
| groceries_essentials | Convenience Store | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| groceries_essentials | Fresh Produce | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 1 |
| groceries_essentials | Butchery | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| groceries_essentials | Seafood | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| groceries_essentials | Organic Store | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| laundry_cleaning | Laundry | WF_PICKUP_RETURN | Collections scheduled; Cycles processing; Returns scheduled | completed_cycles, turnaround, collection_return_punctuality | 1 |
| laundry_cleaning | Dry Cleaning | WF_PICKUP_RETURN | Collections scheduled; Cycles processing; Returns scheduled | completed_cycles, turnaround, collection_return_punctuality | 1 |
| laundry_cleaning | Ironing | WF_PICKUP_RETURN | Collections scheduled; Cycles processing; Returns scheduled | completed_cycles, turnaround, collection_return_punctuality | 1 |
| laundry_cleaning | Home Cleaning | WF_FIELD_SERVICE | Visits scheduled; Visits needing assignment; Visits in progress | completed_visits, arrival_reliability, team_utilisation | 1 |
| laundry_cleaning | Office Cleaning | WF_FIELD_SERVICE | Visits scheduled; Visits needing assignment; Visits in progress | completed_visits, arrival_reliability, team_utilisation | 1 |
| marketplace | Home & Living | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| marketplace | Furniture | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 1 |
| marketplace | Appliances | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 1 |
| marketplace | Decor | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| marketplace | Kitchenware | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| marketplace | Books | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 1 |
| marketplace | Stationery | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| marketplace | Office Supplies | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| marketplace | General Retail | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| pharmacy | Pharmacy | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| pharmacy | Medical Supplies | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| pharmacy | Baby Products | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 1 |
| pharmacy | Supplements | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| health | Clinics | WF_APPOINTMENT | Appointments scheduled; Remaining appointment capacity; Appointments completed | completed_appointments, slot_utilisation, no_show_rate | 3 |
| health | Telemedicine | WF_REMOTE_SESSION | Remote sessions scheduled; Remaining session capacity; Remote sessions completed | completed_sessions, slot_utilisation, no_show_rate | 0 |
| health | Labs | WF_APPOINTMENT | Appointments scheduled; Remaining appointment capacity; Appointments completed | completed_appointments, slot_utilisation, no_show_rate | 1 |
| health | Mental Health (Therapy) | WF_APPOINTMENT | Appointments scheduled; Remaining appointment capacity; Appointments completed | completed_appointments, slot_utilisation, no_show_rate | 2 |
| health | Coaching | WF_APPOINTMENT | Appointments scheduled; Remaining appointment capacity; Appointments completed | completed_appointments, slot_utilisation, no_show_rate | 3 |
| tech_electronics | Smartphones | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 2 |
| tech_electronics | Accessories | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| tech_electronics | Computers | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 1 |
| tech_electronics | Gaming | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| tech_electronics | Audio | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 0 |
| tech_electronics | Telecom Services | WF_SERVICE_JOB | Jobs needing intake review; Jobs in service; Jobs ready for release | completed_jobs, job_turnaround, rework_rate | 2 |
| tech_electronics | Smart Devices | WF_ORDER | Orders confirmed; Orders in progress; Orders completed | completed_orders, fulfilment_time, order_value | 1 |
| travel_tours | Safaris | WF_TOUR | Confirmed departures; Confirmed tour places; Tours in progress | confirmed_departures, occupied_places, booking_lead_time | 0 |
| travel_tours | Game Drives | WF_TOUR | Confirmed departures; Confirmed tour places; Tours in progress | confirmed_departures, occupied_places, booking_lead_time | 0 |
| travel_tours | Luxury Safaris | WF_TOUR | Confirmed departures; Confirmed tour places; Tours in progress | confirmed_departures, occupied_places, booking_lead_time | 0 |
| travel_tours | City Tours | WF_TOUR | Confirmed departures; Confirmed tour places; Tours in progress | confirmed_departures, occupied_places, booking_lead_time | 0 |
| travel_tours | Cultural Tours | WF_TOUR | Confirmed departures; Confirmed tour places; Tours in progress | confirmed_departures, occupied_places, booking_lead_time | 0 |
| travel_tours | Adventure Tours | WF_TOUR | Confirmed departures; Confirmed tour places; Tours in progress | confirmed_departures, occupied_places, booking_lead_time | 0 |
| travel_tours | Travel Packages | WF_REQUEST_QUOTE | Requests received; Requests needing response; Committed work in progress | qualified_requests, quote_acceptance, response_time | 0 |
| vehicle_services | Car Wash | WF_SERVICE_JOB | Jobs needing intake review; Jobs in service; Jobs ready for release | completed_jobs, job_turnaround, rework_rate | 2 |
| vehicle_services | Tire Service | WF_SERVICE_JOB | Jobs needing intake review; Jobs in service; Jobs ready for release | completed_jobs, job_turnaround, rework_rate | 2 |
| vehicle_services | Battery Service | WF_FIELD_SERVICE | Visits scheduled; Visits needing assignment; Visits in progress | completed_visits, arrival_reliability, team_utilisation | 3 |
| vehicle_services | Vehicle Assistance | WF_FIELD_SERVICE | Visits scheduled; Visits needing assignment; Visits in progress | completed_visits, arrival_reliability, team_utilisation | 0 |
| vehicle_services | Vehicle Inspection | WF_APPOINTMENT | Appointments scheduled; Remaining appointment capacity; Appointments completed | completed_appointments, slot_utilisation, no_show_rate | 1 |
| wellness | Spa | WF_APPOINTMENT | Appointments scheduled; Remaining appointment capacity; Appointments completed | completed_appointments, slot_utilisation, no_show_rate | 2 |
| wellness | Massage | WF_APPOINTMENT | Appointments scheduled; Remaining appointment capacity; Appointments completed | completed_appointments, slot_utilisation, no_show_rate | 1 |
| wellness | Gym | WF_MEMBERSHIP | Active entitlements; Entitlements due for renewal; Renewals confirmed | active_memberships, renewals | 1 |
| wellness | Personal Training | WF_APPOINTMENT | Appointments scheduled; Remaining appointment capacity; Appointments completed | completed_appointments, slot_utilisation, no_show_rate | 4 |
| concierge_services | Reservations | WF_REQUEST_QUOTE | Requests received; Requests needing response; Committed work in progress | qualified_requests, quote_acceptance, response_time | 0 |
| concierge_services | Personal Assistance | WF_REQUEST_QUOTE | Requests received; Requests needing response; Committed work in progress | qualified_requests, quote_acceptance, response_time | 0 |
| concierge_services | Shopping Assistance | WF_REQUEST_QUOTE | Requests received; Requests needing response; Committed work in progress | qualified_requests, quote_acceptance, response_time | 0 |
| concierge_services | Gift Sourcing | WF_REQUEST_QUOTE | Requests received; Requests needing response; Committed work in progress | qualified_requests, quote_acceptance, response_time | 0 |
| concierge_services | Travel Planning | WF_REQUEST_QUOTE | Requests received; Requests needing response; Committed work in progress | qualified_requests, quote_acceptance, response_time | 0 |
| concierge_services | Property Coordination | WF_REQUEST_QUOTE | Requests received; Requests needing response; Committed work in progress | qualified_requests, quote_acceptance, response_time | 0 |
| concierge_services | Moving Assistance | WF_REQUEST_QUOTE | Requests received; Requests needing response; Committed work in progress | qualified_requests, quote_acceptance, response_time | 0 |
| concierge_services | Cleaning Coordination | WF_REQUEST_QUOTE | Requests received; Requests needing response; Committed work in progress | qualified_requests, quote_acceptance, response_time | 1 |
| concierge_services | VIP Assistance | WF_REQUEST_QUOTE | Requests received; Requests needing response; Committed work in progress | qualified_requests, quote_acceptance, response_time | 2 |
| logistics_shipping | Sea Freight | WF_FREIGHT | Carrier-booked shipments; Shipments in progress; Shipment milestones scheduled | accepted_shipments, milestone_punctuality, capacity_utilisation | 0 |
| logistics_shipping | Air Freight | WF_FREIGHT | Carrier-booked shipments; Shipments in progress; Shipment milestones scheduled | accepted_shipments, milestone_punctuality, capacity_utilisation | 0 |
| logistics_shipping | Road Freight & Trucking | WF_FREIGHT | Carrier-booked shipments; Shipments in progress; Shipment milestones scheduled | accepted_shipments, milestone_punctuality, capacity_utilisation | 0 |
| logistics_shipping | Warehousing & Storage | WF_STORAGE | Occupied storage capacity; Storage intakes scheduled; Custody operations confirmed | occupied_space, inbound_outbound_completion, contract_renewals | 0 |

See profiles-128.json for all bindings, predicates, optional modules, exclusions, setup requirements and conditional replacements/additions. The existing profile rationale remains authoritative for specialty-specific limitations.
