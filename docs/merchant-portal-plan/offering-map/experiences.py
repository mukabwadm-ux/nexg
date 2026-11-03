"""Shared screen composition rules. Product-kind metadata supplies the concrete fields."""

MERCHANT_SCREENS = [
    dict(id="SC_WORK", file="01-work.md", label="Work", rule="accepted_work",
         behavior="Show the actual accepted offering and selected variants/options, quantity/unit and specification/price/policy versions. Render the existing selected workflow's permitted stages and commands. Private intake is restricted to its purpose and role; never show it in public product data.",
         scenario="A later listing/specification edit leaves accepted work unchanged. Product orders, appointments, rentals, custom production, quotes, memberships, freight and storage retain their own workflow and independent payment/allocation/sync states."),
    dict(id="SC_OFFERINGS", file="02-offerings.md", label="Offerings", rule="all_capture",
         behavior="Choose the actual product/service kind, then compose the shared, type-specific and conditional input groups. Capture typed values, units, real variants, option compatibility, source and scope. Preview every customer destination before publishing through the existing owner gates.",
         scenario="Each mapped offering exposes its actual field matrix. Irrelevant construction fields are omitted; type changes review incompatible values; import preserves IDs, data quality and private/public boundaries."),
    dict(id="SC_AVAILABILITY", file="03-availability.md", label="Availability", rule="availability",
         behavior="Show the applicable availability model for the selected offering: stock by variant/location, exact resource/interval, dated places, compatible spaces, paired windows, accepted workload, redemption or nonblocking request. Unit, time basis, source freshness and confirmation authority stay explicit.",
         scenario="Unknown stock/capacity cannot become available. A product purchase does not reserve an appointment, a plan does not reserve its sessions, and an unaccepted request does not block capacity. Selected options recheck all actual constraints."),
    dict(id="SC_BUSINESS", file="04-business.md", label="Business", rule="business_defaults",
         behavior="Maintain shared identity, permitted activities/locations, applicable policy/verification references and explicitly reusable specification defaults. Item and variant overrides retain their own scope/version. Business category suggests forms but does not describe or restrict the entire catalogue.",
         scenario="A shared chart, policy or default change previews the affected offerings and preserves explicit overrides and accepted historical facts. A seller declaration never creates a verified badge or provider authority."),
    dict(id="SC_MONEY", file="05-money.md", label="Money", rule="pricing",
         behavior="Use the accepted actual item/variant/option, quantity/unit or interval and versioned price/charge terms. Distinguish starting estimates, quote-only, deposits, recurring consent and final total. Payment, refund, settlement and payout facts remain with their separate owners.",
         scenario="A listing edit does not rewrite an accepted price. Per-unit, time, person, pack, carrier and storage bases retain their units and approved calculations; neither a paid amount nor a successful form proves service confirmation."),
    dict(id="SC_PROMOTIONS", file="06-promotions.md", label="Promotions", rule="public_marketing",
         behavior="Select actual eligible published offerings, variants, options, dates and locations. Use accurate specification highlights, correct media, price basis and applicable stock/capacity/policy eligibility. Promotion configuration cannot grant permission or invent availability.",
         scenario="A promoted variant has its own eligible price/image/availability. Required product restrictions and source failures remain visible; private customer information is excluded from public promotion content."),
    dict(id="SC_INSIGHTS", file="07-insights.md", label="Insights", rule="reporting",
         behavior="Report confirmed actual offering/type/variant, location, unit and selected workflow dimensions where evidence exists. Use existing metric definitions and declared source coverage. Catalogue attributes do not create clinical, financial or personal suitability conclusions.",
         scenario="Missing quantity, variant, capacity, reason or provider data remains unavailable. Product sales, booked places, accepted production, requests and entitlements do not share an invented universal conversion or completion metric."),
    dict(id="SC_SETTINGS", file="08-settings.md", label="Settings", rule="source_mapping",
         behavior="Configure source/edit authority per fact, typed field/import mappings, units and shared versions. Preserve scoped permissions, conflicts and privacy. The approved 21 additions are explicit design extensions; candidate metadata never silently activates live behavior.",
         scenario="An import maps exact product attributes and actual variants with source provenance. Unknown values are not inferred from descriptions; external price/stock/resource facts remain owner-managed and private intake remains restricted.")
]

