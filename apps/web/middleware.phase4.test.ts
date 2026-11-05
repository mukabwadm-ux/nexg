import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { middleware } from './middleware';

const sdk = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: sdk.createServerClient }));
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-test-key');
  sdk.createServerClient.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('merchant cookie refresh', () => {
  it.each([
    '/sign-in',
    '/auth/callback?code=public-test-code',
    '/merchants/sign-in',
    '/riders/sign-in',
    '/forgot-password',
    '/reset-password',
  ])(
    'keeps anonymous auth entry public and cookie-bearing responses uncached: %s',
    async (path) => {
      sdk.createServerClient.mockImplementation((_url, _key, options) => ({
        auth: {
          getUser: async () => {
            options.cookies.setAll([
              { name: 'sb-auth', value: '', options: { path: '/', maxAge: 0 } },
            ]);
            return { data: { user: null }, error: null };
          },
        },
      }));
      const response = await middleware(new NextRequest(`https://merchant.test${path}`));
      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      expect(response.headers.get('pragma')).toBe('no-cache');
      expect(response.headers.get('expires')).toBe('0');
      expect(response.headers.get('vary')).toContain('Cookie');
      expect(response.cookies.get('sb-auth')?.value).toBe('');
    },
  );

  it('passes SDK cookie updates to the downstream request and browser, retaining every cookie batch', async () => {
    sdk.createServerClient.mockImplementation((_url, _key, options) => ({
      auth: {
        getUser: async () => {
          options.cookies.setAll([
            { name: 'sb-access', value: 'refreshed', options: { path: '/', httpOnly: true } },
          ]);
          options.cookies.setAll([
            { name: 'sb-refresh', value: 'rotated', options: { path: '/', sameSite: 'lax' } },
          ]);
          return { data: { user: { id: 'user-1' } }, error: null };
        },
      },
    }));
    const response = await middleware(
      new NextRequest('https://merchant.test/merchant/orders', {
        headers: { cookie: 'sb-access=expired; preference=compact' },
      }),
    );
    expect(response.headers.get('x-middleware-request-cookie')).toContain('sb-access=refreshed');
    expect(response.headers.get('x-middleware-request-cookie')).toContain('sb-refresh=rotated');
    expect(response.cookies.get('sb-access')?.value).toBe('refreshed');
    expect(response.cookies.get('sb-refresh')?.value).toBe('rotated');
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });

  it('keeps missing configuration private and leaves authorization to the guarded entry', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const response = await middleware(
      new NextRequest('https://merchant.test/api/merchant/insights'),
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('vary')).toContain('Cookie');
    expect(sdk.createServerClient).not.toHaveBeenCalled();
  });

  it('preserves QR scan payload/cookies and does not count printable card previews', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({
        ok: true,
        session_id: 'qr-session',
        kind: 'merchant',
        label: 'Example',
        qr_id: 'qr-1',
        scan_token: 'signed-context',
      }),
    );
    const response = await middleware(new NextRequest('https://merchant.test/q/NXG-234567'));
    const payload = JSON.parse(
      Buffer.from(response.headers.get('x-middleware-request-x-nxg-scan')!, 'base64').toString(),
    );
    expect(payload).toMatchObject({ ok: true, qr_id: 'qr-1' });
    expect(response.cookies.get('nxg_sid')?.value).toBe('qr-session');
    expect(JSON.parse(response.cookies.get('nxg_ctx')!.value)).toMatchObject({
      scan_token: 'signed-context',
    });
    const preview = await middleware(new NextRequest('https://merchant.test/q/NXG-234567/card'));
    expect(preview.headers.get('x-middleware-next')).toBe('1');
    expect(preview.cookies.getAll()).toEqual([]);
    expect(sdk.createServerClient).not.toHaveBeenCalled();
  });
});
