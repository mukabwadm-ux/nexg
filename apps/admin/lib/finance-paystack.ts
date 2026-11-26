/**
 * What Finance › Paystack reads: the six database functions of
 * 20270330000200_finance_paystack_screen.sql and Paystack's two answers
 * (GET /balance, GET /settlement). Pure functions.
 *
 * The page may run before the migration is on the database, so nothing here
 * trusts a shape: an answer that is not the expected object is null, and a
 * money figure that is not a number is null (shown as a dash), never zero.
 */

/* ─────────────────────────────────────────────────────────── a database read */

export type Read<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; /** 42501 */ forbidden: boolean };

export interface RpcResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

/** PostgREST's and Postgres's codes for a function that is not there. */
const MISSING = ['PGRST202', '42883'];

export function readAnswer<T>(result: RpcResult, parse: (data: unknown) => T | null): Read<T> {
  const { error } = result;
  if (error) {
    const missing = MISSING.includes(error.code ?? '');
    return {
      ok: false,
      forbidden: error.code === '42501',
      message: missing
        ? 'This part is not on the database yet.'
        : `Could not be loaded: ${error.message.slice(0, 300)}`,
    };
  }
  const data = parse(result.data);
  return data === null
    ? {
        ok: false,
        forbidden: false,
        message: 'Could not be loaded: the database sent something this screen cannot read.',
      }
    : { ok: true, data };
}

/* ────────────────────────────────────────────────────────────────── writing */

