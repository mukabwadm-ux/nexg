"""Generate planning coverage from the reconciled 128 specialty decisions.

The onboarding question registry, profile decisions and shared model register
are authoritative inputs. This file does not re-author conditions in prose.
Writes only coverage-128.json and coverage-128.md. No app/provider work runs.
"""
from __future__ import annotations
import json
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLAN = HERE.parent
AUDIT = PLAN.parent / "audits" / "merchant-onboarding-128-taxonomy.json"
PROFILES = PLAN / "profiles-128.json"
RECON = HERE / "reconciliation"

VIEW = {'ORDER': 'Orders and fulfilment promises; hours or explicitly enabled delivery/collection windows; no '
          'default appointment grid',
 'APPOINTMENT': 'Day/week staff-resource calendar plus agenda and booking detail',
 'FIELD_VISIT': 'Team visit agenda and resource calendar with service location and travel constraints',
 'ASSET_INTERVAL': 'Asset-by-date interval timeline with handover, return and maintenance',
 'TRANSFER': 'Pickup agenda and vehicle/driver resource lanes with trip and waiting intervals',
 'SESSION_CAPACITY': 'Dated session list/calendar with held, confirmed and remaining places',
 'SPACE_RESERVATION': 'Host agenda and table/space lanes with party size and turnover',
 'TOUR': 'Departure-capacity calendar and multi-day itinerary/resource agenda',
 'PRODUCTION_DUE': 'Specification/approval work queue and production due-date/capacity view',
 'REQUEST_QUOTE': 'Request/quote work queue and response milestones; tentative dates clearly labelled',
 'LINKED_WINDOWS': 'Linked collection, processing and return agenda with separate commitments',
 'SERVICE_JOB': 'Intake/assessment/workshop queue with optional scheduled bay/resource agenda',
 'ENTITLEMENT': 'Plan/usage/renewal view linked to separately reserved sessions',
 'FREIGHT': 'Shipment-leg and cutoff/milestone agenda with carrier confirmation state',
 'STORAGE': 'Storage occupancy timeline with measured capacity and access-window agenda'}

NORMAL = {'ORDER': ('a published stock-owned offering and selected fulfilment method exist; no scheduled service '
           'was selected',
           'submit the order',
           'use the declared order/inventory authority and create no staff, space or asset appointment; '
           'show a fulfilment promise only if its owner has confirmed it'),
 'APPOINTMENT': ('a published service has exact duration, eligible resources and confirmed free '
                 'capacity',
                 'confirm a selected service time',
                 'reserve required resources together for the duration and buffers, retain method and '
                 'show the authority-confirmed appointment'),
 'FIELD_VISIT': ('an accepted service has exact duration, eligible crew, feasible service area and '
                 'travel allowance',
                 'confirm a customer-location visit',
                 'reserve crew/equipment and travel occupancy under the same business authority; record '
                 'the actual location and visit promise'),
 'ASSET_INTERVAL': ('a declared eligible asset is available for an exact rental range including '
                    'turnaround',
                    'confirm the rental interval',
                    'reserve the asset for the complete interval and preserve handover/return '
                    'obligations and relevant policy snapshot'),
 'TRANSFER': ('a requested trip has pickup/drop-off, exact time and compatible confirmed resources',
              'confirm the transfer or greeter service',
              'allocate every required driver/vehicle/greeter together for the accepted occupancy; show '
              'the pickup promise without fabricating flight status'),
 'SESSION_CAPACITY': ('a dated session has declared place capacity and the requested quantity is '
                      'available',
                      'confirm admission to that session',
                      'consume the requested places in the same pool as active holds and retain the '
                      'session/resource identity'),
 'SPACE_RESERVATION': ('compatible table/space inventory is free for the exact dining/event interval '
                       'and party size',
                       'confirm the space reservation',
                       'reserve an allowed space allocation with turnover; do not treat total seats '
                       'alone as proof of a suitable table'),
 'TOUR': ('a dated tour/departure has confirmed guest capacity, eligible resources and required '
          'supplier acceptance',
          'confirm the selected itinerary or departure',
          'retain guest quantities, resources and local itinerary dates; pending supplier legs remain '
          'visibly pending instead of confirmed'),
 'PRODUCTION_DUE': ('specification, quantity, approval and exact lead time/cutoff are accepted',
                    'accept the production order and due promise',
                    'allocate declared production capacity if controlled locally and preserve '
                    'specification/version plus the confirmed fulfilment promise'),
 'REQUEST_QUOTE': ('the customer supplies request scope and a preferred date without confirmed provider '
                   'capacity',
                   'submit the enquiry or quote request',
                   'create a request and response milestone; confirm no provider resource, financial '
                   'outcome or third-party reservation merely from submission'),
 'LINKED_WINDOWS': ('intake quantity and method have feasible processing, collection and return windows',
                    'accept the laundry/processing work',
                    'record distinct feasible collection/intake and return commitments; transport '
                    'allocations exist only for the offered selected method'),
 'SERVICE_JOB': ('the selected service has a declared queue or scheduled intake and assessment/approval '
                 'policy',
                 'accept the job intake',
                 'create the proper job state; reserve bay/staff only under a configured scheduling '
                 'command and preserve any assessment-before-price requirement'),
 'ENTITLEMENT': ('an explicit plan has accepted scope, validity dates, usage units and confirmed '
                 'commercial acceptance',
                 'activate or use the plan',
                 'record entitlement/usage with correct authority; do not reserve staff, equipment or '
                 'all future sessions merely by activating a plan'),
 'FREIGHT': ("shipment scope, quantity/unit, legs and quote have the responsible carrier's required "
             'acceptance',
             'confirm the agreed shipment commitment',
             "retain each leg's authoritative confirmation and milestone windows; no local event "
             'invents vessel, aircraft or truck capacity'),
 'STORAGE': ('measured goods requirements and compatible unit/pool capacity are confirmed for an '
             'occupancy range',
             'confirm the storage allocation',
             'reserve the stated measured quantity across the accepted occupancy interval and retain '
             'unit conversion and billing terms separately')}

