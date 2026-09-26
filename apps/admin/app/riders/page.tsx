import type { Metadata } from 'next';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { PipelineBoard, type PipelineColumn } from '@/components/pipeline-board';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Rider onboarding' };

/** Every row here is already scoped by RLS to the cities this account covers. */
export const dynamic = 'force-dynamic';

const COLUMNS = [
  { key: 'applied', label: 'Applied', tone: 'bg-muted-light' },
  { key: 'documents_pending', label: 'Documents', tone: 'bg-gold' },
  { key: 'under_review', label: 'Under review', tone: 'bg-warning' },
  { key: 'active', label: 'Active', tone: 'bg-success' },
  { key: 'suspended', label: 'Suspended', tone: 'bg-danger' },
] as const;

function sinceLabel(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  return `${days} d`;
}

export default async function RiderPipelinePage() {
  const staff = await requireStaff();
  const supabase = createClient();

  const [{ data: riders }, { data: documents }, { data: requirements }] = await Promise.all([
    supabase
      .from('rider')
      .select('id, first_name, last_name, status, vehicle, created_at, city(name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('document')
      .select('owner_id, status')
      .eq('owner_type', 'rider')
      .is('superseded_at', null),
    supabase.from('document_requirement').select('kind, applies_when').eq('owner_type', 'rider'),
  ]);

  /*
   * How many documents this rider owes is a function of their vehicle — the
   * same rule fn_rider_required_docs applies server-side. Counting it here is
   * only for the progress bar; nothing is decided by it.
   */
  const requiredFor = (vehicle: string) =>
    (requirements ?? []).filter((requirement) => {
      const when = requirement.applies_when as Record<string, string[]> | null;
      const vehicles = when?.['vehicle'];
      return !vehicles || vehicles.includes(vehicle);
    }).length;

  const verifiedByRider = new Map<string, number>();
  for (const document of documents ?? []) {
    if (document.status !== 'verified') continue;
    verifiedByRider.set(document.owner_id, (verifiedByRider.get(document.owner_id) ?? 0) + 1);
  }

  const columns: PipelineColumn[] = COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    tone: column.tone,
    cards: (riders ?? [])
      .filter((rider) => rider.status === column.key)
      .map((rider) => {
        const city = rider.city as { name: string } | null;
        const total = requiredFor(rider.vehicle);
        return {
          id: rider.id,
          title: `${rider.first_name} ${rider.last_name}`.trim(),
          meta: [rider.vehicle, city?.name].filter(Boolean).join(' · '),
          note: `Applied ${sinceLabel(rider.created_at)} ago`,
          href: `/riders/${rider.id}`,
          progress:
            column.key === 'applied' || column.key === 'active'
              ? null
              : { done: verifiedByRider.get(rider.id) ?? 0, total },
        };
      }),
  }));

  const inPipeline = columns
    .filter((column) => column.key !== 'active' && column.key !== 'suspended')
    .reduce((total, column) => total + column.cards.length, 0);

  return (
    <ConsoleShell staff={staff} current="/riders">
      <ConsoleHeader
        title="Rider onboarding"
        breadcrumb={`${inPipeline} in the pipeline · ${columns.find((c) => c.key === 'active')?.cards.length ?? 0} active`}
      />

      <main className="px-4 py-6 sm:px-8">
        <PipelineBoard columns={columns} />
      </main>
    </ConsoleShell>
  );
}
