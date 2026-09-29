/** The shapes fn_plan_view returns, and the vocabulary the builder speaks. */

export type Mood = 'wild' | 'taste' | 'night' | 'slow' | 'stay' | 'events';

export interface SwapOption {
  id: string;
  title: string;
  subtitle: string | null;
  tier: number;
  price_kes: number;
  delta_kes: number;
  direction: 'cheaper' | 'pricier';
}

export interface PayOnDayItem {
  label: string;
  amount: number;
  note?: string;
}

export interface PlanBlock {
  id: string;
  slot: string;
  start_time: string | null;
  end_time: string | null;
  kind: 'activity' | 'meal' | 'venue' | 'transport' | 'stay' | 'event' | 'free';
  component_id: string | null;
  event_id: string | null;
  title_snapshot: string;
  subtitle_snapshot: string | null;
  price_estimate_kes: number | null;
  price_quoted_kes: number | null;
  pay_on_day: PayOnDayItem[];
  included_by: string | null;
  anchored: boolean;
  swap_group: string | null;
  status: 'proposed' | 'confirmed' | 'changed' | 'unavailable' | 'removed' | 'done';
  change_note: string | null;
  changed_from: { title?: string; start_time?: string; price_quoted_kes?: number } | null;
  hold_status: string;
  sort: number;
  swaps: SwapOption[];
  mood: string | null;
}

export interface PlanRow {
  id: string;
  reference: string;
  status: string;
  duration: string;
  party_type: string;
  party_size: number;
  date: string | null;
  budget_kes: number | null;
  moods: Mood[];
  answers: Record<string, unknown>;
  notes: string | null;
  stay_label: string | null;
  estimate_total_kes: number | null;
  quote_total_kes: number | null;
  pay_on_day_total_kes: number | null;
  concierge_fee_kes: number | null;
  expires_at: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  curated_day_id: string | null;
  city_id: string;
  concierge_name: string | null;
}

export interface PlanMessage {
  id: string;
  author_type: string;
  body: string;
  created_at: string;
  author_name: string | null;
}

export interface PlanView {
  plan: PlanRow;
  blocks: PlanBlock[];
  totals: Record<string, number>;
  messages: PlanMessage[];
}

export interface MoodChip {
  mood: Mood;
  swap_group: string;
  id: string;
  title: string;
  tier: number;
  price_kes: number | null;
  price_basis: string;
  default_slot: string;
}

export interface EventCard {
  id: string;
  name: string;
  category: string;
  venue_name: string | null;
  venue_address: string | null;
  starts_at: string;
  ends_at: string | null;
  doors_at: string | null;
  organiser_name: string | null;
  ticket_bands: { label: string; price_kes: number }[];
  nexg_can_hold_tickets: boolean;
  practical_note: string | null;
  cover_path: string | null;
  featured: boolean;
  anchor_slot: string;
  suggested_blocks: { kind: string; mood: string; slot: string; title: string }[];
}

export interface CuratedDay {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  cover_path: string | null;
  badge: string | null;
  party_types: string[];
  duration: string;
  price_per_person_kes: number | null;
  featured: boolean;
}

/**
 * The bracket convention the artboards use, and ground rule 3: a figure
 * that does not exist is shown as not existing, never as zero and never
 * as a plausible guess.
 */
export const DASH = '[—]';

export function kes(value: number | null | undefined): string {
  if (value === null || value === undefined) return DASH;
  return value.toLocaleString('en-KE');
}

/** "KES 40,000", or "KES [—]" when nobody has said yet. */
export function keslabel(value: number | null | undefined): string {
  return `KES ${kes(value)}`;
}

export function hhmm(time: string | null): string {
  if (!time) return '';
  return time.slice(0, 5);
}

/** The bar's segments, in the order the artboard's legend lists them. */
export const MOOD_COLOUR: Record<string, string> = {
  wild: '#D4A72C',
  taste: '#E7C86A',
  night: '#B8901F',
  events: '#B8901F',
  slow: '#CDBE9A',
  stay: '#8A7A4A',
  transport: 'rgba(255,255,255,0.5)',
};

export const MOOD_LABEL: Record<string, string> = {
  wild: 'Wild',
  taste: 'Taste',
  night: 'Night',
  slow: 'Slow',
  stay: 'Stay',
  events: 'Events',
  transport: 'Driver',
};
