# Money view and transaction refinement — verification

31 October 2026. Frontend-only local sample; no real payment, refund, payout, ERP, onboarding, discovery or Supabase work was performed.

## Results

- `node scripts/smoke-money-transactions.cjs` — **PASS:** all 128 default specialties opened the Transactions view with the registered workflow's work label, transaction-specific summaries and payment details; no browser errors or non-read network requests.
- `node scripts/smoke-money-preview.cjs` — **PASS:** distinct Overview, Transactions and Statements purposes; transaction search, method filtering and scoped totals; selected-period statement download; unknown refund/reconciliation; existing rental security, reservation and invoice flows; context returns; 128 default specialties; mobile reflow; no browser errors or non-read requests.
- `pnpm --filter @nexg/web exec vitest run components/merchant/money/model.test.ts components/merchant/money/transactions.test.ts components/merchant/availability/model.test.ts` — **3 files, 51 tests passed** (16 Money model, 4 transaction, 31 Availability). Transaction tests check exact period/method totals, source facts, CSV filtering, and that unknown/rejected refund requests do not count as confirmed refunds.
- `pnpm --filter @nexg/web exec tsc --noEmit --incremental false -p tsconfig.money.json` — exit 0.
- `pnpm --filter @nexg/web exec eslint components/merchant/money app/merchant-live-preview/money/page.tsx` — exit 0.
- Short desktop: Transactions retained six visible rows without horizontal overflow at 1280×633 CSS pixels; statement and overview layouts were inspected. On a 390×844 viewport, transaction cards fit the screen and opening a record moved focus to its detail.

Screenshots from the running frontend: [Transactions](airport-transactions-refined.png), [Statements](airport-statements-refined.png), [Overview](airport-overview-refined.png) and [mobile transaction detail](airport-transactions-mobile.png).

## Fixes and limits

The profile sweep exposed a sample-loading race and missing explicit column-header semantics; the UI now waits for the selected scope and renders column headers with explicit roles. One earlier shared-server regression run timed out while another workspace change was compiling; the later isolated rerun passed.

Only two illustrative report periods and locally generated sample transaction records/methods are provided. The local statement projection is not a real issued statement or a general payout calculation. Actual financial facts, source permissions, account/ERP connections and a complete merchant usability or accessibility audit remain future work. Other Money design acceptance gaps listed in `acceptance.md` remain open.
