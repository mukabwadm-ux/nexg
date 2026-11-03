"""Compile reconciled planning contracts. Does not modify the application."""
from __future__ import annotations
import copy
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PAYLOAD = HERE.parent
PLAN = PAYLOAD.parent
OPS = {"eq", "neq", "in", "contains", "intersects", "exists", "nonempty"}


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write(name, data):
    (HERE / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


class Contracts:
    def __init__(self):
        self.registry = read(HERE / "effective-question-registry.json")
        self.questions = {q["questionId"]: q for q in self.registry["questions"]}
        self.aliases = {a["sourceQuestionId"]: a for a in self.registry["aliases"]}
        self.decisions = read(HERE / "profile-decisions.json")
        self.models = {m["id"]: m for m in read(PAYLOAD / "models.json")["models"]}
        self.allowed_context = set(self.decisions["allowedContextPaths"])

    def question(self, ref):
        target = self.aliases.get(ref, {}).get("targetQuestionId", ref)
        if target not in self.questions:
            raise ValueError("Unregistered question " + ref)
        return self.questions[target]

    def compile(self, condition):
        for group in ("all", "any"):
            if group in condition:
                if not condition[group] or set(condition) != {group}:
                    raise ValueError("Invalid bounded group")
                return {group: [self.compile(x) for x in condition[group]]}
        if condition.get("op") not in OPS:
            raise ValueError("Unknown predicate operation")
        out = {"op": condition["op"]}
        if "questionRef" in condition:
            q = self.question(condition["questionRef"])
            out.update(path=q["canonicalTarget"], questionId=q["questionId"])
        elif condition.get("path") in self.allowed_context:
            out["path"] = condition["path"]
        else:
            raise ValueError("Unregistered predicate path " + str(condition))
        if condition["op"] not in {"nonempty", "exists"}:
            out["value"] = condition["value"]
        elif condition["op"] == "exists" and "value" in condition:
            out["value"] = condition["value"]
        return out


def evaluate(predicate, values):
    """Planning-only three-valued predicate interpreter; missing is unknown."""
    for group in ("all", "any"):
        if group in predicate:
            results = [evaluate(x, values) for x in predicate[group]]
            if group == "all":
                return False if False in results else None if None in results else True
            return True if True in results else None if None in results else False
    path, op = predicate["path"], predicate["op"]
    if op == "exists":
        return (path in values) == predicate.get("value", True)
    if path not in values or values[path] is None:
        return None
    actual, expected = values[path], predicate.get("value")
    equal = lambda a, b: type(a) is type(b) and a == b
    if op == "eq":
        return equal(actual, expected)
    if op == "neq":
        return not equal(actual, expected)
    if op == "nonempty":
        return len(actual) > 0 if isinstance(actual, (str, list, dict)) else False
    if op == "contains":
        return any(equal(v, expected) for v in actual) if isinstance(actual, list) else False
    if op == "in":
        return any(equal(actual, v) for v in expected)
    if op == "intersects":
        return any(equal(a, b) for a in actual for b in expected) if isinstance(actual, list) else False
    raise ValueError(op)


def resolve(profile, values):
    """Evaluate configured models only, never instantiate a booking or grant."""
    common = all(values.get(p) is True for p in ["context.offering_selected", "context.offering_setup_complete", "context.required_authority_resolved"])
    base_result = evaluate(profile["enablementGuard"], values)
    models = {profile["defaultModelId"]} if base_result is True else set()
    pending, matched, requirements, attributes, clarifications = [], [], set(), {}, []
    if not common:
        return {"models": [], "primaryModel": None, "status": "SETUP_REQUIRED", "createsWork": False, "clarifications": []}
    for binding in profile["bindings"]:
        outcome = evaluate(binding["condition"], values)
        if outcome is True:
            models.add(binding["modelId"])
            requirements.update(binding["requiredQuestionIds"])
            matched.append("binding:" + str(binding["bindingIndex"]))
        elif outcome is None:
            pending.append("binding:" + str(binding["bindingIndex"]))
    suppressed, replacements = set(), set()
    for rule in profile["rules"]:
        outcome = evaluate(rule["condition"], values)
        if outcome is None:
            pending.append(rule["id"])
        if outcome is not True:
            continue
        matched.append(rule["id"])
        effect = rule["effects"]
        models.update(effect.get("addModels", []))
        suppressed.update(effect.get("suppressModels", []))
        if effect.get("replacePrimaryModel"):
            replacements.add(effect["replacePrimaryModel"])
            models.add(effect["replacePrimaryModel"])
        requirements.update(rule["requiredQuestionIds"])
        for key, val in effect.get("setAttributes", {}).items():
            if key in attributes and attributes[key] != val:
                clarifications.append("Conflicting effects for " + key)
            attributes[key] = val
        if effect.get("clarification"):
            clarifications.append(effect["clarification"])
    models -= suppressed
    if len(replacements) > 1:
        clarifications.append("Conflicting selected primary models")
    selected = values.get("context.offering_model")
    primary = next(iter(replacements)) if len(replacements) == 1 else selected if selected in models else None
    missing = [qid for qid in sorted(requirements) if profile["questionPaths"][qid] not in values]
    if primary in profile.get("intakeByModel", {}) and primary not in {"ORDER", "ENTITLEMENT"}:
        mode = values.get(profile["intakePath"])
        allowed = profile["intakeByModel"][primary]["allowedModes"]
        if mode is not None and mode not in allowed:
            clarifications.append("Intake mode is not supported for " + primary)
    workflow_bindings = []
    for mid in sorted(models):
        options = profile["workflowOptionsByModel"][mid]
        if mid == "APPOINTMENT":
            workflow = "WF_REMOTE_SESSION" if values.get("context.selected_method") == "digital" or "digital" in attributes.values() else "WF_APPOINTMENT"
        elif mid == "SESSION_CAPACITY":
            workflow = "WF_EVENT_SESSION" if profile["sourceWorkflowId"] == "WF_EVENT_SESSION" else "WF_GROUP_ACTIVITY"
        elif mid == "REQUEST_QUOTE":
            workflow = "WF_REGULATED_ENQUIRY" if profile["sourceWorkflowId"] == "WF_REGULATED_ENQUIRY" else "WF_REQUEST_QUOTE"
        else:
            workflow = options[0]
        variant = "VAR_TRANSFER_GREETER_ONLY" if mid == "TRANSFER" and attributes.get("transportIncluded") is False else None
        workflow_bindings.append({"modelId": mid, "workflowId": workflow, "variantId": variant, "createsWork": False})
    return {"models": sorted(models), "primaryModel": primary,
            "status": "CLARIFICATION_REQUIRED" if clarifications else "SETUP_REQUIRED" if missing or primary is None else "CONFIGURED_NOT_OPERATIONALLY_VERIFIED",
            "requiredQuestions": missing, "pendingRules": pending, "matchedRules": matched,
            "attributes": attributes, "workflows": workflow_bindings, "clarifications": clarifications, "createsWork": False}


def workflows(bridge):
    source = (PLAN / "workflow-catalogue.md").read_text(encoding="utf-8")
    records = {}
    for section in re.split(r"^## (?=WF_)", source, flags=re.M)[1:]:
        header, _, body = section.partition("\n")
        wid, title = header.split(":", 1)
        edges = []
        for line in body.splitlines():
            if not line.startswith("| "):
                continue
            cells = [v.strip() for v in line.strip().strip("|").split("|")]
            if len(cells) != 5 or cells[0] in {"From", "---"}:
                continue
            if not re.fullmatch(r"[A-Z0-9_]+", cells[0]) or not re.fullmatch(r"[A-Z0-9_]+", cells[1]):
                continue
            edge = dict(zip(["from", "to", "actor", "command", "guard"], cells))
            edge["source"] = "workflow-catalogue.md"
            edges.append(edge)
        records[wid.strip()] = {"workflowId": wid.strip(), "title": title.strip(), "transitions": edges, "variants": []}
    used = []
    for override in bridge["transitionOverrides"]:
        candidates = [e for e in records[override["workflowId"]]["transitions"] if all(e[k] == override[k] for k in ["from", "to", "command"])]
        if not candidates:
            raise ValueError("Unmatched workflow correction " + str(override))
        for e in candidates:
            e["guard"] = override["replacementGuard"]
            e["additionalGuards"] = override.get("additionalGuards", [])
            e["source"] = "reconciled transition override"
        used.append(override)
    for declaration in bridge["newWorkflowDeclarations"]:
        records[declaration["workflowId"]] = copy.deepcopy(declaration)
    for binding in bridge["bindings"]:
        records[binding["workflowId"]].update(binding)
    for variant in bridge["variants"]:
        records[variant["workflowId"]].setdefault("variants", []).append(copy.deepcopy(variant))
        records[variant["workflowId"]]["transitions"].extend(copy.deepcopy(variant.get("additionalTransitions", [])))
    for binding in bridge.get("exceptionBindings", []):
        graph = records[binding["workflowId"]]
        graph["exceptionBinding"] = copy.deepcopy(binding)
        cancel = binding["cancellation"]
        for state in cancel["fromStates"]:
            graph["transitions"].append({"from": state, "to": cancel["pendingState"], "command": cancel["requestCommand"], "guard": "Applicable actor, policy and owner permit request; preserve confirmed resources/custody while pending."})
        graph["transitions"].append({"from": cancel["pendingState"], "to": cancel["cancelledState"], "command": cancel["confirmCommand"], "guard": cancel["confirmGuard"]})
        for key, target, command in [("holdExpiryFromStates", "holdExpiredState", "ConfirmTrustedHoldExpiry"), ("quoteExpiryFromStates", "quoteExpiredState", "ConfirmQuoteExpiry")]:
            for state in binding.get(key, []):
                graph["transitions"].append({"from": state, "to": binding[target], "command": command, "guard": bridge["exceptionContract"]["expiry"]})
        if binding.get("noShow"):
            n = binding["noShow"]
            for state in n["fromStates"]:
                graph["transitions"].append({"from": state, "to": n["targetState"], "command": n["command"], "guard": n["guard"]})
    for graph in records.values():
        merged = {}
        for edge in graph["transitions"]:
            key = (edge["from"], edge["to"], edge["command"])
            if key in merged:
                # Preserve both source and variant constraints on the one command.
                original = merged[key]
                original["guardBindings"] = list(dict.fromkeys(original.get("guardBindings", [original["guard"]]) + [edge["guard"]]))
                original["guard"] = " AND ".join(original["guardBindings"])
                original["actorBindings"] = list(dict.fromkeys(original.get("actorBindings", [original.get("actor", "owning authority")]) + [edge.get("actor", "owning authority")]))
            else:
                merged[key] = edge
        graph["transitions"] = list(merged.values())
        graph["states"] = sorted(set(graph.get("states", [])) | {e[k] for e in graph["transitions"] for k in ["from", "to"]})
        graph["runtimeEnabled"] = False
    return {"status": "RECONCILED_DESIGN_NOT_IMPLEMENTED", "commonGuards": bridge["commonGuards"],
            "reservationLifecycle": bridge["commonReservationLifecycle"], "exceptionContract": bridge["exceptionContract"],
            "appliedOverrideCount": len(used), "workflows": list(records.values())}


def domains(workflow_data):
    d = read(PLAN / "domain-registry.json")
    d["status"] = "RECONCILED_DESIGN_NOT_IMPLEMENTED"
    d["effectiveQuestionRegistry"] = "effective-question-registry.json"
    d["effectiveProfileRegistry"] = "effective-profiles-128.json"
    for item in d["offeringSchemas"]:
        item["specialtyComposition"]["registry"] = "effective-question-registry.json"
        item["specialtyComposition"]["profileSource"] = "effective-profiles-128.json"
        item["specialtyComposition"]["fieldPath"] = "sourceQuestionIds[]"
    for model in d["availabilityModels"]:
        if model["id"] == "AVAIL_PRODUCTION_V1":
            model["constraints"] = ["Current authoritative holds and confirmed commitments consume the declared capacity; released/expired holds do not. Broad bands never become exact durations."]
    base = {"version": "1.0.0-reconciled", "status": "PROPOSED_NOT_IMPLEMENTED", "runtimeEnabled": False}
    d["capabilities"].append({**base, "id": "space_reservations", "workflowIds": ["WF_SPACE_RESERVATION_V1"], "meaning": "Explicit table/space reservations with compatible party-size allocation and turnover.", "activationGate": "Explicit intent, scoped setup, authority and implemented commands required; system discovery is insufficient."})
    d["availabilityModels"].append({**base, "id": "AVAIL_SPACE_INTERVALS_V1", "workflowIds": ["WF_SPACE_RESERVATION_V1"], "capacityUnit": "party_and_compatible_space_interval", "requiredInputs": ["actual_space_inventory", "party_size", "exact_interval", "turnover", "allocation_authority"], "constraints": ["Compatible combined tables reserve atomically.", "Held and confirmed allocations consume the same space pool."]})
    d["offeringSchemas"].append({**base, "id": "SPACE_RESERVATION_V1", "workflowIds": ["WF_SPACE_RESERVATION_V1"], "proposedContractOwner": "catalog", "questionBindings": ["BQ_OFFERS_TABLE_RESERVATIONS", "BQ_SPACE_POLICY", "Q_APPOINTMENT_DURATION_MINUTES", "BQ_BUFFERS", "Q_DATA_AUTHORITY"],
        "schema": {"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object", "additionalProperties": False,
                   "required": ["offering_id", "version", "location_id", "space_policy_id", "duration_minutes", "turnover_minutes", "source_authority_id"],
                   "properties": {"offering_id": {"type": "string", "minLength": 1}, "version": {"type": "integer", "minimum": 1}, "location_id": {"type": "string", "minLength": 1}, "space_policy_id": {"type": "string", "minLength": 1}, "duration_minutes": {"type": "integer", "minimum": 1}, "turnover_minutes": {"type": "integer", "minimum": 0}, "source_authority_id": {"type": "string", "minLength": 1}}}})
    d["reconciliation"] = {"timezone": "Africa/Nairobi", "sourceDefinitionsPreserved": True, "newWorkflowId": "WF_SPACE_RESERVATION_V1", "workflowRegistry": "effective-workflows.json", "note": "Existing domain approval boundaries remain; the selected booking runtime is an implementation component, not authority to write another domain's facts."}
    d["counts"]["reconciledAdditionalDefinitions"] = 3
    return d


def generate():
    c = Contracts()
    source = {p["subcategoryId"]: p for p in read(PLAN / "profiles-128.json")["profiles"]}
    coverage = {r["subcategoryId"]: r for r in read(PAYLOAD / "coverage-128.json")["rows"]}
    wf_bridge = read(HERE / "workflow-bindings.json")
    wf_data = workflows(wf_bridge)
    write("effective-workflows.json", wf_data)
    write("effective-domain-registry.json", domains(wf_data))
    output = []
    for d in c.decisions["rows"]:
        sid, primary = d["subcategoryId"], d["defaultModelId"]
        profile = {"categoryId": d["categoryId"], "subcategoryId": sid, "name": d["name"], "sourceProfileId": source[sid]["id"],
                   "sourceWorkflowId": d["sourceWorkflowId"], "defaultModelId": primary, "specialtyNeeds": d["specialtyNeeds"],
                   "sourceQuestionKeys": d["sourceQuestionKeys"], "sourceQuestionIds": ["Q_" + key.upper() for key in d["sourceQuestionKeys"]],
                   "sourceDisposition": d["disposition"], "basePolicy": d["basePolicy"], "enablementGuard": c.compile(d["enablementGuard"]),
                   "intakePath": c.question("BQ_INTAKE_MODE")["canonicalTarget"], "intakeByModel": wf_bridge["intakeModesByModel"],
                   "bindings": [], "rules": [], "timezone": "Africa/Nairobi", "runtimeEnabled": False,
                   "implementationStatus": "NOT_STARTED", "runtimeTestStatus": "NOT_RUN", "createsWork": False,
                   "supersedes": "Legacy profile conditionalRules and prose-only coverage triggers for this specialty; never run both."}
        for b in d["coverageBindings"]:
            profile["bindings"].append({**copy.deepcopy(b), "condition": c.compile(b["when"]), "requiredQuestionIds": sorted({c.question(q)["questionId"] for q in b["requiredInputs"]})})
        for rule in d["rules"]:
            profile["rules"].append({**copy.deepcopy(rule), "condition": c.compile(rule["when"]), "requiredQuestionIds": sorted({c.question(q)["questionId"] for q in rule["effects"].get("requireInputs", [])})})
        candidates = {primary} | {b["modelId"] for b in profile["bindings"]}
        for rule in profile["rules"]:
            candidates.update(rule["effects"].get("addModels", []))
            if rule["effects"].get("replacePrimaryModel"):
                candidates.add(rule["effects"]["replacePrimaryModel"])
        profile["candidateModelIds"] = sorted(candidates)
        profile["candidateDataClassPolicy"] = {
            "always": ["offerings", "pricing", "work_items"],
            "forScheduledAllocations": ["resources", "availability", "reservations"],
            "onlyWhenApplicable": {"stock": "Actual inventory-controlled product/material stock; explicitly inventory-disabled offering does not fake stock.",
                                   "fulfillment": "Enabled carrier/team/custody execution requires its owner.",
                                   "service_areas": "Selected customer-location or covered physical fulfilment method.",
                                   "finance.payment": "Configured payment collection is relevant.",
                                   "finance.refund": "Configured refund action is relevant; payment authority does not grant refund authority.",
                                   "finance.settlement": "Settlement functionality is enabled.",
                                   "finance.payout": "Payout functionality is enabled."},
            "policy": "Compute applicable canonical leaf classes before readiness, including native ownership. capacity is a UI group and payments aliases only finance.payment; neither grants multiple authorities."}
        profile["modelContracts"] = [{"modelId": mid, "definitionRef": {"path": "../models.json", "id": mid},
                                     "workflowIds": sorted({b["workflowId"] for b in wf_bridge["bindings"] if mid in b["modelIds"]} | {b["workflowId"] for b in wf_bridge["newWorkflowDeclarations"] if b["modelId"] == mid}),
                                     "setup": c.models[mid]["requiredSetup"], "intakePolicy": wf_bridge["intakeModesByModel"][mid]} for mid in sorted(candidates)]
        profile["workflowOptionsByModel"] = {m["modelId"]: m["workflowIds"] for m in profile["modelContracts"]}
        profile["questionPaths"] = {qid: q["canonicalTarget"] for qid, q in c.questions.items()}
        profile["screens"] = {"SC_WORK": "Selected-model work graph, source ownership and allowed actions from effective-workflows.json; primary replacement changes vocabulary and stages.",
                              "SC_OFFERINGS": {"modelIds": sorted(candidates), "specialtyQuestionIds": profile["sourceQuestionIds"], "questionRegistry": "effective-question-registry.json"},
                              "SC_AVAILABILITY": {"timezone": "Africa/Nairobi", "views": {mid: c.models[mid]["calendar"] for mid in sorted(candidates)}, "activation": "Show actual selected configured models, not every candidate."},
                              "SC_BUSINESS": "Scoped locations/resources and claims; no verification inferred from answers.",
                              "SC_MONEY": "Configured versioned price/deposit/payment/refund policy and owner-confirmed outcomes only.",
                              "SC_PROMOTIONS": "Only real published enabled offerings and authoritative capacity eligible under policy.",
                              "SC_INSIGHTS": "Metrics from the actual selected workflow/model and confirmed evidence; source coverage shown, no automatic appointment metrics for retail.",
                              "SC_SETTINGS": "Scoped people, source authority, Google/messaging consent, policy revisions and audit."}
        profile["plannedCaseIds"] = [case["id"] for case in coverage[sid]["acceptanceCases"]]
        output.append(profile)
    # Shared paths are references, not duplicated canonical answer definitions in each profile.
    paths = {qid: q["canonicalTarget"] for qid, q in c.questions.items()}
    for p in output:
        p.pop("questionPaths")
    write("effective-profiles-128.json", {"schemaVersion": "1.0.0-reconciled-design", "status": "RECONCILED_NOT_IMPLEMENTED", "scope": "Configuration plans only; no reservations/permissions created.", "timezone": "Africa/Nairobi", "allowedContextPaths": sorted(c.allowed_context), "questionPaths": paths, "rows": output})
    files = ["effective-question-registry.json", "question-bridge.json", "profile-decisions.json", "workflow-bindings.json", "effective-profiles-128.json", "effective-workflows.json", "effective-domain-registry.json"]
    inputs = [PLAN / "question-registry.json", PLAN / "profiles-128.json", PLAN / "domain-registry.json", PLAN / "workflow-catalogue.md", PAYLOAD / "models.json", PAYLOAD / "extensions.json", PAYLOAD / "coverage-128.json"]
    manifest = {"date": "2026-10-31", "status": "RECONCILED_DESIGN_NOT_IMPLEMENTED", "entryPoint": "README.md", "questionRegistry": "effective-question-registry.json", "profileRegistry": "effective-profiles-128.json", "workflowRegistry": "effective-workflows.json", "domainRegistry": "effective-domain-registry.json", "inputBase": "../..", "sourceVerification": c.decisions.get("sourceVerification"), "precedence": "Use one generated effective snapshot. Older registries are source/audit history; never replay their superseded rule effects.", "buildCommand": "C:/Python314/python.exe docs/merchant-portal-plan/payload-reserve-plan/reconciliation/reconcile.py", "validationCommand": "C:/Python314/python.exe docs/merchant-portal-plan/payload-reserve-plan/reconciliation/verify_reconciliation.py", "inputSha256": {str(p.relative_to(PLAN)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}, "sha256": {f: hashlib.sha256((HERE / f).read_bytes()).hexdigest() for f in files}}
    manifest["generationCommands"] = [
        "C:/Python314/python.exe docs/merchant-portal-plan/payload-reserve-plan/reconciliation/generate-question-registry.py",
        "C:/Python314/python.exe docs/merchant-portal-plan/payload-reserve-plan/generate-coverage.py",
        manifest["validationCommand"],
        "C:/Python314/python.exe docs/merchant-portal-plan/payload-reserve-plan/verify-plan.py"
    ]
    write("manifest.json", manifest)
    print(json.dumps({"profiles": len(output), "questions": len(c.questions), "workflows": len(wf_data["workflows"]), "workflowOverrides": wf_data["appliedOverrideCount"]}))


if __name__ == "__main__":
    generate()
