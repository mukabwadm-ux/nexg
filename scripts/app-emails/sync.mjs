#!/usr/bin/env node
// Carries the customer email designs into the backend.
//
// The design source is the Consumer app's `docs/email-templates/` (langs4u/nexg-app):
// its build script writes emails/<id>.html and .txt, and emails.mjs holds each email's
// subject, group and sample values. This script copies them here, unchanged, so the
// database sends exactly what the owner approved.
//
//   node scripts/app-emails/sync.mjs <path to docs/email-templates>
//       refreshes supabase/app-emails/ (templates, catalog.json) and the Supabase Auth
//       versions in supabase/templates/app/
//   node scripts/app-emails/sync.mjs <path> --migration
//       also writes a NEW migration that upserts every template (migrations already on
//       main are never edited, so each design change ships as its own migration)
//   node scripts/app-emails/sync.mjs --sql
//       prints the upsert SQL for what is in supabase/app-emails/ (used by the test)
//
// Nothing here sends anything.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(root, 'supabase', 'app-emails');
const AUTH_OUT = join(root, 'supabase', 'templates', 'app');
const WEB_ASSETS = join(root, 'apps', 'web', 'public', 'email', 'app');

/** Optional emails and the notification choice (customer_notification_pref) that silences them. */
const PREF = {
  '14-final-receipt': 'order_confirmations',
  '23-booking-reminder': 'booking_reminders',
  '26-request-sent': 'booking_confirmations',
  '37-stay-check-out': 'booking_reminders',
  '38-stay-thanks': 'booking_reminders',
  '43-support-closed': 'concierge_messages',
};

/** The emails Supabase Auth sends itself: the Go-template file each becomes. */
const AUTH = {
  '01-confirm-email': 'confirm-signup.html',
  '02-sign-in-code': 'magic-link.html',
  '04-reset-password': 'reset-password.html',
  '05-password-changed': 'password-changed.html',
  '06-confirm-new-email': 'email-change.html',
  '07-email-changed': 'email-changed.html',
};
const ASSET_BASE = 'https://www.nexgapp.com/email/app';

export function upsertSql(catalog, read) {
  const q = (s) => {
    if (s == null) return 'null';
    const text = String(s);
    if (text.includes('$tpl$')) throw new Error('A template contains $tpl$');
    return `$tpl$${text}$tpl$`;
  };
  const rows = catalog.map(
    (e) =>
      `  (${q(e.id)}, ${q(e.group)}, ${q(e.name)}, ${e.required}, ${q(e.pref_category)},\n` +
      `   ${q(e.subject)}, ${q(e.preheader)},\n   ${q(read(`${e.id}.html`))},\n   ${q(read(`${e.id}.txt`))},\n` +
      `   ${q(JSON.stringify(e.sample))}::jsonb)`,
  );
  return (
    'insert into app_email.template\n' +
    '  (key, group_key, name, required, pref_category, subject, preheader, html, text, sample)\nvalues\n' +
    rows.join(',\n') +
    '\non conflict (key) do update set\n' +
    '  group_key = excluded.group_key, name = excluded.name, required = excluded.required,\n' +
    '  pref_category = excluded.pref_category, subject = excluded.subject,\n' +
    '  preheader = excluded.preheader, html = excluded.html, text = excluded.text,\n' +
    '  sample = excluded.sample, updated_at = now();\n'
  );
}

export function readStored() {
  const catalog = JSON.parse(readFileSync(join(OUT, 'catalog.json'), 'utf8'));
  const read = (f) => readFileSync(join(OUT, 'templates', f), 'utf8');
  return { catalog, read };
}

