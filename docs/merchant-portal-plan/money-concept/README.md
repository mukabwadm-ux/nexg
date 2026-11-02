# NEXG Money: adaptive screen plan

31 October 2026. Design and concept images only. No application, backend, database, payment, onboarding or live-provider changes are authorized by this package. Onboarding is connected last. Three screen pictures illustrate the plan; they do not prove working money movement.

## Purpose

Money answers: what was sold or billed, what was collected, what the customer still owes, which amounts belong to the customer, and what Finance can pay to this merchant? It explains each figure through its source records and gives the permitted next action.

The common shell, components and source contracts are shared. Actual offerings, editor schema, workflow, fulfilment, commercial role, accepted policies and source ownership select the contents. A merchant category suggests configuration; it cannot create a financial permission, charge, refund, security account or payout balance.

## Evidence and reconciled decisions

This extends SC_MONEY and MO01 through MO22 in ../screens/05-money.md. Current inputs are hashed in source-manifest.json. The catalogue has 128 subcategories in 21 parents, 193 eligible profile/model bindings, 15 models and 18 registered editor variants. Seventeen editors are defaults. Table reservations are an explicitly configured eighteenth variant.

- Reuse the seven existing owner-supplied financial metric definitions. Proposed measures for collections, customer balances, invoice aging, prepayments and security have separate definitions in metrics.json. They do not overwrite the existing registry.
- Resolve activity from current Offerings configuration and reconciled booking registry. Reuse existing stats definitions, but do not execute older stats activation rules. The older restaurant rule maps table reservations to appointments; the current configuration correctly uses SPACE_RESERVATION and WF_SPACE_RESERVATION_V1.
- Admin Finance reads ledger projections and currently renders seven tabs. Its invoice aging concerns partners owing NEXG. That total has the opposite direction to customers owing a workshop. A merchant-safe ERP/commerce receivables projection is a proposed dependency.
- The legacy merchant Money page is weekly and delivered-order-centric. Its schedule, wording and missing-value fallbacks do not apply to all merchants.
- Existing order/staff refund functions do not establish rental-security authority. No security-owner definition was found in the migration audit. The security concept is explicitly proposed and requires its owner contract.
- Booking payment evidence can be merchant-recorded. Display that provenance; it is not automatically a provider-confirmed receipt.
- Admin module grants and transition controls are not merchant grants. Payment, refund, settlement and payout ownership are independent. No existing legal, tax, fee-rate or regulatory entitlement is inferred here.

## Shared screen anatomy

The existing NEXG sidebar remains Home, Work, Offerings, Availability, Business, Money, Promotions, Insights and Settings. Money is active. The cream canvas, white work areas, charcoal navigation, gold actions and familiar outline icons continue the current portal.

1. Keep the shared business/location header compact. Display the currency, report basis, selected period or as-of cutoff, source coverage and refresh status near the figures. Kenya uses Africa/Nairobi and KES in these concepts. The data contract still carries explicit currency and timezone.
2. Heading: Money, a short workflow-specific explanation, source details, period selector and statement/export action when granted. Never invent a universal Withdraw button.
3. Use shared tabs Overview, Transactions, Balances, Security, Payouts and Statements. Balances, Security and Payouts appear only when their capabilities and sources exist. Invoices are a view within Balances. A named Issues indicator opens exceptions without a permanent empty tab.
4. Show the useful financial questions first. The concepts use four summary measures; that is a layout choice, not a rule limiting information. Descriptor headlineMetricIds are eligible priorities, not mandatory cards. For example, a rental without a security policy shows useful rental charges/collections instead of three unavailable Security cards. Each measure exposes its definition, cohort, currency, date basis, cutoff, exclusions, source and contributing records.
5. The main table receives the working area. A selected transaction, invoice, security record or payout opens one adjacent detail panel. Detail actions stay visible; long lists and evidence scroll inside the relevant region.
6. Controls remain in the table column. Compact surrounding spacing at short heights, including 1280 by 633 CSS pixels. Do not shrink the table into a small strip to fit the header. Target verification sizes also include 1920 by 1080, 1672 by 941, 1440 by 900, 1280 by 720 and 390 by 844.
7. On phones, retain reference, amount/currency, counterparty or safe work description, date and status. Open detail and review as focused full-page tasks. Every destination remains reachable.

