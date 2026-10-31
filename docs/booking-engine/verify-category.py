"""Validate proposed category documents, not a production publication service."""
from copy import deepcopy
from pathlib import Path
import json
import re
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent
schema = json.loads((ROOT / "category-manifest.schema.json").read_text(encoding="utf-8"))
example = json.loads((ROOT / "example-new-category.json").read_text(encoding="utf-8"))
questions = {q["questionId"]: q for q in json.loads((ROOT / "question-registry.json").read_text(encoding="utf-8"))["questions"]}
workflows = set(re.findall(r"^## (WF_[A-Z_]+):", (ROOT / "workflow-catalogue.md").read_text(encoding="utf-8"), re.M))
components = set(re.findall(r"`(CMP_[A-Z_]+)`", (ROOT / "components.md").read_text(encoding="utf-8")))
screens = {"SC_WORK", "SC_OFFERINGS", "SC_AVAILABILITY", "SC_BUSINESS", "SC_MONEY", "SC_PROMOTIONS", "SC_INSIGHTS", "SC_SETTINGS"}
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema)
for question in questions.values():
    Draft202012Validator.check_schema(question["valueSchema"])


def condition_value(condition, answers):
    """Inspect synthetic fixture activation only; no task, permission or write is produced."""
    if condition.get("always") is True:
        return True
    if "all" in condition:
        values = [condition_value(c, answers) for c in condition["all"]]
        return False if False in values else (None if None in values else True)
    if "any" in condition:
        values = [condition_value(c, answers) for c in condition["any"]]
        return True if True in values else (None if None in values else False)
    ref, op = condition["questionRef"], condition["operator"]
    if ref not in answers:
        return None
    value, expected = answers[ref], condition["value"]
    if op == "eq": return value == expected
    if op == "neq": return value != expected
    if op == "in": return value in expected
    if op == "contains": return expected in value
    if op == "intersects": return bool(set(value).intersection(expected))
    if op == "exists": return value is not None
    if op == "nonempty": return value not in (None, "", [])
    raise ValueError(f"Unsupported operator: {op}")


def validate(document):
    validator.validate(document)
    bound = {binding["question"]["id"]: binding for binding in document["questionBindings"]}
    assert len(bound) == len(document["questionBindings"]), "Duplicate question binding"
    for ref, binding in bound.items():
        assert ref in questions, f"Unknown question: {ref}"
        if "allowedValues" in binding:
            assert set(binding["allowedValues"]) <= set(questions[ref]["valueSchema"]["enum"])
    def inspect(value):
        if isinstance(value, dict):
            if "questionRef" in value:
                assert value["questionRef"] in bound, "Condition question not bound"
            for child in value.values(): inspect(child)
        elif isinstance(value, list):
            for child in value: inspect(child)
    inspect(document)
    local = {}
    for section in ["offeringSchemas", "availability", "fulfillment", "readiness", "workflowBindings"]:
        ids = [item["id"] for item in document[section]]
        assert len(ids) == len(set(ids)), f"Duplicate {section} IDs"
        local[section] = set(ids)
    capability_ids = {item["capability"]["id"] for item in document["capabilities"]}
    for binding in document["workflowBindings"]:
        assert binding["workflow"]["id"] in workflows, "Unknown workflow"
        assert binding["capabilityRef"] in capability_ids, "Unknown capability binding"
        for key, section in [("offeringSchemaRef", "offeringSchemas"), ("availabilityRef", "availability"), ("fulfillmentRef", "fulfillment")]:
            assert binding[key] in local[section], f"Unknown {key}"
        if binding["role"] == "CHILD_EXECUTION":
            assert binding["parentBindingRef"] in local["workflowBindings"]
            assert binding["parentBindingRef"] != binding["id"]
    assert len(document["screens"]) == len(screens)
    assert {s["screenId"] for s in document["screens"]} == screens, "Each screen must appear exactly once"
    for screen in document["screens"]:
        assert set(screen["capabilityRefs"]) <= capability_ids
        for component in screen["components"]:
            assert component["id"] in components, "Unknown component"
    for fixture in document["verification"]["fixtures"]:
        for ref, value in fixture["answers"].items():
            assert ref in bound, "Unbound fixture answer"
            Draft202012Validator(questions[ref]["valueSchema"]).validate(value)
            if "allowedValues" in bound[ref]: assert value in bound[ref]["allowedValues"]
        for ref, binding in bound.items():
            if condition_value(binding["requiredWhen"], fixture["answers"]) is True:
                assert ref in fixture["answers"], "Missing required fixture answer"
        enabled = [b["id"] for b in document["workflowBindings"] if condition_value(b["enabledWhen"], fixture["answers"]) is True]
        checks = [c["id"] for c in document["readiness"] if condition_value(c["requiredWhen"], fixture["answers"]) is True]
        assert enabled == fixture["expectedWorkflowBindings"], "Unexpected workflow definition availability"
        assert checks == fixture["expectedSetupChecks"], "Unexpected setup requirements"
    # Unknown is never turned into true by inequality.
    assert condition_value({"questionRef": next(iter(bound)), "operator": "neq", "value": "anything"}, {}) is None


