# NexG · Front-door build plan

**What ships:** the public homepage, the rider application, the merchant application, and the admin review that approves them — nothing becomes visible or dispatchable until an admin has verified the documents.
**How to use this file:** work through the milestones in order. Each has a goal, deliverables, a checklist, a definition of done, and a Claude Code prompt to paste into VS Code. Prompts reference `NexG-Build-Prompt-01-Front-Door.md` (the master spec) — keep both files in the repo root under `docs/` so Claude Code can read them.
**Staff domain:** `nexgapp.com`.
**Estimated effort:** 6–8 working weeks for one experienced full-stack developer working with Claude Code; faster with two.

---

## Milestone map

| # | Milestone | Outcome you can see | Prompt |
| --- | --- | --- | --- |
| M0 | Workstation and accounts | You can run `supabase start` and `pnpm dev` locally; every account exists | manual checklist |
| M1 | Repository and design system | Monorepo builds on CI; `/ui-kit` shows every component in the NexG look | Prompt M1 |
| M2 | Database, security, audit | Schema resets from zero; RLS tests pass; audit chain verifies | Prompt M2 |
| M3 | Public homepage | nexgapp.com homepage live on a preview URL, capturing leads and waitlist | Prompt M3 |
| M4 | Rider application | A rider can apply, verify by SMS, upload documents, see status | Prompt M4 |
| M5 | Merchant application | A merchant can apply, verify by email, pin location, upload documents, see status | Prompt M5 |
| M6 | Admin review | Staff sign in with nexgapp.com, review documents, activate riders, go-live merchants | Prompt M6 |
| M7 | Notifications, tests, launch | SMS/email on every decision; e2e suite green; production deploy | Prompt M7 |

Suggested pacing: M0–M1 week 1, M2 week 2, M3 week 3, M4 week 4, M5 week 5, M6 weeks 6–7, M7 week 8.

---

## M0 · Workstation and accounts (you, manual)

**Goal:** everything Claude Code will need exists before it starts, so no milestone is blocked on a signup.

**Checklist — machine**

- [ ] VS Code with extensions: ESLint, Prettier, Tailwind CSS IntelliSense, Prisma/SQL syntax (any), GitLens, Playwright Test
- [ ] Node 20 LTS (via `nvm` or `fnm`), `pnpm` (`npm i -g pnpm`)
- [ ] Docker Desktop (needed by the Supabase CLI for local Postgres)
- [ ] Supabase CLI (`npm i -g supabase`), Vercel CLI (`npm i -g vercel`), GitHub CLI (`gh`)
- [ ] Claude Code installed and signed in; run it from the repo root

**Checklist — accounts**

- [ ] Google Workspace on `nexgapp.com` with 2-step verification enforced; at least two accounts that will be super admins
- [ ] GitHub organisation `nexg` (or your choice) with a private repo `nexg-platform`; branch protection on `main`; secret scanning on
- [ ] Supabase project `nexg-staging` in an EU or South Africa region; note the project ref, anon key, service role key, database URL; enable point-in-time recovery
- [ ] Vercel team connected to the GitHub repo
- [ ] Google Cloud project with Maps JavaScript, Places and Geocoding APIs enabled; one browser key restricted to `nexgapp.com` and `*.vercel.app`; one server key; monthly budget alert
- [ ] Africa's Talking account; sandbox API key now; start the `NEXG` sender-ID registration (takes weeks)
- [ ] Resend (or Postmark) account; add `mail.nexgapp.com` with SPF, DKIM, DMARC
- [ ] Sentry project and PostHog project (free tiers)
- [ ] Google OAuth client for Supabase Auth (Web application type) with the Supabase callback URL; note client id and secret

**Definition of done:** a `.env.local` on your machine with every key from the table below filled (or a sandbox value), and `supabase start` running.

| Variable | Source |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` | Supabase project settings |
| `SUPABASE_AUTH_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_GOOGLE_SECRET` | Google Cloud OAuth |
| `STAFF_EMAIL_DOMAIN=nexgapp.com` | fixed |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_SERVER_KEY` | Google Cloud |
| `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` | Africa's Talking |
| `RESEND_API_KEY`, `EMAIL_FROM=NexG <hello@mail.nexgapp.com>` | Resend |
| `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY` | Sentry, PostHog |

---

