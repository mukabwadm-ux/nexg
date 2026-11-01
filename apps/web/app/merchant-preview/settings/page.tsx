import { Suspense } from 'react';

import { SettingsChrome } from '@/components/merchant/settings/chrome';
import { SAMPLE_IDENTITY } from '@/components/merchant/settings/model';
import { SettingsWorkspace } from '@/components/merchant/settings/workspace';

export const metadata = { title: 'Settings preview', robots: { index: false, follow: false } };

export default function SettingsPreview() {
  return (
    <SettingsChrome
      businessName={SAMPLE_IDENTITY.businessName}
      personName={SAMPLE_IDENTITY.name}
      sample
    >
      <Suspense
        fallback={
          <p className="p-6" role="status">
            Loading Settings…
          </p>
        }
      >
        <SettingsWorkspace identity={SAMPLE_IDENTITY} />
      </Suspense>
    </SettingsChrome>
  );
}
