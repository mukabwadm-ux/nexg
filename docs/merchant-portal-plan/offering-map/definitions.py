"""Human-authored design source. Run build.py; never consume this as runtime config."""

GROUPS = {}
TEMPLATES = {}
BINDINGS = {}


def G(key, title, entries, *, scope="offering", owner="offerings", destination="specifications"):
    """Each entry is id|label|type|requirement|destination|guidance; P, O or conditional text."""
    if key in GROUPS:
        raise ValueError(f"Duplicate field group: {key}")
    fields = []
    for line in entries.strip().splitlines():
        parts = [p.strip() for p in line.strip().split("|")]
        if len(parts) != 6:
            raise ValueError((key, line))
        name, label, kind, requirement, dest, guidance = parts
        fields.append(dict(id=f"{key}.{name}", label=label, type=kind,
                           requirement={"level": {"P": "publish", "O": "optional"}.get(requirement, "conditional"),
                                        "when": requirement if requirement not in ("P", "O") else None},
                           scope=scope, ownerDataClass=owner, destinations=(dest or destination).split(","),
                           visibility="private_intake" if scope == "transaction" else "internal" if dest == "internal" else "public",
                           guidance=guidance))
    GROUPS[key] = dict(id=key, title=title, fields=fields)


def T(key, label, groups, models="ORDER", *, note="", intake="", choices="", card=""):
    if key in TEMPLATES:
        raise ValueError(f"Duplicate offering template: {key}")
    TEMPLATES[key] = dict(id=key, label=label, groups=["common"] + groups.split(),
                          modelIds=models.split(), note=note, selectionNotes=choices,
                          intakeNotes=intake, cardHighlights=card.split(), status="PROPOSED_NOT_IMPLEMENTED")


def B(key, templates, note):
    if key in BINDINGS:
        raise ValueError(f"Duplicate specialty mapping: {key}")
    BINDINGS[key] = dict(templateIds=templates.split(), specialtyNotes=note)


G("common", "Shared listing information", """
name|Offering name|text|P|card,details|Name the actual offering; the merchant identity is referenced separately.
summary|Short description|text|P|card,details|Explain what the customer receives without replacing structured specifications.
media|Photos or relevant media|media_list|O|card,details|Accurate media with accessible descriptions; link media to actual variants where relevant.
type|Specific offering type|reference|P|details|A registered template chosen for the item, not inferred solely from merchant category.
locations|Applicable branches or channels|reference_list|P|fulfilment|Use actual permitted locations and supported methods; a digital service can have a remote channel.
source|Content source and external identity|reference|P|internal|Preserve stable internal/external IDs and edit ownership; not a public product specification.
""")
G("sale", "Product purchase and variants", """
unit|Sale unit and pack quantity|quantity|P|card,pricing|Explicit count, weight or volume unit, precision and contents per sale unit.
variants|Actual purchasable combinations|variant_table|when options change the purchased item|options|Stable variant IDs; list actual combinations, never an automatic size-by-colour cross-product.
condition|Item condition|enum|P|specifications|New, used or refurbished as applicable; explain the actual grading when relevant.
returns|Applicable return and warranty references|policy_reference|P|terms|Reference the effective policy; inherited policies require explicit scope and overrides.
""")
G("price", "Price and charge basis", """
basis|How the price is calculated|enum|P|card,pricing|Fixed, per declared unit, variant, duration, person, package, starting estimate or quote-only.
amount|Published price or quote status|money_or_quote|P|card,pricing|Money uses integer minor units and currency; quote-only is not a zero price. Never auto-convert legacy whole-KES fields.
charges|Included and additional charges|charge_table|when extra charges apply|pricing,terms|Explicit unit, applicability, inclusions and source; show the selected total before commitment.
policy|Price and policy version|reference|P|internal|Accepted work retains the applicable version; prices come from their declared authority.
""", owner="pricing")
G("stock", "Product availability", """
mode|Stock control mode|enum|P|internal|Internal, external, hybrid or explicitly disabled. Unknown stock must remain unknown.
availability|Availability by variant and location|stock_reference|when inventory is controlled|options,card|Reference authoritative stock and unit; a merchant's shop hours are not proof of stock.
""", scope="variant_location", owner="stock")
G("fulfilment", "Ways to receive the offering", """
methods|Delivery, pickup, visit or remote methods|enum_list|P|fulfilment|Only supported methods for the selected listing and location.
coverage|Service area and pickup locations|coverage_reference|when physical delivery or customer-location service is offered|fulfilment|Exact authoritative coverage; show eligibility for the selected customer location.
lead_time|Preparation or fulfilment lead time|duration|when a lead time applies|card,fulfilment|Exact amount and unit; estimate versus firm promise must be labelled.
instructions|Customer-facing fulfilment instructions|text|O|fulfilment|Public instructions exclude personal access credentials and internal notes.
""", owner="fulfillment")
G("service", "Service scope and delivery", """
scope|What the service includes and excludes|text_list|P|details,terms|Define the actual task or deliverables and any assessment boundary.
methods|Service location or format|enum_list|P|options,fulfilment|Merchant venue, customer location or remote where explicitly configured.
duration|Service duration and unit|duration_or_assessment|P|card,schedule|Exact duration when bookable; assessment-required is explicit and cannot promise a slot.
provider|Eligible provider or resource description|resource_reference|when resources or staff are needed|details,schedule|Public provider details are an allowed projection; internal staffing records remain private.
preparation|Customer preparation and prerequisites|text_list|O|details,terms|Merchant-approved administrative instructions; no generated clinical or professional advice.
cancellation|Cancellation, reschedule and no-show terms|policy_reference|P|terms|Use applicable authority and version; no universal thresholds are invented here.
""")
G("schedule", "Scheduling and confirmation", """
availability|Available dates, times or capacity|availability_reference|when scheduled work is offered|schedule|Derived from the actual authority, resource eligibility and current capacity; unknown is distinct from unavailable.
intake|How acceptance works|enum|P|card,schedule,terms|Use the effective model's allowed intake mode; a request is not a confirmed reservation.
rules|Lead time, buffers and booking horizon|schedule_reference|when scheduled work is offered|schedule,terms|Use exact configured rules with Kenya time; preserve local dates separately from instants.
""", owner="availability")
G("request", "Private customer request", """
scope|Requested work and preferences|text|when a quote or assessment is needed|request_form|Collect only information needed to scope this request; never place it in public specifications.
place_time|Relevant location, dates and quantities|structured_request|when needed for the selected service|request_form|Only applicable fields; exact private addresses and access details remain restricted.
contact|Customer contact for this request|contact_reference|when follow-up is needed|request_form|Use authorized customer/contact records and purpose-limited access.
""", scope="transaction", owner="work_items")
G("apparel", "Shared clothing details", """
brand|Brand and style identifier|text|O||Use actual labels; authenticity claims need their evidence owner.
fabric|Fabric composition|material_list|P||Known materials and proportions; unknown proportions remain unknown.
fit|Fit and silhouette|enum|P||Named merchant fit guidance such as fitted or relaxed; do not equate it across brands.
stretch|Stretch or adjustability|enum|P||No stretch, stretch, adjustable or not provided; unanswered is not No.
care|Care instructions|text_list|O|details|Use garment label or merchant-confirmed instructions.
colour|Available colours and patterns|enum_list|when colour or pattern choices exist|options|Link real variants and photographs; sold-out combinations remain explicit.
""")
G("sizing", "Size labels and measurement chart", """
system|Size labels and sizing system|size_system|P|options,size_guide|Preserve merchant labels and named system; one-size still needs fit guidance.
basis|Measurement basis and units|measurement_basis|when a measurement chart is supplied|size_guide|Body versus garment, circumference versus flat width, cm versus inches; never infer a universal conversion between size labels.
rows|Chart rows for actual sizes|measurement_chart|when size-dependent fit is advertised|size_guide|Reference an accurate versioned chart or item-specific rows; each size has separate values/ranges and measurement instructions.
""", scope="variant_size")
G("dress", "Dress construction and measurements", """
bust|Bust measurement by size|length_or_range|when applicable to the garment fit|size_guide|Explicit unit and basis from the chart; if not known show not provided rather than estimate.
waist|Waist measurement by size|length_or_range|when the design defines a waist fit|size_guide|Allow an elastic or adjustable range and explain how it was measured.
hips|Hip measurement by size|length_or_range|when the design defines a hip fit|size_guide|Do not reuse waist or bust values as hip measurements.
length|Dress length by size|length|P|size_guide|State measurement endpoints and unit; length descriptors alone do not supply a measurement.
neckline|Neckline|enum|O||Relevant dress neckline or explicitly not provided.
closure|Closure or fastening|enum|O||Actual fastening, pull-on or adjustable construction.
sleeve_style|Sleeve style|enum|O||Sleeveless is an explicit applicable value.
sleeve_length|Sleeve length by size|length|when the dress has a measurable sleeve|size_guide|State measurement endpoints and unit; not applicable to a sleeveless design.
lining|Lining|enum|P||Merchant-confirmed lined/unlined information; unknown remains labelled.
opacity|Opacity or transparency description|enum|O||Actual merchant-confirmed coverage description; do not infer it from fabric alone.
""", scope="variant_size")
G("shirt", "Shirt and top details", """
chest|Chest or bust by size|length_or_range|when used for sizing|size_guide|Label whether body or garment and flat width or circumference.
shoulder|Shoulder width by size|length|when the construction has a defined shoulder|size_guide|Unit and measurement endpoints required.
sleeve|Sleeve length by size|length|when sleeves are present and this measure applies|size_guide|State how the sleeve was measured.
length|Body length by size|length|P|size_guide|Explicit unit and measurement endpoints.
collar|Collar or neckline style|enum|O||Actual construction, not an inferred style.
sleeve_style|Sleeve style|enum|O||Short, long, sleeveless or actual supported type.
fastening|Fastening or closure|enum|O||Actual button, zip, pull-on or other construction.
""", scope="variant_size")
G("bottom", "Trouser, skirt and short measurements", """
waist|Waist by size|length_or_range|P|size_guide|Include elastic/adjustable range where applicable; chart unit and basis required.
hips|Hips by size|length_or_range|when fitted through the hips|size_guide|Mark not applicable for a design that does not define this fit.
inseam|Inseam by size|length|when the item has legs|size_guide|Not applicable to skirts; explicit length unit.
rise|Rise by size|length|when relevant to trouser fit|size_guide|Use the merchant's measurement method.
length|Overall length by size|length|P|size_guide|State endpoints for trousers, shorts or skirts.
""", scope="variant_size")
G("outerwear", "Jacket and coat details", """
layers|Lining, insulation and intended layers|text|P||Describe actual construction and fit allowance.
features|Hood, pockets and fastening|text_list|O||Declared features; performance claims need confirmed supporting information.
""")
G("children", "Children's clothing fit", """
age|Indicative age band|range|O|details|Age is guidance, not a substitute for actual size and fit measurements.
height|Wearer height range by size|length_or_range|when the label uses height sizing|size_guide|Explicit units and body-measurement basis.
features|Adjustable features and school requirements|text_list|O||Specify actual fastenings and school/uniform design where applicable.
""")
G("footwear", "Footwear fit and construction", """
system|Shoe size system and labels|size_system|P|options,size_guide|EU, UK, US or merchant system as actually labelled; no invented cross-system equivalence.
length|Foot or internal length by size|length_or_range|when measurement guidance is supplied|size_guide|Clearly distinguish foot length from shoe internal length and label units.
width|Width or width fitting by size|text|O|size_guide|Use actual width scale or measured width with unit.
materials|Upper, lining and sole materials|material_list|P||Keep the different materials distinguishable.
heel|Heel or sole height|length|when relevant||Explicit measurement unit.
closure|Fastening and intended use|text|O||Describe actual closure and use without unsupported safety/performance claims.
colour|Colours and valid size combinations|variant_table|when variants exist|options|Real variant matrix with separate price and stock references.
""")
G("bag", "Bag dimensions and features", """
dimensions|Length, width and height|dimensions|P||Explicit units and orientation.
material|Outer and lining materials|material_list|P||Identify actual materials and care instructions.
capacity|Capacity and compatible device size|quantity|when advertised||Separate litres from compatible laptop diagonal; dimensions must support any fit claim.
features|Compartments, closure and straps|text_list|O||Include adjustable strap range where relevant.
""")
G("watch", "Watch specifications", """
movement|Movement and power type|enum|P||Mechanical, quartz, rechargeable or actual specified type.
case|Case dimensions and materials|dimensions|P||Case diameter/thickness with units and declared material.
strap|Strap material and fit range|text|P|specifications,size_guide|Wrist circumference range with units; replaceable strap details where relevant.
features|Functions and stated resistance rating|text_list|O||Reproduce confirmed manufacturer ratings without inferring a safe activity.
""")
G("accessory", "Fashion accessory details", """
kind|Accessory type|enum|P||Jewellery, belt, hat, scarf or other specific registered type.
material|Material and finish|material_list|P||Separate material from plating or finish.
fit|Dimensions and adjustable fit|measurement_chart|when sized or fitted|size_guide|Ring system, belt length, hat circumference or item dimensions with explicit units.
features|Closure, set contents and care|text_list|O||Make pair versus single and included pieces clear.
""")

