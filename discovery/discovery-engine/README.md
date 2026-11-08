# NexG Discovery Engine

Latest F12: [offline evaluation and release decisions](docs/EVALUATION_RUNTIME.md) adds strict judged-run contracts, graded metrics, complete release slice coverage, paired comparisons, isolated lexical research and actual-source feasibility runners. Read the [plan](docs/EVALUATION_IMPLEMENTATION_PLAN.md) and [verification](docs/EVALUATION_VERIFICATION.md). Full F12 release acceptance requires source-approved independent judgments and measured operating gates; live sign-in/consent/NexG storage adapters remain deferred by the owner until after this work.

Latest F11: [safe interactions, tracing and operator rollback](docs/OBSERVABILITY_RUNTIME.md) adds a first-party event pipeline, shared card visibility measurement, bounded OTLP diagnostics and local checksummed controls. Internal collection is owner-authorized; actual platform consent/classification and approved NexG storage adapters remain to be connected. No Meta tracking or data sharing was enabled. Read the [plan](docs/OBSERVABILITY_IMPLEMENTATION_PLAN.md) and [verification](docs/OBSERVABILITY_VERIFICATION.md). Full V1/F12 acceptance remains open.

Updated 19 October 2026. The [V1 foundation](docs/FOUNDATION_RUNTIME.md), [read service/provider](docs/READ_SERVICE_RUNTIME.md), [Typesense/indexing](docs/INDEXING_RUNTIME.md), [F07 query/retrieval](docs/QUERY_RUNTIME.md), [F08 ranking/diversification](docs/RANKING_RUNTIME.md), [F09 collection composition](docs/COLLECTION_RUNTIME.md) and [F10 integration/paging/recovery](docs/INTEGRATION_RUNTIME.md) are built within their declared source gates. F10 adds signed bounded sessions, an opt-in browser provider, truthful count/window states, exact collection View all and typed shared recovery. The approved baseline's editorial records remain disabled and retain their original release ID. Live offering/P1/sort activation, complex destinations, source-certified R2, reviewed language aliases and full judged benchmark acceptance remain pending. The architecture and V1-V3 roadmap remain the plan.

Run `npm --prefix discovery-engine run check` and root `npm test`. Start the independent local service with `npm --prefix discovery-engine run dev` on port 5190, or local Typesense with `npm --prefix discovery-engine run search:up`. See [latest verification](docs/INTEGRATION_VERIFICATION.md), [provider setup](docs/INTEGRATION_RUNTIME.md) and [deliverables](docs/status/deliverables.md). Native functional test files run sequentially to isolate real deadline checks. The frontend defaults to its legacy provider; engine selection is explicit. Platform source/data remain untouched and the catalog API is read only.

This folder was renamed from recommendation-engine at the owner's request. It now describes the complete discovery system. Recommendation remains a distinct engine within that system. Earlier recommendation plans are preserved unchanged in [history](docs/history/README.md).

The goal is useful discovery across every category/subcategory in the selected published release, currently 16 categories and 98 subcategories: understand a request, find eligible merchants and offerings, rank suitable options, compose useful collections, and measure whether the guest succeeds. Catalog facts and transaction decisions remain owned by the existing platform.

[Discovery Studio](../discovery-studio/README.md) separately owns planned taxonomy editing, per-screen arrangement, preview and release management. The engine consumes compatible versioned releases; the current 16/98 snapshot is a starting baseline, not a permanent limit.

## Start here

Owner direction, 19 October: build Discovery for the complete platform and make its workflow guarantees concrete integration requirements. Existing platform gaps do not shrink the engine design. Start with the [exact V1 data/API contract](docs/V1_DATA_API_CONTRACT.md), [primary engine OpenAPI](docs/contracts/ENGINE_V1.openapi.json), [platform compatibility audit](docs/PLATFORM_SUPPORT_AUDIT_2026-10-19.md) and [start readiness](docs/V1_START_READINESS.md). The owner workflow annex is separate from engine routes; operational execution remains with its platform owners.

The [workflow policy specification](docs/WORKFLOW_POLICY_SPEC.md) implements the owner's 19 October design direction: reuse policies by offering workflow/capabilities, with categories supplying context. It defines shared rules, allowed changes, conflict merging and mixed-workflow cases.

The [complete workflow map](docs/WORKFLOW_COVERAGE.md) covers every current category/subcategory with conditional offering paths and source status. The [rule audit](docs/WORKFLOW_RULE_AUDIT.md) defines reusable missing rules and explicitly unsupported extensions. Neither document enables operational capabilities.

The [extension specification](docs/WORKFLOW_EXTENSIONS_SPEC.md) now defines detailed membership, resource-reservation, recurring-service and telecom rules, plus their recommended V1-V3 scope. V1 includes the foundation and optional source-gated basic paths; V2 expands lifecycle/coordination and V3 improves constrained selection. Actual owner integration remains separate from the current read-only shell.

Planning resumed 19 October 2026. Start with the [planning status/decision ledger](docs/PLAN_STATUS.md), [concrete V1 build specification](docs/V1_BUILD_SPEC.md), [intent/task contract](docs/INTENT_AND_TASK_CONTRACT.md) and [deep recommendation specification](docs/RECOMMENDATION_SPEC.md). These refine the 16 October roadmap; source readiness and performance still need evidence.

