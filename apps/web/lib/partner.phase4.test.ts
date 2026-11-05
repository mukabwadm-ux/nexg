import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireMerchant } from './partner';

const mock = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('./supabase/server', () => ({ createClient: mock.createClient }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
const expiry = '2099-01-01T00:00:00Z';
let state: {
  access: unknown;
  role: string | null;
  user: { id: string; is_anonymous?: boolean } | null;
  status: string;
  accessError: unknown;
  reads: string[];
};
beforeEach(() => {
  state = {
    access: { state: 'pending', setup: true, operations: false, expires_at: expiry },
    role: 'owner',
    user: { id: 'user-1', is_anonymous: false },
    status: 'under_review',
    accessError: null,
    reads: [],
  };
  mock.createClient.mockImplementation(() => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    rpc: async (name: string) =>
      name === 'fn_partner_home'
        ? { data: { kind: 'merchant', id: 'merchant-1', home: '/merchant' }, error: null }
        : { data: state.access, error: state.accessError },
    from(table: string) {
      state.reads.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data:
            table === 'merchant_user'
              ? state.role
                ? { role: state.role }
                : null
              : { status: state.status },
          error: null,
        }),
      };
      return query;
    },
  }));
});

describe('merchant page entry', () => {
  it.each([undefined, 'operations', 'setup', 'workspace-setup', 'shell'] as const)(
    'keeps rejected applications outside %s and gives a decision recovery route',
    async (access) => {
      state.access = { state: 'rejected', setup: false, operations: false, expires_at: expiry };
      await expect(requireMerchant({ access })).rejects.toThrow('redirect:/merchants/decision');
      expect(state.reads).toEqual(['merchant_user']);
    },
  );
  it('does not turn a blocked session or invalid authority into a rejection decision', async () => {
    state.access = { state: 'blocked', setup: false, operations: false };
    await expect(requireMerchant({ access: 'shell' })).rejects.toThrow(
      'redirect:/sign-in?reason=workspace-session',
    );
    state.access = { state: 'unknown', setup: false, operations: false };
    await expect(requireMerchant({ access: 'shell' })).rejects.toMatchObject({ status: 503 });
  });
  it('requires membership before routing a rejected application to its decision', async () => {
    state.role = null;
    state.access = { state: 'rejected', setup: false, operations: false, expires_at: expiry };
    await expect(requireMerchant({ access: 'shell' })).rejects.toThrow(
      'redirect:/sign-in?reason=workspace-access',
    );
  });
  it('allows pending owner draft setup while the default operational entry redirects', async () => {
    await expect(requireMerchant({ access: 'setup' })).resolves.toMatchObject({
      id: 'merchant-1',
      userId: 'user-1',
      access: { operations: false },
    });
    await expect(requireMerchant({ access: 'workspace-setup' })).resolves.toMatchObject({
      id: 'merchant-1',
      userId: 'user-1',
      access: { operations: false },
    });
    await expect(requireMerchant()).rejects.toThrow('redirect:/merchant');
    expect(
      state.reads.filter((table) => table !== 'merchant_user' && table !== 'merchant'),
    ).toEqual([]);
  });
  it('allows explicit legacy access without requiring a new application or deadline', async () => {
    state.access = { state: 'legacy', setup: true, operations: true };
    await expect(requireMerchant()).resolves.toMatchObject({
      id: 'merchant-1',
      access: { state: 'legacy' },
    });
  });
  it('allows approved managers into the shell but reserves new-flow draft edits for the owner', async () => {
    state.role = 'manager';
    state.access = {
      state: 'approved',
      setup: false,
      operations: true,
      review_state: 'approved',
      revision: 2,
      needs_resubmission: false,
      expires_at: expiry,
    };
    await expect(requireMerchant({ access: 'shell' })).resolves.toMatchObject({ id: 'merchant-1' });
    await expect(requireMerchant({ access: 'setup' })).rejects.toMatchObject({ status: 403 });
    await expect(requireMerchant({ access: 'workspace-setup' })).rejects.toMatchObject({
      status: 403,
    });
  });
  it('lets an approved live owner edit workspace setup drafts while preserving the old setup restriction', async () => {
    state.status = 'live';
    state.access = {
      state: 'approved',
      setup: true,
      operations: true,
      review_state: 'approved',
      revision: 2,
      needs_resubmission: false,
      expires_at: expiry,
    };
    await expect(requireMerchant({ access: 'setup' })).rejects.toMatchObject({ status: 403 });
    await expect(requireMerchant({ access: 'workspace-setup' })).resolves.toMatchObject({
      id: 'merchant-1',
      userId: 'user-1',
      access: { state: 'approved', setup: true },
    });
    state.access = {
      state: 'approved',
      setup: false,
      operations: true,
      review_state: 'approved',
      revision: 2,
      needs_resubmission: false,
      expires_at: expiry,
    };
    await expect(requireMerchant({ access: 'workspace-setup' })).rejects.toMatchObject({
      status: 403,
    });
  });
  it.each(['paused', 'delisted', 'rejected'])(
    'keeps a %s business outside setup even with a stale setup permission',
    async (status) => {
      state.status = status;
      await expect(requireMerchant({ access: 'workspace-setup' })).rejects.toMatchObject({
        status: 403,
      });
    },
  );
  it('fails closed on unknown permissions, removed membership and a supplied foreign tenant', async () => {
    state.accessError = { message: 'Unavailable' };
    await expect(requireMerchant()).rejects.toMatchObject({ status: 503 });
    state.accessError = null;
    state.role = null;
    await expect(requireMerchant({ access: 'shell' })).rejects.toThrow(
      'redirect:/sign-in?reason=workspace-access',
    );
    await expect(requireMerchant({ merchantId: 'merchant-other' })).rejects.toThrow(
      'redirect:/merchant',
    );
  });
  it('does not admit anonymous or absent authenticated users', async () => {
    state.user = { id: 'anon-user', is_anonymous: true };
    await expect(requireMerchant()).rejects.toThrow('redirect:/merchant');
    state.user = null;
    await expect(requireMerchant()).rejects.toThrow('redirect:/sign-in');
  });
  it('does not grant operational access when the session type is unknown', async () => {
    state.user = { id: 'user-1' };
    state.access = { state: 'legacy', setup: true, operations: true };
    await expect(requireMerchant()).rejects.toThrow('redirect:/merchant');
  });
});