CONFLICT = {'ORDER': "A calendar's empty time does not prove inventory or delivery capacity; reject or keep "
          "pending under the inventory/fulfilment owner's result and create no fake appointment.",
 'APPOINTMENT': 'Only one incompatible allocation of the same staff/room/equipment interval may '
                "confirm; preserve the rejected customer's alternatives.",
 'FIELD_VISIT': 'Reject overlapping crew/equipment or infeasible travel commitments; a free '
                'customer-facing time alone is insufficient.',
 'ASSET_INTERVAL': 'Two overlapping commands for the same asset cannot both confirm; include turnaround '
                   'and maintenance, preserving the existing rental.',
 'TRANSFER': 'Allocate required driver and vehicle all-or-none; another trip sharing either resource '
             'cannot also confirm an incompatible occupancy.',
 'SESSION_CAPACITY': 'Concurrent attempts for the final available places cannot overcommit the session; '
                     'holds count and a losing command receives a recoverable capacity result.',
 'SPACE_RESERVATION': 'Competing party requests cannot share the same incompatible table/space '
                      'interval; table-combination rules and turnover remain enforced.',
 'TOUR': 'Shared departure places and guide/vehicle allocations cannot be double-consumed; an '
         'unconfirmed supplier leg prevents false itinerary confirmation.',
 'PRODUCTION_DUE': 'A due promise exceeding controlled production capacity or missing the exact '
                   'lead-time cutoff is rejected or routed to request/approval rather than silently '
                   'overpromised.',
 'REQUEST_QUOTE': 'Multiple preferred-date requests may coexist, but none consumes or guarantees '
                  'resource capacity before the authoritative commitment step.',
 'LINKED_WINDOWS': 'Do not accept a return promise that conflicts with processing/transport capacity '
                   'even if the collection window alone is free.',
 'SERVICE_JOB': 'Two scheduled jobs cannot occupy the same exclusive bay/technician interval; a queue '
                'estimate is never presented as a guaranteed slot.',
 'ENTITLEMENT': 'Concurrent plan use cannot overspend confirmed usage allowance; entitlement is not a '
                'bypass around separate session capacity checks.',
 'FREIGHT': 'A preferred departure or local truck calendar cannot override carrier capacity rejection; '
            'each leg stays requested until its owner confirms.',
 'STORAGE': 'Overlapping occupancy commands cannot exceed the compatible measured pool or claim the '
            'same exclusive storage unit; unit conversions cannot silently change the available '
            'quantity.'}



