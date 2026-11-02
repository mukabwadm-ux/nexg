# Money interactions, states and acceptance

Design only. Inherit R01–R12 and A01–A10 from ../screen-contract.md. This document defines the intended frontend behaviour and future owner dependencies, not an implemented payment API.

## Every figure and list

A query carries authorized merchant/location, actual activity/offering/workflow, currency, financial basis, period or as-of cutoff, timezone, definition version, coverage and source version/high-water mark. The server eventually resolves tenant and grants. The prototype uses labelled fixtures.

Each amount result has a separate quality value: current-confirmed, provisional, merchant-reported, partial, stale, not-collected, insufficient-history, unavailable, unmapped/conflict, not-applicable or restricted. A true confirmed zero says zero. An absent amount uses a dash and a reason. Currency is never inferred from a symbol or an untyped number.

Clicking a measure opens its definition, included/excluded records and the exact filtered list. Search matches safe transaction, invoice, work and external references. Filters include activity, location, period/date basis, type, state, channel and source. Clear resets named defaults. Counts describe the known query result; pagination and partial coverage stay visible. Changing filters does not mutate records.

Statement/report time and settlement-cycle time have separate controls. Aging and current liability snapshots say As of. Comparison percentages require a complete comparable prior cohort and a nonzero denominator; otherwise show Not comparable. A genuine zero day and a missing day have different chart representations.

## Inspectors

A selected row preserves the list context. The detail panel shows identity, record type, source, accepted policy/version, relevant dates, typed amount lines, allocations/reversals, safe linked Work and owner documents, source history and the permitted next step. It never displays full payment credentials or unrelated clinical/discreet details.

Desktop inspectors span the working area's full height beside the list. Their action area stays visible. Long evidence lists scroll internally. Financial documents and complex review use focused tasks on mobile; essential context is repeated there. Keyboard focus enters the task, Escape/Close obeys actual dirty state and focus returns to the invoking control.

## Refund request

1. Open the original confirmed collection. Inspect posted credits, prior confirmed refunds, in-flight obligations and the authoritative refundable amount. A Work cancellation alone does not make the funds refundable.
2. Choose supported items/amount, reason and the applicable accepted policy. Enter exact money in the source currency. Do not accept an ambiguous amount, negative value, unsupported precision or refund beyond eligibility. Concurrent requests and unknown outcomes remain reserved/blocked according to the owner contract.
3. Review original movement, proposed amount, remaining exposure, beneficiary mask, approval requirements and operational case reference. Source-owned/read-only modes show the owner's supported destination.
4. Submit one explicit intent only when current state, scope, policy and grant permit. Use a stable operation identity and an idempotency key; retries with changed payload require a new reviewed operation.
5. Render Requested, Approval pending, Approved or Submitted according to the owner. Only confirmed execution displays Refunded. Rejection preserves the draft/correctable reason where permitted.
6. Outcome unknown shows the operation reference and Check status. Disable another submission or alternative charge against the same uncertain obligation. Reconcile first, including after refresh or return from the provider. A timeout is not a failure or a successful refund.

The frontend can simulate this flow locally. It cannot become the refund owner, widen staff RPCs to new work types or debit a provider.

## Security and advances

An authorization hold, a collected refundable deposit, a booking advance credited to price and a separate service fee are different typed components. The source owns their policy, accepted version and posting/allocation status. A catalogue deposit_kes or reservationFee field only describes intended terms.

For rental return, open the exact rental/condition case. Work confirms physical return; Finance separately confirms and posts any permitted charge allocation and the security return obligation. Approval alone does not reduce that obligation. Proposed deductions require declared policy, evidence and the actual approval/consent path. The UI must not imply that an overdue return automatically grants a charge.

An authorization release is not a cash refund. A collected-deposit refund has its own operation. Unknown release/refund keeps the recorded obligation unresolved and prevents duplicate movement. Security is excluded from sales and payout eligibility until an owner-confirmed allocation changes its classification. The picture's approved deduction is a declared sample fact, not a standard damage tariff.

Reservation advances link to the accepted service/bill and credit it once. Changes to Offering policy apply prospectively as defined by the owner; they do not rewrite accepted customer rights. A confirmed fee collection does not itself confirm a booking allocation. Availability owns that result.

