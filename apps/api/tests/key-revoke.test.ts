import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, getUser, or, limit, listDeveloperMerchants } = vi.hoisted(() => {
  const rpc = vi.fn();
  const getUser = vi.fn();
  const limit = vi.fn();
  const or = vi.fn();
  const listDeveloperMerchants = vi.fn();
  return { rpc, getUser, or, limit, listDeveloperMerchants };
});

vi.mock('@/lib/session', () => {
  const query = {
    select: () => query,
    or: (filter: string) => {
      or(filter);
      return query;
    },
    order: () => query,
    limit,
  };
  return { createClient: () => ({ auth: { getUser }, from: () => query, rpc }) };
});
vi.mock('@/lib/merchants', () => ({ listDeveloperMerchants }));

import { revokeApiKey } from '../app/developers/key-actions';
import { listConsoleKeys } from '../lib/keys';

const USER = '11111111-1111-4111-8111-111111111111';
const MERCHANT = '22222222-2222-4222-8222-222222222222';
const KEY = '33333333-3333-4333-8333-333333333333';

const row = (over: Record<string, unknown>) => ({
  id: KEY,
  merchant_id: MERCHANT,
  key_prefix: 'nexg_test_ab',
  environment: 'test',
  scopes: ['public_read'],
  state: 'active',
  created_at: '2026-11-17T12:00:00Z',
  last_used_at: null,
  expires_at: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: USER } } });
  listDeveloperMerchants.mockResolvedValue([{ id: MERCHANT, role: 'owner' }]);
  limit.mockResolvedValue({ data: [row({ state: 'revoked' })], error: null });
  rpc.mockResolvedValue({ data: true, error: null });
});

describe('listing keys in the developer console', () => {
  it("asks for the merchants' keys and the person's own keys with no merchant", async () => {
    const { createClient } = await import('@/lib/session');
    await listConsoleKeys(createClient() as never, USER, [MERCHANT, 'not-a-uuid']);
    expect(or).toHaveBeenLastCalledWith(
      `merchant_id.in.(${MERCHANT}),and(merchant_id.is.null,created_by_user.eq.${USER})`,
    );
  });

  it('tells active, expired and revoked keys apart', async () => {
    limit.mockResolvedValue({
      data: [
        row({ id: 'a' }),
        row({ id: 'b', expires_at: '2020-01-01T00:00:00Z' }),
        row({ id: 'c', state: 'revoked' }),
        row({ id: 'd', merchant_id: null, environment: 'live' }),
      ],
      error: null,
    });
    const { createClient } = await import('@/lib/session');
    const list = await listConsoleKeys(createClient() as never, USER, [MERCHANT]);
    expect(list.ok && list.keys.map((k) => `${k.id}:${k.state}:${k.environment}`)).toEqual([
      'a:active:test',
      'b:expired:test',
      'c:revoked:test',
      'd:active:live',
    ]);
  });

  it('reads nothing for a user id that is not a uuid', async () => {
    const { createClient } = await import('@/lib/session');
    expect(await listConsoleKeys(createClient() as never, 'x', [])).toEqual({
      ok: false,
      message: 'Your keys could not be read.',
    });
    expect(or).not.toHaveBeenCalled();
  });
});

describe('revoking a key in the developer console', () => {
  it('revokes through the database, with the reason trimmed, and returns the new list', async () => {
    const result = await revokeApiKey(KEY, '  Leaked in a screenshot  ');
    expect(rpc).toHaveBeenCalledWith('rpc_api_key_revoke', {
      p_key_id: KEY,
      p_reason: 'Leaked in a screenshot',
    });
    expect(result).toMatchObject({
      ok: true,
      message: 'Revoked. Anything still using that key is refused from now on.',
      keys: [{ id: KEY, state: 'revoked' }],
    });
  });

  it('sends no reason when none is given', async () => {
    await revokeApiKey(KEY, '   ');
    expect(rpc).toHaveBeenCalledWith('rpc_api_key_revoke', { p_key_id: KEY, p_reason: null });
  });

  it('says so when the key was already revoked', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await revokeApiKey(KEY)).toMatchObject({
      ok: true,
      message: 'That key was already revoked.',
    });
  });

  it("passes on the database's refusal", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Not allowed to revoke this key.' } });
    expect(await revokeApiKey(KEY)).toEqual({
      ok: false,
      message: 'Not allowed to revoke this key.',
    });
  });

  it('refuses a key id that is not a uuid, and a visitor who is not signed in', async () => {
    expect(await revokeApiKey('nope')).toEqual({ ok: false, message: 'No such key.' });
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await revokeApiKey(KEY)).toEqual({ ok: false, message: 'Sign in to revoke a key.' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
