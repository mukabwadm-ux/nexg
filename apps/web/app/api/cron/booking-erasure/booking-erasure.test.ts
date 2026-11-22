import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), forget: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mock.rpc }) }));
vi.mock('../../../../lib/booking/platform', () => ({ forgetEngineCustomer: mock.forget }));

import { GET } from './route';

const secret = 'c'.repeat(32);
const call = (auth?: string) =>
  GET(
    new Request('https://nexg.test/api/cron/booking-erasure', {
      headers: auth ? { authorization: auth } : {},
    }),
  );

beforeEach(() => {
  mock.rpc.mockReset();
  mock.forget.mockReset();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  vi.stubEnv('CRON_SECRET', secret);
});
afterEach(() => vi.unstubAllEnvs());

describe('the daily booking-engine erasure', () => {
  it('waits until the owner configures it', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect((await call(`Bearer ${secret}`)).status).toBe(503);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('runs only for the scheduler', async () => {
    expect((await call()).status).toBe(403);
    expect((await call('Bearer wrong')).status).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('forgets each queued customer and records how it went', async () => {
    mock.rpc.mockImplementation(async (name: string) =>
      name === 'fn_engine_booking_erasure_next'
        ? {
            data: [
              { id: 'e1', merchant_id: 'm1', customer_ref: 'account_x' },
              { id: 'e2', merchant_id: 'm2', customer_ref: 'account_x' },
              { id: 'e3', merchant_id: 'm3', customer_ref: 'account_x' },
            ],
            error: null,
          }
        : { data: null, error: null },
    );
    mock.forget
      .mockResolvedValueOnce({ ok: true, value: { forgotten: 1 } })
      .mockResolvedValueOnce({ ok: false, status: 503, code: 'service_unavailable' })
      .mockResolvedValueOnce({ ok: false, status: 404, code: 'not_found' });
    const response = await call(`Bearer ${secret}`);
    expect(await response.json()).toEqual({ done: 2, failed: 1 });
    const done = mock.rpc.mock.calls.filter(([name]) => name === 'fn_engine_booking_erasure_done');
    expect(done.map(([, args]) => args)).toEqual([
      { p_id: 'e1', p_error: null },
      { p_id: 'e2', p_error: '503 service_unavailable' },
      { p_id: 'e3', p_error: null },
    ]);
  });
});
