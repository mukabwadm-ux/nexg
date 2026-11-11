import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/public', () => ({ createPublicClient: () => ({ rpc }) }));

import { POST as b2cResult } from './b2c/result/route';
import { POST as b2cTimeout } from './b2c/timeout/route';
import { POST as paybillConfirm } from './paybill/confirm/route';
import { POST as paybillValidate } from './paybill/validate/route';

const TOKEN = 'ci-daraja-token';

function post(
  handler: (r: Request) => Promise<Response>,
  path: string,
  body: unknown,
  token = TOKEN,
) {
  return handler(
    new Request(`https://www.nexgapp.com/api/payments/daraja/${path}?token=${token}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: {}, error: null });
  vi.stubEnv('DARAJA_CALLBACK_SECRET', TOKEN);
});

afterEach(() => vi.unstubAllEnvs());

describe('Paybill confirmation', () => {
  const payment = {
    TransactionType: 'Pay Bill',
    TransID: 'TJK2ABCDEF',
    TransTime: '20261106101500',
    TransAmount: '500.00',
    BusinessShortCode: '600999',
    BillRefNumber: 'NX2611060042',
    MSISDN: '254712345678',
    FirstName: 'Amina',
  };

  it('hands the payment to the database without the payer’s name', async () => {
    const res = await post(paybillConfirm, 'paybill/confirm', payment);
    expect(await res.json()).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    expect(rpc).toHaveBeenCalledWith('rpc_payment_mpesa_paybill', {
      p_callback_secret: TOKEN,
      p_trans_id: 'TJK2ABCDEF',
      p_amount_kes: 500,
      p_account: 'NX2611060042',
      p_msisdn: '254712345678',
      p_payload: expect.not.objectContaining({ FirstName: expect.anything() }),
    });
  });

  it('ignores a confirmation without the token', async () => {
    await post(paybillConfirm, 'paybill/confirm', payment, 'wrong');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('accepts every payment Safaricom asks to validate', async () => {
    expect(await (await paybillValidate()).json()).toEqual({
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });
  });
});

describe('B2C result and timeout', () => {
  it('records the receipt and amount Safaricom paid out', async () => {
    await post(b2cResult, 'b2c/result', {
      Result: {
        ResultType: 0,
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        OriginatorConversationID: 'NXR0123456789ABCDEF01',
        ConversationID: 'AG_1',
        TransactionID: 'TJK3ABCDEF',
        ResultParameters: {
          ResultParameter: [
            { Key: 'TransactionAmount', Value: 500 },
            { Key: 'TransactionReceipt', Value: 'TJK3ABCDEF' },
            { Key: 'ReceiverPartyPublicName', Value: '254712345678 - Amina' },
          ],
        },
      },
    });
    expect(rpc).toHaveBeenCalledWith(
      'rpc_mpesa_payout_result',
      expect.objectContaining({
        p_originator_id: 'NXR0123456789ABCDEF01',
        p_conversation_id: 'AG_1',
        p_result_code: 0,
        p_receipt: 'TJK3ABCDEF',
        p_amount_kes: 500,
        p_payload: expect.not.objectContaining({ ReceiverPartyPublicName: expect.anything() }),
      }),
    );
  });

  it('marks a queue timeout as uncertain, never as a failure to retry', async () => {
    await post(b2cTimeout, 'b2c/timeout', {
      Result: { OriginatorConversationID: 'NXR0123456789ABCDEF01', ResultDesc: 'Timed out' },
    });
    expect(rpc).toHaveBeenCalledWith(
      'rpc_mpesa_payout_outcome',
      expect.objectContaining({ p_originator_id: 'NXR0123456789ABCDEF01', p_outcome: 'unknown' }),
    );
  });
});
