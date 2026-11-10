import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../src/app.ts';
import { verify } from '../src/signing.ts';

const API_KEY = 'test-api-key-0123456789abcdef';
const SECRET = 'test-webhook-secret-0123456789abcdef0123';

interface Received {
  body: string;
  signature: string | undefined;
}

let bankUrl = '';
let receiverUrl = '';
let bankServer: Server;
let receiver: Server;
const received: Received[] = [];
let failNext = 0;

const listen = (server: Server) =>
  new Promise<string>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    ),
  );

const api = (path: string, init: RequestInit = {}) =>
  fetch(`${bankUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${API_KEY}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

const open = async (reference: string, amount = 250_000, key = reference) => {
  const res = await api('/v1/collections', {
    method: 'POST',
    headers: { 'idempotency-key': key },
    body: JSON.stringify({
      merchant_reference: reference,
      amount,
      currency: 'KES',
      description: 'Order at Glow Beauty',
      callback_url: `${receiverUrl}/hook`,
      return_url: `http://nexg.test/pay/${reference}`,
    }),
  });
  return { res, body: (await res.json()) as Record<string, any> };
};

const waitFor = async (predicate: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

before(async () => {
  receiver = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (failNext > 0) {
        failNext -= 1;
        res.writeHead(500).end();
        return;
      }
      received.push({ body, signature: req.headers['x-bank-signature'] as string | undefined });
      res.writeHead(200).end('{"ok":true}');
    });
  });
  receiverUrl = await listen(receiver);
  const app = createApp({
    apiKey: API_KEY,
    webhookSecret: SECRET,
    publicUrl: 'http://bank.test',
    slowApprovalMs: 150,
    retryDelaysMs: [50, 50],
  });
  bankServer = app.server;
  bankUrl = await listen(bankServer);
});

after(() => {
  bankServer.close();
  receiver.close();
});

