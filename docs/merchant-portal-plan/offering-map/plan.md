# All-category offering information mapping

Date: 31 October 2026. Phase: PLANNING. Deliverable: reviewable design mapping, not application implementation. This proportional plan covers a documentation and reference-data assignment.

1. Objective: define actual product/service-kind specifications across every current merchant category/subcategory and carry them through every affected merchant/customer screen and existing selected workflow.
2. Scope: all 21 categories and 128 current subcategories; multiple offering types per merchant; variants, measurements, conditions, source ownership and visibility.
3. Dependencies: live taxonomy source, onboarding audit, effective question/profile/domain/workflow registries and merchant review. Referenced master platform and execution-law documents are absent from this checkout; no claim of master-spec conformity is made.
4. Architectural boundaries: the mapping is a design input. Preserve existing catalog, inventory, commerce, workflow, platform and fulfilment ownership; no cross-domain writers or runtime activation.
5. Existing contracts affected: reference the current merchant taxonomy and effective booking contracts; do not edit their identities or effective behavior.
6. New contracts required: proposed template and field definitions for review. These are not approved runtime contracts.
7. Entities affected: conceptual offering, variant, measurement chart, resource reference, location projection and customer intake.
8. Database changes: none in this assignment. Future persistence must preserve type, scope, units and visibility.
9. APIs affected: none changed. Future reads need explicit public projections of reviewed fields.
10. Commands affected: none changed. Future save/publish/import operations need approved owner commands.
11. Events affected: none changed. Future content/publication changes use existing owner conventions.
12. State machines affected: none changed; retain effective booking and order distinctions.
13. Capability changes: none granted. The user approved 21 exact profile additions for design inclusion; approvals.json records that decision and generated approved-profile-additions.json composes it with the preserved baseline. New additions beyond that list still require their own review.
14. Authorization: business/location scope and server-side field visibility are future implementation requirements. Customer intake is private.
15. Offline behavior: no offline mutations. Saved planning files do not establish a live capability.
16. Synchronization: record source ownership and imported field mappings; future integrations cannot overwrite authoritative facts indiscriminately.
17. Hardware: none needed; the output is a design package.
18. Integrations: none connected. Preserve references to existing authoritative catalogs, prices, stock and availability.
19. UI impact: compose all eight merchant screens and eleven customer surfaces for every current category and subcategory, using actual product-kind fields, typed units/options and the existing selected workflow. Generate explicit category/specialty/template bindings and update shared screen specifications.
20. Security impact: classify public, private intake and internal fields. No real customer, credential or clinical data is used.
21. Observability: coverage, reference, source-drift and requirement-quality evidence for the design package.
22. Verification: compare all identities directly with the taxonomy and audit; resolve every field/template/profile/model reference; check units, condition text, display routes, privacy and template reuse; inspect dress, rental and regulated-service cases.
23. CI: supply a deterministic local verifier suitable for later CI adoption. Do not alter CI configuration in this assignment.
24. Migration: define future import/backfill/review requirements; no inferred product specifications or new IDs for existing accepted work.
25. Rollback: reference files can be revised or removed without runtime effect. Future rollout needs its own migration/rollback plan.
26. Documentation: generate readable category pages, a template field catalogue, a coverage table, review decisions and machine-readable resolved records from one authoring source.
27. Deliverables: complete current-subcategory mapping, reusable field definitions, specific offering templates, customer display rules, validation evidence and open review decisions.
28. Acceptance: exactly cover the live baseline once; every mapped offering resolves to typed fields, scoped capture requirements, public/private routes, a customer action and compatibility evidence.
29. Failure modes: missing specialty, generic category standing in for specifications, duplicate meaning, impossible variants, wrong units, private data displayed, or unsupported booking promised.
30. Risks: sample offering lists are curated proposals and cannot enumerate every future SKU. Keep a reviewed extension route and distinguish mechanical validation from merchant/customer validation.
31. ADRs: no implementation ADR is created here. Future persistence, policy and publication changes require their applicable review.
32. Exit: mapping and its deterministic checks are delivered with all unresolved business/template decisions visible; runtime remains unimplemented.
33. Resolved decisions: the user requested full-category coverage and item-specific specifications through to customer presentation, including dress measurements by size. The user approved the 21 additional offering/model routes and chose screen designs/specifications rather than working application edits. The user then clarified that all 21 categories and their screens/workflows must be updated, and Fashion is an example of a product-kind system rather than a scope boundary. Kenya/Africa/Nairobi and the reconciled booking baseline are preserved.
34. Sub-phases: inventory and source comparison; field/template authoring; explicit subcategory bindings; readable generation; coverage and semantic verification; handoff. These are steps within this design assignment, not claims of accepted implementation phases.
