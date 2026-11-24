'use server';

import { revalidatePath } from 'next/cache';

import { parseRate } from '@/lib/merchant-commission';
import { createClient } from '@/lib/supabase/server';

export interface CommissionResult {
  ok: boolean;
  message: string;
}

/* The RPCs hold the rules (who may ask, who may approve, the dates) and
 * write the audit entry in the same transaction; nothing here writes a table. */

export async function requestCommission(
  merchantId: string,
  input: {
    ownDelivery: string;
    nexgDelivery: string;
    startsOn: string;
    endsOn: string;
    reason: string;
    termsRef: string;
  },
): Promise<CommissionResult> {
  const own = parseRate(input.ownDelivery);
  const nexg = parseRate(input.nexgDelivery);
  if (!own.ok || !nexg.ok) {
    return { ok: false, message: 'A rate is a percentage from 0 to 100, two decimals at most.' };
  }
  const { error } = await createClient().rpc('rpc_merchant_commission_request', {
    p_merchant_id: merchantId,
    p_own_delivery_pct: own.value as number,
    p_nexg_delivery_pct: nexg.value as number,
    p_starts_on: input.startsOn,
    p_ends_on: (input.endsOn || null) as string,
    p_reason: input.reason,
    ...(input.termsRef.trim() ? { p_terms_ref: input.termsRef.trim() } : {}),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/merchants/${merchantId}`);
  return { ok: true, message: 'Sent for approval. A second person has to approve it.' };
}

export async function decideCommission(
  merchantId: string,
  termId: string,
  approve: boolean,
  note: string,
): Promise<CommissionResult> {
  const { error } = await createClient().rpc('rpc_merchant_commission_decide', {
    p_term_id: termId,
    p_approve: approve,
    ...(note.trim() ? { p_note: note.trim() } : {}),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/merchants/${merchantId}`);
  return {
    ok: true,
    message: approve ? 'Approved. New orders use this rate from its start day.' : 'Rejected.',
  };
}

export async function withdrawCommission(
  merchantId: string,
  termId: string,
): Promise<CommissionResult> {
  const { error } = await createClient().rpc('rpc_merchant_commission_withdraw', {
    p_term_id: termId,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/merchants/${merchantId}`);
  return { ok: true, message: 'Request withdrawn.' };
}
