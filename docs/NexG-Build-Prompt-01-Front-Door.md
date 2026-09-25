# NexG · Build prompt 01 · Front door

**Scope:** public homepage, rider application, merchant application, and the admin review that approves them.
**Companion documents:** *NexG Platform Architecture* (Claude Doc) — sections 3, 4.5, 5.4 and 6 govern this slice. Design canvas: artboards `BookingFirst`, `MenuOpen`, `Riders`, `Merchants`, `A0_StaffSignIn`, `B2_RiderPipeline`, `B7_RiderDocuments`, `A5b_MerchantPipeline`, `A13_MerchantDocuments`.
**Out of scope for this prompt:** ordering, Explore, checkout, dispatch, payments, ledger, rider app, host portal. Do not scaffold them.

---

## 0. Ground rules for the agent

1. Read this whole file before writing code. Ask for a decision only where a `[DECIDE]` marker appears; otherwise use the defaults given.
2. Work in small pull-request-sized commits with conventional commit messages. Each commit must leave `pnpm build`, `pnpm lint`, `pnpm typecheck` and `pnpm test` green.
3. No invented business numbers. Where the design shows `[—]` (commission, fees, counts), the UI shows `[—]` too, sourced from a `settings` row that is empty, never a hard-coded figure.
4. Every state change on a rider, merchant or document writes an `audit_event` in the same transaction. There is no code path that changes status without one.
5. Public visibility is a database rule: the `public` schema views return only `merchant.status = 'live'`. The frontend never filters on status itself.
6. Copy comes from the design artboards. Do not rewrite headings, button labels or FAQ text; the founder has signed them off.
7. The apps must work on a mid-range Android phone over 3G: images lazy-loaded and sized, forms usable one-handed, no layout shift.

## 1. Repository and tooling

```
nexg/
  apps/
    web/          # public site: homepage, /riders, /merchants (+ application flows)
    admin/        # console: staff sign-in, rider & merchant pipelines, document review
  packages/
    ui/           # shared components + design tokens (shadcn/ui based)
    db/           # Supabase migrations, generated types, seed
    config/       # eslint, tsconfig, tailwind preset
  supabase/       # config.toml, migrations, functions (edge)
```

- Turborepo + pnpm workspaces. Next.js 14 App Router, TypeScript strict, Tailwind, shadcn/ui, React Hook Form + Zod, TanStack Query for client data.
- Supabase: Postgres 15, Auth, Storage, Realtime. Local dev via `supabase start`. Types generated into `packages/db` on every migration (`pnpm db:types`).
- Testing: Vitest (unit), Playwright (e2e: apply as rider, apply as merchant, review and approve in admin), pgTAP or a SQL test file for RLS policies.
- CI: GitHub Actions running the four checks plus `supabase db reset` against migrations. Preview deploys on Vercel per PR.
- Env: `.env.example` lists every variable. Never commit real keys.

## 2. Design system (`packages/ui`)

Tokens (from the canvas, use exactly these):

| Token | Value |
| --- | --- |
| `--bg` | `#F6F3EC` |
| `--ink` | `#141414` |
| `--gold` | `#D4A72C` |
| `--gold-text` | `#B8901F` |
| `--border` | `#ECE8DF` / strong `#DDD8CC` |
| `--muted` | `#4d4a44` / lighter `#6f6a61` |
| success | `#1F7A3A` on `#E9F5EC` |
| danger | `#B42318` on `#FDECEA` |
| warning | `#8a6a10` on `#FBF7EA` |
| font | Manrope (400/600/700/800), via `next/font` |

Components to build first (all keyboard-accessible, all with loading and error states): `Button` (black, gold, outline), `Input`, `PhoneInput` (Kenyan +254 default, E.164 output), `Select`, `ChipGroup` (city, vehicle, category pickers), `Stepper`, `FileDrop` (image/PDF, 10 MB, client-side compression for photos), `StatusBadge`, `Tag`, `Card`, `KpiTile`, `DataTable` (sortable, filterable, row-select), `DetailPanel` (right-side drawer used across the console), `Toast`, `EmptyState`. Storybook is optional; a `/ui-kit` route in `apps/admin` that renders every component in every state is required.

