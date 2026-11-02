# Business frontend adaptation

31 October 2026. Implementation proposal for the next screen, based on the existing SC_BUSINESS specification and shared booking configuration. No Business implementation or live backend connection is claimed by this document. Current scope is frontend only in the existing merchant workspace.

## Outcome

One Business screen uses the existing Home shell and the established list/detail panel styling. Its content follows the merchant's scoped configuration: activities, actual selected offerings, methods, places, people, source ownership, applicable requirements and permissions. A category suggests possible setup; it does not enable services or prove operational readiness.

All 128 existing specialties must be covered explicitly. Business must also accept future registered category definitions that use supported fields and capabilities. It must not contain 128 individually coded pages or a universal restaurant checklist.

## Foundation and current gap

The existing [Business specification](../screens/04-business.md) defines the feature scope. The shared runtime in `packages/booking-config` supplies 128 profile identities, typed question definitions, rule resolution and selected-offering workflow bindings. Business must reuse those question IDs, values and predicates. Business identity, membership, document review and location publication require their own frontend contracts; the booking resolver does not own those domains.

The missing implementation work is the explicit Business field/section map: where an answer is maintained, its allowed scope, source owner, permission, draft/review behavior, and effects on other screen configurations. Broad registry scope descriptions are not sufficient grounds to make a field globally editable. Each implemented field needs a concrete binding.

Existing reusable registry shapes include `Q_LOCATION_RECORDS` (physical, service_base, digital_operation, fixed Africa/Nairobi and per-location capabilities), `Q_SERVICE_LOCATION_MODE` (merchant venue, customer location, digital or mixed), `Q_SERVICE_AREA` (zones, polygon, radius in km or route list), `Q_FULFILLMENT_MODES` (10 configured methods) and `Q_VERIFICATION_EVIDENCE` (approved requirement ID and evidence reference, optional expiry). Venue, pickup point, warehouse and depot are presentation/role mappings of supported place records; do not introduce new location enum values silently. Declared specialist claims remain separate from verified evidence.

## Stable sections, adaptive content

| Section | Shared behavior | What changes with configuration |
| --- | --- | --- |
| Profile | Trading identity, description, permitted public contacts, media and discovery preview | Relevant public attributes/declared claims, public versus private place/contact information, sensitive/protected fields and review state |
| Activities and setup | Configured activities and their current status, applicable question groups, missing setup and change preview | Products/services/rentals/etc.; available fulfilment methods; actual enabled workflows; resources required for an activity; native/external/mixed source summary |
| Locations and coverage | Location list, scoped activity assignment, address/contact editor and explicit inheritance | Venue, pickup point, depot, service area or remote channel; pickup/drop-off arrangements; optional multiple locations; publication prerequisites |
| Team | Member list, role and location scope; clear preview of proposed changes | Actual provider/dispatch/resource links and qualifications where supported. Membership is separate from resource eligibility |
| Documents | Applicable requirements, reason, version, expiry and review state; replacement journey | Requirements supplied by the approved requirement owner for the actual activity/location. Category labels and declarations never manufacture legal obligations or verification |
| Customer feedback | Supported feedback list and permitted response/report action | Applicable source, permissions and real published feedback. No invented ratings or unsupported reply action |

Use independent status labels for business approval, setup validity, location publication, accepting work, source freshness and document review. Never flatten these into one green "ready" badge.

## Configuration contract

The frontend input needs business ID and configuration revision; public/protected profile facts; an array of activity IDs and subcategory IDs; scoped answer records; selected offering references and resolved bindings; enabled fulfilment methods; typed location/service-area/channel records; member/location/resource relationships; permissions; per-fact source ownership/freshness; and owner-supplied requirement/status records.

Arrays of activities are essential: a salon that sells products and performs home visits is one business with separate activity/offering scopes. A business-wide default is inherited only by fields declared inheritable. Location and offering overrides remain explicit; changing a default must not overwrite their values.

The view resolver should be a pure function of configuration, actual readiness facts, registry and viewer scope. Its output describes sections, field groups, vocabulary, inherited/read-only fields, missing setup, permitted actions, source states and change impacts. Candidate models, capability requests and completed setup remain separate values. Reuse the shared predicate/resolver semantics; do not build a second interpretation of onboarding rules.

## Answer-to-screen journey