G("personal_care", "Personal care product details", """
kind|Product type and intended label use|text|P||Identify the actual product; suitability claims must come from confirmed label information.
contents|Ingredients, materials and pack contents|text_list|P||Use manufacturer/label information; do not invent efficacy or safety claims.
quantity|Net contents and pack count|quantity|P|card,specifications|Explicit mass, volume or count units; distinguish net contents from shipping weight.
instructions|Label instructions, cautions and storage|text_list|when supplied or required for this product|details,terms|Reproduce approved product information, not generated treatment or usage advice.
variants|Formula, shade, scent or compatibility options|variant_table|when variants exist|options|Actual variant identity and contents; prices and availability use their own owners.
""")
G("intimate", "Intimate product specifications", """
material|Material and dimensions|text|P||State confirmed material and applicable dimensions with units.
compatibility|Compatibility and care information|text_list|when relevant||Use verified product instructions; never infer medical suitability.
power|Power, charging and included accessories|text_list|when powered||Actual power specifications and box contents.
""")
G("restricted", "Restricted product presentation", """
eligibility|Applicable age or eligibility policy|policy_reference|P|terms|Reference approved product-specific rules; this design does not set legal thresholds.
packaging|Packaging choices|enum_list|when packaging choice is offered|options,fulfilment|Accurate discreet or branded options and relevant charge.
verification|Publication or eligibility evidence|verification_reference|when required by policy|internal|Seller answers do not create verified status. Checks belong to their authorized owner.
""")
G("tobacco", "Tobacco product specifications", """
brand|Brand and exact product|text|P||Manufacturer and precise labelled variant.
format|Format and pack count|quantity|P|card,specifications|Single, pack, carton or cigar box with explicit unit count.
origin|Declared origin and product dimensions|text|O||For cigars include length and ring-gauge system where provided; no invented conversions.
strength|Labelled composition and warnings|text_list|when present on the product label|details,terms|No health comparisons or inferred lower-risk claims.
""")
G("vape", "Device, refill and compatibility", """
kind|Device, refill or accessory type|enum|P||Distinguish complete device, liquid, pod, coil and other parts.
compatibility|Compatible models and fittings|reference_list|when a component or refill is sold||Explicit supported devices and compatibility source.
contents|Liquid volume, labelled composition and strength|text|when liquid is included||Preserve units and manufacturer labels; do not infer health or legal claims.
power|Battery, charging and included components|text_list|when powered||Power/connector details and actual contents; no unsupported performance promise.
""")
G("beverage", "Packaged beverage specifications", """
producer|Brand, producer and product name|text|P||Exact labelled product; origin is a separate confirmed fact.
volume|Container volume and pack count|quantity|P|card,specifications|Explicit mL/L and units per pack, with supported combinations.
ingredients|Ingredients and declared allergens|text_list|when relevant label information exists|details|Preserve label source and unknown state; absence of data is not allergen-free.
storage|Storage and serving condition|text|O|details,fulfilment|Ambient/chilled choices must match supported fulfilment.
""")
G("alcohol", "Alcohol label details", """
abv|Alcohol by volume|percentage|P||Use exact labelled ABV; distinguish non-alcoholic variants.
origin|Country, region and producer origin|text|O||Use confirmed label/designation information.
style|Wine, spirit or beer style|text|P||Specific type for customer comparison.
vintage|Vintage, age statement or non-vintage|text|when this product carries such a statement||Do not invent a vintage or age.
profile|Declared tasting profile|text_list|O||Merchant/producer descriptors, separate from guaranteed specifications.
""")
G("food", "Food contents and options", """
ingredients|Ingredients and declared allergens|text_list|P|details|Capture available ingredients, allergen and cross-contact information with source; unknown is explicit, never an allergen-free claim.
portion|Portion, serving size or pack quantity|quantity|P|card,specifications|Explicit units or a clearly described portion; distinguish people served from item count.
dietary|Supported dietary descriptors|enum_list|O||Only merchant-confirmed descriptors; do not infer from ingredients alone.
options|Required choices and optional additions|option_group_table|when choices are offered|options,pricing|Define minimum/maximum choices, incompatible options, price effect and availability.
handling|Storage, freshness and handling|text|when relevant|details,fulfilment|Stock/batch expiry is not a timeless listing fact. Surface applicable label/storage instructions.
""")
G("dish", "Prepared dish details", """
cuisine|Cuisine and dish style|text|O||Useful customer descriptors without forcing every item into a cuisine.
preparation|Preparation and serving style|text|O||Include relevant spice, doneness or preparation choices only when offered.
components|Meal and combo contents|component_table|when the offering is a combo|details,options|Link real included dishes/drinks and substitution constraints.
""")
G("coffee", "Prepared drink choices", """
base|Drink base and preparation method|text|P||Coffee/tea type or actual beverage base.
size|Cup volume or stated serving sizes|quantity_list|P|options|Explicit volume units where known; preserve merchant size labels.
choices|Milk, sweetness, temperature and extras|option_group_table|when choices are offered|options,pricing|Only supported choices with relevant ingredient/allergen implications.
""")
G("cake", "Cake design and production", """
shape|Shape, tiers and dimensions|dimensions|P||Dimensions with units; tiers and servings are separate facts.
servings|Expected serving quantity|count_or_range|P|card,specifications|Merchant-declared serving guidance and size variants.
flavour|Sponge, filling and icing choices|option_group_table|P|options,pricing|Required compatible choices, inclusions and extra charges.
design|Design, inscription and approval method|customization_schema|when custom design is offered|options,terms|Define public customization choices and private customer input; an upload/request does not confirm production acceptance.
due|Production lead time and due-date rules|duration|P|fulfilment,terms|Exact configured lead time; accepted custom scope and due commitment are separate from generic stock.
""")
G("packaged_food", "Packaged food label", """
brand|Brand and exact labelled product|text|P||Identify the actual item and manufacturer where relevant.
net|Net quantity and pack count|quantity|P|card,specifications|Explicit mass, volume or count; distinguish drained weight where applicable.
nutrition|Declared nutrition and basis|nutrition_table|O||Label-derived values with per-serving or per-100-unit basis and units.
storage|Storage and shelf-life guidance|text|when present on the label|details|Perishable batch expiry/freshness belongs to stock/batch data and the actual fulfilment promise.
""")
G("produce", "Fresh produce specifications", """
variety|Produce type and variety|text|P||Actual variety when known; no invented origin or organic certification.
grade|Grade, ripeness and preparation|text|O||Whole, cut or prepared as actually offered.
sale|Loose weight or fixed pack basis|quantity|P|options,pricing|State estimate versus final weighed quantity and the approved adjustment policy.
origin|Declared origin and certification reference|text|O||Show certification only from an authorized verified source.
substitution|Substitution and seasonal availability policy|policy_reference|when substitutions are supported|terms|Customer choice and acceptance are explicit.
""")
G("protein", "Meat, seafood and chilled product details", """
kind|Species or product and cut|text|P||Exact fish/meat/product type, cut and preparation.
state|Fresh, chilled or frozen state|enum|P|card,specifications|Actual state with supported temperature handling.
weight|Net weight, size grade and count|quantity|P|options,pricing|Explicit weight/count units and fixed versus weighed basis.
preparation|Bone, skin and preparation choices|option_group_table|when offered|options|Cleaning, filleting, cutting or other actual options and price effects.
source|Declared provenance or certification|text|O||Confirmed claims only; traceability evidence stays with its owner.
""")
G("household", "Household consumables", """
purpose|Specific product and intended surfaces/use|text|P||Use label descriptions; do not infer compatible surfaces or performance.
contents|Pack size, concentration and contents|quantity|P|card,specifications|State refill/concentrate versus ready-to-use and explicit units.
variants|Scent, format or material variants|variant_table|when variants exist|options|Actual purchasable combinations.
warnings|Label cautions and storage|text_list|when supplied with the product|details,terms|Approved label information; internal hazardous-shipping evidence is separate.
""")
G("gift", "Gift contents and presentation", """
contents|Included items and quantities|component_table|P|details|Link actual components, size/quantity and possible substitutions.
presentation|Wrapping and presentation options|option_group_table|when offered|options,pricing|Explicit inclusions and charges.
personalization|Message or personalization choices|customization_schema|when offered|options|Allowed lengths/formats and proof approval; recipient messages stay private to the order.
occasion|Occasion and style descriptors|enum_list|O||Discovery descriptors, not substitute product specifications.
""")
G("flowers", "Flower arrangement details", """
varieties|Flower varieties and stem quantities|component_table|P||Declared arrangement contents; explicit seasonal substitution policy.
size|Arrangement size and dimensions|dimensions|P|options,specifications|Actual sizes with units or declared stem counts, not only small/large.
state|Fresh, dried or preserved|enum|P||Accurate product state and care guidance.
vase|Vase and extras|option_group_table|when offered|options,pricing|State whether the photographed container is included.
""")
G("custom", "Made-to-order specification", """
scope|Customizable features and limits|customization_schema|P|options|Supported choices, dimensions, materials and compatibility; do not accept arbitrary infeasible configurations.
approval|Proof or design approval process|policy_reference|when approval is required|terms|A submitted design remains pending until the authorized acceptance.
lead_time|Production lead time and acceptance|duration_or_assessment|P|fulfilment,terms|Unknown scope uses quote/assessment; exact deadline is accepted separately.
""")
G("beauty_service", "Beauty treatment scope", """
technique|Treatment, technique and target area|text|P||Describe the actual service without generated clinical or efficacy claims.
choices|Length, style, finish or treatment options|option_group_table|when offered|options,pricing|Duration/resource/price consequences need authoritative configuration.
included|Products, materials and preparation included|text_list|P|details,terms|State whether extensions, products or removal are included.
requirements|Preparation or consultation requirement|policy_reference|when required|details,terms|Use approved provider instructions; personal suitability information goes to private intake.
""")
G("cosmetic", "Cosmetic shade and formulation", """
finish|Finish, coverage and formulation|text|P||Appropriate to the actual makeup/skincare/hair product type.
shade|Shades and undertones|variant_table|when shades exist|options|Variant-specific image and actual shade name/code.
suitability|Labelled skin or hair type|text_list|O||Manufacturer descriptors, not personalized medical advice or guaranteed outcome.
""")
G("fragrance", "Fragrance specifications", """
concentration|Concentration and product form|text|P||Manufacturer-labelled EDT/EDP/oil or actual form.
notes|Declared fragrance family and notes|text_list|O||Producer/merchant descriptors rather than guaranteed wear duration.
format|Volume, refill and set contents|quantity|P|options,specifications|Distinguish tester, full bottle, refill and gift set contents.
""")

G("durable", "Durable goods identity and dimensions", """
brand|Brand, manufacturer and model|text|P||Exact model and relevant manufacturer identifiers; internal serial numbers are separate.
dimensions|Product dimensions and weight|dimensions|when needed for fit, delivery or installation||Explicit length/mass units and orientation; packaged dimensions remain distinguishable.
materials|Materials, finish and colour|material_list|when relevant||Actual materials and finish rather than a photograph-derived guess.
contents|Included components and accessories|component_table|P|details|Separate pictured props and optional accessories from included contents.
warranty|Warranty and support details|policy_reference|when a warranty or support is offered|terms|Provider, duration, scope and exclusions from the actual terms; a warranty does not establish authenticity.
""")
G("furniture", "Furniture configuration and fit", """
kind|Furniture type and configuration|enum|P||Specific item, set contents and actual purchasable configuration.
dimensions|Assembled dimensions and access requirements|dimensions|P||Include orientation, relevant seat/bed/shelf dimensions and door/access constraints with units.
capacity|Seating, mattress fit or stated load|quantity|when applicable||Identify the meaning/unit and use confirmed manufacturer values.
finish|Upholstery, finish and assembly options|option_group_table|when choices exist|options,pricing|Variant-specific photos, dimensions and charges; custom manufacture is a separate supported activity.
assembly|Assembly, installation and delivery scope|text|P|fulfilment,terms|State what is included and link a separately offered installation service where applicable.
""")
G("textile", "Home textile sizes and contents", """
kind|Item and set contents|text|P||Duvet cover, curtain, towel or actual product; included pieces are explicit.
measurements|Dimensions and fit|dimensions|P|options,specifications|Length/width, curtain drop, mattress depth or applicable measurements with units.
composition|Material, weave and care|material_list|P||Only confirmed composition/performance claims.
""")
G("appliance", "Appliance fit and performance label", """
capacity|Rated capacity and relevant output|quantity|P||Units specific to appliance type, such as volume, mass/load or rated output.
power|Voltage, power, plug and supply requirements|electrical_specs|P||Use manufacturer ratings and explicit units; electrical compatibility is not inferred.
energy|Published energy/noise ratings|rating_table|O||Preserve source, method/scale and units; do not compare incompatible scales.
installation|Connections, clearance and installation needs|text_list|when installation is needed|details,fulfilment|Separate product requirements from a bookable installation service.
""")
G("kitchenware", "Kitchenware specifications", """
size|Dimensions, capacity and item count|dimensions|P||Explicit length/volume units and number of pieces.
material|Material, coating and finish|material_list|P||Actual material, coating and relevant care information.
compatibility|Heat-source and care compatibility|text_list|when applicable||Only manufacturer-confirmed oven, hob or cleaning compatibility.
""")
G("book", "Book and publication details", """
title|Title, author and publisher|text|P||Exact work, author and publisher where available.
edition|Edition, publication date and identifier|text|when published with this information||Preserve ISBN/edition; do not combine different editions in one indistinguishable variant.
format|Format, language and page count|text|P|options,specifications|Hardback, paperback or licensed digital format; digital rights/fulfilment need explicit support.
genre|Genre and audience information|text_list|O||Publisher or merchant descriptors and actual contents guidance.
""")
G("stationery", "Stationery and office consumables", """
kind|Specific item and purpose|text|P||Pen, paper, file, ink or actual supply type.
size|Dimensions, format and pack count|dimensions|P||Paper dimensions, sheet count, ruling or instrument width with units as applicable.
materials|Material, colour and specification|text_list|P||Paper grammage, ink properties or actual product specifications with units.
compatibility|Compatible device or refill system|reference_list|when device-specific||Exact supported model or refill references.
""")
G("device", "Electronic device specifications", """
model|Exact model, generation and condition grade|text|P||Condition details supplement the shared product condition; do not hide refurbishment.
processor|Processor and platform|text|when relevant||Actual chip/OS/architecture information; clarify version and compatibility limits.
memory|Memory and storage options|quantity_list|when relevant|options,specifications|RAM and storage are different fields in the value structure, each with units and actual variant combinations.
display|Display size, resolution and panel|display_specs|when the device has a display||Diagonal unit, resolution, refresh rate and actual panel information.
connectivity|Ports, networks and compatibility|text_list|P||Actual connectors and supported standards; no inferred regional/network compatibility.
battery|Battery and charging specifications|electrical_specs|when battery-powered||Rated capacity, charging connector and manufacturer ratings; no invented runtime.
""")
G("phone", "Phone and tablet-specific details", """
network|SIM, eSIM and network model|text|P||Exact supported configuration and carrier/region restrictions where present.
cameras|Camera specifications|camera_specs|when cameras are present||Preserve lens/sensor distinctions and labelled units.
condition|Refurbished battery/repair condition|condition_report|when used or refurbished||Disclosed actual condition; serial/IMEI stays internal unless separately authorized.
""")
G("computer", "Computer configuration", """
graphics|Graphics and upgrade options|text|P||Actual integrated/discrete configuration; upgrading is a separate offered service if relevant.
form|Form factor and included peripherals|text|P||Laptop/desktop/all-in-one and exact included components.
compatibility|Expansion and software licence scope|text_list|O||Do not promise unsupported upgrades or include unlicensed software.
""")
G("accessory_tech", "Electronic accessory compatibility", """
kind|Accessory type and intended device|text|P||Cable, charger, case, screen protector, peripheral or actual item.
compatibility|Supported device models and protocols|reference_list|P||Exact fit, connectors, power/data protocol and source of compatibility.
rating|Dimensions, length and rated electrical/data capacity|technical_specs|when applicable||Named measurements with units and confirmed ratings; distinguish power capacity from energy capacity.
""")
G("gaming", "Gaming product specifics", """
platform|Platform, generation and region|text|P||Console generation and relevant region/version restrictions.
edition|Edition, media format and contents|text|P||Physical/digital, game versus hardware, included DLC/parts; digital delivery needs supported rights.
compatibility|Controller, account and online requirements|text_list|when applicable||Subscription requirements and compatibility are explicit; account secrets never public.
rating|Published content classification|text|when present||Source classification, not a generated age judgement.
""")
G("audio", "Audio specifications", """
format|Headphone, speaker or audio equipment type|enum|P||Actual form factor and intended connection method.
connections|Connections and supported codecs|text_list|P||Actual manufacturer-supported wired/wireless interfaces.
ratings|Power, impedance and other published ratings|technical_specs|when provided||Use labelled measures and units; never equate unlike power-rating methods.
features|Microphone, noise control and battery features|text_list|O||Exact product features and confirmed ratings.
""")
G("smart", "Smart device ecosystem and installation", """
ecosystem|Supported hubs, apps and ecosystems|reference_list|P||Local/cloud and account requirements, regional support and compatibility limits.
network|Network, power and installation requirements|technical_specs|P||Explicit supported band/protocol, supply and mounting requirements.
subscription|Ongoing fees and privacy-related features|text_list|when applicable|details,terms|Declare recurring fees, storage and supported features; do not collect credentials in listing fields.
""")
G("telecom", "Connectivity plan and device terms", """
network|Provider and exact plan/device|text|P||Identify the provider, product and any provider confirmation needed.
allowance|Data, call or service allowance|quantity|P|card,specifications|Exact units, validity period, limits and expiry; unlimited requires its actual fair-use terms.
eligibility|Coverage and compatibility requirements|text_list|P|details,terms|Availability comes from the provider for the actual customer location/device.
activation|Activation process and recurring charges|policy_reference|P|pricing,terms|Disclose activation versus confirmed service and applicable ongoing fees; private identity inputs use authorized provider flow.
""")
G("repair", "Repair or workshop scope", """
equipment|Supported product, model or vehicle|reference_list|P||Compatibility determines the task; do not imply support for every model.
assessment|Assessment, diagnostics and quoted work|text|P|details,terms|Separate diagnostic fee, estimate and later authorized repair.
parts|Parts, labour, warranty and exclusions|component_table|P|details,pricing,terms|Actual approved work and parts acceptance; a diagnostic listing is not a final repair price.
turnaround|Turnaround estimate and intake method|duration_or_assessment|P|fulfilment|Assessment-required is explicit; intake appointments and the whole job are distinct.
""")
G("medicine", "Pharmacy product label and eligibility", """
identity|Exact product and manufacturer|text|P||Approved/labelled product identity; do not generate medical alternatives.
form|Form, labelled strength and pack quantity|labelled_product_specs|P||Separate strength, dosage form and quantity with units; these are label facts, not dosage instructions.
eligibility|Applicable dispensing and verification policy|policy_reference|P|terms|Authorized policy determines checks; no legal classification is invented by this plan.
information|Approved label information and storage|text_list|when available or required|details|Display authoritative approved content; no generated treatment guidance.
""")
G("medical_supply", "Medical supply or equipment specification", """
purpose|Device or supply type and labelled use|text|P||Manufacturer-stated purpose; no personalized clinical recommendation.
size|Sizes, dimensions, units and pack contents|quantity_list|P|options,specifications|Consumable sizes and device sizes need explicit measurement units.
compatibility|Compatibility, sterility and use conditions|technical_specs|when applicable||Capture actual manufacturer labels and compatible models; unknown is not sterile or reusable.
evidence|Required product verification reference|verification_reference|when required by approved policy|internal|No seller-created verification badge or regulatory approval.
""")
G("baby", "Baby product fit and label details", """
kind|Specific baby product type|text|P||Diaper, feeding item, care product, food or equipment uses its actual additional template.
fit|Labelled age, weight or size range|range_with_unit|when relevant|options,specifications|Preserve label basis and units; these are product descriptors, not clinical advice.
material|Materials, compatibility and pack contents|text_list|P||Actual manufacturer information; no invented safety claims.
""")
G("supplement", "Supplement label details", """
ingredients|Labelled ingredients and amount basis|labelled_product_specs|P||Separate amount per serving/unit from recommended use; no generated dosage advice.
form|Product form, net quantity and servings|quantity_list|P||Capsule/powder/liquid as labelled, with units and actual contents.
claims|Approved label information and cautions|text_list|when present or required|details,terms|Do not infer medical benefits or suitability; source approved wording and policy.
""")
G("health_service", "Health service information", """
service|Service name, scope and provider specialty|text|P||Public service description rather than a patient's symptoms or diagnosis.
format|Venue, remote or home-visit format|enum_list|P|options,fulfilment|Only explicitly supported service methods.
provider|Public professional profile and verification reference|resource_reference|when a named practitioner is offered|details|Use approved public projection and verification owner, never infer professional authorization from a category.
preparation|Approved preparation and result-delivery information|policy_reference|when relevant|details,terms|Provider-approved administrative content; clinical records/results use their authorized private system.
""")
G("lab", "Test listing and collection details", """
test|Test or panel identity and included tests|component_table|P||Accurate service scope; no generated interpretation or substitute test advice.
collection|Sample and supported collection method|text|P|details,fulfilment|Provider-approved sample information and venue/home-collection capability.
turnaround|Published result turnaround basis|duration_or_assessment|P|details|Label estimated versus confirmed; results stay private outside the public catalog.
""")
G("health_intake", "Private administrative health intake", """
contact|Necessary patient contact and booking identity|contact_reference|when booking a service|request_form|Purpose-limited authorized collection; not part of a public listing or ordinary merchant notes.
requirements|Necessary referral or administrative documents|secure_document_reference|when required by the authorized provider|request_form|Do not collect clinical history by default. Existing clinical authority owns any sensitive records.
""", scope="transaction", owner="work_items")

