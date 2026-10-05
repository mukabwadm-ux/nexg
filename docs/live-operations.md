Written for: the dispatchers and ops managers who work this screen, and the engineers who maintain it.

# Live operations

## What this screen is for

An order that nobody picks up is the one that loses a guest. Live operations exists for the minutes between "nobody has taken this" and "somebody is on the way" — and its whole job is to explain *why* the automatic cascade could not place an order, so the person at the desk can choose between paying more, searching wider, asking somebody directly, moving the promise, or stopping.

Everything on the screen is a row in the database. Nothing is inferred in the browser. That is not a style preference: if the console computed the explanation separately from the service that made the decision, the two could disagree, and the dispatcher would be arguing with a screen rather than working the problem.

## The cascade

When an order is confirmed, `dispatch.rpc_job_start` creates a **job** and runs the first **round**.

A round asks everybody eligible, ranked by distance to the merchant, with a window from `dispatch.accept_window_s`. It also writes a row for everybody who was *not* asked, with the reason:

| reason | means |
|---|---|
| `offers_paused` | the rider turned offers off, with their reason |
| `on_cooldown` | they are cooling off, until a specific time, for a stated reason |
| `not_alcohol_eligible` | the order came from a bar and they are not cleared |
| `not_large_item_eligible` | the order needs a large-item carrier |
| `wrong_vehicle` | the order needs a vehicle they do not ride |
| `cash_over_cap` | cash on delivery, and this order would put them over their cash cap |
| `stacking_not_allowed` | already on a trip, and this city does not stack |
| `beyond_their_max_km` | the whole ride is further than the distance they told us they do |
| `out_of_radius` | outside the radius currently being searched |
| `already_offered` | already asked this round |

The order matters. The first reason that applies is the one shown, and they run hardest-first — a rider whose offers are paused is never described as "out of radius".

**Those exclusions are the valuable half of the screen.** A list that merely omitted the excluded riders would leave the console unable to explain itself, and a dispatcher unable to tell whether widening would help.

Rounds run until somebody accepts or `dispatch.rounds_before_boost` is reached, at which point the job becomes **escalated** with `escalation_reason`:

- `no_eligible_riders` — nobody was online at all
- `radius_exhausted` — people were online, none took it

Those are different problems and the screen says which.

### Invariants

- **An answered offer is immutable.** A trigger refuses any update to an offer whose outcome is not `pending`. The cascade is the record an intervention is judged against, and a record that can be edited afterwards is not one.
- **One live offer per rider per job.** Starting a new round withdraws any still-pending offer from an earlier round, with a note saying so. Otherwise a dispatcher who boosts while a direct offer is counting down leaves that rider holding two cards for the same order.
- **A job freezes the rules it started under** (`job.rule_version_ids`). Settings can change mid-cascade; a job that began on a twenty-second window is not suddenly judged against a thirty-second one.

## What a dispatcher can do

Every action states its consequence before it happens, because a dispatcher cannot weigh boosting against widening without knowing that one is rider pay and the other is five more riders.

| action | shortcut | consequence stated |
|---|---|---|
| Boost & retry | `B` | the amount, and that it is rider pay — never added to the guest's bill |
| Widen radius | `W` | how many *more* riders that actually reaches, before confirming |
| Assign manually | `A` | a direct 60-second offer; the rider can still say no |
| Tell guest | `T` | the new promise, and whether it earns a free cancellation |
| Cancel | — | the refund, the rider's compensation, the merchant's, and whether a second person is needed |
| Reassign | — | what the outgoing rider is owed if they had already collected |
| Pause zone | — | how many orders are already running there and still need finishing |

Two rules hold throughout:

1. **A boost is rider pay.** No function in the dispatch layer touches the order totals.
2. **Moving the ETA tells the guest**, and past `guest.free_cancel_delay_min` it offers them their money back for walking away.

### What a dispatcher cannot override

Distance and cooldown are judgement calls; a dispatcher may assign past them. Vehicle, alcohol clearance, large-item clearance and the cash cap are not — those are facts about what the rider can physically carry or how much money can safely be in their pocket, and overriding them produces a delivery that cannot happen or cash that goes missing. The RPC refuses, and the button is disabled with the reason in its tooltip.

`force_stack` is the one deliberate exception, for `stacking_not_allowed` only, with a required reason and its own audit line.

## Numbers nobody has published

Several figures on this screen are deliberately absent until somebody owns them:

- `dispatch.boost_fee` / `dispatch.boost_max`
- `guest.free_cancel_delay_min`
- `fees.cancellation_after_pickup` (owed to a rider on a cancelled pickup)
- `fees.merchant_cancel_compensation`
- `finance.cancel_two_person_threshold`
- `finance.refund_two_person_threshold`

Where one is unset the action **refuses and names who publishes it**, rather than defaulting. A default here would be a file deciding what NexG pays people. On screen the figure reads `[—]`, which means "nobody has decided", not "zero".

Finance and Ops publish all of these on **Settings → Fees & dispatch**.

## The map

There is no map. The build calls for Google Maps with a NexG Map ID, Advanced Markers, Routes polylines and a Deck.gl heatmap, and **no Maps key is configured for this project**. The same build forbids drawing illustrative streets, zones or positions in production.

A grey rectangle with invented pins would be read as the city, which is worse than no map at all. So the screen ships with the **list** the build specifies as the keyboard-reachable equivalent — the same queries, the same facts, and the version that works on a mid-range Android over 3G.

