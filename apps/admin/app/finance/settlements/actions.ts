'use server';

import { revalidatePath } from 'next/cache';

import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export interface BuildOutcome {
  ok: boolean;
  message?: string;
  runId?: string;
}

/**
 * Builds the payout run for the week just finished (Monday to Sunday,
 * Nairobi), or rebuilds it while it is still unapproved. The database
 * decides who may (finance, finance lead, super admin), logs it, and
 * sends nothing: a built run still needs its checks and two signatures.
 */
export async function buildPayoutRun(): Promise<BuildOutcome> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_settlement_build');
  if (error) return { ok: false, message: error.message };
  const result = data as { run_id?: string; message?: string } | null;
  revalidatePath('/finance/settlements');
  revalidatePath('/finance/transactions');
  return { ok: true, message: result?.message, runId: result?.run_id };
}
