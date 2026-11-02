# Shared merchant configuration and short registration

Date: 2 November 2026, Africa/Nairobi. Active workspace: `C:\Users\limta\Desktop\MERCHANT WORKSPACE`.

## Latest user direction

The user explicitly authorized implementation, emphasized reusing the merchant JSON, deferred email OTP until the end, and required tests once per covered code revision. The final Phase 2 instruction supersedes the intermediate optional-wizard approach: registration contains only business/applicant names, category/subcategories, branch count, email/Kenyan phone, different business contact where needed, registration yes/no, required policy acknowledgement and optional marketing.

If information can be entered in the portal, defer it to Home. Keep the existing detailed form as reusable Home task editors. Do not abandon it or replace the existing production Home. Business/person header presentation is still deferred; authenticated identity and business scope remain separate now.

## Shared implementation

`packages/booking-config/src/onboarding.ts`, exported as `@nexg/booking-config/onboarding`, resolves the existing compiled merchant JSON into canonical categories/specialties, scoped question definitions and applicable answer assessments. It reuses the existing schema validator and predicate evaluator. It preserves false/zero/unknown distinctions, explicit boolean aliases, scope isolation and inactive answers. No answer grants permissions or activates a workflow. Requirements apply only when both OTP verification and sign-in are actually confirmed.

The existing standalone form uses that projection and an explicit legacy category/label adapter. App callbacks are labelled preview-only and do not call nonexistent endpoints. Form data and files stay in memory; refresh or close clears them. The isolated Home preview uses actual current entries and safe approval-locked placeholders. Backend persistence, real production Home wiring, server gates, admin decisions and activation are unimplemented.

## Evidence

[Shared contract verification](../../merchant-portal-plan/onboarding-integration/implementation/shared-contract-verification.md) records the already observed 212 package tests, including 152 onboarding tests, strict types and targeted shared formatting. The parent reused the final recorded result without rerunning it.

[Optional capture increment evidence](../../merchant-portal-plan/onboarding-integration/implementation/acceptance.md) records the 13 capture tests, original browser journeys, subsequent targeted fixes and build results. The initial test-harness import failure was fixed in the harness and rerun; product failures were not concealed. Phase 2 has a separate focused acceptance record for the changed registration view. Unchanged Phase 1 checks are not repeated.

[Phase 2 acceptance](../../merchant-portal-plan/onboarding-integration/implementation/phase-2-acceptance.md) records the final single-page entry, four new focused tests, five browser journeys and final build. A test selector was corrected, then the covered form/display code changed to fix stale errors and a label, justifying the affected browser/build reruns. Old six-section-startup smoke scripts are historical evidence; use `scripts/smoke-onboarding-registration.cjs` for the current view. No more tests or builds were run after documentation-only updates.

Only the isolated merchant-onboarding development server on `127.0.0.1:5181` was started, command session 32512. The whole portal, backend and admin were not started. No provider, OTP/message, credential or database migration was used. The build's large-chunk advisory reflects bundling the shared registry into the isolated preview; production bundle shaping remains future work.

## Next work and boundaries

Complete the remaining production configuration/task contracts and the real Home source connection in the agreed sequence. Backend draft/upload/identity/review enforcement and separate admin approval precede actual activation. Email OTP is last by user direction. A frontend session flag or blurred preview is not backend authorization.

Skills applied: using-superpowers, unslop, nexg-contracts, nexg-phase-loop, 21st-ui-build, principle-test-behavior-not-implementation and principle-prove-it-works. Existing controls/styles were reused. The 21st CLI was unavailable locally; no component library or generation was installed. Independent read-only reviews identified capture preservation and inactive-field issues, which were corrected before handoff.
