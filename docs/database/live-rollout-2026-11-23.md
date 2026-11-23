# Live database rollout, 23 Nov 2026

The live database (Supabase project NexgApp) stops at 11 Nov 2026. This document lists every migration on main that it has not run, proves which ones it has already run under other numbers, and gives the exact steps to bring it level with main, once, with nothing repeating.

**Nothing here has been run on live.** Each live step below needs the owner's yes, given in the rollout chat for that step.

## Contents

- 1. What the live database has, and how that is known
- 2. The count
- 3. The repairs, each with its proof
- 4. Scheduled jobs: on or off at the push
- 5. Data the push changes on live rows
- 6. The runbook
- 7. Live-only changes main does not have (for Derrick)
- 8. How CI keeps this true
- 9. Every migration the push touches

## 1. What the live database has, and how that is known

**What `supabase migration list` showed on 23 Nov:**

- 280 versions applied live, up to `20261111001700`.
- 15 of them have no file on main: `20261111000100`, and `20261111000400` to `001700`.
- The CLI compares by number only. So three more versions look matched but are not: `20261111000000`, `000200` and `000300`. Live ran different files under those numbers.

**Where the missing SQL came from.** The owner's local Supabase stack (container `supabase_db_nexg`, built 8 Nov from the checkout that pushed to live) has the same 280 versions. Supabase keeps every migration's name and SQL in `supabase_migrations.schema_migrations`, and that copy was read read-only. It is archived here:

| File | What it holds |
|---|---|
| `supabase/live-history/live-versions-2026-11-23.json` | all 280 versions and their names |
| `supabase/live-history/20261111-block.json` | the 18 versions of the `20261111` block, with their exact SQL and `sql_md5`, the md5 of `array_to_string(statements, E'\n')` |

**Proof that live is that copy.** Query K (`supabase/live-history/rollout-readonly-queries.sql`) returns live's own fingerprint of its history. It must be:

- `versions` 280
- `all_280` `cce74d301c9a692e4ad8e7cb13504f98`
- `before_1111` `5b16d17090131669c3825f139cf2aa5b`

If it differs, stop: run K2, and compare each version's `sql_md5` with section 3. **No repair is made until K matches.**

**The 262 versions before the block match main's files exactly.** They have the same name and the same statements, compared statement by statement. So CI can rebuild live's 11 Nov state from main plus the archive.

| Live id | Live ran | On main |
|---|---|---|
| `20261111000000` | `activities_games_sports_enum` | none. Main's own `20261111000000` (`connector_outbox_claim_audit_exemption`) **never ran** |
| `20261111000100` | `activities_games_sports_config` | none |
| `20261111000200` | `host_unit_portfolio_save` | `20261113000100`, 1/1 statements. Main's own `20261111000200` (`merchant_setup_storage_owner_grant`) **never ran** |
| `20261111000300` | `host_manual_finance` | `20261113000200`, 11/11. Main's own `20261111000300` (`merchant_setup_write_audit`) **never ran** |
| `20261111000400` | `host_workspace_preferences` | `20261113000300`, 7/7 |
| `20261111000500` | `host_workspace_gallery` | `20261113000400`, 3/3 |
| `20261111000600` | `scope_merchant_media_policy_check` | none (section 7) |
| `20261111000700` | `host_workspace_cancel_placement` | `20261113000600`, 3/3 |
| `20261111000800` | `retire_packages_with_valid_status` | `20261113000700`, 2/2 |
| `20261111000900` | `host_scoped_privacy_status` | `20261113000800`, 9/9 |
| `20261111001000` | `host_workspace_tasks` | `20261113000900`, 8/9: main gives `rpc_host_workspace_task_save` parameter defaults, and `20261114000100` re-creates it with them |
| `20261111001100` | `host_workspace_guides` | `20261113001000`, 20/21: main gives `rpc_host_workspace_guide_asset` `p_code default null`, which **`20270228000100` (this PR) adds** |
| `20261111001200` | `unit_save_respects_unit_scope` | none. Later main files replace the function |
| `20261111001300` | `host_workspace_writes_are_audited` | none. `20261114000100` replaces both functions |
| `20261111001400` | `gross_includes_vat` | none (section 7) |
| `20261111001500` | `api_console_module` | none (section 7) |
| `20261111001600` | `business_types_for_activities` | none. It reruns `20261106000000`'s idempotent update |
| `20261111001700` | `payment_callbacks_and_audit_wiring` | none as a file. Later main files drop or replace its functions |

**What this corrects.** An earlier plan guessed that live's `001400`–`001700` were host onboarding, and proposed marking main's `20261114000100`–`20261117000100` as applied. They are not host onboarding: those four main files are new and must run. Marking them would have left host onboarding off live.

`scripts/check-migration-repeats.mjs` now refuses any "applied" repair that lacks a content match, so a guess like that fails CI.

## 2. The count

All counts in this document are as of main at `8b8c7e5f`. Main has 207 migrations live never recorded, plus the 3 hidden under shared numbers. This PR adds 2. That makes 212, and each has a row in section 9.

| Class | Count | What happens |
|---|---|---|
| New: nothing like it is live | 185 | runs |
| New, this PR | 2 | runs. `20270228000100` adds the one parameter default live's early copy lacks. `20270228000200` adds the `merchant_application_session_gate` policy to `connector_connection`, which live would otherwise miss because the connector tables arrive late there |
| Repeat of a live version under another number | 9 | marked applied by repair, with proof (section 3). Seven of them would stop the push with "already exists" if run |
| Never ran, hidden by a shared number | 3 | `20261111000000`, `000200`, `000300`: live's rows are reverted, then the push runs main's files. All three are safe late: an insert that does nothing on conflict, a grant, and create or replace |
| Superseded by a later file | 11 | runs; harmless, the later file wins |
| Unknown until query I answers | 2 | `20260101021800` (create or replace: harmless either way); `20261102000050` (fails only if the connector tables already exist; query I says) |
| Repeat of another file on main | 0 | proven in CI: no two files share statements, no file only repeats earlier ones, ids unique |

**`db push --include-all` runs 203 migrations.** That is 212 minus the 9 marked applied. `node scripts/live-rollout-2026-11-23.mjs expected` prints them in order. The dry run must print exactly that list.

Main moves daily. Fetch it, then recount with that command, before the push; any new migration after the live head is simply new.

## 3. The repairs, each with its proof

A repair edits only the history table `supabase_migrations.schema_migrations`. It never changes the schema or the data. Each `sql_md5` below is what query K2 returns on live for that version; it must match before anything is repaired.

CI recomputes every proof on every pull request:

- the archive's statements hash to the recorded `sql_md5`;
- main's file holds the same statements as that live version, apart from the listed difference.

`node scripts/live-rollout-2026-11-23.mjs repairs --linked` prints these lines from `supabase/live-history/rollout-2026-11-23.json`, so nothing is typed by hand:

