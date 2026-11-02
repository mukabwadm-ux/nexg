# Phase 2: registration contains only entry essentials

Date: 2 November 2026, Africa/Nairobi. User-authorized implementation amendment.

This latest instruction supersedes the earlier request to retain optional operating questions inside registration. If the information can be entered in the portal, defer it to Home. Keep and reuse the existing detailed form sections as task editors; do not discard their data or replace the portal.

## Entry page

Use one short page containing only:

1. Business name and applicant first/last name.
2. Canonical category and relevant subcategories, from the existing shared merchant JSON.
3. Declared branch count, business email and Kenyan phone number.
4. A different business contact number only when needed.
5. Registration yes/no and the required policy acknowledgement.
6. Optional marketing preference, initially off.

Do not show a six-step wizard, operating questions, listings, locations, legal-entity details, hours, documents, payouts or specialty-attribute questions before Home. Category/subcategory membership configures the starting portal and its applicable tasks. It does not verify readiness or approve the merchant.

When `MERCHANT_ONBOARDING_V1_ENABLED=true`, the legacy `/merchants/apply/start` URL forwards to `/merchants/register` so old entry links reach the connected short form. The old handler remains only behind the disabled rollout path.

## Boundaries and verification

Reuse the Phase 1 shared configuration. Initial validation covers only entry essentials and policy acknowledgement. Existing partial operational drafts cannot block registration. Home task editors keep existing input and permit relevant partial capture without inventing verified completion. A task edit and registration review are distinct navigation routes.

Email OTP remains deferred until the end. The standalone callback remains a labelled in-memory Home preview, never real sign-in, submission or admin approval. The connected form reuses the existing Supabase anonymous Auth session to start and submit a real application before account creation. The same Auth user ID owns the application and restricted pending Home; creating an account upgrades that identity in place. Anonymous sessions cannot view or save payout details, extend a signed-in session, use admin review, or read operational merchant records, even after approval.

## Entry-path correction

Both `/merchants/apply` and the “Register Your Business” account link route to `/merchants/register` while V1 is enabled. The previous `/merchants/apply` index resumed the legacy wizard, and the register page itself required a full account before it rendered the form; together these created the reported old-route loop. The fix keeps the existing `MerchantOnboarding.jsx` form and capture API. It creates an anonymous session only when there is no current Auth session, then refreshes the same route to render that form.

Migration `20261102000400_merchant_anonymous_intake.sql` expands the existing session check to validate anonymous Auth sessions and introduces an intake-only check for application start/save/submit/read/recovery. The established signed-in check remains required for payout, account activity and reviewer decisions. Workspace access exposes only setup for an anonymous owner; operational reads additionally require a non-anonymous, valid session and an approved revision. The local Auth configuration enables anonymous sign-in and limits it to 30 attempts per hour per IP.

Run new/affected registration checks once on the changed code. Reuse unchanged Phase 1 and capture-test evidence. Verify the short form is shown without a pre-form account gate; its submitted revision reaches saved pending Home; deferred setup editors remain distinct from approval; a claimed account retains the same application; anonymous payout, admin and operational access stay denied; category membership uses the canonical registry; policy acknowledgement is explicit and marketing optional. Record exact evidence and limits in the implementation acceptance file.

The main plan's 34-section coverage applies. The entry page keeps the existing domain and form source. The added migration is forward-only and preserves the signed-in policy boundary; rollback removes the route/bootstrap usage and leaves saved applications untouched.
