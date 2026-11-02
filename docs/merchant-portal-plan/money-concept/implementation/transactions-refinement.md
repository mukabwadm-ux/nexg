# Transactions view refinement

The existing Money implementation plan and frontend-only boundaries remain in force. In response to the merchant's feedback, make Transactions answer questions about the records currently displayed, instead of repeating statement summaries from Overview.

The three views now have distinct purposes: Overview shows the owner-provided financial snapshot and a short recent-activity preview; Transactions provides the complete searchable records, matching-record summaries and selected payment details; Statements lists the two supported sample report periods and lets the merchant inspect or download the selected report without repeating the Overview cards.

- Calculate four local sample summaries from the same period- and filter-scoped transaction records: movement count, confirmed payment count/amount, confirmed refund count/amount, and unresolved or rejected outcome count. A request with an unknown result is not a confirmed refund. Missing/offline data is unavailable rather than zero; partial data is labelled.
- Show workflow-appropriate work vocabulary, reference, date, type, sample payment method, amount and state. A selected transaction shows the source, timestamp, method, related work and other available facts, without deriving an actual payment from a work state or exposing unrelated sensitive information.
- Keep a record selected when entering Transactions and preserve safe refund handling. Search, type/status/method filters and CSV export use the same transaction scope. Transaction-specific facts and methods are explicitly local examples, not evidence of real payments.
- Keep statement/payout totals on their existing owner-defined basis. Security, reservation, balances, onboarding and live integrations are not changed.
- Verify period and filter changes, unknown/rejected outcomes, transaction details and export, sample activity adaptation, all-profile bindings, short desktop and mobile layouts, existing refund flows and the absence of network writes.