```
# 1. Take live's 20261111 block out of the history table. Schema and data are untouched.
#    20261111000000  sql_md5 6da919dc4dc8034e8b0c1e594dbf8ba5  activities_games_sports_enum
#    20261111000100  sql_md5 5c38f941a77d16b541bbe9947586a256  activities_games_sports_config
#    20261111000200  sql_md5 5ac94ecd7aac32e5bf5e82359ad0fe5f  host_unit_portfolio_save
#    20261111000300  sql_md5 f8c990b024a783a45a1f954a8d3a35a2  host_manual_finance
#    20261111000400  sql_md5 2f7f36afbf71c10c2ceb7d931d0bdc9a  host_workspace_preferences
#    20261111000500  sql_md5 d18e92f6594a88ce443c8e2bcf7e8534  host_workspace_gallery
#    20261111000600  sql_md5 7ed1c552c1abfde537140471e73ea563  scope_merchant_media_policy_check
#    20261111000700  sql_md5 220eda72c4805da1ed639bc5e7424a3f  host_workspace_cancel_placement
#    20261111000800  sql_md5 b49b4ca48ca53f830dee2e56ff50a11a  retire_packages_with_valid_status
#    20261111000900  sql_md5 b5aa051699d128620be65b19b1efd46a  host_scoped_privacy_status
#    20261111001000  sql_md5 3da82988d94c8a60835ddc5e62745d49  host_workspace_tasks
#    20261111001100  sql_md5 73cf5a281002df5048993a52749e7e75  host_workspace_guides
#    20261111001200  sql_md5 677fef44204e98f052d4d0c9a1409b0e  unit_save_respects_unit_scope
#    20261111001300  sql_md5 29ce2320ceca0f950dafc2869e9b6e68  host_workspace_writes_are_audited
#    20261111001400  sql_md5 c645acc3a5df518c787f798ad873a9b4  gross_includes_vat
#    20261111001500  sql_md5 c6761c796e6cee3f1201304ec2f62b0c  api_console_module
#    20261111001600  sql_md5 d8b8aebaa75fdeaeedcc2f7c782b172c  business_types_for_activities
#    20261111001700  sql_md5 92580e4c511709d666008016f1f04747  payment_callbacks_and_audit_wiring
supabase migration repair --status reverted 20261111000000 20261111000100 20261111000200 20261111000300 20261111000400 20261111000500 20261111000600 20261111000700 20261111000800 20261111000900 20261111001000 20261111001100 20261111001200 20261111001300 20261111001400 20261111001500 20261111001600 20261111001700 --linked
# 2. Record main's files that live already ran under the old numbers (proof: same SQL, by md5 and statement by statement).
#    20261113000100 = live 20261111000200  sql_md5 5ac94ecd7aac32e5bf5e82359ad0fe5f
#    20261113000200 = live 20261111000300  sql_md5 f8c990b024a783a45a1f954a8d3a35a2
#    20261113000300 = live 20261111000400  sql_md5 2f7f36afbf71c10c2ceb7d931d0bdc9a
#    20261113000400 = live 20261111000500  sql_md5 d18e92f6594a88ce443c8e2bcf7e8534
#    20261113000600 = live 20261111000700  sql_md5 220eda72c4805da1ed639bc5e7424a3f
#    20261113000700 = live 20261111000800  sql_md5 b49b4ca48ca53f830dee2e56ff50a11a
#    20261113000800 = live 20261111000900  sql_md5 b5aa051699d128620be65b19b1efd46a
#    20261113000900 = live 20261111001000  sql_md5 3da82988d94c8a60835ddc5e62745d49  (differs only in public.rpc_host_workspace_task_save()
#    20261113001000 = live 20261111001100  sql_md5 73cf5a281002df5048993a52749e7e75  (differs only in public.rpc_host_workspace_guide_asset()
supabase migration repair --status applied 20261113000100 20261113000200 20261113000300 20261113000400 20261113000600 20261113000700 20261113000800 20261113000900 20261113001000 --linked
```

**Undo**, only if the dry run after the repairs is wrong and nothing has been pushed: run `supabase/live-history/rollout-undo-repairs.sql` in the SQL editor. It puts back live's 18 rows exactly and removes the 9. CI runs it too.

## 4. Scheduled jobs: on or off at the push

The push creates 19 `pg_cron` jobs, each the moment its migration runs. Live today has 18 others (audit, dispatch, featured, finance, notify, push, QR), and nothing here changes those.

Recommended: ten jobs paused straight after the push with `supabase/live-history/rollout-pause-jobs.sql`, which CI also runs. Each is switched on later, one at a time, when its owner says. The owner decides this once, in step 6 of the runbook.

| Job | Schedule | Migration | What it does | Recommended at the push |
|---|---|---|---|---|
| `stay-release-expired-holds` | every minute | `20261118000100` | releases stay holds past their expiry | **on** (housekeeping) |
| `booking-release-stale` | every 5 min | `20261223000500` | releases booking holds never paid | **on** (housekeeping) |
| `fraud-checks` | every 5 min | `20270105000100` | flags orders and riders for staff review. Its migration also runs one sweep at once over existing orders and riders (query J counts them) | **on**: flags only, seen by staff |
| `cron-run-log-trim` | daily | `20270106000100` | trims the job log | **on** |
| `maps-rider-sharing-expire` | every minute | `20270109000200` | ends expired rider location shares | **on** |
| `native-push-retention` | 03:27 UTC | `20270120000100` | deletes old push records | **on** |
| `purge-order-buyer-ids` | 03:17 UTC | `20270130000500` | deletes eSIM buyer IDs past retention | **on** |
| `purge-audit-ips` | 03:43 UTC | `20270131000200` | deletes old sign-in IP addresses | **on** |
| `fx-rates` | every 15 min | `20270203000100` | fetches display exchange rates from a public rates API; a failed answer changes nothing | **on** |
| `payments-worker` | every minute | `20261206000100` | asks M-Pesa about open payment prompts; idle until the owner sets `payments_worker_url` in Vault | **off** until the payments chat confirms Vault and test mode |
| `payments-expire-unpaid` | every 5 min | `20261206000100` | expires unpaid M-Pesa orders | **off** until checked against live's open orders |
| `paystack-sweep` | every 2 min | `20270129000200` | asks Paystack about open attempts | **off** until Paystack test keys are set |
| `api-webhooks` | every minute | `20270101000100` | posts order and booking events to partners' URLs | **off** until partners are checked |
| `native-push-dispatch` | every 5 seconds | `20270120000100` | sends phone pushes; idle until the Vault pair and `D8_DELIVERY_ENABLED` are set | **off** (push switch-on steps) |
| `native-push-reminders` | every 5 min | `20270120000100` | push reminders | **off** |
| `app-email-reminders` | hourly at :17 | `20270128000200` | customer emails; the email routes start switched off | **off** until the routes are on |
| `merchant-live-emails` | every minute | `20270131000500` | "you are live" email when a business goes live; businesses already live are recorded as skipped | **off** until checked |
| `merchant-setup-reminders` | 06:00 UTC | `20270124000100` | reminds approved merchants 1, 3 and 7 days after approval (bell and email) | **off**: it would email every approved merchant on the first morning |
| `holiday-reminders` | 04:00 UTC | `20261214000100` | emails merchants about holiday hours | **off** until checked |

**Push away from 04:00 and 06:00 UTC** (07:00 and 09:00 in Nairobi). Run the pause file straight after the push.

## 5. Data the push changes on live rows

No migration drops a table or a column of live data. These change existing rows, apart from settings and registry tables. Query J counts the rows first.

