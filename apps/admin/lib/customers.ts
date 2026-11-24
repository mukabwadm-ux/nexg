/**
 * Customers: what rpc_customer_list and rpc_customer_profile return, read
 * defensively (a missing field is an empty list or null, never a crash), and
 * the words the screens use for stages and states. Pure, so the pages and
 * their tests read the same rules.
 */

export type CustomerLevel = 'full' | 'limited' | 'view';

export const KINDS = ['all', 'account', 'guest'] as const;
export type Kind = (typeof KINDS)[number];

export const STATUSES = [
  'all',
  'active',
  'new',
  'repeat',
  'never',
  'unverified',
  'vip',
  'suspended',
] as const;
export type Status = (typeof STATUSES)[number];

export const SORTS = ['recent', 'spend', 'orders', 'last', 'name'] as const;
export type Sort = (typeof SORTS)[number];

export const PAGE_SIZE = 25;

export function oneOf<T extends string>(
  list: readonly T[],
  value: string | undefined,
  fallback: T,
): T {
  return (list as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
}

/* ──────────────────────────────────────────────────────────── readers */

type Json = Record<string, unknown>;

const obj = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]).map(obj) : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v == null ? null : num(v));
const bool = (v: unknown): boolean => v === true;

function level(v: unknown): CustomerLevel {
  return v === 'full' || v === 'limited' ? v : 'view';
}

export interface CustomerRow {
  id: string;
  guestId: string | null;
  userId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  hasAccount: boolean;
  emailConfirmed: boolean;
  vip: boolean;
  blocked: boolean;
  joinedAt: string | null;
  lastSignInAt: string | null;
  lastPurchaseAt: string | null;
  purchases: number;
  orders: number;
  bookings: number;
  stays: number;
  spend: number;
}

export interface CustomerKpis {
  total: number;
  accounts: number;
  guests: number;
  newMonth: number;
  newPrevMonth: number;
  active30: number;
  buyers: number;
  repeat: number;
  spend: number;
  suspended: number;
  vip: number;
}

export interface CustomerList {
  level: CustomerLevel;
  kpis: CustomerKpis;
  total: number;
  rows: CustomerRow[];
}

export function parseList(data: unknown): CustomerList {
  const d = obj(data);
  const k = obj(d.kpis);
  return {
    level: level(d.level),
    total: num(d.total),
    kpis: {
      total: num(k.total),
      accounts: num(k.accounts),
      guests: num(k.guests),
      newMonth: num(k.new_month),
      newPrevMonth: num(k.new_prev_month),
      active30: num(k.active_30),
      buyers: num(k.buyers),
      repeat: num(k.repeat),
      spend: num(k.spend),
      suspended: num(k.suspended),
      vip: num(k.vip),
    },
    rows: arr(d.rows).map((r) => ({
      id: String(r.id ?? ''),
      guestId: str(r.guest_id),
      userId: str(r.user_id),
      name: str(r.name),
      email: str(r.email),
      phone: str(r.phone),
      hasAccount: bool(r.has_account),
      emailConfirmed: bool(r.email_confirmed),
      vip: bool(r.vip),
      blocked: bool(r.blocked),
      joinedAt: str(r.joined_at),
      lastSignInAt: str(r.last_sign_in_at),
      lastPurchaseAt: str(r.last_purchase_at),
      purchases: num(r.purchases),
      orders: num(r.orders),
      bookings: num(r.bookings),
      stays: num(r.stays),
      spend: num(r.spend),
    })),
  };
}

/** Share of buyers who bought more than once, as a whole percentage. */
export function repeatRate(k: CustomerKpis): number | null {
  return k.buyers > 0 ? Math.round((k.repeat / k.buyers) * 1000) / 10 : null;
}

export interface CustomerOrder {
  id: string;
  reference: string | null;
  merchant: string | null;
  merchantId: string | null;
  category: string | null;
  stage: string;
  paymentStatus: string;
  paymentMethod: string | null;
  totalCents: number;
  at: string | null;
}

