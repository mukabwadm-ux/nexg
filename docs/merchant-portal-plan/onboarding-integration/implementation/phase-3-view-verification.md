# Phase 3 shared Home view verification

The latest focused run passed all three tests in `apps/web/components/merchant/home-setup-view.test.tsx`.

Working directory: `C:\Users\limta\Desktop\MERCHANT WORKSPACE\apps\web`

Exact command:

```powershell
pnpm exec vitest run components/merchant/home-setup-view.test.tsx
```

Latest result:

```text
✓ components/merchant/home-setup-view.test.tsx (3 tests) 24ms
Test Files  1 passed (1)
     Tests  3 passed (3)
  Duration  1.27s
```

The passing tests cover:

- Required completed rows determine progress. Supplied documents remain awaiting review and do not count as verified.
- Host status and review notices appear with the checklist, location card, and support card.
- Waiting and completed rows show enabled editor actions when `onAction` is supplied. Launch without a callback remains blocked.

`RowAction` changed after the initial two-test run to preserve editor access for waiting and completed tasks. The first run of the added action test failed because its regular expression treated Tailwind's `disabled:` classes as a disabled HTML attribute. The assertion was corrected to detect the actual attribute. The latest run above passed all three tests after that correction.

No checks were rerun while writing this record, and no implementation code changed after the passing run.
