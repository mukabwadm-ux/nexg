#!/usr/bin/env node
// Review merchants: one realistic business per consumer-app category, each with
// its own merchant-portal login, for App Store and Google Play review.
//
//   node scripts/review-merchants/seed.mjs --target local         # local Supabase + local booking engine
//   node scripts/review-merchants/seed.mjs --target live          # production (owner's yes first)
//   node scripts/review-merchants/seed.mjs --target live --remove # take them all away again
//
// Options: --only slug,slug   --skip-files   --skip-engine   --engine-links <links.json from engine-runner.mjs>
//          --generate-password  (make a strong password and save it, with the logins, to
//                                .booking-local/review-portal-logins-<target>.txt; git-ignored)
//          REVIEW_PROD_SQL=<path to a query-production.sh that has its nexgcr.txt beside it>
//
// Re-running is safe: every row has a fixed id and is updated in place, files
// are overwritten, and booking offerings that exist are kept as they are (so
// the owner's later portal edits win).
//
// What each target needs (read from the environment; none is ever printed):
//   local: a running local Supabase (REVIEW_DB_CONTAINER, default supabase_db_nexg-review;
//          REVIEW_SUPABASE_URL and REVIEW_SERVICE_KEY, or REVIEW_SUPABASE_WORKDIR for
//          `supabase status`), and a local booking engine (BOOKING_ENGINE_URL, default
//          http://127.0.0.1:3013, with .booking-local/bridge-secret).
//   live:  scripts/query-production.sh working, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for
//          storage uploads, BOOKING_ENGINE_URL + BOOKING_BRIDGE_SECRET for the engine.
//
// The portal password is typed when the script asks (or, for local only, read from
// .booking-local/review-password). It goes to the database as a psql variable and is
// never written to the repository.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { shops } from './shops.mjs';
import {
  seedSql,
  bannerSql,
  bannerPath,
  linkSql,
  removeSql,
  requiredDocsSql,
  documentSql,
  itemsOf,
  itemId,
  merchantId,
  photoPath,
  loginEmail,
  rid,
  KIND,
} from './sql.mjs';
import { bridge, setUpShop } from './engine.mjs';
import { pdfPlaceholder } from './pdf.mjs';

const root = resolve(import.meta.dirname, '../..');
const local = resolve(root, '.booking-local');
mkdirSync(local, { recursive: true });

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = option('target');
if (!['local', 'live'].includes(target)) {
  console.error('Choose --target local or --target live.');
  process.exit(1);
}
const only = option('only')?.split(',');
const list = only ? shops.filter((s) => only.includes(s.slug)) : shops;
const log = (m) => console.log(m);

// ─────────────────────────────────────────────── running SQL

function runSql(sql, { pw, tuples = false } = {}) {
  const file = resolve(local, `review-${Date.now()}.sql`);
  writeFileSync(file, sql, { mode: 0o600 });
  const vars = pw ? ['-v', `pw=${pw}`] : [];
  const flags = tuples ? ['-t', '-A'] : ['-q'];
  try {
    const input = readFileSync(file);
    const result =
      target === 'local'
        ? spawnSync(
            'docker',
            [
              'exec',
              '-i',
              process.env.REVIEW_DB_CONTAINER ?? 'supabase_db_nexg-review',
              'psql',
              '-U',
              'postgres',
              ...flags,
              ...vars,
            ],
            { input, encoding: 'utf8' },
          )
        : spawnSync(
            process.env.REVIEW_BASH ?? 'bash',
            [
              process.env.REVIEW_PROD_SQL ?? resolve(root, 'scripts/query-production.sh'),
              ...flags,
              ...vars,
            ],
            { input, encoding: 'utf8', cwd: root },
          );
    if (result.status !== 0 || /ERROR:/.test(result.stderr ?? ''))
      throw new Error((result.stderr || result.stdout || '').trim().slice(0, 2000));
    return result.stdout;
  } finally {
    rmSync(file, { force: true });
  }
}