The overview favours an inspectable table and settlement/balance explanation. A small trend is optional when it answers a useful question and the correct history exists. Do not add a large decorative chart or imply that a payout balance is a sales trend.

## Views and interactions

| Area | Information and interactions | Planned states |
| --- | --- | --- |
| Overview, MO01–MO03 | Selected financial measures, posted/provisional distinction, source/as-of, period vs current balance, definitions and record drill-down | Loading per measure; confirmed zero; no records; unavailable; partial/stale; restricted; incompatible basis |
| Transactions, MO04–MO08 | Search work/payment/reference; filter type, state, channel, source, activity and location; sort date/amount; cursor paging; movement detail, allocation, original/reversal links, owner documents | Confirmed, authorized, processing, failed, reversed; source outcome unknown; filtered empty; duplicate mirror; unmapped record |
| Customer balances, extension of MO05/MO07 | Invoice total, credit notes, applied payments, amount due, unallocated customer credit, due date, aging basis; customer/work drill-down; owner-issued invoice | Draft/issued/partly allocated/settled/voided/disputed as supported; missing due date; unknown allocation; partial ERP coverage |
| Refunds, MO09–MO10 | Eligible original movement, source-refundable amount, selected items/amount, reason, policy version, review, owner approval/submission, operation tracking | Draft, invalid, approval pending, approved, submitted, owner-confirmed, rejected, outcome unknown; cancellation remains independent |
| Security, MO11 | Collected deposit vs authorization hold; original funds, approved charge allocation, confirmed refunds/releases, remaining recorded obligation, work/condition case | Authorized, collected, under review, approved allocation, release/refund requested, confirmed, expired authorization if owner confirms, unknown result |
| Payouts, MO12–MO14 | Separately defined opening/current payable, holds/reserves, eligible amount, included transactions, adjustments, masked beneficiary and line-level confirmation | Setup missing, verification/change pending, scheduled only with owner date, queued, sent, paid/received where actually confirmed, failed/returned, held, unknown |
| Issues, MO15–MO16/MO21–MO22 | Mismatch amount, affected references, owner, last confirmed state, operation or evidence; check status, open case or repair mapping | Open, assigned/waiting, resolved with owner evidence, rejected, stale; no arbitrary mark-resolved or retry of unknown money movement |
| Statements/exports, MO17–MO18 | Period, scope, currency, date basis, revision, included/excluded coverage, issued document or generated report; permitted columns | Requested, generating, ready, failed, expired link, corrected version; source-issued fiscal documents remain distinct from sample reports |
| Connections/history, MO19–MO20 | Fact owner, read/write mode, canonical external references, last confirmed sync; immutable source entries and approval history | Native, externally owned, mixed with declared field ownership, stale, partial, unmapped, revoked access; history is not an editable balance |

Default primary actions follow the current task: inspect payout breakdown, check an uncertain refund, or view an invoice. Show a finance command only if the source supports it and the actor has the exact scoped grant. The later frontend build simulates permitted actions and labels all data Sample preview.

## Workflow adaptation

