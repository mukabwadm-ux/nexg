# Shared onboarding contract verification

Recorded from already observed command output. No tests were rerun to write this record.

Workspace: `C:\Users\limta\Desktop\MERCHANT WORKSPACE`

Implementation: `packages/booking-config/src/onboarding.ts`

New tests: `packages/booking-config/test/onboarding.test.ts`

Public entry point: `@nexg/booking-config/onboarding`

Latest test command, run from the workspace root:

```powershell
pnpm --filter @nexg/booking-config test
```

Observed result: exit code 0, 212/212 tests passed across four test files.
The new onboarding test file contributed 152 passing tests.
Vitest reported start time `00:28:14` and duration `4.88s`.

```text
RUN v2.1.8 C:/Users/limta/Desktop/MERCHANT WORKSPACE/packages/booking-config
test/specialists.test.ts (27 tests) 195ms
test/service-jobs.test.ts (6 tests) 35ms
test/onboarding.test.ts (152 tests) 575ms
test/config.test.ts (27 tests) 1099ms
Test Files 4 passed (4)
Tests 212 passed (212)
```

Latest strict type and formatting commands:

```powershell
pnpm --filter @nexg/booking-config typecheck
pnpm exec prettier --check packages/booking-config/src/onboarding.ts packages/booking-config/test/onboarding.test.ts
```

Observed result: exit code 0. The typecheck script ran `tsc --noEmit` using the package's inherited strict TypeScript configuration.
Prettier reported `All matched files use Prettier code style!`.

Earlier focused test command used during implementation:

```powershell
pnpm --filter @nexg/booking-config exec vitest run test/onboarding.test.ts
```

Changes between earlier runs:

| Change before the next run | Observed result |
| --- | --- |
| Initial implementation and 147 onboarding cases | 146 passed; one failed because the existing AJV settings accepted `Infinity`. |
| Added a finite JSON number check in the implementation | 147 onboarding cases passed; package total 207/207 passed. |
| Added schema boundary cases and changed the test import to exercise the public package export; these were test-only changes | 148 onboarding cases passed; package total 208/208 passed. |
| Updated implementation validation to honor recorded boolean mappings and `trim: true`, and added regression cases | 150 onboarding cases passed; package total 210/210 passed. |
| Updated implementation to give inactive visibility precedence over invalid stored answers, and added transition and forged-ownership cases | 152 onboarding cases passed; package total 212/212 passed. |

The test-only reruns above occurred before the instruction to reuse passing evidence unless the code under test changes.
The latest implementation change was the inactive-answer correction. No implementation changes followed its passing run.

Coverage includes all 128 compiled subcategory profiles, scoped source inputs, foreign IDs, all four authentication-flag combinations, false and zero, schema validation, and preserved raw values.
The visibility transition test temporarily changes one registry predicate and restores it in `finally`; production registry data is unchanged.

Authentication flags are test inputs. These checks did not exercise an external email OTP provider, sign-in service, or backend authorization.
