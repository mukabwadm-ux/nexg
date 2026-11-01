# Settings coverage for every category and subcategory

Status: planned design, 1 November 2026. Runtime activation is false. This map covers **21 categories, 128 subcategories, six shared settings groups, 15 possible operational models and 21 separately approved offering/model additions across 17 subcategories**. It retains 390 specialty/offering mappings and 411 exact offering/model routes.

[coverage.json](coverage.json) is the structured companion. It records source SHA-256 values, exact source JSON pointers, raw default guards, raw alternative bindings and rules, original model/workflow/intake references, and the approved offering-specific additions. No source registry was changed. The source profile has an encoding error in the `cafe` label; the merchant label uses canonical taxonomy “Café”, while `sourceProfileName` preserves the original source spelling in JSON.

## What coverage means

Coverage means each named current subcategory has a reviewed place in this Settings composition. It does not mean every candidate model is enabled, a provider supports every function, messages are delivered, the resolver is implemented or the screen is tested. Candidate models describe possibilities. The actual selected configured offering/method, supported event/operation, independent source owner and current actor grant decide which conditional settings appear.

Business owns business activities, operating answers, locations, documents and team scopes. Offerings, Availability, Work and Money retain their respective operational rules. Settings links to those scoped records; it does not introduce competing values. Personal account controls and preferences keep their own identity scope.

The default profile enablement guard applies to its default model. Alternative bindings keep their own predicates and model-selection rules. Never attach the default-model equality to every alternative. The approved additions retain their offering-specific workflow and intake references instead of inheriting a generic illustration. Missing answers remain unresolved. The raw source rules are evidence and references, not a second condition evaluator.

## Shared groups

| Group ID | Merchant label | Scope and boundary |
| --- | --- | --- |
| ACCOUNT_SECURITY | Account & security | Use the approved identity owner; business identity and team grants link to Business. Unsupported identity-provider controls remain unavailable. |
| NOTIFICATIONS | Notifications | A saved preference does not prove delivery. Business routing and mandatory notice exceptions require approved policy and scoped authority. |
| PREFERENCES | Preferences | Africa/Nairobi is fixed for Kenya merchant operations. No operational timezone or transaction-currency picker. Keep local dates and historical instants unchanged. |
| CONNECTIONS | Connections | No global ERP owner. Never duplicate Business operational answers or Availability rules. A working read is not proof of supported write. |
| API_WEBHOOKS | API & webhooks | Hide unauthorized destinations and search metadata. Actors explicitly allowed to discover the section may see an honest unsupported-capability explanation with no working editor. Supported controls still require capability, grant and current-state checks. Secrets never appear in ordinary fields, imagery or audit payloads. |
| DATA_PRIVACY | Data & privacy | No invented retention durations or automatic history erasure. Apply document, team, financial and private-intake restrictions. |

Groups describe the stable structure, not a promise that every control is supported. Unauthorized destinations and search metadata remain hidden. An actor explicitly allowed to discover a section may see an honest unavailable explanation when its capability is unsupported, with no working editor. All enabled groups explain current scope and save each permitted change independently.

## Conditional concerns by actual operational model

Each row below concerns supported alerts, connected-data authority or mapping. It does not move operational setup into Settings. Alert topics are proposed labels pending binding to real approved event contracts. Data classes are possible requirements, resolved only when the actual function is applicable.

