# Deliverables

## 31 October 2026: adaptive merchant statistics plan

Completed [end-to-end statistics design](../merchant-portal-plan/stats/README.md) for Home and Insights, with128 specialty mappings,17 workflow families,71 metric definitions and8 collection source families. Includes lifecycle/source/coverage rules, future categories, frontend build sequence and acceptance records.

[Statistics design verification](../merchant-portal-plan/stats/verification.json) passed128 profile mappings,1291 scenario expectations,29 independent design calculations and3 invalid future-category reference checks. Original category/schema and portal plan checks also passed after the amendment. Runtime behavior remains unimplemented and unverified.

[Handoff](../handoff/merchant-statistics-2026-10-31.md). No application or Supabase changes in this planning task.

## Automatic confirmation correction

Removed the blanket merchant-confirmation intake default and order-review headlines from all58 standard order profiles. Added source/stock-confirmed order counts, explicit exceptional-review gates and automatic confirmation scenarios. All128 baseline profiles now avoid a manual confirmation default. See [policy](../merchant-portal-plan/order-confirmation.md). Planning only; no application/Supabase changes.

## Offerings concept,31October2026

Completed a design-only audit of128 specialties,18 editor contracts and558 scoped field references against the effective source snapshot. Preserved17 primary editor mappings and distinguished15 booking models. Added one general source-aware service/product screen picture after the audit. See [Offerings review](../merchant-portal-plan/offerings-concept/README.md). No application, booking engine or Supabase edits in this task.

## Work adaptation and two concepts

Completed [Work adaptation design](../merchant-portal-plan/work-adaptation/README.md) for all21 categories/128 specialties and18 workflow views, plus two selected general screen pictures. Current reconciled rules drive the matrix; later automatic-confirmation policy governs ordinary orders. [Planning verification](../merchant-portal-plan/work-adaptation/verification.json) and [image verification](../merchant-portal-plan/work-adaptation/image-verification.json) are saved. No application or Supabase work.

## Availability frontend,31October2026

Completed the adaptive frontend in the existing workspace.128 specialties,193 eligible bindings and18 editor variants were exercised through the actual UI.57 unit tests, focused lint/types,7 interactive recovery/calendar journeys and17 schedule-layout cases passed. The calendar, all seven hours rows and four sample assets fit the short browser viewport; side editing reserves its own column. No backend/Supabase/Google/discovery/onboarding work or network writes. [Implementation evidence](../merchant-portal-plan/availability-concept/implementation/acceptance.md) · [Handoff](../handoff/availability-frontend-2026-10-31.md).

## Money plan and three concepts,31October2026

Completed the [Money design](../merchant-portal-plan/money-concept/README.md), all128 mappings, source/metric definitions, state/interaction plan and three full-screen concepts.30 design checks pass for128/21/193/15/18 coverage and sample arithmetic. New receivable/security definitions remain proposed and source-gated. No application, backend, provider or onboarding changes. [Handoff](../handoff/money-design-2026-10-31.md).

## Money frontend sample, 31 October 2026

Verified the shared adaptive Money preview for all 128 default specialties, with 193 model bindings and 18 schema resolutions covered by behavioral tests. The browser exercised sales, customer balances, security, reservation components, refund uncertainty, local exports, source states, context returns and short-desktop/phone layouts. 47 focused Money/Availability tests, scoped TypeScript and ESLint passed. This is a local sample; the full production/source acceptance list remains open. [Evidence](../merchant-portal-plan/money-concept/implementation/acceptance.md) · [Handoff](../handoff/money-frontend-2026-10-31.md).

## Money transaction and report refinement, 31 October 2026

Separated Overview, Transactions and Statements and added transaction-specific summaries, record details, method/status filters and scoped reports. Browser verification covered all 128 transaction views and existing Money journeys; 51 focused tests, TypeScript and ESLint passed. Sample data only. [Evidence](../merchant-portal-plan/money-concept/implementation/transactions-refinement-verification.md).

## 1 November 2026: onboarding/Home/admin integration plan

Prepared the [critique and P0-P8 build plan](../merchant-portal-plan/onboarding-integration/README.md), with [source evidence](../merchant-portal-plan/onboarding-integration/evidence.md). Planning ready for review; all implementation phases remain NOT_STARTED. User confirmed minimal optional entry, immediate setup Home, deferred completion through Home and other operational sections blurred/locked until admin approval. Approval/unlock remains separate from activation/publication. No runtime or database acceptance was performed. [Handoff](../handoff/sessions/2026-11-01-onboarding-home-approval-plan.md).

## 1 November 2026: Phase 0 registration rules specified

[Phase 0 rules](../merchant-portal-plan/onboarding-integration/phase-0-rules.md) now define the short business/contact form, required category/subcategories, Home-only operational setup, pending-approval restrictions and deferred business/person presentation pass. This supersedes the earlier category-skip recommendation. Status: P0 SPECIFIED; P1-P8 NOT_STARTED. Document verification only; no application code, runtime tests, migrations or service starts. [Handoff](../handoff/sessions/2026-11-01-onboarding-phase-0.md).

## 2 November 2026: Phase 1 foundation and Phase 2 registration implemented

The shared category/question configuration consumes the developed merchant JSON, with 212 passing package tests including 152 onboarding tests, strict types and targeted formatting. The original standalone form now starts with only the user's six basic registration groups; detailed sections remain Home task editors. [Phase 2 frontend acceptance](../merchant-portal-plan/onboarding-integration/implementation/phase-2-acceptance.md) records four new focused registration cases, five changed-flow browser journeys and the final build. Unchanged Phase 1/capture tests were reused, not rerun. [Handoff](../handoff/sessions/2026-11-02-onboarding-implementation.md).

