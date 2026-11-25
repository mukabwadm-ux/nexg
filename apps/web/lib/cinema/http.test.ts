import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), userRpc: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mock.rpc }) }));
vi.mock('@/lib/supabase/customer-api', () => ({
  customerApiClient: () => ({ rpc: mock.userRpc, auth: { getUser: mock.getUser } }),
}));

import { holdGet, holdsGet, holdsPost, workerPost } from './http';

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
        : fn === 'fn_cinema_refund_open'
          ? {
              /* Already with Paystack: nothing is sent again. */
              data: {
                reference: 'NXR-0123456789abcdef',
                amount_cents: 65000,
                mode: 'test',
                paystack_transaction: '4099260516',
                state: 'pending',
              },
              error: null,
            }
          : {
              data: { holdId: 'x', state: 'refund_due', refundReason: 'customer_cancelled' },
              error: null,
            },
    );
    const answer = await worker({ 'x-cinema-worker-secret': secret });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({ refundsWaiting: 1, refundsFailed: 0 });
    expect(mock.rpc).toHaveBeenCalledWith('cinema_due_work', { p_limit: 50 });
    expect(mock.rpc).toHaveBeenCalledWith('fn_cinema_refund_open', {
      p_hold_id: 'x',
      p_reason: 'customer_cancelled',
    });
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

describe('the customer list of holds', () => {
  const list = (query = '', auth?: string) =>
    holdsGet(
      new Request(`https://nexg.test/api/customer/cinema/holds${query}`, {
        headers: auth ? { authorization: auth } : {},
      }),
    );

  it('needs a signed-in customer', async () => {
    const answer = await list();
    expect(answer.status).toBe(401);
    expect(await answer.json()).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it("reads the customer's own holds with their own token, newest first", async () => {
    mock.getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
    mock.userRpc.mockResolvedValue({
      data: { holds: [{ holdId: 'h2' }, { holdId: 'h1' }], next: null },
      error: null,
    });
    // A plain read: it works without the server's service-role key.
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const answer = await list('', 'Bearer t');
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({
      holds: [{ holdId: 'h2' }, { holdId: 'h1' }],
      next: null,
    });
    expect(mock.userRpc).toHaveBeenCalledWith('rpc_my_cinema_holds', {
      p_limit: 20,
      p_before: null,
      p_before_id: null,
    });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('pages with the cursor the last answer gave', async () => {
    mock.getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
    mock.userRpc.mockResolvedValue({ data: { holds: [], next: null }, error: null });
    const before = '2026-11-25T10:00:00.000Z';
    await list(`?limit=5&before=${encodeURIComponent(before)}&beforeId=${HOLD}`, 'Bearer t');
    expect(mock.userRpc).toHaveBeenCalledWith('rpc_my_cinema_holds', {
      p_limit: 5,
      p_before: before,
      p_before_id: HOLD,
    });
  });

  it('refuses half a cursor or a page too big', async () => {
    expect((await list('?before=2026-11-25T10:00:00Z', 'Bearer t')).status).toBe(422);
    expect((await list('?limit=500', 'Bearer t')).status).toBe(422);
    expect(mock.getUser).not.toHaveBeenCalled();
  });
});
