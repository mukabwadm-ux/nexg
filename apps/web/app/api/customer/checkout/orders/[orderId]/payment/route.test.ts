import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  ready: vi.fn(),
  reconcile: vi.fn(),
  send: vi.fn(),
}));
vi.mock('@/lib/supabase/customer-api', () => ({ customerApiClient: mocks.client }));
vi.mock('@/lib/mpesa-prompt', () => ({
  mpesaDispatchIsReady: mocks.ready,
  sendMpesaPrompt: mocks.send,
  reconcileMpesaPrompts: mocks.reconcile,
}));
vi.mock('@/lib/daraja', () => ({
  normalisePhone: (phone: string) => phone,
  callbackOrigin: () => 'https://www.nexgapp.com',
}));

import { GET, POST } from './route';

const orderId = '12345678-1234-4123-a123-123456789abc';
const context = { params: { orderId } };
const order = {
  id: orderId,
  reference: 'NX-ORDER',
  stage: 'placed',
  payment_method: 'mpesa_stk',
  payment_status: 'pending',
};
const url = `https://www.nexgapp.com/api/customer/checkout/orders/${orderId}/payment`;
const read = () => new Request(url, { headers: { authorization: 'Bearer session' } });
const pay = () =>
  new Request(url, {
    method: 'POST',
    headers: { authorization: 'Bearer session' },
    body: JSON.stringify({ method: 'mpesa_stk', phone: '+254712345678' }),
  });

function setup({
  owned = true,
  payment = null,
}: { owned?: boolean; payment?: Record<string, unknown> | null } = {}) {
  const from = vi.fn((table: string) => {
    const data =
      table === 'guest' ? { id: 'guest' } : table === 'order' ? (owned ? order : null) : payment;
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    };
    return builder;
  });
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: { reference: 'PAY-1', amount_cents: 19000 }, error: null });
  mocks.client.mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'customer' } }, error: null }),
    },
    from,
    rpc,
  });
  return { from, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ready.mockResolvedValue(true);
  mocks.reconcile.mockResolvedValue(false);
  mocks.send.mockResolvedValue({ ok: true });
});

it('does not start a payment outside the signed-in customer’s orders', async () => {
  const { from, rpc } = setup({ owned: false });
  expect((await POST(pay(), context)).status).toBe(404);
  expect(from.mock.calls.map(([table]) => table)).toEqual(['guest', 'order']);
  expect(from.mock.results[1]!.value.eq).toHaveBeenCalledWith('guest_id', 'guest');
  expect(rpc).not.toHaveBeenCalled();
});

it('uses the owner’s amount and reports a sent prompt as pending', async () => {
  const { rpc } = setup();
  expect(await (await POST(pay(), context)).json()).toMatchObject({
    status: 'pending',
    reference: 'PAY-1',
  });
  expect(rpc).toHaveBeenCalledWith('rpc_payment_begin_order', { p_order_id: orderId });
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({ amountCents: 19000, phone: '+254712345678' }),
  );
});

it('reports a settled payment and does not start another prompt', async () => {
  const { rpc } = setup({ payment: { state: 'paid', reference: 'PAY-1' } });
  expect(await (await GET(read(), context)).json()).toEqual({ status: 'paid', reference: 'PAY-1' });
  expect(await (await POST(pay(), context)).json()).toEqual({ status: 'paid', reference: 'PAY-1' });
  expect(rpc).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