Status: Phase 1 category/question foundation implemented; Phase 2 isolated frontend implemented and verified. This is not completion of every planned production configuration/task contract. Production Home/backend/auth/admin/activation remain open; email OTP is explicitly deferred until the end. Only the isolated form preview is running.

## 2 November 2026: Phase 3 shared Home connection verified

The short form now renders the existing shared merchant Home and workspace frame. The previous separate Home drawing is removed. Applicable tasks/progress are projected from actual captured details and the merchant JSON; deferred editors retain state in the same frame, operational navigation stays safely locked, and launch cannot be performed. [Acceptance and limits](../merchant-portal-plan/onboarding-integration/implementation/phase-3-acceptance.md) record 10 projection tests including all 128 profiles, 3 shared view tests, scoped types, 7 browser journeys, a targeted label check and final build. Unchanged earlier suites were reused. [Handoff](../handoff/sessions/2026-11-02-onboarding-shared-home.md).

Status: Phase 3 frontend demonstrator COMPLETE. Phase 4 backend persistence/access enforcement is next; actual authenticated production Home integration and admin/activation remain open. Email OTP stays deferred. No full portal/backend/admin start, provider call, real account/approval or database migration occurred.

## 2 November 2026: Phase 4 merchant backend foundation

Status: VERIFYING. Local code and focused verification are complete; full connected staging acceptance is open. Additive application/RPC/review/session/access/private-payout contracts, API hardening, non-mutating booking reads and vendor-neutral connector guards are implemented. The connected entry is disabled by default and requires existing real Auth. No active Odoo/QuickBooks connector, production migration, provider payment or email OTP is claimed. See [rollout and acceptance](../merchant-portal-plan/onboarding-integration/phase-4-rollout.md) and [session handoff](../handoff/sessions/2026-11-02-merchant-backend-foundation.md). Subsequent Phase 5 owner-source Home integration, Phase 6 reviewer UI, Phase 7 activation and Phase 8 OTP remain open.

## 2 November 2026: Phase 5 saved merchant journey

Status: local implementation and focused verification complete; configured-runtime acceptance remains open. Managed Home reads the saved application/private payout and bounded owned catalogue, locations, weekly hours and current document records through existing authorization. The shared shell preserves pending locks and permitted setup editors. Review, publication and accepting work remain distinct, with explicit unavailable states for source failures. Demo is activated only from onboarding, stays sample-only and exits to registration. Rejected applications receive a generic protected decision/recovery page without workspace access.

The final persisted handler/source/rendered Home scenario passed 1 test in 16.14 seconds; integration TypeScript and scoped diff checks exited 0. [Acceptance and limits](../merchant-portal-plan/onboarding-integration/phase-5-acceptance.md) links the focused source, shell, entry and decision evidence. [Handoff](../handoff/sessions/2026-11-02-onboarding-real-journey.md).

The existing Next endpoint on port 3000 responds. Browser inspection of `/merchants/register` shows real registration deliberately feature-disabled and the demo entry. No service was started. Enabled registration with real Auth/PostgREST and deployment acceptance remain outstanding. Continue with Phase 6 reviewer UI, then separately governed activation and final email OTP. The whole merchant journey is not yet accepted end to end.

## 2 November 2026: Phase 6 managed application review

Status: local implementation and focused verification complete; configured live Auth/deployed-schema acceptance remains open. The existing admin portal now has a bounded Applications queue and detail view for cityless short registrations. Staff review the immutable submitted snapshot alongside current edits and decide approve, request changes or reject through the existing revision-bound review command. Change feedback remains visible in the merchant Home through edits until resubmission. Approval remains separate from activation and public listing. The legacy go-live flow remains the publication command for its existing use.

Focused local evidence: 18 reader tests, 28 transport tests, one production-SQL review scenario, 15 UI/SSR tests, six private/Auth middleware tests and scoped UI/backend TypeScript checks passed. Exact command/output evidence and fixture limits are in [Phase 6 acceptance](../merchant-portal-plan/onboarding-integration/phase-6-acceptance.md), [backend evidence](../merchant-portal-plan/onboarding-integration/phase-6-backend-evidence.md) and [UI evidence](../merchant-portal-plan/onboarding-integration/phase-6-admin-ui-evidence.md). The latest Phase 5 feedback + persisted journey check is recorded in its acceptance page.

No server was started and no real admin account, deployed schema or publication state was changed. The existing port 3000 registration page responds with real registration feature-disabled. Enablement waits for configured existing-platform Auth and compatible deployed migration acceptance. Phase 7 activation/source connections and final email OTP remain open.

## 2 November 2026: smoother merchant verification

The OTP screen shows the full card while sending, with an inline retry on failure. Development demo navigation prepares destinations on intent instead of compiling all sections in the background. The verification card states and demo loading behavior were checked locally.

## 2 November 2026: merchant email OTP

The local merchant flow now requests email verification after submission and supports returning email-code sign-in. Supabase Auth is configured locally to use Resend; the same-account upgrade and resend were checked against an isolated Auth service. The real inbox delivery and complete merchant journey remain to be verified. See [merchant email OTP](../merchant-email-otp.md).

## 2 November 2026: merchant email verification design

Status: design preview ready. The email card supports six-digit entry, paste and one-time-code autofill. A development-only preview uses the current owner's saved application email when available, otherwise an example address. It does not send or verify a code, upgrade an account or change submission routing. A focused local browser check covered formatted paste, the preview responses and mobile width. The web typecheck still reports unrelated errors in settings-artboard connections and partner code. [Handoff](../handoff/sessions/2026-11-02-email-verification-design.md).
