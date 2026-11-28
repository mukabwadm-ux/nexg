#!/usr/bin/env node
// The 23 Nov 2026 live rollout, as data (supabase/live-history/rollout-2026-11-23.json).
// Used by the CI rehearsal and by the owner's runbook, so the repair lines and the
// list of migrations to push are never typed by hand.
//
//   node scripts/live-rollout-2026-11-23.mjs prepare <dir>   # write live's 11 Nov migrations into <dir>
//   node scripts/live-rollout-2026-11-23.mjs repairs [flags]  # the two repair commands, with their proof
//   node scripts/live-rollout-2026-11-23.mjs expected         # the versions `db push --include-all` must list, in order
//
// Run scripts/check-migration-repeats.mjs first: it proves every "applied" repair
// by content, and this script trusts the manifest it checked.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const DIR = 'supabase/migrations';
const HISTORY = 'supabase/live-history';
const plan = JSON.parse(readFileSync(`${HISTORY}/rollout-2026-11-23.json`, 'utf8'));
const liveVersions = JSON.parse(readFileSync(`${HISTORY}/live-versions-2026-11-23.json`, 'utf8'));
const block = JSON.parse(readFileSync(`${HISTORY}/20261111-block.json`, 'utf8'));
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const fileById = new Map(files.map((f) => [f.slice(0, 14), f]));

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'prepare') {
  // Live's history, rebuilt: main's own file where live ran it under the same
  // name (scripts/check-migration-repeats.mjs and the rehearsal prove they match),
  // and the archived SQL for the 20261111 block, which is in no file on main.
  const out = rest[0];
  if (!out) throw new Error('prepare needs a directory');
  mkdirSync(out, { recursive: true });
  const blockById = new Map(block.map((m) => [m.version, m]));
  for (const v of liveVersions) {
    const b = blockById.get(v.version);
    if (b) {
      writeFileSync(`${out}/${v.version}_${v.name}.sql`, b.statements.join(';\n') + ';\n');
      continue;
    }
    const f = fileById.get(v.version);
    if (!f || f !== `${v.version}_${v.name}.sql`)
      throw new Error(`live ${v.version}_${v.name} has no matching file on main (${f ?? 'none'})`);
    writeFileSync(`${out}/${f}`, readFileSync(`${DIR}/${f}`));
  }
  console.log(`${liveVersions.length} migrations written to ${out} (live's state on 11 Nov).`);
} else if (cmd === 'repairs') {
  const flags = rest.join(' ');
  console.log(
    "# 1. Take live's 20261111 block out of the history table. Schema and data are untouched.",
  );
  for (const r of plan.revert)
    console.log(`#    ${r.version}  sql_md5 ${r.liveSqlMd5}  ${r.liveName}`);
  console.log(
    `supabase migration repair --status reverted ${plan.revert.map((r) => r.version).join(' ')} ${flags}`.trim(),
  );
  console.log(
    "# 2. Record main's files that live already ran under the old numbers (proof: same SQL, by md5 and statement by statement).",
  );
  for (const m of plan.markApplied)
    console.log(
      `#    ${m.version} = live ${m.equalsLive}  sql_md5 ${m.liveSqlMd5}${m.differences ? `  (differs only in ${m.differences.map((d) => d.object).join(', ')})` : ''}`,
    );
  console.log(
    `supabase migration repair --status applied ${plan.markApplied.map((m) => m.version).join(' ')} ${flags}`.trim(),
  );
} else if (cmd === 'expected') {
  const kept = new Set(liveVersions.map((v) => v.version));
  for (const r of plan.revert) kept.delete(r.version);
  for (const m of plan.markApplied) kept.add(m.version);
  for (const f of files) if (!kept.has(f.slice(0, 14))) console.log(f.slice(0, -4));
} else {
  console.error('usage: live-rollout-2026-11-23.mjs prepare <dir> | repairs [flags] | expected');
  process.exit(2);
}
