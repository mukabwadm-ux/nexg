import type { Metadata } from 'next';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { PipelineBoard, type PipelineColumn } from '@/components/pipeline-board';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Merchant onboarding' };
export const dynamic = 'force-dynamic';

const COLUMNS = [
  { key: 'applied', label: 'Applied', tone: 'bg-muted-light' },
  { key: 'documents_pending', label: 'Documents', tone: 'bg-gold' },
  { key: 'under_review', label: 'Under review', tone: 'bg-warning' },
  { key: 'live', label: 'Live', tone: 'bg-success' },
  { key: 'paused', label: 'Paused', tone: 'bg-danger' },
] as const;

function sinceLabel(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : `${days} d`;
}

export default async function MerchantPipelinePage() {
  const staff = await requireStaff();
  const supabase = createClient();

  const [{ data: merchants }, { data: documents }, { data: requirements }] = await Promise.all([
    supabase
      .from('merchant')
      .select('id, trading_name, category, status, created_at, city(name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('document')
      .select('owner_id, status')
      .eq('owner_type', 'merchant')
      .is('superseded_at', null),
    supabase.from('document_requirement').select('kind, applies_when').eq('owner_type', 'merchant'),
  ]);

  const requiredFor = (category: string) =>
    (requirements ?? []).filter((requirement) => {
      const when = requirement.applies_when as Record<string, string[]> | null;
      const categories = when?.['category'];
      return !categories || categories.includes(category);
    }).length;

  const verifiedByMerchant = new Map<string, number>();
  for (const document of documents ?? []) {
    if (document.status !== 'verified') continue;
    verifiedByMerchant.set(document.owner_id, (verifiedByMerchant.get(document.owner_id) ?? 0) + 1);
  }

  const columns: PipelineColumn[] = COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    tone: column.tone,
    cards: (merchants ?? [])
      .filter((merchant) => merchant.status === column.key)
      .map((merchant) => {
        const city = merchant.city as { name: string } | null;
        return {
          id: merchant.id,
          title: merchant.trading_name,
          meta: [merchant.category.replace(/_/g, ' '), city?.name].filter(Boolean).join(' · '),
          note: `Registered ${sinceLabel(merchant.created_at)} ago`,
          href: `/merchants/${merchant.id}`,
          progress:
            column.key === 'applied' || column.key === 'live'
              ? null
              : {
                  done: verifiedByMerchant.get(merchant.id) ?? 0,
                  total: requiredFor(merchant.category),
                },
        };
      }),
  }));

  const inPipeline = columns
    .filter((column) => column.key !== 'live' && column.key !== 'paused')
    .reduce((total, column) => total + column.cards.length, 0);

  return (
    <ConsoleShell staff={staff} current="/merchants">
      <ConsoleHeader
        title="Merchant onboarding"
        breadcrumb={`${inPipeline} in the pipeline · ${columns.find((c) => c.key === 'live')?.cards.length ?? 0} live`}
      />

      <main className="px-4 py-6 sm:px-8">
        <PipelineBoard columns={columns} />
      </main>
    </ConsoleShell>
  );
}
