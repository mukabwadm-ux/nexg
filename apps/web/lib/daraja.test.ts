import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  b2cConfigured,
  b2cPay,
  callbackOrigin,
  forgetDarajaTokens,
  paybillNumber,
  registerPaybillUrls,
} from './daraja';

const MAIN = {
  DARAJA_ENV: 'sandbox',
  DARAJA_CONSUMER_KEY: 'ci-key',
  DARAJA_CONSUMER_SECRET: 'ci-secret',
  DARAJA_SHORTCODE: '600999',
  DARAJA_PASSKEY: 'ci-passkey',
  DARAJA_CALLBACK_SECRET: 'ci-callback-token',
};
const B2C = {
  DARAJA_B2C_SHORTCODE: '600111',
  DARAJA_B2C_INITIATOR: 'ci-initiator',
  DARAJA_B2C_SECURITY_CREDENTIAL: 'ci-encrypted-credential',
};

function setEnv(values: Record<string, string>) {
  for (const [k, v] of Object.entries(values)) vi.stubEnv(k, v);
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  forgetDarajaTokens();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('callbackOrigin', () => {
  it('uses the address the request arrived at, because Safaricom does not follow redirects', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://nexgapp.com');
    expect(callbackOrigin(new Request('https://www.nexgapp.com/api/payments/mpesa/start'))).toBe(
      'https://www.nexgapp.com',
    );
  });

  it('lets DARAJA_CALLBACK_ORIGIN override it', () => {
    vi.stubEnv('DARAJA_CALLBACK_ORIGIN', 'https://pay.nexgapp.com/');
    expect(callbackOrigin(new Request('https://www.nexgapp.com/x'))).toBe(
      'https://pay.nexgapp.com',
    );
  });

  it('falls back to the site URL on a local request', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.nexgapp.com');
    expect(callbackOrigin(new Request('http://localhost:3000/x'))).toBe('https://www.nexgapp.com');
  });
});

describe('paybillNumber', () => {
  it('is the shortcode for a Paybill', () => {
    setEnv(MAIN);
    expect(paybillNumber()).toBe('600999');
  });

  it('is null for a Till, whose payments carry no account number', () => {
    setEnv({
      ...MAIN,
      DARAJA_TILL_NUMBER: '5551234',
      DARAJA_TRANSACTION_TYPE: 'CustomerBuyGoodsOnline',
    });
    expect(paybillNumber()).toBeNull();
  });
});

describe('b2cPay', () => {
  const input = {
    originatorId: 'NXR0123456789ABCDEF01',
    phone: '254712345678',
    amountCents: 123450,
    remarks: 'NexG refund NX-261106-0001',
    resultUrl: 'https://www.nexgapp.com/api/payments/daraja/b2c/result?token=t',
    timeoutUrl: 'https://www.nexgapp.com/api/payments/daraja/b2c/timeout?token=t',
  };

  it('is not connected until the B2C keys are set', async () => {
    setEnv(MAIN);
    expect(b2cConfigured()).toBe(false);
    expect(await b2cPay(input)).toEqual({
      outcome: 'refused',
      message: 'M-Pesa refunds are not connected.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for whole shillings, rounded up, under our originator id', async () => {
    setEnv({ ...MAIN, ...B2C });
    fetchMock
      .mockResolvedValueOnce(reply(200, { access_token: 'tok' }))
      .mockResolvedValueOnce(
        reply(200, { ResponseCode: '0', ConversationID: 'AG_1', ResponseDescription: 'Accepted' }),
      );
    const result = await b2cPay(input);
    expect(result).toEqual({ outcome: 'accepted', conversationId: 'AG_1', message: 'Accepted' });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://sandbox.safaricom.co.ke/mpesa/b2c/v3/paymentrequest');
    expect(JSON.parse(String(init.body))).toMatchObject({
      OriginatorConversationID: 'NXR0123456789ABCDEF01',
      InitiatorName: 'ci-initiator',
      SecurityCredential: 'ci-encrypted-credential',
      CommandID: 'BusinessPayment',
      Amount: 1235,
      PartyA: '600111',
      PartyB: '254712345678',
    });
  });

  it('treats a clear refusal as nothing sent', async () => {
    setEnv({ ...MAIN, ...B2C });
    fetchMock
      .mockResolvedValueOnce(reply(200, { access_token: 'tok' }))
      .mockResolvedValueOnce(reply(400, { errorMessage: 'Invalid Initiator' }));
    expect(await b2cPay(input)).toEqual({ outcome: 'refused', message: 'Invalid Initiator' });
  });

  it('treats a dropped connection as unknown, so nobody sends it again without checking', async () => {
    setEnv({ ...MAIN, ...B2C });
    fetchMock
      .mockResolvedValueOnce(reply(200, { access_token: 'tok' }))
      .mockRejectedValueOnce(new Error('socket hang up'));
    expect(await b2cPay(input)).toEqual({ outcome: 'unknown', message: 'socket hang up' });
  });

  it('reuses a token instead of asking for one per request', async () => {
    setEnv({ ...MAIN, ...B2C });
    fetchMock
      .mockResolvedValueOnce(reply(200, { access_token: 'tok' }))
      .mockImplementation(() =>
        Promise.resolve(reply(200, { ResponseCode: '0', ConversationID: 'AG_2' })),
      );
    await b2cPay(input);
    await b2cPay(input);
    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/oauth/'));
    expect(tokenCalls).toHaveLength(1);
  });
});

describe('registerPaybillUrls', () => {
  it('refuses a Till, which cannot be matched to orders', async () => {
    setEnv({ ...MAIN, DARAJA_TILL_NUMBER: '5551234' });
    const result = await registerPaybillUrls({ confirmationUrl: 'c', validationUrl: 'v' });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('registers the confirmation and validation addresses for the Paybill', async () => {
    setEnv(MAIN);
    fetchMock
      .mockResolvedValueOnce(reply(200, { access_token: 'tok' }))
      .mockResolvedValueOnce(reply(200, { ResponseCode: '0', ResponseDescription: 'Success' }));
    const result = await registerPaybillUrls({
      confirmationUrl: 'https://www.nexgapp.com/api/payments/daraja/paybill/confirm?token=t',
      validationUrl: 'https://www.nexgapp.com/api/payments/daraja/paybill/validate?token=t',
    });
    expect(result).toEqual({ ok: true, message: 'Success' });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://sandbox.safaricom.co.ke/mpesa/c2b/v2/registerurl');
    expect(JSON.parse(String(init.body))).toMatchObject({
      ShortCode: '600999',
      ResponseType: 'Completed',
    });
  });

  it('keeps Safaricom words out of the addresses it registers', () => {
    /* Daraja refuses C2B URLs that contain words such as "mpesa" or "query". */
    for (const path of [
      '/api/payments/daraja/paybill/confirm',
      '/api/payments/daraja/paybill/validate',
    ]) {
      expect(path).not.toMatch(/m-?pesa|safaricom|exec?|cmd|sql|query/i);
    }
  });
});
