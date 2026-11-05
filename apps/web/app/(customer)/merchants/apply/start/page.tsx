import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { StartStep } from '@/components/onboarding/step-start';

export const metadata: Metadata = {
  title: 'Get your business in front of guests',
  description:
    'List your business on NexG. Six short steps, about eight minutes, and nothing goes public until our team verifies you.',
};

export default function StartPage({
  searchParams,
}: {
  searchParams?: { trading_name?: string; contact_name?: string; phone?: string; email?: string };
}) {
  // Once the connected V1 journey is enabled, the old six-step intake must not
  // remain an alternate merchant-registration entry point.
  if (process.env.MERCHANT_ONBOARDING_V1_ENABLED !== 'false') redirect('/merchants/register');

  return (
    <StartStep
      prefill={{
        tradingName: searchParams?.trading_name ?? '',
        contactName: searchParams?.contact_name ?? '',
        phone: searchParams?.phone ?? null,
        email: searchParams?.email ?? '',
      }}
    />
  );
}
