import { notFound } from 'next/navigation';
import { AviationDemoPage } from '@/components/merchant/aviation/demo-page';
import { AvailabilityWorkspace } from '@/components/merchant/availability/workspace';
import { parseMerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';

export const metadata = { title: 'Availability preview' };
export default function AvailabilityPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const demoContext = searchParams ? parseMerchantOnboardingDemoContext(searchParams) : null;
  if (demoContext?.categoryId === 'flights_aviation') return <AviationDemoPage active="Availability" demoContext={demoContext} />;
  const profileId = typeof searchParams?.profile === 'string' ? searchParams.profile : demoContext?.profileId;
  return <AvailabilityWorkspace initialProfileId={profileId} demoContext={demoContext} />;
}
