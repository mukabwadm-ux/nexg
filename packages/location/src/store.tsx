'use client';

import * as React from 'react';

import {
  ACCURACY_NEEDS_CONFIRMING_M,
  accuracyBand,
  consentState,
  isHandheld,
  readBestPosition,
  type ConsentState,
} from './geolocation';
import type { ChipState, LocationState, Place, ResolutionStep, SavedPlace } from './types';

/**
 * One store, read by every public page.
 *
 * The chip in the header, the sheet, the confirm view, Explore,
 * a merchant page and checkout all read this. Changing the place
 * anywhere changes it everywhere in the same tab immediately,
 * and in other tabs through a BroadcastChannel — because a guest
 * with Explore open in one tab and a merchant in another, who
 * changes the address in one, must not pay a delivery fee
 * calculated for the other.
 */

const DEVICE_KEY = 'nexg.device';
const PLACES_KEY = 'nexg.places';
const SESSION_KEY = 'nexg.loc.session';
const ASKED_KEY = 'nexg.loc.asked';
const CURRENT_KEY = 'nexg.loc.current';
/** Set when the visitor picks a place by hand; GPS leaves it alone for the visit. */
const MANUAL_KEY = 'nexg.loc.manual';

/** A fresh fix this close to a saved place is that place, gate number and all. */
const SAME_PLACE_M = 50;

/** 90 days, per the spec. A pin older than that is probably a trip, not a home. */
const DEVICE_PLACE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface LocationActions {
  connection?: () => Promise<{ place: Place; step: 'ip_city' } | null>;
  resolve: (context: Record<string, unknown>) => Promise<{
    step: ResolutionStep;
    chip_state: ChipState;
    place: Place | null;
  }>;
  confirm: (payload: Record<string, unknown>) => Promise<{
    ok: boolean;
    stored: boolean;
    id?: string;
    place?: Place;
    reason?: string;
  }>;
  coverage: (lat: number, lng: number) => Promise<Partial<Place> & { coverage: string }>;
  /** Street name for a pin. Optional: without it the pin shows coordinates. */
  reverse?: (
    lat: number,
    lng: number,
  ) => Promise<{ address_line: string | null; plus_code: string | null } | null>;
  note: (action: string, detail?: { band?: string; step?: string }) => Promise<void>;
  listSaved: () => Promise<SavedPlace[]>;
  remove: (id: string) => Promise<{ ok: boolean; message?: string }>;
}

interface Ctx extends LocationState {
  savedPlaces: SavedPlace[];
  sheetOpen: boolean;
  panelOpen: boolean;
  openSheet: (why?: string) => void;
  closeSheet: (outcome: 'skipped' | 'dismissed' | 'confirmed') => void;
  setPanelOpen: (open: boolean) => void;
  setPlace: (place: Place, step: ResolutionStep) => Promise<void>;
  clearPlace: () => void;
  forget: (id: string) => Promise<void>;
  deviceId: string;
  sessionId: string;
  actions: LocationActions;
  /** Set once the visitor has seen the "blocked" explanation, so it shows once. */
  blockedNoticeSeen: boolean;
  markBlockedNoticeSeen: () => void;
  setConsent: (state: ConsentState) => void;
  /** Google Maps for the confirm view. Absent or empty, it falls back to the drawing. */
  maps: MapsConfig | null;
}

export interface MapsConfig {
  key: string;
  mapId: string;
}

const LocationContext = React.createContext<Ctx | null>(null);

export function useLocation(): Ctx {
  const ctx = React.useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used inside <LocationProvider>.');
  return ctx;
}

function readJSON<T>(storage: Storage | null, key: string, fallback: T): T {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    /* Private mode, cleared site data, a quota error, a half-written
       value from a previous version — all of them land here, and all
       of them mean the same thing: carry on without it. */
    return fallback;
  }
}

function writeJSON(storage: Storage | null, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* Nothing to do and nothing worth telling the visitor. */
  }
}

function safeStorage(kind: 'local' | 'session'): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/**
 * Places kept in this browser.
 *
 * An anonymous visitor's places never reach the database. A
 * device id is something the client sends, so a row keyed by it
 * is readable by anyone who sends the same string — and these
 * rows hold gate codes, floors and phone numbers. They stay
 * here, and move into the account at sign-in, where there is a
 * real key.
 */
interface StoredDevicePlace extends Place {
  id: string;
  saved_at: number;
}

