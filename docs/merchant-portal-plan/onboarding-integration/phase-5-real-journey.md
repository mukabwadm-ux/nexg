# Phase 5 real journey and onboarding demo

Date: 2 November 2026, Africa/Nairobi. Status: local implementation and focused verification complete; configured-runtime acceptance remains open. Active implementation remains Desktop MERCHANT WORKSPACE. Derrick NexG guides the existing platform contracts and is not edited. Both checkouts share the NEXG repository. Production changes and whole-service startup are outside this increment. See [Phase 5 acceptance](phase-5-acceptance.md) and the [dated handoff](../../handoff/sessions/2026-11-02-onboarding-real-journey.md).

Current update, 2 November 2026: code now defaults to connected registration and inline email OTP, with explicit `false` environment values retained for rollback. No deployment environment values were changed. Auth/PostgREST and production acceptance remain prerequisites before deploying this default.

The user authorized saved backend records through actual merchant Home, with accurate tasks and approval. Demo is retained but activated only from onboarding, never by a portal mode switch. Demo remains a sample-only route; its exit returns to onboarding. Neither demo input nor its URL grants real account access. Existing non-anonymous Auth, owner permissions, revision checks and separate publication/activation remain mandatory.

At the time of this check, the existing Next endpoint on port 3000 responded. Browser inspection of `/merchants/register` showed "Real registration is temporarily unavailable" and the demo entry because connected registration was feature-disabled. No service was started. Actual configured Auth/PostgREST and deployment acceptance remain outstanding; the endpoint is not offline. Continue with Phase 6 reviewer UI against the existing revisioned application contracts without treating Phase 5 as completion of the whole merchant journey.

Local evidence covers [persisted handler/source/rendered Home behavior](phase-5-persisted-journey-evidence.md), the [managed shell](implementation/phase-5-shell-verification.md), [onboarding entry browser checks](implementation/phase-5-entry-browser-verification.json) and [rejected-decision recovery](phase-5-decision-recovery-evidence.md). The acceptance record distinguishes fixture checks from the actual feature-disabled route observation and lists the final covered commands.

## Source and operation decisions

| Boundary | Owner and implementation decision |
| --- | --- |
| Entry and submit | Existing short form and application RPCs; confirmed submit redirects to actual `/merchant`. Existing sign-in must preserve a safe onboarding return path. |
| Actual Home | Load current application and private payout with verified owner/session before bounded section queries. Use saved facts, current review/revision/access and independent publication. No sample fallback. |
| Catalogue | Existing catalogue_item has no specialty/activity link. Report saved offerings without assigning them to a selected specialty or inventing readiness. |
| Locations | Existing merchant_branch; exclude deleted records, preserve closed/paused state and avoid order-joined operational views. |
| Hours | Existing merchant_hours may have multiple branch/service windows per weekday, overnight and 24:00. Report saved opening windows; do not claim bookable schedules or open-now. |
| Documents | Existing current requirement/side versions with review and expiry. Uploaded is not verified, and record counts do not prove all requirements are met. |
| Payout | Existing private declaration RPC, no legacy broad account reads. Declared remains distinct from finance verified. |
| Shell | Existing shared WorkspaceFrame for managed real merchants; server controls nav/access and locked panels. Legacy existing merchants retain their shell. No operational prefetch under a lock. |
| Demo | Activation link/button on onboarding only. Explicit existing sample route and label. No portal activation/toggle; optional exit back to onboarding carries no IDs/PI. Never import a real source loader into sample pages. |
| Source failure | Application/access errors restrict the page with recovery. Bounded per-section failures show unavailable, not empty or completed. |

## Plan coverage

| Section | Commitment |
| --- | --- |
| 1 Objective | Real short-entry → saved application → actual Home, with separate onboarding-only demo. |
| 2 Scope | Saved-owner loader/projector, real shell, entry/demo navigation and submission/session return behavior. |
| 3 Dependencies | Phase 4 contracts/RPC/access, existing owners, shared Home/Frame and real configured Auth. |
| 4 Boundaries | No duplicate records/login/booking engine; no sample data in real source adapter. |
| 5 Existing contracts | Application load/save/submit, owner RLS, catalogue/branches/hours/docs/private payout and session access. |
| 6 New contracts | Typed saved-Home source/projection and bounded section status; validated onboarding/demo route links. |
| 7 Entities | None new. Reuse existing owner entities and application revision. |
| 8 Database | No schema change planned; add one only if owner access cannot be represented safely and document discovery first. |
| 9 APIs | Existing authenticated application API; no new public real-record endpoint. |
| 10 Commands | Existing writes; no writes on mode activation/read-only Home load. |
| 11 Events | No new event consumer. Existing SDK/session and server review invalidation retained. |
| 12 States | Review/access/setup/publication/accepting work separate; unavailable is explicit. |
| 13 Capabilities | Server-provided nav, same underlying owner action permissions; demo grants none. |
| 14 Authorization | Verified Auth and application-owner/session gate before parallel owned section reads. |
| 15 Offline | Keep unconfirmed edits unsaved; no cached real data or sample fallback on failure. |
| 16 Sync | Serialized saves, revision conflict/recovery, source reload after owner writes, actor-keyed state. |
| 17 Hardware | None. |
| 18 Integrations | Existing booking/payout/document owners only; no new active ERP or email OTP. |
| 19 UI | Reuse real shared Home/frame; labelled demo entry on registration only. |
| 20 Security | No URL PI or mode-based permission, no cross-origin redirect, private/no-store, no fetched operational data behind blur. |
| 21 Observability | Existing request/operation/revision identities; safe per-section failure states and no sensitive logs. |
| 22 Tests | Owned query filters/bounds/errors, saved projection truth, submission return/reload, demo isolation/activation location and shell access. |
| 23 CI | Focused changed-code checks once per covered revision; reuse unchanged Phase 4 evidence. |
| 24 Migration | Existing merchants stay legacy; new managed source path uses Phase 4 gate. No reset or automatic live cutover. |
| 25 Rollback | Disable new connected entry; preserve existing saved records, demo and prior compatible reader. |
| 26 Docs | Source map, checks/limits, status/changelog/handoff. |
| 27 Deliverables | Source-backed actual Home wiring, demo retained at entry, local acceptance and explicit configured-runtime boundary. |
| 28 Acceptance | Confirmed submission opens real Home; stored task facts/review survive reload; source errors never become sample data; demo starts only from onboarding. |
| 29 Failures | Missing backend/session, partial section failure, stale revision, expired document, ambiguous catalogue activity, logout during read. |
| 30 Risks | Existing owner records lack unified activity links; show truthful saved facts instead of fabricated completion. Actual configured runtime acceptance remains required. |
| 31 ADR | Route-separated entry demo and owner-source projection documented here. |
| 32 Exit | Changed-code local checks pass and source/runtime limitations recorded; no production acceptance inferred. |
| 33 Decisions | User confirmed Phase 5 and demo activation only from onboarding. Routine UI/source choices are resolved within that scope. |
| 34 Subphases | Saved source/projection; managed shell; entry/submit/demo wiring; focused verification and handoff. |
