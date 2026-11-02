# Promotions frontend sample plan

Date: 31 October 2026. The user clarified that this work is **frontend only, with sample states**. Campaigns and History are the only page tabs; Featured placement is a campaign type with a customer-app preview. The earlier live-connection work in this session was removed before delivery.

1. **Objective:** implement an interactive, category-adaptive Promotions sample in the existing merchant preview.
2. **Scope:** campaign list, filters, detail, creation/review, sample lifecycle, History and customer preview for the 21 categories and 128 specialties.
3. **Dependencies:** the existing sample Offerings registry, schemas, catalogue, discount calculation and merchant preview shell.
4. **Boundaries:** all promotion state is local sample data. Do not connect live payment, checkout, booking, placement or database services.
5. **Existing contracts:** respect the existing Offering models, schema selection, sample price/discount calculation, local catalogue and owner indicators.
6. **New contracts:** a frontend sample campaign and its source interface. It is not a production contract.
7. **Entities:** sample campaigns refer to existing sample offerings and keep revisioned history and public preview snapshots.
8. **Database:** none; no database migration is part of this frontend task.
9. **APIs:** none; the sample must not contact production campaign or booking APIs.
10. **Commands:** local draft, review, activate, pause, resume, end, duplicate and sample placement request/withdrawal.
11. **Events:** browser-only notification when shared sample Offering data changes.
12. **States:** draft, scheduled, active, paused, ended, cancelled, attention and sample placement awaiting confirmation.
13. **Capabilities:** chosen offering type and known price determine sample actions; unknown quotes do not imply a discounted final price.
14. **Authorization:** sample controls grant no production access.
15. **Offline:** sample data is saved in this browser and is never presented as live publication.
16. **Synchronization:** check campaign and offering revisions and avoid overwriting changed or externally owned prices. Browser locks do not make unrelated editor operations fully transactional.
17. **Hardware:** none; browser UI only.
18. **Integrations:** reuse the Offering sample locally; no live integration.
19. **UI:** use the black, cream and gold shell, responsive layout, two tabs, contextual fields, clear sample state and customer preview.
20. **Security/privacy:** preview explicitly customer-facing fields and compatible options, not arbitrary customer or operational data.
21. **Observability:** errors and unavailable local state are visible; do not invent live campaign performance.
22. **Verification:** exercise profile/schema resolution, discount calculations, lifecycle, conflicts, corruption recovery and desktop/mobile browser journeys.
23. **CI:** run focused tests, typecheck, lint and the applicable UI review; no CI changes.
24. **Migration:** none; sample metadata is kept inside the existing browser catalogue.
25. **Rollback:** remove only this task's preview components/route and navigation additions, preserving other local work.
26. **Documentation:** keep this plan, the module README, change log and session handoff current.
27. **Deliverables:** working preview route, adaptive sample workflows, customer preview and verification evidence.
28. **Acceptance:** all profiles and compatible editor schemas resolve; sample actions persist locally and previews use actual selected sample data; UI is usable at desktop and phone sizes.
29. **Failure modes:** corrupted storage, stale edits, unknown price, unavailable offering, paused availability and unsupported external owner.
30. **Risks:** browser storage is not a shared backend, and the existing discount model does not support every proposed condition; show the actual sample capability.
31. **ADRs:** none; no production architecture or database ownership changes.
32. **Exit:** verify frontend sample criteria and report its sample scope accurately.
33. **Resolved decisions:** frontend only with sample states; Campaigns and History tabs; Featured placement in Campaigns; app preview retained.
34. **Sub-phases:** adapt the preview to the existing registry and offering schemas; implement sample workflows; exercise desktop/mobile and recovery; record verification.
