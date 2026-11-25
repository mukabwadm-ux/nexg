'use server';

import { revalidatePath } from 'next/cache';

import { needsReason, REVIEW_DECISIONS, type ReviewDecision } from '@/lib/property-detail';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

const VERIFICATION_METHODS = ['listing_ownership', 'id_document', 'call'] as const;

export async function verifyHost(input: {
  hostId: string;
  method: string;
  evidence: string;
}): Promise<{ error?: string; success?: boolean }> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.hostId)
  ) {
    return { error: 'The host ID is invalid.' };
  }

  if (!VERIFICATION_METHODS.some((method) => method === input.method)) {
    return { error: 'Choose a valid verification method.' };
  }

  const evidence = input.evidence.trim();
  if (!evidence) return { error: 'Describe the evidence you checked.' };

  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_host_verify', {
    p_host_id: input.hostId,
    p_method: input.method,
    p_evidence: { notes: evidence },
  });

  if (error) return { error: `Could not verify this host: ${error.message}` };

  revalidatePath('/hotels');
  revalidatePath(`/hotels/hosts/${input.hostId}/verify`);
  return { success: true };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Approve or reject one host document. Rejecting a required one sends the host back to fix it. */
export async function reviewHostDocument(input: {
  hostId: string;
  documentId: string;
  approve: boolean;
  reason: string;
}): Promise<{ error?: string; success?: boolean }> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  if (!uuid.test(input.hostId) || !uuid.test(input.documentId))
    return { error: 'The document ID is invalid.' };
  const reason = input.reason.trim();
  if (!input.approve && reason.length < 5)
    return { error: 'Tell the host what to fix (at least a few words).' };

  /* rpc_host_document_review is newer than the generated types. */
  const supabase = createClient();
  const rpc = supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: { message: string } | null }>;
  const { error } = await rpc.call(supabase, 'rpc_host_document_review', {
    p_document_id: input.documentId,
    p_approve: input.approve,
    p_reason: input.approve ? null : reason.slice(0, 500),
  });
  if (error) return { error: `Could not save the review: ${error.message}` };

  revalidatePath(`/hotels/hosts/${input.hostId}/verify`);
  revalidatePath('/hotels');
  return { success: true };
}

export async function listHostPrivacyShares(requestId: string) {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  if (!uuid.test(requestId)) return { error: 'Choose a valid data request.' } as const;
  const { data, error } = await createClient().rpc('rpc_host_workspace_data_share_options', {
    p_request_id: requestId,
  });
  return error
    ? ({ error: 'Host status options could not be loaded.' } as const)
    : ({ rows: data ?? [] } as const);
}

export async function setHostPrivacyShare(requestId: string, hostId: string, shared: boolean) {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  if (!uuid.test(requestId) || !uuid.test(hostId) || typeof shared !== 'boolean')
    return { error: 'Choose a valid request and host.' };
  const { error } = await createClient().rpc('rpc_host_workspace_data_share_set', {
    p_request_id: requestId,
    p_host_id: hostId,
    p_shared: shared,
  });
  if (error)
    return {
      error:
        error.code === '22023' || error.code === '42501'
          ? error.message
          : 'Status sharing could not be saved.',
    };
  revalidatePath('/hotels');
  return { ok: true };
}

/** Record the M-Pesa reference of a stay refund that has been sent back to the guest. */
export async function recordStayRefund(input: {
  stayId: string;
  reference: string;
  note: string;
}): Promise<{ error?: string; success?: boolean }> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  if (!uuid.test(input.stayId)) return { error: 'The stay ID is invalid.' };
  const reference = input.reference.trim();
  if (!reference) return { error: 'Enter the M-Pesa reference of the refund.' };

  const { error } = await createClient().rpc('rpc_stay_refund_record', {
    p_stay_id: input.stayId,
    p_reference: reference.slice(0, 64),
    p_note: input.note.trim().slice(0, 500) || undefined,
  });
  if (error)
    return {
      error:
        error.code === '22023' || error.code === '42501'
          ? error.message
          : 'The refund could not be recorded. Try again.',
    };
  revalidatePath('/hotels');
  return { success: true };
}

/**
 * Declares where a host is paid their stay shares and referral rewards.
 * Declaring again clears Finance's verification, and the weekly run holds
 * the host's payouts until someone with full Finance, other than whoever
 * declared them, verifies the details. Who may declare (hospitality staff)
 * is checked by the RPC.
 */
export async function declareHostPayout(
  hostId: string,
  payout: Record<string, string>,
): Promise<{ ok: boolean; message?: string }> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  if (!uuid.test(hostId)) return { ok: false, message: 'The host ID is invalid.' };

  const { data, error } = await createClient().rpc('rpc_host_payout_declare', {
    p_host_id: hostId,
    p_payout: payout,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === '22023' || error.code === '42501' || error.code === 'P0002'
          ? error.message
          : 'The payout details could not be saved. Try again.',
    };
  revalidatePath('/hotels');
  revalidatePath('/finance/settlements');
  return {
    ok: true,
    message:
      (data as { message?: string } | null)?.message ??
      'Saved. Finance verifies the details before a payout run pays the host.',
  };
}

/**
 * NexG's check of a property: approve, reject or suspend (both with a
 * reason the host can act on), or reinstate. Who may decide, and which
 * move is allowed from which state, is checked by rpc_property_review,
 * which also writes audit.log.
 */
export async function reviewProperty(input: {
  propertyId: string;
  decision: string;
  reason: string;
}): Promise<{ error?: string; success?: boolean }> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  if (!uuid.test(input.propertyId)) return { error: 'The property ID is invalid.' };
  if (!isReviewDecision(input.decision)) return { error: 'Choose a valid decision.' };
  const reason = input.reason.trim();
  if (needsReason(input.decision) && reason.length < 5)
    return { error: 'Give the reason, in words the host can act on.' };

  const { error } = await createClient().rpc('rpc_property_review', {
    p_property_id: input.propertyId,
    p_decision: input.decision,
    p_reason: reason ? reason.slice(0, 500) : undefined,
  });
  if (error)
    return {
      error:
        error.code === '22023' || error.code === '42501' || error.code === 'P0002'
          ? error.message
          : 'The decision could not be saved. Try again.',
    };

  revalidatePath(`/hotels/properties/${input.propertyId}`);
  revalidatePath('/hotels');
  return { success: true };
}

function isReviewDecision(v: string): v is ReviewDecision {
  return (REVIEW_DECISIONS as readonly string[]).includes(v);
}
