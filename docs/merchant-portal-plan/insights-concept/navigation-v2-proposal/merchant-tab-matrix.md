# Proposed merchant tabs for Insights

Status: PROPOSED_FOR_REVIEW. This is a new navigation proposal for review before changes. Existing Insights files remain unchanged. The source inventory supplies 128 baseline profiles and 21 additional specialty/offering/model routes; it does not approve this proposed navigation.

## Peer navigation

Overview, applicable business-specific tabs and Reports sit beside each other inside Insights. Reports is a peer destination for the authorized report catalogue, saved views, detailed tables and supported exports. It reuses the same metric registry, filters, queries, definitions and permissions. It is not a second reporting engine.

The stable order is: Overview, Orders, Appointments, Rentals, Transfers, Visits, Bookings, Quotes, Production, Jobs, Collections, Shipments, Storage, Passes, Menu, Products, Services, Fleet, Experiences, Spaces, Capacity, Staff, Customers, Operations, Reviews, Promotions, Finance, Reports.

This list is a registry of possible peers, not the tab row shown to every merchant. Actual selected offerings, configured activities, exact workflow guards, access and evidence determine which peers are admitted. Applicable peers with missing evidence use honest unavailable, partial or no-history states.

## Exact model-to-tab rules

| Actual model | Work peer | Explicit model segment | Offering presentation candidates |
| --- | --- | --- | --- |
| `ORDER` | Orders | Not required | Menu, Products |
| `APPOINTMENT` | Appointments | Not required | Services |
| `ASSET_INTERVAL` | Rentals | Not required | Fleet |
| `TRANSFER` | Transfers | Not required | Services |
| `FIELD_VISIT` | Visits | Not required | Services |
| `SESSION_CAPACITY` | Bookings | SESSION_CAPACITY / Sessions | Services, Experiences |
| `SPACE_RESERVATION` | Bookings | SPACE_RESERVATION / Spaces | Spaces |
| `TOUR` | Bookings | TOUR / Tours | Experiences |
| `REQUEST_QUOTE` | Quotes | Not required | Services, Products, Experiences |
| `PRODUCTION_DUE` | Production | Not required | Products, Services |
| `SERVICE_JOB` | Jobs | Not required | Services |
| `LINKED_WINDOWS` | Collections | Not required | Services |
| `FREIGHT` | Shipments | Not required | Services |
| `STORAGE` | Storage | Not required | Services, Spaces |
| `ENTITLEMENT` | Passes | Not required | Products, Services, Experiences |

Bookings is one peer with separate Sessions, Spaces and Tours model segments. Each segment retains its own workflow, unit, date basis and capacity measure. An event-space reservation is not a tour place, and neither becomes an accommodation stay.

Offering presentation is selected from the actual registered offering kind plus compatible merchant terminology. Each offering resolves to one presentation. A restaurant with actual food and retail offerings can have Menu and Products. Two configured labels do not duplicate one offering. Vehicle/bike rental inventory can use Fleet; a future non-vehicle asset presentation still requires a supported actual route.

- `ORDER`: Resolve Menu for an actual menu/food offering and Products for an actual retail offering. Merchant terminology cannot turn every order into a food menu.
- `APPOINTMENT`: Use Services for the actual appointment service, preserving onsite/remote distinctions.
- `ASSET_INTERVAL`: Use Fleet for the actual configured vehicle/bike inventory in current routes. A non-vehicle asset presentation would require a separately supported actual offering route; it is not added by this matrix.
- `TRANSFER`: Use Services for actual transfer or greeting offerings; a greeter-only service is not a vehicle rental.
- `FIELD_VISIT`: Use Services for the actual field-visit offering.
- `SESSION_CAPACITY`: Resolve Services for a configured class/training service or Experiences for an actual activity/event presentation. Use the actual template and compatible merchant terminology.
- `SPACE_RESERVATION`: Use Spaces for actual controlled tables or event-space offerings. This does not include an accommodation extension.
- `TOUR`: Use Experiences for actual tour/departure offerings. Supplier inclusions are not controlled accommodation inventory.
- `REQUEST_QUOTE`: Resolve the actual enquiry/sourcing offering presentation: Services for coordination/enquiry, Products for a specifically configured product-sourcing presentation, or Experiences for a travel/experience request. The quote itself does not activate the requested downstream model.
- `PRODUCTION_DUE`: Resolve Products for an actual made-to-order good or Services for an actual production/alteration service. Keep the accepted specification and due promise.
- `SERVICE_JOB`: Use Services for the actual repair/assessment/job offering; a linked intake appointment remains distinct.
- `LINKED_WINDOWS`: Use Services for an actual collection/processing/return offering; the linked legs do not create duplicate catalogue items.
- `FREIGHT`: Use Services for the actual freight offering; shipment, leg, weight and volume stay separate.
- `STORAGE`: Use Services for a goods-storage service or Spaces for explicitly configured actual storage-unit inventory presentation. A unit is not automatically a hotel room.
- `ENTITLEMENT`: Resolve the actual plan/access catalogue presentation. Product allocation rights, service plans and experience passes remain distinct. A pass is not an attended session or a recurring-order assumption.

