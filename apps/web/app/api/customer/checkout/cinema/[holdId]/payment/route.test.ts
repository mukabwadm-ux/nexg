import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const stub = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/customer-api', () => ({
  customerApiClient: () => ({ auth: { getUser: stub.getUser }, rpc: stub.rpc }),
}));

import { GET, POST } from './route';

const TEST = 'sk_test_ci_only_0123456789';
const HOLD = '22222222-2222-4222-8222-222222222222';
const url = (id = HOLD) => `https://www.nexgapp.com/api/customer/checkout/cinema/${id}/payment`;
const post = (body: object, id = HOLD) =>
  POST(
    new Request(url(id), {
      method: 'POST',
      headers: { Authorization: 'Bearer access.token' },
      body: JSON.stringify(body),
    }),
    { params: { holdId: id } },
  );
const get = (id = HOLD) =>
  GET(new Request(url(id), { headers: { Authorization: 'Bearer access.token' } }), {
    params: { holdId: id },
  });

type Answer = { data?: unknown; error?: { code?: string; message: string } | null };
function database(answers: Record<string, Answer>) {
  stub.rpc.mockImplementation(async (fn: string) => {
    const found = answers[fn] ?? { data: { ok: true } };
    return { data: found.data ?? null, error: found.error ?? null };
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', TEST);
  vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', '');
  vi.stubEnv('NEXG_PAYSTACK_LIVE', '');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.nexgapp.com');
  stub.getUser.mockResolvedValue({
    data: { user: { id: 'u', email: 'k@example.com' } },
    error: null,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('paying for a cinema seat hold', () => {
  it("charges the hold's total through Paystack's card page, as the customer", async () => {
    database({
      rpc_cinema_payment_state: { data: { status: 'unpaid' } },
      rpc_payment_begin_cinema: {
        data: {
          ok: true,
          reference: 'NXP-C',
          amount_cents: 130000,
          currency: 'KES',
          reused: false,
        },
      },
      rpc_payment_paystack_attempt: {
        data: {
          attempt_reference: 'NXP-C-1',
          channel: 'card',
          amount_cents: 130000,
          is_test: true,
          reused: false,
        },
      },
    });
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          data: { authorization_url: 'https://checkout.paystack.com/abc', access_code: 'abc' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);

    const response = await post({ method: 'card' });
    expect(await response.json()).toEqual({
      status: 'pending',
      reference: 'NXP-C',
      url: 'https://checkout.paystack.com/abc',
      test: true,
    });
    expect(stub.rpc).toHaveBeenCalledWith('rpc_payment_begin_cinema', { p_hold_id: HOLD });
    expect(stub.rpc).toHaveBeenCalledWith(
      'rpc_payment_paystack_attempt',
      expect.objectContaining({ p_payment_reference: 'NXP-C', p_channel: 'card', p_proof: TEST }),
    );
    const sent = JSON.parse((fetch.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(sent.amount).toBe(130000);
    expect(JSON.parse(sent.metadata)).toMatchObject({
      cinema_hold_id: HOLD,
      payment_reference: 'NXP-C',
    });
  });

  it('sends an M-Pesa prompt through Paystack', async () => {
    database({
      rpc_cinema_payment_state: { data: { status: 'unpaid' } },
      rpc_payment_begin_cinema: { data: { reference: 'NXP-C', amount_cents: 65000 } },
      rpc_payment_paystack_attempt: {
        data: {
          attempt_reference: 'NXP-C-2',
          channel: 'mpesa',
          amount_cents: 65000,
          is_test: true,
          reused: false,
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ status: true, data: { status: 'pay_offline' } })),
        ),
    );
    expect(await (await post({ method: 'mpesa_stk', phone: '0712345678' })).json()).toEqual({
      status: 'pending',
      reference: 'NXP-C',
      retryAfterSeconds: 180,
      test: true,
    });
  });

  it('says paid when it is, without starting another payment', async () => {
    database({ rpc_cinema_payment_state: { data: { status: 'paid', reference: 'NXP-C' } } });
    expect(await (await post({ method: 'card' })).json()).toEqual({
      status: 'paid',
      reference: 'NXP-C',
    });
    expect(stub.rpc).not.toHaveBeenCalledWith('rpc_payment_begin_cinema', expect.anything());
  });

  it("passes on the database's refusal in the customer's words", async () => {
    database({
      rpc_cinema_payment_state: { data: { status: 'unpaid' } },
      rpc_payment_begin_cinema: {
        error: {
          code: '22023',
          message: "There isn't enough time left on this hold to pay. Hold the seats again?",
        },
      },
    });
    const response = await post({ method: 'card' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'PAYMENT_REFUSED',
      title: "There isn't enough time left on this hold to pay. Hold the seats again?",
    });
  });

  it("someone else's hold, or one that does not exist, cannot be paid", async () => {
    database({
      rpc_cinema_payment_state: { data: { status: 'unpaid' } },
      rpc_payment_begin_cinema: { error: { code: '42501', message: 'Not your hold.' } },
    });
    expect((await post({ method: 'card' })).status).toBe(401);
    database({ rpc_cinema_payment_state: { error: { code: 'P0002', message: 'No hold.' } } });
    expect((await post({ method: 'card' })).status).toBe(404);
    expect((await post({ method: 'card' }, 'not-a-uuid')).status).toBe(404);
  });

  it('needs a session', async () => {
    const response = await POST(
      new Request(url(), { method: 'POST', headers: { Authorization: 'Basic x' }, body: '{}' }),
      { params: { holdId: HOLD } },
    );
    expect(response.status).toBe(401);
    expect(stub.rpc).not.toHaveBeenCalled();
  });
});

describe('reading the payment', () => {
  it("answers the payment state of the customer's hold", async () => {
    database({
      rpc_cinema_payment_state: {
        data: { status: 'pending', reference: 'NXP-C', is_test: true, retry_after_seconds: 120 },
      },
    });
    expect(await (await get()).json()).toEqual({
      status: 'pending',
      reference: 'NXP-C',
      retryAfterSeconds: 120,
      test: true,
    });
    expect(stub.rpc).toHaveBeenCalledWith('rpc_cinema_payment_state', { p_hold_id: HOLD });
  });
});
