import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { Client } from './order-payment';
import { sendRiderPayouts } from './rider-payouts';

const KEY = 'sk_test_ci_only_0123456789';

type Call = { fn: string; args: Record<string, unknown> };

function clientWith(answers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: Call[] = [];
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const answer = answers[fn];
      return Promise.resolve({ data: answer ? answer(args) : null, error: null });
    },
  } as unknown as Client;
  return { client, calls };
}

function paystackAnswers(...bodies: { status: number; body: unknown }[]) {
  const fetched: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      fetched.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const next = bodies.shift();
      if (!next) throw new Error('no more answers');
      return new Response(JSON.stringify(next.body), { status: next.status });
    }),
  );
  return fetched;
}

const item = {
  reference: 'NXT-abc12345',
  amount_cents: 87000,
  destination: '+254700012704',
  name: 'Test Rider',
  recipient_code: null,
  test: true,
};

beforeEach(() => {
  vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', KEY);
  vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', '');
  vi.stubEnv('NEXG_PAYSTACK_LIVE', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('riders paid automatically', () => {
  it('asks nothing without a Paystack key', async () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', '');
    const { client, calls } = clientWith({});
    expect(await sendRiderPayouts(client)).toMatchObject({ sent: 0, skipped: 'no Paystack key' });
    expect(calls).toHaveLength(0);
  });

  it('makes the recipient once, sends what the database says, and records both answers', async () => {
    const { client, calls } = clientWith({
      rpc_rider_payouts_due: () => ({ ok: true, items: [item], held: 0, rolled: 1 }),
      rpc_paystack_transfer_answered_worker: (args) =>
        args.p_step === 'recipient'
          ? { ok: true, recipient_code: 'RCP_ci127' }
          : { ok: true, state: 'pending' },
    });
    const fetched = paystackAnswers(
      { status: 200, body: { status: true, data: { recipient_code: 'RCP_ci127' } } },
      { status: 200, body: { status: true, data: { status: 'pending', transfer_code: 'TRF_1' } } },
    );

    expect(await sendRiderPayouts(client)).toEqual({ sent: 1, checked: 0, held: 0, rolled: 1 });
    expect(calls[0]).toEqual({ fn: 'rpc_rider_payouts_due', args: { p_proof: KEY, p_limit: 8 } });
    expect(fetched[0]!.url).toContain('/transferrecipient');
    expect(fetched[0]!.body).toMatchObject({ account_number: '0700012704', bank_code: 'MPESA' });
    expect(fetched[1]!.url).toContain('/transfer');
    expect(fetched[1]!.body).toMatchObject({
      amount: 87000,
      recipient: 'RCP_ci127',
      reference: 'NXT-abc12345',
      currency: 'KES',
    });
    expect(calls.slice(1).map((c) => [c.args.p_step, c.args.p_refused])).toEqual([
      ['recipient', false],
      ['transfer', false],
    ]);
  });

  it('checks with Paystack before sending again a payout a sweep left half way', async () => {
    const { client, calls } = clientWith({
      rpc_rider_payouts_due: () => ({
        ok: true,
        items: [{ ...item, recipient_code: 'RCP_ci127', resume: true, state: 'opened' }],
      }),
      rpc_paystack_transfer_answered_worker: (args) =>
        args.p_step === 'verify'
          ? { ok: true, state: 'opened', send: true }
          : { ok: true, state: 'pending' },
    });
    const fetched = paystackAnswers(
      { status: 404, body: { status: false, message: 'Transfer not found' } },
      { status: 200, body: { status: true, data: { status: 'pending', transfer_code: 'TRF_1' } } },
    );

    expect((await sendRiderPayouts(client)).sent).toBe(1);
    expect(fetched[0]!.url).toContain('/transfer/verify/NXT-abc12345');
    expect(calls.slice(1).map((c) => [c.args.p_step, c.args.p_refused])).toEqual([
      ['verify', true],
      ['transfer', false],
    ]);
  });

  it('records nothing when Paystack does not answer, so the next sweep checks first', async () => {
    const { client, calls } = clientWith({
      rpc_rider_payouts_due: () => ({
        ok: true,
        items: [{ ...item, recipient_code: 'RCP_ci127' }],
      }),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
      }),
    );
    expect((await sendRiderPayouts(client)).sent).toBe(0);
    expect(calls.map((c) => c.fn)).toEqual(['rpc_rider_payouts_due']);
  });

  it('sends nothing while the database pauses payouts', async () => {
    const { client, calls } = clientWith({
      rpc_rider_payouts_due: () => ({ ok: true, paused: 'otp', items: [] }),
    });
    expect(await sendRiderPayouts(client)).toMatchObject({ sent: 0, skipped: 'otp' });
    expect(calls).toHaveLength(1);
  });
});
