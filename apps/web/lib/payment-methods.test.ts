import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { mpesaProvider, paymentMethods } from './payment-methods';

const methods = (setup: Parameters<typeof paymentMethods>[0]) =>
  paymentMethods(setup).map((m) => `${m.method}:${m.provider}${m.test ? ':test' : ''}`);

describe('payment methods', () => {
  it('production today: M-Pesa straight to Safaricom, nothing else', () => {
    expect(methods({ paystack: null, daraja: true, bank: false })).toEqual(['mpesa_stk:daraja']);
  });

  it('Paystack in test mode keeps M-Pesa on Safaricom where Safaricom is connected', () => {
    expect(methods({ paystack: 'test', daraja: true, bank: true })).toEqual([
      'mpesa_stk:daraja',
      'airtel_money:paystack:test',
      'card:paystack:test',
      'saved_card:paystack:test',
      'bank_transfer:bank',
    ]);
  });

  it('a preview site with only Paystack test keys takes M-Pesa through Paystack', () => {
    expect(mpesaProvider({ paystack: 'test', daraja: false, bank: false })).toBe('paystack');
  });

  it('once Paystack is live, M-Pesa goes through Paystack (owner, 21 Nov)', () => {
    expect(methods({ paystack: 'live', daraja: true, bank: false })).toEqual([
      'mpesa_stk:paystack',
      'airtel_money:paystack',
      'card:paystack',
      'saved_card:paystack',
    ]);
  });

  it('nothing connected: nothing offered, and never cash on delivery', () => {
    expect(paymentMethods({ paystack: null, daraja: false, bank: false })).toEqual([]);
  });
});
