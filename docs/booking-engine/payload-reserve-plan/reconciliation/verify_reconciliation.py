"""Check reconciled planning contracts and configuration semantics, not a live engine."""
from __future__ import annotations
import collections
import copy
import json
import re
from pathlib import Path
from jsonschema import Draft202012Validator
from reconcile import HERE, PAYLOAD, PLAN, Contracts, evaluate, generate, read, resolve, write


def check(ok, message):
    if not ok:
        raise AssertionError(message)


def leaves(expr):
    for op in ("all", "any"):
        if op in expr:
            return [leaf for c in expr[op] for leaf in leaves(c)]
    return [expr]


def main():
    generate()
    c = Contracts()
    data = read(HERE / "effective-profiles-128.json")
    rows = data["rows"]
    by_id = {r["subcategoryId"]: r for r in rows}
    taxonomy = read(PLAN.parent / "audits/merchant-onboarding-128-taxonomy.json")["rows"]
    coverage = read(PAYLOAD / "coverage-128.json")
    workflows = read(HERE / "effective-workflows.json")
    wf_map = {w["workflowId"]: w for w in workflows["workflows"]}
    bridge = read(HERE / "workflow-bindings.json")
    check(len(rows) == len(by_id) == 128 and set(by_id) == {r["id"] for r in taxonomy}, "Exact 128 coverage")
    check(len({r["categoryId"] for r in rows}) == 21, "Category baseline")
    check(c.decisions["sourceVerification"]["comparisonResult"] == "NO_DIFFERENCES", "Current taxonomy evidence")
    check(len({q["canonicalTarget"] for q in c.questions.values()}) == len(c.questions), "Canonical path collision")
    check(len(c.registry["aliases"]) == 31, "All BQ inputs must resolve")
    source_question_ids = {q["questionId"] for q in read(PLAN / "question-registry.json")["questions"]}
    check(source_question_ids <= set(c.questions), "Lost onboarding identities")
    schemas_checked = 0
    canonical_classes = {x["id"] for x in read(PLAN / "domain-registry.json")["dataClasses"]}
    authority_enum = set(c.question("Q_DATA_AUTHORITY")["valueSchema"]["items"]["properties"]["data_class"]["enum"])
    check(authority_enum == canonical_classes, "Authority data classes diverge from domain registry")
    check("payments" not in authority_enum and "capacity" not in authority_enum, "Grouping cannot grant multiple authorities")
    for q in c.questions.values():
        Draft202012Validator.check_schema(q["valueSchema"])
        check(q.get("normalization") is not None, "Missing normalization " + q["questionId"])
        schemas_checked += 1
    timezone = c.question("Q_LOCATION_TIMEZONE")
    check(timezone["askMerchant"] is False and timezone["valueSchema"]["const"] == "Africa/Nairobi", "Kenya constant")
    check(not Draft202012Validator(timezone["valueSchema"]).is_valid("UTC"), "Cannot override Kenya zone")
    for q in c.questions.values():
        for field in ["visibleWhen", "requiredWhen"]:
            for leaf in leaves(q[field]):
                check(leaf.get("path") != "answers.existing_systems", "Stale system-discovery path")
                check(leaf.get("path") != "resolved.resource_selection_mode", "Stale resource selection path")
                if q["questionId"].startswith("BQ_") and field == "visibleWhen":
                    check(leaf.get("path") != "resolved.active_booking_models", "Onboarding depends on its own activation")
    # Each predicate literal must be a valid canonical value or array element.
    predicates_checked = 0
    for p in rows:
        check(p["createsWork"] is False and p["runtimeEnabled"] is False, "Plan cannot grant runtime work")
        check(len(p["screens"]) == 8, "Eight screen binding missing")
        check(set(p["sourceQuestionIds"]) <= source_question_ids, "Source specialty fields lost")
        for model in p["modelContracts"]:
            check(set(model["workflowIds"]) <= set(wf_map), "Missing effective workflow")
        exprs = [p["enablementGuard"]] + [b["condition"] for b in p["bindings"]] + [r["condition"] for r in p["rules"]]
        for expr in exprs:
            for leaf in leaves(expr):
                predicates_checked += 1
                if "questionId" not in leaf or leaf["op"] in {"exists", "nonempty"}:
                    continue
                schema = c.questions[leaf["questionId"]]["valueSchema"]
                literal = leaf["value"]
                if leaf["op"] in {"contains", "intersects"}:
                    check(schema.get("type") == "array", "Array operator on nonarray " + str(leaf))
                    schema = schema["items"]
                values = literal if leaf["op"] in {"in", "intersects"} else [literal]
                for v in values:
                    check(Draft202012Validator(schema).is_valid(v), "Invalid typed predicate literal " + str(leaf))
        check(set(p["plannedCaseIds"]) <= {t["id"] for row in coverage["rows"] for t in row["acceptanceCases"]}, "Lost scenario reference")
    evidence = []

    def fixture(sid, model=None, answers=None, context=None):
        p = copy.deepcopy(by_id[sid])
        p["questionPaths"] = data["questionPaths"]
        values = {"context.offering_selected": True, "context.offering_setup_complete": True, "context.required_authority_resolved": True,
                  "context.offering_model": model or p["defaultModelId"], "context.selected_offering_kind": "service", "context.selected_method": "merchant_location"}
        for qid, val in (answers or {}).items():
            values[c.question(qid)["canonicalTarget"]] = val
        values.update(context or {})
        return p, values

    def scenario(name, sid, answers, context, predicate, model=None):
        p, values = fixture(sid, model, answers, context)
        result = resolve(p, values)
        check(predicate(result), name + ": " + json.dumps(result))
        evidence.append({"id": name, "subcategoryId": sid, "result": result, "status": "PLANNING_SEMANTICS_PASSED"})

    # Every specialty must reject unselected/incomplete/unowned configuration.
    readiness_count = 0
    for sid in by_id:
        for flag in ["context.offering_selected", "context.offering_setup_complete", "context.required_authority_resolved"]:
            p, v = fixture(sid, context={flag: False})
            result = resolve(p, v)
            check(result["models"] == [] and result["status"] == "SETUP_REQUIRED", "Readiness bypass " + sid + "/" + flag)
            readiness_count += 1
    # Independent product expectations, not generated from the resolver output.
    scenario("rental_driver_stays_rental", "car_rental", {"Q_WITH_DRIVER": True}, {"context.selected_driver_option": "with_driver"}, lambda r: r["models"] == ["ASSET_INTERVAL"] and r["attributes"]["resourceBundle"] == "asset_and_eligible_driver")
    scenario("rental_self_drive_needs_no_driver", "car_rental", {"Q_WITH_DRIVER": True}, {"context.selected_driver_option": "self_drive"}, lambda r: r["models"] == ["ASSET_INTERVAL"] and r["attributes"]["driverAllocationRequired"] is False)
    scenario("clinic_no_appointments", "clinics", {"Q_APPOINTMENT_BOOKING": False}, {}, lambda r: "APPOINTMENT" not in r["models"])
    scenario("battery_workshop_replaces_dispatch", "battery_service", {"Q_MOBILE_SERVICE": False}, {"context.selected_method": "merchant_location", "context.selected_offering_kind": "service_job"}, lambda r: r["models"] == ["SERVICE_JOB"] and r["primaryModel"] == "SERVICE_JOB", "SERVICE_JOB")
    scenario("optional_makeup_booking_retained", "makeup", {"Q_BOOKING_REQUIRED": False, "BQ_ACCEPTS_SCHEDULED_BOOKINGS": True}, {}, lambda r: "APPOINTMENT" in r["models"])
    scenario("contradictory_booking_intent_clarifies", "makeup", {"Q_BOOKING_REQUIRED": True, "BQ_ACCEPTS_SCHEDULED_BOOKINGS": False}, {}, lambda r: r["status"] == "CLARIFICATION_REQUIRED")
    scenario("retail_not_an_appointment", "shoes", {}, {"context.selected_offering_kind": "product"}, lambda r: r["models"] == ["ORDER"])
    scenario("makeup_product_has_no_base_appointment", "makeup", {"Q_PRODUCTS_FOR_SALE": True}, {"context.selected_offering_kind": "product"}, lambda r: r["models"] == ["ORDER"], "ORDER")
    scenario("system_discovery_does_not_enable_table", "restaurant", {"Q_RESERVATION_SYSTEM": True}, {"context.selected_offering_kind": "product"}, lambda r: r["models"] == ["ORDER"])
    scenario("table_can_use_native_without_existing_system", "restaurant", {"Q_RESERVATION_SYSTEM": False, "BQ_OFFERS_TABLE_RESERVATIONS": True}, {"context.selected_offering_kind": "space_reservation"}, lambda r: r["models"] == ["SPACE_RESERVATION"], "SPACE_RESERVATION")
    scenario("class_recurring_not_membership", "classes", {"Q_RECURRING_SESSIONS": True}, {}, lambda r: "SESSION_CAPACITY" in r["models"] and "ENTITLEMENT" not in r["models"])
    scenario("sourcing_books_not_manufacture", "books", {"Q_CUSTOM_ORDERS": True, "BQ_CUSTOM_ORDER_KIND": "special_sourcing"}, {"context.selected_offering_kind": "product"}, lambda r: "PRODUCTION_DUE" not in r["models"])
    scenario("greeter_only_no_vehicle", "meet_greet", {"BQ_GREETER_TRANSPORT_INCLUDED": False}, {}, lambda r: r["attributes"].get("transportIncluded") is False or "greeter" in json.dumps(r["attributes"]).lower())
    scenario("freight_cannot_use_generic_instant", "road_freight", {"BQ_INTAKE_MODE": "instant_after_requirements"}, {}, lambda r: r["status"] == "CLARIFICATION_REQUIRED")
    scenario("remote_therapy_uses_remote_workflow", "mental_health", {"BQ_BOOKING_ENABLED": True, "Q_SESSION_FORMAT": "online"}, {"context.selected_method": "digital"}, lambda r: any(w["workflowId"] == "WF_REMOTE_SESSION" for w in r["workflows"]))
    scenario("bank_enquiry_preserves_provider_workflow", "banking", {}, {}, lambda r: any(w["workflowId"] == "WF_REGULATED_ENQUIRY" for w in r["workflows"]))
    # Three-valued conditions and strict typed values.
    check(evaluate({"path": "x", "op": "neq", "value": False}, {}) is None, "Missing inequality must remain unknown")
    check(evaluate({"path": "x", "op": "eq", "value": False}, {"x": 0}) is False, "Zero is not false")
    check(evaluate({"path": "x", "op": "eq", "value": False}, {"x": False}) is True, "False answer is valid")
    # Aliases are one fact; conflicting values cannot overwrite one another.
    alias_tests = []
    groups = collections.defaultdict(list)
    for alias in c.registry["aliases"]:
        check(alias["targetQuestionId"] in c.questions, "Unknown alias target")
        Draft202012Validator.check_schema(alias["inputSchema"])
        groups[alias["targetQuestionId"]].append(alias["sourceQuestionId"])
    check(c.question("BQ_ACCEPTS_SCHEDULED_BOOKINGS")["questionId"] == c.question("BQ_BOOKING_ENABLED")["questionId"], "Duplicate bookable fact")
    values = [(c.question(ref)["canonicalTarget"], value) for ref, value in [("BQ_BOOKING_ENABLED", True), ("BQ_ACCEPTS_SCHEDULED_BOOKINGS", False)]]
    check(values[0][0] == values[1][0] and values[0][1] != values[1][1], "Expected scoped alias conflict")
    alias_tests.append("conflicting_alias_answers_require_clarification")
    check(c.question("Q_MIN_ORDER")["canonicalTarget"] != c.question("Q_MIN_BASKET")["canonicalTarget"], "Legacy declarations collide")
    for qid, bad in [("Q_APPOINTMENT_DURATION_MINUTES", 0), ("BQ_CAPACITY", {"capacity": 100}), ("BQ_SPACE_POLICY", {"party_size": 0})]:
        check(not Draft202012Validator(c.question(qid)["valueSchema"]).is_valid(bad), "Invalid setup accepted " + qid)
        alias_tests.append("invalid_" + qid)
    # Workflows have registered states/edges and independent allocation lifecycle.
    edge_count = 0
    for g in workflows["workflows"]:
        seen = set()
        for e in g["transitions"]:
            key = (e["from"], e["to"], e["command"])
            check(key not in seen, "Ambiguous duplicate workflow command " + g["workflowId"] + str(key))
            seen.add(key)
            check(e["from"] in g["states"] and e["to"] in g["states"] and e["guard"], "Invalid workflow graph")
            edge_count += 1
    rule_ids = [r["id"] for p in rows for r in p["rules"]]
    check(len(rule_ids) == len(set(rule_ids)), "Duplicate effective rule ID")
    check(len(wf_map) == 18 and workflows["appliedOverrideCount"] == 23, "Workflow mapping completeness")
    for wid, command in [("WF_RENTAL", "ConfirmRental"), ("WF_TRANSFER", "ConfirmTransfer")]:
        guard = " ".join(e["guard"] + " " + " ".join(e.get("additionalGuards", [])) for e in wf_map[wid]["transitions"] if e["command"] == command).lower()
        check("driver" in guard and ("allocat" in guard or "reserv" in guard), "Joint resource gate absent " + wid)
    greeter = next(v for v in bridge["variants"] if v["id"] == "VAR_TRANSFER_GREETER_ONLY")
    check(not set(greeter["states"]) & set(greeter["excludedStates"]), "Greeter graph invents passenger stages")
    # Future category can bind registered types; an arbitrary type/ref is rejected.
    future = copy.deepcopy(by_id["vehicle_inspection"])
    future["subcategoryId"] = "future_bicycle_diagnostics"
    future["questionPaths"] = data["questionPaths"]
    check(future["defaultModelId"] in c.models, "Reusable future category model")
    try:
        c.compile({"questionRef": "UNREGISTERED_CATEGORY_SCRIPT", "op": "eq", "value": True})
    except ValueError:
        pass
    else:
        raise AssertionError("Unregistered category expression accepted")
    # Domain additions resolve model-specific table requirements.
    domains = read(HERE / "effective-domain-registry.json")
    check(any(s["id"] == "SPACE_RESERVATION_V1" for s in domains["offeringSchemas"]), "Missing space offering schema")
    for s in domains["offeringSchemas"]:
        Draft202012Validator.check_schema(s["schema"])
    for p in rows:
        policy = p["candidateDataClassPolicy"]
        check(set(policy["always"] + policy["forScheduledAllocations"] + list(policy["onlyWhenApplicable"])) <= canonical_classes, "Unknown candidate data-class leaf")
    allowed_general_intake = set(c.question("BQ_INTAKE_MODE")["valueSchema"]["enum"])
    for mid, policy in bridge["intakeModesByModel"].items():
        if mid not in {"ORDER", "ENTITLEMENT"}:
            check(set(policy["allowedModes"]) <= allowed_general_intake, "Unknown intake mode " + mid)
    links_checked = 0
    for md in HERE.glob("*.md"):
        for target in re.findall(r"\]\(([^)]+)\)", md.read_text(encoding="utf-8")):
            if target.startswith(("https:", "http:", "#")):
                continue
            target = target.split("#", 1)[0].strip("<>")
            if (md.parent / target).resolve() == HERE / "verification.json":
                continue
            check((md.parent / target).resolve().is_file(), "Broken reconciliation link " + md.name + ": " + target)
            links_checked += 1
    report = {"date": "2026-10-31", "status": "RECONCILIATION_CHECKS_PASSED", "runtimeStatus": "NOT_IMPLEMENTED_NOT_TESTED", "counts": {"categories": 21, "subcategories": len(rows), "preservedSourceQuestions": len(source_question_ids), "canonicalQuestions": len(c.questions), "BQInputsMapped": 31, "workflowContracts": len(wf_map), "workflowGuardCorrections": 23, "workflowEdges": edge_count, "typedPredicateLeaves": predicates_checked, "readinessRejectionScenarios": readiness_count, "targetedBehaviorScenarios": len(evidence), "aliasAndInvalidValueChecks": len(alias_tests)}, "timezone": "Africa/Nairobi", "sourceVerification": c.decisions["sourceVerification"], "scenarios": evidence, "additionalChecks": alias_tests, "limitation": "Local planning compilation/schema and configuration-semantic checks only; no real merchant booking, allocation concurrency, access enforcement, Google or payment execution."}
    report["counts"]["canonicalAuthorityDataClasses"] = len(canonical_classes)
    report["counts"]["localLinksChecked"] = links_checked
    write("verification.json", report)
    print(json.dumps({k: v for k, v in report.items() if k in {"status", "runtimeStatus", "counts"}}))


if __name__ == "__main__":
    main()