def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def render_condition(node, aliases, registry):
    if "all" in node or "any" in node:
        key = "all" if "all" in node else "any"
        joiner = " AND " if key == "all" else " OR "
        return "(" + joiner.join(render_condition(n, aliases, registry) for n in node[key]) + ")"
    if "questionRef" in node:
        source = node["questionRef"]
        ref = aliases.get(source, source)
        assert ref in registry, (source, ref)
        name = ref
        if source.startswith("BQ_"):
            original_key = next((a["sourceKey"] for a in load(RECON / "question-bridge.json")["aliases"] if a["sourceQuestionId"] == source), None)
            if original_key:
                name += " [bookingSetup." + original_key + "]"
    else:
        name = node["path"]
    op = node["op"]
    value = json.dumps(node.get("value"), ensure_ascii=False)
    return f"{name} {op} {value}"


def conditional_models(decision, registered_models, aliases, registry):
    result = []
    for expected_index, binding in enumerate(decision["coverageBindings"]):
        assert binding["bindingIndex"] == expected_index
        target = binding["modelId"]
        refs = list(dict.fromkeys(aliases.get(k, k) for k in binding["requiredInputs"]))
        assert set(refs) <= set(registry), refs
        result.append({
            "modelId": target,
            "bindingIndex": binding["bindingIndex"],
            "trigger": render_condition(binding["when"], aliases, registry),
            "authoringCondition": binding["when"],
            "requiredSetup": registered_models[target]["requiredSetup"],
            "requiredQuestionRefs": refs,
            "composition": binding["composition"],
            "selectionPolicy": binding["selectionPolicy"],
            "createsWork": False,
            "applicabilityPolicy": decision["requiredSetupPolicy"],
            "note": binding["note"],
        })
    return result


def cases(p, model, conditions, decision):
    sid, name = p["subcategoryId"], p["name"]
    given, when, expected = NORMAL[model]
    context = decision["specialtyNeeds"]
    guard = "The actual offering's trusted model matches this scenario and its reconciled selection, typed-answer, applicable setup and authority guards pass. A category default alone is insufficient."
    def case(kind, g, w, e):
        return {"id": f"PR_{sid}_{kind.upper()}", "kind": kind,
                "given": f"Hypothetical {name} fixture: {g}", "when": w, "expected": e}
    if conditions:
        chosen = conditions[0]
        conditional = case("conditional_or_nonbooking", f"a potential {chosen['modelId']} offering/linked execution is not selected and required setup is incomplete", f"inspect or declare the conditional configuration: {chosen['trigger']}", "No booking, allocation or charge is created. Publish a promise only after the actual selected offering's relevant eligibility, setup and authority guards pass. Do not retain a contradicted category-default model. Preserve existing valid obligations. " + context)
    else:
        conditional = case("conditional_or_nonbooking", "no extra bookable offering or linked execution is selected", "open this specialty's configured work/availability view", f"Show the applicable configured view ({VIEW[model]}) only under its reconciled guards; no category-name-based appointment or unconditional default activation. Existing valid obligations remain visible. {context}")
    block = "the relevant resource authority is unknown or stale" if model not in {"ORDER", "REQUEST_QUOTE", "ENTITLEMENT"} else "the applicable inventory, enquiry-provider or plan authority is unavailable; irrelevant reservation authority is explicitly not applicable"
    result = [
        case("normal", given + ". " + guard, f"For {name}, {when}", expected + ". Apply every matching selected-scope modifier before the command; do not retain a contradicted default. Specialty constraint: " + context),
        conditional,
        case("conflict", "the actual selected offering's resource, measured capacity or provider promise is already constrained", f"a competing {name} command asks for an incompatible commitment", CONFLICT[model] + " Reconcile model eligibility and applicable ownership; preserve existing confirmed work."),
        case("access", f"another business or unpermitted staff guesses a {name} record/resource ID", "query, export, or send a create/change/cancel command", "Deny unauthorized data/action on the server. Neither category selection nor caller-supplied context grants access or selects another business's offering."),
        case("source_failure", block, f"attempt to confirm selected {name} work", "Follow authority for applicable data classes only. Show unknown, pending or request-only as contracted; never infer free capacity, instantiate a default booking or confirm from an absent response. Preserve operation identity and existing obligations."),
        case("retry", f"an accepted {name} command may have committed before its response timed out", "retry the same operation or receive a duplicate callback", "Return/reconcile one outcome with no duplicate booking, child execution, allocation, entitlement use, charge or notification. Failed changes retain the original valid commitment."),
        case("kenya_time", f"a selected {name} timed or date-only promise crosses Kenya midnight", "save, reopen and synchronize where enabled", "Use Africa/Nairobi without a timezone picker, UTC instants for timed commitments and separate local dates. Do not shift the accepted local day or apply irrelevant appointment fields to a non-booking model."),
    ]
    for binding in conditions:
        index, target = binding["bindingIndex"], binding["modelId"]
        composition = binding["composition"]
        expected_by_state = {
            "positive": f"Make {target} eligible only for the actual selected offering or selected linked-execution scope after its guards and required inputs pass. Respect {composition}: a selected-model variant can replace the category hint; linked execution is instantiated once only by its authorized accepted parent command. Retain only independently eligible models, not an unconditional {model} primary. Create no booking merely from configuration. {context}",
            "negative": f"This binding does not enable {target}. Re-evaluate the selected offering model and other genuinely independent eligible bindings; never retain {model} solely because it was the category default. Do not erase existing valid obligations or manufacture another activity.",
            "missing": f"Keep this {target} binding unresolved and ask only its missing applicable inputs. Missing is unknown, not false or unlimited capacity. Do not publish an unresolved booking promise or default fallback; preserve valid established obligations.",
            "conflicting": f"Require scoped clarification of conflicting aliases, source declarations, selected model/method or setup for {target}. Do not use latest-answer-wins, preserve a contradicted {model} default or create work. Keep existing valid obligations and independently eligible offerings.",
        }
        given_by_state = {
            "positive": "the typed condition is confirmed in the correct selected offering/child scope with complete applicable setup and authority",
            "negative": "the typed condition is explicitly declined in this scope",
            "missing": "at least one condition answer or applicable required input is absent/unknown",
            "conflicting": "typed aliases, declarations or selected-scope operational facts contradict one another",
        }
        for state in ["positive", "negative", "missing", "conflicting"]:
            result.append({
                "id": f"PR_{sid}_B{index}_{target}_{state.upper()}", "kind": "conditional_binding",
                "bindingIndex": index, "modelId": target, "conditionState": state,
                "condition": binding["trigger"], "authoringCondition": binding["authoringCondition"],
                "requiredSetup": binding["requiredSetup"], "requiredQuestionRefs": binding["requiredQuestionRefs"],
                "composition": composition,
                "given": f"Hypothetical {name} / binding {index} / {target}: {given_by_state[state]}. Specialty context: {context}",
                "when": f"Resolve this condition under its scope: {binding['trigger']}", "expected": expected_by_state[state],
            })
    return result


