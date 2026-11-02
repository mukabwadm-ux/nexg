"""Planning validation only; no live campaign, provider or transaction is exercised."""
import copy
import hashlib
import json
from pathlib import Path
import re
import struct
import zlib
import definition as D
import build

HERE = Path(__file__).resolve().parent


def exact_example(case):
    if case["basisMinor"] < case["minimumMinor"]:
        return 0, case["basisMinor"]
    numerator = case["basisMinor"] * case["percentageBps"]
    if numerator % 10000:
        raise ValueError("An owner-approved rounding policy is needed for this example.")
    saving = min(numerator // 10000, case["capMinor"], case["basisMinor"])
    return saving, case["basisMinor"] - saving


def validate(data, source):
    errors = []
    ids = [r["subcategoryId"] for r in data["rows"]]
    source_rows = {r["subcategoryId"]: r for r in source["subcategories"]}
    if len(ids) != len(set(ids)) or set(ids) != set(source_rows):
        errors.append("SPECIALTY_COVERAGE")
    if set(data["modelRules"]) != set(source["modelSchemaRefs"]):
        errors.append("MODEL_COVERAGE")
    kinds = {t["id"] for t in data["proposedPromotionTypes"]}
    field_ids = [f["id"] for f in data["fields"]]
    if len(field_ids) != len(set(field_ids)):
        errors.append("DUPLICATE_FIELD")
    used_templates = set()
    for row in data["rows"]:
        sid = row["subcategoryId"]
        if sid not in source_rows:
            continue
        original = source_rows[sid]
        if row["name"] != original["name"] or row["categoryId"] != original["categoryId"]:
            errors.append("IDENTITY:" + sid)
        by_id = {o["templateId"]: o for o in original["offerings"]}
        if {o["templateId"] for o in row["offeringBindings"]} != set(by_id):
            errors.append("OFFERING_COVERAGE:" + sid)
        if row["screenFlowRefs"] != [step["id"] for step in data["flow"]]:
            errors.append("FLOW_COVERAGE:" + sid)
        for offering in row["offeringBindings"]:
            tid = offering["templateId"]
            used_templates.add(tid)
            if tid not in by_id:
                errors.append("UNKNOWN_TEMPLATE:" + sid + ":" + tid)
                continue
            binding_fields = {b["fieldId"] for b in source["templates"][tid]["fieldBindings"]}
            for fid in offering["publicSpecificationFieldRefs"]:
                if fid not in binding_fields or source["fields"][fid]["visibility"] != "public":
                    errors.append("PUBLIC_FIELD:" + sid + ":" + tid + ":" + fid)
            original_routes = {r["modelId"]: r for r in by_id[tid]["modelRoutes"]}
            if {r["modelId"] for r in offering["sourceModelRoutes"]} != set(original_routes):
                errors.append("ROUTE_COVERAGE:" + sid + ":" + tid)
            for route in offering["sourceModelRoutes"]:
                model = route["modelId"]
                if model not in data["modelRules"] or not set(route["promotionTypeCandidates"]) <= kinds:
                    errors.append("MODEL_OR_TYPE:" + sid + ":" + tid)
                if model in original_routes:
                    prior = original_routes[model]
                    if route["sourceWorkflowRefs"] != prior["existingWorkflowRefs"] + prior["approvedWorkflowRefs"]:
                        errors.append("WORKFLOW_DRIFT:" + sid + ":" + tid)
                    if route["sourceCompatibility"] != prior["compatibility"] or route["designApprovalRef"] != prior["designApprovalRef"]:
                        errors.append("APPROVAL_DRIFT:" + sid + ":" + tid)
                if route["runtimeEnabled"] is not False:
                    errors.append("RUNTIME_ACTIVATION")
    if used_templates != set(source["templates"]):
        errors.append("TEMPLATE_COVERAGE")
    return errors


def illustrative_type_resolution(rule, known_component, approved_component_rule):
    if not (known_component and approved_component_rule):
        return rule.get("defaultForUnknownPrice", ["FEATURED"])
    return rule["types"]


def validate_images():
    errors, checks = [], []
    manifest = json.loads((HERE/"image-manifest.json").read_text(encoding="utf-8"))
    prompts = json.loads((HERE/"image-prompts.json").read_text(encoding="utf-8"))
    expected = {item["id"]: item["file"] for item in D.IMAGE_BRIEFS}
    selected = manifest["images"]
    if manifest["selectedImageCount"] != len(expected) or len(selected) != len(expected) or {item["id"]: item["file"] for item in selected} != expected:
        errors.append("SELECTED_IMAGE_COVERAGE")
    prompt_items = prompts["images"]
    if len(prompt_items) != len(expected) or {item["id"]: item["file"] for item in prompt_items} != expected:
        errors.append("IMAGE_PROMPT_COVERAGE")
    for prompt in prompt_items:
        if not prompt.get("effectivePrompt") or not prompt.get("executionReferences"):
            errors.append("IMAGE_PROMPT_PROVENANCE:" + prompt["id"])
        for reference in prompt.get("executionReferences", []):
            if not (HERE/reference).is_file():
                errors.append("IMAGE_REFERENCE_MISSING:" + reference)
    for item in selected:
        filename = item["file"]
        path = HERE/filename
        if not path.is_file():
            errors.append("SELECTED_IMAGE_MISSING:" + filename)
            continue
        raw = path.read_bytes()
        valid = raw[:8] == b"\x89PNG\r\n\x1a\n"
        offset, dimensions, ended = 8, None, False
        while valid and offset < len(raw):
            if offset + 12 > len(raw):
                valid = False
                break
            size = struct.unpack_from(">I", raw, offset)[0]
            end = offset + 12 + size
            if end > len(raw):
                valid = False
                break
            kind = raw[offset+4:offset+8]
            payload = raw[offset+8:offset+8+size]
            expected_crc = struct.unpack_from(">I", raw, offset+8+size)[0]
            valid = zlib.crc32(kind+payload) & 0xffffffff == expected_crc
            if kind == b"IHDR" and size == 13:
                dimensions = struct.unpack_from(">II", payload)
            offset = end
            if kind == b"IEND":
                ended = True
                break
        digest_matches = hashlib.sha256(raw).hexdigest() == item["sha256"]
        passed = valid and ended and offset == len(raw) and dimensions == (item["width"], item["height"]) and digest_matches
        checks.append(dict(file=filename, passed=passed, dimensions=dimensions, checksumMatches=digest_matches))
        if not passed:
            errors.append("SELECTED_IMAGE_INTEGRITY:" + filename)
    edits = [manifest["correction"], *manifest.get("additionalCorrections", []), *manifest.get("revisions", [])]
    for edit in edits:
        if not (HERE/edit["promptFile"]).is_file():
            errors.append("CORRECTION_PROMPT_MISSING:" + edit["imageId"])
        if edit.get("archivedReference"):
            reference = HERE/edit["archivedReference"]
            if not reference.is_file() or hashlib.sha256(reference.read_bytes()).hexdigest() != edit["previousSha256"]:
                errors.append("ARCHIVED_EDIT_REFERENCE:" + edit["imageId"])
    return errors, checks


def validate_local_links():
    errors, checked = [], set()
    repo = HERE.parents[2]
    documents = [*HERE.glob("*.md"),
        repo/"docs/merchant-portal-plan/README.md",
        repo/"docs/merchant-portal-plan/screens/06-promotions.md",
        repo/"docs/handoff/HANDOFF.md",
        repo/"docs/handoff/sessions/2026-10-31-promotions-concept.md",
        repo/"docs/handoff/sessions/2026-10-31-promotions-tabs-app-preview.md",
        repo/"docs/handoff/sessions/2026-10-31-promotions-two-tabs.md",
        repo/"docs/status/deliverables.md", repo/"CHANGELOG.md"]
    for document in documents:
        if not document.is_file():
            errors.append("MISSING_DELIVERY_DOCUMENT:" + str(document.relative_to(repo)))
            continue
        for match in re.finditer(r"!?\[[^\]]*\]\(([^)]+)\)", document.read_text(encoding="utf-8")):
            target = match.group(1).strip().strip("<>").split("#", 1)[0]
            if not target or re.match(r"^[a-z]+://", target, re.I):
                continue
            resolved = (document.parent/target).resolve()
            checked.add((document.name, target))
            if not resolved.exists():
                errors.append("BROKEN_LOCAL_LINK:" + document.name + ":" + target)
    return errors, len(checked)


def main():
    data = json.loads((HERE/"coverage-128.json").read_text(encoding="utf-8"))
    source = json.loads(build.CATALOGUE.read_text(encoding="utf-8"))
    errors = validate(data, source)
    if data != build.compose():
        errors.append("GENERATED_COVERAGE_DRIFT")
    if data["surfaceContracts"]["campaigns"]["tabs"] != ["Campaigns", "History"] or data["surfaceContracts"]["featuredPlacements"]["separateNavigation"] is not False:
        errors.append("TWO_TAB_NAVIGATION")
    for name, expected in build.documents(data).items():
        if (HERE/name).read_text(encoding="utf-8") != expected:
            errors.append("GENERATED_DOCUMENT_DRIFT:" + name)
    examples = []
    for case in D.SAMPLE_CHECKS:
        observed = exact_example(case)
        expected = (case["expectedSavingMinor"], case["expectedPayableMinor"])
        passed = observed == expected
        examples.append(dict(id=case["id"], passed=passed, savingMinor=observed[0], payableMinor=observed[1]))
        if not passed:
            errors.append("PRICE_EXAMPLE:" + case["id"])
    negative = []
    for name, mutate, expected in [
        ("missing specialty", lambda x: x["rows"].pop(), "SPECIALTY_COVERAGE"),
        ("private field in public creative", lambda x: next(o for r in x["rows"] for o in r["offeringBindings"] if o["templateId"] == "clinic")["publicSpecificationFieldRefs"].append("health_intake.contact"), "PUBLIC_FIELD:clinics:clinic:health_intake.contact"),
        ("runtime activated by candidate metadata", lambda x: x["rows"][0]["offeringBindings"][0]["sourceModelRoutes"][0].update(runtimeEnabled=True), "RUNTIME_ACTIVATION"),
    ]:
        candidate = copy.deepcopy(data)
        mutate(candidate)
        observed = validate(candidate, source)
        passed = expected in observed
        negative.append(dict(case=name, passed=passed, diagnostic=expected))
        if not passed:
            errors.append("REJECTION_CASE:" + name)
    if len(D.IMAGE_BRIEFS) != len({x["file"] for x in D.IMAGE_BRIEFS}) or len(D.IMAGE_BRIEFS) != len({x["id"] for x in D.IMAGE_BRIEFS}):
        errors.append("DISTINCT_IMAGE_BRIEFS")
    if exact_example(D.SAMPLE_CHECKS[2])[1] * 6 != 9720000 or exact_example(D.SAMPLE_CHECKS[2])[0] * 6 != 1080000:
        errors.append("RENTAL_RESULT_EXAMPLE")
    quote_models = ("REQUEST_QUOTE", "FREIGHT", "STORAGE", "PRODUCTION_DUE", "SERVICE_JOB")
    if any(illustrative_type_resolution(data["modelRules"][m], False, True) != ["FEATURED", "ENQUIRY_VISIBILITY"] for m in quote_models):
        errors.append("UNPRICED_MODEL_AUTOMATIC_DISCOUNT")
    if illustrative_type_resolution(data["modelRules"]["SERVICE_JOB"], True, True) != ["FEATURED", "ENQUIRY_VISIBILITY", "AUTO_OFFER", "CODE_OFFER"]:
        errors.append("KNOWN_APPROVED_DIAGNOSTIC_COMPONENT")
    image_errors, image_checks = validate_images()
    link_errors, link_count = validate_local_links()
    errors.extend(image_errors + link_errors)
    report = dict(status="DESIGN_CHECKS_PASSED" if not errors else "DESIGN_CHECKS_FAILED", counts=data["counts"],
        sourceHashes=data["sources"], illustrativePriceExamples=examples, corruptedInputRejections=negative,
        selectedImageIntegrity=image_checks, localLinksChecked=link_count,
        errors=errors, limits=["Static design/reference and exact illustrative calculations only.", "No live publication, redemption, budget enforcement, capacity, provider, access or metrics behavior tested.", "Images are separately inspected concept references, not runtime evidence."])
    (HERE/"verification.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k:report[k] for k in ("status","counts","errors")}, indent=2))
    raise SystemExit(1 if errors else 0)


if __name__ == "__main__":
    main()
