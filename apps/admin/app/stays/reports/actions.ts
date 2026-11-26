'use server';

import { revalidatePath } from 'next/cache';

import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

/*
 * Stays › Reports: scheduled and saved reports. Each goes through an RPC in
 * 20270331000200_stays_report_schedules.sql, which checks the caller
 * (anyone who reaches Hotels adds one; hospitality staff or whoever added it
 * change it), holds the rules and writes the audit event.
 */

export interface Outcome {
  ok: boolean;
  message?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Untyped = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function call(fn: string, args: Record<string, unknown>, done: string): Promise<Outcome> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  const db = createClient() as unknown as Untyped;
  const { error } = await db.rpc(fn, args);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/stays/reports');
  return { ok: true, message: done };
}

export async function saveSchedule(input: {
  id?: string;
  report: string;
  cityId: string;
  frequency: string;
  recipients: string[];
}): Promise<Outcome> {
  if (input.id && !UUID.test(input.id))
    return { ok: false, message: 'The schedule ID is invalid.' };
  if (!input.recipients.length) return { ok: false, message: 'Choose who gets the report.' };
  if (input.recipients.some((r) => !UUID.test(r)))
    return { ok: false, message: 'Recipients are staff users.' };
  return call(
    'rpc_console_stays_report_schedule_save',
    {
      p: {
        id: input.id ?? null,
        report: input.report,
        city_id: input.cityId || null,
        frequency: input.frequency,
        recipients: input.recipients,
      },
    },
    input.id ? 'Schedule updated.' : 'Scheduled. The first email goes at its next slot.',
  );
}

export async function setSchedule(
  id: string,
  action: 'pause' | 'resume' | 'delete',
): Promise<Outcome> {
  if (!UUID.test(id)) return { ok: false, message: 'The schedule ID is invalid.' };
  return call(
    'rpc_console_stays_report_schedule_set',
    { p_id: id, p_action: action },
    action === 'pause' ? 'Paused.' : action === 'resume' ? 'Resumed.' : 'Schedule deleted.',
  );
}

export async function saveSavedReport(input: {
  id?: string;
  name: string;
  report: string;
  cityId: string;
  period: string;
  from: string;
  to: string;
  shared: boolean;
}): Promise<Outcome> {
  if (input.id && !UUID.test(input.id)) return { ok: false, message: 'The report ID is invalid.' };
  if (!input.name.trim()) return { ok: false, message: 'Give the report a name.' };
  return call(
    'rpc_console_stays_report_saved_save',
    {
      p: {
        id: input.id ?? null,
        name: input.name.trim(),
        report: input.report,
        city_id: input.cityId || null,
        period: input.period,
        from: input.period === 'custom' ? input.from : null,
        to: input.period === 'custom' ? input.to : null,
        shared: input.shared,
      },
    },
    input.id ? 'Saved report updated.' : 'Report saved.',
  );
}

export async function deleteSavedReport(id: string): Promise<Outcome> {
  if (!UUID.test(id)) return { ok: false, message: 'The report ID is invalid.' };
  return call('rpc_console_stays_report_saved_delete', { p_id: id }, 'Saved report deleted.');
}
