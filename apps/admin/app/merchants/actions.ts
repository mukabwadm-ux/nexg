'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export interface ReviewResult {
  ok: boolean;
  message: string;
}

/* Same reasoning as the rider actions: the RPCs hold the rules and write the
 * audit event in the same transaction, so nothing here writes a table directly. */

export async function verifyDocument(
  documentId: string,
  merchantId: string,
): Promise<ReviewResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_document_verify', { p_document_id: documentId });
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/merchants/${merchantId}`);
  return { ok: true, message: 'Verified.' };
}

export async function rejectDocument(
  documentId: string,
  merchantId: string,
  reason: string,
): Promise<ReviewResult> {
  if (!reason.trim()) {
    return { ok: false, message: 'Say what is wrong with it — the merchant sees this.' };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_document_reject', {
    p_document_id: documentId,
    p_reason: reason.trim(),
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/merchants/${merchantId}`);
  return { ok: true, message: 'Rejected. The merchant can upload a replacement.' };
}

export async function goLive(merchantId: string, reason: string): Promise<ReviewResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_merchant_go_live', {
    p_merchant_id: merchantId,
    ...(reason.trim() ? { p_reason: reason.trim() } : {}),
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/merchants/${merchantId}`);
  revalidatePath('/merchants');
  return { ok: true, message: 'Live. The business now shows on the public site.' };
}

/**
 * Homepage placement. Separate from going live on purpose: being open for
 * business and being advertised are two different decisions, and the RPC
 * refuses to feature anything that is not live.
 */
export async function setFeatured(merchantId: string, featured: boolean): Promise<ReviewResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_merchant_set_featured', {
    p_merchant_id: merchantId,
    p_featured: featured,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/merchants/${merchantId}`);
  revalidatePath('/merchants');
  return {
    ok: true,
    message: featured
      ? 'Featured. It now shows in the homepage band.'
      : 'Removed from the homepage band.',
  };
}