/** Mustache to Supabase Auth's Go templates. Anything left unmapped is an error. */
function toGo(id, html) {
  const map = {
    code: '{{ .Token }}',
    email: '{{ .Email }}',
    email_q: '{{ .Email | urlquery }}',
    new_email: '{{ .NewEmail }}',
    new_email_masked: '{{ .Email }}',
    first_name: '{{ .Data.first_name }}',
    confirm_url: '{{ .ConfirmationURL }}',
    sign_in_url: '{{ .ConfirmationURL }}',
    reset_url:
      '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=%2Freset-password',
    asset_base_url: ASSET_BASE,
    security_url: 'https://nexgapp.com/account/security',
    changed_at: 'just now',
  };
  let out = html
    // Auth has no device for a password change, so that part goes.
    .replace(/\{\{#device\}\}[\s\S]*?\{\{\/device\}\}/g, '')
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (all, name) => {
      if (!(name in map)) throw new Error(`${id}: no Supabase Auth value for {{ ${name} }}`);
      return map[name];
    });
  out = out
    .replace(/\{\{#first_name\}\}/g, '{{ if .Data.first_name }}')
    .replace(/\{\{\/first_name\}\}/g, '{{ end }}');
  const left = out.match(/\{\{[#^/][^}]*\}\}/);
  if (left) throw new Error(`${id}: section ${left[0]} has no Supabase Auth form`);
  return out;
}

async function sync(from) {
  const { EMAILS, SAMPLE } = await import(pathToFileURL(join(from, 'emails.mjs')).href);
  mkdirSync(join(OUT, 'templates'), { recursive: true });
  mkdirSync(AUTH_OUT, { recursive: true });
  mkdirSync(WEB_ASSETS, { recursive: true });

  const strip = (v) => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v)
          .filter(([k]) => k !== 'asset_base_url')
          .map(([k, x]) => [k, strip(x)]),
      );
    return typeof v === 'string' && /^__[A-Z_]+__$/.test(v) ? '' : v;
  };

  const catalog = EMAILS.map((e) => {
    const html = readFileSync(join(from, 'emails', `${e.id}.html`), 'utf8');
    // The .txt starts with "Subject: …" and a blank line; the subject is stored on its own.
    const text = readFileSync(join(from, 'emails', `${e.id}.txt`), 'utf8').replace(
      /^Subject: [^\n]*\n\n/,
      '',
    );
    writeFileSync(join(OUT, 'templates', `${e.id}.html`), html);
    writeFileSync(join(OUT, 'templates', `${e.id}.txt`), text);
    if (AUTH[e.id]) writeFileSync(join(AUTH_OUT, AUTH[e.id]), toGo(e.id, html));
    return {
      id: e.id,
      group: e.group,
      name: e.name,
      required: Boolean(e.required),
      pref_category: e.required ? null : (PREF[e.id] ?? null),
      subject: e.subject,
      preheader: e.preheader ?? null,
      auth: AUTH[e.id] ? `supabase/templates/app/${AUTH[e.id]}` : null,
      sample: strip({ ...SAMPLE.common, ...(SAMPLE[e.id] ?? {}) }),
    };
  });
  writeFileSync(join(OUT, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  for (const f of ['nexg-wordmark.png', 'nexg-wordmark-light.png'])
    copyFileSync(join(from, 'assets', f), join(WEB_ASSETS, f));
  console.log(`Synced ${catalog.length} emails into supabase/app-emails/.`);
  return catalog;
}

function newMigration() {
  const dir = join(root, 'supabase', 'migrations');
  const latest = readdirSync(dir).sort().at(-1).slice(0, 14);
  const id = String(BigInt(latest) + 100n);
  const { catalog, read } = readStored();
  const path = join(dir, `${id}_app_email_templates.sql`);
  writeFileSync(
    path,
    "-- Generated by scripts/app-emails/sync.mjs from the Consumer app's docs/email-templates.\n" +
      '-- Do not edit by hand: change the design there, sync, and generate a new migration.\n\n' +
      upsertSql(catalog, read),
  );
  console.log(`Wrote ${path}. Check the id is free on every branch before pushing.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--sql')) {
    const { catalog, read } = readStored();
    process.stdout.write(upsertSql(catalog, read));
  } else {
    const from = args.find((a) => !a.startsWith('--'));
    if (!from) {
      console.error(
        'Usage: node scripts/app-emails/sync.mjs <path to docs/email-templates> [--migration]',
      );
      process.exit(1);
    }
    await sync(resolve(from));
    if (args.includes('--migration')) newMigration();
  }
}
