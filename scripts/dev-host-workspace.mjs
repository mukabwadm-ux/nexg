import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const host = join(root, 'hosts-workspace');
const web = join(root, 'apps', 'web');
const tsc = join(host, 'node_modules', 'typescript', 'bin', 'tsc');
const vite = join(host, 'node_modules', 'vite', 'bin', 'vite.js');
const next = join(web, 'node_modules', 'next', 'dist', 'bin', 'next');

if (![tsc, vite, next].every(existsSync)) {
  console.error('Install the repo dependencies with pnpm and run npm --prefix hosts-workspace ci.');
  process.exit(1);
}

for (const args of [
  [tsc, '--noEmit'],
  [vite, 'build'],
]) {
  const build = spawnSync(process.execPath, args, { cwd: host, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const port = '3010';
console.log('Open http://127.0.0.1:' + port + '/host and sign in as a host.');
const dev = spawn(process.execPath, [next, 'dev', '--hostname', '127.0.0.1', '--port', port], {
  cwd: web,
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXG_NEXT_DIST_DIR: '.next-hosts-preview',
  },
});

dev.once('error', (error) => {
  console.error('Hosts Workspace could not start.', error.message);
  process.exitCode = 1;
});
dev.once('exit', (code) => {
  process.exitCode = code ?? 0;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => dev.kill(signal));
}
