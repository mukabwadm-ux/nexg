import { ToastProvider } from '@nexg/ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { type ApiConnectionRow, type ApiOverview, ApiTab } from './api';
import { type IntegrationRow, type PaymentRow, type RailRow, SettingsTabs } from './shared';
import { PaymentsTab, type TabProps } from './tabs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const integrations: IntegrationRow[] = [
  {
    key: 'payments',
    label: 'Card & M-Pesa payments',
    provider: 'Paystack',
    status: 'to_do',
    enabled: false,
    config: {},
    secrets: 0,
    key_rotated_at: null,
    rotation_days: 90,
    rotation_due: false,
    rotation_due_on: null,
    health: {},
    last_checked_at: null,
    blocks: ['guest_checkout'],
    notes: null,
  },
  {
    key: 'email',
    label: 'Email',
    provider: null,
    status: 'connected',
    enabled: true,
    config: {},
    secrets: 1,
    key_rotated_at: '2026-10-01T09:00:00Z',
    rotation_days: 90,
    rotation_due: true,
    rotation_due_on: '2026-12-30',
    health: {},
    last_checked_at: null,
    blocks: [],
    notes: null,
  },
];

const connection: ApiConnectionRow = {
  id: 'c1',
  key: 'nexg-sandbox-bank',
  name: 'NexG Sandbox Bank',
  kind: 'bank',
  environment: 'sandbox',
  base_url: 'https://bank-sandbox.example.com',
  auth_type: 'bearer',
  auth_header: null,
  test_path: '/v1/test-accounts',
  has_credential: true,
  has_webhook_secret: false,
  contact_name: null,
  contact_email: null,
  notes: null,
  enabled: true,
  status: 'connected',
  last_tested_at: '2026-11-10T12:04:00Z',
  last_test_ok: true,
  last_test_status: 200,
  last_test_ms: 182,
  last_test_detail: null,
};

const overview: ApiOverview = {
  webhooks: [
    { key: 'paystack', secret_set: false, last_event_at: null, events_30d: 0, unhandled_30d: 0 },
    {
      key: 'mpesa',
      secret_set: true,
      last_event_at: null,
      events_30d: 0,
      unhandled_30d: 0,
      prompts_30d: 4,
      answered_30d: 0,
    },
    {
      key: 'bank',
      secret_set: true,
      last_event_at: '2026-11-10T11:20:43Z',
      events_30d: 5,
      unhandled_30d: 1,
    },
  ],
  api_keys: { active: 2, merchant: 1, platform: 1 },
};

const origins = { web: 'https://nexgapp.com', api: 'https://api.nexgapp.com' };

function apiTab(o: ApiOverview | null) {
  return renderToStaticMarkup(
    <ApiTab
      connections={[connection]}
      tests={[]}
      canEdit
      origins={origins}
      integrations={integrations}
      overview={o}
    />,
  );
}

describe('Settings tabs', () => {
  it('names the tabs Payments and API & Webhooks', () => {
    const html = renderToStaticMarkup(<SettingsTabs current="api" />);
    expect(html).toContain('>Payments<');
    expect(html).toContain('API &amp; Webhooks');
    expect(html).not.toContain('Payments &amp; integrations');
  });
});

describe('API & Webhooks tab', () => {
  it('holds the integrations, their tiles and the webhooks', () => {
    const html = apiTab(overview);
    expect(html).toContain('Integrations healthy');
    expect(html).toContain('1 / 2');
    expect(html).toContain('Keys due rotation');
    expect(html).toContain('Card &amp; M-Pesa payments');
    expect(html).toContain('ROTATE KEY');
    expect(html).toContain('Webhooks');
    expect(html).toContain('https://nexgapp.com/api/payments/bank/webhook');
    expect(html).toContain('NO SECRET');
    expect(html).toContain('SECRET SET');
    expect(html).toContain('5 in 30 days · 1 not handled');
    expect(html).toContain('API keys: 2 active (1 for merchants, 1 platform)');
    expect(html).toContain('Sandbox environment');
    expect(html).toContain('API documentation');
  });

  it('warns when M-Pesa prompts go out and no answer comes back', () => {
    const html = apiTab(overview);
    expect(html).toContain('4 prompts sent, 0 answered');
    expect(html).toContain('no answer from Safaricom was recorded');
  });

  it('still shows the webhooks before their status can be read', () => {
    const html = apiTab(null);
    expect(html).toContain('Paystack (cards)');
    expect(html).toContain('Live webhook status appears once the database update');
    expect(html).not.toContain('SECRET SET');
  });
});

describe('Payments tab', () => {
  it('keeps payments and payouts, and points to API & Webhooks for the rest', () => {
    const payments: PaymentRow[] = [
      {
        key: 'mpesa_stk',
        label: 'M-Pesa',
        provider: 'Safaricom',
        status: 'connected',
        enabled: true,
        checkout_order: 1,
        limits: {},
        health: {},
        note: null,
        disabled_reason: null,
        success_24h_pct: null,
        callbacks_failed: null,
      },
    ];
    const rails: RailRow[] = [
      { party: 'merchant', rail: 'mpesa_b2c', float_alert_amount: 100000, note: null },
    ];
    const html = renderToStaticMarkup(
      <ToastProvider>
        <PaymentsTab
          {...({ payments, rails, integrations, canEdit: () => false } as unknown as TabProps)}
        />
      </ToastProvider>,
    );
    expect(html).toContain('Guest payment methods');
    expect(html).toContain('Payouts · settlements');
    expect(html).toContain('Checkout methods on');
    expect(html).toContain('href="/settings?tab=api"');
    expect(html).not.toContain('Integrations healthy');
    expect(html).not.toContain('Keys due rotation');
    expect(html).not.toContain('API keys &amp; webhooks');
    expect(html).not.toContain('Card &amp; M-Pesa payments');
  });
});
