'use client';

import { createClient } from '@/lib/supabase/client';

/**
 * Applicant identity and document uploads — spec sections 3.2, 4.2 and 4.3.
 *
 * An applicant needs an identity before they can upload anything: the storage
 * policies and the document policies both ask whether this caller owns the
 * application. Section 4.2 gets that identity from an SMS OTP, but the
 * provider is still a [DECIDE] in section 8, so until then the session is an
 * anonymous one. It can own exactly one application and write inside that
 * application's own storage prefix — nothing else.
 *
 * The session lives in a cookie, so it survives a reload and the server
 * actions see the same caller. That is also what lets an applicant come back
 * later and finish, on the same browser.
 */
export async function ensureApplicantSession(): Promise<string | null> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) return null;
  return data.user?.id ?? null;
}

export type OwnerType = 'rider' | 'merchant';

export interface UploadOutcome {
  ok: boolean;
  /** Present when ok; the row in public.document. */
  documentId?: string;
  message?: string;
}

/**
 * Puts the file in the bucket, then records it.
 *
 * That order matters: the bucket policy is what decides whether this caller
 * may write to this prefix, so a caller who should not be here fails before
 * any row is written. The reverse order would leave a document row pointing
 * at a file that never arrived.
 */
export async function uploadDocument({
  ownerType,
  ownerId,
  kind,
  file,
  expiresAt,
}: {
  ownerType: OwnerType;
  ownerId: string;
  kind: string;
  file: File;
  expiresAt?: string | null;
}): Promise<UploadOutcome> {
  const supabase = createClient();

  const userId = await ensureApplicantSession();
  if (!userId) {
    return { ok: false, message: 'We could not start a secure session. Reload and try again.' };
  }

  /*
   * ${owner_type}/${owner_id}/${kind}/${uuid} — the layout the storage
   * policies parse (migration 20260101001400). The uuid means a re-upload
   * never overwrites the file a reviewer may already have looked at.
   */
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'bin';
  const path = `${ownerType}/${ownerId}/${kind}/${crypto.randomUUID()}.${extension}`;

  const { error: storageError } = await supabase.storage
    .from('partner-documents')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (storageError) {
    return { ok: false, message: storageError.message };
  }

  const { data, error } = await supabase.rpc('rpc_document_submit', {
    p_owner_type: ownerType,
    p_owner_id: ownerId,
    p_requirement_kind: kind,
    p_storage_path: path,
    p_mime: file.type,
    p_size_bytes: file.size,
    ...(expiresAt ? { p_expires_at: expiresAt } : {}),
  });

  if (error) {
    /*
     * The file is in the bucket but unrecorded. Removing it needs a delete
     * policy that deliberately does not exist — nobody deletes partner
     * documents — so it is left as an orphan for the retention job rather
     * than opening that door for one error path.
     */
    return { ok: false, message: error.message };
  }

  return { ok: true, documentId: data as unknown as string };
}

export interface SavedDocument {
  kind: string;
  status: string;
  name: string;
  sizeBytes: number;
  mime: string;
  rejectionReason: string | null;
}

/** What this applicant has already uploaded, so a return visit is not blank. */
export async function fetchSavedDocuments(
  ownerType: OwnerType,
  ownerId: string,
): Promise<SavedDocument[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from('document')
    .select('storage_path, mime, size_bytes, status, rejection_reason, document_requirement(kind)')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId)
    .is('superseded_at', null);

  return (data ?? []).flatMap((row) => {
    const requirement = row.document_requirement as { kind: string } | null;
    if (!requirement) return [];
    return [
      {
        kind: requirement.kind,
        status: row.status,
        name: row.storage_path.split('/').pop() ?? 'document',
        sizeBytes: Number(row.size_bytes),
        mime: row.mime,
        rejectionReason: row.rejection_reason,
      },
    ];
  });
}
