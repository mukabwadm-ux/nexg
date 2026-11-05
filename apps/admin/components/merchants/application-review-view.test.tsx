import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type {
  ApplicationReviewRecord,
  SubmittedApplicationSnapshot,
} from '@/lib/merchant-application-review-contracts';
import {
  ApplicationReviewDetail,
  ApplicationReviewQueue,
  ApplicationReviewUnavailable,
} from './application-review-view';
import { MerchantTabs } from './shell';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const record: ApplicationReviewRecord = {
  merchant_id: '20000000-0000-4000-8000-000000000002',
  revision: 3,
  payload: {
    registryRevision: 'nexg-booking-2026-10-31.1',
    business: {
      name: 'Current saved name',
      firstName: 'Amina',
      lastName: 'Owino',
      email: 'amina@example.test',
      phone: '+254712345678',
      branchCount: 8,
      registered: true,
      sameBusinessPhone: true,
      businessPhone: '',
      marketing: false,
    },
    categoryId: 'restaurants_food',
    subcategories: ['cafe'],
    answersBySubcategory: {},
    policies: { terms: true },
  },
  review: {
    state: 'pending',
    submitted_revision: 2,
    submitted_at: '2026-11-02T08:00:00Z',
    needs_resubmission: true,
    reason: null,
  },
  access: { state: 'pending', setup: true, operations: false },
  publication: { status: 'applied', accepting_orders: false },
};
const submitted: SubmittedApplicationSnapshot = {
  merchant_id: record.merchant_id,
  revision: 2,
  payload: {
    ...record.payload,
    business: { ...record.payload.business, name: 'Exact submitted name' },
  },
  submitted_at: '2026-11-02T08:00:00Z',
  submitted_by: '10000000-0000-4000-8000-000000000001',
};

describe('application review server-rendered facts', () => {
  it('shows the exact submitted snapshot and current facts separately and prevents stale review', () => {
    const html = renderToStaticMarkup(
      <ApplicationReviewDetail actorId="staff" record={record} submitted={submitted} canReview />,
    );
    expect(html).toContain('Exact submitted name');
    expect(html).toContain('Current saved name');
    expect(html).toContain('Submitted snapshot');
    expect(html).toContain('Current saved application · revision 3');
    expect(html).toContain('A new submission is required before a decision');
    expect(html).toContain('This application is read-only');
    expect(html).not.toContain('Confirm approve workspace access');
    expect(html).toContain('Publication: applied');
  });

  it('offers review only for the current submitted pending revision and keeps activation separate', () => {
    const current = {
      ...record,
      revision: 2,
      review: { ...record.review, needs_resubmission: false },
    };
    const html = renderToStaticMarkup(
      <ApplicationReviewDetail actorId="staff" record={current} submitted={submitted} canReview />,
    );
    expect(html).toContain('Review revision 2');
    expect(html).toContain('Confirm approve workspace access');
    expect(html).toContain('Publication and accepting work require separate activation checks');
    expect(html).toContain(
      'Document verification, finance checks, publication and accepting work remain separate',
    );
  });

  it('keeps cityless applications in their own bounded queue with a cursor link', () => {
    const html = renderToStaticMarkup(
      <>
        <MerchantTabs current="applications" />
        <ApplicationReviewQueue
          state="pending"
          nextCursor="safe_cursor"
          items={[
            {
              merchantId: record.merchant_id,
              businessName: 'Cityless short application',
              categoryId: 'restaurants_food',
              subcategories: ['cafe'],
              revision: 2,
              submittedRevision: 2,
              reviewState: 'pending',
              needsResubmission: false,
              submittedAt: submitted.submitted_at,
              updatedAt: submitted.submitted_at,
            },
          ]}
        />
      </>,
    );
    expect(html).toContain('Cityless short application');
    expect(html).toContain('Showing 1 in your current review scope');
    expect(html).toContain('includes applications without an assigned city');
    expect(html).toContain('/merchants/applications?state=pending&amp;cursor=safe_cursor');
    expect(html).toContain(`href="/merchants/applications/${record.merchant_id}"`);
    expect(html).toContain('aria-current="page"');
  });

  it('distinguishes an empty scoped queue from an unavailable or denied source', () => {
    const empty = renderToStaticMarkup(
      <ApplicationReviewQueue state="pending" items={[]} nextCursor={null} />,
    );
    expect(empty).toContain('No managed applications match this state in your current scope');
    const unavailable = renderToStaticMarkup(<ApplicationReviewUnavailable />);
    expect(unavailable).toContain('The current application source is unavailable');
    expect(unavailable).not.toContain('No managed applications match');
    expect(renderToStaticMarkup(<ApplicationReviewUnavailable status={403} />)).toContain(
      'Use a current staff account',
    );
  });
});