validate(example)
negative_cases = []
def rejected(name, mutate):
    candidate = deepcopy(example)
    mutate(candidate)
    try:
        validate(candidate)
    except (AssertionError, ValueError, KeyError) as error:
        negative_cases.append({"name": name, "result": "REJECTED_AS_EXPECTED", "reason": (str(error).splitlines() or [type(error).__name__])[0]})
    except Exception as error:
        # jsonschema validation errors are expected structural rejections.
        from jsonschema.exceptions import ValidationError
        if not isinstance(error, ValidationError): raise
        negative_cases.append({"name": name, "result": "REJECTED_AS_EXPECTED", "reason": error.message})
    else:
        raise AssertionError(f"Invalid candidate passed: {name}")


rejected("Missing discovery section", lambda c: c.pop("discovery"))
rejected("Unknown screen", lambda c: c["screens"][0].update(screenId="SC_UNKNOWN"))
rejected("Child missing execution rule", lambda c: c["workflowBindings"][1].pop("executionRule"))
rejected("Script condition", lambda c: c["capabilities"][0].update(enabledWhen={"script": "grantPermission()"}))
rejected("Rewrite started work", lambda c: c["migration"].update(preserveStartedWork=False))
rejected("Permission grant in manifest", lambda c: c.update(permissionGrant="all"))
rejected("Unknown workflow reference", lambda c: c["workflowBindings"][0]["workflow"].update(id="WF_NOT_REGISTERED"))
rejected("Unknown question reference", lambda c: c["questionBindings"][0]["question"].update(id="Q_NOT_REGISTERED"))
rejected("Unknown component reference", lambda c: c["screens"][0]["components"][0].update(id="CMP_NOT_REGISTERED"))
rejected("Missing local availability binding", lambda c: c["workflowBindings"][0].update(availabilityRef="missing_calendar"))
rejected("Duplicate screen instead of all eight", lambda c: c["screens"][1].update(screenId=c["screens"][0]["screenId"]))
rejected("Unsupported location value in fixture", lambda c: c["verification"]["fixtures"][0]["answers"].update(Q_SERVICE_LOCATION_MODE="digital"))

report = {
    "clientDate": "2026-10-29", "status": "CATEGORY_DESIGN_CHECKS_PASSED",
    "schemaDialect": "JSON Schema Draft 2020-12", "schemaValid": True,
    "typedQuestionSchemasValid": len(questions), "exampleValid": True,
    "questionReferences": len(example["questionBindings"]), "screenBindings": len(example["screens"]),
    "syntheticFixtureActivationsChecked": len(example["verification"]["fixtures"]),
    "negativeCases": negative_cases,
    "command": "C:\\Python314\\python.exe docs/merchant-portal-plan/verify-category.py",
    "scope": "Structural/selected semantic references and synthetic fixture activation. Does not implement production resolution, atomic publication, commands, resource reservation or provider authorization.",
    "runtimeStatus": "NOT_IMPLEMENTED_NOT_EXECUTED",
}
(ROOT / "category-verification.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps({key: report[key] for key in ["status", "typedQuestionSchemasValid", "questionReferences", "screenBindings", "syntheticFixtureActivationsChecked"]} | {"negativeCasesRejected": len(negative_cases)}, indent=2))
