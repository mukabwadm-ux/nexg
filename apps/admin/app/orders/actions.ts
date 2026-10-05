'use server';

import { revalidatePath } from 'next/cache';

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
