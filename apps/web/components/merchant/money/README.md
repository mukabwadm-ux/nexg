# Money frontend sample

The development-only route `/merchant-live-preview/money` uses the existing merchant shell. It reads the current local Offerings sample and resolves the selected offering's registered schema, model and Money descriptor. One shared UI covers the 128 current specialties; a category candidate never turns on an activity or a finance capability by itself.

The local sample includes activity-specific wording and facts, transactions, a restaurant settlement example, read-only customer invoices, collected security, reservation components, local refund drafts and outcomes, and locally generated CSV reports. Two dated sample statement periods are available. Security, balances, reservation policy and payout views appear only in the relevant explicit sample configuration. Reservation advance, booking fee and guarantee have separate policy/outcome records. Unknown results block a conflicting refund for the same component.

`MoneySource` in `source.ts` is a browser-local simulation. Its scoped storage, revisions, simulated roles, source states and fixture-owner statement refresh are not production authorization or financial authority. Money amounts use exact integer minor units with explicit KES metadata. A sample action never sends a charge, refund, payout or message. The Work link preserves the selected reference and returns to Money; its operational Work source is explicitly not connected. Offerings uses the existing local Offerings source and preserves the return context.

## Extend a specialty later

Add the specialty to the existing Offerings/profile configuration with an already registered schema and workflow, reconcile its reviewed Money plan mapping, then run `node scripts/sync-money-config.mjs`. The synchronizer verifies catalogue/profile parity and unique Money descriptors without assuming a fixed number of specialties. `extendOfferingProfiles` also provides a controlled component input for development extensions. Unknown schemas or models remain unsupported until they have an explicit registered descriptor and tests. This does not add or implement onboarding.

## Verification and limits

See `docs/merchant-portal-plan/money-concept/implementation/acceptance.md`. Browser checks exercised all 128 default specialties and the additional table-reservation activity; model tests also resolved all 193 registered model bindings and 18 schemas. The three examples were checked at 1280×633 CSS pixels and a phone layout at 390×844.

This is not a complete production Finance implementation or complete acceptance of MC01–MC24. Real merchant-specific transactions, ERP lineage/deduplication, policy ownership, grants, arbitrary report periods, secure account management, payout or payment integrations, operational Work integration and fiscal documents need their respective later work. The sample data and example projections are not authoritative merchant financial information.

## Distinct Money views

Overview shows the owner-provided sample financial snapshot and a short recent-activity preview. Transactions lists the full period's sample records and derives its four summaries from the current search and filter: matching records, confirmed payments, confirmed refunds and outcomes needing attention. A record exposes its workflow-specific work reference, sample customer, method, timestamp, source and state. Unknown or rejected refund requests are shown as requests and do not increase confirmed refunds. Statements lists the two supported sample reports; its selected report determines the coverage and CSV download. See `docs/merchant-portal-plan/money-concept/implementation/transactions-refinement-verification.md` for those checks.

Payouts is available only when the sample settlement source is explicitly enabled. It separates the current eligible balance and settlement reserve from in-progress and previously paid payout records. Its records, selected details and filtered export share the same local sample data; missing or incomplete source results are never represented as zero. A sent payout is not treated as paid, and customer security remains separate. These examples do not connect a real payout provider or establish a merchant's entitlement. See `docs/merchant-portal-plan/money-concept/implementation/payout-refinement.md`.
