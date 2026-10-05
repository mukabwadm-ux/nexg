import {
  Documents,
  type Asked,
  type OnFile,
  type Requirement,
} from '@/components/partner/documents';
import { requireRider } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Documents' };
export const dynamic = 'force-dynamic';

export default async function RiderDocuments() {
  const me = await requireRider();
  const supabase = createClient();

  const [{ data: reqs, error }, { data: docs }, { data: asked }] = await Promise.all([
    supabase.rpc('fn_rider_required_docs', { p_rider_id: me.id }),
    supabase
      .from('document')
      .select('requirement_id, status, rejection_reason, expires_at, side, created_at')
      .eq('owner_type', 'rider')
      .eq('owner_id', me.id)
      .is('superseded_at', null),
    supabase
      .from('document_request')
      .select('requirement_id, note')
      .eq('owner_type', 'rider')
      .eq('owner_id', me.id)
      .is('fulfilled_document_id', null),
  ]);

  if (error) {
    return (
      <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
        We could not read what we need from you: {error.message}
      </p>
    );
  }

  return (
    <Documents
      ownerType="rider"
      ownerId={me.id}
      requirements={(reqs as Requirement[] | null) ?? []}
      onFile={(docs as OnFile[] | null) ?? []}
      asked={(asked as Asked[] | null) ?? []}
    />
  );
}
