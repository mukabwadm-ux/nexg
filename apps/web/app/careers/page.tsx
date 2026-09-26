import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Careers' };

export default function CareersPage() {
  return (
    <ComingSoon
      milestone="Hiring opens with the next city"
      title="Careers at NexG."
      body="There is no open role listed today. Riding with NexG is a separate thing and that is open now — it has its own application, its own requirements and its own pay."
      actions={[
        { label: 'Ride with NexG', href: '/riders' },
        { label: 'Get in touch', href: '/help', variant: 'outline' },
      ]}
    />
  );
}
