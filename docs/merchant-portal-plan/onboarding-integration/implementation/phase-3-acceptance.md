# Phase 3: registration connected to the shared merchant Home

Date: 2 November 2026, Africa/Nairobi. Status: implemented and verified for the frontend demonstrator.

## What changed

Registration now renders the actual merchant Home presentation and workspace frame. `HomeSetupView` was extracted from `apps/web/components/merchant/home-setup.tsx`; that existing Next adapter still supplies its routes, drawers, greetings and sample states. `WorkspaceFrame` was extracted from `live-preview-shell.tsx`; its existing adapter still supplies search, preloading, mobile navigation and account controls. The isolated form imports the same shared presentation and original CSS instead of maintaining a separately drawn Home. The earlier duplicate Home markup and clone styles were removed.

`projectOnboardingHome` resolves entered registration/capture into task rows using the existing merchant JSON, scoped question assessments and registered model guidance. Its rows and their `required` flags drive the displayed count and percentage. The sample 3/7 is not reused. The branch declaration does not create location/team records. There is no universal five-item, preparation-time, delivery-zone or test-order threshold.

Home and the existing deferred capture editors share the same actual workspace frame. Their in-memory state remains owned by `MerchantOnboarding`. Home actions, locked destinations, help and registration review do not replace or clear captured details. Relevant pending evidence and payout tasks stay editable, but selected files or entered account details never become verified completion. Launch has no executable action.

The host supplies safe button navigation while operational access is pending. It loads no restricted records behind the blurred placeholders and performs no server writes. The existing Home drawer supplies accessible help. The original local Manrope font, shared token stylesheet, Tailwind preset, icons and navigation definitions are reused without installing a new component library or starting another service.

## Observed checks

| Check | Actual result | Scope and rerun record |
| --- | --- | --- |
| New shared projection tests | 10 passed, including a loop through all 128 profiles; strict package types passed | Ran once. [Exact recorded evidence](phase-3-projection-verification.md). Existing onboarding/booking/capture suites were not rerun |
| Shared Home view tests | Latest affected file run: 3 passed | Initial extraction had two cases; RowAction implementation then changed to retain edit actions on complete/waiting rows. An assertion confused a Tailwind disabled: class with an actual disabled attribute and was corrected. [Exact evidence](phase-3-view-verification.md) |
| Scoped TypeScript | Passed with exit 0 | `pnpm exec tsc --noEmit --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 --lib es2022,dom --esModuleInterop --skipLibCheck --strict next-env.d.ts components/merchant/home-setup-view.tsx components/merchant/home-setup.tsx components/merchant/workspace/workspace-frame.tsx`, from apps/web. Run on final affected shared-view/wrapper/frame code |
| Connected browser journey | Seven journeys passed; zero page errors, zero server writes | `node scripts/smoke-onboarding-connected-home.cjs`. Initial harness assumed a text cuisine field and earlier task labels; corrected to actual registered choices/current labels. No application failure was hidden |
| Display adapter regression | Passed | `node scripts/check-onboarding-home-labels.cjs`, added after the display-label adapter changed. Café remains canonical across registration, headings, task titles and activity summary, without changing IDs or rules |
| Isolated final build | Passed | `npm run build` from merchant-onboarding: 1,836 modules transformed; bundled local Manrope font. The first build preceded the host/display changes; final build ran on their completed revision. No rebuild after documentation-only edits |
| Independent code review | No actionable issues | Read-only review confirmed state/file ownership, safe navigation and absence of Next/router/provider imports in the isolated frame path. No checks rerun |

Tests run once per covered code revision and are repeated only after relevant code or a faulty test harness changes. Passed unchanged Phase 1/2 results are reused. The isolated bundle retains the documented non-failing large-chunk advisory for its compiled registry.

## Browser observations

1. Basic Restaurant entry renders the same shared Home/frame with the entered business and 1 of 4 required tasks complete, rather than the sample 3 of 7.
2. Six source-defined specialty answers, including false and zero, update Home to 2 of 4. The completed detail group remains editable.
3. Adding the relevant operating hours updates Home to 3 of 4. Launch remains pending.
4. Locally selected evidence and supplied payout details remain separate provided/unverified states and do not increase required completion or enable launch.
5. The actual Home drawer opens/closes for help.
6. Changing to Business Services produces its own task list and denominator, without restaurant hours, preparation, delivery-zone or test-order defaults.
7. Phone header/navigation fits, locked sections show the approval explanation, and returning Home retains the selected business and task state.

Artifacts: [browser result](phase-3-browser-verification.json), [display result](phase-3-label-verification.json), [desktop Home](connected-home-desktop.png), [phone Home](connected-home-phone.png).

## What this phase does not claim

This connects the short form to the shared existing Home UI with a local data adapter. It does not authenticate a real `/merchant` session or replace its live server source. Durable drafts/uploads, actual backend authorization, admin review/unlock, publication and operational source connections remain subsequent phases. The current deferred editors are the retained onboarding setup editors inside the shared frame; the full Business/Offerings/Availability data-source adapters are not wired to production capture by this increment.

Email OTP remains deferred by explicit user instruction. The preview never manufactures a successful sign-in, admin approval or live business. Refresh/close clears the in-memory capture. Only the isolated form on 127.0.0.1:5181 was used; the whole portal, backend and admin were not started.
