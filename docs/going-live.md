Written for: whoever sets the keys and presses deploy.

# Going live

Three things are built and inert. Each one is wired end to end and refuses honestly while its keys are missing; setting the keys is the whole of what turns it on. Nothing else has to change.

| | Set | Then |
|---|---|---|
| **Maps** | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_ID` | The live map draws; a merchant drops a pin instead of typing coordinates |
| **Payments** | `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Guests pay, featured slots bill, refunds actually leave the account |
| **Realtime** | nothing | Already on |

Every screen that depends on one of these names the exact variable it is waiting for. "Maps unavailable" wastes an afternoon; "set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`" does not.

---

## 1. Google Maps

### What to create

In Google Cloud, on a project with billing enabled:

1. **Maps JavaScript API** — enable it.
2. **An API key**, restricted to:
   - *Application restrictions* → HTTP referrers → `https://nexg-zjkl.vercel.app/*` and `https://nexg-sepia.vercel.app/*` (plus `http://localhost:3005/*` and `http://localhost:3006/*` for development)
   - *API restrictions* → Maps JavaScript API only
3. **A Map ID** (Google Cloud → Map Management), type **JavaScript**, with a style attached. The style is where NexG's palette goes — ink `#14110F`, gold `#C9A227`, roads muted.

Both are required. A key without a Map ID gives Google's default blue-and-beige, and **Advanced Markers silently refuse to render** — which looks exactly like a bug in our code. So the capability check demands both, and reports both when either is missing.

### Where they go

| | |
|---|---|
| Vercel → `nexg-zjkl` (admin) | both variables |
| Vercel → `nexg-sepia` (web) | both variables |
| `apps/admin/.env.local`, `apps/web/.env.local` | both, for development |

### What lights up

- **`/live`** — the map replaces the explanation. Zone outlines from Settings geometry, order pins coloured by urgency, rider dots by presence, the dashed gold circle at the cascade's current radius, and a dashed line from pickup to drop-off.
- **`/merchant/stores`** — the coordinate field becomes a draggable pin.

**What it still will not do.** The dashed line is straight, and says so on the page. It is not a route: the Routes API is not wired, and a solid line would be a claim that a rider could follow it. Rider dots are last-heartbeat positions, not a live stream — each one says how long ago in the list below.

---

## 2. Paystack

### What to create

1. A Paystack account for **Nexgenius Concierge Limited**, in Kenya, with KES enabled.
2. Settings → API Keys & Webhooks → copy the **secret** and **public** keys.
3. Set the **webhook URL** to `https://<your web domain>/api/payments/paystack/webhook`.

Check the endpoint answers before saving it:

```
curl https://<your web domain>/api/payments/paystack/webhook
→ {"ok":true,"endpoint":"paystack webhook","configured":true}
```

`configured: false` means the secret key is not set on that deployment.

### Where they go

| | |
|---|---|
| Vercel → `nexg-sepia` (web) | `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` |
| Vercel → `nexg-zjkl` (admin) | `PAYSTACK_SECRET_KEY` only — the console sends refunds and never takes a payment |

Start with `sk_test_`. `paystackMode()` reports `test` or `live` from the key's own prefix, so nothing has to be told twice.

### How the money moves

```
guest pays                    refund
──────────                    ──────
rpc_payment_begin_order       rpc_order_refund      (approved, not sent)
  → payment row, pending        → refunds_to_issue_v
/api/payments/paystack/start  issueRefund()
  → Paystack, authorised        → Paystack /refund
guest pays on Paystack        rpc_refund_issued
  ↓ webhook                     → order partially_refunded / refunded
rpc_payment_webhook
  → order paid
```

**The webhook is the truth, not the browser.** A guest who pays and closes the tab has still paid; one who reaches `/pay/<reference>` through the back button has not. Only `rpc_payment_webhook` moves an order to paid. The return page reports what the database already believes, and asks Paystack directly so it can say "paid" a second sooner — but it never writes.

Five things it refuses, each of which would otherwise look like success:

