# Availability frontend handoff —31 October2026

Implemented in the existing merchant workspace. Frontend only; onboarding comes last.

## Entry and adaptation

- Route: /merchant-live-preview/availability. Existing user preview is on localhost:3129; isolated verification server is on localhost:3131.
- Shared module: apps/web/components/merchant/availability. Read its README for contracts and verification commands.
- Uses the current Offerings catalogue and registered schema/model/method context for128 specialties,193 eligible bindings and18 editor variants. Future categories can reuse registered descriptors through additionalProfiles; unknown handlers stay unresolved.
- Hours/intake, staff/room/time calendars, asset/space timelines, dated sessions, due milestones/workload, linked fulfilment, queue, response, access and typed occupancy retain distinct meanings.

## Completed local journeys

Hours and future-effective changes persist. Dated overrides, scoped pause/resume, capacity, recurrence, blocks/removal, copy/import/export and impact review use one local source. Holds retain capacity until sample owner acknowledgement. Optional fees are defined in Offerings; accepted fees and buffers remain on existing work. A narrow Work adapter opens the same record for return, reassignment, reschedule or sample fee evidence. It preserves saved Availability drafts during related Work updates.

Source/role/failure simulations, unknown operation reconciliation, idempotency, storage denial/corruption, cross-tab revisions, shared resource constraints and dirty-close recovery are explicit. No ordinary order requires blanket merchant acceptance.

## Latest layout correction

The user’s short browser viewport exposed a calendar that was squeezed by surrounding controls. The final layout gives the schedule the working area: compact heading/context/status/toolbars on short screens, full-height adjacent inspector, no irrelevant asset service-duration strip, a reserved column for desktop side editing and compact conflict information without repeated warnings. Native resource details and advanced settings expand when needed. The calendar itself retains readable event data, semantic icons/colours, exact constraints and all seven days.

Validated seventeen layout cases across five desktop sizes, including1280×633 at1.5 pixel scale. Seven hours rows, four vehicle rows and seven columns, the full default timed range, affected Work links and persistent actions are asserted. Mobile uses the same records through agenda and focused detail layouts.

## Verification

Evidence is in docs/merchant-portal-plan/availability-concept/implementation:

- browser-verification.json: all128/193/18 render and activation sweep; same-record journeys; no network writes.
- interaction-verification.json: keyboard, move proposal, viewer, sessions, source failure, revision and storage journeys.
- layout-verification.json:17 schedule-area checks and final screenshots.
- verification.json: commands and hashes.

57 unit tests pass:31 Availability,19 Offerings and7 Work. Scoped type and focused lint checks pass. These are frontend checks, not production booking, payment, provider or full accessibility certification.

## Shared boundaries

Additive changes touch MerchantLivePreviewShell, the opt-in Work wrapper, Offerings initial context/fee/transport fields, and passive consumer chrome/location/service-worker handling for merchant previews. Ordinary Work/Offerings interfaces remain compatible. Preserve other chats’ active Business/Work/Offerings edits when committing.

No backend, database, Supabase, auth, Google, ERP, discovery or onboarding implementation is part of this delivery. No merge, commit or push was performed for this frontend task.
