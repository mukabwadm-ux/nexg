# Settings implementation and validation plan

Date: 1 November 2026. Status: proposed sequence and acceptance criteria. Static design coverage, visual review and executed application tests are separate kinds of evidence.

## Delivery sequence

1. Reconcile ownership and current behavior. Confirm the exact merchant Settings read/update contract and identity owner. Move business-profile navigation to Business while preserving data and supported existing paths. Do not widen the existing member-based RPC into owner-only or location policy by changing labels.
2. Establish server contracts. Define personal preference records separately from business routing, supported notification events/channels, identity operations and tenant/location grants. Define safe view models, expected revision, operation IDs, audit redaction and unknown-outcome reconciliation. Unsupported sections get honest unavailable states.
3. Deliver the common shell and low-risk personal preferences. Add stable section navigation, authorized destination search, scope labels, independent saves, error recovery, safe Back behavior, keyboard/reflow and Kenya-time format previews. Preserve canonical instants, local dates and fixed Africa/Nairobi display/entry/recurrence. No timezone picker.
4. Deliver notification preferences and routing through their owner. Replace fixed owner/managers/counter assumptions only after role/destination ownership is defined. Support timezone-aware quiet intervals, explicit mandatory policy exceptions, destination verification and real delivery outcomes.
5. Deliver connector support individually. For each actual supported connector, implement function/location scope, secure authorization, class-specific authority, typed mapping, preview, import/sync, per-record results and reconnect/disconnect. Exercise native/manual paths too. Do not advertise universal ERP compatibility.
6. Deliver developer access only through a supported owner. Implement credential scopes, secure reveal/rotation/revocation, webhook destination validation/signing and delivery records. Authorization must constrain both UI discovery and the underlying commands.
7. Deliver data requests through approved records and identity owners. Define request scope, business continuity, obligations, authorization, actual artifact generation/access/expiry and closure outcomes. Retention and response deadlines require approved policy.
8. Validate cross-screen and category composition. Confirm each of the 128 baseline profiles and 21 approved extra routes retains its source guards and exact workflow/intake references. Test selected configured variants, mixed merchants, location scopes, failure and permission changes; then review future-category publication.

Do not launch an active button before its owner, policy, permissions, success evidence and recovery path exist. This is an implementation gate, not a request for the user to approve routine planning work.

## Required contracts and open decisions

| Dependency | Decision owner | What must be settled before dependent behavior is enabled |
| --- | --- | --- |
| Login, recovery, factors, sessions and security events | Identity service owner | Supported methods/operations, reauthentication policy, safe view model, recovery constraints and session revocation outcomes. |
| Personal preferences | Merchant identity/preferences owner | Storage isolation, permitted fields/locales/options, defaults, revision/conflict handling and device/system fallback. No existing personal store is assumed. |
| Notification events and delivery | Notification service plus operational event owners | Real event IDs, event payload/privacy, destinations/recipient grants, channel support, tests, exception policy, timezone semantics and actual delivery states. |
| Business/location routing and inheritance | Business identity and notification owners | Who can edit each record, whether overrides exist, exact precedence/reset semantics and continuity when a recipient loses access. |
| Connector directory and secure credentials | Integration platform and each adapter owner | Supported provider/method, per-class operations, authorization/callback binding, secrets, tenant/location scope and source freshness. |
| Mapping/import/migration | Each domain and integration owner | Typed identifiers/units/enums, conflict rules, preview snapshot/revision, partial results, idempotency, open-work handling and reconciliation. |
| API and webhook access | Developer platform owner | Real supported endpoints/events/versions/scopes, destination validation, signing, reveal/rotation/revocation and delivery policy. |
| Access/export/closure requests | Identity, records, Business and Money owners | Request types, permissions, eligible scope, protected data, obligations/continuity, retention, response policy, artifacts and expiry. Do not invent legal rules. |
| Future category validation | Authorized registry/configuration owner | Known Settings references and atomic validation alongside onboarding, offerings and other screen projections; no merchant self-publication. |

These are product/engineering dependencies. The plan leaves policy-dependent details unresolved deliberately; concept pictures must not fill them with invented guarantees or active services.

