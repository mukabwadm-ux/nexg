import type { ReactNode } from 'react';

import { MerchantOnboardingDemoProvider } from '@/components/merchant/merchant-onboarding-demo-provider';

export default function MerchantLivePreviewLayout({ children }: { children: ReactNode }) {
  return <MerchantOnboardingDemoProvider>{children}</MerchantOnboardingDemoProvider>;
}
