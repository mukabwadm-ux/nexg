# Phase 3: shared merchant Home connection

Date: 2 November 2026, Africa/Nairobi. User authorized connecting the short registration to the existing Home, retaining its editors and approval wait. Email OTP and real backend/admin persistence remain deferred.

## Implementation scope

- Extract framework-independent presentation from the actual `HomeSetup` and `MerchantLivePreviewShell`, retaining their existing Next adapters and behavior. Registration must consume those same shared views and CSS, not a separately drawn Home.
- Project scoped setup rows from actual registration/captured details and the existing merchant JSON. Count completed applicable required rows from that list. Do not inherit sample 3/7, assume a second team member, mandate five catalogue items, require a test order for an enquiry-only business, or turn uploaded/entered evidence into verified completion.
- Keep the real shared workspace frame around Home and deferred setup editors. Registered details and task inputs remain in one in-memory capture while moving between them. Basic registration stays a separate six-group page.
- Use existing shared UI tokens, Tailwind preset, local Manrope font and icon/navigation definitions in the isolated Vite preview. Do not start the whole portal, backend or admin to render them.
- Keep operational sections safely locked and status/correction/help reachable. No actual operational records are fetched behind a blur. No frontend preview/authentication flag grants server access.

## Acceptance and evidence

Run each new/affected check once on its covered code revision. Reuse unchanged Phase 1/2 results. Verify a real registration appears in the shared Home view, its required count changes when applicable answers/hours change, its editor remains inside the actual frame, pending evidence/payout are editable but not verified, phone navigation preserves the lock, and a request/enquiry profile avoids irrelevant prep/stock/test-order prerequisites. Existing Next wrappers must keep their routes/drawers/sample behavior.

The main plan's 34-section coverage applies. This phase refactors UI presentation and adds a pure read projection, without database/API/event/provider/authorization changes. Existing sources remain authoritative; capture stays in memory. Rollback restores the previous adapters/views without changing server records. Production routing/persistence is Phase 5 after Phase 4 enforcement, so this phase does not claim actual authenticated `/merchant` access or an admin decision.
