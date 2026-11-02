import { describe, expect, it } from 'vitest';
import { loadMerchantWorkspaceAccess, requireMerchantWorkspaceOperations } from './merchant-access';

const expires_at = '2099-01-01T00:00:00Z';
const approved = { state: 'approved', setup: true, operations: true, review_state: 'approved',
  revision: 3, needs_resubmission: false, expires_at };
const client = (data: unknown, error: unknown = null) => ({ rpc: async () => ({ data, error }) });

describe('database workspace access', () => {
  it('accepts explicit legacy access and a current approved snapshot', async () => {
    await expect(requireMerchantWorkspaceOperations(client({ state: 'legacy', setup: true, operations: true }), 'merchant-1'))
      .resolves.toEqual({ state: 'legacy', setup: true, operations: true });
    await expect(requireMerchantWorkspaceOperations(client(approved), 'merchant-1')).resolves.toEqual(approved);
  });

  it.each(['pending', 'changes_requested', 'rejected', 'blocked'])('denies %s operations', async state => {
    await expect(requireMerchantWorkspaceOperations(client({ state, setup: state === 'pending' || state === 'changes_requested',
      operations: false, expires_at }), 'merchant-1')).rejects.toMatchObject({ status: 403 });
  });

  it.each([
    null, [], {}, { ...approved, state: 'unknown' }, { ...approved, operations: 'true' },
    { ...approved, state: 'pending' }, { ...approved, revision: 0 }, { ...approved, revision: 1.2 },
    { ...approved, needs_resubmission: true }, { ...approved, review_state: 'pending' },
    { ...approved, expires_at: undefined }, { ...approved, expires_at: 'invalid' },
    { ...approved, expires_at: '2020-01-01T00:00:00Z' },
  ])('fails closed for malformed, stale or expired authority %j', async value => {
    await expect(loadMerchantWorkspaceAccess(client(value), 'merchant-1')).rejects.toMatchObject({ status: 503 });
  });

  it('reports RPC errors and transport failures as unavailable access', async () => {
    await expect(loadMerchantWorkspaceAccess(client(approved, { message: 'Unavailable' }), 'merchant-1'))
      .rejects.toMatchObject({ status: 503 });
    await expect(loadMerchantWorkspaceAccess({ rpc: async () => { throw new Error('network'); } }, 'merchant-1'))
      .rejects.toMatchObject({ status: 503 });
  });
});
