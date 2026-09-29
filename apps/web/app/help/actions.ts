'use server';

import { sendTicketReceived } from '@/lib/email';
import { createClient } from '@/lib/supabase/server';

export interface TicketResult {
  ok: boolean;
  message: string;
  reference?: string;
}

/**
 * Create a ticket, then try to acknowledge it.
 *
 * The send happens after the ticket exists and never gates it. If email is
 * down, or unconfigured — which it is until a provider key lands — the person
 * still gets their reference on screen and the desk still gets the ticket.
 * What they do not get is a silent failure: the outcome is recorded against
 * the notification either way.
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
