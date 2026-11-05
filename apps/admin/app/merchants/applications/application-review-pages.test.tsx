import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LegacyMerchantPage from '../[id]/page';
import MerchantsPage from '../page';

const ports = vi.hoisted(() => ({ managed: vi.fn(), client: vi.fn() }));
vi.mock('@/lib/staff', () => ({
  requireStaff: async () => ({ displayName: 'Fixture reviewer' }),
  requireModule: () => undefined,
}));
vi.mock('@/lib/merchant-application-review', () => ({
  isManagedMerchantApplication: ports.managed,
  ReviewSourceError: class extends Error {
    status = 503;
  },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: ports.client }));
vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
  notFound: () => {
    throw new Error('not found');
  },
  useRouter: () => ({ refresh: () => undefined }),
}));
vi.mock('@/components/console-shell', () => ({
  ConsoleShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/console-header', () => ({
  ConsoleHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/app/merchants/actions', () => ({
  goLive: vi.fn(),
  rejectDocument: vi.fn(),
  verifyDocument: vi.fn(),
}));
vi.mock('@/app/documents/actions', () => ({ fileDocumentFor: vi.fn(), remindToUpload: vi.fn() }));
vi.mock('@/app/featured/actions', () => ({
  sendFeaturedPitch: vi.fn(),
  unfeatureMerchant: vi.fn(),
}));

const merchantId = '20000000-0000-4000-8000-000000000002';
beforeEach(() => {
  ports.managed.mockReset();
  ports.client.mockReset();
});

describe('managed application entry pages', () => {
  it('redirects a managed legacy detail before reading legacy financial, document, or featured facts', async () => {
    ports.managed.mockResolvedValue(true);
    ports.client.mockImplementation(() => {
      throw new Error('A legacy read must not start');
    });
    await expect(LegacyMerchantPage({ params: { id: merchantId } })).rejects.toThrow(
      `redirect:/merchants/applications/${merchantId}`,
    );
    expect(ports.managed.mock.calls[0]).toEqual([merchantId]);
    expect(ports.client.mock.calls).toHaveLength(0);
  });

  it('fails closed when the managed lookup is unavailable instead of falling back to legacy reads', async () => {
    ports.managed.mockRejectedValue(new Error('private infrastructure exception'));
    ports.client.mockImplementation(() => {
      throw new Error('A legacy read must not start');
    });
    const html = renderToStaticMarkup(await LegacyMerchantPage({ params: { id: merchantId } }));
    expect(html).toContain('The current application source is unavailable');
    expect(html).not.toContain('private infrastructure exception');
    expect(html).not.toContain('Take live');
    expect(ports.client.mock.calls).toHaveLength(0);
  });

  it('routes the Applications tab before loading the legacy directory', async () => {
    ports.client.mockImplementation(() => {
      throw new Error('A directory read must not start');
    });
    await expect(MerchantsPage({ searchParams: { tab: 'applications' } })).rejects.toThrow(
      'redirect:/merchants/applications',
    );
    expect(ports.client.mock.calls).toHaveLength(0);
  });
});