def generate():
    audit = load(AUDIT)
    source_profiles = load(PROFILES)
    model_source = load(HERE / "models.json")
    decisions_data = load(RECON / "profile-decisions.json")
    question_data = load(RECON / "effective-question-registry.json")
    registered_models = {m["id"]: m for m in model_source["models"]}
    decisions = {r["subcategoryId"]: r for r in decisions_data["rows"]}
    registry = {q["questionId"]: q for q in question_data["questions"]}
    aliases = {a["sourceQuestionId"]: a["targetQuestionId"] for a in question_data["aliases"]}
    taxonomy = audit["rows"]
    profiles = {p["subcategoryId"]: p for p in source_profiles["profiles"]}
    ids = [r["id"] for r in taxonomy]
    assert len(ids) == len(set(ids)) == 128
    assert set(ids) == set(profiles) == set(decisions)
    rows = []
    for source in taxonomy:
        sid = source["id"]
        p, d = profiles[sid], decisions[sid]
        model = d["defaultModelId"]
        assert d["sourceWorkflowId"] == p["primaryWorkflowId"]
        conditional = conditional_models(d, registered_models, aliases, registry)
        candidate_models = {model} | {c["modelId"] for c in conditional}
        for rule in d["rules"]:
            candidate_models.update(rule["effects"]["addModels"])
            if rule["effects"]["replacePrimaryModel"]:
                candidate_models.add(rule["effects"]["replacePrimaryModel"])
        assert candidate_models <= set(registered_models)
        extensions = list(model_source["commonExtensionIds"]) + ["EXT_GOOGLE", "EXT_ERP", "EXT_DELIVERY"]
        for mid in sorted(candidate_models):
            extensions.extend(registered_models[mid]["extensionIds"])
        if source["categoryId"] != "financial_services":
            extensions.append("EXT_PAYMENTS")
        evidence = [
            {"kind": "SOURCE_TAXONOMY", "path": "../../audits/merchant-onboarding-128-taxonomy.json", "reference": sid},
            {"kind": "HISTORICAL_PROPOSED_PROFILE", "path": "../profiles-128.json", "reference": p["id"], "note": "Source traceability only. Use current reconciliation decisions/effective profiles instead of inherited semantics."},
            {"kind": "RECONCILED_PROFILE_DECISION", "path": "reconciliation/profile-decisions.json", "reference": sid},
            {"kind": "EFFECTIVE_PROFILE", "path": "reconciliation/effective-profiles-128.json", "reference": sid},
        ]
        rows.append({
            "categoryId": source["categoryId"], "categoryName": source["categoryName"], "subcategoryId": sid, "name": source["name"],
            "sourceProfileId": p["id"], "sourceWorkflowId": p["primaryWorkflowId"],
            "effectiveProfileReference": {"path": "reconciliation/effective-profiles-128.json", "reference": sid},
            "primaryModelId": model, "primaryModelMeaning": "Suggested category default only; actual selected offering model must pass its reconciled eligibility guard.",
            "basePolicy": d["basePolicy"], "defaultModelEligibility": d["enablementGuard"],
            "conditionalModels": conditional, "candidateModels": sorted(candidate_models),
            "candidateModelSetup": {mid: {"requiredSetup": registered_models[mid]["requiredSetup"], "applicabilityPolicy": d["requiredSetupPolicy"]} for mid in sorted(candidate_models)},
            "configurationModifierReferences": [rule["id"] for rule in d["rules"]],
            "specialtyNeeds": d["specialtyNeeds"], "sourceQuestionKeys": source["fields"],
            "requiredSetup": registered_models[model]["requiredSetup"], "setupApplicabilityPolicy": d["requiredSetupPolicy"],
            "customerFlowId": model, "merchantView": VIEW[model],
            "viewSelectionPolicy": "Render the actual eligible selected offering's model view, not the category default when it is contradicted. Use candidate-model views/linked execution as declared in the effective profile.",
            "authorityPolicy": {
                "scope": "Per business/location/resource and applicable data class; resolve before real confirmation.",
                "dataClasses": ["offerings", "capacity", "reservations", "payments"],
                "allowedModes": ["NEXG_AUTHORITATIVE", "EXTERNAL_AUTHORITATIVE", "SHARED_WITH_RULES", "READ_ONLY_EXTERNAL"],
                "whenNotApplicable": "An irrelevant data class is explicitly not applicable; order/enquiry needs no invented reservation authority or payment requirement.",
                "unknownPolicy": "Affected confirmation remains unknown/pending/request-only as contracted. No default model becomes active merely because a response is missing.",
                "externalConfirmation": "External-owned work remains pending until the owner confirms; Google mirrors are not reservation authority.",
            },
            "extensionIds": list(dict.fromkeys(extensions)),
            "corrections": d["reasons"] if d["disposition"] == "ADJUSTED" else [],
            "acceptanceCases": cases(p, model, conditional, d),
            "designStatus": "PLANNED", "implementationStatus": "NOT_STARTED", "testStatus": "NOT_RUN", "evidence": evidence,
        })
    case_count = sum(len(r["acceptanceCases"]) for r in rows)
    bindings = sum(len(r["conditionalModels"]) for r in rows)
    assert bindings == 65 and case_count == 1156
    result = {
        "schemaVersion": "1.1.0-reconciled-planning", "date": "2026-10-31",
        "scope": "End-to-end Kenya-only Payload Reserve planning coverage reconciled with current onboarding/profile decisions. Static design only, not runtime results.",
        "timezone": "Africa/Nairobi", "timezonePicker": False, "status": "PLANNED_NOT_IMPLEMENTED",
        "sourceTaxonomy": "../../audits/merchant-onboarding-128-taxonomy.json", "sourceProfiles": "../profiles-128.json",
        "sourceProfilesPolicy": "Historical source traceability only; reconciliation is the current implementation input.",
        "reconciliationEntrypoint": "reconciliation/README.md",
        "decisionsSource": "reconciliation/profile-decisions.json", "questionRegistrySource": "reconciliation/effective-question-registry.json",
        "conditionSemantics": "Readable triggers are formatted from typed decision ASTs through canonical question aliases. They are not separate executable prose conditions or a second evaluator.",
        "crossCuttingRules": [
            "An actual selected offering/model, applicable setup and authority guard capability resolution; category defaults alone never activate bookings.",
            "A selected alternative can replace a contradicted default. Bindings and modifiers preserve only independently eligible models and existing valid obligations.",
            "Linked executions resolve their own selected offering/method scope and instantiate once through authorized accepted parent work, never by a declaration alone.",
            "Recurring occurrences/orders, commercial entitlement and payment renewal are independent.",
            "Retail and enquiry workflows remain complete supported outcomes without an appointment calendar; irrelevant authority classes are not required.",
            "Hypothetical scenarios are planning specifications, not merchant defaults or passing test evidence.",
            "Optional Google/payment engineering scope does not mandate merchant connections or charges.",
        ],
        "summary": {"categoryCount": len({r["categoryId"] for r in rows}), "subcategoryCount": len(rows), "acceptanceCaseCount": case_count,
                    "baselineAcceptanceCaseCount": len(rows)*7, "conditionalBindingCaseCount": bindings*4, "conditionalBindingIndexBase": 0,
                    "primaryModelCounts": dict(sorted(Counter(r["primaryModelId"] for r in rows).items())), "conditionalModelBindings": bindings,
                    "rowsWithCorrections": sum(bool(r["corrections"]) for r in rows)},
        "rows": rows,
    }
    (HERE / "coverage-128.json").write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    lines = ["# Payload Reserve coverage for all 128 NEXG specialties", "",
             "Current implementation-planning entrypoint: [reconciled onboarding and booking package](reconciliation/README.md). Use its effective profiles, question registry and workflow bindings. Earlier profiles are source history, not an independent active configuration.", "",
             "Date: 31 October 2026. All rows are planned, not implemented or runtime-tested. Kenya time is Africa/Nairobi with no selector. [Structured coverage](coverage-128.json) contains exact typed conditions, applicability, evidence and scenarios.", "",
             f"Coverage: 21 categories, 128 specialties, {case_count} planned cases. This includes 896 baseline cases and 260 conditional answer-state cases across 65 bindings. These counts are not passing runtime tests.", "",
             "Category defaults are suggestions. The selected configured offering supplies its actual model only after its guards pass. Selected alternatives can replace a contradicted default, while existing valid obligations remain unchanged. Linked execution has its own selected child scope and is never auto-created by onboarding."]
    current = None
    for row in rows:
        if current != row["categoryId"]:
            current = row["categoryId"]
            lines.extend(["", f"## {row['categoryName']}", ""])
        lines.extend([f"### {row['name']} (`{row['subcategoryId']}`)", "",
                      f"Suggested default: `{row['primaryModelId']}`. [Effective profile](reconciliation/effective-profiles-128.json), reference `{row['subcategoryId']}`. Historical source `{row['sourceProfileId']}`. Status planned / not started / not run.", "",
                      row["specialtyNeeds"], "", "Default-view template: " + row["merchantView"] + ". Actual view follows the eligible selected model.", "",
                      "Model-specific setup: " + "; ".join(row["requiredSetup"]) + ".", "", "Applicability: " + row["setupApplicabilityPolicy"]])
        if row["conditionalModels"]:
            lines.extend(["", "Typed conditional model bindings:", ""])
            for binding in row["conditionalModels"]:
                lines.append(f"- `{binding['modelId']}` / `{binding['composition']}`: {binding['trigger']}. {binding['note']}")
        if row["configurationModifierReferences"]:
            lines.extend(["", "Additional scoped decision/modifier references: " + ", ".join(f"`{x}`" for x in row["configurationModifierReferences"]) + ". See the effective profile for exact rules."])
        if row["corrections"]:
            lines.extend(["", "Reconciled decisions:", ""])
            lines.extend("- " + text for text in row["corrections"])
        lines.extend(["", f"Acceptance: seven baseline scenarios and {len(row['conditionalModels'])*4} positive/negative/missing/conflicting conditional scenarios. Only eligible selected models may remain active; no scenario unconditionally preserves the category default. Details are in the structured register.", ""])
    (HERE / "coverage-128.md").write_text("\n".join(lines)+"\n", encoding="utf-8")
    print(json.dumps(result["summary"], indent=2))


if __name__ == "__main__":
    generate()
