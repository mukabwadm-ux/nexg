import 'server-only';

import { toBalance, toSettlementPage, type Settlement } from '@/lib/finance-paystack';
import { fetchBalance, fetchSettlements, payoutMode, type PaystackMode } from '@/lib/paystack';
import { loadPaystackKeys } from '@/lib/paystack-keys';
import { periodBounds, type Period } from '@/lib/portal';

/*
 * NexG's own money as Paystack tells it, for Finance › Paystack: the balance
 * now and what was settled to NexG's bank in a period. Reads only. Call it
 * after requireStaff and requireModule(staff, 'finance').
 */

const PER_PAGE = 50;
/** 200 settlements; a longer list is shown in part, with no totals. */
const MAX_PAGES = 4;

export interface PaystackMoney {
  /** Null: the console holds no key. */
  mode: PaystackMode | null;
  fetched_at: string;
  balance: { ok: true; cents: number } | { ok: false; message: string };
  settlements: { ok: true; rows: Settlement[]; more: boolean } | { ok: false; message: string };
}

async function balance(mode: PaystackMode): Promise<PaystackMoney['balance']> {
  const read = toBalance(await fetchBalance(mode));
  return read.ok ? { ok: true, cents: read.data } : read;
}

async function settlements(
  mode: PaystackMode,
  period: Period,
): Promise<PaystackMoney['settlements']> {
  /* The period's Nairobi days, the last one to its end. */
  const { start, end } = periodBounds(period);
  const to = new Date(Date.parse(end) - 1).toISOString();
  const rows: Settlement[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const read = toSettlementPage(
      await fetchSettlements(mode, { from: start, to, page, perPage: PER_PAGE }),
    );
    /* One page missing would make every total wrong: show none of it. */
    if (!read.ok) return read;
    rows.push(...read.data.rows);
    const last =
      read.data.pageCount === null ? read.data.received < PER_PAGE : page >= read.data.pageCount;
    if (last) return { ok: true, rows, more: false };
  }
  return { ok: true, rows, more: true };
}

export async function paystackMoney(period: Period): Promise<PaystackMoney> {
  await loadPaystackKeys();
  const mode = payoutMode();
  const fetched_at = new Date().toISOString();
  if (!mode) {
    const none = { ok: false as const, message: 'Paystack is not connected on the console.' };
    return { mode, fetched_at, balance: none, settlements: none };
  }
  const [now, paid] = await Promise.all([balance(mode), settlements(mode, period)]);
  return { mode, fetched_at, balance: now, settlements: paid };
}
