# Account Saved places v1

The merchant-place integration uses the existing customer_saved design from PR 132. Migration 20261212000300 extracts its Saved section only and adds real-account guards, a 500-item account cap, current public merchant enrichment and bounded reads. The unrelated deletion, notification and export proposals remain separate. Before merging PR 132 with this migration, remove its duplicate Saved table/policy/RPC section and keep the stricter guards here.

All requests use the signed-in bearer and the normal public Supabase API key. Anonymous Auth accounts are denied. No merchant coordinate is stored in customer_saved.

- POST /rest/v1/rpc/rpc_my_saved_places accepts optional p_saved_id, p_search, p_sort (recently-saved or name), p_cursor (JSON or null), and p_limit (1–100, default 50).
- Response: contractVersion: '1', accountId, rows, totalCount and nextCursor. A row has id, accountId, merchantId, savedAt and merchant. The merchant is null if the listing is absent or its public name is blank, contains controls or exceeds 2,048 Unicode code points. Otherwise it contains id, the original name, categoryKey, latitude, longitude, area and image from merchant_public.
- nextCursor is opaque to consumers. It binds version, account, sort, normalized search and the last order key plus ID. The name key is limited to 2,048 Unicode code points and uses an empty key for unavailable listings. Exact lookup returns zero or one row in the same envelope. Absent and foreign IDs are indistinguishable.
- POST /rest/v1/rpc/rpc_saved_add accepts p_merchant_id and optional p_item_id, returns ok:true and id. The Maps/App capability uses merchant saves only. Saving the same identity is idempotent, including at capacity; a new identity at capacity fails with SQLSTATE 54000. Public source membership is checked before saving.
- POST /rest/v1/rpc/rpc_saved_remove accepts p_saved_id and returns ok:true. The delete is scoped to auth.uid(); foreign/absent IDs produce the same result without modifying another account.

Read-only current facts never prove booking availability. Missing source points remain unlocated. The App exposes merchant list/get/save/remove and does not advertise unsupported notes, personal lists, restore-original-ID, products, experiences or plans. It re-reads a saved identity before claiming a successful save. Interrupted or uncertain mutation outcomes are not automatically retried.

The policy tests cover ownership, anonymous denial, visibility loss, zero latitude, query/cursor bounds, paging, deletion isolation, idempotency and account capacity. They are transaction-isolated pgTAP checks, intended for PR CI; no hosted migration or operational mutation was performed during implementation.
