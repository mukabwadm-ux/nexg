import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { HostWorkspaceAccess } from './access';
import { runHostCommand } from './commands';

/*
 * A host NexG has not approved yet sets up properties and units
 * (20270314000400). The workspace adds no check of its own: the save goes
 * straight to the database, which keeps everything hidden from guests until
 * the host is live and refuses to publish before then.
 */

const HOST = '11111111-1111-4111-8111-111111111111';
const UNIT = '22222222-2222-4222-8222-222222222222';
const PROPERTY = '33333333-3333-4333-8333-333333333333';

/* Only rpc exists: any extra read (a status check, say) would throw. */
function access(result: { data: unknown; error: { code: string; message: string } | null }) {
  const rpc = vi.fn(async () => result);
  return {
    rpc,
    access: {
      db: { rpc },
      hostId: HOST,
      unitScope: null,
      role: 'Owner',
      userId: 'user-1',
      email: 'host@example.test',
      name: 'Host',
    } as unknown as HostWorkspaceAccess,
  };
}

describe('a host under review', () => {
  it('adds a property', async () => {
    const { access: a, rpc } = access({ data: { id: PROPERTY }, error: null });
    const result = await runHostCommand(a, {
      type: 'save',
      collection: 'properties',
      record: { name: 'Block 212', area: 'Kilimani', kind: 'apartment' },
    });
    expect(result.message).toBe('Property saved.');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'rpc_property_upsert',
      expect.objectContaining({
        p_host_id: HOST,
        p_property_id: undefined,
        p_property: expect.objectContaining({ name: 'Block 212' }),
      }),
    );
  });

  it('adds a unit to it', async () => {
    const { access: a, rpc } = access({ data: { id: UNIT }, error: null });
    await runHostCommand(a, {
      type: 'save',
      collection: 'units',
      record: { name: 'Studio 1', propertyId: PROPERTY },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'rpc_unit_upsert_guarded',
      expect.objectContaining({
        p_host_id: HOST,
        p_unit_id: undefined,
        p_unit: expect.objectContaining({ name: 'Studio 1' }),
      }),
    );
  });

  it('edits a unit', async () => {
    const { access: a, rpc } = access({ data: { id: UNIT }, error: null });
    await runHostCommand(a, {
      type: 'save',
      collection: 'units',
      id: UNIT,
      record: { name: 'Studio One' },
    });
    expect(rpc).toHaveBeenCalledWith(
      'rpc_unit_upsert_guarded',
      expect.objectContaining({ p_unit_id: UNIT }),
    );
  });

  it('hears why a unit cannot be published before approval', async () => {
    const missing = 'Before this unit can go live it needs: NexG approval of your host account.';
    const { access: a } = access({ data: null, error: { code: '22023', message: missing } });
    await expect(
      runHostCommand(a, {
        type: 'listing',
        collection: 'units',
        id: UNIT,
        record: { published: true },
      }),
    ).rejects.toMatchObject({ status: 400, message: missing });
  });
});
