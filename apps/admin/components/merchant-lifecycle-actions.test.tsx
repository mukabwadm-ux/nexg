import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { MerchantLifecycleActions } from './merchant-lifecycle-actions';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@nexg/ui', async (actual) => ({
  ...(await actual<typeof import('@nexg/ui')>()),
  useToast: () => ({ toast: vi.fn() }),
}));

const base = {
  merchantId: '20000000-0000-4000-8000-000000000002',
  merchantName: 'New Dummy Solutions',
  status: 'applied',
  isDeactivated: false,
  onDelete: vi.fn(),
};

describe('merchant lifecycle actions', () => {
  it('shows only Delete for an application under review', () => {
    const html = renderToStaticMarkup(<MerchantLifecycleActions {...base} />);
    expect(html).toContain('Delete merchant');
    expect(html).toContain('Type the merchant name to confirm');
    expect(html).not.toContain('Deactivate merchant');
  });

  it('keeps Deactivate and Delete on the merchant record', () => {
    const html = renderToStaticMarkup(
      <MerchantLifecycleActions {...base} onSetDeactivated={vi.fn()} />,
    );
    expect(html).toContain('Merchant access');
    expect(html).toContain('Deactivate merchant');
    expect(html).toContain('Delete merchant');
  });
});
