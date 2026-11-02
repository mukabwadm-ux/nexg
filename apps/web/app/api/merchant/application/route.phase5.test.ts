import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({ createClient }));

import { GET, POST } from './route';

beforeEach(() => {
  vi.stubEnv('MERCHANT_ONBOARDING_V1_ENABLED', 'false');
  createClient.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('merchant application route with connected entry disabled', () => {
  it.each([
    ['GET', () => GET(new Request('http://localhost/api/merchant/application'))],
    ['POST', () => POST(new Request('http://localhost/api/merchant/application', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ command: 'start' }),
    }))],
  ])('returns the private not-available problem without requiring Supabase: %s', async (_method, invoke) => {
    const response = await invoke();
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await response.json()).title).toBe('not_available');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('converts missing backend configuration into a safe service response when enabled', async () => {
    vi.stubEnv('MERCHANT_ONBOARDING_V1_ENABLED', 'true');
    createClient.mockImplementation(() => { throw new Error('private backend configuration'); });
    const response = await GET(new Request('http://localhost/api/merchant/application'));
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect((await response.json()).title).toBe('application_unavailable');
  });
});
