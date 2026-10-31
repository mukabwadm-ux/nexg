"""Verify planning coverage/references only. This does not run a booking engine."""
import collections
import hashlib
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent


def read(name):
    return json.loads((BASE / name).read_text(encoding="utf-8-sig"))


def check(ok, message):
    if not ok:
        raise ValueError(message)


def main():
    source = read("../../audits/merchant-onboarding-128-taxonomy.json")
    profiles = read("../profiles-128.json")
    coverage = read("coverage-128.json")
    model_data = read("models.json")
    extension_data = read("extensions.json")
    questions = read("question-additions.json")
    rows = coverage["rows"]
    canonical = {r["id"]: r for r in source["rows"]}
    profile_map = {p["subcategoryId"]: p for p in profiles["profiles"]}
    models = {m["id"]: m for m in model_data["models"]}
    extensions = {e["id"] for e in extension_data["extensions"]}
    question_keys = {q["key"] for q in questions["questions"]}
    question_ids = {q["id"] for q in questions["questions"]}
    ids = [r["subcategoryId"] for r in rows]
    check(len(ids) == len(set(ids)) == len(canonical) == 128, "128 unique rows required")
    check(set(ids) == set(canonical) == set(profile_map), "Exact taxonomy/profile coverage required")
    check(len({r["categoryId"] for r in rows}) == 21, "21 category baseline required")
    check(len(models) == len(model_data["models"]) == 15, "15 unique shared models required")
    check(len(extensions) == len(extension_data["extensions"]), "Duplicate extension IDs")
    check(len(question_ids) == len(question_keys) == len(questions["questions"]), "Duplicate question identity")
    check("timezone" not in question_keys, "Timezone must be a platform value, not a question")
    check(questions["platformValues"]["timezone"] == coverage["timezone"] == model_data["timezone"] == "Africa/Nairobi", "Kenya zone inconsistent")
    check(coverage["timezonePicker"] is False, "No timezone picker")
    for q in questions["questions"]:
        check(set(q["appliesTo"]) <= set(models), "Unknown question applicability model")
        check(bool(q["prompt"]) and bool(q["effect"]), "Missing question intent")
    for correction in questions["corrections"]:
        check(set(correction["clarifyWith"]) <= question_ids, "Unresolved clarifying question")
    for m in models.values():
        check(set(m["extensionIds"]) <= extensions, "Unknown model extension")
        for key in ["requiredSetup", "resources", "customerFlow", "merchantFlow"]:
            check(bool(m[key]), "Missing model behavior: " + m["id"] + "/" + key)
    all_cases = []
    referenced_models = set()
    binding_count = 0
    baseline_kinds = {"normal", "conditional_or_nonbooking", "conflict", "access", "source_failure", "retry", "kenya_time"}
    for row in rows:
        sid = row["subcategoryId"]
        check(row["categoryId"] == canonical[sid]["categoryId"], "Category mismatch " + sid)
        check(row["sourceProfileId"] == profile_map[sid]["id"], "Profile reference mismatch " + sid)
        check(row["sourceWorkflowId"] == profile_map[sid]["primaryWorkflowId"], "Source workflow mismatch " + sid)
        check(set(row["sourceQuestionKeys"]) == set(canonical[sid]["fields"]), "Source question coverage mismatch " + sid)
        check(row["primaryModelId"] in models and row["customerFlowId"] in models, "Unknown model or journey " + sid)
        check(set(row["extensionIds"]) <= extensions, "Unknown row extension " + sid)
        check(set(model_data["commonExtensionIds"]) <= set(row["extensionIds"]), "Missing core protection " + sid)
        check(row["designStatus"] == "PLANNED" and row["implementationStatus"] == "NOT_STARTED" and row["testStatus"] == "NOT_RUN", "Planning must not claim implemented/passed " + sid)
        check(row["specialtyNeeds"] and row["requiredSetup"] and row["merchantView"] and row["authorityPolicy"], "Missing specialty behavior " + sid)
        for evidence in row["evidence"]:
            check((BASE / evidence["path"]).resolve().is_file(), "Broken source evidence " + sid)
        cases = row["acceptanceCases"]
        check(baseline_kinds <= {c["kind"] for c in cases}, "Missing baseline scenario " + sid)
        for c in cases:
            check(all(c.get(k) for k in ["id", "given", "when", "expected"]), "Incomplete scenario " + sid)
        row_models = {row["primaryModelId"]}
        for index, binding in enumerate(row["conditionalModels"]):
            binding_count += 1
            mid = binding["modelId"]
            check(mid in models and binding["trigger"] and binding["requiredSetup"], "Incomplete conditional model " + sid)
            row_models.add(mid)
            used_keys = set(re.findall(r"bookingSetup\.([A-Za-z0-9_]+)", binding["trigger"]))
            check(used_keys <= question_keys, "Unknown operational condition key " + sid + ": " + str(used_keys-question_keys))
            scoped = [c for c in cases if c["kind"] == "conditional_binding" and c["bindingIndex"] == index]
            check(len(scoped) == 4, "Four answer-state cases required for binding " + sid + "/" + str(index))
            check({c["conditionState"] for c in scoped} == {"positive", "negative", "missing", "conflicting"}, "Conditional answer-state coverage missing " + sid)
            check(all(c["modelId"] == mid for c in scoped), "Case binding model mismatch " + sid)
        for mid in row_models:
            check(set(models[mid]["extensionIds"]) <= set(row["extensionIds"]), "Required model extensions absent " + sid + "/" + mid)
        referenced_models.update(row_models)
        all_cases.extend(cases)
    check(referenced_models == set(models), "Some shared model has no existing/conditional use")
    check(len(all_cases) == len({c["id"] for c in all_cases}), "Duplicate case ID")
    check(len(all_cases) == 128 * 7 + binding_count * 4, "Case count inconsistent")
    restaurant = next(r for r in rows if r["subcategoryId"] == "restaurant")
    tables = next(c for c in restaurant["conditionalModels"] if c["modelId"] == "SPACE_RESERVATION")
    check("bookingSetup.offers_table_reservations" in tables["trigger"], "Restaurant must use explicit booking intent")
    check("answers.reservation_system=yes" not in tables["trigger"], "Existing reservation system cannot be an activation prerequisite")
    categories = collections.Counter(r["categoryId"] for r in rows)
    check(coverage["summary"]["categoryCount"] == len(categories) and coverage["summary"]["subcategoryCount"] == len(rows), "Summary row count mismatch")
    check(coverage["summary"]["acceptanceCaseCount"] == len(all_cases), "Summary case count mismatch")
    check(coverage["summary"]["conditionalModelBindings"] == binding_count, "Summary binding count mismatch")
    links_checked = 0
    for md in BASE.glob("*.md"):
        for raw in re.findall(r"\]\(([^)]+)\)", md.read_text(encoding="utf-8")):
            if raw.startswith(("https:", "http:", "#")):
                continue
            target = raw.split("#", 1)[0].strip("<>")
            if target:
                if (md.parent / target).resolve() == BASE / "verification.json":
                    continue  # The report is created only after every input check passes.
                check((md.parent / target).resolve().is_file(), "Broken planning link " + md.name + ": " + target)
                links_checked += 1
    result = {
        "date": "2026-10-31", "status": "STATIC_PLAN_CHECKS_PASSED", "runtimeStatus": "NOT_IMPLEMENTED_NOT_TESTED",
        "categoryCount": len(categories), "subcategoryCount": len(rows), "modelCount": len(models),
        "extensionCount": len(extensions), "questionAdditionCount": len(question_ids), "conditionalBindings": binding_count,
        "plannedAcceptanceCases": len(all_cases), "localLinksChecked": links_checked,
        "timezone": "Africa/Nairobi", "timezonePicker": False,
        "warning": "Checks prove planning IDs, coverage and references only. They do not execute booking, access, concurrency, payment or Google behavior.",
        "sourceSha256": {name: hashlib.sha256((BASE / name).read_bytes()).hexdigest() for name in ["coverage-128.json", "models.json", "extensions.json", "question-additions.json"]}
    }
    (BASE / "verification.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
