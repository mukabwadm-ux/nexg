# Frontend Money source contract and build boundary

Proposed interface only. This file does not create APIs, permissions, events, ledger postings or a real connector. The design package is complete for review; runtime UI/provider acceptance remains unimplemented.

## Planned module boundary

The eventual route is /merchant-live-preview/money in the existing MerchantLivePreviewShell. Proposed module responsibilities are descriptor resolution, typed read models, MoneySource/local fixtures, shared views, inspectors/review forms and state/acceptance verification. Extend the shared sidebar compatibly when implementation is authorized. The current legacy merchant Money route and admin Finance console remain untouched by this planning task.

MoneySource is a frontend boundary. A local implementation demonstrates the approved screens without application network writes. A later backend adapter can implement the same view contract through approved merchant-safe owner interfaces. It must not connect arbitrary fin_* admin projections or read provider payloads in components.

## Required view-model envelope

| Field group | Meaning |
| --- | --- |
| Identity | Stable canonical opaque fact/entity ID and version; human transaction/work references are separate display values. Major real IDs follow the existing UUIDv7 contract. Sample fixture keys are not production IDs. |
| Scope | Merchant resolved from authorized session in a real adapter; location, activity, actual offering/schema/workflow/model/method; actor capabilities and permitted references. |
| Money | Exact integer amount_minor and explicit currency; currency metadata/precision reference, sign/type and approved rounding/display policy. Avoid floating-point calculation and hard-coded universal minor-unit factors. |
| Time | Explicitly zoned instants, effective/observed/posting dates, report basis, period or cutoff, configured merchant timezone. Concepts use Africa/Nairobi. |
| Provenance | Fact owner, source/record version, canonical external mapping, acceptance/evidence state, coverage and source high-water mark. |
| State | Owner business-state dictionary plus frontend quality/observation state. UNKNOWN is not inserted into an existing SQL enum by this design. |
| Calculation | Owner definition/version, cohort, contributing/excluded references, policy version and reversal/allocation relationships. |
| Actions | Named owner action references with enabled/disabled reason, current-state preconditions, permitted scope and required approval/evidence; no generic force_state. |

A monetary difference can be displayed only when the issuer defines its basis. Root work, invoice, allocation, movement, customer obligation, settlement run and beneficiary payout line are separate grains. Native/external mirrors share a canonical identity and count once.

## Owner map

- Work status and operational evidence come from the Work/fulfilment owner.
- Offering/setup fields describe intended price, deposit and booking terms. Accepted terms need immutable policy/version references.
- Payment receipt and refund execution come from their respective financial owners. An uploaded receipt is separately labelled merchant evidence.
- Invoices and credit amendments come from the actual issuer. Customer receivable/credit and allocation measures come from their declared receivables owner, which may be a contracted ERP.
- Security obligations and their posted charge allocations/releases/refunds need a dedicated approved owner contract. Taxonomy or a deposit amount does not supply it.
- Merchant settlement entitlement and payout execution use independent Finance authorities and merchant-scoped projections. Customer deposits, supplier funds and platform/rider balances are not implicitly merchant entitlement.
- Revenue recognition and supplier/customer-fund obligations need their own accounting contracts. No profit or earned-revenue estimate is inferred by the screen.

One fact has one current authoritative owner. Adapters can reference another fact, not mutate its owner's data. A disagreement is an explicit reconciliation case, not timestamp-based overwrite.

## Proposed MoneySource operations

All read results retain the envelope, scope, coverage and per-region quality. Pagination has a stable cursor under its query snapshot.

| Operation | Result |
| --- | --- |
| resolveContext / loadSummary | Descriptor, applicable views/metric priorities, source capabilities, owner-supplied measures and independent quality |
| queryTransactions / getTransaction | Canonical movements, safe linked references, amounts/allocations and owner state |
| queryCustomerBalances / getInvoice | Issuer/cohort totals, amendments, applied payments, due amount, due-date basis, aging and unallocated credits |
| querySecurity / getSecurityRecord | Authorization vs collection, accepted policy, recorded obligation, posted allocations, confirmed refunds/releases and uncertain operations |
| querySettlements / getPayout | Entitlement basis, opening/adjustment/hold lines, included records, beneficiary mask and line-level owner confirmation |
| inspectMetric / queryContributors | Definition/version, facts/exclusions, date basis and exact contributing scope |
| getIssues / getHistory | Permitted mismatch/case and source audit references; no editable ledger balance |
| requestStatement / getExport | Scoped sample generation in the prototype; owner-authorized report/document in a real adapter |
| previewIntent | Current permissible amount, exact policy/beneficiary/state/grant/version checks and impact, without executing money movement |
| submitIntent | Explicit local simulation, or separately approved owner command later; stable operation identity and pending/confirmed/rejected/unknown result |
| getOperation / reconcileOperation | Existing operation status, no replay of an uncertain command |
| refresh | Scoped confirmed read; must not clear unrelated known facts or fabricate zero |
| saveDraft / discardDraft / resetOwnSample | Nonsensitive local intent and fixtures only; no payment credentials or cross-screen/user data deletion |

A method's presence is not a grant. Unsupported methods return a typed unsupported reason and source destination. No source handler or accepted policy means no enabled money command.

## Local frontend simulation

Namespace samples by schema version, sample merchant/profile, location and activity; preserve pending operation references separately from drafts and confirmed snapshots. Review and apply have expected versions and stable operation IDs. Another tab or an Offering-policy update invalidates the previous review. Reconciliation of an older uncertain command cannot silently overwrite a newer financial snapshot.

Persist only safe sample data and nonsensitive intent. Do not cache real financial data after access removal or put account credentials in localStorage/onboarding. Simulate storage failure, offline source, stale/partial data, conflicting owner facts, revoked access, concurrent review, rejected execution and unknown outcome. Preserve correctable input and exact scope.

Read-only ERP records expose View invoice/View source and permitted Work links. A local Mark paid button cannot create issuer truth. No payment, refund, security release, payout, document issuance or outbound message is actually performed by the prototype.

## Reconciled gaps before a real connection

1. Define tenant/location-safe merchant read models, excluding admin receivables and platform/rider balances.
2. Approve the proposed customer-receivable, security, recognition and allocation measure contracts that are applicable. Existing Finance metric IDs remain owner measures.
3. Establish independent supported commands and grants for payment/refund/settlement/payout and any new security operation. Existing staff order RPCs are not reused by assumption.
4. Bind accepted/versioned commercial policy, exact currency metadata and invoice/payment/credit allocation rules.
5. Establish canonical mapping, event/version semantics, coverage and discrepancy handling for each ERP/API source. Imported history and merchant evidence retain their origin.
6. Materialize read permissions, audit, offline policy, idempotency, optimistic concurrency and sensitive-data handling at the real owner boundary. UI controls are not security boundaries.

These are declared integration dependencies, not open choices blocking the current plan or the three concept pictures. Onboarding mapping and live integrations are later implementation scopes.
