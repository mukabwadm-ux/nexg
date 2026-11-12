import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BookingReadiness } from './booking-readiness';

const merchantId = '20000000-0000-4000-8000-000000000002';
const render = async (input: Partial<Parameters<typeof BookingReadiness>[0]> = {}) =>
  renderToStaticMarkup(
    await BookingReadiness({
      merchantId,
      status: 'live',
      exploreVisible: true,
      subcategory: 'spa',
      activeResources: 0,
      ...input,
    }),
  );

afterEach(() => vi.unstubAllGlobals());

describe('booking readiness', () => {
  it('says a listed merchant with published services can be booked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ business: { id: merchantId }, offerings: [{}, {}] })),
    );
    const html = await render();
    expect(html).toContain('Customers can book this merchant.');
    expect(html).toContain('2 services');
    expect(html).toContain('Appointments');
  });

  it('names every blocker for a hidden merchant without a subcategory', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const html = await render({ exploreVisible: false, subcategory: null });
    expect(html).toContain('Customers cannot book this merchant yet.');
    expect(html).toContain('No subcategory is set');
    expect(html).toContain('Hidden from Discovery');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('asks for published services when the engine has none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    const html = await render();
    expect(html).toContain('Nothing is published for booking');
  });
});