| Document | Read it for |
| --- | --- |
| [Documentation index](docs/README.md) | Ownership, status and reading order |
| [Foundation runtime](docs/FOUNDATION_RUNTIME.md) | Implemented reader/contracts/policy, commands, trust boundaries and remaining work |
| [Read-only service runtime](docs/READ_SERVICE_RUNTIME.md) | Modular HTTP service, server provider, configuration, budgets, supported routes and failure behavior |
| [Typesense/indexing runtime](docs/INDEXING_RUNTIME.md) | Local Docker index, modular projection/lifecycle, trusted source requirements, safe preview/rebuild/delta/rollback and evidence |
| [Query/retrieval runtime](docs/QUERY_RUNTIME.md) | Bounded lexical merchant search, safe clarification, release-bound rule extension and guarded serving integration |
| [Ranking/diversification runtime](docs/RANKING_RUNTIME.md) | Eligibility-first deterministic ranking, bounded explicit preferences, owner-sort preservation, safe offering diversity and current R1 composition |
| [Collection composition runtime](docs/COLLECTION_RUNTIME.md) | Executable release definitions, exact destinations, distinct supply, overlap/underfill and shared-budget HTTP composition |
| [Offline evaluation runtime](docs/EVALUATION_RUNTIME.md) | Strict evidence/metrics, complete slice reports, research comparisons, actual-source feasibility and release decisions |
| [Architecture](docs/ARCHITECTURE.md) | How the engines work together and where they run |
| [V1-V3 roadmap](docs/VERSION_ROADMAP.md) | Capabilities, low-cost and maximum-quality profiles, release gates |
| [Technology stack](docs/TECHNOLOGY_STACK.md) | Preferred stack, alternatives, sizing trials and upgrade path |
| [Retrieval and ranking](docs/RANKING_DESIGN.md) | Candidate channels, deterministic policy, learning, diversity and ablations |
| [Category coverage](docs/CATEGORY_COVERAGE.md) | Current taxonomy/source coverage and unresolved mappings |
| [Workflow coverage](docs/WORKFLOW_COVERAGE.md) | Every current subcategory's possible offering workflows, coexistence and evidence gaps |
| [Workflow rule audit](docs/WORKFLOW_RULE_AUDIT.md) | Eighteen reusable rule families, extension boundaries and negative cases |
| [Workflow extension scope](docs/WORKFLOW_EXTENSIONS_SPEC.md) | Detailed rules, optional owner processes and V1-V3 allocation for the four operational gaps |
| [V1 data and APIs](docs/V1_DATA_API_CONTRACT.md) | Exact engine wire schemas, source ports, workflow intents and downstream platform requirements |
| [Platform support audit](docs/PLATFORM_SUPPORT_AUDIT_2026-10-19.md) | Current source implementations, limitations and failed loopback runtime probes |
| [Start readiness](docs/V1_START_READINESS.md) | What can be built now and independent integration/production gates |
| [Acceptance cases](docs/ACCEPTANCE_CASES.md) | Concrete requests, positive/unknown/negative variants and version-specific evidence |
| [Benchmarks](docs/BENCHMARKS.md) | Public comparisons, NEXG evaluation, cost and quality targets |
| [Integration contract](docs/INTEGRATION_CONTRACT.md) | Provider compatibility, references, filters, counts and paging |
| [Data and rollout](docs/DATA_AND_ROLLOUT.md) | Source freshness, event quality, privacy, deployment and fallback |
| [Implementation plan](docs/IMPLEMENTATION_PLAN.md) | Dependency-ordered work packages and acceptance evidence |
| [Decisions and sources](docs/DECISIONS_AND_SOURCES.md) | Architecture choices, unresolved inputs and primary research |

## Versions and operating profiles

| Version | Purpose | Low-cost profile | Maximum-quality profile |
| --- | --- | --- | --- |
| V1 | Trustworthy, useful discovery with measurable baselines | CPU lexical search, deterministic recommendation, workflow policies and taxonomy context | Same pipeline with validated multilingual hybrid retrieval and bounded semantic reranking |
| V2 | Learn which results help guests | Hybrid retrieval and compact learned ranking on CPU | Stronger embeddings, bounded cross-encoder and optional GPU inference |
| V3 | Compete on a measured quality-cost frontier | Distilled models, adaptive compute and efficient learned recommendations | Multi-stage retrieval, domain-trained models and selective advanced inference |

Every version includes both profiles. A profile upgrade changes resource/model configuration behind the same engine API. Introducing a new retrieval backend or feature contract still requires migration and evaluation. Paying for a larger server alone does not create better training data or verified stock.

"Best in the world" is a research objective: exceed named, reproduced references under a declared benchmark and resource envelope. No global superiority is claimed. The F12 verification reports a limited public lexical subset and source outage; wider quality/capacity targets remain unverified.

## Module layout

~~~text
discovery-engine/
  README.md
  docs/                         engine design, contracts, roadmap and evaluation
    history/                    preserved earlier recommendation documents
  engines/
    catalog-eligibility/        fact quality, policy and feasible candidate scope
    query-understanding/       intent, taxonomy and explicit request context
    search-retrieval/          merchant, offering and candidate retrieval
    recommendation/            contextual ranking and future personalization
    collection-composition/    useful L1/L2 sections, diversity and destinations
    evaluation-learning/       offline assessment, events and training feedback
~~~

All six engine directories contain executable modules. Collection definitions, preparation, fact predicates and section selection are separate from application reads/HTTP. Shared contracts/releases, indexing, provider interfaces and adapters remain separate src/ modules. Evaluation-learning now provides offline metrics, evidence checks and decision support; training remains planned. See the [collection module map](docs/COLLECTION_RUNTIME.md#modules-and-execution-bounds) and [evaluation runtime](docs/EVALUATION_RUNTIME.md).

The UI keeps its canonical MerchantCard, L3 results component and filter bar. It consumes the engine only through DiscoveryProvider. No merchant fixtures, seeds, new PostgreSQL instance or second authoritative merchant database are introduced.
