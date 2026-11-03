# Insights merchant coverage

Date: 1 November 2026. Status: proposed design coverage. This document maps the existing 21 categories and 128 subcategories, plus the 21 approved additional specialty/offering/model routes across 17 specialties. All 15 model families participate. No runtime report or capability is enabled by this mapping.

The machine-readable [coverage register](coverage.json) preserves each baseline identity, default suggestion, candidate models, exact workflow references, rule references and explicit offering routes. Each baseline and addition row has a primary-report selection rule, reporting dimensions, lifecycle stages, privacy notes and evidence gates.

## How the screen adapts

Select reports from the actual configured offering, location, enabled model, intake method, source evidence and grants. A category suggests possible setup. It never forces a report or silently activates a capability. A hybrid merchant can report each selected operation using the appropriate definition. If no primary operation has evidence, show source quality and the available work summary.

The reconciled profile snapshot remains the source for baseline guards and conditional rules. The offering composition preserves specialized regulated, remote, greeter-only and linked-work routes. Approved additions extend only their exact specialty/template/model combination. They do not overwrite a baseline, create work or change financial permissions.

## End-to-end report stages

| Stage | Merchant question | Evidence condition |
| --- | --- | --- |
| SETUP_PUBLICATION | Which applicable offerings and locations have publishable setup? | Versioned offering/publication and readiness evidence. Setup answers are not proof of actual readiness. |
| DISCOVERY | Which published offerings receive qualified views or selection actions? | Approved impression/view/session instrumentation, identity/privacy rules and attribution scope. Hidden until the event contract exists. |
| WORK_JOURNEY | Where do actual workflow cohorts progress or stop? | Registered workflow transition events and exact stage definitions. Never merge unlike completion stages. |
| OFFERING_VARIANT | Which actual offering kinds, variants and units contribute to outcomes? | Accepted offering/type/variant snapshots linked to work outcomes; quantity and units must exist. |
| CAPACITY | How much controlled usable capacity is reserved or actually used? | Typed resources, availability exclusions, confirmed reservations and separate actual-use evidence. |
| FINANCIAL | What are the authorized sales, refunds, fees and net measures? | Finance-owned definitions and posting basis, explicit currencies and separate grants for payment/refund/settlement/payout. |
| PROMOTIONS | Which qualified actions and outcomes are attributed under the selected model/window? | Campaign delivery and qualified action/outcome evidence, attribution model and window. Correlation does not establish causal lift. |
| REPEAT_FEEDBACK | What repeat activity and published feedback are permitted to report? | Approved purpose-limited identifiers, consent, privacy suppression and feedback publication state. Repeat bookings are not unique people. |
| SOURCE_QUALITY | Which selected measures have complete, current and mapped evidence? | Source-update state, missing intervals, mapping status and definition/version history at metric scope. |

Discovery and promotion reports are conditional on real instrumentation. Missing views do not mean zero views. No booking does not prove lost demand. Setup fields do not prove ready capacity, verified claims, connected providers or live publication.

## Report families

