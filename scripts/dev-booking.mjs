import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const workspace = resolve(import.meta.dirname, '..');
const local = resolve(workspace, '.booking-local');
mkdirSync(local, { recursive: true });
// Reuse this checkout's already downloaded font bytes for isolated development.
// This avoids a Google Fonts outage blocking the calendar's first compilation.
// The application's layout and production font configuration are unchanged.
function existingFontCache() {
  const cssFile = resolve(workspace, 'apps/web/.next-dev/static/css/app/layout.css');
  if (!existsSync(cssFile)) return undefined;
  const source = readFileSync(cssFile, 'utf8');
  const faces = source
    .match(/@font-face\s*\{[^}]+\}/g)
    ?.filter((face) => face.includes('__Manrope_') && face.includes('/_next/static/media/'));
  if (!faces?.length) return undefined;
  const fonts = resolve(local, 'fonts');
  mkdirSync(fonts, { recursive: true });
  let valid = true;
  const css = faces
    .map((face) =>
      face
        .replace(/font-family:\s*['"]__Manrope_[^'"]+['"]/g, "font-family: 'Manrope'")
        .replace(/\/_next\/static\/media\/([^()]+\.woff2)/g, (_match, filename) => {
          const cached = resolve(workspace, 'apps/web/.next-dev/static/media', filename);
          if (!existsSync(cached)) {
            valid = false;
            return '';
          }
          const target = resolve(fonts, filename);
          if (!existsSync(target)) copyFileSync(cached, target);
          return target.replaceAll('\\', '/').replace(/^[a-z]:/i, '');
        }),
    )
    .join('\n');
  if (!valid) return undefined;
  const module = resolve(local, 'font-response.cjs');
  const response = `module.exports = new Proxy({}, { get: (_target, url) => typeof url === 'string' && url.includes('family=Manrope:') ? ${JSON.stringify(css)} : undefined });\n`;
  if (!existsSync(module) || readFileSync(module, 'utf8') !== response)
    writeFileSync(module, response);
  return module;
}
function secret(name) {
  const target = resolve(local, name);
  if (!existsSync(target))
    writeFileSync(target, randomBytes(48).toString('hex'), { mode: 0o600, flag: 'wx' });
  return readFileSync(target, 'utf8').trim();
}
const enginePort = Number(process.env.NEXG_BOOKING_ENGINE_PORT ?? '3003');
const webPort = Number(process.env.NEXG_BOOKING_WEB_PORT ?? '3004');
for (const port of [enginePort, webPort]) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Choose valid booking development ports.');
  await new Promise((done, reject) => {
    const probe = createServer();
    probe.once('error', () =>
      reject(new Error(`Port ${port} is already in use. The existing process was not stopped.`)),
    );
    probe.listen(port, '127.0.0.1', () => probe.close(done));
  });
}
const env = {
  ...process.env,
  BOOKING_BRIDGE_SECRET: process.env.BOOKING_BRIDGE_SECRET ?? secret('bridge-secret'),
  PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ?? secret('payload-secret'),
  BOOKING_ENGINE_URL: `http://127.0.0.1:${enginePort}`,
  BOOKING_SQLITE_URL:
    process.env.BOOKING_SQLITE_URL ?? `file:${resolve(local, 'booking.db').replaceAll('\\', '/')}`,
  BOOKING_PORT: String(enginePort),
  PORT: String(enginePort),
  BOOKING_HOST: '127.0.0.1',
  NEXG_BOOKING_SANDBOX: '1',
  NEXG_NEXT_DIST_DIR: '.next-booking',
  ...(existingFontCache()
    ? { NEXT_FONT_GOOGLE_MOCKED_RESPONSES: resolve(local, 'font-response.cjs') }
    : {}),
};
const children = [];
function start(cwd, args) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300).unref();
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
const engine = resolve(workspace, 'apps/booking-engine');
const web = resolve(workspace, 'apps/web');
start(engine, [
  '--import',
  pathToFileURL(resolve(engine, 'node_modules/tsx/dist/loader.mjs')).href,
  resolve(engine, 'src/server.ts'),
]);
start(web, [
  resolve(web, 'node_modules/next/dist/bin/next'),
  'dev',
  '--hostname',
  '127.0.0.1',
  '--port',
  String(webPort),
]);
console.log(`NEXG local booking workspace: http://127.0.0.1:${webPort}/booking-workspace`);
console.log('Local development uses its own booking store. Google Calendar is optional.');
