import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Rider sign in' };

export default function RiderSignInPage() {
  return (
    <ComingSoon
      milestone="Rider portal in progress"
      title="The Rider portal is not open yet."
      body="Applications are reviewed by the NexG team and we come back to you directly — there is nothing to sign in to while that happens. The portal where you will track your own status arrives with the next milestone."
      actions={[
        { label: 'Check what we ask for', href: '/riders' },
        { label: 'Start an application', href: '/riders/apply', variant: 'outline' },
      ]}
    />
  );
}
