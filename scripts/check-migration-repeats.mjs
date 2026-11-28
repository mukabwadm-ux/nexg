#!/usr/bin/env node
// Refuses migrations that repeat each other or reuse an id, against main AND
// against what the live database has run (supabase/live-history).
//
//   node scripts/check-migration-repeats.mjs            # check
//   node scripts/check-migration-repeats.mjs --report   # also print every repair with its proof
//
// Compares by what the SQL does, not by file name: every file is split into
// statements (comments dropped, whitespace collapsed, dollar-quoted bodies kept
// exactly) and compared statement by statement.
//
// Rules:
//   1. No two migration files have the same statements.
//   2. No migration consists only of statements an earlier migration (or the
//      live database's archived history) already ran. Grants, revokes and
//      comments do not count either way.
//   3. An id names one migration: not two files, and not a file and a different
//      migration the live database ran under that id (live-versions-*.json).
//      The three clashes that already exist are listed, with their reason and
//      repair, in supabase/live-history/rollout-2026-11-23.json ("sharedIds").
//   4. A migration may be marked as already applied on live ("markApplied") only
//      when the live version's SQL (by md5, the value `supabase_migrations`
//      returns) contains every statement of the file, apart from differences
//      that are listed and explained. And every live version whose statements a
//      main file fully contains must be in that list, so a repeat cannot be run.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { splitSql } from './lib/sql-statements.mjs';

const DIR = 'supabase/migrations';
const HISTORY = 'supabase/live-history';
const report = process.argv.includes('--report');
const errors = [];
const md5 = (s) => createHash('md5').update(s).digest('hex');

const TRIVIAL =
  /^(grant|revoke|comment|alter (function|procedure|default privileges)|set |reset |notify|analyze)/;
const counts = (stmts) => stmts.filter((s) => !TRIVIAL.test(s.head));

// ── inputs ───────────────────────────────────────────────────────────────────
const NAME = /^(\d{14})_([a-z0-9_]+)\.sql$/;
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => {
    const m = NAME.exec(f);
    const stmts = splitSql(readFileSync(`${DIR}/${f}`, 'utf8'));
    return { f, id: m?.[1] ?? f.slice(0, 14), name: m?.[2] ?? '', stmts };
  });

const plan = JSON.parse(readFileSync(`${HISTORY}/rollout-2026-11-23.json`, 'utf8'));
const live = [];
for (const h of readdirSync(HISTORY)
  .filter((f) => f.endsWith('-block.json'))
  .sort()) {
  for (const m of JSON.parse(readFileSync(`${HISTORY}/${h}`, 'utf8'))) {
    const sqlMd5 = md5(m.statements.join('\n'));
    if (sqlMd5 !== m.sql_md5)
      errors.push(`${h}: ${m.version} statements do not hash to its recorded sql_md5`);
    const stmts = m.statements.flatMap((s) => splitSql(s + ';'));
    live.push({ id: m.version, name: m.name, sqlMd5, stmts, src: h });
  }
}
const shared = new Map(plan.sharedIds.map((s) => [s.id, s]));

// ── 1. same content twice ────────────────────────────────────────────────────
const byContent = new Map();
for (const x of files) {
  const k = md5(x.stmts.map((s) => s.key).join('\n'));
  if (byContent.has(k)) errors.push(`${x.f} has the same statements as ${byContent.get(k)}`);
  else byContent.set(k, x.f);
}

// ── 2. a migration that only repeats what already ran ───────────────────────
// (Against live's archived history, see rule 4.)
const marked = new Map(plan.markApplied.map((m) => [m.version, m]));
const seen = new Map(); // statement hash -> the earlier file that ran it
for (const x of files) {
  const real = counts(x.stmts);
  const earlier = real.map((s) => seen.get(s.hash)).filter(Boolean);
  if (real.length && earlier.length === real.length)
    errors.push(
      `${x.f} only repeats statements earlier migrations already ran (${[...new Set(earlier)].slice(0, 3).join(', ')}). ` +
        'Delete it or make it do something new.',
    );
  for (const s of x.stmts) if (!seen.has(s.hash)) seen.set(s.hash, x.f);
}

