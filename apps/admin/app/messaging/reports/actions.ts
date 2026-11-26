'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * Acting on a chat report (20270328000300). Who may resolve it, what can be removed and the audit are decided in
 * the database; this only calls it.
 */

export interface ReportResult {
  ok: boolean;
  message?: string;
}

export async function resolveChatReport(input: {
  id: string;
  outcome: 'actioned' | 'dismissed';
  note: string;
  removeMessage: boolean;
  removeMember: boolean;
}): Promise<ReportResult> {
  const { data, error } = await createClient().rpc('rpc_chat_report_resolve', {
    p_report_id: input.id,
    p_outcome: input.outcome,
    p_note: input.note.trim() || undefined,
    p_remove_message: input.removeMessage,
    p_remove_member: input.removeMember,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/messaging/reports');
  const message =
    data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
      ? data.message
      : undefined;
  return { ok: true, message };
}
