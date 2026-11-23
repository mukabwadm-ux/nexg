#!/usr/bin/env node
// Compare two pg_dump --schema-only files statement by statement:
// a database built fresh from main, and live after the rehearsed rollout.
//
//   node scripts/live-rollout-schema-diff.mjs <fresh.sql> <rehearsed.sql>
//
// Every difference must be listed in supabase/live-history/rollout-expected-schema-diff.json
// (the live-only changes main lacks, each with its reason). Anything else fails:
// it would mean the rollout leaves live different from main in a way nobody chose.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { splitSql } from './lib/sql-statements.mjs';

const [freshPath, rehearsedPath] = process.argv.slice(2);
const EXPECTED = 'supabase/live-history/rollout-expected-schema-diff.json';
const label = (s) => s.head.replace(/ \$body\$.*/, '').slice(0, 160);
const load = (p) => splitSql(readFileSync(p, 'utf8'));
const fresh = load(freshPath);
const rehearsed = load(rehearsedPath);
const fh = new Set(fresh.map((s) => s.hash));
const rh = new Set(rehearsed.map((s) => s.hash));
const onlyLive = rehearsed.filter((s) => !fh.has(s.hash)).map(label);
const onlyMain = fresh.filter((s) => !rh.has(s.hash)).map(label);

const expected = existsSync(EXPECTED)
  ? JSON.parse(readFileSync(EXPECTED, 'utf8'))
  : { onlyLive: [], onlyMain: [] };
const match = (list, l) => list.some((e) => l.startsWith(e.statement));
const unexpected = [
  ...onlyLive
    .filter((l) => !match(expected.onlyLive, l))
    .map((l) => `only live after the rollout: ${l}`),
  ...onlyMain
    .filter((l) => !match(expected.onlyMain, l))
    .map((l) => `only in a database built from main: ${l}`),
];
const missing = [
  ...expected.onlyLive
    .filter((e) => !onlyLive.some((l) => l.startsWith(e.statement)))
    .map((e) => `expected only live, not found: ${e.statement}`),
  ...expected.onlyMain
    .filter((e) => !onlyMain.some((l) => l.startsWith(e.statement)))
    .map((e) => `expected only in main, not found: ${e.statement}`),
];

const lines = [
  `### Live after the rollout, compared with a database built from main`,
  '',
  `${onlyLive.length} statements only live, ${onlyMain.length} only in main.`,
  '',
  ...onlyLive.map((l) => `- live only: \`${l}\``),
  ...onlyMain.map((l) => `- main only: \`${l}\``),
];
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');

for (const u of [...unexpected, ...missing]) console.error(`::error::${u}`);
if (unexpected.length || missing.length) {
  console.error(`\n${unexpected.length + missing.length} schema difference(s) not in ${EXPECTED}.`);
  process.exit(1);
}
console.log('Every difference is a known live-only change.');
