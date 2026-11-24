'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * NexG in a guest and host stay chat (20270314000500). Who may read, join and write, and the audit of each, is
 * decided in the database; these only call it.
 */

export interface StayChatResult {
  ok: boolean;
  message?: string;
}

function done(error: { message: string } | null, data: unknown): StayChatResult {
  if (error) return { ok: false, message: error.message };
  revalidatePath('/messaging/stays');
  const message =
    data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
      ? data.message
      : undefined;
  return { ok: true, message };
}

export async function joinStayChat(id: string): Promise<StayChatResult> {
  const { data, error } = await createClient().rpc('rpc_stay_chat_staff_join', { p_thread_id: id });
  return done(error, data);
}

export async function leaveStayChat(id: string): Promise<StayChatResult> {
  const { data, error } = await createClient().rpc('rpc_stay_chat_staff_leave', {
    p_thread_id: id,
  });
  return done(error, data);
}

export async function sendStayChat(id: string, body: string, key: string): Promise<StayChatResult> {
  const { error } = await createClient().rpc('rpc_stay_chat_staff_send', {
    p_thread_id: id,
    p_body: body,
    /* From the browser, kept across a retry of the same text, so a retry stores it once. */
    p_idempotency_key: key,
  });
  return done(error, null);
}

export async function readStayChat(id: string): Promise<void> {
  await createClient().rpc('rpc_stay_chat_staff_read', { p_thread_id: id });
}
