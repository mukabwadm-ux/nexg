import type { ReactNode } from 'react';
import Link from 'next/link';

import { Board, PageHead } from '@/components/merchant/frame';
import { InsightsWorkspace } from '@/components/merchant/insights/workspace';
import { loadMerchantInsights, MerchantInsightsError } from '@/lib/merchant-insights';

export const metadata = { title: 'Insights' };
export const dynamic = 'force-dynamic';

export default async function MerchantInsightsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; tab?: string };
}): Promise<ReactNode> {
  try {
    const { snapshot, policy, range } = await loadMerchantInsights(searchParams);
    return (
      <InsightsWorkspace
        mode="live"
        initialSnapshot={snapshot}
        initialPolicy={policy}
        initialFilters={{ ...range, locationId: 'all', activity: 'all', keyword: '' }}
        initialTab={searchParams.tab}
      />
    );
  } catch (error) {
    const known = error instanceof MerchantInsightsError;
    return (
      <Board>
        <PageHead
          title="Insights"
          lead="Understand the evidence behind your business performance."
        />
        <section className="border-border bg-surface rounded-xl border p-6" role="alert">
          <h2 className="text-lg font-bold">
            {known && error.status === 403
              ? 'Reporting access is restricted'
              : 'Insights could not be loaded'}
          </h2>
          <p className="text-muted mt-2 max-w-2xl text-sm leading-relaxed">
            {known
              ? error.message
              : 'The reporting connection is temporarily unavailable. Your existing work is unchanged.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/merchant/insights"
              className="bg-ink rounded-lg px-4 py-3 text-sm font-semibold text-white"
            >
              Retry with default dates
            </Link>
            <Link
              href="/merchant"
              className="border-border rounded-lg border px-4 py-3 text-sm font-semibold"
            >
              Return to Home
            </Link>
          </div>
        </section>
      </Board>
    );
  }
}
