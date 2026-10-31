# Money

Screen ID: SC_MONEY. Status: proposed design. Planned after Business. Inherits the shared screen contract. Financial figures, permissions, policies and transitions require their existing Finance/ledger/provider owners; this specification creates none of those authorities.

## Purpose and boundaries

Explain the merchant's relevant transactions and how confirmed charges, deductions, refunds and settlement relate. Help an authorized user find a specific record, inspect its calculation and resolve a real exception. Sales, customer payment, merchant entitlement, payout initiation and settled receipt are separate facts.

Money shows financial records for enabled commercial capabilities. A financial-services taxonomy selection does not authorize NEXG banking, remittance, lending or regulated transactions. Such merchants see their actual NEXG-related transactions or permitted provider summaries through explicit contracts, with unrelated financial operations outside this screen.

## Layout

Header: authorized business/location, period, timezone, currency and source coverage. Compact summaries use precise labels such as confirmed sales, refunds and fees for that period and a separately sourced settlement balance. Never sum currencies or substitute unavailable values with zero.

Views: Overview, Transactions, Payouts/settlement, Statements and Issues where supported. A transaction list opens a detailed breakdown and links its work reference. Rental deposit/security records have a separate relevant section only with a real deposit owner and permission. Keep financial setup blockers visible but secondary to transaction explanation.

## Feature inventory

| ID | Feature/data | Action and authority |
| --- | --- | --- |
| MO01 | Financial overview | Read Finance-defined totals, definitions, period, currency and coverage; explain whether figures are posted, provisional or unavailable. |
| MO02 | Period, location and currency | Filter within authorized scope. Keep business-day reporting timezone distinct from settlement-run dates. |
| MO03 | Breakdown definitions and source | Inspect included records, exclusions, deductions and update time; no unsupported formula inferred by the UI. |
| MO04 | Transaction list/search/filter/sort | Reference, work type, event date, amount/currency, financial status and source; preserve context and reveal filtered empty. |
| MO05 | Transaction detail | Owner-sourced line items, quantities, taxes/fees/refunds where defined, merchant share and provider/external references safe to display. |
| MO06 | Work and customer-payment links | Open permitted associated Work record or approved payment record. Do not reveal card/secret account details. |
| MO07 | Receipts/invoices/tax documents | View/download only owner-issued documents with their confirmed state and scope. A generated preview is not an issued fiscal document. |
| MO08 | Pending/failed/unknown payment | Explain provider-confirmed state and operation reference; reconcile before a retry or alternative charge. |
| MO09 | Refund request/detail | Identify refundable transaction and requested scope; validate policy, available amount and approval permission. Show requested/approved/submitted/confirmed/rejected/unknown distinctly. |
| MO10 | Cancellation relationship | Open the relevant Work cancellation and financial consequences. Operational cancellation does not mark a refund paid. |
| MO11 | Deposit/security record | Show held/authorized/collected/released/refunded states only if owner-defined. Link rental and condition case; release/deduction uses approved financial command and policy. |
| MO12 | Settlement and payout list | Period, payable basis, currency, beneficiary mask, status and confirmed references. Scheduled date appears only when sourced. |
| MO13 | Payout detail | Explain included transactions, adjustments, deductions, disbursement and bank/provider confirmation. A payout total is not assumed equal to a sales total. |
| MO14 | Payout setup/change | Secure owner-approved account flow, verified beneficiary and any required review; show pending change. Never store credentials in onboarding answer JSON. |
| MO15 | Reconciliation issues | Compare permitted records under declared data authority; identify mismatch, owner and safe resolution action. Do not use latest timestamp to settle a disagreement. |
| MO16 | Dispute/case | Open a scoped financial case and allowed evidence; use approved support/approval path and distinct case state. |
| MO17 | Statements | Generate/download a specified period/currency/location statement with data coverage and generation status. Historical correction produces an explained revision. |
| MO18 | Exports | Choose authorized columns and filters, preserve units/currency/timezone, restrict sensitive data, track generation/expiry. |
| MO19 | Accounting integration | Show per-data owner, read/write mode, mappings and last confirmed sync. Open Settings → Connections to configure or repair. |
| MO20 | Audit/history | Source events, approvals, references and relevant versions; no editable ledger history or client-generated settled state. |
| MO21 | Notifications and issue reminders | Link to supported pending financial issues; no fabricated payout deadline or urgency. Notification delivery remains confirmed separately. |
| MO22 | Refresh/reconcile supported operation | Read back actual source/operation state. A manual reconciliation command is permission-checked, explicit and online; unavailable source leaves outcome unknown. |

## Financial state rules

The UI renders owner-defined values and state dictionaries through normalized view models. It must not collapse authorized, captured, processing, paid, refunded, payable, payout sent and payout received into one success label. Some of these states may not exist for a particular provider or contract; do not manufacture them.

Every amount has explicit currency and declared minor-unit semantics. Mixed currencies remain separate. Exact rounding, exchange rate, fee, tax, deposit, settlement schedule and cancellation policies remain references to approved owner rules. A missing rule disables the dependent command with a clear reason while unrelated confirmed records remain useful.

All inherited states apply. A partially synced statement identifies included records; a stale payout status keeps its last-confirmed time. Unknown payment/refund outcomes require reconciliation. Refund limits and ledger writes are checked by the server; a successful UI validation is not money authority. Payment-provider failure is isolated from viewing authorized historical work.

## Journeys and side effects

1. **Find a missing rental payment:** filter work reference → inspect transaction and payment source → see confirmed or unknown state → open reconciliation case/operation → owner confirms result → refresh related Work financial summary and reports.
2. **Refund request:** open relevant transaction → choose permitted amount/items/reason → inspect policy and approval path → submit once → see pending → approved owner/provider confirms or rejects → update breakdown. The rental's operational cancellation has its own state.
3. **Payout question:** inspect settlement period → open included records/deductions → compare masked beneficiary and provider confirmation → raise case with references. No weekly-Friday promise is added unless actual settlement configuration says so.
4. **External accounting:** inspect posted NEXG transaction → view external reference and sync status → repair mapping in Settings if needed → reconcile under declared authority. Duplicate event delivery cannot post duplicate business money.

Confirmed financial events update Work's authorized financial fragment, Home summary and Insights according to their metric definitions. Money does not rewrite operational completion, inventory or staff availability.

## Mobile and UX rationale

Mobile summaries retain definitions and period. Transaction rows keep reference, amount/currency, date and state; full breakdown opens in a readable page. Use aligned amounts and consistent signs, with text explanations of deductions. Avoid charts that obscure the audit trail.

Recognition supports familiar transaction and payout references. Proximity places fees/refunds beside the affected calculation. Progressive disclosure keeps an inspectable breakdown available without flattening every financial line into the overview. Clear feedback avoids mistaking a submitted request for a completed money movement.

## Acceptance scenarios

- MO-T01: operator without finance grant cannot read money through UI, direct links or export; permitted Work tasks remain available.
- MO-T02: unknown charge/refund shows the operation reference and reconcile action without issuing a duplicate on retry.
- MO-T03: rental deposit detail is absent when the capability lacks a deposit owner; enabling a taxonomy field does not create deposit control.
- MO-T04: two currencies remain separate; partial external accounting coverage is explicitly labelled.
- MO-T05: sales period and settlement period produce their separately defined records without implying payout timing.
- MO-T06: future category reusing commercial transactions gains compatible financial components; novel regulated operations cannot be enabled through manifest-only changes.

Apply all profiles and inherited state cases. Real Finance/provider contract tests remain future implementation work.
