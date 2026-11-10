import type { Metadata } from 'next';

import { PortalSignInPage, type SignInSearchParams } from '@/components/auth/portal-sign-in-page';

export const metadata: Metadata = {
  title: 'Host sign in',
  description: 'Sign in to your NexG host workspace.',
};

/** Hosts sign in here; customers use /sign-in. */
export default function HostSignInPage({ searchParams }: { searchParams?: SignInSearchParams }) {
  return <PortalSignInPage portal="host" searchParams={searchParams} />;
}
