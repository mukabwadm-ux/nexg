import type { Metadata } from 'next';
import Link from 'next/link';

import { Blocker, PartnerShell, type PartnerNavItem } from '@/components/partner/shell';
import { requireRider, statusLine } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

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

export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRider();
  const supabase = createClient();

  const { data } = await supabase
    .from('rider_home_v')
    .select('*')
    .eq('rider_id', me.id)
    .maybeSingle();

  const r = data as RiderHome | null;
  const docsToDo =
    (r?.documents_missing ?? 0) + (r?.documents_to_fix ?? 0) + (r?.documents_asked_for ?? 0);

  const nav: PartnerNavItem[] = [
    { href: '/rider', label: 'Today' },
    { href: '/rider/jobs', label: 'Trips', badge: r?.trip_open || null },
    { href: '/rider/earnings', label: 'Earnings' },
    { href: '/rider/documents', label: 'Documents', badge: docsToDo || null, tone: 'danger' },
    { href: '/rider/profile', label: 'You' },
    { href: '/rider/messages', label: 'Messages', badge: r?.unread_messages || null },
  ];

  return (
    <PartnerShell
      kind="rider"
      name={r?.name ?? me.name ?? 'Your account'}
      subtitle={`${statusLine(r?.status, r?.readiness_pct)}${r?.city ? ` · ${r.city}` : ''}`}
      nav={nav}
      current={''}
      banner={<RiderBanner r={r} />}
    >
      {children}
    </PartnerShell>
  );
}

/** One banner, hardest-first, and only if it is in the way. */
function RiderBanner({ r }: { r: RiderHome | null }) {
  if (!r) return null;

  if (r.status === 'suspended' || r.status === 'offboarded') {
    return (
      <Blocker
        tone="danger"
        title={`Your account is ${r.status}.`}
        body={
          r.status_reason ??
          'You will not be offered work until this is lifted. Message us and we will talk it through.'
        }
        action={
          <Link
            href="/rider/messages"
            className="bg-ink rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white"
          >
            Message us
          </Link>
        }
      />
    );
  }

  if (r.documents_to_fix > 0) {
    return (
      <Blocker
        tone="danger"
        title={
          r.documents_to_fix === 1
            ? 'One document came back to you.'
            : `${r.documents_to_fix} documents came back to you.`
        }
        body="Each one says what was wrong. A better photo usually does it."
        action={
          <Link
            href="/rider/documents"
            className="bg-ink rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white"
          >
            Fix them
          </Link>
        }
      />
    );
  }

  if (r.documents_missing > 0 || r.documents_asked_for > 0) {
    const n = Math.max(r.documents_missing, r.documents_asked_for);
    return (
      <Blocker
        title={n === 1 ? 'One document to go.' : `${n} documents to go.`}
        body={
          r.status === 'active'
            ? 'You are riding, but these are still outstanding on your file.'
            : 'This is the last thing between you and your first delivery.'
        }
        action={
          <Link
            href="/rider/documents"
            className="bg-ink rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white"
          >
            Send them
          </Link>
        }
      />
    );
  }

  if (r.status === 'under_review') {
    return (
      <Blocker
        title="Everything is in. We are looking at it."
        body="Nothing for you to do. You will hear here the moment it is done, and then you can go online."
      />
    );
  }

  if (r.cooldown_until && new Date(r.cooldown_until) > new Date()) {
    return (
      <Blocker
        tone="danger"
        title="You are on a cooldown."
        body={`${r.cooldown_reason ?? 'No offers for a short while'} · back at ${new Date(
          r.cooldown_until,
        ).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Africa/Nairobi',
        })}.`}
      />
    );
  }

  if (r.documents_expiring > 0) {
    return (
      <Blocker
        title={
          r.documents_expiring === 1
            ? 'A document expires within the month.'
            : `${r.documents_expiring} documents expire within the month.`
        }
        body="Send the new one when you have it and you will not lose a day."
        action={
          <Link
            href="/rider/documents"
            className="bg-ink rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white"
          >
            Have a look
          </Link>
        }
      />
    );
  }

  /* Cash at the cap is the one that quietly stops the evening, so
     it gets a banner rather than only a number on the page. */
  if (
    r.cash_cap !== null &&
    r.cash_on_hand !== null &&
    r.cash_on_hand >= r.cash_cap * 0.9
  ) {
    return (
      <Blocker
        tone={r.cash_on_hand >= r.cash_cap ? 'danger' : 'gold'}
        title={
          r.cash_on_hand >= r.cash_cap
            ? 'You are at your cash cap.'
            : 'You are close to your cash cap.'
        }
        body={
          r.cash_on_hand >= r.cash_cap
            ? 'No more cash-on-delivery jobs until you bank it. Card and M-Pesa orders still come through.'
            : 'Bank what you are carrying soon, or cash jobs will stop being offered.'
        }
      />
    );
  }

  return null;
}
