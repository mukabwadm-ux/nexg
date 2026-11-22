/**
 * Finance → Reports: the Operations, Merchants, Riders and Customers tabs.
 * What rpc_finance_report_riders and rpc_finance_report_customers send,
 * made into numbers; the operations table by type; daily figures as chart
 * points; and each table as CSV rows. Money arrives in cents. Pure, so the
 * tabs and their tests read the same rules.
 */

import { daysBetween } from './finance';
import type { OpsBucket } from './operations';
import type { PerfMerchant } from './performance';
import { change, todayInNairobi } from './portal';

/* ─────────────────────────────────────────────────────── reading JSON */

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : null;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A figure for the period and the one of the same length before it. */
export interface Pair {
  now: number;
  before: number;
}

/** The same, for figures that can be missing: an average of nothing. */
export interface MaybePair {
  now: number | null;
  before: number | null;
}

const pair = (v: unknown): Pair => ({
  now: num(obj(v).now) ?? 0,
  before: num(obj(v).before) ?? 0,
});
const maybePair = (v: unknown): MaybePair => ({ now: num(obj(v).now), before: num(obj(v).before) });

/* ─────────────────────────────────────────────────────────────── riders */

export interface RiderRow {
  id: string;
  name: string;
  deliveries: number;
  earnings_cents: number;
  tips_cents: number;
  bonus_cents: number;
  penalty_cents: number;
  cash_collected_cents: number;
}

export interface RidersReport {
  kpis: {
    active_riders: Pair;
    deliveries: Pair;
    earnings_cents: Pair;
    tips_cents: Pair;
    cash_collected_cents: Pair;
    avg_per_delivery_cents: MaybePair;
  };
  series: { day: string; earnings_cents: number; deliveries: number }[];
  /** Most earned first, at most 500. */
  riders: RiderRow[];
}

export function parseRiders(data: unknown): RidersReport {
  const d = obj(data);
  const k = obj(d.kpis);
  return {
    kpis: {
      active_riders: pair(k.active_riders),
      deliveries: pair(k.deliveries),
      earnings_cents: pair(k.earnings_cents),
      tips_cents: pair(k.tips_cents),
      cash_collected_cents: pair(k.cash_collected_cents),
      avg_per_delivery_cents: maybePair(k.avg_per_delivery_cents),
    },
    series: arr(d.series).map((raw) => {
      const s = obj(raw);
      return {
        day: String(s.day ?? ''),
        earnings_cents: num(s.earnings_cents) ?? 0,
        deliveries: num(s.deliveries) ?? 0,
      };
    }),
    riders: arr(d.riders).map((raw) => {
      const r = obj(raw);
      return {
        id: String(r.id ?? ''),
        name: String(r.name ?? 'Rider'),
        deliveries: num(r.deliveries) ?? 0,
        earnings_cents: num(r.earnings_cents) ?? 0,
        tips_cents: num(r.tips_cents) ?? 0,
        bonus_cents: num(r.bonus_cents) ?? 0,
        penalty_cents: num(r.penalty_cents) ?? 0,
        cash_collected_cents: num(r.cash_collected_cents) ?? 0,
      };
    }),
  };
}

/* ──────────────────────────────────────────────────────────── customers */

export interface TopCustomer {
  /** "Customer ···401": never a name or a whole phone number. */
  label: string;
  payments: number;
  spend_cents: number;
  /** When they first paid, ever. */
  first_paid_at: string | null;
}

export interface CustomersReport {
  kpis: {
    customers: Pair;
    new_customers: Pair;
    returning_customers: Pair;
    repeat_rate_pct: MaybePair;
    avg_spend_cents: MaybePair;
    total_paid_cents: Pair;
    unidentified_payments: Pair;
  };
  series: { day: string; new: number; returning: number }[];
  /** The 50 who spent most in the period. */
  top: TopCustomer[];
  by_intent: { intent: string; payments: number; spend_cents: number }[];
}

