# Dated Stay filter source: 16 November 2026

## Status and scope

Local additive migration and offline actual-SQL fixture only. NOT applied, pushed or deployed. Discovery/Consumer integration is developed separately; this evidence covers SQL only. Existing hold, quote, payment, public listing and booking routes are unchanged. This does not switch booking authority.

Files:
- `supabase/migrations/20261224000100_stay_filter_candidates.sql`
- `scripts/check-stay-filter-contract.mjs`

The migration adds one read-only `rpc_stay_filter_candidates_v1` method. It reuses the existing `rpc_stay_search` date, time-zone, occupancy and minimum-night logic, then joins BOTH existing public views within the same statement snapshot. The unit supplying the price must also satisfy capacity, bedrooms, amenities and dates. Property-wide minimum price/maximum capacity cannot be combined across different units.

## Request

Required: `p_check_in` date, `p_check_out` date, `p_guests` integer 1–40.

Optional: `p_city_id` UUID, `p_area` exact property area (case/outer-space normalized, <=120 chars), `p_property_id` UUID, `p_max_nightly_kes` positive whole-KES bigint, `p_min_bedrooms` integer 0–100, `p_amenities` text array (default empty; <=32 exact published keys, no null/blank keys, <=64 chars each). Invalid inputs reject with SQLSTATE `22023`; dates retain existing Nairobi validation (today forward, check-in <=365 days away, <=90 nights).

The requested amenity set must be covered by the property's shared amenities plus THIS unit's amenities. Unknown requested amenities yield no matches, not an ignored filter. Units with unknown capacity or no positive nightly rate are not confirmed candidates. This endpoint is for known-price, known-capacity dated inventory, not every browseable listing or price-on-request enquiry.

## Response

```json
{
  "contract": "stay-filter-candidates/1",
  "status": "ok",
  "complete": true,
  "count": 1,
  "limit": 1000,
  "items": [{
    "unit_id": "public-unit-uuid",
    "property_id": "public-property-uuid",
    "nights": 2,
    "nightly_rate_kes": 2000,
    "room_subtotal_kes": 4000,
    "max_guests": 4,
    "bedrooms": 2,
    "amenities": ["pool", "wifi"]
  }],
  "request": { "...": "normalized request echo" },
  "checked_at": "statement timestamp",
  "currency": "KES",
  "price_basis": "room_only",
  "held": false,
  "booking": "not_checked"
}
```

Items are sorted by nightly rate, then unit identity. Only public unit/property facts are returned. No stay IDs, occupant details, private address/contact/access data, payment, host identity, booking state or hold expiry is exposed. The function has explicit execute grants matching existing public availability reads; it does not grant table access.

The nightly ceiling is a **base room rate**, not total trip cost. `room_subtotal_kes` is room rate times nights, not a payable checkout quote, taxes or extras. A quote/hold must revalidate its own source. `checked_at` is when this statement observed inventory, not a reservation or validity guarantee. Do not retain a positive availability badge indefinitely.

## Completeness and consumer integration rules

Up to 1,000 eligible units are returned completely. A 1,001st match produces `status: too_broad`, `complete: false`, an empty `items` array, and NO `count`. It is not a valid zero-result response. The caller must request narrower filters; it must not show a partial listing, total or cheaper unrelated fallback.

This avoids PostgREST row truncation of a set-returning function by returning one bounded JSON document. It does not create server-side pagination. Only a response with `complete: true` may be used as the full source for a downstream same-unit listing projection and totals. Do not take a pre-paginated property list and mark each page as globally date-filtered. Do not restore excluded units when joining display metadata. Reissue when dates/party/scopes change, and discard late replies bound to old inputs.

The existing PL/pgSQL availability helper can inspect/materialize more rows internally than the response limit. The output cap is NOT a proven query-work bound. Before production: measure representative plans and time/memory, ensure request-level DB/gateway statement timeout and rate budget, then narrow/index the SQL if needed. No effectiveness claim is made for a per-function statement_timeout setting; this migration does not use one.

## Verification

Run from this worktree:

```powershell
& 'C:\Program Files\nodejs\node.exe' scripts/check-stay-filter-contract.mjs
```

The script uses already-installed `@electric-sql/pglite` 0.5.14 in memory, with no server, port, disk database, Docker, network, credentials or Supabase invocation. It loads the exact existing public views and date/window/occupancy/search functions from checked-in SQL plus this new migration into a reduced fixture schema. Synthetic fixture identities never enter product data.

Final isolated run: **22/22 actual-SQL fixture checks passed** on 16 November 2026. JavaScript test file formatted with the repository Prettier configuration. No full database suite was run.

Checks cover global same-unit conjunction, dates, budgets, amenities, bedrooms, strict scope, no sample/unpublished/paused-host/archived leakage, expired holds, date boundary, unknown facts, anonymous public-only envelope and no table grant, exact 1,000 boundary, explicit 1,001 overflow, and no booking writes. This proves those SQL paths against the fixture, NOT all production constraints, RLS, schema compatibility, query performance, native integration or rollout state.

Production rollout remains separately gated on the complete backend migration chain and a full Supabase migration/pgTAP pass, schema-cache refresh, performance/admission controls, Discovery adapter capability/error handling, app integration and on-device testing. No launch-ready claim is made.
## Local contract expansion

The unpublished function also accepts `p_min_nightly_kes` (nonnegative whole KES), `p_max_bedrooms` (0-100), `p_property_types` (up to32 exact raw property-kind keys, deduplicated and sorted), and `p_city_name` (exact lower-trim city name up to120 characters). Contradictory min/max bounds fail validation. Bedrooms 1/2 are represented by equal min/max; 3+ by min3 and no maximum. Every predicate runs before the overflow probe and is echoed in `request`.

Each returned unit includes same-statement public `property` metadata: id, name, slug, area, city_id, city_name, property_type, photos, latitude and longitude. Photos expose at most24 label/cover pairs, labels bounded200, never storage paths. Coordinates are explicitly null: the base property table has a geographic point, but the current public view deliberately does not publish it. This migration does not publish private precise locations or fabricate map pins. A future map-publication contract must settle precision and consent before real Stays map pins can be claimed.

Extended fixtures check exact bedrooms, min/max nightly, property-kind scope, city-name scope, request echo, metadata provenance and safe photos in addition to the original boundary/publication/occupancy cases. See the latest run result separately; the earlier22 count is historical.
Latest expanded isolated run: **31/31 actual-SQL checks passed**, including min-price and exact2/3+ predicates before the overflow probe. No full migration/RLS/performance or live test was run.
