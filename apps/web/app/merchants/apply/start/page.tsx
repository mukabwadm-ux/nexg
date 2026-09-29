import type { Metadata } from 'next';

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
