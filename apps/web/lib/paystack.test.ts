import crypto from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  openCheckout,
  payerEmail,
  paystackMode,
  refund,
  sendPrompt,
  signatureMode,
  sweepSignatureValid,
} from './paystack';

const TEST = 'sk_test_ci_only_0123456789';
const LIVE = 'sk_live_ci_only_0123456789';
const sign = (body: string, key: string) =>
  crypto.createHmac('sha512', key).update(body).digest('hex');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('paystack mode', () => {
  it('is off with no key, test with the test key, live only when switched on', () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', '');
    vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', '');
    expect(paystackMode()).toBeNull();
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', TEST);
    expect(paystackMode()).toBe('test');
    vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', LIVE);
    expect(paystackMode()).toBe('test');
    vi.stubEnv('NEXG_PAYSTACK_LIVE', '1');
    expect(paystackMode()).toBe('live');
  });

  it('refuses a key in the wrong slot', () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', LIVE);
    vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', TEST);
    vi.stubEnv('NEXG_PAYSTACK_LIVE', '1');
    expect(paystackMode()).toBeNull();
  });
});

describe('webhook signatures', () => {
  it('says which key signed the raw body, and nothing for a changed body', () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', TEST);
    vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', LIVE);
    const body = '{"event":"charge.success","data":{"reference":"NXP-1-1"}}';
    expect(signatureMode(body, sign(body, TEST))).toBe('test');
    expect(signatureMode(body, sign(body, LIVE))).toBe('live');
    expect(signatureMode(`${body} `, sign(body, TEST))).toBeNull();
    expect(signatureMode(body, 'not-hex')).toBeNull();
    expect(signatureMode(body, null)).toBeNull();
  });

  it('accepts the database sweep for this minute and the last, not older', () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', TEST);
    const now = Date.UTC(2026, 10, 21, 12, 0, 30);
    const minute = Math.floor(now / 60_000);
    const token = (m: number) =>
      crypto.createHmac('sha256', TEST).update(`paystack-sweep:${m}`).digest('hex');
    expect(sweepSignatureValid(token(minute), now)).toBe(true);
    expect(sweepSignatureValid(token(minute - 1), now)).toBe(true);
    expect(sweepSignatureValid(token(minute - 2), now)).toBe(false);
    expect(sweepSignatureValid(null, now)).toBe(false);
  });
});

describe('payer email', () => {
  it('uses the account email, or a receipt address for a guest', () => {
    expect(payerEmail('ann@example.com', 'NXP-261121-AB12')).toBe('ann@example.com');
    expect(payerEmail(null, 'NXP-261121-AB12')).toBe('nxp-261121-ab12@receipts.nexgapp.com');
  });
});

describe('paystack calls', () => {
  it('opens a card-only checkout under our reference, in cents', async () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', TEST);
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          data: { authorization_url: 'https://checkout.paystack.com/x', access_code: 'x' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await openCheckout('test', {
      reference: 'NXP-1-1',
      amountCents: 150000,
      email: 'ann@example.com',
      callbackUrl: 'https://www.nexgapp.com/pay/NXP-1',
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.co/transaction/initialize');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TEST}`);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      reference: 'NXP-1-1',
      amount: 150000,
      currency: 'KES',
      channels: ['card'],
    });
    expect(JSON.parse(body.metadata).cancel_action).toBe('https://www.nexgapp.com/pay/NXP-1');
  });

  it('sends an M-Pesa prompt, and reports a refusal as refused', async () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', TEST);
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: false, message: 'Invalid phone' }), { status: 400 }),
      );
    vi.stubGlobal('fetch', fetch);
    const result = await sendPrompt('test', {
      reference: 'NXP-1-2',
      amountCents: 150000,
      email: 'ann@example.com',
      phone: '+254712345678',
      provider: 'mpesa',
    });
    expect(result).toMatchObject({ ok: false, refused: true, message: 'Invalid phone' });
    const body = JSON.parse((fetch.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.mobile_money).toEqual({ phone: '+254712345678', provider: 'mpesa' });
    expect(body).not.toHaveProperty('subaccount');
  });

  it('splits a payment to the merchant sub-account the database names, NexG bearing the fee', async () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', TEST);
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: true, data: { status: 'pay_offline' } })),
      );
    vi.stubGlobal('fetch', fetch);
    await sendPrompt('test', {
      reference: 'NXP-1-3',
      amountCents: 150000,
      email: 'ann@example.com',
      phone: '+254712345678',
      provider: 'mpesa',
      split: { subaccount: 'ACCT_ci0001', transaction_charge: 68000, bearer: 'account' },
    });
    const body = JSON.parse((fetch.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({
      amount: 150000,
      subaccount: 'ACCT_ci0001',
      transaction_charge: 68000,
      bearer: 'account',
    });
  });

  it('charges nothing without a key', async () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(
      (
        await openCheckout('test', {
          reference: 'NXP-1-1',
          amountCents: 1,
          email: 'a@b.co',
          callbackUrl: 'https://x.test',
        })
      ).ok,
    ).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refunds a transaction by its id, in cents, under our reference', async () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', TEST);
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: true, data: { status: 'pending', id: 7 } })),
      );
    vi.stubGlobal('fetch', fetch);
    const answer = await refund('test', {
      transaction: '4099260516',
      amountCents: 65000,
      reference: 'NXR-0123456789abcdef',
      note: 'NexG refund NXR-0123456789abcdef',
    });
    expect(answer.ok).toBe(true);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.paystack.co/refund');
    expect(JSON.parse(init.body as string)).toEqual({
      transaction: '4099260516',
      amount: 65000,
      reference: 'NXR-0123456789abcdef',
      merchant_note: 'NexG refund NXR-0123456789abcdef',
    });
  });
});
