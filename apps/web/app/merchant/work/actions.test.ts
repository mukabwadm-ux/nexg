import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], rpc: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath() {} }));
vi.mock('@/lib/merchant-action-access', () => ({
  async merchantActionClient() {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: async () => ({ data: mock.rows, error: null }),
      maybeSingle: async () => ({ data: mock.rows[0] ?? null, error: null }),
    };
    return { merchantId: 'merchant-1', client: { from: () => query, rpc: mock.rpc } };
  },
}));

import { advanceMerchantOrder, loadMerchantWork } from './actions';

const id = '11111111-2222-4333-8444-555555555555';
const order = (what_now: string, stage: string) => ({
  id,
  reference: 'NX-1',
  guest: 'Guest',
  item_count: 2,
  store: 'Main',
  placed_at: '2026-11-18T10:00:00Z',
  promised_ready_at: null,
  rider: null,
  what_now,
  stage,
  needs_your_ack: false,
});

beforeEach(() => {
  mock.rows = [];
  mock.rpc.mockReset();
});

describe('Work page orders', () => {
  it.each([
    ['to_cook', 'placed', 'start'],
    ['cooking', 'preparing', 'ready'],
    ['you_are_late', 'preparing', 'ready'],
    ['awaiting_payment', 'placed', undefined],
    ['waiting_for_a_rider', 'ready', undefined],
  ])('%s at %s offers %s', async (whatNow, stage, action) => {
    mock.rows = [order(whatNow, stage)];
    const result = await loadMerchantWork('WF_ORDER');
    expect(result.ok && result.records[0]?.nextAction?.id).toBe(action ?? undefined);
  });

  it('saves the step through rpc_merchant_order_step', async () => {
    mock.rows = [order('to_cook', 'placed')];
    mock.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const result = await advanceMerchantOrder(id, 'start');
    expect(mock.rpc).toHaveBeenCalledWith('rpc_merchant_order_step', {
      p_order_id: id,
      p_step: 'start',
    });
    expect(result.ok).toBe(true);
  });

  it('refuses a step the order does not offer', async () => {
    mock.rows = [order('awaiting_payment', 'placed')];
    const result = await advanceMerchantOrder(id, 'start');
    expect(result.ok).toBe(false);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('says to wait when the payment is not in yet', async () => {
    mock.rows = [order('to_cook', 'placed')];
    mock.rpc.mockResolvedValue({ data: null, error: { hint: 'awaiting_payment' } });
    const result = await advanceMerchantOrder(id, 'start');
    expect(result).toEqual({
      ok: false,
      message: 'Wait for the customer’s payment before starting this order.',
    });
  });
});