To enable the map: set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_ID`. The list stays regardless; it is the accessibility path, not a fallback.

## Zones

`dispatch.cron_zone_health` recomputes every minute from the rider record directly, so a zone can never claim riders the rider console says are offline.

- **ok / tight / short** come from `dispatch.zone_tight_load` and `dispatch.zone_short_load`, as live orders per free rider — the number that says "short" before anything is actually late.
- An escalated job in a zone makes it `short` regardless, because the cascade running out is the strongest evidence there is.
- `load_per_free_rider` is **null** when nobody is free, not infinite. A glitchy number is one people stop reading.

**Pausing a zone** stops NexG taking money in part of a city. It is narrower than the live-ops grant — ops manager, city lead or super admin only — requires a reason the guest will see, and writes a `high` audit event. Checkout asks exactly one question, `public.fn_zone_serviceable(point)`, so a pause cannot be half-applied.

A timed pause ends itself (`dispatch.cron_zone_unpause`, every five minutes). An open-ended one is somebody's memory, and the dialog says so.

## Replay

`dispatch.cron_replay_capture` snapshots rider positions and offer state while a cascade is live, because riders move and no query afterwards can say who was nearby at 20:14. Snapshots are capped at 720 per job and retained for `dispatch.replay_retention_days` (30).

Viewing a replay is **narrower than live ops** — ops manager, city lead or super admin — and every view writes `dispatch.replay_viewed`, flagged for review with `rider_location` named as the PII involved. A replay is every rider's movements for a window of time, which is the most revealing thing this database holds about them.

## Orders

The Orders console reads the same rows through a different lens: Live leads with the clock and the cascade, Orders leads with money and the timeline. They share `console_live_orders_needs_v`, so a queue cleared on one page is cleared on the other.

### Needs action

One definition, `public.fn_order_needs_action(order_id)`, returning the reasons:

`no_rider` · `no_rider_too_long` · `merchant_late` · `past_promise` · `guest_unreachable` · `payment_pending` · `scheduled_at_risk` · `disputed` · `rider_stationary`

Overview, Orders and Live operations all read this function. Three screens with three definitions is how a dispatcher ends up clearing a queue on one page that is still full on another.

### Repricing

**An adjustment is repriced against the exact settings versions the order was placed under**, named by id in `order.pricing_version_ids` — not by timestamp. `effective_from` is a figure Finance sets, not the moment they set it, so a rate card published today and dated last week would otherwise change what a repriced order from yesterday costs, after the guest has already been quoted.

An order with no recorded version ids cannot be repriced at all. It says so and suggests a refund or a waiver instead.

Items stop changing once the rider has the bag. After pickup the only moves are a refund or a fee waiver.

### Refunds

Three routes, and `public.fn_refund_routes(order_id)` says which work for a given order:

- `original` — reverse the payment; unavailable when they paid cash
- `mpesa_b2c` — send money to their number
- `wallet_credit` — credit their next order

A reason code *and* a sentence are both required. At or above `finance.refund_two_person_threshold` the refund waits in the approvals queue instead of being approved.

**Approved is not issued.** No payment provider is connected, so the console says "Approved and recorded… Finance settles it by hand" rather than "refunded". The same is true of every notification on this screen: nothing drains `notification_log`, so delay notices, adjustment notices and tracking SMS are queued, and the console says "queued" rather than "sent".

### Phone numbers

Masked everywhere: `+2547 •••••• 42`. Revealing one is a separate button, a separate `order.phone_revealed` audit event at `high` severity, and attributed by email. A console that always showed the number would be an exportable phone book for anybody with access.

### Manual orders

`+ Manual order` is the desk taking one on the phone. Same refusals as checkout — a serviceable zone, a published rate card, a guest who is not blocked — because an order taken by phone that could not have been placed on the web is one nobody can price, deliver or explain.

The consent tick is not decoration. The operator confirms they read the line aloud, and the RPC refuses without it.

## Where things live

| | |
|---|---|
| orders, items, events, adjustments, refunds | `public` |
| jobs, offers, actions, zone health, replay | `dispatch` |
| who may do what in a city | `authz.works_live_ops(city_id)` |
| every console call | a `public.rpc_*` wrapper |

Those wrappers exist because **PostgREST only serves schemas listed in a Supabase dashboard setting, and an unlisted schema returns nothing rather than an error.** That failure is indistinguishable from a quiet night and has already cost this project three debugging sessions. Rather than depend on it a fourth time, every function the console calls has a `public.` wrapper. The wrappers hold no logic and are invoker-rights, so the definer function behind each one does its own authorisation exactly as it would if called directly.

## The clock

| job | every | what breaks without it |
|---|---|---|
| `dispatch-advance` | minute, ticking every 10 s | offers stay pending forever; nothing escalates; the order that most needs a person never reaches the desk |
| `dispatch-zone-health` | minute | every zone reads "ok" while riders run out |
| `dispatch-zone-unpause` | 5 minutes | a part of the city quietly stops earning after the reason has passed |
| replay capture | inside `dispatch-advance` | no post-mortem is possible; positions cannot be reconstructed |

The zones panel says when its numbers are stale rather than presenting old figures as current.

## Still missing

- **No notifications worker.** Everything queues in `notification_log` and nothing sends. The console says "queued", never "sent".
- **No payment rail.** Refunds are approved and recorded; Finance moves the money by hand.
- **No Maps key**, as above.
- **No rider live stream.** Positions come from `rider.last_location`, written by the rider app's heartbeat. The screen shows how long ago each rider was seen so a stale position cannot pass for a current one.