## Customer invoices and balances

An invoice comes from its issuer. The detail shows issued total, confirmed debit/credit amendments, payment allocations, remaining positive balance, currency and due date. Unallocated receipts/customer credits have their own balance and must not be silently applied.

Requested quote, accepted contract value, unbilled work, milestone draft, issued invoice, applied payments and recognized revenue have separate labels and states. A quoted change already included in the accepted invoice is not added again. An overdue value is a subset of outstanding debt, not another amount to add to it.

External read-only invoices have View source/View invoice and Open in Work actions. No local Mark paid button invents a receipt. An allocation, credit note, invoice correction, payment request or reminder requires its own actual issuer/owner capability and evidence. A reminder composer previews the recipient, document and content; no message is sent during this design task or the future local prototype.

Aging uses the issuer's due-date basis and the local business cutoff. Proposed buckets are Not due, 1–7, 8–30, 31–60 and 61+ days overdue, plus No due date. The bucket convention must be accepted by the owning receivables contract before implementation. Disputed/write-off/credit balances keep their source classification and do not become fabricated zero debt.

## Payouts and account setup

Payout details explain owner-defined opening/current entitlement, adjustments, refunds, fees, reserves/holds, prior disbursements and eligibility. Sales-period filters do not rewrite settlement-cycle definitions. Merchant-direct receipts do not automatically enter these amounts.

The source's settlement run, individual beneficiary payout line, provider outcome and receiving confirmation remain separate. A run marked sent does not prove each merchant was paid. No universal weekly/Friday date or payout-now action is introduced.

Show a masked beneficiary and verified/pending state. Account changes go through the secure owner flow in the relevant Business/Settings destination. Never put bank credentials or identity documents in onboarding answers or ordinary browser draft storage. Recheck access, version and beneficiary before any future consequential command.

## Reconciliation, history and exports

Mismatch details show both permitted references, the mismatched basis/amount, current owners and last-confirmed timestamps. An authorized operator can request a check, supply evidence or open a case through a supported command. The latest timestamp cannot decide authority. A posted correction is an explicit new financial fact/reversal, never an edit to settled history.

A statement/export form specifies period or cutoff, location/activity, currency, date basis, columns and coverage. Show expected scope before generation. Distinguish requested, generating, ready, failed, cancelled and expired download. Historical corrections produce a labelled revision. Escape spreadsheet formulas and omit sensitive fields. The local prototype generates labelled sample documents; it does not issue a fiscal receipt or bank statement.

## State matrix

| State | Visible result | Permitted recovery |
| --- | --- | --- |
| Loading | Stable scope and region placeholders, no fabricated zeros | Finish scoped read; keep unrelated confirmed areas |
| Current | Defined amount, date basis and source | Inspect contributing records |
| First use | No matching source records, applicable setup links | Connect/configure supported owner later, or use local sample |
| Filtered empty | Active filters and known result count | Clear filters or change period |
| Not applicable | Relevant tabs omitted | Inspect enabled activity capabilities |
| Setup missing | Exact missing authority, policy, mapping or beneficiary | Open the correct owner; preserve nonsensitive draft |
| Unsupported | Explicit unsupported operation/definition | View available source facts; register owner contract before activation |
| Merchant reported | Named evidence provenance, confirmation pending if needed | Reconcile against owner; do not claim provider payment |
| Partial/stale | Last-confirmed amount and coverage, affected regions flagged | Scoped refresh/check, not blanket retry |
| Unknown outcome | Stable operation reference, uncertain amount and last result | Check status; prevent duplicate command |
| Rejected/failed | Actual source reason and allowed next action | Correct/review/retry only when outcome known and permitted |
| Source disagreement | Both authoritative references and basis | Supported reconciliation case |
| Offline | Cached values with cutoff if allowed; writes unavailable | Reconnect, reload grants/state, revalidate before action |
| Role/access removed | No unauthorized data, export or direct-link access | Clear restricted cache and return safely |
| Expired session | Sensitive data hidden; nonsensitive draft if policy permits | Reauthenticate and recheck current scope/version |
| Concurrent change | Original draft plus latest amount, policy and grants | Fresh comparison/review, no silent merge |
| Dirty close | Actual unsaved fields retained | Keep editing, discard local intent or save safe draft |
| Bulk partial | Per-record/per-target confirmed/rejected/unknown outcomes | Reconcile unknowns; do not replay successes |

