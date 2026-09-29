import type { Metadata } from 'next';

import { RiderStartStep } from '@/components/rider-onboarding/step-start';

export const metadata: Metadata = {
  title: 'Ride with NexG',
  description:
    'Apply to deliver for NexG. Five short steps, about six minutes, and nothing is shared until our team verifies you.',
};

export default function Page({ searchParams }: { searchParams?: { invite?: string } }) {
  return <RiderStartStep fleetToken={searchParams?.invite ?? null} />;
}
