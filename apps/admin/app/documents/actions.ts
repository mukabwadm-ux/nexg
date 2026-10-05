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

/**
 * Recording a file a reviewer uploaded on somebody's behalf.
 *
 * The browser has already put the bytes in storage; this is the row
 * that makes them a document. Separating the two is deliberate — a
 * scan of a permit is several megabytes and a server action body is
 * not where it belongs — but it does mean a failed call here leaves
 * an orphan file in the bucket, which is the right way round: an
 * unreferenced file is clutter, a row pointing at nothing is a
 * reviewer clicking View and getting an error.
 */
export async function fileDocumentFor(
  ownerType: 'merchant' | 'rider',
  ownerId: string,
  input: {
    kind: string;
    storagePath: string;
    mime: string;
    sizeBytes: number;
    receivedVia: string;
  },
): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await createClient().rpc('rpc_document_upload_for', {
    p_owner_type: ownerType,
    p_owner_id: ownerId,
    p_requirement_kind: input.kind,
    p_storage_path: input.storagePath,
    p_mime: input.mime,
    p_size_bytes: input.sizeBytes,
    p_received_via: input.receivedVia,
  });

  if (error) {
    return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
  }

  revalidatePath(`/${ownerType}s/${ownerId}`);
  const r = data as { message?: string } | null;
  return { ok: true, message: r?.message ?? 'On file.' };
}
