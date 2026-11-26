'use server';

import { revalidatePath } from 'next/cache';

import { issueSignedAgreement, issueSummary } from '@/lib/merchant-agreement-signing';
import { dpaIssueSummary, issueSignedDpa } from '@/lib/merchant-dpa-signing';
import { liveEmailStatus, liveEmailSummary } from '@/lib/merchant-live-email';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Signs and issues the merchant's agreement now: for a merchant approved
 * before agreements were signed automatically, or one whose details or
 * NexG's signature were missing at approval. The database decides whether
 * this person may and whether the merchant is ready. Signing a live
 * merchant's agreement also emails the owner (20270131000500); the message
 * says whether it went.
 */
export async function issueMerchantAgreement(
  merchantId: string,
): Promise<{ ok: boolean; message: string }> {
  const staff = await requireStaff();
  requireModule(staff, 'merchants');
  if (!UUID.test(merchantId)) return { ok: false, message: 'Unknown merchant.' };
  const client = createClient();
  const result = await issueSignedAgreement(client, merchantId);
  const email =
    result.status === 'issued'
      ? liveEmailSummary((await liveEmailStatus(client, merchantId)).status)
      : '';
  revalidatePath(`/merchants/${merchantId}`);
  revalidatePath(`/merchants/applications/${merchantId}`);
  return {
    ok: result.status === 'issued' || result.status === 'signed',
    message: [issueSummary(result), email].filter(Boolean).join(' '),
  };
}

/**
 * Send again: the owner's "business is live" email, when it did not go
 * (skipped, failed after its retries, or never queued). The database refuses
 * once it was sent, while it is still waiting, and while the business is not
 * live, and records who asked.
 */
export async function resendLiveEmail(
  merchantId: string,
): Promise<{ ok: boolean; message: string }> {
  const staff = await requireStaff();
  requireModule(staff, 'merchants');
  if (!UUID.test(merchantId)) return { ok: false, message: 'Unknown merchant.' };
  const client = createClient();
  const { data, error } = await client.rpc('rpc_merchant_live_email_resend', {
    p_merchant_id: merchantId,
  });
  revalidatePath(`/merchants/${merchantId}`);
  if (error) return { ok: false, message: error.message };
  const result = data as unknown as { status: string; reason: string | null };
  return result.status === 'queued'
    ? { ok: true, message: 'Queued. It goes out within a minute or two.' }
    : { ok: false, message: result.reason ?? 'It was not queued.' };
}

/**
 * Signs and issues the merchant's Data Processing Agreement now, with NexG's
 * signatory and signature, once the merchant has accepted it: for a merchant
 * that accepted after approval, or one whose signature setup was missing.
 */
export async function issueMerchantDpa(
  merchantId: string,
): Promise<{ ok: boolean; message: string }> {
  const staff = await requireStaff();
  requireModule(staff, 'merchants');
  if (!UUID.test(merchantId)) return { ok: false, message: 'Unknown merchant.' };
  const result = await issueSignedDpa(createClient(), merchantId);
  revalidatePath(`/merchants/${merchantId}`);
  revalidatePath(`/merchants/applications/${merchantId}`);
  return {
    ok: result.status === 'issued' || result.status === 'signed',
    message: dpaIssueSummary(result),
  };
}
