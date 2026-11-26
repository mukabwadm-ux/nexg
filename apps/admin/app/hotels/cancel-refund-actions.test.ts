import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/staff', () => ({
  requireStaff: async () => ({ displayName: 'Fixture hospitality' }),
  requireModule: () => ({ level: 'full' }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => db }));

import { cancelAndRefundStay, recordPaystackRefundCheck } from './cancel-refund-actions';

const STAY = '5b0d8a52-1f3c-4b8e-9c1a-2d3e4f5a6b7c';
const cancelled = {
  ok: true,
  changed: true,
  status: 'cancelled',
  paid_kes: 12000,
  refund_kes: 12000,
  refund_due_at: '2026-11-26T09:00:00Z',
  refunded_at: null,
  provider: 'paystack',
  is_test: true,
  paystack_refund_state: null,
};
const opened = {
  ok: true,
  reference: 'NXR-unit00000001',
  transaction: '4242',
  amount_cents: 1200000,
  sent: false,
  state: 'opened',
};
const PAYSTACK_HAS_IT =
  'Paystack already has this refund. It shows as refunded once Paystack confirms it.';

const answer = (data: unknown) => ({ data, error: null });
const press = () => cancelAndRefundStay({ stayId: STAY, reason: ' Water cut at the property ' });
const calls = () => db.rpc.mock.calls.map((call) => call[0]);

