# How captured information reaches the customer

Status: proposed customer information design. The map specifies content and behavior, not a completed interface. Each template's field matrix identifies exact destinations.

The [product-kind specification contract](product-specification-contract.md) and [all-category screen/workflow designs](all-screens-and-workflows.md) apply this information flow across all 21 categories and 128 subcategories. The [structured bindings](all-screens-and-workflows.json) include every specific offering template and all applicable merchant/customer surfaces. Apparel is one example.

## Shared customer page structure

1. Browse/search card: actual offering name, accurate media, a short description, the relevant template's selected highlights, correctly labelled price basis and source-confirmed availability where known. Keep the card brief; the full specification belongs on the detail page.
2. Detail page: description, actual included contents/deliverables and grouped specifications with meaningful labels and units. Hide irrelevant groups; show missing decision-critical information accurately.
3. Choices: actual variant or service options. Show only valid combinations and their specific photos, specifications, price and availability. State why an option is unavailable instead of silently changing the selection.
4. Fit or compatibility: garment measurements, footwear sizing, product dimensions, compatible devices, vehicle capacity or applicable prerequisites. The section follows the specific offering type.
5. Price: the selected variant or actual date/quantity/service total, with unit/currency and itemized applicable charges. Starting estimates, quote requests, deposits and final totals have distinct labels.
6. Fulfilment or scheduling: supported delivery/pickup/service methods and applicable date/time/capacity selection. Only owner-confirmed availability can support a confirmed action.
7. Terms: applicable return, cancellation, deposit, usage, eligibility, renewal or supplier terms before commitment. Use versioned policy references and permitted public summaries.
8. Private transaction input: only the necessary customer choices, addresses, personalization or intake for the actual order/booking/enquiry. Submitted values never become public listing data.

## Layout and action by offering kind

| Kind | Prominent information and selectors | Customer action and confirmation |
| --- | --- | --- |
| Garment | Photos, fabric/fit, construction, actual size/colour choices and size-specific measurement guide | Select a real variant and quantity; display its price and stock before ordering |
| Footwear/accessory | Named sizing system, measurement basis, actual item/fit dimensions and materials | Select the actual compatible size/variant without invented cross-system conversion |
| Electronic product | Exact model/configuration, compatibility, manufacturer specifications, condition and box contents | Select a real configuration and review price/stock; a support/repair job is a separate offering |
| Food/drink | Portion/unit, ingredients and declared allergen information, required choices/additions and actual included contents | Choose compatible options and quantities; show selected charges and supported fulfilment |
| Furniture/appliance | Dimensions, access/connection needs, material/capacity, contents and installation scope | Select actual configuration; separately select supported assembly/installation if offered |
| Appointment | Actual service scope, duration, location/remote method, provider projection and terms | Show only configured booking/request/walk-in modes and accurate confirmation state |
| Field visit | Task scope, workload, supplies, coverage, travel and access needs | Check actual customer location and feasible team time; use assessment/request where necessary |
| Rental | Guaranteed asset/class, seats/luggage, transmission, mileage/fuel/cover/deposit terms and handover choices | Select actual interval and extras; review the computed total and secured allocation |
| Transfer/greeting | Actual route or greeting scope, party/capacity, waiting/extras and meeting instructions | Collect private trip details; greeter-only and vehicle transfer have different resource needs |
| Event/class | Programme/content, actual occurrence/venue, tier, quantity and included access | Reserve actual dated capacity; ticket issuance is separately confirmed |
| Tour | Itinerary/duration, departure, private/shared party, suppliers and inclusions/exclusions | Select a published supported departure or submit an enquiry; supplier uncertainty remains visible |
| Custom production | Actual product specifications, allowed design/options, proof process and due-date rules | Submit exact scope and request/obtain production acceptance; a request is not a ready-stock sale |
| Membership/plan | Benefits and limits, validity, redemption and explicit renewal terms | Enroll; actual sessions, visits, orders and deliveries retain their own workflows |
| Laundry | Accepted item/care scope, unit rates, actual workload/assessment and collection/return promises | Select feasible paired windows under the applicable acceptance model |
| Repair/job | Compatible item, diagnostic versus repair scope, parts/labour and turnaround estimate | Request intake, review assessment and accept the actual work/charges |
| Provider/concierge enquiry | Actual provider or coordination scope, authoritative terms, fees and confirmation dependency | Request information, quote, appointment or handoff as supported; no implied provider transaction or supplier reservation |
| Freight/storage | Accepted cargo/goods, route or unit fit, charge basis, period and handling/cover scope | Submit private actual measurements/declaration and obtain carrier/capacity/custody acceptance |

## Dress selection and measurement behavior

The dress page should put the size guide beside the size choice. A chart row references an actual size, variant/piece where relevant, version, measurement basis and units. Selecting a size identifies that row. Bust, waist, hips and length remain distinct. Elastic/adjustable ranges and not-applicable measurements are represented explicitly.

Do not equate garment circumference with a flat width or a body measurement. Do not invent a numeric measurement from Small, Medium or Large. Unit conversion can display the same known measurement in another supported unit, while preserving precision and its basis. It cannot establish equivalence between size systems.

Colour/size combinations are actual variants. A colour photo is linked to the correct variant. Variant selection updates the actual price, stock and relevant specification override. A clothing set preserves the included pieces and their distinct size/measurement relationships.

## Inheritance, privacy and source behavior

Merchant defaults can supply explicitly shared policies or charts. The listing records which version it references and any permitted override. Location and variant facts are separately scoped. Updating a shared chart or policy previews affected listings; accepted work retains the prior accepted facts.

Customer-facing reads project only allowed fields. Internal source IDs, stock control configuration, evidence documents and raw resource records remain internal. Exact personal addresses, customer measurements, messages, identity documents, health administration and cargo declarations remain purpose-limited transaction data. Public form definitions are distinct from the private responses they collect.

Unknown, not applicable, false and zero are different values. A missing ingredient/allergen statement is not a negative claim. Unknown stock is not a stocked product. A published service is not proof of a free appointment, and an enquiry is not a confirmed booking.

## Entry-to-display completion requirements for the future build

For each template, verify entry, validation, persistence, public projection, customer selection and accepted transaction snapshot together. Cover a representative normal journey and applicable missing-data, incompatible-option, private-field, stale-source and concurrent-availability paths. Check mobile and keyboard use as part of the actual interface implementation.

The current generated map and verifier establish design coverage and reference consistency. They do not establish these runtime behaviors.