- **A duplicate delivery.** Paystack sends no event id and retries on any non-200, so the body is digested and the digest is unique. A retry does nothing.
- **A forged body.** HMAC-SHA512 over the *raw* bytes, compared in constant time. An unsigned event is stored — a run of them is somebody probing — and not acted on.
- **A different amount.** A provider settling one shilling against an 880-shilling order fails the payment, writes a `high` audit event, and leaves the order unpaid.
- **Two open checkouts.** One live payment per order, enforced by a partial unique index. Asking twice returns the same checkout.
- **A refund marked sent that was not.** Nothing is marked issued until Paystack has said yes, and if the provider succeeds but our write fails, the message hands you the provider reference rather than pretending.

### What is still by hand

- **Wallet credits.** There is no wallet ledger, so `wallet_credit` refunds say so and Finance applies them.
- **Cash orders.** Nothing to reverse, so the refund route says to send M-Pesa and record the reference.
- **Payouts to merchants and riders.** Statements and settlements are records; the money is moved by hand. Paystack Transfers would be the next piece.

---

## 3. Realtime

Already on. Nothing to configure, and deliberately nothing in a dashboard.

Postgres tells the browser; the browser re-renders the server component. One source of truth, the same queries, the same row policies — and a change reaches a screen in about **1.3 seconds** measured end to end.

### What is watched

| | |
|---|---|
| `/live` | `public.order` for the city, and `public.live_pulse` |
| `/merchant`, `/merchant/orders` | `public.order` filtered to that merchant |
| `/rider` | `public.order` filtered to that rider |

### Two decisions worth knowing

**Dispatch rings a bell rather than broadcasting.** Realtime only serves the `public` schema — a subscription to `dispatch.job` is refused, and because the console asked for several tables in one channel, losing one lost them all and the screen sat on "reconnecting" looking otherwise fine. So dispatch triggers bump `public.live_pulse`, a row per city carrying nothing but a timestamp. It also coalesces: a cascade round writes eight offer rows and rings the bell once.

**`public.rider` is not published, on purpose.** A publication puts whole rows on the wire and leaves policies to decide who receives them. That table is every rider's live position — the most sensitive thing in this database. A minute-old dot is an acceptable price; a broadcast of where every rider is, is not.

### If a screen stops updating

It says so — the dot next to the heading reads `live` or `reconnecting`, because a screen that silently stopped looks identical to a quiet evening.

The failure to know about: **the socket connecting before the session loads.** It then authenticates as `anon`, which has no grant on these tables, and Realtime rejects every filter with "invalid column for filter". Nothing throws. Both hooks now read the session and call `realtime.setAuth()` *before* subscribing — but if you write a third one, that is the trap.

---

## Order of operations

1. **Deploy the code first.** This project once pushed a migration that pointed the sidebar at `/live` before the page existed in the deployed build, and every staff member got a 404. The database can be ahead of the schema; it must never be ahead of the routes.
2. Set the Maps keys. Reload `/live` — the map appears, and nothing else changes.
3. Set the Paystack **test** keys. Place an order, pay with a test card, watch the webhook land and the order turn paid.
4. Approve a small refund and send it. Confirm it reaches `issued` and the order reads `partially_refunded`.
5. Swap the test keys for live ones. Nothing else changes.

## One thing worth knowing about privileges

Supabase sets `alter default privileges in schema public grant all on functions to anon, authenticated, service_role`. Every function created in `public` since this project started has therefore been executable by an **unauthenticated request**, and writing `grant execute … to authenticated` in a migration adds a second grant without removing the first.

Most functions guard themselves and raise. The ones that did not were the maintenance jobs and sweeps, written to be called by pg_cron — including `cron_retention`, which deletes on the retention schedule, and `fn_anonymise_guest`. Those are now revoked by name, and the default no longer grants to `anon`.

A function that genuinely needs an anonymous caller — a QR scan, a careers applicant with a one-time token, a Paystack webhook — grants it explicitly. If you add one, grant it on purpose so a reviewer sees the line. `supabase/tests/21_money_and_live.sql` asserts both halves: that no `cron_*` is reachable, and that a logged-out visitor can still read a menu and scan a sticker.

## What is still missing after all of this

- **A notifications worker.** Everything queues in `notification_log` and nothing sends. Every screen says "queued", never "sent". This is the biggest remaining gap: delay notices, document reminders, featured pitches and tracking SMS all sit there.
- **Routes API.** The map's line is straight and says so.
- **Payouts.** Money in works; money out to partners is by hand.
- **The leaked database password** is still unrotated, and `nexgcr.txt` still sits in the working directory of a public repository.
