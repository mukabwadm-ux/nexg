# Recommendation engine

Status updated 19 October 2026. The deterministic V1 core and current R1 merchant composition are implemented. Separate src/contracts.ts, features.ts, index.ts and diversify.ts provide policy-gated ranking, request-bound explicit preferences, guarded optional quality/owner sorts and safe comparable-band offering diversity. Read the [runtime](../../docs/RANKING_RUNTIME.md), [plan](../../docs/RANKING_IMPLEMENTATION_PLAN.md) and [verification](../../docs/RANKING_VERIFICATION.md). Source-bound offering/P1/global-sort activation and measured quality remain open.

Order verified eligible candidates according to the guest's task, permitted context and versioned category policy. This remains a distinct part of the broader discovery system.

## Contract

- Current input: Original candidate refs/source facts, release/request binding, verified query/task features and optional explicit current-request context. Eligibility is rechecked by the core. Session/history and model profiles remain later work.
- Output: Ordered unique subset of input references with ranker/model version and safe reason codes. Presentation and operational facts are hydrated by the source adapter.

## Versions

| Version | Planned work |
| --- | --- |
| V1 | Auditable deterministic relevance/task policy, stable ties, cold-start behavior and bounded diversity; optional semantic quality reranking. |
| V2 | Compact LambdaRank on query-grouped editorial and valid exposure-aware outcomes; stronger bounded reranker in quality profile. |
| V3 | Distilled models, sequence/contextual recommendations and adaptive compute when they beat simpler baselines. |

## Acceptance

Preserve explicit sorts and hard constraints; no fabricated popularity; sparse-category fallback; no sensitive cross-domain targeting; model failure returns deterministic same-scope ordering.

Read the shared [architecture](../../docs/ARCHITECTURE.md), [ranking design](../../docs/RANKING_DESIGN.md), [contract](../../docs/INTEGRATION_CONTRACT.md) and [benchmark plan](../../docs/BENCHMARKS.md). Canonical taxonomy and platform source ownership apply to this module.
