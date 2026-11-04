'use server';

import { merchantActionClient } from '@/lib/merchant-action-access';
import type { Asked, OnFile, Requirement } from '@/components/partner/documents';

export async function loadSetupDocuments(): Promise<
  | { ok: true; ownerId: string; requirements: Requirement[]; onFile: OnFile[]; asked: Asked[] }
  | { ok: false; message: string }
> {
  try {
    const { client, merchantId } = await merchantActionClient({ access: 'setup' });
    const [requirements, documents, requests] = await Promise.all([
      client.rpc('fn_merchant_required_docs', { p_merchant_id: merchantId }),
      client.from('document').select('requirement_id, status, rejection_reason, expires_at, side, created_at')
        .eq('owner_type', 'merchant').eq('owner_id', merchantId).is('superseded_at', null),
      client.from('document_request').select('requirement_id, note')
        .eq('owner_type', 'merchant').eq('owner_id', merchantId).is('fulfilled_document_id', null),
    ]);
    if (requirements.error || documents.error || requests.error)
      return { ok: false, message: 'Could not load your document requirements. Please try again.' };
    return { ok: true, ownerId: merchantId, requirements: (requirements.data ?? []) as Requirement[],
      onFile: (documents.data ?? []) as OnFile[], asked: (requests.data ?? []) as Asked[] };
  } catch {
    return { ok: false, message: 'Sign in to your merchant account to manage documents.' };
  }
}
