import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SiteHeader } from './site-header';

vi.mock('@/lib/i18n', () => ({
  getTranslations: async () => ({ locale: 'en', t: (key: string) => key }),
}));
vi.mock('@nexg/location', () => ({
  DeliverToChip: () => <button type="button">Deliver to</button>,
}));
vi.mock('./notifications/bell', () => ({ NotificationBell: () => null }));
vi.mock('./theme/theme', () => ({
  ThemeToggle: () => <button type="button">Switch theme</button>,
}));
vi.mock('./site-menu', () => ({
  SiteMenu: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./logo', () => ({ Logo: () => <span>NexG Concierge</span> }));

describe('SiteHeader', () => {
  it('has the account icon on every page by default', async () => {
    const html = renderToStaticMarkup(await SiteHeader({}));
    expect(html).toContain('aria-label="Your account"');
    expect(html).toContain('href="/account"');
  });

  it('leaves the account icon out for Discovery and keeps the rest of the header', async () => {
    const html = renderToStaticMarkup(await SiteHeader({ account: false }));
    expect(html).not.toContain('Your account');
    expect(html).not.toContain('href="/account"');
    expect(html).toContain('aria-label="NexG Concierge, home"');
    expect(html).toContain('Deliver to');
    expect(html).toContain('Switch theme');
    expect(html).toContain('aria-label="Open menu"');
  });
});
