"""Check this Insights planning package against its declared source snapshots.

Run ``python verify.py --structural-only`` while images are being generated.
Run ``python verify.py`` for the complete package check. The latter requires
the gallery and manifest. Both modes write verification.json and perform
static artifact checks only. They do not test application behavior.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
from urllib.parse import unquote, urlsplit
import zlib


PACKAGE = Path(__file__).resolve().parent
PLAN = PACKAGE.parent
WORKSPACE = PACKAGE.parents[2]
OUTPUT = PACKAGE / "verification.json"
EXPECTED_PROMPT_IDS = {f"INS_{number:02}" for number in range(1, 13)}
METRIC_FIELDS = {
    "id", "version", "question", "models", "owner", "requiredEvidence",
    "aggregation", "dateBasis", "unit", "exclusions", "dimensions",
    "drilldown", "availability",
}
ROW_FIELDS = {
    "primaryDefaultReport", "reportingDimensions", "lifecycleReportStages",
    "privacyNotes", "evidenceGates",
}
DEFERRED_DOCS = {"images.md", "image-manifest.json"}
REQUIRED_DOCS = {
    "README.md", "screen-design.md", "coverage.md", "coverage.json",
    "metric-registry.json", "validation-plan.md", "image-prompts.json",
    "images.md", "image-manifest.json", "verify.py", "verification.json",
}


class CheckFailure(Exception):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise CheckFailure(message)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unique_rows(rows: list, key: str, label: str) -> dict:
    require(isinstance(rows, list), f"{label} must be a list")
    result = {}
    for row in rows:
        require(isinstance(row, dict) and key in row, f"Invalid {label} row")
        identity = row[key]
        require(identity not in result, f"Duplicate {label} ID: {identity}")
        result[identity] = row
    return result


def coverage_routes(rows: list) -> set:
    routes = set()
    for row in rows:
        for offering in row["offeringReportRoutes"]:
            for route in offering["routes"]:
                require(route["runtimeEnabled"] is False,
                        f"Runtime enabled in route {row['subcategoryId']}/{offering['templateId']}")
                key = (
                    row["subcategoryId"], offering["templateId"], route["modelId"],
                    tuple(route["workflowRefs"]), tuple(route["allowedIntakeModes"]),
                    route["compatibility"], route["designApprovalRef"],
                )
                require(key not in routes, f"Duplicate coverage route: {key[:3]}")
                routes.add(key)
    return routes


def source_routes(rows: list) -> set:
    routes = set()
    for row in rows:
        for offering in row["offeringRoutes"]:
            for route in offering["routes"]:
                key = (
                    row["subcategoryId"], offering["templateId"], route["modelId"],
                    tuple(route["existingWorkflowRefs"] + route["approvedWorkflowRefs"]),
                    tuple(route["allowedIntakeModes"]), route["compatibility"],
                    route["designApprovalRef"],
                )
                require(key not in routes, f"Duplicate source route: {key[:3]}")
                routes.add(key)
    return routes


def inspect_png(path: Path) -> dict:
    data = path.read_bytes()
    require(data[:8] == b"\x89PNG\r\n\x1a\n", f"Invalid PNG signature: {path.name}")
    offset = 8
    chunks = 0
    idat_count = 0
    width = height = None
    ended = False
    while offset < len(data):
        require(offset + 12 <= len(data), f"Truncated PNG chunk: {path.name}")
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        chunk_type = data[offset + 4:offset + 8]
        end = offset + 12 + length
        require(end <= len(data), f"Truncated PNG payload: {path.name}")
        payload = data[offset + 8:offset + 8 + length]
        expected_crc = struct.unpack(">I", data[end - 4:end])[0]
        actual_crc = zlib.crc32(chunk_type + payload) & 0xFFFFFFFF
        require(actual_crc == expected_crc,
                f"PNG CRC mismatch in {path.name}: {chunk_type!r}")
        require(re.fullmatch(rb"[A-Za-z]{4}", chunk_type) is not None,
                f"Invalid PNG chunk type: {path.name}")
        if chunks == 0:
            require(chunk_type == b"IHDR" and length == 13,
                    f"PNG must start with one IHDR: {path.name}")
            width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(
                ">IIBBBBB", payload
            )
            require(width > 0 and height > 0, f"Invalid PNG dimensions: {path.name}")
            valid_depths = {0: {1, 2, 4, 8, 16}, 2: {8, 16}, 3: {1, 2, 4, 8},
                            4: {8, 16}, 6: {8, 16}}
            require(bit_depth in valid_depths.get(color_type, set()),
                    f"Invalid PNG bit depth/color type: {path.name}")
            require(compression == 0 and filtering == 0 and interlace in {0, 1},
                    f"Unsupported PNG header values: {path.name}")
        else:
            require(chunk_type != b"IHDR", f"Duplicate PNG IHDR: {path.name}")
        if chunk_type == b"IDAT":
            idat_count += 1
        if chunk_type == b"IEND":
            require(length == 0, f"Invalid PNG IEND: {path.name}")
            require(end == len(data), f"Unexpected bytes after PNG IEND: {path.name}")
            ended = True
        chunks += 1
        offset = end
        if ended:
            break
    require(ended and idat_count > 0, f"PNG lacks IDAT/IEND: {path.name}")
    return {"file": path.name, "width": width, "height": height,
            "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "chunkCount": chunks, "allChunkCrcsValid": True}


def resolve_local_target(document: Path, target: str) -> Path | None:
    target = target.strip()
    if not target or target.startswith("#"):
        return None
    # Windows drive paths are local despite looking like URI schemes.
    windows_drive = re.match(r"^[A-Za-z]:[/\\]", target) is not None
    if not windows_drive and urlsplit(target).scheme:
        return None
    target = unquote(target.split("#", 1)[0].split("?", 1)[0])
    target = re.sub(r":\d+$", "", target)
    if not target:
        return None
    path = Path(target)
    return path.resolve() if path.is_absolute() else (document.parent / path).resolve()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--structural-only", action="store_true",
                        help="Defer image completion, gallery and manifest checks")
    args = parser.parse_args()
    checks = []
    errors = []
    pending = []
    counts = {}
    image_results = []
    state = {}

    def run(name, action):
        try:
            detail = action()
            checks.append({"id": name, "status": "PASS", "detail": detail})
        except (CheckFailure, OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            message = str(error)
            errors.append({"check": name, "message": message})
            checks.append({"id": name, "status": "FAIL", "detail": message})

    def load_inputs():
        paths = {
            "coverage": PACKAGE / "coverage.json",
            "profiles": PLAN / "payload-reserve-plan/reconciliation/effective-profiles-128.json",
            "composition": PLAN / "offering-map/all-screens-and-workflows.json",
            "additions": PLAN / "offering-map/approved-profile-additions.json",
            "models": PLAN / "payload-reserve-plan/models.json",
            "metrics": PACKAGE / "metric-registry.json",
            "prompts": PACKAGE / "image-prompts.json",
        }
        state.update({key: read_json(path) for key, path in paths.items()})
        state["paths"] = paths
        return "Loaded independent effective profile, offering, approval and model sources"

    run("source_inputs", load_inputs)
    if "coverage" not in state:
        return write_result(args, checks, errors, pending, counts, image_results)

    def baseline_profiles():
        coverage = state["coverage"]
        source = unique_rows(state["profiles"]["rows"], "subcategoryId", "source profile")
        actual = unique_rows(coverage["baselineProfiles"], "subcategoryId", "coverage profile")
        require(len(source) == 128 and len(actual) == 128, "Expected exactly 128 baseline profiles")
        require(set(source) == set(actual), "Baseline subcategory identities differ from source")
        require(len({row["categoryId"] for row in actual.values()}) == 21,
                "Expected exactly 21 baseline categories")
        source_order = {row["subcategoryId"]: index for index, row in enumerate(state["profiles"]["rows"])}
        for identity, row in actual.items():
            original = source[identity]
            for target, field in [("categoryId", "categoryId"), ("name", "name"),
                                  ("sourceProfileId", "sourceProfileId"),
                                  ("sourceWorkflowId", "sourceWorkflowId"),
                                  ("baselineDefaultModelId", "defaultModelId"),
                                  ("baselineCandidateModelIds", "candidateModelIds"),
                                  ("baselineWorkflowOptionsByModel", "workflowOptionsByModel")]:
                require(row[target] == original[field], f"Changed baseline {target}: {identity}")
            require(row["sourceRuleRefs"] == [rule["id"] for rule in original["rules"]],
                    f"Changed conditional rule references: {identity}")
            expected_guard = ("../payload-reserve-plan/reconciliation/effective-profiles-128.json"
                              f"#/rows/{source_order[identity]}/enablementGuard")
            require(row["sourceGuardRef"] == expected_guard,
                    f"Incorrect effective guard reference: {identity}")
            require(ROW_FIELDS <= row.keys() and all(row[field] for field in ROW_FIELDS),
                    f"Missing lifecycle/reporting/evidence fields: {identity}")
            primary = row["primaryDefaultReport"]
            require(primary["selection"] == "ACTUAL_CONFIGURED_PRIMARY_OFFERING_MODEL"
                    and primary["suggestionOnly"] is True
                    and primary["categoryDoesNotActivate"] is True,
                    f"Category-forced report default: {identity}")
            require(row["runtimeEnabled"] is False, f"Runtime claim in baseline: {identity}")
        counts.update(categories=21, baselineSubcategories=len(actual))
        state["baseline"] = actual
        return "128 exact baseline IDs, category/model/workflow/rule/guard references and evidence fields"

    run("baseline_identity_and_preservation", baseline_profiles)

    def approved_extensions():
        source = state["additions"]["approval"]["routes"]
        actual = state["coverage"]["approvedAdditions"]
        key = lambda row: (row["subcategoryId"], row["templateId"], row["modelId"])
        expected = {key(row) for row in source}
        observed = {key(row) for row in actual}
        require(len(source) == len(actual) == len(expected) == len(observed) == 21,
                "Expected exactly 21 unique approved extension tuples")
        require(expected == observed, "Approved specialty/template/model tuples differ")
        require(len({row["id"] for row in actual}) == 21, "Duplicate addition row ID")
        composition_routes = source_routes(state["composition"]["specialtyScreenCoverage"])
        for row in actual:
            require(row["baselinePreserved"] is True and row["runtimeEnabled"] is False,
                    f"Addition changes baseline/runtime status: {row['id']}")
            require(row["designApprovalRef"] == state["additions"]["approval"]["approvalId"],
                    f"Wrong design approval: {row['id']}")
            require(ROW_FIELDS <= row.keys() and all(row[field] for field in ROW_FIELDS),
                    f"Missing addition reporting/evidence fields: {row['id']}")
            primary = row["primaryDefaultReport"]
            require(primary["selection"] == "ACTUAL_CONFIGURED_PRIMARY_OFFERING_MODEL"
                    and primary["suggestionOnly"] is True
                    and primary["categoryDoesNotActivate"] is True
                    and primary["extensionDoesNotReplaceBaseline"] is True,
                    f"Addition forces a report or replaces the baseline: {row['id']}")
            route_key = (*key(row), tuple(row["workflowRefs"]), tuple(row["allowedIntakeModes"]),
                         "APPROVED_PROFILE_EXTENSION", row["designApprovalRef"])
            require(route_key in composition_routes,
                    f"Addition workflow/intake differs from approved composition: {row['id']}")
        for baseline in state["coverage"]["baselineProfiles"]:
            additions = {row["modelId"] for row in actual
                         if row["subcategoryId"] == baseline["subcategoryId"]}
            require(set(baseline["approvedAdditionalModelIds"]) == additions,
                    f"Wrong merged extension family list: {baseline['subcategoryId']}")
            require(set(baseline["candidateReportFamilyIds"])
                    == set(baseline["baselineCandidateModelIds"]) | additions,
                    f"Wrong report candidates: {baseline['subcategoryId']}")
        counts.update(approvedAdditionalRoutes=21,
                      specialtiesWithAdditions=len({row["subcategoryId"] for row in actual}))
        return "21 exact approved tuples with preserved baseline and exact workflow/intake references"

    run("approved_addition_tuples", approved_extensions)

    def exact_offering_routes():
        observed = coverage_routes(state["coverage"]["baselineProfiles"])
        expected = source_routes(state["composition"]["specialtyScreenCoverage"])
        require(len(observed) == len(expected) == 411, "Expected exactly 411 route bindings")
        require(observed == expected,
                f"Route bindings differ: missing={len(expected - observed)}, extra={len(observed - expected)}")
        templates = {row[1] for row in observed}
        require(len(templates) == 189, "Expected 189 distinct offering templates")
        counts.update(specialtyTemplateModelRoutes=411, uniqueOfferingTemplates=len(templates))
        return "411 exact specialty/template/model/workflow/intake/approval bindings; 189 templates"

    run("exact_offering_route_bindings", exact_offering_routes)

    def source_hashes():
        refs = state["coverage"]["sourceRefs"]
        expected = {"effectiveProfiles": state["paths"]["profiles"],
                    "offeringComposition": state["paths"]["composition"],
                    "approvedAdditions": state["paths"]["additions"],
                    "modelContracts": state["paths"]["models"]}
        require(set(refs) == set(expected), "Source reference set differs from expected inputs")
        for name, path in expected.items():
            declared = Path(refs[name]["path"])
            resolved = declared.resolve() if declared.is_absolute() else (WORKSPACE / declared).resolve()
            require(resolved == path.resolve(), f"Source reference redirects {name}")
            require(refs[name]["sha256"] == sha256(path), f"Source hash changed: {name}")
        return "All four declared source paths and SHA256 hashes match independent current inputs"

    run("source_snapshot_hashes", source_hashes)

    def model_and_metric_registry():
        model_ids = set(unique_rows(state["models"]["models"], "id", "source model"))
        require(len(model_ids) == 15, "Expected 15 independently registered source models")
        report_rows = unique_rows(state["coverage"]["reportFamilies"], "id", "report family")
        report_ids = set(report_rows)
        require(report_ids == model_ids, "Report family IDs differ from the source model set")
        for identity, row in report_rows.items():
            require(row["runtimeVerified"] is False and "PROPOSED" in row["status"],
                    f"Report family claims runtime verification: {identity}")
        metrics = state["metrics"]
        metric_rows = unique_rows(metrics["metrics"], "id", "metric")
        covered = set()
        for identity, row in metric_rows.items():
            require(re.fullmatch(r"[a-z][a-z0-9_]*", identity) is not None,
                    f"Invalid metric ID: {identity}")
            require(METRIC_FIELDS <= row.keys(), f"Missing metric fields: {identity}")
            require(isinstance(row["version"], int) and not isinstance(row["version"], bool)
                    and row["version"] > 0, f"Invalid metric version: {identity}")
            for field in ["question", "owner", "aggregation", "dateBasis", "unit", "drilldown", "availability"]:
                require(isinstance(row[field], str) and row[field].strip(),
                        f"Empty metric {field}: {identity}")
            require(isinstance(row["models"], list) and row["models"]
                    and len(row["models"]) == len(set(row["models"])),
                    f"Invalid model list: {identity}")
            require(set(row["models"]) <= model_ids | {"*"}, f"Unknown metric model: {identity}")
            for field in ["requiredEvidence", "exclusions", "dimensions"]:
                require(isinstance(row[field], list), f"Invalid metric {field}: {identity}")
            require(row["requiredEvidence"], f"No source evidence declared: {identity}")
            covered.update(set(row["models"]) - {"*"})
        require(covered == model_ids, "Some models have no explicit model-specific metric")
        for row in state["coverage"]["baselineProfiles"]:
            require(set(row["candidateReportFamilyIds"]) <= model_ids,
                    f"Unknown profile report family: {row['subcategoryId']}")
            for offering in row["offeringReportRoutes"]:
                for route in offering["routes"]:
                    require(route["reportFamilyId"] == route["modelId"]
                            and route["modelId"] in model_ids,
                            f"Invalid route report family: {row['subcategoryId']}")
        for row in state["coverage"]["approvedAdditions"]:
            require(row["reportFamilyId"] == row["modelId"] and row["modelId"] in model_ids,
                    f"Invalid extension report family: {row['id']}")
        require(metrics["timezone"] == state["coverage"]["timezone"] == "Africa/Nairobi",
                "Reporting timezone drift")
        require("PROPOSED" in metrics["status"]
                and "NOT_IMPLEMENTED" in state["coverage"]["status"],
                "Registry must retain proposed/not-implemented status")
        counts.update(reportFamilies=len(model_ids), metrics=len(metric_rows))
        return f"{len(metric_rows)} valid unique metric IDs; all 15 source models explicitly covered"

    run("model_and_metric_registry", model_and_metric_registry)

    def prompt_inventory():
        rows = unique_rows(state["prompts"]["images"], "id", "image prompt")
        require(set(rows) == EXPECTED_PROMPT_IDS, "Expected exactly prompt IDs INS_01 through INS_12")
        files = set()
        for identity, row in rows.items():
            file = row["file"]
            require(Path(file).name == file and file.lower().endswith(".png"),
                    f"Prompt image must be a local PNG filename: {identity}")
            require(file not in files, f"Duplicate prompt image filename: {file}")
            require(isinstance(row["prompt"], str) and row["prompt"].strip(),
                    f"Empty prompt: {identity}")
            files.add(file)
        state["promptRows"] = rows
        counts["imagePrompts"] = len(rows)
        return "12 exact, unique prompt IDs, local PNG filenames and nonempty exact prompts"

    run("image_prompt_inventory", prompt_inventory)

    def required_documents():
        missing = []
        for name in sorted(REQUIRED_DOCS):
            if name == OUTPUT.name or (PACKAGE / name).is_file():
                continue
            if args.structural_only and name in DEFERRED_DOCS:
                pending.append(f"Awaiting final generated document: {name}")
            else:
                missing.append(name)
        require(not missing, "Missing required documents: " + ", ".join(missing))
        return "Required design/source documents exist; verification.json is generated by this run"

    run("required_documents", required_documents)

    def markdown_links():
        failures = []
        local_count = 0
        pattern = re.compile(r"\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)")
        for document in sorted(PACKAGE.glob("*.md")):
            text = document.read_text(encoding="utf-8")
            text = re.sub(r"```.*?```", "", text, flags=re.S)
            for match in pattern.finditer(text):
                target = match.group(1) or match.group(2)
                resolved = resolve_local_target(document, target)
                if resolved is None:
                    continue
                local_count += 1
                if resolved == OUTPUT or resolved.exists():
                    continue
                deferred = (resolved.parent == PACKAGE
                            and (resolved.name in DEFERRED_DOCS or resolved.suffix.lower() == ".png"))
                if args.structural_only and deferred:
                    pending.append(f"Awaiting linked generated artifact: {document.name} -> {target}")
                else:
                    failures.append(f"{document.name} -> {target}")
        require(not failures, "Broken local Markdown targets: " + "; ".join(failures))
        counts["localMarkdownLinks"] = local_count
        return f"{local_count} local file/directory link targets checked; fragment IDs are not validated"

    run("local_markdown_links", markdown_links)

    manifest_path = PACKAGE / "image-manifest.json"
    if args.structural_only:
        pending.append("Final image manifest and all 12 selected PNGs require the complete verification run")
        checks.append({"id": "image_manifest_and_pngs", "status": "DEFERRED",
                       "detail": "Use the complete run after selected images and manifest are saved"})
    elif manifest_path.is_file():
        def final_images():
            manifest = read_json(manifest_path)
            rows = unique_rows(manifest["images"], "id", "manifest image")
            require(set(rows) == EXPECTED_PROMPT_IDS, "Manifest must contain exactly INS_01 through INS_12")
            require("promptRows" in state, "Prompt inventory must pass before image validation")
            files = set()
            for identity, row in sorted(rows.items()):
                prompt = state["promptRows"][identity]
                require(row["file"] == prompt["file"], f"Manifest/prompt filename mismatch: {identity}")
                path = PACKAGE / row["file"]
                require(path.is_file(), f"Selected PNG missing: {row['file']}")
                require(row["file"] not in files, f"Duplicate selected PNG: {row['file']}")
                files.add(row["file"])
                observed = inspect_png(path)
                require(row["sha256"] == observed["sha256"], f"PNG hash mismatch: {identity}")
                dimensions = row.get("dimensions", row)
                require(dimensions["width"] == observed["width"]
                        and dimensions["height"] == observed["height"],
                        f"PNG dimension mismatch: {identity}")
                image_results.append({"id": identity, **observed})
            counts["selectedPngs"] = len(image_results)
            return "12 existing PNGs match all prompts, SHA256 hashes, dimensions and every chunk CRC"
        run("image_manifest_and_pngs", final_images)
    else:
        pending.append("Image manifest not present; PNG verification has not run")
        checks.append({"id": "image_manifest_and_pngs", "status": "DEFERRED",
                       "detail": "No image-manifest.json is present"})

    # Check declared counts against independently recomputed counts.
    def declared_counts():
        declared = state["coverage"]["counts"]
        for field in ["categories", "baselineSubcategories", "approvedAdditionalRoutes",
                      "specialtiesWithAdditions", "reportFamilies", "uniqueOfferingTemplates",
                      "specialtyTemplateModelRoutes"]:
            require(field in counts and declared[field] == counts[field], f"Coverage count drift: {field}")
        expected_bindings = sum(len(row["candidateModelIds"]) for row in state["profiles"]["rows"])
        require(declared["baselineCandidateModelBindings"] == expected_bindings,
                "Baseline candidate binding count drift")
        return "All declared coverage counts match independent source comparisons"

    run("declared_coverage_counts", declared_counts)
    return write_result(args, checks, errors, pending, counts, image_results)


def write_result(args, checks, errors, pending, counts, images) -> int:
    pending = sorted(set(pending))
    complete = not errors and not pending and not args.structural_only
    status = ("STATIC_PACKAGE_CHECKS_PASSED" if complete else
              "STATIC_CHECKS_FAILED" if errors else
              "STRUCTURAL_CHECKS_PASSED_COMPLETION_PENDING")
    result = {
        "scope": "Static planning-artifact checks only",
        "status": status,
        "structuralOnly": args.structural_only,
        "completionReady": complete,
        "runtimeTestsExecuted": False,
        "runtimeValidationClaimed": False,
        "imageVisualOrInteractionValidationClaimed": False,
        "command": "python docs/merchant-portal-plan/insights-concept/verify.py"
                   + (" --structural-only" if args.structural_only else ""),
        "counts": counts,
        "checks": checks,
        "errors": errors,
        "pending": pending,
        "pngIntegrity": images,
        "limitations": [
            "No runtime reporting calculations, source ingestion, permissions or tenant isolation are tested.",
            "PNG integrity, hashes and dimensions do not establish semantic or visual correctness.",
            "Markdown checks validate local file/directory existence, not section fragment IDs.",
        ],
    }
    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(status)
    print(json.dumps(counts, sort_keys=True))
    for error in errors:
        print(f"FAIL {error['check']}: {error['message']}")
    for item in pending:
        print(f"PENDING {item}")
    return 1 if errors else 0 if (complete or args.structural_only) else 2


if __name__ == "__main__":
    sys.exit(main())
