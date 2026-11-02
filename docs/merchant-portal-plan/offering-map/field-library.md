# Shared field library

The single authoring source is definitions.py. Field IDs are registry symbols, not entity identifiers. The machine-readable map holds owner and scope references. Units and compound controls follow the value shapes below.

## Value shapes

| Type | Merchant control | Captured values |
| --- | --- | --- |
| `text` | Labelled text entry | String with a meaning-specific length/format rule; blank and not provided remain distinguishable. |
| `text_list` | Repeated labelled text entries | Ordered text values with source/provenance where relevant. |
| `enum` | Single choice | One reviewed named option; unknown and not applicable are distinct from false. |
| `enum_list` | Multiple choices | Actual reviewed options, with no automatic feature or capability activation. |
| `reference` | Existing record or registry selection | Stable scoped reference, source, version and authorized label projection. |
| `reference_list` | Multiple existing-record selections | Distinct stable scoped references; no arbitrary foreign-business records. |
| `media_list` | Media picker with captions | Media reference, accessible description, order and applicable variant reference. |
| `quantity` | Number with unit and basis | Exact decimal string or integer, named unit, precision, basis and optional pack count; no unitless physical measures. |
| `quantity_list` | Named measurements with units | Separate named quantities such as RAM/storage or weight/count; each has its own unit and meaning. |
| `dimensions` | Dimensions and orientation | Separate named length/width/height/depth/diameter/mass as applicable, each with explicit units and measurement basis. |
| `length` | Length with unit | Exact value and length unit, with endpoints/method where needed. |
| `length_or_range` | Length or adjustable range | Exact value or minimum/maximum, length unit, measurement basis and method; no guessed size conversions. |
| `range` | Explicit labelled range | Minimum/maximum and named basis; dates, ages, size labels and physical measures are not interchangeable. |
| `range_with_unit` | Range with unit | Minimum/maximum, unit and basis; unknown and open-ended need explicit representation. |
| `percentage` | Percentage | Exact declared value and percentage basis; constrain to the applicable meaningful range. |
| `count_or_range` | Count or count range | Integer count/minimum/maximum with named subject such as people or pieces. |
| `duration` | Duration and unit | Exact amount and unit, plus estimate/firm distinction; calendar periods remain distinct from elapsed minutes. |
| `duration_or_assessment` | Duration or assessment-required | Exact declared duration/estimate with unit, or explicit pending assessment; no invented available slot. |
| `money_or_quote` | Price entry or quote-only state | Integer amount_minor plus currency and price basis, or explicit quote-only; display a starting price as a starting price. |
| `policy_reference` | Applicable versioned policy | Scoped policy reference and approved public summary; current and accepted historical versions remain distinguishable. |
| `charge_table` | Charge rule rows | Named charge, amount/currency, unit/basis, condition, inclusion/exclusion and pricing authority reference. |
| `variant_table` | Actual option combinations | Stable variant reference, exact selected option values, specification overrides and owner references for price/stock; no assumed Cartesian product. |
| `option_group_table` | Required/optional customer choices | Group label, stable choice IDs, minimum/maximum selections, compatibility, price effects and actual availability. |
| `component_table` | Included component rows | Stable item/component reference or exact description, quantity/unit, included option, substitution policy and linked requirements. |
| `material_list` | Material/composition entries | Material, component location, known proportion/basis and source; unknown composition is not fabricated. |
| `size_system` | Named size labels and system | Exact merchant labels/system plus chart reference; no automatic equivalence between brands or systems. |
| `measurement_basis` | Measurement instructions and unit | Body versus garment, circumference versus flat width, named unit, endpoints and measurement method. |
| `measurement_chart` | Measurement rows by actual size | Versioned chart, exact size/variant/piece references, named measurement columns, value/range, unit, basis and applicability. |
| `stock_reference` | Read from stock owner | Variant/location/unit reference, authoritative state, freshness and explicitly unknown/disabled state; no local invented quantity. |
| `coverage_reference` | Coverage-owner projection | Supported method, location/area reference, eligibility result and freshness. |
| `resource_reference` | Eligible resource projection | Actual eligible provider/asset reference and permitted public label, distinct from its private master record. |
| `availability_reference` | Read from availability authority | Exact scoped offering/resource/occurrence constraints and available/unavailable/request-only/unknown state with freshness. |
| `schedule_reference` | Booking rule references | Scoped hours, exact duration, buffers, lead time/horizon and exceptions in Africa/Nairobi; underlying owner remains authoritative. |
| `structured_request` | Purpose-specific private request fields | Reviewed named fields, types, conditions and privacy; no undifferentiated public customer-notes blob. |
| `contact_reference` | Private customer/contact selector | Existing authorized contact reference and only necessary request-specific details. |
| `customization_schema` | Customization choices and private response form | Allowed text/media/measurements/options, compatibility and approval rules; actual personal text/uploads stay private. |
| `verification_reference` | Read from verification owner | Evidence reference, applicable review state and permitted public claim projection; uploading is not approval. |
| `technical_specs` | Named manufacturer specification rows | Specific reviewed key, typed value, unit/standard/rating method, compatibility and source; merchant extensions do not automatically become shared filters. |
| `electrical_specs` | Electrical rating fields | Applicable input/output voltage, current, power, frequency, connector, battery capacity and rating method, each distinct with unit. |
| `camera_specs` | Camera specification rows | Named camera/lens, resolution, sensor/lens features and source with units where relevant. |
| `display_specs` | Display fields | Diagonal and unit, pixel width/height, panel type, refresh rate and supported interfaces; actual configured values only. |
| `rating_table` | Published rating rows | Rating value, scale/method, unit and source/version; unlike rating systems cannot be compared silently. |
| `condition_report` | Condition and refurbishment disclosures | Actual grade definition, defects, replaced parts and measured condition where supplied; private serial data excluded. |
| `connector_pair` | Connector endpoints | Named connector/gender at each end and actual supported version/protocol. |
| `power_profile_table` | Port and power profiles | Port ID/type, direction, voltage/current/power, supported protocol and shared versus per-port maximum, with units. |
| `electrical_capacity` | Battery capacity and basis | Rated capacity value/unit, relevant rated voltage, cell-versus-output basis and source; no invented delivered runtime. |
| `labelled_product_specs` | Structured product-label facts | Exact identity/form, ingredient or strength value/unit/basis and pack quantity as applicable; no generated dosage or efficacy advice. |
| `nutrition_table` | Declared nutrition label rows | Nutrient, quantity/unit, per-serving/per-100-unit basis, serving quantity and authoritative label source. |
| `secure_document_reference` | Authorized private document upload/reference | Purpose, permitted document type and secure reference; never public raw content or generic merchant access. |
| `asset_class_reference` | Guaranteed asset or class selection | Guaranteed specific asset versus class, promised features, or-similar policy and actual resource-allocation reference. |
| `capacity_table` | Separate capacity limits | Named limit such as seats/bags/people, value/unit, dimensions/assumptions and actual applicable configuration. |
| `distance_policy` | Mileage allowance and extras | Unlimited or allowance value/distance unit/period, excess charge/currency/basis and applicable policy version. |
| `deposit_policy_reference` | Deposit terms reference | Applicable amount/currency or approved calculation, collection/release timing, conditions and authority. |
| `interval_policy` | Start/end and interval rules | Local date versus timed instant, end-exclusive semantics where applicable, minimum/maximum, buffers and charging/late policy. |
| `location_option_table` | Handover/return choices | Permitted place references, directions, time restrictions and additional charges; exact private customer places remain private. |
| `duration_policy` | Time allowance and extra-time charges | Included time/unit, trigger, excess-time charge/currency/basis and approved terms. |
| `location_request` | Private address or route entry | Purpose-specific private coordinates/address/access details and service-area eligibility; no public listing exposure. |
| `date_time_selection` | Customer date or time selection | Explicit local date or offset-bearing instant, interval endpoints and Africa/Nairobi display; feasibility rechecked by owner. |
| `capacity_request` | Customer party and capacity inputs | People, bags, child/accessibility/equipment preferences and units, checked against actual compatible capacity. |
| `location_reference` | Public venue/place projection | Permitted public venue identity, location, access and accessibility facts from their owner. |
| `session_reference` | Actual dated occurrence references | Occurrence ID, local/offset-bearing start/end, venue, actual capacity and source freshness. |
| `ticket_option_table` | Ticket tiers and admission choices | Tier/zone/seat choice, occurrence, included access, quantity limits, price reference and shared inventory/capacity allocation. |
| `deliverable_table` | Deliverables and acceptance rows | Output, quantity/unit, format, turnaround, revision scope and rights reference. |
| `inclusion_table` | Included/excluded scope rows | Named component, included/excluded/optional state, quantity/unit, fee reference and supplier confirmation dependency. |
| `entitlement_table` | Plan benefits and redemption rules | Benefit, credit/access/delivery unit, quantity/period, limits and linked booking/order workflow; no automatic reservations. |
| `period_policy` | Validity, billing and renewal terms | Exact dates/calendar period or elapsed duration, unit, minimum term, expiry and explicit renewal/charge consent policy. |
| `itinerary_table` | Ordered itinerary steps | Day/local date/timed milestone, stop/activity, travel/overnight scope, inclusions and actual supplier references. |
| `task_table` | Task/checklist scope | Named included/excluded/optional tasks, workload/unit, deliverable and assessment/acceptance rule. |
| `item_rate_table` | Item/weight processing price rows | Item/care category, count/weight unit, price reference, applicable minimums and assessment adjustment policy. |
| `linked_window_reference` | Paired processing and fulfilment promises | Collection window, workload/processing constraints, feasible return window and actual authority/acceptance state. |
| `business_reference` | Public provider identity | Actual business identity and permitted verification projection; no invented approved badge. |
| `intake_schema` | Private customer-input form definition | Named input, type, required condition and purpose/access rule; actual responses live privately in the transaction. |
| `route_table` | Supported route and leg rows | Origin/destination zones/ports, included legs, mode, estimate/firm status and authoritative service coverage. |
| `charge_basis` | Freight or service charge measures | Unit such as kg/m3/container, minimums, rounding and carrier-approved conversion rule/source; never invent a divisor. |
| `cargo_dimension_table` | Per-piece shipment measurements | Piece ID/count, length/width/height and gross mass with units; actual volume/chargeable mass derives through approved carrier rules. |
| `storage_capacity` | Storage capacity and unit fit | Unit type, usable dimensions/height, area/volume/pallet quantity and constraints with units; separate allocated and free capacity. |
| `capacity_reference` | Actual shared capacity reference | Occurrence/resource pool, unit, permitted quantities and actual authoritative availability; visible group-size limits are separate from free places. |
| `integer_or_range` | Integer or declared integer range | Known integer or explicit minimum/maximum and named meaning, such as model year; unknown values stay unknown. |
| `vehicle_body` | Vehicle body style and doors | Actual body-style descriptor and separate integer door count; class alternatives and guaranteed features are distinguished. |
| `gift_item_specs` | Actual gift item specification | Specific base item type, material, named dimensions with units, actual included pieces and variant choices; personalization is separate. |

