import { notFound } from 'next/navigation';
import { AviationDemoPage } from '@/components/merchant/aviation/demo-page';
import { BusinessWorkspace } from '@/components/merchant/business/workspace';
import type { Section } from '@/components/merchant/business/model';
import { parseMerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';
export const metadata = { title: 'Business preview' };
export default function BusinessPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const demoContext = searchParams ? parseMerchantOnboardingDemoContext(searchParams) : null;
  if (demoContext?.categoryId === 'flights_aviation') return <AviationDemoPage active="Business" demoContext={demoContext} />;
  return (
    <BusinessWorkspace
      initialProfileId={typeof searchParams?.profile === 'string' ? searchParams.profile : demoContext?.profileId}
      initialTab={typeof searchParams?.tab === 'string' ? searchParams.tab as Section : undefined}
      demoContext={demoContext}
    />
  );
}
