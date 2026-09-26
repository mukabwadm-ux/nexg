import { Card } from '@nexg/ui';
import Link from 'next/link';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * What is waiting for a person right now.
 *
 * No invented figures: every count here is a real `count` query, and the
 * things the artboard shows that no data exists for — time to active, pass
 * rates — are left out rather than filled with plausible numbers
 * (ground rule 3).
 */
export default async function OverviewPage() {
  const staff = await requireStaff();
  const supabase = createClient();

  const pending = ['applied', 'documents_pending', 'under_review'];

  const [riderQueue, merchantQueue, riderActive, merchantLive, docsWaiting] = await Promise.all([
    supabase.from('rider').select('id', { count: 'exact', head: true }).in('status', pending),
    supabase.from('merchant').select('id', { count: 'exact', head: true }).in('status', pending),
    supabase.from('rider').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('merchant').select('id', { count: 'exact', head: true }).eq('status', 'live'),
    supabase
      .from('document')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'uploaded')
      .is('superseded_at', null),
  ]);

  const tiles = [
    { label: 'Riders in the pipeline', value: riderQueue.count ?? 0, href: '/riders' },
    { label: 'Merchants in the pipeline', value: merchantQueue.count ?? 0, href: '/merchants' },
    { label: 'Documents awaiting review', value: docsWaiting.count ?? 0, href: '/riders' },
    { label: 'Active riders', value: riderActive.count ?? 0, href: '/riders' },
    { label: 'Live merchants', value: merchantLive.count ?? 0, href: '/merchants' },
  ];

  return (
    <ConsoleShell staff={staff} current="/">
      <ConsoleHeader
        title={`Good to see you, ${staff.displayName.replace(/[[\]]/g, '').split(' ')[0]}`}
        breadcrumb="Overview"
      />

      <main className="px-4 py-6 sm:px-8">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <li key={tile.label}>
              <Link href={tile.href} className="block">
                <Card className="hover:shadow-raised p-5 transition-shadow">
                  <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.16em]">
                    {tile.label}
                  </p>
                  <p className="mt-2 text-4xl font-extrabold tracking-tight">{tile.value}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </ConsoleShell>
  );
}
