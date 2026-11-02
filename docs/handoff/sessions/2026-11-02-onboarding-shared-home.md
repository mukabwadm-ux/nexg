# Phase 3 shared merchant Home connection

Date: 2 November 2026, Africa/Nairobi. Active root: `C:\Users\limta\Desktop\MERCHANT WORKSPACE`.

The user authorized connecting the short registration to the existing merchant Home. Registration remains the six-group Phase 2 page. The same captured state now feeds actual shared Home presentation and the existing workspace frame; the prior independently drawn Home and clone styles are removed.

## Code and state ownership

- `apps/web/components/merchant/home-setup-view.tsx` contains presentation extracted from the actual Home. `home-setup.tsx` remains the Next/server-source adapter with its existing links, drawers, sample states and greeting.
- `workspace/workspace-frame.tsx` contains the actual existing shell layout/CSS. `live-preview-shell.tsx` keeps search/preload/mobile/account routing and passes its original slots to that frame.
- `packages/booking-config/src/onboarding-home.ts`, exported as `./onboarding-home`, projects actual captured data and existing registry rules into required/optional rows and progress. No sample 3/7, fake branch/team records, universal five-item or enquiry test-order requirement.
- `ConnectedMerchantHome.jsx` and `OnboardingWorkspace.jsx` host the shared views with safe local navigation and actual form callbacks. Task editors remain inside the same frame. `OnboardingHome.jsx` only forwards to the connected host.
- `MerchantOnboarding` still owns all entries and browser File objects. Evidence metadata alone reaches the projection; no browser storage/server write occurs. Selected/uploaded/payout details never count as verified. Launch remains badge-only/blocked.
- Local Tailwind preset/tokens, Manrope and icons are reused through the workspace's installed dependencies. Vite dedupes React to support these shared components. No provider/account/backend installation was introduced.

## Evidence

[Phase 3 acceptance](../../merchant-portal-plan/onboarding-integration/implementation/phase-3-acceptance.md) records 10 focused projection tests covering all 128 profiles, 3 shared view tests, final scoped UI TypeScript, 7 browser journeys, a targeted Café display check and the isolated final build. Exact agent-observed output was saved without rerunning checks. Parent reused prior Phase 1/2 results. Browser harness corrections and covered implementation changes explain correction runs; no unchanged suites were rerun.

Independent read-only review found no actionable state/navigation issues. The bundle still reports the existing non-failing large-chunk advisory. No application/build check was repeated after documentation-only edits.

## Next phase and limits

Phase 4 is durable backend persistence and permission enforcement. Reuse existing merchant ownership/draft/document primitives, revise legacy submit/readiness constraints to match the short entry, and separately model approval/access versus publication/accepting work. Connect actual authenticated `/merchant` sources in Phase 5 after those gates. Admin review is Phase 6. Email OTP and business/person presentation remain at the end.

This phase shares the actual Home UI; it does not claim production authenticated Home or wire the complete Business/Offerings/Availability source adapters. Only the retained setup editors and in-memory handoff are connected. Real server restrictions and admin decisions are still absent. The safe preview lock must not be mistaken for security enforcement.

Only the isolated form server at `http://127.0.0.1:5181/` was used; the whole portal, backend and admin were not started. Refresh/close clears data. There are no OTPs, real account creation, provider calls, live approvals or database migrations.

Skills continued: using-superpowers, unslop, nexg-contracts, nexg-phase-loop, 21st-ui-build, principle-test-behavior-not-implementation and principle-prove-it-works. Three scoped agents handled shared Home extraction, frame extraction and task projection; implementation scopes were separate, and final wiring was independently reviewed.