| Migration | Change on live rows |
|---|---|
| `20261122000100_sample_listings` | renames and re-photographs 5 sample properties, matched by slug and demo host ids |
| `20261204000100_remove_paystack` | payments with provider `paystack` and no reference become `unassigned`; their events follow. Paystack returns in `20270129000200` |
| `20261226000200_master_categories` | moves merchants on retired categories or subcategories to the 21 master categories |
| `20261231000200_merchants_default_city` | merchants with no city get Nairobi |
| `20270105000100_fraud_checks` | `fraud_rule.kind` and `fraud_signal.kind` become text; signals get `dedupe_key` and `subject_id`; one fraud sweep runs at once |
| `20270125000100_host_listing_details_and_publish` | every listed unit becomes host-published |
| `20270130000300_min_order_and_public_answers` | fills `merchant.min_order_kes` from sign-up answers where empty |
| `20270203009700_precise_branch_locations` | re-measures each pinned branch's area; fills main-branch pins from given coordinates |
| `20270220000100_every_unit_in_a_property` | every unit without a property gets one |

`20270126000100` (deletes stored county and owner ID answers) and `20270130000200` (rewrites setup notes) look like data changes. They are not on live: the tables they touch do not exist there yet.

`20270131000500` records existing live merchants as "skipped", so no email goes out. The app email routes are created switched off.

### `20270227000400`: seven functions that could not run

This migration (Derrick, 23 Nov) re-creates seven functions whose original bodies fail when they run: ambiguous aliases, text cast to enums, `max(uuid)`, and `vault.delete_secret`.

**Effect on the push.**

- Five of the originals are already live (`20260101007800`, `008200`, `008700`, `009100`).
- Two are in the push: `20270128000200` (`app_email.for_receipt`) and `20261102000050` (`rpc_connector_transition`).
- None fails while the migrations are applied. They fail only when called, and no migration in the push calls them at apply time: they have no top-level statement or `DO` block that runs them, and none of their triggers fires on rows the push writes.
- `20270227000400` itself runs in the push, after both originals, so live ends with the fixed bodies.
- The CI rehearsal applies all of it. It does not call the seven functions; pgTAP test 149 on main does.

**What its header says about production.** It names "a copy of production" whose bodies include `app_email.for_receipt` (`20270128000200`) and `rpc_connector_transition` (`20261102000050`). By the 23 Nov migration list, live has run neither.

That fits Derrick's #201 (production missing only 22 migrations), not the list this document is built on. Runbook step 2's count query, together with which Supabase project #201 calls production, decides which is true. If live has moved on from 11 Nov, this plan is redone against what live has before anything runs.

## 6. The runbook

The owner runs every command in their own terminal: PowerShell, from a checkout of main after this PR merges, linked to NexgApp. The CLI asks for the database password itself; type it only at that prompt, never into a chat.

Do **not** use `scripts/push-to-production.sh` for this rollout. It does a plain push, without the repairs or `--include-all`.

Each step waits for the owner's yes, typed in the rollout chat.

| Step | What | Stop if |
|---|---|---|
| 0 | **Freeze.** No pushes to main, and no migrations from any checkout, until step 8 is done. Pick a quiet hour away from 04:00 and 06:00 UTC. | anyone is mid-push |
| 1 | **Back up** (details below). | the dashboard backup is missing |
| 2 | **Read.** In the SQL editor, run `supabase/live-history/rollout-readonly-queries.sql`, parts K, G, H, I and J; paste the results to the rollout chat. | K differs; I says `connector_foundation_ran` = true; G or H show any version outside `20261113000200`–`001000` |
| 3 | **Rehearse on a copy** (details below). | any step fails |
| 4 | **Repair** (details below). | either command errors |
| 4b | **Switch off live's extra category.** Run `supabase/live-history/rollout-pre-push.sql` in the SQL editor: it returns one row, `activities_games_sports` with `false`. Without it the push stops at `20261226000200_master_categories` (found by the CI rehearsal). It moves no merchant; section 7 says who decides where they go. | Derrick and the owner have not answered section 7's question |
| 5 | **Dry run** (details below). | the list differs in any line: run the undo (section 3) and stop |
| 6 | **Decide the jobs.** Section 4, once. | |
| 7 | **Push.** `supabase db push --linked --include-all` (it lists the migrations again and asks y/N). Then, at once, run `supabase/live-history/rollout-pause-jobs.sql` in the SQL editor: it must return 10 rows, unless step 6 changed the list. | a migration fails: the CLI stops there, the ones before it stay applied. Fix forward in a new PR, or roll back (step 10) |
| 8 | **Check** (details below). | anything fails |
| 9 | **End to end, in Paystack test mode only.** Test keys only; no real charge. Then the freeze ends. | |
| 10 | **Roll back, only if needed** (details below). | |

### Step 1: back up

- **Dashboard:** Database › Backups. Confirm today's backup exists, or take one; note the time for point-in-time recovery.
- **Dumps the owner keeps outside the repo:**

```powershell
supabase db dump --linked --role-only -f live-roles-2026-11-23.sql
```

```powershell
supabase db dump --linked -f live-schema-2026-11-23.sql
```

```powershell
supabase db dump --linked --data-only -f live-data-2026-11-23.sql
```

### Step 3: rehearse on a copy

- Once K matches, the rollout chat makes a throwaway copy of the owner's local stack: `pg_dump` from `supabase_db_nexg` into a new container from the same Supabase Postgres image. The stack itself, and live, are never touched.
- On that copy it runs this runbook's steps 4 to 8, then reports.
- CI's `Live rollout rehearsal` job already does the same from main's files on every pull request (section 8).

### Step 4: repair

```powershell
node scripts/live-rollout-2026-11-23.mjs repairs --linked
```

It prints two commands, the ones in section 3. Run the first, then the second.

### Step 5: dry run

```powershell
supabase db push --linked --include-all --dry-run
```

Its list must equal, line for line and in order:

```powershell
node scripts/live-rollout-2026-11-23.mjs expected
```

That is 203 lines at `8b8c7e5f` plus this PR.

### Step 8: check

- `supabase migration list --linked`: every row has both columns filled; nothing local-only, nothing remote-only.
- `supabase/live-history/rollout-post-checks.sql` in the SQL editor: every row says PASS.
- `select jobname, active from cron.job order by 1;` shows the jobs as decided in step 6.
- Supabase logs: no new errors.

### Step 10: roll back, only if needed

- **The schema and data:** restore the step 1 backup (dashboard, or the three dumps into a fresh project). Anything written after the push is lost, which is why the window is quiet.
- **History only:** the repair undo in section 3.

## 7. Live-only changes main does not have (for Derrick)

The revert in section 3 cleans only the history table. These changes stay on live, and a database built from main lacks them.

| Live version | What stays live | Main |
|---|---|---|
| `20261111000000`, `000100`, `001600` | the `activities_games_sports` category (enum value, `category_config` row, business-types question). Step 4b switches the row off, because `master_categories` refuses to run while it is active | uses `games_sports` |
| `20261111000600` | `authz.owns_merchant_offering_media`, and the two `merchant-offering-media` storage policies that call it | the original policies |
| `20261111001400` | `fn_fin_kpi_for` with VAT in gross | the older body without the VAT fix |
| `20261111001500` | `console_module` row `api` | no row |

