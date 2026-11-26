import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Every path to a Paystack key, on a server that has just started with
 * PAYSTACK_KEYS_TOKEN set: each loads the keys itself, and does nothing with
 * Paystack when they cannot be fetched, whatever the environment holds.
 */

const stub = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/customer-api', () => ({
  customerApiClient: () => ({ auth: { getUser: stub.getUser }, rpc: stub.rpc }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/mpesa-prompt', () => ({ sendMpesaPrompt: vi.fn() }));
vi.mock('@/lib/bank/payments', () => ({ startBankPayment: vi.fn() }));
vi.mock('@/lib/booking/platform', () => ({ settleEngineBookingPayment: vi.fn() }));
vi.mock('@/lib/booking/bridge', () => ({ forwardBookingRequest: vi.fn() }));
vi.mock('@/components/cart/checkout-form', () => ({ CheckoutForm: () => null }));
vi.mock('@/components/site-header', () => ({ SiteHeader: () => null }));

const ENV_KEY = 'sk_test_ci_only_env_0123456789';
const KEY = 'sk_test_ci_only_vault_0123456789';
const LIVE = 'sk_live_ci_only_vault_0123456789';
const ID = '01a12345-168a-4456-8b79-012345678910';
const REF = 'NXR-0123456789abcdef0123456789abcdef';

/* The database's key function and Paystack's API, behind one fetch. */
const database = vi.fn();
const paystack = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function keysAnswer() {
  database.mockImplementation(async () => json({ test: KEY, live: null }));
}
function keysRefused() {
  database.mockImplementation(async () => json({ code: '42501' }, 401));
}

const client = () => ({ rpc: stub.rpc }) as never;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  keysAnswer();
  paystack.mockImplementation(async () => json({ status: true, data: { status: 'pending' } }));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', (input: unknown, init?: RequestInit) =>
    String(input).startsWith('https://api.paystack.co/')
      ? paystack(input, init)
      : database(input, init),
  );
  stub.rpc.mockResolvedValue({ data: null, error: null });
  stub.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: null } }, error: null });
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'ci-anon-key');
  vi.stubEnv('PAYSTACK_KEYS_TOKEN', 'ci-only-server-token-0123456789abcdef');
  vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', ENV_KEY);
  vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', 'sk_live_ci_only_env_0123456789');
  vi.stubEnv('NEXG_PAYSTACK_LIVE', '');
  vi.stubEnv('DARAJA_CONSUMER_KEY', '');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const bearer = () => expect(new Headers(paystack.mock.calls[0]![1].headers).get('authorization'));

describe('the payments worker steps', () => {
  const steps = [
    [
      'sweepPaystack',
      'rpc_payment_paystack_due',
      async () => (await import('@/lib/order-payment')).sweepPaystack(client()),
      { checked: 0, skipped: 'no Paystack key' },
    ],
    [
      'settleBookings',
      'rpc_payment_engine_due',
      async () => (await import('@/lib/booking-payment')).settleBookings(client()),
      { settled: 0, refused: 0 },
    ],
    [
      'sendRiderPayouts',
      'rpc_rider_payouts_due',
      async () => (await import('@/lib/rider-payouts')).sendRiderPayouts(client()),
      { sent: 0, checked: 0, skipped: 'no Paystack key' },
    ],
  ] as const;

  it.each(steps)('%s proves itself with the saved key', async (_name, fn, run) => {
    await run();
    expect(stub.rpc).toHaveBeenCalledWith(fn, expect.objectContaining({ p_proof: KEY }));
  });

  it.each(steps)('%s does nothing without the keys', async (_name, _fn, run, nothing) => {
    keysRefused();
    expect(await run()).toEqual(nothing);
    expect(stub.rpc).not.toHaveBeenCalled();
    expect(paystack).not.toHaveBeenCalled();
  });
});

describe('checking an attempt', () => {
  const check = async () =>
    (await import('@/lib/order-payment')).checkWithPaystack(client(), 'NXP-1-1', 'test');

  it('asks Paystack with the saved key', async () => {
    await check();
    bearer().toBe(`Bearer ${KEY}`);
    expect(stub.rpc).toHaveBeenCalledWith(
      'rpc_payment_paystack_verified',
      expect.objectContaining({ p_proof: KEY }),
    );
  });

  it('asks nobody without the keys', async () => {
    keysRefused();
    await check();
    expect(paystack).not.toHaveBeenCalled();
    expect(stub.rpc).not.toHaveBeenCalled();
  });
});

