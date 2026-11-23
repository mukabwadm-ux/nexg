import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/staff', () => ({
  requireStaff: async () => ({ displayName: 'Fixture finance' }),
  requireModule: () => ({ level: 'full' }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => db }));

import { payEarlyThroughPaystack } from './paystack-transfers';

const REQUEST = '5b0d8a52-1f3c-4b8e-9c1a-2d3e4f5a6b7c';
const opened = {
  reference: 'NXT-abc12345',
  sent: false,
  state: 'opened',
  amount_cents: 50000,
  destination: '+254712345678',
  name: 'Test Rider',
  test: true,
  recipient_code: null,
};

function paystack(...answers: unknown[]) {
  const fetchMock = vi.fn();
  for (const a of answers) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(a), { status: 200 }));
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe("paying a rider's early payout through Paystack", () => {
  beforeEach(() => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', 'sk_test_unit_0123456789');
    vi.stubEnv('NEXG_PAYSTACK_LIVE', '');
    db.rpc.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('makes the M-Pesa recipient once, sends under NexG’s reference, and waits for Paystack', async () => {
    db.rpc
      .mockResolvedValueOnce({ data: opened, error: null })
      .mockResolvedValueOnce({ data: { ok: true, recipient_code: 'RCP_unit1' }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, state: 'pending' }, error: null });
    const fetchMock = paystack(
      { status: true, data: { recipient_code: 'RCP_unit1' } },
      { status: true, data: { status: 'pending', transfer_code: 'TRF_unit1' } },
    );

    const out = await payEarlyThroughPaystack(REQUEST);

    expect(out.ok).toBe(true);
    expect(out.message).toMatch(/once Paystack confirms/);
    expect(out.message).toMatch(/Test mode/);
    const [recipientUrl, recipientInit] = fetchMock.mock.calls[0]!;
    expect(recipientUrl).toBe('https://api.paystack.co/transferrecipient');
    expect(JSON.parse(recipientInit.body)).toMatchObject({
      type: 'mobile_money',
      bank_code: 'MPESA',
      account_number: '0712345678',
      currency: 'KES',
    });
    const [transferUrl, transferInit] = fetchMock.mock.calls[1]!;
    expect(transferUrl).toBe('https://api.paystack.co/transfer');
    expect(JSON.parse(transferInit.body)).toMatchObject({
      amount: 50000,
      recipient: 'RCP_unit1',
      reference: 'NXT-abc12345',
    });
    expect(db.rpc.mock.calls[0]![0]).toBe('rpc_paystack_transfer_open');
    expect(db.rpc.mock.calls[2]![1]).toMatchObject({ p_step: 'transfer' });
  });

  it('never sends twice: an open payout already at Paystack is only reported', async () => {
    db.rpc.mockResolvedValueOnce({
      data: { ...opened, sent: true, state: 'pending' },
      error: null,
    });
    const fetchMock = paystack();

    const out = await payEarlyThroughPaystack(REQUEST);

    expect(out).toEqual({ ok: true, message: 'Already sent to Paystack (pending).' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says Paystack is unavailable when no key is set, and touches nothing', async () => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', '');
    const out = await payEarlyThroughPaystack(REQUEST);
    expect(out).toEqual({ ok: false, message: 'Paystack is unavailable at the moment.' });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('passes on the database’s refusal, such as test money to a real rider', async () => {
    db.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        message:
          'ERROR: Paystack is in test mode, which pays nobody: only a test rider can be paid with it.',
      },
    });
    const out = await payEarlyThroughPaystack(REQUEST);
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/^Paystack is in test mode/);
  });
});
