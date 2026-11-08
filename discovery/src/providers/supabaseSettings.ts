import type { DiscoveryProvider } from './DiscoveryProvider';

/**
 * Settings and capabilities of the Supabase provider (plan step E2, 8 Nov 2026).
 * Kept apart from the provider so the app shell and vite.config.ts can check them without loading it.
 * Error messages never repeat the key.
 */
export const SUPABASE_PROVIDER_VERSION = 'discovery-provider/supabase-v1';

/**
 * Supabase has no ratings, delivery times or price levels, and the demo seed has no opening hours,
 * so name order is the only honest sort and Open now stays off (plan step E5).
 */
export const supabaseCapabilities = {
  availabilityFilter: false, nearestSort: false, priceRangeFilter: false, transactions: false,
  resultSemantics: 'exact/v1', supportedSorts: ['recommended'],
} as const satisfies DiscoveryProvider['capabilities'];

export interface SupabaseSettings { origin: string; anonKey: string }

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** The key's role, from a legacy JWT payload or a new-style key prefix. Unknown formats give undefined. */
export function supabaseKeyRole(key: string): string | undefined {
  if (key.startsWith('sb_secret_')) return 'secret';
  if (key.startsWith('sb_publishable_')) return 'publishable';
  const parts = key.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || !payload) return undefined;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json: unknown = JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')));
    const role = json && typeof json === 'object' ? (json as { role?: unknown }).role : undefined;
    return typeof role === 'string' ? role : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Accepts only a plain project URL and a public key. Every VITE_ setting is built into the page,
 * so a service-role or secret key would reach every visitor; it is refused.
 */
export function supabaseSettings(url: unknown, key: unknown): SupabaseSettings {
  let parsed: URL | undefined;
  try { parsed = typeof url === 'string' && url ? new URL(url) : undefined; } catch { parsed = undefined; }
  const secure = parsed?.protocol === 'https:' || (parsed?.protocol === 'http:' && LOOPBACK.has(parsed.hostname));
  if (!parsed || !secure || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('VITE_SUPABASE_URL must be the Supabase project URL, such as https://<project>.supabase.co, or http://127.0.0.1:54321 for the local Supabase');
  }
  if (typeof key !== 'string' || !key || /\s/.test(key)) {
    throw new Error("VITE_SUPABASE_ANON_KEY is missing. Paste the project's public anon or publishable key into .env.local");
  }
  const role = supabaseKeyRole(key);
  if (role !== undefined && role !== 'anon' && role !== 'publishable') {
    throw new Error('VITE_SUPABASE_ANON_KEY must be the public anon or publishable key. A service-role or secret key would be sent to every visitor');
  }
  return { origin: parsed.origin, anonKey: key };
}
