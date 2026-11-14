# Current handoff index

- [Shared services, 12 November 2026](sessions/2026-11-12-shared-services.md). One shared Supabase backend for every NexG app: the phase 1 fixes in #146, the owner decisions D1 to D15 still open, the backend queue, and how to change the shared backend safely. The owner sends the private notes directly.

- [Unified merchant platform, 2 November 2026](sessions/2026-11-02-unified-merchant-platform.md). The Derrick NEXG checkout is the primary source for the combined platform and merchant workspace; the separate merchant folder is a retained local backup.

- [Merchant email OTP](../merchant-email-otp.md). The local onboarding handoff and returning email-code sign-in use Supabase Auth with Resend SMTP. An isolated Auth check passed; delivery and the full real merchant journey still need confirmation with the authorized test inbox. Hosted-project configuration is separate.
- [Merchant email verification design, 2 November 2026](sessions/2026-11-02-email-verification-design.md). Background for the original preview.

- [Phase 6 merchant application review, 2 November 2026](sessions/2026-11-02-onboarding-admin-review.md). Existing admin portal now contains a bounded city-aware Applications queue, submitted-snapshot review and revision-bound approve/request-changes/reject controls. Locally verified against focused SQL/HTTP/UI fixtures. The current registration gate remains disabled pending configured live Auth and deployed-schema acceptance. [Acceptance and limits](../merchant-portal-plan/onboarding-integration/phase-6-acceptance.md).

- [Phase 5 saved merchant journey, 2 November 2026](sessions/2026-11-02-onboarding-real-journey.md). Saved owner-source Home, managed shell, onboarding-only demo and rejected-decision recovery are locally implemented and verified. The existing port 3000 endpoint responds with real registration deliberately feature-disabled. Configured-runtime/deployment acceptance remains open; Phase 6 reviewer UI is next. [Acceptance and limits](../merchant-portal-plan/onboarding-integration/phase-5-acceptance.md).

- [Merchant backend foundation, 2 November 2026](sessions/2026-11-02-merchant-backend-foundation.md). Local application/RPC/permission/session/payout/API foundation implemented and verified; connected entry stays disabled until real Supabase staging acceptance. Existing booking reads are now non-mutating. Odoo/QuickBooks use a reusable connector boundary with no active provider. [Rollout, configuration and remaining gates](../merchant-portal-plan/onboarding-integration/phase-4-rollout.md).

- [Phase 4 source and payout inputs, 2 November 2026](../merchant-portal-plan/onboarding-integration/phase-4-existing-systems-and-payouts.md). Official Till/PayBill research, existing payout fields and booking engine, and the earlier backend/API audit location. Research only; reconcile existing sources before backend integration. Registration remains short and email OTP stays last.

- [Shared Home connection, 2 November 2026](sessions/2026-11-02-onboarding-shared-home.md). Phase 3 now uses the existing Home view and actual workspace frame, with entered-data tasks/progress and retained editors. Backend, real authentication/admin approval and activation remain open; email OTP is still deferred. Tests once per covered code revision.

- [Short registration and shared merchant configuration, 2 November 2026](sessions/2026-11-02-onboarding-implementation.md). Phase 1's category/question foundation is implemented. Phase 2 uses only basic registration fields; the original detailed form remains available through Home task editors. Email OTP and business/person presentation remain deferred. Tests run once per covered code revision, repeated only after that code changes.

- [Phase 0 registration rules, 1 November 2026](sessions/2026-11-01-onboarding-phase-0.md). Basic business/contact registration plus required category/subcategories; all operating details deferred to Home. Business/person header presentation deferred to the final pass. P0 specified; P1–P8 not started.

- [Onboarding/Home/admin integration plan, 1 November 2026](sessions/2026-11-01-onboarding-home-approval-plan.md). Planning only. Short optional entry; Home setup tasks usable while admin approval is pending; other portal sections safely blurred/locked. No application or service changes in this planning pass.

- [Money frontend sample, 31 October 2026](money-frontend-2026-10-31.md) — verified local preview; production source and integration work remains open.
- [Availability frontend, 31 October 2026](availability-frontend-2026-10-31.md).
- [Business adaptation, 31 October 2026](business-adaptation-2026-10-31.md).
- [Work adaptation, 31 October 2026](work-adaptation-2026-10-31.md).
- [Merchant statistics design, 31 October 2026](merchant-statistics-2026-10-31.md).

Other chats may continue changing the shared checkout. Read the relevant current module and its handoff before editing it.
