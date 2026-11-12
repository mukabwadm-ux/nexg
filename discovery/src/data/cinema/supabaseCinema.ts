import { nairobiDay, type CinemaConnector, type Programme, type SeatSnapshot } from './cinema';
import { supabaseSettings } from '../../providers/supabaseSettings';

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The shared backend owns the programme and the seat availability snapshot. */
export function supabaseCinemaConnector(
  url: unknown, anonKey: unknown, fetchImpl: typeof fetch = globalThis.fetch,
): CinemaConnector {
  const settings = supabaseSettings(url, anonKey);

  async function rpc(name: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const response = await fetchImpl(new URL('/rest/v1/rpc/' + name, settings.origin), {
      method: 'POST',
      headers: { apikey: settings.anonKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(12_000),
      redirect: 'error',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('The cinema service is temporarily unavailable.');
    const value: unknown = await response.json();
    if (!object(value) || typeof value.observedAt !== 'string' || !Number.isFinite(Date.parse(value.observedAt))) {
      throw new Error('The cinema service returned an invalid response.');
    }
    return value;
  }

  return {
    id: 'nexg-supabase-cinema',
    holds: false,
    async getProgramme(query, signal) {
      const result = await rpc('rpc_cinema_programme', {
        p_from: nairobiDay(query.from), p_days: query.days,
        p_merchant_id: query.merchantId ?? null, p_film_id: query.filmId ?? null,
      }, signal);
      if (!Array.isArray(result.films) || !Array.isArray(result.showings)) {
        throw new Error('The cinema service returned an invalid programme.');
      }
      return result as unknown as Programme;
    },
    async getSeats(showing, signal) {
      const result = await rpc('rpc_cinema_seat_map', { p_showing_id: showing.id }, signal);
      if (result.showingId !== showing.id || !object(result.plan) || result.plan.screenId !== showing.screenId ||
        !Array.isArray(result.plan.rows) || !Array.isArray(result.taken) ||
        !result.taken.every((code: unknown) => typeof code === 'string')) {
        throw new Error('The cinema service returned an invalid seat map.');
      }
      return result as unknown as SeatSnapshot;
    },
  };
}