## 3. Database (`supabase/migrations`)

### 3.1 Enums

```sql
create type partner_status as enum ('applied','documents_pending','under_review','live','paused','delisted');
-- riders use the same shape with 'active' in place of 'live'
create type rider_status as enum ('applied','documents_pending','under_review','active','suspended','offboarded');
create type document_status as enum ('uploaded','verified','rejected','expired');
create type vehicle_type as enum ('motorbike','bicycle','car','tuktuk');
create type merchant_category as enum ('restaurant','bar_liquor','laundry','florist','beauty_fashion','pharmacy','supermarket','gift_shop','other');
create type actor_type as enum ('staff','merchant_user','rider','guest','host_user','system');
```

### 3.2 Tables (minimum columns; add `created_at`, `updated_at` everywhere)

**`city`** — `id`, `slug`, `name`, `country`, `currency`, `timezone`, `status` (`live`,`soft_launch`,`waitlist`), `sort`. Seed: Nairobi, Mombasa, Kisumu (live), Nakuru (soft_launch), Kampala (waitlist), plus six more waitlist cities to make eleven, as the homepage says "11 cities".

**`waitlist_signup`** — `id`, `email`, `city_id`, `source` (`homepage_app`,`homepage_city`), `consent_marketing` bool.

**`rider`** — `id`, `user_id` (auth.users, nullable until phone verified), `first_name`, `last_name`, `phone` (unique, E.164), `city_id`, `vehicle` vehicle_type, `plate_no` (nullable for bicycle), `status` rider_status default `applied`, `status_reason`, `activated_by`, `activated_at`, `onboarding_session_at`, `kit_issued` bool.

**`merchant`** — `id`, `legal_name`, `trading_name`, `category` merchant_category, `category_other` text, `contact_name`, `contact_phone`, `contact_email` (unique), `city_id`, `status` partner_status default `applied`, `status_reason`, `went_live_by`, `went_live_at`, `settlement_account` jsonb (till/paybill/bank, added later by the merchant, never in the public form).

**`merchant_branch`** — `id`, `merchant_id`, `name`, `address_text`, `location` geography(Point) nullable, `zone_id` nullable, `is_primary`.

**`merchant_user`** — `id`, `merchant_id`, `user_id`, `role` (`owner`,`manager`).

**`document_requirement`** — `id`, `owner_type` (`rider`,`merchant`), `applies_when` jsonb (e.g. `{"vehicle":["motorbike","car","tuktuk"]}` or `{"category":["pharmacy"]}`), `kind`, `label`, `help_text`, `has_expiry` bool, `required` bool. Seed:

| owner | kind | applies when | expiry |
| --- | --- | --- | --- |
| rider | national_id | always | no |
| rider | driving_licence | vehicle in motorbike, car, tuktuk | yes |
| rider | logbook_or_plate | vehicle in motorbike, car, tuktuk | no |
| rider | insurance | vehicle in motorbike, car, tuktuk | yes |
| rider | good_conduct | always | yes |
| rider | face_photo | always | no |
| merchant | business_permit | always | yes |
| merchant | owner_id | always | no |
| merchant | kra_pin | always | no |
| merchant | food_handler_cert | category in restaurant, bar_liquor | yes |
| merchant | liquor_licence | category = bar_liquor | yes |
| merchant | pharmacy_licence | category = pharmacy | yes |
| merchant | premises_photo | always | no |

**`document`** — `id`, `owner_type`, `owner_id`, `requirement_id`, `storage_path`, `mime`, `size_bytes`, `issued_at`, `expires_at`, `status` document_status default `uploaded`, `reviewed_by`, `reviewed_at`, `rejection_reason`, `version` int (re-uploads create a new row, old row stays).

**`staff_user`** — `id`, `user_id`, `email` (must end in the configured domain), `display_name`, `status`.
**`role`** — seed `super_admin`, `ops_manager`, `merchant_ops`, `rider_ops`, `finance`, `growth`, `hr`, `dpo`.
**`role_grant`** — `id`, `staff_user_id`, `role_id`, `city_id` nullable (null = all), `granted_by`, `approved_by` nullable, `expires_at` nullable, `revoked_at` nullable.