## M1 · Repository and design system

**Goal:** a monorepo that builds, lints, type-checks and tests on CI, with the NexG design tokens and the shared components every later milestone uses.

**Deliverables:** Turborepo with `apps/web`, `apps/admin`, `packages/ui`, `packages/db`, `packages/config`; GitHub Actions workflow; Vercel projects for both apps with preview deploys; `/ui-kit` page in admin showing every component in every state; `docs/` folder holding the two spec files.

**Checklist**

- [ ] `pnpm install && pnpm build && pnpm lint && pnpm typecheck && pnpm test` all green locally and on CI
- [ ] Manrope loaded with `next/font`; tokens in `packages/ui/tokens.css` and the Tailwind preset
- [ ] Components: Button, Input, PhoneInput, Select, ChipGroup, Stepper, FileDrop, StatusBadge, Tag, Card, KpiTile, DataTable, DetailPanel, Toast, EmptyState
- [ ] Both apps deploy to a Vercel preview from a pull request
- [ ] `README.md` explains local setup in under ten steps

**Definition of done:** a teammate can clone, run `pnpm dev`, open both apps and the `/ui-kit` page in under 15 minutes.

**Prompt M1** (paste into Claude Code at the repo root)

```
You are building the NexG platform. Read docs/NexG-Build-Prompt-01-Front-Door.md fully before doing anything; sections 0, 1 and 2 govern this milestone. Ask me only where the spec says [DECIDE].

Milestone M1 — Repository and design system.

1. Scaffold a Turborepo + pnpm monorepo exactly as section 1 describes: apps/web, apps/admin (both Next.js 14 App Router, TypeScript strict), packages/ui, packages/db, packages/config. Use shadcn/ui as the base for packages/ui. Add Vitest, Playwright, ESLint, Prettier, and a GitHub Actions workflow that runs install, build, lint, typecheck and test on every pull request.
2. Implement the design tokens from section 2 as CSS variables in packages/ui and as a Tailwind preset in packages/config. Load Manrope via next/font in both apps.
3. Build every component listed in section 2 with loading, error, disabled and empty states, keyboard accessibility, and mobile-first sizing (390 px viewport must work). PhoneInput defaults to +254 and emits E.164.
4. Create apps/admin/app/ui-kit/page.tsx rendering every component in every state, grouped by component, so I can review the look in one page.
5. Add .env.example listing every variable in docs/NexG-Front-Door-Build-Plan.md M0 table. Never commit real keys.
6. Write README.md: prerequisites, local setup, scripts, how to add a component.
Commit in small conventional commits. Stop when CI is green and tell me what to review.
```

---

## M2 · Database, security and audit

**Goal:** the whole schema for this slice, with row-level security, the document-requirement rules, the status functions that enforce the approval gate, and the append-only hash-chained audit log — all reproducible with `supabase db reset` and covered by tests.

**Deliverables:** migrations in `supabase/migrations`; seeds (cities, roles, document requirements, empty settings); generated TypeScript types in `packages/db`; RLS test file; audit chain trigger and nightly verification function; `public.merchant_public` view.

**Checklist**

- [ ] All enums and tables from spec section 3.2 exist with `created_at`/`updated_at` triggers
- [ ] `document_requirement` seeded with the 13 rows in the spec; `city` seeded with 11 cities (3 live, 1 soft launch, 7 waitlist)
- [ ] `fn_rider_required_docs`, `fn_merchant_required_docs`, `fn_partner_recompute_status`, `rpc_activate_rider`, `rpc_merchant_go_live` implemented and unit-tested in SQL
- [ ] `audit.audit_event` with hash chain trigger; UPDATE and DELETE raise even for `service_role`; `audit.verify_chain()` function scheduled nightly with pg_cron
- [ ] RLS policies from section 3.4 with a test for every policy (allowed and denied cases)
- [ ] Storage bucket `partner-documents` with path policy and 5-minute signed URLs
- [ ] `pnpm db:reset` and `pnpm db:types` scripts work; types committed

**Definition of done:** `supabase db reset` from an empty database succeeds, RLS tests pass, and inserting three audit events then verifying the chain returns OK while tampering with one returns a failure.

**Prompt M2**

