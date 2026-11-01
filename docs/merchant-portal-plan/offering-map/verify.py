"""Verify actual mapping artifacts and their authoritative source relationships."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import re

import build

HERE = Path(__file__).resolve().parent


def validate(data, categories, profiles, questions, domains, models):
    errors = []
    def check(ok, message):
        if not ok:
            errors.append(message)
    source_rows = {s["id"]: (c, s) for c in categories for s in c["subcategories"]}
    rows = data["subcategories"]
    row_ids = [r["subcategoryId"] for r in rows]
    check(len(row_ids) == len(set(row_ids)), "DUPLICATE_SUBCATEGORY")
    check(set(row_ids) == set(source_rows), "SUBCATEGORY_COVERAGE")
    check({c["id"] for c in data["categories"]} == {c["id"] for c in categories}, "CATEGORY_COVERAGE")
    fields, templates = data["fields"], data["templates"]
    owner_ids = {v["id"] for v in domains["dataClasses"]}
    schema_ids = {v["id"] for v in domains["offeringSchemas"]}
    model_ids = {v["id"] for v in models["models"]}
    used = set()
    approval = data["designApprovals"]
    approved_routes = {(r["subcategoryId"], r["templateId"], r["modelId"]) for r in approval["routes"]}
    actual_extra_routes = set()
    check(len(approved_routes) == len(approval["routes"]), "DUPLICATE_APPROVED_ROUTE")
    schemas_by_id = {s["id"]: s for s in domains["offeringSchemas"]}
    for key, field in fields.items():
        check(key == field["id"], f"FIELD_ID:{key}")
        check(field["type"] in data["valueTypes"], f"VALUE_TYPE:{key}")
        check(field["ownerDataClass"] in owner_ids, f"FIELD_OWNER:{key}")
        check(bool(field["guidance"].strip()), f"FIELD_GUIDANCE:{key}")
        check(set(field["destinations"]) <= set(data["customerDestinations"]), f"FIELD_DESTINATION:{key}")
        if field["scope"] == "transaction":
            check(field["visibility"] == "private_intake" and field["destinations"] == ["request_form"], f"PRIVATE_FIELD_EXPOSED:{key}")
        if field["visibility"] == "internal":
            check(field["destinations"] == ["internal"], f"INTERNAL_FIELD_EXPOSED:{key}")
        if field["type"] in ("intake_schema", "customization_schema"):
            check(field.get("responseScope") == "transaction" and field.get("responseVisibility") == "private_intake", f"FORM_RESPONSE_VISIBILITY:{key}")
    for key, template in templates.items():
        check(key == template["id"], f"TEMPLATE_ID:{key}")
        ids = [b["fieldId"] for b in template["fieldBindings"]]
        check(len(ids) == len(set(ids)), f"DUPLICATE_TEMPLATE_FIELD:{key}")
        check(set(ids) <= set(fields), f"UNKNOWN_TEMPLATE_FIELD:{key}")
        check(set(template["modelIds"]) <= model_ids, f"UNKNOWN_MODEL:{key}")
        check(set(template["schemaExtensionOf"]) <= schema_ids, f"UNKNOWN_SCHEMA:{key}")
        check(set(template["customerActions"]) == set(template["modelIds"]), f"MISSING_CUSTOMER_ACTION:{key}")
        check({build.canonical(k) for k in template["cardHighlights"]} <= set(ids), f"INVALID_CARD_HIGHLIGHT:{key}")
        check({"common.name", "common.type", "price.basis", "price.amount"} <= set(ids), f"MISSING_SHARED_INFORMATION:{key}")
        check(set(template.get("fixedValues", {})) <= set(ids), f"FIXED_FIELD_NOT_PRESENT:{key}")
        for b in template["fieldBindings"]:
            if b["fieldId"] in fields:
                allowed_destinations = set(fields[b["fieldId"]]["destinations"])
                if b["fieldId"] in {build.canonical(v) for v in template["cardHighlights"]}:
                    allowed_destinations.add("card")
                check(set(b["destinations"]) <= allowed_destinations, f"UNDECLARED_DISPLAY_ROUTE:{key}:{b['fieldId']}")
            check(b["requirement"]["level"] in ("publish", "conditional", "optional"), f"REQUIREMENT_LEVEL:{key}:{b['fieldId']}")
            if b["requirement"]["level"] == "conditional":
                check(bool(b["requirement"]["when"]), f"MISSING_CONDITION:{key}:{b['fieldId']}")
            check(bool(b["applicableWhen"]), f"MISSING_APPLICABILITY:{key}:{b['fieldId']}")
        for destination, ids_for_dest in template["customerSections"].items():
            check(set(ids_for_dest) <= set(ids), f"INVALID_SECTION_FIELD:{key}:{destination}")
            for field_id in ids_for_dest:
                if field_id in fields:
                    binding = next(b for b in template["fieldBindings"] if b["fieldId"] == field_id)
                    check(destination in binding["destinations"], f"SECTION_ROUTE_MISMATCH:{key}:{field_id}")
                    if destination not in ("internal", "request_form"):
                        check(fields[field_id]["visibility"] == "public", f"PUBLIC_SECTION_PRIVATE_FIELD:{key}:{field_id}")
        if "ORDER" in template["modelIds"] and "sale" in template["groups"]:
            check({"sale.variants", "stock.availability"} <= set(ids), f"PRODUCT_VARIANT_AVAILABILITY:{key}")
    for row in rows:
        key = row["subcategoryId"]
        if key not in source_rows:
            continue
        category, sub = source_rows[key]
        check(row["categoryId"] == category["id"] and row["categoryName"] == category["name"] and row["name"] == sub["name"], f"SOURCE_IDENTITY_DRIFT:{key}")
        check(row["taxonomyFields"] == sub["fields"], f"SOURCE_FIELD_DRIFT:{key}")
        check(row["existingCandidateModelIds"] == profiles[key]["candidateModelIds"], f"PROFILE_MODEL_DRIFT:{key}")
        check(bool(row["specialtyNotes"].strip()) and bool(row["offerings"]), f"MISSING_SPECIALTY_DETAIL:{key}")
        tids = [o["templateId"] for o in row["offerings"]]
        check(len(tids) == len(set(tids)), f"DUPLICATE_OFFERING_BINDING:{key}")
        context_ids = [q["questionId"] for q in row["existingOnboardingContext"]]
        check(context_ids == profiles[key]["sourceQuestionIds"], f"ONBOARDING_CONTEXT_DRIFT:{key}")
        for q in row["existingOnboardingContext"]:
            check(q["questionId"] in questions, f"UNKNOWN_QUESTION:{key}:{q['questionId']}")
            if q["questionId"] in questions:
                check(q["canonicalTarget"] == questions[q["questionId"]]["canonicalTarget"], f"QUESTION_TARGET_DRIFT:{key}:{q['questionId']}")
        for offering in row["offerings"]:
            tid = offering["templateId"]
            used.add(tid)
            check(tid in templates, f"UNKNOWN_OFFERING:{key}:{tid}")
            if tid not in templates:
                continue
            check({r["modelId"] for r in offering["modelRoutes"]} == set(templates[tid]["modelIds"]), f"MODEL_ROUTE_COVERAGE:{key}:{tid}")
            for route in offering["modelRoutes"]:
                model = route["modelId"]
                route_key = (key, tid, model)
                baseline = model in profiles[key]["candidateModelIds"]
                is_approved = route_key in approved_routes
                if not baseline:
                    actual_extra_routes.add(route_key)
                expected = "WITHIN_PROFILE_CANDIDATES" if baseline else "APPROVED_PROFILE_EXTENSION" if is_approved else "PROFILE_EXTENSION_REQUIRED"
                check(route["compatibility"] == expected, f"MODEL_COMPATIBILITY:{key}:{tid}:{model}")
                check(route["designApprovalRef"] == (approval["approvalId"] if is_approved else None), f"APPROVAL_REFERENCE:{key}:{tid}:{model}")
                check(route["approvedWorkflowRefs"] == (schemas_by_id[build.D.MODEL_SCHEMA[model]]["workflowIds"] if is_approved else []), f"APPROVED_WORKFLOW_REFERENCE:{key}:{tid}:{model}")
                check(route["allowedIntakeModes"] == profiles[key]["intakeByModel"][model]["allowedModes"], f"INTAKE_MODE_DRIFT:{key}:{tid}:{model}")
                check(route["existingWorkflowRefs"] == profiles[key]["workflowOptionsByModel"].get(model, []), f"WORKFLOW_REFERENCE_DRIFT:{key}:{tid}:{model}")
        expected_models = list(dict.fromkeys(profiles[key]["candidateModelIds"] + [m["modelId"] for o in row["offerings"] for m in o["modelRoutes"] if (key, o["templateId"], m["modelId"]) in approved_routes]))
        check(row["effectiveDesignCandidateModelIds"] == expected_models, f"APPROVED_MODEL_COMPOSITION:{key}")
    check(used == set(templates), "UNBOUND_TEMPLATE")
    check(approved_routes <= actual_extra_routes, "APPROVED_ROUTE_NO_LONGER_PRESENT")
    for alias, target in data["fieldAliases"].items():
        check(alias not in fields and target in fields, f"FIELD_ALIAS:{alias}")
    def flags(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in ("runtimeEnabled", "createsWork"):
                    check(item is False, "RUNTIME_ACTIVATION")
                flags(item)
        elif isinstance(value, list):
            for item in value:
                flags(item)
    flags(data)
    return errors


def validate_experiences(data, workflows):
    errors = []
    def check(ok, message):
        if not ok:
            errors.append(message)
    experience = data["experienceMap"]
    fields, templates = data["fields"], data["templates"]
    registered = {w["workflowId"]: w for w in workflows["workflows"]}
    check(set(experience["workflowContracts"]) == set(registered), "WORKFLOW_CONTRACT_SNAPSHOT_COVERAGE")
    for wid, contract in experience["workflowContracts"].items():
        if wid in registered:
            check(contract["transitions"] == registered[wid]["transitions"], "WORKFLOW_TRANSITION_DRIFT:" + wid)
            check(contract["variants"] == registered[wid].get("variants", []), "WORKFLOW_VARIANT_DRIFT:" + wid)
            check(contract["states"] == registered[wid]["states"], "WORKFLOW_STATE_DRIFT:" + wid)
    merchant_ids = {s["id"] for s in experience["merchantScreens"]}
    customer_ids = {s["id"] for s in experience["customerScreens"]}
    check({"SC_WORK", "SC_OFFERINGS", "SC_AVAILABILITY", "SC_BUSINESS", "SC_MONEY", "SC_PROMOTIONS", "SC_INSIGHTS", "SC_SETTINGS"} == merchant_ids, "MERCHANT_SCREEN_DEFINITIONS")
    check(set(experience["templateBindings"]) == set(templates), "OFFERING_EXPERIENCE_COVERAGE")
    categories = {c["categoryId"]: c for c in experience["categories"]}
    check(set(categories) == {c["id"] for c in data["categories"]}, "CATEGORY_EXPERIENCE_COVERAGE")
    check(set(experience["reviewExamples"]) == set(categories), "CATEGORY_SPECIFICATION_REVIEW_COVERAGE")
    for key, example in experience["reviewExamples"].items():
        if key not in categories:
            continue
        check(example["templateId"] in categories[key]["offeringTemplateIds"], "SPECIFICATION_EXAMPLE_CATEGORY:" + key)
        if example["templateId"] in templates:
            field_ids = {b["fieldId"] for b in templates[example["templateId"]]["fieldBindings"]}
            check(set(example["fieldIds"]) <= field_ids, "SPECIFICATION_EXAMPLE_FIELD:" + key)
    specialty_rows = {r["subcategoryId"]: r for r in experience["specialtyScreenCoverage"]}
    check(set(specialty_rows) == {r["subcategoryId"] for r in data["subcategories"]}, "SPECIALTY_SCREEN_COVERAGE")
    for row in data["subcategories"]:
        key = row["subcategoryId"]
        if key not in specialty_rows:
            continue
        screen_row = specialty_rows[key]
        check(set(screen_row["screens"]) == merchant_ids, "SPECIALTY_MERCHANT_SCREENS:" + key)
        tids = [o["templateId"] for o in row["offerings"]]
        for binding in screen_row["screens"].values():
            check(binding["offeringTemplateIds"] == tids, "SPECIALTY_SCREEN_OFFERINGS:" + key)
        check(screen_row["offeringRoutes"] == [dict(templateId=o["templateId"], routes=o["modelRoutes"]) for o in row["offerings"]], "SPECIALTY_WORKFLOW_ROUTE_DRIFT:" + key)
        for offering in screen_row["offeringRoutes"]:
            for route in offering["routes"]:
                check(set(route["existingWorkflowRefs"] + route["approvedWorkflowRefs"]) <= set(registered), "SPECIALTY_UNKNOWN_WORKFLOW:" + key + ":" + offering["templateId"])
    for key, category in categories.items():
        source_rows = [r for r in data["subcategories"] if r["categoryId"] == key]
        expected_templates = {o["templateId"] for r in source_rows for o in r["offerings"]}
        check(set(category["offeringTemplateIds"]) == expected_templates, "CATEGORY_SCREEN_OFFERINGS:" + key)
        check({s["screenId"] for s in category["merchantScreens"]} == merchant_ids, "CATEGORY_MERCHANT_SCREENS:" + key)
        for screen in category["merchantScreens"]:
            check(set(screen["offeringTemplateIds"]) == expected_templates, "CATEGORY_SCREEN_SCOPE:" + key + ":" + screen["screenId"])
            check(set(screen["fieldIds"]) <= set(fields), "CATEGORY_UNKNOWN_FIELD:" + key + ":" + screen["screenId"])
    for key, template in templates.items():
        if key not in experience["templateBindings"]:
            continue
        binding = experience["templateBindings"][key]
        ids = {b["fieldId"] for b in template["fieldBindings"]}
        check(set(binding["merchantScreens"]) == merchant_ids, "OFFERING_MERCHANT_SCREENS:" + key)
        check(set(binding["customerScreens"]) == customer_ids, "OFFERING_CUSTOMER_SCREENS:" + key)
        check(set(binding["merchantScreens"]["SC_OFFERINGS"]["fieldIds"]) == ids, "CAPTURE_FIELD_MISSING:" + key)
        customer_routed = set()
        for screen_id, screen in binding["customerScreens"].items():
            check(set(screen["fieldIds"]) <= ids, "CUSTOMER_UNKNOWN_FIELD:" + key + ":" + screen_id)
            customer_routed.update(screen["fieldIds"])
            for fid in screen["fieldIds"]:
                if fid not in fields:
                    continue
                check(fields[fid]["visibility"] != "internal", "INTERNAL_IN_CUSTOMER_SCREEN:" + key + ":" + fid)
                if screen["dataPrivacy"] == "public_projection":
                    check(fields[fid]["visibility"] == "public", "PRIVATE_IN_PUBLIC_CUSTOMER_SCREEN:" + key + ":" + fid)
        noninternal = {fid for fid in ids if fields[fid]["visibility"] != "internal"}
        check(noninternal <= customer_routed, "UNROUTED_CUSTOMER_INFORMATION:" + key)
        for fid in binding["merchantScreens"]["SC_PROMOTIONS"]["fieldIds"]:
            check(fields[fid]["visibility"] == "public", "PRIVATE_PROMOTION_INFORMATION:" + key + ":" + fid)
        snapshot = binding["acceptedSpecification"]
        check(all(fields[k]["visibility"] == "public" and fields[k]["ownerDataClass"] == "offerings" for k in snapshot["publicFieldIds"]), "ACCEPTED_PUBLIC_SPECIFICATION_SCOPE:" + key)
        check(all(fields[k]["visibility"] == "private_intake" for k in snapshot["privateIntakeFieldIds"]), "ACCEPTED_PRIVATE_INTAKE_SCOPE:" + key)
        check(all(fields[k]["ownerDataClass"] == "pricing" for k in snapshot["priceFieldIds"]), "ACCEPTED_PRICE_OWNER:" + key)
        check({r["modelId"] for r in binding["workflowBindings"]} == set(template["modelIds"]), "OFFERING_MODEL_EXPERIENCE_COVERAGE:" + key)
        for route in binding["workflowBindings"]:
            check(set(route["workflowRefs"]) <= set(registered), "OFFERING_UNKNOWN_WORKFLOW:" + key)
            check({c["workflowId"] for c in route["transitionContracts"]} == set(route["workflowRefs"]), "TRANSITION_CONTRACT_COVERAGE:" + key)
            for contract in route["transitionContracts"]:
                wid = contract["workflowId"]
                if wid in registered:
                    check(contract["statesRef"] == {"registry": "effective-workflows.json", "workflowId": wid}, "WORKFLOW_SNAPSHOT_REFERENCE:" + key + ":" + wid)
    actual = dict(categories=len(categories), subcategories=len(specialty_rows), offeringTypes=len(experience["templateBindings"]),
        merchantScreenDefinitions=len(merchant_ids), customerScreenDefinitions=len(customer_ids),
        categoryMerchantScreenCompositions=sum(len(c["merchantScreens"]) for c in categories.values()),
        specialtyMerchantScreenBindings=sum(len(r["screens"]) for r in specialty_rows.values()),
        offeringModelBindings=sum(len(t["workflowBindings"]) for t in experience["templateBindings"].values()),
        registeredWorkflowContracts=len(experience["workflowContracts"]))
    check(actual == experience["counts"], "SCREEN_WORKFLOW_COUNT_DRIFT")
    return errors


def main():
    path = HERE / "verification.json"
    path.write_text('{"status":"CHECKS_RUNNING"}\n', encoding="utf-8")
    data = json.loads((HERE / "catalogue.json").read_text(encoding="utf-8"))
    categories = build.taxonomy()
    profiles = {r["subcategoryId"]: r for r in build.read_json("profiles")["rows"]}
    questions = {q["questionId"]: q for q in build.read_json("questions")["questions"]}
    domains, models = build.read_json("domains"), build.read_json("models")
    errors = validate(data, categories, profiles, questions, domains, models)
    workflows = build.read_json("workflows")
    errors += validate_experiences(data, workflows)
    audit = build.read_json("audit")["rows"]
    audit_by_id = {r["id"]: r for r in audit}
    source_rows = {s["id"]: (c, s) for c in categories for s in c["subcategories"]}
    if set(audit_by_id) != set(source_rows):
        errors.append("AUDIT_COVERAGE_DRIFT")
    for sid, (category, sub) in source_rows.items():
        if sid in audit_by_id:
            a = audit_by_id[sid]
            if a["name"] != sub["name"] or a["categoryId"] != category["id"] or a["fields"] != sub["fields"]:
                errors.append("AUDIT_SOURCE_DRIFT:" + sid)
    if data != build.make_catalogue():
        errors.append("GENERATED_MAP_OUT_OF_DATE")
    manifest = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))
    if manifest["sources"] != build.source_hashes():
        errors.append("SOURCE_HASH_DRIFT")
    expected_docs = build.render_documents(data)
    expected_docs["catalogue.json"] = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if set(manifest["generatedFiles"]) != set(expected_docs):
        errors.append("GENERATED_FILE_MANIFEST")
    for name, expected in expected_docs.items():
        p = HERE / name
        if not p.exists() or p.read_text(encoding="utf-8") != expected:
            errors.append("GENERATED_DOCUMENT_DRIFT:" + name)
        elif hashlib.sha256(p.read_bytes()).hexdigest() != manifest["generatedFiles"].get(name):
            errors.append("GENERATED_HASH_DRIFT:" + name)

    # Relations required by actual customer journeys; these do not claim a working customer UI.
    semantic_checks = []
    def fields_for(key):
        return {b["fieldId"]: b for b in data["templates"][key]["fieldBindings"]}
    def scenario(name, passed):
        semantic_checks.append(dict(name=name, status="PASS" if passed else "FAIL"))
        if not passed:
            errors.append("DESIGN_SCENARIO:" + name)
    dress = fields_for("dress")
    scenario("Dress size-specific measurement and basis routes", all(k in dress for k in ("sizing.rows", "sizing.basis", "dress.bust", "dress.waist", "dress.hips", "dress.length")) and all(data["fields"][k]["scope"] == "variant_size" for k in ("dress.bust", "dress.waist", "dress.hips", "dress.length")))
    scenario("Trouser waist requirement uses shared measurement meaning", fields_for("trousers")["dress.waist"]["requirement"]["level"] == "publish")
    scenario("Skirt does not ask for leg-only measurements", not {"bottom.inseam", "bottom.rise"}.intersection(fields_for("skirt")) and "bottom.length" in fields_for("skirt"))
    scenario("Mixed clothing forms scope their piece measurements", all(data["templates"][k].get("groupApplicability") and "garment_scope.construction" in fields_for(k) for k in ("suit", "activewear", "sleepwear", "uniform")))
    scenario("Underwear can capture actual band/cup fit", {"fitted_underwear.band", "fitted_underwear.cup", "fitted_underwear.bust", "fitted_underwear.waist_hips"} <= set(fields_for("underwear")))
    scenario("Rental terms, selected interval and private trip input", {"rental.mileage", "rental.fuel", "rental.deposit", "rental.cover", "rental.period", "trip_intake.time"} <= set(fields_for("car_rental")) and data["templates"]["car_rental"]["modelIds"] == ["ASSET_INTERVAL"])
    scenario("Standalone network hardware has no unconditional plan allowance", data["templates"]["network_device"]["groupApplicability"]["telecom"] == "a provider plan is explicitly bundled with the hardware")
    scenario("Ready cake is separate from production due acceptance", "cake.due" not in fields_for("ready_cake") and "cake.due" in fields_for("custom_cake"))
    scenario("Non-alcoholic mixer does not inherit alcohol eligibility", "restricted.eligibility" not in fields_for("mixer") and "restricted.eligibility" in fields_for("alcoholic_mixer"))
    scenario("Health intake is private while public service remains descriptive", all(data["fields"][k]["visibility"] == "private_intake" and data["fields"][k]["destinations"] == ["request_form"] for k in ("health_intake.contact", "health_intake.requirements")) and "health_service.service" in fields_for("clinic"))
    scenario("Customer-entered customization is not a public response", data["fields"]["custom.scope"]["responseVisibility"] == "private_intake")
    scenario("Cable and charger specifications have distinct controls", {"cable.ends", "cable.length"} <= set(fields_for("cable")) and "charger.outputs" in fields_for("charger"))
    scenario("Dairy has specific product, form and contents fields", {"dairy_specs.kind", "dairy_specs.format", "dairy_specs.contents"} <= set(fields_for("dairy_eggs")))
    scenario("Rental and transfer promise actual vehicle and capacity facts", {"vehicle_specs.make", "vehicle_specs.body", "rental.seats"} <= set(fields_for("car_rental")) and "transfer.vehicle" in fields_for("airport_transfer") and "vehicle_specs.capacity" not in fields_for("car_rental"))
    scenario("Pharmacy label facts remain distinct from private administration", "medicine.form" in fields_for("medicine") and "health_service_specs.administration" in fields_for("clinic") and data["fields"]["health_service_specs.administration"]["responseVisibility"] == "private_intake")
    scenario("Shopping requests capture actual item specifications and budget privately", {"shopping_intake.items", "shopping_intake.budget"} <= set(fields_for("shopping_assistance")) and data["fields"]["shopping_intake.items"]["visibility"] == "private_intake")
    scenario("Freight constraints and actual per-piece declarations are separate", {"freight_specs.limits", "cargo_intake.dimensions"} <= set(fields_for("air_freight")) and data["fields"]["cargo_intake.dimensions"]["visibility"] == "private_intake")
    scenario("Each current category and specialty composes every merchant screen", data["experienceMap"]["counts"]["categoryMerchantScreenCompositions"] == len(categories) * len(data["experienceMap"]["merchantScreens"]) and data["experienceMap"]["counts"]["specialtyMerchantScreenBindings"] == len(source_rows) * len(data["experienceMap"]["merchantScreens"]))
    scenario("Regulated enquiry illustrations retain their specific workflow", next(r for r in data["experienceMap"]["templateBindings"]["banking_enquiry"]["workflowBindings"] if r["modelId"] == "REQUEST_QUOTE")["workflowRefs"] == ["WF_REGULATED_ENQUIRY"])

    # Exercise the validator on corrupted user-visible mapping inputs; assert concrete diagnostics.
    negatives = []
    mutations = [
        ("Missing specialty is rejected", lambda x: x["subcategories"].pop(), "SUBCATEGORY_COVERAGE"),
        ("Private field in public projection is rejected", lambda x: x["fields"]["health_intake.contact"].update(destinations=["card"]), "PRIVATE_FIELD_EXPOSED:health_intake.contact"),
        ("Unknown input type is rejected", lambda x: x["fields"]["dress.waist"].update(type="not_a_registered_type"), "VALUE_TYPE:dress.waist"),
        ("Approved extension cannot be misrepresented as historical support", lambda x: next(m for r in x["subcategories"] for o in r["offerings"] for m in o["modelRoutes"] if m["compatibility"] == "APPROVED_PROFILE_EXTENSION").update(compatibility="WITHIN_PROFILE_CANDIDATES"), None),
        ("Missing approval reference is rejected", lambda x: next(m for r in x["subcategories"] for o in r["offerings"] for m in o["modelRoutes"] if m["compatibility"] == "APPROVED_PROFILE_EXTENSION").update(designApprovalRef=None), "APPROVAL_REFERENCE:festivals:session_pass:ENTITLEMENT"),
    ]
    for name, mutate, diagnostic in mutations:
        bad = copy.deepcopy(data)
        mutate(bad)
        observed = validate(bad, categories, profiles, questions, domains, models)
        passed = diagnostic in observed if diagnostic else any(v.startswith("MODEL_COMPATIBILITY:") for v in observed)
        negatives.append(dict(name=name, status="PASS" if passed else "FAIL", observedDiagnostic=diagnostic or next((v for v in observed if v.startswith("MODEL_COMPATIBILITY:")), None)))
        if not passed:
            errors.append("VALIDATOR_REJECTION_CASE:" + name)
    experience_mutations = [
        ("Missing category screen is rejected", lambda x: x["experienceMap"]["categories"][0]["merchantScreens"].pop(), "CATEGORY_MERCHANT_SCREENS:adults_only"),
        ("Private field on public detail is rejected", lambda x: x["experienceMap"]["templateBindings"]["clinic"]["customerScreens"]["CS_DETAIL"]["fieldIds"].append("health_intake.contact"), "PRIVATE_IN_PUBLIC_CUSTOMER_SCREEN:clinic:health_intake.contact"),
        ("Missing product-specific capture field is rejected", lambda x: x["experienceMap"]["templateBindings"]["dairy_eggs"]["merchantScreens"]["SC_OFFERINGS"]["fieldIds"].remove("dairy_specs.contents"), "CAPTURE_FIELD_MISSING:dairy_eggs"),
        ("Changed registered workflow transition is rejected", lambda x: x["experienceMap"]["workflowContracts"]["WF_RENTAL"].update(transitions=[]), "WORKFLOW_TRANSITION_DRIFT:WF_RENTAL"),
    ]
    for name, mutate, diagnostic in experience_mutations:
        bad = copy.deepcopy(data)
        mutate(bad)
        observed = validate_experiences(bad, workflows)
        passed = diagnostic in observed
        negatives.append(dict(name=name, status="PASS" if passed else "FAIL", observedDiagnostic=diagnostic))
        if not passed:
            errors.append("EXPERIENCE_REJECTION_CASE:" + name)

    checked_links = 0
    link_docs = set(HERE.rglob("*.md")) | {HERE / name for name in expected_docs if name.endswith(".md")}
    for doc in sorted(link_docs):
        for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", doc.read_text(encoding="utf-8")):
            if "://" in target or target.startswith("#"):
                continue
            checked_links += 1
            if not (doc.parent / target.split("#")[0]).exists():
                errors.append("BROKEN_LOCAL_LINK:" + str(doc) + ":" + target)
    actual_counts = dict(categories=len(categories), subcategories=len(data["subcategories"]), offeringTemplates=len(data["templates"]),
        fieldGroups=len(data["fieldGroups"]), fieldDefinitions=len(data["fields"]),
        specialtyOfferingMappings=sum(len(r["offerings"]) for r in data["subcategories"]),
        additionalModelRoutes=sum(1 for r in data["subcategories"] for o in r["offerings"] for m in o["modelRoutes"] if m["compatibility"] != "WITHIN_PROFILE_CANDIDATES"),
        approvedAdditionalModelRoutes=sum(1 for r in data["subcategories"] for o in r["offerings"] for m in o["modelRoutes"] if m["compatibility"] == "APPROVED_PROFILE_EXTENSION"),
        unapprovedAdditionalModelRoutes=sum(1 for r in data["subcategories"] for o in r["offerings"] for m in o["modelRoutes"] if m["compatibility"] == "PROFILE_EXTENSION_REQUIRED"))
    if actual_counts != data["counts"]:
        errors.append("REPORTED_COUNT_DRIFT")
    report = dict(date="2026-10-31", status="DESIGN_CHECKS_PASSED" if not errors else "DESIGN_CHECKS_FAILED",
        command="python -X utf8 docs/merchant-portal-plan/offering-map/verify.py", counts=actual_counts,
        sourceHashes=build.source_hashes(), generatedFilesChecked=len(expected_docs), localLinksChecked=checked_links,
        screenWorkflowCounts=data["experienceMap"]["counts"],
        designScenarios=semantic_checks, validatorRejectionCases=negatives, errors=errors,
        limitations=["Design coverage/reference/selected semantic checks only.", "Not merchant validation, legal/clinical/financial policy approval or actual customer usability testing.", "No runtime schema, form, API, stock, pricing, booking, permissions or provider behavior has been implemented or verified by this package."])
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("status", "counts", "generatedFilesChecked", "localLinksChecked", "errors")}, indent=2))
    raise SystemExit(0 if not errors else 1)


if __name__ == "__main__":
    main()
