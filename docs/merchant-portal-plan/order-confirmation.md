# Automatic order confirmation

Date: 31 October 2026. User correction. This specification supersedes generic merchant-acceptance defaults in the earlier design. Planning only; no application or Supabase changes.

## Normal flow

Standard stock-backed orders proceed automatically through NEXG or the connected authoritative system. Stock availability is a business fact supplied by that system, not something a merchant must review on each order.

| Source result | Order/portal behavior |
| --- | --- |
| Available and confirmed by the authoritative order/stock operation | Confirm the order automatically and advance to the applicable picking, preparation, collection or delivery workflow. No Accept/Decline gate. Reuse the confirmed allocation; do not reserve twice. |
| Unavailable | Show out of stock and the supported customer alternative. Do not confirm an impossible order or place it in a merchant acceptance queue. |
| Check in progress or outcome not yet known | Show stock check/confirmation pending. Reconcile the source result; this is system processing, not a human review task. |
| Source unavailable, stale or unmapped | Explain the affected connection/stock problem and recovery. Do not manufacture available stock, confirmed work or a merchant approval workaround. |
| Explicit supported review exception matches this offering/work | Open only that named exceptional review with its reason, responsible actor and required input. No category-wide review by default. |

APIs, verified webhooks and native records converge on the same business result. A webhook can supply the authoritative confirmed order when its provider contract includes that meaning. Do not require an additional human acceptance merely because the record arrived externally. Source delivery acknowledgement is distinct from business confirmation, and replayed notifications do not create new orders or duplicate allocations.

Availability must be the authoritative confirmable stock result, including a reservation/available-to-promise operation where the owner requires it. A stale cached quantity is not a confirmation. This is an automatic source check, not an approval screen. Existing configured checkout requirements stay independent of merchant review.

## Human review is an exception

Review requires a registered rule that applies to the actual offering/work and a concrete reason requiring human judgment. Examples can include an unpriced bespoke specification, assessed trade-in condition or a requested change outside an agreed scope. These are individual exception paths, not a new default for all orders or all merchants in a category. A custom offering with a fixed agreed specification and sufficient confirmed resources can proceed automatically.

Customer approval of a quotation or substitution is a different actor/action from merchant acceptance. Picking, preparing, packing, inspecting and confirming handover are execution tasks, not approval to receive the order. Neither an unknown source result nor an out-of-stock result automatically enables merchant review.

An exceptional review binding needs an explicit enabled rule reference, scope, reason, responsible actor, required inputs, allowed outcomes and current matching work. Without those fields the review control/card is not applicable. A rule cannot bypass stock, double-charge or broaden permissions.

Bookable services follow the same principle with their relevant availability: source-confirmed slots, assets, seats or resources can confirm automatically. Supplier handoff and actual service execution still retain their genuine owner-confirmed milestones. An enquiry can be recorded automatically without implying that a provider has approved a regulated service.

## Home and statistics

Standard order Home shows Orders confirmed, Orders in progress and Orders completed, with their periods/date bases and source coverage. Applicable fulfilment, stock and source exceptions remain visible. Confirmation counts are distinct confirmed order identities, not checkout clicks or failed stock checks.

Orders needing exceptional review is a conditional attention item only when a matching explicit review rule is enabled and actual work requires action. Its zero state does not become a permanent approval card for ordinary merchants. The same restriction applies to appointment/remote confirmation-review cards. Normal confirmed bookings need no merchant approval counter.

The `ACCEPTED` state in the workflow catalogue means machine/source-confirmed acceptance in the normal order path; its existence never implies a merchant must press Accept.

## Acceptance examples

1. Native stock available: one automatic confirmation, no merchant acceptance action, correct execution queue and confirmed-order count.
2. Connected system confirms stock/order through API or webhook: same automatic outcome, same statistics meaning.
3. Native stock unavailable: out of stock, no confirmed-order count, no merchant review created.
4. Connected source times out: confirmation pending/unknown, no fabricated stock result and no manual approval fallback.
5. Duplicate API/webhook result: one order, one allocation, one confirmation count.
6. Named bespoke exception enabled and matched: only affected work appears in exceptional review. An otherwise identical standard order proceeds automatically.
7. Review rule absent or not matched: no review control, even while a stock check is pending.
8. Slot/resource-confirmed appointment: automatic confirmation; review appears only under an explicit supported exception.

These cases belong to the frontend fixture plan now and confirmed source contracts later. They do not claim that any API, webhook or runtime resolver is implemented.