CI's rehearsal compares live after the rollout with a database built fresh from main, statement by statement. The only differences are the rows above: the enum, the media owner check and its two policies, and `fn_fin_kpi_for`. Each is listed with its reason in `supabase/live-history/rollout-expected-schema-diff.json`. The job fails on any other difference, and on any listed one that disappears.

The first rehearsal found one more, the other way round: `connector_connection` would have lacked a security policy every other merchant table has. `20270228000200` (this PR) adds it.

**One question has to be answered before the live run.** Where do merchants saved with `activities_games_sports` go? The local copy has 65 of them, and query J counts live's.

- After step 4b, they keep the category, but it is switched off.
- A new migration (new id) could move them to `games_sports`, mapping each subcategory (bowling, arcade and the rest) to one of its subcategories.

That mapping is Derrick's and the owner's call; nothing here guesses it.

For the rest, Derrick decides, row by row, whether to:

- add it to main in a new migration (a new id, never these), or
- remove it from live in one.

## 8. How CI keeps this true

**Quick checks** run `node scripts/check-migration-repeats.mjs --report` on every pull request. It fails when:

- two migrations have the same statements;
- a migration only repeats statements an earlier one ran;
- a file after the live head holds a live version's statements and is not marked applied;
- an id is used by two files, or by a file and a different live migration;
- an "applied" repair has no content match.

Cinema and every other new migration go through it too.

**Live rollout rehearsal** (`scripts/live-rollout-rehearsal.sh`) runs with no secrets. It:

1. builds live's 11 Nov state (280 versions, names checked against the archive);
2. applies the repairs, undoes them, checks, and applies them again;
3. runs the pre-push step, then checks that the dry run equals `expected`;
4. pushes with `--include-all`;
5. checks that the history equals main's files exactly;
6. runs the post-checks and the job pause;
7. compares the schema with a fresh build from main.

Its lists and the schema diff are uploaded as the `live-rollout-rehearsal` artifact.

After the live push, add the new live versions to `live-versions-*.json`, so ids keep being checked against what live ran.

## 9. Every migration the push touches

"Live rows" means rows that exist on live today; "config rows" are settings and registry tables (action registry, audit exemptions, categories, storage buckets and similar).