G("rental", "Vehicle rental specifications and terms", """
identity|Exact vehicle or vehicle class|asset_class_reference|P|card,specifications|Explicit guaranteed vehicle versus class/or-similar policy; identified allocations remain resource-owned.
make|Make, model, year or class description|text|P||Use actual vehicle details; a class listing must disclose which specifications are guaranteed.
seats|Passenger seats and luggage capacity|capacity_table|P|card,specifications|Separate people from bags; count/unit and luggage assumptions are explicit.
transmission|Transmission and fuel/power type|enum_list|P|card,specifications|Actual guaranteed configuration or transparent class alternatives.
features|Air conditioning and equipment|text_list|O||Actual confirmed features; never infer off-road capability.
mileage|Distance allowance and excess-distance charge|distance_policy|P|pricing,terms|Unlimited or exact allowance with km/mi and per-day/per-rental basis; excess charge is separately priced.
fuel|Fuel or charging return policy|policy_reference|P|terms|State actual pickup/return obligation and applicable costs.
deposit|Deposit and release conditions|deposit_policy_reference|when a deposit applies|pricing,terms|Explicit amount/currency or calculation, timing and authorized refund/release policy.
cover|Included cover and exclusions|policy_reference|P|terms|Approved terms and responsibility limits; no invented insurance or legal eligibility thresholds.
eligibility|Driver, use and travel restrictions|policy_reference|P|terms|Actual accepted driver/document, territory and vehicle-use terms from the policy owner; customer documents use private authorized intake.
driver|Self-drive or optional driver|option_group_table|P|options,pricing|Driver selection changes price and required joint allocation; it does not convert the rental to a transfer.
period|Rental duration and pickup/return rules|interval_policy|P|schedule,terms|Exact minimum/maximum, charge period, grace/late rules and time/date semantics.
handover|Pickup and return places and charges|location_option_table|P|options,fulfilment|Supported places and time constraints; travel fees must be explicit.
""")
G("rental_long", "Corporate and extended rental terms", """
billing|Billing period, commitment and usage limits|policy_reference|P|pricing,terms|Renewal/extension needs explicit consent; contract dates are not implicit recurring bookings.
support|Maintenance, replacement and support scope|text_list|P|details,terms|Only actual contractual inclusions and response commitments.
corporate|Business account requirements|policy_reference|when a business account is needed|terms|Private account documents are collected through an authorized intake.
""")
G("bike", "Bicycle and motorcycle rental details", """
kind|Bike type, model and fit|text|P|card,specifications|Distinguish bicycle, e-bike and motorcycle; describe rider fit with explicit measurements where relevant.
power|Engine or battery specifications|technical_specs|when powered||Manufacturer-labelled units and actual range assumptions, not guessed runtime.
equipment|Included helmet, locks and equipment|component_table|P|details,terms|Actual included equipment and additional charges.
terms|Rental eligibility, deposit and return rules|policy_reference|P|pricing,terms|Applicable merchant terms and exact interval; no universal age/licence threshold is set here.
usage|Fuel, charging and distance policy|policy_reference|when a powered bike is rented|pricing,terms|Actual fuel/charging return policy, distance allowance and applicable excess charges.
""")
G("transfer", "Transfer route and service", """
route|Airports, origin/destination zones and route basis|route_table|P|card,details|Fixed route versus distance/time-priced scope is explicit.
vehicle|Vehicle class, seats and luggage|capacity_table|P|card,options|Separate seat/bag capacity and guaranteed vehicle from or-similar class.
included|Waiting, parking, tolls and extra stops|inclusion_table|P|pricing,terms|Included quantities/time and additional charge basis.
meeting|Meeting point and flight-delay policy|policy_reference|when airport or assisted meeting is offered|fulfilment,terms|Exact instructions; flight tracking is a configured capability, not an assumed live connection.
accessibility|Child seats and accessibility options|option_group_table|when offered|options|Availability and suitability confirmed for actual requested resources.
""")
G("greeting", "Airport greeting scope", """
scope|Greeting area, escort scope and assistance|text_list|P|details|Greeter-only service is separate from a vehicle transfer.
waiting|Included waiting and extra-time policy|duration_policy|P|pricing,terms|Exact time allowance and charge basis.
sign|Meeting-sign options|customization_schema|when offered|options|Customer name/sign content is private to the booking and restricted execution view.
""")
G("trip_intake", "Private trip and rental selection", """
route|Chosen pickup and destination|location_request|when a trip or handover requires it|request_form|Private exact address/access details; confirm actual coverage.
time|Travel or rental start/end|date_time_selection|P|request_form|Kenya display; explicit instants versus local dates, valid start/end and relevant buffers.
party|Passengers, luggage and extras|capacity_request|when relevant|request_form|Validate actual capacity and compatible child/accessibility requests.
flight|Flight and passenger details|structured_request|when relevant to airport service|request_form|Necessary trip information only; provider confirmation and flight-feed connection are separate.
""", scope="transaction", owner="work_items")
G("event", "Event and ticket information", """
programme|Event programme and organizer|text|P|details|Actual performer/programme and organizer references; never imply organizer verification from seller input.
venue|Venue, access and accessibility|location_reference|P|card,details|Public venue projection; attendee personal details remain private.
occurrences|Actual dated performances or sessions|session_reference|P|schedule|Start/end, admission window, Kenya time and authoritative capacity per occurrence.
tiers|Ticket types, inclusions and quantity rules|ticket_option_table|P|options,pricing|Actual tiers, seating/zone rules and linked shared capacity; booking is separate from ticket issuance.
admission|Entry, transfer and cancellation policy|policy_reference|P|terms|Approved applicable terms including restrictions; no invented thresholds.
""")
G("session", "Class, workshop and activity details", """
activity|Activity, curriculum and level|text|P|card,details|Describe actual content, level and intended audience.
format|Venue, format and instructor|text|P|details,fulfilment|Actual venue/remote format and authorized public instructor profile.
duration|Session duration and occurrence pattern|duration|P|card,schedule|Exact duration and dated occurrences; recurring dates do not create a membership.
capacity|Group size and place allocation|capacity_reference|P|options,schedule|Actual shared session capacity, booking quantities and private/group distinction.
equipment|Included equipment and customer prerequisites|text_list|P|details,terms|Actual supplied items and approved requirements; personal suitability data remains private.
""")
G("photography", "Photography package scope", """
style|Shoot type, style and location options|text|P|card,details|Portrait, event, product or actual scope.
duration|Shoot time and coverage|duration|P|pricing,schedule|Exact time basis; travel/setup requirements are separately configured.
deliverables|Image count, editing and delivery format|deliverable_table|P|details|Distinguish selected/edited/raw files, resolution and actual output.
rights|Usage rights, turnaround and revisions|policy_reference|P|terms|Actual contracted rights and delivery estimate; private image permissions are separate.
""")
G("event_service", "Event planning and venue service scope", """
kind|Event type and package scope|text|P|card,details|Planning/coordination, venue sourcing or a specific venue offer are different choices.
size|Guest range and supported locations|capacity_table|P||Guest count is intake, not proof that a venue or supplier is reserved.
suppliers|Included suppliers and deliverables|component_table|P|details,pricing|Clearly state excluded vendor charges and supplier confirmation dependencies.
acceptance|Quote, approval and change process|policy_reference|P|terms|A request does not reserve supplier capacity or confirm an event.
""")
G("space", "Table or space reservation offering", """
space|Space type and compatible party size|capacity_table|P|card,options|Actual eligible tables/spaces; compatible combinations require real allocation rules.
occupancy|Duration, turnover and seating rules|interval_policy|P|schedule,terms|Exact configured occupancy and buffers; existing reservation software is not enabling intent.
terms|Deposit, minimum spend and cancellation terms|policy_reference|P|pricing,terms|Only applicable reviewed terms; no automatic food order from a space reservation.
""")
G("membership", "Membership, pass or service plan", """
entitlement|Included benefits, quantities and exclusions|entitlement_table|P|card,details|Define access/credits/deliveries and redemption units; enrollment does not reserve a session.
validity|Term, validity and redemption rules|period_policy|P|pricing,terms|Exact local dates or duration and usage limits; unused credits and expiry are explicit.
renewal|Renewal, cancellation and recurring payment consent|policy_reference|when recurring or renewable|terms|Recurring schedule, entitlement and recurring charge consent are separate facts.
booking|Separate booking or delivery requirements|policy_reference|when benefits need reservations or fulfilment|schedule,fulfilment|The actual session/order/visit needs its own supported workflow and capacity check.
""")
G("tour", "Tour itinerary and supplier scope", """
itinerary|Itinerary, stops and activity schedule|itinerary_table|P|details|Dated/local-date milestones, journey time and actual included activities.
duration|Duration, nights and departure options|duration|P|card,schedule|Separate elapsed duration, local nights and departure dates.
party|Private/shared format and party limits|capacity_table|P|card,options|Price basis per person/group and actual controlled or supplier capacity.
inclusions|Guide, meals, accommodation, transport and fees|inclusion_table|P|details,pricing,terms|Explicit inclusions/exclusions; named lodging and flight inventory require authority confirmation.
requirements|Access, language, equipment and conditions|text_list|P|details,terms|Actual languages and merchant/provider-approved requirements; no invented travel or clinical advice.
supplier|Confirmation and change policy|policy_reference|P|terms|Supplier enquiry is not instant confirmation; cancellation and substitutions use accepted terms.
""")
G("cleaning", "Cleaning task and property scope", """
tasks|Included tasks, surfaces and exclusions|task_table|P|details|Standard/deep/specialist tasks need explicit scope and possible assessment.
quantity|Rooms, area, workload and team basis|quantity_list|P|options,pricing|Explicit m2/ft2, rooms or time basis; do not equate area with duration without an actual model.
supplies|Equipment, products and customer requirements|text_list|P|details,terms|State supplied products/equipment and necessary access/services.
completion|Visit, assessment and completion method|policy_reference|P|fulfilment,terms|Unknown workload uses assessment; actual team/travel capacity gates confirmation.
""")
G("laundry", "Laundry and garment processing", """
items|Accepted item types and care categories|item_rate_table|P|options,pricing|Per piece/kg/volume basis and exact units; garment-specific restrictions apply.
scope|Wash, dry, press and treatment inclusions|text_list|P|details|Actual processing methods and relevant label restrictions.
turnaround|Turnaround and express choices|duration_or_assessment|P|card,fulfilment|A collection promise does not establish a feasible return promise.
inspection|Assessment, stain treatment and damage policy|policy_reference|P|terms|Final counted/weighed scope and any revised price require the approved acceptance flow.
windows|Collection, processing and return constraints|linked_window_reference|P|schedule,fulfilment|Use compatible paired capacity and workload; unknown quantities cannot produce a firm return date.
""")
G("vehicle_job", "Vehicle service and compatibility", """
vehicle|Supported vehicle types and fitment|reference_list|P||Actual fitment and variant details; customer vehicle identifiers belong in private intake.
package|Service tasks and exclusions|task_table|P|details|Actual service package, parts/consumables and assessment scope.
location|Workshop, mobile or roadside method|enum_list|P|options,fulfilment|Method selects the applicable job/visit/appointment model; coverage is separately authoritative.
duration|Duration or diagnostic estimate|duration_or_assessment|P|card,schedule|Do not block the whole uncertain repair as a fixed appointment.
""")
G("tire", "Tyre product and fitment", """
size|Tyre dimensions and size designation|technical_specs|P|card,specifications|Preserve exact width/aspect/rim designation and units; do not infer vehicle compatibility.
rating|Load, speed and condition specification|technical_specs|P||Manufacturer ratings and actual condition; no inferred safety suitability.
fitment|Compatible fitment and fitting inclusion|text_list|P|details,terms|Tyre purchase and fitting service have separate owners/prices and supported workflows.
""")
G("battery", "Vehicle battery and installation", """
rating|Voltage, capacity and start-rating specification|electrical_specs|P|card,specifications|Use named rating methods/units and actual model; do not equate unlike start-rating methods.
fitment|Dimensions, terminals and compatible models|technical_specs|P||Explicit compatibility source, orientation and dimensions.
service|Installation, exchange and warranty terms|policy_reference|P|pricing,terms|Old-battery/core exchange and diagnostic/installation charges need clear acceptance.
""")
G("assistance", "Roadside and inspection service scope", """
scope|Supported incident or inspection scope|text_list|P|card,details|Towing, jump-start, recovery or inspection are separate selectable tasks.
limits|Vehicle, distance and operating limits|quantity_list|P|pricing,terms|Applicable vehicle constraints, included distance and extra charges with units.
response|Response estimate and acceptance method|duration_or_assessment|P|fulfilment|Estimate versus actual dispatch confirmation is explicit; 24-hour claim is not current resource availability.
report|Deliverables and report scope|text_list|when inspection/reporting is offered|details,terms|State what is checked and delivered without inventing certification or statutory approval.
""")
G("financial", "Provider service information and handoff", """
provider|Provider and service identity|business_reference|P|card,details|Only an authorized public provider profile and verification projection.
scope|Service purpose and supported channels|text_list|P|details|Information/enquiry/appointment/handoff scope is explicit; no transaction authority is granted by a listing.
terms|Provider-approved fees, rates and eligibility reference|policy_reference|P|pricing,terms|Source, effective time, expiry and indicative versus executable status; no invented rate, advice or guarantee.
handoff|Application, quote or provider handoff process|policy_reference|P|terms,fulfilment|Sensitive identity/payment information stays in the authorized provider flow.
""")
G("financial_scope", "Specific financial service coverage", """
products|Supported service or product types|enum_list|P||Account/enquiry, currency pair, cover type, payment channel, remittance corridor, membership or business service as applicable.
coverage|Locations, currencies or corridor limits|text_list|when relevant||Only provider-confirmed scope; availability and live pricing must be checked at the provider.
""")
G("coordination", "Concierge coordination scope", """
task|Specific task and deliverables|task_table|P|card,details|Define what the coordinator does versus the supplier's actual service.
limits|Included effort, response window and exclusions|text_list|P|pricing,terms|Response estimate is not supplier or execution confirmation.
approval|Budget, purchase and supplier approval process|policy_reference|P|terms|Customer authorization precedes actual spending/commitment; third-party costs and coordination fees remain separate.
privacy|Required private request information|intake_schema|P|request_form|Only purpose-appropriate customer information; keys/access codes/passports are not public listing fields.
""")
G("moving", "Moving workload and handling", """
scope|Move type and included packing/handling|text_list|P|details|Coordination-only versus actual transport is explicit.
load|Inventory, load volume and handling limits|quantity_list|P|options,pricing|Public service limits with units; actual household item list belongs to private request.
access|Access, floor, lift and route factors|intake_schema|P|request_form|Private origin/destination/access information determines quoted scope.
terms|Valuation, cover and damage terms|policy_reference|P|terms|Approved actual terms and acceptance; no implied insurance from a merchant category.
""")
G("freight", "Freight route, cargo and charge basis", """
mode|Freight mode and load service|enum|P|card,details|Sea/air/road and actual load/container/consolidation service.
route|Supported origin, destination and legs|route_table|P|card,fulfilment|Port/airport/door scope and included road/warehouse legs are explicit.
cargo|Cargo classes, restrictions and handling|text_list|P|details,terms|Merchant/carrier-approved scope; no invented customs, hazardous-goods or legal clearance.
units|Chargeable weight, volume or container basis|charge_basis|P|pricing|kg, m3/CBM or container type, minimums and actual carrier conversion rule; never invent a volumetric divisor.
inclusions|Transit estimate, clearance and charge inclusions|inclusion_table|P|pricing,terms|Dates/estimates, duties/taxes/handling exclusions and insurance scope must be explicit.
acceptance|Quote validity and carrier confirmation|policy_reference|P|terms|A request is not accepted cargo or confirmed freight capacity.
""")
G("cargo_intake", "Private shipment declaration", """
goods|Goods, piece count and declared value|structured_request|P|request_form|Purpose-limited declaration with actual currency; carrier review determines acceptance.
dimensions|Dimensions, mass and unit per piece|cargo_dimension_table|P|request_form|Length/width/height and gross mass with units; totals do not replace per-piece constraints.
route|Collection, delivery and required dates|structured_request|P|request_form|Exact private addresses, sender/recipient contacts and access needs are restricted.
documents|Applicable carrier/customs document references|secure_document_reference|when required by the accepted service|request_form|Only authorized document flow; source requirements from the applicable carrier/policy.
""", scope="transaction", owner="work_items")
G("storage", "Storage unit, period and custody", """
unit|Storage type, dimensions and capacity unit|storage_capacity|P|card,specifications|Pallet, bay, unit, m2/ft2 or m3 with dimensions and height where relevant; area is not volume.
goods|Accepted goods and environment|text_list|P|details,terms|Temperature/humidity or other controls only if actually supported; declared restrictions and compatibility.
period|Occupancy, billing and access rules|period_policy|P|pricing,terms|Exact period, minimum term and intake/release policy; custody and allocation remain distinct.
handling|Receiving, picking, dispatch and cover scope|inclusion_table|P|details,pricing,terms|Included handling quantities and charges; no inferred warehouse insurance or stock transfer.
availability|Actual compatible unit/capacity source|availability_reference|P|schedule|Actual authoritative capacity, not total warehouse area as a promise of free space.
""")

