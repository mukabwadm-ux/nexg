import type { Metadata } from 'next';
import Link from 'next/link';

import { Blocker, PartnerShell, type PartnerNavItem } from '@/components/partner/shell';
import { requireMerchant, statusLine } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

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
 * The navigation badges only ever carry a number somebody should
 * act on — documents that are missing or rejected, messages not
 * read, orders still open. A badge on everything is a badge on
 * nothing.
 */
export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMerchant();
  const supabase = createClient();

  const { data } = await supabase
    .from('merchant_home_v')
    .select('*')
    .eq('merchant_id', me.id)
    .maybeSingle();

  const m = data as MerchantHome | null;
  const docsToDo =
    (m?.documents_missing ?? 0) + (m?.documents_to_fix ?? 0) + (m?.documents_asked_for ?? 0);

  const nav: PartnerNavItem[] = [
    { href: '/merchant', label: 'Today' },
    { href: '/merchant/orders', label: 'Orders', badge: m?.orders_open || null },
    { href: '/merchant/stores', label: 'Stores', badge: null },
    { href: '/merchant/menu', label: 'Menu' },
    {
      href: '/merchant/documents',
      label: 'Documents',
      badge: docsToDo || null,
      tone: 'danger',
    },
    { href: '/merchant/money', label: 'Money' },
    { href: '/merchant/featured', label: 'Featured' },
    { href: '/merchant/messages', label: 'Messages', badge: m?.unread_messages || null },
  ];

  return (
    <PartnerShell
      kind="merchant"
      name={m?.name ?? me.name ?? 'Your business'}
      subtitle={`${statusLine(m?.status, m?.readiness_pct)}${m?.city ? ` · ${m.city}` : ''}`}
      nav={nav}
      current={''}
      banner={<MerchantBanner m={m} />}
    >
      {children}
    </PartnerShell>
  );
}

/**
 * At most one banner, and it is the thing standing between this
 * merchant and trading. Ordered hardest-first.
 */
function MerchantBanner({ m }: { m: MerchantHome | null }) {
  if (!m) return null;

  if (m.status === 'suspended' || m.status === 'delisted') {
    return (
      <Blocker
        tone="danger"
        title={`Your account is ${m.status}.`}
        body={
          m.status_reason ??
          'Nothing new will reach you until this is lifted. Message us and we will talk it through.'
        }
        action={
          <Link
            href="/merchant/messages"
            className="bg-ink rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white"
          >
            Message us
          </Link>
        }
      />
    );
  }

  if (m.documents_to_fix > 0) {
    return (
      <Blocker
        tone="danger"
        title={
          m.documents_to_fix === 1
            ? 'One document came back to you.'
            : `${m.documents_to_fix} documents came back to you.`
        }
        body="Each one says what was wrong with it. Replacing it is usually a minute."
        action={
          <Link
            href="/merchant/documents"
            className="bg-ink rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white"
          >
            Fix them
          </Link>
        }
      />
    );
  }

  if (m.documents_missing > 0 || m.documents_asked_for > 0) {
    const n = Math.max(m.documents_missing, m.documents_asked_for);
    return (
      <Blocker
        title={n === 1 ? 'One document to go.' : `${n} documents to go.`}
        body={
          m.status === 'live'
            ? 'You are trading, but these are still outstanding on your file.'
            : 'This is the last thing between you and taking orders.'
        }
        action={
          <Link
            href="/merchant/documents"
            className="bg-ink rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white"
          >
            Send them
          </Link>
        }
      />
    );
  }

  if (m.status === 'under_review') {
    return (
      <Blocker
        title="Everything is in. We are looking at it."
        body="Nothing for you to do. We will message you here the moment it is done — usually the same day."
      />
    );
  }

  if (m.documents_expiring > 0) {
    return (
      <Blocker
        title={
          m.documents_expiring === 1
            ? 'A document expires within the month.'
            : `${m.documents_expiring} documents expire within the month.`
        }
        body="Send the new one whenever you have it and nothing will be interrupted."
        action={
          <Link
            href="/merchant/documents"
            className="bg-ink rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white"
          >
            Have a look
          </Link>
        }
      />
    );
  }

  if (m.status === 'live' && !m.accepting_orders) {
    return (
      <Blocker
        title="You are not accepting orders."
        body="Guests can see you but cannot order. Turn it back on when you are ready."
        action={
          <Link
            href="/merchant"
            className="bg-ink rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white"
          >
            Turn it on
          </Link>
        }
      />
    );
  }

  return null;
}
