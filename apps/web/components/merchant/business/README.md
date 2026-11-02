# Business frontend

Business is available in the existing merchant preview at `/merchant-live-preview/business`. Its six sections follow the generated Business references: Profile, Activities and setup, Locations and coverage, Team, Documents and Customer feedback. The user-requested banner photo controls extend the Profile reference.

The desktop baseline fits its content and actions in one viewport across all six tabs. Height-aware spacing handles the supplied screenshot's effective 1280 × 633 browser area at 150% zoom and the 1672 × 941 references. Profile keeps logo, banner, every public field, registered identity and the information note visible together. Detail panels retain their information, including document controls and location previews. Recovery messages sit beside the Business title without pushing content down. Mobile uses a stacked layout; larger user-created lists and long histories can exceed the baseline sample.

## Frontend behavior

- Profile edits have a live public preview, local draft recovery, protected contact/identity requests, and a before/after review. Logo and banner uploads accept PNG, JPEG or WebP up to 2 MB, decode locally and store a resized WebP preview. Banner removal and cancellation are reversible until confirmed locally.
- Activities use the shared 128-specialty taxonomy, selected reusable model, compatible methods, scoped declarations, location assignment, coverage declaration, optional booking and rental-driver setup. Declarations do not independently create a workflow or verify a claim. Actual catalogue and scheduling fields link to their existing owners.
- Locations use the registered physical/service-base/digital-operation types. Activity assignments are updated on both sides. Closing a location or disabling an activity with existing commitments is blocked and offers a review request.
- Team actions create local pending invitations and review role/location changes. Invitation acceptance remains an identity-owner event. The last active owner cannot be removed.
- Document replacement retains the current evidence and its verification state, adds replacement metadata/version history and shows review pending. Document bytes are not uploaded or retained. The sample requirements are owner-supplied illustrations, not an exhaustive legal checklist for every category.
- Feedback offers location/rating/response search, review selection, recovered reply drafts, simulated posting and reporting. Customer text and ratings remain read-only.

All persisted changes stay in `nexg.business.preview.v1.<specialty>` browser storage. Drafts use a separate per-section/per-record map. The source validates stored data and expected revisions, retains drafts after conflicts, and exposes recovery export/reset. Unreadable storage is never silently replaced. The header sample control provides specialty selection and normal, viewer, external, stale, offline, unavailable, empty and conflict states.

## Integration boundary

`BusinessSource` supplies load/save/reset through a replaceable typed adapter. This implementation uses no Business API, Supabase write, real invitation, document upload, public publication or external message. Frontend checks are not production authorization. A future source must enforce actual identities, permissions, field ownership, review decisions, revision transactions and approved requirements through their domain owners.

Business emits `nexg:business-preview-changed` with the saved specialty/revision. It does not silently rewrite the independent Offerings, Availability or Work preview stores. Their eventual shared-configuration adapter must consume confirmed scoped changes. Existing work retains its accepted terms.

`config.json` is generated from the booking runtime registry using `node scripts/sync-business-config.mjs`. It records the source revision/digest, all 128 profiles and 323 canonical question definitions. Profiles and supported fields can be added to that upstream registry and regenerated without another Business page. Novel models or question editors still require a registered implementation. A merchant's free-text category request remains a request.

## Verification

- `pnpm --filter @nexg/web exec vitest run components/merchant/business/model.test.ts`
- `pnpm --filter @nexg/web exec tsc -p tsconfig.business.json`
- `pnpm --filter @nexg/web exec eslint components/merchant/business app/merchant-live-preview/business/page.tsx`
- `node scripts/smoke-business-preview.cjs` against the frontend preview on port 3129.
- `node scripts/smoke-business-layout.cjs` checks all six tabs at five desktop sizes, actual content overflow and action visibility, and recovery-notice layout. Evidence is recorded in `frontend-layout.json` with screenshots in the system temporary folder.
- `node scripts/verify-business-coverage.cjs` records browser selection/rendering evidence for all baseline specialties in `docs/merchant-portal-plan/business-adaptation/frontend-coverage.json`.

The browser journey covers all six sections, media/draft recovery, local save review, hybrid setup, commitment protection, pending invitations, document replacement, feedback, permission states and mobile navigation. Coverage of 128 sample profiles does not certify every possible answer/source combination or a live backend.

## Design assets

The six references are in `docs/merchant-portal-plan/business-adaptation/images/business-sections-2026-10-31`. The generated salon banner is `apps/web/public/images/business/salon-preview.png`. It was created with built-in image generation using this prompt: "Generate a single wide landscape interior photograph for a fictional salon's public-profile header, about 3:1 composition. Warm ivory and oak modern Nairobi beauty salon, elegant empty styling chairs, backlit mirrors, subtle olive-green potted plants and neatly arranged unbranded products. No people, no text, no logos, no watermark. Calm realistic natural light, matching a refined cream and warm-gold merchant business portal. Crop-friendly, eye-level broad interior view."
