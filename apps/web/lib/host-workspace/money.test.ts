import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { HostWorkspaceAccess } from './access';
import { runHostCommand } from './commands';

const HOST = '11111111-1111-4111-8111-111111111111';
const UNIT = '22222222-2222-4222-8222-222222222222';
const OTHER_UNIT = '44444444-4444-4444-8444-444444444444';
const RECORD = '55555555-5555-4555-8555-555555555555';
const STAY = '66666666-6666-4666-8666-666666666666';
const OPERATION = '77777777-7777-4777-8777-777777777777';

function access(
  result: { data: unknown; error: { code: string; message: string } | null } = {
    data: RECORD,
    error: null,
  },
  unitScope: string[] | null = null,
) {
  const rpc = vi.fn(async (_name: string, _args: unknown) => result);
  return {
    rpc,
    access: {
      db: { rpc },
      hostId: HOST,
      unitScope,
      role: 'Owner',
      userId: 'user-1',
      email: 'host@example.test',
      name: 'Host',
    } as unknown as HostWorkspaceAccess,
  };
}

const payment = {
  type: 'Receipt',
  amountMinor: 1_250_000,
  date: '2026-11-20',
  reference: 'QK7 ABC',
  status: 'Recorded',
};
const expense = {
  unitId: UNIT,
  category: 'Cleaning',
  description: 'Deep clean',
  amountMinor: 300_000,
  date: '2026-11-21',
  status: 'Due',
};

describe('editing a payment record', () => {
  it('sends the change to the update function in server names', async () => {
    const { access: a, rpc } = access();
    const result = await runHostCommand(a, {
      type: 'save',
      collection: 'payments',
      id: RECORD,
      record: { ...payment, operationId: OPERATION },
    });
    expect(result).toEqual({ message: 'Payment record saved.' });
    expect(rpc).toHaveBeenCalledWith('rpc_host_manual_finance_update', {
      p_host_id: HOST,
      p_id: RECORD,
      p_entry: {
        kind: 'Receipt',
        amount_minor: 1_250_000,
        recorded_on: '2026-11-20',
        status: 'Recorded',
        reference: 'QK7 ABC',
      },
    });
  });

  it('does not move a payment to another reservation', async () => {
    const { access: a, rpc } = access();
    await runHostCommand(a, {
      type: 'save',
      collection: 'payments',
      id: RECORD,
      record: { ...payment, stayId: STAY },
    });
    const [, args] = rpc.mock.calls[0] as unknown as [string, { p_entry: object }];
    expect(args.p_entry).not.toHaveProperty('stay_id');
  });

  it('passes on the reason a recorded payment is locked', async () => {
    const { access: a } = access({
      data: null,
      error: {
        code: '22023',
        message: "Recorded payments can't be changed. Record a refund to adjust one.",
      },
    });
    await expect(
      runHostCommand(a, { type: 'save', collection: 'payments', id: RECORD, record: payment }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Recorded payments can't be changed. Record a refund to adjust one.",
    });
  });

  it('refuses an amount that is not whole minor units', async () => {
    const { access: a, rpc } = access();
    await expect(
      runHostCommand(a, {
        type: 'save',
        collection: 'payments',
        id: RECORD,
        record: { ...payment, amountMinor: 12.5 },
      }),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('still records a new payment with the create function', async () => {
    const { access: a, rpc } = access();
    await runHostCommand(a, {
      type: 'save',
      collection: 'payments',
      record: { ...payment, stayId: STAY, operationId: OPERATION },
    });
    expect(rpc.mock.calls[0]?.[0]).toBe('rpc_host_manual_finance_record');
  });
});

describe('editing an expense', () => {
  it('sends the unit, description, category, amount, date and status', async () => {
    const { access: a, rpc } = access();
    const result = await runHostCommand(a, {
      type: 'save',
      collection: 'expenses',
      id: RECORD,
      record: { ...expense, evidence: '' },
    });
    expect(result).toEqual({ message: 'Expense saved.' });
    expect(rpc).toHaveBeenCalledWith('rpc_host_manual_finance_update', {
      p_host_id: HOST,
      p_id: RECORD,
      p_entry: {
        unit_id: UNIT,
        amount_minor: 300_000,
        recorded_on: '2026-11-21',
        status: 'Due',
        description: 'Deep clean',
        category: 'Cleaning',
      },
    });
  });

  it('refuses a unit outside a manager’s units before calling the database', async () => {
    const { access: a, rpc } = access(undefined, [OTHER_UNIT]);
    await expect(
      runHostCommand(a, { type: 'save', collection: 'expenses', id: RECORD, record: expense }),
    ).rejects.toMatchObject({ status: 403 });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('removing a record', () => {
  it('removes an expense', async () => {
    const { access: a, rpc } = access();
    const result = await runHostCommand(a, { type: 'delete', collection: 'expenses', id: RECORD });
    expect(result).toEqual({ message: 'Expense removed.' });
    expect(rpc).toHaveBeenCalledWith('rpc_host_manual_finance_remove', {
      p_host_id: HOST,
      p_id: RECORD,
    });
  });

  it('passes on why a recorded payment stays', async () => {
    const { access: a } = access({
      data: null,
      error: {
        code: '22023',
        message: "Recorded payments can't be removed. Record a refund to adjust one.",
      },
    });
    await expect(
      runHostCommand(a, { type: 'delete', collection: 'payments', id: RECORD }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('keeps a scope refusal generic', async () => {
    const { access: a } = access({
      data: null,
      error: { code: '42501', message: 'permission denied for function' },
    });
    await expect(
      runHostCommand(a, { type: 'delete', collection: 'payments', id: RECORD }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'This record is outside your workspace access.',
    });
  });
});
