# Reconciliation of all 128 specialty booking profiles

Date: 31 October 2026. Scope: read and compare the existing merchant onboarding taxonomy, question definitions, workflow profiles and Payload Reserve coverage. This is a design reconciliation before implementation. No application, database, merchant account or provider connection was changed.

## Source verification

The actual frontend source is `C:/Users/limta/Desktop/MERCHANT WORKSPACE/packages/contracts/src/taxonomy.ts`. A read-only TypeScript transpilation loaded its `MERCHANT_TAXONOMY` and compared every specialty to the saved audit JSON. All 21 categories and 128 IDs match. There were zero differences for name, categoryId, fields, fulfillmentHint, workflowHint, defaultWorkflow and suggestedItemCount. Source paths and SHA-256 values are recorded in [profile-decisions.json](profile-decisions.json).

The saved inventory is therefore current for the compared properties. This does not establish that every current frontend question is collected, that every proposed registry definition is implemented, or that a declared external provider is connected. Those remain separate checks.

Every coverage row was inspected, including all source fields and conditional model additions. The result is 128 explicit decisions, 65 typed replacements for the former prose-only conditional bindings, and 174 scoped correction/modifier rules. There are 61 rows whose baseline activity mapping is retained and 67 with an adjusted mapping or explicit modifier requirement. No row is marked operationally ready.

## Resolved gaps

| Gap in the prior coverage | Affected examples | Reconciled decision |
| --- | --- | --- |
| A primary workflow was copied directly into a model without an executable eligibility guard. | Clinics, battery service, skincare, fragrances, telecom services | Default model remains a suggestion. An actual offering must be selected and configured, and relevant authority resolved. Explicit no answers and the selected offering/method can suppress or replace the baseline. |
| Conditional test wording said to preserve the primary even when that primary contradicted the answer. | Clinic appointment_booking=no, mobile_service=no, products_for_sale=no | Preserve existing confirmed obligations, not an invalid active model. Clinic no disables appointment claims; no-mobile battery service selects workshop; product-only telecom selects ORDER. |
| booking_required=no was liable to remove optional scheduling. | Makeup, haircare, photography, workshops/classes/recreation | Separate acceptance of scheduled bookings from a requirement to book ahead. An explicit contradiction requires clarification before publication. |
| Model additions covered only changes of model, missing same-model resource behavior. | Rental driver option, couples spa/massage, remote therapy/coaching | Scoped modifiers define the selected resource bundle and method while retaining the proper underlying model. |
| Greeter-only work inherited transport prerequisites. | Meet & Greet | No transport means no required vehicle, drop-off or passenger/luggage capacity. Transport included requires its own compatible joint resource bundle. |
| Remote work inherited generic room or physical-location setup. | Telemedicine, mental health, coaching, personal training | Resolve actual method from source declarations and confirmed offering methods. Remote scheduling uses provider time and authorized session access without a fictitious room or delivery-zone dependency. |
| Customer drop-off inherited rider collection requirements. | Laundry, dry cleaning, ironing | Keep processing and return feasibility while omitting transport allocations for customer drop-off/collection. Pickup/delivery remains an explicitly selected alternative. |
| Recurrence was represented primarily as a membership addition. | Classes, sports, flowers, fresh produce, recurring cleaning, baby products | Add bounded recurrence behavior and per-occurrence status separately. Legacy subscription/recurrence hints do not activate a paid plan or recurring debit. Commercial entitlement requires explicit plan intent and policy. |
| Existing reservation system discovery could enable table booking. | Restaurant | Explicit table-reservation intent, actual compatible table/party policy and real authority select SPACE_RESERVATION. The existing-system answer remains discovery only. |
| Custom sourcing was treated as manufacturing. | Books | Special sourcing uses request/supplier and stock confirmation; only actual made-to-specification creation uses PRODUCTION_DUE. |
| Accepted quotes had no clear commitment boundary. | Private events, catering, travel packages and concierge | Accepted scope names the supported commitment model and actual owner. One authorized command creates the agreed child work after resource/provider confirmation; no capacity is invented from a preferred date. |
| Generic tour resources could require unnecessary assets. | Walking/cycling city or cultural tours, private/shared game drives | Resource requirements follow the selected actual mode, inclusions and supplier scope. A guide or vehicle is required only when that offering needs it. |
| All retail could inherit calendar windows from generic capability support. | All 58 ORDER baseline rows | Purchase itself creates no appointment. A separately enabled typed fulfilment window is not a paired laundry workflow and has its own capacity/authority. A false pickup_available suppresses collection. |