| Family | Question and possible measures | Unit and denominator condition |
| --- | --- | --- |
| `ORDER` | Which actual products and variants produce confirmed orders and fulfilment outcomes? Possible measures: Orders received, Orders accepted, Orders completed by declared fulfilment outcome, Units fulfilled by explicit unit, Return and cancellation counts. | An order cohort is distinct from line-item or unit counts. Do not combine item units, kg and packs. Stock exception reports require actual stock evidence; product purchase does not create appointment metrics. |
| `APPOINTMENT` | Which appointment services are requested, confirmed, attended and completed? Possible measures: Requests received, Confirmed appointments, Completed appointments, Recorded cancellations and no-shows, Reserved and actual-used provider minutes. | Usable provider minutes must exclude closures, breaks and unavailable resources; reserved and actual-used minutes stay separate. Scheduled bookings must actually be enabled. Walk-in-only and remote variants retain their actual workflow and resource rules. |
| `FIELD_VISIT` | Where do feasible accepted visits progress and where do operational delays occur? Possible measures: Visits requested and confirmed, Dispatched visits, Recorded arrivals within accepted arrival window, Completed visits, Travel or access exception counts. | Arrival timeliness uses accepted windows and actual arrival evidence, not record creation timestamps. Travel, access and eligible-team evidence are required; enabling home service alone does not create visits. |
| `ASSET_INTERVAL` | Which assets are reserved or actually used against usable time? Possible measures: Rental requests and confirmations, Reserved asset hours or days, Actual-used asset hours or days, Usable asset time, Late-return and maintenance exclusion counts. | Identified usable asset time excludes maintenance, closure and turnaround. Use one explicit hour or day convention. Actual usage needs actual handover and return evidence. With-driver rentals remain rentals and require both resource guarantees. |
| `TRANSFER` | Which accepted trips or greeting services meet their actual pickup or meeting commitments? Possible measures: Trip or greeting requests, Confirmed transfers or greetings, Recorded pickup or meeting timeliness, Completed trips or greetings, Missed-pickup or resource exceptions. | Trip and greeter-only service counts remain labelled separately. Timeliness uses accepted pickup/meeting windows. Greeter-only execution must not inherit vehicle travel or ride-completion assumptions. |
| `SESSION_CAPACITY` | How many places were reserved and attended for each actual occurrence? Possible measures: Published occurrence places, Reserved places, Checked-in places, Remaining sellable places, Occurrence cancellations. | Reserved or attended places divided by actual sellable occurrence places; holds, disabled places and walk-ins follow one capacity owner. A reservation count is not an attendee count. Place class constraints and actual attendance evidence must exist. |
| `SPACE_RESERVATION` | How do compatible tables or spaces serve actual parties across usable intervals? Possible measures: Reservation requests, Confirmed parties, Seated or arrived parties, Reserved space time, Actual-used space time, Turnover and cancellation exceptions. | Use compatible usable space minutes or a separately defined seat-minute measure. Party count, guest count and space occupancy differ. Existing external reservation software is discovery only; reporting needs actual space/reservation authority and instrumented evidence. |
| `TOUR` | Which departure places or private tour commitments progress to actual completion? Possible measures: Tour enquiries or requests, Confirmed tour bookings, Confirmed departure places, Attended tour places, Completed tours, Supplier confirmation exceptions. | Shared departure places and private tour intervals are separate measures; supplier-pending inventory is not confirmed capacity. Tour variants preserve supplier scope and joint resource guarantees. Enquiry does not imply a booking. |
| `PRODUCTION_DUE` | Which accepted production commitments reach their promised handoff? Possible measures: Specifications submitted, Accepted production commitments, Units completed by declared unit, Commitments handed off by accepted due date, Rework and scope-change counts. | Timeliness uses the accepted promise and actual handoff. Production units and accepted commitments remain separate. Unknown workload or specification cannot create a capacity or on-time claim. Scope changes retain accepted versions. |
| `REQUEST_QUOTE` | Where do submitted requests progress through response, quote and customer acceptance? Possible measures: Requests received, Requests with substantive response, Quotes issued, Quotes accepted, Median first substantive response time, Unresolved requests by age. | Quote-decision acceptance divides accepted eligible quote identities by eligible quote identities in a defined quote-issued cohort, with a stated decision deadline and revision rule. Requests with accepted quote divides distinct eligible request identities that reached an accepted quote by eligible request identities in a defined request cohort, with a stated observation cutoff. These are separate rates with separate denominators. An accepted quote is distinct from paid or completed work. Regulated enquiry keeps its administrative review graph; provider approval, loan approval, insurance outcome or investment performance must not be inferred. |
| `LINKED_WINDOWS` | Can each linked collection, processing and return promise be traced to actual outcomes? Possible measures: Accepted linked jobs, Collections completed by accepted window, Processing completed, Returns completed by accepted window, End-to-end completed jobs, Promise and custody exceptions. | Collection leg, processing leg and return leg are separate counts; only one parent job contributes to end-to-end completion. Firm return promises need confirmed linked capacity. Dispatch evidence cannot invent initial feasibility or final handoff. |
| `SERVICE_JOB` | Which assessed and approved jobs finish their accepted scope and handoff? Possible measures: Jobs received, Assessments completed, Approvals received, Jobs completed, Jobs handed off by accepted promise, Rework or parts-delay counts. | Assessment, approval, execution and handoff times use their own source events; open jobs are censored rather than zero-duration. A repair job is not automatically a blocking appointment. A linked intake appointment has its own identity and measure. |
| `ENTITLEMENT` | How do valid plans and explicit credits translate into permitted access or actual session usage? Possible measures: Plan enrolments, Active entitlements at an explicit date, Credits granted and consumed by unit, Recorded access checks, Authorized renewals, Expired entitlements. | Snapshot active entitlements, period enrolments, credits and actual booked places are separate measures. Recurring orders or schedules do not create a membership. Renewal and payment consent need their actual owner records. |
| `FREIGHT` | Which accepted shipments meet their evidence-backed milestones and handoffs? Possible measures: Freight enquiries, Accepted shipments, Confirmed carrier capacity, Recorded pickup and movement milestones, Completed handoffs, Milestone and cargo exceptions. | Shipment count, leg count, weight and volume use separate units. Promised milestones require actual accepted commitment records. Carrier evidence and cargo/capacity scope must exist. A generic status update does not prove goods movement or customer handoff. |
| `STORAGE` | Which accepted storage allocations occupy compatible usable capacity through actual exit? Possible measures: Accepted storage allocations, Occupied unit-days by declared unit, Usable capacity-days, Goods received, Actual exits, Custody or overstay exceptions. | Compatible usable unit-days, area-days or volume-days must use matching precision and units; do not mix them. Capacity and custody require typed accepted goods/quantity evidence. A scheduled exit does not prove actual vacancy. |

