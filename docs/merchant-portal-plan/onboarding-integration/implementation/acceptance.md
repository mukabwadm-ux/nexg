# Optional onboarding capture: implementation evidence

Date: 2 November 2026, Africa/Nairobi.

Historical increment: the later user-directed [Phase 2 short registration](phase-2-acceptance.md) supersedes the startup optional wizard described below. Shared configuration and capture preservation remain implemented; detailed capture now opens only from Home task editors.

## Implemented increment

The original `merchant-onboarding` form is retained and edited in place. Its six sections remain. Basic business/contact information and category/subcategories identify the application; offerings, locations, operation settings, evidence and payouts can be captured now or left unfinished. No missing operational field blocks pre-auth continuation, and those fields do not display required stars before actual OTP verification plus sign-in.

The category chooser and specialty questions now consume the existing compiled merchant JSON through `@nexg/booking-config/onboarding`. The shared API resolves 21 categories/128 specialties and their existing source questions; it uses the existing schema validator and bounded predicate evaluator. It does not invent another taxonomy, grant authorization, verify declarations or activate a candidate workflow. Each specialty's answers remain scoped. Requirements are evaluated only when both authentication conditions are true.

The standalone form hands actual current entries to a labelled setup Home preview. Missing answers remain visible as setup tasks; previously supplied answers are counted as supplied rather than verified. Review/add actions return to the same form state. Operational navigation displays a safe approval lock over empty placeholders. Production Home and existing operational modules were not replaced.

## Preservation and validation

- Untouched listing placeholders are omitted; blank prices stay null, not zero. Partial, unassigned and inactive listings retain draft state and explicit activity state in the capture payload.
- Category changes retain recoverable category-specific entries. Shared business details and in-memory selected files are not discarded. Deselecting a specialty does not silently reassign typed listings.
- False, zero and unanswered registry answers remain distinct. Clearing the last optional multiselect choice removes that input key, so an optional empty choice cannot force a selection.
- Malformed supplied values still have validation feedback. Hidden booking/rental or model-specific draft fields do not block the currently active branch.
- Overnight hour capture is accepted. Exact schedule/resource validation remains an owner integration, not proof of bookable availability.
- No localStorage/sessionStorage is used for sensitive capture. Preview data and files live in memory and are cleared on refresh/close. Preview Save draft explicitly describes that limitation.
- Demo requests to nonexistent endpoints were removed. No code is sent, no account is signed in, no application is submitted, and no merchant is approved by this preview.

## Checks actually executed

| Check | Observed result | Repetition record |
| --- | --- | --- |
| Shared configuration package tests | 212 passing, including 152 onboarding tests covering every one of the 128 profiles, typed values, scope isolation and all OTP/sign-in combinations | Implementation/schema/conditional-visibility code changed between correction runs. Parent reused the final result and did not rerun unchanged package tests. See shared-contract-verification.md |
| Shared strict TypeScript and targeted formatting | Passed in the shared-package implementation | Reused the recorded final result; no parent rerun |
| `node --test src/capture.test.js`, in the isolated form | 13 passing | First 11 passed; read-only review then found inactive-branch validation defects. Capture code and regression tests changed, justifying the final 13-test run |
| `node scripts/smoke-onboarding-preview.cjs` | Five browser journeys passed; no runtime errors, server writes or browser persistence | Ran once. Desktop/phone artifacts saved with that run; not rerun after unrelated fixes |
| `node scripts/check-onboarding-capture-regressions.cjs` | Targeted optional-clear, partial/inactive payload and Home draft-summary checks passed | Added after the covered code changed. Initial test harness used a wrong dynamic CommonJS export; harness corrected and rerun. No product failure was hidden |
| `npm run build`, in the isolated form | Passed; 223 modules transformed | Initial build passed; relevant shared/form code then changed. Final build passed on that revision. No further rebuild after documentation-only updates |

The user requires checks once per covered code revision. Passed checks are reused; repeat only after the code under that check changes. The smoke journey's saved screenshots describe that tested revision, not an unobserved production screen.

Vite reports a large-chunk advisory: the shared compiled merchant registry is currently bundled in the isolated preview. This does not fail the build; production bundle shaping remains a later integration concern.

## Artifacts

- [Browser journeys](browser-verification.json).
- [Targeted capture regressions](capture-regressions.json).
- [Desktop preview](home-preview-desktop.png).
- [Phone preview](home-preview-phone.png).

## Explicit limits

This implements the shared category/question foundation and a frontend form-to-Home demonstration. It is not completion of all P1–P8 backend/admin/operational contracts. Email OTP is deferred by the user. No real sign-in, durable draft/upload, server permission gate, admin case/decision, publication or live booking/payment workflow is verified. The preview lock conveys the desired experience; real enforcement is a later backend responsibility.

Only the isolated merchant-onboarding development server on 127.0.0.1:5181 was started. The whole portal, backend and admin were not started. No credentials, messages, provider requests or database migrations were used.
