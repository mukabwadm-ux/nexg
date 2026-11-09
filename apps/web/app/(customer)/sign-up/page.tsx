import type { Metadata } from 'next';

import { AuthShell } from '@/components/auth/auth-shell';
import { CustomerSignUp } from '@/components/auth/customer-sign-up';
import { safeNext } from '@/lib/auth-portals';

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create a NexG account to save places, follow orders and book stays.',
};

/** Customer account creation. Merchants, riders and hosts apply on their own pages. */
export default function SignUpPage({ searchParams }: { searchParams?: { next?: string } }) {
  return (
    <AuthShell portal="customer">
      <CustomerSignUp next={safeNext(searchParams?.next)} />
    </AuthShell>
  );
}
