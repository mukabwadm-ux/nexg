# Phase 5 managed shell checks

Date: 2 November 2026. Active source: Desktop MERCHANT WORKSPACE. No service, backend or admin runtime was started.

The managed real shell reuses `WorkspaceFrame`, workspace navigation icons, CSS tokens and the existing Radix mobile navigation. Its authenticated server parent supplies destinations, locks, approval wording and account controls. Pending destinations are buttons. Selecting one replaces the child tree with generic empty blurred tiles and an approval panel. Available destinations use actual `/merchant` routes with prefetch disabled. Shell href validation rejects external, encoded, traversal, query and fragment destinations. The real shell contains no demo activation control or activation/readiness switch. Legacy `MerchantShell` is unchanged by this work.

The sample shell labels itself `Demo · sample data`. Its native `Exit demo` anchor returns to `/merchants/register` without IDs or captured input. Entry activation belongs to onboarding and is outside this shell change.

The server parent may supply `setupDestinations` for editors the current owner is authorized to use before approval. Only an exact validated pathname match renders that editor. The sidebar entry remains a locked button and still opens its generic lock panel when selected. The exception does not cover nested routes or other operational sections, and each editor retains its own server access check.

## Changed source

- `apps/web/components/merchant/workspace/merchant-workspace-shell.tsx`: server-owned presentation interface and local lock panel.
- `apps/web/components/merchant/workspace/workspace-href.ts`: authenticated merchant route validation.
- `apps/web/components/merchant/workspace/mobile-navigation.tsx`: close the existing mobile drawer when a managed locked navigation button is selected.
- `apps/web/components/merchant/workspace/workspace.module.css`: existing-token lock panel and navigation styles.
- `apps/web/components/merchant/live-preview-shell.tsx`: explicit demo label and onboarding exit.

## Covered checks

- From `apps/web`, `pnpm exec vitest run components/merchant/workspace/merchant-workspace-shell.test.tsx --config vitest.phase5-shell.config.ts`: 20 passed. Tests render actual shells and check saved Home versus locked destinations, approved actual links, external-link rejection and sample-only demo exit. The initial runtime pass caught no defects. Two test-only ESLint children-prop violations were corrected and the changed tests passed again.
- From `apps/web`, scoped ESLint for the changed TS/TSX sources, test and config with `--max-warnings 0`: passed.
- From `apps/web`, `pnpm exec tsc --noEmit --jsx react-jsx --esModuleInterop --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --lib dom,es2022 next-env.d.ts components/merchant/workspace/merchant-workspace-shell.tsx components/merchant/workspace/workspace-href.ts`: passed.
- From the workspace root, `node scripts/check-phase5-workspace-shell.cjs`: three passed browser cases. The script bundles the actual managed shell, shared frame and Radix mobile drawer, supplies an explicit in-memory Next pathname/link fixture, and embeds the existing local Manrope font. It starts no server. Pending navigation removed the Home child tree, approved navigation used real routes without prefetch, and selecting a mobile locked section closed the drawer. Both desktop and 390px mobile approval panels were visually inspected. No browser runtime errors or network requests occurred. The fixture font correction and explicit help-link decoration were verified by rerunning the affected browser checks.

[Browser results](phase-5-shell-browser-verification.json), [desktop panel](phase-5-shell-pending-desktop.png), [mobile panel](phase-5-shell-pending-mobile.png).

These fixture checks prove shell behavior. They do not establish real Auth, backend persistence, RLS, publication or deployment acceptance. Existing Phase 4 checks were not repeated. The `21st` CLI was unavailable for both the skill's source search and review command. No package was installed; inspected project components and design records supplied the implementation direction.

## Setup editor integration correction

Root review found that the direct-route lock also hid permitted pending-owner setup editors. `setupDestinations?: readonly string[]`, defaulting to an empty list, now separates exact server-authorized editor entry from locked sidebar selection. The parent supplies `/merchant/menu`, `/merchant/stores`, `/merchant/hours` and `/merchant/documents` only when current setup access permits them. No browser state grants that access.

After this change, only the affected managed-shell test group, its new browser case, scoped shell typecheck and changed-file lint were selected. The managed group passed 8 tests; the 16 unchanged demo/route tests were skipped and retain their earlier pass. Scoped typecheck and lint passed. The new browser case passed with no runtime errors or requests. It opened the offering editor while the sidebar remained locked, selected the locked sidebar panel, returned Home, denied a nested route and operational Work route, and reopened the authorized editor. Earlier unaffected browser cases retain their recorded evidence. [Setup editor screenshot](phase-5-shell-pending-setup-editor.png).
