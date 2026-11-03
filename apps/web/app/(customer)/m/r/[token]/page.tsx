import type { Metadata } from 'next';

import { ResumeClaim } from '@/components/onboarding/resume-claim';

export const metadata: Metadata = {
  title: 'Picking up where you left off',
  robots: { index: false, follow: false },
};

export default function ResumePage({ params }: { params: { token: string } }) {
  return <ResumeClaim token={params.token} />;
}
