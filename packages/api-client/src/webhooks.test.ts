import { describe, expect, it } from 'vitest';

import { NexgWebhookError } from './errors.js';
import { verifyWebhook } from './webhooks.js';

/*
 * The signature below was made by Postgres, the way the webhook dispatcher
 * signs (extensions.hmac over "<t>.<body::text>", keyed with the whole
 * whsec_ secret). The body is jsonb as text, with Postgres' own spacing and
 * key order and a non-ASCII character, so a match proves the client checks
 * exactly what NexG sends.
 */
const T = 1763456400;
const SECRET = 'whsec_0123456789abcdef0123456789abcdef';
const BODY =
  '{"id": "b7a1c2d3-0000-4000-8000-000000000001", "data": {"booking": {"note": "Chai · two sugars", "status": "confirmed", "order_id": "0f1e2d3c-4b5a-4697-8a8b-9c0d1e2f3a4b"}, "previous_status": "requested"}, "type": "booking.status_changed", "created_at": "2026-11-18T09:00:00+00:00", "environment": "test"}';
const SIGNATURE = `t=${T},v1=580c121cf92b3ca253f0d3fb8789b000c9491b49cfefe42d23f1a9e380023adc`;
const NOW = (T + 10) * 1000;

async function reason(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(NexgWebhookError);
  return (error as NexgWebhookError).reason;
}

async function sign(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('verifyWebhook', () => {
  it('accepts an event NexG signed, and returns it parsed', async () => {
    const event = await verifyWebhook(BODY, SIGNATURE, SECRET, { now: NOW });
    expect(event).toMatchObject({ type: 'booking.status_changed', environment: 'test' });
  });

  it('refuses a body changed by even one character', async () => {
    expect(
      await reason(
        verifyWebhook(BODY.replace('two sugars', 'two sugar'), SIGNATURE, SECRET, { now: NOW }),
      ),
    ).toBe('mismatch');
  });

  it('refuses a body parsed and serialised again, because the spacing changes', async () => {
    const reserialised = JSON.stringify(JSON.parse(BODY));
    expect(await reason(verifyWebhook(reserialised, SIGNATURE, SECRET, { now: NOW }))).toBe(
      'mismatch',
    );
  });

  it('refuses the wrong secret', async () => {
    expect(await reason(verifyWebhook(BODY, SIGNATURE, 'whsec_another', { now: NOW }))).toBe(
      'mismatch',
    );
  });

  it('refuses a signature older than five minutes, which could be a replay', async () => {
    expect(await reason(verifyWebhook(BODY, SIGNATURE, SECRET, { now: (T + 301) * 1000 }))).toBe(
      'expired',
    );
    await expect(
      verifyWebhook(BODY, SIGNATURE, SECRET, { now: (T + 301) * 1000, toleranceSeconds: 600 }),
    ).resolves.toMatchObject({ type: 'booking.status_changed' });
  });

  it('refuses a missing or malformed header', async () => {
    expect(await reason(verifyWebhook(BODY, null, SECRET, { now: NOW }))).toBe('missing_signature');
    expect(await reason(verifyWebhook(BODY, '', SECRET, { now: NOW }))).toBe('missing_signature');
    expect(await reason(verifyWebhook(BODY, `t=${T},v1=abc`, SECRET, { now: NOW }))).toBe(
      'malformed_signature',
    );
    expect(
      await reason(verifyWebhook(BODY, SIGNATURE.replace('t=', 'ts='), SECRET, { now: NOW })),
    ).toBe('malformed_signature');
  });

  it('refuses a signed body that is not JSON', async () => {
    const body = 'not json';
    const header = `t=${T},v1=${await sign(SECRET, `${T}.${body}`)}`;
    expect(await reason(verifyWebhook(body, header, SECRET, { now: NOW }))).toBe('not_json');
  });
});
