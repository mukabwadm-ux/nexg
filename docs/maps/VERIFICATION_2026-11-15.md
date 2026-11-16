# Maps integration source verification — 15 November 2026

Source commit: 44e6673410e2e125d6bb677813660f42f1e658fb. [Non-UI CI](https://github.com/mukabwadm-ux/nexg/actions/runs/43688792547).

> **Superseded on merge:** this note checks #146's own maps migrations (`20261212000100` to `0300`, tests 72 to 74). When #146 was merged with `main`, they were replaced by #149's versions (`20261220000100` to `0300`, tests 75 to 77). Production already runs `0100` from #149. #149's versions add one rule: `authz.maps_has_real_account()` also refuses a caller whose Auth account is absent or deleted.

- Isolated Supabase rebuild from zero and schema lint passed.
- All 76 pgTAP files / 1,379 assertions passed, including map quota 17, order locations 14 and Saved 28.
- Route service injected tests: 14 passed; Deno entry point check passed locally.
- Bundled Discovery CI passed; local focused viewport/pagination/connector suite: 23 passed.
- Booking PostgreSQL CI passed.
- Database types are copied exactly from CI artifact 14152065102 (the first run deliberately reports them stale until this generated file is committed).

Separate consumer workspaces: App 645 contracts plus final Saved9, Maps139, full App/Maps TypeScript, Maps core/lint, targeted App lint and both Android/iOS JS exports passed. Native binary and owner UI/device acceptance are not claimed.

Canonical Discovery is langs4u/nexg-discovery: remote main d23b999eec2f5cf46549dad329e239e98ae262f1 matched the source checkout on 15 November. Its new Day/viewport source is outside this backend PR. A 32-file source-only patch against the verified Nov12 production archive passed exact before-hash checks and isolated git apply/hash reproduction and was handed to the App release owner.

No hosted migration or production deployment occurred. Routes require a separate server credential/flag; moving courier tracking requires a verified order-scoped observation source. Dated stays/booking and native platform setup remain separate.
