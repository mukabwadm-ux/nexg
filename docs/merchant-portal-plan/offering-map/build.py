"""Build the proposed offering map and readable views. No application writes or dependencies."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import subprocess

import definitions as D
import experiences as E

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
SOURCES = {
    "taxonomy": "packages/contracts/src/taxonomy.ts",
    "audit": "docs/audits/merchant-onboarding-128-taxonomy.json",
    "profiles": "docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-profiles-128.json",
    "questions": "docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-question-registry.json",
    "domains": "docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-domain-registry.json",
    "models": "docs/merchant-portal-plan/payload-reserve-plan/models.json",
    "definitions": "docs/merchant-portal-plan/offering-map/definitions.py",
    "builder": "docs/merchant-portal-plan/offering-map/build.py",
    "verifier": "docs/merchant-portal-plan/offering-map/verify.py",
    "customerDisplay": "docs/merchant-portal-plan/offering-map/customer-display.md",
    "fashionDefinitions": "docs/merchant-portal-plan/offering-map/fashion.py",
    "approvals": "docs/merchant-portal-plan/offering-map/approvals.json",
    "workflows": "docs/merchant-portal-plan/payload-reserve-plan/reconciliation/effective-workflows.json",
    "specificationDefinitions": "docs/merchant-portal-plan/offering-map/specifications.py",
    "experienceDefinitions": "docs/merchant-portal-plan/offering-map/experiences.py",
    "specificationContract": "docs/merchant-portal-plan/offering-map/product-specification-contract.md",
}


def read_json(key):
    return json.loads((REPO / SOURCES[key]).read_text(encoding="utf-8"))


def source_hashes():
    return {key: {"path": path, "sha256": hashlib.sha256((REPO / path).read_bytes()).hexdigest()}
            for key, path in SOURCES.items()}


def taxonomy():
    # Evaluate only the repository's literal array, not the imported module or its dependencies.
    script = r"""