G("pizza", "Pizza sizes and toppings", """
size|Pizza diameter and portions|length|P|options,specifications|Explicit units; slices and intended servings are separately labelled.
base|Crust, base and topping choices|option_group_table|P|options,pricing|Included toppings, extra selections, half-and-half rules and incompatible choices if supported.
""")
G("bakery", "Bakery and dessert format", """
kind|Item, flavour and filling|text|P||Actual pastry/bread/dessert identity, filling and icing where relevant.
size|Piece dimensions, weight or serving format|quantity|P|options,specifications|Explicit units and pack count; whole item versus slice is clear.
choices|Toppings, temperature and serving options|option_group_table|when choices are offered|options,pricing|Frozen desserts need actual scoop/volume basis and relevant cold fulfilment.
""")
G("wellness", "Wellness session and facility scope", """
modality|Session modality, focus and intensity description|text|P|card,details|Actual provider description; no invented efficacy or health suitability claims.
inclusions|Facilities, products and equipment included|text_list|P|details|Distinguish facility access, individual service and paid extras.
preferences|Supported provider and format preferences|option_group_table|when offered|options|Preferences require actual resource availability; personal suitability data uses private intake.
""")
G("installation", "Installation and setup task", """
compatibility|Supported items, site and connections|technical_specs|P|details|Exact supported product/site requirements and any pre-visit assessment.
scope|Included labour, materials and exclusions|task_table|P|details,pricing|Required parts, mounting or disposal charges are explicit.
handover|Testing, handover and support scope|text_list|P|terms|State actual acceptance and support without inventing certification.
""")

# Reusable combinations are authoring conveniences, not additional authorities.
P = "sale price stock fulfilment"
S = "service price schedule request"
H = "service price schedule health_service health_intake"
R = "price schedule trip_intake"
Q = "price request"

T("intimate_device", "Intimate personal-care device", P + " intimate restricted", card="intimate.material")
T("intimate_wellness_product", "Intimate care or wellness product", P + " personal_care restricted", card="personal_care.quantity")
T("adult_accessory", "Intimate accessory or garment", P + " intimate restricted", card="intimate.material")
T("adult_wellness_service", "Adult wellness consultation or service", S + " restricted", "APPOINTMENT FIELD_VISIT",
  note="Public service scope remains separate from personal or clinical intake; activity and eligibility require their actual authority.")
T("cigarettes", "Cigarette pack or carton", P + " tobacco restricted", card="tobacco.format")
T("cigar", "Cigar or cigar box", P + " tobacco restricted", card="tobacco.origin tobacco.format")
T("vape_device", "Vape device or replacement component", P + " vape restricted", card="vape.kind")
T("vape_refill", "Vape refill or liquid", P + " vape restricted", card="vape.contents")

T("wine", "Wine bottle or case", P + " beverage alcohol restricted", card="alcohol.style alcohol.vintage")
T("spirit", "Spirit bottle or set", P + " beverage alcohol restricted", card="alcohol.style alcohol.vintage")
T("beer", "Beer or cider pack", P + " beverage alcohol restricted", card="alcohol.style beverage.volume")
T("sparkling_wine", "Sparkling wine or champagne listing", P + " beverage alcohol restricted",
  note="Only use a protected/style/origin designation supported by actual product information.", card="alcohol.style alcohol.vintage")
T("mixer", "Non-alcoholic mixer or soft drink", P + " beverage", note="Classify actual contents; do not inherit an alcohol eligibility flag solely from a liquor-store merchant.", card="beverage.volume")
T("alcoholic_mixer", "Alcohol-containing mixer or premixed drink", P + " beverage alcohol restricted", card="alcohol.abv beverage.volume")

T("shirt", "Shirt or structured top", P + " apparel sizing shirt", card="apparel.fabric apparel.fit")
T("dress", "Dress", P + " apparel sizing dress", card="apparel.fabric dress.length",
  choices="Selecting a size highlights its own bust/waist/hip/length chart row and actual colour variant. Garment and body measures remain labelled.")
T("trousers", "Trousers or jeans", P + " apparel sizing bottom", card="apparel.fit bottom.length")
T("skirt", "Skirt", P + " apparel sizing bottom", card="apparel.fit bottom.length", note="Leg-specific inseam/rise fields are not applicable to a skirt.")
T("shorts", "Shorts", P + " apparel sizing bottom", card="apparel.fabric bottom.length")
T("jacket", "Jacket or coat", P + " apparel sizing shirt outerwear", card="apparel.fabric outerwear.layers")
T("suit", "Suit or coordinated clothing set", P + " apparel sizing shirt bottom gift", card="apparel.fit",
  note="Jacket and trouser measurements and included pieces remain separate; matching-set selections need actual valid combinations.")
T("knitwear", "Knitwear or casual top", P + " apparel sizing shirt", card="apparel.fabric apparel.stretch")
T("activewear", "Activewear garment", P + " apparel sizing shirt bottom", card="apparel.fabric apparel.fit",
  note="Select upper/lower-body construction before rendering applicable measurements. A set declares included pieces and actual size combinations.")
T("underwear", "Underwear or fitted intimate garment", P + " apparel sizing bottom", card="apparel.fabric",
  note="Add garment-appropriate fit, such as bust/band/cup, through the reviewed measurement extension; hygiene/return terms are explicit.")
T("sleepwear", "Sleepwear or loungewear", P + " apparel sizing shirt bottom", card="apparel.fabric",
  note="Upper/lower/set scope selects applicable measurements; do not require trouser inseam for a nightdress.")
T("kids_top", "Children's top or outerwear", P + " apparel sizing shirt children", card="children.height apparel.fabric")
T("kids_dress", "Children's dress", P + " apparel sizing dress children", card="children.height dress.length")
T("kids_bottom", "Children's trousers, skirt or shorts", P + " apparel sizing bottom children", card="children.height bottom.length")
T("uniform", "School or work uniform garment/set", P + " apparel sizing shirt bottom children", card="apparel.fabric",
  note="Choose the actual upper/lower/dress/set construction and applicable measurements; school/design and set contents must be explicit.")
T("shoe", "Footwear", P + " footwear", card="footwear.materials footwear.system")
T("bag", "Handbag, luggage or backpack", P + " bag", card="bag.dimensions bag.material")
T("watch", "Wristwatch", P + " watch", card="watch.movement watch.case")
T("jewellery", "Jewellery", P + " accessory", card="accessory.material accessory.fit",
  note="Item-specific ring/bracelet/necklace dimensions, metal/plating and stone claims must remain distinguishable.")
T("belt", "Belt", P + " accessory", card="accessory.material accessory.fit")
T("hat", "Hat or fitted headwear", P + " accessory", card="accessory.material accessory.fit")
T("scarf", "Scarf or wrap", P + " accessory", card="accessory.material accessory.fit")
T("tailoring", "Custom tailoring or made-to-measure garment", "apparel custom price request fulfilment", "PRODUCTION_DUE",
  intake="Personal measurements and design uploads are private order data; the public listing describes supported choices and measurement instructions.")
T("styling", "Styling or fitting appointment", S, "APPOINTMENT", note="Consultation scope and duration, not a product stock item.")

T("makeup_product", "Makeup product with shade choices", P + " personal_care cosmetic", card="cosmetic.finish personal_care.quantity")
T("skincare_product", "Skin-care product", P + " personal_care cosmetic", card="personal_care.quantity cosmetic.suitability")
T("hair_product", "Hair-care product", P + " personal_care cosmetic", card="personal_care.quantity cosmetic.suitability")
T("fragrance", "Fragrance or fragrance set", P + " personal_care fragrance", card="fragrance.concentration fragrance.format")
T("beauty_tool", "Beauty tool or accessory", P + " durable personal_care", card="durable.contents")
T("makeup_service", "Makeup application or bridal session", S + " beauty_service", "APPOINTMENT FIELD_VISIT", card="beauty_service.technique service.duration")
T("skin_service", "Skin-care consultation or treatment", S + " beauty_service", "APPOINTMENT FIELD_VISIT", card="beauty_service.technique service.duration")
T("hair_service", "Hair styling, cut or treatment", S + " beauty_service", "APPOINTMENT FIELD_VISIT", card="beauty_service.technique service.duration")
T("nail_service", "Nail service", S + " beauty_service", "APPOINTMENT FIELD_VISIT", card="beauty_service.technique service.duration")

T("car_rental", "Car rental with optional driver", "rental " + R, "ASSET_INTERVAL", card="rental.identity rental.transmission rental.seats",
  choices="Choose actual dates, handover places, driver and supported extras. Recalculate the rental total; confirm all required asset/driver allocations.")
T("self_drive", "Self-drive vehicle rental", "rental " + R, "ASSET_INTERVAL", card="rental.identity rental.transmission rental.seats", note="Driver selection is fixed to self-drive; collect only applicable private eligibility information.")
T("extended_rental", "Corporate or long-term vehicle rental", "rental rental_long " + R, "ASSET_INTERVAL", card="rental.identity rental_long.billing")
T("bike_rental", "Bicycle, e-bike or motorcycle rental", "bike " + R, "ASSET_INTERVAL", card="bike.kind bike.equipment", note="Select the actual bike kind; charge period, handover, allocation and return/deposit rules still require setup.")
T("airport_transfer", "Airport pickup or drop-off trip", "transfer " + R, "TRANSFER", card="transfer.route transfer.vehicle")
T("executive_transfer", "Executive transfer trip", "transfer " + R, "TRANSFER", card="transfer.vehicle transfer.included", note="Explicit class, amenities, service scope and charges; a priority label never supplies missing capacity.")
T("airport_greeting", "Airport meet-and-greet only", "greeting " + R, "TRANSFER", card="greeting.scope greeting.waiting", note="Use the reconciled greeter-only variant; do not require a fictitious vehicle or imply a bundled transfer.")

