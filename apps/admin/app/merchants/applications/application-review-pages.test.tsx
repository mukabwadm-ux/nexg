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
  /** A client whose only permitted read is the application's review state. */
  function applicationOnlyClient(reviewState: string | null) {
    const tables: string[] = [];
    return {
      tables,
      client: {
        from(table: string) {
          tables.push(table);
          if (table !== 'merchant_application') throw new Error('A legacy read must not start');
          const query = {
            select: () => query,
            eq: () => query,
            maybeSingle: async () => ({
              data: reviewState ? { review_state: reviewState } : null,
              error: null,
            }),
          };
          return query;
        },
        rpc() {
          throw new Error('A legacy read must not start');
        },
      },
    };
  }

  it('redirects an unapproved managed application before reading legacy financial, document, or featured facts', async () => {
    ports.managed.mockResolvedValue(true);
    const fake = applicationOnlyClient('pending');
    ports.client.mockReturnValue(fake.client);
    await expect(LegacyMerchantPage({ params: { id: merchantId } })).rejects.toThrow(
      `redirect:/merchants/applications/${merchantId}`,
    );
    expect(ports.managed.mock.calls[0]).toEqual([merchantId]);
    expect(fake.tables).toEqual(['merchant_application']);
  });

  it('opens the full merchant record once the managed application is approved', async () => {
    ports.managed.mockResolvedValue(true);
    const fake = applicationOnlyClient('approved');
    ports.client.mockReturnValue(fake.client);
    // Past the redirect gate the page reads the merchant itself.
    await expect(LegacyMerchantPage({ params: { id: merchantId } })).rejects.toThrow(
      'A legacy read must not start',
    );
    expect(fake.tables).toEqual(['merchant_application', 'merchant']);
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
