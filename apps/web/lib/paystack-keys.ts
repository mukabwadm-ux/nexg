import 'server-only';

import crypto from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

/**
 * Where this server's Paystack secret keys come from.
 *
 * Without PAYSTACK_KEYS_TOKEN: PAYSTACK_TEST_SECRET_KEY and
 * PAYSTACK_LIVE_SECRET_KEY from the environment.
 *
 * With PAYSTACK_KEYS_TOKEN: only the keys saved in the console (Finance ›
 * Paystack › Keys), fetched from Supabase Vault through
 * rpc_paystack_server_keys with a time-limited proof made from the token. The
 * environment keys are then ignored, also when the fetch fails.
 *
 * Reading a key is synchronous, so whatever reads one awaits
 * loadPaystackKeys() first. Without that, or after a failed fetch, there is no
 * key and Paystack counts as not connected.
 *
 * Fetched keys stay in this server's memory: never in Next's cache, a file or
 * a log. The console has the same file (apps/admin/lib/paystack-keys.ts).
 */

type Mode = 'test' | 'live';
type Keys = Record<Mode, string | null>;

/* Keys older than this are fetched again by the next load. */
const FRESH_MS = 30_000;
/* Keys older than this are never read. Longer than FRESH_MS so that work which
   began with a load can finish: the payments worker runs for up to a minute. */
const USABLE_MS = 120_000;
/* The least time between two early fetches (refreshPaystackKeys). */
const REFRESH_GAP_MS = 5_000;
const TIMEOUT_MS = 8_000;

let loaded: { keys: Keys; at: number } | null = null;
let pending: Promise<void> | null = null;
let refreshedAt = 0;

const serverToken = () => process.env.PAYSTACK_KEYS_TOKEN?.trim() ?? '';

/** The key set for a mode, not yet checked. */
export function paystackSecret(mode: Mode): string | null | undefined {
  if (!serverToken()) {
    return mode === 'live'
      ? process.env.PAYSTACK_LIVE_SECRET_KEY
      : process.env.PAYSTACK_TEST_SECRET_KEY;
  }
  if (!loaded || Date.now() - loaded.at >= USABLE_MS) return null;
  return loaded.keys[mode];
}

const isKey = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

async function fetchKeys(token: string): Promise<void> {
  const at = Date.now();
  let code: string | undefined;
  try {
    /* Its own client: no cookie and no session, so the call is anonymous, and
       no-store, because Next would otherwise keep the answer in its cache. */
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              cache: 'no-store',
              signal: AbortSignal.timeout(TIMEOUT_MS),
            }),
        },
      },
    );
    const minute = Math.floor(at / 60_000);
    const proof = crypto
      .createHmac('sha256', token)
      .update(`paystack-keys:${minute}`)
      .digest('hex');
    const { data, error } = await client.rpc(
      'rpc_paystack_server_keys' as never,
      { p_minute: minute, p_proof: proof } as never,
    );
    code = error?.code;
    const answer = data as { test?: unknown; live?: unknown } | null;
    if (!error && answer && isKey(answer.test) && isKey(answer.live)) {
      loaded = { keys: { test: answer.test, live: answer.live }, at };
      return;
    }
  } catch {
    /* Handled as any other failed fetch. */
  }
  /* A failed early fetch leaves keys that are still fresh; stale ones go. */
  if (loaded && Date.now() - loaded.at >= FRESH_MS) loaded = null;
  /* The database's error code only: never a key, the token or the proof. */
  console.warn('Paystack keys could not be loaded', { code: code || 'unknown' });
}

/* One fetch at a time: everyone who asks meanwhile waits for the same one. */
function fetchOnce(token: string): Promise<void> {
  pending ??= fetchKeys(token).finally(() => {
    pending = null;
  });
  return pending;
}

/** Await before reading a key. Does nothing without PAYSTACK_KEYS_TOKEN; never throws. */
export async function loadPaystackKeys(): Promise<void> {
  const token = serverToken();
  if (!token || (loaded && Date.now() - loaded.at < FRESH_MS)) return;
  await fetchOnce(token);
}

/**
 * Fetches again although the keys are still fresh, for a signature that matched
 * none of them: a key may just have been changed in the console. At most once
 * every five seconds, so forged calls cannot hammer the database.
 */
export async function refreshPaystackKeys(): Promise<void> {
  const token = serverToken();
  if (!token) return;
  if (!pending) {
    if (Date.now() - refreshedAt < REFRESH_GAP_MS) return;
    refreshedAt = Date.now();
  }
  await fetchOnce(token);
}
