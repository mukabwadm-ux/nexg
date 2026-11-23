import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const stub = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/customer-api', () => ({
  customerApiClient: () => ({ auth: { getUser: stub.getUser }, rpc: stub.rpc }),
}));

import { listCards, removeCard } from './customer-cards';

const TEST = 'sk_test_ci_only_0123456789';
const CARD = '01a12345-168a-4456-8b79-0123456789aa';
const request = (method = 'GET', auth = 'Bearer access.token') =>
  new Request('https://www.nexgapp.com/api/customer/payment-methods/cards', {
    method,
    headers: auth ? { Authorization: auth } : {},
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', TEST);
  vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', '');
  stub.getUser.mockResolvedValue({
    data: { user: { id: 'u1', email: 'owner@example.com', is_anonymous: false } },
    error: null,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('saved cards routes', () => {
  it('lists only brand, last four and expiry, for cards of the current mode', async () => {
    stub.rpc.mockResolvedValue({
      data: [
        {
          id: CARD,
          brand: 'visa',
          last4: '4081',
          exp_month: 12,
          exp_year: 2030,
          bank: 'TEST BANK',
          is_test: true,
        },
        {
          id: 'live-card',
          brand: 'mastercard',
          last4: '1111',
          exp_month: 1,
          exp_year: 2031,
          bank: null,
          is_test: false,
        },
      ],
      error: null,
    });
    const response = await listCards(request());
    expect(await response.json()).toEqual({
      cards: [
        {
          id: CARD,
          brand: 'visa',
          lastFour: '4081',
          expiryMonth: 12,
          expiryYear: 2030,
          bank: 'TEST BANK',
        },
      ],
      test: true,
    });
  });

  it('shows a guest nothing and needs a session', async () => {
    expect((await listCards(request('GET', ''))).status).toBe(401);
    stub.getUser.mockResolvedValue({
      data: { user: { id: 'g', is_anonymous: true } },
      error: null,
    });
    expect((await listCards(request())).status).toBe(401);
    expect(stub.rpc).not.toHaveBeenCalled();
  });

  it('lists nothing with no Paystack key', async () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', '');
    expect(await (await listCards(request())).json()).toEqual({ cards: [] });
    expect(stub.rpc).not.toHaveBeenCalled();
  });

  it('removes a card and switches it off at Paystack', async () => {
    stub.rpc.mockResolvedValue({
      data: { ok: true, is_test: true, authorization_code: 'AUTH_secret' },
      error: null,
    });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: true })));
    vi.stubGlobal('fetch', fetch);
    const response = await removeCard(request('DELETE'), CARD);
    expect(response.status).toBe(204);
    expect(stub.rpc).toHaveBeenCalledWith('rpc_my_card_remove', { p_card_id: CARD, p_proof: TEST });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.co/customer/authorization/deactivate');
    expect(JSON.parse(init.body as string)).toEqual({ authorization_code: 'AUTH_secret' });
  });

  it('says a card that is already gone is not found', async () => {
    stub.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'gone' } });
    expect((await removeCard(request('DELETE'), CARD)).status).toBe(404);
    expect((await removeCard(request('DELETE'), 'not-a-uuid')).status).toBe(404);
  });
});