export function parseCustomers(data: unknown): CustomersReport {
  const d = obj(data);
  const k = obj(d.kpis);
  return {
    kpis: {
      customers: pair(k.customers),
      new_customers: pair(k.new_customers),
      returning_customers: pair(k.returning_customers),
      repeat_rate_pct: maybePair(k.repeat_rate_pct),
      avg_spend_cents: maybePair(k.avg_spend_cents),
      total_paid_cents: pair(k.total_paid_cents),
      unidentified_payments: pair(k.unidentified_payments),
    },
    series: arr(d.series).map((raw) => {
      const s = obj(raw);
      return {
        day: String(s.day ?? ''),
        new: num(s.new) ?? 0,
        returning: num(s.returning) ?? 0,
      };
    }),
    top: arr(d.top).map((raw) => {
      const c = obj(raw);
      return {
        label: String(c.label ?? 'Customer'),
        payments: num(c.payments) ?? 0,
        spend_cents: num(c.spend_cents) ?? 0,
        first_paid_at: typeof c.first_paid_at === 'string' ? c.first_paid_at : null,
      };
    }),
    by_intent: arr(d.by_intent).map((raw) => {
      const b = obj(raw);
      return {
        intent: String(b.intent ?? ''),
        payments: num(b.payments) ?? 0,
        spend_cents: num(b.spend_cents) ?? 0,
      };
    }),
  };
}

/** What a customer paid for, in words. */
export const INTENTS: Record<string, { label: string; color: string }> = {
  order: { label: 'Orders', color: '#F5B800' },
  stay: { label: 'Stays', color: '#141414' },
};

/* ─────────────────────────────────────────────────────────── KPI moves */

/** A KPI card's change against the period before; null when there was nothing before. */
export function deltaOf(
  now: number | null,
  before: number | null,
  upIsBad = false,
): { value: number; upIsBad: boolean } | null {
  if (now == null || before == null) return null;
  const value = change(now, before);
  return value == null ? null : { value, upIsBad };
}

/**
 * How a rate moved, in percentage points ("+2.5 pts"): a share compared as
 * a percentage of itself reads as something it is not.
 */
export function pointsMove(
  now: number | null,
  before: number | null,
): { text: string; up: boolean } | null {
  if (now == null || before == null) return null;
  const d = Math.round((now - before) * 10) / 10;
  return {
    text: `${d >= 0 ? '+' : '−'}${Math.abs(d).toLocaleString('en-KE', { maximumFractionDigits: 1 })} pts`,
    up: d >= 0,
  };
}

/* ─────────────────────────────────────────────────────────────── trends */

export interface Trend {
  step: 'day' | 'month';
  points: ({ day: string } & Record<string, number | string>)[];
}

/**
 * Lines that hold one number per day of the period, in order (as
 * rpc_operations_overview sends its KPI lines), as rows with their days.
 */
export function seriesRows(
  from: string,
  to: string,
  lines: Record<string, number[]>,
): ({ day: string } & Record<string, number>)[] {
  return daysBetween(from, to).map(
    (day, i) =>
      ({
        day,
        ...Object.fromEntries(Object.entries(lines).map(([key, values]) => [key, values[i] ?? 0])),
      }) as { day: string } & Record<string, number>,
  );
}

/**
 * Daily figures as chart points: one per day, or one per month when the
 * period is longer than three months, as the Overview's trend folds them.
 * Keys in `cents` are added up in cents and drawn in whole shillings.
 */
export function trendPoints(
  rows: readonly ({ day: string } & Record<string, number | string>)[],
  from: string,
  to: string,
  keys: readonly string[],
  cents: readonly string[] = [],
): Trend {
  const days = daysBetween(from, to);
  const step = days.length > 92 ? 'month' : 'day';
  const bucket = (d: string) => (step === 'month' ? `${d.slice(0, 7)}-01` : d);
  const sums = new Map<string, Record<string, number>>();
  for (const d of days) {
    const b = bucket(d);
    if (!sums.has(b)) sums.set(b, Object.fromEntries(keys.map((k) => [k, 0])));
  }
  for (const r of rows) {
    if (r.day < from || r.day > to) continue;
    const s = sums.get(bucket(r.day));
    if (!s) continue;
    for (const k of keys) s[k] = (s[k] ?? 0) + (Number(r[k]) || 0);
  }
  return {
    step,
    points: [...sums.entries()].map(([day, s]) => ({
      day,
      ...Object.fromEntries(
        keys.map((k) => [k, cents.includes(k) ? Math.round((s[k] ?? 0) / 100) : (s[k] ?? 0)]),
      ),
    })),
  };
}