export interface CustomerBooking {
  id: string;
  source: 'booking' | 'engine';
  reference: string | null;
  merchant: string | null;
  merchantId: string | null;
  category: string | null;
  status: string | null;
  startsAt: string | null;
  totalCents: number | null;
  paidCents: number | null;
  byPhone: boolean;
  at: string | null;
}

export interface CustomerStay {
  id: string;
  place: string | null;
  host: string | null;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  quoteCents: number | null;
  paidCents: number | null;
  reference: string | null;
  refundedAt: string | null;
}

export interface Transaction {
  kind: 'payment' | 'refund';
  id: string;
  reference: string | null;
  cents: number;
  state: string;
  channel: string | null;
  provider: string | null;
  intent: string | null;
  note: string | null;
  at: string | null;
}

export interface CustomerProfile {
  found: boolean;
  level: CustomerLevel;
  customer: {
    id: string;
    guestId: string | null;
    userId: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    hasAccount: boolean;
    joinedAt: string | null;
    emailConfirmedAt: string | null;
    phoneConfirmedAt: string | null;
    lastSignInAt: string | null;
    vip: boolean;
    blocked: boolean;
    blockReason: string | null;
    isPartner: boolean;
    marketingConsent: boolean | null;
    pushDevices: number;
    pushLastSeenAt: string | null;
  };
  stats: {
    gross: number;
    refunded: number;
    purchases: number;
    orders: number;
    cancelled: number;
    bookings: number;
    stays: number;
    failedPayments: number;
    firstPurchaseAt: string | null;
    lastPurchaseAt: string | null;
    saved: number;
  };
  monthly: { month: string; cents: number; count: number }[];
  categories: { key: string; label: string; count: number; cents: number }[];
  merchants: { id: string | null; name: string | null; count: number; cents: number }[];
  orders: CustomerOrder[];
  bookings: CustomerBooking[];
  stays: CustomerStay[];
  transactions: Transaction[];
  addresses: {
    id: string;
    label: string | null;
    address: string | null;
    landmark: string | null;
    lastUsedAt: string | null;
  }[];
  reviews: {
    kind: string;
    stars: number | null;
    comment: string | null;
    subject: string | null;
    reference: string | null;
    at: string | null;
  }[];
  tickets: {
    id: string;
    reference: string | null;
    topic: string | null;
    status: string | null;
    body: string | null;
    orderReference: string | null;
    createdAt: string | null;
    resolvedAt: string | null;
  }[];
  saved: { merchant: string | null; merchantId: string | null; items: number }[];
  notes: { id: string; body: string; at: string | null; author: string | null }[];
  legacyNote: string | null;
  blocks: {
    reason: string | null;
    at: string | null;
    liftedAt: string | null;
    by: string | null;
    liftedBy: string | null;
  }[];
  history: { action: string; at: string | null; reason: string | null; by: string | null }[];
}

