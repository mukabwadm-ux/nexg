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

export async function markMessagesRead(riderId: string): Promise<void> {
  const supabase = createClient();
  await supabase
    .from('rider_message')
    .update({ read_at: new Date().toISOString() })
    .eq('rider_id', riderId)
    .eq('direction', 'out')
    .is('read_at', null);
  revalidatePath('/rider');
  revalidatePath('/rider/messages');
}
