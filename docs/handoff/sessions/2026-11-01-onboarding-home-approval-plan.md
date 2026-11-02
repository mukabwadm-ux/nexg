# Onboarding, Home and approval planning handoff

Date: 1 November 2026, Africa/Nairobi. Status: plan prepared for review; implementation not started.

## User direction

- Work in `C:\Users\limta\Desktop\MERCHANT WORKSPACE`.
- Review and plan the standalone onboarding form against current merchant definitions and the supplied setup Home screenshots before building.
- Confirmed submission goes directly to setup Home while admin approval is pending.
- The rest of the portal is blurred/locked with a waiting-for-approval explanation.
- Keep the form as simple as possible. Most information can be skipped and added through Home setup tasks.

## Deliverables

[Plan and build order](../../merchant-portal-plan/onboarding-integration/README.md), [audit evidence](../../merchant-portal-plan/onboarding-integration/evidence.md) and planning-artifact verification in that directory. The parent portal-plan README links the plan. Changelog and deliverables record planning only.

## Findings that affect implementation

The prototype has all 21 category names and 128 specialty labels, but independent IDs and category-level semantics. Reuse the current taxonomy, reconciled 323-question design and compiled booking configuration rather than duplicating them. Current SQL still has universal branch-zone/prep-time/five-item readiness rules, and its submit contract requires more information than the requested short entry. Preview Home has sample 3/7 completion and preview-only review states; production shell/navigation also differs. Existing admin go-live publishes the merchant and cannot act as approval/unlock without changing the contract.

Pending merchants need scoped setup permissions from Home while operational routes, data and actions remain restricted. Safe blurred placeholders must not contain hidden real operational data. Approval, readiness, publication and accepting work stay separate. Preserve all existing frontend modules and their explicit sample/source boundaries.

## Next work

Review the plan, settle P0's minimal entry/review/activation policies and versioned contracts, then proceed through P1 shared configuration, P2 short form, P3 labelled form-to-Home demonstrator, P4 backend/enforcement, P5 production connection, P6 admin decisions, P7 activation/source integration and P8 acceptance. Do not run the root development task as a shortcut for an isolated form preview.

No application code, migrations, approvals, provider calls or service starts were performed. No runtime or live database verification is claimed. Existing unrelated workspace changes were left in place. The broad platform master/contracts directories referenced by installed skills are absent in this checkout, so master-spec validation remains unclaimed.

Skills applied: using-superpowers, unslop, nexg-contracts, nexg-phase-loop, domain-modeling, strategic-planning and principle-prove-it-works. Three read-only audits cross-checked form fit, Home predicates and backend/admin boundaries. Planning checks passed 49 local references, 34 phase-plan sections, nine build phases and the user-direction checks; no runtime acceptance is claimed.
