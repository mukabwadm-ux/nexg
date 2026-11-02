# Money frontend implementation plan

Status: VERIFIED FRONTEND SAMPLE · 31 October 2026. This is a development-only sample workspace. The accompanying Money concept, descriptors, 128-profile catalogue, reservation policy and acceptance cases remain the detailed product plan. The master specification and execution-law files referenced by the NEXG skill are not present in this checkout; validation against those files is therefore not claimed. Full production/source acceptance remains open.

1. **Objective:** build a responsive, interactive Money screen using the approved concepts and existing merchant workspace.
2. **Scope:** frontend, locally persisted sample data and simulated actions. No onboarding, live payments, finance integration, database or Supabase.
3. **Dependencies:** shared workspace shell; current Offerings profiles, schemas and local source; Money descriptors and workflow plan.
4. **Boundaries:** a sample source is isolated from production; display never establishes a real finance owner, grant or entitlement.
5. **Existing contracts:** preserve Offerings, Work, availability, existing finance metric meaning and their routes.
6. **New contracts:** typed sample Money records, source state and local action outcomes only; future owner contracts remain design proposals.
7. **Entities:** sample transactions, invoices, security obligations, settlements, policies, operations and scoped drafts.
8. **Database:** none; explicitly local browser storage only.
9. **APIs:** none; local source interface and links to existing preview routes.
10. **Commands:** simulated review, submission and reconciliation are labeled and scoped; no real financial mutation.
11. **Events:** local revision/history and browser refresh signals only; no integration events.
12. **States:** distinguish confirmed, pending, unknown and failed results; unknown blocks conflicting repeat actions on the same amount.
13. **Capabilities:** select views from actual offering, sample source, policies and simulated grant; categories alone grant nothing.
14. **Authorization:** role controls are a simulation, not real access enforcement.
15. **Offline:** unavailable and unknown states are explicit; no silent money movement or zero fallback.
16. **Synchronization:** local data is scoped by specialty, location and offering; stale review is rejected.
17. **Hardware:** none; ordinary responsive browser UI.
18. **Integrations:** none. Native, ERP and payment ownership are explained as future dependencies.
19. **UI:** shared Money tab, contextual statistics, adaptive table and detail, review, state and empty/error views.
20. **Security:** no secrets or live account data; customer security is not merchant sales or payouts.
21. **Observability:** local sample history and visible operation result; no claims of live audit logging.
22. **Tests:** behavioral tests for configuration, arithmetic, policy and operation states; browser interaction and viewport checks.
23. **CI:** run scoped lint, typecheck and tests available in the workspace, recording failures and omissions.
24. **Migration:** none; isolated local preview namespace.
25. **Rollback:** remove Money preview files and its isolated local data; do not alter other work.
26. **Documentation:** add observed verification and handoff; do not overwrite concurrent work.
27. **Deliverables:** one shared Money frontend, adaptive descriptors, example workflows, responsive styling and evidence.
28. **Acceptance:** current 128 profiles resolve registered workflows; relevant views and operations behave correctly; layouts keep working content visible.
29. **Failures:** unknown source, storage error, stale revision, missing capability and invalid configuration remain explicit.
30. **Risks:** sample behavior can resemble production; label it and do not connect live services. Shared files are edited narrowly.
31. **ADRs:** none for this isolated frontend sample; production financial owner decisions remain open.
32. **Exit:** record passed and failed checks and distinguish preview coverage from production readiness.
33. **Resolved decisions:** user chose frontend only, shared adaptive components, three existing visual directions, onboarding last, and optional reservation/security components.
34. **Sub-phases:** (a) inspect and resolve configurations, (b) implement sample models and source, (c) implement UI and handoffs, (d) verify all profiles, workflows and viewport behavior.
