# Business frontend handoff — 31 October 2026

The existing merchant workspace now includes Profile, Activities & setup, Locations & coverage, Team, Documents and Customer feedback at `/merchant-live-preview/business`. The six generated Business images supply the layout references. The requested banner controls extend Profile alongside its logo control.

Desktop baseline content fits on one screen. Compact spacing accounts for the supplied 1920 × 950 browser content area at 150% zoom (1280 × 633 CSS pixels). The public-profile fields, media controls, registered identity and information note remain visible together. All selected-record panels retain their information and bottom actions. Recovery notices sit beside the page title without reducing the content area. Location preview image and caption follow the horizontal reference arrangement. Mobile retains a stacked responsive layout.

The frontend uses the shared 128-specialty, 21-category booking taxonomy and 323 canonical question definitions. Reusable models select compatible fulfilment, typed operating places, category declarations and resource prerequisites. Specialty examples remain separate browser samples; candidate capabilities are not silently activated. Icons follow the activity model, and logo initials follow the merchant name.

Profile supports locally decoded/resized logo and banner images, replace/remove banner, live preview, draft recovery, before/after confirmation and cancellation. Activities, locations and team support local creation/editing and protected changes. Documents preserve confirmed evidence while recording replacement metadata and review state. Feedback preserves customer reviews while supporting recovered reply drafts and simulated posting/reporting. Account approval, invitation acceptance, protected identity and evidence verification remain owner-managed facts.

The replaceable `BusinessSource` adapter uses local browser storage and revision checks. It exposes validation failures, recovery export/reset and conflicts without discarding drafts. It emits a confirmed local configuration-change event; it does not rewrite the independent Work, Offerings or Availability sample stores. Those screens' future shared adapter must consume confirmed changes through their owners.

Verification completed:

- Ten configuration/source tests passed, covering all 128 baseline specialties, model/method prerequisites, future definitions, ownership, stale revisions, commitment protection, independent drafts and corrupt storage.
- The Business TypeScript and lint checks passed. The full web type check also passed in this session.
- The browser journey passed across all six sections, banner upload/removal/validation, media and draft recovery, local confirmation, hybrid activity setup, commitment protection, pending invitation, retained evidence, feedback, viewer access, conflict recovery and mobile navigation.
- Thirty layout checks passed: all six tabs at 1280 × 633, 1440 × 800, 1536 × 864, 1672 × 941 and 1920 × 950. Actual panel content dimensions were checked against available space and action positions. A recovered-profile notice also passed. Evidence is in the Business adaptation `frontend-layout.json` report.
- Baseline browser selection/rendering passed for all 128 specialties; the separate `frontend-coverage.json` report records that scope.

The layout result covers the baseline reference content. Longer user-created lists, long histories and all possible answer/source combinations are not certified by that result. No production authorization, API connection, invitation sending, public publication, document-byte upload or backend verification is implemented. Supabase and onboarding remain outside this work.
