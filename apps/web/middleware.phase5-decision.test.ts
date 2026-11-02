import { getMiddlewareMatchers } from 'next/dist/build/analysis/get-page-static-info';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config, middleware } from './middleware';

const sdk = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: sdk.createServerClient }));

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-test-key');
  sdk.createServerClient.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('decision recovery session middleware', () => {
  it.each(['/merchants/decision', '/merchants/decision/check'])('matches and refreshes the protected decision route: %s', async path => {
    const matchers = getMiddlewareMatchers(config.matcher, {});
    expect(matchers.some(matcher => new RegExp(matcher.regexp).test(path))).toBe(true);
    expect(matchers.some(matcher => new RegExp(matcher.regexp).test('/merchants/decisionary'))).toBe(false);
    sdk.createServerClient.mockImplementation((_url, _key, options) => ({ auth: { getUser: async () => {
      options.cookies.setAll([{ name: 'sb-access', value: 'refreshed', options: { path: '/', httpOnly: true } }]);
      options.cookies.setAll([{ name: 'sb-refresh', value: 'rotated', options: { path: '/', sameSite: 'lax' } }]);
      return { data: { user: { id: 'user-1' } }, error: null };
    } } }));
    const response = await middleware(new NextRequest(`https://merchant.test${path}`, {
      headers: { cookie: 'sb-access=expired' },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('x-middleware-request-cookie')).toContain('sb-access=refreshed');
    expect(response.headers.get('x-middleware-request-cookie')).toContain('sb-refresh=rotated');
    expect(response.cookies.get('sb-access')?.value).toBe('refreshed');
    expect(response.cookies.get('sb-refresh')?.value).toBe('rotated');
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('vary')).toContain('Cookie');
    expect(response.headers.get('location')).toBeNull();
  });

  it('leaves authentication to the decision page while retaining a private response without configuration', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const response = await middleware(new NextRequest('https://merchant.test/merchants/decision'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('vary')).toContain('Cookie');
    expect(response.headers.get('location')).toBeNull();
    expect(sdk.createServerClient).not.toHaveBeenCalled();
  });
});
