import type { Tone } from './portal';

/**
 * Every movement of money, as rpc_finance_transactions returns it, and the
 * totals rpc_finance_transaction_summary returns. One shape for the
 * Transactions, Settlements, Reconciliations and Reports screens.
 */

export type Source = 'payment' | 'refund' | 'b2c' | 'payout' | 'expense';
export type Kind = 'customer' | 'merchant' | 'rider' | 'expense' | 'refund';
export type Status = 'successful' | 'pending' | 'failed' | 'refunded' | 'void';

export interface Movement {
  source: Source;
  id: string;
  reference: string;
  happened_at: string;
  kind: Kind;
  category: string;
  description: string;
  party: string | null;
  channel: string;
  direction: 'in' | 'out';
  amount_cents: number;
  status: Status;
  state: string;
  provider_ref: string | null;
  note: string | null;
  href: string | null;
}

export interface MovementSum {
  day: string;
  source: Source;
  kind: Kind;
  category: string;
  channel: string;
  direction: 'in' | 'out';
  status: Status;
  n: number;
  cents: number;
}

/** The kinds, in the order the tabs and charts show them. */
export const KINDS: Record<Kind, { label: string; plural: string; color: string }> = {
  customer: { label: 'Customer payment', plural: 'Customer payments', color: '#F5B800' },
  merchant: { label: 'Merchant payment', plural: 'Merchant payments', color: '#141414' },
  rider: { label: 'Rider payout', plural: 'Rider payouts', color: '#F9DC7A' },
  expense: { label: 'Office expense', plural: 'Office expenses', color: '#8C8678' },
  refund: { label: 'Refund', plural: 'Refunds', color: '#D8D2C4' },
};

export const STATUSES: Record<Status, { label: string; tone: Tone }> = {
  successful: { label: 'Successful', tone: 'green' },
  pending: { label: 'Pending', tone: 'amber' },
  failed: { label: 'Failed', tone: 'red' },
  refunded: { label: 'Refunded', tone: 'blue' },
  void: { label: 'No money moved', tone: 'grey' },
};

export const CHANNELS: Record<string, string> = {
  mpesa: 'M-Pesa',
  card: 'Card',
  bank: 'Bank transfer',
  paystack: 'Paystack',
  mobile_money: 'Mobile money',
  cash: 'Cash',
  wallet: 'Wallet credit',
  original: 'Original method',
  credit: 'Credit note',
  cheque: 'Cheque',
  not_paid: 'Not paid yet',
  unassigned: 'Not chosen',
  unknown: 'Unknown',
  other: 'Other',
};

export function channelLabel(channel: string): string {
  return CHANNELS[channel] ?? humanize(channel);
}

/** What a row is, in words, with the colour of its pill. */
export function typeOf(m: Pick<Movement, 'source' | 'kind' | 'category'>): {
  label: string;
  tone: Tone;
} {
  if (m.source === 'payout') {
    if (m.category === 'rider') return { label: 'Rider payout', tone: 'amber' };
    if (m.category === 'host') return { label: 'Host payout', tone: 'blue' };
    if (m.category === 'hotel') return { label: 'Hotel payout', tone: 'blue' };
    return { label: 'Merchant payout', tone: 'grey' };
  }
  if (m.source === 'payment') {
    if (m.kind === 'merchant') return { label: 'Merchant payment', tone: 'grey' };
    if (m.kind === 'rider') return { label: 'Rider float', tone: 'amber' };
    return { label: 'Customer payment', tone: 'gold' };
  }
  if (m.source === 'expense') return { label: 'Office expense', tone: 'purple' };
  return { label: 'Refund', tone: 'red' };
}

