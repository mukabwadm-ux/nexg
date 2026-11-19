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

/**
 * Verifies an experience partner's payout details, by the version on the
 * screen. The database decides who may (full Finance, not whoever declared
 * them; a super admin may, logged for review) and logs it. The next run
 * pays the partner to these details.
 */
export async function verifyPartnerPayout(
  partnerId: string,
  version: number,
): Promise<{ ok: boolean; message?: string }> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_experience_partner_payout_verify', {
    p_partner_id: partnerId,
    p_version: version,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/finance/settlements');
  revalidatePath('/experiences');
  return { ok: true, message: (data as { message?: string } | null)?.message ?? 'Verified' };
}

/**
 * A rider's early payout: approve, reject (with a reason the rider reads),
 * or record that it was paid with the M-Pesa reference. The database checks
 * full Finance and, on paid, takes the amount off the next weekly run.
 * Nothing here sends money.
 */
export async function decideEarlyPayout(
  requestId: string,
  decision: 'approve' | 'reject' | 'paid',
  note: string,
  providerRef: string,
): Promise<{ ok: boolean; message?: string }> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  const { data, error } = await createClient().rpc('rpc_finance_rider_payout_decide', {
    p_request_id: requestId,
    p_decision: decision,
    p_note: note || undefined,
    p_provider_ref: providerRef || undefined,
  });
  if (error) return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
  revalidatePath('/finance/settlements');
  const r = (data ?? {}) as { status?: string };
  return { ok: true, message: r.status ? `Marked ${r.status}.` : undefined };
}
