/** Shapes shared by the onboarding steps, the preview card and the store. */

export interface QuestionOption {
  value: string;
  label: string;
}

export interface Question {
  key: string;
  label: string;
  type: 'single' | 'multi' | 'text';
  options?: QuestionOption[];
  hint?: string;
}

export interface BadgeRule {
  text: string;
  tone: 'success' | 'neutral';
}

export interface CategoryConfig {
  category: string;
  label: string;
  icon: string;
  card_kind: 'menu' | 'services' | 'products';
  eta_style: 'minutes' | 'turnaround';
  questions: Question[];
  badge_rules: Record<string, Record<string, BadgeRule>>;
  featured_eligible: boolean;
  requires_ops_mapping: boolean;
  sort: number;
}

/** A branch as the flow holds it, before it becomes a merchant_branch row. */
export interface DraftBranch {
  address_text: string;
  lat: number | null;
  lng: number | null;
  inherits_hours: boolean;
  source: 'manual' | 'google';
  /** Filled in by the server once the pin has been judged against the zones. */
  zone?: string | null;
  tier?: 'core' | 'extended' | 'trial' | null;
  eta_min?: number | null;
  eta_max?: number | null;
  cod_allowed?: boolean | null;
}

export interface DraftFleetRider {
  id?: string;
  name: string;
  phone: string | null;
  vehicle: 'motorbike' | 'bicycle' | 'car' | 'tuktuk';
  plate_no: string;
  invite_status?: string;
}

/** One day's opening times. A closed day carries no times. */
export interface DayHours {
  open?: string;
  close?: string;
  closed?: boolean;
}

export type WeekHours = Partial<
  Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', DayHours>
>;

/** The merchant row, as much of it as this flow reads or writes. */
export interface Draft {
  id: string;
  trading_name: string;
  legal_name: string | null;
  contact_name: string | null;
  contact_phone: string;
  contact_email: string | null;
  category: string | null;
  category_other: string | null;
  answers: Record<string, string | string[]>;
  city_id: string | null;
  status: string;
  onboarding_step: number;
  onboarding_source: string | null;
  cover_photo_path: string | null;
  price_band: string | null;
  hours_pattern: string | null;
  hours: WeekHours | null;
  late_night_until: string | null;
  prep_minutes: number;
  order_channels: string[];
  when_busy: string;
  packaging: string | null;
  pickup_instructions: string | null;
  rider_parking: string | null;
  landmark: string | null;
  branch_count_band: string | null;
  payout_rail: string | null;
  payout_account: Record<string, string> | null;
  payout_name_lookup: { name?: string; matched?: boolean } | null;
  has_own_riders: boolean;
  fleet_dispatch_preference: string;
  onboarding_call_at: string | null;
  waitlisted_at: string | null;
  submitted_at: string | null;
  requires_ops_mapping: boolean;
}

export interface Readiness {
  business_basics: boolean;
  location: boolean;
  hours_prep: boolean;
  documents: boolean;
  payout: boolean;
  first_items: boolean;
  pct: number;
}

export const READINESS_CHECKS: { key: keyof Omit<Readiness, 'pct'>; label: string }[] = [
  { key: 'business_basics', label: 'Business basics' },
  { key: 'location', label: 'Location' },
  { key: 'hours_prep', label: 'Hours & prep' },
  { key: 'documents', label: 'Documents' },
  { key: 'payout', label: 'Payout details' },
  { key: 'first_items', label: 'First 5 menu items' },
];

/** Step number → the route that renders it, and what the top bar says. */
export const STEPS = [
  { step: 1, path: '/merchants/apply/start', minutes: 8 },
  { step: 2, path: '/merchants/apply/category', minutes: 6 },
  { step: 3, path: '/merchants/apply/location', minutes: 5 },
  { step: 4, path: '/merchants/apply/hours', minutes: 3 },
  { step: 5, path: '/merchants/apply/documents', minutes: 2 },
  { step: 6, path: '/merchants/apply/payout', minutes: 1 },
  { step: 7, path: '/merchants/status', minutes: 0 },
] as const;

export function pathForStep(step: number): string {
  return STEPS.find((s) => s.step === step)?.path ?? '/merchants/apply/start';
}
