import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { type AdminApiKey, ApiKeysSection } from './api-keys';

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const key = (over: Partial<AdminApiKey>): AdminApiKey => ({
  id: 'k1',
  merchantId: 'm1',
  merchantName: 'New Dummy Solutions',
  prefix: 'nexg_test_ab',
  environment: 'test',
  scopes: ['public_read', 'merchant_write'],
  state: 'active',
  createdAt: '2026-11-17T12:00:00Z',
  lastUsedAt: null,
  revokedAt: null,
  revokeReason: null,
  ...over,
});

const render = (keys: AdminApiKey[] | null) =>
  renderToStaticMarkup(
    <ApiKeysSection keys={keys} consoleUrl="https://api.nexgapp.com/developers" />,
  );

describe('API keys in the API & Webhooks tab', () => {
  it('lists the active keys with their merchant, and offers Revoke on each', () => {
    const html = render([
      key({}),
      key({
        id: 'k2',
        merchantId: null,
        merchantName: null,
        prefix: 'a1b2c3d4',
        environment: 'live',
      }),
      key({ id: 'k3', prefix: 'e5f6a7b8', state: 'revoked', revokeReason: 'Leaked' }),
    ]);
    expect(html).toContain('nexg_test_ab…');
    expect(html).toContain('New Dummy Solutions');
    expect(html).toContain('a1b2c3d4…');
    expect(html).toContain('No merchant');
    expect(html).toContain('TEST');
    expect(html.match(/>Revoke</g)).toHaveLength(2);
    expect(html).not.toContain('e5f6a7b8');
    expect(html).toContain('Show revoked and expired (1)');
    expect(html).toContain('href="https://api.nexgapp.com/developers"');
  });

  it('says so when there is nothing active, and when the keys cannot be read', () => {
    expect(render([])).toContain('No active keys.');
    expect(render(null)).toContain('The keys could not be read right now.');
  });
});
