# Promotions concept execution plan

Date: 31 October 2026. Scope: end-to-end screen and workflow design across all current categories, with Campaigns and History as the only page tabs. Featured placement is a campaign type in the shared list. Five selected concept images demonstrate the proposed interface, not working campaign delivery. This extension is isolated to design data, documents and raster assets, with no runtime architecture change.

1. Objective: design one adaptive Promotions destination for all 21 categories and 128 subcategories, using actual offering kinds, source-owned prices and operational models.
2. Scope: campaign directory, creation, eligible scope, benefits/placements, timing, funding/terms, customer-app preview, validation/review/publication, management, history, results and recovery; five selected raster references.
3. Dependencies: current catalogue/experience map, effective model/domain/workflow registries, shared screen contract, existing Featured baseline and active Offerings preview behavior. Referenced master specifications are unavailable in this checkout.
4. Boundaries: concept/design authoring only. No application, source account, payment, publication or live policy change.
5. Existing contracts: preserve source offering/variant IDs, price/inventory/availability owners, effective work lifecycles and canonical publication/permission requirements.
6. Proposed contracts: campaign definition/revision, eligible scope, benefit rule, funding and redemption envelope, placement request, review, delivery projection and measurement definitions. Only Featured is currently registered in the inspected effective promotion-type registry; other types are proposed extensions.
7. Entities: conceptual campaign/revision, selected offering/variant/occurrence/location references, rule/policy version, placement request, redemption/hold and result references.
8. Database: none changed. Future persistence follows actual domain ownership.
9. APIs: none changed. Future queries/commands must be registered and scoped.
10. Commands: draft/save/validate/submit/review/publish/schedule/edit/pause/resume/end/cancel/duplicate/export; future owner commands require idempotency and revision checks.
11. Events: no new runtime events. Future confirmed campaign, redemption, charge and delivery facts follow their actual owner contracts.
12. States: separate draft/publication/scheduling, review, delivery/eligibility, placement/charge and measurement freshness. Browser time does not activate a campaign.
13. Capabilities: no new grants. Capability/policy/funding availability gates each actual type, offering and scope.
14. Authorization: server-derived business/location scope, separate edit/publish/financial/reporting permissions and restricted redemption/customer details.
15. Offline: preserve drafts where permitted; never report offline publish or spend as confirmed.
16. Sync: declare authoritative campaign, price, stock, capacity and measurement sources; conflict/unknown outcomes require reconciliation.
17. Hardware: none.
18. Integrations: none connected. Existing adapters and source-owned fields remain authoritative.
19. UI: retain the black/cream/gold shell. Use Campaigns and History only, one list/type filter/common creation flow and conditional type-specific details. Preserve Preview in app and no top status totals.
20. Security/privacy: no sensitive audience inference; public creative and private transaction/redemption data stay separate; marketing-channel consent is independently required.
21. Observability: lifecycle/audit, eligibility reasons, source freshness, redemption/cost definitions and attribution coverage; no invented uplift or guaranteed ranking.
22. Verification: source-identity/field/model closure for all 128 rows, screen/flow reference closure, selected boundary and money/timing examples, five-image inspection/integrity and provenance. Inspect the revised Campaigns/History tabs, Type filter and preview return destination; preserve actual/archived context and no top status summary strip.
23. CI: deterministic design verifier supplied; no CI or runtime changes.
24. Migration: future integration reuses a single discount/rule owner; do not create a second editable price truth beside Offerings or reset existing catalogue IDs.
25. Rollback: versioned design assets only. Future application rollout requires its own migration/rollback plan.
26. Documentation: full screen spec, field/flow source, all-128 matrix, model adaptations, integration and implementation notes, prompt set and image review.
27. Deliverables: end-to-end design package and five selected images; revise Campaigns, History and the preview return link, retain service/rental examples and retire the separate Featured placements concept.
28. Acceptance: every specialty binds actual offering/model/field references, source and policy gates; all key campaign tasks/states specified; five images match the revised shell. Campaigns and History are the only page tabs, Featured is a type, and Preview in app/historical snapshots/new-draft duplication preserve truthful context.
29. Failures: stale prices, sold-out variants, lost slots, expired quotes, unsupported benefit/policy, exhausted caps, placement timeout, duplicate redemption and unavailable metrics.
30. Risks: illustrative images can imply unsupported readiness; mark sample preview, keep runtime disabled and maintain explicit proposed-contract boundaries. Image text/layout is inspected before selection.
31. ADRs: none for this concept assignment. Future campaign/rule/funding/redemption boundaries need their applicable implementation decisions.
32. Exit: coverage and design checks passed, five selected images inspected, with the three revised screens displayed, limitations recorded. No claim of live behavior.
33. Resolved user decisions: Promotions is the next screen across all categories/subcategories. The original three images were followed by removal of the top status summary strip, then a request for Featured placements, History and preview of the customer app. The latest decision removes the duplicate Featured placements tab; use Campaigns and History only and keep Featured placement as a campaign type. Design/specification review remains the authorized scope.
34. Steps: archive superseded inputs; consolidate source/navigation and type-specific detail rules; revise three images; retire the separate placement directory; regenerate JSON/Markdown and update screen/index/handoff/evidence.
