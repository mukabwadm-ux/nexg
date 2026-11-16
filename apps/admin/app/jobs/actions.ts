'use server';

import { revalidatePath } from 'next/cache';

import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export interface JobActionResult {
  ok: boolean;
  message: string;
}

/*
 * The RPCs hold the rules (which staff, in which city, a reason required)
 * and write the audit event and the business's bell in the same
 * transaction; nothing here writes a table.
 */

export async function takeJobDown(vacancyId: string, reason: string): Promise<JobActionResult> {
  requireModule(await requireStaff(), 'job_board');
  if (!reason.trim()) {
    return { ok: false, message: 'Say why the job is coming down. The business reads this.' };
  }
  const { error } = await createClient().rpc('rpc_vacancy_set_status', {
    p_vacancy_id: vacancyId,
    p_status: 'closed',
    p_reason: reason.trim(),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/jobs');
  return {
    ok: true,
    message:
      'Taken down. The business has been told why, and the job leaves the public board within five minutes.',
  };
}

export async function liftTakedown(vacancyId: string, reason: string): Promise<JobActionResult> {
  requireModule(await requireStaff(), 'job_board');
  if (!reason.trim()) {
    return { ok: false, message: 'Say why the take-down is lifted.' };
  }
  const { error } = await createClient().rpc('rpc_vacancy_lift_takedown', {
    p_vacancy_id: vacancyId,
    p_reason: reason.trim(),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/jobs');
  return {
    ok: true,
    message: 'Lifted. The job stays closed until the business opens it again.',
  };
}
