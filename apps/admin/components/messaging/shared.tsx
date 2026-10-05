import * as React from 'react';

import { DASH } from '@/components/live/shared';

/** The vocabulary the Messaging tabs share. */

export const TOPIC_LABEL: Record<string, string> = {
  my_order: 'My order',
  payment: 'Payment',
  refund_status: 'Refund status',
  change_order: 'Change my order',
  merchant_application: 'Application',
  merchant_documents: 'Documents',
  merchant_payout: 'Payouts',
  rider_application: 'Rider application',
  rider_cash: 'Cash',
  rider_documents: 'Rider documents',
  hotel_or_airbnb: 'Hotel or Airbnb',
  partnership: 'Partnership',
  outside_coverage: 'Outside coverage',
  careers: 'Careers',
  something_else: 'Something else',
};

export const CHANNEL_LABEL: Record<string, string> = {
  web: 'web',
  guest_app: 'app',
  merchant_dashboard: 'merchant dashboard',
  rider_app: 'rider app',
  host_view: 'host',
  hotel_desk: 'hotel desk',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'email',
  internal: 'internal',
};

export const TEAM_LABEL: Record<string, string> = {
  concierge: 'Concierge desk',
  dispatch: 'Dispatch',
  merchant_ops: 'Merchant ops',
  rider_ops: 'Rider ops',
  finance: 'Finance',
  partnerships: 'Partnerships',
  hotels_desk: 'Hotels desk',
};

/**
 * How late we are, as a colour and a sentence.
 *
 * Never colour alone. The dot is the fast read for somebody
 * scanning sixty rows, and the text is what makes it usable by
 * anyone who cannot distinguish the dot — and what makes it
 * mean something precise rather than "bad".
 */
export function sla(overdueS: number | null, answered: boolean): {
  dot: string;
  text: string;
  urgent: boolean;
} {
  if (answered) return { dot: 'bg-border-strong', text: 'answered', urgent: false };
  if (overdueS === null) return { dot: 'bg-border-strong', text: 'no clock', urgent: false };
  if (overdueS > 0) {
    return {
      dot: 'bg-danger',
      text: `${fmtSeconds(overdueS)} over`,
      urgent: true,
    };
  }
  const left = Math.abs(overdueS);
  if (left < 30) return { dot: 'bg-warn', text: `${left}s left`, urgent: true };
  return { dot: 'bg-success', text: `${fmtSeconds(left)} left`, urgent: false };
}

export function fmtSeconds(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return DASH;
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  return fmtSeconds(s);
}

export function clock(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Nairobi',
      })
    : DASH;
}

export function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'plain' | 'warn' | 'good';
}) {
  return (
    <div className="border-border bg-surface rounded-xl border p-4">
      <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums ${
          tone === 'warn' ? 'text-danger' : tone === 'good' ? 'text-success' : ''
        }`}
      >
        {value}
      </p>
      {note ? (
        <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">{note}</p>
      ) : null}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
      {children}
    </p>
  );
}

/**
 * The lock that marks everything staff-only.
 *
 * Used on internal notes, internal threads and the composer
 * when it is in internal mode. It is the same mark in all three
 * places on purpose: an agent should never have to work out
 * which colour means what, because the one time they get it
 * wrong is the time it is read by a guest.
 */
export function InternalMark({ children }: { children?: React.ReactNode }) {
  return (
    <span className="text-warn inline-flex items-center gap-1 text-[0.625rem] font-extrabold uppercase tracking-wide">
      <svg
        className="h-3 w-3"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden="true"
      >
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 1 1 8 0v4" />
      </svg>
      {children ?? 'Internal · staff only'}
    </span>
  );
}
