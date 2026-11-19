#!/usr/bin/env node
// Refuses migration mistakes before the slow database jobs run.
//
//   node scripts/check-migration-ids.mjs              # names and duplicate ids only
//   node scripts/check-migration-ids.mjs origin/main  # also compare with a base branch
//
// With a base, a branch may only ADD migrations, and each new one must sort after
// the base's latest. Migrations already on the base are never renamed, edited or
// deleted (README, "Database"): a database that has applied one would drift.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const DIR = 'supabase/migrations';
const NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;
const base = process.argv[2];
const errors = [];

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const byId = new Map();
for (const f of files) {
  const m = NAME.exec(f);
  if (!m) {
    errors.push(`${f}: name must be <14-digit id>_<lower_snake_case>.sql`);
    continue;
  }
  byId.set(m[1], [...(byId.get(m[1]) ?? []), f]);
}
for (const [id, names] of byId) {
  if (names.length > 1) errors.push(`id ${id} is used by more than one file: ${names.join(', ')}`);
}

if (base) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const baseFiles = git('ls-tree', '--name-only', `${base}:${DIR}`)
    .split('\n')
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const baseIds = new Set(baseFiles.map((f) => f.slice(0, 14)));
  const latest = baseFiles.at(-1)?.slice(0, 14) ?? '';

  const changed = git('diff', '--name-status', '--no-renames', `${base}...HEAD`, '--', DIR)
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));
  for (const [status, path] of changed) {
    const f = path.slice(DIR.length + 1);
    if (status !== 'A') {
      errors.push(
        `${f}: already on ${base} and ${status === 'D' ? 'deleted' : 'changed'} here. ` +
          'Never edit or remove a migration that has merged; add a new one instead.',
      );
      continue;
    }
    const id = f.slice(0, 14);
    if (baseIds.has(id)) {
      errors.push(`${f}: id ${id} already exists on ${base}. Pick an id after ${latest}.`);
    } else if (id <= latest) {
      errors.push(`${f}: id ${id} is older than ${base}'s latest (${latest}). Pick a later id.`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  console.error(`\n${errors.length} migration problem(s). See README, "Database".`);
  process.exit(1);
}
console.log(`${files.length} migrations, ids unique${base ? `, new ones after ${base}` : ''}.`);
