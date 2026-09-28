'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export interface ReviewResult {
  ok: boolean;
  message: string;
}

/*
 * Every one of these goes through an RPC rather than an update. The RPCs are
 * where the rules live — a rejection needs a reason, a rider cannot be
 * activated with an unverified document, and each writes its audit event in
 * the same transaction as the change (ground rule 4). Doing it with a plain
 * update from here would pass RLS and skip all of that.
 */

export async function verifyDocument(documentId: string, riderId: string): Promise<ReviewResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_document_verify', { p_document_id: documentId });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/riders/${riderId}`);
  return { ok: true, message: 'Verified.' };
}

export async function rejectDocument(
  documentId: string,
  riderId: string,
  reason: string,
): Promise<ReviewResult> {
  if (!reason.trim()) {
    return { ok: false, message: 'Say what is wrong with it — the applicant sees this.' };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_document_reject', {
    p_document_id: documentId,
    p_reason: reason.trim(),
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/riders/${riderId}`);
  return { ok: true, message: 'Rejected. The applicant can upload a replacement.' };
}

export async function activateRider(riderId: string, reason: string): Promise<ReviewResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_activate_rider', {
    p_rider_id: riderId,
    ...(reason.trim() ? { p_reason: reason.trim() } : {}),
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/riders/${riderId}`);
  revalidatePath('/riders');
  return { ok: true, message: 'Rider activated.' };
}
