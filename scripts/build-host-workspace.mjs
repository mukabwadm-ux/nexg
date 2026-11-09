/*
 * Builds the Hosts Workspace (hosts-workspace/, a separate Vite app with its
 * own npm lockfile) into apps/web/public/nexg-hosts-workspace/, which the
 * /host route serves. The output is gitignored, so every web build — local,
 * CI and Vercel — runs this first; without it /host answers 503.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const workspace = join(root, 'hosts-workspace');
/* Fixed command strings only — nothing user-supplied reaches the shell. */
function run(command) {
  const result = spawnSync(command, { cwd: workspace, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`Hosts Workspace build failed at: ${command}`);
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(join(workspace, 'node_modules', 'vite'))) {
  // --include=dev: Vercel builds with NODE_ENV=production, which would
  // otherwise skip vite and typescript (both devDependencies).
  run('npm ci --include=dev --no-audit --no-fund');
}
run('npm run build');