Row candidates are also narrowed by actual source template IDs. For example, medicine and apparel orders list Products rather than Menu. Menu remains a candidate for compatible prepared-food/drink templates only when a real configured menu presentation exists. Source-specified product plans, class passes, product sourcing and made-to-order goods keep their distinct offering presentations. These are proposed presentation hints; a future unknown template needs its own compatible mapping.

## Applicability, access and sources

| Gate | Admission rule |
| --- | --- |
| ACTUAL_ACTIVITY | Resolve the selected actual offering, location, configured model and allowed intake method through existing effective profile guards. Candidate models and category identity do not activate tabs. |
| REPORT_ACCESS | The reporting owner rechecks merchant, location, report, field and drill-down permissions on every read, saved view and export. These are capability checks, not new role grants. |
| SOURCE_EVIDENCE | A metric needs its registered definition/version, real source owner/events, units, date basis and coverage. Missing evidence renders an unavailable/partial/no-history metric where the tab is applicable; it is not zero. No source gate silently enables an unrelated activity. |
| OFFERING_PRESENTATION | Resolve a compatible offering presentation from the actual registered template/kind and configured merchant terminology. The proposed presentation resolver is not a new runtime source or arbitrary executable rule. |
| ACTUAL_RESOURCES | Capacity needs actually controlled resource/typed-capacity accounting and availability evidence. Staff needs actual scoped provider/staff identities and permitted assignment, schedule or work-time source evidence, plus staff-dimension/report grants and applicable privacy rules. Model candidates, category identity and declared headcount alone enable neither peer. |
| IDENTITY_PRIVACY | Customers and repeat measures need permitted merchant-scoped identifiers and purpose/consent/suppression contracts. No raw private intake, clinical data or financial profiles enter reports. |
| PUBLISHED_FEEDBACK | Reviews use actual published feedback evidence and applicable suppression/read grants; requests for reviews are not published reviews. |
| CAMPAIGN_EVIDENCE | Promotions requires actual campaign scope and permitted delivery evidence. Attributed outcomes separately require a defined model/window and complete observation. |
| FINANCIAL_ACCESS | Finance needs explicit financial-report grants and authoritative Finance-owned posting definitions. Payment, refund, settlement and payout permissions remain independent; currencies do not merge. |
| CATALOG_ACCESS | Reports is a peer destination for the authorized report catalogue even when some reports lack evidence. Saved views, detailed tables and exports reuse the same definitions, filters, evidence and access checks. Unsupported actions remain unavailable. |

Capacity, Staff, Customers, Operations, Reviews, Promotions and Finance are conditional shared peers. Candidate matrix rows name them for evaluation, rather than enabling them for every merchant. Reports stays a peer for the authorized catalogue; a missing report source affects the particular report and never creates a fabricated chart.

## Capacity and staff presentation

The canonical capacity key stays `capacity`. Its display label can be Departures when the actual selected resource scope is dated TOUR departures, or Sessions when it is actual SESSION_CAPACITY occurrences. A hybrid resource scope keeps Capacity with explicit model/resource segments and separate units. These labels follow actual evidence, not model candidacy.

