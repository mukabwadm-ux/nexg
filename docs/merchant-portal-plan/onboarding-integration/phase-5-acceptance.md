# Phase 5 implementation and local acceptance

2 November 2026, Africa/Nairobi. Desktop MERCHANT WORKSPACE contains the connected implementation. Status: VERIFYING: local changed-code checks pass; configured Auth/deployed-schema acceptance remains open. No production migration, real review, provider call or whole-service startup was performed. Phase 6 admin UI is the next implementation increment.

## Implemented journey

The standalone entry at `http://127.0.0.1:5181/` offers real registration and explicit demo entry. Real registration targets the existing platform `/merchants/register`; the public origin is configured through `merchant-onboarding/.env.example`, with local development default `http://127.0.0.1:3000`. Production requires its actual public platform origin. Demo input remains sample state, carries no real application/session/operation IDs and grants no access. Exit demo returns to registration. There is no portal mode activation switch.

The platform entry requires an existing genuine non-anonymous Auth account. Its sign-in link and expired-session redirect retain a safe onboarding return destination. Existing owners resume their actual merchant instead of creating another application. A malformed or unavailable ownership lookup displays recovery rather than offering a second empty application. Email OTP remains deferred.

Confirmed application submission redirects to the actual `/merchant`. That page loads the private saved application/payout record and current authority before bounded owner section reads, then rechecks authority and revision afterward. Saved Home uses these results only. It never falls back to entered or sample data when a required read fails. Optional section errors display unavailable and leave other saved sections readable.

The managed real merchant uses the shared workspace frame. Home and exact permitted setup editor routes stay accessible while approval is pending. Locked operational navigation renders generic blurred placeholders without fetching hidden operational records. Approved access is still distinct from publication and accepting work. Rejected applications reach a safe decision/recovery page instead of a sign-in redirect loop.

The existing booking engine imports the saved canonical primary-specialty answers only through explicit owner bootstrap. Values including `false` and `0` are preserved. Ordinary reads do not import or overwrite setup; other selected specialty answers remain in the saved application. Existing engine overwrite safeguards and legacy bootstrap remain in place.

## Saved Home truth

| Section | What the page can establish | Deliberately separate authority |
| --- | --- | --- |
| Business/category | Valid saved capture and canonical selected activities | Approval of a current submitted revision |
| Catalogue | Retained item count, prices and availability | Activity ownership is not recorded in the existing catalogue schema; saved items do not prove scoped readiness |
| Locations | Retained, addressed and pinned branches; closed/paused state | Declared branch count creates no locations and does not prove visibility |
| Hours | Saved service/branch windows, including overnight and 24:00 | Effective open-now and checked bookable schedules |
| Documents | Current sides, upload/review/rejection/expiry facts | Uploaded is not verified; requirement completeness is not inferred from a count |
| Payout | Private saved declaration, rail and version | Finance verification and actual settlement |
| Review/access | Current review, submitted/current revision and resubmission need | Publication and accepting work |

## Verification evidence

Checks ran once per covered code revision. A repeat occurred only after the covered source or test changed. Earlier unchanged suites were reused, not rerun.