async function askPassword() {
  // --generate-password: a strong random password, written with the login emails to a
  // git-ignored file on this computer for the owner to open. It is not printed.
  if (flag('generate-password')) {
    const file = resolve(local, `review-portal-logins-${target}.txt`);
    const pw = existsSync(file)
      ? readFileSync(file, 'utf8').match(/^Password: (.+)$/m)?.[1]
      : undefined;
    const chosen = pw ?? (await import('node:crypto')).randomBytes(15).toString('base64url');
    const lines = [
      'NexG review merchant portal logins (' + target + ')',
      'Password: ' + chosen,
      '',
      ...list.map((s) => s.name + ': ' + loginEmail(s)),
    ];
    writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
    log(`Logins and password saved to ${file} (git-ignored, this computer only).`);
    return chosen;
  }
  if (target === 'local' && existsSync(resolve(local, 'review-password')))
    return readFileSync(resolve(local, 'review-password'), 'utf8').trim();
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const muted = (q) =>
    new Promise((done) => {
      rl.question(q, (a) => {
        process.stdout.write('\n');
        done(a);
      });
      rl._writeToOutput = () => {};
    });
  process.stdout.write('Password for the review portal logins (not shown): ');
  const a = await muted('');
  process.stdout.write('Again, to be sure: ');
  const b = await muted('');
  rl.close();
  if (a !== b) throw new Error('Those did not match. Nothing was changed.');
  if (a.length < 10) throw new Error('Use at least 10 characters. Nothing was changed.');
  return a;
}

// ─────────────────────────────────────────────── storage

