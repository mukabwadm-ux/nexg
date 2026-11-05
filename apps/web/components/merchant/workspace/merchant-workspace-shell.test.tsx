import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/merchant' }));
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ prefetch: () => undefined }),
}));
vi.mock('next/link', () => ({
  default: ({ prefetch, ...props }: Record<string, unknown>) =>
    createElement('a', {
      ...props,
      'data-prefetch': prefetch === false ? 'false' : undefined,
    }),
}));

import { MerchantLivePreviewShell } from '../live-preview-shell';
import { MerchantWorkspaceShell, type MerchantWorkspaceNavItem } from './merchant-workspace-shell';
import { safeMerchantWorkspaceHref } from './workspace-href';

const pendingNav: MerchantWorkspaceNavItem[] = [
  { label: 'Home', href: '/merchant' },
  { label: 'Work', href: '/merchant/orders', locked: true },
  { label: 'Offerings', href: '/merchant/menu', locked: true },
];

function renderShell(nav = pendingNav, setupDestinations: readonly string[] = []) {
  return renderToStaticMarkup(
    <MerchantWorkspaceShell
      businessName="Acacia Kitchen"
      nav={nav}
      setupDestinations={setupDestinations}
      approvalLabel="Waiting for admin approval"
      headerEnd={<button>Account and sign out</button>}
    >
      <p>Saved setup record</p>
    </MerchantWorkspaceShell>,
  );
}

describe('managed real workspace shell', () => {
  beforeEach(() => {
    route.pathname = '/merchant';
  });

  it('keeps saved Home and account controls visible, with button-only locked destinations', () => {
    const html = renderShell();
    expect(html).toContain('Saved setup record');
    expect(html).toContain('Account and sign out');
    expect(html).toContain('Real workspace');
    expect(html).toContain('aria-label="Work, approval required"');
    expect(html).not.toContain('href="/merchant/orders"');
    expect(html).not.toContain('/merchant-live-preview');
    expect(html).not.toContain('Exit demo');
  });

  it('renders a lock instead of the child tree for a locked direct destination', () => {
    route.pathname = '/merchant/orders';
    const html = renderShell();
    expect(html).toContain('id="workspace-approval-title">Waiting for admin approval');
    expect(html).toContain('Work will be available');
    expect(html).toContain('Back to Home');
    expect(html).not.toContain('Saved setup record');
    route.pathname = '/merchant';
    expect(renderShell()).toContain('Saved setup record');
  });

  it.each([
    ['Offerings', '/merchant/menu'],
    ['Business', '/merchant/stores'],
    ['Availability', '/merchant/hours'],
  ] as const)(
    'renders the server-authorized %s setup editor while keeping its navigation locked',
    (label, href) => {
      route.pathname = href;
      const nav: MerchantWorkspaceNavItem[] = [
        { label: 'Home', href: '/merchant' },
        { label, href, locked: true },
      ];
      expect(renderShell(nav)).toContain('id="workspace-approval-title"');
      const html = renderShell(nav, [href]);
      expect(html).toContain('Saved setup record');
      expect(html).toContain(`aria-label="${label}, approval required"`);
      expect(html).not.toContain(`href="${href}"`);
      expect(html).not.toContain('id="workspace-approval-title"');
    },
  );

  it('does not extend a setup exception to nested paths, unsafe URLs or another operational section', () => {
    route.pathname = '/merchant/menu';
    expect(renderShell(pendingNav, ['/merchant/menu'])).toContain('Saved setup record');
    for (const destination of [
      'https://example.invalid/merchant/menu',
      '/merchant/menu?setup=true',
      '/merchant/menu/../menu',
    ]) {
      expect(renderShell(pendingNav, [destination])).toContain('id="workspace-approval-title"');
    }
    route.pathname = '/merchant/menu/nested';
    expect(renderShell(pendingNav, ['/merchant/menu'])).toContain('id="workspace-approval-title"');
    route.pathname = '/merchant/orders';
    expect(renderShell(pendingNav, ['/merchant/menu'])).toContain('Work will be available');
  });

  it('uses server-approved actual destinations without prefetch or activation controls', () => {
    const html = renderShell(pendingNav.map((item) => ({ ...item, locked: false })));
    expect(html).toMatch(/href="\/merchant\/orders"[^>]*data-prefetch="false"/);
    expect(html).toMatch(/href="\/merchant\/menu"[^>]*data-prefetch="false"/);
    expect(html).toContain('Saved setup record');
    expect(html).not.toContain('Accepting work');
    expect(html).not.toContain('Go live');
  });

  it('never turns an unsafe server destination into a navigation link', () => {
    const html = renderShell([
      { label: 'Home', href: '/merchant' },
      { label: 'Business', href: 'https://example.invalid/merchant' },
    ]);
    expect(html).toContain('href="/merchant"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('example.invalid');
  });
});

describe('demo workspace shell', () => {
  it('labels sample data and exits to onboarding without an authenticated portal link', () => {
    route.pathname = '/merchant-live-preview';
    const html = renderToStaticMarkup(
      <MerchantLivePreviewShell active="Home">
        <p>Explicit sample Home</p>
      </MerchantLivePreviewShell>,
    );
    expect(html).toContain('Demo · sample data');
    expect(html).toContain('href="/merchants/register">Exit demo</a>');
    expect(html).toContain('Explicit sample Home');
    expect(html).not.toContain('href="/merchant"');
    expect(html).not.toContain('merchantId=');
  });
});

describe('workspace route validation', () => {
  it.each(['/merchant', '/merchant/orders', '/merchant/menu', '/merchant/stores/new'])(
    'keeps %s',
    (value) => {
      expect(safeMerchantWorkspaceHref(value)).toBe(value);
    },
  );
  it.each([
    'https://example.invalid/merchant',
    '//example.invalid/merchant',
    'javascript:alert(1)',
    '/merchant-live-preview',
    '/merchants/register',
    '/merchant/../admin',
    '/merchant/%2e%2e/admin',
    '/merchant\\orders',
    '/merchant?merchantId=private',
    '/merchant/orders#private',
    '/merchant//orders',
  ])('rejects %s while retaining the real Home destination', (value) => {
    expect(safeMerchantWorkspaceHref(value)).toBeNull();
    expect(safeMerchantWorkspaceHref('/merchant')).toBe('/merchant');
  });
});
