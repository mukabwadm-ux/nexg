/** Shapes shared by the rider steps, the rider card and the store. */

export type Vehicle = 'motorbike' | 'bicycle' | 'car' | 'tuktuk';

export interface RiderDraft {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  city_id: string | null;
  status: string;
  source: string;
  employer_merchant_id: string | null;
  vehicle: Vehicle | null;
  plate_no: string | null;
  ownership: 'own' | 'rented' | 'family' | null;
  owner_name: string | null;
  owner_phone: string | null;
  insurance: 'comprehensive' | 'third_party' | 'none' | null;
  years_riding: string | null;
  areas: string[];
  shifts: string[];
  cash_ok: boolean;
  kit_has: string[];
  bike_max_km: number | null;
  notes: string | null;
  payout_msisdn: string | null;
  payout_name_lookup: { matched: boolean | null; name?: string; reason?: string } | null;
  onboarding_step: number;
  onboarding_slot_id: string | null;
  onboarding_session_at: string | null;
  face_photo_path: string | null;
  phone_verified_at: string | null;
  submitted_at: string | null;
  waitlisted_at: string | null;
  kit_issued_at: string | null;
}

export interface RiderReadiness {
  about_you: boolean;
  your_ride: boolean;
  areas_hours: boolean;
  documents: boolean;
  mpesa_payout: boolean;
  kit_onboarding: boolean;
  pct: number;
}

/** The six checks on the black card, in the order the artboards draw them. */
export const RIDER_CHECKS: { key: string; label: string }[] = [
  { key: 'about_you', label: 'About you' },
  { key: 'your_ride', label: 'Your ride' },
  { key: 'areas_hours', label: 'Areas & hours' },
  { key: 'documents', label: 'Documents' },
  { key: 'mpesa_payout', label: 'M-Pesa payout' },
  { key: 'kit_onboarding', label: 'Kit & onboarding' },
];

export interface CityOption {
  id: string;
  name: string;
  slug: string;
  status: 'live' | 'soft_launch' | 'waitlist';
}

export interface SlotOption {
  id: string;
  hub_name: string;
  starts_at: string;
  capacity: number;
  booked: number;
}

export const VEHICLES: { value: Vehicle; label: string; blurb: string; icon: string }[] = [
  { value: 'motorbike', label: 'Motorbike', blurb: 'most orders', icon: 'Bike' },
  { value: 'bicycle', label: 'Bicycle', blurb: 'short trips', icon: 'Cycle' },
  { value: 'car', label: 'Car', blurb: 'big orders', icon: 'Car' },
  { value: 'tuktuk', label: 'Tuk-tuk', blurb: 'bulk & laundry', icon: 'Truck' },
];

export const SHIFTS: { value: string; label: string }[] = [
  { value: 'mornings', label: 'Mornings' },
  { value: 'afternoons', label: 'Afternoons' },
  { value: 'evenings', label: 'Evenings' },
  { value: 'late_night', label: 'Late night · 22:00+' },
  { value: 'weekends', label: 'Weekends' },
];

export const KIT: { value: string; label: string }[] = [
  { value: 'bag', label: 'Insulated delivery bag' },
  { value: 'phone_holder', label: 'Phone holder' },
  { value: 'jacket', label: 'Reflective jacket' },
  { value: 'rain_gear', label: 'Rain gear' },
];

export const YEARS: { value: string; label: string }[] = [
  { value: 'new', label: 'New to it' },
  { value: '1_2', label: '1–2' },
  { value: '3_5', label: '3–5' },
  { value: '5_plus', label: '5+' },
];

/** Step number → route, and how long the top bar says is left. */
export const RIDER_STEPS = [
  { step: 1, path: '/riders/apply/start', minutes: 6 },
  { step: 2, path: '/riders/apply/ride', minutes: 5 },
  { step: 3, path: '/riders/apply/areas', minutes: 4 },
  { step: 4, path: '/riders/apply/documents', minutes: 3 },
  { step: 5, path: '/riders/apply/payout', minutes: 1 },
  { step: 6, path: '/riders/status', minutes: 0 },
] as const;

export function riderPathForStep(step: number): string {
  return RIDER_STEPS.find((s) => s.step === step)?.path ?? '/riders/apply/start';
}

/**
 * Kenyan plates read `KMDA 421K`. Non-Kenyan formats are warned about, never
 * blocked — a rider with a foreign plate is a question for the hub, not a
 * reason to refuse the application.
 */
export const KE_PLATE = /^K[A-Z]{2}[A-Z]? ?\d{3}[A-Z]$/;

export function looksKenyan(plate: string): boolean {
  return KE_PLATE.test(plate.trim().toUpperCase());
}
