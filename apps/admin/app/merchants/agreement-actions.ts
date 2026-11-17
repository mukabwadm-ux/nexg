'use server';

import { revalidatePath } from 'next/cache';

import { issueSignedAgreement, issueSummary } from '@/lib/merchant-agreement-signing';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Signs and issues the merchant's agreement now: for a merchant approved
 * before agreements were signed automatically, or one whose details or
 * NexG's signature were missing at approval. The database decides whether
 * this person may and whether the merchant is ready.
 */
export async function issueMerchantAgreement(
  merchantId: string,
): Promise<{ ok: boolean; message: string }> {
  const staff = await requireStaff();
  requireModule(staff, 'merchants');
  if (!UUID.test(merchantId)) return { ok: false, message: 'Unknown merchant.' };
  const result = await issueSignedAgreement(createClient(), merchantId);
  revalidatePath(`/merchants/${merchantId}`);
  revalidatePath(`/merchants/applications/${merchantId}`);
  return {
    ok: result.status === 'issued' || result.status === 'signed',
    message: issueSummary(result),
  };
}
