# Money frontend handoff — 31 October 2026

The adaptive frontend is available at `http://localhost:3132/merchant-live-preview/money` while the isolated development server is running. The existing preview sidebar also links to Money. Use **Sample specialty** to choose one of 128 current specialties, explicitly add a supported alternative activity, and simulate source/role/capability states.

The same shared screen chooses its vocabulary and useful views from the actual local Offering/schema. It includes the three designed sales, rental-security and customer-invoice examples, contextual workflow facts, search/filter, two sample reporting periods, source explanations, local CSV, same-reference Work and Offerings returns, and local refund/reconciliation examples. A reservation's advance, separate booking fee, conditional cancellation/no-show charge and guarantee are independent. Missing refund terms do not imply a non-refundable policy.

The Money source is local-only sample data and simulated outcomes. Real ERP/payment/payout integrations, merchant-safe owner contracts and authorization, the operational Work join, arbitrary report periods and onboarding remain future work. Do not use sample values to infer actual merchant financial state. Full design acceptance and production readiness are not claimed.

Implementation and extension instructions: `apps/web/components/merchant/money/README.md`. Detailed commands, results, screen captures, gaps and observed fixes: `docs/merchant-portal-plan/money-concept/implementation/acceptance.md`.

Skills used for this implementation: `21st-ui-build`, `nexg-phase-loop`, `principle-prove-it-works`, and `principle-test-behavior-not-implementation`. The 21st CLI was unavailable, so the implementation used the project's existing shell, primitives and approved concepts. The master-specification files referenced by the phase-loop skill were not present in this checkout.
