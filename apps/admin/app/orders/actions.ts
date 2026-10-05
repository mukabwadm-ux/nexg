'use server';

import { revalidatePath } from 'next/cache';

import { paystackConfigured, refund as sendRefund } from '@/lib/paystack';
import { createClient } from '@/lib/supabase/server';

/**
 * The order service, from the console.
 *
 * Nothing here decides anything. Whether a refund needs a second
 * person, whether items can still change, which fee versions a
 * reprice uses — all of it is in the RPCs, because an order taken
 * on the phone and an order placed on the web have to be repriced
 * by the same rules.
 */

export interface Outcome {
  ok: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

function unwrap(data: unknown, error: { message: string } | null, paths: string[] = []): Outcome {
  if (error) return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
  for (const p of paths) revalidatePath(p);
  const r = (data ?? {}) as Record<string, unknown>;
  return { ok: r.ok !== false, message: r.message as string | undefined, data: r };
}

const PATHS = ['/orders', '/live'];

export async function previewReprice(
  orderId: string,
  changes: { item_id: string; quantity: number }[],
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('fn_order_reprice', {
    p_order_id: orderId,
    p_changes: changes as never,
  });
  return unwrap(data, error);
}

export async function adjustItems(
  orderId: string,
  changes: { item_id: string; quantity: number }[],
  reason: string,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_order_adjust_items', {
    p_order_id: orderId,
    p_changes: changes as never,
    p_reason: reason,
  });
  return unwrap(data, error, PATHS);
}

/** Which routes a refund can take for this order, and which cannot. */
export async function refundRoutes(orderId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('fn_refund_routes', {
    p_order_id: orderId,
  });
  return unwrap(data, error);
}

export async function refundOrder(
  orderId: string,
  amountCents: number,
  method: string,
  reasonCode: string,
  reasonText: string,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_order_refund', {
    p_order_id: orderId,
    p_amount_cents: amountCents,
    p_method: method,
    p_reason_code: reasonCode,
    p_reason_text: reasonText || undefined,
  });
  return unwrap(data, error, PATHS);
}

export async function addNote(orderId: string, body: string, visibleTo: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_order_add_note', {
    p_order_id: orderId,
    p_body: body,
    p_visible_to: visibleTo,
  });
  return unwrap(data, error, PATHS);
}

/**
 * Reaching somebody. `reveal` shows the whole number and is audited
 * as a separate high-severity event, because a console that always
 * showed it would be a phone book anybody with access could copy.
 */
export async function contact(
  orderId: string,
  party: string,
  channel: string,
  reveal = false,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_order_contact', {
    p_order_id: orderId,
    p_party: party,
    p_channel: channel,
    p_reveal: reveal,
  });
  return unwrap(data, error, PATHS);
}

export async function markOrder(
  orderId: string,
  event: string,
  reason: string,
  detail: Record<string, unknown> = {},
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_order_mark', {
    p_order_id: orderId,
    p_event: event,
    p_reason: reason,
    p_detail: detail as never,
  });
  return unwrap(data, error, PATHS);
}

export async function createManualOrder(payload: Record<string, unknown>): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_order_manual_create', {
    p_payload: payload as never,
  });
  return unwrap(data, error, PATHS);
}

/**
 * Actually send an approved refund.
 *
 * Two steps on purpose. `rpc_order_refund` decides whether the
 * refund is allowed and whether a second person is needed; this
 * carries it out. Separating them means a provider outage leaves a
 * queue of approved refunds rather than a queue of lost decisions,
 * and `refunds_to_issue_v` is that queue.
 *
 * Nothing is marked issued until the provider has said yes. A
 * refund marked sent that was not is the one mistake a guest
 * notices and Finance cannot explain.
 */
export async function issueRefund(refundId: string): Promise<Outcome> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('refunds_to_issue_v')
    .select('*')
    .eq('refund_id', refundId)
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!data) {
    return {
      ok: false,
      message: 'That refund is not waiting to be sent — it may already be out, or not approved.',
    };
  }

  const row = data as {
    refund_id: string;
    amount_cents: number;
    reason_code: string;
    reason_text: string | null;
    original_provider_ref: string | null;
    method: string;
  };

  if (!paystackConfigured()) {
    return {
      ok: false,
      message:
        'No payment provider is connected, so this stays approved and unsent. Finance settles it by hand until PAYSTACK_SECRET_KEY is set.',
    };
  }

  if (row.method === 'wallet_credit') {
    return {
      ok: false,
      message:
        'A wallet credit does not go through the provider. There is no wallet ledger yet, so Finance applies it by hand.',
    };
  }

  if (!row.original_provider_ref) {
    return {
      ok: false,
      message:
        'There is no provider transaction to refund against — this order was not paid online. Send it by M-Pesa and record the reference.',
    };
  }

  const sent = await sendRefund({
    transactionRef: row.original_provider_ref,
    amountCents: row.amount_cents,
    reason: `${row.reason_code}${row.reason_text ? ` · ${row.reason_text}` : ''}`,
  });

  if (!sent.ok) return { ok: false, message: sent.message };

  const { data: done, error: markError } = await supabase.rpc('rpc_refund_issued', {
    p_refund_id: refundId,
    p_provider_ref: sent.providerRef ?? 'sent',
  });

  if (markError) {
    /* The money has gone and we failed to write it down. Say so
       exactly — the provider reference is the only way to find it
       again. */
    return {
      ok: false,
      message: `Sent (provider ${sent.providerRef ?? 'unknown'}) but we could not record it: ${markError.message}. Give Finance that reference.`,
    };
  }

  return unwrap(done, null, PATHS);
}
