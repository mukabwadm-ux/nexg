# Explore backend and customer ratings

Status: local database validation passed; implementation still awaits the rider milestone decision and native/live acceptance. Do not deploy this branch until the remaining acceptance below is complete.

## Files and scope

- `20261206000100_explore_merchant_facts.sql`: public rating/trait/popularity views, staff-only branch Google place IDs, owner order rating and recent-category RPCs.
- `20261206000200_explore_plan_merchants.sql`: merchant links on plan blocks, customer publication gate, and an early return that preserves an externally chosen day. The existing builder body is otherwise unchanged.
- `20261206000300_complete_service_ratings.sql`: owner-scoped eligibility, retry-safe rating submission for orders/bookings/merchant plan stops, private service-rating storage, and a paginated feed of completed plan stops.
- `62_explore_backend.sql`: local transaction-only pgTAP checks. The 121 assertions passed in the approved rollback-only local run on 11 November 2026.

## Contract

All RPCs below require the authenticated customer's bearer token. Ownership comes from `guest.user_id` for orders, `booking.guest_user_id` for bookings and `plan.user_id` for plan stops. Never accept an account, merchant or rider identity from a submission payload.

`rpc_my_rating_context(p_kind, p_id)` returns `{kind,id,eligible,reason,rating,rider}`. Kind is `order`, `booking` or `plan_block`. A stored rating is `{stars,comment,created_at}`; otherwise it is null. Missing/foreign records are refused, not described to another customer.

`rpc_service_rate(p_kind,p_id,p_stars,p_comment)` stores 1–5 stars and an optional trimmed comment of at most 500 characters and returns the same authoritative context. Repeating the same payload acknowledges the same rating; changing an existing rating is refused. After a lost response, read context before retrying. A client timeout is not proof that submission failed.

`rpc_my_completed_rating_stops(p_before,p_before_id,p_limit)` returns actual completed merchant plan stops `{id,merchant_id,title,completed_at,rating_context}`. Completion times are normalized to milliseconds for consistent native JavaScript cursor ordering. Cursor is the final row's completion time and ID; both cursor fields must be supplied together. Limit is 1–100, default 100. No device-local/manual itinerary or unverified stay can enter this feed.

## Completion and defaults

- Customers retain the rating option after completion, without a fourteen-day expiry.
- Orders require a recorded delivery timestamp in the past. A later dispute/refund does not erase the fact that the meal was delivered.
- Bookings require completed status and an end time in the past.
- Merchant plan stops require their own done timestamp or completion of their parent plan; removed/unavailable stops do not qualify through parent completion.
- Rider ratings remain gated pending the owner's clarification of the required completion milestone. They never contribute to merchant scores.
- Legacy stay records have no reliable customer account link. No name/phone matching or fabricated ownership is allowed; these stay ratings remain unavailable until a verified reservation link exists.
- Public merchant ratings need at least five eligible ratings. They combine order/food and service scores, excluding rider/app feedback. Comments are not exposed publicly by these views.
- Seven allowlisted traits map true/yes and false/no; missing/other values remain null. Google place IDs are at most 255 characters and only merchant-management staff can change them. The public trait view exposes the primary branch ID only.
- Popularity exposes only 0–3 bands: zero for no completed work, then thirds by city among visible merchants, with equal totals sharing bands. Orders use delivered_at; completed bookings use ends_at because there is no immutable completed_at column.
- Recent categories count the caller's orders placed and bookings created in the last 90 days, up to ten category/subcategory groups. No source customer rows are published.
- Movies taxonomy changes remain deferred to the owner's separate decision.

## Verification and integration

Offline structural comparison verifies that the original fn_build_plan is unchanged apart from the merchant-day early-return guard. Git whitespace checks pass.

On 11 November 2026, the owner approved local transaction-only tests. All three migrations applied successfully inside each test transaction against the existing `supabase_db_nexg` container. Results:

- New Explore/rating suite: 121/121 assertions passed.
- Existing experience RLS suite: 20/20 passed.
- Existing merchant console suite: 12/12 passed.
- Existing experience builder suite: 4/4 passed.
- Existing booking engine suite: 17/17 passed.
- Total: 174 assertions passed. The new-function wiring/security scan returned no findings.
- Post-rollback queries verified the new service-rating table, place-ID column and synthetic user fixtures were absent.
- Testing caught and fixed eligibility for an inconsistent non-delivered order with a delivery timestamp. Order eligibility now requires both a delivered/post-delivery state and a valid delivery timestamp.

Consumer focused rating tests: 9/9 passed and TypeScript passed. No native app/UI launch was performed. Concurrent multi-session database races, a clean full migration-chain replay and hosted PostgREST acceptance remain unverified; the rollback-only run is not a deployment.

The Consumer app integration uses the existing Activity review form and real Supabase RPCs. It must preserve unavailable/error states, account isolation and unresolved submission recovery. It must not simulate successful ratings or create local-only service records.

Generated backend database types must be regenerated using the repository's supported local workflow after the new schema has been verified. Do not overwrite the unrelated modified generated-types file in the original Derrick checkout.

No hosted migration, push, PR, deployment, sign-in change or website behavior change is authorized by this implementation. The owner approved and the completed local test used one transaction in the already-running local Supabase PostgreSQL container, applying these additions and synthetic fixtures, then rolling all of it back; never reset the shared local database.
