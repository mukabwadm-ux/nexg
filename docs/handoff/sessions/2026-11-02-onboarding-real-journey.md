# Phase 5 saved merchant journey

Date: 2 November 2026, Africa/Nairobi. Active implementation: `C:\Users\limta\Desktop\MERCHANT WORKSPACE`. Derrick NexG remains reference only. Status: local implementation and focused verification complete; configured-runtime acceptance remains open.

This handoff supersedes the Phase 5 source/shell follow-up in the [Phase 4 handoff](2026-11-02-merchant-backend-foundation.md). Read [Phase 5 acceptance](../../merchant-portal-plan/onboarding-integration/phase-5-acceptance.md) for the final check record and limits, and the [implementation plan](../../merchant-portal-plan/onboarding-integration/phase-5-real-journey.md) for the scope decisions.

## Implemented behavior

Confirmed short-form submission returns to actual `/merchant`. Managed Home verifies existing owner/session authority, loads the revisioned application and private payout, then reads bounded owned catalogue, locations, weekly hours and current document records. It shows saved facts and current review/access without substituting samples. Activity links, bookable schedules, complete document requirements, finance verification and live readiness are not inferred from record counts. Partial source failures show unavailable; application/access failures restrict the page with recovery.

The actual managed workspace uses the shared frame, server-owned destinations and pending operational locks. Permitted setup editors retain their own server authorization. Locked panels contain generic empty placeholders, and no operational data is fetched beneath blur. Legacy merchants retain their existing shell behavior.

The labelled sample demo is activated only from onboarding and exits to `/merchants/register`. The portal has no demo activation control. Safe sign-in return preserves the onboarding journey. A rejected application receives the protected minimal `/merchants/decision` page, with generic status, public help and the existing actor-safe sign-out. It grants no setup or operational access and reads no application, payout or document fields.

Primary implementation is in `apps/web/lib/merchant-home-source.ts`, `app/merchant/page.tsx`, `components/merchant/frame.tsx`, `components/merchant/workspace/merchant-workspace-shell.tsx`, `components/onboarding/connected-application.tsx`, `components/onboarding/demo-entry.tsx`, the registration/sign-in adapters, `lib/partner.ts`, the decision page and session middleware. Shared saved Home rendering remains in `merchant-onboarding/src/ConnectedMerchantHome.jsx`.

## Verification and runtime boundary

The final persisted journey passed 1 integration scenario in 16.14 seconds. It uses the actual application handler, actual application migration functions, saved source/projector and Home renderer with controlled fixture Auth/session dependencies. Data survives file-backed PostgreSQL/PGlite closes and reopens within the test process. The final scoped integration TypeScript check and scoped diff check exited 0. This does not prove remote Supabase Auth, PostgREST transport, independent concurrent connections, storage or deployment acceptance.

Other focused evidence covers source errors and truthfulness, managed shell locks/setup routes, onboarding/demo entry and rejected-decision recovery. The decision check passed 37 guard/page/middleware tests and its focused TypeScript check. Reuse unchanged earlier evidence; rerun only checks whose covered implementation or test changes.

- [Persisted journey evidence](../../merchant-portal-plan/onboarding-integration/phase-5-persisted-journey-evidence.md).
- [Managed shell checks and browser fixtures](../../merchant-portal-plan/onboarding-integration/implementation/phase-5-shell-verification.md).
- [Onboarding entry browser record](../../merchant-portal-plan/onboarding-integration/implementation/phase-5-entry-browser-verification.json).
- [Rejected-decision recovery](../../merchant-portal-plan/onboarding-integration/phase-5-decision-recovery-evidence.md).

The existing Next endpoint on port 3000 is responding. Browser inspection of actual `/merchants/register` showed "Real registration is temporarily unavailable" with the demo entry. The blocker to the configured registration journey is the deliberately disabled feature gate and outstanding deployment acceptance, not an offline endpoint. No service was started, feature gate enabled, production migration applied or provider connection activated for this work.

## Next work

Continue with Phase 6 reviewer UI using the same saved application revision and existing review commands. Preserve stale-decision rejection, owner/reviewer isolation and the distinction between approval and publication. Phase 7 owns applicable activation/readiness; email OTP and final business/person presentation remain at the end.

Configured-runtime acceptance still requires enabled registration in the existing authorized test platform, real Auth/PostgREST save/reload/submit/Home and review propagation, session refresh/logout/account switching, membership/review revocation and concurrent-connection recovery. Private document/storage controls and deployment/migration/API cutover remain governed by the [Phase 4 rollout record](../../merchant-portal-plan/onboarding-integration/phase-4-rollout.md). Preserve records and existing legacy behavior. Local Phase 5 checks do not close the whole merchant journey.

## Phase 6 admin application review

The existing admin portal can now review the new short applications through its bounded queue and submitted-snapshot detail. Approve/request-changes/reject use current staff grant/session checks and the existing revision-bound command. Feedback reaches merchant Home, including after a saved edit before resubmission. Approval does not publish or activate. Local SQL/transport/UI/middleware checks and scoped type checks passed; configured real Auth and deployed migrations remain unverified. The merchant registration gate stays off until that boundary is accepted. See [Phase 6 evidence](../merchant-portal-plan/onboarding-integration/phase-6-acceptance.md), [backend checks](../merchant-portal-plan/onboarding-integration/phase-6-backend-evidence.md) and [UI checks](../merchant-portal-plan/onboarding-integration/phase-6-admin-ui-evidence.md).

## Superseding Phase 6 review update

Phase 6 has now implemented and locally verified the managed application queue, immutable submitted-snapshot detail and separate approve/request-changes/reject actions in the existing admin portal. See the [current Phase 6 acceptance record](../../merchant-portal-plan/onboarding-integration/phase-6-acceptance.md) and [Phase 6 handoff](2026-11-02-onboarding-admin-review.md). This supersedes the next-work items above. Real Auth and deployed-schema acceptance, Phase 7 activation and final email OTP remain open.