T("event_ticket", "Concert, festival or performance admission", "event price schedule request", "SESSION_CAPACITY", card="event.venue event.occurrences")
T("conference_ticket", "Conference or delegate pass", "event price schedule request", "SESSION_CAPACITY", card="event.venue event.occurrences", note="Show agenda, delegate tier, included sessions/materials and real per-occurrence capacity.")
T("event_planning", "Private event planning or coordination", "event_service " + Q, "REQUEST_QUOTE", card="event_service.kind event_service.size")
T("event_space", "Venue or space reservation", "space service price schedule request", "SPACE_RESERVATION", card="space.space space.occupancy")
T("photography", "Photography shoot package", S + " photography", "APPOINTMENT FIELD_VISIT", card="photography.style photography.duration")
T("workshop", "Dated workshop place", "session price schedule request", "SESSION_CAPACITY", card="session.activity session.duration")
T("class", "Dated class place", "session price schedule request", "SESSION_CAPACITY", card="session.activity session.duration")
T("sport", "Sports activity or group session", "session price schedule request", "SESSION_CAPACITY", card="session.activity session.capacity")
T("recreation", "Recreation activity or admission session", "session price schedule request", "SESSION_CAPACITY", card="session.activity session.duration")
T("session_pass", "Class or activity pass", "membership price request", "ENTITLEMENT", card="membership.entitlement membership.validity")

T("banking_enquiry", "Banking service enquiry or appointment", "financial financial_scope price schedule request", "REQUEST_QUOTE APPOINTMENT", card="financial.provider financial_scope.products")
T("forex_enquiry", "Currency exchange enquiry or provider handoff", "financial financial_scope price schedule request", "REQUEST_QUOTE APPOINTMENT", card="financial_scope.products financial_scope.coverage")
T("insurance_enquiry", "Insurance information or quote request", "financial financial_scope price schedule request", "REQUEST_QUOTE APPOINTMENT", card="financial.provider financial_scope.products")
T("payment_enquiry", "Payment service information or provider handoff", "financial financial_scope price schedule request", "REQUEST_QUOTE APPOINTMENT", card="financial_scope.products")
T("remittance_enquiry", "Remittance service enquiry or provider handoff", "financial financial_scope price schedule request", "REQUEST_QUOTE APPOINTMENT", card="financial_scope.coverage")
T("sacco_enquiry", "Sacco membership or service enquiry", "financial financial_scope price schedule request", "REQUEST_QUOTE APPOINTMENT", card="financial.provider financial_scope.products")
T("business_enquiry", "Business professional service enquiry", "financial financial_scope price schedule request", "REQUEST_QUOTE APPOINTMENT", card="financial_scope.products", note="Use only the actual professional/provider service scope. No transaction or regulated authority is inferred.")

T("bouquet", "Bouquet or flower arrangement", P + " flowers gift", card="flowers.size flowers.state")
T("flower_plan", "Recurring bouquet plan", "membership flowers price fulfilment request", "ENTITLEMENT", card="membership.entitlement membership.validity")
T("hamper", "Ready-made gift hamper", P + " gift food", card="gift.contents", note="Food component labels/allergens and restricted items retain their own applicable requirements.")
T("custom_hamper", "Custom-curated gift hamper", "gift custom food price fulfilment request", "PRODUCTION_DUE", card="gift.contents custom.lead_time")
T("ready_cake", "Ready-made cake or cake slice", P + " food cake", card="cake.servings cake.shape", note="Ready-stock sale is distinct from accepted custom production; hide custom-only design/due fields if inapplicable.")
T("custom_cake", "Custom cake", "food cake custom price fulfilment request", "PRODUCTION_DUE", card="cake.servings cake.due")
T("chocolates", "Chocolates or confectionery box", P + " food packaged_food gift", card="packaged_food.net gift.contents")
T("personalized_gift", "Personalized gift or printed item", "gift custom price fulfilment request", "PRODUCTION_DUE", card="gift.contents custom.lead_time")
T("occasion_gift", "Ready-made occasion gift", P + " gift durable", card="gift.contents gift.occasion")

T("dish", "Prepared dish", P + " food dish", card="food.portion dish.cuisine")
T("pizza", "Pizza", P + " food dish pizza", card="pizza.size")
T("burger_sandwich", "Burger, wrap or sandwich", P + " food dish", card="food.portion", choices="Supported bread, filling, sides and extras use explicit required/optional option groups and ingredient information.")
T("meal_combo", "Meal combo or family platter", P + " food dish", card="food.portion dish.components")
T("bakery_item", "Bread, pastry or baked snack", P + " food bakery", card="bakery.kind bakery.size")
T("dessert", "Dessert or frozen dessert", P + " food bakery", card="bakery.kind bakery.size")
T("coffee_tea", "Prepared coffee or tea", P + " food coffee", card="coffee.base coffee.size")
T("juice", "Juice, smoothie or blended drink", P + " food coffee", card="food.portion", note="Actual ingredients, serving volume and offered sweetness/additions; no invented wellness claims.")
T("catering", "Catering service or event menu", "food dish event_service " + Q, "REQUEST_QUOTE", card="event_service.size food.portion",
  intake="Private event date, location, headcount, menu, dietary requirements and service/equipment needs support the quote; acceptance is explicit.")
T("table", "Restaurant table reservation", "space price schedule request", "SPACE_RESERVATION", card="space.space space.occupancy")

T("packaged_food", "Packaged food or grocery", P + " food packaged_food", card="packaged_food.net")
T("dairy_eggs", "Dairy product or eggs", P + " food packaged_food", card="packaged_food.net", note="Actual species/product, fat/form descriptor, pack count and cold-storage label where applicable.")
T("frozen_food", "Frozen grocery product", P + " food packaged_food", card="packaged_food.net", note="Actual frozen state, contents and cold-handling instructions; no inferred thaw/refreeze guidance.")
T("produce", "Fresh fruit, vegetables or herbs", P + " food produce", card="produce.variety produce.sale")
T("produce_box", "Recurring produce box plan", "membership produce food price fulfilment request", "ENTITLEMENT", card="membership.entitlement membership.validity")
T("meat", "Meat or poultry cut", P + " food protein", card="protein.kind protein.state protein.weight")
T("seafood", "Fish or seafood product", P + " food protein", card="protein.kind protein.state protein.weight")
T("household", "Household cleaning or paper product", P + " household", card="household.contents household.purpose")
T("personal_care", "General personal-care product", P + " personal_care", card="personal_care.quantity personal_care.kind")

T("laundry", "Wash and dry laundry service", "laundry price schedule request fulfilment", "LINKED_WINDOWS", card="laundry.items laundry.turnaround")
T("dry_cleaning", "Dry-cleaning garment service", "laundry price schedule request fulfilment", "LINKED_WINDOWS", card="laundry.items laundry.turnaround", note="Garment-specific processing and inspection; do not assume all textiles accept one treatment.")
T("ironing", "Ironing or pressing service", "laundry price schedule request fulfilment", "LINKED_WINDOWS", card="laundry.items laundry.turnaround", note="Press-only scope and paired collection/return apply where offered.")
T("home_clean", "Home standard or deep-clean visit", S + " cleaning", "FIELD_VISIT", card="cleaning.tasks cleaning.quantity")
T("office_clean", "Office or commercial clean visit", S + " cleaning", "FIELD_VISIT", card="cleaning.tasks cleaning.quantity")
T("cleaning_plan", "Recurring cleaning service plan", "membership cleaning price request", "ENTITLEMENT", card="membership.entitlement membership.validity")

T("furniture", "Furniture item or set", P + " durable furniture", card="furniture.kind furniture.dimensions")
T("home_textile", "Bedding, curtain or home textile", P + " textile", card="textile.measurements textile.composition")
T("decor", "Home decor item", P + " durable", card="durable.dimensions durable.materials")
T("lighting", "Lamp or lighting fixture", P + " durable appliance", card="appliance.power durable.dimensions", note="Relevant output/socket/mounting information is typed in the manufacturer specification; unrelated appliance-capacity fields are not applicable.")
T("appliance", "Home appliance", P + " durable appliance", card="appliance.capacity appliance.power")
T("kitchenware", "Cookware, utensils or tableware", P + " kitchenware", card="kitchenware.size kitchenware.material")
T("book", "Book or publication", P + " book", card="book.title book.format")
T("special_book", "Specially sourced publication request", "book price request fulfilment", "REQUEST_QUOTE", card="book.title book.edition", note="Sourcing an existing edition is not custom manufacture.")
T("custom_publication", "Custom printed or bound publication", "book custom price request fulfilment", "PRODUCTION_DUE", card="book.format custom.lead_time")
T("stationery", "Stationery or paper supply", P + " stationery", card="stationery.kind stationery.size")
T("office_consumable", "Printer ink, toner or office consumable", P + " stationery accessory_tech", card="stationery.kind stationery.compatibility")
T("installation", "Product installation or assembly visit", S + " installation", "FIELD_VISIT", card="installation.scope service.duration")

T("medicine", "Pharmacy medicine listing", P + " medicine", card="medicine.identity medicine.form")
T("medical_supply", "Medical consumable or equipment", P + " medical_supply durable", card="medical_supply.purpose medical_supply.size")
T("baby_care", "Baby diaper or care product", P + " baby personal_care", card="baby.fit personal_care.quantity")
T("baby_food", "Baby feeding food or formula listing", P + " baby food packaged_food", card="baby.fit packaged_food.net", note="Product label facts only, with approved eligibility/content; no personalized feeding or clinical recommendations.")
T("baby_equipment", "Baby feeding accessory or equipment", P + " baby durable", card="baby.fit durable.dimensions")
T("baby_plan", "Recurring baby-product supply plan", "membership baby price fulfilment request", "ENTITLEMENT", card="membership.entitlement membership.validity")
T("supplement", "Vitamin or supplement product", P + " supplement", card="supplement.form supplement.ingredients")
T("clinic", "Clinic consultation or procedure appointment", H, "APPOINTMENT FIELD_VISIT", card="health_service.service service.duration")
T("telemedicine", "Remote health consultation", H, "APPOINTMENT", card="health_service.service service.duration", note="Only remote method; session access and clinical records remain private with their authority.")
T("lab_test", "Lab test or panel with collection", H + " lab", "APPOINTMENT FIELD_VISIT", card="lab.test lab.turnaround")
T("therapy", "Therapy or counselling session", H, "APPOINTMENT", card="health_service.service service.duration", note="No public symptoms, diagnosis or clinical notes; no sensitive history requested by default.")
T("coaching", "Individual coaching session", S, "APPOINTMENT", card="service.scope service.duration")
T("group_coaching", "Group coaching session", "session price schedule request", "SESSION_CAPACITY", card="session.activity session.capacity")

T("smartphone", "Smartphone or tablet", P + " durable device phone", card="device.model device.memory device.display")
T("computer", "Laptop, desktop or all-in-one computer", P + " durable device computer", card="device.processor device.memory")
T("monitor", "Monitor or display", P + " durable device", card="device.display device.connectivity", note="Processor, memory and battery fields apply only if actually relevant; display detail is mandatory for this type.")
T("tech_accessory", "Cable, charger, case or peripheral", P + " durable accessory_tech", card="accessory_tech.compatibility accessory_tech.rating")
T("console", "Game console or gaming hardware", P + " durable device gaming", card="gaming.platform device.memory")
T("game", "Game or gaming software product", P + " gaming", card="gaming.platform gaming.edition")
T("audio", "Headphones, speakers or audio equipment", P + " durable audio", card="audio.format audio.connections")
T("telecom_plan", "Connectivity or telecom plan", "telecom price fulfilment request", "ORDER", card="telecom.allowance telecom.network", note="Provider eligibility, authorization and actual activation still gate service; listing publication is not a live telecom connection.")
T("network_device", "Router, modem or network device", P + " durable device telecom", card="device.connectivity telecom.network", note="Plan allowance and activation terms are conditional on a bundled plan; hardware alone must not invent a subscription.")
T("smart_device", "Smart-home device or wearable", P + " durable device smart", card="smart.ecosystem smart.network")
T("device_repair", "Device diagnostic or repair job", "repair price request fulfilment", "SERVICE_JOB", card="repair.equipment repair.turnaround")
T("telecom_support", "Telecom setup or support job", "repair telecom price request fulfilment", "SERVICE_JOB", card="repair.equipment repair.turnaround")

T("safari", "Overnight safari itinerary", "tour price schedule request", "TOUR", card="tour.duration tour.party")
T("game_drive", "Game-drive excursion", "tour price schedule request", "TOUR", card="tour.duration tour.party", note="Park fees, vehicle, guide, pickup and actual departure capacity are explicit.")
T("luxury_safari", "Premium safari itinerary", "tour price schedule request", "TOUR", card="tour.duration tour.inclusions", note="Luxury label does not establish lodge/flight availability; actual named inclusions and supplier confirmation apply.")
T("city_tour", "City or cultural tour", "tour price schedule request", "TOUR", card="tour.duration tour.requirements")
T("adventure_tour", "Adventure excursion", "tour price schedule request", "TOUR", card="tour.duration tour.requirements", note="Actual difficulty/equipment/provider requirements and cancellation/weather terms are sourced, not guessed.")
T("travel_request", "Travel package sourcing or planning request", "tour price request", "REQUEST_QUOTE", card="tour.duration tour.inclusions", note="Desired itinerary and estimates remain proposed until suppliers confirm; no instant flight/lodging promise.")

T("car_wash", "Workshop car-wash or detailing job", "vehicle_job price request fulfilment", "SERVICE_JOB", card="vehicle_job.package vehicle_job.duration")
T("mobile_wash", "Mobile car-wash or detailing visit", S + " vehicle_job", "FIELD_VISIT", card="vehicle_job.package service.duration")
T("wash_plan", "Car-wash service plan", "membership vehicle_job price request", "ENTITLEMENT", card="membership.entitlement membership.validity")
T("tire_product", "Tyre product", P + " tire", card="tire.size tire.rating")
T("tire_job", "Tyre fitting, repair or balancing job", "vehicle_job tire price request fulfilment", "SERVICE_JOB", card="vehicle_job.package tire.size")
T("mobile_tire", "Mobile tyre assistance visit", S + " vehicle_job tire", "FIELD_VISIT", card="vehicle_job.package tire.size")
T("battery_product", "Vehicle battery product", P + " battery", card="battery.rating battery.fitment")
T("battery_job", "Workshop battery diagnostic or installation", "vehicle_job battery price request fulfilment", "SERVICE_JOB", card="battery.rating vehicle_job.package")
T("mobile_battery", "Mobile battery or jump-start visit", S + " vehicle_job battery", "FIELD_VISIT", card="vehicle_job.package battery.rating")
T("roadside", "Roadside assistance or towing visit", S + " assistance", "FIELD_VISIT", card="assistance.scope assistance.response")
T("inspection", "Vehicle inspection appointment or visit", S + " vehicle_job assistance", "APPOINTMENT FIELD_VISIT", card="assistance.scope assistance.report")
T("spa", "Spa treatment appointment or visit", S + " wellness", "APPOINTMENT FIELD_VISIT", card="wellness.modality service.duration")
T("massage", "Massage appointment or visit", S + " wellness", "APPOINTMENT FIELD_VISIT", card="wellness.modality service.duration")
T("wellness_plan", "Spa or wellness membership", "membership wellness price request", "ENTITLEMENT", card="membership.entitlement membership.validity")
T("gym_membership", "Gym membership or access pass", "membership wellness price request", "ENTITLEMENT", card="membership.entitlement membership.validity")
T("training", "Individual personal-training session", S + " wellness", "APPOINTMENT FIELD_VISIT", card="wellness.modality service.duration")
T("group_training", "Group personal-training session", "session wellness price schedule request", "SESSION_CAPACITY", card="session.activity session.capacity")

