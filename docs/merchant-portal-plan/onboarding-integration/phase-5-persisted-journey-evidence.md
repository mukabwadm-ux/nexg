# Phase 5 persisted journey evidence

2 November 2026. Local focused check passed in Desktop MERCHANT WORKSPACE. No linked database, application service, or production data changed.

`apps/web/lib/merchant-real-journey.test.tsx` passes one persisted integration scenario. It calls the actual `applicationHandler` with POST `Request` objects for start, save, unchanged save, submit, and private payout declaration. Its test-only RPC adapter executes the actual `20261102000100_merchant_application.sql` functions under PostgreSQL's `authenticated` role. It then calls the actual `loadMerchantHomeSource`, saved projector, and `merchant-onboarding/src/ConnectedMerchantHome.jsx` renderer with `previewMode=false` and the loaded `savedHome`. No application, source, projection, or Home implementation is mocked.

The scenario proves these local behaviors:

- A saved change increments the application revision; an unchanged save preserves it. Submission accepts the captured basics while no catalogue, location, hours, document, or payout records exist.
- Home shows the saved business name and missing setup. Declaring eight branches creates no saved locations.
- Owner catalogue writes produce two saved offerings, with one price and one available entry. Home does not assign an activity link or infer live readiness.
- Owner branch and hours writes produce two retained locations, one closed and paused, one pin, and three opening windows across two weekdays. Deleted branches and their hours do not count. The records include separate services on one weekday, overnight hours, and a `24:00` close. Home does not claim checked bookable schedules.
- Current document sides count separately. A superseded upload does not count, uploaded remains awaiting review, and an expired verified record needs attention. Requirement completeness remains unassessed. Past document review decisions are explicit fixture facts; the test does not exercise file upload or document review RPCs.
- A private payout declaration preserves the leading zeroes in its Till number. Home labels it declared and leaves verification separate.
- The real Home host renders those saved facts. A section read failure shows unavailable while other saved sections remain visible. Foreign actors cannot load or save the application, and catalogue RLS hides its rows. A synthetic claim with no matching Auth session cannot load Home.
- An owner cannot approve. A staff user with a global merchant-operations grant can request changes and approve the current submitted revision through the actual review RPC. A stale review fails. A later owner edit withdraws operational access and shows resubmission needed. An unchanged save retains current approval.
- Approval leaves publication `applied` and accepting work false. Home displays approval with activation pending.
- Application payload, owner setup, private payout, and review state survive two closes and reopens of the file-backed PGlite database. This checks durable files across database instances within one test process.

The helper at `apps/web/lib/test-fixtures/merchant-journey-pg.ts` accepts an allowlist of RPCs, tables, columns, sorts, and limits. SQL values use parameters. Reads use PostgreSQL JSON encoding to match PostgREST date and time wire types. A queue keeps each synthetic actor's role and claims together on the single test connection. There is no parallel implementation of application or projection rules.

The noncanonical historical dependency fixture is `merchant-journey-base.sql`, adapted from the existing Phase 4 fixture. The check loads actual historical catalogue, branch, hours, document, document-side, owner-policy, and protected-column definitions from their migration files. Fixture Auth users, sessions, audit, base merchant dependencies, and reviewed document metadata remain test data. No workspace dependency was installed. The existing temporary PGlite installation supplies the SQL engine.

From `C:\Users\limta\Desktop\MERCHANT WORKSPACE\apps\web`, run:

```powershell
$env:PHASE4_PGLITE_PATH = Join-Path $env:TEMP 'nexg-phase4-pglite/node_modules/@electric-sql/pglite/dist/index.js'
pnpm exec vitest run --config vitest.phase5-journey.config.ts lib/merchant-real-journey.test.tsx
pnpm exec tsc --noEmit -p tsconfig.phase5-journey.json
```

Observed result: Vitest passed one file and one test in 16.41 seconds, with 12.27 seconds in the scenario. The focused TypeScript check exited zero. The first attempt with the shell config hit duplicate React instances from the standalone onboarding package; the journey config now deduplicates React for SSR. No broad suite or unchanged Phase 4 SQL suite was rerun.

This is local PostgreSQL, handler, loader, projection, and rendered Home evidence. It does not prove deployed Supabase Auth, cookie verification or refresh, PostgREST transport, a configured Next server, browser interaction or navigation, separate-process restart, concurrent connections, storage access, email OTP, finance verification, booking readiness, publication, or production acceptance. The HTTP authentication port supplies an already verified synthetic identity. The SQL functions still check its fixture session row and permissions. Actual configured-runtime acceptance remains required as described in the Phase 5 plan.
