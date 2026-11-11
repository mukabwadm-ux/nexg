import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { middleware } from './middleware';
import {
  STAFF_IDLE_TIMEOUT_MS,
  STAFF_SEEN_COOKIE,
  STAFF_SEEN_MAX_AGE_S,
  readStaffSeen,
  writeStaffSeen,
} from './lib/idle';

const sdk = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: sdk.createServerClient }));

const SIGN_IN = '7a9c1e2f-3b4d-4c5e-8f60-112233445566';
const EARLIER = '0f1e2d3c-4b5a-4968-8776-665544332211';

/** A staff member signed in under this session id. */
function signedIn(sessionId: string) {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const accessToken = `${part({ alg: 'HS256' })}.${part({ sub: 'fixture-actor', session_id: sessionId })}.sig`;
  sdk.createServerClient.mockReturnValue({
    auth: {
      getUser: async () => ({ data: { user: { id: 'fixture-actor' } } }),
      getSession: async () => ({ data: { session: { access_token: accessToken } } }),
    },
  });
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-fixture-key');
  sdk.createServerClient.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const request = (path: string, cookie?: string) =>
  new NextRequest(`https://console.test${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
function expectPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(response.headers.get('cdn-cache-control')).toBe('no-store');
  expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
  expect(response.headers.get('vary')).toContain('Cookie');
  expect(response.headers.get('expires')).toBe('0');
}

describe('staff application review middleware', () => {
  it('keeps anonymous API responses private and leaves Problem Details authentication to the handler', async () => {
    const response = await middleware(request('/api/merchant-applications/review'));
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expectPrivate(response);
    expect(sdk.createServerClient).not.toHaveBeenCalled();
  });

  it('keeps a rejected session on the API instead of redirecting a POST to HTML', async () => {
    sdk.createServerClient.mockReturnValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    });
    const response = await middleware(
      request('/api/merchant-applications/review', 'sb-example-auth-token=expired'),
    );
    expect(response.headers.get('location')).toBeNull();
    expectPrivate(response);
  });

  it('preserves multiple SDK cookie batches on both the next request and sign-in redirects', async () => {
    sdk.createServerClient.mockImplementation((_url, _key, options) => ({
      auth: {
        getUser: async () => {
          options.cookies.setAll([
            {
              name: 'sb-example-auth-token',
              value: 'refreshed',
              options: { path: '/', httpOnly: true },
            },
          ]);
          options.cookies.setAll([
            {
              name: 'sb-example-auth-token.1',
              value: 'second',
              options: { path: '/', httpOnly: true },
            },
          ]);
          return { data: { user: { id: 'fixture-actor' } } };
        },
      },
    }));
    const response = await middleware(request('/sign-in', 'sb-example-auth-token=old'));
    expect(response.headers.get('location')).toBe('https://console.test/');
    expect(response.cookies.get('sb-example-auth-token')?.value).toBe('refreshed');
    expect(response.cookies.get('sb-example-auth-token.1')?.value).toBe('second');
    expectPrivate(response);
  });

  it('returns an idle API session as 401 Problem Details and clears refreshed and incoming cookies', async () => {
    signedIn(SIGN_IN);
    const idle = Date.now() - STAFF_IDLE_TIMEOUT_MS - 100;
    const response = await middleware(
      request(
        '/api/merchant-applications/review',
        `sb-example-auth-token=old; ${STAFF_SEEN_COOKIE}=${writeStaffSeen(SIGN_IN, idle)}`,
      ),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect((await response.json()).code).toBe('session_expired');
    expect(response.cookies.get('sb-example-auth-token')?.maxAge).toBe(0);
    expect(response.cookies.get(STAFF_SEEN_COOKIE)?.maxAge).toBe(0);
    expectPrivate(response);
  });

  it('signs out a console session idle for thirty minutes, not only between five and ten', async () => {
    signedIn(SIGN_IN);
    const idle = Date.now() - 30 * 60 * 1000;
    const response = await middleware(
      request(
        '/orders',
        `sb-example-auth-token=old; ${STAFF_SEEN_COOKIE}=${writeStaffSeen(SIGN_IN, idle)}`,
      ),
    );
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).searchParams.get('idle')).toBe('1');
    expect(response.cookies.get('sb-example-auth-token')?.maxAge).toBe(0);
  });

  it('lets a new sign-in through a stale stamp left by an earlier session, and stamps it afresh', async () => {
    signedIn(SIGN_IN);
    const stale = Date.now() - 24 * 60 * 60 * 1000;
    const response = await middleware(
      request(
        '/orders',
        `sb-example-auth-token=new; ${STAFF_SEEN_COOKIE}=${writeStaffSeen(EARLIER, stale)}`,
      ),
    );
    expect(response.headers.get('location')).toBeNull();
    const stamp = readStaffSeen(response.cookies.get(STAFF_SEEN_COOKIE)?.value);
    expect(stamp?.session).toBe(SIGN_IN);
    expect(Date.now() - (stamp?.seen ?? 0)).toBeLessThan(5_000);
  });

  it('keeps the stamp for as long as the sign-in, so it cannot expire into "never seen"', async () => {
    signedIn(SIGN_IN);
    const response = await middleware(request('/orders', 'sb-example-auth-token=fresh'));
    expect(response.cookies.get(STAFF_SEEN_COOKIE)?.maxAge).toBe(STAFF_SEEN_MAX_AGE_S);
  });

  it('bounds an unresponsive session lookup before a review command reaches its handler', async () => {
    vi.useFakeTimers();
    sdk.createServerClient.mockReturnValue({ auth: { getUser: () => new Promise(() => {}) } });
    const pending = middleware(
      request('/api/merchant-applications/review', 'sb-example-auth-token=old'),
    );
    await vi.advanceTimersByTimeAsync(8000);
    const response = await pending;
    expect(response.status).toBe(504);
    expect((await response.json()).code).toBe('session_timeout');
    expectPrivate(response);
  });

  it('keeps a private sign-in redirect for a protected application detail', async () => {
    const response = await middleware(request('/merchants/applications/fixture'));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).searchParams.get('next')).toBe(
      '/merchants/applications/fixture',
    );
    expectPrivate(response);
  });
});
