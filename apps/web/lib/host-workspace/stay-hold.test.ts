import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { HostWorkspaceAccess } from './access';
import { runHostCommand } from './commands';

const HOST = '11111111-1111-4111-8111-111111111111';
const UNIT = '22222222-2222-4222-8222-222222222222';

function access() {
  const rpc = vi.fn(async () => ({ data: {}, error: null }));
  const from = vi.fn((view: string) => {
    const row =
      view === 'host_unit_list_v' ? { id: UNIT } : { time_zone: 'Africa/Nairobi' as const };
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
      unitScope: null,
      role: 'Owner',
      userId: 'user-1',
      email: 'host@example.test',
      name: 'Host',
    } as unknown as HostWorkspaceAccess,
  };
}

const hold = (extra: Record<string, unknown> = {}) => ({
  type: 'save',
  collection: 'stays',
  record: {
    kind: 'hold',
    unitId: UNIT,
    guest: 'Amina',
    start: '2026-12-01',
    end: '2026-12-03',
    arrivalTime: '14:00',
    departTime: '10:00',
    adults: 2,
    hours: 24,
    ...extra,
  },
});

describe('holding dates', () => {
  it('keeps the nightly rate on the hold', async () => {
    const { access: a, rpc } = access();
    await expect(runHostCommand(a, hold({ rateKes: 6500 }))).resolves.toEqual({
      message: 'Dates held for 24 hours.',
    });
    expect(rpc).toHaveBeenCalledWith('rpc_stay_host_hold', {
      p_host_id: HOST,
      p_hours: 24,
      p_stay: expect.objectContaining({ unit_id: UNIT, rate_kes: 6500 }),
    });
  });

  it('holds without a rate when none is given', async () => {
    const { access: a, rpc } = access();
    await runHostCommand(a, hold());
    expect(rpc).toHaveBeenCalledWith('rpc_stay_host_hold', {
      p_host_id: HOST,
      p_hours: 24,
      p_stay: expect.objectContaining({ unit_id: UNIT, rate_kes: undefined }),
    });
  });

  it('refuses a rate that a booking would refuse', async () => {
    const { access: a, rpc } = access();
    for (const rateKes of [0, -1, 6500.5, 1_000_001, '6500'])
      await expect(runHostCommand(a, hold({ rateKes }))).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