// ── 3. one id, one migration ─────────────────────────────────────────────────
const idNames = new Map();
const note = (id, name, where) => {
  if (!idNames.has(id)) idNames.set(id, new Map());
  idNames.get(id).set(name, where);
};
for (const x of files) note(x.id, x.name, 'main');
for (const l of live) note(l.id, l.name, `live (${l.src})`);
// Every version the live database has recorded, by name: an id live ran under
// one name must never be given to a file of another name.
for (const h of readdirSync(HISTORY).filter((f) => /^live-versions-.*\.json$/.test(f))) {
  for (const v of JSON.parse(readFileSync(`${HISTORY}/${h}`, 'utf8')))
    note(v.version, v.name, `live (${h})`);
}
for (const [id, names] of idNames) {
  if (names.size < 2) continue;
  const s = shared.get(id);
  const listed = s && [...names.keys()].every((n) => s.names.includes(n));
  if (!listed)
    errors.push(
      `id ${id} is used by more than one migration: ${[...names].map(([n, w]) => `${n} (${w})`).join(', ')}. ` +
        'Migration ids are never reused: pick a new id after the latest on main.',
    );
}

// ── 4. marked applied only with proof, and every repeat marked ──────────────
const liveById = new Map(live.map((l) => [l.id, l]));
const fileById = new Map(files.map((x) => [x.id, x]));
const proofs = [];
for (const m of plan.markApplied) {
  const x = fileById.get(m.version);
  const l = liveById.get(m.equalsLive);
  if (!x || !l) {
    errors.push(
      `markApplied ${m.version}: ${!x ? 'no such file on main' : `no live version ${m.equalsLive}`}`,
    );
    continue;
  }
  if (l.sqlMd5 !== m.liveSqlMd5)
    errors.push(
      `markApplied ${m.version}: live ${l.id} hashes to ${l.sqlMd5}, not ${m.liveSqlMd5}`,
    );
  const lh = new Set(l.stmts.map((s) => s.hash));
  const xh = new Set(x.stmts.map((s) => s.hash));
  const mainOnly = x.stmts.filter((s) => !lh.has(s.hash));
  const liveOnly = l.stmts.filter((s) => !xh.has(s.hash));
  const allowed = m.differences ?? [];
  for (const s of mainOnly) {
    const ok = allowed.find((d) => s.head.includes(d.object.toLowerCase()));
    if (!ok)
      errors.push(
        `markApplied ${m.version}: main has a statement live ${l.id} never ran: ${s.head.slice(0, 120)}`,
      );
  }
  for (const s of liveOnly) {
    const ok = allowed.find((d) => s.head.includes(d.object.toLowerCase()));
    if (!ok)
      errors.push(
        `markApplied ${m.version}: live ${l.id} ran a statement main's file lacks: ${s.head.slice(0, 120)}`,
      );
  }
  proofs.push(
    `${m.version} = live ${l.id} (${l.name}), sql_md5 ${l.sqlMd5}, ${x.stmts.length - mainOnly.length}/${x.stmts.length} statements identical` +
      (mainOnly.length ? `; differs only in ${allowed.map((d) => d.object).join(', ')}` : ''),
  );
}
// Every file after the live head that holds (all but at most one of) a live
// version's statements must be marked applied: otherwise the push runs it again.
for (const l of live) {
  const lh = counts(l.stmts).map((s) => s.hash);
  if (!lh.length) continue;
  for (const x of files) {
    if (x.id <= plan.liveHead || marked.has(x.id)) continue;
    const xh = new Set(x.stmts.map((s) => s.hash));
    const shared = lh.filter((h) => xh.has(h)).length;
    if (shared && shared >= lh.length - 1 && shared * 2 > lh.length)
      errors.push(
        `${x.f} repeats live ${l.id}_${l.name} (${shared}/${lh.length} statements): add it to markApplied, or running it on live fails or runs twice.`,
      );
  }
}
const reverted = new Set(plan.revert.map((r) => r.version));
for (const l of live)
  if (!reverted.has(l.id)) errors.push(`live ${l.id} is not in the rollout's revert list`);

if (report) {
  console.log('Repairs, each with its proof:');
  for (const r of plan.revert) console.log(`  revert  ${r.version}  ${r.reason}`);
  for (const p of proofs) console.log(`  applied ${p}`);
}
if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  console.error(
    `\n${errors.length} repeat or id problem(s). See docs/database/live-rollout-2026-11-23.md.`,
  );
  process.exit(1);
}
console.log(
  `${files.length} migrations and ${live.length} archived live versions: nothing repeats, every id names one migration, ` +
    `${plan.markApplied.length} marked-applied repairs proven by content.`,
);
