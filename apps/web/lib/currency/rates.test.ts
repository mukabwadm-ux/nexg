import { describe, expect, it, vi } from 'vitest';

import { SNAPSHOT_RATES } from './money';
import { FRESH_FOR_MS, parseProviderBody, resolveRates } from './rates';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const table = (usd: number) => ({ USD: usd, EUR: 0.0066 });

describe('resolveRates', () => {
  it('uses fresh stored rates without asking the provider', async () => {
    const fetchProvider = vi.fn();
    const out = await resolveRates({
      readStored: async () => ({ rates: table(0.0078), updatedAt: at(60_000) }),
      fetchProvider,
      now: () => NOW,
    });
    expect(out.source).toBe('stored');
    expect(out.rates.USD).toBe(0.0078);
    expect(fetchProvider).not.toHaveBeenCalled();
  });

  it('asks the provider when the stored rates are stale', async () => {
    const out = await resolveRates({
      readStored: async () => ({ rates: table(0.0078), updatedAt: at(FRESH_FOR_MS + 1) }),
      fetchProvider: async () => ({ rates: table(0.0079), updatedAt: at(0) }),
      now: () => NOW,
    });
    expect(out.source).toBe('live');
    expect(out.rates.USD).toBe(0.0079);
  });

  it('falls back to the last good stored rates when the provider fails', async () => {
    const out = await resolveRates({
      readStored: async () => ({ rates: table(0.0078), updatedAt: at(10 * FRESH_FOR_MS) }),
      fetchProvider: async () => {
        throw new Error('offline');
      },
      now: () => NOW,
    });
    expect(out.source).toBe('stored');
    expect(out.rates.USD).toBe(0.0078);
  });

  it('falls back to the provider when the database cannot be read', async () => {
    const out = await resolveRates({
      readStored: async () => {
        throw new Error('no such function');
      },
      fetchProvider: async () => ({ rates: table(0.0079), updatedAt: at(0) }),
      now: () => NOW,
    });
    expect(out.source).toBe('live');
  });

  it('ignores a garbled provider answer and ends at the snapshot when nothing else answers', async () => {
    const out = await resolveRates({
      readStored: async () => null,
      fetchProvider: async () => ({ rates: { EUR: 0.0066 }, updatedAt: at(0) }),
      now: () => NOW,
    });
    expect(out).toEqual(SNAPSHOT_RATES);
  });
});

describe('parseProviderBody', () => {
  it('reads an open.er-api.com answer', () => {
    const parsed = parseProviderBody({
      result: 'success',
      base_code: 'KES',
      time_last_update_unix: 1_795_000_000,
      rates: { KES: 1, USD: 0.00774, EUR: 0.00667, XAU: 0.000002 },
    });
    expect(parsed?.rates).toEqual({ KES: 1, USD: 0.00774, EUR: 0.00667 });
    expect(parsed?.updatedAt).toBe(new Date(1_795_000_000_000).toISOString());
  });

  it('refuses errors, other bases and missing rates', () => {
    expect(parseProviderBody({ result: 'error', 'error-type': 'unsupported-code' })).toBeNull();
    expect(
      parseProviderBody({ result: 'success', base_code: 'USD', rates: { USD: 1 } }),
    ).toBeNull();
    expect(parseProviderBody({ result: 'success', base_code: 'KES', rates: {} })).toBeNull();
    expect(parseProviderBody(null)).toBeNull();
  });
});
