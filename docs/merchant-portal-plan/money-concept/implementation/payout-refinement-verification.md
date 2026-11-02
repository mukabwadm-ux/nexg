# Payout view verification

The view is a browser-local example. A sample payout source is explicitly enabled for an offering before its Payouts tab appears. This does not imply a merchant is entitled to receive a payout, that direct collections belong to NEXG, or that a real provider is connected.

- `node scripts/smoke-money-payouts.cjs`: passed the payout-specific summary, row selection, filtered export, offline/unknown/error/empty/partial/stale states and unresolved/refreshed refund behaviour. It exercised the view with an explicitly enabled sample source for all 128 registered specialties, plus a mobile viewer. No browser errors or non-read network requests were observed.
- `node scripts/smoke-money-preview.cjs`: passed the wider Money regression, including the 128 specialties, three desktop layouts, mobile, reservations, security, invoices, refund reconciliation and scoped reports.
- `node scripts/smoke-money-transactions.cjs`: passed the existing transaction-specific view and workflow vocabulary checks across all 128 specialties.
- `pnpm --filter @nexg/web exec vitest run components/merchant/money/model.test.ts components/merchant/money/transactions.test.ts components/merchant/money/payouts.test.ts components/merchant/availability/model.test.ts`: 56 tests passed. Payout tests distinguish sent, paid, failed, returned and unknown source outcomes; protect eligible and reserve figures during an unreflected refund; and verify the same records drive filter and export.
- Scoped Money TypeScript and ESLint checks passed.

Desktop and mobile evidence: `payouts-refined.png` and `payouts-mobile.png`. The earlier paid payout example deliberately has no supplied payment date or destination; the masked bank destination belongs to the current settlement example. The four summary figures describe the sample source as of its stated snapshot and are not changed by list filters.

The view does not send, schedule or reconcile actual payouts. Real source ownership, financial permissions, settlement calculations, account management, data contracts and payment or payout provider integration remain future work.
