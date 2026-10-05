Written for: whoever maintains the merchant and rider sides of NexG, and whoever has to explain them to a partner on the phone.

# The partner dashboards

## What they are

Up to now everything was built for staff. A merchant who finished registering had one place to go — a status page saying somebody was looking at their application — and a rider had the same. The moment either went live there was nothing behind the door.

These two screens are the other side of it:

- `/merchant` — a business looking at its own trade
- `/rider` — a rider looking at their own work

They live inside `apps/web`, not in a separate app, because they continue a journey that already starts there. A merchant finishing registration at `/merchants/apply` lands on `/merchant` with the same session and the same cookie, and the sign-in page has always promised "same login for guests, riders and merchants".

## Who gets in, and when

One function answers it: `public.fn_partner_home()`. Sign-in reads it, both layouts read it, and nothing else decides.

```
submitted, or readiness >= 80%  ->  the dashboard
otherwise                       ->  back to the application
```

The brief said "after onboarding is done, or about 90%". Readiness is six checks, so it moves in sixths and there is no 90 — five of six is 83. Eighty is therefore the line, and it lands exactly where the brief meant it to: **everything done but one thing**. Below that the application really is the honest answer, because a half-registered partner has nothing to run.

Submitted always gets in regardless of percentage. Once a person is reviewing an application, the applicant's job is waiting and answering, and both of those live inside.

## What a merchant can do

| | |
|---|---|
| **Today** | Open orders, what they kept today, health band, and the three switches a kitchen reaches for |
| **Orders** | Live and historic, with *what the merchant keeps* rather than what the guest paid |
| **Stores** | Add another, rename one, close one |
| **Menu** | On and off the menu in one tap |
| **Documents** | Replace anything rejected, expiring or still wanted |
| **Money** | Weekly statements, read as a subtraction |
| **Featured** | Ask for a paid placement |
| **Messages** | Everything NexG has told them |

### The three switches

Closing and busy mode are different answers to the same pressure, and the screen says which is which. **Busy** keeps the trade and quotes guests longer; **closed** stops orders arriving. A merchant given only "closed" uses it for both and loses the business. Busy mode ends by itself.

Both need a reason — not bureaucracy, but because that sentence is what Support reads when a guest asks why their order was refused at 20:40.

**Prep time** is capped at 5–120 minutes. The guest is quoted it, so it has to be one the kitchen can keep.

### Adding a store

`rpc_merchant_add_store` looks the zone up rather than asking for it. A merchant should not have to know NexG's delivery geometry, and letting them pick would mean a store could claim to be somewhere it is not. An address outside every zone is refused with what to do about it, because a store that takes orders nobody can deliver is worse than no store.

A new store is on file and waiting for a check before it trades — the first one was looked at by a person and so is this one.

There is **no map**, for the same reason there is none in Live operations: no Maps key is configured, and a draggable pin that is not really geocoding anything would let a merchant believe they had placed their shop when they had not. It asks for coordinates and says where to get them — hold a finger on the spot in any phone map app.

**Closing** a store sets `closed_at`; it does not delete. Orders were delivered from there and statements refer to it. An earlier draft used sort order and deleted the hours, which was both a convention three other queries would have had to know about and a lie — hours are kept per merchant here, so deleting them would have closed every store at once.

### Featured

This **asks; it does not sell**. No payment rail is connected, so a "Buy" button would promise something NexG cannot deliver. What it does honestly: show the price from `fn_featured_price`, check eligibility with `fn_featured_eligibility` — the same function the staff console and the nightly cron use — and put the merchant in the queue with somebody to call them.

Eligibility is deliberately not something money gets past. A guest has to be able to trust a card marked Sponsored.

## What a rider can do

| | |
|---|---|
| **Today** | On or off shift, cash against the cap, today and this week, what they are carrying |
| **Trips** | Live and historic, with what was earned and what was collected in cash |
| **Earnings** | Every trip broken down, and weekly settlements |
| **Documents** | Replace anything rejected, expiring or still wanted |
| **You** | Areas, shifts, and the furthest they will ride |
| **Messages** | Everything NexG has told them |

### Going on and off

Theirs. Clearing a cooldown or a staff pause is not — those were put there by somebody for a reason, and a switch that undid them would make the reason pointless. The page says which is which rather than failing silently.

A rider on a trip cannot go off until it is delivered. Somebody is waiting for it.

