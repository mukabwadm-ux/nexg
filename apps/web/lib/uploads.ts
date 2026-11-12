'use client';

import { getCaptchaToken } from '@nexg/ui';

import { createClient } from '@/lib/supabase/client';
import { loadMerchantWorkspaceAccess } from './merchant-access';
import {
  assertProtectedBrowserRequestVersion,
  protectedBrowserRequestVersion,
} from './supabase/protected-request';

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

  const { data, error } = await supabase.auth.signInAnonymously({
    options: { captchaToken: await getCaptchaToken() },
  });
  if (error) return null;
  return data.user?.id ?? null;
}

export type OwnerType = 'rider' | 'merchant';

/** Where an upload has got to, for a progress bar: checking, sending (0-1), recording. */
export type UploadProgress =
  | { stage: 'checking' }
  | { stage: 'sending'; fraction: number }
  | { stage: 'recording' };

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
  side,
  onProgress,
}: {
  ownerType: OwnerType;
  ownerId: string;
  kind: string;
  file: File;
  expiresAt?: string | null;
  /** Front or back, for a document that has two — a national ID. */
  side?: 'front' | 'back';
  /** Called as the upload moves along, so the screen can show it. */
  onProgress?: (progress: UploadProgress) => void;
}): Promise<UploadOutcome> {
  const supabase = createClient();
  onProgress?.({ stage: 'checking' });

  let version: number | undefined;
  let userId: string | null;
  if (ownerType === 'merchant') {
    try {
      version = protectedBrowserRequestVersion();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user || data.user.is_anonymous)
        return { ok: false, message: 'Sign in with your verified account to upload documents.' };
      const access = await loadMerchantWorkspaceAccess(supabase, ownerId);
      if (!access.setup)
        return { ok: false, message: 'Only the application owner can upload documents.' };
      assertProtectedBrowserRequestVersion(version);
      userId = data.user.id;
    } catch {
      return {
        ok: false,
        message: 'Your document permissions could not be checked. Sign in and retry.',
      };
    }
  } else userId = await ensureApplicantSession();
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

  const storageError = onProgress
    ? await uploadWithProgress(supabase, path, file, (fraction) =>
        onProgress({ stage: 'sending', fraction }),
      )
    : (
        await supabase.storage
          .from('partner-documents')
          .upload(path, file, { contentType: file.type, upsert: false })
      ).error?.message;

  if (storageError) {
    return { ok: false, message: storageError };
  }
  onProgress?.({ stage: 'recording' });

  if (version !== undefined) {
    try {
      assertProtectedBrowserRequestVersion(version);
    } catch {
      return {
        ok: false,
        message: 'Your session ended before the upload was recorded. Sign in and retry.',
      };
    }
  }

  const { data, error } = await supabase.rpc('rpc_document_submit', {
    p_owner_type: ownerType,
    p_owner_id: ownerId,
    p_requirement_kind: kind,
    p_storage_path: path,
    p_mime: file.type,
    p_size_bytes: file.size,
    ...(expiresAt ? { p_expires_at: expiresAt } : {}),
    ...(side ? { p_side: side } : {}),
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

  if (version !== undefined) {
    try {
      assertProtectedBrowserRequestVersion(version);
    } catch {
      return {
        ok: false,
        message: 'Your session ended. Sign in to check whether the document was recorded.',
      };
    }
  }

  return { ok: true, documentId: data as unknown as string };
}

/**
 * The same upload supabase-js makes, over XMLHttpRequest so the bytes sent
 * can be reported (fetch cannot). Same endpoint, same signed-in token, same
 * storage policies; no upsert, so a reviewed file is never overwritten.
 * Returns an error message, or null when the file arrived.
 */
async function uploadWithProgress(
  supabase: ReturnType<typeof createClient>,
  path: string,
  file: File,
  onFraction: (fraction: number) => void,
): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return 'Your session ended. Sign in and retry.';
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '');
  const url = `${base}/storage/v1/object/partner-documents/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onFraction(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onFraction(1);
        resolve(null);
        return;
      }
      let message = 'The file could not be sent. Try again.';
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = body.message ?? body.error ?? message;
      } catch {
        /* Not JSON: keep the plain message. */
      }
      resolve(message);
    };
    xhr.onerror = () => resolve('The connection dropped while sending. Try again.');
    xhr.send(file);
  });
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