These measures are proposed questions and calculation inputs. A family is not a deployed metric registry. Each rendered metric still needs a registered definition, owner, event contract, source coverage, permissions and drill-down.

## All baseline subcategories

Every row below preserves the baseline default as a suggestion. The actual configured primary offering decides the initial report. Family IDs are candidates whose source and operational gates must pass. Added routes are shown separately and are fully enumerated in the next table.

### Adults Only

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Adult Products | `adult_products` | `ORDER` | ORDER | None |
| Adult Wellness | `adult_wellness` | `ORDER` | APPOINTMENT, FIELD_VISIT, ORDER | None |
| Cigarettes | `cigarettes` | `ORDER` | ORDER | None |
| Cigars | `cigars` | `ORDER` | ORDER | None |
| Vapes | `vapes` | `ORDER` | ORDER | None |
| Adult Accessories | `adult_accessories` | `ORDER` | ORDER | None |

### Airport Transfers

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Airport Pickup | `airport_pickup` | `TRANSFER` | TRANSFER | None |
| Airport Drop-off | `airport_dropoff` | `TRANSFER` | TRANSFER | None |
| Meet & Greet | `meet_greet` | `TRANSFER` | TRANSFER | None |
| Executive Transfer | `executive_transfer` | `TRANSFER` | TRANSFER | None |

### Alcohol & Beverages

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Wine | `wine` | `ORDER` | ORDER | None |
| Spirits | `spirits` | `ORDER` | ORDER | None |
| Beer | `beer` | `ORDER` | ORDER | None |
| Champagne | `champagne` | `ORDER` | ORDER | None |
| Cocktail Mixers | `cocktail_mixers` | `ORDER` | ORDER | None |
| Liquor Stores | `liquor_stores` | `ORDER` | ORDER | None |

### Fashion & Apparel

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Men's Fashion | `mens_fashion` | `ORDER` | APPOINTMENT, ORDER, PRODUCTION_DUE | None |
| Women's Fashion | `womens_fashion` | `ORDER` | APPOINTMENT, ORDER, PRODUCTION_DUE | None |
| Kids Fashion | `kids_fashion` | `ORDER` | ORDER | None |
| Shoes | `shoes` | `ORDER` | ORDER | None |
| Bags | `bags` | `ORDER` | ORDER | None |
| Watches | `watches` | `ORDER` | ORDER | None |
| Accessories | `accessories` | `ORDER` | ORDER | None |

