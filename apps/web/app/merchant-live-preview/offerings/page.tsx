import { notFound } from 'next/navigation';
import { MerchantLivePreviewShell } from '@/components/merchant/live-preview-shell';
import { OfferingsWorkspace } from '@/components/merchant/offerings/workspace';
import {
  appendMerchantOnboardingDemoContext,
  parseMerchantOnboardingDemoContext,
} from '@/lib/merchant-onboarding-demo';

export const metadata = { title: 'Offerings preview' };

export default function OfferingsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const initialProfileId =
    typeof searchParams?.profile === 'string' ? searchParams.profile : undefined;
  const initialOfferingId =
    typeof searchParams?.offering === 'string' ? searchParams.offering : undefined;
  const demoContext = searchParams ? parseMerchantOnboardingDemoContext(searchParams) : null;
  const profileId = initialProfileId ?? demoContext?.profileId;
  const returnTo =
    typeof searchParams?.returnTo === 'string' &&
    (searchParams.returnTo.startsWith('/merchant-live-preview/availability?') ||
      searchParams.returnTo.startsWith('/merchant-live-preview/money?'))
      ? searchParams.returnTo
      : undefined;
  const demoReturnTo = returnTo
    ? appendMerchantOnboardingDemoContext(returnTo, demoContext)
    : undefined;
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <MerchantLivePreviewShell active="Offerings" businessName={demoContext?.businessName} accountInitials={demoContext?.initials} demoContext={demoContext}>
      <OfferingsWorkspace
        initialProfileId={profileId}
        initialOfferingId={initialOfferingId}
        returnTo={demoReturnTo}
      />
    </MerchantLivePreviewShell>
  );
}
