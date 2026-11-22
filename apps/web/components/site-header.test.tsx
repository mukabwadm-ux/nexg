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
vi.mock('@/components/preferences/preferences-picker', () => ({
  PreferencesPicker: ({ labels }: { labels: { button: string } }) => (
    <button type="button" aria-label={labels.button}>
      EN · KES
    </button>
  ),
}));
vi.mock('./logo', () => ({ Logo: () => <span>NexG Concierge</span> }));
/* The account button reads the session in the browser; signed out it is the plain link. */
vi.mock('@/app/(customer)/sign-in/actions', () => ({ signOut: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));

describe('SiteHeader', () => {
  it('has the account icon on every page by default', async () => {
    const html = renderToStaticMarkup(await SiteHeader({}));
    expect(html).toContain('aria-label="Your account"');
    expect(html).toContain('href="/account"');
  });

  it('can leave the account icon out and keeps the rest of the header', async () => {
    const html = renderToStaticMarkup(await SiteHeader({ account: false }));
    expect(html).not.toContain('Your account');
    expect(html).not.toContain('href="/account"');
    expect(html).toContain('aria-label="NexG Concierge, home"');
    expect(html).toContain('Deliver to');
    expect(html).toContain('Switch theme');
    expect(html).toContain('aria-label="Open menu"');
    expect(html).toContain('aria-label="prefs.button"');
  });
});
