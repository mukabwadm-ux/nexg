# Image review

Date: 1 November 2026. Method: direct visual inspection of every selected generated image, followed by file-integrity and source-coverage checks. This is a design review, not application or accessibility testing.

## Selected results

| ID | Inspected result | Limit of the picture |
| --- | --- | --- |
| INS_01 | Correct Insights navigation, mixed activity sections and internally consistent weekly totals. Comparison is off. | Evidence and operational links are illustrative. Setup/publication, discovery and retention states are specified but not separately pictured. |
| INS_02 | 372 unit total matches weekly/category values. Variant table is explicitly a subset. Final refinement puts Promise due in period directly in the Ready on time card. | Historic variant identity and event evidence still require implementation. |
| INS_03 | Confirmation label corrected to Requests confirmed. Outcome and service totals reconcile; capacity is 360/480 hours. | Request and scheduled populations are separate fixtures despite coincident confirmation/scheduled totals. Table/chart accessibility and event completeness remain untested. |
| INS_04 | Reserved 1,240/2,000 and actual 1,080/2,000 reconcile; resource values and exclusions agree. Final refinement retains Completed rentals and its separate date basis. | A raster does not validate overlapping interval calculations. |
| INS_05 | Space-hours and percentages reconcile; people remain separate. | Reservation count should retain the source-defined historical confirmation cohort and cancelled outcomes. The image does not establish actual use or customer-facing capacity. |
| INS_06 | Request-cohort rate and production subtitle corrected. Production acceptance is distinct; Work column has navigation links. Final refinement shows 3 of 30 due jobs and pagination. | All status/cutoff semantics require owner evidence. |
| INS_07 | On-time/late/unknown totals sum to 100; pieces and mass are separate. Missing evidence is explicitly Unknown. Final refinement shows 3 of 100 rows and pagination. | Only freight is pictured. The complete source mappings, not a universal milestone chart, define other operational models. |
| INS_08 | Place counts/attendance and entitlement counts remain separate. Redeemed passes may predate the reporting period. Final chart title states By week; View occurrences remains the detail entry point. | Tour-specific provider states remain in the written plan. |
| INS_09 | Event ratios, observation cutoff and attributed orders are explicit. Value is unavailable. | Synthetic event counts do not establish ingestion, deduplication, attribution correctness or causal lift. |
| INS_10 | KES credits minus debits equals net posted credit. Payouts and pending items are explicitly separate. | The proposed source name describes a required Finance contract, not an existing approved reporting projection. Additional posting classes cannot be omitted in implementation. |
| INS_11 | Capacity-group table, definition, 240 excluded hours and 62% agree. | Group rows are evidence summaries; View intervals must reveal actual authorized source intervals before runtime acceptance. |
| INS_12 | Partial appointment evidence has timestamp, invalid comparison is disabled and schedule coverage is separate. | This is a full-content portrait reference; viewport scrolling, touch targets, announcements and recovery must be tested on a device. |

All eleven landscape outputs are 1,586 × 992 pixels. The mobile output is 876 × 1,796. They are smaller than the approximate requested canvas sizes; inspect at native size. Font/icon details, wordmark treatment, recurring sample badges and header spacing vary slightly across scenes. The implementation must use shared NEXG components, not reconstruct inconsistent image details. The written screen contract remains authoritative.

## Corrections and provenance

The first overview invented a previous-period legend with an overlapping date range. A targeted edit turned comparison off and removed unsupported legend entries. The appointment card needed the measure name Requests confirmed. The quote/production scene needed a request-cohort rate label, an explicit production acceptance subtitle and Work links. All three selected corrections were inspected after generation.

Initial prompts are in [image-prompts.json](image-prompts.json). Exact correction prompts and their inputs are in [image-corrections.json](image-corrections.json). Five final scope/label refinements are in [image-refinements.json](image-refinements.json), with versioned sibling PNGs preserving earlier workspace assets. Every selected refinement was inspected after generation. [image-manifest.json](image-manifest.json) records selected source paths, retired source paths, dimensions and SHA-256 hashes. Generated originals remain at the tool output location; selected assets are copied into this project.

No comparison series, live export, saved-view persistence, source repair, privacy policy, financial reconciliation or accessible chart interaction was executed. [validation-plan.md](validation-plan.md) lists the future runtime checks and owners. These limitations do not prevent reviewing the proposed experience, but they prevent treating pictures as proof of functioning reporting.
