import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { MerchantActivityLog } from '@/components/merchants/activity-log';
import { requireModule, requireStaff } from '@/lib/staff';

export const metadata: Metadata = { title: 'Merchant activity' };
export const dynamic = 'force-dynamic';

/** The whole of one merchant's activity log, a page at a time. Staff only. */
export default async function MerchantActivityPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { before?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'merchants');
  const before = Number(searchParams?.before);

  return (
    <ConsoleShell staff={staff} current="/merchants">
      <ConsoleHeader
        title="Merchant activity log"
        breadcrumb="Merchants / Activity · what their team did in the merchant portal"
      />
      <main className="px-4 py-6 sm:px-8">
        <Link
          href={`/merchants/${encodeURIComponent(params.id)}`}
          className="text-muted text-[0.8125rem] font-bold underline"
        >
          Back to the merchant
        </Link>
        <div className="mt-4 max-w-[60rem]">
          <MerchantActivityLog
            merchantId={params.id}
            limit={100}
            before={Number.isFinite(before) && before > 0 ? before : null}
            full
          />
        </div>
      </main>
    </ConsoleShell>
  );
}
