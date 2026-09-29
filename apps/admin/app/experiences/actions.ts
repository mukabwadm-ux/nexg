'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export interface Outcome {
  ok: boolean;
  message?: string;
}

/**
 * Every write on the Experiences module.
 *
 * All of them are thin: the rule lives in the RPC, which checks it whether
 * the call came from this console, from a partner's portal or from a
 * script. What these add is the redirect path to revalidate and a message
 * a person can read.
 */
function fail(error: { message: string } | null): Outcome | null {
  if (!error) return null;
  /* Postgres raises these with a sentence written for the reader; the
     prefix it adds is not. */
  return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
}

// ─────────────────────────────────────────────────────────── the desk

export async function claimPlan(planId: string): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_claim_plan', { p_plan_id: planId });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath('/experiences');
  revalidatePath(`/experiences/plans/${planId}`);
  return { ok: true, message: 'It is yours.' };
}

export async function handoverPlan(
  planId: string,
  to: string,
  reason: string,
): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_handover_plan', {
    p_plan_id: planId,
    p_to: to,
    p_reason: reason,
  });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath(`/experiences/plans/${planId}`);
  return { ok: true, message: 'Handed over.' };
}

export async function sendMessage(planId: string, body: string): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_plan_message', {
    p_plan_id: planId,
    p_body: body,
  });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath(`/experiences/plans/${planId}`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────── the blocks

export async function confirmBlock(
  planId: string,
  blockId: string,
  priceKes: number | null,
): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_confirm_block', {
    p_block_id: blockId,
    p_price_kes: priceKes ?? undefined,
  });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath(`/experiences/plans/${planId}`);
  return { ok: true, message: 'Confirmed.' };
}

export async function changeBlock(
  planId: string,
  blockId: string,
  patch: { start_time?: string; price_quoted_kes?: number; component_id?: string },
  note: string,
): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_change_block', {
    p_block_id: blockId,
    p_patch: patch,
    p_note: note,
  });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath(`/experiences/plans/${planId}`);
  return { ok: true, message: 'Changed — the guest can see the reason.' };
}

export async function blockUnavailable(
  planId: string,
  blockId: string,
  note: string,
): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_block_unavailable', {
    p_block_id: blockId,
    p_note: note,
  });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath(`/experiences/plans/${planId}`);
  return { ok: true, message: 'Marked unavailable, with the alternatives.' };
}

export async function removeBlock(
  planId: string,
  blockId: string,
  note: string,
): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_remove_block', {
    p_block_id: blockId,
    p_note: note,
  });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath(`/experiences/plans/${planId}`);
  return { ok: true, message: 'Removed.' };
}

export async function requestHold(
  planId: string,
  blockId: string,
  channel: string,
  message: string,
): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_request_hold', {
    p_block_id: blockId,
    p_channel: channel,
    p_message: message,
  });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath(`/experiences/plans/${planId}`);
  return { ok: true, message: 'Asked. The send is logged either way.' };
}

// ─────────────────────────────────────────────────────── the money

export async function quotePlan(planId: string): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_quote_plan', { p_plan_id: planId });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath('/experiences');
  revalidatePath(`/experiences/plans/${planId}`);
  return { ok: true, message: 'Quote sent.' };
}

export async function markPaid(planId: string, reference: string): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_mark_paid', {
    p_plan_id: planId,
    p_reference: reference,
  });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath(`/experiences/plans/${planId}`);
  return { ok: true, message: 'Recorded against that reference.' };
}

export async function assignDriver(
  planId: string,
  riderId: string | null,
  partnerId: string | null,
): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_assign_driver', {
    p_plan_id: planId,
    p_rider_id: riderId ?? undefined,
    p_partner_id: partnerId ?? undefined,
  });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath(`/experiences/plans/${planId}`);
  return { ok: true, message: 'The guest has the plate.' };
}

export async function blockDone(planId: string, blockId: string): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_block_done', { p_block_id: blockId });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath(`/experiences/plans/${planId}`);
  return { ok: true };
}

export async function completePlan(planId: string, note: string | null): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_complete_plan', {
    p_plan_id: planId,
    p_override_note: note ?? undefined,
  });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath(`/experiences/plans/${planId}`);
  return { ok: true, message: 'Day closed.' };
}

export async function cancelPlan(planId: string, reason: string): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_cancel_plan', {
    p_plan_id: planId,
    p_reason: reason,
  });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath(`/experiences/plans/${planId}`);
  return { ok: true, message: 'Cancelled.' };
}

// ──────────────────────────────────────────────────────── reviews

export async function askForReview(planId: string): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_request_review', { p_plan_id: planId });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath('/experiences');
  return { ok: true, message: 'Asked. Once is the rule — there is no second time.' };
}

export async function decideReview(
  reviewId: string,
  decision: 'approved' | 'kept_private',
  reason: string | null,
  display: 'initial' | 'full_name' | 'anonymous' | null,
): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_decide_review', {
    p_review_id: reviewId,
    p_decision: decision,
    p_reason: reason ?? undefined,
    p_display: display ?? undefined,
  });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath('/experiences');
  return {
    ok: true,
    message: decision === 'approved' ? 'Published, in the form they agreed to.' : 'Kept private.',
  };
}

export async function replyToReview(reviewId: string, body: string): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_reply_review', {
    p_review_id: reviewId,
    p_body: body,
  });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath('/experiences');
  return { ok: true, message: 'Sent.' };
}

// ──────────────────────────────────────────────────────── catalogue

export async function publishEvent(eventId: string): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_publish_event', { p_event_id: eventId });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath('/experiences');
  return { ok: true, message: 'Published.' };
}

export async function rejectEvent(eventId: string, reason: string): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_reject_event_submission', {
    p_event_id: eventId,
    p_reason: reason,
  });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath('/experiences');
  return { ok: true, message: 'Rejected — the partner is told why.' };
}

export async function publishCuratedDay(dayId: string): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_publish_curated_day', { p_day_id: dayId });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath('/experiences');
  return { ok: true, message: 'Live on the home page.' };
}

export async function partnerGoLive(partnerId: string): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_partner_go_live', { p_partner_id: partnerId });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath('/experiences');
  return { ok: true, message: 'Live.' };
}

/** A concierge clocking on or off. */
export async function setShift(cityId: string, online: boolean): Promise<Outcome> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Not signed in.' };

  const { data: staff } = await supabase
    .from('staff_user')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!staff) return { ok: false, message: 'Not staff.' };

  const { error } = await supabase
    .from('concierge_shift')
    .upsert(
      { staff_user_id: staff.id, city_id: cityId, online, since: new Date().toISOString() },
      { onConflict: 'staff_user_id,city_id' },
    );

  const bad = fail(error);
  if (bad) return bad;
  revalidatePath('/experiences');
  return { ok: true, message: online ? 'On shift.' : 'Off shift.' };
}