| Model | Merchant activity | Possible additional connected data classes | Authority/mapping concerns |
| --- | --- | --- | --- |
| ORDER | Orders | stock, fulfillment | Product and variant identifiers; Exact quantity/unit and stock location; Price owner and supported fulfilment state |
| APPOINTMENT | Appointments | resources, availability, reservations | Service and provider identifiers; Exact duration and resource eligibility; Onsite/remote method and identity-safe calendar summary |
| FIELD_VISIT | Visits | resources, availability, reservations, service_areas, fulfillment | Team and equipment identifiers; Approved area and actual service method; Travel/setup intervals and custody milestones |
| TRANSFER | Transfers or greeting | resources, availability, reservations, fulfillment, service_areas | Vehicle/driver or greeter-only identifiers; Pickup/dropoff and waiting policy references; Joint-resource allocation and actual provider state |
| PRODUCTION_DUE | Made-to-order work | resources, availability, reservations, fulfillment | Approved specification/version and order reference; Workload and due commitment; Quote/production approval identity |
| ASSET_INTERVAL | Rentals | resources, availability, reservations, fulfillment | Actual asset interval and return identity; Turnaround/maintenance blocks; Joint optional driver allocation without transfer creation |
| SESSION_CAPACITY | Events and group sessions | resources, availability, reservations | Occurrence/session and ticket-type identifiers; Shared place pool and unit; Actual check-in event references |
| REQUEST_QUOTE | Requests and quotes | No allocation classes unless an accepted downstream model actually requires them | Request and quote/version identifiers; Response ownership and supplier-confirmed state; Privacy-safe inquiry/provider handoff |
| ENTITLEMENT | Memberships and passes | resources, availability, reservations | Plan, entitlement and usage identifiers; Credit/access policy versions; Separate actual session reservations and renewal consent |
| SPACE_RESERVATION | Tables and spaces | resources, availability, reservations | Actual table/space and party-size identifiers; Combination and turnover rules; Shared resource allocation reference |
| LINKED_WINDOWS | Collection and return | resources, availability, reservations, fulfillment, service_areas | Linked collection/processing/return identities; Measured item or weight units; Independent feasible leg windows and custody states |
| SERVICE_JOB | Service and repair jobs | resources, availability, reservations, fulfillment | Device/asset and job identifiers with scoped visibility; Assessment, approval and job-stage mapping; Separate explicit intake appointment if supported |
| TOUR | Tours | resources, availability, reservations, fulfillment, service_areas | Departure/itinerary and shared/private scope; Participant units and guide/vehicle inventory; Confirmed supplier inclusions and cancellation version |
| FREIGHT | Freight | resources, availability, reservations, fulfillment, service_areas | Carrier/consignment/leg identities; Exact cargo units and charge basis; Owner-confirmed capacity, custody and milestone states |
| STORAGE | Storage | resources, availability, reservations, fulfillment | Actual storage pool/unit and goods compatibility; Area/volume units and occupancy interval; Capacity/stock/custody as distinct owned classes |

Offerings, pricing and work-item facts keep their own declared owners. Scheduled allocation adds resources, availability and reservations only when actually configured. Stock, fulfilment and service areas remain conditional. Payment, refund, settlement and payout are separate leaf classes and permissions. `finance` and `capacity` are display groupings, never blanket authority grants.

Native, manual, external and hybrid arrangements are valid where the owner supports them. A native/manual merchant does not need a third-party connector. Required ownership, actual records, permissions and current state still apply. Manual entry has provenance and an entry/coverage time; it never claims live provider confirmation.

## Category counts

The category IDs and exact subcategory identities come from the canonical taxonomy and effective source maps. The current display label for `concierge_services` is **App Services**.