| Configured work | Money view and statistics | Essential exclusions and branches |
| --- | --- | --- |
| Product/menu order | Posted sales, confirmed collections if measurable, refunds/fees, payment channel and settlement where enabled | Stock/source confirmation is not payment. Cash/direct merchant receipts do not become NEXG payout funds. Item counts are not payment counts. |
| On-site appointment | Service bill, credited booking advance, remaining balance, cancellation/no-show decision where contracted | A booking fee may be a credited advance or separate agreed charge. Attendance/completion alone proves neither collection nor revenue. |
| Remote session | Provider service bill and balances, same financial components | No invented venue, vehicle or travel charge. |
| Field visit | Accepted call-out/service scope, approved changes, invoice/collection and balance | Travel is charged only when actually contracted. Coverage/arrival is not money confirmation. |
| Rental | Hire charges, contract/corporate billing and extensions; separate Security section | Security authorization is not cash collection. Return/inspection does not itself approve a deduction, release or refund. |
| Transfer/greeter | One root trip/greeting charge with actual inclusions and approved extras | Driver/vehicle allocation does not create duplicate sales. Greeter-only work has no vehicle revenue. |
| Tickets/group session | Accepted participant/ticket price, credits/refunds and occurrence reference | Participants, tickets, bookings and payment movements remain different grains. Included passes do not resell a visit. |
| Table/space | Reservation charge or advance, minimum-spend term, final bill and one credit allocation | A minimum spend is not an automatic charge. Do not record both the advance and its credited portion as two sales. |
| Shared/private tour | Departure/itinerary billing, participant vs private price, supplier/agent breakdown if contracted | Agent commission and gross customer package funds require explicit principal/agent basis. Included transport/supplier legs are not new revenues. |
| Quote/custom production | Accepted scope, approved changes, milestone invoice, prepayment, collection and due balance | A requested/accepted quote is not itself recognized revenue, an issued invoice or cash. Do not add an approved change again if already in invoice total. |
| Laundry/linked service | Confirmed measured quantity times accepted price under its policy, approved adjustment and one root bill | Incoming, processing and outgoing roles do not produce three sales. An estimate is not the final measured bill. |
| Workshop/service job | Agreed assessment, parts/labour, approved changes, staged invoice and customer balance | Queue estimates and unapproved work create no receivable. Work status, invoice status and payment status remain independent. |
| Membership/retainer | Billing period, plan invoice/collection, unapplied credits, renewal and owner recognition if supported | Cash is not automatically earned subscription revenue. Included redemptions are not new sales; no invented proration or MRR. |
| Freight | Accepted rate/chargeable measure and independent agreed carrier/customs/insurance lines | Never convert kg, volume, pallet or container amounts without the actual contract. Custody legs do not duplicate commercial work. |
| Storage | Contracted space unit and billing period, issued charges, collection, balances and approved adjustments | Ending custody and settling money are independent. No automatic proration or deposit release. |
| Regulated enquiry/referral | Permitted merchant service/referral fees and contract-backed provider summaries only | No customer bank, remittance, FX, loan or wallet balances, underwriting, trading or financial rails from taxonomy. |

The 128-row profiles files include every parent/subcategory, original specialty needs, exact question/rule references, baseline schema/workflow, candidates, financial components, stats and exclusions. Parent refinements preserve discreet billing, health privacy, concierge procurement funds, included visits and dimensional billing.

## Money and stats truth

Sales, collections, invoice allocations, customer debt, customer security, merchant payable, sent payout and confirmed receipt have distinct identities and date bases. Every displayed amount includes currency, source state and scope. Unknown is never zero. Missing history cannot become a flat zero trend.

Existing Finance metrics remain owner measures. The frontend may format values and check sample arithmetic, but cannot create authoritative payable or recognition by subtracting the visible cards. The payout inspector may include opening balances and past-period adjustments that do not belong to the selected sales period.

New proposed metrics specify grain, owner, eligible facts, reversal/correction treatment and dependent policies in metrics.json. Invoice aging uses remaining positive debt at the as-of cutoff and an authoritative due date. Missing due dates stay Unscheduled; they do not enter an overdue bucket. Unapplied receipts and customer credit remain separate until an authorized allocation. Confirmed credit notes and actual refund movements are distinct.

Hybrid activities can share a money transaction, invoice or customer work root. Deduplicate native/ERP mirrors by canonical fact identity, and allocate shared charges once. Never add participant counts, visits, assets, kg or credit units into a monetary denominator. Historical activity retains its accepted configuration and commercial-policy versions.

