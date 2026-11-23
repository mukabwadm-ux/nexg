'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * What a rider can do from their own account.
 *
 * Going on and off shift is theirs. Clearing a cooldown or a
 * suspension is not — those were put there by somebody for a
 * reason, and a switch that undid them would make the reason
 * pointless. The RPCs enforce that; this file only calls them.
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

const ALL = ['/rider', '/rider/jobs', '/rider/profile'];

export async function goOnline(online: boolean, reason: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_rider_go_online', {
    p_online: online,
    p_reason: reason || undefined,
  });
  return unwrap(data, error, ALL);
}

export async function updateProfile(input: {
  riderId: string;
  areas?: string[];
  shifts?: string[];
  maxKm?: number;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_rider_update_profile', {
    p_rider_id: input.riderId,
    p_areas: input.areas ?? undefined,
    p_shifts: input.shifts ?? undefined,
    p_max_km: input.maxKm ?? undefined,
  });
  return unwrap(data, error, ALL);
}

/**
 * Riders only read rider_message, so a direct update never changed
 * anything and the unread count never fell. The RPC marks them.
 */
export async function markMessagesRead(_riderId?: string): Promise<void> {
  await createClient().rpc('rpc_rider_messages_read', {});
  revalidatePath('/rider');
  revalidatePath('/rider/messages');
}

const TOPICS = [
  'partner_rider',
  'payment_or_refund',
  'account',
  'order_problem',
  'something_else',
] as const;
type Topic = (typeof TOPICS)[number];

/** A ticket from the rider, which now comes back to them on /rider/support. */
export async function createTicket(topic: string, body: string): Promise<Outcome> {
  const supabase = createClient();
  const text = body.trim();
  if (text.length < 3) return { ok: false, message: 'Tell us what happened.' };
  const [{ data: auth }, { data: home }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('rider_home_v').select('phone, first_name').maybeSingle(),
  ]);
  const h = home as { phone?: string | null; first_name?: string | null } | null;
  const { data, error } = await supabase.rpc('rpc_support_ticket_create', {
    p_body: text,
    p_from_role: 'rider',
    p_topic: (TOPICS as readonly string[]).includes(topic) ? (topic as Topic) : 'something_else',
    p_full_name: h?.first_name ?? undefined,
    p_email: auth.user?.email ?? undefined,
    p_phone: h?.phone ?? undefined,
    p_source_form: 'rider_portal',
  });
  const r = unwrap(data, error, ['/rider/support']);
  return r.ok ? { ...r, message: 'Sent. Your ticket is below.' } : r;
}

export async function replyTicket(ticketId: string, body: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_my_ticket_reply', {
    p_ticket_id: ticketId,
    p_body: body,
  });
  return unwrap(data, error, ['/rider/support']);
}

export async function commitShift(zoneId: string, date: string, window: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_shift_commit', {
    p_zone_id: zoneId,
    p_date: date,
    p_window: window,
  });
  return unwrap(error ? null : { ok: true, message: 'Shift committed.' }, error, ['/rider/shifts']);
}

export async function releaseShift(shiftId: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_shift_release', { p_shift_id: shiftId });
  return unwrap(
    error ? null : { ok: true, message: 'Released. It does not count against you.' },
    error,
    ['/rider/shifts'],
  );
}

export async function requestEarlyPayout(amountKes: number, reason: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_rider_payout_request', {
    p_amount_kes: Math.round(amountKes),
    p_reason: reason || undefined,
  });
  return unwrap(data, error, ['/rider/earnings', '/rider/cashout']);
}

export async function cancelEarlyPayout(requestId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_rider_payout_cancel', {
    p_request_id: requestId,
  });
  return unwrap(data, error, ['/rider/earnings', '/rider/cashout']);
}

export async function startPhoneChange(
  kind: 'payout' | 'account',
  phone: string,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_rider_phone_change_start', {
    p_kind: kind,
    p_phone: phone,
  });
  return unwrap(data, error);
}

export async function verifyPhoneChange(challengeId: string, code: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_rider_phone_change_verify', {
    p_challenge_id: challengeId,
    p_code: code,
  });
  return unwrap(data, error, ['/rider/profile', '/rider/earnings', '/rider']);
}

export async function acceptAgreement(versionId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_rider_agreement_accept', {
    p_version_id: versionId,
  });
  const r = unwrap(data, error, ALL);
  return r.ok ? { ...r, message: 'Accepted. You can go online.' } : r;
}

/**
 * A rider's reply to rider ops, from the Messages page. It needs
 * rpc_rider_message_reply; until that function is in the database the
 * call fails and the rider is told to call the rider line instead.
 */
export async function replyToRiderOps(body: string): Promise<Outcome> {
  const text = body.trim();
  if (!text) return { ok: false, message: 'Write a message first.' };
  /* Not in the generated types until its migration lands. */
  const client = createClient() as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  };
  const { data, error } = await client.rpc('rpc_rider_message_reply', { p_body: text });
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    return {
      ok: false,
      message: 'Replies are not switched on yet. For anything urgent, call the rider line.',
    };
  }
  return unwrap(data, error, ['/rider/messages', '/rider']);
}
