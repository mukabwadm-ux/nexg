import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const onlyTests = process.argv.includes('--tests');
const onlyTypes = process.argv.includes('--types');
const selected = process.argv
  .find((arg) => arg.startsWith('--package='))
  ?.slice('--package='.length);
const knownPackages = [
  'packages/booking-config',
  'packages/booking-google',
  'apps/booking-engine',
  'apps/web',
];
if (selected && !knownPackages.includes(selected))
  throw new Error('Choose a known booking package.');
const packages = selected ? [selected] : knownPackages;
const results = [];
await mkdir(resolve(root, '.booking-local'), { recursive: true });

async function run(label, directory, args) {
  console.log(`\n${label}`);
  const started = Date.now();
  const code = await new Promise((done) => {
    const child = spawn(process.execPath, args, {
      cwd: resolve(root, directory),
      env: { ...process.env, CI: '1' },
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', (error) => {
      console.error(error.message);
      done(1);
    });
    child.once('exit', (code) => done(code ?? 1));
  });
  results.push({ label, code, durationMs: Date.now() - started });
  await writeFile(
    resolve(root, '.booking-local/verification.json'),
    JSON.stringify({ completedAt: new Date().toISOString(), results }, null, 2),
  );
  if (code !== 0) process.exitCode = 1;
}

// Next writes `next-env.d.ts` on `next dev`/`next build` and git ignores it, so a fresh
// checkout has none and the web typecheck cannot see Next's image-import types. CI builds
// first and never notices; this script may run before any build.
async function ensureNextTypes() {
  const file = resolve(root, 'apps/web/next-env.d.ts');
  if (existsSync(file)) return;
  await writeFile(
    file,
    [
      '/// <reference types="next" />',
      '/// <reference types="next/image-types/global" />',
      '',
      '// NOTE: This file should not be edited',
      '// see https://nextjs.org/docs/basic-features/typescript for more information.',
      '',
    ].join('\n'),
  );
}

for (const directory of packages) {
  if (directory === 'apps/web' && !onlyTests) await ensureNextTypes();
  if (!onlyTests)
    await run(`${directory}: typecheck`, directory, [
      resolve(root, directory, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
    ]);
  if (!onlyTypes) {
    if (directory === 'apps/booking-engine') {
      const tests = (await readdir(resolve(root, directory, 'tests')))
        .filter((name) => name.endsWith('.test.ts'))
        .map((name) => resolve(root, directory, 'tests', name));
      await run(`${directory}: real database tests`, directory, [
        '--expose-gc',
        '--import',
        pathToFileURL(resolve(root, directory, 'node_modules/tsx/dist/loader.mjs')).href,
        '--test',
        ...tests,
      ]);
    } else {
      const args = [
        resolve(root, directory, 'node_modules/vitest/vitest.mjs'),
        'run',
        '--maxWorkers=2',
        '--minWorkers=1',
      ];
      if (directory === 'apps/web')
        args.push(
          'lib/booking/bridge.test.ts',
          'lib/booking/public-access.test.ts',
          'components/merchant/booking',
        );
      await run(`${directory}: behavior tests`, directory, args);
    }
  }
  if (directory === 'apps/web' && !onlyTests && !onlyTypes)
    await run(`${directory}: booking lint`, '.', [resolve(root, 'scripts/lint-booking.mjs')]);
}
console.log(
  `\n${results.filter((result) => result.code === 0).length}/${results.length} booking verification commands passed.`,
);
