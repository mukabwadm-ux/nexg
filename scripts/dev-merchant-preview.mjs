import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'apps', 'web');
const port = Number(process.env.MERCHANT_PREVIEW_PORT ?? 3141);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('MERCHANT_PREVIEW_PORT must be a port between 1024 and 65535.');
}

const next = createRequire(join(web, 'package.json')).resolve('next/dist/bin/next');
const server = spawn(
  process.execPath,
  [next, 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    cwd: web,
    env: {
      ...process.env,
      NEXG_NEXT_DIST_DIR: `.next-dev-${port}`,
      // Next's development version lookup is gated by this supported opt-out.
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: 'inherit',
    windowsHide: true,
  },
);

// The browser owns the single background preload queue after a page opens.
let stopping = false;
server.once('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.once('exit', (code) => {
  process.exitCode = code ?? (stopping ? 0 : 1);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopping = true;
    server.kill(signal);
  });
}
