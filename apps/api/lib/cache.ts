import type { ApiCredential, RateLimitResult } from './auth';

/**
 * Which caches may keep an answer.
 *
 * Vercel's CDN answers a cached URL without running the route. Public reads
 * used to be cached whatever the request carried, so a key sent as
 * `X-Api-Key` could get a cached 200 without ever being checked
 * (`Authorization: Bearer` already skipped the cache). Now:
 *
 * - a request without a key gets the shared, cacheable answer. It varies on
 *   the credential headers, so the CDN never serves it to a request that
 *   carries one;
 * - a request with a key is answered privately and never stored, so the key
 *   is checked and the request spends tokens every time. That answer also
 *   says how many tokens are left, which a shared answer cannot.
 */
export const CREDENTIAL_HEADERS = 'X-Api-Key, Authorization';

/** Headers for a public read: shared when no key was sent, private when one was. */
export function readHeaders(
  credential: Pick<ApiCredential, 'anonymous' | 'environment'>,
  sharedCache: string,
  rate: RateLimitResult | undefined,
): Record<string, string> {
  if (credential.anonymous) return { 'Cache-Control': sharedCache, Vary: CREDENTIAL_HEADERS };
  return { ...privateHeaders(rate, credential), Vary: CREDENTIAL_HEADERS };
}

/**
 * Headers for an answer only the caller may see: never stored, with the
 * tokens left, and which kind of key answered (`NexG-Environment: live` or
 * `test`), so a developer can tell a sandbox answer from a real one.
 */
export function privateHeaders(
  rate: RateLimitResult | undefined,
  credential?: Pick<ApiCredential, 'anonymous' | 'environment'>,
): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    ...(rate && rate.remaining !== null ? { 'RateLimit-Remaining': String(rate.remaining) } : {}),
    ...(credential && !credential.anonymous ? { 'NexG-Environment': credential.environment } : {}),
  };
}
