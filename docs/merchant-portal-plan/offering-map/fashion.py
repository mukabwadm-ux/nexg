"""Fashion-specific authoring extension. Called once by definitions.py; no application code."""


def apply(groups, templates, bindings, G, T, product_groups):
    def field(key):
        return next(f for f in groups[key.split(".")[0]]["fields"] if f["id"] == key)

    G("fashion_identity", "Fashion listing identity and media", """
brand|Brand or maker|text|O|card,specifications|Named brand, independent maker or explicitly unbranded; never force an invented brand.
style|Style name or collection|text|O|details|Customer-recognizable style; merchant SKU stays with internal identity.
audience|Intended audience or fit range|enum_list|O|details|Merchant-described adult, child or unisex fit; the merchant specialty does not restrict who can buy.
condition|Condition details and disclosed defects|text_list|when used, refurbished or imperfect|details|Supplement the shared condition value with actual wear/defects and relevant photos.
photos|Colour-specific and detail photos|media_list|O|details,options|Associate actual colour views and relevant fabric/closure/defect details; do not infer specifications from photographs.
""")
    G("fashion_variants", "Size, colour and stock relationships", """
pattern|Pattern or print|enum_list|O|specifications,options|Named patterns map to actual variants if the purchased item changes.
chart|Reusable size chart reference and version|reference|when a shared chart is used|size_guide|Explicit accurate chart version; a material chart change previews affected listings.
measurements|Variant-specific measurement overrides|measurement_chart|when colour, batch or construction changes fit|size_guide|Scope each override to actual variant/piece; one size label does not imply identical measurements across all colours or suppliers.
sku|Internal variant SKU or supplier reference|text|when variants are tracked|internal|Internal reference distinct from public style name; retain stable variant IDs.
""", scope="variant")
    G("fashion_care", "Garment construction and care", """
silhouette|Silhouette or cut|enum|O|specifications|Distinct from fit allowance; examples describe the actual garment rather than guaranteed body fit.
care|Washing, drying and ironing guidance|text_list|O|details|Exact label/merchant instructions; text equivalents accompany any care icons.
finish|Construction details and functional features|text_list|O|specifications|Actual pockets, waistband, seams, padding or adjustments; unsupported performance claims are excluded.
""")
    G("bottom_extra", "Additional lower-body fit", """
leg_opening|Leg opening by size|length_or_range|when supplied for leg fit|size_guide|Explicit unit and circumference/flat-width basis; not applicable to a skirt.
thigh|Thigh fit by size|length_or_range|when supplied for leg fit|size_guide|Known measurement/range and method; do not derive it from hip measurement.
waistband|Waistband construction|enum|P|specifications|Fixed, elastic, adjustable or not provided; an adjustable waistband needs its actual known range for fit claims.
""", scope="variant_size")
    field("bottom_extra.waistband")["scope"] = "offering"
    G("dress_extra", "Dress style and fit details", """
length_style|Dress length style|enum|O|specifications|Mini, midi, maxi or actual merchant descriptor; numeric length remains in the size guide.
adjustments|Adjustable straps, waist or other fit features|text_list|when offered|specifications,size_guide|Explain what adjusts and include a known measurement range rather than promising universal fit.
slit|Slit or special construction detail|text|O|specifications|Relevant actual design details with measurements where useful.
""")
    G("shoe_extra", "Footwear shape and fit", """
shape|Toe shape and shoe style|enum|O|specifications|Actual footwear shape/style; sizes still use the named system.
closure|Fastening|enum|O|specifications|Laces, buckle, zip, slip-on or actual construction.
fit|Merchant fit notes|text|O|size_guide|Specific guidance such as width/instep allowance with its source; no automatic size recommendation.
care|Care and material-specific instructions|text_list|O|details|Use confirmed product instructions and accessible text.
""")
    G("bag_extra", "Bag construction and carrying options", """
kind|Bag type|enum|P|card,specifications|Handbag, backpack, travel bag or actual supported type selects relevant features.
straps|Strap drop and adjustable length|length_or_range|when relevant|specifications|Named measurement with unit and endpoints; handle drop is not total strap length.
features|Compartments, handles, wheels and closure|text_list|O|specifications|Only applicable actual features; distinguish included straps/locks from optional extras.
lining|Lining and care information|text_list|O|details|Actual lining/material and confirmed care instructions.
""")
    G("watch_extra", "Watch materials and physical fit", """
case_material|Case and glass materials|material_list|P|specifications|Materials are separate from the numeric case dimensions.
strap_material|Strap or bracelet material|material_list|P|specifications|Identify material, finish and replaceability where known.
wrist|Wrist fit range|length_or_range|when fit guidance is supplied|size_guide|Explicit wrist circumference range/unit and adjustable link/buckle scope.
strap_width|Strap width|length|when applicable|specifications|Known lug/strap width with unit; do not infer replacement compatibility.
care|Care, warranty and service information|text_list|O|details,terms|Confirmed product care; manufacturer rating alone does not imply a safe activity.
""")
    G("smartwatch", "Smartwatch-specific specifications", """
model|Exact smartwatch model and case version|text|P|card,specifications|Actual generation, case dimensions and promised model; not a generic smart-home device.
compatibility|Compatible phone systems and required app|reference_list|P|specifications|Actual supported versions, region/network limits and subscription needs where relevant.
display|Display type and size|display_specs|when supplied|specifications|Actual display dimensions/resolution with units where needed.
battery|Battery capacity and charging|electrical_specs|when supplied|specifications|Rated capacity, charging method and included charger; no invented runtime.
features|Confirmed connectivity and activity features|text_list|O|specifications|Manufacturer-described features; no inferred clinical accuracy or diagnosis.
""")
    G("ring", "Ring sizing and construction", """
system|Ring size labels and system|size_system|P|options,size_guide|Preserve the actual merchant system; no unverified international conversion.
fit|Internal diameter or circumference by size|measurement_chart|when supplied for fit|size_guide|Exact measurement meaning, unit and actual size row; adjustable rings state a known range.
width|Band width and setting dimensions|dimensions|when relevant|specifications|Separate band width from ring diameter; explicit units.
stone|Stone, setting and declared metal specification|text_list|O|specifications|Actual gemstone/plating/metal claims and source; do not infer authenticity or purity.
""")
    G("necklace", "Necklace length and pendant", """
length|Chain length and adjustment range|length_or_range|P|options,size_guide|Known chain length with units; do not confuse doubled chain length with wearing drop.
pendant|Pendant dimensions and included pieces|dimensions|when a pendant is included|specifications|Explicit units and whether a photographed pendant/chain is included.
clasp|Clasp and construction|enum|O|specifications|Actual fastening and construction.
""")
    G("bracelet", "Bracelet fit and fastening", """
fit|Wrist range or item length by size|length_or_range|P|options,size_guide|State body circumference versus item length and unit; adjustable range is explicit.
width|Bracelet width and charm dimensions|dimensions|when relevant|specifications|Explicit units and applicable dimensions.
clasp|Clasp or stretch construction|enum|O|specifications|Actual fastening/adjustment mechanism.
""")
    G("earring", "Earring dimensions and pieces", """
pieces|Single, pair or set contents|count_or_range|P|card,specifications|Actual included piece count; a photo of a pair does not establish that two are sold.
size|Drop, diameter and relevant dimensions|dimensions|P|specifications|Named measurements with units.
fastening|Post, hook, clip or other fastening|enum|P|specifications|Actual fastening and material where relevant; no inferred allergy/safety guarantee.
""")
    G("belt", "Belt size and adjustment", """
length|Belt length or wearer fit by size|measurement_chart|P|options,size_guide|Named measurement method, unit and size rows; total strap length differs from buckle-to-hole measurement.
width|Belt width|length|P|specifications|Explicit length unit.
adjustment|Hole range, trim-to-fit or adjustment|text|when adjustable|size_guide|Actual supported range and instructions.
buckle|Buckle and closure|text|O|specifications|Actual buckle material/type and whether interchangeable.
""")
    G("hat", "Headwear fit and dimensions", """
circumference|Head circumference range by size|length_or_range|P|options,size_guide|Body fit range and length unit; one-size requires actual guidance or an explicit not-provided state.
adjustment|Adjustment or stretch|text|O|size_guide|Actual mechanism and known range.
dimensions|Brim, crown or relevant dimensions|dimensions|when relevant|specifications|Named dimensions with explicit units.
""")
    G("scarf", "Scarf dimensions and finish", """
dimensions|Length and width|dimensions|P|specifications|Named dimensions and unit; distinguish fringe from body length where relevant.
finish|Edges, fringe and construction|text|O|specifications|Actual product construction and included pieces.
""")
    G("tailoring", "Tailoring and alteration scope", """
task|Made-to-measure, alteration or garment task|enum|P|card,details|Choose the actual garment and supported task; an assessment may precede price/due acceptance.
materials|Who supplies fabric and materials|enum|P|details,terms|Merchant-supplied, customer-supplied or agreed after assessment; state inclusions and extra charges.
measurement_method|Measurement or fitting method|enum_list|P|details,options|In-person fitting, submitted measurements or reference garment only if actually supported.
fittings|Included fittings, revisions and acceptance|policy_reference|when fittings or revisions apply|terms|Appointment scheduling is separately configured; do not invent a confirmed fitting from a production request.
""")
    G("fashion_intake", "Private tailoring information", """
measurements|Customer's personal measurements|measurement_chart|when necessary for the selected tailoring task|request_form|Private transaction data with explicit body/garment basis and units; never publish as a product size chart.
design|Customer design, garment or reference files|secure_document_reference|when needed to agree the work|request_form|Private purpose-limited attachments and approval; no raw personal files on public product pages.
""", scope="transaction", owner="work_items")

    field("watch.case")["label"] = "Case dimensions"
    field("watch.case")["guidance"] = "Case diameter, width and thickness as relevant, each with units; materials are captured separately."
    field("apparel.brand")["label"] = "Brand and style reference inherited from listing identity"

    fashion_rows = ("mens_fashion", "womens_fashion", "kids_fashion", "shoes", "bags", "watches", "accessories")
    fashion_ids = {t for key in fashion_rows for t in bindings[key]["templateIds"]}
    fashion_ids.discard("smart_device")
    for key in fashion_ids:
        template = templates[key]
        template["groups"].append("fashion_identity")
        if "ORDER" in template["modelIds"]:
            template["groups"].append("fashion_variants")
        if "apparel" in template["groups"]:
            template["groups"].append("fashion_care")
            template.setdefault("excludedFields", []).extend(["apparel.brand", "apparel.care"])
        if "bottom" in template["groups"]:
            template["groups"].append("bottom_extra")
            template.setdefault("groupApplicability", {})["bottom_extra"] = "a lower-body garment or lower-body piece is selected"
        if "dress" in template["groups"]:
            template["groups"].append("dress_extra")
            template.setdefault("groupApplicability", {})["dress_extra"] = "a dress or dress/full-body piece is selected"
    for key in ("shoe",):
        templates[key]["groups"].append("shoe_extra")
    templates["bag"]["groups"].append("bag_extra")
    templates["watch"]["groups"].append("watch_extra")
    templates["watch"].setdefault("excludedFields", []).append("watch.strap")
    for key in ("skirt",):
        templates[key].setdefault("excludedFields", []).extend(["bottom_extra.leg_opening", "bottom_extra.thigh"])
    templates["dress"]["cardHighlights"] = ["apparel.fabric", "apparel.fit"]
    templates["kids_dress"]["cardHighlights"] = ["apparel.fabric", "dress_extra.length_style"]
    templates["tailoring"]["groups"].extend(["tailoring", "fashion_intake"])
    templates["tailoring"].setdefault("excludedFields", []).append("apparel.brand")

    for key, label, specific in (
        ("ring", "Ring", "ring"), ("necklace", "Necklace", "necklace"),
        ("bracelet", "Bracelet", "bracelet"), ("earrings", "Earrings", "earring"),
    ):
        T(key, label, product_groups + " accessory fashion_identity fashion_variants " + specific,
          card="accessory.material", note="Use the actual jewellery type and its own dimensions/fit; preserve explicit set contents and source-backed material claims.")
        templates[key]["excludedFields"] = ["accessory.fit"]
        templates[key]["fixedValues"] = {"accessory.kind": "jewellery"}
    for key in ("belt", "hat", "scarf"):
        templates[key]["groups"].append(key)
        templates[key].setdefault("excludedFields", []).append("accessory.fit")
        templates[key]["cardHighlights"] = ["accessory.material"]
    T("smartwatch", "Smartwatch", product_groups + " watch watch_extra smartwatch fashion_identity fashion_variants",
      card="smartwatch.model smartwatch.compatibility")
    templates["smartwatch"]["excludedFields"] = ["watch.strap"]
    bindings["watches"]["templateIds"] = ["watch", "smartwatch"]
    bindings["accessories"]["templateIds"] = ["ring", "necklace", "bracelet", "earrings", "belt", "hat", "scarf"]
    bindings["womens_fashion"]["templateIds"] = [t for t in bindings["womens_fashion"]["templateIds"] if t != "jewellery"] + ["ring", "necklace", "bracelet", "earrings"]
    # The broad jewellery template remains available to general retail and further template review.
    templates["jewellery"]["note"] = "General jewellery entry is a review fallback; ring, necklace, bracelet and earring templates supply the specific fashion fields."