T("reservation_assistance", "Restaurant or venue reservation assistance", "coordination " + Q, "REQUEST_QUOTE", card="coordination.task coordination.limits", note="The coordinator submits a request; the venue remains the booking authority.")
T("personal_assistance", "Personal administration or errands request", "coordination " + Q, "REQUEST_QUOTE", card="coordination.task coordination.limits")
T("shopping_assistance", "Shopping or sourcing assistance request", "coordination " + Q, "REQUEST_QUOTE", card="coordination.task coordination.limits")
T("gift_sourcing", "Gift sourcing and presentation request", "coordination gift " + Q, "REQUEST_QUOTE", card="coordination.task gift.presentation")
T("travel_planning", "Travel planning assistance request", "coordination " + Q, "REQUEST_QUOTE", card="coordination.task coordination.limits", note="Provider assistance does not itself confirm travel documents, accommodation or tickets.")
T("property_coordination", "Property access or maintenance coordination", "coordination " + Q, "REQUEST_QUOTE", card="coordination.task coordination.limits")
T("moving_coordination", "Moving assistance or coordination request", "coordination moving " + Q, "REQUEST_QUOTE", card="moving.scope moving.load")
T("cleaning_coordination", "Cleaning supplier coordination request", "coordination cleaning " + Q, "REQUEST_QUOTE", card="coordination.task cleaning.tasks")
T("vip_assistance", "Priority or VIP coordination request", "coordination " + Q, "REQUEST_QUOTE", card="coordination.task coordination.limits", note="Priority describes agreed response/service scope, not an unconditional supplier confirmation.")
T("concierge_visit", "Explicit concierge execution visit", S + " coordination", "FIELD_VISIT", card="coordination.task service.duration", note="Only when selected execution scope, travel, staff and resources are actually confirmed; separate from the initial request.")
T("assistance_plan", "Concierge retainer or assistance plan", "membership coordination price request", "ENTITLEMENT", card="membership.entitlement membership.validity")
T("sea_freight", "Sea freight or container service", "freight cargo_intake price", "FREIGHT", card="freight.route freight.units")
T("air_freight", "Air cargo service", "freight cargo_intake price", "FREIGHT", card="freight.route freight.units")
T("road_freight", "Road freight or truck-load service", "freight cargo_intake price", "FREIGHT", card="freight.route freight.units")
T("storage", "Warehouse storage and handling service", "storage cargo_intake price request", "STORAGE", card="storage.unit storage.period")

# Explicit merchant-specialty bindings. These suggest supported templates; they do not assert stock or activate capabilities.
B("adult_products", "intimate_device intimate_wellness_product adult_accessory", "Separate devices, consumable care products and accessories; each keeps its own materials, contents and applicable eligibility policy.")
B("adult_wellness", "adult_wellness_service intimate_wellness_product intimate_device", "Distinguish a consultation/visit from a packaged product. Personal suitability and session information remain private.")
B("cigarettes", "cigarettes", "Pack versus carton and exact labelled variant determine count and price; merchant category alone never supplies eligibility approval.")
B("cigars", "cigar", "Capture cigar format, box count and declared origin/dimensions; keep product descriptors separate from health claims.")
B("vapes", "vape_device vape_refill", "A device and a refill need different component, power, composition and compatibility details.")
B("adult_accessories", "adult_accessory intimate_device", "Capture actual material, dimensions, compatibility and contents; powered items additionally need charging specifications.")

B("airport_pickup", "airport_transfer airport_greeting", "Pickup needs airport/arrival meeting rules and private flight/party details. Greeting-only must be selected explicitly and remains separate from transport.")
B("airport_dropoff", "airport_transfer", "Drop-off uses the actual pickup area, airport, departure timing and luggage capacity; do not copy arrival-only meeting assumptions.")
B("meet_greet", "airport_greeting airport_transfer", "Default scope can be greeter-only. A separately selected transport offering needs its own vehicle/driver guarantee and price.")
B("executive_transfer", "executive_transfer airport_greeting", "Publish actual vehicle class, service inclusions, waiting and extra-stop charges; greeting is a distinct optional offering.")

B("wine", "wine", "Wine-specific variety/style, origin, vintage where labelled, ABV, bottle volume and case count distinguish purchasable variants.")
B("spirits", "spirit", "Spirit type, declared age/style, ABV, bottle size and gift-set contents need separate values.")
B("beer", "beer", "Beer/cider style, container size, pack count and actual cold-delivery option are separate from product stock.")
B("champagne", "sparkling_wine", "Preserve actual product designation, origin, non-vintage/vintage state and bottle/case contents without inferred provenance.")
B("cocktail_mixers", "mixer alcoholic_mixer", "Determine whether the specific mixer contains alcohol. Non-alcoholic products must not automatically inherit an alcohol flag from merchant identity.")
B("liquor_stores", "wine spirit beer sparkling_wine mixer alcoholic_mixer", "Liquor Stores is a business identity. Choose a separate actual beverage template for every listing; gift packs retain component eligibility.")

B("mens_fashion", "shirt trousers shorts jacket suit knitwear activewear underwear sleepwear shoe belt hat scarf tailoring styling", "Each garment selects its construction and measurements. Tailoring production and styling appointments remain separate from stocked garments.")
B("womens_fashion", "dress shirt trousers skirt shorts jacket suit knitwear activewear underwear sleepwear shoe bag jewellery scarf tailoring styling", "Dresses require their own fit measurements by size; rings, bags and shoes use their own sizing/dimension rules rather than a clothing size label.")
B("kids_fashion", "kids_top kids_dress kids_bottom uniform shoe hat", "Height and actual garment measurements are more specific than an indicative age label. Uniforms declare garment construction and actual included pieces.")
B("shoes", "shoe", "Use the actual shoe-size system, foot/internal measurement basis, width and real size-colour combinations.")
B("bags", "bag", "Capture orientation-specific dimensions, materials, straps, compartments and confirmed capacity/device fit.")
B("watches", "watch smart_device", "Traditional watches use movement, case and wrist-fit details. Smart watches additionally need device, battery, ecosystem and compatibility information.")
B("accessories", "jewellery belt hat scarf", "Ring size, belt length, head circumference and scarf dimensions are different forms of fit; material/finish and pair/set contents remain explicit.")

B("makeup", "makeup_product beauty_tool makeup_service nail_service", "Separate product shade/finish choices from appointment/visit scope, artist time and included materials.")
B("skincare", "skincare_product skin_service beauty_tool", "Products need actual formulation/label details; consultation/treatment needs service scope, duration and provider instructions without inferred suitability.")
B("haircare", "hair_product hair_service beauty_tool", "Products capture formulation/quantity; styling captures technique, length/style choices and included extensions/materials where offered.")
B("fragrances", "fragrance", "Capture concentration, volume and actual bottle/refill/tester/set format; fragrance notes are descriptors, not a guaranteed duration.")
B("cosmetics_stores", "makeup_product skincare_product hair_product fragrance beauty_tool", "A multi-brand store chooses per-item templates; the store-level range is not a substitute for shade, formulation or pack details.")

B("car_rental", "car_rental self_drive", "Declare guaranteed vehicle versus class, seats/luggage, transmission, rental period, mileage, fuel, deposit/cover and optional driver requirements.")
B("self_drive", "self_drive", "Self-drive eligibility and handover terms are applicable policy references. Vehicle selection and exact interval drive actual allocation and total.")
B("corporate_rental", "extended_rental car_rental", "Corporate terms add billing/commitment, account requirements, replacement/maintenance support and exact authorized driver/usage scope.")
B("long_term_rental", "extended_rental self_drive", "Separate the allocation interval from billing/renewal periods; extended use and maintenance terms do not imply automatic renewal consent.")
B("bike_rental", "bike_rental", "Bicycle, e-bike and motorcycle need different fit/power/equipment details; all require actual handover, return and interval terms.")

B("concerts", "event_ticket", "Capture actual performance, venue, dated occurrence, ticket tiers, admission scope and capacity; booking and issued ticket remain distinct.")
B("festivals", "event_ticket session_pass", "Single-date and multi-day access need explicit entry/zone/re-entry scope. A pass is a separate entitlement if that model is added and reviewed.")
B("conferences", "conference_ticket event_space", "Delegate admission and venue/meeting-space hire are different offerings with different place/space allocations and inclusions.")
B("private_events", "event_planning event_space photography catering", "Planning, venue hire, photography and catering each need their own scoped offer; supplier-dependent work remains request/acceptance until configured.")
B("photography", "photography", "Shoot duration, travel, delivered image count/formats, editing, turnaround and usage rights must be explicit.")
B("workshops", "workshop session_pass", "Dated workshop places need curriculum, materials, prerequisites and real session capacity; a multi-session pass is separately defined.")
B("classes", "class session_pass", "A class occurrence and a bundle of credits are different records; recurring dates alone do not create membership or renewal consent.")
B("sports_activities", "sport session_pass", "Capture sport/level, actual group size, supplied equipment and prerequisites; a pass redeems against separately available occurrences.")
B("recreation", "recreation session_pass", "Admission duration, activity/age/height policy references where relevant, equipment and occurrence capacity need actual configured details.")

B("banking", "banking_enquiry", "Provider-approved account/service information and private appointment/enquiry intake; no account opening, credit or fund movement is implied.")
B("forex", "forex_enquiry", "Capture supported currency pairs, locations, provider fee/rate source and validity; indicative information is distinct from an executable quote.")
B("insurance", "insurance_enquiry", "Capture cover category, provider, approved scope/exclusions and quote/application handoff; listing a policy does not bind cover.")
B("payments", "payment_enquiry", "Show supported provider channels, applicable terms and activation/handoff scope; payment transaction authority stays with its owner.")
B("remittance", "remittance_enquiry", "Capture actual corridors/currencies, provider-approved fees/timing basis and private provider handoff; no invented delivery guarantee.")
B("sacco_services", "sacco_enquiry", "Describe membership and actual service eligibility through provider terms; a catalog listing is not a membership acceptance or loan approval.")
B("business_services", "business_enquiry", "Define the actual provider/professional task, documents needed through private intake and fee/appointment versus enquiry scope.")

B("flowers", "bouquet flower_plan", "Bouquets need varieties, size/stem count, fresh/preserved state and vase inclusions. A recurring plan defines deliveries and substitution/renewal rules separately.")
B("gift_hampers", "hamper custom_hamper", "A stocked hamper and a custom-curated hamper have different acceptance models; component contents, food labels and substitutions remain explicit.")
B("cakes", "custom_cake ready_cake", "Custom cake dimensions, servings, flavour, design proof and due-date acceptance differ from selling an already available cake or slice.")
B("chocolates", "chocolates", "Box contents, net quantity, declared ingredients/allergens and optional message/wrapping are independent product facts.")
B("personalized_gifts", "personalized_gift", "Capture actual item/size/material, supported artwork or text options, proof approval and production deadline; recipient/personal text stays private.")
B("occasion_gifts", "occasion_gift bouquet chocolates hamper", "Occasion is a discovery descriptor. The actual bouquet, confectionery, hamper or durable gift still needs its own specification template.")

B("restaurant", "dish pizza burger_sandwich meal_combo dessert coffee_tea mixer table catering", "Menu dishes and modifiers are orders. Table reservations need explicit supported space intent; catering is separate quoted event work.")
B("fast_food", "burger_sandwich pizza meal_combo dish dessert coffee_tea mixer", "Required meal choices, sides, sauces and add-ons have real compatibility, charges and availability; portion and combo contents stay visible.")
B("cafe", "coffee_tea bakery_item dish dessert juice mixer", "Drink sizes, base, milk/sweetness choices and relevant ingredients differ from pastries or dishes; seating claims do not enable table booking automatically.")
B("bakery", "bakery_item ready_cake custom_cake dessert", "Bread/pastry packs need contents and sizes; custom cakes additionally need design acceptance and feasible due commitments.")
B("desserts", "dessert ready_cake custom_cake chocolates", "Distinguish slice, whole item, scoop and volume/pack basis; frozen items need actual handling and supported fulfilment.")
B("juice_bar", "juice coffee_tea mixer", "Capture actual ingredients, volume and available sweetness/additions; no inferred detox, nutritional or medical claims.")
B("cloud_kitchen", "dish pizza burger_sandwich meal_combo dessert juice", "Delivery-only meals still need full portion, ingredients, required options and fulfilment constraints; do not invent a dine-in capability.")
B("catering", "catering", "Menu/headcount, staffing, equipment, venue, travel and time requirements shape the quote; submitted details alone do not reserve an event.")

GROCERY = "packaged_food dairy_eggs frozen_food produce meat seafood household personal_care baby_care baby_food baby_equipment supplement bouquet"
B("supermarket", GROCERY, "Broad retailers select per-item templates for food, household, personal-care and other actual ranges. Regulated or additional activities still need their own requirements.")
B("convenience_store", "packaged_food dairy_eggs frozen_food produce household personal_care mixer", "Classify the actual small-store range; pack sizes, storage conditions and label information vary by product.")
B("fresh_produce", "produce produce_box", "Loose versus packed quantity, ripeness/preparation and substitution rules matter; recurring boxes need entitlement and fulfilment terms separately.")
B("butchery", "meat packaged_food", "Capture species, cut, chilled/frozen state, bone/preparation options and fixed versus final weighed pricing.")
B("seafood", "seafood packaged_food", "Capture species, size/count/weight, preparation and actual cold state; supplier provenance claims require their source.")
B("organic_store", "produce packaged_food dairy_eggs personal_care household supplement", "Organic is a sourced/verified claim where applicable, not an automatic property of every listing in the store.")

B("laundry", "laundry", "Capture actual accepted garment/kg rates, processing choices, inspection and paired pickup/return feasibility; a collection slot is not a guaranteed return.")
B("dry_cleaning", "dry_cleaning", "Garment/material scope, care restrictions, stain assessment and damage terms matter; price changes after inspection need explicit acceptance.")
B("ironing", "ironing", "Press-only item types, counting/weight basis, packaging and collection/return timings differ from a full laundry service.")
B("home_cleaning", "home_clean cleaning_plan", "Bedrooms/rooms/area, tasks, surfaces, supplies, exclusions and private access shape the visit; recurring service benefits do not reserve every visit.")
B("office_cleaning", "office_clean cleaning_plan", "Commercial area/workload, work hours, access, equipment and recurring scope need explicit units and staff/travel capacity.")

B("home_living", "home_textile decor lighting furniture household", "Bedding and curtains need real fit/dimensions; decor, furniture and electrical fixtures need their own material/fit/installation details.")
B("furniture", "furniture installation", "Product configuration and assembled/access dimensions belong to the furniture listing. Assembly/installation is a separate selected field visit.")
B("appliances", "appliance installation", "Actual capacity, supply ratings, dimensions, connection/clearance requirements and installation inclusions determine suitability.")
B("decor", "decor lighting home_textile", "Decor dimensions, mounting/material and actual set contents differ from electrical fixtures and fitted textiles.")
B("kitchenware", "kitchenware appliance", "Capture pieces/capacity/material/heat-source compatibility; an electrical kitchen appliance additionally needs its actual electrical/capacity specifications.")
B("books", "book special_book custom_publication", "Separate a stocked edition, sourcing an existing publication and custom printing/binding; identifier, edition, format and delivery model differ.")
B("stationery", "stationery personalized_gift", "Paper size/grammage/ruling and instrument/refill details are specific to each item. Personalized printing is an additional production activity to review.")
B("office_supplies", "stationery office_consumable furniture appliance computer tech_accessory", "An office supplier may list paper, ink, furniture and devices; choose exact product/compatibility templates rather than one office-item description.")
B("general_retail", "packaged_food household personal_care home_textile decor furniture appliance kitchenware book stationery office_consumable shirt dress trousers skirt shoe bag watch jewellery tech_accessory smartphone computer audio baby_care baby_equipment", "This is a broad merchant identity, not a generic product schema. Supported cross-category listings retain their actual specifications and applicable activity requirements.")