function loadDevicePlaces(): SavedPlace[] {
  const raw = readJSON<StoredDevicePlace[]>(safeStorage('local'), PLACES_KEY, []);
  const cutoff = Date.now() - DEVICE_PLACE_TTL_MS;
  const fresh = raw.filter((p) => (p.saved_at ?? 0) > cutoff);
  if (fresh.length !== raw.length) writeJSON(safeStorage('local'), PLACES_KEY, fresh);
  return fresh.map((p) => ({ ...p, deviceOnly: true }));
}

function saveDevicePlace(place: Place): SavedPlace {
  const storage = safeStorage('local');
  const existing = readJSON<StoredDevicePlace[]>(storage, PLACES_KEY, []);
  /* Within ~30 m is the same doorway. Four Homes in the list is
     how somebody picks the wrong one. */
  const near = existing.findIndex((p) => metresBetween(p, place) < 30);
  const row: StoredDevicePlace = {
    ...place,
    id: near >= 0 ? existing[near]!.id : newId(),
    saved_at: Date.now(),
  };
  const next = near >= 0 ? existing.map((p, i) => (i === near ? row : p)) : [row, ...existing];
  writeJSON(storage, PLACES_KEY, next.slice(0, 12));
  return { ...row, deviceOnly: true };
}

function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function chipStateFor(place: Place | null, step: ResolutionStep): ChipState {
  if (!place) return 'empty';
  if (place.coverage === 'unlaunched') return 'unlaunched';
  if (place.coverage === 'outside') return 'outside';
  if (step === 'qr') return place.label?.toLowerCase().includes('room') ? 'room' : 'qr';
  if (step === 'ip_city') return 'city';
  return 'set';
}

