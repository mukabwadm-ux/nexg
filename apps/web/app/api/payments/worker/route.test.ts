import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Daraja from '@/lib/daraja';

const { settleDuePrompts, sendQueuedPayouts, registerPaybillUrls, rpc } = vi.hoisted(() => ({
  settleDuePrompts: vi.fn(),
  sendQueuedPayouts: vi.fn(),
  registerPaybillUrls: vi.fn(),
  rpc: vi.fn(),
}));

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
});
