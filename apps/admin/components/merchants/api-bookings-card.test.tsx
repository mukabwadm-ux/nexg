import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@nexg/ui', async (original) => ({
  ...(await original<object>()),
  useToast: () => ({ toast: vi.fn() }),
}));

import { ApiBookingsCard } from './api-bookings-card';

const merchantId = '20000000-0000-4000-8000-000000000002';
const render = (state: Partial<Parameters<typeof ApiBookingsCard>[0]['state']> = {}, live = true) =>
  renderToStaticMarkup(
    <ApiBookingsCard
      merchantId={merchantId}
      live={live}
      state={{
        enabled: false,
        monthly_limit_kes: null,
        note: null,
        changed_at: null,
        changed_by: null,
        month_used_kes: 0,
        month_bookings: 0,
        ...state,
      }}
      onSave={async () => ({ ok: true, message: 'Saved.' })}
    />,
  );

describe('the API bookings card', () => {
  it('starts off, in the sandbox, with nothing used', () => {
    const html = render();
    expect(html).toContain('API bookings');
    expect(html).toContain('Sandbox only');
    expect(html).toContain('This month: KES 0 across 0 bookings.');
  });

  it('shows an approved merchant’s limit, use and who changed it', () => {
    const html = render({
      enabled: true,
      monthly_limit_kes: 50000,
      note: 'Pilot',
      changed_at: '2026-11-23T10:00:00Z',
      changed_by: 'Finance 192',
      month_used_kes: 1550,
      month_bookings: 10,
    });
    expect(html).toContain('Charged to the merchant’s account');
    expect(html).toContain('value="50000"');
    expect(html).toContain('This month: KES 1,550 across 10 bookings of KES 50,000.');
    expect(html).toContain('by Finance 192');
  });

  it('cannot be switched on for a merchant that is not live', () => {
    expect(render({}, false)).toContain('Only a live business can book through the API');
  });
});
