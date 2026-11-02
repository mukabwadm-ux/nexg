# Phase 3 projection verification

This record reports the checks already run for `projectOnboardingHome`.
No check was rerun to create this record.

## Scope

- Projection: `packages/booking-config/src/onboarding-home.ts`.
- Public import: `@nexg/booking-config/onboarding-home`.
- Behavior tests: `packages/booking-config/test/onboarding-home.test.ts`.
- Workspace: `C:\Users\limta\Desktop\MERCHANT WORKSPACE`.

## Strict package typecheck

Working directory: `C:\Users\limta\Desktop\MERCHANT WORKSPACE\packages\booking-config`.

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Observed result: exit code `0`, with no diagnostic output.
This command ran once after the source and test files were formatted.

## Focused behavior tests

Working directory: `C:\Users\limta\Desktop\MERCHANT WORKSPACE\packages\booking-config`.

```powershell
node node_modules/vitest/vitest.mjs run test/onboarding-home.test.ts --maxWorkers=1 --minWorkers=1
```

Observed output summary:

```text
RUN  v2.1.8 C:/Users/limta/Desktop/MERCHANT WORKSPACE/packages/booking-config
test/onboarding-home.test.ts (10 tests) 314ms
Test Files  1 passed (1)
Tests  10 passed (10)
Start at  00:52:04
Duration  2.24s (transform 780ms, setup 0ms, collect 1.09s, tests 314ms, environment 0ms, prepare 312ms)
```

Observed result: exit code `0`. The focused test command ran once.
The passing file includes the projection loop over all 128 registry profiles.
Its other tests cover restaurant declarations and hours, enquiry setup, scoped hybrid profiles,
partial and invalid answers, unconfigured selections, evidence, payouts and declared branch counts.

## Limits of this record

These checks cover the shared projection and its package types.
They do not establish browser rendering, authentication, account creation, document upload,
admin approval, payout verification or launch readiness.
