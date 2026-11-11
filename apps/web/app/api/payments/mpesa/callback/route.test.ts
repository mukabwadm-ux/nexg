import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/public', () => ({ createPublicClient: () => ({ rpc }) }));

import { POST } from './route';

const TOKEN = 'ci-callback-token';

function callback(token: string | null, body: unknown) {
  const url = `https://www.nexgapp.com/api/payments/mpesa/callback${token === null ? '' : `?token=${token}`}`;
  return POST(new Request(url, { method: 'POST', body: JSON.stringify(body) }));
}

const paid = {
  Body: {
    stkCallback: {
      CheckoutRequestID: 'ws_CO_1',
      ResultCode: 0,
      ResultDesc: 'The service request is processed successfully.',
      CallbackMetadata: {
        Item: [
          { Name: 'Amount', Value: 500 },
          { Name: 'MpesaReceiptNumber', Value: 'TJK1ABCDEF' },
          { Name: 'PhoneNumber', Value: 254712345678 },
        ],
      },
    },
  },
};

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: {}, error: null });
  vi.stubEnv('DARAJA_CALLBACK_SECRET', TOKEN);
});

afterEach(() => vi.unstubAllEnvs());

describe('POST /api/payments/mpesa/callback', () => {
  it('records a verified result with its amount, receipt and phone', async () => {
    const res = await callback(TOKEN, paid);
    expect(await res.json()).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    expect(rpc).toHaveBeenCalledWith(
      'rpc_payment_mpesa_callback',
      expect.objectContaining({
        p_checkout_request_id: 'ws_CO_1',
        p_result_code: 0,
        p_callback_secret: TOKEN,
        p_amount_kes: 500,
        p_receipt: 'TJK1ABCDEF',
        p_phone: '254712345678',
      }),
    );
  });

  it('writes down a callback with the wrong token, and changes nothing', async () => {
    const res = await callback('not-the-token', paid);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('rpc_payment_mpesa_callback_rejected', {
      p_checkout_request_id: 'ws_CO_1',
      p_reason: 'wrong_token',
    });
  });

  it('writes down a callback with no token at all', async () => {
    await callback(null, paid);
    expect(rpc).toHaveBeenCalledWith('rpc_payment_mpesa_callback_rejected', {
      p_checkout_request_id: 'ws_CO_1',
      p_reason: 'missing_token',
    });
  });

  it('asks Safaricom to retry when the database could not record it', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    const res = await callback(TOKEN, paid);
    expect(res.status).toBe(500);
  });
});
