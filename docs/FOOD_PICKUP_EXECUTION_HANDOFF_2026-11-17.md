# Food pickup implementation seam and migration gate
Date: 2026-11-17. Read-only investigation plus this handoff only. No runtime implementation, deployment, fee change or merchant API work.

## Verified scope and source
- Isolated fulfillment checkout: 94288f0e76d0dff9d74c31c9324117c7b6562acc, codex/fulfillment-filters-20261116.
- Read FOOD_DELIVERY_EVIDENCE_2026-11-16.md. Existing exact-item delivery/branch evidence is not pickup, stock or checkout authority.
- Web components/cart/checkout-form.tsx passes merchant/items/payment/location, requires a delivery place, and sends dropoff_label.
- 20261223000400_checkout_licence_and_hours.sql: fn_web_order_quote has no selected fulfillment mode. It selects a branch by is_primary desc limit 1 and prices delivery bands via fn_price_order.
- 20261223000500_accounts_only_and_booking_release.sql: rpc_order_place_web requires dropoff label and coordinates, re-quotes, stores a delivery-shaped order and no selected pickup mode.
- Native app src/providers/supabase/catalog.ts was read without modifying or launching the app. mapQuote hardcodes delivery fulfillment; submit refuses missing DeliveryDetails. It uses the same web RPCs.
- customer_pickup in 20261102000000_food_restaurant_onboarding_workflow.sql is an onboarding answer, not a published branch/item assignment or executable pickup quote/order.
- apps/api v1/orders POST books merchant services. It is not evidence of a customer Food pickup order.
- Existing dispatch code creates rider jobs from ordinary orders. A pickup implementation must prove it cannot enter this delivery dispatch path. No claim that every later dispatch override was audited.

## Implementation boundary
Do not add an app-only pickup toggle or disguise collection as a delivery address. Do not send ordinary Food orders into Movies/Stays reservation holds. Merchant API integration remains with the other developer. The slice below is NexG-owned pickup only; reject other authorities rather than silently falling back.

1. Establish published merchant + exact item + branch + customer_pickup assignment and explicit operation authority. Onboarding intent alone is insufficient. Include effective collection hours, lead time, accepting switch and publication revision.
2. Persist selected fulfillment mode/branch and authority on the order. Quote and place must consume the same explicit contract, rechecking changed publication, items and hours transactionally. Never substitute another primary branch.
3. Add server-authoritative pickup pricing using established approved agreement/settings. No delivery route, customer coordinates, rider delivery fee or rider payout applies merely because current checkout is delivery-shaped. Do not infer commission/service/cash policy from this document; resolve the applicable approved schedule before implementing monetary outputs.
4. Add retry-safe order placement keyed to account + operation/request identity. Existing native reconciliation by merchant + total + time is not a unique pickup identity.
5. Implement merchant acceptance/preparation/ready/collection state transitions and customer receipt. Collection verification must be authorized for that merchant/order. Exclude customer pickup from dispatch creation/restarts and delivery-only cash/rider transitions.
6. Wire native and web selection and quote rendering only after the backend capability is present. Keep pickup capability off otherwise. Invalidate quote on branch/mode/cart/account changes. Do not require or transmit customer delivery coordinates for collection.

## Acceptance gates (planned, not passed)
- Published NexG-owned item and permitted branch can quote pickup; disabled/hidden/foreign item, wrong merchant/branch, missing authority, external API authority and ambiguous assignment fail closed.
- Closed/holiday/early-close/lead-time and branch override cases are enforced; unknown hours do not become eligible.
- Quote/placement recheck changes between calls: price, stock/availability, item publication, branch assignment, authority, hours, and acceptance.
- Pickup does not call route/zone/distance functions, require a dropoff, create a rider job, incur delivery charges or rider payouts. Delivery behavior retains regression coverage.
- Authenticated account ownership; anonymous session refused; request keys deduplicate retries, reject conflicting reused payloads, and reconcile an unknown timeout to the same order.
- Fee calculations match approved agreement fixtures; no user-submitted prices. Test promotions, rounding, totals and existing threshold boundaries without changing policy.
- Merchant ready/collection lifecycle prevents wrong-merchant access, duplicate collection, collection before readiness/payment conditions and rider-only transitions.
- Native/web capability gating, branch selection, quote invalidation, failed/unknown submissions, receipt recovery and no accidental delivery coordinate transmission.
- Run against an approved disposable current-schema PostgreSQL/PostGIS database with actual RLS/public-view rules. Then isolated app integration and owner device QA. Prior reduced PGlite delivery evidence is not this proof.

