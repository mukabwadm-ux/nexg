# Review merchants: the complete plan

## Status, 27 Nov 2026

**Seeded on live.** The 19 shops in `scripts/review-merchants/shops.mjs` exist on live, made by `scripts/review-merchants/seed.mjs`:
- Every shop is live and at 100% portal readiness, with its own owner login.
- The catalogue is 110 items. Each has a photo, stored the way the portal stores one: `catalogue-images/<merchant>/<id>.jpg`.
- Each shop has a banner in `merchant-brand` and verified placeholder documents.
- The 47 bookable items are linked to booking-engine offerings, which have 45 days of sessions and departures.
- All 19 are test tenants: only staff and `payment_reviewer` accounts see them.

**How the run worked.** It used the same three steps as the "Running it" section below.

**Changes from the proposal below:**
- Shops use the backend master category list (what the portal gives real merchants), not the app's older keys.
- Shop 18 is adult wellness, because the master list has no tobacco.
- Payouts are held on every review shop.

**Still open (27 Nov 2026):**

- **A1, booking check:** fixed in mukabwadm-ux/nexg#244.
  - The fix is a migration plus a website change.
  - Catalogue and free-time reads are served for review shops.
  - Booking needs a staff or reviewer sign-in.
  - Live needs the migration pushed and the website deployed.
- **A2, Discovery cannot list review shops:** this is not fixable in the backend alone.
  - The app never sends the signed-in user to Discovery (`providers/engine/transport.ts`), so Discovery cannot tell a reviewer from the public.
  - It needs an app change. Either the app adds the shops a signed-in account can see in `merchant_public` (test tenants for reviewers) to Home and categories, or it forwards the user's token to Discovery.
- **A3, item facts:** Discovery still sends no photos, `kind`, booking links or rental facts for anyone. This matters for real merchants too.
- **A6, cinema sync:** off on live, so the review cinema has no showtimes.
  - The `cinema-worker` cron runs every minute.
  - Vault has no `cinema_worker_url` or `cinema_worker_secret`.
  - `POST https://www.nexgapp.com/api/internal/cinema/worker` answers 503 `not_configured`.
  - Fix:
    1. On Vercel (production), set `CINEMA_WORKER_SECRET` (at least 16 random characters) and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy.
    2. In the live SQL editor, add the same value to Vault: `select vault.create_secret('<same value>', 'cinema_worker_secret');` and `select vault.create_secret('https://www.nexgapp.com/api/internal/cinema/worker', 'cinema_worker_url');`.
- **Review account:** create it and add it to `payment_reviewer`.
- **A7 and A8 (app):** the two build switches, and hiding screens that have nothing behind them.
- **App category mapping:** see below.
- **Reviewer guide:** `REVIEWER_GUIDE.md`.

## Booking-engine limits found on 27 Nov 2026

The first live run left some bookings unusable in the app, so the setup was changed.

**The limit behind it.** Each shop has one booking profile, and a profile hosts only some booking types (`candidateModelIds` in `packages/booking-config`). No profile combines tickets and quotes, tours and quotes, car hire and quotes, or laundry and home visits. Only the restaurant profile hosts tables and courts.

**What changed:**
- **Tables and courts.** Kijiji and Uwanja use the restaurant profile, with `BQ_OFFERS_TABLE_RESERVATIONS`, a real `BQ_SPACE_POLICY` (each table or court and its party size, with a 15-minute turnover) and "pick one" resource selection.
- **Quotes** are only at Faraja and Anga, whose profiles host them.
- **Hidden:** the Sauti, Mjini and Gari quotes, Uwanja karting and party, and Safi home and office cleaning. Their rows are kept, made unavailable, and their offerings switched off.
- **Laundry** is collected and returned by the shop's van, so the windows have someone assigned.
- **Meet & greet** is greeter-only, with no vehicle.
- **Transfers** have a service area.
- **Resources** have real hours per shop. Airport transfers stay 24 hours. Resources that already have sessions keep their hours.

**Re-runs:**
- Re-runs revise an offering only when its setup changes. The revised offering is created first, then the old one is switched off, so a refusal leaves the old one working.
- Two further runs on the same engine made no changes.

**App gap.** The app sends no `specialist` details for tours. The engine needs `{ "model": "TOUR", "occurrenceId": "<departure id>", "itineraryVersion": 1 }` on the booking, or a tour booking is refused. With it, a test booking is accepted (status pending).

## Running it

```
node scripts/review-merchants/seed.mjs --target local --generate-password      # local Supabase + local engine
node scripts/review-merchants/seed.mjs --target live --generate-password --skip-engine
#   then engine-runner.mjs inside the booking engine container on the server, saving links.json
node scripts/review-merchants/seed.mjs --target live --generate-password --skip-files --engine-links links.json
node scripts/review-merchants/seed.mjs --target live --remove                  # take them all away
```

