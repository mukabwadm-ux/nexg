# Onboarding and configuration

Status: proposed design. This is the foundation used by every profile and screen in this package.

Booking implementation uses the later [reconciled manifest](payload-reserve-plan/reconciliation/manifest.json) for effective question, profile, workflow and domain definitions. This document describes the shared journey; source-key examples and earlier fixture defaults do not override that manifest.

## 1. Merchant tasks and context

Owners need to describe what they offer, how customers engage them, where work happens, when they have capacity and which systems already manage their records. Frontline staff later need only their permitted operational tasks. Multi-location owners need scoped configuration and exceptions.

The primary device may be a phone used during other work. Preserve a resumable draft, visible labels, one coherent question group at a time and a truthful review of what the answers will configure. A desktop may show the same groups beside a preview. Never require an irrelevant pickup address, preparation duration or menu to finish a digital or appointment business.

## 2. Proposed onboarding journey

| Stage | Questions and records | Branching and exit |
| --- | --- | --- |
| ON01 Identity and ownership | Trading/legal identity as applicable, contact, verified login, authorized owner, preferred communication channel and language; Kenya time is supplied by the platform | Preserve the existing verified ownership and resume mechanism. Communication preference is stored explicitly. Verification pending is distinct from a saved draft. |
| ON02 Business activities | Primary category, one or more relevant specialties, offered activities and customer engagement methods | Search and plain descriptions. Primary specialty chooses useful defaults; selected capabilities and answers determine behaviour. Allow a proposed new specialty request without publishing an unsupported category. |
| ON03 Offerings and pricing | Product/service/asset/event/package types, fixed/unit/time/quote pricing, units, variants, durations, minimums and required listing details | Reuse specialty questions. Ask exact values only where operations need them. Add/import a useful first offering or retain an explicit unfinished setup task. No universal five-item threshold. |
| ON04 Work and fulfilment | Immediate/scheduled/request/quote/membership work; confirmation actor; enabled fulfilment methods; responsible staff, merchant, NEXG or external provider | Each enabled method has its own requirements. Selecting a method creates follow-ups; selecting it does not create an actual fleet or authorize a provider. |
| ON05 Places and service areas | Business/legal address where required; public venue, pickup point, service area, remote channels and location-specific activities; fixed Africa/Nairobi | Ask only relevant place types. Delivery coverage constrains delivery, not an unrelated remote or at-venue capability. Support a merchant with several location types. |
| ON06 Availability and resources | Operating hours, exceptions, lead time, exact duration, slot rules, session dates, staff/assets and capacity according to model | Overnight intervals carry dates and timezone. Distinguish opening hours from bookable capacity. Resource records can be imported or added through guided setup. |
| ON07 Existing systems | Systems per business function, required records/actions, connection mode and intended authority | A merchant can use NEXG/manual entry, supported external software or a mixture. Secure authorization is a separate resumable sub-flow. Unsupported providers get a truthful request/import path. |
| ON08 Documents and settlement | Existing conditional document requirements; verified payout setup where needed; terms applicable to enabled activities | Never infer a licence from an answer. Upload, review, replacement and expiry are separate states. Financial onboarding reuses approved provider/account verification rules. |
| ON09 Configuration review | Enabled activities, customer discovery preview, sections/actions, workflow steps, fulfilment, places, resource model and connected sources | Each summary has Edit with focus return. Explain why a feature appears. Show missing prerequisites, then submit the configuration revision. Review submission does not publish the merchant. |
| ON10 Guided completion | Import/add actual records, authorize selected connections, resolve documents and exact schedules | Show actionable tasks and waiting tasks separately. The configured portal is available within permission/readiness restrictions. Existing verification/publication owners decide when work can become live. |

Progress uses applicable groups and requirements. Changing an answer recomputes the applicable denominator and explains removed/new requirements. Never silently clear entered values without a reversible review when they affect work.

## 3. Answer model and validation

Each answer references a question ID and question version, scope, typed value and provenance. Scope is business, location, capability or offering as declared by the definition. Provenance identifies merchant entry, confirmed import or authorized staff correction. Record answered-at and actor; do not log secrets or unnecessary personal data.

Use the typed registry for both client hints and authoritative server validation. Question types include boolean, enum, multi-enum, text, integer, decimal quantity, money with currency, duration with unit, time interval, address/service area, reference and repeated structured records. Decimal quantity is not floating-point money.

