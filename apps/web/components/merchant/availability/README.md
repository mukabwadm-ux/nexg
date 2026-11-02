# NEXG Availability frontend

The Availability screen lives at /merchant-live-preview/availability. It uses the existing merchant shell and the current Offerings catalogue. Onboarding remains a later step.

## Adaptation

The selected registered profile, actual offering/editor, fulfilment method and location resolve a shared view descriptor. The current catalogue has 128 specialties, 193 eligible profile/model bindings, 18 editor schemas and 15 primitives. Eligible candidates are inactive until an offering explicitly uses that editor. The sample configuration can create a candidate through OfferingsSource to inspect it.

- Orders, enquiries and entitlements start with operating, response or access hours.
- Appointments and visits show the actual joint staff, room, travel and vehicle claims.
- Rentals and spaces use named resource intervals, turnover and actual custody.
- Sessions and shared tours use dated occurrences with one participant pool and an exclusive resource anchor.
- Production shows due milestones and workload units. Linked work shows incoming, processing and outgoing roles. Queue intake does not reserve an appointment.
- Storage and freight keep independent dimensions and named resources. An empty or stale source never proves capacity.

The additionalProfiles input accepts future categories using registered schema/model behaviour. extendOfferingProfiles validates the registration. New behaviour requires an explicit schema/descriptor/validator; unknown editors stay unresolved. This input is a frontend extension contract and does not change onboarding or category administration.

## Module responsibilities

- model.ts: source snapshots, scopes, typed units, interval rules, view resolution, proposals, impact and the internal sample evaluator.
- source.ts: AvailabilitySource and a browser-only local implementation; Offerings version checks, operations, revisions, scoped drafts and narrow Work resolution.
- workspace.tsx: context, tabs, controlled date/views, source states and transactions.
- calendar.tsx / views.tsx: hours, month, time/resource calendars, asset timelines, agenda, session and capacity projections. Status icons/labels/colours share one presentation map. Overlaps occupy separate lanes and cross-day spans are clipped to the day. Views expand to preserve actual out-of-hours times.
- forms.tsx / inspectors.tsx: editable inputs, impact review, persistent actions, hold/fee/source details and internal availability checks.
- work-entry.tsx: opt-in same-record local Work handoff. Ordinary Work retains its existing component.

## Persistence and transactions

Owned key: nexg.availability.preview.v1.<profileId>. Each document contains a revision and scopes keyed by location, offering ID and method; snapshots, drafts and persisted operation results are distinct. Default seeds are not written merely by viewing them. Mutations reload and check the revision and current Offering version before applying.

Draft -> review impact -> Apply in preview. An uncertain result retains a stable operation ID and must be reconciled. A newer intervening revision blocks a stale reconciliation. A related Work update preserves a separately saved Availability proposal. Draft blocks may appear on the calendar but are labelled DRAFT / Not applied and never reduce available capacity.

Cross-scope resource claims retain their owning activity/location and do not copy participant quantities into another pool. Accepted buffers and fees remain on existing commitments when Offerings changes. A hold deadline produces Expiry being checked until an explicit sample source result releases it. Payment evidence alone does not confirm a conflicting allocation.

CSV copy/import/export handles weekly hours with explicit location targets, validation and per-target outcomes. Exported spreadsheet cells escape formula-leading characters. A draft can also be exported after a local save failure. No calendar feed or Google connection is published.

## Interaction and layout

The desktop page occupies the viewport. Header, date/view controls, footer and inspector actions remain outside the scrolling schedule/detail bodies. On phones, agenda and focused detail layouts retain the same records. Empty time slots support keyboard activation. Dragging a booking opens a proposal review; Work must revalidate a reschedule. Blocks use the same review/apply flow. Read-only roles can still inspect existing work.

The three supplied ReUI examples informed bounded frames, resource columns, controlled views, semantic status presentation and guarded interaction callbacks. No third-party snippet bundle or extra calendar dependency was copied or installed.

## Frontend boundary

All data and role/source/failure responses are local sample state. This is not the production booking engine, ERP, payment processor, source of inventory truth or authorization service. The screen does not call Supabase, booking APIs, Google Calendar, discovery or onboarding. Existing backend booking work is outside this module.

Fixed sample time is 3 November 2026, 09:40 in Africa/Nairobi (EAT). Source coverage is bounded and visible. Dates outside coverage cannot produce an available result. Production recurrence, provider reconciliation, holiday services, payments and customer discovery require their own later integration work.

## Verification

From the repository root:

    pnpm --filter @nexg/web exec vitest run components/merchant/availability/model.test.ts components/merchant/offerings/model.test.ts components/merchant/work/model.test.ts
    pnpm --filter @nexg/web exec tsc --noEmit --incremental false -p tsconfig.availability.json
    pnpm --filter @nexg/web exec eslint components/merchant/availability --ext .ts,.tsx

Run scripts/smoke-availability-preview.cjs and scripts/smoke-availability-states.cjs against a running development server; AVAILABILITY_URL selects its origin. The first checks merchant journeys and all eligible catalogue bindings. The second checks calendar interaction, viewports and recovery. Actual results and screenshots are under docs/merchant-portal-plan/availability-concept/implementation. The earlier design verification.json is a separate planning artifact.
