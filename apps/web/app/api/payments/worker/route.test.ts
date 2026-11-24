import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Daraja from '@/lib/daraja';

const { settleDuePrompts, sendQueuedPayouts, registerPaybillUrls, rpc } = vi.hoisted(() => ({
  settleDuePrompts: vi.fn(),
  sendQueuedPayouts: vi.fn(),
  registerPaybillUrls: vi.fn(),
  rpc: vi.fn(),
}));

const { sweepPaystack, settleBookings, sendRiderPayouts } = vi.hoisted(() => ({
  sweepPaystack: vi.fn(),
  settleBookings: vi.fn(),
  sendRiderPayouts: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/order-payment', () => ({ sweepPaystack }));
vi.mock('@/lib/booking-payment', () => ({ settleBookings }));
vi.mock('@/lib/rider-payouts', () => ({ sendRiderPayouts }));
vi.mock('@/lib/mpesa-prompt', () => ({ settleDuePrompts }));
vi.mock('@/lib/mpesa-payout', () => ({ sendQueuedPayouts }));
vi.mock('@/lib/supabase/public', () => ({ createPublicClient: () => ({ rpc }) }));
vi.mock('@/lib/daraja', async (importOriginal) => ({
  ...(await importOriginal<typeof Daraja>()),
  registerPaybillUrls,
}));

import { POST } from './route';

const TOKEN = 'ci-worker-token';

function work(body: unknown, token: string | null = TOKEN) {
  return POST(
    new Request('https://www.nexgapp.com/api/payments/worker', {
      method: 'POST',
      headers: token === null ? {} : { 'x-payments-secret': token },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.stubEnv('DARAJA_CALLBACK_SECRET', TOKEN);
  settleDuePrompts
    .mockReset()
    .mockResolvedValue({ asked: 1, recorded: 1, stillOpen: 0, errors: [] });
  sendQueuedPayouts
    .mockReset()
    .mockResolvedValue({ claimed: 0, accepted: 0, refused: 0, unknown: 0, errors: [] });
  registerPaybillUrls.mockReset().mockResolvedValue({ ok: true, message: 'Success' });
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
});

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/payments/worker', () => {
  it('refuses a caller without the token', async () => {
    expect((await work({}, null)).status).toBe(401);
    expect((await work({}, 'guess')).status).toBe(401);
    expect(settleDuePrompts).not.toHaveBeenCalled();
    expect(sendQueuedPayouts).not.toHaveBeenCalled();
  });

  it('asks M-Pesa about due prompts and sends queued payouts', async () => {
    const res = await work(undefined);
    expect(res.status).toBe(200);
    expect(settleDuePrompts).toHaveBeenCalledWith({ reference: undefined });
    expect(sendQueuedPayouts).toHaveBeenCalledWith('https://www.nexgapp.com');
  });

  it('asks about one payment only when staff press "Check with M-Pesa"', async () => {
    await work({ reference: 'NXP-261106-ABCDEF1234' });
    expect(settleDuePrompts).toHaveBeenCalledWith({ reference: 'NXP-261106-ABCDEF1234' });
    expect(sendQueuedPayouts).not.toHaveBeenCalled();
  });

  it('registers the Paybill addresses on this site and records the answer', async () => {
    const res = await work({ action: 'register_paybill' });
    expect(await res.json()).toEqual({ ok: true, message: 'Success' });
    expect(registerPaybillUrls).toHaveBeenCalledWith({
      confirmationUrl: `https://www.nexgapp.com/api/payments/daraja/paybill/confirm?token=${TOKEN}`,
      validationUrl: `https://www.nexgapp.com/api/payments/daraja/paybill/validate?token=${TOKEN}`,
    });
    expect(rpc).toHaveBeenCalledWith('rpc_payment_mpesa_paybill_registered', {
      p_callback_secret: TOKEN,
      p_ok: true,
      p_message: 'Success',
    });
  });

  it('runs the Paystack sweep for a call signed with a Paystack key, Daraja or not', async () => {
    const crypto = await import('node:crypto');
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', 'sk_test_ci_only_0123456789');
    vi.stubEnv('DARAJA_CALLBACK_SECRET', '');
    sweepPaystack.mockReset().mockResolvedValue({ checked: 2 });
    settleBookings.mockReset().mockResolvedValue({ settled: 1, refused: 0 });
    sendRiderPayouts.mockReset().mockResolvedValue({ sent: 1, checked: 0 });
    const signed = crypto
      .createHmac('sha256', 'sk_test_ci_only_0123456789')
      .update(`paystack-sweep:${Math.floor(Date.now() / 60_000)}`)
      .digest('hex');
    const sweep = (header: string) =>
      POST(
        new Request('https://www.nexgapp.com/api/payments/worker', {
          method: 'POST',
          headers: { 'x-paystack-worker': header },
          body: JSON.stringify({ action: 'paystack_sweep' }),
        }),
      );

    expect((await sweep('ab'.repeat(32))).status).toBe(401);
    expect(sweepPaystack).not.toHaveBeenCalled();
    const res = await sweep(signed);
    expect(await res.json()).toEqual({
      ok: true,
      paystack: { checked: 2 },
      bookings: { settled: 1, refused: 0 },
      riders: { sent: 1, checked: 0 },
    });
    expect(settleDuePrompts).not.toHaveBeenCalled();
  });
});