1. Load confirmed configuration and owner-supplied facts through a typed source boundary; preserve IDs, scope, provenance and revisions.
2. Render the current state. Missing values are unknown, not false or zero. External ownership and role scope control editability.
3. Edit a local draft using the same canonical question IDs and schemas as onboarding. Retain inactive values safely without letting them continue enabling a removed capability.
4. Recompute applicable fields, requirements, vocabulary and missing setup. Selecting a candidate activity does not create offerings, bookings, stock, staff or source connections.
5. Show a before/after impact preview: proposed activities/methods/places, affected future offerings and work, required setup and protected changes needing owner review.
6. Validate and submit through the source boundary. Keep confirmed facts visible until the owner confirms the revision; distinguish local draft, pending review, confirmed and failure/conflict.
7. Expose the confirmed revision as input to the other frontend screens. Preserve existing work's accepted configuration/terms. This phase defines the event/contract; it does not rebuild other screens or implement backend propagation.

Removing a location or activity with existing obligations must show the impact and supported resolution state. It must not erase active rentals, hide returns or cancel confirmed appointments implicitly.

## Representative differences to verify

| Configured example | Business shows | Important guard |
| --- | --- | --- |
| Grocery with customer pickup | Store/pickup location, products, pickup responsibility and actual inventory source | No cooking/provider/driver fields merely because the profile can sell products |
| Salon with appointments and product sales | Venue, service providers/resource links and separately configured product fulfilment | No shared answer accidentally overwrites service and product scope |
| Selected home service | Customer-location method, service coverage and assigned operating team/resource setup | Ask for travel/coverage only for the selected method; no forced public shop |
| Self-drive rental | Rental branch/collection/return places, asset-source summary and responsible team | With-driver is optional rental setup; no transfer activity is created automatically |
| Laundry with customer drop-off and pickup | Intake/collection point and processing activity setup | Do not require a courier collection/return leg that is not enabled |
| Online-only service | Public profile, remote channel and actual configured activity | No forced rider pickup or physical customer venue; retain private business address only where its owner requires it |
| Freight or storage | Actual depots/warehouses and supported coverage/allocation context | Cargo/storage units and scope remain typed; no passenger-transfer assumptions |
| Multi-activity/multi-location business | Scoped activity assignments, explicit inherited values, mixed statuses and viewer-permitted locations | All-location view does not grant access or silently edit every location |

Health and regulated-provider categories retain administrative business/setup context. Business must not turn their profiles into clinical records, customer balances or financial transaction execution.

## Source and interaction states

For each editable/readable area, cover loading, true empty, filtered empty, populated, partial data, stale source, offline/unavailable source, external read-only, insufficient permission, draft, validation error, confirmation/review pending, changes requested, conflict and confirmed update. Keep draft input recoverable after failure. Unsupported source actions display an honest unavailable path, not a button that pretends to work.

Documents distinguish selected file/local preview, simulated upload, review pending and owner-confirmed verification. Team journeys distinguish invitation draft, sent/pending and accepted membership. In the frontend-only phase, simulated actions remain visibly local; no real invitation is sent and no upload, approval, publication or connection is claimed.

## Ownership across screens

Business owns business identity and operational setup context; Offerings owns individual catalogue records, prices and offering-specific options; Availability owns working schedules, resource allocation and capacity; Work owns actual execution; Money owns payments/settlement; Settings owns credentials, connections and personal/security preferences. Business may display summaries and relevant destinations and edit explicitly declared shared defaults through their owner. It must not maintain independent duplicate copies of those facts.

## Future categories

A category definition references a unique taxonomy ID, supported activity/field/question definitions, applicable place/method/resource requirements, vocabulary, inherited scope and approved requirement-owner references. Publication makes it available to onboarding and portal configuration together. Existing UI templates render it when the referenced behaviors are supported; unknown fields/actions/models fail validation and remain unenabled. A merchant's free-text category request remains a request until category-authoring publication.

## Build and completion evidence

1. Produce the Business field/section map and coverage records for all 128 profile IDs from the current runtime registry, including required operational question bindings and links to the other screen owners.
2. Implement the typed Business configuration/view/source boundaries and shared field/list/detail components inside `/merchant-live-preview/business` using the existing shell.
3. Implement all six sections, scoped editing, before/after preview, local draft persistence, truthful simulated actions and recovery states.
4. Add the category/state test control outside the normal merchant flow. Exercise every profile using valid enabled activity fixtures; inspect labels, requirements, fields, empty and source states. Candidate lookup alone is not acceptance.
5. Verify concrete multi-activity, location, permission and source combinations, rejected/expired document replacement and protected-change review. Include false versus unanswered, conflicting scopes, no-venue digital work, self-drive versus with-driver, optional appointments, and unknown future definitions.
6. Run desktop/mobile browser journeys for editing, validation, draft recovery, review, conflict, close/reopen and keyboard use. Verify that required information and actions remain reachable; do not shrink arbitrary forms into unreadable text to force a screenshot fit.
7. Record coverage and exceptions with the actual results. Call the Business frontend complete only when its required interactions and state matrix pass. Backend readiness means documented typed contracts and replaceable sample adapters; live backend completion is a separate claim.
