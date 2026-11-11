# Query understanding engine

Status updated 19 October 2026. The pure V1 lexical parser and internal reviewed-rule contract are implemented in src/index.ts. Merchant query integration and safe clarification pass [verification](../../docs/QUERY_VERIFICATION.md). Read the exact [runtime scope and limits](../../docs/QUERY_RUNTIME.md). No default unreviewed alias, translation or spelling correction is active; general language/operational/offering acceptance remains open.

Translate text and explicit context into a typed request, preserving selected filters and unresolved meaning.

## Contract

- Input: Bounded query, canonical taxonomy, surface/entity mode, supported capabilities and permitted request context.
- Output: Normalized intent, candidate category distribution where ambiguous, explicit constraints and unresolved/unsupported fields.

## Versions

| Version | Planned work |
| --- | --- |
| V1 | Rules, exact names, curated aliases/typos, English/Kiswahili terms and supported budget/date parsing. |
| V2 | Evaluated compact classification/embedding support and permitted current-session context. |
| V3 | Locally trained multilingual intent and optional expensive interpretation for difficult requests under a bounded profile. |

## Acceptance

Inferred intent cannot override selected taxonomy or a hard filter; date/time/budget units stay explicit; unsupported facts are never claimed applied.

Read the shared [architecture](../../docs/ARCHITECTURE.md), [ranking design](../../docs/RANKING_DESIGN.md), [contract](../../docs/INTEGRATION_CONTRACT.md) and [benchmark plan](../../docs/BENCHMARKS.md). Canonical taxonomy and platform source ownership apply to this module.
