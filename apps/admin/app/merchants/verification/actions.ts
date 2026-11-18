'use server';

import { revalidatePath } from 'next/cache';

import { remindToUpload } from '@/app/documents/actions';
import { goLive, type ReviewResult } from '@/app/merchants/actions';
import { createClient } from '@/lib/supabase/server';

/*
 * Merchant Verification's own actions. Each is a thin call to the RPC that
 * already holds the rule and writes the audit event; nothing here writes a
 * table. Deciding an application on the form keeps going through
 * /api/merchant-applications/review, as on the application page.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh(merchantId: string) {
  revalidatePath('/merchants/verification');
  revalidatePath(`/merchants/${merchantId}`);
}

/**
 * Request more information from a merchant who applied before the
 * application form: send the named documents back, each with the reason
 * the merchant will read. The merchant returns to "documents pending".
 */
export async function sendBackDocuments(
  merchantId: string,
  reasons: Record<string, string>,
): Promise<ReviewResult> {
  if (!UUID.test(merchantId)) return { ok: false, message: 'That merchant link is not valid.' };
  const clean: Record<string, string> = {};
  for (const [documentId, reason] of Object.entries(reasons)) {
    const text = reason.trim().slice(0, 1000);
    if (UUID.test(documentId) && text) clean[documentId] = text;
  }
  if (Object.keys(clean).length === 0) {
    return { ok: false, message: 'Choose at least one document and say what needs fixing.' };
  }

  const { error } = await createClient().rpc('rpc_merchant_return_to_applicant', {
    p_merchant_id: merchantId,
    p_reasons: clean,
  });
  if (error) return { ok: false, message: error.message };

  refresh(merchantId);
  const n = Object.keys(clean).length;
  return {
    ok: true,
    message: `${n === 1 ? 'One document' : `${n} documents`} sent back. The merchant sees each reason and can upload again.`,
  };
}

/** Approve & Activate for a merchant whose application is already approved, or who has none. */
export async function activateMerchant(merchantId: string): Promise<ReviewResult> {
  if (!UUID.test(merchantId)) return { ok: false, message: 'That merchant link is not valid.' };
  const result = await goLive(merchantId, 'Verified and activated from Merchant Verification');
  refresh(merchantId);
  return result;
}

/**
 * Bulk "Remind about missing documents": for each chosen merchant, chase
 * every required document that has not arrived. The RPC refuses what it
 * should (already in, chased too recently, no number to send to); those
 * are counted, not hidden.
 */
export async function remindMissingDocuments(
  merchantIds: string[],
): Promise<{ ok: boolean; message: string }> {
  const ids = [...new Set(merchantIds.filter((id) => UUID.test(id)))].slice(0, 25);
  if (ids.length === 0) return { ok: false, message: 'Choose at least one merchant.' };

  const supabase = createClient();
  let sent = 0;
  let refused = 0;
  let nothing = 0;
  let firstRefusal: string | null = null;

  for (const id of ids) {
    const [required, onFile] = await Promise.all([
      supabase.rpc('fn_merchant_required_docs', { p_merchant_id: id }),
      supabase
        .from('document')
        .select('requirement_id')
        .eq('owner_type', 'merchant')
        .eq('owner_id', id)
        .is('superseded_at', null),
    ]);
    if (required.error || onFile.error) {
      refused += 1;
      firstRefusal ??= (required.error ?? onFile.error)!.message;
      continue;
    }
    const have = new Set(
      ((onFile.data ?? []) as { requirement_id: string }[]).map((d) => d.requirement_id),
    );
    const missing = ((required.data ?? []) as { id: string; kind: string }[]).filter(
      (r) => !have.has(r.id),
    );
    if (missing.length === 0) {
      nothing += 1;
      continue;
    }
    for (const requirement of missing) {
      const result = await remindToUpload('merchant', id, requirement.kind);
      if (result.ok) sent += 1;
      else {
        refused += 1;
        firstRefusal ??= result.message;
      }
    }
  }

  revalidatePath('/merchants/verification');
  const parts = [
    sent > 0 ? `${sent} reminder${sent === 1 ? '' : 's'} recorded` : null,
    nothing > 0 ? `${nothing} merchant${nothing === 1 ? ' has' : 's have'} nothing missing` : null,
    refused > 0 ? `${refused} not sent${firstRefusal ? ` (${firstRefusal})` : ''}` : null,
  ].filter(Boolean);
  return { ok: sent > 0 || (refused === 0 && nothing > 0), message: `${parts.join('; ')}.` };
}