A pure mobility merchant uses Fleet for rental asset utilization. Suppress a separate Capacity peer by default when it would repeat the same assets, intervals, definition and question. An explicitly useful mixed-resource Capacity report can appear for a hybrid with the necessary source evidence and grants.

SPACE_RESERVATION uses Spaces for actual offering inventory and Capacity for a distinct useful capacity question. Neither presentation implies hotels, room-night inventory or lodging Occupancy. Staff needs actual scoped provider/staff identities plus permitted assignment, schedule or work-time evidence, report grants and privacy rules. A model alone never enables Staff.

## Hybrid deduplication

- Union admitted tab keys across selected enabled activities and render each canonical key once in stablePeerOrder.
- Deduplicate sessions, spaces and tours into one Bookings peer. Show only admitted segments keyed SESSION_CAPACITY, SPACE_RESERVATION and TOUR. Retain per-segment units, workflow, date basis and metric definitions; do not create one combined booking conversion or capacity ratio.
- Resolve one compatible presentation per actual catalogue offering. Menu and Products may both exist when actual distinct offering kinds justify them; they are alternatives for one offering, not duplicate views of that offering. Across models, one canonical offering tab groups model/type segments.
- Within an offering tab deduplicate the same actual offering ID at its proper location/version scope. Multi-model routes remain available as labelled segments; accepted historical variants/specifications keep their own evidence identity.
- One canonical Capacity peer and one Staff peer reuse actual resource identities. Capacity can display Departures for actual dated TOUR resources or Sessions for actual SESSION_CAPACITY occurrence resources. Pure mobility uses Fleet for rental asset utilization and suppresses a duplicate Capacity peer for the same assets/question; an explicit useful mixed-resource capacity report can appear for a hybrid. SPACE_RESERVATION uses Spaces/Capacity without hotel, room-night or lodging Occupancy assumptions. Staff requires actual scoped provider/staff evidence and grants. Shared pools are not counted once per offering or model; interval and unit definitions remain explicit.
- Customers, Operations, Reviews, Promotions, Finance and Reports each appear once when admitted. Retain model-specific measures and independent privacy/finance grants instead of blending incompatible units or access.

## All 128 baseline profiles

Every row below has status PROPOSED_FOR_REVIEW. Work peers come only from the preserved baseline model candidates. Offering names are alternatives resolved from the actual kind and configured terminology. Each row also evaluates the conditional shared peers above and includes Overview and Reports as authorized peer destinations. The structured [matrix](merchant-tab-matrix.json) preserves exact rule/guard/workflow references and lists source additions separately.

### Adults Only

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Adult Products (`adult_products`) | ORDER | Orders | Products | None |
| Adult Wellness (`adult_wellness`) | APPOINTMENT, FIELD_VISIT, ORDER | Orders, Appointments, Visits | Products, Services | None |
| Cigarettes (`cigarettes`) | ORDER | Orders | Products | None |
| Cigars (`cigars`) | ORDER | Orders | Products | None |
| Vapes (`vapes`) | ORDER | Orders | Products | None |
| Adult Accessories (`adult_accessories`) | ORDER | Orders | Products | None |

### Airport Transfers

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Airport Pickup (`airport_pickup`) | TRANSFER | Transfers | Services | None |
| Airport Drop-off (`airport_dropoff`) | TRANSFER | Transfers | Services | None |
| Meet & Greet (`meet_greet`) | TRANSFER | Transfers | Services | None |
| Executive Transfer (`executive_transfer`) | TRANSFER | Transfers | Services | None |

### Alcohol & Beverages

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Wine (`wine`) | ORDER | Orders | Products | None |
| Spirits (`spirits`) | ORDER | Orders | Products | None |
| Beer (`beer`) | ORDER | Orders | Products | None |
| Champagne (`champagne`) | ORDER | Orders | Products | None |
| Cocktail Mixers (`cocktail_mixers`) | ORDER | Orders | Menu, Products | None |
| Liquor Stores (`liquor_stores`) | ORDER | Orders | Menu, Products | None |

