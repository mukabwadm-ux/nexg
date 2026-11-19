import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchMerchantWorkspaceAccess } from './merchant-workspace-watch';

const approved = {
  state: 'approved' as const,
  setup: true,
  operations: true,
  review_state: 'approved',
  revision: 2,
  needs_resubmission: false,
  expires_at: '2099-01-01T00:00:00Z',
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('open workspace authorization', () => {
  it('checks visible workspaces every 30 seconds without recording activity and hides revoked content', async () => {
    let visible = false;
    let value: unknown = approved;
    const commands: string[] = [];
    let protectedContent = 'visible';
    const watcher = watchMerchantWorkspaceAccess({
      client: {
        rpc: async (name: string) => {
          commands.push(name);
          return { data: value, error: null };
        },
      },
      merchantId: 'merchant-1',
      initial: approved,
      visible: () => visible,
      onChange: () => {
        protectedContent = 'hidden';
      },
      onInvalid: () => {
        protectedContent = 'unavailable';
      },
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await watcher.check()).toBe('skipped');
    expect(commands).toEqual([]);
    visible = true;
    expect(await watcher.check()).toBe('unchanged');
    value = {
      state: 'pending',
      setup: true,
      operations: false,
      expires_at: '2099-01-01T00:00:00Z',
    };
    await vi.advanceTimersByTimeAsync(30_000);
    expect(protectedContent).toBe('hidden');
    expect(commands).toEqual(['rpc_merchant_workspace_access', 'rpc_merchant_workspace_access']);
    expect(await watcher.check()).toBe('skipped');
    watcher.stop();
  });

  it('hides protected data when access becomes malformed rather than preserving cached authority', async () => {
    let content = 'private';
    const watcher = watchMerchantWorkspaceAccess({
      client: { rpc: async () => ({ data: { state: 'unknown' }, error: null }) },
      merchantId: 'merchant-1',
      initial: approved,
      visible: () => true,
      onChange: () => {
        content = 'changed';
      },
      onInvalid: () => {
        content = 'hidden';
      },
    });
    expect(await watcher.check()).toBe('unavailable');
    expect(content).toBe('hidden');
    watcher.stop();
  });

  it('keeps the page through failed reads and closes it only when they keep failing', async () => {
    let content = 'typing';
    let reply: () => Promise<{ data: unknown; error: unknown; status?: number }> = async () => {
      throw new TypeError('Failed to fetch');
    };
    const watcher = watchMerchantWorkspaceAccess({
      client: { rpc: () => reply() },
      merchantId: 'merchant-1',
      initial: approved,
      visible: () => true,
      onChange: () => {
        content = 'changed';
      },
      onInvalid: () => {
        content = 'closed';
      },
    });
    // A dropped connection, then a database timeout: nothing is unmounted.
    expect(await watcher.check()).toBe('retrying');
    reply = async () => ({ data: null, error: { code: '57014', message: 'timeout' }, status: 500 });
    expect(await watcher.check()).toBe('retrying');
    expect(content).toBe('typing');
    // A good read in between starts the count again.
    reply = async () => ({ data: approved, error: null, status: 200 });
    expect(await watcher.check()).toBe('unchanged');
    reply = async () => ({ data: null, error: { code: '', message: 'fetch failed' }, status: 0 });
    expect(await watcher.check()).toBe('retrying');
    expect(await watcher.check()).toBe('retrying');
    expect(content).toBe('typing');
    // The third failure in a row closes the workspace, as before.
    expect(await watcher.check()).toBe('unavailable');
    expect(content).toBe('closed');
    watcher.stop();
  });

  it('closes at once when the database refuses the read rather than failing to run it', async () => {
    let content = 'private';
    const watcher = watchMerchantWorkspaceAccess({
      client: {
        rpc: async () => ({
          data: null,
          error: { code: '42501', message: 'permission denied' },
          status: 403,
        }),
      },
      merchantId: 'merchant-1',
      initial: approved,
      visible: () => true,
      onChange: () => {
        content = 'changed';
      },
      onInvalid: () => {
        content = 'hidden';
      },
    });
    expect(await watcher.check()).toBe('unavailable');
    expect(content).toBe('hidden');
    watcher.stop();
  });

  it('aborts a pending SDK read and discards its late authority response after cleanup', async () => {
    let resolve!: (value: { data: unknown; error: null }) => void;
    let signal: AbortSignal | undefined;
    let content = 'unchanged';
    const query = Object.assign(
      new Promise<{ data: unknown; error: null }>((r) => {
        resolve = r;
      }),
      {
        abortSignal(value: AbortSignal) {
          signal = value;
          return query;
        },
      },
    );
    const watcher = watchMerchantWorkspaceAccess({
      client: { rpc: () => query },
      merchantId: 'merchant-1',
      initial: approved,
      visible: () => true,
      onChange: () => {
        content = 'changed';
      },
      onInvalid: () => {
        content = 'invalid';
      },
    });
    const pending = watcher.check();
    watcher.stop();
    resolve({ data: { state: 'blocked', setup: false, operations: false }, error: null });
    expect(await pending).toBe('skipped');
    expect(signal?.aborted).toBe(true);
    expect(content).toBe('unchanged');
  });
});
