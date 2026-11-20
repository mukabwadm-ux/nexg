import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readStored, upsertSql } from '../../../scripts/app-emails/sync.mjs';
import { resendBody, sendEmail, type Fetch } from './email.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const config = { apiKey: 'test-key-not-real', from: 'NexG <info@nexgapp.com>' };

function recorder(status: number, reply: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: Fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply), { status });
  };
  return { calls, fetchImpl };
}

test('an app email goes to Resend with its HTML part beside the text', async () => {
  const { calls, fetchImpl } = recorder(200, { id: 'resend-1' });
  const outcome = await sendEmail(
    {
      recipient: 'amani@example.com',
      subject: 'Order placed: Mfano Kitchen',
      body: 'ORDER PLACED AND PAID\nKES 2,050',
      html: '<p>Order placed</p>',
      payload: { from: 'NexG <info@nexgapp.com>', reply_to: 'info@nexgapp.com' },
    },
    config,
    fetchImpl,
  );
  assert.deepEqual(outcome, { ok: true, provider: 'resend', ref: 'resend-1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://api.resend.com/emails');
  const sent = JSON.parse(String(calls[0]!.init.body));
  assert.equal(sent.html, '<p>Order placed</p>');
  assert.equal(sent.text, 'ORDER PLACED AND PAID\nKES 2,050');
  assert.equal(sent.reply_to, 'info@nexgapp.com');
  assert.deepEqual(sent.to, ['amani@example.com']);
});

test('a message without HTML stays plain text, as every email did before', () => {
  const sent = resendBody(
    { recipient: 'a@example.com', subject: null, body: 'Hi', html: null },
    config.from,
  );
  assert.equal('html' in sent, false);
  assert.equal(sent.subject, 'NexG');
  assert.equal(sent.from, config.from);
});

test('a provider refusal is retried only when it can get better', async () => {
  const busy = await sendEmail(
    { recipient: 'a@example.com', subject: 's', body: 'b' },
    config,
    recorder(429, { message: 'slow down' }).fetchImpl,
  );
  assert.equal(busy.retryable, true);
  const wrong = await sendEmail(
    { recipient: 'not-an-email', subject: 's', body: 'b' },
    config,
    recorder(422, { message: 'invalid to' }).fetchImpl,
  );
  assert.deepEqual(wrong, { ok: false, provider: 'resend', error: 'invalid to', retryable: false });
});

test('no key means nothing is sent and the row waits for one', async () => {
  const { calls, fetchImpl } = recorder(200, {});
  const outcome = await sendEmail(
    { recipient: 'a@example.com', subject: 's', body: 'b' },
    { apiKey: '', from: '' },
    fetchImpl,
  );
  assert.equal(outcome.provider, 'none');
  assert.equal(calls.length, 0);
});

test('the seeded templates match supabase/app-emails, so the design and the database stay in step', () => {
  const { catalog, read } = readStored();
  const migrations = join(root, 'supabase', 'migrations');
  const latest = readdirSync(migrations)
    .filter((f) => f.endsWith('_app_email_templates.sql'))
    .sort()
    .at(-1);
  assert.ok(latest, 'no app email templates migration');
  const seeded = readFileSync(join(migrations, latest), 'utf8');
  assert.ok(
    seeded.endsWith(upsertSql(catalog, read)),
    `${latest} is not what supabase/app-emails/ holds. Run: node scripts/app-emails/sync.mjs <docs/email-templates> --migration`,
  );
});

test('every template can be filled: sections close and no code or password placeholder is in a stored email', () => {
  const { catalog, read } = readStored();
  assert.equal(catalog.length, 43);
  for (const email of catalog) {
    for (const part of [read(`${email.id}.html`), read(`${email.id}.txt`), email.subject]) {
      const opens = [...part.matchAll(/\{\{[#^]([a-z0-9_]+)\}\}/g)].map((m) => m[1]);
      for (const name of opens)
        assert.ok(part.includes(`{{/${name}}}`), `${email.id}: {{#${name}}} has no end`);
    }
    if (email.group !== 'account') {
      assert.doesNotMatch(
        read(`${email.id}.html`),
        /\{\{\s*(code|password|reset_url)\s*\}\}/,
        email.id,
      );
    }
  }
});