Existing payment states include pending, authorised, paid, failed, abandoned and reversed. Existing settlement runs have their own draft/built/checked/approval/files/sending/sent/reconciled/closed/cancelled states. Refund and payout line vocabularies are independently source-defined. Proposed frontend quality UNKNOWN overlays an uncertain observation; this plan does not pretend it is an existing database enum. Security and customer-receivable states are proposed until their owner contracts exist.

## Acceptance before a later build is called complete

| ID | Merchant decision | Required observable result |
| --- | --- | --- |
| MC01 | Load all128 profiles | Correct actual baseline schema/workflow and vocabulary, no irrelevant security/credit/payout tab |
| MC02 | Configure each of193 eligible model bindings and18 schemas | Alternative stays inactive until selected and ready; ordinary/regulated and venue/remote remain distinct |
| MC03 | Food order stock confirmed | Work may confirm automatically; payment remains independently confirmed |
| MC04 | Cash/direct M-Pesa receipt | Explicit provenance; never increases NEXG payout eligibility solely from collection |
| MC05 | Two sources mirror one payment | One canonical movement; source lineage retained |
| MC06 | Booking advance credited to final bill | One receipt and one credit allocation; no duplicate sales or remaining-balance subtraction |
| MC07 | Table reservation with minimum spend | Actual space workflow; no appointment fallback or automatic minimum-spend charge |
| MC08 | Rental return completed | No automatic security release, deduction or refund |
| MC09 | Refund outcome unknown and page refreshed | Same operation reference; no duplicate retry; recorded obligation unresolved |
| MC10 | Proposed deduction lacks approval | Apply/submit blocked with correct owner/evidence path |
| MC11 | Quote accepted, invoice absent | Accepted value shown separately; no invented cash, revenue or due invoice |
| MC12 | Parts/labour and approved change on one invoice | Total reconciles once; work queue estimate excluded |
| MC13 | Invoice180k, credits10k, allocations120k | Customer balance50k; overdue12k remains a subset; unapplied credit6k separate |
| MC14 | Group/session/tour/entitlement | Actual price basis; no participant-as-payment or included-visit resale |
| MC15 | Laundry incoming/processing/outgoing | One commercial root and actual accepted measured quantity |
| MC16 | Freight/storage/retainer | Correct dimensions/period and accepted policy; no inferred conversion or proration |
| MC17 | Financial/clinical/discreet profile | Permitted merchant fees and safe descriptions; no customer banking rails or clinical disclosure |
| MC18 | Payout line sent but not received | Exact source state, no received success or guessed schedule |
| MC19 | Partial history, mixed currencies, zero denominator | Coverage/currencies separated; unavailable comparison, no null-to-zero |
| MC20 | Missing cost/recognition data | No profit, margin or recurring-revenue claim |
| MC21 | Account/grant/revision changes during review | No stale command; draft safely retained and reviewed again |
| MC22 | New known category/unknown operation | Existing shared view renders; unknown financial operation stays unsupported |
| MC23 | Desktop/short viewport/phone | Table retains useful working area, visible amounts/units, adjacent panel actions; readable mobile alternative |
| MC24 | Frontend prototype audit | No backend/provider/Supabase/auth/discovery writes, no actual emails, charges, refunds or payouts |

Verify realistic tasks with merchants, including finding why a payment is missing, explaining a payout, reconciling an unknown refund, and distinguishing invoice debt from unapplied credit. Test keyboard, focus return, accessible names, amount signs, non-colour statuses, target sizes, long labels, 200 percent reflow and reduced motion. Static concepts establish neither interaction success nor WCAG conformance.

## Reservation-money amendment

Apply reservation-money-policy.md/json and RM01–RM10 to actual reservation-bearing work. Advances, separate booking fees, conditional cancellation/no-show charges and refundable guarantees may coexist, with independent triggers and refund rules. Missing configuration creates no fee or default non-refundable outcome. An unknown refund/credit blocks alternative disposal of the same amount. Existing issued service debt is corrected only by its issuer; cancellation alone cannot clear it.
