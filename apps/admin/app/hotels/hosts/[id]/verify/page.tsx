import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { verifyHost } from '@/app/hotels/actions';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { HostVerificationForm } from '@/components/hotels/host-verification-form';
import { Card } from '@nexg/ui';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Verify hospitality host' };
export const dynamic = 'force-dynamic';

export default async function VerifyHostPage({ params }: { params: { id: string } }) {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.id)
  ) {
    notFound();
  }

  const supabase = createClient();
  const { data: host, error } = await supabase
    .from('console_host_directory_v')
    .select('id, display_name, contact_name, city_name, kind, status, submitted_at')
    .eq('id', params.id)
    .maybeSingle();

  if (error) throw new Error(`Could not load host: ${error.message}`);
  if (!host?.id) notFound();

  const canVerify = host.status === 'applied' || host.status === 'verifying';

  return (
    <ConsoleShell staff={staff} current="/hotels">
      <ConsoleHeader title="Verify hospitality host" breadcrumb="Partners · Hotels & Airbnb" />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
        <Link
          href={`/hotels?tab=hosts&selected=${host.id}`}
          className="text-muted hover:text-ink text-sm font-semibold"
        >
          ← Back to host
        </Link>

        <Card className="mt-5 p-5 sm:p-7">
          <p className="text-muted text-[0.6875rem] font-extrabold uppercase tracking-wide">
            Host application
          </p>
          <h1 className="mt-2 text-xl font-extrabold">
            {host.display_name || host.contact_name || 'Unnamed host'}
          </h1>
          <p className="text-muted mt-1 text-sm font-semibold">
            {[host.city_name, host.kind?.replaceAll('_', ' '), host.status]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {canVerify ? (
            <HostVerificationForm hostId={host.id} action={verifyHost} />
          ) : (
            <p className="bg-surface mt-6 rounded-lg p-4 text-sm font-semibold">
              This host is {host.status ?? 'no longer awaiting verification'} and cannot be verified
              from this page.
            </p>
          )}
        </Card>
      </main>
    </ConsoleShell>
  );
}
