# Scaling plan

_Audit of 24 November 2026. Production numbers come from read-only queries on NexgApp
(`bmrrifvtfvgagkhrmitv`): Supabase advisors, `pg_stat_statements` (counting since 25 Aug 2026),
`pg_stat_user_tables` and `cron.job`._

## In one paragraph

NexG doesn't need a load balancer of its own. Vercel already spreads website, admin and API
traffic over its servers worldwide. Supabase already sits in front of the database and pools its
connections. What breaks first as users grow is narrower: a few slow database jobs and queries,
public pages that re-read the database on every visit, and the limits of the two **free plans**
(Supabase Free and Vercel Hobby). The first two are fixed in code here. The plans are the owner's
decision (see [What it costs to go further](#what-it-costs-to-go-further)).

## Where things stand today

| Measure                       | Now                                                    | Limit on the current plan                                   |
| ----------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| Supabase plan                 | **Free**                                               | 500 MB database, 1 GB files, 5 GB egress/month, 50,000 MAU  |
| Database size                 | 210 MB (98 MB of it is the scheduler's run log)        | 500 MB, then the database turns read-only                   |
| Database server               | Shared Nano (`max_connections` 60, 224 MB buffers)     | —                                                           |
| Open connections              | 23 (11 of them PostgREST)                              | 60                                                          |
| Backups                       | **None** on Free                                       | Daily backups start on Pro                                  |
| Realtime connections          | Used by notifications, admin live map, partner screens | 200 at once on Free                                         |
| Vercel plan                   | Hobby                                                  | Non-commercial use only; capped functions and bandwidth     |
| Largest live tables           | 9 orders, 39 merchants, 22 properties                  | —                                                           |

Data is tiny today. Every finding below is about what happens as those numbers grow.

## Findings

Each finding gives the rough user count where it starts to hurt, what to do, and whether this
change already does it. The user counts are estimates from today's query costs, not load tests.

### 1. The dispatch job held a connection and a transaction around the clock: fixed (migration)

- **What:** `dispatch-advance` ran `dispatch.cron_advance_minute()` once a minute. That call ran
  six ticks 10 s apart **inside one transaction**. Production: 72,826 runs averaging 50.1 s.
  - `now()` stays frozen for a whole transaction, so ticks 2–6 saw the same clock as tick 1 and
    found nothing new. **Rider offers really moved once a minute, not every 10 s.**
  - Nothing a tick changed became visible to riders or the desk until all 50 s had passed. The
    rows it touched stayed locked for that long.
  - It kept one of the 60 connections busy permanently.
- **When it matters:** now, for any live dispatch. It gets worse with every rider and order,
  because locks are held longer while more people wait on them.
- **Done:** migration `20270325000100_scaling_quick_wins.sql` schedules a new
  `dispatch.cron_advance_tick()` every `10 seconds`, one short transaction per tick. pg_cron
  1.6.4 supports seconds, and `native-push-dispatch` already runs every 5 s. The old function
  stays in place for rollback.

### 2. The scheduler's run log is half the database: fixed (migration)

- **What:** `cron.job_run_details` is 98 MB of 210 MB (276k rows kept for 30 days). The
  10-second tick would add about 90 MB more.
- **When it matters:** on Free, at 500 MB the database stops accepting writes. That would happen
  within months even with no users.
- **Done:** the same migration keeps 7 days of run log instead of 30. Nothing reads older runs.

### 3. Public pages re-read the database on every visit: fixed (code)

- **What:** `/categories`, `/merchants`, `/hosts` and `/stays` were `force-dynamic` +
  `fetchCache = 'force-no-store'`. That was the right fix for the November "frozen pages" bug,
  but it means every visitor triggers fresh database reads (stays: two queries; hosts: three).
  The homepage's category tiles were the one homepage read with no cache.
- **When it matters:** from a few thousand visits a day. A marketing push or a shared link sends
  traffic straight to the database.
- **Done:**
  - The four pages now use `revalidate = 60`. Their database reads go into Vercel's data cache
    for a minute, so 1 visitor or 10,000 cost the database the same. This was checked on a local
    production build: each read was stored with a 60-second lifetime.
  - The homepage categories go through `unstable_cache` (5 minutes) like the rest of the
    homepage.
  - Pages that must be exact (stay detail, booking, enquiry, pay, account) are unchanged and
    still read live.
- **Trade-off:** a new listing, price or category takes up to a minute to appear on those four
  pages (five on the homepage).
- **Still per visit:** the page itself is built on every visit, because the site header reads
  the visitor's language cookie (`getTranslations` in `lib/i18n`). That costs a Vercel function
  run per visit, though no database work.
- **Later (around 50,000+ page views a day, or when Vercel function usage nears the plan
  limit):** move the language choice into the URL (`/sw/...`) or into the browser. Whole pages
  could then be served from Vercel's CDN without running any code.

### 4. Database connections and pooling: fine as built

- **What:** the three Vercel apps never open Postgres connections. They use supabase-js over
  HTTPS (PostgREST, Auth, Storage), and Supabase pools those connections on its side. So there
  is no `DATABASE_URL` to put on the wrong pooler port in Vercel.
- **The two direct users:**
  - `apps/connector-worker` reads `DATABASE_URL`. As a long-running worker it should use the
    **session** pooler (port 5432 on `pooler.supabase.com`) or the direct host, never the
    transaction pooler (port 6543), which breaks prepared statements and session settings.
  - `apps/booking-engine` uses its own `BOOKING_DATABASE_URL` on the VPS, not NexgApp.
  - Any future serverless code that needs raw SQL (for example a Vercel function using `pg`)
    must use the **transaction** pooler, port 6543.
- **When it matters:** 60 connections is plenty while every app goes through PostgREST. With the
  dispatch fix, 23 in use drops to about 22.
- **To do:** nothing now. Recheck if connections in use pass ~45 (Supabase reports → Database).

### 5. Policies re-checked the signed-in user on every row: fixed (migration)

- **What:** five row-level security policies on `booking` and `customer_engine_booking` called
  `auth.uid()` once per row (advisor `auth_rls_initplan`).
- **When it matters:** when a customer has hundreds of bookings, or when staff list thousands.
- **Done:** they now use `(select auth.uid())`, which is checked once per query. Same rule, same
  rows.

### 6. Missing and duplicate indexes: fixed where it matters (migration)

- **What:** the advisor lists 484 foreign keys with no index. Almost all are staff or audit
  columns (`decided_by`, `signed_by`, …) on tables that stay small. The busiest lookups (orders
  by customer, merchant and rider; notifications by user; payments by order) were already
  indexed.
- **Done:** 14 indexes on tables that grow with customers: `order` (branch, zone), `order_item`
  (catalogue item, used by best sellers), `order_adjustment`, `order_rating` (rider), `payment`
  (merchant, guest), `customer_saved`, `customer_engine_booking`, `review`, `stay` (property),
  `msg_message`, `notification_outbox`. Two duplicate indexes are also dropped:
  `property_qr_code_idx` and `order_reference_idx`. Both copy a unique constraint, so every
  insert was paying twice.
- **Later (around 10,000 orders):**
  - 72 `multiple_permissive_policies` warnings mean some tables run two or three policies per
    row. Merge them table by table when a screen gets slow.
  - 145 "unused" indexes can't be judged until there is real traffic. Leave them.

### 7. The merchant list costs 11 ms per merchant: to do (next design change)

- **What:** the `merchant_public` view works out today's opening hours
  (`fn_merchant_effective_hours`, about 4 ms) and, for branches without a stored zone, the delivery
  zone (`zone_for_point`, about 7.5 ms) **for every merchant on every read**. With 11 live
  merchants a full read takes 126 ms. The API's `/v1/catalog/merchants` runs it about 26,000
  times (109 ms average).
- **When it matters:** around **300–500 live merchants** a full list takes 3–5 s and starts to
  time out. Search, Explore and the API all read this view.
- **To do:**
  - Store `zone_id` on each branch when its address is saved, so the view never does the map
    lookup.
  - Then cache "open today" per merchant in a small table refreshed by the existing minute cron.
  - Both are behaviour-sensitive (hours, holidays, busy mode), so they need their own change and
    tests. They aren't in this batch.

### 8. `/stays` loads every listing at once: to do (later)

- **What:** `property_public` is read with `select('*')` and no limit, then every unit of every
  property.
- **When it matters:** around 200–300 listed properties (page weight and query time). The
  60-second cache from finding 3 removes the database cost until then.
- **To do:** paginate, or show the first 24 with "show more".

### 9. Public API rate limits: in place, one setting to check

- **What:** `apps/api` already has a fleet-wide token bucket in Postgres (`fn_api_request_spend`):
  120 requests/min per key by default, at most 600. Anonymous reads are CDN-cached
  (`revalidate = 60`, `Vary: X-Api-Key, Authorization`), so they rarely reach the database.
- **Gap:** without `API_TRUSTED_PROXY_IP_HEADER`, all anonymous callers share **one** bucket. One
  noisy scraper can then rate-limit every keyless caller. Every API call also writes one bucket
  row.
- **When it matters:**
  - The shared bucket, as soon as third parties call the API without keys.
  - The bucket writes, at roughly 50 requests/second sustained.
- **To do:**
  - Confirm which header Vercel guarantees to overwrite (it documents `x-real-ip` and
    `x-forwarded-for` as set by its edge), then set `API_TRUSTED_PROXY_IP_HEADER` in the nexg-api
    project.
  - For floods, add a Vercel Firewall rate-limit rule on `api.nexgapp.com/v1/*` in the dashboard,
    so they're stopped before any function runs.

### 10. Sign-in limits see Vercel's address, not the visitor's: owner setting

- **What:** sign-in, sign-up and password reset run as Next.js server actions. Supabase Auth
  therefore sees a handful of Vercel server addresses, not each visitor's. Its per-IP limit
  (30 sign-ins and sign-ups per 5 minutes by default) is shared by everyone who signs in through
  the same Vercel address. Turnstile is already enforced, so the limit isn't the only bot
  defence.
- **When it matters:** around a few hundred sign-ins an hour at a busy moment (a launch, a
  campaign). Real customers would see "too many requests".
- **To do (free, dashboard):**
  - Supabase → Authentication → Rate Limits: raise "sign-ups and sign-ins" (for example to 300
    per 5 minutes) and "token refreshes".
  - Confirm custom SMTP is set. Without it Supabase sends at most 2 auth emails an hour.

### 11. Images and files: watch egress

- **What:** 23 places create **signed** Storage URLs while the page renders. A signed URL is
  different every time, so browsers and CDNs can't reuse yesterday's copy. Six places use
  `unoptimized` images. Free includes 5 GB of egress a month.
- **When it matters:** at roughly 25,000–50,000 page views a month with photos, depending on
  photo size. Egress runs out before anything else.
- **To do:**
  - Serve public catalogue, category and listing photos from **public** buckets with long cache
    headers. Keep signed URLs for private files (documents, payouts).
  - Send photos through `next/image` so Vercel resizes and caches them.
  - On Pro, egress rises to 250 GB.

### 12. Realtime: fine for now, switch method before it grows

- **What:** live updates use `postgres_changes` (customer notifications, admin live map and staff
  bell, partner screens). Supabase checks row-level security for every subscriber on every
  change, using one worker. The change-polling query has run 1.3 million times (6.6 ms each).
- **When it matters:** Free allows 200 connections at once (Pro 500). `postgres_changes` slows
  down at a few hundred subscribers on one table.
- **To do:** before about 200 people are online at once, move the customer notification feed to
  **Broadcast** (a database trigger calls `realtime.broadcast_changes`), which scales to
  thousands. Keep `postgres_changes` for the few staff screens.

### 13. Background jobs: fine after the dispatch fix

Ten jobs run every minute and one every 5 seconds. Apart from dispatch, none averages more than
0.2 s (`cron_zone_health` 201 ms, `cron_fin_rebuild` 147 ms every 2 minutes). Recheck when
orders pass ~10,000 a day, because finance and fraud sweeps read whole recent windows.

### 14. Read replicas, bigger compute, CDN

- **CDN:** already there. Vercel's edge serves pages and API answers, and Supabase Storage has
  its own CDN. Adding Cloudflare in front wouldn't help much.
- **Bigger compute:** the first real upgrade. The Free/Nano server has 0.5 GB of memory and a
  shared CPU. Move up when database CPU stays above ~70% or memory pressure shows in Supabase
  reports, probably around **2,000–5,000 daily active users** with the fixes above.
- **Read replica:** only once a single larger server is busy, mostly with reads, which is
  probably well past 20,000 daily users. It needs the Pro plan and Small compute or larger, and
  is billed as a second server. Writes (orders, payments) still go to the primary, so it doesn't
  help the busiest moments of checkout.

## What changed in this batch

- **Code (live after the next deploy):**
  - `apps/web/app/(customer)/{categories,merchants,hosts,stays}/page.tsx`: `revalidate = 60`
    replaces `force-dynamic` + `force-no-store`.
  - `apps/web/components/home/home-page.tsx`: homepage categories cached for 5 minutes.
- **Database (written, not applied to production):**
  - `supabase/migrations/20270325000100_scaling_quick_wins.sql`: findings 1, 2, 5 and 6.
  - Test: `supabase/tests/241_scaling_quick_wins.sql`.
  - Rollback: `supabase/rollback/20270325000100_scaling_quick_wins.sql`.
  - Rehearsed in a rolled-back transaction on a local stack with pg_cron 1.6.4: all 9 checks
    passed.
  - Production needs the release-gate session and the owner's yes.

## What it costs to go further

**The owner decides each item.** Prices are list prices as last known and may have changed:
check supabase.com/pricing and vercel.com/pricing before buying.

| Step                               | Price (approx.)                                                  | Do it when                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Supabase Pro**                   | **$25/month**, including $10 of compute (covers Micro, 1 GB)     | **Now, recommended.** Free has no backups for a database holding orders and money. It also caps at 500 MB and 50,000 monthly users, and pauses an inactive project. |
| **Vercel Pro**                     | **$20 per team member per month**                                | **Now, recommended.** Hobby is for non-commercial use only, and it caps functions, bandwidth and deploys (the 24-hour deploy limit you already hit). |
| Supabase compute Small → Medium    | about $15 → $60/month (instead of Micro's $10)                   | Database CPU stays above ~70% in Supabase reports, roughly 2,000–5,000 daily users.                                                               |
| Supabase compute Large             | about $110/month                                                 | Medium is busy, roughly 10,000+ daily users.                                                                                                     |
| Read replica                       | billed as a second server of the same size (e.g. +$60 for Medium) | A large server is busy mostly with reads, probably 20,000+ daily users.                                                                         |
| Extra egress or storage on Pro     | pay as you go beyond 250 GB egress / 100 GB files                | Photo-heavy traffic grows. Finding 11 delays it.                                                                                                 |

Recommended path: move to Supabase Pro and Vercel Pro (about **$45/month** for one Vercel seat),
apply this batch's migration through the gate, then watch the Supabase reports. Buy bigger
compute only when the CPU numbers ask for it.