| Changed boundary | Final local evidence |
| --- | --- |
| Staff/owner RPC → HTTP command → saved Home | [Persisted journey evidence](phase-5-persisted-journey-evidence.md): one integration scenario using actual production SQL/RLS/handler/source/projector/Home renderer and two file-backed database reopens. Final run passed in 12.24 seconds. It verifies that a requested reason stays visible after saving one correction and clears after resubmitting. Synthetic Auth/session fixtures remain explicit. |
| Saved source | 11 focused tests passed: bounded owner filters, multi-window hours, current document versions/expiry, per-section unavailable states and final authority race. Scoped source TypeScript passed. |
| Real shell | [Shell evidence](implementation/phase-5-shell-verification.md): initial 20 route/SSR cases; final affected group 8 passed with 16 unchanged cases filtered. Three initial browser cases and one affected setup-editor case passed after the exact-route exception. |
| Demo/entry | Four journey-mode tests and three browser journeys passed. [Entry browser evidence](implementation/phase-5-entry-browser-verification.json) records zero application writes/page errors and mobile overflow check. |
| Real registration/Home/frame | Seven registration/navigation cases across targeted runs, three actual Home host cases and two frame-source cases passed. The final four changed feedback-rendering cases and persisted Home/review journey passed. Connected payout control harness passed with an explicit saved-source fixture. |
| Booking bootstrap | 29 focused tests across three files passed; scoped transitive TypeScript and diff checks passed. |
| Rejected recovery | [Decision evidence](phase-5-decision-recovery-evidence.md): 37 focused tests across guard, actual page SSR and middleware passed; scoped TypeScript passed. |
| Final integration | `node node_modules/typescript/bin/tsc --project tsconfig.phase5-integration.json --noEmit` exited 0 after the final feedback model change. Scoped `git diff --check` passed. Standalone Vite build passed; the existing large lazy demo chunk advisory remains. |

Local PostgreSQL fixtures use PGlite 0.5.14 outside the repository. The integration test executes production RPCs and RLS with test-only Auth claims/session rows; it does not establish live Supabase Auth, browser session rotation, Storage upload, remote deployment or production approval behavior.

## Configured runtime and remaining gates

The existing local platform port 3000 responds. A read-only browser visit to `/merchants/register` still shows **Real registration is temporarily unavailable**, consistent with `MERCHANT_ONBOARDING_V1_ENABLED=false`. The gate was not changed. Before the latest route fix, a no-cookie GET to `/api/merchant/application` returned HTTP 500. The existing dev server hot-reloaded the source change; the same read-only probe now returns HTTP 404 with private `not_available` Problem Details. When enabled but client setup fails, the route returns a safe 503. Three focused route tests pass. Only `.env.example` files are present in the platform checkouts; the local Supabase CLI and linked project reference are absent. The running local platform still has no verified usable merchant Auth/backend connection. It must connect to the existing platform environment and pass an Auth/API probe before registration can be enabled. No service was started.

Before enabling connected entry, apply the compatible additive migrations and API rollout in the intended existing platform environment and exercise real Auth, cookie refresh/no-store, owner submission/Home reload, actual private uploads and staff decisions there. The Phase 4 API migration requires its documented coordinated traffic/API cutover. A migration file or passing local fixture does not prove the remote schema is installed.

Phase 6 connects the existing admin console to separate revision-bound account approval. Phase 7 remains the applicable activation/source-connection work; unsupported providers stay disabled. Final email OTP and the deferred business/person presentation review remain last. No active Odoo/QuickBooks adapter or automatic live activation is claimed.

## Main implementation files

- `apps/web/lib/merchant-home-source.ts`, `apps/web/app/merchant/page.tsx` and `apps/web/components/onboarding/connected-application.tsx`: authenticated source, submission redirect and actual Home.
- `apps/web/components/merchant/workspace/merchant-workspace-shell.tsx` and `apps/web/app/merchant/layout.tsx`: managed shared frame, exact setup destinations and operational locks.
- `merchant-onboarding/src/ConnectedMerchantHome.jsx`, `SharedMerchantOnboardingForm.jsx` and `OnboardingWorkspace.jsx`: shared saved Home, truthful labels and retained task editors.
- `merchant-onboarding/src/App.jsx`, `journey-mode.js` and `apps/web/components/onboarding/demo-entry.tsx`: onboarding-only demo entry and explicit real destination.
- `apps/web/lib/booking/onboarding-bootstrap.ts`: saved canonical primary-scope import into the existing engine.
- `apps/web/app/(customer)/merchants/decision/page.tsx`: restricted decision/recovery destination.

No new backend, identity service, booking engine or production project was created.