**`audit.audit_event`** — in its own schema: `id` bigint identity, `at`, `actor_type`, `actor_id`, `actor_role`, `session_id`, `ip`, `user_agent`, `module`, `action`, `target_type`, `target_id`, `before` jsonb, `after` jsonb, `reason`, `approved_by`, `severity` (`info`,`notice`,`high`), `city_id`, `prev_hash` bytea, `hash` bytea. Trigger `audit.chain()` computes `hash = sha256(prev_hash || canonical row)`. Grant `INSERT` only to the API role; revoke `UPDATE`/`DELETE` from everyone including `service_role` via a `BEFORE UPDATE OR DELETE` trigger that raises.

**`setting`** — `scope` (`global`,`city`), `city_id`, `key`, `value` jsonb, `effective_from`, `approved_by`. Seed keys with empty values: `commission_pct_by_category`, `homepage_featured_slots_per_city`. The UI renders `[—]` when the value is null.

### 3.3 Status functions and gates

- `fn_rider_required_docs(rider_id)` and `fn_merchant_required_docs(merchant_id)` return the requirement rows that apply.
- `fn_partner_recompute_status(owner_type, owner_id)`: if any required doc missing → `documents_pending`; if all uploaded and any not yet reviewed → `under_review`; if any rejected → `documents_pending` (with reason surfaced); if all verified but not yet activated → stays `under_review` awaiting explicit `activate`; if activated and a doc later expires or is rejected → `paused`. Called by a trigger on `document` insert/update.
- `rpc_activate_rider(rider_id, reason)` and `rpc_merchant_go_live(merchant_id, reason)`: security definer; require the caller to hold `rider_ops`/`merchant_ops` or `super_admin` for that city; require all required docs verified; set status, actor, timestamp; write the audit event; send the notification. This is the only way to reach `active`/`live`.
- `public.merchant_public` view: `select trading_name, category, city, primary branch location, cover_photo from merchant where status = 'live'`. Grant `select` to `anon`. Nothing else in the merchant table is readable by `anon`.

### 3.4 RLS (write tests for every line)

- `rider`: the rider (`user_id = auth.uid()`) can select and update their own row while status in (`applied`,`documents_pending`,`under_review`); staff with `rider_ops` or `super_admin` for the city can select all and update; nobody else.
- `merchant`, `merchant_branch`: same pattern via `merchant_user`; staff role `merchant_ops`.
- `document`: owner can insert and select their own; only staff can update `status`, `reviewed_*`, `rejection_reason`.
- `role_grant`: only `super_admin` can insert; grants to `finance` or `super_admin` require `approved_by` ≠ `granted_by` (check constraint).
- Storage bucket `partner-documents`: private; upload path `${owner_type}/${owner_id}/${requirement_kind}/${uuid}`; policy allows the owner to upload to their own prefix and staff to read; all reads by signed URL valid 5 minutes.

## 4. Public site (`apps/web`)

### 4.1 Homepage `/` (artboard `BookingFirst`, menu `MenuOpen`)

Build the page exactly as designed, section by section: top bar with city and sign-in; hero "Everything … at your Doorstep" with the animated category word; the "Start your order" card (in this slice the form only captures the request as a **concierge lead** — where staying, what needed, when — and stores it in `waitlist_signup` with `source = 'homepage_request'`; a toast says a concierge will reply by WhatsApp, and the Place your Order button copy stays as designed); the three-step "how it works"; Popular requests (each chip prefills the lead form); Featured merchants (reads `public.merchant_public` where a featured flag is set — none exist yet, so render the designed placeholder cards with `[COVER PHOTO]` and the Sponsored label from a `featured_placeholder` config until real slots exist); Everything we arrange; Cities where we deliver (from `city`, with the five live/soft-launch shown first and "1–5 of 11"); the partner band "Host, ride, list or join." with the four buttons (Airbnb link goes to `/hosts` which renders a "coming soon" page in this slice); the app "Coming soon" notify form; footer.