```
Read docs/NexG-Build-Prompt-01-Front-Door.md; section 3 governs this milestone. The monorepo from M1 exists.

Milestone M2 — Database, security and audit.

1. Write Supabase migrations for every enum, table, function, view, trigger and policy in section 3, in dependency order, with comments. Money columns are bigint cents; ids are uuid; every table has created_at/updated_at with a trigger.
2. Seed data: the 11 cities (Nairobi, Mombasa, Kisumu live; Nakuru soft_launch; Kampala plus six more East African cities as waitlist), the 8 roles, the 13 document requirements exactly as the spec's table, and the setting keys with null values.
3. Implement the audit schema: audit_event with the hash chain trigger (sha256 of prev_hash || canonical JSON of the row), a BEFORE UPDATE OR DELETE trigger that raises for every role including service_role, an audit.verify_chain() function, and a pg_cron job at 02:00 Africa/Nairobi that calls it and writes a result row to audit.chain_check.
4. Implement fn_rider_required_docs, fn_merchant_required_docs, fn_partner_recompute_status (called by a trigger on document insert/update), rpc_activate_rider and rpc_merchant_go_live as security definer functions that check the caller's role grant for the city, require all required documents verified, set status/actor/timestamp, and insert the audit event in the same transaction.
5. Create the public schema view merchant_public exposing only status = 'live' merchants and grant select to anon; confirm anon cannot read the merchant table directly.
6. Write RLS tests (pgTAP or a SQL script run by a Vitest wrapper) covering every policy in section 3.4, both allowed and denied cases, including the finance/super_admin grant check constraint.
7. Add scripts: db:reset, db:types (generates packages/db types), db:test. Wire db:test into CI.
Commit per logical group of migrations. Stop when db:reset and db:test pass and report which policies are tested.
```

---

## M3 · Public homepage

**Goal:** the homepage from the `BookingFirst` artboard live on a preview URL, honest about what it can do today (captures concierge leads and waitlist sign-ups), fast on a phone.

**Deliverables:** `/` and the full-screen menu; city section from the database; lead form and app-notify form writing to `waitlist_signup`; `/hosts`, `/careers`, `/help`, `/legal` as designed-copy "coming soon" placeholders so no link 404s; SEO metadata, sitemap, robots, Open Graph image; PostHog events.

**Checklist**

- [ ] Every section of the artboard present in order, copy verbatim
- [ ] Lighthouse mobile: performance ≥ 85, accessibility ≥ 95, no layout shift on hero
- [ ] Lead form submits without an account and shows the WhatsApp follow-up toast
- [ ] Featured merchants renders placeholder cards with the Sponsored label until real slots exist
- [ ] Cities section reads from `city` and shows "1–5 of 11"
- [ ] Partner band links: List Your Airbnb → `/hosts`, Become A Rider → `/riders`, Register Your Business → `/merchants`, View Openings → `/careers`
- [ ] Vercel preview URL shared for review on desktop and phone

**Definition of done:** you open the preview on your phone, submit a lead and a waitlist email, and both rows appear in Supabase with the right `source`.

**Prompt M3**

```
Read docs/NexG-Build-Prompt-01-Front-Door.md section 4.1. The design artboards are the source of truth for layout and copy; I will attach screenshots of BookingFirst and MenuOpen — reproduce them section by section, do not rewrite copy.

Milestone M3 — Public homepage in apps/web.

1. Build / with these sections in order: top bar with city selector and Sign in; hero with the rotating category word; the "Start your order" card that captures a concierge lead (where staying, what needed, when) into waitlist_signup with source 'homepage_request' and shows the designed confirmation; the three-step how-it-works; Popular requests chips that prefill the lead form; Featured merchants reading public.merchant_public and falling back to the designed placeholder cards with the SPONSORED label; Everything we arrange; Cities where we deliver from the city table showing live and soft-launch first with the "1–5 of 11" pager; the partner band "Host, ride, list or join."; the app coming-soon notify form writing to waitlist_signup with source 'homepage_app'; footer.
2. Build the full-screen menu (MenuOpen) with the same links including "For Airbnb hosts".
3. Create /hosts, /careers, /help, /legal as placeholder pages using the designed headings so no link 404s.
4. Add metadata, Open Graph image, sitemap.xml, robots.txt; add PostHog with events lead_submitted and waitlist_joined; add Sentry.
5. Optimise for a mid-range Android on 3G: next/image with sizes, lazy sections, no client JS on static sections, no layout shift on the hero.
6. Add Playwright test: phone viewport, pick a popular request, submit lead, assert row.
Stop when the Vercel preview is up and Lighthouse mobile performance is at least 85; give me the preview URL.
```

