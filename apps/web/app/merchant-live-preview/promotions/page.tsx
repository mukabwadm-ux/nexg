import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { PromotionsWorkspace } from '@/components/merchant/promotions/workspace';
import { parseMerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';

export const metadata = { title: 'Promotions preview' };

export default function PromotionsPreview({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): ReactNode {
  if (process.env.NODE_ENV !== 'development') notFound();
  const demoContext = searchParams ? parseMerchantOnboardingDemoContext(searchParams) : null;
  const profile =
    typeof searchParams?.profile === 'string' ? searchParams.profile : demoContext?.profileId;
  return <PromotionsWorkspace initialProfileId={profile} demoContext={demoContext} />;
}
