/**
 * Loading the Google Maps JavaScript API, once.
 *
 * The script is a global side effect: load it twice and Google
 * logs a warning and discards the second copy, which in practice
 * means whichever map mounted second gets a half-initialised
 * library. React in development mounts everything twice, so this
 * is not a hypothetical.
 *
 * So there is one promise per page load, shared by every map on
 * it, and a component that unmounts does not undo it.
 */

declare global {
  interface Window {
    google?: typeof google;
    __nexgMapsPromise?: Promise<typeof google.maps>;
  }
}

export interface MapsLoad {
  key: string;
  /** Extra libraries beyond `maps` and `marker`. */
  libraries?: string[];
}

export function loadGoogleMaps({ key, libraries = [] }: MapsLoad): Promise<typeof google.maps> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Maps can only load in a browser.'));
  }
  if (!key) {
    return Promise.reject(new Error('No Google Maps key is configured.'));
  }
  if (window.__nexgMapsPromise) return window.__nexgMapsPromise;

  /* `marker` carries Advanced Markers, which every pin on the live
     screen is; `geometry` is what measures a radius. */
  const wanted = [...new Set(['maps', 'marker', 'geometry', ...libraries])];

  window.__nexgMapsPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }

    const callback = '__nexgMapsReady';
    const script = document.createElement('script');
    const params = new URLSearchParams({
      key,
      libraries: wanted.join(','),
      callback,
      /* Asking for a version by channel rather than letting Google
         pick: a map that changes behaviour the week Google ships a
         new default is a bug nobody can reproduce. */
      v: 'quarterly',
      loading: 'async',
    });

    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;

    (window as unknown as Record<string, unknown>)[callback] = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error('Maps loaded but the library is missing.'));
      delete (window as unknown as Record<string, unknown>)[callback];
    };

    script.addEventListener('error', () => {
      /* Cleared, so a second attempt is possible — a map that fails
         once because the network dropped should not be dead for the
         rest of the session. */
      delete window.__nexgMapsPromise;
      reject(new Error('Google Maps could not load. Check the key and its referrer rules.'));
    });

    document.head.appendChild(script);
  });

  return window.__nexgMapsPromise;
}

/** The tokens NexG's map style uses, for anything drawn by hand. */
export const MAP_COLOURS = {
  ink: '#14110F',
  gold: '#C9A227',
  success: '#1E7D4F',
  danger: '#B3261E',
  info: '#2B5F9E',
  muted: '#8A8178',
} as const;