B("pharmacy_retail", "medicine medical_supply supplement personal_care baby_care baby_food", "Medicines use approved label/dispensing references, supplies use fit/compatibility, and retail care products use actual contents. No personal treatment or dosage advice is generated.")
B("medical_supplies", "medical_supply", "Equipment and consumables need actual dimensions/sizes, pack quantities, manufacturer use/compatibility, sterility/reuse labels and applicable verification references.")
B("baby_products", "baby_care baby_food baby_equipment baby_plan kids_top kids_bottom", "Diapers, feeding products, food, equipment and clothing need different fit/label/specification fields; age/weight guidance is not interchangeable with garment measurements.")
B("supplements", "supplement", "Use labelled ingredient amounts and serving basis, actual form/quantity and approved cautions; never infer benefits or customer suitability.")

B("clinics", "clinic", "Public service scope and authorized practitioner details stay separate from private patient administration and clinical records. Home visits require explicit supported method.")
B("telemedicine", "telemedicine", "Remote format, exact session scope/duration, provider profile and private access process; no fictitious physical room or public session link.")
B("labs", "lab_test", "Test/panel contents, approved collection/preparation instructions and turnaround estimate are public; patient identity, referrals and results remain private.")
B("mental_health", "therapy", "Public modality/service format and practitioner information; personal history, diagnosis and session notes do not enter the public catalog or generic merchant notes.")
B("coaching", "coaching group_coaching session_pass", "Individual appointment, actual group occurrence and a recurring/multi-session entitlement are separate offers; group capacity and plan benefits must not be conflated.")

B("smartphones", "smartphone tech_accessory device_repair", "Actual storage/RAM/model/network and refurbished-condition details belong to products; diagnostics/repair use a separate assessed job.")
B("tech_accessories", "tech_accessory", "Cases, cables, chargers and peripherals need exact compatible model/protocol, dimensions and named ratings, not a generic compatible label.")
B("computers", "computer monitor tech_accessory device_repair", "CPU, memory/storage, graphics and display/ports differ by configuration. Repair and upgrades need their own scope and acceptance.")
B("gaming", "console game tech_accessory", "Hardware, software edition and peripherals have different region/platform/compatibility and inclusion details; digital delivery needs explicit rights and support.")
B("audio", "audio tech_accessory", "Capture actual audio form, interfaces, named rating methods, battery features and included accessories; no guessed compatibility or runtime.")
B("telecom_services", "telecom_plan network_device telecom_support", "Plan allowance/validity/activation, hardware specifications and diagnostic/setup work are different offerings and provider-confirmed outcomes.")
B("smart_devices", "smart_device installation", "Ecosystem/network/power/account requirements and recurring features belong to the device. Site installation is a separate visit with its own scope.")

B("safaris", "safari", "Itinerary/nights, lodging/meals/fees, guide, transport, party model, departure capacity and actual supplier confirmation need explicit information.")
B("game_drives", "game_drive", "Departure/return, park route, private/shared seats, vehicle/guide, park fees and supplier/weather terms define the excursion.")
B("luxury_safaris", "luxury_safari", "Named lodging, transfers/flights and premium inclusions must be actual contracted scope; a luxury label does not confirm supplier inventory.")
B("city_tours", "city_tour", "Stops, walking/driving mode, actual duration, guide languages, access and inclusions are distinct customer decisions.")
B("cultural_tours", "city_tour", "State the actual cultural sites/activities, guide/language, access arrangements, inclusions and applicable respectful-visit/provider instructions.")
B("adventure_tours", "adventure_tour", "Capture actual activity, duration, difficulty description, equipment, provider prerequisites and weather/change policy without inventing suitability advice.")
B("travel_packages", "travel_request safari city_tour", "Package sourcing is a request. Fully published supplier-confirmable itineraries use a separately reviewed tour activity; do not promise instant flights or hotels.")

B("car_wash", "car_wash mobile_wash wash_plan", "Workshop job, mobile visit and subscription/pass are separate options. Vehicle class, tasks, consumables, time and location determine scope and price.")
B("tire_service", "tire_job mobile_tire tire_product", "Tyre dimensions/load/speed/condition and vehicle fitment differ from labour scope. Standalone product sales require a separate reviewed order activity.")
B("battery_service", "battery_job mobile_battery battery_product", "Preserve named voltage/capacity/start-rating methods, terminal fitment, core exchange and warranty. Workshop, mobile and retail modes are separate.")
B("vehicle_assistance", "roadside", "Actual incident task, vehicle/route limits, distance charges and response estimate need explicit dispatch acceptance; availability is not implied by a 24-hour claim.")
B("vehicle_inspection", "inspection", "Inspection scope, report/deliverables, supported vehicle type, duration and workshop/mobile method must be stated; no statutory approval is implied.")

B("spa", "spa wellness_plan personal_care", "A treatment, a plan and a take-home product use different capture and selection flows. Products are a proposed retail addition where that activity is not yet profiled.")
B("massage", "massage personal_care", "Session modality, duration, supported provider/location preferences and included products need actual configuration; take-home retail is separately reviewed.")
B("gym", "gym_membership training class", "Membership benefits, personal-training appointments and dated group classes are distinct. Group session capacity needs its own reviewed activity if added.")
B("personal_training", "training group_training session_pass", "Private appointment/visit, group session and pass/credit plan have different duration/capacity/redemption requirements.")

B("reservations", "reservation_assistance concierge_visit", "Capture venue preferences, party/date requests and response scope; venue confirmation remains authoritative. A selected execution visit is separate.")
B("personal_assistance", "personal_assistance concierge_visit assistance_plan", "Define the precise administrative/errand task, included effort, authorized spending and exclusions; a retainer benefit is not a scheduled visit.")
B("shopping_assistance", "shopping_assistance concierge_visit", "Private request records item specifications, budget, alternatives and approval limits; coordination fees are separate from purchased goods.")
B("gift_sourcing", "gift_sourcing concierge_visit", "Capture desired actual gift specifications, recipient preferences and approved budget privately; sourcing confirmation and delivery are separate milestones.")
B("travel_planning", "travel_planning concierge_visit", "Capture actual planning/handoff service scope. Private travel/document details use authorized intake; assistance is not a visa/ticket/insurance approval.")
B("property_coordination", "property_coordination concierge_visit", "Describe coordination deliverables and supplier approval; access codes, exact private addresses and keys remain restricted request/execution information.")
B("moving_assistance", "moving_coordination concierge_visit road_freight", "Moving coordination needs private inventory, route and access assessment. Actual trucking is a separate proposed freight activity with its own carrier acceptance.")
B("cleaning_coordination", "cleaning_coordination concierge_visit assistance_plan home_clean", "Supplier coordination, actual confirmed cleaning visit and retainer benefits are separate; do not duplicate a supplier visit through automatic child creation.")
B("vip_assistance", "vip_assistance concierge_visit assistance_plan", "Actual priority response scope, included effort, dedicated support and authorization limits are explicit; third-party supplier promises remain unconfirmed until accepted.")

B("sea_freight", "sea_freight", "Sea route, container/consolidated load basis, port/door legs, piece dimensions, carrier charges and clearance/insurance scope need explicit intake and quote.")
B("air_freight", "air_freight", "Air route, piece constraints, actual carrier chargeable-weight rule, collection/delivery legs and acceptance/quote validity are required; no guessed volumetric factor.")
B("road_freight", "road_freight", "Truck/load type, route, pieces/dimensions/weight, loading/access and included legs determine the actual accepted freight service.")
B("warehousing", "storage", "Storage unit dimensions/capacity, environment, accepted goods, period, handling and custody/access rules differ from available capacity and stock ownership.")

# Refine forms that share measurements but have different construction or component choices.
G("garment_scope", "Garment construction and pieces", """
construction|Garment construction|enum|P|details|Upper body, lower body, dress/full-body or explicitly listed set. This selects relevant measurement groups.
pieces|Included garments and size selection|component_table|when a set or coordinated outfit is sold|options|Keep each piece's fit chart and valid set combinations; a jacket size does not determine a trouser size.
""")
G("fitted_underwear", "Fitted underwear and bra measurements", """
kind|Actual garment type|enum|P|details|Brief, bra, bodysuit or other actual construction selects the relevant fit fields.
band|Underbust or band measurement and system|length_or_range|when a band-sized garment is sold|size_guide|State unit, body/garment basis and the merchant's named system.
cup|Cup labels and bust fit guidance|size_system|when cup sizing is used|options,size_guide|Cup systems are not universally equivalent; link actual band/cup combinations and known guidance.
bust|Bust range by actual band/cup combination|length_or_range|when supplied for fit guidance|size_guide|Explicit units and measurement basis; never calculate a cup from an unverified conversion.
waist_hips|Waist and hip fit by size|measurement_chart|when a lower-body garment is sold|size_guide|Separate waist and hips, units and basis; record actual combination-specific values.
""", scope="variant_size")
G("cable", "Cable connectors and ratings", """
ends|Connector at each end|connector_pair|P||Exact connector types/gender and relevant protocol/version.
length|Cable length|length|P|card,specifications|Explicit length unit.
ratings|Supported power, data and video specifications|technical_specs|P||Named actual manufacturer-supported rates and units; connector shape alone does not imply a capability.
""")
G("charger", "Charger output and supply", """
input|Input voltage, frequency and plug|electrical_specs|P||Actual input ratings and plug type.
outputs|Port output profiles and shared-power limit|power_profile_table|P|card,specifications|Per-port voltage/current/power and charging protocol; distinguish combined maximum from per-port maximum.
contents|Included cable and compatible protocols|text_list|P|details|A cable is included only when explicitly stated; source compatibility rather than guessing.
""")
G("powerbank", "Power-bank capacity and ports", """
capacity|Rated capacity and measurement basis|electrical_capacity|P|card,specifications|mAh/Wh with rated voltage where needed; distinguish cell capacity from delivered output and never invent runtime.
ports|Input/output profiles and supported protocols|power_profile_table|P||Actual ports and labelled ratings with units.
size|Dimensions and weight|dimensions|P||Explicit units; carrier eligibility remains an applicable policy decision, not a catalog inference.
""")
G("case", "Case and protector physical fit", """
fit|Exact compatible device models|reference_list|P|card,specifications|Model/generation/size, cutouts and connector/camera clearance where relevant.
construction|Material, coverage and included pieces|text_list|P||Case, screen protector or other protection type and actual contents.
features|Mounting, charging and stand compatibility|text_list|O||Only confirmed compatibility and product claims.
""")
T("cable", "Cable or adapter", P + " durable accessory_tech cable", card="cable.ends cable.length")
T("charger", "Mains or vehicle charger", P + " durable accessory_tech charger", card="charger.outputs")
T("powerbank", "Power bank", P + " durable accessory_tech powerbank", card="powerbank.capacity")
T("phone_case", "Device case or screen protector", P + " durable accessory_tech case", card="case.fit case.construction")
for specialty in ("smartphones", "tech_accessories", "computers", "office_supplies", "general_retail"):
    BINDINGS[specialty]["templateIds"].extend(["cable", "charger", "powerbank", "phone_case"])

# Conditions are documented planning predicates, not executable category-supplied rules.
for key in ("activewear", "sleepwear", "uniform", "kids_bottom", "suit"):
    TEMPLATES[key]["groups"].append("garment_scope")
    if key in ("activewear", "sleepwear", "uniform"):
        TEMPLATES[key]["groups"].append("dress")
    TEMPLATES[key]["groupApplicability"] = {
        "shirt": "garment_scope.construction includes an upper-body piece",
        "bottom": "garment_scope.construction includes a lower-body piece",
        "dress": "garment_scope.construction includes a dress or full-body piece",
    }
TEMPLATES["underwear"]["groups"] = ["common"] + (P + " apparel fitted_underwear").split()
TEMPLATES["underwear"]["note"] = "Use actual garment construction and band/cup or lower-body size combinations; return/hygiene terms are explicit applicable policy references."
TEMPLATES["ready_cake"]["excludedFields"] = ["cake.due", "cake.design"]
TEMPLATES["hamper"]["groupApplicability"] = {"food": "the hamper includes food components"}
TEMPLATES["custom_hamper"]["groupApplicability"] = {"food": "the hamper includes food components"}
TEMPLATES["network_device"]["groupApplicability"] = {"telecom": "a provider plan is explicitly bundled with the hardware"}
TEMPLATES["smart_device"]["groupApplicability"] = {"device": "the relevant display, processor, memory or battery component exists"}
for key in ("jewellery", "belt", "hat", "scarf"):
    TEMPLATES[key]["fixedValues"] = {"accessory.kind": key}
TEMPLATES["self_drive"]["fixedValues"] = {"rental.driver": "self_drive"}
TEMPLATES["telemedicine"]["fixedValues"] = {"health_service.format": ["remote"], "service.methods": ["remote"]}
TEMPLATES["skirt"]["excludedFields"] = ["bottom.inseam", "bottom.rise"]

# Scope of chart measurements is explicit; construction does not vary merely because a size changes.
for key in ("dress.neckline", "dress.closure", "dress.sleeve_style", "dress.lining", "dress.opacity", "shirt.collar", "shirt.sleeve_style", "shirt.fastening", "fitted_underwear.kind"):
    group_key = key.split(".")[0]
    next(f for f in GROUPS[group_key]["fields"] if f["id"] == key)["scope"] = "offering"
next(f for f in GROUPS["restricted"]["fields"] if f["id"] == "restricted.verification")["ownerDataClass"] = "verification"
next(f for f in GROUPS["medical_supply"]["fields"] if f["id"] == "medical_supply.evidence")["ownerDataClass"] = "verification"
next(f for f in GROUPS["fulfilment"]["fields"] if f["id"] == "fulfilment.coverage")["ownerDataClass"] = "service_areas"

# Shared chart concepts have one field definition; usage conditions can narrow their applicability.
FIELD_ALIASES = {"bottom.waist": "dress.waist", "bottom.hips": "dress.hips"}

CUSTOMER_DESTINATIONS = {
    "card": "Browse/search card summary",
    "details": "Offering detail page description and inclusions",
    "specifications": "Labelled specification section",
    "options": "Customer option or variant selector",
    "size_guide": "Size guide and measurement chart",
    "pricing": "Selected price and itemized charges",
    "terms": "Applicable terms before commitment",
    "fulfilment": "Delivery, pickup, visit or access information",
    "schedule": "Supported date, time, duration and capacity selection",
    "request_form": "Private customer order, booking or enquiry input",
    "internal": "Authorized merchant/system view only",
}

MODEL_SCHEMA = {
    "ORDER": "PRODUCT_CATALOG_V1", "APPOINTMENT": "SERVICE_APPOINTMENT_V1",
    "FIELD_VISIT": "FIELD_SERVICE_V1", "ASSET_INTERVAL": "RENTAL_ASSET_V1",
    "TRANSFER": "TRANSFER_ROUTE_V1", "SESSION_CAPACITY": "GROUP_SESSION_V1",
    "SPACE_RESERVATION": "SPACE_RESERVATION_V1", "TOUR": "TOUR_PACKAGE_V1",
    "PRODUCTION_DUE": "MADE_TO_ORDER_V1", "REQUEST_QUOTE": "REQUEST_QUOTE_V1",
    "LINKED_WINDOWS": "PICKUP_RETURN_V1", "SERVICE_JOB": "SERVICE_JOB_V1",
    "ENTITLEMENT": "MEMBERSHIP_PLAN_V1", "FREIGHT": "FREIGHT_SHIPMENT_V1",
    "STORAGE": "STORAGE_SPACE_V1",
}

