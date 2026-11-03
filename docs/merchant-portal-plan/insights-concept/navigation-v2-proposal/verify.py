"""Verify the proposed navigation files without writing to the parent package.

The result is verification.json beside this script. Checks establish static
proposal consistency and file integrity, not approval or runtime behavior.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import struct
import sys
from urllib.parse import unquote, urlsplit
import zlib


HERE = Path(__file__).resolve().parent
PARENT = HERE.parent
PLAN = PARENT.parent
WORKSPACE = HERE.parents[3]
OUTPUT = HERE / "verification.json"
PROPOSED = "PROPOSED_FOR_REVIEW"
PEER_ORDER = [
    "overview", "orders", "appointments", "rentals", "transfers", "visits",
    "bookings", "quotes", "production", "jobs", "collections", "shipments",
    "storage", "passes", "menu", "products", "services", "fleet",
    "experiences", "spaces", "capacity", "staff", "customers", "operations",
    "reviews", "promotions", "finance", "reports",
]
MODEL_PEERS = {
    "ORDER": "orders", "APPOINTMENT": "appointments", "ASSET_INTERVAL": "rentals",
    "TRANSFER": "transfers", "FIELD_VISIT": "visits", "SESSION_CAPACITY": "bookings",
    "SPACE_RESERVATION": "bookings", "TOUR": "bookings", "REQUEST_QUOTE": "quotes",
    "PRODUCTION_DUE": "production", "SERVICE_JOB": "jobs", "LINKED_WINDOWS": "collections",
    "FREIGHT": "shipments", "STORAGE": "storage", "ENTITLEMENT": "passes",
}
BOOKING_MODELS = {"SESSION_CAPACITY", "SPACE_RESERVATION", "TOUR"}
REFERENCES = {
    "reference-detail-tabs.png": {
        "original": r"C:\Users\limta\AppData\Local\Temp\codex-clipboard-a320999c-7742-4035-9c4c-c1ee9b3133eb.png",
        "originalSha256": "85ee2cb562b8103cda304ddc523051f214e8a4c2d83d9b76cfa63bc01b5a1b03",
    },
    "reference-overview-tabs.png": {
        "original": r"C:\Users\limta\AppData\Local\Temp\codex-clipboard-d7830d3d-fc27-4b5c-a402-19fea98acf40.png",
        "originalSha256": "b7e3ebc31d8e1369c3c635463bec89a8a0587eac7343993198b6249e22169de5",
    },
}


class Failure(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Failure(message)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def keyed(rows, field, label):
    require(isinstance(rows, list), f"{label} is not a list")
    result = {}
    for row in rows:
        require(isinstance(row, dict) and field in row, f"Invalid {label} row")
        identity = row[field]
        require(identity not in result, f"Duplicate {label}: {identity}")
        result[identity] = row
    return result


def parent_hashes():
    return {path.name: digest(path) for path in sorted(PARENT.iterdir()) if path.is_file()}


def png_integrity(path):
    data = path.read_bytes()
    require(data.startswith(b"\x89PNG\r\n\x1a\n"), f"Invalid PNG signature: {path.name}")
    offset, count, idats = 8, 0, 0
    width = height = None
    ended = False
    while offset < len(data):
        require(offset + 12 <= len(data), f"Truncated PNG chunk: {path.name}")
        size = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        end = offset + 12 + size
        require(end <= len(data), f"Truncated PNG payload: {path.name}")
        payload = data[offset + 8:offset + 8 + size]
        crc = struct.unpack(">I", data[end - 4:end])[0]
        require(zlib.crc32(kind + payload) & 0xFFFFFFFF == crc,
                f"PNG CRC mismatch: {path.name}/{kind!r}")
        require(re.fullmatch(rb"[A-Za-z]{4}", kind), f"Invalid PNG chunk type: {path.name}")
        if count == 0:
            require(kind == b"IHDR" and size == 13, f"Invalid PNG IHDR: {path.name}")
            width, height = struct.unpack(">II", payload[:8])
            require(width > 0 and height > 0, f"Invalid PNG dimensions: {path.name}")
        else:
            require(kind != b"IHDR", f"Duplicate PNG IHDR: {path.name}")
        idats += kind == b"IDAT"
        count += 1
        offset = end
        if kind == b"IEND":
            require(size == 0 and end == len(data), f"Invalid PNG ending: {path.name}")
            ended = True
            break
    require(ended and idats, f"PNG missing IDAT or IEND: {path.name}")
    return {"file": path.name, "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data), "width": width, "height": height,
            "chunkCount": count, "allChunkCrcsValid": True}


def local_target(document, target):
    if not target or target.startswith("#"):
        return None
    if not re.match(r"^[A-Za-z]:[/\\]", target) and urlsplit(target).scheme:
        return None
    path_text = unquote(target.split("#", 1)[0].split("?", 1)[0])
    path_text = re.sub(r":\d+$", "", path_text)
    if not path_text:
        return None
    path = Path(path_text)
    return path.resolve() if path.is_absolute() else (document.parent / path).resolve()


def main():
    checks, errors, reference_results = [], [], []
    counts, state = {}, {}
    before = parent_hashes()

    def run(name, action):
        try:
            detail = action()
            checks.append({"id": name, "status": "PASS", "detail": detail})
        except (Failure, OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            errors.append({"check": name, "message": str(error)})
            checks.append({"id": name, "status": "FAIL", "detail": str(error)})

    def inputs():
        paths = {
            "matrix": HERE / "merchant-tab-matrix.json",
            "coverage": PARENT / "coverage.json",
            "profiles": PLAN / "payload-reserve-plan/reconciliation/effective-profiles-128.json",
            "additions": PLAN / "offering-map/approved-profile-additions.json",
            "composition": PLAN / "offering-map/all-screens-and-workflows.json",
            "models": PLAN / "payload-reserve-plan/models.json",
            "metrics": PARENT / "metric-registry.json",
        }
        state.update({name: read_json(path) for name, path in paths.items()})
        state["paths"] = paths
        return "Loaded independent parent coverage, effective profiles, approved-source additions, offering composition, model and metric registries"

    run("independent_source_inputs", inputs)
    if "matrix" not in state:
        return finish(checks, errors, counts, reference_results, before)

    def source_preservation():
        refs = state["matrix"]["sourceRefs"]
        expected = {"coverage": state["paths"]["coverage"],
                    "effectiveProfiles": state["paths"]["profiles"],
                    "additionalSourceRoutes": state["paths"]["additions"]}
        require(set(refs) == set(expected), "Unexpected source reference set")
        for name, path in expected.items():
            declared = Path(refs[name]["path"])
            resolved = declared.resolve() if declared.is_absolute() else (WORKSPACE / declared).resolve()
            require(resolved == path.resolve(), f"Source path redirects: {name}")
            require(digest(path) == refs[name]["sha256"], f"Pre-proposal source snapshot changed: {name}")
        # The unchanged coverage snapshot records its own independent sources.
        inherited = {"effectiveProfiles": state["paths"]["profiles"],
                     "offeringComposition": state["paths"]["composition"],
                     "approvedAdditions": state["paths"]["additions"],
                     "modelContracts": state["paths"]["models"]}
        for name, path in inherited.items():
            require(digest(path) == state["coverage"]["sourceRefs"][name]["sha256"],
                    f"Inherited source hash changed: {name}")
        counts["preProposalSourceHashesCompared"] = len(expected)
        return "Three saved pre-proposal source hashes match; all four inherited source hashes also match"

    run("pre_proposal_source_preservation", source_preservation)

    def baseline():
        rows = keyed(state["matrix"]["baselineProfiles"], "subcategoryId", "matrix profile")
        effective = keyed(state["profiles"]["rows"], "subcategoryId", "effective profile")
        coverage = keyed(state["coverage"]["baselineProfiles"], "subcategoryId", "parent profile")
        require(len(rows) == len(effective) == len(coverage) == 128, "Expected 128 baseline profiles")
        require(set(rows) == set(effective) == set(coverage), "Baseline profile identities differ")
        require(len({row["categoryId"] for row in rows.values()}) == 21, "Expected 21 categories")
        positions = {row["subcategoryId"]: index for index, row in enumerate(state["profiles"]["rows"])}
        for identity, row in rows.items():
            original, parent = effective[identity], coverage[identity]
            for target, source in [("name", "name"), ("categoryId", "categoryId"),
                                   ("sourceProfileId", "sourceProfileId"),
                                   ("baselineDefaultModelSuggestion", "defaultModelId"),
                                   ("baselineCandidateModelIds", "candidateModelIds"),
                                   ("sourceWorkflowOptionsByModel", "workflowOptionsByModel")]:
                require(row[target] == original[source], f"Baseline {target} changed: {identity}")
            require(row["sourceRuleRefs"] == parent["sourceRuleRefs"]
                    == [rule["id"] for rule in original["rules"]], f"Rule references changed: {identity}")
            guard = ("../payload-reserve-plan/reconciliation/effective-profiles-128.json"
                     f"#/rows/{positions[identity]}/enablementGuard")
            require(row["sourceGuardRef"] == parent["sourceGuardRef"] == guard,
                    f"Effective guard reference changed: {identity}")
            # Guard references retain their original coverage-document context.
            reference_path, pointer = guard.split("#", 1)
            require((PARENT / reference_path).resolve() == state["paths"]["profiles"].resolve(),
                    f"Guard points outside the effective profile source: {identity}")
            node = state["profiles"]
            for part in pointer.strip("/").split("/"):
                node = node[int(part)] if isinstance(node, list) else node[part]
            require(node == original["enablementGuard"], f"Guard does not resolve exactly: {identity}")
            require(row["candidateModelIdsIncludingSourceAdditions"] == parent["candidateReportFamilyIds"],
                    f"Merged source model candidates differ: {identity}")
            expected_extra = [item["id"] for item in state["coverage"]["approvedAdditions"]
                              if item["subcategoryId"] == identity]
            require(row["sourceAdditionalRouteIds"] == expected_extra,
                    f"Additional route references changed: {identity}")
            for model, templates in row["actualOfferingTemplateIdsByBaselineModel"].items():
                expected = {offering["templateId"] for offering in parent["offeringReportRoutes"]
                            for route in offering["routes"] if route["modelId"] == model}
                require(set(templates) == expected, f"Actual template scope differs: {identity}/{model}")
        state["baselineRows"] = rows
        counts.update(categories=21, baselineProfiles=128,
                      baselineCandidateModelBindings=sum(len(row["baselineCandidateModelIds"])
                                                         for row in rows.values()))
        require(counts["baselineCandidateModelBindings"] == 193, "Expected 193 baseline model bindings")
        return "128 exact IDs; model/default suggestions, source-relative guards, conditional rules, workflows and actual template scope preserved"

    run("baseline_mappings_and_guards", baseline)

    def exact_routes_and_intakes():
        observed, expected = set(), set()
        effective = keyed(state["profiles"]["rows"], "subcategoryId", "effective profile")
        for row in state["coverage"]["baselineProfiles"]:
            for offering in row["offeringReportRoutes"]:
                for route in offering["routes"]:
                    key = (row["subcategoryId"], offering["templateId"], route["modelId"],
                           tuple(route["workflowRefs"]), tuple(route["allowedIntakeModes"]),
                           route["compatibility"], route["designApprovalRef"])
                    require(key not in observed, f"Duplicate parent route: {key[:3]}")
                    observed.add(key)
                    modes = effective[row["subcategoryId"]]["intakeByModel"][route["modelId"]]["allowedModes"]
                    require(set(route["allowedIntakeModes"]) <= set(modes),
                            f"Intake mode contradicts effective model contract: {key[:3]}")
        for row in state["composition"]["specialtyScreenCoverage"]:
            for offering in row["offeringRoutes"]:
                for route in offering["routes"]:
                    expected.add((row["subcategoryId"], offering["templateId"], route["modelId"],
                                  tuple(route["existingWorkflowRefs"] + route["approvedWorkflowRefs"]),
                                  tuple(route["allowedIntakeModes"]), route["compatibility"],
                                  route["designApprovalRef"]))
        require(observed == expected and len(observed) == 411,
                "Expected 411 exact inherited specialty/template/model/workflow/intake bindings")
        counts["inheritedRouteWorkflowIntakeBindings"] = 411
        return "411 inherited route bindings exactly match composition and effective intake contracts; no new workflow or intake is introduced"

    run("inherited_route_and_intake_integrity", exact_routes_and_intakes)

    def additions():
        actual = state["matrix"]["additionalSourceRoutes"]
        parent = keyed(state["coverage"]["approvedAdditions"], "id", "parent addition")
        key = lambda row: (row["subcategoryId"], row["templateId"], row["modelId"])
        observed = {key(row) for row in actual}
        expected = {key(row) for row in state["additions"]["approval"]["routes"]}
        require(len(actual) == len(observed) == len(expected) == 21 and observed == expected,
                "Expected 21 exact separate source addition tuples")
        require(len({row["id"] for row in actual}) == 21, "Duplicate source addition ID")
        for row in actual:
            original = parent[row["id"]]
            require(key(row) == key(original), f"Addition identity changed: {row['id']}")
            require(row["sourceWorkflowRefs"] == original["workflowRefs"],
                    f"Addition workflows changed: {row['id']}")
            require(row["sourceAllowedIntakeModes"] == original["allowedIntakeModes"],
                    f"Addition intake modes changed: {row['id']}")
            require(row["baselinePreserved"] is True, f"Addition replaces baseline: {row['id']}")
        counts.update(additionalSourceRoutes=21,
                      specialtiesWithAdditionalRoutes=len({row["subcategoryId"] for row in actual}))
        return "21 exact source tuples across 17 specialties; baseline, workflows and intake modes preserved"

    run("separate_source_additions", additions)

    def peer_rules():
        matrix = state["matrix"]
        require(matrix["stablePeerOrder"] == PEER_ORDER and len(set(PEER_ORDER)) == 28,
                "Stable 28-peer order changed")
        tabs = keyed(matrix["tabRegistry"], "key", "peer tab")
        require(list(tabs) == PEER_ORDER, "Tab registry order differs from stable order")
        for index, tab in enumerate(tabs.values()):
            require(tab["order"] == index and tab["isPeerDestination"] is True,
                    f"Invalid peer order/destination: {tab['key']}")
        rules = keyed(matrix["modelTabRules"], "modelId", "model rule")
        source_models = set(keyed(state["models"]["models"], "id", "source model"))
        require(set(rules) == set(MODEL_PEERS) == source_models and len(rules) == 15,
                "Expected all 15 exact source model IDs")
        for model, rule in rules.items():
            require(rule["workTabKey"] == MODEL_PEERS[model], f"Wrong model peer: {model}")
            require(rule["modelSegmentKey"] == (model if model in BOOKING_MODELS else None),
                    f"Wrong canonical model segment: {model}")
            require(set(rule["offeringTabAlternatives"]) <= set(PEER_ORDER[14:20]),
                    f"Invalid offering presentation key: {model}")
            require(rule["categoryMayActivate"] is False, f"Category activates model peer: {model}")
        require(len({rule["workTabKey"] for rule in rules.values()}) == 13,
                "Expected 13 deduplicated model-work peers")
        for row in matrix["baselineProfiles"]:
            identity = row["subcategoryId"]
            for field in ["candidatePeerTabKeys", "candidatePeerTabKeysIncludingSourceAdditions"]:
                keys = row[field]
                require(keys and keys[0] == "overview" and keys[-1] == "reports"
                        and len(keys) == len(set(keys)) and set(keys) <= set(PEER_ORDER)
                        and keys == sorted(keys, key=PEER_ORDER.index),
                        f"Invalid candidate peer order/dedup: {identity}/{field}")
            require(row["alwaysPeerKeysWhenAuthorized"] == ["overview", "reports"],
                    f"Overview/Reports are not authorized peers: {identity}")
            require({binding["modelId"] for binding in row["candidateModelTabBindings"]}
                    == set(row["baselineCandidateModelIds"]), f"Missing model binding: {identity}")
            for binding in row["candidateModelTabBindings"]:
                rule = rules[binding["modelId"]]
                require(binding["workTabKey"] == rule["workTabKey"]
                        and binding["modelSegmentKey"] == rule["modelSegmentKey"],
                        f"Model peer binding differs: {identity}")
            for model, keys in row["candidateOfferingTabAlternativesByModel"].items():
                require(set(keys) <= set(rules[model]["offeringTabAlternatives"]),
                        f"Offering presentation outside model rule: {identity}/{model}")
            if "ASSET_INTERVAL" in row["baselineCandidateModelIds"]:
                require("capacityPresentationRules.fleetAssetQuestionDedup"
                        in row["defaultPeerSuppressionRuleRefs"], f"No Fleet/Capacity dedup: {identity}")
        for row in matrix["additionalSourceRoutes"]:
            binding, rule = row["candidateModelTabBinding"], rules[row["modelId"]]
            require(binding["modelId"] == row["modelId"]
                    and binding["workTabKey"] == rule["workTabKey"]
                    and binding["modelSegmentKey"] == rule["modelSegmentKey"],
                    f"Invalid additional route peer: {row['id']}")
            keys = row["candidatePeerTabKeys"]
            require(keys[0] == "overview" and keys[-1] == "reports"
                    and len(keys) == len(set(keys)) and keys == sorted(keys, key=PEER_ORDER.index),
                    f"Invalid additional route peer order: {row['id']}")
        capacity = matrix["capacityPresentationRules"]
        require(capacity["canonicalKey"] == "capacity", "Capacity key changed")
        require({rule["modelId"]: rule["displayLabel"] for rule in capacity["displayRules"]}
                == {"TOUR": "Departures", "SESSION_CAPACITY": "Sessions", "SPACE_RESERVATION": "Capacity"},
                "Incorrect capacity display-label rules")
        require(capacity["fleetAssetQuestionDedup"]["preferredPeer"] == "fleet"
                and capacity["staffAdmission"]["requires"], "Missing asset dedup or Staff evidence gates")
        counts.update(models=15, workPeerKeys=13, offeringPresentationKeys=6, totalRegisteredPeerKeys=28)
        state["tabKeys"] = set(tabs)
        return "15 exact model rules, 13 work peers, 28 unique ordered keys, Overview/Reports peers, Bookings segments and capacity/staff gates"

    run("peer_order_model_rules_and_gates", peer_rules)

    def proposed_status():
        matrix = state["matrix"]
        require(matrix["status"] == PROPOSED and matrix["runtimeEnabled"] is False
                and matrix["appliedToExistingFiles"] is False, "Top-level proposal status/runtime claim changed")
        for collection in ["baselineProfiles", "additionalSourceRoutes", "modelTabRules",
                           "tabRegistry", "admissionGates", "hybridDedupRules", "referenceOnlyExtensions"]:
            for row in matrix[collection]:
                require(row["status"] == PROPOSED, f"Non-proposed row in {collection}")
                if "runtimeEnabled" in row:
                    require(row["runtimeEnabled"] is False, f"Runtime enabled in {collection}")
        require(all(row["runtimeEnabled"] is False for name in ["baselineProfiles", "additionalSourceRoutes", "modelTabRules"]
                    for row in matrix[name]), "Mapping runtime must remain false")
        require(matrix["capacityPresentationRules"]["status"] == PROPOSED
                and matrix["offeringTemplateRefinement"]["status"] == PROPOSED,
                "Presentation rules must remain proposed")
        require(matrix["staticVerification"]["runtimeTestsRun"] is False
                and matrix["staticVerification"]["newNavigationApproved"] is False,
                "Static mapping record claims runtime or approval")
        return "All new mappings remain PROPOSED_FOR_REVIEW; no runtime enablement or navigation approval is claimed"

    run("proposal_status_and_runtime_boundary", proposed_status)

    def catalogue():
        path = HERE / "reports-catalogue-proposal.json"
        if not path.exists():
            return "Optional catalogue is absent; catalogue/metric coverage checks were not run"
        data = read_json(path)
        reports = keyed(data["reports"], "id", "draft report")
        metrics = keyed(state["metrics"]["metrics"], "id", "registered metric")
        require(len(metrics) == 37, "Expected existing 37-metric registry")
        require(data["status"] == PROPOSED and data["runtimeEnabled"] is False,
                "Catalogue claims runtime or approval")
        require(data["reportCount"] == len(reports), "Catalogue report count differs")
        require((HERE / data["metricRegistry"]).resolve() == state["paths"]["metrics"].resolve()
                and (HERE / data["tabRegistry"]).resolve() == state["paths"]["matrix"].resolve(),
                "Catalogue registry reference redirects")
        used_metrics, explicit_models = set(), set()
        for identity, report in reports.items():
            require(re.fullmatch(r"RPT_[A-Z0-9_]+", identity), f"Invalid report ID: {identity}")
            require(report["status"] == PROPOSED and report["runtimeEnabled"] is False,
                    f"Report claims runtime or approval: {identity}")
            require(report["entryTabs"] and set(report["entryTabs"]) <= set(PEER_ORDER),
                    f"Unknown report entry peer: {identity}")
            require(report["models"] and set(report["models"]) <= set(MODEL_PEERS) | {"*"},
                    f"Unknown report model: {identity}")
            require(len(report["metricIds"]) == len(set(report["metricIds"]))
                    and set(report["metricIds"]) <= set(metrics), f"Unknown/duplicate metric: {identity}")
            allowed_models = set(MODEL_PEERS) if "*" in report["models"] else set(report["models"])
            for metric_id in report["metricIds"]:
                registered = metrics[metric_id]
                metric_models = set(MODEL_PEERS) if "*" in registered["models"] else set(registered["models"])
                require(allowed_models & metric_models, f"Incompatible report/metric models: {identity}/{metric_id}")
            require(report["metricCompatibility"], f"No model-intersection rule: {identity}")
            used_metrics.update(report["metricIds"])
            explicit_models.update(set(report["models"]) - {"*"})
        require(used_metrics == set(metrics), "Catalogue must reference all 37 existing metrics")
        require(explicit_models == set(MODEL_PEERS), "Catalogue must explicitly cover all 15 models")
        counts.update(draftReports=len(reports), existingMetricsReferenced=len(used_metrics),
                      catalogueModelsExplicitlyCovered=len(explicit_models))
        state["catalogueIds"] = set(reports)
        return f"{len(reports)} unique proposed report IDs; valid peer/model/metric references, all 37 metrics and all 15 models covered"

    run("optional_report_catalogue", catalogue)

    def image_references():
        for name, reference in REFERENCES.items():
            path = HERE / name
            result = png_integrity(path)
            require(result["sha256"] == reference["originalSha256"], f"Saved reference differs from original fingerprint: {name}")
            original = Path(reference["original"])
            if original.exists():
                require(digest(original) == result["sha256"]
                        and original.read_bytes() == path.read_bytes(), f"Reference differs from original Temp file: {name}")
                result["originalTempCompared"] = True
            else:
                result["originalTempCompared"] = False
                result["comparisonBasis"] = "Original SHA256 fingerprint recorded while original Temp file existed"
            result["originalTempPath"] = reference["original"]
            result["originalSha256"] = reference["originalSha256"]
            reference_results.append(result)
        counts["unchangedReferencePngs"] = len(reference_results)
        return "Two valid PNGs match original fingerprints; available Temp originals are compared byte for byte"

    run("unchanged_supplied_reference_images", image_references)

    def parent_image_preservation():
        manifest = read_json(PARENT / "image-manifest.json")
        rows = keyed(manifest["images"], "id", "parent selected image")
        require(len(rows) == 12, "Expected 12 parent selected images")
        for identity, row in rows.items():
            path = PARENT / row["file"]
            require(path.is_file() and digest(path) == row["sha256"], f"Parent selected image changed: {identity}")
        counts["parentSelectedImageHashesCompared"] = len(rows)
        return "12 parent selected images match their existing saved manifest hashes"

    run("parent_selected_image_preservation", parent_image_preservation)

    def documents_and_links():
        required = {"README.md", "proposed-navigation-plan.md", "merchant-tab-matrix.md",
                    "merchant-tab-matrix.json", "review-scenarios.md", "verify.py",
                    "reference-detail-tabs.png", "reference-overview-tabs.png"}
        require(all((HERE / name).is_file() for name in required), "Missing proposal document or reference")
        count = 0
        pattern = re.compile(r"\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)")
        markdown = sorted(HERE.glob("*.md"))
        for path in markdown:
            text = path.read_text(encoding="utf-8")
            require(PROPOSED in text, f"Document lacks proposed status: {path.name}")
            text = re.sub(r"```.*?```", "", text, flags=re.S)
            for match in pattern.finditer(text):
                target = match.group(1) or match.group(2)
                resolved = local_target(path, target)
                if resolved is not None:
                    count += 1
                    require(resolved == OUTPUT or resolved.exists(), f"Broken local link: {path.name} -> {target}")
            for report_id in re.findall(r"\bRPT_[A-Z0-9_]+\b", text):
                require(report_id in state.get("catalogueIds", set()), f"Unknown named report ID: {report_id}")
        matrix_text = (HERE / "merchant-tab-matrix.md").read_text(encoding="utf-8")
        require(sum(line.startswith("| ") and "(`" in line for line in matrix_text.splitlines()) == 128,
                "Markdown does not enumerate 128 baseline rows")
        require(sum(line.startswith("| IN_EXT_") for line in matrix_text.splitlines()) == 21,
                "Markdown does not enumerate 21 separate additions")
        counts.update(proposalMarkdownFiles=len(markdown), localDocumentLinks=count)
        return f"Required proposal files, 128 + 21 Markdown rows and {count} local link targets exist; section fragments are not checked"

    run("proposal_documents_and_local_links", documents_and_links)

    def counts_match():
        for name, value in state["matrix"]["counts"].items():
            require(name in counts and counts[name] == value, f"Declared matrix count differs: {name}")
        return "All declared matrix counts independently reconciled"

    run("declared_matrix_counts", counts_match)
    after = parent_hashes()
    if before == after:
        checks.append({"id": "parent_files_read_only_during_check", "status": "PASS",
                       "detail": f"All {len(before)} direct parent files have identical hashes before and after this verification run"})
    else:
        changed = sorted(name for name in before.keys() | after.keys() if before.get(name) != after.get(name))
        errors.append({"check": "parent_files_read_only_during_check", "message": ", ".join(changed)})
        checks.append({"id": "parent_files_read_only_during_check", "status": "FAIL", "detail": ", ".join(changed)})
    counts["parentDirectFilesReadOnlyDuringCheck"] = len(before)
    return finish(checks, errors, counts, reference_results, before)


def finish(checks, errors, counts, references, parent_inventory):
    passed = not errors
    result = {
        "scope": "Static checks for the new navigation proposal only",
        "status": "STATIC_PROPOSAL_CHECKS_PASSED" if passed else "STATIC_PROPOSAL_CHECKS_FAILED",
        "proposalStatus": PROPOSED,
        "newNavigationApproved": False,
        "runtimeEnabled": False,
        "runtimeTestsExecuted": False,
        "runtimeValidationClaimed": False,
        "command": "python docs/merchant-portal-plan/insights-concept/navigation-v2-proposal/verify.py",
        "counts": counts,
        "checks": checks,
        "errors": errors,
        "referenceImageIntegrity": references,
        "parentDirectFileHashInventoryAtRunStart": parent_inventory,
        "preservationEvidence": {
            "preProposalSnapshot": "The matrix records three earlier source hashes: parent coverage, effective profiles and prior source additions. Those are compared directly. The unchanged parent coverage also records four inherited source hashes.",
            "parentImages": "Existing parent image-manifest hashes are compared with the 12 selected parent PNGs.",
            "otherParentFiles": "The inventory records current direct-parent hashes and checks they do not change during this verifier run. Without earlier hashes, it does not prove those other files were unchanged throughout proposal authoring.",
            "writes": "Only proposal-local verification.json is written by this script. Parent files are read only.",
        },
        "limitations": [
            "No application navigation, reporting query, source ingestion, export generation, authorization or accessibility is tested.",
            "Static mapping and file integrity do not establish user approval or runtime readiness.",
            "PNG integrity and unchanged reference bytes do not approve their labels, business rules or example data.",
            "Local Markdown targets are checked for file/directory existence; section fragment IDs are not validated.",
        ],
    }
    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(result["status"])
    print(json.dumps(counts, sort_keys=True))
    for error in errors:
        print(f"FAIL {error['check']}: {error['message']}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
