import { describe, expect, it, vi } from 'vitest';

import { deleteMyAccount, type DeletionClient } from './account-deletion';

function fakeClient(
  options: { session?: boolean; error?: { code?: string; message: string } } = {},
) {
  const calls: string[] = [];
  const client: DeletionClient = {
    auth: {
      getSession: async () => ({
        data: { session: options.session === false ? null : { access_token: 'token-1' } },
      }),
      signOut: async () => {
        calls.push('signOut');
      },
    },
    rpc: async (fn) => {
      calls.push(fn);
      return { error: options.error ?? null };
    },
  };
  return { client, calls };
}

describe('deleting an account from the website', () => {
  it('has the booked businesses forget the customer first, then deletes, then signs out', async () => {
    const { client, calls } = fakeClient();
    const send = vi.fn(async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url}`);
      expect(init.headers).toEqual({ authorization: 'Bearer token-1' });
    });
    expect(await deleteMyAccount(client, send)).toEqual({ ok: true });
    expect(calls).toEqual([
      'POST /api/public/booking/forget',
      'rpc_my_account_deletion_request',
      'signOut',
    ]);
  });

  it('still deletes when the booking engine does not answer', async () => {
    const { client, calls } = fakeClient();
    const send = async () => {
      throw new Error('offline');
    };
    expect(await deleteMyAccount(client, send)).toEqual({ ok: true });
    expect(calls).toContain('rpc_my_account_deletion_request');
  });

  it('shows what has to finish first, in the words the database gives', async () => {
    const message = 'You have an order in progress.';
    const { client, calls } = fakeClient({ error: { code: '23514', message } });
    expect(await deleteMyAccount(client, async () => undefined)).toEqual({ ok: false, message });
    expect(calls).not.toContain('signOut');
  });

  it('hides any other database error behind a plain message', async () => {
    const { client } = fakeClient({ error: { code: 'XX000', message: 'relation does not exist' } });
    const result = await deleteMyAccount(client, async () => undefined);
    expect(result.ok).toBe(false);
    expect(result).not.toMatchObject({ message: 'relation does not exist' });
  });

  it('deletes nothing without a session', async () => {
    const { client, calls } = fakeClient({ session: false });
    const send = vi.fn(async () => undefined);
    expect((await deleteMyAccount(client, send)).ok).toBe(false);
    expect(calls).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });
});
