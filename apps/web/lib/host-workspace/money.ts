import 'server-only';

import { z } from 'zod';
import { HostWorkspaceError, type HostWorkspaceAccess } from './access';

/*
 * Changing or removing a payment or expense record the host already saved. New records go through
 * rpc_host_manual_finance_record in commands.ts. Recorded payments stay as they are: the host records a refund or a
 * deposit return to adjust one (see 20270314000900_host_money_record_edit.sql).
 */

const uuid = z.string().uuid();
const amountMinor = z.number().int().min(1).max(10_000_000_000);
const day = z.string().date();

const paymentEdit = z.object({
  amountMinor,
  date: day,
  type: z.enum(['Receipt', 'Refund', 'Deposit', 'Deposit refund']),
  status: z.enum(['Recorded', 'Pending', 'Failed']),
  reference: z.string().trim().min(1).max(100),
});

const expenseEdit = z.object({
  amountMinor,
  date: day,
  unitId: uuid,
  description: z.string().trim().min(1).max(240),
  category: z.enum(['Cleaning', 'Maintenance', 'Utilities', 'Supplies', 'Other']),
  status: z.enum(['Recorded', 'Due']),
});

type MoneyCommand = {
  type: 'save' | 'delete';
  collection: 'payments' | 'expenses';
  id: string;
  record?: unknown;
};

function saved(result: { error: { code: string; message: string } | null }, message: string) {
  const { error } = result;
  if (!error) return { message };
  if (error.code === '42501')
    throw new HostWorkspaceError(
      403,
      /^permission denied/i.test(error.message) || !error.message
        ? 'This record is outside your workspace access.'
        : error.message,
    );
  if (['22023', '23505'].includes(error.code)) throw new HostWorkspaceError(400, error.message);
  throw new HostWorkspaceError(503, 'Saving could not be confirmed. Refresh before trying again.');
}

export function isMoneyEdit(command: {
  type: string;
  collection?: string;
  id?: string;
}): command is MoneyCommand {
  return (
    (command.type === 'save' || command.type === 'delete') &&
    (command.collection === 'payments' || command.collection === 'expenses') &&
    Boolean(command.id)
  );
}

export async function runMoneyEdit(access: HostWorkspaceAccess, command: MoneyCommand) {
  const payment = command.collection === 'payments';
  if (command.type === 'delete') {
    return saved(
      await access.db.rpc('rpc_host_manual_finance_remove', {
        p_host_id: access.hostId,
        p_id: command.id,
      }),
      payment ? 'Payment record removed.' : 'Expense removed.',
    );
  }
  if (payment) {
    const edit = paymentEdit.parse(command.record);
    return saved(
      await access.db.rpc('rpc_host_manual_finance_update', {
        p_host_id: access.hostId,
        p_id: command.id,
        p_entry: {
          kind: edit.type,
          amount_minor: edit.amountMinor,
          recorded_on: edit.date,
          status: edit.status,
          reference: edit.reference,
        },
      }),
      'Payment record saved.',
    );
  }
  const edit = expenseEdit.parse(command.record);
  if (access.unitScope && !access.unitScope.includes(edit.unitId))
    throw new HostWorkspaceError(403, 'This record is outside your workspace access.');
  return saved(
    await access.db.rpc('rpc_host_manual_finance_update', {
      p_host_id: access.hostId,
      p_id: command.id,
      p_entry: {
        unit_id: edit.unitId,
        amount_minor: edit.amountMinor,
        recorded_on: edit.date,
        status: edit.status,
        description: edit.description,
        category: edit.category,
      },
    }),
    'Expense saved.',
  );
}
