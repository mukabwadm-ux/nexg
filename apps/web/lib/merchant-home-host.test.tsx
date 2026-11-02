import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import SavedHome from '../../../merchant-onboarding/src/ConnectedMerchantHome';
import Registration from '../../../merchant-onboarding/src/MerchantOnboarding';
import { projectMerchantSavedHome } from './merchant-home-source';
import { resolveOnboardingSelection } from '@nexg/booking-config/onboarding';
import type {
  MerchantApplicationRecord,
  MerchantPayoutRecord,
} from '@nexg/contracts/merchant-application';

const id = '0194b62d-4ff0-7b09-8519-d7597b8312bf';
const record: MerchantApplicationRecord = {
  merchant_id: id,
  revision: 1,
  payload: {
    registryRevision: 'nexg-booking-2026-10-31.1',
    business: {
      name: 'Acacia Kitchen',
      firstName: 'Amina',
      lastName: 'Otieno',
      email: 'amina@example.test',
      phone: '+254712345678',
      branchCount: 1,
      registered: false,
      sameBusinessPhone: true,
      businessPhone: '+254712345678',
      marketing: false,
    },
    categoryId: 'restaurants_food',
    subcategories: ['restaurant'],
    answersBySubcategory: {},
    policies: { terms: true },
  },
  review: {
    state: 'approved',
    submitted_revision: 1,
    submitted_at: '2026-11-02T08:00:00Z',
    needs_resubmission: false,
  },
  access: { state: 'approved', setup: true, operations: true },
  publication: { status: 'live' },
};
const payout: MerchantPayoutRecord = {
  merchant_id: id,
  version: 0,
  payout: null,
  verification: 'declared',
};
const saved = (savedRecord = record) =>
  projectMerchantSavedHome({
    record: savedRecord,
    payout,
    access: { state: 'approved', setup: true, operations: true, revision: 1 },
    catalogue: { state: 'known', records: [] },
    branches: { state: 'known', records: [] },
    hours: { state: 'known', records: [] },
    documents: { state: 'known', records: [] },
  });
const selection = resolveOnboardingSelection('restaurants_food', ['restaurant']);
describe('saved Home host and connected entry copy', () => {
  it.each([
    ['Please correct the business name. <script>unsafe()</script>', 'changes_requested', false, true],
    [{ private: 'not a valid review reason' }, 'changes_requested', false, false],
    ['x'.repeat(2001), 'changes_requested', false, false],
    ['Keep the existing reviewed information.', 'pending', true, true],
  ] as const)('renders bounded staff feedback against the submitted revision: %s', (reason, state, needsResubmission, visible) => {
    const revised = { ...record, revision: needsResubmission ? 2 : 1,
      review: { ...record.review, state: state as MerchantApplicationRecord['review']['state'], reason, needs_resubmission: needsResubmission,
        submitted_revision: 1 } };
    const savedHome = saved(revised);
    const html = renderToStaticMarkup(<SavedHome form={record.payload} files={{}} selection={selection}
      previewMode={false} embedded applicationStatus={state} savedHome={savedHome}
      onExitDemo={undefined} onEdit={() => {}} onRegistration={() => {}} />);
    expect(html.includes('Review feedback · submitted revision')).toBe(visible);
    if (visible) {
      expect(html).not.toContain('<script>');
      if (typeof reason === 'string') expect(html).toContain(reason.replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
    } else expect(savedHome.review.reason).toBeNull();
  });
  it('never substitutes a local capture when saved records are unavailable', () => {
    const html = renderToStaticMarkup(
      <SavedHome
        form={record.payload}
        files={{}}
        selection={selection}
        previewMode={false}
        embedded
        applicationStatus="approved"
        savedHome={undefined}
        onExitDemo={undefined}
        onEdit={() => {}}
        onRegistration={() => {}}
      />,
    );
    expect(html).toContain('We could not load your workspace');
    expect(html).not.toContain('Welcome, Acacia Kitchen');
    expect(html).not.toContain('Setup progress');
  });
  it('respects published state without claiming unpublished or adding a portal demo control', () => {
    const html = renderToStaticMarkup(
      <SavedHome
        form={record.payload}
        files={{}}
        selection={selection}
        previewMode={false}
        embedded
        applicationStatus="approved"
        savedHome={saved()}
        onExitDemo={undefined}
        onEdit={() => {}}
        onRegistration={() => {}}
      />,
    );
    expect(html).toContain('your business is published');
    expect(html).not.toContain('business remains unpublished');
    expect(html).not.toContain('Try demo');
    expect(html).not.toContain('/merchant-live-preview');
  });
  it('uses the connected submit-to-Home contract rather than promising OTP', () => {
    const html = renderToStaticMarkup(
      <Registration
        initialData={record.payload}
        onSubmit={undefined}
        onSaveDraft={undefined}
        onSaveTask={undefined}
        onTaskNavigation={undefined}
        onDemo={() => {}}
        onExitDemo={undefined}
        savedHome={saved()}
        applicationStatus="approved"
        onStatusChange={undefined}
        onBackToMarketplace={undefined}
        authenticatedSession={undefined}
      />,
    );
    expect(html).toContain('Submit and open Home');
    expect(html).not.toContain('Continue to email verification');
    expect(html).toContain('Your workspace is approved');
    expect(html).toContain('Try demo');
  });
});
