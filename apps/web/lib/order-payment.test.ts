import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const stub = vi.hoisted(() => ({
  getUser: vi.fn(),
  cookieUser: vi.fn(),
  rpc: vi.fn(),
  prompt: vi.fn(),
  bank: vi.fn(),
  /* The order's own row: what the M-Pesa SMS names. */
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { reference: 'NX-26-0001' } }) }),
    }),
  }),
}));
vi.mock('@/lib/supabase/customer-api', () => ({
  customerApiClient: () => ({ auth: { getUser: stub.getUser }, rpc: stub.rpc, from: stub.from }),
}));
/* The website's own pages sign in with their session cookie. */
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: stub.cookieUser },
    rpc: stub.rpc,
    from: stub.from,
  }),
}));
vi.mock('@/lib/mpesa-prompt', () => ({ sendMpesaPrompt: stub.prompt }));
vi.mock('@/lib/bank/payments', () => ({ startBankPayment: stub.bank }));

import { readOrderPayment, startOrderPayment } from './order-payment';

const TEST = 'sk_test_ci_only_0123456789';
const ORDER = '01a12345-168a-4456-8b79-012345678910';

type Answers = Record<string, { data?: unknown; error?: { code: string; message: string } }>;
function answer(answers: Answers) {
  stub.rpc.mockImplementation(async (fn: string) => {
    const next = answers[fn];
    if (!next) throw new Error(`unexpected rpc ${fn}`);
    return { data: next.data ?? null, error: next.error ?? null };
  });
}

