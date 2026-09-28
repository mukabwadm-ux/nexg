'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export interface DeskResult {
  ok: boolean;
  message: string;
}

/*
 * Replies and status changes both go through RPCs. They decide when a ticket
 * counts as answered, when the response clock starts, and who it belongs to —
 * and they write the audit event in the same transaction. A plain update from
 * here would pass RLS and skip all of it.
 */

export async function reply(
  ticketId: string,
  body: string,
  internal: boolean,
): Promise<DeskResult> {
  if (!body.trim()) return { ok: false, message: 'Write something first.' };

  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_support_ticket_reply', {
    p_ticket_id: ticketId,
    p_body: body.trim(),
    p_internal: internal,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath('/concierge');
  return {
    ok: true,
    message: internal
      ? 'Note saved. The guest does not see it.'
      : 'Reply saved against the ticket.',
  };
}

export async function setStatus(
  ticketId: string,
  status: 'open' | 'assigned' | 'answered' | 'resolved' | 'closed',
  assignToMe = false,
): Promise<DeskResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_support_ticket_set_status', {
    p_ticket_id: ticketId,
    p_status: status,
    p_assign_to_me: assignToMe,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath('/concierge');
  revalidatePath('/');
  return { ok: true, message: `Ticket is now ${status}.` };
}
