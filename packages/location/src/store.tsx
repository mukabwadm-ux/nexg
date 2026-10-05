'use client';

import * as React from 'react';

import { accuracyBand, consentState, type ConsentState } from './geolocation';
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

/** 90 days, per the spec. A pin older than that is probably a trip, not a home. */
const DEVICE_PLACE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface LocationActions {
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
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
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
}: {
  children: React.ReactNode;
  actions: LocationActions;
  initial?: { place: Place | null; step: ResolutionStep } | null;
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
   * The server has already tried QR, deep link and IP. What is
   * left are the two steps only the browser can see: a signed-in
   * guest's saved places, and this device's own storage.
   *
   * Note what does not happen here. Even when `consentState()`
   * comes back `granted`, no position is read. A returning
   * visitor is placed from their last pin and offered the
   * button. Re-reading GPS because permission was given once is
   * tracking, whatever it is called.
   */
  React.useEffect(() => {
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

    if (!place) {
      const remembered = readJSON<{ place: Place; step: ResolutionStep } | null>(
        safeStorage('local'),
        CURRENT_KEY,
        null,
      );
      const local = remembered?.place ?? device[0];
      if (local) {
        setPlaceState(local);
        setStep(remembered?.step ?? 'device');
      }
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
      if (cancelled || account.length === 0) return;

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
    })();

    return () => {
      cancelled = true;
    };
  }, [deviceId, actions]);

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

  const setPlace = React.useCallback(
    async (next: Place, nextStep: ResolutionStep) => {
      setPlaceState(next);
      setStep(nextStep);
      writeJSON(safeStorage('local'), CURRENT_KEY, { place: next, step: nextStep });
      channel.current?.postMessage({ place: next, step: nextStep });

      /* Kept on the device for the next visit regardless of
         whether it also reached an account — a signed-in guest
         who signs out still has their own browser. */
      const saved = saveDevicePlace(next);
      setSavedPlaces((current) => [
        saved,
        ...current.filter((p) => metresBetween(p, next) >= 30),
      ]);

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
      writeJSON(storage, PLACES_KEY, local.filter((p) => p.id !== id));

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
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}