Canonical answers are addressed by question ID. Current source-key answers remain in an import namespace with an explicit mapping. Preserve unknown imported values as unmapped, not a convenient default. A broad lead-time band remains a band until the merchant supplies the exact value required for booking. Claim fields produce declared claims, not verified badges.

Visibility and requirements use one bounded typed predicate representation: `all`/`any` groups and `{path, op, value}` leaves with `eq`, `neq`, `in`, `contains`, `intersects`, `exists` and `nonempty`. Category authoring uses registered question references which compile into this representation through their canonical targets. No second evaluator, general negation or numeric comparison operator is implied; numeric cross-field validation uses separately registered validation rules. References must resolve, dependency graphs must be acyclic and conditions cannot execute scripts, call a URL or grant permissions. Missing values remain unknown, including under inequality. Hidden answers are retained as inactive provenance where retention rules permit; they do not keep enabling capabilities.

Cross-field checks include end-after-start, date/timezone consistency, minimum below maximum, compatible units, selected resource belonging to the location, and fulfilment requiring its declared place/service-area records. Use the existing ownership boundary for all writes. A stale revision produces a conflict with an inspectable diff.

## 4. Configuration inputs and output

The design separates three records:

1. **Business configuration revision:** approved registry versions, selected activities and validated answers. This captures merchant intent and the relevant policy references.
2. **Resolved configuration:** deterministic operational structure derived from that revision, including an explanation for each rule.
3. **Effective session view:** the resolved structure constrained by current role, location, permissions, live source capability, approval and operational state. A session permission change does not rewrite the merchant's chosen activities.

Proposed `ResolvedMerchantConfiguration` sections:

| Section | Contents |
| --- | --- |
| identity | Merchant reference, configuration version, schema version, category-manifest versions, language/timezone and scopes |
| activities | Primary and optional capabilities, source answers, applicability and compatibility results |
| vocabulary | Names for work units, offerings, resources, dates and milestones; stable navigation remains Home and the eight named destinations |
| offeringSchemas | Typed fields, option groups, units, pricing, visibility, publication and owner references |
| workflows | Workflow/version references, enabled transition conditions, responsible actors and exception paths |
| fulfilment | Method, responsible party, places, coverage, evidence/confirmation and policy references |
| availability | Hours/slot/session/asset/capacity/membership models with exact rule references |
| discovery | Browse/book/request/quote intent, card detail fields, timing language, supported customer actions and eligibility prerequisites |
| integrations | Per-data-class owner, supported operations, external references, source mode and connection health references |
| readiness | Requirements, applicability, responsible owner, current confirmed state and next action |
| screens | SC_* variants, component references, field groups, action contracts and links |
| explanations | Rule ID, input question/version/value, output path and reason for every derived decision |

A configuration is metadata. It never substitutes for an authorization decision, creates a ledger entry or marks a workflow transition confirmed.

## 5. Resolution procedure and precedence

1. Resolve tenant and permitted editing scope from the session.
2. Load a consistent published registry snapshot and the merchant's configuration revision.
3. Import current answers through explicit legacy mappings. Retain ambiguity as a question or design issue.
4. Evaluate question applicability and validate required typed answers and cross-field constraints.
5. Assemble selected activities from manifest defaults and explicit answers. Defaults are suggestions, not proof of a merchant capability.
6. Compose offering, workflow, fulfilment, availability and discovery definitions. Reject incompatible combinations with a merchant-readable reason and alternatives.
7. Resolve each data class's owner and allowed operations. A requested integration lacking authorization produces a connection requirement.
8. Compute capability-specific readiness and the screen/component configuration.
9. Store the configuration revision and explanation set atomically. Produce a diff before applying a material revision.
10. Derive the session view from current grants, scope, verified state and source health. Confirm actual mutations through their owner commands.

Precedence is explicit: legal/approved platform restrictions and owner contracts constrain available behaviour; published capability compatibility constrains composition; permitted explicit merchant answers override suggested defaults; a location override applies only to fields declared overridable; role/source/runtime conditions constrain the resulting action now. Never broaden a permission to make an answer work.

Given the same validated inputs and registry versions, structural resolution must match. Dynamic counts and health belong to the effective view and are not inputs to a supposedly reproducible configuration hash.

## 6. Conditional examples

