import type { Metadata } from 'next';

import { requireMerchant } from '@/lib/partner';

export const metadata: Metadata = {
  title: { default: 'Your business', template: '%s · NexG' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export interface MerchantHome {
  merchant_id: string;
  name: string;
  status: string;
  city: string;
  accepting_orders: boolean;
  busy_mode_until: string | null;
  readiness_pct: number;
  readiness: Record<string, boolean | number>;
  stores: number;
  items_available: number;
  unread_messages: number;
  documents_missing: number;
  documents_to_fix: number;
  documents_expiring: number;
  documents_asked_for: number;
  orders_today: number;
  orders_open: number;
  earned_today_cents: number;
  terms_to_accept: boolean;
  featured_state: string | null;
  health_band: string | null;
  health_score: number | null;
  prep_minutes: number | null;
  pay_on_delivery: boolean;
  pay_on_delivery_cap_kes: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  payout_rail: string | null;
  went_live_at: string | null;
  status_reason: string | null;
}

/**
 * The merchant side of the account.
 *
 * The layout checks who is asking and nothing else. The shell
 * moved into the pages when the dashboard was rebuilt: its hero
 * is different in each of the two states, and a layout that
 * renders one hero for both would have had to guess which.
 *
 * `MerchantHome` is still exported from here because every page
 * reads it and one declaration beats nine.
 */
export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  await requireMerchant();
  return <>{children}</>;
}
