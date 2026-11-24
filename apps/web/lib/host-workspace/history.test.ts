import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { HostWorkspaceAccess } from './access';
import { commissionMetric, financeHistory, payoutMetric } from './history';

const HOST = '11111111-1111-4111-8111-111111111111';

/** A query chain that answers every select, filter, order and range with `result`. */
function chain(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  for (const step of ['select', 'eq', 'in', 'gte', 'order', 'range']) query[step] = () => query;
  query.maybeSingle = async () => result;
  query.then = (done: (value: unknown) => unknown) => Promise.resolve(result).then(done);
  return query;
}

function access(rpc: (fn: string) => unknown) {
  const db = {
    from: (table: string) =>
      chain(
        table === 'host_earnings_v'
          ? { data: { outstanding_cents: 0, paid_cents: 0 }, error: null }
          : { data: [], error: null },
      ),
    rpc: vi.fn(async (fn: string) => rpc(fn)),
  };
  return {
    db,
    access: {
      db,
      hostId: HOST,
      unitScope: null,
      role: 'Owner',
      userId: 'user-1',
      email: 'host@example.test',
      name: 'Host',
    } as unknown as HostWorkspaceAccess,
  };
}

const read = { charged_now: { pct: 12.5, agreed: true, preset_pct: 15 } };
const overview = {
  viewer: 'host',
  subaccounts: [
    {
      status: 'active',
      schedule: 'monthly',
      test: true,
      details: { settlement_bank: 'Test Bank', account_last4: '9999' },
    },
    {
      status: 'active',
      schedule: 'auto',
      test: false,
      details: { settlement_bank: 'Equity Bank', account_last4: '1234' },
    },
  ],
  stays: [],
};

describe("the host's commission and how they are paid", () => {
  it('shows the agreed rate and the live sub-account', async () => {
    const { access: host, db } = access((fn) =>
      fn === 'rpc_host_commission_read'
        ? { data: read, error: null }
        : { data: overview, error: null },
    );
    const { metrics } = await financeHistory(host);
    expect(metrics.slice(-2)).toEqual([
      { label: 'NexG commission', value: '12.5%', note: 'Agreed with NexG' },
      {
        label: "How you're paid",
        value: 'Paystack, every 2 working days',
        note: 'Equity Bank ····1234',
      },
    ]);
    expect(db.rpc).toHaveBeenCalledWith('rpc_host_commission_read', { p_host_id: HOST });
    expect(db.rpc).toHaveBeenCalledWith('rpc_host_split_overview', { p_host_id: HOST });
  });

  it('the standard rate, and the weekly run without an active sub-account', () => {
    expect(commissionMetric({ charged_now: { pct: 15, agreed: false } })).toEqual({
      label: 'NexG commission',
      value: '15%',
      note: 'NexG standard rate',
    });
    for (const subaccounts of [[], [{ status: 'paused', schedule: 'auto', test: false }]])
      expect(payoutMetric({ subaccounts, stays: [] })).toEqual({
        label: "How you're paid",
        value: 'NexG weekly payout run',
        note: '',
      });
    expect(payoutMetric({ subaccounts: [overview.subaccounts[0]] })).toEqual({
      label: "How you're paid",
      value: 'Paystack, every month (test)',
      note: 'Test Bank ····9999',
    });
  });

  it('leaves both out, and still loads the page, when the RPCs fail or answer oddly', async () => {
    for (const answer of [
      { data: null, error: { code: 'PGRST202', message: 'missing' } },
      { data: 'odd', error: null },
      { data: [], error: null },
      { data: { charged_now: { pct: 'x' }, subaccounts: 'x' }, error: null },
    ]) {
      const { access: host } = access(() => answer);
      const { metrics } = await financeHistory(host);
      expect(metrics.map((metric) => metric.label)).toEqual([
        'Invoices due',
        'Invoices paid',
        'Referral credits',
        'Guest order value',
      ]);
    }
    const { access: thrown } = access(() => {
      throw new Error('network');
    });
    expect((await financeHistory(thrown)).metrics).toHaveLength(4);
  });
});
