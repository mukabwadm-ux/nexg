'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * Everything the desk can do, as server actions over the RPCs.
 *
 * Thin on purpose. Whether an escalated dispatcher may answer
 * the guest, whether a resolution needs a topic, whether a
 * retry sends twice — all of that is decided in the database,
 * where it applies to the partner dashboards and the widget
 * too. A rule enforced here would hold only for this console.
 */

export interface Result {
  ok: boolean;
  message?: string;
}

export async function takeConversation(id: string): Promise<Result> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_msg_take', { p_conversation: id });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/messaging');
  return data as unknown as Result;
}

export async function sendMessage(
  id: string,
  body: string,
  visibility: 'external' | 'internal',
): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_msg_send', {
    p_conversation: id,
    p_body: body,
    p_visibility: visibility,
    /*
     * A key per send, so a double-click or a retry on a flaky
     * connection is one message. Generated here rather than in
     * the browser because the browser's copy of a form can be
     * submitted twice with the same key only by accident, and
     * that is exactly the case worth collapsing.
     */
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/messaging');
  return { ok: true };
}

export async function escalate(
  id: string,
  team: string | null,
  staffId: string | null,
  note: string,
  handOver: boolean,
): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_msg_escalate', {
    p_conversation: id,
    p_to_team: team ?? undefined,
    p_to_staff: staffId ?? undefined,
    p_note: note || undefined,
    p_hand_over: handOver,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/messaging');
  return {
    ok: true,
    message: handOver
      ? 'Handed over. The guest has been told who they are with now.'
      : 'They can see the conversation and reply in the thread. You are still the guest’s contact.',
  };
}

export async function resolveConversation(
  id: string,
  topic: string,
  subtopic: string,
  note: string,
): Promise<Result> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_msg_resolve', {
    p_conversation: id,
    p_topic: topic as never,
    p_subtopic: subtopic || undefined,
    p_note: note || undefined,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/messaging');
  const result = data as { resolved_in_one?: boolean };
  return {
    ok: true,
    message: result.resolved_in_one
      ? 'Resolved in one reply.'
      : 'Resolved. Tagged so the pattern shows up in Insights.',
  };
}

export async function pinDecision(
  id: string,
  summary: string,
  reason: string,
): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_msg_pin_decision', {
    p_conversation: id,
    p_summary: summary,
    p_reason: reason,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/messaging');
  return { ok: true, message: 'Pinned. It stays with the record.' };
}

export async function setPresence(state: string): Promise<Result> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_msg_presence', { p_state: state });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
