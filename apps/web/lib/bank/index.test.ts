import { describe, expect, it, vi } from 'vitest';

import {
  bankCheckoutEnabled,
  bankConfig,
  bankProvider,
  signBankPayload,
  verifyBankSignature,
} from './index';

const env = {
  BANK_PROVIDER: 'sandbox',
  BANK_API_URL: 'http://127.0.0.1:4010/',
  BANK_API_KEY: 'k'.repeat(30),
  BANK_WEBHOOK_SECRET: 's'.repeat(40),
};

describe('bank configuration', () => {
  it('is off until every setting is there', () => {
    expect(bankCheckoutEnabled({})).toBe(false);
    expect(bankCheckoutEnabled({ ...env, BANK_API_KEY: 'short' })).toBe(false);
    expect(bankCheckoutEnabled({ ...env, BANK_WEBHOOK_SECRET: 'short' })).toBe(false);
    expect(bankCheckoutEnabled({ ...env, BANK_PROVIDER: 'some-bank' })).toBe(false);
    expect(bankCheckoutEnabled(env)).toBe(true);
  });

  it('never runs the sandbox on the production deployment', () => {
    expect(bankConfig({ ...env, VERCEL_ENV: 'production' })).toEqual({
      error: 'The sandbox bank is not available on the production site.',
    });
    expect(bankCheckoutEnabled({ ...env, VERCEL_ENV: 'preview' })).toBe(true);
  });
});

describe('bank signatures', () => {
  const secret = 'x'.repeat(40);
  const body = '{"id":"evt_1"}';

  it('accepts its own signature and refuses tampering', () => {
    const header = signBankPayload(body, secret);
    expect(verifyBankSignature(body, header, secret)).toBe(true);
    expect(verifyBankSignature(body + ' ', header, secret)).toBe(false);
    expect(verifyBankSignature(body, header, 'y'.repeat(40))).toBe(false);
    expect(verifyBankSignature(body, null, secret)).toBe(false);
    expect(verifyBankSignature(body, 'v1=abc', secret)).toBe(false);
  });

  it('refuses an event more than five minutes old', () => {
    const now = Date.parse('2026-11-10T12:00:00Z');
    const header = signBankPayload(body, secret, now - 6 * 60_000);
    expect(verifyBankSignature(body, header, secret, now)).toBe(false);
    expect(
      verifyBankSignature(body, signBankPayload(body, secret, now - 60_000), secret, now),
    ).toBe(true);
  });
});

describe('sandbox adapter', () => {
  it('opens a collection with the payment reference as the idempotency key', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { id: 'col_1', status: 'pending', checkout_url: 'http://127.0.0.1:4010/checkout/col_1' },
        { status: 201 },
      ),
    );
    const provider = bankProvider(env, fetchImpl as unknown as typeof fetch)!;
    const opened = await provider.openCollection({
      reference: 'NX-P-1',
      amountCents: 250000,
      currency: 'KES',
      description: 'NexG order A1',
      customer: { email: 'guest@example.com' },
      callbackUrl: 'https://nexg.test/api/payments/bank/webhook',
      returnUrl: 'https://nexg.test/pay/NX-P-1',
    });
    expect(opened).toMatchObject({ ok: true, data: { id: 'col_1', status: 'pending' } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:4010/v1/collections');
    const headers = init.headers as Record<string, string>;
    expect(headers['idempotency-key']).toBe('NX-P-1');
    expect(headers.authorization).toBe(`Bearer ${env.BANK_API_KEY}`);
    expect(JSON.parse(init.body as string)).toMatchObject({
      merchant_reference: 'NX-P-1',
      amount: 250000,
    });
  });

  it('passes on the bank refusal message', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { error: { code: 'unsupported_currency', message: 'Only KES is supported.' } },
        { status: 422 },
      ),
    );
    const provider = bankProvider(env, fetchImpl as unknown as typeof fetch)!;
    const opened = await provider.openCollection({
      reference: 'NX-P-2',
      amountCents: 100,
      currency: 'USD',
      description: 'x',
      customer: {},
      callbackUrl: 'https://nexg.test/a',
      returnUrl: 'https://nexg.test/b',
    });
    expect(opened).toEqual({ ok: false, message: 'Only KES is supported.' });
  });

  it('only trusts a latest-event answer the bank signed', async () => {
    const body = JSON.stringify({ id: 'snap_col_1_succeeded', data: { status: 'succeeded' } });
    const good = vi.fn(
      async () =>
        new Response(body, {
          headers: { 'x-bank-signature': signBankPayload(body, env.BANK_WEBHOOK_SECRET) },
        }),
    );
    const signed = await bankProvider(env, good as unknown as typeof fetch)!.latestEvent('col_1');
    expect(signed).toMatchObject({ ok: true, data: { status: 'succeeded' } });

    const forged = vi.fn(
      async () =>
        new Response(body, {
          headers: { 'x-bank-signature': signBankPayload(body, 'z'.repeat(40)) },
        }),
    );
    const refused = await bankProvider(env, forged as unknown as typeof fetch)!.latestEvent(
      'col_1',
    );
    expect(refused.ok).toBe(false);
  });

  it('says so when the bank cannot be reached', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const provider = bankProvider(env, down as unknown as typeof fetch)!;
    expect((await provider.latestEvent('col_1')).ok).toBe(false);
  });
});
