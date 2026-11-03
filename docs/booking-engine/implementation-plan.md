# Future implementation and verification plan

Status: design specification. No application implementation is performed by this planning package. The phases below describe the work needed to make it real. Proposed contracts must be reconciled with available approved platform specifications before implementation.

## Execution sequence

| Phase | Deliverable and dependency | Verification and exit |
| --- | --- | --- |
| P0 Baseline and owner decisions | Confirm deployed schema/routes, approved identity/document/Finance/booking/fulfilment contracts and available master specifications | Record source/version conflicts and action gates. No unknown policy is converted to a live command. |
| P1 Registries and category publication | Typed questions, capability/domain definitions, workflow versions, strict manifests, authoring preview and atomic registry snapshot | Structural and semantic validation; unknown refs, cycles, incompatible types, scripts and unimplemented behaviours rejected. Existing and future-category fixtures resolve. |
| P2 Configuration and onboarding | Validated draft answers, legacy mappings, deterministic resolver, explanations, conditional forms and review/diff | All 128 baseline profiles plus answer variants; no irrelevant delivery gates; typed false/zero/unknown distinctions; draft/recovery/ownership tests. |
| P3 Common domain interfaces | Offering/workflow/availability/fulfilment/financial read models and owner commands; resource/custody/child-work relations | Contract tests, state transition guards, atomic reservations, linked-child idempotency, versioned historical work and domain write boundaries. |
| P4 Connections | Function-specific discovery, secure authorization, connector manifests, mappings, authority and reconciliation | Captured provider payload tests, explicit capability/permission/action intersection, unknown/retry/duplicate/outage tests per supported connector. No universal vendor claim. |
| P5 Shared shell and Work | Permission/location context, common state components, queue/details and specialized execution | Work journeys and R/A states across representative families, then all profile applicability cases. Phone, keyboard and permission changes. |
| P6 Offerings | Stable-ID editors/import, pricing units, schemas, publication and external ownership | Non-destructive merge, schema/variant/quote/resource fields, publication gates and source conflicts. |
| P7 Availability | Hours, slots, sessions, assets, shared capacity and dual-leg windows | Concurrent reservations/holds, overnight/timezone, closure impact, maintenance and stale external capacity. |
| P8 Business | Shared onboarding edit/review, readiness, identity, locations, people and documents | Hybrid changes, protected identity, rejected-document replacement, role/scope boundaries, existing work retained. |
| P9 Money | Finance-backed breakdowns, settlement, refunds, documents and cases | Owner-defined amount/state tests, precision/currency, permission limits, duplicate/unknown monetary operations and reconciliation. |
| P10 Promotions | Existing Featured integration and only approved additional campaign types | Inventory/eligibility/funding/terms, review/activation, source failures and metric attribution. |
| P11 Insights | Registered metric queries, source coverage, drill-down and exports | Numerator/denominator/date/currency fixtures, partial/comparison/privacy cases and accessible chart alternative. |
| P12 Settings | Personal preferences, supported security/channel flows, connections/API access and data requests | No secret leaks, scope changes, auth expiry, ownership migration preview and allowed recovery. |
| P13 Migration and pilot | Existing merchant import, unresolved-answer review, source ownership, staged rollout | Dry-run diffs, historical references unchanged, profile-by-profile review, measured user tasks and explicit recovery/rollback. |

Each phase uses PLAN → IMPLEMENT → VERIFY → ACCEPT → PROCEED when implementation is actually authorized. These documents do not mark those phases accepted or complete.

## Required planning sections