| Category ID | Category | Subcategories | Possible design models, never automatic activation |
| --- | --- | ---: | --- |
| adults_only | Adults Only | 6 | APPOINTMENT, FIELD_VISIT, ORDER |
| airport_transfers | Airport Transfers | 4 | TRANSFER |
| alcohol_beverages | Alcohol & Beverages | 6 | ORDER |
| fashion_apparel | Fashion & Apparel | 7 | APPOINTMENT, ORDER, PRODUCTION_DUE |
| beauty | Beauty | 5 | APPOINTMENT, FIELD_VISIT, ORDER |
| vehicle_rentals | Vehicle Rentals | 5 | ASSET_INTERVAL |
| experiences | Experiences | 9 | APPOINTMENT, ENTITLEMENT, FIELD_VISIT, REQUEST_QUOTE, SESSION_CAPACITY, SPACE_RESERVATION |
| financial_services | Financial Services | 7 | APPOINTMENT, REQUEST_QUOTE |
| flowers_gifts | Flowers & Gifts | 6 | ENTITLEMENT, ORDER, PRODUCTION_DUE |
| restaurants_food | Restaurants & Food | 8 | ORDER, PRODUCTION_DUE, REQUEST_QUOTE, SPACE_RESERVATION |
| groceries_essentials | Groceries & Essentials | 6 | ENTITLEMENT, ORDER |
| laundry_cleaning | Laundry & Cleaning | 5 | ENTITLEMENT, FIELD_VISIT, LINKED_WINDOWS |
| marketplace | Marketplace | 9 | FIELD_VISIT, ORDER, PRODUCTION_DUE, REQUEST_QUOTE |
| pharmacy | Pharmacy | 4 | ENTITLEMENT, ORDER |
| health | Health | 5 | APPOINTMENT, ENTITLEMENT, FIELD_VISIT, SESSION_CAPACITY |
| tech_electronics | Tech & Electronics | 7 | FIELD_VISIT, ORDER, SERVICE_JOB |
| travel_tours | Travel & Tours | 7 | REQUEST_QUOTE, TOUR |
| vehicle_services | Vehicle Services | 5 | APPOINTMENT, ENTITLEMENT, FIELD_VISIT, ORDER, SERVICE_JOB |
| wellness | Wellness | 4 | APPOINTMENT, ENTITLEMENT, FIELD_VISIT, ORDER, SESSION_CAPACITY |
| concierge_services | App Services | 9 | ENTITLEMENT, FIELD_VISIT, FREIGHT, REQUEST_QUOTE |
| logistics_shipping | Logistics & Shipping | 4 | FREIGHT, STORAGE |

## All 128 exact subcategory rows

The baseline column comes directly from the reconciled profile. The addition column lists only the separately approved template/model routes. Exact guard, rule, workflow and intake references for every row are retained in the JSON companion. Every row composes the six shared groups and only its actually selected supported concerns.