### Beauty

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Makeup | `makeup` | `APPOINTMENT` | APPOINTMENT, FIELD_VISIT, ORDER | None |
| Skincare | `skincare` | `ORDER` | APPOINTMENT, FIELD_VISIT, ORDER | None |
| Haircare | `haircare` | `APPOINTMENT` | APPOINTMENT, FIELD_VISIT, ORDER | None |
| Fragrances | `fragrances` | `ORDER` | ORDER | None |
| Cosmetics Stores | `cosmetics_stores` | `ORDER` | ORDER | None |

### Vehicle Rentals

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Car Rental | `car_rental` | `ASSET_INTERVAL` | ASSET_INTERVAL | None |
| Self Drive | `self_drive` | `ASSET_INTERVAL` | ASSET_INTERVAL | None |
| Corporate Rental | `corporate_rental` | `ASSET_INTERVAL` | ASSET_INTERVAL | None |
| Long-Term Rental | `long_term_rental` | `ASSET_INTERVAL` | ASSET_INTERVAL | None |
| Bike Rental | `bike_rental` | `ASSET_INTERVAL` | ASSET_INTERVAL | None |

### Experiences

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Concerts | `concerts` | `SESSION_CAPACITY` | SESSION_CAPACITY | None |
| Festivals | `festivals` | `SESSION_CAPACITY` | SESSION_CAPACITY | session_pass / ENTITLEMENT |
| Conferences | `conferences` | `SESSION_CAPACITY` | SESSION_CAPACITY | event_space / SPACE_RESERVATION |
| Private Events | `private_events` | `REQUEST_QUOTE` | REQUEST_QUOTE | event_space / SPACE_RESERVATION; photography / APPOINTMENT; photography / FIELD_VISIT |
| Photography | `photography` | `APPOINTMENT` | APPOINTMENT, FIELD_VISIT | None |
| Workshops | `workshops` | `SESSION_CAPACITY` | SESSION_CAPACITY | session_pass / ENTITLEMENT |
| Classes | `classes` | `SESSION_CAPACITY` | ENTITLEMENT, SESSION_CAPACITY | None |
| Sports Activities | `sports_activities` | `SESSION_CAPACITY` | ENTITLEMENT, SESSION_CAPACITY | None |
| Recreation | `recreation` | `SESSION_CAPACITY` | SESSION_CAPACITY | session_pass / ENTITLEMENT |

### Financial Services

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Banking | `banking` | `REQUEST_QUOTE` | APPOINTMENT, REQUEST_QUOTE | None |
| Forex | `forex` | `REQUEST_QUOTE` | APPOINTMENT, REQUEST_QUOTE | None |
| Insurance | `insurance` | `REQUEST_QUOTE` | APPOINTMENT, REQUEST_QUOTE | None |
| Payments | `payments` | `REQUEST_QUOTE` | APPOINTMENT, REQUEST_QUOTE | None |
| Remittance | `remittance` | `REQUEST_QUOTE` | APPOINTMENT, REQUEST_QUOTE | None |
| Sacco Services | `sacco_services` | `REQUEST_QUOTE` | APPOINTMENT, REQUEST_QUOTE | None |
| Business Services | `business_services` | `REQUEST_QUOTE` | APPOINTMENT, REQUEST_QUOTE | None |

### Flowers & Gifts

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Flowers | `flowers` | `ORDER` | ENTITLEMENT, ORDER | None |
| Gift Hampers | `gift_hampers` | `ORDER` | ORDER, PRODUCTION_DUE | None |
| Cakes | `cakes` | `PRODUCTION_DUE` | PRODUCTION_DUE | ready_cake / ORDER |
| Chocolates | `chocolates` | `ORDER` | ORDER | None |
| Personalized Gifts | `personalized_gifts` | `PRODUCTION_DUE` | PRODUCTION_DUE | None |
| Occasion Gifts | `occasion_gifts` | `ORDER` | ORDER | None |

