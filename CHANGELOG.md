# Changelog

## 2026-10-31

- Added the existing adaptive portal design package to the working merchant frontend workspace and extended it with explicit Home/Insights statistics for all128 subcategories.
- Planned70 metric definitions, source collection/evidence,17 workflow bindings, conditional/hybrid behavior, future-category statistics, and frontend-only acceptance.
- Verified design coverage and independent arithmetic examples. No application, live collection or Supabase implementation was performed.

- Corrected normal order intake to automatic native/API/webhook stock confirmation. Removed generic merchant-acceptance defaults and review headlines; human review requires an explicit matching exception. Updated design checks to71 metrics and29 calculation examples.

- Audited Offerings component adaptation across128 specialties and18 editor contracts, then generated one general screen reference using the existing NEXG visual style. Design/image artifacts only.

- Built the adaptive Offerings frontend in the existing merchant workspace: shared catalogue/editor, 128 specialty bindings, 18 editor contracts, local draft/publication/history, pricing/variants, scoped descriptors, fulfilment, source ownership, import/export and bounded desktop/phone layouts. Reused booking fields/types and preserved the booking runtime, initial setup and Home. Supabase and live integrations were not changed. See the Offerings component README and recorded browser verification for the exact tested scope.

- Built the adaptive Availability frontend for all128 registered specialties using shared model-specific views and local sources. Added revisioned drafts, conflict review, holds/optional reservation fees, capacity, recurrence, typed occupancy, same-record Work/Offerings handoffs and recovery. Compacted surrounding controls and docked desktop editors so the full sample calendar fits short viewports. Verified57 unit tests,128/193/18 browser coverage,7 interaction journeys and17 layout cases. Frontend only; onboarding and live integrations remain separate.

- Planned the adaptive Money screen and financial stats for128 subcategories/21 parents,193 eligible model bindings and18 editor variants. Reused7 owner measures and proposed20 separately gated measures. Defined transaction, balance, security, payout, source and recovery flows; generated exactly3 concept images with reconciled sample amounts.30 design checks passed. Design only; no Money frontend or financial-provider implementation.

- Clarified the Money design for composable reservation advances, separate booking fees, conditional cancellation/no-show charges and refundable guarantees across applicable categories. No-fee merchants remain unaffected; missing policy does not infer retention. Design amendment only.

- Built the adaptive Money frontend sample in the existing merchant workspace for the 128 current specialties and registered offering workflows. Added contextual sales, invoice, security and reservation examples, local refund and reconciliation simulations, two reporting periods, scoped CSV export and context-preserving preview links. Verified 16 Money and 31 Availability tests, focused types/lint, the 128-specialty browser sweep, three short-desktop layouts and phone reflow. Real finance/ERP/payment integration, production grants and onboarding remain outside this frontend sample. See docs/merchant-portal-plan/money-concept/implementation/acceptance.md.

- Refined the Money frontend so Overview, Transactions and Statements serve distinct purposes. Transactions now provides period/filter-scoped counts and confirmed payment/refund totals, workflow-specific work references, sample payment methods, transaction details and uncertainty states; Statements provides selectable sample reports. Verified all 128 transaction views, the existing Money browser journeys, 51 focused tests, scoped TypeScript and ESLint. Frontend sample only; no financial integrations or onboarding changes.

## 2026-11-01: onboarding, setup Home and approval plan

- Audited the standalone onboarding form against the current Desktop merchant workspace, reconciled questions/profiles, Home readiness and backend/admin approval paths. Documented concrete gaps and reusable ownership/document infrastructure.
- Added docs/merchant-portal-plan/onboarding-integration/README.md and evidence.md with P0-P8 build order. Carries the user's confirmed short optional entry, immediate setup Home, Home task completion while pending and safe blurred/locked operational portal.
- Separated account approval/unlock from operational readiness, publication and accepting work. Implementation remains unstarted. No application, migration, provider or service changes were made for this planning pass; planning-artifact checks are recorded separately.

## 2026-11-01: Phase 0 short-registration rules

- Specified the Glovo-reference business/contact entry fields plus required canonical category/subcategories. Deferred operational fields entirely to Home rather than adding an optional long wizard.
- Amended the prior category-skip/name-only recommendations. Recorded initial portal templates versus actual operating readiness, permitted Home setup while pending, and separate admin approval versus activation.
- Preserved business/contact/authenticated-person separation and deferred header/greeting/role presentation to the final P8 pass. Recorded legacy name, branch-band, phone-only, category-reset and submit-constraint mappings for P1/P4.
- P0 product rules are SPECIFIED; P1-P8 implementation remains NOT_STARTED. Written-plan verification only; no application, service or database changes. See docs/merchant-portal-plan/onboarding-integration/phase-0-rules.md.

## 2026-11-02: shared merchant configuration and Phase 2 short registration

- Implemented the Phase 1 category/question foundation in the existing booking configuration package, consuming the developed merchant JSON. Canonical identity, scoped typed answers, existing predicates, inactive-answer retention and requiredness only after both OTP/sign-in are confirmed are covered by 212 shared package tests, including 152 onboarding cases, with strict types and targeted shared formatting.
- Updated the original standalone form in place. The final user-directed Phase 2 registration is one page containing only the six business/contact/category/policy groups. The original operational sections are reused as Home task editors; they were not abandoned. Incomplete portal drafts cannot block basic entry.
- Preserved partial/unassigned/inactive listings, null prices, per-category drafts and in-memory files. Added safe preview Home navigation without fake authentication, server submission, approval or publication. Corrected the historical Café label encoding at the display adapter and stale field-error feedback.
- Verified four new focused registration tests and five changed-flow browser journeys, with no runtime errors or server writes, plus the final isolated build. Reused unchanged earlier results. Test/selector corrections and covered source changes explain every rerun in the acceptance records; no unchanged suite was rerun for Phase 2.
- Only the isolated form server on 127.0.0.1:5181 was started. Email OTP is deferred by the user. Actual production Home, durable backend/upload/auth permissions, admin review and activation remain open. See docs/merchant-portal-plan/onboarding-integration/implementation/phase-2-acceptance.md.

