# Payout view refinement

The payout view is a local, frontend-only example of an explicitly enabled settlement source. It is shared across merchant activities, with the selected offering, location, fulfilment method and source determining its scope. A specialty, a confirmed booking or a merchant-direct payment alone does not create a payout entitlement.

- Show the source-reported eligible balance, payout amounts in progress, source-confirmed paid payouts and the settlement reserve. Mark their different time bases; list filters do not change the current-source summary.
- Keep a settlement and an actual payout as different records. Show the selected record's own reference, status, amount, source and any supplied destination. An eligible settlement is not a paid payout; sent, failed, returned and unknown outcomes are not confirmed paid.
- Treat security and reservation money separately unless a source has explicitly posted an allocation. An unresolved or unreflected sale refund makes the current settlement and reserve require refresh; it does not erase an independently confirmed earlier payout.
- With no source, no records, an offline source, partial coverage or stale information, label what is known and leave unknown amounts unavailable rather than claiming zero. Keep destinations masked and do not invent dates, schedules, fees or a provider connection.
- Search, filters, the selected-record details and the CSV use the same sample records. The sample source must be explicitly enabled for each offering in the preview; no real payout, payment, onboarding, backend or integration is performed.

Verification covers source gating, statuses, refund refresh, filters and exports, representative merchant workflows, the registered specialties, and desktop and mobile layouts.