CUSTOMER_SCREENS = [
    dict(id="CS_BROWSE", label="Browse and search", destinations=["card"],
         behavior="Show actual product identity, accurate media, selected meaningful highlights and correctly labelled price/availability. Do not squeeze all specifications onto the card."),
    dict(id="CS_DETAIL", label="Offering detail and specifications", destinations=["details", "specifications"],
         behavior="Group actual item-specific facts, inclusions and source-backed descriptors with labels/units. Missing, unknown and not-applicable states are distinct; private records and internal IDs are absent."),
    dict(id="CS_OPTIONS", label="Variant, option and quantity selection", destinations=["options"],
         behavior="Offer real combinations and required/optional compatible choices. Selection updates the actual specification override, image, price and availability rather than silently substituting another item."),
    dict(id="CS_FIT", label="Size guide or fit information", destinations=["size_guide"],
         behavior="Only where relevant, show the actual chart/fit meaning, selected row, units and measurement basis. Never invent a measurement or cross-system equivalence."),
    dict(id="CS_PRICE", label="Price and charge breakdown", destinations=["pricing"],
         behavior="Show the selected price and actual unit/pack/quantity/period/person/quote basis, applicable extras and total. Starting estimates, deposits and unpriced requests retain their actual meaning."),
    dict(id="CS_FULFILMENT", label="Delivery, collection or service location", destinations=["fulfilment"],
         behavior="Show supported methods, exact location eligibility and authoritative estimates/promises. Unknown service coverage and freshness do not become a guaranteed delivery."),
    dict(id="CS_SCHEDULE", label="Date, time or capacity selection", destinations=["schedule"],
         behavior="Render only the actual selected model's supported schedule/interval/occurrence/paired-window behavior. Confirmation depends on source authority and all applicable constraints."),
    dict(id="CS_TERMS", label="Terms and eligibility", destinations=["terms"],
         behavior="Show applicable approved return/cancellation/deposit/usage/eligibility/renewal/provider terms before commitment. A seller answer does not establish verification or permission."),
    dict(id="CS_REQUEST", label="Private order, booking or enquiry input", destinations=["request_form"],
         behavior="Collect only necessary purpose-specific inputs and customer choices for this offering/model. Public form definitions and private responses remain distinct. Show pending versus accepted outcomes accurately."),
    dict(id="CS_REVIEW", label="Review and confirmation", destinations=[],
         behavior="Review the actual selected item/variant/options, quantity/unit or interval, accepted price and policy references before the owner command. Confirmation, allocation, payment, fulfilment and notifications remain separate outcomes."),
    dict(id="CS_TRACKING", label="Order, booking or request progress", destinations=[],
         behavior="Show the existing selected workflow's actual states and permitted customer actions from authoritative work. Quotes, requests, production, rentals, entitlements and provider handoffs do not become generic delivery orders.")
]

STAGES = [
    dict(id="capture", label="Merchant captures the offering", owner="offerings", invariant="Use the actual specific template and applicable typed fields; missing data remains unresolved."),
    dict(id="validate_publish", label="Validate and publish", owner="offerings", invariant="Apply the existing publication, source, policy and access gates. Category choice alone is insufficient."),
    dict(id="discover", label="Customer discovers and understands", owner="offerings", invariant="Public projection includes the relevant specifications and no private/internal values."),
    dict(id="select", label="Customer selects actual options", owner="offerings", invariant="Retain actual variant and choice references, units, compatibility and specification overrides."),
    dict(id="price_availability", label="Owners check price and feasibility", owner="pricing/stock/availability", invariant="The named independent owners revalidate actual quantities, resources, locations and price basis; unknown remains unknown."),
    dict(id="review_submit", label="Review terms and submit the selected command", owner="work_items", invariant="Bind accepted specification/price/policy versions and purpose-limited private intake to the actual existing model workflow."),
    dict(id="execute", label="Execute the existing workflow", owner="work_items", invariant="Use registered workflow transitions, owner guards and accurate independent allocation/payment/fulfilment/sync outcomes."),
    dict(id="complete_change", label="Complete or change accepted work", owner="work_items", invariant="Completion, amendment, cancellation and any refund use their actual supported owners and preserve accepted historical facts.")
]

