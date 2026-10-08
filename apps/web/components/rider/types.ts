/**
 * The shapes the rider dashboard reads.
 *
 * Money here is in whole shillings, not cents — the rider
 * earning tables are `_kes` columns and converting them to
 * cents on the way in just to divide again on the way out
 * would be two chances to be wrong about a rider's pay.
 */

export interface RiderHome {
  rider_id: string;
  name: string | null;
  first_name: string | null;
  phone: string | null;
  status: string;
  status_reason: string | null;
  city: string | null;
  vehicle: string | null;
  plate_no: string | null;
  presence: string | null;
  can_receive_offers: boolean | null;
  offers_paused_reason: string | null;
  cooldown_until: string | null;
  cooldown_reason: string | null;
  activated_at: string | null;
  payout_msisdn: string | null;
  health_band: string | null;
  health_score: number | null;
  strike_count: number | null;
  cash_on_hand: number | null;
  cash_cap: number | null;
  readiness_pct: number | null;
  unread_messages: number | null;
  documents_missing: number | null;
  documents_to_fix: number | null;
  documents_expiring: number | null;
  documents_asked_for: number | null;
  trips_today: number | null;
  trip_open: boolean | null;
  earned_today_kes: number | null;
  earned_week_kes: number | null;
}

export interface RiderProgress {
  rider_id: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  vehicle: string | null;
  step_profile: boolean;
  step_vehicle: boolean;
  step_app: boolean;
  step_documents: boolean;
  step_payout: boolean;
  step_session: boolean;
  step_training: boolean;
  modules_passed: number;
  done_count: number;
  of_count: number;
  next_step: number | null;
  can_train: boolean;
  is_active: boolean;
}

export interface RiderJob {
  id: string;
  reference: string;
  stage: string;
  what_now: string | null;
  payment_method: string | null;
  merchant: string | null;
  pickup: string | null;
  dropoff: string | null;
  collect_cents: number | null;
  earned_cents: number | null;
  placed_at: string;
  delivered_at: string | null;
}

export interface WeekEarnings {
  rider_id: string;
  week_start: string;
  deliveries: number;
  base_kes: number;
  distance_kes: number;
  bonus_kes: number;
  tip_kes: number;
  penalty_kes: number;
  cash_collected_kes: number;
  total_kes: number;
}

export interface WeekBar {
  day: string;
  dow: string;
  base_kes: number;
  bonus_kes: number;
}

export interface RiderAttentionRow {
  rider_id: string;
  sort: number;
  kind: string;
  tone: string;
  title: string;
  body: string;
  action: string;
  href: string;
}
