import { notFound } from 'next/navigation';
import { AviationDemoPage } from '@/components/merchant/aviation/demo-page';
import { PromotionsWorkspace } from '@/components/merchant/promotions/workspace';
import { parseMerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';

export const metadata = { title: 'Promotions preview' };

export default function PromotionsPreview({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const demoContext = searchParams ? parseMerchantOnboardingDemoContext(searchParams) : null;
  if (demoContext?.categoryId === 'flights_aviation') return <AviationDemoPage active="Promotions" demoContext={demoContext} />;
  const profile = typeof searchParams?.profile === 'string' ? searchParams.profile : demoContext?.profileId;
  return <PromotionsWorkspace initialProfileId={profile} demoContext={demoContext} />;
}
