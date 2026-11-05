import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { ApplicationReviewActor } from '@/components/merchants/application-review-actor';
import {
  ApplicationReviewDetail,
  ApplicationReviewUnavailable,
} from '@/components/merchants/application-review-view';
import { MerchantTabs } from '@/components/merchants/shell';
import {
  loadMerchantApplicationReview,
  ReviewSourceError,
} from '@/lib/merchant-application-review';
import { loadMerchantDocumentReadiness } from '@/lib/merchant-document-readiness';
import { requireModule, requireStaff } from '@/lib/staff';

export const metadata: Metadata = { title: 'Review merchant application' };
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ManagedMerchantApplicationPage({
  params,
}: {
  params: { id: string };
}) {
  noStore();
  const staff = await requireStaff();
  requireModule(staff, 'merchants');
  let source: Awaited<ReturnType<typeof loadMerchantApplicationReview>>;
  let documents: Awaited<ReturnType<typeof loadMerchantDocumentReadiness>> = null;
  try {
    source = await loadMerchantApplicationReview(params.id);
    documents = await loadMerchantDocumentReadiness(params.id);
  } catch (error) {
    return (
      <ConsoleShell staff={staff} current="/merchants">
        <ConsoleHeader title="Review merchant application" breadcrumb="Merchants / Applications" />
        <main className="px-4 py-6 sm:px-8">
          <MerchantTabs current="applications" />
          <ApplicationReviewUnavailable
            status={error instanceof ReviewSourceError ? error.status : 503}
            href={`/merchants/applications/${encodeURIComponent(params.id)}`}
          />
        </main>
      </ConsoleShell>
    );
  }
  return (
    <ApplicationReviewActor key={source.actorId} actorId={source.actorId}>
      <ConsoleShell staff={staff} current="/merchants">
        <ConsoleHeader
          title="Review merchant application"
          breadcrumb="Merchants / Applications / Submitted snapshot"
        />
        <main className="px-4 py-6 sm:px-8">
          <MerchantTabs current="applications" />
          <Link
            prefetch={false}
            href="/merchants/applications"
            className="text-gold-text mt-4 inline-flex min-h-11 items-center text-sm font-bold"
          >
            Back to applications
          </Link>
          <ApplicationReviewDetail {...source} documents={documents} />
        </main>
      </ConsoleShell>
    </ApplicationReviewActor>
  );
}
