'use server';

import { MerchantDpaAnnex, type MerchantDpaAnnexInput } from '@nexg/contracts/merchant-dpa';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * Accepting the Data Processing Agreement from the merchant's dashboard.
 *
 * The acceptance is recorded with the owner's own token, from this server,
 * so the database reads the visitor's address and device from the headers
 * it forwards (lib/request-context) and checks that the caller owns the
 * business. NexG then signs it from the admin console, as it does the
 * merchant agreement, and the signed copy appears on the Documents page.
 */

export interface DpaOutcome {
  ok: boolean;
  message?: string;
}

export async function acceptDpa(
  merchantId: string,
  version: string,
  annex: MerchantDpaAnnexInput,
): Promise<DpaOutcome> {
  const parsed = MerchantDpaAnnex.safeParse(annex);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the Annex 1 details.' };
  const { error } = await createClient().rpc('rpc_merchant_dpa_accept', {
    p_merchant_id: merchantId,
    p_version: version,
    p_annex: parsed.data,
  });
  if (error)
    return { ok: false, message: error.message || 'Your acceptance could not be saved. Retry.' };
  revalidatePath('/merchant/documents');
  revalidatePath('/merchant/business');
  revalidatePath('/merchant');
  return { ok: true };
}
