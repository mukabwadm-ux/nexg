# Payload Reserve coverage for all 128 NEXG specialties

Current implementation-planning entrypoint: [reconciled onboarding and booking package](reconciliation/README.md). Use its effective profiles, question registry and workflow bindings. Earlier profiles are source history, not an independent active configuration.

Date: 31 October 2026. All rows are planned, not implemented or runtime-tested. Kenya time is Africa/Nairobi with no selector. [Structured coverage](coverage-128.json) contains exact typed conditions, applicability, evidence and scenarios.

Coverage: 21 categories, 128 specialties, 1156 planned cases. This includes 896 baseline cases and 260 conditional answer-state cases across 65 bindings. These counts are not passing runtime tests.

Category defaults are suggestions. The selected configured offering supplies its actual model only after its guards pass. Selected alternatives can replace a contradicted default, while existing valid obligations remain unchanged. Linked execution has its own selected child scope and is never auto-created by onboarding.

## Adults Only

### Adult Products (`adult_products`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `adult_products`. Historical source `MP_adult_products`. Status planned / not started / not run.

Discreet packaged goods with age-check and signature policy; product selection and delivery are orders, not appointments.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_adult_products_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Adult Wellness (`adult_wellness`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `adult_wellness`. Historical source `MP_adult_wellness`. Status planned / not started / not run.

Clarify whether each offering is a product, a booked wellness service or a home visit; preserve discreet event summaries.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `SELECTED_MODEL`: (Q_HOME_SERVICE eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.
- `APPOINTMENT` / `SELECTED_MODEL`: (BQ_BOOKING_ENABLED [bookingSetup.booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.accepts_scheduled_bookings] eq true AND context.selected_offering_kind eq "service"). An actual published service is selected and accepts scheduling; booking_required alone never decides optional booking availability.

Additional scoped decision/modifier references: `PD_adult_wellness_ADVANCE_REQUIREMENT`, `PD_adult_wellness_OPTIONAL_BOOKING_CLARIFICATION`, `PD_adult_wellness_CONTRADICTORY_BOOKING_INTENT`, `PD_adult_wellness_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- Product versus service model is unresolved until the actual offering is declared; home_service alone must not create work.

Acceptance: seven baseline scenarios and 8 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Cigarettes (`cigarettes`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `cigarettes`. Historical source `MP_cigarettes`. Status planned / not started / not run.

Licensed age-restricted tobacco orders with declared brands and minimum order; do not expose product detail in unrelated calendar views.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_cigarettes_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Cigars (`cigars`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `cigars`. Historical source `MP_cigars`. Status planned / not started / not run.

Licensed age-restricted cigar orders with gift packaging; packaging does not create a bookable service.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_cigars_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Vapes (`vapes`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `vapes`. Historical source `MP_vapes`. Status planned / not started / not run.

Device-type variants, license and age-check policy; order availability comes from inventory rather than empty calendar slots.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_vapes_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Adult Accessories (`adult_accessories`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `adult_accessories`. Historical source `MP_adult_accessories`. Status planned / not started / not run.

Discreet accessory orders with signature policy; generic delivery milestones need no personal appointment.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_adult_accessories_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Airport Transfers

### Airport Pickup (`airport_pickup`)

Suggested default: `TRANSFER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `airport_pickup`. Historical source `MP_airport_pickup`. Status planned / not started / not run.

Scheduled airport arrival pickup, passenger/luggage fit, flight-change policy and joint vehicle/driver occupancy.

Default-view template: Pickup agenda and vehicle/driver resource lanes with trip and waiting intervals. Actual view follows the eligible selected model.

Model-specific setup: transport included or greeter-only; pickup/dropoff and time; eligible actual resources; travel/wait buffers; passenger/luggage policy; flight-change policy where enabled.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Airport Drop-off (`airport_dropoff`)

Suggested default: `TRANSFER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `airport_dropoff`. Historical source `MP_airport_dropoff`. Status planned / not started / not run.

Scheduled airport drop-off with passenger pickup address, airport arrival target and feasible vehicle/driver interval.

Default-view template: Pickup agenda and vehicle/driver resource lanes with trip and waiting intervals. Actual view follows the eligible selected model.

Model-specific setup: transport included or greeter-only; pickup/dropoff and time; eligible actual resources; travel/wait buffers; passenger/luggage policy; flight-change policy where enabled.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Meet & Greet (`meet_greet`)

Suggested default: `TRANSFER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `meet_greet`. Historical source `MP_meet_greet`. Status planned / not started / not run.

Greeter, signage and waiting interval; explicitly distinguish greeter-only assistance from an included vehicle transfer.

Default-view template: Pickup agenda and vehicle/driver resource lanes with trip and waiting intervals. Actual view follows the eligible selected model.

Model-specific setup: transport included or greeter-only; pickup/dropoff and time; eligible actual resources; travel/wait buffers; passenger/luggage policy; flight-change policy where enabled.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_meet_greet_GREETER_ONLY`, `PD_meet_greet_GREETER_TRANSPORT`. See the effective profile for exact rules.

Reconciled decisions:

- Clarify greeter-only versus included transport; do not reserve an unnecessary vehicle.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Executive Transfer (`executive_transfer`)

Suggested default: `TRANSFER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `executive_transfer`. Historical source `MP_executive_transfer`. Status planned / not started / not run.

Executive-class vehicle eligibility, driver, pickup, waiting and corporate billing; flight tracking only where enabled.

Default-view template: Pickup agenda and vehicle/driver resource lanes with trip and waiting intervals. Actual view follows the eligible selected model.

Model-specific setup: transport included or greeter-only; pickup/dropoff and time; eligible actual resources; travel/wait buffers; passenger/luggage policy; flight-change policy where enabled.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Alcohol & Beverages

### Wine (`wine`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `wine`. Historical source `MP_wine`. Status planned / not started / not run.

Wine origin, age/license eligibility and cold/gift handling; scheduled delivery is explicitly offered, not automatic.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_wine_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Spirits (`spirits`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `spirits`. Historical source `MP_spirits`. Status planned / not started / not run.

Brand variants, licensed age-eligible order and gift wrapping; no appointment is inferred from corporate or gift demand.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_spirits_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Beer (`beer`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `beer`. Historical source `MP_beer`. Status planned / not started / not run.

Cold delivery and returnable-bottle handling attached to an order; bottle return does not become asset rental.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_beer_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Champagne (`champagne`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `champagne`. Historical source `MP_champagne`. Status planned / not started / not run.

Occasion-specific cold/gift handling and dated delivery promise only when the merchant accepts that promise.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_champagne_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Cocktail Mixers (`cocktail_mixers`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `cocktail_mixers`. Historical source `MP_cocktail_mixers`. Status planned / not started / not run.

Packaged mixer orders and minimum quantity with configured eligibility and gift packaging.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_cocktail_mixers_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Liquor Stores (`liquor_stores`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `liquor_stores`. Historical source `MP_liquor_stores`. Status planned / not started / not run.

Retail alcohol order, cold handling and corporate billing; store opening hours do not guarantee stock or delivery capacity.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_liquor_stores_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Fashion & Apparel

### Men's Fashion (`mens_fashion`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `mens_fashion`. Historical source `MP_mens_fashion`. Status planned / not started / not run.

Size/brand retail with separately enabled tailoring production and style consultation appointments.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `APPOINTMENT` / `SELECTED_MODEL`: (Q_STYLE_CONSULTATION eq true AND BQ_BOOKING_ENABLED [bookingSetup.booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.accepts_scheduled_bookings] eq true AND context.selected_offering_kind eq "service"). An actual published service is selected and accepts scheduling; booking_required alone never decides optional booking availability.
- `PRODUCTION_DUE` / `SELECTED_MODEL`: (Q_CUSTOM_TAILORING eq true AND BQ_CUSTOM_ORDER_KIND [bookingSetup.custom_order_kind] eq "made_to_specification" AND context.selected_offering_kind eq "made_to_order"). Custom creation, not standard stock or special sourcing. Work is instantiated only after accepted specification and applicable command.

Additional scoped decision/modifier references: `PD_mens_fashion_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 8 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Women's Fashion (`womens_fashion`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `womens_fashion`. Historical source `MP_womens_fashion`. Status planned / not started / not run.

Size/brand retail, custom tailoring and style consultations as distinct activities sharing configured staff where relevant.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `APPOINTMENT` / `SELECTED_MODEL`: (Q_STYLE_CONSULTATION eq true AND BQ_BOOKING_ENABLED [bookingSetup.booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.accepts_scheduled_bookings] eq true AND context.selected_offering_kind eq "service"). An actual published service is selected and accepts scheduling; booking_required alone never decides optional booking availability.
- `PRODUCTION_DUE` / `SELECTED_MODEL`: (Q_CUSTOM_TAILORING eq true AND BQ_CUSTOM_ORDER_KIND [bookingSetup.custom_order_kind] eq "made_to_specification" AND context.selected_offering_kind eq "made_to_order"). Custom creation, not standard stock or special sourcing. Work is instantiated only after accepted specification and applicable command.

Additional scoped decision/modifier references: `PD_womens_fashion_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 8 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Kids Fashion (`kids_fashion`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `kids_fashion`. Historical source `MP_kids_fashion`. Status planned / not started / not run.

Age/size retail and school uniform offering details; uniforms do not automatically imply custom production or fittings.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_kids_fashion_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Shoes (`shoes`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `shoes`. Historical source `MP_shoes`. Status planned / not started / not run.

Shoe-size-system variants and retail returns; no fitting appointment unless an actual bookable service is added.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_shoes_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Bags (`bags`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `bags`. Historical source `MP_bags`. Status planned / not started / not run.

Authenticity/warranty declarations and bag inventory; product checks are not staff-time reservations.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_bags_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Watches (`watches`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `watches`. Historical source `MP_watches`. Status planned / not started / not run.

Watch inventory and declared warranty/authenticity; repair or valuation services require a separately configured activity.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_watches_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Accessories (`accessories`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `accessories`. Historical source `MP_accessories`. Status planned / not started / not run.

Fashion accessory inventory, physical-store collection if offered and return policies; no default appointment calendar.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_accessories_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Beauty

### Makeup (`makeup`)

Suggested default: `APPOINTMENT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `makeup`. Historical source `MP_makeup`. Status planned / not started / not run.

Artist eligibility, exact makeup duration, bridal/event package resources and home travel; product sales remain a separate order activity.

Default-view template: Day/week staff-resource calendar plus agenda and booking detail. Actual view follows the eligible selected model.

Model-specific setup: accepts scheduled bookings; requires advance booking separately; exact duration; eligible resources and schedules; lead time/horizon/buffers; onsite/remote methods; approval and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `SELECTED_MODEL`: (Q_HOME_SERVICE eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.
- `ORDER` / `SELECTED_MODEL`: (Q_PRODUCTS_FOR_SALE eq true AND context.selected_offering_kind eq "product"). Only an actual product offering gets ORDER. This does not preserve an unrelated service primary for product-only selection.

Additional scoped decision/modifier references: `PD_makeup_ADVANCE_REQUIREMENT`, `PD_makeup_OPTIONAL_BOOKING_CLARIFICATION`, `PD_makeup_CONTRADICTORY_BOOKING_INTENT`, `PD_makeup_PUBLIC_SCHEDULED_BOOKING_DISABLED`. See the effective profile for exact rules.

Reconciled decisions:

- booking_required=no does not prove scheduled booking is unavailable; ask whether optional bookings are offered.

Acceptance: seven baseline scenarios and 8 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Skincare (`skincare`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `skincare`. Historical source `MP_skincare`. Status planned / not started / not run.

Distinguish skincare products from routine consultations and home services; merchant-declared skin suitability is not clinical verification.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `SELECTED_MODEL`: (Q_HOME_SERVICE eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.
- `APPOINTMENT` / `SELECTED_MODEL`: (Q_CUSTOM_ROUTINE_CONSULT eq true AND BQ_BOOKING_ENABLED [bookingSetup.booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.accepts_scheduled_bookings] eq true AND context.selected_offering_kind eq "service"). An actual published service is selected and accepts scheduling; booking_required alone never decides optional booking availability.

Additional scoped decision/modifier references: `PD_skincare_NO_PRODUCT_SALES`, `PD_skincare_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 8 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Haircare (`haircare`)

Suggested default: `APPOINTMENT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `haircare`. Historical source `MP_haircare`. Status planned / not started / not run.

Stylist/chair/service-duration resources, walk-in versus booked intake and home visits; product retail can coexist.

Default-view template: Day/week staff-resource calendar plus agenda and booking detail. Actual view follows the eligible selected model.

Model-specific setup: accepts scheduled bookings; requires advance booking separately; exact duration; eligible resources and schedules; lead time/horizon/buffers; onsite/remote methods; approval and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `SELECTED_MODEL`: (Q_HOME_VISITS eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.
- `ORDER` / `SELECTED_MODEL`: (Q_PRODUCTS_FOR_SALE eq true AND context.selected_offering_kind eq "product"). Only an actual product offering gets ORDER. This does not preserve an unrelated service primary for product-only selection.

Additional scoped decision/modifier references: `PD_haircare_ADVANCE_REQUIREMENT`, `PD_haircare_OPTIONAL_BOOKING_CLARIFICATION`, `PD_haircare_CONTRADICTORY_BOOKING_INTENT`, `PD_haircare_PUBLIC_SCHEDULED_BOOKING_DISABLED`. See the effective profile for exact rules.

Reconciled decisions:

- booking_required=no does not prove scheduled booking is unavailable; preserve optional appointments when explicitly offered.

Acceptance: seven baseline scenarios and 8 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Fragrances (`fragrances`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `fragrances`. Historical source `MP_fragrances`. Status planned / not started / not run.

Fragrance-family retail with gift wrapping; products_for_sale=no requires offering clarification rather than an invented appointment.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_fragrances_NO_PRODUCT_SALES`, `PD_fragrances_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Cosmetics Stores (`cosmetics_stores`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `cosmetics_stores`. Historical source `MP_cosmetics_stores`. Status planned / not started / not run.

Own/multiple brands, physical store and minimum-order retail; cosmetics inventory is separate from appointment capacity.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_cosmetics_stores_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Vehicle Rentals

### Car Rental (`car_rental`)

Suggested default: `ASSET_INTERVAL`. [Effective profile](reconciliation/effective-profiles-128.json), reference `car_rental`. Historical source `MP_car_rental`. Status planned / not started / not run.

Individual rental asset, exact start/end and return condition, fuel/deposit/insurance policy and optional qualified driver allocation.

Default-view template: Asset-by-date interval timeline with handover, return and maintenance. Actual view follows the eligible selected model.

Model-specific setup: actual asset IDs; range/minimum/maximum policy; handover/return locations and times; turnaround/maintenance; eligibility/deposit/fuel terms if relevant; driver policy where applicable.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_car_rental_DRIVER_OPTION`, `PD_car_rental_SELF_DRIVE_OPTION`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Self Drive (`self_drive`)

Suggested default: `ASSET_INTERVAL`. [Effective profile](reconciliation/effective-profiles-128.json), reference `self_drive`. Historical source `MP_self_drive`. Status planned / not started / not run.

Exclusive self-drive vehicle interval with age eligibility, fuel/deposit terms, handover, return and maintenance blocks.

Default-view template: Asset-by-date interval timeline with handover, return and maintenance. Actual view follows the eligible selected model.

Model-specific setup: actual asset IDs; range/minimum/maximum policy; handover/return locations and times; turnaround/maintenance; eligibility/deposit/fuel terms if relevant; driver policy where applicable.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Corporate Rental (`corporate_rental`)

Suggested default: `ASSET_INTERVAL`. [Effective profile](reconciliation/effective-profiles-128.json), reference `corporate_rental`. Historical source `MP_corporate_rental`. Status planned / not started / not run.

Corporate vehicle occupancy independent of billing cycle; dedicated account manager is not automatically a bookable driver.

Default-view template: Asset-by-date interval timeline with handover, return and maintenance. Actual view follows the eligible selected model.

Model-specific setup: actual asset IDs; range/minimum/maximum policy; handover/return locations and times; turnaround/maintenance; eligibility/deposit/fuel terms if relevant; driver policy where applicable.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Long-Term Rental (`long_term_rental`)

Suggested default: `ASSET_INTERVAL`. [Effective profile](reconciliation/effective-profiles-128.json), reference `long_term_rental`. Historical source `MP_long_term_rental`. Status planned / not started / not run.

Long occupancy intervals, extension conflict checks, maintenance and agreed return; billing periods do not reset vehicle capacity.

Default-view template: Asset-by-date interval timeline with handover, return and maintenance. Actual view follows the eligible selected model.

Model-specific setup: actual asset IDs; range/minimum/maximum policy; handover/return locations and times; turnaround/maintenance; eligibility/deposit/fuel terms if relevant; driver policy where applicable.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Bike Rental (`bike_rental`)

Suggested default: `ASSET_INTERVAL`. [Effective profile](reconciliation/effective-profiles-128.json), reference `bike_rental`. Historical source `MP_bike_rental`. Status planned / not started / not run.

Bike-type/asset interval and return; if driver service is genuinely offered, allocate its qualified rider without creating an airport transfer.

Default-view template: Asset-by-date interval timeline with handover, return and maintenance. Actual view follows the eligible selected model.

Model-specific setup: actual asset IDs; range/minimum/maximum policy; handover/return locations and times; turnaround/maintenance; eligibility/deposit/fuel terms if relevant; driver policy where applicable.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_bike_rental_DRIVER_OPTION`, `PD_bike_rental_SELF_DRIVE_OPTION`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Experiences

### Concerts (`concerts`)

Suggested default: `SESSION_CAPACITY`. [Effective profile](reconciliation/effective-profiles-128.json), reference `concerts`. Historical source `MP_concerts`. Status planned / not started / not run.

Dated ticket/session places, VIP inventory where configured and ticket delivery; attendee bands are not actual remaining seats.

Default-view template: Dated session list/calendar with held, confirmed and remaining places. Actual view follows the eligible selected model.

Model-specific setup: actual dated sessions; exact capacity; ticket/place quantities; required resources; occurrence duration; booking/check-in policy; series and exception rule if recurring.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_concerts_PUBLIC_SCHEDULED_BOOKING_DISABLED`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Festivals (`festivals`)

Suggested default: `SESSION_CAPACITY`. [Effective profile](reconciliation/effective-profiles-128.json), reference `festivals`. Historical source `MP_festivals`. Status planned / not started / not run.

Dated festival admission inventory and optional multi-day passes; a pass entitlement and each controlled session's capacity stay explicit.

Default-view template: Dated session list/calendar with held, confirmed and remaining places. Actual view follows the eligible selected model.

Model-specific setup: actual dated sessions; exact capacity; ticket/place quantities; required resources; occurrence duration; booking/check-in policy; series and exception rule if recurring.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_festivals_PUBLIC_SCHEDULED_BOOKING_DISABLED`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Conferences (`conferences`)

Suggested default: `SESSION_CAPACITY`. [Effective profile](reconciliation/effective-profiles-128.json), reference `conferences`. Historical source `MP_conferences`. Status planned / not started / not run.

Conference session/admission capacity plus venue, AV and catering dependencies under their actual owners.

Default-view template: Dated session list/calendar with held, confirmed and remaining places. Actual view follows the eligible selected model.

Model-specific setup: actual dated sessions; exact capacity; ticket/place quantities; required resources; occurrence duration; booking/check-in policy; series and exception rule if recurring.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_conferences_PUBLIC_SCHEDULED_BOOKING_DISABLED`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Private Events (`private_events`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `private_events`. Historical source `MP_private_events`. Status planned / not started / not run.

Requested date/headcount and venue/planning scope; bind actual venue/team capacity only after quote and supplier acceptance.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_private_events_ACCEPTED_SCOPE_COMMITMENT`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Photography (`photography`)

Suggested default: `APPOINTMENT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `photography`. Historical source `MP_photography`. Status planned / not started / not run.

Photographer/equipment interval, exact session duration and group limit; travel/home location only when selected.

Default-view template: Day/week staff-resource calendar plus agenda and booking detail. Actual view follows the eligible selected model.

Model-specific setup: accepts scheduled bookings; requires advance booking separately; exact duration; eligible resources and schedules; lead time/horizon/buffers; onsite/remote methods; approval and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `SELECTED_MODEL`: (Q_HOME_SERVICE eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_photography_ADVANCE_REQUIREMENT`, `PD_photography_OPTIONAL_BOOKING_CLARIFICATION`, `PD_photography_CONTRADICTORY_BOOKING_INTENT`, `PD_photography_PUBLIC_SCHEDULED_BOOKING_DISABLED`. See the effective profile for exact rules.

Reconciled decisions:

- booking_required=no does not justify deleting optional scheduled sessions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Workshops (`workshops`)

Suggested default: `SESSION_CAPACITY`. [Effective profile](reconciliation/effective-profiles-128.json), reference `workshops`. Historical source `MP_workshops`. Status planned / not started / not run.

Dated workshop capacity, facilitator/equipment and duration; walk-in admissions still consume the same session pool.

Default-view template: Dated session list/calendar with held, confirmed and remaining places. Actual view follows the eligible selected model.

Model-specific setup: actual dated sessions; exact capacity; ticket/place quantities; required resources; occurrence duration; booking/check-in policy; series and exception rule if recurring.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_workshops_ADVANCE_REQUIREMENT`, `PD_workshops_OPTIONAL_BOOKING_CLARIFICATION`, `PD_workshops_CONTRADICTORY_BOOKING_INTENT`, `PD_workshops_PUBLIC_SCHEDULED_BOOKING_DISABLED`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Classes (`classes`)

Suggested default: `SESSION_CAPACITY`. [Effective profile](reconciliation/effective-profiles-128.json), reference `classes`. Historical source `MP_classes`. Status planned / not started / not run.

Dated class places and recurring occurrences; recurrence does not create a paid membership or renewal contract.

Default-view template: Dated session list/calendar with held, confirmed and remaining places. Actual view follows the eligible selected model.

Model-specific setup: actual dated sessions; exact capacity; ticket/place quantities; required resources; occurrence duration; booking/check-in policy; series and exception rule if recurring.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `ENTITLEMENT` / `SELECTED_MODEL`: (BQ_MEMBERSHIP_PLAN_ENABLED [bookingSetup.membership_plan_enabled] eq true AND BQ_ENTITLEMENT_POLICY [bookingSetup.entitlement_policy] nonempty true AND context.selected_offering_kind eq "plan"). Explicit commercial plan selection, independent of recurrence or subscription discovery flags. No calendar allocation follows from plan purchase alone.

Additional scoped decision/modifier references: `PD_classes_ADVANCE_REQUIREMENT`, `PD_classes_OPTIONAL_BOOKING_CLARIFICATION`, `PD_classes_CONTRADICTORY_BOOKING_INTENT`, `PD_classes_PUBLIC_SCHEDULED_BOOKING_DISABLED`, `PD_classes_RECURRENCE_DISCOVERY`, `PD_classes_RECURRENCE_ACTIVE`. See the effective profile for exact rules.

Reconciled decisions:

- Recurring sessions are recurrence, not automatic membership or plan renewal.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Sports Activities (`sports_activities`)

Suggested default: `SESSION_CAPACITY`. [Effective profile](reconciliation/effective-profiles-128.json), reference `sports_activities`. Historical source `MP_sports_activities`. Status planned / not started / not run.

Session participant capacity and required instructor/equipment/space; repeated sessions and membership are distinct.

Default-view template: Dated session list/calendar with held, confirmed and remaining places. Actual view follows the eligible selected model.

Model-specific setup: actual dated sessions; exact capacity; ticket/place quantities; required resources; occurrence duration; booking/check-in policy; series and exception rule if recurring.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `ENTITLEMENT` / `SELECTED_MODEL`: (BQ_MEMBERSHIP_PLAN_ENABLED [bookingSetup.membership_plan_enabled] eq true AND BQ_ENTITLEMENT_POLICY [bookingSetup.entitlement_policy] nonempty true AND context.selected_offering_kind eq "plan"). Explicit commercial plan selection, independent of recurrence or subscription discovery flags. No calendar allocation follows from plan purchase alone.

Additional scoped decision/modifier references: `PD_sports_activities_ADVANCE_REQUIREMENT`, `PD_sports_activities_OPTIONAL_BOOKING_CLARIFICATION`, `PD_sports_activities_CONTRADICTORY_BOOKING_INTENT`, `PD_sports_activities_PUBLIC_SCHEDULED_BOOKING_DISABLED`, `PD_sports_activities_RECURRENCE_DISCOVERY`, `PD_sports_activities_RECURRENCE_ACTIVE`. See the effective profile for exact rules.

Reconciled decisions:

- Recurring sessions do not automatically create paid membership/renewal capability.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Recreation (`recreation`)

Suggested default: `SESSION_CAPACITY`. [Effective profile](reconciliation/effective-profiles-128.json), reference `recreation`. Historical source `MP_recreation`. Status planned / not started / not run.

Dated recreation activity capacity and equipment with booking window; walk-ins require a live capacity check.

Default-view template: Dated session list/calendar with held, confirmed and remaining places. Actual view follows the eligible selected model.

Model-specific setup: actual dated sessions; exact capacity; ticket/place quantities; required resources; occurrence duration; booking/check-in policy; series and exception rule if recurring.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_recreation_ADVANCE_REQUIREMENT`, `PD_recreation_OPTIONAL_BOOKING_CLARIFICATION`, `PD_recreation_CONTRADICTORY_BOOKING_INTENT`, `PD_recreation_PUBLIC_SCHEDULED_BOOKING_DISABLED`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Financial Services

### Banking (`banking`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `banking`. Historical source `MP_banking`. Status planned / not started / not run.

Administrative banking enquiry or explicitly offered consultation; calendar confirmation does not approve an account, loan or funds movement.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `APPOINTMENT` / `SELECTED_MODEL`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.accepts_scheduled_bookings] eq true AND context.selected_offering_kind eq "service"). An actual published service is selected and accepts scheduling; booking_required alone never decides optional booking availability.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Forex (`forex`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `forex`. Historical source `MP_forex`. Status planned / not started / not run.

Currency-service enquiry and optional staff consultation; a time reservation never locks an exchange rate or currency inventory.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `APPOINTMENT` / `SELECTED_MODEL`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.accepts_scheduled_bookings] eq true AND context.selected_offering_kind eq "service"). An actual published service is selected and accepts scheduling; booking_required alone never decides optional booking availability.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Insurance (`insurance`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `insurance`. Historical source `MP_insurance`. Status planned / not started / not run.

Insurance enquiry/provider appointment where offered; no calendar event binds cover or underwriting approval.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `APPOINTMENT` / `SELECTED_MODEL`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.accepts_scheduled_bookings] eq true AND context.selected_offering_kind eq "service"). An actual published service is selected and accepts scheduling; booking_required alone never decides optional booking availability.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Payments (`payments`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `payments`. Historical source `MP_payments`. Status planned / not started / not run.

Payment-service enquiry or handoff; this booking module does not reserve financial balances or operate payment rails.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `APPOINTMENT` / `SELECTED_MODEL`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.accepts_scheduled_bookings] eq true AND context.selected_offering_kind eq "service"). An actual published service is selected and accepts scheduling; booking_required alone never decides optional booking availability.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Remittance (`remittance`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `remittance`. Historical source `MP_remittance`. Status planned / not started / not run.

Corridor/provider enquiry and optional appointment; transfer acceptance and compliance remain with the authorized provider.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `APPOINTMENT` / `SELECTED_MODEL`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.accepts_scheduled_bookings] eq true AND context.selected_offering_kind eq "service"). An actual published service is selected and accepts scheduling; booking_required alone never decides optional booking availability.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Sacco Services (`sacco_services`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `sacco_services`. Historical source `MP_sacco_services`. Status planned / not started / not run.

SACCO-service administrative request and optional local office consultation; financial entitlement is not calendar capacity.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `APPOINTMENT` / `SELECTED_MODEL`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.accepts_scheduled_bookings] eq true AND context.selected_offering_kind eq "service"). An actual published service is selected and accepts scheduling; booking_required alone never decides optional booking availability.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Business Services (`business_services`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `business_services`. Historical source `MP_business_services`. Status planned / not started / not run.

Declared financial/business-service enquiry; classify an actual offered consultation explicitly before booking staff time.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `APPOINTMENT` / `SELECTED_MODEL`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.accepts_scheduled_bookings] eq true AND context.selected_offering_kind eq "service"). An actual published service is selected and accepts scheduling; booking_required alone never decides optional booking availability.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Flowers & Gifts

### Flowers (`flowers`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `flowers`. Historical source `MP_flowers`. Status planned / not started / not run.

Fresh/preserved bouquets, custom message and accepted delivery date; recurring bouquet orders do not imply membership billing.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `ENTITLEMENT` / `SELECTED_MODEL`: (BQ_MEMBERSHIP_PLAN_ENABLED [bookingSetup.membership_plan_enabled] eq true AND BQ_ENTITLEMENT_POLICY [bookingSetup.entitlement_policy] nonempty true AND context.selected_offering_kind eq "plan"). Explicit commercial plan selection, independent of recurrence or subscription discovery flags. No calendar allocation follows from plan purchase alone.

Additional scoped decision/modifier references: `PD_flowers_RECURRENCE_DISCOVERY`, `PD_flowers_RECURRENCE_ACTIVE`, `PD_flowers_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- Recurring bouquet orders do not automatically create membership entitlement or renewal billing.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Gift Hampers (`gift_hampers`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `gift_hampers`. Historical source `MP_gift_hampers`. Status planned / not started / not run.

Hamper order and gift message; custom curation can require approved specification and production lead time.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `PRODUCTION_DUE` / `SELECTED_MODEL`: (Q_CUSTOM_CURATION eq true AND BQ_CUSTOM_ORDER_KIND [bookingSetup.custom_order_kind] eq "made_to_specification" AND context.selected_offering_kind eq "made_to_order"). Custom creation, not standard stock or special sourcing. Work is instantiated only after accepted specification and applicable command.

Additional scoped decision/modifier references: `PD_gift_hampers_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Cakes (`cakes`)

Suggested default: `PRODUCTION_DUE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `cakes`. Historical source `MP_cakes`. Status planned / not started / not run.

Accepted cake design, dietary specification, exact advance cutoff and production/delivery promise; design approval precedes commitment where required.

Default-view template: Specification/approval work queue and production due-date/capacity view. Actual view follows the eligible selected model.

Model-specific setup: actual custom creation versus sourcing; specification/approval; exact preparation lead time; capacity unit; due date/cutoff; handoff method; change/price policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Chocolates (`chocolates`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `chocolates`. Historical source `MP_chocolates`. Status planned / not started / not run.

Gift-wrapped chocolate order, message and delivery promise if offered; no appointment resource is allocated.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_chocolates_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Personalized Gifts (`personalized_gifts`)

Suggested default: `PRODUCTION_DUE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `personalized_gifts`. Historical source `MP_personalized_gifts`. Status planned / not started / not run.

Approved personalization and due date with production capacity and corporate quantity; preserve specification revisions.

Default-view template: Specification/approval work queue and production due-date/capacity view. Actual view follows the eligible selected model.

Model-specific setup: actual custom creation versus sourcing; specification/approval; exact preparation lead time; capacity unit; due date/cutoff; handoff method; change/price policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Occasion Gifts (`occasion_gifts`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `occasion_gifts`. Historical source `MP_occasion_gifts`. Status planned / not started / not run.

Occasion/message/gift wrapping order with optional promised delivery date; occasion alone is not a reservation.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_occasion_gifts_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Restaurants & Food

### Restaurant (`restaurant`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `restaurant`. Historical source `MP_restaurant`. Status planned / not started / not run.

Food orders plus separately enabled table reservations with party size, table compatibility, dining interval and turnover.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `SPACE_RESERVATION` / `SELECTED_MODEL`: (BQ_OFFERS_TABLE_RESERVATIONS [bookingSetup.offers_table_reservations] eq true AND context.selected_offering_kind eq "space_reservation"). reservation_system is connection discovery only. Restaurant food ORDER remains on product offerings; table variant uses SPACE_RESERVATION.

Additional scoped decision/modifier references: `PD_restaurant_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- reservation_system discovers an existing system only and cannot activate table booking. Require bookingSetup.offers_table_reservations plus validated authority, tables/party compatibility and turnover; use SPACE_RESERVATION rather than generic appointment behavior.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Fast Food (`fast_food`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `fast_food`. Historical source `MP_fast_food`. Status planned / not started / not run.

Food preparation/collection/delivery promise with drive-through or family-meal variants; no table reservation is inferred.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_fast_food_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Café (`cafe`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `cafe`. Historical source `MP_cafe`. Status planned / not started / not run.

Food/drink order; seated_capacity or coworking_space does not enable a seat/desk booking without an explicit offering.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_cafe_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- seated_capacity and coworking_space do not enable seat/desk reservations by themselves.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Bakery (`bakery`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `bakery`. Historical source `MP_bakery`. Status planned / not started / not run.

Standard bakery orders and explicitly custom production with exact advance cutoff and fulfilment promise.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `PRODUCTION_DUE` / `SELECTED_MODEL`: (Q_CUSTOM_ORDERS eq true AND BQ_CUSTOM_ORDER_KIND [bookingSetup.custom_order_kind] eq "made_to_specification" AND context.selected_offering_kind eq "made_to_order"). Custom creation, not standard stock or special sourcing. Work is instantiated only after accepted specification and applicable command.

Additional scoped decision/modifier references: `PD_bakery_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Desserts (`desserts`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `desserts`. Historical source `MP_desserts`. Status planned / not started / not run.

Dessert inventory or custom accepted specification, dietary detail and production promise; distinguish stock from made-to-order.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `PRODUCTION_DUE` / `SELECTED_MODEL`: (Q_CUSTOM_ORDERS eq true AND BQ_CUSTOM_ORDER_KIND [bookingSetup.custom_order_kind] eq "made_to_specification" AND context.selected_offering_kind eq "made_to_order"). Custom creation, not standard stock or special sourcing. Work is instantiated only after accepted specification and applicable command.

Additional scoped decision/modifier references: `PD_desserts_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Juice Bar (`juice_bar`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `juice_bar`. Historical source `MP_juice_bar`. Status planned / not started / not run.

Drink/food orders; detox_programs describes an offering and does not automatically create clinical sessions or subscriptions.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_juice_bar_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Cloud Kitchen (`cloud_kitchen`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `cloud_kitchen`. Historical source `MP_cloud_kitchen`. Status planned / not started / not run.

Brand/menu preparation and delivery; collection windows apply only when pickup is offered and exact capacity is configured.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_cloud_kitchen_NO_COLLECTION`, `PD_cloud_kitchen_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Catering (`catering`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `catering`. Historical source `MP_catering`. Status planned / not started / not run.

Requested headcount/menu/date, staffing and equipment scope; quote approval links production and event resources without duplicate charges.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_catering_ACCEPTED_SCOPE_COMMITMENT`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Groceries & Essentials

### Supermarket (`supermarket`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `supermarket`. Historical source `MP_supermarket`. Status planned / not started / not run.

Stock-owned grocery orders; delivery/collection windows and express cutoffs only when explicitly configured.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_supermarket_NO_COLLECTION`, `PD_supermarket_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Convenience Store (`convenience_store`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `convenience_store`. Historical source `MP_convenience_store`. Status planned / not started / not run.

Retail essentials and optional express fulfilment; 24-hour opening does not mean continuous free delivery capacity.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_convenience_store_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Fresh Produce (`fresh_produce`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `fresh_produce`. Historical source `MP_fresh_produce`. Status planned / not started / not run.

Perishable quantity orders, market dates and optionally recurring boxes; recurring fulfilment and membership are separate.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `ENTITLEMENT` / `SELECTED_MODEL`: (BQ_MEMBERSHIP_PLAN_ENABLED [bookingSetup.membership_plan_enabled] eq true AND BQ_ENTITLEMENT_POLICY [bookingSetup.entitlement_policy] nonempty true AND context.selected_offering_kind eq "plan"). Explicit commercial plan selection, independent of recurrence or subscription discovery flags. No calendar allocation follows from plan purchase alone.

Additional scoped decision/modifier references: `PD_fresh_produce_RECURRENCE_DISCOVERY`, `PD_fresh_produce_RECURRENCE_ACTIVE`, `PD_fresh_produce_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- Subscription boxes need repeated-order/fulfilment rules; paid membership is a separate explicit commercial plan.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Butchery (`butchery`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `butchery`. Historical source `MP_butchery`. Status planned / not started / not run.

Measured cut order and advance preparation cutoff; custom cuts require accepted quantity/specification, not a customer appointment.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_butchery_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Seafood (`seafood`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `seafood`. Historical source `MP_seafood`. Status planned / not started / not run.

Measured seafood inventory and processing/handling promise; live or onsite processing facts do not establish free processing capacity.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_seafood_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Organic Store (`organic_store`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `organic_store`. Historical source `MP_organic_store`. Status planned / not started / not run.

Retail organic/store packaging attributes and optional configured fulfilment windows; no booking activity is inferred.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_organic_store_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Laundry & Cleaning

### Laundry (`laundry`)

Suggested default: `LINKED_WINDOWS`. [Effective profile](reconciliation/effective-profiles-128.json), reference `laundry`. Historical source `MP_laundry`. Status planned / not started / not run.

Measured laundry intake, collection or customer drop-off, processing turnaround and independently feasible return window.

Default-view template: Linked collection, processing and return agenda with separate commitments. Actual view follows the eligible selected model.

Model-specific setup: pickup/delivery versus customer drop-off; exact turnaround/cutoff; processing capacity; collection and return windows; coverage and transport capacity if selected; acceptance/price policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_laundry_CUSTOMER_DROPOFF`, `PD_laundry_COLLECTION_DELIVERY_OFFERED`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Dry Cleaning (`dry_cleaning`)

Suggested default: `LINKED_WINDOWS`. [Effective profile](reconciliation/effective-profiles-128.json), reference `dry_cleaning`. Historical source `MP_dry_cleaning`. Status planned / not started / not run.

Garment-type/item intake, processing turnaround and linked collection/return commitments under their actual capacity owners.

Default-view template: Linked collection, processing and return agenda with separate commitments. Actual view follows the eligible selected model.

Model-specific setup: pickup/delivery versus customer drop-off; exact turnaround/cutoff; processing capacity; collection and return windows; coverage and transport capacity if selected; acceptance/price policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_dry_cleaning_CUSTOMER_DROPOFF`, `PD_dry_cleaning_COLLECTION_DELIVERY_OFFERED`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Ironing (`ironing`)

Suggested default: `LINKED_WINDOWS`. [Effective profile](reconciliation/effective-profiles-128.json), reference `ironing`. Historical source `MP_ironing`. Status planned / not started / not run.

Item-based ironing intake and processing promise; transport legs only when pickup/delivery is offered.

Default-view template: Linked collection, processing and return agenda with separate commitments. Actual view follows the eligible selected model.

Model-specific setup: pickup/delivery versus customer drop-off; exact turnaround/cutoff; processing capacity; collection and return windows; coverage and transport capacity if selected; acceptance/price policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_ironing_CUSTOMER_DROPOFF`, `PD_ironing_COLLECTION_DELIVERY_OFFERED`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Home Cleaning (`home_cleaning`)

Suggested default: `FIELD_VISIT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `home_cleaning`. Historical source `MP_home_cleaning`. Status planned / not started / not run.

Household visit duration, eligible crew/equipment, customer address/service area and travel; recurrence separate from paid subscription.

Default-view template: Team visit agenda and resource calendar with service location and travel constraints. Actual view follows the eligible selected model.

Model-specific setup: actual service; service area; customer access/address; team eligibility; exact visit duration; travel and setup buffers; arrival window; dispatch/approval policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `ENTITLEMENT` / `SELECTED_MODEL`: (BQ_MEMBERSHIP_PLAN_ENABLED [bookingSetup.membership_plan_enabled] eq true AND BQ_ENTITLEMENT_POLICY [bookingSetup.entitlement_policy] nonempty true AND context.selected_offering_kind eq "plan"). Explicit commercial plan selection, independent of recurrence or subscription discovery flags. No calendar allocation follows from plan purchase alone.

Additional scoped decision/modifier references: `PD_home_cleaning_RECURRENCE_DISCOVERY`, `PD_home_cleaning_RECURRENCE_ACTIVE`. See the effective profile for exact rules.

Reconciled decisions:

- Recurring visit pattern and commercial subscription/renewal are separate; each occurrence must have capacity.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Office Cleaning (`office_cleaning`)

Suggested default: `FIELD_VISIT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `office_cleaning`. Historical source `MP_office_cleaning`. Status planned / not started / not run.

Office visit crew/hours and site constraints, equipment and travel; recurring schedules remain actual dated commitments.

Default-view template: Team visit agenda and resource calendar with service location and travel constraints. Actual view follows the eligible selected model.

Model-specific setup: actual service; service area; customer access/address; team eligibility; exact visit duration; travel and setup buffers; arrival window; dispatch/approval policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `ENTITLEMENT` / `SELECTED_MODEL`: (BQ_MEMBERSHIP_PLAN_ENABLED [bookingSetup.membership_plan_enabled] eq true AND BQ_ENTITLEMENT_POLICY [bookingSetup.entitlement_policy] nonempty true AND context.selected_offering_kind eq "plan"). Explicit commercial plan selection, independent of recurrence or subscription discovery flags. No calendar allocation follows from plan purchase alone.

Additional scoped decision/modifier references: `PD_office_cleaning_RECURRENCE_DISCOVERY`, `PD_office_cleaning_RECURRENCE_ACTIVE`. See the effective profile for exact rules.

Reconciled decisions:

- Recurring visit pattern and commercial subscription/renewal are separate; each occurrence must have capacity.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Marketplace

### Home & Living (`home_living`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `home_living`. Historical source `MP_home_living`. Status planned / not started / not run.

New/used household retail with fragile handling and return policy; delivery promises require actual owner acceptance.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_home_living_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Furniture (`furniture`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `furniture`. Historical source `MP_furniture`. Status planned / not started / not run.

Furniture retail and optional installation visit linked to selected order/method; installer time is not implied for every product.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `LINKED_EXECUTION`: (Q_INSTALLATION_SERVICE eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_furniture_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Appliances (`appliances`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `appliances`. Historical source `MP_appliances`. Status planned / not started / not run.

Appliance inventory and warranty with optional installer/equipment visit; delivery and installation have distinct feasible times.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `LINKED_EXECUTION`: (Q_INSTALLATION_SERVICE eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_appliances_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Decor (`decor`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `decor`. Historical source `MP_decor`. Status planned / not started / not run.

Decor retail, condition and fragile/gift handling; no venue/styling appointment is inferred from category name.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_decor_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Kitchenware (`kitchenware`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `kitchenware`. Historical source `MP_kitchenware`. Status planned / not started / not run.

New/used kitchenware order and return policy, with optional configured fulfilment window.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_kitchenware_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Books (`books`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `books`. Historical source `MP_books`. Status planned / not started / not run.

Book inventory and special sourcing/custom request; clarify whether custom_orders means sourcing or genuine production.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `PRODUCTION_DUE` / `SELECTED_MODEL`: (Q_CUSTOM_ORDERS eq true AND BQ_CUSTOM_ORDER_KIND [bookingSetup.custom_order_kind] eq "made_to_specification" AND context.selected_offering_kind eq "made_to_order"). Custom creation, not standard stock or special sourcing. Work is instantiated only after accepted specification and applicable command.

Additional scoped decision/modifier references: `PD_books_BOOK_SOURCING`, `PD_books_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- custom_orders can mean special sourcing; clarify before enabling PRODUCTION_DUE.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Stationery (`stationery`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `stationery`. Historical source `MP_stationery`. Status planned / not started / not run.

Stationery retail, minimum quantity and corporate billing; corporate account status does not allocate time capacity.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_stationery_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Office Supplies (`office_supplies`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `office_supplies`. Historical source `MP_office_supplies`. Status planned / not started / not run.

Office supply quantities, minimum order and corporate billing; scheduled replenishment needs explicit configuration.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_office_supplies_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### General Retail (`general_retail`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `general_retail`. Historical source `MP_general_retail`. Status planned / not started / not run.

Declared product, condition and stock authority with optional delivery/collection promise; no generic appointment fallback.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_general_retail_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Pharmacy

### Pharmacy (`pharmacy_retail`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `pharmacy_retail`. Historical source `MP_pharmacy_retail`. Status planned / not started / not run.

Pharmacy order and declared pharmacist/cold-chain/prescription fulfilment gates; do not put prescription details in calendar titles.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_pharmacy_retail_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Medical Supplies (`medical_supplies`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `medical_supplies`. Historical source `MP_medical_supplies`. Status planned / not started / not run.

Medical supply quantities and corporate order terms; supply sales do not create patient appointments.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_medical_supplies_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Baby Products (`baby_products`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `baby_products`. Historical source `MP_baby_products`. Status planned / not started / not run.

Baby-product retail and optional recurring order plan; entitlement/billing is distinct from recurring delivery.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `ENTITLEMENT` / `SELECTED_MODEL`: (BQ_MEMBERSHIP_PLAN_ENABLED [bookingSetup.membership_plan_enabled] eq true AND BQ_ENTITLEMENT_POLICY [bookingSetup.entitlement_policy] nonempty true AND context.selected_offering_kind eq "plan"). Explicit commercial plan selection, independent of recurrence or subscription discovery flags. No calendar allocation follows from plan purchase alone.

Additional scoped decision/modifier references: `PD_baby_products_RECURRENCE_DISCOVERY`, `PD_baby_products_RECURRENCE_ACTIVE`, `PD_baby_products_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- subscription_available does not alone establish membership entitlement, renewal price or recurring reserved delivery.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Supplements (`supplements`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `supplements`. Historical source `MP_supplements`. Status planned / not started / not run.

Supplement inventory and authenticity declarations; no clinical consultation is inferred.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_supplements_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Health

### Clinics (`clinics`)

Suggested default: `APPOINTMENT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `clinics`. Historical source `MP_clinics`. Status planned / not started / not run.

Administrative clinic slot with eligible staff/room; explicitly distinguish appointment booking, walk-in queue and home visit.

Default-view template: Day/week staff-resource calendar plus agenda and booking detail. Actual view follows the eligible selected model.

Model-specific setup: accepts scheduled bookings; requires advance booking separately; exact duration; eligible resources and schedules; lead time/horizon/buffers; onsite/remote methods; approval and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `SELECTED_MODEL`: (Q_HOME_VISITS eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_clinics_NO_CLINIC_APPOINTMENTS`, `PD_clinics_PUBLIC_SCHEDULED_BOOKING_DISABLED`. See the effective profile for exact rules.

Reconciled decisions:

- appointment_booking=no must not retain an instant appointment claim merely because the base workflow is WF_APPOINTMENT.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Telemedicine (`telemedicine`)

Suggested default: `APPOINTMENT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `telemedicine`. Historical source `MP_telemedicine`. Status planned / not started / not run.

Eligible remote provider/time interval and session access readiness; no clinical record or clinical outcome in booking/calendar data.

Default-view template: Day/week staff-resource calendar plus agenda and booking detail. Actual view follows the eligible selected model.

Model-specific setup: accepts scheduled bookings; requires advance booking separately; exact duration; eligible resources and schedules; lead time/horizon/buffers; onsite/remote methods; approval and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_telemedicine_PUBLIC_SCHEDULED_BOOKING_DISABLED`, `PD_telemedicine_REMOTE_ONLY`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Labs (`labs`)

Suggested default: `APPOINTMENT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `labs`. Historical source `MP_labs`. Status planned / not started / not run.

Administrative lab/sample collection appointment or home collection; result turnaround is a separate administrative milestone, not a reserved session.

Default-view template: Day/week staff-resource calendar plus agenda and booking detail. Actual view follows the eligible selected model.

Model-specific setup: accepts scheduled bookings; requires advance booking separately; exact duration; eligible resources and schedules; lead time/horizon/buffers; onsite/remote methods; approval and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `SELECTED_MODEL`: (Q_HOME_SAMPLE_COLLECTION eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_labs_PUBLIC_SCHEDULED_BOOKING_DISABLED`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Mental Health (Therapy) (`mental_health`)

Suggested default: `APPOINTMENT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `mental_health`. Historical source `MP_mental_health`. Status planned / not started / not run.

Private administrative therapy slot with exact duration and selected online/in-person method; minimize sensitive calendar summaries.

Default-view template: Day/week staff-resource calendar plus agenda and booking detail. Actual view follows the eligible selected model.

Model-specific setup: accepts scheduled bookings; requires advance booking separately; exact duration; eligible resources and schedules; lead time/horizon/buffers; onsite/remote methods; approval and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_mental_health_PUBLIC_SCHEDULED_BOOKING_DISABLED`, `PD_mental_health_FORMAT_IN_PERSON`, `PD_mental_health_FORMAT_ONLINE`, `PD_mental_health_FORMAT_BOTH`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Coaching (`coaching`)

Suggested default: `APPOINTMENT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `coaching`. Historical source `MP_coaching`. Status planned / not started / not run.

Coach duration and online/in-person method, with separately configured group session capacity where offered.

Default-view template: Day/week staff-resource calendar plus agenda and booking detail. Actual view follows the eligible selected model.

Model-specific setup: accepts scheduled bookings; requires advance booking separately; exact duration; eligible resources and schedules; lead time/horizon/buffers; onsite/remote methods; approval and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `SESSION_CAPACITY` / `SELECTED_MODEL`: (Q_GROUP_SESSIONS eq true AND context.selected_session_kind eq "group"). Select actual dated group offering. A one-to-one service remains a different offering variant.

Additional scoped decision/modifier references: `PD_coaching_PUBLIC_SCHEDULED_BOOKING_DISABLED`, `PD_coaching_FORMAT_IN_PERSON`, `PD_coaching_FORMAT_ONLINE`, `PD_coaching_FORMAT_BOTH`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Tech & Electronics

### Smartphones (`smartphones`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `smartphones`. Historical source `MP_smartphones`. Status planned / not started / not run.

Device retail plus explicitly selected repair intake or trade-in assessment with separate quote/approval and device privacy policy.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `SERVICE_JOB` / `SELECTED_MODEL`: ((Q_REPAIR_SERVICES nonempty true OR Q_TRADE_IN_PROGRAM eq true) AND context.selected_offering_kind eq "service_job"). A job/assessment is actually selected. Queue intake and scheduled resource allocations remain separate.

Additional scoped decision/modifier references: `PD_smartphones_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Accessories (`tech_accessories`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `tech_accessories`. Historical source `MP_tech_accessories`. Status planned / not started / not run.

Tech accessory inventory, warranty and minimum quantity; no installation/repair booking unless separately offered.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_tech_accessories_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Computers (`computers`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `computers`. Historical source `MP_computers`. Status planned / not started / not run.

Computer inventory plus selected repair intake/assessment, exact workshop or appointment policy and device access consent.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `SERVICE_JOB` / `SELECTED_MODEL`: (Q_REPAIR_SERVICES nonempty true AND context.selected_offering_kind eq "service_job"). A job/assessment is actually selected. Queue intake and scheduled resource allocations remain separate.

Additional scoped decision/modifier references: `PD_computers_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Gaming (`gaming`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `gaming`. Historical source `MP_gaming`. Status planned / not started / not run.

Console/game/accessory inventory including pre-owned condition; category does not imply gaming-seat sessions.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_gaming_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Audio (`audio`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `audio`. Historical source `MP_audio`. Status planned / not started / not run.

Audio product inventory, warranty and return policy; demonstration or installation requires an explicit extra service.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_audio_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Telecom Services (`telecom_services`)

Suggested default: `SERVICE_JOB`. [Effective profile](reconciliation/effective-profiles-128.json), reference `telecom_services`. Historical source `MP_telecom_services`. Status planned / not started / not run.

Service intake and provider job requirements; device/accessory sales can coexist without becoming service appointments.

Default-view template: Intake/assessment/workshop queue with optional scheduled bay/resource agenda. Actual view follows the eligible selected model.

Model-specific setup: actual job types; walk-in/request/scheduled modes; intake requirements; assessment and approval policy; eligible technician/bay; promised completion distinct from visit time.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `ORDER` / `SELECTED_MODEL`: (Q_TELECOM_SERVICES_OFFERED intersects ["devices", "accessories"] AND context.selected_offering_kind eq "product"). Only an actual product offering gets ORDER. This does not preserve an unrelated service primary for product-only selection.

Additional scoped decision/modifier references: `PD_telecom_services_PRODUCT_VARIANT`, `PD_telecom_services_PUBLIC_SCHEDULED_BOOKING_DISABLED`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Smart Devices (`smart_devices`)

Suggested default: `ORDER`. [Effective profile](reconciliation/effective-profiles-128.json), reference `smart_devices`. Historical source `MP_smart_devices`. Status planned / not started / not run.

Smart-device retail and optional selected installer visit with eligible staff/equipment and service area.

Default-view template: Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no default appointment grid. Actual view follows the eligible selected model.

Model-specific setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `LINKED_EXECUTION`: (Q_INSTALLATION_SERVICE eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_smart_devices_OPTIONAL_FULFILMENT_WINDOWS`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Travel & Tours

### Safaris (`safaris`)

Suggested default: `TOUR`. [Effective profile](reconciliation/effective-profiles-128.json), reference `safaris`. Historical source `MP_safaris`. Status planned / not started / not run.

Dated departure or private multi-day itinerary, guest places and guide/vehicle allocations; accommodation confirmations remain with supplier owner.

Default-view template: Departure-capacity calendar and multi-day itinerary/resource agenda. Actual view follows the eligible selected model.

Model-specific setup: shared/private offering; exact departure/itinerary; participant bounds; guide/vehicle eligibility; actual inventory authority; supplier confirmation gates; inclusions and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_safaris_TOUR_RESOURCE_POLICY`, `PD_safaris_PRIVATE_TOUR`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Game Drives (`game_drives`)

Suggested default: `TOUR`. [Effective profile](reconciliation/effective-profiles-128.json), reference `game_drives`. Historical source `MP_game_drives`. Status planned / not started / not run.

Dated drive departure/occupancy, guest capacity, guide and private/shared vehicle policy with exact booking window.

Default-view template: Departure-capacity calendar and multi-day itinerary/resource agenda. Actual view follows the eligible selected model.

Model-specific setup: shared/private offering; exact departure/itinerary; participant bounds; guide/vehicle eligibility; actual inventory authority; supplier confirmation gates; inclusions and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_game_drives_TOUR_RESOURCE_POLICY`, `PD_game_drives_PRIVATE_TOUR`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Luxury Safaris (`luxury_safaris`)

Suggested default: `TOUR`. [Effective profile](reconciliation/effective-profiles-128.json), reference `luxury_safaris`. Historical source `MP_luxury_safaris`. Status planned / not started / not run.

Multi-day private/shared itinerary and guest/resource capacity; luxury/accommodation claims do not prove supplier availability.

Default-view template: Departure-capacity calendar and multi-day itinerary/resource agenda. Actual view follows the eligible selected model.

Model-specific setup: shared/private offering; exact departure/itinerary; participant bounds; guide/vehicle eligibility; actual inventory authority; supplier confirmation gates; inclusions and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_luxury_safaris_TOUR_RESOURCE_POLICY`, `PD_luxury_safaris_PRIVATE_TOUR`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### City Tours (`city_tours`)

Suggested default: `TOUR`. [Effective profile](reconciliation/effective-profiles-128.json), reference `city_tours`. Historical source `MP_city_tours`. Status planned / not started / not run.

Tour mode, language-capable guide, exact duration and dated guest places; resources depend on walking/cycling/vehicle offering.

Default-view template: Departure-capacity calendar and multi-day itinerary/resource agenda. Actual view follows the eligible selected model.

Model-specific setup: shared/private offering; exact departure/itinerary; participant bounds; guide/vehicle eligibility; actual inventory authority; supplier confirmation gates; inclusions and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_city_tours_TOUR_RESOURCE_POLICY`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Cultural Tours (`cultural_tours`)

Suggested default: `TOUR`. [Effective profile](reconciliation/effective-profiles-128.json), reference `cultural_tours`. Historical source `MP_cultural_tours`. Status planned / not started / not run.

Dated guide/language/mode and guest group capacity; third-party access or venue confirmation is explicit.

Default-view template: Departure-capacity calendar and multi-day itinerary/resource agenda. Actual view follows the eligible selected model.

Model-specific setup: shared/private offering; exact departure/itinerary; participant bounds; guide/vehicle eligibility; actual inventory authority; supplier confirmation gates; inclusions and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_cultural_tours_TOUR_RESOURCE_POLICY`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Adventure Tours (`adventure_tours`)

Suggested default: `TOUR`. [Effective profile](reconciliation/effective-profiles-128.json), reference `adventure_tours`. Historical source `MP_adventure_tours`. Status planned / not started / not run.

Dated guest capacity and eligible guide/equipment/mode; equipment_provided does not identify actual available equipment.

Default-view template: Departure-capacity calendar and multi-day itinerary/resource agenda. Actual view follows the eligible selected model.

Model-specific setup: shared/private offering; exact departure/itinerary; participant bounds; guide/vehicle eligibility; actual inventory authority; supplier confirmation gates; inclusions and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_adventure_tours_TOUR_RESOURCE_POLICY`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Travel Packages (`travel_packages`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `travel_packages`. Historical source `MP_travel_packages`. Status planned / not started / not run.

Accepted itinerary/quote and third-party flight/accommodation confirmations; included flight never implies NEXG seat inventory.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Additional scoped decision/modifier references: `PD_travel_packages_ACCEPTED_SCOPE_COMMITMENT`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Vehicle Services

### Car Wash (`car_wash`)

Suggested default: `SERVICE_JOB`. [Effective profile](reconciliation/effective-profiles-128.json), reference `car_wash`. Historical source `MP_car_wash`. Status planned / not started / not run.

Selected wash duration, bay/team and queue or appointment; mobile wash adds travel, and plan entitlement does not reserve a wash slot.

Default-view template: Intake/assessment/workshop queue with optional scheduled bay/resource agenda. Actual view follows the eligible selected model.

Model-specific setup: actual job types; walk-in/request/scheduled modes; intake requirements; assessment and approval policy; eligible technician/bay; promised completion distinct from visit time.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `SELECTED_MODEL`: (Q_MOBILE_SERVICE eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.
- `ENTITLEMENT` / `SELECTED_MODEL`: (BQ_MEMBERSHIP_PLAN_ENABLED [bookingSetup.membership_plan_enabled] eq true AND BQ_ENTITLEMENT_POLICY [bookingSetup.entitlement_policy] nonempty true AND context.selected_offering_kind eq "plan"). Explicit commercial plan selection, independent of recurrence or subscription discovery flags. No calendar allocation follows from plan purchase alone.

Additional scoped decision/modifier references: `PD_car_wash_PUBLIC_SCHEDULED_BOOKING_DISABLED`. See the effective profile for exact rules.

Reconciled decisions:

- subscription_plans requires explicit entitlement/billing scope; a plan does not reserve a bay or staff time.

Acceptance: seven baseline scenarios and 8 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Tire Service (`tire_service`)

Suggested default: `SERVICE_JOB`. [Effective profile](reconciliation/effective-profiles-128.json), reference `tire_service`. Historical source `MP_tire_service`. Status planned / not started / not run.

Workshop bay/technician job or mobile callout, with emergency response policy and compatible tire inventory kept separate.

Default-view template: Intake/assessment/workshop queue with optional scheduled bay/resource agenda. Actual view follows the eligible selected model.

Model-specific setup: actual job types; walk-in/request/scheduled modes; intake requirements; assessment and approval policy; eligible technician/bay; promised completion distinct from visit time.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `SELECTED_MODEL`: (Q_MOBILE_SERVICE eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_tire_service_PUBLIC_SCHEDULED_BOOKING_DISABLED`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Battery Service (`battery_service`)

Suggested default: `FIELD_VISIT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `battery_service`. Historical source `MP_battery_service`. Status planned / not started / not run.

Mobile team/callout or merchant-location workshop selected explicitly; battery stock and staff dispatch are separate owners.

Default-view template: Team visit agenda and resource calendar with service location and travel constraints. Actual view follows the eligible selected model.

Model-specific setup: actual service; service area; customer access/address; team eligibility; exact visit duration; travel and setup buffers; arrival window; dispatch/approval policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `SELECTED_MODEL`: (Q_MOBILE_SERVICE eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.
- `SERVICE_JOB` / `SELECTED_MODEL`: (Q_MOBILE_SERVICE eq false AND context.selected_offering_kind eq "service_job"). A job/assessment is actually selected. Queue intake and scheduled resource allocations remain separate.

Additional scoped decision/modifier references: `PD_battery_service_WORKSHOP_REPLACES_MOBILE`. See the effective profile for exact rules.

Reconciled decisions:

- mobile_service=no selects workshop service rather than dispatch; stock and staff availability stay separate.

Acceptance: seven baseline scenarios and 8 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Vehicle Assistance (`vehicle_assistance`)

Suggested default: `FIELD_VISIT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `vehicle_assistance`. Historical source `MP_vehicle_assistance`. Status planned / not started / not run.

Assistance type, response area and dispatched crew/vehicle; estimated arrival is not a guaranteed future appointment slot.

Default-view template: Team visit agenda and resource calendar with service location and travel constraints. Actual view follows the eligible selected model.

Model-specific setup: actual service; service area; customer access/address; team eligibility; exact visit duration; travel and setup buffers; arrival window; dispatch/approval policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Vehicle Inspection (`vehicle_inspection`)

Suggested default: `APPOINTMENT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `vehicle_inspection`. Historical source `MP_vehicle_inspection`. Status planned / not started / not run.

Exact inspection duration and eligible inspector/bay/equipment; mobile inspection adds customer location and travel.

Default-view template: Day/week staff-resource calendar plus agenda and booking detail. Actual view follows the eligible selected model.

Model-specific setup: accepts scheduled bookings; requires advance booking separately; exact duration; eligible resources and schedules; lead time/horizon/buffers; onsite/remote methods; approval and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `SELECTED_MODEL`: (Q_MOBILE_INSPECTION eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_vehicle_inspection_PUBLIC_SCHEDULED_BOOKING_DISABLED`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Wellness

### Spa (`spa`)

Suggested default: `APPOINTMENT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `spa`. Historical source `MP_spa`. Status planned / not started / not run.

Service duration and compatible practitioner/room; couples package may require simultaneous linked resources and membership is separate.

Default-view template: Day/week staff-resource calendar plus agenda and booking detail. Actual view follows the eligible selected model.

Model-specific setup: accepts scheduled bookings; requires advance booking separately; exact duration; eligible resources and schedules; lead time/horizon/buffers; onsite/remote methods; approval and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `SELECTED_MODEL`: (Q_HOME_SERVICE eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.
- `ENTITLEMENT` / `SELECTED_MODEL`: (BQ_MEMBERSHIP_PLAN_ENABLED [bookingSetup.membership_plan_enabled] eq true AND BQ_ENTITLEMENT_POLICY [bookingSetup.entitlement_policy] nonempty true AND context.selected_offering_kind eq "plan"). Explicit commercial plan selection, independent of recurrence or subscription discovery flags. No calendar allocation follows from plan purchase alone.

Additional scoped decision/modifier references: `PD_spa_PUBLIC_SCHEDULED_BOOKING_DISABLED`, `PD_spa_COUPLES_BUNDLE`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 8 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Massage (`massage`)

Suggested default: `APPOINTMENT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `massage`. Historical source `MP_massage`. Status planned / not started / not run.

Therapist/room duration and home travel where selected; couples treatment must allocate every required practitioner together.

Default-view template: Day/week staff-resource calendar plus agenda and booking detail. Actual view follows the eligible selected model.

Model-specific setup: accepts scheduled bookings; requires advance booking separately; exact duration; eligible resources and schedules; lead time/horizon/buffers; onsite/remote methods; approval and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `SELECTED_MODEL`: (Q_HOME_SERVICE eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_massage_PUBLIC_SCHEDULED_BOOKING_DISABLED`, `PD_massage_COUPLES_BUNDLE`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Gym (`gym`)

Suggested default: `ENTITLEMENT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `gym`. Historical source `MP_gym`. Status planned / not started / not run.

Membership validity and usage rules; opening hours do not reserve trainer/equipment, and personal training sessions are separately booked.

Default-view template: Plan/usage/renewal view linked to separately reserved sessions. Actual view follows the eligible selected model.

Model-specific setup: plan scope/validity; credits/access rules; applicable actual offerings; renewal and payment consent separately; booking eligibility and usage policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `APPOINTMENT` / `SELECTED_MODEL`: (Q_PERSONAL_TRAINING_AVAILABLE eq true AND BQ_BOOKING_ENABLED [bookingSetup.booking_enabled] eq true AND BQ_BOOKING_ENABLED [bookingSetup.accepts_scheduled_bookings] eq true AND context.selected_offering_kind eq "service"). An actual published service is selected and accepts scheduling; booking_required alone never decides optional booking availability.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Personal Training (`personal_training`)

Suggested default: `APPOINTMENT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `personal_training`. Historical source `MP_personal_training`. Status planned / not started / not run.

Trainer duration and chosen gym/client/online location; group places and travel dependencies only for enabled methods.

Default-view template: Day/week staff-resource calendar plus agenda and booking detail. Actual view follows the eligible selected model.

Model-specific setup: accepts scheduled bookings; requires advance booking separately; exact duration; eligible resources and schedules; lead time/horizon/buffers; onsite/remote methods; approval and cancellation policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `SESSION_CAPACITY` / `SELECTED_MODEL`: (Q_GROUP_SESSIONS eq true AND context.selected_session_kind eq "group"). Select actual dated group offering. A one-to-one service remains a different offering variant.
- `FIELD_VISIT` / `SELECTED_MODEL`: (Q_SESSION_LOCATION in ["client_location", "flexible"] AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location"). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_personal_training_PUBLIC_SCHEDULED_BOOKING_DISABLED`, `PD_personal_training_LOCATION_VENUE`, `PD_personal_training_LOCATION_CLIENT_LOCATION`, `PD_personal_training_LOCATION_ONLINE`, `PD_personal_training_LOCATION_FLEXIBLE`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 8 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## App Services

### Reservations (`reservations`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `reservations`. Historical source `MP_reservations`. Status planned / not started / not run.

Concierge request for a venue reservation; external venue acceptance/reference is needed before confirming it to the customer.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `LINKED_EXECUTION`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location" AND context.accepted_scope_confirmed eq true). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_reservations_ACCEPTED_SCOPE_COMMITMENT`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Personal Assistance (`personal_assistance`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `personal_assistance`. Historical source `MP_personal_assistance`. Status planned / not started / not run.

Accepted assistance scope and response commitment; account manager or retainer does not reserve unlimited staff time.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `LINKED_EXECUTION`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location" AND context.accepted_scope_confirmed eq true). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.
- `ENTITLEMENT` / `SELECTED_MODEL`: (BQ_MEMBERSHIP_PLAN_ENABLED [bookingSetup.membership_plan_enabled] eq true AND BQ_ENTITLEMENT_POLICY [bookingSetup.entitlement_policy] nonempty true AND context.selected_offering_kind eq "plan"). Explicit commercial plan selection, independent of recurrence or subscription discovery flags. No calendar allocation follows from plan purchase alone.

Additional scoped decision/modifier references: `PD_personal_assistance_ACCEPTED_SCOPE_COMMITMENT`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 8 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Shopping Assistance (`shopping_assistance`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `shopping_assistance`. Historical source `MP_shopping_assistance`. Status planned / not started / not run.

Accepted shopping scope, provider/runner and completion promise; purchased-goods inventory is not NEXG calendar capacity.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `LINKED_EXECUTION`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location" AND context.accepted_scope_confirmed eq true). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_shopping_assistance_ACCEPTED_SCOPE_COMMITMENT`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Gift Sourcing (`gift_sourcing`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `gift_sourcing`. Historical source `MP_gift_sourcing`. Status planned / not started / not run.

Gift specification, supplier sourcing and accepted due date; wrapping and corporate scope do not guarantee supplier stock.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `LINKED_EXECUTION`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location" AND context.accepted_scope_confirmed eq true). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_gift_sourcing_ACCEPTED_SCOPE_COMMITMENT`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Travel Planning (`travel_planning`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `travel_planning`. Historical source `MP_travel_planning`. Status planned / not started / not run.

Travel-planning enquiry, agreed itinerary work and supplier handoffs; visa/insurance assistance does not mean approval.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `LINKED_EXECUTION`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location" AND context.accepted_scope_confirmed eq true). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_travel_planning_ACCEPTED_SCOPE_COMMITMENT`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Property Coordination (`property_coordination`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `property_coordination`. Historical source `MP_property_coordination`. Status planned / not started / not run.

Accepted coordination scope and planned visits/provider confirmations; coverage and 24-hour response do not guarantee free staff.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `LINKED_EXECUTION`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location" AND context.accepted_scope_confirmed eq true). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_property_coordination_ACCEPTED_SCOPE_COMMITMENT`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Moving Assistance (`moving_assistance`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `moving_assistance`. Historical source `MP_moving_assistance`. Status planned / not started / not run.

Accepted move volume/date/address, crew/vehicle/equipment and travel; actual allocations follow quote acceptance.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `LINKED_EXECUTION`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location" AND context.accepted_scope_confirmed eq true). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.

Additional scoped decision/modifier references: `PD_moving_assistance_ACCEPTED_SCOPE_COMMITMENT`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 4 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Cleaning Coordination (`cleaning_coordination`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `cleaning_coordination`. Historical source `MP_cleaning_coordination`. Status planned / not started / not run.

Accepted cleaning scope and third-party or own-team confirmation; recurring requests need actual provider capacity per occurrence.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `LINKED_EXECUTION`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location" AND context.accepted_scope_confirmed eq true). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.
- `ENTITLEMENT` / `SELECTED_MODEL`: (BQ_MEMBERSHIP_PLAN_ENABLED [bookingSetup.membership_plan_enabled] eq true AND BQ_ENTITLEMENT_POLICY [bookingSetup.entitlement_policy] nonempty true AND context.selected_offering_kind eq "plan"). Explicit commercial plan selection, independent of recurrence or subscription discovery flags. No calendar allocation follows from plan purchase alone.

Additional scoped decision/modifier references: `PD_cleaning_coordination_ACCEPTED_SCOPE_COMMITMENT`, `PD_cleaning_coordination_RECURRENCE_DISCOVERY`, `PD_cleaning_coordination_RECURRENCE_ACTIVE`. See the effective profile for exact rules.

Reconciled decisions:

- recurring_sub does not automatically establish membership or control a third-party cleaner's capacity.

Acceptance: seven baseline scenarios and 8 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### VIP Assistance (`vip_assistance`)

Suggested default: `REQUEST_QUOTE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `vip_assistance`. Historical source `MP_vip_assistance`. Status planned / not started / not run.

Accepted VIP scope, responsible provider and retainer rules; priority/24-hour availability is not unlimited bookable capacity.

Default-view template: Request/quote work queue and response milestones; tentative dates clearly labelled. Actual view follows the eligible selected model.

Model-specific setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Typed conditional model bindings:

- `FIELD_VISIT` / `LINKED_EXECUTION`: (BQ_BOOKING_ENABLED [bookingSetup.optional_service_booking_enabled] eq true AND Q_FULFILLMENT_MODES [bookingSetup.service_methods] contains "CUSTOMER_LOCATION" AND context.selected_method eq "customer_location" AND context.accepted_scope_confirmed eq true). Only the selected customer-location method enables this visit. Declaring the method adds no child work or charge. Remote/site alternatives remain separately resolved.
- `ENTITLEMENT` / `SELECTED_MODEL`: (BQ_MEMBERSHIP_PLAN_ENABLED [bookingSetup.membership_plan_enabled] eq true AND BQ_ENTITLEMENT_POLICY [bookingSetup.entitlement_policy] nonempty true AND context.selected_offering_kind eq "plan"). Explicit commercial plan selection, independent of recurrence or subscription discovery flags. No calendar allocation follows from plan purchase alone.

Additional scoped decision/modifier references: `PD_vip_assistance_ACCEPTED_SCOPE_COMMITMENT`. See the effective profile for exact rules.

Reconciled decisions:

- Original activity mapping is retained, with explicit configuration/selection/authority guards and bounded typed conditions.

Acceptance: seven baseline scenarios and 8 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.


## Logistics & Shipping

### Sea Freight (`sea_freight`)

Suggested default: `FREIGHT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `sea_freight`. Historical source `MP_sea_freight`. Status planned / not started / not run.

Shipment quantity/container/CBM/weight, carrier leg, port/cutoff and optional road transport; carrier acceptance owns vessel capacity.

Default-view template: Shipment-leg and cutoff/milestone agenda with carrier confirmation state. Actual view follows the eligible selected model.

Model-specific setup: cargo measurements and units; route/legs; cutoffs and pickup/loading/delivery promises; rate basis; carrier/capacity authority; scope/acceptance policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Air Freight (`air_freight`)

Suggested default: `FREIGHT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `air_freight`. Historical source `MP_air_freight`. Status planned / not started / not run.

Weight/volume shipment, carrier acceptance, customs and airport/warehouse legs; do not confuse quoted transit duration with a reserved flight.

Default-view template: Shipment-leg and cutoff/milestone agenda with carrier confirmation state. Actual view follows the eligible selected model.

Model-specific setup: cargo measurements and units; route/legs; cutoffs and pickup/loading/delivery promises; rate basis; carrier/capacity authority; scope/acceptance policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Road Freight & Trucking (`road_freight`)

Suggested default: `FREIGHT`. [Effective profile](reconciliation/effective-profiles-128.json), reference `road_freight`. Historical source `MP_road_freight`. Status planned / not started / not run.

Measured load, compatible truck/driver and accepted pickup/delivery windows; fleet-size bands are not individual truck capacity.

Default-view template: Shipment-leg and cutoff/milestone agenda with carrier confirmation state. Actual view follows the eligible selected model.

Model-specific setup: cargo measurements and units; route/legs; cutoffs and pickup/loading/delivery promises; rate basis; carrier/capacity authority; scope/acceptance policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.

### Warehousing & Storage (`warehousing`)

Suggested default: `STORAGE`. [Effective profile](reconciliation/effective-profiles-128.json), reference `warehousing`. Historical source `MP_warehousing`. Status planned / not started / not run.

Unit/area/volume occupancy across dates, compatible goods and access windows; explicit sqm/sqft conversion and owner-confirmed remaining capacity.

Default-view template: Storage occupancy timeline with measured capacity and access-window agenda. Actual view follows the eligible selected model.

Model-specific setup: unit/pool inventory; quantity and precision; occupancy dates/range; compatible goods restrictions; capacity authority; pricing period; inbound/outbound policy.

Applicability: Inherited model fields are applicability-scoped. Do not require vehicle/dropoff for greeter-only, a room for remote work, or a rider for customer drop-off. Exact required resources are offering-specific.

Acceptance: seven baseline scenarios and 0 positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.
