import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const results = [];
await mkdir(resolve(root, '.booking-local'), { recursive: true });
for (const script of [
  'smoke-booking.mjs',
  'smoke-booking-spaces.mjs',
  'smoke-booking-workflows.mjs',
]) {
  console.log(`\nBrowser acceptance: ${script}`);
  const started = Date.now();
  const code = await new Promise((done) => {
    const child = spawn(process.execPath, [resolve(root, 'scripts', script)], {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', (error) => {
      console.error(error.message);
      done(1);
    });
    child.once('exit', (value) => done(value ?? 1));
  });
  results.push({ script, code, durationMs: Date.now() - started });
  await writeFile(
    resolve(root, '.booking-local/browser-suite-verification.json'),
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        passed: results.length === 3 && results.every((result) => result.code === 0),
        results,
      },
      null,
      2,
    ),
  );
  if (code !== 0) {
    process.exitCode = 1;
    break;
  }
}
console.log(
  `\n${results.filter((result) => result.code === 0).length}/3 browser acceptance journeys passed.`,
);