### Fashion & Apparel

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Men's Fashion (`mens_fashion`) | APPOINTMENT, ORDER, PRODUCTION_DUE | Orders, Appointments, Production | Products, Services | None |
| Women's Fashion (`womens_fashion`) | APPOINTMENT, ORDER, PRODUCTION_DUE | Orders, Appointments, Production | Products, Services | None |
| Kids Fashion (`kids_fashion`) | ORDER | Orders | Products | None |
| Shoes (`shoes`) | ORDER | Orders | Products | None |
| Bags (`bags`) | ORDER | Orders | Products | None |
| Watches (`watches`) | ORDER | Orders | Products | None |
| Accessories (`accessories`) | ORDER | Orders | Products | None |

### Beauty

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Makeup (`makeup`) | APPOINTMENT, FIELD_VISIT, ORDER | Orders, Appointments, Visits | Products, Services | None |
| Skincare (`skincare`) | APPOINTMENT, FIELD_VISIT, ORDER | Orders, Appointments, Visits | Products, Services | None |
| Haircare (`haircare`) | APPOINTMENT, FIELD_VISIT, ORDER | Orders, Appointments, Visits | Products, Services | None |
| Fragrances (`fragrances`) | ORDER | Orders | Products | None |
| Cosmetics Stores (`cosmetics_stores`) | ORDER | Orders | Products | None |

### Vehicle Rentals

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Car Rental (`car_rental`) | ASSET_INTERVAL | Rentals | Fleet | None |
| Self Drive (`self_drive`) | ASSET_INTERVAL | Rentals | Fleet | None |
| Corporate Rental (`corporate_rental`) | ASSET_INTERVAL | Rentals | Fleet | None |
| Long-Term Rental (`long_term_rental`) | ASSET_INTERVAL | Rentals | Fleet | None |
| Bike Rental (`bike_rental`) | ASSET_INTERVAL | Rentals | Fleet | None |

### Experiences

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Concerts (`concerts`) | SESSION_CAPACITY | Bookings | Experiences | None |
| Festivals (`festivals`) | SESSION_CAPACITY | Bookings | Experiences | IN_EXT_01 |
| Conferences (`conferences`) | SESSION_CAPACITY | Bookings | Experiences | IN_EXT_02 |
| Private Events (`private_events`) | REQUEST_QUOTE | Quotes | Services, Experiences | IN_EXT_03, IN_EXT_04, IN_EXT_05 |
| Photography (`photography`) | APPOINTMENT, FIELD_VISIT | Appointments, Visits | Services | None |
| Workshops (`workshops`) | SESSION_CAPACITY | Bookings | Services, Experiences | IN_EXT_06 |
| Classes (`classes`) | ENTITLEMENT, SESSION_CAPACITY | Bookings, Passes | Services, Experiences | None |
| Sports Activities (`sports_activities`) | ENTITLEMENT, SESSION_CAPACITY | Bookings, Passes | Services, Experiences | None |
| Recreation (`recreation`) | SESSION_CAPACITY | Bookings | Experiences | IN_EXT_07 |

### Financial Services

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Banking (`banking`) | APPOINTMENT, REQUEST_QUOTE | Appointments, Quotes | Services | None |
| Forex (`forex`) | APPOINTMENT, REQUEST_QUOTE | Appointments, Quotes | Services | None |
| Insurance (`insurance`) | APPOINTMENT, REQUEST_QUOTE | Appointments, Quotes | Services | None |
| Payments (`payments`) | APPOINTMENT, REQUEST_QUOTE | Appointments, Quotes | Services | None |
| Remittance (`remittance`) | APPOINTMENT, REQUEST_QUOTE | Appointments, Quotes | Services | None |
| Sacco Services (`sacco_services`) | APPOINTMENT, REQUEST_QUOTE | Appointments, Quotes | Services | None |
| Business Services (`business_services`) | APPOINTMENT, REQUEST_QUOTE | Appointments, Quotes | Services | None |

### Flowers & Gifts

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Flowers (`flowers`) | ENTITLEMENT, ORDER | Orders, Passes | Products | None |
| Gift Hampers (`gift_hampers`) | ORDER, PRODUCTION_DUE | Orders, Production | Products | None |
| Cakes (`cakes`) | PRODUCTION_DUE | Production | Products | IN_EXT_08 |
| Chocolates (`chocolates`) | ORDER | Orders | Products | None |
| Personalized Gifts (`personalized_gifts`) | PRODUCTION_DUE | Production | Products | None |
| Occasion Gifts (`occasion_gifts`) | ORDER | Orders | Products | None |

