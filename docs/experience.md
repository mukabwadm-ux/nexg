# Customize Your Experience

A guest picks how long, how much and who, taps the moods they want, and
watches a day assemble itself against their budget. A concierge confirms
every booking with the place itself and comes back with a price. The
guest approves once.

This document covers what is built, how the allocator chooses, how to add
to the catalogue, and — as plainly as possible — what is not built yet.

## What exists

| Piece | Where | State |
| --- | --- | --- |
| Catalogue: partners, components, curated days, events | `20260101005700` | built |
| Experiences module, roles, shifts, settings | `20260101005800` | built |
| The plan, its blocks, its thread, the state machine | `20260101005900` | built |
| The allocator | `20260101006000` | built |
| Desk RPCs: assign, blocks, holds, quote | `20260101006100–6200` | built |
| Reviews | `20260101006300` | built |
| Approve, pay, run, complete, catalogue gates | `20260101006400` | built |
| Partner document requirements | `20260101006500` | built |
| One-read plan view, mood chips | `20260101006600` | built |
| Console roll-ups | `20260101006700` | built |
| Assignment fixes | `20260101006800` | built |
| Guest builder | `/experience/build` | built |
| Guest plan page | `/experience/plan/[id]` | built |
| Console: All experiences, Queue, Workbench | `/experiences` | built |
| Console: Curated days, Components | `/experiences?tab=` | read-only |
| Console: Events, Partners, Reports | — | not built |
| Guest home, events pages, curated day pages, share link | — | not built |
| Partner portal | — | not built |
| Timers (SLA, quote expiry, hold expiry, review request) | — | not built |
| Notification delivery | — | rows are queued; nothing sends |
| Payments | — | not wired; see below |

## How the allocator chooses

`fn_build_plan(plan_id)` runs on every tap in the builder and is
deterministic: the same answers always produce the same day.

1. **Events first.** Any event the guest picked is placed at its
   `anchor_slot` and marked `anchored`. Its ticket is never in the
   estimate — it is listed at face value as paid on the day.
2. **One component per mood, per slot that mood owns.** Taste earns two
   sittings on a full day; nothing else does. The guest's chip wins if it
   is bookable; otherwise the middle tier of the group is the starting
   point.
3. **Fit the budget.** Step the most expensive swappable block down a
   tier while over; step the cheapest up while a quarter of the budget is
   unspent and the step still fits. Bounded at 24 iterations.
4. **Transport.** A driver for the day when the guest asked for one, or
   when three or more stops are more than four kilometres apart. A ride
   home is always added after a night or event block, with `included_by`
   set so it renders INCLUDED and costs nothing.
5. **Gaps** become `free` blocks, because an empty afternoon should look
   like a choice rather than a hole.
6. **Totals**, and the concierge fee from `setting.experience_fee_rule`.

Two properties worth keeping:

- **It never overwrites a person.** Only `proposed` blocks are replaced.
  A block a concierge has confirmed, changed, removed or marked
  unavailable survives every rebuild.
- **It stays under 150 ms.** At 522 live components it runs in 39–77 ms
  warm. That is because `fn_load_available` materialises the working set
  once per build; without it the same query ran about thirty times a tap
  and took 130 ms.

`swap_group` is the spine. Components in a group are alternatives for the
same part of the day (`early_wild`, `midday_taste`, `night_night`), ranked
`tier` 1–5. Without at least three tiers in a group there is no budget
fitting and no swap — `catalogue_health` exists to make that visible
before a guest finds it.

## Adding to the catalogue

**A component.** Insert into `experience_component` with a `mood`, a
`swap_group`, a `tier`, a price and `status = 'draft'`. A draft may have
no price; a live one may not, and the constraint enforces it. Set
`default_slot`, and `earliest_start`/`latest_start` where the place has
opening hours — the allocator clamps the block into that window, which is
what stops an elephant orphanage with one 11:00 feeding being drawn at
06:30.