| Category ID | Exact subcategory ID | Merchant label | Baseline candidate models | Separately approved offering/model additions |
| --- | --- | --- | --- | --- |
| adults_only | adult_products | Adult Products | ORDER | None |
| adults_only | adult_wellness | Adult Wellness | APPOINTMENT, FIELD_VISIT, ORDER | None |
| adults_only | cigarettes | Cigarettes | ORDER | None |
| adults_only | cigars | Cigars | ORDER | None |
| adults_only | vapes | Vapes | ORDER | None |
| adults_only | adult_accessories | Adult Accessories | ORDER | None |
| airport_transfers | airport_pickup | Airport Pickup | TRANSFER | None |
| airport_transfers | airport_dropoff | Airport Drop-off | TRANSFER | None |
| airport_transfers | meet_greet | Meet & Greet | TRANSFER | None |
| airport_transfers | executive_transfer | Executive Transfer | TRANSFER | None |
| alcohol_beverages | wine | Wine | ORDER | None |
| alcohol_beverages | spirits | Spirits | ORDER | None |
| alcohol_beverages | beer | Beer | ORDER | None |
| alcohol_beverages | champagne | Champagne | ORDER | None |
| alcohol_beverages | cocktail_mixers | Cocktail Mixers | ORDER | None |
| alcohol_beverages | liquor_stores | Liquor Stores | ORDER | None |
| fashion_apparel | mens_fashion | Men's Fashion | APPOINTMENT, ORDER, PRODUCTION_DUE | None |
| fashion_apparel | womens_fashion | Women's Fashion | APPOINTMENT, ORDER, PRODUCTION_DUE | None |
| fashion_apparel | kids_fashion | Kids Fashion | ORDER | None |
| fashion_apparel | shoes | Shoes | ORDER | None |
| fashion_apparel | bags | Bags | ORDER | None |
| fashion_apparel | watches | Watches | ORDER | None |
| fashion_apparel | accessories | Accessories | ORDER | None |
| beauty | makeup | Makeup | APPOINTMENT, FIELD_VISIT, ORDER | None |
| beauty | skincare | Skincare | APPOINTMENT, FIELD_VISIT, ORDER | None |
| beauty | haircare | Haircare | APPOINTMENT, FIELD_VISIT, ORDER | None |
| beauty | fragrances | Fragrances | ORDER | None |
| beauty | cosmetics_stores | Cosmetics Stores | ORDER | None |
| vehicle_rentals | car_rental | Car Rental | ASSET_INTERVAL | None |
| vehicle_rentals | self_drive | Self Drive | ASSET_INTERVAL | None |
| vehicle_rentals | corporate_rental | Corporate Rental | ASSET_INTERVAL | None |
| vehicle_rentals | long_term_rental | Long-Term Rental | ASSET_INTERVAL | None |
| vehicle_rentals | bike_rental | Bike Rental | ASSET_INTERVAL | None |
| experiences | concerts | Concerts | SESSION_CAPACITY | None |
| experiences | festivals | Festivals | SESSION_CAPACITY | session_pass / ENTITLEMENT |
| experiences | conferences | Conferences | SESSION_CAPACITY | event_space / SPACE_RESERVATION |
| experiences | private_events | Private Events | REQUEST_QUOTE | event_space / SPACE_RESERVATION; photography / APPOINTMENT; photography / FIELD_VISIT |
| experiences | photography | Photography | APPOINTMENT, FIELD_VISIT | None |
| experiences | workshops | Workshops | SESSION_CAPACITY | session_pass / ENTITLEMENT |
| experiences | classes | Classes | ENTITLEMENT, SESSION_CAPACITY | None |
| experiences | sports_activities | Sports Activities | ENTITLEMENT, SESSION_CAPACITY | None |
| experiences | recreation | Recreation | SESSION_CAPACITY | session_pass / ENTITLEMENT |
| financial_services | banking | Banking | APPOINTMENT, REQUEST_QUOTE | None |
| financial_services | forex | Forex | APPOINTMENT, REQUEST_QUOTE | None |
| financial_services | insurance | Insurance | APPOINTMENT, REQUEST_QUOTE | None |
| financial_services | payments | Payments | APPOINTMENT, REQUEST_QUOTE | None |
| financial_services | remittance | Remittance | APPOINTMENT, REQUEST_QUOTE | None |
| financial_services | sacco_services | Sacco Services | APPOINTMENT, REQUEST_QUOTE | None |
| financial_services | business_services | Business Services | APPOINTMENT, REQUEST_QUOTE | None |
| flowers_gifts | flowers | Flowers | ENTITLEMENT, ORDER | None |
| flowers_gifts | gift_hampers | Gift Hampers | ORDER, PRODUCTION_DUE | None |
| flowers_gifts | cakes | Cakes | PRODUCTION_DUE | ready_cake / ORDER |
| flowers_gifts | chocolates | Chocolates | ORDER | None |
| flowers_gifts | personalized_gifts | Personalized Gifts | PRODUCTION_DUE | None |
| flowers_gifts | occasion_gifts | Occasion Gifts | ORDER | None |
| restaurants_food | restaurant | Restaurant | ORDER, SPACE_RESERVATION | catering / REQUEST_QUOTE |
| restaurants_food | fast_food | Fast Food | ORDER | None |
| restaurants_food | cafe | Café | ORDER | None |
| restaurants_food | bakery | Bakery | ORDER, PRODUCTION_DUE | None |
| restaurants_food | desserts | Desserts | ORDER, PRODUCTION_DUE | None |
| restaurants_food | juice_bar | Juice Bar | ORDER | None |
| restaurants_food | cloud_kitchen | Cloud Kitchen | ORDER | None |
| restaurants_food | catering | Catering | REQUEST_QUOTE | None |
| groceries_essentials | supermarket | Supermarket | ORDER | None |
| groceries_essentials | convenience_store | Convenience Store | ORDER | None |
| groceries_essentials | fresh_produce | Fresh Produce | ENTITLEMENT, ORDER | None |
| groceries_essentials | butchery | Butchery | ORDER | None |
| groceries_essentials | seafood | Seafood | ORDER | None |
| groceries_essentials | organic_store | Organic Store | ORDER | None |
| laundry_cleaning | laundry | Laundry | LINKED_WINDOWS | None |
| laundry_cleaning | dry_cleaning | Dry Cleaning | LINKED_WINDOWS | None |
| laundry_cleaning | ironing | Ironing | LINKED_WINDOWS | None |
| laundry_cleaning | home_cleaning | Home Cleaning | ENTITLEMENT, FIELD_VISIT | None |
| laundry_cleaning | office_cleaning | Office Cleaning | ENTITLEMENT, FIELD_VISIT | None |
| marketplace | home_living | Home & Living | ORDER | None |
| marketplace | furniture | Furniture | FIELD_VISIT, ORDER | None |
| marketplace | appliances | Appliances | FIELD_VISIT, ORDER | None |
| marketplace | decor | Decor | ORDER | None |
| marketplace | kitchenware | Kitchenware | ORDER | None |
| marketplace | books | Books | ORDER, PRODUCTION_DUE, REQUEST_QUOTE | None |
| marketplace | stationery | Stationery | ORDER | personalized_gift / PRODUCTION_DUE |
| marketplace | office_supplies | Office Supplies | ORDER | None |
| marketplace | general_retail | General Retail | ORDER | None |
| pharmacy | pharmacy_retail | Pharmacy | ORDER | None |
| pharmacy | medical_supplies | Medical Supplies | ORDER | None |
| pharmacy | baby_products | Baby Products | ENTITLEMENT, ORDER | None |
| pharmacy | supplements | Supplements | ORDER | None |
| health | clinics | Clinics | APPOINTMENT, FIELD_VISIT | None |
| health | telemedicine | Telemedicine | APPOINTMENT | None |
| health | labs | Labs | APPOINTMENT, FIELD_VISIT | None |
| health | mental_health | Mental Health (Therapy) | APPOINTMENT | None |
| health | coaching | Coaching | APPOINTMENT, SESSION_CAPACITY | session_pass / ENTITLEMENT |
| tech_electronics | smartphones | Smartphones | ORDER, SERVICE_JOB | None |
| tech_electronics | tech_accessories | Accessories | ORDER | None |
| tech_electronics | computers | Computers | ORDER, SERVICE_JOB | None |
| tech_electronics | gaming | Gaming | ORDER | None |
| tech_electronics | audio | Audio | ORDER | None |
| tech_electronics | telecom_services | Telecom Services | ORDER, SERVICE_JOB | None |
| tech_electronics | smart_devices | Smart Devices | FIELD_VISIT, ORDER | None |
| travel_tours | safaris | Safaris | TOUR | None |
| travel_tours | game_drives | Game Drives | TOUR | None |
| travel_tours | luxury_safaris | Luxury Safaris | TOUR | None |
| travel_tours | city_tours | City Tours | TOUR | None |
| travel_tours | cultural_tours | Cultural Tours | TOUR | None |
| travel_tours | adventure_tours | Adventure Tours | TOUR | None |
| travel_tours | travel_packages | Travel Packages | REQUEST_QUOTE | safari / TOUR; city_tour / TOUR |
| vehicle_services | car_wash | Car Wash | ENTITLEMENT, FIELD_VISIT, SERVICE_JOB | None |
| vehicle_services | tire_service | Tire Service | FIELD_VISIT, SERVICE_JOB | tire_product / ORDER |
| vehicle_services | battery_service | Battery Service | FIELD_VISIT, SERVICE_JOB | battery_product / ORDER |
| vehicle_services | vehicle_assistance | Vehicle Assistance | FIELD_VISIT | None |
| vehicle_services | vehicle_inspection | Vehicle Inspection | APPOINTMENT, FIELD_VISIT | None |
| wellness | spa | Spa | APPOINTMENT, ENTITLEMENT, FIELD_VISIT | personal_care / ORDER |
| wellness | massage | Massage | APPOINTMENT, FIELD_VISIT | personal_care / ORDER |
| wellness | gym | Gym | APPOINTMENT, ENTITLEMENT | training / FIELD_VISIT; class / SESSION_CAPACITY |
| wellness | personal_training | Personal Training | APPOINTMENT, FIELD_VISIT, SESSION_CAPACITY | session_pass / ENTITLEMENT |
| concierge_services | reservations | Reservations | FIELD_VISIT, REQUEST_QUOTE | None |
| concierge_services | personal_assistance | Personal Assistance | ENTITLEMENT, FIELD_VISIT, REQUEST_QUOTE | None |
| concierge_services | shopping_assistance | Shopping Assistance | FIELD_VISIT, REQUEST_QUOTE | None |
| concierge_services | gift_sourcing | Gift Sourcing | FIELD_VISIT, REQUEST_QUOTE | None |
| concierge_services | travel_planning | Travel Planning | FIELD_VISIT, REQUEST_QUOTE | None |
| concierge_services | property_coordination | Property Coordination | FIELD_VISIT, REQUEST_QUOTE | None |
| concierge_services | moving_assistance | Moving Assistance | FIELD_VISIT, REQUEST_QUOTE | road_freight / FREIGHT |
| concierge_services | cleaning_coordination | Cleaning Coordination | ENTITLEMENT, FIELD_VISIT, REQUEST_QUOTE | None |
| concierge_services | vip_assistance | VIP Assistance | ENTITLEMENT, FIELD_VISIT, REQUEST_QUOTE | None |
| logistics_shipping | sea_freight | Sea Freight | FREIGHT | None |
| logistics_shipping | air_freight | Air Freight | FREIGHT | None |
| logistics_shipping | road_freight | Road Freight & Trucking | FREIGHT | None |
| logistics_shipping | warehousing | Warehousing & Storage | STORAGE | None |

