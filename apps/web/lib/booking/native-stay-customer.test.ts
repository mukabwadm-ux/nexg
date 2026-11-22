import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), createClient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
import { resolveVerifiedStayCustomer } from './native-stay-customer';
const user = {
  id: '01a12345-168a-4456-8b79-000000000001',
  email: 'guest@example.test',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  user_metadata: { full_name: 'Fixture Guest' },
};
const request = () =>
  new Request('https://fixture.test', { headers: { Authorization: 'Bearer synthetic-token' } });
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://auth.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-only');
  mocks.createClient.mockReset().mockReturnValue({ auth: { getUser: mocks.getUser } });
  mocks.getUser.mockReset().mockResolvedValue({ data: { user }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
test('verifies bearer subject server-side and exports exactly one confirmed contact', async () => {
  expect(await resolveVerifiedStayCustomer(request())).toEqual({
    ok: true,
    userId: user.id,
    contact: { name: 'Fixture Guest', email: user.email },
  });
  expect(mocks.getUser).toHaveBeenCalledWith('synthetic-token');
  expect(mocks.createClient.mock.calls[0]?.[2].auth.persistSession).toBe(false);
});
test('missing bearer does not call Auth', async () => {
  expect(await resolveVerifiedStayCustomer(new Request('https://fixture.test'))).toEqual({
    ok: false,
    reason: 'sign_in',
  });
  expect(mocks.createClient).not.toHaveBeenCalled();
});
test('anonymous users, unverified contacts and malformed proof never create fallback identities', async () => {
  for (const patch of [{ is_anonymous: true }, { id: 'guest-cookie' }]) {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { ...user, ...patch } }, error: null });
    expect(await resolveVerifiedStayCustomer(request())).toEqual({ ok: false, reason: 'sign_in' });
  }
  for (const patch of [
    { email_confirmed_at: undefined },
    { email_confirmed_at: 'not-a-date' },
    { user_metadata: { full_name: 'Bad\nName' } },
  ]) {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { ...user, ...patch } }, error: null });
    expect(await resolveVerifiedStayCustomer(request())).toEqual({
      ok: false,
      reason: 'profile_required',
    });
  }
});
test('auth outage stays unavailable instead of synthesizing a guest', async () => {
  mocks.getUser.mockRejectedValueOnce(new Error('Auth unavailable'));
  expect(await resolveVerifiedStayCustomer(request())).toEqual({
    ok: false,
    reason: 'unavailable',
  });
});