SCREEN_DESIGN = {
    "status": "DESIGN_FOR_REVIEW",
    "categoryId": "fashion_apparel",
    "merchantTabs": [
        {"id": "details", "label": "Details", "groups": ["Listing and photos", "Specific item and construction", "Size guide and measurements", "Colours and actual variants"]},
        {"id": "pricing", "label": "Pricing", "groups": ["Price basis", "Variant prices and applicable charges", "Accepted price/policy version"]},
        {"id": "availability", "label": "Availability", "groups": ["Stock by variant and branch", "Supported delivery or collection", "Tailoring/styling capacity only when offered"]},
        {"id": "preview", "label": "Customer preview", "groups": ["Browse card", "Product details", "Selected options and size guide", "Fulfilment and terms"]},
        {"id": "history", "label": "History", "groups": ["Changes, chart/policy versions and source conflicts"]}
    ],
    "customerSections": [
        {"id": "card", "label": "Browse card", "behavior": "Name, actual photo, selected meaningful highlights and accurately labelled price. Full measurement charts stay on the detail page."},
        {"id": "details", "label": "Product details", "behavior": "Accurate gallery and title, brand/maker, description and included pieces."},
        {"id": "specifications", "label": "Specifications", "behavior": "Group material, construction and item-specific facts using readable labels and units. Omit irrelevant fields."},
        {"id": "options", "label": "Choose size and colour", "behavior": "Only real combinations; retain an unavailable option with a clear reason where appropriate, never silently substitute."},
        {"id": "size_guide", "label": "Size guide and fit", "behavior": "Highlight the selected size row, with body/garment and circumference/flat-width basis. Explicit units and variant-specific overrides apply."},
        {"id": "pricing", "label": "Selected price", "behavior": "Update the actual selected variant price and quantities; separate supported extras and any estimate/quote-only state."},
        {"id": "fulfilment", "label": "Delivery or collection", "behavior": "Show actual location eligibility, lead time and permitted methods from their authority."},
        {"id": "terms", "label": "Care, returns and service terms", "behavior": "Display applicable care, returns, warranty or tailoring/styling terms before commitment."},
        {"id": "schedule", "label": "Service scheduling", "behavior": "Only relevant for actual styling/fitting appointments or configured production promises; product stock is separate."},
        {"id": "request_form", "label": "Private tailoring request", "behavior": "Customer measurements, reference uploads and contact details remain private transaction input."}
    ],
    "screenImpacts": [
        {"id": "SC_WORK", "file": "01-work.md", "effect": "Show accepted garment/variant, piece, colour/size and chart/policy snapshot; private tailoring inputs only to authorized staff. Preserve product orders versus fitting appointments and accepted production work."},
        {"id": "SC_OFFERINGS", "file": "02-offerings.md", "effect": "Specific item selection, grouped fashion fields, real variants and units, size charts, scoped defaults, customer preview and missing-information review."},
        {"id": "SC_AVAILABILITY", "file": "03-availability.md", "effect": "Variant/branch stock for products; separate fitting/styling appointment resources and production/due capacity for tailoring. A product does not gain an appointment calendar."},
        {"id": "SC_BUSINESS", "file": "04-business.md", "effect": "Maintain brand/maker defaults, location applicability, shared versioned charts and public policy references without treating merchant specialty as a restriction on actual offerings."},
        {"id": "SC_MONEY", "file": "05-money.md", "effect": "Use accepted variant/quantity/extra prices, applicable policy versions and authoritative refund facts; size-chart edits never rewrite historical charges."},
        {"id": "SC_PROMOTIONS", "file": "06-promotions.md", "effect": "Target real eligible variants and locations, accurately show from/selected price and stock-dependent eligibility, and preserve the correct colour image."},
        {"id": "SC_INSIGHTS", "file": "07-insights.md", "effect": "Allow meaningful item/type/variant dimensions where source data exists; missing size, stock or fit-return reasons remain unavailable rather than inferred."},
        {"id": "SC_SETTINGS", "file": "08-settings.md", "effect": "Declare source/edit ownership for product details, chart versions, prices and stock; map imported size/colour/measurement fields and restrict private tailoring access."}
    ],
    "reviewQuestions": [
        "Which measurements should block publication for each garment type, and when is a clear not-provided state acceptable?",
        "Which existing merchant size charts can be reused accurately, and who maintains updates and exceptions?",
        "Are the proposed construction choices and separate ring, necklace, bracelet, earring and smartwatch templates sufficient for the actual ranges?"
    ],
    "illustrativeDress": {
        "label": "Illustrative dress for design review", "notLive": True,
        "name": "Linen midi dress", "material": "Linen blend, illustrative", "fit": "Relaxed", "colour": "Olive",
        "measurementBasis": "Garment circumference", "unit": "cm",
        "sizeRows": [{"label": "S", "bust": 88, "waist": 70, "hips": 96, "length": 112},
                     {"label": "M", "bust": 94, "waist": 76, "hips": 102, "length": 114},
                     {"label": "L", "bust": 100, "waist": 82, "hips": 108, "length": 116}]
    }
}

