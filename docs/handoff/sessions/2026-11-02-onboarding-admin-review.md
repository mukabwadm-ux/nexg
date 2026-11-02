
## Phase 6 managed application review

The existing admin portal contains a separate queue and submitted-snapshot view for short merchant applications. Staff with active current grants can approve workspace access, request changes or reject using the existing revision-bound review command. The merchant Home presents bounded feedback until resubmission. The queue does not use the legacy publication action.

Local verification covers 18 reader cases, 28 HTTP cases, one actual SQL review scenario, 15 UI/SSR cases, six middleware cases and scoped TypeScript checks. Phase 5 Home/demo and Phase 6 reviewer evidence is linked from [Phase 6 acceptance](../../merchant-portal-plan/onboarding-integration/phase-6-acceptance.md). The existing platform's `/merchants/register` route responds with new registration still deliberately feature-disabled. No Auth users, production migration, service startup or publication state changed in this work.

Real configured Auth/PostgREST and deployed-schema acceptance remain open, as do Phase 7 activation/source connections and the user-requested final email OTP. No active Odoo, QuickBooks or other ERP connection is claimed.
