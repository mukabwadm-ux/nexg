import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type Method, methodOptions, PaymentMethods } from './payment-methods';

const all = methodOptions({ cardReady: true, mpesaReady: true, bankEnabled: false });

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
  it('offers card, M-Pesa and pay on delivery, and bank only when it is connected', () => {
    expect(all.map((o) => o.value)).toEqual(['card', 'mpesa_stk', 'cash_on_delivery']);
    expect(
      methodOptions({ cardReady: true, mpesaReady: true, bankEnabled: true }).map((o) => o.value),
    ).toEqual(['card', 'mpesa_stk', 'bank_transfer', 'cash_on_delivery']);
  });

  it('shows a method with nothing connected behind it as coming soon, and does not let it be picked', () => {
    const options = methodOptions({ cardReady: false, mpesaReady: true, bankEnabled: false });
    const html = render('mpesa_stk', { options });
    expect(html).toContain('Coming soon');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Card/);
  });

  it('explains card payments without asking for the card here', () => {
    const html = render('card');
    expect(html).toContain('Pay by card on Paystack');
    expect(html).toContain('VISA');
    expect(html).toContain('Mastercard');
    expect(html).toContain('NexG never sees or stores your card number.');
    expect(html).not.toMatch(/card number<\/label>|name="card/);
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