/** fetch, tried up to four times: a dropped connection should not stop a 110-photo run. */
async function fetchRetry(url, init) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      if (attempt >= 4) throw new Error(`${String(url).split('?')[0]}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

// Uploads go in as each shop's own login, exactly as its portal would upload
// them: the storage rules let a merchant's owner write only under that
// merchant's folders, so no service key is needed. Only the public project
// URL and its public (anon) key are used.
function storageAccess() {
  if (target === 'live') {
    const url = process.env.SUPABASE_URL,
      anon = process.env.SUPABASE_ANON_KEY;
    if (!url || !anon)
      throw new Error(
        'Set SUPABASE_URL and SUPABASE_ANON_KEY (the public key) for the uploads, or pass --skip-files.',
      );
    return { url, anon };
  }
  const workdir = process.env.REVIEW_SUPABASE_WORKDIR;
  if (!workdir)
    throw new Error('Set REVIEW_SUPABASE_WORKDIR (the folder `supabase start` ran in).');
  const env = execFileSync(process.env.SUPABASE_CLI ?? 'supabase', ['status', '-o', 'env'], {
    cwd: workdir,
    encoding: 'utf8',
  });
  const read = (name) => env.match(new RegExp('^' + name + '="?([^"\n]+)"?', 'm'))?.[1];
  return { url: read('API_URL'), anon: read('ANON_KEY') };
}

async function signIn({ url, anon }, shop, pw) {
  const r = await fetchRetry(url + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: anon, 'content-type': 'application/json' },
    body: JSON.stringify({ email: loginEmail(shop), password: pw }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token)
    throw new Error(shop.name + ': could not sign in (' + r.status + ')');
  return { url, anon, token: j.access_token };
}

/** Uploads like the portal (no overwrite). A file already there from an earlier run is kept. */
async function upload(session, bucket, path, bytes, type) {
  const response = await fetchRetry(session.url + '/storage/v1/object/' + bucket + '/' + path, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + session.token,
      apikey: session.anon,
      'content-type': type,
      'cache-control': 'max-age=31536000',
    },
    body: bytes,
  });
  if (response.ok) return;
  const text = await response.text();
  if (/exists|duplicate/i.test(text)) return;
  throw new Error(
    'upload ' + bucket + '/' + path + ': ' + response.status + ' ' + text.slice(0, 200),
  );
}

async function uploadFiles(storage, pw) {
  const photos = JSON.parse(readFileSync(resolve(import.meta.dirname, 'photos.json'), 'utf8'));
  const cache = new Map();
  const image = async (key) => {
    const p = photos[key];
    if (!p) throw new Error('No photo for ' + key);
    if (!cache.has(p.url)) {
      const r = await fetchRetry(p.url);
      if (!r.ok || !String(r.headers.get('content-type')).startsWith('image/'))
        throw new Error('photo ' + key + ': ' + r.status);
      cache.set(p.url, Buffer.from(await r.arrayBuffer()));
    }
    return cache.get(p.url);
  };
  const rows = runSql(requiredDocsSql(), { tuples: true })
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const docsOf = new Map(rows.map((r) => [r.merchant, r.docs]));
  const banners = [];
  let docSql = '\\set ON_ERROR_STOP on\nbegin;\n';
  let docCount = 0;
  for (const s of list) {
    const session = await signIn(storage, s, pw);
    const items = itemsOf(s);
    for (const it of items)
      await upload(
        session,
        'catalogue-images',
        photoPath(s, it),
        await image(it.photo),
        'image/jpeg',
      );
    // A banner for the shop page: the photo of its first "Popular" item.
    const pick = items.find((i) => i.popular) ?? items[0];
    await upload(session, 'merchant-brand', bannerPath(s), await image(pick.photo), 'image/jpeg');
    banners.push({ id: merchantId(s), path: bannerPath(s) });
    const kinds = [];
    for (const [i, d] of (docsOf.get(merchantId(s)) ?? []).entries()) {
      const id = rid(KIND.document, s.n, i + 1);
      const path = 'merchant/' + merchantId(s) + '/' + d.kind + '/' + id + '.pdf';
      const bytes = pdfPlaceholder(d.label, s.legal);
      await upload(session, 'partner-documents', path, bytes, 'application/pdf');
      kinds.push({ requirementId: d.id, kind: d.kind, path, size: bytes.length });
      docCount++;
    }
    docSql += documentSql(s, kinds) + '\n';
    log('Files: ' + s.name);
  }
  runSql(bannerSql(storage.url, banners));
  runSql(docSql + 'commit;');
  log(
    'Photos: ' +
      cache.size +
      ' images for ' +
      list.reduce((a, s) => a + itemsOf(s).length, 0) +
      ' items, and ' +
      banners.length +
      ' shop banners.',
  );
  log('Documents: ' + docCount + ' placeholder documents, verified.');
}

// ─────────────────────────────────────────────── main

async function main() {
  if (flag('remove')) {
    runSql(removeSql());
    log('Removed the review merchants and their logins from the database.');
    log(
      'Their booking-engine setups stay in the engine, unpublished from the app because the merchants are gone.',
    );
    return;
  }
  const pw = await askPassword();
  runSql(seedSql(only), { pw });
  log(`Merchants: ${list.length} live, each with its own login.`);

  if (!flag('skip-files')) {
    await uploadFiles(storageAccess(), pw);
  }

  if (option('engine-links')) {
    // Links produced by engine-runner.mjs on the server.
    const links = JSON.parse(readFileSync(resolve(option('engine-links')), 'utf8'));
    runSql(linkSql(links));
    log(`Bookings: ${links.length} items linked to their booking offerings.`);
  } else if (!flag('skip-engine')) {
    const service =
      process.env.BOOKING_ENGINE_URL ?? (target === 'local' ? 'http://127.0.0.1:3013' : undefined);
    const secret =
      process.env.BOOKING_BRIDGE_SECRET ??
      (target === 'local'
        ? readFileSync(resolve(local, 'bridge-secret'), 'utf8').trim()
        : undefined);
    if (!service || !secret)
      throw new Error('Set BOOKING_ENGINE_URL and BOOKING_BRIDGE_SECRET, or pass --skip-engine.');
    const links = [];
    for (const s of list) {
      const items = itemsOf(s)
        .filter((i) => i.engine)
        .map((i) => ({ ...i, id: itemId(s, i) }));
      if (!items.length) continue;
      log(`Bookings: ${s.name}`);
      links.push(...(await setUpShop(bridge(service, secret, merchantId(s)), s, items, log)));
    }
    if (links.length) runSql(linkSql(links));
    log(`Bookings: ${links.length} items linked to their booking offerings.`);
  }

  log('\nPortal logins (password as typed):');
  for (const s of list) log(`  ${loginEmail(s).padEnd(44)} ${s.name}`);
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
