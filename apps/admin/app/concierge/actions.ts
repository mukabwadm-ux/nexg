'use server';

import { revalidatePath } from 'next/cache';

import { sendTicketResolved } from '@/lib/email';
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
  const { data, error } = await supabase.rpc('rpc_support_ticket_set_status', {
    p_ticket_id: ticketId,
    p_status: status,
    p_assign_to_me: assignToMe,
  });
  if (error) return { ok: false, message: error.message };

  const ticket = data as unknown as {
    reference: string;
    email: string | null;
    full_name: string | null;
  } | null;

  /*
   * The RPC queues the "we have closed this" notification on the transition
   * into resolved, and only once. Send whatever is still pending for this
   * ticket — which is nothing if it was already resolved, so pressing the
   * button twice cannot email anyone twice.
   */
  let note = '';
  if (ticket && (status === 'resolved' || status === 'closed')) {
    const { data: pending } = await supabase
      .from('notification')
      .select('id, to_email')
      .eq('ticket_id', ticketId)
      .eq('kind', 'ticket_resolved')
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();

    if (pending?.to_email) {
      const outcome = await sendTicketResolved(pending.to_email, {
        reference: ticket.reference,
        name: ticket.full_name,
      });

      await supabase.rpc('rpc_notification_mark', {
        p_notification_id: pending.id,
        p_status: outcome.status === 'skipped' ? 'failed' : outcome.status,
        ...(outcome.providerMessageId ? { p_provider_message_id: outcome.providerMessageId } : {}),
        ...(outcome.error ? { p_error: outcome.error } : {}),
      });

      note =
        outcome.status === 'sent'
          ? ' They have been emailed.'
          : ' Email did not go out — see the ticket.';
    } else if (ticket && !ticket.email) {
      note = ' No email on file, so nothing was sent.';
    }
  }

  revalidatePath('/concierge');
  revalidatePath('/');
  return { ok: true, message: `Ticket is now ${status}.${note}` };
}
