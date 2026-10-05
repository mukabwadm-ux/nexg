# Messaging

Written for: an engineer working on anything that stores or shows a message, and a desk lead who needs to know what the system guarantees.

---

## The one rule

**A guest never sees internal content.** Not an internal note, not an internal thread, not another conversation.

Everything else here is recoverable. This is not. An agent types *"this one is a chancer, third refund this month"* into what they believe is a note, and if the rule has drifted the guest reads it. There is no undoing that — not with a redaction, not with an apology.

So it is enforced in three places that all have to be wrong at once for it to fail:

1. **`msg_message.visibility` is an enum, NOT NULL.** Not a boolean. `support_message.internal` is a boolean, and booleans default, coerce and invert quietly; `visibility = 'external'` has to be written on purpose.
2. **RLS decides it, not the query layer.** `msg_message_read` reads the column and calls `authz.msg_sees_internal`, which requires a *staff identity* and a participant row carrying `can_see_internal`. A view cannot leak by forgetting a predicate, because there is no predicate to forget.
3. **A constraint makes the bad participant row impossible.** `only_staff_see_internal` refuses `can_see_internal` on any participant that is not staff or a team, whatever a caller passes.

Asked from four directions in `supabase/tests/25_one_conversation_model.sql`: as the guest, as a staff member *not* in the thread, as an escalated team who is, and through the view the console actually renders.

---

## One model, not a fifth inbox

There were already four ways to say something to somebody: `support_ticket`/`support_message`, and `merchant_message`, `rider_message`, `host_message`. A fifth would be the worst outcome of this module — a desk agent with four inboxes answers the one they remember.

A conversation has participants, messages, and links to the things it is about. **External chat and internal staff chat are the same tables with a `kind`**, because an escalation is not a different product: it is the same thread with different people in it.

```
msg_conversation ── msg_participant ── msg_message
        │                                   │
        └── msg_object_link ────────────────┘
            (order · merchant · rider · refund · hotel · …)
```

An internal thread carries `parent_conversation_id`, which is what lets it show the guest's transcript without copying it.

---

## Two deviations from the prompt, both forced

**Schema `msg` → `public.msg_*` tables.** PostgREST only serves schemas on a dashboard-configured list, and a schema that is not on it does not error — it returns **empty**. The console would render an inbox with no conversations, indistinguishable from a quiet morning. Supabase Realtime has the same restriction, and this module is useless without it. Finance settled this the same way after it cost a day.

**Roles `desk_agent`/`desk_lead` → `concierge_agent`/`concierge_lead`.** Those already exist here, with grants and a permission matrix behind them. Two names for one role is how somebody ends up with neither.

---

## What the rules are

| Rule | Where it lives |
|---|---|
| A guest sees no internal content | RLS + enum + constraint |
| An escalated team can read the thread but **cannot reply to the guest** | `can_reply_external`, checked in `rpc_msg_send` |
| Resolving requires a topic | `rpc_msg_resolve` raises without one |
| A retry sends once | `(conversation_id, idempotency_key)` unique |
| Nothing is deleted or edited | `tg_msg_append_only` — redact with a reason instead |
| Visibility cannot change after storage | same trigger |
| Capacity is a refusal, not a warning | `rpc_msg_take` |
| Escalating twice reuses one thread | `rpc_msg_escalate` |

**Idempotency is scoped to the conversation, not global.** It was global first, so a client numbering its retries per thread would have had a send into one conversation silently answered by a message already in another — `ok: true`, a message id, and nothing delivered.

---

## Routing

Eight rules in `msg_routing_rule`, by priority, as rows rather than code so a desk lead can change where "rider cash" goes without a deploy:

| # | When | Goes to | SLA |
|---|---|---|---|
| 10 | a live order in trouble | Dispatch · urgent | 60 s |
| 20 | payment taken, order unpaid | Concierge · urgent | 60 s |
| 30 | anything about an order | Concierge · high | 60 s |
| 40 | merchant application / documents / payout | Merchant ops · high | 120 s |
| 50 | rider cash / documents | Rider ops · high | 120 s |
| 60 | hotels, hosts, partnerships | Partnerships | 120 s |
| 70 | somewhere we do not deliver | Concierge · low | 300 s |
| 80 | everything else | Concierge | 120 s |

Unmatched still reaches the desk. A conversation that routes nowhere falls on the floor.

---

## Desk availability is derived, never scheduled

`msg_desk_status_v` counts agents whose presence heartbeat is under two minutes old. The widget's "a person replies in about two minutes" is built on this, and a schedule would let it say that at 03:00 with nobody there.

The median is over the **last thirty minutes**, and rows where the reply predates the question are excluded — a backfill or a clock skew produced a median of minus sixty-four minutes on the tile, which is worse than no number.

---

## What is built

- The model, the RLS boundary, the RPCs, the routing table, canned replies in English and Kiswahili.
- Console **Inbox** — tiles, queue chips, transcript with internal notes visually distinct, three-state composer, escalate and resolve panels.
- Console **Internal** — object threads, pinned decisions, single-mode composer.

## What is not

Four tabs are greyed in the console rather than linked: **Channels**, **Insights**, **Canned replies**, **Settings**.

Also outstanding, and larger than the tabs:

- **The website widget and partner chat.** The model serves them — `msg_participant` already distinguishes `merchant_user`, `rider`, `host_user`, `visitor` — but no surface renders them yet.
- **WhatsApp continuation.** `msg_whatsapp_session` exists with the 24-hour window; nothing sends or receives. Until the Cloud API is wired, `current_channel` can say `whatsapp` and no message will actually go there.
- **Realtime.** The tables are in `public` so Realtime *can* serve them, but no publication or subscription is set up. The console re-reads on navigation.
- **Suggested replies, insight rollups, SLA escalation pings, attachments and scanning, redaction UI, retention job.**
- **Consolidating the four older tables.** This is the one I would not leave long: the point of this module is one inbox, and there are currently five.