# Concrete review examples are references to the same specification fields, never a second definition.
REVIEW_EXAMPLES = {
    "adults_only": ("intimate_device", ["intimate.material", "intimate.compatibility", "intimate.power", "restricted.eligibility"]),
    "airport_transfers": ("airport_transfer", ["transfer.route", "transfer.vehicle", "transfer.included", "transfer.meeting"]),
    "alcohol_beverages": ("wine", ["beverage.volume", "alcohol.abv", "alcohol.vintage", "wine_specs.grapes", "wine_specs.sweetness"]),
    "fashion_apparel": ("dress", ["apparel.fabric", "sizing.basis", "dress.bust", "dress.waist", "dress.hips", "dress.length"]),
    "beauty": ("makeup_product", ["cosmetic_specs.kind", "cosmetic.shade", "cosmetic.finish", "cosmetic_specs.undertone", "personal_care.quantity"]),
    "vehicle_rentals": ("car_rental", ["rental.identity", "rental.seats", "rental.transmission", "rental.mileage", "rental.cover", "rental.period"]),
    "experiences": ("event_ticket", ["event.programme", "event.venue", "event.occurrences", "event.tiers", "event.admission"]),
    "financial_services": ("insurance_enquiry", ["financial.provider", "financial_provider_specs.product", "financial.terms", "financial.handoff"]),
    "flowers_gifts": ("bouquet", ["flowers.varieties", "flowers.size", "flowers.state", "flowers.vase", "florist_specs.palette"]),
    "restaurants_food": ("pizza", ["food.ingredients", "food.portion", "pizza.size", "pizza.base", "food.options"]),
    "groceries_essentials": ("dairy_eggs", ["dairy_specs.kind", "dairy_specs.format", "dairy_specs.contents", "cold_food_specs.state"]),
    "laundry_cleaning": ("laundry", ["laundry.items", "laundry.scope", "laundry.turnaround", "laundry.windows", "laundry_specs.packaging"]),
    "marketplace": ("appliance", ["durable.dimensions", "durable.contents", "appliance.capacity", "appliance.power", "appliance.installation"]),
    "pharmacy": ("medicine", ["medicine.identity", "medicine.form", "medicine.eligibility", "medicine.information"]),
    "health": ("lab_test", ["lab.test", "lab.collection", "lab.turnaround", "health_intake.contact"]),
    "tech_electronics": ("computer", ["device.processor", "device.memory", "computer.graphics", "device.connectivity", "computer_specs.system"]),
    "travel_tours": ("safari", ["tour.itinerary", "tour.duration", "tour.party", "tour.inclusions", "tour_specs.lodging"]),
    "vehicle_services": ("tire_product", ["tire.size", "tire.rating", "tire.fitment"]),
    "wellness": ("massage", ["wellness.modality", "service.duration", "wellness.inclusions", "wellness_specs.options"]),
    "concierge_services": ("shopping_assistance", ["coordination.task", "coordination.approval", "shopping_intake.items", "shopping_intake.budget"]),
    "logistics_shipping": ("air_freight", ["freight.route", "freight.units", "freight_specs.limits", "cargo_intake.dimensions", "freight_specs.tariff"]),
}


