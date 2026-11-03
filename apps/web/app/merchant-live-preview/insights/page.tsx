import { notFound } from 'next/navigation';
import { InsightsWorkspace } from '@/components/merchant/insights/workspace';
import { parseMerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';

export const metadata = { title: 'Adaptive Insights preview' };

export default function InsightsPreview({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const demoContext = searchParams ? parseMerchantOnboardingDemoContext(searchParams) : null;
  return (
    <InsightsWorkspace
      mode="sample"
      initialProfileId={typeof searchParams?.profile === 'string' ? searchParams.profile : demoContext?.profileId}
      initialTab={typeof searchParams?.tab === 'string' ? searchParams.tab : undefined}
      demoContext={demoContext}
    />
  );
}
