import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { MerchantHome } from '@/app/merchant/layout';

import { HomeLive } from './home-live';
import { HomePerformance } from './home-performance';

const merchant = {
  name: 'Sample business',
  status: 'live',
  accepting_orders: true,
  orders_today: 3,
  earned_today_cents: 120000,
} as MerchantHome;

const available = { orders: false, attention: false, branches: false, money: false, bars: false };

function home(unavailable = available, data = merchant) {
  return renderToStaticMarkup(
    <HomeLive
      m={data}
      personName="Sam"
      branches={[]}
      attention={[]}
      orders={[]}
      money={null}
      bars={[]}
      unavailable={unavailable}
    />,
  );
}

describe('live merchant Home', () => {
  it('shows an honest empty queue and names the earnings measure', () => {
    const html = home();
    expect(html).toContain('No orders in the displayed queue need your attention right now');
    expect(html).toContain('Delivered sales after fees today');
    expect(html).toContain('KES 1,200');
    expect(html).toContain('Performance data is not available yet');
  });

  it('distinguishes unavailable data from an empty queue', () => {
    const html = home({ ...available, orders: true, bars: true });
    expect(html).toContain('Orders could not be loaded');
    expect(html).toContain('Performance data could not be loaded');
    expect(html).not.toContain('No orders in the displayed queue need your attention right now');
  });

  it('does not imply an account is accepting orders when it is switched off', () => {
    const html = home(available, { ...merchant, accepting_orders: false });
    expect(html).toContain('Accepting orders');
    expect(html).toContain('Off');
  });
});

describe('Home performance', () => {
  it('provides the real daily figures as text as well as a chart', () => {
    const html = renderToStaticMarkup(
      <HomePerformance
        unavailable={false}
        bars={[{ day: '2026-10-28', dow: 'Wed', delivered: 4, gross_cents: 150000 }]}
      />,
    );
    expect(html).toContain('Show daily figures');
    expect(html).toContain('2026-10-28');
    expect(html).toContain('Days shown are those with recorded orders');
  });

  it('does not turn an invalid value into a zero', () => {
    const html = renderToStaticMarkup(
      <HomePerformance
        unavailable={false}
        bars={[{ day: '2026-10-28', dow: 'Wed', delivered: Number.NaN, gross_cents: 0 }]}
      />,
    );
    expect(html).toContain('Performance data could not be displayed');
    expect(html).not.toContain('Show daily figures');
  });
});
