'use server';

import { MerchantDpaAnnex, type MerchantDpaAnnexInput } from '@nexg/contracts/merchant-dpa';
import { revalidatePath } from 'next/cache';

import { storeDpaCopy } from '@/lib/merchant-dpa-copy';
import { createClient } from '@/lib/supabase/server';

/**
 * Accepting the Data Processing Agreement from the merchant's dashboard.
 *
 * The acceptance is recorded with the owner's own token, from this server,
 * so the database reads the visitor's address and device from the headers
 * it forwards (lib/request-context) and checks that the caller owns the
 * business. Then the signed copy is made (lib/merchant-dpa-copy). If that
 * fails the acceptance stands and the page offers to make the copy again.
 */

export interface DpaOutcome {
  ok: boolean;
  message?: string;
  /** Accepted, but the signed copy is not stored yet. */
  copyPending?: boolean;
}

interface Acceptance {
  id: string;
  current: boolean;
  storage_path: string | null;
}

function revalidate() {
  revalidatePath('/merchant/documents');
  revalidatePath('/merchant/business');
  revalidatePath('/merchant');
}

export async function acceptDpa(
  merchantId: string,
  version: string,
  annex: MerchantDpaAnnexInput,
): Promise<DpaOutcome> {
  const parsed = MerchantDpaAnnex.safeParse(annex);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the Annex 1 details.' };
  const { data, error } = await createClient().rpc('rpc_merchant_dpa_accept', {
    p_merchant_id: merchantId,
    p_version: version,
    p_annex: parsed.data,
  });
  if (error)
    return { ok: false, message: error.message || 'Your acceptance could not be saved. Retry.' };
  const current = (
    (data as unknown as { acceptances?: Acceptance[] } | null)?.acceptances ?? []
  ).find((entry) => entry.current);
  revalidate();
  if (!current) return { ok: true, copyPending: true };
  if (current.storage_path) return { ok: true };
  const copy = await storeDpaCopy(current.id);
  revalidate();
  return copy.status === 'stored' ? { ok: true } : { ok: true, copyPending: true };
}

/** Makes the signed copy of the current acceptance, when an earlier try failed. */
export async function makeDpaCopy(merchantId: string): Promise<DpaOutcome> {
  // Read with the member's own token: only the business's own members get here.
  const { data, error } = await createClient().rpc('rpc_merchant_dpa_read', {
    p_merchant_id: merchantId,
  });
  if (error) return { ok: false, message: error.message };
  const current = (
    (data as unknown as { acceptances?: Acceptance[] } | null)?.acceptances ?? []
  ).find((entry) => entry.current);
  if (!current) return { ok: false, message: 'Accept the data processing agreement first.' };
  if (current.storage_path) return { ok: true };
  const copy = await storeDpaCopy(current.id);
  revalidate();
  return copy.status === 'stored'
    ? { ok: true }
    : { ok: false, copyPending: true, message: copy.message };
}