export function parseProfile(data: unknown): CustomerProfile {
  const d = obj(data);
  const c = obj(d.customer);
  const s = obj(d.stats);
  return {
    found: bool(d.found),
    level: level(d.level),
    customer: {
      id: String(c.id ?? ''),
      guestId: str(c.guest_id),
      userId: str(c.user_id),
      name: str(c.name),
      email: str(c.email),
      phone: str(c.phone),
      hasAccount: bool(c.has_account),
      joinedAt: str(c.joined_at),
      emailConfirmedAt: str(c.email_confirmed_at),
      phoneConfirmedAt: str(c.phone_confirmed_at),
      lastSignInAt: str(c.last_sign_in_at),
      vip: bool(c.vip),
      blocked: bool(c.blocked),
      blockReason: str(c.block_reason),
      isPartner: bool(c.is_partner),
      marketingConsent: typeof c.marketing_consent === 'boolean' ? c.marketing_consent : null,
      pushDevices: num(c.push_devices),
      pushLastSeenAt: str(c.push_last_seen_at),
    },
    stats: {
      gross: num(s.gross),
      refunded: num(s.refunded),
      purchases: num(s.purchases),
      orders: num(s.orders),
      cancelled: num(s.cancelled),
      bookings: num(s.bookings),
      stays: num(s.stays),
      failedPayments: num(s.failed_payments),
      firstPurchaseAt: str(s.first_purchase_at),
      lastPurchaseAt: str(s.last_purchase_at),
      saved: num(s.saved),
    },
    monthly: arr(d.monthly).map((m) => ({
      month: String(m.month ?? ''),
      cents: num(m.cents),
      count: num(m.count),
    })),
    categories: arr(d.categories).map((x) => ({
      key: String(x.key ?? ''),
      label: str(x.label) ?? String(x.key ?? ''),
      count: num(x.count),
      cents: num(x.cents),
    })),
    merchants: arr(d.merchants).map((x) => ({
      id: str(x.id),
      name: str(x.name),
      count: num(x.count),
      cents: num(x.cents),
    })),
    orders: arr(d.orders).map((o) => ({
      id: String(o.id ?? ''),
      reference: str(o.reference),
      merchant: str(o.merchant),
      merchantId: str(o.merchant_id),
      category: str(o.category),
      stage: String(o.stage ?? ''),
      paymentStatus: String(o.payment_status ?? ''),
      paymentMethod: str(o.payment_method),
      totalCents: num(o.total_cents),
      at: str(o.at),
    })),
    bookings: arr(d.bookings).map((b) => ({
      id: String(b.id ?? ''),
      source: b.source === 'engine' ? 'engine' : 'booking',
      reference: str(b.reference),
      merchant: str(b.merchant),
      merchantId: str(b.merchant_id),
      category: str(b.category),
      status: str(b.status),
      startsAt: str(b.starts_at),
      totalCents: numOrNull(b.total_cents),
      paidCents: numOrNull(b.paid_cents),
      byPhone: bool(b.by_phone),
      at: str(b.at),
    })),
    stays: arr(d.stays).map((x) => ({
      id: String(x.id ?? ''),
      place: str(x.place),
      host: str(x.host),
      status: String(x.status ?? ''),
      checkIn: str(x.check_in),
      checkOut: str(x.check_out),
      quoteCents: numOrNull(x.quote_cents),
      paidCents: numOrNull(x.paid_cents),
      reference: str(x.reference),
      refundedAt: str(x.refunded_at),
    })),
    transactions: arr(d.transactions).map((t) => ({
      kind: t.kind === 'refund' ? 'refund' : 'payment',
      id: String(t.id ?? ''),
      reference: str(t.reference),
      cents: num(t.cents),
      state: String(t.state ?? ''),
      channel: str(t.channel),
      provider: str(t.provider),
      intent: str(t.intent),
      note: str(t.note),
      at: str(t.at),
    })),
    addresses: arr(d.addresses).map((a) => ({
      id: String(a.id ?? ''),
      label: str(a.label),
      address: str(a.address),
      landmark: str(a.landmark),
      lastUsedAt: str(a.last_used_at),
    })),
    reviews: arr(d.reviews).map((r) => ({
      kind: String(r.kind ?? ''),
      stars: numOrNull(r.stars),
      comment: str(r.comment),
      subject: str(r.subject),
      reference: str(r.reference),
      at: str(r.at),
    })),
    tickets: arr(d.tickets).map((t) => ({
      id: String(t.id ?? ''),
      reference: str(t.reference),
      topic: str(t.topic),
      status: str(t.status),
      body: str(t.body),
      orderReference: str(t.order_reference),
      createdAt: str(t.created_at),
      resolvedAt: str(t.resolved_at),
    })),
    saved: arr(d.saved).map((x) => ({
      merchant: str(x.merchant),
      merchantId: str(x.merchant_id),
      items: num(x.items),
    })),
    notes: arr(d.notes).map((n) => ({
      id: String(n.id ?? ''),
      body: String(n.body ?? ''),
      at: str(n.at),
      author: str(n.author),
    })),
    legacyNote: str(d.legacy_note),
    blocks: arr(d.blocks).map((b) => ({
      reason: str(b.reason),
      at: str(b.at),
      liftedAt: str(b.lifted_at),
      by: str(b.by),
      liftedBy: str(b.lifted_by),
    })),
    history: arr(d.history).map((h) => ({
      action: String(h.action ?? ''),
      at: str(h.at),
      reason: str(h.reason),
      by: str(h.by),
    })),
  };
}

