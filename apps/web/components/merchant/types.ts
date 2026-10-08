/**
 * The shapes the merchant dashboard reads.
 *
 * Declared once here rather than inline per page, because the
 * same row is drawn by the live dashboard, the setup dashboard
 * and the branches page, and three copies of a type is three
 * places for one of them to fall behind the view.
 */

export interface SetupProgress {
  merchant_id: string;
  trading_name: string;
  status: string;
  submitted_at: string | null;
  went_live_at: string | null;
  step_profile: boolean;
  step_hours: boolean;
  step_team: boolean;
  step_catalogue: boolean;
  step_documents: boolean;
  step_payout: boolean;
  step_live: boolean;
  done_count: number;
  of_count: number;
  next_step: number | null;
  can_go_live: boolean;
  is_live: boolean;
}

export interface BranchCard {
  branch_id: string;
  merchant_id: string;
  name: string;
  address_text: string | null;
  is_primary: boolean;
  pin_confirmed: boolean;
  state: string;
  orders_today: number;
  prep_avg_minutes: number | null;
  catalogue_items: number;
}

export interface WeekMoney {
  merchant_id: string;
  week_start: string;
  week_end: string;
  delivered: number;
  gross_cents: number;
  commission_cents: number;
  refund_cents: number;
  net_cents: number;
}

export interface WeekBar {
  day: string;
  dow: string;
  delivered: number;
  gross_cents: number;
}

export interface AttentionRow {
  merchant_id: string;
  sort: number;
  kind: string;
  tone: string;
  title: string;
  body: string;
  action: string;
  href: string;
}

export interface OrderRow {
  id: string;
  reference: string;
  stage: string;
  what_now: string | null;
  guest: string | null;
  dropoff_label: string | null;
  store: string | null;
  payment_method: string | null;
  item_count: number | null;
  total_cents: number | null;
  placed_at: string;
  promised_ready_at: string | null;
  rider: string | null;
  needs_your_ack: boolean | null;
}
