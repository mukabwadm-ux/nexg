import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readStored, upsertSql } from '../../../scripts/app-emails/sync.mjs';
import {
  contentFrom,
  prepareAttachments,
  resendBody,
  sendEmail,
  sha256Hex,
  toBase64,
  type Download,
  type Fetch,
} from './email.ts';

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

/* The signed agreement as the live email's payload names it (20270131000500). */
const AGREEMENT_PATH =
  'signed/a1340000-0000-4000-8000-0000000000c1/a1340000-0000-4000-8000-0000000000f1.pdf';
const pdf = new TextEncoder().encode('%PDF-1.7 the signed agreement %%EOF');

function storage(files: Record<string, Uint8Array>) {
  const reads: string[] = [];
  const download: Download = async (bucket, path) => {
    reads.push(`${bucket}/${path}`);
    return files[`${bucket}/${path}`] ?? null;
  };
  return { reads, download };
}

async function agreementPayload(overrides: Record<string, unknown> = {}) {
  return {
    attachments: [
      {
        bucket: 'merchant-agreements',
        path: AGREEMENT_PATH,
        filename: 'NexG-merchant-agreement-Mama-s-Kitchen.pdf',
        sha256: await sha256Hex(pdf),
        bytes: pdf.byteLength,
        ...overrides,
      },
    ],
  };
}

test('the signed agreement is read from storage, checked and attached', async () => {
  const { reads, download } = storage({ [`merchant-agreements/${AGREEMENT_PATH}`]: pdf });
  const files = await prepareAttachments(await agreementPayload(), download);
  assert.deepEqual(reads, [`merchant-agreements/${AGREEMENT_PATH}`]);
  assert.deepEqual(files, {
    ok: true,
    attachments: [
      { filename: 'NexG-merchant-agreement-Mama-s-Kitchen.pdf', content: toBase64(pdf) },
    ],
  });
  assert.equal(
    Buffer.from(files.ok ? files.attachments[0]!.content : '', 'base64').toString(),
    '%PDF-1.7 the signed agreement %%EOF',
  );

  const { calls, fetchImpl } = recorder(200, { id: 'resend-2' });
  const outcome = await sendEmail(
    {
      recipient: 'owner@example.com',
      subject: 'Congratulations! Mama’s Kitchen is live on NexG',
      body: 'Hi Achieng,',
      attachments: files.ok ? files.attachments : [],
    },
    config,
    fetchImpl,
  );
  assert.equal(outcome.ok, true);
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)).attachments, [
    { filename: 'NexG-merchant-agreement-Mama-s-Kitchen.pdf', content: toBase64(pdf) },
  ]);
});

test('an email that names no attachments sends none and reads nothing', async () => {
  const { reads, download } = storage({});
  assert.deepEqual(await prepareAttachments({ kind: 'bell' }, download), {
    ok: true,
    attachments: [],
  });
  assert.deepEqual(reads, []);
  assert.equal(
    'attachments' in
      resendBody({ recipient: 'a@example.com', subject: 's', body: 'b' }, config.from),
    false,
  );
});

test('only signed agreements may be attached, and only the one on record', async () => {
  const { reads, download } = storage({ [`merchant-agreements/${AGREEMENT_PATH}`]: pdf });
  const elsewhere = await prepareAttachments(
    await agreementPayload({ bucket: 'documents', path: 'merchant/id-card.jpg' }),
    download,
  );
  assert.equal(elsewhere.ok, false);
  assert.equal(!elsewhere.ok && elsewhere.retryable, false);

  const signature = await prepareAttachments(
    await agreementPayload({ path: 'signer/a1340000-0000-4000-8000-0000000000e1.png' }),
    download,
  );
  assert.equal(signature.ok, false, 'NexG’s signature image is never attachable');
  assert.deepEqual(reads, [], 'nothing outside the allowed files is even read');

  const changed = await prepareAttachments(
    await agreementPayload({ sha256: 'a'.repeat(64) }),
    download,
  );
  assert.deepEqual(changed, {
    ok: false,
    error:
      'NexG-merchant-agreement-Mama-s-Kitchen.pdf in storage is not the file on record (SHA-256 differs).',
    retryable: false,
  });

  const badName = await prepareAttachments(
    await agreementPayload({ filename: '../x.pdf' }),
    download,
  );
  assert.equal(badName.ok, false);
});

test('a file storage cannot hand over is retried, not sent without it', async () => {
  const { download } = storage({});
  assert.deepEqual(await prepareAttachments(await agreementPayload(), download), {
    ok: false,
    error: 'NexG-merchant-agreement-Mama-s-Kitchen.pdf could not be read from storage.',
    retryable: true,
  });
});

test('the designed parts come from the payload, and only the message’s own parts', () => {
  const content = contentFrom({
    content: {
      title: 'Congratulations! Mama’s Kitchen is live',
      greeting: 'Hi Achieng,',
      intro: 'Congratulations, and welcome to NexG.\n\nHere is what to do next:',
      steps: ['Add your menu in Offerings.', 42, 'Check your opening hours in Availability.'],
      action: { label: 'Open your dashboard', url: 'https://nexgapp.com/merchant' },
      callout: { title: 'Your signed agreement is attached', body: 'NexG has signed it.' },
      eyebrow: 'SOMETHING ELSE',
      tone: 'red',
    },
  });
  assert.deepEqual(content, {
    title: 'Congratulations! Mama’s Kitchen is live',
    greeting: 'Hi Achieng,',
    intro: 'Congratulations, and welcome to NexG.\n\nHere is what to do next:',
    steps: ['Add your menu in Offerings.', 'Check your opening hours in Availability.'],
    action: { label: 'Open your dashboard', url: 'https://nexgapp.com/merchant' },
    callout: { title: 'Your signed agreement is attached', body: 'NexG has signed it.' },
  });
  assert.equal(contentFrom({}), undefined, 'no content: the email is drawn from its text');
  assert.equal(contentFrom({ content: { title: 'Only a title' } }), undefined);
  assert.equal(
    contentFrom({
      content: { title: 't', intro: 'i', action: { label: 'Go', url: 'javascript:x' } },
    })?.action,
    undefined,
    'a button only ever links to an https address',
  );
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
