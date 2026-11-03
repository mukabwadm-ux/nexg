# 2026-10-31 — Money view refinement

Separated the frontend sample's Overview, Transactions and Statements into a financial snapshot, a scoped transaction list with relevant summaries and details, and a sample-report list/download flow. Added workflow-specific work labels, sample methods and timestamps, transaction filtering/search, unknown/rejected refund presentation, and report-period selection through the report list. Preserved local-only source boundaries and other merchants' pending work.

Verified 128 transaction views in the browser, the full existing Money regression journey, 51 focused tests, TypeScript and ESLint. See `docs/merchant-portal-plan/money-concept/implementation/transactions-refinement-verification.md` for actual evidence, screenshots and remaining limits.
