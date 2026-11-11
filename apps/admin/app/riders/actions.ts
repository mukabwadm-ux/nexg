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

/** The rider paid for their kit in person, at the onboarding session. */
export async function markRiderKitPaid(
  riderId: string,
  input: { method: string; amountKes: number | null; reference: string },
): Promise<ReviewResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_rider_kit_mark_paid', {
    p_rider_id: riderId,
    p_method: input.method,
    ...(input.amountKes !== null ? { p_amount_kes: input.amountKes } : {}),
    ...(input.reference.trim() ? { p_reference: input.reference.trim() } : {}),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/riders/${riderId}`);
  revalidatePath('/riders');
  return { ok: true, message: 'Kit payment recorded.' };
}

/** The kit was handed over (collected or delivered). Refused until it is paid. */
export async function issueRiderKit(riderId: string): Promise<ReviewResult> {
  const supabase = createClient();
  /* Name the deposit argument (as null) so the two-argument overload is
     chosen unambiguously; the kit price is recorded with the payment. */
  const { error } = await supabase.rpc('rpc_rider_issue_kit', {
    p_rider_id: riderId,
    p_deposit_kes: null as unknown as number,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/riders/${riderId}`);
  revalidatePath('/riders');
  return { ok: true, message: 'Kit marked as handed over.' };
}

/*
 * An SOS is acknowledged by a named person, not by a link somebody
 * might follow by accident. A form post, so it cannot be triggered by a
 * prefetch or a crawler, and the RPC records who and when.
 */
export async function acknowledgeSos(formData: FormData): Promise<void> {
  const supabase = createClient();
  const id = String(formData.get('incident_id') ?? '');
  if (!id) return;

  await supabase.rpc('rpc_incident_sos_ack', { p_incident_id: id });

  revalidatePath('/riders');
  revalidatePath(`/riders/incidents/${id}`);
}