## End-to-end review journeys

| ID | Actor, fixture and action | Expected result, recovery and cross-screen evidence |
| --- | --- | --- |
| ST01 | Operator on a single-location account changes a supported display language/time format. | Explicit Your account scope; owner-confirmed save; readable confirmation and return path. Business identity, opening hours, source timestamps and original currencies remain correct. |
| ST02 | Owner begins a login destination change and returns before verification. | Existing confirmed method remains in use; pending state is visible. Expired challenge/re-authentication resumes safely; no raw destination/token in history. |
| ST03 | User sets up a supported second factor, then inspects/revokes a permitted session. | Enrollment is pending until provider confirms. Current session is marked; revocation updates that session through its owner. Required-factor constraints and sign-out outcome follow actual policy. |
| ST04 | Salon with actual appointment and retail models changes its personal supported alerts and overnight quiet period. | Two relevant event groups, no unrelated freight/rental events. Personal preferences and business routing stay distinct. Timezone and next-day endpoint are clear; destination verification and delivery remain separate. |
| ST05 | Granted local manager opens business routing for one of several locations, then changes header location with an unsaved draft. | Draft stays bound to original scope; Stay/Discard appears only if needed. No cross-location recipient or hidden-instance disclosure. Unsupported overrides do not appear. |
| ST06 | User searches quiet hours, opening hours, POS and payouts, then uses Back. | Quiet hours opens Notifications; other results identify their owning screen. Search honors discovery permissions and preserves safe return context. No unrestricted record/value search. |
| ST07 | Rental manager connects a supported read-only fleet catalogue while NEXG owns bookings. | Function, instance and location are explicit. Authorization, mapping, import and sync states are separate. Catalogue read cannot expose asset or booking write controls. |
| ST08 | The catalogue token expires while bookings use a separate source. | Exact stale classes/timestamp and Reconnect action appear. Unaffected classes retain their own confirmed state; no blanket success/failure badge. Independent booking capacity checks still apply. |
| ST09 | Import contains unknown units/enums and existing external IDs; later only some records succeed. | Invalid rows are unresolved with safe examples; IDs remain stable. Preview names included/excluded effects. Per-record outcomes allow correction of the failed subset without duplicating completed writes. |
| ST10 | Connection activation, save or disconnect times out after submission. | Unknown result, exact operation reference and Check status. Reconcile before retry; a new instance or unrelated credential cannot be revoked accidentally. |
| ST11 | Authorized owner changes one data-class source with open reservations/work. | Preview identifies affected classes/open work and required migration. Existing accepted commitments and provenance remain explainable. Reverting a preference does not undo an external migration. |
| ST12 | Read-only connection viewer opens a key-creation deep link; another actor loses access mid-edit. | Server rejects unauthorized command and avoids secret/scope leakage. Removed access clears relevant caches, stops commands and returns safely. UI presence is never the access boundary. |
| ST13 | Supported developer rotates/revokes a location-scoped key and reviews a webhook failure. | Minimal scopes and exact affected credential shown. Secret stays out of lists/history. Webhook retry concerns delivery only; it does not execute an order twice. Outcome unknown reconciles first. |
| ST14 | User requests personal data; separately, an authorized owner requests a business export/closure. | Request scope, protected/excluded fields, continuity and obligations are explained. Submitted is distinct from approved/prepared/completed. Downloads recheck permission and actual expiry. No invented deadline or instant financial-record deletion. |
| ST15 | Mobile user changes supported date/time format, sees a save failure, opens Availability opening hours and returns; device time is in another zone. | Full-page readable fields, effective Kenya-time preview, visible errors/focus, unobscured actions and saved context. No timezone picker. Merchant display/entry/recurrence and quiet hours remain Africa/Nairobi; instants and local dates retain their meaning. |
| ST16 | Hybrid business uses one shared connector at two outlets with different functions and a partial failure. | Functions deduplicate only by real registered identity; class/location ownership remains explicit. One outlet's failure does not overwrite another's good data or expose it to a restricted manager. |
| ST17 | Specialty is enquiry-only, private/regulated, supplier-confirmed or greeter-only. | Preserve effective guards and exact intake/workflow route. No generic booking/fleet/clinical export appears because another specialty shares a candidate model. |
| ST18 | New category reuses known events/classes, then an author tries an unknown class or unsafe permission reference. | Valid supported composition previews all screens. Invalid reference fails publication atomically; a merchant cannot grant capability through Settings. Historical accepted work/configuration retains its version. |

