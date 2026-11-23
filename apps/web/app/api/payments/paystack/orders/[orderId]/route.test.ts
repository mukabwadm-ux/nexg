import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ user: null as { email: string } | null }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}));
vi.mock('@/lib/order-payment', () => ({
  startOrderPayment: async (
    request: Request,
    _orderId: string,
    session: (request: Request) => Promise<Response | { email: string | null }>,
  ) => {
    const result = await session(request);
    return result instanceof Response ? result : Response.json({ email: result.email });
  },
}));

import { POST } from './route';

function call(headers: Record<string, string>) {
  const request = new Request('http://localhost:3000/api/payments/paystack/orders/o1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ method: 'card' }),
  });
  return POST(request, { params: { orderId: 'o1' } });
}

describe('the pay page starts a Paystack payment', () => {
  beforeEach(() => {
    state.user = { email: 'guest@example.com' };
  });

  it('works from NexG’s own page behind the proxy', async () => {
    const res = await call({ origin: 'https://nexg.example', host: 'nexg.example' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'guest@example.com' });
  });

  it('refuses another site, and a request with no origin', async () => {
    expect((await call({ origin: 'https://evil.example', host: 'nexg.example' })).status).toBe(403);
    expect((await call({ host: 'nexg.example' })).status).toBe(403);
  });

  it('asks to open the order again when the session ended', async () => {
    state.user = null;
    const res = await call({ origin: 'https://nexg.example', host: 'nexg.example' });
    expect(res.status).toBe(401);
  });
});