const fs = require('fs'), vm = require('vm');
const text = fs.readFileSync(process.argv[1], 'utf8');
const match = text.match(/export const MERCHANT_TAXONOMY:[^=]+?=\s*([\s\S]*?)\s+as const;/);
if (!match) throw new Error('Cannot locate the authoritative taxonomy literal');
process.stdout.write(JSON.stringify(vm.runInNewContext('(' + match[1] + ')', {}, {timeout:1000})));
"""
    result = subprocess.run(["node", "-e", script, str(REPO / SOURCES["taxonomy"])], check=True,
                            capture_output=True, text=True, encoding="utf-8")
    return json.loads(result.stdout)


def canonical(key):
    return D.FIELD_ALIASES.get(key, key)


def make_catalogue():
    categories = taxonomy()
    audit = {r["id"]: r for r in read_json("audit")["rows"]}
    profiles = {r["subcategoryId"]: r for r in read_json("profiles")["rows"]}
    questions = {q["questionId"]: q for q in read_json("questions")["questions"]}
    approval = read_json("approvals")
    approved_routes = {(r["subcategoryId"], r["templateId"], r["modelId"]) for r in approval["routes"]}
    source_schemas = {s["id"]: s for s in read_json("domains")["offeringSchemas"]}
    fields = {}
    groups = {}
    for group_id, group in D.GROUPS.items():
        groups[group_id] = dict(id=group_id, title=group["title"], fieldIds=[])
        for field in group["fields"]:
            key = canonical(field["id"])
            groups[group_id]["fieldIds"].append(key)
            if field["id"] not in D.FIELD_ALIASES:
                fields[key] = copy.deepcopy(field)
                fields[key]["valueTypeRef"] = field["type"]
                if key in D.ENUM_VALUES:
                    fields[key]["proposedValues"] = D.ENUM_VALUES[key]
                if field["type"] in ("intake_schema", "customization_schema"):
                    fields[key]["responseScope"] = "transaction"
                    fields[key]["responseVisibility"] = "private_intake"
    templates = {}
    schema_overrides = {"event_ticket": ["EVENT_TICKET_V1"], "conference_ticket": ["EVENT_TICKET_V1"],
                        "telemedicine": ["REMOTE_SESSION_V1"]}
    for key, template in D.TEMPLATES.items():
        result = copy.deepcopy(template)
        bindings = {}
        excluded = set(template.get("excludedFields", []))
        for group_id in template["groups"]:
            for usage in D.GROUPS[group_id]["fields"]:
                if usage["id"] in excluded:
                    continue
                field_id = canonical(usage["id"])
                if field_id not in bindings:
                    bindings[field_id] = dict(fieldId=field_id, groupId=group_id,
                        requirement=usage["requirement"], guidance=usage["guidance"],
                        applicableWhen=template.get("groupApplicability", {}).get(group_id, "This offering template is selected."))
                    destinations = list(fields[field_id]["destinations"])
                    if field_id in {canonical(k) for k in template["cardHighlights"]} and "card" not in destinations:
                        destinations.append("card")
                    bindings[field_id]["destinations"] = destinations
        result["fieldBindings"] = list(bindings.values())
        result["schemaExtensionOf"] = schema_overrides.get(key, list(dict.fromkeys(D.MODEL_SCHEMA[m] for m in template["modelIds"])))
        if key.endswith("_enquiry"):
            result["schemaExtensionOf"].append("REGULATED_ENQUIRY_V1")
        result["customerActions"] = {model: D.MODEL_ACTIONS[model] for model in template["modelIds"]}
        result["customerSections"] = {dest: [field_id for field_id, binding in bindings.items() if dest in binding["destinations"]]
                                      for dest in D.CUSTOMER_DESTINATIONS}
        result["runtimeEnabled"] = False
        templates[key] = result
    subcategories = []
    for category in categories:
        for sub in category["subcategories"]:
            profile = profiles[sub["id"]]
            context = [dict(questionId=qid, key=questions[qid]["key"], canonicalTarget=questions[qid]["canonicalTarget"])
                       for qid in profile["sourceQuestionIds"]]
            offerings = []
            for template_id in D.BINDINGS[sub["id"]]["templateIds"]:
                routes = []
                for model in templates[template_id]["modelIds"]:
                    aligned = model in profile["candidateModelIds"]
                    approved = (sub["id"], template_id, model) in approved_routes
                    routes.append(dict(modelId=model,
                        compatibility="WITHIN_PROFILE_CANDIDATES" if aligned else "APPROVED_PROFILE_EXTENSION" if approved else "PROFILE_EXTENSION_REQUIRED",
                        designApprovalRef=approval["approvalId"] if approved else None,
                        approvedWorkflowRefs=source_schemas[D.MODEL_SCHEMA[model]]["workflowIds"] if approved else [],
                        allowedIntakeModes=profile["intakeByModel"][model]["allowedModes"],
                        existingWorkflowRefs=profile["workflowOptionsByModel"].get(model, []),
                        createsWork=False, runtimeEnabled=False))
                offerings.append(dict(templateId=template_id, modelRoutes=routes))
            subcategories.append(dict(categoryId=category["id"], categoryName=category["name"],
                subcategoryId=sub["id"], name=sub["name"], taxonomyFields=sub["fields"],
                existingOnboardingContext=context,
                onboardingScopeRule="Reference existing definitions and review their actual scope. Business-wide answers do not silently become item/variant values.",
                effectiveProfileRef=profile["sourceProfileId"], existingCandidateModelIds=profile["candidateModelIds"],
                effectiveDesignCandidateModelIds=list(dict.fromkeys(profile["candidateModelIds"] + [m["modelId"] for o in offerings for m in o["modelRoutes"] if m["compatibility"] == "APPROVED_PROFILE_EXTENSION"])),
                specialtyNotes=D.BINDINGS[sub["id"]]["specialtyNotes"], offerings=offerings,
                runtimeEnabled=False))
    result = dict(schemaVersion="1.2.0-proposed-design", date="2026-10-31", status="DESIGN_MAPPING_NOT_IMPLEMENTED",
        scope="All current merchant categories and subcategories; curated extensible offering types, field capture and customer display.",
        timezone="Africa/Nairobi", runtimeEnabled=False, sources=source_hashes(),
        valueTypes=D.VALUE_TYPES, customerDestinations=D.CUSTOMER_DESTINATIONS,
        fields=fields, fieldGroups=groups, fieldAliases=D.FIELD_ALIASES, templates=templates,
        categories=[dict(id=c["id"], name=c["name"], subcategoryIds=[s["id"] for s in c["subcategories"]]) for c in categories],
        subcategories=subcategories, designApprovals=approval, modelSchemaRefs=D.MODEL_SCHEMA,
        fashionScreenDesign=D.FASHION_SCREEN_DESIGN,
        reviewDecisions=[dict(d, status="RESOLVED_INCLUSION_APPROVED", proposal="The user approved all 21 listed additions for design inclusion on 31 October 2026. They are compiled as approved per-offering profile extensions; runtime setup, authority, policy and capacity requirements remain applicable.") if d["id"] == "D05" else dict(d, status="FOR_REVIEW") for d in D.REVIEW_DECISIONS],
        counts=dict(categories=len(categories), subcategories=len(subcategories), offeringTemplates=len(templates),
            fieldGroups=len(groups), fieldDefinitions=len(fields),
            specialtyOfferingMappings=sum(len(r["offerings"]) for r in subcategories),
            additionalModelRoutes=sum(1 for r in subcategories for o in r["offerings"] for m in o["modelRoutes"] if m["compatibility"] != "WITHIN_PROFILE_CANDIDATES"),
            approvedAdditionalModelRoutes=sum(1 for r in subcategories for o in r["offerings"] for m in o["modelRoutes"] if m["compatibility"] == "APPROVED_PROFILE_EXTENSION"),
            unapprovedAdditionalModelRoutes=sum(1 for r in subcategories for o in r["offerings"] for m in o["modelRoutes"] if m["compatibility"] == "PROFILE_EXTENSION_REQUIRED")))
    result["experienceMap"] = E.compose(result, read_json("domains"), read_json("models"), read_json("workflows"))
    return result


def md(value):
    return str(value).replace("|", "/").replace("\n", " ")


def requirement(binding):
    req = binding["requirement"]
    value = {"publish": "Publish", "optional": "Optional", "conditional": "Required " + (req["when"] or "")}[req["level"]]
    if binding["applicableWhen"] != "This offering template is selected.":
        value += "; group applies when " + binding["applicableWhen"]
    return value


def template_doc(template, data):
    fields = data["fields"]
    lines = [f"# {template['label']}", "", "Status: proposed template. Review the completeness rules before runtime publication enforcement.", "",
             "[All categories](../README.md) / [Field library](../field-library.md) / [Customer display rules](../customer-display.md)", "",
             "## Customer presentation", "",
             "The browse card uses name, accurate media, a short summary, an accurately labelled price/quote state and actual availability where known."]
    if template["cardHighlights"]:
        lines += ["", "Additional card highlights: " + "; ".join(fields[canonical(f)]["label"] for f in template["cardHighlights"]) + "."]
    lines += ["", "The detail page groups the specifications below. Choice, sizing, price, fulfilment and terms sections appear only where applicable."]
    for note in (template["note"], template["selectionNotes"], template["intakeNotes"]):
        if note:
            lines += ["", note]
    for model, action in template["customerActions"].items():
        lines += ["", f"- {model}: {action}"]
    lines += ["", "This extends the existing offering schema definitions " + ", ".join(template["schemaExtensionOf"]) + ". It does not activate any model.", ""]
    if template.get("fixedValues"):
        lines += ["Fixed template choices: " + "; ".join(f"{k} = {v}" for k, v in template["fixedValues"].items()) + ".", ""]
    for group_id in template["groups"]:
        bindings = [b for b in template["fieldBindings"] if b["groupId"] == group_id]
        if not bindings:
            continue
        lines += [f"## {data['fieldGroups'][group_id]['title']}", "",
                  "| Merchant captures | Input/value shape | Scope and proposed requirement | Customer destination | Guidance |",
                  "| --- | --- | --- | --- | --- |"]
        for b in bindings:
            f = fields[b["fieldId"]]
            dest = "; ".join(data["customerDestinations"][v] for v in b["destinations"])
            lines += ["| " + " | ".join(map(md, [f["label"], data["valueTypes"][f["type"]]["merchantControl"],
                f["scope"] + "; " + requirement(b), dest, b["guidance"]])) + " |"]
        lines += [""]
    lines += ["## Source and visibility", "", "Field IDs and their single authoritative owner references are in [catalogue.json](../catalogue.json). Shared field meanings are defined once; each use can narrow its requirement or applicability. Internal references and transaction responses must not enter public projections.", ""]
    return "\n".join(lines)


def display_summary(template, data):
    fields = data["fields"]
    chunks = []
    if template["cardHighlights"]:
        chunks.append("Card highlights: " + ", ".join(fields[canonical(k)]["label"] for k in template["cardHighlights"]))
    for dest in ("options", "size_guide", "pricing", "fulfilment", "schedule", "terms", "request_form"):
        ids = template["customerSections"][dest]
        if ids:
            chunks.append(data["customerDestinations"][dest] + ": " + ", ".join(fields[k]["label"] for k in ids))
    return "; ".join(chunks)


def category_doc(category, data):
    lines = [f"# {category['name']}", "", "Status: proposed offering and field mapping. Each type is a selectable template, not a statement that every merchant offers it.", "", f"[All categories](../README.md) / [All screens and workflows for this category]({category['id']}-screens.md) / [Coverage](../coverage-128.md) / [Review decisions](../review-decisions.md)", ""]
    for row in [r for r in data["subcategories"] if r["categoryId"] == category["id"]]:
        lines += [f"## {row['name']}", "", f"Existing identity: `{row['subcategoryId']}`. Effective profile: `{row['effectiveProfileRef']}`.", "", row["specialtyNotes"], "",
                  "Existing onboarding context: " + ", ".join(f"`{q['questionId']}`" for q in row["existingOnboardingContext"]) + ". These business/activity answers do not silently fill item or variant facts.", "",
                  "| Offering type | Merchant captures beyond the shared listing/order controls | Customer sees or selects |", "| --- | --- | --- |"]
        for offering in row["offerings"]:
            t = data["templates"][offering["templateId"]]
            specialized = [data["fields"][b["fieldId"]]["label"] for b in t["fieldBindings"]
                           if b["groupId"] not in ("common", "sale", "price", "stock", "fulfilment", "request", "schedule")]
            lines += [f"| [{t['label']}](../templates/{t['id']}.md) | {md('; '.join(specialized))} | {md(display_summary(t, data))} |"]
        extensions = [(data["templates"][o["templateId"]]["label"], m["modelId"], m["compatibility"]) for o in row["offerings"] for m in o["modelRoutes"] if m["compatibility"] != "WITHIN_PROFILE_CANDIDATES"]
        if extensions:
            lines += ["", "Additional design activities: " + "; ".join(f"{label} / {model} / {'inclusion approved' if state == 'APPROVED_PROFILE_EXTENSION' else 'needs review'}" for label, model, state in extensions) + ". These extend the historical profile candidates without activating runtime behavior."]
        lines += ["", "Every template also includes the shared capture requirements and its explicit customer action. Follow the template link for types, conditions, units, scope and internal/private fields.", ""]
    return "\n".join(lines)


def render_documents(data):
    docs = {}
    counts = data["counts"]
    lines = ["# Offering information map for all NEXG categories", "", "Date: 31 October 2026. Status: complete current-baseline design mapping, proposed for merchant and customer review. No application implementation or runtime verification is claimed.", "",
             f"This package maps all {counts['categories']} categories and {counts['subcategories']} subcategories to {counts['offeringTemplates']} specific offering templates using {counts['fieldDefinitions']} shared field definitions. There are {counts['specialtyOfferingMappings']} explicit specialty-to-offering mappings.", "",
             "Start with a category below, open a subcategory, then follow an offering type to its full merchant-field and customer-display matrix. A merchant can use several templates and retain one business identity.", "",
             "## Read the map", "", "- [Product specifications: quick review of all 21 categories](product-specifications-review.md).", "- [All 21 categories: screens and workflows](all-screens-and-workflows.md).", "- [Workflow information contracts](workflow-information.md).", "- [All 128 subcategories](coverage-128.md).", "- [Field library and compound input shapes](field-library.md).", "- [Customer display, variants and privacy](customer-display.md).", "- [Decisions and approved additional activity routes](review-decisions.md).", "- [Mapping scope and boundaries](plan.md).", "- [Machine-readable catalogue](catalogue.json), [all-screen/workflow JSON](all-screens-and-workflows.json) and [verification evidence](verification.json).", "- [Detailed Fashion example](fashion-review.md).", "",
             "| Merchant category | Subcategories | Specific offering types |", "| --- | --- | --- |"]
    for c in data["categories"]:
        offerings = {o["templateId"] for r in data["subcategories"] if r["categoryId"] == c["id"] for o in r["offerings"]}
        lines += [f"| [{c['name']}](categories/{c['id']}.md) | {len(c['subcategoryIds'])} | {len(offerings)} |"]
    lines += ["", "## Key distinctions", "", "Merchant identity, offering type, variants, merchant shop sections and the actual operational workflow are separate. A dress uses size-specific measurements; a car rental uses vehicle and interval terms; an enquiry does not become a confirmed booking.", "",
              "Publish/conditional/optional are proposed completeness requirements for review. A requirement applies only to the selected template and applicable field group. Unknown facts stay unknown. The curated offering list covers identified types across every current specialty and supports further reviewed types; it cannot enumerate every future merchant item.", "",
              f"The user approved {counts['approvedAdditionalModelRoutes']} additional model routes for design inclusion. {counts['unapprovedAdditionalModelRoutes']} additional routes remain unapproved. [Approved profile additions](approved-profile-additions.json) records the exact per-offering extension of the historical profile candidates. Real setup, policy, source authority and capacity are still required; no route is activated by this package.", "",
              "## Sources and regeneration", "", "The live TypeScript taxonomy supplies identities. The onboarding audit and reconciled question, profile, domain and model registries supply context. Source paths and hashes are in [manifest.json](manifest.json). Existing onboarding fields are referenced by their canonical question IDs rather than redefined as item facts.", "",
              "Edit definitions.py or the category refinement in fashion.py, then run `python -X utf8 build.py` and `python -X utf8 verify.py` from this directory. approvals.json records the user's exact approved additions. Readable category/template pages and resolved JSON are generated views. The historical effective booking registries remain separate; the approved overlay is explicitly included in this design snapshot.", ""]
    docs["README.md"] = "\n".join(lines)
    coverage = ["# All 128 subcategory mappings", "", "Status: proposed design. Each offering link opens the specific capture and customer-display matrix.", "", "| Category | Subcategory | Mapped offering types |", "| --- | --- | --- |"]
    for row in data["subcategories"]:
        names = "; ".join(f"[{data['templates'][o['templateId']]['label']}](templates/{o['templateId']}.md)" for o in row["offerings"])
        coverage += [f"| [{row['categoryName']}](categories/{row['categoryId']}.md) | {row['name']} / `{row['subcategoryId']}` | {names} |"]
    docs["coverage-128.md"] = "\n".join(coverage) + "\n"
    for category in data["categories"]:
        docs[f"categories/{category['id']}.md"] = category_doc(category, data)
    for template in data["templates"].values():
        docs[f"templates/{template['id']}.md"] = template_doc(template, data)
    library = ["# Shared field library", "", "The single authoring source is definitions.py. Field IDs are registry symbols, not entity identifiers. The machine-readable map holds owner and scope references. Units and compound controls follow the value shapes below.", "",
               "## Value shapes", "", "| Type | Merchant control | Captured values |", "| --- | --- | --- |"]
    for v in data["valueTypes"].values():
        library += [f"| `{v['id']}` | {md(v['merchantControl'])} | {md(v['valueShape'])} |"]
    library += ["", "## Fields", "", "| Field | Label | Type | Scope / owner | Visibility and destinations |", "| --- | --- | --- | --- | --- |"]
    for f in data["fields"].values():
        library += [f"| `{f['id']}` | {md(f['label'])} | `{f['type']}` | {f['scope']} / {f['ownerDataClass']} | {f['visibility']}; {', '.join(f['destinations'])} |"]
    library += ["", "Shared measurement aliases: " + "; ".join(f"`{a}` references `{b}`" for a, b in data["fieldAliases"].items()) + ". Template uses retain their actual applicability and requirement.", ""]
    docs["field-library.md"] = "\n".join(library)
    review = ["# Decisions for review", "", "All design mappings are present. These decisions remain review inputs rather than runtime promises.", ""]
    for decision in data["reviewDecisions"]:
        review += [f"## {decision['id']}: {decision['issue']}", "", "Status: " + decision["status"] + ".", "", decision["proposal"], ""]
    review += ["## Approved additional activity routes", "", "The user approved these 21 exact template/model additions for design inclusion. The historical profile snapshot is preserved, and approved-profile-additions.json records its explicit per-offering extension. Actual customer actions still depend on the selected offering, implementation and confirmed owner prerequisites.", "", "| Subcategory | Offering template | Model | Inclusion status |", "| --- | --- | --- | --- |"]
    for row in data["subcategories"]:
        for offering in row["offerings"]:
            for route in offering["modelRoutes"]:
                if route["compatibility"] != "WITHIN_PROFILE_CANDIDATES":
                    t = data["templates"][offering["templateId"]]
                    review += [f"| {row['name']} / `{row['subcategoryId']}` | [{t['label']}](templates/{t['id']}.md) | {route['modelId']} | {'Approved for design inclusion' if route['compatibility'] == 'APPROVED_PROFILE_EXTENSION' else 'Needs review'} |"]
    docs["review-decisions.md"] = "\n".join(review) + "\n"
    docs["fashion-review.md"] = fashion_review_doc(data)
    docs["fashion-review.json"] = json.dumps(fashion_projection(data), ensure_ascii=False, indent=2) + "\n"
    docs["approved-profile-additions.json"] = json.dumps(dict(
        approval=data["designApprovals"], sourceProfileSnapshot=data["sources"]["profiles"],
        interpretation="Explicit approved per-offering design extensions; preserve the base profile guards and model contracts. This is not a second runtime resolver.",
        runtimeEnabled=False, profiles=[dict(subcategoryId=r["subcategoryId"],
            baseModelIds=r["existingCandidateModelIds"], effectiveDesignModelIds=r["effectiveDesignCandidateModelIds"],
            approvedOfferings=[o for o in r["offerings"] if any(m["compatibility"] == "APPROVED_PROFILE_EXTENSION" for m in o["modelRoutes"])])
            for r in data["subcategories"] if any(m["compatibility"] == "APPROVED_PROFILE_EXTENSION" for o in r["offerings"] for m in o["modelRoutes"])]), ensure_ascii=False, indent=2) + "\n"
    for impact in data["experienceMap"]["merchantScreens"]:
        screen_path = HERE.parent / "screens" / impact["file"]
        current = screen_path.read_text(encoding="utf-8")
        old_start, old_end = "<!-- BEGIN FASHION_FIELD_REVIEW -->", "<!-- END FASHION_FIELD_REVIEW -->"
        if old_start in current:
            before, rest = current.split(old_start, 1)
            _, after = rest.split(old_end, 1)
            current = before.rstrip() + after
        start, end = "<!-- BEGIN OFFERING_SPECIFICATION_REVIEW -->", "<!-- END OFFERING_SPECIFICATION_REVIEW -->"
        block = "\n".join([start, "## Product-specific information across all 21 categories", "",
            "Status: all-category screen and workflow design. Use the [category screen/workflow compositions](../offering-map/all-screens-and-workflows.md), [complete offering field matrices](../offering-map/coverage-128.md) and [selected-workflow information contract](../offering-map/workflow-information.md). Fashion is one detailed example of the shared product-kind system.", "",
            impact["behavior"], "", "Required scenario: " + impact["scenario"], "",
            "The 21 cross-category activity additions are [approved for design inclusion](../offering-map/approved-profile-additions.json). Field completeness rules remain reviewable and actual owner prerequisites still apply.", end])
        if start in current:
            before, rest = current.split(start, 1)
            _, after = rest.split(end, 1)
            updated = before + block + after
        else:
            updated = current.rstrip() + "\n\n" + block + "\n"
        docs["../screens/" + impact["file"]] = updated
    docs.update(experience_documents(data))
    return docs


def fashion_projection(data):
    rows = [r for r in data["subcategories"] if r["categoryId"] == "fashion_apparel"]
    ids = sorted({o["templateId"] for r in rows for o in r["offerings"]})
    field_ids = sorted({b["fieldId"] for key in ids for b in data["templates"][key]["fieldBindings"]})
    return dict(status="DESIGN_FOR_REVIEW", categoryId="fashion_apparel", date=data["date"],
        source="catalogue.json", subcategories=rows, templates={k: data["templates"][k] for k in ids},
        fields={k: data["fields"][k] for k in field_ids}, screenDesign=data["fashionScreenDesign"], runtimeEnabled=False,
        counts=dict(subcategories=len(rows), offeringTypes=len(ids), fields=len(field_ids)))


def fashion_review_doc(data):
    projection = fashion_projection(data)
    lines = ["# Fashion & Apparel: fields and customer screens", "", "Date: 31 October 2026. Status: detailed design for review. The user approved the 21 cross-category workflow additions for inclusion; the individual Fashion field requirements below remain reviewable.", "",
             "[All categories](README.md) / [Fashion JSON](fashion-review.json) / [Field library](field-library.md) / [Screen design](fashion-screens.md)", "",
             "## Seven merchant subcategories", "", "These labels suggest offering types. They do not restrict a merchant from adding another relevant type or restrict who may buy it.", "",
             "| Subcategory | Offering types and full field matrices |", "| --- | --- |"]
    for row in projection["subcategories"]:
        lines += ["| " + row["name"] + " | " + "; ".join(f"[{data['templates'][o['templateId']]['label']}](templates/{o['templateId']}.md)" for o in row["offerings"]) + " |"]
    lines += ["", "## Merchant entry and customer display", "", "The next tables name each specific captured field. Shared listing, price, stock and fulfilment controls are included in the linked full matrices. Publish/conditional/optional are proposed completeness rules; missing facts are never invented. Group conditions appear beside the field requirement.", ""]
    for key, template in projection["templates"].items():
        lines += [f"## {template['label']}", "", f"[Complete field matrix](templates/{key}.md)", "", "| Merchant captures | Proposed requirement and scope | Customer sees it in | Detail or interaction |", "| --- | --- | --- | --- |"]
        for binding in template["fieldBindings"]:
            if binding["groupId"] in ("common", "sale", "price", "stock", "fulfilment", "schedule", "request"):
                continue
            f = data["fields"][binding["fieldId"]]
            lines += ["| " + " | ".join(map(md, [f["label"], requirement(binding) + "; " + f["scope"],
                "; ".join(data["customerDestinations"][d] for d in binding["destinations"]), binding["guidance"]])) + " |"]
        lines += [""]
    lines += ["## Customer screen sections", "", "| Section | Display and behavior |", "| --- | --- |"]
    for section in projection["screenDesign"]["customerSections"]:
        lines += [f"| {section['label']} | {md(section['behavior'])} |"]
    lines += ["", "## Merchant screen tabs", "", "| Existing tab | Fashion groups |", "| --- | --- |"]
    for tab in projection["screenDesign"]["merchantTabs"]:
        lines += [f"| {tab['label']} | {'; '.join(tab['groups'])} |"]
    lines += ["", "## Effects on the eight merchant screens", "", "| Screen | Required design update |", "| --- | --- |"]
    for impact in projection["screenDesign"]["screenImpacts"]:
        lines += [f"| [{impact['id']}](../screens/{impact['file']}) | {md(impact['effect'])} |"]
    lines += ["", "## Decisions still open for this category", ""] + ["- " + q for q in projection["screenDesign"]["reviewQuestions"]]
    lines += ["", "Review examples use illustrative data only. The customer view must retain actual variant identities, source ownership, private measurement boundaries and the accepted specification/price/policy snapshot.", ""]
    return "\n".join(lines)


def experience_documents(data):
    experience = data["experienceMap"]
    docs = {"all-screens-and-workflows.json": json.dumps(experience, ensure_ascii=False, indent=2) + "\n"}
    counts = experience["counts"]
    lines = ["# Product specifications, screens and workflows across all 21 categories", "",
        "Date: 31 October 2026. Status: integrated design specification for review. This is the shared offering-information system across the complete current merchant taxonomy; Fashion & Apparel is one example.", "",
        f"Coverage: {counts['categories']} categories, {counts['subcategories']} subcategories, {counts['offeringTypes']} specific offering types, {counts['categoryMerchantScreenCompositions']} category/screen compositions and {counts['specialtyMerchantScreenBindings']} specialty/screen bindings.", "",
        "[Structured screen/workflow JSON](all-screens-and-workflows.json) / [Full catalogue JSON](catalogue.json) / [Workflow information contracts](workflow-information.md) / [All offering fields](coverage-128.md)", "",
        "## One product-kind system", "", experience["categoryPolicy"], "", experience["workflowSelectionPolicy"], "",
        "A merchant chooses an actual offering kind, enters its specific specifications and real options, and previews the corresponding customer view. The selected offering and enabled owner capabilities determine whether the customer buys an item, books time, reserves an asset/place, agrees production, enrolls in a plan or submits a request. The shared eight-screen portal adapts to those facts.", "",
        "## Information through the journey", "", "| Stage | Required behavior |", "| --- | --- |"]
    for stage in experience["specificationStages"]:
        lines += [f"| {stage['label']} | {md(stage['invariant'])} |"]
    lines += ["", "## Every merchant screen", "", "| Screen | What changes for product-specific information |", "| --- | --- |"]
    for screen in experience["merchantScreens"]:
        lines += [f"| [{screen['label']}](../screens/{screen['file']}) | {md(screen['behavior'])} |"]
    lines += ["", "## Every customer surface", "", "| Customer surface | Display and selection rule |", "| --- | --- |"]
    for screen in experience["customerScreens"]:
        lines += [f"| {screen['label']} | {md(screen['behavior'])} |"]
    lines += ["", "## Category-specific screen and workflow designs", "", "| Category | Specialties | Specific offering types | Full screen coverage |", "| --- | --- | --- | --- |"]
    for category in experience["categories"]:
        lines += [f"| [{category['name']}](categories/{category['categoryId']}-screens.md) | {len(category['subcategoryIds'])} | {len(category['offeringTemplateIds'])} | All eight merchant screens and applicable customer surfaces |"]
        docs[f"categories/{category['categoryId']}-screens.md"] = category_experience_doc(category, data)
    lines += ["", "## Accepted work and changes", "",
        "Accept the actual product/variant/options, quantity/unit or interval, content/chart version, applicable policy and pricing references. Catalogue specification, price, stock, resource availability, private intake and financial facts keep their respective owners. Accepted work keeps its historical specification and terms; editing the current listing cannot rewrite it.", "",
        "Private customer measurements, addresses, recipient messages, patient administration, financial/provider documents and cargo declarations remain purpose-limited transaction data. Public customization/intake definitions are distinct from the responses they collect.", "",
        "The 21 additional offering/model routes are approved for design inclusion and are explicit in approved-profile-additions.json. Actual setup, authority and implementation are still necessary. None of the design files activate an application workflow.", "",
        "## Verification and limits", "", "The verifier checks source identities, every offering's typed fields and customer destinations, all category/specialty screen bindings, workflow reference/transition preservation, approval composition and private/public boundaries. This is design evidence. Merchant validation, actual forms/persistence/API projection, real price/stock/allocation behavior and customer usability remain implementation evidence.", ""]
    docs["all-screens-and-workflows.md"] = "\n".join(lines)
    docs["workflow-information.md"] = workflow_information_doc(data)
    review = ["# Product specifications: review across all 21 categories", "",
        "These are concrete examples of item-specific specifications already present in the shared registry. Each category contains further specific offering types and complete field matrices. Merchant category and product kind remain separate; Fashion is one example of the shared system.", "",
        "[All offering types and fields](coverage-128.md) / [All screen and workflow designs](all-screens-and-workflows.md) / [Structured catalogue](catalogue.json)", "",
        "| Category | Example actual offering | Specific information captured | Exact customer destinations |", "| --- | --- | --- | --- |"]
    for category in experience["categories"]:
        example = experience["reviewExamples"][category["categoryId"]]
        key = example["templateId"]
        bindings = {b["fieldId"]: b for b in data["templates"][key]["fieldBindings"]}
        names = "; ".join(data["fields"][fid]["label"] for fid in example["fieldIds"])
        destinations = list(dict.fromkeys(dest for fid in example["fieldIds"] for dest in bindings[fid]["destinations"]))
        shown = "; ".join(data["customerDestinations"][d] for d in destinations)
        review += [f"| [{category['name']}](categories/{category['categoryId']}-screens.md) | [{data['templates'][key]['label']}](templates/{key}.md) | {md(names)} | {md(shown)} |"]
    review += ["", "The exact templates also specify applicable required/optional conditions, unit/value shape, offering/variant/location/transaction scope, source ownership and privacy. Personal customer data appears only in the private request/transaction route; a private destination is not a public product specification.", "",
        "The information is carried through all eight merchant screens and eleven customer surfaces. Accepted work binds the actual selected specification, options, quantity/unit and policy/price versions to the existing selected workflow. Current listing changes cannot rewrite accepted history.", ""]
    docs["product-specifications-review.md"] = "\n".join(review)
    customer = ["# Customer offering screens across all categories", "", "Status: design specification for all current product and service kinds. [Category compositions](../offering-map/all-screens-and-workflows.md) and [structured field/screen/workflow bindings](../offering-map/all-screens-and-workflows.json) supply the actual selected offering fields.", ""]
    for screen in experience["customerScreens"]:
        customer += [f"## {screen['id']}: {screen['label']}", "", screen["behavior"], ""]
    customer += ["## Acceptance", "", "For each selected offering kind, verify the actual capture-to-public-projection and selection path; preserve real variants/units/compatibility, accurate price and source-confirmed availability, private intake boundaries and immutable accepted specification/policy references. Render the registered workflow's request/confirmation/tracking meaning. Include mobile, keyboard, errors, unavailable choices and stale/conflicting sources in the future implementation evidence.", "",
        "The current artifacts specify the behavior and verify design references; they do not implement or certify working application screens.", ""]
    docs["../screens/customer-offerings.md"] = "\n".join(customer)
    return docs


def category_experience_doc(category, data):
    experience = data["experienceMap"]
    ids = category["offeringTemplateIds"]
    fields = data["fields"]
    lines = [f"# {category['name']}: product information, screens and workflows", "",
        "Status: composed design for the complete category. Use the actual selected offering kind; these are not separate per-category backends or new workflow engines.", "",
        f"[All 21 category designs](../all-screens-and-workflows.md) / [Offering field map]({category['categoryId']}.md) / [Workflow information contracts](../workflow-information.md)", "",
        "## Subcategory coverage", ""]
    for row in [r for r in data["subcategories"] if r["categoryId"] == category["categoryId"]]:
        lines += ["- " + row["name"] + ": " + "; ".join(data["templates"][o["templateId"]]["label"] for o in row["offerings"]) + "."]
    for screen in experience["merchantScreens"]:
        lines += ["", f"## {screen['label']}", "", screen["behavior"], "", "| Actual offering | Relevant information for this screen |", "| --- | --- |"]
        for key in ids:
            template = data["templates"][key]
            relevant = experience["templateBindings"][key]["merchantScreens"][screen["id"]]["fieldIds"]
            names = "; ".join(fields[k]["label"] for k in relevant) if relevant else "Use the actual selected workflow and its existing owner/source references; no irrelevant product inputs are invented."
            lines += [f"| [{template['label']}](../templates/{key}.md) | {md(names)} |"]
        lines += ["", "Required scenario: " + screen["scenario"]]
    lines += ["", "## Customer screens and the selected workflow", "", "| Offering | Applicable customer surfaces | Registered model/workflow illustrations |", "| --- | --- | --- |"]
    customer_labels = {s["id"]: s["label"] for s in experience["customerScreens"]}
    for key in ids:
        template = data["templates"][key]
        binding = experience["templateBindings"][key]
        surfaces = "; ".join(customer_labels[k] for k, value in binding["customerScreens"].items() if value["applicable"])
        routes = "; ".join(r["modelId"] + ": " + ", ".join(r["workflowRefs"]) for r in binding["workflowBindings"])
        lines += [f"| [{template['label']}](../templates/{key}.md) | {md(surfaces)} | {md(routes)} |"]
    lines += ["", "Actual specialty/method routing uses the preserved existing or approved per-offering workflow references in the JSON; a general model illustration does not replace a regulated, remote, greeting or other specialty variant. Each full template matrix names every merchant field, requirement, scope and exact customer destination.", "",
        "## Readiness and historical facts", "", "A complete draft is distinct from approved publication, current stock/capacity and a confirmed transaction. Keep actual variant/option relationships, typed units, source ownership and private intake. Accepted work retains its specification, price and policy versions even when the current catalogue changes.", ""]
    return "\n".join(lines)


def workflow_information_doc(data):
    experience = data["experienceMap"]
    models = read_json("models")["models"]
    lines = ["# Product information in every selected workflow", "", "Status: all-category workflow design integration. Existing state machines, guards and model meanings remain authoritative. The information contract below connects the actual offering specification and customer selection to those workflows.", "",
        "[All screens and categories](all-screens-and-workflows.md) / [Structured workflow bindings](all-screens-and-workflows.json)", "",
        "## Inputs and accepted specification", "",
        "Every route references the actual specific template, stable offering/variant/options, exact quantity/unit or interval, applicable specification/chart/policy revision and authoritative price. Applicable typed input requirements come from the selected template and conditional groups. Only owner-confirmed setup, authority, capacity and permission can enable the selected command.", "",
        "Public product specifications belong to Catalog. Price and accepted monetary facts belong to their declared Commerce owner. Stock remains Inventory-owned. Existing Workflow/availability and resource authorities control actual commitments. Private customer responses are restricted transaction records and never public listing content.", "",
        "The JSON's acceptedSpecification separates public catalogue fields, price fields and private intake references. Model setup and allocation rules are referenced from the existing model registry. Transition contracts are derived from the current effective workflow snapshot, with its source hash, rather than replaced by a generic checkout graph.", ""]
    for model in models:
        mid = model["id"]
        templates = [t for t in data["templates"].values() if mid in t["modelIds"]]
        refs = sorted({wid for t in templates for r in experience["templateBindings"][t["id"]]["workflowBindings"] if r["modelId"] == mid for wid in r["workflowRefs"]})
        lines += [f"## {mid}", "", "Registered workflow illustrations: " + ", ".join(refs) + ".", "",
            "Offering kinds: " + "; ".join(f"[{t['label']}](templates/{t['id']}.md)" for t in templates) + ".", "",
            "### Customer journey", ""] + [str(i) + ". " + step for i, step in enumerate(model["customerFlow"], 1)]
        lines += ["", "### Merchant work", ""] + [str(i) + ". " + step for i, step in enumerate(model["merchantFlow"], 1)]
        lines += ["", "Required setup: " + "; ".join(model["requiredSetup"]) + ".", "", "Allocation/acceptance rule: " + model["allocationRule"], "",
            "Specification rule: the actual selected offering's field/option/quantity or interval values and accepted versions accompany this route. Missing/contradictory inputs remain unresolved; neither merchant identity nor a descriptive answer supplies missing product facts.", ""]
    lines += ["## Specialty route composition", "", experience["workflowSelectionPolicy"], "",
        "All 128 specialtyScreenCoverage records retain offeringRoutes with historical workflow references, approved extensions, allowed intake modes and approval references. The 21 approved additions expand only the exact reviewed offering/model combinations. Actual command authorization, source authority, confirmation and policy checks remain necessary.", "",
        "## Change and recovery", "", "A reschedule, specification amendment, substitution, cancellation or refund follows the existing authorized route. A changed current product specification does not update already accepted work. Unknown outcomes are reconciled before retries; price, allocation, payment, fulfilment and source sync states remain independent.", ""]
    return "\n".join(lines)


def main():
    data = make_catalogue()
    outputs = render_documents(data)
    outputs["catalogue.json"] = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    for name, content in outputs.items():
        path = HERE / name
        if not path.resolve().is_relative_to(HERE.parent.resolve()):
            raise ValueError("Output leaves the merchant planning package: " + name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
    manifest = dict(date="2026-10-31", status=data["status"], runtimeEnabled=False,
                    sources=data["sources"], counts=data["counts"],
                    generatedFiles={name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in sorted(outputs)})
    (HERE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(dict(status="GENERATED_NOT_YET_VERIFIED", **data["counts"], generatedFiles=len(outputs)), indent=2))


if __name__ == "__main__":
    main()