describe('NexG Sandbox Bank', () => {
  it('refuses calls without the API key', async () => {
    const res = await fetch(`${bankUrl}/v1/collections`, { method: 'POST', body: '{}' });
    assert.equal(res.status, 401);
  });

  it('validates a collection request', async () => {
    const res = await api('/v1/collections', {
      method: 'POST',
      headers: { 'idempotency-key': 'bad-1' },
      body: JSON.stringify({ merchant_reference: 'X', amount: 10.5, currency: 'KES' }),
    });
    assert.equal(res.status, 422);
    const missingKey = await api('/v1/collections', { method: 'POST', body: '{}' });
    assert.equal(missingKey.status, 400);
  });

  it('opens a collection once per idempotency key', async () => {
    const first = await open('NX-P-IDEM');
    assert.equal(first.res.status, 201);
    assert.equal(first.body.status, 'pending');
    assert.match(first.body.checkout_url, /^http:\/\/bank\.test\/checkout\/col_/);
    const again = await open('NX-P-IDEM');
    assert.equal(again.res.status, 200);
    assert.equal(again.body.id, first.body.id);
    const res = await api('/v1/collections', {
      method: 'POST',
      headers: { 'idempotency-key': 'NX-P-IDEM' },
      body: JSON.stringify({ merchant_reference: 'NX-P-IDEM', amount: 1, currency: 'KES' }),
    });
    assert.equal(res.status, 409);
  });

  it('pays and sends a signed webhook', async () => {
    const { body } = await open('NX-P-PAY');
    const res = await api(`/v1/collections/${body.id}/simulate`, {
      method: 'POST',
      body: JSON.stringify({ outcome: 'succeed' }),
    });
    const settled = (await res.json()) as Record<string, any>;
    assert.equal(settled.status, 'succeeded');
    assert.match(settled.bank_reference, /^SBX/);
    await waitFor(() => received.some((r) => r.body.includes(body.id)));
    const hook = received.find((r) => r.body.includes(body.id))!;
    assert.ok(verify(hook.body, hook.signature, SECRET), 'signature verifies');
    assert.ok(!verify(hook.body, hook.signature, 'another-secret-0123456789abcdef01234'));
    const event = JSON.parse(hook.body);
    assert.equal(event.type, 'collection.succeeded');
    assert.equal(event.data.merchant_reference, 'NX-P-PAY');
    assert.equal(event.data.amount, 250_000);
  });

  it('declines for insufficient funds on the low-balance account', async () => {
    const { body } = await open('NX-P-LOW', 50_000);
    const page = await fetch(`${bankUrl}/checkout/${body.id}`);
    assert.match(await page.text(), /Approve KES 500\.00/);
    const res = await fetch(`${bankUrl}/checkout/${body.id}`, {
      method: 'POST',
      body: new URLSearchParams({ action: 'approve', account: 'acc_low_funds' }),
      redirect: 'manual',
    });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), 'http://nexg.test/pay/NX-P-LOW');
    const read = (await (await api(`/v1/collections/${body.id}`)).json()) as Record<string, any>;
    assert.equal(read.status, 'failed');
    assert.equal(read.failure_code, 'insufficient_funds');
  });

  it('lets a customer cancel, and refuses a second decision', async () => {
    const { body } = await open('NX-P-CANCEL');
    await fetch(`${bankUrl}/checkout/${body.id}`, {
      method: 'POST',
      body: new URLSearchParams({ action: 'cancel' }),
      redirect: 'manual',
    });
    const res = await api(`/v1/collections/${body.id}/simulate`, {
      method: 'POST',
      body: JSON.stringify({ outcome: 'succeed' }),
    });
    assert.equal(res.status, 409);
  });

  it('processes slowly, then pays', async () => {
    const { body } = await open('NX-P-SLOW');
    await fetch(`${bankUrl}/checkout/${body.id}`, {
      method: 'POST',
      body: new URLSearchParams({ action: 'approve', account: 'acc_slow' }),
      redirect: 'manual',
    });
    const mid = (await (await api(`/v1/collections/${body.id}`)).json()) as Record<string, any>;
    assert.equal(mid.status, 'processing');
    await waitFor(() =>
      received.some((r) => r.body.includes(body.id) && r.body.includes('collection.succeeded')),
    );
  });

  it('serves the latest state as a signed event', async () => {
    const { body } = await open('NX-P-EVENT');
    await api(`/v1/collections/${body.id}/simulate`, {
      method: 'POST',
      body: JSON.stringify({ outcome: 'decline' }),
    });
    const res = await api(`/v1/collections/${body.id}/event`);
    const raw = await res.text();
    assert.ok(verify(raw, res.headers.get('x-bank-signature'), SECRET));
    const event = JSON.parse(raw);
    assert.equal(event.type, 'collection.failed');
    assert.equal(event.data.failure_code, 'account_blocked');
  });

  it('retries a webhook the receiver refused', async () => {
    failNext = 1;
    const { body } = await open('NX-P-RETRY');
    await api(`/v1/collections/${body.id}/simulate`, {
      method: 'POST',
      body: JSON.stringify({ outcome: 'succeed' }),
    });
    await waitFor(() => received.some((r) => r.body.includes(body.id)));
    const log = (await (await api(`/v1/webhook-deliveries?collection_id=${body.id}`)).json()) as {
      data: { status: string; attempts: number }[];
    };
    assert.equal(log.data[0]!.status, 'delivered');
    assert.equal(log.data[0]!.attempts, 2);
  });
});

describe('expiry', () => {
  it('expires a collection nobody approved', async () => {
    const app = createApp({
      apiKey: API_KEY,
      webhookSecret: SECRET,
      publicUrl: 'http://bank.test',
      collectionTtlMs: 30,
    });
    const url = await listen(app.server);
    const res = await fetch(`${url}/v1/collections`, {
      method: 'POST',
      headers: { authorization: `Bearer ${API_KEY}`, 'idempotency-key': 'exp-1' },
      body: JSON.stringify({
        merchant_reference: 'NX-P-EXP',
        amount: 1000,
        currency: 'KES',
        callback_url: `${receiverUrl}/hook`,
        return_url: 'http://nexg.test/pay/NX-P-EXP',
      }),
    });
    const body = (await res.json()) as Record<string, any>;
    await new Promise((r) => setTimeout(r, 60));
    const read = (await (
      await fetch(`${url}/v1/collections/${body.id}`, {
        headers: { authorization: `Bearer ${API_KEY}` },
      })
    ).json()) as Record<string, any>;
    assert.equal(read.status, 'expired');
    app.server.close();
  });
});