### Restaurants & Food

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Restaurant (`restaurant`) | ORDER, SPACE_RESERVATION | Orders, Bookings | Menu, Products, Spaces | IN_EXT_09 |
| Fast Food (`fast_food`) | ORDER | Orders | Menu, Products | None |
| CafÃƒÂ© (`cafe`) | ORDER | Orders | Menu, Products | None |
| Bakery (`bakery`) | ORDER, PRODUCTION_DUE | Orders, Production | Menu, Products | None |
| Desserts (`desserts`) | ORDER, PRODUCTION_DUE | Orders, Production | Menu, Products | None |
| Juice Bar (`juice_bar`) | ORDER | Orders | Menu, Products | None |
| Cloud Kitchen (`cloud_kitchen`) | ORDER | Orders | Menu, Products | None |
| Catering (`catering`) | REQUEST_QUOTE | Quotes | Services | None |

### Groceries & Essentials

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Supermarket (`supermarket`) | ORDER | Orders | Products | None |
| Convenience Store (`convenience_store`) | ORDER | Orders | Menu, Products | None |
| Fresh Produce (`fresh_produce`) | ENTITLEMENT, ORDER | Orders, Passes | Products | None |
| Butchery (`butchery`) | ORDER | Orders | Products | None |
| Seafood (`seafood`) | ORDER | Orders | Products | None |
| Organic Store (`organic_store`) | ORDER | Orders | Products | None |

### Laundry & Cleaning

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Laundry (`laundry`) | LINKED_WINDOWS | Collections | Services | None |
| Dry Cleaning (`dry_cleaning`) | LINKED_WINDOWS | Collections | Services | None |
| Ironing (`ironing`) | LINKED_WINDOWS | Collections | Services | None |
| Home Cleaning (`home_cleaning`) | ENTITLEMENT, FIELD_VISIT | Visits, Passes | Services | None |
| Office Cleaning (`office_cleaning`) | ENTITLEMENT, FIELD_VISIT | Visits, Passes | Services | None |

### Marketplace

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Home & Living (`home_living`) | ORDER | Orders | Products | None |
| Furniture (`furniture`) | FIELD_VISIT, ORDER | Orders, Visits | Products, Services | None |
| Appliances (`appliances`) | FIELD_VISIT, ORDER | Orders, Visits | Products, Services | None |
| Decor (`decor`) | ORDER | Orders | Products | None |
| Kitchenware (`kitchenware`) | ORDER | Orders | Products | None |
| Books (`books`) | ORDER, PRODUCTION_DUE, REQUEST_QUOTE | Orders, Quotes, Production | Products, Services | None |
| Stationery (`stationery`) | ORDER | Orders | Products | IN_EXT_10 |
| Office Supplies (`office_supplies`) | ORDER | Orders | Products | None |
| General Retail (`general_retail`) | ORDER | Orders | Products | None |

### Pharmacy

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Pharmacy (`pharmacy_retail`) | ORDER | Orders | Products | None |
| Medical Supplies (`medical_supplies`) | ORDER | Orders | Products | None |
| Baby Products (`baby_products`) | ENTITLEMENT, ORDER | Orders, Passes | Products | None |
| Supplements (`supplements`) | ORDER | Orders | Products | None |

### Health

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Clinics (`clinics`) | APPOINTMENT, FIELD_VISIT | Appointments, Visits | Services | None |
| Telemedicine (`telemedicine`) | APPOINTMENT | Appointments | Services | None |
| Labs (`labs`) | APPOINTMENT, FIELD_VISIT | Appointments, Visits | Services | None |
| Mental Health (Therapy) (`mental_health`) | APPOINTMENT | Appointments | Services | None |
| Coaching (`coaching`) | APPOINTMENT, SESSION_CAPACITY | Appointments, Bookings | Services, Experiences | IN_EXT_11 |

