import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/*
 * Fetching a URL a visitor typed, without letting them aim the server at
 * itself.
 *
 * Every hop is checked: https/http only, no credentials in the URL, a host
 * on the caller's allow-list (when given), and a DNS answer with no private,
 * loopback or link-local address. Redirects are followed by hand so each new
 * location goes through the same checks. Bodies are capped and the whole
 * request is time-boxed.
 */

export class SafeFetchError extends Error {}

const USER_AGENT = 'Mozilla/5.0 (compatible; NexG-LinkPreview/1.0; +https://nexgapp.com)';

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  ) {
    return true;
  }
  if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice('::ffff:'.length));
  if (isIP(normalized) !== 4) return false;
  const [first = 0, second = 0] = normalized.split('.').map(Number);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

async function assertPublic(url: URL, allowHost?: (host: string) => boolean) {
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new SafeFetchError('Only web links are supported.');
  if (url.username || url.password) throw new SafeFetchError('That link is not supported.');
  const host = url.hostname.toLowerCase();
  if (allowHost && !allowHost(host)) throw new SafeFetchError('That link is not supported.');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    isIP(host.replace(/^\[|\]$/g, ''))
  )
    throw new SafeFetchError('That link is not supported.');
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address)))
    throw new SafeFetchError('That link is not supported.');
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, maxBytes - size);
      chunks.push(chunk);
      size += chunk.length;
      if (chunk.length < value.length) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export interface SafeFetchOptions {
  allowHost?: (host: string) => boolean;
  maxBytes?: number;
  timeoutMs?: number;
  accept?: string;
  maxRedirects?: number;
}

/** GET with every hop checked. Returns the final URL, response and capped body. */
export async function safeGet(
  raw: string | URL,
  {
    allowHost,
    maxBytes = 1_000_000,
    timeoutMs = 8000,
    accept = 'text/html',
    maxRedirects = 3,
  }: SafeFetchOptions = {},
): Promise<{ url: URL; response: Response; body: Uint8Array }> {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = typeof raw === 'string' ? new URL(raw) : raw;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublic(current, allowHost);
    const response = await fetch(current, {
      redirect: 'manual',
      signal,
      headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'en' },
    });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => undefined);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new SafeFetchError(`The page answered ${response.status}.`);
    return { url: current, response, body: await readCapped(response, maxBytes) };
  }
  throw new SafeFetchError('That link redirects too many times.');
}

/** The first part of an HTML page, as text. */
export async function safeGetHtml(raw: string | URL, options: SafeFetchOptions = {}) {
  const { url, response, body } = await safeGet(raw, { maxBytes: 700_000, ...options });
  if (!response.headers.get('content-type')?.includes('text/html'))
    throw new SafeFetchError('That link is not a web page.');
  return { url, html: new TextDecoder().decode(body) };
}
