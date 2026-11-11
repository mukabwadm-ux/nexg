import type { Metadata } from 'next';

import { RiderStartStep } from '@/components/rider-onboarding/step-start';

export const metadata: Metadata = {
  title: 'Ride with NexG',
  description:
    'Apply to deliver for NexG. Five short steps, about six minutes, and nothing is shared until our team verifies you.',
};

export default function Page({
  searchParams,
}: {
  searchParams?: {
    invite?: string;
    first_name?: string;
    phone?: string;
    city?: string;
    vehicle?: string;
  };
}) {
  const text = (value: string | undefined) =>
    typeof value === 'string' && value.length <= 100 ? value : undefined;
  return (
    <RiderStartStep
      fleetToken={searchParams?.invite ?? null}
      prefill={{
        firstName: text(searchParams?.first_name),
        phone: /^\+?\d{9,15}$/.test(searchParams?.phone ?? '') ? searchParams?.phone : undefined,
        cityId: text(searchParams?.city),
        vehicle: text(searchParams?.vehicle),
      }}
    />
  );
}
