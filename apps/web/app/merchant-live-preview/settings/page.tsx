import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { MerchantLivePreviewShell } from '@/components/merchant/live-preview-shell';
import { SAMPLE_IDENTITY } from '@/components/merchant/settings-artboard/model';
import { SettingsWorkspace } from '@/components/merchant/settings-artboard/workspace';
import { parseMerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';

export const metadata = {
  title: 'Settings preview',
  robots: { index: false, follow: false },
};

export default function SettingsPreviewPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): ReactNode {
  if (process.env.NODE_ENV !== 'development') notFound();
  const demoContext = searchParams ? parseMerchantOnboardingDemoContext(searchParams) : null;
  const identity = demoContext
    ? { ...SAMPLE_IDENTITY, businessName: demoContext.businessName, name: demoContext.contactName }
    : SAMPLE_IDENTITY;
  return (
    <MerchantLivePreviewShell
      active="Settings"
      businessName={demoContext?.businessName}
      accountInitials={demoContext?.initials}
      demoContext={demoContext}
    >
      <Suspense fallback={<p className="p-6">Loading Settings…</p>}>
        <SettingsWorkspace identity={identity} />
      </Suspense>
    </MerchantLivePreviewShell>
  );
}
