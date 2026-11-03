# Question reconciliation audit

Date: 31 October 2026. Status: proposed effective design, not implemented.

Read the original 300 typed definitions, all 31 booking question additions, all 128 profile rule contexts and the answer-effect contract. The effective registry preserves all 300 original question IDs and adds 23 canonical definitions. Eight of the 31 BQ inputs are aliases, so there are 323 effective definitions rather than 331 independent answers. [Structured bridge](question-bridge.json) is exhaustive for the 31 BQ input IDs; [effective registry](effective-question-registry.json) supplies definitions and canonical paths.

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
| `BQ_BOOKING_ENABLED` | `BQ_BOOKING_ENABLED` | canonical new definition |
| `BQ_ACCEPTS_SCHEDULED_BOOKINGS` | `BQ_BOOKING_ENABLED` | exact semantic alias |
| `BQ_REQUIRES_ADVANCE_BOOKING` | `Q_BOOKING_REQUIRED` | exact semantic alias |
| `BQ_OPTIONAL_SERVICE_BOOKING_ENABLED` | `BQ_BOOKING_ENABLED` | exact semantic alias |
| `BQ_INTAKE_MODE` | `BQ_INTAKE_MODE` | canonical new definition |
| `BQ_EXACT_DURATION_MINUTES` | `Q_APPOINTMENT_DURATION_MINUTES` | exact semantic alias |
| `BQ_RANGE_POLICY` | `BQ_RANGE_POLICY` | canonical new definition |
| `BQ_RESOURCE_LIST` | `Q_RESOURCE_INVENTORY` | scoped editor alias with validated projection |
| `BQ_RESOURCE_SCHEDULES` | `Q_WEEKLY_SCHEDULE` | scoped editor alias with validated projection |
| `BQ_CAPACITY` | `BQ_CAPACITY` | canonical new definition |
| `BQ_BUFFERS` | `BQ_BUFFERS` | canonical new definition |
| `BQ_BOOKING_WINDOW` | `BQ_BOOKING_WINDOW` | canonical new definition |
| `BQ_METHODS` | `Q_FULFILLMENT_MODES` | exact semantic alias |
| `BQ_TRAVEL_POLICY` | `BQ_TRAVEL_POLICY` | canonical new definition |
| `BQ_GREETER_TRANSPORT_INCLUDED` | `BQ_GREETER_TRANSPORT_INCLUDED` | canonical new definition |
| `BQ_SCHEDULED_FULFILMENT_ENABLED` | `BQ_SCHEDULED_FULFILMENT_ENABLED` | canonical new definition |
| `BQ_FULFILMENT_WINDOWS` | `BQ_FULFILMENT_WINDOWS` | canonical new definition |
| `BQ_RECURRING_SCHEDULE_ENABLED` | `BQ_RECURRING_SCHEDULE_ENABLED` | canonical new definition |
| `BQ_RECURRENCE_RULE` | `BQ_RECURRENCE_RULE` | canonical new definition |
| `BQ_MEMBERSHIP_PLAN_ENABLED` | `BQ_MEMBERSHIP_PLAN_ENABLED` | canonical new definition |
| `BQ_ENTITLEMENT_POLICY` | `BQ_ENTITLEMENT_POLICY` | canonical new definition |
| `BQ_OFFERS_TABLE_RESERVATIONS` | `BQ_OFFERS_TABLE_RESERVATIONS` | canonical new definition |
| `BQ_SPACE_POLICY` | `BQ_SPACE_POLICY` | canonical new definition |
| `BQ_CUSTOM_ORDER_KIND` | `BQ_CUSTOM_ORDER_KIND` | canonical new definition |
| `BQ_PRODUCTION_POLICY` | `BQ_PRODUCTION_POLICY` | canonical new definition |
| `BQ_PICKUP_RETURN_POLICY` | `BQ_PICKUP_RETURN_POLICY` | canonical new definition |
| `BQ_SUPPLIER_POLICY` | `BQ_SUPPLIER_POLICY` | canonical new definition |
| `BQ_SOURCE_RESERVATION_AUTHORITY` | `Q_DATA_AUTHORITY` | scoped editor alias with validated projection |
| `BQ_PAYMENT_POLICY` | `BQ_PAYMENT_POLICY` | canonical new definition |
| `BQ_CHANGE_POLICY` | `BQ_CHANGE_POLICY` | canonical new definition |
| `BQ_GOOGLE_CONNECTION` | `BQ_GOOGLE_CONNECTION` | canonical new definition |

## Scope and implementation requirements

One answer identity includes business and applicable activity/offering/location/resource/session/pool context. A single raw merchant key cannot safely overwrite unrelated offerings that share a field name. Source legacy scalar drafts normalize into their known scope, retain the source revision and prompt for missing context; multi-activity behavior cannot be manufactured from a category label.

Semantic validators remain implementation requirements, not implemented checks. They must resolve actual authorized resource and policy references, verify date/range ordering, units, capacity and source ownership, and enforce canonical conflicts on every command path. JSON shape validity alone does not establish permission or availability. Read-only provider data stays read-only.

The original files are preserved as source evidence. The root reconciliation package must designate this effective registry and the effective workflow/profile records as the only current build inputs, so earlier proposed defaults cannot win by file-load order. Re-run the generator after source changes and record validation of all bindings and namespaces.