### Restaurants & Food

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Restaurant | `restaurant` | `ORDER` | ORDER, SPACE_RESERVATION | catering / REQUEST_QUOTE |
| Fast Food | `fast_food` | `ORDER` | ORDER | None |
| CafÃƒÂ© | `cafe` | `ORDER` | ORDER | None |
| Bakery | `bakery` | `ORDER` | ORDER, PRODUCTION_DUE | None |
| Desserts | `desserts` | `ORDER` | ORDER, PRODUCTION_DUE | None |
| Juice Bar | `juice_bar` | `ORDER` | ORDER | None |
| Cloud Kitchen | `cloud_kitchen` | `ORDER` | ORDER | None |
| Catering | `catering` | `REQUEST_QUOTE` | REQUEST_QUOTE | None |

### Groceries & Essentials

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Supermarket | `supermarket` | `ORDER` | ORDER | None |
| Convenience Store | `convenience_store` | `ORDER` | ORDER | None |
| Fresh Produce | `fresh_produce` | `ORDER` | ENTITLEMENT, ORDER | None |
| Butchery | `butchery` | `ORDER` | ORDER | None |
| Seafood | `seafood` | `ORDER` | ORDER | None |
| Organic Store | `organic_store` | `ORDER` | ORDER | None |

### Laundry & Cleaning

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Laundry | `laundry` | `LINKED_WINDOWS` | LINKED_WINDOWS | None |
| Dry Cleaning | `dry_cleaning` | `LINKED_WINDOWS` | LINKED_WINDOWS | None |
| Ironing | `ironing` | `LINKED_WINDOWS` | LINKED_WINDOWS | None |
| Home Cleaning | `home_cleaning` | `FIELD_VISIT` | ENTITLEMENT, FIELD_VISIT | None |
| Office Cleaning | `office_cleaning` | `FIELD_VISIT` | ENTITLEMENT, FIELD_VISIT | None |

### Marketplace

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Home & Living | `home_living` | `ORDER` | ORDER | None |
| Furniture | `furniture` | `ORDER` | FIELD_VISIT, ORDER | None |
| Appliances | `appliances` | `ORDER` | FIELD_VISIT, ORDER | None |
| Decor | `decor` | `ORDER` | ORDER | None |
| Kitchenware | `kitchenware` | `ORDER` | ORDER | None |
| Books | `books` | `ORDER` | ORDER, PRODUCTION_DUE, REQUEST_QUOTE | None |
| Stationery | `stationery` | `ORDER` | ORDER | personalized_gift / PRODUCTION_DUE |
| Office Supplies | `office_supplies` | `ORDER` | ORDER | None |
| General Retail | `general_retail` | `ORDER` | ORDER | None |

### Pharmacy

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Pharmacy | `pharmacy_retail` | `ORDER` | ORDER | None |
| Medical Supplies | `medical_supplies` | `ORDER` | ORDER | None |
| Baby Products | `baby_products` | `ORDER` | ENTITLEMENT, ORDER | None |
| Supplements | `supplements` | `ORDER` | ORDER | None |

### Health

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Clinics | `clinics` | `APPOINTMENT` | APPOINTMENT, FIELD_VISIT | None |
| Telemedicine | `telemedicine` | `APPOINTMENT` | APPOINTMENT | None |
| Labs | `labs` | `APPOINTMENT` | APPOINTMENT, FIELD_VISIT | None |
| Mental Health (Therapy) | `mental_health` | `APPOINTMENT` | APPOINTMENT | None |
| Coaching | `coaching` | `APPOINTMENT` | APPOINTMENT, SESSION_CAPACITY | session_pass / ENTITLEMENT |

### Tech & Electronics

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Smartphones | `smartphones` | `ORDER` | ORDER, SERVICE_JOB | None |
| Accessories | `tech_accessories` | `ORDER` | ORDER | None |
| Computers | `computers` | `ORDER` | ORDER, SERVICE_JOB | None |
| Gaming | `gaming` | `ORDER` | ORDER | None |
| Audio | `audio` | `ORDER` | ORDER | None |
| Telecom Services | `telecom_services` | `SERVICE_JOB` | ORDER, SERVICE_JOB | None |
| Smart Devices | `smart_devices` | `ORDER` | FIELD_VISIT, ORDER | None |

