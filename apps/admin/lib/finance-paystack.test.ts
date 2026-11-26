import { describe, expect, it } from 'vitest';

import {
  money,
  partyPages,
  readAnswer,
  settlementTotal,
  toApprovals,
  toBalance,
  toKeyStatus,
  toNexg,
  toPayees,
  toProblems,
  toRefunds,
  toSettlementPage,
} from './finance-paystack';

const paystack = (body: unknown, message = 'Paystack answered 200.') => ({
  answered: true,
  raw: typeof body === 'string' ? body : JSON.stringify(body),
  message,
});

const books = {
  from: '2026-11-01',
  to: '2026-11-26',
  revenue: [
    {
      account: 'revenue.commission',
      name: 'Commission',
      earned_cents: 150000,
      refunded_cents: 20000,
      recovered_cents: 5000,
      net_cents: 135000,
    },
  ],
  vat_cents: 24000,
  transfer_fees_cents: 4000,
  collection_fees_cents: 1550,
  fee_unknown_count: 1,
  off_books: {
    booking: { count: 2, collected_cents: 300000, refunded_cents: 100000 },
    cinema: { count: 0, collected_cents: 0, refunded_cents: 0 },
  },
  receivable_ledger_cents: -2500,
};

describe('writing money', () => {
  it('writes cents only when there are some, and a dash for an unknown figure', () => {
    expect(money(150000)).toBe('KES 1,500');
    expect(money(123450)).toBe('KES 1,234.50');
    expect(money(-2505)).toBe('−KES 25.05');
    expect(money(0)).toBe('KES 0');
    expect(money(null)).toBe('—');
    expect(money(undefined)).toBe('—');
  });
});

describe('reading a database answer', () => {
  it('says a missing function is not on the database yet', () => {
    const read = readAnswer(
      { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } },
      toNexg,
    );
    expect(read).toEqual({
      ok: false,
      forbidden: false,
      message: 'This part is not on the database yet.',
    });
  });

  it('marks a refusal, and passes any other error on', () => {
    expect(
      readAnswer({ data: null, error: { code: '42501', message: 'Only Finance.' } }, toNexg),
    ).toEqual({ ok: false, forbidden: true, message: 'Could not be loaded: Only Finance.' });
  });

  it('never turns an unexpected shape into figures', () => {
    const read = readAnswer({ data: { revenue: [] }, error: null }, toNexg);
    expect(read.ok).toBe(false);
  });
});

describe('rpc_finance_nexg', () => {
  it('reads the figures', () => {
    expect(toNexg(books)).toMatchObject({
      revenue: [{ account: 'revenue.commission', net_cents: 135000 }],
      vat_cents: 24000,
      fee_unknown_count: 1,
      off_books: { booking: { collected_cents: 300000 } },
      receivable_ledger_cents: -2500,
    });
  });

  it('is unreadable as a whole when one figure is missing, never zero', () => {
    expect(toNexg({ ...books, vat_cents: null })).toBeNull();
    expect(toNexg({ ...books, off_books: { booking: books.off_books.booking } })).toBeNull();
    expect(toNexg({ ...books, revenue: [{ account: 'revenue.commission' }] })).toBeNull();
    expect(toNexg(null)).toBeNull();
    expect(toNexg([])).toBeNull();
  });
});

describe('the lists', () => {
  const sub = {
    id: 's1',
    party_id: 'm1',
    name: 'Fixture Kitchen',
    test: true,
    code: 'ACCT_unit1',
    schedule: 'auto',
    status: 'pending',
    requested_by: 'Asha',
    requested_at: '2026-11-20T09:00:00Z',
    decided_by: null,
    decided_at: null,
    can_decide: true,
  };

  it('reads who gets paid, keeping unknown figures unknown', () => {
    const payees = toPayees({
      merchants: [sub, { id: 'no party or code' }],
      hosts: [],
      rider_transfers: [{ id: 't1', amount_cents: 'x', fee_cents: 4000, state: 'success' }],
      rider_cities: [{ city_id: 'c1', city: 'Nairobi', riders: 3, modes: { run: 3 } }],
      rider_automatic_live: false,
      live_worker_seen_at: null,
    })!;
    expect(payees.merchants).toHaveLength(1);
    expect(payees.merchants[0]).toMatchObject({ party_id: 'm1', can_decide: true });
    expect(payees.rider_transfers[0]).toMatchObject({ amount_cents: null, fee_cents: 4000 });
    expect(payees.rider_cities[0]!.modes).toEqual({
      run: 3,
      immediate: null,
      daily: null,
      weekly: null,
      monthly: null,
    });
    expect(toPayees({ merchants: [] })).toBeNull();
  });

  it('reads what is waiting, taking each party’s own id', () => {
    const approvals = toApprovals({
      merchant_subaccounts: [{ ...sub, merchant_id: 'm1', can_decide: 'yes' }],
      host_subaccounts: [{ ...sub, id: 's2', host_id: 'h1' }],
      merchant_commissions: [
        { id: 'c1', merchant_id: 'm1', own_delivery_pct: '12.50', nexg_delivery_pct: null },
      ],
      host_commissions: [{ id: 'c2', host_id: 'h1', pct: 10, can_decide: true }],
    })!;
    expect(approvals.merchant_subaccounts[0]).toMatchObject({
      party_id: 'm1',
      can_decide: false,
    });
    expect(approvals.host_subaccounts[0]).toMatchObject({ party_id: 'h1' });
    expect(approvals.merchant_commissions[0]).toMatchObject({
      own_delivery_pct: 12.5,
      nexg_delivery_pct: null,
    });
    expect(approvals.host_commissions[0]).toMatchObject({ pct: 10, can_decide: true });
    expect(toApprovals({})).toBeNull();
  });

  it('reads refunds and leaves out a kind it does not know', () => {
    const refunds = toRefunds({
      show: 'due',
      refunds: [{ id: 'r1', kind: 'stay', state: 'failed', settled: true }],
      due: [
        {
          kind: 'order',
          target_id: 'o1',
          amount_cents: 12345,
          can_send: true,
          last_try: { reference: 'NXR-1', state: 'failed', failure_reason: 'No funds' },
        },
        { kind: 'wallet', target_id: 'w1' },
      ],
    })!;
    expect(refunds.refunds[0]).toMatchObject({ kind: 'stay', settled: true, amount_cents: null });
    expect(refunds.due).toHaveLength(1);
    expect(refunds.due[0]).toMatchObject({
      can_send: true,
      by_hand: false,
      last_try: { state: 'failed' },
    });
    expect(toRefunds({ refunds: [] })).toBeNull();
  });

  it('reads problems', () => {
    const problems = toProblems({
      events: [
        { event_id: 7, action: 'payment.split_not_made', mine: false, details: { a: 1 } },
        { event_id: 'x', action: 'payment.split_not_made' },
      ],
      open_events: 1,
      refunds_to_decide: [{ refund_id: 'r1', merchant_id: 'm1', refund_cents: 100 }],
      invoiced_recoveries: [],
      otp_transfers: [{ id: 't1', reference: 'NXT-1', amount_cents: 5000 }],
      can_decide: true,
    })!;
    expect(problems.events).toHaveLength(1);
    expect(problems.events[0]).toMatchObject({
      event_id: 7,
      review_state: 'none',
      details: { a: 1 },
    });
    expect(problems.refunds_to_decide[0]).toMatchObject({ share_cents: null });
    expect(problems.otp_transfers[0]).toMatchObject({ amount_cents: 5000 });
    expect(toProblems({ events: [] })).toBeNull();
  });

  it('reads the key status and keeps four characters at most', () => {
    const status = toKeyStatus({
      test: { set: true, last4: 'sk_test_ci_only_0123456789', updated_at: '2026-11-20' },
      live: { set: false, last4: null, updated_at: null },
      server_token_set: true,
    })!;
    expect(status.test.last4).toBe('6789');
    expect(JSON.stringify(status)).not.toContain('sk_test_');
    expect(toKeyStatus({ test: { set: true } })).toBeNull();
  });
});

