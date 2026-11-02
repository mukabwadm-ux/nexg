# Phase 5 rejected application recovery

Date: 2 November 2026. Scope: Desktop MERCHANT WORKSPACE only.

The existing rejected application result denies both setup and operations. Sending that result to sign-in caused a returning authenticated merchant to cycle through sign-in and `/merchant`. `requireMerchant` now sends it to `/merchants/decision` while continuing to deny all workspace capabilities.

The dynamic decision page verifies the existing non-anonymous Auth user, resolves the current merchant through `fn_partner_home`, and calls only `rpc_merchant_workspace_access` through the existing access loader. A rejected result must carry a current session expiry before the page displays "Application not approved". Restored setup or operations returns to guarded `/merchant`. Missing identity goes to sign-in. Missing workspace, blocked authority, expired rejection, malformed data and RPC failures render restricted or unavailable recovery without redirecting to Home.

The page contains generic status, public `/help`, a full refresh of the same route, and the existing actor-safe SignOut. It does not render merchant IDs, company names, review reasons, application fields, payout details or documents. It does not add a capability, application read, write, SQL change or browser background request. The middleware matcher and refresh branch now cover `/merchants/decision` and descendants with the existing SDK cookie propagation and private/no-store response headers. QR and existing auth branches are unchanged.

Commands run from `C:\Users\limta\Desktop\MERCHANT WORKSPACE`:

```powershell
pnpm --dir apps/web exec vitest run --config vitest.phase5-journey.config.ts lib/partner.phase4.test.ts 'app/(customer)/merchants/decision/page.test.tsx' middleware.phase5-decision.test.ts
pnpm --dir apps/web exec tsc --noEmit -p tsconfig.phase5-decision.json
```

Results: 3 test files passed, 37 tests passed. These include 12 actual `requireMerchant` guard tests, 22 server-rendered decision page tests and 3 tests of the changed middleware route. The route tests compile the configured Next matcher, exercise SDK cookie propagation on the decision route and assert private/no-store headers. TypeScript exited 0 for the covered decision, guard and middleware files and their imported dependencies.

The tests use controlled Auth and RPC responses. They verify the local redirect and rendering paths, including blocked and failed sources, without starting services or using configured live Auth. Configured runtime acceptance and production behavior have not been claimed.
