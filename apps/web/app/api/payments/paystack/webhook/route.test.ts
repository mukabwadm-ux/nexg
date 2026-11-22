import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/public', () => ({ createPublicClient: () => ({ rpc }) }));

import { POST } from './route';

const TEST = 'sk_test_ci_only_0123456789';
const body = '{"event":"charge.success","data":{"reference":"NXP-1-1","amount":150000}}';
const sign = (raw: string, key = TEST) =>
  crypto.createHmac('sha512', key).update(raw).digest('hex');

function call(raw: string, signature: string | null) {
  return POST(
    new Request('https://www.nexgapp.com/api/payments/paystack/webhook', {
      method: 'POST',
      headers: signature ? { 'x-paystack-signature': signature } : {},
      body: raw,
    }),
  );
}

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: { ok: true, state: 'paid' }, error: null });
  vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', TEST);
});
afterEach(() => vi.unstubAllEnvs());

describe('Paystack webhook', () => {
  it('passes a correctly signed body to the database, byte for byte', async () => {
    const response = await call(body, sign(body));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('rpc_payment_paystack_webhook', {
      p_raw_body: body,
      p_signature: sign(body),
    });
  });

  it('refuses a forged or missing signature without touching the database', async () => {
    expect((await call(body, sign(body, 'sk_test_someone_else'))).status).toBe(401);
    expect((await call(body, null)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('asks Paystack to retry when no key is set or the database fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    expect((await call(body, sign(body))).status).toBe(500);
    vi.stubEnv('PAYSTACK_TEST_SECRET_KEY', '');
    expect((await call(body, sign(body))).status).toBe(503);
  });
});