### Tech & Electronics

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Smartphones (`smartphones`) | ORDER, SERVICE_JOB | Orders, Jobs | Products, Services | None |
| Accessories (`tech_accessories`) | ORDER | Orders | Products | None |
| Computers (`computers`) | ORDER, SERVICE_JOB | Orders, Jobs | Products, Services | None |
| Gaming (`gaming`) | ORDER | Orders | Products | None |
| Audio (`audio`) | ORDER | Orders | Products | None |
| Telecom Services (`telecom_services`) | ORDER, SERVICE_JOB | Orders, Jobs | Products, Services | None |
| Smart Devices (`smart_devices`) | FIELD_VISIT, ORDER | Orders, Visits | Products, Services | None |

### Travel & Tours

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Safaris (`safaris`) | TOUR | Bookings | Experiences | None |
| Game Drives (`game_drives`) | TOUR | Bookings | Experiences | None |
| Luxury Safaris (`luxury_safaris`) | TOUR | Bookings | Experiences | None |
| City Tours (`city_tours`) | TOUR | Bookings | Experiences | None |
| Cultural Tours (`cultural_tours`) | TOUR | Bookings | Experiences | None |
| Adventure Tours (`adventure_tours`) | TOUR | Bookings | Experiences | None |
| Travel Packages (`travel_packages`) | REQUEST_QUOTE | Quotes | Services, Experiences | IN_EXT_12, IN_EXT_13 |

### Vehicle Services

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Car Wash (`car_wash`) | ENTITLEMENT, FIELD_VISIT, SERVICE_JOB | Visits, Jobs, Passes | Services | None |
| Tire Service (`tire_service`) | FIELD_VISIT, SERVICE_JOB | Visits, Jobs | Services | IN_EXT_14 |
| Battery Service (`battery_service`) | FIELD_VISIT, SERVICE_JOB | Visits, Jobs | Services | IN_EXT_15 |
| Vehicle Assistance (`vehicle_assistance`) | FIELD_VISIT | Visits | Services | None |
| Vehicle Inspection (`vehicle_inspection`) | APPOINTMENT, FIELD_VISIT | Appointments, Visits | Services | None |

### Wellness

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Spa (`spa`) | APPOINTMENT, ENTITLEMENT, FIELD_VISIT | Appointments, Visits, Passes | Services | IN_EXT_16 |
| Massage (`massage`) | APPOINTMENT, FIELD_VISIT | Appointments, Visits | Services | IN_EXT_17 |
| Gym (`gym`) | APPOINTMENT, ENTITLEMENT | Appointments, Passes | Services | IN_EXT_18, IN_EXT_19 |
| Personal Training (`personal_training`) | APPOINTMENT, FIELD_VISIT, SESSION_CAPACITY | Appointments, Visits, Bookings | Services, Experiences | IN_EXT_20 |

### App Services

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Reservations (`reservations`) | FIELD_VISIT, REQUEST_QUOTE | Visits, Quotes | Services, Experiences | None |
| Personal Assistance (`personal_assistance`) | ENTITLEMENT, FIELD_VISIT, REQUEST_QUOTE | Visits, Quotes, Passes | Services | None |
| Shopping Assistance (`shopping_assistance`) | FIELD_VISIT, REQUEST_QUOTE | Visits, Quotes | Products, Services | None |
| Gift Sourcing (`gift_sourcing`) | FIELD_VISIT, REQUEST_QUOTE | Visits, Quotes | Products, Services | None |
| Travel Planning (`travel_planning`) | FIELD_VISIT, REQUEST_QUOTE | Visits, Quotes | Services, Experiences | None |
| Property Coordination (`property_coordination`) | FIELD_VISIT, REQUEST_QUOTE | Visits, Quotes | Services | None |
| Moving Assistance (`moving_assistance`) | FIELD_VISIT, REQUEST_QUOTE | Visits, Quotes | Services | IN_EXT_21 |
| Cleaning Coordination (`cleaning_coordination`) | ENTITLEMENT, FIELD_VISIT, REQUEST_QUOTE | Visits, Quotes, Passes | Services | None |
| VIP Assistance (`vip_assistance`) | ENTITLEMENT, FIELD_VISIT, REQUEST_QUOTE | Visits, Quotes, Passes | Services | None |

