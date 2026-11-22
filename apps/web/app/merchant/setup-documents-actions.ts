'use server';

import { merchantActionClient } from '@/lib/merchant-action-access';
import type { Asked, OnFile, Requirement } from '@/components/partner/documents';

export async function loadSetupDocuments(): Promise<
  | { ok: true; ownerId: string; requirements: Requirement[]; onFile: OnFile[]; asked: Asked[] }
  | { ok: false; message: string }
> {
  try {
    const { client, merchantId } = await merchantActionClient({ access: 'workspace-setup' });
    const [requirements, documents, requests] = await Promise.all([
      client.rpc('fn_merchant_required_docs', { p_merchant_id: merchantId }),
      client
        .from('document')
        .select(
          'requirement_id, status, rejection_reason, expires_at, side, created_at, storage_path',
        )
        .eq('owner_type', 'merchant')
        .eq('owner_id', merchantId)
        .is('superseded_at', null),
      client
        .from('document_request')
        .select('requirement_id, note')
        .eq('owner_type', 'merchant')
        .eq('owner_id', merchantId)
        .is('fulfilled_document_id', null),
    ]);
    if (requirements.error || documents.error || requests.error)
      return { ok: false, message: 'Could not load your document requirements. Please try again.' };
    /*
     * So the merchant can open what they sent. Links last an hour and are
     * signed with the merchant's own session, so the bucket's owner-read
     * policy still decides. A file that cannot be signed just has no link.
     */
    const files = documents.data ?? [];
    const signed = files.length
      ? await client.storage.from('partner-documents').createSignedUrls(
          files.map((file) => file.storage_path),
          3600,
        )
      : { data: [] };
    const links = new Map(
      (signed.data ?? []).flatMap((link) =>
        link.path && link.signedUrl ? [[link.path, link.signedUrl] as const] : [],
      ),
    );
    return {
      ok: true,
      ownerId: merchantId,
      requirements: (requirements.data ?? []) as Requirement[],
      onFile: files.map(({ storage_path, ...file }) => ({
        ...file,
        view_url: links.get(storage_path) ?? null,
      })) as OnFile[],
      asked: (requests.data ?? []) as Asked[],
    };
  } catch {
    return { ok: false, message: 'Sign in to your merchant account to manage documents.' };
  }
}
