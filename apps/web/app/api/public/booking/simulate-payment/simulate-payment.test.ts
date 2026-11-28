import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const mock = vi.hoisted(() => ({
  session: vi.fn(),
  token: vi.fn(),
  simulate: vi.fn(),
  finish: vi.fn(),
}));
vi.mock('../../../../../lib/booking/app-session', () => ({
  appBookingSession: mock.session,
  savedCustomerToken: mock.token,
}));
vi.mock('../../../../../lib/booking/platform', () => ({
  simulateEngineBookingPayment: mock.simulate,
  finishReviewBooking: mock.finish,
}));

const merchantId = '12345678-1234-4234-8234-123456789abc';
const call = (body: unknown = { merchantId, bookingId: 'bk1' }) =>
  POST(
    new Request('https://nexg.test/api/public/booking/simulate-payment', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + 'x'.repeat(40), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  for (const fn of Object.values(mock)) fn.mockReset();
  vi.stubEnv('NEXG_SIMULATED_PAYMENTS', '1');
  mock.session.mockResolvedValue({ kind: 'signed_in', userId: 'u', anonymous: true, client: {} });
  mock.token.mockResolvedValue('t'.repeat(43));
  mock.finish.mockResolvedValue({ ok: false, status: 422, code: 'not_a_review_shop' });
});
afterEach(() => vi.unstubAllEnvs());

describe('test payments for app bookings', () => {
  it('is off unless switched on', async () => {
    vi.stubEnv('NEXG_SIMULATED_PAYMENTS', '');
    expect((await call()).status).toBe(404);
    expect(mock.simulate).not.toHaveBeenCalled();
  });

  it("needs the app sign-in and the customer's own booking", async () => {
    mock.session.mockResolvedValue({ kind: 'none' });
    expect((await call()).status).toBe(401);
    mock.session.mockResolvedValue({ kind: 'signed_in', userId: 'u', anonymous: true, client: {} });
    mock.token.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect((await call({ merchantId, bookingId: 'bad id!' })).status).toBe(422);
    expect(mock.simulate).not.toHaveBeenCalled();
  });

  it('confirms the booking with a test payment', async () => {
    mock.simulate.mockResolvedValue({
      ok: true,
      value: { status: 'confirmed', paymentState: 'simulated' },
    });
    const response = await call();
    expect(await response.json()).toEqual({
      ok: true,
      simulated: true,
      status: 'confirmed',
      paymentState: 'simulated',
    });
    expect(mock.simulate).toHaveBeenCalledWith(merchantId, 'bk1');
  });

  it('says when the hold ran out', async () => {
    mock.simulate.mockResolvedValue({ ok: false, status: 409, code: 'hold_expired' });
    const response = await call();
    expect(response.status).toBe(409);
    expect((await response.json()).detail).toBe('The hold ran out. Book again.');
  });
});
