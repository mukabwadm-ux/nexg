/**
 * Office finance vocabulary and arithmetic: expense categories (with the
 * colours the charts use), statuses, payment methods, and the sums the
 * page shows. Pure functions over rows already read from the database.
 */

import type { Tone } from './portal';

export const EXPENSE_CATEGORIES: Record<string, { label: string; color: string }> = {
  rent_utilities: { label: 'Rent & utilities', color: '#F5B800' },
  salaries_wages: { label: 'Salaries & wages', color: '#141414' },
  office_supplies: { label: 'Office supplies', color: '#FFD45C' },
  transport_travel: { label: 'Transport & travel', color: '#8A8578' },
  it_systems: { label: 'IT & systems', color: '#C9C4B8' },
  marketing: { label: 'Marketing', color: '#E8730C' },
  professional_fees: { label: 'Professional fees', color: '#2F6FDB' },
  repairs_maintenance: { label: 'Repairs & maintenance', color: '#1F9D55' },
  insurance: { label: 'Insurance', color: '#A855F7' },
  bank_charges: { label: 'Bank charges', color: '#6F6A61' },
  other: { label: 'Other', color: '#E9E3D4' },
};

export const EXPENSE_STATUS: Record<string, { label: string; tone: Tone }> = {
  submitted: { label: 'Waiting for approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  paid: { label: 'Paid', tone: 'green' },
  rejected: { label: 'Turned down', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

export const PAYMENT_METHODS: Record<string, string> = {
  mpesa: 'M-Pesa',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  cheque: 'Cheque',
  other: 'Other',
};

/** Approved and paid expenses are spend; waiting, turned down and cancelled are not. */
export const SPEND = new Set(['approved', 'paid']);

export interface ExpenseLike {
  spent_on: string;
  category: string;
  amount_cents: number;
  status: string;
}

export interface BudgetLike {
  month: string;
  category: string;
  amount_cents: number;
}

/** First days of every month a period touches: 2026-11-03..2026-12-02 → [Nov 1, Dec 1]. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endKey = to.slice(0, 7);
  for (let i = 0; i < 240; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(`${key}-01`);
    if (key >= endKey) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** The n months ending with the month of `day`, oldest first. */
export function lastMonths(day: string, n: number): string[] {
  let y = Number(day.slice(0, 4));
  let m = Number(day.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}-01`);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

/** The period of the same length just before this one. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const day = 86_400_000;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  const length = Math.round((b - a) / day) + 1;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(a - length * day), to: iso(a - day) };
}

/** Spend (approved and paid) between two days, inclusive. */
export function spendBetween(rows: ExpenseLike[], from: string, to: string): number {
  return rows
    .filter((r) => SPEND.has(r.status) && r.spent_on >= from && r.spent_on <= to)
    .reduce((s, r) => s + r.amount_cents, 0);
}

/** Spend per category, largest first, with each one's share of the total. */
export function byCategory(
  rows: ExpenseLike[],
): { key: string; label: string; cents: number; share: number; color: string }[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (!SPEND.has(r.status)) continue;
    totals.set(r.category, (totals.get(r.category) ?? 0) + r.amount_cents);
  }
  const all = [...totals.values()].reduce((s, v) => s + v, 0);
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, cents]) => ({
      key,
      label: EXPENSE_CATEGORIES[key]?.label ?? key,
      cents,
      share: all > 0 ? (cents / all) * 100 : 0,
      color: EXPENSE_CATEGORIES[key]?.color ?? '#C9C4B8',
    }));
}

/** Spend per calendar month for the given month starts. */
export function monthlySpend(
  rows: ExpenseLike[],
  months: string[],
): { month: string; cents: number }[] {
  return months.map((month) => {
    const key = month.slice(0, 7);
    const cents = rows
      .filter((r) => SPEND.has(r.status) && r.spent_on.slice(0, 7) === key)
      .reduce((s, r) => s + r.amount_cents, 0);
    return { month, cents };
  });
}

/** Total budget for the given months, optionally for one category. */
export function budgetFor(budgets: BudgetLike[], months: string[], category?: string): number {
  const want = new Set(months.map((m) => m.slice(0, 7)));
  return budgets
    .filter((b) => want.has(b.month.slice(0, 7)) && (!category || b.category === category))
    .reduce((s, b) => s + b.amount_cents, 0);
}

/** Spend as a share of budget; null when no budget is set. */
export function utilisation(spendCents: number, budgetCents: number): number | null {
  if (budgetCents <= 0) return null;
  return (spendCents / budgetCents) * 100;
}