### Logistics & Shipping

| Subcategory | Baseline model candidates | Candidate work peers | Offering presentation candidates | Prior source addition refs |
| --- | --- | --- | --- | --- |
| Sea Freight (`sea_freight`) | FREIGHT | Shipments | Services | None |
| Air Freight (`air_freight`) | FREIGHT | Shipments | Services | None |
| Road Freight & Trucking (`road_freight`) | FREIGHT | Shipments | Services | None |
| Warehousing & Storage (`warehousing`) | STORAGE | Storage | Services, Spaces | None |

## The 21 additional source routes

Each proposed mapping below is restricted to its exact specialty/template/model tuple. It preserves the baseline. Prior source inclusion does not approve the new tab arrangement. Every row has status PROPOSED_FOR_REVIEW.

| Source route | Subcategory | Actual offering template | Model | Candidate peer and segment | Offering presentation candidates |
| --- | --- | --- | --- | --- | --- |
| IN_EXT_01 | festivals | session_pass | ENTITLEMENT | Passes | Services, Experiences |
| IN_EXT_02 | conferences | event_space | SPACE_RESERVATION | Bookings / SPACE_RESERVATION | Spaces |
| IN_EXT_03 | private_events | event_space | SPACE_RESERVATION | Bookings / SPACE_RESERVATION | Spaces |
| IN_EXT_04 | private_events | photography | APPOINTMENT | Appointments | Services |
| IN_EXT_05 | private_events | photography | FIELD_VISIT | Visits | Services |
| IN_EXT_06 | workshops | session_pass | ENTITLEMENT | Passes | Services, Experiences |
| IN_EXT_07 | recreation | session_pass | ENTITLEMENT | Passes | Services, Experiences |
| IN_EXT_08 | cakes | ready_cake | ORDER | Orders | Menu, Products |
| IN_EXT_09 | restaurant | catering | REQUEST_QUOTE | Quotes | Services |
| IN_EXT_10 | stationery | personalized_gift | PRODUCTION_DUE | Production | Products |
| IN_EXT_11 | coaching | session_pass | ENTITLEMENT | Passes | Services, Experiences |
| IN_EXT_12 | travel_packages | safari | TOUR | Bookings / TOUR | Experiences |
| IN_EXT_13 | travel_packages | city_tour | TOUR | Bookings / TOUR | Experiences |
| IN_EXT_14 | tire_service | tire_product | ORDER | Orders | Products |
| IN_EXT_15 | battery_service | battery_product | ORDER | Orders | Products |
| IN_EXT_16 | spa | personal_care | ORDER | Orders | Products |
| IN_EXT_17 | massage | personal_care | ORDER | Orders | Products |
| IN_EXT_18 | gym | training | FIELD_VISIT | Visits | Services |
| IN_EXT_19 | gym | class | SESSION_CAPACITY | Bookings / SESSION_CAPACITY | Services, Experiences |
| IN_EXT_20 | personal_training | session_pass | ENTITLEMENT | Passes | Services, Experiences |
| IN_EXT_21 | moving_assistance | road_freight | FREIGHT | Shipments | Services |

## Presentation presets and reference limits

Business-specific presentation presets can suggest familiar labels and emphasis inspired by the supplied reference images. The actual configured offering model remains authoritative for applicability. No preset activates all candidate tabs, creates a business capability or replaces grants.

Accommodation remains a reference-only proposed capability extension. This proposal adds no lodging model, room-night metric, stay inventory or hotel route to the current merchant coverage.

## Static count verification

Independent checks passed for 21 categories, 128 exact baseline profile IDs, 193 baseline candidate-model bindings and 21 exact additional specialty/template/model tuples across 17 specialties. The 15 actual models map to 13 model-work peer keys. Six offering presentation keys and the shared peers produce 28 unique stable candidate keys.

Every baseline candidate list begins with Overview and ends with Reports after deduplication. Source hashes, exact model rules, gates and per-row references are recorded in the JSON. These checks prove proposal mapping coverage only. They do not prove approved navigation, a runtime resolver, source instrumentation, calculation accuracy, permissions or interaction behavior.