/** "restaurants_food" → "Restaurants food". */
export function humanize(key: string | null | undefined): string {
  if (!key) return '—';
  const words = key.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* ─────────────────────────────────────────────────────────── adding up */

export interface StatusTotals {
  /** Everything that moved or tried to, void rows left out. */
  total: number;
  count: number;
  successful: number;
  pending: number;
  failed: number;
  refunded: number;
}

export function statusTotals(rows: MovementSum[]): StatusTotals {
  const t: StatusTotals = { total: 0, count: 0, successful: 0, pending: 0, failed: 0, refunded: 0 };
  for (const r of rows) {
    if (r.status === 'void') continue;
    t.total += r.cents;
    t.count += r.n;
    t[r.status] += r.cents;
  }
  return t;
}

/** A share in percent, or null when there is nothing to share. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

/** Totals per key, largest first, void rows left out. */
export function totalsBy<K extends string>(
  rows: MovementSum[],
  key: (r: MovementSum) => K | null,
): { key: K; cents: number; n: number; share: number }[] {
  const map = new Map<K, { cents: number; n: number }>();
  let all = 0;
  for (const r of rows) {
    if (r.status === 'void') continue;
    const k = key(r);
    if (k == null) continue;
    const cur = map.get(k) ?? { cents: 0, n: 0 };
    cur.cents += r.cents;
    cur.n += r.n;
    map.set(k, cur);
    all += r.cents;
  }
  return [...map.entries()]
    .map(([k, v]) => ({ key: k, ...v, share: all > 0 ? (v.cents / all) * 100 : 0 }))
    .filter((x) => x.cents > 0)
    .sort((a, b) => b.cents - a.cents);
}

/** Every Nairobi day from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end && out.length < 800) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Shillings per day for a trend, one series per name. Long periods are
 * folded into months so the chart stays readable.
 */
export function series(
  rows: MovementSum[],
  from: string,
  to: string,
  pick: Record<string, (r: MovementSum) => boolean>,
): { step: 'day' | 'month'; points: Record<string, number | string>[] } {
  const days = daysBetween(from, to);
  const step = days.length > 92 ? 'month' : 'day';
  const bucket = (d: string) => (step === 'month' ? `${d.slice(0, 7)}-01` : d);
  const keys = [...new Set(days.map(bucket))];
  const points = new Map<string, Record<string, number | string>>(
    keys.map((k) => [k, { day: k, ...Object.fromEntries(Object.keys(pick).map((n) => [n, 0])) }]),
  );
  for (const r of rows) {
    if (r.status === 'void' || r.day < from || r.day > to) continue;
    const p = points.get(bucket(r.day));
    if (!p) continue;
    for (const [name, test] of Object.entries(pick)) {
      if (test(r)) p[name] = (p[name] as number) + r.cents / 100;
    }
  }
  return {
    step,
    points: [...points.values()].map((p) => {
      for (const name of Object.keys(pick)) p[name] = Math.round(p[name] as number);
      return p;
    }),
  };
}

/* ─────────────────────────────────────────────────────────── settlement */

/** The run's states in the words the run uses (fin_transition). */
export const RUN_STATES: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'grey' },
  built: { label: 'Built · needs checking', tone: 'amber' },
  checked: { label: 'Checked · needs a signature', tone: 'amber' },
  approved_1: { label: 'One signature · needs a second', tone: 'amber' },
  approved_2: { label: 'Approved · files not made', tone: 'amber' },
  files_generated: { label: 'Files generated', tone: 'blue' },
  sending: { label: 'Sending', tone: 'blue' },
  sent: { label: 'Sent', tone: 'green' },
  reconciled: { label: 'Reconciled', tone: 'green' },
  closed: { label: 'Closed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

export const LINE_STATES: Record<string, { label: string; tone: Tone }> = {
  ready: { label: 'Ready', tone: 'grey' },
  cash_netted: { label: 'Cash netted', tone: 'green' },
  held_suspended: { label: 'Held · suspended', tone: 'red' },
  held_kyc: { label: 'Held · KYC', tone: 'red' },
  name_mismatch: { label: 'Held · name mismatch', tone: 'red' },
  below_minimum_rolled: { label: 'Rolled to next week', tone: 'grey' },
  mismatch: { label: 'Mismatch', tone: 'red' },
  approved: { label: 'Approved', tone: 'amber' },
  queued: { label: 'Queued', tone: 'amber' },
  sent: { label: 'Sent', tone: 'blue' },
  paid: { label: 'Paid', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  rolled_forward: { label: 'Rolled forward', tone: 'grey' },
};

export const RAILS: Record<string, string> = {
  mpesa_b2b: 'M-Pesa (B2B)',
  mpesa_b2c: 'M-Pesa',
  bank_eft: 'Bank transfer',
  credit_note: 'Credit note',
  invoice_credit: 'Invoice credit',
};

/** Who a settlement line pays, grouped as the designs group them. */
export type PayeeGroup = 'merchant' | 'host' | 'rider' | 'other';

export const PAYEE_GROUPS: Record<PayeeGroup, { label: string; batch: string; color: string }> = {
  merchant: { label: 'Merchants', batch: 'Merchant settlement', color: '#F5B800' },
  host: { label: 'Hosts & hotels (stays)', batch: 'Host payout (stays)', color: '#141414' },
  rider: { label: 'Riders (delivery)', batch: 'Rider payout', color: '#F9DC7A' },
  other: { label: 'Partners & others', batch: 'Other payout', color: '#C9C4B8' },
};

export function payeeGroup(partyType: string): PayeeGroup {
  if (partyType === 'merchant') return 'merchant';
  if (partyType === 'host' || partyType === 'hotel') return 'host';
  if (partyType === 'rider') return 'rider';
  return 'other';
}

/** Where a line stands, for the payout status panel. Null: no money moves. */
export function lineBucket(state: string): 'paid' | 'processing' | 'held' | 'failed' | null {
  if (state === 'paid' || state === 'cash_netted') return 'paid';
  if (state === 'failed') return 'failed';
  if (state.startsWith('held') || state === 'name_mismatch' || state === 'mismatch') return 'held';
  if (state === 'rolled_forward' || state === 'below_minimum_rolled') return null;
  return 'processing';
}

/* ───────────────────────────────────────────────────────────── invoices */

export type InvoiceBucket = 'paid' | 'outstanding' | 'overdue' | 'draft' | 'credited';

export const INVOICE_BUCKETS: Record<InvoiceBucket, { label: string; tone: Tone; color: string }> =
  {
    paid: { label: 'Paid', tone: 'green', color: '#F5B800' },
    outstanding: { label: 'Outstanding', tone: 'amber', color: '#141414' },
    overdue: { label: 'Overdue', tone: 'red', color: '#C9C4B8' },
    draft: { label: 'Draft', tone: 'grey', color: '#E8E4DA' },
    credited: { label: 'Credited', tone: 'blue', color: '#8C8678' },
  };

export const INVOICE_TYPES: Record<string, { label: string; tone: Tone }> = {
  host: { label: 'Host invoice', tone: 'purple' },
  hotel: { label: 'Hotel statement', tone: 'blue' },
  merchant: { label: 'Merchant statement', tone: 'gold' },
};

/**
 * Where an invoice stands today. Overdue is worked out from the due date
 * rather than trusted from a stored flag, which is only as current as the
 * job that last set it.
 */
export function invoiceBucket(
  inv: { status: string; due_at: string | null },
  today: string,
): InvoiceBucket {
  if (inv.status === 'paid') return 'paid';
  if (inv.status === 'draft') return 'draft';
  if (inv.status === 'credited') return 'credited';
  if (inv.status === 'overdue' || (inv.due_at != null && inv.due_at.slice(0, 10) < today)) {
    return 'overdue';
  }
  return 'outstanding';
}
