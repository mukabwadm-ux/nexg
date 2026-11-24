import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { HostWorkspaceAccess } from './access';
import { runHostCommand } from './commands';

const HOST = '11111111-1111-4111-8111-111111111111';
const UNIT = '22222222-2222-4222-8222-222222222222';
const STAY = '44444444-4444-4444-8444-444444444444';
const OTHER_UNIT = '55555555-5555-4555-8555-555555555555';

type Result = { data: unknown; error: { code: string; message: string } | null };

/* A chainable PostgREST stand-in: every select resolves to the row given for its view. */
function access(
  stay: { unit_id: string; status: string } | null,
  rpcResult: Result = { data: {}, error: null },
  unitScope: string[] | null = null,
) {
  const rpc = vi.fn(async () => rpcResult);
  const from = vi.fn((view: string) => {
    const row = view === 'host_stay_v' ? stay : view === 'host_unit_list_v' ? { id: UNIT } : null;
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: row, error: null }),
    };
    return chain;
  });
  return {
    rpc,
    access: {
      db: { rpc, from },
      hostId: HOST,
      unitScope,
      role: 'Owner',
      userId: 'user-1',
      email: 'host@example.test',
      name: 'Host',
    } as unknown as HostWorkspaceAccess,
  };
}

const transition = (status: string) => ({
  type: 'transition',
  collection: 'stays',
  id: STAY,
  status,
});

describe('stay check-in and check-out', () => {
  it('checks a confirmed reservation in', async () => {
    const { access: a, rpc } = access({ unit_id: UNIT, status: 'booked' });
    await expect(runHostCommand(a, transition('Checked in'))).resolves.toEqual({
      message: 'Guest checked in.',
    });
    expect(rpc).toHaveBeenCalledWith('rpc_host_stay_mark_checked_in', { p_stay_id: STAY });
  });

  it('checks a checked-in guest out', async () => {
    const { access: a, rpc } = access({ unit_id: UNIT, status: 'in_stay' });
    await expect(runHostCommand(a, transition('Completed'))).resolves.toEqual({
      message: 'Guest checked out.',
    });
    expect(rpc).toHaveBeenCalledWith('rpc_host_stay_mark_checked_out', { p_stay_id: STAY });
  });

  it('refuses the wrong starting status without calling the database', async () => {
    const early = access({ unit_id: UNIT, status: 'held' });
    await expect(runHostCommand(early.access, transition('Checked in'))).rejects.toMatchObject({
      status: 400,
      message: 'Only a confirmed reservation can be checked in.',
    });
    const twice = access({ unit_id: UNIT, status: 'in_stay' });
    await expect(runHostCommand(twice.access, transition('Checked in'))).rejects.toMatchObject({
      status: 400,
      message: 'This guest is already checked in.',
    });
    const notIn = access({ unit_id: UNIT, status: 'booked' });
    await expect(runHostCommand(notIn.access, transition('Completed'))).rejects.toMatchObject({
      status: 400,
      message: 'Only a checked-in guest can be checked out.',
    });
    expect(early.rpc).not.toHaveBeenCalled();
    expect(twice.rpc).not.toHaveBeenCalled();
    expect(notIn.rpc).not.toHaveBeenCalled();
  });

  it('passes on the database reason, such as a date that has not come yet', async () => {
    const { access: a } = access(
      { unit_id: UNIT, status: 'booked' },
      {
        data: null,
        error: { code: '22023', message: 'The guest can be checked in from 30 Nov 2026.' },
      },
    );
    await expect(runHostCommand(a, transition('Checked in'))).rejects.toMatchObject({
      status: 400,
      message: 'The guest can be checked in from 30 Nov 2026.',
    });
  });

  it('keeps a unit-scoped manager to their units', async () => {
    const { access: a, rpc } = access({ unit_id: UNIT, status: 'booked' }, undefined, [OTHER_UNIT]);
    await expect(runHostCommand(a, transition('Checked in'))).rejects.toMatchObject({
      status: 403,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a stay outside the workspace', async () => {
    const { access: a, rpc } = access(null);
    await expect(runHostCommand(a, transition('Completed'))).rejects.toMatchObject({ status: 403 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
