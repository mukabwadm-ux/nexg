'use server';

import { revalidatePath } from 'next/cache';

import { checkTiers, PRESET_NAMES } from '@/lib/cancellation-presets';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

/*
 * The preset cancellation policies, from Payout rules. The RPCs
 * (rpc_cancellation_preset_*) hold who may ask and approve, check the tiers
 * again and write the audit entry; nothing here writes a table. Stays already
 * booked keep the tiers they were booked with.
 */

export interface PresetResult {
  ok: boolean;
  message: string;
}

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refusal = (message: string) => message.replace(/^.*?:\s*/, '').slice(0, 300);

/* The new RPCs are not in the generated types yet (CI makes them). */
function client() {
  return createClient() as unknown as { rpc: Rpc };
}

function done(message: string): PresetResult {
  revalidatePath('/finance/payout-rules');
  return { ok: true, message };
}

export async function requestPreset(
  preset: string,
  rows: { days: string; pct: string }[],
  reason: string,
): Promise<PresetResult> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  if (!PRESET_NAMES.includes(preset as (typeof PRESET_NAMES)[number])) {
    return { ok: false, message: 'Choose flexible, moderate or strict.' };
  }
  const checked = checkTiers(rows);
  if (!checked.ok) return { ok: false, message: checked.message };
  if (!reason.trim()) return { ok: false, message: 'Say why it changes.' };
  const { error } = await client().rpc('rpc_cancellation_preset_request', {
    p_preset: preset,
    p_tiers: checked.tiers,
    p_reason: reason.trim().slice(0, 1000),
  });
  if (error) return { ok: false, message: refusal(error.message) };
  return done('Sent for approval. A second person has to approve it.');
}

export async function decidePreset(
  id: string,
  approve: boolean,
  note: string,
): Promise<PresetResult> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  if (!UUID.test(id)) return { ok: false, message: 'That change could not be found.' };
  const { error } = await client().rpc('rpc_cancellation_preset_decide', {
    p_id: id,
    p_approve: approve,
    ...(note.trim() ? { p_note: note.trim().slice(0, 1000) } : {}),
  });
  if (error) return { ok: false, message: refusal(error.message) };
  return done(
    approve
      ? 'Approved. New stays use it; stays already booked keep their policy.'
      : 'Rejected. The policy stays as it was.',
  );
}

export async function withdrawPreset(id: string): Promise<PresetResult> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  if (!UUID.test(id)) return { ok: false, message: 'That change could not be found.' };
  const { error } = await client().rpc('rpc_cancellation_preset_withdraw', { p_id: id });
  if (error) return { ok: false, message: refusal(error.message) };
  return done('Change withdrawn.');
}
