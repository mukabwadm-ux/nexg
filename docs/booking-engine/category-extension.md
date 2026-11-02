# Adding categories through one versioned manifest

Status: proposed design, 29 October 2026. No category-authoring interface, resolver or manifest publication service is implemented by these documents. The present taxonomy, category question configuration and portal still need the work in the onboarding audit.

## Outcome and boundary

A permitted product operator registers a category once. Its manifest describes specialty choices, question references, enabled capabilities, workflow bindings, offering schemas, availability, fulfilment, readiness, discovery, vocabulary, screen bindings, metrics and promotion eligibility. Validation compiles the same manifest into both onboarding and portal configuration. Publication activates them together. A merchant supplies business answers and operational records rather than commissioning a separate portal.

The manifest selects already registered and implemented behaviours. A new field may reuse an existing typed field renderer, but a genuinely new workflow transition, pricing rule, connector command or specialist component needs an approved contract, implementation and tests before activation. Publishing metadata cannot create that behaviour or widen platform/user permissions.

Referenced design definitions are collected in `domain-registry.json`; implementation and activation remain separate gates.

The category manifest is distinct from a connector manifest and a merchant's resolved configuration. Category definitions describe possibilities; merchant answers select applicable branches; runtime permissions, publication/readiness and actual connector health constrain action availability. A category author cannot write a provider secret or grant merchant access to a new location.

## Manifest content

The companion `category-manifest.schema.json` describes a strict JSON structure. `example-new-category.json` is a proposal-only `pet_care` category with `pet_grooming`. It reuses `WF_APPOINTMENT`; choosing mixed service locations makes `WF_FIELD_SERVICE` execution available. The registered execution rule creates that child only when the actual booking chooses customer-location fulfilment. Venue bookings do not acquire a visit task. Parent and child represent reservation and execution for the same linked work, with one defined resource allocation and charge policy.

| Manifest section | Required meaning |
| --- | --- |
| Identity and version | Stable category/specialty IDs, label, schema version, semantic version and lifecycle status |
| Question bindings | References to the shared typed registry, scope, visibility/required conditions; no copied competing question definitions |
| Capability bindings | Registered business capability/version and condition; these are not authorization grants |
| Workflow bindings | Versioned workflow reference, primary/child role, enabled condition, capability, availability and fulfilment links |
| Offering schemas | Registered typed listing schema and applicability |
| Availability and fulfilment | Registered models/methods plus explicit conditions and resource setup requirements |
| Readiness | Registered checks for required records and capabilities, with dependencies and scope |
| Discovery and vocabulary | Customer card/search/filter references and merchant nouns; terminology does not rename financial or legal meanings |
| Screens | Exactly one binding for each `SC_WORK`, `SC_OFFERINGS`, `SC_AVAILABILITY`, `SC_BUSINESS`, `SC_MONEY`, `SC_PROMOTIONS`, `SC_INSIGHTS`, `SC_SETTINGS`; component references and applicable capability filters |
| Metrics and promotions | Registered metric definitions and explicit permitted promotion types/rules; unsupported types remain absent |
| Migration and verification | Upgrade/rollback rule references, preserved started-work policy, fixture/test references and impact review |

Authoring conditions use `all`, `any` and typed `questionRef/operator/value` leaves with `eq`, `neq`, `in`, `contains`, `intersects`, `exists` or `nonempty`. `always: true` means no predicate. Compile through the registered question/source mapping into the single bounded `path/op/value` representation, retaining scoped question identity where destinations overlap. There is no second evaluator, arbitrary path, negation, numeric predicate, script or permission grant. Missing values propagate unknown, including under `neq`; only confirmed true activates a branch. Registry types govern operator compatibility. `exists` and `nonempty` use `value: true`.

Versioned references pin meaning. Category authors cannot silently change the question behind an existing version or relabel an operational enum to make an incompatible meaning appear compatible. Current taxonomy applicability is baseline coverage, not a permanent ban on reuse: the reviewed manifest adds new applicability using the same typed meaning in the atomic release. Resolve conditional follow-up dependencies against shared setup and existing records, without asking the same fact twice. Keep historical source-key mappings explicit and retain normalized-answer provenance.

## Category setup interface

The proposed authoring workspace is a platform administration function, separate from merchant Settings. Existing authorized roles and review policies must govern access; no new role is granted by this plan.

| Step | Operator sees and does | Validation and states |
| --- | --- | --- |
| Identity | Name, stable ID, specialties, description, lifecycle/version and change reason | Duplicate ID, reserved ID, missing label, incompatible reuse |
| Business behaviour | Select implemented capabilities and workflow families; inspect their prerequisites | Unsupported behaviour is recorded as an implementation dependency and blocks activation |
| Questions | Search shared questions, inspect wording/type/unit, define applicability and answer scope | Unknown ref, duplicate meaning, dependency cycle, hidden required question, invalid operator |
| Offerings and operations | Choose listing schemas, availability, fulfilment, resources and readiness | Resource/stock contradictions, unsupported pricing, missing duration, incompatible unit |
| Presentation | Configure vocabulary, discovery and eight screen bindings from registered components | Unknown component, unreachable action, required fact absent, unnecessary category-specific screen duplication |
| Sources and access | Preview source modes and operation constraints inherited from contracts | Readonly write attempt, missing authority, unsupported connector operation, location scope widening |
| Preview | Enter fixture answers and inspect form plus all eight resolved screens | Show resolution explanation, remaining setup, source/freshness states and changes from the published version |
| Test and impact | Run structural/semantic checks and saved scenarios; review affected merchants and existing work | Failing cases, unreviewed breaking change, unresolved required business rule |
| Review and publish | Review immutable candidate, diff, validation evidence and release target | Stale candidate, changed registry dependency, denied approval, atomic activation pending/confirmed |

