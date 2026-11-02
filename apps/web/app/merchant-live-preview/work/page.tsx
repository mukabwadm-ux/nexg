import { notFound } from 'next/navigation';
import { MerchantLivePreviewShell } from '@/components/merchant/live-preview-shell';
import { AvailabilityWorkEntry } from '@/components/merchant/availability/work-entry';
import { MoneyWorkEntry } from '@/components/merchant/money/work-entry';
import { parseMerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';

export const metadata = { title: 'Work preview' };

export default function WorkPreviewPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const demoContext = searchParams ? parseMerchantOnboardingDemoContext(searchParams) : null;
  return (
    <MerchantLivePreviewShell active="Work" businessName={demoContext?.businessName} accountInitials={demoContext?.initials} demoContext={demoContext}>
      {typeof searchParams?.moneyProfile === 'string' ? <MoneyWorkEntry /> : <AvailabilityWorkEntry />}
    </MerchantLivePreviewShell>
  );
}
