# Shared services handoff, 12 November 2026 (updated 22 November)

> **Rider sign-in belongs to another developer.** Do not design or change it, and check with them before any rider work.

## Where it stands on 22 November

The owner, 22 Nov 2026: "proceed, as long as they are using one shared backend for everything, even on the app it should be functional once all this is fixed." Asked whether the later decisions on payments and bookings replace D1 to D3, the owner kept them.

**Decided:**

| #   | Outcome                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Bookings stay in the booking engine.** Apps book through the website's bridge (`20270116000300_app_bookings`), paid by Paystack with deposits (#190). Supabase `customer_booking` is not the booking system for apps. |
| D2  | **Done (website on it 22 Nov).** One payment route for every client: `POST /api/customer/checkout/orders/{orderId}/payment` on the website, signed in by bearer token (apps) or session cookie (website); `GET /api/customer/checkout/payment-methods` lists what is on offer. M-Pesa goes to Safaricom (Daraja) until Paystack is live, then to Paystack. The website-only start routes are gone. Not an Edge Function. Contract: `docs/shared-services/payments.md`. |
| D3  | **Paystack:** card, M-Pesa and Airtel through one company account (owner, 21 Nov), plus bank transfer. Cash on delivery is no longer offered on customer orders (owner, 20 Nov; `20270128000100`); staff may still place cash orders. Test mode until the owner switches it live. |
| D4  | **Done.** A basket saved to the account; a signed-out basket merges in at sign-in (`20270216000100`, live 22 Nov). Contract: `docs/shared-services/basket.md`. |
| D5  | **Paying confirms the order** (owner, 18 Nov), so the shop starts and readies it with no separate accept; rider and customer steps as recommended. Each step was already built (`20270109000300`, `20270115000400`, `20270115000600`, `20270128000100`). `20270221000100` adds one table of the steps (`order_step_rule`), a guard that refuses any other stage change, and `rpc_order_next_steps` for every app's buttons. A shop may decline an order before starting it (owner, 22 Nov): `rpc_merchant_order_decline`, `20270222000100`, with a reason, a full automatic refund if paid, and a Decline button on the Work page. Contract: `docs/shared-services/order-steps.md`. |
| D6  | One Supabase sign-in for every app; rider sign-in not touched. In production only email and guests are on (22 Nov). The website's Google and Apple buttons are built and wait for the owner's provider keys and `NEXT_PUBLIC_AUTH_GOOGLE`/`_APPLE`; phone confirmation by SMS code is on the account page and waits for an SMS provider (owner to choose: Africa's Talking needs a send-SMS hook, Twilio does not). Contract: `docs/shared-services/sign-in.md`. |

Also decided since 12 Nov: guests may order delivery on a temporary (anonymous) session (18 Nov, `20270109000100_guest_orders`); bookings and stay holds still need an account. Order together (group baskets) is `20270130009000`.

**The open PRs below were rebuilt on `main` by langs4u and closed:**

| PR                             | Now on `main`                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #132 customer account controls | `20270116000200_customer_account_deletion` (the business-account blocker covers riders, hosts and hotel staff) and `20270116000700_customer_account_controls` |
| #148 native stay checkout      | `20270123000100_native_stay_checkout`, `docs/booking-engine/native-stay-checkout.md`                                                                          |
| #150 rider courier sharing     | `20270109000200_maps_rider_sharing`                                                                                                                           |
| #151 native push (D8)          | `20270120000100_native_push`, `docs/handoff/sessions/2026-11-19-native-push.md`                                                                               |

**The phone apps' repositories** are not reachable from the shared-services machine, so each shared piece ships as the backend plus a written contract in `docs/shared-services/` for the app teams.

**Order of the remaining work:** D6 sign-in, then R3, R8 and R9. Also open: the website's stay checkout still starts M-Pesa through `/api/payments/mpesa/stay`; a merchant health score is not computed anywhere yet (`merchant_health_snapshot` has no writer), so shop declines are recorded (`cancel_reason_code = 'merchant_declined'`) but not yet scored.

For whoever continues the shared-services work. The owner sends the private parts separately:

- open security items and credentials handling;
- notes specific to the owner's computer;
- the full review, the "NexG Shared Services Map";
- the chat this work came from.

**Keep those out of this repository. It is public, and that includes issues, PRs and commits.**

## The job

Each NexG surface built its own basket, checkout, payments, bookings, sign-in and messages. The goal is one shared Supabase backend in this repository, used by:

- the website (`apps/web`, including Discovery at `/discover`);
- the merchant and admin tools;
- the Consumer, Stays and Rider phone apps, which live in separate repositories.

There are three phases:

1. **Fix the holes.** Done in #146, merged and live since 16 Nov 2026 (below).
2. **Get the owner's decisions D1 to D15.** D1 to D6 come first. Build nothing in phase 3 before the answers.
3. **Build each shared piece once.** Point every app at it, then retire the copies.

Backend changes go through one coordinating session: `supabase/` migrations and functions, and server and API routes. App teams send what they need and why. Each team still owns its own app's code. The owner sets the order.

## Phase 1: PR #146

Renumbered on 15 Nov 2026 to follow the migrations `main` gained after 12 Nov, the last being `20261222090000`: now `20261223000100` to `0700`, tests 81 to 87. The maps migrations in #146 were replaced by #149's production versions, `20261220000100` to `0300`.

Also fixed while merging on 15 Nov:

- **Holidays.** `fn_merchant_open_for_orders` now counts a public-holiday answer as hours. Before, a shop with no weekly hours that closed for a holiday still took orders while its store page showed it closed. Test 84 covers it.
- **Discovery's contract copy.** `discovery/src/providers/engineContract` matches the engine's contract again, with the new optional viewport fields.

| Migration        | Change                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261223000100` | Drops `rpc_payment_authorised` and its `wiring_anon_allow` row. Nothing has called it since Paystack was removed.                                                                                                                                    |
| `20261223000200` | `rpc_order_place_web` no longer attaches an existing customer record by phone. A number already on file is refused (hint `phone_on_file`), and support links it.                                                                                     |
| `20261223000300` | A privacy request links only the signed-in requester's own record. Staff verification links by exact phone or account email.                                                                                                                         |
| `20261223000400` | `fn_web_order_quote` applies the liquor-licence rule. It also refuses orders while a shop is closed by its hours or has closed early.                                                                                                                |
| `20261223000500` | Ordering, booking and stay holds need a real account, not an anonymous session. Pending bookings are released after 24 hours, or at their start time (`fn_booking_release_stale`, pg_cron every 5 minutes, setting `booking.pending_release_hours`). |
| `20261223000600` | `dispatch.rpc_job_start` needs live ops in the order's city, or the service role. `rpc_offer_respond` locks the job first and answers `already_taken`, `job_closed` or `duplicate`. Bar orders no longer fail dispatch.                              |
| `20261223000700` | `authz.is_host_member` now means a member with access to every unit. Staff limited to some units are checked per unit.                                                                                                                               |

Also in the PR:

- `checkout-form.tsx` sends an anonymous session to sign in.
- Test `47_stay_checkout` is updated.
- New tests `supabase/tests/81` to `87`.
- Types are regenerated.

**Tests:** run on a separate local stack, rebuilt from zero with all migrations and seeds.

- `supabase test db`: 73 files, 1,320 tests, all pass.
- `db lint`: nothing new.
- Again on 15 Nov, after merging with `main` and #149: 87 files, 1,574 tests, all pass. Types regenerate unchanged.

**CI:** every check passes except Playwright, which is not a required check. Its 18 failures are main's own website tests, and #146 touches none of those pages:

- pages wider than the screen at 360 and 390 px (the ask, experience, hosts and stays pages);
- `e2e/web/home.spec.ts`, which still expects the old headline.

**Released on 16 Nov 2026.** #146 went into `main` together with #149 as `8dea675`. All nine migrations were applied to production the same day: #149's `20261220000200` and `0300`, then `20261223000100` to `0700`. Each was checked against its file's fingerprint.

Checked again on 18 Nov:

- All 19 functions the two PRs define still run exactly their version, and the wiring check has 0 findings.
- Order placement, booking and stay holds refuse signed-out callers.
- The release job runs every 5 minutes without failures.
- No orders, bookings, stay holds, dispatch jobs or privacy requests have come in since, so the first real ones will be the real-world test of these rules.

**Owner decisions behind it (12 Nov):**

- **Phone already on file:** refused, and support links it. SMS-code linking can replace this later, with D6.
- **Shop hours:** closed hours and closing early block orders. Busy mode is unchanged.
- **Accounts:** an account is needed to order, book or hold a stay.

## Fixed since #146 (17 Nov 2026)

These turned up while checking the shared services. All four are on `main` and in production.

| Problem                                                                                                                                                                                                                   | Fix                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved delivery places never reached a signed-in customer's account. The website's location actions used the signed-out client, so `rpc_place_list`, `rpc_place_confirm` and `rpc_place_delete` were refused for everyone. | The actions use the visitor's session and skip the call when nobody is signed in. "Just this once" pins stay off the account (`f53c884`). Saving still needs a manual test with a real account.                                        |
| The nightly document-expiry job failed every night. Pausing a live merchant that was taking orders broke `merchant_not_live_takes_no_orders`, and the job's single transaction then expired nothing.                      | `fn_partner_recompute_status` turns orders and the concierge pick off when it pauses a merchant, and `fn_expire_documents` expires each document in its own subtransaction (`20270101000200`). The first successful run was on 17 Nov. |
| `rpc_merchant_membership_update` failed on every call, because it wrote text into the `merchant_user_role` enum.                                                                                                          | The role is validated and cast, only an owner can change the team, and a blank role no longer trips the last-owner check. `cashier` is now a role (`20270101000300` and `0400`).                                                       |
| The 21-category master list dropped the Adult age check on four specialties and stranded merchants on retired subcategories.                                                                                              | `20270102120100` and `20270102120200`.                                                                                                                                                                                                 |

## Decisions waiting for the owner

| #   | Decision                                                                                                                 | Recommendation                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | One booking system: Supabase bookings, or the separate booking engine (`apps/booking-engine`). Today they share nothing. | Supabase bookings, linked to orders and payments. Retire the engine, or make it a screen over Supabase.                                                                                                        |
| D2  | How apps start a payment. Today only the website's server routes can.                                                    | Supabase Edge Functions: one path for the website and every app.                                                                                                                                               |
| D3  | Payment methods                                                                                                          | M-Pesa, bank, and cash on delivery where the shop allows it. No card until a provider exists. One list that every app reads.                                                                                   |
| D4  | Basket                                                                                                                   | A basket saved to the account. A signed-out basket merges in at sign-in.                                                                                                                                       |
| D5  | Who moves an order through its steps                                                                                     | The merchant accepts or declines, then marks ready. The rider marks picked up, arriving, delivered (with proof) and cash collected. The customer can cancel until the merchant accepts. Staff can do any step. |
| D6  | One sign-in                                                                                                              | Every app on the one Supabase account, with Google and Apple sign-in and the phone confirmed by SMS code. For rider sign-in, ask its developer first.                                                          |

These are also needed before launch:

- **D7:** move the Stays app onto Supabase stays and retire its local host service.
- **D8:** notification channels and phone push. Approved on 15 Nov, and #151 implements it.
- **D9:** who owns the category list. The 21-category master list now lives in `packages/contracts/src/data/category-master.json` and the database. Discovery follows it through its own copied files, which can drift.
- **D10:** one request path that reaches merchants.
- **D11:** one inbox and one review path.
- **D12:** one storage layout.
- **D13:** where each service runs. The website, admin and API already deploy on Vercel. Still open:
  - the connector worker;
  - the booking engine. Its VPS deploy kit (#78) brings its own web server on ports 80 and 443, and those ports are already in use on the target server.
- **D14:** packaging for `@nexg/maps`.
- **D15:** one settlement system for merchants, riders and hosts.

## Queue

**Open backend PRs.** On 18 Nov, `main`'s newest migration was `20270105020300`. Number after `main`'s newest, and check again right before pushing.

- **#132, customer account controls.** It is needed for the Consumer store release, and needs three changes:
  - Renumber it: `20261205000100` and test `61` are taken on `main`.
  - Drop its saved-places part, which re-creates #149's live `customer_saved` table, policies and `rpc_saved_add`.
  - Add `host_user`, `hotel_user` and `rider` links to the `business_account` blocker in `fn_customer_deletion_blockers`.
- **#148, native stay checkout.**
  - Renumber it: `20261220000100` and `0200` are taken by the maps migrations.
  - Its stay holds go through `rpc_stay_hold`, so the account rule applies.
  - Its app-side M-Pesa prompt is a second way to start payments, so settle it together with D2.
- **#150, rider courier sharing, and #151, native push (D8).** No clashes. Renumber them after `main`'s newest to keep the apply order; tests 78 and 79 are still free.
- **#152, rental discovery facts.** `20261116000000` sorts before `main`'s newest, so renumber it.
- **#59, merchant application hardening.** It reuses `20261111000000` and carries an older `tg_merchant_application_write_guard`. Rebase it onto `main`'s current guard (`20261218000100`), then review it.

**Smaller open items:**

- **Team permissions.** Removing members (`rpc_merchant_membership_remove`) and sending invites (`rpc_merchant_invite_member`) need only membership, not ownership. That is the owner's call.
- **Old branch.** `claude/shared-services-42601f` still has #146's old migration numbers and can be deleted.
- **Duplicate test numbers** on `main`: 35 (2 files), 70 (2 files) and 99 (4 files).

**Requests from the app teams.** None is started. The owner sets the order; the suggested order is #132, R1, then R3, R8 and R9.

- **R1:** public privacy-policy and support pages, which the app stores require.
- **R2:** the Discovery engine at a public https origin. This is hosting (D13).
- **R3:** settled 22 Nov: no change. The owner kept the exact pin public (decided 20 Nov, `20270125000100`), so `property_public` and `property_unit_public` already give the apps each property's and unit's `latitude` and `longitude` for a map.
- **R4:** account deletion for Stays accounts. #132 covers customers.
- **R5:** a host API on Supabase, replacing the Stays app's local host service (D7).
- **R6:** an App Review demo account for host features, after R4 and R5.
- **R7:** public merchant ratings and customer order ratings (D11).
- **R8:** merchant traits, a staff-only place ID per branch, a popularity band from 0 to 3, and the customer's recent categories.
- **R9:** `plan_block.merchant_id`.
- **R10:** films, showings and ticket prices for cinemas (D9).
- **R11:** Play, Flights and Cinemas categories. Paused by the owner on 12 Nov; see below.

### R11 notes (paused)

Proposed keys, which Discovery has confirmed:

- **Play:** category `activities_games_sports`, with `bowling`, `arcade_games`, `escape_rooms`, `indoor_courts`, `outdoor_courts`, `football_pitches`, `outdoor_team_games`, `go_karting`, `paintball`, `ziplining`, `swimming_sessions`, `swimming_lessons` and `pool_lane_hire`. Keep these exact keys.
- **Flights:** category `flights`, with `helicopter_charters`, `private_charters`, `scenic_flights` and `safari_flights`.
- **Cinemas:** subcategory `cinemas` under `experiences`.

What a build needs:

1. **Database:**
   - enum values, in their own migration;
   - `category_config` rows;
   - the `business_types` question, plus a `cinemas` option on Experiences' question;
   - catalogue examples;
   - a Flights document requirement (suggested: `air_operator_certificate`);
   - a new `merchant_application_registry` revision. Without it, self-serve sign-up rejects the new categories. `scripts/generate-merchant-application-registry.mjs` shows how `profile_questions` are derived.
2. **No commission per category.** Commission is set per tier.
3. **`packages/booking-config`:**
   - Subcategory variants need a base profile in the same category, and no audited profile is a space reservation. So Play and Flights need their own added profiles.
   - Keep the package self-contained: the booking-engine image copies only `packages/config` and `packages/booking-config`.
   - Add the new revision to `BOOKING_REGISTRY_REVISIONS`.
4. **`packages/contracts/src/taxonomy.ts`:** the categories, plus their `CATEGORY_IMAGE_MAP` entries. An unknown id falls back to the restaurant photo.
5. **Merchant console:**
   - `modelForWorkflow` needs a fallback for profiles that have no audited views.
   - Count-based tests change when profiles are added; compare #100.
6. **The owner's unpushed Play work.** The owner has an unfinished version of Play that was never pushed. Ask them for it rather than starting over.

## Working here safely

- **Migrations:**
  - Number them after the latest on `main` and on open PRs.
  - Before redefining a function, find its latest body with a case-insensitive search. `20260101017700_every_action_is_accounted_for.sql` uses uppercase `CREATE OR REPLACE`.
  - `create or replace` keeps grants.
- **The wiring check** (`fn_wiring_check`, test 26) fails CI in two cases:

  - an `rpc_*` writes without calling `audit.log`, unless it is in `wiring_audit_exempt`;
  - a SECURITY DEFINER function that writes is executable by anon without a `wiring_anon_allow` row.

  Anonymous sessions still count as `authenticated`.

- **Local tests:**
  1. Copy `supabase/` and change `project_id` and every port, so you don't touch anyone else's stack.
  2. Start it without the optional services.
  3. Run `test db --local`, then `db lint --local --level warning`. Lint exits 0 even when it finds errors, so compare its output before and after your change.
  4. Finish with `stop --no-backup`.
- **Types:** CI regenerates `packages/db/src/types.generated.ts` with Supabase CLI 2.121.0 (`pnpm db:types`) and Prettier 3.4.2, and fails on any difference.
- **Production:**
  - A merge to `main` deploys the website, admin and API immediately.
  - Database migrations reach production only when the owner applies them, after a go-ahead. That is either `scripts/push-to-production.sh` from an up-to-date `main` (dry run first), or by hand with each file's fingerprint checked.
  - Production can apply migrations out of version order. When a file sorts before one already applied, `supabase db push` needs `--include-all`, and no later migration may redefine the same objects.
  - Never connect to or migrate the hosted database yourself.
  - For each change, tell the owner whether the merge or the database push goes first.
- **SQL gotchas:**
  - `text[] || 'literal'` reads the literal as an array; cast it with `::text`.
  - `data_request_kind` is `access`, `erasure`, `rectification` or `restriction`.
  - `fn_booking_open_at` treats a shop with no hours on file as closed.
  - A pgTAP test that switches roles needs `grant usage` on its `pg_temp` schema (see tests 19 and 70).
- **Commits:** `main` takes direct pushes with no required checks, so run typecheck, lint and the affected tests first. Commit and push only when the owner asks.

## Next steps

1. Ask the owner D1 to D6, then D7 to D15.
2. Rework #132 first, for the Consumer store release, then the other open backend PRs.
3. With the owner: try saving a delivery place while signed in, and watch the first real orders, bookings and stay holds under #146's rules.
4. Work through the queue in the owner's order.
