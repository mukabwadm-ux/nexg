/**
 * A fetch that never answers from Next's Data Cache.
 *
 * Next 14 keeps the answers to fetches made in route handlers, supabase-js's
 * included, in its Data Cache: for the route's `revalidate` seconds where one
 * is set, and with no expiry where none is, even on routes marked
 * force-dynamic. For public catalogue reads a short cache is intended. For
 * these it is wrong:
 *
 * - the key check: a revoked key would keep working;
 * - the rate-limit spend: repeated requests would spend no tokens;
 * - a merchant's own orders and catalogue: changes would not show.
 *
 * Every database client that checks a key, spends tokens or reads or writes
 * a merchant's own records passes this as its fetch.
 */
export const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' });