For every journey record fixture, role/grants, tenant/location, selected offering/model/intake, source owner/mode, revision, starting state, steps, expected command and visible result. Record untested/N/A with a reason. Re-run affected journeys when contracts or guards change.

## State, security and access verification

Exercise the shared R01–R12 and A01–A10 states in each applicable feature group. Give special attention to saving versus verification versus external sync, source-specific partial failure, false versus missing, safe draft recovery, duplicate submission, concurrent edits, access removal and unknown outcomes.

Authorization tests must use at least two tenants and restricted locations, including deep links, search results, bulk summaries, callbacks, background jobs, exports and downloads. Credential and privacy checks inspect actual responses/logs/history and artifacts, not just masked UI. Confirm private intake cannot enter mapping samples, notification previews or public catalogue data. Prefer actual allowed safe fields rather than broad client-side redaction of raw payloads.

Operational integration tests must exercise both directions actually supported by a connector and confirm absent writes remain absent. A successful read, selected provider name or enabled toggle cannot prove write support or live readiness. Use a supported test environment and reconcile side effects with the domain owner. No real merchant system is connected during this planning assignment.

## UX research and accessibility validation

Recruit representative merchants for task-based review, including a product-order business, appointments plus retail, rental/transfer, enquiry/production and logistics/storage; include owners, local managers and users limited to personal preferences. Include people using touch, keyboard, zoom and assistive technology. Start with a small formative round, revise, and repeat targeted tasks where uncertainty remains. Do not claim a small sample establishes population-wide results.

Use the tasks in ST01, ST04, ST06, ST08, ST10, ST14 and ST15. Observe first destination chosen, successful completion, wrong-scope attempts, unnecessary detours, errors and recovery, interpretation of pending/confirmed states, and the participant's explanation of who owns the data. Record participant count, task denominator, device and context. Agree success thresholds before any summative study; do not invent improvement percentages from a concept.

Prototype tests should ask users to explain: Does this change only your account? Did this message get delivered? Are bookings affected by the catalogue outage? Did the request delete anything yet? Does changing the date/time format move an appointment, and which zone applies if your phone is abroad? Their answers test the consequential mental models.

For implemented UI, test semantic link navigation, labelled fields and errors, heading hierarchy, keyboard/focus/return behavior, announcements for asynchronous changes, text status, measured contrast, 320 CSS-pixel reflow/zoom, reduced motion and target spacing. Primary touch actions aim for 44 CSS pixels; assess actual WCAG AA criteria separately. Automated checks support manual review; neither screenshots nor a passing static coverage check establish accessibility compliance.

## Concept images and evidence limits

Four planned scenes show Account & security, a hybrid merchant's Notifications, a rental connection's scoped recovery, and mobile Preferences. They are coherent separate moments with fictional data, not four competing navigation proposals. Written journeys cover states and sections that would make a picture unreadable if shown together.

The later user-requested desktop additions show Preferences, API & webhooks and Data & privacy. They preserve the same screen contract and synthetic capability assumptions. See the updated gallery and manifest for the exact pictured states and image-specific review.

The additional Business routing view follows the user's Notifications reference, with location-scoped recipient groups, channels and a draft Save routing action. It preserves personal/business separation and does not create team grants or establish delivery policy.

The scene briefs explicitly mark Sample preview and future capability assumptions. Inspect the resulting images for Settings selection, section names, scope labels, legible text, coherent actions and false success claims. Log visible deviations in the gallery. A concept can demonstrate an intended layout; it cannot verify interaction, privacy enforcement, server authorization, callback security, delivery, data synchronization or complete category behavior.
