#!/usr/bin/env node
/**
 * pnpm test:e2e runs this first.
 *
 * A Playwright spec outside `e2e/` is not a failing test. It is
 * a test that never runs, and nothing says so: Playwright only
 * looks inside the `testDir` of one of its projects, and the
 * suite it cannot see simply does not appear in the count.
 *
 * That is not hypothetical. `apps/web/tests/
 * location-consent.spec.ts` — thirty-odd assertions proving
 * nothing touches `navigator.geolocation` without a click, the
 * guard the web ESLint config calls "worth two" — sat there
 * unrun. Vitest collected it instead, where a Playwright file
 * cannot even be parsed, and the resulting error read like a
 * tooling misconfiguration rather than a switched-off guard.
 *
 * So: any file that imports `@playwright/test` must live under
 * a directory Playwright actually searches. Cheap, and it fails
 * loudly on the one mistake that otherwise fails silently.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PLAYWRIGHT_ROOT = 'e2e/';

const tracked = execFileSync('git', ['ls-files', '*.spec.ts', '*.spec.tsx', '*.test.ts', '*.test.tsx'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

const stranded = tracked.filter((file) => {
  if (file.startsWith(PLAYWRIGHT_ROOT)) return false;
  let source = '';
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  return /from\s+['"]@playwright\/test['"]/.test(source);
});

if (stranded.length > 0) {
  console.error('✗ Playwright specs outside the e2e tree — these never run:\n');
  for (const file of stranded) console.error(`    ${file}`);
  console.error(
    `\n  Move them under ${PLAYWRIGHT_ROOT} (e2e/web or e2e/admin, whichever app they` +
      '\n  drive), or give them a project with their own testDir in' +
      '\n  playwright.config.ts. A spec Playwright cannot see reports nothing,' +
      '\n  which reads exactly like a spec that passed.\n',
  );
  process.exit(1);
}

console.log(`✓ All ${tracked.length} spec files are somewhere a runner will find them.`);