### Travel & Tours

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Safaris | `safaris` | `TOUR` | TOUR | None |
| Game Drives | `game_drives` | `TOUR` | TOUR | None |
| Luxury Safaris | `luxury_safaris` | `TOUR` | TOUR | None |
| City Tours | `city_tours` | `TOUR` | TOUR | None |
| Cultural Tours | `cultural_tours` | `TOUR` | TOUR | None |
| Adventure Tours | `adventure_tours` | `TOUR` | TOUR | None |
| Travel Packages | `travel_packages` | `REQUEST_QUOTE` | REQUEST_QUOTE | safari / TOUR; city_tour / TOUR |

### Vehicle Services

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Car Wash | `car_wash` | `SERVICE_JOB` | ENTITLEMENT, FIELD_VISIT, SERVICE_JOB | None |
| Tire Service | `tire_service` | `SERVICE_JOB` | FIELD_VISIT, SERVICE_JOB | tire_product / ORDER |
| Battery Service | `battery_service` | `FIELD_VISIT` | FIELD_VISIT, SERVICE_JOB | battery_product / ORDER |
| Vehicle Assistance | `vehicle_assistance` | `FIELD_VISIT` | FIELD_VISIT | None |
| Vehicle Inspection | `vehicle_inspection` | `APPOINTMENT` | APPOINTMENT, FIELD_VISIT | None |

### Wellness

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Spa | `spa` | `APPOINTMENT` | APPOINTMENT, ENTITLEMENT, FIELD_VISIT | personal_care / ORDER |
| Massage | `massage` | `APPOINTMENT` | APPOINTMENT, FIELD_VISIT | personal_care / ORDER |
| Gym | `gym` | `ENTITLEMENT` | APPOINTMENT, ENTITLEMENT | training / FIELD_VISIT; class / SESSION_CAPACITY |
| Personal Training | `personal_training` | `APPOINTMENT` | APPOINTMENT, FIELD_VISIT, SESSION_CAPACITY | session_pass / ENTITLEMENT |

### App Services

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Reservations | `reservations` | `REQUEST_QUOTE` | FIELD_VISIT, REQUEST_QUOTE | None |
| Personal Assistance | `personal_assistance` | `REQUEST_QUOTE` | ENTITLEMENT, FIELD_VISIT, REQUEST_QUOTE | None |
| Shopping Assistance | `shopping_assistance` | `REQUEST_QUOTE` | FIELD_VISIT, REQUEST_QUOTE | None |
| Gift Sourcing | `gift_sourcing` | `REQUEST_QUOTE` | FIELD_VISIT, REQUEST_QUOTE | None |
| Travel Planning | `travel_planning` | `REQUEST_QUOTE` | FIELD_VISIT, REQUEST_QUOTE | None |
| Property Coordination | `property_coordination` | `REQUEST_QUOTE` | FIELD_VISIT, REQUEST_QUOTE | None |
| Moving Assistance | `moving_assistance` | `REQUEST_QUOTE` | FIELD_VISIT, REQUEST_QUOTE | road_freight / FREIGHT |
| Cleaning Coordination | `cleaning_coordination` | `REQUEST_QUOTE` | ENTITLEMENT, FIELD_VISIT, REQUEST_QUOTE | None |
| VIP Assistance | `vip_assistance` | `REQUEST_QUOTE` | ENTITLEMENT, FIELD_VISIT, REQUEST_QUOTE | None |

### Logistics & Shipping

| Subcategory | ID | Suggested family | Baseline candidate families | Approved route additions |
| --- | --- | --- | --- | --- |
| Sea Freight | `sea_freight` | `FREIGHT` | FREIGHT | None |
| Air Freight | `air_freight` | `FREIGHT` | FREIGHT | None |
| Road Freight & Trucking | `road_freight` | `FREIGHT` | FREIGHT | None |
| Warehousing & Storage | `warehousing` | `STORAGE` | STORAGE | None |

## All approved additional routes

The approval applies to these exact 21 route combinations. They inherit the same evidence and access gates and preserve their baseline profiles.