MODEL_ACTIONS = {
    "ORDER": "Choose the actual variant and quantity, review fulfilment and total, then place an order through its authority.",
    "APPOINTMENT": "Choose service, method and eligible time; show the configured booking/request/walk-in outcome accurately.",
    "FIELD_VISIT": "Provide private service location and scope, then choose or request a feasible visit; confirmation needs team/travel capacity.",
    "ASSET_INTERVAL": "Choose actual start/end, handover places and extras; show total and confirm required asset/driver allocation.",
    "TRANSFER": "Enter the actual route, time and party details; confirm only after the selected trip or greeter resources are secured.",
    "SESSION_CAPACITY": "Choose an actual dated occurrence, tier and place quantity against the same capacity pool.",
    "SPACE_RESERVATION": "Choose a party size and compatible actual space/time; confirm only after allocation and policy checks.",
    "TOUR": "Choose a published departure and party options; supplier-dependent availability remains requested until confirmed.",
    "PRODUCTION_DUE": "Submit exact customization and desired due date; obtain scope, price/proof and production acceptance.",
    "REQUEST_QUOTE": "Submit a private request or provider handoff; clearly show pending response rather than a confirmed reservation.",
    "LINKED_WINDOWS": "Declare actual workload and choose feasible collection/return promises with assessment rules where needed.",
    "SERVICE_JOB": "Request diagnostic/intake work, review assessment and explicitly accept the actual job and charges.",
    "ENTITLEMENT": "Review benefits, validity and renewal terms, enroll through its authority, then book/redeem actual services separately.",
    "FREIGHT": "Provide actual cargo and route, receive a valid carrier quote, accept terms, then obtain freight confirmation.",
    "STORAGE": "Declare goods, unit and period; receive compatible capacity/custody acceptance before storage is confirmed.",
}

# Value shapes describe the fields inside compound controls. They are design specifications, not runtime schemas.
VALUE_TYPES = {}
for line in """
text|Labelled text entry|String with a meaning-specific length/format rule; blank and not provided remain distinguishable.
text_list|Repeated labelled text entries|Ordered text values with source/provenance where relevant.
enum|Single choice|One reviewed named option; unknown and not applicable are distinct from false.
enum_list|Multiple choices|Actual reviewed options, with no automatic feature or capability activation.
reference|Existing record or registry selection|Stable scoped reference, source, version and authorized label projection.
reference_list|Multiple existing-record selections|Distinct stable scoped references; no arbitrary foreign-business records.
media_list|Media picker with captions|Media reference, accessible description, order and applicable variant reference.
quantity|Number with unit and basis|Exact decimal string or integer, named unit, precision, basis and optional pack count; no unitless physical measures.
quantity_list|Named measurements with units|Separate named quantities such as RAM/storage or weight/count; each has its own unit and meaning.
dimensions|Dimensions and orientation|Separate named length/width/height/depth/diameter/mass as applicable, each with explicit units and measurement basis.
length|Length with unit|Exact value and length unit, with endpoints/method where needed.
length_or_range|Length or adjustable range|Exact value or minimum/maximum, length unit, measurement basis and method; no guessed size conversions.
range|Explicit labelled range|Minimum/maximum and named basis; dates, ages, size labels and physical measures are not interchangeable.
range_with_unit|Range with unit|Minimum/maximum, unit and basis; unknown and open-ended need explicit representation.
percentage|Percentage|Exact declared value and percentage basis; constrain to the applicable meaningful range.
count_or_range|Count or count range|Integer count/minimum/maximum with named subject such as people or pieces.
duration|Duration and unit|Exact amount and unit, plus estimate/firm distinction; calendar periods remain distinct from elapsed minutes.
duration_or_assessment|Duration or assessment-required|Exact declared duration/estimate with unit, or explicit pending assessment; no invented available slot.
money_or_quote|Price entry or quote-only state|Integer amount_minor plus currency and price basis, or explicit quote-only; display a starting price as a starting price.
policy_reference|Applicable versioned policy|Scoped policy reference and approved public summary; current and accepted historical versions remain distinguishable.
charge_table|Charge rule rows|Named charge, amount/currency, unit/basis, condition, inclusion/exclusion and pricing authority reference.
variant_table|Actual option combinations|Stable variant reference, exact selected option values, specification overrides and owner references for price/stock; no assumed Cartesian product.
option_group_table|Required/optional customer choices|Group label, stable choice IDs, minimum/maximum selections, compatibility, price effects and actual availability.
component_table|Included component rows|Stable item/component reference or exact description, quantity/unit, included option, substitution policy and linked requirements.
material_list|Material/composition entries|Material, component location, known proportion/basis and source; unknown composition is not fabricated.
size_system|Named size labels and system|Exact merchant labels/system plus chart reference; no automatic equivalence between brands or systems.
measurement_basis|Measurement instructions and unit|Body versus garment, circumference versus flat width, named unit, endpoints and measurement method.
measurement_chart|Measurement rows by actual size|Versioned chart, exact size/variant/piece references, named measurement columns, value/range, unit, basis and applicability.
stock_reference|Read from stock owner|Variant/location/unit reference, authoritative state, freshness and explicitly unknown/disabled state; no local invented quantity.
coverage_reference|Coverage-owner projection|Supported method, location/area reference, eligibility result and freshness.
resource_reference|Eligible resource projection|Actual eligible provider/asset reference and permitted public label, distinct from its private master record.
availability_reference|Read from availability authority|Exact scoped offering/resource/occurrence constraints and available/unavailable/request-only/unknown state with freshness.
schedule_reference|Booking rule references|Scoped hours, exact duration, buffers, lead time/horizon and exceptions in Africa/Nairobi; underlying owner remains authoritative.
structured_request|Purpose-specific private request fields|Reviewed named fields, types, conditions and privacy; no undifferentiated public customer-notes blob.
contact_reference|Private customer/contact selector|Existing authorized contact reference and only necessary request-specific details.
customization_schema|Customization choices and private response form|Allowed text/media/measurements/options, compatibility and approval rules; actual personal text/uploads stay private.
verification_reference|Read from verification owner|Evidence reference, applicable review state and permitted public claim projection; uploading is not approval.
technical_specs|Named manufacturer specification rows|Specific reviewed key, typed value, unit/standard/rating method, compatibility and source; merchant extensions do not automatically become shared filters.
electrical_specs|Electrical rating fields|Applicable input/output voltage, current, power, frequency, connector, battery capacity and rating method, each distinct with unit.
camera_specs|Camera specification rows|Named camera/lens, resolution, sensor/lens features and source with units where relevant.
display_specs|Display fields|Diagonal and unit, pixel width/height, panel type, refresh rate and supported interfaces; actual configured values only.
rating_table|Published rating rows|Rating value, scale/method, unit and source/version; unlike rating systems cannot be compared silently.
condition_report|Condition and refurbishment disclosures|Actual grade definition, defects, replaced parts and measured condition where supplied; private serial data excluded.
connector_pair|Connector endpoints|Named connector/gender at each end and actual supported version/protocol.
power_profile_table|Port and power profiles|Port ID/type, direction, voltage/current/power, supported protocol and shared versus per-port maximum, with units.
electrical_capacity|Battery capacity and basis|Rated capacity value/unit, relevant rated voltage, cell-versus-output basis and source; no invented delivered runtime.
labelled_product_specs|Structured product-label facts|Exact identity/form, ingredient or strength value/unit/basis and pack quantity as applicable; no generated dosage or efficacy advice.
nutrition_table|Declared nutrition label rows|Nutrient, quantity/unit, per-serving/per-100-unit basis, serving quantity and authoritative label source.
secure_document_reference|Authorized private document upload/reference|Purpose, permitted document type and secure reference; never public raw content or generic merchant access.
asset_class_reference|Guaranteed asset or class selection|Guaranteed specific asset versus class, promised features, or-similar policy and actual resource-allocation reference.
capacity_table|Separate capacity limits|Named limit such as seats/bags/people, value/unit, dimensions/assumptions and actual applicable configuration.
distance_policy|Mileage allowance and extras|Unlimited or allowance value/distance unit/period, excess charge/currency/basis and applicable policy version.
deposit_policy_reference|Deposit terms reference|Applicable amount/currency or approved calculation, collection/release timing, conditions and authority.
interval_policy|Start/end and interval rules|Local date versus timed instant, end-exclusive semantics where applicable, minimum/maximum, buffers and charging/late policy.
location_option_table|Handover/return choices|Permitted place references, directions, time restrictions and additional charges; exact private customer places remain private.
duration_policy|Time allowance and extra-time charges|Included time/unit, trigger, excess-time charge/currency/basis and approved terms.
location_request|Private address or route entry|Purpose-specific private coordinates/address/access details and service-area eligibility; no public listing exposure.
date_time_selection|Customer date or time selection|Explicit local date or offset-bearing instant, interval endpoints and Africa/Nairobi display; feasibility rechecked by owner.
capacity_request|Customer party and capacity inputs|People, bags, child/accessibility/equipment preferences and units, checked against actual compatible capacity.
location_reference|Public venue/place projection|Permitted public venue identity, location, access and accessibility facts from their owner.
session_reference|Actual dated occurrence references|Occurrence ID, local/offset-bearing start/end, venue, actual capacity and source freshness.
ticket_option_table|Ticket tiers and admission choices|Tier/zone/seat choice, occurrence, included access, quantity limits, price reference and shared inventory/capacity allocation.
deliverable_table|Deliverables and acceptance rows|Output, quantity/unit, format, turnaround, revision scope and rights reference.
inclusion_table|Included/excluded scope rows|Named component, included/excluded/optional state, quantity/unit, fee reference and supplier confirmation dependency.
entitlement_table|Plan benefits and redemption rules|Benefit, credit/access/delivery unit, quantity/period, limits and linked booking/order workflow; no automatic reservations.
period_policy|Validity, billing and renewal terms|Exact dates/calendar period or elapsed duration, unit, minimum term, expiry and explicit renewal/charge consent policy.
itinerary_table|Ordered itinerary steps|Day/local date/timed milestone, stop/activity, travel/overnight scope, inclusions and actual supplier references.
task_table|Task/checklist scope|Named included/excluded/optional tasks, workload/unit, deliverable and assessment/acceptance rule.
item_rate_table|Item/weight processing price rows|Item/care category, count/weight unit, price reference, applicable minimums and assessment adjustment policy.
linked_window_reference|Paired processing and fulfilment promises|Collection window, workload/processing constraints, feasible return window and actual authority/acceptance state.
business_reference|Public provider identity|Actual business identity and permitted verification projection; no invented approved badge.
intake_schema|Private customer-input form definition|Named input, type, required condition and purpose/access rule; actual responses live privately in the transaction.
route_table|Supported route and leg rows|Origin/destination zones/ports, included legs, mode, estimate/firm status and authoritative service coverage.
charge_basis|Freight or service charge measures|Unit such as kg/m3/container, minimums, rounding and carrier-approved conversion rule/source; never invent a divisor.
cargo_dimension_table|Per-piece shipment measurements|Piece ID/count, length/width/height and gross mass with units; actual volume/chargeable mass derives through approved carrier rules.
storage_capacity|Storage capacity and unit fit|Unit type, usable dimensions/height, area/volume/pallet quantity and constraints with units; separate allocated and free capacity.
""".strip().splitlines():
    key, control, shape = line.split("|", 2)
    VALUE_TYPES[key] = dict(id=key, merchantControl=control, valueShape=shape)

VALUE_TYPES["capacity_reference"] = dict(id="capacity_reference", merchantControl="Actual shared capacity reference", valueShape="Occurrence/resource pool, unit, permitted quantities and actual authoritative availability; visible group-size limits are separate from free places.")

ENUM_VALUES = {
    "sale.condition": ["new", "used", "refurbished", "not_applicable"],
    "price.basis": ["fixed", "per_unit", "variant", "time_period", "per_person", "package", "starting_estimate", "quote_only"],
    "stock.mode": ["internal", "external", "hybrid", "disabled"],
    "apparel.stretch": ["no_stretch", "stretch", "adjustable", "not_provided"],
    "garment_scope.construction": ["upper_body", "lower_body", "dress_or_full_body", "set"],
    "flowers.state": ["fresh", "dried", "preserved"],
    "protein.state": ["fresh", "chilled", "frozen", "not_provided"],
}

REVIEW_DECISIONS = [
    dict(id="D01", issue="Mandatory publication fields", proposal="The published/conditional/optional labels are proposed completeness requirements. Validate them with representative merchants and the existing readiness policy owner before runtime enforcement."),
    dict(id="D02", issue="Missing size and measurement data", proposal="Preserve unknown values and allow drafts. Do not infer measurements from M/L or cross-system size conversion. Review whether a specific item may publish with a visible incomplete size guide or must complete it first."),
    dict(id="D03", issue="Offering hierarchy and further types", proposal="The named types are a curated initial catalogue across every current specialty, not every conceivable future SKU. Add a specific template or reviewed typed extension when the actual item needs different fields."),
    dict(id="D04", issue="Shared charts and policies", proposal="Pin versions and show affected listings before applying a shared update. Choose explicit item/variant/location overrides and preserve accepted historical facts."),
    dict(id="D05", issue="Additional business activities", proposal="Review every generated model-extension row against the effective profile resolver and requirements. A suggested new offering never activates an unsupported workflow, grants permission or establishes capacity."),
    dict(id="D06", issue="Regulated content and sensitive intake", proposal="Use approved provider/manufacturer information and policy/verification owners for pharmacy, health, financial and restricted goods. Define exact applicable requirements during implementation without inventing thresholds or claims in the mapping."),
    dict(id="D07", issue="Import and legacy compatibility", proposal="Map source attributes and preserve IDs, relationships and private values. Missing fields stay unresolved; legacy descriptions cannot reliably supply measurements, compatibility, clinical or financial facts."),
    dict(id="D08", issue="Pricing and money migration", proposal="The existing catalogue uses whole-KES fields while the NEXG contract summary calls for minor units and currency. Resolve the owner-approved mapping and rounding explicitly before any migration; this package performs none."),
    dict(id="D09", issue="Customer and merchant validation", proposal="Review real sample listings and task completion across every family. Automated coverage establishes mapping/reference consistency only, not correct provider terms, successful shopping or a working portal."),
]

# Category-by-category refinement of the shared registry. Generated artifacts remain views of these sources.
import fashion as _fashion
_fashion.apply(GROUPS, TEMPLATES, BINDINGS, G, T, P)
FASHION_SCREEN_DESIGN = _fashion.SCREEN_DESIGN

import specifications as _specifications
_specifications.apply(GROUPS, TEMPLATES, G)
VALUE_TYPES.update({
    "integer_or_range": dict(id="integer_or_range", merchantControl="Integer or declared integer range", valueShape="Known integer or explicit minimum/maximum and named meaning, such as model year; unknown values stay unknown."),
    "vehicle_body": dict(id="vehicle_body", merchantControl="Vehicle body style and doors", valueShape="Actual body-style descriptor and separate integer door count; class alternatives and guaranteed features are distinguished."),
    "gift_item_specs": dict(id="gift_item_specs", merchantControl="Actual gift item specification", valueShape="Specific base item type, material, named dimensions with units, actual included pieces and variant choices; personalization is separate.")
})
