import { MerchantLivePreviewShell, type MerchantWorkspaceSection } from '../live-preview-shell';
import type { MerchantOnboardingDemoContext } from '@/lib/merchant-onboarding-demo';

/** Bypass other specialty sources for this isolated meeting preview. */
export function AviationDemoPage({
  active,
  demoContext,
}: {
  active: MerchantWorkspaceSection;
  demoContext: MerchantOnboardingDemoContext;
}) {
  return (
    <MerchantLivePreviewShell
      active={active}
      businessName={demoContext.businessName}
      accountInitials={demoContext.initials}
      demoContext={demoContext}
    >
      {null}
    </MerchantLivePreviewShell>
  );
}