describe('what a customer can pay with', () => {
  const methods = async () => {
    const { GET } = await import('@/app/api/customer/checkout/payment-methods/route');
    const body = (await (await GET()).json()) as { methods: { method: string }[] };
    return body.methods.map((m) => m.method);
  };
  const mode = async () => (await import('@/lib/order-payment')).customerMode(client());

  /* The checkout page's own answer, read off the form it renders. */
  async function mpesaReady() {
    const { default: CheckoutPage, dynamic } = await import('@/app/(customer)/checkout/page');
    expect(dynamic).toBe('force-dynamic');
    const find = (node: ReactNode): boolean | undefined => {
      if (Array.isArray(node)) return node.map(find).find((v) => v !== undefined);
      if (!isValidElement(node)) return undefined;
      const props = (node as ReactElement<{ mpesaReady?: boolean; children?: ReactNode }>).props;
      return props.mpesaReady ?? find(props.children);
    };
    return find(await CheckoutPage());
  }

  it('the payment methods list loads the keys', async () => {
    expect(await methods()).toEqual(['mpesa_stk', 'airtel_money', 'card', 'saved_card']);
  });

  it('the checkout page loads the keys', async () => {
    expect(await mpesaReady()).toBe(true);
  });

  it('a saved-card request loads the keys', async () => {
    expect(await mode()).toBe('test');
  });

  it('offers nothing of Paystack without the keys', async () => {
    keysRefused();
    expect(await methods()).toEqual([]);
    expect(await mpesaReady()).toBe(false);
    expect(await mode()).toBeNull();
  });

  const quote = async () => {
    const input = {
      propertyId: ID,
      unitId: ID,
      checkIn: '2030-01-04',
      checkOut: '2030-01-06',
      adults: 1,
      children: 0,
    };
    stub.rpc.mockResolvedValue({
      error: null,
      data: {
        ...input,
        quoteId: ID,
        expiresAt: '2030-01-01T09:10:00.000Z',
        nights: 2,
        currency: 'KES',
        nightlyMinor: 700000,
        roomSubtotalMinor: 1400000,
        taxesMinor: 0,
        totalMinor: 1400000,
      },
    });
    const { stayQuote } = await import('@/lib/booking/native-stay-checkout');
    const response = await stayQuote(
      new Request('https://www.nexgapp.com/api/customer/checkout/stays/quote', {
        method: 'POST',
        headers: { Authorization: 'Bearer access.token' },
        body: JSON.stringify(input),
      }),
    );
    return response.json();
  };

  it('a stay quote loads the keys', async () => {
    expect(await quote()).toMatchObject({
      paymentMethods: ['mpesa_stk'],
      paystackMethods: ['mpesa_stk', 'airtel_money', 'card'],
    });
  });

  it('a stay quote offers none without them', async () => {
    keysRefused();
    expect(await quote()).toMatchObject({ paymentMethods: [], paystackMethods: [] });
  });

  const pay = async () => {
    stub.rpc.mockImplementation(async (fn: string) => ({
      error: null,
      data:
        fn === 'rpc_order_payment_state'
          ? { status: 'unpaid' }
          : fn === 'rpc_payment_begin_order'
            ? { reference: 'NXP-1', amount_cents: 150000 }
            : fn === 'rpc_payment_paystack_attempt'
              ? { attempt_reference: 'NXP-1-1', amount_cents: 150000, is_test: true }
              : { ok: true },
    }));
    paystack.mockImplementation(async () =>
      json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/x' } }),
    );
    const { startOrderPayment } = await import('@/lib/order-payment');
    return startOrderPayment(
      new Request(`https://www.nexgapp.com/api/customer/checkout/orders/${ID}/payment`, {
        method: 'POST',
        headers: { Authorization: 'Bearer access.token' },
        body: JSON.stringify({ method: 'card' }),
      }),
      ID,
    );
  };

  it('paying an order loads the keys and charges with the saved one', async () => {
    expect((await pay()).status).toBe(200);
    bearer().toBe(`Bearer ${KEY}`);
  });

  it('paying an order is unavailable without the keys, and charges nothing', async () => {
    keysRefused();
    const response = await pay();
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('PAYMENT_UNAVAILABLE');
    expect(paystack).not.toHaveBeenCalled();
    expect(stub.rpc).not.toHaveBeenCalled();
  });
});

describe('a cinema refund', () => {
  const refund = async (mode: 'test' | 'live') => {
    const db = vi.fn(async (fn: string) => ({
      error: null,
      data:
        fn === 'fn_cinema_refund_open'
          ? {
              reference: REF,
              amount_cents: 130000,
              mode,
              paystack_transaction: '4099260516',
              state: 'opened',
            }
          : { ok: true },
    }));
    const { refundCinemaHold } = await import('@/lib/cinema/refund');
    return refundCinemaHold(db, ID, 'confirm_refused');
  };

  it('is sent with the saved key', async () => {
    expect(await refund('test')).toMatchObject({ outcome: 'sent' });
    bearer().toBe(`Bearer ${KEY}`);
  });

  it('is sent live only with the saved live key and the switch on', async () => {
    database.mockImplementation(async () => json({ test: KEY, live: LIVE }));
    vi.stubEnv('NEXG_PAYSTACK_LIVE', '1');
    expect(await refund('live')).toMatchObject({ outcome: 'sent' });
    bearer().toBe(`Bearer ${LIVE}`);
  });

  it('is not sent without the keys', async () => {
    keysRefused();
    vi.stubEnv('NEXG_PAYSTACK_LIVE', '1');
    expect(await refund('live')).toMatchObject({ outcome: 'needs_person' });
    await expect(refund('test')).rejects.toThrow(/not set up/);
    expect(paystack).not.toHaveBeenCalled();
  });
});