| Section | Definition for this programme |
| --- | --- |
| 1 Objective | Onboarding-derived portals for all current and future configured categories, with meaningful operational variants. |
| 2 Scope | Onboarding, configuration, shared components, integrations and the eight named screens; Home continuity. |
| 3 Dependencies | Published registries, approved owner contracts, identity/scope, actual provider support and required source data. |
| 4 Architectural boundaries | Business domains own their facts; integration adapters isolate providers; screens use domain view models. |
| 5 Existing contracts affected | Merchant draft/readiness, category configuration, catalogue, hours, role grants, publication, work and financial views. Inventory exact deployed versions in P0. |
| 6 New contracts required | Configuration revision/resolution/explanation; category snapshot/publication; schema/metric/component references; connection authority and typed read models. |
| 7 Entities affected | Category/specialty definition, question/answer, merchant configuration, capability binding, offering, resource, reservation, work, external reference and operation. Reuse existing owners rather than duplicate records. |
| 8 Database changes | Future versioned registry/configuration/answer provenance and external reference persistence; actual migrations need schema review. No migrations in this package. |
| 9 APIs affected | Future authoritative configure/validate/preview/activate queries and commands; domain actions and connector operations. Register routes/capabilities/errors before implementation. |
| 10 Commands affected | Draft save, configuration preview/apply, category publish, work transitions, reservation, import and connection repair; idempotency, expected version and policy per command. |
| 11 Events affected | Owner-confirmed versioned configuration/registry/work/resource/financial/connection events; explicit event registry and consumer compatibility. Events do not conceal commands. |
| 12 State machines affected | The 17 proposed workflow families plus configuration, publication, connection and operation state. Confirm owner transition contracts. |
| 13 Capability changes | Shared business capabilities and specialist variants registered independently of taxonomy labels and actual user permissions. |
| 14 Authorization | Server-evaluated user/session/tenant/location/role/scope/capability/current state and relevant connection capability. Default deny. |
| 15 Offline behaviour | Reads/cache under approved retention; resumable safe drafts where allowed. Each consequential command declares ALLOWED/RESTRICTED/FORBIDDEN; no invented offline financial or reservation completion. |
| 16 Synchronization | Per-data-class authority, explicit references, bounded retries and idempotency, source freshness, mapping/reconciliation and unknown outcomes. |
| 17 Hardware | No new hardware dependency for planning. Future camera/file capture and terminal workflows require capability/access review; do not assume camera/device trust. |
| 18 Integrations | Provider manifests, secure authorization, transformed schemas and contract tests per supported system; gradual future native ERP adoption. |
| 19 UI/application impact | Conditional onboarding, consistent nine-item navigation including Home, domain components, eight screens, mobile/keyboard and source-aware actions. |
| 20 Security | Secrets outside answers/logs, strict bounded manifests, safe uploads/exports, ownership checks, approved personal-data handling and no category-granted permissions. |
| 21 Observability | Correlation/operation IDs, resolver explanation/rule versions, activation failures, source lag, invalid mappings and safe per-scope audit. Do not log sensitive answers indiscriminately. |
| 22 Testing strategy | Static registry validation, independent expected configurations, 128 profile scenarios, answer/source/role variants, future-category tests, workflow/owner contracts and representative merchant usability research. |
| 23 CI validation | Verify registries, references, deterministic generation and schema/semantic fixtures; then meaningful unit/contract/integration/e2e checks for implemented changes. |
| 24 Migration | Legacy aliases and ambiguous values preserved; explicit clarification tasks; stable offering/external IDs; started-work rules pinned; dry-run before activation. |
| 25 Rollback | Restore a compatible published registry/config revision through owner commands. Preserve data/history, reconcile pending operations and handle forward-only changes explicitly. |
| 26 Documentation | Keep registry meanings, component/workflow owners, screen specs, connector support, operational runbooks and known limitations current. |
| 27 Deliverables | The files indexed in README plus future implementation evidence and user-accepted rollout records. |
| 28 Acceptance criteria | All current rows and future-category example map coherently; supported operations work under owner rules; inaccessible/unsupported states are honest; no developer setup per merchant. |
| 29 Failure modes | Unknown owner, bad mapping, partial publish, contradictory answers, source outage, concurrent edit, duplicate command, capacity race, unauthorized read/write and stale metrics. |
| 30 Risks and mitigations | Metadata complexity → typed bounded references and preview; generic UI → specialist components; false readiness → separate effective constraints; duplicated truth → declared owner and reconciliation. |
| 31 ADRs required | Registry storage/publication, resolver/versioning, hybrid work composition, authority/migration, reservation ownership and privacy/offline decisions where not already approved. |
| 32 Exit criteria | For planning: coherent documents and explicit gaps with validation evidence. For implementation: every required acceptance criterion passes real runtime tests and owner review. |
| 33 Resolved decisions | User selected plans before pictures; shared platform with answer-driven variants; all 128 explicit; future categories through one governed configuration path; no application build in this assignment. |
| 34 Sub-phases | P0–P13 above, each with proportionate plans, tests, accepted exit and current evidence. |

## Verification scenarios beyond the 128 baseline

- Change a relevant answer and confirm the expected modules/fields/actions and necessary follow-up questions change.
- Leave it unknown and confirm the dependent configuration remains unresolved without disabling unrelated work.
- Combine two specialties using the same resource and prevent double allocation.
- Change a source to read-only and prevent local writes despite a writable-looking component.
- Revoke a role or location grant during an edit and prevent the command and sensitive cache reuse.
- Deliver the same provider event twice and preserve one result; reconcile a timed-out operation before replay.
- Publish a new category built from existing definitions and update form/discovery/portal together.
- Attempt unsupported new state/action/component or arbitrary script and fail publication.
- Migrate an older category/answer version without guessing the meaning of `yes`, a duration band or unrecognized unit.
- Restore a compatible registry version while existing work retains its accepted history.

## Design dependencies that must remain visible

Finance owns fees, taxes, rounding, deposits, settlement and refund rules. Identity owns grants and sensitive changes. Merchant/document owners define readiness/publication/review. Workflow/availability/fulfilment owners define confirmation, holds, capacity and evidence. Privacy/security owners define retention, sensitive data and supported authorization. Promotion owners define additional types/funding/eligibility. Reporting owners define metrics and attribution.

The plan specifies how to present and constrain these dependencies. It does not invent their values or claim their implementation. Reference images use fictional sample records and only illustrate a coherent configured state.
