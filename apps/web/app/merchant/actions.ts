'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * What a merchant can do from their own dashboard.
 *
 * Every one of these is an RPC that re-checks the merchant owns the
 * business, because a server action is still just an HTTP endpoint
 * and this file is not the security boundary — the database is.
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

const ALL = ['/merchant', '/merchant/orders', '/merchant/stores', '/merchant/documents'];

/** Open and closed for business, with the reason recorded. */
export async function setAcceptingOrders(
  merchantId: string,
  accepting: boolean,
  reason: string,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_control', {
    p_merchant_id: merchantId,
    p_control: 'accepting_orders',
    p_value: accepting as never,
    p_source: 'merchant',
    p_reason: reason || undefined,
  });
  return unwrap(data, error, ALL);
}

/**
 * Busy mode: longer quotes for a while, rather than closing.
 *
 * The control takes the moment it ends, not a duration — so the
 * conversion happens here once, and "20 minutes" cannot drift into
 * meaning something else on another screen.
 */
export async function setBusyMode(
  merchantId: string,
  minutes: number | null,
  reason: string,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_control', {
    p_merchant_id: merchantId,
    p_control: 'busy_mode_until',
    p_value: (minutes === null
      ? null
      : new Date(Date.now() + minutes * 60_000).toISOString()) as never,
    p_source: 'merchant',
    p_reason: reason || undefined,
  });
  return unwrap(data, error, ALL);
}

export async function setPrep(
  merchantId: string,
  minutes: number,
  capacity: number | null,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_set_prep', {
    p_merchant_id: merchantId,
    p_minutes: minutes,
    p_capacity: capacity ?? undefined,
  });
  return unwrap(data, error, ALL);
}

// ───────────────────────────────────────────────────── stores

export async function addStore(input: {
  merchantId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  makePrimary: boolean;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_add_store', {
    p_merchant_id: input.merchantId,
    p_name: input.name,
    p_address: input.address,
    p_lat: input.lat,
    p_lng: input.lng,
    p_make_primary: input.makePrimary,
  });
  return unwrap(data, error, ALL);
}

export async function renameStore(
  branchId: string,
  name: string,
  address: string,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_rename_store', {
    p_branch_id: branchId,
    p_name: name,
    p_address: address || undefined,
  });
  return unwrap(data, error, ALL);
}

export async function closeStore(branchId: string, reason: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_close_store', {
    p_branch_id: branchId,
    p_reason: reason,
  });
  return unwrap(data, error, ALL);
}

// ──────────────────────────────────────────────────── featured

export async function requestFeatured(input: {
  merchantId: string;
  placementId: string;
  weekStart: string;
  weeks: number;
  note: string;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_request_featured', {
    p_merchant_id: input.merchantId,
    p_placement_id: input.placementId,
    p_week_start: input.weekStart,
    p_weeks: input.weeks,
    p_note: input.note || undefined,
  });
  return unwrap(data, error, ['/merchant', '/merchant/featured']);
}

export async function withdrawFeatured(bookingId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_withdraw_featured', {
    p_booking_id: bookingId,
  });
  return unwrap(data, error, ['/merchant', '/merchant/featured']);
}

// ──────────────────────────────────────────────────── messages

/**
 * Marking a message read.
 *
 * Done when the merchant opens the messages page rather than on a
 * button, because a badge that only clears when somebody presses
 * something is a badge people learn to ignore.
 */
export async function markMessagesRead(merchantId: string): Promise<void> {
  const supabase = createClient();
  await supabase
    .from('merchant_message')
    .update({ read_at: new Date().toISOString() })
    .eq('merchant_id', merchantId)
    .eq('direction', 'out')
    .is('read_at', null);
  revalidatePath('/merchant');
  revalidatePath('/merchant/messages');
}

export async function setItemAvailable(itemId: string, available: boolean): Promise<Outcome> {
  const { error } = await createClient()
    .from('catalogue_item')
    .update({ available })
    .eq('id', itemId);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/merchant/menu');
  return {
    ok: true,
    message: available ? 'Back on the menu.' : 'Off the menu until you turn it back on.',
  };
}
