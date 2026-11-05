// Component fixture only. Mock callbacks never authenticate or save remotely.
import React from 'react';
import { createRoot } from 'react-dom/client';
import MerchantOnboarding from '../src/MerchantOnboarding';
import '../src/workspace-theme.css';
import { projectMerchantSavedHome } from '../../apps/web/lib/merchant-home-source';
const merchantId = '0194b62d-4ff0-7b09-8519-d7597b8312bf';
const capture = {
  registryRevision: 'nexg-booking-2026-10-31.1',
  categoryId: 'restaurants_food',
  subcategories: ['restaurant'],
  answersBySubcategory: {},
  business: {
    name: 'Acacia Kitchen',
    firstName: 'Amina',
    lastName: 'Otieno',
    phone: '+254712345678',
    email: 'amina@example.test',
    branchCount: 1,
    registered: false,
    sameBusinessPhone: true,
    businessPhone: '+254712345678',
    marketing: false,
  },
  policies: { terms: true },
};
const access = {
  state: 'pending',
  setup: true,
  operations: false,
  review_state: 'pending',
  revision: 1,
  needs_resubmission: false,
};
const record = {
  merchant_id: merchantId,
  revision: 1,
  payload: capture,
  review: {
    state: 'pending',
    submitted_revision: 1,
    submitted_at: '2026-11-02T08:00:00Z',
    needs_resubmission: false,
  },
  access,
  publication: { status: 'applied' },
};
const savedHome = projectMerchantSavedHome({
  record,
  payout: { merchant_id: merchantId, version: 0, payout: null, verification: 'declared' },
  access,
  catalogue: { state: 'known', records: [] },
  branches: { state: 'known', records: [] },
  hours: { state: 'known', records: [] },
  documents: { state: 'known', records: [] },
});
window.__payoutFixture = [];
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <p role="note">Component test fixture. No authentication or backend persistence.</p>
    <MerchantOnboarding
      initialHome
      savedHome={savedHome}
      applicationStatus="pending"
      initialData={{
        registryRevision: 'nexg-booking-2026-10-31.1',
        categoryId: 'restaurants_food',
        subcategories: ['restaurant'],
        business: {
          name: 'Acacia Kitchen',
          firstName: 'Amina',
          lastName: 'Otieno',
          phone: '+254712345678',
          email: 'amina@example.test',
          branchCount: 1,
          registered: false,
          sameBusinessPhone: true,
          businessPhone: '+254712345678',
          marketing: false,
        },
        policies: { terms: true },
      }}
      onSaveTask={async (payload, { step }) => {
        if (step !== 5) throw new Error('This fixture covers payout only.');
        window.__payoutFixture.push(payload.payout);
        return { version: 1 };
      }}
    />
  </React.StrictMode>,
);
