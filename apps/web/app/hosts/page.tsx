import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Hotels & Airbnb' };

export default function HostsPage() {
  return (
    <ComingSoon
      milestone="Hotel and host partnerships"
      title="For hotels, apartments and hosts."
      body="NexG works alongside your front desk: your guests ask us for what they need, a vetted rider brings it, and you keep the relationship without hiring anyone. The partner pages where you would sign up are still being built."
      actions={[
        { label: 'Talk to us', href: '/help' },
        { label: 'See how it works', href: '/#how-it-works', variant: 'outline' },
      ]}
    />
  );
}
