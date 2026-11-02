"""Derive all-specialty Promotions design coverage from the canonical offering map."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import definition as D

HERE = Path(__file__).resolve().parent
PLAN = HERE.parent
REPO = PLAN.parent.parent
CATALOGUE = PLAN / "offering-map" / "catalogue.json"
DOMAIN = PLAN / "payload-reserve-plan" / "reconciliation" / "effective-domain-registry.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compose():
    catalogue = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    domain = json.loads(DOMAIN.read_text(encoding="utf-8"))
    field_defs = []
    for group, entries in D.FIELD_GROUPS.items():
        for key, label, kind, required, display in entries:
            field_defs.append(dict(id=f"PR_{group}_{key}", group=group, label=label, inputType=kind,
                requiredWhen=required, purposeAndDisplay=display, status="DESIGN_DEFINITION"))
    rows = []
    for row in catalogue["subcategories"]:
        offering_rows = []
        for offering in row["offerings"]:
            tid = offering["templateId"]
            template = catalogue["templates"][tid]
            fields = catalogue["experienceMap"]["templateBindings"][tid]["merchantScreens"]["SC_PROMOTIONS"]["fieldIds"]
            public = [fid for fid in fields if catalogue["fields"][fid]["visibility"] == "public"]
            routes = []
            for route in offering["modelRoutes"]:
                model = route["modelId"]
                rules = D.MODEL_RULES[model]
                routes.append(dict(modelId=model, promotionTypeCandidates=rules["types"], modelRuleRef=model,
                    sourceWorkflowRefs=route["existingWorkflowRefs"] + route["approvedWorkflowRefs"],
                    sourceCompatibility=route["compatibility"], designApprovalRef=route["designApprovalRef"],
                    customerCTA=rules["cta"], runtimeEnabled=False))
                routes[-1]["monetaryScopeCondition"] = rules["monetaryScopeCondition"]
                routes[-1]["defaultForUnknownPrice"] = rules.get("defaultForUnknownPrice", ["FEATURED"])
            offering_rows.append(dict(templateId=tid, name=template["label"], publicSpecificationFieldRefs=public,
                unitAndPricePolicy="Resolve the actual selected price/unit/component and source; a template candidate is not an eligible actual campaign.",
                sourceModelRoutes=routes))
        rows.append(dict(categoryId=row["categoryId"], categoryName=row["categoryName"],
            subcategoryId=row["subcategoryId"], name=row["name"], categoryContext=D.CATEGORY_CONTEXT[row["categoryId"]],
            offeringBindings=offering_rows,
            requiredGates=["actor/business/location permission", "actual supported promotion/rule capability", "applicable approved policy/content", "published actual scope and price/stock/capacity sources", "funding/stacking/caps and time eligibility", "owner-confirmed publication/delivery"],
            unsupportedBehavior="Show exact unavailable or unresolved reason and owner/setup route; do not invent eligibility, price, consent or capacity.",
            screenFlowRefs=[step["id"] for step in D.FLOW], runtimeEnabled=False))
    return dict(version="1.2.0-design", date="2026-10-31", status="PROMOTIONS_CONCEPT_NOT_IMPLEMENTED", runtimeEnabled=False,
        sources=dict(catalogue=dict(path=str(CATALOGUE.relative_to(REPO)).replace('\\','/'), sha256=sha(CATALOGUE)),
                     effectiveDomains=dict(path=str(DOMAIN.relative_to(REPO)).replace('\\','/'), sha256=sha(DOMAIN)),
                     definition=dict(path="docs/merchant-portal-plan/promotions-concept/definition.py", sha256=sha(HERE/"definition.py"))),
        baselinePromotionTypeRefs=[p["id"] for p in domain["promotionTypes"]],
        proposedPromotionTypes=D.PROMOTION_TYPES, fields=field_defs, flow=D.FLOW,
        modelRules=D.MODEL_RULES, stateDimensions=D.STATE_DIMENSIONS, surfaceContracts=D.SURFACE_CONTRACTS, imageBriefs=D.IMAGE_BRIEFS,
        rows=rows, counts=dict(categories=len({r["categoryId"] for r in rows}), subcategories=len(rows),
            offeringTypes=len({o["templateId"] for r in rows for o in r["offeringBindings"]}),
            offeringBindings=sum(len(r["offeringBindings"]) for r in rows),
            offeringModelBindings=sum(len(o["sourceModelRoutes"]) for r in rows for o in r["offeringBindings"]),
            modelRules=len(D.MODEL_RULES), fields=len(field_defs), imageBriefs=len(D.IMAGE_BRIEFS)))


def documents(data):
    docs = {}
    lines = ["# Promotions coverage: all 128 subcategories", "", "Design coverage only. Each row names actual offering templates and model adaptations; runtime eligibility and activation are not inferred.", "",
        "| Category / subcategory | Actual offering templates | Adaptation and customer journey |", "| --- | --- | --- |"]
    for row in data["rows"]:
        offerings = "; ".join(o["name"] for o in row["offeringBindings"])
        models = list(dict.fromkeys(r["modelId"] for o in row["offeringBindings"] for r in o["sourceModelRoutes"]))
        lines.append(f"| {row['categoryName']} / {row['name']} | {offerings} | {row['categoryContext']} Models: {', '.join(models)}. |")
    docs["coverage-128.md"] = "\n".join(lines) + "\n"
    fields = ["# Promotions fields and workflow", "", "Status: proposed design. Exact input constraints and owner commands require their actual contracts.", "", "| Field | Input | Required condition | Purpose / display |", "| --- | --- | --- | --- |"]
    for f in data["fields"]:
        fields.append(f"| {f['label']} | {f['inputType']} | {f['requiredWhen']} | {f['purposeAndDisplay']} |")
    fields += ["", "## Full campaign journey", ""]
    for step in data["flow"]:
        fields += [f"- {step['id']} / {step['title']}: {step['outcome']}"]
    fields += ["", "## Model-specific forms and qualifiers", "", "| Actual model | Unit/scope | Qualifiers | Customer view and CTA |", "| --- | --- | --- | --- |"]
    for key, r in data["modelRules"].items():
        fields.append(f"| {key} / {r['label']} | {r['unit']} | {'; '.join(r['qualifiers'])}. {r['dateMeaning']} {r['benefit']} | {r['customer']} Action: {r['cta']}. |")
    fields += ["", "## Unified campaigns, type-specific fields, history and customer-app preview", ""]
    for key, contract in data["surfaceContracts"].items():
        fields += [f"### {key}", "", contract["purpose"], ""]
        for name, value in contract.items():
            if name not in ("purpose", "runtimeEnabled"):
                rendered = "; ".join(value) if isinstance(value, list) else str(value)
                fields += [f"- {name}: {rendered}"]
        fields.append("")
    docs["fields-and-workflows.md"] = "\n".join(fields) + "\n"
    docs["coverage-128.json"] = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    docs["fields-and-workflows.json"] = json.dumps({k:data[k] for k in ("version","status","runtimeEnabled","proposedPromotionTypes","fields","flow","modelRules","stateDimensions","surfaceContracts","imageBriefs")}, ensure_ascii=False, indent=2) + "\n"
    return docs


def main():
    data = compose()
    for name, content in documents(data).items():
        (HERE/name).write_text(content, encoding="utf-8", newline="\n")
    print(json.dumps(dict(status="DESIGN_GENERATED", **data["counts"]), indent=2))


if __name__ == "__main__":
    main()
