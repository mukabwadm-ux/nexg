"""Check the eight restaurant concept artifacts, without a runtime claim.

Use --structural-only while images are being generated. A complete run checks
all selected images, their saved prompts, manifest and gallery. Only the local
verification.json is written. PNG integrity cannot establish visible text or
interaction correctness; those require the separate visual review.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys
from urllib.parse import unquote, urlsplit
import zlib


HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "verification.json"
TABS = ["Overview", "Orders", "Menu", "Customers", "Operations", "Promotions", "Finance", "Reports"]
SCENES = {f"RST_{number:02}": tab for number, tab in enumerate(TABS, 1)}
SIDEBAR = ["Home", "Work", "Offerings", "Availability", "Business", "Money", "Promotions", "Insights", "Settings"]


class Failure(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Failure(message)


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def keyed(rows, key, label):
    require(isinstance(rows, list), f"{label} must be a list")
    result = {}
    for row in rows:
        require(isinstance(row, dict) and key in row, f"Invalid {label} row")
        value = row[key]
        require(value not in result, f"Duplicate {label}: {value}")
        result[value] = row
    return result


def png(path):
    data = path.read_bytes()
    require(data[:8] == b"\x89PNG\r\n\x1a\n", f"Invalid PNG signature: {path.name}")
    offset, chunks, idats = 8, 0, 0
    width = height = None
    ended = False
    while offset < len(data):
        require(offset + 12 <= len(data), f"Truncated PNG chunk: {path.name}")
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        end = offset + length + 12
        require(end <= len(data), f"Truncated PNG payload: {path.name}")
        payload = data[offset + 8:offset + 8 + length]
        crc = struct.unpack(">I", data[end - 4:end])[0]
        require((zlib.crc32(kind + payload) & 0xFFFFFFFF) == crc,
                f"PNG CRC mismatch: {path.name}/{kind!r}")
        require(re.fullmatch(rb"[A-Za-z]{4}", kind), f"Invalid PNG chunk type: {path.name}")
        if chunks == 0:
            require(kind == b"IHDR" and length == 13, f"Invalid PNG IHDR: {path.name}")
            width, height = struct.unpack(">II", payload[:8])
            require(width > 0 and height > 0, f"Invalid PNG dimensions: {path.name}")
        else:
            require(kind != b"IHDR", f"Duplicate PNG IHDR: {path.name}")
        idats += kind == b"IDAT"
        chunks += 1
        offset = end
        if kind == b"IEND":
            require(length == 0 and end == len(data), f"Invalid PNG ending: {path.name}")
            ended = True
            break
    require(ended and idats, f"PNG missing image data or ending: {path.name}")
    return {"file": path.name, "width": width, "height": height, "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "chunkCount": chunks, "allChunkCrcsValid": True}


def local_target(document, target):
    if not target or target.startswith("#"):
        return None
    if not re.match(r"^[A-Za-z]:[/\\]", target) and urlsplit(target).scheme:
        return None
    target = unquote(target.split("#", 1)[0].split("?", 1)[0])
    target = re.sub(r":\d+$", "", target)
    if not target:
        return None
    path = Path(target)
    return path.resolve() if path.is_absolute() else (document.parent / path).resolve()


def prompt_date_range_matches(prompt, scope):
    """Compare the complete filter date, tolerating only range-dash encoding.

    The escaped sequences cover a UTF-8 range dash decoded as Windows-1252
    or Latin-1. This does not discard numbers, month, year or filter context.
    """
    normalized = prompt
    for sequence in ["\u00e2\u20ac\u201c", "\u00e2\u20ac\u201d",
                     "\u00e2\u0080\u0093", "\u00e2\u0080\u0094"]:
        normalized = normalized.replace(sequence, "-")
    for character in "\u2010\u2011\u2012\u2013\u2014\u2212":
        normalized = normalized.replace(character, "-")
    start = date.fromisoformat(scope["periodStart"])
    end = date.fromisoformat(scope["periodEndInclusive"])
    require(start.year == end.year and start.month == end.month,
            "Shared short-range prompt format requires one month/year")
    months = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    expected = rf"Filter row:\s*{start.day}\s*-\s*{end.day}\s+{months[start.month - 1]}\s+{start.year}\s*;"
    return re.search(expected, normalized) is not None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--structural-only", action="store_true")
    args = parser.parse_args()
    checks, errors, pending, images = [], [], [], []
    counts, state = {}, {}

    def run(name, action):
        try:
            detail = action()
            checks.append({"id": name, "status": "PASS", "detail": detail})
        except (Failure, OSError, ValueError, KeyError, TypeError, AttributeError, IndexError) as error:
            errors.append({"check": name, "message": str(error)})
            checks.append({"id": name, "status": "FAIL", "detail": str(error)})

    def fixture_scope():
        fixture = load(HERE / "fixture.json")
        state["fixture"] = fixture
        require(fixture["status"] == "FICTIONAL_REVIEW_FIXTURE"
                and fixture["runtimeVerified"] is False, "Fixture must be fictional and unverified at runtime")
        merchant = fixture["merchant"]
        require((merchant["name"], merchant["location"], merchant["city"], merchant["avatar"], merchant["enabledModel"])
                == ("Karibu Kitchen", "Karen branch", "Nairobi", "KK", "ORDER"), "Shared merchant/header scope changed")
        require(merchant["fulfilmentMethods"] == ["Dine-in", "Pickup", "Delivery"], "Unexpected fulfilment methods")
        scope = fixture["scope"]
        require(scope["periodStart"] == "2026-10-04" and scope["periodEndInclusive"] == "2026-10-31"
                and scope["timezone"] == "Africa/Nairobi" and scope["comparison"] == "Off"
                and scope["currency"] == "KES" and scope["asOf"] == "2026-11-01 08:00 EAT", "Shared date/currency/comparison scope changed")
        require((date.fromisoformat(scope["periodEndInclusive"]) - date.fromisoformat(scope["periodStart"])).days + 1 == 28,
                "Expected 28 completed local days")
        navigation = fixture["navigation"]
        require(navigation["peerTabs"] == TABS and navigation["sidebar"] == SIDEBAR
                and navigation["selectedSidebar"] == "Insights", "Exact eight peers or shared sidebar changed")
        require(navigation["reportsSecondary"] == ["Library", "Saved views", "Exports"], "Reports secondary navigation changed")
        counts["exactPeerTabs"] = len(TABS)
        state["fixtureSha256"] = sha256(HERE / "fixture.json")
        return "Exact eight peer tabs; Karibu Kitchen/Karen; 4–31 October 2026; EAT/KES; comparison Off; Insights selected"

    run("shared_fixture_scope_and_navigation", fixture_scope)
    if "fixture" not in state:
        return finish(args, checks, errors, pending, counts, images, state)

    def valid_fixture_numbers():
        def visit(value, path="fixture"):
            if isinstance(value, dict):
                for key, child in value.items():
                    visit(child, path + "." + key)
            elif isinstance(value, list):
                for index, child in enumerate(value):
                    visit(child, path + f"[{index}]")
            elif isinstance(value, (int, float)) and not isinstance(value, bool):
                require(math.isfinite(value) and value >= 0, f"Invalid fixture quantity: {path}")
                if path.lower().endswith("percent"):
                    require(value <= 100, f"Invalid fixture percentage: {path}")
        visit(state["fixture"])
        return "All declared numeric fixture quantities are finite and nonnegative; percentage fields are bounded"

    run("valid_synthetic_quantity_domains", valid_fixture_numbers)

    def orders_and_menu():
        fixture = state["fixture"]
        orders, menu = fixture["orders"], fixture["menu"]
        require(orders["requests"] == orders["completed"] + orders["cancelled"] + orders["open"],
                "Request outcomes do not reconcile")
        require(sum(orders["weeklyCompleted"]) == orders["completed"], "Weekly completion totals differ")
        require(sum(orders["weeklyUnits"]) == orders["fulfilledItemUnits"], "Weekly unit totals differ")
        require(sum(orders["weeklyItemSales"]) == orders["itemSalesBeforeRefundsKES"], "Weekly item amount totals differ")
        require(len(orders["weeklyCompleted"]) == len(orders["weeklyUnits"]) == len(orders["weeklyItemSales"]) == 4,
                "Expected four weekly reporting groups")
        require(sum(orders["completedByFulfilment"].values()) == orders["completed"], "Fulfilment totals differ")
        require(set(orders["completedByFulfilment"]) == set(fixture["merchant"]["fulfilmentMethods"]), "Fulfilment scope differs")
        require(orders["itemSalesBeforeRefundsKES"] / orders["completed"]
                == orders["averageItemSalesPerCompletedOrderKES"], "Average item amount does not reconcile")
        require(menu["itemCount"] == len(menu["items"]) == 8, "Expected eight actual menu items")
        require(len({item["name"] for item in menu["items"]}) == 8, "Duplicate menu item names")
        require(sum(item["units"] for item in menu["items"]) == orders["fulfilledItemUnits"], "Menu unit totals differ")
        require(sum(item["itemSalesKES"] for item in menu["items"]) == orders["itemSalesBeforeRefundsKES"], "Menu amount totals differ")
        recent = keyed(orders["recentSubset"], "ref", "recent order")
        require(len(recent) == 5 and all(row["outcome"] in {"Completed", "Cancelled", "Open"} for row in recent.values()),
                "Recent order preview must be a labelled valid subset")
        require("Excludes delivery/service fees and tips" in menu["itemSalesDefinition"], "Item amount definition loses exclusions")
        counts.update(requests=orders["requests"], completedOrders=orders["completed"], menuItems=8,
                      fulfilledItemUnits=orders["fulfilledItemUnits"])
        return "Request outcomes, all four weekly series, fulfilment counts, menu quantities/amounts and average amount reconcile"

    run("orders_menu_and_weekly_arithmetic", orders_and_menu)

    def customers():
        fixture = state["fixture"]
        data = fixture["customers"]
        require(data["firstTimeCustomers"] + data["returningCustomers"] == data["identifiedCustomers"], "Identity cohorts do not reconcile")
        require(round(data["returningCustomers"] / data["identifiedCustomers"] * 100, 1)
                == data["returningSharePercent"], "Returning share does not reconcile")
        require(data["completedOrdersFromFirstTimeCohort"] + data["completedOrdersFromReturningCohort"]
                == fixture["orders"]["completed"], "Customer order cohorts do not reconcile")
        require(data["completedOrdersFromFirstTimeCohort"] >= data["firstTimeCustomers"]
                and data["completedOrdersFromReturningCohort"] >= data["returningCustomers"], "Completed-order identity cohort impossible")
        require("completed order" in data["dateBasis"].lower()
                and "pre-period history" in data["identityPolicy"].lower(), "Identity basis/history missing")
        require(len(keyed(data["rows"], "id", "synthetic customer preview")) == 5, "Customer preview must be five distinct synthetic IDs")
        counts["identifiedCustomerIds"] = data["identifiedCustomers"]
        return "840 synthetic merchant-scoped identities, 600/240 cohorts, 28.6% returning share and 1,176 completed-order contributions reconcile"

    run("customer_identity_and_order_cohorts", customers)

    def operations():
        fixture = state["fixture"]
        data = fixture["operations"]
        require(data["readyOnTime"] + data["readyLate"] == data["readyEligible"], "Eligible ready outcomes differ")
        require(data["readyEligible"] + data["missingReadyPromise"] == fixture["orders"]["completed"], "Promise coverage does not reconcile to completed cohort")
        require(round(data["readyOnTime"] / data["readyEligible"] * 100) == data["readyOnTimePercent"], "Ready-on-time rounded percentage differs")
        rows = keyed(data["byFulfilment"], "method", "ready timing method")
        require(set(rows) == set(fixture["merchant"]["fulfilmentMethods"]), "Ready timing fulfilment scope differs")
        for method, row in rows.items():
            require(row["onTime"] + row["late"] == row["eligible"], f"Method outcomes differ: {method}")
            require(row["eligible"] + row["missingPromise"] == fixture["orders"]["completedByFulfilment"][method],
                    f"Method promise coverage differs: {method}")
        for row_field, total_field in [("eligible", "readyEligible"), ("onTime", "readyOnTime"),
                                       ("late", "readyLate"), ("missingPromise", "missingReadyPromise")]:
            require(sum(row[row_field] for row in rows.values()) == data[total_field], f"Timing total differs: {total_field}")
        require(sum(data["cancellationReasons"].values()) == data["cancelledBeforePreparation"]
                == fixture["orders"]["cancelled"], "Cancellation reason totals differ")
        require("Unknown" in data["cancellationReasons"], "Unknown cancellation reasons removed")
        require(data["preparationSample"] == fixture["orders"]["completed"]
                and data["preparationMedianMinutes"] > 0
                and "kitchen-start" in data["preparationDefinition"]
                and "actual ready" in data["preparationDefinition"], "Preparation sample or paired-event definition missing")
        return "1,098 on time + 70 late = 1,168 eligible; eight missing promises and method breakdowns reconcile. Median is a declared fixture value, not recomputed without raw timestamps"

    run("operations_promises_and_exclusions", operations)

    def promotion_and_finance():
        fixture = state["fixture"]
        promotion, finance = fixture["promotion"], fixture["finance"]
        require(promotion["qualifiedTaps"] / promotion["qualifiedImpressions"] * 100
                == promotion["tapImpressionEventRatioPercent"], "Tap/impression event ratio differs")
        require(promotion["attributedAcceptedOrders"] / promotion["qualifiedTaps"] * 100
                == promotion["ordersPerTapEventRatioPercent"], "Order/tap event ratio differs")
        require(promotion["attributedAcceptedOrders"] <= fixture["orders"]["requests"], "Attributed accepted count exceeds request cohort")
        require(promotion["attributionWindowMinutes"] == 30
                and promotion["attributedValue"] == "Unavailable" and promotion["causalLift"] == "Not inferred", "Attribution boundaries changed")
        end = datetime.fromisoformat(fixture["scope"]["periodEndInclusive"] + " 23:59:59")
        cutoff = datetime.strptime(promotion["observationCutoff"], "%Y-%m-%d %H:%M EAT")
        require(cutoff >= end + timedelta(minutes=promotion["attributionWindowMinutes"]), "Tap observation window is not closed")
        require(finance["postedMerchantCreditsKES"] - finance["refundDebitsKES"] - finance["recordedFeeDebitsKES"]
                == finance["netPostedCreditKES"], "Posted credit/debit arithmetic differs")
        require(finance["postedMerchantCreditsKES"] == fixture["orders"]["itemSalesBeforeRefundsKES"], "Synthetic constructed gross alignment differs")
        require(finance["payouts"] == "Excluded" and finance["profit"] == "Not represented"
                and finance["feePolicy"] == "No tariff established", "Finance fixture implies payout/profit/tariff")
        counts["netPostedCreditKES"] = finance["netPostedCreditKES"]
        return "5%/6% event ratios, 30-minute closed attribution and unavailable value preserved; KES 1,099,560 net posted credit reconciles without a fee-policy or payout claim"

    run("promotion_and_financial_arithmetic", promotion_and_finance)

    def reports():
        fixture = state["fixture"]
        data = fixture["reports"]
        rows = keyed(data["rows"], "id", "restaurant report")
        require(data["libraryCount"] == len(rows) == 8 and data["savedViewCount"] == 2, "Report library/saved-view fixture counts differ")
        require(data["selectedReport"] in rows and data["selectedReport"] == "RPT_ORDER_OUTCOMES", "Selected report differs")
        require(data["reportPreview"] == {field: fixture["orders"][field] for field in ["requests", "completed", "cancelled", "open"]},
                "Report preview differs from shared order cohort")
        catalogue = load(HERE.parent / "reports-catalogue-proposal.json")
        require(set(rows) <= set(keyed(catalogue["reports"], "id", "proposal report")), "Unknown restaurant report ID")
        require(data["exportHistoryState"] == "No exports yet", "Fixture invents a completed export")
        counts["restaurantReportIds"] = len(rows)
        return "Eight existing draft report IDs, selected order report and exact cohort preview agree; no generated export is claimed"

    run("reports_reuse_and_preview", reports)

    prompt_path = HERE / "image-prompts.json"
    if prompt_path.is_file():
        def prompts():
            data = load(prompt_path)
            rows = keyed(data["images"], "id", "restaurant image prompt")
            require(set(rows) == set(SCENES), "Expected exactly RST_01 through RST_08")
            files = set()
            for identity, row in rows.items():
                require(row["tab"] == SCENES[identity], f"Prompt selected tab differs: {identity}")
                require(Path(row["file"]).name == row["file"] and row["file"].lower().endswith(".png"), f"Invalid local PNG filename: {identity}")
                require(row["file"] not in files, f"Duplicate prompt PNG filename: {identity}")
                require(isinstance(row["prompt"], str) and row["prompt"].strip(), f"Empty prompt: {identity}")
                files.add(row["file"])
            state["promptRows"] = rows
            state["promptData"] = data
            counts["imagePrompts"] = len(rows)
            return "Eight exact prompt IDs, selected peer tabs, nonempty prompts and unique local PNG filenames"
        run("exact_eight_image_prompts", prompts)

        def prompt_fixture_alignment():
            require("promptRows" in state, "Prompt inventory must pass first")
            fixture = state["fixture"]
            orders = fixture["orders"]
            customers = fixture["customers"]
            operations = fixture["operations"]
            promotion = fixture["promotion"]
            finance = fixture["finance"]
            required_numbers = {
                "RST_01": [orders["completed"], orders["itemSalesBeforeRefundsKES"],
                           orders["averageItemSalesPerCompletedOrderKES"], operations["readyOnTimePercent"],
                           operations["readyOnTime"], operations["readyEligible"],
                           *orders["weeklyCompleted"], *orders["completedByFulfilment"].values(),
                           operations["missingReadyPromise"]],
                "RST_02": [orders["requests"], orders["completed"], orders["cancelled"], orders["open"],
                           *orders["weeklyCompleted"]],
                "RST_03": [orders["fulfilledItemUnits"], fixture["menu"]["itemCount"],
                           orders["itemSalesBeforeRefundsKES"],
                           *[number for item in fixture["menu"]["items"] for number in [item["units"], item["itemSalesKES"]]]],
                "RST_04": [customers["identifiedCustomers"], customers["firstTimeCustomers"],
                           customers["returningCustomers"], customers["returningSharePercent"],
                           customers["completedOrdersFromFirstTimeCohort"], customers["completedOrdersFromReturningCohort"]],
                "RST_05": [operations["readyEligible"], operations["readyOnTime"], operations["readyLate"],
                           operations["missingReadyPromise"], operations["readyOnTimePercent"],
                           operations["preparationMedianMinutes"], operations["preparationSample"],
                           operations["cancelledBeforePreparation"],
                           *[number for row in operations["byFulfilment"]
                             for key, number in row.items() if key != "method"]],
                "RST_06": [promotion["qualifiedImpressions"], promotion["qualifiedTaps"],
                           promotion["tapImpressionEventRatioPercent"], promotion["attributedAcceptedOrders"],
                           promotion["ordersPerTapEventRatioPercent"], promotion["attributionWindowMinutes"]],
                "RST_07": [finance["postedMerchantCreditsKES"], finance["refundDebitsKES"],
                           finance["recordedFeeDebitsKES"], finance["netPostedCreditKES"]],
                "RST_08": [orders["requests"], orders["completed"], orders["cancelled"], orders["open"],
                           fixture["reports"]["libraryCount"], fixture["reports"]["savedViewCount"]],
            }
            peer_sentence = "Exact peer tabs in order: " + ", ".join(TABS) + "."
            sidebar_sentence = "Exact sidebar order: " + ", ".join(SIDEBAR) + "."
            prefixes = set()
            for identity, row in state["promptRows"].items():
                prompt, content = row["prompt"], row["content"]
                require(prompt.endswith(content) and content.startswith(row["tab"] + " selected."),
                        f"Selected-tab content or saved full prompt differs: {identity}")
                prefixes.add(prompt[:-len(content)])
                require(prompt_date_range_matches(prompt, fixture["scope"]),
                        f"Shared filter date range differs from exact fixture dates: {identity}")
                for token in ["Karibu Kitchen", "Karen branch", "avatar KK",
                              "Compare: off", "Activity: Menu orders", "Africa/Nairobi",
                              "Updated 1 Nov, 08:00 EAT", "Sample preview", peer_sentence, sidebar_sentence]:
                    require(token in prompt, f"Shared scope directive missing: {identity}/{token}")
                for number in set(required_numbers[identity]):
                    tokens = {str(number), format(number, ",")}
                    pattern = r"(?<![\d.])(?:" + "|".join(re.escape(token) for token in sorted(tokens)) + r")(?!\d|\.\d)"
                    require(re.search(pattern, content),
                            f"Fixture number absent from saved scene content: {identity}/{number}")
            require(len(prefixes) == 1, "The eight saved prompts do not share one exact shell/header directive")
            for item in fixture["menu"]["items"]:
                require(item["name"] in state["promptRows"]["RST_03"]["content"],
                        f"Menu item missing from complete Menu scene: {item['name']}")
            require("Attributed accepted orders" in state["promptRows"]["RST_06"]["content"]
                    and "Attributed value:Unavailable" in state["promptRows"]["RST_06"]["content"],
                    "Promotion scene changes attributed outcome/value meaning")
            require("NO four-KPI strip" in state["promptRows"]["RST_08"]["content"],
                    "Reports scene must remain a report library")
            counts["promptsWithIdenticalSharedShell"] = len(prefixes) * len(state["promptRows"])
            state["promptSha256"] = sha256(prompt_path)
            return "Eight saved prompts share one exact header/sidebar/filter/tab directive; selected-tab content contains the relevant fixture values. Rendered pixels still require visual inspection"

        run("saved_prompt_scope_and_fixture_alignment", prompt_fixture_alignment)
    elif args.structural_only:
        pending.append("image-prompts.json has not been saved yet")
    else:
        errors.append({"check": "exact_eight_image_prompts", "message": "Missing image-prompts.json"})

    manifest_path = HERE / "image-manifest.json"
    if args.structural_only:
        pending.append("Complete manifest, all eight selected PNGs and gallery require a full final verification run")
    elif manifest_path.is_file():
        def manifest_images():
            data = load(manifest_path)
            rows = keyed(data["images"], "id", "selected restaurant PNG")
            require(set(rows) == set(SCENES), "Manifest must contain exactly eight RST scene IDs")
            require("promptRows" in state, "Prompt inventory must pass first")
            dimensions = set()
            for identity, row in sorted(rows.items()):
                expected = state["promptRows"][identity]
                require(row["tab"] == SCENES[identity] and row["file"] == expected["file"], f"Manifest/prompt/tab mismatch: {identity}")
                result = png(HERE / row["file"])
                require(row["sha256"] == result["sha256"] and row["width"] == result["width"]
                        and row["height"] == result["height"] and row["bytes"] == result["bytes"], f"PNG metadata/hash mismatch: {identity}")
                source = Path(row["source"])
                if source.is_file():
                    require(sha256(source) == result["sha256"], f"Workspace PNG differs from selected generation source: {identity}")
                    result["generationSourceHashMatched"] = True
                else:
                    result["generationSourceHashMatched"] = False
                if "runtimeVerified" in row:
                    require(row["runtimeVerified"] is False, f"Image metadata claims runtime: {identity}")
                dimensions.add((result["width"], result["height"]))
                images.append({"id": identity, "tab": row["tab"], **result})
            require(len(dimensions) == 1, "Shared-shell screenshots must use one consistent canvas size")
            counts["selectedPngs"] = len(images)
            state["selectedFiles"] = {row["file"] for row in rows.values()}
            return "Eight PNG signatures, all chunk CRCs, SHA256 hashes, dimensions, byte counts, prompts and tabs agree; shared canvas dimensions are consistent"
        run("selected_pngs_manifest_and_provenance", manifest_images)
    else:
        errors.append({"check": "selected_pngs_manifest_and_provenance", "message": "Missing image-manifest.json"})

    def documents():
        gallery = HERE / "images.md"
        if not args.structural_only:
            require(gallery.is_file(), "Missing images.md gallery")
        links = 0
        gallery_images = set()
        pattern = re.compile(r"\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)")
        for document in sorted(HERE.glob("*.md")):
            text = re.sub(r"```.*?```", "", document.read_text(encoding="utf-8"), flags=re.S)
            for match in pattern.finditer(text):
                target = match.group(1) or match.group(2)
                resolved = local_target(document, target)
                if resolved is None:
                    continue
                links += 1
                if args.structural_only and not resolved.exists() and resolved.suffix.lower() == ".png":
                    pending.append(f"Gallery-linked PNG not yet saved: {resolved.name}")
                else:
                    require(resolved == OUTPUT or resolved.exists(), f"Broken local document link: {document.name} -> {target}")
                if document == gallery and resolved.parent == HERE and resolved.suffix.lower() == ".png":
                    gallery_images.add(resolved.name)
        if not args.structural_only:
            require("selectedFiles" in state and gallery_images == state["selectedFiles"], "Gallery must link all eight selected PNGs and no obsolete selection")
        counts["localDocumentLinks"] = links
        return f"{links} local document targets checked; gallery selection matches saved images in the complete run"

    run("gallery_and_local_document_links", documents)
    return finish(args, checks, errors, pending, counts, images, state)


def finish(args, checks, errors, pending, counts, images, state):
    complete = not errors and not pending and not args.structural_only
    status = "STATIC_RESTAURANT_PACKAGE_CHECKS_PASSED" if complete else "STATIC_CHECKS_FAILED" if errors else "STRUCTURAL_CHECKS_PASSED_IMAGES_PENDING"
    result = {
        "scope": "Static artifact and synthetic arithmetic checks for eight restaurant Insights screens",
        "status": status,
        "complete": complete,
        "structuralOnly": args.structural_only,
        "runtimeTestsExecuted": False,
        "runtimeValidationClaimed": False,
        "pixelTextOrInteractionValidationClaimed": False,
        "command": "python docs/merchant-portal-plan/insights-concept/navigation-v2-proposal/restaurant-eight-screens/verify.py"
                   + (" --structural-only" if args.structural_only else ""),
        "fixtureSha256": state.get("fixtureSha256"),
        "promptSha256": state.get("promptSha256"),
        "counts": counts,
        "checks": checks,
        "errors": errors,
        "pending": sorted(set(pending)),
        "pngIntegrity": images,
        "limitations": [
            "PNG integrity and saved prompt scope do not establish that rendered labels, layout, header or selected states are correct; inspect the actual images separately.",
            "Synthetic arithmetic does not validate live source ingestion, reporting calculations, permissions, financial ownership or interaction behavior.",
            "The preparation median is a declared fixture aggregate; raw paired event timestamps are not included for recomputation.",
            "Local links are checked for file/directory existence; section fragment IDs are not checked.",
        ],
    }
    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(status)
    print(json.dumps(counts, sort_keys=True))
    for error in errors:
        print(f"FAIL {error['check']}: {error['message']}")
    for item in result["pending"]:
        print(f"PENDING {item}")
    return 1 if errors else 0 if (complete or args.structural_only) else 2


if __name__ == "__main__":
    sys.exit(main())