export function LocationProvider({
  children,
  actions,
  /** Resolved on the server before the page was sent: QR token, deep link, IP city. */
  initial,
  maps = null,
  passive = false,
}: {
  children: React.ReactNode;
  actions: LocationActions;
  initial?: { place: Place | null; step: ResolutionStep } | null;
  maps?: MapsConfig | null;
  /** Keep context available on workflows that do not use shopping location. */
  passive?: boolean;
}) {
  const [place, setPlaceState] = React.useState<Place | null>(initial?.place ?? null);
  const [step, setStep] = React.useState<ResolutionStep>(initial?.step ?? 'none');
  const [consent, setConsent] = React.useState<ConsentState>('prompt');
  const [asked, setAsked] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [savedPlaces, setSavedPlaces] = React.useState<SavedPlace[]>([]);
  const [blockedNoticeSeen, setBlockedSeen] = React.useState(false);
  const [deviceId, setDeviceId] = React.useState('');
  const [sessionId, setSessionId] = React.useState('');

  const channel = React.useRef<BroadcastChannel | null>(null);

  /* ─────────────────────────────────────────── identity for this browser */
  React.useEffect(() => {
    const local = safeStorage('local');
    const session = safeStorage('session');

    let dev = local?.getItem(DEVICE_KEY) ?? '';
    if (!dev) {
      dev = newId();
      try {
        local?.setItem(DEVICE_KEY, dev);
      } catch {
        /* ignore */
      }
    }
    setDeviceId(dev);

    let sess = session?.getItem(SESSION_KEY) ?? '';
    if (!sess) {
      sess = newId();
      try {
        session?.setItem(SESSION_KEY, sess);
      } catch {
        /* ignore */
      }
    }
    setSessionId(sess);

    setAsked(session?.getItem(ASKED_KEY) === '1');
  }, []);

  /* ───────────────────────────────── the rest of the resolution ladder
   *
   * The server may provide a QR or deep-link place. On the client,
   * this device and a signed-in guest's saved places take precedence
   * over the coarse connection-city fallback.
   *
   * Nothing here reads a position. The one read without a tap —
   * a phone whose visitor already allowed location — is the
   * effect below, and it runs after this has placed them from
   * what the browser already knows.
   */
  React.useEffect(() => {
    if (passive) {
      setReady(true);
      return;
    }
    if (!deviceId) return;
    let cancelled = false;

    /*
     * What this browser already knows, read synchronously.
     *
     * This used to sit behind `await consentState()` and `await
     * actions.listSaved()`, so a visitor whose pin was sitting in
     * their own localStorage still watched an empty header and an
     * empty "Where are you staying?" field until a server round
     * trip came back. On a cold start that was seconds, and on a
     * slow connection it is however long the connection takes to
     * tell us something we already had.
     *
     * Nothing here touches the network or the browser's location.
     */
    const device = loadDevicePlaces();
    setSavedPlaces(device);

    /*
     * Asked of React rather than read from the closure.
     *
     * This used to be `if (!place)`, which made a mount-once
     * bootstrap depend on a value that changes every time
     * somebody moves their pin. Declaring that dependency would
     * have re-run the whole ladder — the saved-places request
     * included — on every move; leaving it undeclared was the
     * stale closure the rule exists to catch. The functional
     * form needs neither, because React hands it the current
     * value.
     */
    const remembered = readJSON<{ place: Place; step: ResolutionStep } | null>(
      safeStorage('local'),
      CURRENT_KEY,
      null,
    );
    const fromThisDevice = remembered?.place ?? device[0];
    if (fromThisDevice) {
      setPlaceState((current) => {
        if (current) return current;
        setStep(remembered?.step ?? 'device');
        return fromThisDevice;
      });
    }

    /* Enough to render honestly. The rest refines it. */
    setReady(true);

    void (async () => {
      const state = await consentState();
      if (cancelled) return;
      setConsent(state);

      let account: SavedPlace[] = [];
      try {
        account = await actions.listSaved();
      } catch {
        /* Signed out, or the call failed. Neither is worth a
           message: the device's own list still works. */
      }
      if (cancelled) return;

      if (account.length > 0) {
        setSavedPlaces([
          ...account,
          ...device.filter((d) => !account.some((a) => metresBetween(a, d) < 30)),
        ]);

        /*
         * The account wins over the device only when the device had
         * nothing. Somebody who set an address on this machine a
         * minute ago should not have it replaced by where they
         * ordered from last week because a signed-in list arrived
         * late.
         */
        setPlaceState((current) => {
          if (current) return current;
          setStep('account');
          return account[0] as Place;
        });
        return;
      }

      /*
       * The connection-based city is a last resort. Resolve it after
       * the page has rendered and only after local and account places
       * have been checked, so a slow location lookup cannot delay the
       * first response or override a more precise saved address.
       */
      if (!fromThisDevice && actions.connection) {
        const result = await actions.connection();
        if (cancelled || !result) return;
        setPlaceState((current) => {
          if (current) return current;
          setStep(result.step);
          return result.place;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deviceId, actions, passive]);

  /* ──────────────────────────────────────── one place across tabs */
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const ch = new BroadcastChannel('nexg.location');
    channel.current = ch;
    ch.onmessage = (event: MessageEvent) => {
      const data = event.data as { place: Place | null; step: ResolutionStep } | null;
      if (!data) return;
      setPlaceState(data.place);
      setStep(data.step);
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, []);

  /* ─────────────────────────────── on a phone, where they are standing
   *
   * The ride-hailing behaviour: open the site on a phone that has
   * already allowed location and the pin is where you are. Only
   * when permission is already `granted` — that state cannot
   * prompt, so this never spends the visitor's one chance to be
   * asked well — and only once per page load, as a reading, not a
   * watch.
   *
   * It stands aside for a place somebody chose: a host's QR card,
   * a shared link, or anything picked by hand this visit. And a
   * fix that is only good to a city block is not used at all; the
   * saved pin is a better guess than a vague one.
   */
  const savedRef = React.useRef(savedPlaces);
  savedRef.current = savedPlaces;
  const stepRef = React.useRef(step);
  stepRef.current = step;
  const autoTried = React.useRef(false);

  React.useEffect(() => {
    if (passive) return;
    if (!ready || consent !== 'granted' || autoTried.current || !isHandheld()) return;
    const chosen = stepRef.current;
    if (chosen === 'qr' || chosen === 'deep_link' || chosen === 'point') return;
    const pickedByHand = () => {
      try {
        return safeStorage('session')?.getItem(MANUAL_KEY) === '1';
      } catch {
        return false;
      }
    };
    if (pickedByHand()) return;

    autoTried.current = true;
    let cancelled = false;

    void (async () => {
      const result = await readBestPosition();
      if (cancelled || !result.ok) return;
      const { fix } = result;
      if (fix.accuracy_m > ACCURACY_NEEDS_CONFIRMING_M) return;
      void actions.note('allowed', { band: accuracyBand(fix.accuracy_m), step: 'gps' });

      /* Standing at a place they saved: that place, with the gate
         number and landmark they gave it, not a bare coordinate. */
      const known = savedRef.current.find((p) => metresBetween(p, fix) <= SAME_PLACE_M);
      let next: Place;
      if (known) {
        next = { ...known, accuracy_m: fix.accuracy_m };
      } else {
        const [cover, street] = await Promise.all([
          actions.coverage(fix.lat, fix.lng),
          actions.reverse
            ? actions.reverse(fix.lat, fix.lng).catch(() => null)
            : Promise.resolve(null),
        ]);
        next = {
          label: street?.address_line ?? 'Current location',
          ...cover,
          address_line: street?.address_line ?? null,
          plus_code: street?.plus_code ?? null,
          lat: fix.lat,
          lng: fix.lng,
          accuracy_m: fix.accuracy_m,
          source: 'gps',
        } as Place;
      }

      /* They may have picked something by hand while the GPS was answering. */
      if (cancelled || pickedByHand()) return;
      setPlaceState(next);
      setStep('gps');
      writeJSON(safeStorage('local'), CURRENT_KEY, { place: next, step: 'gps' });
      channel.current?.postMessage({ place: next, step: 'gps' });
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, consent, actions, passive]);

  const setPlace = React.useCallback(
    async (next: Place, nextStep: ResolutionStep) => {
      setPlaceState(next);
      setStep(nextStep);
      writeJSON(safeStorage('local'), CURRENT_KEY, { place: next, step: nextStep });
      channel.current?.postMessage({ place: next, step: nextStep });

      /* Chosen by hand — a search result, a saved place. GPS does
         not overwrite that for the rest of this visit: somebody
         sending dinner to the office has said so. */
      if (nextStep !== 'gps') {
        try {
          safeStorage('session')?.setItem(MANUAL_KEY, '1');
        } catch {
          /* ignore */
        }
      }

      /* Kept on the device for the next visit regardless of
         whether it also reached an account — a signed-in guest
         who signs out still has their own browser. */
      const saved = saveDevicePlace(next);
      setSavedPlaces((current) => [saved, ...current.filter((p) => metresBetween(p, next) >= 30)]);

      void actions.note('confirmed', {
        band: accuracyBand(next.accuracy_m),
        step: nextStep,
      });
    },
    [actions],
  );

  const clearPlace = React.useCallback(() => {
    setPlaceState(null);
    setStep('none');
    try {
      safeStorage('local')?.removeItem(CURRENT_KEY);
    } catch {
      /* ignore */
    }
    channel.current?.postMessage({ place: null, step: 'none' });
  }, []);

  const forget = React.useCallback(
    async (id: string) => {
      const target = savedPlaces.find((p) => p.id === id);
      setSavedPlaces((current) => current.filter((p) => p.id !== id));

      const storage = safeStorage('local');
      const local = readJSON<StoredDevicePlace[]>(storage, PLACES_KEY, []);
      writeJSON(
        storage,
        PLACES_KEY,
        local.filter((p) => p.id !== id),
      );

      if (target && !target.deviceOnly) {
        await actions.remove(id);
      }
      if (place && target && metresBetween(place, target) < 30) clearPlace();
    },
    [actions, place, savedPlaces, clearPlace],
  );

  const openSheet = React.useCallback(
    (why?: string) => {
      setSheetOpen(true);
      void actions.note('shown', { step: why });
    },
    [actions],
  );

  const closeSheet = React.useCallback(
    (outcome: 'skipped' | 'dismissed' | 'confirmed') => {
      setSheetOpen(false);
      setAsked(true);
      try {
        safeStorage('session')?.setItem(ASKED_KEY, '1');
      } catch {
        /* ignore */
      }
      if (outcome !== 'confirmed') void actions.note(outcome);
    },
    [actions],
  );

  const markBlockedNoticeSeen = React.useCallback(() => setBlockedSeen(true), []);

  const value: Ctx = {
    place,
    step,
    chip: chipStateFor(place, step),
    consent,
    asked,
    ready,
    savedPlaces,
    sheetOpen,
    panelOpen,
    openSheet,
    closeSheet,
    setPanelOpen,
    setPlace,
    clearPlace,
    forget,
    deviceId,
    sessionId,
    actions,
    blockedNoticeSeen,
    markBlockedNoticeSeen,
    setConsent,
    maps: maps && maps.key && maps.mapId ? maps : null,
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}
