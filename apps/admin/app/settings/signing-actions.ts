'use server';

import { createHash, randomUUID } from 'node:crypto';

import { signatureImageProblem } from '@nexg/merchant-agreement';
import { revalidatePath } from 'next/cache';

import { AGREEMENTS_BUCKET } from '@/lib/merchant-agreement-signing';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export interface SignerOutcome {
  ok: boolean;
  message: string;
}

const FIELDS = [
  'signatory_name',
  'signatory_title',
  'representative_name',
  'representative_title',
  'po_box',
  'registered_office',
  'email',
  'phone',
  'website',
  'in_room_commission_pct',
] as const;

/**
 * Saves a new version of NexG's signing details: the signatory, the
 * representative for disputes, the letterhead, the Property Partner in-room
 * commission and, when a file is chosen, the signature image. The image is
 * checked and stored in the private bucket here; the database re-reads its
 * type and size from storage and records the version, audited for review.
 */
export async function saveAgreementSigner(form: FormData): Promise<SignerOutcome> {
  const staff = await requireStaff();
  requireModule(staff, 'settings');
  if (!staff.isSuperAdmin)
    return { ok: false, message: 'Only a super admin can set NexG’s signatory and signature.' };

  const details = Object.fromEntries(
    FIELDS.map((field) => [field, String(form.get(field) ?? '').trim()]),
  );
  const client = createClient();
  let path: string | null = null;
  let sha256: string | null = null;
  const file = form.get('signature');
  if (file instanceof File && file.size > 0) {
    const type = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : null;
    if (!type) return { ok: false, message: 'Upload the signature as a PNG or JPEG.' };
    if (file.size > 2 * 1024 * 1024)
      return { ok: false, message: 'The signature must be a file of at most 2 MB.' };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const problem = await signatureImageProblem(bytes, type);
    if (problem) return { ok: false, message: problem };
    sha256 = createHash('sha256').update(bytes).digest('hex');
    path = `signer/${randomUUID()}.${type}`;
    const upload = await client.storage
      .from(AGREEMENTS_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (upload.error)
      return { ok: false, message: `The signature could not be stored: ${upload.error.message}` };
  }

  const { error } = await client.rpc('rpc_merchant_agreement_signer_save', {
    p_details: details,
    p_signature_path: path ?? undefined,
    p_signature_sha256: sha256 ?? undefined,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/settings');
  return {
    ok: true,
    message: 'Saved. Agreements signed from now on use these details.',
  };
}