---

## M4 · Rider application

**Goal:** a rider can apply from `/riders`, verify their phone by SMS, upload the documents their vehicle requires, and follow their status — with the database, not the UI, deciding when they are active.

**Deliverables:** `/riders` marketing page; `/riders/apply` three-step flow; phone OTP via Supabase Auth with Africa's Talking hook; document upload to `partner-documents`; `/riders/status` with realtime updates; `/riders/sign-in`.

**Checklist**

- [ ] Marketing sections from the `Riders` artboard, copy verbatim
- [ ] Step 1 creates `auth.users` + `rider` (status `applied`) only after OTP success; waitlist city captured and stopped gracefully
- [ ] Step 2 lists exactly the documents `fn_rider_required_docs` returns; plate number required for motorised vehicles; uploads resumable; images compressed client-side
- [ ] Status page shows badge, per-document state and rejection reasons, re-upload, WhatsApp link; updates live when staff act
- [ ] Rider cannot see or edit another rider's rows (RLS test added)
- [ ] Playwright: motorbike applicant reaches "Under review"

**Definition of done:** you apply on your own phone with a test OTP, upload six documents, and see "Under review".

**Prompt M4**

```
Read docs/NexG-Build-Prompt-01-Front-Door.md section 4.2. I will attach the Riders artboard screenshot; reproduce the marketing sections verbatim.

Milestone M4 — Rider application in apps/web.

1. Build /riders with all designed sections and the "Become a rider" entry card.
2. Build /riders/apply as a three-step flow with the Stepper component: (1) About you — first name, last name, phone, city chips from the city table (waitlist city → capture to waitlist_signup and stop with the designed message), vehicle chips; on Continue send an OTP through Supabase phone auth using an Africa's Talking send-SMS hook (sandbox in dev), verify, then create the rider row with status applied. (2) Your documents — render the rows from fn_rider_required_docs with FileDrop, expiry date where has_expiry, plate number field required when vehicle is not bicycle; each upload saves independently to the partner-documents bucket at the spec's path and inserts a document row; the step is resumable. (3) Done — designed copy and link to status.
3. Build /riders/status for a signed-in rider: status badge, checklist with per-document state and rejection reason, re-upload on rejected, onboarding session date if set, WhatsApp deep link; subscribe with Supabase Realtime so staff decisions appear without refresh.
4. Build /riders/sign-in (phone OTP); a user without a rider row is directed to apply.
5. Add RLS tests proving a rider cannot read or update another rider's rider or document rows.
6. Playwright: apply as motorbike rider with a test OTP, upload six fixture files including plate, assert status under_review.
Stop when the flow works end to end on the preview and report any spec ambiguity you resolved.
```

---

## M5 · Merchant application

**Goal:** a merchant can apply from `/merchants`, verify by email, pin their location, upload category-specific documents, and see that their store is not public yet.

**Deliverables:** `/merchants` marketing page including the `[—]%` pricing block driven by settings; `/merchants/apply` four-step flow; magic-link auth; Google Places location step; `/merchants/status`; `/merchants/sign-in`.

**Checklist**

- [ ] Marketing sections from the `Merchants` artboard, copy verbatim; pricing renders `[—]%` until `setting` has a value
- [ ] Business step creates `auth.users` + `merchant` + `merchant_user(owner)` after magic-link verification
- [ ] Location step: Places autocomplete biased to Nairobi, draggable pin, stored on `merchant_branch` as primary; city derived from pin
- [ ] Documents step lists exactly `fn_merchant_required_docs` (pharmacy shows a licence, restaurant shows a food handler certificate)
- [ ] Status page banner "Your store is not public yet — N documents awaiting review" and the public-card preview
- [ ] RLS test: a merchant user sees only their merchant
- [ ] Playwright: pharmacy applicant sees seven required documents and reaches "Under review"

**Definition of done:** you apply as a test pharmacy, and `public.merchant_public` returns nothing for it.

**Prompt M5**

