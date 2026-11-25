import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), userRpc: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mock.rpc }) }));
vi.mock('@/lib/supabase/customer-api', () => ({
  customerApiClient: () => ({ rpc: mock.userRpc, auth: { getUser: mock.getUser } }),
}));

import { holdGet, holdsPost, workerPost } from './http';

const secret = 's'.repeat(32);
const HOLD = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  mock.rpc.mockReset();
  mock.getUser.mockReset();
  mock.userRpc.mockReset();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  vi.stubEnv('CINEMA_WORKER_SECRET', secret);
  vi.stubEnv('CRON_SECRET', '');
});
afterEach(() => vi.unstubAllEnvs());

const worker = (headers: Record<string, string> = {}) =>
  workerPost(
    new Request('https://nexg.test/api/internal/cinema/worker', { method: 'POST', headers }),
  );

describe('the cinema worker endpoint', () => {
  it('waits until the owner configures it', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect((await worker({ 'x-cinema-worker-secret': secret })).status).toBe(503);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('runs only for the database cron', async () => {
    expect((await worker()).status).toBe(403);
    expect((await worker({ 'x-cinema-worker-secret': 'wrong' })).status).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('does what is due', async () => {
    mock.rpc.mockImplementation(async (fn: string) =>
      fn === 'cinema_due_work'
        ? {
            data: { syncs: [], confirms: [], expiries: [], cancels: [], refunds: ['x'] },
            error: null,
          }
        : {
            data: { holdId: 'x', state: 'refund_due', refundReason: 'customer_cancelled' },
            error: null,
          },
    );
    const answer = await worker({ 'x-cinema-worker-secret': secret });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({ refundsWaiting: 1 });
    expect(mock.rpc).toHaveBeenCalledWith('cinema_due_work', { p_limit: 50 });
  });
});

describe('the customer endpoints', () => {
  const body = {
    showingId: '11111111-1111-4111-8111-111111111111',
    seats: ['F7'],
    expectedTotalMinor: 65000,
    requestId: '44444444-4444-4444-8444-444444444444',
  };
  const post = (payload: unknown, auth?: string) =>
    holdsPost(
      new Request('https://nexg.test/api/customer/cinema/holds', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
        body: JSON.stringify(payload),
      }),
    );

  it('needs a signed-in customer', async () => {
    const answer = await post(body);
    expect(answer.status).toBe(401);
    expect(answer.headers.get('content-type')).toBe('application/problem+json');
    expect(await answer.json()).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('refuses a selection that is not one to ten seats', async () => {
    const answer = await post({ ...body, seats: [] }, 'Bearer token');
    expect(answer.status).toBe(422);
    expect(mock.getUser).not.toHaveBeenCalled();
  });

  it("answers not found for a hold that isn't the customer's", async () => {
    mock.getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
    mock.userRpc.mockResolvedValue({
      data: null,
      error: { message: 'Seat hold not found.', code: 'P0002' },
    });
    const answer = await holdGet(
      new Request(`https://nexg.test/api/customer/cinema/holds/${HOLD}`, {
        headers: { authorization: 'Bearer t' },
      }),
      HOLD,
    );
    expect(answer.status).toBe(404);
    expect(await answer.json()).toMatchObject({ code: 'NOT_FOUND', title: 'Seat hold not found.' });
  });
});
