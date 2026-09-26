import type { Metadata } from 'next';

import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <ComingSoon
      milestone="Accounts arrive with the guest app"
      title="Sign in is not open yet."
      body="NexG does not have guest accounts yet — you ask the concierge without one, and they come back to you on the number you give them. Riders and merchants who have applied are contacted directly while their application is reviewed."
      actions={[
        { label: 'Ask the concierge', href: '/' },
        { label: 'Apply to ride', href: '/riders/apply', variant: 'outline' },
        { label: 'List a business', href: '/merchants/apply', variant: 'outline' },
      ]}
    />
  );
}
