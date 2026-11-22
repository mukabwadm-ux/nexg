import type { Database } from '@nexg/db';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The owner's "your business is live" email, with the signed agreement
 * attached (20270131000500). The database sends it by itself once the
 * agreement is signed and the business is live, whichever comes last, and
 * only once per signed agreement; staff see where it stands here and can
 * send it again when it did not go.
 */

type Client = SupabaseClient<Database>;

export type LiveEmailState =
  | 'not_signed'
  | 'not_live'
  | 'not_queued'
  | 'waiting'
  | 'sent'
  | 'failed'
  | 'skipped'
  | 'error';

/** What rpc_merchant_live_email returns. */
export interface LiveEmailStatus {
  state: LiveEmailState;
  live: boolean;
  reference: string | null;
  /** Masked: a•••@example.com. */
  recipient: string | null;
  recipient_source: 'owner_sign_in' | 'business_email' | null;
  reason: string | null;
  queued_at: string | null;
  sent_at: string | null;
  attempts: number | null;
  last_error: string | null;
  sends: number | null;
  can_resend: boolean;
}

export async function liveEmailStatus(
  client: Client,
  merchantId: string,
): Promise<{ status: LiveEmailStatus | null; error: string | null }> {
  const { data, error } = await client.rpc('rpc_merchant_live_email', {
    p_merchant_id: merchantId,
  });
  if (error) return { status: null, error: error.message };
  return { status: data as unknown as LiveEmailStatus, error: null };
}

const SOURCE: Record<string, string> = {
  owner_sign_in: 'the owner’s sign-in email',
  business_email: 'the business email',
};

export function recipientLabel(status: Pick<LiveEmailStatus, 'recipient' | 'recipient_source'>) {
  if (!status.recipient) return null;
  const source = status.recipient_source ? SOURCE[status.recipient_source] : null;
  return source ? `${status.recipient} (${source})` : status.recipient;
}

/** One line for staff after signing or going live; empty when there is nothing to say. */
export function liveEmailSummary(status: LiveEmailStatus | null): string {
  if (!status) return '';
  const to = recipientLabel(status);
  switch (status.state) {
    case 'waiting':
      return `The owner is being emailed that the business is live, with the signed agreement attached${to ? `, at ${to}` : ''}.`;
    case 'sent':
      return `The owner was emailed that the business is live, with the signed agreement attached${to ? `, at ${to}` : ''}.`;
    case 'skipped':
    case 'error':
    case 'failed':
      return `The owner’s “business is live” email did not go${status.reason ? `: ${status.reason}` : '.'} Use Send again on the merchant page.`;
    case 'not_queued':
      return 'The owner’s “business is live” email has not gone. Use Send again on the merchant page.';
    default:
      return '';
  }
}