| Route | Subcategory | Offering template | Additional family | Exact approved workflow |
| --- | --- | --- | --- | --- |
| IN_EXT_01 | festivals | session_pass | ENTITLEMENT | WF_MEMBERSHIP |
| IN_EXT_02 | conferences | event_space | SPACE_RESERVATION | WF_SPACE_RESERVATION_V1 |
| IN_EXT_03 | private_events | event_space | SPACE_RESERVATION | WF_SPACE_RESERVATION_V1 |
| IN_EXT_04 | private_events | photography | APPOINTMENT | WF_APPOINTMENT |
| IN_EXT_05 | private_events | photography | FIELD_VISIT | WF_FIELD_SERVICE |
| IN_EXT_06 | workshops | session_pass | ENTITLEMENT | WF_MEMBERSHIP |
| IN_EXT_07 | recreation | session_pass | ENTITLEMENT | WF_MEMBERSHIP |
| IN_EXT_08 | cakes | ready_cake | ORDER | WF_ORDER |
| IN_EXT_09 | restaurant | catering | REQUEST_QUOTE | WF_REQUEST_QUOTE |
| IN_EXT_10 | stationery | personalized_gift | PRODUCTION_DUE | WF_MADE_TO_ORDER |
| IN_EXT_11 | coaching | session_pass | ENTITLEMENT | WF_MEMBERSHIP |
| IN_EXT_12 | travel_packages | safari | TOUR | WF_TOUR |
| IN_EXT_13 | travel_packages | city_tour | TOUR | WF_TOUR |
| IN_EXT_14 | tire_service | tire_product | ORDER | WF_ORDER |
| IN_EXT_15 | battery_service | battery_product | ORDER | WF_ORDER |
| IN_EXT_16 | spa | personal_care | ORDER | WF_ORDER |
| IN_EXT_17 | massage | personal_care | ORDER | WF_ORDER |
| IN_EXT_18 | gym | training | FIELD_VISIT | WF_FIELD_SERVICE |
| IN_EXT_19 | gym | class | SESSION_CAPACITY | WF_GROUP_ACTIVITY |
| IN_EXT_20 | personal_training | session_pass | ENTITLEMENT | WF_MEMBERSHIP |
| IN_EXT_21 | moving_assistance | road_freight | FREIGHT | WF_FREIGHT |

## Specialty and data limits

- Health reports cover administrative service and appointment operations. Clinical results, diagnoses and clinical suitability are outside these report dimensions.
- Financial-service merchants get permitted enquiry and appointment operations plus real NEXG financial records. An enquiry is not a loan, insurance or investment outcome.
- Pharmacy and restricted-product reports must avoid exposing sensitive purchases or preferences through small groups or exports.
- Remote appointments retain remote workflow timing and resource rules. Greeter-only transfers retain greeting outcomes. With-driver rentals retain rental and joint-resource definitions.
- Linked collection, processing and return work uses one parent job for end-to-end completion and distinct leg measures. A repair intake appointment, shipment leg, session booking or entitlement use retains its own identity.
- Accepted offering type, variant, specification, location, quantity unit and promise revision drive historical dimensions. Catalogue changes cannot silently rewrite accepted work.
- Currency totals stay separate. Product quantities, attendees, parties, jobs, credits, area, volume, weight and time do not share one unit.

## Remaining evidence needed

The design still needs canonical reporting events and correction handling, metric owner definitions, source freshness policies, privacy thresholds, approved repeat/feedback identifiers, discovery instrumentation, promotion attribution and Finance-defined calculations. Scheduled report delivery appears only after a real delivery capability and explicit recipient consent exist.

## Static verification

The register contains 21 categories, 128 unique baseline subcategories, 21 unique approved addition routes, 15 report families, 189 unique actual offering templates and 411 specialty/template/model bindings. All 128 source profile IDs and all 21 approval tuples are preserved exactly. Every referenced report family exists. Source hashes are recorded in coverage.json.

These checks establish design mapping coverage. Runtime calculation accuracy, event completeness, authorization, privacy and accessible interaction require implementation evidence.