## 2026-11-02: Phase 3 registration connected to shared merchant Home

- Extracted the existing HomeSetup presentation and workspace frame for shared use. Existing Next adapters retain their routes, drawers, search/preload and account behavior; the isolated registration now renders the same Home/frame/CSS instead of its separate drawing.
- Added the shared onboarding-home read projection from entered data and the existing merchant registry. Task progress uses applicable required rows; source-question/hours completion updates it while evidence/payout remain unverified and launch blocked. No universal sample 3/7, five-item, delivery-zone or enquiry test-order rule is introduced.
- Kept deferred setup editors inside the shared frame and preserved capture/file state across registration, Home, locked navigation and edits. Reused the actual help drawer and local Manrope/token/Tailwind assets. Locked sections load empty placeholders, no operational data. No provider, server write, account or real approval is created.
- Verified 10 new projection tests covering all 128 profiles, 3 shared view tests, scoped strict UI TypeScript, 7 connected browser journeys, a targeted display-label check and the final isolated build. Correction runs followed covered implementation or faulty harness changes; unchanged prior suites were reused. Exact evidence is in docs/merchant-portal-plan/onboarding-integration/implementation/phase-3-acceptance.md.
- Phase 3 frontend demonstrator is complete. Durable backend/permissions, actual authenticated production Home, admin review and activation remain future phases. Email OTP remains deferred; the whole portal/backend/admin were not started.

## 2 November 2026: merchant backend foundation

Implemented the locally verified short-application, private payout, revision/review/access/session and existing API security foundation in the Desktop Merchant Workspace. Reused existing merchant ownership and booking owner; booking GETs no longer provision or expire records. Added vendor-neutral connector contracts with no activated ERP provider. Connected entry stays disabled pending real Supabase/staging acceptance. Local SQL checks passed 120 application and 49 integration assertions; focused source/browser/type checks and exact limits are in docs/merchant-portal-plan/onboarding-integration/phase-4-rollout.md. No production or provider effects. Phase 4 remains VERIFYING, with owner-source projections, uploads/cutover and remote acceptance explicit.

## 2 November 2026: Phase 5 saved merchant journey

- Connected managed merchant Home to verified owner/session access, revisioned application/private payout and bounded saved catalogue, locations, weekly hours and current document records. Saved facts, review, approval and activation remain separate; missing sources show unavailable without sample fallback or invented readiness.
- Reused the shared managed shell and permitted setup editors. Demo starts only from onboarding, stays labelled sample data and exits to registration. Safe sign-in return and rejected-application recovery use existing Auth/access contracts without granting workspace capabilities.
- Local focused checks passed, including the final persisted handler/source/rendered Home scenario, 1 test in 16.14 seconds, integration TypeScript exit 0 and scoped diff check exit 0. Exact checks and fixture limits are in [Phase 5 acceptance](docs/merchant-portal-plan/onboarding-integration/phase-5-acceptance.md).
- The existing Next endpoint on port 3000 responds. Browser inspection of `/merchants/register` found the deliberate feature-disabled message and demo entry. No service was started. Enabled real Auth/PostgREST and deployment acceptance remain open; Phase 6 reviewer UI continues next, with activation and email OTP still separate. See the [Phase 5 handoff](docs/handoff/sessions/2026-11-02-onboarding-real-journey.md).

## 2 November 2026: Phase 6 admin merchant application review

Added a bounded staff Applications queue and snapshot review to the existing admin portal for cityless short applications. The queue uses current staff/session scope; details distinguish the submitted snapshot from newer edits. Approve, changes requested and reject reuse the revision-bound review command. Merchant Home retains review feedback through edits until resubmission. Approval does not publish or activate a merchant. Local reader/transport/SQL/UI/middleware checks and scoped types pass; real Auth/deployed-schema acceptance stays open. No service or production state changed. See [Phase 6 acceptance](docs/merchant-portal-plan/onboarding-integration/phase-6-acceptance.md) and the [admin review handoff](docs/handoff/sessions/2026-11-02-onboarding-admin-review.md).

## 2 November 2026: smoother merchant verification

The verification card now remains in place while its first code is sent or retried. The local demo prepares workspace pages only when a visitor points to them, avoiding a background compilation of every section during onboarding.

## 2 November 2026: merchant email OTP

Connected the existing onboarding verification card to Supabase Auth's email-change codes, preserving the applicant's user ID, and added email-code sign-in for returning merchants. The local Auth service is configured to deliver through Resend using the verified NexG sender. See [merchant email OTP](docs/merchant-email-otp.md) for local and hosted setup and the remaining live delivery check.

## 2 November 2026: merchant email verification design

Added a NexG-coloured six-digit email verification card and a development preview that can read the current owner's saved application email. The preview sends no code and leaves the existing submit-to-Home journey unchanged. Email delivery, verification and account upgrade remain open. See the [design handoff](docs/handoff/sessions/2026-11-02-email-verification-design.md).
