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
  ConnectedApplication: (props: { actorId: string; home?: boolean; anonymousSession?: boolean; initialRecord?: { merchant_id: string } }) => (
    <div data-connected-registration={props.actorId} data-home={String(props.home ?? false)} data-anonymous={String(props.anonymousSession ?? false)} data-application={props.initialRecord?.merchant_id ?? 'new'}>
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
    prefetch,
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
const merchantId = '0194b62d-4ff0-7b09-8519-d7597b8312bf';
const savedApplication = {
  merchant_id: merchantId,
  revision: 1,
  payload: {
    registryRevision: 'nexg-booking-2026-10-31.1',
    business: { name: 'Maua Cafe', firstName: 'Amina', lastName: 'Owino', email: 'amina@example.test',
      phone: '+254712345678', branchCount: 1, registered: true, sameBusinessPhone: true,
      businessPhone: '', marketing: false },
    categoryId: 'restaurants_food', subcategories: ['cafe'], answersBySubcategory: {}, policies: { terms: true },
  },
  review: { state: 'pending', submitted_revision: 1, submitted_at: '2026-11-02T10:00:00Z', needs_resubmission: false },
  access: { state: 'pending', setup: true, operations: false },
  publication: { status: 'applied' },
};
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
  it('opens fresh registration without depending on a workspace lookup', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const html = renderToStaticMarkup(await Registration({ searchParams: {} }));
    expect(html).toContain('data-application="new"');
    expect(html).toContain('data-home="false"');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('returns an expired registrant to onboarding and an owner to Home after sign-in', () => {
    const registration = new URL(merchantSessionSignInHref(false), 'https://nexg.example');
    const home = new URL(merchantSessionSignInHref(true), 'https://nexg.example');
    expect(registration.pathname).toBe('/sign-in');
    expect(registration.searchParams.get('next')).toBe('/merchants/register');
    expect(home.searchParams.get('next')).toBe('/merchant');
    expect([...registration.searchParams.keys()].sort()).toEqual(['next', 'reason', 'role']);
    expect(registration.searchParams.get('role')).toBe('merchant');
  });
  it('keeps onboarding demo available without enabling connected writes', async () => {
    vi.stubEnv('MERCHANT_ONBOARDING_V1_ENABLED', 'false');
    const html = renderToStaticMarkup(await Registration({ searchParams: {} }));
    expect(html).toContain('Real registration is temporarily unavailable');
    expect(html).toContain('/merchant-live-preview?state=setup');
    expect(mocks.getUser).not.toHaveBeenCalled();
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
  it('opens a saved short form only through its explicit resume link', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'fn_partner_home') return { data: { kind: 'merchant', id: merchantId }, error: null };
      if (name === 'rpc_merchant_application_payout_read') return {
        data: { merchant_id: merchantId, version: 0, payout: null, verification: 'declared' }, error: null,
      };
      return { data: savedApplication, error: null };
    });
    const html = renderToStaticMarkup(await Registration({ searchParams: { merchantId } }));
    expect(html).toContain('data-home="false"');
    expect(html).toContain(`data-application="${merchantId}"`);
    expect(mocks.rpc).toHaveBeenCalledWith('rpc_merchant_application_read', { p_merchant_id: merchantId });
    expect(mocks.rpc).not.toHaveBeenCalledWith('rpc_merchant_application_start', expect.anything());
    expect(mocks.rpc).not.toHaveBeenCalledWith('fn_partner_home');
  });
  it('opens the short form when an older workspace has no short-form application', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { kind: 'merchant', id: merchantId }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'P0002' } });
    const html = renderToStaticMarkup(await Registration({ searchParams: {} }));
    expect(html).toContain('data-home="false"');
    expect(html).toContain('data-application="new"');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('preserves an existing application when its read fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'service_unavailable' } });
    const html = renderToStaticMarkup(await Registration({ searchParams: { merchantId } }));
    expect(html).toContain('Your saved data has not been replaced');
    expect(html).not.toContain('data-connected-registration');
  });
  it('does not turn a missing explicit application into a new registration', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0002' } });
    const html = renderToStaticMarkup(await Registration({ searchParams: { merchantId } }));
    expect(html).toContain('Your saved data has not been replaced');
    expect(html).not.toContain('data-connected-registration');
    expect(mocks.rpc).not.toHaveBeenCalledWith('fn_partner_home');
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
  it('routes the old apply entry to the same short form when the rollout is enabled', async () => {
    await expect(ApplyIndex({ searchParams: { city: 'nairobi' } })).rejects.toThrow(
      'redirect:/merchants/register?city=nairobi',
    );
  });
  it('shows the public form even when an unrelated workspace lookup would fail', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'service_unavailable' } });
    const html = renderToStaticMarkup(await Registration({ searchParams: {} }));
    expect(html).toContain('data-application="new"');
    expect(html).toContain('data-home="false"');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
