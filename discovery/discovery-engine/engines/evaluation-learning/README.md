# Evaluation and learning engine

Status: F12 offline evaluation implemented, 19 October 2026. Release acceptance remains evidence-gated; learning/training and live interaction adapters remain planned. Read the [runtime](../../docs/EVALUATION_RUNTIME.md), [plan](../../docs/EVALUATION_IMPLEMENTATION_PLAN.md) and [verification](../../docs/EVALUATION_VERIFICATION.md).

Measure quality/cost and validate judgment/run evidence. The pure src modules separate strict contracts, graded metrics, slice coverage, matched paired comparisons, bounded workload/cost accounting, release gates and an explicitly untuned BM25 research reference. Filesystem, Typesense and actual-source process adapters live outside this core. Production ranking imports none of it. Candidate training/promotion remains future work; the evaluator can only recommend review, hold or reject.

## Contract

- Input: Pinned benchmark manifests, approved source-time snapshots, editorial judgments, minimal events and owner-verified outcomes.
- Output: Per-task/category reports, confidence intervals, cost/latency profiles and immutable candidate model artifacts with lineage.

## Versions

| Version | Planned work |
| --- | --- |
| V1 | NEXG 16/98 coverage, lexical/content references, exposure quality and reproducible CPU/quality baselines. |
| V2 | Temporal training/evaluation, exposure-aware labels, shadow/online experiments and controlled model promotion. |
| V3 | Research references, distillation/sequence/ANN trials and Pareto-frontier reporting. |

## Acceptance

No test-set tuning, future-data leakage or fake transaction labels; preserve unknown judgments; privacy and category coverage; training cannot self-promote into production.

Read the shared [architecture](../../docs/ARCHITECTURE.md), [ranking design](../../docs/RANKING_DESIGN.md), [contract](../../docs/INTEGRATION_CONTRACT.md) and [benchmark plan](../../docs/BENCHMARKS.md). Canonical taxonomy and platform source ownership apply to this module.
