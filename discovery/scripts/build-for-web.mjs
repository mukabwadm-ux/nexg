#!/usr/bin/env node
/**
 * Packages NexG Discovery for the NexG website. The result is a static build served at /discover on the
 * website's own origin. Discovery's cart (localStorage "nexg.cart.v1") is then the website's cart, and "Go to
 * checkout" and sign-in stay on one site.
 *
 * From the website (apps/web), as part of its build:
 *   node ../../discovery/scripts/build-for-web.mjs public/discover [--install]
 *
 *   --install   run `npm ci` here first. Packages are also installed when node_modules is missing or older than
 *               package-lock.json (`npm ci` on Vercel and CI, `npm install` on a developer's machine).
 *
 * Settings come from the website's own environment, so the website needs no new secrets:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY   the website's public Supabase values
 *                                                             (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY also work)
 *   DISCOVERY_BASE        where the website serves Discovery (default /discover/)
 *   NEXG_CHECKOUT_PATH    the website's checkout page (default /checkout)
 *   NEXG_SIGN_IN_PATH     the website's sign-in page (default /sign-in); it returns shoppers via ?next=
 *
 * vite.config.ts checks the Supabase values and refuses a build that has none. A deploy (Vercel or CI) is also
 * refused when it points visitors' browsers at a local Supabase; a build on a developer's machine may use one.
 * Keys are never printed.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const target = args.find((arg) => !arg.startsWith('--'));
if (!target) fail('usage: node scripts/build-for-web.mjs <output folder> [--install]');
const outDir = path.resolve(process.cwd(), target);
if (outDir === root || root.startsWith(outDir + path.sep)) fail(`refusing to write into ${outDir}`);

// On a developer's machine the website keeps its values in apps/web/.env*, which only `next` loads. Read the two
// public ones in Next's order: the shell wins, then the first file that sets them. Vercel and CI use the environment.
for (const file of ['.env.production.local', '.env.local', '.env.production', '.env']) {
  const full = path.join(process.cwd(), file);
  if (!existsSync(full)) continue;
  const values = parseEnv(readFileSync(full, 'utf8'));
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
    if (process.env[key] === undefined && values[key] !== undefined) process.env[key] = values[key];
  }
}

const base = process.env.DISCOVERY_BASE || '/discover/';
const env = {
  ...process.env,
  DISCOVERY_BASE: base,
  VITE_DISCOVERY_PROVIDER: 'supabase',
  VITE_NEXG_CHECKOUT_URL: process.env.NEXG_CHECKOUT_PATH || '/checkout',
  VITE_NEXG_SIGN_IN_URL: process.env.NEXG_SIGN_IN_PATH || '/sign-in',
};
// The website's public Supabase values become Discovery's. Without them, Vite reads Discovery's own .env files.
if (process.env.NEXT_PUBLIC_SUPABASE_URL) env.VITE_SUPABASE_URL ||= process.env.NEXT_PUBLIC_SUPABASE_URL;
if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) env.VITE_SUPABASE_ANON_KEY ||= process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// A deploy must never point visitors at a local Supabase; a developer's own build of the website may.
if (!process.env.VERCEL && !process.env.CI && env.DISCOVERY_ALLOW_LOCAL_SUPABASE === undefined) env.DISCOVERY_ALLOW_LOCAL_SUPABASE = '1';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// Reinstall when the lockfile changed since the last install: Vercel restores node_modules from its cache.
// A deploy gets a clean `npm ci`. A developer's machine gets `npm install`, which never wipes node_modules first
// (a running dev server keeps files there open, and Windows refuses to delete them).
// --include=dev: Vercel builds with NODE_ENV=production, which otherwise skips vite, typescript and the type
// packages (all devDependencies), so the type check failed (the same fix as scripts/build-host-workspace.mjs, #84).
// A copy installed without them has no vite, so `missing` reinstalls it.
const lockHash = createHash('sha256').update(readFileSync(path.join(root, 'package-lock.json'))).digest('hex');
const stamp = path.join(root, 'node_modules', '.nexg-lock-sha256');
const installed = existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : '';
const missing = !existsSync(path.join(root, 'node_modules', 'vite'));
if (args.includes('--install') || missing || installed !== lockHash) {
  const clean = missing || args.includes('--install') || process.env.VERCEL || process.env.CI;
  run(npm, [clean ? 'ci' : 'install', '--include=dev', '--no-audit', '--no-fund']);
  writeFileSync(stamp, lockHash);
}
run(npm, ['run', 'typecheck'], env);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', outDir, '--emptyOutDir'], env);
console.log(`build-for-web: NexG Discovery packaged for ${base} into ${outDir} (${megabytes(outDir)} MB)`);

function run(command, commandArgs, runEnv = process.env) {
  // npm on Windows is a .cmd file, which Node only starts through a shell; the arguments here are fixed words.
  const result = command.endsWith('.cmd')
    ? spawnSync([command, ...commandArgs].join(' '), { cwd: root, env: runEnv, stdio: 'inherit', shell: true })
    : spawnSync(command, commandArgs, { cwd: root, env: runEnv, stdio: 'inherit' });
  if (result.status !== 0) fail(`${path.basename(command)} ${commandArgs.slice(-3).join(' ')} failed`);
}

function megabytes(folder) {
  let bytes = 0;
  const walk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full); else bytes += statSync(full).size;
  } };
  walk(folder);
  return (bytes / 1048576).toFixed(1);
}

function fail(message) {
  console.error(`build-for-web: ${message}`);
  process.exit(1);
}