Menu (`MenuOpen`): full-screen overlay with the same links, including "For Airbnb hosts". SEO: metadata per page, Open Graph image, sitemap, robots. Analytics: PostHog with events `lead_submitted`, `waitlist_joined`, `rider_apply_started`, `merchant_apply_started`, `application_submitted`.

### 4.2 Riders `/riders` (artboard `Riders`)

Marketing sections as designed (hero, how it works, why riders choose NexG, from application to first delivery, what you'll need, rider kit, the rider app preview, FAQ). The "Become a rider" card is the entry to the application.

Application flow `/riders/apply`:
1. **Step 1 of 3 — About you**: first name, last name, phone (M-Pesa), city (chip group from `city` where status ≠ `waitlist`; if a waitlist city is chosen, capture as waitlist and stop with a friendly message), vehicle. On Continue: send SMS OTP (Supabase phone auth via Africa's Talking hook — `[DECIDE]` provider account), verify, create `auth.users` + `rider` row with status `applied`.
2. **Step 2 of 3 — Your documents**: list from `fn_rider_required_docs`; each item shows label, help text, example, and a `FileDrop`; expiry date field where `has_expiry`; plate number field appears when vehicle ≠ bicycle and is required. Saving each upload is independent; the page can be left and resumed (status `documents_pending`).
3. **Step 3 of 3 — Done**: "We verify and come back to you", with the status page link.

Status page `/riders/status` (signed-in rider): shows status badge (Applied / Documents pending / Under review / Active / Paused), the document checklist with per-document state and rejection reason, a "Re-upload" action on rejected items, the onboarding session date once set, and "Talk to the rider team" (WhatsApp deep link). Realtime subscription so a decision appears without refresh.

### 4.3 Merchants `/merchants` (artboard `Merchants`)

Marketing sections as designed, including the "Simple pricing `[—]%`" block (value from `setting.commission_pct_by_category`; renders `[—]` until set) and the "Get featured" section (informational only in this slice; button goes to a "coming soon" anchor).

Application flow `/merchants/apply`:
1. **Business**: legal name, trading name, category (chips as designed, plus "Other" with free text), contact person, phone, email. Email verification by magic link creates the `auth.users` + `merchant` + `merchant_user(owner)` rows, status `applied`.
2. **Location**: address text plus a map pin (Google Maps JS with Places autocomplete, Nairobi-biased) stored on `merchant_branch` as the primary branch; city derived from the pin where possible, else chosen.
3. **Documents**: from `fn_merchant_required_docs`, same component as riders; category-specific items appear automatically.
4. **Done**: "We get in touch within two working days", link to status page.

Status page `/merchants/status` (signed-in merchant user): banner "Your store is not public yet — N documents awaiting review", checklist with per-document state and reasons, re-upload, and a read-only preview of how their card will look once live (name, category, city). No catalogue editing in this slice.

Sign-in pages for both roles: phone OTP (riders), magic link (merchants), as designed in `SignIn` for guests but restricted to the partner role; a guest without a rider/merchant row is told to apply.

## 5. Admin console (`apps/admin`)

### 5.1 Shell and sign-in (artboard `A0_StaffSignIn`)

Google sign-in through Supabase Auth with `hd` set to `nexgapp.com`; a server-side check rejects any other domain and any account without a `staff_user` row. After sign-in, load `role_grant`s into the session; the sidebar renders only the modules the roles allow. Sidebar groups and items exactly as designed (Operate, Partners, Grow, Money, Control) with items outside this slice rendered disabled with a "Phase 1" tooltip. Top bar: search, city switcher (limited to the cities in the grants), notifications bell, user chip showing role.

### 5.2 Riders module

- **Pipeline** (`B2_RiderPipeline`): kanban columns Applied → Documents pending → Under review → Active, plus Suspended and Offboarded as collapsed columns; cards show name, city, vehicle, plate, days in stage, pending-document count, owner avatar; filters by city, vehicle, stage, days in stage; drag is disabled — stage changes only happen through review actions.
- **Documents** (`B7_RiderDocuments`): table of documents needing review (oldest first), grouped by rider; the detail panel shows the file (image viewer or PDF viewer via signed URL), issued/expiry fields, and the actions **Verify** and **Reject with reason** (reason required, chosen from a list plus free text). Bulk verify is not allowed. When the last required document is verified the panel shows **Activate rider** which calls `rpc_activate_rider`; the button also requires `plate_no` to be present for motorised vehicles.
- Directory (`B1`) is a simple filtered table in this slice; health and cash screens are out of scope.

### 5.3 Merchants module

- **Pipeline** (`A5b_MerchantPipeline`): columns Applied → Documents pending → Under review → Live, plus Paused and Delisted collapsed; cards show trading name, category, city, days in stage, pending-document count.
- **Documents** (`A13_MerchantDocuments`): same review component as riders; when all required documents are verified the panel shows **Go live** which calls `rpc_merchant_go_live`. A "Preview public card" button renders what `public.merchant_public` will expose.
- Directory (`A5`): filtered table with status, city, category, primary branch, days since applied.

### 5.4 Notifications

A `notifications` module with templates in code (later moved to the Settings tab): rider SMS on submitted, verified, rejected (with reason), activated; merchant email on the same events plus "two working days" acknowledgement. Every send is logged (`notification_log`) with provider id and status. `[DECIDE]` SMS and email providers; default Africa's Talking and Resend.

### 5.5 Audit

Every review action, activation, go-live, role grant and sign-in writes an `audit_event`. A minimal **Audit log → Activity** table is included in this slice (read-only, super_admin only) so the founder can see the chain working from day one; the full module is later.

## 6. Acceptance tests (Playwright)

1. A visitor on a phone viewport opens `/`, picks a popular request, submits the lead form, sees the confirmation; the row exists with `source = 'homepage_request'`.
2. A rider applies with a motorbike, verifies the OTP, uploads six documents including plate number, sees "Under review" on the status page.
3. A merchant applies as a pharmacy, verifies email, pins a location, sees seven required documents (including pharmacy licence), uploads them, sees "Under review".
4. A staff member without a `staff_user` row is refused at sign-in; one with `rider_ops` for Nairobi sees only the Riders module and only Nairobi riders.
5. `rider_ops` rejects one document with a reason → rider status returns to `documents_pending`, the rider sees the reason, re-uploads, status returns to `under_review`.
6. `rider_ops` verifies all documents and activates → status `active`, SMS logged, audit event present with `action = 'rider.activated'` and a valid hash chain.
7. `merchant_ops` goes live on the merchant → `public.merchant_public` returns the merchant; before that step it returned nothing.
8. An attempt to `update` or `delete` on `audit.audit_event` with the service role fails.

## 7. Deliverables checklist

- [ ] Monorepo with the two apps and three packages building on CI
- [ ] Migrations, seeds and generated types; `supabase db reset` reproduces the schema from zero
- [ ] RLS test file covering every policy in section 3.4
- [ ] Homepage, Riders, Merchants pages matching the artboards on desktop and 390 px mobile
- [ ] Both application flows with document upload and status pages
- [ ] Admin: staff sign-in, rider and merchant pipelines, document review with verify/reject/activate/go-live
- [ ] Notifications with logging; audit chain with nightly verification job (pg_cron) and a failing-chain alert stub
- [ ] Playwright suite in section 6 green on CI
- [ ] `README.md` with local setup, env variables, how to add a document requirement, how to grant a role

## 8. Decisions needed from the founder (`[DECIDE]`)

| Decision | Default used until decided |
| --- | --- |
| Company Google Workspace domain for staff sign-in | `nexgapp.com` |
| SMS provider account | Africa's Talking sandbox |
| Email provider account and sending domain | Resend, `mail.` subdomain |
| Google Maps Platform key with Places enabled | dev key with spend cap |
| Whether good-conduct certificate is required at application or at onboarding | required at application (as the design says) |
| Whether merchants may apply from waitlist cities | no; captured as waitlist |
