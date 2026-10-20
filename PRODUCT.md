# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Guests** in Kenyan cities who want food, groceries or experience-day bookings delivered or arranged without doing the legwork themselves — browsing merchants, building a cart, checking out, and (for experience days) describing a budget and mood for a concierge to plan around.
- **Merchants** (restaurants, shops, experience vendors) who run a portal: manage their catalogue and prices, track orders, and see their own transaction and payout breakdowns.
- **Riders** who deliver orders and are verified before they can be dispatched.
- **Staff / admins**, operating the separate admin console: verify riders' and merchants' documents before anything they offer goes live or dispatchable, review orders, see full transaction breakdowns, and manage staff accounts and roles.

## Product Purpose

NexG is a concierge delivery and booking platform for Kenya: guests order from real, verified merchants (food, goods) or ask for a budgeted experience day, pay by card, M-Pesa or cash on delivery, and get it delivered or arranged, with a rider network and an admin team that verifies every merchant and rider before they can appear publicly.

## Positioning

Unlike a plain delivery marketplace, NexG also does bespoke "experience day" planning (a concierge assembles a day's bookings against a stated budget and mood) and nothing — no merchant, rider, or catalogue item — becomes publicly visible or dispatchable until admin has verified the documents behind it; that rule is enforced in the database, not just the interface.

## Operating Context

- Multi-city, zone/coverage-aware (merchants and delivery are scoped to a city/zone).
- Currency is KES throughout; amounts are stored in cents.
- Checkout methods: card and M-Pesa (via Paystack today, with direct Safaricom Daraja STK Push being wired), and cash on delivery.
- Two separate apps: `apps/web` (public, guest- and merchant-facing) and `apps/admin` (staff-only console), sharing one Supabase/Postgres backend and a design-system package (`packages/ui`).
- Merchants manage their own catalogue pricing from a merchant portal; every paid order gets a detailed transaction/payout breakdown visible to both admin and the merchant.

## Capabilities and Constraints

- Admin/staff accounts have roles; a super admin role exists and (as of this task) can reset another staff member's login credentials.
- Payout/commission rates are currently placeholder values pending the operator's real pricing plan.
- M-Pesa payouts to merchants/riders, ledger posting, and reconciliation are not yet wired — only STK Push checkout (collection) is.
- Accessibility/compliance standard not yet specified — treat as an open decision rather than inventing one.

## Evidence on Hand

- `docs/` in the repo contains the experience/booking spec, finance notes, merchant onboarding, rider onboarding, messaging and push-notification docs, and a going-live checklist — these are real internal specs, not placeholders.
- No customer testimonials, press, or case studies exist; do not fabricate any.

## Product Principles

- Nothing goes live or dispatchable without admin document verification — this is a trust mechanism, not a cosmetic gate.
- Money is never trusted from the client: amounts, quotes and payment state are always read from or decided by the database/RPC layer.
- Every paid transaction must be explainable — a full breakdown is available to admin and to the merchant involved, not just a total.
- Guest checkout should work without requiring upfront merchant account creation friction, but every payment path must be verifiable server-side before anything is marked paid.

## Accessibility & Inclusion

Not yet established as a project requirement — open decision.
