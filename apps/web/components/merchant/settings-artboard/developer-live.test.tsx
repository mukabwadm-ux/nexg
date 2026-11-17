import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/merchant/settings/developer-actions', () => ({
  loadDeveloperAccess: vi.fn(),
}));

import type { DeveloperAccess } from '@/app/merchant/settings/developer-actions';

import { DEVELOPER_CONSOLE_URL, LiveDeveloperAccess } from './developer-live';

const MERCHANT = '22222222-2222-4222-8222-222222222222';

const ACCESS: DeveloperAccess = {
  ok: true,
  isOwner: true,
  keys: [
    {
      id: 'k1',
      prefix: 'a1b2c3d4',
      environment: 'live',
      scopes: ['public_read', 'merchant_read'],
      state: 'active',
      createdAt: '2026-11-14T08:00:00+00:00',
      lastUsedAt: null,
    },
    {
      id: 'k2',
      prefix: 'nexg_test_9f8e',
      environment: 'test',
      scopes: ['merchant_write'],
      state: 'revoked',
      createdAt: '2026-11-15T08:00:00+00:00',
      lastUsedAt: '2026-11-16T08:00:00+00:00',
    },
  ],
  endpoints: [
    {
      id: 'e1',
      url: 'https://hooks.example.com/nexg',
      environment: 'live',
      enabled: true,
      lastDeliveryAt: '2026-11-17T10:00:00+00:00',
      lastDeliveryOk: true,
      lastStatusCode: 200,
    },
  ],
};

const render = (access: DeveloperAccess) =>
  renderToStaticMarkup(<LiveDeveloperAccess merchantId={MERCHANT} initial={access} />);

describe('Settings › API & webhooks for a real workspace', () => {
  it('sends people to the developer console and shows what is connected', () => {
    const html = render(ACCESS);
    expect(html).toContain(`href="${DEVELOPER_CONSOLE_URL}"`);
    expect(html).toContain('Open developer console');
    expect(html).toContain('a1b2c3d4…');
    expect(html).toContain('Public catalogue, Your orders');
    expect(html).toContain('Not used yet');
    expect(html).toContain('Revoked');
    expect(html).toContain('https://hooks.example.com/nexg');
    expect(html).toContain('Worked (200)');
    expect(html).not.toContain('Only the business owner');
    expect(html).not.toContain('Developer access is not available');
  });

  it('tells a team member that only the owner creates keys', () => {
    const html = render({ ...ACCESS, isOwner: false, keys: [], endpoints: [] });
    expect(html).toContain('Only the business owner can create API keys and webhook endpoints.');
    expect(html).toContain('No API keys yet');
    expect(html).toContain('The business owner can add one in the developer console.');
  });

  it('keeps the keys when the endpoints cannot be read, and says why when nothing can', () => {
    expect(render({ ...ACCESS, endpoints: null })).toContain(
      'Your webhook endpoints could not be read right now.',
    );
    const html = render({ ok: false, message: 'Developer access could not be loaded.' });
    expect(html).toContain('Developer access could not be loaded.');
    expect(html).toContain(`href="${DEVELOPER_CONSOLE_URL}"`);
  });
});