function paystack(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('cancelling a paid stay and refunding it in full', () => {
  beforeEach(() => {
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', 'sk_test_unit_0123456789');
    vi.stubEnv('PAYSTACK_LIVE_SECRET_KEY', '');
    db.rpc.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('cancels, sends a Paystack payment back and waits for Paystack', async () => {
    db.rpc
      .mockResolvedValueOnce(answer(cancelled))
      .mockResolvedValueOnce(answer(opened))
      .mockResolvedValueOnce(answer({ ok: true, state: 'pending' }));
    const fetchMock = paystack({ status: true, data: { status: 'pending' } });

    expect(await press()).toEqual({
      ok: true,
      message: 'Cancelled. Sent to Paystack. It shows as refunded once Paystack has processed it.',
    });
    expect(db.rpc.mock.calls[0]).toEqual([
      'rpc_stay_cancel_refund_full',
      { p_stay_id: STAY, p_reason: 'Water cut at the property' },
    ]);
    expect(calls()).toEqual([
      'rpc_stay_cancel_refund_full',
      'rpc_paystack_refund_open',
      'rpc_paystack_refund_answered',
    ]);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.paystack.co/refund');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      transaction: '4242',
      amount: 1200000,
      reference: 'NXR-unit00000001',
    });
  });

  it('leaves any other payment to be sent by hand and recorded', async () => {
    db.rpc.mockResolvedValueOnce(answer({ ...cancelled, provider: 'mpesa', is_test: false }));
    const fetchMock = paystack({});

    expect(await press()).toEqual({
      ok: true,
      message: 'Cancelled. Send the refund by M-Pesa or bank and record it below.',
    });
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says the stay was already cancelled on a second press, and does not send twice', async () => {
    db.rpc
      .mockResolvedValueOnce(
        answer({ ...cancelled, changed: false, paystack_refund_state: 'pending' }),
      )
      .mockResolvedValueOnce(answer({ ...opened, sent: true, state: 'pending' }));
    const fetchMock = paystack({});

    expect(await press()).toEqual({
      ok: true,
      message: 'This stay was already cancelled. Already sent to Paystack (pending).',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never claims nothing changed when a second press sends the first refund', async () => {
    db.rpc
      .mockResolvedValueOnce(answer({ ...cancelled, changed: false }))
      .mockResolvedValueOnce(answer(opened))
      .mockResolvedValueOnce(answer({ ok: true, state: 'pending' }));
    paystack({ status: true, data: { status: 'pending' } });

    expect(await press()).toEqual({
      ok: true,
      message:
        'This stay was already cancelled. Sent to Paystack. It shows as refunded once Paystack has processed it.',
    });
  });

  it('sends nothing on a second press after a failed refund', async () => {
    db.rpc.mockResolvedValueOnce(
      answer({ ...cancelled, changed: false, paystack_refund_state: 'failed' }),
    );
    const fetchMock = paystack({});

    expect(await press()).toEqual({
      ok: false,
      message:
        'This stay was already cancelled; nothing was changed. The last Paystack refund failed. Check it in Paystack, then send it again from the refunds below.',
    });
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only reports a refund that is already recorded', async () => {
    db.rpc.mockResolvedValueOnce(
      answer({ ...cancelled, changed: false, refunded_at: '2026-11-26T10:00:00Z' }),
    );

    const out = await press();

    expect(out.message).toBe(
      'This stay was already cancelled; nothing was changed. The refund is already recorded.',
    );
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it('never sends a smaller policy refund from the full-refund button', async () => {
    db.rpc.mockResolvedValueOnce(answer({ ...cancelled, changed: false, refund_kes: 6000 }));
    const fetchMock = paystack({});

    const out = await press();

    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/KES 6,000 of KES 12,000/);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records nothing when Paystack answers 409: it already has the refund', async () => {
    db.rpc.mockResolvedValueOnce(answer(cancelled)).mockResolvedValueOnce(answer(opened));
    paystack({ status: false, message: 'Duplicate refund reference' }, 409);

    expect(await press()).toEqual({ ok: true, message: `Cancelled. ${PAYSTACK_HAS_IT}` });
    expect(calls()).toEqual(['rpc_stay_cancel_refund_full', 'rpc_paystack_refund_open']);
  });

  it('says the stay is cancelled even when the refund could not be sent', async () => {
    db.rpc.mockResolvedValueOnce(answer(cancelled)).mockResolvedValueOnce(answer(opened));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    expect(await press()).toEqual({
      ok: false,
      message: 'Cancelled. We could not reach Paystack. The refund is not sent yet.',
    });
  });

  it('passes on the database’s refusal and sends nothing', async () => {
    db.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'Hospitality staff only.' },
    });
    const fetchMock = paystack({});

    expect(await press()).toEqual({ ok: false, message: 'Hospitality staff only.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an unreadable answer instead of guessing', async () => {
    for (const data of [null, 'ok', [], { ok: true }]) {
      db.rpc.mockResolvedValueOnce(answer(data));
      const out = await press();
      expect(out.ok).toBe(false);
      expect(out.message).toMatch(/could not be read/);
    }
  });

  it('asks for a reason before touching anything', async () => {
    const out = await cancelAndRefundStay({ stayId: STAY, reason: '   ' });

    expect(out).toEqual({ ok: false, message: 'Give the reason for cancelling.' });
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe('recording what the Paystack dashboard shows', () => {
  const check = (outcome: 'processed' | 'failed', reference = ' 3018401 ') =>
    recordPaystackRefundCheck({
      stayId: STAY,
      outcome,
      reference,
      note: ' Seen today ',
      shownReference: 'NXR-unit00000001',
    });

  beforeEach(() => {
    db.rpc.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('records a processed refund and sends no money', async () => {
    db.rpc.mockResolvedValueOnce(
      answer({ ok: true, changed: true, message: 'Recorded as refunded through Paystack.' }),
    );
    const fetchMock = paystack({});

    expect(await check('processed')).toEqual({
      ok: true,
      message: 'Recorded as refunded through Paystack.',
    });
    expect(db.rpc.mock.calls).toEqual([
      [
        'rpc_stay_paystack_refund_checked',
        {
          p_stay_id: STAY,
          p_outcome: 'processed',
          p_reference: '3018401',
          p_note: 'Seen today',
          p_shown_reference: 'NXR-unit00000001',
        },
      ],
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks a failed refund without needing a reference', async () => {
    const message = 'Marked failed. Nothing is recorded as refunded; the refund can be sent again.';
    db.rpc.mockResolvedValueOnce(answer({ ok: true, changed: true, message }));

    expect(await check('failed', '')).toEqual({ ok: true, message });
    expect(db.rpc.mock.calls[0]![1]).toMatchObject({ p_outcome: 'failed', p_reference: '' });
  });

  it('passes on that a repeat changed nothing', async () => {
    const message = 'This stay’s refund is already recorded. Nothing was changed.';
    db.rpc.mockResolvedValueOnce(answer({ ok: true, changed: false, message }));

    expect(await check('processed')).toEqual({ ok: true, message });
  });

  it('asks for the dashboard’s reference before recording a processed refund', async () => {
    expect(await check('processed', '   ')).toEqual({
      ok: false,
      message: 'Enter the refund reference shown in the Paystack dashboard.',
    });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('refuses anything but processed or failed, and a bad stay ID', async () => {
    expect((await check('refunded' as 'processed')).ok).toBe(false);
    expect(
      await recordPaystackRefundCheck({
        stayId: 'nope',
        outcome: 'failed',
        reference: '',
        note: '',
        shownReference: null,
      }),
    ).toEqual({ ok: false, message: 'The stay ID is invalid.' });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('passes on the database’s refusal and hides any other error', async () => {
    db.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: '22023', message: 'This stay was not paid through Paystack.' },
      })
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key' } });

    expect(await check('processed')).toEqual({
      ok: false,
      message: 'This stay was not paid through Paystack.',
    });
    expect(await check('processed')).toEqual({
      ok: false,
      message: 'That could not be recorded. Try again.',
    });
  });

  it('reports an unreadable answer instead of guessing', async () => {
    for (const data of [null, 'ok', [], { ok: true }]) {
      db.rpc.mockResolvedValueOnce(answer(data));
      const out = await check('processed');
      expect(out.ok).toBe(false);
      expect(out.message).toMatch(/could not be read/);
    }
  });
});
