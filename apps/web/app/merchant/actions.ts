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

function unwrap(
  data: unknown,
  error: { message: string } | null,
  paths: string[] = [],
  /* What to say when the RPC returns a row rather than a
     `{ok, note}` envelope — an upsert hands back the record, so
     there is no message in it to show. */
  okMessage?: string,
): Outcome {
  if (error) return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
  for (const p of paths) revalidatePath(p);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    ok: r.ok !== false,
    message: (r.note as string | undefined) ?? (r.message as string | undefined) ?? okMessage,
    data: r,
  };
}

const ALL = [
  '/merchant/hours',
  '/merchant/disputes',
  '/merchant/reviews',
  '/merchant/settings',
  '/merchant/support',
  '/merchant',
  '/merchant/orders',
  '/merchant/stores',
  '/merchant/documents',
  '/merchant/team',
];

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

// ─────────────────────────────────────────────────── branches

/**
 * Opening, changing and closing a branch.
 *
 * Each one re-checks membership in the database. Adding a
 * branch also raises it for review and rings the console —
 * a new address appearing on Explore without anybody looking
 * at it is the thing that check exists for.
 */
export async function saveBranch(input: {
  merchantId: string;
  branchId?: string | null;
  name: string;
  addressText: string;
  pickupInstructions: string;
  riderPhone: string;
  latitude?: string;
  longitude?: string;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_branch_upsert', {
    p_merchant_id: input.merchantId,
    p_branch_id: input.branchId ?? undefined,
    p_branch: {
      name: input.name,
      address_text: input.addressText,
      pickup_instructions: input.pickupInstructions,
      rider_phone: input.riderPhone,
      latitude: input.latitude,
      longitude: input.longitude,
    } as never,
  });
  return unwrap(
    data,
    error,
    ALL,
    input.branchId
      ? 'Saved.'
      : 'Branch added. It is with NexG for review before it shows on Explore.',
  );
}

export async function pauseBranch(branchId: string, reason: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_branch_pause', {
    p_branch_id: branchId,
    p_reason: reason,
  });
  return unwrap(data, error, ALL, 'Paused. Guests see it as closed; orders already accepted finish.');
}

export async function resumeBranch(branchId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_branch_resume', { p_branch_id: branchId });
  return unwrap(data, error, ALL, 'Open again.');
}

export async function deleteBranch(branchId: string, confirmName: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_branch_delete', {
    p_branch_id: branchId,
    p_confirm_name: confirmName,
  });
  return unwrap(data, error, ALL);
}

// ───────────────────────────────────────────────────── team

export async function inviteMember(input: {
  merchantId: string;
  contact: string;
  role: string;
  branches: string[];
  caps: Record<string, boolean>;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_invite_member', {
    p_merchant_id: input.merchantId,
    p_contact: input.contact,
    p_role: input.role,
    p_branches: input.branches.length > 0 ? input.branches : undefined,
    p_caps: input.caps as never,
  });
  return unwrap(data, error, ALL, 'Invitation sent. They join when they sign in with it.');
}

export async function updateMember(input: {
  merchantId: string;
  userId: string;
  role: string;
  branches: string[];
  caps: Record<string, boolean>;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_membership_update', {
    p_merchant_id: input.merchantId,
    p_user_id: input.userId,
    p_role: input.role,
    p_branches: input.branches.length > 0 ? input.branches : undefined,
    p_caps: input.caps as never,
  });
  return unwrap(data, error, ALL, 'Saved.');
}

export async function removeMember(merchantId: string, userId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_membership_remove', {
    p_merchant_id: merchantId,
    p_user_id: userId,
  });
  return unwrap(data, error, ALL);
}

export async function revokeInvite(inviteId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_invite_revoke', {
    p_invite_id: inviteId,
  });
  return unwrap(data, error, ALL);
}

// ────────────────────────────────────────────────────── hours

export async function setHours(input: {
  merchantId: string;
  day: number;
  service: string;
  opens: string;
  closes: string;
  closed: boolean;
  branchId?: string | null;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_hours_set', {
    p_merchant_id: input.merchantId,
    p_day: input.day,
    p_service: input.service,
    p_opens: input.closed ? undefined : input.opens,
    p_closes: input.closed ? undefined : input.closes,
    p_closed: input.closed,
    p_branch_id: input.branchId ?? undefined,
  });
  return unwrap(data, error, ALL, 'Saved. Guests see the change on their next look.');
}

export async function copyHours(
  merchantId: string,
  fromBranch: string | null,
  toBranch: string,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_hours_copy', {
    p_merchant_id: merchantId,
    p_to_branch: toBranch,
    p_from_branch: fromBranch ?? undefined,
  });
  return unwrap(data, error, ALL);
}

/** Close early today, or any other one-day override. */
export async function setOverride(input: {
  merchantId: string;
  date: string;
  closes: string;
  closed: boolean;
  reason: string;
  branchId?: string | null;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_hours_override', {
    p_merchant_id: input.merchantId,
    p_date: input.date,
    p_opens: undefined,
    p_closes: input.closed ? undefined : input.closes,
    p_closed: input.closed,
    p_branch_id: input.branchId ?? undefined,
    p_reason: input.reason,
    p_source: 'merchant' as never,
  });
  return unwrap(
    data,
    error,
    ALL,
    'Applied. Guests see "closes early today" and orders already accepted finish as normal.',
  );
}

// ──────────────────────────────────────────────────── reviews

export async function replyToReview(ratingId: string, body: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_review_reply', {
    p_rating_id: ratingId,
    p_body: body,
  });
  return unwrap(
    data,
    error,
    ALL,
    'Sent for moderation. It appears on your Explore page once approved, usually within minutes.',
  );
}

// ─────────────────────────────────────────────────── disputes

export async function replyToDispute(disputeId: string, reply: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_dispute_merchant_reply', {
    p_dispute_id: disputeId,
    p_reply: reply,
  });
  return unwrap(data, error, ALL, 'Sent. NexG decides within one working day and you see the reasoning.');
}

export async function acceptDispute(disputeId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_dispute_accept', {
    p_dispute_id: disputeId,
  });
  return unwrap(data, error, ALL, 'Accepted. It appears on Friday’s statement with the reason.');
}

// ─────────────────────────────────────────────────── settings

export async function saveMerchantSettings(
  merchantId: string,
  patch: Record<string, unknown>,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_settings_update', {
    p_merchant_id: merchantId,
    p_patch: patch as never,
  });
  return unwrap(data, error, ALL, 'Saved.');
}

// ──────────────────────────────────────────────────── support

export async function openTicket(input: {
  topic: string;
  body: string;
  page: string;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_support_ticket_create', {
    p_topic: input.topic as never,
    p_body: `${input.body}\n\n— from ${input.page}`,
    p_source_form: 'merchant_portal',
  });
  return unwrap(data, error, ALL, 'Opened. You will see it in Your tickets below.');
}