| # | Migration | What it does | Class | Risk on live | Action |
|---|---|---|---|---|---|
| 1 | `20260101021800_staff_reset_credentials` | Letting a super admin reset another staff member's login credentials. | Unknown (query I): create or replace, harmless either way | none | run |
| 2 | `20261102000050_connector_runtime_foundation` | Shared connector runtime foundation. | Unknown (query I): fails if the connector tables exist; absent in the local copy | config rows: action_registry | run if I says absent; otherwise stop and ask |
| 3 | `20261111000000_connector_outbox_claim_audit_exemption` | connector outbox claim audit exemption | Never ran: live used `20261111000000` for `activities_games_sports_enum` | config rows: wiring_audit_exempt | revert `20261111000000`, then the push runs it |
| 4 | `20261111000200_merchant_setup_storage_owner_grant` | The document and offering media storage policies evaluate this owner check | Never ran: live used `20261111000200` for `host_unit_portfolio_save` | none | revert `20261111000200`, then the push runs it |
| 5 | `20261111000300_merchant_setup_write_audit` | Record shared setup writes without copying offering or location details into the audit trail. | Never ran: live used `20261111000300` for `host_manual_finance` | none | revert `20261111000300`, then the push runs it |
| 6 | `20261112000100_reconcile_integration_audit_modules` | Settings owns the console's integrations and API credentials sections. | New | config rows: action_registry | run |
| 7 | `20261112000200_main_write_audit` | Audit the business state changes at the existing authorised RPC boundaries. | New | config rows: action_registry, wiring_audit_exempt | run |
| 8 | `20261112000300_payment_ingress_proof` | Provider requests reach PostgREST as anon. Verify their proof inside the | New | config rows: action_registry, wiring_anon_allow | run |
| 9 | `20261112000400_staff_reset_not_public` | rpc_staff_reset_credentials exists on the live database (it was applied from | New | none | run |
| 10 | `20261113000100_host_unit_portfolio_save` | Keep the existing unit save and its portfolio details in the same transaction. | Repeat of live `20261111000200` (sql_md5 `5ac94ecd…`) | none | mark applied |
| 11 | `20261113000200_host_manual_finance` | Manual host records. NexG invoices and money movement stay in their existing ledgers. | Repeat of live `20261111000300` (sql_md5 `f8c990b0…`) | none | mark applied (running it would stop the push: "already exists") |
| 12 | `20261113000300_host_workspace_preferences` | host workspace preferences | Repeat of live `20261111000400` (sql_md5 `2f7f36af…`) | none | mark applied (running it would stop the push: "already exists") |
| 13 | `20261113000400_host_workspace_gallery` | Serialize edits to a gallery and keep the existing photo RPCs as the write authority. | Repeat of live `20261111000500` (sql_md5 `d18e92f6…`) | none | mark applied (running it would stop the push: "already exists") |
| 14 | `20261113000600_host_workspace_cancel_placement` | Hosts can cancel a scheduled placement before it becomes a billed placement. | Repeat of live `20261111000700` (sql_md5 `220eda72…`) | none | mark applied (running it would stop the push: "already exists") |
| 15 | `20261113000700_retire_packages_with_valid_status` | Retirement uses the existing status and serializes against new placements. | Repeat of live `20261111000800` (sql_md5 `b49b4ca4…`) | none | mark applied |
| 16 | `20261113000800_host_scoped_privacy_status` | A verified request can share its status with a specific host without sharing its contents. | Repeat of live `20261111000900` (sql_md5 `b5aa0516…`) | none | mark applied (running it would stop the push: "already exists") |
| 17 | `20261113000900_host_workspace_tasks` | Private operational tasks. NexG guest requests continue to use host_request. | Repeat of live `20261111001000` (sql_md5 `3da82988…`); differs only in `public.rpc_host_workspace_task_save` | none | mark applied (running it would stop the push: "already exists") |
| 18 | `20261113001000_host_workspace_guides` | Guest guides use the existing unit and QR identifiers. Drafts and old versions are private. | Repeat of live `20261111001100` (sql_md5 `73cf5a28…`); differs only in `public.rpc_host_workspace_guide_asset` | none | mark applied (running it would stop the push: "already exists") |
| 19 | `20261114000100_host_onboarding` | Host onboarding: an account on apply, documents before approval, and no | New | none | run |
| 20 | `20261115000100_host_registration_email` | Host registration: shared phone numbers, unique emails, verified email first. | New | none | run |
| 21 | `20261116000100_host_apply_handoff_optional` | Host registration no longer asks how riders should hand over. | Superseded by `20261117000100` | none | run (harmless) |
| 22 | `20261117000100_host_apply_listing_import` | Host registration can import the applicant's Airbnb listing. | New | none | run |
| 23 | `20261118000100_stay_holds_and_blocks` | Stay booking, phase 1: holds, date blocks, availability, and no double booking. | New | config rows: action_registry; **starts job:** stay-release-expired-holds | run |
| 24 | `20261119000100_stay_payment_intent` | A payment can be for a stay. On its own because Postgres will not use a | New | none | run |
| 25 | `20261119000200_stay_checkout` | Stay booking, phase 2: a guest pays for a held stay with M-Pesa. | New | config rows: action_registry, wiring_audit_exempt | run |
| 26 | `20261120000100_stay_refunds` | Stay refunds: the queue staff work from, and the record of each refund. | New | config rows: action_registry | run |
| 27 | `20261121000100_laundry_subcategories` | Laundry & Cleaning: twelve more subcategories. | New | config rows: category_config, merchant_application_registry | run |
| 28 | `20261122000100_sample_listings` | Sample listings: the demonstration stays are shown, never booked. | New | **live rows:** update property, update unit | run |
| 29 | `20261122000200_category_tile_clicks` | Popular categories, ordered by what visitors actually tap. | New | config rows: wiring_anon_allow, wiring_audit_exempt | run |
| 30 | `20261123000100_stay_requests_tickets_and_auto_listing` | Two changes to stays. | New | config rows: action_registry | run |
| 31 | `20261124000100_merchant_agreements` | Per-category merchant agreements, accepted online at application. | New | none | run |
| 32 | `20261125000100_receipts` | Receipts, for customers, merchants, riders and hosts. | New | config rows: action_registry | run |
| 33 | `20261126000100_best_sellers` | Best sellers on the home page: paid first, then what actually sells. | New | none | run |
| 34 | `20261127000100_mpesa_prompts` | M-Pesa prompts: every prompt remembered, no double charge going unnoticed, | New | config rows: wiring_audit_exempt | run |
| 35 | `20261128000100_merchant_promotions` | Merchant promotions, charged at checkout; and featured placements a | New | config rows: action_registry | run |
| 36 | `20261129000100_customer_booking` | Customers book for themselves on the main database. | New | none | run |
| 37 | `20261130000100_bank_collections` | Bank collections at checkout. | New | config rows: action_registry, wiring_anon_allow | run |
| 38 | `20261201000100_api_connections` | Settings → API: the outside systems NexG connects to, and proof they work. | New | config rows: action_registry; can call outside services (from its job or function) | run |
| 39 | `20261202000100_api_overview` | Settings → API & Webhooks: the status of the webhooks NexG receives, and of API keys. | Superseded by `20261206000100` | none | run (harmless) |
| 40 | `20261203000100_onboarding_hours_save` | The onboarding hours step saves again. | New | none | run |
| 41 | `20261204000100_remove_paystack` | Paystack is gone. | New | **live rows:** update payment, update payment_event; config rows: integration, wiring_anon_allow | run |
| 42 | `20261205000100_api_order_reads_fix` | Merchants can read their orders through the API again. | Superseded by `20270101000100` | none | run (harmless) |
| 43 | `20261206000100_mpesa_settles_itself` | M-Pesa that settles itself, sends refunds, and hears about Paybill payments. | New | config rows: action_registry, integration, wiring_anon_allow, wiring_audit_exempt; **starts job:** payments-expire-unpaid, payments-worker; can call outside services (from its job or function) | run |
| 44 | `20261207000100_effective_hours_sunday` | Sunday hours are found again for weeks written without a weekday convention. | Superseded by `20261231000100` | none | run (harmless) |
| 45 | `20261208000100_rider_email_and_kit` | Riders verify an email, not a phone, and buy the NexG rider kit before | New | config rows: definition | run |
| 46 | `20261209000100_rider_submit_phone_or_email` | Rider submit accepts a verified phone as well as a confirmed email. | Superseded by `20270102000100` | none | run (harmless) |
| 47 | `20261210000100_popular_searches` | Popular searches in the homepage hero, ordered by what visitors search for. | New | config rows: wiring_anon_allow, wiring_audit_exempt | run |
| 48 | `20261210000200_category_order` | Browse by category on Explore: the order the business asked for. | New | config rows: category_config | run |
| 49 | `20261210000300_delivery_rate_public` | The delivery rate card, readable by visitors. | New | config rows: wiring_anon_allow | run |
| 50 | `20261210000400_min_order_public` | The minimum order for a category, readable by visitors. | New | config rows: wiring_anon_allow | run |
| 51 | `20261210000500_catalogue_images_public_read` | Menu photos could not be shown to visitors. | New | none | run |
| 52 | `20261211000100_merchant_holiday_hours` | Merchants say whether they open on public holidays. | New | config rows: holiday_calendar | run |
| 53 | `20261212000100_close_early_override` | "Close early today" works again. | New | none | run |
| 54 | `20261212090000_flights_category_enum` | Give flight operators a platform category. The config uses the new enum | New | none | run |
| 55 | `20261212090100_flights_and_cinemas_catalog` | Shared catalogue categories for real flight and cinema operators. | New | config rows: category_config | run |
| 56 | `20261212090200_cinema_programme_and_seats` | Cinema operators publish a programme into a private catalogue. Public RPCs | New | none | run |
| 57 | `20261212090300_cinema_writes_audited` | The cinema writes are audited. | New | config rows: action_registry | run |
| 58 | `20261213000100_holiday_calendar_admin` | Staff keep the public holiday calendar from Settings → Cities. | New | none | run |
| 59 | `20261214000100_holiday_reminders` | Merchants are reminded to answer an upcoming public holiday. | New | config rows: notification_email_kind; **starts job:** holiday-reminders | run |
| 60 | `20261215000100_documents_stream_live` | Document changes stream over Realtime, so the screens that list them update | New | none | run |
| 61 | `20261216000100_holiday_custom_hours` | Holidays get custom hours, and a merchant can take a day of their own off. | New | none | run |
| 62 | `20261217000100_api_test_keys` | Test keys and a sandbox for the NexG API. | New | config rows: wiring_audit_exempt | run |
| 63 | `20261218000100_application_merchants_go_live` | Approved new-form merchants can go live. | New | none | run |
| 64 | `20261218000200_offerings_csv_import` | Offerings: catalogue sections that follow the editor, and CSV import. | New | config rows: action_registry | run |
| 65 | `20261219000100_flat_services_priced_once` | A flat-priced service is charged once, and an API order's line is in cents. | New | none | run |
| 66 | `20261220000100_maps_route_budget` | A Maps account must still exist in Auth and must not be a temporary session. | New | config rows: wiring_audit_exempt | run |
| 67 | `20261220000200_my_order_map` | Account-owned order location read. Courier fixes are outside this contract. | Superseded by `20270109000300` | none | run (harmless) |
| 68 | `20261220000300_saved_places` | Reuses the Saved identity schema proposed in PR 132, without its unrelated | New | config rows: wiring_audit_exempt | run |
| 69 | `20261221000100_merchant_actions_registered` | Merchant hours, team and settings actions are registered. | New | config rows: action_registry | run |
| 70 | `20261222090000_merchant_documents_no_owner_id_or_kra_pin` | Merchants no longer upload an owner ID or a KRA PIN certificate | New | config rows: document_requirement | run |
| 71 | `20261223000100_drop_open_payment_step` | The open payment step goes. | New | config rows: wiring_anon_allow | run |
| 72 | `20261223000200_checkout_no_phone_claim` | Checkout no longer hands an existing customer record to whoever types its | Superseded by `20270130009000` | none | run (harmless) |
| 73 | `20261223000300_privacy_requests_match_exactly` | A privacy request is filed against the right person, or against nobody yet. | New | none | run |
| 74 | `20261223000400_checkout_licence_and_hours` | Checkout keeps the liquor-licence rule the menu already keeps, and takes no | New | none | run |
| 75 | `20261223000500_accounts_only_and_booking_release` | Orders, bookings and stay holds need a real account, and a booking the | New | config rows: action_registry; **starts job:** booking-release-stale | run |
| 76 | `20261223000600_dispatch_start_and_answers` | Dispatch: who may start it, and how two answers to one job are settled. | New | none | run |
| 77 | `20261223000700_host_unit_scope` | A host team member limited to some units no longer reaches the others. | New | none | run |
| 78 | `20261224000100_careers_board` | NexG Careers: businesses on NexG advertise their own jobs. | New | config rows: action_registry, buckets, notification_email_kind | run |
| 79 | `20261225000100_careers_hosts_hotels_and_console` | NexG Careers: hosts and hotels hire too, and staff run the board. | New | config rows: action_registry, console_module, notification_email_kind, role_module_access | run |
| 80 | `20261226000100_master_categories_enum` | NexG master category list (16 Nov 2026): three new merchant categories. | New | none | run |
| 81 | `20261226000200_master_categories` | NexG master category list (owner, 16 Nov 2026): 21 categories, 214 subcategories. | New | **live rows:** update merchant; config rows: category_config, merchant_application_registry | run |
| 82 | `20261230000100_company_module` | Company: NexG's own back office in the console. | New | config rows: action_registry, buckets, console_module, role_module_access, wiring_audit_exempt | run |
| 83 | `20261231000100_holidays_without_city` | Public holidays for merchants with no city on record. | New | none | run |
| 84 | `20261231000200_merchants_default_city` | Every merchant has a city: Nairobi when none was given. | New | **live rows:** update merchant | run |
| 85 | `20261231000300_finance_redesign` | Finance, redesigned. Two parts: | New | config rows: action_registry, buckets | run |
| 86 | `20270101000100_booking_status_branches_webhooks` | Phase 1 of the shared booking format: one status for every booking, | New | config rows: action_registry; **starts job:** api-webhooks; can call outside services (from its job or function) | run |
| 87 | `20270101000200_paused_merchants_stop_taking_orders` | A paused merchant stops taking orders, so documents expire again. | New | none | run |
| 88 | `20270101000300_merchant_cashier_role` | A team member can be a cashier. | New | none | run |
| 89 | `20270101000400_team_member_changes` | An owner can change their team, and the change is saved. | New | none | run |
| 90 | `20270101120100_promo_media` | A merchant's own image or video, on a featured card or a promotion. | New | config rows: action_registry, buckets | run |
| 91 | `20270102000100_rider_submit_without_documents` | A rider application can be submitted before the document photos are in. | New | none | run |
| 92 | `20270102120100_adult_age_check` | Every Adult Section specialty asks how the merchant checks a customer's age. | New | config rows: category_config, merchant_application_registry | run |
| 93 | `20270102120200_category_retired_subcategories` | Merchants on a retired subcategory keep a working setup (after the master list, | New | config rows: category_config | run |
| 94 | `20270103000100_merchant_agreement_signing` | Merchant agreements fill themselves in and are signed on approval. | New | config rows: action_registry, buckets | run |
| 95 | `20270103000200_merchant_agreement_signer_order` | NexG's signing details: the newest version is the one in use. | New | none | run |
| 96 | `20270104070100_api_key_revoke` | Revoking API keys from the developer console, merchant Settings and Admin. | New | none | run |
| 97 | `20270104080100_sandbox_booking_status` | Test bookings that move through their statuses. | New | config rows: wiring_audit_exempt | run |
| 98 | `20270105000100_fraud_checks` | Fraud checks: one queue for every kind of flag, filled by checks that run | New | **live rows:** update fraud_signal; config rows: action_registry, fraud_rule; **column type change:** fraud_rule; **column type change:** fraud_signal; **starts job:** fraud-checks; **runs a fraud sweep at once** | run |
| 99 | `20270105020100_api_catalogue_write_scope` | A permission of its own for updating a merchant's catalogue through the API. | New | none | run |
| 100 | `20270105020200_api_catalogue_items` | Updating a merchant's catalogue through the API: PATCH /v1/catalog/items/{id} | New | config rows: action_registry | run |
| 101 | `20270105020300_api_catalogue_audit_module` | The catalogue audit action belongs to the Settings module. | New | config rows: action_registry | run |
| 102 | `20270105030100_api_rider_milestones` | Rider milestones in order events: every stage of a booking, and its rider. | New | config rows: wiring_audit_exempt | run |
| 103 | `20270106000100_cron_run_log_trim` | The scheduler's run log keeps its last 30 days. | New | **starts job:** cron-run-log-trim | run |
| 104 | `20270106010100_company_folder_tree` | Company files: folders inside folders, and the twelve folders NexG files by. | New | none | run |
| 105 | `20270106020100_close_internal_helpers` | Internal helpers that any signed-in account could call directly. | New | none | run |
| 106 | `20270106030100_api_delivery_check` | The API's "can you deliver here?" check. | New | config rows: wiring_anon_allow | run |
| 107 | `20270106050100_api_catalogue_bulk` | Bulk catalogue updates through the API. | New | config rows: wiring_audit_exempt | run |
| 108 | `20270106060100_ledger_fixes` | Ledger and Finance fixes found while the Finance pages were rebuilt. | New | config rows: account | run |
| 109 | `20270107100100_operations_dashboard` | Operations dashboard: every live order, stay, experience day, delivery and | New | none | run |
| 110 | `20270107100200_merchant_verification` | merchant verification | New | none | run |
| 111 | `20270107100300_merchant_catalogues` | merchant catalogues | New | config rows: action_registry | run |
| 112 | `20270107100400_merchant_performance` | merchant performance | New | none | run |
| 113 | `20270107100500_merchant_payouts` | merchant payouts | New | none | run |
| 114 | `20270107100600_catalogue_edit_review_fix` | catalogue edit review fix | New | none | run |
| 115 | `20270108300100_finance_report_readers` | Finance → Reports: the Riders and Customers tabs. | New | none | run |
| 116 | `20270108300200_finance_statement_import` | Finance → Reconciliations → New Reconciliation: statement imports. | New | config rows: action_registry, buckets | run |
| 117 | `20270108300300_finance_client_invoices` | Client invoices: Finance → Invoices → Create Invoice. | New | config rows: account, action_registry, buckets | run |
| 118 | `20270108300500_ledger_partner_party` | Experience partners become a party on the ledger. | New | none | run |
| 119 | `20270108300600_experience_partner_payouts` | Experience partners are paid in the weekly settlement run. | New | config rows: account, action_registry | run |
| 120 | `20270109000100_guest_orders` | Customers can order without an account. | Superseded by `20270130009000` | none | run (harmless) |
| 121 | `20270109000200_maps_rider_sharing` | Foreground sharing keeps one current pose for one current assignment. | New | config rows: wiring_audit_exempt; **starts job:** maps-rider-sharing-expire | run |
| 122 | `20270109000300_order_stages` | Delivery orders move through their stages, and a guest sees the map. | New | config rows: action_registry | run |
| 123 | `20270110000100_merchant_team_invites_accepted` | A team invitation can be accepted, and only an owner changes the team. | New | config rows: action_registry | run |
| 124 | `20270110000200_merchant_readiness_sees_setup_screens` | Readiness and Home see the hours and payout the setup screens save. | New | none | run |
| 125 | `20270110000300_application_review_timeouts` | The application review function keeps its timeouts. | New | none | run |
| 126 | `20270110410100_merchant_onboarding_template` | Merchant onboarding follows the owner's data-collection template | New | config rows: action_registry, document_requirement | run |
| 127 | `20270115000100_rider_location_stale_reason` | A rider whose last position is old is skipped, and says why. | New | config rows: definition | run |
| 128 | `20270115000200_rider_offers_and_location` | Riders can be found, see their offers, and the shop's "ready" reaches them. | New | config rows: wiring_audit_exempt | run |
| 129 | `20270115000300_rider_fixes` | Rider fixes: what the rider portal and the Rider app found broken or missing. | New | config rows: action_registry, wiring_audit_exempt | run |
| 130 | `20270115000400_rider_delivery` | The rider's delivery, end to end: arrive, wait, collect, contact, cash, | New | config rows: action_registry, buckets, definition, wiring_audit_exempt | run |
| 131 | `20270115000500_rider_payouts_and_phone` | Rider money and phone, by the owner's rules (19 Nov 2026): | New | config rows: action_registry, definition | run |
| 132 | `20270115000600_handover_codes` | One code per handover: whoever receives shows it, whoever hands over enters it. | New | config rows: action_registry, definition, wiring_audit_exempt | run |
| 133 | `20270116000100_catalogue_selling` | What the Consumer app needs to show and sell an item. | New | config rows: action_registry | run |
| 134 | `20270116000200_customer_account_deletion` | Customer account deletion from the Consumer app (Apple guideline 5.1.1(v); | New | config rows: action_registry, wiring_audit_exempt | run |
| 135 | `20270116000300_app_bookings` | Bookings made from the Consumer app through the booking engine. | New | none | run |
| 136 | `20270116000400_bookings_paid_first` | Guests can book once they pay; nothing is confirmed before it is paid; | New | config rows: action_registry | run |
| 137 | `20270116000500_engine_booking_privacy` | App bookings in the booking engine: the booking code, the reservation name | New | none | run |
| 138 | `20270116000600_simulated_booking_payments` | Test payments for bookings, while no payment provider is connected. | New | config rows: action_registry, definition | run |
| 139 | `20270116000700_customer_account_controls` | Customer account controls carried forward from PR #132 (consumer/account-controls, | New | config rows: wiring_audit_exempt | run |
| 140 | `20270116000800_catalogue_variants` | Product variants: versions of one item that each have their own price and | New | config rows: action_registry | run |
| 141 | `20270116000900_order_place_once` | Placing an order twice by accident. | New | none | run |
| 142 | `20270117000100_payments_on_the_ledger` | Stay and featured-slot payments on the ledger. | New | config rows: account, action_registry | run |
| 143 | `20270120000100_native_push` | Phone push for the Consumer, Stays and Rider apps: plain alerts, iPhone Live | New | config rows: action_registry; **starts job:** native-push-dispatch, native-push-reminders, native-push-retention; can call outside services (from its job or function) | run |
| 144 | `20270121000100_offering_setup_to_catalogue` | What merchants entered in the offerings editor now reaches the catalogue the | New | config rows: action_registry | run |
| 145 | `20270122000100_host_payouts` | Hosts are paid in the weekly settlement run. | New | config rows: action_registry, payout_rail | run |
| 146 | `20270122900100_rider_one_offer_per_rider` | One rider, one offer: a rider standing where two delivery zones overlap was | New | none | run |
| 147 | `20270123000100_native_stay_checkout` | Booking a stay from the Consumer and Stays apps, carried over from PR #148 | New | config rows: action_registry, wiring_audit_exempt | run |
| 148 | `20270124000100_merchant_approve_first` | Approve first: a merchant applies with the basics, NexG approves, and the | New | config rows: notification_email_kind; **starts job:** merchant-setup-reminders | run |
| 149 | `20270124000200_host_payout_notices` | Hosts hear about their payouts, cancellations and payout details. | New | none | run |
| 150 | `20270125000100_host_listing_details_and_publish` | Complete listings: a host enters everything the NEXG Stays guest app shows, | New | **live rows:** update unit; config rows: action_registry | run |
| 151 | `20270126000100_onboarding_drop_county_and_owner_id` | The onboarding details no longer ask for the county of operation or the | New | none | run |
| 152 | `20270126000200_onboarding_documents` | Merchant documents while onboarding (owner's request, 20 Nov 2026). | New | config rows: document_requirement | run |
| 153 | `20270126000300_merchant_any_csv_import` | "Upload any CSV", phase 1 (owner's request, 20 Nov 2026). | New | config rows: action_registry, buckets | run |
| 154 | `20270127000100_email_designs` | Email designs: an uploaded design for each kind of email NexG sends. | New | config rows: action_registry, buckets | run |
| 155 | `20270128000100_customer_order_actions` | What a customer can do with their own order on the website. | New | config rows: action_registry | run |
| 156 | `20270128000200_app_emails` | Customer emails for the phone apps (NexG and NexG Stays), on the email system | New | config rows: email_route; **starts job:** app-email-reminders | run |
| 157 | `20270128000300_app_email_templates` | Generated by scripts/app-emails/sync.mjs from the Consumer app's docs/email-templates. | Superseded by `20270128000700` | none | run (harmless) |
| 158 | `20270128000400_app_email_sender` | Every app email group sends from NEXG Concierge <no-reply@nexgapp.com>, replies to | New | config rows: email_route | run |
| 159 | `20270128000500_app_email_templates` | Generated by scripts/app-emails/sync.mjs from the Consumer app's docs/email-templates. | Superseded by `20270128000700` | none | run (harmless) |
| 160 | `20270128000600_app_email_templates` | Generated by scripts/app-emails/sync.mjs from the Consumer app's docs/email-templates. | Superseded by `20270128000700` | none | run (harmless) |
| 161 | `20270128000700_app_email_templates` | Generated by scripts/app-emails/sync.mjs from the Consumer app's docs/email-templates. | New | none | run |
| 162 | `20270129000100_sold_out_items` | R31, part 1: an item can be sold out and still be shown, marked as such. | New | none | run |
| 163 | `20270129000200_paystack_collections` | Paystack collections, slice 1: an order is paid by card, M-Pesa or Airtel | New | config rows: action_registry, wiring_anon_allow, wiring_audit_exempt; **starts job:** paystack-sweep; can call outside services (from its job or function) | run |
| 164 | `20270130000100_catalogue_details` | R32 and R35 from the merchant alignment: how an item is priced, how long it | New | none | run |
| 165 | `20270130000200_signup_choices_and_messages` | R33 from the merchant alignment: what a shop said at sign-up becomes real | New | none | run |
| 166 | `20270130000300_min_order_and_public_answers` | R34 and R36 from the merchant alignment: a shop's minimum order, and the | New | **live rows:** update merchant; config rows: action_registry | run |
| 167 | `20270130000400_digital_delivery` | R37 from the merchant alignment: digital delivery, for an eSIM ("telecom | New | config rows: action_registry | run |
| 168 | `20270130000500_buyer_id` | R37, part 2: an eSIM sale takes the buyer's ID. The owner, 22 Nov 2026: | New | config rows: action_registry; **starts job:** purge-order-buyer-ids | run |
| 169 | `20270130009000_order_together` | Order together: friends fill one basket from one shop, and the host places | New | config rows: action_registry | run |
| 170 | `20270130009200_digital_orders_for_shops` | R38, part 1: the shop's Work page sends the code for a digital order. | New | none | run |
| 171 | `20270130009300_editor_booking_link` | R38, part 2: the offerings editor links an item to its booking. | New | none | run |
| 172 | `20270130009400_guest_road_times` | R42 (Explore B4): guests get road times for one complete Explore plan. | New | none | run |
| 173 | `20270130009500_bulk_opening_hours` | R39 (Explore H1): opening hours for many shops on a chosen date, in one call. | New | config rows: wiring_anon_allow | run |
| 174 | `20270130009600_nexg_ratings` | R41 (Explore R1): shops' star ratings come from NexG customers. | New | none | run |
| 175 | `20270130009700_merchant_brand_images` | Brand logo and banner photo for live businesses. | New | config rows: buckets | run |
| 176 | `20270130009800_merchant_idle_minutes` | Merchant workspace: sign out after 7 minutes without activity. | New | config rows: definition, version | run |
| 177 | `20270130009900_onboarding_number_field` | Onboarding template: a number field, for answers that must be digits only. | New | none | run |
| 178 | `20270131000100_merchant_self_suspend` | Merchants can suspend their own business from Settings, and resume it. | New | config rows: action_registry | run |
| 179 | `20270131000200_audit_devices_and_merchant_trail` | Which device did what, and a merchant trail only staff can read. | New | config rows: action_registry; **starts job:** purge-audit-ips | run |
| 180 | `20270131000500_merchant_live_email` | The owner hears that the business is live, with the signed agreement. | New | config rows: action_registry; **starts job:** merchant-live-emails | run |
| 181 | `20270131000600_merchant_idle_only_for_merchants` | The merchant workspace's session limits are for the merchant workspace. | New | none | run |
| 182 | `20270131000650_merchant_live_notice` | Going live: one email, and a bell that is true. | New | config rows: notification_email_kind | run |
| 183 | `20270131000700_audit_sign_out_device` | Signing out one device from the Audit log's Devices tab. | New | none | run |
| 184 | `20270203000100_fx_rates` | Display exchange rates for the customer website's currency picker. | New | **starts job:** fx-rates; can call outside services (from its job or function) | run |
| 185 | `20270203000500_developer_console_session` | The developer console keeps a merchant's sign-in alive while it is used. | New | config rows: wiring_audit_exempt | run |
| 186 | `20270203000600_merchant_several_businesses` | One sign-in may own several businesses (merchant_user, one row each), and | New | none | run |
| 187 | `20270203000700_rider_stage_actions` | Rider pipeline: record the background check and the test delivery. | New | none | run |
| 188 | `20270203009700_precise_branch_locations` | Precise branch locations: every place a merchant adds or edits a branch now | New | **live rows:** update merchant_branch | run |
| 189 | `20270215000100_paystack_saved_cards` | Paystack, saved cards (owner, 22 Nov 2026: "Saved cards next"). | New | config rows: action_registry, wiring_audit_exempt | run |
| 190 | `20270216000100_account_basket` | One basket per account, shared by the website and every app (shared | New | config rows: wiring_audit_exempt | run |
| 191 | `20270220000100_every_unit_in_a_property` | Every unit sits in exactly one property. | New | **live rows:** update unit; config rows: action_registry | run |
| 192 | `20270221000100_order_steps` | Order steps: one table of who moves an order, and to where (shared services | New | none | run |
| 193 | `20270222000100_paystack_bookings` | Paystack, bookings and deposits (owner, 22 Nov 2026: "Deposits now"). | New | config rows: action_registry, wiring_anon_allow; can call outside services (from its job or function) | run |
| 194 | `20270222000200_paystack_stays` | Paystack, stays (owner, 22 Nov 2026: stays paid in full at booking, through | New | none | run |
| 195 | `20270222000300_stay_cancellation_policies` | Stay cancellation policies, set by each host (owner, 22 Nov 2026: "NEXG | New | config rows: action_registry | run |
| 196 | `20270222000400_paystack_refunds` | Paystack, refunds (Paystack slice 6; owner, 22 Nov 2026: "Yes, refunds next"). | New | config rows: action_registry, wiring_audit_exempt | run |
| 197 | `20270222000500_paystack_review` | Paystack, Apple review (Paystack slice 7, owner 22 Nov 2026: "Yes, Apple next"). | New | none | run |
| 198 | `20270222100100_make_super_admin` | Make admin: a super admin makes another person super admin in one step. | New | config rows: action_registry | run |
| 199 | `20270223000100_merchant_order_decline` | A shop can decline an order it cannot take (owner, 22 Nov 2026: "yes, as | New | config rows: action_registry | run |
| 200 | `20270223100100_pets_category_enum` | Pets becomes NexG's 22nd merchant category (owner, 23 Nov 2026). | New | none | run |
| 201 | `20270223100200_pets_category` | Pets: NexG's 22nd merchant category (owner, 23 Nov 2026). | New | config rows: category_config, document_requirement, merchant_application_registry | run |
| 202 | `20270224000100_rider_portal_offers_replies_points` | Rider portal, second round of mockups: what the new screens need from | New | none | run |
| 203 | `20270225000100_link_guest_orders_by_phone` | A customer who confirms their phone by SMS code gets the orders they placed | New | config rows: action_registry | run |
| 204 | `20270225000200_rider_message_reply_wiring` | The wiring gate (fn_wiring_check, test 26) found one critical: | New | config rows: wiring_audit_exempt | run |
| 205 | `20270225000300_payout_rules_riders` | Payout rules, riders first (owner, 23 Nov 2026: "PAYOUTS SHOULD HAVE A | New | config rows: definition | run |
| 206 | `20270225000400_paystack_transfers_riders` | Paystack transfers, riders first (payouts slice R2a; owner, 23 Nov 2026: | New | config rows: action_registry, wiring_audit_exempt | run |
| 207 | `20270227000100_merchant_facts_for_apps` | Merchant facts the apps asked for (R8, shared services; owner 23 Nov 2026: | New | config rows: action_registry | run |
| 208 | `20270227000200_plan_block_merchant` | An Explore plan's stop says which shop it is at (R9, shared services; owner | New | none | run |
| 209 | `20270227000300_recent_categories_bookings_stays` | Recent categories count bookings and stays too (R8 follow-up, owner 23 Nov | New | none | run |
| 210 | `20270227000400_functions_that_could_not_run` | Seven functions that could not run. | New | none | run |
| 211 | `20270228000100_host_guide_asset_code_optional` | A guide's plan or model can be opened without a share code, as main has always defined it. | New, this PR: the default live lacks | none | run |
| 212 | `20270228000200_connector_connection_session_gate` | connector_connection gets the merchant application session gate on live too. | New, this PR: the policy live would lack | none | run |
