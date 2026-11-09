import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import Registration from '../app/(customer)/merchants/register/page';
import ApplyIndex from '../app/(customer)/merchants/apply/page';
import { merchantSessionSignInHref } from './merchant-journey-navigation';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}));
vi.mock('@/components/onboarding/connected-application', () => ({
  ConnectedApplication: (props: {
    actorId: string;
    home?: boolean;
    anonymousSession?: boolean;
    emailOtpEnabled?: boolean;
  }) => (
    <div
      data-connected-registration={props.actorId}
      data-home={String(props.home ?? false)}
      data-anonymous={String(props.anonymousSession ?? false)}
      data-otp={String(props.emailOtpEnabled ?? false)}
    >
      Real registration
    </div>
  ),
}));
vi.mock('@/components/onboarding/application-session-bootstrap', () => ({
  ApplicationSessionBootstrap: () => <div data-session-bootstrap="true">Secure session</div>,
}));
vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
  notFound: () => {
    throw new Error('not-found');
  },
}));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const actorId = '0194b62d-4ff0-7b09-8519-d7597b8312b1';
beforeEach(() => {
  vi.stubEnv('MERCHANT_ONBOARDING_V1_ENABLED', 'true');
  mocks.getUser.mockReset();
  mocks.rpc.mockReset();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: actorId, is_anonymous: false } },
    error: null,
  });
  mocks.rpc.mockResolvedValue({ data: { kind: 'guest', home: '/' }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe('real onboarding entry and resume', () => {
  it('treats malformed existing ownership as unavailable rather than a new account', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const html = renderToStaticMarkup(await Registration({ searchParams: {} }));
    expect(html).toContain('Refresh before starting another registration');
    expect(html).not.toContain('data-connected-registration');
  });
  it('returns an expired registrant to onboarding and an owner to Home after sign-in', () => {
    const registration = new URL(merchantSessionSignInHref(false), 'https://nexg.example');
    const home = new URL(merchantSessionSignInHref(true), 'https://nexg.example');
    expect(registration.pathname).toBe('/merchants/sign-in');
    expect(registration.searchParams.get('next')).toBe('/merchants/register');
    expect(home.searchParams.get('next')).toBe('/merchant');
    expect([...registration.searchParams.keys()].sort()).toEqual(['next', 'reason']);
  });
  it('keeps onboarding demo available without enabling connected writes', async () => {
    vi.stubEnv('MERCHANT_ONBOARDING_V1_ENABLED', 'false');
    const html = renderToStaticMarkup(await Registration({ searchParams: {} }));
    expect(html).toContain('Real registration is temporarily unavailable');
    expect(html).toContain('/merchant-live-preview?state=setup');
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it('uses connected registration and inline email verification when flags are unset', async () => {
    vi.stubEnv('MERCHANT_ONBOARDING_V1_ENABLED', '');
    vi.stubEnv('MERCHANT_EMAIL_OTP_ENABLED', '');
    const html = renderToStaticMarkup(await Registration({ searchParams: {} }));
    expect(html).toContain(`data-connected-registration="${actorId}"`);
    expect(html).toContain('data-otp="true"');
  });
  it('prepares a secure session before showing the existing form to an unsigned visitor', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError' },
    });
    const html = renderToStaticMarkup(await Registration({ searchParams: {} }));
    expect(html).toContain('data-session-bootstrap="true"');
    expect(html).toContain('/merchant-live-preview?state=setup');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('resumes an existing owned workspace instead of starting a second registration', async () => {
    mocks.rpc.mockResolvedValue({
      data: { kind: 'merchant', id: '0194b62d-4ff0-7b09-8519-d7597b8312bf' },
      error: null,
    });
    await expect(Registration({ searchParams: {} })).rejects.toThrow('redirect:/merchant');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('shows the real authenticated form for a new account', async () => {
    const html = renderToStaticMarkup(await Registration({ searchParams: {} }));
    expect(html).toContain(`data-connected-registration="${actorId}"`);
    expect(html).toContain('data-home="false"');
    expect(html).not.toContain('Demo business');
  });
  it('shows the same connected form for an anonymous intake session', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: actorId, is_anonymous: true } },
      error: null,
    });
    const html = renderToStaticMarkup(await Registration({ searchParams: {} }));
    expect(html).toContain(`data-connected-registration="${actorId}"`);
    expect(html).toContain('data-anonymous="true"');
  });
  it('routes the canonical apply entry to the connected form with default flags', async () => {
    vi.stubEnv('MERCHANT_ONBOARDING_V1_ENABLED', '');
    await expect(ApplyIndex({ searchParams: { city: 'nairobi' } })).rejects.toThrow(
      'redirect:/merchants/register?city=nairobi',
    );
  });
  it('does not create an empty registration when existing ownership cannot be checked', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'service_unavailable' } });
    const html = renderToStaticMarkup(await Registration({ searchParams: {} }));
    expect(html).toContain('Refresh before starting another registration');
    expect(html).not.toContain('data-connected-registration');
  });
});
