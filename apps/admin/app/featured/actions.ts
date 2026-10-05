'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export interface PlaceOutcome {
  ok: boolean;
  message?: string;
  liveNow?: boolean;
}

/**
 * Selling and ending a featured placement.
 *
 * Thin, like everything else here: the rules — a live merchant, a
 * Monday, a price that cannot be null, a slot nobody else holds —
 * live in the RPC, because they have to hold whether the call came
 * from this console, from a merchant's own page when that exists,
 * or from a script nobody has written yet.
 */
function fail(error: { message: string } | null): PlaceOutcome | null {
  if (!error) return null;
  return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
}

export async function placeMerchantInSlot(input: {
  placementId: string;
  merchantId: string;
  weekStart: string;
  price: number;
  weeks: number;
  note: string;
}): Promise<PlaceOutcome> {
  const { data, error } = await createClient().rpc('rpc_featured_place_merchant', {
    p_placement_id: input.placementId,
    p_merchant_id: input.merchantId,
    p_week_start: input.weekStart,
    p_price: input.price,
    p_weeks: input.weeks,
    p_note: input.note || undefined,
  });

  const bad = fail(error);
  if (bad) return bad;

  const r = data as { message?: string; live_now?: boolean } | null;
  revalidatePath('/featured');
  revalidatePath('/merchants');
  return { ok: true, message: r?.message, liveNow: r?.live_now };
}

export async function endFeaturedNow(bookingId: string, reason: string): Promise<PlaceOutcome> {
  const { data, error } = await createClient().rpc('rpc_featured_end_now', {
    p_booking_id: bookingId,
    p_reason: reason,
  });

  const bad = fail(error);
  if (bad) return bad;

  revalidatePath('/featured');
  revalidatePath('/merchants');
  return { ok: true, message: (data as { message?: string } | null)?.message };
}

/** From a merchant's own page: take them off, by merchant rather than booking. */
export async function unfeatureMerchant(
  merchantId: string,
  reason: string,
): Promise<PlaceOutcome> {
  const { data, error } = await createClient().rpc('rpc_merchant_set_featured', {
    p_merchant_id: merchantId,
    p_featured: false,
    p_reason: reason,
  });

  const bad = fail(error);
  if (bad) return bad;

  revalidatePath('/merchants');
  revalidatePath('/featured');
  return { ok: true, message: (data as { message?: string } | null)?.message };
}
