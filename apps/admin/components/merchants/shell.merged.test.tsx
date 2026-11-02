import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) =>
    <a href={href} {...props}>{children}</a>,
}));

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
