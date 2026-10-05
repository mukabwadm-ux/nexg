'use server';

import { sendTicketReceived } from '@/lib/email';
import { createClient } from '@/lib/supabase/server';

export interface TicketResult {
  ok: boolean;
  message: string;
  reference?: string;
}

/**
 * The Help form now writes a conversation, not a ticket.
 *
 * Support & tickets folded into Messaging — the history was
 * brought across by `fn_msg_absorb_legacy` — but this form was
 * still calling `rpc_support_ticket_create`, so every new
 * message landed straight back in the table that had just been
 * emptied. A consolidation whose inflow still points at the old
 * place is a copy, not a consolidation.
 *
 * The acknowledgement still goes out and still never gates the
 * write: if email is down, or unconfigured, the person gets
 * their reference on screen and the desk gets the conversation.
 */

/*
 * The form's topics and the module's topics are different
 * vocabularies. Mapped here rather than renamed in the form,
 * because the labels on screen are the words a guest
 * understands ("Problem with an order") and the enum is the
 * word the desk sorts by.
 */
const TOPIC: Record<string, string> = {
  order_problem: 'my_order',
  payment_or_refund: 'payment',
  concierge_request: 'something_else',
  account: 'something_else',
  partner_rider: 'rider_application',
  partner_merchant: 'merchant_application',
  hotel_partnership: 'hotel_or_airbnb',
  something_else: 'something_else',
};

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

  /* The form guarantees one of these; the RPC refuses without
     one, because a message we cannot answer is not a message. */
  const contact = input.email?.trim() || input.phone?.trim() || '';

  const { data, error } = await supabase.rpc('rpc_msg_contact', {
    p_name: input.fullName ?? '',
    p_contact: contact,
    p_topic: (TOPIC[input.topic] ?? 'something_else') as never,
    p_body: input.orderReference
      ? `${input.body}\n\nOrder: ${input.orderReference}`
      : input.body,
    p_consent: true,
  });

  if (error) return { ok: false, message: error.message };

  const created = data as unknown as {
    reference: string;
    to_email: string | null;
  };

  if (created.to_email) {
    /*
     * Fired and not awaited for its outcome beyond the send.
     *
     * The notification bookkeeping this used to do hung off the
     * ticket RPC's return value, which no longer exists. The
     * conversation is the record now, and wiring message
     * delivery receipts back onto it belongs with the
     * notifications worker rather than being half-done here.
     */
    await sendTicketReceived(created.to_email, {
      reference: created.reference,
      name: input.fullName ?? null,
      summary: input.body.slice(0, 400),
    });
  }

  return {
    ok: true,
    message: 'Sent. A person at the desk will reply to you.',
    reference: created.reference,
  };
}
