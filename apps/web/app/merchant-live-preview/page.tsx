import { notFound } from 'next/navigation';

import type { MerchantHome } from '@/app/merchant/layout';
import { HomeLive } from '@/components/merchant/home-live';
import { HomeSetup } from '@/components/merchant/home-setup';
import { MerchantLivePreviewShell } from '@/components/merchant/live-preview-shell';
import type { BranchCard, OrderRow, SetupProgress, WeekBar, WeekMoney } from '@/components/merchant/types';
import {
  merchantOnboardingDemoQuery,
  parseMerchantOnboardingDemoContext,
} from '@/lib/merchant-onboarding-demo';
import { merchantOnboardingDemoDashboard } from '@/lib/merchant-onboarding-demo-dashboard';

export const metadata = { title: 'New merchant Home preview' };

const merchant = {
  name: 'Nairobi Collective',
  status: 'live',
  accepting_orders: true,
  orders_today: 12,
  earned_today_cents: 2480000,
} as MerchantHome;
const setupProgress: SetupProgress = {
  merchant_id: 'sample', trading_name: 'Nairobi Collective', status: 'documents_pending',
  submitted_at: null, went_live_at: null, step_profile: true, step_hours: true,
  step_team: true, step_catalogue: false, step_documents: false, step_payout: false,
  step_live: false, done_count: 3, of_count: 7, next_step: 4, can_go_live: false, is_live: false,
};
const branches: BranchCard[] = [
  {
    branch_id: 'sample-1',
    merchant_id: 'sample',
    name: 'Westlands',
    address_text: 'Westlands · Nairobi',
    is_primary: true,
    pin_confirmed: true,
    state: 'open',
    orders_today: 7,
    prep_avg_minutes: 20,
    catalogue_items: 12,
  },
  {
    branch_id: 'sample-2',
    merchant_id: 'sample',
    name: 'Kilimani',
    address_text: 'Kilimani · Nairobi',
    is_primary: false,
    pin_confirmed: true,
    state: 'open',
    orders_today: 5,
    prep_avg_minutes: 20,
    catalogue_items: 12,
  },
];
const orders: OrderRow[] = [
  {
    id: 'sample-order',
    reference: 'NX-SAMPLE-4612',
    stage: 'new',
    what_now: 'to_cook',
    guest: null,
    dropoff_label: null,
    store: 'Westlands',
    payment_method: null,
    item_count: 2,
    total_cents: null,
    placed_at: '2026-10-28T09:00:00Z',
    promised_ready_at: null,
    rider: null,
    needs_your_ack: true,
  },
];
const bars: WeekBar[] = [
  { day: '2024-06-06', dow: 'Thu', delivered: 8, gross_cents: 980000 },
  { day: '2024-06-07', dow: 'Fri', delivered: 11, gross_cents: 1600000 },
  { day: '2024-06-08', dow: 'Sat', delivered: 8, gross_cents: 1950000 },
  { day: '2024-06-09', dow: 'Sun', delivered: 13, gross_cents: 920000 },
  { day: '2024-06-10', dow: 'Mon', delivered: 16, gross_cents: 1200000 },
  { day: '2024-06-11', dow: 'Tue', delivered: 15, gross_cents: 1810000 },
  { day: '2024-06-12', dow: 'Wed', delivered: 12, gross_cents: 2720000 },
];
const money: WeekMoney = {
  merchant_id: 'sample',
  week_start: '2026-10-26',
  week_end: '2026-11-01',
  delivered: 28,
  gross_cents: 5730000,
  commission_cents: 573000,
  refund_cents: 0,
  net_cents: 5157000,
};

export default function LiveHomePreview({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }): import('react').ReactNode {
  if (process.env.NODE_ENV !== 'development') notFound();
  const onboardingDemo = searchParams ? parseMerchantOnboardingDemoContext(searchParams) : null;
  const businessName = onboardingDemo?.businessName ?? 'Nairobi Collective';
  const contactName = onboardingDemo?.contactName ?? businessName;
  const requestedState = Array.isArray(searchParams?.state) ? searchParams.state[0] ?? '' : searchParams?.state ?? '';
  const sampleState = requestedState === 'review' || requestedState === 'changes' ? requestedState : 'setup';
  const showSetup = ['setup', 'review', 'changes'].includes(requestedState);
  const liveState = requestedState === 'paused' || requestedState === 'mixed' || requestedState === 'unavailable' ? requestedState : 'live';
  const selectedBranches = branches.map((branch, index) => ({ ...branch, state: liveState === 'paused' || (liveState === 'mixed' && index === 1) ? 'paused' : branch.state }));
  const identityProgress = { ...setupProgress, trading_name: businessName };
  const displayedProgress = sampleState === 'setup' ? identityProgress : {
    ...identityProgress, step_catalogue: true, step_payout: true, done_count: 5, next_step: 5,
  };
  const identityMerchant = { ...merchant, name: businessName };
  const demoQuery = onboardingDemo ? merchantOnboardingDemoQuery(onboardingDemo) : '';

  return (
    <MerchantLivePreviewShell active="Home" businessName={businessName} accountInitials={onboardingDemo?.initials} demoContext={onboardingDemo}>
        {showSetup ? <HomeSetup businessName={businessName} businessCategory={onboardingDemo?.categoryName} businessSubcategories={onboardingDemo?.subcategories.map((item) => item.name)} previewBase={onboardingDemo ? '/merchant-live-preview' : undefined} previewQuery={demoQuery} progress={displayedProgress} branches={[branches[0]!]} preview sampleState={sampleState} /> : <HomeLive
          m={{ ...identityMerchant, accepting_orders: liveState !== 'paused' }}
          personName={contactName}
          branches={selectedBranches}
          attention={[]}
          orders={orders}
          money={money}
          bars={bars}
          unavailable={{
            branches: liveState === 'unavailable',
            attention: liveState === 'unavailable',
            orders: liveState === 'unavailable',
            money: liveState === 'unavailable',
            bars: liveState === 'unavailable',
          }}
          preview
          previewState={liveState}
          previewDemo={merchantOnboardingDemoDashboard(onboardingDemo)}
        />}
    </MerchantLivePreviewShell>
  );
}