def relevant_fields(rule, template, fields):
    ids = [b["fieldId"] for b in template["fieldBindings"]]
    if rule in ("all_capture", "source_mapping"):
        return ids
    if rule == "accepted_work":
        return [k for k in ids if fields[k]["visibility"] != "internal"]
    if rule == "availability":
        return [k for k in ids if fields[k]["ownerDataClass"] in ("stock", "availability", "resources", "service_areas", "fulfillment")
                or any(d in template_destination(template, k) for d in ("options", "schedule", "fulfilment"))]
    if rule == "business_defaults":
        return [k for k in ids if fields[k]["type"] in ("policy_reference", "verification_reference", "business_reference", "size_system", "measurement_basis", "measurement_chart")
                or fields[k]["scope"] in ("business", "activity", "location")]
    if rule == "pricing":
        return [k for k in ids if fields[k]["ownerDataClass"] == "pricing" or "pricing" in template_destination(template, k)]
    if rule == "public_marketing":
        return [k for k in ids if fields[k]["visibility"] == "public" and any(d in template_destination(template, k) for d in ("card", "options", "pricing", "terms"))]
    if rule == "reporting":
        return [k for k in ids if fields[k]["visibility"] == "public" and fields[k]["type"] in ("reference", "reference_list", "enum", "enum_list", "quantity", "quantity_list", "variant_table", "option_group_table")]
    raise ValueError("Unknown screen composition rule " + rule)


def template_destination(template, key):
    return next(b["destinations"] for b in template["fieldBindings"] if b["fieldId"] == key)