## The 21 approved additional routes

Approval `OFF_SHOPPING_ADDITIONS_2026_10_31` covers design inclusion only. It does not activate a runtime capability or approve every individual field requirement. A separate offering route may reuse a model that already appears elsewhere in its subcategory; count routes by subcategory/template/model identity, not by newly introduced model IDs.

| Subcategory | Exact offering template | Model |
| --- | --- | --- |
| festivals | session_pass | ENTITLEMENT |
| conferences | event_space | SPACE_RESERVATION |
| private_events | event_space | SPACE_RESERVATION |
| private_events | photography | APPOINTMENT |
| private_events | photography | FIELD_VISIT |
| workshops | session_pass | ENTITLEMENT |
| recreation | session_pass | ENTITLEMENT |
| cakes | ready_cake | ORDER |
| restaurant | catering | REQUEST_QUOTE |
| stationery | personalized_gift | PRODUCTION_DUE |
| coaching | session_pass | ENTITLEMENT |
| travel_packages | safari | TOUR |
| travel_packages | city_tour | TOUR |
| tire_service | tire_product | ORDER |
| battery_service | battery_product | ORDER |
| spa | personal_care | ORDER |
| massage | personal_care | ORDER |
| gym | training | FIELD_VISIT |
| gym | class | SESSION_CAPACITY |
| personal_training | session_pass | ENTITLEMENT |
| moving_assistance | road_freight | FREIGHT |

