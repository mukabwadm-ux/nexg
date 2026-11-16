import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, getUser, maybeSingle, createServerClient } = vi.hoisted(() => {
  const rpc = vi.fn();
  const getUser = vi.fn();
  const maybeSingle = vi.fn();
  const membership = {
    select: () => membership,
    eq: () => membership,
    maybeSingle,
  };
  const createServerClient = vi.fn(() => ({ auth: { getUser }, from: () => membership, rpc }));
  return { rpc, getUser, maybeSingle, createServerClient };
});
vi.mock('@supabase/ssr', () => ({ createServerClient }));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => undefined }) }));

import { issueApiKey } from '../app/developers/actions';

const MERCHANT = '22222222-2222-4222-8222-222222222222';

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const one of [value].flat()) data.append(name, one);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  maybeSingle.mockResolvedValue({ data: { merchant_id: MERCHANT } });
  rpc.mockResolvedValue({
    data: [{ raw_key: 'placeholder-raw-key', key_id: 'key-1', key_prefix: 'placehol' }],
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('issuing keys from the developer console', () => {
  it('issues a test key that can book in the sandbox', async () => {
    const result = await issueApiKey(
      form({
        environment: 'test',
        scopes: ['public_read', 'merchant_write'],
        merchant_id: MERCHANT,
        rate_limit: '60',
      }),
    );
    expect(result).toMatchObject({ ok: true, key: { environment: 'test' } });
    expect(rpc).toHaveBeenCalledWith(
      'fn_api_key_issue',
      expect.objectContaining({
        p_merchant_id: MERCHANT,
        p_scopes: ['public_read', 'merchant_write'],
        p_environment: 'test',
      }),
    );
  });

  it('issues a live key the way it did before test keys existed', async () => {
    const result = await issueApiKey(form({ scopes: 'public_read', merchant_id: '' }));
    expect(result).toMatchObject({ ok: true, key: { environment: 'live' } });
    expect(rpc.mock.calls[0]).toEqual([
      'fn_api_key_issue',
      {
        p_merchant_id: null,
        p_scopes: ['public_read'],
        p_rate_limit: 60,
        p_expires_at: null,
        p_created_by: null,
        p_created_by_user: 'user-1',
      },
    ]);
  });

  it('does not issue a live key that books', async () => {
    const result = await issueApiKey(
      form({ environment: 'live', scopes: ['merchant_write'], merchant_id: MERCHANT }),
    );
    expect(result).toMatchObject({
      ok: false,
      message: 'Booking is offered on test keys. Ask NexG to book for real.',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a kind of key that does not exist', async () => {
    const result = await issueApiKey(form({ environment: 'staging', scopes: 'public_read' }));
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
