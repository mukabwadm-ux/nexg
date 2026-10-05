'use client';

/**
 * The only file in this repository that touches
 * `navigator.geolocation`.
 *
 * That is enforced, not hoped for: an ESLint rule forbids the
 * identifier anywhere outside this directory, and a Playwright
 * test loads every public route with a spy installed and fails
 * the build if anything calls it before a user gesture. Both
 * guards exist because this is the kind of rule that holds for a
 * year and then quietly breaks in a refactor nobody reviewed
 * closely, and the symptom — a permission prompt on page load —
 * is one a browser punishes permanently.
 *
 * Why it matters that much: Chrome degrades and eventually
 * auto-blocks geolocation prompts that arrive without a user
 * gesture, and a Block is not a decision a visitor can easily
 * reverse. Prompting badly once costs the ability to prompt at
 * all. Asking well is what protects asking.
 */

export type ConsentState = 'granted' | 'prompt' | 'denied' | 'unavailable';

export interface Fix {
  lat: number;
  lng: number;
  /** Radius the browser claims, in metres. */
  accuracy_m: number;
}

export type FixResult =
  | { ok: true; fix: Fix }
  | { ok: false; reason: 'denied' | 'unavailable' | 'timeout'; message: string };

/**
 * What the browser will do if asked, without asking.
 *
 * `permissions.query` does not prompt and does not read a
 * position, so it is safe on load. It is used only to choose
 * wording — "Asks first" against "Allowed earlier" — never to
 * decide whether to read a location. Even `granted` does not
 * licence a silent read: a returning visitor is placed from
 * their saved pin and offered the button, because a page that
 * re-reads GPS because it once had permission is tracking,
 * whatever it calls itself.
 */
export async function consentState(): Promise<ConsentState> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return 'unavailable';
  }
  if (!('permissions' in navigator) || !navigator.permissions?.query) {
    return 'prompt';
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state as ConsentState;
  } catch {
    /* Some browsers refuse the query for geolocation specifically.
       Not knowing is the same as "it will ask", which is the safe
       assumption and the honest label. */
    return 'prompt';
  }
}

/**
 * Read the position once.
 *
 * **Call this from inside a click handler and nowhere else.**
 *
 * One reading, never `watchPosition`. Nothing on a public page
 * needs a stream of positions — the guest is choosing a delivery
 * address, not being followed — and a watch left running is the
 * difference between asking where to deliver and keeping a
 * history.
 *
 * `enableHighAccuracy` is off on desktops on purpose. A laptop
 * has no GPS; the flag makes the browser work harder to return
 * the same Wi-Fi triangulation several seconds later. On a phone
 * it is worth the battery, because it is the difference between
 * a street and a building.
 */
export function readPositionOnce(options?: { highAccuracy?: boolean }): Promise<FixResult> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.resolve({
      ok: false,
      reason: 'unavailable',
      message: 'This browser cannot share a location. Type your address instead.',
    });
  }

  const highAccuracy = options?.highAccuracy ?? isHandheld();

  return new Promise<FixResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          ok: true,
          fix: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy_m: Math.round(position.coords.accuracy ?? 0),
          },
        }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({
            ok: false,
            reason: 'denied',
            message:
              'Location is blocked for nexgapp.com in your browser — that is fine. Type your address instead, or re-enable it from the padlock icon in the address bar whenever you like.',
          });
          return;
        }
        if (error.code === error.TIMEOUT) {
          resolve({
            ok: false,
            reason: 'timeout',
            message: 'Your browser took too long to answer. Type your address instead.',
          });
          return;
        }
        resolve({
          ok: false,
          reason: 'unavailable',
          message: 'Your browser could not work out where you are. Type your address instead.',
        });
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: 8000,
        /* A fix from the last minute is the same fix. Re-reading
           it costs a second and a little battery for no new
           information. */
        maximumAge: 60_000,
      },
    );
  });
}

function isHandheld(): boolean {
  if (typeof window === 'undefined') return false;
  if ('userAgentData' in navigator) {
    const data = (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData;
    if (typeof data?.mobile === 'boolean') return data.mobile;
  }
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * How precise a fix is, in words.
 *
 * Used for the banded analytics figure and for the sentence on
 * the confirm screen. A desktop fix is routinely several hundred
 * metres out, and the honest thing is to say so and ask the
 * visitor to drag the pin rather than present a guess as an
 * address.
 */
export function accuracyBand(metres: number | null | undefined): 'exact' | 'street' | 'area' | 'city' {
  if (metres === null || metres === undefined) return 'city';
  if (metres <= 25) return 'exact';
  if (metres <= 100) return 'street';
  if (metres <= 2000) return 'area';
  return 'city';
}

/** Above this, the pin has to be adjusted or acknowledged before it can be used. */
export const ACCURACY_NEEDS_CONFIRMING_M = 100;
