'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export interface Outcome {
  ok: boolean;
  message?: string;
  code?: string;
}

/**
 * Making and looking after cards.
 *
 * Thin, like the rest: the rules — one live card per spot, a reason
 * before a void, the code generated server-side and never supplied —
 * live in the RPCs, because they have to hold whether the call came
 * from here, from a host's own page, or from a script nobody has
 * written yet.
 */
function fail(error: { message: string } | null): Outcome | null {
  if (!error) return null;
  return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
}

export async function generateCard(
  ownerType: 'unit' | 'hotel_room' | 'hotel_area',
  ownerId: string,
  placement: string,
): Promise<Outcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_qr_generate', {
    p_owner_type: ownerType,
    p_owner_id: ownerId,
    p_placement: placement as never,
  });
  const bad = fail(error);
  if (bad) return bad;

  const r = data as { code?: string } | null;
  revalidatePath('/hotels');
  return {
    ok: true,
    code: r?.code,
    message: `${r?.code} created. Print it and put it where guests will see it.`,
  };
}

export async function replaceCard(qrId: string, reason: string): Promise<Outcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_qr_replace', {
    p_qr_id: qrId,
    p_reason: reason,
  });
  const bad = fail(error);
  if (bad) return bad;

  const r = data as { code?: string; replaced?: string } | null;
  revalidatePath('/hotels');
  return {
    ok: true,
    code: r?.code,
    message: `${r?.code} replaces ${r?.replaced}. The old card still resolves — to a page telling the guest to ask for the new one.`,
  };
}

export async function voidCard(qrId: string, reason: string): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_qr_void', { p_qr_id: qrId, p_reason: reason });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath('/hotels');
  return { ok: true, message: 'Voided. Anybody scanning it now gets an explanation.' };
}

export async function testScan(qrId: string): Promise<Outcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_qr_test_scan', { p_qr_id: qrId });
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath('/hotels');
  return {
    ok: true,
    message: (data as { message?: string } | null)?.message ?? 'Scanned.',
  };
}

export async function buildPack(
  hostId: string | null,
  hotelId: string | null,
  format: string,
): Promise<Outcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_qr_pack_build', {
    p_host_id: hostId ?? undefined,
    p_hotel_id: hotelId ?? undefined,
    p_format: format,
  });
  const bad = fail(error);
  if (bad) return bad;

  const r = data as { codes?: unknown[] } | null;
  const n = r?.codes?.length ?? 0;
  revalidatePath('/hotels');
  return {
    ok: true,
    message: `${n} card${n === 1 ? '' : 's'} in this batch. They can be voided together if the pack goes astray.`,
  };
}

export async function refreshReports(): Promise<Outcome> {
  const supabase = createClient();
  const { error } = await supabase.rpc('cron_qr_refresh_reports', {});
  const bad = fail(error);
  if (bad) return bad;
  revalidatePath('/hotels');
  return { ok: true, message: 'Reports rebuilt.' };
}
