import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: unknown };

const { createClient, state } = vi.hoisted(() => {
  const state = {
    user: { id: 'user-1' } as { id: string } | null,
    tables: {} as Record<string, Result>,
    rpc: { data: [], error: null } as Result,
    calls: [] as Array<[string, string, unknown[]]>,
  };
  function query(table: string) {
    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: (value: Result) => unknown) =>
              Promise.resolve(state.tables[table] ?? { data: null, error: null }).then(resolve);
          }
          return (...args: unknown[]) => {
            state.calls.push([table, String(prop), args]);
            return builder;
          };
        },
      },
    );
    return builder;
  }
  const createClient = vi.fn(() => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => query(table),
    rpc: async () => state.rpc,
  }));
  return { createClient, state };
});
vi.mock('@/lib/supabase/server', () => ({ createClient }));

import { loadDeveloperAccess } from './developer-actions';

const MERCHANT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: 'user-1' };
  state.calls = [];
  state.tables = {
    merchant_user: { data: { role: 'owner' }, error: null },
    api_key: {
      data: [
        {
          id: 'k1',
          key_prefix: 'a1b2c3d4',
          environment: 'live',
          scopes: ['public_read'],
          state: 'active',
          created_at: '2026-11-14T08:00:00+00:00',
          last_used_at: null,
          expires_at: null,
        },
        {
          id: 'k2',
          key_prefix: 'nexg_test_9f8e',
          environment: 'test',
          scopes: ['merchant_write'],
          state: 'active',
          created_at: '2026-11-13T08:00:00+00:00',
          last_used_at: null,
          expires_at: '2026-11-15T08:00:00+00:00',
        },
        {
          id: 'k3',
          key_prefix: 'e5f6a7b8',
          environment: null,
          scopes: null,
          state: 'revoked',
          created_at: '2026-11-12T08:00:00+00:00',
          last_used_at: null,
          expires_at: null,
        },
      ],
      error: null,
    },
  };
  state.rpc = {
    data: [
      {
        id: 'e1',
        merchant_id: MERCHANT,
        url: 'https://hooks.example.com/nexg',
        environment: 'live',
        enabled: true,
        last_delivery_at: null,
        last_delivery_ok: null,
        last_status_code: null,
      },
      {
        id: 'e2',
        merchant_id: OTHER,
        url: 'https://other.example.com/nexg',
        environment: 'live',
        enabled: true,
        last_delivery_at: null,
        last_delivery_ok: null,
        last_status_code: null,
      },
    ],
    error: null,
  };
});

describe('loading developer access for Settings', () => {
  it('reads this business’s keys and endpoints, never a key hash', async () => {
    const access = await loadDeveloperAccess(MERCHANT);
    expect(access).toMatchObject({
      ok: true,
      isOwner: true,
      keys: [
        { prefix: 'a1b2c3d4', environment: 'live', state: 'active' },
        { prefix: 'nexg_test_9f8e', environment: 'test', state: 'expired' },
        { prefix: 'e5f6a7b8', environment: 'live', state: 'revoked', scopes: [] },
      ],
      endpoints: [{ id: 'e1', url: 'https://hooks.example.com/nexg' }],
    });
    const select = state.calls.find(
      ([table, method]) => table === 'api_key' && method === 'select',
    );
    expect(String(select?.[2][0])).not.toContain('key_hash');
    expect(state.calls).toContainEqual(['api_key', 'eq', ['merchant_id', MERCHANT]]);
  });

  it('keeps the keys when the endpoints cannot be read', async () => {
    state.rpc = {
      data: null,
      error: { message: 'A current signed-in account session is required.' },
    };
    const access = await loadDeveloperAccess(MERCHANT);
    expect(access).toMatchObject({ ok: true, endpoints: null });
  });

  it('refuses a malformed id, a missing session and a failed read', async () => {
    expect(await loadDeveloperAccess('not-an-id')).toEqual({
      ok: false,
      message: 'Developer access could not be loaded.',
    });
    expect(createClient).not.toHaveBeenCalled();

    state.user = null;
    expect(await loadDeveloperAccess(MERCHANT)).toEqual({
      ok: false,
      message: 'Sign in again to see developer access.',
    });

    state.user = { id: 'user-1' };
    state.tables.api_key = { data: null, error: { message: 'boom' } };
    expect(await loadDeveloperAccess(MERCHANT)).toEqual({
      ok: false,
      message: 'Developer access could not be loaded.',
    });
  });

  it('knows a team member is not the owner', async () => {
    state.tables.merchant_user = { data: { role: 'manager' }, error: null };
    expect(await loadDeveloperAccess(MERCHANT)).toMatchObject({ ok: true, isOwner: false });
  });
});
