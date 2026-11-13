import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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

/* The search box needs the app router and a server action; this test is
   about the tab links. */
vi.mock('./merchant-search', () => ({ MerchantSearch: () => <div data-search /> }));

import { MerchantTabs } from './shell';

describe('merchant console navigation', () => {
  it('retains application review and merchant lifecycle sections together', () => {
    const html = renderToStaticMarkup(<MerchantTabs current="applications" />);
    expect(html).toContain('href="/merchants/applications"');
    expect(html).toContain('href="/merchants?tab=deactivated"');
    expect(html).toContain('href="/merchants?tab=deleted"');
    expect(html).toContain('aria-current="page"');
  });
});
