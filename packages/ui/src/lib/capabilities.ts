/**
 * What is actually connected, answered in one place.
 *
 * Two halves hold the truth and neither is enough alone. The
 * database knows what NexG *means* to have — that payments go
 * through Paystack, that the map is Google's — and the deployment
 * knows whether the keys are really there. A screen that trusted
 * only the database would claim a map it cannot draw; one that
 * trusted only the environment would not know what was missing.
 *
 * So this reads the environment, and the integration registry
 * names the variables. Every page that depends on a provider asks
 * here rather than reaching for `process.env` directly, because
 * the twelfth place something checks `process.env.FOO` is the
 * place somebody forgets.
 *
 * The rule throughout: when a capability is off, say which
 * variable turns it on. "Maps unavailable" wastes an afternoon;
 * "set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY" does not.
 */

export interface Capability {
  /** Whether the thing can actually be done right now. */
  live: boolean;
  /** Environment variables this deployment still needs. */
  missing: string[];
  /** One sentence for a person reading a screen. */
  why: string | null;
}

function need(vars: Record<string, string | undefined>): string[] {
  return Object.entries(vars)
    .filter(([, v]) => !v || v.trim() === '')
    .map(([k]) => k);
}

function result(vars: Record<string, string | undefined>, off: string): Capability {
  const missing = need(vars);
  return {
    live: missing.length === 0,
    missing,
    why: missing.length === 0 ? null : `${off} Set ${missing.join(' and ')}.`,
  };
}

/**
 * Google Maps.
 *
 * Both halves are required. A key without a Map ID gives the
 * default blue-and-beige Google style instead of NexG's, and
 * Advanced Markers — which every marker on the live screen is —
 * silently refuse to render without one. Half-configured would
 * look like a bug in our code.
 */
export function maps(): Capability & { key: string; mapId: string } {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID ?? '';
  return {
    ...result(
      { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: key, NEXT_PUBLIC_GOOGLE_MAPS_ID: mapId },
      'No map is drawn, because drawing an illustrative one would be read as the real city.',
    ),
    key,
    mapId,
  };
}

/**
 * Paystack.
 *
 * The public key is what the browser needs to open a checkout; the
 * secret is what the server needs to start one and to verify a
 * webhook. The secret is never read in client code — this function
 * runs in both places, so it only ever reports whether it is set.
 */
export function payments(): Capability & { publicKey: string } {
  const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? '';
  /* `process.env` on the client only carries NEXT_PUBLIC_ names, so
     in a browser the secret always reads as absent. The server is
     the half that decides whether a payment can actually start, and
     it is the half that calls this before doing so. */
  const secret = typeof window === 'undefined' ? (process.env.PAYSTACK_SECRET_KEY ?? '') : 'client';

  return {
    ...result(
      { NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: publicKey, PAYSTACK_SECRET_KEY: secret },
      'No payment provider is connected, so nothing is charged and a refund is recorded rather than moved.',
    ),
    publicKey,
  };
}

/** Whether a message queued in `notification_log` will ever go out. */
export function notifications(): Capability {
  return result(
    { NEXT_PUBLIC_NOTIFICATIONS_WORKER: process.env.NEXT_PUBLIC_NOTIFICATIONS_WORKER },
    'Nothing drains the message queue, so anything sent is recorded rather than delivered.',
  );
}

/**
 * Realtime.
 *
 * Needs no key of its own — if Supabase is reachable, so is
 * Realtime. It is here so that a page can say "live" or "refreshed
 * on a timer" from the same place as everything else, rather than
 * assuming.
 */
export function realtime(): Capability {
  return result(
    { NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL },
    'Live updates are off.',
  );
}

/** Everything, for the health tile that lists what is still to do. */
export function allCapabilities(): Record<string, Capability> {
  return {
    maps: maps(),
    payments: payments(),
    notifications: notifications(),
    realtime: realtime(),
  };
}