**A swap group.** Three or more components, same mood, same part of the
day, distinct tiers. Fewer than three and the group cannot be fitted to a
budget.

**A curated day.** A `curated_day` plus `curated_day_block` rows, then
`rpc_publish_curated_day`, which refuses unless every block is live and
priced and the day has a price per person.

**An event.** Insert as `draft`, then `rpc_publish_event`. Feeds
(`event_feed`) create drafts and only drafts; nothing a feed or a partner
submits is ever published without a person.

**A partner.** `experience_partner` at `applied`, documents through the
shared `document` framework (`owner_type = 'experience_partner'`), then
`rpc_partner_go_live`, which counts the essential ones.

## How a concierge quotes

`rpc_quote_plan` refuses on three things, and the workbench says which
before you can click:

1. any block still merely `proposed`;
2. any settled block with no price;
3. `setting.experience_fee_rule` unset.

The third is deliberate and is currently the state of production: the fee
rule is null, so quoting refuses rather than guessing with a guest's
money. Set it to `{"pct": 12}` or `{"flat_kes": 3000}` when the number is
a decision somebody has actually made.

## Money

**There is no payments provider wired to this project, and no ledger.**
The build prompt says to reuse the Payments service and not to create a
second ledger; there is no first one, and inventing one would have been
worse than the gap.

So approval and payment are separate:

- `rpc_approve_plan` records that the guest agreed to a specific quoted
  total. It takes no money, and the plan page says so.
- `rpc_mark_paid` demands a reference from whatever actually took the
  money, and `plan_paid_is_referenced` refuses `paid` without one.
- Cancelling a paid day does not cancel it. It files an
  `experience_refund` approval request — two people, the same rule
  Finance already runs on.

When a provider lands, it calls `rpc_mark_paid` with its reference and
partner payouts go through whatever ledger exists then.

## Reviews

Four rules, all in the database rather than in a screen, because each one
erodes the first time somebody is in a hurry:

1. **Asked once.** A unique constraint on `review_request.plan_id`.
2. **Never edited.** A trigger refuses any change to `body` or `rating`,
   including from the service role. There is no edit affordance in the
   console because there is nothing it could call.
3. **Never published without a person**, and the decision and its reason
   are logged.
4. **Shown only in the form consented to.** Widening `consent_display` to
   `full_name` is refused by the same trigger, and the radio is disabled
   in the console.

`fn_review_checks` flags phone numbers, plate numbers, email addresses
and partner staff names so whoever approves reads with their eyes open.
It is an advisory, never a filter.

## Ground rules as they apply here

- **No invented numbers.** The "most couples pick" hint under the budget
  slider is `[—]` because there are no paid days to take a median of, and
  it would be the most persuasive number on the page. Average rating is
  `[—]` rather than 0.0 when nothing is published. The concierge fee is
  `[—]` until a rule is set.
- **Visibility is a database rule.** `anon` reads `event_public`,
  `curated_day_public`, `component_public` and `review_public` and
  nothing else. All four are `security_invoker = false` — an invoker view
  over an RLS-protected table returns nothing to exactly the people it
  exists for.
- **Every state change is audited**, under module `experiences`.

## Known gaps

Beyond the "not built" rows above:

- **No SLA timers.** `sla_first_reply_due_at` and `expires_at` are
  written and the queue counts down from them, but nothing fires when
  they pass. `rpc_expire_quotes()` exists and needs a schedule.
- **Notifications are queued, not sent.** Rows land in `notification`
  with `status = 'pending'` and nothing delivers them.
- **Travel time is straight-line distance**, not drive time. No Distance
  Matrix key is wired. The driver threshold is deliberately generous
  because of it.
- **No analytics.** PostHog events from the build prompt are not
  instrumented.
- **The catalogue is empty in production**, on purpose. Prices are a
  partner's own statement; the seeded Nairobi catalogue is local-only.