### Cash on hand

The number that quietly ends an evening. At the cap, no more cash-on-delivery jobs are offered — and a rider who does not know that just stops getting the jobs they want and never finds out why. So it is on the first screen, as a proportion, with a banner from 90%.

The page says plainly that collected cash is **not theirs**: it comes off the settlement.

### The furthest they ride

`bike_max_km` has teeth — the dispatch cascade reads it to decide whether to offer a job at all, measured across the whole ride rather than just the leg to the merchant. Capped at 25 km, and the refusal says why rather than just no.

Areas are different, and the page says so: jobs are matched by distance from the merchant, not by that list. What the list buys a rider is an easier first week in streets they know. A rider who thinks otherwise will keep adding areas waiting for work that was never going to come that way.

## Documents, both sides

One component, `components/partner/documents.tsx`, because the job is identical and two copies would drift. What differs is only the list of requirements, which the database already answers per owner.

- Each row uploads on its own, the moment it has what it needs. A partner on a phone in bad signal should not lose five files because the sixth failed.
- **Rejected first.** That is the one with a sentence attached telling them exactly what to do, and it is the thing standing between them and working.
- A re-upload supersedes rather than overwrites. Nothing a reviewer has already looked at is lost.
- A national ID counts only with both sides on file.
- `rpc_document_submit` checks membership, not status — so a live merchant and an active rider can both still replace an expiring document, which is the whole point of having this page after onboarding.

## Two bugs this build found

**A merchant could not see their own orders.** The `order_read` policy had `authz.works_merchant` — which is a *staff* grant, ops for that city — and not `is_merchant_member`. The one person the order is about could not read it. A merchant dashboard would have shown zero orders and looked exactly like a quiet day.

**Rider cash was compared in two units.** `rider.cash_on_hand` and `cash_cap` are whole shillings; `order.total_cents` is cents. `dispatch.fn_candidates` added one to the other:

```
cash_on_hand (1,400 shillings) + total_cents (151,000) > cash_cap (20,000 shillings)
```

True for any order over about two hundred shillings. **Every rider was excluded from every cash-on-delivery job**, with the reason "this order puts them over their cash cap" — plausible enough that nobody would have questioned it. A cascade that quietly refuses to dispatch cash orders and explains itself convincingly each time.

Caught by a seeded rider showing "KES 140,000" on their own dashboard: the same mistake read from the other end.

## Where the rules live

Nothing on these pages is the security boundary. Every query is filtered by a row policy, and every write goes through an RPC that re-checks ownership — a server action is still just an HTTP endpoint.

| | |
|---|---|
| a merchant is mine | `authz.is_merchant_member(merchant_id)` via `merchant_user` |
| a rider is me | `authz.is_rider_self(rider_id)` via `rider.user_id` |
| where this account belongs | `public.fn_partner_home()` |
| what a merchant may change | `rpc_merchant_add_store`, `_rename_store`, `_close_store`, `_set_prep`, `_request_featured`, `rpc_merchant_control` |
| what a rider may change | `rpc_rider_go_online`, `rpc_rider_update_profile` |

A rider sees the merchant on a job that is **theirs**, and no others. A policy giving them every live merchant would be a supplier list anybody who signs up as a rider could export.

## Local logins

In `supabase/seeds/partners.sql`, which runs on `supabase db reset` and never against production — the repository is public, so a password in it is a password everybody has.

| | state |
|---|---|
| `merchant.live@nexgapp.com` | live, two stores, trading, 100% |
| `merchant.docs@nexgapp.com` | submitted, one document rejected, 83% |
| `rider.active@nexgapp.com` | active, on shift, earning, a licence expiring this month |
| `rider.docs@nexgapp.com` | submitted, one document rejected, 66% |

Password for all four: `devpassword`.

Each is a different state because the states are the point — a merchant who is live has a different screen from one waiting on a document, and the only way to know either reads right is to have both.

## Still missing

- **No reply box** on either Messages page. Nothing drains `notification_log`, so a reply typed there would sit unread while the partner believed they had told us something. Both pages say where to reach a person instead.
- **No payment rail**, so Featured asks rather than sells and a merchant statement is a record rather than a receipt.
- **No map** for placing a store, as above.
- **Prices and new menu items** still go through the registration flow. A second, half-built editor here would be a second place for a price to be wrong.
