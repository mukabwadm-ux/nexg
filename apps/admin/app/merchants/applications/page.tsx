import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { ApplicationReviewActor } from '@/components/merchants/application-review-actor';
import { ApplicationReviewQueue, ApplicationReviewUnavailable } from '@/components/merchants/application-review-view';
import { MerchantTabs } from '@/components/merchants/shell';
import { loadMerchantApplicationQueue, ReviewSourceError } from '@/lib/merchant-application-review';
import type { ApplicationReviewQueueQuery } from '@/lib/merchant-application-review-contracts';
import { requireModule, requireStaff } from '@/lib/staff';

export const metadata: Metadata = { title: 'Merchant applications' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MerchantApplicationsPage({ searchParams }: { searchParams?: { cursor?: string; state?: string } }) {
  noStore();
  const staff = await requireStaff();
  requireModule(staff, 'merchants');
  let source: Awaited<ReturnType<typeof loadMerchantApplicationQueue>>;
  try {
    source = await loadMerchantApplicationQueue({ cursor: searchParams?.cursor, state: searchParams?.state as ApplicationReviewQueueQuery['state'] });
  } catch (error) {
    return <ConsoleShell staff={staff} current="/merchants"><ConsoleHeader title="Merchant applications" breadcrumb="Merchants / Applications" /><main className="px-4 py-6 sm:px-8"><MerchantTabs current="applications" /><ApplicationReviewUnavailable status={error instanceof ReviewSourceError ? error.status : 503} /></main></ConsoleShell>;
  }
  return <ApplicationReviewActor key={source.actorId} actorId={source.actorId}><ConsoleShell staff={staff} current="/merchants"><ConsoleHeader title="Merchant applications" breadcrumb="Managed registration / Staff review" /><main className="px-4 py-6 sm:px-8"><MerchantTabs current="applications" /><ApplicationReviewQueue items={source.items} nextCursor={source.nextCursor} state={searchParams?.state ?? 'pending'} /></main></ConsoleShell></ApplicationReviewActor>;
}