describe('Paystack’s answers', () => {
  it('takes the KES balance, in cents', () => {
    const answer = paystack({
      status: true,
      message: 'Balances retrieved',
      data: [
        { currency: 'NGN', balance: 100 },
        { currency: 'KES', balance: 1700050 },
      ],
    });
    expect(toBalance(answer)).toEqual({ ok: true, data: 1700050 });
  });

  it('is unavailable, never zero, when Paystack refuses or says something else', () => {
    expect(toBalance(paystack({ status: false, message: 'Invalid key' }, 'Invalid key'))).toEqual({
      ok: false,
      message: 'Invalid key',
    });
    expect(toBalance({ answered: false, message: 'We could not reach Paystack.' })).toEqual({
      ok: false,
      message: 'We could not reach Paystack.',
    });
    expect(toBalance(paystack({ status: true, data: [] })).ok).toBe(false);
    expect(toBalance(paystack({ status: true, data: [{ currency: 'KES' }] })).ok).toBe(false);
    expect(toBalance(paystack('<html>')).ok).toBe(false);
    expect(toSettlementPage(paystack({ status: false, data: [] })).ok).toBe(false);
    expect(toSettlementPage(paystack({ status: true })).ok).toBe(false);
  });

  it('reads KES settlements and the page count', () => {
    const page = toSettlementPage(
      paystack({
        status: true,
        data: [
          {
            id: 3090024,
            status: 'success',
            currency: 'KES',
            total_amount: 99500,
            effective_amount: 99500,
            total_fees: 500,
            settlement_date: '2026-11-09T00:00:00.000Z',
          },
          { id: 2, status: 'pending', currency: 'NGN', effective_amount: 10 },
        ],
        meta: { pageCount: 3 },
      }),
    );
    expect(page).toEqual({
      ok: true,
      data: {
        rows: [
          {
            id: '3090024',
            status: 'success',
            settlement_date: '2026-11-09T00:00:00.000Z',
            amount_cents: 99500,
            fees_cents: 500,
          },
        ],
        received: 2,
        pageCount: 3,
      },
    });
  });

  it('offers a party page only to the roles row security shows that party to', () => {
    const of = (...roles: string[]) => partyPages({ isSuperAdmin: false, roles });
    const none = { merchant: false, host: false, rider: false };
    expect(of('finance')).toEqual(none);
    expect(of('merchant_ops')).toEqual({ ...none, merchant: true });
    expect(of('rider_ops')).toEqual({ ...none, rider: true });
    for (const role of ['ops_manager', 'partnerships', 'city_lead']) {
      expect(of('finance', role)).toEqual({ ...none, host: true });
    }
    expect(partyPages({ isSuperAdmin: true, roles: ['super_admin'] })).toEqual({
      merchant: true,
      host: true,
      rider: true,
    });
  });

  it('totals nothing it cannot read in full', () => {
    const row = (status: string, amount_cents: number | null) => ({
      id: status,
      status,
      settlement_date: null,
      amount_cents,
      fees_cents: 0,
    });
    const rows = [row('success', 100), row('success', null), row('pending', 40)];
    expect(settlementTotal(rows, ['success'])).toEqual({ count: 2, cents: null });
    expect(settlementTotal(rows, ['pending', 'processing'])).toEqual({ count: 1, cents: 40 });
    expect(settlementTotal(rows, ['failed'])).toEqual({ count: 0, cents: 0 });
  });
});
