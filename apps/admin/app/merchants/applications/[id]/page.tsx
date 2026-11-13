import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';

import { deleteMerchant } from '@/app/merchants/actions';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { ApplicationAgreement } from '@/components/merchants/application-agreement';
import { ApplicationReviewActor } from '@/components/merchants/application-review-actor';
import {
  ApplicationReviewDetail,
  ApplicationReviewUnavailable,
} from '@/components/merchants/application-review-view';
import { MerchantDocumentsSection } from '@/components/merchants/documents-section';
import { MerchantTabs } from '@/components/merchants/shell';
import { loadMerchantDocuments } from '@/lib/merchant-documents';
import {
  loadMerchantApplicationReview,
  ReviewSourceError,
} from '@/lib/merchant-application-review';
import { MerchantLifecycleActions } from '@/components/merchant-lifecycle-actions';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

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
  try {
    source = await loadMerchantApplicationReview(params.id);
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
  /* The name Delete asks staff to type is the one the database checks. */
  const canDelete = staff.isSuperAdmin || staff.roles.includes('merchant_ops');
  const { data: merchant } = canDelete
    ? await createClient()
        .from('merchant')
        .select('trading_name, legal_name, status, deleted_at')
        .eq('id', params.id)
        .maybeSingle()
    : { data: null };
  const merchantName = merchant?.trading_name || merchant?.legal_name || '';
  /* The documents the applicant uploaded, beside the application they
     belong to: a reviewer should not have to approve first to read them. */
  const documents = await loadMerchantDocuments(createClient(), params.id);
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
          {source.record.review.state === 'approved' ? (
            <Link
              prefetch={false}
              href={`/merchants/${encodeURIComponent(params.id)}`}
              className="bg-ink text-bg ml-4 mt-4 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-bold"
            >
              Manage merchant: documents, Take live, edit
            </Link>
          ) : null}
          <a
            href="#documents"
            className="border-border hover:border-ink ml-4 mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-bold"
          >
            Documents
            <span
              className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
                documents.outstanding.length === 0
                  ? 'bg-success-bg text-success'
                  : 'bg-warning-bg text-warning'
              }`}
            >
              {documents.onFile} of {documents.review.length} on file
            </span>
          </a>
          <ApplicationAgreement merchantId={params.id} />
          <ApplicationReviewDetail {...source} />
          <div className="mt-10 max-w-4xl">
            <MerchantDocumentsSection merchantId={params.id} {...documents} />
          </div>
          {merchant && !merchant.deleted_at && merchantName ? (
            <div className="mt-6 max-w-md">
              <MerchantLifecycleActions
                merchantId={params.id}
                merchantName={merchantName}
                status={merchant.status}
                isDeactivated={false}
                onDelete={async (confirmationName, reason) => {
                  'use server';
                  return deleteMerchant(params.id, confirmationName, reason);
                }}
              />
            </div>
          ) : null}
        </main>
      </ConsoleShell>
    </ApplicationReviewActor>
  );
}
