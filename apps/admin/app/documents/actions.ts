'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * Chasing a document that has not arrived.
 *
 * Shared by the merchant and rider pages, because it is the same
 * action against the same table — a second copy would be a second
 * set of rules about who may chase and how often.
 *
 * The rules themselves are in the RPC: a reviewer who covers that
 * city, nothing to chase once the document is in, and a cooldown so
 * one person with a button cannot send four messages in a minute.
 */
export async function remindToUpload(
  ownerType: 'merchant' | 'rider',
  ownerId: string,
  requirementKind: string,
): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await createClient().rpc('rpc_document_remind', {
    p_owner_type: ownerType,
    p_owner_id: ownerId,
    p_requirement_kind: requirementKind,
  });

  if (error) {
    return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
  }

  revalidatePath(`/${ownerType}s/${ownerId}`);

  const r = data as { message?: string } | null;
  return { ok: true, message: r?.message ?? 'Recorded.' };
}