## Fields

| Field | Label | Type | Scope / owner | Visibility and destinations |
| --- | --- | --- | --- | --- |
| `common.name` | Offering name | `text` | offering / offerings | public; card, details |
| `common.summary` | Short description | `text` | offering / offerings | public; card, details |
| `common.media` | Photos or relevant media | `media_list` | offering / offerings | public; card, details |
| `common.type` | Specific offering type | `reference` | offering / offerings | public; details |
| `common.locations` | Applicable branches or channels | `reference_list` | offering / offerings | public; fulfilment |
| `common.source` | Content source and external identity | `reference` | offering / offerings | internal; internal |
| `sale.unit` | Sale unit and pack quantity | `quantity` | offering / offerings | public; card, pricing |
| `sale.variants` | Actual purchasable combinations | `variant_table` | offering / offerings | public; options |
| `sale.condition` | Item condition | `enum` | offering / offerings | public; specifications |
| `sale.returns` | Applicable return and warranty references | `policy_reference` | offering / offerings | public; terms |
| `price.basis` | How the price is calculated | `enum` | offering / pricing | public; card, pricing |
| `price.amount` | Published price or quote status | `money_or_quote` | offering / pricing | public; card, pricing |
| `price.charges` | Included and additional charges | `charge_table` | offering / pricing | public; pricing, terms |
| `price.policy` | Price and policy version | `reference` | offering / pricing | internal; internal |
| `stock.mode` | Stock control mode | `enum` | variant_location / stock | internal; internal |
| `stock.availability` | Availability by variant and location | `stock_reference` | variant_location / stock | public; options, card |
| `fulfilment.methods` | Delivery, pickup, visit or remote methods | `enum_list` | offering / fulfillment | public; fulfilment |
| `fulfilment.coverage` | Service area and pickup locations | `coverage_reference` | offering / service_areas | public; fulfilment |
| `fulfilment.lead_time` | Preparation or fulfilment lead time | `duration` | offering / fulfillment | public; card, fulfilment |
| `fulfilment.instructions` | Customer-facing fulfilment instructions | `text` | offering / fulfillment | public; fulfilment |
| `service.scope` | What the service includes and excludes | `text_list` | offering / offerings | public; details, terms |
| `service.methods` | Service location or format | `enum_list` | offering / offerings | public; options, fulfilment |
| `service.duration` | Service duration and unit | `duration_or_assessment` | offering / offerings | public; card, schedule |
| `service.provider` | Eligible provider or resource description | `resource_reference` | offering / offerings | public; details, schedule |
| `service.preparation` | Customer preparation and prerequisites | `text_list` | offering / offerings | public; details, terms |
| `service.cancellation` | Cancellation, reschedule and no-show terms | `policy_reference` | offering / offerings | public; terms |
| `schedule.availability` | Available dates, times or capacity | `availability_reference` | offering / availability | public; schedule |
| `schedule.intake` | How acceptance works | `enum` | offering / availability | public; card, schedule, terms |
| `schedule.rules` | Lead time, buffers and booking horizon | `schedule_reference` | offering / availability | public; schedule, terms |
| `request.scope` | Requested work and preferences | `text` | transaction / work_items | private_intake; request_form |
| `request.place_time` | Relevant location, dates and quantities | `structured_request` | transaction / work_items | private_intake; request_form |
| `request.contact` | Customer contact for this request | `contact_reference` | transaction / work_items | private_intake; request_form |
| `apparel.brand` | Brand and style reference inherited from listing identity | `text` | offering / offerings | public; specifications |
| `apparel.fabric` | Fabric composition | `material_list` | offering / offerings | public; specifications |
| `apparel.fit` | Fit and silhouette | `enum` | offering / offerings | public; specifications |
| `apparel.stretch` | Stretch or adjustability | `enum` | offering / offerings | public; specifications |
| `apparel.care` | Care instructions | `text_list` | offering / offerings | public; details |
| `apparel.colour` | Available colours and patterns | `enum_list` | offering / offerings | public; options |
| `sizing.system` | Size labels and sizing system | `size_system` | variant_size / offerings | public; options, size_guide |
| `sizing.basis` | Measurement basis and units | `measurement_basis` | variant_size / offerings | public; size_guide |
| `sizing.rows` | Chart rows for actual sizes | `measurement_chart` | variant_size / offerings | public; size_guide |
| `dress.bust` | Bust measurement by size | `length_or_range` | variant_size / offerings | public; size_guide |
| `dress.waist` | Waist measurement by size | `length_or_range` | variant_size / offerings | public; size_guide |
| `dress.hips` | Hip measurement by size | `length_or_range` | variant_size / offerings | public; size_guide |
| `dress.length` | Dress length by size | `length` | variant_size / offerings | public; size_guide |
| `dress.neckline` | Neckline | `enum` | offering / offerings | public; specifications |
| `dress.closure` | Closure or fastening | `enum` | offering / offerings | public; specifications |
| `dress.sleeve_style` | Sleeve style | `enum` | offering / offerings | public; specifications |
| `dress.sleeve_length` | Sleeve length by size | `length` | variant_size / offerings | public; size_guide |
| `dress.lining` | Lining | `enum` | offering / offerings | public; specifications |
| `dress.opacity` | Opacity or transparency description | `enum` | offering / offerings | public; specifications |
| `shirt.chest` | Chest or bust by size | `length_or_range` | variant_size / offerings | public; size_guide |
| `shirt.shoulder` | Shoulder width by size | `length` | variant_size / offerings | public; size_guide |
| `shirt.sleeve` | Sleeve length by size | `length` | variant_size / offerings | public; size_guide |
| `shirt.length` | Body length by size | `length` | variant_size / offerings | public; size_guide |
| `shirt.collar` | Collar or neckline style | `enum` | offering / offerings | public; specifications |
| `shirt.sleeve_style` | Sleeve style | `enum` | offering / offerings | public; specifications |
| `shirt.fastening` | Fastening or closure | `enum` | offering / offerings | public; specifications |
| `bottom.inseam` | Inseam by size | `length` | variant_size / offerings | public; size_guide |
| `bottom.rise` | Rise by size | `length` | variant_size / offerings | public; size_guide |
| `bottom.length` | Overall length by size | `length` | variant_size / offerings | public; size_guide |
| `outerwear.layers` | Lining, insulation and intended layers | `text` | offering / offerings | public; specifications |
| `outerwear.features` | Hood, pockets and fastening | `text_list` | offering / offerings | public; specifications |
| `children.age` | Indicative age band | `range` | offering / offerings | public; details |
| `children.height` | Wearer height range by size | `length_or_range` | variant_size / offerings | public; size_guide |
| `children.features` | Adjustable features and school requirements | `text_list` | offering / offerings | public; specifications |
| `footwear.system` | Shoe size system and labels | `size_system` | offering / offerings | public; options, size_guide |
| `footwear.length` | Foot or internal length by size | `length_or_range` | variant_size / offerings | public; size_guide |
| `footwear.width` | Width or width fitting by size | `text` | variant_size / offerings | public; size_guide |
| `footwear.materials` | Upper, lining and sole materials | `material_list` | offering / offerings | public; specifications |
| `footwear.heel` | Heel or sole height | `length` | offering / offerings | public; specifications |
| `footwear.closure` | Fastening and intended use | `text` | offering / offerings | public; specifications |
| `footwear.colour` | Colours and valid size combinations | `variant_table` | offering / offerings | public; options |
| `bag.dimensions` | Length, width and height | `dimensions` | offering / offerings | public; specifications |
| `bag.material` | Outer and lining materials | `material_list` | offering / offerings | public; specifications |
| `bag.capacity` | Capacity and compatible device size | `quantity` | offering / offerings | public; specifications |
| `bag.features` | Compartments, closure and straps | `text_list` | offering / offerings | public; specifications |
| `watch.movement` | Movement and power type | `enum` | offering / offerings | public; specifications |
| `watch.case` | Case dimensions | `dimensions` | offering / offerings | public; specifications |
| `watch.strap` | Strap material and fit range | `text` | offering / offerings | public; specifications, size_guide |
| `watch.features` | Functions and stated resistance rating | `text_list` | offering / offerings | public; specifications |
| `accessory.kind` | Accessory type | `enum` | offering / offerings | public; specifications |
| `accessory.material` | Material and finish | `material_list` | offering / offerings | public; specifications |
| `accessory.fit` | Dimensions and adjustable fit | `measurement_chart` | offering / offerings | public; size_guide |
| `accessory.features` | Closure, set contents and care | `text_list` | offering / offerings | public; specifications |
| `personal_care.kind` | Product type and intended label use | `text` | offering / offerings | public; specifications |
| `personal_care.contents` | Ingredients, materials and pack contents | `text_list` | offering / offerings | public; specifications |
| `personal_care.quantity` | Net contents and pack count | `quantity` | offering / offerings | public; card, specifications |
| `personal_care.instructions` | Label instructions, cautions and storage | `text_list` | offering / offerings | public; details, terms |
| `personal_care.variants` | Formula, shade, scent or compatibility options | `variant_table` | offering / offerings | public; options |
| `intimate.material` | Material and dimensions | `text` | offering / offerings | public; specifications |
| `intimate.compatibility` | Compatibility and care information | `text_list` | offering / offerings | public; specifications |
| `intimate.power` | Power, charging and included accessories | `text_list` | offering / offerings | public; specifications |
| `restricted.eligibility` | Applicable age or eligibility policy | `policy_reference` | offering / offerings | public; terms |
| `restricted.packaging` | Packaging choices | `enum_list` | offering / offerings | public; options, fulfilment |
| `restricted.verification` | Publication or eligibility evidence | `verification_reference` | offering / verification | internal; internal |
| `tobacco.brand` | Brand and exact product | `text` | offering / offerings | public; specifications |
| `tobacco.format` | Format and pack count | `quantity` | offering / offerings | public; card, specifications |
| `tobacco.origin` | Declared origin and product dimensions | `text` | offering / offerings | public; specifications |
| `tobacco.strength` | Labelled composition and warnings | `text_list` | offering / offerings | public; details, terms |
| `vape.kind` | Device, refill or accessory type | `enum` | offering / offerings | public; specifications |
| `vape.compatibility` | Compatible models and fittings | `reference_list` | offering / offerings | public; specifications |
| `vape.contents` | Liquid volume, labelled composition and strength | `text` | offering / offerings | public; specifications |
| `vape.power` | Battery, charging and included components | `text_list` | offering / offerings | public; specifications |
| `beverage.producer` | Brand, producer and product name | `text` | offering / offerings | public; specifications |
| `beverage.volume` | Container volume and pack count | `quantity` | offering / offerings | public; card, specifications |
| `beverage.ingredients` | Ingredients and declared allergens | `text_list` | offering / offerings | public; details |
| `beverage.storage` | Storage and serving condition | `text` | offering / offerings | public; details, fulfilment |
| `alcohol.abv` | Alcohol by volume | `percentage` | offering / offerings | public; specifications |
| `alcohol.origin` | Country, region and producer origin | `text` | offering / offerings | public; specifications |
| `alcohol.style` | Wine, spirit or beer style | `text` | offering / offerings | public; specifications |
| `alcohol.vintage` | Vintage, age statement or non-vintage | `text` | offering / offerings | public; specifications |
| `alcohol.profile` | Declared tasting profile | `text_list` | offering / offerings | public; specifications |
| `food.ingredients` | Ingredients and declared allergens | `text_list` | offering / offerings | public; details |
| `food.portion` | Portion, serving size or pack quantity | `quantity` | offering / offerings | public; card, specifications |
| `food.dietary` | Supported dietary descriptors | `enum_list` | offering / offerings | public; specifications |
| `food.options` | Required choices and optional additions | `option_group_table` | offering / offerings | public; options, pricing |
| `food.handling` | Storage, freshness and handling | `text` | offering / offerings | public; details, fulfilment |
| `dish.cuisine` | Cuisine and dish style | `text` | offering / offerings | public; specifications |
| `dish.preparation` | Preparation and serving style | `text` | offering / offerings | public; specifications |
| `dish.components` | Meal and combo contents | `component_table` | offering / offerings | public; details, options |
| `coffee.base` | Drink base and preparation method | `text` | offering / offerings | public; specifications |
| `coffee.size` | Cup volume or stated serving sizes | `quantity_list` | offering / offerings | public; options |
| `coffee.choices` | Milk, sweetness, temperature and extras | `option_group_table` | offering / offerings | public; options, pricing |
| `cake.shape` | Shape, tiers and dimensions | `dimensions` | offering / offerings | public; specifications |
| `cake.servings` | Expected serving quantity | `count_or_range` | offering / offerings | public; card, specifications |
| `cake.flavour` | Sponge, filling and icing choices | `option_group_table` | offering / offerings | public; options, pricing |
| `cake.design` | Design, inscription and approval method | `customization_schema` | offering / offerings | public; options, terms |
| `cake.due` | Production lead time and due-date rules | `duration` | offering / offerings | public; fulfilment, terms |
| `packaged_food.brand` | Brand and exact labelled product | `text` | offering / offerings | public; specifications |
| `packaged_food.net` | Net quantity and pack count | `quantity` | offering / offerings | public; card, specifications |
| `packaged_food.nutrition` | Declared nutrition and basis | `nutrition_table` | offering / offerings | public; specifications |
| `packaged_food.storage` | Storage and shelf-life guidance | `text` | offering / offerings | public; details |
| `produce.variety` | Produce type and variety | `text` | offering / offerings | public; specifications |
| `produce.grade` | Grade, ripeness and preparation | `text` | offering / offerings | public; specifications |
| `produce.sale` | Loose weight or fixed pack basis | `quantity` | offering / offerings | public; options, pricing |
| `produce.origin` | Declared origin and certification reference | `text` | offering / offerings | public; specifications |
| `produce.substitution` | Substitution and seasonal availability policy | `policy_reference` | offering / offerings | public; terms |
| `protein.kind` | Species or product and cut | `text` | offering / offerings | public; specifications |
| `protein.state` | Fresh, chilled or frozen state | `enum` | offering / offerings | public; card, specifications |
| `protein.weight` | Net weight, size grade and count | `quantity` | offering / offerings | public; options, pricing |
| `protein.preparation` | Bone, skin and preparation choices | `option_group_table` | offering / offerings | public; options |
| `protein.source` | Declared provenance or certification | `text` | offering / offerings | public; specifications |
| `household.purpose` | Specific product and intended surfaces/use | `text` | offering / offerings | public; specifications |
| `household.contents` | Pack size, concentration and contents | `quantity` | offering / offerings | public; card, specifications |
| `household.variants` | Scent, format or material variants | `variant_table` | offering / offerings | public; options |
| `household.warnings` | Label cautions and storage | `text_list` | offering / offerings | public; details, terms |
| `gift.contents` | Included items and quantities | `component_table` | offering / offerings | public; details |
| `gift.presentation` | Wrapping and presentation options | `option_group_table` | offering / offerings | public; options, pricing |
| `gift.personalization` | Message or personalization choices | `customization_schema` | offering / offerings | public; options |
| `gift.occasion` | Occasion and style descriptors | `enum_list` | offering / offerings | public; specifications |
| `flowers.varieties` | Flower varieties and stem quantities | `component_table` | offering / offerings | public; specifications |
| `flowers.size` | Arrangement size and dimensions | `dimensions` | offering / offerings | public; options, specifications |
| `flowers.state` | Fresh, dried or preserved | `enum` | offering / offerings | public; specifications |
| `flowers.vase` | Vase and extras | `option_group_table` | offering / offerings | public; options, pricing |
| `custom.scope` | Customizable features and limits | `customization_schema` | offering / offerings | public; options |
| `custom.approval` | Proof or design approval process | `policy_reference` | offering / offerings | public; terms |
| `custom.lead_time` | Production lead time and acceptance | `duration_or_assessment` | offering / offerings | public; fulfilment, terms |
| `beauty_service.technique` | Treatment, technique and target area | `text` | offering / offerings | public; specifications |
| `beauty_service.choices` | Length, style, finish or treatment options | `option_group_table` | offering / offerings | public; options, pricing |
| `beauty_service.included` | Products, materials and preparation included | `text_list` | offering / offerings | public; details, terms |
| `beauty_service.requirements` | Preparation or consultation requirement | `policy_reference` | offering / offerings | public; details, terms |
| `cosmetic.finish` | Finish, coverage and formulation | `text` | offering / offerings | public; specifications |
| `cosmetic.shade` | Shades and undertones | `variant_table` | offering / offerings | public; options |
| `cosmetic.suitability` | Labelled skin or hair type | `text_list` | offering / offerings | public; specifications |
| `fragrance.concentration` | Concentration and product form | `text` | offering / offerings | public; specifications |
| `fragrance.notes` | Declared fragrance family and notes | `text_list` | offering / offerings | public; specifications |
| `fragrance.format` | Volume, refill and set contents | `quantity` | offering / offerings | public; options, specifications |
| `durable.brand` | Brand, manufacturer and model | `text` | offering / offerings | public; specifications |
| `durable.dimensions` | Product dimensions and weight | `dimensions` | offering / offerings | public; specifications |
| `durable.materials` | Materials, finish and colour | `material_list` | offering / offerings | public; specifications |
| `durable.contents` | Included components and accessories | `component_table` | offering / offerings | public; details |
| `durable.warranty` | Warranty and support details | `policy_reference` | offering / offerings | public; terms |
| `furniture.kind` | Furniture type and configuration | `enum` | offering / offerings | public; specifications |
| `furniture.dimensions` | Assembled dimensions and access requirements | `dimensions` | offering / offerings | public; specifications |
| `furniture.capacity` | Seating, mattress fit or stated load | `quantity` | offering / offerings | public; specifications |
| `furniture.finish` | Upholstery, finish and assembly options | `option_group_table` | offering / offerings | public; options, pricing |
| `furniture.assembly` | Assembly, installation and delivery scope | `text` | offering / offerings | public; fulfilment, terms |
| `textile.kind` | Item and set contents | `text` | offering / offerings | public; specifications |
| `textile.measurements` | Dimensions and fit | `dimensions` | offering / offerings | public; options, specifications |
| `textile.composition` | Material, weave and care | `material_list` | offering / offerings | public; specifications |
| `appliance.capacity` | Rated capacity and relevant output | `quantity` | offering / offerings | public; specifications |
| `appliance.power` | Voltage, power, plug and supply requirements | `electrical_specs` | offering / offerings | public; specifications |
| `appliance.energy` | Published energy/noise ratings | `rating_table` | offering / offerings | public; specifications |
| `appliance.installation` | Connections, clearance and installation needs | `text_list` | offering / offerings | public; details, fulfilment |
| `kitchenware.size` | Dimensions, capacity and item count | `dimensions` | offering / offerings | public; specifications |
| `kitchenware.material` | Material, coating and finish | `material_list` | offering / offerings | public; specifications |
| `kitchenware.compatibility` | Heat-source and care compatibility | `text_list` | offering / offerings | public; specifications |
| `book.title` | Title, author and publisher | `text` | offering / offerings | public; specifications |
| `book.edition` | Edition, publication date and identifier | `text` | offering / offerings | public; specifications |
| `book.format` | Format, language and page count | `text` | offering / offerings | public; options, specifications |
| `book.genre` | Genre and audience information | `text_list` | offering / offerings | public; specifications |
| `stationery.kind` | Specific item and purpose | `text` | offering / offerings | public; specifications |
| `stationery.size` | Dimensions, format and pack count | `dimensions` | offering / offerings | public; specifications |
| `stationery.materials` | Material, colour and specification | `text_list` | offering / offerings | public; specifications |
| `stationery.compatibility` | Compatible device or refill system | `reference_list` | offering / offerings | public; specifications |
| `device.model` | Exact model, generation and condition grade | `text` | offering / offerings | public; specifications |
| `device.processor` | Processor and platform | `text` | offering / offerings | public; specifications |
| `device.memory` | Memory and storage options | `quantity_list` | offering / offerings | public; options, specifications |
| `device.display` | Display size, resolution and panel | `display_specs` | offering / offerings | public; specifications |
| `device.connectivity` | Ports, networks and compatibility | `text_list` | offering / offerings | public; specifications |
| `device.battery` | Battery and charging specifications | `electrical_specs` | offering / offerings | public; specifications |
| `phone.network` | SIM, eSIM and network model | `text` | offering / offerings | public; specifications |
| `phone.cameras` | Camera specifications | `camera_specs` | offering / offerings | public; specifications |
| `phone.condition` | Refurbished battery/repair condition | `condition_report` | offering / offerings | public; specifications |
| `computer.graphics` | Graphics and upgrade options | `text` | offering / offerings | public; specifications |
| `computer.form` | Form factor and included peripherals | `text` | offering / offerings | public; specifications |
| `computer.compatibility` | Expansion and software licence scope | `text_list` | offering / offerings | public; specifications |
| `accessory_tech.kind` | Accessory type and intended device | `text` | offering / offerings | public; specifications |
| `accessory_tech.compatibility` | Supported device models and protocols | `reference_list` | offering / offerings | public; specifications |
| `accessory_tech.rating` | Dimensions, length and rated electrical/data capacity | `technical_specs` | offering / offerings | public; specifications |
| `gaming.platform` | Platform, generation and region | `text` | offering / offerings | public; specifications |
| `gaming.edition` | Edition, media format and contents | `text` | offering / offerings | public; specifications |
| `gaming.compatibility` | Controller, account and online requirements | `text_list` | offering / offerings | public; specifications |
| `gaming.rating` | Published content classification | `text` | offering / offerings | public; specifications |
| `audio.format` | Headphone, speaker or audio equipment type | `enum` | offering / offerings | public; specifications |
| `audio.connections` | Connections and supported codecs | `text_list` | offering / offerings | public; specifications |
| `audio.ratings` | Power, impedance and other published ratings | `technical_specs` | offering / offerings | public; specifications |
| `audio.features` | Microphone, noise control and battery features | `text_list` | offering / offerings | public; specifications |
| `smart.ecosystem` | Supported hubs, apps and ecosystems | `reference_list` | offering / offerings | public; specifications |
| `smart.network` | Network, power and installation requirements | `technical_specs` | offering / offerings | public; specifications |
| `smart.subscription` | Ongoing fees and privacy-related features | `text_list` | offering / offerings | public; details, terms |
| `telecom.network` | Provider and exact plan/device | `text` | offering / offerings | public; specifications |
| `telecom.allowance` | Data, call or service allowance | `quantity` | offering / offerings | public; card, specifications |
| `telecom.eligibility` | Coverage and compatibility requirements | `text_list` | offering / offerings | public; details, terms |
| `telecom.activation` | Activation process and recurring charges | `policy_reference` | offering / offerings | public; pricing, terms |
| `repair.equipment` | Supported product, model or vehicle | `reference_list` | offering / offerings | public; specifications |
| `repair.assessment` | Assessment, diagnostics and quoted work | `text` | offering / offerings | public; details, terms |
| `repair.parts` | Parts, labour, warranty and exclusions | `component_table` | offering / offerings | public; details, pricing, terms |
| `repair.turnaround` | Turnaround estimate and intake method | `duration_or_assessment` | offering / offerings | public; fulfilment |
| `medicine.identity` | Exact product and manufacturer | `text` | offering / offerings | public; specifications |
| `medicine.form` | Form, labelled strength and pack quantity | `labelled_product_specs` | offering / offerings | public; specifications |
| `medicine.eligibility` | Applicable dispensing and verification policy | `policy_reference` | offering / offerings | public; terms |
| `medicine.information` | Approved label information and storage | `text_list` | offering / offerings | public; details |
| `medical_supply.purpose` | Device or supply type and labelled use | `text` | offering / offerings | public; specifications |
| `medical_supply.size` | Sizes, dimensions, units and pack contents | `quantity_list` | offering / offerings | public; options, specifications |
| `medical_supply.compatibility` | Compatibility, sterility and use conditions | `technical_specs` | offering / offerings | public; specifications |
| `medical_supply.evidence` | Required product verification reference | `verification_reference` | offering / verification | internal; internal |
| `baby.kind` | Specific baby product type | `text` | offering / offerings | public; specifications |
| `baby.fit` | Labelled age, weight or size range | `range_with_unit` | offering / offerings | public; options, specifications |
| `baby.material` | Materials, compatibility and pack contents | `text_list` | offering / offerings | public; specifications |
| `supplement.ingredients` | Labelled ingredients and amount basis | `labelled_product_specs` | offering / offerings | public; specifications |
| `supplement.form` | Product form, net quantity and servings | `quantity_list` | offering / offerings | public; specifications |
| `supplement.claims` | Approved label information and cautions | `text_list` | offering / offerings | public; details, terms |
| `health_service.service` | Service name, scope and provider specialty | `text` | offering / offerings | public; specifications |
| `health_service.format` | Venue, remote or home-visit format | `enum_list` | offering / offerings | public; options, fulfilment |
| `health_service.provider` | Public professional profile and verification reference | `resource_reference` | offering / offerings | public; details |
| `health_service.preparation` | Approved preparation and result-delivery information | `policy_reference` | offering / offerings | public; details, terms |
| `lab.test` | Test or panel identity and included tests | `component_table` | offering / offerings | public; specifications |
| `lab.collection` | Sample and supported collection method | `text` | offering / offerings | public; details, fulfilment |
| `lab.turnaround` | Published result turnaround basis | `duration_or_assessment` | offering / offerings | public; details |
| `health_intake.contact` | Necessary patient contact and booking identity | `contact_reference` | transaction / work_items | private_intake; request_form |
| `health_intake.requirements` | Necessary referral or administrative documents | `secure_document_reference` | transaction / work_items | private_intake; request_form |
| `rental.identity` | Exact vehicle or vehicle class | `asset_class_reference` | offering / offerings | public; card, specifications |
| `rental.make` | Make, model, year or class description | `text` | offering / offerings | public; specifications |
| `rental.seats` | Passenger seats and luggage capacity | `capacity_table` | offering / offerings | public; card, specifications |
| `rental.transmission` | Transmission and fuel/power type | `enum_list` | offering / offerings | public; card, specifications |
| `rental.features` | Air conditioning and equipment | `text_list` | offering / offerings | public; specifications |
| `rental.mileage` | Distance allowance and excess-distance charge | `distance_policy` | offering / offerings | public; pricing, terms |
| `rental.fuel` | Fuel or charging return policy | `policy_reference` | offering / offerings | public; terms |
| `rental.deposit` | Deposit and release conditions | `deposit_policy_reference` | offering / offerings | public; pricing, terms |
| `rental.cover` | Included cover and exclusions | `policy_reference` | offering / offerings | public; terms |
| `rental.eligibility` | Driver, use and travel restrictions | `policy_reference` | offering / offerings | public; terms |
| `rental.driver` | Self-drive or optional driver | `option_group_table` | offering / offerings | public; options, pricing |
| `rental.period` | Rental duration and pickup/return rules | `interval_policy` | offering / offerings | public; schedule, terms |
| `rental.handover` | Pickup and return places and charges | `location_option_table` | offering / offerings | public; options, fulfilment |
| `rental_long.billing` | Billing period, commitment and usage limits | `policy_reference` | offering / offerings | public; pricing, terms |
| `rental_long.support` | Maintenance, replacement and support scope | `text_list` | offering / offerings | public; details, terms |
| `rental_long.corporate` | Business account requirements | `policy_reference` | offering / offerings | public; terms |
| `bike.kind` | Bike type, model and fit | `text` | offering / offerings | public; card, specifications |
| `bike.power` | Engine or battery specifications | `technical_specs` | offering / offerings | public; specifications |
| `bike.equipment` | Included helmet, locks and equipment | `component_table` | offering / offerings | public; details, terms |
| `bike.terms` | Rental eligibility, deposit and return rules | `policy_reference` | offering / offerings | public; pricing, terms |
| `bike.usage` | Fuel, charging and distance policy | `policy_reference` | offering / offerings | public; pricing, terms |
| `transfer.route` | Airports, origin/destination zones and route basis | `route_table` | offering / offerings | public; card, details |
| `transfer.vehicle` | Vehicle class, seats and luggage | `capacity_table` | offering / offerings | public; card, options |
| `transfer.included` | Waiting, parking, tolls and extra stops | `inclusion_table` | offering / offerings | public; pricing, terms |
| `transfer.meeting` | Meeting point and flight-delay policy | `policy_reference` | offering / offerings | public; fulfilment, terms |
| `transfer.accessibility` | Child seats and accessibility options | `option_group_table` | offering / offerings | public; options |
| `greeting.scope` | Greeting area, escort scope and assistance | `text_list` | offering / offerings | public; details |
| `greeting.waiting` | Included waiting and extra-time policy | `duration_policy` | offering / offerings | public; pricing, terms |
| `greeting.sign` | Meeting-sign options | `customization_schema` | offering / offerings | public; options |
| `trip_intake.route` | Chosen pickup and destination | `location_request` | transaction / work_items | private_intake; request_form |
| `trip_intake.time` | Travel or rental start/end | `date_time_selection` | transaction / work_items | private_intake; request_form |
| `trip_intake.party` | Passengers, luggage and extras | `capacity_request` | transaction / work_items | private_intake; request_form |
| `trip_intake.flight` | Flight and passenger details | `structured_request` | transaction / work_items | private_intake; request_form |
| `event.programme` | Event programme and organizer | `text` | offering / offerings | public; details |
| `event.venue` | Venue, access and accessibility | `location_reference` | offering / offerings | public; card, details |
| `event.occurrences` | Actual dated performances or sessions | `session_reference` | offering / offerings | public; schedule |
| `event.tiers` | Ticket types, inclusions and quantity rules | `ticket_option_table` | offering / offerings | public; options, pricing |
| `event.admission` | Entry, transfer and cancellation policy | `policy_reference` | offering / offerings | public; terms |
| `session.activity` | Activity, curriculum and level | `text` | offering / offerings | public; card, details |
| `session.format` | Venue, format and instructor | `text` | offering / offerings | public; details, fulfilment |
| `session.duration` | Session duration and occurrence pattern | `duration` | offering / offerings | public; card, schedule |
| `session.capacity` | Group size and place allocation | `capacity_reference` | offering / offerings | public; options, schedule |
| `session.equipment` | Included equipment and customer prerequisites | `text_list` | offering / offerings | public; details, terms |
| `photography.style` | Shoot type, style and location options | `text` | offering / offerings | public; card, details |
| `photography.duration` | Shoot time and coverage | `duration` | offering / offerings | public; pricing, schedule |
| `photography.deliverables` | Image count, editing and delivery format | `deliverable_table` | offering / offerings | public; details |
| `photography.rights` | Usage rights, turnaround and revisions | `policy_reference` | offering / offerings | public; terms |
| `event_service.kind` | Event type and package scope | `text` | offering / offerings | public; card, details |
| `event_service.size` | Guest range and supported locations | `capacity_table` | offering / offerings | public; specifications |
| `event_service.suppliers` | Included suppliers and deliverables | `component_table` | offering / offerings | public; details, pricing |
| `event_service.acceptance` | Quote, approval and change process | `policy_reference` | offering / offerings | public; terms |
| `space.space` | Space type and compatible party size | `capacity_table` | offering / offerings | public; card, options |
| `space.occupancy` | Duration, turnover and seating rules | `interval_policy` | offering / offerings | public; schedule, terms |
| `space.terms` | Deposit, minimum spend and cancellation terms | `policy_reference` | offering / offerings | public; pricing, terms |
| `membership.entitlement` | Included benefits, quantities and exclusions | `entitlement_table` | offering / offerings | public; card, details |
| `membership.validity` | Term, validity and redemption rules | `period_policy` | offering / offerings | public; pricing, terms |
| `membership.renewal` | Renewal, cancellation and recurring payment consent | `policy_reference` | offering / offerings | public; terms |
| `membership.booking` | Separate booking or delivery requirements | `policy_reference` | offering / offerings | public; schedule, fulfilment |
| `tour.itinerary` | Itinerary, stops and activity schedule | `itinerary_table` | offering / offerings | public; details |
| `tour.duration` | Duration, nights and departure options | `duration` | offering / offerings | public; card, schedule |
| `tour.party` | Private/shared format and party limits | `capacity_table` | offering / offerings | public; card, options |
| `tour.inclusions` | Guide, meals, accommodation, transport and fees | `inclusion_table` | offering / offerings | public; details, pricing, terms |
| `tour.requirements` | Access, language, equipment and conditions | `text_list` | offering / offerings | public; details, terms |
| `tour.supplier` | Confirmation and change policy | `policy_reference` | offering / offerings | public; terms |
| `cleaning.tasks` | Included tasks, surfaces and exclusions | `task_table` | offering / offerings | public; details |
| `cleaning.quantity` | Rooms, area, workload and team basis | `quantity_list` | offering / offerings | public; options, pricing |
| `cleaning.supplies` | Equipment, products and customer requirements | `text_list` | offering / offerings | public; details, terms |
| `cleaning.completion` | Visit, assessment and completion method | `policy_reference` | offering / offerings | public; fulfilment, terms |
| `laundry.items` | Accepted item types and care categories | `item_rate_table` | offering / offerings | public; options, pricing |
| `laundry.scope` | Wash, dry, press and treatment inclusions | `text_list` | offering / offerings | public; details |
| `laundry.turnaround` | Turnaround and express choices | `duration_or_assessment` | offering / offerings | public; card, fulfilment |
| `laundry.inspection` | Assessment, stain treatment and damage policy | `policy_reference` | offering / offerings | public; terms |
| `laundry.windows` | Collection, processing and return constraints | `linked_window_reference` | offering / offerings | public; schedule, fulfilment |
| `vehicle_job.vehicle` | Supported vehicle types and fitment | `reference_list` | offering / offerings | public; specifications |
| `vehicle_job.package` | Service tasks and exclusions | `task_table` | offering / offerings | public; details |
| `vehicle_job.location` | Workshop, mobile or roadside method | `enum_list` | offering / offerings | public; options, fulfilment |
| `vehicle_job.duration` | Duration or diagnostic estimate | `duration_or_assessment` | offering / offerings | public; card, schedule |
| `tire.size` | Tyre dimensions and size designation | `technical_specs` | offering / offerings | public; card, specifications |
| `tire.rating` | Load, speed and condition specification | `technical_specs` | offering / offerings | public; specifications |
| `tire.fitment` | Compatible fitment and fitting inclusion | `text_list` | offering / offerings | public; details, terms |
| `battery.rating` | Voltage, capacity and start-rating specification | `electrical_specs` | offering / offerings | public; card, specifications |
| `battery.fitment` | Dimensions, terminals and compatible models | `technical_specs` | offering / offerings | public; specifications |
| `battery.service` | Installation, exchange and warranty terms | `policy_reference` | offering / offerings | public; pricing, terms |
| `assistance.scope` | Supported incident or inspection scope | `text_list` | offering / offerings | public; card, details |
| `assistance.limits` | Vehicle, distance and operating limits | `quantity_list` | offering / offerings | public; pricing, terms |
| `assistance.response` | Response estimate and acceptance method | `duration_or_assessment` | offering / offerings | public; fulfilment |
| `assistance.report` | Deliverables and report scope | `text_list` | offering / offerings | public; details, terms |
| `financial.provider` | Provider and service identity | `business_reference` | offering / offerings | public; card, details |
| `financial.scope` | Service purpose and supported channels | `text_list` | offering / offerings | public; details |
| `financial.terms` | Provider-approved fees, rates and eligibility reference | `policy_reference` | offering / offerings | public; pricing, terms |
| `financial.handoff` | Application, quote or provider handoff process | `policy_reference` | offering / offerings | public; terms, fulfilment |
| `financial_scope.products` | Supported service or product types | `enum_list` | offering / offerings | public; specifications |
| `financial_scope.coverage` | Locations, currencies or corridor limits | `text_list` | offering / offerings | public; specifications |
| `coordination.task` | Specific task and deliverables | `task_table` | offering / offerings | public; card, details |
| `coordination.limits` | Included effort, response window and exclusions | `text_list` | offering / offerings | public; pricing, terms |
| `coordination.approval` | Budget, purchase and supplier approval process | `policy_reference` | offering / offerings | public; terms |
| `coordination.privacy` | Required private request information | `intake_schema` | offering / offerings | public; request_form |
| `moving.scope` | Move type and included packing/handling | `text_list` | offering / offerings | public; details |
| `moving.load` | Inventory, load volume and handling limits | `quantity_list` | offering / offerings | public; options, pricing |
| `moving.access` | Access, floor, lift and route factors | `intake_schema` | offering / offerings | public; request_form |
| `moving.terms` | Valuation, cover and damage terms | `policy_reference` | offering / offerings | public; terms |
| `freight.mode` | Freight mode and load service | `enum` | offering / offerings | public; card, details |
| `freight.route` | Supported origin, destination and legs | `route_table` | offering / offerings | public; card, fulfilment |
| `freight.cargo` | Cargo classes, restrictions and handling | `text_list` | offering / offerings | public; details, terms |
| `freight.units` | Chargeable weight, volume or container basis | `charge_basis` | offering / offerings | public; pricing |
| `freight.inclusions` | Transit estimate, clearance and charge inclusions | `inclusion_table` | offering / offerings | public; pricing, terms |
| `freight.acceptance` | Quote validity and carrier confirmation | `policy_reference` | offering / offerings | public; terms |
| `cargo_intake.goods` | Goods, piece count and declared value | `structured_request` | transaction / work_items | private_intake; request_form |
| `cargo_intake.dimensions` | Dimensions, mass and unit per piece | `cargo_dimension_table` | transaction / work_items | private_intake; request_form |
| `cargo_intake.route` | Collection, delivery and required dates | `structured_request` | transaction / work_items | private_intake; request_form |
| `cargo_intake.documents` | Applicable carrier/customs document references | `secure_document_reference` | transaction / work_items | private_intake; request_form |
| `storage.unit` | Storage type, dimensions and capacity unit | `storage_capacity` | offering / offerings | public; card, specifications |
| `storage.goods` | Accepted goods and environment | `text_list` | offering / offerings | public; details, terms |
| `storage.period` | Occupancy, billing and access rules | `period_policy` | offering / offerings | public; pricing, terms |
| `storage.handling` | Receiving, picking, dispatch and cover scope | `inclusion_table` | offering / offerings | public; details, pricing, terms |
| `storage.availability` | Actual compatible unit/capacity source | `availability_reference` | offering / offerings | public; schedule |
| `pizza.size` | Pizza diameter and portions | `length` | offering / offerings | public; options, specifications |
| `pizza.base` | Crust, base and topping choices | `option_group_table` | offering / offerings | public; options, pricing |
| `bakery.kind` | Item, flavour and filling | `text` | offering / offerings | public; specifications |
| `bakery.size` | Piece dimensions, weight or serving format | `quantity` | offering / offerings | public; options, specifications |
| `bakery.choices` | Toppings, temperature and serving options | `option_group_table` | offering / offerings | public; options, pricing |
| `wellness.modality` | Session modality, focus and intensity description | `text` | offering / offerings | public; card, details |
| `wellness.inclusions` | Facilities, products and equipment included | `text_list` | offering / offerings | public; details |
| `wellness.preferences` | Supported provider and format preferences | `option_group_table` | offering / offerings | public; options |
| `installation.compatibility` | Supported items, site and connections | `technical_specs` | offering / offerings | public; details |
| `installation.scope` | Included labour, materials and exclusions | `task_table` | offering / offerings | public; details, pricing |
| `installation.handover` | Testing, handover and support scope | `text_list` | offering / offerings | public; terms |
| `garment_scope.construction` | Garment construction | `enum` | offering / offerings | public; details |
| `garment_scope.pieces` | Included garments and size selection | `component_table` | offering / offerings | public; options |
| `fitted_underwear.kind` | Actual garment type | `enum` | offering / offerings | public; details |
| `fitted_underwear.band` | Underbust or band measurement and system | `length_or_range` | variant_size / offerings | public; size_guide |
| `fitted_underwear.cup` | Cup labels and bust fit guidance | `size_system` | variant_size / offerings | public; options, size_guide |
| `fitted_underwear.bust` | Bust range by actual band/cup combination | `length_or_range` | variant_size / offerings | public; size_guide |
| `fitted_underwear.waist_hips` | Waist and hip fit by size | `measurement_chart` | variant_size / offerings | public; size_guide |
| `cable.ends` | Connector at each end | `connector_pair` | offering / offerings | public; specifications |
| `cable.length` | Cable length | `length` | offering / offerings | public; card, specifications |
| `cable.ratings` | Supported power, data and video specifications | `technical_specs` | offering / offerings | public; specifications |
| `charger.input` | Input voltage, frequency and plug | `electrical_specs` | offering / offerings | public; specifications |
| `charger.outputs` | Port output profiles and shared-power limit | `power_profile_table` | offering / offerings | public; card, specifications |
| `charger.contents` | Included cable and compatible protocols | `text_list` | offering / offerings | public; details |
| `powerbank.capacity` | Rated capacity and measurement basis | `electrical_capacity` | offering / offerings | public; card, specifications |
| `powerbank.ports` | Input/output profiles and supported protocols | `power_profile_table` | offering / offerings | public; specifications |
| `powerbank.size` | Dimensions and weight | `dimensions` | offering / offerings | public; specifications |
| `case.fit` | Exact compatible device models | `reference_list` | offering / offerings | public; card, specifications |
| `case.construction` | Material, coverage and included pieces | `text_list` | offering / offerings | public; specifications |
| `case.features` | Mounting, charging and stand compatibility | `text_list` | offering / offerings | public; specifications |
| `fashion_identity.brand` | Brand or maker | `text` | offering / offerings | public; card, specifications |
| `fashion_identity.style` | Style name or collection | `text` | offering / offerings | public; details |
| `fashion_identity.audience` | Intended audience or fit range | `enum_list` | offering / offerings | public; details |
| `fashion_identity.condition` | Condition details and disclosed defects | `text_list` | offering / offerings | public; details |
| `fashion_identity.photos` | Colour-specific and detail photos | `media_list` | offering / offerings | public; details, options |
| `fashion_variants.pattern` | Pattern or print | `enum_list` | offering / offerings | public; specifications, options |
| `fashion_variants.chart` | Reusable size chart reference and version | `reference` | offering / offerings | public; size_guide |
| `fashion_variants.measurements` | Variant-specific measurement overrides | `measurement_chart` | variant / offerings | public; size_guide |
| `fashion_variants.sku` | Internal variant SKU or supplier reference | `text` | variant / offerings | internal; internal |
| `fashion_care.silhouette` | Silhouette or cut | `enum` | offering / offerings | public; specifications |
| `fashion_care.care` | Washing, drying and ironing guidance | `text_list` | offering / offerings | public; details |
| `fashion_care.finish` | Construction details and functional features | `text_list` | offering / offerings | public; specifications |
| `bottom_extra.leg_opening` | Leg opening by size | `length_or_range` | variant_size / offerings | public; size_guide |
| `bottom_extra.thigh` | Thigh fit by size | `length_or_range` | variant_size / offerings | public; size_guide |
| `bottom_extra.waistband` | Waistband construction | `enum` | offering / offerings | public; specifications |
| `dress_extra.length_style` | Dress length style | `enum` | offering / offerings | public; specifications |
| `dress_extra.adjustments` | Adjustable straps, waist or other fit features | `text_list` | offering / offerings | public; specifications, size_guide |
| `dress_extra.slit` | Slit or special construction detail | `text` | offering / offerings | public; specifications |
| `shoe_extra.shape` | Toe shape and shoe style | `enum` | offering / offerings | public; specifications |
| `shoe_extra.closure` | Fastening | `enum` | offering / offerings | public; specifications |
| `shoe_extra.fit` | Merchant fit notes | `text` | offering / offerings | public; size_guide |
| `shoe_extra.care` | Care and material-specific instructions | `text_list` | offering / offerings | public; details |
| `bag_extra.kind` | Bag type | `enum` | offering / offerings | public; card, specifications |
| `bag_extra.straps` | Strap drop and adjustable length | `length_or_range` | offering / offerings | public; specifications |
| `bag_extra.features` | Compartments, handles, wheels and closure | `text_list` | offering / offerings | public; specifications |
| `bag_extra.lining` | Lining and care information | `text_list` | offering / offerings | public; details |
| `watch_extra.case_material` | Case and glass materials | `material_list` | offering / offerings | public; specifications |
| `watch_extra.strap_material` | Strap or bracelet material | `material_list` | offering / offerings | public; specifications |
| `watch_extra.wrist` | Wrist fit range | `length_or_range` | variant_size / offerings | public; size_guide |
| `watch_extra.strap_width` | Strap width | `length` | offering / offerings | public; specifications |
| `watch_extra.care` | Care, warranty and service information | `text_list` | offering / offerings | public; details, terms |
| `smartwatch.model` | Exact smartwatch model and case version | `text` | offering / offerings | public; card, specifications |
| `smartwatch.compatibility` | Compatible phone systems and required app | `reference_list` | offering / offerings | public; specifications |
| `smartwatch.display` | Display type and size | `display_specs` | offering / offerings | public; specifications |
| `smartwatch.battery` | Battery capacity and charging | `electrical_specs` | offering / offerings | public; specifications |
| `smartwatch.features` | Confirmed connectivity and activity features | `text_list` | offering / offerings | public; specifications |
| `ring.system` | Ring size labels and system | `size_system` | offering / offerings | public; options, size_guide |
| `ring.fit` | Internal diameter or circumference by size | `measurement_chart` | offering / offerings | public; size_guide |
| `ring.width` | Band width and setting dimensions | `dimensions` | offering / offerings | public; specifications |
| `ring.stone` | Stone, setting and declared metal specification | `text_list` | offering / offerings | public; specifications |
| `necklace.length` | Chain length and adjustment range | `length_or_range` | variant_size / offerings | public; options, size_guide |
| `necklace.pendant` | Pendant dimensions and included pieces | `dimensions` | offering / offerings | public; specifications |
| `necklace.clasp` | Clasp and construction | `enum` | offering / offerings | public; specifications |
| `bracelet.fit` | Wrist range or item length by size | `length_or_range` | variant_size / offerings | public; options, size_guide |
| `bracelet.width` | Bracelet width and charm dimensions | `dimensions` | offering / offerings | public; specifications |
| `bracelet.clasp` | Clasp or stretch construction | `enum` | offering / offerings | public; specifications |
| `earring.pieces` | Single, pair or set contents | `count_or_range` | offering / offerings | public; card, specifications |
| `earring.size` | Drop, diameter and relevant dimensions | `dimensions` | offering / offerings | public; specifications |
| `earring.fastening` | Post, hook, clip or other fastening | `enum` | offering / offerings | public; specifications |
| `belt.length` | Belt length or wearer fit by size | `measurement_chart` | offering / offerings | public; options, size_guide |
| `belt.width` | Belt width | `length` | offering / offerings | public; specifications |
| `belt.adjustment` | Hole range, trim-to-fit or adjustment | `text` | offering / offerings | public; size_guide |
| `belt.buckle` | Buckle and closure | `text` | offering / offerings | public; specifications |
| `hat.circumference` | Head circumference range by size | `length_or_range` | variant_size / offerings | public; options, size_guide |
| `hat.adjustment` | Adjustment or stretch | `text` | offering / offerings | public; size_guide |
| `hat.dimensions` | Brim, crown or relevant dimensions | `dimensions` | offering / offerings | public; specifications |
| `scarf.dimensions` | Length and width | `dimensions` | offering / offerings | public; specifications |
| `scarf.finish` | Edges, fringe and construction | `text` | offering / offerings | public; specifications |
| `tailoring.task` | Made-to-measure, alteration or garment task | `enum` | offering / offerings | public; card, details |
| `tailoring.materials` | Who supplies fabric and materials | `enum` | offering / offerings | public; details, terms |
| `tailoring.measurement_method` | Measurement or fitting method | `enum_list` | offering / offerings | public; details, options |
| `tailoring.fittings` | Included fittings, revisions and acceptance | `policy_reference` | offering / offerings | public; terms |
| `fashion_intake.measurements` | Customer's personal measurements | `measurement_chart` | transaction / work_items | private_intake; request_form |
| `fashion_intake.design` | Customer design, garment or reference files | `secure_document_reference` | transaction / work_items | private_intake; request_form |
| `wine_specs.grapes` | Grape varieties or blend | `text_list` | offering / offerings | public; specifications |
| `wine_specs.sweetness` | Declared sweetness or style | `enum` | offering / offerings | public; specifications |
| `wine_specs.closure` | Bottle closure and packaging | `text` | offering / offerings | public; specifications |
| `spirit_specs.category` | Spirit category and expression | `text` | offering / offerings | public; specifications |
| `spirit_specs.age` | Labelled age or maturation statement | `text` | offering / offerings | public; specifications |
| `spirit_specs.flavour` | Flavoured, blended or other declared style | `text_list` | offering / offerings | public; specifications |
| `mixer_specs.flavour` | Flavour and actual drink base | `text` | offering / offerings | public; specifications |
| `mixer_specs.format` | Ready-to-drink, concentrate or syrup | `enum` | offering / offerings | public; specifications |
| `mixer_specs.sweetener` | Declared sugar/sweetener information | `text` | offering / offerings | public; specifications |
| `tobacco_specs.variant` | Exact manufacturer variant and format | `text` | offering / offerings | public; specifications |
| `tobacco_specs.cigar` | Cigar shape and labelled dimensions | `technical_specs` | offering / offerings | public; specifications |
| `cosmetic_specs.kind` | Exact product kind and application area | `enum` | offering / offerings | public; specifications |
| `cosmetic_specs.undertone` | Labelled undertone or shade reference | `text` | offering / offerings | public; options, specifications |
| `cosmetic_specs.format` | Cream, liquid, powder, stick or actual form | `enum` | offering / offerings | public; specifications |
| `care_specs.kind` | Exact care product type | `enum` | offering / offerings | public; specifications |
| `care_specs.formula` | Labelled formulation and ingredient details | `labelled_product_specs` | offering / offerings | public; specifications |
| `care_specs.use` | Labelled hair/skin descriptors and instructions | `text_list` | offering / offerings | public; details |
| `vehicle_specs.make` | Vehicle make and model | `text` | offering / offerings | public; specifications |
| `vehicle_specs.year` | Model year or declared vehicle age information | `integer_or_range` | offering / offerings | public; specifications |
| `vehicle_specs.body` | Body style and doors | `vehicle_body` | offering / offerings | public; specifications |
| `vehicle_specs.capacity` | Passenger and luggage constraints | `capacity_table` | offering / offerings | public; specifications, options |
| `vehicle_specs.features` | Guaranteed amenities and extras | `text_list` | offering / offerings | public; specifications, options |
| `bike_specs.fit` | Frame, wheel and rider fit information | `technical_specs` | offering / offerings | public; specifications, size_guide |
| `bike_specs.controls` | Transmission, gearing and drive type | `text` | offering / offerings | public; specifications |
| `session_specs.level` | Activity level and actual audience scope | `text` | offering / offerings | public; details |
| `session_specs.programme` | Programme, curriculum or included segments | `component_table` | offering / offerings | public; details |
| `session_specs.equipment` | Included versus required customer equipment | `component_table` | offering / offerings | public; details, terms |
| `session_specs.access` | Published access and participation conditions | `policy_reference` | offering / offerings | public; terms |
| `photography_specs.formats` | Delivered file or print formats | `deliverable_table` | offering / offerings | public; details |
| `photography_specs.coverage` | People, locations and change limits | `quantity_list` | offering / offerings | public; details, pricing |
| `financial_provider_specs.product` | Exact provider service or product name | `text` | offering / offerings | public; details |
| `financial_provider_specs.terms_source` | Authoritative terms and effective time | `policy_reference` | offering / offerings | public; terms |
| `financial_provider_specs.documents` | Private application information route | `intake_schema` | offering / offerings | public; request_form |
| `florist_specs.palette` | Actual colour palette and permitted substitutions | `text_list` | offering / offerings | public; details, options |
| `florist_specs.care` | Arrangement care and delivery presentation | `text_list` | offering / offerings | public; details, fulfilment |
| `gift_specs.item` | Base item type, material and dimensions | `gift_item_specs` | offering / offerings | public; specifications |
| `gift_specs.approval` | Personalization limits and proof acceptance | `policy_reference` | offering / offerings | public; options, terms |
| `meal_specs.base` | Actual main dish or bread/base type | `text` | offering / offerings | public; specifications, options |
| `meal_specs.inclusions` | Included sides, sauces and drinks | `component_table` | offering / offerings | public; details, options |
| `meal_specs.choice_rules` | Required/optional choices and incompatibilities | `option_group_table` | offering / offerings | public; options, pricing |
| `dairy_specs.kind` | Milk, dairy or egg product and source | `text` | offering / offerings | public; specifications |
| `dairy_specs.format` | Form, treatment or labelled fat/grade | `text` | offering / offerings | public; specifications |
| `dairy_specs.contents` | Container size or egg count | `quantity` | offering / offerings | public; specifications, options |
| `cold_food_specs.state` | Labelled ambient, chilled or frozen condition | `enum` | offering / offerings | public; specifications |
| `cold_food_specs.handling` | Applicable cold-chain and storage instructions | `policy_reference` | offering / offerings | public; details, fulfilment |
| `laundry_specs.care` | Applicable garment/item care restrictions | `text_list` | offering / offerings | public; details, terms |
| `laundry_specs.quantity` | Counting/weighing and estimate adjustment method | `policy_reference` | offering / offerings | public; pricing, terms |
| `laundry_specs.packaging` | Folding, hanging and return packaging choices | `option_group_table` | offering / offerings | public; options, pricing |
| `textile_specs.fit` | Actual bed, mattress, window or item fit | `dimensions` | offering / offerings | public; specifications, options |
| `textile_specs.pieces` | Exact pieces and mounting accessories | `component_table` | offering / offerings | public; details |
| `lighting_specs.fitting` | Fixture, lamp base and mounting type | `text` | offering / offerings | public; specifications |
| `lighting_specs.output` | Published light-output and colour specification | `technical_specs` | offering / offerings | public; specifications |
| `lighting_specs.installation` | Mounting, supply and environmental requirements | `text_list` | offering / offerings | public; details, fulfilment |
| `medical_product_specs.kind` | Exact device or consumable kind | `text` | offering / offerings | public; specifications |
| `medical_product_specs.fit` | Size, model and compatible components | `technical_specs` | offering / offerings | public; specifications, options |
| `medical_product_specs.power` | Power and included operating components | `electrical_specs` | offering / offerings | public; specifications |
| `medical_product_specs.label` | Approved label/version and instructions reference | `policy_reference` | offering / offerings | public; details, terms |
| `baby_equipment_specs.type` | Actual equipment or feeding accessory type | `enum` | offering / offerings | public; specifications |
| `baby_equipment_specs.adjustments` | Manufacturer-labelled adjustment and fit | `technical_specs` | offering / offerings | public; specifications |
| `baby_equipment_specs.care` | Assembly, cleaning and replacement-part reference | `policy_reference` | offering / offerings | public; details |
| `health_service_specs.kind` | Consultation, session, procedure or panel type | `text` | offering / offerings | public; details |
| `health_service_specs.inclusions` | Included service segments and exclusions | `component_table` | offering / offerings | public; details, terms |
| `health_service_specs.administration` | Approved administrative intake and preparation | `intake_schema` | offering / offerings | public; request_form |
| `audio_specs.kind` | Headphone, speaker or actual audio form | `enum` | offering / offerings | public; specifications |
| `audio_specs.microphone` | Microphone and control functions | `text_list` | offering / offerings | public; specifications |
| `audio_specs.supplied` | Included cables, charging case or mounting | `component_table` | offering / offerings | public; details |
| `computer_specs.system` | Operating system and included licence scope | `text` | offering / offerings | public; specifications, terms |
| `computer_specs.upgrade` | Supported memory, storage and expansion | `technical_specs` | offering / offerings | public; specifications |
| `computer_specs.condition` | Actual condition and refurbished disclosures | `condition_report` | offering / offerings | public; details |
| `tour_specs.mode` | Walking, vehicle, boat or other actual mode | `enum_list` | offering / offerings | public; specifications |
| `tour_specs.language` | Available guide or service languages | `enum_list` | offering / offerings | public; options, details |
| `tour_specs.lodging` | Lodging category, room/meal choices and supplier scope | `component_table` | offering / offerings | public; options, details, terms |
| `tour_specs.changes` | Weather, substitution and supplier change terms | `policy_reference` | offering / offerings | public; terms |
| `wellness_specs.kind` | Actual treatment, training or access type | `text` | offering / offerings | public; details |
| `wellness_specs.options` | Duration, provider and package choices | `option_group_table` | offering / offerings | public; options, pricing, schedule |
| `wellness_specs.terms` | Included facilities and applicable preparation reference | `policy_reference` | offering / offerings | public; details, terms |
| `freight_specs.load` | Actual load, container or vehicle service type | `text` | offering / offerings | public; specifications |
| `freight_specs.limits` | Per-piece and service load limits | `technical_specs` | offering / offerings | public; specifications, terms |
| `freight_specs.tariff` | Rate validity, included legs and carrier calculation reference | `policy_reference` | offering / offerings | public; pricing, terms |
| `storage_specs.environment` | Actual storage conditions and controls | `technical_specs` | offering / offerings | public; specifications, terms |
| `storage_specs.access` | Customer access, receiving and release process | `policy_reference` | offering / offerings | public; fulfilment, terms |
| `reservation_intake.venue` | Venue or supplier preference | `structured_request` | transaction / work_items | private_intake; request_form |
| `reservation_intake.party_time` | Party size and desired date/time | `structured_request` | transaction / work_items | private_intake; request_form |
| `shopping_intake.items` | Requested actual items and specifications | `structured_request` | transaction / work_items | private_intake; request_form |
| `shopping_intake.budget` | Budget, substitutions and spending authority | `structured_request` | transaction / work_items | private_intake; request_form |
| `shopping_intake.deadline` | Desired date and delivery needs | `structured_request` | transaction / work_items | private_intake; request_form |
| `coordination_intake.task` | Actual task, deadline and private context | `structured_request` | transaction / work_items | private_intake; request_form |
| `coordination_intake.authority` | Supplier, budget and action approval limits | `structured_request` | transaction / work_items | private_intake; request_form |
| `travel_intake.dates` | Requested travel dates and flexibility | `structured_request` | transaction / work_items | private_intake; request_form |
| `travel_intake.party` | Traveller counts and relevant service needs | `structured_request` | transaction / work_items | private_intake; request_form |
| `travel_intake.itinerary` | Destinations, lodging/transport preferences and budget | `structured_request` | transaction / work_items | private_intake; request_form |
| `moving_intake.inventory` | Actual pieces, dimensions and special handling | `structured_request` | transaction / work_items | private_intake; request_form |
| `moving_intake.route` | Origin, destination and floor/lift/access conditions | `structured_request` | transaction / work_items | private_intake; request_form |
| `moving_intake.timing` | Desired move window and service scope | `structured_request` | transaction / work_items | private_intake; request_form |
| `cleaning_intake.property` | Property type, rooms/area and requested tasks | `structured_request` | transaction / work_items | private_intake; request_form |
| `cleaning_intake.access` | Private location, access and desired visit window | `structured_request` | transaction / work_items | private_intake; request_form |

Shared measurement aliases: `bottom.waist` references `dress.waist`; `bottom.hips` references `dress.hips`. Template uses retain their actual applicability and requirement.