```
Read docs/NexG-Build-Prompt-01-Front-Door.md section 4.3. I will attach the Merchants artboard screenshot; reproduce the marketing sections verbatim.

Milestone M5 — Merchant application in apps/web.

1. Build /merchants with all designed sections. The "Simple pricing" block reads setting.commission_pct_by_category and renders [—]% when null; the Get featured section is informational with a coming-soon anchor.
2. Build /merchants/apply as four steps: (1) Business — legal name, trading name, category chips (plus Other with free text), contact person, phone, email; send a Supabase magic link; on verification create merchant (status applied) and merchant_user (owner). (2) Location — Google Places autocomplete biased to Nairobi with a draggable pin, save to merchant_branch as primary with geography point and address text, derive city_id from the pin where possible else offer the city chips. (3) Documents — rows from fn_merchant_required_docs, same upload component as riders, category-specific rows appear automatically. (4) Done — designed copy and link to status.
3. Build /merchants/status: the "not public yet" banner with the pending count, checklist with states and reasons, re-upload, and a read-only preview card of how the store will appear once live (trading name, category, city).
4. Build /merchants/sign-in (magic link); a user without a merchant_user row is directed to apply.
5. RLS test: merchant user A cannot read merchant B, its branches or documents.
6. Playwright: apply as a pharmacy, verify with a test magic link, pin a location, assert seven required documents, upload fixtures, assert under_review, and assert public.merchant_public does not return it.
Stop when the flow works on the preview.
```

---

## M6 · Admin review

**Goal:** staff on `nexgapp.com` sign in, see only the modules their roles allow, review each document with a reason, and are the only path to a rider becoming active or a merchant going live.

**Deliverables:** admin shell (sidebar, top bar, city switcher) from the console design; `A0` staff sign-in with domain check; Riders: Directory, Pipeline, Documents; Merchants: Directory, Pipeline, Documents; document review panel with Verify / Reject with reason / Activate / Go live; a minimal Audit → Activity table for super admins; a script to grant the first super admin.

**Checklist**

- [ ] Google sign-in restricted to `nexgapp.com` with a server-side check; account without `staff_user` refused with the designed message
- [ ] Sidebar shows the designed groups; modules outside this slice disabled with a "Phase 1" tooltip
- [ ] Rider and merchant pipelines as kanban with the designed columns; no drag — stage changes only through review actions
- [ ] Document review panel with image/PDF viewer via signed URL, issued/expiry fields, Verify, Reject with reason (list + free text); Activate rider requires plate for motorised vehicles; Go live enabled only when all required documents verified
- [ ] Every action writes an audit event; the Activity table shows them with actor, action, target, before/after
- [ ] `pnpm admin:grant --email you@nexgapp.com --role super_admin` bootstraps the first admin
- [ ] Playwright: rider_ops for Nairobi sees only Nairobi riders; reject → re-upload → verify → activate produces the right statuses and audit rows

**Definition of done:** you sign in with your nexgapp.com account, reject one of your test rider's documents with a reason, re-upload from the phone, verify all, activate, and see the SMS log and audit chain entries.

**Prompt M6**

```
Read docs/NexG-Build-Prompt-01-Front-Door.md section 5 and section 6 of the architecture principles it references. I will attach screenshots of A0_StaffSignIn, B2_RiderPipeline, B7_RiderDocuments, A5b_MerchantPipeline and A13_MerchantDocuments; match their layout and labels.

Milestone M6 — Admin console in apps/admin.

1. Staff sign-in: Supabase Google OAuth with hd=nexgapp.com, plus a server-side check that the email domain is nexgapp.com and a staff_user row exists; otherwise show the designed refusal. Load role_grant rows into the session; middleware protects every route by module and city.
2. Shell: the designed 240 px black sidebar with groups Operate, Partners, Grow, Money, Control and all items, disabling those outside this slice with a "Phase 1" tooltip; top bar with search, city switcher limited to granted cities, bell, user chip with role; the DetailPanel pattern on the right.
3. Riders module: Directory (filterable DataTable), Pipeline (kanban columns Applied, Documents pending, Under review, Active; Suspended and Offboarded collapsed; cards with name, city, vehicle, plate, days in stage, pending-document count), Documents (review queue oldest first grouped by rider; panel with signed-URL viewer, issued/expiry, Verify, Reject with reason from a list plus free text; Activate rider button appears when all required documents are verified and calls rpc_activate_rider; require plate_no for motorised vehicles).
4. Merchants module: Directory, Pipeline (Applied, Documents pending, Under review, Live; Paused and Delisted collapsed), Documents with the same review component and a Go live button calling rpc_merchant_go_live, plus a "Preview public card" that renders what merchant_public will expose.
5. Audit → Activity: read-only table for super_admin showing audit events with actor, action, module, target, before/after diff in the panel.
6. Add a CLI script pnpm admin:grant --email --role [--city] that creates staff_user and role_grant (for finance/super_admin it requires --approved-by another super admin email).
7. Playwright: staff without staff_user refused; rider_ops Nairobi sees only Nairobi; full reject → re-upload → verify → activate path with audit assertions; merchant go-live makes merchant_public return the merchant.
Stop when all admin flows work on the preview and tell me the bootstrap command to create my own super admin.
```

