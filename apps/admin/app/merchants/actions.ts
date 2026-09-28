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

export interface Controls {
  accepting_orders?: boolean;
  explore_visible?: boolean;
  pay_on_delivery?: boolean;
  concierge_pick?: boolean;
}

/**
 * The four switches on the detail panel, in one audited call. Null leaves a
 * switch alone, so sending only what changed is the whole point — the audit
 * entry then records the action a person actually took.
 */
export async function setControls(merchantId: string, patch: Controls): Promise<ReviewResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_merchant_set_controls', {
    p_merchant_id: merchantId,
    ...(patch.accepting_orders !== undefined ? { p_accepting_orders: patch.accepting_orders } : {}),
    ...(patch.explore_visible !== undefined ? { p_explore_visible: patch.explore_visible } : {}),
    ...(patch.pay_on_delivery !== undefined ? { p_pay_on_delivery: patch.pay_on_delivery } : {}),
    ...(patch.concierge_pick !== undefined ? { p_concierge_pick: patch.concierge_pick } : {}),
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath('/merchants');
  return { ok: true, message: 'Saved.' };
}

export async function setPaused(
  merchantId: string,
  paused: boolean,
  reason: string,
): Promise<ReviewResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_merchant_set_paused', {
    p_merchant_id: merchantId,
    p_paused: paused,
    ...(reason.trim() ? { p_reason: reason.trim() } : {}),
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath('/merchants');
  return { ok: true, message: paused ? 'Listing paused.' : 'Listing live again.' };
}

/**
 * Suspension is proposed, not done. A different staff member has to approve
 * it — the database enforces that, this just starts the request.
 */
export async function requestSuspension(merchantId: string, reason: string): Promise<ReviewResult> {
  if (!reason.trim()) {
    return { ok: false, message: 'Say why. Whoever approves it sees this.' };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_merchant_request_suspension', {
    p_merchant_id: merchantId,
    p_reason: reason.trim(),
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath('/merchants');
  revalidatePath('/');
  return { ok: true, message: 'Sent for approval. Someone else has to sign it off.' };
}

export async function decideApproval(
  requestId: string,
  approve: boolean,
  note: string,
): Promise<ReviewResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_approval_decide', {
    p_request_id: requestId,
    p_approve: approve,
    ...(note.trim() ? { p_note: note.trim() } : {}),
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath('/merchants');
  revalidatePath('/');
  return { ok: true, message: approve ? 'Approved.' : 'Rejected.' };
}