/* ──────────────────────────────────────────── when the database is behind */

/**
 * True when the error means the Customers functions are not in this
 * database yet (the migration has not been applied), so the page can say
 * "waiting for a database update" instead of failing.
 */
export function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /could not find the function|function .* does not exist/i.test(error.message ?? '')
  );
}

/* ──────────────────────────────────────────────────────────── words */

export function displayName(
  name: string | null,
  phone: string | null,
  email: string | null,
): string {
  return name ?? phone ?? email ?? 'Unnamed customer';
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((w) => /[a-z]/i.test(w))
      .slice(0, 2)
      .map((w) => w.match(/[a-z]/i)![0].toUpperCase())
      .join('') || '·'
  );
}

const STAGE: Record<string, string> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  picked_up: 'Picked up',
  arriving: 'Arriving',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
  refunded: 'Refunded',
};

export function words(value: string | null | undefined): string {
  if (!value) return '—';
  return STAGE[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/[_-]/g, ' ');
}

export type Tone = 'amber' | 'green' | 'blue' | 'red' | 'grey' | 'gold';

/** The chip colour for any stage, status or payment state the profile shows. */
export function toneOf(value: string | null | undefined): Tone {
  switch (value) {
    case 'delivered':
    case 'paid':
    case 'collected':
    case 'completed':
    case 'confirmed':
    case 'booked':
    case 'in_stay':
    case 'departed':
    case 'issued':
    case 'processed':
    case 'resolved':
    case 'closed':
      return 'green';
    case 'cancelled':
    case 'failed':
    case 'rejected':
    case 'disputed':
    case 'no_show':
    case 'needs-attention':
    case 'abandoned':
    case 'reversed':
      return 'red';
    case 'refunded':
    case 'partially_refunded':
      return 'blue';
    case 'pending':
    case 'placed':
    case 'requested':
    case 'awaiting_approval':
    case 'opened':
    case 'processing':
    case 'open':
    case 'assigned':
    case 'held':
      return 'amber';
    default:
      return 'grey';
  }
}

const ACTION: Record<string, string> = {
  'customer.profile_viewed': 'Opened the profile',
  'customer.note_added': 'Added a note',
  'customer.suspended': 'Suspended',
  'customer.reactivated': 'Reactivated',
  'customer.vip_changed': 'Changed VIP',
  'customer.verification_resent': 'Resent the verification email',
};

export function actionLabel(action: string): string {
  return ACTION[action] ?? words(action.split('.').pop());
}

/** KES from cents: "KES 1,250". */
export function kes(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `KES ${Math.round(cents / 100).toLocaleString('en-KE')}`;
}

export function day(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  });
}

export function dayTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
}

/** "3 days ago", "2 months ago", for last-seen columns. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'Never';
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 3600) return 'Within the hour';
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86_400);
  if (d < 31) return `${d} day${d === 1 ? '' : 's'} ago`;
  const m = Math.floor(d / 30.4);
  if (m < 12) return `${m} month${m === 1 ? '' : 's'} ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y === 1 ? '' : 's'} ago`;
}