function request(body?: object, auth = 'Bearer access.token') {
  return new Request(`https://www.nexgapp.com/api/customer/checkout/orders/${ORDER}/payment`, {
    method: body ? 'POST' : 'GET',
    headers: auth ? { Authorization: auth } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const paystackOk = (data: object) =>
  new Response(JSON.stringify({ status: true, message: 'ok', data }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', TEST);
  vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.nexgapp.com');
  stub.getUser.mockResolvedValue({ data: { user: { id: 'guest', email: null } }, error: null });
  stub.cookieUser.mockResolvedValue({ data: { user: null }, error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('order payment route', () => {
  it('needs a session', async () => {
    expect((await readOrderPayment(request(undefined, ''), ORDER)).status).toBe(401);
    expect((await startOrderPayment(request({ method: 'card' }, ''), ORDER)).status).toBe(401);
    expect(stub.rpc).not.toHaveBeenCalled();
  });

  it('refuses a bad order id or method', async () => {
    expect((await readOrderPayment(request(), 'not-a-uuid')).status).toBe(404);
    expect((await startOrderPayment(request({ method: 'cash' }), ORDER)).status).toBe(422);
    expect(
      (await startOrderPayment(request({ method: 'mpesa_stk', phone: '12345' }), ORDER)).status,
    ).toBe(422);
  });

  it('takes the website session cookie when there is no bearer token', async () => {
    stub.cookieUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@example.test', user_metadata: {} } },
      error: null,
    });
    stub.bank.mockResolvedValue({
      ok: true,
      reference: 'NXP-9',
      authorization_url: 'https://bank.example/pay/1',
    });
    const response = await startOrderPayment(request({ method: 'bank_transfer' }, ''), ORDER);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'pending',
      reference: 'NXP-9',
      url: 'https://bank.example/pay/1',
    });
    expect(stub.bank).toHaveBeenCalledWith(expect.anything(), {
      orderId: ORDER,
      origin: 'https://www.nexgapp.com',
      email: 'a@example.test',
      name: null,
    });
  });

  it('says when the bank is not connected, keeping the reference', async () => {
    stub.bank.mockResolvedValue({
      ok: false,
      status: 503,
      message: 'Paying by bank is not available right now.',
    });
    const response = await startOrderPayment(request({ method: 'bank_transfer' }), ORDER);
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('PAYMENT_UNAVAILABLE');
  });

  it('sends M-Pesa straight to Safaricom while Paystack is not live', async () => {
    for (const [k, v] of Object.entries({
      DARAJA_CONSUMER_KEY: 'k',
      DARAJA_CONSUMER_SECRET: 's',
      DARAJA_SHORTCODE: '174379',
      DARAJA_PASSKEY: 'p',
      DARAJA_CALLBACK_SECRET: 'c',
    })) {
      vi.stubEnv(k, v);
    }
    answer({ rpc_payment_begin_order: { data: { reference: 'NXP-2', amount_cents: 99000 } } });
    stub.prompt.mockResolvedValue({ ok: true, message: 'Check your phone.' });
    const response = await startOrderPayment(
      request({ method: 'mpesa_stk', phone: '0712 345 678' }),
      ORDER,
    );
    expect(await response.json()).toEqual({
      status: 'pending',
      reference: 'NXP-2',
      retryAfterSeconds: 60,
    });
    expect(stub.prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: 'NXP-2',
        amountCents: 99000,
        phone: '254712345678',
        accountReference: 'NX260001',
      }),
    );
    expect(stub.rpc).not.toHaveBeenCalledWith('rpc_payment_paystack_attempt', expect.anything());
  });

  it('says payment is unavailable with no Paystack key, and charges nothing', async () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await startOrderPayment(request({ method: 'card' }), ORDER);
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('PAYMENT_UNAVAILABLE');
    expect(stub.rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('opens a card page under the attempt reference and returns its address', async () => {
    answer({
      rpc_order_payment_state: { data: { status: 'unpaid' } },
      rpc_payment_begin_order: { data: { reference: 'NXP-1', amount_cents: 150000 } },
      rpc_payment_paystack_attempt: {
        data: {
          attempt_reference: 'NXP-1-1',
          channel: 'card',
          amount_cents: 150000,
          is_test: true,
          reused: false,
        },
      },
      rpc_payment_paystack_opened: { data: { ok: true, outcome: 'opened' } },
    });
    const fetch = vi
      .fn()
      .mockResolvedValue(
        paystackOk({ authorization_url: 'https://checkout.paystack.com/abc', access_code: 'abc' }),
      );
    vi.stubGlobal('fetch', fetch);

    const response = await startOrderPayment(request({ method: 'card' }), ORDER);
    expect(await response.json()).toEqual({
      status: 'pending',
      reference: 'NXP-1',
      url: 'https://checkout.paystack.com/abc',
      test: true,
    });
    const sent = JSON.parse((fetch.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(sent).toMatchObject({
      reference: 'NXP-1-1',
      amount: 150000,
      email: 'nxp-1@receipts.nexgapp.com',
      callback_url: 'https://www.nexgapp.com/pay/NXP-1',
    });
    expect(stub.rpc).toHaveBeenCalledWith('rpc_payment_paystack_attempt', {
      p_payment_reference: 'NXP-1',
      p_channel: 'card',
      p_phone: null,
      p_proof: TEST,
      p_save_card: false,
      p_card_id: null,
    });
    expect(stub.rpc).toHaveBeenCalledWith(
      'rpc_payment_paystack_opened',
      expect.objectContaining({
        p_attempt_reference: 'NXP-1-1',
        p_authorization_url: 'https://checkout.paystack.com/abc',
        p_failure: null,
      }),
    );
  });

  it('sends an M-Pesa prompt and asks the app to wait before sending again', async () => {
    answer({
      rpc_order_payment_state: { data: { status: 'unpaid' } },
      rpc_payment_begin_order: { data: { reference: 'NXP-2', amount_cents: 99900 } },
      rpc_payment_paystack_attempt: {
        data: {
          attempt_reference: 'NXP-2-1',
          channel: 'mpesa',
          amount_cents: 99900,
          is_test: true,
          reused: false,
        },
      },
      rpc_payment_paystack_opened: { data: { ok: true } },
    });
    const fetch = vi.fn().mockResolvedValue(paystackOk({ status: 'pay_offline' }));
    vi.stubGlobal('fetch', fetch);

    const response = await startOrderPayment(
      request({ method: 'mpesa_stk', phone: '+254712345678' }),
      ORDER,
    );
    expect(await response.json()).toEqual({
      status: 'pending',
      reference: 'NXP-2',
      retryAfterSeconds: 180,
      test: true,
    });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.co/charge');
    expect(JSON.parse(init.body as string).mobile_money).toEqual({
      phone: '+254712345678',
      provider: 'mpesa',
    });
  });

  it('does not send a second prompt while one is in play', async () => {
    answer({
      rpc_order_payment_state: { data: { status: 'pending' } },
      rpc_payment_begin_order: { data: { reference: 'NXP-2', amount_cents: 99900 } },
      rpc_payment_paystack_attempt: {
        data: {
          attempt_reference: 'NXP-2-1',
          channel: 'mpesa',
          amount_cents: 99900,
          is_test: true,
          reused: true,
          retry_after_seconds: 120,
        },
      },
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await startOrderPayment(
      request({ method: 'mpesa_stk', phone: '+254712345678' }),
      ORDER,
    );
    expect(await response.json()).toMatchObject({ status: 'pending', retryAfterSeconds: 120 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records a Paystack refusal and tells the customer', async () => {
    answer({
      rpc_order_payment_state: { data: { status: 'unpaid' } },
      rpc_payment_begin_order: { data: { reference: 'NXP-3', amount_cents: 5000 } },
      rpc_payment_paystack_attempt: {
        data: {
          attempt_reference: 'NXP-3-1',
          channel: 'mpesa',
          amount_cents: 5000,
          is_test: true,
          reused: false,
        },
      },
      rpc_payment_paystack_opened: { data: { ok: true, outcome: 'failed' } },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: false, message: 'Invalid phone number' }), {
          status: 400,
        }),
      ),
    );
    const response = await startOrderPayment(
      request({ method: 'mpesa_stk', phone: '+254712345678' }),
      ORDER,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).title).toBe('Invalid phone number');
    expect(stub.rpc).toHaveBeenCalledWith(
      'rpc_payment_paystack_opened',
      expect.objectContaining({ p_failure: 'Invalid phone number' }),
    );
  });

  it('never starts a payment for an order already paid', async () => {
    answer({ rpc_order_payment_state: { data: { status: 'paid', reference: 'NXP-4' } } });
    const response = await startOrderPayment(request({ method: 'card' }), ORDER);
    expect(await response.json()).toEqual({ status: 'paid', reference: 'NXP-4' });
    expect(stub.rpc).toHaveBeenCalledTimes(1);
  });

  it('asks Paystack about a pending try and lets the database decide', async () => {
    const states = [
      {
        status: 'pending',
        reference: 'NXP-5',
        attempt_reference: 'NXP-5-1',
        channel: 'card',
        is_test: true,
        opened_seconds_ago: 40,
        checked_seconds_ago: null,
        authorization_url: 'https://checkout.paystack.com/p',
      },
      { status: 'paid', reference: 'NXP-5', is_test: true },
    ];
    stub.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'rpc_order_payment_state') return { data: states.shift(), error: null };
      if (fn === 'rpc_payment_paystack_verified')
        return { data: { ok: true, state: 'paid' }, error: null };
      throw new Error(fn);
    });
    const verifyBody = JSON.stringify({
      status: true,
      data: { reference: 'NXP-5-1', status: 'success' },
    });
    const fetch = vi.fn().mockResolvedValue(new Response(verifyBody));
    vi.stubGlobal('fetch', fetch);

    const response = await readOrderPayment(request(), ORDER);
    expect(await response.json()).toEqual({ status: 'paid', reference: 'NXP-5', test: true });
    expect((fetch.mock.calls[0] as [string])[0]).toBe(
      'https://api.paystack.co/transaction/verify/NXP-5-1',
    );
    expect(stub.rpc).toHaveBeenCalledWith('rpc_payment_paystack_verified', {
      p_attempt_reference: 'NXP-5-1',
      p_verify_body: verifyBody,
      p_proof: TEST,
    });
  });

  it('does not ask Paystack again within ten seconds', async () => {
    answer({
      rpc_order_payment_state: {
        data: {
          status: 'pending',
          reference: 'NXP-6',
          attempt_reference: 'NXP-6-1',
          channel: 'mpesa',
          is_test: true,
          opened_seconds_ago: 40,
          checked_seconds_ago: 3,
          retry_after_seconds: 140,
        },
      },
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await (await readOrderPayment(request(), ORDER)).json()).toEqual({
      status: 'pending',
      reference: 'NXP-6',
      retryAfterSeconds: 140,
      test: true,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('saved cards', () => {
  const CARD = '01a12345-168a-4456-8b79-0123456789aa';
  const savedAttempt = {
    attempt_reference: 'NXP-7-2',
    channel: 'saved_card',
    amount_cents: 120000,
    is_test: true,
    reused: false,
    authorization_code: 'AUTH_secret',
    email: 'owner@example.com',
  };

  it('asks to keep the card when the customer ticks Save', async () => {
    answer({
      rpc_order_payment_state: { data: { status: 'unpaid' } },
      rpc_payment_begin_order: { data: { reference: 'NXP-7', amount_cents: 120000 } },
      rpc_payment_paystack_attempt: {
        data: {
          attempt_reference: 'NXP-7-1',
          channel: 'card',
          amount_cents: 120000,
          is_test: true,
          reused: false,
        },
      },
      rpc_payment_paystack_opened: { data: { ok: true } },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          paystackOk({ authorization_url: 'https://checkout.paystack.com/s', access_code: 's' }),
        ),
    );
    await startOrderPayment(request({ method: 'card', saveCard: true }), ORDER);
    expect(stub.rpc).toHaveBeenCalledWith(
      'rpc_payment_paystack_attempt',
      expect.objectContaining({ p_channel: 'card', p_save_card: true, p_card_id: null }),
    );
  });

  it('charges a saved card with no page, checks with Paystack, and never returns the authorization', async () => {
    const states = [{ status: 'unpaid' }, { status: 'paid', reference: 'NXP-7', is_test: true }];
    stub.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'rpc_order_payment_state') return { data: states.shift(), error: null };
      if (fn === 'rpc_payment_begin_order')
        return { data: { reference: 'NXP-7', amount_cents: 120000 }, error: null };
      if (fn === 'rpc_payment_paystack_attempt') return { data: savedAttempt, error: null };
      return { data: { ok: true }, error: null };
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(paystackOk({ status: 'success', reference: 'NXP-7-2' }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: true, data: { reference: 'NXP-7-2', status: 'success' } }),
        ),
      );
    vi.stubGlobal('fetch', fetch);

    const response = await startOrderPayment(
      request({ method: 'saved_card', cardId: CARD }),
      ORDER,
    );
    const body = await response.json();
    expect(body).toEqual({ status: 'paid', reference: 'NXP-7', test: true });
    expect(JSON.stringify(body)).not.toContain('AUTH_secret');
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.co/transaction/charge_authorization');
    expect(JSON.parse(init.body as string)).toMatchObject({
      reference: 'NXP-7-2',
      amount: 120000,
      email: 'owner@example.com',
      authorization_code: 'AUTH_secret',
    });
    expect((fetch.mock.calls[1] as [string])[0]).toBe(
      'https://api.paystack.co/transaction/verify/NXP-7-2',
    );
    expect(stub.rpc).toHaveBeenCalledWith(
      'rpc_payment_paystack_attempt',
      expect.objectContaining({ p_channel: 'saved_card', p_card_id: CARD }),
    );
  });

  it('says the card was declined, and records it', async () => {
    answer({
      rpc_order_payment_state: { data: { status: 'unpaid' } },
      rpc_payment_begin_order: { data: { reference: 'NXP-8', amount_cents: 120000 } },
      rpc_payment_paystack_attempt: { data: { ...savedAttempt, attempt_reference: 'NXP-8-1' } },
      rpc_payment_paystack_opened: { data: { ok: true, outcome: 'failed' } },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ status: false, message: 'Declined' }), { status: 400 }),
        ),
    );
    const response = await startOrderPayment(
      request({ method: 'saved_card', cardId: CARD }),
      ORDER,
    );
    expect(response.status).toBe(409);
    expect(stub.rpc).toHaveBeenCalledWith(
      'rpc_payment_paystack_opened',
      expect.objectContaining({ p_attempt_reference: 'NXP-8-1', p_failure: 'Declined' }),
    );
  });
});

describe('review accounts', () => {
  it('pay with the test keys even once NexG is live', async () => {
    vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', 'sk_live_ci_only_0123456789');
    vi.stubEnv('NEXG_PAYSTACK_LIVE', '1');
    stub.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'rpc_payment_i_review') return { data: true, error: null };
      if (fn === 'rpc_order_payment_state') return { data: { status: 'unpaid' }, error: null };
      if (fn === 'rpc_payment_begin_order')
        return { data: { reference: 'NXP-R', amount_cents: 1000 }, error: null };
      if (fn === 'rpc_payment_paystack_attempt')
        return {
          data: {
            attempt_reference: 'NXP-R-1',
            channel: 'card',
            amount_cents: 1000,
            is_test: true,
            reused: false,
          },
          error: null,
        };
      return { data: { ok: true }, error: null };
    });
    const fetch = vi
      .fn()
      .mockResolvedValue(
        paystackOk({ authorization_url: 'https://checkout.paystack.com/r', access_code: 'r' }),
      );
    vi.stubGlobal('fetch', fetch);
    await startOrderPayment(request({ method: 'card' }), ORDER);
    expect(stub.rpc).toHaveBeenCalledWith(
      'rpc_payment_paystack_attempt',
      expect.objectContaining({ p_proof: TEST }),
    );
    expect(
      ((fetch.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>)
        .Authorization,
    ).toBe(`Bearer ${TEST}`);
  });
});
