'use server';

import { sendTicketReceived } from '@/lib/email';
import { createClient } from '@/lib/supabase/server';

export interface TicketResult {
  ok: boolean;
  message: string;
  reference?: string;
}

/**
 * "Send us a message" on the Help page raises a ticket.
 *
 * It was briefly pointed at the Messaging module, which was a
 * mistake of mine: a form submission is not a chat. Nobody is
 * on the other end of it at that second, it needs a queue, a
 * clock and a status, and that is what Support is. Live chat —
 * the floating widget — is Messaging's, and the two stay apart.
 *
 * The acknowledgement still goes out and still never gates the
 * write: if email is down, or unconfigured, the person gets
 * their reference on screen and the desk gets the ticket.
 */
export async function submitTicket(input: {
  body: string;
  fromRole: 'guest' | 'rider' | 'merchant' | 'hotel';
  topic: string;
  fullName?: string;
  email?: string;
  phone?: string;
  orderReference?: string;
}): Promise<TicketResult> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('rpc_support_ticket_create', {
    p_body: input.body,
    p_from_role: input.fromRole,
    p_topic: input.topic as never,
    ...(input.fullName ? { p_full_name: input.fullName } : {}),
    ...(input.email ? { p_email: input.email } : {}),
    ...(input.phone ? { p_phone: input.phone } : {}),
    ...(input.orderReference ? { p_order_reference: input.orderReference } : {}),
    p_source_form: 'help',
    /* Which audience's version of the form they filled in. The
       topics differ per role, so the desk wants to know which
       set of questions was on screen. */
    p_details: { from_role: input.fromRole, topic: input.topic } as never,
  });

  if (error) return { ok: false, message: error.message };

  const created = data as unknown as {
    reference: string;
    notification_id: string;
    to_email: string | null;
  };

  if (created.to_email) {
    const outcome = await sendTicketReceived(created.to_email, {
      reference: created.reference,
      name: input.fullName ?? null,
      summary: input.body.slice(0, 400),
    });

    await supabase.rpc('rpc_notification_mark', {
      p_notification_id: created.notification_id,
      // "skipped" is not a notification_status in the database: no provider
      // is a pending message, not a failed one, and it should still show on
      // the desk's list of people who have not been told.
      p_status: outcome.status === 'skipped' ? 'failed' : outcome.status,
      ...(outcome.providerMessageId ? { p_provider_message_id: outcome.providerMessageId } : {}),
      ...(outcome.error ? { p_error: outcome.error } : {}),
    });
  }

  return { ok: true, message: 'Ticket created.', reference: created.reference };
}