/** Whether a chart has anything to draw. */
export function hasPoints(trend: Trend, keys: readonly string[]): boolean {
  return trend.points.some((p) => keys.some((k) => Number(p[k]) > 0));
}

export function sum(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

/* ───────────────────────────────────────────────────── operations table */

/** The Operations dashboard's tabs, one row each; Food covers deliveries too. */
export const OPS_TYPES = [
  { tab: 'food', label: 'Food & Deliveries' },
  { tab: 'stays', label: 'Stays' },
  { tab: 'experiences', label: 'Experiences' },
  { tab: 'transfers', label: 'Transfers' },
  { tab: 'services', label: 'Services' },
] as const;

export interface OpsTypeRow {
  label: string;
  /** Ongoing, pending, completed and cancelled together. */
  total: number | null;
  ongoing: number | null;
  pending: number | null;
  completed: number | null;
  cancelled: number | null;
}

const BUCKETS: OpsBucket[] = ['ongoing', 'pending', 'completed', 'cancelled'];

/**
 * One row per type from each tab's status counts, in OPS_TYPES order, and
 * the total. A tab that could not be read is null: a dash, never a zero.
 */
export function opsTypeRows(counts: readonly (Record<OpsBucket, number> | null)[]): {
  rows: OpsTypeRow[];
  total: OpsTypeRow;
} {
  const rows: OpsTypeRow[] = OPS_TYPES.map((t, i) => {
    const c = counts[i] ?? null;
    return {
      label: t.label,
      total: c ? sum(BUCKETS.map((b) => c[b])) : null,
      ongoing: c?.ongoing ?? null,
      pending: c?.pending ?? null,
      completed: c?.completed ?? null,
      cancelled: c?.cancelled ?? null,
    };
  });
  const add = (key: Exclude<keyof OpsTypeRow, 'label'>) => {
    const known = rows.map((r) => r[key]).filter((v): v is number => v != null);
    return known.length ? sum(known) : null;
  };
  return {
    rows,
    total: {
      label: 'Total',
      total: add('total'),
      ongoing: add('ongoing'),
      pending: add('pending'),
      completed: add('completed'),
      cancelled: add('cancelled'),
    },
  };
}

/* ────────────────────────────────────────────────────────────────── CSV */

export type CsvRows = (string | number | null)[][];

const whole = (cents: number) => Math.round(cents / 100);

export function opsCsv(rows: readonly OpsTypeRow[], total: OpsTypeRow): CsvRows {
  return [
    ['Type', 'Orders/Bookings', 'Ongoing', 'Pending', 'Completed', 'Cancelled'],
    ...[...rows, total].map((r) => [
      r.label,
      r.total,
      r.ongoing,
      r.pending,
      r.completed,
      r.cancelled,
    ]),
  ];
}

export function merchantsCsv(rows: readonly PerfMerchant[]): CsvRows {
  return [
    ['Merchant', 'Category', 'GMV (KES)', 'Commission ex VAT (KES)', 'Orders', 'Rating'],
    ...rows.map((m) => [
      m.name,
      m.category_label,
      whole(m.gmv),
      whole(m.commission),
      m.orders,
      m.rating == null ? '' : m.rating.toFixed(1),
    ]),
  ];
}

export function ridersCsv(rows: readonly RiderRow[]): CsvRows {
  return [
    [
      'Rider',
      'Deliveries',
      'Earnings (KES)',
      'Tips (KES)',
      'Bonuses (KES)',
      'Penalties (KES)',
      'Cash Collected (KES)',
    ],
    ...rows.map((r) => [
      r.name,
      r.deliveries,
      whole(r.earnings_cents),
      whole(r.tips_cents),
      whole(r.bonus_cents),
      whole(r.penalty_cents),
      whole(r.cash_collected_cents),
    ]),
  ];
}

export function customersCsv(rows: readonly TopCustomer[]): CsvRows {
  return [
    ['Customer', 'Payments', 'Spend (KES)', 'First Paid'],
    ...rows.map((c) => [
      c.label,
      c.payments,
      whole(c.spend_cents),
      c.first_paid_at ? todayInNairobi(new Date(c.first_paid_at)) : '',
    ]),
  ];
}
