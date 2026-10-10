import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { riderContext } from '@/components/rider/frame';
import { PresenceControl, RiderShell } from '@/components/rider/shell';

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
 * The shell is drawn here, once — the same correction made on
 * the merchant side, for the same reason. Five of the twelve
 * boards had forgotten to render it: Documents, Earnings, Jobs,
 * Messages and Profile came up as bare content with no
 * navigation and no way out, all returning HTTP 200.
 *
 * A frame each page must remember is a frame some page forgets.
 * The dashboard's hero still differs between an applicant and a
 * working rider; that is page content, not the frame.
 */
export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const { h, active, nav } = await riderContext();

  if (!h) redirect('/riders/apply');

  return (
    <RiderShell
      personName={h.name ?? h.first_name ?? 'Rider'}
      riderCode={h.rider_id.slice(0, 8).toUpperCase()}
      vehicle={h.vehicle}
      active={active}
      zoneLine={h.city ? `${h.city} · your home zone` : 'Zone not set'}
      unreadCount={h.unread_messages ?? 0}
      nav={nav}
      presenceControl={
        <PresenceControl
          active={active}
          online={h.presence === 'online'}
          reason={h.offers_paused_reason}
        />
      }
    >
      {children}
    </RiderShell>
  );
}
