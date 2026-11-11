# Search retrieval engine

Status updated 19 October 2026. The [F06 Typesense/indexing adapter](../../docs/INDEXING_RUNTIME.md) and [F07 bounded merchant query/retrieval slice](../../docs/QUERY_RUNTIME.md) are implemented. This module owns pure lexical matching and the candidate port. The Typesense serving adapter remains in src/adapters/typesense and current source validation in the application layer. Real-server integration passes, but the private real-catalog preview cannot serve public queries; source-certified R2 and general offering search remain open.

Find a bounded set of possible merchant/offering references, with relevance signals and retrieval provenance.

## Contract

- Input: Typed intent, policy/access scope, versioned derived index and candidate budget.
- Output: Deduplicated source references and safe retrieval features; candidates remain subject to authoritative validation.

## Versions

| Version | Planned work |
| --- | --- |
| V1 | Typesense exact/lexical retrieval, field controls and item/merchant modes; optional compact hybrid quality path. |
| V2 | Hybrid lexical/vector fusion with measured restrictive-filter recall and larger allowed fact vocabulary. |
| V3 | Domain-trained candidate channels, adaptive budgets and an optional Vespa replacement trial. |

## Acceptance

No hidden scope broadening; candidate recall and ANN recall measured separately; index deletes/versions/freshness enforced; no top-K count presented as catalog total.

Read the shared [architecture](../../docs/ARCHITECTURE.md), [ranking design](../../docs/RANKING_DESIGN.md), [contract](../../docs/INTEGRATION_CONTRACT.md) and [benchmark plan](../../docs/BENCHMARKS.md). Canonical taxonomy and platform source ownership apply to this module.