/** KES from cents, with the cents only when there are some: "KES 1,234.50". */
export function money(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  const abs = Math.abs(cents);
  const digits = abs % 100 === 0 ? 0 : 2;
  const text = (abs / 100).toLocaleString('en-KE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${cents < 0 ? '−' : ''}KES ${text}`;
}

export const SCHEDULES: Record<string, string> = {
  auto: 'Every 2 working days',
  weekly: 'Weekly',
  monthly: 'Monthly',
  manual: 'Manual',
};

export const PAYOUT_MODES = ['run', 'immediate', 'daily', 'weekly', 'monthly'] as const;
export type PayoutMode = (typeof PAYOUT_MODES)[number];

export const MODE_LABELS: Record<PayoutMode, string> = {
  run: 'Weekly run',
  immediate: 'After each delivery',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export const REFUND_KINDS = ['order', 'stay', 'booking', 'cinema'] as const;
export type RefundKind = (typeof REFUND_KINDS)[number];

/* ───────────────────────────────────────────────────────────── party pages */

/** Whose own pages a person can open. */
export interface Opens {
  merchant: boolean;
  host: boolean;
  rider: boolean;
}

/**
 * Row security shows a merchant, host or rider only to these roles, whatever
 * Finance access somebody has: for anyone else the party's page is empty or
 * "not found", so the screen offers no link there. (A grant for one city still
 * opens only that city's parties.)
 */
export function partyPages(staff: { isSuperAdmin: boolean; roles: string[] }): Opens {
  const has = (...roles: string[]) =>
    staff.isSuperAdmin || roles.some((role) => staff.roles.includes(role));
  return {
    merchant: has('merchant_ops'),
    host: has('ops_manager', 'partnerships', 'city_lead'),
    rider: has('rider_ops'),
  };
}

/* ─────────────────────────────────────────────────────────────────── shapes */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
/** numeric comes back as a number, but a string is read too. */
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
/** Every named key of the answer is a list: otherwise it is not this answer. */
const hasLists = (v: unknown, keys: string[]): v is Obj =>
  isObj(v) && keys.every((k) => Array.isArray(v[k]));
/** Each row through `one`, without those it cannot read. */
const rows = <T>(v: unknown, one: (row: Obj) => T | null): T[] =>
  list(v).flatMap((row) => {
    const read = one(row);
    return read === null ? [] : [read];
  });
/** An object whose named keys are all numbers, or null. */
function figures<K extends string>(v: unknown, keys: readonly K[]): Record<K, number> | null {
  if (!isObj(v)) return null;
  const out = {} as Record<K, number>;
  for (const k of keys) {
    const n = num(v[k]);
    if (n === null) return null;
    out[k] = n;
  }
  return out;
}

/* ───────────────────────────────────────────────────── NexG's own (books) */

export interface RevenueRow {
  account: string;
  name: string;
  earned_cents: number;
  refunded_cents: number;
  recovered_cents: number;
  net_cents: number;
}

export interface OffBooks {
  count: number;
  collected_cents: number;
  refunded_cents: number;
}

export interface NexgBooks {
  revenue: RevenueRow[];
  vat_cents: number;
  transfer_fees_cents: number;
  collection_fees_cents: number;
  fee_unknown_count: number;
  off_books: { booking: OffBooks; cinema: OffBooks };
  receivable_ledger_cents: number;
}

/**
 * rpc_finance_nexg. All or nothing: totals over part of the figures would
 * mislead, so one unreadable figure makes the whole answer unreadable.
 */
export function toNexg(data: unknown): NexgBooks | null {
  if (!isObj(data) || !Array.isArray(data.revenue) || !isObj(data.off_books)) return null;
  const totals = figures(data, [
    'vat_cents',
    'transfer_fees_cents',
    'collection_fees_cents',
    'fee_unknown_count',
    'receivable_ledger_cents',
  ]);
  const OFF = ['count', 'collected_cents', 'refunded_cents'] as const;
  const booking = figures(data.off_books.booking, OFF);
  const cinema = figures(data.off_books.cinema, OFF);
  if (!totals || !booking || !cinema) return null;
  const revenue: RevenueRow[] = [];
  for (const row of data.revenue as unknown[]) {
    const f = figures(row, ['earned_cents', 'refunded_cents', 'recovered_cents', 'net_cents']);
    const account = isObj(row) ? str(row.account) : null;
    if (!f || !account) return null;
    revenue.push({ account, name: str((row as Obj).name) ?? account, ...f });
  }
  return { ...totals, revenue, off_books: { booking, cinema } };
}

/* ───────────────────────────────────────────────────────── who gets paid */

export interface SubaccountRow {
  id: string;
  /** The merchant's id under merchants, the host's under hosts. */
  party_id: string;
  name: string | null;
  test: boolean;
  code: string;
  schedule: string;
  status: string;
  requested_by: string | null;
  requested_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  can_decide: boolean;
}

export interface RiderTransfer {
  id: string;
  reference: string;
  kind: string;
  rider_id: string | null;
  rider_name: string | null;
  amount_cents: number | null;
  fee_cents: number | null;
  fee_paid_by: string | null;
  test: boolean;
  state: string;
  failure_reason: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface RiderCity {
  city_id: string | null;
  city: string | null;
  rule_mode: string | null;
  automatic_from: string | null;
  riders: number | null;
  test_riders: number | null;
  modes: Record<PayoutMode, number | null>;
}

export interface Payees {
  merchants: SubaccountRow[];
  hosts: SubaccountRow[];
  rider_transfers: RiderTransfer[];
  rider_cities: RiderCity[];
  rider_automatic_live: boolean;
  live_worker_seen_at: string | null;
}

function subaccount(s: Obj): SubaccountRow | null {
  const id = str(s.id);
  const partyId = str(s.party_id);
  const code = str(s.code);
  if (!id || !partyId || !code) return null;
  return {
    id,
    party_id: partyId,
    name: str(s.name),
    test: s.test === true,
    code,
    schedule: str(s.schedule) ?? '',
    status: str(s.status) ?? '',
    requested_by: str(s.requested_by),
    requested_at: str(s.requested_at),
    decided_by: str(s.decided_by),
    decided_at: str(s.decided_at),
    can_decide: s.can_decide === true,
  };
}

/** rpc_finance_paystack_payees. */
export function toPayees(data: unknown): Payees | null {
  if (!hasLists(data, ['merchants', 'hosts', 'rider_transfers', 'rider_cities'])) return null;
  return {
    merchants: rows(data.merchants, subaccount),
    hosts: rows(data.hosts, subaccount),
    rider_transfers: rows(data.rider_transfers, (t) => {
      const id = str(t.id);
      if (!id) return null;
      return {
        id,
        reference: str(t.reference) ?? '',
        kind: str(t.kind) ?? '',
        rider_id: str(t.rider_id),
        rider_name: str(t.rider_name),
        amount_cents: num(t.amount_cents),
        fee_cents: num(t.fee_cents),
        fee_paid_by: str(t.fee_paid_by),
        test: t.test === true,
        state: str(t.state) ?? '',
        failure_reason: str(t.failure_reason),
        created_at: str(t.created_at),
        completed_at: str(t.completed_at),
      };
    }),
    rider_cities: rows(data.rider_cities, (c) => {
      const modes = isObj(c.modes) ? c.modes : {};
      return {
        city_id: str(c.city_id),
        city: str(c.city),
        rule_mode: str(c.rule_mode),
        automatic_from: str(c.automatic_from),
        riders: num(c.riders),
        test_riders: num(c.test_riders),
        modes: Object.fromEntries(
          PAYOUT_MODES.map((m) => [m, num(modes[m])]),
        ) as RiderCity['modes'],
      };
    }),
    rider_automatic_live: data.rider_automatic_live === true,
    live_worker_seen_at: str(data.live_worker_seen_at),
  };
}

/* ─────────────────────────────────────────────────────────────── waiting */

export interface PendingSubaccount {
  id: string;
  party_id: string;
  name: string | null;
  test: boolean;
  code: string;
  schedule: string;
  details: {
    business_name: string | null;
    settlement_bank: string | null;
    account_last4: string | null;
    paystack_schedule: string | null;
  };
  note: string | null;
  requested_by: string | null;
  requested_at: string | null;
  can_decide: boolean;
}

export interface PendingCommission {
  id: string;
  party_id: string;
  name: string | null;
  /** A merchant's two rates; null is the preset. */
  own_delivery_pct: number | null;
  nexg_delivery_pct: number | null;
  /** A host's rate. */
  pct: number | null;
  starts_on: string | null;
  ends_on: string | null;
  reason: string | null;
  terms_ref: string | null;
  requested_by: string | null;
  requested_at: string | null;
  can_decide: boolean;
}

export interface Approvals {
  merchant_subaccounts: PendingSubaccount[];
  host_subaccounts: PendingSubaccount[];
  merchant_commissions: PendingCommission[];
  host_commissions: PendingCommission[];
}

const pendingSubaccount =
  (party: 'merchant_id' | 'host_id') =>
  (s: Obj): PendingSubaccount | null => {
    const id = str(s.id);
    const partyId = str(s[party]);
    const code = str(s.code);
    if (!id || !partyId || !code) return null;
    const d = isObj(s.details) ? s.details : {};
    return {
      id,
      party_id: partyId,
      name: str(s.name),
      test: s.test === true,
      code,
      schedule: str(s.schedule) ?? '',
      details: {
        business_name: str(d.business_name),
        settlement_bank: str(d.settlement_bank),
        account_last4: str(d.account_last4),
        paystack_schedule: str(d.paystack_schedule),
      },
      note: str(s.note),
      requested_by: str(s.requested_by),
      requested_at: str(s.requested_at),
      can_decide: s.can_decide === true,
    };
  };

const pendingCommission =
  (party: 'merchant_id' | 'host_id') =>
  (t: Obj): PendingCommission | null => {
    const id = str(t.id);
    const partyId = str(t[party]);
    if (!id || !partyId) return null;
    return {
      id,
      party_id: partyId,
      name: str(t.name),
      own_delivery_pct: num(t.own_delivery_pct),
      nexg_delivery_pct: num(t.nexg_delivery_pct),
      pct: num(t.pct),
      starts_on: str(t.starts_on),
      ends_on: str(t.ends_on),
      reason: str(t.reason),
      terms_ref: str(t.terms_ref),
      requested_by: str(t.requested_by),
      requested_at: str(t.requested_at),
      can_decide: t.can_decide === true,
    };
  };

/** rpc_finance_paystack_approvals. */
export function toApprovals(data: unknown): Approvals | null {
  const keys = [
    'merchant_subaccounts',
    'host_subaccounts',
    'merchant_commissions',
    'host_commissions',
  ];
  if (!hasLists(data, keys)) return null;
  return {
    merchant_subaccounts: rows(data.merchant_subaccounts, pendingSubaccount('merchant_id')),
    host_subaccounts: rows(data.host_subaccounts, pendingSubaccount('host_id')),
    merchant_commissions: rows(data.merchant_commissions, pendingCommission('merchant_id')),
    host_commissions: rows(data.host_commissions, pendingCommission('host_id')),
  };
}

/* ─────────────────────────────────────────────────────────────── refunds */

export const REFUND_SHOWS = ['due', 'refunded', 'all'] as const;
export type RefundShow = (typeof REFUND_SHOWS)[number];

export const REFUND_STATES: Record<string, string> = {
  opened: 'Started, no answer recorded',
  pending: 'With Paystack: pending',
  processing: 'With Paystack: processing',
  processed: 'Processed by Paystack',
  failed: 'Failed',
  'needs-attention': 'Needs attention in Paystack',
};

export interface RefundRow {
  id: string;
  reference: string;
  kind: RefundKind;
  label: string;
  paid_reference: string | null;
  amount_cents: number | null;
  is_test: boolean;
  state: string;
  failure_reason: string | null;
  settled: boolean;
  by_hand: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DueRow {
  kind: RefundKind;
  target_id: string;
  label: string;
  paid_reference: string | null;
  amount_cents: number | null;
  is_test: boolean;
  due_since: string | null;
  can_send: boolean;
  by_hand: boolean;
  last_try: {
    reference: string;
    state: string;
    failure_reason: string | null;
    updated_at: string | null;
  } | null;
}

export interface Refunds {
  refunds: RefundRow[];
  due: DueRow[];
}

const refundKind = (v: unknown) => REFUND_KINDS.find((k) => k === v) ?? null;

/** rpc_finance_paystack_refunds. */
export function toRefunds(data: unknown): Refunds | null {
  if (!hasLists(data, ['refunds', 'due'])) return null;
  return {
    refunds: rows(data.refunds, (r) => {
      const id = str(r.id);
      const kind = refundKind(r.kind);
      if (!id || !kind) return null;
      return {
        id,
        reference: str(r.reference) ?? '',
        kind,
        label: str(r.label) ?? kind,
        paid_reference: str(r.paid_reference),
        amount_cents: num(r.amount_cents),
        is_test: r.is_test === true,
        state: str(r.state) ?? '',
        failure_reason: str(r.failure_reason),
        settled: r.settled === true,
        by_hand: r.by_hand === true,
        created_by: str(r.created_by),
        created_at: str(r.created_at),
        updated_at: str(r.updated_at),
      };
    }),
    due: rows(data.due, (r) => {
      const targetId = str(r.target_id);
      const kind = refundKind(r.kind);
      if (!targetId || !kind) return null;
      const t = isObj(r.last_try) ? r.last_try : null;
      return {
        kind,
        target_id: targetId,
        label: str(r.label) ?? kind,
        paid_reference: str(r.paid_reference),
        amount_cents: num(r.amount_cents),
        is_test: r.is_test === true,
        due_since: str(r.due_since),
        can_send: r.can_send === true,
        by_hand: r.by_hand === true,
        last_try: t
          ? {
              reference: str(t.reference) ?? '',
              state: str(t.state) ?? '',
              failure_reason: str(t.failure_reason),
              updated_at: str(t.updated_at),
            }
          : null,
      };
    }),
  };
}

/* ────────────────────────────────────────────────────────────── problems */

export interface ProblemEvent {
  event_id: number;
  at: string | null;
  action: string;
  action_label: string;
  severity: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  reason: string | null;
  details: Record<string, unknown> | null;
  review_state: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  mine: boolean;
}

export interface Problems {
  events: ProblemEvent[];
  open_events: number | null;
  refunds_to_decide: {
    refund_id: string;
    merchant_id: string;
    name: string | null;
    order_reference: string | null;
    refund_cents: number | null;
    share_cents: number | null;
    requested_at: string | null;
    test: boolean;
  }[];
  invoiced_recoveries: {
    id: string;
    merchant_id: string;
    name: string | null;
    order_reference: string | null;
    amount_cents: number | null;
    note: string | null;
    decided_at: string | null;
    test: boolean;
  }[];
  otp_transfers: {
    id: string;
    reference: string;
    rider_id: string | null;
    rider_name: string | null;
    amount_cents: number | null;
    test: boolean;
    created_at: string | null;
  }[];
}

/** rpc_finance_paystack_problems. */
export function toProblems(data: unknown): Problems | null {
  const keys = ['events', 'refunds_to_decide', 'invoiced_recoveries', 'otp_transfers'];
  if (!hasLists(data, keys)) return null;
  return {
    events: rows(data.events, (e) => {
      const eventId = num(e.event_id);
      const action = str(e.action);
      if (eventId === null || !Number.isInteger(eventId) || !action) return null;
      return {
        event_id: eventId,
        at: str(e.at),
        action,
        action_label: str(e.action_label) ?? action,
        severity: str(e.severity) ?? '',
        target_type: str(e.target_type),
        target_id: str(e.target_id),
        target_label: str(e.target_label),
        reason: str(e.reason),
        details: isObj(e.details) ? e.details : null,
        review_state: str(e.review_state) ?? 'none',
        reviewed_by: str(e.reviewed_by),
        reviewed_at: str(e.reviewed_at),
        review_note: str(e.review_note),
        mine: e.mine === true,
      };
    }),
    open_events: num(data.open_events),
    refunds_to_decide: rows(data.refunds_to_decide, (r) => {
      const refundId = str(r.refund_id);
      const merchantId = str(r.merchant_id);
      if (!refundId || !merchantId) return null;
      return {
        refund_id: refundId,
        merchant_id: merchantId,
        name: str(r.name),
        order_reference: str(r.order_reference),
        refund_cents: num(r.refund_cents),
        share_cents: num(r.share_cents),
        requested_at: str(r.requested_at),
        test: r.test === true,
      };
    }),
    invoiced_recoveries: rows(data.invoiced_recoveries, (r) => {
      const id = str(r.id);
      const merchantId = str(r.merchant_id);
      if (!id || !merchantId) return null;
      return {
        id,
        merchant_id: merchantId,
        name: str(r.name),
        order_reference: str(r.order_reference),
        amount_cents: num(r.amount_cents),
        note: str(r.note),
        decided_at: str(r.decided_at),
        test: r.test === true,
      };
    }),
    otp_transfers: rows(data.otp_transfers, (t) => {
      const id = str(t.id);
      if (!id) return null;
      return {
        id,
        reference: str(t.reference) ?? '',
        rider_id: str(t.rider_id),
        rider_name: str(t.rider_name),
        amount_cents: num(t.amount_cents),
        test: t.test === true,
        created_at: str(t.created_at),
      };
    }),
  };
}

/* ────────────────────────────────────────────────────────────────── keys */

export interface KeyState {
  set: boolean;
  last4: string | null;
  updated_at: string | null;
}

export interface KeyStatus {
  test: KeyState;
  live: KeyState;
  server_token_set: boolean;
}

function keyState(v: unknown): KeyState | null {
  if (!isObj(v) || typeof v.set !== 'boolean') return null;
  const last4 = str(v.last4);
  return {
    set: v.set,
    /* Four characters at most, whatever is sent. */
    last4: last4 ? last4.slice(-4) : null,
    updated_at: str(v.updated_at),
  };
}

/** rpc_paystack_key_status. Never a key: only what the Keys tab shows. */
export function toKeyStatus(data: unknown): KeyStatus | null {
  if (!isObj(data)) return null;
  const test = keyState(data.test);
  const live = keyState(data.live);
  if (!test || !live || typeof data.server_token_set !== 'boolean') return null;
  return { test, live, server_token_set: data.server_token_set };
}

/* ─────────────────────────────────────────────────── Paystack's answers */

export interface Settlement {
  id: string;
  status: string;
  settlement_date: string | null;
  /** Paystack's effective_amount, in cents. */
  amount_cents: number | null;
  /** Paystack's total_fees, in cents. */
  fees_cents: number | null;
}

type FromPaystack<T> = { ok: true; data: T } | { ok: false; message: string };

const UNREADABLE = 'Paystack sent something we could not read.';

/** A body that says status true, or why not: any HTTP status is "answered". */
function paystackBody(answer: {
  answered: boolean;
  raw?: string;
  message: string;
}): FromPaystack<Obj> {
  if (!answer.answered || !answer.raw) return { ok: false, message: answer.message };
  let body: unknown;
  try {
    body = JSON.parse(answer.raw);
  } catch {
    return { ok: false, message: UNREADABLE };
  }
  if (!isObj(body)) return { ok: false, message: UNREADABLE };
  return body.status === true ? { ok: true, data: body } : { ok: false, message: answer.message };
}

/** A whole number of cents, as Paystack sends money (the currency's subunit). */
const cents = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && Number.isInteger(n) ? n : null;
};

/** GET /balance: data is [{ currency, balance }]. Only the KES balance. */
export function toBalance(answer: Parameters<typeof paystackBody>[0]): FromPaystack<number> {
  const body = paystackBody(answer);
  if (!body.ok) return body;
  if (!Array.isArray(body.data.data)) return { ok: false, message: UNREADABLE };
  const kes = list(body.data.data).find((b) => b.currency === 'KES');
  if (!kes) return { ok: false, message: 'Paystack sent no KES balance.' };
  const balance = cents(kes.balance);
  return balance === null ? { ok: false, message: UNREADABLE } : { ok: true, data: balance };
}

/** One page of GET /settlement: its KES settlements and how many pages there are. */
export function toSettlementPage(
  answer: Parameters<typeof paystackBody>[0],
): FromPaystack<{ rows: Settlement[]; received: number; pageCount: number | null }> {
  const body = paystackBody(answer);
  if (!body.ok) return body;
  const data = body.data.data;
  if (!Array.isArray(data)) return { ok: false, message: UNREADABLE };
  const read: Settlement[] = [];
  for (const row of data as unknown[]) {
    if (!isObj(row)) return { ok: false, message: UNREADABLE };
    if (row.currency !== 'KES') continue;
    const id = str(row.id) ?? num(row.id)?.toString() ?? null;
    const status = str(row.status);
    if (!id || !status) return { ok: false, message: UNREADABLE };
    read.push({
      id,
      status: status.toLowerCase(),
      settlement_date: str(row.settlement_date),
      amount_cents: cents(row.effective_amount),
      fees_cents: cents(row.total_fees),
    });
  }
  const meta = isObj(body.data.meta) ? body.data.meta : {};
  return {
    ok: true,
    data: { rows: read, received: data.length, pageCount: num(meta.pageCount) },
  };
}

/**
 * The sum of the amounts of the settlements in these states, or null when one
 * of them has no readable amount: never a total that leaves money out.
 */
export function settlementTotal(
  settlements: Settlement[],
  states: string[],
  field: 'amount_cents' | 'fees_cents' = 'amount_cents',
): { count: number; cents: number | null } {
  const these = settlements.filter((s) => states.includes(s.status));
  return {
    count: these.length,
    cents: these.reduce<number | null>(
      (sum, s) => (sum === null || s[field] === null ? null : sum + s[field]!),
      0,
    ),
  };
}