Recognized revenue or contribution margin appears only with its owner definition and complete compatible cost/recognition evidence. Money does not label payable, invoice value or cash as profit. There is no default revenue-recognition, tax, fee percentage, payout schedule, damage tariff, mileage charge, interest or conversion rule in this plan.

## Ownership and source modes

The planned merchant Money source exposes tenant/location-safe read models. Admin fin_* projections, admin accountant grants and platform/rider money are not automatically safe for merchants. Each leaf authority, finance.payment, finance.refund, finance.settlement and finance.payout, is gated independently. Security, receivables and recognition need their named contracts too.

Native records, existing ERPs/APIs, imported history and permitted manual evidence feed normalized facts through declared adapters. A payment webhook and an ERP invoice are not interchangeable authorities. Merchant evidence remains labelled Merchant recorded until the owner accepts/reconciles it. A newer timestamp cannot overrule a conflicting financial authority.

A descriptor declares the commercial role and collection channel: NEXG-collected, merchant-direct, agent/pass-through or mixed. Mixed views expose the allocation basis. Direct collections can be useful to a merchant without creating anything payable by NEXG.

## Configuration and future categories

The proposed Money descriptor includes configuration version, actual schema/workflow/model, method, commercial role, billing unit/period, accepted policy refs, source owner per fact, supported metric IDs, privacy vocabulary, permitted action refs and layout priorities. It contains no credentials and grants no capability.

Resolve the current offering and answer rules first. Choose the descriptor, apply independent ownership/grant/coverage gates, then select useful stats and views. Optional security, receivables, recurring billing, commissions or settlement activate only when actual configuration and owner contracts support them. Wrong/missing/contradictory configuration shows a specific setup issue.

A new category using known behaviour registers one profile binding and tests its applicable branches. A new metric or financial operation first needs a versioned single-owner contract, field mapping, evidence rules, states and tests; it stays unsupported until then. Plan the eventual onboarding mapping now, implement the onboarding UI last. Do not add 128 separate Money pages.

## Delivery sequence for a later frontend build

1. Define merchant-safe MoneySource read models and additive proposed metric/policy contracts. Keep runtime Finance owners intact.
2. Implement descriptor resolution and isolated local fixtures, including native, merchant-direct, ERP read-only, partial and unavailable sources.
3. Build the shared Money shell, summaries, transaction/receivable/security/payout tables, definitions and fixed-action inspectors.
4. Implement local review/submission/reconciliation simulations, same-record Work/Offerings/Settings handoffs and scoped statement/export flows. No real movement.
5. Verify every 128 baseline profile and 193 eligible model bindings, all 18 schemas, conditional/missing/contradictory inputs and novel-category rejection.
6. Verify the merchant journeys and short-viewport content bounds before declaring the frontend complete. Only a later separately authorized integration phase connects real Finance/ERP/payment commands.

The full state/interaction contract and acceptance cases are in interactions-and-acceptance.md. The exact three image prompts and arithmetic fixtures are saved separately. No extra Money concept images are planned.

## Plan package

- profiles-128.md and profiles-128.json enumerate every current category/subcategory.
- descriptors.json covers all18 editor variants; metrics.json references7 existing owner measures and20 explicitly proposed measures.
- interactions-and-acceptance.md defines flows, states and MC01–MC24.
- frontend-and-source-contract.md defines the local frontend boundary and future owner dependencies.
- concept-fixtures.json and concept-prompts.json/.md preserve the three examples and their exact generation prompts.
- verification.json records30 design/reference/arithmetic checks. Images remain illustrative rather than runtime proof.

## Reservation-money clarification

[Reservation-money policy](reservation-money-policy.md) distinguishes a separate booking fee, an advance credited to the bill, a conditional cancellation/no-show charge and a refundable guarantee. The policy applies to actual reservation-bearing offerings across categories. Merchants with no such component retain their ordinary Money view. Missing refund terms are different from an explicitly accepted non-refundable policy; no penalty or retention rule is inferred. Existing financial records remain visible. See RM01–RM10 for the design cases.
