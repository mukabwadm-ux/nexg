# Availability frontend execution record

31 October 2026. Status COMPLETE — frontend scope. Approved design: ../README.md and three concept images.

1. Objective: implement the complete Availability frontend using local sample sources.
2. Scope: all128 existing profiles and registered editor/model branches, AV01–AV24.
3. Dependencies: current MerchantLivePreviewShell, OfferingsSource, WorkSource and installed React/Radix/Lucide controls.
4. Boundaries: frontend only, onboarding last.
5. Existing contracts: preserve OfferingsSource and WorkSource signatures; additive contextual preview adapters.
6. New contracts: local AvailabilitySource, versioned scoped snapshot/draft/operation types.
7. Entities: local preview schedules, resources, holds and impact proposals.
8. Database changes: None, frontend only.
9. APIs: None, local source methods only.
10. Commands: local preview apply/reconcile/reset.
11. Events: local browser revision refresh; no application outbox.
12. States: full planned catalogue plus persistent draft and unknown-operation recovery.
13. Capabilities: selected configured offering/method drives registered views; candidates never auto-enable.
14. Authorization: manager/viewer simulation, never production permission claims.
15. Offline: retain local drafts; restrict simulated source writes.
16. Synchronization: local revision conflicts and source-result simulation.
17. Hardware: None.
18. Integrations: no live connections. Source ownership is a visible simulation.
19. UI: existing preview route/shell and new adaptive module; narrow contextual Work/Offerings links.
20. Security: no secrets, network writes, backend or auth changes; validate local saved state/imports.
21. Observability: local history and reproducible verification artifacts.
22. Testing: behaviour tests plus browser flows and all-profile render sweep.
23. CI: focused lint/type checks; report unrelated workspace failures separately.
24. Migration: version local storage; malformed-state recovery only in owned namespace.
25. Rollback: remove Availability route/module and additive shell/source bridge; preserve other agents' files.
26. Documentation: module README, verification output, dated handoff, status/changelog additions.
27. Deliverables: working frontend, complete local flows, desktop/mobile screenshots and evidence.
28. Acceptance: compare AV01–AV24 and FE01–FE30 to observed results.
29. Failures: validation, conflict, stale/unknown/external, storage, revision, retry, partial import, unsupported setup.
30. Risks: shared-workspace concurrent edits; use additive changes and read before editing.
31. ADRs: local simulation is already approved design, no backend architecture changes.
32. Exit: all acceptance requirements implemented and verified, material limitations declared.
33. Resolved: user authorizes build, frontend only, all128, onboarding last.
34. Stages: context/source, renderers, forms, cross-screen local flows, recovery/responsiveness, verification.

21st CLI/MCP is not installed in this environment; init could not run. Use the approved images and inspected project tokens/components without installing another UI system. Master execution-law files and AGENTS.md are absent from this workspace; do not claim validation against unavailable documents.

Latest user correction: all Availability contexts must occupy one viewport, matching the supplied concepts. Use a bounded shell with contained schedule/inspector scrolling, persistent toolbars/actions, broader context-aware calendar views, click-to-propose controls, shared semantic colours/icons and source-validated changes. Reviewed the three supplied ReUI calendar snippets as design/interaction references. Their missing utility modules, Base UI/date-fns imports and Tailwind4 syntax are not installed or copied.

Final verification:57 unit tests, focused types/lint, all128 profiles/193 bindings/18 editor variants,7 interaction journeys and17 layout cases passed. No network writes were observed. The user’s short-viewport correction is covered by explicit content-area assertions; outer-page fit alone is not treated as sufficient. See acceptance.md and verification.json.