---

## M7 · Notifications, tests and launch

**Goal:** every decision reaches the applicant by SMS or email, the whole slice is covered by the acceptance suite, and production is live on `nexgapp.com`.

**Deliverables:** notifications module with templates and `notification_log`; nightly chain verification alert stub; complete Playwright suite from spec section 6 on CI; production Supabase project and Vercel production deployments; runbook.

**Checklist**

- [ ] Rider SMS on submitted, verified, rejected (with reason), activated; merchant email on the same plus the two-working-days acknowledgement; every send logged with provider id
- [ ] Chain verification failure sends an email to super admins (stub provider in staging)
- [ ] All eight acceptance tests green on CI
- [ ] Production Supabase project created by applying the same migrations; secrets in Vercel production env only
- [ ] Domains: `nexgapp.com` → web, `admin.nexgapp.com` → admin; HTTPS; Google OAuth redirect updated
- [ ] Backup restore into staging tested once and written down
- [ ] `docs/RUNBOOK.md`: how to grant a role, add a document requirement, rotate a key, restore a backup, verify the audit chain

**Definition of done:** a real rider and a real merchant apply on production, are reviewed by a colleague with the right role, and receive the SMS/email — and you can show the audit chain for both.

**Prompt M7**

```
Read docs/NexG-Build-Prompt-01-Front-Door.md sections 5.4, 5.5, 6 and 7.

Milestone M7 — Notifications, acceptance tests and launch.

1. Build a notifications module in apps/web's server code (shared by admin through a package): templates in code for the rider SMS events (submitted, document verified, document rejected with reason, activated) and merchant email events (submitted with the two-working-days acknowledgement, document verified, rejected with reason, live); providers Africa's Talking and Resend behind an interface with a console provider for local dev; every send inserts a notification_log row with provider id and status; sends are triggered from the same functions that write the audit event.
2. Add the nightly chain-check alert: if audit.chain_check reports a failure, email all super_admin staff.
3. Complete the Playwright acceptance suite exactly as section 6 lists (eight tests), runnable on CI against an ephemeral Supabase started by the CLI.
4. Production: document and script the steps to create the production Supabase project, apply migrations, set Vercel production env vars, map nexgapp.com and admin.nexgapp.com, and update the Google OAuth redirect. Do not put real secrets in the repo.
5. Write docs/RUNBOOK.md covering role grants, adding a document requirement, key rotation, backup restore into staging, and audit chain verification.
Stop when CI is fully green and hand me the launch checklist in order.
```

---

## Review points (you)

| After | What you check | Time |
| --- | --- | --- |
| M1 | `/ui-kit` looks like the canvas: black, gold, Manrope, spacing | 20 min |
| M3 | Homepage on your phone; copy and order match; lead lands in Supabase | 30 min |
| M4, M5 | Apply yourself as a rider and a merchant; is anything confusing on a phone? | 45 min each |
| M6 | Review your own applications as staff; try to reach "active" without verifying — it must be impossible | 45 min |
| M7 | Read RUNBOOK; watch one real application go through | 1 h |

## Decisions still open (defaults in use)

| Decision | Default until decided |
| --- | --- |
| Good-conduct certificate at application or at onboarding | at application |
| Merchants from waitlist cities | captured as waitlist, not applications |
| Who is the second super admin | needed for the first finance/super_admin grants |
| WhatsApp number for rider and merchant support links | placeholder until provided |
