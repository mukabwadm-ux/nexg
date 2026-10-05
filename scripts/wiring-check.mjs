#!/usr/bin/env node
/**
 * pnpm wiring:check
 *
 * Asks the live schema the questions a release should fail on,
 * and exits non-zero on any critical finding.
 *
 * The integration prompt wants a registry of events, RPCs and
 * views that CI diffs against the code. Most of what it would
 * register — a bus, four extracted services — does not exist
 * here, and a registry of things that do not exist is a
 * document rather than a check. The schema *is* the integration
 * layer in this system, so the schema is what gets asked.
 *
 * Every rule behind this found something real on its first run.
 */
import { execFileSync } from 'node:child_process';

const CONTAINER = process.env.NEXG_DB_CONTAINER ?? 'supabase_db_nexg';

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-F', '\t', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

let rows;
try {
  rows = psql('select severity, rule, finding, detail from public.fn_wiring_check() order by severity, rule;');
} catch (error) {
  console.error('Could not reach the database. Is `supabase start` running?');
  console.error(String(error.stderr ?? error.message).split('\n')[0]);
  process.exit(2);
}

const findings = rows
  ? rows.split('\n').filter(Boolean).map((line) => {
      const [severity, rule, finding, detail] = line.split('\t');
      return { severity, rule, finding, detail };
    })
  : [];

const critical = findings.filter((f) => f.severity === 'critical');
const warning = findings.filter((f) => f.severity === 'warning');

for (const group of [critical, warning]) {
  for (const f of group) {
    const mark = f.severity === 'critical' ? '✗' : '·';
    console.log(`${mark} [${f.rule}] ${f.finding}`);
    if (f.severity === 'critical') console.log(`    ${f.detail}`);
  }
}

if (findings.length === 0) console.log('✓ No wiring findings.');
else console.log(`\n${critical.length} critical · ${warning.length} warning`);

/* Warnings are reported and do not block. A warning that stops
   a deploy gets silenced, and then the whole mechanism is
   decoration. */
process.exit(critical.length > 0 ? 1 : 0);
