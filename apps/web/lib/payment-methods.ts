import 'server-only';

import { bankCheckoutEnabled } from '@/lib/bank';
import { darajaConfigured } from '@/lib/daraja';
import { paystackMode, type PaystackMode } from '@/lib/paystack';

/*
 * The one list of ways to pay for an order (shared services, payments). The
 * website's checkout and pay page, and every app through
 * GET /api/customer/checkout/payment-methods, show this list, and
 * POST /api/customer/checkout/orders/{orderId}/payment takes any method in it.
 *
 * Owner, 21 Nov 2026: card, M-Pesa and Airtel go through one Paystack account.
 * Until Paystack is live, M-Pesa still goes straight to Safaricom (Daraja), as
 * the website did before, so nobody loses M-Pesa while Paystack is in test
 * mode. Cash on delivery is not offered on customer orders (owner, 20 Nov).
 */

export type PayMethod = 'mpesa_stk' | 'airtel_money' | 'card' | 'saved_card' | 'bank_transfer';
export type PayProvider = 'paystack' | 'daraja' | 'bank';

export interface PaymentMethod {
  method: PayMethod;
  provider: PayProvider;
  label: string;
  /** Paystack's test keys: only shops marked for test payments take these. */
  test?: true;
}

export interface PaymentSetup {
  paystack: PaystackMode | null;
  daraja: boolean;
  bank: boolean;
}

export function paymentSetup(): PaymentSetup {
  return { paystack: paystackMode(), daraja: darajaConfigured(), bank: bankCheckoutEnabled() };
}

/**
 * Who takes an M-Pesa payment: Paystack once it is live, or in test mode where
 * Safaricom is not connected (a preview site); otherwise Safaricom directly.
 */
export function mpesaProvider(setup: PaymentSetup): 'paystack' | 'daraja' | null {
  if (setup.paystack === 'live') return 'paystack';
  if (setup.daraja) return 'daraja';
  return setup.paystack === 'test' ? 'paystack' : null;
}

export function paymentMethods(setup: PaymentSetup = paymentSetup()): PaymentMethod[] {
  const methods: PaymentMethod[] = [];
  const test = setup.paystack === 'test' ? ({ test: true } as const) : {};
  const mpesa = mpesaProvider(setup);
  if (mpesa) {
    methods.push({
      method: 'mpesa_stk',
      provider: mpesa,
      label: 'M-Pesa',
      ...(mpesa === 'paystack' ? test : {}),
    });
  }
  if (setup.paystack) {
    methods.push({ method: 'airtel_money', provider: 'paystack', label: 'Airtel Money', ...test });
    methods.push({ method: 'card', provider: 'paystack', label: 'Card', ...test });
    methods.push({ method: 'saved_card', provider: 'paystack', label: 'Saved card', ...test });
  }
  if (setup.bank) methods.push({ method: 'bank_transfer', provider: 'bank', label: 'Bank' });
  return methods;
}

export function offers(method: PayMethod, setup: PaymentSetup = paymentSetup()): boolean {
  return paymentMethods(setup).some((m) => m.method === method);
}
