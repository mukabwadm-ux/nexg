import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const HOST = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.app-token.signature';

const tokenClient = {
  auth: { getUser: vi.fn() },
  rpc: vi.fn(async () => ({ data: { kind: 'host', id: HOST, name: 'Acacia Homes' }, error: null })),
  from: vi.fn(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role: 'owner', units: null }, error: null }),
        }),
      }),
    }),
  })),
};
const createTokenClient = vi.fn((..._args: unknown[]) => tokenClient);
const cookieClient = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createTokenClient(...args),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => cookieClient() }));

import { hostWorkspaceAccess, requireWorkspaceOrigin } from './access';

const request = (headers: Record<string, string>) =>
  new Request('https://www.nexgapp.com/api/host-workspace', { method: 'POST', headers });

describe('the phone app sign-in', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    tokenClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'host@example.test', is_anonymous: false } },
      error: null,
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('opens the same workspace from a bearer token, with the anon key and no cookie', async () => {
    const access = await hostWorkspaceAccess(request({ authorization: `Bearer ${TOKEN}` }));
    expect(access).toMatchObject({
      hostId: HOST,
      role: 'Owner',
      unitScope: null,
      userId: 'user-1',
    });
    expect(createTokenClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon',
      expect.objectContaining({
        global: expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } }),
      }),
    );
    expect(tokenClient.auth.getUser).toHaveBeenCalledWith(TOKEN);
    expect(cookieClient).not.toHaveBeenCalled();
  });

  it('refuses a malformed token', async () => {
    await expect(hostWorkspaceAccess(request({ authorization: 'Bearer x' }))).rejects.toMatchObject(
      {
        status: 401,
      },
    );
  });

  it('refuses a token Supabase does not recognise', async () => {
    tokenClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(
      hostWorkspaceAccess(request({ authorization: `Bearer ${TOKEN}` })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('skips the website origin check only for token requests', () => {
    expect(() =>
      requireWorkspaceOrigin(request({ authorization: `Bearer ${TOKEN}` })),
    ).not.toThrow();
    expect(() => requireWorkspaceOrigin(request({ origin: 'https://evil.example' }))).toThrow();
  });
});
