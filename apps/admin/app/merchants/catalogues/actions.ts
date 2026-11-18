'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/*
 * Catalogues actions. Each calls the RPC that holds the rule and writes the
 * audit event; nothing here writes a catalogue table directly.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ActionResult {
  ok: boolean;
  message: string;
}

export async function addProduct(input: {
  merchantId: string;
  sectionId: string | null;
  sectionName: string;
  name: string;
  priceKes: number | null;
  description: string;
  available: boolean;
}): Promise<ActionResult> {
  if (!UUID.test(input.merchantId))
    return { ok: false, message: 'That merchant link is not valid.' };
  if (input.sectionId && !UUID.test(input.sectionId))
    return { ok: false, message: 'Choose a section.' };
  const price =
    input.priceKes == null || Number.isNaN(input.priceKes)
      ? null
      : Math.round(Number(input.priceKes));

  const { error } = await createClient().rpc('rpc_catalogue_item_add_staff', {
    p_merchant_id: input.merchantId,
    p_section_id: input.sectionId ?? undefined,
    p_section_name: input.sectionName.trim() || undefined,
    p_name: input.name.trim(),
    p_price_kes: price ?? undefined,
    p_description: input.description.trim() || undefined,
    p_available: input.available,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath('/merchants/catalogues');
  revalidatePath(`/merchants/${input.merchantId}`);
  return {
    ok: true,
    message: input.available
      ? 'Added and shown to customers.'
      : 'Added, hidden for now. Make it available when it is ready.',
  };
}

/** Publish (approve) or turn down a change a merchant asked for. */
export async function reviewCatalogueEdit(
  requestId: string,
  approve: boolean,
  reason: string,
): Promise<ActionResult> {
  if (!UUID.test(requestId)) return { ok: false, message: 'That change is not valid.' };
  if (!approve && !reason.trim()) return { ok: false, message: 'Say why, so the merchant knows.' };
  const { error } = await createClient().rpc('rpc_catalogue_edit_review', {
    p_request_id: requestId,
    p_approve: approve,
    p_reason: reason.trim(),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/merchants/catalogues');
  return { ok: true, message: approve ? 'Published.' : 'Turned down.' };
}
