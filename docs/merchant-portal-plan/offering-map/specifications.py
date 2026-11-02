"""Product-kind refinements across the full catalogue. Design authoring only."""


def apply(groups, templates, G):
    def attach(ids, group):
        for key in ids.split():
            if group not in templates[key]["groups"]:
                templates[key]["groups"].append(group)

    G("wine_specs", "Wine-specific product details", """
grapes|Grape varieties or blend|text_list|when supplied on the product information|specifications|Actual producer information; unknown varieties are not inferred from region.
sweetness|Declared sweetness or style|enum|O|specifications|Producer/merchant descriptor, separate from vintage, ABV and exact bottle volume.
closure|Bottle closure and packaging|text|O|specifications|Actual closure and case contents; gift wrapping remains an option with its own charge.
""")
    attach("wine sparkling_wine", "wine_specs")
    G("spirit_specs", "Spirit-specific product details", """
category|Spirit category and expression|text|P|specifications|Exact labelled type and expression; separate from brand and bottle size.
age|Labelled age or maturation statement|text|when an age or maturation claim is made|specifications|Use the actual label/source rather than a generated product claim.
flavour|Flavoured, blended or other declared style|text_list|O|specifications|Confirmed product information only.
""")
    attach("spirit", "spirit_specs")
    G("mixer_specs", "Mixer and packaged drink details", """
flavour|Flavour and actual drink base|text|P|specifications|Actual ingredients/base and named flavour, not inferred dietary or wellness claims.
format|Ready-to-drink, concentrate or syrup|enum|P|specifications|State exact product form and label instructions where supplied; never invent dilution instructions.
sweetener|Declared sugar/sweetener information|text|when supplied by the label|specifications|Source-backed label facts, separate from an unverified sugar-free claim.
""")
    attach("mixer alcoholic_mixer", "mixer_specs")
    G("tobacco_specs", "Tobacco pack and product format", """
variant|Exact manufacturer variant and format|text|P|specifications|Preserve actual labelled identity, pack count and applicable warnings.
cigar|Cigar shape and labelled dimensions|technical_specs|when a cigar format is sold|specifications|Named length/ring-gauge system, wrapper/origin information if supplied; no guessed conversion or health comparison.
""")
    attach("cigarettes cigar", "tobacco_specs")

    G("cosmetic_specs", "Cosmetic formulation and shade details", """
kind|Exact product kind and application area|enum|P|specifications|Foundation, lip product, eye product or actual registered kind; select the applicable shade/finish fields.
undertone|Labelled undertone or shade reference|text|when relevant to the product shade|options,specifications|Actual manufacturer shade/code; images and variants refer to the same product.
format|Cream, liquid, powder, stick or actual form|enum|P|specifications|Formulation format and net quantity are separate facts.
""")
    attach("makeup_product", "cosmetic_specs")
    G("care_specs", "Skin and hair product label details", """
kind|Exact care product type|enum|P|specifications|Shampoo, conditioner, serum, cleanser or actual product kind rather than the shop's category.
formula|Labelled formulation and ingredient details|labelled_product_specs|when supplied by the label|specifications|Known ingredient amounts, fragrance/form and relevant label descriptors; no generated efficacy or treatment advice.
use|Labelled hair/skin descriptors and instructions|text_list|when supplied by the manufacturer|details|Do not turn a product descriptor into a personal suitability judgement.
""")
    attach("skincare_product hair_product intimate_wellness_product", "care_specs")

    G("vehicle_specs", "Vehicle features promised by the rental or transfer", """
make|Vehicle make and model|text|when a specific model is promised|specifications|Exact actual make/model; a class offer states which features are guaranteed versus alternatives.
year|Model year or declared vehicle age information|integer_or_range|when this information is promised|specifications|Actual source-backed year/range, not a value inferred from a photograph.
body|Body style and doors|vehicle_body|when relevant to the offer|specifications|Actual body style and door count; not a promise of off-road or accessibility suitability.
capacity|Passenger and luggage constraints|capacity_table|P|specifications,options|Separate passengers, bag counts/dimensions and relevant child/accessibility options.
features|Guaranteed amenities and extras|text_list|O|specifications,options|Actual air conditioning, charging, equipment or other guaranteed features; options need actual resource availability.
""")
    attach("car_rental self_drive extended_rental airport_transfer executive_transfer", "vehicle_specs")
    G("bike_specs", "Bike fit and equipment", """
fit|Frame, wheel and rider fit information|technical_specs|when relevant to the actual bike type|specifications,size_guide|Named units and actual manufacturer fit guidance; rider height is not a guaranteed universal fit.
controls|Transmission, gearing and drive type|text|when relevant|specifications|Actual mechanical/powered configuration and supported accessories.
""")
    attach("bike_rental", "bike_specs")

    G("session_specs", "Dated event or activity content", """
level|Activity level and actual audience scope|text|O|details|Merchant/provider-defined level and prerequisites; do not infer suitability from age alone.
programme|Programme, curriculum or included segments|component_table|when a programme or curriculum is sold|details|Actual sessions/segments, quantities and admission entitlement; not an automatic reservation of each segment.
equipment|Included versus required customer equipment|component_table|when equipment or materials are relevant|details,terms|Separate included, optional charged and customer-supplied items.
access|Published access and participation conditions|policy_reference|when applicable|terms|Only actual approved venue/provider conditions and accessibility information.
""")
    attach("event_ticket conference_ticket workshop class sport recreation group_coaching group_training", "session_specs")
    G("photography_specs", "Photography output and usage", """
formats|Delivered file or print formats|deliverable_table|P|details|Actual quantity, resolution/size basis, file/print type and whether raw files are included.
coverage|People, locations and change limits|quantity_list|when limits affect scope or price|details,pricing|Named counts/time/locations and relevant unit; private participant details remain in the request.
""")
    attach("photography", "photography_specs")

    G("financial_provider_specs", "Provider product information", """
product|Exact provider service or product name|text|P|details|Separate the actual provider offering from Banking, Insurance or another merchant identity.
terms_source|Authoritative terms and effective time|policy_reference|P|terms|Approved source/version, validity and indicative versus executable status. No invented rate or return promise.
documents|Private application information route|intake_schema|when necessary for the provider handoff|request_form|Collect only applicable information through the authorized provider process; never publish identity/financial documents.
""")
    attach("banking_enquiry forex_enquiry insurance_enquiry payment_enquiry remittance_enquiry sacco_enquiry business_enquiry", "financial_provider_specs")

    G("florist_specs", "Arrangement contents and care", """
palette|Actual colour palette and permitted substitutions|text_list|P|details,options|Show which features are fixed and which can vary seasonally; do not guarantee unconfirmed varieties.
care|Arrangement care and delivery presentation|text_list|O|details,fulfilment|Merchant-confirmed instructions and actual vase/packaging inclusion.
""")
    attach("bouquet flower_plan", "florist_specs")
    G("gift_specs", "Actual gift item specifications", """
item|Base item type, material and dimensions|gift_item_specs|P|specifications|Mug, printed garment, keepsake or actual item; explicit dimensions/units and material, distinct from personalization.
approval|Personalization limits and proof acceptance|policy_reference|when personalization is offered|options,terms|Character/file/design limits and proof process. Actual recipient text and files stay private.
""")
    attach("personalized_gift occasion_gift", "gift_specs")

    G("meal_specs", "Dish and combo configuration", """
base|Actual main dish or bread/base type|text|when the choice defines the item|specifications,options|Actual supported base and composition; options carry relevant ingredients and charges.
inclusions|Included sides, sauces and drinks|component_table|when part of a meal or combo|details,options|Separate included quantity from optional charged additions and supported substitutions.
choice_rules|Required/optional choices and incompatibilities|option_group_table|when choices are offered|options,pricing|Minimum/maximum selections, actual compatibility, prices and availability are explicit.
""")
    attach("dish pizza burger_sandwich meal_combo", "meal_specs")
    G("dairy_specs", "Dairy and egg product specifications", """
kind|Milk, dairy or egg product and source|text|P|specifications|Actual product/species/source where labelled; no invented provenance.
format|Form, treatment or labelled fat/grade|text|when stated by the label|specifications|Actual fresh/UHT/cultured or egg grade/size information, preserving the source and units where relevant.
contents|Container size or egg count|quantity|P|specifications,options|Actual volume/mass/count and pack quantity; separate product contents from shipping weight.
""")
    attach("dairy_eggs", "dairy_specs")
    G("cold_food_specs", "Labelled storage condition and handling", """
state|Labelled ambient, chilled or frozen condition|enum|P|specifications|Actual labelled condition, including ambient products where applicable; an unanswered value is not a storage or safety claim.
handling|Applicable cold-chain and storage instructions|policy_reference|when required for the specific product|details,fulfilment|Use actual product and fulfilment-owner requirements; no inferred storage/safety advice.
""")
    attach("frozen_food dairy_eggs meat seafood", "cold_food_specs")
    next(f for f in groups["cold_food_specs"]["fields"] if f["id"] == "cold_food_specs.state")["proposedValues"] = ["ambient", "chilled", "frozen", "not_provided"]

    G("laundry_specs", "Processing workload and options", """
care|Applicable garment/item care restrictions|text_list|P|details,terms|Actual accepted fabrics/item types and assessment needs; do not assume one treatment applies to every textile.
quantity|Counting/weighing and estimate adjustment method|policy_reference|P|pricing,terms|Explicit unit, minimum, assessed quantity and customer acceptance of any revised price.
packaging|Folding, hanging and return packaging choices|option_group_table|when offered|options,pricing|Actual choices, applicable quantities and additional charges.
""")
    attach("laundry dry_cleaning ironing", "laundry_specs")

    G("textile_specs", "Textile fit and installation", """
fit|Actual bed, mattress, window or item fit|dimensions|P|specifications,options|Named dimensions, drop/depth/orientation and units; a queen/king label is not a universal measurement.
pieces|Exact pieces and mounting accessories|component_table|P|details|Separate included cover/pillowcase/lining/hooks and optional mounting/installation.
""")
    attach("home_textile", "textile_specs")
    G("lighting_specs", "Lighting fixture specification", """
fitting|Fixture, lamp base and mounting type|text|P|specifications|Actual fitting/socket/base and included or replaceable lamp.
output|Published light-output and colour specification|technical_specs|when provided by the manufacturer|specifications|Named lumen/colour-temperature or actual rating method and units; no invented equivalent wattage.
installation|Mounting, supply and environmental requirements|text_list|P|details,fulfilment|Actual manufacturer/site requirements and supported installation scope.
""")
    attach("lighting", "lighting_specs")

    G("medical_product_specs", "Labelled medical product specification", """
kind|Exact device or consumable kind|text|P|specifications|A specific device/consumable rather than a generic Medical Supplies listing.
fit|Size, model and compatible components|technical_specs|when fit or compatibility is relevant|specifications,options|Actual dimensions/units and manufacturer compatibility, never a personalized clinical recommendation.
power|Power and included operating components|electrical_specs|when powered|specifications|Actual manufacturer ratings and contents; no inferred clinical performance.
label|Approved label/version and instructions reference|policy_reference|when required by product policy|details,terms|Authoritative product content and verification; this plan does not set legal classifications or clinical guidance.
""")
    attach("medical_supply", "medical_product_specs")
    G("baby_equipment_specs", "Baby equipment configuration", """
type|Actual equipment or feeding accessory type|enum|P|specifications|The specific item controls size, compatible parts and included pieces.
adjustments|Manufacturer-labelled adjustment and fit|technical_specs|when applicable|specifications|Actual age/weight/dimension labels with units; do not infer safety or suitability.
care|Assembly, cleaning and replacement-part reference|policy_reference|when supplied|details|Use approved manufacturer instructions and actual compatible parts.
""")
    attach("baby_equipment", "baby_equipment_specs")

    G("health_service_specs", "Actual health service and administrative scope", """
kind|Consultation, session, procedure or panel type|text|P|details|Specific provider-defined service; broad clinic identity cannot supply its scope.
inclusions|Included service segments and exclusions|component_table|P|details,terms|Actual provider-approved scope and duration basis, not inferred outcomes.
administration|Approved administrative intake and preparation|intake_schema|when needed for the selected service|request_form|Only necessary purpose-limited inputs; results, diagnosis and clinical notes remain with their authorized private system.
""")
    attach("clinic telemedicine lab_test therapy", "health_service_specs")

    G("audio_specs", "Audio product configuration", """
kind|Headphone, speaker or actual audio form|enum|P|specifications|Specific construction/form factor controls the applicable specifications.
microphone|Microphone and control functions|text_list|when present|specifications|Confirmed functions and compatible systems; not inferred from connector shape.
supplied|Included cables, charging case or mounting|component_table|P|details|Actual contents and optional accessories.
""")
    attach("audio", "audio_specs")
    G("computer_specs", "Computer model and software configuration", """
system|Operating system and included licence scope|text|when software is included|specifications,terms|Actual installed/licensed edition and supported updates; no unlicensed software promise.
upgrade|Supported memory, storage and expansion|technical_specs|when upgradeability is advertised|specifications|Confirmed model-specific slots/limits and units; do not infer from the product family.
condition|Actual condition and refurbished disclosures|condition_report|when used or refurbished|details|Actual grade/defects and sourced condition; private serials remain internal.
""")
    attach("computer smartphone", "computer_specs")

    G("tour_specs", "Tour choices and actual inclusions", """
mode|Walking, vehicle, boat or other actual mode|enum_list|P|specifications|Actual transport/activity mode; associated capacity and provider constraints remain authoritative.
language|Available guide or service languages|enum_list|when a guide or language-specific service is offered|options,details|Actual supported language choices and any availability constraint.
lodging|Lodging category, room/meal choices and supplier scope|component_table|when overnight lodging is included|options,details,terms|Named actual inclusions/choices; desired accommodation is not confirmed supplier inventory.
changes|Weather, substitution and supplier change terms|policy_reference|when applicable|terms|Actual approved supplier terms; no invented travel or medical advice.
""")
    attach("safari game_drive luxury_safari city_tour adventure_tour travel_request", "tour_specs")

    G("wellness_specs", "Treatment and training configuration", """
kind|Actual treatment, training or access type|text|P|details|Specific treatment/discipline/service rather than a generic wellness description.
options|Duration, provider and package choices|option_group_table|when options are offered|options,pricing,schedule|Each choice uses its actual price, duration and eligible resources; preferences are not guarantees.
terms|Included facilities and applicable preparation reference|policy_reference|when applicable|details,terms|Actual approved provider information; no inferred health outcome or personal suitability.
""")
    attach("spa massage training group_training gym_membership wellness_plan", "wellness_specs")

    G("freight_specs", "Carrier service and constraints", """
load|Actual load, container or vehicle service type|text|P|specifications|FCL/LCL, cargo or truck/load class as actually supported; service mode alone is insufficient.
limits|Per-piece and service load limits|technical_specs|P|specifications,terms|Named dimensions/mass/volume with units and carrier source; unknown limits require carrier review.
tariff|Rate validity, included legs and carrier calculation reference|policy_reference|P|pricing,terms|Approved chargeable-weight/conversion/rounding rules and quote validity; no invented divisor or tax.
""")
    attach("sea_freight air_freight road_freight", "freight_specs")
    G("storage_specs", "Storage environment and access", """
environment|Actual storage conditions and controls|technical_specs|when environmental control is offered|specifications,terms|Named temperature/humidity or other controlled parameters with units and actual capability; no inferred cold storage.
access|Customer access, receiving and release process|policy_reference|P|fulfilment,terms|Actual access windows, handling scope and custody rules; availability does not transfer stock ownership.
""")
    attach("storage", "storage_specs")

    G("reservation_intake", "Private reservation request details", """
venue|Venue or supplier preference|structured_request|P|request_form|Actual preferred venue/service and acceptable alternatives; supplier remains the confirmation authority.
party_time|Party size and desired date/time|structured_request|P|request_form|Necessary count, time and preferences; no automatic reservation from submission.
""", scope="transaction", owner="work_items")
    attach("reservation_assistance", "reservation_intake")
    G("shopping_intake", "Private shopping and sourcing specification", """
items|Requested actual items and specifications|structured_request|P|request_form|Brand/model, size, colour, material, quantity/unit or other actual item requirements; retain links to registered product templates where applicable.
budget|Budget, substitutions and spending authority|structured_request|P|request_form|Explicit currency, limit and approval rules; a request does not authorize arbitrary purchases.
deadline|Desired date and delivery needs|structured_request|when timing or delivery is relevant|request_form|Actual private recipient/location/date information; delivery remains subject to accepted service.
""", scope="transaction", owner="work_items")
    attach("shopping_assistance gift_sourcing", "shopping_intake")
    G("coordination_intake", "Private coordination task and authority", """
task|Actual task, deadline and private context|structured_request|P|request_form|Only the information needed for the selected service; access details and customer documents remain restricted.
authority|Supplier, budget and action approval limits|structured_request|when an action or spending decision is delegated|request_form|Exact scope and currency/limits if applicable; no inferred authority from a retainer or VIP label.
""", scope="transaction", owner="work_items")
    attach("personal_assistance travel_planning property_coordination cleaning_coordination vip_assistance concierge_visit assistance_plan", "coordination_intake")

    G("travel_intake", "Private travel preferences and party", """
dates|Requested travel dates and flexibility|structured_request|P|request_form|Actual local dates or timed requirements and flexibility; a preference is not supplier inventory.
party|Traveller counts and relevant service needs|structured_request|P|request_form|Necessary party quantities and preferences only; sensitive documents use an authorized separate process when actually required.
itinerary|Destinations, lodging/transport preferences and budget|structured_request|P|request_form|Exact requested inclusions, currency/budget and approval limits; no automatic flight/hotel booking.
""", scope="transaction", owner="work_items")
    attach("travel_planning travel_request", "travel_intake")
    G("moving_intake", "Private moving inventory and access", """
inventory|Actual pieces, dimensions and special handling|structured_request|P|request_form|Item counts and named dimensions/units; describe actual fragile/oversized items for assessment.
route|Origin, destination and floor/lift/access conditions|structured_request|P|request_form|Exact private addresses and access constraints; do not publish property details.
timing|Desired move window and service scope|structured_request|P|request_form|Actual packing/handling/transport request, assessment and confirmation remain explicit.
""", scope="transaction", owner="work_items")
    attach("moving_coordination", "moving_intake")
    G("cleaning_intake", "Private property workload", """
property|Property type, rooms/area and requested tasks|structured_request|P|request_form|Actual workload and explicit units; service limits remain separate public facts.
access|Private location, access and desired visit window|structured_request|P|request_form|Only authorized staff receive exact access details. Recurring requests do not create automatic confirmed visits.
""", scope="transaction", owner="work_items")
    attach("home_clean office_clean cleaning_coordination", "cleaning_intake")

    # Physical size-row facts keep the same meaning across every merchant that uses the template.
    for key in ("footwear.length", "footwear.width", "children.height", "hat.circumference", "watch_extra.wrist", "bracelet.fit", "necklace.length"):
        group = groups[key.split(".")[0]]
        next(f for f in group["fields"] if f["id"] == key)["scope"] = "variant_size"
    for key in ("fashion_variants.pattern", "fashion_variants.chart"):
        next(f for f in groups["fashion_variants"]["fields"] if f["id"] == key)["scope"] = "offering"

    # Prefer one captured fact over overlapping broad and specific prompts.
    for key in ("car_rental", "self_drive", "extended_rental"):
        templates[key].setdefault("excludedFields", []).extend(["rental.make", "rental.features", "vehicle_specs.capacity"])
    for key in ("airport_transfer", "executive_transfer"):
        templates[key].setdefault("excludedFields", []).append("vehicle_specs.capacity")
    for key in ("meat", "seafood"):
        templates[key].setdefault("excludedFields", []).append("cold_food_specs.state")
    templates["dairy_eggs"].setdefault("excludedFields", []).append("packaged_food.net")
    templates["dairy_eggs"]["cardHighlights"] = ["dairy_specs.contents"]
    templates["photography"].setdefault("excludedFields", []).append("photography.deliverables")
    for key in ("dish", "pizza", "burger_sandwich", "meal_combo"):
        templates[key].setdefault("excludedFields", []).extend(["dish.components", "meal_specs.choice_rules"])
    templates["meal_combo"]["cardHighlights"] = ["food.portion", "meal_specs.inclusions"]
    for key in ("packaged_food", "dairy_eggs", "frozen_food", "produce", "meat", "seafood", "baby_food", "produce_box"):
        templates[key].setdefault("excludedFields", []).append("food.portion")
    for key in ("baby_equipment", "baby_food"):
        templates[key].setdefault("excludedFields", []).append("baby.material")
    templates["frozen_food"].setdefault("fixedValues", {})["cold_food_specs.state"] = "frozen"
    next(f for f in groups["health_service_specs"]["fields"] if f["id"] == "health_service_specs.inclusions")["requirement"] = {
        "level": "conditional", "when": "when the offered service has separately defined segments or included tests"}
