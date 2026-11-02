# Kenya Merchant Onboarding (React)

## Current implementation, 2 November 2026

Phase 3 now connects this form to the actual shared `HomeSetupView` and `WorkspaceFrame` extracted from the existing merchant portal components. The earlier separate Home demonstration was removed. `projectOnboardingHome` supplies applicable rows and truthful progress from the same merchant JSON and entered details. The retained setup editors also render inside the shared frame. The isolated preview reuses the workspace's already installed design tooling, token preset, Manrope font and icon/navigation definitions.

Current Phase 3 evidence is in `docs/merchant-portal-plan/onboarding-integration/implementation/phase-3-acceptance.md` from the workspace root. Its current browser check is `node scripts/smoke-onboarding-connected-home.cjs`. Earlier six-step/standalone-Home scripts are historical evidence. Do not rerun unchanged checks. Backend/auth/admin source integration remains open; this is still an explicitly labelled local preview.

The original form is retained. Its shared category/subcategory and specialty-question model now comes from the developed merchant JSON through `packages/booking-config/src/onboarding.ts`. The shared model has 212 passing package tests, including 152 onboarding cases; unchanged tests are not rerun unless their covered code changes.

The user's latest Phase 2 direction is a single short registration page containing only business/applicant names, category/subcategories, branch count, email/Kenyan phone, a different business contact number where needed, registration declaration, required policy acknowledgement and optional marketing. The existing detailed sections are reused from Home task editors, not shown as onboarding steps. Partial captured portal data must not block basic registration.

The local App uses explicit preview callbacks. There are no requests to nonexistent API endpoints, fake OTP codes, live sign-ins, uploads or admin decisions. Entries and files remain in component memory; refresh or close clears them. Only the isolated form is served at `http://127.0.0.1:5181/`. Email OTP is deferred until the end. Production Home, backend persistence/permissions, admin approval and operational activation remain separate integration work.

`authenticatedSession` is a future UI-adapter input with `otpVerified` and `signedIn`; it is never server authorization. Both must be confirmed before applicable specialty setup requiredness applies. The preview's locked operational destinations contain safe placeholders, not real hidden data.

Current implementation evidence is in `docs/merchant-portal-plan/onboarding-integration/implementation/` from the workspace root. Tests run once per covered code revision; repeat only when that code changes.

The original prototype notes below are historical integration background. Their six-step startup flow, demo endpoint paths and schemaVersion 1 payload are superseded by the current implementation.

## Original prototype notes

A six-step, category-aware React onboarding flow for the 21 merchant categories and subcategories discussed in this project.

## Included

- Step 1: business and owner details
- Step 2: category, subcategory selection and repeatable customer-facing offers
- Step 3: Kenyan county, premise, coverage and fulfillment selection
- Step 4: category-specific operating hours, preparation/turnaround, booking, picking, service or freight capacity
- Step 5: core documents and conditional category-specific compliance uploads
- Step 6: payout, policies, submission and application status
- Conditional rider packaging; packaging is not shown for categories that do not require physical product handoff
- Six step navigation, required-field validation, KES price collection, file type/size checks and keyboard-accessible controls
- Callbacks for secure draft persistence and backend submission

## Run the demo

Requires Node.js and npm.

```sh
npm install
npm run dev
```

Vite shows a local URL. The demo uses `/api/merchant-onboarding/draft` and `/api/merchant-onboarding`; replace these URLs with your backend endpoints.

## Integrate into an existing React app

Copy `src/MerchantOnboarding.jsx`, `src/merchantCategories.js` and `src/merchant-onboarding.css`, then import:

```jsx
import MerchantOnboarding from "./MerchantOnboarding";

<MerchantOnboarding
  initialData={savedDraft}
  onSaveDraft={async (draft) => api.saveDraft(draft)}
  onSubmit={async (payload) => api.submitMerchant(payload)}
  applicationStatus={merchantStatus}
/>
```

Props:

- `initialData`: optional onboarding form data from a previously saved draft.
- `onSaveDraft(payload)`: persists a draft. Connect this to an authenticated, access-controlled backend; the component does not write identity or tax data to local storage.
- `onSubmit(payload)`: submits application data and uploaded File objects. Return an object such as `{ applicationId, status: "Submitted" }`.
- `applicationStatus`: optional server-managed review state.
- `onStatusChange(status)`: optional demo/review control; production status changes should come from the backend.
- `onBackToMarketplace()`: optional exit-navigation callback.

## Backend contract

The submit payload includes:

- `schemaVersion`, `country: "KE"`, `currency: "KES"`
- `categoryId`, `categoryName`, selected `subcategories`
- `business`, repeated `offers`, `location`, `operations`
- `packaging` only when relevant (otherwise `null`)
- `compliance`, `payout`, `policies`
- `documents` as a map of document key to browser `File`

The demo converts this payload into multipart `FormData`. In production, validate every field again server-side, scan uploads, store files privately, return an application ID, and keep approval decisions server-controlled. Do not treat frontend validation or a merchant checkbox as proof of a licence.

## Operational branches

Category configuration is data-driven in `src/merchantCategories.js`. Each category declares its subcategories, timing model, booking conditions, rider packaging behavior, required fulfillment modes, category listing fields, conditional evidence prompts, review checks and post-approval checklist.

Timing models avoid applying food preparation timers to stock-only categories. Booking-oriented services collect availability/capacity settings. Rider packaging fields appear only when rider delivery is selected and the category enables packaging.

Compliance prompts are implementation defaults for workflow routing, not legal determinations. Have Kenya counsel/compliance staff maintain the category-specific document rules and regulator verification sources as requirements change. The backend should make a restricted/conditional approval per product, location, service or fulfillment mode where possible.

## Production work still required

- Replace demo API paths with authenticated API endpoints and connect upload storage.
- Add phone OTP, KRA PIN/entity validation, bank/mobile-money ownership checks and regulator verification.
- Implement server-side draft recovery, idempotent submission, malware scanning and document expiry reminders.
- Add localization, analytics, admin review queues, action-required resubmission and approval/rejection notifications.
- Connect booking, inventory, delivery and rider dispatch engines to the saved merchant configuration.

