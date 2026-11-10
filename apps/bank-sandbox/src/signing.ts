import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Every event the bank sends, and every event NexG fetches from it, carries
 *
 *   X-Bank-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
 *
 * signed with the webhook secret both sides hold. The timestamp stops an old
 * event being replayed; receivers refuse anything more than five minutes off.
 */
export const SIGNATURE_HEADER = 'x-bank-signature';
export const TOLERANCE_SECONDS = 300;

export function sign(body: string, secret: string, now = Date.now()) {
  const t = Math.floor(now / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

export function verify(
  body: string,
  header: string | null | undefined,
  secret: string,
  now = Date.now(),
) {
  const match = /^t=(\d{9,12}),v1=([0-9a-f]{64})$/.exec(header ?? '');
  if (!match) return false;
  const t = Number(match[1]);
  if (Math.abs(Math.floor(now / 1000) - t) > TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${match[1]}.${body}`).digest();
  const given = Buffer.from(match[2]!, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
