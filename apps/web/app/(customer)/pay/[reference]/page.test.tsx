import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PaymentReturn from './page';

const { from, state } = vi.hoisted(() => ({
  from: vi.fn(),
  state: {
    payment: null as Record<string, unknown> | null,
    order: null as Record<string, unknown> | null,
  },
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ from }) }));
vi.mock('@/lib/mpesa-prompt', () => ({ reconcileMpesaPrompts: async () => false }));
vi.mock('@/lib/bank/payments', () => ({ reconcileBankPayment: async () => false }));
vi.mock('@/lib/bank', () => ({ bankCheckoutEnabled: () => false }));
vi.mock('@/components/site-header', () => ({ SiteHeader: () => null }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

function query(data: unknown) {
  const result = Promise.resolve({ data, error: null });
  return Object.assign(result, {
    select: () => result,
    eq: () => result,
    maybeSingle: () => result,
  });
}

beforeEach(() => {
  from.mockImplementation((table: string) =>
    query(
      table === 'payment'
        ? state.payment
        : table === 'order'
          ? state.order
          : { trading_name: 'Sokoni Grill House' },
    ),
  );
});

const basePayment = {
  reference: 'NXP-261110-868FF262DD',
  amount_cents: 136000,
  currency: 'KES',
  intent: 'order',
  order_id: 'order-1',
  paid_at: null,
  failure_reason: null,
  provider: 'mpesa',
  provider_ref: 'ws_CO_1',
  authorization_url: null,
  payer_phone: '254712345678',
  authorised_at: new Date().toISOString(),
};

const baseOrder = {
  id: 'order-1',
  reference: 'NX-261110-0003',
  payment_status: 'pending',
  payment_method: 'mpesa_stk',
  stage: 'placed',
  total_cents: 136000,
  merchant_id: 'merchant-1',
};

const render = async () =>
  renderToStaticMarkup(await PaymentReturn({ params: { reference: 'NXP-261110-868FF262DD' } }));

describe('payment page', () => {
  it('shows a cancelled M-Pesa payment plainly, with a way to try again', async () => {
    state.payment = {
      ...basePayment,
      state: 'failed',
      failure_reason: 'Request cancelled by user',
    };
    state.order = baseOrder;
    const html = await render();
    expect(html).toContain('Payment cancelled');
    expect(html).toContain('nothing was charged');
    expect(html).toContain('Try again with M-Pesa');
    expect(html).toContain('value="0712345678"');
    expect(html).toContain('M-Pesa · 0712345678');
    expect(html).toContain('Sokoni Grill House');
    expect(html).toContain('NX-261110-0003');
    expect(html).not.toContain('Pay by card');
  });

  it('stops waiting on a prompt nobody answered, and offers a new one up front', async () => {
    state.payment = {
      ...basePayment,
      state: 'authorised',
      authorised_at: new Date(Date.now() - 3 * 60_000).toISOString(),
    };
    state.order = baseOrder;
    const html = await render();
    expect(html).toContain('No answer from M-Pesa yet');
    expect(html).toContain('If you cancelled the prompt or it timed out, nothing was charged');
    expect(html).toContain('Send new prompt');
    expect(html).not.toContain('Pay by card');
  });

  it('asks the guest to check their phone while a fresh prompt is out', async () => {
    state.payment = { ...basePayment, state: 'authorised' };
    state.order = baseOrder;
    const html = await render();
    expect(html).toContain('Check your phone');
    expect(html).toContain('We sent an M-Pesa prompt for KES 1,360 to 0712345678');
    expect(html).toContain('No prompt on your phone? Send it again');
    expect(html).not.toContain('Send new prompt');
  });

  it('confirms a paid order with its receipt', async () => {
    state.payment = { ...basePayment, state: 'paid', paid_at: new Date().toISOString() };
    state.order = { ...baseOrder, payment_status: 'paid' };
    const html = await render();
    expect(html).toContain('Payment received');
    expect(html).toContain('Sokoni Grill House has your order');
    expect(html).toContain('See your receipt');
  });

  it('confirms a pay-on-delivery order, which has no payment yet', async () => {
    state.payment = null;
    state.order = { ...baseOrder, payment_method: 'cash_on_delivery' };
    const html = await render();
    expect(html).toContain('Order placed');
    expect(html).toContain('Pay the rider KES 1,360 in cash when it arrives');
    expect(html).toContain('Pay on delivery');
    expect(html).not.toContain('We cannot find that payment');
  });

  it('says so when the reference matches nothing of theirs', async () => {
    state.payment = null;
    state.order = null;
    const html = await render();
    expect(html).toContain('We cannot find that payment');
  });
});
