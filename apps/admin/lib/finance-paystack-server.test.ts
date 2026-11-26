import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { paystackMoney } from './finance-paystack-server';
import { createMpesaRecipient, refund, transfer } from './paystack';

const KEY = 'sk_test_ci_only_0123456789';
const PERIOD = { from: '2026-11-01', to: '2026-11-26' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const settlement = (id: number) => ({
  id,
  status: 'success',
  currency: 'KES',
  effective_amount: 1000,
  total_fees: 15,
  settlement_date: '2026-11-09T00:00:00.000Z',
});

const balance = vi.fn();
const settlements = vi.fn();
const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
  const url = String(input);
  return url === 'https://api.paystack.co/balance' ? balance(url, init) : settlements(url, init);
});

beforeEach(() => {
  vi.resetAllMocks();
  fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    return url === 'https://api.paystack.co/balance' ? balance(url, init) : settlements(url, init);
  });
  balance.mockImplementation(async () =>
    json({ status: true, data: [{ currency: 'KES', balance: 250000 }] }),
  );
  settlements.mockImplementation(async () =>
    json({ status: true, data: [settlement(1)], meta: { pageCount: 1 } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('PAYSTACK_KEYS_TOKEN', '');
  vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', KEY);
  vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', '');
  vi.stubEnv('NEXG_PAYSTACK_LIVE', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('NexG’s money at Paystack', () => {
  it('reads the balance and the settlements to NexG’s own account for the Nairobi days', async () => {
    const money = await paystackMoney(PERIOD);

    expect(money.mode).toBe('test');
    expect(money.balance).toEqual({ ok: true, cents: 250000 });
    expect(money.settlements).toMatchObject({ ok: true, more: false, rows: [{ id: '1' }] });
    expect(Number.isNaN(Date.parse(money.fetched_at))).toBe(false);
    const url = new URL(settlements.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/settlement');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      perPage: '50',
      page: '1',
      subaccount: 'none',
      from: '2026-10-31T21:00:00.000Z',
      to: '2026-11-26T20:59:59.999Z',
    });
    for (const [, init] of fetchMock.mock.calls) {
      expect(init!.method).toBe('GET');
      expect(new Headers(init!.headers).get('authorization')).toBe(`Bearer ${KEY}`);
    }
  });

  it('reads live figures only once NexG is live on Paystack', async () => {
    vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', 'sk_live_ci_only_0123456789');
    expect((await paystackMoney(PERIOD)).mode).toBe('test');
    vi.stubEnv('NEXG_PAYSTACK_LIVE', '1');
    expect((await paystackMoney(PERIOD)).mode).toBe('live');
  });

  it('says unavailable, without the word refund, when Paystack cannot be reached', async () => {
    balance.mockRejectedValue(new Error('offline'));
    settlements.mockRejectedValue(new Error('offline'));

    const money = await paystackMoney(PERIOD);

    expect(money.balance).toEqual({ ok: false, message: 'We could not reach Paystack.' });
    expect(money.settlements).toEqual({ ok: false, message: 'We could not reach Paystack.' });
  });

  it('keeps one answer when the other fails', async () => {
    balance.mockImplementation(async () => json({ status: false, message: 'Invalid key' }, 401));

    const money = await paystackMoney(PERIOD);

    expect(money.balance).toEqual({ ok: false, message: 'Invalid key' });
    expect(money.settlements.ok).toBe(true);
  });

  it('follows the pages, and shows none of them if one fails', async () => {
    settlements
      .mockResolvedValueOnce(json({ status: true, data: [settlement(1)], meta: { pageCount: 2 } }))
      .mockResolvedValueOnce(json({ status: true, data: [settlement(2)], meta: { pageCount: 2 } }));
    const both = await paystackMoney(PERIOD);
    expect(both.settlements).toMatchObject({ ok: true, more: false });
    expect(both.settlements.ok && both.settlements.rows.map((r) => r.id)).toEqual(['1', '2']);

    settlements
      .mockResolvedValueOnce(json({ status: true, data: [settlement(1)], meta: { pageCount: 2 } }))
      .mockResolvedValueOnce(json({ status: false, message: 'Try later' }, 500));
    expect((await paystackMoney(PERIOD)).settlements).toEqual({
      ok: false,
      message: 'Try later',
    });
  });

  it('stops at four pages and says there are more', async () => {
    settlements.mockImplementation(async () =>
      json({ status: true, data: [settlement(1)], meta: { pageCount: 9 } }),
    );
    const money = await paystackMoney(PERIOD);
    expect(settlements).toHaveBeenCalledTimes(4);
    expect(money.settlements).toMatchObject({ ok: true, more: true });
  });

  it('says a refund is not sent only for a refund', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('offline');
    });
    const input = { reference: 'NXR-ci-only-0001', amountCents: 100 };

    await expect(refund('test', { ...input, transaction: '1', note: 'n' })).resolves.toMatchObject({
      message: 'We could not reach Paystack. The refund is not sent yet.',
    });
    const neutral = 'We could not reach Paystack. Nothing is recorded as sent.';
    await expect(
      createMpesaRecipient('test', { name: 'Fixture', phone: '+254700000000' }),
    ).resolves.toMatchObject({ message: neutral });
    await expect(
      transfer('test', { ...input, recipient: 'RCP_ci', reason: 'n' }),
    ).resolves.toMatchObject({ message: neutral });
  });

  it('asks Paystack nothing without a key', async () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', '');
    const money = await paystackMoney(PERIOD);
    expect(money.mode).toBeNull();
    expect(money.balance).toEqual({
      ok: false,
      message: 'Paystack is not connected on the console.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
