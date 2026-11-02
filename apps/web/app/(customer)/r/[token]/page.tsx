import type { Metadata } from 'next';

import { RiderResumeClaim } from '@/components/rider-onboarding/resume-claim';

export const metadata: Metadata = {
  title: 'Picking up where you left off',
  robots: { index: false, follow: false },
};

export default function RiderResumePage({ params }: { params: { token: string } }) {
  return <RiderResumeClaim token={params.token} />;
}
