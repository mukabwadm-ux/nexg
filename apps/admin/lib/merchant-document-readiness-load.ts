import { parseDocumentReadiness, type DocumentReadiness } from './merchant-document-readiness';
import { createClient } from './supabase/server';

/** Null when it cannot be read; the database still refuses an early approval. */
export async function loadMerchantDocumentReadiness(
  merchantId: string,
): Promise<DocumentReadiness | null> {
  try {
    const { data, error } = await createClient().rpc(
      'rpc_merchant_document_readiness' as never,
      {
        p_merchant_id: merchantId,
      } as never,
    );
    if (error) return null;
    return parseDocumentReadiness(data);
  } catch {
    return null;
  }
}
