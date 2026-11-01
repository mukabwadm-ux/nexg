# Product information in every selected workflow

Status: all-category workflow design integration. Existing state machines, guards and model meanings remain authoritative. The information contract below connects the actual offering specification and customer selection to those workflows.

[All screens and categories](all-screens-and-workflows.md) / [Structured workflow bindings](all-screens-and-workflows.json)

## Inputs and accepted specification

Every route references the actual specific template, stable offering/variant/options, exact quantity/unit or interval, applicable specification/chart/policy revision and authoritative price. Applicable typed input requirements come from the selected template and conditional groups. Only owner-confirmed setup, authority, capacity and permission can enable the selected command.

Public product specifications belong to Catalog. Price and accepted monetary facts belong to their declared Commerce owner. Stock remains Inventory-owned. Existing Workflow/availability and resource authorities control actual commitments. Private customer responses are restricted transaction records and never public listing content.

The JSON's acceptedSpecification separates public catalogue fields, price fields and private intake references. Model setup and allocation rules are referenced from the existing model registry. Transition contracts are derived from the current effective workflow snapshot, with its source hash, rather than replaced by a generic checkout graph.

## ORDER

Registered workflow illustrations: WF_ORDER.

Offering kinds: [Intimate personal-care device](templates/intimate_device.md); [Intimate care or wellness product](templates/intimate_wellness_product.md); [Intimate accessory or garment](templates/adult_accessory.md); [Cigarette pack or carton](templates/cigarettes.md); [Cigar or cigar box](templates/cigar.md); [Vape device or replacement component](templates/vape_device.md); [Vape refill or liquid](templates/vape_refill.md); [Wine bottle or case](templates/wine.md); [Spirit bottle or set](templates/spirit.md); [Beer or cider pack](templates/beer.md); [Sparkling wine or champagne listing](templates/sparkling_wine.md); [Non-alcoholic mixer or soft drink](templates/mixer.md); [Alcohol-containing mixer or premixed drink](templates/alcoholic_mixer.md); [Shirt or structured top](templates/shirt.md); [Dress](templates/dress.md); [Trousers or jeans](templates/trousers.md); [Skirt](templates/skirt.md); [Shorts](templates/shorts.md); [Jacket or coat](templates/jacket.md); [Suit or coordinated clothing set](templates/suit.md); [Knitwear or casual top](templates/knitwear.md); [Activewear garment](templates/activewear.md); [Underwear or fitted intimate garment](templates/underwear.md); [Sleepwear or loungewear](templates/sleepwear.md); [Children's top or outerwear](templates/kids_top.md); [Children's dress](templates/kids_dress.md); [Children's trousers, skirt or shorts](templates/kids_bottom.md); [School or work uniform garment/set](templates/uniform.md); [Footwear](templates/shoe.md); [Handbag, luggage or backpack](templates/bag.md); [Wristwatch](templates/watch.md); [Jewellery](templates/jewellery.md); [Belt](templates/belt.md); [Hat or fitted headwear](templates/hat.md); [Scarf or wrap](templates/scarf.md); [Makeup product with shade choices](templates/makeup_product.md); [Skin-care product](templates/skincare_product.md); [Hair-care product](templates/hair_product.md); [Fragrance or fragrance set](templates/fragrance.md); [Beauty tool or accessory](templates/beauty_tool.md); [Bouquet or flower arrangement](templates/bouquet.md); [Ready-made gift hamper](templates/hamper.md); [Ready-made cake or cake slice](templates/ready_cake.md); [Chocolates or confectionery box](templates/chocolates.md); [Ready-made occasion gift](templates/occasion_gift.md); [Prepared dish](templates/dish.md); [Pizza](templates/pizza.md); [Burger, wrap or sandwich](templates/burger_sandwich.md); [Meal combo or family platter](templates/meal_combo.md); [Bread, pastry or baked snack](templates/bakery_item.md); [Dessert or frozen dessert](templates/dessert.md); [Prepared coffee or tea](templates/coffee_tea.md); [Juice, smoothie or blended drink](templates/juice.md); [Packaged food or grocery](templates/packaged_food.md); [Dairy product or eggs](templates/dairy_eggs.md); [Frozen grocery product](templates/frozen_food.md); [Fresh fruit, vegetables or herbs](templates/produce.md); [Meat or poultry cut](templates/meat.md); [Fish or seafood product](templates/seafood.md); [Household cleaning or paper product](templates/household.md); [General personal-care product](templates/personal_care.md); [Furniture item or set](templates/furniture.md); [Bedding, curtain or home textile](templates/home_textile.md); [Home decor item](templates/decor.md); [Lamp or lighting fixture](templates/lighting.md); [Home appliance](templates/appliance.md); [Cookware, utensils or tableware](templates/kitchenware.md); [Book or publication](templates/book.md); [Stationery or paper supply](templates/stationery.md); [Printer ink, toner or office consumable](templates/office_consumable.md); [Pharmacy medicine listing](templates/medicine.md); [Medical consumable or equipment](templates/medical_supply.md); [Baby diaper or care product](templates/baby_care.md); [Baby feeding food or formula listing](templates/baby_food.md); [Baby feeding accessory or equipment](templates/baby_equipment.md); [Vitamin or supplement product](templates/supplement.md); [Smartphone or tablet](templates/smartphone.md); [Laptop, desktop or all-in-one computer](templates/computer.md); [Monitor or display](templates/monitor.md); [Cable, charger, case or peripheral](templates/tech_accessory.md); [Game console or gaming hardware](templates/console.md); [Game or gaming software product](templates/game.md); [Headphones, speakers or audio equipment](templates/audio.md); [Connectivity or telecom plan](templates/telecom_plan.md); [Router, modem or network device](templates/network_device.md); [Smart-home device or wearable](templates/smart_device.md); [Tyre product](templates/tire_product.md); [Vehicle battery product](templates/battery_product.md); [Cable or adapter](templates/cable.md); [Mains or vehicle charger](templates/charger.md); [Power bank](templates/powerbank.md); [Device case or screen protector](templates/phone_case.md); [Ring](templates/ring.md); [Necklace](templates/necklace.md); [Bracelet](templates/bracelet.md); [Earrings](templates/earrings.md); [Smartwatch](templates/smartwatch.md).

### Customer journey

1. choose actual items/variants
2. choose supported fulfilment
3. review price and policy
4. place order through order authority
5. track fulfilment

### Merchant work

1. review order
2. accept under stock/fulfilment authority
3. fulfil
4. record actual completion

Required setup: actual product/variant catalogue; stock and price authority; enabled fulfilment methods; order acceptance and return policy.

Allocation/acceptance rule: Never create a staff/asset appointment for ordinary product purchase. A selected scheduled delivery or collection uses a separately enabled typed window capability.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## APPOINTMENT

Registered workflow illustrations: WF_APPOINTMENT, WF_REMOTE_SESSION.

Offering kinds: [Adult wellness consultation or service](templates/adult_wellness_service.md); [Styling or fitting appointment](templates/styling.md); [Makeup application or bridal session](templates/makeup_service.md); [Skin-care consultation or treatment](templates/skin_service.md); [Hair styling, cut or treatment](templates/hair_service.md); [Nail service](templates/nail_service.md); [Photography shoot package](templates/photography.md); [Banking service enquiry or appointment](templates/banking_enquiry.md); [Currency exchange enquiry or provider handoff](templates/forex_enquiry.md); [Insurance information or quote request](templates/insurance_enquiry.md); [Payment service information or provider handoff](templates/payment_enquiry.md); [Remittance service enquiry or provider handoff](templates/remittance_enquiry.md); [Sacco membership or service enquiry](templates/sacco_enquiry.md); [Business professional service enquiry](templates/business_enquiry.md); [Clinic consultation or procedure appointment](templates/clinic.md); [Remote health consultation](templates/telemedicine.md); [Lab test or panel with collection](templates/lab_test.md); [Therapy or counselling session](templates/therapy.md); [Individual coaching session](templates/coaching.md); [Vehicle inspection appointment or visit](templates/inspection.md); [Spa treatment appointment or visit](templates/spa.md); [Massage appointment or visit](templates/massage.md); [Individual personal-training session](templates/training.md).

### Customer journey

1. select service/method
2. select actual eligible time
3. provide necessary administrative details
4. review policy/payment if required
5. receive authority-confirmed outcome

### Merchant work

1. review/approve if required
2. assign eligible provider
3. check in/start
4. complete or record meaningful no-show

Required setup: accepts scheduled bookings; requires advance booking separately; exact duration; eligible resources and schedules; lead time/horizon/buffers; onsite/remote methods; approval and cancellation policy.

Allocation/acceptance rule: Reserve all required staff/space/equipment together. Walk-ins consume the same underlying resources. Remote method does not require a fictitious physical room.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## FIELD_VISIT

Registered workflow illustrations: WF_FIELD_SERVICE.

Offering kinds: [Adult wellness consultation or service](templates/adult_wellness_service.md); [Makeup application or bridal session](templates/makeup_service.md); [Skin-care consultation or treatment](templates/skin_service.md); [Hair styling, cut or treatment](templates/hair_service.md); [Nail service](templates/nail_service.md); [Photography shoot package](templates/photography.md); [Home standard or deep-clean visit](templates/home_clean.md); [Office or commercial clean visit](templates/office_clean.md); [Product installation or assembly visit](templates/installation.md); [Clinic consultation or procedure appointment](templates/clinic.md); [Lab test or panel with collection](templates/lab_test.md); [Mobile car-wash or detailing visit](templates/mobile_wash.md); [Mobile tyre assistance visit](templates/mobile_tire.md); [Mobile battery or jump-start visit](templates/mobile_battery.md); [Roadside assistance or towing visit](templates/roadside.md); [Vehicle inspection appointment or visit](templates/inspection.md); [Spa treatment appointment or visit](templates/spa.md); [Massage appointment or visit](templates/massage.md); [Individual personal-training session](templates/training.md); [Explicit concierge execution visit](templates/concierge_visit.md).

### Customer journey

1. select service/location
2. submit or choose feasible arrival window
3. review scope and price
4. receive confirmed visit
5. track permitted arrival milestones

### Merchant work

1. review coverage/access
2. assign eligible team
3. confirm feasible interval
4. dispatch
5. complete actual visit

Required setup: actual service; service area; customer access/address; team eligibility; exact visit duration; travel and setup buffers; arrival window; dispatch/approval policy.

Allocation/acceptance rule: Travel and coverage constrain feasible intervals. Enabling home service never automatically creates a linked visit until that method is selected.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## ASSET_INTERVAL

Registered workflow illustrations: WF_RENTAL.

Offering kinds: [Car rental with optional driver](templates/car_rental.md); [Self-drive vehicle rental](templates/self_drive.md); [Corporate or long-term vehicle rental](templates/extended_rental.md); [Bicycle, e-bike or motorcycle rental](templates/bike_rental.md).

### Customer journey

1. select asset/class and exact interval
2. choose self-drive/driver method when offered
3. review eligibility/terms/price
4. complete configured approval/payment
5. receive confirmed asset allocation

### Merchant work

1. assign asset/driver if relevant
2. verify required eligibility
3. handover
4. manage extension under capacity
5. return and condition review

Required setup: actual asset IDs; range/minimum/maximum policy; handover/return locations and times; turnaround/maintenance; eligibility/deposit/fuel terms if relevant; driver policy where applicable.

Allocation/acceptance rule: Use exact half-open intervals plus turnaround; maintenance blocks the same asset. With-driver allocation stays rental and consumes both resources together.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## TRANSFER

Registered workflow illustrations: WF_TRANSFER.

Offering kinds: [Airport pickup or drop-off trip](templates/airport_transfer.md); [Executive transfer trip](templates/executive_transfer.md); [Airport meet-and-greet only](templates/airport_greeting.md).

### Customer journey

1. select actual service
2. provide pickup/dropoff and relevant flight information
3. choose time/passenger count
4. review price/wait terms
5. receive confirmed assignment or pending request

### Merchant work

1. review trip feasibility
2. assign resources together
3. confirm pickup
4. dispatch/meet
5. complete trip or greeting

Required setup: transport included or greeter-only; pickup/dropoff and time; eligible actual resources; travel/wait buffers; passenger/luggage policy; flight-change policy where enabled.

Allocation/acceptance rule: Vehicle and driver allocations are joint when transport is included. Flight changes propose a change rather than silently moving an agreed booking.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## SESSION_CAPACITY

Registered workflow illustrations: WF_EVENT_SESSION, WF_GROUP_ACTIVITY.

Offering kinds: [Concert, festival or performance admission](templates/event_ticket.md); [Conference or delegate pass](templates/conference_ticket.md); [Dated workshop place](templates/workshop.md); [Dated class place](templates/class.md); [Sports activity or group session](templates/sport.md); [Recreation activity or admission session](templates/recreation.md); [Group coaching session](templates/group_coaching.md); [Group personal-training session](templates/group_training.md).

### Customer journey

1. select session/date
2. select places/ticket type
3. review actual remaining capacity and terms
4. complete policy/payment
5. receive confirmed places and supported ticket/check-in reference

### Merchant work

1. publish occurrence with resources
2. manage holds/attendees
3. resolve capacity changes
4. check in
5. complete session

Required setup: actual dated sessions; exact capacity; ticket/place quantities; required resources; occurrence duration; booking/check-in policy; series and exception rule if recurring.

Allocation/acceptance rule: Ticket types cannot independently oversell a shared session. Recurrence creates actual occurrences with separate state; an exclusive instructor commitment must not prevent multiple attendees joining the same occurrence.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## SPACE_RESERVATION

Registered workflow illustrations: WF_SPACE_RESERVATION_V1.

Offering kinds: [Venue or space reservation](templates/event_space.md); [Restaurant table reservation](templates/table.md).

### Customer journey

1. choose location/date/time and party size
2. select suitable offering
3. review terms
4. receive authority-confirmed table/space

### Merchant work

1. review/assign compatible space
2. manage seating and turnover
3. record arrival
4. complete/release

Required setup: explicit offers table/space reservations; actual table/space inventory; party bounds; duration/turnover; combination rules; reservation authority; intake/cancellation policy.

Allocation/acceptance rule: Seated capacity alone is not a table map. Declaring an existing reservation system does not enable table booking or transfer authority. Combined tables reserve together.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## TOUR

Registered workflow illustrations: WF_TOUR.

Offering kinds: [Overnight safari itinerary](templates/safari.md); [Game-drive excursion](templates/game_drive.md); [Premium safari itinerary](templates/luxury_safari.md); [City or cultural tour](templates/city_tour.md); [Adventure excursion](templates/adventure_tour.md).

### Customer journey

1. select itinerary/departure/private method
2. choose participants
3. review inclusions and conditions
4. submit or complete configured payment
5. receive confirmed controlled and supplier allocations

### Merchant work

1. confirm supplier scope
2. allocate guide/vehicle and departure places
3. issue itinerary
4. manage milestones
5. complete tour

Required setup: shared/private offering; exact departure/itinerary; participant bounds; guide/vehicle eligibility; actual inventory authority; supplier confirmation gates; inclusions and cancellation policy.

Allocation/acceptance rule: Private and shared offerings use the same underlying resources. Supplier accommodation/park/transport inclusions are not local available inventory without confirmed authority.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## PRODUCTION_DUE

Registered workflow illustrations: WF_MADE_TO_ORDER.

Offering kinds: [Custom tailoring or made-to-measure garment](templates/tailoring.md); [Custom-curated gift hamper](templates/custom_hamper.md); [Custom cake](templates/custom_cake.md); [Personalized gift or printed item](templates/personalized_gift.md); [Custom printed or bound publication](templates/custom_publication.md).

### Customer journey

1. provide specification
2. approve scope/quote
3. choose feasible due/handoff window
4. meet payment policy
5. receive accepted production promise

### Merchant work

1. review specification and capacity
2. quote/obtain approval
3. commit production
4. prepare
5. handoff and complete

Required setup: actual custom creation versus sourcing; specification/approval; exact preparation lead time; capacity unit; due date/cutoff; handoff method; change/price policy.

Allocation/acceptance rule: A due date is not the start of a 60-minute appointment. Preserve accepted specifications; changes recalculate feasibility and price.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## REQUEST_QUOTE

Registered workflow illustrations: WF_REGULATED_ENQUIRY, WF_REQUEST_QUOTE.

Offering kinds: [Private event planning or coordination](templates/event_planning.md); [Banking service enquiry or appointment](templates/banking_enquiry.md); [Currency exchange enquiry or provider handoff](templates/forex_enquiry.md); [Insurance information or quote request](templates/insurance_enquiry.md); [Payment service information or provider handoff](templates/payment_enquiry.md); [Remittance service enquiry or provider handoff](templates/remittance_enquiry.md); [Sacco membership or service enquiry](templates/sacco_enquiry.md); [Business professional service enquiry](templates/business_enquiry.md); [Catering service or event menu](templates/catering.md); [Specially sourced publication request](templates/special_book.md); [Travel package sourcing or planning request](templates/travel_request.md); [Restaurant or venue reservation assistance](templates/reservation_assistance.md); [Personal administration or errands request](templates/personal_assistance.md); [Shopping or sourcing assistance request](templates/shopping_assistance.md); [Gift sourcing and presentation request](templates/gift_sourcing.md); [Travel planning assistance request](templates/travel_planning.md); [Property access or maintenance coordination](templates/property_coordination.md); [Moving assistance or coordination request](templates/moving_coordination.md); [Cleaning supplier coordination request](templates/cleaning_coordination.md); [Priority or VIP coordination request](templates/vip_assistance.md).

### Customer journey

1. describe request
2. receive request reference
3. review scope/quote
4. accept terms
5. receive confirmed service only after authority/resource confirmation

### Merchant work

1. triage
2. clarify and source
3. quote
4. obtain acceptance
5. confirm supplier/resources
6. fulfil through actual model

Required setup: offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted.

Allocation/acceptance rule: Submitting a request is not a hold, supplier booking, financial transaction or approved application. Confirmed child work uses a supported model once.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## LINKED_WINDOWS

Registered workflow illustrations: WF_PICKUP_RETURN.

Offering kinds: [Wash and dry laundry service](templates/laundry.md); [Dry-cleaning garment service](templates/dry_cleaning.md); [Ironing or pressing service](templates/ironing.md).

### Customer journey

1. choose actual handling method
2. choose feasible collection/dropoff and return
3. review workload/terms
4. receive accepted paired promise

### Merchant work

1. accept workload
2. allocate windows and processing
3. collect/receive
4. process
5. return/handoff

Required setup: pickup/delivery versus customer drop-off; exact turnaround/cutoff; processing capacity; collection and return windows; coverage and transport capacity if selected; acceptance/price policy.

Allocation/acceptance rule: Collection, processing and return must be feasible together. Customer drop-off mode has no invented rider allocation.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## SERVICE_JOB

Registered workflow illustrations: WF_SERVICE_JOB.

Offering kinds: [Device diagnostic or repair job](templates/device_repair.md); [Telecom setup or support job](templates/telecom_support.md); [Workshop car-wash or detailing job](templates/car_wash.md); [Tyre fitting, repair or balancing job](templates/tire_job.md); [Workshop battery diagnostic or installation](templates/battery_job.md).

### Customer journey

1. choose service/intake
2. submit job or select offered slot
3. approve assessed scope/price
4. receive job progress and actual completion promise

### Merchant work

1. receive/intake
2. assess
3. obtain approval
4. assign work
5. execute/quality-check
6. handoff

Required setup: actual job types; walk-in/request/scheduled modes; intake requirements; assessment and approval policy; eligible technician/bay; promised completion distinct from visit time.

Allocation/acceptance rule: Do not turn a repair completion estimate or walk-in queue position into a confirmed appointment; preserve actual capacity shared with scheduled work.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## ENTITLEMENT

Registered workflow illustrations: WF_MEMBERSHIP.

Offering kinds: [Class or activity pass](templates/session_pass.md); [Recurring bouquet plan](templates/flower_plan.md); [Recurring produce box plan](templates/produce_box.md); [Recurring cleaning service plan](templates/cleaning_plan.md); [Recurring baby-product supply plan](templates/baby_plan.md); [Car-wash service plan](templates/wash_plan.md); [Spa or wellness membership](templates/wellness_plan.md); [Gym membership or access pass](templates/gym_membership.md); [Concierge retainer or assistance plan](templates/assistance_plan.md).

### Customer journey

1. review/select plan
2. meet actual enrollment/payment policy
3. book eligible sessions separately
4. inspect entitlement usage

### Merchant work

1. manage plan validity
2. check access/credits
3. allocate actual session if selected
4. reconcile usage and authorized renewals

Required setup: plan scope/validity; credits/access rules; applicable actual offerings; renewal and payment consent separately; booking eligibility and usage policy.

Allocation/acceptance rule: Plan purchase does not reserve every future class. Credit use and resource reservation must not diverge on retry or failure. Recurrence alone does not authorize a plan or recurring charge.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## FREIGHT

Registered workflow illustrations: WF_FREIGHT.

Offering kinds: [Sea freight or container service](templates/sea_freight.md); [Air cargo service](templates/air_freight.md); [Road freight or truck-load service](templates/road_freight.md).

### Customer journey

1. provide cargo/scope
2. receive quote
3. accept terms
4. receive carrier/resource confirmation
5. track actual milestones

### Merchant work

1. assess cargo/rate
2. confirm carrier/controlled capacity
3. schedule legs
4. record movement evidence
5. complete handoff

Required setup: cargo measurements and units; route/legs; cutoffs and pickup/loading/delivery promises; rate basis; carrier/capacity authority; scope/acceptance policy.

Allocation/acceptance rule: Weight, volume and container quantities are distinct constraints. Do not treat them as interchangeable guestCount. Fleet count is not proof of available truck or carrier space.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## STORAGE

Registered workflow illustrations: WF_STORAGE.

Offering kinds: [Warehouse storage and handling service](templates/storage.md).

### Customer journey

1. request compatible storage quantity and dates
2. review terms/quote
3. receive confirmed occupancy
4. arrange separate inbound/outbound handling

### Merchant work

1. assess unit/quantity
2. allocate occupancy
3. receive goods
4. manage period changes
5. release after actual exit

Required setup: unit/pool inventory; quantity and precision; occupancy dates/range; compatible goods restrictions; capacity authority; pricing period; inbound/outbound policy.

Allocation/acceptance rule: Typed pool capacity must hold across the entire interval. An access visit is not a new storage booking. No implicit sqm/sqft conversion or rounding.

Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.

## Specialty route composition

Template flow illustrations reuse registered model/schema contracts. Actual specialty offeringRoutes retain the historical or approved per-offering workflow references, intake modes and source guards. Do not replace a regulated, remote, greeting or other specialty route with a generic model illustration.

All 128 specialtyScreenCoverage records retain offeringRoutes with historical workflow references, approved extensions, allowed intake modes and approval references. The 21 approved additions expand only the exact reviewed offering/model combinations. Actual command authorization, source authority, confirmation and policy checks remain necessary.

## Change and recovery

A reschedule, specification amendment, substitution, cancellation or refund follows the existing authorized route. A changed current product specification does not update already accepted work. Unknown outcomes are reconciled before retries; price, allocation, payment, fulfilment and source sync states remain independent.