Preview uses synthetic scoped fixtures and does not contact production providers or make real bookings. Both form and portal show the candidate version prominently. An operator can inspect why a condition matched and why an action is unavailable. Mobile previews can be interactive during implementation; the separate image exercise still produces only the eight agreed reference images.

## Validation layers

Structural validation uses JSON Schema Draft 2020-12 to check required sections, shapes, enums, bounded arrays and the closed condition syntax. JSON Schema describes structure; it does not prove that a referenced workflow exists, that a price model is operationally safe or that a server command is authorized. The dialect and reference semantics follow the [JSON Schema core specification](https://json-schema.org/draft/2020-12/json-schema-core).

Semantic validation must additionally:

1. Resolve every pinned registry reference to an implemented, approved, compatible version. Reject a reference to an absent component even if its string is structurally valid.
2. Enforce unique IDs and one binding for each of the eight screens. Check all local availability/fulfilment/parent references and detect cyclic workflow composition.
3. Validate question conditions against actual types, allowed values, scopes and units; reject incompatible comparison operators. Resolve each question through its registered canonical target. Detect impossible/hidden requirements and dependency cycles. Bound expression depth and evaluation work.
4. Confirm each workflow has its required offering, availability, resources, fulfilment, readiness, command and recovery contracts.
5. Verify that screen components can present all required facts and registered actions. Check discovery fields, metric denominators and promotion eligibility for compatible sources.
6. Apply the existing authorization and authority rules independently. A category cannot make a readonly connection writable or create a regulated transaction permission.
7. Run fixtures for relevant answer combinations, no-ERP and connected modes, hybrid capability interactions, single/multiple locations, permission restrictions and source failures.
8. Compare upgrades against saved answers, published listings and started work. Require an explicit migration for incompatible fields or meanings.

The example passes structural validation when checked against the schema. It remains `DRAFT`; registered behaviour implementation and publication evidence are separate gates. Unavailable registries are reported as unresolved dependencies, never fabricated successful checks.

## Publication, deprecation and rollback

Proposed lifecycle is `DRAFT` → `IN_REVIEW` → `APPROVED` → `PUBLISHED` → `DEPRECATED`. Rejection returns a candidate to `DRAFT` with reasons. Approval pins a content hash plus exact dependency versions; editing the candidate invalidates its approval. Published versions are immutable. Deprecation stops new selection according to an announced replacement policy and preserves existing work/history.

Atomic activation uses one release identity for the manifest, resolved question/form definition and compiled portal configuration. Validate and stage all artifacts first, then switch the active release pointer only after every artifact is readable and its hash matches. Readers must never combine form version A with portal version B. Failed staging leaves the previous release active. A retry uses the same release operation, preventing duplicate publication.

New merchants use the active release. Existing merchants retain their version until the approved upgrade policy applies. An upgrade previews field changes, asks only genuinely new applicable questions, preserves prior answers and external IDs, and keeps dependent new capabilities in setup until prerequisites are confirmed. It must not silently reinterpret a duration band as an exact duration or erase a retired answer that explains historical work.

Rollback activates an already validated compatible release for new configuration resolution. It never rewrites completed work or changes the workflow version under a started booking, rental or shipment. If current records cannot be represented by the earlier release, block automatic rollback and present a migration/reconciliation plan. Dependent connectors and pending commands require an explicit cutover boundary rather than two active writers.

## Required scenarios

| Scenario | Expected evidence |
| --- | --- |
| New grooming category, venue only | One registration exposes its questions and all eight appropriate screen configurations; no field-service task appears |
| Venue and home service selected | Service-area setup becomes required; a customer-location booking links one field-service execution, while venue bookings have none; no duplicate charge or resource hold |
| Unknown workflow/question/component ref | Candidate fails semantic validation; current published category remains active |
| Invalid dependency or hidden requirement | Preview names the conflicting fields; publication is blocked until corrected |
| External readonly scheduling source | Viewing is allowed as scoped; create/reschedule commands remain unavailable even if category declares appointments |
| New unsupported specialist behaviour | Candidate remains draft with contract/component implementation dependency |
| Breaking field upgrade | Existing answers remain interpretable; new exact value is requested; incompatible version cannot auto-upgrade |
| Failure between form and portal staging | Neither half becomes active; retry resumes the same release |
| Concurrent candidate edit | Expected-version check rejects stale publication and requires renewed review |
| Rollback with started work | New selection follows the compatible rollback; existing work retains its original configuration and history |

This extension mechanism is how a future category can reuse the platform without another portal build. Its implementation, registries and evidence must be complete before the authoring interface can claim automatic publication.

Document checks on 29 October 2026 confirmed schema validity, example shape, six question references, typed fixture values and local bindings. Six malformed manifests were rejected. Publication and runtime scenarios remain unexecuted.
