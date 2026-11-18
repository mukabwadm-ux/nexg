import type { WebhookEvent } from '@nexg/contracts/api';

import { NexgWebhookError } from './errors';

/**
 * Checking an order event NexG posted to your endpoint.
 *
 * NexG signs each attempt with the endpoint's signing secret (the whole
 * `whsec_…` value the console showed once):
 *
 *   NexG-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
 *
 * Pass the body exactly as it arrived, before any JSON parsing: parsing and
 * serialising again can change spacing and break the signature. Uses Web
 * Crypto, so it runs on Node 20 or later, Deno, Bun and edge runtimes.
 */

export interface VerifyWebhookOptions {
  /** How far `t` may be from your clock, in seconds. Default 300, five minutes. */
  toleranceSeconds?: number;
  /** Your clock, in milliseconds. Defaults to Date.now(); for tests. */
  now?: number;
}

const HEADER = /^t=(\d{9,12}),v1=([0-9a-f]{64})$/;

/**
 * Returns the event when the signature is NexG's and recent, and throws
 * NexgWebhookError when it is not: answer 400 then, and do not act on it.
 */
export async function verifyWebhook(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
  options: VerifyWebhookOptions = {},
): Promise<WebhookEvent> {
  if (!signature) {
    throw new NexgWebhookError('The NexG-Signature header is missing.', 'missing_signature');
  }
  const match = HEADER.exec(signature.trim());
  if (!match) {
    throw new NexgWebhookError(
      'The NexG-Signature header is not t=<seconds>,v1=<64 hex characters>.',
      'malformed_signature',
    );
  }
  const [, t, given] = match as unknown as [string, string, string];

  const tolerance = options.toleranceSeconds ?? 300;
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - Number(t)) > tolerance) {
    throw new NexgWebhookError(
      `The signature was made more than ${tolerance} seconds from your clock, so it could be a replay.`,
      'expired',
    );
  }

  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  if (!sameHex(expected, given)) {
    throw new NexgWebhookError(
      'The signature does not match: check the secret, and that the body is exactly as it arrived.',
      'mismatch',
    );
  }

  try {
    return JSON.parse(rawBody) as WebhookEvent;
  } catch {
    throw new NexgWebhookError('The body is signed but is not JSON.', 'not_json');
  }
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

/** Compares two hex strings of the same length in constant time. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
