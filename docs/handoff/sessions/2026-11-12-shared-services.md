# Shared services handoff, 12 November 2026

> **Rider sign-in belongs to another developer.** Do not design or change it, and check with them before any rider work.

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

1. **Fix the holes.** Done in #146 (below).
2. **Get the owner's decisions D1 to D15.** D1 to D6 come first. Build nothing in phase 3 before the answers.
3. **Build each shared piece once.** Point every app at it, then retire the copies.

Backend changes go through one coordinating session: `supabase/` migrations and functions, and server and API routes. App teams send what they need and why. Each team still owns its own app's code. The owner sets the order.

## Phase 1: PR #146

| Migration        | Change                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20261211000100` | Drops `rpc_payment_authorised` and its `wiring_anon_allow` row. Nothing has called it since Paystack was removed.                                                                                                        |
| `20261211000200` | `rpc_order_place_web` no longer attaches an existing customer record by phone. A number already on file is refused (hint `phone_on_file`), and support links it.                                                        |
| `20261211000300` | A privacy request links only the signed-in requester's own record. Staff verification links by exact phone or account email.                                                                                             |
| `20261211000400` | `fn_web_order_quote` applies the liquor-licence rule. It also refuses orders while a shop is closed by its hours or has closed early.                                                                                    |
| `20261211000500` | Ordering, booking and stay holds need a real account, not an anonymous session. Pending bookings are released after 24 hours, or at their start time (`fn_booking_release_stale`, pg_cron every 5 minutes, setting `booking.pending_release_hours`). |
| `20261211000600` | `dispatch.rpc_job_start` needs live ops in the order's city, or the service role. `rpc_offer_respond` locks the job first and answers `already_taken`, `job_closed` or `duplicate`. Bar orders no longer fail dispatch. |
| `20261211000700` | `authz.is_host_member` now means a member with access to every unit. Staff limited to some units are checked per unit.                                                                                                   |

Also in the PR:

- `checkout-form.tsx` sends an anonymous session to sign in.
- Test `47_stay_checkout` is updated.
- New tests `supabase/tests/65` to `71`.
- Types are regenerated.

**Tests:** run on a separate local stack, rebuilt from zero with all migrations and seeds.

- `supabase test db`: 73 files, 1,320 tests, all pass.
- `db lint`: nothing new.

**CI:** every check passes except Playwright, which is not a required check. Its 18 failures are main's own website tests, and #146 touches none of those pages:

- pages wider than the screen at 360 and 390 px (the ask, experience, hosts and stays pages);
- `e2e/web/home.spec.ts`, which still expects the old headline.

**Release:**

1. Merge. Vercel deploys the website, admin and API.
2. The same day, the owner runs the database push from an up-to-date copy of `main`.

Either order is safe, but don't leave a long gap between them.

**Owner decisions behind it (12 Nov):**

- **Phone already on file:** refused, and support links it. SMS-code linking can replace this later, with D6.
- **Shop hours:** closed hours and closing early block orders. Busy mode is unchanged.
- **Accounts:** an account is needed to order, book or hold a stay.

## Decisions waiting for the owner

| #   | Decision                                                                                                                 | Recommendation                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | One booking system: Supabase bookings, or the separate booking engine (`apps/booking-engine`). Today they share nothing. | Supabase bookings, linked to orders and payments. Retire the engine, or make it a screen over Supabase.                                                                |
| D2  | How apps start a payment. Today only the website's server routes can.                                                    | Supabase Edge Functions: one path for the website and every app.                                                                                                       |
| D3  | Payment methods                                                                                                          | M-Pesa, bank, and cash on delivery where the shop allows it. No card until a provider exists. One list that every app reads.                                         |
| D4  | Basket                                                                                                                   | A basket saved to the account. A signed-out basket merges in at sign-in.                                                                                               |
| D5  | Who moves an order through its steps                                                                                     | The merchant accepts or declines, then marks ready. The rider marks picked up, arriving, delivered (with proof) and cash collected. The customer can cancel until the merchant accepts. Staff can do any step. |
| D6  | One sign-in                                                                                                              | Every app on the one Supabase account, with Google and Apple sign-in and the phone confirmed by SMS code. For rider sign-in, ask its developer first.                  |

These are also needed before launch:

- **D7:** move the Stays app onto Supabase stays and retire its local host service.
- **D8:** notification channels and phone push.
- **D9:** who owns the category list (Discovery has its own).
- **D10:** one request path that reaches merchants.
- **D11:** one inbox and one review path.
- **D12:** one storage layout.
- **D13:** where each service runs. The website, admin and API already deploy on Vercel; only the connector worker is open.
- **D14:** packaging for `@nexg/maps`.
- **D15:** one settlement system for merchants, riders and hosts.

## Queue

**Open backend PRs:**

- **#132, customer account controls.** It needs two changes:
  - Renumber its migrations after `20261211000700`.
  - Add `host_user`, `hotel_user` and `rider` links to the `business_account` blocker in `fn_customer_deletion_blockers`.

  It is needed for the Consumer store release.
- **#59, merchant application hardening.** Renumber it (it reuses `20261111000000`), then review it.
- **#89.** Replaced by #145; close it.

**Requests from the app teams.** None is started. The owner sets the order; the suggested order is #146, #132, R1, then R3, R8 and R9.

- **R1:** public privacy-policy and support pages, which the app stores require.
- **R2:** the Discovery engine at a public https origin. This is hosting (D13).
- **R3:** an approximate point per property in `property_public` and `property_unit_public`. Decide how coarse it should be.
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
  - Database migrations reach production only when the owner runs `scripts/push-to-production.sh` from an up-to-date `main`, with a dry run first.
  - Never connect to or migrate the hosted database yourself.
  - For each change, tell the owner whether the merge or the database push goes first.
- **SQL gotchas:**
  - `text[] || 'literal'` reads the literal as an array; cast it with `::text`.
  - `data_request_kind` is `access`, `erasure`, `rectification` or `restriction`.
  - `fn_booking_open_at` treats a shop with no hours on file as closed.
  - A pgTAP test that switches roles needs `grant usage` on its `pg_temp` schema (see tests 19 and 70).
- **Commits and PRs:** only when the owner asks.

## Next steps

1. The owner merges #146 and runs the database push the same day.
2. Ask the owner D1 to D6, then D7 to D15.
3. Finish #132.
4. Work through the queue in the owner's order.