| Merchant answer | Resolved effect | Follow-up or prerequisite |
| --- | --- | --- |
| Car rental selects driver available | Enable a driver option and assignment component within rental work | Driver/resource records, driving availability and supported assignment contract. Transfer work requires its own selected capability. |
| Self-drive rental | Asset calendar, collection, condition evidence and return workflow | Asset records, rental units and the merchant's verified policy references |
| Beauty business sells products and takes bookings | Compose product ordering and appointment workflows | Separate product stock from appointment staff capacity |
| Clinic offers home visits | Administrative home-visit appointment mode and scoped service area | Confirm authorized personnel/resource and service-area rules; do not expose clinical notes |
| Laundry collects and returns | Two linked transport legs around processing, with item/weight pricing | Collection and return windows and custody confirmation |
| Online-only service | Remote channel and digital delivery/session information | No rider pickup requirement; physical/legal address only where an actual rule requires it |
| Freight merchant prices per kg and cubic metre | Quantity and dimensional fields with explicit units and quote rules | Rate basis and applicability decision; do not guess volumetric conversion |
| Existing inventory system owns stock | Source-linked stock and read-only local display | Validated mapping and connection; changes route to the authoritative owner's supported command |

An answer can enable a configuration path while readiness remains incomplete. This distinction meets the automatic-configuration requirement without fabricating operational data.

## 7. Hybrids and locations

Allow multiple selected activities with one primary specialty for discoverability. Store applicability by location and capability. The review groups work by meaningful type rather than forcing every task into one status sequence.

Shared contact, identity and policy records can be referenced. Different offering inventories, staff rosters, vehicles and hours remain scoped. All-locations views show mixed states and authorized totals; mutations require an explicit scope preview. Existing tasks retain their originating location and workflow version.

## 8. Readiness and lifecycle

Configuration revision states: draft → validation required → valid draft → submitted for review where required → approved/active revision. Changes requested return to the affected answers. A registry version can require a migration review before activation.

Track independent facts: identity/ownership verification; business approval; capability and location publication; schedule; capacity; willingness to accept new work; connection health; and individual task state. There is no single 'live' flag that proves all eight.

Example readiness: a rental requires a usable asset and exact availability rules; an appointment capability requires a service and a staff/resource or justified unassigned-capacity model; a quote-based capability requires request fields and response ownership; a product capability requires a publishable offering and supported fulfilment. Counts and documents follow existing approved policies. Proposed minimums are usability suggestions until their owners define them.

## 9. Change, migration and recovery

Preview affected components, listings and future work before applying a material answer change. Do not rewrite accepted quotes, paid prices, published financial history or existing booking terms. Plan separate handling for future unconfirmed work and already confirmed work. A new incompatible configuration is a draft until the needed migration policy is explicit.

Use revision checks and idempotent commands. If saving times out, show outcome unknown, read the revision back and reconcile before retrying. On an integration outage, show last confirmed data with freshness where permitted and restrict affected actions. Do not silently queue consequential commands offline without a declared policy.

## 10. Future categories

Category authoring is a distinct operator capability. A versioned manifest registers category/specialty labels, question references, capability composition, offering/workflow/availability/fulfilment references, readiness, discovery and screen mappings. Validate it and preview both onboarding and the resolved portal before a single publication switches the registry snapshot. See [category-extension.md](category-extension.md).

Adding a label with only existing compatible capabilities can be a configuration change. A new state machine, action, external data class or interaction component requires that extension to be specified, implemented and tested before the manifest can enable it. This avoids a false promise that arbitrary new business behaviour can be created by adding text.

## 11. UX decisions and validation

Use recognition by showing 'Your rental setup' beside the exact answers that configure it. Use proximity for errors beside their input and a linked summary at Continue. Use progressive disclosure for fulfilment-specific questions while keeping selected methods and unmet prerequisites visible. Use real progress and resumability. Use familiar labels from merchant tasks rather than infrastructure terms.

Proposed accessibility target: WCAG 2.2 AA, subject to product adoption and real testing. The target-size minimum is 24 CSS pixels with defined exceptions; primary touch controls should aim for 44 CSS pixels as a design preference. These are different claims. References: [W3C target minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), [enhanced target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced).

Observe an owner completing a food, retail, rental, appointment, freight, quote-based and hybrid setup on phone and desktop. Measure applicable completion, correction, comprehension of the resulting portal and recovery. Cover all 128 through configuration fixtures; do not call those fixtures executed product tests until a resolver exists and is exercised.