## Mixed categories, locations and privacy

- **MIXED_CATEGORY**: Compose shared groups once. Resolve alerts/connections per selected configured offering/activity; a union of category candidates never enables every branch or widens permissions.
- **MULTI_LOCATION**: Keep business versus personal scope visible. Business-level and one-location controls are distinct; a person without the target location grant cannot inspect or edit it. Confirm the affected locations in high-impact changes.
- **PERSONAL_SCOPE**: Personal preferences follow the user identity. Business event routing or system ownership requires current business/location permission and actual supported contract.
- **SOURCE_FAILURE**: Constrain affected class/actions only. Keep permitted confirmed information with its confirmation time. Authorization, import/sync health and individual unknown command outcome are separate.
- **PRIVATE_INTAKE**: Keep clinical records, symptoms/results, therapy notes, financial account details, discreet item/session details and sensitive customer intake out of shared alerts, provider diagnostics, exports and concept imagery. Only purpose-limited authorized projections are allowed.
- **NO_INFERRED_AUTHORITY**: Category choice, license declaration, merchant claim or provider selection never proves eligibility, verification, regulated execution permission or resource capacity.
- **KENYA_TIME**: Merchant operations use Africa/Nairobi; UTC instants remain instants and local dates remain dates. No operational timezone picker. Supported personal time/date formatting does not change commitments.
- **STARTED_WORK**: Configuration/source changes preserve already accepted specification, price, policy, workflow and allocation identities. Owner cutover/rollback requires explicit reviewed reconciliation, never an unsupervised writer toggle.
- **SUPPORTED_ACTIONS**: Hide unauthorized destinations and search metadata. An actor explicitly allowed to discover a section may see an honest unavailable explanation when its capability is unsupported, with no working editor. Capability, approved platform permission, actor/location grant, current workflow/version/state and source/connector operation support constrain every action. UI hiding alone is not authorization.
- **UNSUPPORTED_CHANNELS**: Show only registered supported events/channels. A selected channel, saved preference, queued test or account badge does not prove channel verification or delivered message.

