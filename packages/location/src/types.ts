import type { ConsentState } from './geolocation';

export type Coverage = 'covered' | 'outside' | 'unlaunched' | 'unknown';

/**
 * How the place was arrived at.
 *
 * Carried everywhere and shown on the chip, because the
 * difference between "we worked this out from your internet
 * connection" and "you dropped this pin" is the difference
 * between an estimate and a price. A UI that renders both the
 * same way is lying by omission, and the only way to avoid that
 * is for the step to travel with the place.
 */
export type ResolutionStep =
  | 'qr'
  | 'deep_link'
  | 'account'
  | 'device'
  | 'gps'
  | 'search'
  | 'ip_city'
  | 'point'
  | 'none';

export type ChipState = 'empty' | 'city' | 'set' | 'qr' | 'room' | 'outside' | 'unlaunched';

export interface Place {
  id?: string;
  label: string;
  lat: number;
  lng: number;
  address_line?: string | null;
  plus_code?: string | null;
  unit_no?: string | null;
  floor?: string | null;
  gate_no?: string | null;
  landmark?: string | null;
  rider_phone?: string | null;

  zone_id?: string | null;
  zone?: string | null;
  eta_min?: number | null;
  eta_max?: number | null;
  city?: string | null;
  city_slug?: string | null;
  paused?: boolean;

  coverage: Coverage;
  accuracy_m?: number | null;
  source?: string | null;

  /** Outside-coverage detail, so the banner can name a real place and distance. */
  nearest_zone?: string | null;
  nearest_city?: string | null;
  nearest_city_slug?: string | null;
  nearest_km?: number | null;

  message?: string | null;
}

export interface LocationState {
  /** Null until something resolves — never a placeholder city. */
  place: Place | null;
  step: ResolutionStep;
  chip: ChipState;
  consent: ConsentState;
  /** Whether the sheet has already been offered this visit. */
  asked: boolean;
  ready: boolean;
}

export interface SavedPlace extends Place {
  id: string;
  last_used_at?: string | null;
  /** True when it lives only in this browser, not in an account. */
  deviceOnly?: boolean;
}

export const CHIP_COPY: Record<ChipState, { title: string; hint: string }> = {
  empty: {
    title: 'Choose a delivery location',
    hint: 'Prices and merchants depend on it',
  },
  city: {
    title: '', // filled with "<City> · from your connection"
    hint: 'Set an exact spot for prices',
  },
  set: { title: '', hint: '' },
  qr: { title: '', hint: "From your host's QR card" },
  room: { title: '', hint: 'Charge to room available' },
  outside: { title: '', hint: 'Outside coverage' },
  unlaunched: { title: '', hint: 'Not live yet' },
};
