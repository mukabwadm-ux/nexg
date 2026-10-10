import {
  Documents,
  type Asked,
  type OnFile,
  type Requirement,
} from '@/components/partner/documents';
import { PageHead } from '@/components/merchant/frame';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Documents' };
export const dynamic = 'force-dynamic';

export default async function MerchantDocuments() {
  const me = await requireMerchant();
  const supabase = createClient();

  const [{ data: reqs, error }, { data: docs }, { data: asked }] = await Promise.all([
    supabase.rpc('fn_merchant_required_docs', { p_merchant_id: me.id }),
    supabase
      .from('document')
      .select('requirement_id, status, rejection_reason, expires_at, side, created_at')
      .eq('owner_type', 'merchant')
      .eq('owner_id', me.id)
      .is('superseded_at', null),
    supabase
      .from('document_request')
      .select('requirement_id, note')
      .eq('owner_type', 'merchant')
      .eq('owner_id', me.id)
      .is('fulfilled_document_id', null),
  ]);

  return (
    <div className="space-y-5 px-4 py-7 sm:px-6 lg:px-8">
      <PageHead
        title="Documents"
        lead="The documents NexG needs for your category, their review state and expiry. Documents you already verified are carried over and never re-requested unless they expire."
      />

      {error ? (
        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          We could not read what we need from you: {error.message}
        </p>
      ) : (
        <Documents
          ownerType="merchant"
          ownerId={me.id}
          requirements={(reqs as Requirement[] | null) ?? []}
          onFile={(docs as OnFile[] | null) ?? []}
          asked={(asked as Asked[] | null) ?? []}
        />
      )}
    </div>
  );
}