Specialty checks include retail products versus adult-wellness visits; alcoholic versus nonalcoholic mixers; greeter-only versus actual transport; restaurant orders versus actual tables/catering; quote requests versus confirmed supplier resources; healthcare administrative scheduling versus private clinical records; rental driver allocation versus standalone transfers; membership access versus actual session reservations; and freight versus warehousing capacity.

## Source evidence

| Source | Exact file | SHA-256 |
| --- | --- | --- |
| taxonomy | [packages/contracts/src/taxonomy.ts](../../../packages/contracts/src/taxonomy.ts) | `957f877487f8638ac56865b73d4d7f74283e1b0c5560fa033251941ded86b2ad` |
| profiles | [docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-profiles-128.json](../../../docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-profiles-128.json) | `4a831d5a4f3392369153a6c5e2b37445ea760b8d6787fcd73b679bc47ac9714b` |
| screens | [docs/merchant-portal-plan/offering-map/all-screens-and-workflows.json](../../../docs/merchant-portal-plan/offering-map/all-screens-and-workflows.json) | `bc20727100ff574beca4f0956e388b689c6b9d4a9f0a7bbbdbd31dd1d7c95dbe` |
| approvedAdditions | [docs/merchant-portal-plan/offering-map/approved-profile-additions.json](../../../docs/merchant-portal-plan/offering-map/approved-profile-additions.json) | `57650a23febe1bf08ddf57a2a385b580bff1c05ae1ec02b6386ddc16fcf1c96f` |
| offeringCatalogue | [docs/merchant-portal-plan/offering-map/catalogue.json](../../../docs/merchant-portal-plan/offering-map/catalogue.json) | `0638938f213486ce06a261ea4cc7764d80cfe62f993703860c2a2bdeac2f1fcf` |
| models | [docs/merchant-portal-plan/payload-reserve-plan/models.json](../../../docs/merchant-portal-plan/payload-reserve-plan/models.json) | `e4800f98ddb2314bc3f3d174159f3e70f2d1c2b449df94d1ade7b32db52fd9c8` |
| workflows | [docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-workflows.json](../../../docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-workflows.json) | `684ed4db68bdf27df6281da106eece1780c4c2e2b0e7a36daae0dc95ef6cc210` |
| domains | [docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-domain-registry.json](../../../docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-domain-registry.json) | `6ab91de44e853f06b2606ebfc03a123d150650658355b53558778dfbe1578a5b` |
| questions | [docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-question-registry.json](../../../docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-question-registry.json) | `8381f6d88bbd4bd7b24d7e0865e138fad421f62c8921151d61f3a043d3cbe6ac` |

The source set is explicit: the effective reconciled profiles and workflow registry, all-screen offering routes, the approved additions and the canonical taxonomy. Insights-specific logic is not used to derive these rows. The source hashes support change detection; future source edits require regenerating and reviewing coverage.