**Each run:**
- Updates rows in place, by fixed `ae7e…` ids.
- Keeps any booking offering that already exists, so portal edits win.
- Writes the logins and password to the git-ignored `.booking-local/review-portal-logins-<target>.txt`.

**Needs:**
- Live SQL: `REVIEW_PROD_SQL`, pointing at a `query-production.sh` that has its credentials file.
- Uploads: `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the public key). Uploads go in as each shop's own login, so no service key is used.

**App gap found while seeding.** The app maps merchants with its older category keys:
- It has no mapping for `games_sports`.
- It does not match master subcategories such as `concerts_festivals`, `city_cultural_tours` and `gym`. Those shops therefore get the plain shop page rather than their dedicated one.
- Bookings still work, because each item sets its own `kind`.
- This affects real merchants too.

---

The original proposal (26 Nov 2026) follows.

**Goal:** an Apple or Google reviewer can finish every workflow they can tap in the NexG consumer app. Each review shop has its own merchant-portal login, where the owner can change anything.

**How this was checked:**
- The app's own routing (`resolveOffering`) was run over all 115 subcategories.
- Every item-sheet part, button wording and dedicated screen was read.
- So were the Discovery engine, the booking bridge and the backend's go-live, readiness and payment rules.

## A. Code that must change first

Seeding data alone cannot get past these. Each needs code, and each one blocks review.

| # | Problem | Effect today | Fix | Where |
|---|---|---|---|---|
| A1 | The website's public booking check reads `merchant_public` with the anon key (`apps/web/lib/booking/public-access.ts:34-41`). Test shops are hidden from anon. | Every booking at a review shop answers 404, even for the reviewer. | Check with the caller's token, or with the service role plus the test-tenant rule. | This repo, `apps/web` |
| A2 | Discovery reads with the anon key and nothing calls `rpc_sees_test_tenants`. | Review shops never appear on Home, in categories, in search, in car hire or transfers, or in Plan My Day. | Ask with the caller's token, or keep a separate reviewer view. | This repo, `discovery/discovery-engine` |
| A3 | Discovery sends only shop name, area and location, plus each item's name, description and price. | Car hire shows "No cars are listed". The transfer screen can only use item names. List cards have no photos, opening hours or booking links. | Add photos, `kind`, `booking_offering_id` and hours. Add rental facts: seats, car type, daily price and terms. **No Supabase column exists for these yet**, so the source must be added too. | Discovery engine, plus a backend column or attribute |
| A4 | No provider fills `item.trip` (duration, itinerary, inclusions). | The tour page shows only "Trip type, Operator based in, Price". Departures still work on the item sheet, from the engine's sessions. | Decide the source (catalogue details or the engine) and fill it. | App and backend |
| A5 | The booking engine's catalogue is hidden until `configuration.published`. | No booking works until each shop is set up and published. | The seed script sets up and publishes through the engine API. | Seed script |
| A6 | Cinema sync runs from `cron_cinema_worker`, using Vault `cinema_worker_url` and `cinema_worker_secret`. | Without them there is no programme. | Confirm they are set on live. | Owner or ops |
| A7 | App build switches. | Without them there are no booking buttons and no cinema. | `EXPO_PUBLIC_BOOKING_APP_SIGN_IN=on` and `EXPO_PUBLIC_CINEMA_SOURCE=supabase` in the production environment. | App or Android chat |
| A8 | Screens with nothing behind them: flight search always says "unavailable", and Rewards and NexG Plus have no connector. Flights is also a retired category on the backend. | A reviewer can tap them and reach a dead end. | Hide them in the store build. | App |
| A9 | The eSIM code is sent by the shop, by hand. | A reviewer waits for a code. | Owner sends it during review, or test shops send a test code automatically. | Owner decision |
| A10 | After "ready", order stages (picked up, delivered) are rider-only. Test orders send no rider. | A review order stops at "ready". | Staff finish them with `rpc_order_mark`, as the review notes say, or test orders auto-advance. | Owner decision |

## B. What every review shop gets (all seeded, idempotent, fixed ids)

**Login**
- `auth.users` (email confirmed) plus `auth.identities`, and `merchant_user` with role `owner`.
- Password alone works; MFA is off.
- The password is typed when the script runs and passed in as a psql variable. It is never in a file.

**Merchant row**
- `status='live'`, `went_live_at`, `explore_visible=true`, `accepting_orders=true`.
- `accepts_test_payments=true` (test shop).
- `category`, `category_key` and `subcategory` from `category_config`.
- `commission_pct`, `prep_minutes`, and answers to the category questions.
- **No `merchant_application` row.** Without one the shop counts as legacy, with full access and no 7-minute idle sign-out.

**Branch:** primary branch at real Westlands coordinates in an active zone. The delivery check allows up to 15 km.

**Hours:** `merchant_hours` 00:00 to 23:59 for all 7 days (`weekday_convention='monday_zero'`), so reviewers in any time zone find it open.

**Payout:** `payout_rail` and `payout_account` set to a clearly marked test value. Test payments move no money and post nothing to the ledger, and no Paystack subaccount is needed.

**Documents:**
- Every document from `fn_merchant_required_docs(id)`, `verified`, expiring 31 Dec 2027.
- Each is a one-page PDF stamped "NexG review test shop: not a real document", stored under `partner-documents`.
- The merchant row is inserted as live first, then the documents. The other order changes its status.

**Agreements:** category agreement and DPA acceptances, so the Documents page looks finished.

**Catalogue**
- At least 2 named sections and 6 to 10 items, so readiness counts them and the shop pages group them.
- Every item has a `photo_path` in `catalogue-images`. Photos are the Unsplash images already used by our demo catalogue, downloaded once.
- Names, descriptions and prices are taken from our own demo catalogue (`discovery/demo-seed`). Shop names are "NexG Review …".

**Bookings**
- Booking items have `kind` and `booking_offering_id` set.
- The engine gets: setup published; resources with 24/7 schedules; offerings with `intakeMode` set to instant (never merchant approval, so a reviewer is never left waiting); sessions and departures for 30 days ahead; ticket types; rental terms; quote ranges.

**Restricted items:** alcohol needs a verified `liquor_licence` before age-restricted items show. Pharmacy needs `pharmacy_premises_licence`.

## C. The shops

One per category. Shops 1 to 15 cover every workflow, every shop page and every feature. Shops 16 to 19 only stop their categories from being empty, and each is a policy question for Apple.

| # | Shop | Backend category / subcategory | App page | What a reviewer completes |
|---|---|---|---|---|
| 1 | NexG Review Kitchen | restaurants_food / restaurant | Restaurant menu | Dishes with choices and add-ons, a combo bundle, an offer price, Popular, delivery, pickup or scheduled, group order, Reserve a table |
| 2 | NexG Review Market | groceries_essentials / supermarket | Supermarket aisles | Shelf items, per-kg items priced after weighing, one sold-out item |
| 3 | NexG Review Fashion | fashion_apparel / shoes | Shop | Shoes and T-shirts by size and colour, one size sold out, XL priced higher |
| 4 | NexG Review Mobile | tech_electronics / telecom_services | Shop | eSIM (digital, passport or ID), phone case by model and colour |
| 5 | NexG Review Gifts | flowers_gifts / cakes | Shop | Cake with a message, flowers |
| 6 | NexG Review Home | marketplace / home_living | Shop | Home items, Goes well with |
| 7 | NexG Review Spa & Fitness | beauty or wellness / spa | Appointment page | Massage (pick a therapist, free times), gym monthly pass |
| 8 | NexG Review Events | experiences / events | Event page | Concert with Regular and VIP tickets on dated sessions, private event quote with 50% deposit |
| 9 | NexG Review Cinema | experiences / cinemas | Movies | Seat map (the sandbox cinema connection) |
| 10 | NexG Review Play | games_sports / courts | Shop | Reserve a court (players), go-karting session ticket |
| 11 | NexG Review Tours | travel_tours / city tours | Tour operator page and tour page | City tour with daily departures, travel package quote |
| 12 | NexG Review Transfers | airport_transfers / airport_pickup | Airport transfers screen and operator page | "Sedan: JKIA to Westlands" and "Sedan: Westlands to JKIA", meet and greet |
| 13 | NexG Review Car Hire | vehicle_rentals / car_rental | Car hire screen | Sedan and SUV per day with deposit (self-drive and with a driver), bike per day, corporate hire quote, car wash service job, car wash plan |
| 14 | NexG Review Laundry | laundry_cleaning / laundry | Shop | Laundry drop-off and collection windows, home cleaning at your address |
| 15 | NexG Review Concierge | concierge_services / personal_assistance | Shop | Request with quote and deposit |
| 16 | (decide) Alcohol | alcohol_beverages / wine | Shop | "Adults only, rider checks ID" |
| 17 | (decide) Pharmacy | pharmacy | Shop | Prescription notice |
| 18 | (decide) Adults only | adults_only / tobacco | Shop | Look only |
| 19 | (decide) Flights | retired on the backend | — | Recommend hiding the category instead |

Exact subcategory ids are checked against live `category_config` when the script is built.

## D. Order of work

1. **Code fixes A1 to A3**, each a reviewed PR in this repo: the booking check, and Discovery seeing test shops and sending the missing facts. A4 and A7 to A8 go to the app chats.
2. **The seed script**, `scripts/review-merchants.mjs` (SQL plus engine API), with `--remove`. Run it against local Supabase and a local booking engine first. This needs Docker, which is the one heavy step on this machine.
3. **Live run**, only with the owner's yes: SQL through `scripts/query-production.sh`, and engine calls from the VPS. The bridge secret never leaves the server.
4. **Reviewer guide:** for each workflow, which shop to open and what to tap, with the test card.