SCREEN_SCENARIOS = {
    "SC_WORK": "FASH-WK01: an accepted dress order retains the selected size, colour, variant ID and accepted chart/price/policy versions after the merchant edits the current chart. A viewer without tailoring access cannot open personal measurements.",
    "SC_OFFERINGS": "FASH-OF01: choose Dress, enter its applicable construction fields, create real size/colour variants, attach a size guide with units/basis, then inspect each variant in Customer preview. A skirt omits inseam; a ring uses its ring-size guide; changing type reviews incompatible saved fields.",
    "SC_AVAILABILITY": "FASH-AV01: size M at one branch can be unavailable while size L or another branch differs. A styling appointment uses provider/time capacity; purchasing the dress never consumes a fitting slot.",
    "SC_BUSINESS": "FASH-BU01: updating a shared chart previews affected listings and preserves explicit item/variant overrides. A shop can add an applicable offering without changing its primary merchant identity.",
    "SC_MONEY": "FASH-MO01: a different price for a real variant is reflected in the accepted order and applicable refund calculation. A later chart or current-price edit does not change that historical amount.",
    "SC_PROMOTIONS": "FASH-PR01: a promotion restricted to specified variants/branches shows the right image, price basis and actual eligibility. It does not advertise an unavailable size as available or apply to an excluded variant.",
    "SC_INSIGHTS": "FASH-IN01: report only known item/type/variant dimensions with declared data coverage. Missing fit-return reasons are unavailable; they are not inferred from size or a customer's body.",
    "SC_SETTINGS": "FASH-SE01: an imported size/chart maps its actual system, units and measurement basis. Conflicting source-owned values enter review; external prices/stock remain under their owner and private tailoring fields remain restricted."
}
for impact in SCREEN_DESIGN["screenImpacts"]:
    impact["acceptanceScenario"] = SCREEN_SCENARIOS[impact["id"]]
