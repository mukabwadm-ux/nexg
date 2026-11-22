import type { ChipTone } from '@/components/portal/dash';
import type { Pair } from '@/lib/performance';

/**
 * Merchants → Payouts & Settlements: the shape rpc_merchant_payouts returns.
 * Money arrives in cents. Statuses are worked out in the reader from the
 * settlement runs (see its migration).
 */

export type PayoutStatus = 'pending' | 'settled' | 'failed' | 'scheduled';
export type PayoutTab = 'all' | PayoutStatus;
export type PayoutRail = 'mpesa' | 'bank' | 'none';

export const PAYOUT_TABS: { key: PayoutTab; label: string }[] = [
  { key: 'all', label: 'All Settlements' },
  { key: 'pending', label: 'Pending' },
  { key: 'settled', label: 'Settled' },
  { key: 'failed', label: 'Failed' },
  { key: 'scheduled', label: 'Scheduled' },
];

export const RAILS: { value: PayoutRail; label: string }[] = [
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'bank', label: 'Bank' },
  { value: 'none', label: 'Not set' },
];

export function isPayoutTab(v: unknown): v is PayoutTab {
  return PAYOUT_TABS.some((t) => t.key === v);
}
export function isRail(v: unknown): v is PayoutRail {
  return v === 'mpesa' || v === 'bank' || v === 'none';
}

const CHIP: Record<PayoutStatus, { label: string; tone: ChipTone }> = {
  pending: { label: 'Pending', tone: 'amber' },
  settled: { label: 'Settled', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  scheduled: { label: 'Scheduled', tone: 'blue' },
};

export function payoutChip(status: string, note: string | null): { label: string; tone: ChipTone } {
  const base = CHIP[status as PayoutStatus] ?? { label: status, tone: 'grey' as ChipTone };
  if (note === 'Held') return { label: 'Held', tone: 'grey' };
  if (note === 'Netted') return { label: 'Netted', tone: 'green' };
  return base;
}

export interface PayoutRow {
  merchant_id: string;
  name: string;
  category_key: string;
  category_label: string;
  photo_path: string | null;
  area: string | null;
  gmv: number;
  commission: number;
  vat: number;
  payout: number;
  rail: string;
  status: string;
  status_note: string | null;
  hold_reason: string | null;
  payout_date: string | null;
  run_reference: string | null;
}

export interface Payouts {
  kpis: { gtv: Pair; commission: Pair; payouts: Pair; pending: number; settled_month: number };
  summary: { gmv: number; payouts: number; commission: number; vat: number };
  tabs: Record<PayoutTab, number>;
  total: number;
  rows: PayoutRow[];
  runs: { reference: string; pay_date: string | null; state: string; merchants_cents: number }[];
  next_settlement: string | null;
  estimated_payout: number;
}

const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : 0;
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const pair = (v: unknown): Pair => ({ now: num(obj(v).now), before: num(obj(v).before) });

export function parsePayouts(data: unknown): Payouts {
  const d = obj(data);
  const k = obj(d.kpis);
  const s = obj(d.summary);
  const t = obj(d.tabs);
  return {
    kpis: {
      gtv: pair(k.gtv),
      commission: pair(k.commission),
      payouts: pair(k.payouts),
      pending: num(k.pending),
      settled_month: num(k.settled_month),
    },
    summary: {
      gmv: num(s.gmv),
      payouts: num(s.payouts),
      commission: num(s.commission),
      vat: num(s.vat),
    },
    tabs: {
      all: num(t.all),
      pending: num(t.pending),
      settled: num(t.settled),
      failed: num(t.failed),
      scheduled: num(t.scheduled),
    },
    total: num(d.total),
    rows: arr(d.rows).map((raw) => {
      const r = obj(raw);
      return {
        merchant_id: str(r.merchant_id) ?? '',
        name: str(r.name) ?? 'Unnamed merchant',
        category_key: str(r.category_key) ?? 'other',
        category_label: str(r.category_label) ?? 'Other',
        photo_path: str(r.photo_path),
        area: str(r.area),
        gmv: num(r.gmv),
        commission: num(r.commission),
        vat: num(r.vat),
        payout: num(r.payout),
        rail: str(r.rail) ?? 'none',
        status: str(r.status) ?? 'pending',
        status_note: str(r.status_note),
        hold_reason: str(r.hold_reason),
        payout_date: str(r.payout_date),
        run_reference: str(r.run_reference),
      };
    }),
    runs: arr(d.runs).map((raw) => {
      const r = obj(raw);
      return {
        reference: str(r.reference) ?? '',
        pay_date: str(r.pay_date),
        state: str(r.state) ?? '',
        merchants_cents: num(r.merchants_cents),
      };
    }),
    next_settlement: str(d.next_settlement),
    estimated_payout: num(d.estimated_payout),
  };
}

/** A run's state in the words the Recent Settlements list uses. */
export function runChip(state: string): { label: string; tone: ChipTone } {
  if (state === 'sent' || state === 'reconciled' || state === 'closed')
    return { label: 'Settled', tone: 'green' };
  if (state === 'sending') return { label: 'Sending', tone: 'blue' };
  if (state === 'approved_1' || state === 'approved_2' || state === 'files_generated')
    return { label: 'Approved', tone: 'blue' };
  if (state === 'cancelled') return { label: 'Cancelled', tone: 'grey' };
  return { label: state === 'draft' ? 'Draft' : 'Built', tone: 'amber' };
}
