import { maps } from '@nexg/ui/capabilities';

import { createPublicClient } from '@/lib/supabase/public';

/**
 * What the address routes share: which Google key to use, how to
 * explain a refusal, and the places NexG already knows.
 *
 * Server only. The routes under /api/location call Google from a
 * Vercel function so the request can be shaped and the server key
 * stays out of the bundle.
 */

/** Kenya, with room around the launch cities. A bias, not a filter. */
export const KENYA_BOX = {
  rectangle: {
    low: { latitude: -4.8, longitude: 33.9 },
    high: { latitude: 1.6, longitude: 41.9 },
  },
};

/*
 * The server's own key, not the browser's.
 *
 * These cannot be the same key. The browser key must be locked to
 * our domains by HTTP referrer, or anyone can lift it out of the
 * bundle and spend our quota. These requests come from a Vercel
 * function, which sends no Referer header at all, so a
 * referrer-restricted key is refused with "Requests from referer
 * <empty> are blocked".
 *
 * So GOOGLE_MAPS_API_KEY, restricted by API rather than by
 * referrer, is what these routes want. It falls back to the public
 * key so a deployment with only one key still works, which only
 * succeeds if the public key has no referrer restriction.
 */
export function placesKey(): { key: string; usedServerKey: boolean } {
  const serverKey = process.env['GOOGLE_MAPS_API_KEY'] ?? '';
  /* Search needs a key, not a map: gating on maps() would demand
     the Map ID too. */
  return { key: serverKey || maps().key, usedServerKey: Boolean(serverKey) };
}

export const NO_KEY_REASON = 'Address search is off. Set GOOGLE_MAPS_API_KEY (Places API (New)).';

/** Google's reason codes, in words for whoever just changed a key. */
const PLAIN: Record<string, string> = {
  API_KEY_HTTP_REFERRER_BLOCKED:
    'That key is restricted to websites. A referrer-restricted key can never work here,' +
    ' because this call comes from a server and sends no referer. Set Application' +
    ' restrictions to None on the key in GOOGLE_MAPS_API_KEY — and keep the website' +
    ' restriction on the separate browser key.',
  API_KEY_IP_ADDRESS_BLOCKED:
    'That key is restricted to IP addresses. Vercel functions have no fixed egress IP,' +
    ' so set Application restrictions to None on this key.',
  API_KEY_ANDROID_APP_BLOCKED:
    'That key is restricted to an Android app, so it cannot be used from a server.',
  API_KEY_IOS_APP_BLOCKED:
    'That key is restricted to an iOS app, so it cannot be used from a server.',
  API_KEY_SERVICE_BLOCKED:
    'The key is reaching Google, but its API restrictions do not include Places API' +
    ' (New). Add it on the key, or set API restrictions to Don’t restrict key.',
  SERVICE_DISABLED:
    'Places API (New) is not enabled on this Cloud project. It is a separate entry' +
    ' from the older Places API — enable it in the API Library.',
  API_KEY_INVALID:
    'That key is not valid. Copy it again from Credentials → your key → Show' +
    ' key, watching for a missing character at either end.',
  BILLING_DISABLED:
    'Billing is not enabled on this Cloud project. Places API (New) will not serve a' +
    ' request without it.',
  RATE_LIMIT_EXCEEDED: 'The project is over its quota for now.',
};

/**
 * Says that Google refused, and why.
 *
 * A bare empty list is what Google returns when it simply found
 * nothing. A referrer-locked key, an unenabled API and a genuine
 * no-match must not wear the same face, so the reason code travels
 * back to the person who has just added the key.
 */
export async function refusalReason(response: Response, usedServerKey: boolean): Promise<string> {
  const detail = await response.text().catch(() => '');
  let parsed:
    | {
        error?: {
          message?: string;
          details?: { reason?: string }[];
        };
      }
    | undefined;
  try {
    parsed = JSON.parse(detail) as typeof parsed;
  } catch {
    parsed = undefined;
  }

  const why = parsed?.error?.message;
  const reasonCode = parsed?.error?.details?.find((d) => d.reason)?.reason;
  const plain = reasonCode ? PLAIN[reasonCode] : undefined;

  return (
    `Address search is configured but Google refused the request (HTTP ${response.status}).` +
    (reasonCode ? ` Google's reason: ${reasonCode}.` : '') +
    (plain
      ? ` ${plain}`
      : (why ? ` ${why}` : '') +
        (usedServerKey
          ? ' This used GOOGLE_MAPS_API_KEY, so check that key’s own API' +
            ' restrictions include Places API (New) and that billing is enabled on' +
            ' the Cloud project.'
          : ' This used the browser key, because GOOGLE_MAPS_API_KEY is not set. A' +
            ' referrer-restricted key cannot work here: the call comes from a server' +
            ' and sends no referer. Set GOOGLE_MAPS_API_KEY to a second key restricted' +
            ' by API rather than by referrer.')) +
    (usedServerKey ? '' : ' (GOOGLE_MAPS_API_KEY is not set.)')
  );
}

/** Almost always the timeout: a slow geocoder and an absent one are different problems. */
export function unreachableReason(error: unknown): string {
  const timedOut = error instanceof Error && error.name === 'TimeoutError';
  return timedOut
    ? 'Google did not answer in time, so only places NexG already knows are shown.'
    : 'Address search could not reach Google, so only places NexG already knows are shown.';
}

/**
 * Places NexG already knows about.
 *
 * Read from `merchant_public` rather than the branch table, because
 * guests type the name over the door — "Westlands Trattoria", not
 * whatever the branch row is called internally. These beat a
 * geocoder for what people actually type, cost nothing, and come
 * with coordinates.
 */
export async function knownPlaces(query: string, limit = 5) {
  /*
   * `.or()` takes a PostgREST filter *string*, so the term is being
   * interpolated into a small query language: commas, parentheses
   * and dots change which rows come back. Stripped rather than
   * escaped, because PostgREST has no escape for these inside a
   * filter value, and nobody searching for a hotel needs a comma.
   */
  const safe = query
    .replace(/[,().*"'%\\]/g, ' ')
    .trim()
    .slice(0, 60);
  if (safe.length < 3) return [];

  const supabase = createPublicClient();
  const { data } = await supabase
    .from('merchant_public')
    .select('trading_name, branch_name, city_name, branch_latitude, branch_longitude')
    .or(`trading_name.ilike.%${safe}%,branch_name.ilike.%${safe}%`)
    .not('branch_latitude', 'is', null)
    .limit(limit);

  return (
    (data as
      | {
          trading_name: string;
          branch_name: string | null;
          city_name: string | null;
          branch_latitude: number;
          branch_longitude: number;
        }[]
      | null) ?? []
  ).map((m) => ({
    label: m.trading_name,
    address_line: [m.branch_name, m.city_name].filter(Boolean).join(', ') || null,
    plus_code: null,
    lat: m.branch_latitude,
    lng: m.branch_longitude,
    coverage: 'unknown' as const,
    source: 'search',
  }));
}
