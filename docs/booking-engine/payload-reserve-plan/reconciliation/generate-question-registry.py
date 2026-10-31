"""Build the proposed reconciled question registry, without editing application code."""
import copy
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
PLAN = BASE.parent
SOURCE = PLAN.parent


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def text(maximum=2000):
    return {"type": "string", "minLength": 1, "maxLength": maximum}


def enum(*values):
    return {"type": "string", "enum": list(values)}


def integer(minimum=0, maximum=None):
    result = {"type": "integer", "minimum": minimum}
    if maximum is not None:
        result["maximum"] = maximum
    return result


def arr(items, minimum=0, maximum=10000):
    return {"type": "array", "items": items, "minItems": minimum, "maxItems": maximum}


def obj(properties, required=None):
    return {"type": "object", "properties": properties, "required": list(properties) if required is None else required, "additionalProperties": False}


REF = text(200)
DATE = {"type": "string", "format": "date"}
TIME = {"type": "string", "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"}
DAYS = enum("mon", "tue", "wed", "thu", "fri", "sat", "sun")
UNIT = enum("person", "place", "item", "job", "visit", "asset", "kg", "g", "cbm", "container", "sqm", "sqft", "pallet", "unit", "minute")
QUANTITY = obj({"quantity_minor": integer(0), "scale": integer(0, 9), "unit": UNIT})
RANGE_VALUE = obj({"value": integer(1), "unit": enum("minute", "hour", "day", "week", "month", "night")})
POLICY_REF = obj({"policy_id": REF, "version": integer(1)})
SCOPE = obj({"business_id": REF, "activity_id": REF, "offering_id": REF, "location_id": REF, "resource_id": REF, "session_id": REF, "pool_id": REF}, ["business_id"])
INTERVAL = obj({"opens": TIME, "closes": TIME, "closes_next_day": {"type": "boolean"}})
WEEKLY = arr(obj({"day": DAYS, "intervals": arr(INTERVAL, 0, 24)}), 1, 7)
EXCEPTION = obj({"date": DATE, "end_date": DATE, "closed": {"type": "boolean"}, "intervals": arr(INTERVAL, 0, 24), "reason": text(500)}, ["date", "closed", "intervals"])
WEEKLY_SCHEDULE = obj({"timezone": {"type": "string", "const": "Africa/Nairobi", "default": "Africa/Nairobi"}, "weekly": WEEKLY, "exceptions": arr(EXCEPTION, 0, 3660)})
METHODS = ["NEXG_DELIVERY", "MERCHANT_DELIVERY", "CUSTOMER_PICKUP", "CUSTOMER_DROPOFF", "MERCHANT_VENUE", "CUSTOMER_LOCATION", "DIGITAL", "PICKUP_RETURN", "PASSENGER_TRANSFER", "FREIGHT"]
CAPACITY = obj({"pool_id": REF, "capacity": QUANTITY, "authority_binding_id": REF, "effective_from": {"type": "string", "format": "date-time"}, "effective_until": {"type": "string", "format": "date-time"}}, ["pool_id", "capacity", "authority_binding_id"])
RULE_REF = obj({"rule_id": REF, "version": integer(1)})


