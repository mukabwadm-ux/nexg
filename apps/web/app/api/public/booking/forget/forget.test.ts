import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const mock = vi.hoisted(() => ({ session: vi.fn(), forget: vi.fn() }));
vi.mock('../../../../../lib/booking/app-session', () => ({ appBookingSession: mock.session }));
vi.mock('../../../../../lib/booking/platform', () => ({ forgetEngineCustomer: mock.forget }));

const userId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const shopA = '11111111-1111-4111-8111-111111111111';
const shopB = '22222222-2222-4222-8222-222222222222';

function fakeClient(rows: { merchant_id: string; customer_ref: string | null }[]) {
  const marked: string[] = [];
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ is: vi.fn().mockResolvedValue({ data: rows, error: null }) })),
      update: vi.fn(() => ({
        eq: vi.fn((_: string, merchantId: string) => ({
          is: vi.fn(() => {
            marked.push(merchantId);
            return Promise.resolve({ error: null });
          }),
        })),
      })),
    })),
  };
  return { client, marked };
}

const call = () =>
  POST(
    new Request('https://nexg.test/api/public/booking/forget', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + 'x'.repeat(40) },
    }),
  );

beforeEach(() => {
  mock.session.mockReset();
  mock.forget.mockReset();
});

describe('forget me in the booking engine, before deleting the account', () => {
  it('needs the app sign-in', async () => {
    mock.session.mockResolvedValue({ kind: 'none' });
    expect((await call()).status).toBe(401);
    mock.session.mockResolvedValue({ kind: 'invalid' });
    expect((await call()).status).toBe(401);
    expect(mock.forget).not.toHaveBeenCalled();
  });

  it('asks each business once, and marks only those that answered', async () => {
    const { client, marked } = fakeClient([
      { merchant_id: shopA, customer_ref: `account_${userId}` },
      { merchant_id: shopA, customer_ref: `account_${userId}` },
      { merchant_id: shopB, customer_ref: null },
    ]);
    mock.session.mockResolvedValue({ kind: 'signed_in', userId, anonymous: false, client });
    mock.forget.mockImplementation(async (merchantId: string) =>
      merchantId === shopA ? { ok: true, value: {} } : { ok: false, status: 503, code: 'x' },
    );
    const response = await call();
    expect(await response.json()).toEqual({ forgotten: 1, remaining: 1 });
    expect(mock.forget).toHaveBeenCalledTimes(2);
    expect(mock.forget).toHaveBeenCalledWith(shopA, `account_${userId}`);
    // A row saved before references existed is an account booking.
    expect(mock.forget).toHaveBeenCalledWith(shopB, `account_${userId}`);
    expect(marked).toEqual([shopA]);
  });
});
