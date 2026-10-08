import type { Metadata } from 'next';

import { requireRider } from '@/lib/partner';

export const metadata = {
  title: { default: 'Your account', template: '%s · NexG' },
  robots: { index: false, follow: false },
} satisfies Metadata;

export const dynamic = 'force-dynamic';

export interface RiderHome {
  rider_id: string;
  name: string | null;
  first_name: string | null;
  status: string;
  status_reason: string | null;
  city: string;
  vehicle: string | null;
  plate_no: string | null;
  presence: string;
  presence_changed_at: string | null;
  can_receive_offers: boolean;
  offers_paused_reason: string | null;
  cooldown_until: string | null;
  cooldown_reason: string | null;
  readiness_pct: number;
  readiness: Record<string, boolean | number>;
  unread_messages: number;
  documents_missing: number;
  documents_to_fix: number;
  documents_expiring: number;
  documents_asked_for: number;
  trips_today: number;
  trip_open: number;
  earned_today_kes: number;
  earned_week_kes: number;
  cash_on_hand: number | null;
  cash_cap: number | null;
  health_band: string | null;
  strike_count: number;
  top_decile: boolean;
  areas: string[] | null;
  shifts: string[] | null;
  bike_max_km: number | null;
  payout_msisdn: string | null;
  agreement_to_accept: boolean;
  alcohol_eligible: boolean;
  large_items_eligible: boolean;
  activated_at: string | null;
}

/**
 * The rider side of the account.
 *
 * The layout checks who is asking and nothing else. The shell
 * moved into the pages with the rebuild: the dashboard's hero
 * differs between an applicant and a working rider, and a
 * layout rendering one for both would have to guess which.
 *
 * `RiderHome` stays exported here because every page reads it.
 */
export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  await requireRider();
  return <>{children}</>;
}