def emit(name, value):
    (BASE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build():
    original = load(SOURCE / "question-registry.json")
    additions = load(PLAN / "question-additions.json")
    domain_registry = load(SOURCE / "domain-registry.json")
    data_class_ids = [entry["id"] for entry in domain_registry["dataClasses"]]
    assert len(data_class_ids) == len(set(data_class_ids))
    data_class_aliases = {
        "payments": {
            "outcome": "CANONICAL_ALIAS",
            "canonicalId": "finance.payment",
            "policy": "Legacy UI payments means payment collection only. It grants no ownership of refund, settlement or payout facts."
        },
        "capacity": {
            "outcome": "NEEDS_CLARIFICATION",
            "candidateCanonicalIds": ["resources", "availability", "reservations", "stock"],
            "policy": "Capacity is a grouping, not one authority leaf. Ask which qualified-resource records, schedule constraints, actual reservations or stock facts are covered and bind each selected canonical leaf explicitly. Do not automatically copy one authority to all candidates."
        },
        "finance": {
            "outcome": "NEEDS_CLARIFICATION",
            "candidateCanonicalIds": [entry for entry in data_class_ids if entry.startswith("finance.")],
            "policy": "Finance is a grouping. Payment, refund, settlement and payout have independently confirmed owners and outcomes."
        }
    }
    questions = copy.deepcopy(original["questions"])
    by_id = {q["questionId"]: q for q in questions}
    source_keys = {q["key"].lower(): q["canonicalTarget"] for q in questions}

    aliases = {
        "BQ_ACCEPTS_SCHEDULED_BOOKINGS": "BQ_BOOKING_ENABLED",
        "BQ_REQUIRES_ADVANCE_BOOKING": "Q_BOOKING_REQUIRED",
        "BQ_OPTIONAL_SERVICE_BOOKING_ENABLED": "BQ_BOOKING_ENABLED",
        "BQ_EXACT_DURATION_MINUTES": "Q_APPOINTMENT_DURATION_MINUTES",
        "BQ_RESOURCE_LIST": "Q_RESOURCE_INVENTORY",
        "BQ_RESOURCE_SCHEDULES": "Q_WEEKLY_SCHEDULE",
        "BQ_METHODS": "Q_FULFILLMENT_MODES",
        "BQ_SOURCE_RESERVATION_AUTHORITY": "Q_DATA_AUTHORITY",
    }
    targets = {
        "BQ_BOOKING_ENABLED": "booking.accepts_scheduled_bookings",
        "BQ_INTAKE_MODE": "workflow.intake_mode",
        "BQ_RANGE_POLICY": "availability.range_policy",
        "BQ_CAPACITY": "availability.capacity_policy",
        "BQ_BUFFERS": "availability.buffers",
        "BQ_BOOKING_WINDOW": "availability.booking_window",
        "BQ_TRAVEL_POLICY": "fulfillment.travel_policy",
        "BQ_GREETER_TRANSPORT_INCLUDED": "fulfillment.greeter_transport_included",
        "BQ_SCHEDULED_FULFILMENT_ENABLED": "fulfillment.scheduled_window_enabled",
        "BQ_FULFILMENT_WINDOWS": "fulfillment.window_rules",
        "BQ_RECURRING_SCHEDULE_ENABLED": "availability.recurring_schedule_enabled",
        "BQ_RECURRENCE_RULE": "availability.recurrence_rule",
        "BQ_MEMBERSHIP_PLAN_ENABLED": "commerce.membership_plan_enabled",
        "BQ_ENTITLEMENT_POLICY": "commerce.entitlement_policy",
        "BQ_OFFERS_TABLE_RESERVATIONS": "booking.offers_table_reservations",
        "BQ_SPACE_POLICY": "availability.space_policy",
        "BQ_CUSTOM_ORDER_KIND": "workflow.custom_order_kind",
        "BQ_PRODUCTION_POLICY": "workflow.production_policy",
        "BQ_PICKUP_RETURN_POLICY": "fulfillment.pickup_return_policy",
        "BQ_SUPPLIER_POLICY": "integration.supplier_policy",
        "BQ_PAYMENT_POLICY": "commerce.booking_payment_policy_ref",
        "BQ_CHANGE_POLICY": "workflow.change_policy_ref",
        "BQ_GOOGLE_CONNECTION": "integration.google_connection_preference",
    }
    schemas = {
        "BQ_BOOKING_ENABLED": {"type": "boolean"},
        "BQ_INTAKE_MODE": enum("instant_after_requirements", "merchant_approval", "request_quote", "walk_in_only"),
        "BQ_RANGE_POLICY": obj({"minimum": RANGE_VALUE, "maximum": RANGE_VALUE, "calendar_basis": enum("elapsed", "local_calendar"), "billing_policy_ref": POLICY_REF}),
        "BQ_CAPACITY": CAPACITY,
        "BQ_BUFFERS": obj({"before_minutes": integer(), "after_minutes": integer(), "turnaround_minutes": integer()}),
        "BQ_BOOKING_WINDOW": obj({"minimum_lead_minutes": integer(), "maximum_horizon_days": integer(1, 3650), "same_day_cutoff": {"anyOf": [TIME, {"type": "null"}]}}),
        "BQ_TRAVEL_POLICY": obj({"service_area_question_id": {"const": "Q_SERVICE_AREA"}, "mode": enum("fixed_allowance", "approved_route_matrix"), "travel_before_minutes": integer(), "travel_after_minutes": integer(), "route_matrix_ref": REF}, ["service_area_question_id", "mode", "travel_before_minutes", "travel_after_minutes"]),
        "BQ_GREETER_TRANSPORT_INCLUDED": {"type": "boolean"},
        "BQ_SCHEDULED_FULFILMENT_ENABLED": {"type": "boolean"},
        "BQ_FULFILMENT_WINDOWS": obj({"method": enum("NEXG_DELIVERY", "MERCHANT_DELIVERY", "CUSTOMER_PICKUP", "CUSTOMER_DROPOFF"), "rules": arr(obj({"rule_id": REF, "day": DAYS, "interval": INTERVAL, "capacity_policy_ref": RULE_REF, "cutoff_lead_minutes": integer()}), 1, 1000)}),
        "BQ_RECURRING_SCHEDULE_ENABLED": {"type": "boolean"},
        "BQ_RECURRENCE_RULE": obj({"frequency": enum("daily", "weekly", "monthly"), "interval": integer(1, 365), "weekdays": arr(DAYS, 0, 7), "start_date": DATE, "end_date": DATE, "count": integer(1, 1000), "exception_dates": arr(DATE, 0, 1000)}, ["frequency", "interval", "start_date", "exception_dates"]),
        "BQ_MEMBERSHIP_PLAN_ENABLED": {"type": "boolean"},
        "BQ_ENTITLEMENT_POLICY": obj({"plan_id": REF, "version": integer(1), "scope_offering_ids": arr(REF, 1), "validity": {"oneOf": [obj({"mode": {"const": "absolute_dates"}, "starts": DATE, "ends": DATE}), obj({"mode": {"const": "relative_to_activation"}, "duration": obj({"value": integer(1), "unit": enum("day", "week", "month")})})]}, "credits": arr(obj({"credit_id": REF, "quantity": QUANTITY, "offering_ids": arr(REF, 1)})), "usage_policy_ref": POLICY_REF, "renewal": enum("none", "manual", "separately_authorized")}),
        "BQ_OFFERS_TABLE_RESERVATIONS": {"type": "boolean"},
        "BQ_SPACE_POLICY": obj({"spaces": arr(obj({"resource_id": REF, "minimum_party_size": integer(1), "maximum_party_size": integer(1), "active": {"type": "boolean"}}), 1), "combinations": arr(obj({"combination_id": REF, "resource_ids": arr(REF, 2), "minimum_party_size": integer(1), "maximum_party_size": integer(1)})), "turnover_minutes": integer()}),
        "BQ_CUSTOM_ORDER_KIND": enum("made_to_specification", "special_sourcing", "standard_product"),
        "BQ_PRODUCTION_POLICY": obj({"capacity_pool_id": REF, "capacity_unit": UNIT, "preparation_lead_minutes": integer(), "cutoff_local_time": TIME, "working_days": arr(DAYS, 1, 7), "approval_mode": enum("required", "not_required_for_fixed_specification"), "change_policy_ref": POLICY_REF}),
        "BQ_PICKUP_RETURN_POLICY": obj({"collection_rule_ref": RULE_REF, "return_rule_ref": RULE_REF, "minimum_processing_minutes": integer(), "maximum_processing_minutes": integer(), "processing_capacity_ref": RULE_REF, "calendar_basis": enum("elapsed", "business_calendar"), "collection_mode": enum("NEXG_COLLECTION", "MERCHANT_COLLECTION", "CUSTOMER_DROPOFF", "PARTNER_COLLECTION"), "return_mode": enum("NEXG_RETURN", "MERCHANT_RETURN", "CUSTOMER_COLLECTION", "PARTNER_RETURN")}),
        "BQ_SUPPLIER_POLICY": obj({"components": arr(obj({"component_id": REF, "description": text(), "owner_reference": REF, "authority_binding_id": REF, "confirmation_required": {"type": "boolean"}, "confirmation_evidence_kind": enum("provider_api", "authorized_manual_reference")}), 1), "commitment_rule": enum("all_required_confirmed", "explicit_partial_scope_acceptance")}),
        "BQ_PAYMENT_POLICY": POLICY_REF,
        "BQ_CHANGE_POLICY": POLICY_REF,
        "BQ_GOOGLE_CONNECTION": obj({"mode": enum("not_connected", "create_secondary_business_calendar", "select_existing_business_calendar"), "selected_business_calendar_id": REF, "use_busy_calendar_ids": arr(REF, 0, 50)}, ["mode"]),
    }
    semantic = {
        "BQ_RANGE_POLICY": ["Validate minimum <= maximum using declared calendar basis; a month/night is not silently converted to minutes.", "Reject offering bounds above the approved platform ceiling; billing period does not decide occupancy."],
        "BQ_CAPACITY": ["Require positive capacity for active bookable pools, exact unit and precision, and a verified resource authority.", "Never map area/volume/weight to guestCount or silently convert units."],
        "BQ_BOOKING_WINDOW": ["Validate lead time against horizon and local cutoff; zero lead is valid and distinct from missing."],
        "BQ_TRAVEL_POLICY": ["Resolve Q_SERVICE_AREA in the same offering/location scope; do not capture another copy of coverage.", "approved_route_matrix requires a current scoped route_matrix_ref; unknown travel remains unresolved."],
        "BQ_FULFILMENT_WINDOWS": ["Only configured enabled methods may be selected; bind capacity and owner per window.", "Validate overnight intervals and cutoff meaning in Africa/Nairobi."],
        "BQ_RECURRENCE_RULE": ["Require exactly one of end_date or count; validate recurrence expansion within bounded horizon.", "Each occurrence has independent status and does not authorize membership or payment renewal."],
        "BQ_ENTITLEMENT_POLICY": ["Validate local validity order, exact credit units, eligible offerings and server-controlled consumption.", "Separately authorized renewal requires actual finance/provider consent; plan alone occupies no appointment capacity."],
        "BQ_SPACE_POLICY": ["Validate all resources belong to the business/location, all min<=max bounds, nonduplicated combinations and joint allocation.", "Existing reservation-system discovery and total seated capacity cannot enable table booking."],
        "BQ_PRODUCTION_POLICY": ["Validate actual production rather than sourcing; due dates require feasible capacity, exact lead time and accepted specification.", "Resolve change policy under the permitted policy owner."],
        "BQ_PICKUP_RETURN_POLICY": ["Validate minimum<=maximum and jointly feasible collection, processing and return.", "Customer dropoff/collection cannot instantiate an invented transport task."],
        "BQ_SUPPLIER_POLICY": ["Resolve real provider ownership and supported confirmation path; inclusion text is not allocation evidence."],
        "BQ_PAYMENT_POLICY": ["Resolve immutable approved payment policy; display and confirmation depend on real payment owner capability, not a form preference."],
        "BQ_CHANGE_POLICY": ["Resolve immutable approved cancellation/reschedule policy; retain accepted booking version."],
        "BQ_GOOGLE_CONNECTION": ["Selection is a preference only; OAuth/capability validation is independent.", "select_existing_business_calendar requires a selected ID; create mode obtains it after authorization.", "Busy calendars are opt-in; no secrets or personal event details in questionnaire answers."],
    }

    # A normalized value has one canonical target. Raw spellings stay provenance.
    path_map = {
        "resolved.resource_selection_mode": "availability.resource_selection_mode",
        "resolved.deposit_mode": "commerce.deposit_mode",
        "resolved.pricing_mode": "catalog.offering_pricing.mode",
        "resolved.fulfillment_modes": "fulfillment.enabled_modes",
    }

    def normalize_predicate(value):
        if isinstance(value, list):
            return [normalize_predicate(v) for v in value]
        if not isinstance(value, dict):
            return value
        result = {k: normalize_predicate(v) for k, v in value.items()}
        path = result.get("path")
        if path:
            if path.startswith(("answers.", "operationalAnswers.")):
                key = path.split(".", 1)[1].lower()
                if key in source_keys:
                    result["sourcePath"] = path
                    result["path"] = source_keys[key]
            elif path in path_map:
                result["sourcePath"] = path
                result["path"] = path_map[path]
        return result

    for q in questions:
        q["sourceQuestionId"] = q["questionId"]
        q["captureScope"] = "business/activity/offering/location/resource as applicable; never a global shared answer for unrelated offerings"
        q["captureMode"] = "APPLICABLE_SCOPED_INPUT"
        for field in ["visibleWhen", "requiredWhen"]:
            if field in q:
                q[field] = normalize_predicate(q[field])
        if q.get("valueSchema", {}).get("type") == "boolean":
            q.setdefault("normalization", {})["booleanMapping"] = {"yes": True, "no": False}
            q["normalization"]["alreadyTyped"] = "Preserve true/false. Unsupported strings remain unmapped, never truthy coercion."

    by_id["Q_LOCATION_TIMEZONE"].update({
        "captureMode": "PLATFORM_CONSTANT", "askMerchant": False,
        "valueSchema": {"type": "string", "const": "Africa/Nairobi", "default": "Africa/Nairobi"},
        "visibleWhen": {"path": "platform.timezone_input_enabled", "op": "eq", "value": True},
        "requiredWhen": {"path": "platform.timezone_input_enabled", "op": "eq", "value": True},
        "normalization": {"policy": "Inject Africa/Nairobi for Kenya configuration. Preserve conflicting legacy source/time interpretation and require explicit migration; never silently reinterpret accepted work."}
    })
    by_id["Q_WEEKLY_SCHEDULE"]["valueSchema"] = copy.deepcopy(WEEKLY_SCHEDULE)
    by_id["Q_WEEKLY_SCHEDULE"]["captureScope"] = "business/location/resource schedule, with explicit inheritance and overrides"
    by_id["Q_WEEKLY_SCHEDULE"]["semanticValidators"] = ["At most one weekly record per weekday; intervals must be nonoverlapping and correctly cross local midnight.", "Exception dates/ranges and closed intervals must be consistent; timezone is platform-injected, not merchant-editable."]
    by_id["Q_LOCATION_RECORDS"]["valueSchema"]["items"]["properties"]["timezone"] = {"type": "string", "const": "Africa/Nairobi", "default": "Africa/Nairobi"}
    by_id["Q_RESOURCE_INVENTORY"]["valueSchema"] = arr(obj({
        "resource_id": REF, "kind": enum("staff", "asset", "vehicle", "room", "space", "equipment", "capacity_pool"),
        "location_id": REF, "capacity": QUANTITY, "role_refs": arr(REF), "active": {"type": "boolean"},
        "authority_binding_id": REF
    }, ["resource_id", "kind", "location_id", "capacity", "active", "authority_binding_id"]), 1)
    by_id["Q_RESOURCE_INVENTORY"]["semanticValidators"] = ["Validate resource references/ownership and source authority; a submitted resource ID is not authorization.", "Legacy integer capacity plus explicit capacity_unit can normalize at scale zero. Missing unit, owner or meaning requires clarification, not a fabricated value.", "resource_list aliases use the same full descriptor editor; bare references resolve through the scoped resource owner before validation."]
    authority_schema = arr(obj({
        "data_class": enum(*data_class_ids),
        "authority": enum("NEXG_AUTHORITATIVE", "EXTERNAL_AUTHORITATIVE", "SHARED_WITH_RULES", "READ_ONLY_EXTERNAL"),
        "owner_reference": REF, "scope": SCOPE, "shared_rule_reference": {"anyOf": [REF, {"type": "null"}]}
    }, ["data_class", "authority", "owner_reference", "scope"]), 1)
    by_id["Q_DATA_AUTHORITY"]["valueSchema"] = authority_schema
    by_id["Q_DATA_AUTHORITY"]["dataClassRegistrySource"] = "../../domain-registry.json#/dataClasses"
    by_id["Q_DATA_AUTHORITY"]["dataClassInputAliases"] = copy.deepcopy(data_class_aliases)
    by_id["Q_DATA_AUTHORITY"]["normalization"]["dataClassPolicy"] = "Normalize only declared exact aliases before schema validation. Canonical data_class must be a domain-registry leaf. Broad capacity/finance groupings require scoped clarification and cannot silently create multiple authority bindings."
    by_id["Q_DATA_AUTHORITY"]["visibleWhen"] = {"path": "resolved.candidate_data_classes", "op": "nonempty", "value": True}
    by_id["Q_DATA_AUTHORITY"]["requiredWhen"] = copy.deepcopy(by_id["Q_DATA_AUTHORITY"]["visibleWhen"])
    by_id["Q_DATA_AUTHORITY"]["semanticValidators"] = ["Exactly one authority binding per active business/location/resource/data-class scope, including native-owned classes.", "SHARED_WITH_RULES requires registered field/command ownership and conflict rule; connected preference cannot grant external access.", "BQ source scalar enum is discovery only until data class, owner and trusted scope are supplied; no lossless scalar-to-binding conversion exists without that context."]
    by_id["Q_DATA_AUTHORITY"]["semanticValidators"].append("Use canonical domain-registry leaves for candidate and active data classes. payments normalizes only to finance.payment; capacity or finance groupings must be clarified into explicit selected leaves without widening ownership.")
    by_id["Q_BOOKING_REQUIRED"]["downstreamEffects"][0]["effect"] = "Declare whether advance booking is mandatory. False does not disable optional appointments or independently enable walk-ins. Ask whether scheduled bookings are accepted and the allowed intake mode separately; capacity and authority govern execution."
    by_id["Q_BOOKING_REQUIRED"]["dependencies"] = ["BQ_BOOKING_ENABLED", "BQ_INTAKE_MODE"]
    by_id["Q_BOOKING_REQUIRED"]["semanticValidators"] = ["Advance booking required with scheduled bookings explicitly disabled is a conflict requiring clarification."]
    by_id["Q_RESERVATION_SYSTEM"]["classification"] = "integration_discovery"
    by_id["Q_RESERVATION_SYSTEM"]["downstreamEffects"][0]["effect"] = "Discover an existing reservation system only; do not enable table booking or require an existing system for native bookings. Explicit table-offering intent, inventory, policy and authority decide activation."
    by_id["Q_CUSTOM_ORDERS"]["dependencies"] = ["BQ_CUSTOM_ORDER_KIND"]
    for qid, suffix in [("Q_MIN_ORDER", "min_order"), ("Q_MIN_BASKET", "min_basket")]:
        q = by_id[qid]
        q["originalCanonicalTarget"] = q["canonicalTarget"]
        q["canonicalTarget"] = "commerce.minimum_order_declarations." + suffix
        q.setdefault("semanticValidators", []).append("Keep distinct scoped source declarations. If min_order and min_basket disagree, preserve both and clarify; only Q_MINIMUM_ORDER_AMOUNT supplies the confirmed operational monetary minimum.")
        for effect in q.get("downstreamEffects", []):
            effect["target"] = q["canonicalTarget"]
    for qid in ["Q_RECURRING_SESSIONS", "Q_RECURRING_SUB", "Q_SUBSCRIPTION_BOUQUETS", "Q_SUBSCRIPTION_BOXES", "Q_SUBSCRIPTION_AVAILABLE", "Q_SUBSCRIPTION_PLANS"]:
        if qid in by_id:
            by_id[qid]["semanticValidators"] = ["This declaration may reveal recurrence/fulfilment setup; it never automatically enables commercial membership, renewals or a recurring debit."]
            for effect in by_id[qid]["downstreamEffects"]:
                effect["effect"] = "Reveal applicable recurring schedule/order questions. Membership/retainer and payment renewal require separate explicit policy, scope and consent. Keep actual reservations/occurrences separate."

    # Preserve old question identities as compatibility views of compound fields.
    projections = [
        ("Q_BOOKING_LEAD_TIME_MINUTES", "BQ_BOOKING_WINDOW", "availability.booking_window.minimum_lead_minutes", "minimum_lead_minutes", "A lead value fills only that component; horizon/cutoff remain unresolved. Zero is valid."),
        ("Q_MINIMUM_RENTAL_DURATION", "BQ_RANGE_POLICY", "availability.range_policy.minimum", "minimum", "Legacy minimum value/unit fills only minimum; calendar basis, maximum and billing policy require explicit setup."),
        ("Q_CAPACITY_LIMIT", "BQ_CAPACITY", "availability.capacity_policy.capacity", "capacity", "Person-only integer normalizes to quantity_minor=N, scale=0, unit=person in an explicit pool/occurrence context. It cannot fill area/volume/weight."),
    ]
    for qid, owner_id, target, subfield, note in projections:
        q = by_id[qid]
        q["originalCanonicalTarget"] = q["canonicalTarget"]
        q["canonicalTarget"] = target
        q["captureMode"] = "COMPONENT_ALIAS"
        q["canonicalOwnerQuestionId"] = owner_id
        q["componentPath"] = subfield
        q["normalization"]["reconciliation"] = note
        q["askSeparately"] = False
        if qid == "Q_CAPACITY_LIMIT":
            q["sourceValueSchema"] = copy.deepcopy(q["valueSchema"])
            q["valueSchema"] = obj({"quantity_minor": integer(1), "scale": {"const": 0}, "unit": {"const": "person"}})
    old_confirmation = by_id["Q_BOOKING_CONFIRMATION_MODE"]
    old_confirmation["captureMode"] = "LEGACY_COMPOSITE_INPUT"
    old_confirmation["askSeparately"] = False
    old_confirmation["supersededBy"] = ["BQ_INTAKE_MODE", "Q_DATA_AUTHORITY"]
    old_confirmation["normalization"]["reconciliation"] = "instant_authority_confirmed maps to intake instant_after_requirements; merchant_accepts maps to merchant_approval. external_system_confirms identifies external ownership only and leaves intake unresolved. Never infer source authority or approval from a single mixed token."

    addition_by_id = {q["id"]: q for q in additions["questions"]}
    bridge = []
    for source_q in additions["questions"]:
        sid = source_q["id"]
        target_id = aliases.get(sid, sid)
        if target_id not in by_id:
            q = {
                "questionId": target_id, "key": source_q["key"], "origin": "RECONCILED_BOOKING_OPERATIONAL_SETUP",
                "status": "PROPOSED_TYPED_DEFINITION", "label": source_q["prompt"],
                "canonicalTarget": targets[target_id], "valueSchema": copy.deepcopy(schemas[target_id]),
                "captureMode": "APPLICABLE_SCOPED_INPUT", "captureScope": source_q["scope"],
                "applicability": {"bookingModelIds": source_q["appliesTo"]},
                "visibleWhen": {"path": "resolved.candidate_booking_models", "op": "intersects", "value": source_q["appliesTo"]},
                "requiredWhen": {"path": "resolved.required_booking_question_ids", "op": "contains", "value": target_id},
                "dependencies": [], "semanticValidators": semantic.get(target_id, []),
                "normalization": {"policy": "Validate typed input after source/context normalization. Preserve original value and scope; missing remains unknown. No truthy coercion, invented policy or source authorization."},
                "downstreamEffects": [{"kind": "CONFIGURATION_INPUT", "target": targets[target_id], "effect": source_q["effect"]}],
                "activationGate": "Definition/value configures a scoped request; exact setup, policy, authority, permissions and supported commands are separate runtime gates."
            }
            questions.append(q)
            by_id[target_id] = q
        q = by_id[target_id]
        q.setdefault("acceptedInputAliases", []).append({"questionId": sid, "path": "bookingSetup." + source_q["key"]})
        if sid != target_id:
            q.setdefault("applicability", {}).setdefault("bookingModelIds", [])
            q["applicability"]["bookingModelIds"] = sorted(set(q["applicability"]["bookingModelIds"] + source_q["appliesTo"]))
        mode = "CANONICAL_NEW_DEFINITION" if sid == target_id else "EXACT_SEMANTIC_ALIAS"
        if sid in {"BQ_RESOURCE_LIST", "BQ_RESOURCE_SCHEDULES", "BQ_SOURCE_RESERVATION_AUTHORITY"}:
            mode = "SCOPED_EDITOR_ALIAS_WITH_VALIDATED_PROJECTION"
        notes = {
            "BQ_RESOURCE_LIST": "Use the strengthened resource descriptor schema. Bare resource IDs resolve through the authorized owner; original integer capacity requires explicit unit before normalization.",
            "BQ_RESOURCE_SCHEDULES": "Capture weekly intervals once per resource/location scope with platform-injected Africa/Nairobi. The original single global schedule may serve as an explicit inherited template, never overwrite every resource silently.",
            "BQ_SOURCE_RESERVATION_AUTHORITY": "Use structured per-data-class bindings, not an unscoped scalar enum. Scalar preference remains incomplete until trusted business/data-class/owner scope is provided.",
            "BQ_METHODS": "Use the Q_FULFILLMENT_MODES enum; map declared UI labels explicitly to these tokens, never arbitrary strings.",
            "BQ_EXACT_DURATION_MINUTES": "Exact minutes populate the existing duration fact; broader legacy bands remain context, not midpoint conversions.",
            "BQ_ACCEPTS_SCHEDULED_BOOKINGS": "Same offering-scoped fact as booking_enabled; render one question and use its shared answer.",
            "BQ_OPTIONAL_SERVICE_BOOKING_ENABLED": "Same booking-enabled fact scoped to the optional service offering. Link selection is a later command, never another copied boolean.",
            "BQ_REQUIRES_ADVANCE_BOOKING": "Reuse the advance-booking-required fact; false leaves optional appointments and walk-ins independently configured."
        }
        bridge.append({
            "sourceQuestionId": sid, "sourceKey": source_q["key"], "inputPath": "bookingSetup." + source_q["key"],
            "targetQuestionId": target_id, "canonicalTarget": q["canonicalTarget"], "mode": mode,
            "scope": source_q["scope"], "inputSchema": copy.deepcopy(q["valueSchema"]),
            "normalization": notes.get(sid, "Capture against the explicit typed schema in the declared scope; preserve raw input provenance."),
            "conflictPolicy": "If old and new aliases in the same scope disagree, retain both raw sources and require clarification. Never last-write-wins or silently overwrite."
        })

    # Reused editors must also be reachable from the booking models that bind
    # them. The required-question selector applies model/method/scope details.
    bound_targets = {b["targetQuestionId"] for b in bridge}
    for target_id in bound_targets:
        q = by_id[target_id]
        applicable = q.get("applicability", {}).get("bookingModelIds", [])
        if applicable:
            model_clause = {"path": "resolved.candidate_booking_models", "op": "intersects", "value": applicable}
            old_visible = q.get("visibleWhen")
            if q.get("origin") == "RECONCILED_BOOKING_OPERATIONAL_SETUP":
                q["visibleWhen"] = model_clause
            else:
                q["visibleWhen"] = {"any": [old_visible, model_clause]} if old_visible else model_clause
            selected_requirement = {"path": "resolved.required_booking_question_ids", "op": "contains", "value": target_id}
            if target_id == "Q_DATA_AUTHORITY":
                q["requiredWhen"] = {"any": [q["requiredWhen"], selected_requirement]}
            else:
                q["requiredWhen"] = selected_requirement
        q.setdefault("semanticValidators", []).append("Resolve alias identity and applicable scope before capture. An alias does not create another authoritative answer or a second prompt for the same fact.")

    # Update old aliases after compound owners changed targets, then normalize
    # all authoring predicates against final canonical paths.
    final_key_targets = {q["key"].lower(): q["canonicalTarget"] for q in questions}
    for q in questions:
        def fix_old_target(value):
            if isinstance(value, list):
                return [fix_old_target(v) for v in value]
            if not isinstance(value, dict):
                return value
            result = {k: fix_old_target(v) for k, v in value.items()}
            src_path = result.get("sourcePath", "")
            if src_path.startswith(("answers.", "operationalAnswers.")):
                key = src_path.split(".", 1)[1].lower()
                if key in final_key_targets:
                    result["path"] = final_key_targets[key]
            return result
        for field in ["visibleWhen", "requiredWhen"]:
            if field in q:
                q[field] = fix_old_target(q[field])

    # Each alias compiles to one canonical target; add no BQ duplicate owners.
    check_ids = [q["questionId"] for q in questions]
    assert len(check_ids) == len(set(check_ids))
    assert set(by_id) >= {q["questionId"] for q in original["questions"]}
    assert len(bridge) == len(additions["questions"]) == 31
    assert all(b["targetQuestionId"] in by_id for b in bridge)
    new_count = len(questions) - len(original["questions"])
    bridge_doc = {
        "schemaVersion": "1.0.0-reconciled-planning", "date": "2026-10-31", "status": "PLANNED_NOT_IMPLEMENTED",
        "source": "../question-additions.json", "registry": "effective-question-registry.json",
        "counts": {"sourceBQQuestions": len(bridge), "reusedBQAliases": len(aliases), "newCanonicalDefinitions": new_count},
        "inputNamespacePolicy": "answers.<legacy key>, operationalAnswers.<UPPERCASE key> and bookingSetup.<booking key> are raw provenance spellings only. Resolve question identity and explicit business/activity/offering/location/resource/session/pool scope, normalize, validate and store one canonical fact. Never evaluate raw namespace strings as a second predicate language.",
        "aliases": bridge,
        "dataClassRegistrySource": "../../domain-registry.json#/dataClasses",
        "canonicalDataClasses": data_class_ids,
        "dataClassInputAliases": data_class_aliases,
        "componentBridges": [{"sourceQuestionId": qid, "targetQuestionId": owner, "canonicalTarget": target, "componentPath": field, "rule": note} for qid, owner, target, field, note in projections],
        "compositeLegacyBridge": {"sourceQuestionId": "Q_BOOKING_CONFIRMATION_MODE", "targetQuestionIds": ["BQ_INTAKE_MODE", "Q_DATA_AUTHORITY"], "policy": old_confirmation["normalization"]["reconciliation"]},
        "compatibilityRules": [
            "BQ_BUFFERS is not an alias for Q_PREPARATION_MINUTES: production preparation workload is not necessarily occupied resource buffer.",
            "BQ_TRAVEL_POLICY reuses Q_SERVICE_AREA through a reference and adds travel rules; capture coverage only once.",
            "BQ_RANGE_POLICY retains Q_MINIMUM_RENTAL_DURATION as a minimum component, with separate maximum/calendar basis/billing policy.",
            "BQ_BOOKING_WINDOW retains exact lead as a component and adds horizon/cutoff; do not ask both component and compound editor for the same scope.",
            "BQ_CAPACITY is typed pool/occurrence capacity, while Q_CAPACITY_LIMIT is a person-only component compatibility view; no generalized unit conversion is implied.",
            "BQ_PAYMENT_POLICY is an approved policy reference, not a second deposit amount. Existing price/deposit/amount answers can draft policy inputs, with finance-owner validation before publication."
        ]
    }
    registry = {
        "schemaVersion": "1.0.0-reconciled-planning", "date": "2026-10-31", "status": "PLANNED_NOT_IMPLEMENTED",
        "sourceRegistry": "../../question-registry.json", "bookingSource": "../question-additions.json",
        "scope": "Effective design registry for onboarding/Payload reconciliation. Preserve source question IDs; resolve raw aliases into one typed scoped fact. No application behavior is implemented by this file.",
        "counts": {"sourceDefinitions": len(original["questions"]), "preservedSourceIds": len(original["questions"]), "sourceBQQuestions": 31, "reusedBQAliases": len(aliases), "newDefinitions": new_count, "totalDefinitions": len(questions)},
        "platformDefaults": {"country": "KE", "timezone": "Africa/Nairobi", "timezone_input_enabled": False, "nativeCurrency": "KES"},
        "scopeContract": {"required": ["business_id", "question_id"], "context": ["activity_id", "offering_id", "location_id", "resource_id", "session_id", "pool_id"], "policy": "Question applicability declares required context. Resolve explicit offering/resource values over an explicitly inherited template; preserve both and preview impact. Conflicting explicit answers at identical scope require clarification. Historical bookings retain accepted revision."},
        "derivedSelectors": {"resolved.candidate_booking_models": "Registered model candidates from selected category/activity and the actual offering, before booking enablement, exact setup, readiness or permission checks. This makes enablement questions visible without requiring their own answers.", "resolved.active_booking_models": "Configured enabled models after candidate questions are answered. Never use this selector to ask the questions required to reach activation.", "resolved.required_booking_question_ids": "Applicable exact facts selected from candidate models and known offering/method answers in dependency order, after alias de-duplication. Requiredness is calculated before operational readiness; missing answers produce clarification, not invisibility. Do not require unrelated resource/duration setup after booking is explicitly disabled.", "resolved.candidate_data_classes": "Canonical leaf IDs from domain-registry.dataClasses relevant to the selected activity/offering before readiness. Ownership questions appear even for native operation or incomplete booking setup. Broad UI capacity/finance groups require clarification; never emit them as candidate leaf IDs.", "resolved.active_data_classes": "Canonical leaf IDs from domain-registry.dataClasses after setup, not the visibility gate for required ownership questions.", "resolved.capabilities": "Registered configured/requested capability context before operational readiness, not permissions or started work; do not define this visibility selector as ready-only.", "resolved.required_evidence": "Required evidence from owning policy, not the merchant's unverified declaration."},
        "predicatePolicy": "Use the existing bounded all/any/path/op/value AST on canonical normalized facts and explicitly defined derived selectors. sourcePath is provenance metadata only. Missing remains unknown, including neq.",
        "conflictPolicy": "Do not silently choose between competing alias values, differently scoped facts, authority owners or incompatible types. Preserve provenance and request scoped clarification.",
        "questions": questions,
        "aliases": bridge,
        "dataClassRegistrySource": "../../domain-registry.json#/dataClasses",
        "canonicalDataClasses": data_class_ids,
        "dataClassInputAliases": data_class_aliases,
        "componentBridges": bridge_doc["componentBridges"]
    }
    emit("question-bridge.json", bridge_doc)
    emit("effective-question-registry.json", registry)
    audit = f"""# Question reconciliation audit

Date: 31 October 2026. Status: proposed effective design, not implemented.

Read the original 300 typed definitions, all 31 booking question additions, all 128 profile rule contexts and the answer-effect contract. The effective registry preserves all 300 original question IDs and adds {new_count} canonical definitions. Eight of the 31 BQ inputs are aliases, so there are {len(questions)} effective definitions rather than 331 independent answers. [Structured bridge](question-bridge.json) is exhaustive for the 31 BQ input IDs; [effective registry](effective-question-registry.json) supplies definitions and canonical paths.

## Resolved conflicts

- Raw `answers.<key>`, `operationalAnswers.<UPPERCASE key>` and `bookingSetup.<key>` are input provenance, not independent answer stores or condition languages. The implementation binds ID and scope before normalizing to one fact.
- Q_SYSTEM_CONNECTION_METHODS and Q_DATA_AUTHORITY no longer depend on the undefined `answers.existing_systems` alias. System discovery reads `integration.system_discovery`; authority is required for all applicable active data classes, including native bookings.
- Q_DATA_AUTHORITY uses all canonical leaves loaded from domain-registry.json. Legacy `payments` means only `finance.payment`; broad `capacity` and `finance` require clarification into explicit leaf bindings and never silently widen authority. Candidate data-class selectors contain canonical leaves only.
- Resource selection reads its defined canonical fact, and weekly/resource setup remains scoped. A business template is not an invisible overwrite of every offering's resource schedule.
- Q_LOCATION_TIMEZONE is a hidden platform constant. Weekly schedules and location records receive fixed `Africa/Nairobi`; no merchant timezone question or arbitrary tenant override is introduced.
- Q_BOOKING_REQUIRED declares whether advance booking is mandatory. False does not remove optional appointments or create walk-ins. BQ_BOOKING_ENABLED, BQ_ACCEPTS_SCHEDULED_BOOKINGS and BQ_OPTIONAL_SERVICE_BOOKING_ENABLED capture one fact at the appropriate actual offering scope.
- Q_RESERVATION_SYSTEM remains existing-system discovery only. Explicit BQ_OFFERS_TABLE_RESERVATIONS and actual inventory/policy/authority determine table-booking enablement.
- Recurring sessions, deliveries and subscriptions do not automatically activate memberships, renewal consent or recurring debits. Explicit commercial plan intent and policy are separate.
- Q_CUSTOM_ORDERS requires creation-versus-sourcing clarification. Special sourcing is not production capacity.
- Q_MIN_ORDER and Q_MIN_BASKET retain distinct scoped declaration paths. Conflicting declarations require clarification; Q_MINIMUM_ORDER_AMOUNT remains the exact operational monetary fact.
- Typed composite range/window/buffer/capacity questions retain exact legacy component mappings without inventing missing maximums, horizons, units or travel rules.
- The Q_BOOKING_CONFIRMATION_MODE token mixed approval and source ownership. Its legacy input has an explicit migration: external confirmation establishes neither the merchant approval policy nor a working connector.
- All new conceptual BQ type names are replaced with structured JSON value schemas plus named semantic validation requirements. Resource capacity is an exact scaled typed quantity; person-only capacity is not freight/storage capacity.
- Original equipment coverage keeps the existing all/some/none correction. Legacy yes is ambiguous and requires clarification; equipment inclusion alone does not prove resource inventory.

## Exact input aliases

| Input ID | Canonical owning question | Treatment |
| --- | --- | --- |
"""
    for b in bridge:
        audit += f"| `{b['sourceQuestionId']}` | `{b['targetQuestionId']}` | {b['mode'].lower().replace('_',' ')} |\n"
    audit += """
## Scope and implementation requirements

One answer identity includes business and applicable activity/offering/location/resource/session/pool context. A single raw merchant key cannot safely overwrite unrelated offerings that share a field name. Source legacy scalar drafts normalize into their known scope, retain the source revision and prompt for missing context; multi-activity behavior cannot be manufactured from a category label.

Semantic validators remain implementation requirements, not implemented checks. They must resolve actual authorized resource and policy references, verify date/range ordering, units, capacity and source ownership, and enforce canonical conflicts on every command path. JSON shape validity alone does not establish permission or availability. Read-only provider data stays read-only.

The original files are preserved as source evidence. The root reconciliation package must designate this effective registry and the effective workflow/profile records as the only current build inputs, so earlier proposed defaults cannot win by file-load order. Re-run the generator after source changes and record validation of all bindings and namespaces.
"""
    (BASE / "question-audit.md").write_text(audit, encoding="utf-8")
    print(json.dumps(registry["counts"]))


if __name__ == "__main__":
    build()
