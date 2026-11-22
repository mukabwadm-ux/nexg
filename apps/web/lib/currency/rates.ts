import { cleanRates, SNAPSHOT_RATES, type FxRates, type RateTable } from './money';

/**
 * Exchange rates, most trusted first.
 *
 * 1. The database copy (public.fx_rate), refreshed every six hours by a
 *    pg_cron job that asks open.er-api.com. Used while under a day and a
 *    half old.
 * 2. The provider itself, asked directly — for when the database copy is
 *    missing or old (the migration not yet applied, the job failing).
 * 3. The database copy however old: the last good rates beat none.
 * 4. The snapshot written into the code.
 *
 * Pure apart from the two readers it is handed, so it can be tested
 * without a network or a database.
 */

/** open.er-api.com: free, no key, KES as a base, refreshed daily. */
export const PROVIDER_URL = 'https://open.er-api.com/v6/latest/KES';

/** Past this the database copy is stale and the provider is asked first. */
export const FRESH_FOR_MS = 36 * 60 * 60 * 1000;

export interface StoredRates {
  rates: RateTable;
  updatedAt: string;
}

export interface RateSources {
  readStored: () => Promise<StoredRates | null>;
  fetchProvider: () => Promise<StoredRates | null>;
  now?: () => number;
}

export async function resolveRates({
  readStored,
  fetchProvider,
  now = Date.now,
}: RateSources): Promise<FxRates> {
  const stored = await readStored().catch(() => null);
  const storedOk = stored && cleanRates(stored.rates);
  const age = stored ? now() - Date.parse(stored.updatedAt) : Infinity;

  if (stored && storedOk && Number.isFinite(age) && age < FRESH_FOR_MS) {
    return { base: 'KES', rates: storedOk, updatedAt: stored.updatedAt, source: 'stored' };
  }

  const live = await fetchProvider().catch(() => null);
  const liveOk = live && cleanRates(live.rates);
  if (live && liveOk) {
    return { base: 'KES', rates: liveOk, updatedAt: live.updatedAt, source: 'live' };
  }

  if (stored && storedOk) {
    return { base: 'KES', rates: storedOk, updatedAt: stored.updatedAt, source: 'stored' };
  }

  return SNAPSHOT_RATES;
}

/** Turn the provider's answer into rates, or null if it is not a good one. */
export function parseProviderBody(body: unknown): StoredRates | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as {
    result?: string;
    base_code?: string;
    rates?: unknown;
    time_last_update_unix?: number;
  };
  if (b.result !== 'success' || b.base_code !== 'KES') return null;
  const rates = cleanRates(b.rates);
  if (!rates) return null;
  const when =
    typeof b.time_last_update_unix === 'number'
      ? new Date(b.time_last_update_unix * 1000).toISOString()
      : new Date().toISOString();
  return { rates, updatedAt: when };
}
