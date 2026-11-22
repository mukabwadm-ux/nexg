/**
 * Where a request came from, passed to the database on every call.
 *
 * The audit log records which device and which address each action
 * came from, so that one shared admin account's actions can be told
 * apart. Postgres sees the headers of the API call, and the API call
 * comes from this server, not from the visitor's browser, so the
 * server forwards what it saw:
 *
 *   x-nexg-client-ip   the visitor's address, from Vercel's x-forwarded-for
 *   x-nexg-client-ua   the visitor's user agent
 *   x-nexg-device      this browser's random id, from the device cookie
 *   x-nexg-surface     which app made the call
 *
 * `audit.fn_request_context()` reads them. The sign-in session comes
 * from the JWT, not from here.
 *
 * Kept free of Next imports so the middleware and tests can use it.
 */

/** A random id per browser. httpOnly, about a year. Not a fingerprint. */
export const DEVICE_COOKIE = 'nexg_device';
export const DEVICE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 400;

const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function isDeviceId(value: string | null | undefined): value is string {
  return typeof value === 'string' && DEVICE_ID.test(value);
}

export function newDeviceId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

interface HeaderSource {
  get(name: string): string | null;
}

/** The first address in x-forwarded-for, which Vercel sets to the visitor's. */
export function clientIp(headers: HeaderSource): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || headers.get('x-real-ip')?.trim() || '';
  /* Addresses only: digits, hex, dots and colons. Anything else is dropped. */
  return /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : null;
}

export function contextHeaders(
  headers: HeaderSource,
  deviceId: string | null | undefined,
  surface: 'admin' | 'merchant' | 'web',
): Record<string, string> {
  const out: Record<string, string> = { 'x-nexg-surface': surface };
  const ip = clientIp(headers);
  if (ip) out['x-nexg-client-ip'] = ip;
  /* Header values must be ISO-8859-1; a user agent with anything else is cut there. */
  const ua = headers
    .get('user-agent')
    ?.replace(/[^\x20-\x7e]/g, '')
    .slice(0, 400);
  if (ua) out['x-nexg-client-ua'] = ua;
  if (isDeviceId(deviceId)) out['x-nexg-device'] = deviceId;
  return out;
}