def compose(data, domains, models, workflows):
    schema_by_id = {s["id"]: s for s in domains["offeringSchemas"]}
    workflow_by_id = {w["workflowId"]: w for w in workflows["workflows"]}
    model_by_id = {m["id"]: m for m in models["models"]}
    template_bindings = {}
    for key, template in data["templates"].items():
        merchant = {s["id"]: dict(screenId=s["id"], fieldIds=relevant_fields(s["rule"], template, data["fields"])) for s in MERCHANT_SCREENS}
        customer = {}
        for screen in CUSTOMER_SCREENS:
            ids = list(dict.fromkeys(k for dest in screen["destinations"] for k in template["customerSections"][dest]))
            customer[screen["id"]] = dict(screenId=screen["id"], fieldIds=ids,
                applicable=bool(ids) if screen["destinations"] else True,
                dataPrivacy="private_transaction" if screen["id"] in ("CS_REQUEST", "CS_REVIEW", "CS_TRACKING") else "public_projection")
        routes = []
        for model_id in template["modelIds"]:
            model = model_by_id[model_id]
            schema_id = data["modelSchemaRefs"][model_id]
            schema_refs = [schema_id]
            if len(template["modelIds"]) == 1:
                schema_refs = template["schemaExtensionOf"]
            if key.endswith("_enquiry") and model_id == "REQUEST_QUOTE":
                schema_refs = ["REGULATED_ENQUIRY_V1"]
            workflow_ids = list(dict.fromkeys(w for sid in schema_refs for w in schema_by_id[sid]["workflowIds"]))
            routes.append(dict(modelId=model_id, schemaRefs=schema_refs, workflowRefs=workflow_ids,
                customerFlow=model["customerFlow"], merchantFlow=model["merchantFlow"],
                setupRequirements=model["requiredSetup"], allocationRule=model["allocationRule"],
                transitionContracts=[dict(workflowId=wid, statesRef={"registry": "effective-workflows.json", "workflowId": wid}) for wid in workflow_ids],
                runtimeEnabled=False))
        size_fields = [b["fieldId"] for b in template["fieldBindings"] if "size_guide" in b["destinations"]]
        template_bindings[key] = dict(templateId=key, merchantScreens=merchant, customerScreens=customer,
            merchantInputGroups=[dict(groupId=group_id,
                fieldIds=[b["fieldId"] for b in template["fieldBindings"] if b["groupId"] == group_id],
                applicableWhen=template.get("groupApplicability", {}).get(group_id, "This offering kind is selected."))
                for group_id in template["groups"] if any(b["groupId"] == group_id for b in template["fieldBindings"])],
            measurementGuide=dict(applicable=bool(size_fields), fieldIds=size_fields,
                composition="Chart/guide definitions, size rows and named measurement columns compose one typed control. Capture each actual value once, with unit/basis and variant/piece scope; a linked shared chart is a versioned reference, not a second independent set of values."),
            workflowBindings=routes, acceptedSpecification=dict(
                publicFieldIds=[b["fieldId"] for b in template["fieldBindings"] if data["fields"][b["fieldId"]]["visibility"] == "public" and data["fields"][b["fieldId"]]["ownerDataClass"] == "offerings"],
                priceFieldIds=[b["fieldId"] for b in template["fieldBindings"] if data["fields"][b["fieldId"]]["ownerDataClass"] == "pricing"],
                privateIntakeFieldIds=[b["fieldId"] for b in template["fieldBindings"] if data["fields"][b["fieldId"]]["visibility"] == "private_intake"],
                referencePolicy="Accept the actual selected specification/variant/option/unit and policy revision; private inputs are purpose-limited references. Price and work snapshots stay with their owners. Never rewrite accepted history from the current listing."))
    categories = []
    specialty_coverage = []
    for category in data["categories"]:
        rows = [r for r in data["subcategories"] if r["categoryId"] == category["id"]]
        ids = list(dict.fromkeys(o["templateId"] for row in rows for o in row["offerings"]))
        screens = []
        for definition in MERCHANT_SCREENS:
            screen_id = definition["id"]
            screens.append(dict(screenId=screen_id, offeringTemplateIds=ids,
                fieldIds=list(dict.fromkeys(k for tid in ids for k in template_bindings[tid]["merchantScreens"][screen_id]["fieldIds"])),
                modelIds=list(dict.fromkeys(m for tid in ids for m in data["templates"][tid]["modelIds"])),
                behaviorRef="merchantScreens#/" + screen_id))
        categories.append(dict(categoryId=category["id"], name=category["name"],
            subcategoryIds=category["subcategoryIds"], offeringTemplateIds=ids, merchantScreens=screens,
            customerScreenRefs=[s["id"] for s in CUSTOMER_SCREENS]))
        for row in rows:
            tids = [o["templateId"] for o in row["offerings"]]
            specialty_coverage.append(dict(subcategoryId=row["subcategoryId"], categoryId=category["id"],
                screens={s["id"]: dict(categoryCompositionRef=category["id"] + "/" + s["id"], offeringTemplateIds=tids) for s in MERCHANT_SCREENS},
                offeringRoutes=[dict(templateId=o["templateId"], routes=o["modelRoutes"]) for o in row["offerings"]]))
    return dict(status="ALL_CATEGORY_SCREEN_WORKFLOW_DESIGN", runtimeEnabled=False,
        categoryPolicy="Merchant identities suggest offering types. The selected actual product/service kind composes fields and customer screens; enabled owner capabilities choose supported workflows. No per-category backend or parallel state machine is introduced.",
        workflowSelectionPolicy="Template flow illustrations reuse registered model/schema contracts. Actual specialty offeringRoutes retain the historical or approved per-offering workflow references, intake modes and source guards. Do not replace a regulated, remote, greeting or other specialty route with a generic model illustration.",
        sourceRefs={key: data["sources"][key] for key in ("profiles", "domains", "models", "workflows")},
        specificationStages=STAGES, merchantScreens=MERCHANT_SCREENS, customerScreens=CUSTOMER_SCREENS,
        reviewExamples={key: dict(templateId=value[0], fieldIds=value[1]) for key, value in REVIEW_EXAMPLES.items()},
        workflowContracts={wid: dict(workflowId=wid, states=w["states"], transitions=w["transitions"], variants=w.get("variants", []), runtimeEnabled=False) for wid, w in workflow_by_id.items()},
        templateBindings=template_bindings, categories=categories, specialtyScreenCoverage=specialty_coverage,
        counts=dict(categories=len(categories), subcategories=len(specialty_coverage), offeringTypes=len(template_bindings),
            merchantScreenDefinitions=len(MERCHANT_SCREENS), customerScreenDefinitions=len(CUSTOMER_SCREENS),
            categoryMerchantScreenCompositions=len(categories) * len(MERCHANT_SCREENS),
            specialtyMerchantScreenBindings=len(specialty_coverage) * len(MERCHANT_SCREENS),
            offeringModelBindings=sum(len(t["workflowBindings"]) for t in template_bindings.values()),
            registeredWorkflowContracts=len(workflow_by_id)))