## Meaning of the decision records

The records retain the exact source workflow and source fields for traceability. They do not silently rewrite earlier planning fixtures. They add an explicit base policy, enablement guard, typed conditional bindings, applicability-scoped setup and same-model modifiers. Root reconciliation compiles these with the single typed question registry and bounded predicate language.

Authoring predicates use `all` and `any`, leaves with questionRef/op/value, and explicitly allowlisted context leaves. Source yes/no answers are interpreted through typed boolean normalization. Missing values remain unknown. Contradictory source and operational aliases require scoped clarification; the newest timestamp does not decide intent or authority.

The context allowlist in the JSON covers trusted selected offering, selected method and variant, setup completeness, relevant authority resolution and accepted scope. These are derived workflow facts, not arbitrary merchant-uploaded code or permission fields. A client cannot grant itself authority by supplying context values.

Every base guard also matches `context.offering_model` against the default model. This is the already published offering-schema binding, not a circular inference from the resolver. It prevents a selected makeup product from retaining an appointment primary, or a selected table reservation from retaining a food-order primary. The business may support both activities, but one selected offering resolves its own primary model.

Question predicates use the canonical `Q_FULFILLMENT_MODES` enum through the `BQ_METHODS` alias, such as `CUSTOMER_LOCATION`. Trusted UI/workflow context uses lower-case method tokens with an explicit mapping: merchant_location to MERCHANT_VENUE, customer_location to CUSTOMER_LOCATION, and digital to DIGITAL. These vocabularies must be translated explicitly rather than compared as though they were identical.

`createsWork` is false on every design binding and modifier. A positive answer may configure a capability or view. Only an actual customer/merchant selection followed by an authorized command may create a booking, allocate a resource, send a message or charge a payment.

Bindings explicitly distinguish `SELECTED_MODEL` from `LINKED_EXECUTION`. Table reservations, product purchases, trainer appointments, groups and similar variants can supply the selected offering's primary model. Installation attached to a purchase and an accepted concierge request's own-team visit resolve as selected linked offerings in their own scope. Their parent source declarations are read-only provenance, not a reason to reuse the parent's selected method or create a child automatically. Concierge linked visits additionally require accepted scope. The same business may offer many activities without executing every activity in one booking.

General setup/authority/selection guards apply to bindings and corrections. The default-model match guard applies only to the default, so a battery workshop replacement or table-reservation alternative can become eligible even when it differs from the category hint. For couples services, the resource bundle policy must specify actual simultaneous practitioner/room requirements; a generic session-place capacity question is not required merely because the package serves two people.

## Important applicability and verification details

The shared model SETUP lists are templates, not universal mandatory fields. Greeter-only does not need a vehicle route; remote therapy does not need a room; customer drop-off does not need a rider; a walking tour does not need a vehicle. Production lead time, freight quantity, storage units and session capacity are still exact operational inputs rather than marketing bands.

Public advance booking can be disabled while a dated session still admits walk-ins against the same capacity. A workshop job can enter a queue without promising a time slot. An administrative enquiry can be accepted without claiming any provider reservation. The resolved model and the permission to publish a confirmed available time are separate decisions.

Run final reconciliation checks across all 128 identities and all supported positive, negative, missing and contradictory answer paths. The previously generated 1,156 scenarios are planned scenarios, not runtime evidence, and should be updated to reflect the resolved base/conditional/modifier behavior. Add specific driver, couples, greeter-only, remote, drop-off, quote-commitment and recurrence assertions; counting only added models misses these same-model requirements.

Kenya scheduling is fixed to Africa/Nairobi. No timezone onboarding question or multi-country picker is needed. Continue to preserve UTC instants for timed commitments and local dates for date-only promises, including midnight, overnight and long intervals.

This audit resolves the model semantics and identifies the required implementation behavior. It does not select a merchant's policy values, invent its staff/asset inventory, authorize an external system, or claim Payload's transaction and integration behavior has been verified in NEXG.