## Migration collision: confirmed, not repaired
Actual local files:
- Stays checkout: supabase/migrations/20261224000100_stay_filter_candidates.sql.
- Food checkout: supabase/migrations/20261224000200_discovery_food_delivery_read.sql.
GitHub main read on 2026-11-17:
- supabase/migrations/20261224000100_careers_board.sql exists, blob 6a2a4e5c3d1556a093eb1217f6dae009f84c9f2f.
- Directory listing showed no 20261224000200 version. This is filename evidence only, not target applied-state clearance.
- The Stays and Careers version 20261224000100 therefore collide.
Source: https://github.com/mukabwadm-ux/nexg/tree/main/supabase/migrations

Local main (2a835261cbce4045aec8841cfb1d24e56ce39905) and origin/main (b3b38478ff4aeb3c0ca6e994329c428821c50d48) are stale and do not contain those remote main migration additions. Owner's Derrick checkout is codex/derrick-local-work-20261105 at 86382e84540fd136fec702ada2591a9419c1863b, not main. The previously cited release commit 5065199a45e95727c9888809ef3bd12ae171816d is absent from this local object store. No fetch/reset was run.

Before integration: pin current main, compare all incoming migration versions and dependencies, then inspect the authorized target's migration ledger/schema for prior application. If unpublished everywhere, assign a unique version and update fixture file references together; if applied anywhere, use an explicit reconciled forward migration plan rather than rewriting history. No migration renamed or applied; no live ledger/database queried.

## Outcome
Food customer pickup is not complete in the inspected native/web path. The minimum safe work crosses publication, authoritative pricing/order persistence, dispatch exclusion, merchant collection lifecycle and clients. This handoff makes the next implementation slice explicit without presenting a fake feature or silently changing money rules.


## Follow-up: read-only pickup eligibility gate
Inspected 2026-11-17. No validator implemented because its authoritative input is missing.

The existing rpc_discovery_food_branch_v1 can bind an exact public Food item/merchant to exactly one primary merchant_branch id. That is branch identity only; it does not establish a published pickup handover location or a branch-level operating capability.

The missing source is a server-authoritative, published customer-pickup enablement/assignment for the exact catalogue item + merchant_branch + executing authority, with its publication revision and effective handover hours/window. No existing executable field providing this tuple was established. These are required semantics, not newly invented schema field names.

Existing fields must not be promoted into that authority:
- merchant.answers.fulfillment_methods containing customer_pickup: merchant onboarding intent, not exact branch/item publication.
- Q_PICKUP_AVAILABLE -> fulfillment.customer_pickup_requested: explicitly requested configuration.
- Portal activity.methods CUSTOMER_PICKUP + activity.locationIds + location.published: configuration/preview model, not proof of a public Food source contract or supported runtime action.
- docs/booking-engine/domain-registry.json at 5065199a45e95727c9888809ef3bd12ae171816d declares FULFILL_CUSTOMER_PICKUP_V1 status PROPOSED_DESIGN_NOT_IMPLEMENTED and runtimeEnabled false. Its requiredInputs include handover point, collection window and authorized recipient policy.

Source files read through GitHub at that commit: domain-registry.json and apps/web/components/merchant/business/model.ts. Search also identified the Q_PICKUP_AVAILABLE mapping in docs/booking-engine/answer-effects.md and the onboarding declaration in 20261102000000_food_restaurant_onboarding_workflow.sql. Local exact branch RPC source was inspected directly.

Result: exact primary branch identity is available; authoritative exact-branch pickup capability is not proven. A pure validator over fabricated eligibility fields would only test a placeholder, so none was added. Next real seam is the published branch/item/authority pickup contract described above. No runtime enablement, pricing, client toggle or live request.
