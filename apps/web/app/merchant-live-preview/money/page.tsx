import { notFound } from 'next/navigation';
import { MoneyWorkspace } from '@/components/merchant/money/workspace';
import { parseMerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';

export const metadata = { title: 'Money preview' };
export default function MoneyPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const demoContext = searchParams ? parseMerchantOnboardingDemoContext(searchParams) : null;
  const profileId =
    typeof searchParams?.profile === 'string' ? searchParams.profile : demoContext?.profileId;
  return <MoneyWorkspace initialProfileId={profileId} demoContext={demoContext} />;
}
