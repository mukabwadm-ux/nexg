import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type Method, methodOptions, PaymentMethods } from './payment-methods';

const all = methodOptions({ mpesaReady: true, bankEnabled: false });

function render(
  value: Method,
  {
    options = all,
    phone = '',
    total = 'KES 1,360',
    cashFee = null,
  }: {
    options?: ReturnType<typeof methodOptions>;
    phone?: string;
    total?: string | null;
    cashFee?: string | null;
  } = {},
) {
  return renderToStaticMarkup(
    <PaymentMethods
      options={options}
      value={value}
      onChange={() => undefined}
      phone={phone}
      total={total}
      cashFee={cashFee}
    />,
  );
}

describe('payment methods', () => {
  it('offers M-Pesa, and bank only when it is connected, but not pay on delivery', () => {
    expect(all.map((o) => o.value)).toEqual(['mpesa_stk']);
    expect(methodOptions({ mpesaReady: true, bankEnabled: true }).map((o) => o.value)).toEqual([
      'mpesa_stk',
      'bank_transfer',
    ]);
  });

  it('shows a method with nothing connected behind it as coming soon, and does not let it be picked', () => {
    const options = methodOptions({ mpesaReady: false, bankEnabled: false });
    const html = render('mpesa_stk', { options });
    expect(html).toContain('Coming soon');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?M-Pesa/);
  });

  it('offers no card payment and names no card provider', () => {
    const options = methodOptions({ mpesaReady: true, bankEnabled: true });
    for (const method of ['mpesa_stk', 'bank_transfer', 'cash_on_delivery'] as const) {
      const html = render(method, { options });
      expect(html).not.toMatch(/Paystack|Visa|Mastercard|>Card</i);
    }
  });

  it('says which phone the M-Pesa prompt goes to', () => {
    expect(render('mpesa_stk', { phone: '0712 345 678' })).toContain(
      'We send a payment prompt to 0712 345 678.',
    );
    expect(render('mpesa_stk')).toContain('the phone number you give above');
    expect(render('mpesa_stk')).toContain('Enter your M-Pesa PIN to pay.');
  });

  it('gives the amount to hand the rider, and the cash fee when there is one', () => {
    const html = render('cash_on_delivery', { total: 'KES 1,410', cashFee: 'KES 50' });
    expect(html).toContain('Pay the rider KES 1,410 in cash.');
    expect(html).toContain('a cash-handling fee of KES 50');
    expect(render('cash_on_delivery', { total: null })).toContain(
      'Pay the rider the total in cash.',
    );
  });

  it('marks the chosen method', () => {
    const html = render('mpesa_stk');
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?M-Pesa/);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });
});
