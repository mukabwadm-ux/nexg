# Money frontend sample: verification

31 October 2026. This record covers the local frontend preview only; it is not production Finance, legal, security or accessibility certification. The missing master specification/execution-law files could not be checked. The full MC01–MC24 design acceptance list remains open where it depends on real source contracts or features not represented by this local sample.

## Observed checks

`node scripts/smoke-money-preview.cjs` against the isolated `http://localhost:3132` development server returned:

```text
sales layout: table 237/237px; detail 206/206px; six rows visible
Search: full sample scope, filtered empty and clear recovery passed
Export: scoped sample transactions and source basis included
Reporting periods: sample figures, records and export follow the selected period
Sale refund: draft, unknown, duplicate protection, confirmation and sample statement refresh passed
Concurrent review: stale changes are rejected and the user input is preserved
rental layout: table 220/220px; detail 155/155px; six rows visible
Security: source reconciliation, partial refund and contextual return passed
workshop layout: table 220/220px; detail 189/189px; six rows visible
Workshop: owner-issued invoices and read-only source passed
Reservations: combined advance, booking fee, guarantee and cancellation allocation/refund passed
Reservations: absent refund terms do not become a refund or a non-refundable policy
Specialties checked: 128/128
Unsupported specialty and missing offering: explicit recovery without showing another merchant context
Offline and viewer: unavailable values, disabled actions and preserved Work return context
Mobile: no document-level horizontal overflow
PASS: 128 specialties, three desktop layouts, mobile and financial sample journeys; no browser errors or non-read requests
```

The browser sweep loads the default offering for each specialty and explicitly creates the additional space-reservation sample. The model test resolves every 193 profile/model binding, every eligible schema for every profile, and all 18 distinct schemas. This is not a separate visual browser journey for every one of the 193 bindings.

`pnpm --filter @nexg/web exec vitest run components/merchant/money/model.test.ts components/merchant/availability/model.test.ts` returned **2 test files passed; 47 tests passed** (16 Money, 31 Availability). The Money tests cover workflow/configuration resolution, future-category rejection, exact currency, the two sample periods, quote/measurement context, receivables, no-show and reservation components, unknown outcome reconciliation, independent refund policies, storage failure, revision conflicts, scoped CSV and formula escaping.

`pnpm --filter @nexg/web exec tsc --noEmit --incremental false -p tsconfig.money.json` returned exit 0. Focused ESLint for Money, the touched preview routes/shell and relevant shared chrome returned exit 0. The wider application build was not run because other work is active in this shared checkout. No full accessibility or merchant usability audit was performed.

Actual screenshots from the tested local frontend: [sales](sales-preview.png), [security](rental-preview.png), [invoices](workshop-preview.png), [phone](mobile-preview.png) and [phone detail](mobile-detail-preview.png). At the short desktop viewport all six example rows and the main inspector content/actions were visible. On phone, the records reflow and selecting a row moves focus to its detail.

## Findings and limits

- A Work-return race initially dropped the specialty and sample role. The link now waits for the contextual reference, and the browser test checks the return. One earlier run also hit a five-second browser wait during concurrent checks; the isolated rerun with a bounded longer wait passed.
- The sample covers representative transactions, fee components and model-specific context. It does not yet implement every planned action, source state or acceptance case; for example, merchant-safe ERP mirror reconciliation, all statement/export states, real payout account changes, arbitrary dates, real approval/grant enforcement and live Work facts remain future dependencies.
- The mock source computes only its explicitly declared illustrative statement projection after confirmed sample refunds. This is not a general settlement formula. Until the sample source refreshes, affected statement and payout figures display `Needs refresh`.
- Work opens the same Money reference in an explicitly labelled contextual sample; the operational Work source is not joined yet. No backend, provider, Supabase, onboarding, customer discovery, email or actual money movement was touched.
