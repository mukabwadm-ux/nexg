# Availability frontend acceptance

31 October 2026. Frontend implementation in the existing merchant workspace; onboarding remains last. The original plan and three generated concepts remain separate design artifacts.

## What is implemented

The shared Availability module resolves the selected actual Offering, registered editor/model, fulfilment method, location and source state. All 128 current specialties are available through Sample specialty. Eligible alternative activities are explicitly created through OfferingsSource; a candidate never activates merely because its category can support it. Future profiles can reuse registered behaviour through additionalProfiles.

| Plan features | Implemented behaviour | Evidence |
| --- | --- | --- |
| AV01–AV02 | Actual offering/method/location, schema/workflow context, controlled date, month/week/day/agenda, EAT | All-category browser sweep; calendar interaction checks |
| AV03–AV04 | Split, overnight, unspecified and 24-hour hours; future-effective schedules; templates, explicit target copy and override preservation | Interval/future/copy unit cases; persistent hours browser journey |
| AV05–AV08 | Dated closures, resource schedules, breaks/absence blocks, required joint resources and owner links | Exact duration, hidden-room, future roster and recurrence tests; keyboard slot proposal |
| AV09–AV10 | Named asset timeline, actual overdue custody, unknown source, maintenance draft/removal and Work resolution | Same-record return/reassignment/draft-resume browser journey |
| AV11 | Dated sessions, separate participant pools and exclusive staff/room anchors, capacity review and offering/Work links | 12 total /7 reserved /2 held /3 remaining; empty-attendance anchor test |
| AV12–AV13 | Linked incoming/processing/outgoing, drop-off vs transport, greeter/driver/private/shared distinctions and field coverage | Linked-role, transport and method-specific unit cases; registered view sweep |
| AV14–AV16 | Hold/fee inspector, source-owned expiry acknowledgement, typed capacity changes and scoped new-intake pause/resume | Capacity/expiry/fee tests; Offerings fee-policy and Work handoffs |
| AV17–AV19 | Bounded recurrence/exclusions, this/future block changes, named conflicts, internal feasibility test and local holds | Series, queue, production due, pool peak, joint-resource and unknown-source tests |
| AV20–AV21 | Weekly-hours CSV validation/export, reviewed copy to explicit compatible targets, search and resource filters | Roundtrip/target tests; filtered views retain underlying constraints |
| AV22–AV24 | Local history with effective date and before/after, stable pending operations, revisions, storage recovery, scoped drafts/review/apply/discard | Unknown-operation reload/reconcile, denied storage, dirty-close and cross-tab browser checks |

FE01–FE30 are represented by the shared source/model contracts and these merchant journeys. The 128/193 sweep verifies actual rendered profile/editor/model choices and rules, then explicitly enables each eligible candidate. It is distinct from the behavioural tests for individual merchant decisions; it does not certify every possible future policy combination or a production integration.

## Layout correction from the user screenshots

The calendar must receive the working area after the shell; fitting the outer page alone is insufficient. Controls now sit in the calendar column. The inspector spans the full schedule height. Short desktop viewports use compact heading/context/status/control spacing, shorter footer labels and smaller surrounding cards. Asset views omit the irrelevant service-duration strip. A desktop side editor reserves its own column and retains modal focus instead of covering or dimming the timeline. Expanded settings still have contained scrolling.

The layout verification checks 1920×1080,1672×941,1440×900,1280×720 and1280×633. The last uses a1.5 pixel scale to reproduce the available app area shown by the user. Assertions inspect the schedule content itself: seven weekday rows, all four asset rows, all seven timeline columns, the complete default calendar time range, inspector actions and footer. It also checks that a maintenance editor covers no calendar content and leaves the affected Work links visible.

The default timed view is09:00–17:00; actual earlier/later commitments expand that display range. Display hours do not redefine opening hours or truncate service duration. Exceptional longer ranges and larger datasets retain contained scrolling and an agenda alternative.

## Verification artifacts

- browser-verification.json: all128 specialties,193 eligible profile/model bindings,18 editor variants, same-record merchant journeys and network audit.
- interaction-verification.json: keyboard/dirty-close, guarded moves, viewer access, dated sessions, source states, concurrent tab and storage failure checks; viewport action/footer bounds.
- layout-verification.json: the schedule-area assertions and short-viewport screenshots.
- reference-code-assessment.json: hashes and decisions for the three supplied code references. No bundle was copied or new calendar dependency installed.
- verification.json: final command results, scope and artifact hashes.

Unit validation includes31 Availability tests,19 Offerings tests and7 Work tests. Focused type and lint checks cover Availability and its changed shared frontend dependencies. A complete production build, live provider test or full WCAG certification is not claimed.

## Boundaries

AvailabilitySource is local browser state with bounded sample coverage and revisioned operations. Source freshness, roles, provider ownership, failures, fee evidence and confirmation are simulations. Existing bookings retain accepted terms. Unknown is never converted to free capacity or a generic merchant approval task.

Production APIs, Supabase, authentication, actual payments, Google Calendar, ERP connections, discovery and onboarding are outside this frontend delivery. Production holiday/working-day policy, external resource identity and real synchronization must come from the relevant declared source rather than be invented by this UI. Default custom/enquiry activities remain request-only where their Offering requires agreement.
